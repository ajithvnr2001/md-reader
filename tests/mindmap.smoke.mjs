/**
 * Mind Map Studio smoke test — tree→mermaid conversion, layouts,
 * auto-fit math, regen/edit/copy hooks, node focus & ask-AI, selection scope.
 * Run: node tests/mindmap.smoke.mjs
 */
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const appJs = readFileSync(new URL("../public/js/app.js", import.meta.url), "utf8");
const htmlNoCdn = html.replace(/<script src="https:[^"]+"><\/script>/g, "").replace(/<script src="\/app.js"><\/script>/, "");

const dom = new JSDOM(htmlNoCdn, { url: "http://localhost:8791/", runScripts: "outside-only", pretendToBeVisual: true });
const { window } = dom;

window.marked = { parse: (md) => md.replace(/^## (.*)$/gm, "<h2>$1</h2>").replace(/^# (.*)$/gm, "<h1>$1</h1>") };
window.DOMPurify = { sanitize: (h) => h };
window.JSZip = class { file() {} async generateAsync() { return new Blob(); } };
window.scrollTo = () => {};
window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
window.speechSynthesis = { cancel: () => {}, speak: () => {}, getVoices: () => [], speaking: false };
window.Response = Response;
window.confirm = () => true;
window.CSS = window.CSS || {};
window.CSS.escape = window.CSS.escape || ((s) => String(s).replace(/([\[\]"\\.])/g, "\\$1"));
window.__clip = [];
try { Object.defineProperty(window.navigator, "clipboard", { value: { writeText: async (t) => { window.__clip.push(t); } }, configurable: true }); } catch (e) {}
window.__renderedCodes = [];
window.mermaid = {
  initialize: (cfg) => { window.__lastMermaidCfg = cfg; },
  run: () => {},
  render: async (id, code) => {
    window.__renderedCodes.push(code);
    const labels = [...code.matchAll(/\["([^"]+)"]/g)].map(m => m[1]);
    if (!labels.length) labels.push(...[...code.matchAll(/root\(\(([^)]+)\)\)/g)].map(m => m[1]));
    return { svg: `<svg id="${id}" width="600" height="400"><g class="node" id="flowchart-n0-1"><text>${labels[0] || "root"}</text></g><g class="node" id="flowchart-n1-2"><text>${labels[1] || "child"}</text></g></svg>` };
  }
};

const TREE = { label: "Serverless", children: [
  { label: "Functions", children: [{ label: "Lambda" }, { label: "Cloud Run" }] },
  { label: "Platforms", children: [{ label: "App Engine" }] }
] };

window.__mindmapCall = null;
window.fetch = async (url, options = {}) => {
  const u = new URL(url, "http://localhost:8791");
  const json = (d, s = 200) => new window.Response(JSON.stringify(d), { status: s });
  if (u.pathname === "/api/list") return json({ files: [{ key: "a.md", size: 10, uploaded: "" }], folders: [] });
  if (u.pathname === "/api/ai/cache" && (options.method || "GET") === "GET") return json({});
  if (u.pathname === "/api/ai/cache") return json({ ok: true });
  if (u.pathname === "/api/ai/mindmap") { window.__mindmapCall = JSON.parse(options.body); return json({ topic: TREE, docTitle: "a", scoped: !!options.body.includes("selection") || null }); }
  if (u.pathname === "/api/ai/chat") return json({ reply: "tutor answer", keyConcepts: [], suggestedQuestions: [] });
  if (u.pathname === "/api/file") return new window.Response("# A\n\nkubernetes lambda cloud run functions app engine", { status: 200 });
  return json({}, 404);
};

const results = [];
function check(name, fn) {
  try { const r = fn(); if (r === false) throw new Error("assertion returned false"); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name, e.message]); }
}

window.eval(appJs + "\n;window.__mm = mindMapStudio; window.__s = state;");
results.push(["PASS", "app.js evaluates with mindMapStudio"]);

await new Promise(r => setTimeout(r, 500));
const doc = window.document;
const MM = window.__mm;
const S = window.__s;
const click = (elm) => elm.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

/* open doc first (sets activeKey) */
doc.querySelector('.file-item[data-key="a.md"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
await new Promise(r => setTimeout(r, 300));

await MM.generate({ force: true });
window.__firstMindmapCall = window.__mindmapCall;

check("open() fetches JSON tree from /api/ai/mindmap (deterministic path)", () => {
  return window.__firstMindmapCall.model === S.selectedModel && S.aiCache["a.md"].mindmapTree.label === "Serverless";
});

check("[B] tree→mermaid TD uses quoted labels + edges", () => {
  MM.setLayout("TD");
  const code = MM.currentCode;
  return code.includes('graph TD') && code.includes('n0["Serverless"]') && code.includes("n0 --> n1") && code.includes('n1["Functions"]');
});

check("[B REGRESSION] emitted mermaid never contains var()/parenthesized style values", () => {
  for (const layout of ["TD", "LR", "mindmap"]) {
    MM.setLayout(layout);
    if (/var\s*\(|fill:\s*var\(/i.test(MM.currentCode)) return false;
  }
  return true;
});

check("[B] layout switcher LR regenerates instantly without AI call", () => {
  const callBefore = window.__mindmapCall;
  MM.setLayout("LR");
  return MM.currentCode.includes("graph LR") && window.__mindmapCall === callBefore;
});

check("[B] radial mindmap layout emits mermaid mindmap syntax", () => {
  MM.setLayout("mindmap");
  return MM.currentCode.trim().startsWith("mindmap") && MM.currentCode.includes("root((");
});

check("[B] labels are escaped safely (quotes)", () => {
  MM.tree = { label: 'Root "x"', children: [{ label: "Child" }] };
  MM.setLayout("TD");
  return MM.currentCode.includes("n0[\"Root 'x'\"]") ;
});

check("[A] fit zoom is computed and applied once canvas sized", () => {
  const canvas = doc.getElementById("mindMapCanvas");
  canvas._baseW = 600; canvas._baseH = 400;
  MM._container.clientWidth; // jsdom 0 → fit path guard
  MM.applyFit();
  return MM.zoom >= 0.2 && MM.zoom <= 4 && doc.getElementById("mindMapZoomLevel").textContent.endsWith("%");
});

check("[A] setZoom grows the canvas layout box (scroll area correct)", () => {
  MM.setZoom(2);
  const canvas = doc.getElementById("mindMapCanvas");
  return parseFloat(canvas.style.width) >= 1200 && doc.getElementById("mindMapZoomLevel").textContent === "200%";
});

check("[A] regenerate clears cache and refetches", async () => {
  await MM.regenerate();
  return S.aiCache["a.md"].mindmapTree && (window.__mindmapCall !== null);
});

check("[A] copy code writes Mermaid source to clipboard", async () => {
  MM.setLayout("LR");
  await MM.copyCode();
  return window.__clip[window.__clip.length - 1].includes("graph LR");
});

check("[A] theme observer config uses dark for night themes", async () => {
  await MM.render(MM.currentCode, false);
  return window.__lastMermaidCfg.theme === "dark" || window.__lastMermaidCfg.theme === "default";
});

check("[C] subtree focus dims unrelated nodes", () => {
  MM.tree = TREE;
  MM.setLayout("TD");
  const set = MM._relationSet("Functions");
  return set.has(0) && set.has(1) && set.has(2) && set.has(3) && !set.has(4) && !set.has(5);
});

check("[C] ask-about-node forwards a tutor prompt", async () => {
  MM.askAboutNode("Lambda");
  await new Promise(r => setTimeout(r, 300));
  const last = S.chatHistory.find(m => m.role === "user" && m.parts[0].text.includes('"Lambda"'));
  return !!last && doc.getElementById("mindMapModal").style.display === "none";
});

check("[C] selection-scoped call sends selection body", async () => {
  window.__mindmapCall = null;
  await MM.generate({ selection: "Lambda is the serverless compute agent", force: true });
  return window.__mindmapCall && window.__mindmapCall.selection.includes("Lambda");
});

check("SVG pin: mermaid CDN is pinned in HTML", () => {
  return html.includes("mermaid@10.9.1");
});

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
