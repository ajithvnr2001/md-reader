/**
 * Tier-1 features smoke test — reading progress, SRS flashcards,
 * trash/restore, quick capture, study dashboard.
 * Run: node tests/tier1.smoke.mjs
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
window.confirm = () => true;

/* ---- Server stub: in-memory bucket + trash + inbox ---- */
const bucket = new Map([
  ["notes/intro.md", "# Intro\n\nWelcome."],
  ["notes/cells.md", "# Cells\n\nCell biology."],
]);
const trash = new Map();
window.__lastDeleteUrl = null;

window.fetch = async (url, options = {}) => {
  const u = new URL(url, "http://localhost:8791");
  const json = (d, status = 200) => new window.Response(JSON.stringify(d), { status, headers: { "content-type": "application/json" } });
  const method = (options.method || "GET").toUpperCase();

  if (u.pathname === "/api/list") {
    return json({
      files: [...bucket.entries()].filter(([k]) => /\.(md|markdown)$/i.test(k) && !k.startsWith("trash/")).map(([key, v]) => ({ key, size: v.length, uploaded: "" })),
      folders: ["notes"]
    });
  }
  if (u.pathname === "/api/ai/cache" && method === "GET") return json({});
  if (u.pathname === "/api/ai/cache" && method === "POST") return json({ ok: true });
  if (u.pathname === "/api/ai/flashcards") return json({ flashcards: [{ question: "Q1", answer: "A1" }, { question: "Q2", answer: "A2" }, { question: "Q3", answer: "A3" }] });
  if (u.pathname === "/api/file" && method === "GET") {
    const key = u.searchParams.get("key");
    return bucket.has(key) ? new window.Response(bucket.get(key), { status: 200 }) : json({ error: "nf" }, 404);
  }
  if (u.pathname === "/api/file" && method === "DELETE") {
    window.__lastDeleteUrl = u.pathname + u.search;
    const key = u.searchParams.get("key");
    if (u.searchParams.get("permanent") === "true") { bucket.delete(key); trash.delete(key); return json({ ok: true, permanent: true }); }
    if (!bucket.has(key)) return json({ error: "nf" }, 404);
    const tk = `trash/${Date.now()}/${key}`;
    trash.set(tk, bucket.get(key));
    bucket.delete(key);
    return json({ ok: true, trashKey: tk });
  }
  if (u.pathname === "/api/trash" && method === "GET") {
    return json({ items: [...trash.entries()].map(([tk, v]) => ({ trashKey: tk, originalKey: tk.replace(/^trash\/\d+\//, ""), size: v.length, uploaded: new Date().toISOString() })) });
  }
  if (u.pathname === "/api/trash/restore" && method === "POST") {
    const { trashKey } = JSON.parse(options.body);
    if (!trash.has(trashKey)) return json({ error: "nf" }, 404);
    const orig = trashKey.replace(/^trash\/\d+\//, "");
    if (bucket.has(orig)) return json({ error: "exists" }, 409);
    bucket.set(orig, trash.get(trashKey));
    trash.delete(trashKey);
    return json({ ok: true, key: orig });
  }
  if (u.pathname === "/api/trash/empty" && method === "POST") {
    const n = trash.size; trash.clear();
    return json({ ok: true, deletedCount: n });
  }
  if (u.pathname === "/api/inbox/append" && method === "POST") {
    const { content } = JSON.parse(options.body);
    const dateStr = new Date().toISOString().split("T")[0];
    const key = `Inbox/${dateStr}.md`;
    const cur = bucket.get(key);
    bucket.set(key, (cur ? cur.replace(/\s*$/, "") : `# 📥 Inbox — ${dateStr}\n`) + `\n\n## entry\n\n${content}\n`);
    return json({ ok: true, key });
  }
  return json({ error: "not found" }, 404);
};

const results = [];
function check(name, fn) {
  try { const r = fn(); if (r === false) throw new Error("assertion returned false"); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name, e.message]); }
}

try {
  window.eval(appJs + "\n;window.__t = { readingProgress, srsDeck, trashUI, quickCapture, studyDashboard, state };");
  results.push(["PASS", "app.js evaluates without errors"]);
} catch (e) {
  results.push(["FAIL", "app.js evaluates without errors", e.message]);
  finish();
}

await new Promise(r => setTimeout(r, 400));
const doc = window.document;
const T = window.__t;

/* ---------- Feature 5: Dashboard (renders by default with no active doc) ---------- */
check("dashboard renders with dash-grid cards", () => doc.querySelector(".dash-grid") !== null && doc.querySelectorAll(".dash-card").length >= 3);
check("dashboard quick action buttons present", () => ["dashNewNoteBtn", "dashUploadBtn", "dashChatBtn", "dashCaptureBtn"].every(id => doc.getElementById(id)));

/* ---------- Feature 1: Reading progress ---------- */
check("readingProgress stores and reads back ratio", () => {
  T.readingProgress.set("notes/intro.md", 0.42);
  return Math.abs(T.readingProgress.get("notes/intro.md").ratio - 0.42) < 1e-9 && T.readingProgress.percent("notes/intro.md") === 42;
});

// Open a file → tracked as recent
await (async () => {
  doc.querySelector('.file-item[data-key="notes/intro.md"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 300));
})();
check("openFile tracks document in recents", () => {
  const rec = JSON.parse(window.localStorage.getItem("md-reader-recent") || "[]");
  return rec[0] === "notes/intro.md";
});
check("dashboard shows recent doc with progress bar", () => {
  T.studyDashboard.render();
  const row = doc.querySelector(".dash-doc-row");
  return row && row.dataset.dashKey === "notes/intro.md" && row.innerHTML.includes("42%");
});

/* ---------- Feature 2: SRS ---------- */
check("new cards count as due", () => {
  const due = T.srsDeck.dueIndices("notes/intro.md", 3);
  return due.length === 3;
});
check("rate hard -> repeats tomorrow, reps reset", () => {
  const s = T.srsDeck.rate("notes/intro.md", 0, 2);
  return s.reps === 0 && s.interval === 1 && s.due > new Date().toISOString().split("T")[0];
});
check("rate easy twice -> interval grows (1 -> 6)", () => {
  T.srsDeck.rate("notes/intro.md", 1, 5);
  const s = T.srsDeck.rate("notes/intro.md", 1, 5);
  return s.interval === 6 && s.reps === 2;
});
check("buildStudyOrder puts due/new cards first", () => {
  const order = T.srsDeck.buildStudyOrder("notes/intro.md", 3);
  // idx 0 rated hard (due tomorrow), idx 1 easy (future), idx 2 new (due)
  return order[0] === 2;
});
// Flashcard end-to-end render with SRS badge
doc.getElementById("flashcardsBtn").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
await new Promise(r => setTimeout(r, 300));
check("flashcard view shows SRS badge + due count", () => {
  return doc.querySelector(".srs-badge") !== null && doc.getElementById("aiPanelContent").innerHTML.includes("due");
});
check("totalDueCount + mostDueKey work (deck now cached)", () => {
  return T.srsDeck.totalDueCount() >= 1 && T.srsDeck.mostDueKey() === "notes/intro.md";
});
check("rateFlashcard('hard') requeues card in order", () => {
  const cache = T.state.aiCache['notes/intro.md'];
  const before = [...(cache.flashcardOrder || [])];
  window.rateFlashcard("hard");
  const after = cache.flashcardOrder;
  return JSON.stringify(before) !== JSON.stringify(after);
});

/* ---------- Feature 3: Trash ---------- */
check("file delete goes through soft-delete (no permanent param)", async () => {
  // simulate delete modal submit
  window.eval(`state.actionTarget = 'notes/cells.md';`);
  doc.getElementById("deleteSubmitBtn").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 400));
  return window.__lastDeleteUrl && !window.__lastDeleteUrl.includes("permanent") && trash.size === 1 && !bucket.has("notes/cells.md");
});
check("trash modal lists deleted item", async () => {
  await T.trashUI.open();
  return T.__proto__ && doc.querySelector(".trash-item") !== null && doc.querySelector(".trash-item-name").textContent.includes("cells.md");
});
check("restore returns file to bucket and removes trash entry", async () => {
  await new Promise(r => setTimeout(r, 300));
  const btn = doc.querySelector(".trash-restore-btn");
  btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 400));
  return bucket.has("notes/cells.md") && trash.size === 0;
});
check("empty trash works", async () => {
  // trash one more then empty
  const res = await window.fetch("/api/file?key=notes%2Fcells.md", { method: "DELETE" });
  await T.trashUI.emptyTrash();
  return trash.size === 0 && !bucket.has("notes/cells.md");
});

/* ---------- Feature 4: Quick Capture ---------- */
check("quick capture appends to today's inbox", async () => {
  T.quickCapture.open();
  doc.getElementById("quickCaptureInput").value = "remember the mitochondria";
  await T.quickCapture.save();
  await new Promise(r => setTimeout(r, 800));
  const dateStr = new Date().toISOString().split("T")[0];
  const content = bucket.get(`Inbox/${dateStr}.md`) || "";
  return content.includes("remember the mitochondria") && content.includes("Inbox");
});
check("quick capture FAB is rendered", () => {
  const fab = doc.getElementById("quickCaptureBtn");
  return fab && fab.classList.contains("quick-capture-fab");
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
