/* Admin Assets, Scripts, Analytics and Settings.
   Reads and writes the shared data service (Supabase via FijlyData in the
   Admin portal). An asset's file is uploaded to Supabase Storage, kept in its
   client's folder and downloaded through a short-lived signed link. */
(function () {
  'use strict';
  var api = window.FijlyData || window.FijlyMock;
  var state = api.state;
  if (!document.getElementById('screen-assets')) return;

  function node(tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function clientName(id) {
    var record = state.clients.find(function (item) { return item.id === id; });
    return record ? record.name : 'Unknown client';
  }
  function cell(row, child, className) {
    var td = node('td', className);
    td.append(typeof child === 'string' ? document.createTextNode(child) : child);
    row.append(td);
  }
  function bytes(value) { return api.formatBytes(value); }
  // Script versions are not stored in the database, so they are not shown there.
  var showVersions = !api.capabilities || api.capabilities.scriptVersion !== false;
  function ver(item) { return showVersions ? ' V' + item.version : ''; }
  // Marks a control busy while an async save runs; returns a release function.
  function busy(control) { control.disabled = true; control.setAttribute('aria-busy', 'true'); return function () { control.disabled = false; control.removeAttribute('aria-busy'); }; }
  function day(value) { return api.formatDate(value, '—'); }
  function fillOptions(select, values, labelFor) {
    var keep = select.querySelector('option[value="all"]');
    select.replaceChildren();
    if (keep) select.append(keep);
    values.forEach(function (value) {
      var option = node('option', null, labelFor ? labelFor(value) : value);
      option.value = value;
      select.append(option);
    });
  }

  /* ======================================================================
     Assets
     ====================================================================== */
  var assetSearch = document.getElementById('asset-search');
  var assetClient = document.getElementById('asset-client');
  var assetCategory = document.getElementById('asset-category');
  var assetSort = document.getElementById('asset-sort');
  var assetDetail = document.getElementById('asset-detail');
  var assetEditor = document.getElementById('asset-editor');
  var assetConfirm = document.getElementById('asset-confirm');
  var assetForm = document.getElementById('asset-form');
  var assetStatus = document.getElementById('asset-save-status');
  var fileError = document.getElementById('asset-file-error');
  var uploadProgress = document.getElementById('asset-upload-progress');
  var preview = document.getElementById('asset-detail-preview');
  var previewImage = document.getElementById('asset-detail-image');
  var downloadButton = document.getElementById('download-asset');
  var downloadError = document.getElementById('asset-download-error');
  var selectedAsset = null;
  var editingAsset = null;
  var pickedFile = null;
  var savingAsset = false;

  fillOptions(assetClient, state.clients.map(function (item) { return item.id; }), clientName);
  fillOptions(assetCategory, api.assetCategories);
  fillOptions(document.getElementById('asset-form-client'), state.clients.map(function (item) { return item.id; }), clientName);
  fillOptions(document.getElementById('asset-form-category'), api.assetCategories);

  function visibleAssets() {
    var query = assetSearch.value.trim().toLowerCase();
    return state.assets.filter(function (item) {
      return (assetClient.value === 'all' || item.client === assetClient.value)
        && (assetCategory.value === 'all' || item.category === assetCategory.value)
        && [item.name, clientName(item.client), item.category, item.notes].join(' ').toLowerCase().includes(query);
    }).sort(function (a, b) {
      if (assetSort.value === 'name') return a.name.localeCompare(b.name);
      if (assetSort.value === 'client') return clientName(a.client).localeCompare(clientName(b.client)) || a.name.localeCompare(b.name);
      if (assetSort.value === 'size') return b.size - a.size;
      if (assetSort.value === 'oldest') return a.uploadedAt.localeCompare(b.uploadedAt);
      return b.uploadedAt.localeCompare(a.uploadedAt);
    });
  }

  function renderAssets() {
    var records = visibleAssets();
    var rows = document.getElementById('asset-rows');
    rows.replaceChildren();
    records.forEach(function (item) {
      var row = node('tr');
      var name = node('button', 'btn-link', item.name);
      name.type = 'button';
      name.dataset.asset = item.id;
      name.setAttribute('aria-label', 'View ' + item.name);
      var identity = node('div');
      identity.append(name);
      if (item.notes) identity.append(node('span', 'admin-muted admin-block', item.notes));
      cell(row, identity);
      cell(row, clientName(item.client));
      cell(row, node('span', 'badge', item.category));
      cell(row, node('span', 'file-row__ext', item.fileType.toUpperCase()));
      cell(row, bytes(item.size), 'num');
      cell(row, day(item.uploadedAt), 'admin-date');
      var open = node('button', 'btn-link', 'View →');
      open.type = 'button';
      open.dataset.asset = item.id;
      open.setAttribute('aria-label', 'View ' + item.name);
      cell(row, open);
      rows.append(row);
    });
    document.getElementById('asset-count').textContent = records.length + ' of ' + state.assets.length + ' assets';
    document.getElementById('asset-empty').hidden = records.length > 0;
  }

  function openAssetDetail(id) {
    var item = state.assets.find(function (record) { return record.id === id; });
    if (!item) return;
    selectedAsset = id;
    document.getElementById('asset-detail-title').textContent = item.name;
    var body = document.getElementById('asset-detail-body');
    body.replaceChildren();
    var intro = node('div', 'admin-detail-intro');
    intro.append(node('span', 'badge', item.category), node('span', 'admin-muted', clientName(item.client)));
    var facts = node('dl', 'admin-detail-facts');
    [['File type', item.fileType.toUpperCase()], ['File size', bytes(item.size)],
     ['Uploaded', day(item.uploadedAt)], ['Client', clientName(item.client)]].forEach(function (pair) {
      var group = node('div');
      group.append(node('dt', null, pair[0]), node('dd', null, pair[1]));
      facts.append(group);
    });
    body.append(intro, facts, node('h3', null, 'Notes'),
      node('p', 'admin-detail-notes', item.notes || 'No notes for this asset.'));
    if (!item.fileUrl) body.append(node('p', 'admin-muted', 'No file is stored for this asset — only its details were recorded.'));
    downloadButton.hidden = !item.fileUrl;
    if (!assetDetail.open) downloadError.textContent = '';
    showPreview(item);
    if (!assetDetail.open) assetDetail.showModal();
  }

  // Image assets show a thumbnail through a signed URL.
  function showPreview(item) {
    if (!api.isImageAsset(item)) { preview.hidden = true; previewImage.removeAttribute('src'); delete previewImage.dataset.asset; return; }
    previewImage.alt = 'Preview of ' + item.name;
    if (previewImage.dataset.asset === item.id + item.fileUrl) return;
    previewImage.dataset.asset = item.id + item.fileUrl;
    previewImage.removeAttribute('src');
    preview.hidden = true;
    api.assetUrl(item).then(function (url) {
      if (previewImage.dataset.asset !== item.id + item.fileUrl) return;
      previewImage.src = url;
      preview.hidden = false;
    }).catch(function () { /* No thumbnail; Download still reports the problem. */ });
  }
  previewImage.addEventListener('error', function () { preview.hidden = true; });

  downloadButton.addEventListener('click', async function () {
    var item = state.assets.find(function (record) { return record.id === selectedAsset; });
    if (!item || !item.fileUrl || downloadButton.disabled) return;
    downloadError.textContent = '';
    // Open the tab inside the click so pop-up blockers allow it, then point it at the file.
    var tab = window.open('', '_blank');
    var release = busy(downloadButton);
    try {
      var url = await api.assetUrl(item);
      if (tab) { tab.opener = null; tab.location.href = url; } else window.open(url, '_blank', 'noopener');
    } catch (error) {
      if (tab) tab.close();
      downloadError.textContent = 'Couldn’t prepare the download. ' + error.message;
    } finally { release(); }
  });

  // Small files get an indeterminate bar; large ones a spinner (the SDK reports no progress).
  function showUploadProgress(file) {
    var large = file.size >= 5 * 1024 * 1024;
    var indicator = node('span', large ? 'upload-progress__spinner' : 'upload-progress__bar');
    indicator.setAttribute('aria-hidden', 'true');
    uploadProgress.replaceChildren(indicator, node('span', null, large ? 'Uploading large file… (' + bytes(file.size) + ')' : 'Uploading ' + file.name + '…'));
    uploadProgress.hidden = false;
  }
  function hideUploadProgress() { uploadProgress.hidden = true; uploadProgress.replaceChildren(); }

  function openAssetEditor(id) {
    if (!state.clients.length) { assetStatus.textContent='Add a client before adding an asset.';return; }
    editingAsset = id || null;
    pickedFile = null;
    assetForm.reset();
    Array.from(assetForm.elements).forEach(function (field) {
      if (field.setCustomValidity) field.setCustomValidity('');
    });
    fileError.textContent = '';
    hideUploadProgress();
    document.getElementById('asset-editor-title').textContent = id ? 'Edit asset' : 'Add asset';
    // A file is uploaded when the asset is created; editing changes its details.
    document.getElementById('asset-file-group').hidden = !!id;
    if (id) {
      var item = state.assets.find(function (record) { return record.id === id; });
      if(!item){assetStatus.textContent='This asset is no longer available.';return;}
      assetForm.elements.name.value = item.name;
      assetForm.elements.client.value = item.client;
      assetForm.elements.category.value = item.category;
      assetForm.elements.notes.value = item.notes || '';
    } else {
      assetForm.elements.client.value = assetClient.value !== 'all' ? assetClient.value : state.clients[0].id;
      assetForm.elements.category.value = assetCategory.value !== 'all' ? assetCategory.value : 'Other';
    }
    assetEditor.showModal();
    (id ? assetForm.elements.name : assetForm.elements.file).focus();
  }

  // Checks the picked file straight away; the problem shows under the picker.
  assetForm.elements.file.addEventListener('change', function (event) {
    var file = event.target.files && event.target.files[0];
    pickedFile = null;
    fileError.textContent = file ? api.validateAssetFile(file) : '';
    if (!file || fileError.textContent) return;
    pickedFile = file;
    if (!assetForm.elements.name.value.trim()) assetForm.elements.name.value = file.name;
    assetForm.elements.name.setCustomValidity('');
  });

  assetForm.addEventListener('input', function (event) {
    if (event.target.setCustomValidity) event.target.setCustomValidity('');
  });

  assetForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    var submit = assetForm.querySelector('[type="submit"]');
    if(!assetEditor.open||submit.disabled)return;
    var name = assetForm.elements.name, file = assetForm.elements.file;
    if (!editingAsset) {
      // File problems are shown under the picker, not as a browser bubble.
      var picked = file.files && file.files[0];
      fileError.textContent = api.validateAssetFile(picked);
      if (fileError.textContent) { file.focus(); return; }
      pickedFile = picked;
    }
    name.value = name.value.trim();
    name.setCustomValidity(name.value ? '' : 'Please give the file a name.');
    if (!assetForm.reportValidity()) return;
    var payload = {
      id: editingAsset,
      name: name.value,
      client: assetForm.elements.client.value,
      category: assetForm.elements.category.value,
      notes: assetForm.elements.notes.value
    };
    if (!editingAsset) payload.file = pickedFile;
    var release = busy(submit);
    savingAsset = true;
    if (!editingAsset) showUploadProgress(pickedFile);
    try {
      var saved = await api.saveAsset(payload);
      assetStatus.textContent = editingAsset ? saved.name + ' updated for ' + clientName(saved.client) + '.'
        : pickedFile.name + ' uploaded for ' + clientName(saved.client) + '.';
      savingAsset = false;
      assetEditor.close();
    } catch (error) {
      if (editingAsset) { name.setCustomValidity(error.message); assetForm.reportValidity(); }
      else fileError.textContent = 'Upload failed. ' + error.message;
    } finally { savingAsset = false; hideUploadProgress(); release(); }
  });
  // An upload in progress can't be abandoned half-way by closing the form.
  assetEditor.addEventListener('cancel', function (event) { if (savingAsset) event.preventDefault(); });

  document.getElementById('edit-asset').addEventListener('click', function () {
    var id = selectedAsset;
    assetDetail.close();
    openAssetEditor(id);
  });

  document.getElementById('delete-asset').addEventListener('click', function () {
    var item = state.assets.find(function (record) { return record.id === selectedAsset; });
    if (!item) return;
    document.getElementById('asset-confirm-text').textContent =
      'Remove "' + item.name + '" from ' + clientName(item.client) + '? This cannot be undone' + (api.persistent ? '.' : ' in this mock session.');
    assetDetail.close();
    assetConfirm.showModal();
  });

  ['asset-confirm-cancel', 'asset-confirm-close'].forEach(function (id) {
    document.getElementById(id).addEventListener('click', function () {
      assetConfirm.close();
      openAssetDetail(selectedAsset);
    });
  });

  document.getElementById('asset-confirm-ok').addEventListener('click', async function (event) {
    var control = event.currentTarget;
    if (control.disabled) return;
    var release = busy(control);
    try {
      var removed = await api.deleteAsset(selectedAsset);
      assetStatus.textContent = removed.name + (removed.fileUrl ? ' and its file' : '') + ' removed from ' + clientName(removed.client) + '.';
      selectedAsset = null;
    } catch (error) {
      assetStatus.textContent = error.message;
    } finally { release(); }
    assetConfirm.close();
  });

  document.addEventListener('click', function (event) {
    var target = event.target.closest('[data-asset]');
    if (target) openAssetDetail(target.dataset.asset);
    if (event.target.closest('[data-add-asset]')) openAssetEditor();
    if (event.target.closest('[data-close-asset-detail]')) assetDetail.close();
    if (event.target.closest('[data-close-asset-editor]') && !savingAsset) assetEditor.close();
  });

  [assetSearch, assetClient, assetCategory, assetSort].forEach(function (control) {
    control.addEventListener(control.type === 'search' ? 'input' : 'change', renderAssets);
  });
  document.getElementById('clear-asset-filters').addEventListener('click', function () {
    assetSearch.value = '';
    assetClient.value = 'all';
    assetCategory.value = 'all';
    assetSort.value = 'newest';
    renderAssets();
    assetSearch.focus();
  });

  [assetDetail, assetEditor, assetConfirm].forEach(function (dialog) {
    var sync = function () {
      document.body.classList.toggle('admin-dialog-open',
        assetDetail.open || assetEditor.open || assetConfirm.open);
    };
    dialog.addEventListener('close', sync);
    new MutationObserver(sync).observe(dialog, { attributes: true, attributeFilter: ['open'] });
  });

  /* ======================================================================
     Scripts — the studio side of script review
     ====================================================================== */
  var scriptSearch = document.getElementById('script-search');
  var scriptStatus = document.getElementById('script-status');
  var scriptClient = document.getElementById('script-client');
  var scriptSort = document.getElementById('script-sort');
  var scriptDetail = document.getElementById('script-detail');
  var scriptAction = document.getElementById('script-action');
  var scriptError = document.getElementById('script-detail-error');
  var scriptSaveStatus = document.getElementById('script-save-status');
  var selectedScript = null;
  // Work the studio can act on sorts first.
  var scriptStatusOrder = ['Revision Requested', 'Draft', 'Client Review', 'Approved'];

  fillOptions(scriptStatus, api.scriptStatuses);
  fillOptions(scriptClient, state.clients.map(function (item) { return item.id; }), clientName);

  function scriptVideo(script) {
    var video = state.videos.find(function (item) { return item.id === script.videoId; });
    return { video: video, title: video ? api.requestFor(video).title : 'Video unavailable' };
  }
  function scriptBadge(status) { return node('span', api.statusClass(status), status); }

  function visibleScripts() {
    var query = scriptSearch.value.trim().toLowerCase();
    return state.scripts.filter(function (item) {
      return (scriptStatus.value === 'all' || item.status === scriptStatus.value)
        && (scriptClient.value === 'all' || item.client === scriptClient.value)
        && [item.title, clientName(item.client)].join(' ').toLowerCase().includes(query);
    }).sort(function (a, b) {
      if (scriptSort.value === 'status') return scriptStatusOrder.indexOf(a.status) - scriptStatusOrder.indexOf(b.status) || b.updatedAt.localeCompare(a.updatedAt);
      if (scriptSort.value === 'client') return clientName(a.client).localeCompare(clientName(b.client)) || a.title.localeCompare(b.title);
      if (scriptSort.value === 'oldest') return a.updatedAt.localeCompare(b.updatedAt);
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }

  function renderScripts() {
    var records = visibleScripts();
    var rows = document.getElementById('script-rows');
    rows.replaceChildren();
    records.forEach(function (item) {
      var row = node('tr');
      var name = node('button', 'btn-link', item.title);
      name.type = 'button';
      name.dataset.script = item.id;
      name.setAttribute('aria-label', 'View ' + item.title);
      var identity = node('div');
      identity.append(name);
      if (showVersions) identity.append(node('span', 'admin-muted admin-block', 'V' + item.version));
      cell(row, identity);
      cell(row, scriptVideo(item).title);
      cell(row, clientName(item.client));
      cell(row, scriptBadge(item.status));
      cell(row, String(item.scenes.length), 'num');
      cell(row, day(item.updatedAt), 'admin-date');
      var open = node('button', 'btn-link', 'View →');
      open.type = 'button';
      open.dataset.script = item.id;
      open.setAttribute('aria-label', 'View ' + item.title);
      cell(row, open);
      rows.append(row);
    });
    document.getElementById('script-count').textContent = records.length + ' of ' + state.scripts.length + ' scripts';
    document.getElementById('script-empty').hidden = records.length > 0;
  }

  // Unsaved scene edits per script: they survive closing the dialog and
  // re-renders from other tabs until saved, sent, or the script leaves Draft.
  window.FijlyAdminScripts = { open: openScriptDetail };
  var sceneDrafts = {}, scriptNotice = null, renderedScript = '';
  var scriptSave = document.getElementById('script-save');
  function editedScenes() { return Array.from(document.querySelectorAll('#script-detail-body .admin-script-editor')).map(function (input) { return input.value; }); }
  function sceneNote(item) {
    var note = document.getElementById('script-scene-note');
    if (note) note.textContent = sceneDrafts[item.id] ? 'Unsaved changes — save the draft to keep them.' : 'Edit each scene, then save the draft or send it to the client.';
  }
  function commentList(item, body) {
    if (!item.feedback.length) body.append(node('p', 'admin-muted', 'No client feedback on this script yet.'));
    item.feedback.slice().reverse().forEach(function (entry) {
      var comment = node('article', 'comment');
      comment.append(node('p', 'comment__name', entry.author + ' · V' + entry.version + ' · ' + day(entry.at)), node('p', 'comment__text', entry.text));
      body.append(comment);
    });
  }

  function openScriptDetail(id) {
    var item = state.scripts.find(function (record) { return record.id === id; });
    if (!item) return;
    if (selectedScript !== id) { scriptError.textContent = ''; scriptNotice = null; }
    if (item.status !== 'Draft') delete sceneDrafts[id];
    // Skip rebuilding for unrelated shared-state changes so typing keeps focus.
    var signature = JSON.stringify([item, scriptNotice]);
    if (scriptDetail.open && selectedScript === id && signature === renderedScript) return;
    renderedScript = signature;
    selectedScript = id;
    var linked = scriptVideo(item), editable = item.status === 'Draft';
    document.getElementById('script-detail-title').textContent = item.title;
    var body = document.getElementById('script-detail-body');
    body.replaceChildren();
    var intro = node('div', 'admin-detail-intro');
    intro.append(scriptBadge(item.status), node('span', 'admin-muted', clientName(item.client)));
    var videoLink = node('button', 'btn-link', linked.title);
    videoLink.type = 'button';
    videoLink.disabled = !linked.video;
    videoLink.addEventListener('click', function () { scriptDetail.close(); window.FijlyWorkflow.open('videos', linked.video.id); });
    var facts = node('dl', 'admin-detail-facts');
    [['Client', clientName(item.client)], ['Related video', videoLink]].concat(showVersions ? [['Version', 'V' + item.version]] : [], [['Last updated', day(item.updatedAt)]]).forEach(function (pair) {
      var group = node('div');
      var value = node('dd');
      value.append(typeof pair[1] === 'string' ? document.createTextNode(pair[1]) : pair[1]);
      group.append(node('dt', null, pair[0]), value);
      facts.append(group);
    });
    var status = node('p', 'admin-script-state');
    if (item.status === 'Approved') { status.classList.add('admin-script-state--approved'); status.textContent = 'Approved by the client. No further action needed.'; }
    else if (item.status === 'Client Review') status.textContent = 'With the client for review. They can approve it or request a revision.';
    else if (editable) status.textContent = 'Draft' + ver(item) + ' — write or refine each scene, then send it to the client.';
    else status.textContent = 'The client asked for changes to' + (showVersions ? ' V' + item.version : ' this script') + '. Start the revision to edit the scenes for a new draft.';
    var scenes = node('ol', 'doc__body admin-script-scenes'), draft = sceneDrafts[item.id];
    item.scenes.forEach(function (scene, index) {
      var li = node('li', 'script-scene');
      var content = node('div', 'script-scene__content');
      if (editable) {
        var inputId = 'script-scene-' + index, label = node('label', 'script-scene__label', scene.label), input = node('textarea', 'input admin-script-editor');
        label.htmlFor = inputId; input.id = inputId; input.rows = 3; input.maxLength = 2000; input.value = draft ? draft[index] : scene.text;
        input.addEventListener('input', function () { sceneDrafts[item.id] = editedScenes(); sceneNote(item); });
        content.append(label, input);
      } else content.append(node('div', 'script-scene__label', scene.label), node('p', 'script-scene__text', scene.text));
      li.append(node('span', 'script-scene__no', String(index + 1).padStart(2, '0')), content);
      scenes.append(li);
    });
    if (!item.scenes.length) scenes.append(node('li', 'admin-muted', 'No scenes written yet.'));
    body.append(intro);
    // A notice describes one status; it is dropped once the script moves on.
    if (scriptNotice && scriptNotice.id === item.id && scriptNotice.status === item.status) { var notice = node('p', 'workflow-notice', scriptNotice.text); notice.setAttribute('role', 'status'); body.append(notice); }
    body.append(status, facts);
    // A requested revision leads with what the client asked for.
    if (item.status === 'Revision Requested') { var ask = node('section', 'admin-script-ask'); ask.append(node('h3', null, 'Client feedback')); commentList(item, ask); body.append(ask); }
    body.append(node('h3', null, 'Scenes'));
    if (editable) { var note = node('p', 'admin-muted'); note.id = 'script-scene-note'; body.append(note); }
    body.append(scenes);
    if (item.status !== 'Revision Requested') { body.append(node('h3', null, 'Client feedback')); commentList(item, body); }
    sceneNote(item);
    var label = { 'Revision Requested': 'Start revision', Draft: 'Send to Client Review' }[item.status];
    scriptAction.hidden = !label;
    scriptAction.textContent = label || '';
    scriptSave.hidden = !editable;
    if (!scriptDetail.open) scriptDetail.showModal();
  }

  function scriptActionDone(item, text) { scriptError.textContent = ''; scriptNotice = { id: item.id, status: item.status, text: text }; scriptSaveStatus.textContent = text; openScriptDetail(item.id); }
  // A draft is cleared only after its save succeeds, so a failed save keeps it.
  async function saveScenes(item) { if (!sceneDrafts[item.id]) return false; await api.updateScriptScenes(item.id, sceneDrafts[item.id]); delete sceneDrafts[item.id]; return true; }
  function currentScript() { return state.scripts.find(function (record) { return record.id === selectedScript; }); }
  scriptSave.addEventListener('click', async function () {
    var item = currentScript();
    if (!item || scriptSave.disabled) return;
    var release = busy(scriptSave);
    try { sceneDrafts[item.id] = editedScenes(); await saveScenes(item); item = currentScript() || item; scriptActionDone(item, item.title + ver(item) + ' draft saved.'); }
    catch (error) { scriptError.textContent = error.message; }
    finally { release(); }
  });
  scriptAction.addEventListener('click', async function () {
    var item = currentScript();
    if (!item || scriptAction.disabled) return;
    var release = busy(scriptAction);
    try {
      if (item.status === 'Revision Requested') {
        await api.adminReviewScript(item.id);
        item = currentScript() || item;
        scriptActionDone(item, 'Revision started — edit the scenes, then send' + (showVersions ? ' V' + item.version : ' it') + ' to the client.');
      } else if (item.status === 'Draft') {
        // Unsaved edits go out with the script rather than being dropped.
        await saveScenes(item);
        await api.adminSendScriptForReview(item.id);
        item = currentScript() || item;
        scriptActionDone(item, item.title + ver(item) + ' sent to the client for review.');
      }
    } catch (error) {
      scriptError.textContent = error.message;
    } finally { release(); }
    // Move focus off the action button when it is hidden for a read-only status.
    if (scriptAction.hidden) scriptDetail.querySelector('[data-close-script-detail]').focus();
  });

  document.addEventListener('click', function (event) {
    var target = event.target.closest('[data-script]');
    if (target) openScriptDetail(target.dataset.script);
    if (event.target.closest('[data-close-script-detail]')) scriptDetail.close();
  });
  [scriptSearch, scriptStatus, scriptClient, scriptSort].forEach(function (control) {
    control.addEventListener(control.type === 'search' ? 'input' : 'change', renderScripts);
  });
  document.getElementById('clear-script-filters').addEventListener('click', function () {
    scriptSearch.value = '';
    scriptStatus.value = 'all';
    scriptClient.value = 'all';
    scriptSort.value = 'newest';
    renderScripts();
    scriptSearch.focus();
  });
  var syncScriptDialog = function () { document.body.classList.toggle('admin-dialog-open', !!document.querySelector('dialog[open]')); };
  scriptDetail.addEventListener('close', syncScriptDialog);
  scriptDetail.addEventListener('close', function () { scriptNotice = null; renderedScript = ''; });
  new MutationObserver(syncScriptDialog).observe(scriptDetail, { attributes: true, attributeFilter: ['open'] });

  /* ======================================================================
     Analytics — every figure is derived from the shared records
     ====================================================================== */
  var analyticsClient = document.getElementById('analytics-client');
  var analyticsRange = document.getElementById('analytics-range');
  fillOptions(analyticsClient, state.clients.map(function (item) { return item.id; }), clientName);

  function rangeStart() {
    if (analyticsRange.value === 'all') return null;
    var end = analyticsEnd();
    var start = new Date(end);
    start.setDate(start.getDate() - Number(analyticsRange.value) + 1);
    start.setHours(0, 0, 0, 0);
    return start.toISOString();
  }
  function inRange(iso, start) { var at = Date.parse(iso); return Number.isFinite(at) && (!start || at >= Date.parse(start)) && at <= analyticsEnd().getTime(); }
  function analyticsEnd() { return new Date(); }
  function mine(request) { return analyticsClient.value === 'all' || request.client === analyticsClient.value; }

  function scoped() {
    var start = rangeStart();
    var requests = state.requests.filter(function (request) {
      return mine(request) && inRange(request.requestedAt, start);
    });
    // Videos are scoped by their request's client, and by their own most recent
    // activity so a long-running production still counts as in-range work.
    var videos = state.videos.filter(function (video) {
      var request = api.requestFor(video);
      if (!mine(request)) return false;
      var last = video.activity.length ? video.activity[video.activity.length - 1].at : request.requestedAt;
      return inRange(last, start);
    });
    var revisions = state.revisions.filter(function (revision) {
      var video = state.videos.find(function (item) { return item.id === revision.videoId; });
      if (!video) return false;
      return mine(api.requestFor(video)) && inRange(revision.requestedAt, start);
    });
    return { requests: requests, videos: videos, revisions: revisions, start: start };
  }

  function averageProductionDays(videos) {
    var spans = videos.filter(function (video) { return video.status === 'Completed' && api.completedAt(video); })
      .map(function (video) {
        var first = api.requestFor(video).requestedAt;
        var last = api.completedAt(video);
        return (Date.parse(last) - Date.parse(first)) / 86400000;
      }).filter(function (value) { return Number.isFinite(value) && value >= 0; });
    if (!spans.length) return null;
    return spans.reduce(function (total, value) { return total + value; }, 0) / spans.length;
  }

  function renderAnalytics() {
    var data = scoped();
    var clientsInScope = analyticsClient.value === 'all'
      ? state.clients.filter(function (item) { return item.status === 'Active'; }).length
      : state.clients.filter(function(c){return c.id===analyticsClient.value&&c.status==='Active';}).length;
    var completed = data.videos.filter(function (video) { return video.status === 'Completed'; });
    var production = data.videos.filter(function (video) { return video.status === 'In Production'; });
    var review = data.videos.filter(function (video) { return video.status === 'Client Review'; });
    var average = averageProductionDays(data.videos);

    document.getElementById('analytics-scope').textContent =
      (analyticsClient.value === 'all' ? 'All clients' : clientName(analyticsClient.value)) + ' · ' +
      (analyticsRange.value === 'all' ? 'All time' : 'Last ' + analyticsRange.value + ' days') + ' · ' +
      data.videos.length + (data.videos.length === 1 ? ' video, ' : ' videos, ') + data.requests.length + (data.requests.length === 1 ? ' request' : ' requests') + ' in scope through ' + api.formatDate(analyticsEnd());

    var kpis = document.getElementById('analytics-kpis');
    kpis.replaceChildren();
    [
      ['Active clients', clientsInScope, analyticsClient.value === 'all' ? state.clients.length + ' in the studio' : 'Filtered to one client'],
      ['New requests', data.requests.length, 'Submitted in range'],
      ['In production', production.length, 'Being produced now'],
      ['Awaiting review', review.length, 'With the client now'],
      ['Completed', completed.length, 'Delivered in range'],
      ['Revision rounds', data.revisions.length, 'Opened in range'],
      ['Avg. production time', average === null ? '—' : average.toFixed(1) + 'd', average === null ? 'No completed videos in range' : 'Request to delivery'],
      ['Assets on file', analyticsClient.value === 'all' ? state.assets.length : api.assetsFor(analyticsClient.value).length, 'Client-supplied files']
    ].forEach(function (stat) {
      var card = node('article', 'stat-card');
      var value = typeof stat[1] === 'number' ? String(stat[1]).padStart(2, '0') : stat[1];
      // h2 matches the Dashboard stat cards and keeps the h1 -> h2 order valid.
      card.append(node('h2', 'stat-card__label', stat[0]),
        node('div', 'stat-card__value', value),
        node('div', 'stat-card__delta stat-card__delta--muted', stat[2]));
      kpis.append(card);
    });

    // Production status breakdown
    var stages = document.getElementById('analytics-stages');
    stages.replaceChildren();
    api.videoStatuses.forEach(function (stage) {
      var count = data.videos.filter(function (video) { return video.status === stage; }).length;
      var item = node('li');
      var label = node('div', 'admin-pipeline-label');
      label.append(node('span', null, stage), node('strong', null, String(count)));
      var bar = node('div', 'progress-bar');
      bar.setAttribute('aria-hidden', 'true');
      var fill = node('div', 'progress-bar__fill');
      // Reuse the workflow badge's tone without changing status definitions.
      fill.className += ' ' + api.statusClass(stage).replace('badge ', '');
      fill.style.width = (data.videos.length ? count / data.videos.length * 100 : 0) + '%';
      bar.append(fill);
      item.append(label, bar);
      stages.append(item);
    });

    // Recent trend: completions vs revision rounds per week
    renderTrend(data);

    // Client activity table
    var tbody = document.getElementById('analytics-clients');
    tbody.replaceChildren();
    var perClient = state.clients.filter(function (item) {
      return analyticsClient.value === 'all' || item.id === analyticsClient.value;
    }).map(function (item) {
      var videos = data.videos.filter(function (video) { return api.requestFor(video).client === item.id; });
      return {
        name: item.name,
        requests: data.requests.filter(function (request) { return request.client === item.id; }).length,
        production: videos.filter(function (video) { return video.status === 'In Production'; }).length,
        completed: videos.filter(function (video) { return video.status === 'Completed'; }).length,
        revisions: data.revisions.filter(function (revision) {
          var video = state.videos.find(function (record) { return record.id === revision.videoId; });
          return video && api.requestFor(video).client === item.id;
        }).length
      };
    }).filter(function (row) { return row.requests || row.production || row.completed || row.revisions; })
      .sort(function (a, b) { return (b.completed + b.production) - (a.completed + a.production) || a.name.localeCompare(b.name); });
    perClient.forEach(function (row) {
      var tr = node('tr');
      cell(tr, row.name);
      cell(tr, String(row.requests), 'num');
      cell(tr, String(row.production), 'num');
      cell(tr, String(row.completed), 'num');
      cell(tr, String(row.revisions), 'num');
      tbody.append(tr);
    });
    document.getElementById('analytics-clients-empty').hidden = perClient.length > 0;

    // Approval quality
    var quality = document.getElementById('analytics-quality');
    quality.replaceChildren();
    // Only videos the client has signed off (Approved or Completed) have
    // finished review; work still in production or review is not counted.
    var reviewed = data.videos.filter(function (video) { return ['Approved', 'Completed'].includes(video.status); });
    var withRevision = reviewed.filter(function (video) { return api.rounds(video).length > 0; });
    var firstPass = reviewed.length - withRevision.length;
    var roundsPer = withRevision.length
      ? (withRevision.reduce(function (total, video) { return total + api.rounds(video).length; }, 0) / withRevision.length)
      : 0;
    [
      ['Approved without revision', firstPass + ' / ' + reviewed.length],
      ['Needed at least one round', withRevision.length + ' / ' + reviewed.length],
      ['Avg. rounds when revised', withRevision.length ? roundsPer.toFixed(1) : '—'],
      ['Revision rounds still open', String(data.revisions.filter(function (revision) { return revision.status !== 'Resolved'; }).length)]
    ].forEach(function (pair) {
      var item = node('li');
      item.append(node('strong', null, pair[1]), node('span', null, pair[0]));
      quality.append(item);
    });
  }

  function renderTrend(data) {
    var host = document.getElementById('analytics-trend');
    host.replaceChildren();
    var end = analyticsEnd();
    var weeks = 6;
    var buckets = [];
    for (var index = weeks - 1; index >= 0; index -= 1) {
      var to = new Date(end);
      to.setUTCDate(to.getUTCDate() - index * 7);
      if (index > 0) to.setUTCHours(23, 59, 59, 999);
      var from = new Date(to);
      from.setUTCDate(from.getUTCDate() - 6);from.setUTCHours(0,0,0,0);
      buckets.push({
        // Short axis label; the text summary uses the full date format.
        label: from.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
        full: api.formatDate(from.toISOString().slice(0, 10)) + ' to ' + api.formatDate(to.toISOString().slice(0, 10)),
        from: from.toISOString(),
        to: to.toISOString(),
        completed: 0,
        revisions: 0
      });
    }
    data.videos.forEach(function (video) {
      if (video.status !== 'Completed' || !api.completedAt(video)) return;
      var at = api.completedAt(video);
      var bucket = buckets.find(function (item) { return at >= item.from && at <= item.to; });
      if (bucket) bucket.completed += 1;
    });
    data.revisions.forEach(function (revision) {
      var bucket = buckets.find(function (item) { return revision.requestedAt >= item.from && revision.requestedAt <= item.to; });
      if (bucket) bucket.revisions += 1;
    });
    var peak = Math.max(1, ...buckets.map(function (item) { return Math.max(item.completed, item.revisions); }));
    var chart = node('div', 'admin-trend');
    buckets.forEach(function (bucket) {
      var column = node('div', 'admin-trend__col');
      var bars = node('div', 'admin-trend__bars');
      [['completed', bucket.completed, 'Completed'], ['revisions', bucket.revisions, 'Revision rounds']].forEach(function (pair) {
        var bar = node('span', 'admin-trend__bar admin-trend__bar--' + pair[0]);
        bar.style.height = Math.max(2, pair[1] / peak * 100) + '%';
        bar.title = pair[2] + ': ' + pair[1];
        bars.append(bar);
      });
      column.append(bars, node('span', 'admin-trend__label', bucket.label));
      chart.append(column);
    });
    var legend = node('ul', 'admin-trend__legend');
    [['completed', 'Completed'], ['revisions', 'Revision rounds']].forEach(function (pair) {
      var item = node('li');
      var swatch = node('span', 'admin-trend__key admin-trend__key--' + pair[0]);
      swatch.setAttribute('aria-hidden', 'true');
      item.append(swatch, node('span', null, pair[1]));
      legend.append(item);
    });
    // The bars are decorative; the same numbers are available as text.
    chart.setAttribute('aria-hidden', 'true');
    var summary = node('p', 'visually-hidden', buckets.map(function (bucket) {
      return bucket.full + ': ' + bucket.completed + ' completed, ' + bucket.revisions + (bucket.revisions === 1 ? ' revision round' : ' revision rounds');
    }).join(' · '));
    summary.id = 'analytics-trend-description';
    host.append(chart, legend, summary);
    host.closest('section').setAttribute('aria-describedby', summary.id);
  }

  [analyticsClient, analyticsRange].forEach(function (control) {
    control.addEventListener('change', renderAnalytics);
  });

  /* ======================================================================
     Settings
     ====================================================================== */
  var settingsForm = document.getElementById('settings-form');
  var settingsStatus = document.getElementById('settings-status');
  var TEXT_KEYS = ['adminName', 'adminRole', 'adminEmail', 'studioName', 'studioEmail', 'studioLocation', 'defaultPriority', 'defaultLength'];
  // Set while the form has unsaved edits, so a state change broadcast from
  // another tab cannot overwrite what is being typed here.
  var settingsDirty = false;
  var TOGGLE_KEYS = ['notifyNewRequest', 'notifyRevision', 'notifyApproval', 'notifyWeeklyDigest'];

  // The sidebar shows the saved Admin profile, so it matches Settings.
  function renderIdentity() {
    var values = state.settings || {}, name = values.adminName || 'Studio admin';
    document.getElementById('admin-name').textContent = name;
    document.getElementById('admin-role').textContent = values.adminRole || 'FIJLY Studio';
  }

  function loadSettings() {
    var values = state.settings || {};
    TEXT_KEYS.forEach(function (key) {
      if (settingsForm.elements[key]) settingsForm.elements[key].value = values[key] || '';
    });
    settingsForm.elements.defaultLeadDays.value = values.defaultLeadDays || 10;
    TOGGLE_KEYS.forEach(function (key) {
      var input = settingsForm.elements[key];
      if (!input) return;
      input.checked = !!values[key];
      input.setAttribute('role', 'switch');
      input.setAttribute('aria-checked', String(input.checked));
    });
  }

  TOGGLE_KEYS.forEach(function (key) {
    var input = settingsForm.elements[key];
    if (input) input.addEventListener('change', function () {
      input.setAttribute('aria-checked', String(input.checked));
    });
  });

  settingsForm.addEventListener('input', function (event) {
    settingsDirty = true;
    if (event.target.setCustomValidity) event.target.setCustomValidity('');
  });
  settingsForm.addEventListener('change', function () { settingsDirty = true; });

  settingsForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    var submit = settingsForm.querySelector('[type="submit"]');
    if (submit.disabled) return;
    var values = {};
    TEXT_KEYS.forEach(function (key) {
      if (settingsForm.elements[key]) values[key] = settingsForm.elements[key].value.trim();
    });
    values.defaultLeadDays = settingsForm.elements.defaultLeadDays.value;
    TOGGLE_KEYS.forEach(function (key) {
      if (settingsForm.elements[key]) values[key] = settingsForm.elements[key].checked;
    });
    if (!settingsForm.reportValidity()) return;
    var release = busy(submit);
    try {
      await api.saveSettings(values);
      settingsDirty = false;
      loadSettings();
      settingsStatus.textContent = api.persistent ? 'Settings saved.' : 'Settings saved for this mock session.';
    } catch (error) {
      settingsStatus.textContent = error.message;
      var field = /studio email/i.test(error.message) ? settingsForm.elements.studioEmail : settingsForm.elements.adminEmail;
      if (/email/i.test(error.message) && field) { field.setCustomValidity(error.message); field.reportValidity(); }
    } finally { release(); }
  });

  document.getElementById('settings-reset').addEventListener('click', function () {
    settingsDirty = false;
    loadSettings();
    settingsStatus.textContent = 'Unsaved changes discarded.';
  });

  /* ====================================================================== */
  api.subscribe(function (changed) {
    if(changed.includes('clients'))[assetClient,analyticsClient,scriptClient,document.getElementById('asset-form-client')].forEach(function(select){var value=select.value;fillOptions(select,state.clients.map(function(c){return c.id;}),clientName);select.value=Array.from(select.options).some(function(o){return o.value===value;})?value:(select.querySelector('[value="all"]')?'all':(state.clients[0]||{}).id||'');});
    if(changed.some(function(k){return ['clients','assets'].includes(k);}))renderAssets();
    if(changed.some(function(k){return ['clients','requests','videos','revisions','assets'].includes(k);}))renderAnalytics();
    if (changed.includes('settings')) renderIdentity();
    if (!settingsDirty && changed.includes('settings')) loadSettings();
    if(assetDetail.open){if(state.assets.some(function(a){return a.id===selectedAsset;}))openAssetDetail(selectedAsset);else assetDetail.close();}
    if(assetEditor.open&&editingAsset&&!state.assets.some(function(a){return a.id===editingAsset;})){assetEditor.close();assetStatus.textContent='This asset was removed in another tab.';}
    if(changed.some(function(k){return ['clients','requests','videos','scripts'].includes(k);}))renderScripts();
    if(scriptDetail.open){if(state.scripts.some(function(s){return s.id===selectedScript;}))openScriptDetail(selectedScript);else scriptDetail.close();}
  });
  renderAssets();
  renderScripts();
  renderAnalytics();
  renderIdentity();
  loadSettings();
})();
