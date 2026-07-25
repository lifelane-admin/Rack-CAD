import EventBus from '../core/event-bus';
import State from '../core/state';
import { ToolMode, SelectableItem, CableData, Point } from '../core/types';
import { computeSmartRouting, get3DefaultAnchors } from '../utils/routing';

export class FloatingToolbar {
  private element: HTMLElement | null = null;
  private currentTool: ToolMode = 'select';
  private selectedCableId: string | null = null;

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
    const isCableActive = this.currentTool === 'cable' || !!cable;

    const isSelect = this.currentTool === 'select';
    const isPan = this.currentTool === 'pan';
    const isCableMode = this.currentTool === 'cable';
    const isSnap = state.snapEnabled;

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
      <!-- Row 1: Drag handle, pointer tools, and quick actions -->
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
          <button class="ft-btn" id="ft-act-undo" title="Undo (Ctrl+Z)">↩️</button>
          <button class="ft-btn" id="ft-act-redo" title="Redo (Ctrl+Y)">↪️</button>
          <button class="ft-btn ${isSnap ? 'active' : ''}" id="ft-act-snap" title="Toggle Grid Snap (🧲)">🧲</button>
          <button class="ft-btn" id="ft-act-delete" ${!state.selection.length ? 'disabled' : ''} title="Delete Selected (Del)">🗑️</button>
        </div>
      </div>

      <!-- Row 2: Ethernet cable mode, colors, and anchor points -->
      <div class="ft-row" id="ft-row-2">
        <div class="ft-drag-handle" style="visibility: hidden;">⋮⋮</div> <!-- Invisible spacing alignment -->

        <!-- Cable Drawing Mode -->
        <div class="ft-section">
          <button class="ft-btn ${isCableMode ? 'active' : ''}" id="ft-tool-cable" title="Draw Ethernet Cable (C)">
            <svg viewBox="0 0 24 24">
              <rect x="6" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>
              <path d="M9 8V3M15 8V3M10 20v4M14 20v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>
        </div>

        <div class="ft-separator"></div>

        <!-- Anchor Point Actions -->
        <div class="ft-section" id="ft-cable-anchors">
          <span class="ft-context-label">Anchors:</span>
          <button class="ft-btn" id="ft-cab-add-anchor" ${!cable ? 'disabled' : ''} title="Add Anchor Point">➕⚓</button>
          <button class="ft-btn" id="ft-cab-rem-anchor" ${!cable || !cable.anchorPoints?.length ? 'disabled' : ''} title="Remove Last Anchor">🗑️⚓</button>
          <button class="ft-btn ${cable && cable.anchorsLocked ? 'active' : ''}" id="ft-cab-lock" ${!cable ? 'disabled' : ''} title="${cable && cable.anchorsLocked ? 'Unlock Route' : 'Lock Route'}">
            ${cable && cable.anchorsLocked ? '🔒' : '🔓'}
          </button>
          <button class="ft-btn" id="ft-cab-reset" ${!cable ? 'disabled' : ''} title="Recalculate Route">🔄</button>
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

    this.element.querySelector('#ft-act-undo')?.addEventListener('click', () => {
      EventBus.emit('edit:undo', undefined);
    });
    this.element.querySelector('#ft-act-redo')?.addEventListener('click', () => {
      EventBus.emit('edit:redo', undefined);
    });
    this.element.querySelector('#ft-act-snap')?.addEventListener('click', () => {
      EventBus.emit('view:toggle-snap', undefined);
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

        this.element.querySelector('#ft-cab-lock')?.addEventListener('click', () => {
          EventBus.emit('cable:update', { id: cableId, data: { anchorsLocked: !cable.anchorsLocked } });
        });

        this.element.querySelector('#ft-cab-reset')?.addEventListener('click', () => {
          EventBus.emit('cable:update', { id: cableId, data: { anchorPoints: [], anchorsLocked: false } });
          EventBus.emit('notification', { message: 'Reset custom routing paths for selected cable.', type: 'info' });
        });
      }
    }

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
