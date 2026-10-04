import { describe, it, expect, beforeEach } from 'vitest';
import { AIWorkflowOrchestrator } from '../../ai/workflow/workflow-orchestrator';

describe('AIWorkflowOrchestrator - hasCanvasDeployment', () => {
  let orc: AIWorkflowOrchestrator;

  beforeEach(() => {
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
