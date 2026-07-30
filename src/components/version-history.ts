// "Version History" modal — browse the rolling auto-save/checkpoint history (see
// StateManager.saveVersion/listVersions/restoreVersion/deleteVersion in core/state.ts),
// restore any prior version, export one to a standalone .json file, or delete it.
import { eventBus } from '../core/event-bus';
import { stateManager } from '../core/state';
import { downloadFile } from '../utils/export';
import type { ProjectVersion } from '../core/types';

export class VersionHistoryModal {
  constructor() {
    eventBus.on('versions:open', () => this.show());
  }

  private show(): void {
    document.getElementById('version-history-modal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'version-history-modal';
    modal.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(10, 12, 16, 0.7); backdrop-filter: blur(12px);
      z-index: 10000; display: flex; align-items: center; justify-content: center;
      font-family: 'Inter', system-ui, sans-serif; color: #fff;
    `;

    modal.innerHTML = `
      <div style="background: rgba(22, 27, 34, 0.92); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; width: 520px; max-width: 92vw; max-height: 82vh; padding: 24px; box-shadow: 0 20px 45px rgba(0,0,0,0.65); display: flex; flex-direction: column;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 14px; flex-shrink: 0;">
          <h3 style="margin: 0; font-size: 15px; color: #38bdf8;">📜 Version History</h3>
          <button id="vh-close" style="background: none; border: none; color: #8b949e; font-size: 18px; cursor: pointer;">✕</button>
        </div>

        <div style="display: flex; gap: 8px; margin-top: 16px; flex-shrink: 0;">
          <input id="vh-label" type="text" placeholder="Checkpoint name (optional)" style="flex: 1; padding: 7px 10px; background: #0d1117; border: 1px solid #30363d; color: #fff; border-radius: 4px; font-size: 12px;" />
          <button id="vh-save-now" style="padding: 7px 14px; font-size: 12px; background: #fb8c00; border: none; color: #fff; font-weight: bold; border-radius: 4px; cursor: pointer; white-space: nowrap;">Save Checkpoint</button>
        </div>

        <div id="vh-list" style="margin-top: 16px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 8px;"></div>
      </div>
    `;

    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.querySelector('#vh-close')?.addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

    modal.querySelector('#vh-save-now')?.addEventListener('click', () => {
      const input = modal.querySelector('#vh-label') as HTMLInputElement;
      stateManager.saveVersion(input.value.trim() || 'Manual checkpoint', true);
      eventBus.emit('notification', { message: 'Checkpoint saved', type: 'success' });
      this.renderList(modal);
    });

    this.renderList(modal);
  }

  private renderList(modal: HTMLElement): void {
    const list = modal.querySelector('#vh-list') as HTMLElement;
    const versions = stateManager.listVersions();

    if (versions.length === 0) {
      list.innerHTML = `<p style="color: #8b949e; font-size: 12.5px; text-align: center; padding: 20px 0;">No saved versions yet — one is checkpointed automatically as you work, or click "Save Checkpoint" above.</p>`;
      return;
    }

    list.innerHTML = '';
    versions.forEach(v => list.appendChild(this.renderRow(modal, v)));
  }

  private renderRow(modal: HTMLElement, v: ProjectVersion): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = `
      display: flex; align-items: center; gap: 10px; padding: 10px 12px;
      background: #0d1117; border: 1px solid #30363d; border-radius: 6px;
    `;

    const when = new Date(v.timestamp);
    const dateStr = isNaN(when.getTime()) ? v.timestamp : when.toLocaleString();
    const badge = v.manual
      ? `<span style="background:#fb8c00;color:#000;font-size:8.5px;font-weight:700;padding:1px 5px;border-radius:3px;">MANUAL</span>`
      : `<span style="background:#30363d;color:#8b949e;font-size:8.5px;font-weight:700;padding:1px 5px;border-radius:3px;">AUTO</span>`;

    const info = document.createElement('div');
    info.style.cssText = 'flex: 1; min-width: 0;';
    info.innerHTML = `
      <div style="display:flex;align-items:center;gap:6px;font-size:12.5px;color:#e6edf3;">
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(v.label)}</span>
        ${badge}
      </div>
      <div style="font-size:10.5px;color:#8b949e;margin-top:2px;">
        ${dateStr} &middot; ${v.racks.length} rack${v.racks.length === 1 ? '' : 's'}, ${v.devices.length} device${v.devices.length === 1 ? '' : 's'}, ${v.cables.length} cable${v.cables.length === 1 ? '' : 's'}
      </div>
    `;
    row.appendChild(info);

    const btnStyle = 'padding: 5px 10px; font-size: 11px; border-radius: 4px; cursor: pointer; border: 1px solid #30363d; background: transparent; color: #c9d1d9; white-space: nowrap;';

    const restoreBtn = document.createElement('button');
    restoreBtn.textContent = 'Restore';
    restoreBtn.style.cssText = btnStyle + 'color:#22c55e;border-color:#22c55e;';
    restoreBtn.addEventListener('click', () => {
      if (!confirm(`Restore "${v.label}" from ${dateStr}? Your current unsaved changes will be replaced.`)) return;
      if (stateManager.restoreVersion(v.id)) {
        eventBus.emit('versions:restored', undefined);
        eventBus.emit('notification', { message: `Restored version "${v.label}"`, type: 'success' });
        modal.remove();
      } else {
        eventBus.emit('notification', { message: 'That version no longer exists', type: 'error' });
      }
    });
    row.appendChild(restoreBtn);

    const exportBtn = document.createElement('button');
    exportBtn.textContent = 'Export';
    exportBtn.style.cssText = btnStyle;
    exportBtn.addEventListener('click', () => {
      const project = {
        version: '1.0.0',
        name: `Rack Slicer Project (${v.label})`,
        created: v.timestamp,
        racks: v.racks,
        devices: v.devices,
        cables: v.cables,
      };
      downloadFile(JSON.stringify(project, null, 2), `rack-slicer-${v.id}.json`, 'application/json');
      eventBus.emit('notification', { message: 'Version exported', type: 'success' });
    });
    row.appendChild(exportBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete';
    deleteBtn.style.cssText = btnStyle + 'color:#ef4444;border-color:#ef4444;';
    deleteBtn.addEventListener('click', () => {
      if (!confirm(`Delete version "${v.label}"? This cannot be undone.`)) return;
      stateManager.deleteVersion(v.id);
      this.renderList(modal);
    });
    row.appendChild(deleteBtn);

    return row;
  }
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
