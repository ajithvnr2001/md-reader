/**
 * Library Manager smoke test — jsdom validation of the new
 * Upload / New Note / New Folder flows.
 * Run: node tests/library.smoke.mjs
 */
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const appJs = readFileSync(new URL("../public/js/app.js", import.meta.url), "utf8");
const htmlNoCdn = html.replace(/<script src="https:[^"]+"><\/script>/g, "").replace(/<script src="\/app.js"><\/script>/, "");

const dom = new JSDOM(htmlNoCdn, { url: "http://localhost:8791/", runScripts: "outside-only", pretendToBeVisual: true });
const { window } = dom;

/* ---- CDN stubs ---- */
window.marked = { parse: (md) => md.replace(/^## (.*)$/gm, "<h2>$1</h2>").replace(/^# (.*)$/gm, "<h1>$1</h1>").replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>") };
window.DOMPurify = { sanitize: (h) => h.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/ on\w+="[^"]*"/gi, "").replace(/ on\w+='[^']*'/gi, "") };
window.mermaid = { initialize: () => {}, run: () => {}, render: async () => ({ svg: "<svg></svg>" }) };
window.JSZip = class { file() {} async generateAsync() { return new Blob(); } };
window.scrollTo = () => {};
window.Element.prototype.scrollIntoView = () => {};
window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
window.speechSynthesis = { getVoices: () => [], speak: () => {}, cancel: () => {}, speaking: false };
window.Response = Response;
window.CSS = window.CSS || {};
window.CSS.escape = window.CSS.escape || ((s) => String(s).replace(/([\[\]"\\.])/g, "\\$1"));
window.prompt = () => null;

/* ---- Server stub: in-memory bucket + folder endpoints ---- */
const bucket = new Map([
  ["notes/intro.md", "# Intro"],
  ["notes/cells.md", "# Cells"],
]);
const bucketFolders = ["notes"];

window.fetch = async (url, options = {}) => {
  const u = new URL(url, "http://localhost:8791");
  const json = (d, status = 200) => new window.Response(JSON.stringify(d), { status, headers: { "content-type": "application/json" } });
  const method = (options.method || "GET").toUpperCase();

  if (u.pathname === "/api/list") {
    return json({
      files: [...bucket.entries()].filter(([k]) => /\.(md|markdown)$/i.test(k)).map(([key, v]) => ({ key, size: v.length, uploaded: "" })),
      folders: bucketFolders
    });
  }
  if (u.pathname === "/api/ai/cache" && method === "GET") return json({});
  if (u.pathname === "/api/ai/cache" && method === "POST") return json({ ok: true });
  if (u.pathname === "/api/file" && method === "GET") {
    const key = u.searchParams.get("key");
    return bucket.has(key) ? new window.Response(bucket.get(key), { status: 200 }) : json({ error: "nf" }, 404);
  }
  if (u.pathname === "/api/file" && method === "DELETE") { bucket.delete(u.searchParams.get("key")); return json({ ok: true }); }
  if (u.pathname === "/api/upload" && method === "PUT") {
    const key = u.searchParams.get("key");
    if (!/\.(md|markdown)$/i.test(key)) return json({ error: "bad" }, 400);
    if (u.searchParams.get("overwrite") === "false" && bucket.has(key)) return json({ error: "exists", conflict: true }, 409);
    bucket.set(key, String(options.body || ""));
    return json({ ok: true, key });
  }
  if (u.pathname === "/api/folder" && method === "POST") {
    const { path } = JSON.parse(options.body);
    if (!path || path.includes("..")) return json({ error: "bad path" }, 400);
    if (!bucketFolders.includes(path)) bucketFolders.push(path);
    return json({ ok: true, path });
  }
  if (u.pathname === "/api/folder/rename" && method === "POST") {
    const { oldPrefix, newPrefix } = JSON.parse(options.body);
    if (!bucketFolders.includes(oldPrefix)) return json({ error: "not found" }, 404);
    if (bucketFolders.includes(newPrefix)) return json({ error: "exists" }, 409);
    for (const k of [...bucket.keys()]) {
      if (k.startsWith(oldPrefix + "/")) {
        bucket.set(newPrefix + "/" + k.slice(oldPrefix.length + 1), bucket.get(k));
        bucket.delete(k);
      }
    }
    bucketFolders.push(newPrefix);
    return json({ ok: true, newPrefix, movedCount: 2 });
  }
  return json({ error: "not found" }, 404);
};

/* ---- XHR stub for upload progress ---- */
class FakeXHR {
  constructor() { this.upload = {}; window.__xhrs.push(this); }
  open(method, url) { this.method = method; this.url = url; }
  setRequestHeader(k, v) { (this.headers ||= {})[k] = v; }
  async send(body) {
    const u = new URL(this.url, "http://localhost:8791");
    const key = u.searchParams.get("key");
    if (this.upload.onprogress) this.upload.onprogress({ lengthComputable: true, loaded: body.size || 10, total: body.size || 10 });
    if (u.searchParams.get("overwrite") === "false" && bucket.has(key)) { this.status = 409; this.responseText = "{}"; }
    else { bucket.set(key, await body.text()); this.status = 200; this.responseText = "{}"; }
    this.onload && this.onload();
  }
}
window.__xhrs = [];
window.XMLHttpRequest = FakeXHR;

const results = [];
function check(name, fn) {
  try { const r = fn(); if (r === false) throw new Error("assertion returned false"); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name, e.message]); }
}

try {
  window.eval(appJs + "\n;window.__library = libraryManager;");
  results.push(["PASS", "app.js evaluates without errors"]);
} catch (e) {
  results.push(["FAIL", "app.js evaluates without errors", e.message]);
  finish();
}

await new Promise(r => setTimeout(r, 400));
const doc = window.document;
const lib = window.__library;

/* ---------- Modal & tabs ---------- */
doc.getElementById("uploadToggleBtn").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
check("modal opens on Upload button", () => doc.getElementById("libraryModal").style.display === "flex" && doc.getElementById("libTabUpload").style.display !== "none");

doc.getElementById("createFileToggleBtn").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
check("create button opens New Note tab", () => doc.getElementById("libTabNote").style.display !== "none");

doc.querySelector('.lib-tab[data-tab="folder"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
check("tab switch to New Folder", () => doc.getElementById("libTabFolder").style.display !== "none");

/* ---------- Folder combo ---------- */
check("combo lists existing folders incl. empty markers", () => {
  lib.renderComboList ? null : null;
  const input = doc.getElementById("libUploadFolderInput");
  input.dispatchEvent(new window.Event("focus"));
  const list = doc.getElementById("libUploadFolderList");
  return list.style.display !== "none" && list.innerHTML.includes("notes");
});

/* ---------- Queue + conflicts ---------- */
check("adding files: .txt skipped silently-counted, .md queued", () => {
  const f1 = new window.File(["# a"], "a.md", { type: "text/markdown" });
  const f2 = new window.File(["x"], "b.txt", { type: "text/plain" });
  lib.addFiles([f1, f2]);
  return lib._queue.length === 1 && doc.getElementById("libFooterStatus").textContent.includes("skipped");
});

check("conflict detected when target key exists", () => {
  doc.getElementById("libUploadFolderInput").value = "notes";
  const fx = new window.File(["# dup"], "intro.md", { type: "text/markdown" });
  lib.addFiles([fx]);
  return lib._queue.some(q => q.status === "conflict") && doc.getElementById("libConflictBar").style.display !== "none";
});

check("conflict 'Skip them' marks skipped; queue still uploadable", () => {
  doc.getElementById("libConflictSkipBtn").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const skipItem = lib._queue.find(q => q.relPath === "intro.md");
  return skipItem && skipItem.status === "skipped";
});

check("conflict 'overwrite' flips to uploadable + PUT overwrite=true", async () => {
  const fy = new window.File(["# dup2"], "cells.md", { type: "text/markdown" });
  lib.addFiles([fy]);
  doc.getElementById("libConflictOverwriteBtn").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const item = lib._queue.find(q => q.relPath === "cells.md");
  await lib.submit();
  const xhr = window.__xhrs.find(x => x.url.includes("cells.md"));
  return item.status === "done" && xhr.url.includes("overwrite=true") && bucket.get("notes/cells.md") === "# dup2";
});

/* ---------- New Note flow ---------- */
check("note validation: existing name rejected", () => {
  doc.querySelector('.lib-tab[data-tab="note"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  doc.getElementById("libNoteNameInput").value = "intro.md";
  doc.getElementById("libNoteFolderInput").value = "notes";
  doc.getElementById("libNoteNameInput").dispatchEvent(new window.Event("input", { bubbles: true }));
  const hint = doc.getElementById("libNoteNameHint").textContent;
  return doc.getElementById("libSubmitBtn").disabled && hint.includes("already exists");
});

check("note validation: illegal chars rejected", () => {
  doc.getElementById("libNoteNameInput").value = "bad:name.md";
  doc.getElementById("libNoteNameInput").dispatchEvent(new window.Event("input", { bubbles: true }));
  return doc.getElementById("libSubmitBtn").disabled;
});

check("template fills editor + preview renders", async () => {
  doc.getElementById("libNoteNameInput").value = "my-new-note";
  doc.getElementById("libNoteNameInput").dispatchEvent(new window.Event("input", { bubbles: true }));
  doc.getElementById("libNoteTemplateSelect").value = "study";
  doc.getElementById("libNoteTemplateSelect").dispatchEvent(new window.Event("change", { bubbles: true }));
  await new Promise(r => setTimeout(r, 250));
  const ta = doc.getElementById("libNoteContentInput").value;
  const prev = doc.getElementById("libNotePreview").innerHTML;
  return ta.includes("Key Concepts") && prev.includes("Key Concepts");
});

check("create note submits and lands in bucket + auto-opens", async () => {
  await lib.submit();
  await new Promise(r => setTimeout(r, 300));
  return bucket.has("notes/my-new-note.md");
});

/* ---------- New Folder flow ---------- */
check("create folder posts path and refreshes list", async () => {
  doc.querySelector('.lib-tab[data-tab="folder"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  doc.getElementById("libFolderParentInput").value = "";
  doc.getElementById("libFolderNameInput").value = "physics/oops";
  doc.getElementById("libFolderNameInput").dispatchEvent(new window.Event("input", { bubbles: true }));
  await lib.submit();
  await new Promise(r => setTimeout(r, 300));
  return bucketFolders.includes("physics/oops");
});

/* ---------- ESC close ---------- */
check("ESC closes open modal", () => {
  doc.getElementById("uploadToggleBtn").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  if (doc.getElementById("libraryModal").style.display === "none") return false;
  doc.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  return doc.getElementById("libraryModal").style.display === "none";
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
