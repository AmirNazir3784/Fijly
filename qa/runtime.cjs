/* Shared QA runtime. Prefer PLAYWRIGHT_MODULE, a local install, then the
   existing workstation cache. No package installation or app dependencies. */
const path = require('path'), fs = require('fs'), os = require('os');
let playwright;
const candidates = [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'];
const cache = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'npm-cache', '_npx');
if (fs.existsSync(cache)) for (const entry of fs.readdirSync(cache)) candidates.push(path.join(cache, entry, 'node_modules', 'playwright-core'));
for (const candidate of candidates.filter(Boolean)) {
  try { playwright = require(candidate); break; } catch (error) {
    if (candidate === process.env.PLAYWRIGHT_MODULE) throw new Error('PLAYWRIGHT_MODULE could not be loaded: ' + candidate, {cause:error});
  }
}
if (!playwright) throw new Error('Install Playwright locally or set PLAYWRIGHT_MODULE to its module directory.');

/* Supabase auth for QA. The portals load the pinned SDK from jsDelivr with an
   integrity hash, so QA serves the identical vendored file and mocks only the
   Supabase HTTP endpoints. The real SDK and guard code run; no network, no
   bypass in production code. By default ('auto') a context is signed in and
   the backend answers as the client user on studio.html and as the admin on
   admin.html, so older suites can use both portals in one context. An explicit
   { fijlyAuth: 'admin' | 'admin2' | 'client' | 'noprofile' | null } follows
   the real session token instead (auth.cjs).
   The REST and Storage APIs are served by supabase-emulator.cjs: one in-memory database per
   launched browser, shared by its contexts and tabs like a real backend. */
const emulator = require('./supabase-emulator.cjs');
const SDK = fs.readFileSync(path.join(__dirname, 'vendor', 'supabase-js-2.116.0.js'));
const SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/dist/umd/supabase.js';
const SUPABASE = 'https://eaddovqkarognynnybeh.supabase.co';
const STORAGE_KEY = 'sb-eaddovqkarognynnybeh-auth-token';
const qaUsers = {
  // Matches the mock Settings identity, so seeding is a no-op for older suites.
  admin: { id: '00000000-0000-4000-8000-000000000001', email: 'sam@fijly.example', password: 'qa-admin-password', profile: { role: 'admin', full_name: 'Sam Ortiz', client_id: null } },
  admin2: { id: '00000000-0000-4000-8000-000000000002', email: 'morgan@fijly.example', password: 'qa-admin2-password', profile: { role: 'admin', full_name: 'Morgan Blake', client_id: null } },
  client: { id: '00000000-0000-4000-8000-000000000003', email: 'casey@northbeam.example', password: 'qa-client-password', profile: { role: 'client', full_name: 'Casey Morgan', client_id: 'northbeam' } },
  noprofile: { id: '00000000-0000-4000-8000-000000000004', email: 'nobody@fijly.example', password: 'qa-none-password', profile: null },
  // A client account not yet linked to a workspace (profiles.client_id is null).
  unlinked: { id: '00000000-0000-4000-8000-000000000005', email: 'newclient@example.com', password: 'qa-unlinked-password', profile: { role: 'client', full_name: 'Robin New', client_id: null } }
};
const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const accessToken = user => b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', iat: 1790000000, exp: 4102444800 }) + '.qa';
const authUser = user => ({ id: user.id, aud: 'authenticated', role: 'authenticated', email: user.email, app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' });
const session = user => ({ access_token: accessToken(user), token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, refresh_token: 'qa-refresh-' + user.id, user: authUser(user) });
const byToken = header => Object.values(qaUsers).find(user => header === 'Bearer ' + accessToken(user));
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'access-control-expose-headers': '*' };
const json = (route, status, body) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: body === undefined ? '' : JSON.stringify(body) });

