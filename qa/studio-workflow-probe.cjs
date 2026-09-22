/* Phase 2 gap probe. Exercises paths the main workflow script does not:
   every sort option on all three Admin lists, empty states on Videos and
   Revisions, the client portal filter chips, revision round preservation,
   invalid transitions, and mid-workflow reload. */
const { chromium } = require('./runtime.cjs');
const assert = require('assert/strict');
const fs = require('fs');

const url = (portal, route) => require('./runtime.cjs').base+`${portal}.html#${route}`;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  const c = await ctx.newPage();
  const errors = [];
  const pass = [];
  const fail = [];
  for (const page of [p, c]) {
    page.setDefaultTimeout(8000);
    page.on('pageerror', e => errors.push(`${page === p ? 'admin' : 'client'}: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  }
  const ok = (name, cond, extra) => cond ? pass.push(name) : fail.push(name + (extra ? ` -> ${extra}` : ''));

  /* 1 ── every sort option on every list, plus search and empty state ───── */
  for (const kind of ['requests', 'videos', 'revisions']) {
    await p.goto(url('admin', kind));
    const screen = `#screen-${kind}`;
    await p.locator(`${screen} [data-filter=status]`).selectOption('all');
    const base = await p.locator(`${screen} tbody tr`).count();
    ok(`${kind}: list renders rows`, base > 0, `rows=${base}`);

    for (const sort of ['newest', 'oldest', 'deadline', 'priority', 'title']) {
      await p.locator(`${screen} [data-filter=sort]`).selectOption(sort);
      const n = await p.locator(`${screen} tbody tr`).count();
      ok(`${kind}: sort "${sort}" keeps every row`, n === base, `${n} vs ${base}`);
    }
    // title sort actually orders
    await p.locator(`${screen} [data-filter=sort]`).selectOption('title');
    const titles = await p.locator(`${screen} tbody tr td:first-child button`).allInnerTexts();
    ok(`${kind}: title sort is alphabetical`,
      JSON.stringify(titles) === JSON.stringify([...titles].sort((a, b) => a.localeCompare(b))));

    // empty state + clear
    await p.locator(`${screen} [data-filter=search]`).fill('zzz-no-such-record');
    const emptyText = await p.locator(screen).innerText();
    ok(`${kind}: empty state shown`, /No matching/.test(emptyText));
    await p.locator(screen).getByRole('button', { name: 'Clear filters', exact: true }).click();
    const after = await p.locator(`${screen} tbody tr`).count();
    ok(`${kind}: clear filters restores rows`, after === base, `${after} vs ${base}`);

    // status filter uses the right vocabulary for this list
    const opts = await p.locator(`${screen} [data-filter=status] option`).allInnerTexts();
    const expected = kind === 'requests' ? 'Submitted' : kind === 'videos' ? 'In Production' : 'Revision Requested';
    ok(`${kind}: status filter offers ${expected}`, opts.includes(expected), opts.join('|'));
  }

  /* 2 ── client portal filter chips ─────────────────────────────────────── */
  await c.goto(url('studio', 'projects'));
  const chips = c.locator('.filter-chip[data-filter]');
  const chipCount = await chips.count();
  ok('client: filter chips present', chipCount > 0, `chips=${chipCount}`);
  for (let i = 0; i < chipCount; i++) {
    await chips.nth(i).click();
    const rows = await c.locator('.projects-table tbody tr').count();
    const label = await chips.nth(i).innerText();
    ok(`client: chip "${label.trim()}" renders a table body`, rows > 0, `rows=${rows}`);
  }
  await chips.first().click();

  /* 3 ── three revision rounds, driven through the service, stay intact ──── */
  await p.goto(url('admin', 'videos'));
  const multi = await p.evaluate(() => {
    // Build V1 -> R1 -> V2 -> R2 -> V3 -> R3 -> V4 on a fresh video, using the
    // same service calls the UI buttons make.
    const req = FijlyMock.state.requests.find(r => r.status === 'Submitted');
    const video = FijlyMock.produce(req.id);
    const step = note => {
      FijlyMock.addVersion(video.id, '', note);
      FijlyMock.setVideoStatus(video.id, 'Draft Ready');
      FijlyMock.setVideoStatus(video.id, 'Client Review');
    };
    step('v1');
    for (let round = 1; round <= 3; round++) {
      FijlyMock.requestRevision(video.id, `Round ${round} feedback text.`, 'Alex Rivera');
      const open = FijlyMock.activeRevision(video);
      FijlyMock.setRevisionStatus(open.id, 'In Revision');
      step(`revised v${round + 1}`);
    }
    const v = FijlyMock.get('videos', video.id);
    return {
      id: v.id,
      versions: v.versions.map(x => x.number),
      feedback: v.feedback.length,
      rounds: FijlyMock.rounds(v).map(r => ({ round: r.round, status: r.status, base: r.baseVersion, sub: r.submittedVersion })),
      versionRevisionLinks: v.versions.map(x => x.revisionId ? 'linked' : 'base')
    };
  });
  ok('three revision rounds recorded', multi.rounds.length === 3, JSON.stringify(multi.rounds.map(r => r.round)));
  ok('versions are append-only V1..V4', JSON.stringify(multi.versions) === '[1,2,3,4]', JSON.stringify(multi.versions));
  ok('one feedback entry per round', multi.feedback === 3, String(multi.feedback));
  ok('rounds keep ascending numbers', JSON.stringify(multi.rounds.map(r => r.round)) === '[1,2,3]');
  ok('each round records the version it was raised against',
    JSON.stringify(multi.rounds.map(r => r.base)) === '[1,2,3]', JSON.stringify(multi.rounds.map(r => r.base)));
  ok('earlier rounds are not left open',
    multi.rounds.slice(0, -1).every(r => r.status === 'Resolved'), JSON.stringify(multi.rounds.map(r => r.status)));
  ok('V1 is a base draft, later versions link to their revision',
    multi.versionRevisionLinks[0] === 'base' && multi.versionRevisionLinks.slice(1).every(x => x === 'linked'),
    JSON.stringify(multi.versionRevisionLinks));

  // the UI must list all three rounds in the video detail
  await p.reload();
  await p.locator('#screen-videos [data-filter=search]').fill(await p.evaluate(id => FijlyMock.requestFor(FijlyMock.get('videos', id)).title, multi.id));
  await p.locator('#screen-videos tbody tr td:first-child button').first().click();
  const detailText = await p.locator('#workflow-detail').innerText();
  ok('detail shows all three rounds', /Round 1/.test(detailText) && /Round 2/.test(detailText) && /Round 3/.test(detailText));
  ok('detail shows every version V1..V4',
    ['V1', 'V2', 'V3', 'V4'].every(v => detailText.includes(v)));
  ok('detail retains all three feedback entries',
    (detailText.match(/Round \d feedback text\./g) || []).length === 3,
    JSON.stringify(detailText.match(/Round \d feedback text\./g)));
  await p.locator('#workflow-detail').getByRole('button', { name: 'Close', exact: true }).click();

  /* 4 ── invalid transitions are refused by the service ──────────────────── */
  const guard = await p.evaluate(() => {
    const out = {};
    const fresh = FijlyMock.state.videos.find(v => v.status === 'In Production' && !v.versions.length);
    out.draftWithoutVersion = fresh ? FijlyMock.videoTransitions(fresh).length === 0 : 'no-candidate';
    const done = FijlyMock.state.videos.find(v => v.status === 'Completed');
    out.completedIsTerminal = done ? FijlyMock.videoTransitions(done).length === 0 : 'no-candidate';
    try { FijlyMock.setVideoStatus(done ? done.id : fresh.id, 'Client Review'); out.threw = false; }
    catch (e) { out.threw = true; out.message = e.message; }
    return out;
  });
  ok('cannot mark Draft Ready before a version exists', guard.draftWithoutVersion === true, String(guard.draftWithoutVersion));
  ok('Completed is terminal', guard.completedIsTerminal === true, String(guard.completedIsTerminal));
  ok('illegal transition throws a readable error', guard.threw === true && /not available|Finish/.test(guard.message || ''), guard.message);

  /* 5 ── reload mid-workflow keeps state ────────────────────────────────── */
  const before = await p.evaluate(() => ({ v: FijlyMock.state.videos.length, r: FijlyMock.state.revisions.length, q: FijlyMock.state.requests.length }));
  await p.reload();
  const afterReload = await p.evaluate(() => ({ v: FijlyMock.state.videos.length, r: FijlyMock.state.revisions.length, q: FijlyMock.state.requests.length }));
  ok('reload preserves videos/revisions/requests', JSON.stringify(before) === JSON.stringify(afterReload),
    `${JSON.stringify(before)} vs ${JSON.stringify(afterReload)}`);

  /* 6 ── client portal survives a video list that renders no rows ───────── */
  const portalGuard = await c.evaluate(() => {
    const n = FijlyMock.state.videos.filter(v => FijlyMock.requestFor(v).client === 'northbeam').length;
    return n;
  });
  ok('client portal has northbeam videos (renderClient indexes videos[0])', portalGuard > 0, `count=${portalGuard}`);

  /* 7 ── no horizontal overflow on the three Admin lists at tested widths ── */
  for (const width of [1440, 1024, 768, 390, 320]) {
    await p.setViewportSize({ width, height: 900 });
    for (const route of ['requests', 'videos', 'revisions']) {
      await p.goto(url('admin', route));
      const over = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      ok(`${route} @${width}px: no page overflow`, over === false);
    }
  }

  const result = { pass: pass.length, fail: fail.length, failures: fail, errors };
  fs.writeFileSync('qa/studio-workflow-probe-results.json', JSON.stringify(result, null, 2));
  console.log(`\n${pass.length} passed, ${fail.length} failed`);
  if (fail.length) console.log('FAILURES:\n  ' + fail.join('\n  '));
  if (errors.length) console.log('PAGE ERRORS:\n  ' + errors.join('\n  '));
  await browser.close();
  process.exit(fail.length || errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
