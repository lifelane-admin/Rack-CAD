// src/components/pdu-configurator.ts
import type { DeviceData } from '../core/types';

interface PduRow { count: number; socketType: 'C13' | 'C19' | 'NEMA-5-15'; }

interface PduConfig {
  finish: string;
  voltage: string;
  rows: PduRow[];
}

const FINISH_OPTIONS = [
  { key: 'ral9005-texture', hi: '#2a2a2a', label: 'Textured Black' },
  { key: 'black',           hi: '#3a3d40', label: 'Black' },
  { key: 'darkGrey',        hi: '#54585c', label: 'Dark Grey' },
  { key: 'lightGrey',       hi: '#c8ccd0', label: 'Light Grey' },
  { key: 'white',           hi: '#ffffff', label: 'White' },
  { key: 'brushedAluminium',hi: '#e8eaec', label: 'Brushed Aluminium' },
];

function getConfig(device: DeviceData): PduConfig {
  const raw = device.deviceConfig ?? {};
  return {
    finish: (raw.finish as string) ?? 'ral9005-texture',
    voltage: (raw.voltage as string) ?? '230V',
    rows: (raw.rows as PduRow[]) ?? [{ count: 8, socketType: 'C13' }],
  };
}

export function mountPduConfigurator(
  container: HTMLElement,
  device: DeviceData,
  onUpdate: (config: Record<string, unknown>) => void,
): void {
  let config = getConfig(device);

  function render() {
    container.innerHTML = `
      <div style="padding-top:4px;">
        <div style="font-weight:600;font-size:12px;color:var(--text-secondary);margin-bottom:10px;letter-spacing:0.5px;">PDU CONFIGURATION</div>

        <div style="margin-bottom:12px;">
          <label style="font-size:11px;display:block;margin-bottom:6px;color:var(--text-muted);">Finish</label>
          <div style="display:flex;gap:6px;flex-wrap:wrap;" id="pdu-finish-swatches">
            ${FINISH_OPTIONS.map(f => `
              <div data-finish="${f.key}" title="${f.label}" style="
                width:22px;height:22px;border-radius:4px;cursor:pointer;
                background:${f.hi};
                border:2px solid ${config.finish === f.key ? '#58a6ff' : 'transparent'};
                box-shadow:0 0 0 1px rgba(0,0,0,0.4);
              "></div>
            `).join('')}
          </div>
        </div>

        <div style="margin-bottom:12px;">
          <label style="font-size:11px;display:block;margin-bottom:4px;color:var(--text-muted);">Voltage</label>
          <select id="pdu-voltage" style="width:100%;background:#000;border:1px solid var(--border-color);color:#fff;border-radius:4px;padding:5px 8px;font-size:12px;">
            <option value="208V" ${config.voltage === '208V' ? 'selected' : ''}>208V</option>
            <option value="230V" ${config.voltage === '230V' ? 'selected' : ''}>230V</option>
            <option value="240V" ${config.voltage === '240V' ? 'selected' : ''}>240V</option>
          </select>
        </div>

        <div style="margin-bottom:8px;">
          <label style="font-size:11px;display:block;margin-bottom:6px;color:var(--text-muted);">Socket Rows</label>
          <div id="pdu-rows-list">
            ${config.rows.map((row, idx) => `
              <div data-row-idx="${idx}" style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
                <select class="pdu-row-type" data-idx="${idx}" style="flex:1;background:#000;border:1px solid var(--border-color);color:#fff;border-radius:4px;padding:4px 6px;font-size:11px;">
                  <option value="C13" ${row.socketType === 'C13' ? 'selected' : ''}>IEC C13</option>
                  <option value="C19" ${row.socketType === 'C19' ? 'selected' : ''}>IEC C19</option>
                  <option value="NEMA-5-15" ${row.socketType === 'NEMA-5-15' ? 'selected' : ''}>NEMA 5-15</option>
                </select>
                <input class="pdu-row-count" type="number" data-idx="${idx}" value="${row.count}" min="1" max="24"
                  style="width:50px;background:#000;border:1px solid var(--border-color);color:#fff;border-radius:4px;padding:4px 6px;font-size:11px;" />
                <button class="pdu-row-remove" data-idx="${idx}" style="background:rgba(248,81,73,0.15);border:1px solid var(--danger-color);color:var(--danger-color);border-radius:4px;padding:4px 7px;font-size:11px;cursor:pointer;">×</button>
              </div>
            `).join('')}
          </div>
          <button id="pdu-add-row" style="width:100%;background:rgba(88,166,255,0.1);border:1px solid var(--accent-primary);color:var(--accent-primary);border-radius:4px;padding:6px;font-size:11px;cursor:pointer;margin-top:2px;">+ Add Row</button>
        </div>
      </div>
    `;

    container.querySelectorAll('[data-finish]').forEach(elem => {
      elem.addEventListener('click', () => {
        config = { ...config, finish: (elem as HTMLElement).dataset.finish! };
        emit();
      });
    });

    container.querySelector('#pdu-voltage')?.addEventListener('change', (e: Event) => {
      config = { ...config, voltage: (e.target as HTMLSelectElement).value };
      emit();
    });

    container.querySelectorAll('.pdu-row-type').forEach(sel => {
      sel.addEventListener('change', (e: Event) => {
        const idx = parseInt((sel as HTMLElement).dataset.idx!);
        const newRows = config.rows.map((r, i) => i === idx ? { ...r, socketType: (e.target as HTMLSelectElement).value as PduRow['socketType'] } : r);
        config = { ...config, rows: newRows };
        emit();
      });
    });

    container.querySelectorAll('.pdu-row-count').forEach(inp => {
      inp.addEventListener('change', (e: Event) => {
        const idx = parseInt((inp as HTMLElement).dataset.idx!);
        const newRows = config.rows.map((r, i) => i === idx ? { ...r, count: Math.max(1, Math.min(24, parseInt((e.target as HTMLInputElement).value) || 1)) } : r);
        config = { ...config, rows: newRows };
        emit();
      });
    });

    container.querySelectorAll('.pdu-row-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt((btn as HTMLElement).dataset.idx!);
        const newRows = config.rows.filter((_, i) => i !== idx);
        if (newRows.length === 0) newRows.push({ count: 8, socketType: 'C13' });
        config = { ...config, rows: newRows };
        emit();
      });
    });

    container.querySelector('#pdu-add-row')?.addEventListener('click', () => {
      config = { ...config, rows: [...config.rows, { count: 8, socketType: 'C13' }] };
      emit();
    });
  }

  function emit() {
    onUpdate({ finish: config.finish, voltage: config.voltage, rows: config.rows });
    render();
  }

  render();
}

export function unmountPduConfigurator(container: HTMLElement): void {
  container.innerHTML = '';
}
