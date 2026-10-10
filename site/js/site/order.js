/* Project wizard (order.html). The customer signs up (or in) on the landing
   page first; without a session this page sends them back to the sign-up form.

   Four steps, then the payment step:
     1. Project basics   — calls ensure_client_workspace() and keeps client_id.
     2. Look & feel      — purpose, audience, style, references, brand, uploads.
     3. Brief, script & voice over — the brief document, then the two choices.
     4. Review & submit  — calls submit_project().

   A project has to tell us what the video should say, so step 3 needs either a
   brief document or the client's own script. submit_project() insists on a
   brief link or a brief file, so when only a script is supplied its storage
   path is sent as the brief file: that script IS the brief for that project.

   The browser never calculates the price that gets charged. The breakdown on
   screen is read from public.pricing (readable by anyone) purely to show the
   customer what to expect; submit_project() prices the project server-side and
   creates the three milestone payment rows (15% / 45% / 40%). The amounts on
   the payment step are read back from public.payments, so they are the saved
   figures rather than anything computed here.

   Payments are manual for now: we email a PayPal invoice. FIJLY_CONFIG
   .paypalEnabled is false and no PayPal code is loaded, so the Pay with PayPal
   button on the payment step is disabled in the markup. Wiring it up is the
   job of the task that turns that flag on. */
