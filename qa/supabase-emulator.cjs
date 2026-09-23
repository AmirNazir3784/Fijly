/* In-memory stand-in for the FIJLY Supabase REST API (PostgREST), used by QA.
   - Tables and columns are the live project's, as probed with the public key
     on 2026-09-22; unknown columns fail like PostgREST, so a query that would
     break against the real database also breaks here.
   - Seeded from fixtures/demo-seed.json (the demo records of the retired
     session mock) converted into rows, so suites see the same clients,
     requests, videos, revisions, scripts and assets.
   - RLS stand-in: admins read and write everything; a client reads and
     writes its own client's rows (directly or through their video or script)
     and its own profile, never admin_settings; anonymous callers see nothing.
   - contact_submissions (landing page briefs) and orders (order.html): anyone
     may insert, only admins may read (and update orders).
   Supports what the portals send: select with eq filters, order and limit;
   insert, update and delete with return=representation; single objects.
   Storage: the private `client-assets` bucket (upload, signed URL, download
   through the signed URL, remove) with the live bucket's size and MIME limits
   and storage RLS: admins everything; a client uploads and reads its own
   `{client_id}/` folder and cannot delete. Objects live in db.storage. */
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const COLUMNS = {
  profiles: 'id email full_name role client_id avatar_url created_at updated_at',
  clients: 'id name status contact_name contact_email website notes created_at updated_at',
  client_settings: 'id client_id default_length default_platform created_at updated_at',
  requests: 'id client_id title status priority deadline video_type platform brief reference_urls attachment_names length submitted_by created_at updated_at',
  videos: 'id client_id request_id title video_type status deadline assigned_editor completed_at created_at updated_at',
  versions: 'id video_id version_number filename notes file_url revision_id created_at',
  feedback: 'id video_id version_id author_id author_role content created_at',
  revisions: 'id video_id round_number base_version_id submitted_version_id feedback_text status created_at updated_at',
  assets: 'id client_id name category file_type file_size file_url notes uploaded_by created_at updated_at',
  scripts: 'id video_id client_id title status created_at updated_at',
  script_scenes: 'id script_id scene_order label content created_at updated_at',
  activity_log: 'id client_id video_id actor_id action details created_at',
  admin_settings: 'id admin_id studio_name studio_email default_length default_priority default_lead_days notify_new_request notify_revision notify_approval created_at updated_at',
  contact_submissions: 'id name email company project_type message plan created_at',
  orders: 'id name email company video_type duration price brief status payment_intent_id created_at updated_at'
};
Object.keys(COLUMNS).forEach(table => { COLUMNS[table] = new Set(COLUMNS[table].split(' ')); });
// Tables anyone may insert into (RLS "WITH CHECK (true)"); only admins read them.
const PUBLIC_INSERT = {
  contact_submissions: { required: ['name', 'email', 'message'], defaults: {} },
  orders: { required: ['name', 'email', 'company', 'video_type', 'duration', 'price'], defaults: { status: 'pending' },
    checks: row => !row.status || ['pending', 'paid', 'processing', 'completed', 'cancelled'].includes(row.status) }
};
const UNIQUE = { versions: ['video_id', 'version_number'], revisions: ['video_id', 'round_number'], admin_settings: ['admin_id'], client_settings: ['client_id'] };

// The demo records the portals were built against, frozen from the retired
// session mock (mock-service.js + admin-data.js) when both portals moved to
// Supabase in Part 3B.
function mockSeedState() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'demo-seed.json'), 'utf8'));
}

