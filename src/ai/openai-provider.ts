import { AIProvider, AIProviderName, AIHint, AIMessage, RackContext, RackDiff } from './types';
import { RuleEngine } from './rule-engine';

const LS_KEY = 'rackcad_openai_key';
const LS_MODEL_KEY = 'rackcad_openai_model';
export const DEFAULT_OPENAI_MODEL = 'gpt-5.6-sol';

export const AVAILABLE_OPENAI_MODELS = [
  { id: 'gpt-5.6-sol', label: 'gpt-5.6-sol (Flagship / Maximum Reasoning)' },
  { id: 'gpt-5.6-terra', label: 'gpt-5.6-terra (Balanced Performance)' },
  { id: 'gpt-5.6-luna', label: 'gpt-5.6-luna (Fast / Economical)' },
  { id: 'gpt-4.5-preview', label: 'gpt-4.5-preview (Research Flagship)' },
  { id: 'o3-mini', label: 'o3-mini (Advanced STEM & Architecture)' },
];

const SYSTEM_PROMPT = `You are an expert datacenter engineer assistant embedded in Rack Slicer, a professional rack design tool.
You receive the current rack layout as JSON and a user request.

ALWAYS respond with valid JSON matching exactly this schema:
{"explanation": "<markdown text to show the user>", "diff": <RackDiff object> | null}

diff is null when no canvas change is needed (analysis, questions, reports).
For diffs, use minimal operations — only change what was explicitly requested.

Before suggesting device placements: check for free RUs.
Before suggesting cables: verify ports are not already connected.
For cable routing: respect the current routingMode (overhead/underfloor).
Validate: power draw <80% PDU capacity warning, <95% error; verify port type compatibility.`;

function buildUserMessage(context: RackContext, messages: AIMessage[]): string {
  const contextJson = JSON.stringify(context, null, 2);
  const history = messages.slice(0, -1).map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join('\n\n');
  const last = messages[messages.length - 1]?.content ?? '';
  return `[CONTEXT]\n${contextJson}\n\n${history ? `[HISTORY]\n${history}\n\n` : ''}[REQUEST]\n${last}`;
}

export class OpenAIProvider implements AIProvider {
  readonly name: AIProviderName = 'openai';
  private fallback = new RuleEngine();

  private getKey(): string | null {
    return localStorage.getItem(LS_KEY);
  }

  static getModel(): string {
    return localStorage.getItem(LS_MODEL_KEY) || DEFAULT_OPENAI_MODEL;
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

    const model = OpenAIProvider.getModel();
    const userPrompt = buildUserMessage(context, messages);
    const isReasoningModel = model.startsWith('o1') || model.startsWith('o3');

    const requestMessages = isReasoningModel
      ? [{ role: 'user', content: `${SYSTEM_PROMPT}\n\n${userPrompt}` }]
      : [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ];

    const payload: any = {
      model,
      messages: requestMessages,
      stream: true,
    };

    if (!isReasoningModel) {
      payload.response_format = { type: 'json_object' };
    }

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
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
        yield JSON.stringify({ explanation: `OpenAI error: ${errMsg}`, diff: null });
        return;
      }

      if (!response.body) {
        yield JSON.stringify({ explanation: 'OpenAI error: No response body received', diff: null });
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
            // ignore non-json SSE lines
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      yield JSON.stringify({ explanation: `OpenAI connection error: ${msg}`, diff: null });
    }
  }

  parseDiff(raw: string): RackDiff {
    return this.fallback.parseDiff(raw);
  }
}
