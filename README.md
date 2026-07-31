# 📖 MD Reader — AI-Powered Markdown Study Workspace

> A mobile-friendly, edge-rendered Markdown reading workspace and intelligent study companion powered by **Cloudflare Workers**, **Cloudflare R2**, **Google Gemini 3.5 Flash Lite**, and **Inception Labs Mercury 2**.

---

## 🌟 Features Overview

### 📚 Document Management & Reader
- **Cloudflare R2 Bucket Integration**: Browse, create, edit, rename, move, and organize `.md` files in nested folders.
- **📚 Unified Library Manager (Upload / New Note / New Folder)**: One modal with 3 tabs — drag-and-drop **whole folders** (nested structure preserved via recursive entry traversal), searchable folder picker, per-file upload progress bars, **duplicate/conflict resolution (Skip / Overwrite-all)**, per-file error retry, skipped-file feedback, and auto-open of uploaded notes. The New Note tab ships **4 starter templates + live markdown preview** (`Ctrl+Enter` to create); folders can be created explicitly (empty folders persist via `.keep` markers) and **renamed from the context menu** with automatic migration of pins, active state and AI cache.
- **Drop-to-Import**: Drop OS files or folders directly onto any sidebar folder row to import them there.
- **Inline Markdown Editor**: Client-side unlock prompt with live preview and R2 auto-save. (The prompt is a UI convenience lock — for real write protection enable `REQUIRE_AUTH = "true"` + `UPLOAD_SECRET`, which the frontend then enforces via an auth-key prompt.)
- **Document Export & Download**: Download single `.md` files, bulk export folders as `.zip`, or render to **Print-Ready PDF** (mode-aware print system: full-app chrome hidden, dark-on-white printable palette; cheat sheets print in a dedicated 2-column layout) and **HTML**. Deep-link any document with `?doc=<key>` for shareable, printable URLs.
- **In-Page & TOC Navigation**: Floating Table of Contents (TOC) with multi-tier fuzzy anchor matching and smooth scrolling to all document headings.
- **KaTeX Math & Syntax Highlighting**: Native rendering for LaTeX mathematical equations (`$$...$$`) and code blocks.
- **PWA & Offline Support**: Service worker caching and web app manifest for a native mobile & desktop PWA experience.

---

