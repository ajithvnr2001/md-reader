/**
 * MD Reader — frontend logic
 */

/* ---------------- State ---------------- */
const state = {
  files: [], // Array of { key, size, uploaded }
  activeKey: localStorage.getItem("md-reader-active-key"),
  fontScale: 1,
  theme: localStorage.getItem("md-reader-theme") || "night",
  uploadFiles: [], // Files queued for upload
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

function saveAiCache() {
  localStorage.setItem("md-reader-ai-cache", JSON.stringify(state.aiCache));
  
  // Background remote save to sync across all devices
  fetch("/api/ai/cache", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(state.aiCache)
  }).catch((err) => console.error("Failed to sync AI cache remotely:", err));
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
  accentBtn: document.getElementById("accentBtn"),
  accentPopover: document.getElementById("accentPopover"),
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
  
  // Upload modal refs
  uploadToggleBtn: document.getElementById("uploadToggleBtn"),
  uploadModal: document.getElementById("uploadModal"),
  uploadModalClose: document.getElementById("uploadModalClose"),
  uploadFolderSelect: document.getElementById("uploadFolderSelect"),
  toggleNewFolder: document.getElementById("toggleNewFolder"),
  newFolderInputWrap: document.getElementById("newFolderInputWrap"),
  uploadFolderNew: document.getElementById("uploadFolderNew"),
  dropZone: document.getElementById("dropZone"),
  fileInput: document.getElementById("fileInput"),
  uploadQueue: document.getElementById("uploadQueue"),
  uploadSubmitBtn: document.getElementById("uploadSubmitBtn"),

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

  // Folder Delete refs
  deleteFolderModal: document.getElementById("deleteFolderModal"),
  deleteFolderModalClose: document.getElementById("deleteFolderModalClose"),
  deleteFolderNameText: document.getElementById("deleteFolderNameText"),
  deleteFolderCancelBtn: document.getElementById("deleteFolderCancelBtn"),
  deleteFolderSubmitBtn: document.getElementById("deleteFolderSubmitBtn"),
  cmDeleteFolderBtn: document.getElementById("cmDeleteFolderBtn"),

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

  // Create File refs
  createFileToggleBtn: document.getElementById("createFileToggleBtn"),
  createFileModal: document.getElementById("createFileModal"),
  createFileModalClose: document.getElementById("createFileModalClose"),
  createFileFolderSelect: document.getElementById("createFileFolderSelect"),
  createFileToggleNewFolder: document.getElementById("createFileToggleNewFolder"),
  createFileNewFolderInputWrap: document.getElementById("createFileNewFolderInputWrap"),
  createFileFolderNew: document.getElementById("createFileFolderNew"),
  createFileNameInput: document.getElementById("createFileNameInput"),
  createFileContentInput: document.getElementById("createFileContentInput"),
  createFileSubmitBtn: document.getElementById("createFileSubmitBtn"),

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
  accentBtn: document.getElementById("accentBtn"),
  accentPopover: document.getElementById("accentPopover"),
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
  
  fontSettingsBtn: document.getElementById("fontSettingsBtn"),
  fontSettingsPopover: document.getElementById("fontSettingsPopover"),
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
  
  // Highlight active swatch
  if (el.accentPopover) {
    el.accentPopover.querySelectorAll(".swatch").forEach(swatch => {
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

/* ---------------- Accent Color Theme ---------------- */

if (el.accentPopover) {
  document.body.appendChild(el.accentPopover);
  el.accentPopover.style.position = 'fixed';
  el.accentPopover.style.zIndex = '99999';
}

function positionAccentPopover() {
  if (!el.accentBtn || !el.accentPopover) return;
  const rect = el.accentBtn.getBoundingClientRect();
  let top = rect.bottom + 8;
  let right = window.innerWidth - rect.right;
  if (right < 8) right = 8;
  el.accentPopover.style.top = top + 'px';
  el.accentPopover.style.right = right + 'px';
  el.accentPopover.style.left = 'auto';
}

if (el.accentBtn && el.accentPopover) {
  el.accentBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const visible = el.accentPopover.style.display === "block";
    if (visible) {
      hide(el.accentPopover);
    } else {
      positionAccentPopover();
      show(el.accentPopover, 'block');
    }
  });

  el.accentBtn.addEventListener("touchend", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const visible = el.accentPopover.style.display === "block";
    if (visible) {
      hide(el.accentPopover);
    } else {
      positionAccentPopover();
      show(el.accentPopover, 'block');
    }
  });

  el.accentPopover.querySelectorAll(".swatch").forEach(swatch => {
    swatch.addEventListener("click", (e) => {
      e.stopPropagation();
      applyAccent(swatch.dataset.accent);
      hide(el.accentPopover);
    });
    swatch.addEventListener("touchend", (e) => {
      e.preventDefault();
      e.stopPropagation();
      applyAccent(swatch.dataset.accent);
      hide(el.accentPopover);
    });
  });

  document.addEventListener("click", (e) => {
    if (el.accentPopover && !el.accentPopover.contains(e.target) && !el.accentBtn.contains(e.target)) {
      hide(el.accentPopover);
    }
  });
  document.addEventListener("touchstart", (e) => {
    if (el.accentPopover && el.accentPopover.style.display === "block" &&
        !el.accentPopover.contains(e.target) && !el.accentBtn.contains(e.target)) {
      hide(el.accentPopover);
    }
  }, { passive: true });
}

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

// Move popover to body to prevent clipping
if (el.fontSettingsPopover) {
  document.body.appendChild(el.fontSettingsPopover);
  el.fontSettingsPopover.style.position = 'fixed';
  el.fontSettingsPopover.style.zIndex = '99999';
}

function positionFontSettingsPopover() {
  if (!el.fontSettingsBtn || !el.fontSettingsPopover) return;
  const rect = el.fontSettingsBtn.getBoundingClientRect();
  let top = rect.bottom + 8;
  let right = window.innerWidth - rect.right;
  if (right < 8) right = 8;
  el.fontSettingsPopover.style.top = top + 'px';
  el.fontSettingsPopover.style.right = right + 'px';
  el.fontSettingsPopover.style.left = 'auto';
}

if (el.fontSettingsBtn && el.fontSettingsPopover) {
  el.fontSettingsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const visible = el.fontSettingsPopover.style.display === "block";
    if (visible) {
      hide(el.fontSettingsPopover);
    } else {
      positionFontSettingsPopover();
      show(el.fontSettingsPopover, 'block');
    }
  });

  el.fontSettingsBtn.addEventListener("touchend", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const visible = el.fontSettingsPopover.style.display === "block";
    if (visible) {
      hide(el.fontSettingsPopover);
    } else {
      positionFontSettingsPopover();
      show(el.fontSettingsPopover, 'block');
    }
  });

  // Prevent closing popover when clicking inside it
  el.fontSettingsPopover.addEventListener("click", (e) => {
    e.stopPropagation();
  });
  el.fontSettingsPopover.addEventListener("touchstart", (e) => {
    e.stopPropagation();
  }, { passive: true });

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

  // Close popover when clicking outside
  document.addEventListener("click", (e) => {
    if (el.fontSettingsPopover && !el.fontSettingsPopover.contains(e.target) && !el.fontSettingsBtn.contains(e.target)) {
      hide(el.fontSettingsPopover);
    }
  });
  document.addEventListener("touchstart", (e) => {
    if (el.fontSettingsPopover && el.fontSettingsPopover.style.display === "block" &&
        !el.fontSettingsPopover.contains(e.target) && !el.fontSettingsBtn.contains(e.target)) {
      hide(el.fontSettingsPopover);
    }
  }, { passive: true });
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
    const res = await fetch("/api/rename", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ oldKey, newName })
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "Rename failed");
    
    // Update local state pins if renamed
    if (state.pinnedKeys.includes(oldKey)) {
      state.pinnedKeys = state.pinnedKeys.filter(k => k !== oldKey);
      state.pinnedKeys.push(data.newKey);
      localStorage.setItem("md-reader-pins", JSON.stringify(state.pinnedKeys));
    }
    
    // If active file was renamed, update activeKey
    if (state.activeKey === oldKey) state.activeKey = data.newKey;
    
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
    const res = await fetch("/api/move", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ oldKey, newFolder })
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "Move failed");
    
    // Update local state pins if moved
    if (state.pinnedKeys.includes(oldKey)) {
      state.pinnedKeys = state.pinnedKeys.filter(k => k !== oldKey);
      state.pinnedKeys.push(data.newKey);
      localStorage.setItem("md-reader-pins", JSON.stringify(state.pinnedKeys));
    }
    
    // If active file was moved, update activeKey
    if (state.activeKey === oldKey) {
      state.activeKey = data.newKey;
      localStorage.setItem("md-reader-active-key", data.newKey);
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
    const res = await fetch(`/api/file?key=${encodeURIComponent(key)}`, { method: "DELETE" });
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
    const res = await fetch(`/api/folder?prefix=${encodeURIComponent(prefix)}`, { method: "DELETE" });
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
    // Cleanup dangling pins
    const existingKeys = state.files.map(f => f.key);
    const validPins = state.pinnedKeys.filter(k => existingKeys.includes(k));
    if (validPins.length !== state.pinnedKeys.length) {
      state.pinnedKeys = validPins;
      localStorage.setItem("md-reader-pins", JSON.stringify(state.pinnedKeys));
    }
    renderFileTree(state.files);
  } catch (err) {
    el.fileList.innerHTML = `<div class="file-list-empty">⚠️ Failed to load: ${err.message}</div>`;
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

    const dragOverHandlers = `ondragover="event.preventDefault(); this.classList.add('drag-over');" ondragenter="event.preventDefault(); this.classList.add('drag-over');" ondragleave="this.classList.remove('drag-over');" ondrop="handleFileDrop(event, '${fullPath}')"`;

    html += `
      <div class="folder-section">
        <div class="folder-header ${collapsedClass}" data-path="${fullPath}" ${dragOverHandlers} onclick="this.classList.toggle('collapsed'); this.nextElementSibling.classList.toggle('collapsed')">
          <svg class="folder-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
          ${fName}
          <span class="folder-count">${count}</span>
          <button class="tree-download-btn" title="Download Folder (.zip)" onclick="event.stopPropagation(); downloadFolder('${fullPath}')">
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
    const draggableAttr = state.synthesisMode ? "" : `draggable="true" ondragstart="handleFileDragStart(event, '${f.key}')"`;
    
    let checkboxHtml = "";
    if (state.synthesisMode) {
      const checked = state.selectedKeys.has(f.key) ? "checked" : "";
      checkboxHtml = `<input type="checkbox" class="file-select-checkbox" data-key="${f.key}" ${checked} onclick="event.stopPropagation(); handleCheckboxToggle(this, '${f.key}')" style="margin-right:8px; cursor:pointer" />`;
    }
    
    html += `
      <div class="file-item ${isActive}" data-key="${f.key}" ${draggableAttr}>
        ${checkboxHtml}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
        ${f.name.replace(/\.md$/i, '')}
        <button class="tree-download-btn" title="Download File" onclick="event.stopPropagation(); downloadFile('${f.key}')">
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
        const name = f.key.split('/').pop().replace(/\.md$/i, '');
        finalHtml += `
          <div class="file-item ${isActive}" data-key="${f.key}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
            ${name}
            <button class="tree-download-btn" title="Download File" onclick="event.stopPropagation(); downloadFile('${f.key}')">
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
  
  // Hide active doc search bar
  hide(el.searchDocContainer);
  show(el.searchDocToggleBtn, 'flex');
  el.searchDocInput.value = "";
  originalContentHtml = ""; // Reset cached original HTML
  
  // Update active file class dynamically in the DOM
  el.fileList.querySelectorAll(".file-item").forEach((item) => {
    const itemKey = item.dataset.key;
    if (itemKey === state.activeKey || (state.isSplitMode && itemKey === state.secondaryKey)) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });

  const targetContent = isSecondary ? el.contentSecondary : el.content;
  const targetStatsBar = isSecondary ? el.readingStatsBarSecondary : el.readingStatsBar;

  hide(el.emptyState);
  show(targetContent);
  
  targetContent.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted)">
    <div class="loading-dots" style="display:flex;gap:4px;justify-content:center;margin-bottom:12px">
      <span></span><span></span><span></span>
    </div>
    Loading…
  </div>`;

  try {
    const res = await fetch(`/api/file?key=${encodeURIComponent(key)}`, { cache: "no-store" });
    if (!res.ok) throw new Error("File not found");
    const mdText = await res.text();
    targetContent.innerHTML = marked.parse(mdText);
    
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
    
    if (isSecondary) {
      updateReadingStatsSecondary(mdText);
    } else {
      updateReadingStats(mdText);
      buildTOC();
      highlights.restoreHighlights();
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
    
    document.querySelector(".reader").scrollTop = 0;
  } catch (err) {
    targetContent.innerHTML = `<p style="color:var(--error)">⚠️ Could not load file: ${err.message}</p>`;
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
        <strong>Error:</strong> ${data.error}
      </div>`;
      return;
    }
    onSuccess(data);
  } catch (err) {
    hide(el.aiSpinner);
    el.aiPanelContent.innerHTML = `<div style="padding:16px;background:rgba(248,81,73,0.08);border:1px solid var(--error);border-radius:var(--radius);color:var(--error)">
      <strong>Network error:</strong> ${err.message}
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
    let html = marked.parse(data.summary || "No summary returned.");
    if (data.keyConcepts && data.keyConcepts.length > 0) {
      html += `
        <div class="chat-extra" style="margin-top:20px">
          <div class="chat-extra-title">Key Concepts</div>
          <div class="chat-concepts">
            ${data.keyConcepts.map(c => `<span class="concept-badge">${c}</span>`).join("")}
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
        <div class="chat-bubble">${isUser ? text : marked.parse(text)}</div>
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
          ${suggestedQuestions.map(q => `<button class="suggestion-btn" onclick="sendChatPrompt('${q.replace(/'/g, "\\'")}')">${q}</button>`).join("")}
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
        <strong>Retry Error:</strong> ${data.error}
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
      <strong>Network error:</strong> ${e.message}
    </div>`;
  }
}
window.retryChatResponse = retryChatResponse;

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
    } else {
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
        <strong>Error:</strong> ${data.error}
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
      <strong>Network error:</strong> ${e.message}
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
        <p><strong>Q${qi + 1}.</strong> ${q.question}</p>
        <ul class="quiz-options">
          ${q.options
            .map((opt, oi) => `<li data-oi="${oi}">${opt}</li>`)
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
  const idx = cache.flashcardIndex || 0;
  const card = cards[idx];
  
  el.aiPanelContent.innerHTML = `
    <div class="flashcards-container">
      <div class="flashcard-wrapper" onclick="this.querySelector('.flashcard').classList.toggle('flipped')">
        <div class="flashcard">
          <div class="flashcard-front">
            <div class="flashcard-badge">Question / Term</div>
            <div class="flashcard-text">${card.question}</div>
          </div>
          <div class="flashcard-back">
            <div class="flashcard-badge">Answer / Definition</div>
            <div class="flashcard-text">${card.answer}</div>
          </div>
        </div>
      </div>
      
      <div class="flashcard-feedback-actions">
        <button class="feedback-btn easy" onclick="rateFlashcard('easy')">Easy</button>
        <button class="feedback-btn medium" onclick="rateFlashcard('medium')">Medium</button>
        <button class="feedback-btn hard" onclick="rateFlashcard('hard')">Hard</button>
      </div>
      
      <div class="flashcard-controls">
        <button class="flashcard-nav-btn" onclick="prevFlashcard()">&larr; Prev</button>
        <span class="flashcard-progress">Card ${idx + 1} of ${cards.length}</span>
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
  console.log(`Card rated: ${rating}`);
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

/* ---------------- Create File logic ---------------- */
el.createFileToggleBtn.addEventListener("click", () => {
  show(el.createFileModal, 'flex');
  
  // Populate dropdown with existing folders
  const folders = getExistingFolders();
  el.createFileFolderSelect.innerHTML = `<option value="">(Root Directory)</option>` + 
    folders.map(f => `<option value="${f}">${f}</option>`).join("");
    
  // Reset fields
  el.createFileToggleNewFolder.checked = false;
  hide(el.createFileNewFolderInputWrap);
  el.createFileFolderNew.value = "";
  el.createFileFolderSelect.disabled = false;
  el.createFileNameInput.value = "";
  el.createFileContentInput.value = "";
});

el.createFileToggleNewFolder.addEventListener("change", () => {
  if (el.createFileToggleNewFolder.checked) {
    show(el.createFileNewFolderInputWrap);
    el.createFileFolderSelect.disabled = true;
  } else {
    hide(el.createFileNewFolderInputWrap);
    el.createFileFolderSelect.disabled = false;
  }
});

el.createFileModalClose.addEventListener("click", () => {
  hide(el.createFileModal);
});

el.createFileSubmitBtn.addEventListener("click", async () => {
  let fileName = el.createFileNameInput.value.trim();
  if (!fileName) {
    alert("Please enter a file name.");
    return;
  }
  
  // Ensure extension is .md
  if (!fileName.toLowerCase().endsWith(".md")) {
    fileName += ".md";
  }
  
  const folder = el.createFileToggleNewFolder.checked
    ? el.createFileFolderNew.value.trim().replace(/^\/+|\/+$/g, '')
    : el.createFileFolderSelect.value;
  const prefix = folder ? `${folder}/` : '';
  const key = `${prefix}${fileName}`;
  
  // Check if file already exists
  if (state.files.some(f => f.key.toLowerCase() === key.toLowerCase())) {
    if (!confirm("A file with this name already exists. Do you want to overwrite it?")) {
      return;
    }
  }
  
  el.createFileSubmitBtn.disabled = true;
  el.createFileSubmitBtn.textContent = "Creating...";
  
  try {
    const content = el.createFileContentInput.value;
    const res = await fetch(`/api/upload?key=${encodeURIComponent(key)}`, {
      method: "PUT",
      body: content
    });
    
    if (!res.ok) throw new Error("Failed to create file.");
    
    hide(el.createFileModal);
    await loadFileList();
    await openFile(key);
  } catch (err) {
    alert("Error creating file: " + err.message);
  } finally {
    el.createFileSubmitBtn.disabled = false;
    el.createFileSubmitBtn.textContent = "Create File";
  }
});

/* ---------------- Upload logic ---------------- */
function getExistingFolders() {
  const folders = new Set();
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

el.uploadToggleBtn.addEventListener("click", () => {
  show(el.uploadModal, 'flex');
  state.uploadFiles = [];
  renderUploadQueue();
  
  // Populate dropdown with existing folders
  const folders = getExistingFolders();
  el.uploadFolderSelect.innerHTML = `<option value="">(Root Directory)</option>` + 
    folders.map(f => `<option value="${f}">${f}</option>`).join("");
    
  // Reset checkbox and input states
  el.toggleNewFolder.checked = false;
  hide(el.newFolderInputWrap);
  el.uploadFolderNew.value = "";
  el.uploadFolderSelect.disabled = false;
});

el.toggleNewFolder.addEventListener("change", () => {
  if (el.toggleNewFolder.checked) {
    show(el.newFolderInputWrap);
    el.uploadFolderSelect.disabled = true;
  } else {
    hide(el.newFolderInputWrap);
    el.uploadFolderSelect.disabled = false;
  }
});

el.uploadModalClose.addEventListener("click", () => {
  hide(el.uploadModal);
});

// Drag and drop handling
el.dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  el.dropZone.classList.add("drag-over");
});
el.dropZone.addEventListener("dragleave", () => {
  el.dropZone.classList.remove("drag-over");
});
el.dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  el.dropZone.classList.remove("drag-over");
  addFilesToQueue(e.dataTransfer.files);
});
el.fileInput.addEventListener("change", (e) => {
  addFilesToQueue(e.target.files);
  el.fileInput.value = ""; // reset
});

