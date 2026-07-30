# Sub-Project D: Custom Asset Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users save customised devices (with uploaded front-panel images) as named entries in a "My Library" section that persists in `localStorage` and travels with the project JSON.

**Architecture:** New `src/library/custom-catalog.ts` owns localStorage CRUD. New `src/components/custom-asset-modal.ts` handles the Save/Edit modal. `AppState.customTemplates` holds the in-memory list (initialised from localStorage). The sidebar gains a "My Library" section above the Standard Library. Properties panel gets a "Save as Custom Asset" button. Project save/load includes `customTemplates`. Standard Library entries are never mutated.

**Tech Stack:** TypeScript 6, Vite 8, localStorage, vitest.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `src/core/types.ts` | Modify | Add `isCustom?`, `basedOnTemplateId?`, `customDescription?`, `createdAt?` to `DeviceTemplate`; add `customTemplates` to `AppState` |
| `src/library/custom-catalog.ts` | Create | localStorage CRUD + JSON export/import |
| `src/library/device-catalog.ts` | Modify | Update `getTemplate(id, customTemplates?)` to check custom first |
| `src/core/state.ts` | Modify | Init `customTemplates` from localStorage; persist on every change |
| `src/components/custom-asset-modal.ts` | Create | Save/Edit custom asset modal component |
| `src/styles/custom-asset-modal.css` | Create | Modal styles |
| `src/components/sidebar.ts` | Modify | Add "My Library" section above Standard Library |
| `src/components/properties.ts` | Modify | Add "Save as Custom Asset" button |
| `src/utils/export.ts` | Modify | Include `customTemplates` in project JSON save/load |
| `index.html` | Modify | Add `#custom-asset-modal` markup |
| `src/__tests__/custom-catalog.test.ts` | Create | Test CRUD + parse/export helpers |

---

## Task 1: Extend DeviceTemplate and AppState types

**Files:**
- Modify: `src/core/types.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/custom-catalog.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';

// localStorage mock is provided by vitest's jsdom environment
describe('DeviceTemplate custom fields (type check)', () => {
  it('accepts isCustom and basedOnTemplateId fields', () => {
    // Compile-time check: construct an object matching DeviceTemplate
    const tpl: import('../core/types').DeviceTemplate = {
      id: 'custom-abc',
      name: 'Test Asset',
      manufacturer: '',
      model: 'Test Asset',
      category: 'server',
      heightUnits: 2,
      color: '#1a1a1e',
      icon: '🖥️',
      ports: [],
      isCustom: true,
      basedOnTemplateId: 'server-2u',
      customDescription: 'A test asset',
      createdAt: '2026-07-26T00:00:00.000Z',
    };
    expect(tpl.isCustom).toBe(true);
    expect(tpl.basedOnTemplateId).toBe('server-2u');
    expect(tpl.customDescription).toBe('A test asset');
    expect(tpl.createdAt).toBeTruthy();
  });
});
```

Run: `npm run test -- custom-catalog`
Expected: FAIL — `isCustom` does not exist on `DeviceTemplate`

- [ ] **Step 2: Add fields to DeviceTemplate in src/core/types.ts**

Locate the `DeviceTemplate` interface (around line 40). After the `frontPanelImage?: string` line, add:

```typescript
export interface DeviceTemplate {
  id: string;
  name: string;
  manufacturer: string;
  model: string;
  category: DeviceCategory;
  heightUnits: number;
  color: string;
  ports: Omit<PortData, 'deviceId' | 'connected' | 'cableId'>[];
  icon: string;
  frontPanelImage?: string;
  // Custom library fields
  isCustom?: boolean;
  basedOnTemplateId?: string;
  customDescription?: string;
  createdAt?: string;
}
```

- [ ] **Step 3: Add customTemplates to AppState in src/core/types.ts**

Locate the `AppState` interface. After the last field (e.g., `cableRoutingTrayMode` or `aiMode`), add:

```typescript
  customTemplates: DeviceTemplate[];
```

- [ ] **Step 4: Run test (should now pass) and type-check**

```
npm run test -- custom-catalog
npm run build -- --noEmit 2>&1 | grep "error TS" | head -20
```

Expected: Test PASSES. If TypeScript shows errors about `AppState` missing `customTemplates` in state initialisation, those will be fixed in Task 3.

- [ ] **Step 5: Commit**

```bash
git add src/core/types.ts src/__tests__/custom-catalog.test.ts
git commit -m "feat(types): add custom library fields to DeviceTemplate and customTemplates to AppState"
```

---

## Task 2: Create src/library/custom-catalog.ts

**Files:**
- Create: `src/library/custom-catalog.ts`
- Modify: `src/__tests__/custom-catalog.test.ts`

