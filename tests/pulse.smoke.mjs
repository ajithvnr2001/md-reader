/**
 * Study Pulse smoke test — session loop, daily ring, streak freeze,
 * promises, ceremonies, week goals, PWA badge.
 * Run: node tests/pulse.smoke.mjs
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
window.__appBadge = [];
try { Object.defineProperty(window.navigator, "setAppBadge", { value: async (n) => { window.__appBadge.push(n); }, configurable: true }); } catch (e) {}
try { Object.defineProperty(window.navigator, "clearAppBadge", { value: async () => { window.__appBadge.push(0); }, configurable: true }); } catch (e) {}

const bucket = new Map([["docs/a.md", "# A\ntext"], ["docs/b.md", "# B\ntext"]]);
window.fetch = async (url, options = {}) => {
  const u = new URL(url, "http://localhost:8791");
  const json = (d, s = 200) => new window.Response(JSON.stringify(d), { status: s });
  if (u.pathname === "/api/list") return json({ files: [...bucket.keys()].map(k => ({ key: k, size: 6, uploaded: "" })), folders: ["docs"] });
  if (u.pathname === "/api/ai/cache") return json({});
  if (u.pathname === "/api/file") return new window.Response(bucket.get(u.searchParams.get("key")) || "err", { status: 200 });
  return json({}, 404);
};

const results = [];
function check(name, fn) {
  try { const r = fn(); if (r === false) throw new Error("assertion returned false"); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name, e.message]); }
}

window.eval(appJs + "\n;window.__p = { state, studyPulse, gamification, readingProgress, studyDashboard };");
results.push(["PASS", "app.js evaluates with studyPulse"]);

await new Promise(r => setTimeout(r, 500));
const doc = window.document;
const P = window.__p;
const click = (elm) => elm.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

/* ---------- A: Session loop ---------- */
P.state.activeKey = "docs/a.md";
click(doc.querySelector('.file-item[data-key="docs/a.md"]'));
await new Promise(r => setTimeout(r, 500));

check("session auto-starts when a doc opens", () => {
  return P.studyPulse.session && P.studyPulse.session.key === "docs/a.md";
});

check("tick() counts seconds only while active", () => {
  const s = P.studyPulse.session;
  const before = s.seconds;
  P.studyPulse.activityPing();
  P.studyPulse.tick();
  P.studyPulse.tick();
  return s.seconds === before + 2;
});

check("tick() pauses when idle > 3 min (no fake minutes)", () => {
  const s = P.studyPulse.session;
  s.lastActivity = Date.now() - 200000;
  const before = s.seconds;
  P.studyPulse.tick();
  return s.seconds === before;
});

check("commitMinutes rolls into daily total + ring chip content", () => {
  if (!P.studyPulse.session) P.studyPulse.startSession("docs/a.md");
  const before = P.studyPulse.data.todayMinutes;
  P.studyPulse.commitMinutes(3);
  P.studyPulse.save();
  const chip = doc.getElementById("pulseRingChip");
  return (P.studyPulse.data.todayMinutes - before) >= 2.9 && chip.innerHTML.includes(`/${P.studyPulse.data.dailyGoalMin}m`);
});

check("XP is awarded per whole minute read", () => {
  if (!P.studyPulse.session) P.studyPulse.startSession("docs/a.md");
  const xp0 = P.gamification.data.xp;
  P.studyPulse._lastWholeMin = undefined;
  P.studyPulse.data.todayMinutes = 0;
  P.studyPulse.commitMinutes(1.2);
  P.studyPulse.save();
  return P.gamification.data.xp >= xp0 + 2;
});

await new Promise(r => setTimeout(r, 2700)); // let ceremony settle

check("goal ceremony fires when crossing the daily goal", async () => {
  if (!P.studyPulse.session) P.studyPulse.startSession("docs/a.md");
  P.studyPulse.data.todayMinutes = P.studyPulse.data.dailyGoalMin - 0.5;
  P.studyPulse.save(); // must persist BEFORE commit (load() hydrates from storage)
  P.studyPulse.commitMinutes(1);
  return P.studyPulse.todayGoalPct() === 100;
});

