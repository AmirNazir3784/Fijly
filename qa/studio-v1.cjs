// Run from the repository root: node qa/studio-v1.cjs
const { chromium } = require('./runtime.cjs');
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.setDefaultTimeout(7000);
  const errors = [], requests = [], checks = [], scans = [];
  let runningAxe = false;
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => {
    // axe fetches stylesheets for its CSS audit; those are not application APIs.
    if (runningAxe && r.method() === 'GET' && (/\.css(?:$|\?)/.test(r.url()) || r.url().startsWith('https://fonts.googleapis.com/css2?'))) return;
    // Both portals read and write the Supabase auth and REST APIs (Parts 3A/3B).
    // Any other backend request is a failure.
    if (/^https:\/\/eaddovqkarognynnybeh\.supabase\.co\/(auth\/v1\/|rest\/v1\/)/.test(r.url())) return;
    if (['fetch', 'xhr'].includes(r.resourceType()) || r.method() !== 'GET') requests.push(r.url());
  });
  const routes = { studio: ['overview', 'projects', 'requests', 'assets', 'scripts', 'analytics', 'settings'], admin: ['dashboard', 'orders', 'payments', 'clients', 'requests', 'videos', 'revisions', 'assets', 'scripts', 'analytics', 'settings'] };
  const url = (file, screen) => pathToFileURL(path.resolve(`site/${file}.html`)).href + '#' + screen;
  async function load(file, screen) {
    await page.goto(url(file, screen));
    await page.reload();
    await page.waitForFunction(s => document.querySelector('.screen:not([hidden])')?.dataset.screen === s, screen);
  }
  async function scan(label) {
    if (!await page.evaluate(() => Boolean(window.axe))) await page.addScriptTag({ path: 'qa/axe.min.js' });
    runningAxe = true;
    const violations = await page.evaluate(async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] } })).violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })));
    runningAxe = false;
    scans.push({ label, violations });
    assert.deepEqual(violations, [], label);
  }
  fs.mkdirSync('qa/screenshots', { recursive: true });
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [file, screens] of Object.entries(routes)) for (const screen of screens) {
      await load(file, screen);
      assert.equal(await page.locator('.screen:visible').count(), 1);
      assert.equal(await page.locator('.sidebar-link[aria-current="page"]').getAttribute('data-screen'), screen);
      assert.equal(await page.locator('h1:visible').count(), 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${file}/${screen}/${width} overflow`);
      assert.doesNotMatch(await page.locator('body').innerText(), /Pro plan|video credits|Upgrade|Subscription|Billing/);
      if ([1440, 390].includes(width)) {
        await page.evaluate(() => document.fonts.ready);
        await scan(`${file}/${screen}/${width}`);
        await page.screenshot({ path: `qa/screenshots/v1-${file}-${screen}-${width}.png`, fullPage: true });
      }
    }
    checks.push(`${width}px: all 18 active routes, selected navigation, one heading, no overflow or subscription UI`);
  }
  for (const file of Object.keys(routes)) {
    await load(file, routes[file][0]);
    assert.equal(await page.locator('.sidebar-nav a[data-screen]').count(), routes[file].length);
    for (const screen of routes[file]) {
      await page.locator('[data-sidebar-open]').click();
      assert.equal(await page.locator('.studio-main').evaluate(e => e.inert), true);
      await page.locator(`.sidebar-link[data-screen="${screen}"]`).click();
      assert.equal(await page.locator('.screen:visible').getAttribute('data-screen'), screen);
      assert.equal(await page.evaluate(() => document.activeElement.tagName), 'H1');
      assert.equal(await page.locator('.studio-main').evaluate(e => e.inert), false);
    }
    await page.locator('[data-sidebar-open]').click();
    // Sign out is the sidebar's last control; Tab wraps to the logo.
    await page.locator('[data-sign-out]').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('.sidebar-home').evaluate(e => e === document.activeElement), true);
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.locator('[data-sign-out]').evaluate(e => e === document.activeElement), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('[data-sidebar-open]').getAttribute('aria-expanded'), 'false');
    await page.locator('[data-sidebar-open]').click();
    await page.setViewportSize({ width: 1440, height: 900 });
    assert.equal(await page.locator('#sidebar').evaluate(e => e.inert), false);
    assert.equal(await page.locator('.studio-main').evaluate(e => e.inert), false);
    await page.locator(`.sidebar-link[data-screen="${routes[file][0]}"]`).click();
    await page.locator(`.sidebar-link[data-screen="${routes[file][1]}"]`).click();
    await page.goBack();
    await page.waitForFunction(s => document.querySelector('.screen:not([hidden])').dataset.screen === s, routes[file][0]);
    await page.goForward();
    await page.waitForFunction(s => document.querySelector('.screen:not([hidden])').dataset.screen === s, routes[file][1]);
    await page.setViewportSize({ width: 320, height: 900 });
  }
  checks.push('Both shells: mobile links, focus trap, Escape, resize, and browser back/forward');
  await page.goto(url('studio', 'team')); await page.reload();
  assert.equal(await page.locator('.screen:visible').getAttribute('data-screen'), 'overview');
  assert.ok(page.url().endsWith('#overview'));
  assert.equal(await page.locator('#future-team').count(), 0);
  assert.equal(await page.locator('#future-subscription').count(), 0);
  assert.equal(await page.locator('.sidebar-plan').count(), 0);
  await page.goto(url('admin', 'revisions')); await page.reload();
  assert.equal(await page.locator('.screen:visible').getAttribute('data-screen'), 'revisions');
  await page.goto(url('admin', 'assets')); await page.reload();
  assert.equal(await page.locator('.screen:visible').getAttribute('data-screen'), 'assets');
  // No Admin route is deferred any more, so an unknown hash exercises the fallback.
  await page.goto(url('admin', 'no-such-route')); await page.reload();
  assert.equal(await page.locator('.screen:visible').getAttribute('data-screen'), 'dashboard');
  assert.equal(await page.locator('.admin-nav-pending').count(), 0);
  checks.push('Team and subscriptions retained only in inactive templates; deferred Admin routes fall back safely');

  await page.setViewportSize({ width: 1440, height: 900 });
  await load('studio', 'projects');
  // The client table is built from the shared mock state in Phase 2, so the
  // expected counts are derived from that state rather than hard-coded.
  const expected = await page.evaluate(() => {
    const mine = FijlyMock.state.videos.filter(v => FijlyMock.requestFor(v).client === 'northbeam');
    return {
      production: mine.filter(v => !['Completed', 'Client Review'].includes(v.status)).length,
      review: mine.filter(v => v.status === 'Client Review').length,
      delivered: mine.filter(v => v.status === 'Completed').length,
      all: FijlyMock.state.requests.filter(r => r.client === 'northbeam').length
    };
  });
  assert.ok(expected.all > 0, 'client portal should have northbeam videos');
  for (const filter of ['production', 'review', 'delivered', 'all']) {
    await page.locator(`[data-filter="${filter}"]`).click();
    const rows = await page.locator('.projects-table tbody tr:visible').count();
    // A filter with no matches renders one "no projects" row instead of zero.
    assert.equal(rows, expected[filter] || 1, `${filter}: ${rows} rows vs ${expected[filter]} videos`);
  }
  await page.locator('.sidebar-link[data-screen="overview"]').click();
  // The preview is a placeholder: it names the featured video and never plays.
  assert.equal(await page.locator('#preview .canvas, #preview .timeline, [data-play-toggle]').count(), 0);
  assert.match(await page.locator('#preview-video').innerText(), / · (Client Review|In Production|In Revision|Draft Ready|Approved|Completed)$/);
  assert.equal(await page.locator('.scene').count(), 5);
  await page.locator('.sidebar-link[data-screen="settings"]').click();
  // Notification switches had no database columns and were removed; the
  // stored defaults (platform, length) remain.
  assert.equal(await page.locator('#client-settings-form input[type="checkbox"]').count(), 0);
  assert.equal(await page.locator('#client-default-platform').count(), 1);
  await page.locator('.sidebar-link[data-screen="requests"]').click();
  // Counts are relative: the list is driven by shared state, whose seed may grow.
  const cardsBefore = await page.locator('[data-request-list] .list-card').count();
  const openBefore = Number(await page.locator('[data-request-count]').textContent());
  // Projects start in the wizard on order.html; this screen links there and
  // keeps the history list. submit_project refuses an incomplete brief.
  assert.equal(await page.locator('.request-start a[href="order.html"]').count(), 1);
  const refused = await page.evaluate(() => supabaseClient.rpc('submit_project', { p_title: '', p_video_type: 'Product Demo', p_duration: 60, p_brief: '' }).then(r => !!r.error));
  assert.equal(refused, true, 'an incomplete project must not be created');
  assert.equal(await page.locator('[data-request-list] .list-card').count(), cardsBefore,
    'an incomplete request must not be created');
  await page.evaluate(async () => {
    const result = await supabaseClient.rpc('submit_project', { p_title: 'Northbeam / New onboarding', p_video_type: 'Tutorial / Onboarding', p_duration: 60,
      p_brief: 'Explain connecting a data source and exporting the first report.', p_purpose: 'Reduce onboarding support tickets.', p_target_audience: 'New customers.' });
    if (result.error) throw new Error(result.error.message);
    await FijlyData.load();
  });
  await page.waitForFunction(n => document.querySelectorAll('[data-request-list] .list-card').length === n, cardsBefore + 1);
  assert.equal(Number(await page.locator('[data-request-count]').textContent()), openBefore + 1);
  // The request is stored in the database, so a reload keeps it.
  await page.reload();
  assert.equal(await page.locator('[data-request-list] .list-card').count(), cardsBefore + 1,
    'the request should survive a reload');
  checks.push('Client filters, preview placeholder, storyboard, stored settings defaults, validated requests and database persistence');

  await load('admin', 'clients');
  await page.locator('#client-search').fill('alex');
  assert.equal(await page.locator('#client-rows tr').count(), 1);
  await page.locator('#client-status').selectOption('Paused');
  assert.equal(await page.locator('#client-empty').isVisible(), true);
  await page.locator('#clear-client-filters').click();
  assert.equal(await page.locator('#client-rows tr').count(), 6);
  await page.locator('#client-sort').selectOption('projects');
  assert.match(await page.locator('#client-rows tr').first().textContent(), /Northbeam/);
  await page.locator('[data-add-client]').click();
  await scan('admin/client-editor');
  await page.getByRole('button', { name: 'Save client' }).click();
  assert.equal(await page.locator('#client-editor').evaluate(e => e.open), true);
  await page.locator('#client-name').fill('Northbeam');
  await page.locator('#client-contact').fill('Jamie');
  await page.locator('#client-email').fill('jamie@example.com');
  await page.getByRole('button', { name: 'Save client' }).click();
  assert.match(await page.locator('#client-name').evaluate(e => e.validationMessage), /already exists/);
  await page.locator('#client-name').fill('Nimbus');
  await page.locator('#client-website').fill('https://nimbus.example');
  await page.locator('#client-notes').fill('<b>Keep narration concise.</b>');
  await page.getByRole('button', { name: 'Save client' }).click();
  await page.waitForFunction(() => !document.getElementById('client-editor').open);
  assert.equal(await page.locator('#client-rows tr').count(), 7);
  await page.locator('#client-rows [data-client]').filter({ hasText: 'Nimbus' }).first().click();
  assert.equal(await page.locator('.admin-detail-notes').textContent(), '<b>Keep narration concise.</b>');
  assert.equal(await page.locator('.admin-detail-notes b').count(), 0);
  assert.match(await page.locator('.admin-project-list').textContent(), /No projects yet/);
  await scan('admin/client-detail-empty');
  await page.locator('#edit-client').click();
  await page.locator('#edit-client-status').selectOption('Active');
  await page.getByRole('button', { name: 'Save client' }).click();
  await page.waitForFunction(() => document.getElementById('client-detail').open);
  assert.equal(await page.locator('.admin-detail-intro .badge').textContent(), 'Active');
  await page.locator('#edit-client').click();
  await page.locator('#client-name').fill('Unsaved company');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.getElementById('client-detail').open);
  assert.equal(await page.locator('#client-detail-title').textContent(), 'Nimbus');
  await page.keyboard.press('Escape');
  await page.locator('.sidebar-link[data-screen="dashboard"]').click();
  assert.equal(await page.locator('#admin-stats .stat-card__value').first().textContent(), '05');
  await page.locator('#admin-priorities [data-client="northbeam"]').first().click();
  assert.equal(await page.locator('.admin-project-list li').count(), await page.evaluate(() => FijlyMock.state.projects.filter(p => p.client === 'northbeam').length + FijlyMock.pendingRequests('northbeam').length));
  assert.match(await page.locator('.admin-project-list').innerText(), /Submitted|Under Review/);
  await scan('admin/client-detail-projects');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.screenshot({ path: 'qa/screenshots/v1-admin-client-detail-390.png', fullPage: true });
  await page.locator('#edit-client').click();
  await scan('admin/client-editor-mobile');
  await page.screenshot({ path: 'qa/screenshots/v1-admin-client-editor-390.png', fullPage: true });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.getElementById('client-detail').open);
  await page.keyboard.press('Escape');
  await page.reload();
  // The client added above is stored in the database, so it is still present
  // after reload and the Active-clients metric reflects it.
  const activeClients = await page.evaluate(
    () => FijlyMock.state.clients.filter(c => c.status === 'Active').length);
  assert.equal(await page.locator('#admin-stats .stat-card__value').first().textContent(),
    String(activeClients).padStart(2, '0'));
  assert.equal(await page.locator('#client-rows tr').count(), 7,
    'the added client should survive reload');
  checks.push('Admin search/status/sort/empty state, validation and duplicate prevention, safe text rendering, add/edit/cancel, metric updates, profiles, dialogs, and database persistence');
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, []);
  const report = { checks, scans, errors, apiRequests: requests };
  fs.writeFileSync('qa/studio-v1-results.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ checks, accessibilityScans: scans.length, errors, apiRequests: requests }, null, 2));
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
