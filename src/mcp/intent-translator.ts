/**
 * RackSlicer MCP Natural Language & Intent Translator
 * Bridges user natural language requests and LLM outputs into
 * strictly typed, allowlisted MCP tool operations.
 */

import { DesignChangeItem, McpRequestContext, McpExecutionMode, McpUserRole } from './types';
import { McpGateway } from './gateway';
import { RackDiff } from '../ai/types';

export interface IntentTranslationResult {
  tool: string;
  arguments: Record<string, unknown>;
  description: string;
}

export class McpIntentTranslator {
  /**
   * Parses natural language command into structured MCP tool call.
   */
  static parseNaturalLanguage(query: string): IntentTranslationResult {
    const q = query.trim().toLowerCase();

    // 1. Validation requests
    if (q.includes('validate') || q.includes('check compliance') || q.includes('show me what\'s missing') || q.includes('what is missing')) {
      return {
        tool: 'validate_design',
        arguments: {},
        description: 'Validating entire design rules, rack capacity, power, and connectivity.',
      };
    }

    // 2. Optimization requests
    if (q.includes('optimize') && (q.includes('power') || q.includes('load') || q.includes('electric'))) {
      return {
        tool: 'optimize_power',
        arguments: {},
        description: 'Analyzing power allocation across Circuit A and B feeds.',
      };
    }

    if (q.includes('optimize') && (q.includes('space') || q.includes('cable') || q.includes('thermal') || q.includes('airflow'))) {
      return {
        tool: 'optimize_rack_space',
        arguments: {},
        description: 'Optimizing chassis positions for thermal chimney efficiency and cable reach.',
      };
    }

    // 3. Status and Read requests
    if (q.includes('power status') || q.includes('show power') || q.includes('current power') || q.includes('kw')) {
      return {
        tool: 'get_current_power',
        arguments: {},
        description: 'Retrieving real-time power metrics and circuit headroom.',
      };
    }

    if (q.includes('cooling') || q.includes('heat load') || q.includes('btu') || q.includes('thermal')) {
      return {
        tool: 'get_current_cooling',
        arguments: {},
        description: 'Calculating heat dissipation in BTU/hr and CFM airflow demand.',
      };
    }

    if (q.includes('topology') || q.includes('network diagram') || q.includes('cabling status')) {
      return {
        tool: 'get_current_topology',
        arguments: {},
        description: 'Retrieving physical interconnect topology and port mappings.',
      };
    }

    if (q.includes('bom') || q.includes('bill of materials') || q.includes('cost') || q.includes('budget') || q.includes('inventory')) {
      return {
        tool: 'get_bom',
        arguments: {},
        description: 'Compiling Bill of Materials (BOM) hardware inventory and pricing.',
      };
    }

    // 4. Rack Creation
    if (q.includes('create a 42u rack') || q.includes('add 42u rack') || q.includes('new rack') || q.includes('create a rack')) {
      const units = q.includes('48u') ? 48 : q.includes('24u') ? 24 : 42;
      return {
        tool: 'preview_design_changes',
        arguments: {
          requestSummary: `Create a ${units}U standard enterprise cabinet`,
          changes: [
            {
              action: 'create_rack',
              name: `Enterprise Cabinet (${units}U)`,
              units,
            },
          ],
        },
        description: `Plan creation of a new ${units}U cabinet.`,
      };
    }

    // 5. Cluster & Multi-node Building
    if (q.includes('proxmox') || q.includes('ceph') || q.includes('3-node') || q.includes('cluster')) {
      return {
        tool: 'preview_design_changes',
        arguments: {
          requestSummary: 'Build 3-Node Proxmox HA Cluster with Ceph Storage and Redundant 25GbE',
          changes: [
            { action: 'add_equipment', libraryItemId: 'rs-sw-32p', position: 42, name: 'ToR Switch A (25GbE)' },
            { action: 'add_equipment', libraryItemId: 'rs-sw-32p', position: 41, name: 'ToR Switch B (25GbE)' },
            { action: 'add_equipment', libraryItemId: 'server-2u', position: 10, name: 'Proxmox Node 1 (Compute/Ceph)', powerWatts: 450 },
            { action: 'add_equipment', libraryItemId: 'server-2u', position: 12, name: 'Proxmox Node 2 (Compute/Ceph)', powerWatts: 450 },
            { action: 'add_equipment', libraryItemId: 'server-2u', position: 14, name: 'Proxmox Node 3 (Compute/Ceph)', powerWatts: 450 },
            { action: 'connect_ports', source: 'Node 1 SFP28-1', target: 'Switch A Port 1', cableType: 'dac-twinax' },
            { action: 'connect_ports', source: 'Node 1 SFP28-2', target: 'Switch B Port 1', cableType: 'dac-twinax' },
            { action: 'connect_ports', source: 'Node 2 SFP28-1', target: 'Switch A Port 2', cableType: 'dac-twinax' },
            { action: 'connect_ports', source: 'Node 2 SFP28-2', target: 'Switch B Port 2', cableType: 'dac-twinax' },
            { action: 'connect_ports', source: 'Node 3 SFP28-1', target: 'Switch A Port 3', cableType: 'dac-twinax' },
            { action: 'connect_ports', source: 'Node 3 SFP28-2', target: 'Switch B Port 3', cableType: 'dac-twinax' },
          ],
        },
        description: 'Generating comprehensive 3-Node Proxmox & Ceph cluster deployment plan.',
      };
    }

    // 6. Dell PowerEdge servers
    if (q.includes('dell') || q.includes('r770') || q.includes('r760') || q.includes('three dell') || q.includes('3 dell')) {
      const count = q.includes('three') || q.includes('3') ? 3 : 2;
      const changes: DesignChangeItem[] = [];
      for (let i = 1; i <= count; i++) {
        changes.push({
          action: 'add_equipment',
          libraryItemId: 'server-2u-enterprise',
          name: `Dell PowerEdge R770 Node ${i}`,
          powerWatts: 550,
          position: i * 2,
        });
      }
      return {
        tool: 'preview_design_changes',
        arguments: {
          requestSummary: `Add ${count}x Dell PowerEdge R770 2U Servers`,
          changes,
        },
        description: `Planning installation of ${count} Dell PowerEdge R770 servers.`,
      };
    }

    // 7. Redundant 25GbE Networking
    if (q.includes('25gbe') || q.includes('connect the servers') || q.includes('redundant networking')) {
      return {
        tool: 'preview_design_changes',
        arguments: {
          requestSummary: 'Connect servers with Dual-ToR redundant 25GbE DAC cables',
          changes: [
            { action: 'create_cable', cableType: 'dac-twinax', color: '#00acc1' },
            { action: 'create_cable', cableType: 'dac-twinax', color: '#d81b60' },
          ],
        },
        description: 'Configuring dual-homed 25GbE connectivity with A/B network redundancy.',
      };
    }

    // 8. Add A/B power
    if (q.includes('a/b power') || q.includes('ab power') || q.includes('dual power') || q.includes('add pdu')) {
      return {
        tool: 'preview_design_changes',
        arguments: {
          requestSummary: 'Equip rack with dual 30A A/B redundant zero-U PDUs',
          changes: [
            { action: 'add_pdu', name: 'Vertical PDU Feed A (Left)', details: { circuit: 'A', rating: '30A' } },
            { action: 'add_pdu', name: 'Vertical PDU Feed B (Right)', details: { circuit: 'B', rating: '30A' } },
          ],
        },
        description: 'Allocating A/B power distribution paths.',
      };
    }

    // Default fallback: Search library or get design
    return {
      tool: 'search_library',
      arguments: { query: query.split(' ')[0] || 'server' },
      description: `Searching datacenter library for '${query}'.`,
    };
  }

