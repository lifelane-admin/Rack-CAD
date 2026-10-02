import { eventBus } from '../core/event-bus';
import { aiService } from '../ai/ai-service';
import { AIMessage, RackDiff } from '../ai/types';

export class AIPanel {
  private el: HTMLElement;
  private messagesEl: HTMLElement;
  private inputEl: HTMLInputElement;
  private sendBtn: HTMLButtonElement;
  private thinkingEl: HTMLElement;
  private messages: AIMessage[] = [];
  private streaming = false;
  private currentAssistantEl: HTMLElement | null = null;
  private pendingDiff: RackDiff | null = null;

  constructor() {
    this.el = this.buildDOM();
    document.body.appendChild(this.el);
    this.messagesEl = this.el.querySelector('.ai-messages')!;
    this.inputEl = this.el.querySelector('.ai-input-row input') as HTMLInputElement;
    this.sendBtn = this.el.querySelector('.ai-input-row button') as HTMLButtonElement;
    this.thinkingEl = this.el.querySelector('.ai-thinking')!;
    this.bindEvents();
  }

  private buildDOM(): HTMLElement {
    const div = document.createElement('div');
    div.className = 'ai-panel';
    div.id = 'ai-panel';
    div.innerHTML = `
      <div class="ai-panel-header">
        <span class="provider-dot" id="ai-dot"></span>
        <span id="ai-panel-provider">&#x2699; Rules</span>
        <button id="ai-panel-settings-btn" style="background:rgba(56,189,248,0.12); border:1px solid rgba(56,189,248,0.3); border-radius:4px; padding:2px 7px; color:#38bdf8; font-size:11px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:4px; margin-left:6px;" title="AI Settings & API Key">
          ⚙️ AI Settings
        </button>
        <span style="flex:1"></span>
        <button id="ai-panel-close" style="background:none;border:none;color:#888;cursor:pointer;font-size:16px" title="Close AI Panel">&#x2715;</button>
      </div>
      <div class="ai-messages"></div>
      <div class="ai-thinking" style="display:none">
        <span>&#x25C9;</span> Thinking...
      </div>
      <div class="ai-input-row">
        <input type="text" placeholder="Type a request..." />
        <button>&#x25B6;</button>
      </div>
    `;
    return div;
  }

