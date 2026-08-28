import { appendExportSummaryOverlay, getAutoSummaryCardOffset } from '../renderers/export-summary-overlay';
import { RackData, DeviceData, RACK_CONSTANTS } from '../core/types';

const OUTER_W = RACK_CONSTANTS.RACK_OUTER_WIDTH; // 450

function makeVpGroup(): SVGGElement {
  return document.createElementNS('http://www.w3.org/2000/svg', 'g') as unknown as SVGGElement;
}

describe('appendExportSummaryOverlay — card placement must clear the rack\'s own right-side PDU/cable manager', () => {
  it('with no right-side PDU or cable manager, the card sits at OUTER_WIDTH + 20', () => {
    const rack: RackData = { id: 'r1', name: 'Rack 1', units: 42, x: 0, y: 0 };
    const rects = appendExportSummaryOverlay(makeVpGroup(), [rack], [], []);
    expect(rects[0].x).toBe(OUTER_W + 20);
  });

  it('with a right-side vertical PDU mounted, the card starts past the PDU\'s own right edge (no overlap)', () => {
    const rack: RackData = { id: 'r1', name: 'Rack 1', units: 42, x: 0, y: 0, rightPduId: 'pdu1' };
    const pduDevice: DeviceData = {
      id: 'pdu1', templateId: 'vpdu-apc-ap8853', rackId: 'r1', startUnit: 0, name: 'PDU',
      hostname: '', managementIp: '', serialNumber: '', description: '', ports: [],
    };
    const rects = appendExportSummaryOverlay(makeVpGroup(), [rack], [pduDevice], []);
    // vpdu-apc-ap8853 has pduWidth 44; PDU's right edge is OUTER_W + 44 + 4 — card must start after that.
    const pduRightEdge = OUTER_W + 44 + 4;
    expect(rects[0].x).toBeGreaterThan(pduRightEdge);
    expect(rects[0].x).toBe(pduRightEdge + 20);
  });

  it('with a right-side 6-inch cable manager (no PDU), the card clears the duct', () => {
    const rack: RackData = { id: 'r1', name: 'Rack 1', units: 42, x: 0, y: 0, rightCableManagerWidth: '6-inch' };
    const rects = appendExportSummaryOverlay(makeVpGroup(), [rack], [], []);
    // 6-inch duct span is 44 (40 + 4 gutter, per cableManagerSpan).
    expect(rects[0].x).toBe(OUTER_W + 44 + 20);
  });

  it('with BOTH a cable manager and a PDU on the right, the card clears both (this was the reported bug: a fixed +45 offset landed inside a PDU up to 48px wide)', () => {
    const rack: RackData = {
      id: 'r1', name: 'Rack 1', units: 42, x: 0, y: 0,
      rightCableManagerWidth: '6-inch', rightPduId: 'pdu1',
    };
    const pduDevice: DeviceData = {
      id: 'pdu1', templateId: 'vpdu-apc-ap8868', rackId: 'r1', startUnit: 0, name: 'PDU', // pduWidth 48
      hostname: '', managementIp: '', serialNumber: '', description: '', ports: [],
    };
    const rects = appendExportSummaryOverlay(makeVpGroup(), [rack], [pduDevice], []);
    const pduRightEdge = OUTER_W + (48 + 4) + 44; // PDU space, then cable-manager span beyond it
    expect(rects[0].x).toBe(pduRightEdge + 20);
    // The old, fixed offset (OUTER_W + 45) would have landed at 495 — deep inside the PDU/duct.
    expect(rects[0].x).toBeGreaterThan(OUTER_W + 45);
  });

  it('offsets by rack.x for multiple racks, each independently clearing its own right-side PDU', () => {
    const rackA: RackData = { id: 'rA', name: 'Rack A', units: 42, x: 0, y: 0 };
    const rackB: RackData = { id: 'rB', name: 'Rack B', units: 42, x: 1000, y: 0, rightPduId: 'pduB' };
    const pduDevice: DeviceData = {
      id: 'pduB', templateId: 'vpdu-apc-ap8853', rackId: 'rB', startUnit: 0, name: 'PDU',
      hostname: '', managementIp: '', serialNumber: '', description: '', ports: [],
    };
    const rects = appendExportSummaryOverlay(makeVpGroup(), [rackA, rackB], [pduDevice], []);
    expect(rects[0].x).toBe(OUTER_W + 20);
    expect(rects[1].x).toBe(1000 + OUTER_W + (44 + 4) + 20);
  });
});

describe('appendExportSummaryOverlay — manual placement (rack.summaryCardOffset)', () => {
  it('a manually-set offset overrides the automatic position entirely', () => {
    const rack: RackData = { id: 'r1', name: 'Rack 1', units: 42, x: 0, y: 0, summaryCardOffset: { x: 900, y: 300 } };
    const rects = appendExportSummaryOverlay(makeVpGroup(), [rack], [], []);
    expect(rects[0].x).toBe(900);
    expect(rects[0].y).toBe(300);
  });

  it('a manual offset can be placed to the LEFT of the rack (negative x) — full freedom, not clamped', () => {
    const rack: RackData = { id: 'r1', name: 'Rack 1', units: 42, x: 500, y: 0, summaryCardOffset: { x: -300, y: 0 } };
    const rects = appendExportSummaryOverlay(makeVpGroup(), [rack], [], []);
    expect(rects[0].x).toBe(500 - 300);
  });

  it('getAutoSummaryCardOffset matches what appendExportSummaryOverlay uses when no manual offset is set', () => {
    const rack: RackData = { id: 'r1', name: 'Rack 1', units: 42, x: 250, y: 60, rightPduId: 'pdu1' };
    const pduDevice: DeviceData = {
      id: 'pdu1', templateId: 'vpdu-apc-ap8853', rackId: 'r1', startUnit: 0, name: 'PDU',
      hostname: '', managementIp: '', serialNumber: '', description: '', ports: [],
    };
    const auto = getAutoSummaryCardOffset(rack, [pduDevice]);
    const rects = appendExportSummaryOverlay(makeVpGroup(), [rack], [pduDevice], []);
    expect(rects[0].x).toBe(rack.x + auto.x);
    expect(rects[0].y).toBe(rack.y + auto.y);
  });

  it('draggable mode marks the card group with data-rack-id and data-draggable for the live preview drag hit-test', () => {
    const rack: RackData = { id: 'r1', name: 'Rack 1', units: 42, x: 0, y: 0 };
    const vp = makeVpGroup();
    appendExportSummaryOverlay(vp, [rack], [], [], undefined, { draggable: true });
    const group = vp.querySelector('[data-rack-id="r1"]');
    expect(group).toBeTruthy();
    expect(group?.getAttribute('data-draggable')).toBe('true');
  });

  it('non-draggable (real export) mode does NOT add drag markers', () => {
    const rack: RackData = { id: 'r1', name: 'Rack 1', units: 42, x: 0, y: 0 };
    const vp = makeVpGroup();
    appendExportSummaryOverlay(vp, [rack], [], []);
    expect(vp.querySelector('[data-draggable]')).toBeFalsy();
  });
});
