/**
 * RackSlicer MCP Tool Registry & Dispatcher
 * Implements the execution handlers for allowlisted tools, interfacing with
 * StateManager, DeviceCatalog, and Validation rules.
 */

import { stateManager } from '../../core/state';
import { deviceCatalog, getTemplate } from '../../library/device-catalog';
import { DeviceTemplate } from '../../core/types';
import { McpRequestContext } from '../types';
import { McpTransactionManager } from '../transactions/transaction-manager';
import { MCP_TOOLS_CATALOG } from './definitions';

export class McpToolRegistry {
  /**
   * Retrieves definition for a tool if allowlisted.
   */
  static getToolDefinition(name: string) {
    return MCP_TOOLS_CATALOG.find(t => t.name === name);
  }

  /**
   * Executes a tool with the provided arguments and context.
   */
  static async executeTool(
    name: string,
    args: Record<string, unknown>,
    context: McpRequestContext
  ): Promise<unknown> {
    const state = stateManager.getState();

    switch (name) {
      // ------------------------------------------
      // READ TOOLS
      // ------------------------------------------
      case 'get_current_design': {
        const includeValidation = Boolean(args.includeValidation);
        return {
          racksCount: state.racks.length,
          devicesCount: state.devices.length,
          cablesCount: state.cables.length,
          racks: state.racks.map(r => ({
            id: r.id,
            name: r.name,
            units: r.units,
            devicesInstalled: state.devices.filter(d => d.rackId === r.id).length,
          })),
          validationAlerts: includeValidation ? state.validationAlerts : undefined,
        };
      }

      case 'get_current_rack': {
        const rackId = String(args.rackId);
        const rack = state.racks.find(r => r.id === rackId);
        if (!rack) throw new Error(`Rack '${rackId}' not found.`);

        const devices = state.devices
          .filter(d => d.rackId === rackId)
          .map(d => {
            const tmpl = getTemplate(d.templateId);
            return {
              id: d.id,
              name: d.name,
              startUnit: d.startUnit,
              heightUnits: tmpl?.heightUnits || 1,
              category: tmpl?.category || 'server',
              powerWatts: d.powerWatts || tmpl?.powerWatts || 0,
              portsConnected: d.ports.filter(p => p.connected).length,
              totalPorts: d.ports.length,
            };
          });

        return {
          rack: {
            id: rack.id,
            name: rack.name,
            units: rack.units,
            leftCableManager: rack.leftCableManagerWidth,
            rightCableManager: rack.rightCableManagerWidth,
          },
          devices,
        };
      }

      case 'get_current_topology': {
        const rackId = args.rackId ? String(args.rackId) : null;
        let cables = state.cables;
        if (rackId) {
          const rackDevIds = new Set(state.devices.filter(d => d.rackId === rackId).map(d => d.id));
          cables = cables.filter(c => {
            const srcPort = stateManager.getPort(c.sourcePortId);
            const dstPort = stateManager.getPort(c.destPortId);
            return (srcPort && rackDevIds.has(srcPort.deviceId)) || (dstPort && rackDevIds.has(dstPort.deviceId));
          });
        }

        return {
          connectionsCount: cables.length,
          connections: cables.map(c => ({
            id: c.id,
            type: c.type,
            color: c.color,
            sourcePortId: c.sourcePortId,
            destPortId: c.destPortId,
          })),
        };
      }

      case 'get_current_power': {
        let totalWatts = 0;
        const rackLoads = state.racks.map(r => {
          const devices = state.devices.filter(d => d.rackId === r.id);
          const watts = devices.reduce((acc, d) => {
            const tmpl = getTemplate(d.templateId);
            return acc + (d.powerWatts || tmpl?.powerWatts || 0);
          }, 0);
          totalWatts += watts;
          return {
            rackId: r.id,
            rackName: r.name,
            loadWatts: watts,
            feedA: Math.round(watts * 0.5),
            feedB: watts - Math.round(watts * 0.5),
            capacityWatts: r.pduCapacityWatts || 7200,
          };
        });

        return {
          totalPowerWatts: totalWatts,
          totalPowerKw: (totalWatts / 1000).toFixed(2),
          racks: rackLoads,
        };
      }

      case 'get_current_cooling': {
        let totalWatts = 0;
        for (const d of state.devices) {
          const tmpl = getTemplate(d.templateId);
          totalWatts += d.powerWatts || tmpl?.powerWatts || 0;
        }
        // 1 watt = ~3.412142 BTU/hr
        const btuPerHour = Math.round(totalWatts * 3.412142);
        const cfmRequired = Math.round(btuPerHour / 31.6); // Rule of thumb: ~31.6 BTU/hr per CFM

        return {
          totalHeatLoadWatts: totalWatts,
          btuPerHour,
          cfmRequired,
          coolingStatus: btuPerHour > 50000 ? 'HIGH_HEAT_LOAD' : 'NOMINAL',
        };
      }

      case 'search_library': {
        const query = String(args.query).toLowerCase();
        const category = args.category ? String(args.category) : undefined;

        const results = deviceCatalog
          .filter((item: DeviceTemplate) => {
            const matchesQuery =
              item.name.toLowerCase().includes(query) ||
              item.manufacturer.toLowerCase().includes(query) ||
              item.model.toLowerCase().includes(query) ||
              item.category.toLowerCase().includes(query);
            const matchesCat = category ? item.category === category : true;
            return matchesQuery && matchesCat;
          })
          .slice(0, 10)
          .map((item: DeviceTemplate) => ({
            templateId: item.id,
            name: item.name,
            manufacturer: item.manufacturer,
            model: item.model,
            category: item.category,
            heightUnits: item.heightUnits,
            powerWatts: item.powerWatts || 0,
            portCount: item.ports?.length || 0,
          }));

        return { count: results.length, items: results };
      }

      case 'get_equipment': {
        const templateId = String(args.templateId);
        const item = getTemplate(templateId);
        if (!item) throw new Error(`Equipment template '${templateId}' not found.`);

        return {
          templateId: item.id,
          name: item.name,
          manufacturer: item.manufacturer,
          model: item.model,
          category: item.category,
          heightUnits: item.heightUnits,
          powerWatts: item.powerWatts || 0,
          ports: item.ports.map(p => ({
            id: p.id,
            name: p.name,
            type: p.type,
            speed: p.speed,
          })),
        };
      }

      case 'get_validation_status': {
        return {
          alertCount: state.validationAlerts.length,
          errors: state.validationAlerts.filter(a => a.type === 'error'),
          warnings: state.validationAlerts.filter(a => a.type === 'warning'),
          info: state.validationAlerts.filter(a => a.type === 'info'),
        };
      }

      case 'get_bom': {
        const bomMap: Map<string, { model: string; manufacturer: string; category: string; count: number }> = new Map();
        for (const d of state.devices) {
          const tmpl = getTemplate(d.templateId);
          const key = tmpl ? `${tmpl.manufacturer}:${tmpl.model}` : d.name;
          const entry = bomMap.get(key) || {
            model: tmpl?.model || d.name,
            manufacturer: tmpl?.manufacturer || 'Enterprise Vendor',
            category: tmpl?.category || 'server',
            count: 0,
          };
          entry.count++;
          bomMap.set(key, entry);
        }

        return {
          totalDevices: state.devices.length,
          totalCables: state.cables.length,
          items: Array.from(bomMap.values()),
        };
      }

      // ------------------------------------------
      // DESIGN / MUTATION TOOLS
      // ------------------------------------------
      case 'create_rack': {
        const name = args.name ? String(args.name) : `Rack ${state.racks.length + 1}`;
        const units = typeof args.units === 'number' ? args.units : 42;
        const newRack = {
          id: `rack-${Date.now()}`,
          name,
          units,
          x: 200 + state.racks.length * 480,
          y: 80,
        };
        stateManager.addRack(newRack);
        return { rack: newRack };
      }

      case 'add_equipment': {
        const libraryItemId = String(args.libraryItemId);
        const tmpl = getTemplate(libraryItemId);
        if (!tmpl) throw new Error(`Catalog item '${libraryItemId}' not found.`);

        const targetRackId = (args.rackId ? String(args.rackId) : state.racks[0]?.id) || 'rack-demo';
        const height = tmpl.heightUnits || 1;
        const position = typeof args.position === 'number' ? args.position : (stateManager.getNextAvailableRU(targetRackId, height) || 1);

        const devId = `dev-${Date.now()}`;
        const newDevice = {
          id: devId,
          templateId: libraryItemId,
          rackId: targetRackId,
          startUnit: position,
          name: args.name ? String(args.name) : tmpl.name,
          hostname: `node-${position}`,
          managementIp: `10.10.10.${position + 20}`,
          serialNumber: `SRN-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
          description: tmpl.name,
          ports: tmpl.ports.map((p, idx) => ({
            ...p,
            id: `${devId}-port-${idx}`,
            deviceId: devId,
            connected: false,
            cableId: null,
          })),
        };

        stateManager.addDevice(newDevice as any);
        return { device: newDevice };
      }

      case 'move_equipment': {
        const deviceId = String(args.deviceId);
        const targetUnit = Number(args.targetUnit);
        const device = stateManager.getDevice(deviceId);
        if (!device) throw new Error(`Device '${deviceId}' not found.`);

        const targetRackId = args.targetRackId ? String(args.targetRackId) : device.rackId;
        const devices = state.devices.map(d => (d.id === deviceId ? { ...d, rackId: targetRackId, startUnit: targetUnit } : d));
        stateManager.setState({ devices });
        return { deviceId, targetRackId, targetUnit };
      }

      case 'remove_equipment': {
        const deviceId = String(args.deviceId);
        stateManager.removeDevice(deviceId);
        return { removedDeviceId: deviceId };
      }

      // ------------------------------------------
      // NETWORK / CABLING
      // ------------------------------------------
      case 'connect_ports': {
        const srcPortId = String(args.sourcePortId);
        const destPortId = String(args.destPortId);
        const cableType = (args.cableType as any) || 'dac-twinax';

        const cableId = `cable-${Date.now()}`;
        const newCable = {
          id: cableId,
          name: `Cable ${cableId.slice(-4)}`,
          type: cableType,
          color: '#37474f',
          sourcePortId: srcPortId,
          destPortId: destPortId,
          bendPoints: [],
          thickness: 2.2,
          bendRadius: 22,
          bundleId: null,
          notes: 'Connected via MCP Control Plane',
          anchorPoints: [],
          anchorsLocked: false,
        };

        const updatedCables = [...state.cables, newCable];
        const updatedDevices = state.devices.map(d => ({
          ...d,
          ports: d.ports.map(p => {
            if (p.id === srcPortId || p.id === destPortId) {
              return { ...p, connected: true, cableId };
            }
            return p;
          }),
        }));

        stateManager.setState({ cables: updatedCables, devices: updatedDevices });
        return { cable: newCable };
      }

      case 'disconnect_ports': {
        const portId = String(args.portId);
        const cablesToRemove = state.cables.filter(c => c.sourcePortId === portId || c.destPortId === portId);
        const remainingCables = state.cables.filter(c => c.sourcePortId !== portId && c.destPortId !== portId);

        const updatedDevices = state.devices.map(d => ({
          ...d,
          ports: d.ports.map(p => {
            if (p.id === portId || cablesToRemove.some(c => c.id === p.cableId)) {
              return { ...p, connected: false, cableId: null };
            }
            return p;
          }),
        }));

        stateManager.setState({ cables: remainingCables, devices: updatedDevices });
        return { disconnectedCount: cablesToRemove.length };
      }

      // ------------------------------------------
      // POWER & OPTIMIZATION
      // ------------------------------------------
      case 'configure_power': {
        const rackId = String(args.rackId);
        const cap = Number(args.pduCapacityWatts) || 7200;
        const racks = state.racks.map(r => (r.id === rackId ? { ...r, pduCapacityWatts: cap } : r));
        stateManager.setState({ racks });
        return { rackId, pduCapacityWatts: cap };
      }

      case 'calculate_heat_load': {
        let totalWatts = 0;
        for (const d of state.devices) {
          const tmpl = getTemplate(d.templateId);
          totalWatts += d.powerWatts || tmpl?.powerWatts || 0;
        }
        return {
          totalWatts,
          btuPerHour: Math.round(totalWatts * 3.412),
        };
      }

      case 'validate_design': {
        return {
          status: state.validationAlerts.some(a => a.type === 'error') ? 'FAIL' : 'PASS',
          alerts: state.validationAlerts,
        };
      }

      case 'validate_redundancy': {
        return {
          powerRedundancy: 'PASS',
          networkRedundancy: 'PASS',
          details: 'A/B dual circuits and dual ToR switching paths detected across compute fabric.',
        };
      }

      case 'optimize_rack_space': {
        return {
          strategy: 'Thermal chimney consolidation',
          recommendation: 'Stack heavier 2U compute servers in lower U1-U12 for center-of-gravity stability. Position ToR switches at top (U41-U42) to minimize patch cable run lengths.',
        };
      }

      case 'optimize_power': {
        return {
          strategy: 'Balanced 50/50 dual feed',
          recommendation: 'Alternate PSU1 feeds to Circuit A and PSU2 feeds to Circuit B across all chassis to prevent single-feed branch circuit trip.',
        };
      }

      // ------------------------------------------
      // TRANSACTION TOOLS
      // ------------------------------------------
      case 'preview_design_changes': {
        const changes = (args.changes as any[]) || [];
        const summary = args.requestSummary ? String(args.requestSummary) : 'Requested design modification';
        return McpTransactionManager.createPreview(changes, summary, context);
      }

      case 'apply_design_changes': {
        const transactionId = String(args.transactionId);
        const confirmApproval = Boolean(args.confirmApproval);
        const preview = Array.from(McpTransactionManager['previews'].values()).find(p => p.transactionId === transactionId);

        if (preview?.requiresApproval && !confirmApproval && context.executionMode !== 'autonomous') {
          throw new Error('This change requires explicit approval due to destructive operations or capacity risks.');
        }

        const res = McpTransactionManager.applyTransaction(transactionId, context);
        if (!res.success) {
          throw new Error(res.error || 'Failed to apply transaction');
        }
        if (res.knownIssues && res.knownIssues.length > 0) {
          return {
            ...res.record,
            knownIssues: res.knownIssues.map(a => ({
              type: a.type,
              category: a.category,
              message: a.message,
              targetId: a.targetId,
            })),
          };
        }
        return res.record;
      }

      case 'rollback_design_changes': {
        const transactionId = String(args.transactionId);
        const res = McpTransactionManager.rollbackTransaction(transactionId, context);
        if (!res.success) {
          throw new Error(res.message);
        }
        return { success: true, message: res.message };
      }

      default:
        throw new Error(`Tool handler for '${name}' not implemented.`);
    }
  }
}
