import { AIProvider, AIProviderName, AIHint, AIMessage, RackContext, RackDiff } from './types';
import { RuleEngine } from './rule-engine';
import { SYSTEM_PROMPT } from './system-prompt';

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

    const systemPrompt = `${SYSTEM_PROMPT}

## CURRENT RACK LAYOUT
${contextJson}`;

    const body = {
      model: DEFAULT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
      stream: true,
      max_tokens: 2048,
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
    if (!reader) {
      console.error('[LocalLLM] Response body is null');
      yield* this.fallback.chat(context, messages);
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
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
    } catch (err) {
      // Stream timeout or abort — fall back gracefully
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[LocalLLM] Stream error: ${msg}`);
      yield* this.fallback.chat(context, messages);
    } finally {
      reader.cancel().catch(() => {});
    }
  }

  parseDiff(raw: string): RackDiff {
    return this.fallback.parseDiff(raw);
  }
}
