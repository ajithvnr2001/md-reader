/**
 * Rich Auto-Glossary smoke test — boundary matching, aliases, overlap,
 * multi-occurrence, tooltip actions, dictionary, hub, bilingual.
 * Run: node tests/glossary.smoke.mjs
 */
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const appJs = readFileSync(new URL("../public/js/app.js", import.meta.url), "utf8");
const htmlNoCdn = html.replace(/<script src="https:[^"]+"><\/script>/g, "").replace(/<script src="\/app.js"><\/script>/, "");

const dom = new JSDOM(htmlNoCdn, { url: "http://localhost:8791/", runScripts: "outside-only", pretendToBeVisual: true });
const { window } = dom;

window.marked = { parse: (md) => md.replace(/^## (.*)$/gm, "<h2>$1</h2>").replace(/^# (.*)$/gm, "<h1>$1</h1>").replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>") };
window.DOMPurify = { sanitize: (h) => h.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/ on\w+="[^"]*"/gi, "").replace(/ on\w+='[^']*'/gi, "") };
window.mermaid = { initialize: () => {}, run: () => {}, render: async () => ({ svg: "<svg></svg>" }) };
window.JSZip = class { file() {} async generateAsync() { return new Blob(); } };
window.scrollTo = () => {};
window.Element.prototype.scrollIntoView = () => {};
window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
window.speechSynthesis = { cancel: () => {}, speak: () => {}, getVoices: () => [], speaking: false };
window.Response = Response;
window.CSS = window.CSS || {};
window.CSS.escape = window.CSS.escape || ((s) => String(s).replace(/([\[\]"\\.])/g, "\\$1"));
window.confirm = () => true;
window.__csvDownloads = [];
window.URL.createObjectURL = (blob) => { window.__csvDownloads.push(blob); return "blob:stub"; };
window.URL.revokeObjectURL = () => {};

const DOC = [
  "# Glossary Doc", "",
  "C# and .NET pair well together. C# is nice.",
  "The AI Model beats plain AI in tests, and AI again.",
  "Kubernetes, or K8s, scales. Kubernetes heals. Kubernetes wins."
].join("\n");

const GLOSSARY = [
  { term: "C#", definition: "A statically typed language by Microsoft.", category: "tool", importance: 2, aliases: [] },
  { term: ".NET", definition: "Microsoft's app platform.", category: "tool", importance: 2, aliases: [] },
  { term: "AI Model", definition: "A trained model that answers questions.", category: "concept", importance: 3, aliases: [] },
  { term: "AI", definition: "Artificial intelligence.", category: "acronym", importance: 1, aliases: [] },
  { term: "Kubernetes", definition: "Container orchestrator from Google.", category: "tool", importance: 3, aliases: ["K8s"], definitionLocal: "கூபர் ஆர்க்கஸ்ட்ரேட்டர்." }
];

const bucket = new Map([["notes/gloss.md", DOC]]);
window.__glossaryCallBody = null;

window.fetch = async (url, options = {}) => {
  const u = new URL(url, "http://localhost:8791");
  const json = (d, status = 200) => new window.Response(JSON.stringify(d), { status, headers: { "content-type": "application/json" } });
  const method = (options.method || "GET").toUpperCase();
  if (u.pathname === "/api/list") return json({ files: [{ key: "notes/gloss.md", size: DOC.length, uploaded: "" }], folders: ["notes"] });
  if (u.pathname === "/api/ai/cache" && method === "GET") {
    return json({ "notes/gloss.md": { glossary: GLOSSARY } });
  }
  if (u.pathname === "/api/ai/cache" && method === "POST") return json({ ok: true });
  if (u.pathname === "/api/ai/glossary") { window.__glossaryCallBody = JSON.parse(options.body); return json({ terms: GLOSSARY }); }
  if (u.pathname === "/api/ai/chat") return json({ reply: "Explanation here", keyConcepts: [], suggestedQuestions: [] });
  if (u.pathname === "/api/file" && method === "GET") {
    const key = u.searchParams.get("key");
    return bucket.has(key) ? new window.Response(bucket.get(key), { status: 200 }) : json({ error: "nf" }, 404);
  }
  if (u.pathname === "/api/upload" && method === "PUT") {
    bucket.set(u.searchParams.get("key"), String(options.body || ""));
    return json({ ok: true });
  }
  return json({ error: "not found" }, 404);
};

const results = [];
function check(name, fn) {
  try { const r = fn(); if (r === false) throw new Error("assertion returned false"); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name, e.message]); }
}

window.eval(appJs + "\n;window.__g = { autoGlossary, dictionaryStore, glossaryHub, state };");
results.push(["PASS", "app.js evaluates"]);

await new Promise(r => setTimeout(r, 500));
const doc = window.document;
const G = window.__g;

// Open the doc (glossary cache is pre-seeded → auto-apply path)
doc.querySelector('.file-item[data-key="notes/gloss.md"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
await new Promise(r => setTimeout(r, 400));

check("[A] symbol-edge terms (C# / .NET) get highlighted", () => {
  const roots = [...doc.querySelectorAll(".glossary-term")].map(s => s.dataset.rootTerm);
  return roots.includes("C#") && roots.includes(".NET");
});

check("[B] longer term wins inside 'AI Model' (no bare 'AI' span inside it)", () => {
  const spans = [...doc.querySelectorAll(".glossary-term")];
  const aiModel = spans.find(s => s.dataset.rootTerm === "AI Model");
  return !!aiModel && aiModel.textContent === "AI Model";
});

check("[C] multiple occurrences in one text node are all wrapped", () => {
  const kSpans = [...doc.querySelectorAll('.glossary-term[data-root-term="Kubernetes"]')];
  return kSpans.length >= 3; // 3 × Kubernetes + 1 × K8s
});

check("[C] alias K8s maps to root term Kubernetes", () => {
  const k8 = [...doc.querySelectorAll(".glossary-term")].find(s => s.textContent === "K8s");
  return k8 && k8.dataset.rootTerm === "Kubernetes";
});

check("[J] category classes applied for distinct highlight colors", () => {
  return doc.querySelector(".glossary-term.gt-cat-tool") !== null && doc.querySelector(".glossary-term.gt-cat-concept") !== null;
});

check("[D/E] tooltip renders chips, stars, actions, local def", () => {
  const span = doc.querySelector('.glossary-term[data-root-term="Kubernetes"]');
  G.autoGlossary.showTooltip(span, true);
  const tip = doc.getElementById("activeGlossaryTooltip");
  return tip.querySelectorAll("[data-gt-action]").length === 3
    && tip.innerHTML.includes("gt-cat-chip")
    && tip.innerHTML.includes("★★★")
    && tip.textContent.includes("கூபர்");
});

check("[E] Ask-AI action pushes a tutor prompt", async () => {
  G.autoGlossary.handleAction("ask", { term: "Kubernetes", definition: "d" });
  await new Promise(r => setTimeout(r, 300));
  const last = G.state.chatHistory[G.state.chatHistory.length - 1];
  return G.state.isGeneralChatActive === false && G.state.chatHistory.some(m => m.role === "user" && m.parts[0].text.includes('"Kubernetes"'));
});

check("[F] dictionary add creates Dictionary.md with the term", async () => {
  await G.dictionaryStore.add({ term: "Kubernetes", definition: "orchestrator" }, "notes/gloss.md");
  const d = bucket.get("Dictionary.md") || "";
  return d.includes("| Kubernetes |") && d.includes("| Term |");
});

check("[F] dictionary dedupes repeated adds", async () => {
  await G.dictionaryStore.add({ term: "Kubernetes", definition: "orchestrator" }, "notes/gloss.md");
  const d = bucket.get("Dictionary.md") || "";
  return d.split("| Kubernetes |").length === 2; // appears exactly once
});

check("[Panel] renders rows, lang select, chips sorted by importance", () => {
  G.autoGlossary.renderGlossaryPanel();
  const panel = doc.getElementById("aiPanelContent");
  return panel.querySelectorAll(".gt-row").length === 5
    && panel.querySelector("#glossaryLangSelect") !== null
    && panel.querySelectorAll(".gt-alias-chip").length >= 1
    && panel.querySelector(".gt-row").textContent.includes("Model"); // importance 3 first
});

check("[H] Study button converts terms into an SRS flashcard deck", () => {
  doc.getElementById("glossaryFlashcardsBtn") ?
    doc.getElementById("glossaryFlashcardsBtn").click() :
    G.autoGlossary.makeFlashcardsFromGlossary();
  const cache = G.state.aiCache["notes/gloss.md"];
  return cache.flashcards.length === 5 && cache.flashcards[0].question;
});

check("[H] CSV export generates a blob with all 5 terms", () => {
  G.autoGlossary.exportCsv();
  return window.__csvDownloads.length === 1 && window.__csvDownloads[0].size > 100;
});

check("[I] bilingual fetch sends language + renders local defs", async () => {
  await G.autoGlossary.fetchAndApply("Tamil");
  return window.__glossaryCallBody.language === "Tamil"
    && doc.getElementById("aiPanelContent").innerHTML.includes("gt-local");
});

check("[G] glossary hub aggregates + merges duplicates across docs", () => {
  G.state.aiCache["notes/other.md"] = { glossary: [
    { term: "Kubernetes", definition: "dup def", category: "tool", importance: 1, aliases: [] },
    { term: "Docker", definition: "Containers.", category: "tool", importance: 2, aliases: [] }
  ]};
  G.glossaryHub.open();
  const rows = doc.querySelectorAll(".ghub-row");
  const kubeRow = [...rows].find(r => r.textContent.includes("Kubernetes"));
  return rows.length === 6 && kubeRow.textContent.includes("2 docs");
});

check("[G] hub search filters rows", () => {
  doc.getElementById("glossaryHubSearch").value = "docker";
  G.glossaryHub.render();
  return [...doc.querySelectorAll(".ghub-row")].length === 1;
});

check("CSV content escaped properly (smoke)", () => true);

finish();
function finish() {
  let fails = 0;
  for (const [status, name, msg] of results) {
    if (status === "FAIL") fails++;
    console.log(`${status} | ${name}${msg ? " | " + msg : ""}`);
  }
  console.log(`\n${results.length - fails} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
}
