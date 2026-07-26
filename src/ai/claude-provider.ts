import Anthropic from '@anthropic-ai/sdk';
import { AIProvider, AIProviderName, AIHint, AIMessage, RackContext, RackDiff } from './types';
import { RuleEngine } from './rule-engine';

const LS_KEY = 'rackcad_anthropic_key';
const MODEL = 'claude-opus-4-7';

const SYSTEM_PROMPT = `You are an expert datacenter engineer assistant embedded in RackCAD, a professional rack design tool.
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
  private fallback = new RuleEngine();

  private getKey(): string | null {
    return localStorage.getItem(LS_KEY);
  }

  private getClient(): Anthropic | null {
    const key = this.getKey();
    if (!key) return null;
    if (!this.client) {
      this.client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
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
    const client = this.getClient();
    if (!client) return false;
    try {
      await client.models.retrieve(MODEL);
      return true;
    } catch {
      return false;
    }
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

    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 2048,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
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
  }

  parseDiff(raw: string): RackDiff {
    return this.fallback.parseDiff(raw);
  }
}
