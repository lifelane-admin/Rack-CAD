import { describe, it, expect, beforeEach } from 'vitest';
import { DeepSeekProvider, DEFAULT_DEEPSEEK_MODEL, AVAILABLE_DEEPSEEK_MODELS } from '../../ai/deepseek-provider';
import { OpenRouterProvider, DEFAULT_OPENROUTER_MODEL, AVAILABLE_OPENROUTER_MODELS } from '../../ai/openrouter-provider';
import { ProviderRegistry } from '../../ai/provider-registry';

describe('DeepSeek & OpenRouter Providers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('handles DeepSeek configuration & registry', async () => {
    const provider = new DeepSeekProvider();
    expect(await provider.isAvailable()).toBe(false);

    DeepSeekProvider.saveKey('sk-deepseek-test');
    expect(await provider.isAvailable()).toBe(true);
    expect(DeepSeekProvider.getModel()).toBe(DEFAULT_DEEPSEEK_MODEL);

    DeepSeekProvider.saveModel('deepseek-reasoner');
    expect(DeepSeekProvider.getModel()).toBe('deepseek-reasoner');

    const registry = new ProviderRegistry();
    localStorage.setItem('rackcad_active_provider', 'deepseek');
    const detected = await registry.detect();
    expect(detected.name).toBe('deepseek');
  });

  it('handles OpenRouter / Qwen configuration & registry', async () => {
    const provider = new OpenRouterProvider();
    expect(await provider.isAvailable()).toBe(false);

    OpenRouterProvider.saveKey('sk-or-v1-test');
    expect(await provider.isAvailable()).toBe(true);
    expect(OpenRouterProvider.getModel()).toBe(DEFAULT_OPENROUTER_MODEL);

    const registry = new ProviderRegistry();
    localStorage.setItem('rackcad_active_provider', 'openrouter');
    const detected = await registry.detect();
    expect(detected.name).toBe('openrouter');
  });
});
