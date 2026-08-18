import EventBus from '../core/event-bus';
import State from '../core/state';
import { ToolMode, SelectableItem, CableData, Point } from '../core/types';
import { computeSmartRouting, get3DefaultAnchors } from '../utils/routing';

const ORIENTATION_CYCLE: Array<'up' | 'right' | 'down' | 'left'> = ['up', 'right', 'down', 'left'];

export class FloatingToolbar {
  private element: HTMLElement | null = null;
  private currentTool: ToolMode = 'select';
  private selectedCableId: string | null = null;
  private selectedPointerLabelId: string | null = null;
  private activeCableEnd: 'source' | 'dest' = 'dest';

  // Toolbar position dragging states
  private toolbarX: number | null = null;
  private toolbarY: number | null = null;
  private isRepositioning = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;

  constructor() {
    this.init();
    this.setupListeners();
  }

  private init() {
    const viewport = document.getElementById('canvas-viewport');
    if (!viewport) return;

    this.element = document.createElement('div');
    this.element.id = 'floating-toolbar';
    this.element.className = 'floating-toolbar';
    viewport.appendChild(this.element);

    this.render();
    this.setupRepositionDrag();
  }

  private setupListeners() {
    EventBus.on('selection:changed', (selection: SelectableItem[]) => {
      const cableSelection = selection.find(item => item.type === 'cable');
      this.selectedCableId = cableSelection ? cableSelection.id : null;
      // A pointer-carrying text label with pointerStyle 'flexible' reuses the Add/Remove Anchor
      // buttons below exactly like a cable does — only relevant when no cable is selected.
      const textSelection = selection.find(item => item.type === 'text');
      const textLabel = textSelection ? State.getState().textLabels.find(t => t.id === textSelection.id) : null;
      this.selectedPointerLabelId = (textLabel?.pointerDeviceId && textLabel.pointerStyle === 'flexible') ? textLabel.id : null;
      this.render();
    });

    EventBus.on('tool:changed', (tool: ToolMode) => {
      this.currentTool = tool;
      this.render();
    });

    EventBus.on('state:changed', () => {
      this.render();
    });
  }

  private setupRepositionDrag() {
    if (!this.element) return;

    const handleMousedown = (e: MouseEvent) => {
      const handle = (e.target as HTMLElement).closest('.ft-drag-handle');
      if (!handle || !this.element) return;

      e.preventDefault();
      this.isRepositioning = true;

      const rect = this.element.getBoundingClientRect();
      this.dragOffsetX = e.clientX - rect.left;
      this.dragOffsetY = e.clientY - rect.top;

      const handleMousemove = (moveEvent: MouseEvent) => {
        if (!this.isRepositioning || !this.element) return;

        const viewport = document.getElementById('canvas-viewport');
        if (!viewport) return;

        const viewportRect = viewport.getBoundingClientRect();
        let left = moveEvent.clientX - viewportRect.left - this.dragOffsetX;
        let top = moveEvent.clientY - viewportRect.top - this.dragOffsetY;

        // Constraint checking
        left = Math.max(0, Math.min(left, viewportRect.width - rect.width));
        top = Math.max(0, Math.min(top, viewportRect.height - rect.height));

        this.toolbarX = left;
        this.toolbarY = top;
        this.applyPosition();
      };

      const handleMouseup = () => {
        this.isRepositioning = false;
        window.removeEventListener('mousemove', handleMousemove);
        window.removeEventListener('mouseup', handleMouseup);
      };

      window.addEventListener('mousemove', handleMousemove);
      window.addEventListener('mouseup', handleMouseup);
    };

    this.element.addEventListener('mousedown', handleMousedown);
  }

  private applyPosition() {
    if (!this.element) return;
    if (this.toolbarX !== null && this.toolbarY !== null) {
      this.element.style.left = `${this.toolbarX}px`;
      this.element.style.top = `${this.toolbarY}px`;
      this.element.style.bottom = 'auto';
      this.element.style.transform = 'none';
    }
  }

