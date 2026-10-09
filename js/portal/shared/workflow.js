/* Shared operational UI for both portals. Both read and write Supabase through
   FijlyData (the Client portal through its workspace view, FijlyData.client).
   Writes are async and awaited; controls stay busy until they settle. */
(function () {
  'use strict';
  var api = window.FijlyData, state = api.state, admin = document.body.classList.contains('admin-body');
  var filters = {}, current = null, clientFilter = 'all', notice = null;
  var closeIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  var playIcon = '<svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
  function el(tag, text, cls) { var node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (cls) node.className = cls; return node; }
  // `style` is true for the primary button, or a class list for another variant.
  function button(text, fn, style) { var node = el('button', text, 'btn btn--md ' + (style === true ? 'btn-primary' : style || 'btn-outline')); node.type = 'button'; node.onclick = function () { run(node, fn); }; return node; }
  // Runs an action that may be async; the control is busy until it settles, so
  // a slow save cannot be submitted twice.
  function run(control, fn) {
    if (control.disabled) return Promise.resolve();
    control.disabled = true; control.setAttribute('aria-busy', 'true');
    return Promise.resolve().then(fn).catch(showError).finally(function () { control.disabled = false; control.removeAttribute('aria-busy'); });
  }
  function badge(text) { return el('span', text, api.statusClass(text)); }
  function stageBadge(stage) { return el('span', stage, api.stageClass(stage)); }
  function money(value) { return api.formatMoney(value, 'Not priced'); }
  // The price the project was saved with (from submit_project), never recalculated.
  function priceBreakdown(request) {
    var prices = request.prices || {}, list = el('dl', undefined, 'price-lines');
    function line(label, value, provided) {
      var row = el('div'), amount = provided ? 'Provided by you' : value === 0 ? 'Included' : money(value);
      row.append(el('dt', label), el('dd', amount));
      return row;
    }
    list.append(line('Base video', prices.base, false),
      line('Script writing', prices.script, request.hasScript),
      line('Voice over', prices.voiceOver, request.hasVoiceOver));
    var total = el('div', undefined, 'price-lines__total');
    total.append(el('dt', 'Total'), el('dd', money(prices.total)));
    list.append(total);
    return list;
  }
  // The three milestones, with the one the current stage makes payable marked.
  function paymentsCard(request) {
    var rows = api.paymentsFor(request.id), box = el('div', undefined, 'payment-rows');
    if (!rows.length) { box.append(el('p', 'No payment schedule recorded for this project.', 'admin-muted')); return box; }
    rows.forEach(function (payment) {
      var row = el('div', undefined, 'payment-row' + (payment.status === 'due' && payment.required ? ' payment-row--required' : ''));
      var name = el('div', undefined, 'payment-row__name');
      name.append(document.createTextNode(api.milestoneLabel(payment.milestone) + ' · ' + payment.percent + '%'));
      var amount = el('div', money(payment.amount), 'payment-row__amount');
      var meta = el('div', undefined, 'payment-row__meta');
      meta.append(el('span', api.paymentLabel(payment.status), api.paymentClass(payment.status)));
      if (payment.paidAt) meta.append(document.createTextNode(' ' + api.paymentLabel(payment.status).toLowerCase() + ' ' + date(payment.paidAt)));
      if (admin && payment.reference) meta.append(document.createTextNode(' · ' + payment.reference));
      row.append(name, amount, meta);
      box.append(row);
    });
    return box;
  }
  // Opens a script or voice over through a one-hour signed URL. The tab is
  // opened inside the click so pop-up blockers allow it.
  function fileButton(label, path) {
    var node = el('button', label, 'btn btn-outline btn--md'); node.type = 'button';
    node.onclick = function () {
      if (node.disabled) return;
      var tab = window.open('', '_blank');
      run(node, async function () {
        try { var url = await api.projectFileUrl(path); if (tab) { tab.opener = null; tab.location.href = url; } else window.open(url, '_blank', 'noopener'); }
        catch (error) { if (tab) tab.close(); throw error; }
      });
    };
    return node;
  }
  // The project details the order wizard collects, with plain fallbacks.
  function projectFacts(request) {
    return factGrid({
      'Video purpose': request.purpose || 'Not provided',
      'Target audience': request.targetAudience || 'Not provided',
      'Video style': request.videoStyle || 'Open to suggestions',
      'Brand colors': request.brandColors || 'Not provided',
      Script: request.hasScript ? 'Provided by the client' : 'Written by FIJLY',
      'Voice over': request.hasVoiceOver ? 'Provided by the client' : 'Recorded by FIJLY'
    });
  }
  function client(request) { return api.get('clients', request.client); }
  function date(value) { return api.formatDate(value); }
  function requestFor(kind, item) { return kind === 'requests' ? item : api.requestFor(kind === 'videos' ? item : api.get('videos', item.videoId)); }
  function files(input) { return Array.from(input.files || []).map(function (file) { return { name:file.name,size:file.size,type:file.type }; }); }
  // Every dialog shares one shape: × in the head, content in the body, and a
  // footer with the dismiss button on the left and the primary action last.
  function dialog(id, title, dismissText) {
    var d = el('dialog', undefined, 'admin-dialog workflow-detail'); d.id = id; d.setAttribute('aria-labelledby', id + '-title');
    var head = el('div', undefined, 'admin-dialog-head'), h = el('h2', title), x = el('button', undefined, 'icon-btn'); h.id = id + '-title';
    x.type = 'button'; x.setAttribute('aria-label', 'Close dialog'); x.innerHTML = closeIcon; x.onclick = function () { d.close(); };
    var body = el('div', undefined, 'workflow-body'), foot = el('div', undefined, 'admin-dialog-foot'), dismiss = el('button', dismissText, 'btn btn-ghost btn--md dialog-dismiss');
    dismiss.type = 'button'; dismiss.onclick = function () { d.close(); };
    head.append(h, x); foot.append(dismiss); d.append(head, body, foot); document.body.append(d);
    d.addEventListener('close', function () { document.body.classList.toggle('admin-dialog-open', !!document.querySelector('dialog[open]')); });
    return { node:d, title:h, body:body, foot:foot, dismiss:dismiss };
  }
  function footer(d, actions) { d.foot.replaceChildren(d.dismiss); actions.forEach(function (action) { d.foot.append(action); }); }
  var detail = dialog('workflow-detail','Details','Close'), editor = dialog('workflow-editor','Edit details','Cancel'), confirm = dialog('workflow-confirm','Confirm action','Cancel');
  detail.node.addEventListener('close', function () { notice = null; });
  function open(d) { if (!d.node.open) d.node.showModal(); document.body.classList.add('admin-dialog-open'); }
  function showError(error) { var target = confirm.node.open ? confirm.body : editor.node.open ? editor.body : detail.body; var old = target.querySelector('.workflow-error'); if (old) old.remove(); var p = el('p',error.message,'workflow-error'); p.setAttribute('role','alert'); target.prepend(p); }
  // A confirmation message for the record shown in the detail dialog; it stays
  // through shared-state re-renders until the dialog closes or changes record.
  function flash(text) { if (current) notice = { kind:current.kind, id:current.id, text:text, fresh:true }; }
  function confirmation(title, message, action) { confirm.title.textContent = title; confirm.body.replaceChildren(el('p',message)); footer(confirm, [button('Confirm',async function(){ await action(); confirm.node.close(); if (detail.node.open) renderDetail(); },true)]); open(confirm); }
  // The database keeps the editor on the video, so it is set once a request is in production.
  function editorEditable(request) { return !api.capabilities || api.capabilities.requestEditorBeforeProduction !== false || state.videos.some(function (v) { return v.requestId === request.id; }); }
  function factGrid(values) { var grid = el('dl',undefined,'admin-detail-facts'); Object.entries(values).forEach(function(pair){var wrap=el('div');wrap.append(el('dt',pair[0]),el('dd',pair[1] || 'Unassigned'));grid.append(wrap);});return grid; }
  function field(form, name, label, value, type, options) { var wrap=el('div',undefined,'form-group'), l=el('label',label,'field-label'), input=el(options?'select':type==='textarea'?'textarea':'input',undefined,'input'); input.name=name;input.id='wf-'+name;l.htmlFor=input.id;if(options)options.forEach(function(v){var o=el('option',v);o.value=v;input.append(o);});else if(type!=='textarea')input.type=type||'text';input.value=value||'';if(type==='file'){input.multiple=true;input.classList.add('workflow-file');}wrap.append(l,input);form.append(wrap);return input; }
  function formEditor(title, build, save, submitText) {
    editor.title.textContent=title;editor.body.replaceChildren();var form=el('form');form.id='workflow-editor-form';build(form);
    var error=el('p',undefined,'workflow-error');error.setAttribute('role','alert');form.append(error);
    var submit=el('button',submitText||'Save','btn btn-primary btn--md');submit.type='submit';submit.setAttribute('form',form.id);footer(editor,[submit]);
    form.onsubmit=async function(e){e.preventDefault();if(!editor.node.open||submit.disabled)return;error.textContent='';submit.disabled=true;submit.setAttribute('aria-busy','true');try{await save(form);editor.node.close();if(detail.node.open)renderDetail();}catch(err){error.textContent=err.message;}finally{submit.disabled=false;submit.removeAttribute('aria-busy');}};
    editor.body.append(form);open(editor);
  }
  function editRequest(request, full) { formEditor(full?'Edit request':'Production details',function(form){ if(full){['title','platform','videoType'].forEach(function(k){field(form,k,{title:'Video title',platform:'Platform',videoType:'Video type'}[k],request[k]).required=true;});field(form,'instructions','Instructions',request.instructions,'textarea').required=true;field(form,'references','Reference links (one per line)',request.references.join('\n'),'textarea');field(form,'attachments','Add attachments (metadata only)','','file');field(form,'priority','Priority',request.priority,null,['Low','Normal','High','Urgent']);}if(editorEditable(request))field(form,'assignedEditor','Assigned Editor',request.assignedEditor);field(form,'deadline','Deadline',request.deadline,'date').required=true;},async function(form){var input=Object.fromEntries(new FormData(form));delete input.attachments;await api.updateRequest(request.id,input,full?files(form.elements.attachments):[]);flash(full?'Request updated.':'Production details saved.');}); }
  function addVersion(video) { formEditor('Add V'+(video.versions.length+1),function(form){form.append(el('p','Simulated upload: only the file name is stored. No media is uploaded.','admin-muted'));field(form,'file','Video file (optional)','','file').accept='video/*';field(form,'notes','Version notes','','textarea');},async function(form){var version=await api.addVersion(video.id,form.elements.file.files[0] ? form.elements.file.files[0].name : '',form.elements.notes.value);flash('V'+version.number+' added. Earlier versions are kept.');}); }
  function feedback(video) {
    var version='V'+api.latest(video).number;
    formEditor(admin?'Record client revision feedback':'Request a revision',function(form){
      var input=field(form,'feedback',admin?'Client feedback':'What should we change?','','textarea'),hint=el('p',(admin?'Attached to ':'Your notes are attached to ')+version+'. Earlier feedback stays in the history.','field-hint');
      input.required=true;input.maxLength=3000;hint.id='wf-feedback-hint';input.setAttribute('aria-describedby',hint.id);input.parentNode.append(hint);
    },async function(form){
      if(admin){var round=await api.requestRevision(video.id,form.elements.feedback.value,client(api.requestFor(video)).contact);flash('Revision round '+round.round+' recorded on '+version+'.');}
      else{await api.client.revise(video.id,form.elements.feedback.value);flash('Feedback sent — the studio will start revisions.');}
    },admin?'Record revision':'Send revision request');
  }
  // An admin moves a project through the stages no payment or storyboard
  // review drives. The rest are set by the database when a milestone is paid
  // or a storyboard is reviewed, so they are not offered here.
  function changeStage(request) {
    formEditor('Project stage', function (form) {
      form.append(el('p', 'Current stage: ' + request.stage + '. Payment and storyboard stages are set when a milestone is paid or a storyboard is reviewed.', 'admin-muted'));
      var select = field(form, 'stage', 'Move to stage', request.stage, null, api.adminStages);
      select.required = true;
    }, async function (form) {
      await api.setProjectStage(request.id, form.elements.stage.value);
      flash('Stage changed to ' + form.elements.stage.value + '.');
    }, 'Save stage');
  }
  function changeVideo(video, status) { confirmation(status, status==='Completed'?'Complete this video? Its request will also be marked Completed.':status==='Approved'?'Approve the current version and resolve its open revision?':'Change this video to '+status+'?',async function(){if(admin){await api.setVideoStatus(video.id,status);flash('Status changed to '+status+'.');}else{await api.client.approve(video.id);flash('Thanks — the studio has been notified. Your video will be finalized.');}}); }
  function show(kind,id) { if(!admin)api.client.get(kind,id); if(notice&&(notice.kind!==kind||notice.id!==id))notice=null; current={kind:kind,id:id};renderDetail();open(detail); }
  // No media is stored in this preview, so the player area says so plainly.
  function media(latest) {
    var box=el('div',undefined,'media-placeholder'),icon=el('span',undefined,'media-placeholder__icon');icon.innerHTML=playIcon;
    box.append(icon,el('p',latest?'Video preview not available in demo — in production, '+(admin?'the latest draft':'your draft')+' plays here':admin?'No draft yet — add the first version to start client review':'No draft yet — your first draft will play here when it is ready','media-placeholder__text'));
    return box;
  }
  function reviewBar(video) {
    var bar=el('section',undefined,'review-bar'),label=el('h3','What do you think of this draft?','review-bar__label'),buttons=el('div',undefined,'review-bar__actions');
    label.id='review-bar-label';bar.setAttribute('aria-labelledby',label.id);
    var approve=button('Approve video',function(){changeVideo(video,'Approved');},'btn-success');approve.classList.replace('btn--md','btn--lg');
    buttons.append(button('Request revision',function(){feedback(video);}),approve);bar.append(label,buttons);return bar;
  }
  function history(body, video) {
    body.append(el('h3','Versions'));
    if(!video.versions.length)body.append(el('p',admin?'No versions yet. Add the first version when the draft is ready.':'No versions yet. Your first draft will appear here when ready.','admin-muted'));
    video.versions.slice().reverse().forEach(function(version){var row=el('details',undefined,'workflow-version');row.append(el('summary','V'+version.number+' · '+version.filename),el('p',version.notes),el('p',date(version.createdAt)+' · Simulated media · No playable file uploaded','admin-muted'));body.append(row);});
    body.append(el('h3','Client feedback'));
    if(!video.feedback.length)body.append(el('p','No client feedback yet.','admin-muted'));
    video.feedback.slice().reverse().forEach(function(f){var row=el('div',undefined,'workflow-entry');row.append(el('strong',f.author+' · V'+f.version+' · '+date(f.at)),el('p',f.text));body.append(row);});
    body.append(el('h3','Revision history'));
    if(!api.rounds(video).length)body.append(el('p','No revision rounds requested.','admin-muted'));
    api.rounds(video).slice().reverse().forEach(function(r){var row=el('div',undefined,'workflow-entry');row.append(button('Round '+r.round+' · '+r.status,function(){show('revisions',r.id);}),el('p',r.resolution || 'Feedback on V'+r.baseVersion+(r.submittedVersion?' · Returned as V'+r.submittedVersion:''),'admin-muted'));body.append(row);});
    body.append(el('h3','Activity timeline'));video.activity.slice().reverse().forEach(function(a){var row=el('div',undefined,'workflow-entry');row.append(el('p',a.text),el('small',api.formatDateTime(a.at),'admin-muted'));body.append(row);});
  }

  /* ======================================================================
     Milestone sections: the progress stepper, the storyboard rounds and the
     preview / final video. Both portals render the same blocks; what differs
     is who may act on them.
     ====================================================================== */

  // Where the project stands, as a row of steps. The state is in the text as
  // well as the colour, so it reads the same to a screen reader.
  function progressStepper(request) {
    var progress = api.progressFor(request);
    var list = el('ol', undefined, 'progress-steps');
    list.setAttribute('aria-label', 'Project progress');
    progress.steps.forEach(function (step) {
      var item = el('li', undefined, 'progress-step is-' + step.state);
      var dot = el('span', undefined, 'progress-step__dot');
      dot.setAttribute('aria-hidden', 'true');
      var label = el('span', step.label, 'progress-step__label');
      var state = el('span', step.state === 'done' ? ' (done)' : step.state === 'current' ? ' (current step)' : ' (not started)', 'visually-hidden');
      if (step.state === 'current') item.setAttribute('aria-current', 'step');
      item.append(dot, label, state);
      list.append(item);
    });
    var wrap = el('div', undefined, 'progress-tracker' + (progress.cancelled ? ' progress-tracker--cancelled' : ''));
    wrap.append(list, el('p', progress.cancelled ? 'This project was cancelled.' : 'Current stage: ' + request.stage, 'progress-tracker__now'));
    return wrap;
  }

  // An inline action bar with its own error line, so an RPC refusal (a revision
  // limit, a stage that moved on) is shown next to the button that caused it.
  function actionBar() {
    var bar = el('div', undefined, 'review-actions'), row = el('div', undefined, 'review-actions__row');
    var error = el('p', undefined, 'workflow-error');
    error.setAttribute('role', 'alert');
    bar.append(row, error);
    bar.row = row;
    bar.fail = function (message) { error.textContent = message; };
    // Runs an async action, keeping the control busy and reporting inline.
    bar.run = function (control, work) {
      if (control.disabled) return;
      error.textContent = '';
      control.disabled = true; control.setAttribute('aria-busy', 'true');
      Promise.resolve().then(work).catch(function (problem) { error.textContent = problem.message; })
        .finally(function () { control.disabled = false; control.removeAttribute('aria-busy'); });
    };
    return bar;
  }
  // A plain button for an action bar (no shared error handling).
  function barButton(text, style) {
    var node = el('button', text, 'btn btn--md ' + (style || 'btn-outline'));
    node.type = 'button';
    return node;
  }
  // A required feedback box that only appears once "Request changes" is chosen.
  function feedbackBox(id, label) {
    var wrap = el('div', undefined, 'review-feedback'), field = el('label', label, 'field-label');
    var input = el('textarea', undefined, 'input');
    input.id = id; input.maxLength = 4000; input.rows = 3; field.htmlFor = input.id;
    wrap.hidden = true;
    wrap.append(field, input);
    wrap.input = input;
    return wrap;
  }

  /* Storyboards ----------------------------------------------------------- */
  function extensionOf(path) { var match = /\.([a-z0-9]+)$/i.exec(String(path || '')); return match ? match[1].toLowerCase() : ''; }

  // Shows the storyboard itself: a still inline, an MP4 in a player, a PDF as
  // a link. The signed URL arrives after the dialog has rendered.
  function storyboardPreview(storyboard) {
    var box = el('div', undefined, 'sb-preview'), extension = extensionOf(storyboard.filePath);
    box.append(el('p', 'Loading the storyboard…', 'admin-muted'));
    var url = admin ? api.storyboardUrl(storyboard) : api.client.storyboardUrl(storyboard);
    url.then(function (href) {
      if (['png', 'jpg', 'jpeg'].includes(extension)) {
        var image = el('img', undefined, 'sb-preview__image');
        image.src = href; image.alt = 'Storyboard round ' + storyboard.round;
        image.onerror = function () { box.replaceChildren(el('p', 'This storyboard image could not be displayed.', 'admin-muted')); };
        box.replaceChildren(image);
        return;
      }
      if (extension === 'mp4') {
        var player = document.createElement('video');
        player.className = 'sb-preview__video'; player.src = href; player.controls = true;
        player.setAttribute('controlsList', 'nodownload'); player.setAttribute('playsinline', '');
        box.replaceChildren(player);
        return;
      }
      var link = el('a', 'Open the storyboard (PDF)', 'btn btn-outline btn--md');
      link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer';
      box.replaceChildren(link);
    }).catch(function (problem) {
      box.replaceChildren(el('p', 'Couldn’t load the storyboard. ' + problem.message, 'workflow-error'));
    });
    return box;
  }

  // One round, read-only: who sent what, and what came back.
  function storyboardRound(storyboard, withPreview) {
    var card = el('div', undefined, 'sb-round'), head = el('div', undefined, 'sb-round__head');
    head.append(el('strong', 'Round ' + storyboard.round), el('span', storyboard.status, api.storyboardClass(storyboard.status)),
      el('span', date(storyboard.createdAt), 'admin-muted'));
    card.append(head);
    if (withPreview && storyboard.filePath) card.append(storyboardPreview(storyboard));
    if (storyboard.notes) card.append(el('p', storyboard.notes, 'workflow-feedback'));
    if (admin && storyboard.filePath) card.append(fileButton('Download round ' + storyboard.round, storyboard.filePath));
    if (storyboard.clientFeedback) {
      card.append(el('h4', 'Client feedback'), el('blockquote', storyboard.clientFeedback, 'workflow-feedback'));
    }
    if (storyboard.reviewedAt) card.append(el('p', 'Reviewed ' + date(storyboard.reviewedAt), 'admin-muted'));
    return card;
  }

  // The studio sends a round: upload the file, write the row, move the stage.
  function uploadStoryboard(request) {
    formEditor('Upload storyboard', function (form) {
      form.append(el('p', 'The client is asked to approve this round. PDF, PNG, JPG or MP4, up to 50MB.', 'admin-muted'));
      var picker = field(form, 'file', 'Storyboard file', '', 'file');
      picker.multiple = false; picker.accept = api.storyboardAccept; picker.required = true;
      field(form, 'notes', 'Notes for the client', '', 'textarea');
    }, async function (form) {
      var file = form.elements.file.files[0];
      var problem = api.validateStoryboardFile(file);
      if (problem) throw new Error(problem);
      var saved = await api.addStoryboard(request.id, file, form.elements.notes.value);
      flash('Storyboard round ' + saved.round + ' sent for review.');
    }, 'Send for review');
  }

  function storyboardSection(body, request, secondary) {
    var rounds = admin ? api.storyboardsFor(request.id) : api.client.storyboardsFor(request.id);
    var canUpload = admin && api.canUploadStoryboard(request);
    if (!rounds.length && !canUpload) return;
    var limits = api.storyboardRevisions(request.id);
    body.append(el('h3', 'Storyboard'));
    body.append(el('p', 'Storyboard revisions used: ' + limits.used + ' of ' + limits.included, 'admin-muted'));
    if (canUpload) secondary.push(button(rounds.length ? 'Upload new storyboard' : 'Upload storyboard', function () { uploadStoryboard(request); }));
    if (!rounds.length) { body.append(el('p', 'No storyboard has been sent yet.', 'admin-muted')); return; }

    var latest = rounds[rounds.length - 1], earlier = rounds.slice(0, -1);
    // The client reviews the latest round while it is waiting on them.
    if (!admin && latest.status === 'Ready') {
      var card = el('div', undefined, 'sb-current');
      card.append(el('p', 'This storyboard is waiting for your approval.', 'workflow-notice'), storyboardRound(latest, true));
      var bar = actionBar(), notes = feedbackBox('sb-feedback-' + latest.id, 'What should we change?');
      var approve = barButton('Approve storyboard', 'btn-success'), changes = barButton('Request changes');
      approve.onclick = function () {
        bar.run(approve, async function () {
          await api.client.reviewStoryboard(latest.id, true);
          flash('Storyboard approved. We will invoice the 45% storyboard milestone next.');
        });
      };
      changes.onclick = function () {
        // First click reveals the box; the second sends what is in it.
        if (notes.hidden) { notes.hidden = false; notes.input.focus(); changes.textContent = 'Send change request'; return; }
        bar.run(changes, async function () {
          await api.client.reviewStoryboard(latest.id, false, notes.input.value);
          flash('Thanks — your notes are with the studio.');
        });
      };
      bar.row.append(changes, approve);
      card.append(notes, bar);
      body.append(card);
    } else {
      body.append(storyboardRound(latest, true));
      // Once approved, say plainly what the client owes before production.
      if (!admin && latest.status === 'Approved' && request.stage === 'Storyboard Approved') {
        var owed = api.paymentsFor(request.id).find(function (payment) { return payment.milestone === 'storyboard'; });
        body.append(el('p', 'Storyboard approved. Next: 45% payment of ' + api.formatMoney(owed && owed.amount, 'the storyboard milestone')
          + ' to start production. We’ll send a PayPal invoice.', 'workflow-notice'));
      }
    }
    if (earlier.length) {
      body.append(el('h4', 'Earlier rounds'));
      earlier.slice().reverse().forEach(function (round) { body.append(storyboardRound(round, false)); });
    }
  }

  /* Preview and final video ------------------------------------------------ */
  // The preview always plays inline and is never offered as a download.
  function previewPlayer(request, version) {
    var box = el('div', undefined, 'video-preview');
    box.append(el('p', 'Loading the preview…', 'admin-muted'));
    var url = admin ? api.videoUrl('preview', version.previewPath) : api.client.previewUrl(request.id);
    url.then(function (href) {
      var player = document.createElement('video');
      player.className = 'video-preview__player'; player.src = href; player.controls = true;
      player.setAttribute('controlsList', 'nodownload'); player.setAttribute('playsinline', '');
      player.setAttribute('aria-label', 'Preview of ' + request.title);
      var caption = el('p', 'Preview (watermarked) · V' + version.number, 'video-preview__caption');
      box.replaceChildren(player, caption);
    }).catch(function (problem) {
      box.replaceChildren(el('p', 'Couldn’t load the preview. ' + problem.message, 'workflow-error'));
    });
    return box;
  }

  // The studio's upload dialogs. Both go through FijlyVideoStore.
  function uploadVideo(request, kind) {
    var preview = kind === 'preview';
    formEditor(preview ? 'Upload preview video' : 'Upload final video', function (form) {
      form.append(el('p', preview
        ? 'The client is asked to approve this cut. MP4, WEBM or MOV, up to 50MB.'
        : 'The delivered file. It stays locked to the client until the final 40% payment is settled. MP4, WEBM or MOV, up to 50MB.', 'admin-muted'));
      var picker = field(form, 'file', preview ? 'Preview file' : 'Final file', '', 'file');
      picker.multiple = false; picker.accept = window.FijlyVideoStore.accept; picker.required = true;
      if (preview) field(form, 'notes', 'Notes for the client', '', 'textarea');
    }, async function (form) {
      var file = form.elements.file.files[0];
      var problem = window.FijlyVideoStore.validate(file);
      if (problem) throw new Error(problem);
      if (preview) {
        var version = await api.addPreviewVideo(request.id, file, form.elements.notes.value);
        flash('Preview V' + version.number + ' sent for review.');
      } else {
        await api.addFinalVideo(request.id, file);
        flash('Final video uploaded. It unlocks for the client when the final payment is settled.');
      }
    }, preview ? 'Send for review' : 'Upload final video');
  }

  // The client's locked / unlocked delivery card.
  function deliveryCard(request) {
    var unlocked = api.finalUnlocked(request.id), finalVersion = api.latestFinal(request.id);
    var owed = api.paymentsFor(request.id).find(function (payment) { return payment.milestone === 'final'; });
    var card = el('div', undefined, 'delivery-card');
    function locked() {
      card.replaceChildren(el('p', '🔒 Final download unlocks after the final 40% payment ('
        + api.formatMoney(owed && owed.amount, 'the final milestone') + '). We’ll send a PayPal invoice.', 'delivery-card__locked'));
    }
    if (!unlocked || !finalVersion) { locked(); return card; }
    // Storage has the last word on whether the file is readable, so ask it for
    // the URL before promising a download. A refusal means still locked.
    card.append(el('p', 'Preparing your download…', 'admin-muted'));
    api.client.finalUrl(request.id).then(function (href) {
      var link = el('a', 'Download final video', 'btn btn-primary btn--md');
      link.href = href; link.download = ''; link.rel = 'noopener';
      card.replaceChildren(el('p', 'Your final video is ready.', 'workflow-notice'), link);
    }).catch(function () { locked(); });
    return card;
  }

  function videoSection(body, request, secondary) {
    var versions = api.versionsFor(request.id), preview = api.latestPreview(request.id);
    var canPreview = admin && api.canUploadPreview(request), canFinal = admin && api.canUploadFinal(request);
    var notes = api.videoFeedbackFor(request.id);
    if (!versions.length && !canPreview && !canFinal) return;
    var limits = api.videoRevisions(request.id);
    body.append(el('h3', 'Video'));
    body.append(el('p', 'Video revisions used: ' + limits.used + ' of ' + limits.included, 'admin-muted'));
    if (canPreview) secondary.push(button(preview ? 'Upload new preview' : 'Upload preview video', function () { uploadVideo(request, 'preview'); }));
    if (canFinal) secondary.push(button('Upload final video', function () { uploadVideo(request, 'final'); }));

    if (preview) body.append(previewPlayer(request, preview));
    else if (!admin) body.append(el('p', 'Your first cut will play here as soon as it is ready.', 'admin-muted'));

    // The client approves the cut, or sends notes back.
    if (!admin && request.stage === 'Video Ready for Preview') {
      var bar = actionBar(), feedbackNotes = feedbackBox('video-feedback-' + request.id, 'What should we change?');
      var approve = barButton('Approve video', 'btn-success'), changes = barButton('Request changes');
      approve.onclick = function () {
        bar.run(approve, async function () {
          await api.client.reviewVideo(request.id, true);
          flash('Video approved. We will invoice the final 40% and release your files.');
        });
      };
      changes.onclick = function () {
        if (feedbackNotes.hidden) { feedbackNotes.hidden = false; feedbackNotes.input.focus(); changes.textContent = 'Send change request'; return; }
        bar.run(changes, async function () {
          await api.client.reviewVideo(request.id, false, feedbackNotes.input.value);
          flash('Thanks — your notes are with the studio.');
        });
      };
      bar.row.append(changes, approve);
      body.append(feedbackNotes, bar);
    }
    // Delivery: locked until the final payment lands.
    if (!admin && ['Video Approved', 'Completed'].includes(request.stage)) {
      body.append(el('h4', request.stage === 'Completed' ? 'Project complete' : 'Final delivery'), deliveryCard(request));
    }

    // The studio's own view of what has been sent.
    if (admin && versions.length) {
      body.append(el('h4', 'Versions'));
      versions.slice().reverse().forEach(function (version) {
        var row = el('div', undefined, 'workflow-entry');
        row.append(el('strong', 'V' + version.number + ' · ' + date(version.createdAt)));
        if (version.notes) row.append(el('p', version.notes));
        var files = el('div', undefined, 'workflow-version-line');
        if (version.previewPath) files.append(videoButton('Open preview', 'preview', version.previewPath));
        if (version.finalPath) files.append(videoButton('Open final file', 'final', version.finalPath));
        if (!version.previewPath && !version.finalPath) files.append(el('span', 'No video file attached.', 'admin-muted'));
        row.append(files);
        body.append(row);
      });
    }
    if (notes.length) {
      body.append(el('h4', 'Client video feedback'));
      notes.slice().reverse().forEach(function (entry) {
        var row = el('div', undefined, 'workflow-entry');
        row.append(el('strong', (entry.approved ? 'Approved' : 'Changes requested') + ' · ' + date(entry.at)));
        if (entry.text) row.append(el('blockquote', entry.text, 'workflow-feedback'));
        body.append(row);
      });
    }
  }

  // Opens a stored video in a new tab through FijlyVideoStore. The tab is
  // opened inside the click so pop-up blockers allow it.
  function videoButton(label, kind, path) {
    var node = el('button', label, 'btn btn-outline btn--md');
    node.type = 'button';
    node.onclick = function () {
      if (node.disabled) return;
      var tab = window.open('', '_blank');
      run(node, async function () {
        try { var href = await api.videoUrl(kind, path); if (tab) { tab.opener = null; tab.location.href = href; } else window.open(href, '_blank', 'noopener'); }
        catch (problem) { if (tab) tab.close(); throw problem; }
      });
    };
    return node;
  }

  // Everything the milestone workflow adds to a project, in one call.
  function milestoneSections(body, request, secondary) {
    body.append(progressStepper(request));
    storyboardSection(body, request, secondary);
    videoSection(body, request, secondary);
  }

  function renderDetail() {
    if(!current)return;var kind=current.kind,item=admin?api.get(kind,current.id):api.client.get(kind,current.id),request=requestFor(kind,item),body=detail.body,secondary=[],primary=[];
    detail.title.textContent=kind==='revisions'?'Revision round '+item.round+' · '+request.title:request.title;body.replaceChildren();
    if(notice&&notice.kind===kind&&notice.id===current.id){var note=el('p',notice.text,'workflow-notice');note.setAttribute('role','status');body.append(note);if(notice.fresh){notice.fresh=false;detail.node.scrollTop=0;}}
    var facts={Client:client(request).name,Website:request.website||'Not provided','Video type':request.videoType,Priority:request.priority,'Requested date':date(kind==='revisions'?item.requestedAt:request.requestedAt),Deadline:date(request.deadline),'Video length':request.durationSeconds?request.durationSeconds+' seconds':request.length};if(admin)facts['Assigned Editor']=request.assignedEditor;
    if(kind==='requests') {
      // The stage is the project's headline status; the request status stays
      // beside it for the production workflow.
      var statusLine=el('div',undefined,'workflow-version-line');statusLine.append(stageBadge(request.stage),badge(item.status));
      body.append(statusLine,progressStepper(request),factGrid(facts));
      body.append(el('h3','Price'),priceBreakdown(request));
      body.append(el('h3','Payments'),paymentsCard(request));
      body.append(el('h3','Project details'),projectFacts(request));
      // The script and voice over the client uploaded, behind signed URLs.
      if(request.scriptFilePath||request.voiceOverFilePath){
        var downloads=el('div',undefined,'workflow-version-line');
        if(request.scriptFilePath)downloads.append(fileButton(admin?'Download client script':'Download your script',request.scriptFilePath));
        if(request.voiceOverFilePath)downloads.append(fileButton(admin?'Download client voice over':'Download your voice over',request.voiceOverFilePath));
        body.append(el('h3','Supplied files'),downloads);
      }
      // The brief document the client shared, and their notes beside it.
      body.append(el('h3','Project brief'));
      if(request.briefLink||request.briefFilePath){
        var briefBox=el('div',undefined,'workflow-version-line');
        if(request.briefLink){
          var briefLink=el('a',request.briefLink,'btn btn-outline btn--md');
          briefLink.href=request.briefLink;briefLink.target='_blank';briefLink.rel='noopener noreferrer';
          briefLink.setAttribute('aria-label','Open the brief document (opens in a new tab)');
          briefBox.append(briefLink);
        }
        if(request.briefFilePath)briefBox.append(fileButton(admin?'Download brief document':'Download your brief',request.briefFilePath));
        body.append(briefBox);
      } else body.append(el('p','No brief document was shared. This project was submitted before a brief document was required.','admin-muted'));
      body.append(el('h3','Notes'),el('p',request.instructions||'No additional notes.','workflow-feedback'),el('h3','Reference links'));
      if(!request.references.length)body.append(el('p','No reference links provided.','admin-muted'));
      request.references.forEach(function(url){var p=el('p'),a=el('a',url);a.href=url;a.target='_blank';a.rel='noopener noreferrer';p.append(a);body.append(p);});
      body.append(el('h3','Attachments'));
      if(!request.attachments.length)body.append(el('p','No attachments.','admin-muted'));
      else{
        var stored=request.attachments.filter(function(a){return a.path;});
        var attachmentList=el('div',undefined,'attachment-list');
        request.attachments.forEach(function(a){
          var row=el('div',undefined,'attachment-row');
          row.append(el('span',a.name,'attachment-row__name'));
          // Older projects kept the names only, so there is nothing to fetch.
          if(a.path)row.append(fileButton(admin?'Download':'Download your file',a.path));
          attachmentList.append(row);
        });
        body.append(attachmentList);
        if(!stored.length)body.append(el('p','File names as supplied with the project; this project was submitted before attachments were stored.','admin-muted'));
      }
      if(admin && request.status!=='Completed'){secondary.push(button('Edit details',function(){editRequest(request,true);}));if(request.stage!=='Awaiting Payment')secondary.push(button('Change stage',function(){changeStage(request);}));if(request.status==='Submitted'&&request.stage!=='Awaiting Payment')secondary.push(button('Start review',async function(){await api.reviewRequest(request.id);flash('Marked as Under Review.');renderDetail();}));}
      // Nothing moves into production until the deposit is in.
      if(request.stage==='Awaiting Payment'){body.append(el('p',admin?'This project is waiting for its 15% project-start payment. Mark that payment paid on the Payments screen to start it.':'We will email your PayPal invoice for the 15% project-start payment. Your project starts as soon as it is confirmed.','workflow-notice'));footer(detail,secondary);return;}
      milestoneSections(body,request,secondary);
      var linked=state.videos.find(function(v){return v.requestId===request.id;});
      if(linked)primary.push(button('Open video',function(){show('videos',linked.id);},true));
      else if(admin)primary.push(button('Move to production',function(){confirmation('Move to production','Create a linked production workspace for this request?',async function(){var video=await api.produce(request.id);show('videos',video.id);flash('Moved to production. Add the first version when the draft is ready.');});},true));
      footer(detail,secondary.concat(primary));return;
    }
    var video=kind==='videos'?item:api.get('videos',item.videoId),latest=api.latest(video);
    if(kind==='videos')body.append(media(latest));
    var version=el('div',undefined,'workflow-version-line');version.append(stageBadge(request.stage),badge(item.status),el('span',latest?(video.status==='Completed'?'Final delivery · ':'')+'V'+latest.number+' · '+latest.filename+' · '+date(latest.createdAt):'Awaiting first draft'));body.append(version);
    if(kind==='videos')body.append(progressStepper(request));
    if(!admin&&kind==='videos'&&video.status==='Client Review')body.append(reviewBar(video));
    body.append(factGrid(facts));
    body.append(el('h3','Price'),priceBreakdown(request));
    body.append(el('h3','Payments'),paymentsCard(request));
    if(kind==='videos')milestoneSections(body,request,secondary);
    secondary.push(button('Original request',function(){show('requests',request.id);}));
    if(admin&&kind==='videos')secondary.push(button('Change stage',function(){changeStage(request);}));
    if(kind==='revisions'){var f=video.feedback.find(function(value){return value.id===item.feedbackId;});body.append(el('h3','Client feedback · V'+item.baseVersion),el('blockquote',f.text,'workflow-feedback'),el('p',f.author+' · '+date(f.at),'admin-muted'));secondary.push(button('Open video',function(){show('videos',video.id);}));}
    if(admin && video.status!=='Completed' && (kind!=='revisions'||item.status!=='Resolved')) {
      secondary.push(button('Edit production details',function(){editRequest(request,false);}));
      var revision=api.activeRevision(video);
      if(['In Production','Draft Ready','In Revision'].includes(video.status) && (!revision || revision.status!=='Revision Requested'))secondary.push(button('Add version',function(){addVersion(video);}));
      if(video.status==='Client Review')secondary.push(button('Record client revision',function(){feedback(video);}));
      if(kind==='revisions')api.revisionTransitions(item).forEach(function(status){primary.push(button(status==='Resolved'?'Resolve & approve':status==='In Revision'?'Start revision':status==='Draft Ready'?'Mark draft ready':'Send to Client Review',function(){confirmation(status,'Change this revision to '+status+(status==='Resolved'?' and approve its video':'')+'?',async function(){await api.setRevisionStatus(item.id,status);flash('Revision round '+item.round+' is now '+status+'.');});},true));});
      else api.videoTransitions(video).forEach(function(status){primary.push(button({'Draft Ready':'Mark draft ready','Client Review':'Send to Client Review',Approved:'Mark approved',Completed:'Mark completed'}[status],function(){changeVideo(video,status);},true));});
      if(kind==='videos'&&revision&&revision.status==='Revision Requested')primary.push(button('Open requested revision',function(){show('revisions',revision.id);},true));
    }
    footer(detail,secondary.concat(primary));history(body,video);
  }
  function setupList(kind,container) {
    var toolbar=el('div',undefined,'workflow-toolbar');filters[kind]={search:'',status:kind==='requests'?'action':'all',client:'all',priority:'all',sort:'newest'};
    [['search','Search',null],['status','Status',(kind==='requests'?api.requestStatuses:kind==='videos'?api.videoStatuses:api.revisionStatuses)],['client','Client',state.clients.map(function(c){return c.id;})],['priority','Priority',['Low','Normal','High','Urgent']],['sort','Sort',['newest','oldest','deadline','priority','title']]].forEach(function(spec){var label=el('label',spec[1]),input=el(spec[2]?'select':'input',undefined,'input');input.setAttribute('aria-label',spec[1]);input.dataset.filter=spec[0];if(spec[2]){if(spec[0]!=='sort'){var all=el('option',{status:'All statuses',client:'All clients',priority:'All priorities'}[spec[0]]);all.value='all';input.append(all);if(kind==='requests'&&spec[0]==='status'){var needed=el('option','Needs review');needed.value='action';input.append(needed);}}spec[2].forEach(function(value){var o=el('option',spec[0]==='client'?api.get('clients',value).name:value);o.value=value;input.append(o);});}else{input.type='search';input.placeholder='Title, client or editor';}if(spec[0]==='status')input.value=filters[kind].status;input.addEventListener(spec[2]?'change':'input',function(){filters[kind][spec[0]]=input.value;renderList(kind);});label.append(input);toolbar.append(label);});
    container.append(toolbar,el('div',undefined,'workflow-results'));renderList(kind);
  }
  function renderList(kind) {
    var container=document.querySelector('[data-workflow-list="'+kind+'"]');if(!container)return;var f=filters[kind],target=container.querySelector('.workflow-results');var actionIds=api.adminActions().filter(function(a){return a.section===kind;}).map(function(a){return a.id;});var records=state[kind].filter(function(item){var r=requestFor(kind,item);return(f.status==='all'||f.status===item.status||(f.status==='action'&&actionIds.includes(item.id)))&&(f.client==='all'||f.client===r.client)&&(f.priority==='all'||f.priority===r.priority)&&[r.title,client(r).name,r.assignedEditor].join(' ').toLowerCase().includes(f.search.toLowerCase());});
    records.sort(function(a,b){var x=requestFor(kind,a),y=requestFor(kind,b);if(f.sort==='priority')return ['Urgent','High','Normal','Low'].indexOf(x.priority)-['Urgent','High','Normal','Low'].indexOf(y.priority);if(f.sort==='title')return x.title.localeCompare(y.title);if(f.sort==='deadline')return x.deadline.localeCompare(y.deadline);return (f.sort==='oldest'?1:-1)*(a.requestedAt||x.requestedAt).localeCompare(b.requestedAt||y.requestedAt);});
    target.replaceChildren(el('p',records.length+' '+(records.length===1?{requests:'request',videos:'video',revisions:'revision'}[kind]:kind),'admin-result-count'));
    if(!records.length){var empty=el('div',undefined,'admin-empty');empty.append(el('strong','No matching '+kind),el('p','Try another search or clear your filters.'),button('Clear filters',function(){container.querySelectorAll('[data-filter]').forEach(function(input){input.value=input.dataset.filter==='search'?'':input.dataset.filter==='sort'?'newest':'all';filters[kind][input.dataset.filter]=input.value;});renderList(kind);}));target.append(empty);return;}
    var wrap=el('div',undefined,'workflow-table-wrap');wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label',kind+' table, scroll horizontally');var table=el('table',undefined,'table workflow-table'),head=el('thead'),tr=el('tr');['Video / Client',kind==='revisions'?'Round / Requested':'Type / Platform','Status','Priority','Assigned Editor','Deadline'].forEach(function(t){var th=el('th',t);th.scope='col';tr.append(th);});head.append(tr);var tbody=el('tbody');records.forEach(function(item){var r=requestFor(kind,item),row=el('tr'),identity=el('td');var b=button(r.title,function(){show(kind,item.id);});b.className='btn-link';identity.append(b,el('span',client(r).name,'admin-muted admin-block'));row.append(identity);var type=el('td');type.append(kind==='revisions'?'Round '+item.round+' / '+date(item.requestedAt):r.videoType+(r.durationSeconds?' / '+r.durationSeconds+' sec':r.platform?' / '+r.platform:''));if(kind!=='revisions'&&r.prices.total!==null)type.append(el('span',api.formatMoney(r.prices.total),'admin-muted admin-block'));var status=el('td');status.append(stageBadge(r.stage),el('span',item.status,'admin-muted admin-block'));row.append(type,status,el('td',r.priority),el('td',r.assignedEditor||'Unassigned'),el('td',date(r.deadline),'admin-date'));tbody.append(row);});table.append(head,tbody);wrap.append(table);target.append(el('p','Scroll horizontally to see all details.','table-hint'),wrap);
  }
  // Client Projects filters: one row status per project (the video's status, or
  // the request's while it waits), grouped by the chips.
  var chipStatuses = { production: ['In Production','Draft Ready','In Revision','Approved'], review: ['Client Review'], delivered: ['Completed'] };
  function clearClientFilters() { clientFilter='all'; document.querySelector('#client-project-search').value=''; document.querySelectorAll('.filter-chip').forEach(function(chip){chip.setAttribute('aria-pressed',String(chip.dataset.filter==='all'));}); }
  function tableMessage(tbody, text, action) { var row=el('tr'),cell=el('td',undefined,'table-empty-cell'),box=el('div',undefined,'table-empty-state');cell.colSpan=5;box.append(el('p',text));if(action)box.append(action);cell.append(box);row.append(cell);tbody.append(row); }
  function renderClient() {
    var requests=api.client.records('requests'), videos=api.client.records('videos');
    var list=document.querySelector('[data-request-list]'),heading=el('h2','Your requests','panel__title');heading.id='h-open-requests';list.replaceChildren(heading);
    requests.slice().sort(function(a,b){return b.requestedAt.localeCompare(a.requestedAt);}).forEach(function(r){var card=el('article',undefined,'list-card workflow-request-card');card.append(el('h3',r.title,'list-card__title'),stageBadge(r.stage),el('p',r.videoType+' · '+(r.durationSeconds?r.durationSeconds+' seconds · ':'')+api.formatMoney(r.prices.total,'Price to confirm')+' · Requested '+date(r.requestedAt),'admin-muted'),button('View project',function(){show('requests',r.id);}));list.append(card);});
    if(!requests.length){var first=el('a','Start a new project','btn btn-primary btn--sm');first.href='order.html';list.append(el('p','No projects yet. Start your first project to get going.','admin-muted'),first);}
    var count=requests.filter(function(r){return ['Submitted','Under Review'].includes(r.status);}).length;var counter=document.querySelector('[data-request-count]');counter.textContent=count;counter.setAttribute('aria-label',count+' open requests');
    var search=document.querySelector('#client-project-search').value.trim().toLowerCase();
    // The stage is what a client follows; the video status drives the filters.
    var rows=requests.map(function(r){var v=videos.find(function(v){return v.requestId===r.id;});return {request:r,video:v,status:v?v.status:r.status,stage:r.stage};});
    var shown=rows.filter(function(item){return (clientFilter==='all'||chipStatuses[clientFilter].includes(item.status))&&item.request.title.toLowerCase().includes(search);});
    var tbody=document.querySelector('.projects-table tbody');tbody.replaceChildren();shown.forEach(function(item){var r=item.request,v=item.video,row=el('tr'),title=el('td');title.append(button(r.title,function(){show(v?'videos':'requests',v?v.id:r.id);}));var status=el('td');status.append(stageBadge(item.stage));if(v)status.append(el('span',item.status,'admin-muted admin-block'));row.append(title,el('td',r.videoType),status,el('td',date(r.deadline)),el('td',v&&v.versions.length?'V'+api.latest(v).number:'No draft'));tbody.append(row);});
    if(!rows.length){var start=el('a','Start a new project','btn btn-primary btn--sm');start.href='order.html';tableMessage(tbody,'No projects yet — start your first project to get going',start);}
    else if(!shown.length)tableMessage(tbody,'No videos match this filter',button('Clear filters',function(){clearClientFilters();renderClient();}));
  }
  window.FijlyWorkflow = { open: show };
  // Keep one table/record DOM. On narrow screens each row becomes a labelled
  // card, while native table semantics and desktop columns remain intact.
  var mobile = window.matchMedia('(max-width: 600px)');
  function prepareCards() {
    document.querySelectorAll('.projects-table, .workflow-table, .admin-assets-table, #script-rows, #admin-priorities').forEach(function (target) {
      var table = target.closest('table'); if (!table) return;
      table.classList.add('mobile-records'); table.setAttribute('role', 'table');
      var headings = Array.from(table.querySelectorAll('thead th')).map(function (th) { th.setAttribute('role', 'columnheader'); return th.textContent.trim(); });
      table.querySelectorAll('thead, tbody').forEach(function (group) { group.setAttribute('role', 'rowgroup'); });
      table.querySelectorAll('tr').forEach(function (row) { row.setAttribute('role', 'row'); });
      table.querySelectorAll('tbody tr').forEach(function (row) { Array.from(row.cells).forEach(function (cell, index) { cell.setAttribute('role', 'cell'); cell.dataset.label = cell.colSpan > 1 ? '' : headings[index] || ''; }); });
      var wrap = table.parentElement; wrap.classList.add('mobile-records-wrap');
      if (wrap.hasAttribute('tabindex') || wrap.dataset.tableRegion) {
        wrap.dataset.tableRegion = 'true';
        if (mobile.matches) wrap.removeAttribute('tabindex'); else wrap.tabIndex = 0;
        wrap.setAttribute('aria-label', 'Records');
      }
    });
  }
  new MutationObserver(prepareCards).observe(document.getElementById('studio-content'), { childList: true, subtree: true });
  mobile.addEventListener('change', prepareCards);
  prepareCards();
  if(admin)document.querySelectorAll('[data-workflow-list]').forEach(function(container){setupList(container.dataset.workflowList,container);});
  else {
    document.querySelectorAll('.filter-chip[data-filter]').forEach(function(chip){chip.onclick=function(){clientFilter=chip.dataset.filter;document.querySelectorAll('.filter-chip').forEach(function(c){c.setAttribute('aria-pressed',String(c===chip));});renderClient();};});
    // The old in-portal request form is gone: clients may no longer insert
    // into requests. Projects start in the wizard on order.html, which calls
    // submit_project() so the price and the milestone payments are set by the
    // database. This screen keeps the history list and links to the wizard.
    renderClient();
  }
  if(!admin)document.querySelector('#client-project-search').addEventListener('input',renderClient);
  api.subscribe(function(changed){
    if(admin && changed.includes('clients'))document.querySelectorAll('[data-workflow-list] [data-filter="client"]').forEach(function(select){var value=select.value;select.replaceChildren();var all=el('option','All clients');all.value='all';select.append(all);state.clients.forEach(function(c){var option=el('option',c.name);option.value=c.id;select.append(option);});select.value=state.clients.some(function(c){return c.id===value;})?value:'all';filters[select.closest('[data-workflow-list]').dataset.workflowList].client=select.value;});
    if(changed.some(function(k){return ['clients','requests','videos','revisions','payments','storyboards','videoFeedback'].includes(k);})) {if(admin)Object.keys(filters).forEach(renderList);else renderClient();if(detail.node.open){try{renderDetail();}catch(error){detail.node.close();current=null;}}}
  });
})();
