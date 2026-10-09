/**
 * RackSlicer — Theme & Design Studio Modal
 * Interactive theme switcher offering:
 * - 6 UI Themes (Obsidian Dark, Clean Lite, Slate Lite, High-Contrast Lite, Midnight Navy, High-Contrast Dark)
 * - 4 Canvas & Export Design Templates (Enterprise Modern, Technical Blueprint, High-Contrast Accessible, Clean Minimalist)
 * Fully accessible with WCAG AAA contrast and instant zero-overhead live switching.
 */

import { Theme, DesignThemeTemplate } from '../core/types';
import { stateManager } from '../core/state';
import EventBus from '../core/event-bus';

interface ThemeDefinition {
  id: Theme;
  name: string;
  badge: string;
  badgeType: 'dark' | 'light' | 'accessibility';
  description: string;
  swatches: {
    bg: string;
    card: string;
    accent: string;
    text: string;
    border: string;
  };
}

interface DesignTemplateDefinition {
  id: DesignThemeTemplate;
  name: string;
  category: string;
  description: string;
  previewClass: string;
  accentColor: string;
}

const UI_THEMES: ThemeDefinition[] = [
  {
    id: 'light',
    name: 'Clean Lite',
    badge: 'WCAG AAA (7:1+)',
    badgeType: 'light',
    description: 'Crisp, high-clarity daylight theme with sky blue accents and zero eye-strain typography.',
    swatches: {
      bg: '#f8fafc',
      card: '#ffffff',
      accent: '#0284c7',
      text: '#0f172a',
      border: '#cbd5e1'
    }
  },
  {
    id: 'slate-light',
    name: 'Slate Lite',
    badge: 'Comfort Daylight',
    badgeType: 'light',
    description: 'Soft neutral daylight palette with calming indigo accents, ideal for all-day engineering workflows.',
    swatches: {
      bg: '#f1f5f9',
      card: '#f8fafc',
      accent: '#4f46e5',
      text: '#1e293b',
      border: '#94a3b8'
    }
  },
  {
    id: 'high-contrast-light',
    name: 'High-Contrast Lite',
    badge: 'WCAG AAA (21:1)',
    badgeType: 'accessibility',
    description: 'Ultra-accessible pure white canvas with jet-black text, bold 2px borders, and maximum readability.',
    swatches: {
      bg: '#ffffff',
      card: '#ffffff',
      accent: '#000000',
      text: '#000000',
      border: '#000000'
    }
  },
  {
    id: 'dark',
    name: 'Obsidian Dark',
    badge: 'Default Dark',
    badgeType: 'dark',
    description: 'Deep contrast obsidian dark theme tailored for dimmed studio lighting and NOC operations.',
    swatches: {
      bg: '#080a0f',
      card: '#0f172a',
      accent: '#38bdf8',
      text: '#f8fafc',
      border: '#334155'
    }
  },
  {
    id: 'midnight-navy',
    name: 'Midnight Navy',
    badge: 'Enterprise Cobalt',
    badgeType: 'dark',
    description: 'Enterprise data center blue with electric cobalt accents and high-tech command center aesthetic.',
    swatches: {
      bg: '#070e1c',
      card: '#0b1528',
      accent: '#3b82f6',
      text: '#e2e8f0',
      border: '#1e3a6e'
    }
  },
  {
    id: 'high-contrast-dark',
    name: 'High-Contrast Dark',
    badge: 'WCAG AAA OLED',
    badgeType: 'accessibility',
    description: 'True pitch black OLED background with pure white text and vibrant gold interactive elements.',
    swatches: {
      bg: '#000000',
      card: '#0a0a0a',
      accent: '#facc15',
      text: '#ffffff',
      border: '#ffffff'
    }
  }
];

const DESIGN_TEMPLATES: DesignTemplateDefinition[] = [
  {
    id: 'enterprise-modern',
    name: 'Enterprise Modern',
    category: 'Standard Engineering',
    description: 'Balanced technical layout with clean vector borders, subtle depth, and clear port numbering.',
    previewClass: 'preview-enterprise',
    accentColor: '#38bdf8'
  },
  {
    id: 'technical-blueprint',
    name: 'Technical Blueprint',
    category: 'Architectural Drafting',
    description: 'CAD-style cyan engineering grid with architectural schematic styling, ideal for technical reviews.',
    previewClass: 'preview-blueprint',
    accentColor: '#38bdf8'
  },
  {
    id: 'high-contrast-accessible',
    name: 'High-Contrast Accessible',
    category: 'Universal Accessibility',
    description: 'Heavy 2.5px+ strokes, high-separation cable badges, and colorblind-safe port grouping.',
    previewClass: 'preview-accessible',
    accentColor: '#10b981'
  },
  {
    id: 'clean-minimalist',
    name: 'Clean Minimalist',
    category: 'Executive & Whitepaper',
    description: 'Clean paper style with zero visual noise, softened line weights, perfect for PDF reports.',
    previewClass: 'preview-minimalist',
    accentColor: '#94a3b8'
  }
];

