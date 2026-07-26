# Sub-Project D: Custom Asset Library
**Date:** 2026-07-26  
**Status:** Approved

---

## Overview

The Standard Library is read-only. When a user customizes a device (uploads a front panel image, adjusts port layout, etc.), they can save it as a named entry in their own **Custom Library**. Custom assets persist in `localStorage` and travel with the project JSON. They appear in a separate "My Library" section in the sidebar, above the Standard Library.

---

## Goals

- Standard Library items are **never modified** — they are immutable templates
- Users can build their own named assets (e.g., "DELL PowerEdge R770 2U") from any generic base
- Custom assets persist across browser sessions via `localStorage`
- Custom assets are included in project save/load (JSON)
- Custom assets can be edited (rename, replace image) or deleted
- Custom assets are draggable from sidebar onto canvas like any standard device

---

## User Flows

### Flow 1 — Create a custom asset from a device on the canvas

1. User drags "2U Server" from Standard Library onto canvas
2. In Properties panel, user uploads a front panel image (Dell PowerEdge R770 photo)
3. "Save as Custom Asset" button appears in Properties (only shown when `device.frontPanelImage` is set, OR any device field differs from the base template)
4. Click → **Save Custom Asset modal** opens:

```
┌─ Save as Custom Asset ──────────────────────────┐
│  Name        [DELL PowerEdge R770 2U         ]  │
│  Category    [server ▼]                          │
│  Based on    2U Server  (read-only)              │
│  Front Panel [thumbnail or "No image"]           │
│  Description [Optional notes...              ]   │
│                   [Cancel]  [Save to My Library] │
└─────────────────────────────────────────────────┘
```

5. On Save → new `CustomTemplate` created, stored in `localStorage`, appended to `AppState.customTemplates`
6. Device on canvas: `device.templateId` updated to the new custom template ID
7. New asset immediately appears in sidebar under "My Library"

### Flow 2 — Drag from My Library

- User drags a custom asset from sidebar → places on canvas exactly like a standard device
- Device is created using the custom template as the template source

### Flow 3 — Edit a custom asset

- Right-click custom asset in sidebar → context menu: **Edit** / **Delete**
- Edit opens the same Save modal pre-filled with existing values
- Delete: confirmation prompt → removes from `localStorage` + `AppState.customTemplates`
- Devices on canvas that used a deleted template keep their snapshot (template was embedded in the device at creation time — see Data Model)

### Flow 4 — Export / Import custom library

- Settings menu → **Export My Library** → downloads `my-library.json`
- Settings menu → **Import Library** → file picker → merges into existing custom templates (skip duplicates by ID)
- Format: `{ version: 1, templates: CustomTemplate[] }`

---

## Data Model

### `CustomTemplate` (extends `DeviceTemplate`)

```typescript
// In src/core/types.ts — add to DeviceTemplate:
export interface DeviceTemplate {
  // ...existing fields...
  isCustom?: boolean;          // true for user-created assets
  basedOnTemplateId?: string;  // the standard template ID this was derived from
  customDescription?: string;  // user-entered notes
  createdAt?: string;          // ISO timestamp
}
```

Custom templates use the same `DeviceTemplate` interface. They have a UUID `id` (e.g., `custom-a3f9...`), `isCustom: true`, and may carry a `frontPanelImage` data URL (base64 PNG/JPG).

### `AppState` addition

```typescript
// In AppState (src/core/types.ts):
customTemplates: DeviceTemplate[];
```

Initial value: `[]`. Loaded from `localStorage` on startup. Saved to `localStorage` on every change.

### localStorage key

`rackcad_custom_library` → `JSON.stringify(customTemplates)`

### Project JSON (save/load)

`customTemplates` is included in the exported project JSON under the top-level `customTemplates` key. On load, templates from the project file are merged with `localStorage` (project file wins on conflict by ID).

---

## Architecture

### New File: `src/library/custom-catalog.ts`

```typescript
const STORAGE_KEY = 'rackcad_custom_library';

export function loadCustomTemplates(): DeviceTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveCustomTemplate(template: DeviceTemplate): void {
  const all = loadCustomTemplates();
  const idx = all.findIndex(t => t.id === template.id);
  if (idx >= 0) all[idx] = template; else all.push(template);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function deleteCustomTemplate(id: string): void {
  const all = loadCustomTemplates().filter(t => t.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function exportCustomLibrary(templates: DeviceTemplate[]): void {
  const blob = new Blob(
    [JSON.stringify({ version: 1, templates }, null, 2)],
    { type: 'application/json' }
  );
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'my-library.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

export function importCustomLibrary(file: File): Promise<DeviceTemplate[]>
// Reads file → parses JSON → validates version → returns templates array
```

### New File: `src/components/custom-asset-modal.ts`

```typescript
export class CustomAssetModal {
  show(device: DeviceData, baseTemplate: DeviceTemplate | null, onSave: (t: DeviceTemplate) => void): void
  hide(): void
}
```

Modal fields:
- **Name** — text input, required, pre-filled with `device.name` or base template name
- **Category** — dropdown, pre-filled with base template category, editable
- **Based on** — read-only text showing base template name
- **Front Panel Image** — shows current thumbnail if set; "Upload Image" button to change; "Remove" to clear
- **Description** — textarea, optional

