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
