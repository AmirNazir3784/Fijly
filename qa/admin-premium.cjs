/* Admin-only presentation QA. Uses the existing isolated backend emulator. */
const { chromium, base, routes } = require('./runtime.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const output = path.join(__dirname, 'screenshots/admin-premium');
fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch(process.env.QA_BROWSER_CHANNEL ? { channel: process.env.QA_BROWSER_CHANNEL } : {});
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [], checks = [], layouts = [];
  page.on('pageerror', error => errors.push(error.message));
  const scan = async label => {
    await page.addScriptTag({ path: 'qa/axe.min.js' });
    const violations = await page.evaluate(async () => (await axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] }
    })).violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })));
    assert.deepEqual(violations, [], label);
  };
  for (const width of [1440, 1024, 390, 375]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes.admin) {
      await page.goto(base + 'admin.html#' + route);
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.locator('.screen:visible h1').count(), 1);
      assert.equal(await page.locator('#topbar-title').innerText(), 'FIJLY ADMIN');
      const layout = await page.locator('.screen:visible').evaluate(screen => {
        const rect = screen.getBoundingClientRect();
        const clips = [...screen.querySelectorAll('button, .stat-card__value, h1, h2')]
          .filter(el => el.checkVisibility() && el.clientWidth && el.scrollWidth > el.clientWidth + 2)
          .map(el => el.textContent);
        return { pageOverflow: document.documentElement.scrollWidth > innerWidth,
          screenFits: rect.left >= 0 && rect.right <= innerWidth + 1,
          titleSize: getComputedStyle(screen.querySelector('h1')).fontSize, clips };
      });
      assert.equal(layout.pageOverflow, false, `${route}/${width}: page overflow`);
      assert.equal(layout.screenFits, true, `${route}/${width}: screen fits`);
      assert.deepEqual(layout.clips, [], `${route}/${width}: clipped controls or headings`);
      assert.equal(layout.titleSize, width < 768 ? '30px' : '36px');
      await scan(`${route}/${width}`);
      await page.screenshot({ path: path.join(output, `${route}-${width}.png`), fullPage: true });
      layouts.push({ route, width, ...layout, accessibility: 'passed' });
    }
    // Native dialogs, sidebar and profile remain keyboard accessible on phones.
    if (width < 1024) await page.locator('[data-sidebar-open]').click();
    assert.equal(await page.locator('.sidebar-home').getAttribute('href'), 'index.html');
    assert.equal(await page.locator('.sidebar-link--site').count(), 0);
    await page.setViewportSize({ width, height: 520 });
    await page.waitForFunction(() => {
      const box = document.querySelector('.sidebar-footer').getBoundingClientRect();
      return innerHeight === 520 && box.top >= 0 && box.bottom <= 521;
    });
    const footer = await page.locator('.sidebar-footer').boundingBox();
    assert.ok(footer.y >= 0 && footer.y + footer.height <= 521, 'profile stays at bottom in short viewport');
    await page.setViewportSize({ width, height: 900 });
    await page.locator('.sidebar-user').focus();
    await page.keyboard.press('Enter');
    await page.locator('#profile-name').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#profile-email').getAttribute('readonly'), '');
    assert.equal(await page.locator('#profile-role').getAttribute('readonly'), '');
    assert.equal(await page.locator('#profile-dialog').evaluate(el => el.scrollWidth > el.clientWidth + 1), false);
    await scan(`profile/${width}`);
    await page.screenshot({ path: path.join(output, `profile-${width}.png`) });
    await page.locator('#profile-name').fill('Unsaved presentation QA');
    await page.keyboard.press('Escape');
    assert.notEqual(await page.locator('.sidebar-user__name').innerText(), 'Unsaved presentation QA');
    assert.equal(await page.locator('.sidebar-user').evaluate(el => el === document.activeElement), true);
    if (width < 1024) await page.locator('[data-sidebar-close]').first().click();
    await page.goto(base + 'admin.html#clients');
    await page.locator('[data-add-client]').click();
    await scan(`client-editor/${width}`);
    assert.equal(await page.locator('#client-editor').evaluate(el => el.scrollWidth > el.clientWidth + 1), false);
    await page.screenshot({ path: path.join(output, `client-editor-${width}.png`) });
    await page.keyboard.press('Escape');
  }
  checks.push('All nine Admin screens: 1440, 1024, 390 and 375px; one title, no page overflow, no clipped headings/buttons, axe passes');
  checks.push('Sidebar profile stays visible at 520px height; logo route, keyboard opening, profile fields, cancel, focus return and dialogs pass at all four widths');

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(base + 'admin.html#dashboard');
  const count = await page.locator('#admin-action-queue .btn-link').count();
  assert.equal(await page.locator('#admin-stats .stat-card').count(), 4);
  for (let i = 0; i < count; i++) {
    await page.goto(base + 'admin.html#dashboard');
    // The label is styled as a button, but invokes the existing stretched link.
    const label = page.locator('#admin-action-queue .admin-action-label').nth(i);
    await label.scrollIntoViewIfNeeded();
    const box = await label.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.locator('dialog[open]').waitFor({ state: 'visible' });
    assert.equal(await page.locator('dialog[open]').count(), 1);
    await page.keyboard.press('Escape');
  }
  checks.push(`Dashboard: four metric cards and all ${count} existing action queue buttons open their original dialogs`);

  // Existing seed has only shared/approved scripts. Prepare a draft solely in
  // this browser's in-memory QA database, then exercise the real editor UI.
  const script = browser.fijlyDb.scripts[0];
  script.status = 'Draft';
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(base + 'admin.html#scripts');
    await page.locator(`[data-script="${script.id}"]`).first().click();
    const editor = page.locator('.admin-script-editor').first();
    const text = `Presentation QA scene at ${width}px.`;
    await editor.fill(text);
    await page.locator('#script-save').click();
    await page.waitForFunction(() => document.querySelector('#script-save-status').textContent.includes('draft saved'));
    await scan(`script-editor/${width}`);
    await page.screenshot({ path: path.join(output, `script-editor-${width}.png`) });
    await page.keyboard.press('Escape');
    await page.reload();
    await page.locator(`[data-script="${script.id}"]`).first().click();
    assert.equal(await page.locator('.admin-script-editor').first().inputValue(), text);
    await page.keyboard.press('Escape');
  }
  checks.push('Script scene editing and Save draft persist after reload at 1440px and 375px; editor accessibility passes');

  const hashes = path.join(output, 'js-before.json');
  if (fs.existsSync(hashes)) {
    for (const entry of JSON.parse(fs.readFileSync(hashes, 'utf8').replace(/^\uFEFF/, ''))) {
      assert.equal(crypto.createHash('sha256').update(fs.readFileSync(entry.Path)).digest('hex').toUpperCase(), entry.Hash, entry.Path);
    }
    checks.push('All production JavaScript files match the SHA-256 hashes captured before this design pass');
  }
  assert.deepEqual(errors, []);
  const result = { checks, layouts, errors };
  fs.writeFileSync('qa/admin-premium-results.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ checks, screenWidthChecks: layouts.length, errors }, null, 2));
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
