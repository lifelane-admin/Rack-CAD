/**
 * Application Orchestrator
 * Ties together all modules: canvas, renderers, UI components, state, and events.
 */
import { eventBus } from './core/event-bus';
import { stateManager } from './core/state';
import { CanvasManager } from './core/canvas';
import { historyManager } from './core/history';
import { Toolbar } from './components/toolbar';
import { Sidebar } from './components/sidebar';
import { PropertiesPanel } from './components/properties';
import { StatusBar } from './components/statusbar';
import { ContextMenu, MenuItem } from './components/context-menu';
import { ReportsPanel } from './components/reports-panel';
import { FloatingToolbar } from './components/floating-toolbar';
import { renderRack } from './renderers/rack-renderer';
import { renderDevice } from './renderers/device-renderer';
import { renderCable, renderCableInProgress } from './renderers/cable-renderer';
import { renderDashboardWidgets } from './renderers/dashboard-renderer';
import { getTemplate } from './library/device-catalog';
import { generateId, distToSegment } from './utils/geometry';
import { initExportHandlers } from './utils/export';
import { computeSmartRouting, get3DefaultAnchors } from './utils/routing';
import {
  RackData, DeviceData, PortData, CableData, LegendItem,
  RACK_CONSTANTS, CABLE_COLORS, CableType, SelectableItem, Point, ToolMode
} from './core/types';

export class App {
  private canvas!: CanvasManager;
  private toolbar!: Toolbar;
  private sidebar!: Sidebar;
  private properties!: PropertiesPanel;
  private statusbar!: StatusBar;
  private contextMenu!: ContextMenu;
  private floatingToolbar!: FloatingToolbar;

  // Interaction state
  private spacePressed = false;
  private mouseWorldPos: Point = { x: 0, y: 0 };
  private selectedCableType: CableType = 'general';

  // Device dragging state
  private isDraggingDevice = false;
  private draggedDeviceId: string | null = null;
  private dragStartWorldPos: Point = { x: 0, y: 0 };
  private dragStartUnit = 1;
  private dragStartRackId = '';

  // Cable dragging state
  private isDraggingCableEnd = false;
  private draggedCableId: string | null = null;
  private draggedHandleType: 'source' | 'dest' | null = null;

  // Anchor point dragging state
  private isDraggingAnchor = false;
  private draggedAnchorCableId: string | null = null;
  private draggedAnchorIndex: number = -1;

  // History tracking states for atomic drag undo
  private dragStartDevicesState: DeviceData[] | null = null;
  private dragStartCablesState: CableData[] | null = null;

  init() {
    // Initialize canvas
    this.canvas = new CanvasManager('canvas-viewport', 'canvas');

    // Initialize UI components
    const toolbarEl = document.getElementById('toolbar')!;
    const sidebarEl = document.getElementById('sidebar')!;
    const propertiesEl = document.getElementById('properties-panel')!;
    const statusbarEl = document.getElementById('statusbar')!;
    const contextMenuEl = document.getElementById('context-menu')!;

    this.toolbar = new Toolbar(toolbarEl);
    this.sidebar = new Sidebar(sidebarEl);
    this.properties = new PropertiesPanel(propertiesEl);
    this.statusbar = new StatusBar(statusbarEl);
    this.contextMenu = new ContextMenu(contextMenuEl);
    
    // Initialize Reports & Documentation Panel
    const reportsPanel = new ReportsPanel();

    // Initialize Floating Quick Access Toolbar
    this.floatingToolbar = new FloatingToolbar();

    // Render UI
    this.toolbar.render();
    this.sidebar.render();
    this.properties.render();
    this.statusbar.render();

    // Setup event bridges
    this.setupToolbarBridge();
    this.setupCanvasInteractions();
    this.setupDragDrop();
    this.setupKeyboardShortcuts();
    this.setupSelectionHandling();
    this.setupContextMenuHandling();

    // Setup export handlers
    initExportHandlers();

    // Initial render
    this.renderAll();

    // Listen for state changes that require re-render
    eventBus.on('rack:added', () => this.renderAll());
    eventBus.on('rack:removed', () => this.renderAll());
    eventBus.on('rack:update', ({ id, data }) => {
      const racks = stateManager.getState().racks.map(r => r.id === id ? { ...r, ...data } : r);
      stateManager.setState({ racks });
      this.renderAll();
    });
    eventBus.on('device:added', () => this.renderAll());
    eventBus.on('device:removed', () => this.renderAll());
    eventBus.on('device:update', ({ id, data }) => {
      const device = stateManager.getDevice(id);
      if (!device) return;

      const newRackId = data.rackId !== undefined ? data.rackId : device.rackId;
      const newStartUnit = data.startUnit !== undefined ? data.startUnit : device.startUnit;

      if (newRackId !== device.rackId || newStartUnit !== device.startUnit) {
        const template = getTemplate(device.templateId);
        const height = template ? template.heightUnits : 1;
        const rack = stateManager.getRack(newRackId);
        if (!rack) return;

        if (newStartUnit < 1 || newStartUnit + height - 1 > rack.units) {
          eventBus.emit('notification', { message: 'Position exceeds rack boundaries', type: 'warning' });
          this.properties.update(stateManager.getState().selection);
          return;
        }

        const otherDevices = stateManager.getState().devices.filter(d => d.id !== id && d.rackId === newRackId);
        let occupied = false;
        for (const od of otherDevices) {
          const odTemplate = getTemplate(od.templateId);
          const odHeight = odTemplate ? odTemplate.heightUnits : 1;
          if (newStartUnit < od.startUnit + odHeight && newStartUnit + height > od.startUnit) {
            occupied = true;
            break;
          }
        }

        if (occupied) {
          eventBus.emit('notification', { 
            message: `Cannot move device: Rack Unit slots are occupied.`, 
            type: 'warning' 
          });
          this.properties.update(stateManager.getState().selection);
          return;
        }
      }

      const devices = stateManager.getState().devices.map(d => d.id === id ? { ...d, ...data } : d);
      stateManager.setState({ devices });
      this.renderAll();
      this.properties.update(stateManager.getState().selection);
    });
    eventBus.on('cable:added', () => this.renderAll());
    eventBus.on('cable:removed', () => this.renderAll());
    eventBus.on('cable:update', ({ id, data }) => {
      const cables = stateManager.getState().cables.map(c => c.id === id ? { ...c, ...data } : c);
      stateManager.setState({ cables });
      this.renderAll();
    });
    eventBus.on('cable:batch-generate', ({ deviceId, side, type, color, count }) => {
      const s = stateManager.getState();
      const device = stateManager.getDevice(deviceId);
      if (!device) return;

      const rack = stateManager.getRack(device.rackId);
      if (!rack) return;

      // Find compatible unconnected ports
      const matchesType = (portType: string) => {
        const pt = portType.toLowerCase();
        if (type === 'power') {
          return ['power', 'c13', 'c14', 'c19', 'c20', 'inlet', 'outlet', 'plug'].some(term => pt.includes(term));
        } else if (type === 'ceph-primary') {
          return ['sfp', 'sfp-plus', 'sfp28', 'qsfp', 'qsfp28', 'lc', 'sc'].some(term => pt.includes(term));
        } else {
          return ['rj45', 'management', 'console'].includes(pt);
        }
      };

      const availablePorts = device.ports.filter(p => !p.connected && matchesType(p.type));
      if (availablePorts.length === 0) {
        eventBus.emit('notification', { 
          message: `No unconnected ports of the selected type were found on this server!`, 
          type: 'error' 
        });
        return;
      }

      const numToGenerate = Math.min(count, availablePorts.length);
      const generatedCables: CableData[] = [];
      const updatedPorts = [...device.ports];

      // Gutter visual snap coordinate
      const isLeft = side === 'left';
      const gutterX = isLeft 
        ? rack.x - (rack.leftCableManagerWidth === '6-inch' ? 26 : 19)
        : rack.x + RACK_CONSTANTS.RACK_OUTER_WIDTH + (rack.rightCableManagerWidth === '6-inch' ? 26 : 19);

      for (let i = 0; i < numToGenerate; i++) {
        const port = availablePorts[i];
        const portIdx = updatedPorts.findIndex(p => p.id === port.id);
        
        const portWorldPos = stateManager.getPortWorldPosition(port.id)!;
        const cableId = generateId();

        const newCable: CableData = {
          id: cableId,
          name: `${type.toUpperCase()} Cable ${s.cables.length + generatedCables.length + 1}`,
          type,
          color,
          sourcePortId: port.id,
          destPortId: null,
          bendPoints: [],
          thickness: RACK_CONSTANTS.CABLE_THICKNESS,
          bendRadius: RACK_CONSTANTS.CABLE_BEND_RADIUS,
          bundleId: null,
          notes: '',
          floatingDest: { x: gutterX, y: portWorldPos.y },
          sidePreference: side,
          sourceTermination: type === 'power' ? 'C13/C14 Power' : type === 'ceph-primary' ? 'LC-Fiber Connector' : 'RJ45 Ethernet',
          destTermination: type === 'power' ? 'C13/C14 Power' : type === 'ceph-primary' ? 'LC-Fiber Connector' : 'RJ45 Ethernet'
        };

        generatedCables.push(newCable);
        updatedPorts[portIdx] = { ...port, connected: true, cableId };
      }

      const devices = s.devices.map(d => d.id === deviceId ? { ...d, ports: updatedPorts } : d);
      const cables = [...s.cables, ...generatedCables];
      
      const selection = generatedCables.length > 0 
        ? [{ type: 'cable' as const, id: generatedCables[0].id }]
        : s.selection;

      stateManager.setState({ devices, cables, selection });
      
      eventBus.emit('selection:changed', selection);
      this.renderAll();
      this.properties.update(selection);

      eventBus.emit('notification', { 
        message: `Successfully generated ${numToGenerate} cables! Select a cable and drag its glowing handle to plug it into a port.`, 
        type: 'success' 
      });
    });
    // Set dark theme on body
    document.body.setAttribute('data-theme', stateManager.getState().theme);

    console.log('RackCAD initialized');
  }