function createDb(users) {
  const s = mockSeedState(), now = new Date().toISOString(), db = {};
  Object.keys(COLUMNS).forEach(table => { db[table] = []; });
  db.storage = new Map(); // 'client-assets/<path>' -> { type, size, bytes, owner }
  const request = id => s.requests.find(r => r.id === id);
  s.clients.forEach(c => {
    db.clients.push({ id: c.id, name: c.name, status: c.status, contact_name: c.contact, contact_email: c.email, website: null, notes: c.notes, created_at: '2026-08-01T09:00:00Z', updated_at: '2026-08-01T09:00:00Z' });
    db.client_settings.push({ id: 'settings-' + c.id, client_id: c.id, default_length: '60–90 sec', default_platform: 'Website', created_at: now, updated_at: now });
  });
  s.requests.forEach(r => db.requests.push({ id: r.id, client_id: r.client, title: r.title, status: r.status, priority: r.priority, deadline: r.deadline, video_type: r.videoType, platform: r.platform, brief: r.instructions, reference_urls: r.references, attachment_names: r.attachments.map(a => a.name), length: r.length, submitted_by: null, created_at: r.requestedAt, updated_at: r.requestedAt }));
  s.videos.forEach(v => {
    const r = request(v.requestId), created = (v.activity[0] || {}).at || r.requestedAt;
    db.videos.push({ id: v.id, client_id: r.client, request_id: r.id, title: r.title, video_type: r.videoType, status: v.status, deadline: r.deadline, assigned_editor: r.assignedEditor || null, completed_at: v.completedAt || null, created_at: created, updated_at: created });
    v.versions.forEach(x => db.versions.push({ id: x.id, video_id: v.id, version_number: x.number, filename: x.filename, notes: x.notes, file_url: null, revision_id: x.revisionId, created_at: x.createdAt }));
    v.feedback.forEach(f => db.feedback.push({ id: f.id, video_id: v.id, version_id: v.versions.find(x => x.number === f.version).id, author_id: null, author_role: 'client', content: f.text, created_at: f.at }));
    v.activity.forEach(a => db.activity_log.push({ id: a.id, client_id: r.client, video_id: v.id, actor_id: null, action: a.text, details: null, created_at: a.at }));
  });
  s.revisions.forEach(x => {
    const v = s.videos.find(item => item.id === x.videoId), f = v.feedback.find(item => item.id === x.feedbackId);
    const versionId = n => (v.versions.find(item => item.number === n) || {}).id || null;
    db.revisions.push({ id: x.id, video_id: x.videoId, round_number: x.round, base_version_id: versionId(x.baseVersion), submitted_version_id: versionId(x.submittedVersion), feedback_text: f.text, status: x.status, created_at: x.requestedAt, updated_at: x.resolvedAt || x.requestedAt });
  });
  s.scripts.forEach(x => {
    db.scripts.push({ id: x.id, video_id: x.videoId, client_id: x.client, title: x.title, status: x.status, created_at: x.createdAt || x.updatedAt, updated_at: x.updatedAt });
    x.scenes.forEach((scene, i) => db.script_scenes.push({ id: x.id + '-scene-' + (i + 1), script_id: x.id, scene_order: i + 1, label: scene.label, content: scene.text, created_at: x.updatedAt, updated_at: x.updatedAt }));
  });
  s.assets.forEach(a => db.assets.push({ id: a.id, client_id: a.client, name: a.name, category: a.category, file_type: a.fileType, file_size: a.size, file_url: null, notes: a.notes, uploaded_by: null, created_at: a.uploadedAt, updated_at: a.uploadedAt }));
  Object.values(users).forEach(u => { if (u.profile) db.profiles.push({ id: u.id, email: u.email, avatar_url: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', ...u.profile }); });
  const st = s.settings;
  db.admin_settings.push({ id: 'admin-settings-1', admin_id: users.admin.id, studio_name: st.studioName, studio_email: st.studioEmail, default_length: st.defaultLength, default_priority: st.defaultPriority, default_lead_days: st.defaultLeadDays, notify_new_request: st.notifyNewRequest, notify_revision: st.notifyRevision, notify_approval: st.notifyApproval, created_at: now, updated_at: now });
  return db;
}

function error(status, code, message) { return { status, body: { code, message, details: null, hint: null } }; }

// Returns { status, body } for one REST call.
function handle(db, caller, method, url, headers, body) {
  const table = url.pathname.replace(/^\/rest\/v1\//, '');
  if (!COLUMNS[table]) return error(404, 'PGRST205', `Could not find the table 'public.${table}' in the schema cache`);
  const columns = COLUMNS[table], role = caller && caller.profile && caller.profile.role;
  const filters = [], params = {};
  for (const [key, value] of url.searchParams) {
    if (['select', 'order', 'limit', 'offset', 'columns', 'on_conflict'].includes(key)) { params[key] = value; continue; }
    if (!columns.has(key)) return error(400, '42703', `column ${table}.${key} does not exist`);
    const match = /^eq\.(.*)$/s.exec(value);
    if (!match) return error(400, 'QA000', 'QA emulator supports eq filters only: ' + key + '=' + value);
    filters.push([key, match[1]]);
  }
  // The client a row belongs to: directly, or through its video or script.
  const owner = row => {
    if (table === 'clients') return row.id;
    if (columns.has('client_id')) return row.client_id;
    if (columns.has('video_id')) { const video = db.videos.find(v => v.id === row.video_id); return video && video.client_id; }
    if (table === 'script_scenes') { const script = db.scripts.find(x => x.id === row.script_id); return script && script.client_id; }
    return null;
  };
  const own = row => !!(caller && caller.profile && caller.profile.client_id && owner(row) === caller.profile.client_id);
  const visible = row => {
    if (!caller) return false;
    if (role === 'admin') return true;
    if (table === 'profiles') return row.id === caller.id;
    if (table === 'admin_settings') return false;
    return own(row);
  };
  const matches = row => filters.every(([key, value]) => String(row[key]) === value);
  const single = /vnd\.pgrst\.object/.test(headers.accept || ''), represent = /return=representation/.test(headers.prefer || '') || single;
  const respond = (rows, status) => {
    const copy = JSON.parse(JSON.stringify(rows));
    if (single) return copy.length === 1 ? { status: 200, body: copy[0] } : error(406, 'PGRST116', 'JSON object requested, multiple (or no) rows returned');
    return represent || method === 'GET' ? { status: status || 200, body: copy } : { status: 204 };
  };
  const unknown = row => Object.keys(row).find(key => !columns.has(key));
  const writable = row => role === 'admin' || (table === 'profiles' ? row.id === caller.id : table !== 'admin_settings' && !PUBLIC_INSERT[table] && own(row));
  // The contact and order forms insert as anyone (signed in or not) and can't
  // read the row back; only admins read or change them.
  if (PUBLIC_INSERT[table] && method === 'POST' && !represent) {
    const input = body || {}, bad = unknown(input);
    if (bad) return error(400, 'PGRST204', `Could not find the '${bad}' column of '${table}' in the schema cache`);
    if (PUBLIC_INSERT[table].required.some(key => input[key] == null || input[key] === '')) return error(400, '23502', 'null value in column violates not-null constraint');
    if (PUBLIC_INSERT[table].checks && !PUBLIC_INSERT[table].checks(input)) return error(400, '23514', `new row for relation "${table}" violates check constraint`);
    const now = new Date().toISOString();
    db[table].push(Object.assign(Object.fromEntries([...columns].map(key => [key, null])), { id: crypto.randomUUID(), created_at: now }, columns.has('updated_at') ? { updated_at: now } : {}, PUBLIC_INSERT[table].defaults, input));
    return { status: 201 };
  }
  if (!caller) return error(401, '42501', 'permission denied for table ' + table);
  // Otherwise RLS hides these rows from non-admins: reads return nothing.

  if (method === 'GET') {
    let rows = db[table].filter(visible).filter(matches);
    if (params.order) {
      const [column, direction] = params.order.split('.');
      if (!columns.has(column)) return error(400, '42703', `column ${table}.${column} does not exist`);
      rows = rows.slice().sort((a, b) => (a[column] == null) - (b[column] == null) || String(a[column]).localeCompare(String(b[column]), undefined, { numeric: true }) * (direction === 'desc' ? -1 : 1));
    }
    if (params.limit) rows = rows.slice(0, Number(params.limit));
    return respond(rows);
  }
  if (method === 'POST') {
    const now = new Date().toISOString(), inserted = [];
    for (const input of Array.isArray(body) ? body : [body]) {
      const bad = unknown(input);
      if (bad) return error(400, 'PGRST204', `Could not find the '${bad}' column of '${table}' in the schema cache`);
      // Unset columns are null, as in Postgres without a default.
      const row = Object.assign(Object.fromEntries([...columns].map(key => [key, null])), { id: crypto.randomUUID() }, columns.has('created_at') ? { created_at: now } : {}, columns.has('updated_at') ? { updated_at: now } : {}, input);
      if (!writable(row)) return error(403, '42501', `new row violates row-level security policy for table "${table}"`);
      const keys = UNIQUE[table];
      if (keys && db[table].concat(inserted).some(other => keys.every(key => String(other[key]) === String(row[key])))) return error(409, '23505', `duplicate key value violates unique constraint "${table}_${keys.join('_')}_key"`);
      inserted.push(row);
    }
    db[table].push(...inserted);
    return respond(inserted, 201);
  }
  if (method === 'PATCH') {
    const bad = unknown(body || {});
    if (bad) return error(400, 'PGRST204', `Could not find the '${bad}' column of '${table}' in the schema cache`);
    const rows = db[table].filter(visible).filter(matches);
    if (rows.some(row => !writable(row))) return error(403, '42501', `permission denied for table ${table}`);
    const stampUpdate = columns.has('updated_at') && !('updated_at' in body) ? { updated_at: new Date().toISOString() } : {};
    rows.forEach(row => Object.assign(row, body, stampUpdate));
    return respond(rows);
  }
  if (method === 'DELETE') {
    const rows = db[table].filter(visible).filter(matches);
    if (rows.some(row => !writable(row))) return error(403, '42501', `permission denied for table ${table}`);
    db[table] = db[table].filter(row => !rows.includes(row));
    return respond(rows);
  }
  return error(405, 'QA000', 'Method not supported by the QA emulator: ' + method);
}

/* Simulated client: writes the same rows the Client portal writes (a request,
   revision feedback, an approval) straight to the test database, for suites
   that focus on the studio side. studio-client and round-b drive the real
   Client portal instead. */
const simClient = {
  submitRequest(db, values) {
    const now = new Date().toISOString(), row = Object.assign({ id: crypto.randomUUID(), status: 'Submitted', priority: 'Normal', platform: 'Website', video_type: 'Explainer', length: '60–90 sec', reference_urls: [], attachment_names: [], submitted_by: null, created_at: now, updated_at: now }, values);
    db.requests.push(row);
    return row;
  },
  requestRevision(db, videoId, text) {
    const now = new Date().toISOString(), video = db.videos.find(v => v.id === videoId);
    if (video.status !== 'Client Review') throw new Error('simClient: video is not in Client Review');
    const latest = db.versions.filter(v => v.video_id === videoId).sort((a, b) => b.version_number - a.version_number)[0];
    const rounds = db.revisions.filter(r => r.video_id === videoId);
    rounds.filter(r => r.status === 'Client Review').forEach(r => { r.status = 'Resolved'; r.updated_at = now; });
    db.feedback.push({ id: crypto.randomUUID(), video_id: videoId, version_id: latest.id, author_id: null, author_role: 'client', content: text, created_at: now });
    db.revisions.push({ id: crypto.randomUUID(), video_id: videoId, round_number: rounds.length + 1, base_version_id: latest.id, submitted_version_id: null, feedback_text: text, status: 'Revision Requested', created_at: now, updated_at: now });
    Object.assign(video, { status: 'In Revision', updated_at: now });
    db.activity_log.push({ id: crypto.randomUUID(), client_id: video.client_id, video_id: videoId, actor_id: null, action: 'Revision round ' + (rounds.length + 1) + ' requested on V' + latest.version_number + '.', details: null, created_at: now });
  },
  approve(db, videoId) {
    const now = new Date().toISOString(), video = db.videos.find(v => v.id === videoId);
    if (video.status !== 'Client Review') throw new Error('simClient: video is not in Client Review');
    db.revisions.filter(r => r.video_id === videoId && r.status !== 'Resolved').forEach(r => { r.status = 'Resolved'; r.updated_at = now; });
    Object.assign(video, { status: 'Approved', updated_at: now });
    db.activity_log.push({ id: crypto.randomUUID(), client_id: video.client_id, video_id: videoId, actor_id: null, action: 'Status changed to Approved.', details: null, created_at: now });
  }
};

/* Storage ------------------------------------------------------------------ */
const BUCKET = 'client-assets', MAX_FILE = 52428800;
const MIME = ['image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/webp', 'application/pdf', 'video/mp4', 'video/webm', 'video/quicktime', 'font/woff2', 'font/woff', 'font/ttf', 'font/otf', 'application/zip'];
const storageError = (status, message) => ({ status, body: { statusCode: String(status), error: message, message } });
// Pulls the file part (field name "") out of the SDK's multipart upload.
function filePart(buffer, contentType) {
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/.exec(contentType || '');
  if (!boundary) return { type: contentType || '', bytes: buffer };
  const marker = '--' + (boundary[1] || boundary[2]), text = buffer.toString('latin1');
  for (const part of text.split(marker)) {
    const split = part.indexOf('\r\n\r\n');
    if (split < 0 || !/name=""/.test(part.slice(0, split))) continue;
    const type = (/content-type:\s*([^\r\n]*)/i.exec(part.slice(0, split)) || [])[1] || '';
    return { type: type.trim(), bytes: Buffer.from(part.slice(split + 4).replace(/\r\n$/, ''), 'latin1') };
  }
  return { type: '', bytes: Buffer.alloc(0) };
}
// Returns { status, body, raw?, type? } for one Storage call.
function handleStorage(db, caller, method, url, headers, buffer) {
  const role = caller && caller.profile && caller.profile.role, clientId = caller && caller.profile && caller.profile.client_id;
  const rest = decodeURIComponent(url.pathname.replace(/^\/storage\/v1\/object\//, ''));
  const canRead = objectPath => role === 'admin' || (!!clientId && objectPath.split('/')[0] === clientId);
  if (method === 'GET' && rest.startsWith('sign/' + BUCKET + '/')) {
    const key = rest.slice(5), object = db.storage.get(key);
    if (url.searchParams.get('token') !== 'qa-signed' || !object) return storageError(400, 'Object not found');
    return { status: 200, raw: object.bytes, type: object.type };
  }
  if (!caller) return storageError(403, 'new row violates row-level security policy');
  if (method === 'POST' && rest.startsWith('sign/' + BUCKET + '/')) {
    const key = rest.slice(5), objectPath = key.slice(BUCKET.length + 1);
    if (!db.storage.has(key) || !canRead(objectPath)) return storageError(400, 'Object not found');
    return { status: 200, body: { signedURL: '/object/sign/' + key.split('/').map(encodeURIComponent).join('/') + '?token=qa-signed' } };
  }
  if (method === 'POST' && rest.startsWith(BUCKET + '/')) {
    const objectPath = rest.slice(BUCKET.length + 1), file = filePart(buffer || Buffer.alloc(0), headers['content-type']);
    if (!canRead(objectPath)) return storageError(403, 'new row violates row-level security policy');
    if (db.storage.has(rest)) return storageError(409, 'The resource already exists');
    if (file.bytes.length > MAX_FILE) return storageError(413, 'The object exceeded the maximum allowed size');
    if (!MIME.includes(file.type)) return storageError(415, `mime type ${file.type || 'application/octet-stream'} is not supported`);
    db.storage.set(rest, { type: file.type, size: file.bytes.length, bytes: file.bytes, owner: caller.id });
    return { status: 200, body: { Id: crypto.randomUUID(), Key: rest } };
  }
  if (method === 'DELETE' && rest === BUCKET) {
    // As in Storage, objects RLS won't let this caller delete are silently kept.
    const prefixes = (JSON.parse((buffer || '').toString() || '{}').prefixes) || [];
    const removed = role === 'admin' ? prefixes.filter(item => db.storage.delete(BUCKET + '/' + item)) : [];
    return { status: 200, body: removed.map(name => ({ name, bucket_id: BUCKET })) };
  }
  return storageError(400, 'Not supported by the QA emulator: ' + method + ' ' + url.pathname);
}

module.exports = { createDb, handle, handleStorage, COLUMNS, simClient };
