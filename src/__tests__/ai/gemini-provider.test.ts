import { describe, it, expect, beforeEach } from 'vitest';
import { GeminiProvider, DEFAULT_GEMINI_MODEL, AVAILABLE_GEMINI_MODELS, normalizeGeminiModel, cleanJsonResponse } from '../../ai/gemini-provider';
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

  it('supports model selection, normalization, and defaults', () => {
    expect(GeminiProvider.getModel()).toBe(DEFAULT_GEMINI_MODEL);
    expect(DEFAULT_GEMINI_MODEL).toBe('gemini-3.6-flash');
    expect(AVAILABLE_GEMINI_MODELS.length).toBeGreaterThan(1);

    expect(normalizeGeminiModel('gemini-3.6')).toBe('gemini-3.6-flash');
    expect(normalizeGeminiModel('gemini-3.8-flash')).toBe('gemini-3.6-flash');

    GeminiProvider.saveModel('gemini-2.5-pro');
    expect(GeminiProvider.getModel()).toBe('gemini-2.5-pro');
  });

  it('integrates with ProviderRegistry preference', async () => {
    const registry = new ProviderRegistry();
    GeminiProvider.saveKey('AIzaSyTestKey');
    localStorage.setItem('rackcad_active_provider', 'gemini');

    const detected = await registry.detect();
    expect(detected.name).toBe('gemini');
  });

  it('cleans json codeblocks and extracts diffs correctly', () => {
    const provider = new GeminiProvider();
    const rawMarkdown = `\`\`\`json
{
  "explanation": "Added 2 servers",
  "diff": {
    "addDevices": [{ "name": "Server 1", "ruStart": 5 }]
  }
}
\`\`\``;

    const cleaned = cleanJsonResponse(rawMarkdown);
    expect(cleaned.startsWith('{')).toBe(true);

    const parsed = provider.parseDiff(rawMarkdown);
    expect(parsed.explanation).toBe('Added 2 servers');
    expect(parsed.diff).not.toBeNull();
  });
});
