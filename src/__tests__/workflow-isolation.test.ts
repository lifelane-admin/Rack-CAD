import { describe, it, expect, beforeEach } from 'vitest';
import stateManager from '../core/state';
import { Sidebar } from '../components/sidebar';
import { DcRack } from '../datacenter/types';
import eventBus from '../core/event-bus';

describe('Workflow Isolation & Datacenter "Work on this Rack" Protocol', () => {
  let sidebarContainer: HTMLElement;
  let sidebar: Sidebar;

  beforeEach(() => {
    document.body.innerHTML = '<div id="sidebar"></div><div id="canvas-viewport"></div>';
    sidebarContainer = document.getElementById('sidebar')!;
    sidebar = new Sidebar(sidebarContainer);
  });

  it('isolates Datacenter tab from sidebar when in standalone Rack Builder mode', () => {
    stateManager.setState({ workflowMode: 'rack', activeView: 'rack', activeElevationRackId: null });
    sidebar.render();

    const tabs = Array.from(sidebarContainer.querySelectorAll('.sb-tab')).map(el => el.textContent?.trim());
    expect(tabs).toContain('Rack');
    expect(tabs).toContain('Cloud');
    expect(tabs).toContain('Hybrid');
    expect(tabs).not.toContain('Datacenter');
  });

  it('shows Datacenter tab when in Datacenter workflow mode', () => {
    stateManager.setState({ workflowMode: 'datacenter', activeView: 'datacenter', activeElevationRackId: null });
    sidebar.render();

    const tabs = Array.from(sidebarContainer.querySelectorAll('.sb-tab')).map(el => el.textContent?.trim());
    expect(tabs).toContain('Datacenter');
  });

  it('carries exact rack config and model from Datacenter rack into Rack Builder state', () => {
    const mockDcRack: DcRack = {
      id: 'RACK-042',
      name: 'Server Pod A-01',
      type: 'server',
      widthMm: 600,
      depthMm: 1000,
      heightU: 48,
      manufacturer: 'APC Schneider',
      model: 'AR3300',
      doorStyle: 'split-perforated',
      mounting: 'floor',
      color: '#111827',
      position: { x: 2.4, y: 3.6, z: 0 },
      rotation: 90,
      leftCableManagerWidth: '4-inch',
      rightCableManagerWidth: '6-inch',
      leftPduId: 'pdu-l',
      rightPduId: 'pdu-r',
    };

    // Simulate work on rack
    const targetRack = {
      id: mockDcRack.id,
      name: mockDcRack.name,
      units: mockDcRack.heightU,
      depthMm: mockDcRack.depthMm,
      rackWidth: (mockDcRack.widthMm === 800 ? '23-inch' : '19-inch') as any,
      rackType: 'server' as any,
      frontDoor: mockDcRack.doorStyle as any,
      mounting: 'floor' as any,
      rackColor: mockDcRack.color,
      x: 200,
      y: 40,
      leftCableManagerWidth: mockDcRack.leftCableManagerWidth,
      rightCableManagerWidth: mockDcRack.rightCableManagerWidth,
      leftPduId: mockDcRack.leftPduId,
      rightPduId: mockDcRack.rightPduId,
    };

    stateManager.setState({
      racks: [targetRack],
      selection: [{ type: 'rack', id: mockDcRack.id }],
      activeElevationRackId: mockDcRack.id,
      workflowMode: 'datacenter',
      activeView: 'rack',
    });

    const activeRack = stateManager.getRack('RACK-042');
    expect(activeRack).toBeDefined();
    expect(activeRack?.name).toBe('Server Pod A-01');
    expect(activeRack?.units).toBe(48);
    expect(activeRack?.depthMm).toBe(1000);
    expect(activeRack?.rackWidth).toBe('19-inch');
    expect(activeRack?.frontDoor).toBe('split-perforated');
    expect(activeRack?.rackColor).toBe('#111827');
    expect(activeRack?.leftCableManagerWidth).toBe('4-inch');
    expect(activeRack?.rightCableManagerWidth).toBe('6-inch');
    expect(activeRack?.leftPduId).toBe('pdu-l');
    expect(activeRack?.rightPduId).toBe('pdu-r');

    // Sidebar when editing elevation of datacenter rack retains access to Datacenter
    sidebar.render();
    const tabs = Array.from(sidebarContainer.querySelectorAll('.sb-tab')).map(el => el.textContent?.trim());
    expect(tabs).toContain('Datacenter');
  });
});
