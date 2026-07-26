import { DeviceData } from '../core/types';

export function cloneDevice(device: DeviceData): DeviceData {
  const newId = crypto.randomUUID();
  return {
    ...device,
    id: newId,
    hostname: device.hostname + '-copy',
    locked: false,
    ports: device.ports.map(p => ({
      ...p,
      id: crypto.randomUUID(),
      deviceId: newId,
      connected: false,
      cableId: null,
    })),
  };
}
