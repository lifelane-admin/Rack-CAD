import { stateManager } from '../core/state';

export class PortTooltip {
  private el: HTMLElement;
  private visible = false;

  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'port-tooltip';
    document.body.appendChild(this.el);
  }

  show(portId: string, screenX: number, screenY: number): void {
    const state = stateManager.getState();

    let targetPort = null;
    let targetDevice = null;
    for (const device of state.devices) {
      const port = device.ports.find(p => p.id === portId);
      if (port) { targetPort = port; targetDevice = device; break; }
    }

    if (!targetPort || !targetDevice) return;

    let connectedToText = '';
    let cableTypeText = '';
    let cableColorHex = '#555';

    if (targetPort.connected && targetPort.cableId) {
      const cable = state.cables.find(c => c.id === targetPort.cableId);
      if (cable) {
        cableTypeText = cable.type;
        cableColorHex = cable.color;
        const otherPortId = cable.sourcePortId === portId ? cable.destPortId : cable.sourcePortId;
        if (otherPortId) {
          for (const dev of state.devices) {
            const otherPort = dev.ports.find(p => p.id === otherPortId);
            if (otherPort) {
              connectedToText = `${dev.name} : ${otherPort.name}`;
              break;
            }
          }
        }
      }
    }

    const portTypeLabel = `${targetPort.type.toUpperCase()}${targetPort.speed ? ' · ' + targetPort.speed : ''}`;

    this.el.innerHTML = `
      <div class="tooltip-port-name">${targetPort.name}</div>
      <div class="tooltip-port-meta">${portTypeLabel}</div>
      <div class="tooltip-connected">
        <span class="dot ${targetPort.connected ? 'connected' : 'disconnected'}"></span>
        ${targetPort.connected
          ? `<span>Connected via <strong style="color:${cableColorHex}">${cableTypeText}</strong><br>→ ${connectedToText || 'Unknown'}</span>`
          : `<span style="color:#666">Not connected</span>`
        }
      </div>
    `;

    const tooltipW = 200;
    let px = screenX + 12;
    if (px + tooltipW > window.innerWidth - 10) {
      px = screenX - tooltipW - 12;
    }

    this.el.style.display = 'block';
    this.el.style.left = `${px}px`;
    this.el.style.top = `${screenY - 10}px`;
    this.visible = true;
  }

  hide(): void {
    this.el.style.display = 'none';
    this.visible = false;
  }
}
