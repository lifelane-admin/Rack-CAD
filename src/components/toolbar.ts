import EventBus from '../core/event-bus';
import State from '../core/state';
import { ToolMode } from '../core/types';
import { ClaudeProvider } from '../ai/claude-provider';

// ── Top Bar Tool definitions ────────────────────────────────────────────────
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

// ── Category Header Icons ───────────────────────────────────────────────────
const MENU_ICONS = {
  file: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
  edit: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  view: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  export: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>',
  cloud: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/></svg>',
};

// ── Dropdown Item Icons ──────────────────────────────────────────────────────
const ICONS = {
  new: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#38bdf8" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>',
  open: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#60a5fa" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>',
  save: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#34d399" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>',
  saveAs: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#10b981" stroke-width="2"><path d="M17 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v5"/><path d="M19 19v-6m-3 3h6"/></svg>',
  demo: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#fbbf24" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  image: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#a78bfa" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
  undo: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#cbd5e1" stroke-width="2"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"/></svg>',
  redo: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#cbd5e1" stroke-width="2"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 019-9 9 9 0 016 2.3l3 2.7"/></svg>',
  selectAll: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#94a3b8" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="3 3"/><path d="M9 12l2 2 4-4"/></svg>',
  delete: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#f87171" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>',
  rack: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#38bdf8" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="16" y2="18"/></svg>',
  customRack: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#c084fc" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>',
  zoomIn: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#38bdf8" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>',
  zoomOut: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#38bdf8" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>',
  grid: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#818cf8" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>',
  ruler: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#fb923c" stroke-width="2"><path d="M21.3 8.7l-6-6a2 2 0 00-2.8 0L3 12.2a2 2 0 000 2.8l6 6a2 2 0 002.8 0l9.5-9.5a2 2 0 000-2.8z"/><line x1="7.5" y1="10.5" x2="9" y2="12"/><line x1="10.5" y1="7.5" x2="12" y2="9"/><line x1="13.5" y1="4.5" x2="15" y2="6"/></svg>',
  magnet: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#f43f5e" stroke-width="2"><path d="M6 3v7a6 6 0 0012 0V3"/><line x1="4" y1="7" x2="8" y2="7"/><line x1="16" y1="7" x2="20" y2="7"/></svg>',
  rackView: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#38bdf8" stroke-width="2"><rect x="4" y="3" width="16" height="18" rx="2"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="17" x2="16" y2="17"/></svg>',
  cloudView: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#60a5fa" stroke-width="2"><path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/></svg>',
  hybridView: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#c084fc" stroke-width="2"><circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M6 9v3a3 3 0 003 3h6a3 3 0 003-3V9"/><line x1="18" y1="9" x2="18" y2="15"/></svg>',
  threeD: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#06b6d4" stroke-width="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
  props: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#e2e8f0" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/></svg>',
  theme: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#fbbf24" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>',
  exportSvg: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M10 13l-2 2 2 2"/><path d="M14 13l2 2-2 2"/></svg>',
  exportPng: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#3b82f6" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  exportJpeg: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#06b6d4" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
  exportPdf: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#ef4444" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/></svg>',
  exportHtml: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#10b981" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>',
  exportReport: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#8b5cf6" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
};

const FLOAT_TOGGLE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>';

