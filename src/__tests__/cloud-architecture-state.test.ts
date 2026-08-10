import { describe, it, expect, beforeEach } from 'vitest';
import { stateManager } from '../core/state';
import { exportJSON, importJSON } from '../utils/export';
import type { CloudNode, CloudContainer, CloudConnector } from '../core/types';

const node: CloudNode = {
  id: 'n1', iconId: 'aws-amazon-ec2', provider: 'aws',
  x: 10, y: 10, width: 64, height: 64, label: 'Amazon EC2',
};
const container: CloudContainer = {
  id: 'c1', kind: 'vpc', x: 0, y: 0, width: 300, height: 200, label: 'VPC',
};
const connector: CloudConnector = {
  id: 'conn1', sourceNodeId: 'n1', destNodeId: null, destPoint: { x: 200, y: 200 },
};

describe('Cloud Architecture state', () => {
  beforeEach(() => {
    stateManager.setState({
      racks: [], devices: [], cables: [], bundles: [], textLabels: [], imageAssets: [],
      cloudNodes: [], cloudContainers: [], cloudConnectors: [], selection: [],
      activeView: 'rack',
    });
  });

  it('defaults activeView to rack with empty cloud arrays', () => {
    const fresh = stateManager.getState();
    expect(fresh.activeView).toBe('rack');
    expect(fresh.cloudNodes).toEqual([]);
  });

  it('addCloudNode/addCloudContainer/addCloudConnector append to state', () => {
    stateManager.addCloudNode(node);
    stateManager.addCloudContainer(container);
    stateManager.addCloudConnector(connector);

    const s = stateManager.getState();
    expect(s.cloudNodes).toHaveLength(1);
    expect(s.cloudContainers).toHaveLength(1);
    expect(s.cloudConnectors).toHaveLength(1);
  });

  it('removeCloudNode also drops any connector referencing it', () => {
    stateManager.addCloudNode(node);
    stateManager.addCloudNode({ ...node, id: 'n2' });
    stateManager.addCloudConnector({ id: 'conn2', sourceNodeId: 'n1', destNodeId: 'n2' });

    stateManager.removeCloudNode('n1');

    const s = stateManager.getState();
    expect(s.cloudNodes.find(n => n.id === 'n1')).toBeUndefined();
    expect(s.cloudConnectors.find(c => c.id === 'conn2')).toBeUndefined();
  });

  it('undo restores cloud arrays to their pre-change snapshot', () => {
    stateManager.addCloudNode(node);
    expect(stateManager.getState().cloudNodes).toHaveLength(1);

    stateManager.undo();
    expect(stateManager.getState().cloudNodes).toHaveLength(0);

    stateManager.redo();
    expect(stateManager.getState().cloudNodes).toHaveLength(1);
  });

  it('round-trips cloud arrays through exportJSON/importJSON', () => {
    stateManager.addCloudNode(node);
    stateManager.addCloudContainer(container);
    stateManager.addCloudConnector(connector);

    const json = exportJSON();

    stateManager.setState({ cloudNodes: [], cloudContainers: [], cloudConnectors: [] });
    expect(stateManager.getState().cloudNodes).toHaveLength(0);

    importJSON(json);

    const s = stateManager.getState();
    expect(s.cloudNodes).toHaveLength(1);
    expect(s.cloudNodes[0].id).toBe('n1');
    expect(s.cloudContainers).toHaveLength(1);
    expect(s.cloudConnectors).toHaveLength(1);
  });

  it('importJSON defaults cloud arrays to empty for a project file predating this feature', () => {
    const legacyProject = JSON.stringify({ version: '1.0.0', racks: [], devices: [], cables: [] });
    stateManager.addCloudNode(node);

    importJSON(legacyProject);

    const s = stateManager.getState();
    expect(s.cloudNodes).toEqual([]);
    expect(s.cloudContainers).toEqual([]);
    expect(s.cloudConnectors).toEqual([]);
  });
});
