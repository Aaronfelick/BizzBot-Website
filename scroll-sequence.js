// ============================================================================
// BIZZBOT SCROLL FILM
// Maps scroll progress to a 193-frame WebP sequence and renders it on canvas.
// Frames are loaded in a small moving window to keep decoded-memory use low.
// ============================================================================
(function () {
  'use strict';

  var film = document.getElementById('scrollFilm');
  var canvas = document.getElementById('sequenceCanvas');
  if (!film || !canvas) return;

  var context = canvas.getContext('2d', { alpha: false, desynchronized: true });
  if (!context) return;

  var embeddedSources = Array.isArray(window.BIZBOT_FRAME_SOURCES) ? window.BIZBOT_FRAME_SOURCES : null;
  var FRAME_COUNT = embeddedSources && embeddedSources.length ? embeddedSources.length : 193;
  var FRAME_PAD = 4;
  var PRELOAD_RADIUS = 6;
  var MAX_CACHE = 20;
  var DPR_CAP = 3;

  var cache = new Map();
  var pending = new Map();
  var accessTick = 0;
  var loadedUnique = new Set();
  var currentFrame = 0;
  var requestedFrame = 0;
  var lastDrawn = -1;
  var drawRafQueued = false;
  var scrollRafQueued = false;
  var canvasWidth = 0;
  var canvasHeight = 0;
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var loaderBar = document.getElementById('sequenceLoadBar');
  var progressBar = document.getElementById('filmProgressBar');
  var frameReadout = document.getElementById('filmFrameReadout');
  var scenes = Array.prototype.slice.call(film.querySelectorAll('[data-scene]'));
  var intro = document.getElementById('introHero');
  var introSticky = document.getElementById('introSticky');
  var mainNav = document.getElementById('mainNav');
  var storySequence = document.getElementById('storySequence');
  var storyPanels = storySequence
    ? Array.prototype.slice.call(storySequence.querySelectorAll('[data-story-step]'))
    : [];

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function smoothstep(min, max, value) {
    var t = clamp((value - min) / Math.max(0.0001, max - min), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function updateIntroFade() {
    if (!intro || !introSticky) return;
    var rect = intro.getBoundingClientRect();
    var fadeDistance = Math.max(1, window.innerHeight);
    var progress = clamp(-rect.top / fadeDistance, 0, 1);
    var opacity = 1 - smoothstep(0.04, 0.96, progress);
    introSticky.style.setProperty('--intro-opacity', opacity.toFixed(4));
    introSticky.style.pointerEvents = opacity > 0.2 ? 'auto' : 'none';
    intro.setAttribute('data-fade-progress', progress.toFixed(4));
  }

  function updateStorySequence() {
    if (!storySequence || !storyPanels.length || reducedMotion.matches) return;

    var rect = storySequence.getBoundingClientRect();
    var scrollable = Math.max(1, storySequence.offsetHeight - window.innerHeight);
    var progress = clamp(-rect.top / scrollable, 0, 1);
    var firstFade = smoothstep(0.22, 0.38, progress);
    var secondFade = smoothstep(0.62, 0.78, progress);
    var opacities = [
      1 - firstFade,
      firstFade * (1 - secondFade),
      secondFade
    ];

    var strongestIndex = 0;
    var strongestOpacity = -1;

    storyPanels.forEach(function (panel, index) {
      var opacity = opacities[index] || 0;
      if (opacity > strongestOpacity) {
        strongestOpacity = opacity;
        strongestIndex = index;
      }
      panel.style.opacity = opacity.toFixed(4);
      panel.classList.toggle('is-visible', opacity > 0.01);
      panel.classList.toggle('is-interactive', opacity > 0.55);
      panel.setAttribute('aria-hidden', opacity > 0.01 ? 'false' : 'true');
    });

    storySequence.dataset.activeStep = String(strongestIndex);
    storySequence.style.setProperty('--story-progress', progress.toFixed(5));
  }

  function frameUrl(index) {
    if (embeddedSources && embeddedSources[index]) return embeddedSources[index];
    return 'frames/frame_' + String(index + 1).padStart(FRAME_PAD, '0') + '.webp';
  }

  function updateLoader() {
    if (!loaderBar) return;
    var minimumReady = Math.min(1, loadedUnique.size / 18);
    loaderBar.style.transform = 'scaleX(' + minimumReady.toFixed(4) + ')';
  }

  function markLoaded(index) {
    loadedUnique.add(index);
    updateLoader();
    if (!film.classList.contains('sequence-ready') && cache.has(0)) {
      film.classList.add('sequence-ready');
    }
  }

  function loadFrame(index, priority) {
    index = clamp(Math.round(index), 0, FRAME_COUNT - 1);

    var memoryImage = Array.isArray(window.BIZZBOT_FRAME_IMAGES)
      ? window.BIZZBOT_FRAME_IMAGES[index]
      : null;
    if (memoryImage && memoryImage.complete && memoryImage.naturalWidth) {
      if (!cache.has(index)) {
        cache.set(index, { img: memoryImage, used: ++accessTick });
        markLoaded(index);
      }
      return Promise.resolve(memoryImage);
    }

    if (cache.has(index)) {
      var cached = cache.get(index);
      cached.used = ++accessTick;
      return Promise.resolve(cached.img);
    }
    if (pending.has(index)) return pending.get(index);

    var promise = new Promise(function (resolve, reject) {
      var image = new Image();
      image.decoding = priority ? 'sync' : 'async';
      image.loading = 'eager';
      if (priority) image.fetchPriority = 'high';
      image.onload = function () {
        cache.set(index, { img: image, used: ++accessTick });
        pending.delete(index);
        markLoaded(index);
        trimCache(index);
        resolve(image);
        if (index === requestedFrame || lastDrawn < 0) scheduleDraw();
      };
      image.onerror = function () {
        pending.delete(index);
        console.warn('BizzBot sequence frame failed:', index, image.src.slice(0, 120));
        reject(new Error('Unable to load frame ' + index));
      };
      image.src = frameUrl(index);
    });

    pending.set(index, promise);
    return promise;
  }

  function trimCache(center) {
    if (cache.size <= MAX_CACHE) return;
    var candidates = [];
    cache.forEach(function (entry, index) {
      if (index === 0 || Math.abs(index - center) <= PRELOAD_RADIUS + 2) return;
      candidates.push({ index: index, used: entry.used });
    });
    candidates.sort(function (a, b) { return a.used - b.used; });
    while (cache.size > MAX_CACHE && candidates.length) {
      cache.delete(candidates.shift().index);
    }
  }

  function preloadWindow(center) {
    var order = [center];
    for (var offset = 1; offset <= PRELOAD_RADIUS; offset++) {
      order.push(center + offset, center - offset);
    }
    order.forEach(function (index, position) {
      if (index < 0 || index >= FRAME_COUNT) return;
      loadFrame(index, position < 3).catch(function () {});
    });
  }

  function preloadSparse() {
    // Sparse anchors make large, fast scroll jumps show something immediately.
    var anchors = [];
    for (var i = 0; i < FRAME_COUNT; i += 12) anchors.push(i);
    anchors.push(FRAME_COUNT - 1);
    var cursor = 0;
    function nextBatch() {
      var slice = anchors.slice(cursor, cursor + 3);
      cursor += slice.length;
      slice.forEach(function (index) { loadFrame(index, false).catch(function () {}); });
      if (cursor < anchors.length) {
        if ('requestIdleCallback' in window) requestIdleCallback(nextBatch, { timeout: 900 });
        else setTimeout(nextBatch, 140);
      }
    }
    nextBatch();
  }

  function nearestLoaded(index) {
    if (cache.has(index)) return index;
    for (var radius = 1; radius <= 18; radius++) {
      var lower = index - radius;
      var upper = index + radius;
      if (lower >= 0 && cache.has(lower)) return lower;
      if (upper < FRAME_COUNT && cache.has(upper)) return upper;
    }
    if (cache.has(lastDrawn)) return lastDrawn;
    if (cache.has(0)) return 0;
    return -1;
  }

  function drawCover(image) {
    var sourceWidth = image.naturalWidth || image.width;
    var sourceHeight = image.naturalHeight || image.height;
    if (!sourceWidth || !sourceHeight || !canvasWidth || !canvasHeight) return;

    var sourceRatio = sourceWidth / sourceHeight;
    var targetRatio = canvasWidth / canvasHeight;
    var sx = 0;
    var sy = 0;
    var sw = sourceWidth;
    var sh = sourceHeight;

    if (sourceRatio > targetRatio) {
      sw = sourceHeight * targetRatio;
      sx = (sourceWidth - sw) * 0.5;
    } else {
      sh = sourceWidth / targetRatio;
      // Wide browser windows normally crop the robot's forehead. Bias the crop
      // toward the top so the full head remains visible throughout the film.
      var verticalCrop = Math.max(0, sourceHeight - sh);
      sy = verticalCrop * (window.innerWidth <= 768 ? 0.24 : 0.04);
    }

    context.save();
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.fillStyle = '#020204';
    context.fillRect(0, 0, canvasWidth, canvasHeight);
    context.drawImage(image, sx, sy, sw, sh, 0, 0, canvasWidth, canvasHeight);
    context.restore();
  }

  function draw() {
    drawRafQueued = false;
    var candidate = nearestLoaded(requestedFrame);
    if (candidate < 0) return;
    var entry = cache.get(candidate);
    if (!entry) return;
    entry.used = ++accessTick;
    drawCover(entry.img);
    currentFrame = candidate;
    lastDrawn = candidate;
  }

  function scheduleDraw() {
    if (drawRafQueued) return;
    drawRafQueued = true;
    requestAnimationFrame(draw);
  }

  function resizeCanvas() {
    var rect = canvas.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, window.innerWidth < 768 ? 1.35 : DPR_CAP);
    canvasWidth = Math.max(1, Math.round(rect.width * dpr));
    canvasHeight = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      scheduleDraw();
    }
  }

  function sceneEnvelope(progress, start, end) {
    var range = Math.max(0.001, end - start);
    var edge = Math.min(0.04, range * 0.22);
    if (progress < start || progress > end) return 0;
    var fadeIn = start <= 0 ? 1 : clamp((progress - start) / edge, 0, 1);
    var fadeOut = end >= 1 ? 1 : clamp((end - progress) / edge, 0, 1);
    var amount = Math.min(fadeIn, fadeOut, 1);
    return amount * amount * (3 - 2 * amount);
  }

  function updateScenes(progress) {
    var states = scenes.map(function (scene) {
      var start = Number(scene.dataset.start || 0);
      var end = Number(scene.dataset.end || 1);
      return {
        scene: scene,
        opacity: sceneEnvelope(progress, start, end),
        local: clamp((progress - start) / Math.max(0.001, end - start), 0, 1)
      };
    });

    var highestState = states.reduce(function (best, state) {
      return !best || state.opacity > best.opacity ? state : best;
    }, null);
    var compactLayout = window.innerWidth <= 768;

    states.forEach(function (state) {
      // On small screens every card uses the same safe zone. Showing only the
      // strongest scene prevents two text cards from crossfading on top of one another.
      var opacity = compactLayout && highestState !== state ? 0 : state.opacity;
      state.scene.style.opacity = opacity.toFixed(4);
      state.scene.style.transform = 'translate3d(0,' + ((0.5 - state.local) * 18).toFixed(2) + 'px,0)';
      state.scene.classList.toggle('is-visible', opacity > 0.01);
      state.scene.classList.toggle('is-interactive', opacity > 0.55);
    });

    if (highestState && highestState.opacity > 0.01) {
      film.dataset.activeScene = highestState.scene.dataset.scene;
    }
  }

  function updateFromScroll() {
    scrollRafQueued = false;
    updateIntroFade();
    updateStorySequence();

    var rect = film.getBoundingClientRect();
    var homePage = document.getElementById('page-home');
    var homeIsActive = !homePage || homePage.classList.contains('active');
    var filmIsPinned = homeIsActive && rect.top <= 0 && rect.bottom > window.innerHeight + 1;
    document.body.classList.toggle('film-active', filmIsPinned);
    if (mainNav) {
      mainNav.toggleAttribute('inert', filmIsPinned);
      mainNav.setAttribute('aria-hidden', filmIsPinned ? 'true' : 'false');
    }

    if (reducedMotion.matches) return;
    var scrollable = Math.max(1, film.offsetHeight - window.innerHeight);
    var progress = clamp(-rect.top / scrollable, 0, 1);
    requestedFrame = clamp(Math.round(progress * (FRAME_COUNT - 1)), 0, FRAME_COUNT - 1);

    film.style.setProperty('--film-progress', progress.toFixed(5));
    if (progressBar) progressBar.style.transform = 'scaleX(' + progress.toFixed(5) + ')';
    if (frameReadout) {
      frameReadout.textContent = String(requestedFrame + 1).padStart(3, '0') + ' / ' + FRAME_COUNT;
    }

    updateScenes(progress);
    preloadWindow(requestedFrame);
    scheduleDraw();
  }

  function scheduleScrollUpdate() {
    if (scrollRafQueued) return;
    scrollRafQueued = true;
    requestAnimationFrame(updateFromScroll);
  }

  function boot() {
    updateIntroFade();
    resizeCanvas();
    loadFrame(0, true).then(function () {
      requestedFrame = 0;
      scheduleDraw();
      film.classList.add('sequence-ready');
    }).catch(function () {
      film.classList.add('sequence-failed');
    });
    preloadWindow(0);
    preloadSparse();
    updateScenes(0);
    updateStorySequence();
    updateFromScroll();
  }

  window.addEventListener('scroll', scheduleScrollUpdate, { passive: true });
  window.addEventListener('resize', function () {
    resizeCanvas();
    scheduleScrollUpdate();
  }, { passive: true });

  if (reducedMotion.addEventListener) {
    reducedMotion.addEventListener('change', function () {
      resizeCanvas();
      scheduleScrollUpdate();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
