/* Opens the detail dialog for EVERY record in all three Admin lists and every
   client-portal project, watching for page/console errors. Data-dependent
   crashes (missing feedback, absent versions, unusual statuses) surface here
   rather than only on the handful of records the main script touches. */
const { chromium } = require('./runtime.cjs');
const fs = require('fs');

const url = (portal, route) => require('./runtime.cjs').base+`${portal}.html#${route}`;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  p.setDefaultTimeout(8000);
  const errors = [];
  p.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

  const opened = { requests: 0, videos: 0, revisions: 0, client: 0 };
  const emptyDetails = [];

  for (const kind of ['requests', 'videos', 'revisions']) {
    await p.goto(url('admin', kind));
    const rows = await p.locator(`#screen-${kind} tbody tr`).count();
    for (let i = 0; i < rows; i++) {
      const btn = p.locator(`#screen-${kind} tbody tr td:first-child button`).nth(i);
      const label = (await btn.innerText()).trim();
      await btn.click();
      const dlg = p.locator('#workflow-detail');
      await dlg.waitFor({ state: 'visible' });
      const text = await dlg.innerText();
      // a real detail always renders the fact grid labels
      if (!/Client/.test(text) || !/Deadline/.test(text) || text.length < 80) {
        emptyDetails.push(`${kind}[${i}] ${label}: ${text.slice(0, 90)}`);
      }
      opened[kind]++;
      await dlg.getByRole('button', { name: 'Close', exact: true }).click();
      await dlg.waitFor({ state: 'hidden' });
    }
  }

  // client portal: open each project row detail
  await p.goto(url('studio', 'projects'));
  const clientRows = await p.locator('.projects-table tbody tr td:first-child button').count();
  for (let i = 0; i < clientRows; i++) {
    await p.locator('.projects-table tbody tr td:first-child button').nth(i).click();
    const dlg = p.locator('#workflow-detail');
    await dlg.waitFor({ state: 'visible' });
    const text = await dlg.innerText();
    if (text.length < 80) emptyDetails.push(`client[${i}]: ${text.slice(0, 90)}`);
    opened.client++;
    await dlg.getByRole('button', { name: 'Close', exact: true }).click();
    await dlg.waitFor({ state: 'hidden' });
  }

  // every client-portal screen renders without error
  for (const route of ['overview', 'projects', 'requests', 'assets', 'scripts', 'analytics', 'settings']) {
    await p.goto(url('studio', route));
    await p.locator('.screen:visible').first().waitFor();
  }
  // every admin screen
  for (const route of ['dashboard', 'clients', 'requests', 'videos', 'revisions', 'assets', 'scripts', 'analytics', 'settings']) {
    await p.goto(url('admin', route));
    await p.locator('.screen:visible').first().waitFor();
  }

  const result = { opened, emptyDetails, errors };
  fs.writeFileSync('qa/studio-workflow-sweep-results.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
  process.exit(errors.length || emptyDetails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
