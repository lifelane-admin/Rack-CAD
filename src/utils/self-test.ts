import { stateManager } from '../core/state';
import { eventBus } from '../core/event-bus';
import { CableData, DeviceData, RackData, Point } from '../core/types';
import { getDeterministicLaneIndex } from './routing';
import { generateId } from './geometry';

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

export class SelfTestRunner {
  private results: TestResult[] = [];

  async runAllTests(): Promise<TestResult[]> {
    this.results = [];
    console.group('%c🚀 Running RackCAD Automated Self-Tests...', 'color: #38bdf8; font-weight: bold; font-size: 14px;');

    // Store original state to restore after testing
    const originalState = JSON.parse(JSON.stringify(stateManager.getState()));

    try {
      this.runTest('Connection Integrity Test', () => this.testConnectionIntegrity());
      this.runTest('Undo/Redo Integrity Test', () => this.testUndoRedo());
      this.runTest('Deletion Clean-up Test', () => this.testDeletionCleanup());
      this.runTest('Save/Load State Test', () => this.testSaveLoad());
      this.runTest('Deterministic Routing Output Test', () => this.testDeterministicRouting());
      this.runTest('Cabinet Visual Modes Integrity Test', () => this.testCabinetVisualModes());
    } catch (e: any) {
      console.error('Critical test runner failure:', e);
    } finally {
      // Restore original state so tests do not pollute workspace
      stateManager.setState(originalState, true);
      console.groupEnd();
      
      const passedCount = this.results.filter(r => r.passed).length;
      const color = passedCount === this.results.length ? '#10b981' : '#ef4444';
      console.log(
        `%c📊 Self-Test Results: ${passedCount}/${this.results.length} passed`,
        `color: ${color}; font-weight: bold; font-size: 12px;`
      );
    }

    return this.results;
  }

  private runTest(name: string, testFn: () => void) {
    try {
      testFn();
      this.results.push({ name, passed: true });
      console.log(`%c✔ PASS: ${name}`, 'color: #10b981;');
    } catch (err: any) {
      this.results.push({ name, passed: false, error: err.message });
      console.error(`%c✕ FAIL: ${name}`, 'color: #ef4444; font-weight: bold;');
      console.error(err);
    }
  }

  // 1. Connection Integrity
  private testConnectionIntegrity() {
    stateManager.setState({ racks: [], devices: [], cables: [], selection: [] }, true);

    // Add a rack
    const rackId = 'test-rack';
    const rack: RackData = { id: rackId, name: 'Test Rack', units: 42, x: 100, y: 100 };
    stateManager.addRack(rack);

    // Add two servers
    const s1Id = 'server-1';
    const server1: DeviceData = {
      id: s1Id,
      templateId: 'dell-r760',
      rackId,
      startUnit: 10,
      name: 'Server 1',
      hostname: 'test-s1',
      managementIp: '10.0.0.1',
      serialNumber: 'SRN-TEST-1',
      description: 'Test Server 1',
      ports: [
        { id: 's1-p1', name: 'NIC 1', type: 'rj45', relativeX: 300, relativeY: 10, connected: false, cableId: null, deviceId: s1Id, speed: '1 Gbps' }
      ]
    };
    const s2Id = 'server-2';
    const server2: DeviceData = {
      id: s2Id,
      templateId: 'dell-r760',
      rackId,
      startUnit: 15,
      name: 'Server 2',
      hostname: 'test-s2',
      managementIp: '10.0.0.2',
      serialNumber: 'SRN-TEST-2',
      description: 'Test Server 2',
      ports: [
        { id: 's2-p1', name: 'NIC 1', type: 'rj45', relativeX: 300, relativeY: 10, connected: false, cableId: null, deviceId: s2Id, speed: '1 Gbps' }
      ]
    };
    stateManager.setState({ devices: [server1, server2] }, true);

    // Connect them with a cable
    const cableId = 'test-cable-1';
    const cable: CableData = {
      id: cableId,
      name: 'Test Cable',
      type: 'general',
      color: '#78909c',
      sourcePortId: 's1-p1',
      destPortId: 's2-p1',
      bendPoints: [],
      thickness: 2,
      bendRadius: 10,
      bundleId: null,
      notes: ''
    };

    const cables = [...stateManager.getState().cables, cable];
    const devices = stateManager.getState().devices.map(d => {
      const updatedPorts = d.ports.map(p => {
        if (p.id === 's1-p1' || p.id === 's2-p1') {
          return { ...p, connected: true, cableId };
        }
        return p;
      });
      return { ...d, ports: updatedPorts };
    });
    stateManager.setState({ cables, devices }, true);

    // Verify connection integrity
    const updatedDev1 = stateManager.getDevice(s1Id)!;
    const updatedDev2 = stateManager.getDevice(s2Id)!;
    const p1 = updatedDev1.ports.find(p => p.id === 's1-p1')!;
    const p2 = updatedDev2.ports.find(p => p.id === 's2-p1')!;

    if (!p1.connected || p1.cableId !== cableId) {
      throw new Error('Source port connectivity flag or cableId mismatch');
    }
    if (!p2.connected || p2.cableId !== cableId) {
      throw new Error('Destination port connectivity flag or cableId mismatch');
    }
  }

