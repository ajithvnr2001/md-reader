/**
 * MD Reader — frontend logic
 */

/* ---------------- State ---------------- */
const state = {
  files: [], // Array of { key, size, uploaded }
  folders: [], // Array of folder paths (from /api/list, incl. empty folders)
  activeKey: localStorage.getItem("md-reader-active-key"),
  fontScale: 1,
  theme: localStorage.getItem("md-reader-theme") || "night",
  pinnedKeys: JSON.parse(localStorage.getItem("md-reader-pins") || "[]"),
  contextMenuTarget: null, // The key of the file right-clicked
  actionTarget: null, // Key of the file currently being acted upon (rename/move/delete)
  chatHistory: [], // Array of { role, parts }
  aiCache: JSON.parse(localStorage.getItem("md-reader-ai-cache") || "{}"),
  isGeneralChatActive: false, // Flag indicating if general chat is active
  activeAccent: localStorage.getItem("md-reader-accent") || "indigo",
  speechRate: parseFloat(localStorage.getItem("md-reader-speech-rate") || "1"),
  isEditingUnlocked: false,
  synthesisMode: false,
  selectedKeys: new Set(),
  activeFont: localStorage.getItem("md-reader-font-family") || "inter",
  lineHeight: localStorage.getItem("md-reader-line-height") || "1.6",
  activePane: "primary",
  secondaryKey: null,
  selectedModel: localStorage.getItem("md-reader-ai-model") || "gemini-3.5-flash-lite",
};

/* ---------------- Security & network helpers ---------------- */
/** Escape a string for safe insertion into HTML (text or double-quoted attribute). */
function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

/** Escape a value so it can be embedded as a JS string literal inside an HTML event-handler attribute. */
function jsStringArg(str) {
  return escapeHtml(JSON.stringify(String(str ?? "")));
}

/** Parse markdown and sanitize the resulting HTML before it touches the DOM. */
function renderMd(markdownText) {
  const raw = marked.parse(markdownText || "");
  return window.DOMPurify ? DOMPurify.sanitize(raw) : raw;
}

/**
 * fetch() wrapper that attaches the X-Auth-Key header (when the user has one stored)
 * and prompts for it once if the server answers 401.
 */
async function authFetch(url, options = {}, _retried = false) {
  const storedKey = localStorage.getItem("md-reader-auth-key");
  const headers = { ...(options.headers || {}) };
  if (storedKey) headers["X-Auth-Key"] = storedKey;

  const res = await fetch(url, { ...options, headers });
  if (res.status === 401 && !_retried) {
    const entered = prompt("This workspace is protected. Please enter the auth key:");
    if (entered) {
      localStorage.setItem("md-reader-auth-key", entered);
      return authFetch(url, options, true);
    }
  }
  if (res.status === 401 && _retried) {
    localStorage.removeItem("md-reader-auth-key");
    alert("The auth key was rejected. It has been cleared — try again.");
  }
  return res;
}

/* ---------------- AI cache (local + debounced remote sync) ---------------- */
let aiCacheSyncTimer = null;
function saveAiCache() {
  localStorage.setItem("md-reader-ai-cache", JSON.stringify(state.aiCache));

  // Debounced background remote save to sync across devices (avoids an R2 write per keystroke)
  clearTimeout(aiCacheSyncTimer);
  aiCacheSyncTimer = setTimeout(() => {
    authFetch("/api/ai/cache", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(state.aiCache)
    }).catch((err) => console.error("Failed to sync AI cache remotely:", err));
  }, 1500);
}

/* ---------------- DOM refs ---------------- */
const el = {
  sidebar: document.getElementById("sidebar"),
  sidebarOverlay: document.getElementById("sidebarOverlay"),
  fileList: document.getElementById("fileList"),
  searchInput: document.getElementById("searchInput"),
  content: document.getElementById("content"),
  emptyState: document.getElementById("emptyState"),
  aiToolbar: document.getElementById("aiToolbar"),
  aiPanel: document.getElementById("aiPanel"),
  aiPanelTitle: document.getElementById("aiPanelTitle"),
  aiPanelBody: document.getElementById("aiPanelBody"),
  aiPanelContent: document.getElementById("aiPanelContent"),
  aiSpinner: document.getElementById("aiSpinner"),
  menuBtn: document.getElementById("menuBtn"),
  themeBtn: document.getElementById("themeBtn"),
  themePopover: document.getElementById("themePopover"),
  // More-tools menu / Settings drawer refs
  topbarMoreBtn: document.getElementById("topbarMoreBtn"),
  topbarMoreMenu: document.getElementById("topbarMoreMenu"),
  settingsBtn: document.getElementById("settingsBtn"),
  settingsDrawer: document.getElementById("settingsDrawer"),
  settingsDrawerClose: document.getElementById("settingsDrawerClose"),
  drawerBackdrop: document.getElementById("drawerBackdrop"),
  drawerAccentSwatches: document.getElementById("drawerAccentSwatches"),
  densitySelect: document.getElementById("densitySelect"),
  aiMoreBtn: document.getElementById("aiMoreBtn"),
  aiMoreMenu: document.getElementById("aiMoreMenu"),
  breadcrumbBar: document.getElementById("breadcrumbBar"),
  breadcrumbPath: document.getElementById("breadcrumbPath"),
  copyDocLinkBtn: document.getElementById("copyDocLinkBtn"),
  breadcrumbProgress: document.getElementById("breadcrumbProgress"),
  readProgressStrip: document.getElementById("readProgressStrip"),
  readProgressFill: document.getElementById("readProgressFill"),
  tourOverlay: document.getElementById("tourOverlay"),
  tourBubbleText: document.getElementById("tourBubbleText"),
  tourSkipBtn: document.getElementById("tourSkipBtn"),
  tourNextBtn: document.getElementById("tourNextBtn"),
  fontUpBtn: document.getElementById("fontUpBtn"),
  fontDownBtn: document.getElementById("fontDownBtn"),
  summarizeBtn: document.getElementById("summarizeBtn"),
  explainBtn: document.getElementById("explainBtn"),
  quizBtn: document.getElementById("quizBtn"),
  flashcardsBtn: document.getElementById("flashcardsBtn"),
  aiPanelClose: document.getElementById("aiPanelClose"),
  aiPanelResizeHandle: document.getElementById("aiPanelResizeHandle"),
  aiPanelExpandBtn: document.getElementById("aiPanelExpandBtn"),
  retryAiBtn: document.getElementById("retryAiBtn"),
  zenModeBtn: document.getElementById("zenModeBtn"),
  fullScreenBtn: document.getElementById("fullScreenBtn"),
  fullScreenControls: document.getElementById("fullScreenControls"),
  topbarAiModelSelect: document.getElementById("topbarAiModelSelect"),
  panelAiModelSelect: document.getElementById("panelAiModelSelect"),
  fsZoomInBtn: document.getElementById("fsZoomInBtn"),
  fsZoomOutBtn: document.getElementById("fsZoomOutBtn"),
  fsZoomLevelText: document.getElementById("fsZoomLevelText"),
  fsExitBtn: document.getElementById("fsExitBtn"),
  sidebarExpandBtn: document.getElementById("sidebarExpandBtn"),
  sidebarResizeHandle: document.getElementById("sidebarResizeHandle"),

  // Trash & Quick Capture refs
  trashBtn: document.getElementById("trashBtn"),
  trashModal: document.getElementById("trashModal"),
  trashModalClose: document.getElementById("trashModalClose"),
  trashList: document.getElementById("trashList"),
  trashEmptyBtn: document.getElementById("trashEmptyBtn"),
  trashFooterStatus: document.getElementById("trashFooterStatus"),
  quickCaptureBtn: document.getElementById("quickCaptureBtn"),
  quickCaptureModal: document.getElementById("quickCaptureModal"),
  quickCaptureModalClose: document.getElementById("quickCaptureModalClose"),
  quickCaptureInput: document.getElementById("quickCaptureInput"),
  quickCaptureSubmitBtn: document.getElementById("quickCaptureSubmitBtn"),
  quickCaptureStatus: document.getElementById("quickCaptureStatus"),
  quickCaptureTarget: document.getElementById("quickCaptureTarget"),

  // Glossary Hub refs
  glossaryHubBtn: document.getElementById("glossaryHubBtn"),
  glossaryHubModal: document.getElementById("glossaryHubModal"),
  glossaryHubModalClose: document.getElementById("glossaryHubModalClose"),
  glossaryHubSearch: document.getElementById("glossaryHubSearch"),
  glossaryHubList: document.getElementById("glossaryHubList"),
  glossaryHubStats: document.getElementById("glossaryHubStats"),
  
  // Library Manager refs
  uploadToggleBtn: document.getElementById("uploadToggleBtn"),
  libraryModal: document.getElementById("libraryModal"),
  libraryModalClose: document.getElementById("libraryModalClose"),
  libTabUpload: document.getElementById("libTabUpload"),
  libTabNote: document.getElementById("libTabNote"),
  libTabFolder: document.getElementById("libTabFolder"),
  libUploadFolderInput: document.getElementById("libUploadFolderInput"),
  libUploadFolderList: document.getElementById("libUploadFolderList"),
  libDropZone: document.getElementById("libDropZone"),
  libFileInput: document.getElementById("libFileInput"),
  libFolderInput: document.getElementById("libFolderInput"),
  libUploadQueue: document.getElementById("libUploadQueue"),
  libConflictBar: document.getElementById("libConflictBar"),
  libConflictText: document.getElementById("libConflictText"),
  libConflictSkipBtn: document.getElementById("libConflictSkipBtn"),
  libConflictOverwriteBtn: document.getElementById("libConflictOverwriteBtn"),
  libNoteNameInput: document.getElementById("libNoteNameInput"),
  libNoteNameHint: document.getElementById("libNoteNameHint"),
  libNoteFolderInput: document.getElementById("libNoteFolderInput"),
  libNoteFolderList: document.getElementById("libNoteFolderList"),
  libNoteTemplateSelect: document.getElementById("libNoteTemplateSelect"),
  libNoteContentInput: document.getElementById("libNoteContentInput"),
  libNotePreview: document.getElementById("libNotePreview"),
  libFolderParentInput: document.getElementById("libFolderParentInput"),
  libFolderParentList: document.getElementById("libFolderParentList"),
  libFolderNameInput: document.getElementById("libFolderNameInput"),
  libFolderNameHint: document.getElementById("libFolderNameHint"),
  libFooterStatus: document.getElementById("libFooterStatus"),
  libSubmitBtn: document.getElementById("libSubmitBtn"),

  // Context Menu & File Management refs
  contextMenu: document.getElementById("contextMenu"),
  cmPinBtn: document.getElementById("cmPinBtn"),
  cmRenameBtn: document.getElementById("cmRenameBtn"),
  cmMoveBtn: document.getElementById("cmMoveBtn"),
  cmDeleteBtn: document.getElementById("cmDeleteBtn"),
  
  renameModal: document.getElementById("renameModal"),
  renameModalClose: document.getElementById("renameModalClose"),
  renameInput: document.getElementById("renameInput"),
  renameSubmitBtn: document.getElementById("renameSubmitBtn"),
  
  moveModal: document.getElementById("moveModal"),
  moveModalClose: document.getElementById("moveModalClose"),
  moveFolderInput: document.getElementById("moveFolderInput"),
  moveSubmitBtn: document.getElementById("moveSubmitBtn"),
  
  deleteModal: document.getElementById("deleteModal"),
  deleteModalClose: document.getElementById("deleteModalClose"),
  deleteFileName: document.getElementById("deleteFileName"),
  deleteCancelBtn: document.getElementById("deleteCancelBtn"),
  deleteSubmitBtn: document.getElementById("deleteSubmitBtn"),

  // Folder management refs
  deleteFolderModal: document.getElementById("deleteFolderModal"),
  deleteFolderModalClose: document.getElementById("deleteFolderModalClose"),
  deleteFolderNameText: document.getElementById("deleteFolderNameText"),
  deleteFolderCancelBtn: document.getElementById("deleteFolderCancelBtn"),
  deleteFolderSubmitBtn: document.getElementById("deleteFolderSubmitBtn"),
  cmDeleteFolderBtn: document.getElementById("cmDeleteFolderBtn"),
  cmNewNoteHereBtn: document.getElementById("cmNewNoteHereBtn"),
  cmNewFolderHereBtn: document.getElementById("cmNewFolderHereBtn"),
  cmRenameFolderBtn: document.getElementById("cmRenameFolderBtn"),

  // Download refs
  cmDownloadBtn: document.getElementById("cmDownloadBtn"),
  cmDownloadFolderBtn: document.getElementById("cmDownloadFolderBtn"),
  cmDownloadDivider: document.getElementById("cmDownloadDivider"),

  // Chat refs
  chatInputArea: document.getElementById("chatInputArea"),
  chatInput: document.getElementById("chatInput"),
  chatSendBtn: document.getElementById("chatSendBtn"),
  sidebarGeneralChatBtn: document.getElementById("sidebarGeneralChatBtn"),
  emptyStateChatBtn: document.getElementById("emptyStateChatBtn"),
  clearChatBtn: document.getElementById("clearChatBtn"),

  // Create File ref (opens the Library Manager on the New Note tab)
  createFileToggleBtn: document.getElementById("createFileToggleBtn"),

  // Document Search refs
  searchDocContainer: document.getElementById("searchDocContainer"),
  searchDocInput: document.getElementById("searchDocInput"),
  searchDocPrev: document.getElementById("searchDocPrev"),
  searchDocNext: document.getElementById("searchDocNext"),
  searchDocStatus: document.getElementById("searchDocStatus"),
  searchDocToggleBtn: document.getElementById("searchDocToggleBtn"),

  // Read Aloud ref
  readAloudBtn: document.getElementById("readAloudBtn"),

  // TOC refs
  tocPanel: document.getElementById("tocPanel"),
  tocToggleBtn: document.getElementById("tocToggleBtn"),
  tocList: document.getElementById("tocList"),

  // Export ref
  exportAiBtn: document.getElementById("exportAiBtn"),

  // Accent, Speech rate, Editor and Stats refs
  speechRateSelect: document.getElementById("speechRateSelect"),
  editBtn: document.getElementById("editBtn"),
  readingStatsBar: document.getElementById("readingStatsBar"),
  wordCountText: document.getElementById("wordCountText"),
  readingTimeText: document.getElementById("readingTimeText"),
  editorContainer: document.getElementById("editorContainer"),
  saveStatus: document.getElementById("saveStatus"),
  saveBtn: document.getElementById("saveBtn"),
  cancelEditBtn: document.getElementById("cancelEditBtn"),
  editorTextarea: document.getElementById("editorTextarea"),

  // Advanced Features refs
  exportPdfBtn: document.getElementById("exportPdfBtn"),
  exportHtmlBtn: document.getElementById("exportHtmlBtn"),
  synthesisModeBtn: document.getElementById("synthesisModeBtn"),
  synthesisActionBar: document.getElementById("synthesisActionBar"),
  synthesisSelectedCount: document.getElementById("synthesisSelectedCount"),
  synthesisSubmitBtn: document.getElementById("synthesisSubmitBtn"),
  mindMapBtn: document.getElementById("mindMapBtn"),
  mindMapModal: document.getElementById("mindMapModal"),
  mindMapModalClose: document.getElementById("mindMapModalClose"),
  mindMapSpinner: document.getElementById("mindMapSpinner"),
  mindMapContainer: document.getElementById("mindMapContainer"),
  mindMapZoomIn: document.getElementById("mindMapZoomIn"),
  mindMapZoomOut: document.getElementById("mindMapZoomOut"),
  mindMapZoomReset: document.getElementById("mindMapZoomReset"),
  mindMapZoomLevel: document.getElementById("mindMapZoomLevel"),
  mindMapExportSvg: document.getElementById("mindMapExportSvg"),
  mindMapExportPng: document.getElementById("mindMapExportPng"),
  mindMapLayoutTd: document.getElementById("mindMapLayoutTd"),
  mindMapLayoutLr: document.getElementById("mindMapLayoutLr"),
  mindMapLayoutMm: document.getElementById("mindMapLayoutMm"),
  mindMapRegenBtn: document.getElementById("mindMapRegenBtn"),
  mindMapEditBtn: document.getElementById("mindMapEditBtn"),
  mindMapCopyBtn: document.getElementById("mindMapCopyBtn"),
  mindMapEditPane: document.getElementById("mindMapEditPane"),
  mindMapEditText: document.getElementById("mindMapEditText"),
  mindMapEditApplyBtn: document.getElementById("mindMapEditApplyBtn"),
  mindMapEditError: document.getElementById("mindMapEditError"),
  mindMapSelectionBar: document.getElementById("mindMapSelectionBar"),
  mindMapSelectionText: document.getElementById("mindMapSelectionText"),
  mindMapUseSelectionBtn: document.getElementById("mindMapUseSelectionBtn"),
  mindMapUseDocBtn: document.getElementById("mindMapUseDocBtn"),

  // Workspace Search & Pomodoro refs
  workspaceSearchInput: document.getElementById("workspaceSearchInput"),
  pomodoroWidget: document.getElementById("pomodoroWidget"),
  pomodoroHeader: document.getElementById("pomodoroHeader"),
  pomodoroTimerDisplay: document.getElementById("pomodoroTimerDisplay"),
  pomodoroStartBtn: document.getElementById("pomodoroStartBtn"),
  pomodoroResetBtn: document.getElementById("pomodoroResetBtn"),

  // Cheat Sheet refs
  cheatSheetBtn: document.getElementById("cheatSheetBtn"),
  cheatSheetModal: document.getElementById("cheatSheetModal"),
  cheatSheetModalClose: document.getElementById("cheatSheetModalClose"),
  cheatSheetSpinner: document.getElementById("cheatSheetSpinner"),
  cheatSheetContent: document.getElementById("cheatSheetContent"),
  printCheatSheetBtn: document.getElementById("printCheatSheetBtn"),

  // Gamification, Glossary & Focus Mode refs
  gamificationBadge: document.getElementById("gamificationBadge"),
  streakDisplay: document.getElementById("streakDisplay"),
  levelDisplay: document.getElementById("levelDisplay"),
  gamificationModal: document.getElementById("gamificationModal"),
  gamificationModalClose: document.getElementById("gamificationModalClose"),
  gamiLevelTitle: document.getElementById("gamiLevelTitle"),
  gamiStreakText: document.getElementById("gamiStreakText"),
  gamiXpBar: document.getElementById("gamiXpBar"),
  gamiXpCurrent: document.getElementById("gamiXpCurrent"),
  gamiXpTarget: document.getElementById("gamiXpTarget"),
  gamiBadgesGrid: document.getElementById("gamiBadgesGrid"),

  autoGlossaryBtn: document.getElementById("autoGlossaryBtn"),
  translateBtn: document.getElementById("translateBtn"),
  podcastBtn: document.getElementById("podcastBtn"),

  focusToggleBtn: document.getElementById("focusToggleBtn"),
  focusInput: document.getElementById("focusInput"),
  focusClearBtn: document.getElementById("focusClearBtn"),

  // Split Mode & Font Settings refs
  splitModeBtn: document.getElementById("splitModeBtn"),
  readerSplitWrapper: document.getElementById("readerSplitWrapper"),
  primaryPane: document.getElementById("primaryPane"),
  secondaryPane: document.getElementById("secondaryPane"),
  contentSecondary: document.getElementById("contentSecondary"),
  readingStatsBarSecondary: document.getElementById("readingStatsBarSecondary"),
  wordCountTextSecondary: document.getElementById("wordCountTextSecondary"),
  readingTimeTextSecondary: document.getElementById("readingTimeTextSecondary"),
  
  fontSettingsBtn: null, // legacy — moved into the settings drawer
  fontSettingsPopover: null,
  fontFamilySelect: document.getElementById("fontFamilySelect"),
  lineHeightSelect: document.getElementById("lineHeightSelect"),
};

/* ---------------- Helper: Show/Hide ---------------- */
function show(element, displayType = 'block') {
  if (element) element.style.display = displayType;
}
function hide(element) {
  if (element) element.style.display = 'none';
}

function resetActiveDocView() {
  state.activeKey = null;
  state.secondaryKey = null;
  state.isSplitMode = false;
  state.activePane = "primary";
  if (el.readerSplitWrapper) {
    el.readerSplitWrapper.classList.remove("split");
  }
  if (el.secondaryPane) hide(el.secondaryPane);
  if (el.primaryPane) {
    el.primaryPane.classList.add("active");
  }
  localStorage.removeItem("md-reader-active-key");
  hide(el.content);
  hide(el.contentSecondary);
  hide(el.aiToolbar);
  hide(el.readAloudBtn);
  hide(el.speechRateSelect);
  hide(el.editBtn);
  hide(el.splitModeBtn);
  hide(el.exportPdfBtn);
  hide(el.exportHtmlBtn);
  hide(el.readingStatsBar);
  hide(el.readingStatsBarSecondary);
  hide(el.editorContainer);
  show(el.emptyState);
  if (typeof uiRefresh === "object" && uiRefresh.hideDocChrome) uiRefresh.hideDocChrome();
  if (typeof studyDashboard === "object" && studyDashboard.render) studyDashboard.render();
  // Auto-exit Zen Mode — no doc = no distraction to hide, and nav must return
  window.dispatchEvent(new CustomEvent("md-reader:doc-closed"));
}

/* ---------------- Theme ---------------- */
function applyTheme() {
  document.documentElement.setAttribute("data-theme", state.theme);
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    const metaColors = {
      night: "#0a0c10",
      day: "#f6f8fa",
      sepia: "#f4ecd8",
      oled: "#000000",
      forest: "#0f1914",
      latte: "#f5f0eb",
      frost: "#1e222b",
      sakura: "#fff5f6"
    };
    metaTheme.setAttribute("content", metaColors[state.theme] || "#0a0c10");
  }
  const icon = document.getElementById("themeIcon");
  if (icon) {
    const icons = {
      night: "🌙",
      day: "☀️",
      sepia: "🍵",
      oled: "🖤",
      forest: "🌲",
      latte: "☕",
      frost: "🧊",
      sakura: "🌸"
    };
    icon.textContent = icons[state.theme] || "🌙";
  }
  localStorage.setItem("md-reader-theme", state.theme);
  
  if (el.themePopover) {
    el.themePopover.querySelectorAll(".theme-opt").forEach(opt => {
      if (opt.dataset.theme === state.theme) {
        opt.classList.add("active");
      } else {
        opt.classList.remove("active");
      }
    });
  }

  if (typeof applyAccent === "function") {
    applyAccent(state.activeAccent);
  }
}

const ACCENT_COLORS = {
  indigo: {
    night: { accent: "#7c6bf5", hover: "#9180fa", bg: "rgba(124, 107, 245, 0.1)", glow: "rgba(124, 107, 245, 0.25)" },
    day: { accent: "#6c5ce7", hover: "#5b4cdb", bg: "rgba(108, 92, 231, 0.08)", glow: "rgba(108, 92, 231, 0.15)" }
  },
  emerald: {
    night: { accent: "#10b981", hover: "#34d399", bg: "rgba(16, 185, 129, 0.1)", glow: "rgba(16, 185, 129, 0.25)" },
    day: { accent: "#059669", hover: "#047857", bg: "rgba(5, 150, 105, 0.08)", glow: "rgba(5, 150, 105, 0.15)" }
  },
  sky: {
    night: { accent: "#0284c7", hover: "#38bdf8", bg: "rgba(2, 132, 199, 0.1)", glow: "rgba(2, 132, 199, 0.25)" },
    day: { accent: "#0369a1", hover: "#075985", bg: "rgba(3, 105, 161, 0.08)", glow: "rgba(3, 105, 161, 0.15)" }
  },
  rose: {
    night: { accent: "#f43f5e", hover: "#fb7185", bg: "rgba(244, 63, 94, 0.1)", glow: "rgba(244, 63, 94, 0.25)" },
    day: { accent: "#e11d48", hover: "#be123c", bg: "rgba(225, 29, 72, 0.08)", glow: "rgba(225, 29, 72, 0.15)" }
  },
  amber: {
    night: { accent: "#f59e0b", hover: "#fbbf24", bg: "rgba(245, 158, 11, 0.1)", glow: "rgba(245, 158, 11, 0.25)" },
    day: { accent: "#d97706", hover: "#b45309", bg: "rgba(217, 119, 6, 0.08)", glow: "rgba(217, 119, 6, 0.15)" }
  }
};

function applyAccent(accentName) {
  state.activeAccent = accentName || "indigo";
  localStorage.setItem("md-reader-accent", state.activeAccent);
  
  const colors = ACCENT_COLORS[state.activeAccent] || ACCENT_COLORS.indigo;
  const lightThemes = ["day", "sepia", "latte", "sakura"];
  const currentMode = lightThemes.includes(state.theme) ? "day" : "night";
  const themeColors = colors[currentMode];
  
  document.documentElement.style.setProperty("--accent", themeColors.accent);
  document.documentElement.style.setProperty("--accent-hover", themeColors.hover);
  document.documentElement.style.setProperty("--accent-bg", themeColors.bg);
  document.documentElement.style.setProperty("--accent-glow", themeColors.glow);
  
  // Highlight active swatch (inside the settings drawer)
  if (el.drawerAccentSwatches) {
    el.drawerAccentSwatches.querySelectorAll(".swatch").forEach(swatch => {
      if (swatch.dataset.accent === state.activeAccent) {
        swatch.classList.add("active");
      } else {
        swatch.classList.remove("active");
      }
    });
  }
}

// Move theme popover to <body> so it escapes any stacking context
if (el.themePopover) {
  document.body.appendChild(el.themePopover);
  el.themePopover.style.position = 'fixed';
  el.themePopover.style.zIndex = '99999';
}

function positionThemePopover() {
  if (!el.themeBtn || !el.themePopover) return;
  const rect = el.themeBtn.getBoundingClientRect();
  let top = rect.bottom + 8;
  let right = window.innerWidth - rect.right;
  if (right < 8) right = 8;
  el.themePopover.style.top = top + 'px';
  el.themePopover.style.right = right + 'px';
  el.themePopover.style.left = 'auto';
}

if (el.themeBtn && el.themePopover) {
  el.themeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const visible = el.themePopover.style.display === "block";
    if (visible) {
      hide(el.themePopover);
    } else {
      positionThemePopover();
      show(el.themePopover, 'block');
    }
  });

  el.themeBtn.addEventListener("touchend", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const visible = el.themePopover.style.display === "block";
    if (visible) {
      hide(el.themePopover);
    } else {
      positionThemePopover();
      show(el.themePopover, 'block');
    }
  });

  // Theme option clicks
  el.themePopover.querySelectorAll(".theme-opt").forEach(opt => {
    const handleOptClick = (e) => {
      e.stopPropagation();
      state.theme = opt.dataset.theme;
      applyTheme();
      hide(el.themePopover);
    };
    opt.addEventListener("click", handleOptClick);
    opt.addEventListener("touchend", (e) => {
      e.preventDefault();
      handleOptClick(e);
    });
  });

  // Close popover when tapping/clicking anywhere else
  document.addEventListener("click", (e) => {
    if (el.themePopover && !el.themePopover.contains(e.target) && !el.themeBtn.contains(e.target)) {
      hide(el.themePopover);
    }
  });
  document.addEventListener("touchstart", (e) => {
    if (el.themePopover && el.themePopover.style.display === "block" &&
        !el.themePopover.contains(e.target) && !el.themeBtn.contains(e.target)) {
      hide(el.themePopover);
    }
  }, { passive: true });
}

applyTheme();

/* ---------------- Accent Color Theme (swatches now live in the Settings drawer) ---------------- */

applyAccent(state.activeAccent);

/* ---------------- Font scaling ---------------- */
function applyFontScale() {
  document.documentElement.style.setProperty("--font-scale", state.fontScale);
  localStorage.setItem("md-reader-font", state.fontScale);
}
state.fontScale = parseFloat(localStorage.getItem("md-reader-font") || "1");
applyFontScale();

el.fontUpBtn.addEventListener("click", () => {
  state.fontScale = Math.min(1.6, +(state.fontScale + 0.1).toFixed(2));
  applyFontScale();
});
el.fontDownBtn.addEventListener("click", () => {
  state.fontScale = Math.max(0.8, +(state.fontScale - 0.1).toFixed(2));
  applyFontScale();
});

const FONT_MAP = {
  inter: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  roboto: "'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  merriweather: "'Merriweather', Georgia, serif",
  lexend: "'Lexend', -apple-system, BlinkMacSystemFont, sans-serif",
  dyslexic: "'OpenDyslexic', sans-serif"
};

function applyFontFamily(font) {
  state.activeFont = font || "inter";
  localStorage.setItem("md-reader-font-family", state.activeFont);
  
  const fontValue = FONT_MAP[state.activeFont] || FONT_MAP.inter;
  document.documentElement.style.setProperty("--font-main", fontValue);
  document.body.style.fontFamily = fontValue;
  
  // Remove existing font classes on documentElement
  document.documentElement.classList.remove(
    "font-family-inter", 
    "font-family-roboto", 
    "font-family-merriweather", 
    "font-family-lexend", 
    "font-family-dyslexic"
  );
  
  // Add new font class
  document.documentElement.classList.add(`font-family-${state.activeFont}`);
  
  if (el.fontFamilySelect) {
    el.fontFamilySelect.value = state.activeFont;
  }
}

function applyLineHeight(height) {
  state.lineHeight = height || "1.6";
  localStorage.setItem("md-reader-line-height", state.lineHeight);
  document.documentElement.style.setProperty("--line-height", state.lineHeight);
  
  if (el.lineHeightSelect) {
    el.lineHeightSelect.value = state.lineHeight;
  }
}

// Drawer binding for font family & line spacing (elements live in the settings drawer)
if (el.fontFamilySelect) {
  el.fontFamilySelect.addEventListener("change", (e) => {
    applyFontFamily(e.target.value);
  });
}

if (el.lineHeightSelect) {
  el.lineHeightSelect.addEventListener("change", (e) => {
    applyLineHeight(e.target.value);
  });
}

// Initial typography application
applyFontFamily(state.activeFont);
applyLineHeight(state.lineHeight);

/* ---------------- Mobile drawer ---------------- */
function openSidebar() {
  el.sidebar.classList.add("open");
  show(el.sidebarOverlay);
}
function closeSidebar() {
  el.sidebar.classList.remove("open");
  hide(el.sidebarOverlay);
}
el.menuBtn.addEventListener("click", openSidebar);
el.sidebarOverlay.addEventListener("click", closeSidebar);

/* ---------------- Context Menu & File Management ---------------- */
function hideContextMenu() {
  hide(el.contextMenu);
  state.contextMenuTarget = null;
}

document.addEventListener("click", (e) => {
  if (!el.contextMenu.contains(e.target)) {
    hideContextMenu();
  }
});

function showContextMenu(e, key) {
  e.preventDefault();
  state.contextMenuTarget = key;
  state.isFolderTarget = false;
  
  const isPinned = state.pinnedKeys.includes(key);
  el.cmPinBtn.querySelector('span').textContent = isPinned ? 'Unpin' : 'Pin';
  
  show(el.cmPinBtn, 'flex');
  show(el.cmRenameBtn, 'flex');
  show(el.cmMoveBtn, 'flex');
  show(el.cmDeleteBtn, 'flex');
  hide(el.cmDeleteFolderBtn);
  hide(el.cmNewNoteHereBtn);
  hide(el.cmNewFolderHereBtn);
  hide(el.cmRenameFolderBtn);
  
  show(el.cmDownloadBtn, 'flex');
  hide(el.cmDownloadFolderBtn);
  show(el.cmDownloadDivider);
  
  const dividers = el.contextMenu.querySelectorAll(".cm-divider:not(#cmDownloadDivider)");
  dividers.forEach(d => show(d));
  
  show(el.contextMenu, 'flex');
  
  // Position the menu
  let x = e.pageX;
  let y = e.pageY;
  
  // Adjust if it goes off screen
  const menuRect = el.contextMenu.getBoundingClientRect();
  if (x + menuRect.width > window.innerWidth) x = window.innerWidth - menuRect.width - 10;
  if (y + menuRect.height > window.innerHeight) y = window.innerHeight - menuRect.height - 10;
  
  el.contextMenu.style.left = `${x}px`;
  el.contextMenu.style.top = `${y}px`;
}

function showFolderContextMenu(e, path) {
  e.preventDefault();
  state.contextMenuTarget = path;
  state.isFolderTarget = true;
  
  hide(el.cmPinBtn);
  hide(el.cmRenameBtn);
  hide(el.cmMoveBtn);
  hide(el.cmDeleteBtn);
  show(el.cmDeleteFolderBtn, 'flex');
  show(el.cmNewNoteHereBtn, 'flex');
  show(el.cmNewFolderHereBtn, 'flex');
  show(el.cmRenameFolderBtn, 'flex');
  
  hide(el.cmDownloadBtn);
  show(el.cmDownloadFolderBtn, 'flex');
  show(el.cmDownloadDivider);
  
  const dividers = el.contextMenu.querySelectorAll(".cm-divider:not(#cmDownloadDivider)");
  dividers.forEach(d => hide(d));
  
  show(el.contextMenu, 'flex');
  
  // Position the menu
  let x = e.pageX;
  let y = e.pageY;
  
  // Adjust if it goes off screen
  const menuRect = el.contextMenu.getBoundingClientRect();
  if (x + menuRect.width > window.innerWidth) x = window.innerWidth - menuRect.width - 10;
  if (y + menuRect.height > window.innerHeight) y = window.innerHeight - menuRect.height - 10;
  
  el.contextMenu.style.left = `${x}px`;
  el.contextMenu.style.top = `${y}px`;
}

