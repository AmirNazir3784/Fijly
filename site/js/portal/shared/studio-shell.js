/* Shared Client / Admin navigation and responsive sidebar, extracted from Studio. */
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
  var defaultScreen = layout.dataset.defaultScreen || 'overview';
  var portalTitle = layout.dataset.portalTitle || 'FIJLY Studio';
  var main = document.querySelector('.studio-main');
  // Native return-focus targets can be replaced by a shared-state render.
  // Keep a fallback so closing a nested dialog never leaves focus in hidden UI.
  var lastFocus = document.activeElement, dialogOrigins = new WeakMap();
  document.addEventListener('focusin',function(event){var dialog=event.target.closest('dialog');if(dialog&&!dialogOrigins.has(dialog))dialogOrigins.set(dialog,lastFocus);lastFocus=event.target;},true);
  document.addEventListener('close',function(event){
    if(event.target.tagName!=='DIALOG')return;
    var origin=dialogOrigins.get(event.target);dialogOrigins.delete(event.target);
    queueMicrotask(function(){
      var dialogs=Array.from(document.querySelectorAll('dialog[open]')),top=dialogs[dialogs.length-1];
      document.body.classList.toggle('admin-dialog-open',!!top);
      var active=document.activeElement;
      if(active&&active!==document.body&&active.checkVisibility()&&(!active.closest('dialog')||active.closest('dialog').open)&&(!top||top.contains(active)))return;
      var target=top&&top.querySelector('button:not([disabled]),input:not([disabled]),[tabindex]');
      if(!target&&origin&&origin.isConnected&&origin.checkVisibility()&&!origin.closest('dialog:not([open])'))target=origin;
      if(target)target.focus();else focusScreen();
    });
  },true);

  function focusScreen() {
    var heading = document.querySelector('.screen:not([hidden]) h1');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
    }
  }

  /* 1. Sidebar navigation ------------------------------------------------ */
  function showScreen(name, updateHash) {
    document.querySelectorAll('dialog[open]').forEach(function(dialog){dialog.close();});
    var target = Array.prototype.find.call(screens, function (screen) {
      return screen.dataset.screen === name;
    });
    if (!target) {
      name = defaultScreen; target = screens[0];
      if (location.hash && location.hash !== '#studio-content') history.replaceState(null, '', '#' + name);
    }

    screens.forEach(function (screen) {
      screen.hidden = screen !== target;
    });
    document.dispatchEvent(new CustomEvent('studio:screenchange', { detail: { name: name } }));

    navLinks.forEach(function (link) {
      if (link.dataset.screen === name) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });

    var label = target.dataset.title || name;
    if (topbarTitle) topbarTitle.textContent = document.body.classList.contains('admin-body') ? 'FIJLY ADMIN' : 'FIJLY STUDIO';
    document.title = name === defaultScreen ? baseTitle : label + ' — ' + portalTitle;

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

  // Deep links: /studio#projects
  var initial = location.hash.slice(1);
  showScreen(initial || defaultScreen, false);
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
      // A profile dialog can sit above the sidebar. Its native focus trap and
      // Escape handling take precedence over the underlying navigation.
      if (document.querySelector('dialog[open]')) return;

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

})();
