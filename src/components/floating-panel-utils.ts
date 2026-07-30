// Shared drag-to-reposition behavior for floating HTML panels overlaid on the canvas viewport
// (mirrors FloatingToolbar's own drag handling in floating-toolbar.ts) — confines the panel to
// the visible viewport bounds, same as the floating toolbar.
export function makeDraggable(panel: HTMLElement, handleSelector: string): void {
  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  panel.addEventListener('mousedown', (e: MouseEvent) => {
    const handle = (e.target as HTMLElement).closest(handleSelector);
    if (!handle) return;
    e.preventDefault();
    dragging = true;

    const rect = panel.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;

    const onMove = (moveEvent: MouseEvent) => {
      if (!dragging) return;
      const viewport = document.getElementById('canvas-viewport');
      if (!viewport) return;
      const vRect = viewport.getBoundingClientRect();

      let left = moveEvent.clientX - vRect.left - offsetX;
      let top = moveEvent.clientY - vRect.top - offsetY;
      left = Math.max(0, Math.min(left, vRect.width - rect.width));
      top = Math.max(0, Math.min(top, vRect.height - rect.height));

      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    };
    const onUp = () => {
      dragging = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
}

export function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
