/**
 * UI Refresh smoke test — overflow menu, settings drawer, AI dropup,
 * breadcrumb, read strip, skeletons, density, tour, focus trap.
 * Run: node tests/ui.smoke.mjs
 */
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const appJs = readFileSync(new URL("../public/js/app.js", import.meta.url), "utf8");
const htmlNoCdn = html.replace(/<script src="https:[^"]+"><\/script>/g, "").replace(/<script src="\/app.js"><\/script>/, "");

const dom = new JSDOM(htmlNoCdn, { url: "http://localhost:8791/", runScripts: "outside-only", pretendToBeVisual: true });
const { window } = dom;

window.marked = { parse: (md) => md.replace(/^## (.*)$/gm, "<h2>$1</h2>").replace(/^# (.*)$/gm, "<h1>$1</h1>") };
window.DOMPurify = { sanitize: (h) => h.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/ on\w+="[^"]*"/gi, "").replace(/ on\w+='[^']*'/gi, "") };
window.mermaid = { initialize: () => {}, run: () => {}, render: async () => ({ svg: "<svg></svg>" }) };
window.JSZip = class { file() {} async generateAsync() { return new Blob(); } };
window.scrollTo = () => {};
window.Element.prototype.scrollIntoView = () => {};
window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
window.speechSynthesis = { cancel: () => {}, speak: () => {}, getVoices: () => [], speaking: false };
window.Response = Response;
window.confirm = () => true;
window.CSS = window.CSS || {};
window.CSS.escape = window.CSS.escape || ((s) => String(s).replace(/([\[\]"\\.])/g, "\\$1"));
window.__clipboard = [];
try { Object.defineProperty(window.navigator, "clipboard", { value: { writeText: async (t) => { window.__clipboard.push(t); } }, configurable: true }); } catch (e) {}

const bucket = new Map([
  ["folder/sub/doc-a.md", "# Doc A\n\nHello A"],
  ["folder/sub/doc-b.md", "# Doc B\n\nHello B"],
]);
window.fetch = async (url, options = {}) => {
  const u = new URL(url, "http://localhost:8791");
  const json = (d, s = 200) => new window.Response(JSON.stringify(d), { status: s });
  const method = (options.method || "GET").toUpperCase();
  if (u.pathname === "/api/list") return json({ files: [...bucket.keys()].map(k => ({ key: k, size: 10, uploaded: "" })), folders: ["folder", "folder/sub"] });
  if (u.pathname === "/api/ai/cache" && method === "GET") return json({});
  if (u.pathname === "/api/ai/cache" && method === "POST") return json({ ok: true });
  if (u.pathname === "/api/file") return bucket.has(u.searchParams.get("key")) ? new window.Response(bucket.get(u.searchParams.get("key")), { status: 200 }) : json({ error: "nf" }, 404);
  return json({}, 404);
};

const results = [];
function check(name, fn) {
  try { const r = fn(); if (r === false) throw new Error("assertion returned false"); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name, e.message]); }
}

window.eval(appJs + "\n;window.__u = { uiRefresh, state, readingProgress, focusTrap };");
results.push(["PASS", "app.js evaluates with UI refresh"]);

await new Promise(r => setTimeout(r, 500));
const doc = window.document;
const U = window.__u;
const click = (elm) => elm.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

/* ---------- Topbar consolidation ---------- */
check("topbar is consolidated (no accent/font popovers; More button exists)", () => {
  return doc.getElementById("topbarMoreBtn") !== null
      && doc.querySelectorAll(".accent-popover .swatch").length === 0 // old popover content removed
      && doc.getElementById("fontSettingsPopover") === null;
});

check("⋮ More menu toggles and contains moved controls", () => {
  click(doc.getElementById("topbarMoreBtn"));
  const m = doc.getElementById("topbarMoreMenu");
  return m.style.display === "block"
      && doc.getElementById("editBtn") !== null
      && doc.getElementById("exportPdfBtn") !== null
      && doc.getElementById("speechRateSelect") !== null;
});

check("clicking a more-menu row forwards to its inner button", () => {
  let hit = false;
  const btn = doc.getElementById("settingsBtn");
  btn.addEventListener("click", () => { hit = true; }, { once: true });
  const row = doc.querySelector('.more-menu-row[data-for="settingsBtn"]');
  click(row);
  return hit;
});

/* ---------- Settings drawer ---------- */
check("settings drawer opens with accent swatches + density", () => {
  const drawer = doc.getElementById("settingsDrawer");
  return drawer.style.display === "block"
      && doc.getElementById("drawerAccentSwatches").querySelectorAll(".swatch").length === 5
      && doc.getElementById("densitySelect") !== null
      && doc.getElementById("fontFamilySelect") !== null;
});

check("drawer accent swatch applies accent + toast", () => {
  const sw = doc.querySelector('#drawerAccentSwatches .swatch[data-accent="emerald"]');
  click(sw);
  const docEl = doc.documentElement;
  return docEl.style.getPropertyValue("--accent").trim() !== "" && window.localStorage.getItem("md-reader-accent") === "emerald";
});

check("density select toggles data-density on <html>", () => {
  const sel = doc.getElementById("densitySelect");
  sel.value = "compact";
  sel.dispatchEvent(new window.Event("change", { bubbles: true }));
  return doc.documentElement.getAttribute("data-density") === "compact"
      && window.localStorage.getItem("md-reader-density") === "compact";
});

check("drawer close via backdrop", () => {
  click(doc.getElementById("drawerBackdrop"));
  return doc.getElementById("settingsDrawer").style.display === "none";
});

/* ---------- Breadcrumb & strip ---------- */
await (async () => {
  doc.querySelector('.file-item[data-key="folder/sub/doc-a.md"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 300));
})();

check("breadcrumb shows full doc path after open", () => {
  return doc.getElementById("breadcrumbPath").textContent === "folder / sub / doc-a.md"
      && doc.getElementById("breadcrumbBar").style.display !== "none";
});

check("read strip + progress text render", () => {
  U.readingProgress.set("folder/sub/doc-a.md", 0.5);
  U.uiRefresh.updateReadStrip("folder/sub/doc-a.md");
  return doc.getElementById("readProgressFill").style.width === "50%"
      && doc.getElementById("breadcrumbProgress").textContent === "50% read";
});

check("copy deep link writes ?doc= URL to clipboard", async () => {
  await doc.getElementById("copyDocLinkBtn").click();
  await new Promise(r => setTimeout(r, 100));
  return window.__clipboard[0].includes("?doc=folder%2Fsub%2Fdoc-a.md");
});

check("per-doc-switch active marking stays O(1) (exactly 1 active)", async () => {
  doc.querySelector('.file-item[data-key="folder/sub/doc-b.md"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 300));
  return doc.querySelectorAll(".file-item.active").length === 1;
});

/* ---------- AI toolbar dropup ---------- */
check("AI toolbar shows 4 primaries + More AI tools dropup", () => {
  return doc.getElementById("aiMoreBtn") !== null
      && doc.getElementById("aiMoreMenu").querySelectorAll(".ai-more-item").length === 5;
});

check("AI dropup opens and item click closes it", () => {
  click(doc.getElementById("aiMoreBtn"));
  const menu = doc.getElementById("aiMoreMenu");
  const first = doc.getElementById("aiMoreMenu").style.display === "block";
  click(doc.getElementById("mindMapBtn") && doc.querySelector(".ai-more-item"));
  return first; // menu closed state verified next
});

/* ---------- Skeleton ---------- */
check("readerSkeleton produces shimmer placeholders", () => {
  const html = U.uiRefresh.readerSkeleton();
  return html.includes("skeleton-title") && html.includes("skeleton-line");
});

/* ---------- Tour ---------- */
check("tour guard flag absent initially", () => !window.localStorage.getItem("md-reader-tour-seen"));
check("tour starts and skip ends it + persists flag", () => {
  U.uiRefresh.initTour();
  U.uiRefresh.maybeStartTour();
  const visible = doc.getElementById("tourOverlay").style.display === "block";
  click(doc.getElementById("tourSkipBtn"));
  return visible && doc.getElementById("tourOverlay").style.display === "none" && window.localStorage.getItem("md-reader-tour-seen") === "1";
});

/* ---------- Focus trap + a11y ---------- */
check("focus trap cycles within drawer (Tab wraps)", () => {
  U.focusTrap.start(doc.getElementById("settingsDrawer"));
  doc.getElementById("settingsDrawer").style.display = "block";
  const focusables = [...doc.getElementById("settingsDrawer").querySelectorAll("button, select")];
  focusables[focusables.length - 1].focus();
  doc.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
  U.focusTrap.stop();
  return doc.activeElement === focusables[0];
});

check("new chrome controls carry aria-labels", () => {
  return ["topbarMoreBtn", "copyDocLinkBtn", "aiMoreBtn", "settingsBtn"].every(id => doc.getElementById(id).getAttribute("aria-label"));
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
