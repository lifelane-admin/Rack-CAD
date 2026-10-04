import { describe, it, expect, beforeEach } from 'vitest';
import { AIWorkflowOrchestrator } from '../../ai/workflow/workflow-orchestrator';

describe('AIWorkflowOrchestrator - hasCanvasDeployment', () => {
  let orc: AIWorkflowOrchestrator;

  beforeEach(() => {
    localStorage.clear();
    orc = new AIWorkflowOrchestrator();
  });

  it('starts with hasCanvasDeployment false', () => {
    expect(orc.getState().hasCanvasDeployment).toBe(false);
  });

  it('setCanvasDeployed(true) sets flag to true', () => {
    orc.setCanvasDeployed(true);
    expect(orc.getState().hasCanvasDeployment).toBe(true);
  });

  it('setCanvasDeployed(false) resets flag', () => {
    orc.setCanvasDeployed(true);
    orc.setCanvasDeployed(false);
    expect(orc.getState().hasCanvasDeployment).toBe(false);
  });
});

describe('AIWorkflowOrchestrator - syncSpareNode', () => {
  let orc: AIWorkflowOrchestrator;

  beforeEach(() => {
    localStorage.clear();
    orc = new AIWorkflowOrchestrator();
    orc.addBomItem({
      name: 'Dell PowerEdge R760 (N+1 Standby Node)',
      model: 'PowerEdge R760 Hot Spare',
      category: 'Compute',
      qty: 1,
      unitCost: 8900,
      units: 2,
      power: 310,
      specs: '2U | Standby Hot-Spare',
      whySuggested: 'N+1 spare',
      badge: 'Redundancy N+1',
      alternatives: [],
    });
  });

  it('syncSpareNode(false) removes the spare BOM item', () => {
    orc.syncSpareNode(false);
    const spare = orc.getBomItems().find(b => b.badge === 'Redundancy N+1');
    expect(spare).toBeUndefined();
  });

  it('syncSpareNode(true) when spare missing adds it back', () => {
    orc.syncSpareNode(false);
    orc.syncSpareNode(true);
    const spare = orc.getBomItems().find(b => b.badge === 'Redundancy N+1');
    expect(spare).toBeDefined();
    expect(spare?.name).toContain('N+1 Standby Node');
  });

  it('syncSpareNode(true) when spare already exists does not duplicate', () => {
    orc.syncSpareNode(true);
    const spares = orc.getBomItems().filter(b => b.badge === 'Redundancy N+1');
    expect(spares).toHaveLength(1);
  });

  it('syncSpareNode(false) notifies listeners', () => {
    let called = 0;
    orc.subscribe(() => { called++; });
    orc.syncSpareNode(false);
    expect(called).toBeGreaterThan(0);
  });
});
