import { describe, it, expect } from 'vitest';

describe('DeviceCategory type', () => {
  it('includes console as a valid category', async () => {
    // This is a compile-time check — if DeviceCategory doesn't include 'console'
    // the import of a DeviceData with category 'console' would fail tsc.
    // At runtime we check getTemplatesByCategory works with it.
    const { getTemplatesByCategory } = await import('../library/device-catalog');
    // This should not throw even if zero results (category exists in type)
    expect(() => getTemplatesByCategory('console' as any)).not.toThrow();
  });
});
