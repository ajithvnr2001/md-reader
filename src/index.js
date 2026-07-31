/**
 * md-reader-r2 — Cloudflare Worker
 * ---------------------------------------------------------------
 * Serves a mobile-friendly Markdown reader UI and exposes a small
 * JSON API that:
 *   1. Lists .md files stored in an R2 bucket
 *   2. Streams the raw Markdown content of a chosen file
 *   3. Uses Workers AI to summarize / explain / quiz on that file
 *
 * Routes
 *   GET  /                      -> reader UI (index.html)
 *   GET  /style.css             -> stylesheet (day/night themes)
 *   GET  /app.js                -> frontend logic
 *   GET  /api/list              -> [{ key, size, uploaded }]
 *   GET  /api/file?key=...      -> raw markdown text (text/markdown)
 *   POST /api/ai/summarize      -> { key } -> { summary }
 *   POST /api/ai/explain        -> { key, selection } -> { explanation }
 *   POST /api/ai/quiz           -> { key } -> { quiz: [...] }
 *   PUT  /api/upload?key=...    -> (optional) upload a new .md file
 * ---------------------------------------------------------------
 */

import indexHtml from "../public/index.html.txt";
import styleCss from "../public/css/style.css.txt";
import appJs from "../public/js/app.js.txt";
import manifestJson from "../public/manifest.json.txt";
import swJs from "../public/sw.js.txt";
import iconSvg from "../public/icon.svg.txt";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Auth-Key",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...CORS_HEADERS },
  });
}

function assetResponse(body, contentType) {
  return new Response(body, {
    headers: {
      "content-type": contentType,
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      ...CORS_HEADERS,
    },
  });
}

function checkAuth(request, env) {
  if (env.REQUIRE_AUTH !== "true") return true;
  const key = request.headers.get("X-Auth-Key");
  return key && env.UPLOAD_SECRET && key === env.UPLOAD_SECRET;
}

async function listMarkdownFiles(env) {
  const options = { limit: 1000 };
  let listed = await env.MD_BUCKET.list(options);
  let objects = [...listed.objects];
  while (listed.truncated) {
    listed = await env.MD_BUCKET.list({ ...options, cursor: listed.cursor });
    objects.push(...listed.objects);
  }

  const files = objects
    .filter((o) => /\.(md|markdown)$/i.test(o.key) && !o.key.startsWith("trash/"))
    .map((o) => ({
      key: o.key,
      size: o.size,
      uploaded: o.uploaded,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));

  // Collect every folder prefix: dirs containing markdown files, plus explicit
  // empty-folder markers (objects ending in "/.keep"). Trash is excluded.
  const folderSet = new Set();
  for (const o of objects) {
    if (o.key.startsWith("trash/")) continue;
    if (o.key.endsWith("/.keep")) {
      folderSet.add(o.key.slice(0, -"/.keep".length));
    } else if (/\.(md|markdown)$/i.test(o.key)) {
      const parts = o.key.split("/").slice(0, -1);
      let acc = "";
      for (const p of parts) {
        acc = acc ? `${acc}/${p}` : p;
        folderSet.add(acc);
      }
    }
  }
  const folders = [...folderSet].sort();
  return { files, folders };
}

/* ---------------- Trash helpers ---------------- */
/** Move one object to trash/<ts>/<originalKey>. Returns the trash key. */
async function softDeleteKey(env, key, ts = Date.now()) {
  const obj = await env.MD_BUCKET.get(key);
  if (!obj) return null;
  const trashKey = `trash/${ts}/${key}`;
  const body = await obj.arrayBuffer();
  await env.MD_BUCKET.put(trashKey, body);
  await env.MD_BUCKET.delete(key);
  return trashKey;
}

/** Recover the original key from a trash key: trash/<digits>/<originalKey>. */
function trashKeyToOriginal(trashKey) {
  const m = trashKey.match(/^trash\/\d+\/(.+)$/);
  return m ? m[1] : null;
}

async function getMarkdownText(env, key) {
  const obj = await env.MD_BUCKET.get(key);
  if (!obj) return null;
  return await obj.text();
}

/** Trim long docs so we stay within the model's context window. */
const MAX_DOC_CHARS = 24000;
function truncateForModel(text, maxChars = MAX_DOC_CHARS) {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n\n[...truncated for AI processing...]";
}

async function runGemini(env, messages, systemInstruction = "", responseMimeType = "text/plain", responseSchema = null) {
  const apiKey = env.GEMINI_API_KEY || "";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`;
  
  const contents = messages.map(m => {
    let parts = [];
    if (m.parts) {
      parts = m.parts;
    } else {
      parts = [{ text: m.content || m.text || "" }];
    }
    return {
      role: m.role === "assistant" || m.role === "model" ? "model" : "user",
      parts
    };
  });

  const body = {
    contents,
    generationConfig: {}
  };

  if (systemInstruction) {
    body.systemInstruction = {
      parts: [{ text: systemInstruction }]
    };
  }

  if (responseMimeType) {
    body.generationConfig.responseMimeType = responseMimeType;
  }

  if (responseSchema) {
    body.generationConfig.responseSchema = responseSchema;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error: ${res.status} - ${errText}`);
  }

  const data = await res.json();
  if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
    return data.candidates[0].content.parts[0].text;
  }

  throw new Error(`Unexpected Gemini response: ${JSON.stringify(data)}`);
}

// Convert a Gemini-style schema (OBJECT/STRING/ARRAY/INTEGER) into a concrete JSON example string
// so Mercury knows the exact field names and structure to return.
function schemaToExample(schema) {
  if (!schema) return null;
  const t = (schema.type || "").toUpperCase();
  if (t === "STRING") return schema.description ? `"<${schema.description}>"` : '""';
  if (t === "INTEGER" || t === "NUMBER") return 0;
  if (t === "BOOLEAN") return false;
  if (t === "ARRAY") {
    if (schema.items) {
      const itemEx = schemaToExample(schema.items);
      return [itemEx];
    }
    return [];
  }
  if (t === "OBJECT") {
    const obj = {};
    if (schema.properties) {
      for (const [key, val] of Object.entries(schema.properties)) {
        obj[key] = schemaToExample(val);
      }
    }
    return obj;
  }
  return "";
}

