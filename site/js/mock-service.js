/* Session-only mock workflow. No HTTP calls, accounts, or binary uploads. */
(function () {
  'use strict';
  var key = 'fijly-studio-workflow-v3';
  var seed = window.FijlyAdminData;
  var clone = function (value) { return JSON.parse(JSON.stringify(value)); };
  var videoStatuses = ['In Production', 'Draft Ready', 'Client Review', 'Approved', 'In Revision', 'Completed'];
  var revisionStatuses = ['Revision Requested', 'In Revision', 'Draft Ready', 'Client Review', 'Resolved'];
  var requestStatuses = ['Submitted', 'Under Review', 'In Production', 'Completed'];
  var scriptStatuses = ['Draft', 'Client Review', 'Approved', 'Revision Requested'];
  var assetCategories = ['Logo', 'Brand Guidelines', 'Fonts', 'Headshots', 'B-roll', 'Product Images', 'Reference Files', 'Other'];
  var lengths = ['15–30 sec', '30–45 sec', '60–90 sec', '90–120 sec', '2–3 min', '3 min+'];
  var stamp = function () { return new Date().toISOString(); };
  // One badge colour per status name, shared by both portals.
  var statusTones = { Submitted: 'badge-info', 'Under Review': 'badge-info', 'In Production': 'badge-warning', 'Draft Ready': 'badge-info', 'Client Review': 'badge-warning', 'In Revision': 'badge-warning', Approved: 'badge-success', Completed: 'badge-success', 'Revision Requested': 'badge-warning', Resolved: 'badge-success', Draft: '' };
  // Date-only values (deadlines) are calendar dates: read them as local dates so
  // they never shift a day. Timestamps are shown in the viewer's time zone.
  function toDate(value) {
    var day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    return day ? new Date(+day[1], +day[2] - 1, +day[3]) : new Date(value);
  }
  function formatDate(value, fallback) {
    var d = value ? toDate(value) : null;
    if (!d || isNaN(d)) return fallback === undefined ? 'Not set' : fallback;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function formatDateTime(value, fallback) {
    var d = value ? toDate(value) : null;
    if (!d || isNaN(d)) return fallback === undefined ? 'Not set' : fallback;
    return formatDate(value) + ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  var id = function (prefix) { return prefix + '-' + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2)); };
  function initialState() {
    var initial = { schema: 3, revision: 0, snapshot: seed.snapshot, clients: clone(seed.clients), activity: [], requests: [], videos: [], revisions: [], assets: clone(seed.assets || []), settings: clone(seed.settings || {}) };
    seed.projects.forEach(function (project, index) {
      var request = { id: 'req-' + (index + 1), client: project.client, title: project.title, platform: 'Website', videoType: project.format, instructions: 'Show the core product workflow clearly, with concise narration and a clear next step.', references: ['https://example.com/creative-reference'], attachments: [{ name: 'brand-guidelines.pdf', size: 124000, type: 'application/pdf' }], requestedAt: '2026-09-14T10:00:00Z', deadline: project.due, priority: index % 3 === 0 ? 'High' : 'Normal', assignedEditor: index % 2 ? 'Devon Park' : 'Maya Chen', length: '60–90 sec', status: project.status === 'Delivered' ? 'Completed' : 'In Production' };
      var state = { 'In production': 'In Production', 'In review': 'Client Review', 'Script approved': 'In Production', Delivered: 'Completed' }[project.status];
      var versions = project.status === 'Script approved' ? [] : [{ id: 'ver-' + (index + 1), number: 1, filename: 'draft-v1.mp4', notes: 'Initial production draft.', createdAt: '2026-09-18T10:00:00Z', simulated: true, revisionId: null }];
      initial.requests.push(request);
      initial.videos.push({ id: 'video-' + (index + 1), requestId: request.id, status: state, versions: versions, feedback: [], activity: [{ id: id('event'), at: request.requestedAt, text: 'Request moved into production.' }] });
    });
    backfillCompletions(initial.videos);
    ['Northbeam / Onboarding', 'AIFlow / Feature promo', 'Finly / Pricing explainer'].forEach(function (title, index) {
      initial.requests.push({ id: 'pending-' + (index + 1), client: 'northbeam', title: title, platform: ['Website', 'LinkedIn', 'YouTube'][index], videoType: ['Tutorial', 'Product Promo', 'Explainer'][index], instructions: ['Explain connecting a data source and creating the first report.', 'Introduce the new automation features in a concise social video.', 'Explain how to choose the right product configuration.'][index], references: [], attachments: [], requestedAt: '2026-09-' + (18 + index) + 'T10:00:00Z', deadline: ['2026-09-30', '2026-10-04', '2026-10-09'][index], priority: index === 0 ? 'High' : 'Normal', assignedEditor: '', length: '60–90 sec', status: index === 0 ? 'Under Review' : 'Submitted' });
    });
    var video = initial.videos[6];
    if (!video) return initial;
    video.status = 'In Revision';
    var feedback = { id: 'feedback-seed', version: 1, at: '2026-09-20T09:00:00Z', author: 'Jordan Lee', text: 'Please slow down the health-score walkthrough at 00:18 and add a clearer closing CTA.' };
    video.feedback.push(feedback);
    initial.revisions.push({ id: 'revision-seed', videoId: video.id, round: 1, feedbackId: feedback.id, requestedAt: feedback.at, status: 'Revision Requested', baseVersion: 1, submittedVersion: null, resolvedAt: null });
    video.activity.push({ id: id('event'), at: feedback.at, text: 'Revision round 1 requested on V1.' });
    return initial;
  }
  // Seeded deliveries carry a fixed completion date. Sessions saved before the
  // fixture had one are filled in on load; the event ID is deterministic so
  // every open tab derives the same record.
  function backfillCompletions(videos) {
    seed.projects.forEach(function (project, index) {
      var video = videos.find(function (v) { return v.id === 'video-' + (index + 1) && v.requestId === 'req-' + (index + 1); });
      if (!project.completedAt || !video || video.status !== 'Completed' || video.completedAt) return;
      video.completedAt = project.completedAt;
      var latestVersion = video.versions[video.versions.length - 1];
      video.activity.push({ id: 'event-completed-' + video.id, at: project.completedAt, text: 'Status changed to Completed' + (latestVersion ? ' / V' + latestVersion.number : '') + '.' });
    });
  }
  // New productions start with an outline in the same scene shape as the seeded
  // scripts, so the Client and Admin Scripts screens render it immediately.
  function draftScript(video, request, at) {
    var product = request.title.split(' / ')[0];
    return { id: 'script-' + video.id, client: request.client, videoId: video.id, title: request.title + ' / Script', status: 'Draft', version: 1, createdAt: at, updatedAt: at, scenes: [
      { label: 'Opening', text: 'Open on the moment ' + product + ' matters to the viewer.' },
      { label: 'Problem', text: 'Name the everyday problem this ' + request.videoType.toLowerCase() + ' addresses.' },
      { label: 'Solution', text: 'Introduce how ' + product + ' solves it, in one clear sentence.' },
      { label: 'Product demo', text: 'Show the core workflow step by step. ' + request.instructions },
      { label: 'CTA', text: 'Close with a clear next step for the viewer.' }
    ], feedback: [] };
  }
  var state;
  try { state = JSON.parse(sessionStorage.getItem(key)); } catch (_) { /* Memory-only fallback. */ }
  if (!state || state.schema !== 3) state = initialState();
  // Recover malformed session records individually; never reset valid work just
  // because an optional field or an unrelated record is damaged.
  var collections = ['clients', 'requests', 'videos', 'revisions', 'assets', 'scripts'];
  function repairVideo(v) {
    var numbers = new Set(), ids = new Set(); v.versions = (Array.isArray(v.versions) ? v.versions : []).filter(function (x) { if (!x || !x.id || !Number.isInteger(x.number) || x.number < 1 || numbers.has(x.number) || ids.has(x.id)) return false; numbers.add(x.number); ids.add(x.id); return true; }).sort(function (a,b) { return a.number-b.number; }); v.versions.forEach(function (x) { x.filename = String(x.filename || 'draft-v'+x.number+'.mp4'); x.notes = String(x.notes || ''); x.createdAt = String(x.createdAt || ''); }); v.feedback = (Array.isArray(v.feedback) ? v.feedback : []).filter(function (f) { return f && f.id && numbers.has(f.version); }); v.activity = (Array.isArray(v.activity) ? v.activity : []).filter(function (a) { return a && typeof a.at === 'string'; }); if (!v.versions.length && !['In Production','Completed'].includes(v.status)) v.status = 'In Production';
  }
  function repairState() {
    state.settings = Object.assign({}, seed.settings, state.settings || {});
    state.clientSettings = state.clientSettings || {};
    state.activity = Array.isArray(state.activity) ? state.activity : [];
    state.snapshot = /^\d{4}-\d{2}-\d{2}$/.test(state.snapshot) ? state.snapshot : seed.snapshot;
    state.revision = Number.isFinite(state.revision) ? state.revision : 0;
    var hadScripts = Array.isArray(state.scripts);
    collections.forEach(function (key) { var seen = new Set(); state[key] = (Array.isArray(state[key]) ? state[key] : []).filter(function (r) { if (!r || typeof r.id !== "string" || !r.id || seen.has(r.id)) return false; seen.add(r.id); return true; }); });
    state.clients = state.clients.filter(function (c) { return typeof c.name === 'string' && c.name.trim(); });
    state.clients.forEach(function (c) { ['contact','email','industry','notes'].forEach(function (k) { c[k] = String(c[k] || ''); }); if (!['Active','Onboarding','Paused'].includes(c.status)) c.status = 'Onboarding'; });
    var clients = new Set(state.clients.map(function (r) { return r.id; }));
    state.requests = state.requests.filter(function (r) { return clients.has(r.client) && typeof r.title === 'string' && requestStatuses.includes(r.status); });
    state.requests.forEach(function (r) { ['instructions','platform','videoType','assignedEditor','deadline','requestedAt','length'].forEach(function (k) { r[k] = String(r[k] || ''); }); r.references = (Array.isArray(r.references) ? r.references : []).filter(function (url) { try { return ['https:','http:'].includes(new URL(url).protocol); } catch (_) { return false; } }); r.attachments = metadata(r.attachments); });
    var requests = new Set(state.requests.map(function (r) { return r.id; })), videoRequests = new Set();
    state.videos = state.videos.filter(function (v) { if (!requests.has(v.requestId) || videoRequests.has(v.requestId) || !videoStatuses.includes(v.status)) return false; videoRequests.add(v.requestId); return true; });
    state.videos.forEach(repairVideo);
    var videos = new Map(state.videos.map(function (v) { return [v.id,v]; })), roundKeys = new Set();
    state.revisions = state.revisions.filter(function (r) { var v=videos.get(r.videoId), key=r.videoId+'/'+r.round; if (!v || !revisionStatuses.includes(r.status) || !Number.isInteger(r.round) || r.round<1 || roundKeys.has(key) || !v.feedback.some(function (f) { return f.id===r.feedbackId && f.version===r.baseVersion; })) return false; roundKeys.add(key); return true; });
    state.assets = state.assets.filter(function (a) { return clients.has(a.client) && typeof a.name==='string' && assetCategories.includes(a.category); });
    state.assets.forEach(function (a) { a.fileType = String(a.fileType || a.name.split('.').pop() || 'file'); a.size = fileSize(a.size); a.uploadedAt = String(a.uploadedAt || ''); a.notes = String(a.notes || ''); });
    state.scripts = state.scripts.filter(function (s) { var v=videos.get(s.videoId), r=v && state.requests.find(function (r) { return r.id===v.requestId; }); return r && r.client===s.client && clients.has(s.client); });
    state.scripts.forEach(function (s) { s.scenes = Array.isArray(s.scenes)?s.scenes:[]; s.feedback = Array.isArray(s.feedback)?s.feedback:[]; if (!scriptStatuses.includes(s.status)) s.status = 'Draft'; if (!Number.isInteger(s.version) || s.version < 1) s.version = 1; s.updatedAt = String(s.updatedAt || ''); });
    state.activity = state.activity.filter(function (a) { return a && clients.has(a.client); });
    if (!hadScripts) delete state.scripts;
  }
  function fileSize(value) { var size=Number(value);return Number.isFinite(size)&&size>=0?Math.floor(size):0; }
  function metadata(files) { return (Array.isArray(files) ? files : []).filter(function (f) { return f && String(f.name || '').trim(); }).map(function (f) { return {name:String(f.name),size:fileSize(f.size),type:String(f.type || '')}; }); }
  repairState();
  // Add client collections without resetting an existing approved workflow session.
  function extendClientState() {
    if (!state.clientSettings) state.clientSettings = {};
    if (!state.scripts) state.scripts = state.videos.map(function (video, index) {
      var request = state.requests.find(function (r) { return r.id === video.requestId; });
      var company = state.clients.find(function (c) { return c.id === request.client; });
      return { id: 'script-' + video.id, client: request.client, videoId: video.id, title: request.title + ' / Script', status: index % 3 === 0 ? 'Client Review' : 'Approved', version: 1, updatedAt: request.requestedAt, scenes: [
        { label: 'Opening', text: 'Introduce ' + request.title.split(' / ')[0] + ' and the everyday problem this ' + request.videoType.toLowerCase() + ' helps explain.' },
        { label: 'Product walkthrough', text: 'Show the core workflow step by step. ' + request.instructions },
        { label: 'Closing', text: 'Invite viewers to explore ' + company.name + ' and take the next step with the product.' }
      ], feedback: [] };
    });
    // Every video has exactly one script; fill any produced before scripts were
    // created alongside the video.
    state.videos.forEach(function (video) {
      if (state.scripts.some(function (s) { return s.videoId === video.id; })) return;
      var request = state.requests.find(function (r) { return r.id === video.requestId; });
      if (request) state.scripts.push(draftScript(video, request, (video.activity[0] || {}).at || request.requestedAt));
    });
    backfillCompletions(state.videos);
  }
  extendClientState();
  var channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(key) : null;
  var listeners = [];
  function persist() { try { sessionStorage.setItem(key, JSON.stringify(state)); } catch (_) { /* Current page still works without storage. */ } }
  function notify(changed) {
    if (service && service.client && !service.client.current()) { selectedClient=state.clients.length?state.clients[0].id:null;changed=null;window.dispatchEvent(new Event('fijly:clientchange')); }
    listeners.forEach(function (listener) { listener(changed || collections.concat(['settings','clientSettings'])); });
  }
  // Record clocks retain independent edits from simultaneous tabs. Equal clocks
  // use a stable tab ID tie-break, so all tabs converge. Same-record edits remain
  // last-writer-wins, appropriate to the existing session mock.
  var actor = id('tab'), syncKeys = collections.concat(['settings','clientSettings']);
  function records(value, key) { return Array.isArray(value[key]) ? Object.fromEntries(value[key].map(function (r) { return [r.id,r]; })) : Object.assign({},value[key]); }
  if (!state.clocks) { state.clocks={};if(state.revision)syncKeys.forEach(function(key){Object.keys(records(state,key)).forEach(function(identifier){state.clocks[key+'/'+identifier]=[state.revision,'legacy'];});}); }
  function snapshot() { var out={};syncKeys.forEach(function (k) { out[k]=clone(state[k] || (collections.includes(k)?[]:{})); }); return out; }
  var previous = snapshot();
  function commit() {
    var changes=[];
    syncKeys.forEach(function (key) { var before=records(previous,key),after=records(state,key);new Set(Object.keys(before).concat(Object.keys(after))).forEach(function (identifier) { if(JSON.stringify(before[identifier])!==JSON.stringify(after[identifier])) changes.push([key,identifier]); }); });
    if (!changes.length) return;
    state.revision = Math.max(Date.now(), state.revision + 1);
    changes.forEach(function (change) { state.clocks[change[0]+'/'+change[1]] = [state.revision,actor]; });
    previous = snapshot(); persist(); notify(Array.from(new Set(changes.map(function (c) { return c[0]; }))));
    if (channel) channel.postMessage({ type: 'state', value: clone(state) });
  }
  if (channel) {
    channel.onmessage = function (event) {
      if (event.data.type === 'get') { channel.postMessage({ type: 'state', value: clone(state) }); return; }
      var incoming = event.data.value;
      if (!incoming || incoming.schema !== 3) return;
      var changed = [];
      syncKeys.forEach(function (key) {
        var theirs=records(incoming,key),ours=records(state,key),updated=false;
        var identifiers=new Set(Object.keys(theirs).concat(Object.keys(ours),Object.keys(incoming.clocks||{}).filter(function (k) { return k.indexOf(key+'/')===0; }).map(function (k) { return k.slice(key.length+1); })));
        identifiers.forEach(function (identifier) { var path=key+'/'+identifier,remote=(incoming.clocks||{})[path]||[incoming.clocks?0:incoming.revision,''],local=state.clocks[path]||[0,'']; if(remote[0]>local[0] || remote[0]===local[0] && remote[1]>local[1]) { if(Object.prototype.hasOwnProperty.call(theirs,identifier))ours[identifier]=theirs[identifier];else delete ours[identifier];state.clocks[path]=remote;updated=true; } });
        if(updated) { state[key]=collections.includes(key)?Object.values(ours):ours;changed.push(key); }
      });
      if(changed.length) { state.revision=Math.max(state.revision,incoming.revision);repairState();extendClientState();previous=snapshot();persist();notify(changed); }
    };
    channel.postMessage({ type: 'get' });
  }
  persist();
  function get(collection, identifier) {
    var item = state[collection].find(function (record) { return record.id === identifier; });
    if (!item) throw new Error('This record is no longer available.');
    return item;
  }
  function requestFor(video) { return get('requests', video.requestId); }
  function latest(video) { return video.versions[video.versions.length - 1]; }
  function rounds(video) { return state.revisions.filter(function (item) { return item.videoId === video.id; }); }
  function activeRevision(video) { return rounds(video).find(function (item) { return item.status !== 'Resolved'; }); }
  function event(video, text) { video.activity.push({ id: id('event'), at: stamp(), text: text }); }
  function requireValue(value, label) { if (!String(value || '').trim()) throw new Error(label + ' is required.'); return String(value).trim(); }
  function validDate(value) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0,10)!==value) throw new Error('Choose a valid deadline.'); return value; }
  function normalize(input) {
    var references = Array.isArray(input.references) ? input.references : String(input.references || '').split(/\n/).map(function (value) { return value.trim(); }).filter(Boolean);
    references.forEach(function (value) { var url; try { url = new URL(value); } catch (_) { throw new Error('Reference links must be complete http(s) URLs.'); } if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only http(s) reference links are supported.'); });
    if (!['Low', 'Normal', 'High', 'Urgent'].includes(input.priority)) throw new Error('Choose a valid priority.');
    return { title: requireValue(input.title, 'Video title'), platform: requireValue(input.platform, 'Platform'), videoType: requireValue(input.videoType, 'Video type'), instructions: requireValue(input.instructions, 'Instructions'), deadline: validDate(input.deadline), priority: input.priority, assignedEditor: String(input.assignedEditor || '').trim(), references: references, length: input.length || state.settings.defaultLength || '60–90 sec' };
  }
  function videoTransitions(video) {
    var revision = activeRevision(video);
    var fresh = latest(video) && (!revision || latest(video).number > revision.baseVersion);
    return {
      'In Production': latest(video) ? ['Draft Ready'] : [],
      'Draft Ready': ['Client Review'],
      'Client Review': ['Approved'],
      Approved: ['Completed'],
      'In Revision': fresh ? ['Draft Ready'] : [],
      Completed: []
    }[video.status] || [];
  }
  function transition(video, status) {
    if (!videoTransitions(video).includes(status)) throw new Error('This status change is not available. Add a new draft or finish the current review first.');
    var revision = activeRevision(video);
    video.status = status;
    if (revision) {
      if (status === 'Draft Ready') revision.status = 'Draft Ready';
      if (status === 'Client Review') { revision.status = 'Client Review'; revision.submittedVersion = latest(video).number; }
      if (status === 'Approved') { revision.status = 'Resolved'; revision.resolvedAt = stamp(); }
    }
    if (status === 'Completed') { requestFor(video).status = 'Completed'; video.completedAt = stamp(); }
    event(video, 'Status changed to ' + status + (latest(video) ? ' / V' + latest(video).number : '') + '.');
  }
  var service = {
    state: state, videoStatuses: videoStatuses, revisionStatuses: revisionStatuses, requestStatuses: requestStatuses, scriptStatuses: scriptStatuses, assetCategories: assetCategories,
    formatDate: formatDate, formatDateTime: formatDateTime,
    statusClass: function (status) { return 'badge ' + (statusTones[status] || ''); },
    // Submitted or Under Review requests that have not yet become a video.
    pendingRequests: function (clientId) { return state.requests.filter(function (r) { return ['Submitted', 'Under Review'].includes(r.status) && (!clientId || r.client === clientId) && !state.videos.some(function (v) { return v.requestId === r.id; }); }); },
    subscribe: function (listener) { listeners.push(listener); return function () { listeners = listeners.filter(function (entry) { return entry !== listener; }); }; },
    get: get, requestFor: requestFor, latest: latest, rounds: rounds, activeRevision: activeRevision, videoTransitions: videoTransitions,
    completedAt: function (video) { return video.completedAt || (video.activity.find(function(a){return String(a.text).indexOf('Status changed to Completed')===0;}) || {}).at || null; },
    saveClient: function (record) {
      record = Object.assign({},record,{name:requireValue(record.name,'Company name'),contact:requireValue(record.contact,'Contact name'),email:requireValue(record.email,'Email')});
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(record.email)) throw new Error('Enter a valid email address.');
      if (!['Active','Onboarding','Paused'].includes(record.status)) throw new Error('Choose a valid client status.');
      if (state.clients.some(function (c) { return c.id!==record.id && c.name.toLowerCase()===record.name.toLowerCase(); })) throw new Error('A client with this company name already exists.');
      var existing = state.clients.find(function (item) { return item.id === record.id; });
      if (existing) Object.assign(existing, record); else { record.id = id('client'); state.clients.push(record); }
      commit(); return record;
    },
    createRequest: function (input, clientId, attachments) {
      get('clients', clientId);
      var request = Object.assign(normalize(input), { id: id('req'), client: clientId, requestedAt: stamp(), status: 'Submitted', attachments: metadata(attachments) });
      state.requests.push(request); commit(); return request;
    },
    updateRequest: function (identifier, input, attachments) {
      var request = get('requests', identifier);
      if (request.status === 'Completed') throw new Error('Completed requests are read-only.');
      var values = normalize(Object.assign({}, request, input));
      Object.assign(request, values);
      if (attachments && attachments.length) request.attachments.push.apply(request.attachments, metadata(attachments));
      var video = state.videos.find(function (item) { return item.requestId === identifier; });
      if (video) event(video, 'Production details updated. Editor: ' + (request.assignedEditor || 'Unassigned') + '; deadline: ' + formatDate(request.deadline) + '.');
      commit();
    },
    reviewRequest: function (identifier) {
      var request = get('requests', identifier);
      if (request.status !== 'Submitted') throw new Error('This request has already been reviewed.');
      request.status = 'Under Review'; commit();
    },
    produce: function (identifier) {
      var existing = state.videos.find(function (item) { return item.requestId === identifier; });
      if (existing) return existing;
      var request = get('requests', identifier);
      if (!['Submitted', 'Under Review'].includes(request.status)) throw new Error('This request cannot move into production.');
      var video = { id: id('video'), requestId: identifier, status: 'In Production', versions: [], feedback: [], activity: [] };
      request.status = 'In Production'; event(video, 'Request moved into production.'); state.videos.push(video);
      if (!state.scripts.some(function (s) { return s.videoId === video.id; })) state.scripts.push(draftScript(video, request, stamp()));
      commit(); return video;
    },
    setVideoStatus: function (identifier, status) { transition(get('videos', identifier), status); commit(); },
    addVersion: function (identifier, filename, notes) {
      var video = get('videos', identifier), revision = activeRevision(video);
      if (!['In Production', 'Draft Ready', 'In Revision'].includes(video.status)) throw new Error('Versions can only be added during production or revision.');
      if (revision && revision.status === 'Revision Requested') throw new Error('Start the revision before adding a revised version.');
      var number = video.versions.reduce(function (max, item) { return Math.max(max, item.number); }, 0) + 1;
      video.versions.push({ id: id('version'), number: number, filename: String(filename || 'draft-v' + number + '.mp4'), notes: String(notes || 'Production draft.').trim(), createdAt: stamp(), simulated: true, revisionId: revision ? revision.id : null });
      event(video, 'Simulated V' + number + ' added; previous versions retained.');
      commit(); return latest(video);
    },
    requestRevision: function (identifier, text, author) {
      var video = get('videos', identifier);
      if (video.status !== 'Client Review') throw new Error('Feedback can request a revision only during Client Review.');
      text = requireValue(text, 'Client feedback');
      var previous = activeRevision(video);
      if (previous && previous.status !== 'Client Review') throw new Error('A revision is already open.');
      var feedback = { id: id('feedback'), version: latest(video).number, at: stamp(), author: author || get('clients', requestFor(video).client).contact, text: text };
      video.feedback.push(feedback);
      var round = rounds(video).length + 1;
      if (previous) { previous.status = 'Resolved'; previous.resolvedAt = stamp(); previous.resolution = 'Continued in round ' + round; }
      var revision = { id: id('revision'), videoId: video.id, round: round, feedbackId: feedback.id, requestedAt: feedback.at, status: 'Revision Requested', baseVersion: latest(video).number, submittedVersion: null, resolvedAt: null };
      state.revisions.push(revision); video.status = 'In Revision'; event(video, 'Revision round ' + round + ' requested on V' + latest(video).number + '.'); commit(); return revision;
    },
    revisionTransitions: function (revision) {
      var video = get('videos', revision.videoId);
      return { 'Revision Requested': ['In Revision'], 'In Revision': latest(video).number > revision.baseVersion ? ['Draft Ready'] : [], 'Draft Ready': ['Client Review'], 'Client Review': ['Resolved'], Resolved: [] }[revision.status] || [];
    },
    /* Assets ---------------------------------------------------------------
       Simulated only: a picked file contributes its name, type and size. No
       bytes are read, stored or uploaded anywhere. */
    saveAsset: function (input) {
      var name = requireValue(input.name, 'File name');
      if (!assetCategories.includes(input.category)) throw new Error('Choose a valid category.');
      get('clients', input.client);
      var notes = String(input.notes || '').trim();
      if (input.id) {
        var existing = get('assets', input.id);
        Object.assign(existing, { name: name, category: input.category, client: input.client, notes: notes });
        commit();
        return existing;
      }
      var record = {
        id: id('asset'), client: input.client, name: name, category: input.category,
        fileType: String(input.fileType || name.split('.').pop() || 'file').toLowerCase(),
        size: fileSize(input.size), uploadedAt: stamp(), notes: notes, simulated: true
      };
      state.assets.push(record);
      commit();
      return record;
    },
    deleteAsset: function (identifier) {
      var index = state.assets.findIndex(function (item) { return item.id === identifier; });
      if (index === -1) throw new Error('This asset is no longer available.');
      var removed = state.assets.splice(index, 1)[0];
      commit();
      return removed;
    },
    assetsFor: function (clientId) {
      return state.assets.filter(function (item) { return item.client === clientId; });
    },
    /* Scripts ---------------------------------------------------------------
       The client approves or asks for a revision during Client Review; the
       studio reopens a requested revision as a new draft and sends it back. */
    adminReviewScript: function (identifier) {
      var script = get('scripts', identifier);
      if (script.status !== 'Revision Requested') throw new Error('Only a script with a requested revision can be reopened.');
      script.status = 'Draft'; script.version += 1; script.updatedAt = stamp();
      commit(); return script;
    },
    adminSendScriptForReview: function (identifier) {
      var script = get('scripts', identifier);
      if (script.status !== 'Draft') throw new Error('Only a draft script can be sent for client review.');
      if (!script.scenes.length || script.scenes.some(function (scene) { return !String(scene.text || '').trim(); })) throw new Error('Write every scene before sending the script to the client.');
      script.status = 'Client Review'; script.updatedAt = stamp();
      commit(); return script;
    },
    // Scene text is editable only while the studio holds the script as a draft.
    // Labels and scene order stay fixed; `scenes` is the new text per scene.
    updateScriptScenes: function (identifier, scenes) {
      var script = get('scripts', identifier);
      if (script.status !== 'Draft') throw new Error('Only a draft script can be edited.');
      if (!Array.isArray(scenes) || scenes.length !== script.scenes.length) throw new Error('This script changed elsewhere. Reopen it and try again.');
      var next = script.scenes.map(function (scene, index) { var value = scenes[index]; return { label: scene.label, text: String(value && typeof value === 'object' ? value.text : value || '').trim() }; });
      if (JSON.stringify(next) === JSON.stringify(script.scenes)) return script;
      script.scenes = next; script.updatedAt = stamp();
      commit(); return script;
    },
    /* Settings -------------------------------------------------------------- */
    saveSettings: function (values) {
      var next = Object.assign({}, state.settings, values);
      next.adminName = requireValue(next.adminName, 'Your name');
      next.studioName = requireValue(next.studioName, 'Studio name');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(next.adminEmail || ''))) throw new Error('Enter a valid email address.');
      if (next.studioEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(next.studioEmail)) throw new Error('Enter a valid studio email address.');
      if (!lengths.includes(next.defaultLength)) throw new Error('Choose a valid default length.');
      if (!['Low', 'Normal', 'High', 'Urgent'].includes(next.defaultPriority)) throw new Error('Choose a valid default priority.');
      var lead = Number(next.defaultLeadDays);
      if (!Number.isInteger(lead) || lead < 1 || lead > 90) throw new Error('Default turnaround must be a whole number between 1 and 90 days.');
      next.defaultLeadDays = lead;
      if(JSON.stringify(next)===JSON.stringify(state.settings))return state.settings;
      state.settings = next;
      commit();
      return next;
    },
    setRevisionStatus: function (identifier, status) {
      var revision = get('revisions', identifier), video = get('videos', revision.videoId);
      if (!service.revisionTransitions(revision).includes(status)) throw new Error('Finish the current revision step before continuing.');
      if (status === 'In Revision') { revision.status = status; event(video, 'Work started on revision round ' + revision.round + '.'); }
      else if (status === 'Resolved') transition(video, 'Approved');
      else transition(video, status);
      commit();
    }
  };
  // A read-only projection keeps the completed Dashboard/Clients on the same records.
  Object.defineProperty(state, 'projects', { configurable: true, get: function () {
    return state.videos.map(function (video) { var request = requestFor(video); return { id: video.id, client: request.client, title: request.title, format: request.videoType, status: video.status, due: request.deadline }; });
  } });
  window.FijlyMock = service;
  // A scoped facade is the sole data boundary used by Client Portal screens.
  // Selection is local to this tab; it is deliberately not authentication.
  var selectedClient;
  try { selectedClient = sessionStorage.getItem('fijly-current-client'); } catch (_) {}
  if (!state.clients.some(function (c) { return c.id === selectedClient; })) selectedClient = state.clients.length ? state.clients[0].id : null;
  function owned(collection, identifier) {
    var record = get(collection, identifier);
    var owner = collection === 'videos' ? requestFor(record).client : collection === 'revisions' ? requestFor(get('videos', record.videoId)).client : record.client;
    if (owner !== selectedClient) throw new Error('This record is not available in your workspace.');
    return record;
  }
  service.client = {
    current: function () { return state.clients.find(function(c){return c.id===selectedClient;}) || null; },
    select: function (identifier) { get('clients', identifier); selectedClient = identifier; try { sessionStorage.setItem('fijly-current-client', identifier); } catch (_) {} window.dispatchEvent(new Event('fijly:clientchange')); notify(); },
    get: owned,
    records: function (collection) { if (!service.client.current()) return []; var requestIds = new Set(state.requests.filter(function (r) { return r.client===selectedClient; }).map(function(r){return r.id;}));var videoIds = new Set(state.videos.filter(function(v){return requestIds.has(v.requestId);}).map(function(v){return v.id;}));return state[collection].filter(function(r){return collection==='videos'?videoIds.has(r.id):collection==='revisions'?videoIds.has(r.videoId):r.client===selectedClient;}); },
    preferences: function () { return Object.assign({ autoshare: true, digest: false, review: true, defaultLength: state.settings.defaultLength || '60–90 sec', platform: 'Website' }, state.clientSettings[selectedClient] || {}); },
    createRequest: function (input, attachments) { return service.createRequest(input, selectedClient, attachments); },
    approve: function (identifier) { var video = owned('videos', identifier); if (video.status !== 'Client Review') throw new Error('This video is not awaiting your review.'); service.setVideoStatus(identifier, 'Approved'); },
    revise: function (identifier, feedback) { owned('videos', identifier); return service.requestRevision(identifier, feedback, service.client.current().contact); },
    addAsset: function (input) { var values = Object.assign({}, input, { client: selectedClient }); delete values.id; return service.saveAsset(values); },
    saveProfile: function (values) {
      if(!service.client.current())throw new Error('No client workspace is available.');
      var name = requireValue(values.name, 'Company name'), contact = requireValue(values.contact, 'Contact name'), email = requireValue(values.email, 'Email');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Enter a valid email address.');
      if (state.clients.some(function (c) { return c.id !== selectedClient && c.name.toLowerCase() === name.toLowerCase(); })) throw new Error('A company with this name already exists.');
      if (!['15–30 sec', '30–45 sec', '60–90 sec', '90–120 sec', '2–3 min', '3 min+'].includes(values.defaultLength)) throw new Error('Choose a valid default length.');
      if (!['Website', 'YouTube', 'LinkedIn', 'Instagram', 'Paid ads'].includes(values.platform)) throw new Error('Choose a valid platform.');
      Object.assign(service.client.current(), { name: name, contact: contact, email: email, website: String(values.website || '').trim() });
      state.clientSettings[selectedClient] = { autoshare: !!values.autoshare, digest: !!values.digest, review: !!values.review, defaultLength: values.defaultLength, platform: values.platform };
      commit();
    },
    reviewScript: function (identifier, status, feedback) {
      var script = owned('scripts', identifier);
      if (script.status !== 'Client Review' || !['Approved', 'Revision Requested'].includes(status)) throw new Error('This script is not awaiting review.');
      if (status === 'Revision Requested') script.feedback.push({ at: stamp(), version: script.version, author: service.client.current().contact, text: requireValue(feedback, 'Feedback') });
      script.status = status; script.updatedAt = stamp(); commit();
    }
  };
  window.FijlyAdminData = state;
})();
