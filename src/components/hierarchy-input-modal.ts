// "Describe infra in one line" quick-entry modal — an alternative to manually placing and
// nesting several CloudContainer boundary boxes: type one slash-separated line (Account/Region/
// Resource Group/VPC/Subnet) and get the whole breadcrumb hierarchy in one shot, with a live
// WYSIWYG preview using the actual renderer (see cloud-hierarchy-renderer.ts). Fully
// self-contained DOM (mirrors startup-modal.ts), no dependency on static index.html markup.
import { CloudProvider, CloudHierarchy, CloudHierarchyLevel } from '../core/types';
import { parseHierarchyLine, hierarchyLevelIcon, hierarchyKindLabel, HIERARCHY_LEVEL_ORDER } from '../library/hierarchy-parser';
import { renderCloudHierarchy, getNaturalHierarchySize } from '../renderers/cloud-hierarchy-renderer';

const PROVIDER_OPTIONS: { id: CloudProvider; label: string; icon: string }[] = [
  { id: 'aws', label: 'AWS', icon: '🟧' },
  { id: 'azure', label: 'Azure', icon: '🔷' },
  { id: 'gcp', label: 'GCP', icon: '🔴' },
  { id: 'onprem', label: 'Local', icon: '🏠' },
];

/** Inline ghost-text for whatever hasn't been typed yet, e.g. after typing "T1 / South India / RG1 / "
 *  this returns "VNet Name / Subnet Name" — rendered in gray directly inside the input, right after
 *  the cursor (see the #him-ghost-suggest overlay), like an autocomplete suggestion. Mid-segment
 *  (value doesn't end with "/") the segment being typed isn't duplicated, only what comes after it. */
