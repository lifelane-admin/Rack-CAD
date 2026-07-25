import EventBus from '../core/event-bus';
import State from '../core/state';
import { ToolMode, SelectableItem, CableData, Point } from '../core/types';
import { computeSmartRouting, get3DefaultAnchors } from '../utils/routing';

export class FloatingToolbar {
  private element: HTMLElement | null = null;
  private currentTool: ToolMode = 'select';
  private selectedCableId: string | null = null;

  constructor() {
    this.init();
    this.setupListeners();
  }

  private init() {
    // Locate the canvas viewport to append our floating panel
    const viewport = document.getElementById('canvas-viewport');
    if (!viewport) return;

    this.element = document.createElement('div');
    this.element.id = 'floating-toolbar';
    this.element.className = 'floating-toolbar';
    viewport.appendChild(this.element);

    this.render();
  }

  private setupListeners() {
    // Listen for selection changes
    EventBus.on('selection:changed', (selection: SelectableItem[]) => {
      const cableSelection = selection.find(item => item.type === 'cable');
      this.selectedCableId = cableSelection ? cableSelection.id : null;
      this.render();
    });

    // Listen for tool changes
    EventBus.on('tool:changed', (tool: ToolMode) => {
      this.currentTool = tool;
      this.render();
    });

    // Listen for general state updates to handle updates to the selected cable's properties
    EventBus.on('state:changed', () => {
      this.render();
    });
  }

