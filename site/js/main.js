/* FIJLY — site interactions (vanilla JS, no dependencies) */
(function () {
  'use strict';

  var nav = document.querySelector('.nav');
  var toggle = document.querySelector('.nav__toggle');
  var menu = document.getElementById('mobile-menu');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* 1. Mobile nav toggle ------------------------------------------------- */
  function focusables() {
    return [toggle].concat(Array.prototype.slice.call(menu.querySelectorAll('a[href], button')));
  }

  function setMenu(open) {
    nav.classList.toggle('is-open', open);
    document.body.classList.toggle('nav-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    document.querySelector('main').inert = open;
    document.querySelector('.skip-link').inert = open;
    document.querySelector('.footer').inert = open;
    document.querySelector('.nav__inner .logo').inert = open;
    document.querySelector('.nav__actions .btn').inert = open;
    if (open) {
      var first = menu.querySelector('a[href]');
      if (first) first.focus();
    }
  }

  if (nav && toggle && menu) {
    toggle.addEventListener('click', function () {
      setMenu(!nav.classList.contains('is-open'));
    });

    document.addEventListener('keydown', function (e) {
      if (!nav.classList.contains('is-open')) return;

      if (e.key === 'Escape') {
        setMenu(false);
        toggle.focus();
        return;
      }

      // Trap focus between the toggle button and the menu links
      if (e.key === 'Tab') {
        var items = focusables();
        var firstItem = items[0];
        var lastItem = items[items.length - 1];
        if (e.shiftKey && document.activeElement === firstItem) {
          e.preventDefault();
          lastItem.focus();
        } else if (!e.shiftKey && document.activeElement === lastItem) {
          e.preventDefault();
          firstItem.focus();
        }
      }
    });

    // Close the menu if the viewport grows past the mobile breakpoint
    window.matchMedia('(min-width: 768px)').addEventListener('change', function (mq) {
      if (mq.matches) {
        var moveFocus = menu.contains(document.activeElement) || document.activeElement === toggle;
        setMenu(false);
        if (moveFocus) document.querySelector('.nav__links a').focus();
      }
    });
  }

  /* 2. Smooth scroll ------------------------------------------------------ */
  // The offset for the sticky nav comes from `scroll-margin-top` in marketing.css.
  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener('click', function (e) {
      var id = link.getAttribute('href');
      if (id === '#') return;
      var target = document.querySelector(id);
      if (!target) return;

      e.preventDefault();
      if (nav && nav.classList.contains('is-open')) setMenu(false);
      target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
      history.pushState(null, '', id);
    });
  });

  /* 3. FAQ accordion (animated <details>) --------------------------------- */
  document.querySelectorAll('.faq-item').forEach(function (item) {
    var summary = item.querySelector('summary');
    var animation = null;

    summary.addEventListener('click', function (e) {
      if (reduceMotion || !item.animate) return; // native toggle
      e.preventDefault();
      if (animation) animation.cancel();

      var startHeight = item.offsetHeight;
      var opening = !item.open;
      if (opening) item.open = true;

      var style = getComputedStyle(item);
      var endHeight = opening
        ? item.offsetHeight
        : summary.offsetHeight + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) +
          parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);

      animation = item.animate(
        { height: [startHeight + 'px', endHeight + 'px'] },
        { duration: 220, easing: 'ease-out' }
      );
      animation.onfinish = function () {
        if (!opening) item.open = false;
        animation = null;
      };
    });
  });

  /* 4. Concept previews in the Work section ------------------------------ */
  // Native dialog provides modal focus containment, Escape, and focus restoration.
  var dialog = document.getElementById('concept-dialog');
  var concepts = {
    aiflow: ['AIFlow — Launch film', 'A product-led launch direction: introduce the AI assistant, show its interface, and make the support workflow easy to follow.'],
    clouddesk: ['CloudDesk — Homepage', 'A workspace story built around clarity: connect the brief, active work, and final review in one visual sequence.'],
    finly: ['Finly — Tutorial series', 'A guided onboarding direction: one task at a time, a visible next step, and a clear completion state.']
  };
  document.querySelectorAll('[data-concept]').forEach(function (button) {
    button.addEventListener('click', function () {
      var key = button.dataset.concept;
      document.getElementById('concept-title').textContent = concepts[key][0];
      document.getElementById('concept-description').textContent = concepts[key][1];
      var img = document.getElementById('concept-image');
      img.src = 'assets/concept-' + key + '.svg';
      img.alt = concepts[key][0] + ' — designed product interface concept';
      dialog.showModal();
      document.body.classList.add('concept-open');
    });
  });
  dialog.querySelector('.concept-dialog__close').addEventListener('click', function () { dialog.close(); });
  dialog.addEventListener('click', function (event) { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', function () { document.body.classList.remove('concept-open'); });
  dialog.querySelector('[data-close-concept]').addEventListener('click', function () {
    dialog.close();
    document.getElementById('contact').focus({ preventScroll: true });
  });

  /* 5. Sticky nav state on scroll ---------------------------------------- */
  if (nav) {
    var onScroll = function () {
      nav.classList.toggle('is-scrolled', window.scrollY > 50);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

})();
