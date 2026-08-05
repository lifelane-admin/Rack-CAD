// Dedicated floating panel for creating/editing TextLabel annotations — opens when the Text
// tool is activated (Toolbar/FloatingToolbar) or when an existing label is selected, and can be
// dismissed independently of the tool itself via its own close (✕) button. Follows the same
// floating-panel conventions as floating-toolbar.ts (drag handle via makeDraggable,
// event-bus-driven re-render).
import { eventBus } from '../core/event-bus';
import { stateManager } from '../core/state';
import { ToolMode, SelectableItem, TextLabel } from '../core/types';
import { makeDraggable, escapeHtml } from './floating-panel-utils';
import { findNearestRack, rackCenterX } from '../utils/annotation-align';
import { DEFAULT_PADDING_X, DEFAULT_PADDING_Y, DEFAULT_POINTER_LINE_COLOR } from '../renderers/text-label-renderer';

const FONT_FAMILIES = [
  'Inter, sans-serif', 'Arial, sans-serif', 'Helvetica, sans-serif', 'Segoe UI, sans-serif',
  'Roboto, sans-serif', 'Calibri, sans-serif', 'Verdana, sans-serif', 'Tahoma, sans-serif',
  'Georgia, serif', 'Times New Roman, serif', 'Courier New, monospace', 'Consolas, monospace',
];

export class TextToolPanel {
  private el: HTMLElement | null = null;
  private currentTool: ToolMode = 'select';
  private closedByUser = false;
  private lastAutoShowKey: string | null = null;

  constructor() {
    this.init();
  }

  private init(): void {
    const viewport = document.getElementById('canvas-viewport');
    if (!viewport) return;
    this.el = document.createElement('div');
    this.el.id = 'text-tool-panel';
    this.el.className = 'text-tool-panel';
    this.el.style.top = '16px';
    this.el.style.left = '50%';
    viewport.appendChild(this.el);
    makeDraggable(this.el, '.ttp-drag-handle');

    eventBus.on('tool:changed', (tool: ToolMode) => {
      this.currentTool = tool;
      this.maybeReopen();
      this.render();
    });
    eventBus.on('selection:changed', () => {
      this.maybeReopen();
      this.render();
    });
    // Typing/dragging a control in this panel (text content, font size, color, ...) round-trips
    // through eventBus.emit('textlabel:update', ...) -> stateManager.setState -> 'state:changed',
    // which this panel also listens to for changes made elsewhere. Rebuilding innerHTML on every
    // one of those self-triggered keystrokes tore out and recreated the focused input each time,
    // kicking focus out after a single character. While the user has an input inside this panel
    // focused, skip the rebuild — its own value is already correct (the browser owns it), and
    // other controls don't need to be live mid-edit; the next render once focus leaves catches up.
    // Same reasoning applies to any canvas drag (moving/resizing a label, device, rack, ...) —
    // app.ts toggles '.dragging-active' on the canvas for the duration of one, and nothing this
    // panel displays changes from a pure position/size drag, so skip the rebuild until it ends.
    eventBus.on('state:changed', () => {
      if (this.el?.contains(document.activeElement)) return;
      if (document.getElementById('canvas')?.classList.contains('dragging-active')) return;
      this.render();
    });

    this.render();
  }

  private selectedLabel(): TextLabel | null {
    const s = stateManager.getState();
    const sel: SelectableItem | undefined = s.selection.find(i => i.type === 'text');
    if (!sel) return null;
    return s.textLabels.find(t => t.id === sel.id) ?? null;
  }

  /** A fresh trigger (tool just switched to 'text', or a different label just got selected)
   *  clears a prior manual close — but re-rendering for the *same* trigger while the user has
   *  it closed must not reopen it, which is what makes the close button actually "stick". */
  private maybeReopen(): void {
    const label = this.selectedLabel();
    const key = label ? `sel:${label.id}` : (this.currentTool === 'text' ? 'tool:text' : null);
    if (key !== null && key !== this.lastAutoShowKey) {
      this.closedByUser = false;
    }
    this.lastAutoShowKey = key;
  }

  private render(): void {
    if (!this.el) return;
    const label = this.selectedLabel();
    const shouldShow = (this.currentTool === 'text' || !!label) && !this.closedByUser;

    if (!shouldShow) {
      this.el.style.display = 'none';
      return;
    }
    this.el.style.display = 'block';

    this.el.innerHTML = `
      <div class="ttp-header">
        <span class="ttp-drag-handle" title="Drag to reposition">⋮⋮</span>
        <span class="ttp-title">Text Tool</span>
        <button class="ttp-close" title="Close panel">✕</button>
      </div>
      <div class="ttp-body">
        ${label ? this.controlsHtml(label) : this.hintHtml()}
      </div>
    `;

    this.bindEvents(label);
  }

