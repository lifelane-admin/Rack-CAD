import { AIProvider, AIProviderName, AIHint, AIMessage, RackContext, RackDiff } from './types';
import { RuleEngine } from './rule-engine';

const OLLAMA_BASE = 'http://localhost:11434';
const DEFAULT_MODEL = 'llama3';

export class LocalLLMProvider implements AIProvider {
  readonly name: AIProviderName = 'local';
  private fallback = new RuleEngine();

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(2000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  async getHints(context: RackContext, selectedId?: string): Promise<AIHint[]> {
    return this.fallback.getHints(context, selectedId);
  }

  async *chat(context: RackContext, messages: AIMessage[]): AsyncIterable<string> {
    const contextJson = JSON.stringify(context, null, 2);
    const last = messages[messages.length - 1]?.content ?? '';

    const systemPrompt = `You are a datacenter engineer assistant. The current rack layout is:\n${contextJson}\n\nAlways respond with JSON: {"explanation":"...","diff":null_or_object}`;

    const body = {
      model: DEFAULT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: last },
      ],
      stream: true,
    };

    let res: Response;
    try {
      res = await fetch(`${OLLAMA_BASE}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      yield* this.fallback.chat(context, messages);
      return;
    }

    if (!res.ok) {
      yield* this.fallback.chat(context, messages);
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') return;
        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // malformed chunk — skip
        }
      }
    }
  }

  parseDiff(raw: string): RackDiff {
    return this.fallback.parseDiff(raw);
  }
}
