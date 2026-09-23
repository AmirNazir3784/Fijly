/* Order configurator (order.html): video, account, review. Orders are saved
   to the Supabase `orders` table for the studio to process. Payment is not
   connected yet; the Pay button is a placeholder.

   Accounts: public sign-up is disabled in Supabase, so for now the studio
   creates each client's account and workspace from the order, and the form
   sends no sign-up request (the password stays in the browser). Once sign-up
   is safely enabled (the new-user trigger must stop copying `role` from
   sign-up metadata), set window.FIJLY_SELF_SIGNUP = true before this script
   and the customer's chosen password becomes their login. Sign-up sends the
   name only, never a role. The password is never saved with the order.

   The orders table (already created in Supabase), for reference:

     CREATE TABLE public.orders (
       id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
       name text NOT NULL,
       email text NOT NULL,
       company text NOT NULL,
       video_type text NOT NULL,
       duration text NOT NULL,
       price integer NOT NULL,
       brief text,
       status text DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'processing', 'completed', 'cancelled')),
       payment_intent_id text,
       created_at timestamptz DEFAULT now()
     );
     ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
     CREATE POLICY "Anyone can create orders" ON public.orders FOR INSERT WITH CHECK (true);
     CREATE POLICY "Admins read all orders" ON public.orders FOR SELECT USING (public.get_user_role() = 'admin');
     CREATE POLICY "Admins update orders" ON public.orders FOR UPDATE USING (public.get_user_role() = 'admin');

   The price comes from this page, so the Admin Orders screen flags any order
   whose price doesn't match its length. */