  /**
   * Converts a traditional RackDiff JSON object (from LLM) into an MCP preview_design_changes call.
   */
  static convertDiffToMcpChanges(diff: RackDiff['diff']): DesignChangeItem[] {
    if (!diff) return [];
    const changes: DesignChangeItem[] = [];

    if (diff.addRacks) {
      for (const r of diff.addRacks) {
        changes.push({
          action: 'create_rack',
          rackId: r.id,
          name: r.name,
          units: r.units,
        });
      }
    }

    if (diff.addDevices) {
      for (const d of diff.addDevices) {
        changes.push({
          action: 'add_equipment',
          deviceId: d.id,
          libraryItemId: d.templateId,
          rackId: d.rackId,
          position: d.startUnit,
          name: d.name,
        });
      }
    }

    if (diff.addCables) {
      for (const c of diff.addCables) {
        changes.push({
          action: 'create_cable',
          source: c.sourcePortId || undefined,
          target: c.destPortId || undefined,
          cableType: c.type,
          color: c.color,
        });
      }
    }

    if (diff.removeDevices) {
      for (const id of diff.removeDevices) {
        changes.push({
          action: 'remove_equipment',
          deviceId: id,
        });
      }
    }

    if (diff.removeCables) {
      for (const id of diff.removeCables) {
        changes.push({
          action: 'remove_cable',
          deviceId: id,
        });
      }
    }

    return changes;
  }

  /**
   * Dispatches a natural language request through the MCP Gateway.
   */
  static async executeNaturalLanguage(
    query: string,
    role: McpUserRole = 'designer',
    mode: McpExecutionMode = 'assisted',
    tenantId = 'tenant-primary',
    userId = 'admin-user'
  ) {
    const parsed = this.parseNaturalLanguage(query);
    const context: McpRequestContext = {
      requestId: `REQ-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      tenantId,
      userId,
      role,
      executionMode: mode,
      timestamp: Date.now(),
    };

    const response = await McpGateway.handleToolCall({
      tool: parsed.tool,
      arguments: parsed.arguments,
      context,
    });

    return {
      parsed,
      response,
    };
  }
}
