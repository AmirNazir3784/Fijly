/* Presentation QA: responsive layout, accessibility and metric parity. */
const { chromium, base, widths } = require('./runtime.cjs');
const assert = require('assert/strict');
const fs = require('fs');
const { execFileSync } = require('child_process');

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const results = { widths: [], filterComparisons: 0, errors };
  const context = await browser.newContext({ reducedMotion: 'reduce', timezoneId: 'UTC' });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.setFixedTime(new Date('2026-09-22T12:00:00Z'));
  await page.goto(base + 'admin.html#analytics');
  const stateBefore = await page.evaluate(() => JSON.stringify(FijlyMock.state));

  // Render the original version in an isolated context against identical data/time.
  const original = execFileSync('git', ['show', 'HEAD:site/js/admin-sections.js'], { encoding: 'utf8' });
  const baselineContext = await browser.newContext({ timezoneId: 'UTC' });
  const baseline = await baselineContext.newPage();
  await baseline.route('**/js/admin-sections.js', route => route.fulfill({ contentType: 'application/javascript', body: original }));
  await baseline.clock.setFixedTime(new Date('2026-09-22T12:00:00Z'));
  await baseline.goto(base + 'admin.html#analytics');
  async function metrics(p) {
    return p.evaluate(() => ({
      kpis: [...document.querySelectorAll('#analytics-kpis .stat-card__value')].map(el => el.textContent),
      stages: [...document.querySelectorAll('#analytics-stages strong')].map(el => el.textContent),
      proportions: [...document.querySelectorAll('#analytics-stages .progress-bar__fill')].map(el => el.style.width),
      rows: [...document.querySelectorAll('#analytics-clients tr')].map(el => el.textContent),
      quality: [...document.querySelectorAll('#analytics-quality strong')].map(el => el.textContent.replace(' of ', ' / ')),
      bars: [...document.querySelectorAll('#analytics-trend .admin-trend__bar')].map(el => [el.title, el.style.height]),
      dates: [...document.querySelectorAll('#analytics-trend .admin-trend__label')].map(el => el.textContent),
      scope: document.querySelector('#analytics-scope').textContent
    }));
  }
  const clients = await page.locator('#analytics-client option').evaluateAll(options => options.map(option => option.value));
  for (const client of clients) {
    for (const range of ['7', '30', '90', 'all']) {
      for (const p of [page, baseline]) {
        await p.locator('#analytics-client').selectOption(client);
        await p.locator('#analytics-range').selectOption(range);
      }
      assert.deepEqual(await metrics(page), await metrics(baseline), `metric parity: ${client}/${range}`);
      results.filterComparisons++;
    }
  }
  assert.equal(await page.evaluate(() => JSON.stringify(FijlyMock.state)), stateBefore, 'filters/presentation leave shared state unchanged');
  await baselineContext.close();
  await page.locator('#analytics-client').selectOption('all');
  await page.locator('#analytics-range').selectOption('30');
  fs.mkdirSync('qa/screenshots', { recursive: true });

  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.reload();
    await page.evaluate(() => document.fonts.ready);
    await page.addScriptTag({ path: 'qa/axe.min.js' });
    const violations = await page.evaluate(async () => (await axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] }
    })).violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })));
    assert.deepEqual(violations, [], `axe: ${width}`);
    const layout = await page.evaluate(() => {
      const screen = document.querySelector('#screen-analytics');
      const summary = document.querySelector('#analytics-trend-description');
      const css = getComputedStyle(summary);
      const numberClips = [...screen.querySelectorAll('.stat-card__value, .admin-client-overview strong, .admin-pipeline-label strong')]
        .filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.textContent);
      return {
        pageOverflow: document.documentElement.scrollWidth > innerWidth,
        chartOverflow: document.querySelector('#analytics-trend').scrollWidth > document.querySelector('#analytics-trend').clientWidth,
        numberClips,
        summaryHidden: css.position === 'absolute' && css.clip !== 'auto' && css.width === '1px',
        summaryAvailable: !summary.hidden && !summary.closest('[aria-hidden="true"]') && css.display !== 'none' && css.visibility !== 'hidden',
        titleSize: getComputedStyle(document.querySelector('#h-analytics-stages')).fontSize,
        kpiSize: getComputedStyle(document.querySelector('#analytics-kpis .stat-card__value')).fontSize,
        h1Count: screen.querySelectorAll('h1').length,
        headings: [...screen.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(el => el.tagName),
        tableScroll: screen.querySelector('.table-scroll').scrollWidth > screen.querySelector('.table-scroll').clientWidth
      };
    });
    assert.equal(layout.pageOverflow, false, `${width}: no page overflow`);
    assert.equal(layout.chartOverflow, false, `${width}: no chart overflow`);
    assert.deepEqual(layout.numberClips, [], `${width}: numbers fit`);
    assert.ok(layout.summaryHidden && layout.summaryAvailable, `${width}: accessible visually hidden summary`);
    assert.equal(layout.titleSize, '20px');
    assert.equal(layout.kpiSize, '40px');
    assert.equal(layout.h1Count, 1);
    assert.ok(layout.headings.every(tag => ['H1', 'H2'].includes(tag)));
    assert.match(await page.locator('#analytics-trend').ariaSnapshot(), /completed, .* revision round/);
    await page.locator('#analytics-client').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'analytics-range');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.className), 'table-scroll');
    if (layout.tableScroll) {
      await page.keyboard.press('ArrowRight');
      await page.waitForFunction(() => document.querySelector('#screen-analytics .table-scroll').scrollLeft > 0);
      await page.locator('#screen-analytics .table-scroll').evaluate(el => { el.scrollLeft = 0; });
    }
    await page.locator('#analytics-client').focus();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `qa/screenshots/admin-analytics-refined-${width}.png`, fullPage: true });
    results.widths.push({ width, violations, ...layout, keyboard: 'passed' });
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync('qa/admin-analytics-visual-results.json', JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify(results, null, 2));
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