(function () {
  'use strict';
  var PRICES = { 30: 300, 60: 500, 90: 700, 120: 950 };
  var CONTACT_EMAIL = 'hello@fijly.com';
  var SELF_SIGNUP = window.FIJLY_SELF_SIGNUP === true;
  var form = document.getElementById('order-form');
  var steps = form.querySelectorAll('[data-step]');
  var progress = document.querySelectorAll('[data-progress]');
  var success = document.getElementById('order-success');
  var submit = document.getElementById('order-submit');
  var submitLabel = document.getElementById('order-submit-label');
  var errorBox = document.getElementById('order-error');
  var password = document.getElementById('order-password');
  var honeypot = document.getElementById('order-hp');
  var baseTitle = document.title;
  var current = 1, pending = false, done = false;

  function money(amount) { return '$' + amount.toLocaleString('en-US'); }
  function field(name) { return form.elements.namedItem(name); }
  function values() {
    var duration = Number((form.querySelector('input[name="duration"]:checked') || {}).value) || null;
    return {
      videoType: field('videoType').value, duration: duration, price: duration ? PRICES[duration] : null,
      company: field('company').value.trim(), brief: field('brief').value.trim(),
      name: field('name').value.trim(), email: field('email').value.trim(), password: password.value
    };
  }

  /* Validation: messages show under each field, not as browser bubbles. -- */
  var messages = {
    videoType: { valueMissing: 'Choose a video type.' },
    duration: { valueMissing: 'Choose a video length.' },
    company: { valueMissing: 'Enter your company name.' },
    brief: { valueMissing: 'Tell us about your project.', tooShort: 'Please add at least 20 characters about your project.' },
    name: { valueMissing: 'Enter your full name.' },
    email: { valueMissing: 'Enter your work email.', typeMismatch: 'Enter a valid email address, like you@company.com.' },
    password: { valueMissing: 'Choose a password.', tooShort: 'Use at least 8 characters.' }
  };
  function controls(step) {
    return Array.prototype.filter.call(steps[step - 1].querySelectorAll('input, select, textarea'), function (control) {
      return control !== honeypot && !(control.type === 'radio' && control !== field('duration')[0]);
    });
  }
  function errorFor(control) { return document.getElementById(control.type === 'radio' ? 'order-duration-error' : control.id + '-error'); }
  function problem(control) {
    if (control.type !== 'password' && control.type !== 'radio') control.value = control.value.replace(/^\s+|\s+$/g, '');
    var name = control.name, validity = control.validity;
    // minlength is only enforced for typed text, so check lengths directly.
    if (validity.valueMissing) return messages[name].valueMissing;
    if (validity.typeMismatch) return messages[name].typeMismatch;
    if (control.minLength > 0 && control.value.length < control.minLength) return messages[name].tooShort;
    return '';
  }
  function mark(control, message) {
    var target = control.type === 'radio' ? control.closest('fieldset') : control;
    errorFor(control).textContent = message;
    if (message) target.setAttribute('aria-invalid', 'true'); else target.removeAttribute('aria-invalid');
  }
  // Checks a step; with `show`, reports problems and focuses the first one.
  function validate(step, show) {
    var first = null;
    controls(step).forEach(function (control) {
      var message = problem(control);
      if (show) mark(control, message);
      if (message && !first) first = control;
    });
    if (first && show) first.focus();
    return !first;
  }
  form.addEventListener('input', function (event) { if (event.target.name && errorFor(event.target)) mark(event.target, ''); });
  form.addEventListener('change', function (event) { if (event.target.name === 'duration') { mark(event.target, ''); highlight(); } });

  /* Steps: the URL hash (#step-1..3) keeps the browser's Back button working. */
  function stepFromHash() { var match = /^#step-([123])$/.exec(location.hash); return match ? Number(match[1]) : 1; }
  function show(step, focus) {
    // Later steps open only once the earlier ones are complete.
    for (var earlier = 1; earlier < step; earlier += 1) if (!validate(earlier, false)) { step = earlier; history.replaceState(null, '', '#step-' + step); break; }
    current = step;
    steps.forEach(function (section) { section.hidden = Number(section.dataset.step) !== step; });
    progress.forEach(function (item) {
      var n = Number(item.dataset.progress);
      item.classList.toggle('is-done', n < step);
      if (n === step) item.setAttribute('aria-current', 'step'); else item.removeAttribute('aria-current');
    });
    if (step === 3) summarize();
    errorBox.hidden = true;
    document.title = (step === 1 ? '' : 'Step ' + step + ' of 3 — ') + baseTitle;
    if (focus) {
      document.getElementById('step-' + step + '-title').focus({ preventScroll: true });
      document.querySelector('.order__card').scrollIntoView({ block: 'start' });
    }
  }
  function goTo(step) { if (location.hash === '#step-' + step) show(step, true); else location.hash = '#step-' + step; }
  form.addEventListener('click', function (event) {
    var next = event.target.closest('[data-next]'), back = event.target.closest('[data-back]');
    if (next && validate(current, true)) goTo(Number(next.dataset.next));
    if (back) goTo(Number(back.dataset.back));
  });
  window.addEventListener('hashchange', function () { if (!done) show(stepFromHash(), true); });

  /* Price reference and review ------------------------------------------- */
  function highlight() {
    var duration = values().duration;
    document.querySelectorAll('.order__prices [data-duration]').forEach(function (item) {
      item.classList.toggle('is-selected', Number(item.dataset.duration) === duration);
    });
  }
  function summarize() {
    var v = values();
    document.getElementById('summary-item').textContent = v.videoType + ' · ' + v.duration + ' seconds';
    document.getElementById('summary-company').textContent = v.company;
    document.getElementById('summary-account').textContent = v.name + ' · ' + v.email;
    document.getElementById('summary-brief').textContent = '“' + (v.brief.length > 180 ? v.brief.slice(0, 177).trim() + '…' : v.brief) + '”';
    document.getElementById('summary-total').textContent = money(v.price);
    document.getElementById('order-pay-amount').textContent = money(v.price);
  }

  var toggle = document.getElementById('order-toggle');
  toggle.addEventListener('click', function () {
    var reveal = password.type === 'password';
    password.type = reveal ? 'text' : 'password';
    toggle.textContent = reveal ? 'Hide' : 'Show';
    toggle.setAttribute('aria-pressed', String(reveal));
    toggle.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
  });

  /* Submit ---------------------------------------------------------------- */
  // Tries to create the Supabase account. Returns how the customer signs in:
  // 'manual' (the studio creates it), 'confirm', 'existing' or 'signed-in'.
  async function createAccount(db, v) {
    if (!SELF_SIGNUP) return 'manual';
    try {
      var result = await db.auth.signUp({ email: v.email, password: v.password,
        options: { data: { full_name: v.name }, emailRedirectTo: new URL('login.html', location.href).href } });
      if (result.error || !result.data || !result.data.user) return 'manual';
      // An already-registered email comes back as a user with no identities.
      if (Array.isArray(result.data.user.identities) && !result.data.user.identities.length) return 'existing';
      return result.data.session ? 'signed-in' : 'confirm';
    } catch (_) { return 'manual'; }
  }
  function setBusy(on) {
    pending = on;
    submit.disabled = on;
    submit.setAttribute('aria-busy', String(on));
    submitLabel.textContent = on ? 'Submitting your order…' : 'Create account & submit brief';
  }
  function fail(v) {
    var brief = ['Video: ' + v.videoType + ', ' + v.duration + ' seconds (' + money(v.price) + ')', 'Company: ' + v.company,
      'Name: ' + v.name, 'Email: ' + v.email, '', v.brief].join('\n');
    var link = document.createElement('a');
    link.href = 'mailto:' + CONTACT_EMAIL + '?subject=' + encodeURIComponent('FIJLY video order — ' + v.company) + '&body=' + encodeURIComponent(brief);
    link.textContent = 'email your order to ' + CONTACT_EMAIL;
    errorBox.replaceChildren(document.createTextNode('We couldn’t submit your order. Check your connection and try again, or '), link, document.createTextNode('.'));
    errorBox.hidden = false;
  }
  function finish(account, v) {
    done = true;
    var text = {
      manual: 'We’ll create your FIJLY Studio account and email your login details to ' + v.email + ' within 24 hours.',
      confirm: 'Your FIJLY Studio account is created. Check ' + v.email + ' for a confirmation link, then sign in. We’ll set up your workspace once we’ve reviewed your brief.',
      existing: v.email + ' already has a FIJLY Studio account. Sign in with your existing password; we’ll add this order to your workspace.',
      'signed-in': 'Your FIJLY Studio account is ready. Opening your workspace…'
    }[account];
    form.hidden = true;
    document.getElementById('order-progress').hidden = true;
    document.getElementById('order-success-text').textContent = text;
    document.getElementById('order-success-summary').textContent = 'Your order: ' + v.videoType + ' · ' + v.duration + ' seconds · ' + money(v.price) + ' for ' + v.company + '. We’ll be in touch about your invoice.';
    success.hidden = false;
    password.value = '';
    history.replaceState(null, '', location.pathname + location.search);
    document.title = 'Order received — ' + baseTitle;
    document.getElementById('order-success-title').focus();
    if (account === 'signed-in') setTimeout(function () { window.location.replace('studio.html'); }, 2000);
  }
  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (pending || done) return;
    for (var step = 1; step <= 2; step += 1) if (!validate(step, false)) { goTo(step); validate(step, true); return; }
    var v = values();
    // A bot filled the hidden field: show success without saving anything.
    if (honeypot.value) { finish('manual', v); return; }
    errorBox.hidden = true;
    setBusy(true);
    try {
      var db = initSupabase();
      if (!db) throw new Error('Supabase SDK not loaded');
      // Insert only: anonymous visitors can't read orders back.
      var saved = await db.from('orders').insert({ name: v.name, email: v.email, company: v.company, video_type: v.videoType,
        duration: v.duration + ' seconds', price: v.price, brief: v.brief });
      if (saved.error) throw saved.error;
      finish(await createAccount(db, v), v);
    } catch (_) {
      fail(v); // The alert is announced; the brief stays in the form.
    } finally { setBusy(false); }
  });

  /* Start: pre-select ?duration= and open the step in the URL. ----------- */
  var params = new URLSearchParams(location.search);
  var preset = form.querySelector('input[name="duration"][value="' + (PRICES[params.get('duration')] ? params.get('duration') : '') + '"]');
  if (preset) preset.checked = true;
  highlight();
  show(stepFromHash(), false);
})();
