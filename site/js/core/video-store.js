/* FijlyVideoStore — the only place preview and final video files are stored,
   fetched or removed.

   Preview and final videos are the one kind of file we expect to move off
   Supabase (large files, bandwidth), so every call goes through this module and
   nothing else in the app touches Storage for a video. Switching provider is
   then one line in js/core/config.js: FIJLY_CONFIG.videoStorage.

   Methods (each returns a Promise):
     upload(kind, clientId, requestId, file) -> { path, fileName, size }
     getUrl(kind, path)                      -> a URL the browser can play
     remove(path)                            -> undefined

   `kind` is 'preview' or 'final'. The two are kept apart on purpose: storage
   rules let a client read its own preview files, while
   {client_id}/final/{request_id}/... unlocks only once that project's final
   payment is paid or waived. So a failing getUrl('final', …) is a normal
   "still locked" answer, not a bug — callers show the locked card instead.

   Load this before js/core/supabase-data.js; it uses the shared supabaseClient. */
(function () {
  'use strict';

  var BUCKET = 'client-assets';
  var MAX_VIDEO_SIZE = 50 * 1024 * 1024; // the bucket's own limit
  var SIGNED_URL_SECONDS = 3600;
  // Extension to the MIME type the file is stored as. Browsers leave some
  // video files untyped, and the bucket refuses anything outside its allowed
  // list, so every upload is retyped from its extension.
  var videoTypes = { mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' };
  var KINDS = ['preview', 'final'];

  function problem(message) { var error = new Error(message); error.friendly = true; return error; }
  function extensionOf(name) { var match = /\.([a-z0-9]+)$/i.exec(String(name || '')); return match ? match[1].toLowerCase() : ''; }
  function checkKind(kind) { if (!KINDS.includes(kind)) throw problem('Unknown video kind: ' + kind + '.'); }
  // Returns the problem with a picked video as a sentence, or '' when it can
  // be uploaded. Shared with the upload forms so they can warn early.
  function videoProblem(file) {
    if (!file || !String(file.name || '').trim()) return 'Please select a video file.';
    if (file.size > MAX_VIDEO_SIZE) return 'Video too large. Maximum size is 50MB.';
    if (!videoTypes[extensionOf(file.name)]) return 'Videos must be an MP4, WEBM or MOV file.';
    return '';
  }
  // A stored path, from either a bare path or a full Storage URL.
  function storagePath(value) {
    var text = String(value || '');
    if (!/^https?:/i.test(text)) return text.replace(/^\/+/, '');
    var marker = '/' + BUCKET + '/', at = text.indexOf(marker);
    return at < 0 ? '' : decodeURIComponent(text.slice(at + marker.length).split('?')[0]);
  }

  /* Supabase Storage --------------------------------------------------- */
  var signedUrls = new Map(); // path -> { url, expires }, so re-renders reuse one URL
  function client() {
    if (typeof supabaseClient === 'undefined' || !supabaseClient) throw problem('The database connection is not ready. Refresh the page.');
    return supabaseClient;
  }

  var supabaseStore = {
    // {client_id}/preview/{request_id}/{uuid}.{ext}, or .../final/...
    async upload(kind, clientId, requestId, file) {
      var wrong = videoProblem(file);
      if (wrong) throw problem(wrong);
      if (!clientId || !requestId) throw problem('This project is missing its client or project reference.');
      var extension = extensionOf(file.name), fileName = crypto.randomUUID() + '.' + extension;
      var path = clientId + '/' + kind + '/' + requestId + '/' + fileName;
      var body = new Blob([file], { type: videoTypes[extension] });
      var result = await client().storage.from(BUCKET).upload(path, body, { contentType: videoTypes[extension], upsert: false });
      if (result.error) throw result.error;
      return { path: result.data.path, fileName: file.name, size: file.size };
    },
    // A signed URL, valid for one hour. For a final video this fails while the
    // final payment is outstanding; that refusal is the caller's lock signal.
    async getUrl(kind, pathOrUrl) {
      var path = storagePath(pathOrUrl);
      if (!path) throw problem('No video file is stored for this version.');
      var cached = signedUrls.get(path);
      if (cached && cached.expires > Date.now()) return cached.url;
      var result = await client().storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
      if (result.error) throw result.error;
      signedUrls.set(path, { url: result.data.signedUrl, expires: Date.now() + (SIGNED_URL_SECONDS - 300) * 1000 });
      return result.data.signedUrl;
    },
    async remove(pathOrUrl) {
      var path = storagePath(pathOrUrl);
      if (!path) return;
      var result = await client().storage.from(BUCKET).remove([path]);
      if (result.error) throw result.error;
      signedUrls.delete(path);
    }
  };

  /* Hostinger ---------------------------------------------------------- */
  // STUB. Not implemented: set FIJLY_CONFIG.videoStorage to 'hostinger' only
  // once these three are written against the Hostinger API (upload endpoint,
  // signed or token-protected playback URL, delete). Until then every call
  // fails loudly rather than silently losing a customer's video.
  var NOT_CONFIGURED = 'Hostinger video storage is not configured yet.';
  var hostingerStore = {
    upload: function () { return Promise.reject(problem(NOT_CONFIGURED)); },
    getUrl: function () { return Promise.reject(problem(NOT_CONFIGURED)); },
    remove: function () { return Promise.reject(problem(NOT_CONFIGURED)); }
  };

  /* The selected provider ---------------------------------------------- */
  var stores = { supabase: supabaseStore, hostinger: hostingerStore };
  function provider() {
    var name = (window.FIJLY_CONFIG && window.FIJLY_CONFIG.videoStorage) || 'supabase';
    if (!stores[name]) throw problem('Unknown video storage provider: ' + name + '.');
    return { name: name, store: stores[name] };
  }

  window.FijlyVideoStore = {
    upload: function (kind, clientId, requestId, file) {
      checkKind(kind);
      return Promise.resolve().then(function () { return provider().store.upload(kind, clientId, requestId, file); });
    },
    getUrl: function (kind, path) {
      checkKind(kind);
      return Promise.resolve().then(function () { return provider().store.getUrl(kind, path); });
    },
    remove: function (path) {
      return Promise.resolve().then(function () { return provider().store.remove(path); });
    },
    // Shared with the upload forms, so a bad pick is caught before any request.
    validate: videoProblem,
    accept: Object.keys(videoTypes).map(function (extension) { return '.' + extension; }).join(','),
    maxSize: MAX_VIDEO_SIZE,
    get providerName() { return provider().name; }
  };
})();