export class ThemeModal {
  private overlay: HTMLElement | null = null;

  public open(): void {
    this.close();
    this.render();
  }

  public close(): void {
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
    this.overlay = null;
  }

  private render(): void {
    const currentState = stateManager.getState();
    const activeTheme = currentState.theme || 'dark';
    const activeDesignTheme = currentState.designTheme || 'enterprise-modern';

    this.overlay = document.createElement('div');
    this.overlay.className = 'dh-modal-overlay theme-modal-overlay';

    this.overlay.innerHTML = `
      <div class="dh-modal-card theme-modal-card" style="width: 820px; max-width: 95vw; max-height: 90vh;">
        <!-- Header -->
        <div class="dh-modal-header" style="display: flex; justify-content: space-between; align-items: center; padding: 18px 24px; border-bottom: 1px solid var(--border-color); background: var(--bg-header);">
          <div>
            <div style="font-size: 17px; font-weight: 800; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
              <span>🎨</span> <span>Theme & Design Studio</span>
            </div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
              Customize application appearance, light/dark modes, and architectural diagram presentation styles
            </div>
          </div>
          <button id="theme-modal-close" class="dh-modal-close" style="background: none; border: none; font-size: 18px; color: var(--text-secondary); cursor: pointer; padding: 4px 8px; border-radius: 6px;">✕</button>
        </div>

        <!-- Body -->
        <div class="dh-modal-body" style="padding: 24px; overflow-y: auto; display: flex; flex-direction: column; gap: 24px; background: var(--bg-card);">
          
          <!-- Section 1: Application UI Themes -->
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <div style="font-size: 14px; font-weight: 700; color: var(--text-primary); text-transform: uppercase; letter-spacing: 0.5px;">
                1. Application UI Themes (6 Themes)
              </div>
              <span style="font-size: 11px; font-weight: 600; color: var(--accent-primary); background: var(--btn-mode-active-bg); padding: 2px 8px; border-radius: 12px; border: 1px solid var(--accent-primary);">
                Live Instant Preview
              </span>
            </div>
            <div class="theme-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 12px;">
              ${UI_THEMES.map(t => {
                const isSelected = t.id === activeTheme;
                return `
                  <div class="theme-card ${isSelected ? 'active' : ''}" data-theme-id="${t.id}" style="
                    border: 2px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-color)'};
                    background: ${isSelected ? 'var(--btn-mode-active-bg)' : 'var(--bg-app)'};
                    border-radius: 10px;
                    padding: 14px;
                    cursor: pointer;
                    transition: all 0.15s ease;
                    position: relative;
                  ">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                      <div style="font-size: 13px; font-weight: 800; color: var(--text-primary);">${t.name}</div>
                      <span style="font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: rgba(56,189,248,0.15); color: var(--accent-primary); border: 1px solid var(--accent-primary);">${t.badge}</span>
                    </div>

                    <!-- Color Swatches Bar -->
                    <div style="display: flex; gap: 4px; margin-bottom: 10px; height: 16px; border-radius: 4px; overflow: hidden; border: 1px solid rgba(0,0,0,0.15);">
                      <div style="flex: 2; background: ${t.swatches.bg};" title="App Background: ${t.swatches.bg}"></div>
                      <div style="flex: 2; background: ${t.swatches.card};" title="Card Background: ${t.swatches.card}"></div>
                      <div style="flex: 1.5; background: ${t.swatches.accent};" title="Accent: ${t.swatches.accent}"></div>
                      <div style="flex: 1.5; background: ${t.swatches.text};" title="Text: ${t.swatches.text}"></div>
                    </div>

                    <div style="font-size: 11px; color: var(--text-secondary); line-height: 1.4;">${t.description}</div>
                    
