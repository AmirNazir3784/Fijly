/* FIJLY — category video gallery (vanilla JS, no dependencies)

   Loading model
   -------------
   - The homepage cards render no players and no <img>: each card's poster is a
     CSS gradient, so opening the page costs zero media requests.
   - A category's panel is built the first time it is opened, and cached after.
   - Exactly one <video> exists at any moment. Selecting another clip pauses and
     tears down the previous element before the next one is created, so a paused
     player never keeps buffering in the background.
   - The sidebar lists only the clips you are not watching, so it holds
     clips.length - 1 items and never needs its own scrollbar.
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
  function clip(title, runtime, tone, youtube) {
  return {
    title: title, runtime: runtime, tone: tone,
    poster: youtube ? 'https://i.ytimg.com/vi/' + youtube + '/hqdefault.jpg' : '',
    src: '', youtube: youtube || ''
  };
}

  var CATEGORIES = {
  launch: {
    title: 'SaaS Launch Videos',
    desc: 'Big-moment films that turn a launch day into real demand.',
    clips: [
      clip('How to Explain a Feature-Packed App in 33 Seconds (UI Motion Showcase)', '0:33', 'violet', 'lFHUANLHmh8'),
      clip('Your SaaS Makes Sense to You. Do Buyers Get It?', '', 'indigo', 'FB8DfBNwcGE'),
      clip('Arrowster — SaaS Product Demo', '', 'plum', '8eDRSduIpSc'),
      clip('SaaS Product Demo Video by Fijly | Video TOK', '', 'grape', 'dNoROqwQl-Q')
    ]
  },
  promo: {
    title: 'Product Promo Videos',
    desc: 'Short, punchy promos engineered for paid and social.',
    clips: [
      clip('SaaS Product Demo Video by Fijly | Video TOK', '', 'amber', 'dNoROqwQl-Q'),
      clip('How to Explain a Feature-Packed App in 33 Seconds (UI Motion Showcase)', '0:33', 'sunset', 'lFHUANLHmh8'),
      clip('FIJLY Made This: From App Screens to a Fintech Promo', '', 'clay', '_9WBfa3Is4s'),
      clip('Your SaaS Makes Sense to You. Do Buyers Get It?', '', 'ember', 'FB8DfBNwcGE')
    ]
  },
  demo: {
    title: 'Product Demo Videos',
    desc: 'Guided walkthroughs that show real product workflows.',
    clips: [
      clip('Arrowster — SaaS Product Demo', '', 'teal', '8eDRSduIpSc'),
      clip('SaaS Product Demo Video by Fijly | Video TOK', '', 'jade', 'dNoROqwQl-Q'),
      clip('How to Explain a Feature-Packed App in 33 Seconds (UI Motion Showcase)', '0:33', 'sea', 'lFHUANLHmh8'),
      clip('FIJLY Made This: From App Screens to a Fintech Promo', '', 'moss', '_9WBfa3Is4s')
    ]
  },
  explainer: {
    title: 'Explainer Videos',
    desc: 'Make a complex product click in under 60 seconds.',
    clips: [
      clip('Your SaaS Makes Sense to You. Do Buyers Get It?', '', 'azure', 'FB8DfBNwcGE'),
      clip('FIJLY Made This: From App Screens to a Fintech Promo', '', 'sky', '_9WBfa3Is4s'),
      clip('Arrowster — SaaS Product Demo', '', 'cobalt', '8eDRSduIpSc'),
      clip('How to Explain a Feature-Packed App in 33 Seconds (UI Motion Showcase)', '0:33', 'steel', 'lFHUANLHmh8')
    ]
  },
  tutorial: {
    title: 'Tutorial Videos',
    desc: 'Reduce support load with clear, on-brand how-tos.',
    clips: [
      clip('FIJLY Made This: From App Screens to a Fintech Promo', '', 'rose', '_9WBfa3Is4s'),
      clip('Your SaaS Makes Sense to You. Do Buyers Get It?', '', 'blush', 'FB8DfBNwcGE'),
      clip('SaaS Product Demo Video by Fijly | Video TOK', '', 'mauve', 'dNoROqwQl-Q'),
      clip('Arrowster — SaaS Product Demo', '', 'orchid', '8eDRSduIpSc')
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
  var panels = {};          // key -> { buttons: [] }, built once per category
  var current = null;       // { key, index }
  var player = document.getElementById('vgal-player');
  var rail = document.getElementById('vgal-rail');
  var elTitle = document.getElementById('vgal-title');
  var elDesc = document.getElementById('vgal-desc');
  var elEyebrow = document.getElementById('vgal-eyebrow');
  var elNow = document.getElementById('vgal-now');
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

  if (item.youtube) {
    var frame = document.createElement('iframe');
    frame.className = 'vgal__video';
    frame.src = 'https://www.youtube-nocookie.com/embed/' + item.youtube + '?rel=0';
    frame.title = item.title;
    frame.allow = 'accelerometer; autoplay; encrypted-media; picture-in-picture; web-share';
    frame.allowFullscreen = true;
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    player.appendChild(frame);
    return;
  }

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
    // Deliberately not autoplayed: the viewer presses play on the new clip.
    player.appendChild(video);
  }

  /* ---- rail ----------------------------------------------------------- */
  /* The sidebar lists the clips you are NOT watching, so the active one is
     identified under the player instead of inside the list. Exactly
     clips.length - 1 items are shown, which is what keeps the rail free of an
     internal scrollbar at every supported height. */
  function select(key, index) {
    var cat = CATEGORIES[key];
    var item = cat.clips[index];
    current = { key: key, index: index };

    buildPlayer(item);
    elNow.textContent = item.title;

    // The cached buttons keep their listeners, so re-appending the subset is
    // enough; the active clip's button is simply left out of the DOM.
    var others = panels[key].buttons.filter(function (btn, i) { return i !== index; });
    rail.replaceChildren.apply(rail, others);
  }

  function buildRail(key) {
    var cat = CATEGORIES[key];
    var buttons = [];

    cat.clips.forEach(function (item, i) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'vgal__thumb';
      btn.setAttribute('aria-label', 'Play ' + item.title + ', ' + item.runtime);

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
      var cue = document.createElement('span');
      cue.className = 'vgal__cue';
      cue.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m9 6 9 6-9 6V6Z"/></svg>';
      shot.appendChild(cue);

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
      btn.addEventListener('click', function () { select(key, i); });
      buttons.push(btn);
    });

    panels[key] = { buttons: buttons };
  }

  /* ---- open / close --------------------------------------------------- */
  function open(key, trigger) {
    var cat = CATEGORIES[key];
    if (!cat) return;

    elEyebrow.textContent = cat.clips.length + ' VIDEOS';
    elTitle.textContent = cat.title;
    elDesc.textContent = cat.desc;

    if (!panels[key]) buildRail(key);

    lastTrigger = trigger || null;
    dialog.showModal();
    document.body.classList.add('vgal-open');
    select(key, 0);
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
