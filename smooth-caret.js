/* ==========================================================================
   BIZZBOT SMOOTH CARET
   Ported from Skiper UI "skiper106" (smooth caret input). The original is a
   React component built on framer-motion springs and a dialkit control panel;
   this is the same effect on plain DOM, with the tweakable panel dropped and
   its spring values baked in.

   The native caret is hidden and a bar is drawn in its place. Where the caret
   should sit is worked out by copying the input's exact type metrics onto an
   off-screen span, filling it with the text before the cursor and measuring
   how wide that came out. The bar then springs to that offset instead of
   jumping, so moving through a field reads as one continuous movement.

   Opt in per field with data-smooth-caret. Single-line text inputs only: a
   wrapping textarea needs line-aware measurement this does not attempt.

   A drawn caret is a replica, and the platform leans on the real one for
   selection handles, autocorrect and IME candidate windows. So whenever the
   browser needs to be in charge -- a live selection, mid-composition, or
   right-to-left text this cannot measure -- the replica steps aside and the
   native caret comes back rather than both being hidden at once.
   ========================================================================== */
(function () {
  'use strict';

  var SELECTOR = 'input[data-smooth-caret]';
  var SUPPORTED_TYPES = ['text', 'email', 'tel', 'search', 'url'];

  /* framer-motion spring defaults carried over from the original's config. */
  var STIFFNESS = 500;
  var DAMPING = 30;
  var MASS = 0.5;

  /* Semi-implicit Euler stays stable at 60fps for this stiffness, but a
     dropped frame or a background tab can hand over a huge delta. */
  var MAX_SUBSTEP = 1 / 120;
  var MAX_DELTA = 1 / 20;
  var REST_DISTANCE = 0.1;
  var REST_VELOCITY = 0.5;

  var CARET_HEIGHT_RATIO = 1.15;

  /* How long the field has to sit still before the caret starts blinking. */
  var BLINK_IDLE_MS = 450;

  /* Prefix measurement assumes text advances left to right, which is wrong
     for Arabic and Hebrew -- and this is a bilingual site. */
  var RTL = /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;

  var registry = [];

  function create(input) {
    var field = document.createElement('span');
    field.className = 'sc-field';

    /* The span being measured is as wide as the text it holds, which for a
       long value is wider than the field. Sitting it inside a clipped 0x0 box
       keeps it from dragging the page into a horizontal scroll -- clipping is
       visual only, so it still measures at its full intrinsic width. */
    var probe = document.createElement('span');
    probe.className = 'sc-probe';
    probe.setAttribute('aria-hidden', 'true');

    var measure = document.createElement('span');
    measure.className = 'sc-measure';
    probe.appendChild(measure);

    var caret = document.createElement('span');
    caret.className = 'sc-caret';
    caret.setAttribute('aria-hidden', 'true');

    input.parentNode.insertBefore(field, input);
    field.appendChild(input);
    field.appendChild(probe);
    field.appendChild(caret);

    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

    var x = 0;
    var velocity = 0;
    var targetX = 0;
    var visible = false;
    var composing = false;
    var frame = null;
    var lastFrameAt = 0;
    var blinkTimer = null;

    function draw() {
      caret.style.transform = 'translate(' + x + 'px, -50%)';
    }

    function tick(now) {
      var delta = Math.min((now - lastFrameAt) / 1000, MAX_DELTA);
      lastFrameAt = now;

      var remaining = delta;
      while (remaining > 0) {
        var step = Math.min(remaining, MAX_SUBSTEP);
        remaining -= step;
        var acceleration = (-STIFFNESS * (x - targetX) - DAMPING * velocity) / MASS;
        velocity += acceleration * step;
        x += velocity * step;
      }

      if (Math.abs(targetX - x) < REST_DISTANCE && Math.abs(velocity) < REST_VELOCITY) {
        x = targetX;
        velocity = 0;
        frame = null;
        draw();
        return;
      }

      draw();
      frame = window.requestAnimationFrame(tick);
    }

    function springTo(value, snap) {
      targetX = value;

      if (snap || reduced.matches) {
        x = value;
        velocity = 0;
        if (frame) window.cancelAnimationFrame(frame);
        frame = null;
        draw();
        return;
      }

      if (frame) return;
      lastFrameAt = window.performance ? performance.now() : Date.now();
      frame = window.requestAnimationFrame(tick);
    }

    /* The replica only convinces if it is measured against the very same type
       the input is rendering, webfont and tracking included. */
    function syncMetrics(styles) {
      measure.style.fontStyle = styles.fontStyle;
      measure.style.fontWeight = styles.fontWeight;
      measure.style.fontSize = styles.fontSize;
      measure.style.fontFamily = styles.fontFamily;
      measure.style.letterSpacing = styles.letterSpacing;
      measure.style.textTransform = styles.textTransform;
      measure.style.fontFeatureSettings = styles.fontFeatureSettings;
      measure.style.fontVariationSettings = styles.fontVariationSettings;
      caret.style.height = (parseFloat(styles.fontSize) * CARET_HEIGHT_RATIO) + 'px';
    }

    function caretIndex() {
      var start = input.selectionStart == null ? 0 : input.selectionStart;
      var end = input.selectionEnd == null ? 0 : input.selectionEnd;
      if (start === end) return start;
      return input.selectionDirection === 'backward' ? start : end;
    }

    /* Visibility is a class rather than an inline opacity because the blink is
       a CSS animation on opacity, and an animation outranks an inline style --
       set opacity here and a blinking caret could not be hidden at all. */
    function hide(handBack) {
      visible = false;
      caret.classList.remove('is-on', 'is-blinking');
      if (blinkTimer) window.clearTimeout(blinkTimer);
      blinkTimer = null;
      input.style.caretColor = handBack ? '' : 'transparent';
    }

    /* A real caret holds steady while you are typing or moving through the
       field and only picks the blink back up once you pause, so the blink
       never competes with the spring for attention. */
    function armBlink() {
      caret.classList.remove('is-blinking');
      if (blinkTimer) window.clearTimeout(blinkTimer);
      blinkTimer = window.setTimeout(function () {
        caret.classList.add('is-blinking');
      }, BLINK_IDLE_MS);
    }

    function update(snap) {
      if (document.activeElement !== input) {
        hide(true);
        return;
      }

      /* Selection handles, IME candidates and RTL runs are all cases the
         browser draws better than this can, so give the field back. */
      var start = input.selectionStart == null ? 0 : input.selectionStart;
      var end = input.selectionEnd == null ? 0 : input.selectionEnd;
      if (composing || start !== end || RTL.test(input.value)) {
        hide(true);
        return;
      }

      var styles = window.getComputedStyle(input);
      syncMetrics(styles);

      var index = caretIndex();
      var prefix = input.value.slice(0, index);
      measure.textContent = prefix;

      var paddingLeft = parseFloat(styles.paddingLeft) || 0;
      var paddingRight = parseFloat(styles.paddingRight) || 0;
      var borderLeft = parseFloat(styles.borderLeftWidth) || 0;
      var width = prefix.length ? measure.getBoundingClientRect().width : 0;
      var absolute = borderLeft + paddingLeft + width;

      scrollIntoView(styles, absolute - borderLeft);

      var position = absolute - input.scrollLeft;
      var min = borderLeft + paddingLeft - 1;
      var max = input.clientWidth + borderLeft - paddingRight;

      if (position < min || position > max + 1) {
        /* Scrolled out of the visible run: nothing to draw, but the native
           caret would be out of frame too, so it stays hidden. */
        hide(false);
        return;
      }

      input.style.caretColor = 'transparent';
      caret.classList.add('is-on');
      springTo(Math.min(position, max), snap || !visible);
      armBlink();
      visible = true;
    }

    /* A long value scrolls inside the field; the caret has to drag the view
       with it exactly as the native one would. */
    function scrollIntoView(styles, offset) {
      var paddingLeft = parseFloat(styles.paddingLeft) || 0;
      var paddingRight = parseFloat(styles.paddingRight) || 0;
      var maxScroll = Math.max(0, input.scrollWidth - input.clientWidth);
      var visibleLeft = input.scrollLeft + paddingLeft;
      var visibleRight = input.scrollLeft + input.clientWidth - paddingRight;

      if (offset > visibleRight) {
        input.scrollLeft = Math.min(offset - input.clientWidth + paddingRight, maxScroll);
        return;
      }

      if (offset < visibleLeft) {
        input.scrollLeft = Math.max(0, offset - paddingLeft);
      }
    }

    function refresh() {
      update(false);
    }

    input.addEventListener('focus', function () { update(true); });
    input.addEventListener('blur', function () { hide(true); });
    input.addEventListener('input', refresh);
    input.addEventListener('keyup', refresh);
    input.addEventListener('pointerup', refresh);
    input.addEventListener('scroll', refresh);
    input.addEventListener('compositionstart', function () {
      composing = true;
      hide(true);
    });
    input.addEventListener('compositionend', function () {
      composing = false;
      update(true);
    });

    if ('ResizeObserver' in window) {
      new ResizeObserver(refresh).observe(field);
    }

    return { input: input, refresh: refresh };
  }

  function init() {
    var inputs = [].slice.call(document.querySelectorAll(SELECTOR));
    if (!inputs.length) return;

    inputs.forEach(function (input) {
      if (SUPPORTED_TYPES.indexOf(input.type) === -1) return;
      registry.push(create(input));
    });

    if (!registry.length) return;

    function refreshActive() {
      for (var i = 0; i < registry.length; i++) {
        if (registry[i].input === document.activeElement) {
          registry[i].refresh();
          return;
        }
      }
    }

    /* Covers arrow keys, click-through, drag-select and undo in one place. */
    document.addEventListener('selectionchange', function () {
      window.requestAnimationFrame(refreshActive);
    });
    window.addEventListener('resize', refreshActive);

    /* Nohemi arrives after first paint and is wider than the fallback, so
       anything measured before it lands is measured against the wrong face. */
    if (document.fonts) {
      document.fonts.ready.then(refreshActive);
      document.fonts.addEventListener('loadingdone', refreshActive);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