  /**
   * Bridge toolbar component events (non-standard names) to actual state operations.
   */
  private setupToolbarBridge() {
    // Tool changes
    eventBus.on('tool:changed', (mode: ToolMode) => {
      stateManager.setState({ tool: mode });
      this.updateCanvasCursor(mode);
    });

    // File operations
    (eventBus as any).on('file:new', () => {
      if (confirm('Create a new project? All unsaved changes will be lost.')) {
        stateManager.setState({
          racks: [
            { id: generateId(), name: 'Rack 1', units: 42, x: 200, y: 100, showPduLeft: true, showPduRight: true },
            { id: generateId(), name: 'Rack 2', units: 42, x: 700, y: 100, showPduLeft: true, showPduRight: true }
          ],
          devices: [],
          cables: [],
          selection: [],
        });
        this.renderAll();
      }
    });

    (eventBus as any).on('file:demo', () => {
      stateManager.loadDemoProject();
      this.renderAll();
    });

    (eventBus as any).on('file:save', () => {
      eventBus.emit('export:json', undefined as any);
    });

    (eventBus as any).on('file:open', (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        eventBus.emit('project:load', reader.result as string);
        this.renderAll();
      };
      reader.readAsText(file);
    });

    // View operations
    (eventBus as any).on('view:zoom-in', () => {
      const t = this.canvas.getTransform();
      this.canvas.zoomTo(t.scale * 1.25);
    });

    (eventBus as any).on('view:zoom-out', () => {
      const t = this.canvas.getTransform();
      this.canvas.zoomTo(t.scale / 1.25);
    });

    (eventBus as any).on('view:toggle-grid', () => {
      const s = stateManager.getState();
      stateManager.setState({ gridVisible: !s.gridVisible });
      const gridLayer = this.canvas.getLayer('grid-layer');
      if (gridLayer) gridLayer.style.display = s.gridVisible ? 'none' : '';
    });

    (eventBus as any).on('view:toggle-snap', () => {
      const s = stateManager.getState();
      stateManager.setState({ snapEnabled: !s.snapEnabled });
    });

    (eventBus as any).on('view:toggle-rulers', () => {
      const s = stateManager.getState();
      stateManager.setState({ rulersVisible: !s.rulersVisible });
      const hr = document.getElementById('ruler-horizontal');
      const vr = document.getElementById('ruler-vertical');
      const rc = document.getElementById('ruler-corner');
      if (hr) hr.style.display = s.rulersVisible ? 'none' : '';
      if (vr) vr.style.display = s.rulersVisible ? 'none' : '';
      if (rc) rc.style.display = s.rulersVisible ? 'none' : '';
    });

    (eventBus as any).on('view:toggle-theme', () => {
      const s = stateManager.getState();
      const newTheme = s.theme === 'dark' ? 'light' : 'dark';
      stateManager.setState({ theme: newTheme });
      document.body.setAttribute('data-theme', newTheme);
    });

    (eventBus as any).on('view:toggle-legends', () => {
      const s = stateManager.getState();
      stateManager.setState({ showLegends: !s.showLegends });
      this.renderAll();
    });

    (eventBus as any).on('legend:edit', () => {
      this.showLegendCustomizerModal();
    });

    // Reset cable routing — clears all cached anchorPoints so fresh side-hole routing is applied
    (eventBus as any).on('cable:reset-routing', () => {
      const s = stateManager.getState();
      const cables = s.cables.map(c => ({ ...c, anchorPoints: undefined, anchorsLocked: false }));
      stateManager.setState({ cables });
      this.renderAll();
      eventBus.emit('notification', { message: 'All cable routes recalculated through side holes!', type: 'success' });
    });

    // Rack add
    (eventBus as any).on('rack:add', (data: { units: 42 | 48 }) => {
      const rackCount = stateManager.getState().racks.length;
      const newRack: RackData = {
        id: generateId(),
        name: `Rack ${rackCount + 1}`,
        units: data.units,
        x: 200 + rackCount * 500,
        y: 100
      };
      stateManager.addRack(newRack);
    });

    // Edit operations
    (eventBus as any).on('edit:undo', () => {
      stateManager.undo();
      this.renderAll();
      this.properties.update(stateManager.getState().selection);
    });
    (eventBus as any).on('edit:redo', () => {
      stateManager.redo();
      this.renderAll();
      this.properties.update(stateManager.getState().selection);
    });
    (eventBus as any).on('edit:delete', () => this.deleteSelection());

