/**
 * RackSlicer AI — Workflow Orchestrator Tests
 *
 * Verifies:
 * 1. Gated sequential state machine
 * 2. Stage locking (Never Jump Ahead)
 * 3. Requirement completeness parsing
 * 4. Backward modification and downstream staleness invalidation
 * 5. Stage-aware MCP tool permissions
 * 6. Avatar workflow mood synchronization
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AIWorkflowOrchestrator } from '../../ai/workflow/workflow-orchestrator';
import { RequirementCompletenessEngine } from '../../ai/workflow/requirement-engine';

describe('AI Engineering Workflow Orchestrator', () => {
  let orchestrator: AIWorkflowOrchestrator;

  beforeEach(() => {
    localStorage.clear();
    orchestrator = new AIWorkflowOrchestrator();
  });

  it('initializes in REQUIREMENT_PROMPT stage with all future stages LOCKED', () => {
    const state = orchestrator.getState();
    expect(state.currentStage).toBe('REQUIREMENT_PROMPT');
    expect(state.stageStatuses['REQUIREMENT_PROMPT']).toBe('READY');
    expect(state.stageStatuses['REQUIREMENT_BRIEF']).toBe('LOCKED');
    expect(state.stageStatuses['ARCHITECTURE_DESIGN']).toBe('LOCKED');
    expect(state.stageStatuses['PHYSICAL_DESIGN']).toBe('LOCKED');
    expect(state.stageStatuses['MCP_DEPLOYMENT']).toBe('LOCKED');
  });

  it('submitting requirement prompt transitions to REQUIREMENT_BRIEF and parses known entities', () => {
    orchestrator.submitInitialRequirement('I need a 3-node Proxmox cluster with 50TB Ceph and 25GbE networking');
    const state = orchestrator.getState();

    expect(state.currentStage).toBe('REQUIREMENT_BRIEF');
    expect(state.stageStatuses['REQUIREMENT_PROMPT']).toBe('COMPLETED');
    expect(state.stageStatuses['REQUIREMENT_BRIEF']).toBe('WAITING_FOR_USER');

    const req = state.requirement;
    expect(req.platform).toBe('Proxmox');
    expect(req.nodeCount).toBe(3);
    expect(req.storageType).toBe('Ceph All-NVMe');
    expect(req.usableStorageTb).toBe(50);
    expect(req.networkFabric).toBe('25GbE Redundant');
    expect(req.clarifications.length).toBeGreaterThan(0);
  });

  it('STRICT GATING: prevents jumping ahead to locked future stages', () => {
    orchestrator.submitInitialRequirement('3-node Proxmox cluster');

    // Attempt to jump directly to PHYSICAL_DESIGN
    const jumped = orchestrator.navigateToStage('PHYSICAL_DESIGN');
    expect(jumped).toBe(false);

    // State should still be on REQUIREMENT_BRIEF
    expect(orchestrator.getState().currentStage).toBe('REQUIREMENT_BRIEF');

    // Attempt to jump to MCP_DEPLOYMENT
    const jumpedDeploy = orchestrator.navigateToStage('MCP_DEPLOYMENT');
    expect(jumpedDeploy).toBe(false);
    expect(orchestrator.getState().currentStage).toBe('REQUIREMENT_BRIEF');
  });

  it('unlocks stages sequentially only upon explicit user approval', () => {
    orchestrator.submitInitialRequirement('3-node Proxmox cluster');

    // 1. Approve Requirement Brief
    expect(orchestrator.isStageUnlocked('ARCHITECTURE_DESIGN')).toBe(false);
    orchestrator.approveCurrentStage('Requirement confirmed');
    expect(orchestrator.getState().currentStage).toBe('ARCHITECTURE_DESIGN');
    expect(orchestrator.isStageUnlocked('ARCHITECTURE_DESIGN')).toBe(true);

    // 2. Approve Architecture Design
    expect(orchestrator.isStageUnlocked('RESOURCE_BOM')).toBe(false);
    orchestrator.approveCurrentStage('Architecture confirmed');
    expect(orchestrator.getState().currentStage).toBe('RESOURCE_BOM');
    expect(orchestrator.isStageUnlocked('RESOURCE_BOM')).toBe(true);

    // 3. Approve Resource BOM
    expect(orchestrator.isStageUnlocked('PHYSICAL_DESIGN')).toBe(false);
    orchestrator.approveCurrentStage('Resources confirmed');
    expect(orchestrator.getState().currentStage).toBe('PHYSICAL_DESIGN');
    expect(orchestrator.isStageUnlocked('PHYSICAL_DESIGN')).toBe(true);
  });

  it('DOWNSTREAM INVALIDATION: modifying an earlier approved stage marks downstream as STALE', () => {
    orchestrator.submitInitialRequirement('3-node Proxmox cluster');
    orchestrator.approveCurrentStage(); // to Architecture
    orchestrator.approveCurrentStage(); // to Resources
    orchestrator.approveCurrentStage(); // to Physical Design

    expect(orchestrator.getState().stageStatuses['ARCHITECTURE_DESIGN']).toBe('APPROVED');
    expect(orchestrator.getState().stageStatuses['RESOURCE_BOM']).toBe('APPROVED');

    // User navigates back and modifies ARCHITECTURE_DESIGN
    orchestrator.modifyApprovedStage('ARCHITECTURE_DESIGN', 'Changed node sizing');

    const state = orchestrator.getState();
    expect(state.stageStatuses['ARCHITECTURE_DESIGN']).toBe('IN_PROGRESS');
    expect(state.stageContracts['ARCHITECTURE_DESIGN'].version).toBe('v1.1');

    // Downstream stages must become STALE
    expect(state.stageStatuses['RESOURCE_BOM']).toBe('STALE');
    expect(state.stageStatuses['PHYSICAL_DESIGN']).toBe('STALE');
  });

  it('STAGE-AWARE MCP TOOLS: enforces strict tool allowlists per stage', () => {
    // In Requirement stage
    expect(orchestrator.isToolAllowedInCurrentStage('analyze_requirement')).toBe(true);
    expect(orchestrator.isToolAllowedInCurrentStage('create_rack')).toBe(false);
    expect(orchestrator.isToolAllowedInCurrentStage('apply_design_changes')).toBe(false);

    // Advance to Physical Design
    orchestrator.submitInitialRequirement('Cluster');
    orchestrator.approveCurrentStage(); // Arch
    orchestrator.approveCurrentStage(); // Resources
    orchestrator.approveCurrentStage(); // Physical

    expect(orchestrator.getState().currentStage).toBe('PHYSICAL_DESIGN');
    expect(orchestrator.isToolAllowedInCurrentStage('place_equipment')).toBe(true);
    expect(orchestrator.isToolAllowedInCurrentStage('apply_design_changes')).toBe(false); // Only allowed in deployment!

    // Advance to Deployment
    orchestrator.approveCurrentStage(); // Network
    orchestrator.approveCurrentStage(); // Power
    orchestrator.approveCurrentStage(); // Validation
    orchestrator.approveCurrentStage(); // Gaps
    orchestrator.approveCurrentStage(); // Optimization
    orchestrator.approveCurrentStage(); // Final
    orchestrator.approveCurrentStage(); // Deployment

    expect(orchestrator.getState().currentStage).toBe('MCP_DEPLOYMENT');
    expect(orchestrator.isToolAllowedInCurrentStage('apply_design_changes')).toBe(true);
    expect(orchestrator.isToolAllowedInCurrentStage('preview_design_changes')).toBe(true);
  });

  it('AVATAR MOODS: synchronizes avatar mood according to current stage', () => {
    expect(orchestrator.getAvatarMoodForCurrentStage()).toBe('idle'); // Listening on prompt

    orchestrator.submitInitialRequirement('Cluster');
    expect(orchestrator.getAvatarMoodForCurrentStage()).toBe('thinking'); // Analyzing brief

    orchestrator.approveCurrentStage(); // Arch
    expect(orchestrator.getAvatarMoodForCurrentStage()).toBe('thinking'); // Architecting

    orchestrator.approveCurrentStage(); // Resources
    orchestrator.approveCurrentStage(); // Physical
    orchestrator.approveCurrentStage(); // Network
    orchestrator.approveCurrentStage(); // Power
    orchestrator.approveCurrentStage(); // Validation
    expect(orchestrator.getAvatarMoodForCurrentStage()).toBe('analyzing');
  });

  it('CUSTOM SPECIFICATIONS: supports user-defined custom clarification values', () => {
    orchestrator.submitInitialRequirement('Create a 2-node Hyper-V cluster with shared SAN storage');
    const state = orchestrator.getState();

    // Verify Hyper-V and 2-node recognition
    expect(state.requirement.platform).toBe('Microsoft Hyper-V');
    expect(state.requirement.nodeCount).toBe(2);
    expect(state.requirement.storageType).toBe('SAN iSCSI');

    // Provide custom RAM input: 384 GB
    orchestrator.answerClarification('q_ram', '384 GB RAM', true);
    expect(orchestrator.getState().requirement.ramGbPerNode).toBe(384);

    // Provide custom Storage input: 12 TB Usable
    orchestrator.answerClarification('q_storage', '12 TB Usable', true);
    expect(orchestrator.getState().requirement.usableStorageTb).toBe(12);
  });

  it('EDITABLE ASSUMPTIONS: allows toggling, editing, commenting, and adding custom assumptions', () => {
    orchestrator.submitInitialRequirement('2-node Hyper-V cluster');
    const req = orchestrator.getState().requirement;
    expect(req.assumptions.length).toBeGreaterThan(0);

    const firstAsm = req.assumptions[0];
    expect(firstAsm.enabled).toBe(true);

    // Toggle enabled to false
    orchestrator.updateAssumption(firstAsm.id, { enabled: false });
    expect(orchestrator.getState().requirement.assumptions[0].enabled).toBe(false);

    // Add user feedback comment
    orchestrator.updateAssumption(firstAsm.id, { userComment: 'Customer does not allow A/B power' });
    expect(orchestrator.getState().requirement.assumptions[0].userComment).toBe('Customer does not allow A/B power');

    // Add new custom assumption
    orchestrator.addAssumption('Must fit in existing 600mm depth comms rack');
    const updated = orchestrator.getState().requirement;
    const customAsm = updated.assumptions.find((a) => a.text.includes('600mm depth'));
    expect(customAsm).toBeDefined();
    expect(customAsm?.enabled).toBe(true);

    // Remove assumption
    orchestrator.removeAssumption(customAsm!.id);
    expect(orchestrator.getState().requirement.assumptions.find((a) => a.id === customAsm!.id)).toBeUndefined();
  });

  it('DIRECT USER CORRECTION: allows editing parsed Known fields (workload, platform, nodes)', () => {
    orchestrator.submitInitialRequirement('Generic compute cluster');
    expect(orchestrator.getState().requirement.platform).toBe('Bare Metal');

    // User corrects platform to Proxmox
    orchestrator.updateKnownProperty('Platform', 'Proxmox');
    expect(orchestrator.getState().requirement.platform).toBe('Proxmox');

    // User corrects node count from 2 to 4
    orchestrator.updateKnownProperty('Nodes', 4);
    expect(orchestrator.getState().requirement.nodeCount).toBe(4);
  });

  it('HUMAN-IN-THE-LOOP BOM: user can customize quantities, swap alternatives, add/remove items', () => {
    orchestrator.submitInitialRequirement('2-node Hyper-V cluster with shared SAN storage');
    const bom = orchestrator.getBomItems();
    expect(bom.length).toBeGreaterThan(0);

    const computeItem = bom.find((b) => b.category === 'Compute');
    expect(computeItem).toBeDefined();
    expect(computeItem?.name).toBe('Dell PowerEdge R760');
    expect(computeItem?.qty).toBe(2);

    // 1. User modifies quantity from 2 to 4
    orchestrator.updateBomItemQty(computeItem!.id, 4);
    const updatedCompute = orchestrator.getBomItems().find((b) => b.id === computeItem!.id);
    expect(updatedCompute?.qty).toBe(4);
    expect(updatedCompute?.isCustomized).toBe(true);

    // 2. User swaps alternative (Dell -> HPE ProLiant DL380 Gen11)
    const initialTotals = orchestrator.getBomTotals();
    orchestrator.swapBomItemAlternative(computeItem!.id, 'HPE ProLiant DL380 Gen11');
    const swappedCompute = orchestrator.getBomItems().find((b) => b.id === computeItem!.id);
    expect(swappedCompute?.name).toBe('HPE ProLiant DL380 Gen11');
    // Old primary should now be in alternatives
    expect(swappedCompute?.alternatives.some((a) => a.name === 'Dell PowerEdge R760')).toBe(true);

    // 3. User adds a custom component (e.g. Fortinet Firewall)
    const countBefore = orchestrator.getBomItems().length;
    orchestrator.addBomItem({
      category: 'Security & Management',
      name: 'Fortinet FortiGate 100F Next-Gen Firewall',
      model: 'FortiGate 100F',
      qty: 1,
      specs: '1U | 2x 10GE + 8x GE | Dual AC PSU',
      whySuggested: 'Perimeter threat defense',
      unitCost: 3200,
      units: 1,
      power: 50,
      badge: 'User Added',
      alternatives: [],
    });

    const bomAfterAdd = orchestrator.getBomItems();
    expect(bomAfterAdd.length).toBe(countBefore + 1);
    const fwItem = bomAfterAdd.find((b) => b.name.includes('Fortinet'));
    expect(fwItem).toBeDefined();
    expect(fwItem?.isUserAdded).toBe(true);

    // 4. Live totals reflect custom items & updated quantities
    const totals = orchestrator.getBomTotals();
    expect(totals.totalCost).toBeGreaterThan(initialTotals.totalCost);
    expect(totals.totalUnits).toBeGreaterThan(0);
    expect(totals.totalWatts).toBeGreaterThan(0);

    // 5. User removes an item
    orchestrator.removeBomItem(fwItem!.id);
    expect(orchestrator.getBomItems().find((b) => b.id === fwItem!.id)).toBeUndefined();

    // 6. User can reset back to AI suggestions
    orchestrator.resetBomToAiDefaults();
    const resetCompute = orchestrator.getBomItems().find((b) => b.category === 'Compute');
    expect(resetCompute?.name).toBe('Dell PowerEdge R760');
    expect(resetCompute?.qty).toBe(2);
  });

  it('PHYSICAL LAYOUT: allows repositioning U units, moving up/down, toggling Place/Reserve, and cabinet config', () => {
    orchestrator.submitInitialRequirement('2-node Hyper-V cluster with shared SAN storage');
    const placements = orchestrator.getRackPlacements();
    expect(placements.length).toBeGreaterThan(0);

    const firstPlacement = placements[0];
    const initialStartU = firstPlacement.startU;

    // Move placement down by 1U
    orchestrator.moveRackPlacement(firstPlacement.id, -1);
    expect(orchestrator.getRackPlacements().find((p) => p.id === firstPlacement.id)?.startU).toBe(initialStartU - 1);

    // Directly set U position
    orchestrator.updateRackPlacement(firstPlacement.id, { startU: 35, action: 'Reserve' });
    const updatedP = orchestrator.getRackPlacements().find((p) => p.id === firstPlacement.id);
    expect(updatedP?.startU).toBe(35);
    expect(updatedP?.action).toBe('Reserve');
    expect(updatedP?.isUserModified).toBe(true);

    // Update cabinet config
    orchestrator.updateCabinetConfig({ name: 'DC02-RACK-99', totalU: 48, slotNumber: 5 });
    const cab = orchestrator.getCabinetConfig();
    expect(cab.name).toBe('DC02-RACK-99');
    expect(cab.totalU).toBe(48);
    expect(cab.slotNumber).toBe(5);

    // Reset layout to AI defaults
    orchestrator.resetPlacementsToAi();
    const resetP = orchestrator.getRackPlacements().find((p) => p.id === firstPlacement.id);
    expect(resetP?.startU).toBe(48); // Top U in 48U rack
  });

  it('NETWORK CABLING: allows adding, modifying, removing cable runs, and resetting to AI routing', () => {
    orchestrator.submitInitialRequirement('2-node cluster');
    const routes = orchestrator.getCableRoutes();
    expect(routes.length).toBeGreaterThan(0);

    const initialCount = routes.length;
    const firstRoute = routes[0];

    // Modify existing route
    orchestrator.updateCableRoute(firstRoute.id, { length: '3.0m', vlan: 'VLAN 100 (DMZ)' });
    const updatedR = orchestrator.getCableRoutes().find((r) => r.id === firstRoute.id);
    expect(updatedR?.length).toBe('3.0m');
    expect(updatedR?.vlan).toBe('VLAN 100 (DMZ)');

    // Add custom cable run
    orchestrator.addCableRoute({
      source: 'Node 1 (eth3)',
      dest: 'Backup Target Port 1',
      type: '100GbE QSFP28 DAC',
      color: '#0284c7',
      length: '1.5m',
      vlan: 'VLAN 50 (Backup Replication)',
    });
    expect(orchestrator.getCableRoutes().length).toBe(initialCount + 1);

    // Remove a cable run
    const addedRoute = orchestrator.getCableRoutes().find((r) => r.source === 'Node 1 (eth3)');
    expect(addedRoute).toBeDefined();
    orchestrator.removeCableRoute(addedRoute!.id);
    expect(orchestrator.getCableRoutes().length).toBe(initialCount);

    // Reset to AI routing
    orchestrator.resetCablesToAi();
    expect(orchestrator.getCableRoutes().length).toBe(initialCount);
  });

  it('POWER & THERMAL: allows changing feed architecture, utility voltage, breaker amperage, and cooling rules', () => {
    orchestrator.submitInitialRequirement('2-node cluster');
    const pwr = orchestrator.getPowerThermalConfig();
    expect(pwr.feedType).toBe('A/B Dual Redundant');
    expect(pwr.voltage).toBe(230);
    expect(pwr.breakerAmps).toBe(32);

    // Change feed architecture and electrical rating
    orchestrator.updatePowerThermalConfig({
      feedType: 'Single Feed',
      voltage: 208,
      breakerAmps: 30,
      continuousLoadPercent: 75,
    });
    const updatedPwr = orchestrator.getPowerThermalConfig();
    expect(updatedPwr.feedType).toBe('Single Feed');
    expect(updatedPwr.voltage).toBe(208);
    expect(updatedPwr.breakerAmps).toBe(30);
    expect(updatedPwr.continuousLoadPercent).toBe(75);

    // Toggle cooling check and add feedback note
    const firstCheck = updatedPwr.coolingChecks[0];
    orchestrator.toggleCoolingCheck(firstCheck.id, false, 'Facility does not support perforated rear doors');
    const updatedCheck = orchestrator.getPowerThermalConfig().coolingChecks.find((c) => c.id === firstCheck.id);
    expect(updatedCheck?.checked).toBe(false);
    expect(updatedCheck?.userNote).toBe('Facility does not support perforated rear doors');

    // Add and remove cooling rule
    orchestrator.addCoolingCheck('Cold Aisle Containment Required');
    const addedCheck = orchestrator.getPowerThermalConfig().coolingChecks.find((c) => c.text.includes('Cold Aisle'));
    expect(addedCheck).toBeDefined();
    orchestrator.removeCoolingCheck(addedCheck!.id);
    expect(orchestrator.getPowerThermalConfig().coolingChecks.find((c) => c.id === addedCheck!.id)).toBeUndefined();
  });

  it('GAP ANALYSIS: allows accepting recommendations to auto-add to BOM, dismissing, and custom gaps', () => {
    orchestrator.submitInitialRequirement('2-node cluster');
    const gaps = orchestrator.getGapItems();
    expect(gaps.length).toBeGreaterThan(0);

    const oobGap = gaps.find((g) => g.id === 'gap_oob');
    expect(oobGap).toBeDefined();
    expect(oobGap?.accepted).toBe(false);

    const initialBomCount = orchestrator.getBomItems().length;

    // 1. User accepts OOB gap -> automatically adds proposed hardware to BOM
    orchestrator.acceptGap('gap_oob');
    expect(orchestrator.getGapItems().find((g) => g.id === 'gap_oob')?.accepted).toBe(true);
    expect(orchestrator.getBomItems().length).toBe(initialBomCount + 1);
    const addedBom = orchestrator.getBomItems().find((b) => b.name.includes('Cisco Catalyst 1000'));
    expect(addedBom).toBeDefined();
    expect(addedBom?.badge).toBe('Gap Accepted');

    // 2. User dismisses another gap
    orchestrator.dismissGap('gap_backup');
    expect(orchestrator.getGapItems().find((g) => g.id === 'gap_backup')?.dismissed).toBe(true);

    // 3. User reopens dismissed gap
    orchestrator.reopenGap('gap_backup');
    expect(orchestrator.getGapItems().find((g) => g.id === 'gap_backup')?.dismissed).toBe(false);

    // 4. User adds feedback note to a gap
    orchestrator.updateGap('gap_telemetry', { userNote: 'We already have external APC NetBotz probes installed' });
    expect(orchestrator.getGapItems().find((g) => g.id === 'gap_telemetry')?.userNote).toBe(
      'We already have external APC NetBotz probes installed'
    );

    // 5. User adds custom gap
    orchestrator.addGapItem({
      title: 'KVM-over-IP Console Switch',
      category: 'Management',
      severity: 'Optional',
      description: 'Emergency local console access in case of network segmentation lockouts.',
      accepted: false,
      dismissed: false,
    });
    expect(orchestrator.getGapItems().some((g) => g.title.includes('KVM-over-IP'))).toBe(true);
  });

  it('STAGE 09 DESIGN OPTIMIZATION: supports interactive tabs, before/after diffs, toggleable changes, and custom constraints', () => {
    orchestrator.submitInitialRequirement('3-node Proxmox cluster');

    // Default objective is cost
    expect(orchestrator.getOptimizationObjective()).toBe('cost');
    const costProposal = orchestrator.getOptimizationProposal('cost');
    expect(costProposal.title).toBe('Cost Optimization');
    expect(costProposal.changes.length).toBeGreaterThan(0);
    expect(costProposal.before.totalCost).toBeGreaterThan(0);
    expect(costProposal.after.totalCost).toBeLessThan(costProposal.before.totalCost);
    expect(costProposal.savings.costDiff).toBeLessThan(0);

    // 1. Switch to Rack Space Optimization tab
    orchestrator.setOptimizationObjective('rack_space');
    expect(orchestrator.getOptimizationObjective()).toBe('rack_space');
    const spaceProposal = orchestrator.getOptimizationProposal('rack_space');
    expect(spaceProposal.title).toBe('Rack Space Optimization');
    expect(spaceProposal.savings.unitsSaved).toBeGreaterThan(0);
    expect(spaceProposal.after.totalUnits).toBeLessThan(spaceProposal.before.totalUnits);
    expect(spaceProposal.after.growthHeadroomPercent).toBeGreaterThan(spaceProposal.before.growthHeadroomPercent);

    // 2. Switch to Power Efficiency Optimization tab
    orchestrator.setOptimizationObjective('power');
    expect(orchestrator.getOptimizationObjective()).toBe('power');
    const powerProposal = orchestrator.getOptimizationProposal('power');
    expect(powerProposal.title).toBe('Power Efficiency Optimization');
    expect(powerProposal.savings.powerDiffWatts).toBeLessThan(0);
    expect(powerProposal.after.totalPowerKw).toBeLessThan(powerProposal.before.totalPowerKw);
    expect(powerProposal.savings.coolingBtuSaved).toBeGreaterThan(0);

    // 3. Switch to Max Redundancy tab
    orchestrator.setOptimizationObjective('redundancy');
    expect(orchestrator.getOptimizationObjective()).toBe('redundancy');
    const redProposal = orchestrator.getOptimizationProposal('redundancy');
    expect(redProposal.title).toBe('Max Redundancy Optimization');
    expect(redProposal.after.redundancyLevel).toContain('Tier IV');

    // 4. Toggle specific changes on/off dynamically updates after metrics
    const hotspareChange = redProposal.changes.find((c) => c.id === 'opt-redundancy-hotspare');
    expect(hotspareChange).toBeDefined();
    expect(hotspareChange?.enabled).toBe(true);

    // Disable hot spare change
    orchestrator.toggleOptimizationChange('opt-redundancy-hotspare', false);
    const updatedRedProposal = orchestrator.getOptimizationProposal('redundancy');
    const toggledHotspare = updatedRedProposal.changes.find((c) => c.id === 'opt-redundancy-hotspare');
    expect(toggledHotspare?.enabled).toBe(false);
    expect(updatedRedProposal.after.totalCost).toBeLessThan(redProposal.after.totalCost);

    // 5. Add user feedback note to a change recommendation
    orchestrator.updateOptimizationChangeNote('opt-redundancy-ats', 'Client already has in-rack ATS PDU');
    const proposalWithNote = orchestrator.getOptimizationProposal('redundancy');
    const atsChange = proposalWithNote.changes.find((c) => c.id === 'opt-redundancy-ats');
    expect(atsChange?.userNote).toBe('Client already has in-rack ATS PDU');

    // 6. Add and remove custom optimization constraints / rules
    orchestrator.addCustomOptimizationRule('redundancy', 'Dual utility transformer feeds required');
    const rules = orchestrator.getCustomOptimizationRules('redundancy');
    expect(rules).toContain('Dual utility transformer feeds required');

    orchestrator.removeCustomOptimizationRule('redundancy', 0);
    expect(orchestrator.getCustomOptimizationRules('redundancy')).not.toContain('Dual utility transformer feeds required');

    // 7. Apply optimization advances to FINAL_DESIGN and updates summary
    orchestrator.applyOptimization('cost');
    expect(orchestrator.getState().currentStage).toBe('FINAL_DESIGN');
    expect(orchestrator.getAppliedOptimizationSummary()).toContain('Cost Reduction applied');
  });

  it('STAGE 09 DESIGN OPTIMIZATION: allows user to keep baseline design without changes', () => {
    orchestrator.submitInitialRequirement('3-node Proxmox cluster');

    orchestrator.keepBaselineDesign();
    expect(orchestrator.getState().currentStage).toBe('FINAL_DESIGN');
    expect(orchestrator.getAppliedOptimizationSummary()).toContain('Baseline configuration preserved');
  });
});


