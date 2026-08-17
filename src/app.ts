/**
 * Application Orchestrator
 * Ties together all modules: canvas, renderers, UI components, state, and events.
 */
import { eventBus } from './core/event-bus';
import { stateManager } from './core/state';
import { ClaudeProvider } from './ai/claude-provider';
import { CanvasManager } from './core/canvas';
import { historyManager } from './core/history';
import { Toolbar } from './components/toolbar';
import { Sidebar } from './components/sidebar';
import { PresenterDashboard } from './components/presenter-dashboard';
import './styles/presenter-dashboard.css';
import './styles/tooltip.css';
import './styles/custom-asset-modal.css';
import { PortTooltip } from './components/tooltip';
import { PropertiesPanel, initAIHints } from './components/properties';
import { StatusBar } from './components/statusbar';
import { ContextMenu, MenuItem } from './components/context-menu';
import { ReportsPanel } from './components/reports-panel';
import { FloatingToolbar } from './components/floating-toolbar';
import { CloudFloatingToolbar } from './components/cloud-floating-toolbar';
import { NotificationCenter } from './components/notifications';
import { TextToolPanel } from './components/text-tool-panel';
import { ImageToolPanel } from './components/image-tool-panel';
import './styles/text-tool-panel.css';
import { AIPanel } from './components/ai-panel';
import { runSelfTests } from './utils/self-test';
import { renderRack } from './renderers/rack-renderer';
import { renderDevice } from './renderers/device-renderer';
import { renderCable, renderCableInProgress, resetPreviewDirection } from './renderers/cable-renderer';
import { renderTextLabel } from './renderers/text-label-renderer';
import { renderImageAsset } from './renderers/image-asset-renderer';
import { deviceCatalog, getTemplate } from './library/device-catalog';
import { generateId, distToSegment } from './utils/geometry';
import { initExportHandlers, downloadFile, exportJSON } from './utils/export';
import { computeSmartRouting, get3DefaultAnchors } from './utils/routing';
import { reorderById, ZOrderDirection } from './utils/z-order';
import { cloneDevice, cloneCloudConnector } from './utils/clone';
import { socketTypeAtOutletIndex } from './renderers/pdu-layout';
import { countDevicePowerCables } from './utils/power';
import { appendExportSummaryOverlay, getAutoSummaryCardOffset } from './renderers/export-summary-overlay';
import {
  RackData, DeviceData, PortData, CableData, LegendItem, TextLabel, ImageAsset,
  RACK_CONSTANTS, CABLE_COLORS, CableType, SelectableItem, Point, ToolMode, SocketType,
  CloudNode, CloudContainer, CloudConnector, CloudHandleSide, CloudArrowType, CloudHierarchy, CloudProvider
} from './core/types';
import { ThreeViewport } from './three/ThreeViewport';
import { CloudCanvasManager } from './core/cloud-canvas';
import { renderCloudNode, nodeEdgeWorldPoint, nodeCenterWorldPoint } from './renderers/cloud-node-renderer';
import { renderCloudContainer } from './renderers/cloud-container-renderer';
import { renderCloudHierarchy, getNaturalHierarchySize } from './renderers/cloud-hierarchy-renderer';
import { renderCloudConnector, inferBestSide, CLOUD_CONNECTOR_LINE_STYLES } from './renderers/cloud-connector-renderer';
import { getCloudIcon, isBoundaryIcon, inferContainerKind, CLOUD_SHAPE_KINDS } from './library/cloud-icon-catalog';
import { hierarchyLevelsToLine, hierarchyLevelIcon } from './library/hierarchy-parser';
import { showHierarchyInputModal } from './components/hierarchy-input-modal';
import { showStartupModal, StartupChoice } from './components/startup-modal';

type CloudConnectorSegmentKind = 'entryStub' | 'entry' | 'crossbar' | 'exit' | 'exitStub';
/** Maps a dragged segment's `kind` (see routeHandlesFor() in cloud-connector-renderer.ts) to the
 *  CloudConnector field the drag writes. */
const SEGMENT_KIND_FIELD: Record<CloudConnectorSegmentKind, 'entryStubOffset' | 'entryOffset' | 'crossbarOffset' | 'exitOffset' | 'exitStubOffset'> = {
  entryStub: 'entryStubOffset',
  entry: 'entryOffset',
  crossbar: 'crossbarOffset',
  exit: 'exitOffset',
  exitStub: 'exitStubOffset',
};

export class App {
  private canvas!: CanvasManager;
  private threeViewport?: ThreeViewport;
  private toolbar!: Toolbar;
  private sidebar!: Sidebar;
  private properties!: PropertiesPanel;
  private statusbar!: StatusBar;
  private contextMenu!: ContextMenu;
  private floatingToolbar!: FloatingToolbar;
  private cloudFloatingToolbar!: CloudFloatingToolbar;
  private presenterDashboard!: PresenterDashboard;

  // Clipboard for copy/paste
  private clipboard: DeviceData | null = null;

  // The on-disk file this project was last opened from or saved to (File System Access API —
  // Chromium-based browsers only). Lets plain "Save" re-write the same file/location without
  // re-prompting, once the user has picked a destination once via "Save As" or "Open".
  private fileHandle: any = null;

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

  // Cloning state (Ctrl+Drag)
  private cloningMode = false;
  private cloneThresholdMet = false;
  private dragOriginalDevice: DeviceData | null = null;

  // Cable dragging state
  private isDraggingCableEnd = false;
  private draggedCableId: string | null = null;
  private draggedHandleType: 'source' | 'dest' | null = null;

  // Anchor point dragging state
  private isDraggingAnchor = false;
  private draggedAnchorCableId: string | null = null;
  private draggedAnchorIndex: number = -1;
  private draggedAnchorRealIndex: number = -1;

  // Label pointer (device callout) anchor dragging state — mirrors the cable anchor state
  // above, for TextLabel.pointerAnchorPoints when pointerStyle === 'flexible'.
  private isDraggingLabelAnchor = false;
  private draggedLabelAnchorTextId: string | null = null;
  private draggedLabelAnchorIndex: number = -1;

  // Label pointer STARTING point (the device-end dot / pointerAnchorX/Y) dragging state — lets
  // the leader line's attachment point on the device be repositioned after the label was placed,
  // instead of being fixed forever to wherever it was first clicked.
  private isDraggingLabelStartAnchor = false;
  private draggedLabelStartAnchorTextId: string | null = null;

  // History tracking states for atomic drag undo
  private dragStartDevicesState: DeviceData[] | null = null;
  private dragStartCablesState: CableData[] | null = null;
  private dragStartRacksState: RackData[] | null = null;

  // Rack dragging state
  private isDraggingRack = false;
  private draggedRackId: string | null = null;
  private dragStartRackX = 0;

  // Text label dragging state
  private isDraggingText = false;
  private draggedTextId: string | null = null;
  private dragStartTextX = 0;
  private dragStartTextY = 0;
  private dragStartTextLabelsState: TextLabel[] | null = null;
  // A text-tool placement click is fully handled by the mousedown handler (creates the label,
  // selects it, reverts to select tool) — the native 'click' that follows must be swallowed, or
  // the separate click handler below (which doesn't know about text labels) falls through to its
  // "clicked empty canvas -> deselect" branch and immediately wipes the selection it just made.
  private suppressNextClick = false;

  // Image asset dragging/resizing state
  private isDraggingImage = false;
  private draggedImageId: string | null = null;
  private dragStartImageX = 0;
  private dragStartImageY = 0;
  private isResizingImage = false;
  private resizedImageId: string | null = null;
  private dragStartImageWidth = 0;
  private dragStartImageHeight = 0;
  private dragStartImageAssetsState: ImageAsset[] | null = null;
  private imageFileInput!: HTMLInputElement;

  // Summary Card Preview drag state — re-renders each mousemove frame with a transient live
  // offset (same pattern as rack dragging's skipHistory setState), so no undo-history entries
  // pile up until the final position is committed via 'rack:update' on mouseup.
  private isDraggingSummaryCard = false;
  private draggedSummaryRackId: string | null = null;
  private dragStartSummaryOffset: { x: number; y: number } = { x: 0, y: 0 };
  private summaryCardDragPreview: { rackId: string; offset: { x: number; y: number } } | null = null;

  // Mouse screen position tracking for tooltip
  private lastMouseScreenX = 0;
  private lastMouseScreenY = 0;

  // Rubber-band multi-select state
  private isRubberBanding = false;
  private rubberBandStart: Point = { x: 0, y: 0 };
  private rubberBandEl: SVGRectElement | null = null;

  private isDrawingExportArea = false;
  private exportAreaStart: Point = { x: 0, y: 0 };
  private exportAreaStartScreen: { x: number; y: number } = { x: 0, y: 0 };
  private exportAreaEl: SVGRectElement | null = null;

  // === Cloud Architecture canvas (standalone diagram mode) ===
  // Nullable + wrapped in try/catch at mount (see init()) — mirrors the 3D-viewport fallback
  // pattern above: a handful of test skeletons (and, in principle, any future host page) mount
  // #canvas-viewport without #cloud-viewport/#cloud-canvas, and CloudCanvasManager's constructor
  // throws if those elements are missing. renderCloudAll() no-ops when this is null; everything
  // else that touches it only runs from inside the same successful-mount branch.
  private cloudCanvas: CloudCanvasManager | null = null;

  // Cloud node/container drag+resize state (shared drag-start fields, discriminated by which
  // of draggedCloudNodeId/draggedCloudContainerId is set, mirrors ImageAsset's single-flow
  // drag+resize pattern above but for two object kinds at once).
  private draggedCloudNodeId: string | null = null;
  private isResizingCloudNode = false;
  private draggedCloudContainerId: string | null = null;
  private isResizingCloudContainer = false;
  private draggedCloudHierarchyId: string | null = null;
  private isResizingCloudHierarchy = false;
  private dragStartCloudWorldPos: Point = { x: 0, y: 0 };
  private dragStartCloudX = 0;
  private dragStartCloudY = 0;
  private dragStartCloudWidth = 0;
  private dragStartCloudHeight = 0;
  private dragStartCloudNodesState: CloudNode[] | null = null;
  private dragStartCloudContainersState: CloudContainer[] | null = null;
  private dragStartCloudHierarchiesState: CloudHierarchy[] | null = null;

  // Container-draw tool (mirrors export-area's mousedown-drag-mouseup rectangle tool)
  private isDrawingCloudContainer = false;
  private cloudContainerDrawStart: Point = { x: 0, y: 0 };
  private cloudContainerDrawEl: SVGRectElement | null = null;
  /** Set when the container-draw tool was auto-triggered either by dropping a boundary-type
   *  palette icon (e.g. Azure "Virtual Networks" — iconId/provider populated) or by one of the
   *  dedicated toolbar shape buttons (Region/AZ/VPC/Subnet/Resource Group/Account — kind+label
   *  only, no icon) instead of the generic manual container tool. The next draw gesture uses
   *  this instead of the generic defaults. Cleared after one draw (or on cancel), so a manual
   *  container tool use right after isn't affected. */
  private pendingCloudContainerSpec: { kind: CloudContainer['kind']; iconId?: string; provider?: CloudNode['provider'] | null; label: string } | null = null;

  // Cloud export-area draw tool (mirrors the rack canvas's isDrawingExportArea/exportAreaEl above)
  private isDrawingCloudExportArea = false;
  private cloudExportAreaStart: Point = { x: 0, y: 0 };
  private cloudExportAreaStartScreen: { x: number; y: number } = { x: 0, y: 0 };
  private cloudExportAreaEl: SVGRectElement | null = null;

  // Connect tool — supports both click-source-then-click-dest (mirrors the cable tool) AND a
  // natural press-drag-release gesture in one motion (see the mouseup handler in
  // setupCloudCanvasInteractions()): cloudConnectMouseDownScreen records where the source click
  // happened so a mouseup can tell "released after a real drag onto another node" apart from
  // "released in place, waiting for a separate second click".
  private cloudConnectSourceId: string | null = null;
  /** Which side of the source node the drag actually started from (set when it began on a
   *  connection handle; undefined when started via the Connect tool's node-body click, which has
   *  no specific side — the renderer infers one automatically in that case, see
   *  inferBestSide() in cloud-connector-renderer.ts). */
  private cloudConnectSourceSide: CloudHandleSide | undefined = undefined;
  private cloudConnectMouseDownScreen: { x: number; y: number } | null = null;
  /** Node id currently under the cursor while dragging a connector, tracked from mousemove's own
   *  event target (a real DOM hit-test from event dispatch) rather than looked up on mouseup via
   *  document.elementFromPoint — same result in a real browser, but avoids a geometric
   *  point-lookup API that has known quirks with layered/transformed SVG and isn't implementable
   *  in a layout-less test DOM. null means "over empty canvas" (still a valid drop target for a
   *  floating-point connector end), undefined means "not tracked yet this drag". */
  private cloudConnectHoverNodeId: string | null | undefined = undefined;
  /** Tracks whichever cloud node the mouse is idly resting over (no drag/tool gesture active) so
   *  its connection handles reveal on hover alone — matching common diagram-tool conventions and
   *  removing the "click to select first" step that made both starting and, especially, landing
   *  a connector hard to discover. */
  private hoveredCloudNodeId: string | null = null;
  /** Which specific handle (if any) is under the cursor — set only when hovering an exact
   *  connection dot on the target node, so dropping there routes into that exact side instead of
   *  an auto-inferred one. */
  private cloudConnectHoverSide: CloudHandleSide | undefined = undefined;
  private cloudConnectPreviewEl: SVGLineElement | null = null;

  private dragStartCloudConnectorsState: CloudConnector[] | null = null;

  // Connector endpoint (tip) dragging — re-dragging an already-drawn connector's source or dest
  // end onto a different node (or empty canvas, becoming a floating point), mirrors the rack
  // canvas's cable-end drag (isDraggingCableEnd/draggedCableId/draggedHandleType). Reuses
  // cloudConnectHoverNodeId/cloudConnectHoverSide for hover tracking during the drag, same as
  // drawing a brand-new connector, since the two gestures never happen at once.
  private draggedConnectorEndpoint: { connectorId: string; end: 'source' | 'dest' } | null = null;

  /** Dragging one point of a connector's fully-manual waypoint list (see CloudConnector.waypoints
   *  and the "Add Waypoint Here" / "Remove Waypoint" context-menu actions in
   *  setupCloudContextMenu()) — mirrors draggedConnectorSegment's undo-collapsing pattern, one
   *  entry for the whole drag via dragStartCloudConnectorsState. */
  private draggedConnectorWaypoint: { connectorId: string; index: number } | null = null;

  /** Dragging one of a connector's up to 3 segment dots — entry/crossbar/exit, see
   *  routeHandlesFor() in cloud-connector-renderer.ts — the simple "move this horizontal/vertical
   *  line" gesture, distinct from re-aiming a tip. `kind` selects which CloudConnector field the
   *  drag writes (entryOffset/crossbarOffset/exitOffset). Reuses dragStartCloudConnectorsState for
   *  its undo-snapshot, same as draggedConnectorEndpoint, since the two drags never happen at once. */
  private draggedConnectorSegment: { connectorId: string; axis: 'x' | 'y'; kind: CloudConnectorSegmentKind } | null = null;

