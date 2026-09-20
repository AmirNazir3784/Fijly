/* FIJLY — category video gallery (vanilla JS, no dependencies)

   Loading model
   -------------
   - The homepage cards render no players and no <img>: each card's poster is a
     CSS gradient, so opening the page costs zero media requests.
   - A category's panel is built the first time it is opened, and cached after.
   - Exactly one <video> exists at any moment. Selecting another clip pauses and
     tears down the previous element before the next one is created, so a paused
     player never keeps buffering in the background.
   - Rail thumbnails use real <img loading="lazy"> only when a poster path is
     supplied; otherwise they fall back to the same CSS placeholder.

   Adding real footage
   -------------------
   Fill in `src` (and optionally `poster`) on the entries below. Nothing else
   needs to change — the player, the rail and the lazy-loading all key off them.
   With `src` empty the item renders as a clearly labelled placeholder rather
   than pretending to be a playable film. */
(function () {
  'use strict';

  var dialog = document.getElementById('video-gallery');
  if (!dialog) return;

  var triggers = document.querySelectorAll('[data-gallery]');
  if (!triggers.length) return;

  /* ---- data ----------------------------------------------------------- */
  function clip(title, runtime, tone) {
    return { title: title, runtime: runtime, tone: tone, poster: '', src: '' };
  }

  var CATEGORIES = {
    launch: {
      title: 'SaaS Launch Videos',
      desc: 'Big-moment films that turn a launch day into real demand.',
      clips: [
        clip('AIFlow — Launch film', '1:10', 'violet'),
        clip('Northbeam — Series A announce', '0:52', 'indigo'),
        clip('Layerbase — Product reveal', '1:24', 'plum'),
        clip('TaskPilot — Feature drop', '0:45', 'grape')
      ]
    },
    promo: {
      title: 'Product Promo Videos',
      desc: 'Short, punchy promos engineered for paid and social.',
      clips: [
        clip('CloudDesk — Paid social cut', '0:30', 'amber'),
        clip('Finly — 15s pre-roll', '0:15', 'sunset'),
        clip('AIFlow — LinkedIn promo', '0:28', 'clay'),
        clip('Northbeam — Retargeting set', '0:20', 'ember')
      ]
    },
    demo: {
      title: 'Product Demo Videos',
      desc: 'Guided walkthroughs that show real product workflows.',
      clips: [
        clip('TaskPilot — Full product tour', '2:40', 'teal'),
        clip('CloudDesk — Admin walkthrough', '1:55', 'jade'),
        clip('Finly — Reporting deep dive', '2:10', 'sea'),
        clip('Layerbase — Integrations demo', '1:32', 'moss')
      ]
    },
    explainer: {
      title: 'Explainer Videos',
      desc: 'Make a complex product click in under 60 seconds.',
      clips: [
        clip('Northbeam — How attribution works', '0:58', 'azure'),
        clip('AIFlow — What is agentic support?', '0:46', 'sky'),
        clip('Finly — Cash flow, explained', '1:02', 'cobalt'),
        clip('Layerbase — Data model in 60s', '0:59', 'steel')
      ]
    },
    tutorial: {
      title: 'Tutorial Videos',
      desc: 'Reduce support load with clear, on-brand how-tos.',
      clips: [
        clip('Finly — Connect your bank', '1:18', 'rose'),
        clip('CloudDesk — Invite your team', '0:54', 'blush'),
        clip('TaskPilot — Build a workflow', '1:46', 'mauve'),
        clip('AIFlow — Train your assistant', '2:04', 'orchid')
      ]
    },
    homepage: {
      title: 'Homepage Videos',
      desc: 'The hero video that earns the signup above the fold.',
      clips: [
        clip('CloudDesk — Hero explainer', '1:05', 'violet'),
        clip('Layerbase — Above the fold', '0:48', 'plum'),
        clip('Northbeam — Homepage loop', '0:22', 'indigo'),
        clip('TaskPilot — Hero cut', '0:57', 'grape')
      ]
    }
  };

  /* ---- state ---------------------------------------------------------- */
  var panels = {};          // key -> { rail: DocumentFragment cache, buttons: [] }
  var current = null;       // { key, index }
  var player = document.getElementById('vgal-player');
  var rail = document.getElementById('vgal-rail');
  var elTitle = document.getElementById('vgal-title');
  var elDesc = document.getElementById('vgal-desc');
  var elEyebrow = document.getElementById('vgal-eyebrow');
  var elNow = document.getElementById('vgal-now');
  var elRuntime = document.getElementById('vgal-runtime');
  var lastTrigger = null;

  /* ---- player --------------------------------------------------------- */
  function teardownPlayer() {
    var video = player.querySelector('video');
    if (video) {
      video.pause();
      // Detach the source and force a reload so buffering stops immediately;
      // simply removing the node can leave the request in flight.
      video.removeAttribute('src');
      while (video.firstChild) video.removeChild(video.firstChild);
      video.load();
    }
    player.replaceChildren();
  }

  function buildPlayer(item) {
    teardownPlayer();

    if (!item.src) {
      var placeholder = document.createElement('div');
      placeholder.className = 'vgal__poster vgal__poster--' + item.tone;
      var play = document.createElement('button');
      play.type = 'button';
      play.className = 'vgal__playbtn';
      play.setAttribute('aria-label', 'Play ' + item.title);
      play.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m9 6 9 6-9 6V6Z"/></svg>';
      // No footage is wired up yet, so the control says so instead of failing.
      play.disabled = true;
      play.title = 'Film not published yet';
      var note = document.createElement('p');
      note.className = 'vgal__pending';
      note.textContent = 'Film not published yet';
      placeholder.append(play, note);
      player.appendChild(placeholder);
      return;
    }

    var video = document.createElement('video');
    video.className = 'vgal__video';
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';
    if (item.poster) video.poster = item.poster;
    video.src = item.src;
    player.appendChild(video);
    var playing = video.play();
    if (playing && playing.catch) playing.catch(function () { /* autoplay blocked */ });
  }

  /* ---- rail ----------------------------------------------------------- */
  function select(key, index, focusRail) {
    var cat = CATEGORIES[key];
    var item = cat.clips[index];
    current = { key: key, index: index };

    buildPlayer(item);
    elNow.textContent = item.title;
    elRuntime.textContent = item.src ? item.runtime : item.runtime + ' · preview pending';

    panels[key].buttons.forEach(function (btn, i) {
      var on = i === index;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', String(on));
      btn.tabIndex = on ? 0 : -1;
    });
    if (focusRail) panels[key].buttons[index].focus();
  }

  function buildRail(key) {
    var cat = CATEGORIES[key];
    var buttons = [];

    cat.clips.forEach(function (item, i) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'vgal__thumb';
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', 'false');
      btn.tabIndex = -1;

      var shot = document.createElement('span');
      shot.className = 'vgal__shot vgal__shot--' + item.tone;
      if (item.poster) {
        var img = document.createElement('img');
        img.src = item.poster;
        img.alt = '';
        img.loading = 'lazy';
        img.decoding = 'async';
        img.width = 320;
        img.height = 180;
        shot.appendChild(img);
      }
      var flag = document.createElement('span');
      flag.className = 'vgal__flag';
      flag.textContent = 'NOW PLAYING';
      shot.appendChild(flag);

      var meta = document.createElement('span');
      meta.className = 'vgal__thumb-meta';
      var t = document.createElement('span');
      t.className = 'vgal__thumb-title';
      t.textContent = item.title;
      var r = document.createElement('span');
      r.className = 'vgal__thumb-runtime';
      r.textContent = item.runtime;
      meta.append(t, r);

      btn.append(shot, meta);
      btn.addEventListener('click', function () { select(key, i, false); });
      buttons.push(btn);
    });

    panels[key] = { buttons: buttons };
  }

  /* Roving focus across the rail, as expected for a tablist. */
  rail.addEventListener('keydown', function (e) {
    if (!current) return;
    var n = CATEGORIES[current.key].clips.length;
    var i = current.index;
    var next = null;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = (i + 1) % n;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = (i - 1 + n) % n;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    if (next === null) return;
    e.preventDefault();
    select(current.key, next, true);
  });

  /* ---- open / close --------------------------------------------------- */
  function open(key, trigger) {
    var cat = CATEGORIES[key];
    if (!cat) return;

    elEyebrow.textContent = cat.clips.length + ' VIDEOS';
    elTitle.textContent = cat.title;
    elDesc.textContent = cat.desc;

    if (!panels[key]) buildRail(key);
    // The cached buttons keep their listeners; only one category is shown at a
    // time, so moving the same nodes back into the rail is enough.
    rail.replaceChildren.apply(rail, panels[key].buttons);

    lastTrigger = trigger || null;
    dialog.showModal();
    document.body.classList.add('vgal-open');
    select(key, 0, false);
  }

  triggers.forEach(function (btn) {
    btn.addEventListener('click', function () { open(btn.dataset.gallery, btn); });
  });

  dialog.querySelector('[data-vgal-close]').addEventListener('click', function () { dialog.close(); });
  // Click on the backdrop (the dialog element itself) closes.
  dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener('close', function () {
    teardownPlayer();
    document.body.classList.remove('vgal-open');
    current = null;
    if (lastTrigger) lastTrigger.focus();
  });
  // Never leave a clip playing in a hidden tab.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) return;
    var v = player.querySelector('video');
    if (v) v.pause();
  });
})();