function addFilesToQueue(fileList) {
  for (const file of fileList) {
    if (file.name.endsWith('.md') || file.name.endsWith('.txt') || file.name.endsWith('.markdown')) {
      state.uploadFiles.push({ file, id: Math.random().toString(36).substr(2, 9), status: 'pending' });
    }
  }
  renderUploadQueue();
}

function removeFileFromQueue(id) {
  state.uploadFiles = state.uploadFiles.filter(f => f.id !== id);
  renderUploadQueue();
}

function renderUploadQueue() {
  el.uploadQueue.innerHTML = state.uploadFiles.map(f => {
    let statusIcon = `<button class="remove-file" onclick="removeFileFromQueue('${f.id}')">×</button>`;
    if (f.status === 'uploading') statusIcon = `<span style="color:var(--accent)">⏳</span>`;
    if (f.status === 'done') statusIcon = `<span style="color:var(--success)">✓</span>`;
    if (f.status === 'error') statusIcon = `<span style="color:var(--error)">!</span>`;
    
    return `
      <div class="upload-queue-item ${f.status}" id="up-${f.id}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
        <div class="file-name">${f.file.name}</div>
        <div class="file-size">${(f.file.size / 1024).toFixed(1)} KB</div>
        ${statusIcon}
      </div>
    `;
  }).join("");
  
  el.uploadSubmitBtn.disabled = state.uploadFiles.length === 0 || state.uploadFiles.every(f => f.status !== 'pending');
}

