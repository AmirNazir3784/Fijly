/* FIJLY Studio — dashboard interactions (vanilla JS, no dependencies) */
(function () {
  'use strict';

  var layout = document.getElementById('studio');
  var sidebar = document.getElementById('sidebar');
  var openBtn = document.querySelector('[data-sidebar-open]');
  var topbarTitle = document.getElementById('topbar-title');
  var navLinks = document.querySelectorAll('.sidebar-link[data-screen]');
  var screens = document.querySelectorAll('.screen[data-screen]');
  var overlayQuery = window.matchMedia('(max-width: 1023px)');
  var baseTitle = document.title;
  var main = document.querySelector('.studio-main');

  function focusScreen() {
    var heading = document.querySelector('.screen:not([hidden]) h1');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
    }
  }

  /* 1. Sidebar navigation ------------------------------------------------ */
  function showScreen(name, updateHash) {
    var target = Array.prototype.find.call(screens, function (screen) {
      return screen.dataset.screen === name;
    });
    if (!target) { name = 'overview'; target = screens[0]; }

    screens.forEach(function (screen) {
      screen.hidden = screen !== target;
    });

    navLinks.forEach(function (link) {
      if (link.dataset.screen === name) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });

    var label = target.dataset.title || name;
    if (topbarTitle) topbarTitle.textContent = label;
    document.title = name === 'overview' ? baseTitle : label + ' — FIJLY Studio';

    if (updateHash && location.hash !== '#' + name) history.pushState(null, '', '#' + name);
    window.scrollTo(0, 0);
  }

  document.addEventListener('click', function (e) {
    var link = e.target.closest('.sidebar-link[data-screen], [data-screen-link]');
    if (!link) return;
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    showScreen(link.dataset.screen || link.dataset.screenLink, true);
    if (layout.classList.contains('sidebar-open')) closeSidebar(false);
    focusScreen();
  });

  // Deep links: studio.html#projects
  var initial = location.hash.slice(1);
  if (initial) showScreen(initial, false);
  window.addEventListener('hashchange', function () {
    if (location.hash === '#studio-content') return;
    showScreen(location.hash.slice(1), false);
    closeSidebar(false);
    focusScreen();
  });

  /* 2. Mobile / tablet sidebar overlay ----------------------------------- */
  function focusables() {
    return Array.prototype.filter.call(
      sidebar.querySelectorAll('a[href], button:not([disabled])'),
      function (el) { return el.offsetParent !== null; }
    );
  }

  function openSidebar() {
    if (!overlayQuery.matches) return;
    sidebar.inert = false;
    layout.classList.add('sidebar-open');
    document.body.classList.add('sidebar-is-open');
    main.inert = true;
    document.querySelector('.skip-link').inert = true;
    openBtn.setAttribute('aria-expanded', 'true');
    var current = sidebar.querySelector('[aria-current="page"]') || focusables()[0];
    if (current) current.focus();
  }

  function closeSidebar(returnFocus) {
    main.inert = false;
    document.querySelector('.skip-link').inert = false;
    layout.classList.remove('sidebar-open');
    document.body.classList.remove('sidebar-is-open');
    openBtn.setAttribute('aria-expanded', 'false');
    if (returnFocus && overlayQuery.matches) openBtn.focus();
    sidebar.inert = overlayQuery.matches;
  }

  if (layout && sidebar && openBtn) {
    openBtn.addEventListener('click', openSidebar);

    document.querySelectorAll('[data-sidebar-close]').forEach(function (el) {
      el.addEventListener('click', function () { closeSidebar(true); });
    });

    document.addEventListener('keydown', function (e) {
      if (!layout.classList.contains('sidebar-open')) return;

      if (e.key === 'Escape') {
        closeSidebar(true);
        return;
      }

      // Keep keyboard focus inside the open sidebar
      if (e.key === 'Tab') {
        var items = focusables();
        if (!items.length) return;
        var first = items[0];
        var last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });

    // Reset the overlay when resizing up to desktop
    overlayQuery.addEventListener('change', function (mq) {
      var wasInSidebar = sidebar.contains(document.activeElement);
      closeSidebar(mq.matches && wasInSidebar);
      if (!mq.matches && document.activeElement === openBtn) focusScreen();
    });
    sidebar.inert = overlayQuery.matches;
  }

  /* 3. Project filter chips ---------------------------------------------- */
  var chips = document.querySelectorAll('.filter-chip[data-filter]');
  var rows = document.querySelectorAll('.projects-table tbody tr[data-status]');
  var emptyNote = document.querySelector('[data-empty]');

  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      var filter = chip.dataset.filter;
      var visible = 0;

      chips.forEach(function (c) {
        c.setAttribute('aria-pressed', String(c === chip));
      });

      rows.forEach(function (row) {
        var show = filter === 'all' || row.dataset.status === filter;
        row.hidden = !show;
        if (show) visible++;
      });

      if (emptyNote) emptyNote.hidden = visible > 0;
    });
  });

  /* 4. Settings toggles --------------------------------------------------- */
  // Native checkboxes drive the CSS toggles; mirror state for assistive tech.
  document.querySelectorAll('.toggle-switch input[type="checkbox"]').forEach(function (input) {
    input.setAttribute('role', 'switch');
    input.setAttribute('aria-checked', String(input.checked));
    input.addEventListener('change', function () {
      input.setAttribute('aria-checked', String(input.checked));
    });
  });

  /* 5. Play / pause on the overview preview ------------------------------ */
  var preview = document.getElementById('preview');
  var playButtons = document.querySelectorAll('[data-play-toggle]');

  playButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var playing = preview.classList.toggle('is-playing');
      playButtons.forEach(function (b) {
        b.setAttribute('aria-label', playing ? 'Pause preview' : 'Play preview');
      });
    });
  });

  var fullscreenButton = document.querySelector('[data-fullscreen]');
  if (fullscreenButton) {
    if (!document.fullscreenEnabled) {
      fullscreenButton.disabled = true;
      fullscreenButton.title = 'Fullscreen is unavailable in this browser';
    } else {
      fullscreenButton.addEventListener('click', function () {
        var action = document.fullscreenElement ? document.exitFullscreen() : preview.requestFullscreen();
        action.catch(function () { fullscreenButton.title = 'Fullscreen is unavailable in this browser'; });
      });
      document.addEventListener('fullscreenchange', function () {
        fullscreenButton.setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen');
      });
    }
  }

  /* The sample form never claims to deliver a request without a backend. */
  var form = document.querySelector('[data-request-form]');
  var note = document.querySelector('[data-request-note]');
  if (form && note) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      note.hidden = false;
    });
  }
})();
