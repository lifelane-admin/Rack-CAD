# RackSlicer Enterprise CAD — Complete Offline Package

This package is completely self-contained and ready to run on any separate laptop or desktop with **zero internet connection required**.

---

## 🚀 Quick Start (1-Click Launch)

### On Windows Laptops:
1. Copy the `offline-package` folder (or extract `RackSlicer-Offline-Package.zip`) onto your laptop (via USB drive, shared folder, or external disk).
2. Double-click **`start-windows.bat`**.
3. It will automatically detect your environment and launch the local server:
   - If **Node.js** is installed ➔ uses high-performance Node.js server.
   - Else if **Python** is installed ➔ uses Python 3 standard library server.
   - Else ➔ uses **native Windows PowerShell** server (zero software prerequisites needed!).
4. Your default browser opens automatically to **`http://localhost:8080`**.

---

### On Mac or Linux Laptops:
1. Open a terminal in this folder.
2. Run:
   ```bash
   chmod +x start-mac-linux.sh
   ./start-mac-linux.sh
   ```
3. Or run directly:
   ```bash
   node start-server.js
   # or
   python3 start-server.py
   ```
4. Your browser opens to **`http://localhost:8080`**.

---

## 🌐 Hosting for Other Devices on Local Network (LAN / Wi-Fi)

When the server starts, it prints your laptop's local IP address:
```
 > Local Machine:     http://localhost:8080
 > LAN / WiFi IP:     http://192.168.1.50:8080
```
Any engineer or technician with a laptop, tablet, or phone connected to the same Wi-Fi router or Ethernet switch can open:
```
http://<laptop-ip>:8080
```
*(e.g., `http://192.168.1.50:8080`)*

---

## 📦 What is Included in this Offline Package:

- **Complete Production Application (`/app`)**:
  - Full 2D & 3D Interactive Rack CAD Viewports.
  - Multi-rack datacenter elevation layout & U-space occupancy engine.
  - Smart cable routing & ear-bracket hit-testing system.
  - Power redundancy & PDU outlet auto-balancing.
  - Full Engineering Excel Export Engine (20+ sheets with human-readable identifiers).
  - All fonts (Inter), icons, and 3D environment maps bundled locally (0 external CDN dependencies).
- **Standalone Launchers**:
  - `start-windows.bat`: 1-click launcher for Windows.
  - `start-mac-linux.sh`: 1-click launcher for Mac/Linux.
  - `start-server.js`: Zero-dependency Node.js server (`node start-server.js`).
  - `start-server.py`: Zero-dependency Python 3 server (`python start-server.py`).
  - `start-server.ps1`: Built-in Windows PowerShell HTTP server.

---

## 🤖 Optional: Running AI Features Completely Offline

All core CAD design, cabling, power calculations, BOM, validation rules, and Excel exports work **100% offline out-of-the-box**.

If you also wish to use the **AI Copilot & Workflow Orchestrator** in an air-gapped / offline environment:
1. Install **[Ollama](https://ollama.com)** on the laptop.
2. Pull a local model while online (or copy the model weights to the laptop):
   ```bash
   ollama pull llama3.2
   # or
   ollama pull mistral
   # or
   ollama pull deepseek-r1:8b
   ```
3. Run Ollama on the laptop:
   ```bash
   ollama serve
   ```
4. In RackSlicer, open the **AI Settings** panel:
   - Select Provider: **Local Ollama**
   - Endpoint: `http://localhost:11434`
   - Model: `llama3.2`
   - The AI Copilot will generate recommendations, answer architectural queries, and audit configurations with 100% data privacy and zero cloud connection.
