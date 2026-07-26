import { describe, it, expect } from 'vitest';
import { cloneDevice } from '../utils/clone';
import { DeviceData } from '../core/types';

const baseDevice: DeviceData = {
  id: 'dev-original',
  templateId: 'server-2u',
  rackId: 'rack-1',
  startUnit: 5,
  name: 'My Server',
  hostname: 'server-01',
  managementIp: '10.0.0.1',
  serialNumber: 'ABC123',
  description: 'Test server',
  ports: [
    { id: 'orig-port-1', deviceId: 'dev-original', name: 'NIC 1', type: 'rj45', relativeX: 320, relativeY: 15, connected: true, cableId: 'cable-abc' },
    { id: 'orig-port-2', deviceId: 'dev-original', name: 'NIC 2', type: 'sfp-plus', relativeX: 332, relativeY: 15, connected: false, cableId: null },
  ],
};

describe('cloneDevice', () => {
  it('returns a new object (not the same reference)', () => {
    const clone = cloneDevice(baseDevice);
    expect(clone).not.toBe(baseDevice);
  });

  it('assigns a different device id', () => {
    const clone = cloneDevice(baseDevice);
    expect(clone.id).not.toBe(baseDevice.id);
    expect(clone.id.length).toBeGreaterThan(0);
  });

  it('appends -copy to hostname', () => {
    const clone = cloneDevice(baseDevice);
    expect(clone.hostname).toBe('server-01-copy');
  });

  it('assigns new UUIDs to all ports', () => {
    const clone = cloneDevice(baseDevice);
    expect(clone.ports[0].id).not.toBe(baseDevice.ports[0].id);
    expect(clone.ports[1].id).not.toBe(baseDevice.ports[1].id);
  });

  it('sets port deviceId to the new clone id', () => {
    const clone = cloneDevice(baseDevice);
    clone.ports.forEach(p => expect(p.deviceId).toBe(clone.id));
  });

  it('clears cable connections on all ports', () => {
    const clone = cloneDevice(baseDevice);
    clone.ports.forEach(p => {
      expect(p.connected).toBe(false);
      expect(p.cableId).toBeNull();
    });
  });

  it('copies all non-id fields (templateId, rackId, startUnit, etc.)', () => {
    const clone = cloneDevice(baseDevice);
    expect(clone.templateId).toBe(baseDevice.templateId);
    expect(clone.rackId).toBe(baseDevice.rackId);
    expect(clone.startUnit).toBe(baseDevice.startUnit);
    expect(clone.name).toBe(baseDevice.name);
    expect(clone.description).toBe(baseDevice.description);
  });
});
