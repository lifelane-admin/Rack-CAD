import EventBus from '../core/event-bus';
import State from '../core/state';
import { ToolMode } from '../core/types';
import { ClaudeProvider } from '../ai/claude-provider';

const TOOLS: { id: string; tool: ToolMode; title: string; svg: string }[] = [
  {
    id: 'tb-tool-select', tool: 'select', title: 'Select (V)',
    svg: '<svg viewBox="0 0 24 24"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" fill="currentColor" stroke="currentColor" stroke-width="1.5"/></svg>',
  },
  {
    id: 'tb-tool-pan', tool: 'pan', title: 'Pan (H)',
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 11V6a2 2 0 00-2-2 2 2 0 00-2 2v5m0-5V5a2 2 0 00-2-2 2 2 0 00-2 2v8m0-8V7a2 2 0 00-2-2 2 2 0 00-2 2v6m0-5V9a2 2 0 00-2-2 2 2 0 00-2 2v10a7 7 0 0014 0v-8"/></svg>',
  },
  {
    id: 'tb-tool-cable', tool: 'cable', title: 'Draw Ethernet Cable (C)',
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="3" width="6" height="6" rx="1"/><rect x="3" y="15" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/><path d="M12 9v4M6 15v-2h12v2"/></svg>',
  },
  {
    id: 'tb-tool-power', tool: 'power', title: 'Draw Power Cable (P)',
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 2v4M15 2v4"/><path d="M7 6h10v4a5 5 0 01-10 0V6z"/><path d="M12 15v7"/></svg>',
  },
  {
    id: 'tb-tool-text', tool: 'text', title: 'Add Text Label (T)',
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 5h16M12 5v14M9 19h6"/></svg>',
  },
];

const FLOAT_TOGGLE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>';

export class Toolbar {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  render() {
    this.container.innerHTML = '';
    this.container.className = 'toolbar';

    const inner = document.createElement('div');
    inner.className = 'toolbar-inner';

    // ── Tool strip ──────────────────────────────────────────────────────────
    const strip = document.createElement('div');
    strip.className = 'tb-strip';
    const currentTool = State.getState().tool;
    TOOLS.forEach(({ id, tool, title, svg }) => {
      const btn = document.createElement('button');
      btn.id = id;
      btn.className = 'toolbar-btn tb-tool' + (currentTool === tool ? ' active' : '');
      btn.title = title;
      btn.innerHTML = svg;
      btn.addEventListener('click', () => EventBus.emit('tool:changed', tool));
      strip.appendChild(btn);
    });
    inner.appendChild(strip);

    // ── Separator ───────────────────────────────────────────────────────────
    inner.appendChild(this.sep());

    // ── Menu bar ────────────────────────────────────────────────────────────
    // Each menu is a .tb-menu-wrap containing:
    //   .tb-menu  — the clickable header (textContent = "Label ▾")
    //   .tb-dropdown ul — the dropdown list (sibling to .tb-menu)
    // This keeps .tb-menu textContent clean so tests can extract the label.
    const menuBar = document.createElement('div');
    menuBar.className = 'tb-menus';
    menuBar.id = 'tb-menu-bar';

    const fileMenu = this.menu('File', [
      { label: 'New Project', kbd: '⌘N', action: () => EventBus.emit('file:new', undefined) },
      { label: 'Open…', kbd: '⌘O', action: () => EventBus.emit('file:open', undefined) },
      { label: 'Save', kbd: '⌘S', action: () => EventBus.emit('file:save', undefined) },
      { label: 'Save As…', kbd: '⌘⇧S', action: () => EventBus.emit('file:save-as', undefined) },
      'sep',
      { label: 'Load Demo…', action: () => EventBus.emit('file:demo', undefined) },
      { label: 'Insert Image…', action: () => EventBus.emit('image:insert' as any, undefined) },
    ]);
    menuBar.appendChild(fileMenu);

    const editMenu = this.menu('Edit', [
      { label: 'Undo', kbd: '⌘Z', action: () => EventBus.emit('edit:undo', undefined) },
      { label: 'Redo', kbd: '⌘⇧Z', action: () => EventBus.emit('edit:redo', undefined) },
      'sep',
      { label: 'Select All', kbd: '⌘A', action: () => {} },
      { label: 'Delete', kbd: '⌫', action: () => EventBus.emit('edit:delete', undefined) },
      'sep',
      { label: 'Add 42U Rack', action: () => EventBus.emit('rack:add', { units: 42 }) },
      { label: 'Add 48U Rack', action: () => EventBus.emit('rack:add', { units: 48 }) },
    ]);
    menuBar.appendChild(editMenu);