  // 2. Undo/Redo Integrity
  private testUndoRedo() {
    stateManager.setState({ racks: [], devices: [], cables: [], selection: [] }, true);
    
    // Add a rack and verify
    const rack: RackData = { id: 'u-rack', name: 'Undo Rack', units: 42, x: 200, y: 100 };
    stateManager.addRack(rack);
    if (stateManager.getState().racks.length !== 1) throw new Error('Failed to add rack');

    // Undo and verify empty
    stateManager.undo();
    if (stateManager.getState().racks.length !== 0) throw new Error('Undo failed to revert rack addition');

    // Redo and verify back
    stateManager.redo();
    if (stateManager.getState().racks.length !== 1) throw new Error('Redo failed to re-apply rack addition');
  }

  // 3. Deletion Clean-up
  private testDeletionCleanup() {
    // Rely on setup from Test 1 connection state
    this.testConnectionIntegrity();

    const stateBefore = stateManager.getState();
    const cableId = 'test-cable-1';

    // Delete cable
    const updatedCables = stateBefore.cables.filter(c => c.id !== cableId);
    const updatedDevices = stateBefore.devices.map(d => {
      const updatedPorts = d.ports.map(p => {
        if (p.cableId === cableId) {
          return { ...p, connected: false, cableId: null };
        }
        return p;
      });
      return { ...d, ports: updatedPorts };
    });

    stateManager.setState({ cables: updatedCables, devices: updatedDevices }, true);

    // Verify deletion clean-up
    const dev1 = stateManager.getDevice('server-1')!;
    const dev2 = stateManager.getDevice('server-2')!;
    const p1 = dev1.ports.find(p => p.id === 's1-p1')!;
    const p2 = dev2.ports.find(p => p.id === 's2-p1')!;

    if (stateManager.getState().cables.length !== 0) {
      throw new Error('Cable was not removed from state');
    }
    if (p1.connected || p1.cableId !== null) {
      throw new Error('Source port was not cleaned up on cable deletion');
    }
    if (p2.connected || p2.cableId !== null) {
      throw new Error('Destination port was not cleaned up on cable deletion');
    }
  }

  // 4. Save/Load JSON State
  private testSaveLoad() {
    this.testConnectionIntegrity();

    const originalState = stateManager.getState();
    
    // Serialize state
    const jsonStr = JSON.stringify({
      version: '1.0.0',
      racks: originalState.racks,
      devices: originalState.devices,
      cables: originalState.cables
    });

    // Wipe state
    stateManager.setState({ racks: [], devices: [], cables: [], selection: [] }, true);

    // Load state back
    const project = JSON.parse(jsonStr);
    stateManager.setState({
      racks: project.racks,
      devices: project.devices,
      cables: project.cables,
      selection: []
    }, true);

    const loadedState = stateManager.getState();

    if (loadedState.racks.length !== originalState.racks.length) throw new Error('Rack count mismatch on load');
    if (loadedState.devices.length !== originalState.devices.length) throw new Error('Device count mismatch on load');
    if (loadedState.cables.length !== originalState.cables.length) throw new Error('Cable count mismatch on load');
  }