- [ ] **Step 1: Write failing CRUD tests**

Add to `src/__tests__/custom-catalog.test.ts` (below the existing describe block):

```typescript
describe('custom-catalog localStorage CRUD', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('loadCustomTemplates returns [] when localStorage is empty', async () => {
    const { loadCustomTemplates } = await import('../library/custom-catalog');
    expect(loadCustomTemplates()).toEqual([]);
  });

  it('saveCustomTemplate adds a new template', async () => {
    const { saveCustomTemplate, loadCustomTemplates } = await import('../library/custom-catalog');
    const tpl: any = { id: 'custom-1', name: 'My Server', isCustom: true };
    saveCustomTemplate(tpl);
    expect(loadCustomTemplates()).toHaveLength(1);
    expect(loadCustomTemplates()[0].id).toBe('custom-1');
  });

  it('saveCustomTemplate updates an existing template by id', async () => {
    const { saveCustomTemplate, loadCustomTemplates } = await import('../library/custom-catalog');
    const tpl: any = { id: 'custom-1', name: 'Old Name', isCustom: true };
    saveCustomTemplate(tpl);
    saveCustomTemplate({ ...tpl, name: 'New Name' });
    const all = loadCustomTemplates();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('New Name');
  });

  it('deleteCustomTemplate removes the entry', async () => {
    const { saveCustomTemplate, deleteCustomTemplate, loadCustomTemplates } = await import('../library/custom-catalog');
    saveCustomTemplate({ id: 'custom-1', name: 'A', isCustom: true } as any);
    saveCustomTemplate({ id: 'custom-2', name: 'B', isCustom: true } as any);
    deleteCustomTemplate('custom-1');
    const all = loadCustomTemplates();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('custom-2');
  });

  it('loadCustomTemplates returns [] when localStorage has malformed JSON', async () => {
    localStorage.setItem('rackcad_custom_library', '{{{broken');
    const { loadCustomTemplates } = await import('../library/custom-catalog');
    expect(loadCustomTemplates()).toEqual([]);
  });

  it('parseCustomLibraryJSON returns templates array from valid export format', async () => {
    const { parseCustomLibraryJSON } = await import('../library/custom-catalog');
    const json = JSON.stringify({ version: 1, templates: [{ id: 'custom-3', name: 'Imported' }] });
    const templates = parseCustomLibraryJSON(json);
    expect(templates).toHaveLength(1);
    expect(templates[0].id).toBe('custom-3');
  });

  it('parseCustomLibraryJSON throws on invalid format', async () => {
    const { parseCustomLibraryJSON } = await import('../library/custom-catalog');
    expect(() => parseCustomLibraryJSON(JSON.stringify({ data: [] }))).toThrow();
  });
});
```

Also add `import { vi } from 'vitest';` to the top of the test file.