    const viewMenu = this.menu('View', [
      { label: 'Zoom In', kbd: '+', action: () => EventBus.emit('view:zoom-in', undefined) },
      { label: 'Zoom Out', kbd: '−', action: () => EventBus.emit('view:zoom-out', undefined) },
      'sep',
      { label: 'Show Grid', action: () => EventBus.emit('view:toggle-grid', undefined) },
      { label: 'Show Rulers', action: () => EventBus.emit('view:toggle-rulers', undefined) },
      { label: 'Snap to Grid', action: () => EventBus.emit('view:toggle-snap', undefined) },
      'sep',
      { label: 'Switch to Rack', action: () => EventBus.emit('view:switch', 'rack') },
      { label: 'Switch to Cloud', action: () => EventBus.emit('view:switch', 'cloud') },
      { label: 'Switch to Hybrid', action: () => EventBus.emit('view:switch', 'hybrid') },
      'sep',
      { label: '3D Panel', action: () => EventBus.emit('view:toggle-3d-panel', undefined) },
      { label: 'Toggle Theme', action: () => EventBus.emit('view:toggle-theme', undefined) },
    ]);
    menuBar.appendChild(viewMenu);

    const exportMenu = this.menu('Export', [
      { label: 'Export SVG…', action: () => EventBus.emit('export:svg', undefined) },
      { label: 'Export PNG…', action: () => EventBus.emit('export:png', undefined) },
      { label: 'Export JPEG…', action: () => EventBus.emit('export:jpeg', undefined) },
      { label: 'Export PDF…', action: () => EventBus.emit('export:pdf', undefined) },
      { label: 'Export HTML…', action: () => EventBus.emit('export:html', undefined) },
      'sep',
      { label: 'Design Report…', action: () => EventBus.emit('export:report' as any, undefined) },
    ]);
    menuBar.appendChild(exportMenu);

    // Conditionally render Cloud menu on initial render
    const initialView = State.getState().activeView;
    if (initialView === 'cloud' || initialView === 'hybrid') {
      const cloudMenu = this.menu('Cloud', [
        { label: 'Export Cloud SVG…', action: () => EventBus.emit('export:cloud-svg', undefined) },
        { label: 'Export Cloud PNG…', action: () => EventBus.emit('export:cloud-png', undefined) },
      ]);
      cloudMenu.id = 'tb-menu-cloud';
      menuBar.appendChild(cloudMenu);
    }

    inner.appendChild(menuBar);

    // ── Right zone ──────────────────────────────────────────────────────────
    const right = document.createElement('div');
    right.className = 'tb-right';

    // Float toggle
    const floatToggle = document.createElement('button');
    floatToggle.id = 'tb-float-toggle';
    floatToggle.className = 'toolbar-btn tb-float-toggle' + (State.getState().floatingToolbarVisible ? ' active' : '');
    floatToggle.title = 'Toggle floating toolbar';
    floatToggle.innerHTML = FLOAT_TOGGLE_SVG;
    floatToggle.addEventListener('click', () => {
      EventBus.emit('view:toggle-floating-toolbar', undefined);
    });
    right.appendChild(floatToggle);

    // AI / Rules toggle
    const aiBtn = document.createElement('button');
    aiBtn.className = 'toolbar-btn ai-toggle-btn';
    aiBtn.id = 'ai-toggle-btn';
    aiBtn.title = 'Enable / Disable AI Mode';
    const currentProvider = State.getState().aiProvider;
    const aiLabels: Record<string, string> = { claude: '☁ Claude', local: '⚡ Local', rules: '⚙ Rules' };
    aiBtn.innerHTML = `<span class="ai-badge" id="ai-provider-badge">${aiLabels[currentProvider] ?? '⚙ Rules'}</span>`;
    if (State.getState().aiMode) aiBtn.classList.add('active');
    aiBtn.addEventListener('click', () => {
      const current = State.getState().aiMode;
      if (!current && !ClaudeProvider.hasKey()) {
        if (State.getState().aiProvider === 'claude') {
          document.getElementById('ai-key-modal')?.classList.remove('hidden');
          return;
        }
      }
      const newMode = !current;
      State.setState({ aiMode: newMode });
      EventBus.emit('ai:mode-changed', newMode);
    });
    right.appendChild(aiBtn);

    inner.appendChild(right);
    this.container.appendChild(inner);

    // ── Helpers ─────────────────────────────────────────────────────────────
    const updateToolButtons = (mode: ToolMode) => {
      this.container.querySelectorAll<HTMLElement>('.tb-tool').forEach(btn => {
        btn.classList.toggle('active', btn.id === `tb-tool-${mode}`);
      });
    };

