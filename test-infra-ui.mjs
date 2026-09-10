import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE = 'http://localhost:5173';
const OUT = 'test-screenshots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 900 });

const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  console.log(`✓ Saved screenshot: ${name}.png`);
};

try {
  console.log('Navigating to app...');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Switch to Datacenter tab in sidebar
  const dcTab = page.locator('.sidebar-tab:has-text("Datacenter")').first();
  if (await dcTab.isVisible()) {
    console.log('Clicking Datacenter tab...');
    await dcTab.click();
    await page.waitForTimeout(600);
  } else {
    console.log('Datacenter tab not found directly, checking sidebar...');
  }

  // If a modal popped up (e.g. create floor or startup), handle it
  const createFloorModal = page.locator('#dc-modal-confirm');
  if (await createFloorModal.isVisible()) {
    console.log('Floor creation modal visible, clicking confirm...');
    await createFloorModal.click();
    await page.waitForTimeout(600);
  }

  await shot('dc-01-initial-datacenter-floor');

  // Check topbar elements: X-Ray button & opacity slider
  const xrayBtn = page.locator('#dc-btn-xray');
  const opacitySlider = page.locator('#dc-floor-opacity');
  console.log(`X-Ray button visible: ${await xrayBtn.isVisible()}`);
  console.log(`Opacity slider visible: ${await opacitySlider.isVisible()}`);

  // Test Right-Click on a tile to show context menu
  const canvas = page.locator('#dc-canvas');
  const box = await canvas.boundingBox();
  if (box) {
    const clickX = box.x + box.width / 2;
    const clickY = box.y + box.height / 2;
    console.log(`Right-clicking canvas at ${clickX}, ${clickY}...`);
    await page.mouse.click(clickX, clickY, { button: 'right' });
    await page.waitForTimeout(500);
    await shot('dc-02-tile-contextmenu');

    // Convert to Air Channel (Airflow North)
    const acNorth = page.locator('#cm-tile-ac-north');
    if (await acNorth.isVisible()) {
      console.log('Clicking cm-tile-ac-north...');
      await acNorth.click();
      await page.waitForTimeout(500);
      await shot('dc-03-tile-airchannel-north');
    }

    // Right-click another tile to add perforated
    await page.mouse.click(clickX + 80, clickY, { button: 'right' });
    await page.waitForTimeout(500);
    const perfBtn = page.locator('#cm-tile-perf');
    if (await perfBtn.isVisible()) {
      console.log('Clicking cm-tile-perf...');
      await perfBtn.click();
      await page.waitForTimeout(500);
      await shot('dc-04-tile-perforated');
    }

    // Right-click to add Under-Floor Cable Tray
    await page.mouse.click(clickX, clickY + 80, { button: 'right' });
    await page.waitForTimeout(500);
    const addInfraBtn = page.locator('#cm-tile-add-infra');
    if (await addInfraBtn.isVisible()) {
      console.log('Clicking cm-tile-add-infra...');
      await addInfraBtn.click();
      await page.waitForTimeout(500);
      await shot('dc-05-add-infra-dialog');

      const modalConfirm = page.locator('#dc-modal-confirm');
      if (await modalConfirm.isVisible()) {
        await modalConfirm.click();
        await page.waitForTimeout(500);
        await shot('dc-06-infra-created-2d');
      }
    }
  }

  // Test Opacity Slider drag
  if (await opacitySlider.isVisible()) {
    console.log('Testing Opacity Slider...');
    await opacitySlider.fill('30');
    await opacitySlider.dispatchEvent('input');
    await page.waitForTimeout(400);
    await shot('dc-07-floor-opacity-30pct-2d');
  }

  // Toggle X-Ray
  if (await xrayBtn.isVisible()) {
    console.log('Toggling X-Ray Mode...');
    await xrayBtn.click();
    await page.waitForTimeout(400);
    await shot('dc-08-xray-mode-2d');
  }

  // Switch to 3D view
  const btn3D = page.locator('#dc-btn-3d');
  if (await btn3D.isVisible()) {
    console.log('Switching to 3D mode...');
    await btn3D.click();
    await page.waitForTimeout(1200);
    await shot('dc-09-3d-data-hall-xray');

    // Toggle 3D X-Ray off and test 3D opacity slider
    const btn3DXray = page.locator('#dc3d-btn-xray');
    if (await btn3DXray.isVisible()) {
      console.log('Toggling 3D X-Ray...');
      await btn3DXray.click();
      await page.waitForTimeout(600);
      await shot('dc-10-3d-data-hall-standard');
    }

    const slider3D = page.locator('#dc3d-floor-opacity');
    if (await slider3D.isVisible()) {
      console.log('Adjusting 3D floor opacity to 40%...');
      await slider3D.fill('40');
      await slider3D.dispatchEvent('input');
      await page.waitForTimeout(600);
      await shot('dc-11-3d-data-hall-opacity-40pct');
    }
  }

  console.log('All tests completed successfully!');
} catch (e) {
  console.error('Test failed:', e);
} finally {
  await browser.close();
}