On Save:
```typescript
const newTemplate: DeviceTemplate = {
  id: 'custom-' + crypto.randomUUID(),
  name: nameInput.value,
  manufacturer: '',
  model: nameInput.value,
  category: categorySelect.value as DeviceCategory,
  heightUnits: baseTemplate?.heightUnits ?? 2,
  color: baseTemplate?.color ?? '#1a1a1e',
  icon: baseTemplate?.icon ?? '🖥️',
  ports: device.ports.map(p => ({ id: p.id, name: p.name, type: p.type, relativeX: p.relativeX, relativeY: p.relativeY, speed: p.speed, description: p.description })),
  frontPanelImage: device.frontPanelImage ?? undefined,
  isCustom: true,
  basedOnTemplateId: baseTemplate?.id,
  customDescription: descInput.value,
  createdAt: new Date().toISOString(),
};
```

Calls `saveCustomTemplate(newTemplate)` then emits `'state:changed'` to update AppState and sidebar.

### Modified: `src/components/properties.ts`

In the device properties form (when a device is selected):
- Show **"Upload Front Panel Image"** button (existing, from Sub-project A)
- Show **"Save as Custom Asset"** button — always visible for any selected device
- Clicking "Save as Custom Asset" opens `CustomAssetModal`

### Modified: `src/components/sidebar.ts` (or wherever the device palette is rendered)

Add a **"My Library"** section at the top of the sidebar device list, above the Standard Library sections. Format:

```
▼ My Library                    [+ Import]
  ┌────────────────────────────────────────┐
  │ DELL PowerEdge R770 2U   ✎ ✕          │
  │ HPE DL380 Gen11          ✎ ✕          │
  │ Cisco Catalyst 9300      ✎ ✕          │
  └────────────────────────────────────────┘
  [Export My Library]

▼ Standard Library
  ▶ Servers
  ▶ Switches
  ...
```

Each custom asset row:
- Drag target (same as standard items)
- Pencil icon (✎) → opens Edit modal
- × icon → delete with confirmation

If `customTemplates` is empty: show `"No custom assets yet. Upload a front panel image to a device and click Save as Custom Asset."` in a subtle italic style.

### Modified: `src/library/device-catalog.ts`

```typescript
// Add a combined lookup that checks custom templates first:
export function getTemplate(id: string, customTemplates: DeviceTemplate[] = []): DeviceTemplate | undefined {
  return customTemplates.find(t => t.id === id) ?? deviceCatalog.find(t => t.id === id);
}
```

All callers of `getTemplate` pass `stateManager.getState().customTemplates` as second argument.

### Modified: `src/core/state.ts`

- Initial state: `customTemplates: loadCustomTemplates()` (import from `custom-catalog.ts`)
- In `setState`, when `customTemplates` changes: call `saveCustomTemplate` / persist to localStorage

### Modified: `src/app.ts` / save-load

- `project:save` event: include `customTemplates` in exported JSON
- `project:load` event: merge loaded `customTemplates` into state and localStorage

### Modified: `index.html`

Add `#custom-asset-modal` markup (same pattern as existing modals).

---

## Standard Library Protection

Standard templates (those in `deviceCatalog`) are never exposed to mutation. The "Save as Custom Asset" flow always creates a **new** entry with a new UUID. The only way a standard template is modified would be by editing `device-catalog.ts` directly — which is a developer action.

In the UI, items in the Standard Library section have no edit/delete icons. Only "My Library" items show those controls.

---

## Modified Files Summary

| File | Change |
|---|---|
| `src/library/custom-catalog.ts` | New — localStorage CRUD + export/import |
| `src/components/custom-asset-modal.ts` | New — Save/Edit custom asset modal |
| `src/styles/custom-asset-modal.css` | New — modal styles |
| `src/core/types.ts` | Add `isCustom?`, `basedOnTemplateId?`, `customDescription?`, `createdAt?` to `DeviceTemplate`; add `customTemplates: DeviceTemplate[]` to `AppState` |
| `src/library/device-catalog.ts` | Update `getTemplate()` to accept custom templates |
| `src/components/properties.ts` | Add "Save as Custom Asset" button |
| `src/components/sidebar.ts` | Add "My Library" section with drag, edit, delete |
| `src/core/state.ts` | Init `customTemplates` from localStorage; persist on change |
| `src/app.ts` | Wire save/load to include `customTemplates`; import/export handlers |
| `index.html` | Add `#custom-asset-modal` markup |

---

## Testing

- Drag "2U Server" to canvas → upload image → click "Save as Custom Asset" → fill name "DELL PowerEdge R770 2U" → save
- Sidebar My Library shows the new item immediately
- Drag the custom item from My Library onto canvas → device appears with front panel image
- Refresh browser → My Library still shows the custom item (localStorage)
- Save project JSON → open JSON file → confirm `customTemplates` array present with the entry
- Load project JSON in a fresh browser → My Library restored
- Edit custom asset (rename) → device name updates on canvas
- Delete custom asset → confirmation prompt → removed from sidebar; existing devices on canvas retain their rendered image (embedded at creation time)
- Export My Library → downloads `my-library.json`
- Import that JSON in another browser → items appear in My Library
- Standard Library items have no edit/delete controls
