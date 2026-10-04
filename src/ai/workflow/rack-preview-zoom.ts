export class RackPreviewZoom {
  private scale = 1.0;
  private readonly min = 0.4;
  private readonly max = 3.0;
  private readonly step = 0.1;
  private badge: HTMLElement | null = null;
  private fadeTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly container: HTMLElement;
  private readonly inner: HTMLElement;

  constructor(container: HTMLElement, inner: HTMLElement) {
    this.container = container;
    this.inner = inner;
    this.badge = this.createBadge();
    container.appendChild(this.badge);
    container.addEventListener('wheel', this.onWheel, { passive: false });
  }

  private createBadge(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'zoom-badge';
    el.textContent = '100%';
    el.style.cssText =
      'position:absolute;top:8px;right:8px;background:rgba(0,0,0,0.55);color:#fff;font-size:11px;padding:2px 6px;border-radius:4px;pointer-events:none;opacity:0;transition:opacity 0.2s;z-index:10;';
    return el;
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -this.step : this.step;
    this.scale = Math.min(
      this.max,
      Math.max(this.min, parseFloat((this.scale + delta).toFixed(2))),
    );
    this.inner.style.transform = `scale(${this.scale})`;
    this.inner.style.transformOrigin = 'top center';
    this.showBadge();
  };

  private showBadge(): void {
    if (!this.badge) return;
    this.badge.textContent = `${Math.round(this.scale * 100)}%`;
    this.badge.style.opacity = '1';
    if (this.fadeTimer) clearTimeout(this.fadeTimer);
    this.fadeTimer = setTimeout(() => {
      if (this.badge) this.badge.style.opacity = '0';
    }, 1500);
  }

  getScale(): number {
    return this.scale;
  }

  reset(): void {
    this.scale = 1.0;
    this.inner.style.transform = 'scale(1)';
    if (this.badge) this.badge.style.opacity = '0';
  }

  destroy(): void {
    this.container.removeEventListener('wheel', this.onWheel);
    this.badge?.remove();
  }
}
