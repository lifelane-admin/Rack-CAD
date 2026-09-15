import { AIProvider, AIProviderName } from './types';
import { RuleEngine } from './rule-engine';
import { LocalLLMProvider } from './local-llm-provider';
import { ClaudeProvider } from './claude-provider';
import { GeminiProvider } from './gemini-provider';
import { DeepSeekProvider } from './deepseek-provider';
import { OpenRouterProvider } from './openrouter-provider';
import { OpenAIProvider } from './openai-provider';

export class ProviderRegistry {
  private providers: AIProvider[] = [
    new GeminiProvider(),
    new DeepSeekProvider(),
    new OpenRouterProvider(),
    new OpenAIProvider(),
    new ClaudeProvider(),
    new LocalLLMProvider(),
    new RuleEngine(),
  ];

  async detect(): Promise<AIProvider> {
    const activePref = localStorage.getItem('rackcad_active_provider') as AIProviderName | null;
    if (activePref) {
      const preferred = this.providers.find(p => p.name === activePref);
      if (preferred && await preferred.isAvailable()) {
        return preferred;
      }
    }

    for (const provider of this.providers) {
      if (await provider.isAvailable()) return provider;
    }
    return new RuleEngine();
  }

  async getByName(name: AIProviderName): Promise<AIProvider> {
    const provider = this.providers.find(p => p.name === name);
    if (provider && await provider.isAvailable()) return provider;
    return new RuleEngine();
  }
}