  private render() {
    if (!this.element) return;

    const state = State.getState();
    const cable = this.selectedCableId ? State.getCable(this.selectedCableId) : null;
    const isCableActive = this.currentTool === 'cable' || !!cable;

    // Build tool state flags
    const isSelect = this.currentTool === 'select';
    const isPan = this.currentTool === 'pan';
    const isCableMode = this.currentTool === 'cable';
    const isSnap = state.snapEnabled;

    // Define colors matching the network legend
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
      <!-- Section 1: Main View/CAD Tools -->
      <div class="ft-section" id="ft-tools">
        <button class="ft-btn ${isSelect ? 'active' : ''}" id="ft-tool-select" title="Select Tool (V)">🔲</button>
        <button class="ft-btn ${isPan ? 'active' : ''}" id="ft-tool-pan" title="Pan Tool (H)">✋</button>
        <button class="ft-btn ${isCableMode ? 'active' : ''}" id="ft-tool-cable" title="Draw Cable Tool (C)">🔗</button>
      </div>

      <div class="ft-separator"></div>

      <!-- Section 2: Quick CAD Actions (Undo, Redo, Snap, Delete) -->
      <div class="ft-section" id="ft-actions">
        <button class="ft-btn" id="ft-act-undo" title="Undo (Ctrl+Z)">↩️</button>
        <button class="ft-btn" id="ft-act-redo" title="Redo (Ctrl+Y)">↪️</button>
        <button class="ft-btn ${isSnap ? 'active' : ''}" id="ft-act-snap" title="Toggle Grid Snap (🧲)">🧲</button>
        <button class="ft-btn" id="ft-act-delete" ${!state.selection.length ? 'disabled' : ''} title="Delete Selected (Del)">🗑️</button>
      </div>

      <!-- Section 3: Contextual Cable & Anchor Actions (Only visible when cable is selected or drawing) -->
      <div class="ft-section ${isCableActive ? '' : 'collapsed'}" id="ft-cable-actions">
        <div class="ft-separator"></div>
        <span class="ft-context-label">Cable:</span>
        <button class="ft-btn" id="ft-cab-add-anchor" ${!cable ? 'disabled' : ''} title="Add Anchor Point">➕⚓</button>
        <button class="ft-btn" id="ft-cab-rem-anchor" ${!cable || !cable.anchorPoints?.length ? 'disabled' : ''} title="Remove Last Anchor">🗑️⚓</button>
        <button class="ft-btn ${cable && cable.anchorsLocked ? 'active' : ''}" id="ft-cab-lock" ${!cable ? 'disabled' : ''} title="${cable && cable.anchorsLocked ? 'Unlock Route' : 'Lock Route'}">
          ${cable && cable.anchorsLocked ? '🔒' : '🔓'}
        </button>
        <button class="ft-btn" id="ft-cab-reset" ${!cable ? 'disabled' : ''} title="Recalculate Route">🔄</button>
      </div>

      <!-- Section 4: Contextual Cable Swatches (Only visible when cable is selected or drawing) -->
      <div class="ft-section ${isCableActive ? '' : 'collapsed'}" id="ft-cable-colors">
        <div class="ft-separator"></div>
        <span class="ft-context-label">Color:</span>
        <div class="ft-colors">
          ${colors.map(c => `
            <div class="ft-swatch ${activeColor.toLowerCase() === c.hex.toLowerCase() ? 'active' : ''}" 
                 style="background-color: ${c.hex}; color: ${c.hex};" 
                 data-color="${c.hex}" 
                 title="${c.name}"></div>
          `).join('')}
        </div>
      </div>
    `;

    this.bindEvents();
  }

  private bindEvents() {
    if (!this.element) return;

    // Tool click handlers
    this.element.querySelector('#ft-tool-select')?.addEventListener('click', () => {
      EventBus.emit('tool:changed', 'select');
    });
    this.element.querySelector('#ft-tool-pan')?.addEventListener('click', () => {
      EventBus.emit('tool:changed', 'pan');
    });
    this.element.querySelector('#ft-tool-cable')?.addEventListener('click', () => {
      EventBus.emit('tool:changed', 'cable');
    });

    // Quick Action click handlers
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

    // Cable Anchor click handlers
    if (this.selectedCableId) {
      const cableId = this.selectedCableId;
      const cable = State.getCable(cableId);

      if (cable) {
        // Add Anchor handler
        this.element.querySelector('#ft-cab-add-anchor')?.addEventListener('click', () => {
          const sourcePos = cable.floatingSource || State.getPortWorldPosition(cable.sourcePortId) || { x: 0, y: 0 };
          const destPos = (cable.destPortId ? State.getPortWorldPosition(cable.destPortId) : cable.floatingDest) || { x: 0, y: 0 };
          const currentPts = [...(cable.anchorPoints && cable.anchorPoints.length > 0 ? cable.anchorPoints : get3DefaultAnchors(computeSmartRouting(cable, sourcePos, destPos)))];
          
          const lastPt = currentPts[currentPts.length - 1] || sourcePos;
          currentPts.push({ x: Math.round(lastPt.x + 25), y: Math.round(lastPt.y + 25) });
          EventBus.emit('cable:update', { id: cableId, data: { anchorPoints: currentPts, anchorsLocked: true } });
        });

        // Remove Last Anchor handler
        this.element.querySelector('#ft-cab-rem-anchor')?.addEventListener('click', () => {
          const sourcePos = cable.floatingSource || State.getPortWorldPosition(cable.sourcePortId) || { x: 0, y: 0 };
          const destPos = (cable.destPortId ? State.getPortWorldPosition(cable.destPortId) : cable.floatingDest) || { x: 0, y: 0 };
          const currentPts = [...(cable.anchorPoints && cable.anchorPoints.length > 0 ? cable.anchorPoints : get3DefaultAnchors(computeSmartRouting(cable, sourcePos, destPos)))];

          if (currentPts.length > 0) {
            currentPts.pop();
            EventBus.emit('cable:update', { id: cableId, data: { anchorPoints: currentPts, anchorsLocked: currentPts.length > 0 } });
          }
        });

        // Toggle Lock handler
        this.element.querySelector('#ft-cab-lock')?.addEventListener('click', () => {
          EventBus.emit('cable:update', { id: cableId, data: { anchorsLocked: !cable.anchorsLocked } });
        });

        // Recalculate Route handler
        this.element.querySelector('#ft-cab-reset')?.addEventListener('click', () => {
          EventBus.emit('cable:update', { id: cableId, data: { anchorPoints: [], anchorsLocked: false } });
          EventBus.emit('notification', { message: 'Reset custom routing paths for selected cable.', type: 'info' });
        });
      }
    }

    // Color Swatch click handlers
    this.element.querySelectorAll('.ft-swatch').forEach(swatch => {
      swatch.addEventListener('click', (e: any) => {
        const color = e.target.getAttribute('data-color');
        if (this.selectedCableId) {
          // Update selected cable's color immediately
          EventBus.emit('cable:update', { id: this.selectedCableId, data: { color } });
        } else {
          // Update active draw color for new cables
          State.setState({ selectedCableColor: color });
          EventBus.emit('notification', { message: `Active cable color changed.`, type: 'info' });
        }
      });
    });
  }
}
