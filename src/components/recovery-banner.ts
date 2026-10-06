/**
 * Auto-Recovery Banner & Vault Dialog
 *
 * Provides prominent, intuitive UI for users to recover unsaved working files
 * after page reloads, accidental navigation, or browser crashes.
 */

import EventBus from '../core/event-bus';
import { autoSaveManager, AutoSavePayload } from '../storage/autosave-manager';

export class RecoveryBanner {
  private container: HTMLElement | null = null;
  private isBannerVisible: boolean = false;

  constructor() {
    this.setupListeners();
  }

  private setupListeners(): void {
    (EventBus as any).on('autosave:recovery-available', (info: {
      draftId: string;
      projectName: string;
      timestamp: number;
      deviceCount: number;
      rackCount: number;
      cableCount: number;
    }) => {
      this.showBanner(info);
    });

    (EventBus as any).on('autosave:open-vault', () => {
      this.showVaultModal();
    });
  }

  public showBanner(info: {
    draftId: string;
    projectName: string;
    timestamp: number;
    deviceCount: number;
    rackCount: number;
    cableCount: number;
  }): void {
    if (this.isBannerVisible) return;

    const viewport = document.getElementById('canvas-viewport') || document.body;
    const existing = document.getElementById('rackslicer-recovery-banner');
    if (existing) existing.remove();

    const banner = document.createElement('div');
    banner.id = 'rackslicer-recovery-banner';
    banner.style.cssText = `
      position: absolute;
      top: 14px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 9999;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 18px;
      background: linear-gradient(135deg, rgba(22, 27, 34, 0.96), rgba(13, 17, 23, 0.98));
      border: 1px solid rgba(234, 179, 8, 0.45);
      border-radius: 10px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6), 0 0 20px rgba(234, 179, 8, 0.15);
      color: #f0f6fc;
      font-size: 13px;
      font-family: 'Inter', system-ui, sans-serif;
      backdrop-filter: blur(12px);
      animation: rs-slide-down 0.25s ease-out;
      max-width: 90vw;
    `;

    const formattedTime = new Date(info.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const formattedDate = new Date(info.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });

    banner.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;font-weight:700;color:#eab308;white-space:nowrap;">
        <span style="font-size:16px;">⚠️</span>
        <span>Auto-Recovery Available:</span>
      </div>
      <div style="font-size:12px;color:#c9d1d9;line-height:1.4;">
        <span>Recovered unsaved draft <strong style="color:#fff;">"${info.projectName}"</strong> from ${formattedDate} at ${formattedTime}</span>
        <span style="color:#8b949e;"> (${info.rackCount} rack${info.rackCount === 1 ? '' : 's'}, ${info.deviceCount} device${info.deviceCount === 1 ? '' : 's'}, ${info.cableCount} cable${info.cableCount === 1 ? '' : 's'})</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-left:8px;white-space:nowrap;">
        <button id="rs-recovery-restore" style="
          display:flex;align-items:center;gap:5px;
          background:#238636;border:1px solid rgba(255,255,255,0.2);
          color:#fff;font-weight:700;font-size:12px;
          padding:5px 12px;border-radius:6px;cursor:pointer;
          box-shadow:0 2px 6px rgba(35,134,54,0.3);
          transition:all 0.15s ease;
        ">
          <span>⚡</span> <span>Restore Work</span>
        </button>
        <button id="rs-recovery-discard" style="
          background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);
          color:#8b949e;font-size:12px;font-weight:600;
          padding:5px 10px;border-radius:6px;cursor:pointer;
          transition:all 0.15s ease;
        ">
          Discard
        </button>
        <button id="rs-recovery-close" title="Dismiss banner" style="
          background:none;border:none;color:#8b949e;
          font-size:14px;cursor:pointer;padding:2px 6px;
        ">
          ✕
        </button>
      </div>
    `;

    viewport.appendChild(banner);
    this.container = banner;
    this.isBannerVisible = true;

    banner.querySelector('#rs-recovery-restore')?.addEventListener('click', () => {
      autoSaveManager.restoreDraft();
      this.closeBanner();
    });

    banner.querySelector('#rs-recovery-discard')?.addEventListener('click', () => {
      if (confirm('Discard this recovered draft? Your unsaved session will be archived.')) {
        autoSaveManager.discardRecoveryDraft();
        this.closeBanner();
      }
    });

    banner.querySelector('#rs-recovery-close')?.addEventListener('click', () => {
      this.closeBanner();
    });
  }

  public closeBanner(): void {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
    this.isBannerVisible = false;
  }

  /**
   * Modal dialog allowing user to browse and restore from past recovery snapshots.
   */
  public showVaultModal(): void {
    const existing = document.getElementById('rackslicer-vault-modal');
    if (existing) existing.remove();

    const snapshots = autoSaveManager.getVaultSnapshots();

    const modal = document.createElement('div');
    modal.id = 'rackslicer-vault-modal';
    modal.style.cssText = `
      position:fixed;top:0;left:0;width:100vw;height:100vh;
      background:rgba(10,12,16,0.85);backdrop-filter:blur(8px);
      z-index:10002;display:flex;align-items:center;justify-content:center;
      font-family:'Inter',system-ui,sans-serif;color:#fff;
    `;

    const listHtml = snapshots.length === 0
      ? '<div style="padding:30px;text-align:center;color:#8b949e;">No recovery snapshots found.</div>'
      : snapshots.map((s, idx) => {
          const date = new Date(s.timestamp).toLocaleString();
          return `
            <div style="
              display:flex;align-items:center;justify-content:space-between;
              padding:12px 14px;margin-bottom:8px;background:rgba(255,255,255,0.03);
              border:1px solid rgba(255,255,255,0.08);border-radius:8px;
            ">
              <div>
                <div style="font-weight:700;font-size:13px;color:#f0f6fc;">${s.projectName}</div>
                <div style="font-size:11px;color:#8b949e;margin-top:2px;">
                  <span>🕒 ${date}</span> &bull;
                  <span>${s.rackCount} Racks, ${s.deviceCount} Devices, ${s.cableCount} Cables</span>
                </div>
              </div>
              <button class="rs-vault-restore-btn" data-idx="${idx}" style="
                background:rgba(56,189,248,0.15);border:1px solid rgba(56,189,248,0.4);
                color:#38bdf8;font-weight:700;font-size:11px;padding:6px 12px;
                border-radius:6px;cursor:pointer;transition:all 0.15s ease;
              ">
                Restore
              </button>
            </div>
          `;
        }).join('');

    modal.innerHTML = `
      <div style="
        width:540px;max-width:92vw;background:#0d1117;border:1px solid rgba(255,255,255,0.12);
        border-radius:12px;padding:22px;box-shadow:0 20px 50px rgba(0,0,0,0.7);
      ">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:18px;">🛡️</span>
            <h2 style="margin:0;font-size:16px;font-weight:700;">Auto-Recovery Vault</h2>
          </div>
          <button id="rs-vault-close" style="background:none;border:none;color:#8b949e;font-size:16px;cursor:pointer;">✕</button>
        </div>
        <p style="margin:0 0 16px;font-size:12px;color:#8b949e;line-height:1.4;">
          Rack Slicer automatically records emergency snapshots as you work. If you ever lose work or make an accidental change, you can restore any snapshot below.
        </p>
        <div style="max-height:360px;overflow-y:auto;margin-bottom:16px;">
          ${listHtml}
        </div>
        <div style="display:flex;justify-content:flex-end;">
          <button id="rs-vault-done" style="
            background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);
            color:#fff;font-size:12px;font-weight:600;padding:6px 16px;border-radius:6px;cursor:pointer;
          ">
            Close
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    modal.querySelector('#rs-vault-close')?.addEventListener('click', closeModal);
    modal.querySelector('#rs-vault-done')?.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    modal.querySelectorAll('.rs-vault-restore-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt((btn as HTMLElement).dataset.idx || '0', 10);
        const snapshot = snapshots[idx];
        if (snapshot) {
          if (confirm(`Restore snapshot "${snapshot.projectName}"? This will replace current canvas content.`)) {
            autoSaveManager.restoreDraft(snapshot);
            closeModal();
          }
        }
      });
    });
  }
}

export const recoveryBanner = new RecoveryBanner();
