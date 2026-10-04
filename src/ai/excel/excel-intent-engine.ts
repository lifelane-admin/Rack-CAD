/**
 * RackSlicer AI — Excel Architecture Intent Orchestrator Engine
 *
 * Implements deterministic architecture generation from structured Excel workbooks.
 * Enforces zero-stale-context reset on CREATE, SPOF analysis, and requirement traceability.
 */

import { ArchitectureManifest, ArchitectureGenerationContext } from './excel-types';
import { ExcelArchitectureParser } from './excel-parser';
import { RequirementSpec } from '../workflow/types';
import { DesignChangeItem } from '../../mcp/types';

export class ExcelArchitectureIntentEngine {
  private static activeContext: ArchitectureGenerationContext | null = null;
  private static currentManifest: ArchitectureManifest | null = null;

  /**
   * Process incoming Excel / JSON Architecture Intent input and produce a deterministic ArchitectureManifest.
   */
  public static processWorkbook(rawInput: string): {
    manifest: ArchitectureManifest;
    requirementSpec: RequirementSpec;
    changes: DesignChangeItem[];
  } {
    const manifest = ExcelArchitectureParser.parse(rawInput);

    // Enforce Core Principle 1: CREATE action starts 100% clean-state generation
    if (manifest.action === 'CREATE') {
      this.resetGenerationContext(manifest.context);
    } else {
      this.activeContext = manifest.context;
    }

    this.currentManifest = manifest;

    // Convert Manifest to RequirementSpec for workflow stages
    const spec = this.manifestToRequirementSpec(manifest);

    // Convert Manifest to canvas DesignChangeItems
    const changes = this.manifestToDesignChanges(manifest);

    return { manifest, requirementSpec: spec, changes };
  }

  /**
   * Resets active generation context to prevent stale context / cache contamination.
   */
  public static resetGenerationContext(ctx: ArchitectureGenerationContext): void {
    this.activeContext = ctx;
    this.currentManifest = null;
  }

  public static getActiveContext(): ArchitectureGenerationContext | null {
    return this.activeContext;
  }

  public static getCurrentManifest(): ArchitectureManifest | null {
    return this.currentManifest;
  }

  /**
   * Converts ArchitectureManifest into RackSlicer RequirementSpec.
   */
  private static manifestToRequirementSpec(manifest: ArchitectureManifest): RequirementSpec {
    const computeCount = manifest.compute.reduce((sum, c) => sum + c.qty, 0);
    const primaryStorage = manifest.storage.find((s) => s.storageType.includes('SAN')) || manifest.storage[0];

    const known: Record<string, string | number> = {
      'Request ID': manifest.requestId,
      'Action Mode': manifest.action,
      'Environment': manifest.request.environment,
      'Hypervisor Platform': manifest.virtualization.platform,
      'Compute Nodes': `${computeCount} Nodes (${manifest.compute.map((c) => c.brandModel).join(', ')})`,
      'Primary Storage': primaryStorage ? `${primaryStorage.storageType} (${primaryStorage.usableCapacityTb} TB Usable)` : 'Local Storage',
      'Network Fabric': `${manifest.networks.length} Logical Networks (${manifest.networks.map((n) => n.speed).join(', ')})`,
      'HA Policy': manifest.virtualization.haPolicy,
      'Generation Hash': manifest.inputHash,
    };

    return {
      rawPrompt: `[Excel Intent: ${manifest.request.requestName}] ${manifest.request.primaryObjective}`,
      workload: `${manifest.virtualization.platform} ${manifest.request.environment} Cluster`,
      platform: manifest.virtualization.platform,
      rackCount: manifest.request.rackCount || 1,
      nodeCount: computeCount || 3,
      inventory: {
        servers: { count: computeCount, brand: manifest.compute[0]?.brandModel },
        san: primaryStorage ? { count: 1 } : undefined,
        switches: { count: 2 },
        firewalls: { count: manifest.security.length },
        ups: { count: 1 },
      },
      requestedNetworks: manifest.networks.map((n) => `${n.name} (VLAN ${n.vlanId || 'Auto'})`),
      userConstraints: manifest.request.specialConstraints ? [manifest.request.specialConstraints] : [],
      limitationReport: manifest.conflicts.map((c) => ({
        id: c.id,
        category: 'Network',
        title: `Requirement Conflict: ${c.sourceSheetA} vs ${c.sourceSheetB}`,
        hardwareGiven: `${c.fieldA} (${c.valueA}) vs ${c.fieldB} (${c.valueB})`,
        status: 'WARN_CHASSIS',
        limitationText: c.description,
        recommendationToFix: 'Resolve conflicting values in input Excel workbook before final deployment.',
      })),
      ramGbPerNode: manifest.compute[0]?.ramGbPerNode || 256,
      storageType: primaryStorage?.storageType || 'SAN iSCSI',
      usableStorageTb: primaryStorage?.usableCapacityTb || 50,
      networkFabric: '25GbE Redundant',
      availability: manifest.virtualization.haPolicy === 'None' ? 'Standard' : 'High Availability (N+1)',
      powerFeed: 'A/B Redundant',
      growthHeadroomPercent: manifest.virtualization.clusterHeadroomPercent || 25,
      deploymentTarget: 'Primary DC',
      isComplete: true,
      known,
      unknown: manifest.missingRequirements,
      assumptions: manifest.assumptions.map((text, idx) => ({
        id: `asm_excel_${idx}`,
        text,
        enabled: true,
        category: 'capacity',
      })),
      clarifications: [],
    };
  }