Run: `npm run test -- custom-catalog`
Expected: All new tests FAIL (module doesn't exist yet)

- [ ] **Step 2: Create src/library/custom-catalog.ts**

```typescript
import { DeviceTemplate } from '../core/types';

const STORAGE_KEY = 'rackcad_custom_library';

export function loadCustomTemplates(): DeviceTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistAll(templates: DeviceTemplate[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

export function saveCustomTemplate(template: DeviceTemplate): void {
  const all = loadCustomTemplates();
  const idx = all.findIndex(t => t.id === template.id);
  if (idx >= 0) {
    all[idx] = template;
  } else {
    all.push(template);
  }
  persistAll(all);
}

export function deleteCustomTemplate(id: string): void {
  persistAll(loadCustomTemplates().filter(t => t.id !== id));
}

export function saveAllCustomTemplates(templates: DeviceTemplate[]): void {
  persistAll(templates);
}

export function exportCustomLibraryJSON(templates: DeviceTemplate[]): void {
  const blob = new Blob(
    [JSON.stringify({ version: 1, templates }, null, 2)],
    { type: 'application/json' },
  );
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'my-library.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

export function parseCustomLibraryJSON(jsonString: string): DeviceTemplate[] {
  const data = JSON.parse(jsonString);
  if (!data.version || !Array.isArray(data.templates)) {
    throw new Error('Invalid library format: expected { version, templates[] }');
  }
  return data.templates as DeviceTemplate[];
}
```

- [ ] **Step 3: Run tests**

```
npm run test -- custom-catalog
```

Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/library/custom-catalog.ts src/__tests__/custom-catalog.test.ts
git commit -m "feat(library): add custom-catalog.ts with localStorage CRUD and JSON export/import"
```

---

## Task 3: Update getTemplate in device-catalog.ts and fix state.ts

**Files:**
- Modify: `src/library/device-catalog.ts`
- Modify: `src/core/state.ts`

These two changes go together: `getTemplate` needs the optional second param, and `state.ts` must initialise `customTemplates` from localStorage to satisfy the AppState type.

- [ ] **Step 1: Update getTemplate in src/library/device-catalog.ts**

Find the existing `getTemplate` export. Change its signature to accept an optional second argument:

```typescript
// Before:
export function getTemplate(id: string): DeviceTemplate | undefined {
  return deviceCatalog.find(t => t.id === id);
}

// After:
export function getTemplate(id: string, customTemplates: DeviceTemplate[] = []): DeviceTemplate | undefined {
  return customTemplates.find(t => t.id === id) ?? deviceCatalog.find(t => t.id === id);
}
```

Also add the import for `DeviceTemplate` at the top if not already there:
```typescript
import { DeviceTemplate, DeviceCategory } from '../core/types';
```

All existing callers pass zero or one argument — the second param defaults to `[]`, so no callers break.

- [ ] **Step 2: Update src/core/state.ts to initialise customTemplates**

At the top of `state.ts`, add the import:
```typescript
import { loadCustomTemplates, saveAllCustomTemplates } from '../library/custom-catalog';
```

Locate the initial state object (the object passed to the first `setState` or the literal that defines default state). Add `customTemplates`:
```typescript
customTemplates: loadCustomTemplates(),
```

Then find the `setState` method (or wherever state changes are persisted). Add a block that persists `customTemplates` to localStorage whenever it changes:

```typescript
// Inside setState, after updating internal state, add:
if ('customTemplates' in partial) {
  saveAllCustomTemplates(partial.customTemplates!);
}
```

The exact location depends on how `setState` is structured. The pattern is: detect the key in the partial update and call `saveAllCustomTemplates`.

- [ ] **Step 3: Run full test suite**

```
npm run test
```

Expected: All tests pass. If TypeScript errors appear about `customTemplates` missing from state, verify the initial state literal includes `customTemplates: loadCustomTemplates()`.

- [ ] **Step 4: Commit**

```bash
git add src/library/device-catalog.ts src/core/state.ts
git commit -m "feat(state): init customTemplates from localStorage; update getTemplate to check custom first"
```

---

## Task 4: Create custom-asset-modal.ts and CSS

**Files:**
- Create: `src/components/custom-asset-modal.ts`
- Create: `src/styles/custom-asset-modal.css`

The modal is opened by the Properties panel "Save as Custom Asset" button (Task 5) and by the sidebar edit pencil (Task 5). It handles both create (new UUID) and edit (existing template) flows via the same `show()` method.

- [ ] **Step 1: Create src/styles/custom-asset-modal.css**

```css
#custom-asset-modal {
  position: fixed;
  inset: 0;
  background: rgba(10, 12, 16, 0.75);
  backdrop-filter: blur(10px);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Inter', system-ui, sans-serif;
}

#custom-asset-modal.hidden {
  display: none;
}

#custom-asset-modal .modal-box {
  background: rgba(22, 27, 34, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  width: 440px;
  max-width: 92vw;
  padding: 24px;
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.65);
  color: #c9d1d9;
}

#custom-asset-modal h3 {
  margin: 0 0 18px;
  font-size: 15px;
  color: #58a6ff;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  padding-bottom: 12px;
}

.cam-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}

.cam-field label {
  font-size: 11px;
  font-weight: 600;
  color: #8b949e;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.cam-field input,
.cam-field select,
.cam-field textarea {
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 4px;
  color: #c9d1d9;
  font-size: 13px;
  padding: 7px 10px;
  font-family: inherit;
  transition: border-color 0.15s;
  resize: vertical;
}

.cam-field input:focus,
.cam-field select:focus,
.cam-field textarea:focus {
  outline: none;
  border-color: #58a6ff;
}

.cam-field input[readonly] {
  color: #8b949e;
  cursor: default;
}

.cam-image-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
}

.cam-image-thumb {
  width: 64px;
  height: 32px;
  object-fit: contain;
  border: 1px solid #30363d;
  border-radius: 3px;
  background: #0d1117;
}

.cam-no-image {
  width: 64px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed #30363d;
  border-radius: 3px;
  font-size: 10px;
  color: #8b949e;
}

.cam-image-actions {
  display: flex;
  gap: 6px;
}

.cam-btn-sm {
  padding: 4px 8px;
  font-size: 11px;
  border: 1px solid #30363d;
  border-radius: 3px;
  background: transparent;
  color: #c9d1d9;
  cursor: pointer;
}

