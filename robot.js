// ============================================================================
// BIZBOT 3D HERO ROBOT — Three.js animated mascot
//
// The robot lives on a fixed full-viewport canvas layered over the home
// page. It starts bottom-left in the hero, wanders to the top-right corner
// if the user doesn't scroll, then as the user scrolls it fades between a
// handful of DOM-anchored "slots" — big on the right for the first story
// panel, big on the left for the second, then small parked top-right of the
// "Up and running in 3 steps" section for the rest of the page. See the
// "Flight plan" comment further down for the slot definitions.
//
// It also tracks the mouse, blinks, waves, and opens its chest panels to
// reveal a glowing AI core. Falls back to hiding the stage if WebGL or the
// Three.js CDN is unavailable. Loaded as a classic script (no modules) so it
// works when index.html is opened directly from disk.
// ============================================================================

(function () {

  const stage  = document.getElementById('robotStage');
  const canvas = document.getElementById('robotCanvas');

  function disable3d(reason) {
    console.warn('BizBot 3D robot disabled:', reason);
    if (stage) stage.style.display = 'none';
  }

  if (!stage || !canvas) return;
  if (typeof THREE === 'undefined' || !THREE.RoundedBoxGeometry) {
    disable3d('Three.js failed to load (offline or CDN blocked)');
    return;
  }

  // Single palette tuned for the dark cinematic backdrop
  const PALETTE = { body: 0xb8ddff, panel: 0xd8ecff, joint: 0x6ba0cd, screen: 0x2b3d5f };
  const ACCENT = 0x5d6dff;

  try {
    init();
  } catch (err) {
    disable3d(err);
  }

  function init() {
    const mq = window.matchMedia('(max-width: 768px)');
    const isMobileInit = mq.matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    // ── Renderer / scene / camera ──
    const renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      alpha: true,
      antialias: !isMobileInit,
      powerPreference: isMobileInit ? 'low-power' : 'default'
    });
    function applyPixelRatio() {
      const cap = mq.matches ? 1.25 : 2;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, cap));
    }
    applyPixelRatio();
    renderer.outputEncoding = THREE.sRGBEncoding;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
    camera.position.set(0, 0.4, 8.4);
    camera.lookAt(0, 0, 0);

    // ── Lights (tuned for dark background) ──
    const hemi = new THREE.HemisphereLight(0xe8f7ff, 0x1a294a, 0.85);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 1.0);
    key.position.set(3, 5, 4);
    scene.add(key);
    const warm = new THREE.PointLight(ACCENT, 1.0, 14);
    warm.position.set(-2.5, 0.5, 3);
    scene.add(warm);

    // ── Materials ──
    const bodyMat   = new THREE.MeshStandardMaterial({ color: PALETTE.body,  roughness: 0.38, metalness: 0.15 });
    const panelMat  = new THREE.MeshStandardMaterial({ color: PALETTE.panel, roughness: 0.45, metalness: 0.12 });
    const jointMat  = new THREE.MeshStandardMaterial({ color: PALETTE.joint, roughness: 0.5,  metalness: 0.35 });
    const screenMat = new THREE.MeshStandardMaterial({ color: PALETTE.screen, roughness: 0.25, metalness: 0.1 });
    const accentMat = new THREE.MeshStandardMaterial({ color: ACCENT, roughness: 0.4, metalness: 0.1 });
    const eyeMat    = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const coreMat   = new THREE.MeshBasicMaterial({ color: ACCENT });
    const glowMat   = new THREE.MeshBasicMaterial({ color: 0x74d3ff });

    // ── Scene graph: root carries the scroll keyframes, robot bobs inside it ──
    const root = new THREE.Group();
    scene.add(root);
    const robot = new THREE.Group();
    root.add(robot);

    // Torso
    const torso = new THREE.Mesh(new THREE.RoundedBoxGeometry(1.55, 1.5, 1.05, 5, 0.3), bodyMat);
    robot.add(torso);

    // Chest recess + glowing core
    const chestScreen = new THREE.Mesh(new THREE.RoundedBoxGeometry(1.0, 0.9, 0.14, 4, 0.06), screenMat);
    chestScreen.position.set(0, 0.02, 0.48);
    robot.add(chestScreen);

    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.21, 1), coreMat);
    core.position.set(0, 0.02, 0.45);
    robot.add(core);
    const coreHalo = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1), new THREE.MeshBasicMaterial({
      color: ACCENT, transparent: true, opacity: 0.25
    }));
    coreHalo.position.copy(core.position);
    robot.add(coreHalo);
    const coreLight = new THREE.PointLight(ACCENT, 0, 4);
    coreLight.position.set(0, 0.02, 1.0);
    robot.add(coreLight);

    // Chest panel doors (hinged at outer edges, swing open to reveal the core)
    function makeDoor(side) { // side: -1 left, +1 right
      const hinge = new THREE.Group();
      hinge.position.set(side * 0.53, 0.02, 0.62);
      const door = new THREE.Mesh(new THREE.RoundedBoxGeometry(0.52, 0.92, 0.1, 4, 0.05), panelMat);
      door.position.x = -side * 0.26;
      hinge.add(door);
      robot.add(hinge);
      return hinge;
    }
    const doorL = makeDoor(-1);
    const doorR = makeDoor(1);

    // Waist accent stripe
    const waist = new THREE.Mesh(new THREE.RoundedBoxGeometry(1.1, 0.18, 0.85, 3, 0.08), accentMat);
    waist.position.y = -0.8;
    robot.add(waist);

    // Head group (tracks the mouse independently of the body)
    const headGroup = new THREE.Group();
    headGroup.position.y = 1.42;
    robot.add(headGroup);

    const head = new THREE.Mesh(new THREE.RoundedBoxGeometry(1.75, 1.3, 1.2, 5, 0.34), bodyMat);
    headGroup.add(head);

    const face = new THREE.Mesh(new THREE.RoundedBoxGeometry(1.3, 0.82, 0.12, 4, 0.06), screenMat);
    face.position.set(0, -0.04, 0.58);
    headGroup.add(face);

    // Eyes (capsules so blinking by squashing looks natural)
    const eyeGeo = new THREE.CapsuleGeometry(0.075, 0.12, 4, 12);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.29, 0.04, 0.66);
    eyeR.position.set(0.29, 0.04, 0.66);
    headGroup.add(eyeL);
    headGroup.add(eyeR);

    // Smile (lower half torus)
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.028, 8, 20, Math.PI), eyeMat);
    mouth.position.set(0, -0.22, 0.66);
    mouth.rotation.z = Math.PI;
    headGroup.add(mouth);

    // Side "ears"
    const earGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.14, 20);
    const earL = new THREE.Mesh(earGeo, accentMat);
    earL.rotation.z = Math.PI / 2;
    earL.position.set(-0.93, 0, 0);
    const earR = earL.clone();
    earR.position.x = 0.93;
    headGroup.add(earL);
    headGroup.add(earR);

    // Antenna with pulsing tip
    const antennaRod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.38, 10), jointMat);
    antennaRod.position.y = 0.82;
    headGroup.add(antennaRod);
    const antennaTip = new THREE.Mesh(new THREE.SphereGeometry(0.095, 16, 16), coreMat);
    antennaTip.position.y = 1.05;
    headGroup.add(antennaTip);

    // Arms (shoulder pivot groups so the right arm can wave)
    function makeArm(side) {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 1.0, 0.42, 0);
      const joint = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 16), jointMat);
      shoulder.add(joint);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.135, 0.52, 4, 12), bodyMat);
      arm.position.y = -0.42;
      shoulder.add(arm);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.185, 16, 16), accentMat);
      hand.position.y = -0.82;
      shoulder.add(hand);
      shoulder.rotation.z = side * 0.22; // resting pose, slightly out
      robot.add(shoulder);
      return shoulder;
    }
    const armL = makeArm(-1);
    const armR = makeArm(1);
    const armRestL = armL.rotation.z;
    const armRestR = armR.rotation.z;

    // Hover skirt + thruster glow (no legs — he floats)
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.3, 0.42, 24), jointMat);
    skirt.position.y = -1.05;
    robot.add(skirt);
    const thruster = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.5, 20, 1, true), glowMat);
    thruster.material.transparent = true;
    thruster.material.opacity = 0.55;
    thruster.rotation.x = Math.PI;
    thruster.position.y = -1.45;
    robot.add(thruster);
    const thrusterLight = new THREE.PointLight(ACCENT, 0.6, 4);
    thrusterLight.position.y = -1.5;
    robot.add(thrusterLight);

    // Orbit ring with three satellites (travels with the robot)
    const ring = new THREE.Group();
    const ringMesh = new THREE.Mesh(
      new THREE.TorusGeometry(2.05, 0.012, 8, 80),
      new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.32 })
    );
    ring.add(ringMesh);
    const satellites = [];
    for (let i = 0; i < 3; i++) {
      const sat = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 10), coreMat);
      ring.add(sat);
      satellites.push(sat);
    }
    ring.rotation.x = Math.PI / 2.25;
    ring.position.y = -0.1;
    root.add(ring);

    // Warm light pool under the robot (reads on the dark backdrop)
    const poolCanvas = document.createElement('canvas');
    poolCanvas.width = poolCanvas.height = 128;
    const pctx = poolCanvas.getContext('2d');
    const grad = pctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,110,60,0.5)');
    grad.addColorStop(1, 'rgba(255,110,60,0)');
    pctx.fillStyle = grad;
    pctx.fillRect(0, 0, 128, 128);
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(2.8, 2.8),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(poolCanvas), transparent: true, depthWrite: false })
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = -2.15;
    root.add(pool);

    // ── Pointer tracking (mouse + touch) ──
    const mouse = { x: 0, y: 0 };
    function updatePointer(clientX, clientY) {
      mouse.x = (clientX / window.innerWidth) * 2 - 1;
      mouse.y = (clientY / window.innerHeight) * 2 - 1;
    }
    window.addEventListener('mousemove', function (e) {
      updatePointer(e.clientX, e.clientY);
    }, { passive: true });
    window.addEventListener('touchstart', function (e) {
      if (e.touches.length) updatePointer(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    window.addEventListener('touchmove', function (e) {
      if (e.touches.length) updatePointer(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    // ── Resize ──
    function resize() {
      const w = stage.clientWidth || window.innerWidth;
      const h = stage.clientHeight || window.innerHeight;
      applyPixelRatio();
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    resize();
    window.addEventListener('resize', resize);
    mq.addEventListener('change', resize);

    // ── Flight plan ──
    // Ground rule: the robot's pose is a pure function of the CURRENT scroll
    // position — never of time or of how the user scrolled to get there. So
    // revisiting the same spot always shows the exact same slot (position +
    // size), and leaving a slot hides the robot immediately (a hard opacity
    // 0/1 cut, not a lerped fade) — no lingering, no gradual dim.
    //
    // Slots:
    //   HERO_A  — hero, bottom-left corner. Visible only while scrollY is
    //             ~0 (i.e. the hero is what's on screen).
    //   PANEL01 — right side, visible only while "Trained on your exact
    //             business" is the dominant story panel.
    //   PANEL02 — left side, visible only while "English & العربية" is
    //             dominant.
    //   FINAL   — top-right, ~starting size. Takes over the instant panel 02
    //             stops being dominant (i.e. through the chat-demo panel and
    //             for the rest of the page) and just stays there.
    //
    // HERO_B/HERO_IDLE_* are kept for a later top-right idle-wander pass;
    // unused while that's disabled.
    const HERO_A  = { x: -3.97, y: -1.75, s: 0.5,  ry:  0.5 };
    const HERO_B  = { x:  3.6,  y:  1.85, s: 0.5,  ry: -0.5 };
    const PANEL01 = { x:  2.4,  y: -0.15, s: 0.82, ry: -0.5 };
    const PANEL02 = { x: -3.0,  y: -0.15, s: 0.82, ry:  0.5 };
    const FINAL   = { x:  3.87, y:  1.32, s: 0.32, ry: -0.5 }; // top-right, smaller — parked from panel 02 onward
    const HERO_IDLE_DELAY    = 1.5;
    const HERO_IDLE_DURATION = 0.9;
    const MOBILE_POSE = { x: 0.05, y: -0.88, s: 0.42, ry: 0.08 }; // placeholder pose for pages where mobile stays hidden (opacity 0, so it never actually shows)
    // Mobile hero: the robot just wanders between these two corners for as
    // long as the hero is on screen — see resolvePose().
    const MOBILE_A = { x: -0.9, y:  1.0,  s: 0.20, ry:  0.4 }; // upper-left
    const MOBILE_B = { x:  0.8, y: -1.12, s: 0.20, ry: -0.4 }; // lower-right
    const MOBILE_CYCLE = 6.0; // seconds for a full A -> B -> A loop (~3s each way)

    const lerp = THREE.MathUtils.lerp;
    const clamp01 = function (v) { return Math.min(1, Math.max(0, v)); };
    const easeOut = function (v) { return 1 - Math.pow(1 - v, 3); };

    function lerpPose(a, b, tt) {
      return {
        x: lerp(a.x, b.x, tt), y: lerp(a.y, b.y, tt),
        s: lerp(a.s, b.s, tt), ry: lerp(a.ry, b.ry, tt)
      };
    }

    // 0 -> 1 -> 0 triangle wave, smoothed, so position eases in and out at
    // each corner instead of moving at a constant speed and snapping.
    function pingPong(t, period) {
      const cyclePos = (t % period) / (period / 2); // 0..2
      const tri = cyclePos <= 1 ? cyclePos : 2 - cyclePos; // 0->1->0
      return tri * tri * (3 - 2 * tri); // smoothstep
    }

    const introHeroEl     = document.getElementById('introHero');
    const storySequenceEl = document.getElementById('storySequence');
    const scrollFilmEl    = document.getElementById('scrollFilm');
    // Only index.html has the hero/story-sequence flight path. Every other
    // page (except pricing.html, which doesn't load robot.js at all) just
    // gets the robot parked at the homepage's final slot — no flying, just
    // the idle bob/wave/mouse-follow already in animate() below.
    const isHomePage = document.body.classList.contains('on-home');

    // Hard, instant zone lookup — { pose, opacity } where opacity is always
    // exactly 0 or 1, never a fraction (except the two gradual cases noted
    // inline below). Depends only on current scroll math, so it's naturally
    // history-free.
    function resolvePose(isMobile, t) {
      if (isMobile) {
        // Mobile: the robot only ever appears on the homepage hero — hidden
        // everywhere else, on every other page, full stop.
        if (!isHomePage) return { pose: MOBILE_POSE, opacity: 0 };

        // While the hero is on screen it just wanders between two corners
        // forever. Opacity fades out gradually (not a hard cut) as the user
        // scrolls away, and back in if they scroll back up — a direct
        // function of scroll position, so "come back to the hero" always
        // means "still flying," regardless of path.
        const heroRect = introHeroEl ? introHeroEl.getBoundingClientRect() : null;
        const heroProgress = heroRect ? clamp01(-heroRect.top / window.innerHeight) : 1;
        const opacity = clamp01(1 - heroProgress / 0.5);
        const swing = pingPong(t, MOBILE_CYCLE);
        return { pose: lerpPose(MOBILE_A, MOBILE_B, swing), opacity: opacity };
      }
      if (!isHomePage) return { pose: FINAL, opacity: 1 };

      if (storySequenceEl) {
        const r = storySequenceEl.getBoundingClientRect();
        const scrollable = Math.max(1, storySequenceEl.offsetHeight - window.innerHeight);
        const sp = -r.top / scrollable; // unclamped: <0 before it, >1 after it

        if (sp >= 0 && sp < 1) {
          if (sp < 0.30) return { pose: PANEL01, opacity: 1 }; // panel 01 dominant
          if (sp < 0.70) return { pose: PANEL02, opacity: 1 }; // panel 02 dominant
          return { pose: FINAL, opacity: 1 };                   // panel 03 onward — parked top-right
        }
        if (sp >= 1) return { pose: FINAL, opacity: 1 }; // past the story sequence — stays parked top-right to the end
      }

      // Still above the story sequence. Two separate things happen here,
      // deliberately on different triggers:
      //  - opacity hides 100% the moment ANY scroll happens (fast fade, not
      //    a hard cut) — it shouldn't stay visible while the hero fades out.
      //  - the actual slot (position) only changes once the "BIZZBOT /
      //    PRODUCT FILM" sequence has started (its sticky stage reaching the
      //    top of the viewport, i.e. frame 001 showing) — so while hidden
      //    and scrolling through the hero's own fade-out, the robot is still
      //    logically sitting at HERO_A, just invisible, and only starts
      //    heading toward panel 01 once the film actually begins.
      const filmStarted = scrollFilmEl ? scrollFilmEl.getBoundingClientRect().top <= 0 : window.scrollY > 2;
      const pose = filmStarted ? PANEL01 : HERO_A;
      const opacity = window.scrollY > 2 ? 0 : 1;
      return { pose: pose, opacity: opacity, fade: true };
    }

    // smooth 0→1→0 envelope used by wave & chest cycles
    function envelope(phase, start, end, rise, fall) {
      if (phase < start || phase > end) return 0;
      const inE  = clamp01((phase - start) / rise);
      const outE = clamp01((end - phase) / fall);
      return easeOut(inE) * easeOut(outE);
    }

    const clock = new THREE.Clock();
    let nextBlink = 2.2;
    let blinkAt = -10;
    let heroFadeOpacity = 1; // only used for the hero show/hide boundary's quick fade

    const WAVE_PERIOD = 7.5;
    const CHEST_PERIOD = 11;

    let stageVisible = true;
    let tabVisible = !document.hidden;
    const stageObserver = new IntersectionObserver(function (entries) {
      stageVisible = entries[0] ? entries[0].isIntersecting : true;
    }, { threshold: 0 });
    stageObserver.observe(stage);
    document.addEventListener('visibilitychange', function () {
      tabVisible = !document.hidden;
    });

    function animate() {
      requestAnimationFrame(animate);
      if (!stageVisible || !tabVisible) return;

      const t = clock.getElapsedTime();

      // Which slot the robot belongs in right now
      const isMobile = mq.matches;
      const resolved = resolvePose(isMobile, t);
      const k = resolved.pose;

      // Every slot change is a hard cut, set directly every frame so it's
      // always exactly right for the current scroll position — except the
      // hero show/hide boundary, which gets a slow lerped fade instead of
      // popping instantly (the one bit of visible smoothing left).
      if (resolved.fade) {
        heroFadeOpacity = lerp(heroFadeOpacity, resolved.opacity, 0.05); // ~0.8-1s
        stage.style.opacity = String(heroFadeOpacity);
      } else {
        heroFadeOpacity = resolved.opacity; // stay in sync so re-entering the hero doesn't fade from a stale value
        stage.style.opacity = String(resolved.opacity);
      }

      // Entry pop-in on load is the only eased motion left; the slot
      // position/scale itself is set directly (no lerp) so it's always
      // pixel-identical whenever the same slot is active.
      const entry = easeOut(clamp01(t / 1.4));
      const aspectShift = camera.aspect / 1.6;
      // Mobile poses are already tuned in raw world units (portrait framing
      // is much narrower), so they skip the desktop aspect-ratio multiplier.
      root.position.x = isMobile ? k.x : k.x * Math.min(aspectShift, 1.15);
      root.position.y = k.y;
      root.scale.setScalar(k.s * entry);

      // Idle hover bob + gentle sway (robot inside root)
      const bob = Math.sin(t * 1.5) * 0.13;
      robot.position.y = bob;
      robot.rotation.z = Math.sin(t * 0.7) * 0.025;

      // Face direction = scroll keyframe + mouse-follow
      robot.rotation.y = lerp(robot.rotation.y, k.ry + mouse.x * 0.35, 0.05);
      robot.rotation.x = lerp(robot.rotation.x, mouse.y * 0.12, 0.05);
      headGroup.rotation.y = lerp(headGroup.rotation.y, mouse.x * 0.3, 0.07);
      headGroup.rotation.x = lerp(headGroup.rotation.x, mouse.y * 0.22, 0.07);

      // Blinking
      if (t > nextBlink) { blinkAt = t; nextBlink = t + 2.4 + Math.random() * 2.4; }
      const sinceBlink = t - blinkAt;
      const blink = sinceBlink < 0.16 ? 1 - Math.abs(sinceBlink / 0.08 - 1) : 0;
      const eyeScaleY = 1 - blink * 0.92;
      eyeL.scale.y = eyeScaleY;
      eyeR.scale.y = eyeScaleY;

      // Waving right arm
      const wavePhase = t % WAVE_PERIOD;
      const waveEnv = envelope(wavePhase, 1.2, 3.4, 0.45, 0.45);
      armR.rotation.z = armRestR + waveEnv * (2.45 + Math.sin(t * 11) * 0.28);
      armL.rotation.z = armRestL - Math.sin(t * 1.5 + 1) * 0.06;

      // Chest panel opening — doors swing, core flares and spins
      const chestPhase = t % CHEST_PERIOD;
      const open = envelope(chestPhase, 4.0, 8.0, 0.6, 0.6);
      doorL.rotation.y = -open * 1.85;
      doorR.rotation.y =  open * 1.85;
      const corePulse = 1 + Math.sin(t * 6) * 0.08;
      core.scale.setScalar((0.85 + open * 0.55) * corePulse);
      coreHalo.scale.setScalar((0.7 + open * 1.0) * corePulse);
      coreHalo.material.opacity = 0.12 + open * 0.3;
      core.rotation.y = t * 1.6;
      core.rotation.x = t * 0.9;
      coreLight.intensity = open * 1.6;

      // Antenna pulse + thruster flicker
      antennaTip.scale.setScalar(1 + Math.sin(t * 3.2) * 0.18);
      thruster.scale.y = 1 + Math.sin(t * 17) * 0.12 + bob * 0.4;
      thruster.material.opacity = 0.4 + Math.sin(t * 13) * 0.12;
      thrusterLight.intensity = 0.55 + Math.sin(t * 17) * 0.15;

      // Orbit ring + satellites
      ring.rotation.z = t * 0.25;
      satellites.forEach(function (sat, i) {
        const a = t * 0.55 + (i * Math.PI * 2) / 3;
        sat.position.set(Math.cos(a) * 2.05, Math.sin(a) * 2.05, 0);
      });

      // Light pool under the robot breathes with the bob
      pool.material.opacity = 0.75 - (bob + 0.13) * 1.5;
      pool.scale.setScalar(1 - (bob + 0.13) * 0.5);

      renderer.render(scene, camera);
    }
    animate();
  }

})();