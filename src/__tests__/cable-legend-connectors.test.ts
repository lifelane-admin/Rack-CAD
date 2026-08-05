import { describe, it, expect } from 'vitest';
import { classifyCableConnector } from '../renderers/cable-renderer';
import { appendExportSummaryOverlay } from '../renderers/export-summary-overlay';
import { computeRackSummary } from '../utils/rack-summary';
import type { RackData, DeviceData, CableData, LegendItem } from '../core/types';

/**
 * Cable Types legend rows must visually match how each cable type actually terminates on the
 * canvas: every row's connector icon (IEC power plug / RJ45 jack / fiber LC-SC / SFP+/QSFP28
 * cage) is drawn via cable-renderer.ts's own createConnector() — the exact same function real
 * cable ends use — never a separately-maintained legend-only icon. Power rows additionally get
 * the dashed line cable-renderer.ts draws power cables with. Every row's swatch — icon plus
 * line — spans the same total length regardless of type.
 */
const SVG_NS = 'http://www.w3.org/2000/svg';

describe('classifyCableConnector', () => {
  it('classifies power types (including IEC C13/C19) as isPower', () => {
    expect(classifyCableConnector('power')).toMatchObject({ isPower: true, isFiber: false, isSFP: false });
    expect(classifyCableConnector('power-redundant')).toMatchObject({ isPower: true });
    expect(classifyCableConnector('c13-power')).toMatchObject({ isPower: true });
    expect(classifyCableConnector('c19-power')).toMatchObject({ isPower: true });
  });

  it('classifies copper Ethernet types (cat6/cat6a/cat8) as neither power, fiber, nor SFP — the plain RJ45 fallback', () => {
    ['cat6', 'cat6a', 'cat8', 'general', 'idrac', 'vm-network', 'console'].forEach(t => {
      expect(classifyCableConnector(t)).toEqual({ isPower: false, isFiber: false, isSFP: false });
    });
  });

  it('classifies OM4/OM5 as fiber', () => {
    expect(classifyCableConnector('om4')).toMatchObject({ isFiber: true, isPower: false, isSFP: false });
    expect(classifyCableConnector('om5')).toMatchObject({ isFiber: true });
  });

  it('classifies DAC/QSFP28 as SFP-family', () => {
    expect(classifyCableConnector('dac-twinax')).toMatchObject({ isSFP: true, isFiber: false, isPower: false });
    expect(classifyCableConnector('qsfp28')).toMatchObject({ isSFP: true });
  });
});

