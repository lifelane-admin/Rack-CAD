import { AIProviderAdapter } from '../types';
import { GeminiProviderAdapter } from './gemini-adapter';
import { OpenAIProviderAdapter } from './openai-adapter';
import { ClaudeProviderAdapter } from './claude-adapter';
import { DeepSeekProviderAdapter } from './deepseek-adapter';
import { OpenRouterProviderAdapter } from './openrouter-adapter';
import { LocalLLMProviderAdapter } from './local-adapter';
import { CatalogProviderAdapter, INITIAL_PROVIDER_CONFIGS } from './catalog-adapter';

export * from './base-adapter';
export * from './gemini-adapter';
export * from './openai-adapter';
export * from './claude-adapter';
export * from './deepseek-adapter';
export * from './openrouter-adapter';
export * from './local-adapter';
export * from './catalog-adapter';

export function createDefaultAdapters(): AIProviderAdapter[] {
  const adapters: AIProviderAdapter[] = [
    new GeminiProviderAdapter(),
    new OpenAIProviderAdapter(),
    new ClaudeProviderAdapter(),
    new DeepSeekProviderAdapter(),
    new OpenRouterProviderAdapter(),
    new LocalLLMProviderAdapter(),
  ];

  for (const config of INITIAL_PROVIDER_CONFIGS) {
    adapters.push(new CatalogProviderAdapter(config));
  }

  return adapters;
}