// Pinning logic
function togglePin(key) {
  if (state.pinnedKeys.includes(key)) {
    state.pinnedKeys = state.pinnedKeys.filter(k => k !== key);
  } else {
    state.pinnedKeys.push(key);
  }
  localStorage.setItem("md-reader-pins", JSON.stringify(state.pinnedKeys));
  renderFileTree(state.files);
}

el.cmPinBtn.addEventListener("click", () => {
  if (state.contextMenuTarget) togglePin(state.contextMenuTarget);
  hideContextMenu();
});

// Rename logic
el.cmRenameBtn.addEventListener("click", () => {
  if (!state.contextMenuTarget) return;
  state.actionTarget = state.contextMenuTarget;
  const oldName = state.actionTarget.split('/').pop().replace(/\.md$/i, '');
  el.renameInput.value = oldName;
  show(el.renameModal, 'flex');
  el.renameInput.focus();
  hideContextMenu();
});

el.renameModalClose.addEventListener("click", () => hide(el.renameModal));

el.renameSubmitBtn.addEventListener("click", async () => {
  const newName = el.renameInput.value.trim();
  const oldKey = state.actionTarget;
  if (!newName || !oldKey) return;
  
  el.renameSubmitBtn.disabled = true;
  el.renameSubmitBtn.textContent = "Renaming...";
  
  try {
    const res = await authFetch("/api/rename", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ oldKey, newName })
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "Rename failed");
    const newKey = data.newKey || oldKey;
    
    // Update local state pins if renamed
    if (state.pinnedKeys.includes(oldKey)) {
      state.pinnedKeys = state.pinnedKeys.filter(k => k !== oldKey);
      state.pinnedKeys.push(newKey);
      localStorage.setItem("md-reader-pins", JSON.stringify(state.pinnedKeys));
    }
    
    // If active file was renamed, update + persist activeKey
    if (state.activeKey === oldKey) {
      state.activeKey = newKey;
      localStorage.setItem("md-reader-active-key", newKey);
    }
    
    hide(el.renameModal);
    await loadFileList();
  } catch (e) {
    alert(e.message);
  } finally {
    el.renameSubmitBtn.disabled = false;
    el.renameSubmitBtn.textContent = "Rename";
  }
});

// Move logic
el.cmMoveBtn.addEventListener("click", () => {
  if (!state.contextMenuTarget) return;
  state.actionTarget = state.contextMenuTarget;
  const parts = state.actionTarget.split('/');
  parts.pop(); // remove file name
  el.moveFolderInput.value = parts.join('/');
  show(el.moveModal, 'flex');
  el.moveFolderInput.focus();
  hideContextMenu();
});

el.moveModalClose.addEventListener("click", () => hide(el.moveModal));

el.moveSubmitBtn.addEventListener("click", async () => {
  const newFolder = el.moveFolderInput.value.trim();
  const oldKey = state.actionTarget;
  if (!oldKey) return;
  
  el.moveSubmitBtn.disabled = true;
  el.moveSubmitBtn.textContent = "Moving...";
  
  try {
    const res = await authFetch("/api/move", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ oldKey, newFolder })
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "Move failed");
    const newKey = data.newKey || oldKey;
    
    // Update local state pins if moved
    if (state.pinnedKeys.includes(oldKey)) {
      state.pinnedKeys = state.pinnedKeys.filter(k => k !== oldKey);
      state.pinnedKeys.push(newKey);
      localStorage.setItem("md-reader-pins", JSON.stringify(state.pinnedKeys));
    }
    
    // If active file was moved, update activeKey
    if (state.activeKey === oldKey) {
      state.activeKey = newKey;
      localStorage.setItem("md-reader-active-key", newKey);
    }
    
    hide(el.moveModal);
    await loadFileList();
  } catch (e) {
    alert(e.message);
  } finally {
    el.moveSubmitBtn.disabled = false;
    el.moveSubmitBtn.textContent = "Move";
  }
});

// Delete logic
el.cmDeleteBtn.addEventListener("click", () => {
  if (!state.contextMenuTarget) return;
  state.actionTarget = state.contextMenuTarget;
  el.deleteFileName.textContent = state.actionTarget;
  show(el.deleteModal, 'flex');
  hideContextMenu();
});

el.deleteModalClose.addEventListener("click", () => hide(el.deleteModal));
el.deleteCancelBtn.addEventListener("click", () => hide(el.deleteModal));

el.deleteSubmitBtn.addEventListener("click", async () => {
  const key = state.actionTarget;
  if (!key) return;
  
  el.deleteSubmitBtn.disabled = true;
  el.deleteSubmitBtn.textContent = "Deleting...";
  
  try {
    const res = await authFetch(`/api/file?key=${encodeURIComponent(key)}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "Delete failed");
    
    // Update local state pins if deleted
    if (state.pinnedKeys.includes(key)) {
      state.pinnedKeys = state.pinnedKeys.filter(k => k !== key);
      localStorage.setItem("md-reader-pins", JSON.stringify(state.pinnedKeys));
    }
    
    // If active file was deleted, reset view
    if (state.activeKey === key) {
      resetActiveDocView();
    }
    
    hide(el.deleteModal);
    await loadFileList();
  } catch (e) {
    alert(e.message);
  } finally {
    el.deleteSubmitBtn.disabled = false;
    el.deleteSubmitBtn.textContent = "Delete";
  }
});

// Folder Delete logic
el.cmDeleteFolderBtn.addEventListener("click", () => {
  if (!state.contextMenuTarget) return;
  state.actionTarget = state.contextMenuTarget;
  el.deleteFolderNameText.textContent = state.actionTarget;
  show(el.deleteFolderModal, 'flex');
  hideContextMenu();
});

el.deleteFolderModalClose.addEventListener("click", () => hide(el.deleteFolderModal));
el.deleteFolderCancelBtn.addEventListener("click", () => hide(el.deleteFolderModal));

el.deleteFolderSubmitBtn.addEventListener("click", async () => {
  const prefix = state.actionTarget;
  if (!prefix) return;
  
  el.deleteFolderSubmitBtn.disabled = true;
  el.deleteFolderSubmitBtn.textContent = "Deleting...";
  
  try {
    const res = await authFetch(`/api/folder?prefix=${encodeURIComponent(prefix)}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "Delete folder failed");
    
    // If active file was in the deleted folder, reset view
    if (state.activeKey && state.activeKey.startsWith(prefix + '/')) {
      resetActiveDocView();
    }
    
    // Cleanup any pins that were inside the deleted folder
    const preLength = state.pinnedKeys.length;
    state.pinnedKeys = state.pinnedKeys.filter(k => !k.startsWith(prefix + '/'));
    if (state.pinnedKeys.length !== preLength) {
      localStorage.setItem("md-reader-pins", JSON.stringify(state.pinnedKeys));
    }
    
    hide(el.deleteFolderModal);
    await loadFileList();
  } catch (e) {
    alert(e.message);
  } finally {
    el.deleteFolderSubmitBtn.disabled = false;
    el.deleteFolderSubmitBtn.textContent = "Delete Folder";
  }
});

// Download logic
async function downloadFile(key) {
  try {
    const res = await fetch(`/api/file?key=${encodeURIComponent(key)}`);
    if (!res.ok) throw new Error("Failed to retrieve file content");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = key.split('/').pop();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    alert("Error downloading file: " + e.message);
  }
}

async function downloadFolder(prefix) {
  try {
    const folderFiles = state.files.filter(f => f.key.startsWith(prefix + '/'));
    if (folderFiles.length === 0) {
      alert("No files inside this folder to download.");
      return;
    }
    
    const zip = new JSZip();
    let downloadedCount = 0;
    
    for (const f of folderFiles) {
      try {
        const res = await fetch(`/api/file?key=${encodeURIComponent(f.key)}`);
        if (res.ok) {
          const text = await res.text();
          const relPath = f.key.substring(prefix.length + 1);
          zip.file(relPath, text);
          downloadedCount++;
        }
      } catch (err) {
        console.error(`Error adding file ${f.key} to zip:`, err);
      }
    }
    
    if (downloadedCount === 0) {
      alert("Failed to download any files inside this folder.");
      return;
    }
    
    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${prefix.split('/').pop()}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    alert("Error downloading folder: " + e.message);
  }
}

window.downloadFile = downloadFile;
window.downloadFolder = downloadFolder;

el.cmDownloadBtn.addEventListener("click", () => {
  if (state.contextMenuTarget) downloadFile(state.contextMenuTarget);
  hideContextMenu();
});

el.cmDownloadFolderBtn.addEventListener("click", () => {
  if (state.contextMenuTarget) downloadFolder(state.contextMenuTarget);
  hideContextMenu();
});

/* ---------------- File list & Tree parsing ---------------- */
async function loadFileList() {
  try {
    const res = await fetch("/api/list", { cache: "no-store" });
    const data = await res.json();
    state.files = data.files || [];
    state.folders = data.folders || [];
    // Cleanup dangling pins
    const existingKeys = state.files.map(f => f.key);
    const validPins = state.pinnedKeys.filter(k => existingKeys.includes(k));
    if (validPins.length !== state.pinnedKeys.length) {
      state.pinnedKeys = validPins;
      localStorage.setItem("md-reader-pins", JSON.stringify(state.pinnedKeys));
    }
    renderFileTree(state.files);
  } catch (err) {
    el.fileList.innerHTML = `<div class="file-list-empty">⚠️ Failed to load: ${escapeHtml(err.message)}</div>`;
  }
}

// Convert flat keys to nested folder structure
function buildTree(files) {
  const root = { files: [], folders: {} };
  for (const f of files) {
    const parts = f.key.split('/');
    const name = parts.pop();
    let current = root;
    for (const part of parts) {
      if (!current.folders[part]) {
        current.folders[part] = { files: [], folders: {} };
      }
      current = current.folders[part];
    }
    current.files.push({ ...f, name });
  }
  return root;
}

function renderTreeHtml(node, path = "") {
  let html = "";
  
  // Render subfolders
  const folderNames = Object.keys(node.folders).sort();
  for (const fName of folderNames) {
    const fullPath = path ? `${path}/${fName}` : fName;
    const childNode = node.folders[fName];
    // Count total files recursively
    const countFiles = (n) => n.files.length + Object.values(n.folders).reduce((acc, c) => acc + countFiles(c), 0);
    const count = countFiles(childNode);
    
    const isParentOfActive = state.activeKey && state.activeKey.startsWith(fullPath + '/');
    const isSearching = el.searchInput && el.searchInput.value && el.searchInput.value.trim().length > 0;
    const collapsedClass = (isParentOfActive || isSearching) ? "" : "collapsed";

    html += `
      <div class="folder-section">
        <div class="folder-header ${collapsedClass}" data-path="${escapeHtml(fullPath)}">
          <svg class="folder-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
          ${escapeHtml(fName)}
          <span class="folder-count">${count}</span>
          <button class="tree-download-btn" data-key="${escapeHtml(fullPath)}" data-folder="1" title="Download Folder (.zip)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
        </div>
        <div class="folder-children ${collapsedClass}">
          ${renderTreeHtml(childNode, fullPath)}
        </div>
      </div>
    `;
  }
  
  // Render files
  const files = node.files.sort((a, b) => a.name.localeCompare(b.name));
  for (const f of files) {
    const isActive = f.key === state.activeKey ? "active" : "";
    const draggableAttr = state.synthesisMode ? "" : `draggable="true"`;
    
    let checkboxHtml = "";
    if (state.synthesisMode) {
      const checked = state.selectedKeys.has(f.key) ? "checked" : "";
      checkboxHtml = `<input type="checkbox" class="file-select-checkbox" data-key="${escapeHtml(f.key)}" ${checked} style="margin-right:8px; cursor:pointer" />`;
    }
    
    html += `
      <div class="file-item ${isActive}" data-key="${escapeHtml(f.key)}" ${draggableAttr}>
        ${checkboxHtml}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
        ${escapeHtml(f.name.replace(/\.(md|markdown)$/i, ''))}
        <button class="tree-download-btn" data-key="${escapeHtml(f.key)}" title="Download File">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </button>
      </div>
    `;
  }
  
  return html;
}

function renderFileTree(files) {
  if (!files.length) {
    el.fileList.innerHTML = `<div class="file-list-empty">No Markdown files found in this bucket.</div>`;
    return;
  }
  
  let finalHtml = "";
  
  // Render pinned section first
  if (state.pinnedKeys.length > 0 && !el.searchInput.value) {
    const pinnedFiles = files.filter(f => state.pinnedKeys.includes(f.key));
    if (pinnedFiles.length > 0) {
      finalHtml += `
        <div class="folder-section">
          <div class="folder-header">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            Pinned
            <span class="folder-count">${pinnedFiles.length}</span>
          </div>
          <div class="folder-children">
      `;
      pinnedFiles.sort((a, b) => a.key.localeCompare(b.key)).forEach(f => {
        const isActive = f.key === state.activeKey ? "active" : "";
        const name = f.key.split('/').pop().replace(/\.(md|markdown)$/i, '');
        finalHtml += `
          <div class="file-item ${isActive}" data-key="${escapeHtml(f.key)}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
            ${escapeHtml(name)}
            <button class="tree-download-btn" data-key="${escapeHtml(f.key)}" title="Download File">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </button>
          </div>
        `;
      });
      finalHtml += `</div></div><hr style="border:none;height:1px;background:var(--border);margin:8px 0" />`;
    }
  }
  
  const tree = buildTree(files);
  finalHtml += renderTreeHtml(tree);
  
  el.fileList.innerHTML = finalHtml;

  // Add click and contextmenu (right-click) listeners to file items
  el.fileList.querySelectorAll(".file-item").forEach((item) => {
    item.addEventListener("click", () => openFile(item.dataset.key));
    item.addEventListener("contextmenu", (e) => showContextMenu(e, item.dataset.key));
  });

  // Add contextmenu listeners to folder headers
  el.fileList.querySelectorAll(".folder-header[data-path]").forEach((folder) => {
    folder.addEventListener("contextmenu", (e) => {
      showFolderContextMenu(e, folder.dataset.path);
    });
  });
}

/* Delegated tree interactions (XSS-safe — no inline handlers) */
el.fileList.addEventListener("click", (e) => {
  const dlBtn = e.target.closest(".tree-download-btn");
  if (dlBtn) {
    e.stopPropagation();
    if (dlBtn.dataset.folder === "1") downloadFolder(dlBtn.dataset.key);
    else downloadFile(dlBtn.dataset.key);
    return;
  }
  const checkbox = e.target.closest(".file-select-checkbox");
  if (checkbox) {
    e.stopPropagation();
    handleCheckboxToggle(checkbox, checkbox.dataset.key);
    return;
  }
  const folderHeader = e.target.closest(".folder-header");
  if (folderHeader && folderHeader.nextElementSibling) {
    folderHeader.classList.toggle("collapsed");
    folderHeader.nextElementSibling.classList.toggle("collapsed");
  }
});

el.fileList.addEventListener("dragstart", (e) => {
  if (state.synthesisMode) return;
  const item = e.target.closest(".file-item[data-key]");
  if (!item) return;
  e.dataTransfer.setData("text/plain", item.dataset.key);
  e.dataTransfer.effectAllowed = "move";
});

el.searchInput.addEventListener("input", (e) => {
  const q = e.target.value.toLowerCase();
  renderFileTree(state.files.filter((f) => f.key.toLowerCase().includes(q)));
});

/* ---------------- Open + render a markdown file ---------------- */
async function openFile(key) {
  const isSecondary = state.isSplitMode && state.activePane === "secondary";
  
  if (isSecondary) {
    state.secondaryKey = key;
  } else {
    state.activeKey = key;
    localStorage.setItem("md-reader-active-key", key);
  }
  
  state.isGeneralChatActive = false;
  closeSidebar();
  
  // Stop speaking on file change
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
    el.readAloudBtn.classList.remove("active");
    el.readAloudBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`;
  }
  
  // Initialize AI Cache for this file
  if (!state.aiCache[key]) {
    state.aiCache[key] = {
      activeType: null,
      summaryHtml: null,
      chatHistory: [],
      quizData: null,
      quizAnswers: {},
      flashcards: null,
      flashcardIndex: 0
    };
    saveAiCache();
  }
  
  // In-doc search bar lives inside the ⋮ More menu (always visible when a doc is open)
  show(el.searchDocContainer, 'flex');
  hide(el.searchDocToggleBtn);
  el.searchDocInput.value = "";
  originalContentHtml = ""; // Reset cached original HTML
  
  // Update active file class (O(1) — only touch previously-marked + new items)
  if (state._lastActiveItems) {
    state._lastActiveItems.forEach(n => n.classList.remove("active"));
  }
  state._lastActiveItems = [];
  const markActive = (key) => {
    if (!key) return;
    const item = el.fileList.querySelector(`.file-item[data-key="${CSS.escape(key)}"]`);
    if (item) { item.classList.add("active"); state._lastActiveItems.push(item); }
  };
  markActive(state.activeKey);
  if (state.isSplitMode) markActive(state.secondaryKey);

  const targetContent = isSecondary ? el.contentSecondary : el.content;
  const targetStatsBar = isSecondary ? el.readingStatsBarSecondary : el.readingStatsBar;

  hide(el.emptyState);
  show(targetContent);
  
  targetContent.innerHTML = isSecondary
    ? `<div style="text-align:center;padding:40px;color:var(--text-muted)">
        <div class="loading-dots" style="display:flex;gap:4px;justify-content:center;margin-bottom:12px">
          <span></span><span></span><span></span>
        </div>
        Loading…
      </div>`
    : uiRefresh.readerSkeleton();

  try {
    const res = await fetch(`/api/file?key=${encodeURIComponent(key)}`, { cache: "no-store" });
    if (!res.ok) throw new Error("File not found");
    const mdText = await res.text();
    targetContent.innerHTML = renderMd(mdText);
    
    // Clean string helper: keeps only letters & digits for robust comparison
    const cleanStr = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    // Assign IDs & data attributes to all headings
    targetContent.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(heading => {
      const text = heading.textContent.trim();
      const slug = text
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

      if (!heading.id) {
        heading.id = slug || `heading-${cleanStr(text)}`;
      }
      heading.dataset.cleanText = cleanStr(text);
      heading.dataset.cleanTextNoNum = cleanStr(text.replace(/^[\d.\s]+/, ''));
    });
    
    if (window.renderMathInElement) {
      renderMathInElement(targetContent, {
        delimiters: [
          {left: "$$", right: "$$", display: true},
          {left: "$", right: "$", display: false}
        ],
        throwOnError: false
      });
    }
    
    // Show top actions & toolbar
    show(el.aiToolbar, 'flex');
    show(el.readAloudBtn, 'flex');
    show(el.speechRateSelect, 'inline-block');
    el.speechRateSelect.value = state.speechRate;
    show(el.editBtn, 'flex');
    show(el.splitModeBtn, 'flex');
    show(el.exportPdfBtn, 'flex');
    show(el.exportHtmlBtn, 'flex');
    show(targetStatsBar, 'flex');
    hide(el.editorContainer);
    editMode = false;
    el.editorLoadedOk = false;
    el.editBtn.classList.remove("active");
    
    if (isSecondary) {
      updateReadingStatsSecondary(mdText);
    } else {
      updateReadingStats(mdText);
      buildTOC();
      highlights.restoreHighlights();
      // Document chrome: breadcrumb path + read-progress strip
      uiRefresh.updateDocChrome(key);
      
      // Per-doc auto-fullscreen preference
      if (typeof window.__fs === "object" && window.__fs.isAutoDoc && window.__fs.isAutoDoc(key) && !window.__fs.isActive()) {
        setTimeout(() => window.__fs.enter(), 350);
      }
      if (typeof window.__fs === "object" && window.__fs.refreshAuto) window.__fs.refreshAuto();
      // Re-apply cached glossary highlights automatically on open
      const cachedGlossary = state.aiCache[key] && state.aiCache[key].glossary;
      if (cachedGlossary && cachedGlossary.length) {
        autoGlossary.terms = cachedGlossary.map(t => autoGlossary.normalizeTermData(t));
        autoGlossary.applyToDOM();
      }
      // Track recent docs for the dashboard
      const recents = JSON.parse(localStorage.getItem("md-reader-recent") || "[]").filter(k => k !== key);
      recents.unshift(key);
      localStorage.setItem("md-reader-recent", JSON.stringify(recents.slice(0, 8)));
    }
    
    const notesToggleBtn = document.getElementById('notesToggleBtn');
    if (notesToggleBtn) show(notesToggleBtn, 'flex');
    document.getElementById('marginNotesPanel').style.display = 'none';
    highlights._notesPanelOpen = false;
    
    // Close AI panel visually on file change (retaining cached data for manual opening)
    document.body.classList.remove("ai-panel-open");
    hide(el.aiPanel);
    hide(el.chatInputArea);
    hide(el.exportAiBtn);
    
    // Restore previous reading position (primary pane), else start at top
    const readerEl = document.querySelector(".reader");
    if (!isSecondary) {
      const prog = readingProgress.get(key);
      if (prog && prog.ratio > 0.01 && prog.ratio < 0.99) {
        setTimeout(() => {
          const max = readerEl.scrollHeight - readerEl.clientHeight;
          readerEl.scrollTop = Math.round(prog.ratio * max);
        }, 120);
        readerEl.scrollTop = 0;
      } else {
        readerEl.scrollTop = 0;
      }
    } else {
      readerEl.scrollTop = 0;
    }
  } catch (err) {
    targetContent.innerHTML = `<p style="color:var(--error)">⚠️ Could not load file: ${escapeHtml(err.message)}</p>`;
  }
}

/* ---------------- Table of Contents (TOC) ---------------- */
function buildTOC() {
  const headings = el.content.querySelectorAll("h1, h2, h3");
  if (headings.length === 0) {
    hide(el.tocPanel);
    return;
  }
  
  el.tocList.innerHTML = "";
  headings.forEach((heading, idx) => {
    const id = heading.id || `heading-${idx}`;
    heading.id = id;
    
    const tagName = heading.tagName.toLowerCase();
    const item = document.createElement("a");
    item.className = `toc-item ${tagName}`;
    item.textContent = heading.textContent;
    item.href = `#${id}`;
    
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const targetHeading = document.getElementById(id);
      if (targetHeading) {
        targetHeading.scrollIntoView({ behavior: "smooth" });
        
        targetHeading.style.transition = "background-color 0.5s ease";
        targetHeading.style.backgroundColor = "var(--bg-hover)";
        setTimeout(() => {
          targetHeading.style.backgroundColor = "";
        }, 800);
      }
    });
    
    el.tocList.appendChild(item);
  });
  
  show(el.tocPanel, 'flex');
}

el.tocToggleBtn.addEventListener("click", () => {
  el.tocPanel.classList.toggle("collapsed");
});

/* ---------------- Text-to-Speech (Read Aloud) ---------------- */
let speechUtterance = null;
let speechChunks = [];
let speechChunkIndex = 0;

function speakNextChunk() {
  if (speechChunkIndex >= speechChunks.length) {
    el.readAloudBtn.classList.remove("active");
    el.readAloudBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`;
    return;
  }
  
  speechUtterance = new SpeechSynthesisUtterance(speechChunks[speechChunkIndex]);
  speechUtterance.rate = state.speechRate || 1;
  speechUtterance.onend = () => {
    speechChunkIndex++;
    speakNextChunk();
  };
  speechUtterance.onerror = () => {
    el.readAloudBtn.classList.remove("active");
  };
  
  const voices = window.speechSynthesis.getVoices();
  const defaultVoice = voices.find(v => v.lang.startsWith("en")) || voices[0];
  if (defaultVoice) speechUtterance.voice = defaultVoice;
  
  window.speechSynthesis.speak(speechUtterance);
}

function toggleReadAloud() {
  if (!window.speechSynthesis) {
    alert("Text-to-Speech is not supported in this browser.");
    return;
  }
  
  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
    el.readAloudBtn.classList.remove("active");
    el.readAloudBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`;
  } else {
    const rawText = el.content.innerText || el.content.textContent || "";
    if (!rawText.trim()) return;
    
    speechChunks = rawText.match(/[^.!?]+[.!?]+/g) || [rawText];
    speechChunkIndex = 0;
    
    el.readAloudBtn.classList.add("active");
    el.readAloudBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
    
    speakNextChunk();
  }
}

el.readAloudBtn.addEventListener("click", toggleReadAloud);

el.speechRateSelect.addEventListener("change", (e) => {
  state.speechRate = parseFloat(e.target.value);
  localStorage.setItem("md-reader-speech-rate", state.speechRate);
  if (window.speechSynthesis && window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
    speakNextChunk();
  }
});

/* ---------------- Search in Document ---------------- */
let searchMatches = [];
let searchMatchIndex = -1;
let originalContentHtml = "";

function performSearch() {
  if (originalContentHtml) {
    el.content.innerHTML = originalContentHtml;
  } else {
    originalContentHtml = el.content.innerHTML;
  }
  
  const query = el.searchDocInput.value.trim();
  if (!query) {
    el.searchDocStatus.textContent = "0/0";
    searchMatches = [];
    searchMatchIndex = -1;
    return;
  }
  
  const regex = new RegExp(`(${escapeRegExp(query)})`, "gi");
  highlightTextNodes(el.content, regex);
  
  searchMatches = Array.from(el.content.querySelectorAll(".search-match"));
  el.searchDocStatus.textContent = searchMatches.length > 0 ? `1/${searchMatches.length}` : "0/0";
  
  if (searchMatches.length > 0) {
    searchMatchIndex = 0;
    scrollToMatch();
  } else {
    searchMatchIndex = -1;
  }
}

