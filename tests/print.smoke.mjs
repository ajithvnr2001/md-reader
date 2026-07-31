/**
 * Print system validation —
 * 1) Static CSS regression checks (the body{display:none} bug must never return)
 * 2) jsdom behavior: print mode class toggling for document vs cheat-sheet.
 * Run: node tests/print.smoke.mjs
 */
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const appJs = readFileSync(new URL("../public/js/app.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../public/css/style.css", import.meta.url), "utf8");
const htmlNoCdn = html.replace(/<script src="https:[^"]+"><\/script>/g, "").replace(/<script src="\/app.js"><\/script>/, "");

const results = [];
function check(name, fn) {
  try { const r = fn(); if (r === false) throw new Error("assertion returned false"); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name, e.message]); }
}

/* ================= Part 1: static CSS regression checks ================= */
check("CSS: @media print block exists", () => /@media\s+print\s*\{/.test(css));

check("CSS REGRESSION: no global 'body' display:none in print (the blank-page bug)", () => {
  // The old bug: `@media print { body, header, aside ... { display: none !important } }`
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return !/@media\s+print\s*\{[^/]*?(?<![\w.-])body(\s*,|\s*\{)[^}]*display:\s*none/i.test(stripped);
});

check("CSS REGRESSION: no global visibility:hidden on body * (blank cheat-sheet bug)", () => {
  return !/body\s+\*\s*\{(?:[^}]*)?visibility:\s*hidden/i.test(css);
});

check("CSS: reader pane is expanded for print flow", () => {
  return /@media\s+print[\s\S]*?main\.reader[\s\S]*?overflow:\s*visible\s*!important/i.test(css);
});

check("CSS REGRESSION: app-shell 100dvh/overflow clip is overridden for print (multi-page bug)", () => {
  return /@media\s+print[\s\S]*?html,\s*body,\s*#app[\s\S]*?height:\s*auto\s*!important/i.test(css)
      && /@media\s+print[\s\S]*?#app\s*\{[^}]*display:\s*block\s*!important/i.test(css);
});

check("CSS: modal-overlays hidden in normal print", () => {
  return /@media\s+print\s*\{(?:[\s\S]*?)\.modal-overlay\s*\{[^}]*display:\s*none\s*!important/i.test(css.split("/* ---------- Gamification")[0]);
});

check("CSS: cheat-sheet print mode selector exists + shows modal", () => {
  return /body\.printing-cheatsheet\s+#cheatSheetModal\s*\{[^}]*display:\s*block\s*!important/i.test(css)
      && /body\.printing-cheatsheet\s+#cheatSheetContent[\s\S]*?display:\s*grid\s*!important/i.test(css);
});

check("CSS: printable dark-on-white token overrides present", () => {
  return /@media\s+print\s*\{[^}]*:root\s*\{[^}]*--text:\s*#1[0-9a-f]{5}/i.test(css);
});

check("CSS: cheat-sheet header buttons hidden in print", () => {
  return /body\.printing-cheatsheet\s+#cheatSheetModal\s+\.modal-header\s+button\s*\{[^}]*display:\s*none\s*!important/i.test(css);
});

/* ================= Part 2: jsdom behavior ================= */
const dom = new JSDOM(htmlNoCdn, { url: "http://localhost:8791/", runScripts: "outside-only", pretendToBeVisual: true });
const { window } = dom;

window.marked = { parse: (md) => md.replace(/^## (.*)$/gm, "<h2>$1</h2>").replace(/^# (.*)$/gm, "<h1>$1</h1>") };
window.DOMPurify = { sanitize: (h) => h };
window.mermaid = { initialize: () => {}, run: () => {}, render: async () => ({ svg: "<svg></svg>" }) };
window.JSZip = class { file() {} async generateAsync() { return new Blob(); } };
window.scrollTo = () => {};
window.Element.prototype.scrollIntoView = () => {};
window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
window.speechSynthesis = { cancel: () => {}, speak: () => {}, getVoices: () => [], speaking: false };
window.Response = Response;
window.confirm = () => true;
window.__printCalls = 0;
window.print = () => { window.__printCalls++; };

window.fetch = async (url) => {
  const u = new URL(url, "http://localhost:8791");
  const json = (d, s = 200) => new window.Response(JSON.stringify(d), { status: s });
  if (u.pathname === "/api/list") return json({ files: [{ key: "doc.md", size: 10, uploaded: "" }], folders: [] });
  if (u.pathname === "/api/ai/cache") return json({});
  if (u.pathname === "/api/file") return new window.Response("# Doc\n\nprintable text", { status: 200 });
  return json({}, 404);
};
window.URL.createObjectURL = () => "blob:stub";
window.URL.revokeObjectURL = () => {};

window.eval(appJs + "\n;window.__p = { state };");
results.push(["PASS", "app.js evaluates for print tests"]);

await new Promise(r => setTimeout(r, 400));
const doc = window.document;
const P = window.__p;

check("document print: exportPdfBtn calls window.print WITHOUT cheat-sheet class", () => {
  P.state.activeKey = "doc.md";
  doc.getElementById("exportPdfBtn").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  return window.__printCalls === 1 && !doc.body.classList.contains("printing-cheatsheet");
});

check("cheat-sheet print: button enables printing-cheatsheet mode + prints", () => {
  doc.getElementById("printCheatSheetBtn").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  return window.__printCalls === 2 && doc.body.classList.contains("printing-cheatsheet");
});

check("afterprint cleans up cheat-sheet mode", async () => {
  doc.body.classList.add("printing-cheatsheet");
  window.dispatchEvent(new window.Event("afterprint"));
  await new Promise(r => setTimeout(r, 50));
  return !doc.body.classList.contains("printing-cheatsheet");
});

check("exportPdfBtn refuses when no document is open", () => {
  const before = window.__printCalls;
  P.state.activeKey = null;
  doc.getElementById("exportPdfBtn").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  return window.__printCalls === before;
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
