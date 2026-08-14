import { describe, it, expect } from 'vitest';
import { cloneDevice, cloneCloudConnector } from '../utils/clone';
import { DeviceData, CloudConnector } from '../core/types';

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

const baseConnector: CloudConnector = {
  id: 'conn-original',
  sourceNodeId: 'n1',
  destNodeId: 'n2',
  sourceSide: 'right',
  destSide: 'left',
  label: 'Data Flow',
  style: 'dashed',
  routing: 'orthogonal',
  roundedCorners: true,
  crossbarOffset: 250,
  entryOffset: 60,
  exitOffset: 320,
  entryStubOffset: 55,
  exitStubOffset: 400,
  width: 3,
  startArrow: 'dot',
  endArrow: 'arrow-broad',
  color: '#58a6ff',
};

describe('cloneCloudConnector', () => {
  const from = { x: 100, y: 200 };
  const to = { x: 400, y: 500 };

  it('returns a new object (not the same reference) with a different id', () => {
    const clone = cloneCloudConnector(baseConnector, from, to);
    expect(clone).not.toBe(baseConnector);
    expect(clone.id).not.toBe(baseConnector.id);
  });

  it('detaches both ends from their nodes, offsetting near the original resolved position', () => {
    const clone = cloneCloudConnector(baseConnector, from, to);
    expect(clone.sourceNodeId).toBeNull();
    expect(clone.destNodeId).toBeNull();
    expect(clone.sourcePoint).toEqual({ x: 120, y: 220 });
    expect(clone.destPoint).toEqual({ x: 420, y: 520 });
    expect(clone.sourceSide).toBeUndefined();
    expect(clone.destSide).toBeUndefined();
  });

  it('clears manual route overrides tuned for the original (now-stale) endpoints', () => {
    const clone = cloneCloudConnector(baseConnector, from, to);
    expect(clone.crossbarOffset).toBeUndefined();
    expect(clone.entryOffset).toBeUndefined();
    expect(clone.exitOffset).toBeUndefined();
    expect(clone.entryStubOffset).toBeUndefined();
    expect(clone.exitStubOffset).toBeUndefined();
  });

  it('preserves visual styling (label, style, routing, roundedCorners, width, arrows, color)', () => {
    const clone = cloneCloudConnector(baseConnector, from, to);
    expect(clone.label).toBe('Data Flow');
    expect(clone.style).toBe('dashed');
    expect(clone.routing).toBe('orthogonal');
    expect(clone.roundedCorners).toBe(true);
    expect(clone.width).toBe(3);
    expect(clone.startArrow).toBe('dot');
    expect(clone.endArrow).toBe('arrow-broad');
    expect(clone.color).toBe('#58a6ff');
  });
});
