/* ==========================================================================
   BIZZBOT HERO TEXT ROLL
   Ported from Skiper UI "skiper58" (text roll navigation). The original is a
   React + framer-motion component; the site has no build step, so this is the
   same effect rebuilt on plain DOM and CSS transitions.

   Every headline line is stacked twice. On trigger the top copy rolls up out
   of the line box while the second copy rolls into its place, one character
   at a time. Both copies hold identical text, so a roll always ends looking
   exactly as it started -- that is what lets it replay forever from a single
   pair of layers, with no crossfade or text swap.

   Each line owns its roll. Hovering or tapping one line rolls that line and
   nothing else, and the headline also cycles by itself: after a pause the
   first line rolls, each following line waits for the one above it to land,
   and once the last has finished the pause starts again. The cascade is
   sequenced here rather than by staggered CSS delays, because "start when
   the line above has finished" depends on how many characters that line
   happens to have.

   The cycle stops whenever nobody can see it -- hero scrolled away, or tab
   in the background -- so it is not animating against a phone battery for a
   headline that is off screen.
   ========================================================================== */
(function () {
  'use strict';

  var TITLE = '.intro-title';

  /* Kept in step with the timings in style.css. A line is done when its last
     character has finished travelling, so its length sets its duration. */
  var DURATION_MS = 500;
  var STAGGER_MS = 30;
  var RESET_BUFFER_MS = 40;

  /* Gap between one full pass down the headline and the next. */
  var PAUSE_MS = 3000;

  /* The lines already fade up on load (introLineIn). Rolling on top of that
     reads as two animations fighting, so the cycle waits for it. */
  var ENTRANCE_MS = 1200;
  var SETTLE_MS = 300;
  var PRELOADER_BAILOUT_MS = 4000;

  function splitInto(source, target, counter) {
    var children = source.childNodes;

    for (var i = 0; i < children.length; i++) {
      var node = children[i];

      if (node.nodeType === 3) {
        var text = node.nodeValue;

        for (var c = 0; c < text.length; c++) {
          var char = document.createElement('span');
          char.className = 'tr-char';
          /* An inline-block holding a plain space collapses to zero width and
             the headline loses its word gaps, so spaces travel as no-break. */
          char.textContent = text[c] === ' ' ? '\u00A0' : text[c];
          char.style.setProperty('--tr-i', counter.i++);
          target.appendChild(char);
        }
        continue;
      }

      if (node.nodeType === 1) {
        /* <em>, .accent-dot and friends carry the headline's colour and
           stroke treatment, so the wrapper is kept and split inside. */
        var clone = node.cloneNode(false);
        splitInto(node, clone, counter);
        target.appendChild(clone);
      }
    }
  }

  function buildLayer(line, className, counter) {
    var layer = document.createElement('span');
    layer.className = className;
    layer.setAttribute('aria-hidden', 'true');
    splitInto(line, layer, counter);
    return layer;
  }

  /* Width of a line as the browser would set it normally -- kern pairs and all
     -- measured off a hidden copy so wrapping cannot skew the result. Cloning
     rather than building a bare span keeps the line's own class, and with it
     any tracking or stroke that applies to it. */
  function measureNatural(line) {
    var probe = line.cloneNode(true);
    probe.className = line.className;
    probe.style.cssText =
      'position:absolute;top:0;left:0;width:auto;white-space:pre;' +
      'visibility:hidden;animation:none;transform:none;opacity:0';
    line.parentNode.appendChild(probe);

    var range = document.createRange();
    range.selectNodeContents(probe);
    var width = range.getBoundingClientRect().width;

    probe.parentNode.removeChild(probe);
    return width;
  }

  /* Splitting a line into one box per character costs it every kern pair,
     which leaves the headline a shade wider than it was designed to be. The
     shortfall is not uniform -- it depends entirely on which pairs the line
     happens to contain -- so a single hand-picked tracking value would fix
     the worst line and over-tighten the rest.

     Instead each line is measured before and after splitting and given back
     exactly what it lost, spread across its own characters. Expressed in em
     it holds at any font size, so the fluid hero sizing still works. */
  function compensateKerning(line, chars, naturalWidth) {
    if (!naturalWidth || !chars.length) return;

    var styles = window.getComputedStyle(line);
    var fontSize = parseFloat(styles.fontSize);
    var tracking = parseFloat(styles.letterSpacing) || 0;
    if (!fontSize) return;

    var splitWidth = 0;
    for (var i = 0; i < chars.length; i++) {
      splitWidth += chars[i].getBoundingClientRect().width;
    }
    if (!splitWidth) return;

    /* Each character carries one tracking gap, so spreading the difference
       over the character count lands the line back on its original width. */
    var perChar = (naturalWidth - splitWidth) / chars.length;
    line.style.letterSpacing = ((tracking + perChar) / fontSize).toFixed(5) + 'em';
  }

  /* One line, responsible for its own roll. Anything that wants to roll it
     hands over a callback and is told when the line is idle again, which is
     what lets the cascade wait on a line the visitor happens to be hovering
     instead of rolling it a second time on top. */
  function createLine(el, charCount) {
    var duration = DURATION_MS +
      Math.max(0, charCount - 1) * STAGGER_MS + RESET_BUFFER_MS;

    var busy = false;
    var waiting = [];

    function settle() {
      /* Dropping the class would roll the line back down, which reads as a
         rewind. Freezing transitions first snaps the layers back to their
         start instead -- invisible, because both copies are identical -- so
         the next roll travels upward again. */
      el.classList.add('tr-instant');
      el.classList.remove('is-rolling');
      void el.offsetWidth;
      el.classList.remove('tr-instant');

      busy = false;

      var queued = waiting.slice();
      waiting.length = 0;
      for (var i = 0; i < queued.length; i++) queued[i]();
    }

    function roll(done) {
      if (busy) {
        /* Already rolling for some other reason. Let that finish and count
           it, rather than stacking a second roll on the same line. */
        if (done) waiting.push(done);
        return;
      }

      busy = true;
      el.classList.add('is-rolling');

      window.setTimeout(function () {
        settle();
        if (done) done();
      }, duration);
    }

    return { el: el, roll: roll };
  }

  function init() {
    var title = document.querySelector(TITLE);
    if (!title) return;

    /* Nothing here is essential to reading the headline, so a visitor who
       asked for less motion keeps the original markup untouched -- and no
       cycle running behind it. */
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var source = [].slice.call(title.children).filter(function (node) {
      return node.tagName === 'SPAN';
    });
    if (!source.length) return;

    var lines = source.map(function (el) {
      /* Has to happen while the line still holds its original text. */
      var naturalWidth = measureNatural(el);

      var counter = { i: 0 };
      var out = buildLayer(el, 'tr-layer tr-layer-out', counter);
      /* Both layers are split from the same source, so the counter restarts
         and the two copies of a character share one delay. */
      var incoming = buildLayer(el, 'tr-layer tr-layer-in', { i: 0 });

      el.textContent = '';
      el.className = el.className ? el.className + ' tr-line' : 'tr-line';
      el.appendChild(out);
      el.appendChild(incoming);

      var chars = out.querySelectorAll('.tr-char');
      compensateKerning(el, chars, naturalWidth);

      return createLine(el, chars.length);
    });

    /* Each line box hugs its own glyphs, so these land on one line only. */
    lines.forEach(function (line) {
      function trigger() { line.roll(); }
      line.el.addEventListener('pointerenter', trigger);
      line.el.addEventListener('click', trigger);
    });

    startCycle(title, lines);
  }

  function startCycle(title, lines) {
    var timer = null;
    var running = false;
    var armed = false;
    var onScreen = true;
    var pageVisible = !document.hidden;

    function step(index) {
      if (!running) return;

      if (index >= lines.length) {
        timer = window.setTimeout(function () { step(0); }, PAUSE_MS);
        return;
      }

      /* The next line starts only once this one has landed. */
      lines[index].roll(function () { step(index + 1); });
    }

    function start() {
      if (running) return;
      running = true;
      timer = window.setTimeout(function () { step(0); }, PAUSE_MS);
    }

    function stop() {
      running = false;
      if (timer) window.clearTimeout(timer);
      timer = null;
      /* A roll already in flight still settles itself, so nothing is left
         stranded mid-travel. */
    }

    function sync() {
      if (armed && onScreen && pageVisible) start();
      else stop();
    }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        onScreen = entries[0].isIntersecting;
        sync();
      }, { threshold: 0 }).observe(title);
    }

    document.addEventListener('visibilitychange', function () {
      pageVisible = !document.hidden;
      sync();
    });

    /* The hero sits above the fold but behind the brand preloader, and its
       fade-up starts the moment the CSS lands rather than when the overlay
       lifts. The cycle therefore waits for the overlay to go and for the
       fade-up to have run its course. */
    var startedAt = now();
    afterPreloader(function () {
      var wait = Math.max(ENTRANCE_MS - (now() - startedAt), SETTLE_MS);
      window.setTimeout(function () {
        armed = true;
        sync();
      }, wait);
    });
  }

  function now() {
    return window.performance ? performance.now() : Date.now();
  }

  function afterPreloader(done) {
    var fired = false;

    function fire() {
      if (fired) return;
      fired = true;
      done();
    }

    if (!document.body.classList.contains('is-preloading')) {
      fire();
      return;
    }

    var observer = new MutationObserver(function () {
      if (document.body.classList.contains('is-preloading')) return;
      observer.disconnect();
      fire();
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    /* A frame that never decodes should not cost the visitor the animation. */
    window.setTimeout(function () {
      observer.disconnect();
      fire();
    }, PRELOADER_BAILOUT_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