  private bindEvents(): void {
    this.el.querySelector('#ai-panel-close')!.addEventListener('click', () => this.close());
    this.el.querySelector('#ai-panel-settings-btn')?.addEventListener('click', () => {
      document.getElementById('ai-key-modal')?.classList.remove('hidden');
    });
    this.el.querySelector('#ai-panel-provider')?.addEventListener('click', () => {
      document.getElementById('ai-key-modal')?.classList.remove('hidden');
    });

    this.sendBtn.addEventListener('click', () => this.sendMessage());
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendMessage(); }
    });

    eventBus.on('ai:mode-changed', (enabled) => {
      enabled ? this.open() : this.close();
    });

    eventBus.on('ai:provider-changed', (name) => {
      const labels: Record<string, string> = {
        gemini: '✨ Gemini',
        deepseek: '🐋 DeepSeek',
        openrouter: '🌐 OpenRouter',
        openai: '🟢 OpenAI',
        claude: '☁ Claude',
        local: '⚡ Local',
        rules: '⚙ Rules',
      };
      const el = document.getElementById('ai-panel-provider');
      if (el) {
        el.innerHTML = labels[name] ?? '⚙ Rules';
        el.style.cursor = 'pointer';
        el.title = 'Click to open AI Settings & Key';
      }
    });

    eventBus.on('ai:stream-chunk', (_chunk) => {
      if (!this.currentAssistantEl) {
        this.currentAssistantEl = document.createElement('div');
        this.currentAssistantEl.className = 'ai-msg assistant';
        this.currentAssistantEl.style.opacity = '0.7';
        this.currentAssistantEl.style.fontStyle = 'italic';
        this.currentAssistantEl.textContent = 'Analyzing layout & generating response...';
        this.messagesEl.appendChild(this.currentAssistantEl);
      }
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    });

    eventBus.on('ai:stream-done', (rackDiff) => {
      this.streaming = false;
      this.thinkingEl.style.display = 'none';
      this.sendBtn.disabled = false;

      const explanation = rackDiff.explanation || '(no response)';

      if (this.currentAssistantEl) {
        this.currentAssistantEl.remove();
        this.currentAssistantEl = null;
      }

      const formattedEl = this.formatExplanation(explanation);
      this.messagesEl.appendChild(formattedEl);
      this.messages.push({ role: 'assistant', content: explanation });

      if (rackDiff.diff) {
        this.pendingDiff = rackDiff;
        aiService.applyRackDiff(rackDiff);
        this.showAppliedBadge(rackDiff);
      }
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    });

    eventBus.on('ai:error', (msg) => {
      this.streaming = false;
      this.thinkingEl.style.display = 'none';
      this.sendBtn.disabled = false;
      if (this.currentAssistantEl) {
        this.currentAssistantEl.remove();
        this.currentAssistantEl = null;
      }
      this.appendMessage('assistant', `⚠ Error: ${msg}`);
    });
  }

  private formatExplanation(raw: string): HTMLElement {
    const container = document.createElement('div');
    container.className = 'ai-msg assistant';

    let text = raw;
    try {
      let cleaned = raw.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      }
      if (cleaned.startsWith('{')) {
        const parsed = JSON.parse(cleaned);
        if (parsed && typeof parsed.explanation === 'string') {
          text = parsed.explanation;
        }
      }
    } catch {
      // not JSON
    }

    const enableMatch = text.includes('Enable Claude or Local AI for natural language requests') || text.includes('No AI API Key connected');
    const cleanText = text
      .replace(/\(Enable Claude or Local AI for natural language requests\.\)/g, '')
      .replace(/\(No AI API Key connected\. Click ⚙ AI Settings to connect Google Gemini, DeepSeek, OpenAI, or Claude for natural language CAD generation\.\)/g, '')
      .trim();

    const paragraphs = cleanText.split('\n');
    paragraphs.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        container.appendChild(document.createElement('br'));
      } else if (trimmed.startsWith('•') || trimmed.startsWith('*') || trimmed.startsWith('-')) {
        const li = document.createElement('div');
        li.style.cssText = 'padding-left: 8px; margin-bottom: 4px; color: #e2e8f0; line-height: 1.4;';
        li.textContent = trimmed;
        container.appendChild(li);
      } else {
        const p = document.createElement('div');
        p.style.cssText = 'margin-bottom: 6px; font-weight: 500; color: #f1f5f9;';
        p.textContent = trimmed;
        container.appendChild(p);
      }
    });

    if (enableMatch) {
      const banner = document.createElement('div');
      banner.style.cssText = 'margin-top: 12px; padding: 10px 12px; background: rgba(56,189,248,0.08); border: 1px dashed rgba(56,189,248,0.35); border-radius: 6px; font-size: 11px;';
      banner.innerHTML = `
        <div style="color: #38bdf8; font-weight: 700; margin-bottom: 4px; font-size: 12px;">✨ Connect Gemini or AI Provider for Autonomous CAD Generation</div>
        <div style="color: #94a3b8; margin-bottom: 8px; line-height: 1.4;">To automatically place servers, Top-of-Rack switches, and route cables from natural language, connect your Google Gemini API Key or other preferred AI provider.</div>
        <button class="ai-connect-btn" style="background: #38bdf8; color: #0d1117; font-weight: 700; border: none; border-radius: 4px; padding: 6px 12px; font-size: 11px; cursor: pointer; transition: transform 0.15s ease;">
          🔑 Connect AI API Key
        </button>
      `;
      banner.querySelector('.ai-connect-btn')?.addEventListener('click', () => {
        document.getElementById('ai-key-modal')?.classList.remove('hidden');
      });
      container.appendChild(banner);
    }

    return container;
  }

  private showAppliedBadge(diff: RackDiff): void {
    const ops = diff.diff!;
    const parts: string[] = [];
    if (ops.addRacks?.length) parts.push(`${ops.addRacks.length} rack${ops.addRacks.length > 1 ? 's' : ''}`);
    if (ops.addDevices?.length) parts.push(`${ops.addDevices.length} device${ops.addDevices.length > 1 ? 's' : ''}`);
    if (ops.addCables?.length) parts.push(`${ops.addCables.length} cable${ops.addCables.length > 1 ? 's' : ''}`);
    if (ops.removeDevices?.length) parts.push(`removed ${ops.removeDevices.length} device${ops.removeDevices.length > 1 ? 's' : ''}`);
    if (ops.removeCables?.length) parts.push(`removed ${ops.removeCables.length} cable${ops.removeCables.length > 1 ? 's' : ''}`);

    const summary = parts.length ? parts.join(', ') : 'changes';
    eventBus.emit('notification', { message: `✓ Applied: ${summary}`, type: 'success' });

    const badge = document.createElement('div');
    badge.className = 'ai-applied-badge';
    badge.innerHTML = `<span style="color:#4ade80">✓ Applied to canvas:</span> ${summary}`;
    this.messagesEl.appendChild(badge);
  }

  private appendMessage(role: 'user' | 'assistant', content: string): void {
    const div = document.createElement('div');
    div.className = `ai-msg ${role}`;
    div.textContent = content;
    this.messagesEl.appendChild(div);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  private async sendMessage(): Promise<void> {
    const text = this.inputEl.value.trim();
    if (!text || this.streaming) return;

    this.inputEl.value = '';
    this.appendMessage('user', text);
    this.messages.push({ role: 'user', content: text });
    if (this.messages.length > 20) {
      this.messages = this.messages.slice(-20);
    }

    this.streaming = true;
    this.sendBtn.disabled = true;
    this.thinkingEl.style.display = 'flex';

    await aiService.chat([...this.messages]);
  }

  open(): void { this.el.classList.add('open'); }
  close(): void {
    this.el.classList.remove('open');
    if (this.streaming) {
      this.streaming = false;
      this.sendBtn.disabled = false;
      this.thinkingEl.style.display = 'none';
    }
  }
}
