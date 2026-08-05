import { describe, it, expect, beforeEach } from 'vitest';
import { stateManager } from '../core/state';
import { findNearestRack, rackCenterX } from '../utils/annotation-align';

/**
 * "Center Horizontally" button + exact X/Y numeric fields in the Text/Image Tool panels —
 * addresses arrow-key nudging still being too slow/imprecise for lining a label up exactly
 * with a rack (e.g. matching one label's alignment with another placed above it, like
 * "NPCI Router 1" / "NPCI Router 2" over adjacent device rows). Centering sets TextLabel.align
 * to 'center' and TextLabel.x / ImageAsset.x to the target rack's horizontal center — for text
 * this leans on the renderer's own text-anchor="middle" handling, so no text-width estimation
 * is needed here to land exactly centered regardless of the label's content.
 */
function mountAppSkeleton(): void {
  document.body.innerHTML = `
    <div id="app">
      <header id="toolbar"></header>
      <div id="workspace">
        <aside id="sidebar"></aside>
        <main id="canvas-container">
          <div id="ruler-corner"></div>
          <div id="ruler-horizontal"></div>
          <div id="ruler-vertical"></div>
          <div id="canvas-viewport">
            <svg id="canvas"></svg>
          </div>
          <div id="minimap"></div>
        </main>
        <aside id="properties-panel"></aside>
      </div>
      <footer id="statusbar"></footer>
      <div id="context-menu" class="hidden"></div>
    </div>
    <div id="ai-key-modal" class="hidden"></div>
    <div id="export-report-modal" class="hidden"></div>
    <div id="custom-asset-modal" class="hidden"></div>
  `;
}

describe('findNearestRack / rackCenterX', () => {
  const racks = [
    { id: 'r1', name: 'Rack 1', units: 42 as const, x: 300, y: 100 },
    { id: 'r2', name: 'Rack 2', units: 42 as const, x: 900, y: 100 },
  ];

  it('prefers the rack whose vertical span contains the point', () => {
    const rack = findNearestRack(racks, /* x */ 950, /* y */ 200);
    expect(rack?.id).toBe('r2');
  });

  it('falls back to horizontal proximity when no rack vertically contains the point', () => {
    const rack = findNearestRack(racks, /* x */ 920, /* y */ -500);
    expect(rack?.id).toBe('r2');
  });

  it('returns null when there are no racks', () => {
    expect(findNearestRack([], 100, 100)).toBeNull();
  });

  it('computes the rack outer-width center', () => {
    // RACK_OUTER_WIDTH is 450 (core/types.ts RACK_CONSTANTS) — center of a rack at x=300 is 525.
    expect(rackCenterX(racks[0])).toBe(300 + 450 / 2);
  });
});

describe('Text Tool panel — Center Horizontally', () => {
  beforeEach(() => {
    stateManager.setState({
      racks: [], devices: [], cables: [], bundles: [], textLabels: [], imageAssets: [], selection: [],
      tool: 'select', cableInProgress: null,
    });
  });

  it('sets align to center and X to the nearest rack\'s exact center', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    stateManager.setState({
      racks: [{ id: 'r1', name: 'Rack 1', units: 42, x: 300, y: 100 }],
      textLabels: [{
        id: 'lbl-center', x: 340, y: 130, text: 'NPCI Router 2', fontFamily: 'Inter, sans-serif',
        fontSize: 20, fontWeight: 'normal', fontStyle: 'normal', underline: false,
        color: '#1e88e5', align: 'left', backgroundColor: null, rotation: 0,
      }],
      selection: [{ type: 'text', id: 'lbl-center' }],
    });
    (app as any).renderAll();

    const btn = document.querySelector('#text-tool-panel .ttp-center-h') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    btn.click();

    const label = stateManager.getState().textLabels.find(t => t.id === 'lbl-center')!;
    expect(label.align).toBe('center');
    expect(label.x).toBe(300 + 450 / 2); // rack.x + RACK_OUTER_WIDTH / 2
  });

  it('exact X/Y numeric fields commit on change, letting a second label reuse the first\'s coordinates', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    stateManager.setState({
      textLabels: [{
        id: 'lbl-xy', x: 10, y: 10, text: 'Label', fontFamily: 'Inter, sans-serif',
        fontSize: 16, fontWeight: 'normal', fontStyle: 'normal', underline: false,
        color: '#e6ecf2', align: 'left', backgroundColor: null, rotation: 0,
      }],
      selection: [{ type: 'text', id: 'lbl-xy' }],
    });
    (app as any).renderAll();

    const xInput = document.querySelector('#text-tool-panel .ttp-pos-x') as HTMLInputElement;
    const yInput = document.querySelector('#text-tool-panel .ttp-pos-y') as HTMLInputElement;
    expect(xInput).toBeTruthy();
    expect(yInput).toBeTruthy();

    xInput.value = '525';
    xInput.dispatchEvent(new Event('change', { bubbles: true }));
    yInput.value = '77';
    yInput.dispatchEvent(new Event('change', { bubbles: true }));

    const label = stateManager.getState().textLabels.find(t => t.id === 'lbl-xy')!;
    expect(label.x).toBe(525);
    expect(label.y).toBe(77);
  });
});

describe('Image Tool panel — Center Horizontally', () => {
  beforeEach(() => {
    stateManager.setState({
      racks: [], devices: [], cables: [], bundles: [], textLabels: [], imageAssets: [], selection: [],
      tool: 'select', cableInProgress: null,
    });
  });

  it('sets X so the image\'s own center lines up with the nearest rack\'s center', async () => {
    mountAppSkeleton();
    const { App } = await import('../app');
    const app = new App();
    app.init();

    stateManager.setState({
      racks: [{ id: 'r1', name: 'Rack 1', units: 42, x: 300, y: 100 }],
      imageAssets: [{
        id: 'img-center', x: 340, y: 130, width: 80, height: 40,
        src: 'data:image/png;base64,AAAA', opacity: 1, rotation: 0,
      }],
      selection: [{ type: 'image', id: 'img-center' }],
    });
    (app as any).renderAll();

    const btn = document.querySelector('#image-tool-panel .itp-center-h') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    btn.click();

    const asset = stateManager.getState().imageAssets.find(a => a.id === 'img-center')!;
    // rack center (525) minus half the image's own width (40) = 485.
    expect(asset.x).toBe(300 + 450 / 2 - 40);
  });
});
