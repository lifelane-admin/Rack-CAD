import { describe, it, expect, beforeEach } from 'vitest';
import { OpenAIProvider, DEFAULT_OPENAI_MODEL, AVAILABLE_OPENAI_MODELS } from '../../ai/openai-provider';
import { ProviderRegistry } from '../../ai/provider-registry';

describe('OpenAIProvider', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('reports unavailable when no key is saved', async () => {
    const provider = new OpenAIProvider();
    expect(await provider.isAvailable()).toBe(false);
    expect(OpenAIProvider.hasKey()).toBe(false);
  });

  it('saves and clears api keys correctly', async () => {
    OpenAIProvider.saveKey('sk-proj-test123');
    expect(OpenAIProvider.hasKey()).toBe(true);
    const provider = new OpenAIProvider();
    expect(await provider.isAvailable()).toBe(true);

    OpenAIProvider.clearKey();
    expect(OpenAIProvider.hasKey()).toBe(false);
    expect(await provider.isAvailable()).toBe(false);
  });

  it('supports model selection and defaults', () => {
    expect(OpenAIProvider.getModel()).toBe(DEFAULT_OPENAI_MODEL);
    expect(AVAILABLE_OPENAI_MODELS.length).toBeGreaterThan(1);

    OpenAIProvider.saveModel('gpt-4o-mini');
    expect(OpenAIProvider.getModel()).toBe('gpt-4o-mini');
  });

  it('integrates with ProviderRegistry preference', async () => {
    const registry = new ProviderRegistry();
    OpenAIProvider.saveKey('sk-proj-test');
    localStorage.setItem('rackcad_active_provider', 'openai');

    const detected = await registry.detect();
    expect(detected.name).toBe('openai');
  });
});
