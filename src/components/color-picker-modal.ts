import EventBus from '../core/event-bus';

interface ColorRGB { r: number; g: number; b: number; }
interface ColorHSV { h: number; s: number; v: number; }
interface ColorHSL { h: number; s: number; l: number; }
interface ColorCMYK { c: number; m: number; y: number; k: number; }

export class ColorPickerModal {
  private el: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  private currentHue = 210; // 0..360
  private currentSat = 0.8; // 0..1
  private currentVal = 0.9; // 0..1
  private activeMode: 'RGB' | 'HSV' | 'HSL' | 'CMYK' = 'RGB';

  private libraryColors: string[] = [];
  private onApplyCallback: ((color: string) => void) | null = null;
  private onLiveChangeCallback: ((color: string) => void) | null = null;
  private isOpen = false;

  private isDraggingCanvas = false;
  private isDraggingHue = false;

  constructor() {
    this.loadLibrary();
    this.initDOM();
  }

  private loadLibrary(): void {
    try {
      const saved = localStorage.getItem('rackslicer_custom_library_modal');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.libraryColors = parsed.slice(0, 8);
          return;
        }
      }
    } catch (e) {}
    // Pre-populate with 4 sample colors as shown in the user's reference image (C1..C4)
    this.libraryColors = ['#ef4444', '#eab308', '#2563eb', '#10b981'];
  }

  private saveLibrary(): void {
    try {
      localStorage.setItem('rackslicer_custom_library_modal', JSON.stringify(this.libraryColors));
    } catch (e) {}
  }

  private initDOM(): void {
    const viewport = document.getElementById('canvas-viewport') || document.body;

    this.el = document.createElement('div');
    this.el.id = 'custom-color-picker-modal';
    this.el.className = 'cpm-modal hidden';
    viewport.appendChild(this.el);
  }

  public open(options: {
    initialColor: string;
    onApply: (color: string) => void;
    onLiveChange?: (color: string) => void;
    x?: number;
    y?: number;
  }): void {
    this.onApplyCallback = options.onApply;
    this.onLiveChangeCallback = options.onLiveChange || null;

    // Parse initial color
    const hex = options.initialColor.startsWith('#') ? options.initialColor : '#2563eb';
    const rgb = this.hexToRgb(hex);
    const hsv = this.rgbToHsv(rgb.r, rgb.g, rgb.b);

    this.currentHue = hsv.h;
    this.currentSat = hsv.s;
    this.currentVal = hsv.v;

    this.isOpen = true;
    if (this.el) {
      this.el.classList.remove('hidden');
      this.render();

      if (options.x !== undefined && options.y !== undefined) {
        this.positionModal(options.x, options.y);
      } else {
        this.centerModal();
      }
    }
  }

  public close(): void {
    this.isOpen = false;
    if (this.el) {
      this.el.classList.add('hidden');
    }
  }

  private centerModal(): void {
    if (!this.el) return;
    this.el.style.top = '50%';
    this.el.style.left = '50%';
    this.el.style.transform = 'translate(-50%, -50%)';
  }

  private positionModal(x: number, y: number): void {
    if (!this.el) return;
    const vp = document.getElementById('canvas-viewport') || document.body;
    const vpRect = vp.getBoundingClientRect();
    const modalW = 340;
    const modalH = 460;

    let left = Math.max(10, Math.min(x, vpRect.width - modalW - 20));
    let top = Math.max(10, Math.min(y, vpRect.height - modalH - 20));

    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
    this.el.style.transform = 'none';
  }

  private getCurrentHex(): string {
    const rgb = this.hsvToRgb(this.currentHue, this.currentSat, this.currentVal);
    return this.rgbToHex(rgb.r, rgb.g, rgb.b);
  }

  private getInputsHtml(): string {
    const rgb = this.hsvToRgb(this.currentHue, this.currentSat, this.currentVal);
    const hex = this.rgbToHex(rgb.r, rgb.g, rgb.b);

    if (this.activeMode === 'HSV') {
      const h = Math.round(this.currentHue);
      const s = Math.round(this.currentSat * 100);
      const v = Math.round(this.currentVal * 100);
      return `
        <div class="cpm-input-field">
          <label>H (°)</label>
          <input type="number" id="cpm-input-1" min="0" max="360" value="${h}" />
        </div>
        <div class="cpm-input-field">
          <label>S (%)</label>
          <input type="number" id="cpm-input-2" min="0" max="100" value="${s}" />
        </div>
        <div class="cpm-input-field">
          <label>V (%)</label>
          <input type="number" id="cpm-input-3" min="0" max="100" value="${v}" />
        </div>
        <div class="cpm-input-field hex-field">
          <label># Hex</label>
          <div class="cpm-hex-wrapper">
            <input type="text" id="cpm-input-hex" value="${hex.replace('#', '').toUpperCase()}" />
            <button class="cpm-copy-btn" id="cpm-copy-hex" title="Copy Hex Code">📋</button>
          </div>
        </div>
      `;
    } else if (this.activeMode === 'HSL') {
      const hsl = this.rgbToHsl(rgb.r, rgb.g, rgb.b);
      return `
        <div class="cpm-input-field">
          <label>H (°)</label>
          <input type="number" id="cpm-input-1" min="0" max="360" value="${hsl.h}" />
        </div>
        <div class="cpm-input-field">
          <label>S (%)</label>
          <input type="number" id="cpm-input-2" min="0" max="100" value="${hsl.s}" />
        </div>
        <div class="cpm-input-field">
          <label>L (%)</label>
          <input type="number" id="cpm-input-3" min="0" max="100" value="${hsl.l}" />
        </div>
        <div class="cpm-input-field hex-field">
          <label># Hex</label>
          <div class="cpm-hex-wrapper">
            <input type="text" id="cpm-input-hex" value="${hex.replace('#', '').toUpperCase()}" />
            <button class="cpm-copy-btn" id="cpm-copy-hex" title="Copy Hex Code">📋</button>
          </div>
        </div>
      `;
    } else if (this.activeMode === 'CMYK') {
      const cmyk = this.rgbToCmyk(rgb.r, rgb.g, rgb.b);
      return `
        <div class="cpm-input-field">
          <label>C (%)</label>
          <input type="number" id="cpm-input-1" min="0" max="100" value="${cmyk.c}" />
        </div>
        <div class="cpm-input-field">
          <label>M (%)</label>
          <input type="number" id="cpm-input-2" min="0" max="100" value="${cmyk.m}" />
        </div>
        <div class="cpm-input-field">
          <label>Y (%)</label>
          <input type="number" id="cpm-input-3" min="0" max="100" value="${cmyk.y}" />
        </div>
        <div class="cpm-input-field">
          <label>K (%)</label>
          <input type="number" id="cpm-input-4" min="0" max="100" value="${cmyk.k}" />
        </div>
        <div class="cpm-input-field hex-field">
          <label># Hex</label>
          <div class="cpm-hex-wrapper">
            <input type="text" id="cpm-input-hex" value="${hex.replace('#', '').toUpperCase()}" />
            <button class="cpm-copy-btn" id="cpm-copy-hex" title="Copy Hex Code">📋</button>
          </div>
        </div>
      `;
    } else {
      // Default: RGB
      return `
        <div class="cpm-input-field">
          <label>R</label>
          <input type="number" id="cpm-input-1" min="0" max="255" value="${rgb.r}" />
        </div>
        <div class="cpm-input-field">
          <label>G</label>
          <input type="number" id="cpm-input-2" min="0" max="255" value="${rgb.g}" />
        </div>
        <div class="cpm-input-field">
          <label>B</label>
          <input type="number" id="cpm-input-3" min="0" max="255" value="${rgb.b}" />
        </div>
        <div class="cpm-input-field hex-field">
          <label># Hex</label>
          <div class="cpm-hex-wrapper">
            <input type="text" id="cpm-input-hex" value="${hex.replace('#', '').toUpperCase()}" />
            <button class="cpm-copy-btn" id="cpm-copy-hex" title="Copy Hex Code">📋</button>
          </div>
        </div>
      `;
    }
  }

  private render(): void {
    if (!this.el) return;

    const rgb = this.hsvToRgb(this.currentHue, this.currentSat, this.currentVal);
    const hex = this.rgbToHex(rgb.r, rgb.g, rgb.b);

    // 8 Swatch slots (C1..C8)
    const swatchesHtml = Array.from({ length: 8 }).map((_, idx) => {
      const color = this.libraryColors[idx];
      if (color) {
        return `
          <div class="cpm-swatch-slot filled" data-index="${idx}" data-color="${color}" title="Library Color C${idx + 1}: ${color}">
            <div class="cpm-swatch-circle" style="background-color: ${color};"></div>
            <span class="cpm-swatch-label">C${idx + 1}</span>
          </div>
        `;
      } else {
        return `
          <div class="cpm-swatch-slot empty" data-index="${idx}" title="Empty slot C${idx + 1}">
            <div class="cpm-swatch-dashed"></div>
            <span class="cpm-swatch-label">C${idx + 1}</span>
          </div>
        `;
      }
    }).join('');

    this.el.innerHTML = `
      <div class="cpm-container">
        <!-- Header with Drag Handle & Close -->
        <div class="cpm-header">
          <span class="cpm-title">🎨 Color Picker</span>
          <button class="cpm-close-btn" id="cpm-close" title="Close window">✕</button>
        </div>

        <!-- 2D Saturation / Value Canvas & Vertical Hue Slider -->
        <div class="cpm-spectrum-row">
          <div class="cpm-canvas-wrapper">
            <canvas id="cpm-sat-val-canvas" width="260" height="150"></canvas>
            <div class="cpm-canvas-handle" id="cpm-canvas-handle"></div>
          </div>
          <div class="cpm-hue-bar-vertical" id="cpm-hue-slider-v">
            <div class="cpm-hue-thumb" id="cpm-hue-thumb-v"></div>
          </div>
        </div>

        <!-- Custom Library Swatches Row with (+) Button -->
        <div class="cpm-library-section">
          <button class="cpm-add-lib-btn" id="cpm-add-to-lib" title="Add current color to Selection Library (Max 8)">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
          <div class="cpm-swatch-divider"></div>
          <div class="cpm-swatches-row">
            ${swatchesHtml}
          </div>
        </div>

        <!-- Tool & Preview Row -->
        <div class="cpm-tool-row">
          <button class="cpm-eyedropper-btn" id="cpm-eyedropper" title="Pick color from screen">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14.5 2l5.5 5.5-3.5 3.5-2.5-2.5 3.5-3.5z"/>
              <path d="M14 8.5L5 17.5 2 22l4.5-3 9-9-1.5-1.5z"/>
            </svg>
          </button>
          <div class="cpm-preview-circle" style="background-color: ${hex};"></div>
          <div class="cpm-hue-bar-horizontal" id="cpm-hue-slider-h">
            <div class="cpm-hue-thumb-h" id="cpm-hue-thumb-h"></div>
          </div>
        </div>

        <!-- Dynamic Color Value Inputs (RGB / HSV / HSL / CMYK) -->
        <div class="cpm-inputs-row" id="cpm-inputs-container">
          ${this.getInputsHtml()}
        </div>

        <!-- Format Mode Tabs -->
        <div class="cpm-tabs-row">
          ${['RGB', 'HSV', 'HSL', 'CMYK'].map(mode => `
            <button class="cpm-tab-btn ${this.activeMode === mode ? 'active' : ''}" data-mode="${mode}">${mode}</button>
          `).join('')}
        </div>

        <!-- Action Footer -->
        <div class="cpm-footer">
          <button class="cpm-apply-btn" id="cpm-apply-btn">Apply Color</button>
        </div>
      </div>
    `;

    this.bindDOMEvents();
    this.drawSpectrumCanvas();
    this.updateHandlePositions();
  }

  private drawSpectrumCanvas(): void {
    this.canvas = this.el?.querySelector('#cpm-sat-val-canvas') as HTMLCanvasElement;
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    if (!this.ctx) return;

    const w = this.canvas.width;
    const h = this.canvas.height;

    // 1. Base Hue background
    this.ctx.fillStyle = `hsl(${this.currentHue}, 100%, 50%)`;
    this.ctx.fillRect(0, 0, w, h);

    // 2. White to Transparent Horizontal Gradient
    const whiteGrad = this.ctx.createLinearGradient(0, 0, w, 0);
    whiteGrad.addColorStop(0, '#ffffff');
    whiteGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    this.ctx.fillStyle = whiteGrad;
    this.ctx.fillRect(0, 0, w, h);

    // 3. Transparent to Black Vertical Gradient
    const blackGrad = this.ctx.createLinearGradient(0, 0, 0, h);
    blackGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    blackGrad.addColorStop(1, '#000000');
    this.ctx.fillStyle = blackGrad;
    this.ctx.fillRect(0, 0, w, h);
  }

  private updateHandlePositions(): void {
    if (!this.canvas) return;
    const w = this.canvas.width;
    const h = this.canvas.height;

    const handle = this.el?.querySelector('#cpm-canvas-handle') as HTMLElement;
    if (handle) {
      const handleX = this.currentSat * w;
      const handleY = (1 - this.currentVal) * h;
      handle.style.left = `${handleX}px`;
      handle.style.top = `${handleY}px`;
    }

    // Vertical Hue Thumb
    const hueThumbV = this.el?.querySelector('#cpm-hue-thumb-v') as HTMLElement;
    if (hueThumbV) {
      const pct = (this.currentHue / 360) * 100;
      hueThumbV.style.top = `${pct}%`;
    }

    // Horizontal Hue Thumb
    const hueThumbH = this.el?.querySelector('#cpm-hue-thumb-h') as HTMLElement;
    if (hueThumbH) {
      const pct = (this.currentHue / 360) * 100;
      hueThumbH.style.left = `${pct}%`;
    }

    // Update color preview circle & hex input
    const rgb = this.hsvToRgb(this.currentHue, this.currentSat, this.currentVal);
    const hex = this.rgbToHex(rgb.r, rgb.g, rgb.b);

    const prev = this.el?.querySelector('.cpm-preview-circle') as HTMLElement;
    if (prev) prev.style.backgroundColor = hex;

    const hexInp = this.el?.querySelector('#cpm-input-hex') as HTMLInputElement;
    if (hexInp && document.activeElement !== hexInp) {
      hexInp.value = hex.replace('#', '').toUpperCase();
    }

    // Update input fields based on active mode
    const inp1 = this.el?.querySelector('#cpm-input-1') as HTMLInputElement;
    const inp2 = this.el?.querySelector('#cpm-input-2') as HTMLInputElement;
    const inp3 = this.el?.querySelector('#cpm-input-3') as HTMLInputElement;
    const inp4 = this.el?.querySelector('#cpm-input-4') as HTMLInputElement;

    if (this.activeMode === 'HSV') {
      if (inp1 && document.activeElement !== inp1) inp1.value = String(Math.round(this.currentHue));
      if (inp2 && document.activeElement !== inp2) inp2.value = String(Math.round(this.currentSat * 100));
      if (inp3 && document.activeElement !== inp3) inp3.value = String(Math.round(this.currentVal * 100));
    } else if (this.activeMode === 'HSL') {
      const hsl = this.rgbToHsl(rgb.r, rgb.g, rgb.b);
      if (inp1 && document.activeElement !== inp1) inp1.value = String(hsl.h);
      if (inp2 && document.activeElement !== inp2) inp2.value = String(hsl.s);
      if (inp3 && document.activeElement !== inp3) inp3.value = String(hsl.l);
    } else if (this.activeMode === 'CMYK') {
      const cmyk = this.rgbToCmyk(rgb.r, rgb.g, rgb.b);
      if (inp1 && document.activeElement !== inp1) inp1.value = String(cmyk.c);
      if (inp2 && document.activeElement !== inp2) inp2.value = String(cmyk.m);
      if (inp3 && document.activeElement !== inp3) inp3.value = String(cmyk.y);
      if (inp4 && document.activeElement !== inp4) inp4.value = String(cmyk.k);
    } else {
      // RGB
      if (inp1 && document.activeElement !== inp1) inp1.value = String(rgb.r);
      if (inp2 && document.activeElement !== inp2) inp2.value = String(rgb.g);
      if (inp3 && document.activeElement !== inp3) inp3.value = String(rgb.b);
    }

    if (this.onLiveChangeCallback) {
      this.onLiveChangeCallback(hex);
    }
  }

  private bindDOMEvents(): void {
    if (!this.el) return;

    // Close button
    this.el.querySelector('#cpm-close')?.addEventListener('click', () => this.close());
    this.el.querySelector('#cpm-apply-btn')?.addEventListener('click', () => {
      const hex = this.getCurrentHex();
      if (this.onApplyCallback) this.onApplyCallback(hex);
      this.close();
    });

    // Add to Library (+) Button
    this.el.querySelector('#cpm-add-to-lib')?.addEventListener('click', () => {
      const currentHex = this.getCurrentHex();
      this.libraryColors = this.libraryColors.filter(c => c.toLowerCase() !== currentHex.toLowerCase());
      this.libraryColors.unshift(currentHex);
      if (this.libraryColors.length > 8) {
        this.libraryColors = this.libraryColors.slice(0, 8);
      }
      this.saveLibrary();
      this.render();
      EventBus.emit('notification', { message: `Added ${currentHex} to Selection Library`, type: 'success' });
    });

    // Swatch C1..C8 click
    this.el.querySelectorAll('.cpm-swatch-slot.filled').forEach(slot => {
      slot.addEventListener('click', () => {
        const color = slot.getAttribute('data-color');
        if (color) {
          const rgb = this.hexToRgb(color);
          const hsv = this.rgbToHsv(rgb.r, rgb.g, rgb.b);
          this.currentHue = hsv.h;
          this.currentSat = hsv.s;
          this.currentVal = hsv.v;
          this.drawSpectrumCanvas();
          this.updateHandlePositions();
        }
      });
    });

    // Eyedropper API
    this.el.querySelector('#cpm-eyedropper')?.addEventListener('click', async () => {
      if ('EyeDropper' in window) {
        try {
          const eyeDropper = new (window as any).EyeDropper();
          const result = await eyeDropper.open();
          if (result && result.sRGBHex) {
            const rgb = this.hexToRgb(result.sRGBHex);
            const hsv = this.rgbToHsv(rgb.r, rgb.g, rgb.b);
            this.currentHue = hsv.h;
            this.currentSat = hsv.s;
            this.currentVal = hsv.v;
            this.drawSpectrumCanvas();
            this.updateHandlePositions();
          }
        } catch (e) {}
      } else {
        EventBus.emit('notification', { message: 'Eyedropper API is not supported in this browser.', type: 'warning' });
      }
    });

    // Copy Hex
    this.el.querySelector('#cpm-copy-hex')?.addEventListener('click', () => {
      const hex = this.getCurrentHex();
      navigator.clipboard.writeText(hex);
      EventBus.emit('notification', { message: `Copied ${hex} to clipboard`, type: 'info' });
    });

    // Format mode tabs switcher (RGB, HSV, HSL, CMYK)
    this.el.querySelectorAll('.cpm-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-mode') as any;
        if (mode) {
          this.activeMode = mode;
          this.render();
        }
      });
    });

    // Custom Mode Input Handler
    const onCustomInputsChange = () => {
      const v1 = Number((this.el?.querySelector('#cpm-input-1') as HTMLInputElement)?.value || 0);
      const v2 = Number((this.el?.querySelector('#cpm-input-2') as HTMLInputElement)?.value || 0);
      const v3 = Number((this.el?.querySelector('#cpm-input-3') as HTMLInputElement)?.value || 0);
      const v4 = Number((this.el?.querySelector('#cpm-input-4') as HTMLInputElement)?.value || 0);

      if (this.activeMode === 'HSV') {
        this.currentHue = Math.max(0, Math.min(360, v1));
        this.currentSat = Math.max(0, Math.min(100, v2)) / 100;
        this.currentVal = Math.max(0, Math.min(100, v3)) / 100;
      } else if (this.activeMode === 'HSL') {
        const rgb = this.hslToRgb(v1, v2, v3);
        const hsv = this.rgbToHsv(rgb.r, rgb.g, rgb.b);
        this.currentHue = hsv.h;
        this.currentSat = hsv.s;
        this.currentVal = hsv.v;
      } else if (this.activeMode === 'CMYK') {
        const rgb = this.cmykToRgb(v1, v2, v3, v4);
        const hsv = this.rgbToHsv(rgb.r, rgb.g, rgb.b);
        this.currentHue = hsv.h;
        this.currentSat = hsv.s;
        this.currentVal = hsv.v;
      } else {
        // RGB
        const hsv = this.rgbToHsv(v1, v2, v3);
        this.currentHue = hsv.h;
        this.currentSat = hsv.s;
        this.currentVal = hsv.v;
      }

      this.drawSpectrumCanvas();
      this.updateHandlePositions();
    };

    this.el.querySelector('#cpm-input-1')?.addEventListener('input', onCustomInputsChange);
    this.el.querySelector('#cpm-input-2')?.addEventListener('input', onCustomInputsChange);
    this.el.querySelector('#cpm-input-3')?.addEventListener('input', onCustomInputsChange);
    this.el.querySelector('#cpm-input-4')?.addEventListener('input', onCustomInputsChange);

    this.el.querySelector('#cpm-input-hex')?.addEventListener('change', (e: any) => {
      const val = e.target.value.trim();
      const hex = val.startsWith('#') ? val : `#${val}`;
      if (/^#[0-9A-F]{6}$/i.test(hex)) {
        const rgb = this.hexToRgb(hex);
        const hsv = this.rgbToHsv(rgb.r, rgb.g, rgb.b);
        this.currentHue = hsv.h;
        this.currentSat = hsv.s;
        this.currentVal = hsv.v;
        this.drawSpectrumCanvas();
        this.updateHandlePositions();
      }
    });

    // 2D Spectrum Box Dragging
    const canvas = this.el.querySelector('#cpm-sat-val-canvas') as HTMLCanvasElement;
    if (canvas) {
      const updateSatValFromMouse = (e: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));

        this.currentSat = x / rect.width;
        this.currentVal = 1 - (y / rect.height);
        this.updateHandlePositions();
      };

      canvas.addEventListener('mousedown', (e) => {
        this.isDraggingCanvas = true;
        updateSatValFromMouse(e);
      });

      window.addEventListener('mousemove', (e) => {
        if (this.isDraggingCanvas) {
          updateSatValFromMouse(e);
        }
      });

      window.addEventListener('mouseup', () => {
        this.isDraggingCanvas = false;
      });
    }

    // Vertical Hue Dragging
    const hueSliderV = this.el.querySelector('#cpm-hue-slider-v') as HTMLElement;
    if (hueSliderV) {
      const updateHueFromMouse = (e: MouseEvent) => {
        const rect = hueSliderV.getBoundingClientRect();
        const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
        this.currentHue = Math.round((y / rect.height) * 360) % 360;
        this.drawSpectrumCanvas();
        this.updateHandlePositions();
      };

      hueSliderV.addEventListener('mousedown', (e) => {
        this.isDraggingHue = true;
        updateHueFromMouse(e);
      });

      window.addEventListener('mousemove', (e) => {
        if (this.isDraggingHue) {
          updateHueFromMouse(e);
        }
      });

      window.addEventListener('mouseup', () => {
        this.isDraggingHue = false;
      });
    }

    // Horizontal Hue Dragging
    const hueSliderH = this.el.querySelector('#cpm-hue-slider-h') as HTMLElement;
    if (hueSliderH) {
      const updateHueHFromMouse = (e: MouseEvent) => {
        const rect = hueSliderH.getBoundingClientRect();
        const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        this.currentHue = Math.round((x / rect.width) * 360) % 360;
        this.drawSpectrumCanvas();
        this.updateHandlePositions();
      };

      hueSliderH.addEventListener('mousedown', (e) => {
        updateHueHFromMouse(e);
      });
    }
  }

  // --- Color Conversion Helpers ---
  private hexToRgb(hex: string): ColorRGB {
    hex = hex.replace(/^#/, '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const num = parseInt(hex, 16) || 0;
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }

  private rgbToHex(r: number, g: number, b: number): string {
    const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  private rgbToHsv(r: number, g: number, b: number): ColorHSV {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    const s = max === 0 ? 0 : d / max;
    const v = max;

    if (max !== min) {
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return { h: Math.round(h * 360), s, v };
  }

  private hsvToRgb(h: number, s: number, v: number): ColorRGB {
    h = (h % 360) / 360;
    let r = 0, g = 0, b = 0;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);

    switch (i % 6) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      case 5: r = v; g = p; b = q; break;
    }
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
  }

  private rgbToHsl(r: number, g: number, b: number): ColorHSL {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
  }

  private hslToRgb(h: number, s: number, l: number): ColorRGB {
    h = (h % 360) / 360; s /= 100; l /= 100;
    let r: number, g: number, b: number;
    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
  }

  private rgbToCmyk(r: number, g: number, b: number): ColorCMYK {
    const r1 = r / 255, g1 = g / 255, b1 = b / 255;
    const k = 1 - Math.max(r1, g1, b1);
    if (k === 1) return { c: 0, m: 0, y: 0, k: 100 };
    const c = (1 - r1 - k) / (1 - k);
    const m = (1 - g1 - k) / (1 - k);
    const y = (1 - b1 - k) / (1 - k);
    return { c: Math.round(c * 100), m: Math.round(m * 100), y: Math.round(y * 100), k: Math.round(k * 100) };
  }

  private cmykToRgb(c: number, m: number, y: number, k: number): ColorRGB {
    c /= 100; m /= 100; y /= 100; k /= 100;
    const r = Math.round(255 * (1 - c) * (1 - k));
    const g = Math.round(255 * (1 - m) * (1 - k));
    const b = Math.round(255 * (1 - y) * (1 - k));
    return { r, g, b };
  }
}

export const colorPickerModal = new ColorPickerModal();