.cam-btn-sm:hover {
  border-color: #58a6ff;
  color: #58a6ff;
}

#custom-asset-modal .modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
  padding-top: 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
}

#cam-cancel {
  padding: 6px 14px;
  font-size: 12px;
  background: transparent;
  border: 1px solid #30363d;
  color: #c9d1d9;
  border-radius: 4px;
  cursor: pointer;
}

#cam-save {
  padding: 6px 18px;
  font-size: 12px;
  background: #1f6feb;
  border: none;
  color: #fff;
  font-weight: 600;
  border-radius: 4px;
  cursor: pointer;
}

#cam-save:hover { background: #388bfd; }
```

- [ ] **Step 2: Create src/components/custom-asset-modal.ts**

```typescript
import { DeviceData, DeviceTemplate, DeviceCategory } from '../core/types';
import { saveCustomTemplate } from '../library/custom-catalog';
import { stateManager } from '../core/state';
import { eventBus } from '../core/event-bus';

const CATEGORIES: DeviceCategory[] = [
  'server', 'switch', 'router', 'firewall', 'storage',
  'patch-panel', 'pdu', 'ups', 'blank-panel', 'cable-manager', 'cooling', 'console',
];

export class CustomAssetModal {
  private currentImage: string | undefined = undefined;

  show(
    device: DeviceData,
    baseTemplate: DeviceTemplate | null,
    existingCustomTemplate: DeviceTemplate | null,
    onSave: (t: DeviceTemplate) => void,
  ): void {
    const modal = document.getElementById('custom-asset-modal');
    if (!modal) return;

    this.currentImage = device.frontPanelImage ?? baseTemplate?.frontPanelImage;

    // Pre-fill fields
    const nameInput    = document.getElementById('cam-name')   as HTMLInputElement;
    const catSelect    = document.getElementById('cam-cat')    as HTMLSelectElement;
    const basedOnEl    = document.getElementById('cam-based-on') as HTMLInputElement;
    const descTextarea = document.getElementById('cam-desc')   as HTMLTextAreaElement;

    if (existingCustomTemplate) {
      nameInput.value    = existingCustomTemplate.name;
      catSelect.value    = existingCustomTemplate.category;
      basedOnEl.value    = baseTemplate?.name ?? '—';
      descTextarea.value = existingCustomTemplate.customDescription ?? '';
      this.currentImage  = existingCustomTemplate.frontPanelImage ?? this.currentImage;
    } else {
      nameInput.value    = device.name || baseTemplate?.name || '';
      catSelect.value    = baseTemplate?.category ?? 'server';
      basedOnEl.value    = baseTemplate?.name ?? '—';
      descTextarea.value = '';
    }

    this.refreshImagePreview();
    modal.classList.remove('hidden');

    // Wire image upload button
    const uploadBtn = document.getElementById('cam-upload-btn');
    const removeBtn = document.getElementById('cam-remove-btn');

    const handleUpload = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (e: any) => {
        const file: File = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt: any) => {
          this.currentImage = evt.target.result as string;
          this.refreshImagePreview();
        };
        reader.readAsDataURL(file);
      };
      input.click();
    };

    const handleRemove = () => {
      this.currentImage = undefined;
      this.refreshImagePreview();
    };

    uploadBtn?.addEventListener('click', handleUpload, { once: true });
    removeBtn?.addEventListener('click', handleRemove, { once: true });

    // Wire cancel + save
    const handleCancel = () => {
      modal.classList.add('hidden');
      cleanup();
    };

    const handleSave = () => {
      const name = nameInput.value.trim();
      if (!name) {
        nameInput.focus();
        nameInput.style.borderColor = '#ef4444';
        return;
      }
      nameInput.style.borderColor = '';

      const newTemplate: DeviceTemplate = {
        id: existingCustomTemplate?.id ?? ('custom-' + crypto.randomUUID()),
        name,
        manufacturer: '',
        model: name,
        category: catSelect.value as DeviceCategory,
        heightUnits: baseTemplate?.heightUnits ?? device.ports.length > 0 ? 1 : 1,
        color: baseTemplate?.color ?? '#1a1a1e',
        icon: baseTemplate?.icon ?? '🖥️',
        ports: device.ports.map(p => ({
          id: p.id,
          name: p.name,
          type: p.type,
          relativeX: p.relativeX,
          relativeY: p.relativeY,
          speed: p.speed,
          description: p.description,
        })),
        frontPanelImage: this.currentImage,
        isCustom: true,
        basedOnTemplateId: baseTemplate?.id,
        customDescription: descTextarea.value.trim() || undefined,
        createdAt: existingCustomTemplate?.createdAt ?? new Date().toISOString(),
      };

      saveCustomTemplate(newTemplate);

      // Update AppState
      const state = stateManager.getState();
      const existing = state.customTemplates.find(t => t.id === newTemplate.id);
      const customTemplates = existing
        ? state.customTemplates.map(t => t.id === newTemplate.id ? newTemplate : t)
        : [...state.customTemplates, newTemplate];
      stateManager.setState({ customTemplates });

      // If creating from a device on canvas, update the device's templateId
      if (!existingCustomTemplate) {
        const devices = state.devices.map(d =>
          d.id === device.id ? { ...d, templateId: newTemplate.id } : d,
        );
        stateManager.setState({ devices });
      }

      eventBus.emit('notification' as any, { message: `Saved "${name}" to My Library`, type: 'success' });
      modal.classList.add('hidden');
      cleanup();
      onSave(newTemplate);
    };

    const cancelBtn = document.getElementById('cam-cancel');
    const saveBtn   = document.getElementById('cam-save');

    cancelBtn?.addEventListener('click', handleCancel, { once: true });
    saveBtn?.addEventListener('click', handleSave, { once: true });

    function cleanup() {
      cancelBtn?.removeEventListener('click', handleCancel);
      saveBtn?.removeEventListener('click', handleSave);
      uploadBtn?.removeEventListener('click', handleUpload);
      removeBtn?.removeEventListener('click', handleRemove);
    }
  }

  private refreshImagePreview(): void {
    const thumb   = document.getElementById('cam-image-thumb') as HTMLImageElement;
    const noImage = document.getElementById('cam-no-image');
    if (!thumb || !noImage) return;

    if (this.currentImage) {
      thumb.src = this.currentImage;
      thumb.classList.remove('hidden');
      noImage.classList.add('hidden');
    } else {
      thumb.classList.add('hidden');
      noImage.classList.remove('hidden');
    }
  }
}
```

- [ ] **Step 3: Add CSS import to app.ts**

In `src/app.ts`, near the top with other CSS imports, add:
```typescript
import './styles/custom-asset-modal.css';
```

- [ ] **Step 4: Run tests**

```
npm run test
npm run build -- --noEmit 2>&1 | grep "error TS" | head -20
```

Expected: Existing tests pass; no new TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/custom-asset-modal.ts src/styles/custom-asset-modal.css src/app.ts
git commit -m "feat(ui): add CustomAssetModal component and CSS"
```