function highlightTextNodes(node, regex) {
  if (node.nodeType === Node.TEXT_NODE) {
    const parent = node.parentNode;
    if (parent.tagName === "MARK" || parent.tagName === "SCRIPT" || parent.tagName === "STYLE" || parent.closest('.tree-download-btn')) return;
    
    const text = node.nodeValue;
    if (regex.test(text)) {
      const fragment = document.createDocumentFragment();
      const parts = text.split(regex);
      parts.forEach(part => {
        if (regex.test(part)) {
          const mark = document.createElement("mark");
          mark.className = "search-match";
          mark.textContent = part;
          fragment.appendChild(mark);
        } else {
          fragment.appendChild(document.createTextNode(part));
        }
      });
      parent.replaceChild(fragment, node);
    }
  } else {
    Array.from(node.childNodes).forEach(child => highlightTextNodes(child, regex));
  }
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function scrollToMatch() {
  el.content.querySelectorAll(".current-match").forEach(el => el.classList.remove("current-match"));
  
  if (searchMatchIndex >= 0 && searchMatchIndex < searchMatches.length) {
    const match = searchMatches[searchMatchIndex];
    match.classList.add("current-match");
    match.scrollIntoView({ behavior: "smooth", block: "center" });
    el.searchDocStatus.textContent = `${searchMatchIndex + 1}/${searchMatches.length}`;
  }
}

el.searchDocToggleBtn.addEventListener("click", () => {
  if (el.searchDocContainer.style.display === "none") {
    show(el.searchDocContainer, "flex");
    el.searchDocInput.focus();
    originalContentHtml = el.content.innerHTML;
  } else {
    hide(el.searchDocContainer);
    if (originalContentHtml) {
      el.content.innerHTML = originalContentHtml;
    }
    el.searchDocInput.value = "";
    el.searchDocStatus.textContent = "0/0";
    searchMatches = [];
    searchMatchIndex = -1;
  }
});

el.searchDocInput.addEventListener("input", performSearch);

el.searchDocPrev.addEventListener("click", () => {
  if (searchMatches.length > 0) {
    searchMatchIndex = (searchMatchIndex - 1 + searchMatches.length) % searchMatches.length;
    scrollToMatch();
  }
});

el.searchDocNext.addEventListener("click", () => {
  if (searchMatches.length > 0) {
    searchMatchIndex = (searchMatchIndex + 1) % searchMatches.length;
    scrollToMatch();
  }
});

/* ---------------- AI Export Study Guide ---------------- */
function exportStudyGuide() {
  const isGeneral = state.isGeneralChatActive;
  if (!isGeneral && !state.activeKey) return;
  
  const fileName = isGeneral ? "General_Chat" : state.activeKey.split('/').pop().replace(/\.md$/i, '');
  
  let mdContent = isGeneral ? `# AI Chat Transcript\n\n` : `# Study Guide — ${fileName}\n\n`;
  mdContent += `*Generated via AI Assistant on ${new Date().toLocaleDateString()}*\n\n`;
  
  const activeTitle = el.aiPanelTitle.textContent.toLowerCase();
  
  if (activeTitle.includes("summary")) {
    mdContent += `## Document Summary\n\n`;
    mdContent += el.aiPanelContent.innerText;
  } else if (activeTitle.includes("quiz")) {
    mdContent += `## Document Quiz\n\n`;
    el.aiPanelContent.querySelectorAll(".quiz-question").forEach((qEl, qi) => {
      mdContent += `### Q${qi + 1}: ${qEl.querySelector("p").innerText.replace(/Q\d+\.\s*/, '')}\n`;
      qEl.querySelectorAll("li").forEach(li => {
        const isCorrect = li.classList.contains("correct");
        mdContent += `- [${isCorrect ? 'x' : ' '}] ${li.innerText}\n`;
      });
      mdContent += `\n`;
    });
  } else if (activeTitle.includes("tutor") || activeTitle.includes("selection") || activeTitle.includes("assistant") || activeTitle.includes("chat")) {
    mdContent += isGeneral ? `## Chat Transcript with General Assistant\n\n` : `## Chat Transcript with Study Tutor\n\n`;
    state.chatHistory.forEach(msg => {
      const role = msg.role === "user" ? "User" : (isGeneral ? "Assistant" : "Tutor");
      mdContent += `### **${role}**\n${msg.parts[0].text}\n\n`;
    });
  } else if (activeTitle.includes("flashcards")) {
    mdContent += `## Study Flashcards\n\n`;
    const cache = state.aiCache[state.activeKey];
    if (cache && cache.flashcards && cache.flashcards.length) {
      cache.flashcards.forEach((card, idx) => {
        mdContent += `### Card ${idx + 1}\n`;
        mdContent += `**Question/Term:** ${card.question}\n\n`;
        mdContent += `**Answer/Definition:** ${card.answer}\n\n`;
        mdContent += `---\n\n`;
      });
    }
  } else {
    mdContent += `## Study Notes\n\n`;
    mdContent += el.aiPanelContent.innerText;
  }
  
  const blob = new Blob([mdContent], { type: "text/markdown; charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = isGeneral ? `${fileName}_Transcript.md` : `${fileName}_Study_Guide.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

el.exportAiBtn.addEventListener("click", exportStudyGuide);

/* ---------------- AI panel helpers ---------------- */
function openAiPanel(title, showChatInput = false, panelType = null) {
  document.body.classList.add("ai-panel-open");
  el.aiPanelTitle.textContent = title;
  show(el.aiPanel, 'flex');
  show(el.exportAiBtn, 'inline-block');
  show(el.retryAiBtn, 'inline-block');
  el.aiPanelContent.innerHTML = "";
  if (showChatInput) {
    show(el.chatInputArea, 'flex');
    show(el.clearChatBtn, 'inline-block');
  } else {
    hide(el.chatInputArea);
    hide(el.clearChatBtn);
  }
  show(el.aiSpinner, 'flex');

  state.isGeneralChatActive = (panelType === 'general-chat');

  if (panelType) {
    const key = state.isGeneralChatActive ? "$general" : state.activeKey;
    if (key && state.aiCache[key]) {
      state.aiCache[key].activeType = panelType;
      saveAiCache();
    }
  }
}

function closeAiPanel() {
  document.body.classList.remove("ai-panel-open");
  hide(el.aiPanel);
  hide(el.chatInputArea);
  hide(el.clearChatBtn);
  hide(el.exportAiBtn);
  hide(el.retryAiBtn);

  const key = state.isGeneralChatActive ? "$general" : state.activeKey;
  if (key && state.aiCache[key]) {
    state.aiCache[key].activeType = null;
    saveAiCache();
  }
}
el.aiPanelClose.addEventListener("click", closeAiPanel);

/* ---------- AI Panel Resize & Expand/Collapse ---------- */
(function initPanelResize() {
  const panel = el.aiPanel;
  const handle = el.aiPanelResizeHandle;
  const expandBtn = el.aiPanelExpandBtn;
  const DEFAULT_WIDTH = 420;
  const EXPANDED_WIDTH_VW = 65;
  let isExpanded = false;
  let isDragging = false;
  let startX = 0;
  let startWidth = 0;

  // SVG icons for expand and shrink
  const expandIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';
  const shrinkIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';

  // Drag to resize
  handle.addEventListener('mousedown', function(e) {
    if (window.innerWidth < 900) return;
    isDragging = true;
    startX = e.clientX;
    startWidth = panel.offsetWidth;
    panel.classList.add('resizing');
    panel.classList.remove('smooth-resize');
    handle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', function(e) {
    if (!isDragging) return;
    const dx = startX - e.clientX;
    let newWidth = startWidth + dx;
    const minW = 300;
    const maxW = window.innerWidth * 0.85;
    newWidth = Math.max(minW, Math.min(maxW, newWidth));
    panel.style.width = newWidth + 'px';
    // If user drags, we're no longer in the css-class-expanded state
    isExpanded = false;
    panel.classList.remove('expanded');
    expandBtn.innerHTML = expandIcon;
    expandBtn.title = 'Expand panel';
  });

  document.addEventListener('mouseup', function() {
    if (!isDragging) return;
    isDragging = false;
    panel.classList.remove('resizing');
    handle.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });

  // Touch support for resize
  handle.addEventListener('touchstart', function(e) {
    if (window.innerWidth < 900) return;
    const touch = e.touches[0];
    isDragging = true;
    startX = touch.clientX;
    startWidth = panel.offsetWidth;
    panel.classList.add('resizing');
    panel.classList.remove('smooth-resize');
    handle.classList.add('dragging');
    e.preventDefault();
  }, { passive: false });

  document.addEventListener('touchmove', function(e) {
    if (!isDragging) return;
    const touch = e.touches[0];
    const dx = startX - touch.clientX;
    let newWidth = startWidth + dx;
    const minW = 300;
    const maxW = window.innerWidth * 0.85;
    newWidth = Math.max(minW, Math.min(maxW, newWidth));
    panel.style.width = newWidth + 'px';
    isExpanded = false;
    panel.classList.remove('expanded');
    expandBtn.innerHTML = expandIcon;
    expandBtn.title = 'Expand panel';
  }, { passive: true });

  document.addEventListener('touchend', function() {
    if (!isDragging) return;
    isDragging = false;
    panel.classList.remove('resizing');
    handle.classList.remove('dragging');
  });

  // Expand / Collapse toggle
  expandBtn.addEventListener('click', function() {
    if (window.innerWidth < 900) return;
    panel.classList.add('smooth-resize');
    if (isExpanded) {
      // Collapse to default
      panel.classList.remove('expanded');
      panel.style.width = DEFAULT_WIDTH + 'px';
      expandBtn.innerHTML = expandIcon;
      expandBtn.title = 'Expand panel';
      isExpanded = false;
    } else {
      // Expand
      panel.classList.add('expanded');
      panel.style.width = '';
      expandBtn.innerHTML = shrinkIcon;
      expandBtn.title = 'Shrink panel';
      isExpanded = true;
    }
    // Remove smooth-resize class after transition completes
    setTimeout(function() { panel.classList.remove('smooth-resize'); }, 350);
  });

  // Reset panel width when closed
  const origClose = closeAiPanel;
  closeAiPanel = function() {
    origClose();
    panel.style.width = '';
    panel.classList.remove('expanded', 'resizing', 'smooth-resize');
    isExpanded = false;
    expandBtn.innerHTML = expandIcon;
    expandBtn.title = 'Expand panel';
  };
  // Re-bind close button to the wrapped version
  el.aiPanelClose.removeEventListener('click', origClose);
  el.aiPanelClose.addEventListener('click', closeAiPanel);
})();

/* ---------------- Sidebar / Folder Panel Resizing & Expand ---------------- */
(function initSidebarResize() {
  const sidebar = el.sidebar;
  const handle = el.sidebarResizeHandle;
  const expandBtn = el.sidebarExpandBtn;
  const DEFAULT_WIDTH = 280;
  const EXPANDED_WIDTH = 480;
  let isExpanded = false;
  let isDragging = false;
  let startX = 0;
  let startWidth = 0;

  // Restore saved width from localStorage
  const savedWidth = localStorage.getItem("md-reader-sidebar-width");
  if (savedWidth && sidebar && window.innerWidth >= 900) {
    sidebar.style.width = savedWidth + 'px';
    if (parseInt(savedWidth, 10) >= 420) {
      isExpanded = true;
      sidebar.classList.add('expanded');
    }
  }

  // Icons for expand / shrink
  const expandIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';
  const shrinkIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';

  if (expandBtn) {
    expandBtn.innerHTML = isExpanded ? shrinkIcon : expandIcon;
    expandBtn.title = isExpanded ? 'Shrink Folder Panel' : 'Expand Folder Panel';
  }

  if (handle && sidebar) {
    // Mouse drag resize
    handle.addEventListener('mousedown', function(e) {
      if (window.innerWidth < 900) return;
      isDragging = true;
      startX = e.clientX;
      startWidth = sidebar.offsetWidth;
      sidebar.classList.add('resizing');
      sidebar.classList.remove('smooth-resize');
      handle.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    document.addEventListener('mousemove', function(e) {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      let newWidth = startWidth + dx;
      const minW = 220;
      const maxW = Math.min(650, window.innerWidth * 0.5);
      newWidth = Math.max(minW, Math.min(maxW, newWidth));
      sidebar.style.width = newWidth + 'px';
      localStorage.setItem('md-reader-sidebar-width', newWidth);
      isExpanded = newWidth >= 420;
      if (expandBtn) {
        expandBtn.innerHTML = isExpanded ? shrinkIcon : expandIcon;
        expandBtn.title = isExpanded ? 'Shrink Folder Panel' : 'Expand Folder Panel';
      }
    });

    document.addEventListener('mouseup', function() {
      if (!isDragging) return;
      isDragging = false;
      sidebar.classList.remove('resizing');
      handle.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    });
  }

  if (expandBtn && sidebar) {
    expandBtn.addEventListener('click', function() {
      if (window.innerWidth < 900) return;
      sidebar.classList.add('smooth-resize');
      if (isExpanded) {
        // Collapse to default 280px
        sidebar.style.width = DEFAULT_WIDTH + 'px';
        localStorage.setItem('md-reader-sidebar-width', DEFAULT_WIDTH);
        sidebar.classList.remove('expanded');
        expandBtn.innerHTML = expandIcon;
        expandBtn.title = 'Expand Folder Panel';
        isExpanded = false;
      } else {
        // Expand to 480px
        sidebar.style.width = EXPANDED_WIDTH + 'px';
        localStorage.setItem('md-reader-sidebar-width', EXPANDED_WIDTH);
        sidebar.classList.add('expanded');
        expandBtn.innerHTML = shrinkIcon;
        expandBtn.title = 'Shrink Folder Panel';
        isExpanded = true;
      }
      setTimeout(function() { sidebar.classList.remove('smooth-resize'); }, 350);
    });
  }
})();

/* ---------------- AI Model Selector Sync ---------------- */
function syncAiModelSelectors(model) {
  state.selectedModel = model;
  localStorage.setItem("md-reader-ai-model", model);
  if (el.topbarAiModelSelect) el.topbarAiModelSelect.value = model;
  if (el.panelAiModelSelect) el.panelAiModelSelect.value = model;
}

if (el.topbarAiModelSelect) {
  el.topbarAiModelSelect.value = state.selectedModel;
  el.topbarAiModelSelect.addEventListener("change", (e) => syncAiModelSelectors(e.target.value));
}
if (el.panelAiModelSelect) {
  el.panelAiModelSelect.value = state.selectedModel;
  el.panelAiModelSelect.addEventListener("change", (e) => syncAiModelSelectors(e.target.value));
}

async function callAi(endpoint, body, onSuccess) {
  try {
    const payload = { model: state.selectedModel, ...body };
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    hide(el.aiSpinner);

    if (data.error) {
      el.aiPanelContent.innerHTML = `<div style="padding:16px;background:rgba(248,81,73,0.08);border:1px solid var(--error);border-radius:var(--radius);color:var(--error)">
        <strong>Error:</strong> ${escapeHtml(data.error)}
      </div>`;
      return;
    }
    onSuccess(data);
  } catch (err) {
    hide(el.aiSpinner);
    el.aiPanelContent.innerHTML = `<div style="padding:16px;background:rgba(248,81,73,0.08);border:1px solid var(--error);border-radius:var(--radius);color:var(--error)">
      <strong>Network error:</strong> ${escapeHtml(err.message)}
    </div>`;
  }
}

/* ---------------- Summarize ---------------- */
el.summarizeBtn.addEventListener("click", () => {
  if (!state.activeKey) return;
  const key = state.activeKey;
  const cache = state.aiCache[key];
  
  if (cache.summaryHtml) {
    openAiPanel("✨ Summary", false, 'summary');
    el.aiPanelContent.innerHTML = cache.summaryHtml;
    hide(el.aiSpinner);
    return;
  }
  
  openAiPanel("✨ Summary", false, 'summary');
  callAi("/api/ai/summarize", { key }, (data) => {
    let html = renderMd(data.summary || "No summary returned.");
    if (data.keyConcepts && data.keyConcepts.length > 0) {
      html += `
        <div class="chat-extra" style="margin-top:20px">
          <div class="chat-extra-title">Key Concepts</div>
          <div class="chat-concepts">
            ${data.keyConcepts.map(c => `<span class="concept-badge">${escapeHtml(c)}</span>`).join("")}
          </div>
        </div>
      `;
    }
    cache.summaryHtml = html;
    saveAiCache();
    el.aiPanelContent.innerHTML = html;
  });
});

/* ---------------- Chat & Explain ---------------- */
function renderChat() {
  let html = `<div class="chat-history">`;
  
  state.chatHistory.forEach((msg, idx) => {
    const text = msg.parts[0].text;
    const isUser = msg.role === "user";
    const modelBadge = isUser ? '' : `<span class="chat-model-badge">${msg.modelName || (msg.model && msg.model.includes('mercury') ? 'Mercury 2' : 'Gemini 3.5')}</span>`;
    const retryBtnHtml = isUser ? '' : `
      <button class="chat-retry-btn" title="Regenerate this Tutor response" onclick="retryChatResponse(${idx})">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
        <span>Retry</span>
      </button>
    `;
    html += `
      <div class="chat-msg ${isUser ? 'user' : 'model'}">
        <div class="chat-bubble">${isUser ? escapeHtml(text) : renderMd(text)}</div>
        <div class="chat-meta">
          <span>${isUser ? 'You' : 'Tutor'}</span>
          ${modelBadge}
          ${retryBtnHtml}
        </div>
      </div>
    `;
  });
  
  html += `</div>`;
  
  // Find last model response to append Suggested Questions / Concepts
  const lastModelMsg = [...state.chatHistory].reverse().find(m => m.role === "model");
  if (lastModelMsg && lastModelMsg.extra) {
    const { keyConcepts, suggestedQuestions } = lastModelMsg.extra;
    let extraHtml = `<div class="chat-extra">`;
    
    if (keyConcepts && keyConcepts.length > 0) {
      extraHtml += `
        <div class="chat-extra-title">Key Concepts</div>
        <div class="chat-concepts">
          ${keyConcepts.map(c => `<span class="concept-badge">${c}</span>`).join("")}
        </div>
      `;
    }
    
    if (suggestedQuestions && suggestedQuestions.length > 0) {
      extraHtml += `
        <div class="chat-extra-title" style="margin-top:8px">Suggested Questions</div>
        <div class="chat-suggestions">
          ${suggestedQuestions.map(q => `<button class="suggestion-btn" onclick='sendChatPrompt(${jsStringArg(q)})'>${escapeHtml(q)}</button>`).join("")}
        </div>
      `;
    }
    
    extraHtml += `</div>`;
    html += extraHtml;
  }
  
  el.aiPanelContent.innerHTML = html;
  el.aiPanelBody.scrollTop = el.aiPanelBody.scrollHeight;

  // Render visual flowcharts/graphs if Mermaid is loaded
  if (window.mermaid) {
    setTimeout(() => {
      try {
        mermaid.run({
          nodes: el.aiPanelContent.querySelectorAll(".language-mermaid")
        });
      } catch (err) {
        console.error("Mermaid run error:", err);
      }
    }, 100);
  }
}

async function retryChatResponse(msgIndex) {
  const isGeneral = state.isGeneralChatActive;
  const key = isGeneral ? "$general" : state.activeKey;
  if (!state.aiCache[key]) return;

  const cache = state.aiCache[key];
  state.chatHistory = cache.chatHistory || [];
  
  if (typeof msgIndex === 'number' && msgIndex >= 0 && msgIndex < state.chatHistory.length) {
    state.chatHistory = state.chatHistory.slice(0, msgIndex);
  } else {
    if (state.chatHistory.length > 0 && state.chatHistory[state.chatHistory.length - 1].role === "model") {
      state.chatHistory.pop();
    }
  }

  const lastUserMsg = [...state.chatHistory].reverse().find(m => m.role === "user");
  if (!lastUserMsg) return;

  cache.chatHistory = state.chatHistory;
  saveAiCache();
  renderChat();

  show(el.aiSpinner, 'flex');
  el.aiPanelBody.scrollTop = el.aiPanelBody.scrollHeight;

  try {
    const res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: isGeneral ? null : state.activeKey, messages: state.chatHistory, model: state.selectedModel })
    });
    const data = await res.json();
    hide(el.aiSpinner);

    if (data.error) {
      el.aiPanelContent.innerHTML += `<div style="padding:16px;background:rgba(248,81,73,0.08);border:1px solid var(--error);border-radius:var(--radius);color:var(--error);margin-top:12px">
        <strong>Retry Error:</strong> ${escapeHtml(data.error)}
      </div>`;
      return;
    }

    state.chatHistory.push({
      role: "model",
      parts: [{ text: data.reply || "No reply received." }],
      model: state.selectedModel,
      modelName: state.selectedModel.includes("mercury") ? "Mercury 2" : "Gemini 3.5",
      extra: {
        keyConcepts: data.keyConcepts || [],
        suggestedQuestions: data.suggestedQuestions || []
      }
    });
    saveAiCache();
    renderChat();
  } catch (e) {
    hide(el.aiSpinner);
    el.aiPanelContent.innerHTML += `<div style="padding:16px;background:rgba(248,81,73,0.08);border:1px solid var(--error);border-radius:var(--radius);color:var(--error);margin-top:12px">
      <strong>Network error:</strong> ${escapeHtml(e.message)}
    </div>`;
  }
}
window.retryChatResponse = retryChatResponse;

/* Regenerate helpers for the retry button — re-trigger the feature after its cache was cleared */
function fetchAndApplySummary() { el.summarizeBtn.click(); }
function fetchAndApplyQuiz() { el.quizBtn.click(); }
function fetchAndApplyFlashcards() { el.flashcardsBtn.click(); }
function fetchAndApplyCheatSheet() { if (el.cheatSheetBtn) el.cheatSheetBtn.click(); }

if (el.retryAiBtn) {
  el.retryAiBtn.addEventListener("click", () => {
    const title = el.aiPanelTitle.textContent || "";
    const key = state.isGeneralChatActive ? "$general" : state.activeKey;
    
    if (title.includes("Summary") || title.includes("Summarize")) {
      if (key && state.aiCache[key]) {
        delete state.aiCache[key].summaryHtml;
        saveAiCache();
      }
      fetchAndApplySummary();
    } else if (title.includes("Quiz")) {
      if (key && state.aiCache[key]) {
        delete state.aiCache[key].quizData;
        saveAiCache();
      }
      fetchAndApplyQuiz();
    } else if (title.includes("Flashcards")) {
      if (key && state.aiCache[key]) {
        delete state.aiCache[key].flashcards;
        saveAiCache();
      }
      fetchAndApplyFlashcards();
    } else if (title.includes("Cheat Sheet")) {
      if (key && state.aiCache[key]) {
        delete state.aiCache[key].cheatSheet;
        saveAiCache();
      }
      fetchAndApplyCheatSheet();
    } else if (title.includes("Glossary")) {
      if (key && state.aiCache[key]) {
        delete state.aiCache[key].glossary;
        saveAiCache();
      }
      autoGlossary.fetchAndApply();
    } else if (title.includes("Translat")) {
      aiTranslator.openLanguagePicker();
    } else if (title.includes("Podcast")) {
      aiPodcast.openLanguagePicker();
    } else {
      // Chat-type panels (Tutor, General Assistant, Synthesis, Workspace Search)
      retryChatResponse();
    }
  });
}

async function sendChatPrompt(prompt) {
  if (!prompt.trim()) return;
  
  const isGeneral = state.isGeneralChatActive;
  const key = isGeneral ? "$general" : state.activeKey;
  
  if (!state.aiCache[key]) {
    state.aiCache[key] = {
      activeType: isGeneral ? 'general-chat' : null,
      summaryHtml: null,
      chatHistory: [],
      quizData: null,
      quizAnswers: {},
      flashcards: null,
      flashcardIndex: 0
    };
  }
  const cache = state.aiCache[key];
  state.chatHistory = cache.chatHistory;
  
  // Add user message
  state.chatHistory.push({ role: "user", parts: [{ text: prompt }] });
  saveAiCache();
  renderChat();
  
  show(el.aiSpinner, 'flex');
  el.aiPanelBody.scrollTop = el.aiPanelBody.scrollHeight;
  
  try {
    const res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: isGeneral ? null : state.activeKey, messages: state.chatHistory, model: state.selectedModel })
    });
    const data = await res.json();
    hide(el.aiSpinner);
    
    if (data.error) {
      el.aiPanelContent.innerHTML += `<div style="padding:16px;background:rgba(248,81,73,0.08);border:1px solid var(--error);border-radius:var(--radius);color:var(--error);margin-top:12px">
        <strong>Error:</strong> ${escapeHtml(data.error)}
      </div>`;
      return;
    }
    
    // Add model response with extra data & model badge
    state.chatHistory.push({
      role: "model",
      parts: [{ text: data.reply || "No reply received." }],
      model: state.selectedModel,
      modelName: state.selectedModel.includes("mercury") ? "Mercury 2" : "Gemini 3.5",
      extra: {
        keyConcepts: data.keyConcepts || [],
        suggestedQuestions: data.suggestedQuestions || []
      }
    });
    saveAiCache();
    renderChat();
  } catch (e) {
    hide(el.aiSpinner);
    el.aiPanelContent.innerHTML += `<div style="padding:16px;background:rgba(248,81,73,0.08);border:1px solid var(--error);border-radius:var(--radius);color:var(--error);margin-top:12px">
      <strong>Network error:</strong> ${escapeHtml(e.message)}
    </div>`;
  }
}

// Make sendChatPrompt global so suggestion buttons can click it
window.sendChatPrompt = sendChatPrompt;

el.explainBtn.addEventListener("click", () => {
  if (!state.activeKey) return;
  const key = state.activeKey;
  const cache = state.aiCache[key];
  const selection = window.getSelection().toString();
  
  openAiPanel(selection ? "🧠 Selection Tutor" : "🧠 Study Tutor", true, 'chat');
  state.chatHistory = cache.chatHistory;
  
  if (selection && selection.trim().length > 0) {
    sendChatPrompt(`Explain this selection: "${selection}"`);
  } else if (state.chatHistory.length === 0) {
    sendChatPrompt("Explain the key concepts of this document.");
  } else {
    // Just restore existing chat history instantly
    renderChat();
    hide(el.aiSpinner);
  }
});

// Chat Send Button & Input handlers
el.chatSendBtn.addEventListener("click", () => {
  const prompt = el.chatInput.value.trim();
  if (!prompt) return;
  el.chatInput.value = "";
  sendChatPrompt(prompt);
});

el.chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const prompt = el.chatInput.value.trim();
    if (!prompt) return;
    el.chatInput.value = "";
    sendChatPrompt(prompt);
  }
});

/* ---------------- Quiz ---------------- */
el.quizBtn.addEventListener("click", () => {
  if (!state.activeKey) return;
  const key = state.activeKey;
  const cache = state.aiCache[key];
  
  if (cache.quizData) {
    openAiPanel("📝 Quiz", false, 'quiz');
    renderQuiz(cache.quizData);
    hide(el.aiSpinner);
    return;
  }
  
  openAiPanel("📝 Quiz", false, 'quiz');
  callAi("/api/ai/quiz", { key }, (data) => {
    cache.quizData = data.quiz || [];
    saveAiCache();
    renderQuiz(cache.quizData);
  });
});

function renderQuiz(quiz) {
  if (!quiz.length) {
    el.aiPanelContent.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:20px">Could not generate a quiz for this document. Try again.</p>`;
    return;
  }
  const key = state.activeKey;
  const cache = state.aiCache[key];
  
  el.aiPanelContent.innerHTML = quiz
    .map(
      (q, qi) => `
      <div class="quiz-question" data-qi="${qi}" data-answer="${q.answerIndex}">
        <p><strong>Q${qi + 1}.</strong> ${escapeHtml(q.question)}</p>
        <ul class="quiz-options">
          ${q.options
            .map((opt, oi) => `<li data-oi="${oi}">${escapeHtml(opt)}</li>`)
            .join("")}
        </ul>
      </div>`
    )
    .join("");

  el.aiPanelContent.querySelectorAll(".quiz-question").forEach((qEl) => {
    const correctIdx = parseInt(qEl.dataset.answer, 10);
    qEl.querySelectorAll("li[data-oi]").forEach((li) => {
      li.addEventListener("click", () => {
        const chosenIdx = parseInt(li.dataset.oi, 10);
        qEl.querySelectorAll("li[data-oi]").forEach((o) => (o.style.pointerEvents = "none"));
        qEl.querySelector(`li[data-oi="${correctIdx}"]`).classList.add("correct");
        if (chosenIdx !== correctIdx) li.classList.add("incorrect");
      });
    });
  });
}

/* ---------------- Flashcards Mode ---------------- */
el.flashcardsBtn.addEventListener("click", () => {
  if (!state.activeKey) return;
  const key = state.activeKey;
  const cache = state.aiCache[key];
  
  if (cache.flashcards) {
    openAiPanel("🗂️ Flashcards", false, 'flashcards');
    renderFlashcards(cache.flashcards);
    hide(el.aiSpinner);
    return;
  }
  
  openAiPanel("🗂️ Flashcards", false, 'flashcards');
  callAi("/api/ai/flashcards", { key }, (data) => {
    cache.flashcards = data.flashcards || [];
    cache.flashcardIndex = 0;
    saveAiCache();
    renderFlashcards(cache.flashcards);
  });
});

function renderFlashcards(cards) {
  if (!cards.length) {
    el.aiPanelContent.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:20px">Could not generate flashcards for this document. Try again.</p>`;
    return;
  }
  
  const key = state.activeKey;
  const cache = state.aiCache[key];
  if (!cache.flashcardOrder || cache.flashcardOrder.length !== cards.length) {
    cache.flashcardOrder = srsDeck.buildStudyOrder(key, cards.length);
    cache.flashcardIndex = 0;
  }
  const pos = cache.flashcardIndex || 0;
  const actualIdx = cache.flashcardOrder[pos] ?? pos;
  const card = cards[actualIdx];
  const sched = srsDeck.getSchedule(key, actualIdx);
  const dueCount = srsDeck.dueIndices(key, cards.length).length;

  const srsBadge = !sched || sched.reps === 0
    ? `<span class="srs-badge new">New card</span>`
    : (srsDeck.isDue(sched)
      ? `<span class="srs-badge due">Due for review</span>`
      : `<span class="srs-badge" style="color:var(--text-dim);border-color:var(--border)">Next review in ${sched.interval} day${sched.interval === 1 ? '' : 's'}</span>`);
  
  el.aiPanelContent.innerHTML = `
    <div class="flashcards-container">
      <div style="display:flex;justify-content:center;margin-bottom:6px">${srsBadge}</div>
      <div class="flashcard-wrapper" onclick="this.querySelector('.flashcard').classList.toggle('flipped')">
        <div class="flashcard">
          <div class="flashcard-front">
            <div class="flashcard-badge">Question / Term</div>
            <div class="flashcard-text">${escapeHtml(card.question)}</div>
          </div>
          <div class="flashcard-back">
            <div class="flashcard-badge">Answer / Definition</div>
            <div class="flashcard-text">${escapeHtml(card.answer)}</div>
          </div>
        </div>
      </div>
      
      <div class="flashcard-feedback-actions">
        <button class="feedback-btn easy" title="Quality 5 — longer interval" onclick="rateFlashcard('easy')">Easy</button>
        <button class="feedback-btn medium" title="Quality 4 — standard interval" onclick="rateFlashcard('medium')">Medium</button>
        <button class="feedback-btn hard" title="Quality 2 — see again soon" onclick="rateFlashcard('hard')">Hard</button>
      </div>
      
      <div class="flashcard-controls">
        <button class="flashcard-nav-btn" onclick="prevFlashcard()">&larr; Prev</button>
        <span class="flashcard-progress">Card ${pos + 1} of ${cards.length} • ${dueCount} due</span>
        <button class="flashcard-nav-btn" onclick="nextFlashcard()">Next &rarr;</button>
      </div>
      
      <div style="width:100%;margin-top:16px;display:flex;justify-content:center">
        <button class="btn-primary" onclick="exportFlashcardsToAnki()" style="width:100%;font-size:0.82rem;padding:10px;background:var(--accent);border:none;border-radius:var(--radius);cursor:pointer;color:var(--accent-contrast);font-weight:600;display:flex;align-items:center;justify-content:center;gap:6px">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Export to Anki (CSV)
        </button>
      </div>
    </div>
  `;
}

window.rateFlashcard = function(rating) {
  const qMap = { easy: 5, medium: 4, hard: 2 };
  const key = state.activeKey;
  const cache = state.aiCache[key];
  if (cache && cache.flashcards && cache.flashcards.length) {
    const pos = cache.flashcardIndex || 0;
    const actualIdx = (cache.flashcardOrder || [])[pos] ?? pos;
    srsDeck.rate(key, actualIdx, qMap[rating] ?? 4);

    // Hard → re-queue this card a few slots later so you see it again this session
    if (rating === 'hard' && cache.flashcardOrder) {
      const [removed] = cache.flashcardOrder.splice(pos, 1);
      cache.flashcardOrder.splice(Math.min(cache.flashcardOrder.length, pos + 3), 0, removed);
    }
    saveAiCache();
  }
  gamification.awardXp(2, 'flashcard-review');
  window.nextFlashcard();
};

window.prevFlashcard = function() {
  const key = state.activeKey;
  const cache = state.aiCache[key];
  if (cache.flashcards && cache.flashcards.length) {
    cache.flashcardIndex = (cache.flashcardIndex - 1 + cache.flashcards.length) % cache.flashcards.length;
    saveAiCache();
    renderFlashcards(cache.flashcards);
  }
};

window.nextFlashcard = function() {
  const key = state.activeKey;
  const cache = state.aiCache[key];
  if (cache.flashcards && cache.flashcards.length) {
    cache.flashcardIndex = (cache.flashcardIndex + 1) % cache.flashcards.length;
    saveAiCache();
    renderFlashcards(cache.flashcards);
  }
};

/* ---------------- Library Manager: Upload / New Note / New Folder ---------------- */
const NOTE_TEMPLATES = {
  blank: "",
  study: "# {title}\n\n## Key Concepts\n\n- \n\n## Summary\n\n## Questions to Review\n\n1. \n",
  cheatsheet: "# {title} — Cheat Sheet\n\n## Key Definitions\n\n| Term | Definition |\n| --- | --- |\n|  |  |\n\n## Formulas & Syntax\n\n```\n\n```\n\n## Exam Tips\n\n- \n",
  interview: "# {title} — Interview Prep\n\n## Q&A\n\n### Q1. \n\n**A:** \n\n## Rapid-Fire Facts\n\n- \n"
};

/** All known folder paths: from /api/list plus any prefix containing files. */
function getExistingFolders() {
  const folders = new Set(state.folders || []);
  state.files.forEach(f => {
    const parts = f.key.split('/');
    parts.pop(); // Remove filename
    let current = "";
    parts.forEach(part => {
      current = current ? `${current}/${part}` : part;
      folders.add(current);
    });
  });
  return Array.from(folders).sort();
}

/** Normalize a folder path typed by the user. */
function sanitizeFolderPath(raw) {
  return (raw || "").trim().replace(/\/{2,}/g, '/').replace(/^\/+|\/+$/g, '');
}

