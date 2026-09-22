/* Portal auth guard. Loaded after supabase-client.js and before the portal
   scripts. The #auth-loading overlay covers the (inert) portal until the
   session and profile are confirmed, and, where the page reads Supabase
   (FijlyData, the Admin portal), until its data has loaded. A failed check
   redirects before it lifts. The Client portal keeps the session mock until
   Part 3B. */
(function () {
  'use strict';
  var admin = document.body.classList.contains('admin-body');
  var overlay = document.getElementById('auth-loading');
  var layout = document.getElementById('studio');
  var TIMEOUT_MS = 15000;

  function domReady() {
    return new Promise(function (resolve) {
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', resolve, { once: true });
      else resolve();
    });
  }

  function withTimeout(promise) {
    return Promise.race([promise, new Promise(function (_, reject) {
      setTimeout(function () { reject(new Error('Session check timed out')); }, TIMEOUT_MS);
    })]);
  }

  // Keep the portal hidden and offer a way forward instead of a stuck spinner.
  function fail(message) {
    if (!overlay) return;
    var inner = overlay.querySelector('.auth-loading__inner');
    var text = document.createElement('p'); text.className = 'auth-loading__text'; text.textContent = message;
    var actions = document.createElement('div'); actions.className = 'auth-loading__actions';
    var retry = document.createElement('button'); retry.type = 'button'; retry.className = 'btn btn-primary btn--md'; retry.textContent = 'Try again';
    retry.addEventListener('click', function () { window.location.reload(); });
    var login = document.createElement('a'); login.className = 'btn btn-outline btn--md'; login.href = 'login.html'; login.textContent = 'Go to sign in';
    actions.append(retry, login);
    inner.replaceChildren(text, actions);
    retry.focus();
  }

  // The mock profile (Settings name/email, client contact) becomes the signed-in
  // account once per tab session, so later mock edits in this tab still stick.
  function seedIdentity(profile) {
    if (window.FijlyData) return; // Identity already comes from the database.
    var api = window.FijlyMock, key = 'fijly-auth-seeded-' + (admin ? 'admin' : 'client');
    if (!api) return;
    try { if (sessionStorage.getItem(key) === profile.id) return; } catch (_) {}
    try {
      if (admin) {
        var patch = {};
        if (profile.full_name) patch.adminName = profile.full_name;
        if (profile.email) patch.adminEmail = profile.email;
        api.saveSettings(patch);
      } else if (profile.role === 'client' && api.client.current()) {
        var record = api.client.current();
        api.client.saveProfile(Object.assign({}, record, api.client.preferences(), {
          contact: profile.full_name || record.contact, email: profile.email || record.email
        }));
      }
      try { sessionStorage.setItem(key, profile.id); } catch (_) {}
    } catch (_) { /* Mock validation must never block the portal. */ }
  }

  function wireSignOut() {
    document.querySelectorAll('[data-sign-out]').forEach(function (button) {
      button.addEventListener('click', async function () {
        var label = button.querySelector('.sidebar-signout__label');
        button.disabled = true; label.textContent = 'Signing out…';
        var result = await signOut();
        if (result.error) { button.disabled = false; label.textContent = 'Sign out'; }
      });
    });
  }

  window.FijlyAuthReady = (async function () {
    if (!initSupabase()) {
      await domReady();
      fail('We couldn’t load the sign-in service. Check your connection and try again.');
      return null;
    }
    var profile;
    try { profile = await withTimeout(requireAuth(admin ? ['admin'] : ['admin', 'client'])); }
    catch (_) {
      await domReady();
      fail('We couldn’t verify your session. Check your connection and try again.');
      return null;
    }
    if (!profile) return null; // Redirecting to sign in or the right portal.

    window.FIJLY_AUTH = {
      userId: profile.id,
      role: profile.role,
      clientId: profile.role === 'client' ? profile.client_id || null : null,
      fullName: profile.full_name,
      email: profile.email
    };
    onAuthStateChange();

    await domReady(); // Portal scripts and the data store have initialised.
    if (window.FijlyData) {
      try { await withTimeout(window.FijlyData.load()); }
      catch (_) { fail('We couldn’t load your studio data. Check your connection and try again.'); return null; }
    }
    seedIdentity(profile);
    wireSignOut();
    if (layout) layout.inert = false;
    if (overlay) overlay.remove();
    window.dispatchEvent(new CustomEvent('fijly:auth', { detail: window.FIJLY_AUTH }));
    return profile;
  })();
})();