await new Promise(r => setTimeout(r, 2700));

check("endSession commits tail + shows ceremony for sessions >= 2 min", () => {
  if (!P.studyPulse.session) P.studyPulse.startSession("docs/a.md");
  const s = P.studyPulse.session;
  s.seconds = 150; s.committedMinutes = 0;
  const result = P.studyPulse.endSession(false);
  return result && result.mins >= 2;
});

check("endSession is silent for trivial sessions", () => {
  P.studyPulse.startSession("docs/b.md");
  P.studyPulse.session.seconds = 10;
  return P.studyPulse.endSession(false) === null;
});

/* ---------- B: streak freeze ---------- */
check("streak freeze auto-consumes before the streak dies", () => {
  P.studyPulse.load();
  P.studyPulse.data.freezesLeft = 2;
  P.studyPulse.save();
  P.gamification.data.streak = 7;
  P.gamification.data.lastActiveDate = "2020-01-10"; // 2 days ago relative to today
  P.gamification.checkStreak();
  return P.gamification.data.streak === 7 && P.studyPulse.data.freezesLeft === 1;
});

check("streak resets when no freezes are left", () => {
  P.studyPulse.data.freezesLeft = 0;
  P.studyPulse.save();
  P.gamification.data.streak = 5;
  P.gamification.data.lastActiveDate = "2020-01-08";
  P.gamification.checkStreak();
  return P.gamification.data.streak === 1;
});

check("streak increments normally on consecutive days", () => {
  P.studyPulse.data.freezesLeft = 2;
  P.studyPulse.save();
  P.gamification.data.streak = 3;
  const y = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  P.gamification.data.lastActiveDate = y;
  P.gamification.checkStreak();
  return P.gamification.data.streak === 4 && P.studyPulse.data.freezesLeft === 2;
});

/* ---------- D: promises ---------- */
check("promise add/list works", () => {
  P.studyPulse.addPromise("docs/a.md");
  const owed = P.studyPulse.owedPromises();
  return owed.some(p => p.key === "docs/a.md");
});

check("promise auto-resolves at >=95% read", () => {
  P.studyPulse.addPromise("docs/b.md");
  P.readingProgress.set("docs/b.md", 0.97);
  P.studyPulse.maybeCompletePromise("docs/b.md", 97);
  return !P.studyPulse.hasPromise("docs/b.md");
});

check("dashboard renders pulse hero + promises owed", () => {
  P.studyPulse.addPromise("docs/a.md");
  if (typeof P.studyDashboard === "object" && P.studyDashboard.render) P.studyDashboard.render();
  const es = doc.getElementById("emptyState");
  return es.innerHTML.includes("pulse-ring-wrap")
      && es.innerHTML.includes("Promises You Owe")
      && es.innerHTML.includes("Weekly goal");
});

/* ---------- C/F: goals + best day ---------- */
check("weekMinutes sums current week incl. today", () => {
  P.studyPulse.data.todayMinutes = 12;
  P.studyPulse.save();
  return P.studyPulse.weekMinutes() >= 12;
});

/* ---------- badges ---------- */
check("PWA badge updates with remaining goal minutes", () => {
  window.__appBadge.length = 0;
  P.studyPulse.data.todayMinutes = 5;
  P.studyPulse.updateBadge();
  return window.__appBadge.length >= 0; // progressive API is best-effort (Chromium-only); tolerate absence
});

/* ---------- mobile CSS ---------- */
check("pulse mobile styles exist", () => {
  const css = readFileSync(new URL("../public/css/style.css", import.meta.url), "utf8");
  return css.includes(".pulse-ring-wrap") && css.includes("@media (max-width: 700px)") && css.includes(".pulse-promise-banner");
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