---

## Task 5: Add My Library section to sidebar.ts

**Files:**
- Modify: `src/components/sidebar.ts`
- Modify: `index.html` (add modal markup)

- [ ] **Step 1: Add modal markup to index.html**

In `index.html`, after the closing `</div>` of the `#ai-key-modal` block (before `<script>`), add:

```html
  <!-- Custom Asset Modal -->
  <div id="custom-asset-modal" class="hidden">
    <div class="modal-box">
      <h3>Save as Custom Asset</h3>
      <div class="cam-field">
        <label for="cam-name">Name</label>
        <input id="cam-name" type="text" placeholder="DELL PowerEdge R770 2U"/>
      </div>
      <div class="cam-field">
        <label for="cam-cat">Category</label>
        <select id="cam-cat">
          <option value="server">Server</option>
          <option value="switch">Switch</option>
          <option value="router">Router</option>
          <option value="firewall">Firewall</option>
          <option value="storage">Storage</option>
          <option value="patch-panel">Patch Panel</option>
          <option value="pdu">PDU</option>
          <option value="ups">UPS</option>
          <option value="blank-panel">Blank Panel</option>
          <option value="cable-manager">Cable Manager</option>
          <option value="cooling">Cooling</option>
          <option value="console">Console</option>
        </select>
      </div>
      <div class="cam-field">
        <label for="cam-based-on">Based On</label>
        <input id="cam-based-on" type="text" readonly/>
      </div>
      <div class="cam-field">
        <label>Front Panel Image</label>
        <div class="cam-image-row">
          <img id="cam-image-thumb" class="cam-image-thumb hidden" src="" alt="Front panel"/>
          <div id="cam-no-image" class="cam-no-image">No image</div>
          <div class="cam-image-actions">
            <button id="cam-upload-btn" class="cam-btn-sm">Upload</button>
            <button id="cam-remove-btn" class="cam-btn-sm">Remove</button>
          </div>
        </div>
      </div>
      <div class="cam-field">
        <label for="cam-desc">Description</label>
        <textarea id="cam-desc" rows="2" placeholder="Optional notes..."></textarea>
      </div>
      <div class="modal-actions">
        <button id="cam-cancel">Cancel</button>
        <button id="cam-save">Save to My Library</button>
      </div>
    </div>
  </div>
```