/** Validate both folder paths and note file names. Returns an error string or null. */
function validatePathInput(value, { isFile = false } = {}) {
  if (!value) return isFile ? "Please enter a file name." : "Please enter a folder name.";
  if (value.includes("..")) return "Path cannot contain '..'";
  if (/[\x00-\x1f]/.test(value)) return "Path contains invalid control characters";
  if (/[\\:*?"<>|]/.test(value)) return 'Path cannot contain \\ : * ? " < > |';
  if (isFile && !/\.(md|markdown)$/i.test(value)) return "File must end with .md (or .markdown)";
  return null;
}

const libraryManager = {
  _activeTab: "upload",
  _queue: [],          // { id, file, relPath, status, progress, error }
  _idCounter: 0,
  _previewTimer: null,

  /* ---------------- init & wiring ---------------- */
  init() {
    // Tab switching
    el.libraryModal.querySelectorAll(".lib-tab").forEach(btn => {
      btn.addEventListener("click", () => this.switchTab(btn.dataset.tab));
    });
    el.libraryModalClose.addEventListener("click", () => this.close());
    el.libSubmitBtn.addEventListener("click", () => this.submit());

    // Searchable folder combos
    this.bindCombo(el.libUploadFolderInput, el.libUploadFolderList);
    this.bindCombo(el.libNoteFolderInput, el.libNoteFolderList);
    this.bindCombo(el.libFolderParentInput, el.libFolderParentList);

    // Drop zone
    el.libDropZone.addEventListener("dragover", (e) => { e.preventDefault(); el.libDropZone.classList.add("drag-over"); });
    el.libDropZone.addEventListener("dragleave", () => el.libDropZone.classList.remove("drag-over"));
    el.libDropZone.addEventListener("drop", async (e) => {
      e.preventDefault();
      el.libDropZone.classList.remove("drag-over");
      await this.importDataTransfer(e.dataTransfer);
    });
    el.libFileInput.addEventListener("change", async (e) => {
      await this.importDataTransfer(e.target);
      el.libFileInput.value = "";
    });
    el.libFolderInput.addEventListener("change", (e) => {
      this.addFiles([...e.target.files]);
      el.libFolderInput.value = "";
    });

    // Conflict bar actions
    el.libConflictSkipBtn.addEventListener("click", () => this.resolveConflicts("skip"));
    el.libConflictOverwriteBtn.addEventListener("click", () => this.resolveConflicts("overwrite"));

    // New Note tab: validation, template, preview
    el.libNoteNameInput.addEventListener("input", () => { this.validateNoteForm(); this.renderNotePreview(); });
    el.libNoteFolderInput.addEventListener("input", () => this.validateNoteForm());
    el.libNoteTemplateSelect.addEventListener("change", () => this.applyTemplate());
    el.libNoteContentInput.addEventListener("input", () => this.renderNotePreview());
    el.libNoteContentInput.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); this.submit(); }
    });

    // New Folder tab: validation
    el.libFolderNameInput.addEventListener("input", () => this.validateFolderForm());
    el.libFolderParentInput.addEventListener("input", () => this.validateFolderForm());
    el.libFolderNameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); this.submit(); }
    });

    // Destination changes can create/remove conflicts live
    el.libUploadFolderInput.addEventListener("input", () => { this.refreshConflictFlags(); this.renderQueue(); });
  },

  open(tab = "upload", prefillFolder = null) {
    show(el.libraryModal, 'flex');
    el.libFooterStatus.textContent = "";
    if (prefillFolder !== null && prefillFolder !== undefined) {
      el.libUploadFolderInput.value = prefillFolder;
      el.libNoteFolderInput.value = prefillFolder;
      el.libFolderParentInput.value = prefillFolder;
    }
    this.switchTab(tab);
  },

  close() { hide(el.libraryModal); },

  switchTab(tab) {
    this._activeTab = tab;
    el.libraryModal.querySelectorAll(".lib-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
    hide(el.libTabUpload); hide(el.libTabNote); hide(el.libTabFolder);
    el.libFooterStatus.textContent = "";

    if (tab === "upload") {
      show(el.libTabUpload, 'block');
      el.libSubmitBtn.textContent = "Upload";
      this.refreshConflictFlags();
      this.renderQueue();
      el.libUploadFolderInput.focus();
    } else if (tab === "note") {
      show(el.libTabNote, 'block');
      el.libSubmitBtn.textContent = "Create Note";
      el.libSubmitBtn.style.background = "var(--success)";
      this.validateNoteForm();
      this.renderNotePreview();
      el.libNoteNameInput.focus();
    } else {
      show(el.libTabFolder, 'block');
      el.libSubmitBtn.textContent = "Create Folder";
      el.libSubmitBtn.style.background = "var(--success)";
      this.validateFolderForm();
      el.libFolderNameInput.focus();
    }
    if (tab === "upload") el.libSubmitBtn.style.background = "var(--accent)";
  },

  /* ---------------- searchable folder combo ---------------- */
  bindCombo(inputEl, listEl) {
    const render = () => {
      const q = inputEl.value.trim().toLowerCase();
      const folders = getExistingFolders().filter(f => !q || f.toLowerCase().includes(q));
      let html = `<div class="lib-combo-item" data-value="">📂 (Root Directory)</div>`;
      html += folders.slice(0, 50).map(f => `<div class="lib-combo-item" data-value="${escapeHtml(f)}">📁 ${escapeHtml(f)}</div>`).join("");
      listEl.innerHTML = html;
      show(listEl, 'block');
    };
    inputEl.addEventListener("focus", render);
    inputEl.addEventListener("input", render);
    inputEl.addEventListener("blur", () => setTimeout(() => hide(listEl), 180));
    listEl.addEventListener("click", (e) => {
      const item = e.target.closest(".lib-combo-item");
      if (item) { inputEl.value = item.dataset.value; hide(listEl); inputEl.dispatchEvent(new Event("input")); }
    });
  },

  /* ---------------- upload queue ---------------- */
  targetKeyFor(item) {
    const dest = sanitizeFolderPath(el.libUploadFolderInput.value);
    return (dest ? dest + "/" : "") + item.relPath;
  },

  refreshConflictFlags() {
    const existing = new Set(state.files.map(f => f.key));
    const seen = new Set();
    this._queue.forEach(q => {
      if (["pending", "conflict", "skipped", "pending-overwrite"].includes(q.status)) {
        const key = this.targetKeyFor(q);
        const isDupInQueue = seen.has(key);
        seen.add(key);
        if (isDupInQueue) q.status = "skipped";
        else if (q.status === "skipped" && !existing.has(key)) q.status = "pending";
        else if (existing.has(key) && q.status !== "pending-overwrite" && q.status !== "skipped") q.status = "conflict";
        else if (!existing.has(key) && (q.status === "conflict" || q.status === "pending-overwrite" || q.status === "skipped")) q.status = "pending";
      }
    });
  },

  addFiles(fileList) {
    let skipped = 0;
    for (const file of fileList) {
      if (!/\.(md|markdown)$/i.test(file.name)) { skipped++; continue; }
      const relPath = (file._relPath || file.webkitRelativePath || file.name).replace(/^\/+/, "");
      if (this._queue.some(q => q.relPath === relPath && q.file.size === file.size)) continue;
      this._queue.push({ id: ++this._idCounter, file, relPath, status: "pending", progress: 0, error: null });
    }
    this.refreshConflictFlags();
    this.renderQueue();
    if (skipped > 0) {
      el.libFooterStatus.textContent = `ℹ️ ${skipped} file${skipped === 1 ? '' : 's'} skipped — only .md / .markdown are supported.`;
    }
  },

  resolveConflicts(mode) {
    this._queue.forEach(q => {
      if (q.status === "conflict") q.status = mode === "overwrite" ? "pending-overwrite" : "skipped";
    });
    this.renderQueue();
  },

  removeFromQueue(id) {
    this._queue = this._queue.filter(q => q.id !== id);
    this.refreshConflictFlags();
    this.renderQueue();
  },

  renderQueue() {
    const conflictCount = this._queue.filter(q => q.status === "conflict").length;
    if (conflictCount > 0) {
      show(el.libConflictBar, 'flex');
      el.libConflictText.textContent = `⚠️ ${conflictCount} file${conflictCount === 1 ? '' : 's'} already exist${conflictCount === 1 ? 's' : ''} at the destination.`;
    } else {
      hide(el.libConflictBar);
    }

    el.libUploadQueue.innerHTML = this._queue.map(q => {
      let statusHtml;
      if (q.status === "uploading") {
        statusHtml = `<span class="lib-progress"><span class="lib-progress-fill" style="width:${q.progress}%"></span></span>`;
      } else if (q.status === "done") {
        statusHtml = `<span style="color:var(--success)">✓</span>`;
      } else if (q.status === "error") {
        statusHtml = `<button class="remove-file lib-retry" data-retry="${q.id}" title="${escapeHtml(q.error || 'failed')} — click to retry">↻</button>`;
      } else if (q.status === "conflict") {
        statusHtml = `<span style="color:var(--warning,#d97706)" title="File exists at destination">⚠</span>`;
      } else if (q.status === "skipped") {
        statusHtml = `<span style="color:var(--text-dim)" title="Skipped">⊘</span>`;
      } else {
        statusHtml = `<button class="remove-file" data-remove="${q.id}">×</button>`;
      }
      const sub = q.status === "error" && q.error ? `<div class="lib-queue-error">${escapeHtml(q.error)}</div>` : "";
      return `
        <div class="upload-queue-item ${q.status}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
          <div class="file-name" title="${escapeHtml(q.relPath)}">${escapeHtml(q.relPath)}${sub}</div>
          <div class="file-size">${(q.file.size / 1024).toFixed(1)} KB</div>
          ${statusHtml}
        </div>
      `;
    }).join("");

    el.libUploadQueue.querySelectorAll("[data-remove]").forEach(btn =>
      btn.addEventListener("click", () => this.removeFromQueue(parseInt(btn.dataset.remove, 10))));
    el.libUploadQueue.querySelectorAll("[data-retry]").forEach(btn =>
      btn.addEventListener("click", () => {
        const item = this._queue.find(q => q.id === parseInt(btn.dataset.retry, 10));
        if (item) { item.status = "pending-overwrite"; item.error = null; this.renderQueue(); }
      }));

    const uploadable = this._queue.filter(q => q.status === "pending" || q.status === "pending-overwrite").length;
    if (this._activeTab === "upload") {
      el.libSubmitBtn.disabled = uploadable === 0;
      el.libSubmitBtn.textContent = uploadable > 0 ? `Upload ${uploadable} file${uploadable === 1 ? '' : 's'}` : "Upload";
    }
  },

  uploadOne(item) {
    const key = this.targetKeyFor(item);
    const overwrite = item.status === "pending-overwrite";
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", `/api/upload?key=${encodeURIComponent(key)}&overwrite=${overwrite ? "true" : "false"}`);
      const authKey = localStorage.getItem("md-reader-auth-key");
      if (authKey) xhr.setRequestHeader("X-Auth-Key", authKey);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          item.progress = Math.round((e.loaded / e.total) * 100);
          this.renderQueue();
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve(key);
        else if (xhr.status === 401) { localStorage.removeItem("md-reader-auth-key"); reject(new Error("Unauthorized (401) — auth key rejected or required")); }
        else if (xhr.status === 409) reject(new Error("Already exists (409)"));
        else reject(new Error(`HTTP ${xhr.status}: ${xhr.responseText.slice(0, 120)}`));
      };
      xhr.onerror = () => reject(new Error("Network error"));
      xhr.send(item.file);
    });
  },

  /* ---------------- drag & drop recursion (folders) ---------------- */
  async importDataTransfer(source) {
    let files = [];
    const items = source.items && source.items.length ? source.items : null;
    const canRecurse = items && [...items].some(i => i.webkitGetAsEntry && i.webkitGetAsEntry());
    if (canRecurse) {
      files = await this.collectDroppedFiles(items);
    } else {
      files = [...(source.files || [])].map(f => { f._relPath = f.webkitRelativePath || f.name; return f; });
    }
    this.addFiles(files);
    this.switchTab("upload");
  },

  /** Recursively walk dropped FileSystemEntry trees, keeping relative paths. */
  async collectDroppedFiles(items) {
    const out = [];
    const readEntry = (entry, prefix) => new Promise((resolve) => {
      if (entry.isFile) {
        entry.file((f) => {
          if (/\.(md|markdown)$/i.test(f.name)) {
            f._relPath = prefix + f.name;
            out.push(f);
          }
          resolve();
        }, resolve);
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const readBatch = () => reader.readEntries(async (entries) => {
          if (!entries.length) return resolve();
          await Promise.all(entries.map(e => readEntry(e, `${prefix}${entry.name}/`)));
          readBatch(); // readEntries returns max 100 items per call
        }, resolve);
        readBatch();
      } else resolve();
    });
    const entries = [...items].map(i => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
    await Promise.all(entries.map(e => readEntry(e, "")));
    return out;
  },

  /* ---------------- New Note tab ---------------- */
  noteTitleFromName() {
    return (el.libNoteNameInput.value.trim().replace(/\.(md|markdown)$/i, '') || "Untitled").replace(/[-_]+/g, ' ');
  },

  validateNoteForm() {
    let name = el.libNoteNameInput.value.trim();
    const folder = sanitizeFolderPath(el.libNoteFolderInput.value);
    let msg = "";
    let ok = true;

    if (!name) { ok = false; }
    else {
      if (!/\.(md|markdown)$/i.test(name)) name += ".md";
      const err = validatePathInput(name, { isFile: true });
      if (err) { ok = false; msg = err; }
      else if (folder && (validatePathInput(folder) || folder.includes(".."))) { ok = false; msg = "Invalid folder path"; }
      else {
        const key = (folder ? folder + "/" : "") + name;
        if (state.files.some(f => f.key === key)) { ok = false; msg = `⚠️ "${key}" already exists — pick another name`; }
      }
    }

    el.libNoteNameHint.textContent = msg;
    el.libNoteNameHint.style.color = msg ? "var(--error)" : "var(--text-dim)";
    if (this._activeTab === "note") el.libSubmitBtn.disabled = !ok;
    return { ok, name };
  },

  applyTemplate() {
    const tpl = NOTE_TEMPLATES[el.libNoteTemplateSelect.value] || "";
    el.libNoteContentInput.value = tpl.replaceAll("{title}", this.noteTitleFromName());
    this.renderNotePreview();
  },

  renderNotePreview() {
    clearTimeout(this._previewTimer);
    this._previewTimer = setTimeout(() => {
      el.libNotePreview.innerHTML = renderMd(el.libNoteContentInput.value || "*Preview will appear here…*");
    }, 180);
  },

  async submitNote() {
    const { ok, name } = this.validateNoteForm();
    if (!ok) return;
    const folder = sanitizeFolderPath(el.libNoteFolderInput.value);
    const key = (folder ? folder + "/" : "") + name;

    el.libSubmitBtn.disabled = true;
    el.libFooterStatus.textContent = "Creating note…";
    try {
      const res = await authFetch(`/api/upload?key=${encodeURIComponent(key)}`, {
        method: "PUT",
        body: el.libNoteContentInput.value || NOTE_TEMPLATES.blank
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      el.libFooterStatus.textContent = "✅ Note created.";
      await loadFileList();
      this.close();
      await openFile(key);
    } catch (err) {
      el.libFooterStatus.textContent = "❌ " + err.message;
    } finally {
      el.libSubmitBtn.disabled = false;
    }
  },

  /* ---------------- New Folder tab ---------------- */
  validateFolderForm() {
    const parent = sanitizeFolderPath(el.libFolderParentInput.value);
    const name = sanitizeFolderPath(el.libFolderNameInput.value);
    let msg = "";
    let ok = true;

    if (!name) { ok = false; }
    else {
      const err = validatePathInput(name);
      if (err) { ok = false; msg = err; }
      else if (parent && validatePathInput(parent)) { ok = false; msg = "Invalid parent folder path"; }
      else {
        const fullPath = parent ? `${parent}/${name}` : name;
        if ((state.folders || []).includes(fullPath)) { ok = false; msg = `⚠️ Folder "${fullPath}" already exists`; }
      }
    }

    el.libFolderNameHint.textContent = msg;
    el.libFolderNameHint.style.color = msg ? "var(--error)" : "var(--text-dim)";
    if (this._activeTab === "folder") el.libSubmitBtn.disabled = !ok;
    return { ok, fullPath: name ? (parent ? `${parent}/${name}` : name) : null };
  },

  async submitFolder() {
    const { ok, fullPath } = this.validateFolderForm();
    if (!ok || !fullPath) return;
    el.libSubmitBtn.disabled = true;
    el.libFooterStatus.textContent = "Creating folder…";
    try {
      const res = await authFetch("/api/folder", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: fullPath })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      await loadFileList();
      el.libFooterStatus.textContent = `✅ Folder "${fullPath}" ready.`;
      hide(el.libraryModal);
    } catch (err) {
      el.libFooterStatus.textContent = "❌ " + err.message;
    } finally {
      el.libSubmitBtn.disabled = false;
    }
  },

  /* ---------------- submit dispatcher ---------------- */
  async submit() {
    if (this._activeTab === "note") return this.submitNote();
    if (this._activeTab === "folder") return this.submitFolder();

    // Upload tab
    const uploadable = this._queue.filter(q => q.status === "pending" || q.status === "pending-overwrite");
    if (uploadable.length === 0) return;

    el.libSubmitBtn.disabled = true;
    let done = 0, failed = 0, skipped = this._queue.filter(q => q.status === "skipped").length;
    let firstDoneKey = null;

    for (const item of uploadable) {
      item.status = "uploading";
      item.progress = 0;
      this.renderQueue();
      try {
        const key = await this.uploadOne(item);
        item.status = "done";
        if (!firstDoneKey) firstDoneKey = key;
        done++;
      } catch (err) {
        item.status = "error";
        item.error = err.message;
        failed++;
      }
      this.renderQueue();
    }

    el.libSubmitBtn.disabled = false;
    el.libFooterStatus.textContent = `${done ? `✅ ${done} uploaded` : ''}${failed ? ` · ❌ ${failed} failed` : ''}${skipped ? ` · ⊘ ${skipped} skipped` : ''}`.trim();

    if (done > 0) {
      await loadFileList();
      // Auto-open the first successfully uploaded document
      if (firstDoneKey) {
        this.close();
        await openFile(firstDoneKey);
      }
    }
  }
};

el.uploadToggleBtn.addEventListener("click", () => libraryManager.open("upload"));
el.createFileToggleBtn.addEventListener("click", () => libraryManager.open("note"));
libraryManager.init();

/* ---------------- Folder actions (context menu) ---------------- */
async function renameFolderInteractive(oldPath) {
  const newPathRaw = prompt(`Rename folder "${oldPath}" — enter the new folder path:`, oldPath);
  if (newPathRaw === null) return;
  const newPath = sanitizeFolderPath(newPathRaw);
  if (!newPath || newPath === oldPath) return;
  const err = validatePathInput(newPath);
  if (err) { alert(err); return; }

  try {
    const res = await authFetch("/api/folder/rename", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ oldPrefix: oldPath, newPrefix: newPath })
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "Rename folder failed");

    // Migrate pins, active keys and AI cache entries that lived under the old prefix
    const swapPrefix = (k) => k.startsWith(oldPath + '/') ? `${data.newPrefix}/${k.slice(oldPath.length + 1)}` : k;
    const oldP = oldPath + '/';
    if (state.pinnedKeys.some(k => k.startsWith(oldP))) {
      state.pinnedKeys = state.pinnedKeys.map(k => k.startsWith(oldP) ? `${data.newPrefix}/${k.slice(oldP)}` : k);
      localStorage.setItem("md-reader-pins", JSON.stringify(state.pinnedKeys));
    }
    if (state.activeKey && state.activeKey.startsWith(oldP)) {
      state.activeKey = `${data.newPrefix}/${state.activeKey.slice(oldP)}`;
      localStorage.setItem("md-reader-active-key", state.activeKey);
    }
    if (state.secondaryKey && state.secondaryKey.startsWith(oldP)) {
      state.secondaryKey = `${data.newPrefix}/${state.secondaryKey.slice(oldP)}`;
    }
    Object.keys(state.aiCache).forEach(k => {
      if (k.startsWith(oldP)) {
        state.aiCache[`${data.newPrefix}/${k.slice(oldP)}`] = state.aiCache[k];
        delete state.aiCache[k];
      }
    });
    saveAiCache();

    await loadFileList();
    if (state.activeKey && state.activeKey.startsWith(data.newPrefix + '/')) {
      await openFile(state.activeKey);
    }
  } catch (err) {
    alert("Rename folder failed: " + err.message);
  }
}

el.cmNewNoteHereBtn.addEventListener("click", () => {
  if (!state.contextMenuTarget) return;
  libraryManager.open("note", state.contextMenuTarget);
  hideContextMenu();
});
el.cmNewFolderHereBtn.addEventListener("click", () => {
  if (!state.contextMenuTarget) return;
  libraryManager.open("folder", state.contextMenuTarget);
  hideContextMenu();
});
el.cmRenameFolderBtn.addEventListener("click", () => {
  if (!state.contextMenuTarget) return;
  renameFolderInteractive(state.contextMenuTarget);
  hideContextMenu();
});
/* ---------------- General Chatbot ---------------- */
function openGeneralChat() {
  state.isGeneralChatActive = true;
  closeSidebar();
  
  if (!state.aiCache["$general"]) {
    state.aiCache["$general"] = {
      activeType: 'general-chat',
      summaryHtml: null,
      chatHistory: [],
      quizData: null,
      quizAnswers: {},
      flashcards: null,
      flashcardIndex: 0
    };
    saveAiCache();
  }
  
  openAiPanel("💬 General Assistant", true, 'general-chat');
  state.chatHistory = state.aiCache["$general"].chatHistory;
  
  if (state.chatHistory.length === 0) {
    state.chatHistory.push({
      role: "model",
      parts: [{ text: "Hello! I am your General AI Assistant. How can I help you with your studies or anything else today?" }],
      extra: {
        keyConcepts: ["Study Help", "General Q&A", "Concept Explanations"],
        suggestedQuestions: [
          "Explain quantum physics in simple terms",
          "What are the best techniques for active recall?",
          "Write a study schedule for exams"
        ]
      }
    });
    saveAiCache();
    renderChat();
    hide(el.aiSpinner);
  } else {
    renderChat();
    hide(el.aiSpinner);
  }
}

el.sidebarGeneralChatBtn.addEventListener("click", openGeneralChat);
el.emptyStateChatBtn.addEventListener("click", openGeneralChat);

el.clearChatBtn.addEventListener("click", () => {
  if (confirm("Are you sure you want to clear this chat conversation?")) {
    const key = state.isGeneralChatActive ? "$general" : state.activeKey;
    if (state.aiCache[key]) {
      state.aiCache[key].chatHistory = [];
      saveAiCache();
      if (state.isGeneralChatActive) {
        openGeneralChat();
      } else {
        sendChatPrompt("Explain the key concepts of this document.");
      }
    }
  }
});

/* ---------------- Word Stats helper ---------------- */
function updateReadingStats(text) {
  if (!text) {
    el.wordCountText.textContent = "0 words";
    el.readingTimeText.textContent = "0 min read";
    return;
  }
  const cleanText = text.trim();
  const words = cleanText ? cleanText.split(/\s+/).length : 0;
  const readingTime = Math.max(1, Math.round(words / 200));
  
  el.wordCountText.textContent = `${words} word${words === 1 ? '' : 's'}`;
  el.readingTimeText.textContent = `${readingTime} min read`;
}

function updateReadingStatsSecondary(text) {
  if (!text) {
    el.wordCountTextSecondary.textContent = "0 words";
    el.readingTimeTextSecondary.textContent = "0 min read";
    return;
  }
  const cleanText = text.trim();
  const words = cleanText ? cleanText.split(/\s+/).length : 0;
  const readingTime = Math.max(1, Math.round(words / 200));
  
  el.wordCountTextSecondary.textContent = `${words} word${words === 1 ? '' : 's'}`;
  el.readingTimeTextSecondary.textContent = `${readingTime} min read`;
}

/* ---------------- Inline Editing & Auto-Save ---------------- */
let editMode = false;
let autoSaveTimeout = null;

async function fetchRawMarkdown(key) {
  const res = await fetch(`/api/file?key=${encodeURIComponent(key)}`);
  if (!res.ok) throw new Error(`Could not load the document from storage (HTTP ${res.status})`);
  return await res.text();
}

async function toggleEditMode(editing) {
  if (editing && !state.isEditingUnlocked) {
    const pwd = prompt("This editing feature is locked. Please enter the password to unlock editing:");
    if (pwd !== "ajithvnr2001") {
      alert("Incorrect password. Editing remains locked.");
      return;
    }
    state.isEditingUnlocked = true;
  }

  editMode = editing;
  if (editing) {
    // Stop TTS if speaking
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      el.readAloudBtn.classList.remove("active");
    }
    
    // Load the raw markdown FIRST — never enter edit mode with a failed/empty load,
    // otherwise clicking Done would overwrite the stored file with empty content.
    show(el.editorContainer, 'flex');
    hide(el.content);
    hide(el.aiToolbar);
    hide(el.searchDocToggleBtn);
    hide(el.searchDocContainer);
    el.editBtn.classList.add("active");
    el.saveStatus.textContent = "Loading raw text...";
    el.editorTextarea.disabled = true;
    el.editorLoadedOk = false;
    
    try {
      const rawMd = await fetchRawMarkdown(state.activeKey);
      el.editorTextarea.value = rawMd;
      el.editorLoadedOk = true;
      el.editorTextarea.disabled = false;
      el.saveStatus.textContent = "Ready to edit";
      el.editorTextarea.focus();
    } catch (err) {
      // Abort editing cleanly — keep the reader view, keep R2 content untouched
      hide(el.editorContainer);
      show(el.content);
      show(el.aiToolbar, 'flex');
      show(el.searchDocToggleBtn, 'flex');
      el.editBtn.classList.remove("active");
      editMode = false;
      alert("Unable to open the editor: " + err.message);
    }
  } else {
    // Save current editor text to R2 on Done click — but only if it loaded successfully
    if (el.editorLoadedOk) {
      await saveDocumentContent(false);
    } else {
      el.saveStatus.textContent = "Save skipped — document was never loaded correctly";
    }
    
    // Show content rendering & toolbars
    hide(el.editorContainer);
    el.editBtn.classList.remove("active");
    show(el.content);
    show(el.aiToolbar, 'flex');
    show(el.searchDocToggleBtn, 'flex');
    
    // Re-render markdown & stats & TOC
    const text = el.editorTextarea.value;
    el.content.innerHTML = renderMd(text);
    originalContentHtml = ""; // rendering changed — reset search snapshot
    if (window.renderMathInElement) {
      renderMathInElement(el.content, {
        delimiters: [
          {left: "$$", right: "$$", display: true},
          {left: "$", right: "$", display: false}
        ],
        throwOnError: false
      });
    }
    updateReadingStats(text);
    buildTOC();
    // Re-apply glossary highlights after an edit re-render
    if (autoGlossary.terms && autoGlossary.terms.length) autoGlossary.applyToDOM();
  }
}

async function saveDocumentContent(isAutoSave = false) {
  if (!state.activeKey) return;
  if (el.editorLoadedOk === false) {
    el.saveStatus.textContent = "Save blocked — editor content was never loaded correctly";
    return;
  }
  el.saveStatus.textContent = isAutoSave ? "Auto-saving..." : "Saving...";
  
  try {
    const content = el.editorTextarea.value;
    const res = await authFetch(`/api/upload?key=${encodeURIComponent(state.activeKey)}`, {
      method: "PUT",
      body: content
    });
    if (!res.ok) throw new Error("Save request failed");
    
    const now = new Date().toLocaleTimeString();
    el.saveStatus.textContent = `${isAutoSave ? 'Auto-saved' : 'Saved'} successfully at ${now}`;
  } catch (err) {
    el.saveStatus.textContent = "Failed to save: " + err.message;
  }
}

el.editBtn.addEventListener("click", () => {
  toggleEditMode(!editMode);
});

el.saveBtn.addEventListener("click", () => {
  saveDocumentContent(false);
});

el.cancelEditBtn.addEventListener("click", () => {
  toggleEditMode(false);
});

el.editorTextarea.addEventListener("input", () => {
  el.saveStatus.textContent = "Typing...";
  clearTimeout(autoSaveTimeout);
  autoSaveTimeout = setTimeout(() => {
    saveDocumentContent(true);
  }, 2000);
});

