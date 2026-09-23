/* Project briefs and concept previews. Briefs are saved to Supabase
   (contact_submissions) with the SDK loaded in <head>; if that fails, the
   form offers the brief as an email draft instead. */
(function () {
  'use strict';
  var config = window.FIJLY_CONFIG || {};
  var form = document.getElementById('contact-form');
  var status = document.getElementById('contact-status');
  var submit = form.querySelector('[type="submit"]');
  var backend = !!(config.supabaseUrl && config.supabaseAnonKey);
  var db = null;
  var email = config.contactEmail || 'hello@fijly.com';
  var pending = false;
  var honeypot = document.getElementById('fijly-hp');
  submit.disabled = false;
  // One anonymous client, created on first send. It keeps no session, so it
  // never touches a Studio sign-in in the same browser.
  function database() {
    if (!db && window.supabase && window.supabase.createClient) {
      db = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    }
    if (!db) throw new Error('Supabase SDK not loaded');
    return db;
  }
  function showSuccess() {
    status.hidden = false;
    status.textContent = 'Your project brief has been sent. Thank you for getting in touch.';
    form.reset();
    document.getElementById('contact-plan-note').hidden = true;
  }
  // Prevent an accidental page submission if JavaScript is unavailable.
  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (pending) return;
    form.querySelectorAll('input:not([type="hidden"]), textarea').forEach(function (field) {
      field.value = field.value.trim();
    });
    var message = document.getElementById('contact-message');
    message.setCustomValidity(message.value.length < 20 ? 'Please add at least 20 characters about your project.' : '');
    if (!form.reportValidity()) return;
    // A bot filled the hidden field: report success without sending anything.
    if (honeypot && honeypot.value) {
      showSuccess();
      status.focus({ preventScroll: true });
      return;
    }
    var data = new FormData(form);
    var body = ['Name: ' + data.get('name'), 'Work email: ' + data.get('email'),
      'Company: ' + (data.get('company') || 'Not provided'), 'Video type: ' + data.get('project_type'),
      'Plan: ' + (data.get('plan') || 'To discuss'), '', data.get('message')].join('\n');
    function fallback(message) {
      status.replaceChildren(document.createTextNode(message + ' '));
      var link = document.createElement('a');
      link.textContent = 'Open project email';
      link.href = 'mailto:' + email + '?subject=' + encodeURIComponent('FIJLY project brief — ' + data.get('name')) + '&body=' + encodeURIComponent(body);
      status.appendChild(link);
      status.appendChild(document.createTextNode('. If no email app opens, copy your brief and email ' + email + '.'));
    }
    status.hidden = false;
    if (!backend) {
      fallback('Your brief is ready, but has not been sent. Open the draft in your email app, review it, and send it there.');
      status.focus({ preventScroll: true });
      return;
    }
    pending = true;
    submit.disabled = true;
    submit.textContent = 'Sending…';
    status.textContent = 'Sending your project brief…';
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 15000);
    try {
      // Insert only: anonymous visitors can't read submissions back.
      var result = await database().from('contact_submissions').insert({
        name: data.get('name'), email: data.get('email'), company: data.get('company') || null,
        project_type: data.get('project_type') || null, message: data.get('message'), plan: data.get('plan') || null
      }).abortSignal(controller.signal);
      if (result.error) throw result.error;
      showSuccess();
    } catch (error) {
      fallback('We could not confirm delivery. Your brief is still here; you can send it by email.');
    } finally {
      clearTimeout(timeout);
      pending = false;
      submit.disabled = false;
      submit.textContent = 'Start Your Video';
      status.focus({ preventScroll: true });
    }
  });
  document.getElementById('contact-message').addEventListener('input', function () { this.setCustomValidity(''); });
  if (backend) {
    submit.textContent = 'Start Your Video';
    document.getElementById('contact-help').textContent = 'Tell us a little about your product, audience, and goal.';
    form.querySelector('.contact-form__privacy').firstChild.textContent = 'Submitting shares these details with FIJLY to discuss your project. ';
  }
  document.querySelectorAll('[data-plan], [data-service]').forEach(function (link) {
    link.addEventListener('click', function () {
      if (link.dataset.plan) {
        document.getElementById('contact-plan').value = link.dataset.plan;
        var note = document.getElementById('contact-plan-note');
        note.textContent = 'Plan of interest: ' + link.dataset.plan + ' — we can confirm the fit together.';
        note.hidden = false;
        if (link.dataset.plan !== 'Single') document.getElementById('contact-type').value = 'Recurring video production';
      }
      if (link.dataset.service) document.getElementById('contact-type').value = link.dataset.service;
    });
  });
  // Native dialog provides modal focus containment, Escape, and focus restoration.
  var dialog = document.getElementById('concept-dialog');
  var concepts = {
    aiflow: ['AIFlow — Launch film', 'A product-led launch direction: introduce the AI assistant, show its interface, and make the support workflow easy to follow.'],
    clouddesk: ['CloudDesk — Homepage', 'A workspace story built around clarity: connect the brief, active work, and final review in one visual sequence.'],
    finly: ['Finly — Tutorial series', 'A guided onboarding direction: one task at a time, a visible next step, and a clear completion state.']
  };
  document.querySelectorAll('[data-concept]').forEach(function (button) {
    button.addEventListener('click', function () {
      var key = button.dataset.concept;
      document.getElementById('concept-title').textContent = concepts[key][0];
      document.getElementById('concept-description').textContent = concepts[key][1];
      var img = document.getElementById('concept-image');
      img.src = 'assets/concept-' + key + '.svg';
      img.alt = concepts[key][0] + ' — designed product interface concept';
      dialog.showModal();
      document.body.classList.add('concept-open');
    });
  });
  dialog.querySelector('.concept-dialog__close').addEventListener('click', function () { dialog.close(); });
  dialog.addEventListener('click', function (event) { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', function () { document.body.classList.remove('concept-open'); });
  dialog.querySelector('[data-close-concept]').addEventListener('click', function () {
    dialog.close();
    document.getElementById('contact').focus({ preventScroll: true });
  });
})();
