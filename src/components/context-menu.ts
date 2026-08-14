import EventBus from '../core/event-bus';

export interface MenuItem {
  label: string;
  icon?: string;
  shortcut?: string;
  action?: () => void;
  separator?: boolean;
  disabled?: boolean;
  submenu?: MenuItem[];
}

export class ContextMenu {
  private container: HTMLElement;
  private menuEl: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.menuEl = document.createElement('div');
    this.menuEl.className = 'context-menu';
    this.menuEl.style.display = 'none';
    this.container.appendChild(this.menuEl);

    document.addEventListener('click', (e) => {
      if (!this.menuEl.contains(e.target as Node)) {
        this.hide();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.hide();
    });
  }

  show(x: number, y: number, items: MenuItem[]) {
    // The outer container (#context-menu in index.html) starts with class="hidden" —
    // `.hidden { display: none !important; }` collapses the ENTIRE subtree regardless of
    // this.menuEl's own display value below, so nothing this method does to menuEl alone can
    // ever make it visible without also clearing this on the ancestor. Every trigger of this
    // menu (rack canvas cable/device/port menus, and both cloud canvas ones) was silently
    // producing a fully-built, correctly-positioned, permanently invisible menu.
    this.container.classList.remove('hidden');
    this.menuEl.innerHTML = '';
    this.menuEl.style.display = 'block';

    this.renderItems(items, this.menuEl);

    // Position menu and keep within viewport bounds
    const rect = this.menuEl.getBoundingClientRect();
    const winWidth = window.innerWidth;
    const winHeight = window.innerHeight;

    let posX = x;
    let posY = y;

    if (posX + rect.width > winWidth) {
      posX = winWidth - rect.width - 5;
    }
    if (posY + rect.height > winHeight) {
      posY = winHeight - rect.height - 5;
    }

    this.menuEl.style.left = `${posX}px`;
    this.menuEl.style.top = `${posY}px`;
  }

  hide() {
    this.menuEl.style.display = 'none';
  }

  private renderItems(items: MenuItem[], parent: HTMLElement) {
    items.forEach(item => {
      if (item.separator) {
        const sep = document.createElement('div');
        sep.className = 'context-menu-separator';
        parent.appendChild(sep);
        return;
      }

      const itemEl = document.createElement('div');
      itemEl.className = `context-menu-item ${item.disabled ? 'disabled' : ''} ${item.submenu ? 'has-submenu' : ''}`;
      
      let innerHTML = '';
      if (item.icon) {
        innerHTML += `<span class="context-menu-icon">${item.icon}</span>`;
      } else {
        innerHTML += `<span class="context-menu-icon"></span>`;
      }
      
      innerHTML += `<span class="context-menu-label">${item.label}</span>`;
      
      if (item.shortcut) {
        innerHTML += `<span class="context-menu-shortcut">${item.shortcut}</span>`;
      }

      if (item.submenu) {
        innerHTML += `<span class="context-menu-arrow">▶</span>`;
        const subMenuEl = document.createElement('div');
        subMenuEl.className = 'context-submenu';
        this.renderItems(item.submenu, subMenuEl);
        itemEl.appendChild(subMenuEl);
      }

      itemEl.innerHTML = innerHTML;

      // Re-append submenu DOM if present (since innerHTML overwrote children)
      if (item.submenu) {
        const subMenuEl = document.createElement('div');
        subMenuEl.className = 'context-submenu';
        this.renderItems(item.submenu, subMenuEl);
        itemEl.appendChild(subMenuEl);
      }

      if (!item.disabled && item.action) {
        itemEl.addEventListener('click', (e) => {
          e.stopPropagation();
          item.action!();
          this.hide();
        });
      }

      parent.appendChild(itemEl);
    });
  }
}