/* ---------------- Anki CSV Export ---------------- */
window.exportFlashcardsToAnki = function() {
  const key = state.activeKey;
  if (!key || !state.aiCache[key] || !state.aiCache[key].flashcards) {
    alert("No generated flashcards found for this document.");
    return;
  }
  
  const cards = state.aiCache[key].flashcards;
  if (cards.length === 0) {
    alert("No flashcards to export.");
    return;
  }
  
  // Format as CSV: "question","answer"
  let csvContent = "";
  cards.forEach(card => {
    // Escape double quotes by doubling them
    const q = card.question.replace(/"/g, '""');
    const a = card.answer.replace(/"/g, '""');
    csvContent += `"${q}","${a}"\n`;
  });
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  
  // Clean filename: remove folder prefixes and append suffix
  const filename = key.split('/').pop().replace(/\.[^/.]+$/, "");
  link.setAttribute("href", url);
  link.setAttribute("download", `${filename}_Flashcards.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/* ---------------- Document Exporter (PDF & HTML) ---------------- */
el.exportPdfBtn.addEventListener("click", () => {
  if (editMode) {
    alert("Please finish editing before exporting.");
    return;
  }
  if (!state.activeKey) return;
  // Ensure plain-document print mode (not cheat-sheet mode)
  document.body.classList.remove("printing-cheatsheet");
  window.print();
});

// Clean up cheat-sheet print mode after the dialog closes
window.addEventListener("afterprint", () => {
  document.body.classList.remove("printing-cheatsheet");
});

el.exportHtmlBtn.addEventListener("click", () => {
  if (editMode) {
    alert("Please finish editing before exporting.");
    return;
  }
  const key = state.activeKey;
  if (!key) return;
  
  const docName = key.split('/').pop().replace(/\.[^/.]+$/, "");
  const renderedHtml = el.content.innerHTML;
  
  const standaloneHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${docName}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
      max-width: 800px;
      margin: 40px auto;
      padding: 0 20px;
      color: #333;
      background: #fff;
    }
    h1, h2, h3 { border-bottom: 1px solid #eee; padding-bottom: 8px; }
    code { background: rgba(0,0,0,0.05); padding: 2px 6px; border-radius: 4px; font-family: monospace; }
    pre { background: rgba(0,0,0,0.05); padding: 15px; border-radius: 6px; overflow: auto; }
    blockquote { border-left: 4px solid #ddd; padding-left: 15px; color: #666; margin: 0; }
  </style>
</head>
<body>
  ${renderedHtml}
</body>
</html>`;

  const blob = new Blob([standaloneHtml], { type: "text/html;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `${docName}.html`);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});

/* ---------------- Drag-and-Drop Tree logic ---------------- */
async function moveFileViaApi(oldKey, newFolder) {
  try {
    const res = await authFetch("/api/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldKey, newFolder })
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "Move failed");

    // Keep pins consistent after a move
    if (state.pinnedKeys.includes(oldKey)) {
      state.pinnedKeys = state.pinnedKeys.filter(k => k !== oldKey);
      state.pinnedKeys.push(data.newKey);
      localStorage.setItem("md-reader-pins", JSON.stringify(state.pinnedKeys));
    }

    await loadFileList();

    if (state.activeKey === oldKey) {
      state.activeKey = data.newKey;
      localStorage.setItem("md-reader-active-key", data.newKey);
      await openFile(data.newKey);
    }
  } catch (err) {
    alert("Error moving file: " + err.message);
  }
}

el.fileList.addEventListener("dragover", (e) => {
  e.preventDefault();
  const header = e.target.closest(".folder-header");
  el.fileList.querySelectorAll(".folder-header.drag-over").forEach(h => {
    if (h !== header) h.classList.remove("drag-over");
  });
  if (header) header.classList.add("drag-over");
});

el.fileList.addEventListener("dragleave", (e) => {
  const header = e.target.closest(".folder-header");
  if (header && !header.contains(e.relatedTarget)) header.classList.remove("drag-over");
});

el.fileList.addEventListener("drop", async (e) => {
  e.preventDefault();
  const header = e.target.closest(".folder-header");
  el.fileList.querySelectorAll(".folder-header.drag-over").forEach(h => h.classList.remove("drag-over"));
  const targetFolder = header ? (header.dataset.path || "") : "";

  // OS file/folder drop → import into the target folder (opens the Library Manager)
  if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    await libraryManager.importDataTransfer(e.dataTransfer);
    if (targetFolder) {
      el.libUploadFolderInput.value = targetFolder;
      libraryManager.refreshConflictFlags();
      libraryManager.renderQueue();
    }
    return;
  }

  // Internal tree drag → move existing file
  const oldKey = e.dataTransfer.getData("text/plain");
  if (!oldKey) return;
  await moveFileViaApi(oldKey, targetFolder);
});

/* ================================================================
   MIND MAP STUDIO
   Deterministic mind maps: AI produces a JSON node tree → we render
   Mermaid ourselves (TD / LR / radial), with auto-fit zoom, touch
   pinch/pan, regenerate/edit/copy, SVG+PNG export, and interactive nodes.
   ================================================================ */
const mindMapStudio = {
  tree: null,
  treeScope: null,         // { type: 'doc'|'selection' }
  layout: localStorage.getItem("md-reader-mindmap-layout") || "TD",
  currentCode: "",
  zoom: 1,
  fitZoom: 1,
  editing: false,
  focusedLabel: null,

  _flat: [],               // [{ idx, id, label, parent, depth }]
  _container: null,
  _dragState: null,
  _themeObserver: null,

  /* ---------------- init ---------------- */
  init() {
    this._container = document.getElementById("mindMapContainer");

    // Open modal
    el.mindMapBtn.addEventListener("click", () => this.open());
    el.mindMapModalClose.addEventListener("click", () => hide(el.mindMapModal));

    // Zoom controls
    el.mindMapZoomIn.addEventListener("click", () => this.setZoom(this.zoom * 1.2));
    el.mindMapZoomOut.addEventListener("click", () => this.setZoom(this.zoom / 1.2));
    el.mindMapZoomReset.addEventListener("click", () => this.applyFit());

    // Layout switcher
    const layoutBtns = { TD: el.mindMapLayoutTd, LR: el.mindMapLayoutLr, mindmap: el.mindMapLayoutMm };
    for (const [layout, btn] of Object.entries(layoutBtns)) {
      btn.addEventListener("click", () => this.setLayout(layout));
    }

    // Regenerate / edit / copy / exports
    el.mindMapRegenBtn.addEventListener("click", () => this.regenerate());
    el.mindMapEditBtn.addEventListener("click", () => this.toggleEditor());
    el.mindMapEditApplyBtn.addEventListener("click", () => this.applyEditedCode());
    el.mindMapCopyBtn.addEventListener("click", () => this.copyCode());
    el.mindMapExportSvg.addEventListener("click", () => this.exportSvg());
    el.mindMapExportPng.addEventListener("click", () => this.exportPng());

    // Selection scope bar
    el.mindMapUseSelectionBtn.addEventListener("click", () => this.generateFromSelection());
    el.mindMapUseDocBtn.addEventListener("click", () => this.generateFromDoc(true));

    // Wheel zoom (desktop)
    this._container.addEventListener("wheel", (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      this.setZoom(this.zoom * delta);
    }, { passive: false });

    // Mouse drag pan (native scroll + drag for mice)
    this._container.addEventListener("mousedown", (e) => {
      if (e.target.closest("button, .node")) return;
      this._dragState = { x: e.clientX, y: e.clientY, sl: this._container.scrollLeft, st: this._container.scrollTop, moved: false };
      this._container.style.cursor = "grabbing";
    });
    window.addEventListener("mousemove", (e) => {
      if (!this._dragState) return;
      const dx = e.clientX - this._dragState.x;
      const dy = e.clientY - this._dragState.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) this._dragState.moved = true;
      this._container.scrollLeft = this._dragState.sl - dx;
      this._container.scrollTop = this._dragState.st - dy;
    });
    window.addEventListener("mouseup", () => {
      this._dragState = null;
      this._container.style.cursor = "";
    });

    // Touch: single-finger pan, two-finger pinch zoom
    this._touchStart = null;
    this._container.addEventListener("touchstart", (e) => {
      if (e.touches.length === 1) {
        this._touchStart = { mode: "pan", x: e.touches[0].clientX, y: e.touches[0].clientY, sl: this._container.scrollLeft, st: this._container.scrollTop };
      } else if (e.touches.length === 2) {
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        this._touchStart = { mode: "pinch", dist: d, zoom: this.zoom };
      }
    }, { passive: true });
    this._container.addEventListener("touchmove", (e) => {
      if (!this._touchStart) return;
      if (this._touchStart.mode === "pan" && e.touches.length === 1) {
        this._container.scrollLeft = this._touchStart.sl - (e.touches[0].clientX - this._touchStart.x);
        this._container.scrollTop = this._touchStart.st - (e.touches[0].clientY - this._touchStart.y);
      } else if (this._touchStart.mode === "pinch" && e.touches.length === 2) {
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        this.setZoom(this._touchStart.zoom * (d / this._touchStart.dist));
      }
    }, { passive: true });
    this._container.addEventListener("touchend", () => { this._touchStart = null; });

    // Node click: subtree focus. Background click: reset.
    this._container.addEventListener("click", (e) => {
      const label = this.resolveNodeLabel(e.target);
      if (label) this.focusSubtree(label);
      else this.resetFocus();
    });
    // Right-click (or long-press): ask AI about node
    this._container.addEventListener("contextmenu", (e) => {
      const label = this.resolveNodeLabel(e.target);
      if (!label) return;
      e.preventDefault();
      this.askAboutNode(label);
    });
    let longPressTimer = null;
    this._container.addEventListener("touchstart", (e) => {
      const label = this.resolveNodeLabel(e.target);
      if (!label) return;
      longPressTimer = setTimeout(() => { this.askAboutNode(label); longPressTimer = null; }, 650);
    }, { passive: true });
    this._container.addEventListener("touchend", () => { clearTimeout(longPressTimer); longPressTimer = null; });
    this._container.addEventListener("touchmove", () => { clearTimeout(longPressTimer); longPressTimer = null; });

    // Theme change → re-render with the right mermaid palette
    this._themeObserver = new MutationObserver(() => {
      if (el.mindMapModal.style.display !== "none" && this.currentCode) this.render(this.currentCode, false);
    });
    this._themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  },

  /* ---------------- open + scope handling ---------------- */
  open() {
    if (!state.activeKey) return;
    show(el.mindMapModal, 'flex');
    this.focusedLabel = null;

    // Offer selection-scope if text is selected
    const sel = (window.getSelection().toString() || "").trim();
    if (sel.length > 60 && el.mindMapSelectionText) {
      el.mindMapSelectionText.textContent = `You have ${sel.length} characters of text selected`;
      show(el.mindMapSelectionBar, 'flex');
    } else {
      hide(el.mindMapSelectionBar);
    }

    // Cached tree for this scope?
    const cache = state.aiCache[state.activeKey];
    if (cache && cache.mindmapTree) {
      this.tree = cache.mindmapTree;
      this.treeScope = cache.mindmapScope || { type: "doc" };
      this.renderTree();
      return;
    }
    this.generateFromDoc(false);
  },

  async generateFromDoc(force) {
    hide(el.mindMapSelectionBar);
    await this.generate({ selection: null, force });
  },

  async generateFromSelection() {
    const sel = (window.getSelection().toString() || "").trim();
    hide(el.mindMapSelectionBar);
    if (!sel) return this.generateFromDoc(false);
    await this.generate({ selection: sel, force: true });
  },

  async generate({ selection, force }) {
    if (!state.activeKey) return;
    show(el.mindMapSpinner, 'flex');
    this._container.style.display = "none";
    el.mindMapEditError.textContent = "";

    const cache = state.aiCache[state.activeKey];
    if (!force && cache && cache.mindmapTree) {
      this.tree = cache.mindmapTree;
      this.renderTree();
      return;
    }

    try {
      const res = await fetch("/api/ai/mindmap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: state.activeKey, model: state.selectedModel, selection })
      });
      const data = await res.json();
      hide(el.mindMapSpinner);
      this._container.style.display = "";
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);

      this.tree = data.topic;
      this.treeScope = { type: data.scoped ? "selection" : "doc" };
      cache.mindmapTree = this.tree;
      cache.mindmapScope = this.treeScope;
      saveAiCache();
      this.editing = false;
      this.renderTree();
    } catch (err) {
      hide(el.mindMapSpinner);
      this._container.style.display = "";
      this._container.innerHTML = `<div style="color:var(--error);text-align:center;padding:24px">⚠️ Failed to generate mind map: ${escapeHtml(err.message)}<br><button class="lib-mini-btn" id="mindMapRetryInline" style="margin-top:12px">🔄 Retry</button></div>`;
      const rb = this._container.querySelector("#mindMapRetryInline");
      if (rb) rb.addEventListener("click", () => this.generate({ selection, force: true }));
    }
  },

  regenerate() {
    const cache = state.aiCache[state.activeKey];
    if (cache) delete cache.mindmapTree;
    this.focusedLabel = null;
    this.generate({ selection: this.treeScope && this.treeScope.type === "selection" ? (window.getSelection().toString() || null) : null, force: true });
  },

  /* ---------------- tree → mermaid conversion ---------------- */
  _escapeLabel(s) {
    return String(s).replace(/"/g, "'").replace(/[<>]/g, " ").trim();
  },

  buildFlat() {
    this._flat = [];
    const walk = (node, parentIdx, depth) => {
      const idx = this._flat.length;
      this._flat.push({ idx, id: `n${idx}`, label: node.label, parent: parentIdx, depth });
      (node.children || []).forEach(c => walk(c, idx, depth + 1));
      return idx;
    };
    walk(this.tree, -1, 0);
  },

  childrenOf(idx) {
    return this._flat.filter(n => n.parent === idx).map(n => n.idx);
  },

  treeToMermaid(layout) {
    if (!this.tree) return "";
    this.buildFlat();
    const dir = layout === "LR" ? "LR" : "TD";

    if (layout === "mindmap") {
      const lines = ["mindmap"];
      const write = (idx, depth) => {
        const n = this._flat[idx];
        lines.push("  ".repeat(depth + 1) + `${depth === 0 ? `root((${this._escapeLabel(n.label)}))` : this._escapeLabel(n.label)}`);
        (this.tree ? this.childrenOf(idx) : []).forEach(c => write(c, depth + 1));
      };
      write(0, 0);
      return lines.join("\n");
    }

    const lines = [`graph ${dir}`];
    this._flat.forEach(n => {
      lines.push(`  ${n.id}["${this._escapeLabel(n.label)}"]`);
    });
    this._flat.forEach(n => {
      if (n.parent >= 0) lines.push(`  n${n.parent} --> ${n.id}`);
    });
    // NOTE: mermaid's style grammar does NOT accept var()/parentheses in values
    lines.push(`  style n0 fill:#5b4fd8,color:#ffffff,stroke:#4338ca`);
    return lines.join("\n");
  },

  /* ---------------- rendering: auto-fit zoom + sizing ---------------- */
  async renderTree() {
    this.currentCode = this.treeToMermaid(this.layout);
    const paneOpen = this.editing;
    if (paneOpen && el.mindMapEditText) el.mindMapEditText.value = this.currentCode;
    await this.render(this.currentCode, true);
  },

  async render(code, fitAfter = true) {
    if (!window.mermaid) {
      this.showFallback(code, "Mermaid library not loaded.");
      return;
    }
    try {
      mermaid.initialize({ startOnLoad: false, theme: state.theme === "night" || state.theme === "oled" || state.theme === "forest" || state.theme === "frost" ? "dark" : "default", securityLevel: "loose", flowchart: { curve: "basis" } });
      const { svg } = await mermaid.render(`mindmap-svg-${Date.now()}`, code);
      this.currentCode = code;
      const canvas = document.getElementById("mindMapCanvas");
      canvas.innerHTML = svg;
      const svgEl = canvas.querySelector("svg");
      if (!svgEl) throw new Error("No SVG produced");

      // Natural size from the rendered graphics bounding box
      svgEl.style.position = "absolute";
      svgEl.style.left = "0";
      svgEl.style.top = "0";
      svgEl.style.width = "100%";
      svgEl.style.height = "100%";
      let bbox;
      try { bbox = svgEl.getBBox(); } catch (e) { bbox = { width: 800, height: 600 }; }
      canvas.style.position = "relative";
      canvas.style.width = bbox.width + "px";
      canvas.style.height = bbox.height + "px";

      if (fitAfter) this.applyFit();
      else this.setZoom(this.zoom); // re-render without auto-fit (theme change)
      hide(el.mindMapSpinner);
      this._container.style.display = "";
    } catch (err) {
      this.showFallback(this.currentCode || code, err.message);
    }
  },

  applyFit() {
    const canvas = document.getElementById("mindMapCanvas");
    const cw = this._container.clientWidth - 48;
    const ch = this._container.clientHeight - 48;
    if (!cw || !ch) { this.setZoom(1); return; }
    const w = parseFloat(canvas.style.width) || cw;
    const h = parseFloat(canvas.style.height) || ch;
    this.fitZoom = Math.max(0.3, Math.min(1.0, Math.min(cw / w, ch / h)));
    // Center the wrapper in the container
    canvas.style.margin = "24px auto";
    this.setZoom(this.fitZoom);
  },

  setZoom(z) {
    this.zoom = Math.max(0.2, Math.min(4.0, z));
    if (el.mindMapZoomLevel) el.mindMapZoomLevel.textContent = `${Math.round(this.zoom * 100)}%`;
    const canvas = document.getElementById("mindMapCanvas");
    const svgEl = canvas.querySelector("svg");
    if (svgEl) {
      svgEl.style.transform = `scale(${this.zoom})`;
      svgEl.style.transformOrigin = "0 0";
    }
    // Grow the layout box so scrolling covers the scaled content
    if (canvas._baseW) {
      canvas.style.width = (canvas._baseW * this.zoom) + "px";
      canvas.style.height = (canvas._baseH * this.zoom) + "px";
    } else {
      canvas._baseW = parseFloat(canvas.style.width) || canvas.offsetWidth;
      canvas._baseH = parseFloat(canvas.style.height) || canvas.offsetHeight;
      canvas.style.width = (canvas._baseW * this.zoom) + "px";
      canvas.style.height = (canvas._baseH * this.zoom) + "px";
    }
  },

  showFallback(code, errMsg) {
    this._container.innerHTML = `<div id="mindMapCanvas" class="mindmap-canvas" style="width:100%;text-align:center;padding:20px;color:var(--text-dim)">
      <p style="color:var(--error);margin-bottom:12px">⚠️ Diagram rendering error: ${escapeHtml(errMsg)}</p>
      <p>Raw Mermaid layout code (edit below and Apply):</p>
    </div>`;
    if (!this.editing) this.toggleEditor();
    hide(el.mindMapSpinner);
  },

  /* ---------------- editor / copy / export ---------------- */
  toggleEditor() {
    this.editing = !this.editing;
    el.mindMapEditPane.style.display = this.editing ? "flex" : "none";
    el.mindMapEditError.textContent = "";
    if (this.editing) el.mindMapEditText.value = this.currentCode;
  },

  async applyEditedCode() {
    el.mindMapEditError.textContent = "";
    const code = el.mindMapEditText.value.trim();
    if (!code) { el.mindMapEditError.textContent = "Empty source"; return; }
    try {
      await mermaid.render(`mm-${Date.now()}`, code);
    } catch (err) {
      el.mindMapEditError.textContent = "Mermaid syntax error: " + err.message;
      return;
    }
    await this.render(code, true);
    this.toggleEditor();
    quickToast("✅ Mind map updated");
  },

  copyCode() {
    if (!this.currentCode) return;
    navigator.clipboard.writeText(this.currentCode)
      .then(() => quickToast("⧉ Mermaid source copied"))
      .catch(() => window.prompt("Copy Mermaid source:", this.currentCode));
  },

  exportSvg() {
    const canvas = document.getElementById("mindMapCanvas");
    const svg = canvas.querySelector("svg");
    if (!svg) { alert("No diagram to export."); return; }
    const clone = svg.cloneNode(true);
    clone.style.transform = "none";
    clone.style.position = "static";
    clone.setAttribute("width", canvas._baseW || svg.getBBox().width);
    clone.setAttribute("height", canvas._baseH || svg.getBBox().height);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const serializer = new XMLSerializer();
    let s = serializer.serializeToString(clone);
    if (!s.match(/^<\?xml/)) s = '<?xml version="1.0" standalone="no"?>\n' + s;
    this.downloadBlob(new Blob([s], { type: "image/svg+xml;charset=utf-8" }), `.svg`);
  },

  exportPng() {
    const canvas = document.getElementById("mindMapCanvas");
    const svg = canvas.querySelector("svg");
    if (!svg) { alert("No diagram to export."); return; }
    const clone = svg.cloneNode(true);
    clone.style.transform = "none";
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const w = (canvas._baseW || 800), h = (canvas._baseH || 600);
    clone.setAttribute("width", w);
    clone.setAttribute("height", h);
    const xml = new XMLSerializer().serializeToString(clone);

    const img = new Image();
    const svgUrl = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }));
    img.onload = () => {
      const scale = 2;
      const cv = document.createElement("canvas");
      cv.width = w * scale;
      cv.height = h * scale;
      const ctx = cv.getContext("2d");
      ctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--bg-card") || "#ffffff";
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(svgUrl);
      cv.toBlob((blob) => { if (blob) this.downloadBlob(blob, `.png`); }, "image/png");
    };
    img.onerror = () => { URL.revokeObjectURL(svgUrl); alert("PNG export failed for this diagram."); };
    img.src = svgUrl;
  },

  downloadBlob(blob, ext) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const name = (state.activeKey || "mindmap").split("/").pop().replace(/\.(md|markdown)$/i, "");
    a.href = url;
    a.download = `mind-map-${name}${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /* ---------------- node interactivity ---------------- */
  resolveNodeLabel(target) {
    if (!this._flat.length) return null;
    const g = target.closest ? target.closest("g") : null;
    if (!g) return null;
    // Flowchart: g.node with id like flowchart-n3-975 → index 3
    const id = g.id || "";
    const m = id.match(/n(\d+)/);
    if (m && this._flat[+m[1]]) return this._flat[+m[1]].label;
    // Mindmap layout fallback: match by text
    const text = (g.textContent || "").trim();
    const hit = this._flat.find(n => text === n.label || text.endsWith(n.label));
    return hit ? hit.label : null;
  },

  _relationSet(label) {
    const idx = this._flat.findIndex(n => n.label === label);
    if (idx < 0) return null;
    const set = new Set([idx]);
    // ancestors
    let p = this._flat[idx].parent;
    while (p >= 0) { set.add(p); p = this._flat[p].parent; }
    // descendants
    const addKids = (i) => { this.childrenOf(i).forEach(c => { set.add(c); addKids(c); }); };
    addKids(idx);
    return set;
  },

  focusSubtree(label) {
    this.focusedLabel = label;
    const keep = this._relationSet(label);
    if (!keep) return;
    const svg = document.getElementById("mindMapCanvas").querySelector("svg");
    if (!svg) return;
    svg.querySelectorAll("g.node, g.edgePaths, g.edgeLabels, .mindmap-node, .mindmap-link").forEach(elm => {
      const lbl = this.resolveNodeLabel(elm);
      if (lbl && !keep.has(this._flat.findIndex(n => n.label === lbl))) {
        elm.style.opacity = "0.18";
      } else if (lbl) {
        // keep relations of the target visible even when they include non-resolvable edges
        const idx = this._flat.findIndex(n => n.label === lbl);
        elm.style.opacity = keep.has(idx) ? "1" : "0.18";
      } else {
        elm.style.opacity = "1";
      }
    });
    quickToast(`🗺️ Focused branch: "${label}" — click background to reset`);
  },

  resetFocus() {
    if (!this.focusedLabel) return;
    this.focusedLabel = null;
    const svg = document.getElementById("mindMapCanvas").querySelector("svg");
    if (svg) svg.querySelectorAll("g, .mindmap-node, .mindmap-link").forEach(elm => { elm.style.opacity = ""; });
  },

  askAboutNode(label) {
    hide(el.mindMapModal);
    openAiPanel("🧠 Study Tutor", true, 'chat');
    const key = state.activeKey;
    if (state.aiCache[key]) state.chatHistory = state.aiCache[key].chatHistory || [];
    sendChatPrompt(`Explain the concept "${label}" from my mind map in the context of this document.`);
  },

  setLayout(layout) {
    this.layout = layout;
    localStorage.setItem("md-reader-mindmap-layout", layout);
    [el.mindMapLayoutTd, el.mindMapLayoutLr, el.mindMapLayoutMm].forEach(b => b.classList.remove("active"));
    (layout === "TD" ? el.mindMapLayoutTd : layout === "LR" ? el.mindMapLayoutLr : el.mindMapLayoutMm).classList.add("active");
    this.focusedLabel = null;
    if (this.tree) this.renderTree();
  }
};
mindMapStudio.init();

/* ---------------- Multi-File Synthesis Logic ---------------- */
el.synthesisModeBtn.addEventListener("click", () => {
  state.synthesisMode = !state.synthesisMode;
  state.selectedKeys.clear();
  
  if (state.synthesisMode) {
    el.synthesisModeBtn.classList.add("active");
    el.synthesisModeBtn.style.background = "var(--accent)";
    el.sidebarGeneralChatBtn.disabled = true;
    show(el.synthesisActionBar, 'flex');
    updateSynthesisCount();
  } else {
    el.synthesisModeBtn.classList.remove("active");
    el.synthesisModeBtn.style.background = "";
    el.sidebarGeneralChatBtn.disabled = false;
    hide(el.synthesisActionBar);
  }
  
  loadFileList();
});

window.handleCheckboxToggle = function(checkbox, key) {
  if (checkbox.checked) {
    state.selectedKeys.add(key);
  } else {
    state.selectedKeys.delete(key);
  }
  updateSynthesisCount();
};

function updateSynthesisCount() {
  const count = state.selectedKeys.size;
  el.synthesisSelectedCount.textContent = `${count} file${count === 1 ? '' : 's'} selected`;
  el.synthesisSubmitBtn.disabled = count < 2;
}

el.synthesisSubmitBtn.addEventListener("click", async () => {
  if (state.selectedKeys.size < 2) return;
  
  el.synthesisSubmitBtn.disabled = true;
  el.synthesisSubmitBtn.textContent = "Synthesizing...";
  closeSidebar();
  openAiPanel("📚 Comparative Synthesis", true, 'chat');
  
  try {
    let combinedText = "";
    for (const key of state.selectedKeys) {
      const res = await fetch(`/api/file?key=${encodeURIComponent(key)}`);
      if (res.ok) {
        const text = await res.text();
        const docTitle = key.split('/').pop().replace(/\.[^/.]+$/, "");
        combinedText += `\n\n--- START OF DOCUMENT: ${docTitle} ---\n${text}\n--- END OF DOCUMENT: ${docTitle} ---\n`;
      }
    }
    
    const prompt = `Perform a comprehensive study synthesis, concept comparison, and detailed comparison analysis for the following documents: ${combinedText}`;
    sendChatPrompt(prompt);
    
    state.synthesisMode = false;
    el.synthesisModeBtn.classList.remove("active");
    el.synthesisModeBtn.style.background = "";
    el.sidebarGeneralChatBtn.disabled = false;
    hide(el.synthesisActionBar);
    loadFileList();
  } catch (err) {
    el.aiPanelContent.innerHTML = `<p style="color:var(--error)">⚠️ Synthesis failed: ${escapeHtml(err.message)}</p>`;
    hide(el.aiSpinner);
  } finally {
    el.synthesisSubmitBtn.disabled = false;
    el.synthesisSubmitBtn.textContent = "Synthesize";
  }
});

/* ---------------- Semantic Workspace Search ---------------- */
el.workspaceSearchInput.addEventListener("keyup", async (e) => {
  if (e.key !== "Enter") return;
  const query = el.workspaceSearchInput.value.trim();
  if (!query) return;
  
  el.workspaceSearchInput.value = "";
  closeSidebar();
  openAiPanel("🔍 Workspace Search", true, 'chat');
  
  try {
    const allFiles = state.files;
    if (allFiles.length === 0) {
      el.aiPanelContent.innerHTML = `<p style="color:var(--text-dim)">No files found in workspace.</p>`;
      hide(el.aiSpinner);
      return;
    }
    
    let aggregatedContext = "";
    for (const f of allFiles) {
      const res = await fetch(`/api/file?key=${encodeURIComponent(f.key)}`);
      if (res.ok) {
        const text = await res.text();
        const docTitle = f.key.split('/').pop().replace(/\.[^/.]+$/, "");
        aggregatedContext += `\n\n--- DOCUMENT: ${docTitle} (Path: ${f.key}) ---\n${text}\n--- END OF DOCUMENT: ${docTitle} ---\n`;
      }
    }
    
    const prompt = `You are a Workspace Search Assistant. Answer the user's question by search and synthesis of the provided workspace document context. If the answer is found in the documents, summarize it and cite which specific document name(s) contain the answers. If the answer cannot be found in the documents, explicitly state that, but still try to give a helpful general answer.
    
User Question: "${query}"

Workspace Context:
${aggregatedContext}`;
    
    sendChatPrompt(prompt);
  } catch (err) {
    el.aiPanelContent.innerHTML = `<p style="color:var(--error)">⚠️ Workspace Search failed: ${escapeHtml(err.message)}</p>`;
    hide(el.aiSpinner);
  }
});

/* ---------------- AI Exam Cheat Sheet Generator ---------------- */
if (el.cheatSheetBtn) {
  el.cheatSheetBtn.addEventListener("click", async () => {
    if (!state.activeKey) return;
    
    show(el.cheatSheetModal, 'flex');
    show(el.cheatSheetSpinner, 'flex');
    hide(el.cheatSheetContent);
    el.cheatSheetContent.innerHTML = "";
    
    try {
      const res = await fetch("/api/ai/cheatsheet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: state.activeKey, model: state.selectedModel })
      });
      
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      
      hide(el.cheatSheetSpinner);
      
      const title = data.title || "Exam Cheat Sheet";
      const keyDefs = data.keyDefinitions || [];
      const formulas = data.formulasAndSyntax || [];
      const rules = data.coreRulesAndTips || [];
      
      let html = `
        <div class="cheatsheet-card" style="grid-column: 1 / -1; background:var(--bg-elevated); border:2px solid var(--accent)">
          <div class="cheatsheet-card-title" style="font-size:1.1rem; color:var(--text)">📌 ${escapeHtml(title)}</div>
          <div style="font-size:0.8rem; color:var(--text-dim)">Document: ${escapeHtml(state.activeKey)} • Compact 1-Page Exam Cheat Sheet</div>
        </div>
      `;
      
      if (keyDefs.length > 0) {
        html += `
          <div class="cheatsheet-card">
            <div class="cheatsheet-card-title">📖 Core Definitions & Concepts</div>
            ${keyDefs.map(item => `
              <div class="cheatsheet-item">
                <span class="cheatsheet-term">• ${escapeHtml(item.term)}:</span>
                <span class="cheatsheet-def"> ${escapeHtml(item.definition)}</span>
              </div>
            `).join('')}
          </div>
        `;
      }
      
      if (formulas.length > 0) {
        html += `
          <div class="cheatsheet-card">
            <div class="cheatsheet-card-title">💻 Formulas, Syntax & Commands</div>
            ${formulas.map(item => `
              <div class="cheatsheet-item">
                <div class="cheatsheet-term">${escapeHtml(item.concept)}</div>
                <div class="cheatsheet-code">${escapeHtml(item.codeOrFormula)}</div>
                <div class="cheatsheet-def" style="margin-top:2px">${escapeHtml(item.explanation)}</div>
              </div>
            `).join('')}
          </div>
        `;
      }
      
      if (rules.length > 0) {
        html += `
          <div class="cheatsheet-card">
            <div class="cheatsheet-card-title">⚡ Exam Tips & Must-Know Rules</div>
            ${rules.map(rule => `
              <div class="cheatsheet-item" style="display:flex; gap:6px">
                <span style="color:var(--accent)">✓</span>
                <span class="cheatsheet-def">${escapeHtml(rule)}</span>
              </div>
            `).join('')}
          </div>
        `;
      }
      
      el.cheatSheetContent.innerHTML = html;
      show(el.cheatSheetContent, 'grid');
    } catch (err) {
      hide(el.cheatSheetSpinner);
      el.cheatSheetContent.innerHTML = `<p style="color:var(--error); padding:20px; text-align:center">⚠️ Failed to generate Cheat Sheet: ${escapeHtml(err.message)}</p>`;
      show(el.cheatSheetContent, 'block');
    }
  });
}

if (el.cheatSheetModalClose) {
  el.cheatSheetModalClose.addEventListener("click", () => {
    hide(el.cheatSheetModal);
  });
}

if (el.printCheatSheetBtn) {
  el.printCheatSheetBtn.addEventListener("click", () => {
    document.body.classList.add("printing-cheatsheet");
    window.print();
    // afterprint listener (registered globally) removes the class
    setTimeout(() => document.body.classList.remove("printing-cheatsheet"), 2000);
  });
}

/* ================================================================
   1. GAMIFIED STUDY STREAKS & XP SYSTEM
   ================================================================ */
const gamification = {
  data: {
    xp: 0,
    level: 1,
    streak: 1,
    lastActiveDate: new Date().toISOString().split('T')[0],
    readCount: 0,
    pomodoroCount: 0,
    quizCount: 0,
    highlightCount: 0,
    unlockedBadges: []
  },

  BADGES: [
    { id: 'page_turner', icon: '📖', name: 'Page Turner', desc: 'Read 3 documents', condition: (d) => d.readCount >= 3 },
    { id: 'on_fire', icon: '🔥', name: 'On Fire', desc: 'Maintain a 3-day streak', condition: (d) => d.streak >= 3 },
    { id: 'focus_master', icon: '⏱️', name: 'Focus Master', desc: 'Complete 2 Pomodoro sessions', condition: (d) => d.pomodoroCount >= 2 },
    { id: 'quiz_champ', icon: '🧠', name: 'Quiz Champion', desc: 'Take 2 AI Quizzes', condition: (d) => d.quizCount >= 2 },
    { id: 'annotator', icon: '🖍️', name: 'Annotator', desc: 'Make 5 highlights or notes', condition: (d) => d.highlightCount >= 5 }
  ],

  init() {
    try {
      const raw = localStorage.getItem('md-reader-gamification');
      if (raw) this.data = { ...this.data, ...JSON.parse(raw) };
    } catch(e) {}

    this.checkStreak();
    this.updateUI();

    if (el.gamificationBadge) {
      el.gamificationBadge.addEventListener('click', () => {
        this.renderModal();
        show(el.gamificationModal, 'flex');
      });
    }

    if (el.gamificationModalClose) {
      el.gamificationModalClose.addEventListener('click', () => {
        hide(el.gamificationModal);
      });
    }
  },

  checkStreak() {
    const today = new Date().toISOString().split('T')[0];
    if (this.data.lastActiveDate !== today) {
      const last = new Date(this.data.lastActiveDate);
      const curr = new Date(today);
      const diffDays = Math.round((curr - last) / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        this.data.streak++;
      } else if (diffDays > 1) {
        this.data.streak = 1;
      }
      this.data.lastActiveDate = today;
      this.save();
    }
  },

  awardXp(amount, actionType) {
    this.data.xp += amount;

    if (actionType === 'read') this.data.readCount++;
    if (actionType === 'pomodoro') this.data.pomodoroCount++;
    if (actionType === 'quiz') this.data.quizCount++;
    if (actionType === 'highlight') this.data.highlightCount++;

    // Calculate level (100 XP per level)
    const targetXp = this.data.level * 100;
    if (this.data.xp >= targetXp) {
      this.data.level++;
    }

    // Check badges
    this.BADGES.forEach(b => {
      if (!this.data.unlockedBadges.includes(b.id) && b.condition(this.data)) {
        this.data.unlockedBadges.push(b.id);
      }
    });

    this.save();
    this.updateUI();
  },

  save() {
    try {
      localStorage.setItem('md-reader-gamification', JSON.stringify(this.data));
    } catch(e) {}
  },

  updateUI() {
    if (el.streakDisplay) el.streakDisplay.textContent = `🔥 ${this.data.streak}d`;
    if (el.levelDisplay) el.levelDisplay.textContent = `⚡ Lvl ${this.data.level}`;
  },

  renderModal() {
    const targetXp = this.data.level * 100;
    const currentLevelXp = this.data.xp % 100;
    const pct = Math.min(100, Math.round((currentLevelXp / 100) * 100));

    if (el.gamiLevelTitle) el.gamiLevelTitle.textContent = `⚡ Level ${this.data.level} Scholar`;
    if (el.gamiStreakText) el.gamiStreakText.textContent = `🔥 ${this.data.streak} Day Streak`;
    if (el.gamiXpBar) el.gamiXpBar.style.width = `${pct}%`;
    if (el.gamiXpCurrent) el.gamiXpCurrent.textContent = `${this.data.xp} Total XP`;
    if (el.gamiXpTarget) el.gamiXpTarget.textContent = `${100 - currentLevelXp} XP to Level ${this.data.level + 1}`;

    if (el.gamiBadgesGrid) {
      el.gamiBadgesGrid.innerHTML = this.BADGES.map(b => {
        const isUnlocked = this.data.unlockedBadges.includes(b.id);
        return `
          <div class="gami-badge-card ${isUnlocked ? '' : 'locked'}">
            <div class="gami-badge-icon">${b.icon}</div>
            <div class="gami-badge-name">${b.name}</div>
            <div class="gami-badge-desc">${b.desc}</div>
            <div style="font-size:0.65rem; color:${isUnlocked ? 'var(--accent)' : 'var(--text-dim)'}; font-weight:700; margin-top:2px">
              ${isUnlocked ? '✓ Unlocked' : '🔒 Locked'}
            </div>
          </div>
        `;
      }).join('');
    }
  }
};

/* ================================================================
   2. AI AUTO-GLOSSARY — rich terms, smart highlighting,
      interactive tooltips, dictionary, hub, SRS integration
   ================================================================ */
const autoGlossary = {
  terms: [],
  currentLanguage: localStorage.getItem("md-reader-glossary-lang") || "English",

  CATEGORIES: {
    acronym:  { icon: "🔤", color: "#a78bfa" },
    concept:  { icon: "💡", color: "#60a5fa" },
    protocol: { icon: "🌐", color: "#2dd4bf" },
    tool:     { icon: "🛠️", color: "#fbbf24" },
    person:   { icon: "👤", color: "#fb7185" },
    method:   { icon: "🧭", color: "#34d399" },
    formula:  { icon: "🧮", color: "#f472b6" },
    other:    { icon: "📌", color: "#94a3b8" }
  },

  _tooltip: null,
  _tooltipPinned: false,
  _hideTimer: null,

  init() {
    if (el.autoGlossaryBtn) {
      el.autoGlossaryBtn.addEventListener('click', () => {
        this.fetchAndApply();
      });
    }
    // Delegated span interactions — hover shows, click/tap pins the tooltip
    el.content.addEventListener('mouseover', (e) => {
      const s = e.target.closest && e.target.closest('.glossary-term');
      if (s) { clearTimeout(this._hideTimer); this.showTooltip(s); }
    });
    el.content.addEventListener('mouseout', (e) => {
      if (e.target.closest && e.target.closest('.glossary-term')) this.scheduleHide();
    });
    el.content.addEventListener('click', (e) => {
      const s = e.target.closest && e.target.closest('.glossary-term');
      if (!s) return;
      e.stopPropagation();
      clearTimeout(this._hideTimer);
      this.showTooltip(s, true);
    });
    // Clicking anywhere outside the tooltip closes a pinned tooltip
    document.addEventListener('click', (e) => {
      if (!this._tooltip || this._tooltip.style.display === 'none') return;
      if (this._tooltip.contains(e.target)) return;
      if (e.target.closest && e.target.closest('.glossary-term')) return;
      this.hideTooltip(true);
    });
  },

  /** Backfill missing fields on cached/older glossaries */
  normalizeTermData(t) {
    return {
      term: String(t.term || "").trim(),
      definition: t.definition || "",
      aliases: Array.isArray(t.aliases) ? t.aliases.filter(Boolean).slice(0, 2) : [],
      category: this.CATEGORIES[t.category] ? t.category : "other",
      importance: (t.importance >= 1 && t.importance <= 3) ? t.importance : 2,
      definitionLocal: t.definitionLocal || null
    };
  },

  async fetchAndApply(forceLanguage = null) {
    if (!state.activeKey) return;
    const key = state.activeKey;
    const language = forceLanguage || this.currentLanguage;

    // English + cached → apply instantly, no network call
    if (language === "English" && state.aiCache[key] && state.aiCache[key].glossary && state.aiCache[key].glossary.length) {
      this.terms = state.aiCache[key].glossary.map(t => this.normalizeTermData(t));
      this.applyToDOM();
      this.renderGlossaryPanel();
      return;
    }

    openAiPanel("🔍 Extracting Glossary Terms...", false, 'glossary');
    show(el.aiSpinner, 'flex');
    const btn = el.autoGlossaryBtn;
    const originalText = btn.innerHTML;
    btn.innerHTML = `<span class="spinner-ring" style="width:12px;height:12px;display:inline-block"></span> Extracting...`;

    try {
      const res = await fetch("/api/ai/glossary", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, model: state.selectedModel, language })
      });

      hide(el.aiSpinner);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      this.terms = (data.terms || []).map(t => this.normalizeTermData(t));

      if (this.terms.length > 0) {
        if (!state.aiCache[key]) state.aiCache[key] = {};
        state.aiCache[key].glossary = this.terms;
        saveAiCache();
        this.currentLanguage = language;
        localStorage.setItem("md-reader-glossary-lang", language);

        this.applyToDOM();
        this.renderGlossaryPanel();
        gamification.awardXp(15, 'glossary');
      } else {
        el.aiPanelContent.innerHTML = `<div style="padding:16px; color:var(--text-dim)">No specialized jargon or terms detected in this document.</div>`;
      }
    } catch (err) {
      hide(el.aiSpinner);
      alert(`Auto-Glossary error: ${escapeHtml(err.message)}`);
    } finally {
      btn.innerHTML = originalText;
    }
  },

  /** Build ONE combined matcher: longest-first alternation, tolerant boundaries (C#, .NET work), alias-aware */
  buildMatcher() {
    const entries = [];
    this.terms.forEach(t => {
      entries.push({ label: t.term, root: t });
      t.aliases.forEach(a => { if (a && a.toLowerCase() !== t.term.toLowerCase()) entries.push({ label: a, root: t }); });
    });
    entries.sort((a, b) => b.label.length - a.label.length);
    const pattern = entries.map(e => escapeRegExp(e.label)).join("|");
    if (!pattern) return null;
    return {
      regex: new RegExp(`(^|[^A-Za-z0-9_])(?:(${pattern}))(?![A-Za-z0-9_]|$)`, "gi"),
      lookup: entries
    };
  },

  applyToDOM() {
    if (!this.terms.length || !el.content) return;

    // Remove previous glossary spans to prevent duplication
    el.content.querySelectorAll('.glossary-term').forEach(span => {
      const parent = span.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(span.textContent), span);
        parent.normalize();
      }
    });

    const matcher = this.buildMatcher();
    if (!matcher) return;
    const { regex, lookup } = matcher;

    // Single DOM pass wrapping EVERY occurrence
    const walker = document.createTreeWalker(el.content, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_SKIP;
        const parentTag = node.parentElement ? node.parentElement.tagName.toLowerCase() : '';
        if (['script', 'style', 'code', 'pre', 'a'].includes(parentTag)) return NodeFilter.FILTER_SKIP;
        if (node.parentElement && node.parentElement.classList.contains('glossary-term')) return NodeFilter.FILTER_SKIP;
        regex.lastIndex = 0;
        return regex.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });

    const nodesToReplace = [];
    while (walker.nextNode()) nodesToReplace.push(walker.currentNode);

    nodesToReplace.forEach(node => {
      const text = node.nodeValue;
      regex.lastIndex = 0;
      const frag = document.createDocumentFragment();
      let lastIdx = 0;
      let m;
      while ((m = regex.exec(text)) !== null) {
        const matchedLabel = m[2];
        const start = m.index + m[1].length;
        if (start > lastIdx) frag.appendChild(document.createTextNode(text.slice(lastIdx, start)));
        const root = lookup.find(e => e.label.toLowerCase() === matchedLabel.toLowerCase());
        const span = document.createElement('span');
        const data = root ? root.root : { term: matchedLabel, definition: "", category: "other", importance: 2 };
        span.className = `glossary-term gt-cat-${data.category}`;
        span.dataset.rootTerm = data.term;
        span.dataset.def = data.definition || "";
        span.dataset.local = data.definitionLocal || "";
        span.dataset.category = data.category;
        span.dataset.importance = data.importance;
        span.textContent = matchedLabel;
        frag.appendChild(span);
        lastIdx = start + matchedLabel.length;
        if (regex.lastIndex === m.index) regex.lastIndex++; // guard zero-length
      }
      if (lastIdx < text.length) frag.appendChild(document.createTextNode(text.slice(lastIdx)));
      if (node.parentNode) node.parentNode.replaceChild(frag, node);
    });
  },

  /* ---------------- Tooltip ---------------- */
  ensureTooltip() {
    if (this._tooltip) return this._tooltip;
    const tip = document.createElement('div');
    tip.id = 'activeGlossaryTooltip';
    tip.className = 'glossary-tooltip';
    tip.style.display = 'none';
    document.body.appendChild(tip);

    tip.addEventListener('mouseenter', () => { clearTimeout(this._hideTimer); });
    tip.addEventListener('mouseleave', () => { this.scheduleHide(); });
    tip.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = e.target.closest('[data-gt-action]');
      if (action) {
        const rootTerm = tip.dataset.rootTerm;
        const def = tip.dataset.def || "";
        const local = tip.dataset.local || "";
        this.handleAction(action.dataset.gtAction, { term: rootTerm, definition: def, definitionLocal: local });
        return;
      }
      if (e.target.closest('.gt-close-btn')) this.hideTooltip(true);
    });
    this._tooltip = tip;
    return tip;
  },

  handleAction(action, termObj) {
    if (action === "read") {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(`${termObj.term}. ${termObj.definition}`);
      u.rate = state.speechRate || 1;
      window.speechSynthesis.speak(u);
    } else if (action === "ask") {
      this.hideTooltip(true);
      openAiPanel("🧠 Study Tutor", true, 'chat');
      const key = state.activeKey;
      if (state.aiCache[key]) state.chatHistory = state.aiCache[key].chatHistory || [];
      sendChatPrompt(`Explain the term "${termObj.term}" in the context of this document.`);
    } else if (action === "dict") {
      dictionaryStore.add(termObj, state.activeKey);
    }
  },

  showTooltip(elem, pin = false) {
    const tip = this.ensureTooltip();
    clearTimeout(this._hideTimer);
    this._tooltipPinned = false;

    const root = elem.dataset.rootTerm || elem.textContent;
    const def = elem.dataset.def || "";
    const local = elem.dataset.local || "";
    const cat = elem.dataset.category || "other";
    const importance = parseInt(elem.dataset.importance || "2", 10);
    const catMeta = this.CATEGORIES[cat] || this.CATEGORIES.other;
    const stars = "★".repeat(importance) + "☆".repeat(3 - importance);

    tip.dataset.rootTerm = root;
    tip.dataset.def = def;
    tip.dataset.local = local;

    tip.innerHTML = "";
    const header = document.createElement('div');
    header.className = 'glossary-tooltip-head';
    header.innerHTML = `
      <span class="glossary-tooltip-term">${escapeHtml(root)}</span>
      <span class="gt-cat-chip" style="background:${catMeta.color}22;color:${catMeta.color};border:1px solid ${catMeta.color}">${catMeta.icon} ${escapeHtml(cat)}</span>
      <span class="gt-stars" title="Importance ${importance}/3">${stars}</span>
      <button class="gt-close-btn" aria-label="Close">✕</button>
    `;
    tip.appendChild(header);

    if (def) {
      const d = document.createElement('div');
      d.className = 'gt-def';
      d.textContent = def;
      tip.appendChild(d);
    }
    if (local) {
      const l = document.createElement('div');
      l.className = 'gt-local';
      l.textContent = local;
      tip.appendChild(l);
    }

    const actions = document.createElement('div');
    actions.className = 'gt-actions';
    actions.innerHTML = `
      <button data-gt-action="read" title="Read definition aloud">🔊 Read</button>
      <button data-gt-action="ask" title="Ask the AI Tutor about this term">💬 Ask</button>
      <button data-gt-action="dict" title="Save to Dictionary.md">📖 +Dictionary</button>
    `;
    tip.appendChild(actions);

    // Measure then position with viewport flip
    tip.style.visibility = 'hidden';
    tip.style.display = 'block';
    const rect = elem.getBoundingClientRect();
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let left = Math.max(10, Math.min(window.innerWidth - w - 10, rect.left));
    let top = rect.bottom + 6;
    if (top + h > window.innerHeight - 8 && rect.top - h - 6 > 8) {
      top = rect.top - h - 6; // flip above the term
    }
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
    tip.style.visibility = 'visible';

    if (pin) this._tooltipPinned = true;
  },

  scheduleHide(ms = 200) {
    clearTimeout(this._hideTimer);
    this._hideTimer = setTimeout(() => {
      if (!this._tooltipPinned) this.hideTooltip();
    }, ms);
  },

  hideTooltip(force = false) {
    if (this._tooltipPinned && !force) return;
    if (this._tooltip) this._tooltip.style.display = 'none';
    this._tooltipPinned = false;
  },

  /* ---------------- Panel ---------------- */
  renderGlossaryPanel() {
    if (!this.terms.length) return;
    openAiPanel("🔍 Auto-Glossary Vocabulary", false, 'glossary');

    const langOptions = aiTranslator.languages.map(l =>
      `<option value="${l.code}" ${l.code === this.currentLanguage ? 'selected' : ''}>${escapeHtml(l.code)}</option>`
    ).join("") + `<option value="English" ${this.currentLanguage === "English" ? 'selected' : ''}>English</option>`;

    const sorted = [...this.terms].sort((a, b) => b.importance - a.importance || a.term.localeCompare(b.term));
    let rowsHtml = sorted.map(t => {
      const catMeta = this.CATEGORIES[t.category];
      const stars = "★".repeat(t.importance) + "☆".repeat(3 - t.importance);
      const aliasesHtml = t.aliases.length
        ? t.aliases.map(a => `<span class="gt-alias-chip">${escapeHtml(a)}</span>`).join("")
        : "";
      return `
        <div class="gt-row" data-gt-term="${escapeHtml(t.term)}">
          <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom:4px">
            <span style="font-weight:700; color:var(--accent); font-size:0.92rem">🔍 ${escapeHtml(t.term)}</span>
            <span class="gt-cat-chip" style="background:${catMeta.color}22;color:${catMeta.color};border:1px solid ${catMeta.color}">${catMeta.icon} ${escapeHtml(t.category)}</span>
            ${aliasesHtml}
            <span class="gt-stars" title="Importance ${t.importance}/3">${stars}</span>
          </div>
          <div style="font-size:0.85rem; color:var(--text); line-height:1.5">${escapeHtml(t.definition)}</div>
          ${t.definitionLocal ? `<div class="gt-local" style="margin-top:4px">${escapeHtml(t.definitionLocal)}</div>` : ""}
        </div>
      `;
    }).join('');

    el.aiPanelContent.innerHTML = `
      <div style="padding:16px">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; padding-bottom:10px; border-bottom:1px solid var(--border); flex-wrap:wrap; gap:8px">
          <span style="font-size:0.82rem; font-weight:700; color:var(--accent); text-transform:uppercase; letter-spacing:0.05em">
            🔍 ${this.terms.length} Terms
          </span>
          <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap">
            <select id="glossaryLangSelect" title="Definition language" style="padding:3px 6px; font-size:0.75rem; background:var(--bg-card); color:var(--text); border:1px solid var(--border); border-radius:var(--radius); outline:none">
              ${langOptions}
            </select>
            <button id="glossaryFlashcardsBtn" class="lib-mini-btn" title="Turn these terms into flashcards">🗂️ Study</button>
            <button id="glossaryCsvBtn" class="lib-mini-btn" title="Export glossary as CSV">⬇ CSV</button>
          </div>
        </div>
        <div>${rowsHtml}</div>
      </div>
    `;

    // Row click → jump to first occurrence in the document
    el.aiPanelContent.querySelectorAll('.gt-row').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('button,select')) return;
        const term = (row.dataset.gtTerm || "").toLowerCase();
        const span = el.content.querySelector(`.glossary-term[data-root-term="${CSS.escape(row.dataset.gtTerm)}"]`)
          || [...el.content.querySelectorAll('.glossary-term')].find(s => (s.dataset.rootTerm || '').toLowerCase() === term);
        if (span) {
          span.scrollIntoView({ behavior: 'smooth', block: 'center' });
          this.showTooltip(span, true);
        }
      });
    });

    const langSelect = el.aiPanelContent.querySelector('#glossaryLangSelect');
    langSelect.addEventListener('change', (e) => {
      e.stopPropagation();
      this.fetchAndApply(e.target.value);
    });

    el.aiPanelContent.querySelector('#glossaryFlashcardsBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      this.makeFlashcardsFromGlossary();
    });
    el.aiPanelContent.querySelector('#glossaryCsvBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      this.exportCsv();
    });
  },

  makeFlashcardsFromGlossary() {
    const key = state.activeKey;
    if (!key || !this.terms.length) return;
    if (!state.aiCache[key]) state.aiCache[key] = {};
    const cache = state.aiCache[key];
    cache.flashcards = this.terms.map(t => ({
      question: t.term,
      answer: t.definition + (t.definitionLocal ? `\n\n${t.definitionLocal}` : "")
    }));
    cache.flashcardIndex = 0;
    cache.flashcardOrder = srsDeck.buildStudyOrder(key, cache.flashcards.length);
    saveAiCache();
    el.flashcardsBtn.click();
  },

  exportCsv() {
    if (!this.terms.length) return;
    const docName = (state.activeKey || "document").split('/').pop().replace(/\.(md|markdown)$/i, '');
    const quoted = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    let csv = "term,definition,aliases,category,importance,definition_local\n";
    this.terms.forEach(t => {
      csv += [quoted(t.term), quoted(t.definition), quoted(t.aliases.join("; ")), quoted(t.category), t.importance, quoted(t.definitionLocal || "")].join(",") + "\n";
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${docName}_glossary.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
};

/* ---------------- 📖 Personal Dictionary (Dictionary.md in R2) ---------------- */
const dictionaryStore = {
  KEY: "Dictionary.md",

  async add(termObj, sourceKey) {
    try {
      let text = "";
      try {
        const r = await fetch(`/api/file?key=${encodeURIComponent(this.KEY)}`);
        if (r.ok) text = await r.text();
      } catch (e) { /* will create new */ }

      const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
      const term = esc(termObj.term);
      const def = esc(termObj.definitionLocal || termObj.definition);
      const src = esc(sourceKey || "");

      if (new RegExp(`^\\|\\s*${escapeRegExp(term)}\\s*\\|`, "im").test(text)) {
        quickToast(`📖 "${term}" is already in your Dictionary`);
        return;
      }

      if (!text) {
        text = "# 📖 My Dictionary\n\n| Term | Definition | Source |\n| --- | --- | --- |\n";
      } else if (!/^\|\s*Term\s*\|/im.test(text)) {
        text = text.replace(/\s*$/, "") + "\n\n| Term | Definition | Source |\n| --- | --- | --- |\n";
      }

      text = text.replace(/\s*$/, "") + `\n| ${term} | ${def} | [[${src}]] |\n`;

      const res = await authFetch(`/api/upload?key=${encodeURIComponent(this.KEY)}`, {
        method: "PUT",
        body: text
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      quickToast(`📖 "${term}" added to Dictionary.md`);
      loadFileList();
    } catch (err) {
      quickToast("❌ Dictionary save failed: " + err.message);
    }
  }
};

/* ---------------- 🌐 Global Glossary Manager (aggregation across docs) ---------------- */
const glossaryHub = {
  init() {
    if (!el.glossaryHubBtn) return;
    el.glossaryHubBtn.addEventListener('click', () => this.open());
    if (el.glossaryHubModalClose) el.glossaryHubModalClose.addEventListener('click', () => hide(el.glossaryHubModal));
    if (el.glossaryHubSearch) el.glossaryHubSearch.addEventListener('input', () => this.render());
  },

  collect() {
    const map = new Map(); // lowercase term -> { term, definition, category, importance, docs:Set }
    for (const key of Object.keys(state.aiCache || {})) {
      if (key === "$general") continue;
      const g = state.aiCache[key].glossary;
      if (!g || !g.length) continue;
      g.forEach(raw => {
        const t = autoGlossary.normalizeTermData(raw);
        if (!t.term) return;
        const id = t.term.toLowerCase();
        if (!map.has(id)) {
          map.set(id, { ...t, docs: new Set([key]) });
        } else {
          const e = map.get(id);
          e.docs.add(key);
          if (t.importance > e.importance) e.importance = t.importance;
        }
      });
    }
    return [...map.values()];
  },

  open() {
    show(el.glossaryHubModal, 'flex');
    el.glossaryHubSearch.value = "";
    this.render();
    el.glossaryHubSearch.focus();
  },

  render() {
    const q = (el.glossaryHubSearch.value || "").trim().toLowerCase();
    const all = this.collect()
      .filter(t => !q || t.term.toLowerCase().includes(q) || [...t.docs].join(" ").toLowerCase().includes(q))
      .sort((a, b) => b.importance - a.importance || a.term.localeCompare(b.term));

    const docsWithGlossary = Object.keys(state.aiCache || {}).filter(k => k !== "$general" && state.aiCache[k].glossary && state.aiCache[k].glossary.length).length;

    if (!all.length) {
      el.glossaryHubList.innerHTML = `<div style="text-align:center;padding:26px;color:var(--text-dim);font-size:0.85rem">
        ${q ? 'No terms match your search.' : 'No glossaries yet.<br>Run <strong>🔍 Auto-Glossary</strong> on a document first.'}
      </div>`;
    } else {
      el.glossaryHubList.innerHTML = all.map(t => {
        const catMeta = autoGlossary.CATEGORIES[t.category];
        const stars = "★".repeat(t.importance) + "☆".repeat(3 - t.importance);
        const docLinks = [...t.docs].slice(0, 4).map(k =>
          `<button class="ghub-doc-link" data-ghub-doc="${escapeHtml(k)}" title="${escapeHtml(k)}">📄 ${escapeHtml(k.split('/').pop().replace(/\.(md|markdown)$/i, ''))}</button>`
        ).join("");
        const more = t.docs.size > 4 ? `<span style="font-size:0.7rem;color:var(--text-dim)">+${t.docs.size - 4} more</span>` : "";
        return `
          <div class="ghub-row">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
              <span style="font-weight:700;color:var(--accent)">${escapeHtml(t.term)}</span>
              <span class="gt-cat-chip" style="background:${catMeta.color}22;color:${catMeta.color};border:1px solid ${catMeta.color}">${catMeta.icon} ${escapeHtml(t.category)}</span>
              <span class="gt-stars">${stars}</span>
              <span class="ghub-count" title="Appears in ${t.docs.size} document(s)">${t.docs.size} doc${t.docs.size === 1 ? '' : 's'}</span>
            </div>
            <div style="font-size:0.84rem;color:var(--text);line-height:1.5;margin:4px 0">${escapeHtml(t.definition)}</div>
            <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center">${docLinks}${more}</div>
          </div>
        `;
      }).join("");

      el.glossaryHubList.querySelectorAll(".ghub-doc-link").forEach(btn =>
        btn.addEventListener("click", () => {
          hide(el.glossaryHubModal);
          openFile(btn.dataset.ghubDoc);
        }));
    }

    el.glossaryHubStats.textContent = `${all.length} unique term${all.length === 1 ? '' : 's'} across ${docsWithGlossary} document${docsWithGlossary === 1 ? '' : 's'}`;
  }
};

/* ---------------- tiny toast helper ---------------- */
let quickToastTimer = null;
function quickToast(msg) {
  let t = document.getElementById("quickToast");
  if (!t) {
    t = document.createElement("div");
    t.id = "quickToast";
    t.className = "quick-toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(quickToastTimer);
  quickToastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ================================================================
   AI CONTEXT-AWARE TRANSLATOR
   ================================================================ */
const aiTranslator = {
  languages: [
    { code: "Tamil", name: "Tamil (தமிழ் - எளிய தமிழ்) 🇮🇳" },
    { code: "Hindi", name: "Hindi (हिंदी) 🇮🇳" },
    { code: "Telugu", name: "Telugu (తెలుగు) 🇮🇳" },
    { code: "Malayalam", name: "Malayalam (മലയാളം) 🇮🇳" },
    { code: "Kannada", name: "Kannada (ಕನ್ನಡ) 🇮🇳" },
    { code: "Bengali", name: "Bengali (বাংলা) 🇮🇳" },
    { code: "Marathi", name: "Marathi (मराठी) 🇮🇳" },
    { code: "Gujarati", name: "Gujarati (ગુજરાતી) 🇮🇳" },
    { code: "Punjabi", name: "Punjabi (ਪੰਜਾਬੀ) 🇮🇳" },
    { code: "Spanish", name: "Spanish (Español) 🇪🇸" },
    { code: "French", name: "French (Français) 🇫🇷" },
    { code: "German", name: "German (Deutsch) 🇩🇪" },
    { code: "Japanese", name: "Japanese (日本語) 🇯🇵" },
    { code: "Chinese", name: "Chinese (Simplified 中文) 🇨🇳" },
    { code: "Portuguese", name: "Portuguese (Português) 🇵🇹" },
    { code: "Italian", name: "Italian (Italiano) 🇮🇹" },
    { code: "Russian", name: "Russian (Русский) 🇷🇺" }
  ],

  init() {
    if (el.translateBtn) {
      el.translateBtn.addEventListener('click', () => {
        this.openLanguagePicker();
      });
    }
  },

  openLanguagePicker() {
    if (!state.activeKey) return;
    
    openAiPanel("🌐 AI Contextual Translation", false, 'translate');
    
    let langButtonsHtml = this.languages.map(l => 
      `<button class="btn-secondary lang-select-btn" data-lang="${l.code}" style="padding:10px 12px; font-size:0.85rem; background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius); color:var(--text); cursor:pointer; text-align:left; transition:all 0.2s; font-weight:500">
        ${l.name}
      </button>`
    ).join('');

    el.aiPanelContent.innerHTML = `
      <div style="padding:16px; display:flex; flex-direction:column; gap:16px">
        <div>
          <h3 style="margin:0 0 6px; font-size:1.05rem">Select Target Language</h3>
          <p style="margin:0; font-size:0.82rem; color:var(--text-dim)">
            Translates the complete document into natural modern phrasing while keeping technical code, math, and formulas intact.
          </p>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px">
          ${langButtonsHtml}
        </div>
      </div>
    `;

    const buttons = el.aiPanelContent.querySelectorAll('.lang-select-btn');
    buttons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const selectedLang = e.currentTarget.getAttribute('data-lang');
        this.performTranslation(selectedLang);
      });
    });
  },

  async performTranslation(targetLanguage) {
    openAiPanel(`🌐 Translating full document into ${targetLanguage}...`, false, 'translate');
    show(el.aiSpinner, 'flex');

    try {
      const res = await fetch("/api/ai/translate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: state.activeKey, targetLanguage, model: state.selectedModel })
      });

      hide(el.aiSpinner);

      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();

      this.renderTranslationResult(data);
      gamification.awardXp(15, 'translate');
    } catch(err) {
      hide(el.aiSpinner);
      el.aiPanelContent.innerHTML = `
        <div style="padding:16px; background:rgba(248,81,73,0.08); border:1px solid var(--error); border-radius:var(--radius); color:var(--error)">
          <strong>Translation Failed:</strong> ${escapeHtml(err.message)}
        </div>
      `;
    }
  },

  renderTranslationResult(data) {
    let termsTableHtml = '';
    if (data.keyTerms && data.keyTerms.length) {
      const rows = data.keyTerms.map(t => `
        <tr style="border-bottom:1px solid var(--border)">
          <td style="padding:8px 10px; font-weight:600; color:var(--accent); font-size:0.85rem">${escapeHtml(t.originalTerm)}</td>
          <td style="padding:8px 10px; font-weight:600; font-size:0.85rem">${escapeHtml(t.translatedTerm)}</td>
          <td style="padding:8px 10px; font-size:0.8rem; color:var(--text-dim)">${escapeHtml(t.contextNote)}</td>
        </tr>
      `).join('');

      termsTableHtml = `
        <div style="margin-top:20px">
          <h4 style="margin:0 0 10px; font-size:0.95rem; display:flex; align-items:center; gap:6px">
            <span>📚 Technical Vocabulary Notes</span>
          </h4>
          <div style="overflow-x:auto; border:1px solid var(--border); border-radius:var(--radius); background:var(--bg-card)">
            <table style="width:100%; border-collapse:collapse; text-align:left">
              <thead>
                <tr style="background:var(--bg-elevated); border-bottom:1px solid var(--border); font-size:0.78rem; color:var(--text-dim)">
                  <th style="padding:8px 10px">Original Term</th>
                  <th style="padding:8px 10px">Translation</th>
                  <th style="padding:8px 10px">Everyday Context Note</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    const translatedMarkdown = data.fullTranslation || data.contextualSummary || "";
    const htmlContent = renderMd(translatedMarkdown);

    el.aiPanelContent.innerHTML = `
      <div style="padding:16px">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; padding-bottom:10px; border-bottom:1px solid var(--border); flex-wrap:wrap; gap:8px">
          <span style="font-size:0.82rem; font-weight:700; color:var(--accent); text-transform:uppercase; letter-spacing:0.05em">
            🌐 Full ${escapeHtml(data.targetLanguage || '')} Translation
          </span>
          <div style="display:flex; gap:6px">
            <button id="applyToReaderBtn" class="btn-primary" style="padding:4px 10px; font-size:0.75rem; background:var(--accent); border:none; border-radius:var(--radius); color:var(--accent-contrast); cursor:pointer">
              View Side-by-Side
            </button>
            <button id="reSelectLangBtn" class="btn-secondary" style="padding:4px 10px; font-size:0.75rem; background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius); color:var(--text); cursor:pointer">
              Change Language
            </button>
          </div>
        </div>

        <h2 style="margin:0 0 12px; font-size:1.2rem">${escapeHtml(data.translatedTitle || "Translated Document")}</h2>
        <div class="markdown-body" style="font-size:0.92rem; line-height:1.7">
          ${htmlContent}
        </div>

        ${termsTableHtml}
      </div>
    `;

    const reSelectBtn = el.aiPanelContent.querySelector('#reSelectLangBtn');
    if (reSelectBtn) {
      reSelectBtn.addEventListener('click', () => this.openLanguagePicker());
    }

    const applyToReaderBtn = el.aiPanelContent.querySelector('#applyToReaderBtn');
    if (applyToReaderBtn) {
      applyToReaderBtn.addEventListener('click', () => {
        if (splitScreen) {
          splitScreen.openSecondaryWithMarkdown(data.translatedTitle || "Translated Document", translatedMarkdown);
        }
      });
    }
  }
};

