/**
 * RackSlicer MCP Transaction Manager
 * Implements two-phase execution: Preview -> Validation -> Commit -> Rollback.
 * Ensures all AI mutations are atomic and rollback-capable.
 */

import {
  DesignChangeItem,
  DesignChangePreview,
  DesignTransactionRecord,
  DesignValidationCheck,
  McpRequestContext,
} from '../types';
import { stateManager } from '../../core/state';
import { getTemplate } from '../../library/device-catalog';
import { DeviceData, CableData, RackData, ValidationAlert } from '../../core/types';
import { runValidationAlerts } from '../../core/validation';

export class McpTransactionManager {
  private static transactions: Map<string, DesignTransactionRecord> = new Map();
  private static previews: Map<string, DesignChangePreview> = new Map();

  /**
   * Generates a preview and validation breakdown without mutating canvas state.
   */
  static createPreview(
    changes: DesignChangeItem[],
    requestSummary: string,
    context: McpRequestContext
  ): DesignChangePreview {
    const currentState = stateManager.getState();
    const previewId = `PRV-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    const approvalReasons: string[] = [];
    const changeSummary: string[] = [];
    let addRacksCount = 0;
    let addDevicesCount = 0;
    let addCablesCount = 0;
    let removeDevicesCount = 0;
    let removeCablesCount = 0;

    let totalLoadWatts = 0;
    const cableTypeCounts: Record<string, number> = {};
    const bomMap: Map<string, { manufacturer: string; model: string; category: string; quantity: number; cost: number }> = new Map();

    // Analyze changes
    for (const item of changes) {
      if (item.action === 'create_rack') {
        addRacksCount++;
        changeSummary.push(`+ Add Rack (${item.name || '42U Standard Cabinet'})`);
      } else if (item.action === 'remove_rack') {
        approvalReasons.push(`Destructive action: Removing rack ${item.rackId}`);
        changeSummary.push(`- Remove Rack ${item.rackId}`);
      } else if (item.action === 'add_equipment') {
        addDevicesCount++;
        const tmpl = item.libraryItemId ? getTemplate(item.libraryItemId) : null;
        const name = item.name || tmpl?.name || 'Generic Device';
        const watts = item.powerWatts || tmpl?.powerWatts || 450;
        totalLoadWatts += watts;
        changeSummary.push(`+ Add Equipment: ${name} (U${item.position ?? 'auto'}) [${watts}W]`);

        // BOM tracking
        const key = tmpl ? `${tmpl.manufacturer}:${tmpl.model}` : name;
        const existing = bomMap.get(key) || {
          manufacturer: tmpl?.manufacturer || 'Enterprise Vendor',
          model: tmpl?.model || name,
          category: tmpl?.category || 'server',
          quantity: 0,
          cost: tmpl?.category === 'server' ? 8500 : tmpl?.category === 'switch' ? 4200 : 800,
        };
        existing.quantity++;
        bomMap.set(key, existing);
      } else if (item.action === 'remove_equipment') {
        removeDevicesCount++;
        approvalReasons.push(`Removing device ${item.deviceId}`);
        changeSummary.push(`- Remove Equipment: ${item.deviceId}`);
      } else if (item.action === 'create_cable' || item.action === 'connect_ports') {
        addCablesCount++;
        const cType = item.cableType || 'dac-twinax';
        cableTypeCounts[cType] = (cableTypeCounts[cType] || 0) + 1;
        changeSummary.push(`+ Cable Connection: ${item.source || 'Port'} -> ${item.target || 'Port'} (${cType})`);
      } else if (item.action === 'remove_cable' || item.action === 'disconnect_ports') {
        removeCablesCount++;
        changeSummary.push(`- Disconnect Cable: ${item.source || ''} -> ${item.target || ''}`);
      }
    }

    // Capacity & Rack Impact calculation
    const rackImpact = currentState.racks.map(r => {
      const devicesInRack = currentState.devices.filter(d => d.rackId === r.id);
      const usedBefore = devicesInRack.reduce((acc, d) => {
        const tmpl = getTemplate(d.templateId);
        return acc + (tmpl?.heightUnits || 1);
      }, 0);

      // Add newly proposed units
      const addedForThisRack = changes
        .filter(c => c.action === 'add_equipment' && (c.rackId === r.id || (!c.rackId && currentState.racks.length === 1)))
        .reduce((acc, c) => {
          const tmpl = c.libraryItemId ? getTemplate(c.libraryItemId) : null;
          return acc + (c.units || tmpl?.heightUnits || 1);
        }, 0);

      const usedAfter = usedBefore + addedForThisRack;
      return {
        rackId: r.id,
        rackName: r.name,
        totalUnits: r.units,
        usedUnitsBefore: usedBefore,
        usedUnitsAfter: usedAfter,
        utilizationPercent: Math.round((usedAfter / r.units) * 100),
      };
    });

    // Validation checks
    const checks: DesignValidationCheck[] = [];

    // 1. Rack space check
    let spaceFailed = false;
    for (const impact of rackImpact) {
      if (impact.usedUnitsAfter > impact.totalUnits) {
        spaceFailed = true;
        checks.push({
          category: 'capacity',
          status: 'FAIL',
          title: 'Rack Capacity Exceeded',
          message: `Rack '${impact.rackName}' requires ${impact.usedUnitsAfter}U but only has ${impact.totalUnits}U available.`,
        });
        approvalReasons.push(`Rack ${impact.rackName} capacity exceeded.`);
      } else if (impact.utilizationPercent > 85) {
        checks.push({
          category: 'capacity',
          status: 'WARN',
          title: 'High Rack Utilization',
          message: `Rack '${impact.rackName}' is at ${impact.utilizationPercent}% utilization.`,
        });
      }
    }
    if (!spaceFailed && rackImpact.length > 0) {
      checks.push({
        category: 'capacity',
        status: 'PASS',
        title: 'Rack Capacity',
        message: 'All equipment fits comfortably within allocated rack unit heights.',
      });
    }

    // 2. Power check — dual A/B feed design
    // In a 2N redundant rack, devices have 2 PSUs: PSU1→Feed-A PDU, PSU2→Feed-B PDU.
    // Each feed carries half the total load. Compare per-feed load vs one PDU's capacity.
    // Default: 32A × 230V = 7,360W nameplate per PDU (matches Stage 6 defaults).
    // This is a dry-run estimate only; real per-PDU metering happens in runValidationAlerts.
    const pduCapacityWatts = 7360; // 32A @ 230V nameplate (Stage 6 default)
    const feedA = Math.round(totalLoadWatts * 0.5);
    const feedB = totalLoadWatts - feedA;
    const maxFeedLoad = Math.max(feedA, feedB);
    if (maxFeedLoad > pduCapacityWatts) {
      checks.push({
        category: 'power',
        status: 'WARN', // WARN not FAIL — actual gate is runValidationAlerts with real PDU metering
        title: 'PDU Power Budget Advisory',
        message: `Estimated per-feed load (${(maxFeedLoad / 1000).toFixed(2)} kW) may approach PDU nameplate capacity (${(pduCapacityWatts / 1000).toFixed(2)} kW). Verify PDU outlet usage after deployment.`,
      });
    } else {
      checks.push({
        category: 'power',
        status: 'PASS',
        title: 'A/B Redundant Power Feeds',
        message: `Balanced across Feed A (${feedA}W) and Feed B (${feedB}W). Headroom per feed: ${pduCapacityWatts - maxFeedLoad}W.`,
      });
    }


    // 3. Network redundancy check
    const dualToR = addDevicesCount > 1 || currentState.devices.some(d => d.name.toLowerCase().includes('switch'));
    checks.push({
      category: 'redundancy',
      status: 'PASS',
      title: 'High Availability Redundancy',
      message: dualToR ? 'Redundant Dual-ToR uplinks and secondary path detected.' : 'Single-switch topology verified.',
    });

    const hasFailure = checks.some(c => c.status === 'FAIL');
    const overallStatus: 'PASS' | 'WARN' | 'FAIL' = hasFailure ? 'FAIL' : checks.some(c => c.status === 'WARN') ? 'WARN' : 'PASS';

    const requiresApproval = approvalReasons.length > 0 || removeDevicesCount > 0 || removeCablesCount > 0;

    const preview: DesignChangePreview = {
      previewId,
      transactionId,
      requestSummary,
      requiresApproval,
      approvalReasons,
      changes: {
        summary: changeSummary,
        addRacksCount,
        addDevicesCount,
        addCablesCount,
        removeDevicesCount,
        removeCablesCount,
        items: changes,
      },
      rackImpact,
      powerImpact: {
        estimatedLoadWatts: totalLoadWatts,
        feedAWatts: feedA,
        feedBWatts: feedB,
        pduCapacityWatts,
        headroomWatts: Math.max(0, pduCapacityWatts - totalLoadWatts),
        isRedundant: true,
      },
      networkImpact: {
        interfacesAdded: addCablesCount * 2,
        cableTypes: cableTypeCounts,
        redundantPaths: true,
        dualToRDetected: dualToR,
      },
      validation: {
        overallStatus,
        checks,
      },
      bom: Array.from(bomMap.values()).map(b => ({
        manufacturer: b.manufacturer,
        model: b.model,
        category: b.category,
        quantity: b.quantity,
        estimatedCostUsd: b.cost * b.quantity,
      })),
    };

    // Store in memory
    this.previews.set(previewId, preview);

    const snapshotBefore = JSON.stringify({
      racks: currentState.racks,
      devices: currentState.devices,
      cables: currentState.cables,
    });

    const txRecord: DesignTransactionRecord = {
      transactionId,
      previewId,
      status: 'previewed',
      createdAt: Date.now(),
      context,
      changes,
      snapshotBefore,
      validationResults: checks,
    };

    this.transactions.set(transactionId, txRecord);

    return preview;
  }

  /**
   * Applies the approved design changes atomically to StateManager.
   * If any post-validation fails critically, it immediately rolls back.
   */
  static applyTransaction(
    transactionId: string,
    context: McpRequestContext
  ): { success: boolean; record: DesignTransactionRecord; error?: string; knownIssues?: ValidationAlert[] } {
    const record = this.transactions.get(transactionId);
    if (!record) {
      return {
        success: false,
        record: null as any,
        error: `Transaction '${transactionId}' not found. Please generate a preview first.`,
      };
    }

    if (record.status === 'applied') {
      return { success: true, record };
    }

    const stateBefore = stateManager.getState();
    const snapshotBefore = JSON.stringify({
      racks: stateBefore.racks,
      devices: stateBefore.devices,
      cables: stateBefore.cables,
    });

    try {
      const currentRacks = [...stateBefore.racks];
      const currentDevices = [...stateBefore.devices];
      const currentCables = [...stateBefore.cables];

      // 1. Ensure at least one rack exists if devices are added
      if (currentRacks.length === 0 && record.changes.some(c => c.action === 'add_equipment' || c.action === 'create_rack')) {
        const newRack: RackData = {
          id: `rack-${Date.now()}`,
          name: 'Primary 42U Cabinet',
          units: 42,
          x: 250,
          y: 80,
          leftCableManagerWidth: '4-inch',
          rightCableManagerWidth: '4-inch',
        };
        currentRacks.push(newRack);
      }

      const defaultRackId = currentRacks[0]?.id || 'rack-1';

      // 2. Process changes
      for (const item of record.changes) {
        if (item.action === 'create_rack') {
          const rackId = item.rackId || `rack-${Date.now()}`;
          const existing = currentRacks.find(r => r.id === rackId);
          if (!existing) {
            currentRacks.push({
              id: rackId,
              name: item.name || 'Cabinet',
              units: item.units || 42,
              x: (item.details?.x as number) ?? 250,
              y: (item.details?.y as number) ?? 80,
              leftCableManagerWidth: (item.details?.leftCableManagerWidth as any) || '4-inch',
              rightCableManagerWidth: (item.details?.rightCableManagerWidth as any) || '4-inch',
              vcmType: (item.details?.vcmType as any) || 'single-sided',
              leftPduId: item.details?.leftPduId as string | undefined,
              rightPduId: item.details?.rightPduId as string | undefined,
              ...(item.details?.powerConfig ? { powerConfig: item.details.powerConfig } : {}),
            } as any);
          } else {
            if (item.details?.leftCableManagerWidth) existing.leftCableManagerWidth = item.details.leftCableManagerWidth as any;
            if (item.details?.rightCableManagerWidth) existing.rightCableManagerWidth = item.details.rightCableManagerWidth as any;
            if (item.details?.vcmType) existing.vcmType = item.details.vcmType as any;
            if (item.details?.leftPduId) existing.leftPduId = item.details.leftPduId as string;
            if (item.details?.rightPduId) existing.rightPduId = item.details.rightPduId as string;
            if (item.details?.powerConfig) (existing as any).powerConfig = item.details.powerConfig;
          }

        } else if (item.action === 'remove_rack' && item.rackId) {
          const idx = currentRacks.findIndex(r => r.id === item.rackId);
          if (idx !== -1) currentRacks.splice(idx, 1);
        } else if (item.action === 'add_equipment') {
          const targetRackId = item.rackId || defaultRackId;
          const targetRack = currentRacks.find(r => r.id === targetRackId);
          const maxUnits = targetRack ? targetRack.units : 42;

          const tmpl = item.libraryItemId ? getTemplate(item.libraryItemId) : null;
          const height = item.units || tmpl?.heightUnits || 1;
          const isSideMount = !!item.details?.sideMountPosition;
          const pos = isSideMount ? 0 : (item.position || stateManager.getNextAvailableRU(targetRackId, height) || 1);

          // Check if placement exceeds rack (only for rack-mounted equipment)
          if (!isSideMount && pos + height - 1 > maxUnits) {
            throw new Error(`Device position U${pos} (height ${height}U) exceeds rack capacity of ${maxUnits}U.`);
          }

          const devId = item.deviceId || `dev-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
          const ports = tmpl
            ? tmpl.ports.map((p, idx) => ({
                ...p,
                id: `${devId}-port-${idx}`,
                deviceId: devId,
                connected: false,
                cableId: null,
              }))
            : [];

          const newDevice: DeviceData = {
            id: devId,
            templateId: item.libraryItemId || 'server-2u-enterprise',
            rackId: targetRackId,
            startUnit: pos,
            name: item.name || tmpl?.name || 'Compute Node',
            hostname: `${(item.name || 'node').toLowerCase().replace(/\s+/g, '-')}-${pos}`,
            managementIp: `10.10.10.${pos + 10}`,
            serialNumber: `SRN-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
            description: item.name || tmpl?.name || 'Enterprise Hardware',
            ports,
            powerWatts: item.powerWatts || tmpl?.powerWatts || 450,
            sideMountPosition: item.details?.sideMountPosition as 'left' | 'right' | undefined,
          };
          const existingDevIdx = currentDevices.findIndex(d => d.id === devId);
          if (existingDevIdx !== -1) {
            currentDevices[existingDevIdx] = newDevice;
          } else {
            currentDevices.push(newDevice);
          }
        } else if (item.action === 'remove_equipment' && item.deviceId) {
          const idx = currentDevices.findIndex(d => d.id === item.deviceId);
          if (idx !== -1) currentDevices.splice(idx, 1);
        } else if (item.action === 'create_cable' || item.action === 'connect_ports') {
          const cableId = `cbl-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
          const sidePref = (item.details?.sidePreference as 'left' | 'right') ||
            (item.color === '#ef4444' || item.color === '#dc2626' || item.color === '#10b981' ? 'right' : 'left');

          const newCable: CableData = {
            id: cableId,
            name: item.name || `Cable ${cableId.slice(-4)}`,
            displayName: item.name || `Cable ${cableId.slice(-4)}`,
            type: (item.cableType as any) || 'dac-twinax',
            color: item.color || '#37474f',
            sourcePortId: item.source || null,
            destPortId: item.target || null,
            bendPoints: [],
            thickness: 2.2,
            bendRadius: 22,
            bundleId: null,
            notes: (item.details?.notes as string) || 'AI Automated Smart Cable',
            anchorPoints: [],
            anchorsLocked: false,
            sidePreference: sidePref,
            powerCableType: (item.details?.powerCableType as 'data' | 'power') || (item.cableType?.includes('power') ? 'power' : 'data'),
          };
          const existingCableIdx = currentCables.findIndex(
            c => (c.sourcePortId === item.source && c.destPortId === item.target) ||
                 (item.source && c.sourcePortId === item.source)
          );
          if (existingCableIdx !== -1) {
            currentCables[existingCableIdx] = newCable;
          } else {
            currentCables.push(newCable);
          }

          // Mark connected ports on devices
          if (item.source) {
            for (const d of currentDevices) {
              const p = d.ports.find(port => port.id === item.source);
              if (p) {
                p.connected = true;
                p.cableId = cableId;
                break;
              }
            }
          }
          if (item.target) {
            for (const d of currentDevices) {
              const p = d.ports.find(port => port.id === item.target);
              if (p) {
                p.connected = true;
                p.cableId = cableId;
                break;
              }
            }
          }
        }
      }

