import { AIProvider, AIProviderName, AIHint, AIMessage, RackContext, RackDiff } from './types';
import { RuleEngine } from './rule-engine';
import { SYSTEM_PROMPT } from './system-prompt';

const LS_KEY = 'rackcad_gemini_key';
const LS_MODEL_KEY = 'rackcad_gemini_model';
export const DEFAULT_GEMINI_MODEL = 'gemini-3.6-flash';

export const AVAILABLE_GEMINI_MODELS = [
  { id: 'gemini-3.6-flash', label: 'gemini-3.6-flash (Fast & Intelligent Multimodal)' },
  { id: 'gemini-2.5-flash', label: 'gemini-2.5-flash (Ultra-Fast Flash)' },
  { id: 'gemini-2.5-flash-lite', label: 'gemini-2.5-flash-lite (High-Volume / Low-Cost)' },
  { id: 'gemini-2.5-pro', label: 'gemini-2.5-pro (Advanced Reasoning)' },
  { id: 'gemini-2.0-flash', label: 'gemini-2.0-flash (Fast Multimodal)' },
  { id: 'gemini-1.5-flash', label: 'gemini-1.5-flash (Legacy Flash)' },
];

export function normalizeGeminiModel(model: string): string {
  let clean = model.replace(/^models\//, '').trim();
  if (!clean) return DEFAULT_GEMINI_MODEL;
  if (clean === 'gemini-3.6') return 'gemini-3.6-flash';
  if (clean === 'gemini-3.8-flash' || clean === 'gemini-3.7-flash') return 'gemini-3.6-flash';
  return clean;
}

function buildUserMessage(context: RackContext, messages: AIMessage[]): string {
  const contextJson = JSON.stringify(context, null, 2);
  const history = messages.slice(0, -1).map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join('\n\n');
  const last = messages[messages.length - 1]?.content ?? '';
  return `[CONTEXT]\n${contextJson}\n\n${history ? `[HISTORY]\n${history}\n\n` : ''}[REQUEST]\n${last}`;
}

export function cleanJsonResponse(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  }
  const startIdx = cleaned.indexOf('{');
  const endIdx = cleaned.lastIndexOf('}');
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    cleaned = cleaned.substring(startIdx, endIdx + 1);
  }
  return cleaned;
}

export class GeminiProvider implements AIProvider {
  readonly name: AIProviderName = 'gemini';
  private fallback = new RuleEngine();

  private getKey(): string | null {
    return localStorage.getItem(LS_KEY);
  }

  static getModel(): string {
    const raw = localStorage.getItem(LS_MODEL_KEY) || DEFAULT_GEMINI_MODEL;
    return normalizeGeminiModel(raw);
  }

  static saveModel(model: string): void {
    localStorage.setItem(LS_MODEL_KEY, normalizeGeminiModel(model));
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
    const cleanModel = normalizeGeminiModel(model);
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

      // If requested model streaming encounters errors (503/429/404/400), try non-streaming generateContent and fallback models
      if (!response.ok && (response.status === 503 || response.status === 429 || response.status === 404 || response.status === 400)) {
        // Try non-streaming endpoint for primary model first
        try {
          const nonStreamEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${encodeURIComponent(key)}`;
          const nsResp = await fetch(nonStreamEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': key,
            },
            body: JSON.stringify(payload),
          });
          if (nsResp.ok) {
            const data = await nsResp.json();
            const textPart = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (textPart) {
              yield textPart;
              return;
            }
          }
        } catch {
          // ignore
        }

        const fallbackCandidates = [
          'gemini-3.6-flash',
          'gemini-2.5-flash',
          'gemini-2.5-flash-lite',
          'gemini-2.0-flash',
          'gemini-1.5-flash',
          'gemini-2.5-pro',
        ].filter(m => m !== cleanModel);

        for (const candidate of fallbackCandidates) {
          try {
            const fallbackEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${candidate}:generateContent?key=${encodeURIComponent(key)}`;
            const fallbackResp = await fetch(fallbackEndpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': key,
              },
              body: JSON.stringify(payload),
            });
            if (fallbackResp.ok) {
              const data = await fallbackResp.json();
              const textPart = data.candidates?.[0]?.content?.parts?.[0]?.text;
              if (textPart) {
                yield textPart;
                return;
              }
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
          explanation: `Gemini error: ${errMsg}\n\n💡 **Tip**: Please verify your API key or try switching models in AI Settings (⚙). Recommended models: \`gemini-3.6-flash\` or \`gemini-2.5-flash\`.`, 
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
      let hasYielded = false;

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
              hasYielded = true;
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
            hasYielded = true;
            yield textPart;
          }
        } catch {
          // ignore
        }
      } else if (!hasYielded && buffer.trim()) {
        try {
          const data = JSON.parse(buffer.trim());
          const textPart = data.candidates?.[0]?.content?.parts?.[0]?.text || (typeof data.explanation === 'string' ? JSON.stringify(data) : null);
          if (textPart) {
            hasYielded = true;
            yield textPart;
          }
        } catch {
          // ignore
        }
      }

      if (!hasYielded) {
        yield JSON.stringify({
          explanation: 'Gemini returned an empty response. Please try rephrasing your request or checking your API key quota.',
          diff: null,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      yield JSON.stringify({ explanation: `Gemini connection error: ${msg}`, diff: null });
    }
  }

  parseDiff(raw: string): RackDiff {
    const cleaned = cleanJsonResponse(raw);
    try {
      const parsed = JSON.parse(cleaned);
      if (
        parsed &&
        typeof parsed.explanation === 'string' &&
        (parsed.diff === null || (typeof parsed.diff === 'object' && !Array.isArray(parsed.diff)))
      ) {
        return parsed as RackDiff;
      }
    } catch {
      // not direct JSON
    }
    return this.fallback.parseDiff(raw);
  }
}
