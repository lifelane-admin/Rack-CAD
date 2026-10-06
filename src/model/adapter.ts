/**
 * Migration & Synchronization Adapter
 * Connects the legacy AppState (RackData, DeviceData, CableData) with the canonical
 * Physical Infrastructure Model without breaking existing 2D/3D renderers or saved projects.
 */

import { AppState, RackData, DeviceData, CableData, PortData } from '../core/types';
import { getTemplate } from '../library/device-catalog';
import {
  PhysicalRack,
  PhysicalObject,
  PhysicalPort,
  PhysicalCable,
  PhysicalPower,
  PhysicalModelSnapshot,
  ObjectCategory,
  PortSpeed,
  ConnectorType,
} from './types';
import { PhysicalInfrastructureModel, physicalInfrastructureModel } from './physical-model';

export class ModelMigrationAdapter {
  /**
   * Converts existing AppState into a canonical Physical Infrastructure Model snapshot.
   */
  static fromAppState(appState: AppState): PhysicalModelSnapshot {
    const racks: PhysicalRack[] = (appState.racks || []).map(r => ({
      rackId: r.id,
      rackName: r.name,
      rackSizeU: r.units,
      rackWidth: r.rackWidth === '23-inch' ? 800 : 600,
      rackDepth: r.depthMm ?? 1070,
      rackHeight: r.units * 44.45 + 150,
      rackPositionX: r.x,
      rackPositionY: r.y,
      rackPositionZ: 0,
      weightCapacity: 1200,
      powerCapacity: r.pduCapacityWatts ? r.pduCapacityWatts * 2 : 7400,
      coolingCapacity: 25000,
      usedU: 0,
      freeU: r.units,
      reservedU: 0,
      blockedU: 0,
      powerConsumed: 0,
      weightConsumed: 0,
      failureDomain: r.id.includes('rack-2') || r.id.includes('rack-b') ? 'Rack B' : 'Rack A',
      frontOrientation: 'North',
      rearOrientation: 'South',
      notes: r.rackType,
    }));

    const objects: PhysicalObject[] = [];
    const ports: PhysicalPort[] = [];
    const cables: PhysicalCable[] = [];
    const power: PhysicalPower[] = [];

    // Map devices to PhysicalObjects
    for (const d of appState.devices || []) {
      const tmpl = getTemplate(d.templateId);
      const heightU = tmpl ? tmpl.heightUnits : 1;
      const category: ObjectCategory = this.mapCategory(tmpl?.category || 'compute');

      const obj: PhysicalObject = {
        objectId: d.id,
        objectName: d.name || tmpl?.name || d.id,
        category,
        subCategory: tmpl?.name || 'Standard Equipment',
        manufacturer: tmpl?.manufacturer || 'Standard OEM',
        model: tmpl?.model || tmpl?.name || 'Enterprise Chassis',
        serialNumber: d.serialNumber || `SN-${d.id.toUpperCase()}`,
        rackId: d.rackId,
        uStart: d.startUnit,
        uEnd: d.startUnit + heightU - 1,
        heightU,
        width: 482.6,
        depth: d.device3D?.depth ?? tmpl?.default3D?.depth ?? 750,
        height: heightU * 44.45,
        weight: heightU * 12.5, // approx kg
        positionX: 0,
        positionY: 0,
        positionZ: 0,
        rotation: 0,
        powerWatts: d.powerWatts ?? tmpl?.powerWatts ?? 450,
        powerVA: Math.round((d.powerWatts ?? tmpl?.powerWatts ?? 450) * 1.08),
        psuCount: category === 'compute' ? 2 : 1,
        psuRedundancy: category === 'compute' ? '1+1' : 'None',
        airflowDirection: 'Front-to-Back',
        frontRearOrientation: 'Front',
        status: 'Active',
        notes: d.description,
      };

      // Check HA Pair heuristic
      if (d.name.toLowerCase().includes('hv-node1') || d.name.toLowerCase().includes('server-a')) {
        const peer = appState.devices.find(
          x => x.name.toLowerCase().includes('hv-node2') || x.name.toLowerCase().includes('server-b')
        );
        if (peer) obj.haPairId = peer.id;
      }

      objects.push(obj);

      // Map Ports
      for (const p of d.ports || []) {
        let label = p.name;
        if (!label || label.trim() === '' || label === p.id) {
          if (p.id.includes('-ear-left-nic')) {
            const m = /-ear-left-nic(\d+)$/.exec(p.id);
            label = m ? `Left Ear NIC ${m[1]}` : 'Left Ear NIC';
          } else if (p.id.includes('-ear-right-nic')) {
            const m = /-ear-right-nic(\d+)$/.exec(p.id);
            label = m ? `Right Ear NIC ${m[1]}` : 'Right Ear NIC';
          } else if (p.id.includes('-ear-right-mgmt') || p.id.includes('-mgmt')) {
            label = 'Right Ear Mgmt (iDRAC)';
          } else if (p.id.includes('-port-')) {
            const m = /-port-(\d+)$/.exec(p.id);
            label = m ? `Port ${parseInt(m[1], 10) + 1}` : 'Port';
          } else {
            label = p.type ? `${p.type.toUpperCase()} Port` : 'Port';
          }
        }

        const portObj: PhysicalPort = {
          portId: p.id,
          objectId: d.id,
          portGroup: p.group || (p.type === 'management' ? 'Management' : p.type === 'power' ? 'Power' : 'Data'),
          portType: p.type,
          speed: this.mapSpeed(p.speed, p.type),
          connector: this.mapConnector(p.type),
          physicalPosition: { x: p.relativeX, y: p.relativeY, side: 'front' },
          label,
          purpose: p.description || label,
          status: p.connected ? 'Connected' : 'Available',
        };
        ports.push(portObj);
      }
    }

    // Map Cables
    for (const c of appState.cables || []) {
      let srcPort = ports.find(p => p.portId === c.sourcePortId);
      let destPort = ports.find(p => p.portId === c.destPortId);

      // Resolve synthetic PDU outlet for sourcePortId if not registered
      if (!srcPort && c.sourcePortId?.startsWith('outlet-')) {
        const match = /^outlet-(.+)-(\d+)$/.exec(c.sourcePortId);
        if (match) {
          const pduId = match[1];
          const outletNum = parseInt(match[2], 10) + 1;
          const pduObj = objects.find(o => o.objectId === pduId || o.objectId.includes(pduId) || (pduId.includes('left') && o.objectName.toLowerCase().includes('left')) || (pduId.includes('right') && o.objectName.toLowerCase().includes('right')));
          srcPort = {
            portId: c.sourcePortId,
            objectId: pduObj ? pduObj.objectId : pduId,
            portGroup: 'Power',
            portType: 'power',
            speed: 'Power',
            connector: 'C13',
            physicalPosition: { x: 0, y: 0, side: 'front' },
            label: `Outlet ${outletNum} (C13)`,
            purpose: 'Power Outlet',
            status: 'Connected',
          };
          ports.push(srcPort);
        }
      }

      // Resolve synthetic PDU outlet for destPortId if not registered
      if (!destPort && c.destPortId?.startsWith('outlet-')) {
        const match = /^outlet-(.+)-(\d+)$/.exec(c.destPortId);
        if (match) {
          const pduId = match[1];
          const outletNum = parseInt(match[2], 10) + 1;
          const pduObj = objects.find(o => o.objectId === pduId || o.objectId.includes(pduId) || (pduId.includes('left') && o.objectName.toLowerCase().includes('left')) || (pduId.includes('right') && o.objectName.toLowerCase().includes('right')));
          destPort = {
            portId: c.destPortId,
            objectId: pduObj ? pduObj.objectId : pduId,
            portGroup: 'Power',
            portType: 'power',
            speed: 'Power',
            connector: 'C13',
            physicalPosition: { x: 0, y: 0, side: 'front' },
            label: `Outlet ${outletNum} (C13)`,
            purpose: 'Power Outlet',
            status: 'Connected',
          };
          ports.push(destPort);
        }
      }

      const srcObj = srcPort ? objects.find(o => o.objectId === srcPort.objectId) : null;
      const destObj = destPort ? objects.find(o => o.objectId === destPort.objectId) : null;

      const cable: PhysicalCable = {
        cableId: c.id,
        sourceObject: srcObj?.objectId || (srcPort ? srcPort.objectId : ''),
        sourcePort: c.sourcePortId || '',
        destinationObject: destObj?.objectId || (destPort ? destPort.objectId : ''),
        destinationPort: c.destPortId || '',
        media: c.type === 'power' ? 'Power' : c.type.includes('om') || c.type.includes('fiber') ? 'Fiber' : c.type.includes('dac') ? 'DAC' : 'Copper',
        speed: c.type.includes('qsfp') ? '100GbE' : c.type.includes('sfp28') ? '25GbE' : '10GbE',
        connectorA: srcPort?.connector || 'RJ45',
        connectorB: destPort?.connector || (c.type === 'power' ? 'C13' : 'RJ45'),
        length: c.length ?? 2.5,
        color: c.color || '#3b82f6',
        primaryRoute: c.sidePreference === 'right' ? 'Right VCM' : 'Left VCM',
        rackA: srcObj?.rackId || '',
        rackB: destObj?.rackId || srcObj?.rackId || '',
        purpose: c.type === 'idrac' ? 'Management' : c.type === 'vm-network' ? 'Production' : c.type === 'power' ? 'Power' : 'Production',
        vlan: c.vlan,
        vlanMode: c.vlanMode,
        portGroup: c.portGroup,
        networkRole: c.networkRole,
        status: 'connected',
      };
      cables.push(cable);

      // Power Mappings
      if (c.type === 'power' && srcObj) {
        power.push({
          powerId: `pwr-${c.id}`,
          objectId: srcObj.objectId,
          psuId: '1',
          psuLabel: 'PSU 1',
          cableId: c.id,
          pduId: destObj?.objectId || (destPort ? destPort.objectId : 'PDU-A'),
          pduSocketId: destPort?.portId || c.destPortId || 'C13-1',
          socketType: 'C13',
          powerFeed: (destObj?.objectName || destObj?.objectId || '').toLowerCase().includes('b') || (destPort?.portId || '').includes('right') ? 'B' : 'A',
          powerWatts: srcObj.powerWatts,
          redundancyStatus: 'redundant',
        });
      }
    }

    return {
      project: {
        projectId: 'proj-imported',
        projectName: 'Active Rack Elevation Infrastructure',
        createdDate: new Date().toISOString(),
        modifiedDate: new Date().toISOString(),
        version: '1.0.0',
        status: 'draft',
      },
      racks,
      objects,
      ports,
      connections: [],
      cables,
      power,
      failureDomains: [
        { domainId: 'FD-A', domainName: 'Power & Cabinet Zone A', type: 'rack', memberObjectIds: [] },
        { domainId: 'FD-B', domainName: 'Power & Cabinet Zone B', type: 'rack', memberObjectIds: [] },
      ],
      proposals: typeof physicalInfrastructureModel !== 'undefined' && physicalInfrastructureModel ? physicalInfrastructureModel.getProposals() : [],
    };
  }