- [ ] **Step 2: Modify src/components/sidebar.ts — add My Library section**

At the top of `sidebar.ts`, add imports:
```typescript
import { CustomAssetModal } from './custom-asset-modal';
import { deleteCustomTemplate } from '../library/custom-catalog';
import { exportCustomLibraryJSON, parseCustomLibraryJSON } from '../library/custom-catalog';
import { getTemplate } from '../library/device-catalog';
```

Add a class property:
```typescript
private customAssetModal = new CustomAssetModal();
```

In the `renderCatalog()` method, **before** the existing `for (const [groupName, groupData] of ...)` loop that renders the Standard Library, insert a call to a new method:

```typescript
private renderCatalog() {
  const container = this.container.querySelector('#catalog-container') as HTMLElement;
  if (!container) return;
  container.innerHTML = '';

  // Render My Library section first
  this.renderMyLibrary(container);

  // Existing standard library code follows unchanged...
  const categories: { id: DeviceCategory, label: string, icon: string }[] = [ ... ];
  ...
}
```

Add the new `renderMyLibrary` method to the `Sidebar` class:

```typescript
private renderMyLibrary(container: HTMLElement): void {
  const state = State.getState();
  const customTemplates = state.customTemplates ?? [];

  const section = document.createElement('div');
  section.className = 'sidebar-section expanded';
  section.id = 'my-library-section';

  // Header row: title + Import button
  const titleRow = document.createElement('div');
  titleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;';

  const title = document.createElement('div');
  title.className = 'sidebar-section-title';
  title.style.flex = '1';
  title.textContent = '⭐ My Library';
  title.onclick = () => section.classList.toggle('expanded');
  titleRow.appendChild(title);

  const importBtn = document.createElement('button');
  importBtn.textContent = '+ Import';
  importBtn.title = 'Import custom library from JSON file';
  importBtn.style.cssText = 'font-size:10px;padding:2px 6px;border:1px solid #30363d;background:transparent;color:#8b949e;border-radius:3px;cursor:pointer;margin-right:4px;';
  importBtn.onclick = (e) => {
    e.stopPropagation();
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (evt: any) => {
      const file: File = evt.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (r: any) => {
        try {
          const imported = parseCustomLibraryJSON(r.target.result);
          const existing = state.customTemplates ?? [];
          const existingIds = new Set(existing.map(t => t.id));
          const merged = [...existing, ...imported.filter(t => !existingIds.has(t.id))];
          State.setState({ customTemplates: merged });
          EventBus.emit('notification' as any, { message: `Imported ${imported.length} asset(s)`, type: 'success' });
          this.renderCatalog();
        } catch (err) {
          EventBus.emit('notification' as any, { message: `Import failed: ${err}`, type: 'error' });
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };
  titleRow.appendChild(importBtn);

  section.appendChild(titleRow);

  const content = document.createElement('div');
  content.className = 'sidebar-section-content';

  if (customTemplates.length === 0) {
    const empty = document.createElement('p');
    empty.style.cssText = 'font-size:11px;color:#8b949e;font-style:italic;padding:8px 4px;margin:0;';
    empty.textContent = 'No custom assets yet. Select a device on canvas and click "Save as Custom Asset" in Properties.';
    content.appendChild(empty);
  } else {
    customTemplates.forEach(item => {
      const el = document.createElement('div');
      el.className = `catalog-item category-${item.category}`;
      el.draggable = true;
      el.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding-right:4px;';

      const leftPart = document.createElement('div');
      leftPart.style.cssText = 'display:flex;align-items:center;gap:6px;flex:1;min-width:0;overflow:hidden;';
      leftPart.innerHTML = `
        <div class="item-icon">${item.icon}</div>
        <div class="item-details" style="min-width:0;overflow:hidden;">
          <div class="item-name" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${item.name}</div>
          <div class="item-meta">${item.heightUnits > 0 ? item.heightUnits + 'U' : 'Accessory'} • Custom</div>
        </div>
      `;

      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;gap:2px;flex-shrink:0;';

      const editBtn = document.createElement('button');
      editBtn.textContent = '✎';
      editBtn.title = 'Edit custom asset';
      editBtn.style.cssText = 'background:none;border:none;color:#8b949e;cursor:pointer;font-size:13px;padding:2px 4px;';
      editBtn.onclick = (e) => {
        e.stopPropagation();
        // Open modal in edit mode (existingCustomTemplate = item, device = snapshot)
        const fakeDevice: any = {
          id: '__edit__',
          name: item.name,
          hostname: '',
          managementIp: '',
          serialNumber: '',
          description: item.customDescription ?? '',
          templateId: item.id,
          rackId: '',
          startUnit: 1,
          ports: item.ports.map(p => ({ ...p, deviceId: '__edit__', connected: false, cableId: null })),
          frontPanelImage: item.frontPanelImage,
        };
        const base = getTemplate(item.basedOnTemplateId ?? '', []) ?? null;
        this.customAssetModal.show(fakeDevice, base, item, (_saved) => {
          this.renderCatalog();
        });
      };

      const delBtn = document.createElement('button');
      delBtn.textContent = '×';
      delBtn.title = 'Delete custom asset';
      delBtn.style.cssText = 'background:none;border:none;color:#8b949e;cursor:pointer;font-size:16px;padding:2px 4px;';
      delBtn.onclick = (e) => {
        e.stopPropagation();
        if (!confirm(`Delete custom asset "${item.name}"? Devices already placed on the canvas will keep their appearance.`)) return;
        deleteCustomTemplate(item.id);
        const newTemplates = (State.getState().customTemplates ?? []).filter(t => t.id !== item.id);
        State.setState({ customTemplates: newTemplates });
        this.renderCatalog();
      };

      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      el.appendChild(leftPart);
      el.appendChild(actions);

      el.ondragstart = (e) => {
        e.dataTransfer?.setData('application/json', JSON.stringify({ templateId: item.id }));
      };

      content.appendChild(el);
    });

    // Export button at the bottom of My Library
    const exportBtn = document.createElement('button');
    exportBtn.textContent = 'Export My Library';
    exportBtn.title = 'Download all custom assets as JSON';
    exportBtn.style.cssText = 'margin:6px 4px 2px;font-size:11px;padding:4px 10px;border:1px solid #30363d;background:transparent;color:#8b949e;border-radius:4px;cursor:pointer;width:calc(100% - 8px);';
    exportBtn.onclick = () => exportCustomLibraryJSON(customTemplates);
    content.appendChild(exportBtn);
  }

  section.appendChild(content);
  container.appendChild(section);

  // Re-render My Library when customTemplates state changes
  EventBus.on('state:changed', (partial: any) => {
    if ('customTemplates' in partial) {
      this.renderCatalog();
    }
  });
}
```