    // Transform tracking for status bar
    eventBus.on('canvas:transformed', (transform) => {
      (eventBus as any).emit('canvas:zoom', transform.scale);
    });
  }

  /**
   * Setup canvas interactions: clicking on elements, cable creation, etc.
   */
  private setupCanvasInteractions() {
    const svgEl = document.getElementById('canvas') as unknown as SVGSVGElement;
    if (!svgEl) return;

    // Track mouse position for status bar
    svgEl.addEventListener('mousemove', (e) => {
      this.mouseWorldPos = this.canvas.screenToWorld({ x: e.clientX, y: e.clientY });
      (eventBus as any).emit('canvas:mousemove', this.mouseWorldPos);

      // Anchor point drag handling (highest priority mid-drag)
      if (this.isDraggingAnchor && this.draggedAnchorCableId !== null) {
        const cableId = this.draggedAnchorCableId;
        const idx = this.draggedAnchorIndex;
        const sState = stateManager.getState();
        const targetCable = stateManager.getCable(cableId);
        
        if (targetCable) {
          const sourcePos = targetCable.floatingSource || stateManager.getPortWorldPosition(targetCable.sourcePortId) || { x: 0, y: 0 };
          const destPos = (targetCable.destPortId ? stateManager.getPortWorldPosition(targetCable.destPortId) : targetCable.floatingDest) || { x: 0, y: 0 };
          const baseAnchors = (targetCable.anchorPoints && targetCable.anchorPoints.length > 0)
            ? targetCable.anchorPoints
            : get3DefaultAnchors(computeSmartRouting(targetCable, sourcePos, destPos));
          
          const updatedAnchors = baseAnchors.map((p: Point, i: number) =>
            i === idx ? { ...this.mouseWorldPos } : p
          );

          const cables = sState.cables.map(c =>
            c.id === cableId ? { ...c, anchorPoints: updatedAnchors, anchorsLocked: true } : c
          );
          stateManager.setState({ cables }, true);
          this.renderAll();
          return;
        }
      }

      // Cable end drag handling (either source or dest tip)
      if (this.isDraggingCableEnd && this.draggedCableId) {
        const cables = stateManager.getState().cables.map(c => {
          if (c.id !== this.draggedCableId) return c;
          if (this.draggedHandleType === 'source') {
            return { ...c, floatingSource: this.mouseWorldPos };
          } else {
            return { ...c, floatingDest: this.mouseWorldPos };
          }
        });
        stateManager.setState({ cables }, true);
        // Highlight nearest snappable port for visual feedback
        this.highlightNearestPort(this.mouseWorldPos, this.draggedCableId);
        this.renderAll();
        return;
      }

      // Cable in progress - update preview and neon-highlight nearest port
      const s = stateManager.getState();
      if (s.cableInProgress) {
        svgEl.classList.add('cable-laying');
        this.highlightNearestPort(this.mouseWorldPos, null, s.cableInProgress.sourcePortId);
        this.updateCablePreview(this.mouseWorldPos);
      } else {
        svgEl.classList.remove('cable-laying');
      }

      // Device drag handling
      if (this.isDraggingDevice && this.draggedDeviceId) {
        const dy = this.mouseWorldPos.y - this.dragStartWorldPos.y;
        const ruOffset = Math.round(-dy / RACK_CONSTANTS.RU_HEIGHT);
        let targetUnit = this.dragStartUnit + ruOffset;
        
        let targetRackId = this.dragStartRackId;
        for (const rack of s.racks) {
          const rackLeft = rack.x;
          const rackRight = rack.x + RACK_CONSTANTS.RACK_OUTER_WIDTH;
          if (this.mouseWorldPos.x >= rackLeft && this.mouseWorldPos.x <= rackRight) {
            targetRackId = rack.id;
            break;
          }
        }
        
        const targetRack = stateManager.getRack(targetRackId);
        if (targetRack) {
          const device = stateManager.getDevice(this.draggedDeviceId);
          if (device) {
            const template = getTemplate(device.templateId);
            const height = template ? template.heightUnits : 1;
            targetUnit = Math.max(1, Math.min(targetUnit, targetRack.units - height + 1));
            
            const devices = stateManager.getState().devices.map(d => 
              d.id === this.draggedDeviceId ? { ...d, rackId: targetRackId, startUnit: targetUnit } : d
            );
            stateManager.setState({ devices }, true);
            this.renderAll();
          }
        }
      }
    });

    svgEl.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      const target = e.target as SVGElement;
      const s = stateManager.getState();

      // Check for anchor handle drag first (before cable-end handle)
      const anchorEl = target.closest('.cable-anchor-handle') as SVGElement;
      if (anchorEl) {
        const cableId = anchorEl.getAttribute('data-cable-id')!;
        const anchorIdx = parseInt(anchorEl.getAttribute('data-anchor-index') || '0', 10);
        this.isDraggingAnchor = true;
        this.draggedAnchorCableId = cableId;
        this.draggedAnchorIndex = anchorIdx;
        this.dragStartWorldPos = this.canvas.screenToWorld({ x: e.clientX, y: e.clientY });
        this.dragStartCablesState = JSON.parse(JSON.stringify(stateManager.getState().cables));
        svgEl.classList.add('dragging-active');
        e.stopPropagation();
        return;
      }

      // Check for cable handle dragging (source or dest tip)
      const handleEl = target.closest('.cable-drag-handle') as SVGElement;
      if (handleEl) {
        const cableId = handleEl.getAttribute('data-cable-id-handle')!;
        const handleType = (handleEl.getAttribute('data-handle-type') as 'source' | 'dest') || 'dest';
        
        this.isDraggingCableEnd = true;
        this.draggedCableId = cableId;
        this.draggedHandleType = handleType;
        this.dragStartWorldPos = this.canvas.screenToWorld({ x: e.clientX, y: e.clientY });
        this.dragStartCablesState = JSON.parse(JSON.stringify(stateManager.getState().cables));
        this.dragStartDevicesState = JSON.parse(JSON.stringify(stateManager.getState().devices));

        const sState = stateManager.getState();
        const cable = stateManager.getCable(cableId);
        
        if (cable) {
          if (handleType === 'dest' && cable.destPortId) {
            const destPortId = cable.destPortId;
            const cables = sState.cables.map(c => 
              c.id === cableId ? { ...c, destPortId: null, floatingDest: this.mouseWorldPos } : c
            );
            const devices = sState.devices.map(d => {
              const updatedPorts = d.ports.map(p => {
                if (p.id === destPortId) return { ...p, connected: false, cableId: null };
                return p;
              });
              return { ...d, ports: updatedPorts };
            });
            stateManager.setState({ cables, devices });
          } else if (handleType === 'source') {
            const sourcePortId = cable.sourcePortId;
            const cables = sState.cables.map(c => 
              c.id === cableId ? { ...c, floatingSource: this.mouseWorldPos } : c
            );
            const devices = sState.devices.map(d => {
              const updatedPorts = d.ports.map(p => {
                if (p.id === sourcePortId) return { ...p, connected: false, cableId: null };
                return p;
              });
              return { ...d, ports: updatedPorts };
            });
            stateManager.setState({ cables, devices });
          }
        }
        
        const sel: SelectableItem = { type: 'cable', id: cableId };
        stateManager.setState({ selection: [sel] });
        eventBus.emit('selection:changed', [sel]);
        
        svgEl.classList.add('cable-laying');
        this.highlightNearestPort(this.mouseWorldPos, cableId);
        svgEl.classList.add('dragging-active');
        this.renderAll();
        e.stopPropagation();
        return;
      }

      if (s.tool === 'select') {
        const deviceEl = target.closest('[data-device-id]') as SVGElement;
        if (deviceEl) {
          const deviceId = deviceEl.getAttribute('data-device-id')!;
          const device = stateManager.getDevice(deviceId);
          if (device) {
            this.isDraggingDevice = true;
            this.draggedDeviceId = deviceId;
            this.dragStartWorldPos = this.canvas.screenToWorld({ x: e.clientX, y: e.clientY });
            this.dragStartUnit = device.startUnit;
            this.dragStartRackId = device.rackId;
            this.dragStartDevicesState = JSON.parse(JSON.stringify(stateManager.getState().devices));
            
            stateManager.setState({ selection: [{ type: 'device', id: deviceId }] });
            eventBus.emit('selection:changed', [{ type: 'device', id: deviceId }]);
            
            svgEl.classList.add('dragging-active');
            e.stopPropagation();
          }
        }
      }
    });

    // Mouseup handling for device drag completion
    window.addEventListener('mouseup', (e) => {
      // 0. Anchor point drag completion
      if (this.isDraggingAnchor) {
        this.isDraggingAnchor = false;
        this.draggedAnchorCableId = null;
        this.draggedAnchorIndex = -1;
        svgEl.classList.remove('dragging-active');

        // Restore start state silently and commit final state normally to push a single history frame
        if (this.dragStartCablesState) {
          const finalCables = stateManager.getState().cables;
          stateManager.setState({ cables: this.dragStartCablesState }, true);
          stateManager.setState({ cables: finalCables });
          this.dragStartCablesState = null;
        }

        this.renderAll();
        return;
      }

      // Remove cable-laying mode if not in progress
      const sCheck = stateManager.getState();
      if (!sCheck.cableInProgress && !this.isDraggingCableEnd) {
        svgEl.classList.remove('cable-laying');
        this.clearSnapTargets();
      }

      // 1. Cable end dragging completion (source OR dest tip)
      if (this.isDraggingCableEnd && this.draggedCableId) {
        svgEl.classList.remove('dragging-active');
        
        const cableId = this.draggedCableId;
        const handleType = this.draggedHandleType;
        this.isDraggingCableEnd = false;
        this.draggedCableId = null;
        this.draggedHandleType = null;

        svgEl.classList.remove('cable-laying');
        this.clearSnapTargets();

        const s = stateManager.getState();
        const cable = stateManager.getCable(cableId);
        if (cable) {
          const skipPortId = handleType === 'source' ? cable.destPortId : cable.sourcePortId;
          let targetPort: PortData | null = null;

          // 1. Direct hit-test on drop element under mouse cursor (temporarily bypass handle pointer-events)
          const handles = document.querySelectorAll('.cable-drag-handle, .cable-anchor-handle');
          handles.forEach(el => (el as HTMLElement).style.pointerEvents = 'none');
          
          const dropTargetEl = (e.target as SVGElement).closest?.('[data-port-id]') || 
                               document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-port-id]');

          handles.forEach(el => (el as HTMLElement).style.pointerEvents = '');

          if (dropTargetEl) {
            const hitPortId = dropTargetEl.getAttribute('data-port-id');
            if (hitPortId && hitPortId !== skipPortId) {
              targetPort = stateManager.getPort(hitPortId) || null;
            }
          }

          // 2. Fallback to generous 35px radius proximity snap search
          if (!targetPort) {
            let closestDist = 35;
            for (const dev of s.devices) {
              for (const port of dev.ports) {
                if (port.id === skipPortId) continue;

                const portPos = stateManager.getPortWorldPosition(port.id);
                if (portPos) {
                  const dist = Math.sqrt(Math.pow(this.mouseWorldPos.x - portPos.x, 2) + Math.pow(this.mouseWorldPos.y - portPos.y, 2));
                  if (dist < closestDist) {
                    closestDist = dist;
                    targetPort = port;
                  }
                }
              }
            }
          }

          if (targetPort) {
            const candidatePort = targetPort;
            const otherPortId = handleType === 'source' ? cable.destPortId : cable.sourcePortId;
            const otherPort = otherPortId ? stateManager.getPort(otherPortId) : null;
            
            // Perform validation checks
            let valid = true;
            if (otherPort) {
              const isSrcEar = (handleType === 'source' ? candidatePort.id : otherPort.id).includes('-ear-');
              const isDestEar = (handleType === 'source' ? otherPort.id : candidatePort.id).includes('-ear-');
              const isFiberPort = (type: string) => ['sfp', 'qsfp', 'lc', 'sc', 'fiber', 'optical'].some(t => type.toLowerCase().includes(t));
              const isPowerPort = (type: string) => ['power', 'pwr', 'c13', 'c14', 'c19', 'c20', 'inlet', 'outlet', 'plug'].some(t => type.toLowerCase().includes(t));

              if (!isSrcEar && !isDestEar) {
                if (isFiberPort(otherPort.type) && !isFiberPort(candidatePort.type)) {
                  eventBus.emit('notification', { message: 'Termination Mismatch: Fiber cable cannot terminate in a non-fiber port!', type: 'error' });
                  valid = false;
                } else if (isPowerPort(otherPort.type) && !isPowerPort(candidatePort.type)) {
                  eventBus.emit('notification', { message: 'Termination Mismatch: Power cable cannot terminate in a non-power port!', type: 'error' });
                  valid = false;
                } else if (isPowerPort(candidatePort.type) && !isPowerPort(otherPort.type)) {
                  eventBus.emit('notification', { message: 'Termination Mismatch: Cannot connect a non-power cable to a power port!', type: 'error' });
                  valid = false;
                }
              }
            }

            if (valid) {
              const updatedCables = stateManager.getState().cables.map(c => {
                if (c.id !== cableId) {
                  if (c.sourcePortId === candidatePort.id) return { ...c, floatingSource: { x: this.mouseWorldPos.x + 30, y: this.mouseWorldPos.y } };
                  if (c.destPortId === candidatePort.id) return { ...c, destPortId: null, floatingDest: { x: this.mouseWorldPos.x + 30, y: this.mouseWorldPos.y } };
                  return c;
                }
                if (handleType === 'source') {
                  return { ...c, sourcePortId: candidatePort.id, floatingSource: null, anchorPoints: [], anchorsLocked: false };
                } else {
                  return { ...c, destPortId: candidatePort.id, floatingDest: null, anchorPoints: [], anchorsLocked: false };
                }
              });

              const updatedDevices = s.devices.map(d => {
                const updatedPorts = d.ports.map(p => {
                  if (p.id === candidatePort.id) return { ...p, connected: true, cableId };
                  return p;
                });
                return { ...d, ports: updatedPorts };
              });

              // Restore start state silently and commit final state normally to push a single history frame
              if (this.dragStartCablesState && this.dragStartDevicesState) {
                stateManager.setState({ cables: this.dragStartCablesState, devices: this.dragStartDevicesState }, true);
              }
              stateManager.setState({ cables: updatedCables, devices: updatedDevices });
              this.dragStartCablesState = null;
              this.dragStartDevicesState = null;

              eventBus.emit('notification', { message: `Cable tip reconnected to ${candidatePort.name}!`, type: 'success' });
              this.renderAll();
              this.properties.update([{ type: 'cable', id: cableId }]);
              return;
            }
          }

          // If no port snapped, keep tip floating at mouse location and commit drag action
          if (this.dragStartCablesState && this.dragStartDevicesState) {
            const finalCables = stateManager.getState().cables;
            const finalDevices = stateManager.getState().devices;
            stateManager.setState({ cables: this.dragStartCablesState, devices: this.dragStartDevicesState }, true);
            stateManager.setState({ cables: finalCables, devices: finalDevices });
            this.dragStartCablesState = null;
            this.dragStartDevicesState = null;
          }
          this.renderAll();
        }
      }

      // 2. Device dragging completion
      if (this.isDraggingDevice && this.draggedDeviceId) {
        svgEl.classList.remove('dragging-active');
        
        const deviceId = this.draggedDeviceId;
        const finalDevice = stateManager.getDevice(deviceId);
        
        this.isDraggingDevice = false;
        this.draggedDeviceId = null;
        
        if (finalDevice) {
          const template = getTemplate(finalDevice.templateId);
          const height = template ? template.heightUnits : 1;
          
          const otherDevices = stateManager.getState().devices.filter(d => d.id !== deviceId && d.rackId === finalDevice.rackId);
          let occupied = false;
          for (const od of otherDevices) {
            const odTemplate = getTemplate(od.templateId);
            const odHeight = odTemplate ? odTemplate.heightUnits : 1;
            if (finalDevice.startUnit < od.startUnit + odHeight && finalDevice.startUnit + height > od.startUnit) {
              occupied = true;
              break;
            }
          }
          
          if (occupied) {
            // Revert
            if (this.dragStartDevicesState) {
              stateManager.setState({ devices: this.dragStartDevicesState }, true);
              this.dragStartDevicesState = null;
            }
            this.renderAll();
            eventBus.emit('notification', { message: 'Cannot place device: Slot is occupied', type: 'warning' });
          } else {
            // Silently restore to start position, then perform standard update to push a single history frame
            if (this.dragStartDevicesState) {
              stateManager.setState({ devices: this.dragStartDevicesState }, true);
              this.dragStartDevicesState = null;
            }
            eventBus.emit('device:update', { id: deviceId, data: { rackId: finalDevice.rackId, startUnit: finalDevice.startUnit } });
          }
        }
      }
    });

    // Click handling for selection and cable creation
    svgEl.addEventListener('click', (e) => {
      const target = e.target as SVGElement;
      const s = stateManager.getState();

      // Cable creation mode
      if (s.tool === 'cable') {
        // Primary: detect port via SVG hit-testing
        const portEl = target.closest('[data-port-id]') as SVGElement;
        if (portEl) {
          const portId = portEl.getAttribute('data-port-id')!;
          this.handleCablePortClick(portId);
          return;
        }
        // Fallback: proximity snap — find nearest port within 40px world units
        // (handles cases where the neon ring / gutter area was clicked instead of the port circle)
        if (s.cableInProgress || s.tool === 'cable') {
          let closestPortId: string | null = null;
          let closestDist = 40;
          for (const dev of s.devices) {
            for (const port of dev.ports) {
              const pos = stateManager.getPortWorldPosition(port.id);
              if (!pos) continue;
              const dist = Math.sqrt(Math.pow(this.mouseWorldPos.x - pos.x, 2) + Math.pow(this.mouseWorldPos.y - pos.y, 2));
              if (dist < closestDist) {
                closestDist = dist;
                closestPortId = port.id;
              }
            }
          }
          if (closestPortId) {
            this.handleCablePortClick(closestPortId);
            return;
          }
        }
      }

      // Selection mode
      if (s.tool === 'select') {
        // Check for port click
        const portEl = target.closest('[data-port-id]') as SVGElement;
        if (portEl) {
          const portId = portEl.getAttribute('data-port-id')!;
          stateManager.setState({
            selection: [{ type: 'port', id: portId }]
          });
          eventBus.emit('selection:changed', [{ type: 'port', id: portId }]);
          return;
        }

        // Check for device click
        const deviceEl = target.closest('[data-device-id]') as SVGElement;
        if (deviceEl) {
          const deviceId = deviceEl.getAttribute('data-device-id')!;
          stateManager.setState({
            selection: [{ type: 'device', id: deviceId }]
          });
          eventBus.emit('selection:changed', [{ type: 'device', id: deviceId }]);
          this.highlightElement(deviceEl);
          return;
        }

        // Check for vertical manager click
        const verticalMgrEl = target.closest('.cable-manager-vertical') as SVGElement;
        if (verticalMgrEl) {
          const rackId = verticalMgrEl.getAttribute('data-vertical-mgr-id')!;
          const side = verticalMgrEl.getAttribute('data-side') as 'left' | 'right';
          const sel: SelectableItem = { type: 'vertical-mgr', id: rackId, side } as any;
          stateManager.setState({ selection: [sel] });
          eventBus.emit('selection:changed', [sel]);
          this.highlightElement(verticalMgrEl);
          return;
        }

        // Check for rack click
        const rackEl = target.closest('[data-rack-id]') as SVGElement;
        if (rackEl) {
          const rackId = rackEl.getAttribute('data-rack-id')!;
          stateManager.setState({
            selection: [{ type: 'rack', id: rackId }]
          });
          eventBus.emit('selection:changed', [{ type: 'rack', id: rackId }]);
          this.highlightElement(rackEl);
          return;
        }

        // Check for cable click
        const cableEl = target.closest('[data-cable-id]') as SVGElement;
        if (cableEl) {
          const cableId = cableEl.getAttribute('data-cable-id')!;
          stateManager.setState({
            selection: [{ type: 'cable', id: cableId }]
          });
          eventBus.emit('selection:changed', [{ type: 'cable', id: cableId }]);
          this.renderAll();
          this.properties.update([{ type: 'cable', id: cableId }]);
          return;
        }

        // Clicked on empty canvas - deselect
        stateManager.setState({ selection: [], cableInProgress: null });
        eventBus.emit('selection:changed', []);
        this.clearHighlights();
      }
    });
  }

  /**
   * Handle clicking a port during cable creation mode.
   */
  private handleCablePortClick(portId: string) {
    const s = stateManager.getState();

    if (!s.cableInProgress) {
      // Start cable
      stateManager.setState({
        cableInProgress: {
          sourcePortId: portId,
          currentPoint: this.mouseWorldPos,
          bendPoints: [],
          cableType: s.selectedCableType || 'general'
        }
      });
    } else {
      // Complete cable
      const sourcePortId = s.cableInProgress.sourcePortId;
      if (sourcePortId === portId) return; // Can't connect to self

      const sourcePort = stateManager.getPort(sourcePortId);
      const destPort = stateManager.getPort(portId);
      if (!sourcePort || !destPort) return;

      // Validation: permissive — ear ports accept any network cable; only block cross-media (fiber↔ethernet, power↔other)
      const isSrcEar = sourcePortId.includes('-ear-');
      const isDestEar = portId.includes('-ear-');
      const isFiberPort = (type: string) => ['sfp', 'qsfp', 'lc', 'sc', 'fiber', 'optical'].some(t => type.toLowerCase().includes(t));
      const isPowerPort = (type: string) => ['power', 'pwr', 'c13', 'c14', 'c19', 'c20', 'inlet', 'outlet', 'plug'].some(t => type.toLowerCase().includes(t));

      if (!isSrcEar && !isDestEar) {
        if (isFiberPort(sourcePort.type) && !isFiberPort(destPort.type)) {
          eventBus.emit('notification', { message: 'Termination Mismatch: Fiber cable cannot terminate in a non-fiber port!', type: 'error' });
          return;
        }
        if (isPowerPort(sourcePort.type) && !isPowerPort(destPort.type)) {
          eventBus.emit('notification', { message: 'Termination Mismatch: Power cable cannot terminate in a non-power port!', type: 'error' });
          return;
        }
        if (isPowerPort(destPort.type) && !isPowerPort(sourcePort.type)) {
          eventBus.emit('notification', { message: 'Termination Mismatch: Cannot connect a non-power cable to a power port!', type: 'error' });
          return;
        }
      } else {
        if (isPowerPort(sourcePort.type) && !isPowerPort(destPort.type)) {
          eventBus.emit('notification', { message: 'Termination Mismatch: Power cable cannot terminate in a non-power port!', type: 'error' });
          return;
        }
        if (isPowerPort(destPort.type) && !isPowerPort(sourcePort.type)) {
          eventBus.emit('notification', { message: 'Termination Mismatch: Cannot connect a non-power cable to a power port!', type: 'error' });
          return;
        }
      }

      const color = s.selectedCableType === 'custom' 
        ? (s.selectedCableColor || '#78909c') 
        : (CABLE_COLORS[s.cableInProgress.cableType] || CABLE_COLORS.general);

      const newCable: CableData = {
        id: generateId(),
        name: `Cable ${stateManager.getState().cables.length + 1}`,
        type: s.cableInProgress.cableType,
        color,
        sourcePortId,
        destPortId: portId,
        bendPoints: [...s.cableInProgress.bendPoints],
        thickness: RACK_CONSTANTS.CABLE_THICKNESS,
        bendRadius: s.selectedCableBend !== undefined ? s.selectedCableBend : RACK_CONSTANTS.CABLE_BEND_RADIUS,
        sourceTermination: s.selectedCableTermination || 'RJ45 Ethernet',
        destTermination: s.selectedCableTermination || 'RJ45 Ethernet',
        bundleId: null,
        notes: '',
        anchorPoints: [],
        anchorsLocked: false
      };

      const sourcePos = stateManager.getPortWorldPosition(sourcePortId) || { x: 0, y: 0 };
      const destPos = stateManager.getPortWorldPosition(portId) || { x: 0, y: 0 };
      const autoPts = computeSmartRouting(newCable, sourcePos, destPos);
      newCable.anchorPoints = get3DefaultAnchors(autoPts);
      newCable.anchorsLocked = true;

      // Mark ports as connected
      sourcePort.connected = true;
      sourcePort.cableId = newCable.id;
      destPort.connected = true;
      destPort.cableId = newCable.id;

      stateManager.setState({
        cables: [...stateManager.getState().cables, newCable],
        cableInProgress: null
      });
      eventBus.emit('cable:added', newCable);

      // Clear preview + cable-laying mode
      const interactionLayer = this.canvas.getLayer('interaction-layer');
      if (interactionLayer) interactionLayer.innerHTML = '';
      const svgCanvasEl = document.getElementById('canvas') as unknown as SVGSVGElement;
      if (svgCanvasEl) svgCanvasEl.classList.remove('cable-laying');
      this.clearSnapTargets();
    }
  }

  /**
   * Update cable-in-progress preview line.
   */
  private updateCablePreview(currentPos: Point) {
    const s = stateManager.getState();
    if (!s.cableInProgress) return;

    const interactionLayer = this.canvas.getLayer('interaction-layer');
    if (!interactionLayer) return;

    // Clear previous preview
    interactionLayer.innerHTML = '';

    const sourcePos = stateManager.getPortWorldPosition(s.cableInProgress.sourcePortId);
    if (!sourcePos) return;

    try {
      const previewGroup = renderCableInProgress(sourcePos, currentPos, s.cableInProgress.cableType, interactionLayer);
      interactionLayer.appendChild(previewGroup);
    } catch {
      // Silently fail if renderer has issues
    }
  }

  /**
   * Highlight the nearest snappable port with a neon glow while cable is being routed.
   * @param worldPos  Current cursor position in world space
   * @param dragCableId  If re-routing a cable end, provide its id (to skip its own source port)
   * @param skipPortId  Port to skip (source port of cable in progress)
   */
  private highlightNearestPort(worldPos: Point, dragCableId: string | null, skipPortId?: string) {
    this.clearSnapTargets();

    const svgEl = document.getElementById('canvas') as unknown as SVGSVGElement;
    if (svgEl) svgEl.classList.add('cable-laying');

    const s = stateManager.getState();
    let closestDist = 30; // neon-snap highlight radius (px in world space)
    let closestPortId: string | null = null;

    // Determine which sourcePortId to skip
    let skipId = skipPortId ?? null;
    if (!skipId && dragCableId) {
      const cable = stateManager.getCable(dragCableId);
      if (cable) skipId = cable.sourcePortId;
    }

    for (const dev of s.devices) {
      for (const port of dev.ports) {
        if (port.id === skipId) continue;
        if (port.connected && !dragCableId) continue; // already used
        const pos = stateManager.getPortWorldPosition(port.id);
        if (!pos) continue;
        const dist = Math.sqrt(Math.pow(worldPos.x - pos.x, 2) + Math.pow(worldPos.y - pos.y, 2));
        if (dist < closestDist) {
          closestDist = dist;
          closestPortId = port.id;
        }
      }
    }

    if (closestPortId) {
      const el = document.querySelector(`[data-port-id="${closestPortId}"]`);
      if (el) el.classList.add('port-snap-target');
    }
  }

  /**
   * Remove all port-snap-target highlights.
   */
  private clearSnapTargets() {
    document.querySelectorAll('.port-snap-target').forEach(el => el.classList.remove('port-snap-target'));
  }

  /**
   * Setup drag-and-drop from sidebar to canvas.
   */
  private setupDragDrop() {
    const viewport = document.getElementById('canvas-viewport')!;

    viewport.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    });

    viewport.addEventListener('drop', (e) => {
      e.preventDefault();
      const jsonData = e.dataTransfer?.getData('application/json');
      if (!jsonData) return;

      try {
        const { templateId } = JSON.parse(jsonData);
        const template = getTemplate(templateId);
        if (!template) return;

        // Convert drop position to world coordinates
        const worldPos = this.canvas.screenToWorld({ x: e.clientX, y: e.clientY });
        const s = stateManager.getState();

        // Special handling for Vertical Cable Managers
        if (template.id === 'vertical-mgr-4' || template.id === 'vertical-mgr-6') {
          let closestRack: RackData | null = null;
          let minDist = Infinity;
          for (const rack of s.racks) {
            const rx = rack.x + RACK_CONSTANTS.RACK_OUTER_WIDTH / 2;
            const ry = rack.y + (rack.units * RACK_CONSTANTS.RU_HEIGHT) / 2;
            const dist = Math.sqrt(Math.pow(worldPos.x - rx, 2) + Math.pow(worldPos.y - ry, 2));
            if (dist < minDist) {
              minDist = dist;
              closestRack = rack;
            }
          }
          
          if (closestRack) {
            const isLeft = worldPos.x < closestRack.x + RACK_CONSTANTS.RACK_OUTER_WIDTH / 2;
            const sizeVal: '4-inch' | '6-inch' = template.id === 'vertical-mgr-6' ? '6-inch' : '4-inch';
            
            const updatedRacks = s.racks.map(r => {
              if (r.id === closestRack!.id) {
                return isLeft
                  ? { ...r, leftCableManagerWidth: sizeVal }
                  : { ...r, rightCableManagerWidth: sizeVal };
              }
              return r;
            });
            stateManager.setState({ racks: updatedRacks });
            eventBus.emit('notification', { 
              message: `Attached ${isLeft ? 'Left' : 'Right'} Vertical Manager (${sizeVal === '6-inch' ? '6"' : '4"'}) next to ${closestRack.name}!`,
              type: 'success'
            });
            this.renderAll();
          }
          return;
        }

        // Find which rack was dropped on
        let targetRack: RackData | null = null;

        for (const rack of s.racks) {
          const rackLeft = rack.x;
          const rackRight = rack.x + RACK_CONSTANTS.RACK_OUTER_WIDTH;
          const rackTop = rack.y;
          const rackBottom = rack.y + RACK_CONSTANTS.RACK_PADDING_TOP + rack.units * RACK_CONSTANTS.RU_HEIGHT + RACK_CONSTANTS.RACK_PADDING_BOTTOM;

          if (worldPos.x >= rackLeft && worldPos.x <= rackRight &&
              worldPos.y >= rackTop && worldPos.y <= rackBottom) {
            targetRack = rack;
            break;
          }
        }

        let startUnit: number | null = null;
        const wasDroppedInsideRack = targetRack !== null;

        if (!targetRack) {
          // If not dropped on a rack, use the first rack
          targetRack = s.racks[0];
          if (!targetRack) return;
        }

        if (wasDroppedInsideRack) {
          const relativeY = worldPos.y - (targetRack.y + RACK_CONSTANTS.RACK_PADDING_TOP);
          const unitFromTop = Math.floor(relativeY / RACK_CONSTANTS.RU_HEIGHT);
          let targetRU = targetRack.units - unitFromTop;
          
          // Adjust starting unit so the device template sits correctly
          startUnit = targetRU - template.heightUnits + 1;
          startUnit = Math.max(1, Math.min(startUnit, targetRack.units - template.heightUnits + 1));
          
          // Check collision
          let occupied = false;
          for (let i = 0; i < template.heightUnits; i++) {
            if (stateManager.isRUOccupied(targetRack.id, startUnit + i)) {
              occupied = true;
              break;
            }
          }
          
          if (occupied) {
            eventBus.emit('notification', { 
              message: `Cannot place device: Rack Units ${startUnit}U to ${startUnit + template.heightUnits - 1}U are occupied.`, 
              type: 'warning' 
            });
            return;
          }
        } else {
          startUnit = stateManager.getNextAvailableRU(targetRack.id, template.heightUnits);
          if (startUnit === null) {
            eventBus.emit('notification', { message: 'No available rack unit space', type: 'warning' });
            return;
          }
        }

        // Create device from template
        const deviceId = generateId();
        const ports: PortData[] = template.ports.map((p, i) => ({
          ...p,
          id: `${deviceId}-port-${i}`,
          deviceId,
          connected: false,
          cableId: null,
        }));

        const newDevice: DeviceData = {
          id: deviceId,
          templateId: template.id,
          rackId: targetRack.id,
          startUnit,
          name: template.name,
          hostname: '',
          managementIp: '',
          serialNumber: '',
          description: '',
          ports,
        };

        stateManager.addDevice(newDevice);
      } catch (err) {
        console.error('Drop error:', err);
      }
    });
  }

  /**
   * Setup keyboard shortcuts.
   */
  private setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Don't handle shortcuts when typing in inputs or selects
      const targetTag = (e.target as HTMLElement).tagName;
      if (targetTag === 'INPUT' || targetTag === 'TEXTAREA' || targetTag === 'SELECT') return;

      // Shift device up/down with Arrow keys
      const s = stateManager.getState();
      if (s.selection.length === 1 && s.selection[0].type === 'device') {
        const devId = s.selection[0].id;
        const device = stateManager.getDevice(devId);
        if (device) {
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            eventBus.emit('device:update', { id: devId, data: { startUnit: device.startUnit + 1 } });
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            eventBus.emit('device:update', { id: devId, data: { startUnit: device.startUnit - 1 } });
          }
        }
      }

      if (e.key === ' ') {
        this.spacePressed = true;
        e.preventDefault();
      }

      // Ctrl+Z = Undo
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        eventBus.emit('edit:undo', undefined);
      }

      // Ctrl+Shift+Z or Ctrl+Y = Redo
      if ((e.ctrlKey && e.shiftKey && e.key === 'Z') || (e.ctrlKey && e.key === 'y')) {
        e.preventDefault();
        eventBus.emit('edit:redo', undefined);
      }

      // Delete or Backspace = Delete selection
      if (e.key === 'Delete' || e.key === 'Backspace') {
        this.deleteSelection();
      }

      // V = Select tool
      if (e.key === 'v') eventBus.emit('tool:changed', 'select');
      // H = Pan tool
      if (e.key === 'h') eventBus.emit('tool:changed', 'pan');
      // C = Cable tool
      if (e.key === 'c' && !e.ctrlKey) eventBus.emit('tool:changed', 'cable');

      // Ctrl+S = Save
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        eventBus.emit('export:json', undefined as any);
      }

      // Escape = Deselect / Cancel cable
      if (e.key === 'Escape') {
        stateManager.setState({ selection: [], cableInProgress: null });
        eventBus.emit('selection:changed', []);
        this.clearHighlights();
        const interactionLayer = this.canvas.getLayer('interaction-layer');
        if (interactionLayer) interactionLayer.innerHTML = '';
      }
    });

    document.addEventListener('keyup', (e) => {
      if (e.key === ' ') this.spacePressed = false;
    });
  }

  /**
   * Setup selection visual handling.
   */
  private setupSelectionHandling() {
    eventBus.on('selection:changed', (selection: SelectableItem[]) => {
      this.clearHighlights();
      for (const item of selection) {
        if ((item as any).type === 'vertical-mgr') {
          const side = (item as any).side;
          const el = document.querySelector(`.cable-manager-vertical[data-vertical-mgr-id="${item.id}"][data-side="${side}"]`) as SVGElement;
          if (el) this.highlightElement(el);
        } else {
          const attrName = `data-${item.type}-id`;
          const el = document.querySelector(`[${attrName}="${item.id}"]`) as SVGElement;
          if (el) this.highlightElement(el);
        }
      }
    });
  }

  /**
   * Setup context menu handling.
   */
  private setupContextMenuHandling() {
    eventBus.on('canvas:rightclick', ({ point, target, screenPoint }: any) => {
      const screenPos = screenPoint || this.canvas.worldToScreen(point);
      const targetEl = target as unknown as SVGElement;
      const s = stateManager.getState();

      // 1. Cable Right-Click Context Menu (direct hit OR currently selected cable fallback)
      let cableEl = targetEl ? targetEl.closest?.('[data-cable-id]') as SVGElement : null;
      let targetCableId = cableEl ? cableEl.getAttribute('data-cable-id') : null;

      if (!targetCableId) {
        const selectedCableItem = s.selection.find(item => item.type === 'cable');
        if (selectedCableItem && (!targetEl || (!targetEl.closest?.('[data-port-id]') && !targetEl.closest?.('[data-device-id]')))) {
          targetCableId = selectedCableItem.id;
        }
      }

      if (targetCableId) {
        const cable = stateManager.getCable(targetCableId);
        if (cable) {
          stateManager.setState({ selection: [{ type: 'cable', id: targetCableId }] });
          this.properties.update([{ type: 'cable', id: targetCableId }]);

          const anchorEl = targetEl ? targetEl.closest?.('.cable-anchor-handle') as SVGElement : null;
          const targetAnchorIdx = anchorEl ? parseInt(anchorEl.getAttribute('data-anchor-index') || '0', 10) : null;

          const items: MenuItem[] = [
            { label: `⚙️ ${cable.displayName || cable.name || 'Ethernet Cable'} Options`, icon: '🔌', disabled: true },
            { separator: true, label: '' },
            {
              label: '🔌 Source Connector Orientation',
              icon: '🔌',
              submenu: [
                { label: '🔄 Auto-Detect (Recommended)', action: () => eventBus.emit('cable:update', { id: targetCableId, data: { sourceOrientation: 'auto', anchorPoints: [], anchorsLocked: false } }) },
                { separator: true, label: '' },
                { label: '➡️ Exit Right  — cable leaves rightward', action: () => eventBus.emit('cable:update', { id: targetCableId, data: { sourceOrientation: 'right', anchorPoints: [], anchorsLocked: false } }) },
                { label: '⬅️ Exit Left   — cable leaves leftward',  action: () => eventBus.emit('cable:update', { id: targetCableId, data: { sourceOrientation: 'left',  anchorPoints: [], anchorsLocked: false } }) },
                { label: '⬇️ Exit Down   — cable leaves downward',  action: () => eventBus.emit('cable:update', { id: targetCableId, data: { sourceOrientation: 'up',    anchorPoints: [], anchorsLocked: false } }) },
                { label: '⬆️ Exit Up     — cable leaves upward',    action: () => eventBus.emit('cable:update', { id: targetCableId, data: { sourceOrientation: 'down',  anchorPoints: [], anchorsLocked: false } }) }
              ]
            },
            {
              label: '🔌 Destination Connector Orientation',
              icon: '🔌',
              submenu: [
                { label: '🔄 Auto-Detect (Recommended)', action: () => eventBus.emit('cable:update', { id: targetCableId, data: { destOrientation: 'auto', anchorPoints: [], anchorsLocked: false } }) },
                { separator: true, label: '' },
                { label: '➡️ Exit Right  — cable leaves rightward', action: () => eventBus.emit('cable:update', { id: targetCableId, data: { destOrientation: 'right', anchorPoints: [], anchorsLocked: false } }) },
                { label: '⬅️ Exit Left   — cable leaves leftward',  action: () => eventBus.emit('cable:update', { id: targetCableId, data: { destOrientation: 'left',  anchorPoints: [], anchorsLocked: false } }) },
                { label: '⬇️ Exit Down   — cable leaves downward',  action: () => eventBus.emit('cable:update', { id: targetCableId, data: { destOrientation: 'up',    anchorPoints: [], anchorsLocked: false } }) },
                { label: '⬆️ Exit Up     — cable leaves upward',    action: () => eventBus.emit('cable:update', { id: targetCableId, data: { destOrientation: 'down',  anchorPoints: [], anchorsLocked: false } }) }
              ]
            },

            {
              label: 'Cable Exit Channel (Gutter)',
              icon: '🔀',
              submenu: [
                { label: '⬅️ Left Vertical Manager', action: () => eventBus.emit('cable:update', { id: targetCableId, data: { sidePreference: 'left', anchorPoints: [], anchorsLocked: false } }) },
                { label: '➡️ Right Vertical Manager', action: () => eventBus.emit('cable:update', { id: targetCableId, data: { sidePreference: 'right', anchorPoints: [], anchorsLocked: false } }) }
              ]
            },
            {
              label: 'Cable Bend Roundness',
              icon: '⭕',
              submenu: [
                { label: 'Sharp Corner (0px)', action: () => eventBus.emit('cable:update', { id: targetCableId, data: { bendRadius: 0 } }) },
                { label: 'Tight Bend (5px)', action: () => eventBus.emit('cable:update', { id: targetCableId, data: { bendRadius: 5 } }) },
                { label: 'Standard Bend (10px)', action: () => eventBus.emit('cable:update', { id: targetCableId, data: { bendRadius: 10 } }) },
                { label: 'Medium Bend (15px)', action: () => eventBus.emit('cable:update', { id: targetCableId, data: { bendRadius: 15 } }) },
                { label: 'Generous Bend (30px)', action: () => eventBus.emit('cable:update', { id: targetCableId, data: { bendRadius: 30 } }) },
                { label: 'Sweeping Bend (50px)', action: () => eventBus.emit('cable:update', { id: targetCableId, data: { bendRadius: 50 } }) }
              ]
            },
            {
              label: 'Cable Color',
              icon: '🎨',
              submenu: [
                { label: '🟠 Orange (#fb8c00)', action: () => eventBus.emit('cable:update', { id: targetCableId, data: { color: '#fb8c00' } }) },
                { label: '🟢 Green (#43a047)', action: () => eventBus.emit('cable:update', { id: targetCableId, data: { color: '#43a047' } }) },
                { label: '🟣 Purple (#8e24aa)', action: () => eventBus.emit('cable:update', { id: targetCableId, data: { color: '#8e24aa' } }) },
                { label: '🟡 Yellow (#fdd835)', action: () => eventBus.emit('cable:update', { id: targetCableId, data: { color: '#fdd835' } }) },
                { label: '🔵 Blue (#1e88e5)', action: () => eventBus.emit('cable:update', { id: targetCableId, data: { color: '#1e88e5' } }) },
                { label: '🔴 Red (#e53935)', action: () => eventBus.emit('cable:update', { id: targetCableId, data: { color: '#e53935' } }) },
                { label: '⚪ Slate Grey (#78909c)', action: () => eventBus.emit('cable:update', { id: targetCableId, data: { color: '#78909c' } }) },
                { label: '🌐 Cyan (#00acc1)', action: () => eventBus.emit('cable:update', { id: targetCableId, data: { color: '#00acc1' } }) }
              ]
            },
            { separator: true, label: '' },
            {
              label: cable.animatedFlow ? '⚡ Disable Live Packet Flow' : '⚡ Enable Live Packet Flow',
              icon: '⚡',
              action: () => eventBus.emit('cable:update', { id: targetCableId, data: { animatedFlow: !cable.animatedFlow } })
            },
            {
              label: '📍 Add Routing Anchor Point',
              icon: '📍',
              action: () => {
                const sourcePos = cable.floatingSource || stateManager.getPortWorldPosition(cable.sourcePortId) || { x: 0, y: 0 };
                const destPos = (cable.destPortId ? stateManager.getPortWorldPosition(cable.destPortId) : cable.floatingDest) || { x: 0, y: 0 };
                const baseAnchors = (cable.anchorPoints && cable.anchorPoints.length > 0)
                  ? cable.anchorPoints
                  : computeSmartRouting(cable, sourcePos, destPos);
                
                const points = [sourcePos, ...baseAnchors, destPos];
                let minDistance = Infinity;
                let insertIdx = baseAnchors.length;
                
                for (let i = 0; i < points.length - 1; i++) {
                  const dist = distToSegment(point, points[i], points[i+1]);
                  if (dist < minDistance) {
                    minDistance = dist;
                    insertIdx = i;
                  }
                }
                
                const currentPts = [...baseAnchors];
                currentPts.splice(insertIdx, 0, { x: Math.round(point.x), y: Math.round(point.y) });
                eventBus.emit('cable:update', { id: targetCableId, data: { anchorPoints: currentPts, anchorsLocked: true } });
              }
            },
            ...(targetAnchorIdx !== null ? [{
              label: `🗑 Remove Anchor Point A${targetAnchorIdx + 1}`,
              icon: '🗑',
              action: () => {
                const sourcePos = cable.floatingSource || stateManager.getPortWorldPosition(cable.sourcePortId) || { x: 0, y: 0 };
                const destPos = (cable.destPortId ? stateManager.getPortWorldPosition(cable.destPortId) : cable.floatingDest) || { x: 0, y: 0 };
                const currentPts = [...(cable.anchorPoints && cable.anchorPoints.length > 0 ? cable.anchorPoints : computeSmartRouting(cable, sourcePos, destPos))];
                if (currentPts.length > 0) {
                  currentPts.splice(targetAnchorIdx, 1);
                  eventBus.emit('cable:update', { id: targetCableId, data: { anchorPoints: currentPts, anchorsLocked: currentPts.length > 0 } });
                }
              }
            }] : []),
            {
              label: '↺ Reset Cable Routing',
              icon: '↺',
              action: () => eventBus.emit('cable:update', { id: targetCableId, data: { anchorPoints: [], anchorsLocked: false } })
            },
            { separator: true, label: '' },
            {
              label: '🗑 Delete Cable',
              icon: '🗑',
              shortcut: 'Del',
              action: () => this.deleteSelection()
            }
          ];

          this.contextMenu.show(screenPos.x, screenPos.y, items);
          return;
        }
      }

      // 2. Port Right-Click Context Menu
      const portEl = targetEl ? targetEl.closest?.('[data-port-id]') as SVGElement : null;
      if (portEl) {
        const portId = portEl.getAttribute('data-port-id')!;
        const port = stateManager.getPort(portId);
        if (port) {
          const connectedCable = port.cableId ? stateManager.getCable(port.cableId) : null;
          const items: MenuItem[] = [
            { label: `Port: ${port.name}`, icon: '🔌', disabled: true },
            { separator: true, label: '' },
            {
              label: 'Connect Cable From Here',
              icon: '🔗',
              action: () => {
                stateManager.setState({
                  tool: 'cable',
                  cableInProgress: {
                    sourcePortId: portId,
                    currentPoint: point,
                    bendPoints: [],
                    cableType: s.selectedCableType || 'general'
                  }
                });
              }
            }
          ];

          if (connectedCable) {
            items.push(
              {
                label: 'Select Attached Cable',
                icon: '🔍',
                action: () => {
                  stateManager.setState({ selection: [{ type: 'cable', id: connectedCable.id }] });
                  this.properties.update([{ type: 'cable', id: connectedCable.id }]);
                }
              },
              {
                label: 'Disconnect Cable',
                icon: '❌',
                action: () => {
                  const updatedCables = s.cables.filter(c => c.id !== connectedCable.id);
                  const updatedDevices = s.devices.map(d => ({
                    ...d,
                    ports: d.ports.map(p => (p.cableId === connectedCable.id ? { ...p, connected: false, cableId: null } : p))
                  }));
                  stateManager.setState({ cables: updatedCables, devices: updatedDevices });
                  this.renderAll();
                }
              }
            );
          }

          this.contextMenu.show(screenPos.x, screenPos.y, items);
          return;
        }
      }

      // 3. Device Right-Click Context Menu
      const deviceEl = targetEl ? targetEl.closest?.('[data-device-id]') as SVGElement : null;
      if (deviceEl) {
        const deviceId = deviceEl.getAttribute('data-device-id')!;
        const device = stateManager.getDevice(deviceId);
        if (device) {
          stateManager.setState({ selection: [{ type: 'device', id: deviceId }] });
          this.properties.update([{ type: 'device', id: deviceId }]);

          const items: MenuItem[] = [
            { label: `${device.name}`, icon: '🖥️', disabled: true },
            { separator: true, label: '' },
            {
              label: '⚡ Auto-Generate 8 Cables to Gutter',
              icon: '⚡',
              action: () => {
                eventBus.emit('cable:batch-generate', { deviceId, side: 'right', type: 'vm-network', color: '#fb8c00', count: 8 });
              }
            },
            {
              label: '⚙️ View / Edit Device Properties',
              icon: '⚙️',
              action: () => this.properties.update([{ type: 'device', id: deviceId }])
            },
            { separator: true, label: '' },
            {
              label: '🗑 Delete Device',
              icon: '🗑',
              shortcut: 'Del',
              action: () => this.deleteSelection()
            }
          ];

          this.contextMenu.show(screenPos.x, screenPos.y, items);
          return;
        }
      }

      // 4. Default Canvas / Rack Right-Click Context Menu
      const items: MenuItem[] = [
        { label: 'Add 42U Rack', icon: '➕', action: () => stateManager.addRack({ id: generateId(), name: `Rack ${s.racks.length + 1}`, units: 42, x: point.x, y: point.y }) },
        { label: 'Add 48U Rack', icon: '➕', action: () => stateManager.addRack({ id: generateId(), name: `Rack ${s.racks.length + 1}`, units: 48, x: point.x, y: point.y }) },
        { separator: true, label: '' },
        { label: 'Select All Racks', icon: '⬜', shortcut: 'Ctrl+A', action: () => {
          const allItems: SelectableItem[] = stateManager.getState().racks.map(r => ({ type: 'rack' as const, id: r.id }));
          stateManager.setState({ selection: allItems });
          eventBus.emit('selection:changed', allItems);
        }},
        { label: 'Fit View to Content', icon: '🔲', action: () => this.canvas.fitToContent() },
        { label: 'Toggle Grid', icon: '▦', action: () => eventBus.emit('view:toggle-grid', undefined as any) }
      ];

      this.contextMenu.show(screenPos.x, screenPos.y, items);
    });
  }

  /**
   * Delete currently selected elements.
   */
  private deleteSelection() {
    const s = stateManager.getState();
    for (const item of s.selection) {
      if (item.type === 'device') {
        stateManager.removeDevice(item.id);
      } else if (item.type === 'rack') {
        // Remove all devices in the rack first
        const devices = stateManager.getDevicesInRack(item.id);
        for (const d of devices) stateManager.removeDevice(d.id);
        stateManager.removeRack(item.id);
      } else if (item.type === 'cable') {
        // Disconnect ports
        const cable = stateManager.getCable(item.id);
        if (cable) {
          const sp = stateManager.getPort(cable.sourcePortId);
          const dp = cable.destPortId ? stateManager.getPort(cable.destPortId) : undefined;
          if (sp) { sp.connected = false; sp.cableId = null; }
          if (dp) { dp.connected = false; dp.cableId = null; }
        }
        stateManager.setState({
          cables: stateManager.getState().cables.filter(c => c.id !== item.id)
        });
        eventBus.emit('cable:removed', item.id);
      } else if ((item as any).type === 'vertical-mgr') {
        const side = (item as any).side;
        const prop = side === 'left' ? 'leftCableManagerWidth' : 'rightCableManagerWidth';
        const updatedRacks = s.racks.map(r => {
          if (r.id === item.id) {
            return { ...r, [prop]: 'none' as const };
          }
          return r;
        });
        stateManager.setState({ racks: updatedRacks });
      }
    }
    stateManager.setState({ selection: [] });
    eventBus.emit('selection:changed', []);
    this.renderAll();
  }

  /**
   * Render all elements on the canvas.
   */
  private renderAll() {
    const s = stateManager.getState();
    const rackLayer = this.canvas.getLayer('rack-layer');
    const cableLayer = this.canvas.getLayer('cable-layer');
    const labelLayer = this.canvas.getLayer('label-layer');

    if (!rackLayer || !cableLayer) return;

    // Clear layers
    rackLayer.innerHTML = '';
    cableLayer.innerHTML = '';
    if (labelLayer) labelLayer.innerHTML = '';

    // Render overhead cable runway tray if there are multiple racks
    if (s.racks.length > 1) {
      const minRackY = Math.min(...s.racks.map(r => r.y));
      const trayY = minRackY - 45;
      
      const rackXCoords = s.racks.map(r => r.x);
      const minX = Math.min(...rackXCoords) + 44; 
      const maxX = Math.max(...rackXCoords) + 406; 
      
      const trayGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      trayGroup.setAttribute('id', 'overhead-cable-tray');
      trayGroup.setAttribute('style', 'pointer-events: none;');
      
      const railTop = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      railTop.setAttribute('x1', String(minX - 50));
      railTop.setAttribute('y1', String(trayY - 6));
      railTop.setAttribute('x2', String(maxX + 50));
      railTop.setAttribute('y2', String(trayY - 6));
      railTop.setAttribute('stroke', '#3a3a42');
      railTop.setAttribute('stroke-width', '2');
      trayGroup.appendChild(railTop);

      const railBottom = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      railBottom.setAttribute('x1', String(minX - 50));
      railBottom.setAttribute('y1', String(trayY + 6));
      railBottom.setAttribute('x2', String(maxX + 50));
      railBottom.setAttribute('y2', String(trayY + 6));
      railBottom.setAttribute('stroke', '#3a3a42');
      railBottom.setAttribute('stroke-width', '2');
      trayGroup.appendChild(railBottom);
      
      for (let x = Math.floor(minX - 50); x <= Math.floor(maxX + 50); x += 20) {
        const rung = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        rung.setAttribute('x1', String(x));
        rung.setAttribute('y1', String(trayY - 6));
        rung.setAttribute('x2', String(x));
        rung.setAttribute('y2', String(trayY + 6));
        rung.setAttribute('stroke', '#2b2b32');
        rung.setAttribute('stroke-width', '1.5');
        trayGroup.appendChild(rung);
      }
      
      const trayLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      trayLabel.setAttribute('x', String((minX + maxX) / 2));
      trayLabel.setAttribute('y', String(trayY - 12));
      trayLabel.setAttribute('text-anchor', 'middle');
      trayLabel.setAttribute('fill', '#4f5660');
      trayLabel.setAttribute('font-size', '8');
      trayLabel.setAttribute('font-family', 'monospace');
      trayLabel.setAttribute('letter-spacing', '1');
      trayLabel.textContent = 'OVERHEAD CABLE RUNWAY';
      trayGroup.appendChild(trayLabel);
      
      rackLayer.appendChild(trayGroup);
    }

    // Render racks
    for (const rack of s.racks) {
      const rackGroup = renderRack(rack, rackLayer);

      // Render devices in this rack
      const devices = stateManager.getDevicesInRack(rack.id);
      for (const device of devices) {
        const deviceGroup = renderDevice(device, 0, 0, rack.units);
        rackGroup.appendChild(deviceGroup);
      }
    }

    // Render cables
    for (const cable of s.cables) {
      let sourcePos = cable.floatingSource || stateManager.getPortWorldPosition(cable.sourcePortId);
      let destPos = cable.destPortId ? stateManager.getPortWorldPosition(cable.destPortId) : null;
      if (!destPos && cable.floatingDest) {
        destPos = cable.floatingDest;
      }
      if (sourcePos && destPos) {
        renderCable(cable, sourcePos, destPos, cableLayer);
      }
    }

    // Render dashboard widgets
    if (labelLayer && s.racks.length > 0 && s.showLegends) {
      const firstRack = s.racks[0];
      renderDashboardWidgets(firstRack, s.devices, s.cables, labelLayer);
    }
  }

  /**
   * Update canvas cursor based on current tool.
   */
  private updateCanvasCursor(mode: ToolMode) {
    const viewport = document.getElementById('canvas-viewport');
    if (!viewport) return;

    const cursorMap: Record<ToolMode, string> = {
      'select': 'default',
      'pan': 'grab',
      'cable': 'crosshair',
      'zoom-in': 'zoom-in',
      'zoom-out': 'zoom-out'
    };
    viewport.style.cursor = cursorMap[mode] || 'default';
  }

  /**
   * Highlight an SVG element (selected state).
   */
  private highlightElement(el: SVGElement) {
    el.classList.add('selected');
  }

  /**
   * Clear all selection highlights.
   */
  private clearHighlights() {
    document.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
  }

  /**
   * Open Network Legend Customization Modal to allow users to add/edit/blank legend items and cable color labels.
   */
  private showLegendCustomizerModal() {
    const existing = document.getElementById('legend-customizer-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'legend-customizer-modal';
    modal.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0,0,0,0.75); backdrop-filter: blur(8px);
      z-index: 10000; display: flex; align-items: center; justify-content: center;
      font-family: 'Inter', system-ui, sans-serif; color: #fff;
    `;

    const s = stateManager.getState();
    const currentItems: LegendItem[] = (s.customLegendItems && s.customLegendItems.length > 0)
      ? [...s.customLegendItems]
      : s.cables.length > 0 
        ? Array.from(new Map(s.cables.map(c => [`${c.type}-${c.color}`, { id: generateId(), label: c.displayName || c.name || c.type.toUpperCase(), color: c.color }])).values())
        : [];

    modal.innerHTML = `
      <div style="background: #161b22; border: 1px solid #30363d; border-radius: 8px; width: 460px; max-width: 90vw; padding: 20px; box-shadow: 0 20px 40px rgba(0,0,0,0.8);">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #30363d; padding-bottom: 12px;">
          <h3 style="margin: 0; font-size: 14px; color: #fb8c00;">🎨 Network Legend &amp; Cable Customizer</h3>
          <button id="modal-close-btn" style="background: none; border: none; color: #8b949e; font-size: 18px; cursor: pointer;">✕</button>
        </div>
        <p style="font-size: 11px; color: #8b949e; margin: 10px 0 15px 0;">Define custom labels and cable color codes to display on your project Network Legend:</p>

        <div id="legend-items-list" style="display: flex; flex-direction: column; gap: 8px; max-height: 260px; overflow-y: auto; padding-right: 5px;">
        </div>

        <div style="display: flex; gap: 8px; margin-top: 15px;">
          <button id="add-legend-row-btn" style="flex: 1; padding: 6px 12px; font-size: 11px; background: rgba(88,166,255,0.15); border: 1px solid #58a6ff; color: #58a6ff; border-radius: 4px; cursor: pointer; font-weight: 500;">➕ Add Custom Entry</button>
          <button id="reset-legend-btn" style="padding: 6px 12px; font-size: 11px; background: rgba(244,67,54,0.15); border: 1px solid #ef5350; color: #ef5350; border-radius: 4px; cursor: pointer; font-weight: 500;">↺ Make Blank</button>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; border-top: 1px solid #30363d; padding-top: 15px;">
          <button id="cancel-legend-btn" style="padding: 6px 14px; font-size: 11px; background: transparent; border: 1px solid #30363d; color: #c9d1d9; border-radius: 4px; cursor: pointer;">Cancel</button>
          <button id="save-legend-btn" style="padding: 6px 16px; font-size: 11px; background: #fb8c00; border: none; color: #fff; font-weight: bold; border-radius: 4px; cursor: pointer;">Save Legend</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const listEl = modal.querySelector('#legend-items-list')!;
    let items = [...currentItems];

    const renderList = () => {
      if (items.length === 0) {
        listEl.innerHTML = `<div style="text-align: center; padding: 20px 0; color: #8b949e; font-size: 11px;">(Legend is currently blank. Click "➕ Add Custom Entry" to create custom labels &amp; colors)</div>`;
        return;
      }
      listEl.innerHTML = items.map((item, idx) => `
        <div style="display: flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.03); padding: 6px 8px; border-radius: 4px; border: 1px solid #21262d;">
          <input type="color" class="legend-color-picker" data-idx="${idx}" value="${item.color}" style="width: 28px; height: 26px; border: none; background: transparent; cursor: pointer;" title="Pick Color" />
          <input type="text" class="legend-label-input" data-idx="${idx}" value="${item.label}" placeholder="e.g. Uplink ToR Switch / SAN Traffic" style="flex: 1; padding: 4px 8px; font-size: 11px; background: #0d1117; border: 1px solid #30363d; color: #fff; border-radius: 3px;" />
          <button class="legend-del-btn" data-idx="${idx}" style="background: none; border: none; color: #f85149; font-size: 14px; cursor: pointer;" title="Delete Entry">✕</button>
        </div>
      `).join('');

      listEl.querySelectorAll('.legend-color-picker').forEach(input => {
        input.addEventListener('change', (e: any) => {
          const idx = parseInt(e.target.getAttribute('data-idx'));
          items[idx].color = e.target.value;
        });
      });
      listEl.querySelectorAll('.legend-label-input').forEach(input => {
        input.addEventListener('input', (e: any) => {
          const idx = parseInt(e.target.getAttribute('data-idx'));
          items[idx].label = e.target.value;
        });
      });
      listEl.querySelectorAll('.legend-del-btn').forEach(btn => {
        btn.addEventListener('click', (e: any) => {
          const idx = parseInt(e.currentTarget.getAttribute('data-idx'));
          items.splice(idx, 1);
          renderList();
        });
      });
    };

    renderList();

    modal.querySelector('#add-legend-row-btn')?.addEventListener('click', () => {
      items.push({ id: generateId(), label: 'Custom Cable Label', color: '#00acc1' });
      renderList();
    });

    modal.querySelector('#reset-legend-btn')?.addEventListener('click', () => {
      items = [];
      renderList();
    });

    modal.querySelector('#modal-close-btn')?.addEventListener('click', () => modal.remove());
    modal.querySelector('#cancel-legend-btn')?.addEventListener('click', () => modal.remove());
    modal.querySelector('#save-legend-btn')?.addEventListener('click', () => {
      stateManager.setState({ customLegendItems: items });
      eventBus.emit('notification', { message: 'Network legend updated successfully!', type: 'success' });
      this.renderAll();
      modal.remove();
    });
  }
}
