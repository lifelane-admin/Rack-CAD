import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('DeviceTemplate custom fields (type check)', () => {
  it('accepts isCustom and basedOnTemplateId fields', () => {
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
