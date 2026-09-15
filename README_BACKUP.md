# Rack Slicer - Complete Portable Backup & Setup Guide

This backup contains the complete source code, AI engines, 2D/3D visualizers, styles, documentation, production build, and all configuration files for **Rack Slicer**.

---

## 🚀 Quick Start on Any New Computer

### Prerequisites
- **Node.js**: Version 18+ or 20+ (Download from https://nodejs.org)

---

### Method 1: Instant Launch (Windows 1-Click)
1. Double-click `START_DEV.bat` to automatically install packages (if missing) and start the local dev server.
2. Open your browser to `http://localhost:5173`.

---

### Method 2: Manual Terminal Commands (Windows / macOS / Linux)

1. Open a terminal in this directory:
   ```bash
   npm install
   ```
2. Start the development server:
   ```bash
   npm run dev
   ```
3. Open `http://localhost:5173` in your browser.

---

### Method 3: Run the Built Production App
To run the optimized production build:
```bash
npm run preview
```
Or double-click `START_PREVIEW.bat`.

---

## 🤖 AI Provider Setup
Rack Slicer features a multi-provider AI assistant:
- **Google Gemini** (Free tier available)
- **DeepSeek** (V4 Pro / R1 reasoning)
- **OpenRouter** (Qwen 3.5 / Claude / Llama)
- **OpenAI** (GPT-5.6 / GPT-4.5)
- **Anthropic Claude** (Opus / Sonnet)

To configure your API keys:
1. Open the app in your browser.
2. Click the **⚙ (AI Settings)** button in the assistant panel.
3. Choose your provider, paste your key, click **Auto-Detect Models ↻** or pick a model, and click **Save**.
4. API keys are stored privately in your browser's `localStorage` and never leave your machine except directly to the provider's API.

---

## 📦 Project Structure
- `src/` — Complete TypeScript source code (Core canvas, AI engine, 3D renderer, Datacenter builder, components).
- `dist/` — Pre-built production bundle ready for immediate static hosting.
- `public/` — Static assets and fonts.
- `package.json` & `package-lock.json` — Exact pinned dependency tree.
- `vite.config.ts` & `tsconfig.json` — Build configuration.
