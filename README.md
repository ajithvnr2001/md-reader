# 📖 MD Reader — AI-Powered Markdown Study Workspace

> A mobile-friendly, edge-rendered Markdown reading workspace and intelligent study companion powered by **Cloudflare Workers**, **Cloudflare R2**, and **Google Gemini AI**.

---

## 🌟 Features Overview

### 📚 Document Management & Reader
- **Cloudflare R2 Bucket Integration**: Browse, create, edit, rename, move, and organize `.md` files in nested folders.
- **Inline Markdown Editor**: Password-protected inline editor (`ajithvnr2001`) with live preview and R2 auto-save.
- **Document Export & Download**: Download single `.md` files, bulk export folders as `.zip`, or render to **Print-Ready PDF** and **HTML**.
- **In-Page & TOC Navigation**: Floating Table of Contents (TOC) with multi-tier fuzzy anchor matching and smooth scrolling to all document headings.
- **KaTeX Math & Syntax Highlighting**: Native rendering for LaTeX mathematical equations (`$$...$$`) and code blocks.
- **PWA & Offline Support**: Service worker caching and web app manifest for a native mobile & desktop PWA experience.

---

### ✨ AI Study Suite (Gemini 3.5 Flash Lite)
- **✨ Document Summarizer**: Generate clean, bulleted summaries and core concept extractions from any document.
- **🧠 Interactive Explainer & Mermaid.js Flowcharts**: Explain complex concepts with auto-generated, interactive **Mermaid.js** flowcharts and architecture diagrams.
- **📝 Interactive Quizzes**: Generate 5-question multiple-choice quizzes with live scoring and explanations.
- **🗂️ Flashcard Generator**: Produce study flashcards for active recall and revision.
- **🗺️ Mind Map Generator & Interactive SVG Studio**: Convert document text into a visual, hierarchical node diagram with interactive **Zoom (+/-)**, **Mouse Wheel Scaling**, **Drag-to-Pan**, and **1-Click SVG Export** for presentation slides.
- **📄 1-Page Exam Cheat Sheet**: Compress all definitions, code syntax, formulas, and rules into a 1-page print-ready reference sheet.
- **🔍 AI Auto-Glossary**: Extract 8 to 15 key technical terms and display floating AI definition tooltips when hovering or tapping jargon in notes.
- **🌐 AI Context-Aware Full Document Translator**: Complete line-by-line document translation into 17+ languages (9 Indian languages: Tamil 🇮🇳, Hindi 🇮🇳, Telugu 🇮🇳, Malayalam 🇮🇳, Kannada 🇮🇳, Bengali 🇮🇳, Marathi 🇮🇳, Gujarati 🇮🇳, Punjabi 🇮🇳 + Spanish 🇪🇸, French 🇫🇷, German 🇩🇪, Japanese 🇯🇵, Chinese 🇨🇳, Portuguese 🇵🇹, Italian 🇮🇹, Russian 🇷🇺). Enforces natural modern everyday phrasing (avoids archaic Senthamizh/formal textbook jargon), preserves code/math blocks, provides everyday context vocabulary tables, and supports **1-Click Side-by-Side Dual Reader View**.
- **🎙️ NotebookLM-Style 2-Host Audio Podcast Generator**: Converts complete documents into a 2-host spoken study podcast featuring **Alex (Host 🎙️)** and **Dr. Sam (Expert 🧠)**. Supports Indian languages (Tamil 🇮🇳, Hindi 🇮🇳, Telugu 🇮🇳, etc.), multi-speaker `gemini-3.1-flash-tts-preview` audio generation, permanent R2 audio storage, and interactive scrolling transcript synchronization.
- **💬 Paragraph Discussion Threads with `@AI`**: Leave comments on any highlighted section and tag `@AI` to discuss, explain, or debate points directly in the margin thread.
- **🔍 Semantic Workspace Search & Synthesis**: Search across all files in your library or synthesize comparative study guides from multiple selected documents.

---

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
- **🎯 Focus / Zen Mode & Typewriter Scrolling**: Full-screen, distraction-free reading environment that hides UI chrome and toolbars. Features active-paragraph focus with smooth scrolling and dimming of non-active text.
- **🎨 8 Eye-Care Themes, 5 Accent Pickers & Dynamic Typography Engine**: Personalize your study environment with 8 base themes (Night, Day, Sepia, OLED Black, Forest Sage, Cafe Latte, Nord Frost, Sakura Rose) + 5 Accent Swatches (Indigo, Emerald, Sky, Rose, Amber) + 5 Font Families (Inter, Roboto, Merriweather Serif, Lexend Accessible, OpenDyslexic) + 4 Line Spacing Presets (1.4x to 2.0x).
- **📐 Resizable & Expandable AI Side Panel**: Drag-to-resize handle (300px to 85vw) with 1-click expand/collapse toggle for comfortable side-by-side study workflows.
- **📐 Split-Screen Dual Reader Studio with Synchronized Scroll, Drag Resizer & Swap Panes**: Compare two Markdown notes side-by-side on desktop/tablets, featuring **🔗 Synchronized Dual Scroll Toggle**, **↔️ Resizable Drag Splitter Handle (20/80 to 80/20)**, **⇄ Swap Panes Button**, and **Contextual AI Execution** (all AI tools automatically target whichever pane—Primary or Secondary—is currently active with `[Secondary: file.md]` badges).
- **Dynamic Accent Color Picker**: Select custom HSL color accents (Indigo, Emerald, Sky, Rose, Amber) with fixed mobile-ready popovers.
- **Adjustable Typography**: Font size scaling controls (A+ / A-) for comfortable reading on any screen size.
- **Mobile Responsive Layout**: Optimized touch targets, swipeable bars, and adaptive popovers for ultra-narrow mobile viewports.

---

## 🏗️ Tech Stack & Architecture

| Component | Technology |
| :--- | :--- |
| **Edge Compute** | [Cloudflare Workers](https://workers.cloudflare.com/) (V8 Serverless) |
| **Object Storage** | [Cloudflare R2 Bucket](https://www.cloudflare.com/developer-platform/r2/) |
| **AI Model** | [Google Gemini 3.5 Flash Lite](https://ai.google.dev/) via Workers API |
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
│   └── index.js            # Cloudflare Worker API routes (R2 bucket operations & Gemini AI integration)
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
   AI_MODEL = "gemini-3.5-flash-lite"
   REQUIRE_AUTH = "false"
   ```

4. **Set Gemini API Key Secret**:
   ```bash
   npx wrangler secret put GEMINI_API_KEY
   ```

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

- **No Hardcoded Credentials**: API keys and secrets are supplied securely via Cloudflare Worker Secrets (`env.GEMINI_API_KEY`).
- **Optional Authorization**: Write endpoints (upload, delete, rename) can be protected by setting `REQUIRE_AUTH = "true"` and defining `UPLOAD_SECRET`.
- **Client-Side Privacy**: Highlights, notes, and local chat cache are stored locally in the user's browser `localStorage`.

---

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.