  private hintHtml(): string {
    const msg = this.currentTool === 'text'
      ? 'Click anywhere on the canvas to place a text label.'
      : 'Select a text label on the canvas to edit it.';
    return `<div class="ttp-hint">${escapeHtml(msg)}</div>`;
  }

  private controlsHtml(label: TextLabel): string {
    const fontOptions = FONT_FAMILIES.map(f =>
      `<option value="${escapeHtml(f)}" ${label.fontFamily === f ? 'selected' : ''}>${escapeHtml(f.split(',')[0])}</option>`
    ).join('');

    return `
      <textarea class="ttp-text" rows="2" placeholder="Label text...">${escapeHtml(label.text)}</textarea>

      <div class="ttp-row">
        <select class="ttp-font-family" title="Font family">${fontOptions}</select>
        <input class="ttp-font-size" type="number" min="8" max="96" value="${label.fontSize}" title="Font size (px)" />
      </div>

      <div class="ttp-row">
        <button class="ttp-btn ${label.fontWeight === 'bold' ? 'active' : ''}" data-toggle="bold" title="Bold"><b>B</b></button>
        <button class="ttp-btn ${label.fontStyle === 'italic' ? 'active' : ''}" data-toggle="italic" title="Italic"><i>I</i></button>
        <button class="ttp-btn ${label.underline ? 'active' : ''}" data-toggle="underline" title="Underline"><u>U</u></button>
        <span class="ttp-sep"></span>
        <button class="ttp-btn ${label.align === 'left' ? 'active' : ''}" data-align="left" title="Align left">⟸</button>
        <button class="ttp-btn ${label.align === 'center' ? 'active' : ''}" data-align="center" title="Align center">⟺</button>
        <button class="ttp-btn ${label.align === 'right' ? 'active' : ''}" data-align="right" title="Align right">⟹</button>
      </div>

      <div class="ttp-row">
        <label class="ttp-color-label" title="Text color">A <input class="ttp-color" type="color" value="${label.color}" /></label>
        <label class="ttp-color-label" title="Background color">▢ <input class="ttp-bg-color" type="color" value="${label.backgroundColor ?? '#000000'}" ${!label.backgroundColor ? 'disabled' : ''} /></label>
        <label class="ttp-checkbox-label" title="Transparent background">
          <input class="ttp-bg-transparent" type="checkbox" ${!label.backgroundColor ? 'checked' : ''} /> Transparent
        </label>
      </div>

      <div class="ttp-row">
        <label class="ttp-pos-label" title="Background box width — space between the text and the box's left/right edge">Box W
          <input class="ttp-pad-x" type="number" min="0" max="60" value="${label.backgroundPaddingX ?? DEFAULT_PADDING_X}" />
        </label>
        <label class="ttp-pos-label" title="Background box height — space between the text and the box's top/bottom edge">Box H
          <input class="ttp-pad-y" type="number" min="0" max="60" value="${label.backgroundPaddingY ?? DEFAULT_PADDING_Y}" />
        </label>
      </div>

      <div class="ttp-row">
        <label class="ttp-pos-label" title="Exact X position (world px)">X
          <input class="ttp-pos-x" type="number" value="${Math.round(label.x)}" />
        </label>
        <label class="ttp-pos-label" title="Exact Y position (world px)">Y
          <input class="ttp-pos-y" type="number" value="${Math.round(label.y)}" />
        </label>
      </div>

      <div class="ttp-row">
        <button class="ttp-btn ttp-center-h" title="Center this label horizontally on the rack it's nearest to — sets Align: Center and computes the exact X for you" style="flex:1;">⊙ Center Horizontally</button>
      </div>

      ${label.pointerDeviceId ? this.pointerControlsHtml(label) : ''}

      <div class="ttp-row">
        <label class="ttp-rotation-label" title="Rotation (degrees)">⟳
          <input class="ttp-rotation" type="number" min="0" max="360" value="${label.rotation || 0}" />°
        </label>
        <button class="ttp-btn ttp-delete" title="Delete label">🗑 Delete</button>
      </div>
    `;
  }

  private pointerControlsHtml(label: TextLabel): string {
    const isFlexible = label.pointerStyle === 'flexible';
    return `
      <div class="ttp-row">
        <span class="ttp-context-label" style="flex:1;">Device Pointer</span>
      </div>
      <div class="ttp-row">
        <button class="ttp-btn ${!isFlexible ? 'active' : ''}" data-pointer-style="elbow" title="Diagonal-then-straight leader line" style="flex:1;">⌐ Elbow</button>
        <button class="ttp-btn ${isFlexible ? 'active' : ''}" data-pointer-style="flexible" title="Flexible line with draggable anchor points — add/remove via the floating toolbar's anchor buttons, same as a cable" style="flex:1;">〜 Flexible</button>
      </div>
      <div class="ttp-row">
        <label class="ttp-color-label" title="Connector line color">╱ <input class="ttp-pointer-color" type="color" value="${label.pointerLineColor || DEFAULT_POINTER_LINE_COLOR}" /></label>
        <button class="ttp-btn ttp-detach" title="Remove the connector — keeps this as a plain floating label" style="flex:1;">Detach</button>
      </div>
    `;
  }

