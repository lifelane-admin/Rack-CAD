import { AIProvider, AIProviderName, AIHint, AIMessage, RackContext, RackDiff } from './types';
import { RuleEngine } from './rule-engine';
import { SYSTEM_PROMPT } from './system-prompt';

const LS_KEY = 'rackcad_openrouter_key';
const LS_MODEL_KEY = 'rackcad_openrouter_model';
export const DEFAULT_OPENROUTER_MODEL = 'qwen/qwen-3.5-72b-instruct';

export const AVAILABLE_OPENROUTER_MODELS = [
  { id: 'qwen/qwen-3.5-72b-instruct', label: 'qwen/qwen-3.5-72b-instruct (Qwen 3.5 Flagship)' },
  { id: 'qwen/qwen-3.5-coder-32b-instruct', label: 'qwen/qwen-3.5-coder-32b-instruct (Qwen 3.5 Coder)' },
  { id: 'deepseek/deepseek-v4-pro', label: 'deepseek/deepseek-v4-pro (DeepSeek V4 Pro)' },
  { id: 'openai/gpt-5.6-sol', label: 'openai/gpt-5.6-sol (GPT-5.6 Sol)' },
  { id: 'anthropic/claude-sonnet-5', label: 'anthropic/claude-sonnet-5 (Claude Sonnet 5)' },
  { id: 'meta-llama/llama-4-scion', label: 'meta-llama/llama-4-scion (Llama 4)' },
];

function buildUserMessage(context: RackContext, messages: AIMessage[]): string {
  const contextJson = JSON.stringify(context, null, 2);
  const history = messages.slice(0, -1).map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join('\n\n');
  const last = messages[messages.length - 1]?.content ?? '';
  return `[CONTEXT]\n${contextJson}\n\n${history ? `[HISTORY]\n${history}\n\n` : ''}[REQUEST]\n${last}`;
}

export class OpenRouterProvider implements AIProvider {
  readonly name: AIProviderName = 'openrouter';
  private fallback = new RuleEngine();

  private getKey(): string | null {
    return localStorage.getItem(LS_KEY);
  }

  static getModel(): string {
    return localStorage.getItem(LS_MODEL_KEY) || DEFAULT_OPENROUTER_MODEL;
  }

  static saveModel(model: string): void {
    localStorage.setItem(LS_MODEL_KEY, model);
  }

  static saveKey(key: string): void {
    localStorage.setItem(LS_KEY, key.trim());
  }

  static clearKey(): void {
    localStorage.removeItem(LS_KEY);
  }

  static hasKey(): boolean {
    return !!localStorage.getItem(LS_KEY);
  }

  async isAvailable(): Promise<boolean> {
    return !!this.getKey();
  }

  async getHints(context: RackContext, selectedId?: string): Promise<AIHint[]> {
    return this.fallback.getHints(context, selectedId);
  }

  async *chat(context: RackContext, messages: AIMessage[]): AsyncIterable<string> {
    const key = this.getKey();
    if (!key) {
      yield* this.fallback.chat(context, messages);
      return;
    }

    const model = OpenRouterProvider.getModel();
    const userPrompt = buildUserMessage(context, messages);

    const payload: any = {
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      stream: true,
      response_format: { type: 'json_object' },
    };

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
          'HTTP-Referer': window.location.origin || 'https://rackslicer.com',
          'X-Title': 'RackSlicer CAD',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errText = await response.text();
        let errMsg = `HTTP ${response.status} ${response.statusText}`;
        try {
          const parsed = JSON.parse(errText);
          if (parsed.error && parsed.error.message) {
            errMsg = parsed.error.message;
          }
        } catch {
          // ignore
        }
        yield JSON.stringify({ explanation: `OpenRouter error: ${errMsg}`, diff: null });
        return;
      }

      if (!response.body) {
        yield JSON.stringify({ explanation: 'OpenRouter error: No response body received', diff: null });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (jsonStr === '[DONE]') continue;

          try {
            const data = JSON.parse(jsonStr);
            const delta = data.choices?.[0]?.delta?.content;
            if (delta) {
              yield delta;
            }
          } catch {
            // ignore
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      yield JSON.stringify({ explanation: `OpenRouter connection error: ${msg}`, diff: null });
    }
  }

  parseDiff(raw: string): RackDiff {
    return this.fallback.parseDiff(raw);
  }
}
