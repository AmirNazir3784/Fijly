/* Client portal screens over the existing FIJLY components. Data comes from
   FijlyData.client: the signed-in client's workspace in Supabase. Writes are
   async; each control stays busy until its save is confirmed. */
(function () {
  'use strict';
  var api = window.FijlyData, client = api.client, selectedScript = null, settingsDirty = false, scriptSignature = '';
  var $ = function (selector) { return document.querySelector(selector); };
  var cardArtwork = {};
  document.querySelectorAll('.project-card').forEach(function (card) { cardArtwork[card.querySelector('.project-card__name').textContent] = card.querySelector('.project-card__media').cloneNode(true); });
  function node(tag, text, cls) { var n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; }
  function action(text, fn) { var b = node('button', text, 'btn btn-outline btn--md'); b.type = 'button'; b.onclick = fn; return b; }
  function badge(text) { return node('span', text, api.statusClass(text)); }
  function date(value) { return api.formatDate(value, 'Not recorded'); }
  function openVideo(id) { FijlyWorkflow.open('videos', id); }
  function completedAt(v) { return api.completedAt(v); }
  // Marks a control busy while an async save runs; returns a release function.
  function busy(control) { control.disabled = true; control.setAttribute('aria-busy', 'true'); return function () { control.disabled = false; control.removeAttribute('aria-busy'); }; }
  // Overview: one banner per project that owes a milestone at its stage.
  // Payments are invoiced by hand for now, so the banner only informs.
  function paymentBanners() {
    var host = $('#client-payment-banners');
    if (!host) return;
    host.replaceChildren();
    client.duePayments().forEach(function (payment) {
      var banner = node('div', undefined, 'payment-banner');
      banner.setAttribute('role', 'status');
      banner.append(node('span', 'Payment due: ' + api.milestoneLabel(payment.milestone) + ' — '
        + api.formatMoney(payment.amount) + ' for ' + payment.project + '.', 'payment-banner__title'),
        node('span', 'We’ll send a PayPal invoice.', 'payment-banner__note'));
      host.append(banner);
    });
  }
  function metric(card, label, value, note) { card.querySelector('.stat-card__label').textContent = label; card.querySelector('.stat-card__value').textContent = value; card.querySelector('.stat-card__delta').textContent = note; }
  function overview() {
    var profile = client.current(), videos = client.records('videos');
    // Greet the signed-in person; the company contact may be someone else.
    var person = (api.me && api.me.full_name) || profile.contact || '';
    $('#h-overview').textContent = person ? 'Welcome, ' + person.split(' ')[0] : 'Welcome';
    $('.page-head__date').textContent = profile.name + ' / WORKSPACE';
    $('#studio-demo-note').firstChild.textContent = profile.name + ' workspace · Live data. Changes are saved to the FIJLY database. ';
    var cards = document.querySelectorAll('#screen-overview .stat-card');
    // Waiting requests count as active work; a request that became a video counts once.
    var activeVideos = videos.filter(function (v) { return v.status !== 'Completed'; }).length, waiting = api.pendingRequests(profile.id).length;
    metric(cards[0], 'Active Projects', activeVideos + waiting, activeVideos + ' in progress · +' + waiting + ' submitted ' + (waiting === 1 ? 'request' : 'requests'));
    metric(cards[1], 'Videos Delivered', videos.filter(function (v) { return v.status === 'Completed'; }).length, 'Completed videos · all time');
    metric(cards[2], 'Waiting for Review', videos.filter(function (v) { return v.status === 'Client Review'; }).length, 'Ready for your feedback');
    metric(cards[3], 'Revisions in Progress', videos.filter(function (v) { return v.status === 'In Revision'; }).length, client.records('revisions').length + ' revision rounds recorded');
    var recent = videos.slice().sort(function (a, b) { return (b.activity.slice(-1)[0] || {}).at > (a.activity.slice(-1)[0] || {}).at ? 1 : -1; });
    document.querySelectorAll('.project-card').forEach(function (card, index) {
      var v = recent[index]; card.hidden = !v; if (!v) return;
      var r = api.requestFor(v); card.querySelector('.project-card__name').textContent = r.title;
      card.querySelector('.project-card__sub').textContent = r.videoType;
      card.querySelector('.project-card__badges').replaceChildren(node('span', r.stage, api.stageClass(r.stage)), badge(v.status));
      card.querySelector('.project-card__updated').textContent = v.status === 'Completed' && completedAt(v) ? 'Delivered ' + date(completedAt(v)) : 'Due ' + date(r.deadline);
      card.querySelector('.progress-row__label').textContent = 'Latest version';
      card.querySelector('.progress-row__value').textContent = api.latest(v) ? 'V' + api.latest(v).number : 'Awaiting draft';
      var progress = card.querySelector('.progress-bar'); if (progress) progress.remove();
      var media = card.querySelector('.project-card__media'), artwork = cardArtwork[r.title.split(' / ')[0]]; if (artwork) media.replaceChildren.apply(media, Array.from(artwork.cloneNode(true).childNodes)); else media.replaceChildren(node('span', r.videoType, 'client-media-label'));
      var link = card.querySelector('.project-card__foot a'); link.removeAttribute('data-screen-link'); link.textContent = 'View video'; link.onclick = function (event) { event.preventDefault(); event.stopImmediatePropagation(); openVideo(v.id); };
    });
    // Feature the draft awaiting this client's review; otherwise the most
    // recently active video still in progress, then the most recent overall.
    var feature = videos.find(function (v) { return v.status === 'Client Review'; }) || recent.find(function (v) { return v.status !== 'Completed'; }) || recent[0];
    $('#preview').hidden = !feature; $('.storyboard').hidden = !feature;
    if (feature) {
      var r = api.requestFor(feature), latest = api.latest(feature), reviewing = feature.status === 'Client Review';
      $('#preview-meta').textContent = latest ? 'V' + latest.number + ' · Added ' + date(latest.createdAt) : 'No draft uploaded yet';
      $('#preview-message').textContent = reviewing ? 'Draft ready for review — open in Projects to watch and approve' : 'Your latest draft will appear here when ready';
      $('#preview-video').textContent = profile.name + ' — ' + r.title + ' · ' + feature.status;
      // Switch to Projects through the sidebar link, then open the draft there.
      var review = $('#client-current-video'); review.hidden = !reviewing; review.onclick = function (event) { event.preventDefault(); event.stopImmediatePropagation(); document.querySelector('.sidebar-link[data-screen="projects"]').click(); openVideo(feature.id); };
      $('.storyboard .panel__sub').textContent = 'Illustrative structure · ' + r.title;
      $('.storyboard .version-pill').textContent = latest ? 'V' + latest.number : 'Outline';
      var scenes = document.querySelectorAll('.scene'); scenes.forEach(function (scene, i) { scene.querySelector('.scene__title').textContent = ['Opening', 'Context', 'Product', 'Benefits', 'Closing'][i]; scene.querySelector('.scene__dur').textContent = 'Scene ' + (i + 1); var tag = scene.querySelector('.badge'); tag.textContent = 'Outline'; tag.className = 'badge'; });
    }
    var empty = $('#client-overview-empty'); if (!empty) { empty = node('p', 'No videos yet. Start a project on the order page to get going.', 'panel__sub'); empty.id = 'client-overview-empty'; $('.project-grid').append(empty); } empty.hidden = !!videos.length;
  }

  var modal = node('dialog', undefined, 'admin-dialog workflow-detail'); modal.id = 'client-asset-detail'; modal.setAttribute('aria-labelledby', 'client-dialog-title');
  // While a file uploads the dialog stays open, so the upload isn't abandoned half-way.
  var uploading = false; function closeModal() { if (!uploading) modal.close(); } modal.addEventListener('cancel', function (event) { if (uploading) event.preventDefault(); });
  var head = node('div', undefined, 'admin-dialog-head'), title = node('h2'), closeX = node('button', undefined, 'icon-btn'); title.id = 'client-dialog-title'; var body = node('div', undefined, 'workflow-body'), foot = node('div', undefined, 'admin-dialog-foot'), dismiss = action('Close', closeModal);
  closeX.type = 'button'; closeX.setAttribute('aria-label', 'Close dialog'); closeX.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>'; closeX.onclick = closeModal;
  dismiss.className = 'btn btn-ghost btn--md dialog-dismiss'; head.append(title, closeX); foot.append(dismiss); modal.append(head, body, foot); document.body.append(modal);
  var shownAsset = null;
  // Details, an image thumbnail and a Download button (signed link, valid for an hour).
  function assetDetail(id) {
    var a = client.get('assets', id), error = node('p', undefined, 'workflow-error'), parts = []; shownAsset = id; title.textContent = a.name; dismiss.textContent = 'Close'; error.setAttribute('role', 'alert');
    var download = action('Download', function () { downloadAsset(a, download, error); }); download.className = 'btn btn-primary btn--md'; download.hidden = !a.fileUrl; foot.replaceChildren(dismiss, download);
    if (api.isImageAsset(a)) { var figure = node('div', undefined, 'asset-preview'), img = node('img'); img.alt = 'Preview of ' + a.name; img.onerror = function () { figure.hidden = true; }; figure.hidden = true; figure.append(img); parts.push(figure); api.assetUrl(a).then(function (url) { img.src = url; figure.hidden = false; }).catch(function () { /* No thumbnail; Download reports the problem. */ }); }
    parts.push(node('span', a.category, 'badge'), node('p', a.fileType.toUpperCase() + ' · ' + api.formatBytes(a.size) + ' · Added ' + date(a.uploadedAt)), node('p', a.notes || 'No additional notes.'));
    if (!a.fileUrl) parts.push(node('p', 'No file is stored for this asset — only its details were recorded.', 'admin-muted'));
    body.replaceChildren.apply(body, parts.concat(error)); if (!modal.open) modal.showModal();
  }
  async function downloadAsset(a, control, error) {
    if (control.disabled) return; error.textContent = '';
    // Open the tab inside the click so pop-up blockers allow it, then point it at the file.
    var tab = window.open('', '_blank'), release = busy(control);
    try { var url = await api.assetUrl(a); if (tab) { tab.opener = null; tab.location.href = url; } else window.open(url, '_blank', 'noopener'); }
    catch (e) { if (tab) tab.close(); error.textContent = 'Couldn’t prepare the download. ' + e.message; } finally { release(); }
  }
  // Small files get an indeterminate bar; large ones a spinner (the SDK reports no progress).
  function uploadProgress(target, file) { var large = file.size >= 5 * 1024 * 1024, indicator = node('span', undefined, large ? 'upload-progress__spinner' : 'upload-progress__bar'); indicator.setAttribute('aria-hidden', 'true'); target.replaceChildren(indicator, node('span', large ? 'Uploading large file… (' + api.formatBytes(file.size) + ')' : 'Uploading ' + file.name + '…')); target.hidden = false; }
  function assetRows(target, records) {
    target.replaceChildren(); if (!records.length) { target.append(node(target.tagName === 'UL' ? 'li' : 'p', 'No matching assets.', 'admin-muted')); return; }
    records.forEach(function (a) { var row = node(target.tagName === 'UL' ? 'li' : 'div', undefined, 'file-row'), info = node('span', undefined, 'file-row__body'); var b = action(a.name, function () { assetDetail(a.id); }); b.className = 'btn-link file-row__title'; info.append(b, node('span', a.category + ' · ' + api.formatBytes(a.size), 'file-row__sub')); row.append(info, node('span', a.fileType.toUpperCase(), 'file-row__ext')); target.append(row); });
  }
  function assets() {
    var records = client.records('assets').sort(function (a, b) { return b.uploadedAt.localeCompare(a.uploadedAt); });
    var search = $('#client-asset-search').value.trim().toLowerCase(), category = $('#client-asset-category').value;
    assetRows($('[data-client-assets]'), records.filter(function (a) { return (category === 'all' || a.category === category) && [a.name, a.category, a.notes].join(' ').toLowerCase().includes(search); }));
    if (modal.open && shownAsset) { if (records.some(function (a) { return a.id === shownAsset; })) assetDetail(shownAsset); else modal.close(); }
  }
  api.assetCategories.forEach(function (category) { $('#client-asset-category').append(node('option', category)); });
  $('#client-asset-search').oninput = assets; $('#client-asset-category').onchange = assets;
  $('#client-add-asset').onclick = function () {
    shownAsset = null; title.textContent = 'Add asset'; body.innerHTML = '<form id="client-asset-form"><p class="admin-muted">Your file is uploaded to your private workspace, where only you and the FIJLY team can open it.</p><div class="form-group"><label class="field-label" for="client-asset-file">Choose file</label><input class="input workflow-file" id="client-asset-file" type="file" aria-describedby="client-asset-file-hint client-asset-file-error"><p class="field-hint" id="client-asset-file-hint">Images, PDF, video, fonts or ZIP · up to 50MB.</p><p class="workflow-error asset-file-error" id="client-asset-file-error" role="alert"></p><div class="upload-progress" id="client-asset-progress" role="status" hidden></div></div><div class="form-group"><label class="field-label" for="client-asset-kind">Category</label><select class="input" id="client-asset-kind"></select></div><div class="form-group"><label class="field-label" for="client-asset-notes">Notes</label><textarea class="input" id="client-asset-notes" maxlength="2000"></textarea></div><p role="alert" class="workflow-error" id="client-asset-error"></p></form>';
    var save = node('button', 'Save asset', 'btn btn-primary btn--md'); save.type = 'submit'; save.setAttribute('form', 'client-asset-form'); dismiss.textContent = 'Cancel'; foot.replaceChildren(dismiss, save);
    api.assetCategories.forEach(function (c) { $('#client-asset-kind').append(node('option', c)); });
    var input = $('#client-asset-file'), fileError = $('#client-asset-file-error'), progress = $('#client-asset-progress'); input.accept = api.assetFileAccept;
    // Problems with the file show under the picker, as soon as it is chosen.
    input.onchange = function () { fileError.textContent = input.files[0] ? api.validateAssetFile(input.files[0]) : ''; };
    $('#client-asset-form').onsubmit = async function (event) {
      event.preventDefault(); if (save.disabled) return;
      var file = input.files[0]; $('#client-asset-error').textContent = ''; fileError.textContent = api.validateAssetFile(file);
      if (fileError.textContent) { input.focus(); return; }
      var release = busy(save); uploading = true; dismiss.disabled = closeX.disabled = true; uploadProgress(progress, file);
      try {
        await client.addAsset({ name: file.name, file: file, category: $('#client-asset-kind').value, notes: $('#client-asset-notes').value });
        uploading = false; modal.close(); $('#client-asset-search').value = ''; $('#client-asset-category').value = 'all'; assets();
        var note = $('#client-asset-success'); note.textContent = file.name + ' added to your assets. The file was uploaded.'; note.hidden = false;
      } catch (e) { $('#client-asset-error').textContent = 'Upload failed. ' + e.message; } finally { uploading = false; dismiss.disabled = closeX.disabled = false; progress.hidden = true; progress.replaceChildren(); release(); }
    }; modal.showModal(); input.focus();
  };

  function scripts() {
    var records = client.records('scripts').filter(function (s) { return s.status !== 'Draft'; }).sort(function (a, b) { return (a.status === 'Client Review' ? 0 : 1) - (b.status === 'Client Review' ? 0 : 1); }), select = $('#client-script-select');
    if (!records.some(function (s) { return s.id === selectedScript; })) selectedScript = records.length ? records[0].id : null;
    var signature = JSON.stringify([client.current().id, selectedScript, records]); if (signature === scriptSignature) return; scriptSignature = signature;
    select.replaceChildren(); records.forEach(function (s) { var option = node('option', s.title + ' — ' + (s.status === 'Client Review' ? 'Needs your review' : s.status)); option.value = s.id; select.append(option); }); select.value = selectedScript || ''; select.disabled = !records.length;
    var script = selectedScript && client.get('scripts', selectedScript), scenes = $('#client-script-scenes'), actions = $('#client-script-actions'), feedback = $('#client-script-feedback'); scenes.replaceChildren(); actions.replaceChildren(); feedback.replaceChildren();
    $('#h-script-doc').textContent = script ? script.title : 'No scripts ready for review'; $('#client-script-status').textContent = script ? script.status : 'Awaiting production'; $('#client-script-status').className = script ? api.statusClass(script.status) : 'badge'; $('.doc__meta').textContent = script ? 'V' + script.version + ' · Updated ' + date(script.updatedAt) : 'Your scripts will appear here when the studio shares them. You can track production in Projects.';
    $('#client-script-video').hidden = !script; if (!script) { feedback.append(node('p', 'Nothing to review yet. We will share your script here when it is ready.', 'admin-muted')); return; }
    actions.append(node('p', script.status === 'Approved' ? 'Approved — script review is complete.' : script.status === 'Client Review' ? 'Needs your review — approve this script or request changes below.' : 'Your changes are with the studio. A revised script will appear here when ready.', script.status === 'Approved' ? 'workflow-notice' : 'field-hint'));
    $('#client-script-video').onclick = function () { openVideo(script.videoId); };
    script.scenes.forEach(function (s, i) { var li = node('li', undefined, 'script-scene'), content = node('div', undefined, 'script-scene__content'); content.append(node('div', s.label, 'script-scene__label'), node('p', s.text, 'script-scene__text')); li.append(node('span', String(i + 1).padStart(2, '0'), 'script-scene__no'), content); scenes.append(li); });
    if (!script.feedback.length) feedback.append(node('p', 'No script feedback yet.', 'admin-muted'));
    script.feedback.forEach(function (f) { var item = node('article', undefined, 'comment'); item.append(node('p', f.author + ' · V' + f.version + ' · ' + date(f.at), 'comment__name'), node('p', f.text, 'comment__text')); feedback.append(item); });
    if (script.status === 'Client Review') {
      var form = node('form'), label = node('label', 'Revision feedback', 'field-label'), input = node('textarea', undefined, 'input'); input.id = 'client-script-revision'; input.required = true; input.maxLength = 3000; label.htmlFor = input.id;
      var submit = node('button', 'Request script revision', 'btn btn-outline btn--md'); submit.type = 'submit'; var error = node('p', undefined, 'workflow-error'); error.setAttribute('role', 'alert');
      var review = async function (control, status, text) { if (control.disabled) return; var release = busy(control); error.textContent = ''; try { await client.reviewScript(script.id, status, text); } catch (err) { error.textContent = err.message; } finally { release(); } };
      form.append(label, input, submit, error); form.onsubmit = function (e) { e.preventDefault(); review(submit, 'Revision Requested', input.value); };
      var approve = action('Approve script', function () { review(approve, 'Approved'); });
      actions.append(approve, form);
    }
  }
  $('#client-script-select').onchange = function () { selectedScript = this.value; scripts(); };
  function analytics() {
    var videos = client.records('videos'), rounds = client.records('revisions'), completed = videos.filter(function (v) { return v.status === 'Completed'; });
    var kpis = $('#client-analytics-kpis'); kpis.replaceChildren();
    [['Videos Completed', completed.length], ['In Progress', videos.length - completed.length], ['Awaiting Review', videos.filter(function (v) { return v.status === 'Client Review'; }).length], ['Revision Rounds', rounds.length], ['Approved · awaiting delivery', videos.filter(function (v) { return v.status === 'Approved'; }).length]].forEach(function (m) { var card = node('article', undefined, 'stat-card stat-card--compact'); card.append(node('h2', m[0], 'stat-card__label'), node('div', m[1], 'stat-card__value')); kpis.append(card); });
    var stages = $('#client-stages'); stages.replaceChildren(); api.videoStatuses.forEach(function (s) { var row = node('li'); row.append(node('span', s, 'funnel__label'), node('span', videos.filter(function (v) { return v.status === s; }).length, 'funnel__value')); stages.append(row); });
    var months = {}; completed.forEach(function (v) { var key = completedAt(v) ? completedAt(v).slice(0, 7) : 'Date not recorded'; months[key] = (months[key] || 0) + 1; });
    var monthLabel = function (key) { return /^\d{4}-\d{2}$/.test(key) ? new Date(+key.slice(0, 4), +key.slice(5) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : key; };
    var chart = $('#client-delivery-chart'); chart.replaceChildren(); if (!completed.length) chart.append(node('p', 'No deliveries yet.', 'admin-muted'));
    Object.keys(months).sort().forEach(function (month) { var row = node('div', undefined, 'client-chart-row'), meter = node('progress'); meter.max = Math.max.apply(null, Object.values(months)); meter.value = months[month]; meter.setAttribute('aria-label', monthLabel(month) + ': ' + months[month] + ' completed videos'); row.append(node('span', monthLabel(month)), meter, node('strong', months[month])); chart.append(row); });
    var timed = completed.filter(function (v) { return completedAt(v); }), durations = timed.map(function (v) { return (Date.parse(completedAt(v)) - Date.parse(api.requestFor(v).requestedAt)) / 86400000; }).filter(function (days) { return days >= 0; });
    $('#client-production-time').textContent = durations.length ? 'Average production time: ' + (durations.reduce(function (a, b) { return a + b; }, 0) / durations.length).toFixed(1) + ' days · ' + durations.length + ' deliveries with recorded completion dates' : 'Average production time: — · No completion dates recorded yet';
    var deliveries = $('#client-deliveries'); deliveries.replaceChildren(); if (!completed.length) deliveries.append(node('p', 'Completed videos will appear here.', 'admin-muted')); completed.forEach(function (v) { var row = node('div', undefined, 'file-row'); row.append(action(api.requestFor(v).title, function () { openVideo(v.id); }), node('span', date(completedAt(v)), 'admin-muted')); deliveries.append(row); });
  }
  var settings = $('#client-settings-form');
  function loadSettings() {
    if (settingsDirty) return; var p = client.current(), preferences = client.preferences();
    ['name', 'contact', 'email', 'website'].forEach(function (key) { settings.elements.namedItem(key).value = p[key] || ''; });
    ['defaultLength', 'platform'].forEach(function (key) { settings.elements.namedItem(key).value = preferences[key]; });
    // Only switches the page still has are filled (notification switches have no columns).
    ['autoshare', 'digest', 'review'].forEach(function (key) { var input = settings.elements.namedItem(key); if (!input) return; input.checked = preferences[key]; input.setAttribute('aria-checked', String(input.checked)); });
    $('.workspace-row__name').textContent = p.name; $('.workspace-row__sub').textContent = p.email + ' · Client workspace'; $('.workspace-logo').textContent = p.name[0];
  }
  settings.addEventListener('input', function () { settingsDirty = true; $('#client-settings-note').textContent = 'Unsaved changes'; });
  settings.onsubmit = async function (e) {
    e.preventDefault(); var submit = settings.querySelector('[type="submit"]'); if (submit.disabled) return;
    var release = busy(submit), values = Object.fromEntries(new FormData(settings));
    try { await client.saveProfile(values); settingsDirty = false; loadSettings(); $('#client-settings-note').textContent = 'Settings saved for this workspace.'; }
    catch (err) { $('#client-settings-note').textContent = err.message; } finally { release(); }
  };
  $('#client-discard-settings').onclick = function () { settingsDirty = false; loadSettings(); $('#client-settings-note').textContent = 'Changes discarded.'; };
  function render(changed) {
    var available=!!client.current();
    document.body.classList.toggle('client-no-workspace',!available);
    // The auth guard stops before the portal when no workspace is linked; this
    // covers a workspace that disappears while the page is open.
    document.querySelectorAll('.screen').forEach(function(screen){var note=screen.querySelector('.client-workspace-empty');if(!note){note=node('p','Your workspace is not available right now. Refresh the page or contact the FIJLY team.','panel client-workspace-empty');screen.append(note);}note.hidden=available;});
    if(!available){$('#studio-demo-note').firstChild.textContent='No client workspace. ';return;}
    if(!changed || changed.some(function(k){return ['clients','requests','videos','revisions'].includes(k);}))overview();
    if(!changed || changed.some(function(k){return ['payments','requests'].includes(k);}))paymentBanners();
    if(!changed || changed.includes('assets'))assets();
    if(!changed || changed.some(function(k){return ['scripts','clients'].includes(k);}))scripts();
    if(!changed || changed.some(function(k){return ['requests','videos','revisions'].includes(k);}))analytics();
    if(!changed || changed.some(function(k){return ['clients','settings','clientSettings'].includes(k);}))loadSettings();
  }
  api.subscribe(render); render();
})();
