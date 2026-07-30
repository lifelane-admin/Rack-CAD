// Renders the app's 'notification' events as dismissible toasts. Before this existed, every
// export success/failure, undo/redo confirmation, popup-blocked warning, etc. was emitted into
// a void with no listener anywhere — every one of those actions silently appeared to "do
// nothing", including the export pipeline, which is entirely correct/working underneath.
import { eventBus } from '../core/event-bus';

type NotificationType = 'success' | 'error' | 'warning' | 'info';

const ICONS: Record<NotificationType, string> = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
const COLORS: Record<NotificationType, string> = { success: '#22c55e', error: '#ef4444', warning: '#f59e0b', info: '#38bdf8' };
const DURATIONS: Record<NotificationType, number> = { success: 3500, info: 4000, warning: 5000, error: 7000 };

export class NotificationCenter {
  private container: HTMLDivElement;

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'notification-center';
    this.container.style.cssText = `
      position: fixed; top: 60px; right: 16px; z-index: 20000;
      display: flex; flex-direction: column; gap: 8px;
      max-width: 380px; pointer-events: none;
    `;
    document.body.appendChild(this.container);

    eventBus.on('notification', (payload) => {
      this.show(payload.message, payload.type);
    });
  }

  private show(message: string, type: NotificationType): void {
    const color = COLORS[type];
    const toast = document.createElement('div');
    toast.style.cssText = `
      pointer-events: auto; cursor: pointer;
      background: rgba(22, 27, 34, 0.97); border: 1px solid rgba(255,255,255,0.08);
      border-left: 3px solid ${color}; border-radius: 6px;
      padding: 10px 14px; color: #e6edf3; font-family: 'Inter', system-ui, sans-serif;
      font-size: 12.5px; line-height: 1.4; box-shadow: 0 8px 24px rgba(0,0,0,0.5);
      display: flex; align-items: flex-start; gap: 8px;
      opacity: 0; transform: translateX(24px); transition: opacity 0.18s ease, transform 0.18s ease;
    `;

    const icon = document.createElement('span');
    icon.textContent = ICONS[type];
    icon.style.cssText = `color:${color};font-weight:700;flex-shrink:0;margin-top:1px;`;
    toast.appendChild(icon);

    const text = document.createElement('span');
    text.textContent = message;
    text.style.cssText = 'word-break: break-word; flex: 1;';
    toast.appendChild(text);

    this.container.appendChild(toast);
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(0)';
    });

    const dismiss = () => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(24px)';
      setTimeout(() => toast.remove(), 180);
    };
    const timer = setTimeout(dismiss, DURATIONS[type]);
    toast.addEventListener('click', () => { clearTimeout(timer); dismiss(); });
  }
}