                    ${isSelected ? `
                      <div style="position: absolute; top: -8px; right: 8px; background: var(--accent-primary); color: #fff; font-size: 10px; font-weight: 800; padding: 1px 6px; border-radius: 10px;">
                        ✓ ACTIVE
                      </div>
                    ` : ''}
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <!-- Section 2: Canvas & Diagram Design Templates -->
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <div style="font-size: 14px; font-weight: 700; color: var(--text-primary); text-transform: uppercase; letter-spacing: 0.5px;">
                2. Canvas & Export Design Templates (4 Templates)
              </div>
              <span style="font-size: 11px; color: var(--text-secondary);">
                Controls grid lines, frame borders & diagram aesthetics
              </span>
            </div>
            <div class="template-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 12px;">
              ${DESIGN_TEMPLATES.map(tmpl => {
                const isSelected = tmpl.id === activeDesignTheme;
                return `
                  <div class="design-template-card ${isSelected ? 'active' : ''}" data-template-id="${tmpl.id}" style="
                    border: 2px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-color)'};
                    background: ${isSelected ? 'var(--btn-mode-active-bg)' : 'var(--bg-app)'};
                    border-radius: 10px;
                    padding: 14px;
                    cursor: pointer;
                    transition: all 0.15s ease;
                    position: relative;
                  ">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                      <div style="font-size: 13px; font-weight: 800; color: var(--text-primary); display: flex; align-items: center; gap: 6px;">
                        <span style="width: 8px; height: 8px; border-radius: 50%; background: ${tmpl.accentColor}; display: inline-block;"></span>
                        ${tmpl.name}
                      </div>
                      <span style="font-size: 10px; font-weight: 600; color: var(--text-secondary);">${tmpl.category}</span>
                    </div>

                    <div style="font-size: 11px; color: var(--text-secondary); line-height: 1.4; margin-bottom: 8px;">
                      ${tmpl.description}
                    </div>

                    <div style="display: flex; gap: 6px; align-items: center;">
                      <span style="font-size: 10px; font-weight: 700; color: var(--accent-primary); background: rgba(56,189,248,0.1); padding: 2px 6px; border-radius: 4px;">
                        ${tmpl.id === 'technical-blueprint' ? '📐 Precision CAD Grid' : tmpl.id === 'high-contrast-accessible' ? '👁 2.5px Bold Outlines' : tmpl.id === 'clean-minimalist' ? '📄 Low Noise Paper' : '⚡ Balanced Dynamic'}
                      </span>
                    </div>

                    ${isSelected ? `
                      <div style="position: absolute; top: -8px; right: 8px; background: var(--accent-primary); color: #fff; font-size: 10px; font-weight: 800; padding: 1px 6px; border-radius: 10px;">
                        ✓ ACTIVE
                      </div>
                    ` : ''}
                  </div>
                `;
              }).join('')}
            </div>
          </div>

        </div>

        <!-- Footer -->
        <div class="dh-modal-footer" style="padding: 16px 24px; border-top: 1px solid var(--border-color); background: var(--bg-header); display: flex; justify-content: space-between; align-items: center;">
          <button id="theme-btn-reset" style="background: none; border: 1px solid var(--border-color); color: var(--text-secondary); padding: 6px 14px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;">
            ↺ Reset to Default
          </button>
          <button id="theme-btn-done" style="background: var(--accent-primary); border: none; color: #ffffff; padding: 6px 20px; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer;">
            Done
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(this.overlay);
    this.attachEventListeners();
  }

  private attachEventListeners(): void {
    if (!this.overlay) return;

    // Close button
    this.overlay.querySelector('#theme-modal-close')?.addEventListener('click', () => this.close());
    this.overlay.querySelector('#theme-btn-done')?.addEventListener('click', () => this.close());

    // Close on backdrop click
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    // Theme cards
    this.overlay.querySelectorAll<HTMLElement>('.theme-card').forEach(card => {
      card.addEventListener('click', () => {
        const themeId = card.getAttribute('data-theme-id') as Theme;
        if (!themeId) return;

        // Apply immediately
        stateManager.setState({ theme: themeId });
        try {
          localStorage.setItem('rackslicer_theme', themeId);
        } catch (_) {}
        document.documentElement.setAttribute('data-theme', themeId);
        document.body.setAttribute('data-theme', themeId);
        EventBus.emit('theme:changed', themeId);

        // Re-render modal to refresh selection UI
        this.render();
      });
    });

    // Design Template cards
    this.overlay.querySelectorAll<HTMLElement>('.design-template-card').forEach(card => {
      card.addEventListener('click', () => {
        const tmplId = card.getAttribute('data-template-id') as DesignThemeTemplate;
        if (!tmplId) return;

        // Apply immediately
        stateManager.setState({ designTheme: tmplId });
        try {
          localStorage.setItem('rackslicer_design_theme', tmplId);
        } catch (_) {}
        document.documentElement.setAttribute('data-design-theme', tmplId);
        document.body.setAttribute('data-design-theme', tmplId);
        EventBus.emit('design-theme:changed', tmplId);

        // Re-render modal to refresh selection UI
        this.render();
      });
    });

    // Reset button
    this.overlay.querySelector('#theme-btn-reset')?.addEventListener('click', () => {
      const defaultTheme: Theme = 'dark';
      const defaultDesignTheme: DesignThemeTemplate = 'enterprise-modern';

      stateManager.setState({ theme: defaultTheme, designTheme: defaultDesignTheme });
      try {
        localStorage.setItem('rackslicer_theme', defaultTheme);
        localStorage.setItem('rackslicer_design_theme', defaultDesignTheme);
      } catch (_) {}
      document.documentElement.setAttribute('data-theme', defaultTheme);
      document.body.setAttribute('data-theme', defaultTheme);
      document.documentElement.setAttribute('data-design-theme', defaultDesignTheme);
      document.body.setAttribute('data-design-theme', defaultDesignTheme);
      EventBus.emit('theme:changed', defaultTheme);
      EventBus.emit('design-theme:changed', defaultDesignTheme);

      this.render();
    });
  }
}
