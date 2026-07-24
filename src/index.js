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
  return objects
    .filter((o) => o.key.toLowerCase().endsWith(".md"))
    .map((o) => ({
      key: o.key,
      size: o.size,
      uploaded: o.uploaded,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

async function getMarkdownText(env, key) {
  const obj = await env.MD_BUCKET.get(key);
  if (!obj) return null;
  return await obj.text();
}

/** Trim long docs so we stay within the model's context window. */
function truncateForModel(text, maxChars = 12000) {
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
          term: { type: "STRING" },
          definition: { type: "STRING" }
        },
        required: ["term", "definition"]
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

async function runGeminiTTS(env, prompt) {
  const apiKey = env.GEMINI_API_KEY || "";
  const url = `https://generativelanguage.googleapis.com/v1beta/interactions?key=${apiKey}`;

  const body = {
    model: "gemini-3.1-flash-tts-preview",
    input: prompt,
    response_format: { type: "audio" },
    generation_config: {
      speech_config: [
        { speaker: "Alex", voice: "Kore" },
        { speaker: "Dr. Sam", voice: "Puck" }
      ]
    }
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      console.warn("Gemini TTS endpoint status:", res.status);
      return null;
    }

    const data = await res.json();
    if (data.output_audio && data.output_audio.data) {
      return data.output_audio.data;
    }
  } catch (err) {
    console.warn("Gemini TTS fetch error:", err.message);
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

    // ---- API: sync AI cache ----
    if (pathname === "/api/ai/cache") {
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
          await env.MD_BUCKET.put(".ai_cache.json", body);
          return json({ ok: true });
        } catch (err) {
          return json({ error: err.message }, 500);
        }
      }
    }

    // ---- API: list files ----
    if (pathname === "/api/list" && request.method === "GET") {
      try {
        const files = await listMarkdownFiles(env);
        return json({ files });
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    // ---- API: get raw markdown ----
    if (pathname === "/api/file" && request.method === "GET") {
      const key = url.searchParams.get("key");
      if (!key) return json({ error: "Missing ?key=" }, 400);
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
      if (!key || !key.toLowerCase().endsWith(".md")) {
        return json({ error: "Provide ?key=name.md" }, 400);
      }
      await env.MD_BUCKET.put(key, request.body);
      return json({ ok: true, key });
    }

    // ---- API: delete file (protected) ----
    if (pathname === "/api/file" && request.method === "DELETE") {
      if (!checkAuth(request, env)) return json({ error: "Unauthorized" }, 401);
      const key = url.searchParams.get("key");
      if (!key) return json({ error: "Missing ?key=" }, 400);
      await env.MD_BUCKET.delete(key);
      return json({ ok: true });
    }

    // ---- API: delete folder (protected) ----
    if (pathname === "/api/folder" && request.method === "DELETE") {
      if (!checkAuth(request, env)) return json({ error: "Unauthorized" }, 401);
      const prefix = url.searchParams.get("prefix");
      if (!prefix) return json({ error: "Missing ?prefix=" }, 400);
      
      const cleanPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`;
      let listed = await env.MD_BUCKET.list({ prefix: cleanPrefix });
      let deletedKeys = [];
      for (const obj of listed.objects) {
        await env.MD_BUCKET.delete(obj.key);
        deletedKeys.push(obj.key);
      }
      
      return json({ ok: true, deletedCount: deletedKeys.length, keys: deletedKeys });
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
        const newNameClean = newName.toLowerCase().endsWith('.md') ? newName : `${newName}.md`;
        parts.push(newNameClean);
        const newKey = parts.join('/');
        
        if (oldKey === newKey) return json({ ok: true });
        
        // Fetch, Put, Delete
        const oldObj = await env.MD_BUCKET.get(oldKey);
        if (!oldObj) return json({ error: "Original file not found" }, 404);
        
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
        
        if (oldKey === newKey) return json({ ok: true });
        
        // Fetch, Put, Delete
        const oldObj = await env.MD_BUCKET.get(oldKey);
        if (!oldObj) return json({ error: "Original file not found" }, 404);
        
        const body = await oldObj.arrayBuffer();
        await env.MD_BUCKET.put(newKey, body);
        await env.MD_BUCKET.delete(oldKey);
        
        return json({ ok: true, newKey });
      } catch (e) {
        return json({ error: e.message }, 500);
      }
    }

    // ---- API: Gemini — summarize ----
    if (pathname === "/api/ai/summarize" && request.method === "POST") {
      try {
        const { key } = await request.json();
        const text = await getMarkdownText(env, key);
        if (text === null) return json({ error: "File not found" }, 404);
        
        const systemInstruction = "You are a helpful study assistant. Summarize the given document in clean bullet points.";
        const messages = [{ role: "user", content: `Please summarize this document:\n\n${text}` }];
        
        const responseText = await runGemini(env, messages, systemInstruction, "application/json", summarizeSchema);
        return json(JSON.parse(responseText));
      } catch (err) {
        console.error("Summarize error:", err);
        return json({ error: err.message || "Gemini summarize failed" }, 500);
      }
    }

    // ---- API: Gemini — explain selection ----
    if (pathname === "/api/ai/explain" && request.method === "POST") {
      try {
        const { key, selection } = await request.json();
        const text = await getMarkdownText(env, key);
        if (text === null) return json({ error: "File not found" }, 404);
        
        const systemInstruction = `You are a helpful study tutor. When explaining systems, architectures, comparisons, or sequences, always construct a clean, valid Mermaid.js flowchart or graph inside a fenced markdown block (using \`\`\`mermaid) to help the user visualize the explanation. Keep your reply simple and easy to understand. Below is the Markdown document context:
${text}`;
        const prompt = selection && selection.trim().length > 0
          ? `Explain this specific selection in simple terms: "${selection}"`
          : `Explain the key concepts of this document in simple terms.`;
          
        const messages = [{ role: "user", content: prompt }];
        const responseText = await runGemini(env, messages, systemInstruction, "application/json", chatSchema);
        return json(JSON.parse(responseText));
      } catch (err) {
        console.error("Explain error:", err);
        return json({ error: err.message || "Gemini explain failed" }, 500);
      }
    }

    // ---- API: Gemini — quiz ----
    if (pathname === "/api/ai/quiz" && request.method === "POST") {
      try {
        const { key } = await request.json();
        const text = await getMarkdownText(env, key);
        if (text === null) return json({ error: "File not found" }, 404);
        
        const systemInstruction = "You generate short study quizzes based on the document. Generate exactly 5 multiple-choice questions.";
        const messages = [{ role: "user", content: `Please generate a quiz for this document:\n\n${text}` }];
        
        const responseText = await runGemini(env, messages, systemInstruction, "application/json", quizSchema);
        return json(JSON.parse(responseText));
      } catch (err) {
        console.error("Quiz error:", err);
        return json({ error: err.message || "Gemini quiz failed" }, 500);
      }
    }

    // ---- API: Gemini — chat ----
    if (pathname === "/api/ai/chat" && request.method === "POST") {
      try {
        const { key, messages } = await request.json();
        let systemInstruction = "";
        
        if (key) {
          const text = await getMarkdownText(env, key);
          if (text === null) return json({ error: "File not found" }, 404);
          
          systemInstruction = `You are a helpful study tutor. Below is the Markdown document context for this chat session:

--- START OF DOCUMENT ---
${text}
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

        const responseText = await runGemini(env, messages, systemInstruction, "application/json", chatSchema);
        return json(JSON.parse(responseText));
      } catch (err) {
        console.error("Chat error:", err);
        return json({ error: err.message || "Gemini chat failed" }, 500);
      }
    }

    // ---- API: Gemini — flashcards ----
    if (pathname === "/api/ai/flashcards" && request.method === "POST") {
      try {
        const { key } = await request.json();
        const text = await getMarkdownText(env, key);
        if (text === null) return json({ error: "File not found" }, 404);
        
        const systemInstruction = "You generate high-quality study flashcards based on the document context. Generate exactly 5 to 8 cards containing a term or question on the front, and a clear, short definition or answer on the back.";
        const messages = [{ role: "user", content: `Please generate flashcards for this document:\n\n${text}` }];
        
        const responseText = await runGemini(env, messages, systemInstruction, "application/json", flashcardsSchema);
        return json(JSON.parse(responseText));
      } catch (err) {
        console.error("Flashcards error:", err);
        return json({ error: err.message || "Gemini flashcards failed" }, 500);
      }
    }

    // ---- API: Gemini — cheatsheet ----
    if (pathname === "/api/ai/cheatsheet" && request.method === "POST") {
      try {
        const { key } = await request.json();
        const text = await getMarkdownText(env, key);
        if (text === null) return json({ error: "File not found" }, 404);
        
        const systemInstruction = "You extract and compress all key definitions, code syntax, formulas, commands, and core rules into a highly dense, 1-page print-ready exam cheat sheet.";
        const messages = [{ role: "user", content: `Please create a 1-page exam cheat sheet for this document:\n\n${text}` }];
        
        const responseText = await runGemini(env, messages, systemInstruction, "application/json", cheatsheetSchema);
        return json(JSON.parse(responseText));
      } catch (err) {
        console.error("Cheatsheet error:", err);
        return json({ error: err.message || "Gemini cheatsheet failed" }, 500);
      }
    }

    // ---- API: Gemini — paragraph comment thread ----
    if (pathname === "/api/ai/comment" && request.method === "POST") {
      try {
        const { key, paragraphText, commentText, threadHistory } = await request.json();
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

        const responseText = await runGemini(env, messages, systemInstruction, "application/json", chatSchema);
        return json(JSON.parse(responseText));
      } catch (err) {
        console.error("Comment error:", err);
        return json({ error: err.message || "Gemini comment failed" }, 500);
      }
    }

    // ---- API: Gemini — auto glossary ----
    if (pathname === "/api/ai/glossary" && request.method === "POST") {
      try {
        const { key } = await request.json();
        const text = await getMarkdownText(env, key);
        if (text === null) return json({ error: "File not found" }, 404);

        const systemInstruction = "You detect and extract 8 to 15 key technical terms, acronyms, and specialized jargon from the document. For each term, provide a clear 1-sentence definition.";
        const messages = [{ role: "user", content: `Please extract key glossary terms for this document:\n\n${text}` }];

        const responseText = await runGemini(env, messages, systemInstruction, "application/json", glossarySchema);
        return json(JSON.parse(responseText));
      } catch (err) {
        console.error("Glossary error:", err);
        return json({ error: err.message || "Gemini glossary failed" }, 500);
      }
    }

    // ---- API: Gemini — context-aware full document translation ----
    if (pathname === "/api/ai/translate" && request.method === "POST") {
      try {
        const { key, targetLanguage = "Tamil" } = await request.json();
        const text = await getMarkdownText(env, key);
        if (text === null) return json({ error: "File not found" }, 404);

        const systemInstruction = `You are a master technical translator specializing in natural, modern, human-friendly translations.

CRITICAL TRANSLATION GUIDELINES FOR ${targetLanguage}:
1. FULL DOCUMENT TRANSLATION: Translate the ENTIRE document thoroughly from start to finish. Do NOT shorten, truncate, or summarize it into a brief recap. Translate all paragraphs, bullet points, sections, and explanations fully.
2. NATURAL & MODERN LANGUAGE (NO ARCHAIC/PURE TEXTBOOK PHRASING):
   - For TAMIL: Use simple, natural, modern everyday Tamil (எளிய தற்கால தமிழ் / இயல்பான எளிய பேச்சு நடை). ABSOLUTELY DO NOT USE ancient, formal, or archaic Senthamizh (செந்தமிழ்) words like 'தரவுத்தளம்' or 'மின்அஞ்சல்' that everyday students and tech professionals never speak. Keep technical terms like Database, API, Cloud, Server, Code, Worker in English or natural modern Tamil transliteration (e.g. டேட்டாபேஸ் / API / கிளவுட்) so it reads completely naturally and effortlessly.
   - For INDIAN & REGIONAL LANGUAGES (Hindi, Tamil, Telugu, Malayalam, Kannada, Bengali, Marathi, Gujarati, Punjabi): Use natural, conversational, crystal-clear modern phrasing used in daily educational discussions. Avoid obscure textbook jargon.
3. PRESERVE MARKDOWN & CODE: Keep all Markdown headers (#, ##), bold text (**), bullet lists, LaTeX math formulas ($...$), and code blocks (\`\`\`...\`\`\`) completely intact and untouched.`;

        const messages = [{ role: "user", content: `Please translate the full document below into natural, easy-to-understand modern ${targetLanguage}:\n\n${truncateForModel(text, 12000)}` }];

        const responseText = await runGemini(env, messages, systemInstruction, "application/json", translateSchema);
        return json(JSON.parse(responseText));
      } catch (err) {
        console.error("Translation error:", err);
        return json({ error: err.message || "Gemini translation failed" }, 500);
      }
    }

    // ---- API: Serve saved podcast audio from R2 ----
    if (pathname === "/api/podcast/audio" && request.method === "GET") {
      const audioKey = url.searchParams.get("key");
      if (!audioKey) return json({ error: "Missing audio key" }, 400);

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
        const { key, language = "Tamil" } = await request.json();
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

        const messages = [{ role: "user", content: `Please create a 2-host audio podcast dialogue script in natural modern ${language} for the following complete document:\n\n${truncateForModel(text, 12000)}` }];

        const responseText = await runGemini(env, messages, systemInstruction, "application/json", podcastSchema);
        const podcastData = JSON.parse(responseText);

        // Attempt TTS audio generation & R2 storage
        let audioKey = null;
        try {
          const promptText = podcastData.dialogue.map(d => `${d.speaker}: ${d.text}`).join("\n");
          const ttsAudioBase64 = await runGeminiTTS(env, `TTS dialogue between Alex and Dr. Sam:\n${promptText}`);

          if (ttsAudioBase64) {
            const rawPcm = Uint8Array.from(atob(ttsAudioBase64), c => c.charCodeAt(0));
            const storageKey = `podcasts/${key.replace(/[^a-zA-Z0-9_\.-]/g, "_")}_${language}.wav`;
            await env.MD_BUCKET.put(storageKey, rawPcm, {
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
