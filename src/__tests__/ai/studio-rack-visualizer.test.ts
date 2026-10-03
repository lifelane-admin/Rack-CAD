import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { StudioRackVisualizer } from '../../ai/studio/studio-rack-visualizer';
import { AIWorkflowOrchestrator } from '../../ai/workflow/workflow-orchestrator';

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  class MockWebGLRenderer {
    domElement = document.createElement('canvas');
    setPixelRatio = vi.fn();
    setSize = vi.fn();
    render = vi.fn();
    dispose = vi.fn();
  }
  return {
    ...actual,
    WebGLRenderer: MockWebGLRenderer,
  };
});

describe('StudioRackVisualizer', () => {
  let container: HTMLElement;
  let orchestrator: AIWorkflowOrchestrator;
  let visualizer: StudioRackVisualizer;

  beforeEach(() => {
    const mockGradient = {
      addColorStop: vi.fn(),
    };
    const mockCtx: any = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textAlign: '',
      textBaseline: '',
      measureText: vi.fn().mockReturnValue({ width: 50 }),
      createLinearGradient: vi.fn().mockReturnValue(mockGradient),
      createRadialGradient: vi.fn().mockReturnValue(mockGradient),
    };
    const proxyCtx = new Proxy(mockCtx, {
      get(target, prop) {
        if (prop in target) return target[prop];
        if (typeof prop === 'string') {
          target[prop] = vi.fn();
          return target[prop];
        }
        return undefined;
      },
    });
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(proxyCtx) as any;

    container = document.createElement('div');
    document.body.appendChild(container);
    orchestrator = new AIWorkflowOrchestrator();
    visualizer = new StudioRackVisualizer();
    visualizer.mount(container);
  });

  afterEach(() => {
    visualizer.destroy();
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
    vi.restoreAllMocks();
  });

  it('renders blank chassis SVG when in blank state (stage 00 / 01)', () => {
    visualizer.render(orchestrator, '2d');

    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();

    // In blank state, an empty chassis tag is rendered and no devices are inserted
    const blankTag = container.querySelector('.studio-blank-rack-tag');
    expect(blankTag).not.toBeNull();
    expect(blankTag?.textContent).toContain('EMPTY 42U CHASSIS');

    const devices = container.querySelectorAll('.device');
    expect(devices.length).toBe(0);
  });

  it('renders populated devices in 2D elevation when not blank', () => {
    // Advance to BOM_SELECTION or PHYSICAL_DESIGN
    orchestrator.getState().currentStage = 'PHYSICAL_DESIGN';
    visualizer.render(orchestrator, '2d');

    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();

    const blankTag = container.querySelector('.studio-blank-rack-tag');
    expect(blankTag).toBeNull();

    // Check that placement items were rendered as SVG device groups
    const devices = container.querySelectorAll('.device');
    expect(devices.length).toBeGreaterThan(0);
  });

  it('renders topology view for blank vs populated state', () => {
    // Blank state
    visualizer.render(orchestrator, 'topology');
    expect(container.textContent).toContain('Network Topology Awaiting Specification');

    // Populated state
    orchestrator.getState().currentStage = 'PHYSICAL_DESIGN';
    visualizer.render(orchestrator, 'topology');
    expect(container.textContent).toContain('SPINE / LEAF NETWORK TOPOLOGY');
    expect(container.textContent).toContain('MLAG');
    expect(container.textContent).toContain('ToR-A: 25GbE Switch');
  });

  it('renders cable run view for blank vs populated state', () => {
    // Blank state
    visualizer.render(orchestrator, 'cables');
    expect(container.textContent).toContain('Cable Runs Awaiting Allocation');

    // Populated state
    orchestrator.getState().currentStage = 'PHYSICAL_DESIGN';
    visualizer.render(orchestrator, 'cables');
    expect(container.textContent).toContain('PHYSICAL CABLE RUN HARNESS');
    expect(container.textContent).toContain('ToR-A Port 1');
  });

  it('renders power schematic view with dual A/B feeds', () => {
    // Blank state
    visualizer.render(orchestrator, 'power');
    expect(container.textContent).toContain('Electrical Feeds Awaiting Allocation');

    // Populated state
    orchestrator.getState().currentStage = 'PHYSICAL_DESIGN';
    visualizer.render(orchestrator, 'power');
    expect(container.textContent).toContain('FEED A (PDU-A)');
    expect(container.textContent).toContain('FEED B (PDU-B)');
    expect(container.textContent).toContain('ELECTRICAL INFRASTRUCTURE');
  });

  it('renders 0U Vertical Side-Mount PDUs and Vertical Cable Managers in 2D elevation', () => {
    orchestrator.getState().currentStage = 'PHYSICAL_DESIGN';
    orchestrator.updateCabinetConfig({
      leftCableManagerWidth: '4-inch',
      rightCableManagerWidth: '4-inch',
      leftPduTemplateId: 'vpdu-apc-ap8858',
      rightPduTemplateId: 'vpdu-apc-ap8858',
    });

    visualizer.render(orchestrator, '2d');

    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();

    // Verify dynamic viewBox accounts for side-mounted assets
    const viewBox = svg?.getAttribute('viewBox');
    expect(viewBox).toBeDefined();
    const parts = viewBox?.split(' ').map(Number);
    expect(parts?.[0]).toBeLessThan(0); // minX is negative to frame left VCM & PDU
    expect(parts?.[2]).toBeGreaterThan(450); // totalW exceeds 450 to frame right VCM & PDU

    // Verify 0U Side-Mount PDUs are rendered
    const leftPdu = container.querySelector('[data-pdu-side="left"]');
    expect(leftPdu).not.toBeNull();

    const rightPdu = container.querySelector('[data-pdu-side="right"]');
    expect(rightPdu).not.toBeNull();

    // Verify Left and Right Vertical Cable Managers are rendered
    const leftVcm = container.querySelector('[data-side="left"].cable-manager-vertical');
    expect(leftVcm).not.toBeNull();

    const rightVcm = container.querySelector('[data-side="right"].cable-manager-vertical');
    expect(rightVcm).not.toBeNull();
  });

  it('renders 3D camera controls and door control toolbar with Open, Closed, and Disable/Enable options', () => {
    orchestrator.getState().currentStage = 'PHYSICAL_DESIGN';
    visualizer.render(orchestrator, '3d');

    // Camera preset buttons
    const camControls = container.querySelector('.studio-3d-cam-controls');
    expect(camControls).not.toBeNull();
    const camButtons = camControls?.querySelectorAll('.btn-3d-cam');
    expect(camButtons?.length).toBe(5);

    // Door controls panel
    const doorControls = container.querySelector('.studio-3d-door-controls');
    expect(doorControls).not.toBeNull();

    // Default state: closed
    expect(visualizer.getFrontDoorState()).toBe('closed');
    const badge = doorControls?.querySelector('.studio-door-badge-front');
    expect(badge?.textContent).toBe('CLOSED');

    const openBtn = doorControls?.querySelector<HTMLButtonElement>('.front-door-group [data-state="open"]');
    const closedBtn = doorControls?.querySelector<HTMLButtonElement>('.front-door-group [data-state="closed"]');
    const toggleBtn = doorControls?.querySelector<HTMLButtonElement>('.btn-door-toggle');

    expect(openBtn).not.toBeNull();
    expect(closedBtn).not.toBeNull();
    expect(toggleBtn).not.toBeNull();
    expect(closedBtn?.classList.contains('active')).toBe(true);

    // Test Open button interaction
    openBtn?.click();
    expect(visualizer.getFrontDoorState()).toBe('open');
    expect(badge?.textContent).toBe('OPEN');
    expect(openBtn?.classList.contains('active')).toBe(true);
    expect(closedBtn?.classList.contains('active')).toBe(false);

    // Test Disable Door interaction
    toggleBtn?.click();
    expect(visualizer.getFrontDoorState()).toBe('removed');
    expect(badge?.textContent).toBe('DISABLED');
    expect(toggleBtn?.textContent).toContain('Enable');

    // Test Re-enable Door interaction
    toggleBtn?.click();
    expect(visualizer.getFrontDoorState()).toBe('closed');
    expect(badge?.textContent).toBe('CLOSED');
    expect(toggleBtn?.textContent).toContain('Disable');
  });

  it('preserves door state across successive 3D renders and rebuilds', () => {
    orchestrator.getState().currentStage = 'PHYSICAL_DESIGN';
    visualizer.render(orchestrator, '3d');

    // User opens door
    visualizer.setFrontDoorState('open');
    expect(visualizer.getFrontDoorState()).toBe('open');

    // Subsequent re-render
    visualizer.render(orchestrator, '3d');
    expect(visualizer.getFrontDoorState()).toBe('open');

    const badge = container.querySelector('.studio-door-badge-front');
    expect(badge?.textContent).toBe('OPEN');

    // User disables door
    visualizer.setFrontDoorState('removed');
    expect(visualizer.getFrontDoorState()).toBe('removed');

    // Subsequent re-render
    visualizer.render(orchestrator, '3d');
    expect(visualizer.getFrontDoorState()).toBe('removed');
    expect(container.querySelector('.studio-door-badge-front')?.textContent).toBe('DISABLED');
  });

  describe('2D Pan and Zoom controls', () => {
    it('renders 2D zoom toolbar with Zoom In, Zoom Out, 100% Badge, and Fit buttons in 2D view', () => {
      visualizer.render(orchestrator, '2d');

      const zoomControls = container.querySelector('.studio-2d-zoom-controls');
      expect(zoomControls).not.toBeNull();

      const zoomInBtn = zoomControls?.querySelector<HTMLButtonElement>('[data-action="zoom-in"]');
      const zoomOutBtn = zoomControls?.querySelector<HTMLButtonElement>('[data-action="zoom-out"]');
      const zoomResetBtn = zoomControls?.querySelector<HTMLButtonElement>('[data-action="zoom-reset"]');
      const zoomFitBtn = zoomControls?.querySelector<HTMLButtonElement>('[data-action="zoom-fit"]');
      const badge = zoomControls?.querySelector('.studio-2d-zoom-badge');

      expect(zoomInBtn).not.toBeNull();
      expect(zoomOutBtn).not.toBeNull();
      expect(zoomResetBtn).not.toBeNull();
      expect(zoomFitBtn).not.toBeNull();
      expect(badge?.textContent).toBe('100%');
    });

    it('interactively zooms in and out via zoomIn2D() and zoomOut2D()', () => {
      visualizer.render(orchestrator, '2d');

      expect(visualizer.getZoom2D()).toBe(1.0);

      visualizer.zoomIn2D();
      expect(visualizer.getZoom2D()).toBeGreaterThan(1.0);
      const badge = container.querySelector('.studio-2d-zoom-badge');
      expect(badge?.textContent).toBe(`${Math.round(visualizer.getZoom2D() * 100)}%`);

      visualizer.zoomOut2D();
      visualizer.zoomOut2D();
      expect(visualizer.getZoom2D()).toBeLessThan(1.0);
      expect(badge?.textContent).toBe(`${Math.round(visualizer.getZoom2D() * 100)}%`);

      visualizer.resetZoom2D();
      expect(visualizer.getZoom2D()).toBe(1.0);
      expect(badge?.textContent).toBe('100%');
    });

    it('handles button clicks on floating zoom controls', () => {
      visualizer.render(orchestrator, '2d');

      const zoomInBtn = container.querySelector<HTMLButtonElement>('[data-action="zoom-in"]');
      const zoomOutBtn = container.querySelector<HTMLButtonElement>('[data-action="zoom-out"]');
      const zoomFitBtn = container.querySelector<HTMLButtonElement>('[data-action="zoom-fit"]');

      zoomInBtn?.click();
      expect(visualizer.getZoom2D()).toBeGreaterThan(1.0);

      zoomOutBtn?.click();
      zoomOutBtn?.click();
      expect(visualizer.getZoom2D()).toBeLessThan(1.0);

      zoomFitBtn?.click();
      expect(visualizer.getZoom2D()).toBe(1.0);
    });

    it('updates SVG viewBox coordinates proportionally when zooming', () => {
      visualizer.render(orchestrator, '2d');
      const svg = container.querySelector('svg');
      const initialViewBox = svg?.getAttribute('viewBox');

      visualizer.zoomIn2D();
      const zoomedViewBox = svg?.getAttribute('viewBox');

      expect(zoomedViewBox).toBeDefined();
      expect(zoomedViewBox).not.toBe(initialViewBox);

      // Width and height of viewBox should decrease when zoomed in (magnifying the view)
      const initW = Number(initialViewBox?.split(' ')[2]);
      const zoomedW = Number(zoomedViewBox?.split(' ')[2]);
      expect(zoomedW).toBeLessThan(initW);
    });

    it('responds to global EventBus view:zoom-in, view:zoom-out, and view:zoom-fit events', async () => {
      const { eventBus } = await import('../../core/event-bus');
      visualizer.render(orchestrator, '2d');

      expect(visualizer.getZoom2D()).toBe(1.0);

      eventBus.emit('view:zoom-in', undefined as any);
      expect(visualizer.getZoom2D()).toBeGreaterThan(1.0);

      eventBus.emit('view:zoom-out', undefined as any);
      eventBus.emit('view:zoom-out', undefined as any);
      expect(visualizer.getZoom2D()).toBeLessThan(1.0);

      eventBus.emit('view:zoom-fit', undefined as any);
      expect(visualizer.getZoom2D()).toBe(1.0);
    });
  });
});

