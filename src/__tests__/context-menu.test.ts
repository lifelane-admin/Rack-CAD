import { describe, it, expect } from 'vitest';
import { ContextMenu } from '../components/context-menu';

/**
 * Regression test for a real, universal bug: #context-menu (index.html) starts with
 * class="hidden", and `.hidden { display: none !important; }` collapses the entire subtree
 * regardless of the inner popup's own `display` value. ContextMenu.show() only ever toggled the
 * INNER element it creates — it never cleared `hidden` on the outer container it was constructed
 * with, so every trigger (rack canvas cable/device/port menus, both cloud canvas ones) was
 * silently building a fully-populated, correctly-positioned, but permanently invisible menu.
 * This is exactly the kind of failure DOM-structure assertions alone don't catch — happy-dom
 * doesn't enforce real CSS cascade/`!important`, so a test that only checks
 * `menuEl.style.display` would pass even with the bug present; this one checks the actual
 * ancestor class instead.
 */
describe('ContextMenu visibility', () => {
  it('show() removes the "hidden" class from the container it was constructed with', () => {
    document.body.innerHTML = `<div id="context-menu" class="hidden"></div>`;
    const container = document.getElementById('context-menu')!;
    const menu = new ContextMenu(container);

    expect(container.classList.contains('hidden')).toBe(true);
    menu.show(10, 10, [{ label: 'Delete', action: () => {} }]);
    expect(container.classList.contains('hidden')).toBe(false);
  });

  it('the rendered popup itself is also set to display:block on show()', () => {
    document.body.innerHTML = `<div id="context-menu" class="hidden"></div>`;
    const container = document.getElementById('context-menu')!;
    const menu = new ContextMenu(container);

    menu.show(10, 10, [{ label: 'Delete', action: () => {} }]);
    const popup = container.querySelector('.context-menu') as HTMLElement;
    expect(popup.style.display).toBe('block');
    expect(popup.textContent).toContain('Delete');
  });
});
