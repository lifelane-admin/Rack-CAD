import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowStageRenderers as StageRenderers } from '../../ai/workflow/stage-renderers';
import { AIWorkflowOrchestrator } from '../../ai/workflow/workflow-orchestrator';

describe('StageRenderers.renderEngineeringMetricsBar', () => {
  let container: HTMLElement;
  let orc: AIWorkflowOrchestrator;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    orc = new AIWorkflowOrchestrator();
  });

  it('renders metrics bar with U%, kW, BTU/hr, BOM$, redundancy', () => {
    StageRenderers.renderEngineeringMetricsBar(container, orc);
    const bar = container.querySelector('.eng-metrics-bar');
    expect(bar).not.toBeNull();
    expect(bar!.innerHTML).toContain('kW');
    expect(bar!.innerHTML).toContain('BTU');
    expect(bar!.innerHTML).toContain('USD');
  });

  it('shows Dual Feed Verified when powerFeed is A/B Redundant', () => {
    StageRenderers.renderEngineeringMetricsBar(container, orc);
    const bar = container.querySelector('.eng-metrics-bar');
    expect(bar!.innerHTML).toMatch(/Dual Feed|A\/B/i);
  });

  it('Undo AI Deployment button exists', () => {
    StageRenderers.renderEngineeringMetricsBar(container, orc);
    const btn = container.querySelector('.btn-undo-deploy');
    expect(btn).not.toBeNull();
  });

  it('Export BOM Report button exists', () => {
    StageRenderers.renderEngineeringMetricsBar(container, orc);
    const btn = container.querySelector('.btn-export-bom');
    expect(btn).not.toBeNull();
  });
});
