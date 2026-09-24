/* Per-video pricing, the order configurator (order.html) and the Admin
   Orders screen. Runs against the Supabase emulator: orders are inserted
   anonymously, sign-up answers "disabled" as on the live project, and only
   admins read or update orders. */
const { chromium, base } = require('./runtime.cjs');
const assert = require('assert/strict'), fs = require('fs');
fs.mkdirSync('qa/screenshots', { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const errors = [], checks = [], scans = [];
  const guest = await browser.newContext({ fijlyAuth: null }), p = await guest.newPage();
  p.setDefaultTimeout(10000);
  p.on('pageerror', e => errors.push('order pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push('order console: ' + m.text()); });
  const scan = async (page, label) => {
    await page.addScriptTag({ path: 'qa/axe.min.js' });
    const violations = await page.evaluate(async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] } })).violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })));
    scans.push({ label, violations });
    assert.deepEqual(violations, [], label);
  };
  const overflow = page => page.evaluate(() => document.documentElement.scrollWidth > innerWidth);

  /* Landing page pricing ---------------------------------------------------- */
  await p.setViewportSize({ width: 1280, height: 900 });
  await p.goto(base + 'index.html');
  assert.equal(await p.locator('#pricing').count(), 1, 'section id kept for the nav');
  assert.equal(await p.locator('#pricing h2').innerText(), 'One video, one price. No subscriptions.');
  assert.deepEqual(await p.locator('#pricing .price-card__amount').allInnerTexts(), ['$300', '$500', '$700', '$950']);
  assert.deepEqual(await p.locator('#pricing .price-card a').evaluateAll(a => a.map(x => x.getAttribute('href'))), ['order.html?duration=30', 'order.html?duration=60', 'order.html?duration=90', 'order.html?duration=120']);
  assert.match(await p.locator('#pricing .card-dark').innerText(), /90 seconds[\s\S]*Most popular|Most popular[\s\S]*90 seconds/);
  assert.equal(await p.locator('text=$3.5K').count() + await p.locator('text=$9K').count() + await p.locator('[data-plan]').count(), 0, 'old plans removed');
  assert.equal(await p.locator('#pricing .pricing__features li').count(), 5);
  assert.equal(await p.locator('#pricing .pricing__custom a').getAttribute('href'), '#contact');
  assert.equal(await p.locator('.hero__actions a').first().getAttribute('href'), 'order.html');
  assert.equal(await p.locator('.nav__actions .btn').getAttribute('href'), 'order.html');
  assert.equal(await p.locator('#mobile-menu .btn').getAttribute('href'), 'order.html');
  assert.equal(await p.locator('.hero__actions a[href="#work"]').count(), 1, 'View Our Work still points at #work');
  assert.doesNotMatch(await p.locator('#faq').innerText(), /Studio and Scale/);
  const columns = async () => p.locator('#pricing .price-card').evaluateAll(cards => new Set(cards.map(c => Math.round(c.getBoundingClientRect().left))).size);
  for (const [width, expected] of [[1280, 4], [768, 2], [375, 1]]) {
    await p.setViewportSize({ width, height: 900 });
    assert.equal(await columns(), expected, width + ': pricing columns');
    assert.equal(await overflow(p), false, width + ': landing page overflow');
    await p.locator('#pricing').screenshot({ path: `qa/screenshots/pricing-${width}.png` });
  }
  checks.push('Pricing: 4 duration cards ($300/$500/$700/$950), 90s featured, order links carry the duration, includes list, custom link; old plans gone; nav and hero start an order; 4/2/1 columns at 1280/768/375');

  /* Order page: step 1, your account --------------------------------------- */
  await p.setViewportSize({ width: 1280, height: 900 });
  await p.locator('#pricing .price-card a[href="order.html?duration=90"]').click();
  await p.waitForURL('**/order.html?duration=90');
  assert.equal(await p.locator('[data-step="1"]').isVisible(), true);
  assert.equal(await p.locator('[data-step="1"] .order__step-label').innerText(), 'STEP 1 OF 3');
  assert.equal(await p.locator('#step-1-title').innerText(), 'Create your account');
  assert.deepEqual(await p.locator('.order__progress li').allInnerTexts(), ['1. Your account', '2. Your video', '3. Review & pay']);
  assert.equal(await p.locator('[data-progress="1"]').getAttribute('aria-current'), 'step');
  assert.equal(await p.locator('#order-type').isVisible(), false, 'video details wait for step 2');
  assert.match(await p.locator('.order__prices .is-selected').innerText(), /\$700/, 'the chosen length shows in the price panel from the start');
  await scan(p, 'order step 1');
  await p.locator('[data-next="2"]').click();
  assert.equal(await p.locator('#order-name-error').innerText(), 'Enter your full name.');
  assert.equal(await p.locator('#order-email-error').innerText(), 'Enter your work email.');
  assert.equal(await p.locator('#order-password-error').innerText(), 'Choose a password.');
  assert.equal(await p.evaluate(() => document.activeElement.id), 'order-name', 'first problem focused');
  assert.equal(await p.locator('[data-step="1"]').isVisible(), true, 'invalid step does not advance');
  await p.locator('#order-name').fill('Jane Founder');
  await p.locator('#order-email').fill('not-an-email');
  await p.locator('#order-password').fill('short');
  await p.locator('[data-next="2"]').click();
  assert.equal(await p.locator('#order-name-error').innerText(), '', 'fixed fields clear their errors');
  assert.match(await p.locator('#order-email-error').innerText(), /valid email/);
  assert.equal(await p.locator('#order-password-error').innerText(), 'Use at least 8 characters.');
  await p.locator('#order-toggle').click();
  assert.equal(await p.locator('#order-password').getAttribute('type'), 'text');
  await p.locator('#order-toggle').click();
  await p.locator('#order-email').fill('jane@acme.example');
  await p.locator('#order-password').fill('correct horse battery');
  await p.locator('[data-next="2"]').click();
  await p.waitForFunction(n => location.hash === '#step-' + n && !document.querySelector('[data-step="' + n + '"]').hidden, 2);
  assert.equal(await p.locator('[data-progress="1"]').getAttribute('class'), 'is-done');
  assert.equal(await p.locator('[data-progress="2"]').getAttribute('aria-current'), 'step');
  checks.push('Order step 1 (account): labels and progress in the new order, name/email/password validation with focus, show/hide password, Continue advances to #step-2');

  /* Step 2, your video; browser Back and deep links ------------------------- */
  assert.equal(await p.locator('[data-step="2"] .order__step-label').innerText(), 'STEP 2 OF 3');
  assert.equal(await p.locator('#step-2-title').innerText(), 'Your video');
  assert.equal(await p.locator('input[name="duration"][value="90"]').isChecked(), true, '?duration pre-selects the length in step 2');
  assert.deepEqual(await p.locator('#order-type option').allInnerTexts(), ['Choose a video type', 'Product Launch', 'Homepage Video', 'Product Demo', 'Product Promo', 'SaaS Explainer', 'Tutorial / Onboarding']);
  await p.locator('[data-next="3"]').click();
  assert.equal(await p.locator('#order-type-error').innerText(), 'Choose a video type.');
  assert.equal(await p.locator('#order-company-error').innerText(), 'Enter your company name.');
  assert.equal(await p.locator('#order-duration-error').innerText(), '', 'the pre-selected length needs no answer');
  assert.equal(await p.evaluate(() => document.activeElement.id), 'order-type');
  await p.locator('#order-type').selectOption('Product Demo');
  await p.locator('#order-company').fill('Acme Inc');
  await p.locator('#order-brief').fill('Too short');
  await p.locator('[data-next="3"]').click();
  assert.equal(await p.locator('#order-brief-error').innerText(), 'Please add at least 20 characters about your project.');
  await p.locator('#order-brief').fill('We need a product demo that walks new trial users through setting up their first dashboard.');
  await p.goBack();
  await p.waitForFunction(() => !document.querySelector('[data-step="1"]').hidden);
  assert.equal(await p.locator('#order-email').inputValue(), 'jane@acme.example', 'browser Back keeps the account details');
  await p.goForward();
  await p.waitForFunction(() => !document.querySelector('[data-step="2"]').hidden);
  assert.equal(await p.locator('#order-company').inputValue(), 'Acme Inc', 'and the video details');
  await p.locator('[data-back="1"]').click();
  await p.waitForFunction(n => location.hash === '#step-' + n && !document.querySelector('[data-step="' + n + '"]').hidden, 1);
  await p.locator('[data-next="2"]').click();
  await p.waitForFunction(n => location.hash === '#step-' + n && !document.querySelector('[data-step="' + n + '"]').hidden, 2);
  await scan(p, 'order step 2');
  await p.locator('[data-next="3"]').click();
  await p.waitForFunction(n => location.hash === '#step-' + n && !document.querySelector('[data-step="' + n + '"]').hidden, 3);
  checks.push('Order step 2 (video): ?duration pre-selected, six video types, inline validation, brief minimum, Back to your account and browser Back/Forward keep every field');

  /* Step 3: review ----------------------------------------------------------- */
  assert.deepEqual(await p.locator('.order__summary-facts dt').allInnerTexts(), ['Account', 'Video', 'Company', 'Brief'], 'account first, then the video');
  assert.equal(await p.locator('#summary-account').innerText(), 'Jane Founder · jane@acme.example');
  assert.equal(await p.locator('#summary-item').innerText(), 'Product Demo · 90 seconds');
  assert.equal(await p.locator('#summary-company').innerText(), 'Acme Inc');
  assert.equal(await p.locator('#summary-total').innerText(), '$700');
  assert.equal(await p.locator('#order-pay').isDisabled(), true, 'Pay is a disabled placeholder');
  assert.match(await p.locator('#order-pay').innerText(), /Pay\s+\$700/);
  assert.match(await p.locator('#order-pay-note').innerText(), /coming soon/);
  await scan(p, 'order step 3');
  await p.locator('[data-back="2"]').click();
  await p.waitForFunction(n => location.hash === '#step-' + n && !document.querySelector('[data-step="' + n + '"]').hidden, 2);
  assert.equal(await p.locator('#order-company').inputValue(), 'Acme Inc', 'Back keeps the data');
  await p.locator('[data-next="3"]').click();
  await p.waitForFunction(n => location.hash === '#step-' + n && !document.querySelector('[data-step="' + n + '"]').hidden, 3);
  // A deep link to a later step opens the first incomplete step instead.
  const fresh = await guest.newPage();
  await fresh.goto(base + 'order.html#step-3');
  await fresh.waitForFunction(() => !document.querySelector('[data-step="1"]').hidden);
  assert.equal(await fresh.evaluate(() => location.hash), '#step-1');
  await fresh.close();
  checks.push('Order step 3: summary lists account, then video, company and brief, then the $700 total; disabled Pay placeholder with note; Back keeps data; deep links fall back to the first incomplete step');

  /* Submit ------------------------------------------------------------------- */
  const before = browser.fijlyDb.orders.length;
  await p.locator('#order-submit').click();
  await p.locator('#order-success').waitFor({ state: 'visible' });
  assert.equal(await p.locator('#order-success-title').innerText(), 'Your order has been received!');
  assert.match(await p.locator('#order-success-text').innerText(), /email your login details to jane@acme\.example within 24 hours/);
  assert.match(await p.locator('#order-success-summary').innerText(), /Product Demo · 90 seconds · \$700 for Acme Inc/);
  assert.equal(await p.locator('#order-form').isVisible(), false);
  assert.equal(browser.fijlyDb.orders.length, before + 1);
  const order = browser.fijlyDb.orders[browser.fijlyDb.orders.length - 1];
  assert.deepEqual([order.name, order.email, order.company, order.video_type, order.duration, order.price, order.status], ['Jane Founder', 'jane@acme.example', 'Acme Inc', 'Product Demo', '90 seconds', 700, 'pending']);
  assert.match(order.brief, /first dashboard/);
  assert.equal(JSON.stringify(order).includes('correct horse'), false, 'the password is never stored with the order');
  assert.equal(await p.locator('#order-password').inputValue(), '', 'password cleared after submitting');
  await scan(p, 'order success');
  checks.push('Submit saves the order (pending, $700, 90 seconds) anonymously; sign-up is disabled so the manual-account message shows; the password is never stored');

  /* Honeypot, failure and responsive ---------------------------------------- */
  const bot = await guest.newPage();
  await bot.goto(base + 'order.html?duration=30');
  await bot.locator('#order-name').fill('Bot'); await bot.locator('#order-email').fill('bot@example.com'); await bot.locator('#order-password').fill('password123'); await bot.locator('[data-next="2"]').click();
  await bot.locator('#order-type').selectOption('SaaS Explainer'); await bot.locator('#order-company').fill('Spam Co');
  await bot.locator('#order-brief').fill('Automated spam brief with enough characters.'); await bot.locator('[data-next="3"]').click();
  await bot.locator('#order-hp').evaluate(e => { e.value = 'https://spam.example'; });
  await bot.locator('#order-submit').click();
  await bot.locator('#order-success').waitFor({ state: 'visible' });
  assert.equal(browser.fijlyDb.orders.some(o => o.name === 'Bot'), false, 'honeypot orders are not saved');
  await bot.close();
  const down = await guest.newPage();
  await down.route('**/rest/v1/orders', r => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 'XX000', message: 'QA failure' }) }));
  await down.goto(base + 'order.html?duration=60');
  await down.locator('#order-name').fill('Sam Down'); await down.locator('#order-email').fill('sam@down.example'); await down.locator('#order-password').fill('password123'); await down.locator('[data-next="2"]').click();
  await down.locator('#order-type').selectOption('Homepage Video'); await down.locator('#order-company').fill('Down Co');
  await down.locator('#order-brief').fill('A homepage video for our analytics product.'); await down.locator('[data-next="3"]').click();
  await down.locator('#order-submit').click();
  await down.locator('#order-error').waitFor({ state: 'visible' });
  assert.match(await down.locator('#order-error').innerText(), /couldn’t submit your order/);
  assert.match(decodeURIComponent(await down.locator('#order-error a').getAttribute('href')), /^mailto:hello@fijly\.com\?subject=FIJLY video order — Down Co/);
  assert.equal(await down.locator('#order-submit').isDisabled(), false, 'a failed submit can be retried');
  assert.equal(await down.locator('#order-success').isVisible(), false);
  await down.close();
  // With self sign-up switched on (not yet: it's disabled on the project), the
  // order also creates the login, sending the name but never a role.
  const signup = await guest.newPage(), signupBodies = [];
  await signup.addInitScript(() => { window.FIJLY_SELF_SIGNUP = true; });
  await signup.route('**/auth/v1/signup**', r => { signupBodies.push(r.request().postDataJSON()); return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: 'qa-new-user', aud: 'authenticated', email: 'lee@new.example', identities: [{ id: 'qa-identity' }], user_metadata: { full_name: 'Lee New' } }) }); });
  await signup.goto(base + 'order.html?duration=30');
  await signup.locator('#order-name').fill('Lee New'); await signup.locator('#order-email').fill('lee@new.example'); await signup.locator('#order-password').fill('password123'); await signup.locator('[data-next="2"]').click();
  await signup.locator('#order-type').selectOption('Product Launch'); await signup.locator('#order-company').fill('New Co');
  await signup.locator('#order-brief').fill('A launch video for our new scheduling feature.'); await signup.locator('[data-next="3"]').click();
  await signup.locator('#order-submit').click();
  await signup.locator('#order-success').waitFor({ state: 'visible' });
  assert.match(await signup.locator('#order-success-text').innerText(), /Check lee@new\.example for a confirmation link/);
  assert.equal(signupBodies.length, 1);
  assert.deepEqual(signupBodies[0].data, { full_name: 'Lee New' }, 'sign-up never sends a role');
  assert.ok(browser.fijlyDb.orders.some(o => o.email === 'lee@new.example'), 'the order is saved as well');
  await signup.close();
  for (const width of [375, 768, 1280]) {
    const r = await guest.newPage();
    await r.setViewportSize({ width, height: 900 });
    await r.goto(base + 'order.html?duration=120');
    assert.equal(await overflow(r), false, width + ': order page overflow');
    await r.screenshot({ path: `qa/screenshots/order-${width}.png`, fullPage: true });
    if (width === 375) await scan(r, 'order step 1 / 375');
    await r.close();
  }
  checks.push('Honeypot orders show success but are not saved; with self sign-up enabled the order also creates the login (name only, never a role) and asks for email confirmation; a failed save keeps the brief, offers an email fallback and allows retry; order page has no overflow at 375/768/1280');

  /* Admin Orders screen ----------------------------------------------------- */
  const adminCtx = await browser.newContext(), a = await adminCtx.newPage();
  a.setDefaultTimeout(10000);
  a.on('pageerror', e => errors.push('admin pageerror: ' + e.message));
  a.on('console', m => { if (m.type() === 'error') errors.push('admin console: ' + m.text()); });
  browser.fijlyDb.orders.push({ id: 'qa-order-bad-price', name: 'Price Tamper', email: 'tamper@example.com', company: 'Tamper Ltd', video_type: 'Product Promo', duration: '90 seconds', price: 1, brief: 'Tampered price.', status: 'pending', payment_intent_id: null, created_at: '2026-09-01T10:00:00Z', updated_at: '2026-09-01T10:00:00Z' });
  await a.goto(base + 'admin.html#dashboard');
  const links = await a.locator('.sidebar-link[data-screen]').evaluateAll(l => l.map(x => x.dataset.screen));
  assert.deepEqual(links.slice(0, 3), ['dashboard', 'orders', 'clients'], 'Orders sits between Dashboard and Clients');
  await a.waitForFunction(() => document.querySelector('.sidebar-link[data-screen="orders"] [data-order-badge]'));
  const pendingCount = () => String(browser.fijlyDb.orders.filter(o => o.status === 'pending').length);
  assert.equal(await a.locator('.sidebar-link[data-screen="orders"] [data-order-badge]').innerText(), pendingCount(), 'pending orders counted in the sidebar');
  const total = browser.fijlyDb.orders.length;
  await a.locator('.sidebar-link[data-screen="orders"]').click();
  await a.waitForFunction(n => document.querySelectorAll('#order-rows tr').length === n, total);
  assert.deepEqual(await a.locator('.admin-orders-table th').allInnerTexts(), ['DATE', 'NAME', 'EMAIL', 'COMPANY', 'VIDEO TYPE', 'DURATION', 'PRICE', 'STATUS', 'ACTIONS']);
  assert.match(await a.locator('#order-rows tr').first().innerText(), /Lee New/, 'newest first');
  const first = await a.locator('#order-rows tr', { hasText: 'Jane Founder' }).innerText();
  assert.match(first, /Jane Founder[\s\S]*jane@acme\.example[\s\S]*Acme Inc[\s\S]*Product Demo[\s\S]*90 seconds[\s\S]*\$700[\s\S]*Pending/, 'every column');
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
  await a.locator('#order-rows button', { hasText: 'Jane Founder' }).click();
  await a.locator('#order-detail').waitFor({ state: 'visible' });
  assert.match(await a.locator('#order-detail-body').innerText(), /first dashboard/, 'the full brief is shown');
  assert.equal(await a.locator('#order-detail-body a[href="mailto:jane@acme.example"]').count(), 1);
  await scan(a, 'admin order detail');
  await a.locator('#order-detail-status').selectOption('processing');
  await a.locator('#order-status-save').click();
  await a.waitForFunction(() => !document.getElementById('order-detail').open);
  assert.equal(browser.fijlyDb.orders.find(o => o.name === 'Jane Founder').status, 'processing', 'status saved to the database');
  assert.match(await a.locator('#order-save-status').innerText(), /marked processing/);
  assert.equal(await a.locator('.sidebar-link[data-screen="orders"] [data-order-badge]').innerText(), pendingCount());
  for (const status of ['completed', 'cancelled']) {
    await a.locator('#order-rows button', { hasText: 'Jane Founder' }).click();
    await a.locator('#order-detail-status').selectOption(status);
    await a.locator('#order-status-save').click();
    await a.waitForFunction(() => !document.getElementById('order-detail').open);
  }
  assert.match(await a.locator('#order-rows tr', { hasText: 'Jane Founder' }).locator('.badge-danger').innerText(), /Cancelled/);
  // Clients and anonymous visitors can't read or change orders (RLS).
  const emulator = require('./supabase-emulator.cjs'), { qaUsers } = require('./runtime.cjs');
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
  await browser.close();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks, scans: scans.length, errors }, null, 2));
})().catch(error => { console.error(error); process.exit(1); });