### ✨ AI Study Suite (Gemini 3.5 Flash Lite ↔ Mercury 2)
- **✨ Document Summarizer**: Generate clean, bulleted summaries and core concept extractions from any document.
- **🧠 Interactive Explainer & Mermaid.js Flowcharts**: Explain complex concepts with auto-generated, interactive **Mermaid.js** flowcharts and architecture diagrams.
- **📝 Interactive Quizzes**: Generate 5-question multiple-choice quizzes with live scoring and explanations.
- **🗂️ Flashcard Generator**: Produce study flashcards for active recall and revision.
- **🗺️ Mind Map Generator & Interactive SVG Studio**: Convert document text into a visual, hierarchical node diagram with interactive **Zoom (+/-)**, **Mouse Wheel Scaling**, **Drag-to-Pan**, and **1-Click SVG Export** for presentation slides.
- **📄 1-Page Exam Cheat Sheet**: Compress all definitions, code syntax, formulas, and rules into a 1-page print-ready reference sheet.
- **🔍 Rich AI Auto-Glossary + Glossary Manager**: Extracts 8–15 key terms with **aliases, category chips (acronym/concept/protocol/tool/person/method/formula), importance ★ ratings**, and optional **bilingual definitions** (17 languages). Highlights **every occurrence** in the reader (alias-aware, handles C#/.NET-style symbols) with per-category colored underlines. Interactive tooltips offer **🔊 Read Aloud**, **💬 Ask AI More**, and **📖 +Dictionary** (writes to your own `Dictionary.md` note). Panel features one-click **Flashcards from Glossary** (feeds the SRS system) and **CSV export**. A global **Glossary Manager** aggregates terms across all documents with per-doc references.
- **🌐 AI Context-Aware Full Document Translator**: Complete line-by-line document translation into 17+ languages (9 Indian languages: Tamil 🇮🇳, Hindi 🇮🇳, Telugu 🇮🇳, Malayalam 🇮🇳, Kannada 🇮🇳, Bengali 🇮🇳, Marathi 🇮🇳, Gujarati 🇮🇳, Punjabi 🇮🇳 + Spanish 🇪🇸, French 🇫🇷, German 🇩🇪, Japanese 🇯🇵, Chinese 🇨🇳, Portuguese 🇵🇹, Italian 🇮🇹, Russian 🇷🇺). Enforces natural modern everyday phrasing (avoids archaic Senthamizh/formal textbook jargon), preserves code/math blocks, provides everyday context vocabulary tables, and supports **1-Click Side-by-Side Dual Reader View**.
- **🎙️ NotebookLM-Style 2-Host Audio Podcast Generator**: Converts complete documents into a 2-host spoken study podcast featuring **Alex (Host 🎙️)** and **Dr. Sam (Expert 🧠)**. Supports Indian languages (Tamil 🇮🇳, Hindi 🇮🇳, Telugu 🇮🇳, etc.), multi-speaker `gemini-3.1-flash-tts-preview` audio generation, permanent R2 audio storage, and interactive scrolling transcript synchronization.
- **💬 Paragraph Discussion Threads with `@AI`**: Leave comments on any highlighted section and tag `@AI` to discuss, explain, or debate points directly in the margin thread.
- **🔍 Semantic Workspace Search & Synthesis**: Search across all files in your library or synthesize comparative study guides from multiple selected documents.

### 🧠 Dual AI Engine & Multi-Model Switching
- **🚀 Dual AI Engine (Gemini 3.5 Flash Lite ↔ Mercury 2 by Inception Labs)**: Seamlessly toggle between **Google Gemini 3.5 Flash Lite** and **Inception Labs Mercury 2** at any time via the topbar or AI panel model selector dropdowns. Switch models mid-chat — each response turn is tagged with a clear model badge (`Gemini 3.5` / `Mercury 2`) so you always know which engine answered.
- **🔄 Universal Model Support**: Both models power **all** AI features identically — Summarize, Explain, Quiz, Flashcards, Cheat Sheet, Glossary, Translate, Podcast, Paragraph @AI Threads, and Multi-Document Synthesis. Your model choice is persisted across sessions via `localStorage`.
- **📚 Multi-Document Comparative Synthesis**: Select multiple files in the sidebar and trigger cross-document comparative analysis and concept mapping powered by your chosen AI model.

---

### 📊 Study Productivity
- **📊 Study Dashboard**: Home screen with Continue Reading (per-doc progress bars), Flashcards due today, XP/streak snapshot, and Quick Actions.
- **📍 Reading Position Memory**: Automatically remembers and restores your scroll position per document, with progress tracking across the dashboard.
- **🧠 Spaced Repetition (SM-2)**: Flashcard Easy/Medium/Hard ratings drive a real SM-2 scheduling algorithm — due-today review queue, hard cards re-queued in-session, next-review badges.
- **🗑️ Trash & Restore**: Soft-delete for files and folders with a Trash view, one-click restore (conflict-safe), delete-forever, and empty-trash.
- **⚡ Quick Capture**: Floating ⚡ button anywhere → append a timestamped thought to today's `Inbox/YYYY-MM-DD.md`.

### 🎮 Gamification & Active Reading Tools
- **🎮 Gamified Study Streaks & XP System**: Earn XP for reading, completing Pomodoros, taking quizzes, and annotating. Unlock achievement badges (Page Turner, On Fire, Focus Master, Quiz Champion, Annotator) and level up.
- **🎯 Topic Focus Mode (Concept Isolation)**: Filter documents by keyword/concept. Unrelated sections dim out while matching paragraphs remain highlighted.
- **🖍️ Multi-Color Text Highlighting**: Highlight document text in 4 colors (Yellow 🟡, Green 🟢, Blue 🔵, Rose 🔴).
- **📝 Sticky Margin Notes**: Attach collapsible margin notes to any highlight with auto-scrolling between notes and text.
- **⏱️ Pomodoro Study Timer**: Built-in 25/5/15 minute study timer with synthesized Web Audio alerts.
- **🗣️ Read Aloud (Text-to-Speech)**: Listen to document text with adjustable speech rates (0.75x to 2x).
- **📊 Reading Stats**: Real-time word count and estimated reading time indicator.

---

### 🎨 Customization, Layout & Accessibility
- **⛶ 1-Click Distraction-Free Full Screen Content Reading Mode**: Toggle borderless full-screen reading via topbar button (`#fullScreenBtn`) or keyboard shortcut (`F11` / `Ctrl+Shift+F`). Automatically hides all UI chrome, topbar, sidebar, and toolbars, leaving ONLY smooth document scrolling and a floating **Zoom In / Zoom Out (+/-)** control bar.
- **🎯 Focus / Zen Mode & Typewriter Scrolling**: Full-screen, distraction-free reading environment that hides UI chrome and toolbars. Features active-paragraph focus with smooth scrolling and dimming of non-active text.
- **🎨 8 Eye-Care Themes, 5 Accent Pickers & Dynamic Typography Engine**: Personalize your study environment with 8 base themes (Night, Day, Sepia, OLED Black, Forest Sage, Cafe Latte, Nord Frost, Sakura Rose) + 5 Accent Swatches (Indigo, Emerald, Sky, Rose, Amber) + 5 Font Families (Inter, Roboto, Merriweather Serif, Lexend Accessible, OpenDyslexic) + 4 Line Spacing Presets (1.4x to 2.0x).
- **📁 Expandable & Resizable Folder Display Sidebar Panel**: Drag-to-resize handle (220px to 650px width) on the sidebar edge with 1-click **Expand/Shrink (↔)** toggle button and `localStorage` state persistence for effortless reading of long nested folder paths.
- **📐 Resizable & Expandable AI Side Panel with 1-Click Retry / Regenerate**: Drag-to-resize handle (300px to 85vw) with 1-click expand/collapse toggle and instant **🔄 Retry / Regenerate** buttons on every Tutor response and AI panel feature (Summary, Quiz, Flashcards, Cheat Sheet, Glossary).
- **📐 Split-Screen Dual Reader**: Compare two Markdown notes side-by-side on desktop/tablets, with adaptive vertical stacking on mobile viewports.
- **Dynamic Accent Color Picker**: Select custom HSL color accents (Indigo, Emerald, Sky, Rose, Amber) with fixed mobile-ready popovers.
- **Adjustable Typography**: Font size scaling controls (A+ / A-) for comfortable reading on any screen size.
- **Mobile Responsive Layout**: Optimized touch targets, swipeable bars, and adaptive popovers for ultra-narrow mobile viewports.

---

## 🏗️ Tech Stack & Architecture

| Component | Technology |
| :--- | :--- |
| **Edge Compute** | [Cloudflare Workers](https://workers.cloudflare.com/) (V8 Serverless) |
| **Object Storage** | [Cloudflare R2 Bucket](https://www.cloudflare.com/developer-platform/r2/) |
| **AI Models** | [Google Gemini 3.5 Flash Lite](https://ai.google.dev/) + [Inception Labs Mercury 2](https://docs.inceptionlabs.ai/) (Dual Engine) |
| **Frontend UI** | HTML5, Vanilla CSS3 (Design Tokens & HSL Variables), JavaScript (ESNext) |
| **Diagrams & Math** | [Mermaid.js](https://mermaid.js.org/), [KaTeX](https://katex.org/), [Marked.js](https://marked.js.org/) |
| **Packaging** | Wrangler CLI, PWA Service Worker, JSZip |

---

## 📁 Repository Structure

```
md-reader/
├── public/
│   ├── css/
│   │   └── style.css       # Core stylesheet, theme tokens, animations & responsive media queries
│   ├── js/
│   │   └── app.js          # Main frontend logic, state management, AI UI handlers, highlighting & comments
│   ├── index.html          # PWA main single-page application template
│   ├── manifest.json       # Progressive Web App manifest
│   ├── sw.js               # Service Worker for PWA offline shell caching
│   └── icon.svg            # App icon asset
├── src/
│   └── index.js            # Cloudflare Worker API routes (R2 ops, Gemini AI, Inception Mercury 2 integration)
├── wrangler.toml           # Cloudflare Worker configuration & environment bindings
└── package.json            # Dependencies and deployment scripts
```

---

## 🛠️ Setup & Local Development

### Prerequisites
- Node.js (v18+)
- Cloudflare Wrangler CLI (`npm install -g wrangler`)
- Cloudflare Account with an R2 Bucket created (e.g. `my-md-docs`)

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/ajithvnr2001/md-reader.git
   cd md-reader
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment (`wrangler.toml`)**:
   Ensure your `wrangler.toml` is linked to your R2 bucket:
   ```toml
   name = "md-reader-r2"
   main = "src/index.js"
   compatibility_date = "2024-01-01"

   [[r2_buckets]]
   binding = "MD_BUCKET"
   bucket_name = "your-r2-bucket-name"

   [vars]
   REQUIRE_AUTH = "false"
   ```

4. **Set API Key Secrets** (never commit them to git):
   ```bash
   # Google Gemini API Key (required for Gemini 3.5 + TTS podcasts)
   npx wrangler secret put GEMINI_API_KEY

   # Inception Labs API Key (required for Mercury 2)
   npx wrangler secret put INCEPTION_API_KEY

   # Only needed if REQUIRE_AUTH = "true"
   npx wrangler secret put UPLOAD_SECRET
   ```
   For local development, copy `.dev.vars.example` to `.dev.vars` and fill in your keys (`.dev.vars` is git-ignored).

5. **Run Locally**:
   ```bash
   npm run dev
   ```

---

## 🚀 Deployment

Deploy directly to Cloudflare Workers with Wrangler:

```bash
npm run deploy
```

---

## 🔒 Security & Privacy

- **No Hardcoded Credentials**: API keys are supplied securely via Cloudflare Worker Secrets (`env.GEMINI_API_KEY`, `env.INCEPTION_API_KEY`) and are never committed to the repository.
- **XSS Hardening**: All AI-generated and user-provided content is sanitized with [DOMPurify](https://github.com/cure53/DOMPurify) before rendering; file/folder names are HTML-escaped and all tree interactions use event delegation instead of inline handlers.
- **Restricted File Serving**: `/api/file` serves only `.md`/`.markdown` keys and `/api/podcast/audio` is restricted to the `podcasts/` prefix, so internal objects like `.ai_cache.json` cannot be downloaded.
- **Overwrite Protection**: Rename and move operations refuse to overwrite an existing file (HTTP 409).
- **Optional Authorization**: Write endpoints (upload, edit save, delete, rename, move, cache sync) can be protected by setting `REQUIRE_AUTH = "true"` and defining `UPLOAD_SECRET`. When enabled, the frontend automatically prompts for the `X-Auth-Key` once and stores it in `localStorage`.
- **Client-Side Privacy**: Highlights, notes, model preferences, and local chat cache are stored locally in the user's browser `localStorage`.

---

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.