/* ================================================================
   4. 🎙️ AI 2-HOST AUDIO PODCAST GENERATOR (NotebookLM Style)
   ================================================================ */
const aiPodcast = {
  languages: [
    { code: "Tamil", name: "Tamil (தமிழ் - எளிய பேச்சுத்தமிழ்) 🇮🇳" },
    { code: "Hindi", name: "Hindi (हिंदी) 🇮🇳" },
    { code: "Telugu", name: "Telugu (తెలుగు) 🇮🇳" },
    { code: "Malayalam", name: "Malayalam (മലയാളം) 🇮🇳" },
    { code: "Kannada", name: "Kannada (ಕನ್ನಡ) 🇮🇳" },
    { code: "Bengali", name: "Bengali (বাংলা) 🇮🇳" },
    { code: "Marathi", name: "Marathi (मराठी) 🇮🇳" },
    { code: "Gujarati", name: "Gujarati (ગુજરાતી) 🇮🇳" },
    { code: "Punjabi", name: "Punjabi (ਪੰਜਾਬੀ) 🇮🇳" },
    { code: "English", name: "English (UK/US) 🇬🇧" }
  ],

  currentAudio: null,
  currentTurnIndex: 0,
  dialogueData: [],
  isPlaying: false,

  init() {
    if (el.podcastBtn) {
      el.podcastBtn.addEventListener('click', () => {
        this.openLanguagePicker();
      });
    }
  },

  openLanguagePicker() {
    if (!state.activeKey) return;
    
    openAiPanel("🎙️ AI 2-Host Study Podcast", false, 'podcast');
    
    let langButtonsHtml = this.languages.map(l => 
      `<button class="btn-secondary podcast-lang-btn" data-lang="${l.code}" style="padding:10px 12px; font-size:0.85rem; background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius); color:var(--text); cursor:pointer; text-align:left; transition:all 0.2s; font-weight:500">
        ${l.name}
      </button>`
    ).join('');

    el.aiPanelContent.innerHTML = `
      <div style="padding:16px; display:flex; flex-direction:column; gap:16px">
        <div>
          <h3 style="margin:0 0 6px; font-size:1.05rem">🎙️ Generate 2-Host Study Podcast</h3>
          <p style="margin:0; font-size:0.82rem; color:var(--text-dim)">
            Analyzes the complete document from basic concepts to advanced points. Features <strong>Alex (Host 🎙️)</strong> and <strong>Dr. Sam (Expert 🧠)</strong> in a spoken dialogue episode.
          </p>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px">
          ${langButtonsHtml}
        </div>
      </div>
    `;

    const buttons = el.aiPanelContent.querySelectorAll('.podcast-lang-btn');
    buttons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const selectedLang = e.currentTarget.getAttribute('data-lang');
        this.generatePodcast(selectedLang);
      });
    });
  },

  async generatePodcast(language) {
    this.stopPlayback();
    openAiPanel(`🎙️ Generating 2-Host Podcast in ${language}...`, false, 'podcast');
    show(el.aiSpinner, 'flex');

    try {
      const res = await fetch("/api/ai/podcast/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: state.activeKey, language, model: state.selectedModel })
      });

      hide(el.aiSpinner);

      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();

      this.dialogueData = data.dialogue || [];
      this.renderPodcastPlayer(data);
      gamification.awardXp(20, 'podcast');
    } catch(err) {
      hide(el.aiSpinner);
      el.aiPanelContent.innerHTML = `
        <div style="padding:16px; background:rgba(248,81,73,0.08); border:1px solid var(--error); border-radius:var(--radius); color:var(--error)">
          <strong>Podcast Generation Error:</strong> ${escapeHtml(err.message)}
        </div>
      `;
    }
  },

  renderPodcastPlayer(data) {
    const audioUrl = data.audioUrl;
    
    let dialogueListHtml = (data.dialogue || []).map((item, idx) => {
      const isAlex = item.speaker === 'Alex';
      const avatar = isAlex ? '🎙️' : '🧠';
      const badgeClass = isAlex ? 'background:rgba(99,102,241,0.15);color:#818cf8' : 'background:rgba(16,185,129,0.15);color:#34d399';
      return `
        <div class="podcast-turn-item" data-idx="${idx}" style="display:flex; gap:12px; padding:12px; border-radius:var(--radius); border:1px solid var(--border); background:var(--bg-card); transition:all 0.25s; margin-bottom:8px">
          <div style="font-size:1.2rem; min-width:32px; height:32px; display:flex; align-items:center; justify-content:center; border-radius:50%; ${badgeClass}">
            ${avatar}
          </div>
          <div style="flex:1">
            <div style="font-size:0.78rem; font-weight:700; color:var(--text-dim); margin-bottom:4px">
              ${escapeHtml(item.speaker)}
            </div>
            <div style="font-size:0.9rem; line-height:1.5; color:var(--text)">
              ${escapeHtml(item.text)}
            </div>
          </div>
        </div>
      `;
    }).join('');

    el.aiPanelContent.innerHTML = `
      <div style="padding:16px">
        <!-- Podcast Title Header -->
        <div style="margin-bottom:16px; padding-bottom:12px; border-bottom:1px solid var(--border)">
          <div style="font-size:0.75rem; font-weight:700; color:var(--accent); text-transform:uppercase; letter-spacing:0.05em">
            📻 NotebookLM 2-Host Episode • ${escapeHtml(data.language || '')}
          </div>
          <h2 style="margin:4px 0 0; font-size:1.25rem">${escapeHtml(data.podcastTitle || "Study Podcast Episode")}</h2>
        </div>

        <!-- Audio Player & Controls Bar -->
        <div style="padding:14px; background:var(--bg-elevated); border:1px solid var(--border); border-radius:var(--radius-lg); margin-bottom:20px; display:flex; flex-direction:column; gap:12px">
          ${audioUrl ? `
            <audio id="podcastHtmlAudio" controls style="width:100%">
              <source src="${audioUrl}" type="audio/wav">
              Your browser does not support audio playback.
            </audio>
          ` : `
            <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px">
              <div style="display:flex; align-items:center; gap:8px">
                <button id="playPodcastSpeechBtn" class="btn-primary" style="padding:8px 16px; font-size:0.85rem; background:var(--accent); border:none; border-radius:var(--radius); color:var(--accent-contrast); cursor:pointer; font-weight:600">
                  ▶️ Play Podcast Dialogue
                </button>
                <button id="stopPodcastSpeechBtn" class="btn-secondary" style="padding:8px 12px; font-size:0.85rem; background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius); color:var(--text); cursor:pointer">
                  ⏹️ Stop
                </button>
              </div>
              <div style="font-size:0.78rem; color:var(--text-dim)">
                Web Audio Voice Synthesis
              </div>
            </div>
          `}
        </div>

        <!-- Interactive Scrolling Transcript -->
        <div style="margin-bottom:12px; font-size:0.85rem; font-weight:700; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.05em">
          📜 Interactive Transcript
        </div>
        <div id="podcastTranscriptContainer" style="max-height:350px; overflow-y:auto; padding-right:4px">
          ${dialogueListHtml}
        </div>
      </div>
    `;

    const playBtn = el.aiPanelContent.querySelector('#playPodcastSpeechBtn');
    const stopBtn = el.aiPanelContent.querySelector('#stopPodcastSpeechBtn');

    if (playBtn) {
      playBtn.addEventListener('click', () => this.toggleSpeechPlayback(playBtn));
    }
    if (stopBtn) {
      stopBtn.addEventListener('click', () => this.stopPlayback());
    }
  },

  toggleSpeechPlayback(btn) {
    if (this.isPlaying) {
      this.stopPlayback();
      if (btn) btn.innerHTML = `▶️ Play Podcast Dialogue`;
    } else {
      this.isPlaying = true;
      if (btn) btn.innerHTML = `⏸️ Pause`;
      this.speakTurn(this.currentTurnIndex);
    }
  },

  speakTurn(index) {
    if (!this.isPlaying || index >= this.dialogueData.length) {
      this.stopPlayback();
      return;
    }

    this.currentTurnIndex = index;
    const turn = this.dialogueData[index];

    const items = el.aiPanelContent.querySelectorAll('.podcast-turn-item');
    items.forEach((item, idx) => {
      if (idx === index) {
        item.style.borderColor = 'var(--accent)';
        item.style.backgroundColor = 'var(--bg-hover)';
        item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        item.style.borderColor = 'var(--border)';
        item.style.backgroundColor = 'var(--bg-card)';
      }
    });

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(turn.text);
      utterance.rate = 1.0;
      utterance.pitch = turn.speaker === 'Alex' ? 1.1 : 0.95;

      utterance.onend = () => {
        if (this.isPlaying) {
          setTimeout(() => this.speakTurn(index + 1), 300);
        }
      };

      utterance.onerror = () => {
        if (this.isPlaying) {
          setTimeout(() => this.speakTurn(index + 1), 300);
        }
      };

      window.speechSynthesis.speak(utterance);
    } else {
      setTimeout(() => this.speakTurn(index + 1), 2500);
    }
  },

  stopPlayback() {
    this.isPlaying = false;
    this.currentTurnIndex = 0;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    const playBtn = el.aiPanelContent ? el.aiPanelContent.querySelector('#playPodcastSpeechBtn') : null;
    if (playBtn) playBtn.innerHTML = `▶️ Play Podcast Dialogue`;
  }
};


/* ================================================================
   3. TOPIC FOCUS MODE (CONCEPT ISOLATION)
   ================================================================ */