  private render() {
    if (!this.element) return;

    const state = State.getState();
    const cable = this.selectedCableId ? State.getCable(this.selectedCableId) : null;
    const pointerLabel = this.selectedPointerLabelId ? state.textLabels.find(t => t.id === this.selectedPointerLabelId) : null;
    // The Add/Remove Anchor buttons operate on whichever of the two is actually selected — a
    // cable takes priority since a label can't be selected at the same time as a cable anyway.
    const anchorTarget = cable ?? pointerLabel;
    const isCableActive = this.currentTool === 'cable' || !!cable;

    const isSelect = this.currentTool === 'select';
    const isPan = this.currentTool === 'pan';
    const isCableMode = this.currentTool === 'cable';
    const isPowerMode = this.currentTool === 'power';
    const isTextMode = this.currentTool === 'text';
    const isLabelMode = this.currentTool === 'label';
    const isAirdropDestination = state.airdropDestination;
    const isSnap = state.snapEnabled;
    const show3D = state.show3DPanel;

    const colors = [
      { hex: '#fb8c00', name: 'VM Traffic (Orange)' },
      { hex: '#43a047', name: 'Ceph Primary (Green)' },
      { hex: '#8e24aa', name: 'Ceph Secondary (Purple)' },
      { hex: '#fdd835', name: 'Live Migration (Yellow)' },
      { hex: '#e53935', name: 'iDRAC Management (Red)' },
      { hex: '#1e88e5', name: 'Backup PBS (Blue)' },
      { hex: '#78909c', name: 'General Traffic (Grey)' }
    ];

    const activeColor = cable ? cable.color : state.selectedCableColor;

    this.element.innerHTML = `
      <!-- Row 1: Drag handle, pointer tools, edit actions, and anchor points -->
      <div class="ft-row" id="ft-row-1">
        <div class="ft-drag-handle" title="Drag to reposition toolbar">⋮⋮</div>

        <!-- Selection & Pan Tools -->
        <div class="ft-section">
          <button class="ft-btn ${isSelect ? 'active' : ''}" id="ft-tool-select" title="Select Tool (V)">
            <svg viewBox="0 0 24 24">
              <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" fill="currentColor"/>
              <path d="M13 13l6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>
          <button class="ft-btn ${isPan ? 'active' : ''}" id="ft-tool-pan" title="Pan Tool (H)">✋</button>
        </div>

        <div class="ft-separator"></div>

        <!-- Quick actions -->
        <div class="ft-section">
          <button class="ft-btn ft-btn--accent" id="ft-act-undo" title="Undo (Ctrl+Z)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"/></svg>
          </button>
          <button class="ft-btn ft-btn--accent" id="ft-act-redo" title="Redo (Ctrl+Y)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7v6h-6M3 17a9 9 0 019-9 9 9 0 016 2.3l3 2.7"/></svg>
          </button>
          <button class="ft-btn" id="ft-act-delete" ${!state.selection.length ? 'disabled' : ''} title="Delete Selected (Del)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </button>
        </div>

        <div class="ft-separator"></div>

        <!-- Anchor Point Actions — operate on a selected cable OR a selected flexible-style
             device-pointer label (see anchorTarget above) -->
        <div class="ft-section" id="ft-cable-anchors">
          <button class="ft-btn" id="ft-cab-add-anchor" ${!anchorTarget ? 'disabled' : ''} title="Add Anchor Point">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="5" r="2.5"/><line x1="9" y1="19" x2="9" y2="7"/><path d="M3 13a6 6 0 0012 0"/><line x1="18" y1="5" x2="18" y2="11"/><line x1="15" y1="8" x2="21" y2="8"/></svg>
          </button>
          <button class="ft-btn" id="ft-cab-rem-anchor" ${(!cable || !cable.anchorPoints?.length) && (!pointerLabel || !pointerLabel.pointerAnchorPoints?.length) ? 'disabled' : ''} title="Remove Last Anchor">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="5" r="2.5"/><line x1="9" y1="19" x2="9" y2="7"/><path d="M3 13a6 6 0 0012 0"/><line x1="15" y1="8" x2="21" y2="8"/></svg>
          </button>
          <button class="ft-btn ft-btn--accent ${isTextMode ? 'active' : ''}" id="ft-tool-text" title="Add Text Box / Label (T)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 5h16"/>
              <path d="M12 5v14"/>
              <path d="M9 19h6"/>
            </svg>
          </button>
          <button class="ft-btn ft-btn--accent ${isLabelMode ? 'active' : ''}" id="ft-tool-label" title="Add Label pointing at a device (L)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="10" y="3" width="11" height="6" rx="1.5"/>
              <path d="M10 6L3 12"/>
              <circle cx="3" cy="12" r="1.5" fill="currentColor" stroke="none"/>
            </svg>
          </button>
          <button class="ft-btn ft-btn--accent" id="ft-insert-image" title="Insert Image (logo / reference image, PNG transparency supported)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <path d="M21 15l-5-5L5 21"/>
            </svg>
          </button>
        </div>

        <div class="ft-separator"></div>

        <!-- 3D panel toggle — rack view only, shows/hides the Three.js panel next to the 2D
             elevation (see App.setShow3DPanel). No Cloud Architecture canvas equivalent. -->
        <div class="ft-section" id="ft-3d-toggle">
          <span class="ft-context-label">3D</span>
          <button class="ft-toggle-switch ${show3D ? 'on' : ''}" id="ft-toggle-3d-panel" role="switch" aria-checked="${show3D}" title="${show3D ? 'Disable' : 'Enable'} 3D Rack View">
            <span class="ft-toggle-knob"></span>
          </button>
        </div>
      </div>

      <!-- Row 2: Routing/drawing modes and cable colors -->
      <div class="ft-row" id="ft-row-2">
        <div class="ft-drag-handle" style="visibility: hidden;">⋮⋮</div> <!-- Invisible spacing alignment -->

        <!-- Cable End Direction (choose end, then rotate Up->Right->Down->Left) + Cable/Power Drawing Modes -->
        <div class="ft-section" id="ft-cable-orient">
          <div class="ft-end-toggle" title="Choose which cable end to rotate">
            <button class="ft-end-btn ${this.activeCableEnd === 'source' ? 'active' : ''}" id="ft-end-source" ${!cable ? 'disabled' : ''} title="Target the Source end">S</button>
            <button class="ft-end-btn ${this.activeCableEnd === 'dest' ? 'active' : ''}" id="ft-end-dest" ${!cable ? 'disabled' : ''} title="Target the Destination end">D</button>
          </div>
          <button class="ft-btn" id="ft-cab-rotate-end" ${!cable ? 'disabled' : ''} title="Rotate ${this.activeCableEnd === 'source' ? 'Source' : 'Destination'} End Direction (Up → Right → Down → Left)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 11-.57-8.38l6.13-5.19"/></svg>
          </button>
        </div>

        <div class="ft-separator"></div>

        <div class="ft-section">
          <button class="ft-btn ft-btn--accent ${isCableMode ? 'active' : ''}" id="ft-tool-cable" title="Draw Ethernet Cable (C)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="3" width="6" height="6" rx="1"></rect>
              <rect x="3" y="15" width="6" height="6" rx="1"></rect>
              <rect x="15" y="15" width="6" height="6" rx="1"></rect>
              <path d="M12 9v4M6 15v-2h12v2"></path>
            </svg>
          </button>
          <button class="ft-btn ft-btn--accent ${isPowerMode ? 'active' : ''}" id="ft-tool-power" title="Draw Power Cable to PDU (P)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 2v4M15 2v4"/>
              <path d="M7 6h10v4a5 5 0 01-10 0V6z"/>
              <path d="M12 15v7"/>
            </svg>
          </button>
          <button class="ft-btn ft-btn--accent ${isAirdropDestination ? 'active' : ''}" id="ft-toggle-airdrop-dest" title="Airdrop Destination — while drawing a cable from a real source port, finish it anywhere on the canvas (any rack, any spot) instead of requiring a real destination port">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2v10"/>
              <path d="M8 8l4 4 4-4"/>
              <rect x="5" y="15" width="14" height="7" rx="1.5"/>
              <circle cx="9" cy="18.5" r="1"/>
              <circle cx="15" cy="18.5" r="1"/>
            </svg>
          </button>
        </div>

        <div class="ft-separator"></div>

        <!-- Cable Colors Swatches -->
        <div class="ft-section" id="ft-cable-colors">
          <span class="ft-context-label">Colors:</span>
          <div class="ft-colors">
            ${colors.map(c => `
              <div class="ft-swatch ${activeColor.toLowerCase() === c.hex.toLowerCase() ? 'active' : ''}"
                   style="background-color: ${c.hex}; color: ${c.hex};"
                   data-color="${c.hex}"
                   title="${c.name}"></div>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    this.applyPosition();
    this.bindEvents();
  }

