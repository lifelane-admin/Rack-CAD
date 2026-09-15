import Anthropic from '@anthropic-ai/sdk';
import { AIProvider, AIProviderName, AIHint, AIMessage, RackContext, RackDiff } from './types';
import { RuleEngine } from './rule-engine';

const LS_KEY = 'rackcad_anthropic_key';
const LS_MODEL_KEY = 'rackcad_anthropic_model';
export const DEFAULT_CLAUDE_MODEL = 'claude-opus-5';

export const AVAILABLE_CLAUDE_MODELS = [
  { id: 'claude-opus-5', label: 'claude-opus-5 (Newest Flagship & Maximum Capability)' },
  { id: 'claude-fable-5', label: 'claude-fable-5 (High-End Creative & Architecture)' },
  { id: 'claude-sonnet-5', label: 'claude-sonnet-5 (Current Sonnet Generation)' },
  { id: 'claude-opus-4-8', label: 'claude-opus-4-8 (Active Opus 4 Generation)' },
  { id: 'claude-sonnet-4-6', label: 'claude-sonnet-4-6 (Active Sonnet 4 Generation)' },
  { id: 'claude-haiku-4-5-20251001', label: 'claude-haiku-4-5-20251001 (Fast & Economical)' },
  { id: 'claude-3-7-sonnet-20250219', label: 'claude-3-7-sonnet-20250219 (Hybrid Reasoning)' },
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

export class ClaudeProvider implements AIProvider {
  readonly name: AIProviderName = 'claude';
  private client: Anthropic | null = null;
  private clientKey: string | null = null;
  private fallback = new RuleEngine();

  private getKey(): string | null {
    return localStorage.getItem(LS_KEY);
  }

  static getModel(): string {
    return localStorage.getItem(LS_MODEL_KEY) || DEFAULT_CLAUDE_MODEL;
  }

  static saveModel(model: string): void {
    localStorage.setItem(LS_MODEL_KEY, model);
  }

  private getClient(): Anthropic | null {
    const key = this.getKey();
    if (!key) {
      this.client = null;
      this.clientKey = null;
      return null;
    }
    if (!this.client || this.clientKey !== key) {
      this.client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
      this.clientKey = key;
    }
    return this.client;
  }

  static saveKey(key: string): void {
    localStorage.setItem(LS_KEY, key);
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
    const client = this.getClient();
    if (!client) {
      yield* this.fallback.chat(context, messages);
      return;
    }

    const userMessage = buildUserMessage(context, messages);
    const model = ClaudeProvider.getModel();

    try {
      const stream = client.messages.stream({
        model,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      });

      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          yield event.delta.text;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      yield JSON.stringify({ explanation: `Claude error: ${msg}`, diff: null });
    }
  }

  parseDiff(raw: string): RackDiff {
    return this.fallback.parseDiff(raw);
  }
}
