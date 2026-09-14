import { describe, it, expect, beforeEach } from 'vitest';
import EventBus from '../core/event-bus';
import State from '../core/state';
import { DcFloatingToolbar } from '../components/dc-floating-toolbar';
import { FloatingToolbar } from '../components/floating-toolbar';
import { dcState } from '../datacenter/dc-state';

function mountTestDOM(): void {
  document.body.innerHTML = `
    <div id="app">
      <div id="canvas-viewport">
        <svg id="canvas"></svg>
      </div>
      <div id="cloud-viewport" class="hidden"></div>
      <div id="dc-viewport" class="hidden"></div>
    </div>
  `;
}

describe('DcFloatingToolbar & View Swapping', () => {
  beforeEach(() => {
    EventBus.clear();
    mountTestDOM();
    State.setState({
      activeView: 'datacenter',
      floatingToolbarVisible: true,
      racks: [],
      devices: [],
      cables: [],
      selection: [],
    });
  });

  it('mounts properly inside #dc-viewport with row 1 and row 2', () => {
    new DcFloatingToolbar();
    const toolbar = document.querySelector('#dc-viewport #dc-floating-toolbar');
    expect(toolbar).not.toBeNull();
    expect(toolbar?.querySelector('#dc-ft-row-1')).not.toBeNull();
    expect(toolbar?.querySelector('#dc-ft-row-2')).not.toBeNull();
  });

  it('renders swap button in Datacenter toolbar and clicking it switches view to rack', () => {
    new DcFloatingToolbar();
    const swapBtn = document.querySelector('#dc-ft-swap-view') as HTMLButtonElement;
    expect(swapBtn).not.toBeNull();

    let switchedView = '';
    EventBus.on('view:switch', (view: any) => {
      switchedView = view;
    });

    swapBtn.click();
    expect(switchedView).toBe('rack');
  });

  it('renders swap button in Rack FloatingToolbar and clicking it switches view to datacenter', () => {
    State.setState({ workflowMode: 'datacenter' });
    new FloatingToolbar();
    const swapBtn = document.querySelector('#ft-swap-datacenter') as HTMLButtonElement;
    expect(swapBtn).not.toBeNull();

    let switchedView = '';
    EventBus.on('view:switch', (view: any) => {
      switchedView = view;
    });

    swapBtn.click();
    expect(switchedView).toBe('datacenter');
  });

  it('renders primary tools (Select, Move, 2D/3D, X-Ray, Grid, Snap, Fit) in Datacenter toolbar', () => {
    new DcFloatingToolbar();
    const toolbar = document.querySelector('#dc-floating-toolbar');
    expect(toolbar?.querySelector('#dc-ft-tool-select')).not.toBeNull();
    expect(toolbar?.querySelector('#dc-ft-tool-pan')).not.toBeNull();
    expect(toolbar?.querySelector('#dc-ft-toggle-viewmode')).not.toBeNull();
    expect(toolbar?.querySelector('#dc-ft-toggle-xray')).not.toBeNull();
    expect(toolbar?.querySelector('#dc-ft-toggle-grid')).not.toBeNull();
    expect(toolbar?.querySelector('#dc-ft-toggle-snap')).not.toBeNull();
    expect(toolbar?.querySelector('#dc-ft-fit')).not.toBeNull();
  });

  it('renders contextual rack actions when a rack is selected in datacenter state', () => {
    const floor = dcState.createFloor('Main Hall', 20, 15, 600);
    const rack: any = {
      id: 'RACK-001',
      name: 'RACK-001',
      widthMm: 600,
      depthMm: 1200,
      heightU: 42,
      type: 'server',
      position: { x: 1.2, y: 1.2, z: 0 },
      rotation: 0,
    };
    dcState.addRack(rack);
    dcState.setState({ activeFloorId: floor.id, selectedRackId: rack.id });

    new DcFloatingToolbar();
    const workRackBtn = document.querySelector('#dc-ft-work-rack') as HTMLButtonElement;
    const rotateRackBtn = document.querySelector('#dc-ft-rack-rotate') as HTMLButtonElement;
    const duplicateRackBtn = document.querySelector('#dc-ft-rack-duplicate') as HTMLButtonElement;

    expect(workRackBtn).not.toBeNull();
    expect(rotateRackBtn).not.toBeNull();
    expect(duplicateRackBtn).not.toBeNull();
  });
});