// Make remove function global for the inline onclick
window.removeFileFromQueue = removeFileFromQueue;

el.uploadSubmitBtn.addEventListener("click", async () => {
  const folder = el.toggleNewFolder.checked
    ? el.uploadFolderNew.value.trim().replace(/^\/+|\/+$/g, '')
    : el.uploadFolderSelect.value;
  const prefix = folder ? `${folder}/` : '';
  
  el.uploadSubmitBtn.disabled = true;
  
  let successCount = 0;
  for (const item of state.uploadFiles) {
    if (item.status !== 'pending') continue;
    
    item.status = 'uploading';
    renderUploadQueue();
    
    try {
      const key = `${prefix}${item.file.name}`;
      // In a real app we'd need auth headers if REQUIRE_AUTH=true, but we default to false.
      const res = await fetch(`/api/upload?key=${encodeURIComponent(key)}`, {
        method: "PUT",
        body: item.file
      });
      if (!res.ok) throw new Error("Upload failed");
      item.status = 'done';
      successCount++;
    } catch (err) {
      item.status = 'error';
    }
    renderUploadQueue();
  }
  
  if (successCount > 0) {
    // Refresh the list immediately after upload
    await loadFileList();
    setTimeout(() => {
      hide(el.uploadModal);
    }, 1500);
  } else {
    el.uploadSubmitBtn.disabled = false;
  }
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
  try {
    const res = await fetch(`/api/file?key=${encodeURIComponent(key)}`);
    if (!res.ok) throw new Error("File not found");
    return await res.text();
  } catch (err) {
    console.error("Error fetching raw markdown:", err);
    return "";
  }
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
    // Hide content rendering & toolbars
    hide(el.content);
    hide(el.aiToolbar);
    hide(el.searchDocToggleBtn);
    hide(el.searchDocContainer);
    
    // Stop TTS if speaking
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      el.readAloudBtn.classList.remove("active");
    }
    
    // Show editor
    show(el.editorContainer, 'flex');
    el.editBtn.classList.add("active");
    el.saveStatus.textContent = "Loading raw text...";
    el.editorTextarea.disabled = true;
    
    const rawMd = await fetchRawMarkdown(state.activeKey);
    el.editorTextarea.value = rawMd;
    el.editorTextarea.disabled = false;
    el.saveStatus.textContent = "Ready to edit";
    el.editorTextarea.focus();
  } else {
    // Save current editor text to R2 on Done click just to be safe
    await saveDocumentContent(false);
    
    // Show content rendering & toolbars
    hide(el.editorContainer);
    el.editBtn.classList.remove("active");
    show(el.content);
    show(el.aiToolbar, 'flex');
    show(el.searchDocToggleBtn, 'flex');
    
    // Re-render markdown & stats & TOC
    const text = el.editorTextarea.value;
    el.content.innerHTML = marked.parse(text);
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
  }
}

