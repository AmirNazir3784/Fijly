/* Milestone workflow, part A.

   The path this suite proves, end to end against the Supabase emulator:

     order.html wizard (4 steps, uploads, a breakdown read from public.pricing)
       -> submit_project()  : prices the project server-side, opens it as
                              Awaiting Payment and writes three payment rows
       -> client portal      : stage badge, payments card, deposit banner
       -> Admin Payments     : Mark paid -> admin_set_payment_status()
       -> the project's stage becomes Project Submitted

   It also covers the Admin pricing grid, the included-revision settings, and
   that the browser never decides the price that is saved. */
const { chromium, base, qaUsers, serveSite } = require('./runtime.cjs');
const assert = require('assert/strict'), fs = require('fs');
const emulator = require('./supabase-emulator.cjs');
fs.mkdirSync('qa/screenshots', { recursive: true });

(async () => {
  // Serve site/ so this suite runs on its own as well as under run-all, which
  // already has a server on this port (serveSite then leaves it alone).
  const stopServer = await serveSite();
  const browser = await chromium.launch();
  try {
    await runSuite(browser);
  } finally {
    await browser.close().catch(() => {});
    await stopServer();
  }
})();

async function runSuite(browser) {
  const errors = [], checks = [], scans = [];
  const watch = (page, label) => {
    page.setDefaultTimeout(15000);
    page.on('pageerror', e => errors.push(label + ' pageerror: ' + e.message));
    // Expected: the 500 the failed-submit test forces on purpose.
    page.on('console', m => { if (m.type() === 'error' && !(label === 'down' && /status of 500/.test(m.text()))) errors.push(label + ' console: ' + m.text()); });
    return page;
  };
  const scan = async (page, label) => {
    await page.addScriptTag({ path: 'qa/axe.min.js' });
    const violations = await page.evaluate(async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] } })).violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })));
    scans.push({ label, violations });
    assert.deepEqual(violations, [], label);
  };
  const overflow = page => page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  const db = browser.fijlyDb;
  const file = (name, mimeType, body) => ({ name, mimeType, buffer: Buffer.from(body || 'qa') });
  // The radios sit visually hidden inside their cards, so a visitor clicks the
  // card, not the input.
  const pick = (page, name, value) => page.locator(`label:has(input[name="${name}"][value="${value}"])`).click();

  /* ======================================================================
     The price list is public, and the wizard only displays it
     ====================================================================== */
  {
    const url = new URL('https://x.supabase.co/rest/v1/pricing?select=*');
    const anonymous = emulator.handle(db, null, 'GET', url, {}, null);
    assert.equal(anonymous.status, 200, 'anyone may read the price list');
    assert.equal(anonymous.body.length, 12, 'three items across four lengths');
    // A client may read it but never change it.
    const patched = emulator.handle(db, qaUsers.client, 'PATCH', new URL('https://x.supabase.co/rest/v1/pricing?item=eq.base'), { prefer: 'return=representation' }, { amount: 1 });
    assert.equal(patched.status, 403, 'clients cannot change the price list');
    assert.equal(db.pricing.find(r => r.item === 'base' && r.duration_seconds === 90).amount, '700.00');
    checks.push('public.pricing: readable by anyone (12 rows), writable only by an admin');
  }

  /* ======================================================================
     The wizard: a new client, four steps, uploads, submit_project
     ====================================================================== */
  // `unlinked` is a client account with no workspace yet, so the wizard has to
  // create one through ensure_client_workspace.
  const wizardCtx = await browser.newContext({ fijlyAuth: 'unlinked' });
  const w = watch(await wizardCtx.newPage(), 'wizard');
  await w.setViewportSize({ width: 1280, height: 900 });
  await w.goto(base + 'order.html?duration=90');
  await w.locator('#order-card[data-state="ready"]').waitFor();
  assert.equal(await w.locator('#order-account-email').innerText(), qaUsers.unlinked.email);
  assert.equal(await w.locator('#order-company').inputValue(), '', 'a new client has no workspace to pre-fill from');

  /* Step 1: project basics, then ensure_client_workspace ------------------ */
  await w.locator('[data-next="2"]').click();
  assert.equal(await w.locator('#order-title-error').innerText(), 'Enter a name for this project.');
  assert.equal(await w.locator('#order-type-error').innerText(), 'Choose a video type.');
  assert.equal(await w.evaluate(() => document.activeElement.id), 'order-title', 'the first problem is focused');
  await w.locator('#order-title').fill('Milestone QA / Homepage video');
  await w.locator('#order-company').fill('Milestone QA Ltd');
  await w.locator('#order-website').fill('milestoneqa.example');
  await w.locator('[data-next="2"]').click();
  assert.equal(await w.locator('#order-website-error').innerText(), 'Enter the website as a full address, starting with https://');
  await w.locator('#order-website').fill('https://milestoneqa.example');
  // Only the six accepted video_type values are offered.
  assert.deepEqual(await w.locator('#order-type option').allInnerTexts(),
    ['Choose a video type', 'Product Launch', 'Homepage Video', 'Product Demo', 'Product Promo', 'SaaS Explainer', 'Tutorial / Onboarding']);
  await w.locator('#order-type').selectOption('Homepage Video');
  await w.locator('#order-delivery').fill('2026-12-15');
  await scan(w, 'wizard step 1');
  const clientsBefore = db.clients.length;
  await w.locator('[data-next="2"]').click();
  await w.waitForFunction(() => location.hash === '#step-2' && !document.querySelector('[data-step="2"]').hidden);
  assert.equal(db.clients.length, clientsBefore + 1, 'ensure_client_workspace created the workspace');
  const workspace = db.clients[db.clients.length - 1];
  assert.deepEqual([workspace.name, workspace.status, workspace.website, workspace.contact_email],
    ['Milestone QA Ltd', 'Onboarding', 'https://milestoneqa.example', qaUsers.unlinked.email]);
  assert.equal(db.profiles.find(p => p.id === qaUsers.unlinked.id).client_id, workspace.id, 'the profile is linked to it');
  checks.push('Step 1 validates every field, rejects a bare domain as a website, offers exactly the six accepted video types, and calls ensure_client_workspace on Continue');

  /* Step 2 "Look & feel": the creative direction and the brand files ------ */
  assert.equal(await w.locator('#step-2-title').innerText(), 'Look & feel');
  // The brief moved to step 3, so nothing about it is on this step.
  assert.equal(await w.locator('[data-step="2"] #order-brief-link, [data-step="2"] #order-brief').count(), 0);
  // Reference links sit directly under the video style.
  assert.deepEqual(await w.locator('[data-step="2"] .order__fields > div .order__label').allInnerTexts(),
    ['Video purpose *', 'Target audience', 'Video style', 'Reference links', 'Brand colors', 'Logo, product screenshots and recordings']);
  await w.locator('[data-next="3"]').click();
  assert.equal(await w.locator('#order-purpose-error').innerText(), 'Tell us what this video should achieve.');
  await w.locator('#order-purpose').fill('Explain the product on the homepage and lift trial sign-ups.');
  await w.locator('#order-audience').fill('Operations leads evaluating us for the first time.');
  await w.locator('#order-style').fill('Clean motion graphics over product screens.');
  await w.locator('#order-colors').fill('#5B4BF5, #0C0E13');
  await w.locator('#order-references').fill('example.com/not-a-link');
  await w.locator('[data-next="3"]').click();
  assert.equal(await w.locator('#order-references-error').innerText(), 'Enter complete http(s) links, one per line.');
  await w.locator('#order-references').fill('https://example.com/reference\nhttps://example.com/second');
  await w.locator('#order-attachments').setInputFiles([file('logo.png', 'image/png'), file('dashboard.png', 'image/png')]);
  // Each pick is listed with a way to take it back out.
  assert.deepEqual(await w.locator('#order-attachments-files .order__file-name').allInnerTexts(), ['logo.png', 'dashboard.png']);
  const storedBefore = db.storage.size;
  await w.locator('[data-next="3"]').click();
  await w.waitForFunction(() => location.hash === '#step-3' && !document.querySelector('[data-step="3"]').hidden);
  assert.equal(db.storage.size, storedBefore + 2, 'both project files were uploaded');
  const uploaded = [...db.storage.keys()].slice(-2);
  uploaded.forEach(key => assert.match(key, new RegExp('^client-assets/' + workspace.id + '/project-files/'), 'uploads land in project-files'));
  checks.push('Step 2 "Look & feel" holds purpose, audience, style, reference links, brand colors and the uploads in that order, validates the purpose and the links, lists each picked file, and uploads to {client_id}/project-files/');

  /* Step 3: a project needs a brief document or the client's own script --- */
  assert.equal(await w.locator('#step-3-title').innerText(), 'Brief, script & voice over');
  // Neither given: Continue is refused with one message that names both ways out.
  await w.locator('[data-next="4"]').click();
  assert.equal(await w.locator('#order-brief-doc-error').innerText(), 'Add a brief or write your script so we know what the video should say.');
  assert.equal(await w.evaluate(() => location.hash), '#step-3', 'neither a brief nor a script blocks the step');
  // A malformed brief link is its own problem, not a missing brief.
  await w.locator('#order-brief-link').fill('docs.google.com/document/d/abc');
  await w.locator('[data-next="4"]').click();
  assert.equal(await w.locator('#order-brief-doc-error').innerText(), 'Enter the brief link as a full address, starting with https://');
  // A brief alone is enough.
  await w.locator('#order-brief-link').fill('https://docs.google.com/document/d/qa-brief');
  await w.locator('[data-next="4"]').click();
  await w.waitForFunction(() => !document.querySelector('[data-step="4"]').hidden);
  await w.locator('[data-back="3"]').click();
  await w.waitForFunction(() => !document.querySelector('[data-step="3"]').hidden);
  // A script alone is enough too: clear the brief and supply the script.
  await w.locator('#order-brief-link').fill('');
  await w.locator('[data-next="4"]').click();
  assert.equal(await w.locator('#order-brief-doc-error').innerText(), 'Add a brief or write your script so we know what the video should say.');
  await pick(w, 'scriptChoice', 'own');
  await w.locator('#order-script-file').setInputFiles(file('script-only.txt', 'text/plain'));
  await w.locator('[data-next="4"]').click();
  await w.waitForFunction(() => !document.querySelector('[data-step="4"]').hidden);
  assert.equal(await w.locator('#summary-brief-doc').innerText(), 'Your script stands in for the brief');
  await w.locator('[data-back="3"]').click();
  await w.waitForFunction(() => !document.querySelector('[data-step="3"]').hidden);
  // Back to the brief for the rest of the run.
  await pick(w, 'scriptChoice', 'need');
  await w.locator('#order-brief-link').fill('https://docs.google.com/document/d/qa-brief');
  await w.locator('#order-brief').fill('Open on the problem, show the dashboard, close on a clear call to action.');
  checks.push('Step 3 requires a brief document or the client\'s own script: neither is refused with "Add a brief or write your script…", a bad link reports separately, and either one on its own lets the step pass');

  /* Step 3: the live breakdown beside the script and voice over ----------- */
  // The defaults are "we write it" / "we record it", so the add-ons show as
  // Included while the price list has them at zero.
  assert.equal(await w.locator('#order-script-upload').isVisible(), false);
  assert.equal(await w.locator('#line-base').innerText(), '$700');
  assert.equal(await w.locator('#line-script').innerText(), 'Included');
  assert.equal(await w.locator('#line-voice').innerText(), 'Included');
  assert.equal(await w.locator('#line-total').innerText(), '$700');
  // A chargeable add-on shows its amount instead of "Included".
  await w.evaluate(async () => {
    const result = await supabaseClient.from('pricing').select('amount').eq('item', 'script').eq('duration_seconds', 90);
    return result.error ? null : result.data;
  });
  db.pricing.find(r => r.item === 'script' && r.duration_seconds === 90).amount = '150.00';
  await w.reload();
  await w.locator('#order-card[data-state="ready"]').waitFor();
  // A reload starts the wizard again (nothing is kept in storage), so re-enter
  // the answers and come back to the price step.
  const refill = async () => {
    await w.locator('#order-title').fill('Milestone QA / Homepage video');
    await w.locator('#order-company').fill('Milestone QA Ltd');
    await w.locator('#order-website').fill('https://milestoneqa.example');
    await w.locator('#order-type').selectOption('Homepage Video');
    await pick(w, 'duration', '90');
    await w.locator('#order-delivery').fill('2026-12-15');
    await w.locator('[data-next="2"]').click();
    await w.waitForFunction(() => !document.querySelector('[data-step="2"]').hidden);
    await w.locator('#order-purpose').fill('Explain the product on the homepage and lift trial sign-ups.');
    await w.locator('#order-audience').fill('Operations leads evaluating us for the first time.');
    await w.locator('#order-style').fill('Clean motion graphics over product screens.');
    await w.locator('#order-colors').fill('#5B4BF5, #0C0E13');
    await w.locator('#order-references').fill('https://example.com/reference\nhttps://example.com/second');
    await w.locator('#order-attachments').setInputFiles([file('logo.png', 'image/png')]);
    await w.locator('[data-next="3"]').click();
    await w.waitForFunction(() => !document.querySelector('[data-step="3"]').hidden);
    // The brief and the notes live on step 3 now.
    await w.locator('#order-brief-link').fill('https://docs.google.com/document/d/qa-brief');
    await w.locator('#order-brief').fill('Open on the problem, show the dashboard, close on a clear call to action.');
  };
  await refill();
  assert.equal(await w.locator('#line-script').innerText(), '$150', 'a non-zero add-on shows its price');
  assert.equal(await w.locator('#line-total').innerText(), '$850');
  // Bringing your own script drops that charge and asks for the file.
  await pick(w, 'scriptChoice', 'own');
  assert.equal(await w.locator('#order-script-upload').isVisible(), true);
  assert.equal(await w.locator('#line-script').innerText(), 'Provided by you');
  assert.equal(await w.locator('#line-total').innerText(), '$700');
  await w.locator('[data-next="4"]').click();
  assert.equal(await w.locator('#order-script-file-error').innerText(), 'Upload your script file.');
  await w.locator('#order-script-file').setInputFiles(file('wrong.png', 'image/png'));
  await w.locator('[data-next="4"]').click();
  assert.equal(await w.locator('#order-script-file-error').innerText(), 'Scripts must be a PDF, DOC, DOCX or TXT file under 50MB.');
  await w.locator('#order-script-file').setInputFiles(file('script.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'));
  await pick(w, 'voiceChoice', 'own');
  await w.locator('#order-voice-file').setInputFiles(file('voice.mp3', 'audio/mpeg'));
  assert.equal(await w.locator('#line-voice').innerText(), 'Provided by you');
  await scan(w, 'wizard step 3');
  await w.locator('[data-next="4"]').click();
  await w.waitForFunction(() => location.hash === '#step-4' && !document.querySelector('[data-step="4"]').hidden);
  const supplied = [...db.storage.keys()].slice(-2);
  assert.equal(supplied.filter(key => /\.docx$|\.mp3$/.test(key)).length, 2, 'the script and the voice over were uploaded');
  checks.push('Step 3 offers two independent radio pairs, shows a breakdown read from public.pricing (Included at $0, "Provided by you" when supplied), demands the matching upload and refuses the wrong file type');

  /* Step 4: review, the schedule, and submit_project ---------------------- */
  assert.equal(await w.locator('#summary-title').innerText(), 'Milestone QA / Homepage video');
  assert.equal(await w.locator('#summary-item').innerText(), 'Homepage Video · 90 seconds');
  assert.equal(await w.locator('#summary-brief-doc').innerText(), 'https://docs.google.com/document/d/qa-brief');
  assert.equal(await w.locator('#summary-script').innerText(), 'Provided by you · script.docx');
  assert.equal(await w.locator('#summary-voice').innerText(), 'Provided by you · voice.mp3');
  assert.equal(await w.locator('#summary-delivery').innerText(), '2026-12-15');
  assert.equal(await w.locator('#review-total').innerText(), '$700');
  assert.deepEqual(await w.locator('#order-schedule li').allInnerTexts(),
    ['Project start · 15%\n$105', 'Storyboard approval · 45%\n$315', 'Final delivery · 40%\n$280']);
  await scan(w, 'wizard review');
  // Back keeps every answer.
  await w.locator('[data-back="3"]').click();
  await w.waitForFunction(() => !document.querySelector('[data-step="3"]').hidden);
  await w.locator('[data-next="4"]').click();
  await w.waitForFunction(() => !document.querySelector('[data-step="4"]').hidden);
  assert.equal(await w.locator('#summary-brief').innerText(), '“Open on the problem, show the dashboard, close on a clear call to action.”');

  const requestsBefore = db.requests.length, paymentsBefore = db.payments.length;
  // A double click must create one project, not two.
  await w.locator('#order-submit').dblclick();
  await w.locator('#order-payment').waitFor({ state: 'visible' });
  assert.equal(db.requests.length, requestsBefore + 1, 'one project per submission');
  assert.equal(db.payments.length, paymentsBefore + 3, 'three milestone payments');
  const project = db.requests[db.requests.length - 1];
  assert.deepEqual([project.client_id, project.video_type, project.duration_seconds, project.stage, project.status],
    [workspace.id, 'Homepage Video', 90, 'Awaiting Payment', 'Submitted']);
  assert.deepEqual([project.base_price, project.script_price, project.voice_over_price, project.total_price],
    ['700.00', '0.00', '0.00', '700.00'], 'the database priced the project, and supplied add-ons cost nothing');
  assert.deepEqual([project.purpose !== null, project.target_audience !== null, project.video_style !== null, project.brand_colors],
    [true, true, true, '#5B4BF5, #0C0E13']);
  assert.deepEqual(project.reference_urls, ['https://example.com/reference', 'https://example.com/second']);
  assert.equal(project.brief_link, 'https://docs.google.com/document/d/qa-brief', 'the brief link is saved');
  assert.equal(project.brief_file_path, null, 'a linked brief stores no file');
  assert.deepEqual(project.attachment_names, ['logo.png']);
  assert.equal(project.has_script, true); assert.equal(project.has_voice_over, true);
  assert.match(project.script_file_path, new RegExp('^' + workspace.id + '/project-files/.*\\.docx$'));
  assert.match(project.voice_over_file_path, new RegExp('^' + workspace.id + '/project-files/.*\\.mp3$'));
  const schedule = db.payments.filter(p => p.request_id === project.id);
  assert.deepEqual(schedule.map(p => [p.milestone, p.percent, p.amount, p.status]),
    [['start', 15, '105.00', 'due'], ['storyboard', 45, '315.00', 'due'], ['final', 40, '280.00', 'due']]);
  checks.push('Submit calls submit_project once (a double click creates one project), which prices it server-side, saves every project field, opens it as Awaiting Payment and writes the 15/45/40 payment rows');

  /* The payment step ------------------------------------------------------ */
  assert.equal(await w.locator('#order-payment-title').innerText(), 'Your project is saved');
  assert.match(await w.locator('#order-payment-text').innerText(),
    /Pay the 15% project-start deposit \(\$105\) to begin\. We’ll email a PayPal invoice to newclient@example\.com within one business day\. Your project starts as soon as payment is confirmed\./);
  assert.equal(await w.locator('#paid-start').innerText(), '$105');
  assert.equal(await w.locator('#paid-storyboard').innerText(), '$315');
  assert.equal(await w.locator('#paid-final').innerText(), '$280');
  assert.equal(await w.locator('#order-paypal').isDisabled(), true, 'Pay with PayPal stays disabled');
  assert.equal(await w.locator('#order-paypal-note').innerText(), 'Online payment coming soon.');
  assert.equal(await w.locator('#order-payment a[href="studio.html"]').count(), 1, 'Go to FIJLY Studio');
  assert.equal(await w.locator('#order-form').isVisible(), false, 'the wizard is closed once saved');
  await scan(w, 'wizard payment step');
  for (const width of [375, 768, 1280]) {
    await w.setViewportSize({ width, height: 900 });
    assert.equal(await overflow(w), false, width + ': payment step overflow');
    await w.screenshot({ path: `qa/screenshots/milestones-payment-${width}.png`, fullPage: true });
  }
  await w.setViewportSize({ width: 1280, height: 900 });
  checks.push('The payment step names the 15% deposit and the email it goes to, lists the saved schedule, keeps PayPal disabled, links to the Studio, and fits 375/768/1280');

  /* The honeypot saves nothing ------------------------------------------- */
  {
    const bot = watch(await wizardCtx.newPage(), 'bot');
    await bot.goto(base + 'order.html?duration=30');
    await bot.locator('#order-card[data-state="ready"]').waitFor();
    await bot.locator('#order-title').fill('Spam project');
    await bot.locator('#order-company').fill('Milestone QA Ltd');
    await bot.locator('#order-type').selectOption('SaaS Explainer');
    await bot.locator('#order-hp').evaluate(e => { e.value = 'https://spam.example'; });
    await bot.locator('[data-next="2"]').click();
    await bot.waitForFunction(() => !document.querySelector('[data-step="2"]').hidden);
    await bot.locator('#order-purpose').fill('Spam purpose for the honeypot test.');
    await bot.locator('#order-audience').fill('Nobody at all.');
    await bot.locator('[data-next="3"]').click();
    await bot.waitForFunction(() => !document.querySelector('[data-step="3"]').hidden);
    await bot.locator('#order-brief-link').fill('https://spam.example/brief');
    await bot.locator('#order-brief').fill('Automated spam brief with enough characters to pass.');
    await bot.locator('[data-next="4"]').click();
    await bot.waitForFunction(() => !document.querySelector('[data-step="4"]').hidden);
    const count = db.requests.length;
    await bot.locator('#order-submit').click();
    await bot.locator('#order-payment').waitFor({ state: 'visible' });
    assert.equal(db.requests.length, count, 'a honeypot submission saves nothing');
    assert.equal(db.requests.some(r => r.title === 'Spam project'), false);
    await bot.close();
    checks.push('A filled honeypot shows the payment step without saving a project');
  }

  /* A failed save keeps the answers and can be retried -------------------- */
  {
    const down = watch(await wizardCtx.newPage(), 'down');
    await down.route('**/rest/v1/rpc/submit_project', r => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 'XX000', message: 'QA failure' }) }));
    await down.goto(base + 'order.html?duration=60');
    await down.locator('#order-card[data-state="ready"]').waitFor();
    await down.locator('#order-title').fill('Retry project');
    await down.locator('#order-type').selectOption('Product Demo');
    await down.locator('[data-next="2"]').click();
    await down.waitForFunction(() => !document.querySelector('[data-step="2"]').hidden);
    await down.locator('#order-purpose').fill('Check that a failed save is recoverable.');
    await down.locator('#order-audience').fill('The QA suite.');
    await down.locator('[data-next="3"]').click();
    await down.waitForFunction(() => !document.querySelector('[data-step="3"]').hidden);
    await down.locator('#order-brief-link').fill('https://example.com/retry-brief');
    await down.locator('#order-brief').fill('A brief long enough to pass validation on this step.');
    await down.locator('[data-next="4"]').click();
    await down.waitForFunction(() => !document.querySelector('[data-step="4"]').hidden);
    await down.locator('#order-submit').click();
    await down.locator('#order-error').waitFor({ state: 'visible' });
    assert.match(decodeURIComponent(await down.locator('#order-error a').getAttribute('href')), /^mailto:hello@fijly\.com/);
    assert.equal(await down.locator('#order-submit').isDisabled(), false, 'a failed submit can be retried');
    await down.locator('[data-back="3"]').click();
    await down.waitForFunction(() => !document.querySelector('[data-step="3"]').hidden);
    assert.equal(await down.locator('#order-brief').inputValue(), 'A brief long enough to pass validation on this step.', 'the answers are kept');
    assert.equal(await down.locator('#order-brief-link').inputValue(), 'https://example.com/retry-brief');
    await down.close();
    checks.push('A failed submit_project shows an inline error with an email fallback, keeps every answer and allows a retry');
  }
  await w.close();

  /* ======================================================================
     The client portal: stage, payments card, deposit banner
     ====================================================================== */
  const clientCtx = await browser.newContext({ fijlyAuth: 'unlinked' });
  const c = watch(await clientCtx.newPage(), 'portal');
  await c.goto(base + 'studio.html#overview');
  await c.locator('#screen-overview').waitFor();
  assert.match(await c.locator('#client-payment-banners').innerText(),
    /Payment due: Project start — \$105 for Milestone QA \/ Homepage video\.\s*We’ll send a PayPal invoice\./);
  await scan(c, 'portal overview with a payment due');
  await c.goto(base + 'studio.html#projects');
  await c.locator('#screen-projects').waitFor();
  assert.match(await c.locator('.projects-table tbody').innerText(), /Milestone QA \/ Homepage video[\s\S]*Awaiting Payment/);
  await c.getByRole('button', { name: 'Milestone QA / Homepage video', exact: true }).click();
  const detail = c.locator('#workflow-detail');
  assert.match(await detail.innerText(), /Awaiting Payment/, 'the stage is the headline status');
  assert.match(await detail.locator('.price-lines').innerText(), /Base video[\s\S]*\$700[\s\S]*Script writing[\s\S]*Provided by you[\s\S]*Total[\s\S]*\$700/);
  assert.match(await detail.locator('.payment-rows').innerText(), /Project start · 15%[\s\S]*\$105[\s\S]*Due/);
  assert.match(await detail.locator('.payment-rows').innerText(), /Storyboard approval · 45%[\s\S]*\$315/);
  assert.match(await detail.locator('.payment-rows').innerText(), /Final delivery · 40%[\s\S]*\$280/);
  assert.equal(await detail.locator('.payment-row--required').count(), 1, 'only the milestone the stage owes is marked due now');
  assert.match(await detail.innerText(), /We will email your PayPal invoice/);
  // The files the client supplied are theirs to download again.
  assert.equal(await detail.getByRole('button', { name: 'Download your script' }).count(), 1);
  assert.equal(await detail.getByRole('button', { name: 'Download your voice over' }).count(), 1);
  await scan(c, 'portal project detail');
  await c.locator('#workflow-detail .dialog-dismiss').click();
  // The retired form is gone from the requests screen.
  await c.goto(base + 'studio.html#requests');
  await c.locator('#screen-requests').waitFor();
  assert.equal(await c.locator('[data-request-form]').count(), 0);
  assert.equal(await c.locator('.request-start a[href="order.html"]').count(), 1);
  assert.match(await c.locator('[data-request-list]').innerText(), /Milestone QA \/ Homepage video[\s\S]*Awaiting Payment/);
  await scan(c, 'portal requests screen');
  checks.push('Client portal: the stage is the main badge in the projects list and detail, the payments card shows all three milestones with the due one marked, the price breakdown is the saved one, the overview banners the deposit, and the requests screen links to the wizard instead of a form');

  /* ======================================================================
     Admin Payments: mark paid -> the stage advances
     ====================================================================== */
  const adminCtx = await browser.newContext({ fijlyAuth: 'admin' });
  const a = watch(await adminCtx.newPage(), 'admin');
  await a.goto(base + 'admin.html#payments');
  await a.locator('#screen-payments').waitFor();
  const links = await a.locator('.sidebar-nav a[data-screen]').evaluateAll(all => all.map(x => x.dataset.screen));
  assert.deepEqual(links.slice(0, 4), ['dashboard', 'orders', 'payments', 'clients'], 'Payments sits after Orders');
  assert.deepEqual(await a.locator('.admin-payments-table th').allInnerTexts(),
    ['CLIENT', 'PROJECT', 'MILESTONE', '%', 'AMOUNT', 'STATUS', 'PAID', 'ACTIONS']);
  // "Due" is the default filter, and the sidebar badge counts what is payable now.
  assert.equal(await a.locator('#payment-status-filter').inputValue(), 'due');
  const dueNow = () => db.payments.filter(p => {
    const request = db.requests.find(r => r.id === p.request_id);
    const owed = request && { 'Awaiting Payment': 'start', 'Storyboard Approved': 'storyboard', 'Video Approved': 'final' }[request.stage];
    return p.status === 'due' && owed === p.milestone;
  }).length;
  await a.waitForFunction(() => document.querySelector('.sidebar-link[data-screen="payments"] [data-payment-badge]'));
  assert.equal(await a.locator('.sidebar-link[data-screen="payments"] [data-payment-badge]').innerText(), String(dueNow()),
    'the badge counts payments that are due and required by the stage');
  assert.match(await a.locator('#payment-rows').innerText(), /Milestone QA Ltd[\s\S]*Milestone QA \/ Homepage video[\s\S]*Project start[\s\S]*15%[\s\S]*\$105[\s\S]*Due/);
  await scan(a, 'admin payments');

  // Filters.
  await a.locator('#payment-status-filter').selectOption('paid');
  assert.equal(await a.locator('#payment-rows tr').count(), 0, 'nothing is paid yet');
  assert.equal(await a.locator('#payment-empty').isVisible(), true);
  await a.locator('#payment-status-filter').selectOption('all');
  assert.equal(await a.locator('#payment-rows tr').count(), db.payments.length, 'All statuses shows every milestone');
  await a.locator('#payment-client-filter').selectOption({ label: 'Milestone QA Ltd' });
  assert.equal(await a.locator('#payment-rows tr').count(), 3, 'one project, three milestones');
  checks.push('Admin Payments: Payments sits after Orders, Due is the default filter, the sidebar badge counts what the stage makes payable, and the status and client filters narrow the table');

  /* Mark paid, with the method and the invoice reference ------------------ */
  await a.getByRole('button', { name: /^Mark paid: Project start/ }).click();
  await a.locator('#payment-detail').waitFor({ state: 'visible' });
  assert.equal(await a.locator('#payment-detail-title').innerText(), 'Mark paid');
  assert.equal(await a.locator('#payment-method').inputValue(), 'PayPal', 'PayPal is the default method');
  assert.match(await a.locator('#payment-detail-body').innerText(), /Milestone QA Ltd[\s\S]*Project start · 15%[\s\S]*\$105/);
  await scan(a, 'mark paid dialog');
  await a.locator('#payment-reference').fill('INV-QA-0001');
  await a.locator('#payment-confirm').click();
  await a.waitForFunction(() => !document.querySelector('#payment-detail').open);
  // admin_set_payment_status recorded the payment and advanced the stage.
  const start = db.payments.find(p => p.request_id === project.id && p.milestone === 'start');
  assert.deepEqual([start.status, start.method, start.reference], ['paid', 'PayPal', 'INV-QA-0001']);
  assert.ok(start.paid_at, 'the paid date is stamped');
  assert.equal(start.marked_by, qaUsers.admin.id);
  assert.equal(db.requests.find(r => r.id === project.id).stage, 'Project Submitted',
    'paying the deposit moves the project from Awaiting Payment to Project Submitted');
  assert.match(await a.locator('#payment-save-status').innerText(), /Project start payment for Milestone QA \/ Homepage video marked paid\./);
  assert.match(await a.locator('#payment-rows').innerText(), /Project start[\s\S]*Paid/);
  // The later milestones are not payable yet, so the badge dropped by one.
  assert.equal(await a.locator('.sidebar-link[data-screen="payments"] [data-payment-badge]').innerText(), String(dueNow()));
  checks.push('Mark paid asks for the method (PayPal by default) and the invoice reference, saves them through admin_set_payment_status with a paid date, and the project stage changes from Awaiting Payment to Project Submitted');

  /* Waived, refunded and reset to due ------------------------------------ */
  const storyboardPayment = db.payments.find(p => p.request_id === project.id && p.milestone === 'storyboard');
  await a.getByRole('button', { name: /^Mark waived: Storyboard approval/ }).click();
  await a.locator('#payment-detail').waitFor({ state: 'visible' });
  assert.equal(await a.locator('#payment-method-group').isVisible(), false, 'a waived milestone records no method');
  await a.locator('#payment-confirm').click();
  await a.waitForFunction(() => !document.querySelector('#payment-detail').open);
  assert.equal(db.payments.find(p => p.id === storyboardPayment.id).status, 'waived');
  // Waiving a milestone the stage does not owe leaves the stage alone.
  assert.equal(db.requests.find(r => r.id === project.id).stage, 'Project Submitted');
  await a.getByRole('button', { name: /^Mark refunded: Project start/ }).click();
  await a.locator('#payment-detail').waitFor({ state: 'visible' });
  await a.locator('#payment-confirm').click();
  await a.waitForFunction(() => !document.querySelector('#payment-detail').open);
  const refunded = db.payments.find(p => p.id === start.id);
  assert.deepEqual([refunded.status, refunded.paid_at], ['refunded', null], 'a refund clears the paid date');
  assert.equal(db.requests.find(r => r.id === project.id).stage, 'Project Submitted', 'the stage is not rolled back');
  await a.getByRole('button', { name: /^Reset to due: Project start/ }).click();
  await a.locator('#payment-detail').waitFor({ state: 'visible' });
  await a.locator('#payment-confirm').click();
  await a.waitForFunction(() => !document.querySelector('#payment-detail').open);
  assert.equal(db.payments.find(p => p.id === start.id).status, 'due');
  checks.push('Mark waived (no method asked), Mark refunded (paid date cleared) and Reset to due all go through admin_set_payment_status, and none of them rolls the stage back');

  /* Only an admin may change a payment ----------------------------------- */
  {
    const asClient = emulator.handleRpc(db, qaUsers.client, 'admin_set_payment_status', { p_payment_id: start.id, p_status: 'paid' });
    assert.match(asClient.body.message, /Admins only/);
    const anonymous = emulator.handleRpc(db, null, 'admin_set_payment_status', { p_payment_id: start.id, p_status: 'paid' });
    assert.match(anonymous.body.message, /Admins only/);
    const unknown = emulator.handleRpc(db, qaUsers.admin, 'admin_set_payment_status', { p_payment_id: start.id, p_status: 'settled' });
    assert.match(unknown.body.message, /Unknown payment status/);
    // A client reads its own payments and nobody else's, and can never write one.
    const theirs = emulator.handle(db, qaUsers.client, 'GET', new URL('https://x.supabase.co/rest/v1/payments?select=*'), {}, null);
    assert.ok(theirs.body.every(row => row.client_id === 'northbeam'), 'clients read only their own payments');
    const written = emulator.handle(db, qaUsers.client, 'PATCH', new URL('https://x.supabase.co/rest/v1/payments?id=eq.' + start.id), { prefer: 'return=representation' }, { status: 'paid' });
    assert.deepEqual(written.body, [], 'clients cannot change a payment directly');
    assert.equal(db.payments.find(p => p.id === start.id).status, 'due');
    checks.push('admin_set_payment_status refuses clients, anonymous callers and unknown statuses; clients read only their own payments and can never write one');
  }

  /* Awaiting deposit is kept out of the action queue ---------------------- */
  // Put the project back to Awaiting Payment and confirm where it is listed.
  db.requests.find(r => r.id === project.id).stage = 'Awaiting Payment';
  await a.goto(base + 'admin.html#dashboard');
  await a.locator('#screen-dashboard').waitFor();
  // Only the hash changed, so pull the stage edit in the way another tab would.
  await a.evaluate(() => FijlyData.load());
  await a.waitForFunction(() => FijlyData.awaitingDeposit().length > 0);
  assert.equal(await a.locator('#admin-awaiting-deposit').isVisible(), true);
  assert.match(await a.locator('#admin-awaiting-list').innerText(), /Milestone QA \/ Homepage video[\s\S]*\$105 deposit due/);
  assert.doesNotMatch(await a.locator('#admin-action-queue').innerText(), /Milestone QA \/ Homepage video/,
    'a project without its deposit is not in the action queue');
  assert.match(await a.locator('#admin-stats').innerText(), /Payments due/);
  await scan(a, 'admin dashboard with a deposit outstanding');
  // The requests queue's "Needs review" filter leaves it out too.
  await a.goto(base + 'admin.html#requests');
  await a.locator('#screen-requests').waitFor();
  assert.equal(await a.locator('[data-workflow-list="requests"] [data-filter="status"]').inputValue(), 'action');
  assert.doesNotMatch(await a.locator('[data-workflow-list="requests"] .workflow-results').innerText(), /Milestone QA \/ Homepage video/);
  await a.locator('[data-workflow-list="requests"] [data-filter="status"]').selectOption('all');
  assert.match(await a.locator('[data-workflow-list="requests"] .workflow-results').innerText(), /Milestone QA \/ Homepage video[\s\S]*Awaiting Payment/);
  checks.push('An Awaiting Payment project is listed under "Awaiting deposit" with its deposit amount, and is excluded from the dashboard action queue and the requests "Needs review" filter');

  /* Admin project detail: the new fields, the files and the stage control - */
  await a.getByRole('button', { name: 'Milestone QA / Homepage video', exact: true }).click();
  await a.locator('#workflow-detail').waitFor({ state: 'visible' });
  const adminDetail = a.locator('#workflow-detail');
  assert.match(await adminDetail.innerText(), /Awaiting Payment/);
  assert.match(await adminDetail.innerText(), /https:\/\/milestoneqa\.example/);
  assert.match(await adminDetail.innerText(), /90 seconds/);
  assert.match(await adminDetail.locator('.price-lines').innerText(), /Base video[\s\S]*\$700/);
  assert.match(await adminDetail.locator('.payment-rows').innerText(), /Project start · 15%[\s\S]*\$105/);
  assert.match(await adminDetail.innerText(), /Explain the product on the homepage/);
  assert.match(await adminDetail.innerText(), /Operations leads evaluating us/);
  assert.match(await adminDetail.innerText(), /#5B4BF5, #0C0E13/);
  assert.equal(await adminDetail.getByRole('button', { name: 'Download client script' }).count(), 1);
  assert.equal(await adminDetail.getByRole('button', { name: 'Download client voice over' }).count(), 1);
  // No stage control, and no review, while the deposit is outstanding.
  assert.equal(await adminDetail.getByRole('button', { name: 'Change stage' }).count(), 0);
  assert.equal(await adminDetail.getByRole('button', { name: 'Start review' }).count(), 0);
  assert.match(await adminDetail.innerText(), /waiting for its 15% project-start payment/);
  await scan(a, 'admin project detail awaiting deposit');

  // A signed URL hands the uploaded script back.
  const scriptUrl = await a.evaluate(path => FijlyData.projectFileUrl(path), project.script_file_path);
  assert.match(scriptUrl, /\/object\/sign\/client-assets\//, 'the script is served through a signed URL');

  // With the deposit paid, the admin can move the project through the
  // non-payment stages by hand.
  db.requests.find(r => r.id === project.id).stage = 'Project Submitted';
  await a.evaluate(() => FijlyData.load());
  await a.waitForFunction(() => /Project Submitted/.test(document.querySelector('#workflow-detail').innerText));
  await adminDetail.getByRole('button', { name: 'Change stage' }).click();
  await a.locator('#workflow-editor').waitFor({ state: 'visible' });
  const offered = await a.locator('#wf-stage option').allInnerTexts();
  assert.deepEqual(offered, ['Project Submitted', 'Requirements Under Review', 'Information Requested', 'Storyboard In Progress',
    'Storyboard Ready', 'Video Ready for Preview', 'Video Approved', 'Cancelled'],
    'only the stages no payment or storyboard review drives are offered');
  ['Awaiting Payment', 'Storyboard Approved', 'Video In Production', 'Completed'].forEach(stage =>
    assert.equal(offered.includes(stage), false, stage + ' is set by the database, not by hand'));
  await a.locator('#wf-stage').selectOption('Requirements Under Review');
  await a.locator('#workflow-editor button[type="submit"]').click();
  await a.waitForFunction(() => !document.querySelector('#workflow-editor').open);
  assert.equal(db.requests.find(r => r.id === project.id).stage, 'Requirements Under Review');
  await a.waitForFunction(() => /Requirements Under Review/.test(document.querySelector('#workflow-detail').innerText));
  // The step after that is available too.
  await adminDetail.getByRole('button', { name: 'Change stage' }).click();
  await a.locator('#workflow-editor').waitFor({ state: 'visible' });
  await a.locator('#wf-stage').selectOption('Information Requested');
  await a.locator('#workflow-editor button[type="submit"]').click();
  await a.waitForFunction(() => !document.querySelector('#workflow-editor').open);
  assert.equal(db.requests.find(r => r.id === project.id).stage, 'Information Requested');
  // A payment-driven stage is refused even if it is asked for directly.
  const refusedStage = await a.evaluate(async id => {
    try { await FijlyData.setProjectStage(id, 'Storyboard Approved'); return ''; } catch (error) { return error.message; }
  }, project.id);
  assert.match(refusedStage, /set by a payment or a storyboard review/);
  await a.locator('#workflow-detail .dialog-dismiss').click();
  checks.push('Admin project detail shows the stage, the saved price breakdown, the payments card, every wizard field and signed-URL downloads for the supplied script and voice over; the stage dropdown offers only the non-payment steps and refuses the rest');

  /* ======================================================================
     Admin Settings: the price grid and the included revisions
     ====================================================================== */
  await a.goto(base + 'admin.html#settings');
  await a.locator('#screen-settings').waitFor();
  assert.deepEqual(await a.locator('.admin-pricing-table th[scope="row"]').allInnerTexts(), ['Base video', 'Script writing', 'Voice over']);
  assert.deepEqual(await a.locator('.admin-pricing-table thead th').allInnerTexts(), ['ITEM', '30 SEC', '60 SEC', '90 SEC', '120 SEC']);
  assert.equal(await a.locator('#pricing-rows [data-price-item]').count(), 12, 'a 3 x 4 grid');
  assert.deepEqual(await a.locator('[data-price-item="base"]').evaluateAll(all => all.map(x => x.value)), ['300', '500', '700', '950']);
  assert.equal(await a.locator('#price-script-90').inputValue(), '150');
  await scan(a, 'admin pricing grid');
  // Validation: nothing negative, nothing empty.
  await a.locator('#price-base-30').fill('-5');
  await a.locator('#pricing-form button[type="submit"]').click();
  assert.match(await a.locator('#pricing-status').innerText(), /zero or more/);
  assert.equal(db.pricing.find(r => r.item === 'base' && r.duration_seconds === 30).amount, '300.00', 'nothing was saved');
  await a.locator('#price-base-30').fill('');
  await a.locator('#pricing-form button[type="submit"]').click();
  assert.match(await a.locator('#pricing-status').innerText(), /must be a number/);
  // Discard puts the saved figures back.
  await a.locator('#pricing-reset').click();
  assert.equal(await a.locator('#price-base-30').inputValue(), '300');
  assert.match(await a.locator('#pricing-status').innerText(), /discarded/);
  // A real change is written to public.pricing.
  await a.locator('#price-base-30').fill('350');
  await a.locator('#price-voice_over-60').fill('120');
  await a.locator('#pricing-form button[type="submit"]').click();
  await a.waitForFunction(() => /Price list saved/.test(document.querySelector('#pricing-status').textContent));
  assert.equal(db.pricing.find(r => r.item === 'base' && r.duration_seconds === 30).amount, 350);
  assert.equal(db.pricing.find(r => r.item === 'voice_over' && r.duration_seconds === 60).amount, 120);
  // The price already saved on a submitted project does not move with the list.
  assert.equal(db.requests.find(r => r.id === project.id).total_price, '700.00', 'a submitted project keeps the price it was given');
  checks.push('Admin pricing: a 3 x 4 grid over public.pricing with the live figures, negative and empty values refused with nothing written, Discard restoring the saved list, and a save that only touches the changed cells');

  // Included revisions.
  assert.equal(await a.locator('#set-storyboard-revisions').inputValue(), '2');
  assert.equal(await a.locator('#set-video-revisions').inputValue(), '2');
  await a.locator('#set-storyboard-revisions').fill('3');
  await a.locator('#set-video-revisions').fill('1');
  await a.locator('#settings-form button[type="submit"]').click();
  await a.waitForFunction(() => /Settings saved/.test(document.querySelector('#settings-status').textContent));
  const settings = db.admin_settings.find(row => row.admin_id === qaUsers.admin.id);
  assert.deepEqual([settings.storyboard_revisions_included, settings.video_revisions_included], [3, 1]);
  const badLimit = await a.evaluate(async () => {
    try { await FijlyData.saveSettings({ storyboardRevisions: -1 }); return ''; } catch (error) { return error.message; }
  });
  assert.match(badLimit, /whole number between 0 and 20/);
  checks.push('Admin settings save storyboard_revisions_included and video_revisions_included, and refuse a value outside 0-20');

  /* ======================================================================
     Every width, and the emulator's own guards
     ====================================================================== */
  for (const width of [375, 768, 1280]) {
    for (const screen of ['payments', 'settings']) {
      await a.setViewportSize({ width, height: 900 });
      await a.goto(base + 'admin.html#' + screen);
      await a.locator('#screen-' + screen).waitFor();
      assert.equal(await overflow(a), false, screen + ' at ' + width + ': overflow');
      await a.screenshot({ path: `qa/screenshots/milestones-${screen}-${width}.png`, fullPage: true });
    }
  }
  checks.push('Admin Payments and Settings fit 375/768/1280 without horizontal overflow');

  {
    // ensure_client_workspace is for client accounts only, and is idempotent.
    const asAdmin = emulator.handleRpc(db, qaUsers.admin, 'ensure_client_workspace', { p_company: 'Studio Ltd' });
    assert.match(asAdmin.body.message, /Only client accounts can start projects/);
    const anonymous = emulator.handleRpc(db, null, 'ensure_client_workspace', { p_company: 'Nobody Ltd' });
    assert.match(anonymous.body.message, /Please sign in first/);
    const again = emulator.handleRpc(db, qaUsers.unlinked, 'ensure_client_workspace', { p_company: 'Another name' });
    assert.equal(again.body, workspace.id, 'an existing workspace is returned unchanged');
    assert.equal(db.clients.filter(row => row.name === 'Another name').length, 0);
    // submit_project needs a workspace first.
    const brief = { p_brief_link: 'https://example.com/brief' };
    const noWorkspace = emulator.handleRpc(db, qaUsers.noprofile, 'submit_project', { p_title: 'x', p_video_type: 'Product Demo', p_duration: 60, ...brief });
    assert.match(noWorkspace.body.message, /sign in|workspace/i);
    // A project with no brief document and no script is refused server-side too.
    const noBrief = emulator.handleRpc(db, qaUsers.unlinked, 'submit_project', { p_title: 'x', p_video_type: 'Product Demo', p_duration: 60 });
    assert.match(noBrief.body.message, /Add a link to your brief document or upload it as a PDF/);
    const badLink = emulator.handleRpc(db, qaUsers.unlinked, 'submit_project', { p_title: 'x', p_video_type: 'Product Demo', p_duration: 60, p_brief_link: 'example.com/brief' });
    assert.match(badLink.body.message, /must start with http/);
    // A brief file has to sit in this client's own folder.
    const strayBrief = emulator.handleRpc(db, qaUsers.unlinked, 'submit_project', { p_title: 'x', p_video_type: 'Product Demo', p_duration: 60, p_brief_file_path: 'someone-else/project-files/brief.pdf' });
    assert.match(strayBrief.body.message, /Invalid brief file/);
    // A length the price list does not cover is refused rather than guessed.
    const unpriced = emulator.handleRpc(db, qaUsers.unlinked, 'submit_project', { p_title: 'x', p_video_type: 'Product Demo', p_duration: 45, ...brief });
    assert.match(unpriced.body.message, /Unknown video length/);
    checks.push('ensure_client_workspace is client-only and idempotent; submit_project needs a workspace, a brief document (http(s) link or a file under the client folder) and a priced length');
  }

  fs.writeFileSync('qa/milestones-results.json', JSON.stringify({ checks, scans, errors }, null, 2));
  assert.deepEqual(errors, [], 'page errors');
  console.log(JSON.stringify({ checks, errors }, null, 2));
}
