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
        <span style="flex:1"></span>
        <button id="ai-panel-close" style="background:none;border:none;color:#888;cursor:pointer;font-size:16px">&#x2715;</button>
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

    this.sendBtn.addEventListener('click', () => this.sendMessage());
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendMessage(); }
    });

    eventBus.on('ai:mode-changed', (enabled) => {
      enabled ? this.open() : this.close();
    });

    eventBus.on('ai:provider-changed', (name) => {
      const labels: Record<string, string> = { claude: '&#x2601; Claude', local: '&#x26A1; Local', rules: '&#x2699; Rules' };
      const el = document.getElementById('ai-panel-provider');
      if (el) el.innerHTML = labels[name] ?? '&#x2699; Rules';
    });

    eventBus.on('ai:stream-chunk', (chunk) => {
      if (!this.currentAssistantEl) {
        this.currentAssistantEl = document.createElement('div');
        this.currentAssistantEl.className = 'ai-msg assistant';
        this.messagesEl.appendChild(this.currentAssistantEl);
      }
      this.currentAssistantEl.textContent += chunk;
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    });

    eventBus.on('ai:stream-done', (rackDiff) => {
      this.streaming = false;
      this.thinkingEl.style.display = 'none';
      this.sendBtn.disabled = false;
      const assistantText = this.currentAssistantEl?.textContent ?? '';
      this.currentAssistantEl = null;
      if (assistantText) {
        this.messages.push({ role: 'assistant', content: assistantText });
      }
      if (!assistantText && rackDiff.diff === null) {
        this.appendMessage('assistant', '(no response)');
      }

      if (rackDiff.diff) {
        this.pendingDiff = rackDiff;
        this.showDiffCard(rackDiff);
      }
    });

    eventBus.on('ai:error', (msg) => {
      this.streaming = false;
      this.thinkingEl.style.display = 'none';
      this.sendBtn.disabled = false;
      this.appendMessage('assistant', `⚠ Error: ${msg}`);
    });
  }

  private showDiffCard(diff: RackDiff): void {
    const ops = diff.diff!;
    const lines: string[] = [];
    if (ops.addDevices?.length) lines.push(`• Add ${ops.addDevices.length} device(s)`);
    if (ops.removeDevices?.length) lines.push(`• Remove ${ops.removeDevices.length} device(s)`);
    if (ops.addCables?.length) lines.push(`• Add ${ops.addCables.length} cable(s)`);
    if (ops.removeCables?.length) lines.push(`• Remove ${ops.removeCables.length} cable(s)`);
    if (ops.updateAnchors?.length) lines.push(`• Re-route ${ops.updateAnchors.length} cable(s)`);
    if (ops.addRacks?.length) lines.push(`• Add ${ops.addRacks.length} rack(s)`);

    const card = document.createElement('div');
    card.className = 'ai-diff-card';
    card.innerHTML = `
      <div><strong>Suggested changes:</strong></div>
      <div class="diff-summary"></div>
      <div class="diff-actions">
        <button class="btn-preview">Preview</button>
        <button class="btn-apply">Apply</button>
        <button class="btn-dismiss">&#x2715;</button>
      </div>
    `;
    const summaryEl = card.querySelector('.diff-summary')!;
    lines.forEach(line => {
      const p = document.createElement('div');
      p.textContent = line;
      summaryEl.appendChild(p);
    });
    card.querySelector('.btn-preview')!.addEventListener('click', () => {
      aiService.setPreviewDiff(diff);
      eventBus.emit('ai:preview-diff', diff);
    });
    card.querySelector('.btn-apply')!.addEventListener('click', () => {
      aiService.applyRackDiff(diff);
      eventBus.emit('notification', { message: 'AI changes applied', type: 'success' });
      card.remove();
      this.pendingDiff = null;
    });
    card.querySelector('.btn-dismiss')!.addEventListener('click', () => {
      aiService.setPreviewDiff(null);
      card.remove();
      this.pendingDiff = null;
    });
    this.messagesEl.appendChild(card);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
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
