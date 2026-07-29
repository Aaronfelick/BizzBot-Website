/* ==========================================================================
   BIZZBOT CARD OUTLINE LIGHTING
   One card at a time lights up with a brand outline, picked at random, so a
   grid of cards feels alive without anything moving. Hovering or focusing a
   card takes over: the cycle pauses and that card stays lit.

   Previously this lived inline on a handful of pages and only ever matched
   the home page bento grid. It is shared now, so every card grid on the site
   behaves the same way.
   ========================================================================== */
(function () {
  'use strict';

  var SELECTOR = '.feature-card, .seo-feature-card, .value-card, .team-card';
  var GLOWS = ['primary', 'secondary', 'secondary-alt'];
  var INTERVAL = 950;

  function init() {
    var cards = [].slice.call(document.querySelectorAll(SELECTOR));
    if (!cards.length) return;

    /* The outline colour is fixed per card so the cycle reads as lighting,
       not as a colour change. Pages that already hand-picked a colour keep it. */
    cards.forEach(function (card, index) {
      if (!card.hasAttribute('data-glow')) {
        card.setAttribute('data-glow', GLOWS[index % GLOWS.length]);
      }
    });

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var timer = null;
    var hoveredCard = null;
    var lastIndex = -1;

    function clearLights(except) {
      cards.forEach(function (card) {
        if (card !== except) card.classList.remove('is-lit');
      });
    }

    function lightRandomCard() {
      if (hoveredCard) return;
      var index = Math.floor(Math.random() * cards.length);
      if (cards.length > 1 && index === lastIndex) index = (index + 1) % cards.length;
      lastIndex = index;
      clearLights(cards[index]);
      cards[index].classList.add('is-lit');
    }

    function start() {
      if (timer || hoveredCard) return;
      lightRandomCard();
      timer = window.setInterval(lightRandomCard, INTERVAL);
    }

    function stop() {
      if (timer) window.clearInterval(timer);
      timer = null;
    }

    function hold(card) {
      hoveredCard = card;
      stop();
      clearLights(card);
      card.classList.add('is-lit', 'is-hovered');
    }

    function release(card) {
      card.classList.remove('is-hovered', 'is-lit');
      hoveredCard = null;
      start();
    }

    cards.forEach(function (card) {
      card.addEventListener('pointerenter', function () { hold(card); });
      card.addEventListener('pointerleave', function () { release(card); });
      card.addEventListener('focusin', function () { hold(card); });
      card.addEventListener('focusout', function () { release(card); });
    });

    /* A background tab still fires the interval; pausing keeps it cheap. */
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop(); else start();
    });

    if (!document.hidden) start();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
