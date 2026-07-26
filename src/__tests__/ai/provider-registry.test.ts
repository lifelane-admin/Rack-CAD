import { ProviderRegistry } from '../../ai/provider-registry';

describe('ProviderRegistry', () => {
  it('always returns a provider (falls back to rules)', async () => {
    const registry = new ProviderRegistry();
    const provider = await registry.detect();
    expect(provider).toBeDefined();
    expect(provider.name).toBeDefined();
  });

  it('rules provider is always available', async () => {
    const registry = new ProviderRegistry();
    const provider = await registry.detect();
    // In test environment, Claude and Ollama are not available → rules
    expect(provider.name).toBe('rules');
  });
});
