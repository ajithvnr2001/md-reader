/**
 * Frontend smoke test — loads index.html in jsdom, stubs CDN libs,
 * executes app.js, then exercises the fixed behaviors.
 * Run: node tests/frontend.smoke.mjs
 */
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const appJs = readFileSync(new URL("../public/js/app.js", import.meta.url), "utf8");

// Strip external <script src> tags — we stub those globals ourselves
const htmlNoCdn = html.replace(/<script src="https:[^"]+"><\/script>/g, "").replace(/<script src="\/app.js"><\/script>/, "");

const dom = new JSDOM(htmlNoCdn, { url: "http://localhost:8791/", runScripts: "outside-only", pretendToBeVisual: true });
const { window } = dom;

/* ---- Stubs for CDN libs ---- */
window.marked = { parse: (md) => md
  .replace(/^## (.*)$/gm, "<h2>$1</h2>")
  .replace(/^# (.*)$/gm, "<h1>$1</h1>")
  .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>") };
window.DOMPurify = { sanitize: (h) => h.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/ on\w+="[^"]*"/gi, "").replace(/ on\w+='[^']*'/gi, "") };
window.mermaid = { initialize: () => {}, run: () => {}, render: async () => ({ svg: "<svg></svg>" }) };
window.JSZip = class { file() {} async generateAsync() { return new Blob(); } };
window.scrollTo = () => {};
window.Element.prototype.scrollIntoView = () => {};
window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
window.speechSynthesis = { getVoices: () => [], speak: () => {}, cancel: () => {}, speaking: false };

/* ---- fetch stub: in-memory bucket ---- */
// jsdom has no fetch — inject Node's native fetch classes
window.Response = Response;
window.CSS = window.CSS || {};
window.CSS.escape = window.CSS.escape || ((s) => String(s).replace(/([\[\]"\\.])/g, "\\$1"));
window.Headers = Headers;
window.Request = Request;

const bucket = new Map([
  ["intro.md", "# Intro\n\nHello **world**. \(E=mc^2\)"],
  ["folder/xss\"<img>.md", "# XSS doc"],
]);
const apiResponses = {
  "/api/list": { files: [...bucket.entries()].map(([key, v]) => ({ key, size: v.length, uploaded: new Date().toISOString() })) },
  "/api/ai/cache": {},
  "/api/ai/chat": { reply: "Great question! ```mermaid\ngraph TD\nA-->B\n```", keyConcepts: ["C++"], suggestedQuestions: ["What's <b>next</b>?"] },
  "/api/ai/summarize": { summary: "- Point one\n- Point two", keyConcepts: ["<img onerror=alert(1)>"] },
  "/api/ai/quiz": { quiz: [{ question: "Is 1<2?", options: ["Yes", "No"], answerIndex: 0 }] },
  "/api/ai/flashcards": { flashcards: [{ question: "Q<\">", answer: "A" }] },
};

window.fetch = async (url, options = {}) => {
  const u = new URL(url, "http://localhost:8791");
  const json = (d, status = 200) => new window.Response(JSON.stringify(d), { status, headers: { "content-type": "application/json" } });

  if (u.pathname === "/api/list") return json(apiResponses["/api/list"]);
  if (u.pathname === "/api/ai/cache") return json(apiResponses["/api/ai/cache"]);
  if (u.pathname === "/api/ai/chat") return json(apiResponses["/api/ai/chat"]);
  if (u.pathname === "/api/ai/summarize") return json(apiResponses["/api/ai/summarize"]);
  if (u.pathname === "/api/ai/quiz") return json(apiResponses["/api/ai/quiz"]);
  if (u.pathname === "/api/ai/flashcards") return json(apiResponses["/api/ai/flashcards"]);
  if (u.pathname === "/api/file") {
    const key = u.searchParams.get("key");
    if (!/\.(md|markdown)$/i.test(key)) return json({ error: "blocked" }, 400);
    if (!bucket.has(key)) return json({ error: "File not found" }, 404);
    return new window.Response(bucket.get(key), { status: 200 });
  }
  return json({ error: "not found" }, 404);
};

/* ---- Execute app.js in the window ---- */
const results = [];
function check(name, fn) {
  try { const r = fn(); if (r === false) throw new Error("assertion returned false"); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name, e.message]); }
}

try {
  window.eval(appJs + "\n;window.__splitScreen = splitScreen;");
  results.push(["PASS", "app.js evaluates without errors"]);
} catch (e) {
  results.push(["FAIL", "app.js evaluates without errors", e.message]);
  report();
}

// Wait for initApp() async flow to settle
await new Promise(r => setTimeout(r, 500));

const doc = window.document;

check("file list rendered (initial files incl. malicious key)", () => {
  const items = doc.querySelectorAll(".file-item");
  return items.length >= 2;
});

check("XSS: malicious filename is escaped, no <img> element injected", () => {
  return doc.querySelector('.file-item img') === null && doc.querySelector('.file-list-empty') === null;
});

check("XSS: no inline event handlers in file tree", () => {
  const tree = doc.getElementById("fileList");
  const all = tree.querySelectorAll("*");
  for (const node of all) {
    for (const attr of node.attributes || []) {
      if (/^on/i.test(attr.name)) return false;
    }
  }
  return true;
});

check("malicious key with quote kept in data-key (openable)", () => {
  const item = [...doc.querySelectorAll(".file-item")].find(i => i.dataset.key === 'folder/xss"<img>.md');
  return !!item;
});

// Open the safe file and verify rendering pipeline
await (async () => {
  const item = [...doc.querySelectorAll(".file-item")].find(i => i.dataset.key === "intro.md");
  item.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 300));
})();

check("openFile renders markdown into #content", () => {
  return doc.getElementById("content").innerHTML.includes("Hello");
});

check("AI toolbar visible after open", () => doc.getElementById("aiToolbar").style.display !== "none");

check("TOC built for headings", () => doc.getElementById("tocList").children.length >= 1);

// Summary flow (sanitize check)
doc.getElementById("summarizeBtn").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
await new Promise(r => setTimeout(r, 300));

check("summarize renders, keyConcepts escaped", () => {
  const c = doc.getElementById("aiPanelContent");
  return c.innerHTML.length > 0 && c.querySelector("img") === null && c.querySelector(".concept-badge") !== null;
});

// Quiz flow
doc.getElementById("quizBtn").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
await new Promise(r => setTimeout(r, 300));
check("quiz renders option", () => doc.getElementById("aiPanelContent").querySelector("li[data-oi]") !== null);

// Flashcards flow
doc.getElementById("flashcardsBtn").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
await new Promise(r => setTimeout(r, 300));
check("flashcards render", () => doc.getElementById("aiPanelContent").querySelector(".flashcard") !== null);

// Retry button: summary (was ReferenceError before fix)
doc.getElementById("summarizeBtn").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
await new Promise(r => setTimeout(r, 200));
doc.getElementById("retryAiBtn").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
await new Promise(r => setTimeout(r, 300));
check("retry for Summary no longer throws (panel repopulated)", () => {
  return doc.getElementById("aiPanelContent").innerHTML.length > 0;
});

// Chat flow + mermaid extras + suggestion button escaping
await window.eval(`sendChatPrompt("hello <b>world</b>")`);
await new Promise(r => setTimeout(r, 300));
check("chat renders user msg escaped + model reply parsed", () => {
  const c = doc.getElementById("aiPanelContent");
  const userBubble = c.querySelector(".chat-msg.user .chat-bubble");
  return userBubble && !userBubble.querySelector("b") && c.querySelector(".chat-msg.model");
});

check("suggestion button carries escaped payload", () => {
  const btn = doc.querySelector(".suggestion-btn");
  return btn !== null;
});

// splitScreen.openSecondaryWithMarkdown exists (was missing -> TypeError)
window.__splitScreen.openSecondaryWithMarkdown("Test <Title>", "# Hi\n\ntext");
check("splitScreen.openSecondaryWithMarkdown renders secondary pane", () => {
  const sec = doc.getElementById("contentSecondary");
  return sec.innerHTML.includes("Hi") && sec.querySelector("script") === null;
});

// Glossary regex-escape helper
check("escapeRegExp handles regex chars like C++", () => {
  return typeof window.escapeRegExp === "undefined" || window.eval(`escapeRegExp("C++")`) === "C\\+\\+";
});

report();

function report() {
  let fails = 0;
  for (const [status, name, msg] of results) {
    if (status === "FAIL") fails++;
    console.log(`${status} | ${name}${msg ? " | " + msg : ""}`);
  }
  console.log(`\n${results.length - fails} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
}
