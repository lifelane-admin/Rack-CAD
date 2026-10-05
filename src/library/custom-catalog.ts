import { DeviceTemplate } from '../core/types';
import defaultTemplatesRaw from './default-custom-templates.json';

const STORAGE_KEY = 'rackcad_custom_library';
const DELETED_DEFAULTS_KEY = 'rackcad_custom_library_deleted_defaults';

export const DEFAULT_CUSTOM_TEMPLATES: DeviceTemplate[] = defaultTemplatesRaw as DeviceTemplate[];

export function loadCustomTemplates(): DeviceTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const rawDeleted = localStorage.getItem(DELETED_DEFAULTS_KEY);
    const deletedIds = new Set<string>(rawDeleted ? JSON.parse(rawDeleted) : []);

    if (!raw) {
      const initial = DEFAULT_CUSTOM_TEMPLATES.filter(t => !deletedIds.has(t.id));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }

    const loaded: DeviceTemplate[] = JSON.parse(raw);
    const loadedIds = new Set(loaded.map(t => t.id));

    // If defaults were missing from storage (and not explicitly deleted by user), merge them in
    const missingDefaults = DEFAULT_CUSTOM_TEMPLATES.filter(t => !loadedIds.has(t.id) && !deletedIds.has(t.id));
    if (missingDefaults.length > 0) {
      const merged = [...loaded, ...missingDefaults];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      return merged;
    }

    return loaded;
  } catch {
    return [...DEFAULT_CUSTOM_TEMPLATES];
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
  if (DEFAULT_CUSTOM_TEMPLATES.some(t => t.id === id)) {
    try {
      const rawDeleted = localStorage.getItem(DELETED_DEFAULTS_KEY);
      const deletedIds = new Set<string>(rawDeleted ? JSON.parse(rawDeleted) : []);
      deletedIds.add(id);
      localStorage.setItem(DELETED_DEFAULTS_KEY, JSON.stringify([...deletedIds]));
    } catch {}
  }
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
