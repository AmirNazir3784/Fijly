/* Portal auth guard. Loaded after supabase-client.js and before the portal
   scripts. The #auth-loading overlay covers the (inert) portal until the
   session and profile are confirmed and the portal's data has loaded from
   Supabase (FijlyData). A failed check redirects before it lifts. The Client
   portal needs a workspace linked to the account (profiles.client_id). */
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

  // A Client-portal account with no linked workspace (or an admin opening the
  // Client portal) sees a short explanation instead of an empty portal.
  function noWorkspace(role) {
    if (!overlay) return;
    var inner = overlay.querySelector('.auth-loading__inner');
    var box = document.createElement('div'); box.className = 'no-workspace-message';
    var heading = document.createElement('h2'); heading.className = 'auth-loading__title';
    var text = document.createElement('p'); text.className = 'auth-loading__text';
    var actions = document.createElement('div'); actions.className = 'auth-loading__actions';
    var out = document.createElement('button'); out.type = 'button'; out.className = 'btn btn-outline btn--md'; out.dataset.signOut = ''; out.innerHTML = '<span class="sidebar-signout__label">Sign out</span>';
    if (role === 'admin') {
      heading.textContent = 'This is the Client portal';
      text.textContent = 'You are signed in as a studio admin. Clients see their workspace here when they sign in; manage every client from the Admin portal.';
      var adminLink = document.createElement('a'); adminLink.className = 'btn btn-primary btn--md'; adminLink.href = 'admin.html'; adminLink.textContent = 'Open the Admin portal';
      actions.append(adminLink, out);
    } else {
      heading.textContent = 'Welcome to FIJLY Studio';
      text.textContent = 'Your workspace is being set up. Contact the FIJLY team if you need access.';
      actions.append(out);
    }
    var back = document.createElement('a'); back.className = 'auth-loading__back'; back.href = 'index.html'; back.textContent = '← Back to fijly.com';
    box.append(heading, text, actions, back);
    overlay.setAttribute('role', 'region'); overlay.setAttribute('aria-label', heading.textContent);
    // The portal stays closed, so its skip link would lead nowhere.
    var skip = document.querySelector('.skip-link'); if (skip) skip.hidden = true;
    inner.replaceChildren(box);
    wireSignOut();
    heading.tabIndex = -1; heading.focus();
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
    if (!admin && !window.FIJLY_AUTH.clientId) { noWorkspace(profile.role); return null; }
    try { await withTimeout(window.FijlyData.load()); }
    catch (_) { fail('We couldn’t load your studio data. Check your connection and try again.'); return null; }
    wireSignOut();
    if (layout) layout.inert = false;
    if (overlay) overlay.remove();
    window.dispatchEvent(new CustomEvent('fijly:auth', { detail: window.FIJLY_AUTH }));
    return profile;
  })();
})();
