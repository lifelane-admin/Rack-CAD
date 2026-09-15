import { AIProvider, AIProviderName, AIHint, AIMessage, RackContext, RackDiff } from './types';
import { RuleEngine } from './rule-engine';

const LS_KEY = 'rackcad_gemini_key';
const LS_MODEL_KEY = 'rackcad_gemini_model';
export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

export const AVAILABLE_GEMINI_MODELS = [
  { id: 'gemini-3.8-flash', label: 'gemini-3.8-flash (Latest Stable High-Performance Flash)' },
  { id: 'gemini-3.7-flash', label: 'gemini-3.7-flash (Strong Agentic & Coding Flash)' },
  { id: 'gemini-3.6-flash', label: 'gemini-3.6-flash (Multimodal / General Purpose)' },
  { id: 'gemini-3.5-flash-lite', label: 'gemini-3.5-flash-lite (High-Volume / Low-Cost)' },
  { id: 'gemini-3.1-pro-preview', label: 'gemini-3.1-pro-preview (Advanced Reasoning)' },
  { id: 'gemini-2.5-pro', label: 'gemini-2.5-pro (Advanced Reasoning)' },
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

export class GeminiProvider implements AIProvider {
  readonly name: AIProviderName = 'gemini';
  private fallback = new RuleEngine();

  private getKey(): string | null {
    return localStorage.getItem(LS_KEY);
  }

  static getModel(): string {
    return localStorage.getItem(LS_MODEL_KEY) || DEFAULT_GEMINI_MODEL;
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

    const model = GeminiProvider.getModel();
    const cleanModel = model.replace(/^models\//, '');
    const userPrompt = buildUserMessage(context, messages);

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`;

    const payload = {
      systemInstruction: {
        parts: [{ text: SYSTEM_PROMPT }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: userPrompt }],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
      },
    };

    try {
      let response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': key,
        },
        body: JSON.stringify(payload),
      });

      // If requested model encounters high demand (503/429) or is not found (404/400), try fallback models
      if (!response.ok && (response.status === 503 || response.status === 429 || response.status === 404 || response.status === 400)) {
        const fallbackCandidates = [
          'gemini-2.5-flash',
          'gemini-2.0-flash',
          'gemini-1.5-flash',
          'gemini-2.5-pro',
        ].filter(m => m !== cleanModel);

        for (const candidate of fallbackCandidates) {
          try {
            const fallbackEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${candidate}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`;
            const fallbackResp = await fetch(fallbackEndpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': key,
              },
              body: JSON.stringify(payload),
            });
            if (fallbackResp.ok) {
              response = fallbackResp;
              break;
            }
          } catch {
            // continue fallback search
          }
        }
      }

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
        yield JSON.stringify({ 
          explanation: `Gemini error: ${errMsg}\n\n💡 **Tip**: Google's servers are temporarily experiencing high demand on this model. You can:\n1. Click **AI Settings (⚙)** and switch to another model (e.g., \`gemini-2.5-flash\` or \`gemini-2.0-flash\`).\n2. Or switch to **🐋 DeepSeek**, **🌐 OpenRouter**, or **🟢 OpenAI** in the AI Settings dialog.`, 
          diff: null 
        });
        return;
      }

      if (!response.body) {
        yield JSON.stringify({ explanation: 'Gemini error: No response body received', diff: null });
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
            const textPart = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (textPart) {
              yield textPart;
            }
          } catch {
            // ignore non-json SSE lines
          }
        }
      }

      if (buffer.trim().startsWith('data:')) {
        const jsonStr = buffer.trim().slice(5).trim();
        try {
          const data = JSON.parse(jsonStr);
          const textPart = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (textPart) {
            yield textPart;
          }
        } catch {
          // ignore
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      yield JSON.stringify({ explanation: `Gemini connection error: ${msg}`, diff: null });
    }
  }

  parseDiff(raw: string): RackDiff {
    return this.fallback.parseDiff(raw);
  }
}
