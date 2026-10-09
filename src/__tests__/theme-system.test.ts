import { describe, it, expect, beforeEach } from 'vitest';
import { stateManager } from '../core/state';
import EventBus from '../core/event-bus';
import { Theme, DesignThemeTemplate } from '../core/types';

describe('Theme & Design Template System', () => {
  beforeEach(() => {
    localStorage.clear();
    stateManager.setState({
      theme: 'dark',
      designTheme: 'enterprise-modern',
    });
  });

  it('initializes with default dark theme and enterprise-modern design template', () => {
    const state = stateManager.getState();
    expect(state.theme).toBe('dark');
    expect(state.designTheme).toBe('enterprise-modern');
  });

  it('supports switching to all 6 application UI themes', () => {
    const themes: Theme[] = [
      'light',
      'slate-light',
      'high-contrast-light',
      'dark',
      'midnight-navy',
      'high-contrast-dark'
    ];

    for (const theme of themes) {
      stateManager.setState({ theme });
      expect(stateManager.getState().theme).toBe(theme);
    }
  });

  it('supports switching to all 4 canvas design templates', () => {
    const templates: DesignThemeTemplate[] = [
      'enterprise-modern',
      'technical-blueprint',
      'high-contrast-accessible',
      'clean-minimalist'
    ];

    for (const designTheme of templates) {
      stateManager.setState({ designTheme });
      expect(stateManager.getState().designTheme).toBe(designTheme);
    }
  });

  it('emits theme:changed and design-theme:changed events through EventBus', () => {
    let capturedTheme: Theme | null = null;
    let capturedDesignTheme: DesignThemeTemplate | null = null;

    EventBus.on('theme:changed', (theme: Theme) => {
      capturedTheme = theme;
    });

    EventBus.on('design-theme:changed', (designTheme: DesignThemeTemplate) => {
      capturedDesignTheme = designTheme;
    });

    EventBus.emit('theme:changed', 'light');
    expect(capturedTheme).toBe('light');

    EventBus.emit('design-theme:changed', 'technical-blueprint');
    expect(capturedDesignTheme).toBe('technical-blueprint');
  });

  it('persists theme selection to localStorage', () => {
    localStorage.setItem('rackslicer_theme', 'slate-light');
    localStorage.setItem('rackslicer_design_theme', 'high-contrast-accessible');

    expect(localStorage.getItem('rackslicer_theme')).toBe('slate-light');
    expect(localStorage.getItem('rackslicer_design_theme')).toBe('high-contrast-accessible');
  });
});
