# Sub-Project C: Structured Export / Design Document
**Date:** 2026-07-26  
**Status:** Approved

---

## Overview

Add a "Export Report" button to the toolbar that opens a modal for project metadata (title, author, revision, design notes), then generates a printable HTML document in a new browser tab. The document contains 7 sections covering all racks, and the browser's native print dialog converts it to PDF.

---

## Goals

- Zero new dependencies (no PDF library)
- Printable HTML opens in a new tab, styled for A4/Letter print
- Covers all racks on the canvas — one rack section per rack
- All 7 sections: Front View, Rear View, Port Mapping Table, Cable Legend, Device Inventory, Design Notes, Power Summary
- Metadata (title, author, notes) entered in a one-shot modal at export time
- Modal fields are NOT persisted in AppState (ephemeral)

---

## UI: Export Modal

**Trigger:** New "Export Report" button in toolbar (document icon), between existing export buttons and AI toggle.

**Modal HTML (injected into `index.html`, styled in `index.css`):**
```html
<div id="export-report-modal" class="hidden">
  <div class="modal-box">
    <h3>Export Design Report</h3>
    <div class="report-field"><label>Project Name</label>
      <input id="rpt-title" type="text" placeholder="Data Centre Rack Design"/></div>
    <div class="report-field"><label>Author</label>
      <input id="rpt-author" type="text" placeholder="Your name"/></div>
    <div class="report-field"><label>Revision</label>
      <input id="rpt-rev" type="text" placeholder="Rev 1.0"/></div>
    <div class="report-field"><label>Design Notes</label>
      <textarea id="rpt-notes" rows="4" placeholder="Deployment notes, change log..."/></div>
    <div class="modal-actions">
      <button id="rpt-cancel">Cancel</button>
      <button id="rpt-generate">Generate Report</button>
    </div>
  </div>
</div>
```

**On Generate:** `buildReport(state, metadata)` → `window.open(...)` with the HTML string.

---

## Report Builder: `src/export/report-builder.ts` (new file)

```typescript
interface ReportMetadata {
  title: string;
  author: string;
  revision: string;
  notes: string;
  generatedAt: string;  // ISO date string
}

export function buildReport(state: AppState, meta: ReportMetadata): string
// Returns a full HTML document string
```

**Document structure:**

```
<html>
  <head> print-optimised CSS </head>
  <body>
    <header>  ← title, author, revision, date, RackCAD watermark
    
    For each rack in state.racks:
      <section class="rack-section">
        <h2>Rack: {rack.name}</h2>
        
        <div class="rack-views">
          <!-- Front view SVG (cloned from rendered canvas) -->
          <!-- Rear view SVG (generated fresh in rear mode) -->
        </div>
        
        <!-- Device Inventory Table -->
        <table class="device-inventory">
          RU | Device | Hostname | IP | Serial | Description
        </table>
        
        <!-- Port Mapping Table -->
        <table class="port-mapping">
          From Device | From Port | To Device | To Port | Cable Type | Color
        </table>
      </section>
    
    <!-- Cable Legend (all cable types used) -->
    <section class="cable-legend">
      color swatch + label per unique CableType in state.cables
    </section>
    
    <!-- Power Summary Table -->
    <section class="power-summary">
      Rack | PDU Count | Capacity (W) | Used (W) | % | Status
    </section>
    
    <!-- Design Notes -->
    <section class="design-notes">
      <pre>{meta.notes}</pre>
    </section>
    
    <footer> page numbers, generated date </footer>
  </body>
</html>
```

---

## SVG Capture Strategy

Do NOT clone from the live canvas — the live canvas has a zoom/pan transform applied that distorts coordinates.

Instead, **fresh-render both views** independently at 1:1 scale:

