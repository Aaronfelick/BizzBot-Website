/* ==========================================================================
   BIZZBOT NAVIGATION
   Shared across every page. Handles the desktop dropdowns, the mobile
   accordion inside the hamburger menu, and marking the current page.

   Deliberately standalone: the rich pages define their own toggleMenu()
   inline and the static pages toggle #mobileMenu with an inline onclick.
   Both keep working - this script only adds the dropdown behaviour on top.
   ========================================================================== */
(function () {
  'use strict';

  var DESKTOP = '(min-width: 861px)';

  function isDesktop() {
    return window.matchMedia(DESKTOP).matches;
  }

  /* ---------- desktop dropdowns ---------- */

  var dropdowns = [].slice.call(document.querySelectorAll('.nav-dd'));

  function closeAll(except) {
    dropdowns.forEach(function (dd) {
      if (dd === except) return;
      dd.classList.remove('is-open');
      var btn = dd.querySelector('.nav-dd-btn');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    });
  }

  dropdowns.forEach(function (dd) {
    var btn = dd.querySelector('.nav-dd-btn');
    if (!btn) return;

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var open = dd.classList.contains('is-open');
      closeAll(dd);
      dd.classList.toggle('is-open', !open);
      btn.setAttribute('aria-expanded', String(!open));
    });

    /* Pointer users get hover, which feels faster. Touch devices fire a
       synthetic mouseenter on tap, so guard on the viewport instead of
       trying to sniff the input type. */
    dd.addEventListener('mouseenter', function () {
      if (!isDesktop()) return;
      closeAll(dd);
      dd.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
    });
    dd.addEventListener('mouseleave', function () {
      if (!isDesktop()) return;
      dd.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
    });

    /* Leaving the panel by keyboard should close it. */
    dd.addEventListener('focusout', function (e) {
      if (!dd.contains(e.relatedTarget)) {
        dd.classList.remove('is-open');
        btn.setAttribute('aria-expanded', 'false');
      }
    });
  });

  document.addEventListener('click', function (e) {
    if (!e.target.closest || !e.target.closest('.nav-dd')) closeAll(null);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      closeAll(null);
      var menu = document.getElementById('mobileMenu');
      if (menu) menu.classList.remove('open');
    }
  });

  /* ---------- mobile accordion ---------- */

  [].slice.call(document.querySelectorAll('.m-acc-btn')).forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      var panel = document.getElementById(btn.getAttribute('aria-controls'));
      if (!panel) return;
      var open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!open));
      panel.classList.toggle('is-open', !open);
    });
  });

  /* ---------- current page ---------- */

  var path = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  if (path === '') path = 'index.html';

  [].slice.call(document.querySelectorAll('.nav-links a[href], .mobile-menu a[href], .nav-dd-panel a[href], .m-acc-panel a[href]'))
    .forEach(function (a) {
      var href = (a.getAttribute('href') || '').toLowerCase();
      if (href === path) {
        a.classList.add('active');
        /* Light up the parent trigger too, so a page inside a dropdown
           still shows where you are. */
        var dd = a.closest('.nav-dd');
        if (dd) {
          var t = dd.querySelector('.nav-dd-btn');
          if (t) t.classList.add('active');
        }
        var acc = a.closest('.m-acc-panel');
        if (acc) {
          var ab = document.querySelector('.m-acc-btn[aria-controls="' + acc.id + '"]');
          if (ab) ab.classList.add('active');
        }
      }
    });
})();