  init() {
    // Initialize canvas
    this.canvas = new CanvasManager('canvas-viewport', 'canvas');

    // Mount 3D viewport — wrapped so a WebGL failure never kills the 2D app
    const canvas3d = document.getElementById('canvas-3d');
    if (canvas3d) {
      try {
        this.threeViewport = new ThreeViewport();
        this.threeViewport.mount(canvas3d);
        this.addCameraPresetButtons(canvas3d);
        this.addDoorPanel(canvas3d);
        this.addNavPanel(canvas3d);
      } catch (err) {
        console.error('[ThreeViewport] 3D init failed, continuing in 2D-only mode:', err);
        canvas3d.style.display = 'none';
        const splitter = document.getElementById('splitter-3d');
        if (splitter) splitter.style.display = 'none';
      }
    }

    // Mount the Cloud Architecture canvas — independent of the rack canvas/3D viewport above
    // (see core/cloud-canvas.ts for why it's not a second CanvasManager instance). Wrapped so a
    // missing #cloud-viewport/#cloud-canvas (e.g. a test skeleton without it) never kills the
    // rest of app init, same reasoning as the 3D viewport's try/catch just above.
    try {
      this.cloudCanvas = new CloudCanvasManager('cloud-viewport', 'cloud-canvas');
      this.setupCloudCanvasInteractions();
      this.setupCloudDragDrop();
      this.setupCloudContextMenu();
      this.setupCloudAreaSelect();
    } catch (err) {
      console.error('[CloudCanvas] init failed, Cloud Architecture view will be unavailable:', err);
    }

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
    // Its Cloud Architecture counterpart — mounted inside #cloud-viewport, so it's naturally
    // hidden/shown alongside the rest of that view (see setActiveView()'s .hidden toggling).
    this.cloudFloatingToolbar = new CloudFloatingToolbar();

    // Initialize Presenter Mode Dashboard
    this.presenterDashboard = new PresenterDashboard();

    // Initialize toast notifications — every export/save/undo/redo/etc. success or failure is
    // emitted as a 'notification' event; without this listener they all resolved into silence.
    new NotificationCenter();

    // Initialize the Text Tool panel — opens when the Text tool is activated or an existing
    // label is selected; independently closeable via its own ✕ button (see text-tool-panel.ts).
    new TextToolPanel();

    // Initialize the Image Tool panel — opens when an uploaded image is selected; same
    // independently-closeable pattern (see image-tool-panel.ts).
    new ImageToolPanel();

    this.setupImageUpload();

    // Render UI
    this.toolbar.render();
    this.sidebar.render();
    this.properties.render();
    this.statusbar.render();

    // Initialize inline AI hints in the properties panel
    initAIHints();

    // Setup event bridges
    this.setupToolbarBridge();
    this.setupCanvasInteractions();
    this.setupDragDrop();
    this.setupKeyboardShortcuts();
    this.setupSelectionHandling();
    this.setupContextMenuHandling();

    // Setup export handlers
    initExportHandlers();

    // The only thing that actually mutates state on a file load is importJSON()'s
    // stateManager.setState(...), inside export.ts's own 'project:load' listener (registered
    // just above by initExportHandlers()) — this one re-renders the canvas afterward.
    // Registration order matters: this must be added AFTER initExportHandlers() so importJSON
    // runs first and this renders the NEW state, not the stale pre-import one.
    (eventBus as any).on('project:load', () => {
      this.renderAll();
      this.renderCloudAll();
    });

    // Initial render
    this.renderAll();
    this.renderCloudAll();

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
    // Removing a manually-added port must also drop any cable plugged into it (same cleanup
    // pattern as stateManager.removeDevice) — a dangling sourcePortId/destPortId would otherwise
    // point at nothing and render at the fallback (0,0) origin.
    eventBus.on('device:remove-port', ({ deviceId, portId }) => {
      const device = stateManager.getDevice(deviceId);
      if (!device) return;
      const ports = device.ports.filter(p => p.id !== portId);
      const cables = stateManager.getState().cables.filter(c => c.sourcePortId !== portId && c.destPortId !== portId);
      const devices = stateManager.getState().devices.map(d => d.id === deviceId ? { ...d, ports } : d);
      stateManager.setState({ devices, cables });
      this.renderAll();
      this.properties.update(stateManager.getState().selection);
      eventBus.emit('notification', { message: 'Port removed', type: 'info' });
    });
    eventBus.on('cable:added', () => this.renderAll());
    eventBus.on('cable:removed', () => this.renderAll());
    eventBus.on('cable:update', ({ id, data }) => {
      const cables = stateManager.getState().cables.map(c => c.id === id ? { ...c, ...data } : c);
      stateManager.setState({ cables });
      this.renderAll();
    });
    eventBus.on('textlabel:update', ({ id, data }) => {
      const textLabels = stateManager.getState().textLabels.map(t => t.id === id ? { ...t, ...data } : t);
      stateManager.setState({ textLabels });
      this.renderAll();
    });
    eventBus.on('imageasset:update', ({ id, data }) => {
      const imageAssets = stateManager.getState().imageAssets.map(a => a.id === id ? { ...a, ...data } : a);
      stateManager.setState({ imageAssets });
      this.renderAll();
    });
    eventBus.on('cloudnode:update', ({ id, data }) => {
      const cloudNodes = stateManager.getState().cloudNodes.map(n => n.id === id ? { ...n, ...data } : n);
      stateManager.setState({ cloudNodes });
      this.renderCloudAll();
    });
    eventBus.on('cloudcontainer:update', ({ id, data }) => {
      const cloudContainers = stateManager.getState().cloudContainers.map(c => c.id === id ? { ...c, ...data } : c);
      stateManager.setState({ cloudContainers });
      this.renderCloudAll();
    });
    eventBus.on('cloudconnector:update', ({ id, data }) => {
      const cloudConnectors = stateManager.getState().cloudConnectors.map(c => c.id === id ? { ...c, ...data } : c);
      stateManager.setState({ cloudConnectors });
      this.renderCloudAll();
    });
    eventBus.on('cloudhierarchy:update', ({ id, data }) => {
      const cloudHierarchies = stateManager.getState().cloudHierarchies.map(h => h.id === id ? { ...h, ...data } : h);
      stateManager.setState({ cloudHierarchies });
      this.renderCloudAll();
    });
    eventBus.on('cloudhierarchy:prime', (provider) => {
      const svgEl = document.getElementById('cloud-canvas');
      const rect = svgEl?.getBoundingClientRect();
      const center = rect && this.cloudCanvas
        ? this.cloudCanvas.screenToWorld({ x: rect.left + rect.width / 2, y: rect.top + 80 })
        : { x: 80, y: 80 };
      const cascade = (stateManager.getState().cloudHierarchies.length % 6) * 24;

      showHierarchyInputModal({
        provider: provider ?? 'azure',
        onSubmit: (provider, levels) => {
          const hierarchy: CloudHierarchy = {
            id: 'cloud-hierarchy-' + crypto.randomUUID(),
            provider,
            x: center.x + cascade,
            y: center.y + cascade,
            levels,
          };
          stateManager.addCloudHierarchy(hierarchy);
          const selection: SelectableItem[] = [{ type: 'cloud-hierarchy', id: hierarchy.id }];
          stateManager.setState({ selection });
          eventBus.emit('selection:changed', selection);
          this.renderCloudAll();
        },
      });
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
    eventBus.on('ai:preview-diff', (_diff) => {
      this.renderAll();
    });

    // Set dark theme on body
    document.body.setAttribute('data-theme', stateManager.getState().theme);

    this.showStartupModal();

    console.log('Rack Slicer initialized');
  }

  /** Startup landing screen (see components/startup-modal.ts) — shown on every load, letting the
   *  user pick Rack Design / AWS / Azure / GCP / Hybrid before landing on a canvas. A pure
   *  navigation shortcut: each choice does exactly what its sidebar nav-tree equivalent does
   *  (see sidebar.ts's NAV_TREE + focusCloudProvider()) and never touches project data, so it's
   *  safe to show even when reopening a project that already has content. Dismissing without a
   *  choice (✕ / Escape) leaves the view exactly as it already was. */
  private showStartupModal(): void {
    showStartupModal((choice: StartupChoice | null) => {
      if (!choice) return;
      if (choice === 'rack') {
        eventBus.emit('view:switch', 'rack');
        return;
      }
      // 'hybrid' lands unscoped (every provider section collapsed, search unscoped) so Local
      // Resources/On-Prem/AWS/Azure/GCP are all equally reachable; aws/azure/gcp focus their own
      // section, same as clicking that provider in the sidebar's Cloud nav group.
      this.sidebar.focusCloudProvider(choice === 'hybrid' ? null : choice);
      eventBus.emit('view:switch', 'cloud');
    });
  }

  /**
   * Bridge toolbar component events (non-standard names) to actual state operations.
   */
  private setupToolbarBridge() {
    // Tool changes
    eventBus.on('tool:changed', (mode: ToolMode) => {
      const prevTool = stateManager.getState().tool;
      if (prevTool === 'export-area' && mode !== 'export-area' && this.isDrawingExportArea) {
        this.exportAreaEl?.remove();
        this.isDrawingExportArea = false;
        this.exportAreaEl = null;
        eventBus.emit('export:area-selection-cancelled', undefined);
      }
      if (prevTool === 'cloud-export-area' && mode !== 'cloud-export-area' && this.isDrawingCloudExportArea) {
        this.cloudExportAreaEl?.remove();
        this.isDrawingCloudExportArea = false;
        this.cloudExportAreaEl = null;
        eventBus.emit('export:cloud-area-selection-cancelled', undefined);
      }
      // Switching away from the cloud-container tool by any path (not just Escape) — e.g.
      // clicking a different tool button directly while a boundary-icon drop primed it — drops
      // any pending draw-preview and the primed icon so a later manual container draw isn't
      // silently mislabeled with a stale dropped icon.
      if (prevTool === 'cloud-container' && mode !== 'cloud-container') {
        this.cancelCloudContainerDraw();
      }
      if (prevTool === 'cloud-connect' && mode !== 'cloud-connect') {
        this.cancelCloudConnect();
      }
      stateManager.setState({ tool: mode });
      this.updateCanvasCursor(mode);
    });

    // Export flow requests the user draw a custom area on the canvas
    eventBus.on('export:request-area-selection', () => {
      eventBus.emit('tool:changed', 'export-area');
    });
    eventBus.on('export:cloud-request-area-selection', () => {
      eventBus.emit('tool:changed', 'cloud-export-area');
    });

    // File operations — no background auto-save; Save/Save As/Open are real file downloads/
    // reads, and beforeunload (below) warns before any unsaved work is lost.
    (eventBus as any).on('file:new', () => {
      const current = stateManager.getState();
      const stakes = `${current.devices.length} device${current.devices.length === 1 ? '' : 's'} and ${current.cables.length} cable${current.cables.length === 1 ? '' : 's'}`;
      if (confirm(`Start a new project? This will clear ${stakes} from the canvas.\n\nIf you want to keep your current work, save it first.`)) {
        this.fileHandle = null; // a fresh project isn't the file that was previously open
        stateManager.setState({
          racks: [
            { id: generateId(), name: 'Rack 1', units: 42, x: 300, y: 100, showPduLeft: true, showPduRight: true },
          ],
          devices: [],
          cables: [],
          textLabels: [],
          imageAssets: [],
          selection: [],
          showLegends: true,
        });
        this.renderAll();
        eventBus.emit('notification', { message: 'New project started', type: 'info' });
      }
    });

    (eventBus as any).on('file:demo', () => {
      const current = stateManager.getState();
      const stakes = `${current.devices.length} device${current.devices.length === 1 ? '' : 's'} and ${current.cables.length} cable${current.cables.length === 1 ? '' : 's'}`;
      if (!confirm(`Load the demo cluster? This will replace ${stakes} currently on the canvas.\n\nIf you want to keep your current work, save it first.`)) {
        return;
      }
      this.fileHandle = null; // the demo cluster isn't the file that was previously open
      stateManager.loadDemoProject(); // emits its own 'Loaded demo project!' notification
      this.renderAll();
    });

    // Save re-writes the same file/location the project was last opened from or saved to
    // (Chromium's File System Access API), so it behaves like a normal desktop app's Ctrl+S —
    // only "Save As" (or the very first Save) prompts for a destination.
    (eventBus as any).on('file:save', () => {
      this.saveProject(false);
    });

    (eventBus as any).on('file:save-as', () => {
      this.saveProject(true);
    });

    (eventBus as any).on('file:open', () => {
      this.openProject();
    });

    // Warn before leaving the tab with unsaved work — the only safety net now that there's no
    // background auto-save.
    window.addEventListener('beforeunload', (e) => {
      if (stateManager.hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
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

    (eventBus as any).on('cable:toggle-airdrop-destination', () => {
      const s = stateManager.getState();
      stateManager.setState({ airdropDestination: !s.airdropDestination });
      eventBus.emit('notification', {
        message: s.airdropDestination
          ? 'Airdrop Destination off — cables must land on a real port again'
          : 'Airdrop Destination on — draw a cable from a real source port, then click anywhere to finish it there',
        type: 'info',
      });
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

    (eventBus as any).on('view:toggle-side', () => {
      const s = stateManager.getState();
      stateManager.setState({ cabinetViewMode: s.cabinetViewMode === 'front' ? 'rear' : 'front' });
      this.renderAll();
    });

    (eventBus as any).on('view:toggle-skeleton', () => {
      const s = stateManager.getState();
      stateManager.setState({ cabinetDrawMode: s.cabinetDrawMode === 'default' ? 'skeleton' : 'default' });
      this.renderAll();
    });

    (eventBus as any).on('view:toggle-cover', () => {
      const s = stateManager.getState();
      stateManager.setState({ cabinetCoverVisible: !s.cabinetCoverVisible });
      this.renderAll();
    });

    (eventBus as any).on('view:switch', (view: 'rack' | 'cloud') => {
      this.setActiveView(view);
    });

    eventBus.on('cloud-shape:prime', (kind) => {
      const shape = CLOUD_SHAPE_KINDS.find(s => s.kind === kind);
      this.pendingCloudContainerSpec = { kind, label: shape?.label ?? kind };
      eventBus.emit('tool:changed', 'cloud-container');
      eventBus.emit('notification', { message: `Drag on the canvas to draw the ${shape?.label ?? kind}`, type: 'info' });
    });

    (eventBus as any).on('view:toggle-3d', () => {
      const s = stateManager.getState();
      stateManager.setState({ isometricMode: !s.isometricMode });
      this.renderAll();
    });

    (eventBus as any).on('view:toggle-presenter', () => {
      const s = stateManager.getState();
      const newPresenterMode = !s.presenterMode;
      stateManager.setState({ presenterMode: newPresenterMode });
      
      const workspace = document.getElementById('workspace');
      const sidebar = document.getElementById('sidebar');
      const properties = document.getElementById('properties-panel');
      const statusbar = document.getElementById('statusbar');
      
      if (newPresenterMode) {
        workspace?.classList.add('presenter-active');
        sidebar?.classList.add('hidden');
        properties?.classList.add('hidden');
        statusbar?.classList.add('hidden');
        this.presenterDashboard.toggle(true);
      } else {
        workspace?.classList.remove('presenter-active');
        sidebar?.classList.remove('hidden');
        properties?.classList.remove('hidden');
        statusbar?.classList.remove('hidden');
        this.presenterDashboard.toggle(false);
      }
      this.renderAll();
    });

    (eventBus as any).on('view:toggle-cable-tray-mode', () => {
      const s = stateManager.getState();
      const newMode = s.cableRoutingTrayMode === 'underfloor' ? 'overhead' : 'underfloor';
      stateManager.setState({ cableRoutingTrayMode: newMode });
      this.renderAll();
      eventBus.emit('notification', { 
        message: `Cable routing tray set to ${newMode.toUpperCase()} mode`, 
        type: 'info' 
      });
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
      this.renderCloudAll();
      this.properties.update(stateManager.getState().selection);
    });
    (eventBus as any).on('edit:redo', () => {
      stateManager.redo();
      this.renderAll();
      this.renderCloudAll();
      this.properties.update(stateManager.getState().selection);
    });
    (eventBus as any).on('edit:delete', () => this.deleteSelection());

    // Transform tracking for status bar
    eventBus.on('canvas:transformed', (transform) => {
      (eventBus as any).emit('canvas:zoom', transform.scale);
    });

    // Run automated self-test runner on boot in development environment
    if (import.meta.env.DEV) {
      setTimeout(() => {
        runSelfTests();
      }, 1000);
    }

    // Initialize AI Key Modal
    this.setupAiKeyModal();

    // Initialize AI Chat Panel
    new AIPanel();

    // Initialize Port Hover Tooltip
    const portTooltip = new PortTooltip();
    eventBus.on('port:hover', (portId: string | null) => {
      if (!portId) {
        portTooltip.hide();
      } else {
        portTooltip.show(portId, this.lastMouseScreenX, this.lastMouseScreenY);
      }
    });
  }

  /**
   * Initialize the AI Key Modal
   */
  private setupAiKeyModal(): void {
    const modal = document.getElementById('ai-key-modal');
    const input = document.getElementById('ai-key-input') as HTMLInputElement;
    const toggleBtn = document.getElementById('ai-key-toggle');
    const skipBtn = document.getElementById('ai-key-skip');
    const connectBtn = document.getElementById('ai-key-connect');

    if (!modal || !input || !toggleBtn || !skipBtn || !connectBtn) return;

    toggleBtn.addEventListener('click', () => {
      input.type = input.type === 'password' ? 'text' : 'password';
    });

    skipBtn.addEventListener('click', () => {
      modal.classList.add('hidden');
      stateManager.setState({ aiMode: true });
      eventBus.emit('ai:mode-changed', true);
    });

    connectBtn.addEventListener('click', () => {
      const key = input.value.trim();
      if (key) {
        ClaudeProvider.saveKey(key);
        eventBus.emit('notification', { message: 'Claude API key saved', type: 'success' });
      }
      modal.classList.add('hidden');
      stateManager.setState({ aiMode: true });
      eventBus.emit('ai:mode-changed', true);
    });

    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
        modal.classList.add('hidden');
        stateManager.setState({ aiMode: true });
        eventBus.emit('ai:mode-changed', true);
      }
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
      this.lastMouseScreenX = e.clientX;
      this.lastMouseScreenY = e.clientY;
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
          // Use the full route (all waypoints) so dragging one handle doesn't collapse a
          // cross-rack 8-point route into a 3-point route and destroy the cable path.
          const fullRoute = (targetCable.anchorPoints && targetCable.anchorPoints.length > 0)
            ? targetCable.anchorPoints
            : computeSmartRouting(targetCable, sourcePos, destPos);
          const realIdx = this.draggedAnchorRealIndex >= 0 ? this.draggedAnchorRealIndex : idx;
          const updatedAnchors = fullRoute.map((p: Point, i: number) =>
            i === realIdx ? { ...this.mouseWorldPos } : p
          );

          const cables = sState.cables.map(c =>
            c.id === cableId ? { ...c, anchorPoints: updatedAnchors, anchorsLocked: true } : c
          );
          stateManager.setState({ cables }, true);
          this.renderAll();
          return;
        }
      }

      // Label pointer STARTING point drag handling — repositions pointerAnchorX/Y (the device-
      // local offset), converting the live mouse world position back into device-local
      // coordinates via the device's current origin so it stays correct even if the device was
      // also just moved.
      if (this.isDraggingLabelStartAnchor && this.draggedLabelStartAnchorTextId !== null) {
        const textId = this.draggedLabelStartAnchorTextId;
        const targetLabel = stateManager.getState().textLabels.find(t => t.id === textId);
        const origin = targetLabel?.pointerDeviceId ? stateManager.getDeviceWorldOrigin(targetLabel.pointerDeviceId) : null;
        if (targetLabel && origin) {
          const textLabels = stateManager.getState().textLabels.map(t =>
            t.id === textId
              ? { ...t, pointerAnchorX: this.mouseWorldPos.x - origin.x, pointerAnchorY: this.mouseWorldPos.y - origin.y }
              : t
          );
          stateManager.setState({ textLabels }, true);
          this.renderAnnotationLayer();
          return;
        }
      }

      // Label pointer anchor drag handling — same pattern as the cable anchor block above, but
      // for TextLabel.pointerAnchorPoints. Only the annotation layer needs to move (see the
      // note on renderAnnotationLayer() — a full renderAll() on every mousemove is what made
      // dragging feel like it was stuttering before).
      if (this.isDraggingLabelAnchor && this.draggedLabelAnchorTextId !== null) {
        const textId = this.draggedLabelAnchorTextId;
        const idx = this.draggedLabelAnchorIndex;
        const targetLabel = stateManager.getState().textLabels.find(t => t.id === textId);
        if (targetLabel) {
          const anchors = [...(targetLabel.pointerAnchorPoints ?? [])];
          anchors[idx] = { ...this.mouseWorldPos };
          const textLabels = stateManager.getState().textLabels.map(t =>
            t.id === textId ? { ...t, pointerAnchorPoints: anchors } : t
          );
          stateManager.setState({ textLabels }, true);
          this.renderAnnotationLayer();
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

      // Summary Card Preview drag handling
      if (this.isDraggingSummaryCard && this.draggedSummaryRackId) {
        const dx = this.mouseWorldPos.x - this.dragStartWorldPos.x;
        const dy = this.mouseWorldPos.y - this.dragStartWorldPos.y;
        this.summaryCardDragPreview = {
          rackId: this.draggedSummaryRackId,
          offset: { x: this.dragStartSummaryOffset.x + dx, y: this.dragStartSummaryOffset.y + dy },
        };
        this.renderAll();
        return;
      }

      // Rack drag handling
      if (this.isDraggingRack && this.draggedRackId) {
        const dx = this.mouseWorldPos.x - this.dragStartWorldPos.x;
        let targetX = this.dragStartRackX + dx;
        if (s.snapEnabled) {
          targetX = Math.round(targetX / RACK_CONSTANTS.GRID_SIZE) * RACK_CONSTANTS.GRID_SIZE;
        }
        const racks = stateManager.getState().racks.map(r =>
          r.id === this.draggedRackId ? { ...r, x: targetX } : r
        );
        stateManager.setState({ racks }, true);
        this.renderAll();
        return;
      }

      // Text label drag handling — tracks the cursor 1:1 with no grid rounding while live (grid
      // snapping here made it visibly hop in GRID_SIZE (20 world-unit) steps every mousemove,
      // which reads as huge jumps once zoomed in enough to matter — snapping is applied once,
      // on drop, instead (see the mouseup handler below).
      if (this.isDraggingText && this.draggedTextId) {
        const dx = this.mouseWorldPos.x - this.dragStartWorldPos.x;
        const dy = this.mouseWorldPos.y - this.dragStartWorldPos.y;
        const targetX = this.dragStartTextX + dx;
        const targetY = this.dragStartTextY + dy;
        const textLabels = stateManager.getState().textLabels.map(t =>
          t.id === this.draggedTextId ? { ...t, x: targetX, y: targetY } : t
        );
        stateManager.setState({ textLabels }, true);
        // Only the annotation layer needs to move — not a full canvas rebuild (see
        // renderAnnotationLayer()'s doc comment for why this matters here specifically).
        this.renderAnnotationLayer();
        return;
      }

      // Image asset resize handling — smooth (no grid rounding) while live, same reasoning as
      // the text-label drag above; preserves aspect ratio from the drag-start dimensions.
      if (this.isResizingImage && this.resizedImageId) {
        const dx = this.mouseWorldPos.x - this.dragStartWorldPos.x;
        const aspect = this.dragStartImageWidth / this.dragStartImageHeight;
        const newWidth = Math.max(20, this.dragStartImageWidth + dx);
        const newHeight = newWidth / aspect;
        const imageAssets = stateManager.getState().imageAssets.map(a =>
          a.id === this.resizedImageId ? { ...a, width: newWidth, height: newHeight } : a
        );
        stateManager.setState({ imageAssets }, true);
        this.renderAnnotationLayer();
        return;
      }

      // Image asset drag handling — smooth (no grid rounding) while live; see the text-label
      // drag note above for why.
      if (this.isDraggingImage && this.draggedImageId) {
        const dx = this.mouseWorldPos.x - this.dragStartWorldPos.x;
        const dy = this.mouseWorldPos.y - this.dragStartWorldPos.y;
        const targetX = this.dragStartImageX + dx;
        const targetY = this.dragStartImageY + dy;
        const imageAssets = stateManager.getState().imageAssets.map(a =>
          a.id === this.draggedImageId ? { ...a, x: targetX, y: targetY } : a
        );
        stateManager.setState({ imageAssets }, true);
        this.renderAnnotationLayer();
        return;
      }

      // Cloning mode threshold check (Ctrl+Drag)
      if (this.cloningMode && !this.cloneThresholdMet && this.dragOriginalDevice) {
        const dx = Math.abs(this.mouseWorldPos.x - this.dragStartWorldPos.x);
        const dy = Math.abs(this.mouseWorldPos.y - this.dragStartWorldPos.y);
        if (dx > 4 || dy > 4) {
          this.cloneThresholdMet = true;
          const clone = cloneDevice(this.dragOriginalDevice);
          stateManager.addDevice(clone);
          this.isDraggingDevice = true;
          this.draggedDeviceId = clone.id;
          this.dragStartWorldPos = this.mouseWorldPos;
          this.dragStartUnit = clone.startUnit;
          this.dragStartRackId = clone.rackId;
          const cloneEl = document.querySelector(`[data-device-id="${clone.id}"]`) as SVGGElement | null;
          if (cloneEl) cloneEl.style.opacity = '0.7';
          stateManager.setState({ selection: [{ type: 'device', id: clone.id }] });
          eventBus.emit('selection:changed', [{ type: 'device', id: clone.id }]);
        }
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

      // Rubber-band rect update
      if (this.isRubberBanding && this.rubberBandEl) {
        const x = Math.min(this.mouseWorldPos.x, this.rubberBandStart.x);
        const y = Math.min(this.mouseWorldPos.y, this.rubberBandStart.y);
        const w = Math.abs(this.mouseWorldPos.x - this.rubberBandStart.x);
        const h = Math.abs(this.mouseWorldPos.y - this.rubberBandStart.y);
        this.rubberBandEl.setAttribute('x', String(x));
        this.rubberBandEl.setAttribute('y', String(y));
        this.rubberBandEl.setAttribute('width', String(w));
        this.rubberBandEl.setAttribute('height', String(h));
      }

      // Export-area rect update
      if (this.isDrawingExportArea && this.exportAreaEl) {
        const x = Math.min(this.mouseWorldPos.x, this.exportAreaStart.x);
        const y = Math.min(this.mouseWorldPos.y, this.exportAreaStart.y);
        const w = Math.abs(this.mouseWorldPos.x - this.exportAreaStart.x);
        const h = Math.abs(this.mouseWorldPos.y - this.exportAreaStart.y);
        this.exportAreaEl.setAttribute('x', String(x));
        this.exportAreaEl.setAttribute('y', String(y));
        this.exportAreaEl.setAttribute('width', String(w));
        this.exportAreaEl.setAttribute('height', String(h));
      }
    });

    svgEl.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      const target = e.target as SVGElement;
      const s = stateManager.getState();

      // Export-area drawing takes absolute priority — no hit-testing against
      // cables/devices/racks while picking an export rectangle.
      if (s.tool === 'export-area') {
        this.exportAreaStart = this.canvas.screenToWorld({ x: e.clientX, y: e.clientY });
        this.exportAreaStartScreen = { x: e.clientX, y: e.clientY };
        const layer = this.canvas.getLayer('interaction-layer');
        if (layer) {
          const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          rect.id = 'export-area-rect';
          rect.setAttribute('fill', 'rgba(251,140,0,0.08)');
          rect.setAttribute('stroke', '#fb8c00');
          rect.setAttribute('stroke-width', '1');
          rect.setAttribute('stroke-dasharray', '4,2');
          rect.setAttribute('pointer-events', 'none');
          layer.appendChild(rect);
          this.exportAreaEl = rect;
          this.isDrawingExportArea = true;
        }
        e.stopPropagation();
        return;
      }

      // Text tool — owns the click entirely, same as export-area above: a click anywhere on
      // the canvas places a new label at that point rather than hit-testing racks/devices/cables.
      if (s.tool === 'text') {
        const worldPos = this.canvas.screenToWorld({ x: e.clientX, y: e.clientY });
        this.placeTextLabel(worldPos);
        this.suppressNextClick = true;
        e.stopPropagation();
        return;
      }

      // Label tool — owns the click entirely, but unlike text placement it requires an actual
      // device under the cursor (the whole point is a label that points AT something); a miss
      // just notifies and leaves the tool active rather than silently discarding the intent.
      if (s.tool === 'label') {
        const deviceElHit = target.closest('[data-device-id]') as SVGElement | null;
        const deviceId = deviceElHit?.getAttribute('data-device-id');
        if (deviceId) {
          const worldPos = this.canvas.screenToWorld({ x: e.clientX, y: e.clientY });
          this.placeDeviceLabel(deviceId, worldPos);
          this.suppressNextClick = true;
        } else {
          eventBus.emit('notification', { message: 'Click a device to point a label at it', type: 'info' });
        }
        e.stopPropagation();
        return;
      }

      // Check for anchor handle drag first (before cable-end handle)
      const anchorEl = target.closest('.cable-anchor-handle') as SVGElement;
      if (anchorEl) {
        const cableId = anchorEl.getAttribute('data-cable-id')!;
        const anchorIdx = parseInt(anchorEl.getAttribute('data-anchor-index') || '0', 10);
        this.isDraggingAnchor = true;
        this.draggedAnchorCableId = cableId;
        this.draggedAnchorIndex = anchorIdx;
        this.draggedAnchorRealIndex = parseInt(anchorEl.getAttribute('data-anchor-real-index') || String(anchorIdx), 10);
        this.dragStartWorldPos = this.canvas.screenToWorld({ x: e.clientX, y: e.clientY });
        this.dragStartCablesState = JSON.parse(JSON.stringify(stateManager.getState().cables));
        svgEl.classList.add('dragging-active');
        e.stopPropagation();
        return;
      }

      // Label pointer STARTING point handle (the device-end dot) — checked before the via-point
      // anchor handle below since both can render simultaneously on a flexible-style label.
      const labelStartEl = target.closest('.label-pointer-device-handle') as SVGElement;
      if (labelStartEl) {
        const textId = labelStartEl.getAttribute('data-text-id')!;
        this.isDraggingLabelStartAnchor = true;
        this.draggedLabelStartAnchorTextId = textId;
        this.dragStartTextLabelsState = JSON.parse(JSON.stringify(stateManager.getState().textLabels));
        svgEl.classList.add('dragging-active');
        e.stopPropagation();
        return;
      }

      // Label pointer (device callout) anchor handle — same priority tier as the cable anchor
      // handle above, mirroring its drag pattern for TextLabel.pointerAnchorPoints.
      const labelAnchorEl = target.closest('.label-pointer-anchor-handle') as SVGElement;
      if (labelAnchorEl) {
        const textId = labelAnchorEl.getAttribute('data-text-id')!;
        const anchorIdx = parseInt(labelAnchorEl.getAttribute('data-anchor-index') || '0', 10);
        this.isDraggingLabelAnchor = true;
        this.draggedLabelAnchorTextId = textId;
        this.draggedLabelAnchorIndex = anchorIdx;
        this.dragStartTextLabelsState = JSON.parse(JSON.stringify(stateManager.getState().textLabels));
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
        // Rack Load Summary / Cable Types card drag — checked first since these overlay
        // elements sit visually on top of everything else and carry their own data-rack-id,
        // unrelated to the rack/device hit-tests below. Always draggable whenever they're
        // rendered (i.e. whenever showLegends is true — see renderAll()), not gated behind a
        // separate "preview mode" — there's only one rendering of these now, and it's this one.
        const cardEl = target.closest('[data-draggable="true"]') as SVGGElement | null;
        if (cardEl) {
          const rackId = cardEl.getAttribute('data-rack-id');
          const rack = rackId ? stateManager.getRack(rackId) : null;
          if (rack) {
            this.isDraggingSummaryCard = true;
            this.draggedSummaryRackId = rack.id;
            this.dragStartWorldPos = this.canvas.screenToWorld({ x: e.clientX, y: e.clientY });
            this.dragStartSummaryOffset = rack.summaryCardOffset ?? getAutoSummaryCardOffset(rack, s.devices);
            this.summaryCardDragPreview = { rackId: rack.id, offset: this.dragStartSummaryOffset };
            e.stopPropagation();
            return;
          }
        }

        // Image resize handle — checked first since the handle sits right at the image's own
        // edge and carries the same data-image-id attribute as the image body below, which
        // would otherwise swallow it.
        const imgHandleEl = target.closest('.image-resize-handle') as SVGElement;
        if (imgHandleEl) {
          const imageId = imgHandleEl.getAttribute('data-image-id')!;
          const asset = stateManager.getState().imageAssets.find(a => a.id === imageId);
          if (asset && !asset.locked) {
            this.dragStartWorldPos = this.canvas.screenToWorld({ x: e.clientX, y: e.clientY });
            this.isResizingImage = true;
            this.resizedImageId = imageId;
            this.dragStartImageWidth = asset.width;
            this.dragStartImageHeight = asset.height;
            this.dragStartImageAssetsState = JSON.parse(JSON.stringify(stateManager.getState().imageAssets));
            svgEl.classList.add('dragging-active');
          }
          e.stopPropagation();
          return;
        }

        // Image asset click — free-floating annotation, same priority tier as text labels.
        const imageEl = target.closest('[data-image-id]') as SVGElement;
        if (imageEl) {
          const imageId = imageEl.getAttribute('data-image-id')!;
          const asset = stateManager.getState().imageAssets.find(a => a.id === imageId);
          if (asset) {
            stateManager.setState({ selection: [{ type: 'image', id: imageId }] });
            eventBus.emit('selection:changed', [{ type: 'image', id: imageId }]);
            if (!asset.locked) {
              this.dragStartWorldPos = this.canvas.screenToWorld({ x: e.clientX, y: e.clientY });
              this.isDraggingImage = true;
              this.draggedImageId = imageId;
              this.dragStartImageX = asset.x;
              this.dragStartImageY = asset.y;
              this.dragStartImageAssetsState = JSON.parse(JSON.stringify(stateManager.getState().imageAssets));
              svgEl.classList.add('dragging-active');
            }
            e.stopPropagation();
            return;
          }
        }

        // Text label click — checked ahead of device/rack hit-tests since labels are free-
        // floating annotations that can sit anywhere on the canvas, including on top of a rack.
        const textEl = target.closest('[data-text-id]') as SVGElement;
        if (textEl) {
          const textId = textEl.getAttribute('data-text-id')!;
          const label = stateManager.getState().textLabels.find(t => t.id === textId);
          if (label) {
            stateManager.setState({ selection: [{ type: 'text', id: textId }] });
            eventBus.emit('selection:changed', [{ type: 'text', id: textId }]);
            if (!label.locked) {
              this.dragStartWorldPos = this.canvas.screenToWorld({ x: e.clientX, y: e.clientY });
              this.isDraggingText = true;
              this.draggedTextId = textId;
              this.dragStartTextX = label.x;
              this.dragStartTextY = label.y;
              this.dragStartTextLabelsState = JSON.parse(JSON.stringify(stateManager.getState().textLabels));
              svgEl.classList.add('dragging-active');
            }
            e.stopPropagation();
            return;
          }
        }

        // Side-mount PDU click — checked ahead of the generic rack-drag branch below, since
        // its group lives inside the rack's `.rack` element and carries `data-pdu-device-id`
        // rather than the standard `data-device-id`, so it would otherwise never match the
        // device check and fall through to starting a whole-rack drag instead of selecting it.
        const pduEl = target.closest('[data-pdu-side]') as SVGElement;
        if (pduEl) {
          const deviceId = pduEl.getAttribute('data-pdu-device-id') ?? '';
          if (deviceId) {
            const sel: SelectableItem[] = [{ type: 'device', id: deviceId }];
            stateManager.setState({ selection: sel });
            eventBus.emit('selection:changed', sel);
          }
          // PDU repositioning (moving it between rack sides) isn't supported — select only,
          // don't start any drag (no isDragging* flag set, so no 'dragging-active' to clean up).
          e.stopPropagation();
          return;
        }

        const deviceEl = target.closest('[data-device-id]') as SVGElement;
        if (deviceEl) {
          const deviceId = deviceEl.getAttribute('data-device-id')!;
          const device = stateManager.getDevice(deviceId);
          if (device) {
            stateManager.setState({ selection: [{ type: 'device', id: deviceId }] });
            eventBus.emit('selection:changed', [{ type: 'device', id: deviceId }]);
            if (device.locked) return; // Selection allowed; drag/clone blocked
            this.dragStartWorldPos = this.canvas.screenToWorld({ x: e.clientX, y: e.clientY });
            if (e.ctrlKey) {
              this.cloningMode = true;
              this.cloneThresholdMet = false;
              this.dragOriginalDevice = device;
            } else {
              this.isDraggingDevice = true;
              this.draggedDeviceId = deviceId;
              this.dragStartUnit = device.startUnit;
              this.dragStartRackId = device.rackId;
              this.dragStartDevicesState = JSON.parse(JSON.stringify(stateManager.getState().devices));
            }
            svgEl.classList.add('dragging-active');
            e.stopPropagation();
            return;
          }
        }

        // Check for rack dragging
        const rackEl = target.closest('.rack') as SVGElement;
        if (rackEl) {
          const rackId = rackEl.getAttribute('id')?.replace('rack-', '') || rackEl.getAttribute('data-rack-id');
          const rack = rackId ? stateManager.getRack(rackId) : null;
          if (rack) {
            this.isDraggingRack = true;
            this.draggedRackId = rack.id;
            this.dragStartWorldPos = this.canvas.screenToWorld({ x: e.clientX, y: e.clientY });
            this.dragStartRackX = rack.x;
            this.dragStartRacksState = JSON.parse(JSON.stringify(stateManager.getState().racks));
            
            stateManager.setState({ selection: [{ type: 'rack', id: rack.id }] });
            eventBus.emit('selection:changed', [{ type: 'rack', id: rack.id }]);
            
            svgEl.classList.add('dragging-active');
            e.stopPropagation();
            return;
          }
        }

        // Nothing was hit — start rubber-band multi-select. Cancel whatever pan
        // CanvasManager's own (earlier-registered) mousedown listener just optimistically
        // started for this same background click — see cancelPan()'s doc comment for why
        // letting both run would collapse the rubber-band's own screenToWorld() math to zero.
        {
          this.canvas.cancelPan();
          const worldPos = this.canvas.screenToWorld({ x: e.clientX, y: e.clientY });
          this.rubberBandStart = worldPos;
          if (svgEl) {
            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.id = 'selection-rect';
            rect.setAttribute('fill', 'rgba(88,166,255,0.08)');
            rect.setAttribute('stroke', '#58a6ff');
            rect.setAttribute('stroke-width', '1');
            rect.setAttribute('stroke-dasharray', '4,2');
            rect.setAttribute('pointer-events', 'none');
            svgEl.appendChild(rect);
            this.rubberBandEl = rect;
            this.isRubberBanding = true;
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
        this.draggedAnchorRealIndex = -1;
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

      // 0a1. Label pointer STARTING point drag completion — same "revert then commit" pattern.
      if (this.isDraggingLabelStartAnchor) {
        this.isDraggingLabelStartAnchor = false;
        this.draggedLabelStartAnchorTextId = null;
        svgEl.classList.remove('dragging-active');

        if (this.dragStartTextLabelsState) {
          const finalTextLabels = stateManager.getState().textLabels;
          stateManager.setState({ textLabels: this.dragStartTextLabelsState }, true);
          stateManager.setState({ textLabels: finalTextLabels });
          this.dragStartTextLabelsState = null;
        }

        this.renderAll();
        return;
      }

      // 0a2. Label pointer anchor drag completion — same "revert then commit" pattern as the
      // cable anchor completion above.
      if (this.isDraggingLabelAnchor) {
        this.isDraggingLabelAnchor = false;
        this.draggedLabelAnchorTextId = null;
        this.draggedLabelAnchorIndex = -1;
        svgEl.classList.remove('dragging-active');

        if (this.dragStartTextLabelsState) {
          const finalTextLabels = stateManager.getState().textLabels;
          stateManager.setState({ textLabels: this.dragStartTextLabelsState }, true);
          stateManager.setState({ textLabels: finalTextLabels });
          this.dragStartTextLabelsState = null;
        }

        this.renderAll();
        return;
      }

      // 0a. Summary Card Preview drag completion — no intermediate state/history writes happened
      // during the drag (see summaryCardDragPreview), so this just commits the final offset.
      if (this.isDraggingSummaryCard && this.draggedSummaryRackId) {
        const rackId = this.draggedSummaryRackId;
        const offset = this.summaryCardDragPreview?.offset ?? this.dragStartSummaryOffset;
        this.isDraggingSummaryCard = false;
        this.draggedSummaryRackId = null;
        this.summaryCardDragPreview = null;
        eventBus.emit('rack:update', { id: rackId, data: { summaryCardOffset: offset } });
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

          // 2. Fallback to generous 35px radius proximity snap search — TWO PASSES, not one.
          // Ear-mount holes sit right at a device's rail edge (x=-12.5), which puts them close to
          // any real port calibrated near a panel's left/right edge (a common case when matching a
          // real hardware photo). A single combined "closest wins, but ear holes have a smaller
          // cap" comparison still let an ear hole win whenever it happened to be a fraction of a
          // pixel closer than the intended real port — capping *how far* an ear hole could reach
          // never stopped it from *outcompeting* a real port that was simultaneously in range. So:
          // pass 1 searches ONLY real ports at the normal 35px radius; ear holes are only even
          // considered in pass 2, and only if pass 1 found nothing at all. A real port now always
          // wins whenever it's anywhere in normal range, regardless of exact pixel distances.
          if (!targetPort) {
            let closestDist = 35;
            for (const dev of s.devices) {
              for (const port of dev.ports) {
                if (port.id === skipPortId || port.id.includes('-ear-')) continue;
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
            if (!targetPort) {
              const EAR_SNAP_RADIUS = 1.5;
              let closestEarDist = EAR_SNAP_RADIUS;
              for (const dev of s.devices) {
                for (const port of dev.ports) {
                  if (port.id === skipPortId || !port.id.includes('-ear-')) continue;
                  const portPos = stateManager.getPortWorldPosition(port.id);
                  if (portPos) {
                    const dist = Math.sqrt(Math.pow(this.mouseWorldPos.x - portPos.x, 2) + Math.pow(this.mouseWorldPos.y - portPos.y, 2));
                    if (dist < closestEarDist) {
                      closestEarDist = dist;
                      targetPort = port;
                    }
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

          // No port snapped — decide whether to cancel (revert) or commit the new floating
          // position. Reverting protects a previously REAL connection from being stranded by an
          // accidental drop in empty space. But an end that was ALREADY floating before this drag
          // (e.g. repositioning an Airdrop-Destination cable to correct its spot) has no real
          // connection to protect — reverting it just snaps every correction straight back to the
          // original drop point, making it impossible to ever move. Commit instead.
          const originalCable = this.dragStartCablesState?.find(c => c.id === cableId);
          const wasAlreadyFloating = handleType === 'source'
            ? !!originalCable?.floatingSource
            : !originalCable?.destPortId;

          if (wasAlreadyFloating) {
            // The continuous mousemove updates above already wrote the live drag position into
            // state — silently restore the pre-drag snapshot, then reapply that already-current
            // state normally, so the whole drag collapses into a single undo/redo history frame
            // (same pattern used for the real-port-reconnect and anchor-drag cases above).
            const finalCables = stateManager.getState().cables;
            if (this.dragStartCablesState) {
              stateManager.setState({ cables: this.dragStartCablesState }, true);
              stateManager.setState({ cables: finalCables });
            }
            this.dragStartCablesState = null;
            this.dragStartDevicesState = null;
            eventBus.emit('notification', { message: 'Cable end moved', type: 'success' });
          } else if (this.dragStartCablesState && this.dragStartDevicesState) {
            stateManager.setState({ cables: this.dragStartCablesState, devices: this.dragStartDevicesState });
            this.dragStartCablesState = null;
            this.dragStartDevicesState = null;
            eventBus.emit('notification', { message: 'Drag canceled: Cable tip snapped back to original port.', type: 'info' });
          }
          this.renderAll();
        }
      }

      // 2a. Cloning mode cleanup
      if (this.cloningMode) {
        this.cloningMode = false;
        this.cloneThresholdMet = false;
        this.dragOriginalDevice = null;
        if (this.draggedDeviceId) {
          const cloneEl = document.querySelector(`[data-device-id="${this.draggedDeviceId}"]`) as SVGGElement | null;
          if (cloneEl) cloneEl.style.opacity = '1';
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

      // 3. Rack dragging completion
      if (this.isDraggingRack && this.draggedRackId) {
        svgEl.classList.remove('dragging-active');
        
        const rackId = this.draggedRackId;
        const finalRack = stateManager.getRack(rackId);
        
        this.isDraggingRack = false;
        this.draggedRackId = null;
        
        if (finalRack) {
          const sState = stateManager.getState();
          const overlap = sState.racks.some(r => r.id !== rackId && Math.abs(r.x - finalRack.x) < RACK_CONSTANTS.RACK_OUTER_WIDTH - 20);
          if (overlap) {
            if (this.dragStartRacksState) {
              stateManager.setState({ racks: this.dragStartRacksState }, true);
              this.dragStartRacksState = null;
            }
            this.renderAll();
            eventBus.emit('notification', { message: 'Cannot place rack: Racks are overlapping', type: 'warning' });
          } else {
            if (this.dragStartRacksState) {
              stateManager.setState({ racks: this.dragStartRacksState }, true);
              this.dragStartRacksState = null;
            }
            eventBus.emit('rack:update', { id: rackId, data: { x: finalRack.x } });
          }
        }
      }

      // 3a. Text label dragging completion
      if (this.isDraggingText && this.draggedTextId) {
        svgEl.classList.remove('dragging-active');

        const textId = this.draggedTextId;
        const finalLabel = stateManager.getState().textLabels.find(t => t.id === textId);

        this.isDraggingText = false;
        this.draggedTextId = null;

        if (finalLabel) {
          let dropX = finalLabel.x;
          let dropY = finalLabel.y;
          if (stateManager.getState().snapEnabled) {
            dropX = Math.round(dropX / RACK_CONSTANTS.GRID_SIZE) * RACK_CONSTANTS.GRID_SIZE;
            dropY = Math.round(dropY / RACK_CONSTANTS.GRID_SIZE) * RACK_CONSTANTS.GRID_SIZE;
          }
          // Silently restore to start position, then perform standard update to push a single history frame
          if (this.dragStartTextLabelsState) {
            stateManager.setState({ textLabels: this.dragStartTextLabelsState }, true);
            this.dragStartTextLabelsState = null;
          }
          eventBus.emit('textlabel:update', { id: textId, data: { x: dropX, y: dropY } });
        }
      }

      // 3b. Image asset resize completion
      if (this.isResizingImage && this.resizedImageId) {
        svgEl.classList.remove('dragging-active');

        const imageId = this.resizedImageId;
        const finalAsset = stateManager.getState().imageAssets.find(a => a.id === imageId);

        this.isResizingImage = false;
        this.resizedImageId = null;

        if (finalAsset) {
          if (this.dragStartImageAssetsState) {
            stateManager.setState({ imageAssets: this.dragStartImageAssetsState }, true);
            this.dragStartImageAssetsState = null;
          }
          eventBus.emit('imageasset:update', { id: imageId, data: { width: finalAsset.width, height: finalAsset.height } });
        }
      }

      // 3c. Image asset drag completion
      if (this.isDraggingImage && this.draggedImageId) {
        svgEl.classList.remove('dragging-active');

        const imageId = this.draggedImageId;
        const finalAsset = stateManager.getState().imageAssets.find(a => a.id === imageId);

        this.isDraggingImage = false;
        this.draggedImageId = null;

        if (finalAsset) {
          let dropX = finalAsset.x;
          let dropY = finalAsset.y;
          if (stateManager.getState().snapEnabled) {
            dropX = Math.round(dropX / RACK_CONSTANTS.GRID_SIZE) * RACK_CONSTANTS.GRID_SIZE;
            dropY = Math.round(dropY / RACK_CONSTANTS.GRID_SIZE) * RACK_CONSTANTS.GRID_SIZE;
          }
          if (this.dragStartImageAssetsState) {
            stateManager.setState({ imageAssets: this.dragStartImageAssetsState }, true);
            this.dragStartImageAssetsState = null;
          }
          eventBus.emit('imageasset:update', { id: imageId, data: { x: dropX, y: dropY } });
        }
      }

      // 4. Rubber-band multi-select completion
      if (this.isRubberBanding) {
        this.isRubberBanding = false;
        this.rubberBandEl?.remove();
        this.rubberBandEl = null;

        const worldPos = this.canvas.screenToWorld({ x: e.clientX, y: e.clientY });
        const selX = Math.min(worldPos.x, this.rubberBandStart.x);
        const selY = Math.min(worldPos.y, this.rubberBandStart.y);
        const selW = Math.abs(worldPos.x - this.rubberBandStart.x);
        const selH = Math.abs(worldPos.y - this.rubberBandStart.y);

        const state = stateManager.getState();
        const selected: SelectableItem[] = [];

        state.racks.forEach(rack => {
          const rackH = RACK_CONSTANTS.RACK_PADDING_TOP + rack.units * RACK_CONSTANTS.RU_HEIGHT + RACK_CONSTANTS.RACK_PADDING_BOTTOM;
          const intersects = rack.x < selX + selW && rack.x + RACK_CONSTANTS.RACK_OUTER_WIDTH > selX && rack.y < selY + selH && rack.y + rackH > selY;
          if (intersects) selected.push({ type: 'rack', id: rack.id });
        });

        state.devices.forEach(dev => {
          const rack = stateManager.getRack(dev.rackId);
          if (!rack) return;
          const template = getTemplate(dev.templateId);
          const hU = template?.heightUnits ?? 1;
          const deviceX = rack.x + (RACK_CONSTANTS.RACK_OUTER_WIDTH - RACK_CONSTANTS.RACK_INNER_WIDTH) / 2 + RACK_CONSTANTS.RAIL_WIDTH;
          const deviceY = rack.y + RACK_CONSTANTS.RACK_PADDING_TOP + (rack.units - dev.startUnit - hU + 1) * RACK_CONSTANTS.RU_HEIGHT;
          const deviceW = RACK_CONSTANTS.RACK_INNER_WIDTH - 2 * RACK_CONSTANTS.RAIL_WIDTH;
          const deviceH = hU * RACK_CONSTANTS.RU_HEIGHT;

          const intersects = deviceX < selX + selW && deviceX + deviceW > selX && deviceY < selY + selH && deviceY + deviceH > selY;
          if (intersects) selected.push({ type: 'device', id: dev.id });
        });

        state.textLabels.forEach(label => {
          // Rough point-in-rect test at the label's anchor — good enough for a rubber-band
          // selection tool without duplicating renderer's text-width estimation here.
          if (label.x >= selX && label.x <= selX + selW && label.y >= selY && label.y <= selY + selH) {
            selected.push({ type: 'text', id: label.id });
          }
        });

        state.imageAssets.forEach(asset => {
          const intersects = asset.x < selX + selW && asset.x + asset.width > selX && asset.y < selY + selH && asset.y + asset.height > selY;
          if (intersects) selected.push({ type: 'image', id: asset.id });
        });

        const existingIds = new Set(state.selection.map(s => s.id));
        const deduped = selected.filter(s => !existingIds.has(s.id));
        const newSelection = e.shiftKey ? [...state.selection, ...deduped] : selected;
        stateManager.setState({ selection: newSelection });
        eventBus.emit('selection:changed', newSelection);
      }

      // 5. Export-area drawing completion
      if (this.isDrawingExportArea) {
        this.isDrawingExportArea = false;
        this.exportAreaEl?.remove();
        this.exportAreaEl = null;

        const worldPos = this.canvas.screenToWorld({ x: e.clientX, y: e.clientY });
        const selX = Math.min(worldPos.x, this.exportAreaStart.x);
        const selY = Math.min(worldPos.y, this.exportAreaStart.y);
        const selW = Math.abs(worldPos.x - this.exportAreaStart.x);
        const selH = Math.abs(worldPos.y - this.exportAreaStart.y);

        const screenDx = Math.abs(e.clientX - this.exportAreaStartScreen.x);
        const screenDy = Math.abs(e.clientY - this.exportAreaStartScreen.y);
        const draggedEnough = screenDx > 4 || screenDy > 4;

        eventBus.emit('tool:changed', 'select');
        if (draggedEnough) {
          eventBus.emit('export:area-selected', { x: selX, y: selY, width: selW, height: selH });
        }
      }
    });

    // Click handling for selection and cable creation
    svgEl.addEventListener('click', (e) => {
      if (this.suppressNextClick) {
        this.suppressNextClick = false;
        return;
      }

      const target = e.target as SVGElement;
      const s = stateManager.getState();

      // PDU "+" add handle click
      const addHandleEl = (e.target as Element)?.closest?.('[data-pdu-add-side]');
      if (addHandleEl) {
        const side = addHandleEl.getAttribute('data-pdu-add-side') as 'left' | 'right';
        const rackId = addHandleEl.getAttribute('data-rack-id') ?? '';
        this.showPduPickerModal(rackId, side);
        return;
      }

      // Existing side PDU click → select it
      const pduEl = (e.target as Element)?.closest?.('[data-pdu-side]');
      if (pduEl) {
        const deviceId = pduEl.getAttribute('data-pdu-device-id') ?? '';
        if (deviceId) {
          const sel: SelectableItem[] = [{ type: 'device', id: deviceId }];
          stateManager.setState({ selection: sel });
          eventBus.emit('selection:changed', sel);
          this.renderAll();
        }
        return;
      }

      // Cable creation mode (both the generic cable tool and the power-cable tool share this
      // flow — handleCablePortClick already detects power ports/outlets and validates them)
      if (s.tool === 'cable' || s.tool === 'power') {
        // Finishing a non-power cable with Airdrop Destination on must land EXACTLY where
        // clicked, full stop — no port hit-testing of any kind (not the direct SVG hit-test
        // below, not the PDU-outlet hit-test, not the proximity fallback). Previously only the
        // proximity fallback was guarded, but the direct hit-test runs first and matches whenever
        // the click physically lands inside a port's hit-target (a few px of padding around each
        // jack) — which happens constantly on dense switches/patch panels — so it kept silently
        // reconnecting airdropped cables to whatever real port was under the cursor instead of
        // dropping a floating end there. Starting a NEW cable (no cableInProgress yet) is
        // unaffected — that still requires clicking a real source port normally.
        const finishingAirdropCable = s.airdropDestination && !!s.cableInProgress && s.cableInProgress.cableType !== 'power';

        if (!finishingAirdropCable) {
          // Primary: detect port via SVG hit-testing
          const portEl = target.closest('[data-port-id]') as SVGElement;
          if (portEl) {
            const portId = portEl.getAttribute('data-port-id')!;
            this.handleCablePortClick(portId);
            return;
          }

          // PDU outlet hit target detection — .pdu-outlet-hit has data-outlet-idx but no data-port-id
          const outletEl = target.closest('.pdu-outlet-hit') as SVGElement;
          if (outletEl) {
            const outletIdx = outletEl.getAttribute('data-outlet-idx') ?? '0';
            // Walk up to find the PDU group which has data-pdu-device-id
            const pduGroupEl = outletEl.closest('[data-pdu-device-id]') as SVGElement;
            const pduDeviceId = pduGroupEl?.getAttribute('data-pdu-device-id') ?? '';
            if (pduDeviceId) {
              const outletPortId = `outlet-${pduDeviceId}-${outletIdx}`;
              this.handleCablePortClick(outletPortId);
              return;
            }
          }

          // Fallback: proximity snap — find nearest port (or PDU outlet) within 40px world units
          // (handles cases where the neon ring / gutter area was clicked instead of the port circle,
          // or a PDU outlet's small `.pdu-outlet-hit` rect was narrowly missed). TWO PASSES: real
          // ports (+ PDU outlets) at the normal 40px radius first; ear-mount holes are only even
          // considered if that first pass finds nothing, and only within their own tight 1.5px
          // radius. Ear holes sit right at a device's rail edge, close to any real port calibrated
          // near a panel's edge — a single combined "closest wins, smaller cap for ear holes"
          // comparison still let an ear hole win whenever it was a fraction of a pixel closer than
          // the intended real port, no matter how small that cap got.
          if (s.cableInProgress || s.tool === 'cable' || s.tool === 'power') {
            let closestPortId: string | null = null;
            let closestDist = 40;
            const realCandidateIds: string[] = [];
            const earCandidateIds: string[] = [];
            for (const dev of s.devices) {
              for (const port of dev.ports) (port.id.includes('-ear-') ? earCandidateIds : realCandidateIds).push(port.id);
            }
            realCandidateIds.push(...stateManager.getAllPduOutletPortIds());
            for (const id of realCandidateIds) {
              const pos = stateManager.getPortWorldPosition(id);
              if (!pos) continue;
              const dist = Math.sqrt(Math.pow(this.mouseWorldPos.x - pos.x, 2) + Math.pow(this.mouseWorldPos.y - pos.y, 2));
              if (dist < closestDist) {
                closestDist = dist;
                closestPortId = id;
              }
            }
            if (!closestPortId) {
              const EAR_SNAP_RADIUS = 1.5;
              let closestEarDist = EAR_SNAP_RADIUS;
              for (const id of earCandidateIds) {
                const pos = stateManager.getPortWorldPosition(id);
                if (!pos) continue;
                const dist = Math.sqrt(Math.pow(this.mouseWorldPos.x - pos.x, 2) + Math.pow(this.mouseWorldPos.y - pos.y, 2));
                if (dist < closestEarDist) {
                  closestEarDist = dist;
                  closestPortId = id;
                }
              }
            }
            if (closestPortId) {
              this.handleCablePortClick(closestPortId);
              return;
            }
          }
        }

        // No real port was found anywhere near this click (or we're finishing an Airdrop cable
        // and deliberately skipped all port hit-testing above). With Airdrop Destination on and a
        // cable already in progress (started from a real source port the normal way), finish it
        // right here instead of requiring a real destination port — any rack, any spot, no snap.
        if (s.airdropDestination && s.cableInProgress) {
          this.commitCableToFloatingDestination(this.canvas.screenToWorld({ x: e.clientX, y: e.clientY }));
          return;
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

        // Check for text label click
        const textElClick = target.closest('[data-text-id]') as SVGElement;
        if (textElClick) {
          const textId = textElClick.getAttribute('data-text-id')!;
          stateManager.setState({ selection: [{ type: 'text', id: textId }] });
          eventBus.emit('selection:changed', [{ type: 'text', id: textId }]);
          return;
        }

        // Check for image asset click
        const imageElClick = target.closest('[data-image-id]') as SVGElement;
        if (imageElClick) {
          const imageId = imageElClick.getAttribute('data-image-id')!;
          stateManager.setState({ selection: [{ type: 'image', id: imageId }] });
          eventBus.emit('selection:changed', [{ type: 'image', id: imageId }]);
          return;
        }

        // Clicked on empty canvas - deselect
        resetPreviewDirection();
        stateManager.setState({ selection: [], cableInProgress: null });
        eventBus.emit('selection:changed', []);
        this.clearHighlights();
      }
    });
  }

  /**
   * Resolve the actual configured plug/socket type (C13, C19, IS6538-15A, etc.) for a synthetic
   * `outlet-<deviceId>-<idx>` PDU port, so a power cable's plug can be auto-matched to what the
   * outlet really is instead of asking the user to guess it from a generic list.
   */
  private resolveOutletSocketType(outletPortId: string): SocketType | null {
    const match = /^outlet-(.+)-(\d+)$/.exec(outletPortId);
    if (!match) return null;
    const device = stateManager.getDevice(match[1]);
    if (!device) return null;
    const template = getTemplate(device.templateId);
    if (!template) return null;
    const config = (device.deviceConfig && typeof device.deviceConfig === 'object') ? device.deviceConfig as any : {};
    return socketTypeAtOutletIndex(template, config, Number(match[2]));
  }

  /**
   * Handle clicking a port during cable creation mode.
   */
  private handleCablePortClick(portId: string) {
    const s = stateManager.getState();

    if (!s.cableInProgress) {
      // Start cable — the floating toolbar's Power tool means "draw a power cable" by itself,
      // regardless of the clicked port's own type/override, so the live preview (and the
      // committed cable's `type`, used for material/thickness) shows as a power cord right
      // away instead of whatever plain cable type was last selected.
      stateManager.setState({
        cableInProgress: {
          sourcePortId: portId,
          currentPoint: this.mouseWorldPos,
          bendPoints: [],
          cableType: s.tool === 'power' ? 'power' : (s.selectedCableType || 'general')
        }
      });
    } else {
      // Complete cable
      const sourcePortId = s.cableInProgress.sourcePortId;
      if (sourcePortId === portId) return; // Can't connect to self

      // Determine if source/dest are PDU outlets (virtual ports, not in device.ports)
      const isSrcOutlet = sourcePortId.startsWith('outlet-');
      const isDestOutlet = portId.startsWith('outlet-');

      const sourcePort = stateManager.getPort(sourcePortId);
      const destPort = stateManager.getPort(portId);

      // PDU outlet virtual ports are not in stateManager — they're always valid power endpoints
      // For regular ports, both must exist
      if (!sourcePort && !isSrcOutlet) return;
      if (!destPort && !isDestOutlet) return;

      // Determine if source/dest are power ports via portTypes override
      const isFiberPort = (type: string) => ['sfp', 'qsfp', 'lc', 'sc', 'fiber', 'optical'].some(t => type.toLowerCase().includes(t));
      const isPowerPortType = (type: string) => ['power', 'pwr', 'c13', 'c14', 'c19', 'c20', 'inlet', 'outlet', 'plug'].some(t => type.toLowerCase().includes(t));

      // The floating toolbar's Power tool ("Draw Power Cable to PDU") is itself sufficient
      // intent — it shouldn't also require the user to have separately right-clicked a port
      // and chosen "Set as Power port" first. Without this, starting from the Power tool but
      // clicking an ordinary (not pre-marked) device port fell through to a plain data cable.
      const wasPowerTool = s.cableInProgress.cableType === 'power';

      // Check portTypes override for device ports
      const srcDevice = sourcePort ? stateManager.getDevice(sourcePort.deviceId) : null;
      const srcPortIdx = srcDevice ? srcDevice.ports.findIndex(p => p.id === sourcePortId) : -1;
      const isSrcPowerByType = srcDevice && srcPortIdx >= 0 && srcDevice.portTypes?.[srcPortIdx] === 'power';
      const isSrcPowerByPortName = sourcePort ? isPowerPortType(sourcePort.type) : false;
      const isSrcPower = isSrcOutlet || isSrcPowerByType || isSrcPowerByPortName || wasPowerTool;

      const destDevice = destPort ? stateManager.getDevice(destPort.deviceId) : null;
      const destPortIdx = destDevice ? destDevice.ports.findIndex(p => p.id === portId) : -1;
      const isDestPowerByType = destDevice && destPortIdx >= 0 && destDevice.portTypes?.[destPortIdx] === 'power';
      const isDestPowerByPortName = destPort ? isPowerPortType(destPort.type) : false;
      const isDestPower = isDestOutlet || isDestPowerByType || isDestPowerByPortName || wasPowerTool;

      // Validation: ear ports accept any cable; block fiber↔ethernet and power↔data mismatches
      const isSrcEar = sourcePortId.includes('-ear-');
      const isDestEar = portId.includes('-ear-');

      if (!isSrcEar && !isDestEar) {
        if (sourcePort && destPort) {
          if (isFiberPort(sourcePort.type) && !isFiberPort(destPort.type)) {
            eventBus.emit('notification', { message: 'Termination Mismatch: Fiber cable cannot terminate in a non-fiber port!', type: 'error' });
            return;
          }
        }
        if (isSrcPower && !isDestPower) {
          eventBus.emit('notification', { message: 'Power port can only connect to PDU outlets or other power ports', type: 'warning' });
          return;
        }
        if (isDestPower && !isSrcPower) {
          eventBus.emit('notification', { message: 'Connect a power port to PDU outlets or other power ports', type: 'warning' });
          return;
        }
      }

      const color = s.selectedCableType === 'custom'
        ? (s.selectedCableColor || '#78909c')
        : (CABLE_COLORS[s.cableInProgress.cableType] || CABLE_COLORS.general);

      const cableInProgressSnapshot = s.cableInProgress;

      const commitCable = (extraFields: Partial<CableData> = {}) => {
        const currentS = stateManager.getState();
        const newCable: CableData = {
          id: generateId(),
          name: `Cable ${currentS.cables.length + 1}`,
          type: cableInProgressSnapshot.cableType,
          color,
          sourcePortId,
          destPortId: portId,
          bendPoints: [...cableInProgressSnapshot.bendPoints],
          thickness: RACK_CONSTANTS.CABLE_THICKNESS,
          bendRadius: s.selectedCableBend !== undefined ? s.selectedCableBend : RACK_CONSTANTS.CABLE_BEND_RADIUS,
          sourceTermination: s.selectedCableTermination || 'RJ45 Ethernet',
          destTermination: s.selectedCableTermination || 'RJ45 Ethernet',
          bundleId: null,
          notes: '',
          anchorPoints: [],
          anchorsLocked: false,
          ...extraFields
        };

        // Mark regular ports as connected (outlet ports are virtual)
        if (sourcePort) { sourcePort.connected = true; sourcePort.cableId = newCable.id; }
        if (destPort) { destPort.connected = true; destPort.cableId = newCable.id; }

        resetPreviewDirection();
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
        this.renderAll();
      };

      // Power cable: match the plug to whichever end is a PDU outlet before committing
      if (isSrcPower || isDestPower) {
        // Clear cableInProgress immediately so UI doesn't show stale preview
        stateManager.setState({ cableInProgress: null });
        const interactionLayer = this.canvas.getLayer('interaction-layer');
        if (interactionLayer) interactionLayer.innerHTML = '';
        resetPreviewDirection();

        const outletPortId = isDestOutlet ? portId : (isSrcOutlet ? sourcePortId : null);
        // The end that's a real device port (not the PDU outlet) — used to detect whether this
        // device already has a power cord running to a PDU, making this new one its redundant feed.
        const deviceEndDeviceId = isDestOutlet ? sourcePort?.deviceId : (isSrcOutlet ? destPort?.deviceId : null);
        const finish = (plugType: SocketType) => {
          // Determine cable color: blue for B-feed (right PDU), red for A-feed (left PDU)
          let cableColor = '#ff4422'; // default red (A-feed / left PDU)
          if (outletPortId) {
            // outlet-<deviceId>-<idx> — extract deviceId
            const parts = outletPortId.split('-');
            // format: outlet-<uuid>-<idx> where uuid may contain dashes
            const outletDeviceId = parts.slice(1, -1).join('-');
            const allRacks = stateManager.getState().racks;
            const isRightPdu = allRacks.some(r => r.rightPduId === outletDeviceId);
            if (isRightPdu) cableColor = '#3399ff'; // blue for B-feed
          }
          const currentState = stateManager.getState();
          const isRedundant = !!deviceEndDeviceId
            && countDevicePowerCables(deviceEndDeviceId, currentState.cables, currentState.devices) >= 1;
          commitCable({
            powerCableType: 'power', plugType, color: cableColor,
            type: isRedundant ? 'power-redundant' : 'power',
          });
          if (isRedundant) {
            eventBus.emit('notification', { message: 'Marked as Redundant Power — 2nd feed for this device', type: 'success' });
          }
        };

        // Auto-detect the plug from the outlet's actual configured socket type (C13, C19,
        // Indian IS6538/IS1293, etc.) — only fall back to asking the user when neither end
        // is a resolvable PDU outlet (e.g. a manual power port <-> power port connection).
        const autoPlugType = outletPortId ? this.resolveOutletSocketType(outletPortId) : null;
        if (autoPlugType) {
          finish(autoPlugType);
        } else {
          this.showPlugTypeModal((plugType) => {
            if (!plugType) return; // cancelled — cable discarded
            finish(plugType);
          });
        }
        return; // handled async (or already committed synchronously above)
      }

      // Non-power cable — commit immediately
      commitCable();
    }
  }

  /**
   * "Airdrop Destination" — finishes the in-progress cable at an arbitrary canvas point instead
   * of a real destination port. The source end is untouched (always a real port, started the
   * normal way via handleCablePortClick); only the destination is a floating point. Ethernet/data
   * cables only — a power cable's far end is always a real PDU outlet or power port in reality.
   */
  private commitCableToFloatingDestination(point: Point) {
    const s = stateManager.getState();
    if (!s.cableInProgress) return;
    if (s.cableInProgress.cableType === 'power') return;

    const sourcePortId = s.cableInProgress.sourcePortId;
    const sourcePort = stateManager.getPort(sourcePortId);
    const isSrcOutlet = sourcePortId.startsWith('outlet-');
    if (!sourcePort && !isSrcOutlet) return;

    const color = s.selectedCableType === 'custom'
      ? (s.selectedCableColor || '#78909c')
      : (CABLE_COLORS[s.cableInProgress.cableType] || CABLE_COLORS.general);

    const newCable: CableData = {
      id: generateId(),
      name: `Cable ${s.cables.length + 1}`,
      type: s.cableInProgress.cableType,
      color,
      sourcePortId,
      destPortId: null,
      floatingDest: point,
      bendPoints: [...s.cableInProgress.bendPoints],
      thickness: RACK_CONSTANTS.CABLE_THICKNESS,
      bendRadius: s.selectedCableBend !== undefined ? s.selectedCableBend : RACK_CONSTANTS.CABLE_BEND_RADIUS,
      sourceTermination: s.selectedCableTermination || 'RJ45 Ethernet',
      destTermination: s.selectedCableTermination || 'RJ45 Ethernet',
      bundleId: null,
      notes: '',
      anchorPoints: [],
      anchorsLocked: false,
    };

    if (sourcePort) { sourcePort.connected = true; sourcePort.cableId = newCable.id; }

    resetPreviewDirection();
    stateManager.setState({ cables: [...stateManager.getState().cables, newCable], cableInProgress: null });
    eventBus.emit('cable:added', newCable);
    eventBus.emit('notification', { message: 'Cable dropped at that spot — drag its end later to attach a real port', type: 'success' });

    const interactionLayer = this.canvas.getLayer('interaction-layer');
    if (interactionLayer) interactionLayer.innerHTML = '';
    const svgCanvasEl = document.getElementById('canvas') as unknown as SVGSVGElement;
    if (svgCanvasEl) svgCanvasEl.classList.remove('cable-laying');
    this.clearSnapTargets();
    this.renderAll();
  }

  /**
   * Show a modal to select the power plug type when connecting a power cable.
   * Calls callback with the selected SocketType, or null if cancelled.
   */
  private showPlugTypeModal(callback: (plugType: SocketType | null) => void): void {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9999;display:flex;align-items:center;justify-content:center;';

    const modal = document.createElement('div');
    modal.style.cssText = 'background:#12171c;border:1px solid #23303b;border-radius:6px;padding:20px;min-width:340px;';
    modal.innerHTML = `
      <h3 style="margin:0 0 12px;color:#37b6ff;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;">Select Power Plug Type</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;" id="plug-grid"></div>
      <div style="margin-top:12px;">
        <button id="plug-cancel" style="width:100%;padding:8px;background:#1a1f24;border:1px solid #30363d;color:#8b949e;cursor:pointer;border-radius:3px;font-size:12px;">Cancel</button>
      </div>
    `;

    const PLUGS: Array<{ type: SocketType; label: string; region: string }> = [
      { type: 'C13',        label: 'C13',       region: 'IEC 10A' },
      { type: 'C19',        label: 'C19',       region: 'IEC 16A' },
      { type: 'C15',        label: 'C15',       region: 'IEC Hi-Temp' },
      { type: 'NEMA-5-15',  label: 'NEMA 5-15', region: 'US 15A' },
      { type: 'NEMA-5-20',  label: 'NEMA 5-20', region: 'US 20A' },
      { type: 'IS6538-5A',  label: 'IS6538 5A', region: 'India Type D' },
      { type: 'IS6538-15A', label: 'IS6538 15A',region: 'India Type M' },
      { type: 'IS1293-6A',  label: 'IS1293 6A', region: 'India 2+E' },
      { type: 'BS1363',     label: 'BS 1363',   region: 'UK 13A' },
      { type: 'Schuko',     label: 'Schuko',    region: 'EU 16A' },
    ];

    const grid = modal.querySelector('#plug-grid')!;
    PLUGS.forEach(p => {
      const btn = document.createElement('button');
      btn.style.cssText = 'padding:8px 4px;background:#171d24;border:1px solid #23303b;color:#e6ecf2;cursor:pointer;border-radius:3px;font-size:11px;text-align:center;';
      btn.innerHTML = `<strong>${p.label}</strong><br><span style="color:#8b939a;font-size:9px;">${p.region}</span>`;
      btn.onmouseover = () => { btn.style.borderColor = '#37b6ff'; btn.style.color = '#37b6ff'; };
      btn.onmouseout = () => { btn.style.borderColor = '#23303b'; btn.style.color = '#e6ecf2'; };
      btn.onclick = () => { document.body.removeChild(overlay); callback(p.type); };
      grid.appendChild(btn);
    });

    modal.querySelector('#plug-cancel')!.addEventListener('click', () => {
      document.body.removeChild(overlay);
      callback(null);
    });
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
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
    } catch (e) {
      console.error('Error rendering cable in progress:', e);
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

    // Two passes, same reasoning as the click-commit fallback above: ear holes sit right at a
    // device's rail edge, close to any real port calibrated near a panel's edge, so a single
    // combined "closest wins, smaller cap for ear holes" comparison still let an ear hole's glow
    // win whenever it was a fraction of a pixel closer than the intended real port. Real ports are
    // searched first at the normal 30px radius; ear holes are only even considered — at their own
    // tight 1.5px radius — if that first pass finds nothing.
    for (const dev of s.devices) {
      for (const port of dev.ports) {
        if (port.id === skipId || port.id.includes('-ear-')) continue;
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
    if (!closestPortId) {
      const EAR_HIGHLIGHT_RADIUS = 1.5;
      let closestEarDist = EAR_HIGHLIGHT_RADIUS;
      for (const dev of s.devices) {
        for (const port of dev.ports) {
          if (port.id === skipId || !port.id.includes('-ear-')) continue;
          if (port.connected && !dragCableId) continue; // already used
          const pos = stateManager.getPortWorldPosition(port.id);
          if (!pos) continue;
          const dist = Math.sqrt(Math.pow(worldPos.x - pos.x, 2) + Math.pow(worldPos.y - pos.y, 2));
          if (dist < closestEarDist) {
            closestEarDist = dist;
            closestPortId = port.id;
          }
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

        // Handle side-mount devices (vertical PDUs)
        if (template.mountType === 'side') {
          let closestRack: RackData | null = null;
          let minDist = Infinity;
          for (const rack of s.racks) {
            const rx = rack.x + RACK_CONSTANTS.RACK_OUTER_WIDTH / 2;
            const ry = rack.y + (rack.units * RACK_CONSTANTS.RU_HEIGHT) / 2;
            const dist = Math.sqrt(Math.pow(worldPos.x - rx, 2) + Math.pow(worldPos.y - ry, 2));
            if (dist < minDist) { minDist = dist; closestRack = rack; }
          }
          if (!closestRack) return;

          const isLeft = worldPos.x < closestRack.x + RACK_CONSTANTS.RACK_OUTER_WIDTH / 2;
          const side: 'left' | 'right' = isLeft ? 'left' : 'right';

          // Block if slot already occupied
          if (side === 'left' && closestRack.leftPduId) {
            eventBus.emit('notification', { message: 'A PDU is already mounted on the left side', type: 'warning' });
            return;
          }
          if (side === 'right' && closestRack.rightPduId) {
            eventBus.emit('notification', { message: 'A PDU is already mounted on the right side', type: 'warning' });
            return;
          }

          // Create DeviceData for this side-mount PDU
          const deviceId = generateId();
          const newDevice: DeviceData = {
            id: deviceId,
            templateId: template.id,
            rackId: closestRack.id,
            startUnit: 0,
            name: template.name,
            hostname: '',
            managementIp: '',
            serialNumber: '',
            description: '',
            ports: [],
            sideMountPosition: side,
          };

          stateManager.addDevice(newDevice);

          // Update rack with PDU reference
          const updatedRacks = s.racks.map(r =>
            r.id === closestRack!.id
              ? { ...r, ...(side === 'left' ? { leftPduId: deviceId } : { rightPduId: deviceId }) }
              : r,
          );
          stateManager.setState({ racks: updatedRacks });

          eventBus.emit('notification', {
            message: `${template.name} mounted on ${side} wall of ${closestRack.name}`,
            type: 'success',
          });
          this.renderAll();
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
        // Strip any "ear hole" ports here — injectEarPorts() regenerates the full PSU/network/
        // hybrid sequence separately as one evenly-spaced grid (see core/state.ts).
        const ports: PortData[] = template.ports
          .filter(p => !p.id.includes('-ear-'))
          .map((p, i) => ({
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
          deviceConfig: template.deviceConfig ? { ...template.deviceConfig } : undefined,
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

      // Pixel-precise nudge for a selected text label or image with Arrow keys — 1px per press,
      // 10px with Shift held, bypassing grid snapping entirely (unlike a mouse drop, which still
      // snaps when the grid-snap toggle is on). The only way to land on an exact, non-grid pixel.
      if (s.selection.length === 1 && (s.selection[0].type === 'text' || s.selection[0].type === 'image')) {
        const arrowDeltas: Record<string, { dx: number; dy: number }> = {
          ArrowUp: { dx: 0, dy: -1 }, ArrowDown: { dx: 0, dy: 1 },
          ArrowLeft: { dx: -1, dy: 0 }, ArrowRight: { dx: 1, dy: 0 },
        };
        const delta = arrowDeltas[e.key];
        if (delta) {
          e.preventDefault();
          const step = e.shiftKey ? 10 : 1;
          const item = s.selection[0];
          if (item.type === 'text') {
            const label = stateManager.getState().textLabels.find(t => t.id === item.id);
            if (label && !label.locked) {
              eventBus.emit('textlabel:update', { id: item.id, data: { x: label.x + delta.dx * step, y: label.y + delta.dy * step } });
            }
          } else {
            const asset = stateManager.getState().imageAssets.find(a => a.id === item.id);
            if (asset && !asset.locked) {
              eventBus.emit('imageasset:update', { id: item.id, data: { x: asset.x + delta.dx * step, y: asset.y + delta.dy * step } });
            }
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
      if (e.key === 'p' && !e.ctrlKey) eventBus.emit('tool:changed', 'power');
      // T = Text tool
      if (e.key === 't' && !e.ctrlKey) eventBus.emit('tool:changed', 'text');
      // L = Add Label (device-pointing) tool
      if (e.key === 'l' && !e.ctrlKey) eventBus.emit('tool:changed', 'label');

      // Ctrl+S = Save
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        eventBus.emit('file:save', undefined);
      }

      // Escape = Deselect / Cancel cable / Cancel rubber-band / Cancel export-area draw
      if (e.key === 'Escape') {
        if (this.isRubberBanding) {
          this.isRubberBanding = false;
          this.rubberBandEl?.remove();
          this.rubberBandEl = null;
        }
        if (stateManager.getState().tool === 'export-area') {
          eventBus.emit('tool:changed', 'select');
        }
        if (stateManager.getState().tool === 'cloud-container' || stateManager.getState().tool === 'cloud-connect' || stateManager.getState().tool === 'cloud-export-area') {
          eventBus.emit('tool:changed', 'select');
        }
        this.cancelCloudContainerDraw();
        this.cancelCloudConnect();
        if ((this.draggedConnectorEndpoint || this.draggedConnectorSegment || this.draggedConnectorWaypoint) && this.dragStartCloudConnectorsState) {
          stateManager.setState({ cloudConnectors: this.dragStartCloudConnectorsState }, true);
          this.draggedConnectorEndpoint = null;
          this.draggedConnectorSegment = null;
          this.draggedConnectorWaypoint = null;
          this.dragStartCloudConnectorsState = null;
          this.renderCloudAll();
        }
        resetPreviewDirection();
        stateManager.setState({ selection: [], cableInProgress: null });
        eventBus.emit('selection:changed', []);
        this.clearHighlights();
        const interactionLayer = this.canvas.getLayer('interaction-layer');
        if (interactionLayer) interactionLayer.innerHTML = '';
        const cloudInteractionLayer = this.cloudCanvas?.getLayer('cloud-interaction-layer');
        if (cloudInteractionLayer) cloudInteractionLayer.innerHTML = '';
      }

      // Ctrl+A = Select all devices and cables
      if (e.ctrlKey && e.key === 'a') {
        e.preventDefault();
        const allSelection = [
          ...s.devices.map(d => ({ type: 'device' as const, id: d.id })),
          ...s.cables.map(c => ({ type: 'cable' as const, id: c.id })),
          ...s.textLabels.map(t => ({ type: 'text' as const, id: t.id })),
          ...s.imageAssets.map(a => ({ type: 'image' as const, id: a.id })),
        ];
        stateManager.setState({ selection: allSelection });
        eventBus.emit('selection:changed', allSelection);
      }

      // Ctrl+C = Copy selected device
      if (e.ctrlKey && e.key === 'c') {
        e.preventDefault();
        const devSel = s.selection.find(sel => sel.type === 'device');
        if (devSel) {
          const src = stateManager.getDevice(devSel.id);
          this.clipboard = src ? cloneDevice(src) : null;
        }
      }

      // Ctrl+X = Cut selected device
      if (e.ctrlKey && e.key === 'x') {
        e.preventDefault();
        const devSel = s.selection.find(sel => sel.type === 'device');
        if (devSel) {
          const dev = stateManager.getDevice(devSel.id);
          if (dev && !dev.locked) {
            this.clipboard = dev;
            stateManager.removeDevice(devSel.id);
            stateManager.setState({ selection: [] });
            eventBus.emit('selection:changed', []);
          }
        }
      }

      // Ctrl+V = Paste clipboard device
      if (e.ctrlKey && e.key === 'v') {
        e.preventDefault();
        if (this.clipboard) {
          const cloned = cloneDevice(this.clipboard);
          const rack = stateManager.getRack(cloned.rackId);
          if (rack) {
            const nextRU = stateManager.getNextAvailableRU(cloned.rackId, getTemplate(cloned.templateId)?.heightUnits ?? 1);
            if (nextRU !== null) cloned.startUnit = nextRU;
          }
          stateManager.addDevice(cloned);
          stateManager.setState({ selection: [{ type: 'device', id: cloned.id }] });
          eventBus.emit('selection:changed', [{ type: 'device', id: cloned.id }]);
        }
      }

      // Ctrl+D = Duplicate selected device
      if (e.ctrlKey && e.key === 'd') {
        e.preventDefault();
        const devSel = s.selection.find(sel => sel.type === 'device');
        if (devSel) {
          const dev = stateManager.getDevice(devSel.id);
          if (dev) {
            const cloned = cloneDevice(dev);
            const nextRU = stateManager.getNextAvailableRU(cloned.rackId, getTemplate(cloned.templateId)?.heightUnits ?? 1);
            if (nextRU !== null) cloned.startUnit = nextRU;
            stateManager.addDevice(cloned);
            stateManager.setState({ selection: [{ type: 'device', id: cloned.id }] });
            eventBus.emit('selection:changed', [{ type: 'device', id: cloned.id }]);
          }
        }

        // Ctrl+D = Duplicate selected cloud connector — a detached copy near the original (see
        // cloneCloudConnector()'s doc comment for why it doesn't just reattach to the same nodes).
        const connSel = s.selection.find(sel => sel.type === 'cloud-connector');
        if (connSel) {
          const conn = stateManager.getState().cloudConnectors.find(c => c.id === connSel.id);
          const resolved = conn ? this.resolveCloudConnectorEndpoints(conn) : null;
          if (conn && resolved) {
            const cloned = cloneCloudConnector(conn, resolved.from, resolved.to);
            stateManager.addCloudConnector(cloned);
            const selection: SelectableItem[] = [{ type: 'cloud-connector', id: cloned.id }];
            stateManager.setState({ selection });
            eventBus.emit('selection:changed', selection);
            this.renderCloudAll();
          }
        }
      }

      // Arrow keys = Move selected rack
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        const rackSel = s.selection.find(sel => sel.type === 'rack');
        if (rackSel) {
          e.preventDefault();
          const rack = stateManager.getRack(rackSel.id);
          if (rack) {
            const step = e.shiftKey ? 10 : 1;
            let { x, y } = rack;
            if (e.key === 'ArrowLeft') x -= step;
            if (e.key === 'ArrowRight') x += step;
            if (e.key === 'ArrowUp') y -= step;
            if (e.key === 'ArrowDown') y += step;
            eventBus.emit('rack:update', { id: rackSel.id, data: { x, y } });
          }
        }
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
            { label: 'Edit Cable Type', action: () => { stateManager.setState({ selection: [{ type: 'cable', id: targetCableId }] }); eventBus.emit('selection:changed', [{ type: 'cable', id: targetCableId }]); } },
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
                  : get3DefaultAnchors(computeSmartRouting(cable, sourcePos, destPos));
                
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
                const currentPts = [...(cable.anchorPoints && cable.anchorPoints.length > 0 ? cable.anchorPoints : get3DefaultAnchors(computeSmartRouting(cable, sourcePos, destPos)))];
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
          // Determine current port type override
          const portDevice = stateManager.getDevice(port.deviceId);
          const portIdx = portDevice ? portDevice.ports.findIndex(p => p.id === portId) : -1;
          const currentPortType: 'data' | 'power' = (portDevice && portIdx >= 0 && portDevice.portTypes?.[portIdx]) ? portDevice.portTypes[portIdx] : 'data';

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

          // Port type toggle (only for devices where portTypes override is meaningful)
          if (portDevice && portIdx >= 0) {
            items.push({ separator: true, label: '' });
            items.push({
              label: '📡 Set as Data port',
              icon: '',
              disabled: currentPortType === 'data',
              action: () => {
                const portTypes = { ...(portDevice.portTypes ?? {}), [portIdx]: 'data' as const };
                eventBus.emit('device:update', { id: portDevice.id, data: { portTypes } } as any);
                this.renderAll();
              }
            });
            items.push({
              label: '⚡ Set as Power port',
              icon: '',
              disabled: currentPortType === 'power',
              action: () => {
                const portTypes = { ...(portDevice.portTypes ?? {}), [portIdx]: 'power' as const };
                eventBus.emit('device:update', { id: portDevice.id, data: { portTypes } } as any);
                this.renderAll();
              }
            });
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
              label: 'Cut',
              shortcut: 'Ctrl+X',
              action: () => {
                this.clipboard = device;
                stateManager.removeDevice(deviceId);
                stateManager.setState({ selection: [] });
                eventBus.emit('selection:changed', []);
              }
            },
            {
              label: 'Copy',
              shortcut: 'Ctrl+C',
              action: () => { this.clipboard = cloneDevice(device); }
            },
            {
              label: 'Paste',
              shortcut: 'Ctrl+V',
              disabled: !this.clipboard,
              action: () => {
                if (this.clipboard) {
                  const cloned = cloneDevice(this.clipboard);
                  const rack = stateManager.getRack(cloned.rackId);
                  if (rack) {
                    const nextRU = stateManager.getNextAvailableRU(cloned.rackId, getTemplate(cloned.templateId)?.heightUnits ?? 1);
                    if (nextRU !== null) cloned.startUnit = nextRU;
                  }
                  stateManager.addDevice(cloned);
                }
              }
            },
            {
              label: 'Duplicate',
              shortcut: 'Ctrl+D',
              action: () => {
                const cloned = cloneDevice(device);
                const nextRU = stateManager.getNextAvailableRU(cloned.rackId, getTemplate(cloned.templateId)?.heightUnits ?? 1);
                if (nextRU !== null) cloned.startUnit = nextRU;
                stateManager.addDevice(cloned);
              }
            },
            { separator: true, label: '' },
            {
              label: '🗑 Delete Device',
              icon: '🗑',
              shortcut: 'Del',
              disabled: !!device.locked,
              action: () => this.deleteSelection()
            },
            { separator: true, label: '' },
            {
              label: device.locked ? 'Unlock' : 'Lock',
              action: () => { eventBus.emit('device:update', { id: deviceId, data: { locked: !device.locked } }); }
            }
          ];

          this.contextMenu.show(screenPos.x, screenPos.y, items);
          return;
        }
      }

      // 3.5. Rack Right-Click Context Menu
      const rackEl2 = targetEl ? targetEl.closest?.('[data-rack-id]') as SVGElement : null;
      if (rackEl2) {
        const rackId = rackEl2.getAttribute('data-rack-id')!;
        const rack = stateManager.getRack(rackId);
        if (rack) {
          this.contextMenu.show(screenPos.x, screenPos.y, [
            { label: 'Edit Rack Name', action: () => {
              const name = prompt('Rack name:', rack.name);
              if (name) eventBus.emit('rack:update', { id: rackId, data: { name } });
            }},
            { separator: true, label: '' },
            { label: 'Delete Rack', action: () => {
              const devices = stateManager.getDevicesInRack(rackId);
              for (const d of devices) stateManager.removeDevice(d.id);
              stateManager.removeRack(rackId);
            }}
          ]);
          return;
        }
      }

      // 4. Default Canvas / Rack Right-Click Context Menu
      const allSel: SelectableItem[] = [
        ...s.devices.map(d => ({ type: 'device' as const, id: d.id })),
        ...s.cables.map(c => ({ type: 'cable' as const, id: c.id }))
      ];
      const items: MenuItem[] = [
        {
          label: 'Paste',
          shortcut: 'Ctrl+V',
          disabled: !this.clipboard,
          action: () => {
            if (this.clipboard) {
              const cloned = cloneDevice(this.clipboard);
              const rack = stateManager.getRack(cloned.rackId);
              if (rack) {
                const nextRU = stateManager.getNextAvailableRU(cloned.rackId, getTemplate(cloned.templateId)?.heightUnits ?? 1);
                if (nextRU !== null) cloned.startUnit = nextRU;
              }
              stateManager.addDevice(cloned);
            }
          }
        },
        {
          label: 'Select All',
          shortcut: 'Ctrl+A',
          action: () => {
            stateManager.setState({ selection: allSel });
            eventBus.emit('selection:changed', allSel);
          }
        },
        { separator: true, label: '' },
        { label: 'Zoom to Fit', icon: '🔲', shortcut: 'Ctrl+0', action: () => this.canvas.fitToContent() },
        { separator: true, label: '' },
        { label: 'Add 42U Rack', icon: '➕', action: () => stateManager.addRack({ id: generateId(), name: `Rack ${s.racks.length + 1}`, units: 42, x: point.x, y: point.y }) },
        { label: 'Add 48U Rack', icon: '➕', action: () => stateManager.addRack({ id: generateId(), name: `Rack ${s.racks.length + 1}`, units: 48, x: point.x, y: point.y }) },
        { separator: true, label: '' },
        { label: 'Toggle Grid', icon: '▦', action: () => eventBus.emit('view:toggle-grid', undefined as any) }
      ];

      this.contextMenu.show(screenPos.x, screenPos.y, items);
    });
  }

  /** Left-click-and-drag marquee select on the Cloud Architecture canvas's empty background (see
   *  setupCloudAreaSelect below). The rack canvas already has its own pre-existing rubber-band
   *  select (see the "Nothing was hit — start rubber-band multi-select" / "4. Rubber-band
   *  multi-select completion" blocks in setupCanvasInteractions() — this was originally
   *  duplicated here too before that was noticed; racks were the one gap in that older mechanism,
   *  now closed there directly instead). Tests each candidate's real getBoundingClientRect()
   *  against the dragged screen-space rectangle instead of hand-rolled per-type geometry: nodes/
   *  containers/hierarchies are simple x/y/width/height, but connectors are arbitrary paths — the
   *  browser has already computed the right answer for those. More than one element can carry the
   *  same data-*-id (e.g. a container's resize handle) — every element for a given id is tested
   *  independently and it's selected if ANY of them intersects, not just whichever happens to be
   *  first in the DOM. */
  private computeAreaSelection(svgEl: Element, rect: { left: number; top: number; right: number; bottom: number }, types: { attr: string; type: SelectableItem['type'] }[]): SelectableItem[] {
    const selection: SelectableItem[] = [];
    const added = new Set<string>();
    for (const { attr, type } of types) {
      svgEl.querySelectorAll(`[${attr}]`).forEach(el => {
        const id = el.getAttribute(attr);
        if (!id) return;
        const key = `${type}:${id}`;
        if (added.has(key)) return;
        const r = el.getBoundingClientRect();
        const intersects = r.left < rect.right && r.right > rect.left && r.top < rect.bottom && r.bottom > rect.top;
        if (intersects) { added.add(key); selection.push({ type, id } as SelectableItem); }
      });
    }
    return selection;
  }

  private setupCloudAreaSelect(): void {
    eventBus.on('cloud-canvas:area-select', (rect) => {
      const svgEl = document.getElementById('cloud-canvas');
      if (!svgEl) return;
      const selection = this.computeAreaSelection(svgEl, rect, [
        { attr: 'data-cloud-node-id', type: 'cloud-node' },
        { attr: 'data-cloud-container-id', type: 'cloud-container' },
        { attr: 'data-cloud-hierarchy-id', type: 'cloud-hierarchy' },
        { attr: 'data-cloud-connector-id', type: 'cloud-connector' },
      ]);
      stateManager.setState({ selection });
      eventBus.emit('selection:changed', selection);
      this.renderCloudAll();
    });
  }

  /**
   * Show a modal to pick a vertical PDU and mount it on the given rack side.
   */
  private showPduPickerModal(rackId: string, side: 'left' | 'right'): void {
    const s = stateManager.getState();
    const rack = s.racks.find(r => r.id === rackId);
    if (!rack) return;

    // Check not already occupied
    const existingId = side === 'left' ? rack.leftPduId : rack.rightPduId;
    if (existingId) {
      eventBus.emit('notification', { message: 'A PDU is already mounted on this side', type: 'warning' });
      return;
    }

    // Get vertical PDU templates from catalog
    const vpduTemplates = deviceCatalog.filter(t => t.mountType === 'side');

    // Build modal
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9999;display:flex;align-items:center;justify-content:center;';

    const modal = document.createElement('div');
    modal.style.cssText = 'background:#12171c;border:1px solid #23303b;border-radius:6px;padding:20px;min-width:320px;max-width:400px;';
    modal.innerHTML = `
      <h3 style="margin:0 0 12px;color:#37b6ff;font-size:13px;letter-spacing:1px;">SELECT PDU — ${side.toUpperCase()} WALL</h3>
      <div id="pdu-picker-list" style="display:flex;flex-direction:column;gap:6px;max-height:300px;overflow-y:auto;"></div>
      <button id="pdu-picker-cancel" style="margin-top:14px;width:100%;padding:8px;background:#1a1f24;border:1px solid #30363d;color:#8b949e;cursor:pointer;border-radius:3px;font-size:12px;">Cancel</button>
    `;

    const list = modal.querySelector('#pdu-picker-list')!;
    vpduTemplates.forEach(t => {
      const btn = document.createElement('button');
      const outletCount = t.outletConfig?.reduce((sum, r) => sum + r.count, 0) ?? 0;
      const socketSummary = t.outletConfig?.map(r => `${r.count}\xd7${r.socketType}`).join(' + ') ?? '';
      btn.style.cssText = 'text-align:left;padding:10px 12px;background:#171d24;border:1px solid #23303b;color:#e6ecf2;cursor:pointer;border-radius:3px;font-size:12px;width:100%;';
      btn.innerHTML = `<strong>${t.name}</strong><br><span style="color:#8b939a;font-size:11px;">${socketSummary} \xb7 ${outletCount} outlets</span>`;
      btn.onmouseover = () => { btn.style.borderColor = '#37b6ff'; };
      btn.onmouseout = () => { btn.style.borderColor = '#23303b'; };
      btn.onclick = () => {
        document.body.removeChild(overlay);
        // Mount the PDU
        const s2 = stateManager.getState();
        const rack2 = s2.racks.find(r => r.id === rackId);
        if (!rack2) return;
        const alreadyMounted = side === 'left' ? rack2.leftPduId : rack2.rightPduId;
        if (alreadyMounted) return;

        const deviceId = generateId();
        const newDevice: DeviceData = {
          id: deviceId, templateId: t.id, rackId, startUnit: 0,
          name: t.name, hostname: '', managementIp: '', serialNumber: '', description: '',
          ports: [], sideMountPosition: side,
        };
        stateManager.addDevice(newDevice);
        const updatedRacks = s2.racks.map(r =>
          r.id === rackId ? { ...r, ...(side === 'left' ? { leftPduId: deviceId } : { rightPduId: deviceId }) } : r,
        );
        stateManager.setState({ racks: updatedRacks });
        eventBus.emit('notification', { message: `${t.name} mounted on ${side} wall`, type: 'success' });
        this.renderAll();
      };
      list.appendChild(btn);
    });

    modal.querySelector('#pdu-picker-cancel')!.addEventListener('click', () => document.body.removeChild(overlay));
    overlay.addEventListener('click', (ev) => { if (ev.target === overlay) document.body.removeChild(overlay); });
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }

  /**
   * Delete currently selected elements.
   */
  /** Places a new TextLabel at `pos` (world coords), selects it (opening the Text Tool panel),
   *  and returns the tool to 'select' — a "stamp once" flow so the user isn't stuck in
   *  placement mode after adding one label. */
  private placeTextLabel(pos: Point) {
    const label: TextLabel = {
      id: generateId(),
      x: pos.x,
      y: pos.y,
      text: 'Label',
      fontFamily: 'Inter, sans-serif',
      fontSize: 10,
      fontWeight: 'normal',
      fontStyle: 'normal',
      underline: false,
      color: stateManager.getState().theme === 'light' ? '#1f2937' : '#e6ecf2',
      align: 'left',
      backgroundColor: null,
      rotation: 0,
    };
    const textLabels = [...stateManager.getState().textLabels, label];
    stateManager.setState({ textLabels, selection: [{ type: 'text', id: label.id }] });
    eventBus.emit('selection:changed', [{ type: 'text', id: label.id }]);
    eventBus.emit('tool:changed', 'select');
    this.renderAll();
  }

  /** Places a new TextLabel pointing at `deviceId` — `clickPos` (world coords) becomes the
   *  device-local pointerAnchorX/Y (see getDeviceWorldOrigin), so the leader line tracks the
   *  device if it's later dragged to a different rack unit. The box itself is placed clear of
   *  the device's rack, pre-filled with the device's real name and styled to match the
   *  dark-badge callout look from the reference screenshot. Same stamp-once flow as
   *  placeTextLabel(): selects the new label and reverts to the select tool. */
  private placeDeviceLabel(deviceId: string, clickPos: Point) {
    const device = stateManager.getDevice(deviceId);
    const origin = stateManager.getDeviceWorldOrigin(deviceId);
    if (!device || !origin) return;

    const rack = stateManager.getRack(device.rackId);
    const boxX = rack ? rack.x + RACK_CONSTANTS.RACK_OUTER_WIDTH + 40 : clickPos.x + 150;
    const boxY = clickPos.y - 15;

    const label: TextLabel = {
      id: generateId(),
      x: boxX,
      y: boxY,
      text: device.name || 'Device Name',
      fontFamily: 'Inter, sans-serif',
      fontSize: 10,
      fontWeight: 'bold',
      fontStyle: 'normal',
      underline: false,
      color: '#ffffff',
      align: 'left',
      backgroundColor: '#1a4971',
      backgroundPaddingX: 0,
      backgroundPaddingY: 0,
      rotation: 0,
      pointerDeviceId: deviceId,
      pointerAnchorX: clickPos.x - origin.x,
      pointerAnchorY: clickPos.y - origin.y,
      pointerStyle: 'elbow',
    };
    const textLabels = [...stateManager.getState().textLabels, label];
    stateManager.setState({ textLabels, selection: [{ type: 'text', id: label.id }] });
    eventBus.emit('selection:changed', [{ type: 'text', id: label.id }]);
    eventBus.emit('tool:changed', 'select');
    this.renderAll();
  }

  /**
   * Wires the "Insert Image" toolbar button to a hidden file input, matching the same
   * FileReader.readAsDataURL() upload pattern already used for a device's front panel image
   * (properties.ts) — the data URL round-trips through project JSON save/load and preserves
   * PNG/GIF/WEBP/SVG alpha transparency untouched, since it's the original uploaded bytes.
   */
  private setupImageUpload() {
    this.imageFileInput = document.createElement('input');
    this.imageFileInput.type = 'file';
    this.imageFileInput.accept = 'image/*';
    this.imageFileInput.style.display = 'none';
    document.body.appendChild(this.imageFileInput);

    this.imageFileInput.addEventListener('change', (e: any) => {
      const file: File | undefined = e.target.files?.[0];
      this.imageFileInput.value = ''; // allow re-selecting the same file again later
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const probe = new Image();
        probe.onload = () => this.insertImageAsset(dataUrl, probe.naturalWidth || 200, probe.naturalHeight || 200);
        probe.onerror = () => this.insertImageAsset(dataUrl, 200, 200);
        probe.src = dataUrl;
      };
      reader.onerror = () => eventBus.emit('notification', { message: 'Failed to read image file', type: 'error' });
      reader.readAsDataURL(file);
    });

    (eventBus as any).on('image:insert', () => this.imageFileInput.click());
  }

  /** Places a new ImageAsset centered in the current viewport, scaled down (preserving aspect
   *  ratio) if larger than a reasonable on-canvas default, selects it, and opens the Image Tool
   *  panel via the resulting selection change. */
  private insertImageAsset(dataUrl: string, naturalWidth: number, naturalHeight: number) {
    const MAX_DIM = 240;
    let width = naturalWidth;
    let height = naturalHeight;
    if (width > MAX_DIM || height > MAX_DIM) {
      const scale = MAX_DIM / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const viewport = document.getElementById('canvas-viewport');
    const rect = viewport?.getBoundingClientRect();
    const centerScreen = {
      x: (rect?.left ?? 0) + (rect?.width ?? 800) / 2,
      y: (rect?.top ?? 0) + (rect?.height ?? 600) / 2,
    };
    const centerWorld = this.canvas.screenToWorld(centerScreen);

    const asset: ImageAsset = {
      id: generateId(),
      x: Math.round(centerWorld.x - width / 2),
      y: Math.round(centerWorld.y - height / 2),
      width,
      height,
      src: dataUrl,
      opacity: 1,
      rotation: 0,
    };
    const imageAssets = [...stateManager.getState().imageAssets, asset];
    stateManager.setState({ imageAssets, selection: [{ type: 'image', id: asset.id }] });
    eventBus.emit('selection:changed', [{ type: 'image', id: asset.id }]);
    this.renderAll();
    eventBus.emit('notification', { message: 'Image added to canvas', type: 'success' });
  }

  private deleteSelection() {
    const s = stateManager.getState();

    // Check if selected device is a side-mount PDU — handle it specially
    if (s.selection.length === 1 && s.selection[0].type === 'device') {
      const devId = s.selection[0].id;
      const dev = stateManager.getDevice(devId);
      const tmpl = dev ? getTemplate(dev.templateId) : null;
      if (dev && tmpl?.mountType === 'side') {
        const s2 = stateManager.getState();
        // Clear leftPduId or rightPduId from rack
        const updatedRacks = s2.racks.map(r => {
          if (r.leftPduId === devId) return { ...r, leftPduId: undefined };
          if (r.rightPduId === devId) return { ...r, rightPduId: undefined };
          return r;
        });
        // Remove power cables connected to this PDU's outlets
        const updatedCables = s2.cables.filter(c =>
          !(c.sourcePortId.startsWith(`outlet-${devId}`) || (c.destPortId ?? '').startsWith(`outlet-${devId}`))
        );
        stateManager.setState({ racks: updatedRacks, cables: updatedCables, selection: [] });
        stateManager.removeDevice(devId);
        this.renderAll();
        return;
      }
    }

    for (const item of s.selection) {
      if (item.type === 'device') {
        const dev = stateManager.getDevice(item.id);
        if (dev && !dev.locked) stateManager.removeDevice(item.id);
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
      } else if (item.type === 'text') {
        stateManager.setState({
          textLabels: stateManager.getState().textLabels.filter(t => t.id !== item.id)
        });
      } else if (item.type === 'image') {
        stateManager.setState({
          imageAssets: stateManager.getState().imageAssets.filter(a => a.id !== item.id)
        });
      } else if (item.type === 'cloud-node') {
        stateManager.removeCloudNode(item.id);
      } else if (item.type === 'cloud-container') {
        stateManager.removeCloudContainer(item.id);
      } else if (item.type === 'cloud-connector') {
        stateManager.removeCloudConnector(item.id);
      } else if (item.type === 'cloud-hierarchy') {
        stateManager.removeCloudHierarchy(item.id);
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
    this.renderCloudAll();
  }

  /**
   * Save the project. Uses the File System Access API (Chromium-based browsers) so the user can
   * pick — and, for a plain "Save", re-use — a real destination on disk, rather than always
   * dropping a file into the browser's default Downloads folder. `forcePicker` is true for
   * "Save As" (always prompt for a destination); a plain "Save" only prompts the first time,
   * then re-writes whatever file was last opened/saved. Falls back to the original
   * download-a-blob behavior on browsers without the API (Firefox, Safari).
   */
  private async saveProject(forcePicker: boolean): Promise<void> {
    const json = exportJSON();
    const hasPicker = typeof (window as any).showSaveFilePicker === 'function';

    if (hasPicker && (forcePicker || !this.fileHandle)) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: this.fileHandle?.name ?? `rack-slicer-${new Date().toISOString().slice(0, 10)}.json`,
          types: [{ description: 'Rack Slicer Project', accept: { 'application/json': ['.json'] } }],
        });
        this.fileHandle = handle;
        await this.writeToFileHandle(handle, json);
        stateManager.markSaved();
        eventBus.emit('notification', { message: `Project saved as ${handle.name}`, type: 'success' });
      } catch (err: any) {
        if (err?.name === 'AbortError') return; // user cancelled the picker
        eventBus.emit('notification', { message: `Save failed: ${err}`, type: 'error' });
      }
      return;
    }

    if (hasPicker && this.fileHandle) {
      try {
        await this.writeToFileHandle(this.fileHandle, json);
        stateManager.markSaved();
        eventBus.emit('notification', { message: `Project saved — ${this.fileHandle.name}`, type: 'success' });
      } catch (err) {
        eventBus.emit('notification', { message: `Save failed: ${err}`, type: 'error' });
      }
      return;
    }

    // Fallback: no File System Access API — same download-link behavior as before.
    const filename = `rack-slicer-${new Date().toISOString().slice(0, 10)}.json`;
    try {
      downloadFile(json, filename, 'application/json');
      stateManager.markSaved();
      eventBus.emit('notification', { message: `Project saved — ${filename} downloaded`, type: 'success' });
    } catch (err) {
      eventBus.emit('notification', { message: `Save failed: ${err}`, type: 'error' });
    }
  }

  private async writeToFileHandle(handle: any, content: string): Promise<void> {
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
  }

  /**
   * Open a project. Uses the File System Access API where available so the picked file's handle
   * can be remembered for a subsequent plain "Save" to write straight back to it; falls back to a
   * hidden <input type="file"> (Firefox, Safari, or a non-secure context) where the browser's own
   * native file-picker still lets the user choose the source, just without a remembered handle.
   */
  private async openProject(): Promise<void> {
    const hasPicker = typeof (window as any).showOpenFilePicker === 'function';

    if (hasPicker) {
      try {
        const [handle] = await (window as any).showOpenFilePicker({
          types: [{ description: 'Rack Slicer Project', accept: { 'application/json': ['.json'] } }],
          multiple: false,
        });
        const file = await handle.getFile();
        const text = await file.text();
        this.fileHandle = handle;
        eventBus.emit('project:load', text);
      } catch (err: any) {
        if (err?.name === 'AbortError') return; // user cancelled the picker
        eventBus.emit('notification', { message: `Open failed: ${err}`, type: 'error' });
      }
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e: any) => {
      const file: File | undefined = e.target.files?.[0];
      if (!file) return;
      this.fileHandle = null; // no handle to remember via this path — next Save prompts once
      const reader = new FileReader();
      reader.onload = () => {
        eventBus.emit('project:load', reader.result as string);
      };
      reader.readAsText(file);
    };
    input.click();
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

    // Render overhead/underfloor cable runway tray if there are multiple racks
    if (s.racks.length > 1) {
      const isUnderfloor = s.cableRoutingTrayMode === 'underfloor';
      let trayY = 0;
      
      if (isUnderfloor) {
        const heights = s.racks.map(r => RACK_CONSTANTS.RACK_PADDING_TOP + r.units * RACK_CONSTANTS.RU_HEIGHT + RACK_CONSTANTS.RACK_PADDING_BOTTOM);
        const maxBottomY = Math.max(...s.racks.map((r, idx) => r.y + heights[idx]));
        trayY = maxBottomY + 45;
      } else {
        const minRackY = Math.min(...s.racks.map(r => r.y));
        trayY = minRackY - 45;
      }
      
      const rackXCoords = s.racks.map(r => r.x);
      const minX = Math.min(...rackXCoords) + 44; 
      const maxX = Math.max(...rackXCoords) + 406; 
      
      const trayGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      trayGroup.setAttribute('id', 'cable-runway-tray');
      trayGroup.setAttribute('style', 'pointer-events: none;');
      
      const railTop = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      railTop.setAttribute('x1', String(minX - 50));
      railTop.setAttribute('y1', String(trayY - 6));
      railTop.setAttribute('x2', String(maxX + 50));
      railTop.setAttribute('y2', String(trayY - 6));
      railTop.setAttribute('stroke', isUnderfloor ? '#1f2937' : '#3a3a42');
      railTop.setAttribute('stroke-width', '2');
      trayGroup.appendChild(railTop);

      const railBottom = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      railBottom.setAttribute('x1', String(minX - 50));
      railBottom.setAttribute('y1', String(trayY + 6));
      railBottom.setAttribute('x2', String(maxX + 50));
      railBottom.setAttribute('y2', String(trayY + 6));
      railBottom.setAttribute('stroke', isUnderfloor ? '#1f2937' : '#3a3a42');
      railBottom.setAttribute('stroke-width', '2');
      trayGroup.appendChild(railBottom);
      
      for (let x = Math.floor(minX - 50); x <= Math.floor(maxX + 50); x += 20) {
        const rung = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        rung.setAttribute('x1', String(x));
        rung.setAttribute('y1', String(trayY - 6));
        rung.setAttribute('x2', String(x));
        rung.setAttribute('y2', String(trayY + 6));
        rung.setAttribute('stroke', isUnderfloor ? '#111827' : '#2b2b32');
        rung.setAttribute('stroke-width', '1.5');
        trayGroup.appendChild(rung);
      }
      
      const trayLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      trayLabel.setAttribute('x', String((minX + maxX) / 2));
      trayLabel.setAttribute('y', String(isUnderfloor ? trayY + 16 : trayY - 12));
      trayLabel.setAttribute('text-anchor', 'middle');
      trayLabel.setAttribute('fill', isUnderfloor ? '#374151' : '#4f5660');
      trayLabel.setAttribute('font-size', '8');
      trayLabel.setAttribute('font-family', 'monospace');
      trayLabel.setAttribute('letter-spacing', '1');
      trayLabel.textContent = isUnderfloor ? 'UNDERFLOOR CABLE TRAY' : 'OVERHEAD CABLE RUNWAY';
      trayGroup.appendChild(trayLabel);
      
      rackLayer.appendChild(trayGroup);
    }

    // Render racks
    for (const rack of s.racks) {
      let rackGroup: SVGGElement;
      try {
        rackGroup = renderRack(rack, rackLayer);
      } catch (err) {
        console.error(`renderAll: failed to render rack "${rack.id}" (${rack.name}) — skipping it so the rest of the canvas can still render`, err);
        continue;
      }

      // Render devices in this rack. Each device is isolated so a single bad device
      // (e.g. corrupted/legacy deviceConfig) can't blank the entire canvas — before this,
      // one throwing renderDevice() call would abort renderAll() with the layers already
      // cleared, leaving nothing visible at all.
      const devices = stateManager.getDevicesInRack(rack.id);
      for (const device of devices) {
        try {
          const deviceGroup = renderDevice(device, 0, 0, rack.units);
          rackGroup.appendChild(deviceGroup);
        } catch (err) {
          console.error(`renderAll: failed to render device "${device.id}" (${device.name}) — skipping it so the rest of the canvas can still render`, err);
        }
      }
    }

    // Render cables — same per-item isolation as the device loop above.
    for (const cable of s.cables) {
      try {
        let sourcePos = cable.floatingSource || stateManager.getPortWorldPosition(cable.sourcePortId);
        let destPos = cable.destPortId ? stateManager.getPortWorldPosition(cable.destPortId) : null;
        if (!destPos && cable.floatingDest) {
          destPos = cable.floatingDest;
        }
        if (sourcePos && destPos) {
          const srcPort = stateManager.getPort(cable.sourcePortId);
          const destPort = cable.destPortId ? stateManager.getPort(cable.destPortId) : null;

          let srcVisible = true;
          let destVisible = true;
          const isRear = s.cabinetViewMode === 'rear';

          const isPortVisibleOnSide = (p: typeof srcPort, isRearSide: boolean) => {
            if (!p) return true;
            const dev = stateManager.getDevice(p.deviceId);
            const temp = dev ? getTemplate(dev.templateId) : null;
            const cat = temp?.category || 'server';

            if (p.id.includes('-ear-')) {
              return !isRearSide;
            }

            if (cat === 'server' || cat === 'firewall' || cat === 'storage' || cat === 'ups' || cat === 'pdu') {
              return isRearSide;
            } else if (cat === 'switch' || cat === 'patch-panel') {
              if (p.type === 'power') return isRearSide;
              return !isRearSide;
            }
            return true;
          };

          if (srcPort) srcVisible = isPortVisibleOnSide(srcPort, isRear);
          if (destPort) destVisible = isPortVisibleOnSide(destPort, isRear);

          if (srcVisible || destVisible) {
            renderCable(cable, sourcePos, destPos, cableLayer);
          }
        }
      } catch (err) {
        console.error(`renderAll: failed to render cable "${cable.id}" (${cable.name}) — skipping it so the rest of the canvas can still render`, err);
      }
    }

    this.renderAnnotationLayer();

    // Rack Load Summary / Cable Types cards — the exact same cards export draws, rendered live
    // here (inside the pannable/zoomable viewport, so they scale and pan correctly with the
    // rack — unlike the old fixed-position HTML overlay this replaced) and always draggable, so
    // their per-rack placement (rack.summaryCardOffset) doubles as both "get them out of the
    // way of a label" for live editing and the exact position the export uses — one system, not
    // two that could disagree.
    const summaryPreviewLayer = this.canvas.getLayer('summary-preview-layer');
    if (summaryPreviewLayer) {
      summaryPreviewLayer.innerHTML = '';
      if (s.showLegends) {
        // While actively dragging, splice in the transient live offset for just that rack —
        // never written to real state, so nothing hits the undo stack until mouseup commits it.
        const racksForPreview = this.summaryCardDragPreview
          ? s.racks.map(r => r.id === this.summaryCardDragPreview!.rackId
              ? { ...r, summaryCardOffset: this.summaryCardDragPreview!.offset }
              : r)
          : s.racks;
        appendExportSummaryOverlay(summaryPreviewLayer, racksForPreview, s.devices, s.cables, s.customLegendItems, { draggable: true });
      }
    }
  }

  /**
   * Re-renders just the annotation layer (image assets + text labels) without touching
   * racks/devices/cables. renderAll() calls this as part of a full render; text/image drag and
   * resize call it directly on every mousemove instead of the full renderAll() — rebuilding
   * every rack/device/cable from scratch at mouse-move frequency is what made dragging a small
   * label feel like it was stuttering, even once the position math itself was smooth.
   */
  private renderAnnotationLayer() {
    const s = stateManager.getState();
    const labelLayer = this.canvas.getLayer('label-layer');
    if (!labelLayer) return;

    labelLayer.innerHTML = '';

    for (const asset of s.imageAssets) {
      try {
        const isSelected = s.selection.some(sel => sel.type === 'image' && sel.id === asset.id);
        renderImageAsset(asset, labelLayer, isSelected);
      } catch (err) {
        console.error(`renderAnnotationLayer: failed to render image asset "${asset.id}" — skipping it so the rest of the layer can still render`, err);
      }
    }
    for (const label of s.textLabels) {
      try {
        const isSelected = s.selection.some(sel => sel.type === 'text' && sel.id === label.id);
        // Graceful degrade: if pointerDeviceId is stale (its target device was deleted),
        // getDeviceWorldOrigin returns null and the label just renders as a plain floating box
        // with no connector — never a crash or a dangling-reference render.
        const deviceAnchorWorld = label.pointerDeviceId
          ? this.resolveLabelPointerAnchor(label)
          : null;
        renderTextLabel(label, labelLayer, isSelected, deviceAnchorWorld);
      } catch (err) {
        console.error(`renderAnnotationLayer: failed to render text label "${label.id}" — skipping it so the rest of the layer can still render`, err);
      }
    }
  }

  /** Resolves a pointer-carrying label's world anchor point from its live device position
   *  (device.rackId/startUnit) plus its stored device-local offset — see getDeviceWorldOrigin. */
  private resolveLabelPointerAnchor(label: TextLabel): Point | null {
    if (!label.pointerDeviceId) return null;
    const origin = stateManager.getDeviceWorldOrigin(label.pointerDeviceId);
    if (!origin) return null;
    return { x: origin.x + (label.pointerAnchorX ?? 0), y: origin.y + (label.pointerAnchorY ?? 0) };
  }

  /**
   * Update canvas cursor based on current tool.
   */
  private updateCanvasCursor(mode: ToolMode) {
    const cursorMap: Record<ToolMode, string> = {
      'select': 'default',
      'pan': 'grab',
      'cable': 'crosshair',
      'power': 'crosshair',
      'text': 'text',
      'label': 'crosshair',
      'zoom-in': 'zoom-in',
      'zoom-out': 'zoom-out',
      'export-area': 'crosshair',
      'cloud-container': 'crosshair',
      'cloud-connect': 'crosshair',
      'cloud-export-area': 'crosshair',
    };
    const cursor = cursorMap[mode] || 'default';

    const viewport = document.getElementById('canvas-viewport');
    if (viewport) viewport.style.cursor = cursor;

    // #cloud-canvas sits in its own #cloud-viewport, a sibling of #canvas-viewport (see
    // canvas.css) — its default cursor (set in cloud-canvas.css) is never touched by the rule
    // above, so cloud-only tools (container/connect/export-area) need their own explicit update
    // here or the cursor silently stays 'default' even while a draw tool is armed.
    const cloudCanvasEl = document.getElementById('cloud-canvas');
    if (cloudCanvasEl) cloudCanvasEl.style.cursor = cursor;
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
      const oldCables = stateManager.getState().cables;
      const colorMap = new Map<string, string>();
      currentItems.forEach(oldItem => {
        const newItem = items.find(it => it.id === oldItem.id);
        if (newItem && newItem.color !== oldItem.color) {
          colorMap.set(oldItem.color.toLowerCase(), newItem.color);
        }
      });

      if (colorMap.size > 0) {
        const updatedCables = oldCables.map(cable => {
          const newColor = colorMap.get(cable.color.toLowerCase());
          if (newColor) {
            return { ...cable, color: newColor };
          }
          return cable;
        });
        stateManager.setState({ cables: updatedCables });
      }

      stateManager.setState({ customLegendItems: items });
      eventBus.emit('notification', { message: 'Network legend updated successfully!', type: 'success' });
      this.renderAll();
      modal.remove();
    });
  }

  private addCameraPresetButtons(container: HTMLElement): void {
    if (!this.threeViewport) return;
    const bar = document.createElement('div');
    bar.id = 'three-cam-presets';
    const presets = ['Front', 'Rear', 'Left', 'Right', 'Top', 'Perspective'] as const;
    let activeBtn: HTMLButtonElement | null = null;

    for (const label of presets) {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.addEventListener('click', () => {
        this.threeViewport!.setPreset(label.toLowerCase() as any);
        activeBtn?.classList.remove('active');
        btn.classList.add('active');
        activeBtn = btn;
      });
      bar.appendChild(btn);
      if (label === 'Perspective') {
        btn.classList.add('active');
        activeBtn = btn;
      }
    }

    container.appendChild(bar);
  }

  private addDoorPanel(container: HTMLElement): void {
    if (!this.threeViewport) return;

    const panel = document.createElement('div');
    panel.id = 'three-door-panel';
    panel.style.cssText = [
      'position:absolute', 'top:12px', 'right:12px', 'z-index:30',
      'display:flex', 'flex-direction:column', 'gap:6px',
      'background:#0c1828', 'border:1px solid #2a4a70',
      'border-radius:7px', 'padding:9px 12px',
      'box-shadow:0 2px 12px rgba(0,0,0,0.6)',
    ].join(';');

    const lbl = document.createElement('div');
    lbl.textContent = 'RACK DOOR';
    lbl.style.cssText = [
      'font-size:9px', 'color:#4a7aaa', 'font-family:monospace',
      'letter-spacing:2px', 'text-align:center', 'user-select:none',
    ].join(';');
    panel.appendChild(lbl);

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:4px;';

    type DoorState = 'closed' | 'open' | 'removed';
    const states: { state: DoorState; label: string }[] = [
      { state: 'closed',  label: 'Closed'  },
      { state: 'open',    label: 'Open'    },
      { state: 'removed', label: 'Removed' },
    ];

    const BASE_BTN = [
      'background:#0e2040', 'border:1px solid #254060', 'color:#6aaad8',
      'border-radius:4px', 'padding:5px 10px', 'font-size:10px',
      'cursor:pointer', 'font-family:monospace', 'transition:none',
      'outline:none',
    ].join(';');
    const ACTIVE_BTN = [
      'background:#1a4080', 'border:1px solid #4a90d0', 'color:#ffffff',
      'border-radius:4px', 'padding:5px 10px', 'font-size:10px',
      'cursor:pointer', 'font-family:monospace', 'transition:none',
      'outline:none',
    ].join(';');

    let activeBtn: HTMLButtonElement | null = null;
    for (const { state, label } of states) {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.style.cssText = state === 'closed' ? ACTIVE_BTN : BASE_BTN;
      btn.addEventListener('click', () => {
        if (activeBtn) activeBtn.style.cssText = BASE_BTN;
        btn.style.cssText = ACTIVE_BTN;
        activeBtn = btn;
        this.threeViewport!.setDoorState(state);
      });
      row.appendChild(btn);
      if (state === 'closed') activeBtn = btn;
    }
    panel.appendChild(row);

    // ── Rack Colour — swatch buttons ──────────────────────────────────────────
    const colorLbl = document.createElement('div');
    colorLbl.textContent = 'RACK COLOUR';
    colorLbl.style.cssText = lbl.style.cssText;
    panel.appendChild(colorLbl);

    const colorRow = document.createElement('div');
    colorRow.style.cssText = 'display:flex;gap:5px;';

    // Keep in sync with rack-builder.ts's RACK_COLOR_PRESETS (key + label + swatch color).
    const colorPresets: { key: 'white' | 'grey' | 'ivory' | 'black' | 'matte-black'; label: string; swatch: string }[] = [
      { key: 'white',       label: 'White',       swatch: '#e8e8e4' },
      { key: 'grey',        label: 'Grey',        swatch: '#8a8d90' },
      { key: 'ivory',       label: 'Ivory',       swatch: '#efe7d0' },
      { key: 'black',       label: 'Black',       swatch: '#0c0e12' },
      { key: 'matte-black', label: 'Matte Black', swatch: '#131416' },
    ];

    let activeSwatchBtn: HTMLButtonElement | null = null;
    for (const { key, label, swatch } of colorPresets) {
      const btn = document.createElement('button');
      btn.title = label;
      btn.style.cssText = [
        'width:20px', 'height:20px', 'border-radius:4px', 'cursor:pointer',
        `background:${swatch}`,
        key === 'black' ? 'border:2px solid #4a90d0' : 'border:1px solid #254060',
        'outline:none', 'padding:0',
      ].join(';');
      btn.addEventListener('click', () => {
        if (activeSwatchBtn) activeSwatchBtn.style.borderColor = '#254060';
        if (activeSwatchBtn) activeSwatchBtn.style.borderWidth = '1px';
        btn.style.borderColor = '#4a90d0';
        btn.style.borderWidth = '2px';
        activeSwatchBtn = btn;
        this.threeViewport!.setRackColor(key);
      });
      colorRow.appendChild(btn);
      if (key === 'black') activeSwatchBtn = btn;
    }
    panel.appendChild(colorRow);

    // ── Transparency Threshold — side/back panel opacity slider ────────────────
    const opacityLbl = document.createElement('div');
    opacityLbl.textContent = 'TRANSPARENCY THRESHOLD';
    opacityLbl.style.cssText = lbl.style.cssText;
    panel.appendChild(opacityLbl);

    const opacityRow = document.createElement('div');
    opacityRow.style.cssText = 'display:flex;align-items:center;gap:6px;';

    const opacitySlider = document.createElement('input');
    opacitySlider.type = 'range';
    opacitySlider.min = '0';
    opacitySlider.max = '100';
    opacitySlider.value = '100';
    opacitySlider.style.cssText = 'width:90px;accent-color:#4a90d0;';

    const opacityValueLbl = document.createElement('span');
    opacityValueLbl.textContent = '100%';
    opacityValueLbl.style.cssText = 'font-size:10px;color:#6aaad8;font-family:monospace;width:32px;text-align:right;';

    opacitySlider.addEventListener('input', () => {
      const pct = Number(opacitySlider.value);
      opacityValueLbl.textContent = `${pct}%`;
      this.threeViewport!.setPanelOpacity(pct / 100);
    });

    opacityRow.appendChild(opacitySlider);
    opacityRow.appendChild(opacityValueLbl);
    panel.appendChild(opacityRow);

    container.appendChild(panel);
  }

  private addNavPanel(container: HTMLElement): void {
    if (!this.threeViewport) return;

    const panel = document.createElement('div');
    panel.id = 'three-nav-panel';
    panel.style.cssText = [
      'position:absolute', 'bottom:52px', 'left:12px', 'z-index:30',
      'display:flex', 'flex-direction:column', 'gap:4px',
      'background:#0c1828', 'border:1px solid #2a4a70',
      'border-radius:7px', 'padding:8px 10px',
      'box-shadow:0 2px 12px rgba(0,0,0,0.6)',
    ].join(';');

    const lbl = document.createElement('div');
    lbl.textContent = 'NAVIGATE';
    lbl.style.cssText = [
      'font-size:9px', 'color:#4a7aaa', 'font-family:monospace',
      'letter-spacing:2px', 'text-align:center', 'user-select:none',
      'margin-bottom:2px',
    ].join(';');
    panel.appendChild(lbl);

    const BASE = [
      'background:#0e2040', 'border:1px solid #254060', 'color:#6aaad8',
      'border-radius:4px', 'padding:5px 0', 'font-size:13px', 'width:32px',
      'cursor:pointer', 'font-family:monospace', 'text-align:center',
      'outline:none', 'display:block',
    ].join(';');
    const ACTIVE = BASE.replace('background:#0e2040', 'background:#1a4080')
                       .replace('border:1px solid #254060', 'border:1px solid #4a90d0')
                       .replace('color:#6aaad8', 'color:#ffffff');

    // Pan toggle
    const panBtn = document.createElement('button');
    panBtn.textContent = '✋';
    panBtn.title = 'Pan mode (left-drag to pan; click again for orbit)';
    panBtn.style.cssText = BASE;
    let panActive = false;
    panBtn.addEventListener('click', () => {
      panActive = !panActive;
      panBtn.style.cssText = panActive ? ACTIVE : BASE;
      this.threeViewport!.setPanMode(panActive);
    });
    panel.appendChild(panBtn);

    // Zoom in
    const zoomInBtn = document.createElement('button');
    zoomInBtn.textContent = '+';
    zoomInBtn.title = 'Zoom in';
    zoomInBtn.style.cssText = BASE;
    zoomInBtn.addEventListener('click', () => this.threeViewport!.zoomBy(0.75));
    panel.appendChild(zoomInBtn);

    // Zoom out
    const zoomOutBtn = document.createElement('button');
    zoomOutBtn.textContent = '−';
    zoomOutBtn.title = 'Zoom out';
    zoomOutBtn.style.cssText = BASE;
    zoomOutBtn.addEventListener('click', () => this.threeViewport!.zoomBy(1.35));
    panel.appendChild(zoomOutBtn);

    // Fit / reset
    const fitBtn = document.createElement('button');
    fitBtn.textContent = '⊡';
    fitBtn.title = 'Fit scene to view';
    fitBtn.style.cssText = BASE;
    fitBtn.addEventListener('click', () => this.threeViewport!.fitCameraToScene());
    panel.appendChild(fitBtn);

    container.appendChild(panel);
  }

  // ============================================================================================
  // Cloud Architecture canvas — standalone diagram mode, independent of the rack canvas above.
  // ============================================================================================

  /** Switches the top-level workspace between the rack elevation view (2D+3D, unchanged) and
   *  the Cloud Architecture canvas. The two are never shown at once. */
  setActiveView(view: 'rack' | 'cloud'): void {
    stateManager.setState({ activeView: view });

    const rackViewport = document.getElementById('canvas-viewport');
    const cloudViewport = document.getElementById('cloud-viewport');
    const splitter = document.getElementById('splitter-3d');
    const rulerCorner = document.getElementById('ruler-corner');
    const rulerH = document.getElementById('ruler-horizontal');
    const rulerV = document.getElementById('ruler-vertical');
    const minimap = document.getElementById('minimap');
    const isCloud = view === 'cloud';

    rackViewport?.classList.toggle('hidden', isCloud);
    cloudViewport?.classList.toggle('hidden', !isCloud);
    rulerCorner?.classList.toggle('hidden', isCloud);
    rulerH?.classList.toggle('hidden', isCloud);
    rulerV?.classList.toggle('hidden', isCloud);
    minimap?.classList.toggle('hidden', isCloud);
    if (splitter) {
      if (isCloud) {
        splitter.classList.add('hidden');
      } else if (splitter.style.display !== 'none') {
        // Only re-show if it wasn't permanently hidden by the WebGL-init-failure fallback in
        // init() (that sets inline style, not the .hidden class) — see init()'s try/catch.
        splitter.classList.remove('hidden');
      }
    }

    eventBus.emit('view:changed', view);
    this.sidebar.render();
    if (isCloud) this.renderCloudAll();
  }

  /** Re-renders every CloudContainer/CloudNode/CloudConnector from current state. Mirrors
   *  renderAll()'s clear-and-rebuild pattern but scoped to the cloud canvas's own layers. */
  private renderCloudAll(): void {
    if (!this.cloudCanvas) return;
    const s = stateManager.getState();
    const containerLayer = this.cloudCanvas!.getLayer('cloud-container-layer');
    const hierarchyLayer = this.cloudCanvas!.getLayer('cloud-hierarchy-layer');
    const nodeLayer = this.cloudCanvas!.getLayer('cloud-node-layer');
    const connectorLayer = this.cloudCanvas!.getLayer('cloud-connector-layer');
    if (!containerLayer || !hierarchyLayer || !nodeLayer || !connectorLayer) return;

    containerLayer.innerHTML = '';
    hierarchyLayer.innerHTML = '';
    nodeLayer.innerHTML = '';
    connectorLayer.innerHTML = '';

    const selectedContainerIds = new Set(s.selection.filter(i => i.type === 'cloud-container').map(i => i.id));
    for (const container of s.cloudContainers) {
      const iconPath = container.iconId ? getCloudIcon(container.iconId)?.path : undefined;
      renderCloudContainer(container, containerLayer, selectedContainerIds.has(container.id), iconPath);
    }

    const selectedHierarchyIds = new Set(s.selection.filter(i => i.type === 'cloud-hierarchy').map(i => i.id));
    for (const hierarchy of s.cloudHierarchies) {
      const icons = hierarchy.levels.map(l => hierarchyLevelIcon(l.kind, hierarchy.provider));
      renderCloudHierarchy(hierarchy, hierarchyLayer, selectedHierarchyIds.has(hierarchy.id), icons);
    }

    const selectedNodeIds = new Set(s.selection.filter(i => i.type === 'cloud-node').map(i => i.id));
    // While a connector is being drawn (cloudConnectSourceId) or an existing tip re-dragged
    // (draggedConnectorEndpoint), the node currently under the cursor shows its connection
    // handles too, even if it isn't selected — otherwise a destination node you haven't already
    // clicked has no visible drop target at all. See renderCloudNode's showHandles param.
    const connectDragActive = !!(this.cloudConnectSourceId || this.draggedConnectorEndpoint);
    const hoverNodeId = connectDragActive ? this.cloudConnectHoverNodeId : this.hoveredCloudNodeId;
    for (const node of s.cloudNodes) {
      const icon = getCloudIcon(node.iconId);
      if (!icon) continue;
      const selected = selectedNodeIds.has(node.id);
      const showHandles = selected || node.id === hoverNodeId;
      renderCloudNode(node, icon.path, nodeLayer, selected, showHandles);
    }

    const selectedConnIds = new Set(s.selection.filter(i => i.type === 'cloud-connector').map(i => i.id));
    for (const conn of s.cloudConnectors) {
      const resolved = this.resolveCloudConnectorEndpoints(conn);
      if (!resolved) continue;
      const { from, to, fromSide, toSide } = resolved;
      const connGroup = renderCloudConnector(conn, from, to, connectorLayer, selectedConnIds.has(conn.id), fromSide, toSide);
      // While THIS connector's own tip is being re-dragged, its rendered line/hit-path sits on
      // the connector layer — painted ABOVE the node layer — and can shadow the very node
      // underneath it from hover/hit-testing, especially right at its current attachment point
      // (exactly where a user re-aiming it toward a nearby side would naturally pass the cursor).
      // That silently ate the "show 4 connection dots to snap onto" feedback and the eventual
      // drop, reading as "changing the direction doesn't snap". Let pointer events pass through
      // to whatever's underneath for the whole duration of its own drag.
      if (this.draggedConnectorEndpoint?.connectorId === conn.id) {
        connGroup.style.pointerEvents = 'none';
      }
    }
  }

  /** Resolves a CloudConnector's exact source/dest points and sides against current node
   *  positions — used by renderCloudAll() to draw it. Returns null if a referenced node no
   *  longer exists (e.g. deleted out from under the connector). */
  private resolveCloudConnectorEndpoints(conn: CloudConnector): { from: Point; to: Point; fromSide?: CloudHandleSide; toSide?: CloudHandleSide } | null {
    const s = stateManager.getState();
    const sourceNode = conn.sourceNodeId ? s.cloudNodes.find(n => n.id === conn.sourceNodeId) : undefined;
    const destNode = conn.destNodeId ? s.cloudNodes.find(n => n.id === conn.destNodeId) : undefined;
    if (conn.sourceNodeId && !sourceNode) return null;
    if (conn.destNodeId && !destNode) return null;

    // "Towards" reference point for inferring a missing side — the other end's node center, or
    // its floating point when there's no node there.
    const destRef = destNode ? nodeCenterWorldPoint(destNode) : conn.destPoint;
    const sourceRef = sourceNode ? nodeCenterWorldPoint(sourceNode) : conn.sourcePoint;

    const fromSide = sourceNode ? (conn.sourceSide ?? (destRef ? inferBestSide(nodeCenterWorldPoint(sourceNode), destRef) : undefined)) : undefined;
    const toSide = destNode ? (conn.destSide ?? (sourceRef ? inferBestSide(nodeCenterWorldPoint(destNode), sourceRef) : undefined)) : undefined;

    const from = sourceNode ? (fromSide ? nodeEdgeWorldPoint(sourceNode, fromSide) : nodeCenterWorldPoint(sourceNode)) : conn.sourcePoint;
    const to = destNode ? (toSide ? nodeEdgeWorldPoint(destNode, toSide) : nodeCenterWorldPoint(destNode)) : conn.destPoint;
    if (!from || !to) return null;

    return { from, to, fromSide, toSide };
  }

  /** Drag-drop from the sidebar's cloud icon palette (see sidebar.ts) onto the cloud canvas —
   *  mirrors setupDragDrop()'s device-template drop handler, but the payload is { iconId }
   *  (a cloud-icon-manifest.json id) instead of { templateId }, and placement is free-floating
   *  at the drop point rather than snapped into a rack unit slot. */
  private setupCloudDragDrop(): void {
    const viewport = document.getElementById('cloud-viewport');
    if (!viewport) return;

    viewport.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    });

    viewport.addEventListener('drop', (e) => {
      e.preventDefault();
      const jsonData = e.dataTransfer?.getData('application/json');
      if (!jsonData) return;

      try {
        const { iconId } = JSON.parse(jsonData);
        if (!iconId) return;
        const icon = getCloudIcon(iconId);
        if (!icon) return;

        // Boundary-type icons (VPC, Subnet, Resource Group, Region, Azure "Virtual Networks", ...)
        // represent an area to draw, not a point resource — dropping one primes the
        // container-draw tool instead of placing a small icon node. The user then drags out the
        // actual boundary on the canvas (finishCloudContainerDraw() picks up pendingCloudContainerSpec).
        if (isBoundaryIcon(icon)) {
          this.pendingCloudContainerSpec = { kind: inferContainerKind(icon), iconId, provider: icon.provider, label: icon.name };
          eventBus.emit('tool:changed', 'cloud-container');
          eventBus.emit('notification', { message: `Drag on the canvas to draw the ${icon.name} boundary`, type: 'info' });
          return;
        }

        const worldPos = this.cloudCanvas!.screenToWorld({ x: e.clientX, y: e.clientY });
        const { width, height } = icon.trueScale ?? { width: 64, height: 64 };
        const node: CloudNode = {
          id: generateId(),
          iconId,
          provider: icon.provider,
          x: worldPos.x - width / 2,
          y: worldPos.y - height / 2,
          width,
          height,
          label: icon.name,
          trueScale: !!icon.trueScale,
        };
        if (node.trueScale) {
          const snapped = this.snapTrueScaleNode(node, node.x, node.y);
          node.x = snapped.x;
          node.y = snapped.y;
        }
        stateManager.addCloudNode(node);
        const selection: SelectableItem[] = [{ type: 'cloud-node', id: node.id }];
        stateManager.setState({ selection });
        eventBus.emit('selection:changed', selection);
        this.renderCloudAll();
      } catch (err) {
        console.error('Cloud icon drop failed', err);
      }
    });
  }

  /** Builds the shared "Visual Order" submenu (Bring to Front/Forward, Send Backward/to Back) —
   *  used by every cloud canvas object's context menu (node/container/hierarchy/connector). Each
   *  type reorders only within its own state array/SVG layer (see reorderById's doc comment for
   *  why that's the only order that's ever visually ambiguous). `getArr`/`setArr` are passed in
   *  rather than a single array so the array is re-read fresh at click time, not captured stale
   *  when the menu was first built. */
  private visualOrderMenuItems<T extends { id: string }>(id: string, getArr: () => T[], setArr: (next: T[]) => void): MenuItem[] {
    const reorder = (direction: ZOrderDirection) => {
      setArr(reorderById(getArr(), id, direction));
      this.renderCloudAll();
    };
    return [
      { label: 'Bring to Front', icon: '⬆️', action: () => reorder('front') },
      { label: 'Bring Forward', icon: '🔼', action: () => reorder('forward') },
      { label: 'Send Backward', icon: '🔽', action: () => reorder('backward') },
      { label: 'Send to Back', icon: '⬇️', action: () => reorder('back') },
    ];
  }

  /** Right-click menu for the Cloud Architecture canvas — CloudNodes, CloudConnectors (delete,
   *  duplicate, add/remove waypoint, reset routing, line style/arrows/color/rounded corners),
   *  CloudContainers (delete, line style, color, kind), and CloudHierarchies (delete, line
   *  style/colors, edit), mirroring the rack canvas's cable context menu (see
   *  setupContextMenuHandling()). Every one of these also gets the shared Visual Order submenu
   *  (see visualOrderMenuItems). Empty background still has no menu — right-clicking it is a
   *  no-op. */
  private setupCloudContextMenu(): void {
    eventBus.on('cloud-canvas:rightclick', ({ point, target, screenPoint }) => {
      const targetEl = target as unknown as SVGElement | null;
      const waypointHandleEl = targetEl?.closest?.('.cloud-connector-waypoint-handle') as SVGElement | null;
      const connectorEl = (waypointHandleEl ?? targetEl?.closest?.('[data-cloud-connector-id]')) as SVGElement | null;
      const connectorId = connectorEl?.getAttribute('data-cloud-connector-id');

      if (!connectorId) {
        const nodeEl = targetEl?.closest?.('[data-cloud-node-id]') as SVGElement | null;
        if (nodeEl) {
          this.showCloudNodeContextMenu(nodeEl, screenPoint);
          return;
        }
        this.showCloudContainerContextMenu(targetEl, screenPoint);
        return;
      }

      const connector = stateManager.getState().cloudConnectors.find(c => c.id === connectorId);
      if (!connector) return;

      const selection: SelectableItem[] = [{ type: 'cloud-connector', id: connectorId }];
      stateManager.setState({ selection });
      eventBus.emit('selection:changed', selection);
      this.renderCloudAll();

      const waypointIndex = waypointHandleEl ? Number(waypointHandleEl.getAttribute('data-waypoint-index')) : null;

      const colorItems: MenuItem[] = [
        { label: '🟠 Orange', action: () => eventBus.emit('cloudconnector:update', { id: connectorId, data: { color: '#FF9900' } }) },
        { label: '🔷 Azure Blue', action: () => eventBus.emit('cloudconnector:update', { id: connectorId, data: { color: '#0078D4' } }) },
        { label: '🔴 GCP Red', action: () => eventBus.emit('cloudconnector:update', { id: connectorId, data: { color: '#4285F4' } }) },
        { label: '🟢 Green', action: () => eventBus.emit('cloudconnector:update', { id: connectorId, data: { color: '#3fb950' } }) },
        { label: '🟣 Purple', action: () => eventBus.emit('cloudconnector:update', { id: connectorId, data: { color: '#8e24aa' } }) },
        { label: '⚪ Grey (default)', action: () => eventBus.emit('cloudconnector:update', { id: connectorId, data: { color: undefined } }) },
      ];

      const styleItems: MenuItem[] = CLOUD_CONNECTOR_LINE_STYLES.map(({ value, label }) => ({
        label: (connector.style ?? 'solid') === value ? `● ${label}` : label,
        action: () => eventBus.emit('cloudconnector:update', { id: connectorId, data: { style: value } }),
      }));

      const arrowOptions: { value: CloudArrowType; label: string }[] = [
        { value: 'none', label: 'None' },
        { value: 'arrow', label: 'Arrow' },
        { value: 'arrow-open', label: 'Open Arrow' },
        { value: 'arrow-broad', label: 'Broad Arrow' },
        { value: 'dot', label: 'Dot' },
        { value: 'diamond', label: 'Diamond' },
      ];
      const startArrowItems: MenuItem[] = arrowOptions.map(({ value, label }) => ({
        label: (connector.startArrow ?? 'none') === value ? `● ${label}` : label,
        action: () => eventBus.emit('cloudconnector:update', { id: connectorId, data: { startArrow: value } }),
      }));
      const endArrowItems: MenuItem[] = arrowOptions.map(({ value, label }) => ({
        label: (connector.endArrow ?? 'arrow') === value ? `● ${label}` : label,
        action: () => eventBus.emit('cloudconnector:update', { id: connectorId, data: { endArrow: value } }),
      }));

      const clearOffsets = {
        crossbarOffset: undefined, entryOffset: undefined, exitOffset: undefined,
        entryStubOffset: undefined, exitStubOffset: undefined,
      };

      const items: MenuItem[] = [
        { label: `🔗 ${connector.label || 'Connector'}`, disabled: true },
        { separator: true, label: '' },
        { label: 'Line Style', icon: '〰️', submenu: styleItems },
        { label: 'Start Arrow', icon: '⬅️', submenu: startArrowItems },
        { label: 'End Arrow', icon: '➡️', submenu: endArrowItems },
        { label: 'Color', icon: '🎨', submenu: colorItems },
        {
          label: connector.roundedCorners ? 'Sharp Corners' : 'Rounded Corners',
          icon: '⭕',
          action: () => eventBus.emit('cloudconnector:update', { id: connectorId, data: { roundedCorners: !connector.roundedCorners } }),
        },
        { separator: true, label: '' },
        waypointIndex !== null
          ? {
              label: '🗑 Remove Waypoint',
              action: () => {
                const waypoints = (connector.waypoints ?? []).filter((_, i) => i !== waypointIndex);
                eventBus.emit('cloudconnector:update', { id: connectorId, data: { waypoints } });
              },
            }
          : {
              label: '📍 Add Waypoint Here',
              action: () => {
                const existing = connector.waypoints ?? [];
                const newPoint: Point = { x: Math.round(point.x), y: Math.round(point.y) };
                let waypoints: Point[];
                if (existing.length === 0) {
                  // First manual point on an otherwise auto-routed connector — takes over routing
                  // entirely from here (see CloudConnector.waypoints' doc comment).
                  waypoints = [newPoint];
                } else {
                  const resolved = this.resolveCloudConnectorEndpoints(connector);
                  const pts = resolved ? [resolved.from, ...existing, resolved.to] : [newPoint, ...existing, newPoint];
                  let minDist = Infinity, insertIdx = existing.length;
                  for (let i = 0; i < pts.length - 1; i++) {
                    const d = distToSegment(point, pts[i], pts[i + 1]);
                    if (d < minDist) { minDist = d; insertIdx = i; }
                  }
                  waypoints = [...existing];
                  waypoints.splice(insertIdx, 0, newPoint);
                }
                eventBus.emit('cloudconnector:update', { id: connectorId, data: { waypoints } });
              },
            },
        ...(connector.waypoints && connector.waypoints.length > 0
          ? [{
              label: '↺ Reset Routing',
              icon: '↺',
              action: () => eventBus.emit('cloudconnector:update', { id: connectorId, data: { waypoints: undefined, ...clearOffsets } }),
            }]
          : []),
        { separator: true, label: '' },
        {
          label: '⧉ Duplicate Connector',
          icon: '⧉',
          shortcut: 'Ctrl+D',
          action: () => {
            const resolved = this.resolveCloudConnectorEndpoints(connector);
            if (!resolved) return;
            const cloned = cloneCloudConnector(connector, resolved.from, resolved.to);
            stateManager.addCloudConnector(cloned);
            const sel: SelectableItem[] = [{ type: 'cloud-connector', id: cloned.id }];
            stateManager.setState({ selection: sel });
            eventBus.emit('selection:changed', sel);
            this.renderCloudAll();
          },
        },
        {
          label: 'Visual Order', icon: '📶',
          submenu: this.visualOrderMenuItems(connectorId, () => stateManager.getState().cloudConnectors, (cloudConnectors) => stateManager.setState({ cloudConnectors })),
        },
        {
          label: '🗑 Delete Connector',
          icon: '🗑',
          shortcut: 'Del',
          action: () => {
            stateManager.removeCloudConnector(connectorId);
            stateManager.setState({ selection: [] });
            eventBus.emit('selection:changed', []);
            this.renderCloudAll();
          },
        },
      ];

      this.contextMenu.show(screenPoint.x, screenPoint.y, items);
    });
  }

  /** Right-click menu for a CloudNode (a placed service icon) — just Visual Order and Delete; no
   *  color/style pickers since a node's look comes entirely from its manifest icon, not something
   *  manually tweaked per instance. */
  private showCloudNodeContextMenu(nodeEl: SVGElement, screenPoint: Point): void {
    const nodeId = nodeEl.getAttribute('data-cloud-node-id');
    if (!nodeId) return;
    const item = stateManager.getState().cloudNodes.find(n => n.id === nodeId);
    if (!item) return;

    const selection: SelectableItem[] = [{ type: 'cloud-node', id: nodeId }];
    stateManager.setState({ selection });
    eventBus.emit('selection:changed', selection);
    this.renderCloudAll();

    const items: MenuItem[] = [
      { label: `☁️ ${item.label || 'Service'}`, disabled: true },
      { separator: true, label: '' },
      {
        label: 'Visual Order', icon: '📶',
        submenu: this.visualOrderMenuItems(nodeId, () => stateManager.getState().cloudNodes, (cloudNodes) => stateManager.setState({ cloudNodes })),
      },
      { separator: true, label: '' },
      {
        label: '🗑 Delete',
        icon: '🗑',
        shortcut: 'Del',
        action: () => {
          stateManager.removeCloudNode(nodeId);
          stateManager.setState({ selection: [] });
          eventBus.emit('selection:changed', []);
          this.renderCloudAll();
        },
      },
    ];

    this.contextMenu.show(screenPoint.x, screenPoint.y, items);
  }

  /** Right-click menu for a CloudContainer (VPC/Subnet/AZ/Region/Resource-Group/Account boundary
   *  box) — line style + color, same CLOUD_CONNECTOR_LINE_STYLES catalog CloudConnector uses (see
   *  CloudContainer.style's doc comment for why 'double'-family styles look different there), plus
   *  Delete. Called from setupCloudContextMenu() whenever the right-click didn't land on a
   *  connector; a no-op if it didn't land on a container either (e.g. empty background, a node). */
  private showCloudContainerContextMenu(targetEl: SVGElement | null, screenPoint: Point): void {
    const containerEl = targetEl?.closest?.('[data-cloud-container-id]') as SVGElement | null;
    const containerId = containerEl?.getAttribute('data-cloud-container-id');
    if (!containerId) {
      this.showCloudHierarchyContextMenu(targetEl, screenPoint);
      return;
    }

    const item = stateManager.getState().cloudContainers.find(c => c.id === containerId);
    if (!item) return;

    const selection: SelectableItem[] = [{ type: 'cloud-container', id: containerId }];
    stateManager.setState({ selection });
    eventBus.emit('selection:changed', selection);
    this.renderCloudAll();

    const colorItems: MenuItem[] = [
      { label: '🟠 Orange', action: () => eventBus.emit('cloudcontainer:update', { id: containerId, data: { color: '#FF9900' } }) },
      { label: '🔷 Azure Blue', action: () => eventBus.emit('cloudcontainer:update', { id: containerId, data: { color: '#0078D4' } }) },
      { label: '🔴 GCP Red', action: () => eventBus.emit('cloudcontainer:update', { id: containerId, data: { color: '#4285F4' } }) },
      { label: '🟢 Green', action: () => eventBus.emit('cloudcontainer:update', { id: containerId, data: { color: '#3fb950' } }) },
      { label: '🟣 Purple', action: () => eventBus.emit('cloudcontainer:update', { id: containerId, data: { color: '#8e24aa' } }) },
      { label: '⚪ Grey (neutral)', action: () => eventBus.emit('cloudcontainer:update', { id: containerId, data: { color: undefined } }) },
    ];

    const styleItems: MenuItem[] = [
      { label: !item.style ? '● Kind Default' : 'Kind Default', action: () => eventBus.emit('cloudcontainer:update', { id: containerId, data: { style: undefined } }) },
      ...CLOUD_CONNECTOR_LINE_STYLES.map(({ value, label }) => ({
        label: item.style === value ? `● ${label}` : label,
        action: () => eventBus.emit('cloudcontainer:update', { id: containerId, data: { style: value } }),
      })),
    ];

    const bgOn = (item.backgroundOpacity ?? 0.08) > 0;
    const items: MenuItem[] = [
      { label: `⬚ ${item.label || 'Boundary'}`, disabled: true },
      { separator: true, label: '' },
      { label: 'Border Line Style', icon: '〰️', submenu: styleItems },
      { label: 'Border Color', icon: '🎨', submenu: colorItems },
      {
        label: bgOn ? 'Disable Background Fill' : 'Enable Background Fill',
        icon: bgOn ? '◻️' : '◼️',
        action: () => eventBus.emit('cloudcontainer:update', { id: containerId, data: { backgroundOpacity: bgOn ? 0 : 0.08 } }),
      },
      {
        label: 'Visual Order', icon: '📶',
        submenu: this.visualOrderMenuItems(containerId, () => stateManager.getState().cloudContainers, (cloudContainers) => stateManager.setState({ cloudContainers })),
      },
      { separator: true, label: '' },
      {
        label: '🗑 Delete',
        icon: '🗑',
        shortcut: 'Del',
        action: () => {
          stateManager.removeCloudContainer(containerId);
          stateManager.setState({ selection: [] });
          eventBus.emit('selection:changed', []);
          this.renderCloudAll();
        },
      },
    ];

    this.contextMenu.show(screenPoint.x, screenPoint.y, items);
  }

  /** Right-click menu for a CloudHierarchy (the "describe infra in one line" breadcrumb box, see
   *  hierarchy-input-modal.ts) — Edit (reopens the input modal, pre-filled from its current
   *  levels), plus the same Border Line Style / Border Color / Background Fill controls
   *  CloudContainer has (see showCloudContainerContextMenu just above), since it's now rendered
   *  as the same kind of boundary box. */
  private showCloudHierarchyContextMenu(targetEl: SVGElement | null, screenPoint: Point): void {
    const hierarchyEl = targetEl?.closest?.('[data-cloud-hierarchy-id]') as SVGElement | null;
    const hierarchyId = hierarchyEl?.getAttribute('data-cloud-hierarchy-id');
    if (!hierarchyId) return;

    const item = stateManager.getState().cloudHierarchies.find(h => h.id === hierarchyId);
    if (!item) return;

    const selection: SelectableItem[] = [{ type: 'cloud-hierarchy', id: hierarchyId }];
    stateManager.setState({ selection });
    eventBus.emit('selection:changed', selection);
    this.renderCloudAll();

    // Ribbon (label chip) and Line (boundary border/tint) are two independently-colorable
    // elements — see CloudHierarchy.ribbonColor's doc comment for why they used to be locked
    // together (both driven by the same `color` field) and no longer are.
    const lineColorItems: MenuItem[] = [
      { label: '🟠 Orange', action: () => eventBus.emit('cloudhierarchy:update', { id: hierarchyId, data: { color: '#FF9900' } }) },
      { label: '🔷 Azure Blue', action: () => eventBus.emit('cloudhierarchy:update', { id: hierarchyId, data: { color: '#0078D4' } }) },
      { label: '🔴 GCP Red', action: () => eventBus.emit('cloudhierarchy:update', { id: hierarchyId, data: { color: '#4285F4' } }) },
      { label: '🟢 Green', action: () => eventBus.emit('cloudhierarchy:update', { id: hierarchyId, data: { color: '#3fb950' } }) },
      { label: '🟣 Purple', action: () => eventBus.emit('cloudhierarchy:update', { id: hierarchyId, data: { color: '#8e24aa' } }) },
      { label: '⚪ Grey (neutral)', action: () => eventBus.emit('cloudhierarchy:update', { id: hierarchyId, data: { color: undefined } }) },
    ];

    const ribbonColorItems: MenuItem[] = [
      { label: '🟠 Orange', action: () => eventBus.emit('cloudhierarchy:update', { id: hierarchyId, data: { ribbonColor: '#FF9900' } }) },
      { label: '🔷 Azure Blue', action: () => eventBus.emit('cloudhierarchy:update', { id: hierarchyId, data: { ribbonColor: '#0078D4' } }) },
      { label: '🔴 GCP Red', action: () => eventBus.emit('cloudhierarchy:update', { id: hierarchyId, data: { ribbonColor: '#4285F4' } }) },
      { label: '🟢 Green', action: () => eventBus.emit('cloudhierarchy:update', { id: hierarchyId, data: { ribbonColor: '#3fb950' } }) },
      { label: '🟣 Purple', action: () => eventBus.emit('cloudhierarchy:update', { id: hierarchyId, data: { ribbonColor: '#8e24aa' } }) },
      { label: '⚪ Match Line Color', action: () => eventBus.emit('cloudhierarchy:update', { id: hierarchyId, data: { ribbonColor: undefined } }) },
    ];

    const styleItems: MenuItem[] = [
      { label: !item.style ? '● Default' : 'Default', action: () => eventBus.emit('cloudhierarchy:update', { id: hierarchyId, data: { style: undefined } }) },
      ...CLOUD_CONNECTOR_LINE_STYLES.map(({ value, label }) => ({
        label: item.style === value ? `● ${label}` : label,
        action: () => eventBus.emit('cloudhierarchy:update', { id: hierarchyId, data: { style: value } }),
      })),
    ];

    const bgOn = (item.backgroundOpacity ?? 0.08) > 0;
    const items: MenuItem[] = [
      { label: '✏️ Edit…', icon: '✏️', action: () => this.editCloudHierarchy(hierarchyId) },
      { separator: true, label: '' },
      { label: 'Border Line Style', icon: '〰️', submenu: styleItems },
      { label: 'Line Color', icon: '🎨', submenu: lineColorItems },
      { label: 'Ribbon Color', icon: '🎀', submenu: ribbonColorItems },
      {
        label: bgOn ? 'Disable Background Fill' : 'Enable Background Fill',
        icon: bgOn ? '◻️' : '◼️',
        action: () => eventBus.emit('cloudhierarchy:update', { id: hierarchyId, data: { backgroundOpacity: bgOn ? 0 : 0.08 } }),
      },
      {
        label: 'Visual Order', icon: '📶',
        submenu: this.visualOrderMenuItems(hierarchyId, () => stateManager.getState().cloudHierarchies, (cloudHierarchies) => stateManager.setState({ cloudHierarchies })),
      },
      { separator: true, label: '' },
      {
        label: '🗑 Delete',
        icon: '🗑',
        shortcut: 'Del',
        action: () => {
          stateManager.removeCloudHierarchy(hierarchyId);
          stateManager.setState({ selection: [] });
          eventBus.emit('selection:changed', []);
          this.renderCloudAll();
        },
      },
    ];

    this.contextMenu.show(screenPoint.x, screenPoint.y, items);
  }

  /** Reopens the "describe infra in one line" modal pre-filled from an existing hierarchy's
   *  current levels (see hierarchyLevelsToLine), so editing doesn't mean delete-and-retype. */
  private editCloudHierarchy(hierarchyId: string): void {
    const item = stateManager.getState().cloudHierarchies.find(h => h.id === hierarchyId);
    if (!item) return;
    showHierarchyInputModal({
      provider: item.provider,
      initialLine: hierarchyLevelsToLine(item.levels),
      onSubmit: (provider, levels) => {
        eventBus.emit('cloudhierarchy:update', { id: hierarchyId, data: { provider, levels } });
      },
    });
  }

  /** Draws/updates the live rectangle preview for the cloud-container draw tool into
   *  cloud-interaction-layer (mirrors the export-area tool's mousedown-drag-mouseup rectangle,
   *  see the 'export-area' branch in setupCanvasInteractions()'s mousedown handler). */
  private renderCloudContainerDrawPreview(start: Point, current: Point): void {
    if (!this.cloudContainerDrawEl) {
      const layer = this.cloudCanvas!.getLayer('cloud-interaction-layer');
      if (!layer) return;
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect') as SVGRectElement;
      rect.setAttribute('fill', 'rgba(88,166,255,0.08)');
      rect.setAttribute('stroke', '#58a6ff');
      rect.setAttribute('stroke-width', '1.5');
      rect.setAttribute('stroke-dasharray', '6,4');
      rect.setAttribute('pointer-events', 'none');
      layer.appendChild(rect);
      this.cloudContainerDrawEl = rect;
    }
    const x = Math.min(start.x, current.x);
    const y = Math.min(start.y, current.y);
    const w = Math.abs(current.x - start.x);
    const h = Math.abs(current.y - start.y);
    this.cloudContainerDrawEl.setAttribute('x', String(x));
    this.cloudContainerDrawEl.setAttribute('y', String(y));
    this.cloudContainerDrawEl.setAttribute('width', String(w));
    this.cloudContainerDrawEl.setAttribute('height', String(h));
  }

  private cancelCloudContainerDraw(): void {
    this.isDrawingCloudContainer = false;
    this.cloudContainerDrawEl?.remove();
    this.cloudContainerDrawEl = null;
    this.pendingCloudContainerSpec = null;
  }

  private finishCloudContainerDraw(current: Point): void {
    const start = this.cloudContainerDrawStart;
    // Captured before cancelCloudContainerDraw() clears it below.
    const pending = this.pendingCloudContainerSpec;
    this.cancelCloudContainerDraw();

    const x = Math.min(start.x, current.x);
    const y = Math.min(start.y, current.y);
    const w = Math.abs(current.x - start.x);
    const h = Math.abs(current.y - start.y);
    if (w < 20 || h < 20) {
      if (pending) {
        eventBus.emit('notification', { message: 'Drag out a larger area to draw the boundary', type: 'warning' });
      }
      return; // too small to be an intentional container — ignore accidental clicks
    }

    const container: CloudContainer = {
      id: generateId(),
      kind: pending?.kind ?? 'generic',
      provider: pending?.provider ?? null,
      iconId: pending?.iconId,
      x, y, width: w, height: h,
      label: pending?.label ?? 'Container',
    };
    stateManager.addCloudContainer(container);
    const selection: SelectableItem[] = [{ type: 'cloud-container', id: container.id }];
    stateManager.setState({ selection });
    eventBus.emit('selection:changed', selection);
    eventBus.emit('tool:changed', 'select');
    this.renderCloudAll();
  }

  /** Draws/updates the live connector-preview line for the cloud-connect tool (mirrors the
   *  cable tool's in-progress preview line). */
  private renderCloudConnectPreview(sourceNodeId: string, current: Point): void {
    const s = stateManager.getState();
    const source = s.cloudNodes.find(n => n.id === sourceNodeId);
    if (!source) return;
    const from = this.cloudConnectSourceSide ? nodeEdgeWorldPoint(source, this.cloudConnectSourceSide) : nodeCenterWorldPoint(source);

    if (!this.cloudConnectPreviewEl) {
      const layer = this.cloudCanvas!.getLayer('cloud-interaction-layer');
      if (!layer) return;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line') as SVGLineElement;
      line.setAttribute('stroke', '#58a6ff');
      line.setAttribute('stroke-width', '2');
      line.setAttribute('stroke-dasharray', '6,4');
      line.setAttribute('pointer-events', 'none');
      layer.appendChild(line);
      this.cloudConnectPreviewEl = line;
    }
    this.cloudConnectPreviewEl.setAttribute('x1', String(from.x));
    this.cloudConnectPreviewEl.setAttribute('y1', String(from.y));
    this.cloudConnectPreviewEl.setAttribute('x2', String(current.x));
    this.cloudConnectPreviewEl.setAttribute('y2', String(current.y));
  }

  private cancelCloudConnect(): void {
    this.cloudConnectSourceId = null;
    this.cloudConnectSourceSide = undefined;
    this.cloudConnectMouseDownScreen = null;
    this.cloudConnectHoverNodeId = undefined;
    this.cloudConnectHoverSide = undefined;
    this.cloudConnectPreviewEl?.remove();
    this.cloudConnectPreviewEl = null;
  }

  /** Finishes a connector from `sourceNodeId` to either another node (`destNodeId`) or a bare
   *  point (`destPoint`, mirrors CableData's floatingDest for the Airdrop Destination cable
   *  mode) — clicking empty canvas still creates a usable connector rather than requiring a
   *  second real node. */
  private commitCloudConnector(sourceNodeId: string, dest: { nodeId: string } | { point: Point }): void {
    // Captured before cancelCloudConnect() clears them below.
    const sourceSide = this.cloudConnectSourceSide;
    const destSide = this.cloudConnectHoverSide;
    this.cancelCloudConnect();
    if ('nodeId' in dest && dest.nodeId === sourceNodeId) return; // no self-connectors

    const connector: CloudConnector = {
      id: generateId(),
      sourceNodeId,
      destNodeId: 'nodeId' in dest ? dest.nodeId : null,
      destPoint: 'point' in dest ? dest.point : null,
      sourceSide,
      // Only meaningful when landing on a node — a floating point has no "side" to enter from,
      // and an unrecognized destSide is left undefined so the renderer infers a sensible one
      // from relative position (see inferBestSide() in cloud-connector-renderer.ts).
      destSide: 'nodeId' in dest ? destSide : undefined,
      style: 'solid',
      routing: 'orthogonal',
      // A freshly drawn connector defaults to a plain dest-end arrow (renderCloudConnector's own
      // ?? 'arrow' default already gives this — set explicitly here anyway so it's visible in
      // the object literal) so it's immediately readable as directional, not a bare line that
      // reads as "did this even work?" — every tip style is a one-click change afterward.
      endArrow: 'arrow',
    };
    stateManager.addCloudConnector(connector);
    const selection: SelectableItem[] = [{ type: 'cloud-connector', id: connector.id }];
    stateManager.setState({ selection });
    eventBus.emit('selection:changed', selection);
    this.renderCloudAll();
  }

  /** "True Scale" nodes (see cloud-icon-catalog.ts's CloudIconEntry.trueScale) snap on
   *  release/drop instead of landing at an arbitrary pixel, mirroring how the rack canvas's own
   *  devices only ever sit at whole rack-unit positions:
   *  - Dropped/dragged over a True-Scale Rack Cabinet node: x snaps flush to the cabinet's inner
   *    rail opening, y snaps to the nearest whole rack-unit slot within that cabinet (clamped so
   *    the device can't hang off the top/bottom).
   *  - Otherwise: y snaps to the global RU_HEIGHT grid so stand-alone true-scale items (not
   *    inside any cabinet) still stack cleanly against each other.
   *  This is placement/visual alignment only — there's no occupancy/collision tracking here the
   *  way the rack canvas's startUnit system has, so two true-scale devices CAN overlap. */
  private snapTrueScaleNode(node: CloudNode, x: number, y: number): { x: number; y: number } {
    const RU = RACK_CONSTANTS.RU_HEIGHT;
    const isCabinet = node.iconId.includes('rack-cabinet');

    if (!isCabinet) {
      const centerX = x + node.width / 2;
      const centerY = y + node.height / 2;
      const cabinets = stateManager.getState().cloudNodes.filter(
        n => n.id !== node.id && n.trueScale && n.iconId.includes('rack-cabinet')
      );
      const MARGIN = 24;
      for (const cabinet of cabinets) {
        const withinX = centerX >= cabinet.x - MARGIN && centerX <= cabinet.x + cabinet.width + MARGIN;
        const withinY = centerY >= cabinet.y - MARGIN && centerY <= cabinet.y + cabinet.height + MARGIN;
        if (!withinX || !withinY) continue;

        const innerLeft = cabinet.x + RACK_CONSTANTS.RAIL_WIDTH;
        const innerTop = cabinet.y + RACK_CONSTANTS.RACK_PADDING_TOP;
        const innerBottom = cabinet.y + cabinet.height - RACK_CONSTANTS.RACK_PADDING_BOTTOM;
        const slotCount = Math.max(1, Math.round((innerBottom - innerTop) / RU));
        const deviceSlots = Math.max(1, Math.round(node.height / RU));
        const maxSlot = Math.max(0, slotCount - deviceSlots);
        const rawSlot = Math.round((y - innerTop) / RU);
        const slot = Math.min(Math.max(rawSlot, 0), maxSlot);
        return { x: innerLeft, y: innerTop + slot * RU };
      }
    }

    return { x: Math.round(x / RU) * RU, y: Math.round(y / RU) * RU };
  }

  private commitCloudNodeDrag(): void {
    const nodeId = this.draggedCloudNodeId!;
    const wasResizing = this.isResizingCloudNode;
    this.draggedCloudNodeId = null;
    this.isResizingCloudNode = false;

    const finalNode = stateManager.getState().cloudNodes.find(n => n.id === nodeId);
    if (finalNode && this.dragStartCloudNodesState) {
      stateManager.setState({ cloudNodes: this.dragStartCloudNodesState }, true);
      this.dragStartCloudNodesState = null;
      const data = wasResizing
        ? {
            width: finalNode.width,
            height: finalNode.trueScale ? Math.max(RACK_CONSTANTS.RU_HEIGHT, Math.round(finalNode.height / RACK_CONSTANTS.RU_HEIGHT) * RACK_CONSTANTS.RU_HEIGHT) : finalNode.height,
          }
        : finalNode.trueScale
          ? this.snapTrueScaleNode(finalNode, finalNode.x, finalNode.y)
          : { x: finalNode.x, y: finalNode.y };
      eventBus.emit('cloudnode:update', { id: nodeId, data });
    }
  }

  private commitCloudContainerDrag(): void {
    const containerId = this.draggedCloudContainerId!;
    const wasResizing = this.isResizingCloudContainer;
    this.draggedCloudContainerId = null;
    this.isResizingCloudContainer = false;

    const finalContainer = stateManager.getState().cloudContainers.find(c => c.id === containerId);
    if (finalContainer && this.dragStartCloudContainersState) {
      stateManager.setState({ cloudContainers: this.dragStartCloudContainersState }, true);
      this.dragStartCloudContainersState = null;
      const data = wasResizing
        ? { width: finalContainer.width, height: finalContainer.height }
        : { x: finalContainer.x, y: finalContainer.y };
      eventBus.emit('cloudcontainer:update', { id: containerId, data });
    }
  }

  private commitCloudHierarchyDrag(): void {
    const hierarchyId = this.draggedCloudHierarchyId!;
    const wasResizing = this.isResizingCloudHierarchy;
    this.draggedCloudHierarchyId = null;
    this.isResizingCloudHierarchy = false;

    const finalHierarchy = stateManager.getState().cloudHierarchies.find(h => h.id === hierarchyId);
    if (finalHierarchy && this.dragStartCloudHierarchiesState) {
      stateManager.setState({ cloudHierarchies: this.dragStartCloudHierarchiesState }, true);
      this.dragStartCloudHierarchiesState = null;
      const data = wasResizing
        ? { width: finalHierarchy.width, height: finalHierarchy.height }
        : { x: finalHierarchy.x, y: finalHierarchy.y };
      eventBus.emit('cloudhierarchy:update', { id: hierarchyId, data });
    }
  }

  /** Binds all mouse interaction on the cloud canvas: select/drag/resize (default 'select'
   *  tool), the cloud-container draw tool, and the cloud-connect tool. A separate, dedicated
   *  handler from setupCanvasInteractions() above (which owns the rack canvas's `#canvas`) —
   *  see core/cloud-canvas.ts's doc comment for why these two canvases stay fully independent. */
  private setupCloudCanvasInteractions(): void {
    const svgEl = document.getElementById('cloud-canvas') as unknown as SVGSVGElement;
    if (!svgEl) return;

    // Blanket native-drag suppression for anything living ON the cloud canvas (mainly node
    // <image> icons — see cloud-node-renderer.ts). Browsers that start an HTML5 drag session
    // despite draggable="false"/preventDefault() on mousedown stop dispatching ordinary
    // mousemove/mouseup to the dragged element entirely (replaced by drag/dragover/drop/dragend),
    // which would silently break every custom mouse-drag gesture below (move, resize, connect,
    // the export-area rectangle) with no error and no visible feedback. Doesn't affect dropping a
    // NEW icon from the sidebar palette onto the canvas — that's a 'drop' starting from a
    // 'dragstart' on the SIDEBAR item, not on this canvas.
    svgEl.addEventListener('dragstart', (e) => e.preventDefault());

    // Double-click a CloudHierarchy pill to reopen the "describe infra in one line" modal
    // pre-filled with its current levels, instead of delete-and-retype (see editCloudHierarchy).
    svgEl.addEventListener('dblclick', (e: MouseEvent) => {
      const hierarchyEl = (e.target as Element).closest('[data-cloud-hierarchy-id]') as SVGElement | null;
      const hierarchyId = hierarchyEl?.getAttribute('data-cloud-hierarchy-id');
      if (hierarchyId) this.editCloudHierarchy(hierarchyId);
    });

    svgEl.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button !== 0) return;
      const worldPos = this.cloudCanvas!.screenToWorld({ x: e.clientX, y: e.clientY });
      const tool = stateManager.getState().tool;
      const target = e.target as Element;

      // Cloud export-area drawing takes absolute priority — mirrors the rack canvas's
      // 'export-area' branch in setupCanvasInteractions()'s mousedown handler: no hit-testing
      // against nodes/containers/connectors while picking an export rectangle.
      if (tool === 'cloud-export-area') {
        this.cloudExportAreaStart = worldPos;
        this.cloudExportAreaStartScreen = { x: e.clientX, y: e.clientY };
        const layer = this.cloudCanvas!.getLayer('cloud-interaction-layer');
        if (layer) {
          const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          rect.id = 'cloud-export-area-rect';
          rect.setAttribute('fill', 'rgba(251,140,0,0.08)');
          rect.setAttribute('stroke', '#fb8c00');
          rect.setAttribute('stroke-width', '1');
          rect.setAttribute('stroke-dasharray', '4,2');
          rect.setAttribute('pointer-events', 'none');
          layer.appendChild(rect);
          this.cloudExportAreaEl = rect;
          this.isDrawingCloudExportArea = true;
        }
        // Cloud nodes render as SVG <image> elements (see cloud-node-renderer.ts), which browsers
        // can natively drag-ghost on a mousedown-drag; preventDefault stops that from hijacking
        // this gesture when the rectangle happens to start on top of a node icon.
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Connection handles (4-directional dots that appear on hover/selection, see
      // cloud-node-renderer.ts) start a connector drag regardless of the active tool — the
      // primary, discoverable way to draw a connector, so the user never has to find/activate
      // the separate "Connect" tool first. Takes priority over everything except an
      // already-in-progress container draw.
      if (!this.isDrawingCloudContainer) {
        const handleEl = target.closest('.cloud-node-connect-handle, .cloud-node-connect-handle-hit') as SVGElement | null;
        if (handleEl) {
          const handleNodeId = handleEl.getAttribute('data-cloud-node-id');
          // A connection is already pending (from an earlier click, or the source press of a
          // drag-in-progress) and this handle belongs to a DIFFERENT node — land on it and
          // complete the connector, using this exact dot as the dest side. Without this check,
          // clicking straight onto the destination's own dot (now the easiest, most obvious spot
          // to aim for, since dots reveal on hover) would instead blow away the pending
          // connection and start a brand new one from that node, which read as "the line
          // disappears and restarts as if it were the source."
          if (this.cloudConnectSourceId && handleNodeId !== this.cloudConnectSourceId) {
            this.cloudConnectHoverSide = handleEl.getAttribute('data-handle-side') as CloudHandleSide;
            this.commitCloudConnector(this.cloudConnectSourceId, { nodeId: handleNodeId! });
            return;
          }
          if (!this.cloudConnectSourceId) {
            this.cloudConnectSourceId = handleNodeId;
            this.cloudConnectSourceSide = handleEl.getAttribute('data-handle-side') as CloudHandleSide;
            this.cloudConnectMouseDownScreen = { x: e.clientX, y: e.clientY };
            this.cloudConnectHoverNodeId = undefined;
            this.cloudConnectHoverSide = undefined;
          }
          return;
        }
      }

      if (tool === 'cloud-container') {
        this.isDrawingCloudContainer = true;
        this.cloudContainerDrawStart = worldPos;
        return;
      }

      if (tool === 'cloud-connect') {
        const nodeEl = target.closest('[data-cloud-node-id]') as SVGElement | null;
        if (nodeEl) {
          const nodeId = nodeEl.getAttribute('data-cloud-node-id')!;
          if (!this.cloudConnectSourceId) {
            this.cloudConnectSourceId = nodeId;
            this.cloudConnectMouseDownScreen = { x: e.clientX, y: e.clientY };
            this.cloudConnectHoverNodeId = undefined;
          } else if (nodeId !== this.cloudConnectSourceId) {
            this.commitCloudConnector(this.cloudConnectSourceId, { nodeId });
          }
        } else if (this.cloudConnectSourceId) {
          this.commitCloudConnector(this.cloudConnectSourceId, { point: worldPos });
        }
        return;
      }

      // A connector is pending (started via a connection-handle drag while some other tool like
      // 'select' was active — handles work regardless of tool, see above) that didn't complete
      // as a drag and this second click didn't land on another handle either — complete it the
      // same way the explicit Connect tool's second click would, rather than falling through to
      // normal select/drag behavior below (which would otherwise leave it dangling forever).
      if (this.cloudConnectSourceId) {
        const nodeEl = target.closest('[data-cloud-node-id]') as SVGElement | null;
        if (nodeEl) {
          const nodeId = nodeEl.getAttribute('data-cloud-node-id')!;
          if (nodeId !== this.cloudConnectSourceId) this.commitCloudConnector(this.cloudConnectSourceId, { nodeId });
        } else {
          this.commitCloudConnector(this.cloudConnectSourceId, { point: worldPos });
        }
        return;
      }

      // 'select' tool: segment handle (entry/crossbar/exit) > endpoint handle > resize handle > node body > container body > connector > background.
      const crossbarHandle = target.closest('.cloud-connector-crossbar-handle') as SVGElement | null;
      if (crossbarHandle) {
        const connectorId = crossbarHandle.getAttribute('data-cloud-connector-id')!;
        const axis = crossbarHandle.getAttribute('data-axis') as 'x' | 'y';
        const kind = (crossbarHandle.getAttribute('data-kind') as CloudConnectorSegmentKind) ?? 'crossbar';
        this.draggedConnectorSegment = { connectorId, axis, kind };
        this.dragStartCloudConnectorsState = stateManager.getState().cloudConnectors;
        return;
      }

      const endpointHandle = target.closest('.cloud-connector-endpoint-handle') as SVGElement | null;
      if (endpointHandle) {
        const connectorId = endpointHandle.getAttribute('data-cloud-connector-id')!;
        const end = endpointHandle.getAttribute('data-end') as 'source' | 'dest';
        this.draggedConnectorEndpoint = { connectorId, end };
        this.dragStartCloudConnectorsState = stateManager.getState().cloudConnectors;
        this.cloudConnectHoverNodeId = undefined;
        this.cloudConnectHoverSide = undefined;
        return;
      }

      const waypointHandle = target.closest('.cloud-connector-waypoint-handle') as SVGElement | null;
      if (waypointHandle) {
        const connectorId = waypointHandle.getAttribute('data-cloud-connector-id')!;
        const index = Number(waypointHandle.getAttribute('data-waypoint-index'));
        this.draggedConnectorWaypoint = { connectorId, index };
        this.dragStartCloudConnectorsState = stateManager.getState().cloudConnectors;
        return;
      }

      const resizeHandle = target.closest('.cloud-node-resize-handle, .cloud-container-resize-handle, .cloud-hierarchy-resize-handle') as SVGElement | null;
      if (resizeHandle) {
        const nodeId = resizeHandle.getAttribute('data-cloud-node-id');
        const containerId = resizeHandle.getAttribute('data-cloud-container-id');
        const hierarchyId = resizeHandle.getAttribute('data-cloud-hierarchy-id');
        if (nodeId) {
          const node = stateManager.getState().cloudNodes.find(n => n.id === nodeId);
          if (node && !node.locked) {
            this.isResizingCloudNode = true;
            this.draggedCloudNodeId = nodeId;
            this.dragStartCloudWorldPos = worldPos;
            this.dragStartCloudWidth = node.width;
            this.dragStartCloudHeight = node.height;
            this.dragStartCloudNodesState = stateManager.getState().cloudNodes;
          }
        } else if (containerId) {
          const container = stateManager.getState().cloudContainers.find(c => c.id === containerId);
          if (container && !container.locked) {
            this.isResizingCloudContainer = true;
            this.draggedCloudContainerId = containerId;
            this.dragStartCloudWorldPos = worldPos;
            this.dragStartCloudWidth = container.width;
            this.dragStartCloudHeight = container.height;
            this.dragStartCloudContainersState = stateManager.getState().cloudContainers;
          }
        } else if (hierarchyId) {
          const hierarchy = stateManager.getState().cloudHierarchies.find(h => h.id === hierarchyId);
          if (hierarchy && !hierarchy.locked) {
            const icons = hierarchy.levels.map(l => hierarchyLevelIcon(l.kind, hierarchy.provider));
            const natural = getNaturalHierarchySize(hierarchy, icons);
            this.isResizingCloudHierarchy = true;
            this.draggedCloudHierarchyId = hierarchyId;
            this.dragStartCloudWorldPos = worldPos;
            this.dragStartCloudWidth = hierarchy.width ?? natural.width;
            this.dragStartCloudHeight = hierarchy.height ?? natural.height;
            this.dragStartCloudHierarchiesState = stateManager.getState().cloudHierarchies;
          }
        }
        return;
      }

      const nodeEl = target.closest('[data-cloud-node-id]') as SVGElement | null;
      if (nodeEl) {
        const nodeId = nodeEl.getAttribute('data-cloud-node-id')!;
        const node = stateManager.getState().cloudNodes.find(n => n.id === nodeId);
        const selection: SelectableItem[] = [{ type: 'cloud-node', id: nodeId }];
        stateManager.setState({ selection });
        eventBus.emit('selection:changed', selection);
        if (node && !node.locked) {
          this.draggedCloudNodeId = nodeId;
          this.dragStartCloudWorldPos = worldPos;
          this.dragStartCloudX = node.x;
          this.dragStartCloudY = node.y;
          this.dragStartCloudNodesState = stateManager.getState().cloudNodes;
        }
        this.renderCloudAll();
        return;
      }

      const containerEl = target.closest('[data-cloud-container-id]') as SVGElement | null;
      if (containerEl) {
        const containerId = containerEl.getAttribute('data-cloud-container-id')!;
        const container = stateManager.getState().cloudContainers.find(c => c.id === containerId);
        const selection: SelectableItem[] = [{ type: 'cloud-container', id: containerId }];
        stateManager.setState({ selection });
        eventBus.emit('selection:changed', selection);
        if (container && !container.locked) {
          this.draggedCloudContainerId = containerId;
          this.dragStartCloudWorldPos = worldPos;
          this.dragStartCloudX = container.x;
          this.dragStartCloudY = container.y;
          this.dragStartCloudContainersState = stateManager.getState().cloudContainers;
        }
        this.renderCloudAll();
        return;
      }

      const connEl = target.closest('[data-cloud-connector-id]') as SVGElement | null;
      if (connEl) {
        const connId = connEl.getAttribute('data-cloud-connector-id')!;
        const selection: SelectableItem[] = [{ type: 'cloud-connector', id: connId }];
        stateManager.setState({ selection });
        eventBus.emit('selection:changed', selection);
        this.renderCloudAll();
        return;
      }

      const hierarchyEl = target.closest('[data-cloud-hierarchy-id]') as SVGElement | null;
      if (hierarchyEl) {
        const hierarchyId = hierarchyEl.getAttribute('data-cloud-hierarchy-id')!;
        const hierarchy = stateManager.getState().cloudHierarchies.find(h => h.id === hierarchyId);
        const selection: SelectableItem[] = [{ type: 'cloud-hierarchy', id: hierarchyId }];
        stateManager.setState({ selection });
        eventBus.emit('selection:changed', selection);
        if (hierarchy && !hierarchy.locked) {
          this.draggedCloudHierarchyId = hierarchyId;
          this.dragStartCloudWorldPos = worldPos;
          this.dragStartCloudX = hierarchy.x;
          this.dragStartCloudY = hierarchy.y;
          this.dragStartCloudHierarchiesState = stateManager.getState().cloudHierarchies;
        }
        this.renderCloudAll();
        return;
      }

      // Background — deselect (actual panning is handled independently by CloudCanvasManager).
      if (stateManager.getState().selection.length > 0) {
        stateManager.setState({ selection: [] });
        eventBus.emit('selection:changed', []);
        this.renderCloudAll();
      }
    });

    svgEl.addEventListener('mousemove', (e: MouseEvent) => {
      const worldPos = this.cloudCanvas!.screenToWorld({ x: e.clientX, y: e.clientY });

      if (this.isDrawingCloudExportArea && this.cloudExportAreaEl) {
        const x = Math.min(worldPos.x, this.cloudExportAreaStart.x);
        const y = Math.min(worldPos.y, this.cloudExportAreaStart.y);
        const w = Math.abs(worldPos.x - this.cloudExportAreaStart.x);
        const h = Math.abs(worldPos.y - this.cloudExportAreaStart.y);
        this.cloudExportAreaEl.setAttribute('x', String(x));
        this.cloudExportAreaEl.setAttribute('y', String(y));
        this.cloudExportAreaEl.setAttribute('width', String(w));
        this.cloudExportAreaEl.setAttribute('height', String(h));
        return;
      }

      if (this.isDrawingCloudContainer) {
        this.renderCloudContainerDrawPreview(this.cloudContainerDrawStart, worldPos);
        return;
      }

      // Tool-agnostic: cloudConnectSourceId is set either by the "Connect" tool's first click
      // or by starting a drag from a node's connection handle (see the mousedown handler above)
      // — either way, a source is pending and the preview/hover-tracking below applies.
      if (this.cloudConnectSourceId) {
        const hoverEl = (e.target as Element).closest('[data-cloud-node-id]');
        const newHoverNodeId = hoverEl ? hoverEl.getAttribute('data-cloud-node-id') : null;
        const hoverHandleEl = (e.target as Element).closest('.cloud-node-connect-handle, .cloud-node-connect-handle-hit');
        this.cloudConnectHoverSide = hoverHandleEl ? (hoverHandleEl.getAttribute('data-handle-side') as CloudHandleSide) : undefined;
        // Only the (cheap) preview line needs to redraw every tick; the full node/connector
        // re-render (which is what makes the hovered node light up as a drop target — see
        // renderCloudAll()'s showHandles computation) only needs to run when the hovered node
        // actually changes, not on every pixel of mouse movement over the same node.
        if (newHoverNodeId !== this.cloudConnectHoverNodeId) {
          this.cloudConnectHoverNodeId = newHoverNodeId;
          this.renderCloudAll();
        }
        this.renderCloudConnectPreview(this.cloudConnectSourceId, worldPos);
        return;
      }

      if (this.draggedConnectorSegment) {
        const { connectorId, axis, kind } = this.draggedConnectorSegment;
        const value = axis === 'x' ? worldPos.x : worldPos.y;
        const field = SEGMENT_KIND_FIELD[kind];
        const cloudConnectors = stateManager.getState().cloudConnectors.map(c =>
          c.id === connectorId ? { ...c, [field]: value } : c
        );
        stateManager.setState({ cloudConnectors }, true);
        this.renderCloudAll();
        return;
      }

      if (this.draggedConnectorWaypoint) {
        const { connectorId, index } = this.draggedConnectorWaypoint;
        const cloudConnectors = stateManager.getState().cloudConnectors.map(c => {
          if (c.id !== connectorId || !c.waypoints) return c;
          const waypoints = c.waypoints.map((wp, i) => i === index ? worldPos : wp);
          return { ...c, waypoints };
        });
        stateManager.setState({ cloudConnectors }, true);
        this.renderCloudAll();
        return;
      }

      if (this.draggedConnectorEndpoint) {
        const { connectorId, end } = this.draggedConnectorEndpoint;
        const hoverEl = (e.target as Element).closest('[data-cloud-node-id]');
        this.cloudConnectHoverNodeId = hoverEl ? hoverEl.getAttribute('data-cloud-node-id') : null;
        const hoverHandleEl = (e.target as Element).closest('.cloud-node-connect-handle, .cloud-node-connect-handle-hit');
        this.cloudConnectHoverSide = hoverHandleEl ? (hoverHandleEl.getAttribute('data-handle-side') as CloudHandleSide) : undefined;

        const cloudConnectors = stateManager.getState().cloudConnectors.map(c => {
          if (c.id !== connectorId) return c;
          return end === 'source'
            ? { ...c, sourceNodeId: null, sourceSide: undefined, sourcePoint: worldPos }
            : { ...c, destNodeId: null, destSide: undefined, destPoint: worldPos };
        });
        stateManager.setState({ cloudConnectors }, true);
        this.renderCloudAll();
        return;
      }

      if (this.draggedCloudNodeId) {
        const dx = worldPos.x - this.dragStartCloudWorldPos.x;
        const dy = worldPos.y - this.dragStartCloudWorldPos.y;
        const nodeId = this.draggedCloudNodeId;
        if (this.isResizingCloudNode) {
          const width = Math.max(24, this.dragStartCloudWidth + dx);
          const height = Math.max(24, this.dragStartCloudHeight + dy);
          const cloudNodes = stateManager.getState().cloudNodes.map(n => n.id === nodeId ? { ...n, width, height } : n);
          stateManager.setState({ cloudNodes }, true);
        } else {
          const x = this.dragStartCloudX + dx;
          const y = this.dragStartCloudY + dy;
          const cloudNodes = stateManager.getState().cloudNodes.map(n => n.id === nodeId ? { ...n, x, y } : n);
          stateManager.setState({ cloudNodes }, true);
        }
        this.renderCloudAll();
        return;
      }

      if (this.draggedCloudContainerId) {
        const dx = worldPos.x - this.dragStartCloudWorldPos.x;
        const dy = worldPos.y - this.dragStartCloudWorldPos.y;
        const containerId = this.draggedCloudContainerId;
        if (this.isResizingCloudContainer) {
          const width = Math.max(40, this.dragStartCloudWidth + dx);
          const height = Math.max(40, this.dragStartCloudHeight + dy);
          const cloudContainers = stateManager.getState().cloudContainers.map(c => c.id === containerId ? { ...c, width, height } : c);
          stateManager.setState({ cloudContainers }, true);
        } else {
          const x = this.dragStartCloudX + dx;
          const y = this.dragStartCloudY + dy;
          const cloudContainers = stateManager.getState().cloudContainers.map(c => c.id === containerId ? { ...c, x, y } : c);
          stateManager.setState({ cloudContainers }, true);
        }
        this.renderCloudAll();
        return;
      }

      if (this.draggedCloudHierarchyId) {
        const dx = worldPos.x - this.dragStartCloudWorldPos.x;
        const dy = worldPos.y - this.dragStartCloudWorldPos.y;
        const hierarchyId = this.draggedCloudHierarchyId;
        if (this.isResizingCloudHierarchy) {
          // Grows the box itself (like CloudContainer) — icons/text stay their normal size, the
          // extra area is just more pill background. The renderer independently floors this at
          // the content's natural size (see getNaturalHierarchySize), so text is never clipped
          // even if a fast drag momentarily computes a width/height smaller than that.
          const width = Math.max(40, this.dragStartCloudWidth + dx);
          const height = Math.max(24, this.dragStartCloudHeight + dy);
          const cloudHierarchies = stateManager.getState().cloudHierarchies.map(h => h.id === hierarchyId ? { ...h, width, height } : h);
          stateManager.setState({ cloudHierarchies }, true);
        } else {
          const x = this.dragStartCloudX + dx;
          const y = this.dragStartCloudY + dy;
          const cloudHierarchies = stateManager.getState().cloudHierarchies.map(h => h.id === hierarchyId ? { ...h, x, y } : h);
          stateManager.setState({ cloudHierarchies }, true);
        }
        this.renderCloudAll();
        return;
      }

      // Idle hover (no drag/tool gesture in progress, handled by the branches above) — reveal a
      // node's connection handles just from resting the mouse over it, same as any other diagram
      // tool, rather than requiring a click-to-select first.
      const idleHoverEl = (e.target as Element).closest('[data-cloud-node-id]');
      const newIdleHoverId = idleHoverEl ? idleHoverEl.getAttribute('data-cloud-node-id') : null;
      if (newIdleHoverId !== this.hoveredCloudNodeId) {
        this.hoveredCloudNodeId = newIdleHoverId;
        this.renderCloudAll();
      }
    });

    window.addEventListener('mouseup', (e: MouseEvent) => {
      if (this.isDrawingCloudExportArea) {
        this.isDrawingCloudExportArea = false;
        this.cloudExportAreaEl?.remove();
        this.cloudExportAreaEl = null;

        const worldPos = this.cloudCanvas!.screenToWorld({ x: e.clientX, y: e.clientY });
        const selX = Math.min(worldPos.x, this.cloudExportAreaStart.x);
        const selY = Math.min(worldPos.y, this.cloudExportAreaStart.y);
        const selW = Math.abs(worldPos.x - this.cloudExportAreaStart.x);
        const selH = Math.abs(worldPos.y - this.cloudExportAreaStart.y);

        const screenDx = Math.abs(e.clientX - this.cloudExportAreaStartScreen.x);
        const screenDy = Math.abs(e.clientY - this.cloudExportAreaStartScreen.y);
        const draggedEnough = screenDx > 4 || screenDy > 4;

        eventBus.emit('tool:changed', 'select');
        if (draggedEnough) {
          eventBus.emit('export:cloud-area-selected', { x: selX, y: selY, width: selW, height: selH });
        }
        return;
      }
      if (this.isDrawingCloudContainer) {
        const worldPos = this.cloudCanvas!.screenToWorld({ x: e.clientX, y: e.clientY });
        this.finishCloudContainerDraw(worldPos);
        return;
      }
      // Connect tool, drag-release completion — a press-drag-release gesture in one motion
      // (as opposed to two separate clicks, which the mousedown handler above already handles)
      // used to silently do nothing: the source stayed pending and the preview line just froze
      // wherever the mouse let go. DRAG_THRESHOLD tells an intentional drag-onto-another-node
      // apart from "released right where it was pressed, waiting for a separate second click".
      if (this.cloudConnectSourceId && this.cloudConnectMouseDownScreen) {
        const DRAG_THRESHOLD = 6;
        const dx = e.clientX - this.cloudConnectMouseDownScreen.x;
        const dy = e.clientY - this.cloudConnectMouseDownScreen.y;
        if (Math.hypot(dx, dy) >= DRAG_THRESHOLD && this.cloudConnectHoverNodeId !== undefined) {
          const sourceId = this.cloudConnectSourceId;
          if (this.cloudConnectHoverNodeId !== null) {
            if (this.cloudConnectHoverNodeId !== sourceId) this.commitCloudConnector(sourceId, { nodeId: this.cloudConnectHoverNodeId });
          } else {
            const worldPos = this.cloudCanvas!.screenToWorld({ x: e.clientX, y: e.clientY });
            this.commitCloudConnector(sourceId, { point: worldPos });
          }
        }
        // A short release near the mousedown point is a genuine click — leave the source
        // pending so the existing click-then-click flow in the mousedown handler still works.
      }
      if (this.draggedCloudNodeId) {
        this.commitCloudNodeDrag();
      }
      if (this.draggedCloudContainerId) {
        this.commitCloudContainerDrag();
      }
      if (this.draggedCloudHierarchyId) {
        this.commitCloudHierarchyDrag();
      }
      if (this.draggedConnectorEndpoint) {
        this.commitConnectorEndpointDrag();
      }
      if (this.draggedConnectorSegment) {
        this.commitConnectorSegmentDrag();
      }
      if (this.draggedConnectorWaypoint) {
        this.commitConnectorWaypointDrag();
      }
    });
  }

  /** Finishes re-dragging a connector's source or dest tip: reattaches to whatever node was
   *  under the cursor at release (unless that's the connector's OTHER end, which would make a
   *  degenerate self-loop — dropped as a floating point instead), or keeps it as the floating
   *  point already tracked live during the drag. One undo entry for the whole drag. */
  private commitConnectorEndpointDrag(): void {
    const { connectorId, end } = this.draggedConnectorEndpoint!;
    this.draggedConnectorEndpoint = null;
    const hoverNodeId = this.cloudConnectHoverNodeId;
    const hoverSide = this.cloudConnectHoverSide;
    this.cloudConnectHoverNodeId = undefined;
    this.cloudConnectHoverSide = undefined;

    const liveConnector = stateManager.getState().cloudConnectors.find(c => c.id === connectorId);
    const snapshot = this.dragStartCloudConnectorsState;
    this.dragStartCloudConnectorsState = null;
    if (!liveConnector || !snapshot) return;

    // hoverNodeId stays 'undefined' (as opposed to null = "hovering empty canvas") only when no
    // mousemove fired between mousedown and mouseup at all — a plain click on the handle, not a
    // drag. Leave the connector completely untouched rather than "detaching" it to nothing.
    if (hoverNodeId === undefined) {
      stateManager.setState({ cloudConnectors: snapshot }, true);
      return;
    }

    const otherEndNodeId = end === 'source' ? liveConnector.destNodeId : liveConnector.sourceNodeId;
    stateManager.setState({ cloudConnectors: snapshot }, true);

    const validReattach = hoverNodeId !== null && hoverNodeId !== otherEndNodeId;
    const endData = end === 'source'
      ? (validReattach
          ? { sourceNodeId: hoverNodeId, sourceSide: hoverSide, sourcePoint: null }
          : { sourceNodeId: null, sourceSide: undefined, sourcePoint: liveConnector.sourcePoint })
      : (validReattach
          ? { destNodeId: hoverNodeId, destSide: hoverSide, destPoint: null }
          : { destNodeId: null, destSide: undefined, destPoint: liveConnector.destPoint });
    // Re-aiming an endpoint (new side, new node, or detaching to a floating point) changes the
    // route's topology — same reasoning as cloneCloudConnector() clearing these on a detached
    // copy: crossbarOffset/entryOffset/exitOffset/entryStubOffset/exitStubOffset are absolute
    // world coordinates tuned for the OLD endpoint/side combination. Left in place, they'd render
    // a path that visually ignores the new direction (still bending toward where the old side
    // used to be) — exactly the "changing the pointer direction doesn't align" symptom reported.
    const data = {
      ...endData,
      crossbarOffset: undefined, entryOffset: undefined, exitOffset: undefined,
      entryStubOffset: undefined, exitStubOffset: undefined,
    };
    eventBus.emit('cloudconnector:update', { id: connectorId, data });
  }

  /** Finishes dragging one of a connector's segment dots (entry/crossbar/exit): the live drag
   *  already wrote each intermediate offset as a transient update (see
   *  setupCloudCanvasInteractions()'s mousemove), so this just restores the pre-drag snapshot and
   *  re-applies the final value through the normal event path — collapsing the whole drag into
   *  one undo entry, same pattern as commitConnectorEndpointDrag(). */
  private commitConnectorSegmentDrag(): void {
    const { connectorId, kind } = this.draggedConnectorSegment!;
    this.draggedConnectorSegment = null;

    const liveConnector = stateManager.getState().cloudConnectors.find(c => c.id === connectorId);
    const snapshot = this.dragStartCloudConnectorsState;
    this.dragStartCloudConnectorsState = null;
    if (!liveConnector || !snapshot) return;

    const field = SEGMENT_KIND_FIELD[kind];
    stateManager.setState({ cloudConnectors: snapshot }, true);
    eventBus.emit('cloudconnector:update', { id: connectorId, data: { [field]: liveConnector[field] } });
  }

  /** Finishes dragging one waypoint of a connector's manual route — same undo-collapsing pattern
   *  as commitConnectorSegmentDrag(). */
  private commitConnectorWaypointDrag(): void {
    const { connectorId } = this.draggedConnectorWaypoint!;
    this.draggedConnectorWaypoint = null;

    const liveConnector = stateManager.getState().cloudConnectors.find(c => c.id === connectorId);
    const snapshot = this.dragStartCloudConnectorsState;
    this.dragStartCloudConnectorsState = null;
    if (!liveConnector || !snapshot) return;

    stateManager.setState({ cloudConnectors: snapshot }, true);
    eventBus.emit('cloudconnector:update', { id: connectorId, data: { waypoints: liveConnector.waypoints } });
  }

}