  /**
   * Converts ArchitectureManifest into deterministic Canvas DesignChangeItems.
   */
  private static manifestToDesignChanges(manifest: ArchitectureManifest): DesignChangeItem[] {
    const changes: DesignChangeItem[] = [];
    const rackId = 'rack-ai-01';
    const totalU = manifest.physical.totalU || 42;

    // 1. Create Rack
    changes.push({
      action: 'create_rack',
      rackId,
      name: manifest.physical.cabinetName || 'DC01-CAB-01',
      units: totalU,
      details: {
        x: 100,
        y: 80,
        leftCableManagerWidth: manifest.physical.leftCableManagerWidth || '4-inch',
        rightCableManagerWidth: manifest.physical.rightCableManagerWidth || '4-inch',
        leftPduId: 'ai-pdu-left-r1',
        rightPduId: 'ai-pdu-right-r1',
      },
    });

    // Vertical PDUs
    changes.push({
      action: 'add_equipment',
      rackId,
      deviceId: 'ai-pdu-left-r1',
      libraryItemId: manifest.physical.leftPduTemplate || 'vpdu-apc-ap8858',
      name: 'Feed A Vertical PDU',
      position: 0,
      details: { sideMountPosition: 'left' },
    });
    changes.push({
      action: 'add_equipment',
      rackId,
      deviceId: 'ai-pdu-right-r1',
      libraryItemId: manifest.physical.rightPduTemplate || 'vpdu-apc-ap8858',
      name: 'Feed B Vertical PDU',
      position: 0,
      details: { sideMountPosition: 'right' },
    });

    // 2. Switches at top (U42 & U41)
    changes.push({
      action: 'add_equipment',
      rackId,
      deviceId: 'excel-sw-01',
      libraryItemId: 'sw-1u-tor-25g-100g',
      position: totalU,
      units: 1,
      name: 'ToR Switch 1 (Primary Fabric A)',
    });
    changes.push({
      action: 'add_equipment',
      rackId,
      deviceId: 'excel-sw-02',
      libraryItemId: 'sw-1u-tor-25g-100g',
      position: totalU - 1,
      units: 1,
      name: 'ToR Switch 2 (Redundant Fabric B)',
    });

    // 3. Compute Nodes
    let currentU = totalU - 6;
    manifest.compute.forEach((cmp) => {
      for (let i = 0; i < cmp.qty; i++) {
        const devId = `excel-srv-${cmp.id}-${i + 1}`;
        changes.push({
          action: 'add_equipment',
          rackId,
          deviceId: devId,
          libraryItemId: cmp.uHeight === 4 ? 'server-4u-ai-gpu' : 'server-2u-enterprise',
          position: currentU,
          units: cmp.uHeight,
          name: `${cmp.brandModel} Node ${i + 1}`,
        });

        // Add Cables for Compute Node (Traceability: 02_Compute!SRV-01)
        changes.push({
          action: 'create_cable',
          source: `${devId}-port-0`,
          target: `excel-sw-01-port-${i}`,
          cableType: 'dac-twinax',
          color: '#10b981',
          name: `Node ${i + 1} ⟶ ToR Switch 1 (iSCSI Fabric A) [Req: 07_Cabling!CAB-01]`,
          details: { sidePreference: 'left' },
        });
        changes.push({
          action: 'create_cable',
          source: `${devId}-port-1`,
          target: `excel-sw-02-port-${i}`,
          cableType: 'dac-twinax',
          color: '#10b981',
          name: `Node ${i + 1} ⟶ ToR Switch 2 (iSCSI Fabric B) [Req: 07_Cabling!CAB-01]`,
          details: { sidePreference: 'right' },
        });
        changes.push({
          action: 'create_cable',
          source: `${devId}-port-2`,
          target: `excel-sw-01-port-${24 + i}`,
          cableType: 'cat6',
          color: '#ef4444',
          name: `Node ${i + 1} iDRAC ⟶ ToR Switch 1 Port ${25 + i} [Req: 07_Cabling!CAB-02]`,
          details: { sidePreference: 'left' },
        });

        currentU -= cmp.uHeight;
      }
    });

    // 4. Storage Arrays
    manifest.storage.forEach((stg) => {
      const isNas = stg.storageType.includes('NAS');
      const devId = `excel-stg-${stg.id}`;
      const pos = isNas ? 4 : 27;
      changes.push({
        action: 'add_equipment',
        rackId,
        deviceId: devId,
        libraryItemId: isNas ? 'nas-2u-backup-target' : 'storage-2u-allflash-nvme',
        position: pos,
        units: 3,
        name: isNas ? 'NAS Backup Target (100TB)' : 'Dell PowerVault SAN Storage Array',
      });
    });

    // 5. UPS at U1
    changes.push({
      action: 'add_equipment',
      rackId,
      deviceId: 'excel-ups-01',
      libraryItemId: 'ups-3u-apc-rt',
      position: 1,
      units: 3,
      name: 'APC Smart-UPS RT 3000VA Battery Backup',
    });

    return changes;
  }

  /**
   * Generates a downloadable JSON / Excel-compatible template string for the 12-sheet structure.
   */
  public static exportTemplateJson(): string {
    const template = ExcelArchitectureParser.createDefaultWorkbookTemplate();
    return JSON.stringify(template, null, 2);
  }
}
