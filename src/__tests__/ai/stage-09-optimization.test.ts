import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WorkflowStageRenderers } from '../../ai/workflow/stage-renderers';
import { AIWorkflowOrchestrator } from '../../ai/workflow/workflow-orchestrator';

describe('Stage 09: Multi-Objective Design Optimization UI', () => {
  let container: HTMLElement;
  let orchestrator: AIWorkflowOrchestrator;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    orchestrator = new AIWorkflowOrchestrator();
    orchestrator.submitInitialRequirement('3-node Proxmox cluster with 50TB Ceph');
    orchestrator.getState().currentStage = 'OPTIMIZATION';
    WorkflowStageRenderers.renderOptimizationStage(container, orchestrator);
  });

  afterEach(() => {
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
    vi.restoreAllMocks();
  });

  it('renders all 4 optimization objective tabs and highlights Cost Reduction by default', () => {
    const tabs = container.querySelectorAll<HTMLButtonElement>('.btn-opt-obj');
    expect(tabs.length).toBe(4);

    const costTab = container.querySelector<HTMLButtonElement>('.btn-opt-obj[data-obj="cost"]');
    const spaceTab = container.querySelector<HTMLButtonElement>('.btn-opt-obj[data-obj="rack_space"]');
    const powerTab = container.querySelector<HTMLButtonElement>('.btn-opt-obj[data-obj="power"]');
    const redTab = container.querySelector<HTMLButtonElement>('.btn-opt-obj[data-obj="redundancy"]');

    expect(costTab).not.toBeNull();
    expect(spaceTab).not.toBeNull();
    expect(powerTab).not.toBeNull();
    expect(redTab).not.toBeNull();

    expect(costTab?.classList.contains('active')).toBe(true);
    expect(spaceTab?.classList.contains('active')).toBe(false);

    // Header displays Cost Optimization
    expect(container.textContent).toContain('BEFORE VS. AFTER COMPARISON (COST OPTIMIZATION)');
  });

  it('allows clicking Rack Space tab to switch active objective and update before/after diff', () => {
    const spaceTab = container.querySelector<HTMLButtonElement>('.btn-opt-obj[data-obj="rack_space"]');
    expect(spaceTab).not.toBeNull();

    spaceTab?.click();

    // After click, orchestrator objective is updated
    expect(orchestrator.getOptimizationObjective()).toBe('rack_space');

    // UI re-renders with Rack Space active
    const updatedSpaceTab = container.querySelector<HTMLButtonElement>('.btn-opt-obj[data-obj="rack_space"]');
    expect(updatedSpaceTab?.classList.contains('active')).toBe(true);

    // Section title reflects Rack Space
    expect(container.textContent).toContain('BEFORE VS. AFTER COMPARISON (RACK SPACE OPTIMIZATION)');
    expect(container.textContent).toContain('Reclaimed');
  });

  it('allows clicking Power Efficiency tab and Max Redundancy tab', () => {
    const powerTab = container.querySelector<HTMLButtonElement>('.btn-opt-obj[data-obj="power"]');
    powerTab?.click();
    expect(orchestrator.getOptimizationObjective()).toBe('power');
    expect(container.textContent).toContain('BEFORE VS. AFTER COMPARISON (POWER EFFICIENCY OPTIMIZATION)');

    const redTab = container.querySelector<HTMLButtonElement>('.btn-opt-obj[data-obj="redundancy"]');
    redTab?.click();
    expect(orchestrator.getOptimizationObjective()).toBe('redundancy');
    expect(container.textContent).toContain('BEFORE VS. AFTER COMPARISON (MAX REDUNDANCY OPTIMIZATION)');
    expect(container.textContent).toContain('Tier IV');
  });

  it('renders checkable and toggleable proposed changes', () => {
    const checkboxes = container.querySelectorAll<HTMLInputElement>('.opt-change-check');
    expect(checkboxes.length).toBeGreaterThan(0);

    const firstCheckbox = checkboxes[0];
    const changeId = firstCheckbox.dataset.id!;
    expect(firstCheckbox.checked).toBe(true);

    // Uncheck first item
    firstCheckbox.click();

    // Change should now be disabled in orchestrator
    const proposal = orchestrator.getOptimizationProposal();
    const updatedChange = proposal.changes.find((c) => c.id === changeId);
    expect(updatedChange?.enabled).toBe(false);

    // Header count updates
    expect(container.textContent).toContain('Selected');
  });

  it('allows adding and removing custom optimization constraints', () => {
    const input = container.querySelector<HTMLInputElement>('#input-new-opt-rule');
    const addBtn = container.querySelector<HTMLButtonElement>('#btn-add-opt-rule');
    expect(input).not.toBeNull();
    expect(addBtn).not.toBeNull();

    input!.value = 'Ensure at least 25% rack space remains unallocated';
    addBtn!.click();

    expect(orchestrator.getCustomOptimizationRules('cost')).toContain(
      'Ensure at least 25% rack space remains unallocated'
    );
    expect(container.textContent).toContain('Ensure at least 25% rack space remains unallocated');

    // Remove the rule
    const removeBtn = container.querySelector<HTMLButtonElement>('.btn-remove-opt-rule');
    expect(removeBtn).not.toBeNull();
    removeBtn!.click();

    expect(orchestrator.getCustomOptimizationRules('cost')).not.toContain(
      'Ensure at least 25% rack space remains unallocated'
    );
  });

  it('clicking Keep Baseline Design retains current configuration and proceeds', () => {
    const keepBtn = container.querySelector<HTMLButtonElement>('#btn-opt-keep');
    expect(keepBtn).not.toBeNull();

    keepBtn!.click();

    expect(orchestrator.getState().currentStage).toBe('FINAL_DESIGN');
    expect(orchestrator.getAppliedOptimizationSummary()).toContain('Baseline configuration preserved');
  });

  it('clicking Apply Optimization applies selected objective and proceeds to Stage 10', () => {
    // Switch to power tab
    const powerTab = container.querySelector<HTMLButtonElement>('.btn-opt-obj[data-obj="power"]');
    powerTab?.click();

    const applyBtn = container.querySelector<HTMLButtonElement>('#btn-opt-apply');
    expect(applyBtn).not.toBeNull();
    applyBtn!.click();

    expect(orchestrator.getState().currentStage).toBe('FINAL_DESIGN');
    expect(orchestrator.getAppliedOptimizationSummary()).toContain('Power Efficiency Tuning applied');
  });
});
