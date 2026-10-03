import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { RackSlicerAIStudio } from '../../ai/studio/ai-studio';
import { WorkflowStageRenderers } from '../../ai/workflow/stage-renderers';
import { AIWorkflowOrchestrator } from '../../ai/workflow/workflow-orchestrator';
import { stateManager } from '../../core/state';
import { runValidationAlerts } from '../../core/validation';

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

describe('Deploy to Canvas with Smart Cabling and MCP Validation', () => {
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

    stateManager.setState({
      racks: [],
      devices: [],
      cables: [],
    });
  });

  it('successfully deploys full infrastructure package and smart cables with zero validation errors', async () => {
    const studio = new RackSlicerAIStudio();
    
    // Configure state requirements with 3 nodes, dual ToRs, SAN, and 2N dual corded power
    const req = studio.getOrchestrator().getState().requirement;
    req.nodeCount = 3;
    req.networkFabric = '25GbE Redundant';
    req.storageType = 'NVMe-oF';
    req.powerFeed = 'A/B Redundant';

    const result = await studio.executeBuildOnCanvas();

    expect(result.success).toBe(true);
    expect(result.txId).toBeDefined();

    // Verify state has been updated on canvas
    const racks = stateManager.getState().racks;
    expect(racks.length).toBeGreaterThan(0);
    const rack = racks[0];
    expect(rack.units).toBe(42);
    expect(rack.leftCableManagerWidth).toBe('4-inch');
    expect(rack.rightCableManagerWidth).toBe('4-inch');

    // Verify equipment in rack
    const equipment = stateManager.getState().devices;
    expect(equipment.length).toBeGreaterThan(0);
    
    // Compute nodes, ToRs, SAN, and cable manager should exist
    const servers = equipment.filter((e) => e.templateId === 'server-2u-enterprise');
    expect(servers.length).toBeGreaterThan(0);

    const tors = equipment.filter((e) => e.templateId === 'sw-1u-tor-25g-100g');
    expect(tors.length).toBe(2);

    const san = equipment.find((e) => e.templateId === 'storage-2u-allflash-nvme');
    expect(san).toBeDefined();

    // Verify cables
    const cables = stateManager.getState().cables;
    expect(cables.length).toBeGreaterThan(0);

    // Verify data cables (25G DAC)
    const dataCables = cables.filter((c) => c.name?.includes('Data'));
    expect(dataCables.length).toBe(servers.length * 2); // Each node has 2x 25G links (ToR-A & ToR-B)

    // Verify storage cables (100G NVMe-oF)
    const storageCables = cables.filter((c) => c.name?.includes('NVMe-oF'));
    expect(storageCables.length).toBe(2); // 2 controllers * 1

    // Verify MLAG ISL trunks (100G)
    const mlagCables = cables.filter((c) => c.name?.includes('MLAG'));
    expect(mlagCables.length).toBe(2);

    // Verify dual A/B power cables
    const powerFeedACables = cables.filter((c) => c.name?.includes('Feed A'));
    const powerFeedBCables = cables.filter((c) => c.name?.includes('Feed B'));
    expect(powerFeedACables.length).toBeGreaterThan(0);
    expect(powerFeedBCables.length).toBeGreaterThan(0);

    // CRITICAL: Validation must produce ZERO media mismatch errors
    const alerts = runValidationAlerts(
      stateManager.getState().racks,
      stateManager.getState().devices,
      stateManager.getState().cables
    );
    const mediaMismatches = alerts.filter(
      (a) => a.category === 'medium' || a.message.includes('Media mismatch') || a.message.includes('non-fiber')
    );
    expect(mediaMismatches).toHaveLength(0);
  });

  it('correctly parses user screenshot conflicts into structured summary table items', () => {
    const rawError = `Transaction rolled back: Validation failed after applying changes: Media mismatch on "Node 1 NIC 1 ⟶ ToR-A Port 1 (25GbE Data A)": Connecting Fiber port (25G SFP28 1) to non-fiber port (Port 1); Media mismatch on "Node 1 NIC 2 ⟶ ToR-B Port 1 (25GbE Data B)": Connecting Fiber port (25G SFP28 2) to non-fiber port (Port 1); Media mismatch on "Node 2 NIC 1 ⟶ ToR-A Port 2 (25GbE Data A)": Connecting Fiber port (25G SFP28 1) to non-fiber port (Port 2); Media mismatch on "Node 2 NIC 2 ⟶ ToR-B Port 2 (25GbE Data B)": Connecting Fiber port (25G SFP28 2) to non-fiber port (Port 2); Media mismatch on "Node 3 NIC 1 ⟶ ToR-A Port 3 (25GbE Data A)": Connecting Fiber port (25G SFP28 1) to non-fiber port (Port 3); Media mismatch on "Node 3 NIC 2 ⟶ ToR-B Port 3 (25GbE Data B)": Connecting Fiber port (25G SFP28 2) to non-fiber port (Port 3); Media mismatch on "Storage Array Ctrl 1 ⟶ ToR-A (100G NVMe-oF Fabric A)": Connecting Fiber port (100G NVMe-oF 1) to non-fiber port (Port 4); Media mismatch on "Storage Array Ctrl 2 ⟶ ToR-B (100G NVMe-oF Fabric B)": Connecting Fiber port (100G NVMe-oF 2) to non-fiber port (Port 4).`;

    const conflicts = WorkflowStageRenderers.parseDeploymentConflicts(rawError);

    expect(conflicts).toHaveLength(8);
    expect(conflicts[0].item).toBe('Node 1 NIC 1 ⟶ ToR-A Port 1 (25GbE Data A)');
    expect(conflicts[0].source).toBe('25G SFP28 1');
    expect(conflicts[0].sourceMedia).toContain('Optical SFP28');
    expect(conflicts[0].dest).toBe('Port 1');
    expect(conflicts[0].destMedia).toContain('Copper');
    expect(conflicts[0].conflictType).toContain('Physical Media Mismatch');
    expect(conflicts[0].recommendedAction).toContain('Cisco Nexus 93180YC');

    expect(conflicts[6].item).toBe('Storage Array Ctrl 1 ⟶ ToR-A (100G NVMe-oF Fabric A)');
    expect(conflicts[6].source).toBe('100G NVMe-oF 1');
    expect(conflicts[6].dest).toBe('Port 4');
  });

  it('renders conflict summary table and all 4 corrective action buttons on deployment failure', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const orchestrator = new AIWorkflowOrchestrator();

    const mockDeployFn = vi.fn().mockResolvedValue({
      success: false,
      error: 'Media mismatch on "Node 1 NIC 1 ⟶ ToR-A Port 1 (25GbE Data A)": Connecting Fiber port (25G SFP28 1) to non-fiber port (Port 1)',
    });

    WorkflowStageRenderers.renderDeploymentStage(container, orchestrator, mockDeployFn);

    // Wait for promise resolution
    await new Promise((r) => setTimeout(r, 10));

    // Verify summary table exists
    const table = container.querySelector('.conflict-table');
    expect(table).not.toBeNull();
    expect(container.textContent).toContain('Physical Media Mismatch');
    expect(container.textContent).toContain('Node 1 NIC 1 ⟶ ToR-A Port 1 (25GbE Data A)');

    // Verify all 4 corrective action buttons exist
    const btnApprove = container.querySelector('#btn-action-approve');
    const btnModify = container.querySelector('#btn-action-modify');
    const btnReject = container.querySelector('#btn-action-reject');
    const btnDiscard = container.querySelector('#btn-action-discard');

    expect(btnApprove).not.toBeNull();
    expect(btnModify).not.toBeNull();
    expect(btnReject).not.toBeNull();
    expect(btnDiscard).not.toBeNull();

    // Verify text descriptions for each action
    expect(container.textContent).toContain('1. Approve (Auto-Fix)');
    expect(container.textContent).toContain('2. Modify');
    expect(container.textContent).toContain('3. Reject');
    expect(container.textContent).toContain('4. Discard');
  });
});