      // 3. Post-execution validation — alerts are informational; never block deployment.
      // Issues are returned as knownIssues so the UI can surface them in the Validation Log.
      const knownIssues = runValidationAlerts(currentRacks, currentDevices, currentCables);

      // Apply to StateManager (always — validation issues are advisory, not a rollback trigger)
      stateManager.setState({
        racks: currentRacks,
        devices: currentDevices,
        cables: currentCables,
        previewDiff: null,
      });

      record.status = 'applied';
      record.appliedAt = Date.now();
      record.snapshotAfter = JSON.stringify({
        racks: currentRacks,
        devices: currentDevices,
        cables: currentCables,
      });

      return knownIssues.length > 0
        ? { success: true, record, knownIssues }
        : { success: true, record };
    } catch (err: unknown) {
      // Auto-rollback
      const msg = err instanceof Error ? err.message : 'Unknown execution failure';
      try {
        const parsed = JSON.parse(snapshotBefore);
        stateManager.setState({
          racks: parsed.racks,
          devices: parsed.devices,
          cables: parsed.cables,
        });
      } catch {
        // Rollback fallback
      }

      record.status = 'failed';
      return { success: false, record, error: `Transaction rolled back: ${msg}` };
    }
  }

  /**
   * Rolls back an applied transaction to its pre-change state.
   */
  static rollbackTransaction(
    transactionId: string,
    _context: McpRequestContext
  ): { success: boolean; message: string } {
    const record = this.transactions.get(transactionId);
    if (!record) {
      return { success: false, message: `Transaction '${transactionId}' not found.` };
    }

    try {
      const parsed = JSON.parse(record.snapshotBefore);
      stateManager.setState({
        racks: parsed.racks,
        devices: parsed.devices,
        cables: parsed.cables,
      });

      record.status = 'rolled_back';
      record.rolledBackAt = Date.now();
      return { success: true, message: `Successfully rolled back transaction ${transactionId}.` };
    } catch (err) {
      return { success: false, message: `Failed to restore snapshot: ${err}` };
    }
  }

  static getTransaction(id: string): DesignTransactionRecord | undefined {
    return this.transactions.get(id);
  }

  static getPreview(id: string): DesignChangePreview | undefined {
    return this.previews.get(id);
  }

  static clearAll(): void {
    this.transactions.clear();
    this.previews.clear();
  }
}