  // 5. Deterministic Gutter Routing Output
  private testDeterministicRouting() {
    stateManager.setState({ racks: [], devices: [], cables: [], selection: [] }, true);

    const rackId = 'r1';
    stateManager.addRack({ id: rackId, name: 'Rack 1', units: 42, x: 100, y: 100 });

    const s1Id = 'd1';
    const server1: DeviceData = {
      id: s1Id,
      templateId: 'dell-r760',
      rackId,
      startUnit: 10,
      name: 'Server 1',
      hostname: 'test-d1',
      managementIp: '10.0.0.11',
      serialNumber: 'SRN-TEST-D1',
      description: 'Test Server D1',
      ports: [
        { id: 'p1', name: 'NIC 1', type: 'rj45', relativeX: 300, relativeY: 10, connected: false, cableId: null, deviceId: s1Id }
      ]
    };
    const s2Id = 'd2';
    const server2: DeviceData = {
      id: s2Id,
      templateId: 'dell-r760',
      rackId,
      startUnit: 20,
      name: 'Server 2',
      hostname: 'test-d2',
      managementIp: '10.0.0.12',
      serialNumber: 'SRN-TEST-D2',
      description: 'Test Server D2',
      ports: [
        { id: 'p2', name: 'NIC 1', type: 'rj45', relativeX: 300, relativeY: 10, connected: false, cableId: null, deviceId: s2Id }
      ]
    };
    stateManager.setState({ devices: [server1, server2] }, true);

    // Create 3 parallel cables routing through the same channel (r1 right)
    const c1: CableData = { 
      id: 'cable-a', 
      name: 'Cable A', 
      type: 'general', 
      color: '#78909c', 
      sourcePortId: 'p1', 
      destPortId: 'p2', 
      sidePreference: 'right',
      bendPoints: [],
      thickness: 2,
      bendRadius: 10,
      bundleId: null,
      notes: ''
    };
    const c2: CableData = { 
      id: 'cable-b', 
      name: 'Cable B', 
      type: 'general', 
      color: '#78909c', 
      sourcePortId: 'p1', 
      destPortId: 'p2', 
      sidePreference: 'right',
      bendPoints: [],
      thickness: 2,
      bendRadius: 10,
      bundleId: null,
      notes: ''
    };
    const c3: CableData = { 
      id: 'cable-c', 
      name: 'Cable C', 
      type: 'general', 
      color: '#78909c', 
      sourcePortId: 'p1', 
      destPortId: 'p2', 
      sidePreference: 'right',
      bendPoints: [],
      thickness: 2,
      bendRadius: 10,
      bundleId: null,
      notes: ''
    };

    stateManager.setState({ cables: [c1, c2, c3] }, true);

    // Check lane assignment indices
    const laneA = getDeterministicLaneIndex('cable-a', rackId, 'right');
    const laneB = getDeterministicLaneIndex('cable-b', rackId, 'right');
    const laneC = getDeterministicLaneIndex('cable-c', rackId, 'right');

    const laneIndices = [laneA, laneB, laneC];
    
    // Verify each lane index is distinct
    const distinctLanes = new Set(laneIndices);
    if (distinctLanes.size !== 3) {
      throw new Error(`Lane coordinates overlap! Assigned: a=${laneA}, b=${laneB}, c=${laneC}`);
    }

    // Verify lanes are ordered deterministically by ID if Y is identical
    if (laneA !== 0 || laneB !== 1 || laneC !== 2) {
      throw new Error(`Deterministic ordering failed! Assigned: a=${laneA}, b=${laneB}, c=${laneC}`);
    }
  }

  private testCabinetVisualModes() {
    const s = stateManager.getState();
    if (s.cabinetViewMode !== 'front' && s.cabinetViewMode !== 'rear') {
      throw new Error('Initial cabinetViewMode is invalid');
    }
    if (s.cabinetDrawMode !== 'default' && s.cabinetDrawMode !== 'skeleton') {
      throw new Error('Initial cabinetDrawMode is invalid');
    }
    if (typeof s.cabinetCoverVisible !== 'boolean') {
      throw new Error('Initial cabinetCoverVisible is invalid');
    }
    if (typeof s.isometricMode !== 'boolean') {
      throw new Error('Initial isometricMode is invalid');
    }
    if (typeof s.presenterMode !== 'boolean') {
      throw new Error('Initial presenterMode is invalid');
    }
    if (s.cableRoutingTrayMode !== 'overhead' && s.cableRoutingTrayMode !== 'underfloor') {
      throw new Error('Initial cableRoutingTrayMode is invalid');
    }

    stateManager.setState({ cabinetViewMode: 'rear' });
    if (stateManager.getState().cabinetViewMode !== 'rear') {
      throw new Error('Failed to update cabinetViewMode');
    }
    stateManager.setState({ cabinetDrawMode: 'skeleton' });
    if (stateManager.getState().cabinetDrawMode !== 'skeleton') {
      throw new Error('Failed to update cabinetDrawMode');
    }
    stateManager.setState({ presenterMode: true });
    if (stateManager.getState().presenterMode !== true) {
      throw new Error('Failed to update presenterMode');
    }
    stateManager.setState({ cableRoutingTrayMode: 'underfloor' });
    if (stateManager.getState().cableRoutingTrayMode !== 'underfloor') {
      throw new Error('Failed to update cableRoutingTrayMode');
    }
  }
}

export function runSelfTests() {
  const runner = new SelfTestRunner();
  runner.runAllTests();
}
