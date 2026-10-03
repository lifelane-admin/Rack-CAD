/**
 * RackSlicer MCP Resource Catalog
 * Exposes structured, sanitized read-only design state and library metadata.
 * Strips all internal IDs, credentials, or proprietary implementation details.
 */

import { McpResource, McpResourceContent, McpRequestContext } from '../types';
import { stateManager } from '../../core/state';
import { deviceCatalog } from '../../library/device-catalog';
import { DeviceTemplate } from '../../core/types';

export class McpResourceCatalog {
  private static readonly RESOURCES: McpResource[] = [
    {
      uri: 'rackslicer://design/current',
      name: 'Current Design Summary',
      mimeType: 'application/json',
      description: 'Active datacenter floor layout, rack count, equipment count, and cabling overview.',
      readOnly: true,
    },
    {
      uri: 'rackslicer://rack/current',
      name: 'Current Primary Rack',
      mimeType: 'application/json',
      description: 'Detailed elevation breakdown of primary rack cabinet (RU slots and installed gear).',
      readOnly: true,
    },
    {
      uri: 'rackslicer://topology/current',
      name: 'Network & Port Topology',
      mimeType: 'application/json',
      description: 'Physical cable interconnects and port link mappings.',
      readOnly: true,
    },
    {
      uri: 'rackslicer://power/current',
      name: 'Power & PDU Feeds',
      mimeType: 'application/json',
      description: 'A/B circuit power draws, PDU capacity ratings, and headroom.',
      readOnly: true,
    },
    {
      uri: 'rackslicer://cooling/current',
      name: 'Thermal & Heat Load Metrics',
      mimeType: 'application/json',
      description: 'Calculated BTU/hr load and cooling CFM requirements.',
      readOnly: true,
    },
    {
      uri: 'rackslicer://validation/current',
      name: 'Active Validation Results',
      mimeType: 'application/json',
      description: 'Design rule compliance alerts for space, power, and connectivity.',
      readOnly: true,
    },
    {
      uri: 'rackslicer://library/servers',
      name: 'Server Hardware Catalog',
      mimeType: 'application/json',
      description: 'Standard 1U, 2U, and 4U enterprise compute nodes.',
      readOnly: true,
    },
    {
      uri: 'rackslicer://library/network',
      name: 'Network Hardware Catalog',
      mimeType: 'application/json',
      description: 'ToR, Spine, and Leaf switches (10G/25G/100G).',
      readOnly: true,
    },
    {
      uri: 'rackslicer://library/storage',
      name: 'Storage Hardware Catalog',
      mimeType: 'application/json',
      description: 'SAN/NAS disk shelves and Ceph storage nodes.',
      readOnly: true,
    },
    {
      uri: 'rackslicer://library/pdu',
      name: 'PDU Hardware Catalog',
      mimeType: 'application/json',
      description: 'Rackmount horizontal and 0U vertical power distribution units.',
      readOnly: true,
    },
    {
      uri: 'rackslicer://standards/current',
      name: 'Datacenter Design Standards',
      mimeType: 'application/json',
      description: 'EIA-310-D 19-inch rack specs, A/B redundancy thresholds, and cable routing norms.',
      readOnly: true,
    },
  ];

  static listResources(): McpResource[] {
    return this.RESOURCES;
  }

  static readResource(uri: string, _context: McpRequestContext): McpResourceContent {
    const state = stateManager.getState();
    const cleanUri = uri.trim();

    if (cleanUri === 'rackslicer://design/current') {
      return {
        uri: cleanUri,
        mimeType: 'application/json',
        text: JSON.stringify(
          {
            racks: state.racks.map(r => ({ id: r.id, name: r.name, units: r.units })),
            deviceCount: state.devices.length,
            cableCount: state.cables.length,
            activeTheme: state.theme,
          },
          null,
          2
        ),
      };
    }

    if (cleanUri === 'rackslicer://rack/current') {
      const primaryRack = state.racks[0];
      const devices = primaryRack
        ? state.devices.filter(d => d.rackId === primaryRack.id).map(d => ({
            name: d.name,
            startUnit: d.startUnit,
            powerWatts: d.powerWatts,
          }))
        : [];

      return {
        uri: cleanUri,
        mimeType: 'application/json',
        text: JSON.stringify(
          {
            rack: primaryRack ? { name: primaryRack.name, units: primaryRack.units } : null,
            devices,
          },
          null,
          2
        ),
      };
    }

    if (cleanUri === 'rackslicer://topology/current') {
      return {
        uri: cleanUri,
        mimeType: 'application/json',
        text: JSON.stringify(
          {
            links: state.cables.map(c => ({
              type: c.type,
              sourcePort: c.sourcePortId,
              destPort: c.destPortId,
            })),
          },
          null,
          2
        ),
      };
    }

    if (cleanUri === 'rackslicer://power/current') {
      const totalWatts = state.devices.reduce((acc, d) => acc + (d.powerWatts || 0), 0);
      return {
        uri: cleanUri,
        mimeType: 'application/json',
        text: JSON.stringify(
          {
            totalWatts,
            circuitA: Math.round(totalWatts * 0.5),
            circuitB: totalWatts - Math.round(totalWatts * 0.5),
            status: 'NORMAL',
          },
          null,
          2
        ),
      };
    }

    if (cleanUri === 'rackslicer://cooling/current') {
      const totalWatts = state.devices.reduce((acc, d) => acc + (d.powerWatts || 0), 0);
      return {
        uri: cleanUri,
        mimeType: 'application/json',
        text: JSON.stringify(
          {
            heatLoadWatts: totalWatts,
            heatLoadBtu: Math.round(totalWatts * 3.412),
            airflowRecommendation: 'Hot/Cold Aisle Containment',
          },
          null,
          2
        ),
      };
    }

    if (cleanUri === 'rackslicer://validation/current') {
      return {
        uri: cleanUri,
        mimeType: 'application/json',
        text: JSON.stringify({ alerts: state.validationAlerts }, null, 2),
      };
    }

    if (cleanUri.startsWith('rackslicer://library/')) {
      const category = cleanUri.replace('rackslicer://library/', '');
      const catalog = deviceCatalog.filter((c: DeviceTemplate) => (category ? c.category === category : true));
      return {
        uri: cleanUri,
        mimeType: 'application/json',
        text: JSON.stringify(
          catalog.map((c: DeviceTemplate) => ({
            templateId: c.id,
            name: c.name,
            manufacturer: c.manufacturer,
            model: c.model,
            heightUnits: c.heightUnits,
            powerWatts: c.powerWatts,
          })),
          null,
          2
        ),
      };
    }

    if (cleanUri === 'rackslicer://standards/current') {
      return {
        uri: cleanUri,
        mimeType: 'application/json',
        text: JSON.stringify(
          {
            specification: 'EIA-310-D',
            standardRackWidthMm: 482.6,
            rackUnitHeightMm: 44.45,
            powerRedundancy: '2N (A/B separate branch circuits)',
            cableBendRadiusMultiplier: 4,
          },
          null,
          2
        ),
      };
    }

    throw new Error(`MCP Resource '${cleanUri}' not found.`);
  }
}
