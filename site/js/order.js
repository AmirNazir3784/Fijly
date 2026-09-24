/* Order page (order.html): video details, then review. The customer signs up
   (or in) first on the landing page; without a session this page sends them
   back to the sign-up form. Orders are saved to the Supabase `orders` table
   for the studio to process, with the name and email of the signed-in
   account. Payment is not connected yet; the Pay button is a placeholder.

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

   The database also checks that the price matches the length
   (check_order_price), so these prices must stay in step with it. */
(function () {
  'use strict';
  var PRICES = { 30: 300, 60: 500, 90: 700, 120: 950 };
  var CONTACT_EMAIL = 'hello@fijly.com';
  var SIGN_UP = 'index.html#contact';
  var card = document.getElementById('order-card');
  var form = document.getElementById('order-form');
  var steps = form.querySelectorAll('[data-step]');
  var progress = document.querySelectorAll('[data-progress]');
  var success = document.getElementById('order-success');
  var submit = document.getElementById('order-submit');
  var submitLabel = document.getElementById('order-submit-label');
  var errorBox = document.getElementById('order-error');
  var honeypot = document.getElementById('order-hp');
  var baseTitle = document.title;
  var current = 1, pending = false, done = false, db = null;
  var account = { name: '', email: '' };

  function money(amount) { return '$' + amount.toLocaleString('en-US'); }
  function field(name) { return form.elements.namedItem(name); }
  function values() {
    var duration = Number((form.querySelector('input[name="duration"]:checked') || {}).value) || null;
    return {
      videoType: field('videoType').value, duration: duration, price: duration ? PRICES[duration] : null,
      company: field('company').value.trim(), brief: field('brief').value.trim(),
      name: account.name, email: account.email
    };
  }

  /* Validation: messages show under each field, not as browser bubbles. -- */
  var messages = {
    videoType: { valueMissing: 'Choose a video type.' },
    duration: { valueMissing: 'Choose a video length.' },
    company: { valueMissing: 'Enter your company name.' },
    brief: { valueMissing: 'Tell us about your project.', tooShort: 'Please add at least 20 characters about your project.' }
  };
  function controls(step) {
    return Array.prototype.filter.call(steps[step - 1].querySelectorAll('input, select, textarea'), function (control) {
      return control !== honeypot && !(control.type === 'radio' && control !== field('duration')[0]);
    });
  }
  function errorFor(control) { return document.getElementById(control.type === 'radio' ? 'order-duration-error' : control.id + '-error'); }
  function problem(control) {
    if (control.type !== 'radio') control.value = control.value.replace(/^\s+|\s+$/g, '');
    var name = control.name, validity = control.validity;
    // minlength is only enforced for typed text, so check lengths directly.
    if (validity.valueMissing) return messages[name].valueMissing;
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
  form.addEventListener('change', function (event) { if (event.target.name === 'duration') mark(event.target, ''); });

  /* Steps: the URL hash (#step-1, #step-2) keeps the browser's Back button working. */
  function stepFromHash() { var match = /^#step-([12])$/.exec(location.hash); return match ? Number(match[1]) : 1; }
  function show(step, focus) {
    // The review opens only once the video details are complete.
    if (step === 2 && !validate(1, false)) { step = 1; history.replaceState(null, '', '#step-1'); }
    current = step;
    steps.forEach(function (section) { section.hidden = Number(section.dataset.step) !== step; });
    progress.forEach(function (item) {
      var n = Number(item.dataset.progress);
      item.classList.toggle('is-done', n < step);
      if (n === step) item.setAttribute('aria-current', 'step'); else item.removeAttribute('aria-current');
    });
    if (step === 2) summarize();
    errorBox.hidden = true;
    document.title = (step === 1 ? '' : 'Review — ') + baseTitle;
    if (focus) {
      document.getElementById('step-' + step + '-title').focus({ preventScroll: true });
      card.scrollIntoView({ block: 'start' });
    }
  }
  function goTo(step) { if (location.hash === '#step-' + step) show(step, true); else location.hash = '#step-' + step; }
  form.addEventListener('click', function (event) {
    var next = event.target.closest('[data-next]'), back = event.target.closest('[data-back]');
    if (next && validate(current, true)) goTo(Number(next.dataset.next));
    if (back) goTo(Number(back.dataset.back));
  });
  window.addEventListener('hashchange', function () { if (!done && card.dataset.state === 'ready') show(stepFromHash(), true); });

  /* Review: the price appears only here. ----------------------------------- */
  function summarize() {
    var v = values();
    document.getElementById('summary-item').textContent = v.videoType + ' · ' + v.duration + ' seconds';
    document.getElementById('summary-company').textContent = v.company;
    document.getElementById('summary-brief').textContent = '“' + (v.brief.length > 180 ? v.brief.slice(0, 177).trim() + '…' : v.brief) + '”';
    document.getElementById('summary-account').textContent = (v.name ? v.name + ' · ' : '') + v.email;
    document.getElementById('summary-total').textContent = money(v.price);
    document.getElementById('order-pay-amount').textContent = money(v.price);
  }

  /* Submit ---------------------------------------------------------------- */
  function setBusy(on) {
    pending = on;
    submit.disabled = on;
    submit.setAttribute('aria-busy', String(on));
    submitLabel.textContent = on ? 'Submitting your brief…' : 'Submit brief';
  }
  function fail(v) {
    var body = ['Video: ' + v.videoType + ', ' + v.duration + ' seconds (' + money(v.price) + ')', 'Company: ' + v.company,
      'Name: ' + v.name, 'Email: ' + v.email, '', v.brief].join('\n');
    var link = document.createElement('a');
    link.href = 'mailto:' + CONTACT_EMAIL + '?subject=' + encodeURIComponent('FIJLY video order — ' + v.company) + '&body=' + encodeURIComponent(body);
    link.textContent = 'email your order to ' + CONTACT_EMAIL;
    errorBox.replaceChildren(document.createTextNode('We couldn’t submit your order. Check your connection and try again, or '), link, document.createTextNode('.'));
    errorBox.hidden = false;
  }
  function finish(v) {
    done = true;
    form.hidden = true;
    document.getElementById('order-progress').hidden = true;
    document.getElementById('order-success-text').textContent = 'We’ll review your brief and email ' + v.email + ' to confirm the details and send your invoice.';
    document.getElementById('order-success-summary').textContent = 'Your order: ' + v.videoType + ' · ' + v.duration + ' seconds · ' + money(v.price) + ' for ' + v.company + '.';
    success.hidden = false;
    history.replaceState(null, '', location.pathname + location.search);
    document.title = 'Order received — ' + baseTitle;
    document.getElementById('order-success-title').focus();
  }
  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (pending || done) return;
    if (!validate(1, false)) { goTo(1); validate(1, true); return; }
    var v = values();
    // A bot filled the hidden field: show success without saving anything.
    if (honeypot.value) { finish(v); return; }
    errorBox.hidden = true;
    setBusy(true);
    try {
      // Insert only: customers can't read orders back (admins process them).
      var saved = await db.from('orders').insert({ name: v.name || v.email, email: v.email, company: v.company, video_type: v.videoType,
        duration: v.duration + ' seconds', price: v.price, brief: v.brief });
      if (saved.error) throw saved.error;
      finish(v);
    } catch (_) {
      fail(v); // The alert is announced; the brief stays in the form.
    } finally { setBusy(false); }
  });

  document.getElementById('order-signout').addEventListener('click', async function () {
    await signOut({ redirect: false });
    window.location.replace('index.html');
  });

  /* Start: signed in? Then pre-fill and open the step in the URL. --------- */
  async function start() {
    db = initSupabase();
    var session = null;
    // A confirmation or Google sign-in link lands here; the SDK reads it from the URL first.
    try { session = db && (await db.auth.getSession()).data.session; } catch (_) { session = null; }
    if (!session) { window.location.replace(SIGN_UP); return; }
    account.email = session.user.email || '';
    account.name = (session.user.user_metadata && session.user.user_metadata.full_name) || '';
    try {
      var profile = await getUserProfile();
      if (profile) {
        account.name = profile.full_name || account.name;
        // An existing client's company comes from their workspace.
        if (profile.client_id) {
          var workspace = await db.from('clients').select('name').eq('id', profile.client_id).maybeSingle();
          if (workspace.data && workspace.data.name && !field('company').value) field('company').value = workspace.data.name;
        }
      }
    } catch (_) { /* The order still works with the session's details. */ }
    document.getElementById('order-account-email').textContent = account.email;
    document.getElementById('order-account').hidden = false;
    var params = new URLSearchParams(location.search);
    var preset = form.querySelector('input[name="duration"][value="' + (PRICES[params.get('duration')] ? params.get('duration') : '') + '"]');
    if (preset) preset.checked = true;
    card.dataset.state = 'ready';
    show(stepFromHash(), false);
  }
  start();
})();
