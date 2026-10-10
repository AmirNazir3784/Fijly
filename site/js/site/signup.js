/* Create account — the second tab on login.html. Creates a FIJLY Studio
   account with Supabase Auth, then continues to /order for the video
   details. The sign-in half of the page lives in login.html's inline script;
   this file only owns the create-account form.

   While public sign-up is disabled in Supabase, the request is saved to
   `contact_submissions` (project_type "Account request") so the studio can
   create the account by hand; the password is never saved. Once sign-up is
   enabled, accounts are created here directly (with email confirmation, the
   link in the email returns the customer to /order). */
(function () {
  'use strict';
  var config = window.FIJLY_CONFIG || {};
  var contactEmail = config.contactEmail || 'hello@fijly.com';
  var form = document.getElementById('signup-form');
  if (!form) return;
  var submit = document.getElementById('signup-submit');
  var submitLabel = submit.innerHTML;
  var status = document.getElementById('signup-status');
  var password = document.getElementById('signup-password');
  var toggle = form.querySelector('.password-toggle');
  var honeypot = document.getElementById('fijly-hp');
  var google = document.getElementById('google-signin');
  var googleNote = document.getElementById('google-signin-note');
  var pending = false;
  submit.disabled = false;

  // The length picked on a pricing card arrives as ?duration= and is handed on
  // to the wizard, so the customer does not choose it twice.
  var chosen = (new URLSearchParams(location.search).get('duration') || '').replace(/[^0-9]/g, '') || null;
  function orderUrl() { return location.origin + '/order' + (chosen ? '?duration=' + encodeURIComponent(chosen) : ''); }

  function link(href, text) { var a = document.createElement('a'); a.href = href; a.textContent = text; return a; }
  function say(parts, isError) {
    status.className = isError ? 'login__error' : 'login__ok';
    status.replaceChildren.apply(status, parts.map(function (part) { return typeof part === 'string' ? document.createTextNode(part) : part; }));
    status.hidden = false;
    status.focus({ preventScroll: true });
  }
  function setBusy(on) {
    pending = on;
    submit.disabled = on;
    if (on) submit.textContent = 'Creating your account…'; else submit.innerHTML = submitLabel;
  }
  function done(kind, name, email) {
    form.reset();
    ({
      pending: function () { say(['Thanks, ' + name + '. We’ve received your request. We’ll create your FIJLY Studio account and email your login details to ' + email + ' within 24 hours.']); },
      confirm: function () { say(['Check your email — we sent a confirmation link to ' + email + '. Click it to continue to your video details.']); },
      // Already registered: hand the visitor to the Sign in tab, email filled in.
      exists: function () {
        status.hidden = true;
        if (window.FijlyAccount && window.FijlyAccount.showSignIn) window.FijlyAccount.showSignIn(email);
        else say([email + ' already has a FIJLY Studio account. ', link('/login', 'Sign in to continue'), '.']);
      }
    })[kind]();
  }
  function problem(error) {
    var text = String((error && error.message) || '').toLowerCase(), code = error && (error.code || error.error_code);
    if (code === 'weak_password' || /password/.test(text)) return ['Choose a stronger password with at least 8 characters.'];
    if (code === 'email_address_invalid' || /invalid.*email|email.*invalid/.test(text)) return ['Enter a valid work email address.'];
    if ((error && error.status === 429) || /rate limit|too many/.test(text)) return ['Too many attempts. Wait a minute, then try again.'];
    if (/fetch|network|load failed/.test(text) || /sdk not loaded/.test(text)) return ['We couldn’t reach the sign-up service. Check your connection and try again, or email ', link('mailto:' + contactEmail, contactEmail), '.'];
    return ['Sign-up didn’t work. Please try again, or email ', link('mailto:' + contactEmail, contactEmail), '.'];
  }
  function signupDisabled(error) {
    return !!error && ((error.code || error.error_code) === 'signup_disabled' || /signups? not allowed/i.test(String(error.message || '')));
  }
  function client() {
    var db = typeof initSupabase === 'function' ? initSupabase() : null;
    if (!db) throw new Error('Supabase SDK not loaded');
    return db;
  }

  form.addEventListener('input', function (event) { if (event.target.setCustomValidity) event.target.setCustomValidity(''); });
  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (pending) return;
    var name = document.getElementById('signup-name'), email = document.getElementById('signup-email');
    name.value = name.value.trim();
    email.value = email.value.trim();
    password.setCustomValidity(password.value && password.value.length < 8 ? 'Use at least 8 characters.' : '');
    if (!form.reportValidity()) return;
    var values = { name: name.value, email: email.value };
    // A bot filled the hidden field: report success without contacting the server.
    if (honeypot && honeypot.value) { done('pending', values.name, values.email); return; }
    status.hidden = true;
    setBusy(true);
    try {
      var db = client();
      var result = await db.auth.signUp({ email: values.email, password: password.value,
        options: { data: { full_name: values.name }, emailRedirectTo: orderUrl() } });
      if (signupDisabled(result.error)) {
        // Sign-up is off: record the request for the studio (no password).
        var saved = await db.from('contact_submissions').insert({ name: values.name, email: values.email, project_type: 'Account request',
          plan: chosen ? chosen + ' seconds' : null, message: 'Account request from the website sign-up form. Video details to follow.' });
        if (saved.error) throw saved.error;
        done('pending', values.name, values.email);
      } else if (result.error) {
        throw result.error;
      } else if (result.data.user && Array.isArray(result.data.user.identities) && !result.data.user.identities.length) {
        done('exists', values.name, values.email); // Supabase's answer for an already-registered email
      } else if (result.data.session) {
        window.location.assign(orderUrl()); // Signed in: choose the video.
        return;
      } else {
        done('confirm', values.name, values.email);
      }
    } catch (error) {
      say(problem(error), true);
    }
    setBusy(false);
  });

  toggle.addEventListener('click', function () {
    var reveal = password.type === 'password';
    password.type = reveal ? 'text' : 'password';
    toggle.textContent = reveal ? 'Hide' : 'Show';
    toggle.setAttribute('aria-pressed', String(reveal));
    toggle.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
  });

  /* Google sign-in ---------------------------------------------------------- */
  if (!config.googleSignIn) {
    google.disabled = true;
    googleNote.textContent = 'Google sign-in will be available soon. Please use email for now.';
    googleNote.hidden = false;
  } else {
    google.addEventListener('click', async function () {
      googleNote.hidden = true;
      try {
        var result = await client().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: orderUrl() } });
        if (result.error) throw result.error;
      } catch (_) {
        googleNote.textContent = 'Google sign-in didn’t work. Please use email instead.';
        googleNote.hidden = false;
      }
    });
  }
})();
