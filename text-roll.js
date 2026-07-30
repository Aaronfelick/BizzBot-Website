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

   The original fires on hover alone, which leaves phones out. This one also
   plays itself once when the hero first settles, and replays on tap.
   ========================================================================== */
(function () {
  'use strict';

  var TITLE = '.intro-title';

  /* Kept in step with the timings in style.css. The reset that re-arms the
     roll has to land after the last character has finished travelling, and
     the last character is the one furthest down the headline. */
  var DURATION_MS = 500;
  var STAGGER_MS = 30;
  var LINE_STEP_MS = 90;

  /* The lines already fade up on load (introLineIn). Rolling on top of that
     reads as two animations fighting, so the first roll waits for it. */
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

  function init() {
    var title = document.querySelector(TITLE);
    if (!title) return;

    /* Nothing here is essential to reading the headline, so a visitor who
       asked for less motion keeps the original markup untouched. */
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var lines = [].slice.call(title.children).filter(function (node) {
      return node.tagName === 'SPAN';
    });
    if (!lines.length) return;

    var longestLine = 0;

    lines.forEach(function (line, index) {
      /* Has to happen while the line still holds its original text. */
      var naturalWidth = measureNatural(line);

      var counter = { i: 0 };
      var out = buildLayer(line, 'tr-layer tr-layer-out', counter);
      /* Both layers are split from the same source, so the counter restarts
         and the two copies of a character share one delay. */
      var incoming = buildLayer(line, 'tr-layer tr-layer-in', { i: 0 });

      longestLine = Math.max(longestLine, counter.i);

      line.textContent = '';
      line.className = line.className ? line.className + ' tr-line' : 'tr-line';
      line.style.setProperty('--tr-line', index);
      line.appendChild(out);
      line.appendChild(incoming);

      compensateKerning(line, out.querySelectorAll('.tr-char'), naturalWidth);
    });

    var cycleMs = DURATION_MS +
      (lines.length - 1) * LINE_STEP_MS +
      Math.max(0, longestLine - 1) * STAGGER_MS + 40;

    var isRolling = false;

    function play() {
      if (isRolling) return;
      isRolling = true;
      title.classList.add('is-rolling');

      window.setTimeout(function () {
        /* Dropping the class would roll everything back down, which reads as
           a rewind. Freezing transitions first snaps the layers back to their
           start instead -- invisible, because both copies are identical -- so
           the next roll travels upward again. */
        title.classList.add('tr-instant');
        title.classList.remove('is-rolling');
        void title.offsetWidth;
        title.classList.remove('tr-instant');
        isRolling = false;
      }, cycleMs);
    }

    /* pointerenter covers the mouse; click covers taps, where there is no
       hover to enter. On a touchscreen both fire for one tap, and the
       in-flight guard collapses them into a single roll. */
    title.addEventListener('pointerenter', play);
    title.addEventListener('click', play);

    autoplay(title, play);
  }

  /* The hero sits above the fold but behind the brand preloader, and its
     fade-up starts the moment the CSS lands rather than when the overlay
     lifts. The first roll therefore waits for the overlay to go, for the
     fade-up to have run its course, and for the hero to actually be on
     screen -- whichever of those resolves last. */
  function autoplay(title, play) {
    var startedAt = window.performance ? performance.now() : Date.now();

    afterPreloader(function () {
      var elapsed = (window.performance ? performance.now() : Date.now()) - startedAt;
      var wait = Math.max(ENTRANCE_MS - elapsed, SETTLE_MS);

      whenVisible(title, function () {
        /* A background tab reports the hero as on screen but paints nothing,
           so rolling there would spend the one automatic play on an audience
           that cannot see it. Hold it until the tab is actually foregrounded. */
        whenPageVisible(function () {
          window.setTimeout(play, wait);
        });
      });
    });
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

  function whenPageVisible(done) {
    if (!document.hidden) {
      done();
      return;
    }

    document.addEventListener('visibilitychange', function onChange() {
      if (document.hidden) return;
      document.removeEventListener('visibilitychange', onChange);
      done();
    });
  }

  function whenVisible(element, done) {
    if (!('IntersectionObserver' in window)) {
      done();
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      observer.disconnect();
      done();
    }, { threshold: 0.25 });

    observer.observe(element);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
