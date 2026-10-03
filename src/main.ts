/**
 * Entry Point — Rack Slicer
 */
import '@fontsource/inter/300.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import './styles/index.css';
import './styles/layout.css';
import './styles/toolbar.css';
import './styles/sidebar.css';
import './styles/canvas.css';
import './styles/properties.css';
import './styles/context-menu.css';
import './styles/ai-panel.css';
import './styles/color-picker-modal.css';
import './styles/model-registry.css';

import { App } from './app';

// Boot the application
document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
});