(function () {
  'use strict';
  var SIGN_UP = '/signup?next=/order';
  var CONTACT_EMAIL = (window.FIJLY_CONFIG && window.FIJLY_CONFIG.contactEmail) || 'hello@fijly.com';
  var LAST_STEP = 4;
  var BUCKET = 'client-assets', MAX_FILE_SIZE = 50 * 1024 * 1024;
  // Extension to the MIME type the file is stored as. Browsers leave some of
  // these untyped, and the bucket refuses anything outside its allowed list,
  // so every upload is retyped from its extension.
  var attachmentTypes = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp',
    pdf: 'application/pdf', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', zip: 'application/zip' };
  var briefTypes = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  var scriptTypes = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', txt: 'text/plain' };
  var voiceTypes = { mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4' };

  var card = document.getElementById('order-card');
  var form = document.getElementById('order-form');
  var steps = form.querySelectorAll('[data-step]');
  var progress = document.querySelectorAll('[data-progress]');
  var payment = document.getElementById('order-payment');
  var submit = document.getElementById('order-submit');
  var submitLabel = document.getElementById('order-submit-label');
  var errorBox = document.getElementById('order-error');
  var honeypot = document.getElementById('order-hp');
  var baseTitle = document.title;
  var current = 1, pending = false, done = false, db = null;
  var account = { name: '', email: '' };
  var clientId = null;
  // Pricing from public.pricing: { base: { 30: 300, … }, script: {…}, voice_over: {…} }.
  var pricing = null;
  // Files already in Storage, keyed by the picked file so Back never re-uploads.
  var uploaded = { attachments: null, brief: null, script: null, voice: null };

  /* Helpers ---------------------------------------------------------------- */
  function money(amount) {
    var value = Number(amount);
    if (!Number.isFinite(value)) return '—';
    return '$' + value.toLocaleString('en-US', { minimumFractionDigits: value % 1 ? 2 : 0, maximumFractionDigits: 2 });
  }
  function field(name) { return form.elements.namedItem(name); }
  function text(name) { return String(field(name).value || '').trim(); }
  function set(id, value) { document.getElementById(id).textContent = value; }
  function extensionOf(name) { var match = /\.([a-z0-9]+)$/i.exec(String(name || '')); return match ? match[1].toLowerCase() : ''; }
  function signature(file) { return file ? [file.name, file.size, file.lastModified].join('|') : ''; }
  function duration() { var picked = form.querySelector('input[name="duration"]:checked'); return picked ? Number(picked.value) : null; }
  function hasScript() { return (form.querySelector('input[name="scriptChoice"]:checked') || {}).value === 'own'; }
  function hasVoice() { return (form.querySelector('input[name="voiceChoice"]:checked') || {}).value === 'own'; }
  // 'link' or 'upload': the brief document arrives one way or the other.
  function briefIsLink() { return (form.querySelector('input[name="briefChoice"]:checked') || {}).value !== 'upload'; }
  // The brief document the client gave us, if any.
  function briefPath() { return uploaded.brief ? uploaded.brief.path : null; }
  function briefLinkValue() { return briefIsLink() ? text('briefLink') : ''; }
  function references() {
    return text('references').split(/\n/).map(function (line) { return line.trim(); }).filter(Boolean);
  }
  function badLink(value) {
    var url; try { url = new URL(value); } catch (_) { return true; }
    return !['http:', 'https:'].includes(url.protocol);
  }
  // The rounding submit_project() uses, so the schedule on screen matches the
  // rows it writes (the payment step then reads the saved amounts anyway).
  function cents(amount) { return Math.round(Number(amount) * 100) / 100; }
  function schedule(total) {
    var start = cents(total * 0.15), storyboard = cents(total * 0.45);
    return { start: start, storyboard: storyboard, final: cents(total - start - storyboard) };
  }

  /* Price breakdown: read from public.pricing, shown only ------------------ */
  function priceOf(item, seconds) {
    var row = pricing && pricing[item];
    var amount = row && row[seconds];
    return amount === undefined || amount === null ? null : Number(amount);
  }
  function breakdown() {
    var seconds = duration(), base = priceOf('base', seconds);
    if (base === null) return null;
    var script = hasScript() ? 0 : (priceOf('script', seconds) || 0);
    var voice = hasVoice() ? 0 : (priceOf('voice_over', seconds) || 0);
    return { base: base, script: script, voice: voice, total: base + script + voice };
  }
  // "Provided by you" when the customer brings their own, "Included" when the
  // list price is zero, and the amount otherwise.
  function addOnLabel(element, provided, amount) {
    var included = provided || amount === 0;
    element.textContent = provided ? 'Provided by you' : amount === 0 ? 'Included' : money(amount);
    if (included) element.dataset.included = 'true'; else delete element.dataset.included;
  }
  function renderPrices() {
    var prices = breakdown(), note = document.getElementById('order-pricing-note');
    ['line', 'review'].forEach(function (prefix) {
      var baseEl = document.getElementById(prefix + '-base');
      if (!prices) {
        [prefix + '-base', prefix + '-script', prefix + '-voice', prefix + '-total'].forEach(function (id) { set(id, '—'); });
        return;
      }
      baseEl.textContent = money(prices.base);
      addOnLabel(document.getElementById(prefix + '-script'), hasScript(), prices.script);
      addOnLabel(document.getElementById(prefix + '-voice'), hasVoice(), prices.voice);
      set(prefix + '-total', money(prices.total));
    });
    var parts = prices ? schedule(prices.total) : null;
    [['schedule', parts], ['paid', parts]].forEach(function (pair) {
      ['start', 'storyboard', 'final'].forEach(function (key) {
        set(pair[0] + '-' + key, pair[1] ? money(pair[1][key]) : '—');
      });
    });
    note.textContent = prices
      ? 'Prices come from the FIJLY price list. The amount you are invoiced is confirmed when your project is saved.'
      : 'We couldn’t load the price list. Your price is confirmed by email once your project is saved.';
  }

  /* Validation: messages show under each field, not as browser bubbles. ---- */
  var messages = {
    title: { valueMissing: 'Enter a name for this project.' },
    companyWebsite: { invalid: 'Enter the website as a full address, starting with https://' },
    videoType: { valueMissing: 'Choose a video type.' },
    duration: { valueMissing: 'Choose a video length.' },
    deliveryDate: { invalid: 'Choose a valid delivery date.' },
    purpose: { valueMissing: 'Tell us what this video should achieve.', tooShort: 'Please add at least 10 characters.' },
    references: { invalid: 'Enter complete http(s) links, one per line.' },
    // A project needs a brief document or the client's own script. Which
    // control the problem lands on depends on the card that is selected.
    briefDoc: { valueMissing: 'Add a brief or write your script so we know what the video should say.' },
    briefLink: { invalid: 'Enter the brief link as a full address, starting with https://' },
    briefFile: { invalid: 'The brief must be a PDF, DOC or DOCX file under 50MB.' },
    scriptFile: { valueMissing: 'Upload your script file.', invalid: 'Scripts must be a PDF, DOC, DOCX or TXT file under 50MB.' },
    voiceFile: { valueMissing: 'Upload your voice over file.', invalid: 'Voice overs must be an MP3, WAV or M4A file under 50MB.' },
    attachments: { invalid: 'Images, PDF, video or ZIP files under 50MB each, please.' }
  };
  // The fields each step validates, in the order their problems are reported.
  var stepFields = {
    1: ['title', 'companyWebsite', 'videoType', 'duration', 'deliveryDate'],
    2: ['purpose', 'references', 'attachments'],
    3: ['briefDoc', 'scriptFile', 'voiceFile'],
    4: []
  };
  function errorFor(name) {
    var ids = { duration: 'order-duration-error', companyWebsite: 'order-website-error', targetAudience: 'order-audience-error',
      videoType: 'order-type-error', deliveryDate: 'order-delivery-error', brandColors: 'order-colors-error', videoStyle: 'order-style-error',
      scriptFile: 'order-script-file-error', voiceFile: 'order-voice-file-error',
      briefDoc: 'order-brief-doc-error', briefLink: 'order-brief-link-error', briefFile: 'order-brief-file-error' };
    return document.getElementById(ids[name] || 'order-' + name + '-error');
  }
  function fileProblem(file, types) {
    if (file.size > MAX_FILE_SIZE) return true;
    return !types[extensionOf(file.name)];
  }
  // Returns the problem with one field as a sentence, or '' when it is fine.
  function problem(name) {
    var control = field(name), note = messages[name] || {};
    if (name === 'duration') return duration() ? '' : note.valueMissing;
    if (name === 'references') return references().some(badLink) ? note.invalid : '';
    if (name === 'attachments') return Array.from(control.files).some(function (file) { return fileProblem(file, attachmentTypes); }) ? note.invalid : '';
    // Checked as one field, so a missing brief reports once rather than twice.
    // Bringing your own script covers the same ground, so the brief is only
    // required when we are the ones writing the script.
    if (name === 'briefDoc') {
      if (briefIsLink()) {
        var link = text('briefLink');
        if (!link) return hasScript() ? '' : messages.briefDoc.valueMissing;
        return badLink(link) ? messages.briefLink.invalid : '';
      }
      var picked = field('briefFile').files[0];
      if (!picked) return (uploaded.brief || hasScript()) ? '' : messages.briefDoc.valueMissing;
      return fileProblem(picked, briefTypes) ? messages.briefFile.invalid : '';
    }
    if (name === 'scriptFile' || name === 'voiceFile') {
      var wanted = name === 'scriptFile' ? hasScript() : hasVoice();
      if (!wanted) return '';
      var types = name === 'scriptFile' ? scriptTypes : voiceTypes, chosen = control.files[0];
      var ready = name === 'scriptFile' ? uploaded.script : uploaded.voice;
      if (!chosen) return ready ? '' : note.valueMissing;
      return fileProblem(chosen, types) ? note.invalid : '';
    }
    control.value = control.value.replace(/^\s+|\s+$/g, '');
    if (control.validity.valueMissing) return note.valueMissing;
    if (!control.value) return '';
    if (control.minLength > 0 && control.value.length < control.minLength) return note.tooShort;
    if (name === 'companyWebsite') return badLink(control.value) ? note.invalid : '';
    if (!control.validity.valid) return note.invalid || 'Check this field.';
    return '';
  }
  // A radio group comes back as a RadioNodeList (no tagName of its own); a
  // select has a length too, so check for the tag rather than the length.
  function isGroup(control) { return !!control && control.length !== undefined && !control.tagName; }
  function firstControl(control) { return isGroup(control) ? control[0] : control; }
  function mark(name, message) {
    var control = field(name), note = errorFor(name);
    // The brief is one field with two controls; flag the one being used.
    if (name === 'briefDoc') control = field(briefIsLink() ? 'briefLink' : 'briefFile');
    // Problems with a group of radios belong on the fieldset that owns them.
    var target = isGroup(control) ? (firstControl(control).closest('fieldset') || firstControl(control)) : control;
    if (note) note.textContent = message;
    if (!target) return;
    if (message) target.setAttribute('aria-invalid', 'true'); else target.removeAttribute('aria-invalid');
  }
  // Checks a step; with `show`, reports every problem and focuses the first.
  function validate(step, show) {
    var first = '';
    stepFields[step].forEach(function (name) {
      var message = problem(name);
      if (show) mark(name, message);
      if (message && !first) first = name;
    });
    if (first && show) firstControl(field(first === 'briefDoc' ? (briefIsLink() ? 'briefLink' : 'briefFile') : first)).focus();
    return !first;
  }
  function clearField(name) {
    mark(name, '');
    if (['briefLink', 'briefFile', 'briefChoice', 'scriptChoice', 'scriptFile'].includes(name)) mark('briefDoc', '');
  }
  form.addEventListener('input', function (event) { if (event.target.name) clearField(event.target.name); });
  form.addEventListener('change', function (event) { if (event.target.name) clearField(event.target.name); });

  /* Script and voice over choices ----------------------------------------- */
  function syncChoices() {
    document.getElementById('order-script-upload').hidden = !hasScript();
    document.getElementById('order-voice-upload').hidden = !hasVoice();
    renderPrices();
  }
  function syncBrief() {
    var link = briefIsLink();
    document.getElementById('order-brief-link-wrap').hidden = !link;
    document.getElementById('order-brief-file-wrap').hidden = link;
  }
  form.addEventListener('change', function (event) {
    if (['scriptChoice', 'voiceChoice'].includes(event.target.name)) syncChoices();
    // The script choice feeds the brief-or-script rule, so clear its message.
    if (event.target.name === 'scriptChoice') mark('briefDoc', '');
    if (event.target.name === 'briefChoice') syncBrief();
    if (event.target.name === 'briefFile') uploaded.brief = null;
    if (event.target.name === 'duration') renderPrices();
    // A different file replaces whatever was uploaded for that slot.
    if (event.target.name === 'scriptFile') uploaded.script = null;
    if (event.target.name === 'voiceFile') uploaded.voice = null;
    if (event.target.name === 'attachments') uploaded.attachments = null;
  });

  /* File pickers: a drop zone, plus the list of what was chosen ----------- */
  function fileSize(bytes) {
    var size = bytes / 1024;
    if (size < 1024) return Math.max(1, Math.round(size)) + ' KB';
    size /= 1024;
    return (size >= 10 ? Math.round(size) : size.toFixed(1)) + ' MB';
  }
  // Rebuilds the input's FileList without the file at `index`.
  function dropFile(input, index) {
    var transfer = new DataTransfer();
    Array.from(input.files).forEach(function (file, at) { if (at !== index) transfer.items.add(file); });
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function renderFileList(input) {
    var list = document.getElementById(input.id + '-files');
    if (!list) return;
    list.replaceChildren();
    Array.from(input.files).forEach(function (file, index) {
      var row = document.createElement('li');
      var name = document.createElement('span');
      name.className = 'order__file-name';
      name.textContent = file.name;
      var size = document.createElement('span');
      size.className = 'order__file-size';
      size.textContent = fileSize(file.size);
      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'order__file-remove';
      remove.textContent = '\u00D7';
      remove.setAttribute('aria-label', 'Remove ' + file.name);
      remove.addEventListener('click', function () { dropFile(input, index); });
      row.append(name, size, remove);
      list.append(row);
    });
  }
  // Drag feedback. The input lies over the whole zone, so the browser handles
  // the drop itself and sets input.files for us.
  document.querySelectorAll('[data-drop]').forEach(function (zone) {
    var input = zone.querySelector('.order__drop-input');
    ['dragenter', 'dragover'].forEach(function (name) {
      zone.addEventListener(name, function (event) { event.preventDefault(); zone.classList.add('is-dragging'); });
    });
    ['dragleave', 'dragend', 'drop'].forEach(function (name) {
      zone.addEventListener(name, function () { zone.classList.remove('is-dragging'); });
    });
    if (input) input.addEventListener('change', function () { renderFileList(input); });
  });

  /* Uploads: {client_id}/project-files/{uuid}.{ext} ------------------------ */
  function busyUpload(id, message) {
    var box = document.getElementById(id);
    document.getElementById(id + '-text').textContent = message;
    box.hidden = !message;
  }
  async function upload(file, types) {
    var extension = extensionOf(file.name), name = crypto.randomUUID() + '.' + extension;
    var path = clientId + '/project-files/' + name;
    // The SDK sends a Blob's own type, so retype it from the extension.
    var body = new Blob([file], { type: types[extension] });
    var result = await db.storage.from(BUCKET).upload(path, body, { contentType: types[extension], upsert: false });
    if (result.error) throw result.error;
    return result.data.path;
  }
  // Uploads this step's files, reusing anything already stored for them.
  async function uploadStep(step) {
    if (step === 2) {
      var files = Array.from(field('attachments').files), key = files.map(signature).join(',');
      if (!files.length) { uploaded.attachments = null; return; }
      if (uploaded.attachments && uploaded.attachments.key === key) return;
      busyUpload('order-attachments-progress', 'Uploading ' + files.length + (files.length === 1 ? ' file…' : ' files…'));
      try {
        var paths = [];
        for (var i = 0; i < files.length; i += 1) paths.push(await upload(files[i], attachmentTypes));
        uploaded.attachments = { key: key, names: files.map(function (file) { return file.name; }), paths: paths };
      } finally { busyUpload('order-attachments-progress', ''); }
      return;
    }
    if (step === 3) {
      // The brief document, when it was uploaded rather than linked.
      var briefFile = briefIsLink() ? null : field('briefFile').files[0];
      if (briefIsLink()) uploaded.brief = null;
      else if (briefFile && (!uploaded.brief || uploaded.brief.key !== signature(briefFile))) {
        busyUpload('order-brief-progress', 'Uploading ' + briefFile.name + '…');
        try { uploaded.brief = { key: signature(briefFile), name: briefFile.name, path: await upload(briefFile, briefTypes) }; }
        finally { busyUpload('order-brief-progress', ''); }
      }
      var slots = [['script', 'scriptFile', scriptTypes, hasScript(), 'order-script-progress'],
        ['voice', 'voiceFile', voiceTypes, hasVoice(), 'order-voice-progress']];
      for (var s = 0; s < slots.length; s += 1) {
        var slot = slots[s], file = field(slot[1]).files[0];
        if (!slot[3]) { uploaded[slot[0]] = null; continue; }
        if (!file || (uploaded[slot[0]] && uploaded[slot[0]].key === signature(file))) continue;
        busyUpload(slot[4], 'Uploading ' + file.name + '…');
        try { uploaded[slot[0]] = { key: signature(file), name: file.name, path: await upload(file, slot[2]) }; }
        finally { busyUpload(slot[4], ''); }
      }
    }
  }

  /* Steps: the URL hash (#step-1 … #step-4) keeps Back working ------------- */
  function stepFromHash() { var match = /^#step-([1-4])$/.exec(location.hash); return match ? Number(match[1]) : 1; }
  // The furthest step the answers so far allow.
  function reachable(step) {
    for (var n = 1; n < step; n += 1) if (!validate(n, false)) return n;
    return step;
  }
  function show(step, focus) {
    var allowed = reachable(step);
    if (allowed !== step) { step = allowed; history.replaceState(null, '', '#step-' + step); }
    current = step;
    steps.forEach(function (section) { section.hidden = Number(section.dataset.step) !== step; });
    progress.forEach(function (item) {
      var n = Number(item.dataset.progress);
      item.classList.toggle('is-done', n < step);
      if (n === step) item.setAttribute('aria-current', 'step'); else item.removeAttribute('aria-current');
    });
    if (step === 3) { syncChoices(); syncBrief(); }
    if (step === LAST_STEP) summarize();
    errorBox.hidden = true;
    var labels = { 1: '', 2: 'Look & feel — ', 3: 'Brief, script & voice over — ', 4: 'Review — ' };
    document.title = labels[step] + baseTitle;
    if (focus) {
      document.getElementById('step-' + step + '-title').focus({ preventScroll: true });
      card.scrollIntoView({ block: 'start' });
    }
  }
  function goTo(step) { if (location.hash === '#step-' + step) show(step, true); else location.hash = '#step-' + step; }
  function stepError(step, message) {
    var box = document.getElementById('order-step-' + step + '-error');
    if (!box) return;
    box.textContent = message || '';
    box.hidden = !message;
  }
  function setContinueBusy(button, on, label) {
    button.disabled = on;
    button.setAttribute('aria-busy', String(on));
    button.querySelector('[data-next-label]').textContent = on ? label : 'Continue';
  }
  // Continue: validate, do this step's server work, then move on.
  async function advance(button, step) {
    var next = Number(button.dataset.next);
    stepError(step, '');
    if (!validate(step, true)) return;
    var label = step === 1 ? 'Setting up your workspace…' : 'Uploading…';
    setContinueBusy(button, true, label);
    try {
      if (step === 1) clientId = await ensureWorkspace();
      else await uploadStep(step);
      goTo(next);
    } catch (error) {
      stepError(step, friendly(error));
    } finally { setContinueBusy(button, false, label); }
  }
  function friendly(error) {
    var code = error && error.code, message = String((error && error.message) || error || '');
    if (/failed to fetch|networkerror|load failed/i.test(message)) return 'We couldn’t reach the server. Check your connection and try again.';
    if (code === '42501' || /row-level security|permission denied/i.test(message)) return 'You don’t have permission to do that. Sign in again and retry.';
    if (/exceeded the maximum allowed size/i.test(message)) return 'One of those files is larger than 50MB.';
    if (/mime type/i.test(message)) return 'One of those file types isn’t supported.';
    return message || 'Something went wrong. Please try again.';
  }
  async function ensureWorkspace() {
    if (clientId) return clientId;
    var result = await db.rpc('ensure_client_workspace', { p_company: text('company'), p_website: text('companyWebsite') || null });
    if (result.error) throw result.error;
    if (!result.data) throw new Error('We couldn’t set up your workspace. Please email ' + CONTACT_EMAIL + '.');
    return result.data;
  }
  form.addEventListener('click', function (event) {
    var next = event.target.closest('[data-next]'), back = event.target.closest('[data-back]');
    if (next) advance(next, current);
    if (back) goTo(Number(back.dataset.back));
  });
  window.addEventListener('hashchange', function () { if (!done && card.dataset.state === 'ready') show(stepFromHash(), true); });

  /* Review ----------------------------------------------------------------- */
  function clip(value, limit) {
    var all = String(value || '');
    return all.length > limit ? all.slice(0, limit - 1).trim() + '…' : all;
  }
  function summarize() {
    var seconds = duration(), links = references();
    var attachments = uploaded.attachments ? uploaded.attachments.names : Array.from(field('attachments').files).map(function (file) { return file.name; });
    set('summary-title', text('title'));
    set('summary-company', text('company'));
    set('summary-website', text('companyWebsite') || 'Not provided');
    set('summary-item', text('videoType') + ' · ' + seconds + ' seconds');
    set('summary-delivery', text('deliveryDate') || 'No fixed date');
    set('summary-purpose', clip(text('purpose'), 240));
    set('summary-audience', clip(text('targetAudience'), 240));
    set('summary-style', clip(text('videoStyle'), 240) || 'Open to suggestions');
    set('summary-colors', text('brandColors') || 'Not provided');
    set('summary-references', links.length ? links.join(', ') : 'None');
    set('summary-attachments', attachments.length ? attachments.join(', ') : 'None');
    set('summary-script', hasScript() ? 'Provided by you' + (uploaded.script ? ' · ' + uploaded.script.name : '') : 'FIJLY writes the script');
    set('summary-voice', hasVoice() ? 'Provided by you' + (uploaded.voice ? ' · ' + uploaded.voice.name : '') : 'FIJLY records the voice over');
    set('summary-brief-doc', briefIsLink() ? (text('briefLink') || 'Your script stands in for the brief')
      : (uploaded.brief ? uploaded.brief.name : (field('briefFile').files[0] || {}).name || 'Your script stands in for the brief'));
    var notes = text('brief');
    set('summary-brief', notes ? '“' + clip(notes, 240) + '”' : 'None');
    set('summary-account', (account.name ? account.name + ' · ' : '') + account.email);
    renderPrices();
  }

  /* Submit ----------------------------------------------------------------- */
  function setBusy(on) {
    pending = on;
    submit.disabled = on;
    submit.setAttribute('aria-busy', String(on));
    submitLabel.textContent = on ? 'Saving your project…' : 'Submit project';
  }
  function fail(message) {
    var link = document.createElement('a');
    link.href = 'mailto:' + CONTACT_EMAIL + '?subject=' + encodeURIComponent('FIJLY project — ' + (text('company') || text('title')));
    link.textContent = 'email us at ' + CONTACT_EMAIL;
    errorBox.replaceChildren(document.createTextNode(message + ' You can try again, or '), link, document.createTextNode('.'));
    errorBox.hidden = false;
  }
  // The saved milestone rows, so the payment step shows what was stored.
  async function savedPayments(requestId) {
    try {
      var result = await db.from('payments').select('milestone, amount').eq('request_id', requestId);
      if (result.error || !result.data || !result.data.length) return null;
      var byMilestone = {};
      result.data.forEach(function (row) { byMilestone[row.milestone] = Number(row.amount); });
      return byMilestone.start === undefined ? null : byMilestone;
    } catch (_) { return null; }
  }
  function finish(amounts) {
    done = true;
    form.hidden = true;
    document.getElementById('order-progress').hidden = true;
    set('order-payment-text', 'Pay the 15% project-start deposit (' + money(amounts.start) + ') to begin. We’ll email a PayPal invoice to '
      + account.email + ' within one business day. Your project starts as soon as payment is confirmed.');
    ['start', 'storyboard', 'final'].forEach(function (key) { set('paid-' + key, money(amounts[key])); });
    payment.hidden = false;
    history.replaceState(null, '', location.pathname + location.search);
    document.title = 'Project saved — ' + baseTitle;
    document.getElementById('order-payment-title').focus();
  }
  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (pending || done) return;
    // Every earlier step must still hold; send the customer back to fix it.
    for (var step = 1; step < LAST_STEP; step += 1) {
      if (!validate(step, false)) { goTo(step); validate(step, true); return; }
    }
    var prices = breakdown();
    // A bot filled the hidden field: show the payment step without saving.
    if (honeypot.value) { finish(schedule(prices ? prices.total : 0)); return; }
    errorBox.hidden = true;
    setBusy(true);
    try {
      // Normally a no-op: each step uploads its own files. This covers a retry
      // after an upload failed, so the paths the project is saved with exist.
      await uploadStep(2);
      await uploadStep(3);
      var result = await db.rpc('submit_project', {
        p_title: text('title'),
        p_video_type: text('videoType'),
        p_duration: duration(),
        p_brief: text('brief') || null,
        p_brief_link: briefLinkValue() || null,
        // submit_project() requires a brief link or a brief file. When the
        // client supplied a script instead, that file is the brief document.
        p_brief_file_path: briefLinkValue() ? null
          : (briefPath() || (hasScript() && uploaded.script ? uploaded.script.path : null)),
        p_purpose: text('purpose'),
        p_target_audience: text('targetAudience') || null,
        p_video_style: text('videoStyle') || null,
        p_brand_colors: text('brandColors') || null,
        p_website: text('companyWebsite') || null,
        p_reference_urls: references(),
        p_attachment_names: uploaded.attachments ? uploaded.attachments.names : [],
        p_attachment_paths: uploaded.attachments ? uploaded.attachments.paths : [],
        p_delivery_date: text('deliveryDate') || null,
        p_has_script: hasScript(),
        p_has_voice_over: hasVoice(),
        p_script_file_path: uploaded.script ? uploaded.script.path : null,
        p_voice_over_file_path: uploaded.voice ? uploaded.voice.path : null
      });
      if (result.error) throw result.error;
      finish((await savedPayments(result.data)) || schedule(prices ? prices.total : 0));
    } catch (error) {
      fail(friendly(error));
    } finally { setBusy(false); }
  });

  document.getElementById('order-signout').addEventListener('click', async function () {
    await signOut({ redirect: false });
    window.location.replace('/');
  });

  /* Account menu: the account remains available without keeping personal
     details in the page header. It uses the same session data and sign-out
     path as the original inline account control. */
  var profileButton = document.getElementById('order-profile-button');
  var profileMenu = document.getElementById('order-profile-menu');
  function closeProfileMenu() {
    profileMenu.hidden = true;
    profileButton.setAttribute('aria-expanded', 'false');
  }
  profileButton.addEventListener('click', function () {
    var opening = profileMenu.hidden;
    profileMenu.hidden = !opening;
    profileButton.setAttribute('aria-expanded', String(opening));
  });
  document.addEventListener('click', function (event) {
    if (!profileMenu.hidden && !document.getElementById('order-account').contains(event.target)) closeProfileMenu();
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !profileMenu.hidden) {
      closeProfileMenu();
      profileButton.focus();
    }
  });

  /* Start: signed in? Then pre-fill and open the step in the URL ----------- */
  async function loadPricing() {
    try {
      var result = await db.from('pricing').select('item, duration_seconds, amount');
      if (result.error || !result.data) return;
      var map = {};
      result.data.forEach(function (row) {
        if (!map[row.item]) map[row.item] = {};
        map[row.item][row.duration_seconds] = Number(row.amount);
      });
      pricing = map;
    } catch (_) { /* The breakdown says so; the server still prices the project. */ }
  }
  async function prefillWorkspace() {
    var profile = await getUserProfile();
    if (!profile) return;
    account.name = profile.full_name || account.name;
    if (!profile.client_id) return;
    clientId = profile.client_id;
    var workspace = await db.from('clients').select('name, website').eq('id', profile.client_id).maybeSingle();
    if (!workspace.data) return;
    if (workspace.data.name && !field('company').value) field('company').value = workspace.data.name;
    if (workspace.data.website && !field('companyWebsite').value) field('companyWebsite').value = workspace.data.website;
  }
  async function start() {
    db = initSupabase();
    var session = null;
    // A confirmation or Google sign-in link lands here; the SDK reads it from the URL first.
    try { session = db && (await db.auth.getSession()).data.session; } catch (_) { session = null; }
    if (!session) { window.location.replace(SIGN_UP); return; }
    account.email = session.user.email || '';
    account.name = (session.user.user_metadata && session.user.user_metadata.full_name) || '';
    await loadPricing();
    try { await prefillWorkspace(); } catch (_) { /* The wizard still works from the session. */ }
    document.getElementById('order-account-email').textContent = account.email;
    document.getElementById('order-profile-initial').textContent = (account.name || account.email || '?').trim().charAt(0).toUpperCase();
    document.getElementById('order-account').hidden = false;
    // The length picked on a pricing card, carried here as ?duration=.
    var wanted = new URLSearchParams(location.search).get('duration');
    var preset = form.querySelector('input[name="duration"][value="' + String(wanted || '').replace(/[^0-9]/g, '') + '"]');
    if (preset) preset.checked = true;
    syncChoices();
    syncBrief();
    card.dataset.state = 'ready';
    show(stepFromHash(), false);
  }
  start();
})();
