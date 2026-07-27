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