export function ghostSuggestionText(value: string, provider: CloudProvider): string {
  const slashCount = (value.match(/\//g) || []).length;
  if (slashCount >= HIERARCHY_LEVEL_ORDER.length) return '';
  const remaining = HIERARCHY_LEVEL_ORDER.slice(slashCount).map(kind => `${hierarchyKindLabel(kind, provider)} Name`);
  const midSegment = value.length > 0 && !value.endsWith('/');
  const labels = midSegment ? remaining.slice(1) : remaining;
  if (labels.length === 0) return '';
  return (midSegment ? ' / ' : '') + labels.join(' / ');
}

/** Staged typing guide shown below the input, updated on every keystroke — tells the user
 *  specifically which level they're on right now ("Now type: Region name, then /") instead of
 *  leaving them to infer it from the static example alone. */
function stageHint(value: string, provider: CloudProvider): string {
  const slashCount = (value.match(/\//g) || []).length;
  if (slashCount >= HIERARCHY_LEVEL_ORDER.length) {
    return '✓ All 5 levels set — click "Add to Canvas" (or keep typing to overwrite the last one).';
  }
  const label = hierarchyKindLabel(HIERARCHY_LEVEL_ORDER[slashCount], provider);
  const isLast = slashCount === HIERARCHY_LEVEL_ORDER.length - 1;
  return `Now type: <strong>${label}</strong> name${isLast ? '' : ', then <code>/</code> for the next level'}`;
}

export function showHierarchyInputModal(opts: {
  provider: CloudProvider;
  initialLine?: string;
  onSubmit: (provider: CloudProvider, levels: CloudHierarchyLevel[]) => void;
}): void {
  const existing = document.getElementById('hierarchy-input-modal');
  if (existing) existing.remove();

  let provider = opts.provider;

  const modal = document.createElement('div');
  modal.id = 'hierarchy-input-modal';
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
    background: rgba(10, 12, 16, 0.72); backdrop-filter: blur(6px);
    z-index: 10002; display: flex; align-items: center; justify-content: center;
    font-family: 'Inter', system-ui, sans-serif; color: #fff;
  `;

  const closeModal = () => {
    modal.remove();
    document.removeEventListener('keydown', onKeydown);
  };
  const onKeydown = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
  document.addEventListener('keydown', onKeydown);

  const card = document.createElement('div');
  card.style.cssText = `
    width: 560px; max-width: 92vw; background: #161b22; border: 1px solid rgba(255,255,255,0.1);
    border-radius: 12px; padding: 22px 24px; box-shadow: 0 20px 60px rgba(0,0,0,0.5);
  `;
  card.innerHTML = `
    <div style="font-size:16px;font-weight:700;margin-bottom:4px;">Describe Infrastructure</div>
    <div style="font-size:12px;color:#8b949e;margin-bottom:14px;">
      One line, separated by <code>/</code>, in order: Account → Region → Resource Group → VPC → Subnet
    </div>
    <div id="him-providers" style="display:flex;gap:6px;margin-bottom:12px;"></div>
    <div style="position:relative;">
      <div id="him-ghost-layer" style="
        position:absolute; inset:0; box-sizing:border-box; padding:9px 12px; font-size:13px; font-family:inherit;
        white-space:pre; overflow:hidden; background:#0d1117; border:1px solid transparent; border-radius:6px; z-index:0;
      "><span id="him-ghost-typed" style="color:transparent;"></span><span id="him-ghost-suggest" style="color:rgba(255,255,255,0.32);"></span></div>
      <input id="him-input" type="text" style="
        position:relative; z-index:1; width:100%; box-sizing:border-box; padding:9px 12px; font-size:13px; font-family:inherit;
        background:transparent; border:1px solid rgba(255,255,255,0.15); border-radius:6px; color:#fff;
      " />
    </div>
    <div id="him-stage-hint" style="font-size:11px;color:#58a6ff;margin-top:6px;min-height:14px;"></div>
    <div style="margin-top:16px;padding:14px;background:#0d1117;border:1px solid rgba(255,255,255,0.08);border-radius:8px;min-height:60px;">
      <svg id="him-preview-svg" width="100%" height="170"><g id="him-preview-layer"></g></svg>
      <div id="him-preview-empty" style="font-size:12px;color:#8b949e;font-style:italic;">Start typing to preview the hierarchy…</div>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;">
      <button id="him-cancel" style="padding:8px 16px;font-size:13px;background:transparent;border:1px solid rgba(255,255,255,0.15);border-radius:6px;color:#fff;cursor:pointer;">Cancel</button>
      <button id="him-add" style="padding:8px 16px;font-size:13px;background:#238636;border:none;border-radius:6px;color:#fff;cursor:pointer;font-weight:600;">Add to Canvas</button>
    </div>
  `;
  modal.appendChild(card);
  document.body.appendChild(modal);

  const input = card.querySelector('#him-input') as HTMLInputElement;
  const stageHintEl = card.querySelector('#him-stage-hint') as HTMLElement;
  const ghostTypedEl = card.querySelector('#him-ghost-typed') as HTMLElement;
  const ghostSuggestEl = card.querySelector('#him-ghost-suggest') as HTMLElement;
  input.value = opts.initialLine ?? '';

  const providersEl = card.querySelector('#him-providers') as HTMLElement;
  const renderProviderButtons = () => {
    providersEl.innerHTML = PROVIDER_OPTIONS.map(p => `
      <button data-provider="${p.id}" style="
        flex:1; padding:6px 4px; font-size:12px; cursor:pointer; border-radius:6px;
        background:${p.id === provider ? 'rgba(88,166,255,0.18)' : 'transparent'};
        border:1px solid ${p.id === provider ? '#58a6ff' : 'rgba(255,255,255,0.12)'};
        color:#fff;
      ">${p.icon} ${p.label}</button>
    `).join('');
    providersEl.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        provider = btn.getAttribute('data-provider') as CloudProvider;
        renderProviderButtons();
        updatePreview();
      });
    });
  };
  renderProviderButtons();

  const previewLayer = card.querySelector('#him-preview-layer') as unknown as SVGGElement;
  const previewSvg = card.querySelector('#him-preview-svg') as unknown as SVGSVGElement;
  const previewEmpty = card.querySelector('#him-preview-empty') as HTMLElement;

  const updatePreview = () => {
    stageHintEl.innerHTML = stageHint(input.value, provider);
    // Inline ghost suggestion: an invisible span echoing what's already typed (so it occupies the
    // exact same width, forcing the suggestion span to start right after the real cursor position)
    // plus a gray span with whatever's left of the template — see ghostSuggestionText().
    ghostTypedEl.textContent = input.value;
    ghostSuggestEl.textContent = ghostSuggestionText(input.value, provider);
    const levels = parseHierarchyLine(input.value);
    previewLayer.innerHTML = '';
    if (levels.length === 0) {
      previewSvg.style.display = 'none';
      previewEmpty.style.display = 'block';
      return;
    }
    previewSvg.style.display = 'block';
    previewEmpty.style.display = 'none';
    const preview: CloudHierarchy = { id: 'preview', provider, x: 0, y: 0, levels };
    const icons = levels.map(l => hierarchyLevelIcon(l.kind, provider));
    renderCloudHierarchy(preview, previewLayer, false, icons);
    // The object is a full resizable boundary box now, not a thin single-line bar — scale the
    // whole thing to fit via viewBox (preserving proportions) instead of hardcoding pixel size.
    const natural = getNaturalHierarchySize(preview, icons);
    const margin = 16;
    previewSvg.setAttribute('viewBox', `${-margin} ${-30 - margin} ${natural.width + margin * 2} ${natural.height + 30 + margin * 2}`);
  };
  updatePreview();
  input.addEventListener('input', updatePreview);
  input.focus();

  const cancelBtn = card.querySelector('#him-cancel') as HTMLButtonElement;
  const addBtn = card.querySelector('#him-add') as HTMLButtonElement;

  cancelBtn.addEventListener('click', closeModal, { once: true });
  addBtn.addEventListener('click', () => {
    const levels = parseHierarchyLine(input.value);
    if (levels.length === 0) {
      input.style.borderColor = '#ef4444';
      input.focus();
      return;
    }
    opts.onSubmit(provider, levels);
    closeModal();
  }, { once: true });

  modal.addEventListener('mousedown', (e) => { if (e.target === modal) closeModal(); });
}
