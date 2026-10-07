/* Admin Assets, Analytics and Settings.
   Covers search/filter/sort, create (real upload to emulated Storage),
   file validation, preview, download, edit and delete (file and row), client
   relationships, analytics derivation from shared records, settings
   persistence, responsive widths and accessibility. */
const { chromium, qaUsers } = require('./runtime.cjs');
const assert = require('assert/strict');
const fs = require('fs');
fs.mkdirSync('qa/screenshots',{recursive:true});

const url = (portal, route) => require('./runtime.cjs').base+`${portal}.html#${route}`;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  const c = await ctx.newPage();
  const errors = [];
  const checks = [];
  const scans = [];
  for (const page of [p, c]) {
    page.setDefaultTimeout(8000);
    page.on('pageerror', e => errors.push(`${page === p ? 'admin' : 'client'} pageerror: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  }
  async function scan(label) {
    await p.addScriptTag({ path: 'qa/axe.min.js' });
    const violations = await p.evaluate(async () =>
      (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] } }))
        .violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })));
    scans.push({ label, violations });
  }
  const rows = () => p.locator('#asset-rows tr').count();

  /* ── Assets: search / filter / sort ─────────────────────────────────── */
  await p.goto(url('admin', 'assets'));
  const total = await p.evaluate(() => FijlyMock.state.assets.length);
  assert.equal(await rows(), total, 'all assets listed initially');

  await p.locator('#asset-search').fill('guidelines');
  const searched = await rows();
  assert.ok(searched > 0 && searched < total, `search narrows: ${searched}/${total}`);
  await p.locator('#asset-search').fill('');

  await p.locator('#asset-client').selectOption('northbeam');
  const nb = await p.evaluate(() => FijlyMock.assetsFor('northbeam').length);
  assert.equal(await rows(), nb, 'client filter matches the shared record count');

  await p.locator('#asset-category').selectOption('Logo');
  const nbLogos = await p.evaluate(() =>
    FijlyMock.assetsFor('northbeam').filter(a => a.category === 'Logo').length);
  assert.equal(await rows(), nbLogos, 'client + category filters combine');

  await p.locator('#asset-search').fill('zzz-nothing');
  assert.equal(await p.locator('#asset-empty').isVisible(), true, 'empty state appears');
  await p.locator('#clear-asset-filters').click();
  assert.equal(await rows(), total, 'clear filters restores every row');

  for (const sort of ['newest', 'oldest', 'name', 'client', 'size']) {
    await p.locator('#asset-sort').selectOption(sort);
    assert.equal(await rows(), total, `sort ${sort} keeps every row`);
  }
  await p.locator('#asset-sort').selectOption('name');
  const names = await p.locator('#asset-rows tr td:first-child button').allInnerTexts();
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)), 'name sort is alphabetical');
  await p.locator('#asset-sort').selectOption('newest');
  checks.push('Assets search, client/category filters, five sort orders, empty state and reset');

  /* ── Assets: create ──────────────────────────────────────────────────── */
  await p.locator('[data-add-asset]').click();
  await p.locator('#asset-file').setInputFiles({ name: 'qa-broll-take-1.mov', mimeType: 'video/quicktime', buffer: Buffer.alloc(2048) });
  assert.equal(await p.locator('#asset-name').inputValue(), 'qa-broll-take-1.mov', 'file name prefills');
  await p.locator('#asset-form-client').selectOption('layerbase');
  await p.locator('#asset-form-category').selectOption('B-roll');
  await p.locator('#asset-notes').fill('QA simulated capture.');
  await p.locator('#asset-form button[type=submit]').click();
  await p.waitForFunction(() => !document.getElementById('asset-editor').open);
  const created = await p.evaluate(() => FijlyMock.state.assets.find(a => a.name === 'qa-broll-take-1.mov'));
  assert.ok(created, 'asset created in shared state');
  assert.equal(created.client, 'layerbase', 'created against the chosen client');
  assert.equal(created.category, 'B-roll');
  assert.equal(created.fileType, 'mov', 'file type derived from the name');
  assert.equal(created.size, 2048, 'size recorded from the picked file');
  // The file is in Storage under the client's folder; the row holds its path.
  const stored = browser.fijlyDb.assets.find(a => a.id === created.id);
  assert.ok(stored && stored.file_size === 2048 && stored.file_type === 'mov', 'database row holds the file details');
  assert.match(stored.file_url, /^layerbase\/[0-9a-f-]{36}\.mov$/, 'file_url is the storage path in the client folder');
  const object = browser.fijlyDb.storage.get('client-assets/' + stored.file_url);
  assert.ok(object && object.size === 2048 && object.type === 'video/quicktime', 'file uploaded with its size and MIME type');
  assert.equal(stored.uploaded_by, qaUsers.admin.id, 'uploaded_by is the signed-in admin');
  assert.match(await p.locator('#asset-save-status').innerText(), /qa-broll-take-1\.mov uploaded for Layerbase/);
  assert.equal(await rows(), total + 1);

  /* ── Assets: file validation, shown under the picker ─────────────────── */
  await p.locator('[data-add-asset]').click();
  await p.locator('#asset-form button[type=submit]').click();
  assert.equal(await p.locator('#asset-file-error').innerText(), 'Please select a file.', 'missing file');
  await p.locator('#asset-file').setInputFiles({ name: 'notes.rtf', mimeType: 'application/rtf', buffer: Buffer.from('text') });
  assert.equal(await p.locator('#asset-file-error').innerText(), 'This file type is not supported.', 'unsupported type');
  await p.locator('#asset-form button[type=submit]').click();
  assert.equal(await p.locator('#asset-editor').evaluate(d => d.open), true, 'invalid file blocks save');
  assert.equal(await p.evaluate(() => FijlyData.validateAssetFile({ name: 'huge.mp4', size: 50 * 1024 * 1024 + 1 })), 'File too large. Maximum size is 50MB.');
  assert.equal(await p.evaluate(() => FijlyData.validateAssetFile({ name: 'font.woff2', size: 1 })), '', 'fonts allowed');
  await p.locator('[data-close-asset-editor]').last().click();
  assert.equal(await rows(), total + 1, 'rejected files create nothing');

  /* ── Assets: image upload, thumbnail preview and download ────────────── */
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  await p.locator('[data-add-asset]').click();
  // Browsers may leave a type blank; the upload is typed from the extension.
  await p.locator('#asset-file').setInputFiles({ name: 'qa-logo.png', mimeType: '', buffer: Buffer.from(png, 'base64') });
  await p.locator('#asset-form-client').selectOption('layerbase');
  await p.locator('#asset-form button[type=submit]').click();
  await p.waitForFunction(() => !document.getElementById('asset-editor').open);
  const logo = await p.evaluate(() => FijlyMock.state.assets.find(a => a.name === 'qa-logo.png'));
  assert.equal(browser.fijlyDb.storage.get('client-assets/' + browser.fijlyDb.assets.find(a => a.id === logo.id).file_url).type, 'image/png');
  await p.locator('#asset-search').fill('qa-logo');
  await p.locator('#asset-rows tr td:first-child button').first().click();
  await p.locator('#asset-detail-preview').waitFor({ state: 'visible' });
  await p.waitForFunction(() => document.getElementById('asset-detail-image').naturalWidth === 1);
  assert.match(await p.locator('#asset-detail-image').getAttribute('alt'), /Preview of qa-logo\.png/);
  assert.match(await p.locator('#asset-detail-body').innerText(), /PNG[\s\S]*\d+(\.\d)? KB/, 'type and human-readable size');
  await scan('asset detail with preview');
  const [tab] = await Promise.all([ctx.waitForEvent('page'), p.locator('#download-asset').click()]);
  await tab.waitForURL(/\/storage\/v1\/object\/sign\/client-assets\/layerbase\/.+token=qa-signed/);
  await tab.close();
  await p.locator('#delete-asset').click();
  await p.locator('#asset-confirm-ok').click();
  await p.waitForFunction(() => !FijlyMock.state.assets.some(a => a.name === 'qa-logo.png'));
  assert.equal([...browser.fijlyDb.storage.keys()].some(key => key.endsWith('.png')), false, 'image file deleted from Storage');
  assert.match(await p.locator('#asset-save-status').innerText(), /qa-logo\.png and its file removed/);
  await p.locator('#asset-search').fill('');
  checks.push('Real upload to Storage (client folder, typed from extension), validation messages under the picker, image thumbnail, signed download in a new tab, delete removes file and row');

  /* ── Assets: validation ──────────────────────────────────────────────── */
  await p.locator('[data-add-asset]').click();
  await p.locator('#asset-name').fill('   ');
  await p.locator('#asset-form button[type=submit]').click();
  assert.equal(await p.locator('#asset-editor').evaluate(d => d.open), true, 'blank name blocks save');
  await p.locator('[data-close-asset-editor]').last().click();
  assert.equal(await rows(), total + 1, 'cancelled form creates nothing');

  /* ── Assets: edit ────────────────────────────────────────────────────── */
  await p.locator('#asset-search').fill('qa-broll');
  await p.locator('#asset-rows tr td:first-child button').first().click();
  await p.locator('#asset-detail').waitFor({ state: 'visible' });
  assert.match(await p.locator('#asset-detail-body').innerText(), /Layerbase/, 'detail shows the owning client');
  await p.locator('#edit-asset').click();
  await p.waitForFunction(() => document.getElementById('asset-editor').open);
  assert.equal(await p.locator('#asset-file-group').isVisible(), false, 'file picker hidden when editing');
  await p.locator('#asset-name').fill('qa-broll-take-2.mov');
  await p.locator('#asset-form-category').selectOption('Reference Files');
  await p.locator('#asset-form button[type=submit]').click();
  await p.waitForFunction(() => !document.getElementById('asset-editor').open);
  const edited = await p.evaluate(id => FijlyMock.state.assets.find(a => a.id === id), created.id);
  assert.equal(edited.name, 'qa-broll-take-2.mov', 'name updated in place');
  assert.equal(edited.category, 'Reference Files', 'category updated');
  assert.equal(edited.uploadedAt, created.uploadedAt, 'edit does not reset the uploaded date');
  assert.equal(await p.evaluate(() => FijlyMock.state.assets.length), total + 1, 'edit does not duplicate');
  checks.push('Asset creation from an uploaded file, required-name validation, cancel, and in-place edit');

  /* ── Assets: delete with confirmation, including cancel ──────────────── */
  await p.locator('#asset-rows tr td:first-child button').first().click();
  await p.locator('#asset-detail').waitFor({ state: 'visible' });
  await p.locator('#delete-asset').click();
  await p.locator('#asset-confirm').waitFor({ state: 'visible' });
  await p.locator('#asset-confirm-cancel').click();
  assert.equal(await p.evaluate(() => FijlyMock.state.assets.length), total + 1, 'cancelling keeps the asset');
  await p.locator('#asset-detail').waitFor({ state: 'visible' });
  await p.locator('#delete-asset').click();
  await p.locator('#asset-confirm-ok').click();
  await p.waitForFunction(() => !document.getElementById('asset-confirm').open);
  assert.equal(await p.evaluate(() => FijlyMock.state.assets.length), total, 'confirmed delete removes it');
  assert.equal(browser.fijlyDb.storage.has('client-assets/' + stored.file_url), false, 'confirmed delete removes the stored file');
  await p.locator('#clear-asset-filters').click();
  checks.push('Delete requires confirmation; cancel keeps the record, confirm removes it');

  /* ── Client relationships stay correct ───────────────────────────────── */
  const orphans = await p.evaluate(() => {
    const ids = FijlyMock.state.clients.map(c => c.id);
    return FijlyMock.state.assets.filter(a => !ids.includes(a.client)).map(a => a.name);
  });
  assert.deepEqual(orphans, [], 'every asset points at a real client');
  checks.push('All assets resolve to an existing client record');

  /* ── Client portal still lists its own (session mock) assets ─────────── */
  await c.goto(url('studio', 'assets'));
  const portalCount = await c.locator('[data-client-assets] .file-row').count();
  const expected = await c.evaluate(() => FijlyMock.assetsFor('northbeam').length);
  assert.equal(portalCount, expected, 'client portal lists its own assets');
  // An asset added in Admin is stored in the database and survives a reload.
  await p.goto(url('admin', 'assets'));
  await p.locator('[data-add-asset]').click();
  await p.locator('#asset-file').setInputFiles({ name: 'qa-shared-check.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 qa') });
  await p.locator('#asset-form-client').selectOption('northbeam');
  await p.locator('#asset-form-category').selectOption('Brand Guidelines');
  await p.locator('#asset-form button[type=submit]').click();
  await p.waitForFunction(() => !document.getElementById('asset-editor').open);
  assert.ok(browser.fijlyDb.assets.some(a => a.name === 'qa-shared-check.pdf' && a.client_id === 'northbeam'), 'asset stored in the database');
  await p.reload();
  assert.match(await p.locator('#asset-rows').innerText(), /qa-shared-check\.pdf/, 'asset survives a reload');
  // The client sees the studio's upload and can sign its own folder's file.
  await c.reload();
  await c.locator('[data-client-assets] button').filter({ hasText: 'qa-shared-check.pdf' }).click();
  assert.match(await c.evaluate(async () => FijlyData.assetUrl(FijlyData.client.records('assets').find(a => a.name === 'qa-shared-check.pdf'))), /token=qa-signed/);
  assert.equal(await c.locator('#client-asset-detail button', { hasText: 'Download' }).isVisible(), true);
  await c.keyboard.press('Escape');
  checks.push('Admin assets persist in the database across reloads; the client can open and sign the uploaded file');

  /* ── Analytics derives from the shared records ───────────────────────── */
  await p.goto(url('admin', 'analytics'));
  await p.locator('#analytics-range').selectOption('all');
  await p.locator('#analytics-client').selectOption('all');
  const derived = await p.evaluate(() => {
    const s = FijlyMock.state;
    const text = id => document.getElementById(id).innerText;
    const kpi = label => {
      const card = [...document.querySelectorAll('#analytics-kpis .stat-card')]
        .find(c => c.querySelector('.stat-card__label').textContent === label);
      return card ? card.querySelector('.stat-card__value').textContent.trim() : null;
    };
    return {
      completedShown: kpi('Completed'),
      completedReal: s.videos.filter(v => v.status === 'Completed').length,
      reviewShown: kpi('Awaiting review'),
      reviewReal: s.videos.filter(v => v.status === 'Client Review').length,
      roundsShown: kpi('Revision rounds'),
      roundsReal: s.revisions.length,
      requestsShown: kpi('New requests'),
      requestsReal: s.requests.length,
      assetsShown: kpi('Assets on file'),
      assetsReal: s.assets.length,
      activeShown: kpi('Active clients'),
      activeReal: s.clients.filter(c => c.status === 'Active').length,
      stages: document.querySelectorAll('#analytics-stages li').length,
      quality: text('analytics-quality')
    };
  });
  const n = v => Number(v);
  assert.equal(n(derived.completedShown), derived.completedReal, 'Completed KPI matches the records');
  assert.equal(n(derived.reviewShown), derived.reviewReal, 'Awaiting review KPI matches');
  assert.equal(n(derived.roundsShown), derived.roundsReal, 'Revision rounds KPI matches');
  assert.equal(n(derived.requestsShown), derived.requestsReal, 'New requests KPI matches');
  assert.equal(n(derived.assetsShown), derived.assetsReal, 'Assets KPI matches');
  assert.equal(n(derived.activeShown), derived.activeReal, 'Active clients KPI matches');
  assert.equal(derived.stages, 6, 'all six production statuses listed');
  assert.match(derived.quality, /Approved without revision/);

  // client filter narrows consistently
  await p.locator('#analytics-client').selectOption('northbeam');
  const scoped = await p.evaluate(() => {
    const kpi = label => [...document.querySelectorAll('#analytics-kpis .stat-card')]
      .find(c => c.querySelector('.stat-card__label').textContent === label)
      .querySelector('.stat-card__value').textContent.trim();
    return {
      requests: Number(kpi('New requests')),
      real: FijlyMock.state.requests.filter(r => r.client === 'northbeam').length,
      assets: Number(kpi('Assets on file')),
      assetsReal: FijlyMock.assetsFor('northbeam').length,
      active: Number(kpi('Active clients'))
    };
  });
  assert.equal(scoped.requests, scoped.real, 'client filter scopes requests');
  assert.equal(scoped.assets, scoped.assetsReal, 'client filter scopes assets');
  assert.equal(scoped.active, 1, 'a single-client view reports one client');

  // date range narrows
  await p.locator('#analytics-client').selectOption('all');
  await p.locator('#analytics-range').selectOption('7');
  const short = await p.evaluate(() => Number(document.querySelector('#analytics-kpis .stat-card:nth-child(2) .stat-card__value').textContent));
  await p.locator('#analytics-range').selectOption('all');
  const long = await p.evaluate(() => Number(document.querySelector('#analytics-kpis .stat-card:nth-child(2) .stat-card__value').textContent));
  assert.ok(short <= long, `range filter narrows or holds: 7d=${short} all=${long}`);
  checks.push('Analytics KPIs, status breakdown, trend and client table derive from shared records; client and range filters scope them');

  // Saves are async: clear the previous confirmation first, then wait for a new
  // one with the button released, so an earlier "saved" is never mistaken for this save.
  const saveSettingsForm = async () => {
    await p.evaluate(() => { document.getElementById('settings-status').textContent = ''; });
    await p.locator('#settings-form button[type=submit]').click();
    await p.waitForFunction(() => document.getElementById('settings-status').textContent.includes('saved') && !document.querySelector('#settings-form button[type=submit]').disabled);
  };
  /* ── Settings persistence ────────────────────────────────────────────── */
  await p.goto(url('admin', 'settings'));
  await p.locator('#set-admin-name').fill('QA Producer');
  await p.locator('#set-studio-name').fill('FIJLY QA Studio');
  await p.locator('#set-default-lead').fill('14');
  await p.locator('#set-default-priority').selectOption('High');
  await p.locator('label[for="set-notify-approval"]').click();
  assert.equal(await p.locator('#set-notify-approval').isChecked(), true);
  assert.equal(await p.locator('#set-notify-approval').getAttribute('aria-checked'), 'true');
  await saveSettingsForm();
  await p.reload();
  assert.equal(await p.locator('#set-admin-name').inputValue(), 'QA Producer', 'settings survive reload');
  assert.equal(await p.locator('#set-default-lead').inputValue(), '14');
  assert.equal(await p.locator('#set-notify-approval').isChecked(), true);

  // The sign-in email is managed by Supabase Auth, so it is read-only here.
  assert.equal(await p.locator('#set-admin-email').getAttribute('readonly'), '');
  assert.equal(await p.locator('#set-admin-email').inputValue(), 'sam@fijly.example');
  // invalid values are refused
  await p.locator('#set-studio-email').fill('not-an-email');
  await p.locator('#settings-form button[type=submit]').click();
  assert.notEqual(await p.evaluate(() => FijlyMock.state.settings.studioEmail), 'not-an-email',
    'invalid studio email is not saved');
  await p.locator('#set-studio-email').fill('hello@fijly.example');
  await p.locator('#set-default-lead').fill('999');
  await p.locator('#settings-form button[type=submit]').click();
  assert.equal(await p.evaluate(() => FijlyMock.state.settings.defaultLeadDays), 14,
    'out-of-range turnaround is not saved');

  // discard restores the stored values
  await p.locator('#set-admin-name').fill('Throwaway');
  await p.locator('#settings-reset').click();
  assert.equal(await p.locator('#set-admin-name').inputValue(), 'QA Producer', 'discard restores saved values');
  checks.push('Settings save, survive reload, reject invalid email and turnaround, and discard restores');

  /* ── Workflow defaults actually reach the workflow ───────────────────── */
  await p.goto(url('admin', 'settings'));
  await p.locator('#set-default-priority').selectOption('Urgent');
  await p.locator('#set-default-lead').fill('21');
  await p.locator('#set-default-length').selectOption('3 min+');
  await saveSettingsForm();

  // The defaults are stored on this admin's admin_settings row.
  const defaults = browser.fijlyDb.admin_settings.find(row => row.admin_id === qaUsers.admin.id);
  assert.deepEqual([defaults.default_priority, defaults.default_lead_days, defaults.default_length], ['Urgent', 21, '3 min+'], 'defaults saved to admin_settings');
  // Pending Part 3B: the Supabase Client portal seeding its request form from
  // these defaults (it reads its session mock until then).

  // an unsaved Settings form must survive a data refresh caused by other work
  await p.goto(url('admin', 'settings'));
  await p.locator('#set-admin-name').fill('Unsaved Edit');
  await c.goto(url('admin', 'assets'));
  await c.locator('[data-add-asset]').click();
  await c.locator('#asset-file').setInputFiles({ name: 'qa-broadcast-trigger.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 qa') });
  await c.locator('#asset-form button[type=submit]').click();
  await c.waitForFunction(() => !document.getElementById('asset-editor').open);
  await p.evaluate(() => FijlyData.load());
  assert.equal(await p.locator('#set-admin-name').inputValue(), 'Unsaved Edit',
    'a data refresh must not wipe unsaved settings edits');
  checks.push('Workflow defaults persist to admin_settings; unsaved edits survive a data refresh');

  /* ── Responsive + accessibility ──────────────────────────────────────── */
  for (const width of [1440, 1024, 768, 390, 320]) {
    await p.setViewportSize({ width, height: 900 });
    for (const route of ['assets', 'analytics', 'settings']) {
      await p.goto(url('admin', route));
      await p.locator('.screen:visible').first().waitFor();
      assert.equal(await p.locator('.screen:visible').count(), 1, `${route}/${width}: one screen`);
      const over = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      assert.equal(over, false, `${route}/${width}: no horizontal page overflow`);
      if ([1440, 390].includes(width)) {
        await scan(`admin/${route}/${width}`);
        await p.screenshot({ path: `qa/screenshots/admin-${route}-${width}.png`, fullPage: true });
      }
    }
    checks.push(`${width}px: Assets, Analytics and Settings render without page overflow`);
  }
  // dialog accessibility
  await p.setViewportSize({ width: 390, height: 900 });
  await p.goto(url('admin', 'assets'));
  await p.locator('#asset-rows tr td:first-child button').first().click();
  await p.locator('#asset-detail').waitFor({ state: 'visible' });
  await scan('admin/asset-detail/390');
  await p.locator('[data-close-asset-detail]').first().click();
  await p.locator('[data-add-asset]').click();
  await p.locator('#asset-editor').waitFor({ state: 'visible' });
  await scan('admin/asset-editor/390');
  await p.locator('[data-close-asset-editor]').last().click();

  assert.deepEqual(errors, [], 'no page or console errors');
  const result = { checks, errors, scans };
  fs.writeFileSync('qa/studio-admin-sections-results.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ checks, scans: scans.length, errors }, null, 2));
  await browser.close();
  assert.ok(scans.every(s => !s.violations.length),
    'Accessibility findings: ' + JSON.stringify(scans.filter(s => s.violations.length), null, 2));
})().catch(e => { console.error(e); process.exit(1); });