describe('Cable Types legend rendering — matches canvas cable styling', () => {
  const rack: RackData = { id: 'r1', name: 'Rack 1', units: 42, x: 0, y: 0 };
  const devices: DeviceData[] = [
    {
      id: 'd1', templateId: 'server-1u', rackId: 'r1', startUnit: 1, name: 'Server', hostname: '',
      managementIp: '', serialNumber: '', description: '',
      ports: [
        { id: 'd1-p1', deviceId: 'd1', name: 'P1', type: 'rj45', relativeX: 0, relativeY: 0, connected: true, cableId: 'c1' },
        { id: 'd1-p2', deviceId: 'd1', name: 'P2', type: 'power', relativeX: 10, relativeY: 0, connected: true, cableId: 'c2' },
      ],
    } as DeviceData,
    {
      id: 'd2', templateId: 'server-1u', rackId: 'r1', startUnit: 3, name: 'Server2', hostname: '',
      managementIp: '', serialNumber: '', description: '',
      ports: [
        { id: 'd2-p1', deviceId: 'd2', name: 'P1', type: 'rj45', relativeX: 0, relativeY: 0, connected: true, cableId: 'c1' },
        { id: 'd2-p2', deviceId: 'd2', name: 'P2', type: 'power', relativeX: 10, relativeY: 0, connected: true, cableId: 'c2' },
      ],
    } as DeviceData,
  ];
  const cables: CableData[] = [
    {
      id: 'c1', name: 'Cable 1', type: 'cat6', color: '#1e88e5', sourcePortId: 'd1-p1', destPortId: 'd2-p1',
      bendPoints: [], thickness: 2, bendRadius: 10, bundleId: null, notes: '', anchorPoints: [], anchorsLocked: false,
    },
    {
      id: 'c2', name: 'Cable 2', type: 'power', color: '#212529', sourcePortId: 'd1-p2', destPortId: 'd2-p2',
      bendPoints: [], thickness: 2, bendRadius: 10, bundleId: null, notes: '', anchorPoints: [], anchorsLocked: false,
      powerCableType: 'power',
    },
  ];

  function renderLegend(customLegend?: LegendItem[]) {
    const vpGroup = document.createElementNS(SVG_NS, 'g') as SVGGElement;
    appendExportSummaryOverlay(vpGroup, [rack], devices, cables, customLegend);
    return vpGroup;
  }

  it('draws the power cable type row with a dashed line — matches cable-renderer.ts\'s stroke-dasharray, not flat', () => {
    const vpGroup = renderLegend();
    const lines = Array.from(vpGroup.querySelectorAll('line'));
    // One line per cable-type row (2 types: cat6, power); the underlying "card divider" line
    // (drawCard) is also a <line> but has no stroke matching a cable color — filter to the
    // thicker cable-swatch lines by stroke-width. The RJ45 connector icon's own T568B wire
    // graphics also include thin internal <line> elements, but those are stroke-width < 1.
    const swatchLines = lines.filter(l => Number(l.getAttribute('stroke-width')) >= 3);
    expect(swatchLines.length).toBe(2);

    const powerLine = swatchLines.find(l => l.getAttribute('stroke') === '#212529');
    const dataLine = swatchLines.find(l => l.getAttribute('stroke') === '#1e88e5');
    expect(powerLine).toBeTruthy();
    expect(dataLine).toBeTruthy();
    expect(powerLine!.getAttribute('stroke-dasharray')).toBe('6 3');
    expect(dataLine!.getAttribute('stroke-dasharray')).toBeNull();

    // Uniform length: both cables (icon to line-end) are the same nominal length. Power's own
    // x1 sits a few px further right than data's — a deliberate small pull-back so the line's
    // round stroke-linecap (a filled semicircle at its start) doesn't sit on top of and
    // half-cover the IEC connector's copper pins — and its x2 extends the same few px further
    // right to compensate, so the two lines are still exactly the same length as each other,
    // just shifted, rather than the power one reading shorter.
    const span = (l: SVGLineElement) => Number(l.getAttribute('x2')) - Number(l.getAttribute('x1'));
    expect(span(powerLine!)).toBeCloseTo(span(dataLine!));
  });

  it('appends a real connector icon (extra child elements) for each typed row, reusing cable-renderer.ts\'s createConnector', () => {
    const summary = computeRackSummary(rack, devices, cables);
    expect(summary.cableTypeRows.every(r => r.type !== null)).toBe(true);

    const vpGroup = renderLegend();
    const overlayGroup = vpGroup.querySelector('.export-summary-overlay')!;
    // A connector icon (createEthernetConnector/createPowerConnector) is itself a <g> with
    // several children — presence of extra top-level <g> groups beyond the card chrome
    // confirms icons were actually appended, not just the swatch line + text.
    const nestedGroups = overlayGroup.querySelectorAll(':scope > g');
    expect(nestedGroups.length).toBeGreaterThanOrEqual(2); // one connector icon per row
  });

  it('custom legend entries (no real CableType) get a plain swatch — no connector icon', () => {
    const customLegend: LegendItem[] = [{ id: 'x', label: 'My Custom Type', color: '#ff00ff' }];
    const vpGroup = renderLegend(customLegend);
    const overlayGroup = vpGroup.querySelector('.export-summary-overlay')!;
    const nestedGroups = overlayGroup.querySelectorAll(':scope > g');
    expect(nestedGroups.length).toBe(0); // no per-row connector <g> icons at all
  });
});
