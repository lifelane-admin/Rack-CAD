import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';

const BASE = 'http://localhost:5173';
const OUT = 'test-screenshots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 900 });

const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  console.log(`✓ ${name}`);
};

const errors = [];

try {
  // ── 1. Initial load ────────────────────────────────────────────────────────
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await shot('01-initial-load');

  // Dismiss startup modal if present
  const modal = page.locator('[data-testid="startup-modal"], .startup-modal, #startup-modal');
  if (await modal.isVisible().catch(() => false)) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }
  // Try clicking any "Start" / "Close" / "×" button in a modal
  const closeBtn = page.locator('button:has-text("Start"), button:has-text("New"), button:has-text("Close"), button[class*="close"]').first();
  if (await closeBtn.isVisible().catch(() => false)) {
    await closeBtn.click();
    await page.waitForTimeout(400);
  }
  await shot('02-after-modal-dismiss');

  // ── 2. Toolbar checks ──────────────────────────────────────────────────────
  console.log('\n── Toolbar ──');

  // Tool strip
  const toolIds = ['tb-tool-select', 'tb-tool-pan', 'tb-tool-cable', 'tb-tool-power', 'tb-tool-text'];
  for (const id of toolIds) {
    const btn = page.locator(`#${id}`);
    const visible = await btn.isVisible().catch(() => false);
    console.log(`  ${visible ? '✓' : '✗'} #${id} ${visible ? 'visible' : 'MISSING'}`);
    if (!visible) errors.push(`Missing tool button: #${id}`);
  }

  // No logo
  const logo = await page.locator('.toolbar-logo, .tb-logo').count();
  console.log(`  ${logo === 0 ? '✓' : '✗'} No logo (${logo} found)`);
  if (logo > 0) errors.push('Logo still present in toolbar');

  // No old group markup
  const groups = await page.locator('.toolbar-group, #rack-export-group, #cloud-tools-group').count();
  console.log(`  ${groups === 0 ? '✓' : '✗'} No old toolbar-group markup (${groups} found)`);
  if (groups > 0) errors.push('Old toolbar-group markup still present');

  // Float toggle
  const floatToggle = await page.locator('#tb-float-toggle').isVisible().catch(() => false);
  console.log(`  ${floatToggle ? '✓' : '✗'} Float toggle button`);
  if (!floatToggle) errors.push('Float toggle #tb-float-toggle missing');

  // AI toggle
  const aiBtn = await page.locator('#ai-toggle-btn').isVisible().catch(() => false);
  console.log(`  ${aiBtn ? '✓' : '✗'} AI toggle button`);

  await shot('03-toolbar-overview');

  // ── 3. Menu bar ────────────────────────────────────────────────────────────
  console.log('\n── Menus ──');
  const menuLabels = ['File', 'Edit', 'View', 'Export'];
  for (const label of menuLabels) {
    const menu = page.locator(`.tb-menu:has-text("${label}")`).first();
    const visible = await menu.isVisible().catch(() => false);
    console.log(`  ${visible ? '✓' : '✗'} ${label} menu`);
    if (!visible) errors.push(`Missing menu: ${label}`);
  }

  // Open File menu
  const fileMenu = page.locator('.tb-menu:has-text("File")').first();
  if (await fileMenu.isVisible().catch(() => false)) {
    await fileMenu.click();
    await page.waitForTimeout(300);
    await shot('04-file-menu-open');
    await page.keyboard.press('Escape');
    await page.click('body');
    await page.waitForTimeout(200);
  }

  // Cloud menu absent in rack view
  const cloudMenuRack = await page.locator('#tb-menu-cloud').count();
  console.log(`  ${cloudMenuRack === 0 ? '✓' : '✗'} Cloud menu absent in rack view (${cloudMenuRack} found)`);
  if (cloudMenuRack > 0) errors.push('Cloud menu shown in rack view — should be hidden');

  // ── 4. Tool switching ──────────────────────────────────────────────────────
  console.log('\n── Tool switching ──');
  const cableBtn = page.locator('#tb-tool-cable');
  if (await cableBtn.isVisible().catch(() => false)) {
    await cableBtn.click();
    await page.waitForTimeout(200);
    const isActive = await cableBtn.evaluate(el => el.classList.contains('active'));
    console.log(`  ${isActive ? '✓' : '✗'} Cable tool activates on click`);
    if (!isActive) errors.push('Cable tool button did not get .active class');
    await shot('05-cable-tool-active');
    // Back to select
    await page.locator('#tb-tool-select').click();
    await page.waitForTimeout(200);
  }

  // ── 5. Float toggle ────────────────────────────────────────────────────────
  console.log('\n── Float toggle ──');
  const ftBtn = page.locator('#tb-float-toggle');
  if (await ftBtn.isVisible().catch(() => false)) {
    const beforeActive = await ftBtn.evaluate(el => el.classList.contains('active'));
    console.log(`  ${beforeActive ? '✓' : '✗'} Float toggle starts active (floating toolbar visible)`);
    await ftBtn.click();
    await page.waitForTimeout(300);
    const afterActive = await ftBtn.evaluate(el => el.classList.contains('active'));
    console.log(`  ${!afterActive ? '✓' : '✗'} Float toggle deactivates on click`);
    await shot('06-float-toggle-off');
    await ftBtn.click(); // re-enable
    await page.waitForTimeout(300);
  }

  // ── 6. Sidebar tabs ────────────────────────────────────────────────────────
  console.log('\n── Sidebar tabs ──');
  const tabLabels = ['Rack', 'Cloud', 'Hybrid'];
  for (const label of tabLabels) {
    const tab = page.locator(`.sb-tab:has-text("${label}")`).first();
    const visible = await tab.isVisible().catch(() => false);
    console.log(`  ${visible ? '✓' : '✗'} ${label} tab`);
    if (!visible) errors.push(`Missing sidebar tab: ${label}`);
  }

  // Rack tab active by default
  const rackTab = page.locator('.sb-tab').first();
  const rackActive = await rackTab.evaluate(el => el.classList.contains('active')).catch(() => false);
  console.log(`  ${rackActive ? '✓' : '✗'} Rack tab active by default`);

  await shot('07-sidebar-tabs');

  // ── 7. Sidebar accordion ───────────────────────────────────────────────────
  console.log('\n── Sidebar accordion ──');
  const catRows = page.locator('.cat-row');
  const catCount = await catRows.count();
  console.log(`  ✓ ${catCount} category rows found`);
  if (catCount === 0) errors.push('No .cat-row elements found in sidebar');

  // All collapsed by default
  const openItems = await page.locator('.cat-items.open').count();
  console.log(`  ${openItems === 0 ? '✓' : '✗'} All rows collapsed by default (${openItems} open)`);

  // Click first row to expand
  if (catCount > 0) {
    await catRows.first().click();
    await page.waitForTimeout(300);
    const firstOpen = await catRows.first().evaluate(el => el.classList.contains('open'));
    console.log(`  ${firstOpen ? '✓' : '✗'} First row expands on click`);
    await shot('08-accordion-expanded');

    // Click second row — first should close
    if (catCount > 1) {
      await catRows.nth(1).click();
      await page.waitForTimeout(300);
      const firstClosed = !(await catRows.first().evaluate(el => el.classList.contains('open')));
      const secondOpen = await catRows.nth(1).evaluate(el => el.classList.contains('open'));
      console.log(`  ${firstClosed && secondOpen ? '✓' : '✗'} Accordion: second click closes first row`);
      await shot('09-accordion-second-row');
    }

    // Close all
    await catRows.nth(1).click();
    await page.waitForTimeout(200);
  }

  // My Library strip
  const libraryStrip = await page.locator('.sb-library-strip').isVisible().catch(() => false);
  console.log(`  ${libraryStrip ? '✓' : '✗'} My Library strip visible`);
  if (!libraryStrip) errors.push('.sb-library-strip not found');

  await shot('10-sidebar-collapsed');

  // ── 8. Cloud tab switch ────────────────────────────────────────────────────
  console.log('\n── Cloud tab ──');
  const cloudTab = page.locator('.sb-tab:has-text("Cloud")');
  if (await cloudTab.isVisible().catch(() => false)) {
    await cloudTab.click();
    await page.waitForTimeout(600);
    const cloudMenuVisible = await page.locator('#tb-menu-cloud').isVisible().catch(() => false);
    console.log(`  ${cloudMenuVisible ? '✓' : '✗'} Cloud menu appears after switching to Cloud/Hybrid tab`);
    if (!cloudMenuVisible) errors.push('Cloud menu did not appear after clicking Cloud tab');
    await shot('11-cloud-tab-active');
  }

  // Switch back to Rack
  const rackTabEl = page.locator('.sb-tab:has-text("Rack")');
  if (await rackTabEl.isVisible().catch(() => false)) {
    await rackTabEl.click();
    await page.waitForTimeout(400);
    await shot('12-back-to-rack');
  }

} catch (err) {
  errors.push(`Unexpected error: ${err.message}`);
  console.error('Error during test:', err.message);
  await page.screenshot({ path: `${OUT}/error-state.png` });
}

await browser.close();

// ── Summary ──────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════');
if (errors.length === 0) {
  console.log('✅ ALL CHECKS PASSED');
} else {
  console.log(`❌ ${errors.length} ISSUE(S) FOUND:`);
  errors.forEach(e => console.log(`  • ${e}`));
}
console.log(`Screenshots saved to ./${OUT}/`);