// Normalize Mercury response field names to match what frontend expects.
// Mercury sometimes uses "response", "answer", "content", "text" instead of "reply".
function normalizeAiResponse(parsed) {
  if (!parsed || typeof parsed !== "object") return parsed;

  // Chat: reply
  if (!parsed.reply && (parsed.response || parsed.answer || parsed.content || parsed.text || parsed.explanation || parsed.message)) {
    parsed.reply = parsed.response || parsed.answer || parsed.content || parsed.text || parsed.explanation || parsed.message;
  }

  // Summarize: summary
  if (!parsed.summary && (parsed.response || parsed.answer || parsed.content || parsed.text)) {
    parsed.summary = parsed.response || parsed.answer || parsed.content || parsed.text;
  }

  // Quiz: quiz array
  if (!parsed.quiz && parsed.questions && Array.isArray(parsed.questions)) {
    parsed.quiz = parsed.questions;
  }

  // Flashcards: flashcards array
  if (!parsed.flashcards && parsed.cards && Array.isArray(parsed.cards)) {
    parsed.flashcards = parsed.cards;
  }

  // Glossary: terms array
  if (!parsed.terms && parsed.glossary && Array.isArray(parsed.glossary)) {
    parsed.terms = parsed.glossary;
  }

  // Translation: fullTranslation
  if (!parsed.fullTranslation && (parsed.translation || parsed.translated_text || parsed.translatedText)) {
    parsed.fullTranslation = parsed.translation || parsed.translated_text || parsed.translatedText;
  }

  // Podcast: dialogue array
  if (!parsed.dialogue && parsed.conversation && Array.isArray(parsed.conversation)) {
    parsed.dialogue = parsed.conversation;
  }

  // Ensure arrays default to empty
  if (!parsed.suggestedQuestions) parsed.suggestedQuestions = [];
  if (!parsed.keyConcepts) parsed.keyConcepts = [];

  return parsed;
}

function parseJsonResponse(rawText) {
  if (!rawText) {
    return { reply: "No response content generated.", summary: "No summary generated.", quiz: [], flashcards: [], terms: [], suggestedQuestions: [], keyConcepts: [] };
  }
  
  if (typeof rawText === "object") return normalizeAiResponse(rawText);

  // Direct parse
  try {
    return normalizeAiResponse(JSON.parse(rawText));
  } catch (e) {}

  // Strip markdown code fences ```json ... ``` or ``` ... ```
  let cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return normalizeAiResponse(JSON.parse(cleaned));
  } catch (e) {}

  // Extract content between first { and last } (or [ and ] for arrays)
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const jsonSubstring = cleaned.substring(firstBrace, lastBrace + 1);
    try {
      return normalizeAiResponse(JSON.parse(jsonSubstring));
    } catch (e) {}
  }
  const firstBracket = cleaned.indexOf("[");
  const lastBracket = cleaned.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    const jsonSubstring = cleaned.substring(firstBracket, lastBracket + 1);
    try {
      const arr = JSON.parse(jsonSubstring);
      return normalizeAiResponse({ items: arr });
    } catch (e) {}
  }

  // Fallback: wrap raw text into a clean valid response object
  return {
    reply: rawText,
    summary: rawText,
    explanation: rawText,
    fullTranslation: rawText,
    translatedTitle: "Translation",
    targetLanguage: "Target Language",
    keyTerms: [],
    suggestedQuestions: [],
    keyConcepts: []
  };
}

async function runMercury(env, messages, systemInstruction = "", responseMimeType = "text/plain", responseSchema = null) {
  const apiKey = env.INCEPTION_API_KEY;
  if (!apiKey) {
    throw new Error("Mercury 2 requires INCEPTION_API_KEY. Set it via: npx wrangler secret put INCEPTION_API_KEY (never hardcode keys in source).");
  }
  const url = "https://api.inceptionlabs.ai/v1/chat/completions";

  const formattedMessages = [];
  
  let fullSystemPrompt = systemInstruction || "";
  if (responseMimeType === "application/json" && responseSchema) {
    const example = schemaToExample(responseSchema);
    const exampleStr = JSON.stringify(example, null, 2);
    fullSystemPrompt += `\n\nYou MUST respond with valid JSON matching this EXACT structure (use these exact field names):\n${exampleStr}\n\nDo NOT use alternative field names. Do NOT wrap in markdown code fences. Output raw JSON only.`;
  } else if (responseMimeType === "application/json") {
    fullSystemPrompt += "\n\nRespond strictly with valid JSON only. Do not wrap in markdown or add extra text.";
  }

  if (fullSystemPrompt.trim()) {
    formattedMessages.push({ role: "system", content: fullSystemPrompt });
  }

  messages.forEach(m => {
    let text = "";
    if (m.parts && m.parts[0]) {
      text = m.parts[0].text;
    } else if (typeof m.content === "string") {
      text = m.content;
    } else if (typeof m.text === "string") {
      text = m.text;
    }

    const role = (m.role === "assistant" || m.role === "model") ? "assistant" : "user";
    if (text) {
      formattedMessages.push({ role, content: text });
    }
  });

  const body = {
    model: "mercury-2",
    messages: formattedMessages,
    reasoning_effort: "instant"
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Inception API (Mercury 2) error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  if (data.choices && data.choices[0] && data.choices[0].message) {
    let rawText = data.choices[0].message.content || "";
    return rawText;
  }

  throw new Error(`Unexpected Inception API response: ${JSON.stringify(data)}`);
}

async function runAI(env, { model = "gemini-3.5-flash-lite", messages, systemInstruction = "", responseMimeType = "text/plain", responseSchema = null }) {
  if (model && (model.includes("mercury") || model.includes("inception"))) {
    return await runMercury(env, messages, systemInstruction, responseMimeType, responseSchema);
  }
  return await runGemini(env, messages, systemInstruction, responseMimeType, responseSchema);
}

const summarizeSchema = {
  type: "OBJECT",
  properties: {
    summary: {
      type: "STRING",
      description: "A bulleted summary of the document context."
    },
    keyConcepts: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "Core concepts discussed in this document."
    }
  },
  required: ["summary", "keyConcepts"]
};