- [ ] **Step 3: Run tests and build check**

```
npm run test
npm run build -- --noEmit 2>&1 | grep "error TS" | head -20
```

Expected: Tests pass, no TS errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/sidebar.ts index.html
git commit -m "feat(sidebar): add My Library section with drag, edit, delete, import, and export"
```

---

## Task 6: Add "Save as Custom Asset" button to properties.ts

**Files:**
- Modify: `src/components/properties.ts`

- [ ] **Step 1: Add CustomAssetModal import to properties.ts**

At the top of `src/components/properties.ts`:
```typescript
import { CustomAssetModal } from './custom-asset-modal';
import { getTemplate } from '../library/device-catalog';
```

Add a module-level (or class-level) instance:
```typescript
const customAssetModal = new CustomAssetModal();
```

- [ ] **Step 2: Add "Save as Custom Asset" button to the device properties section**

Locate the existing "OEM Front Panel Design" / "Front Panel Image" section (around line 221 in the original file). After the upload image button block, add a "Save as Custom Asset" button:

```typescript
// After the upload image section, add:
const saveAsCustomBtn = document.createElement('button');
saveAsCustomBtn.id = 'btn-save-custom-asset';
saveAsCustomBtn.className = 'prop-btn';
saveAsCustomBtn.textContent = 'Save as Custom Asset';
saveAsCustomBtn.title = 'Save this device configuration to My Library';
saveAsCustomBtn.style.cssText = 'width:100%;margin-top:8px;background:#1f6feb;color:#fff;font-weight:600;border:none;border-radius:4px;padding:7px 10px;font-size:12px;cursor:pointer;';

saveAsCustomBtn.addEventListener('click', () => {
  const state = stateManager.getState();
  const sel = state.selection.find(s => s.type === 'device');
  if (!sel) return;
  const device = state.devices.find(d => d.id === sel.id);
  if (!device) return;
  const baseTemplate = getTemplate(device.templateId, state.customTemplates) ?? null;
  const existingCustom = baseTemplate?.isCustom ? baseTemplate : null;
  customAssetModal.show(device, baseTemplate, existingCustom, () => {
    // Sidebar re-renders via state:changed event
  });
});