export interface MenuItemDef {
  label: string;
  kbd?: string;
  icon?: string;
  header?: string;
  action: () => void;
}

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

    // ── Tool strip (segmented capsule group) ───────────────────────────────
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

    // ── Menu bar with modern grouped icons ───────────────────────────────────
    const menuBar = document.createElement('div');
    menuBar.className = 'tb-menus';
    menuBar.id = 'tb-menu-bar';

    const fileMenu = this.menu('File', MENU_ICONS.file, [
      { label: 'New Project', kbd: '⌘N', icon: ICONS.new, action: () => EventBus.emit('file:new', undefined) },
      { label: 'Open…', kbd: '⌘O', icon: ICONS.open, action: () => EventBus.emit('file:open', undefined) },
      { label: 'Save', kbd: '⌘S', icon: ICONS.save, action: () => EventBus.emit('file:save', undefined) },
      { label: 'Save As…', kbd: '⌘⇧S', icon: ICONS.saveAs, action: () => EventBus.emit('file:save-as', undefined) },
      'sep',
      { label: 'Load Demo…', icon: ICONS.demo, action: () => EventBus.emit('file:demo', undefined) },
      { label: 'Insert Image…', icon: ICONS.image, action: () => EventBus.emit('image:insert' as any, undefined) },
    ]);
    menuBar.appendChild(fileMenu);

    const editMenu = this.menu('Edit', MENU_ICONS.edit, [
      { label: 'Undo', kbd: '⌘Z', icon: ICONS.undo, action: () => EventBus.emit('edit:undo', undefined) },
      { label: 'Redo', kbd: '⌘⇧Z', icon: ICONS.redo, action: () => EventBus.emit('edit:redo', undefined) },
      'sep',
      { label: 'Select All', kbd: '⌘A', icon: ICONS.selectAll, action: () => {} },
      { label: 'Delete', kbd: '⌫', icon: ICONS.delete, action: () => EventBus.emit('edit:delete', undefined) },
      'sep',
      { label: 'Add Rack (42U)', icon: ICONS.rack, action: () => EventBus.emit('rack:add', { units: 42 }) },
      { label: 'Add Rack (48U)', icon: ICONS.rack, action: () => EventBus.emit('rack:add', { units: 48 }) },
      { label: 'Add Rack (24U Half-Rack)', icon: ICONS.rack, action: () => EventBus.emit('rack:add', { units: 24 }) },
      { label: 'Add Rack (12U Wall-Mount)', icon: ICONS.rack, action: () => EventBus.emit('rack:add', { units: 12 }) },
      {
        label: 'Add Rack (Custom Size…)',
        icon: ICONS.customRack,
        action: () => {
          const input = window.prompt('Enter rack height in units (2 to 54, even numbers only):', '42');
          if (input !== null) {
            let u = parseInt(input, 10);
            if (isNaN(u) || u < 2) u = 2;
            if (u > 54) u = 54;
            if (u % 2 !== 0) u = Math.min(54, u + 1);
            EventBus.emit('rack:add', { units: u });
          }
        }
      },
    ]);
    menuBar.appendChild(editMenu);

    const viewMenu = this.menu('View', MENU_ICONS.view, [
      { label: 'Zoom In', kbd: '+', icon: ICONS.zoomIn, action: () => EventBus.emit('view:zoom-in', undefined) },
      { label: 'Zoom Out', kbd: '−', icon: ICONS.zoomOut, action: () => EventBus.emit('view:zoom-out', undefined) },
      'sep',
      { label: 'Show Grid', icon: ICONS.grid, action: () => EventBus.emit('view:toggle-grid', undefined) },
      { label: 'Show Rulers', icon: ICONS.ruler, action: () => EventBus.emit('view:toggle-rulers', undefined) },
      { label: 'Snap to Grid', icon: ICONS.magnet, action: () => EventBus.emit('view:toggle-snap', undefined) },
      'sep',
      { label: 'Switch to Rack', icon: ICONS.rackView, action: () => EventBus.emit('view:switch', 'rack') },
      { label: 'Switch to Cloud', icon: ICONS.cloudView, action: () => EventBus.emit('view:switch', 'cloud') },
      { label: 'Switch to Hybrid', icon: ICONS.hybridView, action: () => EventBus.emit('view:switch', 'hybrid') },
      'sep',
      { label: '3D Panel', icon: ICONS.threeD, action: () => EventBus.emit('view:toggle-3d-panel', undefined) },
      { label: 'Properties Panel', kbd: 'Alt+P', icon: ICONS.props, action: () => EventBus.emit('properties:toggle', undefined) },
      { label: 'Toggle Theme', icon: ICONS.theme, action: () => EventBus.emit('view:toggle-theme', undefined) },
    ]);
    menuBar.appendChild(viewMenu);

    const exportMenu = this.menu('Export', MENU_ICONS.export, [
      { label: 'Export SVG…', icon: ICONS.exportSvg, action: () => EventBus.emit('export:svg', undefined) },
      { label: 'Export PNG…', icon: ICONS.exportPng, action: () => EventBus.emit('export:png', undefined) },
      { label: 'Export JPEG…', icon: ICONS.exportJpeg, action: () => EventBus.emit('export:jpeg', undefined) },
      { label: 'Export PDF…', icon: ICONS.exportPdf, action: () => EventBus.emit('export:pdf', undefined) },
      { label: 'Export HTML…', icon: ICONS.exportHtml, action: () => EventBus.emit('export:html', undefined) },
      'sep',
      { label: 'Design Report…', icon: ICONS.exportReport, action: () => EventBus.emit('export:report' as any, undefined) },
    ]);
    menuBar.appendChild(exportMenu);

    // Conditionally render Cloud/Flowchart menu on initial render
    const initialView = State.getState().activeView;
    if (initialView === 'cloud' || initialView === 'hybrid' || initialView === 'flowchart') {
      const label = initialView === 'flowchart' ? 'Flowchart' : 'Cloud';
      const cloudMenu = this.menu(label, MENU_ICONS.cloud, [
        { label: `Export ${label} SVG…`, icon: ICONS.exportSvg, action: () => EventBus.emit('export:cloud-svg', undefined) },
        { label: `Export ${label} PNG…`, icon: ICONS.exportPng, action: () => EventBus.emit('export:cloud-png', undefined) },
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
      const newMode = !current;
      State.setState({ aiMode: newMode });
      EventBus.emit('ai:mode-changed', newMode);
    });
    right.appendChild(aiBtn);

    const aiSettingsBtn = document.createElement('button');
    aiSettingsBtn.className = 'toolbar-btn';
    aiSettingsBtn.id = 'ai-settings-btn';
    aiSettingsBtn.title = 'AI Settings (API Key & Model Selection)';
    aiSettingsBtn.innerHTML = `⚙️`;
    aiSettingsBtn.style.fontSize = '12px';
    aiSettingsBtn.addEventListener('click', () => {
      document.getElementById('ai-key-modal')?.classList.remove('hidden');
    });
    right.appendChild(aiSettingsBtn);

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

      // Cloud/Flowchart menu — add/remove based on activeView
      const existing = menuBar.querySelector('#tb-menu-cloud');
      const needsCloud = s.activeView === 'cloud' || s.activeView === 'hybrid' || s.activeView === 'flowchart';
      if (needsCloud && !existing) {
        const label = s.activeView === 'flowchart' ? 'Flowchart' : 'Cloud';
        const cloudMenu = this.menu(label, MENU_ICONS.cloud, [
          { label: `Export ${label} SVG…`, icon: ICONS.exportSvg, action: () => EventBus.emit('export:cloud-svg', undefined) },
          { label: `Export ${label} PNG…`, icon: ICONS.exportPng, action: () => EventBus.emit('export:cloud-png', undefined) },
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
   * Builds a menu widget with icon + label + caret and rich dropdown items.
   */
  private menu(
    label: string,
    iconSvg: string,
    items: (string | MenuItemDef)[],
  ): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'tb-menu-wrap';

    // Header — .tb-menu class; textContent preserves "Label ▾" for compatibility
    const head = document.createElement('div');
    head.className = 'tb-menu';
    head.innerHTML = `<span class="tb-menu-icon">${iconSvg}</span><span class="tb-menu-text">${label}</span> <span class="tb-caret">▾</span>`;
    wrap.appendChild(head);

    // Dropdown — sibling to .tb-menu
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

      const leftSpan = document.createElement('span');
      leftSpan.className = 'tb-dropdown-left';

      if (item.icon) {
        const iconSpan = document.createElement('span');
        iconSpan.className = 'tb-item-icon';
        iconSpan.innerHTML = item.icon;
        leftSpan.appendChild(iconSpan);
      }

      const nameSpan = document.createElement('span');
      nameSpan.className = 'tb-item-name';
      nameSpan.textContent = item.label;
      leftSpan.appendChild(nameSpan);

      li.appendChild(leftSpan);

      if (item.kbd) {
        const kbdSpan = document.createElement('span');
        kbdSpan.className = 'tb-kbd';
        kbdSpan.textContent = item.kbd;
        li.appendChild(kbdSpan);
      }

      li.addEventListener('click', (e) => {
        e.stopPropagation();
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