const quizSchema = {
  type: "OBJECT",
  properties: {
    quiz: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          question: { type: "STRING" },
          options: {
            type: "ARRAY",
            items: { type: "STRING" }
          },
          answerIndex: { type: "INTEGER" }
        },
        required: ["question", "options", "answerIndex"]
      }
    }
  },
  required: ["quiz"]
};

const chatSchema = {
  type: "OBJECT",
  properties: {
    reply: {
      type: "STRING",
      description: "The answer or explanation to the user's message, in clean Markdown format."
    },
    suggestedQuestions: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "Exactly 2 or 3 logical follow-up questions the user might want to click next."
    },
    keyConcepts: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "Key concepts or terms mentioned in this answer."
    }
  },
  required: ["reply", "suggestedQuestions", "keyConcepts"]
};

const cheatsheetSchema = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    keyDefinitions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          term: { type: "STRING" },
          definition: { type: "STRING" }
        },
        required: ["term", "definition"]
      }
    },
    formulasAndSyntax: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          concept: { type: "STRING" },
          codeOrFormula: { type: "STRING" },
          explanation: { type: "STRING" }
        },
        required: ["concept", "codeOrFormula", "explanation"]
      }
    },
    coreRulesAndTips: {
      type: "ARRAY",
      items: { type: "STRING" }
    }
  },
  required: ["title", "keyDefinitions", "formulasAndSyntax", "coreRulesAndTips"]
};

const glossarySchema = {
  type: "OBJECT",
  properties: {
    terms: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          term: { type: "STRING", description: "The canonical term as it appears in the document." },
          definition: { type: "STRING", description: "A clear 1-2 sentence definition in simple English." },
          aliases: {
            type: "ARRAY",
            items: { type: "STRING" },
            description: "Up to 2 alternative spellings/abbreviations used in the document (e.g. K8s for Kubernetes). Empty array if none."
          },
          category: {
            type: "STRING",
            description: "Exactly ONE of: acronym, concept, protocol, tool, person, method, formula, other."
          },
          importance: {
            type: "INTEGER",
            description: "Learning importance for exams: 3 = essential must-know, 2 = important, 1 = nice-to-know."
          }
        },
        required: ["term", "definition", "aliases", "category", "importance"]
      }
    }
  },
  required: ["terms"]
};

const flashcardsSchema = {
  type: "OBJECT",
  properties: {
    flashcards: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          question: { type: "STRING", description: "The term or question on the front of the card." },
          answer: { type: "STRING", description: "A clear, short definition or answer on the back of the card." }
        },
        required: ["question", "answer"]
      }
    }
  },
  required: ["flashcards"]
};

const translateSchema = {
  type: "OBJECT",
  properties: {
    targetLanguage: { type: "STRING", description: "Target language name" },
    translatedTitle: { type: "STRING", description: "Meaningful title in target language" },
    fullTranslation: { type: "STRING", description: "Complete, full document translation preserving all headings, lists, math formulas, and code blocks in clean Markdown format." },
    keyTerms: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          originalTerm: { type: "STRING" },
          translatedTerm: { type: "STRING" },
          contextNote: { type: "STRING", description: "Why this term is translated this way in simple natural context" }
        },
        required: ["originalTerm", "translatedTerm", "contextNote"]
      }
    }
  },
  required: ["targetLanguage", "translatedTitle", "fullTranslation", "keyTerms"]
};

const podcastSchema = {
  type: "OBJECT",
  properties: {
    podcastTitle: { type: "STRING", description: "Catchy title for this 2-host podcast episode in target language" },
    language: { type: "STRING", description: "Language of the dialogue" },
    dialogue: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          speaker: { type: "STRING", description: "Either 'Alex' or 'Dr. Sam'" },
          text: { type: "STRING", description: "Spoken line in natural language" }
        },
        required: ["speaker", "text"]
      }
    }
  },
  required: ["podcastTitle", "language", "dialogue"]
};

/** Wrap raw 16-bit little-endian mono PCM bytes in a proper RIFF/WAVE header. */
function pcmToWav(pcm, sampleRate = 24000, numChannels = 1, bitsPerSample = 16) {
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcm.length;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // audio format = PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  new Uint8Array(buffer, 44).set(pcm);
  return buffer;
}

/**
 * Gemini multi-speaker TTS via the generateContent API.
 * Returns base64-encoded raw PCM (24kHz, mono, 16-bit) or null on failure.
 * One automatic retry — the model occasionally returns text tokens causing a 500.
 */