  private bindEvents() {
    if (!this.element) return;

    this.element.querySelector('#ft-tool-select')?.addEventListener('click', () => {
      EventBus.emit('tool:changed', 'select');
    });
    this.element.querySelector('#ft-tool-pan')?.addEventListener('click', () => {
      EventBus.emit('tool:changed', 'pan');
    });
    this.element.querySelector('#ft-tool-cable')?.addEventListener('click', () => {
      EventBus.emit('tool:changed', 'cable');
    });
    this.element.querySelector('#ft-tool-power')?.addEventListener('click', () => {
      EventBus.emit('tool:changed', 'power');
    });
    this.element.querySelector('#ft-tool-text')?.addEventListener('click', () => {
      EventBus.emit('tool:changed', 'text');
    });
    this.element.querySelector('#ft-tool-label')?.addEventListener('click', () => {
      EventBus.emit('tool:changed', 'label');
    });
    this.element.querySelector('#ft-insert-image')?.addEventListener('click', () => {
      EventBus.emit('image:insert' as any, undefined);
    });
    this.element.querySelector('#ft-toggle-airdrop-dest')?.addEventListener('click', () => {
      EventBus.emit('cable:toggle-airdrop-destination', undefined);
    });
    this.element.querySelector('#ft-toggle-3d-panel')?.addEventListener('click', () => {
      EventBus.emit('view:toggle-3d-panel', undefined);
    });
    this.element.querySelector('#ft-act-undo')?.addEventListener('click', () => {
      EventBus.emit('edit:undo', undefined);
    });
    this.element.querySelector('#ft-act-redo')?.addEventListener('click', () => {
      EventBus.emit('edit:redo', undefined);
    });
    this.element.querySelector('#ft-act-delete')?.addEventListener('click', () => {
      EventBus.emit('edit:delete', undefined);
    });

    if (this.selectedCableId) {
      const cableId = this.selectedCableId;
      const cable = State.getCable(cableId);

      if (cable) {
        this.element.querySelector('#ft-cab-add-anchor')?.addEventListener('click', () => {
          const sourcePos = cable.floatingSource || State.getPortWorldPosition(cable.sourcePortId) || { x: 0, y: 0 };
          const destPos = (cable.destPortId ? State.getPortWorldPosition(cable.destPortId) : cable.floatingDest) || { x: 0, y: 0 };
          const currentPts = [...(cable.anchorPoints && cable.anchorPoints.length > 0 ? cable.anchorPoints : get3DefaultAnchors(computeSmartRouting(cable, sourcePos, destPos)))];
          
          const lastPt = currentPts[currentPts.length - 1] || sourcePos;
          currentPts.push({ x: Math.round(lastPt.x + 25), y: Math.round(lastPt.y + 25) });
          EventBus.emit('cable:update', { id: cableId, data: { anchorPoints: currentPts, anchorsLocked: true } });
        });

        this.element.querySelector('#ft-cab-rem-anchor')?.addEventListener('click', () => {
          const sourcePos = cable.floatingSource || State.getPortWorldPosition(cable.sourcePortId) || { x: 0, y: 0 };
          const destPos = (cable.destPortId ? State.getPortWorldPosition(cable.destPortId) : cable.floatingDest) || { x: 0, y: 0 };
          const currentPts = [...(cable.anchorPoints && cable.anchorPoints.length > 0 ? cable.anchorPoints : get3DefaultAnchors(computeSmartRouting(cable, sourcePos, destPos)))];

          if (currentPts.length > 0) {
            currentPts.pop();
            EventBus.emit('cable:update', { id: cableId, data: { anchorPoints: currentPts, anchorsLocked: currentPts.length > 0 } });
          }
        });

        this.element.querySelector('#ft-cab-rotate-end')?.addEventListener('click', () => {
          const field = this.activeCableEnd === 'source' ? 'sourceOrientation' : 'destOrientation';
          const current = cable[field];
          const idx = ORIENTATION_CYCLE.indexOf(current as any);
          const next = ORIENTATION_CYCLE[(idx + 1) % ORIENTATION_CYCLE.length];
          EventBus.emit('cable:update', { id: cableId, data: { [field]: next, anchorPoints: [], anchorsLocked: false } });
        });
      }
    } else if (this.selectedPointerLabelId) {
      // Same two buttons, retargeted at a selected flexible-style device-pointer label's
      // pointerAnchorPoints instead of a cable's anchorPoints.
      const labelId = this.selectedPointerLabelId;
      const label = State.getState().textLabels.find(t => t.id === labelId);

      if (label && label.pointerDeviceId) {
        this.element.querySelector('#ft-cab-add-anchor')?.addEventListener('click', () => {
          const origin = State.getDeviceWorldOrigin(label.pointerDeviceId!);
          const deviceWorld = origin ? { x: origin.x + (label.pointerAnchorX ?? 0), y: origin.y + (label.pointerAnchorY ?? 0) } : { x: label.x, y: label.y };
          const currentPts = [...(label.pointerAnchorPoints ?? [])];
          const lastPt = currentPts[currentPts.length - 1] || deviceWorld;
          currentPts.push({ x: Math.round(lastPt.x + 25), y: Math.round(lastPt.y + 25) });
          EventBus.emit('textlabel:update', { id: labelId, data: { pointerAnchorPoints: currentPts } });
        });

        this.element.querySelector('#ft-cab-rem-anchor')?.addEventListener('click', () => {
          const currentPts = [...(label.pointerAnchorPoints ?? [])];
          if (currentPts.length > 0) {
            currentPts.pop();
            EventBus.emit('textlabel:update', { id: labelId, data: { pointerAnchorPoints: currentPts } });
          }
        });
      }
    }

    this.element.querySelector('#ft-end-source')?.addEventListener('click', () => {
      this.activeCableEnd = 'source';
      this.render();
    });
    this.element.querySelector('#ft-end-dest')?.addEventListener('click', () => {
      this.activeCableEnd = 'dest';
      this.render();
    });

    this.element.querySelectorAll('.ft-swatch').forEach(swatch => {
      swatch.addEventListener('click', (e: any) => {
        const color = e.target.getAttribute('data-color');
        if (this.selectedCableId) {
          EventBus.emit('cable:update', { id: this.selectedCableId, data: { color } });
        } else {
          State.setState({ selectedCableColor: color });
          EventBus.emit('notification', { message: `Active cable color changed.`, type: 'info' });
        }
      });
    });
  }
}
