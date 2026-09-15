import { AIProvider, AIProviderName, AIHint, AIMessage, RackContext, RackDiff } from './types';
import { RuleEngine } from './rule-engine';

const LS_KEY = 'rackcad_deepseek_key';
const LS_MODEL_KEY = 'rackcad_deepseek_model';
export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-pro';

export const AVAILABLE_DEEPSEEK_MODELS = [
  { id: 'deepseek-v4-pro', label: 'deepseek-v4-pro (Flagship Reasoning & Agentic)' },
  { id: 'deepseek-v4-flash', label: 'deepseek-v4-flash (High-Performance / Lower-Cost)' },
  { id: 'deepseek-v4-flash-vision-exp', label: 'deepseek-v4-flash-vision-exp (Multimodal / Vision Experimental)' },
  { id: 'deepseek-reasoner', label: 'deepseek-reasoner (DeepSeek-R1 CoT Reasoning)' },
  { id: 'deepseek-chat', label: 'deepseek-chat (DeepSeek-V3 MoE)' },
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

export class DeepSeekProvider implements AIProvider {
  readonly name: AIProviderName = 'deepseek';
  private fallback = new RuleEngine();

  private getKey(): string | null {
    return localStorage.getItem(LS_KEY);
  }

  static getModel(): string {
    return localStorage.getItem(LS_MODEL_KEY) || DEFAULT_DEEPSEEK_MODEL;
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

    const model = DeepSeekProvider.getModel();
    const userPrompt = buildUserMessage(context, messages);
    const isReasoner = model === 'deepseek-reasoner';

    const requestMessages = [
      { role: isReasoner ? 'user' : 'system', content: isReasoner ? `${SYSTEM_PROMPT}\n\n${userPrompt}` : SYSTEM_PROMPT },
    ];
    if (!isReasoner) {
      requestMessages.push({ role: 'user', content: userPrompt });
    }

    const payload: any = {
      model,
      messages: requestMessages,
      stream: true,
    };

    if (!isReasoner) {
      payload.response_format = { type: 'json_object' };
    }

    try {
      const response = await fetch('https://api.deepseek.com/chat/completions', {
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
        yield JSON.stringify({ explanation: `DeepSeek error: ${errMsg}`, diff: null });
        return;
      }

      if (!response.body) {
        yield JSON.stringify({ explanation: 'DeepSeek error: No response body received', diff: null });
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
      yield JSON.stringify({ explanation: `DeepSeek connection error: ${msg}`, diff: null });
    }
  }

  parseDiff(raw: string): RackDiff {
    return this.fallback.parseDiff(raw);
  }
}
