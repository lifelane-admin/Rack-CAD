/**
 * Entry Point — Enterprise Datacenter Rack Designer (RackCAD)
 */
import './styles/index.css';
import './styles/layout.css';
import './styles/toolbar.css';
import './styles/sidebar.css';
import './styles/canvas.css';
import './styles/properties.css';
import './styles/context-menu.css';

import { App } from './app';

// Boot the application
document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
});