```typescript
function captureRackSvg(rack: RackData, devices: DeviceData[], state: AppState, viewMode: 'front' | 'rear'): string {
  const mockState = { ...state, cabinetViewMode: viewMode, transform: { x: 0, y: 0, scale: 1 } };
  // temporarily override stateManager for render calls:
  const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const group = renderRack(rack, svgEl, mockState);
  devices.filter(d => d.rackId === rack.id).forEach(d => {
    svgEl.appendChild(renderDevice(d, rack.x, rack.y, rack.units, mockState));
  });
  const W = RACK_CONSTANTS.RACK_OUTER_WIDTH;
  const H = RACK_CONSTANTS.RACK_PADDING_TOP + rack.units * RACK_CONSTANTS.RU_HEIGHT + RACK_CONSTANTS.RACK_PADDING_BOTTOM;
  svgEl.setAttribute('viewBox', `${rack.x} ${rack.y} ${W} ${H}`);
  svgEl.setAttribute('width', '100%');
  return new XMLSerializer().serializeToString(svgEl);
}
```

`renderRack` and `renderDevice` must accept an explicit state parameter (or the mock state is passed as a second argument). If they currently read from `stateManager.getState()` directly, add an optional `stateOverride` parameter to each — checked first before falling back to `stateManager.getState()`.

---

## Section Details

### Device Inventory Table
Columns: `RU Position | Device Name | Hostname | IP | Serial | Description`  
Sorted by RU position (top → bottom, i.e. descending `startUnit`).  
Source: `state.devices` filtered by `device.rackId === rack.id`.

### Port Mapping Table
Columns: `From Device | From Port | To Device | To Port | Type | Color`  
One row per cable. For each `cable` in `state.cables`:
- Find source port → device name + port name
- Find dest port → device name + port name (null if cable floating)
- Skip floating (no dest) cables
- Sort by source device RU position, then port name

### Cable Legend
Deduplicate `cable.type` across all cables. Render each as:
```html
<div class="legend-item">
  <span class="swatch" style="background:{color}"></span>
  <span>{CABLE_COLORS label}</span>
  <span class="count">{n} cables</span>
</div>
```

### Power Summary
For each rack:
- `pduCount = (rack.showPduLeft ? 1 : 0) + (rack.showPduRight ? 1 : 0)`
- `capacityW = pduCount * 7200`
- `usedW = sum of watts parsed from device.description (\d+)\s*[wW]`
- `pct = usedW / capacityW * 100`
- Status badge: green < 80%, amber 80–94%, red ≥ 95%

Also include: Rack Unit utilisation (used RUs / total RUs) and estimated weight (if description contains `(\d+)\s*kg`).

### Design Notes
Render `meta.notes` in a `<pre>` block with monospace font, inside a bordered box. If empty, show `— No design notes provided —` in italic.

---

## Print CSS

```css
@media print {
  .rack-section { page-break-before: always; }
  .rack-section:first-child { page-break-before: avoid; }
  .port-mapping, .device-inventory { page-break-inside: avoid; }
  @page { size: A4 landscape; margin: 15mm; }
}
```

Screen CSS: dark background `#0d1117`, tables with `#1b1b22` rows alternating `#161618`.

---

## Modified Files

| File | Change |
|---|---|
| `src/export/report-builder.ts` | New — builds full HTML report string |
| `src/app.ts` | Wire Export Report button, modal open/cancel/generate |
| `src/components/toolbar.ts` | Add Export Report button (📄 icon) |
| `index.html` | Add `#export-report-modal` markup |
| `src/styles/index.css` | Add report modal styles + `.report-field` |

---

## Testing

- Open app with 2+ racks, multiple cables, PDUs enabled on one rack
- Click Export Report → modal opens
- Fill in title/author/notes → click Generate
- New tab opens with the report
- Verify: front view SVGs render correctly for each rack
- Verify: rear view SVGs render with PSU/fan details
- Verify: device inventory table lists all devices sorted by RU
- Verify: port mapping table covers all cables with correct from/to
- Verify: cable legend shows only types actually in use
- Verify: power summary shows correct % for rack with PDUs; shows `—` for rack without PDUs
- Print to PDF from browser → A4 landscape, page breaks between racks