const topicFocus = {
  active: false,

  init() {
    if (el.focusToggleBtn) {
      el.focusToggleBtn.addEventListener('click', () => {
        this.toggle();
      });
    }

    if (el.focusInput) {
      el.focusInput.addEventListener('input', () => {
        this.apply(el.focusInput.value.trim());
      });
    }

    if (el.focusClearBtn) {
      el.focusClearBtn.addEventListener('click', () => {
        if (el.focusInput) el.focusInput.value = '';
        this.apply('');
      });
    }
  },

  toggle() {
    this.active = !this.active;
    if (this.active) {
      show(el.focusInput, 'inline-block');
      show(el.focusClearBtn, 'inline-block');
      el.focusInput.focus();
    } else {
      hide(el.focusInput);
      hide(el.focusClearBtn);
      this.apply('');
    }
  },

  apply(keyword) {
    if (!el.content) return;
    const blocks = el.content.querySelectorAll('p, li, blockquote, h1, h2, h3, h4, h5, h6, pre');
    
    if (!keyword) {
      blocks.forEach(b => {
        b.classList.remove('focus-dimmed', 'focus-highlighted');
      });
      return;
    }

    const kw = keyword.toLowerCase();
    blocks.forEach(b => {
      const match = b.textContent.toLowerCase().includes(kw);
      if (match) {
        b.classList.add('focus-highlighted');
        b.classList.remove('focus-dimmed');
      } else {
        b.classList.add('focus-dimmed');
        b.classList.remove('focus-highlighted');
      }
    });
  }
};

/* ---------------- Pomodoro Timer Logic ---------------- */
const pomodoro = {
  duration: 25 * 60,
  timeLeft: 25 * 60,
  timerId: null,
  mode: "study",
  isRunning: false,
  
  init() {
    el.pomodoroHeader.addEventListener("click", () => {
      el.pomodoroWidget.classList.toggle("collapsed");
    });
    
    el.pomodoroStartBtn.addEventListener("click", () => {
      if (this.isRunning) {
        this.pause();
      } else {
        this.start();
      }
    });
    
    el.pomodoroResetBtn.addEventListener("click", () => {
      this.reset();
    });
    
    el.pomodoroWidget.querySelectorAll(".pomodoro-mode-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const mode = btn.dataset.mode;
        this.switchMode(mode);
      });
    });
    
    this.updateDisplay();
  },
  
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    el.pomodoroStartBtn.textContent = "Pause";
    el.pomodoroStartBtn.style.background = "var(--error)";
    
    this.timerId = setInterval(() => {
      this.timeLeft--;
      this.updateDisplay();
      
      if (this.timeLeft <= 0) {
        this.complete();
      }
    }, 1000);
  },
  
  pause() {
    if (!this.isRunning) return;
    this.isRunning = false;
    clearInterval(this.timerId);
    this.timerId = null;
    el.pomodoroStartBtn.textContent = "Start";
    el.pomodoroStartBtn.style.background = "var(--accent)";
  },
  
  reset() {
    this.pause();
    this.timeLeft = this.duration;
    this.updateDisplay();
  },
  
  switchMode(mode) {
    this.pause();
    this.mode = mode;
    
    el.pomodoroWidget.querySelectorAll(".pomodoro-mode-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.mode === mode);
    });
    
    if (mode === "study") {
      this.duration = 25 * 60;
    } else if (mode === "short") {
      this.duration = 5 * 60;
    } else if (mode === "long") {
      this.duration = 15 * 60;
    }
    
    this.timeLeft = this.duration;
    this.updateDisplay();
  },
  
  updateDisplay() {
    const mins = Math.floor(this.timeLeft / 60);
    const secs = this.timeLeft % 60;
    const formatted = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    el.pomodoroTimerDisplay.textContent = formatted;
  },
  
  complete() {
    this.pause();
    this.playAlertSound();
    
    let message = "Study session complete! Time for a break.";
    if (this.mode !== "study") {
      message = "Break over! Time to focus.";
    }
    
    if (this.mode === "study") {
      this.switchMode("short");
    } else {
      this.switchMode("study");
    }
    
    alert(`⏱️ Pomodoro Timer: ${message}`);
  },
  
  playAlertSound() {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      osc.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
      osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.15);
      
      gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
      
      osc.start();
      osc.stop(audioCtx.currentTime + 0.4);
    } catch (err) {
      console.warn("Failed to play Pomodoro synth alert: ", err);
    }
  }
};

/* ================================================================
   TEXT HIGHLIGHTING & STICKY MARGIN NOTES
   ================================================================ */
const highlights = {
  _data: {},  // { fileKey: [ { id, color, text, xpath, offset, note } ] }
  _idCounter: 0,
  _selectedRange: null,
  _activeHighlightId: null,
  _notesPanelOpen: false,

  COLORS: {
    yellow: 'rgba(253,230,138,0.55)',
    green: 'rgba(110,231,183,0.45)',
    blue: 'rgba(125,211,252,0.45)',
    rose: 'rgba(253,164,175,0.45)'
  },

  STRIP_COLORS: {
    yellow: '#f59e0b',
    green: '#10b981',
    blue: '#0ea5e9',
    rose: '#f43f5e'
  },

  /** Load all highlights from localStorage */
  load() {
    try {
      const raw = localStorage.getItem('md-reader-highlights');
      if (raw) this._data = JSON.parse(raw);
    } catch(e) { this._data = {}; }
  },

  /** Save all highlights to localStorage */
  save() {
    localStorage.setItem('md-reader-highlights', JSON.stringify(this._data));
  },

  /** Get highlights for current file */
  getForFile() {
    if (!state.activeKey) return [];
    return this._data[state.activeKey] || [];
  },

  /** Add a highlight record */
  addRecord(color, text, rangeInfo) {
    if (!state.activeKey) return null;
    if (!this._data[state.activeKey]) this._data[state.activeKey] = [];
    const id = 'hl-' + Date.now() + '-' + (this._idCounter++);
    const record = { id, color, text: text.substring(0, 200), rangeInfo, note: '' };
    this._data[state.activeKey].push(record);
    this.save();
    return record;
  },

  /** Remove a highlight */
  removeRecord(id) {
    if (!state.activeKey) return;
    const arr = this._data[state.activeKey];
    if (!arr) return;
    this._data[state.activeKey] = arr.filter(h => h.id !== id);
    this.save();
  },

  /** Update note text for a highlight */
  updateNote(id, noteText) {
    const arr = this.getForFile();
    const h = arr.find(x => x.id === id);
    if (h) { h.note = noteText; this.save(); }
  },

  /** Serialize a Range into a storable object using text-based offsets */
  serializeRange(range) {
    const content = el.content;
    const textNodes = [];
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, null, false);
    let totalOffset = 0;
    let startOffset = -1, endOffset = -1;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const nodeLen = node.textContent.length;
      if (node === range.startContainer) startOffset = totalOffset + range.startOffset;
      if (node === range.endContainer) { endOffset = totalOffset + range.endOffset; break; }
      totalOffset += nodeLen;
    }
    return { startOffset, endOffset };
  },

  /** Deserialize a stored range info back into a live Range */
  deserializeRange(rangeInfo) {
    const content = el.content;
    const { startOffset, endOffset } = rangeInfo;
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, null, false);
    let totalOffset = 0;
    let startNode = null, startNodeOffset = 0;
    let endNode = null, endNodeOffset = 0;

    while (walker.nextNode()) {
      const node = walker.currentNode;
      const nodeLen = node.textContent.length;

      if (!startNode && totalOffset + nodeLen > startOffset) {
        startNode = node;
        startNodeOffset = startOffset - totalOffset;
      }
      if (!endNode && totalOffset + nodeLen >= endOffset) {
        endNode = node;
        endNodeOffset = endOffset - totalOffset;
        break;
      }
      totalOffset += nodeLen;
    }

    if (!startNode || !endNode) return null;
    try {
      const range = document.createRange();
      range.setStart(startNode, startNodeOffset);
      range.setEnd(endNode, endNodeOffset);
      return range;
    } catch(e) { return null; }
  },

  /** Wrap a range in a <mark> element */
  applyHighlightToRange(range, id, color) {
    // For simple single-text-node selections
    try {
      const mark = document.createElement('mark');
      mark.setAttribute('data-hl-id', id);
      mark.setAttribute('data-hl-color', color);
      range.surroundContents(mark);
    } catch(e) {
      // surroundContents fails if selection crosses element boundaries
      // Fall back to extracting and wrapping inline
      const fragment = range.extractContents();
      const mark = document.createElement('mark');
      mark.setAttribute('data-hl-id', id);
      mark.setAttribute('data-hl-color', color);
      mark.appendChild(fragment);
      range.insertNode(mark);
    }
  },

  /** Show annotation toolbar near an element */
  showToolbarAtElement(elem) {
    const toolbar = document.getElementById('annotationToolbar');
    const rect = elem.getBoundingClientRect();
    const readerRect = document.querySelector('.reader').getBoundingClientRect();

    // Position above the element
    toolbar.style.display = 'flex';
    toolbar.style.position = 'absolute';

    const isMobile = window.innerWidth <= 899;
    if (isMobile) {
      toolbar.style.position = 'fixed';
      toolbar.style.left = '50%';
      toolbar.style.transform = 'translateX(-50%)';
      toolbar.style.bottom = '70px';
      toolbar.style.top = 'auto';
    } else {
      const reader = document.querySelector('.reader');
      const scrollTop = reader.scrollTop;
      toolbar.style.top = (rect.top - readerRect.top + scrollTop - 50) + 'px';
      toolbar.style.left = Math.max(0, rect.left - readerRect.left) + 'px';
      toolbar.style.bottom = 'auto';
      toolbar.style.transform = 'none';
    }

    // Update button states
    const hlRec = this.getForFile().find(h => h.id === this._activeHighlightId);
    toolbar.querySelectorAll('.anno-color-btn').forEach(btn => {
      btn.classList.toggle('active', hlRec && btn.dataset.color === hlRec.color);
    });

    // Show/hide remove btn
    document.getElementById('annoClearBtn').style.display = this._activeHighlightId ? '' : 'none';
    document.getElementById('annoNoteBtn').style.display = this._activeHighlightId ? '' : 'none';
  },

  /** Show annotation toolbar at text selection */
  showToolbarAtSelection(range) {
    this._activeHighlightId = null;
    const toolbar = document.getElementById('annotationToolbar');
    const rect = range.getBoundingClientRect();
    const readerRect = document.querySelector('.reader').getBoundingClientRect();

    toolbar.style.display = 'flex';

    const isMobile = window.innerWidth <= 899;
    if (isMobile) {
      toolbar.style.position = 'fixed';
      toolbar.style.left = '50%';
      toolbar.style.transform = 'translateX(-50%)';
      toolbar.style.bottom = '70px';
      toolbar.style.top = 'auto';
    } else {
      const reader = document.querySelector('.reader');
      const scrollTop = reader.scrollTop;
      toolbar.style.position = 'absolute';
      toolbar.style.top = (rect.top - readerRect.top + scrollTop - 50) + 'px';
      toolbar.style.left = Math.max(0, rect.left - readerRect.left) + 'px';
      toolbar.style.bottom = 'auto';
      toolbar.style.transform = 'none';
    }

    // For fresh selection, hide remove/note buttons
    document.getElementById('annoClearBtn').style.display = 'none';
    document.getElementById('annoNoteBtn').style.display = 'none';
    toolbar.querySelectorAll('.anno-color-btn').forEach(btn => btn.classList.remove('active'));
  },

  hideToolbar() {
    document.getElementById('annotationToolbar').style.display = 'none';
    this._selectedRange = null;
  },

  /** Remove a highlight from DOM and data */
  removeHighlight(id) {
    const mark = el.content.querySelector(`mark[data-hl-id="${id}"]`);
    if (mark) {
      const parent = mark.parentNode;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
      parent.normalize();
    }
    this.removeRecord(id);
    this.hideToolbar();
    this.renderNotesPanel();
    this.updateBadge();
  },

  /** Re-apply all stored highlights to the current content */
  restoreHighlights() {
    const records = this.getForFile();
    for (const rec of records) {
      const range = this.deserializeRange(rec.rangeInfo);
      if (range && range.toString().trim()) {
        this.applyHighlightToRange(range, rec.id, rec.color);
      }
    }
    this.updateBadge();
  },

  /** Toggle margin notes panel */
  toggleNotesPanel() {
    const panel = document.getElementById('marginNotesPanel');
    if (this._notesPanelOpen) {
      panel.style.display = 'none';
      this._notesPanelOpen = false;
    } else {
      panel.style.display = 'flex';
      this._notesPanelOpen = true;
      this.renderNotesPanel();
    }
  },

  /** Add a message to a highlight's comment thread */
  addMessageToThread(id, sender, text) {
    const arr = this.getForFile();
    const h = arr.find(x => x.id === id);
    if (!h) return;
    if (!h.messages) h.messages = [];
    const msg = { sender, text, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
    h.messages.push(msg);
    this.save();
    return msg;
  },

  /** Send a comment to @AI for discussion */
  async sendAiComment(id, userText) {
    const arr = this.getForFile();
    const h = arr.find(x => x.id === id);
    if (!h) return;

    this.addMessageToThread(id, 'user', userText);
    this.renderNotesPanel();

    const threadContainer = document.querySelector(`.margin-note-card[data-hl-id="${id}"] .margin-thread-list`);
    const spinner = document.querySelector(`.margin-note-card[data-hl-id="${id}"] .margin-thread-spinner`);
    if (spinner) spinner.style.display = 'flex';

    try {
      const threadHistory = (h.messages || []).map(m => ({
        role: m.sender === 'ai' ? 'model' : 'user',
        parts: [{ text: m.text }]
      }));

      const res = await fetch("/api/ai/comment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          key: state.activeKey,
          paragraphText: h.text,
          commentText: userText,
          threadHistory,
          model: state.selectedModel
        })
      });

      if (!res.ok) throw new Error(`Server status ${res.status}`);
      const data = await res.json();
      const replyText = data.reply || (typeof data === 'string' ? data : "Could not generate AI response.");

      this.addMessageToThread(id, 'ai', replyText);
    } catch (err) {
      this.addMessageToThread(id, 'ai', `⚠️ AI Error: ${escapeHtml(err.message)}`);
    } finally {
      if (spinner) spinner.style.display = 'none';
      this.renderNotesPanel();
    }
  },

  /** Render margin notes list */
  renderNotesPanel() {
    const list = document.getElementById('marginNotesList');
    const records = this.getForFile();

    if (records.length === 0) {
      list.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-muted);font-size:0.85rem">No highlights yet.<br>Select text in the reader to highlight it or discuss with @AI.</div>';
      return;
    }

    list.innerHTML = records.map(rec => {
      const msgs = rec.messages || [];
      const msgsHtml = msgs.map(m => `
        <div class="margin-thread-msg ${m.sender === 'ai' ? 'ai-msg' : 'user-msg'}">
          <div class="margin-thread-meta">
            <span>${m.sender === 'ai' ? '🤖 AI Assistant' : '👤 You'}</span>
            <span>${m.time || ''}</span>
          </div>
          <div class="margin-thread-text">${m.sender === 'ai' ? renderMd(m.text) : escapeHtml(m.text)}</div>
        </div>
      `).join('');

      return `
        <div class="margin-note-card" data-hl-id="${rec.id}">
          <div class="margin-note-color-strip" style="background:${this.STRIP_COLORS[rec.color] || '#888'}"></div>
          <div class="margin-note-excerpt">"${rec.text.substring(0, 80)}${rec.text.length > 80 ? '…' : ''}"</div>
          
          <textarea class="margin-note-textarea" placeholder="Add a note…" data-hl-id="${rec.id}">${rec.note || ''}</textarea>
          
          <!-- Discussion Thread with @AI -->
          <div class="margin-thread-section">
            <div class="margin-thread-header">💬 Discussion & @AI Thread</div>
            <div class="margin-thread-list">${msgsHtml}</div>
            <div class="margin-thread-spinner" style="display:none; align-items:center; gap:6px; font-size:0.75rem; color:var(--accent); margin:6px 0">
              <div class="spinner-ring" style="width:12px;height:12px"></div>
              <span>@AI is thinking…</span>
            </div>
            <div class="margin-thread-input-wrap">
              <input type="text" class="margin-thread-input" placeholder="Type a comment or ask @AI…" data-hl-id="${rec.id}" />
              <button class="margin-thread-send-btn" data-hl-id="${rec.id}" title="Send message to thread">Send</button>
              <button class="margin-thread-ai-btn" data-hl-id="${rec.id}" title="Ask @AI for discussion">🤖 @AI</button>
            </div>
          </div>

          <div class="margin-note-actions">
            <button class="margin-note-delete-btn" data-hl-id="${rec.id}">🗑 Delete</button>
          </div>
        </div>
      `;
    }).join('');

    // Bind events
    list.querySelectorAll('.margin-note-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
        const id = card.dataset.hlId;
        const mark = el.content.querySelector(`mark[data-hl-id="${id}"]`);
        if (mark) mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });

    list.querySelectorAll('.margin-note-textarea').forEach(textarea => {
      let debounce;
      textarea.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
          this.updateNote(textarea.dataset.hlId, textarea.value);
        }, 400);
      });
    });

    // Thread inputs & buttons
    list.querySelectorAll('.margin-thread-send-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.hlId;
        const input = list.querySelector(`.margin-thread-input[data-hl-id="${id}"]`);
        const text = input ? input.value.trim() : '';
        if (!text) return;
        input.value = '';
        if (text.toLowerCase().includes('@ai')) {
          this.sendAiComment(id, text);
        } else {
          this.addMessageToThread(id, 'user', text);
          this.renderNotesPanel();
        }
      });
    });

    list.querySelectorAll('.margin-thread-ai-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.hlId;
        const input = list.querySelector(`.margin-thread-input[data-hl-id="${id}"]`);
        const text = input ? input.value.trim() : '';
        input.value = '';
        this.sendAiComment(id, text || "Can you explain or discuss this paragraph in detail?");
      });
    });

    list.querySelectorAll('.margin-thread-input').forEach(input => {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const id = input.dataset.hlId;
          const text = input.value.trim();
          if (!text) return;
          input.value = '';
          if (text.toLowerCase().includes('@ai')) {
            this.sendAiComment(id, text);
          } else {
            this.addMessageToThread(id, 'user', text);
            this.renderNotesPanel();
          }
        }
      });
    });

    list.querySelectorAll('.margin-note-delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeHighlight(btn.dataset.hlId);
      });
    });
  },

  /** Update the badge on the notes button */
  updateBadge() {
    const btn = document.getElementById('notesToggleBtn');
    if (!btn) return;
    const count = this.getForFile().length;
    let badge = btn.querySelector('.notes-badge');
    if (count > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'notes-badge';
        btn.appendChild(badge);
      }
      badge.textContent = count > 9 ? '9+' : count;
    } else if (badge) {
      badge.remove();
    }
  },

  /** Initialize event listeners */
  init() {
    this.load();

    const toolbar = document.getElementById('annotationToolbar');
    const notesBtn = document.getElementById('notesToggleBtn');
    const notesPanelClose = document.getElementById('marginNotesPanelClose');

    // Delegated click on highlighted text — survives innerHTML restores (search, glossary, edits)
    el.content.addEventListener('click', (e) => {
      const mark = e.target.closest('mark[data-hl-id]');
      if (!mark) return;
      e.stopPropagation();
      this._activeHighlightId = mark.getAttribute('data-hl-id');
      this.showToolbarAtElement(mark);
    });

    // Text selection listener
    document.querySelector('.reader').addEventListener('mouseup', (e) => {
      if (toolbar.contains(e.target)) return;
      setTimeout(() => {
        const selection = window.getSelection();
        if (!selection.rangeCount || selection.isCollapsed) {
          // Check if we clicked on a highlight
          if (e.target.closest('mark[data-hl-id]')) return;
          this.hideToolbar();
          return;
        }
        // Only activate within #content
        const range = selection.getRangeAt(0);
        if (!el.content.contains(range.commonAncestorContainer)) return;

        this._selectedRange = range.cloneRange();
        this.showToolbarAtSelection(range);
      }, 10);
    });

    // Touch support for mobile
    document.querySelector('.reader').addEventListener('touchend', (e) => {
      if (toolbar.contains(e.target)) return;
      setTimeout(() => {
        const selection = window.getSelection();
        if (!selection.rangeCount || selection.isCollapsed) return;
        const range = selection.getRangeAt(0);
        if (!el.content.contains(range.commonAncestorContainer)) return;
        this._selectedRange = range.cloneRange();
        this.showToolbarAtSelection(range);
      }, 300);
    });

    // Color button clicks
    toolbar.querySelectorAll('.anno-color-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const color = btn.dataset.color;

        if (this._activeHighlightId) {
          // Change color of existing highlight
          const mark = el.content.querySelector(`mark[data-hl-id="${this._activeHighlightId}"]`);
          if (mark) {
            mark.setAttribute('data-hl-color', color);
            const rec = this.getForFile().find(h => h.id === this._activeHighlightId);
            if (rec) { rec.color = color; this.save(); }
          }
          this.hideToolbar();
          this.renderNotesPanel();
        } else if (this._selectedRange) {
          // Create new highlight
          const text = this._selectedRange.toString().trim();
          if (!text) return;
          const rangeInfo = this.serializeRange(this._selectedRange);
          const rec = this.addRecord(color, text, rangeInfo);
          if (rec) {
            this.applyHighlightToRange(this._selectedRange, rec.id, color);
            window.getSelection().removeAllRanges();
          }
          this.hideToolbar();
          this.renderNotesPanel();
          this.updateBadge();
        }
      });

      btn.addEventListener('touchend', (e) => {
        e.preventDefault();
        btn.click();
      });
    });

    // Note button
    document.getElementById('annoNoteBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      this.hideToolbar();
      // Open notes panel and scroll to this note
      if (!this._notesPanelOpen) this.toggleNotesPanel();
      else this.renderNotesPanel();
      setTimeout(() => {
        const card = document.querySelector(`.margin-note-card[data-hl-id="${this._activeHighlightId}"]`);
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const ta = card.querySelector('textarea');
          if (ta) ta.focus();
        }
      }, 100);
    });

    // Clear button
    document.getElementById('annoClearBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      if (this._activeHighlightId) {
        this.removeHighlight(this._activeHighlightId);
      }
    });

    // Notes panel toggle button
    if (notesBtn) {
      notesBtn.addEventListener('click', () => this.toggleNotesPanel());
    }

    // Notes panel close button
    if (notesPanelClose) {
      notesPanelClose.addEventListener('click', () => {
        this._notesPanelOpen = false;
        document.getElementById('marginNotesPanel').style.display = 'none';
      });
    }

    // Close toolbar on outside click
    document.addEventListener('click', (e) => {
      if (!toolbar.contains(e.target) && !e.target.closest('mark[data-hl-id]')) {
        this.hideToolbar();
      }
    });
  }
};

/* ================================================================
   4. SPLIT SCREEN DUAL READER
   ================================================================ */
const splitScreen = {
  init() {
    if (el.splitModeBtn) {
      el.splitModeBtn.addEventListener("click", () => {
        this.toggle();
      });
    }

    if (el.primaryPane) {
      el.primaryPane.addEventListener("click", () => {
        this.setActivePane("primary");
      });
    }
    if (el.secondaryPane) {
      el.secondaryPane.addEventListener("click", () => {
        this.setActivePane("secondary");
      });
    }
  },

  toggle() {
    state.isSplitMode = !state.isSplitMode;
    
    if (state.isSplitMode) {
      el.splitModeBtn.classList.add("active");
      el.readerSplitWrapper.classList.add("split");
      show(el.secondaryPane);
      
      // If there's no secondary file loaded yet, load current one or display instructions
      if (!state.secondaryKey) {
        el.contentSecondary.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-dim)">
          <h3>Secondary Reading Pane</h3>
          <p style="font-size:0.85rem;margin-top:8px">Select any file from the sidebar to open it here.</p>
        </div>`;
        show(el.contentSecondary);
      }
      
      // Focus on secondary pane to invite user selection
      this.setActivePane("secondary");
    } else {
      el.splitModeBtn.classList.remove("active");
      el.readerSplitWrapper.classList.remove("split");
      hide(el.secondaryPane);
      hide(el.contentSecondary);
      hide(el.readingStatsBarSecondary);
      
      state.secondaryKey = null;
      this.setActivePane("primary");
      
      // Update sidebar file highlights to single activeKey
      el.fileList.querySelectorAll(".file-item").forEach((item) => {
        if (item.dataset.key === state.activeKey) {
          item.classList.add("active");
        } else {
          item.classList.remove("active");
        }
      });
    }
  },

  setActivePane(pane) {
    state.activePane = pane;
    if (pane === "primary") {
      el.primaryPane.classList.add("active");
      if (el.secondaryPane) el.secondaryPane.classList.remove("active");
    } else {
      if (el.secondaryPane) el.secondaryPane.classList.add("active");
      el.primaryPane.classList.remove("active");
    }
  },

  /** Render arbitrary markdown (e.g. an AI translation) into the secondary pane */
  openSecondaryWithMarkdown(title, markdownText) {
    if (!state.isSplitMode) this.toggle();
    state.secondaryKey = null; // virtual content — not a bucket file
    state.activePane = "primary"; // keep user file actions on the primary pane

    el.contentSecondary.innerHTML = `<div class="split-pane-virtual-header" style="padding:8px 12px;margin-bottom:12px;background:var(--bg-elevated);border:1px solid var(--border);border-radius:var(--radius);font-size:0.85rem;font-weight:700;color:var(--accent)">${escapeHtml(title || "Translated Document")}</div>` + renderMd(markdownText || "");
    show(el.contentSecondary);
    show(el.readingStatsBarSecondary, 'flex');
    updateReadingStatsSecondary(markdownText || "");

    if (window.renderMathInElement) {
      renderMathInElement(el.contentSecondary, {
        delimiters: [
          {left: "$$", right: "$$", display: true},
          {left: "$", right: "$", display: false}
        ],
        throwOnError: false
      });
    }

    // Close the AI panel so the side-by-side view is unobstructed
    closeAiPanel();
  }
};

/* ---------------- Init ---------------- */
async function initApp() {
  try {
    const res = await fetch("/api/ai/cache");
    if (res.ok) {
      const remoteCache = await res.json();
      // Merge remote cache with local cache
      state.aiCache = { ...state.aiCache, ...remoteCache };
      localStorage.setItem("md-reader-ai-cache", JSON.stringify(state.aiCache));
    }
  } catch (err) {
    console.error("Failed to sync remote AI cache:", err);
  }
  
  if (window.mermaid) {
    mermaid.initialize({
      startOnLoad: false,
      theme: state.theme === "night" ? "dark" : "default",
      securityLevel: "loose"
    });
  }

  await loadFileList();
  pomodoro.init();
  highlights.init();
  gamification.init();
  autoGlossary.init();
  glossaryHub.init();
  aiTranslator.init();
  aiPodcast.init();
  topicFocus.init();
  splitScreen.init();
  uiRefresh.init();

  // Global event delegation for in-page anchor links in the Markdown content
  el.content.addEventListener('click', (e) => {
    const link = e.target.closest('a[href*="#"]');
    if (!link) return;

    const href = link.getAttribute('href') || '';
    const hashIdx = href.indexOf('#');
    if (hashIdx === -1) return;

    const targetId = decodeURIComponent(href.slice(hashIdx + 1)).trim();
    if (!targetId && href === '#') return;

    e.preventDefault();

    const linkText = link.textContent.trim();

    const clean = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const targetClean = clean(targetId);
    const linkTextClean = clean(linkText);

    const allHeadings = Array.from(el.content.querySelectorAll('h1, h2, h3, h4, h5, h6'));

    // 1. Direct ID match
    let target = targetId ? document.getElementById(targetId) : null;

    // 2. Exact clean string match
    if (!target && targetClean) {
      target = allHeadings.find(h => {
        const hc = clean(h.id);
        const ht = clean(h.textContent);
        const hcn = h.dataset.cleanTextNoNum || '';
        return hc === targetClean || ht === targetClean || hcn === targetClean;
      });
    }

    // 3. Suffix/Substring match (handles "2-the-problem..." vs "the-problem...")
    if (!target && targetClean) {
      target = allHeadings.find(h => {
        const hc = clean(h.id);
        const ht = clean(h.textContent);
        const hcn = h.dataset.cleanTextNoNum || '';
        return (
          ht.endsWith(targetClean) ||
          targetClean.endsWith(ht) ||
          hcn.endsWith(targetClean) ||
          targetClean.endsWith(hcn) ||
          hc.endsWith(targetClean) ||
          targetClean.endsWith(hc)
        );
      });
    }

    // 4. Match by link text content
    if (!target && linkTextClean) {
      target = allHeadings.find(h => {
        const ht = clean(h.textContent);
        const hcn = h.dataset.cleanTextNoNum || '';
        return ht === linkTextClean || hcn === linkTextClean || ht.endsWith(linkTextClean) || linkTextClean.endsWith(ht);
      });
    }

    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });

      const origBg = target.style.backgroundColor;
      target.style.transition = 'background-color 0.4s ease';
      target.style.backgroundColor = 'var(--bg-hover)';
      setTimeout(() => {
        target.style.backgroundColor = origBg;
      }, 1000);
    }
  });

  if (el.contentSecondary) {
    el.contentSecondary.addEventListener('click', (e) => {
      const link = e.target.closest('a[href*="#"]');
      if (!link) return;

      const href = link.getAttribute('href') || '';
      const hashIdx = href.indexOf('#');
      if (hashIdx === -1) return;

      const targetId = decodeURIComponent(href.slice(hashIdx + 1)).trim();
      if (!targetId && href === '#') return;

      e.preventDefault();

      const linkText = link.textContent.trim();
      const clean = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const targetClean = clean(targetId);
      const linkTextClean = clean(linkText);

      const allHeadings = Array.from(el.contentSecondary.querySelectorAll('h1, h2, h3, h4, h5, h6'));

      let target = targetId ? el.contentSecondary.querySelector(`#${CSS.escape(targetId)}`) : null;

      if (!target && targetClean) {
        target = allHeadings.find(h => {
          const hc = clean(h.id);
          const ht = clean(h.textContent);
          const hcn = h.dataset.cleanTextNoNum || '';
          return hc === targetClean || ht === targetClean || hcn === targetClean;
        });
      }

      if (!target && targetClean) {
        target = allHeadings.find(h => {
          const hc = clean(h.id);
          const ht = clean(h.textContent);
          const hcn = h.dataset.cleanTextNoNum || '';
          return (
            ht.endsWith(targetClean) ||
            targetClean.endsWith(ht) ||
            hcn.endsWith(targetClean) ||
            targetClean.endsWith(hcn) ||
            hc.endsWith(targetClean) ||
            targetClean.endsWith(hc)
          );
        });
      }

      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });

        const origBg = target.style.backgroundColor;
        target.style.transition = 'background-color 0.4s ease';
        target.style.backgroundColor = 'var(--bg-hover)';
        setTimeout(() => {
          target.style.backgroundColor = origBg;
        }, 1000);
      }
    });
  }

  const savedActiveKey = localStorage.getItem("md-reader-active-key");
  // Deep-link: ?doc=<key> opens that document directly (shareable/printable URL)
  const docParam = new URLSearchParams(window.location.search).get("doc");
  if (docParam && state.files.some((f) => f.key === docParam)) {
    openFile(docParam);
    // Test/UX hook: #zen starts the session in Zen Mode
    if (location.hash === "#zen" && window.__zen && window.__zen.set) {
      setTimeout(() => window.__zen.set(true), 400);
    }
  } else if (savedActiveKey && state.files.some((f) => f.key === savedActiveKey)) {
    openFile(savedActiveKey);
  } else {
    studyDashboard.render();
    uiRefresh.maybeStartTour();
  }
}

/* ================================================================
   UI REFRESH — overflow menu, settings drawer, AI dropup,
   breadcrumb, read strip, density, onboarding tour, focus trap
   ================================================================ */

