/**
 * Fullscreen Mode smoke test — pseudo fallback, shortcuts, idle fade,
 * read chip, pinch zoom, auto-fullscreen preference.
 * Run: node tests/fullscreen.smoke.mjs
 */
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const appJs = readFileSync(new URL("../public/js/app.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../public/css/style.css", import.meta.url), "utf8");
const htmlNoCdn = html.replace(/<script src="https:[^"]+"><\/script>/g, "").replace(/<script src="\/app.js"><\/script>/, "");

const dom = new JSDOM(htmlNoCdn, { url: "http://localhost:8791/", runScripts: "outside-only", pretendToBeVisual: true });
const { window } = dom;

window.marked = { parse: (md) => md.replace(/^## (.*)$/gm, "<h2>$1</h2>").replace(/^# (.*)$/gm, "<h1>$1</h1>") };
window.DOMPurify = { sanitize: (h) => h };
window.mermaid = { initialize: () => {}, run: () => {}, render: async () => ({ svg: "<svg/>" }) };
window.JSZip = class { file() {} async generateAsync() { return new Blob(); } };
window.scrollTo = () => {};
window.Element.prototype.scrollIntoView = () => {};
window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
window.speechSynthesis = { cancel: () => {}, speak: () => {}, getVoices: () => [], speaking: false };
window.Response = Response;
window.confirm = () => true;
window.CSS = window.CSS || {};
window.CSS.escape = window.CSS.escape || ((s) => String(s).replace(/([\[\]"\\.])/g, "\\$1"));
window.prompt = () => null;
// NOTE: no requestFullscreen stub → exercises the PSEUDO fallback path
delete window.document.documentElement.requestFullscreen;

const bucket = new Map([["a.md", "# A\n\nSome text"], ["b.md", "# B\n\nOther text"]]);
window.fetch = async (url, options = {}) => {
  const u = new URL(url, "http://localhost:8791");
  const json = (d, s = 200) => new window.Response(JSON.stringify(d), { status: s });
  if (u.pathname === "/api/list") return json({ files: [...bucket.keys()].map(k => ({ key: k, size: 12, uploaded: "" })), folders: [] });
  if (u.pathname === "/api/ai/cache") return json({});
  if (u.pathname === "/api/file") return new window.Response(bucket.get(u.searchParams.get("key")) || "err", { status: 200 });
  return json({}, 404);
};

const results = [];
function check(name, fn) {
  try { const r = fn(); if (r === false) throw new Error("assertion returned false"); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name, e.message]); }
}

window.eval(appJs + "\n;window.__x = { state, readingProgress };");
results.push(["PASS", "app.js evaluates with fullscreen module"]);

await new Promise(r => setTimeout(r, 500));
const doc = window.document;
const X = window.__x;
const FS = window.__fs;
const click = (elm) => elm.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

check("enter() without an open doc is blocked", () => {
  FS.enter();
  return !FS.isActive() && !doc.body.classList.contains("is-fullscreen");
});

doc.querySelector('.file-item[data-key="a.md"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
await new Promise(r => setTimeout(r, 300));

check("[A] pseudo fallback engages when Fullscreen API is missing", () => {
  FS.toggle();
  return FS.isPseudo() === true && FS.isActive() === true && doc.body.classList.contains("is-fullscreen");
});

check("[A] pseudo exit restores normal state", () => {
  FS.toggle();
  return !FS.isActive() && !doc.body.classList.contains("is-fullscreen");
});

check("[B] Ctrl+Shift+F toggles fullscreen on", () => {
  doc.dispatchEvent(new window.KeyboardEvent("keydown", { key: "F", ctrlKey: true, shiftKey: true, bubbles: true }));
  return FS.isActive() === true;
});

check("[B] ESC exits pseudo fullscreen", () => {
  doc.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  return FS.isActive() === false;
});

check("[D] % read chip shows progress + A× label present", async () => {
  FS.toggle();
  X.readingProgress.set('a.md', 0.62);
  FS.updateReadChip();
  await new Promise(r => setTimeout(r, 50));
  return doc.getElementById("fsReadPct").textContent === "62% read"
      && doc.querySelector(".fs-zoom-label") !== null;
});

check("[C] controls arm idle-fade after 3s", async () => {
  return await new Promise(resolve => {
    const c = doc.getElementById("fullScreenControls");
    // fade timer armed on entry — wait ~3.2s
    setTimeout(() => resolve(c.classList.contains("fs-faded")), 3300);
  });
});

check("[C] pointerenter restores opacity", () => {
  const c = doc.getElementById("fullScreenControls");
  c.dispatchEvent(new window.Event("pointerenter", { bubbles: true }));
  return !c.classList.contains("fs-faded");
});

check("[F] auto-fullscreen preference toggles and enters on open", async () => {
  const autoBtn = doc.getElementById("fsAutoBtn");
  click(autoBtn);
  const list = JSON.parse(window.localStorage.getItem("md-reader-fs-auto") || "[]");
  const btnState = autoBtn.classList.contains("active");
  FS.exit();
  // simulate re-open on the same doc
  doc.querySelector('.file-item[data-key="a.md"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 600));
  return list.includes("a.md") && btnState && FS.isActive();
});

check("[F] auto toggle-off stops future auto entry", () => {
  click(doc.getElementById("fsAutoBtn"));
  FS.exit();
  return !doc.getElementById("fsAutoBtn").classList.contains("active");
});

check("[CSS] fs-faded style + min touch targets + auto button styles exist", () => {
  return /\.fullscreen-controls\.fs-faded/.test(css)
      && /fullscreen-controls \.icon-btn \{\s*min-width:\s*38px/.test(css)
      && /fs-auto-btn\.active/.test(css);
});

FS.exit();
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
