import { AppState } from '../core/types';
import { RackContext } from './types';
import { getTemplate } from '../library/device-catalog';

export function serializeState(state: AppState): RackContext {
  const selectedId = state.selection.length > 0 ? state.selection[0].id : undefined;

  const racks = state.racks.map(rack => {
    const rackDevices = state.devices.filter(d => d.rackId === rack.id);

    const devices = rackDevices.map(device => {
      const template = getTemplate(device.templateId);
      const ruEnd = device.startUnit + (template?.heightUnits ?? 1) - 1;
      return {
        id: device.id,
        type: device.templateId,
        model: device.name,
        ruStart: device.startUnit,
        ruEnd,
        ports: device.ports.map(p => ({
          id: p.id,
          name: p.name,
          type: p.type,
          side: 'front',
          connected: p.connected,
        })),
      };
    });

    const pdus: { side: string; watts: number }[] = [];
    if (rack.showPduLeft) pdus.push({ side: 'left', watts: 7200 });
    if (rack.showPduRight) pdus.push({ side: 'right', watts: 7200 });

    return { id: rack.id, name: rack.name, units: rack.units, devices, pdus };
  });

  const cables = state.cables.map(cable => ({
    id: cable.id,
    type: cable.type,
    color: cable.color,
    fromPort: cable.sourcePortId,
    toPort: cable.destPortId,
    routingMode: state.cableRoutingTrayMode,
    anchors: cable.anchorPoints ?? [],
  }));

  const alerts = state.validationAlerts.map(a => ({
    severity: a.type,
    message: a.message,
    targetId: a.targetId,
  }));

  return { racks, cables, validation: { alerts }, selectedId };
}