/* ---------- Lightweight modal focus trap ---------- */
const focusTrap = {
  _activeFor: null,
  _prevFocus: null,
  start(dialog) {
    if (!dialog) return;
    this._prevFocus = document.activeElement;
    this._activeFor = dialog;
    const focusables = dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusables.length) focusables[0].focus();
    this._keyHandler = (e) => {
      if (e.key !== 'Tab' || this._activeFor !== dialog) return;
      const nodes = [...dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
        .filter(n => !n.disabled && n.offsetParent !== null);
      if (!nodes.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', this._keyHandler);
  },
  stop() {
    if (this._keyHandler) document.removeEventListener('keydown', this._keyHandler);
    this._keyHandler = null;
    this._activeFor = null;
    if (this._prevFocus && this._prevFocus.focus) this._prevFocus.focus();
    this._prevFocus = null;
  }
};

const uiRefresh = {
  init() {
    /* ---------- ⋮ More tools menu ---------- */
    if (el.topbarMoreBtn && el.topbarMoreMenu) {
      el.topbarMoreBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const open = el.topbarMoreMenu.style.display === "block";
        el.topbarMoreMenu.style.display = open ? "none" : "block";
      });
      // Row clicks forward to the row's real button
      el.topbarMoreMenu.querySelectorAll(".more-menu-row").forEach(row => {
        row.addEventListener("click", (e) => {
          const btn = row.querySelector("button");
          if (btn && !btn.disabled && btn.style.display !== "none" && e.target !== btn && !btn.contains(e.target)) {
            btn.click();
          }
        });
      });
      document.addEventListener("click", (e) => {
        if (!el.topbarMoreMenu.contains(e.target) && e.target !== el.topbarMoreBtn && !el.topbarMoreBtn.contains(e.target)) {
          hide(el.topbarMoreMenu);
        }
      });
    }

    /* ---------- ⚙️ Settings drawer ---------- */
    const openDrawer = () => {
      show(el.settingsDrawer, 'block');
      show(el.drawerBackdrop, 'block');
      hide(el.topbarMoreMenu);
      focusTrap.start(el.settingsDrawer);
    };
    const closeDrawer = () => {
      hide(el.settingsDrawer);
      hide(el.drawerBackdrop);
      focusTrap.stop();
    };
    if (el.settingsBtn) el.settingsBtn.addEventListener("click", (e) => { e.stopPropagation(); openDrawer(); });
    if (el.settingsDrawerClose) el.settingsDrawerClose.addEventListener("click", closeDrawer);
    if (el.drawerBackdrop) el.drawerBackdrop.addEventListener("click", closeDrawer);

    if (el.drawerAccentSwatches) {
      el.drawerAccentSwatches.querySelectorAll(".swatch").forEach(swatch => {
        swatch.addEventListener("click", () => {
          applyAccent(swatch.dataset.accent);
          quickToast(`🎨 Accent: ${swatch.title}`);
        });
      });
    }

    if (el.densitySelect) {
      el.densitySelect.value = localStorage.getItem("md-reader-density") || "comfortable";
      el.densitySelect.addEventListener("change", (e) => this.applyDensity(e.target.value));
      this.applyDensity(el.densitySelect.value);
    }

    /* ---------- AI toolbar: More AI tools dropup ---------- */
    if (el.aiMoreBtn && el.aiMoreMenu) {
      el.aiMoreBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        el.aiMoreMenu.style.display = el.aiMoreMenu.style.display === "block" ? "none" : "block";
      });
      el.aiMoreMenu.querySelectorAll(".ai-more-item").forEach(btn => {
        btn.addEventListener("click", () => hide(el.aiMoreMenu));
      });
      document.addEventListener("click", (e) => {
        if (!el.aiMoreMenu.contains(e.target) && e.target !== el.aiMoreBtn && !el.aiMoreBtn.contains(e.target)) {
          hide(el.aiMoreMenu);
        }
      });
    }

    /* ---------- Copy deep link ---------- */
    if (el.copyDocLinkBtn) {
      el.copyDocLinkBtn.addEventListener("click", async () => {
        if (!state.activeKey) return;
        const link = `${location.origin}/?doc=${encodeURIComponent(state.activeKey)}`;
        try {
          await navigator.clipboard.writeText(link);
          quickToast("🔗 Deep link copied!");
        } catch (e) {
          window.prompt("Copy this link:", link);
        }
      });
    }

    /* ---------- Onboarding tour (first run) ---------- */
    this.initTour();
  },

  applyDensity(mode) {
    const val = mode === "compact" ? "compact" : "comfortable";
    document.documentElement.setAttribute("data-density", val);
    localStorage.setItem("md-reader-density", val);
    if (el.densitySelect) el.densitySelect.value = val;
  },

  /* ---------- Breadcrumb & read strip ---------- */
  updateDocChrome(key) {
    if (!el.breadcrumbBar) return;
    const parts = key.split('/');
    el.breadcrumbPath.textContent = parts.join(" / ");
    el.breadcrumbBar.title = key;
    show(el.breadcrumbBar, 'flex');
    show(el.readProgressStrip, 'block');
    this.updateReadStrip(key);
  },

  updateReadStrip(key) {
    const pct = readingProgress.percent(key || state.activeKey);
    if (el.readProgressFill) el.readProgressFill.style.width = pct + "%";
    if (el.breadcrumbProgress) el.breadcrumbProgress.textContent = pct > 0 ? `${pct}% read` : "";
  },

  hideDocChrome() {
    if (el.breadcrumbBar) hide(el.breadcrumbBar);
    if (el.readProgressStrip) hide(el.readProgressStrip);
  },

  /* ---------- Skeleton loader for the reader ---------- */
  readerSkeleton() {
    return `<div class="skeleton-wrap" aria-hidden="true">
      <div class="skeleton skeleton-title" style="width:60%"></div>
      <div class="skeleton skeleton-line" style="width:96%"></div>
      <div class="skeleton skeleton-line" style="width:88%"></div>
      <div class="skeleton skeleton-line" style="width:92%"></div>
      <div class="skeleton skeleton-line" style="width:70%"></div>
      <div class="skeleton skeleton-line" style="width:90%"></div>
    </div>`;
  },

  /* ---------- Onboarding tour ---------- */
  initTour() {
    if (localStorage.getItem("md-reader-tour-seen")) return;
    const steps = [
      { sel: "#sidebar", text: "📚 Your library lives here — search, upload, organize into folders, restore from Trash." },
      { sel: "#aiToolbar", text: "🤖 AI tools for every doc: summarize, quiz, flashcards — and 5 more under 'More AI tools'." },
      { sel: "#topbarMoreBtn", text: "⋮ Extra actions (edit, split view, exports, read-aloud) and Appearance Settings are tucked in here." },
      { sel: "#pomodoroWidget", text: "⏱️ Focus with the Pomodoro timer and earn XP for reading." },
      { sel: "#quickCaptureBtn", text: "⚡ Capture a thought anytime — it lands in today's Inbox note automatically." }
    ];
    let idx = 0;
    const overlay = el.tourOverlay;
    if (!overlay) return;

    const showStep = () => {
      if (idx >= steps.length) { this.endTour(); return; }
      const target = document.querySelector(steps[idx].sel);
      el.tourBubbleText.textContent = steps[idx].text;
      el.tourNextBtn.textContent = idx === steps.length - 1 ? "Finish" : "Next";
      show(overlay, 'block');
    };

    el.tourNextBtn.addEventListener("click", () => { idx++; showStep(); });
    el.tourSkipBtn.addEventListener("click", () => this.endTour());
    // Don't show tour until the app has loaded (called from initApp)
    this._pendingTour = () => showStep();
  },

  maybeStartTour() {
    if (this._pendingTour) { this._pendingTour(); this._pendingTour = null; }
  },

  endTour() {
    localStorage.setItem("md-reader-tour-seen", "1");
    hide(el.tourOverlay);
  }
};


/* ================================================================
   TIER-1 FEATURES
   1. Reading Position Memory
   2. SM-2 Spaced Repetition (flashcards)
   3. Trash & Restore
   4. Quick Capture (Inbox)
   5. Study Dashboard
   ================================================================ */

/* ---------------- 1. Reading Position Memory ---------------- */
const readingProgress = {
  _store: null,
  _load() {
    if (this._store) return;
    try { this._store = JSON.parse(localStorage.getItem("md-reader-progress") || "{}"); }
    catch (e) { this._store = {}; }
  },
  set(key, ratio) {
    this._load();
    this._store[key] = { ratio: Math.round(ratio * 1000) / 1000, ts: Date.now() };
    try { localStorage.setItem("md-reader-progress", JSON.stringify(this._store)); } catch (e) {}
  },
  get(key) {
    this._load();
    return this._store[key] || null;
  },
  percent(key) {
    const p = this.get(key);
    return p ? Math.round(p.ratio * 100) : 0;
  }
};

// Track primary-pane scrolling (throttled)
(function initReadingTracker() {
  const readerEl = document.querySelector(".reader");
  if (!readerEl) return;
  let scrollSaveTimer = null;
  readerEl.addEventListener("scroll", () => {
    clearTimeout(scrollSaveTimer);
    scrollSaveTimer = setTimeout(() => {
      if (!state.activeKey || state.activePane !== "primary") return;
      const max = readerEl.scrollHeight - readerEl.clientHeight;
      if (max <= 0) return;
      readingProgress.set(state.activeKey, Math.max(0, Math.min(1, readerEl.scrollTop / max)));
      window.dispatchEvent(new CustomEvent("md-reader:read-progress", { detail: { key: state.activeKey } }));
      if (typeof uiRefresh === "object" && uiRefresh.updateReadStrip) uiRefresh.updateReadStrip(state.activeKey);
    }, 400);
  }, { passive: true });
})();

/* ---------------- 2. SM-2 Spaced Repetition ---------------- */
const srsDeck = {
  _store: null,

  _load() {
    if (this._store) return;
    try { this._store = JSON.parse(localStorage.getItem("md-reader-srs") || "{}"); }
    catch (e) { this._store = {}; }
  },
  _save() {
    try { localStorage.setItem("md-reader-srs", JSON.stringify(this._store)); } catch (e) {}
  },
  _todayStr() {
    return new Date().toISOString().split("T")[0];
  },

  getSchedule(key, idx) {
    this._load();
    return (this._store[key] || {})[idx] || null;
  },

  isDue(sched) {
    if (!sched || !sched.due) return true; // new card
    return sched.due <= this._todayStr();
  },

  /** SM-2: quality 2 (hard) / 4 (medium) / 5 (easy) */
  rate(key, idx, quality) {
    this._load();
    if (!this._store[key]) this._store[key] = {};
    let s = this._store[key][idx] || { reps: 0, interval: 0, ef: 2.5, due: null };

    if (quality < 3) {
      s.reps = 0;
      s.interval = 1;
      s.ef = Math.max(1.3, s.ef - 0.2);
    } else {
      if (s.reps === 0) s.interval = 1;
      else if (s.reps === 1) s.interval = 6;
      else s.interval = Math.min(365, Math.round(s.interval * s.ef));
      s.ef = Math.max(1.3, s.ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
      s.reps += 1;
    }

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + s.interval);
    s.due = dueDate.toISOString().split("T")[0];
    s.lastRating = quality;

    this._store[key][idx] = s;
    this._save();
    return s;
  },

  /** Indices of cards due for review today (incl. brand-new cards). */
  dueIndices(key, deckLength) {
    this._load();
    const due = [];
    for (let i = 0; i < deckLength; i++) {
      if (this.isDue(this.getSchedule(key, i))) due.push(i);
    }
    return due;
  },

  /** Total due cards across every doc (for the dashboard). */
  totalDueCount() {
    this._load();
    let total = 0;
    for (const key of Object.keys(this._store)) {
      const deck = state.aiCache[key];
      const len = deck && deck.flashcards ? deck.flashcards.length : Object.keys(this._store[key]).length;
      for (let i = 0; i < len; i++) {
        if (this.isDue(this._store[key][i])) total++;
      }
    }
    // Also count decks that exist in aiCache but never scheduled
    for (const key of Object.keys(state.aiCache || {})) {
      const deck = state.aiCache[key];
      if (!this._store[key] && deck && deck.flashcards && deck.flashcards.length) {
        total += deck.flashcards.length; // all new
      }
    }
    return total;
  },

  /** Key with the most due cards (for "Study now"). */
  mostDueKey() {
    this._load();
    let best = null, bestCount = 0;
    for (const key of Object.keys(state.aiCache || {})) {
      const deck = state.aiCache[key];
      if (!deck || !deck.flashcards || !deck.flashcards.length) continue;
      const count = this.dueIndices(key, deck.flashcards.length).length;
      if (count > bestCount) { bestCount = count; best = key; }
    }
    return best;
  },

  /** Study order for a deck: due cards first (stable within groups). */
  buildStudyOrder(key, length) {
    const due = new Set(this.dueIndices(key, length));
    return Array.from({ length }, (_, i) => i).sort((a, b) => (due.has(b) ? 1 : 0) - (due.has(a) ? 1 : 0));
  }
};

/* ---------------- 3. Trash & Restore ---------------- */
const trashUI = {
  init() {
    el.trashBtn.addEventListener("click", () => this.open());
    el.trashModalClose.addEventListener("click", () => hide(el.trashModal));
    el.trashEmptyBtn.addEventListener("click", () => this.emptyTrash());
  },

  async open() {
    show(el.trashModal, 'flex');
    el.trashFooterStatus.textContent = "";
    closeSidebar();
    await this.renderList();
  },

  async renderList() {
    el.trashList.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text-dim);font-size:0.85rem">Loading…</div>`;
    try {
      const res = await authFetch("/api/trash");
      const data = await res.json();
      const items = data.items || [];

      if (!items.length) {
        el.trashList.innerHTML = `<div style="text-align:center;padding:30px;color:var(--text-dim);font-size:0.85rem">🎉 Trash is empty.<br>Deleted files appear here for restoring.</div>`;
        el.trashEmptyBtn.disabled = true;
        return;
      }

      el.trashEmptyBtn.disabled = false;
      el.trashList.innerHTML = items.map(item => `
        <div class="trash-item" data-trash-key="${escapeHtml(item.trashKey)}">
          <div class="trash-item-info">
            <div class="trash-item-name" title="${escapeHtml(item.originalKey)}">📄 ${escapeHtml(item.originalKey)}</div>
            <div class="trash-item-meta">${(item.size / 1024).toFixed(1)} KB • deleted ${item.uploaded ? new Date(item.uploaded).toLocaleDateString() : ''}</div>
          </div>
          <div class="trash-item-actions">
            <button class="lib-mini-btn trash-restore-btn" data-trash-key="${escapeHtml(item.trashKey)}">↩️ Restore</button>
            <button class="lib-mini-btn warn trash-delete-btn" data-trash-key="${escapeHtml(item.trashKey)}">Delete forever</button>
          </div>
        </div>
      `).join("");

      el.trashList.querySelectorAll(".trash-restore-btn").forEach(btn =>
        btn.addEventListener("click", () => this.restore(btn.dataset.trashKey)));
      el.trashList.querySelectorAll(".trash-delete-btn").forEach(btn =>
        btn.addEventListener("click", () => this.deleteForever(btn.dataset.trashKey)));
    } catch (err) {
      el.trashList.innerHTML = `<div style="text-align:center;padding:20px;color:var(--error)">Failed to load trash: ${escapeHtml(err.message)}</div>`;
    }
  },

  async restore(trashKey) {
    el.trashFooterStatus.textContent = "Restoring…";
    try {
      const res = await authFetch("/api/trash/restore", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ trashKey })
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Restore failed");
      el.trashFooterStatus.textContent = `✅ Restored ${data.key}`;
      await Promise.all([this.renderList(), loadFileList()]);
    } catch (err) {
      el.trashFooterStatus.textContent = "❌ " + err.message;
    }
  },

  async deleteForever(trashKey) {
    const item = el.trashList.querySelector(`.trash-item[data-trash-key="${CSS.escape(trashKey)}"] .trash-item-name`);
    const name = item ? item.textContent.trim() : trashKey;
    if (!confirm(`Permanently delete "${name}"? This cannot be undone.`)) return;
    try {
      const res = await authFetch(`/api/file?key=${encodeURIComponent(trashKey)}&permanent=true`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Delete failed");
      el.trashFooterStatus.textContent = "Deleted permanently.";
      await this.renderList();
    } catch (err) {
      el.trashFooterStatus.textContent = "❌ " + err.message;
    }
  },

  async emptyTrash() {
    if (!confirm("Permanently delete EVERYTHING in the trash? This cannot be undone.")) return;
    try {
      const res = await authFetch("/api/trash/empty", { method: "POST" });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Empty trash failed");
      el.trashFooterStatus.textContent = `🗑️ Trash emptied (${data.deletedCount} items).`;
      await this.renderList();
    } catch (err) {
      el.trashFooterStatus.textContent = "❌ " + err.message;
    }
  }
};

/* ---------------- 4. Quick Capture ---------------- */
const quickCapture = {
  init() {
    el.quickCaptureBtn.addEventListener("click", () => this.open());
    el.quickCaptureModalClose.addEventListener("click", () => hide(el.quickCaptureModal));
    el.quickCaptureSubmitBtn.addEventListener("click", () => this.save());
    el.quickCaptureInput.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); this.save(); }
    });
  },

  open() {
    const dateStr = new Date().toISOString().split("T")[0];
    el.quickCaptureTarget.textContent = `Inbox/${dateStr}.md`;
    el.quickCaptureInput.value = "";
    el.quickCaptureStatus.textContent = "";
    show(el.quickCaptureModal, 'flex');
    el.quickCaptureInput.focus();
  },

  async save() {
    const content = el.quickCaptureInput.value.trim();
    if (!content) {
      el.quickCaptureStatus.textContent = "Write something first…";
      return;
    }
    el.quickCaptureSubmitBtn.disabled = true;
    el.quickCaptureStatus.textContent = "Saving…";
    try {
      const res = await authFetch("/api/inbox/append", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content })
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Save failed");
      el.quickCaptureStatus.textContent = `✅ Saved to ${data.key}`;
      gamification.awardXp(5, 'capture');
      await loadFileList();
      setTimeout(() => hide(el.quickCaptureModal), 700);
    } catch (err) {
      el.quickCaptureStatus.textContent = "❌ " + err.message;
    } finally {
      el.quickCaptureSubmitBtn.disabled = false;
    }
  }
};

/* ---------------- 5. Study Dashboard ---------------- */
const studyDashboard = {
  render() {
    // Only render into the empty state (no document open)
    const recents = JSON.parse(localStorage.getItem("md-reader-recent") || "[]");
    const due = srsDeck.totalDueCount();
    const g = gamification.data;
    const hasActivity = recents.length > 0;

    let continueHtml = "";
    if (hasActivity) {
      continueHtml = recents.slice(0, 5).map(key => {
        const pct = readingProgress.percent(key);
        const name = key.split('/').pop().replace(/\.(md|markdown)$/i, '');
        return `
          <button class="dash-doc-row" data-dash-key="${escapeHtml(key)}" title="${escapeHtml(key)}">
            <span class="dash-doc-name">📄 ${escapeHtml(name)}</span>
            <span class="dash-doc-progress"><span class="dash-doc-progress-fill" style="width:${pct}%"></span></span>
            <span class="dash-doc-pct">${pct}%</span>
          </button>
        `;
      }).join("");
    } else {
      continueHtml = `<div style="font-size:0.82rem;color:var(--text-dim);padding:8px 0">No recently opened documents yet — pick a file from the sidebar!</div>`;
    }

    el.emptyState.innerHTML = `
      <div class="empty-icon">📖</div>
      <h2>Welcome back${hasActivity ? '' : ' to MD Reader'}</h2>
      <p class="empty-hint">${hasActivity ? 'Jump back in, or start something new.' : 'Pick a Markdown file from the sidebar to start reading.'}</p>

      <div class="dash-grid">
        <div class="dash-card">
          <div class="dash-card-title">📖 Continue Reading</div>
          ${continueHtml}
        </div>

        <div class="dash-card">
          <div class="dash-card-title">🗂️ Flashcard Reviews</div>
          <div style="font-size:1.6rem;font-weight:700;color:${due > 0 ? 'var(--accent)' : 'var(--text-dim)'};margin:6px 0">${due} card${due === 1 ? '' : 's'} due today</div>
          <button id="dashStudyBtn" class="btn-primary" style="align-self:flex-start;padding:6px 14px;font-size:0.8rem;background:var(--accent);border:none;border-radius:var(--radius);color:var(--accent-contrast);cursor:pointer;font-weight:600" ${due === 0 ? 'disabled' : ''}>🧠 Study Now</button>
        </div>

        <div class="dash-card">
          <div class="dash-card-title">🏆 Progress</div>
          <div style="display:flex;justify-content:space-between;font-size:0.85rem;margin-bottom:6px">
            <span>⚡ Level ${g.level} Scholar</span>
            <span>🔥 ${g.streak} day streak</span>
          </div>
          <div class="dash-xp-bar"><span class="dash-doc-progress-fill" style="width:${Math.min(100, g.xp % 100)}%"></span></div>
          <div style="font-size:0.72rem;color:var(--text-dim);margin-top:4px">${g.xp} total XP</div>
        </div>

        <div class="dash-card">
          <div class="dash-card-title">⚡ Quick Actions</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            <button id="dashNewNoteBtn" class="dash-action-btn">📝 New Note</button>
            <button id="dashUploadBtn" class="dash-action-btn">📤 Upload</button>
            <button id="dashChatBtn" class="dash-action-btn">💬 AI Chat</button>
            <button id="dashCaptureBtn" class="dash-action-btn">⚡ Quick Capture</button>
          </div>
        </div>
      </div>
    `;

    // Bind actions
    el.emptyState.querySelectorAll(".dash-doc-row").forEach(btn =>
      btn.addEventListener("click", () => openFile(btn.dataset.dashKey)));
    const studyBtn = doc_byId("dashStudyBtn");
    if (studyBtn) studyBtn.addEventListener("click", async () => {
      const key = srsDeck.mostDueKey();
      if (key) {
        await openFile(key);
        el.flashcardsBtn.click();
      }
    });
    const bind = (id, fn) => { const b = doc_byId(id); if (b) b.addEventListener("click", fn); };
    bind("dashNewNoteBtn", () => libraryManager.open("note"));
    bind("dashUploadBtn", () => libraryManager.open("upload"));
    bind("dashChatBtn", () => openGeneralChat());
    bind("dashCaptureBtn", () => quickCapture.open());
  }
};
function doc_byId(id) { return el.emptyState.querySelector("#" + id); }

trashUI.init();
quickCapture.init();

/* ---------------- Global ESC to close any open modal ---------------- */
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  document.querySelectorAll(".modal-overlay").forEach(m => {
    if (m.style.display && m.style.display !== "none") hide(m);
  });
});

initApp();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('Service Worker registered:', reg.scope))
      .catch(err => console.error('Service Worker registration failed:', err));
  });
}

/* ---------- 🎯 Focus / Zen Mode & Typewriter Scrolling ---------- */
(function initZenMode() {
  let isZenMode = false;
  let typewriterEnabled = localStorage.getItem("md-reader-zen-typewriter") === "1";
  let typeTimer = null;
  let lastActiveEl = null;
  const readerContainer = document.querySelector('.reader');
  const content = document.getElementById('content');
  const cluster = document.getElementById('zenControlCluster');
  const exitBtn = document.getElementById('exitZenBtn');
  const typeBtn = document.getElementById('zenTypeBtn');
  const toggleBtn = el.zenModeBtn;

  /** Find the top-level paragraph closest to the focus line.
   *  Flow layout means block centers are monotonically increasing — once the
   *  distance starts growing again we can stop early (O(viewport), not O(doc). */
  function updateActiveParagraph() {
    if (!isZenMode || !content) return;
    const children = Array.from(content.children);
    if (!children.length) return;

    const targetCenter = window.innerHeight * 0.38;
    const viewportBottom = window.innerHeight + 50;
    let closestEl = null;
    let minDistance = Infinity;

    for (const child of children) {
      const rect = child.getBoundingClientRect();
      if (rect.bottom < -50) continue;              // above the viewport — can't win
      if (rect.top > viewportBottom) break;          // below the viewport — done scanning
      const childCenter = rect.top + rect.height / 2;
      const dist = Math.abs(childCenter - targetCenter);
      if (dist < minDistance) {
        minDistance = dist;
        closestEl = child;
      } else if (childCenter > targetCenter) {
        break; // centers only increase from here — distances can only grow
      }
    }

    children.forEach((child) => {
      if (child === closestEl) {
        child.classList.add('zen-active-paragraph');
      } else {
        child.classList.remove('zen-active-paragraph');
      }
    });

    // Typewriter mode: when the settled active paragraph changes, gently center it
    if (typewriterEnabled && closestEl && closestEl !== lastActiveEl) {
      const elToCenter = closestEl;
      clearTimeout(typeTimer);
      typeTimer = setTimeout(() => {
        if (elToCenter.classList.contains('zen-active-paragraph')) {
          elToCenter.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 450);
    }
    lastActiveEl = closestEl;
  }

  function setZenMode(enable) {
    if (enable && !state.activeKey) {
      quickToast("🧘 Open a document first — Zen Mode focuses on your reading.");
      return;
    }
    isZenMode = enable;
    if (isZenMode) {
      document.body.classList.add('zen-mode');
      if (cluster) cluster.style.display = 'flex';
      refreshTypeBtn();
      lastActiveEl = null;
      updateActiveParagraph();
      quickToast("🧘 Zen Mode on — focus reading. ESC to exit.");
    } else {
      document.body.classList.remove('zen-mode');
      if (cluster) cluster.style.display = 'none';
      clearTimeout(typeTimer);
      if (content) {
        Array.from(content.children).forEach(child => child.classList.remove('zen-active-paragraph'));
      }
    }
  }

  function refreshTypeBtn() {
    if (!typeBtn) return;
    typeBtn.classList.toggle('active', typewriterEnabled);
    typeBtn.setAttribute('aria-pressed', typewriterEnabled ? 'true' : 'false');
  }

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => setZenMode(!isZenMode));
  }

  if (exitBtn) {
    exitBtn.addEventListener('click', () => setZenMode(false));
  }

  if (typeBtn) {
    typeBtn.addEventListener('click', () => {
      typewriterEnabled = !typewriterEnabled;
      localStorage.setItem("md-reader-zen-typewriter", typewriterEnabled ? "1" : "0");
      refreshTypeBtn();
      quickToast(typewriterEnabled ? "⌨️ Typewriter auto-center ON" : "⌨️ Typewriter auto-center OFF");
      if (typewriterEnabled) updateActiveParagraph();
    });
    refreshTypeBtn();
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isZenMode) {
      setZenMode(false);
    }
  });

  // Zen's screen-only layout rules would clip print — exit automatically before printing
  window.addEventListener('beforeprint', () => {
    if (isZenMode) setZenMode(false);
  });

  // Auto-exit when the document closes (otherwise the dashboard has no navigation back)
  window.addEventListener('md-reader:doc-closed', () => {
    if (isZenMode) setZenMode(false);
  });

  if (readerContainer) {
    let scrollTimeout;
    readerContainer.addEventListener('scroll', () => {
      if (!isZenMode) return;
      if (scrollTimeout) cancelAnimationFrame(scrollTimeout);
      scrollTimeout = requestAnimationFrame(updateActiveParagraph);
    });
  }

  // Test/tuning hooks
  window.__zen = {
    set: setZenMode,
    update: updateActiveParagraph,
    isOn: () => isZenMode,
    typewrite: (v) => { typewriterEnabled = !!v; refreshTypeBtn(); }
  };
})();

/* ---------- ⛶ Full Screen Reading Mode ---------- */
/* ---------- ⛶ Full Screen Reading Mode ---------- */
(function initFullScreenMode() {
  const btn = el.fullScreenBtn;
  const controls = el.fullScreenControls;
  const zoomInBtn = el.fsZoomInBtn;
  const zoomOutBtn = el.fsZoomOutBtn;
  const zoomText = el.fsZoomLevelText;
  const exitBtn = el.fsExitBtn;
  const readPct = document.getElementById("fsReadPct");
  const autoBtn = document.getElementById("fsAutoBtn");
  if (!btn) return;

  const expandIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>`;
  const shrinkIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>`;

  let isPseudoMode = false;   // CSS fallback when the Fullscreen API is unavailable/denied
  let fadeTimer = null;
  let pinchStart = null;

  function apiSupported() {
    return !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
  }

  function isFullScreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
  }

  function isActive() {
    return isFullScreen() || isPseudoMode;
  }

  function enter() {
    if (!state.activeKey) {
      quickToast("⛶ Open a document first to enter Full Screen reading.");
      return;
    }
    if (apiSupported()) {
      const docEl = document.documentElement;
      const req = docEl.requestFullscreen ? docEl.requestFullscreen() : docEl.webkitRequestFullscreen();
      Promise.resolve(req).catch(() => enterPseudo());
    } else {
      enterPseudo();
    }
  }

  function enterPseudo() {
    isPseudoMode = true;
    updateFullScreenUI(true);
    quickToast("⛶ Simulated Full Screen (browser restriction) — every feature works the same.");
  }

  function exit() {
    if (isPseudoMode) {
      isPseudoMode = false;
      updateFullScreenUI(false);
      return;
    }
    if (isFullScreen()) {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      else if (document.mozCancelFullScreen) document.mozCancelFullScreen();
      else if (document.msExitFullscreen) document.msExitFullscreen();
    }
  }

  function toggle() {
    if (isActive()) exit();
    else enter();
  }

  function updateZoomText() {
    if (zoomText) zoomText.textContent = `${Math.round((state.fontScale || 1.0) * 100)}%`;
  }

  function updateReadChip() {
    if (!readPct || !state.activeKey) return;
    const pct = (typeof readingProgress === "object" && readingProgress.percent) ? readingProgress.percent(state.activeKey) : 0;
    readPct.textContent = pct > 0 ? `${pct}% read` : "";
  }

  /* ---- C: auto-fade controls (3s idle → translucent, hover/pointermove restores) ---- */
  function armIdleFade() {
    if (!controls) return;
    controls.classList.remove("fs-faded");
    clearTimeout(fadeTimer);
    fadeTimer = setTimeout(() => { if (isActive()) controls.classList.add("fs-faded"); }, 3000);
  }
  if (controls) {
    controls.addEventListener("pointerenter", () => { controls.classList.remove("fs-faded"); clearTimeout(fadeTimer); });
    controls.addEventListener("pointerleave", armIdleFade);
  }
  document.addEventListener("pointermove", (e) => {
    if (isActive() && controls && controls.style.display !== "none") armIdleFade();
  }, { passive: true });

  function updateFullScreenUI(force) {
    const full = typeof force === "boolean" ? force : isActive();
    if (full) {
      document.body.classList.add("is-fullscreen");
      btn.classList.add("active");
      btn.innerHTML = shrinkIcon;
      btn.title = "Exit Full Screen Mode (ESC)";
      if (controls) { show(controls, 'flex'); }
      updateZoomText();
      updateReadChip();
      armIdleFade();
    } else {
      document.body.classList.remove("is-fullscreen");
      btn.classList.remove("active");
      btn.innerHTML = expandIcon;
      btn.title = "Toggle Full Screen Mode";
      if (controls) hide(controls);
      clearTimeout(fadeTimer);
    }
  }

  btn.addEventListener("click", toggle);

  if (zoomInBtn) {
    zoomInBtn.addEventListener("click", () => {
      state.fontScale = Math.min(2.0, +(state.fontScale + 0.1).toFixed(2));
      applyFontScale();
      updateZoomText();
    });
  }

  if (zoomOutBtn) {
    zoomOutBtn.addEventListener("click", () => {
      state.fontScale = Math.max(0.7, +(state.fontScale - 0.1).toFixed(2));
      applyFontScale();
      updateZoomText();
    });
  }

  exitBtn.addEventListener("click", exit);

  /* ---- B: keyboard — Ctrl+Shift+F toggle; ESC exits pseudo mode (native ESC covers API mode) ---- */
  document.addEventListener("keydown", (e) => {
    if (e.key === "F" && e.ctrlKey && e.shiftKey) {
      e.preventDefault();
      toggle();
      return;
    }
    if (e.key === "Escape" && isPseudoMode) exit();
  });

  /* ---- E: pinch font-zoom while in fullscreen (touch devices) ---- */
  const readerEl = document.querySelector(".reader");
  if (readerEl) {
    readerEl.addEventListener("touchstart", (e) => {
      if (!isActive() || e.touches.length !== 2) return;
      pinchStart = {
        dist: Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY),
        scale: state.fontScale || 1
      };
    }, { passive: true });
    readerEl.addEventListener("touchmove", (e) => {
      if (!pinchStart || e.touches.length !== 2) return;
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      state.fontScale = Math.max(0.7, Math.min(2.0, +(pinchStart.scale * (d / pinchStart.dist)).toFixed(2)));
      applyFontScale();
      updateZoomText();
    }, { passive: true });
    readerEl.addEventListener("touchend", () => { pinchStart = null; });
  }

  /* ---- F: per-doc auto-fullscreen preference ---- */
  function getAutoList() {
    try { return JSON.parse(localStorage.getItem("md-reader-fs-auto") || "[]"); } catch (e) { return []; }
  }
  function isAuto(key) { return getAutoList().includes(key); }
  function refreshAutoBtn() {
    if (!autoBtn || !state.activeKey) return;
    const on = isAuto(state.activeKey);
    autoBtn.classList.toggle("active", on);
    autoBtn.setAttribute("aria-pressed", on ? "true" : "false");
    autoBtn.textContent = on ? "⏱ Auto ✓" : "⏱ Auto";
  }
  if (autoBtn) {
    autoBtn.addEventListener("click", () => {
      if (!state.activeKey) return;
      let list = getAutoList();
      if (isAuto(state.activeKey)) list = list.filter(k => k !== state.activeKey);
      else list.push(state.activeKey);
      localStorage.setItem("md-reader-fs-auto", JSON.stringify(list));
      refreshAutoBtn();
      quickToast(isAuto(state.activeKey) ? "⏱ Auto-fullscreen ON for this document" : "⏱ Auto-fullscreen OFF");
    });
  }

  // Update chip + auto button when scrolling in fullscreen
  window.addEventListener("md-reader:read-progress", () => {
    if (isActive()) updateReadChip();
  });

  // Called from openFile after content renders
  window.__fs = {
    toggle,
    enter,
    exit,
    isActive,
    isPseudo: () => isPseudoMode,
    refreshAuto: refreshAutoBtn,
    updateReadChip,
    isAutoDoc: isAuto
  };

  ["fullscreenchange", "webkitfullscreenchange", "mozfullscreenchange", "MSFullscreenChange"].forEach(evt => {
    document.addEventListener(evt, () => updateFullScreenUI());
  });
})();

