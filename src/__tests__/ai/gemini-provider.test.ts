import { describe, it, expect, beforeEach } from 'vitest';
import { GeminiProvider, DEFAULT_GEMINI_MODEL, AVAILABLE_GEMINI_MODELS } from '../../ai/gemini-provider';
import { ProviderRegistry } from '../../ai/provider-registry';

describe('GeminiProvider', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('reports unavailable when no key is saved', async () => {
    const provider = new GeminiProvider();
    expect(await provider.isAvailable()).toBe(false);
    expect(GeminiProvider.hasKey()).toBe(false);
  });

  it('saves and clears api keys correctly', async () => {
    GeminiProvider.saveKey('AIzaSyTestKey123');
    expect(GeminiProvider.hasKey()).toBe(true);
    const provider = new GeminiProvider();
    expect(await provider.isAvailable()).toBe(true);

    GeminiProvider.clearKey();
    expect(GeminiProvider.hasKey()).toBe(false);
    expect(await provider.isAvailable()).toBe(false);
  });

  it('supports model selection and defaults', () => {
    expect(GeminiProvider.getModel()).toBe(DEFAULT_GEMINI_MODEL);
    expect(AVAILABLE_GEMINI_MODELS.length).toBeGreaterThan(1);

    GeminiProvider.saveModel('gemini-3.1-pro-preview');
    expect(GeminiProvider.getModel()).toBe('gemini-3.1-pro-preview');
  });

  it('integrates with ProviderRegistry preference', async () => {
    const registry = new ProviderRegistry();
    GeminiProvider.saveKey('AIzaSyTestKey');
    localStorage.setItem('rackcad_active_provider', 'gemini');

    const detected = await registry.detect();
    expect(detected.name).toBe('gemini');
  });
});