  /**
   * Synchronizes an existing Physical Infrastructure Model back into AppState format
   * so 2D elevation, 3D viewport, and export systems render the identical state.
   */
  static toAppState(model: PhysicalInfrastructureModel, currentState: AppState): Partial<AppState> {
    const racks: RackData[] = model.getRacks().map(pr => {
      const existing = currentState.racks.find(r => r.id === pr.rackId);
      return {
        id: pr.rackId,
        name: pr.rackName,
        units: pr.rackSizeU,
        x: pr.rackPositionX || existing?.x || 250,
        y: pr.rackPositionY || existing?.y || 80,
        rackWidth: pr.rackWidth === 800 ? '23-inch' : '19-inch',
        depthMm: pr.rackDepth,
        leftCableManagerWidth: existing?.leftCableManagerWidth ?? '4-inch',
        rightCableManagerWidth: existing?.rightCableManagerWidth ?? '4-inch',
        pduCapacityWatts: Math.round(pr.powerCapacity / 2),
      };
    });

    const devices: DeviceData[] = model.getObjects().map(obj => {
      const existing = currentState.devices.find(d => d.id === obj.objectId);
      const tmpl = existing?.templateId
        ? getTemplate(existing.templateId)
        : (obj.category === 'network' ? getTemplate('switch-32p') : getTemplate('server-2u-enterprise'));

      const modelPorts = model.getPorts(obj.objectId);
      const ports: PortData[] = modelPorts.map((mp, idx) => ({
        id: mp.portId,
        deviceId: obj.objectId,
        name: mp.label,
        type: (mp.portType as any) || 'rj45',
        relativeX: mp.physicalPosition?.x ?? 50 + idx * 15,
        relativeY: mp.physicalPosition?.y ?? 10,
        speed: mp.speed,
        connected: mp.status === 'Connected',
        cableId: null,
      }));

      return {
        id: obj.objectId,
        templateId: existing?.templateId || (tmpl?.id ?? 'server-2u-enterprise'),
        rackId: obj.rackId,
        startUnit: obj.uStart,
        name: obj.objectName,
        hostname: existing?.hostname || obj.objectName.toLowerCase().replace(/\s+/g, '-'),
        managementIp: existing?.managementIp || '10.0.0.10',
        serialNumber: obj.serialNumber || '',
        description: obj.notes || '',
        ports: ports.length > 0 ? ports : (existing?.ports || []),
        powerWatts: obj.powerWatts,
      };
    });

    const cables: CableData[] = model.getCables().map(c => {
      const existing = currentState.cables.find(cb => cb.id === c.cableId);
      return {
        id: c.cableId,
        name: existing?.name || `Cable ${c.cableId}`,
        type: c.purpose === 'Management' ? 'idrac' : c.media === 'Power' ? 'power' : 'general',
        color: c.color,
        sourcePortId: c.sourcePort,
        destPortId: c.destinationPort,
        bendPoints: existing?.bendPoints || [],
        thickness: existing?.thickness || 2.2,
        bendRadius: existing?.bendRadius || 22,
        bundleId: existing?.bundleId || null,
        notes: c.purpose,
        vlan: c.vlan || existing?.vlan,
        vlanMode: c.vlanMode || existing?.vlanMode,
        portGroup: c.portGroup || existing?.portGroup,
        networkRole: c.networkRole || existing?.networkRole,
        anchorPoints: existing?.anchorPoints || [],
        anchorsLocked: existing?.anchorsLocked || false,
      };
    });

    return {
      racks,
      devices,
      cables,
    };
  }

