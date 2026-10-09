/* Per-video pricing, sign-up on the landing page (#contact), the order page's
   signed-in shell and the Admin Orders screen (the retired orders table, kept
   for the orders already placed). The four-step project wizard, the price list
   and the milestone payments are covered by qa/milestones.cjs. Runs against
   the Supabase emulator: sign-up answers "disabled" as on the live project
   unless a test stubs it, orders and account requests are inserted as anyone,
   and only admins read or update orders. */
const { chromium, base, qaUsers, qaSession, SUPABASE, serveSite } = require('./runtime.cjs');
const assert = require('assert/strict'), fs = require('fs');
fs.mkdirSync('qa/screenshots', { recursive: true });

// Serve site/ so this suite runs on its own as well as under run-all, which
// already has a server on this port (serveSite then leaves it alone).
let stopServer = () => {};
let launched = null;
(async () => {
  stopServer = await serveSite();
  const browser = launched = await chromium.launch();
  const errors = [], checks = [], scans = [];
  const watch = (page, label) => {
    page.setDefaultTimeout(10000);
    page.on('pageerror', e => errors.push(label + ' pageerror: ' + e.message));
    // Expected: 422 from disabled sign-up, and the 500 the failure test forces.
    page.on('console', m => { if (m.type() === 'error' && !/status of 422/.test(m.text()) && !(label === 'down' && /status of 500/.test(m.text()))) errors.push(label + ' console: ' + m.text()); });
    return page;
  };
  const scan = async (page, label) => {
    await page.addScriptTag({ path: 'qa/axe.min.js' });
    const violations = await page.evaluate(async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] } })).violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })));
    scans.push({ label, violations });
    assert.deepEqual(violations, [], label);
  };
  const overflow = page => page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  const guest = await browser.newContext({ fijlyAuth: null });
  const p = watch(await guest.newPage(), 'landing');
  // The sign-up request the page sent, for checks on what it carries.
  const fillSignup = async (page, name, email, password) => {
    await page.locator('#signup-name').fill(name); await page.locator('#signup-email').fill(email); await page.locator('#signup-password').fill(password);
  };

  /* Landing page: pricing and every "start" action lead to sign-up ------- */
  await p.setViewportSize({ width: 1280, height: 900 });
  await p.goto(base + 'index.html');
  assert.equal(await p.locator('#pricing h2').innerText(), 'One video, one price. No subscriptions.');
  assert.deepEqual(await p.locator('#pricing .price-card__amount').allInnerTexts(), ['$300', '$500', '$700', '$950']);
  assert.deepEqual(await p.locator('#pricing .price-card a').evaluateAll(a => a.map(x => [x.getAttribute('href'), x.dataset.duration])), [['#contact', '30'], ['#contact', '60'], ['#contact', '90'], ['#contact', '120']]);
  for (const selector of ['.nav__actions .btn', '#mobile-menu .btn', '.hero__actions .btn-primary']) assert.equal(await p.locator(selector).getAttribute('href'), '#contact', selector);
  assert.equal(await p.locator('.hero__actions a[href="#work"]').count(), 1, 'View Our Work still points at #work');
  assert.equal(await p.locator('a[href^="order.html"]').count(), 0, 'nothing links straight to the order page');
  const columns = async () => p.locator('#pricing .price-card').evaluateAll(cards => new Set(cards.map(c => Math.round(c.getBoundingClientRect().left))).size);
  for (const [width, expected] of [[1280, 4], [768, 2], [375, 1]]) {
    await p.setViewportSize({ width, height: 900 });
    assert.equal(await columns(), expected, width + ': pricing columns');
    assert.equal(await overflow(p), false, width + ': landing page overflow');
    await p.locator('#contact').screenshot({ path: `qa/screenshots/signup-${width}.png` });
  }
  await p.setViewportSize({ width: 1280, height: 900 });
  await p.locator('.hero__actions .btn-primary').click();
  await p.waitForFunction(() => location.hash === '#contact');
  assert.ok(await p.locator('#signup-form').isVisible(), 'Start Your Video scrolls to the sign-up form');
  checks.push('Landing: Start Your Video (nav, menu, hero) and every pricing card lead to the sign-up form, cards keep their length, no direct order links; 4/2/1 pricing columns, no overflow at 1280/768/375');

  /* Sign-up form ------------------------------------------------------------ */
  assert.equal(await p.locator('#form-title').innerText(), 'Create your account');
  assert.equal(await p.locator('#contact-title').innerText(), 'Turn your ideas into stunning videos.');
  assert.equal(await p.locator('.contact__intro .eyebrow').innerText(), 'GET STARTED');
  assert.equal(await p.locator('#google-signin').isDisabled(), true, 'Google is off until the provider is configured');
  assert.equal(await p.locator('#google-signin-note').innerText(), 'Google sign-in will be available soon. Please use email for now.');
  assert.deepEqual(await p.locator('#signup-form input:not([tabindex="-1"])').evaluateAll(i => i.map(x => x.name)), ['name', 'email', 'password']);
  // The card ends at its button; support email appears once (in the purple panel) and legal links live in the footer.
  assert.equal(await p.locator('#signup-submit ~ :is(p, a):visible').count(), 0, 'nothing below the sign-up button');
  assert.equal(await p.locator('#contact a[href="mailto:hello@fijly.com"], .footer a[href="mailto:hello@fijly.com"]:not(:text("Contact"))').count(), 1, 'the support email is shown once');
  assert.deepEqual(await p.locator('.footer__bottom a').allInnerTexts(), ['Privacy', 'Terms']);
  await scan(p, 'sign-up form');
  await p.locator('#signup-submit').click();
  assert.equal(await p.locator('#signup-name').evaluate(e => e.validity.valueMissing), true, 'required fields block sign-up');
  await fillSignup(p, 'Jane Founder', 'jane@acme.example', 'short');
  await p.locator('#signup-submit').click();
  assert.equal(await p.locator('#signup-password').evaluate(e => e.validationMessage), 'Use at least 8 characters.');
  await p.locator('.password-toggle').click();
  assert.deepEqual([await p.locator('#signup-password').getAttribute('type'), await p.locator('.password-toggle').getAttribute('aria-label')], ['text', 'Hide password']);
  await p.locator('.password-toggle').click();
  // Sign-up is disabled (as on the live project): the request is saved for the studio.
  await p.locator('#pricing .price-card a[data-duration="90"]').click();
  await p.locator('#signup-password').fill('correct horse battery');
  await p.locator('#signup-submit').click();
  await p.waitForFunction(() => /received your request/.test(document.getElementById('signup-status').textContent));
  assert.match(await p.locator('#signup-status').innerText(), /email your login details to jane@acme\.example within 24 hours/);
  const request = browser.fijlyDb.contact_submissions.find(x => x.email === 'jane@acme.example');
  assert.ok(request && request.project_type === 'Account request' && request.plan === '90 seconds' && request.name === 'Jane Founder', 'account request saved with the chosen length');
  assert.equal(JSON.stringify(request).includes('correct horse'), false, 'the password is never saved');
  assert.equal(await p.locator('#signup-name').inputValue(), '', 'form cleared');
  assert.equal(await p.locator('.btn-google').isVisible(), true);
  checks.push('Sign-up: GET STARTED panel, name/email/password with show/hide, Google disabled with a note, sign-in and email links; validation; with sign-up disabled the request is saved to contact_submissions (length kept, no password) and the visitor is told to expect their login');

  const signup = async (label, reply, check) => {
    const page = watch(await guest.newPage(), label), bodies = [];
    await page.route('**/auth/v1/signup**', route => { bodies.push({ url: route.request().url(), body: route.request().postDataJSON() }); return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(reply) }); });
    await page.goto(base + 'index.html');
    await page.locator('#pricing .price-card a[data-duration="60"]').click();
    await fillSignup(page, 'Lee New', 'lee@new.example', 'password123');
    await page.locator('#signup-submit').click();
    await check(page, bodies);
    await page.close();
  };
  const newUser = { id: 'qa-new-user', aud: 'authenticated', email: 'lee@new.example', identities: [{ id: 'qa-identity' }], user_metadata: { full_name: 'Lee New' } };
  await signup('confirm', newUser, async (page, bodies) => {
    await page.waitForFunction(() => /confirmation link/.test(document.getElementById('signup-status').textContent));
    assert.match(await page.locator('#signup-status').innerText(), /Check your email — we sent a confirmation link to lee@new\.example/);
    assert.deepEqual(bodies[0].body.data, { full_name: 'Lee New' }, 'sign-up sends the name, never a role');
    assert.match(decodeURIComponent(bodies[0].url), /redirect_to=.*order\.html\?duration=60/, 'the confirmation link returns to the order page with the length');
  });
  await signup('exists', { ...newUser, identities: [] }, async page => {
    await page.waitForFunction(() => /already has a FIJLY Studio account/.test(document.getElementById('signup-status').textContent));
    assert.equal(await page.locator('#signup-status a').getAttribute('href'), 'login.html?next=order.html');
  });
  await signup('signed-in', qaSession(qaUsers.client), async page => {
    await page.waitForURL('**/order.html?duration=60');
    await page.locator('#order-card[data-state="ready"]').waitFor();
    assert.equal(await page.locator('#order-account-email').innerText(), qaUsers.client.email, 'a signed-in sign-up continues to the order page');
    assert.equal(await page.locator('input[name="duration"][value="60"]').isChecked(), true);
  });
  const bot = watch(await guest.newPage(), 'bot');
  await bot.goto(base + 'index.html');
  await fillSignup(bot, 'Bot', 'bot@example.com', 'password123');
  await bot.locator('#fijly-hp').evaluate(e => { e.value = 'https://spam.example'; });
  await bot.locator('#signup-submit').click();
  await bot.waitForFunction(() => /received your request/.test(document.getElementById('signup-status').textContent));
  assert.equal(browser.fijlyDb.contact_submissions.some(x => x.email === 'bot@example.com'), false, 'honeypot sign-ups are not saved');
  await bot.close();
  const google = watch(await guest.newPage(), 'google');
  await google.route('**/js/core/config.js', r => r.fulfill({ contentType: 'application/javascript', body: "window.FIJLY_CONFIG={contactEmail:'hello@fijly.com',googleSignIn:true}" }));
  await google.route('**/auth/v1/authorize**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Google sign-in (QA stub)</title>' }));
  await google.goto(base + 'index.html');
  assert.equal(await google.locator('#google-signin').isDisabled(), false, 'enabled once configured');
  await google.locator('#pricing .price-card a[data-duration="120"]').click();
  const [authorize] = await Promise.all([google.waitForRequest(r => r.url().startsWith(SUPABASE + '/auth/v1/authorize')), google.locator('#google-signin').click()]);
  const oauth = new URL(authorize.url());
  assert.equal(oauth.searchParams.get('provider'), 'google');
  assert.match(oauth.searchParams.get('redirect_to'), /\/order\.html\?duration=120$/);
  await google.close();
  checks.push('Sign-up outcomes: email confirmation (name only, link back to order.html with the length), existing account (sign-in link), signed-in (straight to order.html), honeypot (nothing saved); Google redirects to the Google provider and back to order.html once enabled');

  /* Order page: signed out, and signing in to it ---------------------------- */
  // A fresh context: the signed-in sign-up above left a session in `guest`.
  const out = watch(await (await browser.newContext({ fijlyAuth: null })).newPage(), 'signed-out');
  await out.goto(base + 'order.html?duration=90');
  await out.waitForURL('**/index.html#contact');
  assert.equal(await out.locator('#signup-form').count(), 1, 'signed-out visitors are sent to sign up');
  await out.goto(base + 'login.html?next=order.html');
  await out.locator('#login-email').fill(qaUsers.client.email); await out.locator('#login-password').fill(qaUsers.client.password);
  await out.locator('#login-submit').click();
  await out.waitForURL('**/order.html');
  await out.goto(base + 'login.html?next=https://evil.example');
  await out.waitForURL('**/studio.html**');
  assert.doesNotMatch(out.url(), /evil/, 'only order.html is accepted as a destination');
  await out.close();
  checks.push('order.html sends signed-out visitors to the sign-up form; login.html?next=order.html returns there after signing in, and no other destination is accepted');

  /* Order page: the shell every visitor sees ------------------------------- */
  // The four-step wizard itself (pricing, uploads, submit_project and the
  // milestone payments) is covered by qa/milestones.cjs. Here we only check
  // what this suite owns: the signed-in shell, no prices before the price
  // step, the account line, sign out, and the page at every width.
  const clientCtx = await browser.newContext({ fijlyAuth: 'client' });
  const o = watch(await clientCtx.newPage(), 'order');
  await o.setViewportSize({ width: 1280, height: 900 });
  await o.goto(base + 'order.html?duration=90');
  await o.locator('#order-card[data-state="ready"]').waitFor();
  assert.equal(await o.locator('#order-account-email').innerText(), qaUsers.client.email);
  assert.equal(await o.locator('#order-profile-menu').isHidden(), true, 'the account email is not persistently visible');
  await o.locator('#order-profile-button').click();
  assert.equal(await o.locator('#order-profile-menu').isVisible(), true);
  assert.match(await o.locator('#order-profile-menu').innerText(), new RegExp('Account\\s+' + qaUsers.client.email + '\\s+Sign out'));
  await o.locator('.order__title').click();
  assert.equal(await o.locator('#order-profile-menu').isHidden(), true, 'clicking outside closes the account menu');
  await o.locator('#order-profile-button').click();
  await o.keyboard.press('Escape');
  assert.equal(await o.locator('#order-profile-menu').isHidden(), true, 'Escape closes the account menu');
  assert.equal(await o.locator('#order-company').inputValue(), 'Northbeam', 'company pre-filled from the workspace');
  assert.deepEqual(await o.locator('.order__progress li').allInnerTexts(), ['01\nProject basics', '02\nLook & feel', '03\nBrief, script & voice over', '04\nReview']);
  assert.equal(await o.locator('[data-step="1"] .order__step-label').count(), 0, 'the connected stepper communicates the current step');
  assert.equal(await o.locator('#order-name, #order-email, #order-password').count(), 0, 'no account fields on the order page');
  assert.deepEqual(await o.locator('.order__duration').allInnerTexts(), ['30 seconds', '60 seconds', '90 seconds\nMost popular', '120 seconds']);
  assert.doesNotMatch(await o.locator('[data-step="1"]').innerText(), /\$/, 'no prices with the video length');
  assert.equal(await o.locator('input[name="duration"][value="90"]').isChecked(), true, '?duration pre-selected');
  assert.equal(await o.locator('#order-paypal').isDisabled(), true, 'Pay with PayPal is a disabled placeholder');
  assert.equal(await o.locator('#order-paypal-note').innerText(), 'Online payment coming soon.');
  assert.equal(await o.evaluate(() => window.FIJLY_CONFIG.paypalEnabled), false, 'PayPal stays off while invoices are manual');
  await scan(o, 'order step 1');
  // Deep links cannot skip ahead of the answers they depend on.
  const fresh = watch(await clientCtx.newPage(), 'deep-link');
  await fresh.goto(base + 'order.html#step-4');
  await fresh.locator('#order-card[data-state="ready"]').waitFor();
  await fresh.waitForFunction(() => !document.querySelector('[data-step="1"]').hidden);
  assert.equal(await fresh.evaluate(() => location.hash), '#step-1', 'the review needs the earlier steps first');
  await fresh.close();
  checks.push('Order page (signed in): account menu, company from the workspace, four steps, no account fields, lengths without prices, disabled PayPal placeholder with paypalEnabled false, deep links cannot skip steps');

  /* Where each field lives, and the brief-or-script rule ------------------ */
  {
    const steps = watch(await clientCtx.newPage(), 'steps');
    await steps.setViewportSize({ width: 1280, height: 900 });
    await steps.goto(base + 'order.html?duration=60');
    await steps.locator('#order-card[data-state="ready"]').waitFor();
    // Company and audience are optional; only the purpose is starred on step 2.
    assert.equal(await steps.locator('#order-company').evaluate(e => e.required), false, 'company is optional');
    await steps.locator('#order-title').fill('Step layout check');
    await steps.locator('#order-type').selectOption('Product Demo');
    await steps.locator('[data-next="2"]').click();
    await steps.waitForFunction(() => !document.querySelector('[data-step="2"]').hidden);
    assert.equal(await steps.locator('#step-2-title').innerText(), 'Look & feel');
    // Reference links moved to step 2, directly under the video style.
    assert.equal(await steps.locator('[data-step="2"] #order-references').count(), 1);
    assert.equal(await steps.locator('[data-step="2"] #order-brief-link, [data-step="2"] #order-brief').count(), 0, 'the brief is not on step 2');
    assert.equal(await steps.locator('#order-audience').evaluate(e => e.required), false, 'target audience is optional');
    // Only the purpose holds the step.
    await steps.locator('[data-next="3"]').click();
    assert.equal(await steps.locator('#order-purpose-error').innerText(), 'Tell us what this video should achieve.');
    assert.equal(await steps.evaluate(() => location.hash), '#step-2');
    await steps.locator('#order-purpose').fill('Explain the product and lift trial sign-ups for the QA suite.');
    await steps.locator('[data-next="3"]').click();
    await steps.waitForFunction(() => !document.querySelector('[data-step="3"]').hidden);
    assert.equal(await steps.locator('#step-3-title').innerText(), 'Brief, script & voice over');
    assert.equal(await steps.locator('[data-step="3"] #order-brief-link').count(), 1, 'the brief leads step 3');
    assert.equal(await steps.locator('[data-step="3"] #order-brief').count(), 1, 'the notes close step 3');

    // Neither a brief nor a script: blocked, with one message naming both.
    await steps.locator('[data-next="4"]').click();
    assert.equal(await steps.locator('#order-brief-doc-error').innerText(), 'Add a brief or write your script so we know what the video should say.');
    assert.equal(await steps.evaluate(() => location.hash), '#step-3');
    // A brief alone passes.
    await steps.locator('#order-brief-link').fill('https://example.com/brief');
    await steps.locator('[data-next="4"]').click();
    await steps.waitForFunction(() => !document.querySelector('[data-step="4"]').hidden);
    await steps.locator('[data-back="3"]').click();
    await steps.waitForFunction(() => !document.querySelector('[data-step="3"]').hidden);
    // A script alone passes too.
    await steps.locator('#order-brief-link').fill('');
    await steps.locator('label:has(input[name="scriptChoice"][value="own"])').click();
    await steps.locator('#order-script-file').setInputFiles({ name: 'script.txt', mimeType: 'text/plain', buffer: Buffer.from('script') });
    await steps.locator('[data-next="4"]').click();
    await steps.waitForFunction(() => !document.querySelector('[data-step="4"]').hidden);
    // The review lists every field in its new order.
    assert.deepEqual(await steps.locator('.order__summary-facts dt').allInnerTexts(),
      ['Project', 'Company', 'Website', 'Video', 'Delivery', 'Purpose', 'Audience', 'Style', 'References', 'Brand colors', 'Files', 'Brief', 'Script', 'Voice over', 'Notes', 'Account']);
    await scan(steps, 'order step 3');
    await steps.setViewportSize({ width: 375, height: 900 });
    assert.equal(await overflow(steps), false, '375: review overflow');
    await steps.close();
    checks.push('Steps: company and target audience are optional, reference links sit on "Look & feel", the brief leads "Brief, script & voice over" with the notes last, a project needs a brief OR a script (neither is blocked, either one passes), and the review lists every field in its new order');
  }

  for (const width of [375, 768, 1280]) {
    const r = watch(await clientCtx.newPage(), 'responsive');
    await r.setViewportSize({ width, height: 900 });
    await r.goto(base + 'order.html?duration=120');
    await r.locator('#order-card[data-state="ready"]').waitFor();
    assert.equal(await overflow(r), false, width + ': order page overflow');
    await r.screenshot({ path: `qa/screenshots/order-${width}.png`, fullPage: true });
    if (width === 375) await scan(r, 'order step 1 / 375');
    await r.close();
  }
  for (const [width, height] of [[1920, 1080], [1600, 900], [1440, 900], [1366, 768]]) {
    const desktop = watch(await clientCtx.newPage(), 'desktop-fit');
    await desktop.setViewportSize({ width, height });
    await desktop.goto(base + 'order.html?duration=120');
    await desktop.locator('#order-card[data-state="ready"]').waitFor();
    const visual = await desktop.locator('.order__studio-visual').boundingBox();
    const milestones = await desktop.locator('.order__milestones').boundingBox();
    assert.ok(visual && visual.y >= 0 && visual.y + visual.height <= height, width + 'x' + height + ': editor fits the viewport');
    assert.ok(milestones && milestones.y >= 0 && milestones.y + milestones.height <= height, width + 'x' + height + ': payment milestones fit the viewport');
    assert.equal(await overflow(desktop), false, width + 'x' + height + ': order page overflow');
    await desktop.close();
  }
  checks.push('Left brand panel keeps its editor and payment milestones visible at 1920×1080, 1600×900, 1440×900 and 1366×768');
  const leave = watch(await clientCtx.newPage(), 'sign-out');
  await leave.goto(base + 'order.html');
  await leave.locator('#order-card[data-state="ready"]').waitFor();
  await leave.locator('#order-profile-button').click();
  await leave.locator('#order-signout').click();
  await leave.waitForURL('**/index.html');
  await leave.close();
  checks.push('No overflow at 375/768/1280; Sign out returns to fijly.com');

  /* Admin Orders screen ----------------------------------------------------- */
  const adminCtx = await browser.newContext(), a = watch(await adminCtx.newPage(), 'admin');
  // Orders are the retired single-payment flow, kept for the orders already
  // placed before the milestone workflow. Nothing writes to this table now, so
  // the screen is driven from seeded rows.
  browser.fijlyDb.orders.push({ id: 'qa-order-bad-price', name: 'Price Tamper', email: 'tamper@example.com', company: 'Tamper Ltd', video_type: 'Product Promo', duration: '90 seconds', price: 1, brief: 'Tampered price.', status: 'pending', payment_intent_id: null, created_at: '2026-09-01T10:00:00Z', updated_at: '2026-09-01T10:00:00Z' });
  browser.fijlyDb.orders.push({ id: 'qa-order-legacy', name: 'Casey Morgan', email: qaUsers.client.email, company: 'Northbeam', video_type: 'Product Demo', duration: '90 seconds', price: 700, brief: 'We need a product demo that walks new trial users through setting up their first dashboard.', status: 'pending', payment_intent_id: null, created_at: '2026-09-20T10:00:00Z', updated_at: '2026-09-20T10:00:00Z' });
  await a.goto(base + 'admin.html#dashboard');
  const links = await a.locator('.sidebar-link[data-screen]').evaluateAll(l => l.map(x => x.dataset.screen));
  assert.deepEqual(links.slice(0, 4), ['dashboard', 'orders', 'payments', 'clients'], 'Orders sits between Dashboard and Payments');
  await a.waitForFunction(() => document.querySelector('.sidebar-link[data-screen="orders"] [data-order-badge]'));
  const pendingCount = () => String(browser.fijlyDb.orders.filter(o => o.status === 'pending').length);
  assert.equal(await a.locator('.sidebar-link[data-screen="orders"] [data-order-badge]').innerText(), pendingCount(), 'pending orders counted in the sidebar');
  const total = browser.fijlyDb.orders.length;
  await a.locator('.sidebar-link[data-screen="orders"]').click();
  await a.waitForFunction(n => document.querySelectorAll('#order-rows tr').length === n, total);
  assert.deepEqual(await a.locator('.admin-orders-table th').allInnerTexts(), ['DATE', 'NAME', 'EMAIL', 'COMPANY', 'VIDEO TYPE', 'DURATION', 'PRICE', 'STATUS', 'ACTIONS']);
  assert.match(await a.locator('#order-rows tr').first().innerText(), /Casey Morgan/, 'newest first');
  const first = await a.locator('#order-rows tr', { hasText: 'Casey Morgan' }).innerText();
  assert.match(first, /Casey Morgan[\s\S]*casey@northbeam\.example[\s\S]*Northbeam[\s\S]*Product Demo[\s\S]*90 seconds[\s\S]*\$700[\s\S]*Pending/, 'every column');
  assert.match(await a.locator('#order-rows tr', { hasText: 'Price Tamper' }).innerText(), /\$1[\s\S]*Check price/, 'price that does not match the list is flagged');
  assert.equal(await a.locator('#order-rows .badge-warning').first().innerText(), 'Pending');
  await scan(a, 'admin orders');
  await a.locator('#order-search').fill('tamper');
  assert.equal(await a.locator('#order-rows tr').count(), 1);
  await a.locator('#order-search').fill('');
  await a.locator('#order-status-filter').selectOption('completed');
  assert.equal(await a.locator('#order-empty').isVisible(), true);
  await a.locator('#order-empty-action').click();
  assert.equal(await a.locator('#order-rows tr').count(), total, 'Clear filters restores the list');
  await a.locator('#order-rows button', { hasText: 'Casey Morgan' }).click();
  await a.locator('#order-detail').waitFor({ state: 'visible' });
  assert.match(await a.locator('#order-detail-body').innerText(), /first dashboard/, 'the full brief is shown');
  assert.equal(await a.locator('#order-detail-body a[href="mailto:casey@northbeam.example"]').count(), 1);
  await scan(a, 'admin order detail');
  await a.locator('#order-detail-status').selectOption('processing');
  await a.locator('#order-status-save').click();
  await a.waitForFunction(() => !document.getElementById('order-detail').open);
  assert.equal(browser.fijlyDb.orders.find(o => o.name === 'Casey Morgan').status, 'processing', 'status saved to the database');
  assert.match(await a.locator('#order-save-status').innerText(), /marked processing/);
  assert.equal(await a.locator('.sidebar-link[data-screen="orders"] [data-order-badge]').innerText(), pendingCount());
  for (const status of ['completed', 'cancelled']) {
    await a.locator('#order-rows button', { hasText: 'Casey Morgan' }).click();
    await a.locator('#order-detail-status').selectOption(status);
    await a.locator('#order-status-save').click();
    await a.waitForFunction(() => !document.getElementById('order-detail').open);
  }
  assert.match(await a.locator('#order-rows tr', { hasText: 'Casey Morgan' }).locator('.badge-danger').innerText(), /Cancelled/);
  // Clients and anonymous visitors can't read or change orders (RLS).
  const emulator = require('./supabase-emulator.cjs');
  const ordersUrl = new URL('https://x.supabase.co/rest/v1/orders?select=*');
  assert.deepEqual(emulator.handle(browser.fijlyDb, qaUsers.client, 'GET', ordersUrl, {}, null).body, [], 'clients see no orders');
  const anonymous = emulator.handle(browser.fijlyDb, undefined, 'GET', ordersUrl, {}, null).body;
  assert.ok(!Array.isArray(anonymous) || !anonymous.length, 'anonymous visitors cannot read orders');
  const patched = emulator.handle(browser.fijlyDb, qaUsers.client, 'PATCH', new URL('https://x.supabase.co/rest/v1/orders?id=eq.qa-order-bad-price'), { prefer: 'return=representation' }, { status: 'completed' });
  assert.deepEqual([patched.body, browser.fijlyDb.orders.find(o => o.id === 'qa-order-bad-price').status], [[], 'pending'], 'clients cannot change orders');
  await a.setViewportSize({ width: 375, height: 900 });
  await a.goto(base + 'admin.html#orders');
  await a.waitForFunction(n => document.querySelectorAll('#order-rows tr').length === n, total);
  assert.equal(await overflow(a), false, 'admin orders 375 overflow');
  checks.push('Admin Orders: sidebar link between Dashboard and Clients with a pending count, newest-first table with every column, status badges, price-mismatch flag, search/filter/clear, detail with full brief and email link, status updates saved (processing, completed, cancelled), no overflow at 375');

  fs.writeFileSync('qa/orders-results.json', JSON.stringify({ checks, scans, errors }, null, 2));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks, scans: scans.length, errors }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; })
  // Tear down even when an assertion stops the run part-way.
  .finally(async () => { if (launched) await launched.close().catch(() => {}); await stopServer(); });
