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
      if (mq.matches) setMenu(false);
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

  /* 4. Sticky nav state on scroll ---------------------------------------- */
  if (nav) {
    var onScroll = function () {
      nav.classList.toggle('is-scrolled', window.scrollY > 50);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* 5. Pause marquee on hover / focus ------------------------------------ */
  var marquee = document.querySelector('.marquee');
  if (marquee) {
    var pause = function () { marquee.classList.add('is-paused'); };
    var play = function () { marquee.classList.remove('is-paused'); };
    marquee.addEventListener('mouseenter', pause);
    marquee.addEventListener('mouseleave', play);
    marquee.addEventListener('focusin', pause);
    marquee.addEventListener('focusout', play);
  }
})();
