/* Shared operational UI for both portals. The Admin portal reads Supabase
   through FijlyData; the Client portal keeps the session mock until Part 3B.
   Writes may be async (FijlyData) or sync (FijlyMock); both are awaited. */
(function () {
  'use strict';
  var api = window.FijlyData || window.FijlyMock, state = api.state, admin = document.body.classList.contains('admin-body');
  var filters = {}, current = null, clientFilter = 'all', applyDefaults = function () {}, notice = null;
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
  function renderDetail() {
    if(!current)return;var kind=current.kind,item=admin?api.get(kind,current.id):api.client.get(kind,current.id),request=requestFor(kind,item),body=detail.body,secondary=[],primary=[];
    detail.title.textContent=kind==='revisions'?'Revision round '+item.round+' · '+request.title:request.title;body.replaceChildren();
    if(notice&&notice.kind===kind&&notice.id===current.id){var note=el('p',notice.text,'workflow-notice');note.setAttribute('role','status');body.append(note);if(notice.fresh){notice.fresh=false;detail.node.scrollTop=0;}}
    var facts={Client:client(request).name,Platform:request.platform,'Video type':request.videoType,Priority:request.priority,'Requested date':date(kind==='revisions'?item.requestedAt:request.requestedAt),Deadline:date(request.deadline),'Video length':request.length};if(admin)facts['Assigned Editor']=request.assignedEditor;
    if(kind==='requests') {
      body.append(badge(item.status),factGrid(facts),el('h3','Instructions'),el('p',request.instructions,'workflow-feedback'),el('h3','Reference links'));
      if(!request.references.length)body.append(el('p','No reference links provided.','admin-muted'));
      request.references.forEach(function(url){var p=el('p'),a=el('a',url);a.href=url;a.target='_blank';a.rel='noopener noreferrer';p.append(a);body.append(p);});
      body.append(el('h3','Attachments'));body.append(el('p',request.attachments.length?request.attachments.map(function(a){return a.name+(a.size?' ('+Math.ceil(a.size/1024)+' KB)':'');}).join('\n'):'No attachments.','workflow-feedback'));body.append(el('p','Attachment metadata only; files are not uploaded in this preview.','admin-muted'));
      if(admin && request.status!=='Completed'){secondary.push(button('Edit details',function(){editRequest(request,true);}));if(request.status==='Submitted')secondary.push(button('Start review',async function(){await api.reviewRequest(request.id);flash('Marked as Under Review.');renderDetail();}));}
      var linked=state.videos.find(function(v){return v.requestId===request.id;});
      if(linked)primary.push(button('Open video',function(){show('videos',linked.id);},true));
      else if(admin)primary.push(button('Move to production',function(){confirmation('Move to production','Create a linked production workspace for this request?',async function(){var video=await api.produce(request.id);show('videos',video.id);flash('Moved to production. Add the first version when the draft is ready.');});},true));
      footer(detail,secondary.concat(primary));return;
    }
    var video=kind==='videos'?item:api.get('videos',item.videoId),latest=api.latest(video);
    if(kind==='videos')body.append(media(latest));
    var version=el('div',undefined,'workflow-version-line');version.append(badge(item.status),el('span',latest?(video.status==='Completed'?'Final delivery · ':'')+'V'+latest.number+' · '+latest.filename+' · '+date(latest.createdAt):'Awaiting first draft'));body.append(version);
    if(!admin&&kind==='videos'&&video.status==='Client Review')body.append(reviewBar(video));
    body.append(factGrid(facts));
    secondary.push(button('Original request',function(){show('requests',request.id);}));
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
    var wrap=el('div',undefined,'workflow-table-wrap');wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label',kind+' table, scroll horizontally');var table=el('table',undefined,'table workflow-table'),head=el('thead'),tr=el('tr');['Video / Client',kind==='revisions'?'Round / Requested':'Type / Platform','Status','Priority','Assigned Editor','Deadline'].forEach(function(t){var th=el('th',t);th.scope='col';tr.append(th);});head.append(tr);var tbody=el('tbody');records.forEach(function(item){var r=requestFor(kind,item),row=el('tr'),identity=el('td');var b=button(r.title,function(){show(kind,item.id);});b.className='btn-link';identity.append(b,el('span',client(r).name,'admin-muted admin-block'));row.append(identity);var type=el('td',kind==='revisions'?'Round '+item.round+' / '+date(item.requestedAt):r.videoType+' / '+r.platform);var status=el('td');status.append(badge(item.status));row.append(type,status,el('td',r.priority),el('td',r.assignedEditor||'Unassigned'),el('td',date(r.deadline),'admin-date'));tbody.append(row);});table.append(head,tbody);wrap.append(table);target.append(el('p','Scroll horizontally to see all details.','table-hint'),wrap);
  }
  // Client Projects filters: one row status per project (the video's status, or
  // the request's while it waits), grouped by the chips.
  var chipStatuses = { production: ['In Production','Draft Ready','In Revision','Approved'], review: ['Client Review'], delivered: ['Completed'] };
  function clearClientFilters() { clientFilter='all'; document.querySelector('#client-project-search').value=''; document.querySelectorAll('.filter-chip').forEach(function(chip){chip.setAttribute('aria-pressed',String(chip.dataset.filter==='all'));}); }
  function tableMessage(tbody, text, action) { var row=el('tr'),cell=el('td',undefined,'table-empty-cell'),box=el('div',undefined,'table-empty-state');cell.colSpan=5;box.append(el('p',text));if(action)box.append(action);cell.append(box);row.append(cell);tbody.append(row); }
  function renderClient() {
    var requests=api.client.records('requests'), videos=api.client.records('videos');
    var list=document.querySelector('[data-request-list]'),heading=el('h2','Your requests','panel__title');heading.id='h-open-requests';list.replaceChildren(heading);
    requests.slice().sort(function(a,b){return b.requestedAt.localeCompare(a.requestedAt);}).forEach(function(r){var card=el('article',undefined,'list-card workflow-request-card');card.append(el('h3',r.title,'list-card__title'),badge(r.status),el('p',r.videoType+' · Requested '+date(r.requestedAt)+' · Due '+date(r.deadline),'admin-muted'),button('View request',function(){show('requests',r.id);}));list.append(card);});
    if(!requests.length)list.append(el('p','No requests yet. Submit your first brief to get started.','admin-muted'));
    var count=requests.filter(function(r){return ['Submitted','Under Review'].includes(r.status);}).length;var counter=document.querySelector('[data-request-count]');counter.textContent=count;counter.setAttribute('aria-label',count+' open requests');
    var search=document.querySelector('#client-project-search').value.trim().toLowerCase();
    var rows=requests.map(function(r){var v=videos.find(function(v){return v.requestId===r.id;});return {request:r,video:v,status:v?v.status:r.status};});
    var shown=rows.filter(function(item){return (clientFilter==='all'||chipStatuses[clientFilter].includes(item.status))&&item.request.title.toLowerCase().includes(search);});
    var tbody=document.querySelector('.projects-table tbody');tbody.replaceChildren();shown.forEach(function(item){var r=item.request,v=item.video,row=el('tr'),title=el('td');title.append(button(r.title,function(){show(v?'videos':'requests',v?v.id:r.id);}));var status=el('td');status.append(badge(item.status));row.append(title,el('td',r.videoType),status,el('td',date(r.deadline)),el('td',v&&v.versions.length?'V'+api.latest(v).number:'No draft'));tbody.append(row);});
    if(!rows.length){var start=el('a','Submit a request','btn btn-primary btn--sm');start.href='#requests';start.dataset.screenLink='requests';tableMessage(tbody,'No videos yet — submit a request to get started',start);}
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
    var requestForm=document.querySelector('[data-request-form]');
    /* Apply the Admin's saved workflow defaults as starting values. Only fields
       the visitor has not touched are set, and only when the form is empty, so
       a default never overwrites typed input. */
    function applyRequestDefaults(){
      var defaults=state.settings||{},preferences=api.client.preferences(); var f=requestForm.elements;
      ['length','platform'].forEach(function(name){var input=f.namedItem(name);if(!input.dataset.touched)input.value=name==='length'?preferences.defaultLength:preferences.platform;});
      var priority=f.namedItem('priority'), due=f.namedItem('due');
      if(defaults.defaultPriority&&priority&&!priority.dataset.touched)priority.value=defaults.defaultPriority;
      if(due&&!due.dataset.touched&&defaults.defaultLeadDays){
        // Count the turnaround from today's local calendar date.
        var now=new Date(),target=new Date(now.getFullYear(),now.getMonth(),now.getDate()+Number(defaults.defaultLeadDays));
        due.value=target.getFullYear()+'-'+String(target.getMonth()+1).padStart(2,'0')+'-'+String(target.getDate()).padStart(2,'0');
      }
    }
    ['priority','due','length','platform'].forEach(function(name){
      var field=requestForm.elements.namedItem(name);
      if(field)field.addEventListener('change',function(){field.dataset.touched='1';});
    });
    requestForm.addEventListener('reset',function(){
      ['priority','due','length','platform'].forEach(function(name){
        var field=requestForm.elements.namedItem(name); if(field)delete field.dataset.touched;
      });
      setTimeout(applyRequestDefaults,0);
    });
    applyDefaults=applyRequestDefaults;
    applyRequestDefaults();
    // Keep errors with their fields and announce a single submission summary.
    requestForm.noValidate = true;
    var errorFields = ['name', 'brief', 'due', 'references'];
    errorFields.forEach(function (name) {
      var field = requestForm.elements.namedItem(name), error = el('p', '', 'workflow-error field-error');
      error.id = field.id + '-error'; error.hidden = true;
      field.setAttribute('aria-describedby', error.id); field.insertAdjacentElement('afterend', error);
      field.addEventListener('input', function () { field.removeAttribute('aria-invalid'); error.hidden = true; error.textContent = ''; });
    });
    function fieldError(name, message) {
      var field = requestForm.elements.namedItem(name), error = document.getElementById(field.id + '-error');
      field.setAttribute('aria-invalid', 'true'); error.textContent = message; error.hidden = false;
    }
    function clearErrors() { errorFields.forEach(function (name) { var field = requestForm.elements.namedItem(name); field.removeAttribute('aria-invalid'); var error = document.getElementById(field.id + '-error'); error.hidden = true; error.textContent = ''; }); }
    requestForm.addEventListener('reset', clearErrors);
    requestForm.onsubmit = async function (e) {
      e.preventDefault(); clearErrors();
      var note = document.querySelector('[data-request-note]'), f = requestForm.elements, invalid = [];
      [['name', 'Please enter a video title.'], ['brief', 'Please describe what you want in your video.'], ['due', 'Please choose a valid deadline.']].forEach(function (pair) {
        var field = f.namedItem(pair[0]); if (!field.value.trim() || !field.validity.valid) { fieldError(pair[0], pair[1]); invalid.push(pair[0]); }
      });
      var badReference = f.references.value.split(/\n/).map(function (v) { return v.trim(); }).filter(Boolean).some(function (value) { try { return !['http:', 'https:'].includes(new URL(value).protocol); } catch (_) { return true; } });
      if (badReference) { fieldError('references', 'Enter a complete link starting with https:// or http://, one per line.'); invalid.push('references'); }
      if (invalid.length) {
        note.className = 'workflow-error'; note.textContent = 'Please check the highlighted fields.'; note.hidden = false; f.namedItem(invalid[0]).focus(); return;
      }
      try {
        await api.client.createRequest({title:f.name.value,videoType:f.type.value,instructions:f.brief.value,platform:f.platform.value,priority:f.priority.value,deadline:f.due.value,length:f.namedItem('length').value,references:f.references.value},files(f.attachments));
        requestForm.reset(); note.className = 'workflow-notice'; note.textContent = 'Request submitted. We will review your brief next. You can track its progress in Your requests.';
      } catch (error) { note.className = 'workflow-error'; note.textContent = error.message; if (/reference/i.test(error.message)) { fieldError('references', 'Enter a complete link starting with https:// or http://.'); f.references.focus(); } }
      note.hidden = false;
    };renderClient();
  }
  if(!admin){document.querySelector('#client-project-search').addEventListener('input',renderClient);window.addEventListener('fijly:clientchange',function(){current=null;[detail,editor,confirm].forEach(function(d){d.node.close();});clearClientFilters();requestForm.reset();document.querySelector('[data-request-note]').hidden=true;});}
  api.subscribe(function(changed){
    if(admin && changed.includes('clients'))document.querySelectorAll('[data-workflow-list] [data-filter="client"]').forEach(function(select){var value=select.value;select.replaceChildren();var all=el('option','All clients');all.value='all';select.append(all);state.clients.forEach(function(c){var option=el('option',c.name);option.value=c.id;select.append(option);});select.value=state.clients.some(function(c){return c.id===value;})?value:'all';filters[select.closest('[data-workflow-list]').dataset.workflowList].client=select.value;});
    if(changed.some(function(k){return ['clients','requests','videos','revisions'].includes(k);})) {if(admin)Object.keys(filters).forEach(renderList);else renderClient();if(detail.node.open){try{renderDetail();}catch(error){detail.node.close();current=null;}}}
    if(!admin&&changed.some(function(k){return ['settings','clientSettings','clients'].includes(k);}))applyDefaults();
  });
})();
