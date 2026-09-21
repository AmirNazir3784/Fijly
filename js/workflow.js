/* Shared operational UI. Every screen reads the same session mock service. */
(function () {
  'use strict';
  var api = window.FijlyMock, state = api.state, admin = document.body.classList.contains('admin-body');
  var filters = {}, current = null, clientFilter = 'all', applyDefaults = function () {};
  function el(tag, text, cls) { var node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (cls) node.className = cls; return node; }
  function button(text, fn, primary) { var node = el('button', text, primary ? 'btn btn-primary btn--md' : 'btn btn-outline btn--md'); node.type = 'button'; node.onclick = function () { try { fn(); } catch (error) { showError(error); } }; return node; }
  function badge(text) { return el('span', text, 'badge ' + (['Completed','Approved','Resolved'].includes(text) ? 'badge-success' : ['Client Review','Draft Ready'].includes(text) ? 'badge-info' : 'badge-warning')); }
  function client(request) { return api.get('clients', request.client); }
  function date(value) { return value ? value.slice(0,10) : 'Not set'; }
  function requestFor(kind, item) { return kind === 'requests' ? item : api.requestFor(kind === 'videos' ? item : api.get('videos', item.videoId)); }
  function files(input) { return Array.from(input.files || []).map(function (file) { return { name:file.name,size:file.size,type:file.type }; }); }
  function dialog(id, title) { var d = el('dialog', undefined, 'admin-dialog workflow-detail'); d.id = id; d.setAttribute('aria-labelledby', id + '-title'); var head = el('div', undefined, 'admin-dialog-head'); var h = el('h2', title); h.id = id + '-title'; head.append(h, button('Close', function () { d.close(); })); var body = el('div', undefined, 'workflow-body'); d.append(head,body); document.body.append(d); d.addEventListener('close', function () { document.body.classList.toggle('admin-dialog-open', !!document.querySelector('dialog[open]')); }); return { node:d, title:h, body:body }; }
  var detail = dialog('workflow-detail','Details'), editor = dialog('workflow-editor','Edit details'), confirm = dialog('workflow-confirm','Confirm action');
  function open(d) { if (!d.node.open) d.node.showModal(); document.body.classList.add('admin-dialog-open'); }
  function showError(error) { var target = confirm.node.open ? confirm.body : editor.node.open ? editor.body : detail.body; var old = target.querySelector('.workflow-error'); if (old) old.remove(); var p = el('p',error.message,'workflow-error'); p.setAttribute('role','alert'); target.prepend(p); }
  function confirmation(title, message, action) { confirm.title.textContent = title; confirm.body.replaceChildren(el('p',message)); var actions = el('div',undefined,'workflow-actions'); actions.append(button('Cancel',function(){confirm.node.close();}),button('Confirm',function(){ action(); confirm.node.close(); },true)); confirm.body.append(actions); open(confirm); }
  function factGrid(values) { var grid = el('dl',undefined,'admin-detail-facts'); Object.entries(values).forEach(function(pair){var wrap=el('div');wrap.append(el('dt',pair[0]),el('dd',pair[1] || 'Unassigned'));grid.append(wrap);});return grid; }
  function field(form, name, label, value, type, options) { var wrap=el('div',undefined,'form-group'), l=el('label',label,'field-label'), input=el(options?'select':type==='textarea'?'textarea':'input',undefined,'input'); input.name=name;input.id='wf-'+name;l.htmlFor=input.id;if(options)options.forEach(function(v){var o=el('option',v);o.value=v;input.append(o);});else if(type!=='textarea')input.type=type||'text';input.value=value||'';if(type==='file'){input.multiple=true;input.classList.add('workflow-file');}wrap.append(l,input);form.append(wrap);return input; }
  function formEditor(title, build, save) { editor.title.textContent=title;editor.body.replaceChildren();var form=el('form');build(form);var error=el('p',undefined,'workflow-error');error.setAttribute('role','alert');var actions=el('div',undefined,'workflow-actions');var submit=el('button','Save','btn btn-primary btn--md');submit.type='submit';actions.append(button('Cancel',function(){editor.node.close();}),submit);form.append(error,actions);form.onsubmit=function(e){e.preventDefault();if(!editor.node.open)return;try{save(form);editor.node.close();}catch(err){error.textContent=err.message;}};editor.body.append(form);open(editor); }
  function editRequest(request, full) { formEditor(full?'Edit request':'Production details',function(form){ if(full){['title','platform','videoType'].forEach(function(k){field(form,k,{title:'Video title',platform:'Platform',videoType:'Video type'}[k],request[k]).required=true;});field(form,'instructions','Instructions',request.instructions,'textarea').required=true;field(form,'references','Reference links (one per line)',request.references.join('\n'),'textarea');field(form,'attachments','Add attachments (metadata only)','','file');field(form,'priority','Priority',request.priority,null,['Low','Normal','High','Urgent']);}field(form,'assignedEditor','Assigned Editor',request.assignedEditor);field(form,'deadline','Deadline',request.deadline,'date').required=true;},function(form){var input=Object.fromEntries(new FormData(form));delete input.attachments;api.updateRequest(request.id,input,full?files(form.elements.attachments):[]);}); }
  function addVersion(video) { formEditor('Add V'+(video.versions.length+1),function(form){form.append(el('p','Simulated upload: only the file name is stored. No media is uploaded.','admin-muted'));field(form,'file','Video file (optional)','','file').accept='video/*';field(form,'notes','Version notes','','textarea');},function(form){api.addVersion(video.id,form.elements.file.files[0] ? form.elements.file.files[0].name : '',form.elements.notes.value);}); }
  function feedback(video) { formEditor(admin?'Record client revision feedback':'Request a revision',function(form){form.append(el('p','Feedback will be attached to V'+api.latest(video).number+'. Previous feedback stays in the history.','admin-muted'));field(form,'feedback','Client feedback','','textarea').required=true;},function(form){if(admin)api.requestRevision(video.id,form.elements.feedback.value,client(api.requestFor(video)).contact);else api.client.revise(video.id,form.elements.feedback.value);}); }
  function changeVideo(video, status) { confirmation(status, status==='Completed'?'Complete this video? Its request will also be marked Completed.':status==='Approved'?'Approve the current version and resolve its open revision?':'Change this video to '+status+'?',function(){if(admin)api.setVideoStatus(video.id,status);else api.client.approve(video.id);}); }
  function show(kind,id) { if(!admin)api.client.get(kind,id); current={kind:kind,id:id};renderDetail();open(detail); }
  function history(body, video) {
    body.append(el('h3','Versions'));
    if(!video.versions.length)body.append(el('p','No versions yet. Your first draft will appear here when ready.','admin-muted'));
    video.versions.slice().reverse().forEach(function(version){var row=el('details',undefined,'workflow-version');row.append(el('summary','V'+version.number+' · '+version.filename),el('p',version.notes),el('p',date(version.createdAt)+' · Simulated media · No playable file uploaded','admin-muted'));body.append(row);});
    body.append(el('h3','Client feedback'));
    if(!video.feedback.length)body.append(el('p','No client feedback yet.','admin-muted'));
    video.feedback.slice().reverse().forEach(function(f){var row=el('div',undefined,'workflow-entry');row.append(el('strong',f.author+' · V'+f.version+' · '+date(f.at)),el('p',f.text));body.append(row);});
    body.append(el('h3','Revision history'));
    if(!api.rounds(video).length)body.append(el('p','No revision rounds requested.','admin-muted'));
    api.rounds(video).slice().reverse().forEach(function(r){var row=el('div',undefined,'workflow-entry');row.append(button('Round '+r.round+' · '+r.status,function(){show('revisions',r.id);}),el('p',r.resolution || 'Feedback on V'+r.baseVersion+(r.submittedVersion?' · Returned as V'+r.submittedVersion:''),'admin-muted'));body.append(row);});
    body.append(el('h3','Activity timeline'));video.activity.slice().reverse().forEach(function(a){var row=el('div',undefined,'workflow-entry');row.append(el('p',a.text),el('small',new Date(a.at).toLocaleString(),'admin-muted'));body.append(row);});
  }
  function renderDetail() {
    if(!current)return;var kind=current.kind,item=admin?api.get(kind,current.id):api.client.get(kind,current.id),request=requestFor(kind,item),body=detail.body;detail.title.textContent=kind==='revisions'?'Revision round '+item.round+' · '+request.title:request.title;body.replaceChildren(badge(item.status));
    var facts={Client:client(request).name,Platform:request.platform,'Video type':request.videoType,Priority:request.priority,'Requested date':date(kind==='revisions'?item.requestedAt:request.requestedAt),Deadline:request.deadline,'Video length':request.length};if(admin)facts['Assigned Editor']=request.assignedEditor;body.append(factGrid(facts));
    var actions=el('div',undefined,'workflow-actions');
    if(kind==='requests') {
      body.append(el('h3','Instructions'),el('p',request.instructions,'workflow-feedback'),el('h3','Reference links'));
      if(!request.references.length)body.append(el('p','No reference links provided.','admin-muted'));
      request.references.forEach(function(url){var p=el('p'),a=el('a',url);a.href=url;a.target='_blank';a.rel='noopener noreferrer';p.append(a);body.append(p);});
      body.append(el('h3','Attachments'));body.append(el('p',request.attachments.length?request.attachments.map(function(a){return a.name+' ('+Math.ceil(a.size/1024)+' KB)';}).join('\n'):'No attachments.','workflow-feedback'));body.append(el('p','Attachment metadata only; files are not uploaded in this preview.','admin-muted'));
      if(admin && request.status!=='Completed'){actions.append(button('Edit details',function(){editRequest(request,true);}));if(request.status==='Submitted')actions.append(button('Review request',function(){api.reviewRequest(request.id);}));}
      var linked=state.videos.find(function(v){return v.requestId===request.id;});
      if(linked)actions.append(button('Open video',function(){show('videos',linked.id);},true));
      else if(admin)actions.append(button('Move to production',function(){confirmation('Move to production','Create a linked production workspace for this request?',function(){var video=api.produce(request.id);show('videos',video.id);});},true));
      body.append(actions);return;
    }
    var video=kind==='videos'?item:api.get('videos',item.videoId);
    actions.append(button('Original request',function(){show('requests',request.id);}));
    if(kind==='revisions'){var f=video.feedback.find(function(value){return value.id===item.feedbackId;});body.append(el('h3','Client feedback · V'+item.baseVersion),el('blockquote',f.text,'workflow-feedback'),el('p',f.author+' · '+date(f.at),'admin-muted'));actions.append(button('Open video',function(){show('videos',video.id);}));}
    if(admin && video.status!=='Completed' && (kind!=='revisions'||item.status!=='Resolved')) {
      actions.append(button('Edit production details',function(){editRequest(request,false);}));
      var revision=api.activeRevision(video);
      if(['In Production','Draft Ready','In Revision'].includes(video.status) && (!revision || revision.status!=='Revision Requested'))actions.append(button('Add version',function(){addVersion(video);}));
      if(kind==='revisions')api.revisionTransitions(item).forEach(function(status){actions.append(button(status==='Resolved'?'Resolve & approve':status==='In Revision'?'Start revision':status==='Draft Ready'?'Mark draft ready':'Send to Client Review',function(){confirmation(status,'Change this revision to '+status+(status==='Resolved'?' and approve its video':'')+'?',function(){api.setRevisionStatus(item.id,status);});},true));});
      else api.videoTransitions(video).forEach(function(status){actions.append(button({'Draft Ready':'Mark draft ready','Client Review':'Send to Client Review',Approved:'Mark approved',Completed:'Mark completed'}[status],function(){changeVideo(video,status);},true));});
      if(video.status==='Client Review')actions.append(button('Record client revision',function(){feedback(video);}));
      if(kind==='videos'&&revision&&revision.status==='Revision Requested')actions.append(button('Open requested revision',function(){show('revisions',revision.id);},true));
    } else if(!admin && kind==='videos' && video.status==='Client Review') { actions.append(button('Request revision',function(){feedback(video);}),button('Approve video',function(){changeVideo(video,'Approved');},true)); }
    var latest=api.latest(video);body.append(el('h3',video.status==='Completed'?'Final delivery':'Latest draft'),el('p',latest?'V'+latest.number+' · '+latest.filename:'Awaiting first draft'),el('p','Simulated media record. No playable or downloadable file has been uploaded.','admin-muted'));body.append(actions);history(body,video);
  }
  function setupList(kind,container) {
    var toolbar=el('div',undefined,'workflow-toolbar');filters[kind]={search:'',status:'all',client:'all',priority:'all',sort:'newest'};
    [['search','Search',null],['status','Status',(kind==='requests'?api.requestStatuses:kind==='videos'?api.videoStatuses:api.revisionStatuses)],['client','Client',state.clients.map(function(c){return c.id;})],['priority','Priority',['Low','Normal','High','Urgent']],['sort','Sort',['newest','oldest','deadline','priority','title']]].forEach(function(spec){var label=el('label',spec[1]),input=el(spec[2]?'select':'input',undefined,'input');input.setAttribute('aria-label',spec[1]);input.dataset.filter=spec[0];if(spec[2]){if(spec[0]!=='sort'){var all=el('option',{status:'All statuses',client:'All clients',priority:'All priorities'}[spec[0]]);all.value='all';input.append(all);}spec[2].forEach(function(value){var o=el('option',spec[0]==='client'?api.get('clients',value).name:value);o.value=value;input.append(o);});}else{input.type='search';input.placeholder='Title, client or editor';}input.addEventListener(spec[2]?'change':'input',function(){filters[kind][spec[0]]=input.value;renderList(kind);});label.append(input);toolbar.append(label);});
    container.append(toolbar,el('div',undefined,'workflow-results'));renderList(kind);
  }
  function renderList(kind) {
    var container=document.querySelector('[data-workflow-list="'+kind+'"]');if(!container)return;var f=filters[kind],target=container.querySelector('.workflow-results');var records=state[kind].filter(function(item){var r=requestFor(kind,item);return(f.status==='all'||f.status===item.status)&&(f.client==='all'||f.client===r.client)&&(f.priority==='all'||f.priority===r.priority)&&[r.title,client(r).name,r.assignedEditor].join(' ').toLowerCase().includes(f.search.toLowerCase());});
    records.sort(function(a,b){var x=requestFor(kind,a),y=requestFor(kind,b);if(f.sort==='priority')return ['Urgent','High','Normal','Low'].indexOf(x.priority)-['Urgent','High','Normal','Low'].indexOf(y.priority);if(f.sort==='title')return x.title.localeCompare(y.title);if(f.sort==='deadline')return x.deadline.localeCompare(y.deadline);return (f.sort==='oldest'?1:-1)*(a.requestedAt||x.requestedAt).localeCompare(b.requestedAt||y.requestedAt);});
    target.replaceChildren(el('p',records.length+' '+kind,'admin-result-count'));
    if(!records.length){var empty=el('div',undefined,'admin-empty');empty.append(el('strong','No matching '+kind),el('p','Try another search or clear your filters.'),button('Clear filters',function(){container.querySelectorAll('[data-filter]').forEach(function(input){input.value=input.dataset.filter==='search'?'':input.dataset.filter==='sort'?'newest':'all';filters[kind][input.dataset.filter]=input.value;});renderList(kind);}));target.append(empty);return;}
    var wrap=el('div',undefined,'workflow-table-wrap');wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label',kind+' table, scroll horizontally');var table=el('table',undefined,'table workflow-table'),head=el('thead'),tr=el('tr');['Video / Client',kind==='revisions'?'Round / Requested':'Type / Platform','Status','Priority','Assigned Editor','Deadline'].forEach(function(t){var th=el('th',t);th.scope='col';tr.append(th);});head.append(tr);var tbody=el('tbody');records.forEach(function(item){var r=requestFor(kind,item),row=el('tr'),identity=el('td');var b=button(r.title,function(){show(kind,item.id);});b.className='btn-link';identity.append(b,el('span',client(r).name,'admin-muted admin-block'));row.append(identity);var type=el('td',kind==='revisions'?'Round '+item.round+' / '+date(item.requestedAt):r.videoType+' / '+r.platform);var status=el('td');status.append(badge(item.status));row.append(type,status,el('td',r.priority),el('td',r.assignedEditor||'Unassigned'),el('td',r.deadline,'admin-date'));tbody.append(row);});table.append(head,tbody);wrap.append(table);target.append(el('p','Scroll horizontally to see all details.','table-hint'),wrap);
  }
  function renderClient() {
    var requests=api.client.records('requests'), videos=api.client.records('videos');
    var list=document.querySelector('[data-request-list]'),heading=el('h2','Your requests','panel__title');heading.id='h-open-requests';list.replaceChildren(heading);
    requests.slice().sort(function(a,b){return b.requestedAt.localeCompare(a.requestedAt);}).forEach(function(r){var card=el('article',undefined,'list-card workflow-request-card');card.append(el('h3',r.title,'list-card__title'),badge(r.status),el('p',r.videoType+' · Requested '+date(r.requestedAt)+' · Due '+r.deadline,'admin-muted'),button('View request',function(){show('requests',r.id);}));list.append(card);});
    if(!requests.length)list.append(el('p','No requests yet. Submit your first brief to get started.','admin-muted'));
    var count=requests.filter(function(r){return ['Submitted','Under Review'].includes(r.status);}).length;var counter=document.querySelector('[data-request-count]');counter.textContent=count;counter.setAttribute('aria-label',count+' open requests');
    var statusFilter=document.querySelector('#client-project-status'), search=document.querySelector('#client-project-search');
    var rows=requests.map(function(r){var v=videos.find(function(v){return v.requestId===r.id;}),revision=v&&api.activeRevision(v);return {request:r,video:v,status:v?(revision&&revision.status==='Revision Requested'?'Revision Requested':v.status):'New Request'};});
    rows=rows.filter(function(item){return (clientFilter==='all'||clientFilter==='delivered'&&item.status==='Completed'||clientFilter==='review'&&item.status==='Client Review'||clientFilter==='production'&&!['Completed','Client Review','New Request'].includes(item.status))&&(!statusFilter||statusFilter.value==='all'||item.status===statusFilter.value)&&(!search||item.request.title.toLowerCase().includes(search.value.toLowerCase()));});
    var tbody=document.querySelector('.projects-table tbody');tbody.replaceChildren();rows.forEach(function(item){var r=item.request,v=item.video,row=el('tr'),title=el('td');title.append(button(r.title,function(){show(v?'videos':'requests',v?v.id:r.id);}));var status=el('td');status.append(badge(item.status));row.append(title,el('td',r.videoType),status,el('td',r.deadline),el('td',v&&v.versions.length?'V'+api.latest(v).number:'No draft'));tbody.append(row);});
    if(!rows.length){var row=el('tr'),cell=el('td','No projects match this filter.');cell.colSpan=5;row.append(cell);tbody.append(row);}
  }
  window.FijlyWorkflow = { open: show };
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
    requestForm.onsubmit=function(e){e.preventDefault();var note=document.querySelector('[data-request-note]');try{var f=requestForm.elements;api.client.createRequest({title:f.name.value,videoType:f.type.value,instructions:f.brief.value,platform:f.platform.value,priority:f.priority.value,deadline:f.due.value,length:f.namedItem('length').value,references:f.references.value},files(f.attachments));requestForm.reset();note.textContent='Request submitted. It is now available in Admin Video Requests.';}catch(error){note.textContent=error.message;}note.hidden=false;};renderClient();
  }
  if(!admin){document.querySelectorAll('#client-project-status,#client-project-search').forEach(function(input){input.addEventListener('input',renderClient);});window.addEventListener('fijly:clientchange',function(){current=null;[detail,editor,confirm].forEach(function(d){d.node.close();});clientFilter='all';document.querySelector('#client-project-status').value='all';document.querySelector('#client-project-search').value='';document.querySelectorAll('.filter-chip').forEach(function(chip){chip.setAttribute('aria-pressed',String(chip.dataset.filter==='all'));});requestForm.reset();document.querySelector('[data-request-note]').hidden=true;});}
  api.subscribe(function(changed){
    if(admin && changed.includes('clients'))document.querySelectorAll('[data-workflow-list] [data-filter="client"]').forEach(function(select){var value=select.value;select.replaceChildren();var all=el('option','All clients');all.value='all';select.append(all);state.clients.forEach(function(c){var option=el('option',c.name);option.value=c.id;select.append(option);});select.value=state.clients.some(function(c){return c.id===value;})?value:'all';filters[select.closest('[data-workflow-list]').dataset.workflowList].client=select.value;});
    if(changed.some(function(k){return ['clients','requests','videos','revisions'].includes(k);})) {if(admin)Object.keys(filters).forEach(renderList);else renderClient();if(detail.node.open){try{renderDetail();}catch(error){detail.node.close();current=null;}}}
    if(!admin&&changed.some(function(k){return ['settings','clientSettings','clients'].includes(k);}))applyDefaults();
  });
})();