  private bindEvents(label: TextLabel | null): void {
    if (!this.el) return;

    this.el.querySelector('.ttp-close')?.addEventListener('click', () => {
      this.closedByUser = true;
      this.render();
    });

    if (!label) return;
    const update = (data: Partial<TextLabel>) => eventBus.emit('textlabel:update', { id: label.id, data });

    this.el.querySelector('.ttp-text')?.addEventListener('input', (e: any) => update({ text: e.target.value }));
    this.el.querySelector('.ttp-font-family')?.addEventListener('change', (e: any) => update({ fontFamily: e.target.value }));
    this.el.querySelector('.ttp-font-size')?.addEventListener('change', (e: any) => update({ fontSize: Number(e.target.value) || 16 }));
    this.el.querySelector('.ttp-color')?.addEventListener('input', (e: any) => update({ color: e.target.value }));
    this.el.querySelector('.ttp-rotation')?.addEventListener('change', (e: any) => update({ rotation: Number(e.target.value) || 0 }));
    this.el.querySelector('.ttp-pos-x')?.addEventListener('change', (e: any) => update({ x: Number(e.target.value) || 0 }));
    this.el.querySelector('.ttp-pos-y')?.addEventListener('change', (e: any) => update({ y: Number(e.target.value) || 0 }));

    this.el.querySelector('.ttp-center-h')?.addEventListener('click', () => {
      const racks = stateManager.getState().racks;
      const rack = findNearestRack(racks, label.x, label.y);
      if (!rack) return;
      update({ align: 'center', x: rackCenterX(rack) });
    });

    this.el.querySelectorAll('[data-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        const kind = btn.getAttribute('data-toggle');
        if (kind === 'bold') update({ fontWeight: label.fontWeight === 'bold' ? 'normal' : 'bold' });
        else if (kind === 'italic') update({ fontStyle: label.fontStyle === 'italic' ? 'normal' : 'italic' });
        else if (kind === 'underline') update({ underline: !label.underline });
      });
    });

    this.el.querySelectorAll('[data-align]').forEach(btn => {
      btn.addEventListener('click', () => update({ align: btn.getAttribute('data-align') as TextLabel['align'] }));
    });

    this.el.querySelector('.ttp-bg-color')?.addEventListener('input', (e: any) => update({ backgroundColor: e.target.value }));
    this.el.querySelector('.ttp-bg-transparent')?.addEventListener('change', (e: any) => {
      update({ backgroundColor: e.target.checked ? null : '#1f2937' });
    });
    this.el.querySelector('.ttp-pad-x')?.addEventListener('change', (e: any) => update({ backgroundPaddingX: Math.max(0, Number(e.target.value) || 0) }));
    this.el.querySelector('.ttp-pad-y')?.addEventListener('change', (e: any) => update({ backgroundPaddingY: Math.max(0, Number(e.target.value) || 0) }));

    this.el.querySelector('.ttp-delete')?.addEventListener('click', () => {
      eventBus.emit('edit:delete', undefined);
    });

    if (label.pointerDeviceId) {
      this.el.querySelectorAll('[data-pointer-style]').forEach(btn => {
        btn.addEventListener('click', () => {
          const style = btn.getAttribute('data-pointer-style') as 'elbow' | 'flexible';
          // Seed a single default via-point the first time a label switches to Flexible, so the
          // user immediately sees a draggable handle rather than an empty (device-to-box
          // straight line) result that looks like nothing happened.
          if (style === 'flexible' && (!label.pointerAnchorPoints || label.pointerAnchorPoints.length === 0)) {
            const origin = stateManager.getDeviceWorldOrigin(label.pointerDeviceId!);
            const deviceWorld = origin ? { x: origin.x + (label.pointerAnchorX ?? 0), y: origin.y + (label.pointerAnchorY ?? 0) } : { x: label.x, y: label.y };
            const midpoint = { x: (deviceWorld.x + label.x) / 2, y: (deviceWorld.y + label.y) / 2 };
            update({ pointerStyle: style, pointerAnchorPoints: [midpoint] });
          } else {
            update({ pointerStyle: style });
          }
        });
      });

      this.el.querySelector('.ttp-pointer-color')?.addEventListener('input', (e: any) => update({ pointerLineColor: e.target.value }));

      this.el.querySelector('.ttp-detach')?.addEventListener('click', () => {
        update({ pointerDeviceId: undefined, pointerAnchorX: undefined, pointerAnchorY: undefined, pointerStyle: undefined, pointerAnchorPoints: undefined });
      });
    }
  }
}
