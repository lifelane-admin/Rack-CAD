/**
 * RackSlicer MCP Tool Definitions Catalog
 * Defines JSON Schemas, roles, and security flags for all allowable MCP tools.
 */

import { McpToolDefinition } from '../types';

export const MCP_TOOLS_CATALOG: McpToolDefinition[] = [
  // ==========================================
  // READ TOOLS
  // ==========================================
  {
    name: 'get_current_design',
    description: 'Retrieve current datacenter design layout including racks, equipment count, and cabling overview.',
    readOnly: true,
    destructive: false,
    requiresApproval: false,
    minimumRole: 'viewer',
    parameters: {
      type: 'object',
      properties: {
        includeValidation: { type: 'boolean', description: 'Include current validation alerts in response.' },
      },
    },
  },
  {
    name: 'get_current_rack',
    description: 'Retrieve detailed information for a specific rack cabinet (units, occupied slots, devices installed).',
    readOnly: true,
    destructive: false,
    requiresApproval: false,
    minimumRole: 'viewer',
    parameters: {
      type: 'object',
      properties: {
        rackId: { type: 'string', description: 'ID of the rack cabinet.' },
      },
      required: ['rackId'],
    },
  },
  {
    name: 'get_current_topology',
    description: 'Retrieve physical and network interconnection topology between switches, patch panels, and servers.',
    readOnly: true,
    destructive: false,
    requiresApproval: false,
    minimumRole: 'viewer',
    parameters: {
      type: 'object',
      properties: {
        rackId: { type: 'string', description: 'Optional rackId filter.' },
      },
    },
  },
  {
    name: 'get_current_power',
    description: 'Retrieve current power allocation, PDU feeds (A/B), consumption in watts, and circuit headroom.',
    readOnly: true,
    destructive: false,
    requiresApproval: false,
    minimumRole: 'viewer',
    parameters: {
      type: 'object',
      properties: {
        rackId: { type: 'string', description: 'Optional rackId filter.' },
      },
    },
  },
  {
    name: 'get_current_cooling',
    description: 'Retrieve calculated heat load (BTU/hr) and thermal distribution metrics.',
    readOnly: true,
    destructive: false,
    requiresApproval: false,
    minimumRole: 'viewer',
    parameters: {
      type: 'object',
      properties: {
        rackId: { type: 'string', description: 'Optional rackId filter.' },
      },
    },
  },
  {
    name: 'search_library',
    description: 'Search the approved datacenter equipment catalog for servers, switches, PDUs, and patch panels.',
    readOnly: true,
    destructive: false,
    requiresApproval: false,
    minimumRole: 'viewer',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term (e.g. Dell R770, Cisco Nexus, 30A PDU).' },
        category: {
          type: 'string',
          enum: ['server', 'switch', 'storage', 'pdu', 'firewall', 'patch-panel'],
          description: 'Filter by equipment category.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_equipment',
    description: 'Retrieve specifications, port layout, power draw, and physical dimensions of a catalog item.',
    readOnly: true,
    destructive: false,
    requiresApproval: false,
    minimumRole: 'viewer',
    parameters: {
      type: 'object',
      properties: {
        templateId: { type: 'string', description: 'Catalog template identifier.' },
      },
      required: ['templateId'],
    },
  },
  {
    name: 'get_validation_status',
    description: 'Retrieve all real-time validation alerts for rack space, power capacity, cabling, and loop detection.',
    readOnly: true,
    destructive: false,
    requiresApproval: false,
    minimumRole: 'viewer',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_bom',
    description: 'Retrieve Bill of Materials (BOM) summary with counts, models, and estimated budget.',
    readOnly: true,
    destructive: false,
    requiresApproval: false,
    minimumRole: 'viewer',
    parameters: {
      type: 'object',
      properties: {
        rackId: { type: 'string', description: 'Optional rackId filter.' },
      },
    },
  },

  // ==========================================
  // DESIGN / MUTATION TOOLS
  // ==========================================
  {
    name: 'create_rack',
    description: 'Add a new rack cabinet to the datacenter floor design.',
    readOnly: false,
    destructive: false,
    requiresApproval: false,
    minimumRole: 'architect',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the rack (e.g. Rack A1).' },
        units: { type: 'number', description: 'Height in rack units (e.g. 42).' },
      },
    },
  },
  {
    name: 'add_equipment',
    description: 'Install a server, switch, or storage unit into a rack cabinet at a specified RU height.',
    readOnly: false,
    destructive: false,
    requiresApproval: false,
    minimumRole: 'designer',
    parameters: {
      type: 'object',
      properties: {
        rackId: { type: 'string', description: 'Target rack ID.' },
        libraryItemId: { type: 'string', description: 'Template ID from library.' },
        position: { type: 'number', description: 'Start unit RU position.' },
        name: { type: 'string', description: 'Display name override.' },
      },
      required: ['libraryItemId'],
    },
  },
  {
    name: 'move_equipment',
    description: 'Move an installed device to a different rack unit position or cabinet.',
    readOnly: false,
    destructive: false,
    requiresApproval: false,
    minimumRole: 'designer',
    parameters: {
      type: 'object',
      properties: {
        deviceId: { type: 'string', description: 'ID of the device to move.' },
        targetRackId: { type: 'string', description: 'Target rack ID.' },
        targetUnit: { type: 'number', description: 'Target start unit.' },
      },
      required: ['deviceId', 'targetUnit'],
    },
  },
  {
    name: 'remove_equipment',
    description: 'Remove an installed piece of equipment and disconnect its associated cables.',
    readOnly: false,
    destructive: true,
    requiresApproval: true,
    minimumRole: 'architect',
    parameters: {
      type: 'object',
      properties: {
        deviceId: { type: 'string', description: 'Device ID to remove.' },
      },
      required: ['deviceId'],
    },
  },

  // ==========================================
  // NETWORK & CABLING TOOLS
  // ==========================================
  {
    name: 'connect_ports',
    description: 'Create a network or patch cable connection between two physical ports.',
    readOnly: false,
    destructive: false,
    requiresApproval: false,
    minimumRole: 'designer',
    parameters: {
      type: 'object',
      properties: {
        sourcePortId: { type: 'string', description: 'Source port ID.' },
        destPortId: { type: 'string', description: 'Destination port ID.' },
        cableType: { type: 'string', description: 'Cable type (e.g. dac-twinax, cat6a, om4, qsfp28).' },
      },
      required: ['sourcePortId', 'destPortId'],
    },
  },
  {
    name: 'disconnect_ports',
    description: 'Disconnect cables attached to a specified port.',
    readOnly: false,
    destructive: false,
    requiresApproval: false,
    minimumRole: 'designer',
    parameters: {
      type: 'object',
      properties: {
        portId: { type: 'string', description: 'Port ID to disconnect.' },
      },
      required: ['portId'],
    },
  },

  // ==========================================
  // POWER & COOLING
  // ==========================================
  {
    name: 'configure_power',
    description: 'Configure dual A/B feed allocations and circuit limits for a rack.',
    readOnly: false,
    destructive: false,
    requiresApproval: false,
    minimumRole: 'architect',
    parameters: {
      type: 'object',
      properties: {
        rackId: { type: 'string', description: 'Target rack ID.' },
        pduCapacityWatts: { type: 'number', description: 'Max wattage rating per circuit.' },
      },
      required: ['rackId'],
    },
  },
  {
    name: 'calculate_heat_load',
    description: 'Calculate real-time BTU/hr and cooling CFM requirements for current design.',
    readOnly: true,
    destructive: false,
    requiresApproval: false,
    minimumRole: 'viewer',
    parameters: {
      type: 'object',
      properties: {
        rackId: { type: 'string', description: 'Optional rack ID.' },
      },
    },
  },

  // ==========================================
  // VALIDATION TOOLS
  // ==========================================
  {
    name: 'validate_design',
    description: 'Execute full validation suite covering space, power, thermal, and network rules.',
    readOnly: true,
    destructive: false,
    requiresApproval: false,
    minimumRole: 'viewer',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'validate_redundancy',
    description: 'Validate N+1 / 2N power and network path redundancy for all active compute nodes.',
    readOnly: true,
    destructive: false,
    requiresApproval: false,
    minimumRole: 'viewer',
    parameters: {
      type: 'object',
      properties: {},
    },
  },

  // ==========================================
  // OPTIMIZATION TOOLS
  // ==========================================
  {
    name: 'optimize_rack_space',
    description: 'Suggest consolidated layout optimizing thermal chimney airflow and cable management distances.',
    readOnly: true,
    destructive: false,
    requiresApproval: false,
    minimumRole: 'architect',
    parameters: {
      type: 'object',
      properties: {
        rackId: { type: 'string', description: 'Rack ID to optimize.' },
      },
    },
  },
  {
    name: 'optimize_power',
    description: 'Balance loads across Circuit A and Circuit B feeds to prevent breaker trips.',
    readOnly: true,
    destructive: false,
    requiresApproval: false,
    minimumRole: 'architect',
    parameters: {
      type: 'object',
      properties: {
        rackId: { type: 'string', description: 'Target rack ID.' },
      },
    },
  },

  // ==========================================
  // TWO-PHASE TRANSACTION TOOLS
  // ==========================================
  {
    name: 'preview_design_changes',
    description: 'Preview proposed batch modifications, computing capacity, power, and redundancy impact without applying.',
    readOnly: true,
    destructive: false,
    requiresApproval: false,
    minimumRole: 'designer',
    parameters: {
      type: 'object',
      properties: {
        requestSummary: { type: 'string', description: 'Human-readable summary of intent.' },
        changes: {
          type: 'array',
          description: 'Ordered list of proposed design modifications.',
        },
      },
      required: ['changes'],
    },
  },
  {
    name: 'apply_design_changes',
    description: 'Atomically apply an approved set of changes. Validates final state and rolls back automatically if rules fail.',
    readOnly: false,
    destructive: false,
    requiresApproval: true,
    minimumRole: 'designer',
    parameters: {
      type: 'object',
      properties: {
        transactionId: { type: 'string', description: 'Transaction ID generated by preview_design_changes.' },
        confirmApproval: { type: 'boolean', description: 'Explicit user confirmation when destructive changes are present.' },
      },
      required: ['transactionId'],
    },
  },
  {
    name: 'rollback_design_changes',
    description: 'Rollback a committed transaction, immediately reverting canvas state to before the changes.',
    readOnly: false,
    destructive: true,
    requiresApproval: true,
    minimumRole: 'admin',
    parameters: {
      type: 'object',
      properties: {
        transactionId: { type: 'string', description: 'Transaction ID to revert.' },
      },
      required: ['transactionId'],
    },
  },
];
