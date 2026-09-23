'use strict';

// FIJLY Studio — Supabase Data Service
// The data layer of both portals: real database queries in place of the
// retired session mock.
//
// Two layers:
//   FijlyData.admin.*  thin async queries against the live schema (raw rows).
//   FijlyData itself   the surface the Admin UI already uses: `state` in the
//                      mock's shapes, the same read helpers and workflow rules,
//                      and async writes that persist, reload and notify.
//   FijlyData.client   the Client portal's view: the signed-in client's own
//                      workspace (window.FIJLY_AUTH.clientId), same shapes.
// RLS decides what each account may read or write; the client view also
// checks ownership so a stray record can never render in the wrong portal.

(function () {
  var videoStatuses = ['In Production', 'Draft Ready', 'Client Review', 'Approved', 'In Revision', 'Completed'];
  var revisionStatuses = ['Revision Requested', 'In Revision', 'Draft Ready', 'Client Review', 'Resolved'];
  var requestStatuses = ['Submitted', 'Under Review', 'In Production', 'Completed'];
  var scriptStatuses = ['Draft', 'Client Review', 'Approved', 'Revision Requested'];
  var assetCategories = ['Logo', 'Brand Guidelines', 'Fonts', 'Headshots', 'B-roll', 'Product Images', 'Reference Files', 'Other'];
  var clientStatuses = ['Active', 'Onboarding', 'Paused'];
  var priorities = ['Low', 'Normal', 'High', 'Urgent'];
  var lengths = ['15–30 sec', '30–45 sec', '60–90 sec', '90–120 sec', '2–3 min', '3 min+'];
  var statusTones = { Submitted: 'badge-info', 'Under Review': 'badge-info', 'In Production': 'badge-warning', 'Draft Ready': 'badge-info', 'Client Review': 'badge-warning', 'In Revision': 'badge-warning', Approved: 'badge-success', Completed: 'badge-success', 'Revision Requested': 'badge-warning', Resolved: 'badge-success', Draft: '' };
  var TABLE_LIMIT = 1000; // PostgREST's default page size; ample for one studio.
  var SCRIPT_FEEDBACK = 'Script revision requested'; // activity action carrying a client's script feedback
  var platforms = ['Website', 'YouTube', 'LinkedIn', 'Instagram', 'Paid ads'];

  /* Formatting (same output as the mock) --------------------------------- */
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
  function formatBytes(value) {
    if (!value) return '0 KB';
    var size = value / 1024, unit = 'KB';
    if (size >= 1024) { size /= 1024; unit = 'MB'; }
    return (size >= 10 ? Math.round(size) : Math.max(0.1, size).toFixed(1)) + ' ' + unit;
  }
  var stamp = function () { return new Date().toISOString(); };

  /* Errors ----------------------------------------------------------------- */
  // Database errors become sentences a producer can act on; the original is kept.
  function friendly(error) {
    if (error instanceof Error && error.friendly) return error;
    var code = error && error.code, text = String((error && error.message) || error || '');
    var message = code === '42501' || /row-level security|permission denied/i.test(text) ? 'You don’t have permission to make this change.'
      : code === '23505' ? 'That already exists, so it wasn’t saved again.'
      : code === '23514' || code === '22P02' || code === '23502' ? 'The database rejected one of these values. Check the fields and try again.'
      : code === '23503' ? 'A linked record is missing. Refresh the page and try again.'
      : /failed to fetch|networkerror|load failed|fetch/i.test(text) ? 'We couldn’t reach the database. Check your connection and try again.'
      : text || 'Something went wrong while saving.';
    var wrapped = new Error(message); wrapped.friendly = true; wrapped.cause = error;
    return wrapped;
  }
  function data(result) { if (result.error) throw friendly(result.error); return result.data; }
  function db() {
    if (!supabaseClient) throw friendly(new Error('The database connection is not ready. Refresh the page.'));
    return supabaseClient;
  }
  function requireValue(value, label) { if (!String(value || '').trim()) throw friendly(new Error(label + ' is required.')); return String(value).trim(); }
  function fail(message) { throw friendly(new Error(message)); }

  /* Files (Supabase Storage) ----------------------------------------------- */
  // Asset files live in the private `client-assets` bucket under
  // `{client_id}/{uuid}.{ext}`; storage RLS keys on that first folder. The
  // asset's file_url holds the storage path, read through short-lived signed URLs.
  var BUCKET = 'client-assets', MAX_FILE_SIZE = 50 * 1024 * 1024, SIGNED_URL_SECONDS = 3600;
  // Allowed extensions and the MIME type each is stored as (the bucket's list).
  var fileTypes = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', pdf: 'application/pdf',
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf', zip: 'application/zip' };
  var imageTypes = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'];
  function extensionOf(name) { var match = /\.([a-z0-9]+)$/i.exec(String(name || '')); return match ? match[1].toLowerCase() : ''; }
  // Returns the problem with a picked file as a sentence, or '' when it can be uploaded.
  function fileProblem(file) {
    if (!file || !String(file.name || '').trim()) return 'Please select a file.';
    if (file.size > MAX_FILE_SIZE) return 'File too large. Maximum size is 50MB.';
    if (!fileTypes[extensionOf(file.name)]) return 'This file type is not supported.';
    return '';
  }
  // file_url normally holds the storage path; a full Storage URL is accepted too.
  function storagePath(fileUrl) {
    var value = String(fileUrl || '');
    if (!/^https?:/i.test(value)) return value.replace(/^\/+/, '');
    var marker = '/' + BUCKET + '/', at = value.indexOf(marker);
    return at < 0 ? '' : decodeURIComponent(value.slice(at + marker.length).split('?')[0]);
  }
  var signedUrls = new Map(); // path -> { url, expires }, so re-renders reuse one URL
  var storage = {
    async uploadAssetFile(clientId, file) {
      var problem = fileProblem(file);
      if (problem) fail(problem);
      var fileExt = extensionOf(file.name), fileName = crypto.randomUUID() + '.' + fileExt, filePath = clientId + '/' + fileName;
      // The SDK sends a Blob's own type, so retype it: browsers often leave
      // fonts and some videos untyped, which the bucket would refuse.
      var body = new Blob([file], { type: fileTypes[fileExt] });
      var result = await db().storage.from(BUCKET).upload(filePath, body, { contentType: fileTypes[fileExt], upsert: false });
      if (result.error) throw friendly(result.error);
      return { path: result.data.path, fileName: fileName };
    },
    // A signed download URL, valid for one hour.
    async getAssetUrl(filePath) {
      var path = storagePath(filePath);
      if (!path) fail('This asset has no stored file.');
      var cached = signedUrls.get(path);
      if (cached && cached.expires > Date.now()) return cached.url;
      var result = await db().storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
      if (result.error) throw friendly(result.error);
      signedUrls.set(path, { url: result.data.signedUrl, expires: Date.now() + (SIGNED_URL_SECONDS - 300) * 1000 });
      return result.data.signedUrl;
    },
    async deleteAssetFile(filePath) {
      var path = storagePath(filePath);
      if (!path) return;
      var result = await db().storage.from(BUCKET).remove([path]);
      if (result.error) throw friendly(result.error);
      signedUrls.delete(path);
    }
  };

  /* ======================================================================
     Query layer: FijlyData.admin (raw rows, live column names)
     ====================================================================== */
  var admin = {
    async me() {
      var user = await getUser();
      if (!user) fail('Your session has ended. Sign in again.');
      return user;
    },
    async all(table, order) {
      return data(await db().from(table).select('*').order(order || 'created_at', { ascending: true }).limit(TABLE_LIMIT));
    },

    // --- Clients ---
    getClients() { return admin.all('clients', 'name'); },
    async getClient(id) { return data(await db().from('clients').select('*').eq('id', id).single()); },
    async createClient(values) {
      var row = data(await db().from('clients').insert(values).select().single());
      // Every client gets a settings row; the client itself is already saved.
      var settings = await db().from('client_settings').insert({ client_id: row.id });
      if (settings.error) showDataError('Client saved, but its default settings could not be created', friendly(settings.error));
      return row;
    },
    async updateClient(id, updates) { return data(await db().from('clients').update(updates).eq('id', id).select().single()); },

    // --- Requests ---
    getRequests() { return admin.all('requests'); },
    async getRequest(id) { return data(await db().from('requests').select('*').eq('id', id).single()); },
    // `match` adds conditions (for example the expected current status) so a
    // change made elsewhere in the meantime is detected instead of overwritten.
    async updateRequest(id, updates, match) {
      var rows = data(await db().from('requests').update(updates).match(Object.assign({ id: id }, match || {})).select());
      if (!rows.length) fail('This request changed elsewhere. It has been refreshed; please try again.');
      return rows[0];
    },

    // --- Videos, versions, feedback, revisions ---
    getVideos() { return admin.all('videos'); },
    async getVideo(id) { return data(await db().from('videos').select('*').eq('id', id).single()); },
    async createVideo(values) { return data(await db().from('videos').insert(values).select().single()); },
    async updateVideo(id, updates, match) {
      var rows = data(await db().from('videos').update(updates).match(Object.assign({ id: id }, match || {})).select());
      if (!rows.length) fail('This video changed elsewhere. It has been refreshed; please try again.');
      return rows[0];
    },
    getVersions() { return admin.all('versions'); },
    async addVersion(values) { return data(await db().from('versions').insert(values).select().single()); },
    // Uploads a draft video file to `videos/{client_id}/{video_id}/` (admin-only
    // under storage RLS). Not wired into the Add Version dialog yet.
    async uploadVideoFile(videoId, file) {
      var video = await admin.getVideo(videoId);
      var problem = fileProblem(file);
      if (problem) fail(problem);
      var fileExt = extensionOf(file.name), fileName = crypto.randomUUID() + '.' + fileExt;
      var filePath = 'videos/' + video.client_id + '/' + videoId + '/' + fileName;
      var result = await db().storage.from(BUCKET).upload(filePath, new Blob([file], { type: fileTypes[fileExt] }), { contentType: fileTypes[fileExt] });
      if (result.error) throw friendly(result.error);
      return { path: result.data.path };
    },
    getFeedback() { return admin.all('feedback'); },
    async addFeedback(values) { return data(await db().from('feedback').insert(values).select().single()); },
    getRevisions() { return admin.all('revisions'); },
    async createRevision(values) { return data(await db().from('revisions').insert(values).select().single()); },
    async updateRevision(id, updates) { return data(await db().from('revisions').update(updates).eq('id', id).select().single()); },

    // --- Assets ---
    getAssets() { return admin.all('assets'); },
    async getAsset(id) { return data(await db().from('assets').select('*').eq('id', id).single()); },
    uploadAssetFile: storage.uploadAssetFile,
    getAssetUrl: storage.getAssetUrl,
    deleteAssetFile: storage.deleteAssetFile,
    // With a file: uploads it first, then saves the row with its storage path.
    async createAsset(values, file) {
      if (!file) return data(await db().from('assets').insert(values).select().single());
      var stored = await storage.uploadAssetFile(values.client_id, file);
      try {
        return data(await db().from('assets').insert(Object.assign({}, values, { file_url: stored.path })).select().single());
      } catch (error) {
        // Don't leave an orphaned file. Clients may not delete, so this is best effort.
        try { await storage.deleteAssetFile(stored.path); } catch (_) { /* Keep the original error. */ }
        throw error;
      }
    },
    async updateAsset(id, updates) { return data(await db().from('assets').update(updates).eq('id', id).select().single()); },
    // Removes the stored file, then the row.
    async deleteAsset(id) {
      var row = await admin.getAsset(id);
      if (row.file_url) await storage.deleteAssetFile(row.file_url);
      data(await db().from('assets').delete().eq('id', id));
    },

    // --- Scripts ---
    getScripts() { return admin.all('scripts'); },
    async createScript(values) { return data(await db().from('scripts').insert(values).select().single()); },
    async updateScript(id, updates, match) {
      var rows = data(await db().from('scripts').update(updates).match(Object.assign({ id: id }, match || {})).select());
      if (!rows.length) fail('This script changed elsewhere. It has been refreshed; please try again.');
      return rows[0];
    },
    getScriptScenes() { return admin.all('script_scenes', 'scene_order'); },
    async createScriptScenes(rows) { return data(await db().from('script_scenes').insert(rows).select()); },
    async updateScriptScene(id, content) { return data(await db().from('script_scenes').update({ content: content }).eq('id', id).select().single()); },

    // --- Activity ---
    async getActivity() {
      return data(await db().from('activity_log').select('*').order('created_at', { ascending: false }).limit(TABLE_LIMIT));
    },
    async logActivity(clientId, videoId, action, details) {
      var user = await admin.me();
      data(await db().from('activity_log').insert({ client_id: clientId || null, video_id: videoId || null, actor_id: user.id, action: action, details: details || null }));
    },

    // --- Profiles and settings ---
    async getProfiles() { return data(await db().from('profiles').select('id, full_name, email, role, client_id, avatar_url').limit(TABLE_LIMIT)); },
    async updateProfile(id, updates) { return data(await db().from('profiles').update(updates).eq('id', id).select().single()); },
    async getSettings() {
      var user = await admin.me();
      var row = data(await db().from('admin_settings').select('*').eq('admin_id', user.id).maybeSingle());
      if (row) return row;
      // First visit: create this admin's settings row.
      return data(await db().from('admin_settings').insert({ admin_id: user.id }).select().single());
    },
    async updateSettings(updates) {
      var user = await admin.me();
      return data(await db().from('admin_settings').update(updates).eq('admin_id', user.id).select().single());
    },

    // Counts straight from the database (the Dashboard derives the same
    // figures from the shared state, so both always agree).
    async getDashboardStats() {
      var rows = await Promise.all([admin.getClients(), admin.getVideos(), admin.getRequests()]);
      var videoRequests = new Set(rows[1].map(function (v) { return v.request_id; }));
      return {
        activeClients: rows[0].filter(function (c) { return c.status === 'Active'; }).length,
        inProduction: rows[1].filter(function (v) { return v.status === 'In Production'; }).length,
        awaitingReview: rows[1].filter(function (v) { return v.status === 'Client Review'; }).length,
        pendingRequests: rows[2].filter(function (r) { return ['Submitted', 'Under Review'].includes(r.status) && !videoRequests.has(r.id); }).length
      };
    }
  };

  /* ======================================================================
     State in the mock's shapes
     ====================================================================== */
  var state = { clients: [], requests: [], videos: [], revisions: [], assets: [], scripts: [], activity: [], settings: {}, clientSettings: {} };
  var profile = null, loaded = false;
  Object.defineProperty(state, 'projects', { configurable: true, get: function () {
    return state.videos.map(function (video) { var request = requestFor(video); return { id: video.id, client: request.client, title: request.title, format: request.videoType, status: video.status, due: request.deadline }; });
  } });

  function mapState(rows) {
    var profiles = new Map(rows.profiles.map(function (p) { return [p.id, p]; }));
    var clients = rows.clients.map(function (c) {
      return { id: c.id, name: c.name || '', contact: c.contact_name || '', email: c.contact_email || '', website: c.website || '', notes: c.notes || '', status: clientStatuses.includes(c.status) ? c.status : 'Onboarding', industry: '' };
    });
    var clientById = new Map(clients.map(function (c) { return [c.id, c]; }));
    var videoRows = rows.videos, videoByRequest = new Map(videoRows.map(function (v) { return [v.request_id, v]; }));
    var requests = rows.requests.map(function (r) {
      var video = videoByRequest.get(r.id);
      return { id: r.id, client: r.client_id, title: r.title || '', platform: r.platform || '', videoType: r.video_type || '', instructions: r.brief || '', references: r.reference_urls || [],
        attachments: (r.attachment_names || []).map(function (name) { return { name: name, size: null, type: '' }; }),
        requestedAt: r.created_at || '', deadline: r.deadline || '', priority: r.priority || 'Normal', assignedEditor: (video && video.assigned_editor) || '', length: r.length || '', status: r.status };
    });
    var versionsByVideo = new Map(), versionById = new Map();
    rows.versions.forEach(function (v) {
      var version = { id: v.id, number: v.version_number, filename: v.filename || 'draft-v' + v.version_number + '.mp4', notes: v.notes || '', createdAt: v.created_at || '', revisionId: v.revision_id || null, fileUrl: v.file_url || '' };
      versionById.set(v.id, version);
      if (!versionsByVideo.has(v.video_id)) versionsByVideo.set(v.video_id, []);
      versionsByVideo.get(v.video_id).push(version);
    });
    var activityByVideo = new Map();
    rows.activity.slice().reverse().forEach(function (a) {
      if (!a.video_id) return;
      if (!activityByVideo.has(a.video_id)) activityByVideo.set(a.video_id, []);
      activityByVideo.get(a.video_id).push({ id: a.id, at: a.created_at, text: a.action + (a.details ? ' ' + a.details : '') });
    });
    var videos = videoRows.map(function (v) {
      var request = requests.find(function (r) { return r.id === v.request_id; });
      var owner = clientById.get(v.client_id) || (request && clientById.get(request.client));
      var feedback = rows.feedback.filter(function (f) { return f.video_id === v.id; }).map(function (f) {
        var author = profiles.get(f.author_id), version = versionById.get(f.version_id);
        // Feedback an admin records on the client's behalf is attributed to the client contact.
        var name = f.author_role === 'client' ? (author && author.full_name) || (owner && owner.contact) || 'Client'
          : ((owner && owner.contact) || 'Client') + ' (recorded by ' + ((author && author.full_name) || 'the studio') + ')';
        return { id: f.id, version: version ? version.number : null, at: f.created_at, author: name, text: f.content || '', role: f.author_role };
      });
      return { id: v.id, requestId: v.request_id, title: v.title, status: v.status, completedAt: v.completed_at || null,
        versions: (versionsByVideo.get(v.id) || []).sort(function (a, b) { return a.number - b.number; }),
        feedback: feedback, activity: activityByVideo.get(v.id) || [] };
    }).filter(function (v) { return requests.some(function (r) { return r.id === v.requestId; }); });
    var revisions = rows.revisions.map(function (r) {
      var video = videos.find(function (v) { return v.id === r.video_id; }), base = versionById.get(r.base_version_id), submitted = versionById.get(r.submitted_version_id);
      // The revision keeps its own feedback text; link the matching feedback entry.
      var match = video && video.feedback.find(function (f) { return f.text === r.feedback_text && (!base || f.version === base.number); });
      if (video && !match) { match = { id: 'revision-feedback-' + r.id, version: base ? base.number : null, at: r.created_at, author: 'Client', text: r.feedback_text || '' }; video.feedback.push(match); }
      return { id: r.id, videoId: r.video_id, round: r.round_number, feedbackId: match ? match.id : null, requestedAt: r.created_at, status: r.status,
        baseVersion: base ? base.number : null, submittedVersion: submitted ? submitted.number : null, resolvedAt: r.status === 'Resolved' ? r.updated_at || null : null, baseVersionId: r.base_version_id };
    }).filter(function (r) { return r.videoId && videos.some(function (v) { return v.id === r.videoId; }); })
      .sort(function (a, b) { return a.round - b.round; });
    var assets = rows.assets.map(function (a) {
      return { id: a.id, client: a.client_id, name: a.name || '', category: assetCategories.includes(a.category) ? a.category : 'Other', fileType: String(a.file_type || String(a.name || '').split('.').pop() || 'file').toLowerCase(), size: Number(a.file_size) || 0, uploadedAt: a.created_at || '', notes: a.notes || '', fileUrl: a.file_url || '' };
    });
    var scenesByScript = new Map();
    rows.scenes.forEach(function (s) {
      if (!scenesByScript.has(s.script_id)) scenesByScript.set(s.script_id, []);
      scenesByScript.get(s.script_id).push({ id: s.id, order: s.scene_order, label: s.label || 'Scene ' + s.scene_order, text: s.content || '' });
    });
    // Client script feedback has no table of its own: each request for changes
    // is an activity entry on the script's video (see client.reviewScript).
    // Round n of feedback was given on version n, and every reopened revision
    // is a new version, so the version follows from the feedback count.
    var scriptAsks = rows.activity.filter(function (a) { return a.action === SCRIPT_FEEDBACK && a.video_id; }).reverse();
    var scripts = rows.scripts.map(function (s) {
      var owner = clientById.get(s.client_id);
      var feedback = scriptAsks.filter(function (a) { return a.video_id === s.video_id; }).map(function (a, index) {
        var author = profiles.get(a.actor_id);
        return { at: a.created_at, version: index + 1, author: (author && author.full_name) || (owner && owner.contact) || 'Client', text: a.details || '' };
      });
      var status = scriptStatuses.includes(s.status) ? s.status : 'Draft';
      return { id: s.id, client: s.client_id, videoId: s.video_id, title: s.title || '', status: status, version: 1 + feedback.length - (status === 'Revision Requested' && feedback.length ? 1 : 0), createdAt: s.created_at || '', updatedAt: s.updated_at || s.created_at || '',
        scenes: (scenesByScript.get(s.id) || []).sort(function (a, b) { return a.order - b.order; }), feedback: feedback };
    });
    var clientSettings = {};
    (rows.clientSettings || []).forEach(function (cs) { clientSettings[cs.client_id] = { defaultLength: lengths.includes(cs.default_length) ? cs.default_length : '', platform: cs.default_platform || '' }; });
    var me = profiles.get(profile && profile.id) || profile || {};
    var st = rows.settings || {};
    var settings = {
      adminName: me.full_name || '', adminEmail: me.email || '', adminRole: 'Admin', adminPhone: '', adminPhoto: me.avatar_url || '',
      studioName: st.studio_name || 'FIJLY Studio', studioEmail: st.studio_email || '', studioLocation: '',
      notifyNewRequest: !!st.notify_new_request, notifyRevision: !!st.notify_revision, notifyApproval: !!st.notify_approval, notifyWeeklyDigest: false,
      defaultPriority: priorities.includes(st.default_priority) ? st.default_priority : 'Normal',
      defaultLeadDays: Number.isInteger(st.default_lead_days) ? st.default_lead_days : 10,
      defaultLength: lengths.includes(st.default_length) ? st.default_length : '60–90 sec'
    };
    return { clients: clients, requests: requests, videos: videos, revisions: revisions, assets: assets, scripts: scripts, settings: settings, clientSettings: clientSettings, me: me, settingsRow: st };
  }

  var listeners = [], loading = null, settingsRow = null, lastLoaded = 0, me = {};
  function notify(changed) {
    var keys = changed || ['clients', 'requests', 'videos', 'revisions', 'assets', 'scripts', 'settings', 'clientSettings'];
    listeners.forEach(function (listener) {
      try { listener(keys); } catch (error) { console.error('Render failed after a data update', error); }
    });
  }

  // Loads every table in parallel and swaps the state in one step.
  async function load() {
    if (loading) return loading;
    loading = (async function () {
      if (!profile) profile = await getUserProfile();
      if (!profile) fail('Your session has ended. Sign in again.');
      // RLS returns only what this account may see: everything for an admin,
      // the client's own workspace for a client. Studio settings are admin-only.
      var results = await Promise.all([admin.getClients(), admin.getRequests(), admin.getVideos(), admin.getVersions(), admin.getFeedback(), admin.getRevisions(), admin.getAssets(), admin.getScripts(), admin.getScriptScenes(), admin.getActivity(), admin.getProfiles(), profile.role === 'admin' ? admin.getSettings() : null, admin.all('client_settings')]);
      var next = mapState({ clients: results[0], requests: results[1], videos: results[2], versions: results[3], feedback: results[4], revisions: results[5], assets: results[6], scripts: results[7], scenes: results[8], activity: results[9], profiles: results[10], settings: results[11], clientSettings: results[12] });
      settingsRow = next.settingsRow; me = next.me;
      ['clients', 'requests', 'videos', 'revisions', 'assets', 'scripts', 'settings', 'clientSettings'].forEach(function (key) { state[key] = next[key]; });
      loaded = true; lastLoaded = Date.now();
      notify();
    })();
    try { await loading; } finally { loading = null; }
  }

  // Writes run one at a time, then the state reloads from the database so the
  // screen always shows what was actually stored.
  var queue = Promise.resolve();
  function mutate(work) {
    var run = queue.then(async function () {
      try { return await work(); }
      catch (error) {
        try { await load(); } catch (_) { /* Keep the original error. */ }
        throw friendly(error);
      }
    });
    queue = run.catch(function () {});
    return run.then(async function (result) {
      // The write succeeded; a failed refresh must not read as a failed save.
      try { await load(); } catch (error) { showDataError('Saved, but the screen couldn’t refresh', friendly(error)); }
      return typeof result === 'function' ? result() : result;
    });
  }

  // Refresh when the tab comes back, so work submitted elsewhere appears.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible' || !loaded || Date.now() - lastLoaded < 30000) return;
    load().catch(function (error) { showDataError('Couldn’t refresh studio data', friendly(error)); });
  });

  /* Read helpers and workflow rules (ported from the retired session mock) - */
  function get(collection, identifier) {
    var item = state[collection].find(function (record) { return record.id === identifier; });
    if (!item) fail('This record is no longer available.');
    return item;
  }
  function requestFor(video) { return get('requests', video.requestId); }
  function latest(video) { return video.versions[video.versions.length - 1]; }
  function rounds(video) { return state.revisions.filter(function (item) { return item.videoId === video.id; }); }
  function activeRevision(video) { return rounds(video).find(function (item) { return item.status !== 'Resolved'; }); }
  function pendingRequests(clientId) {
    return state.requests.filter(function (r) { return ['Submitted', 'Under Review'].includes(r.status) && (!clientId || r.client === clientId) && !state.videos.some(function (v) { return v.requestId === r.id; }); });
  }
  function videoTransitions(video) {
    var revision = activeRevision(video);
    var fresh = latest(video) && (!revision || latest(video).number > revision.baseVersion);
    return { 'In Production': latest(video) ? ['Draft Ready'] : [], 'Draft Ready': ['Client Review'], 'Client Review': ['Approved'], Approved: ['Completed'], 'In Revision': fresh ? ['Draft Ready'] : [], Completed: [] }[video.status] || [];
  }
  function revisionTransitions(revision) {
    var video = get('videos', revision.videoId);
    return { 'Revision Requested': ['In Revision'], 'In Revision': latest(video) && latest(video).number > revision.baseVersion ? ['Draft Ready'] : [], 'Draft Ready': ['Client Review'], 'Client Review': ['Resolved'], Resolved: [] }[revision.status] || [];
  }
  function adminActions() {
    var actions = [];
    function add(section, record, request, label, at) { actions.push({ section: section, id: record.id, title: request.title, client: request.client, label: label, at: at || '' }); }
    pendingRequests().forEach(function (r) { add('requests', r, r, r.status === 'Submitted' ? 'Review new request' : 'Finish request review', r.requestedAt); });
    state.revisions.filter(function (r) { return ['Revision Requested', 'In Revision', 'Draft Ready'].includes(r.status); }).forEach(function (r) {
      add('revisions', r, requestFor(get('videos', r.videoId)), r.status === 'Revision Requested' ? 'Start video revision' : r.status === 'Draft Ready' ? 'Send revised draft' : 'Continue video revision', r.requestedAt);
    });
    state.scripts.filter(function (s) { return ['Draft', 'Revision Requested'].includes(s.status); }).forEach(function (s) { add('scripts', s, s, s.status === 'Draft' ? 'Prepare script for review' : 'Revise script', s.updatedAt); });
    state.videos.filter(function (v) { return v.status === 'Approved' || (v.status === 'Draft Ready' && !activeRevision(v)); }).forEach(function (v) { add('videos', v, requestFor(v), v.status === 'Approved' ? 'Finalize approved video' : 'Send draft for review', (v.activity.slice(-1)[0] || {}).at); });
    return actions.sort(function (a, b) { return a.at.localeCompare(b.at); });
  }
  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail('Choose a valid deadline.');
    return value;
  }
  function normalize(input) {
    var references = Array.isArray(input.references) ? input.references : String(input.references || '').split(/\n/).map(function (value) { return value.trim(); }).filter(Boolean);
    references.forEach(function (value) { var url; try { url = new URL(value); } catch (_) { fail('Reference links must be complete http(s) URLs.'); } if (!['http:', 'https:'].includes(url.protocol)) fail('Only http(s) reference links are supported.'); });
    if (!priorities.includes(input.priority)) fail('Choose a valid priority.');
    return { title: requireValue(input.title, 'Video title'), platform: requireValue(input.platform, 'Platform'), videoType: requireValue(input.videoType, 'Video type'), instructions: requireValue(input.instructions, 'Instructions'), deadline: validDate(input.deadline), priority: input.priority, assignedEditor: String(input.assignedEditor || '').trim(), references: references, length: input.length || state.settings.defaultLength || '60–90 sec' };
  }
  function draftScenes(request) {
    var product = request.title.split(' / ')[0];
    return [
      ['Opening', 'Open on the moment ' + product + ' matters to the viewer.'],
      ['Problem', 'Name the everyday problem this ' + String(request.videoType || 'video').toLowerCase() + ' addresses.'],
      ['Solution', 'Introduce how ' + product + ' solves it, in one clear sentence.'],
      ['Product demo', 'Show the core workflow step by step. ' + request.instructions],
      ['CTA', 'Close with a clear next step for the viewer.']
    ];
  }
  function clientOf(video) { return requestFor(video).client; }

  // Applies a video status change and everything it implies, in dependency
  // order: the video first (guarded by its current status), then its open
  // revision, its request and the timeline.
  async function transition(video, status) {
    if (!videoTransitions(video).includes(status)) fail('This status change is not available. Add a new draft or finish the current review first.');
    var revision = activeRevision(video), newest = latest(video), updates = { status: status };
    if (status === 'Completed') updates.completed_at = stamp();
    await admin.updateVideo(video.id, updates, { status: video.status });
    if (revision) {
      if (status === 'Draft Ready') await admin.updateRevision(revision.id, { status: 'Draft Ready' });
      if (status === 'Client Review') await admin.updateRevision(revision.id, { status: 'Client Review', submitted_version_id: newest ? newest.id : null });
      if (status === 'Approved') await admin.updateRevision(revision.id, { status: 'Resolved' });
    }
    if (status === 'Completed') await admin.updateRequest(video.requestId, { status: 'Completed' });
    await admin.logActivity(clientOf(video), video.id, 'Status changed to ' + status + (newest ? ' / V' + newest.number : '') + '.');
  }

  /* ======================================================================
     FijlyData.client: the signed-in client's own workspace
     ====================================================================== */
  function clientId() { return (window.FIJLY_AUTH && window.FIJLY_AUTH.clientId) || null; }
  function ownerOf(collection, record) {
    if (collection === 'videos') return requestFor(record).client;
    if (collection === 'revisions') return requestFor(get('videos', record.videoId)).client;
    return record.client;
  }
  function owned(collection, identifier) {
    var record = get(collection, identifier);
    if (ownerOf(collection, record) !== clientId()) fail('This record is not available in your workspace.');
    return record;
  }
  function workspaceRecords(collection) {
    var id = clientId();
    if (!id) return [];
    return state[collection].filter(function (record) { try { return ownerOf(collection, record) === id; } catch (_) { return false; } });
  }
  function requireWorkspace() {
    var workspace = client.current();
    if (!workspace) fail('No client workspace is linked to this account. Contact the FIJLY team.');
    return workspace;
  }
  async function ready() { if (!loaded) await load(); }

  var client = {
    /* Reads from the loaded workspace (the surface the Client screens use). */
    current: function () { return state.clients.find(function (c) { return c.id === clientId(); }) || null; },
    records: workspaceRecords,
    get: owned,
    preferences: function () {
      var saved = state.clientSettings[clientId()] || {};
      // Only default length and platform are stored; the notification
      // switches have no columns and keep their defaults.
      return { autoshare: true, digest: false, review: true, defaultLength: saved.defaultLength || state.settings.defaultLength || '60–90 sec', platform: saved.platform || 'Website' };
    },

    /* Async queries. RLS already limits the data to this workspace. */
    getWorkspace: async function () { await ready(); return requireWorkspace(); },
    getOverviewStats: async function () {
      await ready(); requireWorkspace();
      var videos = workspaceRecords('videos'), requests = workspaceRecords('requests');
      return {
        activeProjects: videos.filter(function (v) { return v.status !== 'Completed'; }).length + pendingRequests(clientId()).length,
        pendingRequests: pendingRequests(clientId()).length,
        videosDelivered: videos.filter(function (v) { return v.status === 'Completed'; }).length,
        waitingForReview: videos.filter(function (v) { return v.status === 'Client Review'; }).length,
        revisionsInProgress: videos.filter(function (v) { return v.status === 'In Revision'; }).length,
        revisionRounds: workspaceRecords('revisions').length,
        videos: videos, requests: requests
      };
    },
    getVideos: async function () { await ready(); return workspaceRecords('videos'); },
    getVideo: async function (id) { await ready(); return owned('videos', id); },
    getRequests: async function () { await ready(); return workspaceRecords('requests'); },
    getAssets: async function () { await ready(); return workspaceRecords('assets'); },
    // Drafts stay with the studio until they are sent for review.
    getScripts: async function () { await ready(); return workspaceRecords('scripts').filter(function (x) { return x.status !== 'Draft'; }); },
    getScript: async function (id) { await ready(); return owned('scripts', id); },
    getAnalytics: async function () {
      await ready();
      var videos = workspaceRecords('videos');
      return { completed: videos.filter(function (v) { return v.status === 'Completed'; }).length, inProgress: videos.filter(function (v) { return v.status !== 'Completed'; }).length,
        awaitingReview: videos.filter(function (v) { return v.status === 'Client Review'; }).length, approved: videos.filter(function (v) { return v.status === 'Approved'; }).length,
        revisionRounds: workspaceRecords('revisions').length, videos: videos, revisions: workspaceRecords('revisions') };
    },
    getSettings: async function () { await ready(); return { workspace: requireWorkspace(), settings: client.preferences() }; },

    /* Writes. Each validates first, then persists, reloads and notifies. */
    createRequest: function (input, attachments) {
      var workspace = requireWorkspace(), values = normalize(input);
      var names = (attachments || []).map(function (file) { return String((file && file.name) || '').trim(); }).filter(Boolean);
      return mutate(async function () {
        var me = await admin.me();
        var row = data(await db().from('requests').insert({ client_id: workspace.id, submitted_by: me.id, title: values.title, platform: values.platform, video_type: values.videoType, brief: values.instructions, deadline: values.deadline, priority: values.priority, reference_urls: values.references, length: values.length, attachment_names: names, status: 'Submitted' }).select().single());
        await admin.logActivity(workspace.id, null, 'Request submitted', values.title);
        return function () { return get('requests', row.id); };
      });
    },
    approve: function (identifier) {
      var video = owned('videos', identifier);
      if (video.status !== 'Client Review') fail('This video is not awaiting your review.');
      return mutate(function () { return transition(video, 'Approved'); });
    },
    revise: function (identifier, feedback) { owned('videos', identifier); return FijlyData.requestRevision(identifier, feedback); },
    // Uploads `input.file` into this workspace's folder, then saves its details.
    addAsset: function (input) {
      var values = Object.assign({}, input, { client: requireWorkspace().id });
      delete values.id;
      return FijlyData.saveAsset(values);
    },
    // Storage RLS lets a client upload and read its own folder only. There is
    // no deleteAssetFile here: removing files is admin-only.
    uploadAssetFile: function (clientId, file) {
      if (clientId !== requireWorkspace().id) fail('Files can only be added to your own workspace.');
      return storage.uploadAssetFile(clientId, file);
    },
    getAssetUrl: storage.getAssetUrl,
    // Workspace details live on the client record; defaults on client_settings.
    saveProfile: function (values) {
      var workspace = requireWorkspace();
      var name = requireValue(values.name, 'Company name'), contact = requireValue(values.contact, 'Contact name'), email = requireValue(values.email, 'Email');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail('Enter a valid email address.');
      if (!lengths.includes(values.defaultLength)) fail('Choose a valid default length.');
      if (!platforms.includes(values.platform)) fail('Choose a valid platform.');
      var website = String(values.website || '').trim();
      if (website) { var url; try { url = new URL(website); } catch (_) { fail('Enter the website as a full address, starting with https://'); } if (!['http:', 'https:'].includes(url.protocol)) fail('Enter the website as a full address, starting with https://'); }
      return mutate(async function () {
        await admin.updateClient(workspace.id, { name: name, contact_name: contact, contact_email: email, website: website || null });
        var preferences = { default_length: values.defaultLength, default_platform: values.platform };
        if (state.clientSettings[workspace.id]) data(await db().from('client_settings').update(preferences).eq('client_id', workspace.id).select());
        else data(await db().from('client_settings').insert(Object.assign({ client_id: workspace.id }, preferences)).select());
      });
    },
    // The client approves a script or asks for changes during Client Review.
    // Feedback is kept as an activity entry on the script's video.
    reviewScript: function (identifier, status, feedback) {
      var script = owned('scripts', identifier);
      if (script.status !== 'Client Review' || !['Approved', 'Revision Requested'].includes(status)) fail('This script is not awaiting review.');
      var text = status === 'Revision Requested' ? requireValue(feedback, 'Feedback') : '';
      return mutate(async function () {
        await admin.updateScript(identifier, { status: status, updated_at: stamp() }, { status: 'Client Review' });
        if (text) await admin.logActivity(script.client, script.videoId, SCRIPT_FEEDBACK, text);
      });
    }
  };
  // The names used in the Part 3B brief, for the same operations.
  client.approveVideo = client.approve;
  client.requestRevision = client.revise;
  client.approveScript = function (identifier) { return client.reviewScript(identifier, 'Approved'); };
  client.requestScriptRevision = function (identifier, text) { return client.reviewScript(identifier, 'Revision Requested', text); };
  client.updateWorkspace = function (values) { return client.saveProfile(Object.assign({}, client.current(), client.preferences(), values)); };

  /* ======================================================================
     FijlyData: the data service both portals use
     ====================================================================== */
  var FijlyData = {
    admin: admin,
    client: client,
    state: state,
    // The signed-in person's own profile row (name, email, photo, role).
    get me() { return me; },
    // Personal profile: name and photo are saved to `profiles`.
    saveMyProfile: function (values) {
      var patch = {};
      if (values.fullName !== undefined) patch.full_name = requireValue(values.fullName, 'Your name');
      if (values.photo !== undefined) patch.avatar_url = values.photo || null;
      if (!Object.keys(patch).length) return Promise.resolve(me);
      return mutate(async function () { var user = await admin.me(); await admin.updateProfile(user.id, patch); return function () { return me; }; });
    },
    persistent: true,
    // Fields the mock offered that the live schema has no column for. The UI
    // hides these controls rather than accepting edits it cannot save.
    capabilities: { clientIndustry: false, studioLocation: false, weeklyDigest: false, adminRole: false, adminPhone: false, adminEmailEditable: false, scriptVersion: true, scriptFeedback: true, requestEditorBeforeProduction: false, attachmentSizes: false },
    videoStatuses: videoStatuses, revisionStatuses: revisionStatuses, requestStatuses: requestStatuses, scriptStatuses: scriptStatuses, assetCategories: assetCategories,
    formatDate: formatDate, formatDateTime: formatDateTime, formatBytes: formatBytes,
    statusClass: function (status) { return 'badge ' + (statusTones[status] || ''); },
    adminActions: adminActions, pendingRequests: pendingRequests,
    subscribe: function (listener) { listeners.push(listener); return function () { listeners = listeners.filter(function (entry) { return entry !== listener; }); }; },
    get: get, requestFor: requestFor, latest: latest, rounds: rounds, activeRevision: activeRevision, videoTransitions: videoTransitions, revisionTransitions: revisionTransitions,
    completedAt: function (video) { return video.completedAt || null; },
    assetsFor: function (clientId) { return state.assets.filter(function (item) { return item.client === clientId; }); },
    load: load,
    get loaded() { return loaded; },

    /* Clients ---------------------------------------------------------------- */
    saveClient: function (record) {
      var name = requireValue(record.name, 'Company name'), contact = requireValue(record.contact, 'Contact name'), email = requireValue(record.email, 'Email');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail('Enter a valid email address.');
      if (!clientStatuses.includes(record.status)) fail('Choose a valid client status.');
      if (state.clients.some(function (c) { return c.id !== record.id && c.name.toLowerCase() === name.toLowerCase(); })) fail('A client with this company name already exists.');
      var website = String(record.website || '').trim();
      if (website) { var url; try { url = new URL(website); } catch (_) { fail('Enter the website as a full address, starting with https://'); } if (!['http:', 'https:'].includes(url.protocol)) fail('Enter the website as a full address, starting with https://'); }
      var values = { name: name, contact_name: contact, contact_email: email, website: website || null, status: record.status, notes: String(record.notes || '').trim() };
      return mutate(async function () {
        var row = record.id && state.clients.some(function (c) { return c.id === record.id; }) ? await admin.updateClient(record.id, values) : await admin.createClient(values);
        return function () { return get('clients', row.id); };
      });
    },

    /* Requests --------------------------------------------------------------- */
    updateRequest: function (identifier, input, attachments) {
      var request = get('requests', identifier);
      if (request.status === 'Completed') fail('Completed requests are read-only.');
      var values = normalize(Object.assign({}, request, input));
      var video = state.videos.find(function (item) { return item.requestId === identifier; });
      if (!video && values.assignedEditor && values.assignedEditor !== request.assignedEditor) fail('Assign an editor once this request has moved into production.');
      var names = request.attachments.map(function (a) { return a.name; }).concat((attachments || []).map(function (f) { return String(f.name || '').trim(); }).filter(Boolean));
      return mutate(async function () {
        await admin.updateRequest(identifier, { title: values.title, platform: values.platform, video_type: values.videoType, brief: values.instructions, deadline: values.deadline, priority: values.priority, reference_urls: values.references, length: values.length, attachment_names: names });
        if (video) {
          await admin.updateVideo(video.id, { title: values.title, video_type: values.videoType, deadline: values.deadline, assigned_editor: values.assignedEditor || null });
          await admin.logActivity(request.client, video.id, 'Production details updated. Editor: ' + (values.assignedEditor || 'Unassigned') + '; deadline: ' + formatDate(values.deadline) + '.');
        }
      });
    },
    reviewRequest: function (identifier) {
      if (get('requests', identifier).status !== 'Submitted') fail('This request has already been reviewed.');
      return mutate(function () { return admin.updateRequest(identifier, { status: 'Under Review' }, { status: 'Submitted' }); });
    },
    // Creates the video, its draft script and scenes, then advances the request.
    // There is no database transaction, so a failure part-way removes what this
    // call created before reporting the error.
    produce: function (identifier) {
      var existing = state.videos.find(function (item) { return item.requestId === identifier; });
      if (existing) return Promise.resolve(existing);
      var request = get('requests', identifier);
      if (!['Submitted', 'Under Review'].includes(request.status)) fail('This request cannot move into production.');
      return mutate(async function () {
        var already = data(await db().from('videos').select('id').eq('request_id', identifier).limit(1));
        if (already.length) return function () { return get('videos', already[0].id); };
        var created = [];
        try {
          var video = await admin.createVideo({ client_id: request.client, request_id: identifier, title: request.title, video_type: request.videoType, status: 'In Production', deadline: request.deadline || null });
          created.push(['videos', video.id]);
          var script = await admin.createScript({ video_id: video.id, client_id: request.client, title: request.title + ' / Script', status: 'Draft' });
          created.push(['scripts', script.id]);
          var scenes = await admin.createScriptScenes(draftScenes(request).map(function (scene, index) { return { script_id: script.id, scene_order: index + 1, label: scene[0], content: scene[1] }; }));
          scenes.forEach(function (scene) { created.push(['script_scenes', scene.id]); });
          await admin.updateRequest(identifier, { status: 'In Production' }, { status: request.status });
        } catch (error) {
          for (var i = created.length - 1; i >= 0; i -= 1) await db().from(created[i][0]).delete().eq('id', created[i][1]);
          throw error;
        }
        await admin.logActivity(request.client, video.id, 'Request moved into production.');
        return function () { return get('videos', video.id); };
      });
    },

    /* Videos, versions and revisions ---------------------------------------- */
    setVideoStatus: function (identifier, status) {
      var video = get('videos', identifier);
      if (!videoTransitions(video).includes(status)) fail('This status change is not available. Add a new draft or finish the current review first.');
      return mutate(function () { return transition(video, status); });
    },
    addVersion: function (identifier, filename, notes) {
      var video = get('videos', identifier), revision = activeRevision(video);
      if (!['In Production', 'Draft Ready', 'In Revision'].includes(video.status)) fail('Versions can only be added during production or revision.');
      if (revision && revision.status === 'Revision Requested') fail('Start the revision before adding a revised version.');
      var number = video.versions.reduce(function (max, item) { return Math.max(max, item.number); }, 0) + 1;
      return mutate(async function () {
        var row = await admin.addVersion({ video_id: video.id, version_number: number, filename: String(filename || 'draft-v' + number + '.mp4'), notes: String(notes || 'Production draft.').trim(), revision_id: revision ? revision.id : null });
        await admin.logActivity(clientOf(video), video.id, 'Simulated V' + number + ' added; previous versions retained.');
        return function () { return get('videos', video.id).versions.find(function (v) { return v.id === row.id; }); };
      });
    },
    requestRevision: function (identifier, text) {
      var video = get('videos', identifier);
      if (video.status !== 'Client Review') fail('Feedback can request a revision only during Client Review.');
      text = requireValue(text, 'Client feedback');
      var previous = activeRevision(video), newest = latest(video);
      if (previous && previous.status !== 'Client Review') fail('A revision is already open.');
      if (!newest) fail('Add a version before recording feedback.');
      var round = rounds(video).length + 1;
      return mutate(async function () {
        var me = await admin.me();
        await admin.addFeedback({ video_id: video.id, version_id: newest.id, author_id: me.id, author_role: profile.role, content: text });
        if (previous) await admin.updateRevision(previous.id, { status: 'Resolved' });
        var revision = await admin.createRevision({ video_id: video.id, round_number: round, base_version_id: newest.id, feedback_text: text, status: 'Revision Requested' });
        await admin.updateVideo(video.id, { status: 'In Revision' }, { status: 'Client Review' });
        await admin.logActivity(clientOf(video), video.id, 'Revision round ' + round + ' requested on V' + newest.number + '.');
        return function () { return get('revisions', revision.id); };
      });
    },
    setRevisionStatus: function (identifier, status) {
      var revision = get('revisions', identifier), video = get('videos', revision.videoId);
      if (!revisionTransitions(revision).includes(status)) fail('Finish the current revision step before continuing.');
      return mutate(async function () {
        if (status === 'In Revision') {
          await admin.updateRevision(revision.id, { status: 'In Revision' });
          await admin.logActivity(clientOf(video), video.id, 'Work started on revision round ' + revision.round + '.');
        } else await transition(video, status === 'Resolved' ? 'Approved' : status);
      });
    },

    /* Assets ------------------------------------------------------------------ */
    // A new asset needs `input.file`: the file is uploaded to Storage and its
    // type and size are taken from it. Editing changes the details only.
    saveAsset: function (input) {
      var name = requireValue(input.name, 'File name');
      if (!assetCategories.includes(input.category)) fail('Choose a valid category.');
      get('clients', input.client);
      var notes = String(input.notes || '').trim(), file = input.file;
      if (!input.id) { var problem = fileProblem(file); if (problem) fail(problem); }
      return mutate(async function () {
        var row;
        if (input.id) {
          // A file is stored under its client's folder, so it can't move to another client.
          var current = get('assets', input.id);
          if (current.fileUrl && input.client !== current.client) fail('This file is stored with ' + get('clients', current.client).name + '. Upload it again to add it for another client.');
          row = await admin.updateAsset(input.id, { name: name, category: input.category, client_id: input.client, notes: notes });
        } else {
          var me = await admin.me();
          row = await admin.createAsset({ client_id: input.client, name: name, category: input.category, notes: notes, uploaded_by: me.id,
            file_type: extensionOf(file.name), file_size: file.size }, file);
        }
        return function () { return get('assets', row.id); };
      });
    },
    // Removes the stored file and the asset row (admin only).
    deleteAsset: function (identifier) {
      var removed = get('assets', identifier);
      return mutate(async function () { await admin.deleteAsset(identifier); return removed; });
    },
    // File rules, shared by both portals' upload forms.
    assetFileTypes: Object.keys(fileTypes),
    assetFileAccept: Object.keys(fileTypes).map(function (ext) { return '.' + ext; }).join(','),
    maxAssetFileSize: MAX_FILE_SIZE,
    validateAssetFile: fileProblem,
    isImageAsset: function (asset) { return !!(asset && asset.fileUrl && imageTypes.includes(asset.fileType)); },
    // A signed URL for an asset's stored file (valid for one hour).
    assetUrl: function (asset) { return storage.getAssetUrl(asset && asset.fileUrl); },

    /* Scripts ---------------------------------------------------------------- */
    adminReviewScript: function (identifier) {
      var script = get('scripts', identifier);
      if (script.status !== 'Revision Requested') fail('Only a script with a requested revision can be reopened.');
      return mutate(async function () {
        await admin.updateScript(identifier, { status: 'Draft', updated_at: stamp() }, { status: 'Revision Requested' });
        return function () { return get('scripts', identifier); };
      });
    },
    adminSendScriptForReview: function (identifier) {
      var script = get('scripts', identifier);
      if (script.status !== 'Draft') fail('Only a draft script can be sent for client review.');
      if (!script.scenes.length || script.scenes.some(function (scene) { return !String(scene.text || '').trim(); })) fail('Write every scene before sending the script to the client.');
      return mutate(async function () {
        await admin.updateScript(identifier, { status: 'Client Review', updated_at: stamp() }, { status: 'Draft' });
        return function () { return get('scripts', identifier); };
      });
    },
    // Scene text is editable only while the studio holds the script as a draft.
    updateScriptScenes: function (identifier, scenes) {
      var script = get('scripts', identifier);
      if (script.status !== 'Draft') fail('Only a draft script can be edited.');
      if (!Array.isArray(scenes) || scenes.length !== script.scenes.length) fail('This script changed elsewhere. Reopen it and try again.');
      var changes = script.scenes.map(function (scene, index) { var value = scenes[index]; return { id: scene.id, before: scene.text, text: String(value && typeof value === 'object' ? value.text : value || '').trim() }; })
        .filter(function (change) { return change.text !== change.before; });
      if (!changes.length) return Promise.resolve(script);
      return mutate(async function () {
        for (var i = 0; i < changes.length; i += 1) await admin.updateScriptScene(changes[i].id, changes[i].text);
        await admin.updateScript(identifier, { updated_at: stamp() });
        return function () { return get('scripts', identifier); };
      });
    },

    /* Settings: identity lives on the profile, studio preferences on admin_settings. */
    saveSettings: function (values) {
      var next = Object.assign({}, state.settings, values);
      next.adminName = requireValue(next.adminName, 'Your name');
      next.studioName = requireValue(next.studioName, 'Studio name');
      if (next.studioEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(next.studioEmail)) fail('Enter a valid studio email address.');
      if (!lengths.includes(next.defaultLength)) fail('Choose a valid default length.');
      if (!priorities.includes(next.defaultPriority)) fail('Choose a valid default priority.');
      var lead = Number(next.defaultLeadDays);
      if (!Number.isInteger(lead) || lead < 1 || lead > 90) fail('Default turnaround must be a whole number between 1 and 90 days.');
      var current = state.settings, profilePatch = {}, settingsPatch = {};
      if (next.adminName !== current.adminName) profilePatch.full_name = next.adminName;
      if ((next.adminPhoto || '') !== (current.adminPhoto || '')) profilePatch.avatar_url = next.adminPhoto || null;
      [['studioName', 'studio_name'], ['studioEmail', 'studio_email'], ['defaultLength', 'default_length'], ['defaultPriority', 'default_priority'], ['notifyNewRequest', 'notify_new_request'], ['notifyRevision', 'notify_revision'], ['notifyApproval', 'notify_approval']].forEach(function (pair) {
        if (next[pair[0]] !== current[pair[0]]) settingsPatch[pair[1]] = typeof next[pair[0]] === 'string' ? next[pair[0]] || null : next[pair[0]];
      });
      if (lead !== current.defaultLeadDays) settingsPatch.default_lead_days = lead;
      if (!Object.keys(profilePatch).length && !Object.keys(settingsPatch).length) return Promise.resolve(current);
      return mutate(async function () {
        if (Object.keys(profilePatch).length) { var me = await admin.me(); await admin.updateProfile(me.id, profilePatch); }
        if (Object.keys(settingsPatch).length) await admin.updateSettings(settingsPatch);
        return function () { return state.settings; };
      });
    }
  };

  window.FijlyData = FijlyData;
})();

// Shows a dismissible alert at the top of the current screen. It stays until
// dismissed or replaced, so there is time to read it.
function showDataError(message, error) {
  console.error(message, error && error.cause ? error.cause : error);
  var host = document.querySelector('.screen:not([hidden])') || document.querySelector('.studio-content');
  if (!host) return;
  var banner = document.querySelector('.data-error-banner') || document.createElement('div');
  banner.className = 'data-error-banner';
  banner.setAttribute('role', 'alert');
  var text = document.createElement('p');
  text.textContent = message + (error && error.message ? ': ' + error.message : '');
  var close = document.createElement('button');
  close.type = 'button'; close.className = 'data-error-banner__close'; close.textContent = 'Dismiss';
  close.addEventListener('click', function () { banner.remove(); });
  banner.replaceChildren(text, close);
  host.prepend(banner);
}