    // ── EventBus listeners ──────────────────────────────────────────────────
    EventBus.on('tool:changed', (mode: ToolMode) => {
      updateToolButtons(mode);
    });

    EventBus.on('state:changed', () => {
      const s = State.getState();

      // Update tool buttons
      updateToolButtons(s.tool);

      // Cloud menu — add/remove based on activeView
      const existing = menuBar.querySelector('#tb-menu-cloud');
      const needsCloud = s.activeView === 'cloud' || s.activeView === 'hybrid';
      if (needsCloud && !existing) {
        const cloudMenu = this.menu('Cloud', [
          { label: 'Export Cloud SVG…', action: () => EventBus.emit('export:cloud-svg', undefined) },
          { label: 'Export Cloud PNG…', action: () => EventBus.emit('export:cloud-png', undefined) },
        ]);
        cloudMenu.id = 'tb-menu-cloud';
        menuBar.appendChild(cloudMenu);
      } else if (!needsCloud && existing) {
        existing.remove();
      }

      // Float toggle active state
      const ft = this.container.querySelector<HTMLElement>('#tb-float-toggle');
      if (ft) ft.classList.toggle('active', s.floatingToolbarVisible);

      // AI badge + active state
      const badge = this.container.querySelector('#ai-provider-badge');
      if (badge) badge.textContent = aiLabels[s.aiProvider] ?? '⚙ Rules';
      const ai = this.container.querySelector('#ai-toggle-btn');
      if (ai) ai.classList.toggle('active', s.aiMode);
    });

    // Update float-toggle active state when toggle event fires.
    // We toggle the class directly (without re-reading state) because in tests
    // there may be no FloatingToolbar mounted to flip the state before this runs.
    EventBus.on('view:toggle-floating-toolbar', () => {
      const ft = this.container.querySelector<HTMLElement>('#tb-float-toggle');
      if (ft) ft.classList.toggle('active');
    });

    EventBus.on('ai:mode-changed', (enabled: boolean) => {
      this.container.querySelector('#ai-toggle-btn')?.classList.toggle('active', enabled);
    });
    EventBus.on('ai:provider-changed', (name) => {
      const badge = this.container.querySelector('#ai-provider-badge');
      if (badge) badge.textContent = aiLabels[name] ?? '⚙ Rules';
    });
  }

  private sep(): HTMLElement {
    const d = document.createElement('div');
    d.className = 'tb-sep';
    return d;
  }

  /**
   * Builds a menu widget. Structure:
   *
   *   div.tb-menu-wrap
   *     div.tb-menu          ← header; textContent = "Label ▾" (no dropdown text)
   *     ul.tb-dropdown       ← items (sibling, not child of .tb-menu)
   *
   * Keeping the dropdown outside .tb-menu ensures that textContent of .tb-menu
   * is only the label + caret, which the tests rely on.
   */
  private menu(
    label: string,
    items: (string | { label: string; kbd?: string; action: () => void })[],
  ): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'tb-menu-wrap';

    // Header — the element with .tb-menu class; textContent must stay clean
    const head = document.createElement('div');
    head.className = 'tb-menu';
    head.textContent = label + ' ';
    const caret = document.createElement('span');
    caret.className = 'tb-caret';
    caret.textContent = '▾';
    head.appendChild(caret);
    wrap.appendChild(head);

    // Dropdown — sibling to .tb-menu so it doesn't pollute textContent
    const dropdown = document.createElement('ul');
    dropdown.className = 'tb-dropdown';

    items.forEach(item => {
      if (typeof item === 'string') {
        const li = document.createElement('li');
        li.className = 'tb-dropdown-sep';
        dropdown.appendChild(li);
        return;
      }
      const li = document.createElement('li');
      li.className = 'tb-dropdown-item';
      const nameSpan = document.createElement('span');
      nameSpan.textContent = item.label;
      li.appendChild(nameSpan);
      if (item.kbd) {
        const kbdSpan = document.createElement('span');
        kbdSpan.className = 'tb-kbd';
        kbdSpan.textContent = item.kbd;
        li.appendChild(kbdSpan);
      }
      li.addEventListener('click', () => {
        wrap.classList.remove('open');
        item.action();
      });
      dropdown.appendChild(li);
    });

    wrap.appendChild(dropdown);

    head.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasOpen = wrap.classList.contains('open');
      document.querySelectorAll('.tb-menu-wrap.open').forEach(m => m.classList.remove('open'));
      if (!wasOpen) wrap.classList.add('open');
    });

    return wrap;
  }
}