  private static mapCategory(cat: string): ObjectCategory {
    switch (cat.toLowerCase()) {
      case 'server': return 'compute';
      case 'storage': return 'storage';
      case 'switch':
      case 'patch-panel':
      case 'cable-manager': return 'network';
      case 'router': return 'routing';
      case 'firewall':
      case 'nac':
      case 'ids-ips':
      case 'proxy-waf': return 'security';
      case 'load-balancer': return 'application';
      case 'pdu':
      case 'ups':
      case 'ats': return 'power';
      case 'cooling': return 'cooling';
      case 'console': return 'infrastructure';
      default: return 'compute';
    }
  }

  private static mapSpeed(speed?: string, type?: string): PortSpeed {
    if (speed) {
      if (speed.includes('400')) return '400GbE';
      if (speed.includes('100')) return '100GbE';
      if (speed.includes('40')) return '40GbE';
      if (speed.includes('25')) return '25GbE';
      if (speed.includes('10')) return '10GbE';
      if (speed.includes('1')) return '1GbE';
    }
    if (type === 'qsfp28') return '100GbE';
    if (type === 'sfp28') return '25GbE';
    if (type === 'sfp-plus') return '10GbE';
    if (type === 'management') return 'Management';
    if (type === 'console') return 'Console';
    if (type === 'power') return 'Power';
    return '1GbE';
  }

  private static mapConnector(type: string): ConnectorType {
    switch (type.toLowerCase()) {
      case 'sfp': return 'SFP';
      case 'sfp-plus': return 'SFP+';
      case 'sfp28': return 'SFP28';
      case 'qsfp': return 'QSFP+';
      case 'qsfp28': return 'QSFP28';
      case 'power': return 'C13';
      case 'rj45':
      default: return 'RJ45';
    }
  }
}