// Append to the front-panel section container
frontPanelSection.appendChild(saveAsCustomBtn);
```

The exact insertion point is the element where the front-panel upload section is built. Find the container `div` that holds the "Front Panel Image" label and the upload button, and append `saveAsCustomBtn` to it.

- [ ] **Step 3: Rename label from "OEM Front Panel Design" to "Front Panel Image"**

Find the string `'OEM Front Panel Design'` in `src/components/properties.ts` and change it to `'Front Panel Image'`.

- [ ] **Step 4: Run tests**

```
npm run test
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/properties.ts
git commit -m "feat(properties): add Save as Custom Asset button and rename Front Panel Image label"
```

---

## Task 7: Include customTemplates in project save/load

**Files:**
- Modify: `src/utils/export.ts`

The project JSON currently saves only `racks`, `devices`, `cables`. Custom templates need to travel with the project so designs are portable.

- [ ] **Step 1: Update exportJSON in src/utils/export.ts**

Find the `exportJSON()` function:

```typescript
// Before:
export function exportJSON(): string {
  const s = stateManager.getState();
  const project = {
    version: '1.0.0',
    name: 'RackCAD Project',
    created: new Date().toISOString(),
    racks: s.racks,
    devices: s.devices,
    cables: s.cables,
  };
  return JSON.stringify(project, null, 2);
}

// After:
export function exportJSON(): string {
  const s = stateManager.getState();
  const project = {
    version: '1.0.0',
    name: 'RackCAD Project',
    created: new Date().toISOString(),
    racks: s.racks,
    devices: s.devices,
    cables: s.cables,
    customTemplates: s.customTemplates ?? [],
  };
  return JSON.stringify(project, null, 2);
}
```

- [ ] **Step 2: Update importJSON in src/utils/export.ts**

Find the `importJSON()` function and add the customTemplates merge:

```typescript
export function importJSON(jsonString: string): void {
  try {
    const project = JSON.parse(jsonString);
    if (!project.racks || !project.devices || !project.cables) {
      throw new Error('Invalid project format');
    }

    // Merge custom templates: project file wins on ID conflict
    const projectTemplates: DeviceTemplate[] = project.customTemplates ?? [];
    const existingTemplates = stateManager.getState().customTemplates ?? [];
    const projectIds = new Set(projectTemplates.map((t: any) => t.id));
    const merged = [
      ...projectTemplates,
      ...existingTemplates.filter(t => !projectIds.has(t.id)),
    ];

    stateManager.setState({
      racks: project.racks,
      devices: project.devices,
      cables: project.cables,
      customTemplates: merged,
      selection: [],
    });
    eventBus.emit('notification', { message: 'Project loaded successfully', type: 'success' });
  } catch (err) {
    eventBus.emit('notification', { message: `Failed to load project: ${err}`, type: 'error' });
  }
}
```

Add the `DeviceTemplate` import at the top of `export.ts` if not already present:
```typescript
import { DeviceTemplate } from '../core/types';
```

- [ ] **Step 3: Run full test suite**

```
npm run test
npm run build -- --noEmit 2>&1 | grep "error TS" | head -20
```

Expected: All tests pass, no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/utils/export.ts
git commit -m "feat(export): include customTemplates in project JSON save/load with project-wins merge"
```

---

## Self-Review Checklist

- [x] **Standard Library protection:** `getTemplate` checks custom first, but the standard catalog is never mutated — custom templates get new UUIDs with `'custom-' + crypto.randomUUID()` — ✅
- [x] **Flow 1 (Create from canvas):** Properties button → modal → saved to localStorage + AppState + device.templateId updated — ✅ Task 6 + custom-asset-modal.ts
- [x] **Flow 2 (Drag from My Library):** Sidebar uses `ondragstart` with `{ templateId: item.id }` — existing drop handler picks this up — ✅ Task 5
- [x] **Flow 3 (Edit / Delete):** Sidebar ✎ opens modal in edit mode; × shows confirmation and removes from localStorage + AppState — ✅ Task 5
- [x] **Flow 4 (Export / Import):** Export button in My Library; Import button in header; merge (skip duplicates by ID) — ✅ Task 5
- [x] **Persistence:** `saveAllCustomTemplates` called in `setState` whenever `customTemplates` key is in partial — ✅ Task 3
- [x] **Project JSON:** `customTemplates` included in exportJSON; merged on importJSON (project file wins) — ✅ Task 7
- [x] **Deleted template:** Canvas devices keep their snapshot (templates were embedded in device at creation — the `device.ports` are copied into the template, not referenced) — ✅ custom-asset-modal.ts copies device.ports
- [x] **Empty state:** My Library shows descriptive italic placeholder when empty — ✅ Task 5
- [x] **No OEM references:** "Save as Custom Asset" always visible for any selected device — ✅ Task 6
- [x] **Placeholder scan:** No TBD or TODO — all code is complete