async function runGeminiTTS(env, prompt) {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("Gemini TTS skipped: GEMINI_API_KEY not configured");
    return null;
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:generateContent?key=${apiKey}`;

  const body = {
    model: "gemini-3.1-flash-tts-preview",
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        multiSpeakerVoiceConfig: {
          speakerVoiceConfigs: [
            { speaker: "Alex", voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } } },
            { speaker: "Dr. Sam", voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } }
          ]
        }
      }
    }
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        console.warn(`Gemini TTS attempt ${attempt + 1} failed, status:`, res.status);
        continue;
      }

      const data = await res.json();
      const audioData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (audioData) return audioData;
      console.warn("Gemini TTS attempt", attempt + 1, "returned no audio data");
    } catch (err) {
      console.warn("Gemini TTS fetch error:", err.message);
    }
  }
  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // ---- Static frontend ----
    if (pathname === "/" || pathname === "/index.html") {
      return assetResponse(indexHtml, "text/html; charset=utf-8");
    }
    if (pathname === "/style.css") {
      return assetResponse(styleCss, "text/css; charset=utf-8");
    }
    if (pathname === "/app.js") {
      return assetResponse(appJs, "application/javascript; charset=utf-8");
    }
    if (pathname === "/manifest.json") {
      return assetResponse(manifestJson, "application/json; charset=utf-8");
    }
    if (pathname === "/sw.js") {
      return assetResponse(swJs, "application/javascript; charset=utf-8");
    }
    if (pathname === "/icon.svg") {
      return assetResponse(iconSvg, "image/svg+xml; charset=utf-8");
    }

    // ---- API: sync AI cache (write protected like other mutations) ----
    if (pathname === "/api/ai/cache") {
      if (!checkAuth(request, env)) return json({ error: "Unauthorized" }, 401);
      if (request.method === "GET") {
        try {
          const obj = await env.MD_BUCKET.get(".ai_cache.json");
          if (!obj) return json({});
          const text = await obj.text();
          return new Response(text, {
            headers: { "content-type": "application/json; charset=utf-8", ...CORS_HEADERS }
          });
        } catch (err) {
          return json({ error: err.message }, 500);
        }
      }
      if (request.method === "POST") {
        try {
          const body = await request.text();
          // Basic sanity: must start with { and stay under a sane size cap
          if (!body.startsWith("{") || body.length > 5 * 1024 * 1024) {
            return json({ error: "Invalid cache payload" }, 400);
          }
          await env.MD_BUCKET.put(".ai_cache.json", body, {
            httpMetadata: { contentType: "application/json; charset=utf-8" }
          });
          return json({ ok: true });
        } catch (err) {
          return json({ error: err.message }, 500);
        }
      }
    }

    // ---- API: list files ----
    if (pathname === "/api/list" && request.method === "GET") {
      try {
        const { files, folders } = await listMarkdownFiles(env);
        return json({ files, folders });
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    // ---- API: get raw markdown (markdown files only) ----
    if (pathname === "/api/file" && request.method === "GET") {
      const key = url.searchParams.get("key");
      if (!key) return json({ error: "Missing ?key=" }, 400);
      if (!/\.(md|markdown)$/i.test(key)) {
        return json({ error: "Only .md / .markdown files can be read with this endpoint" }, 400);
      }
      const text = await getMarkdownText(env, key);
      if (text === null) return json({ error: "File not found" }, 404);
      return new Response(text, {
        headers: { "content-type": "text/markdown; charset=utf-8", ...CORS_HEADERS },
      });
    }

    // ---- API: upload (optional, protected) ----
    if (pathname === "/api/upload" && request.method === "PUT") {
      if (!checkAuth(request, env)) return json({ error: "Unauthorized" }, 401);
      const key = url.searchParams.get("key");
      if (!key || !/\.(md|markdown)$/i.test(key)) {
        return json({ error: "Provide ?key=name.md" }, 400);
      }
      if (key.includes("..")) return json({ error: "Invalid key" }, 400);

      // Uploads can opt out of silent overwrite (editor saves intentionally overwrite)
      if (url.searchParams.get("overwrite") === "false") {
        const existing = await env.MD_BUCKET.head(key);
        if (existing) return json({ error: `"${key}" already exists.`, conflict: true }, 409);
      }

      await env.MD_BUCKET.put(key, request.body);
      return json({ ok: true, key });
    }

    // ---- API: create an (empty) folder, protected ----
    if (pathname === "/api/folder" && request.method === "POST") {
      if (!checkAuth(request, env)) return json({ error: "Unauthorized" }, 401);
      try {
        const { path } = await request.json();
        const cleanPath = (path || "").trim().replace(/^\/+|\/+$/g, "");
        if (!cleanPath || cleanPath.includes("..") || /[\x00-\x1f]/.test(cleanPath)) {
          return json({ error: "Invalid folder path" }, 400);
        }
        const keepKey = `${cleanPath}/.keep`;
        const existing = await env.MD_BUCKET.head(keepKey);
        if (existing) return json({ ok: true, path: cleanPath, alreadyExists: true });
        await env.MD_BUCKET.put(keepKey, "", { httpMetadata: { contentType: "text/plain" } });
        return json({ ok: true, path: cleanPath });
      } catch (e) {
        return json({ error: e.message }, 500);
      }
    }

    // ---- API: rename a folder (move all contents), protected ----
    if (pathname === "/api/folder/rename" && request.method === "POST") {
      if (!checkAuth(request, env)) return json({ error: "Unauthorized" }, 401);
      try {
        const { oldPrefix, newPrefix } = await request.json();
        const oldP = (oldPrefix || "").trim().replace(/^\/+|\/+$/g, "");
        const newP = (newPrefix || "").trim().replace(/^\/+|\/+$/g, "");
        if (!oldP || !newP) return json({ error: "Missing oldPrefix or newPrefix" }, 400);
        if (oldP.includes("..") || newP.includes("..")) return json({ error: "Invalid path" }, 400);
        if (oldP === newP) return json({ ok: true, newPrefix: newP });
        if (newP === oldP || newP.startsWith(oldP + "/")) {
          return json({ error: "Cannot move a folder inside itself" }, 400);
        }

        // Refuse to merge into a non-empty destination
        const targetList = await env.MD_BUCKET.list({ prefix: `${newP}/`, limit: 1 });
        if (targetList.objects.length > 0) {
          return json({ error: `Folder "${newP}" already exists and is not empty.` }, 409);
        }

        // Move every object under oldP (paginated)
        let moved = 0;
        let listed = await env.MD_BUCKET.list({ prefix: `${oldP}/` });
        if (listed.objects.length === 0) return json({ error: "Source folder not found" }, 404);
        while (true) {
          for (const obj of listed.objects) {
            const newKey = `${newP}/${obj.key.slice(oldP.length + 1)}`;
            const body = await (await env.MD_BUCKET.get(obj.key)).arrayBuffer();
            await env.MD_BUCKET.put(newKey, body);
            await env.MD_BUCKET.delete(obj.key);
            moved++;
          }
          if (!listed.truncated) break;
          listed = await env.MD_BUCKET.list({ prefix: `${oldP}/`, cursor: listed.cursor });
        }
        return json({ ok: true, newPrefix: newP, movedCount: moved });
      } catch (e) {
        return json({ error: e.message }, 500);
      }
    }

    // ---- API: delete file — soft-delete to trash/ by default (protected) ----
    if (pathname === "/api/file" && request.method === "DELETE") {
      if (!checkAuth(request, env)) return json({ error: "Unauthorized" }, 401);
      const key = url.searchParams.get("key");
      if (!key) return json({ error: "Missing ?key=" }, 400);

      if (url.searchParams.get("permanent") === "true") {
        // Hard delete (used from the Trash view)
        await env.MD_BUCKET.delete(key);
        return json({ ok: true, permanent: true });
      }

      const trashKey = await softDeleteKey(env, key);
      if (!trashKey) return json({ error: "File not found" }, 404);
      return json({ ok: true, trashKey });
    }

    // ---- API: delete folder — soft-deletes contents to trash/ (protected) ----
    if (pathname === "/api/folder" && request.method === "DELETE") {
      if (!checkAuth(request, env)) return json({ error: "Unauthorized" }, 401);
      const prefix = url.searchParams.get("prefix");
      if (!prefix) return json({ error: "Missing ?prefix=" }, 400);

      if (url.searchParams.get("permanent") === "true") {
        const cleanPrefixDel = prefix.endsWith('/') ? prefix : `${prefix}/`;
        let listedDel = await env.MD_BUCKET.list({ prefix: cleanPrefixDel });
        let deleted = [];
        while (true) {
          for (const obj of listedDel.objects) {
            await env.MD_BUCKET.delete(obj.key);
            deleted.push(obj.key);
          }
          if (!listedDel.truncated) break;
          listedDel = await env.MD_BUCKET.list({ prefix: cleanPrefixDel, cursor: listedDel.cursor });
        }
        return json({ ok: true, deletedCount: deleted.length, keys: deleted, permanent: true });
      }

      const cleanPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`;
      const ts = Date.now();
      let listed = await env.MD_BUCKET.list({ prefix: cleanPrefix });
      let deletedKeys = [];
      while (true) {
        for (const obj of listed.objects) {
          const trashKey = await softDeleteKey(env, obj.key, ts);
          if (trashKey) deletedKeys.push(trashKey);
        }
        if (!listed.truncated) break;
        listed = await env.MD_BUCKET.list({ prefix: cleanPrefix, cursor: listed.cursor });
      }

      return json({ ok: true, deletedCount: deletedKeys.length, keys: deletedKeys });
    }

    // ---- API: list trash contents (protected) ----
    if (pathname === "/api/trash" && request.method === "GET") {
      if (!checkAuth(request, env)) return json({ error: "Unauthorized" }, 401);
      try {
        let listed = await env.MD_BUCKET.list({ prefix: "trash/" });
        let objects = [...listed.objects];
        while (listed.truncated) {
          listed = await env.MD_BUCKET.list({ prefix: "trash/", cursor: listed.cursor });
          objects.push(...listed.objects);
        }
        const items = objects
          .map((o) => ({
            trashKey: o.key,
            originalKey: trashKeyToOriginal(o.key),
            size: o.size,
            uploaded: o.uploaded,
          }))
          .filter((i) => i.originalKey)
          .sort((a, b) => a.trashKey.localeCompare(b.trashKey));
        return json({ items });
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    // ---- API: restore a trashed item (protected) ----
    if (pathname === "/api/trash/restore" && request.method === "POST") {
      if (!checkAuth(request, env)) return json({ error: "Unauthorized" }, 401);
      try {
        const { trashKey } = await request.json();
        if (!trashKey || !trashKey.startsWith("trash/")) return json({ error: "Invalid trashKey" }, 400);
        const original = trashKeyToOriginal(trashKey);
        if (!original) return json({ error: "Cannot determine original path" }, 400);

        const existing = await env.MD_BUCKET.head(original);
        if (existing) return json({ error: `"${original}" already exists — restore would overwrite it.` }, 409);

        const obj = await env.MD_BUCKET.get(trashKey);
        if (!obj) return json({ error: "Trash item not found" }, 404);
        const body = await obj.arrayBuffer();
        await env.MD_BUCKET.put(original, body);
        await env.MD_BUCKET.delete(trashKey);
        return json({ ok: true, key: original });
      } catch (e) {
        return json({ error: e.message }, 500);
      }
    }

    // ---- API: permanently empty the trash (protected) ----
    if (pathname === "/api/trash/empty" && request.method === "POST") {
      if (!checkAuth(request, env)) return json({ error: "Unauthorized" }, 401);
      let listed = await env.MD_BUCKET.list({ prefix: "trash/" });
      let deleted = 0;
      while (true) {
        for (const obj of listed.objects) {
          await env.MD_BUCKET.delete(obj.key);
          deleted++;
        }
        if (!listed.truncated) break;
        listed = await env.MD_BUCKET.list({ prefix: "trash/", cursor: listed.cursor });
      }
      return json({ ok: true, deletedCount: deleted });
    }

    // ---- API: quick capture — append a thought to today's inbox note (protected) ----
    if (pathname === "/api/inbox/append" && request.method === "POST") {
      if (!checkAuth(request, env)) return json({ error: "Unauthorized" }, 401);
      try {
        const { content } = await request.json();
        const text = (content || "").trim();
        if (!text) return json({ error: "Empty content" }, 400);

        const now = new Date();
        const dateStr = now.toISOString().split("T")[0];
        const timeStr = now.toTimeString().slice(0, 5);
        const key = `Inbox/${dateStr}.md`;

        let existing = null;
        const obj = await env.MD_BUCKET.get(key);
        if (obj) existing = await obj.text();

        const entry = `\n\n## ${timeStr}\n\n${text}\n`;
        const updated = existing !== null
          ? existing.replace(/\s*$/, "") + entry
          : `# 📥 Inbox — ${dateStr}\n${entry}`;

        await env.MD_BUCKET.put(key, updated, { httpMetadata: { contentType: "text/markdown; charset=utf-8" } });
        return json({ ok: true, key });
      } catch (e) {
        return json({ error: e.message }, 500);
      }
    }

    // ---- API: rename file (protected) ----
    if (pathname === "/api/rename" && request.method === "POST") {
      if (!checkAuth(request, env)) return json({ error: "Unauthorized" }, 401);
      try {
        const { oldKey, newName } = await request.json();
        if (!oldKey || !newName) return json({ error: "Missing oldKey or newName" }, 400);
        
        // Construct new key: keep the folder path, swap the filename
        const parts = oldKey.split('/');
        parts.pop(); // remove old name
        const newNameClean = /\.(md|markdown)$/i.test(newName) ? newName : `${newName}.md`;
        parts.push(newNameClean);
        const newKey = parts.join('/');

        if (oldKey === newKey) return json({ ok: true, newKey });

        const oldObj = await env.MD_BUCKET.get(oldKey);
        if (!oldObj) return json({ error: "Original file not found" }, 404);

        // Refuse to overwrite an existing file
        const existing = await env.MD_BUCKET.head(newKey);
        if (existing) return json({ error: `A file named "${newKey}" already exists.` }, 409);

        const body = await oldObj.arrayBuffer();
        await env.MD_BUCKET.put(newKey, body);
        await env.MD_BUCKET.delete(oldKey);

        return json({ ok: true, newKey });
      } catch (e) {
        return json({ error: e.message }, 500);
      }
    }

    // ---- API: move file (protected) ----
    if (pathname === "/api/move" && request.method === "POST") {
      if (!checkAuth(request, env)) return json({ error: "Unauthorized" }, 401);
      try {
        const { oldKey, newFolder } = await request.json();
        if (!oldKey || newFolder === undefined) return json({ error: "Missing oldKey or newFolder" }, 400);
        
        const filename = oldKey.split('/').pop();
        const cleanFolder = newFolder.trim().replace(/^\/+|\/+$/g, '');
        const newKey = cleanFolder ? `${cleanFolder}/${filename}` : filename;

        if (oldKey === newKey) return json({ ok: true, newKey });

        const oldObj = await env.MD_BUCKET.get(oldKey);
        if (!oldObj) return json({ error: "Original file not found" }, 404);

        // Refuse to overwrite an existing file
        const existing = await env.MD_BUCKET.head(newKey);
        if (existing) return json({ error: `A file already exists at "${newKey}".` }, 409);

        const body = await oldObj.arrayBuffer();
        await env.MD_BUCKET.put(newKey, body);
        await env.MD_BUCKET.delete(oldKey);

        return json({ ok: true, newKey });
      } catch (e) {
        return json({ error: e.message }, 500);
      }
    }

    // ---- API: AI — summarize ----
    if (pathname === "/api/ai/summarize" && request.method === "POST") {
      try {
        const { key, model } = await request.json();
        const text = await getMarkdownText(env, key);
        if (text === null) return json({ error: "File not found" }, 404);
        
        const systemInstruction = "You are a helpful study assistant. Summarize the given document in clean bullet points.";
        const messages = [{ role: "user", content: `Please summarize this document:\n\n${truncateForModel(text)}` }];
        
        const responseText = await runAI(env, { model, messages, systemInstruction, responseMimeType: "application/json", responseSchema: summarizeSchema });
        return json(parseJsonResponse(responseText));
      } catch (err) {
        console.error("Summarize error:", err);
        return json({ error: err.message || "AI summarize failed" }, 500);
      }
    }

    // ---- API: AI — explain selection ----
    if (pathname === "/api/ai/explain" && request.method === "POST") {
      try {
        const { key, selection, model } = await request.json();
        const text = await getMarkdownText(env, key);
        if (text === null) return json({ error: "File not found" }, 404);
        
        const systemInstruction = `You are a helpful study tutor. When explaining systems, architectures, comparisons, or sequences, always construct a clean, valid Mermaid.js flowchart or graph inside a fenced markdown block (using \`\`\`mermaid) to help the user visualize the explanation. Keep your reply simple and easy to understand. Below is the Markdown document context:
${truncateForModel(text)}`;
        const prompt = selection && selection.trim().length > 0
          ? `Explain this specific selection in simple terms: "${selection}"`
          : `Explain the key concepts of this document in simple terms.`;
          
        const messages = [{ role: "user", content: prompt }];
        const responseText = await runAI(env, { model, messages, systemInstruction, responseMimeType: "application/json", responseSchema: chatSchema });
        return json(parseJsonResponse(responseText));
      } catch (err) {
        console.error("Explain error:", err);
        return json({ error: err.message || "AI explain failed" }, 500);
      }
    }

    // ---- API: AI — quiz ----
    if (pathname === "/api/ai/quiz" && request.method === "POST") {
      try {
        const { key, model } = await request.json();
        const text = await getMarkdownText(env, key);
        if (text === null) return json({ error: "File not found" }, 404);
        
        const systemInstruction = "You generate short study quizzes based on the document. Generate exactly 5 multiple-choice questions.";
        const messages = [{ role: "user", content: `Please generate a quiz for this document:\n\n${truncateForModel(text)}` }];
        
        const responseText = await runAI(env, { model, messages, systemInstruction, responseMimeType: "application/json", responseSchema: quizSchema });
        return json(parseJsonResponse(responseText));
      } catch (err) {
        console.error("Quiz error:", err);
        return json({ error: err.message || "AI quiz failed" }, 500);
      }
    }

    // ---- API: AI — chat ----
    if (pathname === "/api/ai/chat" && request.method === "POST") {
      try {
        const { key, messages, model } = await request.json();
        let systemInstruction = "";
        
        if (key) {
          const text = await getMarkdownText(env, key);
          if (text === null) return json({ error: "File not found" }, 404);
          
          systemInstruction = `You are a helpful study tutor. Below is the Markdown document context for this chat session:

--- START OF DOCUMENT ---
${truncateForModel(text)}
--- END OF DOCUMENT ---

Help the user study, explain concepts, answer questions, and tutor them on this document.
When explaining systems, architectures, comparisons, or sequences, construct a clean, valid Mermaid.js flowchart or graph inside a fenced markdown block (using \`\`\`mermaid) to help the user visualize the explanation.
Always return your response structured according to the requested JSON schema.`;
        } else {
          systemInstruction = `You are a helpful, friendly, and knowledgeable AI assistant.
Answer the user's questions in detail, formatting your response with clean Markdown.
When explaining systems, architectures, comparisons, or sequences, construct a clean, valid Mermaid.js flowchart or graph inside a fenced markdown block (using \`\`\`mermaid) to help the user visualize the explanation.
Always return your response structured according to the requested JSON schema.`;
        }

        const responseText = await runAI(env, { model, messages, systemInstruction, responseMimeType: "application/json", responseSchema: chatSchema });
        return json(parseJsonResponse(responseText));
      } catch (err) {
        console.error("Chat error:", err);
        return json({ error: err.message || "AI chat failed" }, 500);
      }
    }

    // ---- API: AI — flashcards ----
    if (pathname === "/api/ai/flashcards" && request.method === "POST") {
      try {
        const { key, model } = await request.json();
        const text = await getMarkdownText(env, key);
        if (text === null) return json({ error: "File not found" }, 404);
        
        const systemInstruction = "You generate high-quality study flashcards based on the document context. Generate exactly 5 to 8 cards containing a term or question on the front, and a clear, short definition or answer on the back.";
        const messages = [{ role: "user", content: `Please generate flashcards for this document:\n\n${truncateForModel(text)}` }];
        
        const responseText = await runAI(env, { model, messages, systemInstruction, responseMimeType: "application/json", responseSchema: flashcardsSchema });
        return json(parseJsonResponse(responseText));
      } catch (err) {
        console.error("Flashcards error:", err);
        return json({ error: err.message || "AI flashcards failed" }, 500);
      }
    }

    // ---- API: AI — cheatsheet ----
    if (pathname === "/api/ai/cheatsheet" && request.method === "POST") {
      try {
        const { key, model } = await request.json();
        const text = await getMarkdownText(env, key);
        if (text === null) return json({ error: "File not found" }, 404);
        
        const systemInstruction = "You extract and compress all key definitions, code syntax, formulas, commands, and core rules into a highly dense, 1-page print-ready exam cheat sheet.";
        const messages = [{ role: "user", content: `Please create a 1-page exam cheat sheet for this document:\n\n${truncateForModel(text)}` }];
        
        const responseText = await runAI(env, { model, messages, systemInstruction, responseMimeType: "application/json", responseSchema: cheatsheetSchema });
        return json(parseJsonResponse(responseText));
      } catch (err) {
        console.error("Cheatsheet error:", err);
        return json({ error: err.message || "AI cheatsheet failed" }, 500);
      }
    }

    // ---- API: AI — paragraph comment thread ----
    if (pathname === "/api/ai/comment" && request.method === "POST") {
      try {
        const { key, paragraphText, commentText, threadHistory, model } = await request.json();
        let docContext = "";
        if (key) {
          const text = await getMarkdownText(env, key);
          if (text) docContext = `Document Context:\n${truncateForModel(text, 6000)}\n\n`;
        }
        
        const systemInstruction = `You are a helpful AI study assistant. The user has left a comment or question on a specific paragraph in a study document.
Answer their comment, debate their point, or clarify the paragraph in detail using clean Markdown.
${docContext}Target Paragraph:
"${paragraphText || ''}"`;

        const messages = threadHistory && threadHistory.length > 0
          ? threadHistory
          : [{ role: "user", content: commentText || "Please explain this paragraph." }];

        const responseText = await runAI(env, { model, messages, systemInstruction, responseMimeType: "application/json", responseSchema: chatSchema });
        return json(parseJsonResponse(responseText));
      } catch (err) {
        console.error("Comment error:", err);
        return json({ error: err.message || "AI comment failed" }, 500);
      }
    }

    // ---- API: AI — auto glossary (rich terms, optional bilingual definitions) ----
    if (pathname === "/api/ai/glossary" && request.method === "POST") {
      try {
        const { key, model, language } = await request.json();
        const text = await getMarkdownText(env, key);
        if (text === null) return json({ error: "File not found" }, 404);

        const wantsLocal = typeof language === "string" && language.trim() && language.trim().toLowerCase() !== "english";
        const localLanguage = wantsLocal ? language.trim() : null;

        const schema = JSON.parse(JSON.stringify(glossarySchema));
        if (localLanguage) {
          schema.properties.terms.items.properties.definitionLocal = {
            type: "STRING",
            description: `The same definition written in natural, modern everyday ${localLanguage}.`
          };
          schema.properties.terms.items.required.push("definitionLocal");
        }

        const messages = [{ role: "user", content: `Please extract key glossary terms for this document:\n\n${truncateForModel(text)}` }];

        // Mercury's "instant" mode can sporadically return empty terms for the
        // schema-example prompt — retry once with a simplified instruction.
        const fieldList = `For each term, provide: term, definition, aliases (array, up to 2), category (exactly ONE of acronym|concept|protocol|tool|person|method|formula|other), and importance (integer 1, 2, or 3; 3 = most essential)${localLanguage ? `, and definitionLocal (the same definition in natural, modern everyday ${localLanguage})` : ''}.`;

        let parsed = null;
        const attempts = (model && (model.includes("mercury") || model.includes("inception")))
          ? [
            { schema, instruction: `You detect and extract 8 to 15 key technical terms, acronyms, and specialized jargon from the document. ${fieldList}` },
            { schema: null, instruction: `You detect and exactly 8 to 15 glossary terms as a JSON object with a single "terms" array. ${fieldList}` }
          ]
          : [{ schema, instruction: `You detect and extract 8 to 15 key technical terms, acronyms, and specialized jargon from the document. ${fieldList}` }];

        for (const attempt of attempts) {
          const responseText = await runAI(env, { model, messages, systemInstruction: attempt.instruction, responseMimeType: "application/json", responseSchema: attempt.schema });
          parsed = parseJsonResponse(responseText);
          if (parsed && Array.isArray(parsed.terms) && parsed.terms.length > 0) break;
        }
        // Defensive normalization: fill defaults & clamp importance to 1-3
        parsed.terms = (Array.isArray(parsed.terms) ? parsed.terms : []).map(t => ({
          term: String(t.term || "").trim(),
          definition: t.definition || "",
          aliases: Array.isArray(t.aliases) ? t.aliases.filter(Boolean).slice(0, 2) : [],
          category: typeof t.category === "string" ? t.category : "other",
          importance: (t.importance >= 1 && t.importance <= 3) ? Math.round(t.importance) : 2,
          ...(t.definitionLocal ? { definitionLocal: t.definitionLocal } : {})
        })).filter(t => t.term);
        return json(parsed);
      } catch (err) {
        console.error("Glossary error:", err);
        return json({ error: err.message || "AI glossary failed" }, 500);
      }
    }

    // ---- API: AI — context-aware full document translation ----
    if (pathname === "/api/ai/translate" && request.method === "POST") {
      try {
        const { key, targetLanguage = "Tamil", model } = await request.json();
        const text = await getMarkdownText(env, key);
        if (text === null) return json({ error: "File not found" }, 404);

        const systemInstruction = `You are a master technical translator specializing in natural, modern, human-friendly translations.

CRITICAL TRANSLATION GUIDELINES FOR ${targetLanguage}:
1. FULL DOCUMENT TRANSLATION: Translate the ENTIRE document thoroughly from start to finish. Do NOT shorten, truncate, or summarize it into a brief recap. Translate all paragraphs, bullet points, sections, and explanations fully.
2. NATURAL & MODERN LANGUAGE (NO ARCHAIC/PURE TEXTBOOK PHRASING):
   - For TAMIL: Use simple, natural, modern everyday Tamil (எளிய தற்கால தமிழ் / இயல்பான எளிய பேச்சு நடை). ABSOLUTELY DO NOT USE ancient, formal, or archaic Senthamizh (செந்தமிழ்) words like 'தரவுத்தளம்' or 'மின்அஞ்சல்' that everyday students and tech professionals never speak. Keep technical terms like Database, API, Cloud, Server, Code, Worker in English or natural modern Tamil transliteration (e.g. டேட்டாபேஸ் / API / கிளவுட்) so it reads completely naturally and effortlessly.
   - For INDIAN & REGIONAL LANGUAGES (Hindi, Tamil, Telugu, Malayalam, Kannada, Bengali, Marathi, Gujarati, Punjabi): Use natural, conversational, crystal-clear modern phrasing used in daily educational discussions. Avoid obscure textbook jargon.
3. PRESERVE MARKDOWN & CODE: Keep all Markdown headers (#, ##), bold text (**), bullet lists, LaTeX math formulas ($...$), and code blocks (\`\`\`...\`\`\`) completely intact and untouched.`;

        const messages = [{ role: "user", content: `Please translate the full document below into natural, easy-to-understand modern ${targetLanguage}:\n\n${truncateForModel(text)}` }];

        const responseText = await runAI(env, { model, messages, systemInstruction, responseMimeType: "application/json", responseSchema: translateSchema });
        return json(parseJsonResponse(responseText));
      } catch (err) {
        console.error("Translation error:", err);
        return json({ error: err.message || "AI translation failed" }, 500);
      }
    }

    // ---- API: Serve saved podcast audio from R2 (podcasts/ prefix only) ----
    if (pathname === "/api/podcast/audio" && request.method === "GET") {
      const audioKey = url.searchParams.get("key");
      if (!audioKey) return json({ error: "Missing audio key" }, 400);
      if (!/^podcasts\/[a-zA-Z0-9_\.\-\/]+\.wav$/.test(audioKey)) {
        return json({ error: "Invalid audio key" }, 400);
      }

      const obj = await env.MD_BUCKET.get(audioKey);
      if (!obj) return json({ error: "Audio not found" }, 404);

      return new Response(obj.body, {
        headers: {
          "content-type": "audio/wav",
          "Cache-Control": "public, max-age=31536000, immutable",
          ...CORS_HEADERS
        }
      });
    }

    // ---- API: Gemini — 2-Host Audio Podcast Generator ----
    if (pathname === "/api/ai/podcast/generate" && request.method === "POST") {
      try {
        const { key, language = "Tamil", model } = await request.json();
        const text = await getMarkdownText(env, key);
        if (text === null) return json({ error: "File not found" }, 404);

        const systemInstruction = `You are an expert audio producer creating a NotebookLM-style 2-Host Study Podcast Episode.

HOST ROLES:
1. Alex (Host 🎙️): Enthusiastic, curious student host. Asks intuitive questions starting from the fundamental basic concepts up to advanced topic nuances.
2. Dr. Sam (Expert 🧠): Warm, knowledgeable expert mentor. Explains concepts with clarity, simple everyday analogies, and clear technical insights.

LANGUAGE & TONE RULES FOR ${language}:
- Thorough Coverage: Analyze and discuss the WHOLE document from beginning to end. Cover basic fundamentals first, then progress through all core sections and key takeaways.
- Natural Everyday Spoken Language:
  * For TAMIL: Use simple, modern everyday Tamil (எளிய தற்கால பேச்சுத்தமிழ் / இயல்பான உரைநடை). DO NOT use obsolete, ancient Senthamizh words. Keep terms like Database, API, Server, Code, Cloud in English or common modern Tamil transliteration.
  * For INDIAN & REGIONAL LANGUAGES (Hindi, Tamil, Telugu, Malayalam, Kannada, Bengali, Marathi, Gujarati, Punjabi): Phrased naturally as modern students and tech mentors actually speak.

Generate 6 to 12 dialogue turns covering the document thoroughly.`;

        const messages = [{ role: "user", content: `Please create a 2-host audio podcast dialogue script in natural modern ${language} for the following complete document:\n\n${truncateForModel(text)}` }];

        const responseText = await runAI(env, { model, messages, systemInstruction, responseMimeType: "application/json", responseSchema: podcastSchema });
        const podcastData = parseJsonResponse(responseText);

        // Attempt TTS audio generation & R2 storage
        let audioKey = null;
        try {
          const promptText = podcastData.dialogue.map(d => `${d.speaker}: ${d.text}`).join("\n");
          const ttsAudioBase64 = await runGeminiTTS(env, `TTS dialogue between Alex and Dr. Sam:\n${promptText}`);

          if (ttsAudioBase64) {
            const rawPcm = Uint8Array.from(atob(ttsAudioBase64), c => c.charCodeAt(0));
            // Wrap raw PCM (24kHz mono 16-bit) in a proper WAV container so browsers can play it
            const wavBuffer = pcmToWav(rawPcm, 24000, 1, 16);
            const storageKey = `podcasts/${key.replace(/[^a-zA-Z0-9_\.-]/g, "_")}_${language}.wav`;
            await env.MD_BUCKET.put(storageKey, wavBuffer, {
              httpMetadata: { contentType: "audio/wav" }
            });
            audioKey = storageKey;
          }
        } catch (ttsErr) {
          console.warn("TTS storage warning:", ttsErr.message);
        }

        return json({
          podcastTitle: podcastData.podcastTitle,
          language: podcastData.language || language,
          dialogue: podcastData.dialogue,
          audioKey: audioKey,
          audioUrl: audioKey ? `/api/podcast/audio?key=${encodeURIComponent(audioKey)}` : null
        });
      } catch (err) {
        console.error("Podcast generation error:", err);
        return json({ error: err.message || "Gemini podcast failed" }, 500);
      }
    }

    return json({ error: "Not found" }, 404);
  },
};