async function installSupabaseMock(context, as = 'auto', db = emulator.createDb(qaUsers)) {
  const auto = as === 'auto';
  // In auto mode the portal page decides who is calling.
  const pageUser = request => { let page = ''; try { page = request.frame().url(); } catch (_) {} return /studio\.html/.test(page) ? qaUsers.client : /admin\.html/.test(page) ? qaUsers.admin : null; };
  await context.route(SDK_URL, route => route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/javascript' }, body: SDK }));
  await context.route(SUPABASE + '/**', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const tokenUser = byToken(request.headers()['authorization']);
    const caller = auto && tokenUser ? pageUser(request) || tokenUser : tokenUser;
    if (url.pathname === '/auth/v1/token') {
      const body = request.postDataJSON() || {};
      const user = url.searchParams.get('grant_type') === 'password'
        ? Object.values(qaUsers).find(u => u.email === String(body.email).toLowerCase() && u.password === body.password)
        : Object.values(qaUsers).find(u => body.refresh_token === 'qa-refresh-' + u.id);
      return user ? json(route, 200, session(user)) : json(route, 400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
    }
    if (url.pathname === '/auth/v1/user') return caller ? json(route, 200, authUser(caller)) : json(route, 401, { code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' });
    if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204, headers: cors });
    // As on the live project, public sign-up is disabled.
    if (url.pathname === '/auth/v1/signup') return json(route, 422, { code: 422, error_code: 'signup_disabled', msg: 'Signups not allowed for this instance' });
    if (url.pathname.startsWith('/rest/v1/')) {
      const result = emulator.handle(db, caller, method, url, request.headers(), request.postDataJSON());
      return result.status === 204 ? route.fulfill({ status: 204, headers: cors }) : json(route, result.status, result.body);
    }
    if (url.pathname.startsWith('/storage/v1/object/')) {
      const result = emulator.handleStorage(db, caller, method, url, request.headers(), request.postDataBuffer());
      return result.raw ? route.fulfill({ status: result.status, headers: { ...cors, 'content-type': result.type }, body: result.raw }) : json(route, result.status, result.body);
    }
    return json(route, 404, { message: 'Not mocked in QA: ' + method + ' ' + url.pathname });
  });
  // Seed the starting session once per context, so a later sign-out sticks.
  const seedUser = auto ? qaUsers.admin : as && qaUsers[as];
  const seed = seedUser ? JSON.stringify(session(seedUser)) : '';
  await context.addInitScript(({ key, seed }) => {
    try { if (!localStorage.getItem('fijly-qa-auth-seeded')) { localStorage.setItem('fijly-qa-auth-seeded', '1'); if (seed) localStorage.setItem(key, seed); } } catch (_) { /* about:blank */ }
  }, { key: STORAGE_KEY, seed });
  // Older suites address the data service by its retired mock name. In both
  // portals (neither loads the mock any more) that name points at FijlyData.
  await context.addInitScript(() => {
    if (/(admin|studio)\.html$/.test(location.pathname)) Object.defineProperty(window, 'FijlyMock', { configurable: true, get() { return window.FijlyData; } });
  });
}

// A portal navigation resolves once its auth check has settled (overlay gone,
// error shown, or redirected), so a following reload never cancels it midway.
function settleAuth(page) {
  for (const method of ['goto', 'reload']) {
    const original = page[method].bind(page);
    page[method] = async (...args) => {
      const response = await original(...args);
      try {
        await page.waitForFunction(() => !/(studio|admin)\.html$/.test(location.pathname) || !document.getElementById('auth-loading') || !!document.querySelector('.auth-loading__actions'), null, { timeout: 15000 });
      } catch (_) { /* Navigated away (for example a redirect to sign in). */ }
      return response;
    };
  }
  return page;
}

function withAuth(browser) {
  const newContext = browser.newContext.bind(browser);
  browser.fijlyDb = emulator.createDb(qaUsers);
  browser.newContext = async (options = {}) => {
    const { fijlyAuth = 'auto', ...rest } = options;
    const context = await newContext(rest);
    await installSupabaseMock(context, fijlyAuth, browser.fijlyDb);
    const newPage = context.newPage.bind(context);
    context.newPage = async (...args) => settleAuth(await newPage(...args));
    return context;
  };
  browser.newPage = async (options = {}) => {
    const context = await browser.newContext(options), page = await context.newPage();
    page.on('close', () => context.close().catch(() => {}));
    return page;
  };
  return browser;
}
const chromium = Object.create(playwright.chromium);
chromium.launch = async (...args) => withAuth(await playwright.chromium.launch(...args));

module.exports = {...playwright, chromium, qaUsers, qaSession: session, SUPABASE, STORAGE_KEY, base: process.env.QA_BASE_URL || `http://localhost:${process.env.QA_PORT || 8766}/`, widths: [1440,1024,768,390,320], routes: {studio:['overview','projects','requests','assets','scripts','analytics','settings'],admin:['dashboard','orders','clients','requests','videos','revisions','assets','scripts','analytics','settings']}};
