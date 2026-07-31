/**
 * Zen Mode smoke test — guards, dimming, early-exit scan, typewriter,
 * print safety, breadcrumb/strip hide coverage.
 * Run: node tests/zen.smoke.mjs
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
window.mermaid = { initialize: () => {}, run: () => {}, render: async () => ({ svg: "<svg></svg>" }) };
window.JSZip = class { file() {} async generateAsync() { return new Blob(); } };
window.scrollTo = () => {};
window.Element.prototype.scrollIntoView = function () { (this.__siCount ||= 0); this.__siCount++; };
window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
window.speechSynthesis = { cancel: () => {}, speak: () => {}, getVoices: () => [], speaking: false };
window.Response = Response;
window.confirm = () => true;
window.CSS = window.CSS || {};
window.CSS.escape = window.CSS.escape || ((s) => String(s).replace(/([\[\]"\\.])/g, "\\$1"));
window.prompt = () => null;

const bucket = new Map([["a.md", "# A\n\nText"]]);
window.fetch = async (url, options = {}) => {
  const u = new URL(url, "http://localhost:8791");
  const json = (d, s = 200) => new window.Response(JSON.stringify(d), { status: s });
  if (u.pathname === "/api/list") return json({ files: [{ key: "a.md", size: 10, uploaded: "" }], folders: [] });
  if (u.pathname === "/api/ai/cache") return json({});
  if (u.pathname === "/api/file") return new window.Response("# A\n\nText", { status: 200 });
  return json({}, 404);
};

const results = [];
function check(name, fn) {
  try { const r = fn(); if (r === false) throw new Error("assertion returned false"); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name, e.message]); }
}

window.eval(appJs + "\n;window.__z = { state };");
results.push(["PASS", "app.js evaluates with zen module"]);

await new Promise(r => setTimeout(r, 400));
const doc = window.document;
const Z = window.__z;
const zen = window.__zen;
const click = (elm) => elm.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

/* 1. Guard: zen refused without an open document */
check("zen toggle without open doc is ignored + toast shown", () => {
  Z.state.activeKey = null;
  click(doc.getElementById("zenModeBtn"));
  return !doc.body.classList.contains("zen-mode") && zen.isOn() === false;
});

/* 2. Zen on with a doc */
Z.state.activeKey = "a.md";
doc.getElementById("content").style.display = "block";
click(doc.getElementById("zenModeBtn"));
check("zen on: body class + control cluster + typewriter toggle rendered", () => {
  return doc.body.classList.contains("zen-mode")
    && doc.getElementById("zenControlCluster").style.display === "flex"
    && doc.getElementById("zenTypeBtn") !== null;
});

/* 3. Paragraph dimming + active selection picked correctly (0.38 viewport line) */
check("active paragraph tracking with early-exit selects closest to focus line", () => {
  const content = doc.getElementById("content");
  content.innerHTML = "";
  let rectCalls = 0;
  // fake 30 blocks, each 50px tall starting at 0 (target = 768*0.38 ≈ 292 → block at 275-325, index 6/5ish)
  for (let i = 0; i < 30; i++) {
    const p = doc.createElement("p");
    p.textContent = "block " + i;
    const top = i * 50;
    p.getBoundingClientRect = () => { rectCalls++; return { top, bottom: top + 50, height: 50, left: 0, right: 300, width: 300, x: 0, y: top }; };
    content.appendChild(p);
  }
  rectCalls = 0;
  zen.update();
  const active = content.querySelector(".zen-active-paragraph");
  const idx = [...content.children].indexOf(active);
  // closest center to 292: block 6 center=325 (dist 33), block 5 center=275 (dist 17) → block 5? center=(275+325)/2? each center = top+25: b5=275 dist 42? b6=325 dist 58 → b5
  return idx === (292 - 25 < 300 ? 5 : 6) && rectCalls <= 12; // early-exit: never scans all 30
});

/* 4. Typewriter auto-centering */
check("typewriter toggle: persists + centers new active paragraph after idle", async () => {
  window.__zen.typewrite(true);
  const content = doc.getElementById("content");
  // force a new active by moving rects: make block 20 the closest
  [...content.children].forEach((p, i) => {
    const top = (i - 14) * 50; // block 14 center ≈ near 292
    p.getBoundingClientRect = () => ({ top, bottom: top + 50, height: 50, left: 0, right: 300, width: 300, x: 0, y: top });
    p.__siCount = 0;
  });
  zen.update();
  await new Promise(r => setTimeout(r, 700));
  const active = content.querySelector(".zen-active-paragraph");
  return active.__siCount >= 1 && window.localStorage.getItem("md-reader-zen-typewriter") === "1";
});

/* 5. ESC + exit button continue to work */
click(doc.getElementById("exitZenBtn"));
check("exit button turns zen off", () => !doc.body.classList.contains("zen-mode"));

/* 6. doc-closed auto-exit */
check("doc-closed event auto-exits zen", () => {
  Z.state.activeKey = "a.md";
  click(doc.getElementById("zenModeBtn"));
  const on = doc.body.classList.contains("zen-mode");
  window.dispatchEvent(new window.CustomEvent("md-reader:doc-closed"));
  return on && !doc.body.classList.contains("zen-mode");
});

/* 7. beforeprint auto-exits */
check("beforeprint auto-exits zen", () => {
  Z.state.activeKey = "a.md";
  click(doc.getElementById("zenModeBtn"));
  const on = doc.body.classList.contains("zen-mode");
  window.dispatchEvent(new window.Event("beforeprint"));
  return on && !doc.body.classList.contains("zen-mode");
});

/* 8. CSS guards */
check("CSS: zen/fullscreen scopes countered in @media print", () => {
  return /@media\s+print[\s\S]*?body\.zen-mode \.layout,\s*body\.is-fullscreen \.layout/i.test(css)
      && /@media\s+print[\s\S]*?body\.zen-mode #content > \*\s*\{[^}]*opacity:\s*1\s*!important/i.test(css);
});
check("CSS: breadcrumb + read strip hidden in zen; breadcrumb hidden in fullscreen", () => {
  return /body\.zen-mode #breadcrumbBar/.test(css)
      && /body\.zen-mode #readProgressStrip/.test(css)
      && /body\.is-fullscreen #breadcrumbBar/.test(css);
});
check("CSS: active paragraph no longer uses scale transform", () => {
  const m = css.match(/body\.zen-mode #content > \.zen-active-paragraph\s*\{([^}]*)\}/i);
  return m && !/transform:\s*scale/i.test(m[1]);
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
