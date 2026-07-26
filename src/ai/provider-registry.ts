import { AIProvider, AIProviderName } from './types';
import { RuleEngine } from './rule-engine';
import { LocalLLMProvider } from './local-llm-provider';
import { ClaudeProvider } from './claude-provider';

export class ProviderRegistry {
  private providers: AIProvider[] = [
    new ClaudeProvider(),
    new LocalLLMProvider(),
    new RuleEngine(),
  ];

  async detect(): Promise<AIProvider> {
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