async function saveDocumentContent(isAutoSave = false) {
  if (!state.activeKey) return;
  el.saveStatus.textContent = isAutoSave ? "Auto-saving..." : "Saving...";
  
  try {
    const content = el.editorTextarea.value;
    const res = await fetch(`/api/upload?key=${encodeURIComponent(state.activeKey)}`, {
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
  window.print();
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
window.handleFileDragStart = function(e, key) {
  e.dataTransfer.setData("text/plain", key);
  e.dataTransfer.effectAllowed = "move";
};

window.handleFileDrop = async function(e, targetFolder) {
  e.preventDefault();
  e.stopPropagation();
  
  // Remove hover states
  document.querySelectorAll(".folder-header").forEach(h => h.classList.remove("drag-over"));
  
  const oldKey = e.dataTransfer.getData("text/plain");
  if (!oldKey) return;
  
  try {
    const res = await fetch("/api/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldKey, newFolder: targetFolder })
    });
    if (!res.ok) throw new Error("Failed to move file.");
    
    const data = await res.json();
    await loadFileList();
    
    if (state.activeKey === oldKey) {
      state.activeKey = data.newKey;
      localStorage.setItem("md-reader-active-key", data.newKey);
      await openFile(data.newKey);
    }
  } catch (err) {
    alert("Error moving file: " + err.message);
  }
};

el.fileList.addEventListener("dragover", (e) => {
  e.preventDefault();
});

el.fileList.addEventListener("drop", async (e) => {
  if (e.target.closest(".folder-header")) return;
  
  e.preventDefault();
  const oldKey = e.dataTransfer.getData("text/plain");
  if (!oldKey) return;
  
  try {
    const res = await fetch("/api/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldKey, newFolder: "" })
    });
    if (!res.ok) throw new Error("Failed to move file to root.");
    
    const data = await res.json();
    await loadFileList();
    
    if (state.activeKey === oldKey) {
      state.activeKey = data.newKey;
      localStorage.setItem("md-reader-active-key", data.newKey);
      await openFile(data.newKey);
    }
  } catch (err) {
    alert("Error moving file to root: " + err.message);
  }
});

/* ---------------- Mind Map Logic ---------------- */
let currentMindMapZoom = 1.0;
let isMindMapDragging = false;
let mindMapStartX = 0, mindMapStartY = 0;
let mindMapScrollLeft = 0, mindMapScrollTop = 0;

function setMindMapZoom(zoom) {
  currentMindMapZoom = Math.max(0.3, Math.min(3.0, zoom));
  if (el.mindMapZoomLevel) {
    el.mindMapZoomLevel.textContent = `${Math.round(currentMindMapZoom * 100)}%`;
  }
  const svg = el.mindMapContainer.querySelector('svg');
  if (svg) {
    svg.style.transition = 'transform 0.2s ease-out';
    svg.style.transform = `scale(${currentMindMapZoom})`;
    svg.style.transformOrigin = 'center center';
  }
}

function initMindMapControls() {
  if (el.mindMapZoomIn) {
    el.mindMapZoomIn.addEventListener('click', () => setMindMapZoom(currentMindMapZoom + 0.2));
  }
  if (el.mindMapZoomOut) {
    el.mindMapZoomOut.addEventListener('click', () => setMindMapZoom(currentMindMapZoom - 0.2));
  }
  if (el.mindMapZoomReset) {
    el.mindMapZoomReset.addEventListener('click', () => setMindMapZoom(1.0));
  }

  // Mouse wheel zoom inside container
  if (el.mindMapContainer) {
    el.mindMapContainer.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.15 : -0.15;
      setMindMapZoom(currentMindMapZoom + delta);
    }, { passive: false });

    // Drag to Pan container
    el.mindMapContainer.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      isMindMapDragging = true;
      el.mindMapContainer.style.cursor = 'grabbing';
      mindMapStartX = e.pageX - el.mindMapContainer.offsetLeft;
      mindMapStartY = e.pageY - el.mindMapContainer.offsetTop;
      mindMapScrollLeft = el.mindMapContainer.scrollLeft;
      mindMapScrollTop = el.mindMapContainer.scrollTop;
    });

    el.mindMapContainer.addEventListener('mouseleave', () => {
      isMindMapDragging = false;
      el.mindMapContainer.style.cursor = 'grab';
    });

    el.mindMapContainer.addEventListener('mouseup', () => {
      isMindMapDragging = false;
      el.mindMapContainer.style.cursor = 'grab';
    });

    el.mindMapContainer.addEventListener('mousemove', (e) => {
      if (!isMindMapDragging) return;
      e.preventDefault();
      const x = e.pageX - el.mindMapContainer.offsetLeft;
      const y = e.pageY - el.mindMapContainer.offsetTop;
      const walkX = (x - mindMapStartX) * 1.5;
      const walkY = (y - mindMapStartY) * 1.5;
      el.mindMapContainer.scrollLeft = mindMapScrollLeft - walkX;
      el.mindMapContainer.scrollTop = mindMapScrollTop - walkY;
    });
  }

  // Download SVG Export
  if (el.mindMapExportSvg) {
    el.mindMapExportSvg.addEventListener('click', () => {
      const svg = el.mindMapContainer.querySelector('svg');
      if (!svg) {
        alert("No SVG diagram available to export.");
        return;
      }

      const cloneSvg = svg.cloneNode(true);
      cloneSvg.style.transform = 'none'; // reset scale transform for export
      cloneSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

      const serializer = new XMLSerializer();
      let svgString = serializer.serializeToString(cloneSvg);

      // Add XML declaration
      if (!svgString.match(/^<\?xml/)) {
        svgString = '<?xml version="1.0" standalone="no"?>\n' + svgString;
      }

      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const docTitle = (state.activeKey || 'document').replace(/[^a-zA-Z0-9_\.-]/g, '_');
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `mind-map-${docTitle}.svg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    });
  }
}

initMindMapControls();

el.mindMapModalClose.addEventListener("click", () => {
  hide(el.mindMapModal);
});

el.mindMapBtn.addEventListener("click", async () => {
  if (!state.activeKey) return;
  show(el.mindMapModal, 'flex');
  show(el.mindMapSpinner);
  el.mindMapContainer.innerHTML = "";
  setMindMapZoom(1.0);
  
  const key = state.activeKey;
  
  // Try local memory cache
  if (state.aiCache[key] && state.aiCache[key].mindmap) {
    renderMermaidMap(state.aiCache[key].mindmap);
    return;
  }
  
  try {
    const res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key,
        messages: [{
          role: "user",
          parts: [{
            text: "Create a visual concept map of the main topics and relationships in this document using Mermaid.js syntax. You MUST start with a valid Mermaid diagram tag (e.g. 'graph TD' or 'mindmap'). Return ONLY the Mermaid code block starting with ```mermaid and ending with ```. Do not include any other explanations or conversations."
          }]
        }]
      })
    });
    
    if (!res.ok) throw new Error("API call failed");
    const data = await res.json();
    
    const match = data.reply.match(/```mermaid([\s\S]*?)```/);
    const mermaidCode = match ? match[1].trim() : data.reply.trim();
    
    if (!state.aiCache[key]) state.aiCache[key] = {};
    state.aiCache[key].mindmap = mermaidCode;
    saveAiCache();
    
    renderMermaidMap(mermaidCode);
  } catch (err) {
    el.mindMapContainer.innerHTML = `<div style="color:var(--error);text-align:center;padding:20px">⚠️ Failed to generate mind map: ${err.message}</div>`;
    hide(el.mindMapSpinner);
  }
});

function renderMermaidMap(code) {
  try {
    if (window.mermaid) {
      mermaid.render("mermaid-graph-svg-" + Date.now(), code).then(({ svg }) => {
        el.mindMapContainer.innerHTML = svg;
        el.mindMapContainer.style.cursor = 'grab';
        setMindMapZoom(1.0);
        hide(el.mindMapSpinner);
      }).catch(err => {
        showMermaidFallback(code, err.message);
      });
    } else {
      throw new Error("Mermaid library not loaded.");
    }
  } catch (err) {
    showMermaidFallback(code, err.message);
  }
}

function showMermaidFallback(code, errMsg) {
  el.mindMapContainer.innerHTML = `
    <div style="width:100%;text-align:center;padding:20px;color:var(--text-dim)">
      <p style="color:var(--error);margin-bottom:12px">⚠️ Diagram rendering error: ${errMsg}</p>
      <p>Raw Mermaid layout code:</p>
      <pre style="text-align:left;background:var(--bg-elevated);border:1px solid var(--border);border-radius:var(--radius);padding:16px;max-width:600px;margin:12px auto;overflow:auto;font-family:var(--font-mono);font-size:0.82rem;line-height:1.5">${code}</pre>
    </div>
  `;
  hide(el.mindMapSpinner);
}

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
    el.aiPanelContent.innerHTML = `<p style="color:var(--error)">⚠️ Synthesis failed: ${err.message}</p>`;
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
    el.aiPanelContent.innerHTML = `<p style="color:var(--error)">⚠️ Workspace Search failed: ${err.message}</p>`;
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
          <div class="cheatsheet-card-title" style="font-size:1.1rem; color:var(--text)">📌 ${title}</div>
          <div style="font-size:0.8rem; color:var(--text-dim)">Document: ${state.activeKey} • Compact 1-Page Exam Cheat Sheet</div>
        </div>
      `;
      
      if (keyDefs.length > 0) {
        html += `
          <div class="cheatsheet-card">
            <div class="cheatsheet-card-title">📖 Core Definitions & Concepts</div>
            ${keyDefs.map(item => `
              <div class="cheatsheet-item">
                <span class="cheatsheet-term">• ${item.term}:</span>
                <span class="cheatsheet-def"> ${item.definition}</span>
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
                <div class="cheatsheet-term">${item.concept}</div>
                <div class="cheatsheet-code">${item.codeOrFormula}</div>
                <div class="cheatsheet-def" style="margin-top:2px">${item.explanation}</div>
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
                <span class="cheatsheet-def">${rule}</span>
              </div>
            `).join('')}
          </div>
        `;
      }
      
      el.cheatSheetContent.innerHTML = html;
      show(el.cheatSheetContent, 'grid');
    } catch (err) {
      hide(el.cheatSheetSpinner);
      el.cheatSheetContent.innerHTML = `<p style="color:var(--error); padding:20px; text-align:center">⚠️ Failed to generate Cheat Sheet: ${err.message}</p>`;
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
    window.print();
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
   2. AI AUTO-GLOSSARY & HOVER TOOLTIPS
   ================================================================ */
const autoGlossary = {
  terms: [],

  init() {
    if (el.autoGlossaryBtn) {
      el.autoGlossaryBtn.addEventListener('click', () => {
        this.fetchAndApply();
      });
    }
  },

  async fetchAndApply() {
    if (!state.activeKey) return;
    const key = state.activeKey;

    // Check local memory cache first
    if (state.aiCache[key] && state.aiCache[key].glossary && state.aiCache[key].glossary.length) {
      this.terms = state.aiCache[key].glossary;
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
        body: JSON.stringify({ key, model: state.selectedModel })
      });
      
      hide(el.aiSpinner);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      this.terms = data.terms || [];
      
      if (this.terms.length > 0) {
        if (!state.aiCache[key]) state.aiCache[key] = {};
        state.aiCache[key].glossary = this.terms;
        saveAiCache();

        this.applyToDOM();
        this.renderGlossaryPanel();
        gamification.awardXp(15, 'glossary');
      } else {
        el.aiPanelContent.innerHTML = `<div style="padding:16px; color:var(--text-dim)">No specialized jargon or terms detected in this document.</div>`;
      }
    } catch(err) {
      hide(el.aiSpinner);
      alert(`Auto-Glossary error: ${err.message}`);
    } finally {
      btn.innerHTML = originalText;
    }
  },

  renderGlossaryPanel() {
    if (!this.terms.length) return;
    openAiPanel("🔍 Auto-Glossary Vocabulary", false, 'glossary');

    let rowsHtml = this.terms.map(t => `
      <div style="padding:12px; border:1px solid var(--border); border-radius:var(--radius); background:var(--bg-card); margin-bottom:8px; transition:all 0.2s">
        <div style="font-weight:700; color:var(--accent); font-size:0.92rem; margin-bottom:4px; display:flex; align-items:center; justify-content:space-between">
          <span>🔍 ${t.term}</span>
        </div>
        <div style="font-size:0.85rem; color:var(--text); line-height:1.5">
          ${t.definition}
        </div>
      </div>
    `).join('');

    el.aiPanelContent.innerHTML = `
      <div style="padding:16px">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; padding-bottom:10px; border-bottom:1px solid var(--border)">
          <span style="font-size:0.82rem; font-weight:700; color:var(--accent); text-transform:uppercase; letter-spacing:0.05em">
            🔍 Extracted Jargon (${this.terms.length} Terms)
          </span>
          <span style="font-size:0.75rem; color:var(--text-dim)">
            Hover/Tap terms in reader to view tooltips
          </span>
        </div>
        <div>
          ${rowsHtml}
        </div>
      </div>
    `;
  },

  applyToDOM() {
    if (!this.terms.length || !el.content) return;
    
    // Remove previous glossary spans to prevent duplication
    const oldSpans = el.content.querySelectorAll('.glossary-term');
    oldSpans.forEach(span => {
      const parent = span.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(span.textContent), span);
        parent.normalize();
      }
    });

    // Safe Text Node replacement using TreeWalker
    this.terms.forEach(item => {
      const regex = new RegExp(`\\b(${item.term})\\b`, 'i');
      const walker = document.createTreeWalker(el.content, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_SKIP;
          const parentTag = node.parentElement ? node.parentElement.tagName.toLowerCase() : '';
          if (['script', 'style', 'code', 'pre', 'a'].includes(parentTag)) return NodeFilter.FILTER_SKIP;
          if (node.parentElement && node.parentElement.classList.contains('glossary-term')) return NodeFilter.FILTER_SKIP;
          return regex.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        }
      });

      const nodesToReplace = [];
      while (walker.nextNode()) {
        nodesToReplace.push(walker.currentNode);
      }

      nodesToReplace.forEach(node => {
        const match = regex.exec(node.nodeValue);
        if (!match) return;

        const before = node.nodeValue.substring(0, match.index);
        const matchedText = match[0];
        const after = node.nodeValue.substring(match.index + matchedText.length);

        const span = document.createElement('span');
        span.className = 'glossary-term';
        span.dataset.def = item.definition;
        span.textContent = matchedText;

        const frag = document.createDocumentFragment();
        if (before) frag.appendChild(document.createTextNode(before));
        frag.appendChild(span);
        if (after) frag.appendChild(document.createTextNode(after));

        if (node.parentNode) {
          node.parentNode.replaceChild(frag, node);
        }
      });
    });

    // Attach tooltip events
    el.content.querySelectorAll('.glossary-term').forEach(elem => {
      const showTooltip = (e) => {
        let tooltip = document.getElementById('activeGlossaryTooltip');
        if (!tooltip) {
          tooltip = document.createElement('div');
          tooltip.id = 'activeGlossaryTooltip';
          tooltip.className = 'glossary-tooltip';
          document.body.appendChild(tooltip);
        }

        const term = elem.textContent;
        const def = elem.dataset.def;
        tooltip.innerHTML = `<div class="glossary-tooltip-term">${term}</div><div>${def}</div>`;
        
        const rect = elem.getBoundingClientRect();
        tooltip.style.left = Math.max(10, Math.min(window.innerWidth - 300, rect.left)) + 'px';
        tooltip.style.top = (rect.bottom + window.scrollY + 6) + 'px';
        tooltip.style.display = 'block';
      };

      const hideTooltip = () => {
        const tooltip = document.getElementById('activeGlossaryTooltip');
        if (tooltip) tooltip.style.display = 'none';
      };

      elem.addEventListener('mouseenter', showTooltip);
      elem.addEventListener('mouseleave', hideTooltip);
      elem.addEventListener('touchstart', (e) => {
        showTooltip(e);
        setTimeout(hideTooltip, 3500);
      });
    });
  }
};

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
          <strong>Translation Failed:</strong> ${err.message}
        </div>
      `;
    }
  },

  renderTranslationResult(data) {
    let termsTableHtml = '';
    if (data.keyTerms && data.keyTerms.length) {
      const rows = data.keyTerms.map(t => `
        <tr style="border-bottom:1px solid var(--border)">
          <td style="padding:8px 10px; font-weight:600; color:var(--accent); font-size:0.85rem">${t.originalTerm}</td>
          <td style="padding:8px 10px; font-weight:600; font-size:0.85rem">${t.translatedTerm}</td>
          <td style="padding:8px 10px; font-size:0.8rem; color:var(--text-dim)">${t.contextNote}</td>
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
    const htmlContent = marked.parse(translatedMarkdown);

    el.aiPanelContent.innerHTML = `
      <div style="padding:16px">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; padding-bottom:10px; border-bottom:1px solid var(--border); flex-wrap:wrap; gap:8px">
          <span style="font-size:0.82rem; font-weight:700; color:var(--accent); text-transform:uppercase; letter-spacing:0.05em">
            🌐 Full ${data.targetLanguage} Translation
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

        <h2 style="margin:0 0 12px; font-size:1.2rem">${data.translatedTitle || "Translated Document"}</h2>
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
          <strong>Podcast Generation Error:</strong> ${err.message}
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
              ${item.speaker}
            </div>
            <div style="font-size:0.9rem; line-height:1.5; color:var(--text)">
              ${item.text}
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
            📻 NotebookLM 2-Host Episode • ${data.language}
          </div>
          <h2 style="margin:4px 0 0; font-size:1.25rem">${data.podcastTitle || "Study Podcast Episode"}</h2>
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

      mark.addEventListener('click', (e) => {
        e.stopPropagation();
        this._activeHighlightId = id;
        this.showToolbarAtElement(mark);
      });
    } catch(e) {
      // surroundContents fails if selection crosses element boundaries
      // Fall back to extracting and wrapping inline
      const fragment = range.extractContents();
      const mark = document.createElement('mark');
      mark.setAttribute('data-hl-id', id);
      mark.setAttribute('data-hl-color', color);
      mark.appendChild(fragment);
      range.insertNode(mark);

      mark.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this._activeHighlightId = id;
        this.showToolbarAtElement(mark);
      });
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
      this.addMessageToThread(id, 'ai', `⚠️ AI Error: ${err.message}`);
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
          <div class="margin-thread-text">${m.sender === 'ai' ? marked.parse(m.text) : m.text}</div>
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
  aiTranslator.init();
  aiPodcast.init();
  topicFocus.init();
  splitScreen.init();

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
  if (savedActiveKey && state.files.some((f) => f.key === savedActiveKey)) {
    openFile(savedActiveKey);
  }
}

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
  const readerContainer = document.querySelector('.reader');
  const content = document.getElementById('content');
  const exitBtn = el.exitZenBtn;
  const toggleBtn = el.zenModeBtn;

  function updateActiveParagraph() {
    if (!isZenMode || !content) return;
    const children = Array.from(content.children);
    if (!children.length) return;

    const targetCenter = window.innerHeight * 0.38;
    let closestEl = null;
    let minDistance = Infinity;

    children.forEach((child) => {
      const rect = child.getBoundingClientRect();
      const childCenter = rect.top + rect.height / 2;
      const dist = Math.abs(childCenter - targetCenter);
      if (dist < minDistance) {
        minDistance = dist;
        closestEl = child;
      }
    });

    children.forEach((child) => {
      if (child === closestEl) {
        child.classList.add('zen-active-paragraph');
      } else {
        child.classList.remove('zen-active-paragraph');
      }
    });
  }

  function setZenMode(enable) {
    isZenMode = enable;
    if (isZenMode) {
      document.body.classList.add('zen-mode');
      if (exitBtn) exitBtn.style.display = 'flex';
      updateActiveParagraph();
    } else {
      document.body.classList.remove('zen-mode');
      if (exitBtn) exitBtn.style.display = 'none';
      if (content) {
        Array.from(content.children).forEach(child => child.classList.remove('zen-active-paragraph'));
      }
    }
  }

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => setZenMode(!isZenMode));
  }

  if (exitBtn) {
    exitBtn.addEventListener('click', () => setZenMode(false));
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isZenMode) {
      setZenMode(false);
    }
  });

  if (readerContainer) {
    let scrollTimeout;
    readerContainer.addEventListener('scroll', () => {
      if (!isZenMode) return;
      if (scrollTimeout) cancelAnimationFrame(scrollTimeout);
      scrollTimeout = requestAnimationFrame(updateActiveParagraph);
    });
  }
})();

/* ---------- ⛶ Full Screen Reading Mode ---------- */
(function initFullScreenMode() {
  const btn = el.fullScreenBtn;
  const controls = el.fullScreenControls;
  const zoomInBtn = el.fsZoomInBtn;
  const zoomOutBtn = el.fsZoomOutBtn;
  const zoomText = el.fsZoomLevelText;
  const exitBtn = el.fsExitBtn;
  if (!btn) return;

  const expandIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>`;
  const shrinkIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>`;

  function isFullScreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
  }

  function toggleFullScreen() {
    if (!isFullScreen()) {
      const docEl = document.documentElement;
      if (docEl.requestFullscreen) {
        docEl.requestFullscreen();
      } else if (docEl.webkitRequestFullscreen) {
        docEl.webkitRequestFullscreen();
      } else if (docEl.mozRequestFullScreen) {
        docEl.mozRequestFullScreen();
      } else if (docEl.msRequestFullscreen) {
        docEl.msRequestFullscreen();
      }
    } else {
      exitFullScreen();
    }
  }

  function exitFullScreen() {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (document.mozCancelFullScreen) {
      document.mozCancelFullScreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    }
  }

  function updateZoomText() {
    if (zoomText) {
      zoomText.textContent = `${Math.round((state.fontScale || 1.0) * 100)}%`;
    }
  }

  function updateFullScreenUI() {
    const full = isFullScreen();
    if (full) {
      document.body.classList.add("is-fullscreen");
      btn.classList.add("active");
      btn.innerHTML = shrinkIcon;
      btn.title = "Exit Full Screen Mode (ESC)";
      if (controls) show(controls, 'flex');
      updateZoomText();
    } else {
      document.body.classList.remove("is-fullscreen");
      btn.classList.remove("active");
      btn.innerHTML = expandIcon;
      btn.title = "Toggle Full Screen Mode";
      if (controls) hide(controls);
    }
  }

  btn.addEventListener("click", toggleFullScreen);

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

  if (exitBtn) {
    exitBtn.addEventListener("click", exitFullScreen);
  }

  ["fullscreenchange", "webkitfullscreenchange", "mozfullscreenchange", "MSFullscreenChange"].forEach(evt => {
    document.addEventListener(evt, updateFullScreenUI);
  });
})();

