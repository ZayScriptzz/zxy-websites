// site.js — page-wide motion spine for the ZXY /websites page.
// Vanilla, dependency-free. ONE passive scroll listener + ONE rAF loop feed every
// scroll-linked effect; IntersectionObservers handle discrete reveals. All motion
// is enhancement: content is visible by default (hidden states in websites.css are
// gated behind html.js + prefers-reduced-motion, so no-JS/reduced-motion users see
// everything immediately).
(function () {
  'use strict';
  var docEl = document.documentElement;
  docEl.classList.add('js');   // CSS keys enhancement-only hidden states off this

  var MOTION_OFF = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- THE SPINE -----------------------------------------------------------
  // Subscribers run every frame with (y, smoothY). Writes must be
  // transform/opacity/custom-prop only — no layout reads inside subscribers;
  // cache rects on resize instead.
  var subs = [];
  var targetY = window.scrollY || 0;
  var smoothY = targetY;
  var vh = window.innerHeight;

  window.addEventListener('scroll', function () { targetY = window.scrollY; }, { passive: true });
  window.addEventListener('resize', function () { vh = window.innerHeight; }, { passive: true });

  // ---- FRAME-TIME SENTINEL ---------------------------------------------------
  // Rolling average > 20ms for ~60 consecutive frames → html.perf-tier-down.
  // CSS uses it to drop the heaviest decorative layers without a visual pop.
  // One-way: once tiered down, we stay down (no flip-flopping mid-session).
  var ftAvg = 16, slowFrames = 0, tieredDown = false;

  // ---- CANVAS-OPACITY-BEFORE-PAUSE -------------------------------------------
  // Fade #fluid-canvas over the hero's last 20vh so the fluid reducer's pause
  // (which freezes the frame) always lands at opacity 0 — a frozen frame is
  // never visible. Uses raw targetY: the fade must track scroll 1:1, not lag.
  var lastFade = -1;
  if (document.getElementById('fluid-canvas')) {
    subs.push(function (y) {
      var f = 1 - Math.min(1, Math.max(0, (y - vh * 0.8) / (vh * 0.2)));
      f = Math.round(f * 100) / 100;
      if (f !== lastFade) { lastFade = f; docEl.style.setProperty('--fluid-fade', f); }
    });
  }

  // ---- REVEAL PRIMITIVE --------------------------------------------------------
  // [data-reveal] fades up on first viewport entry; stagger with --i on the element.
  // Reduced motion: the CSS hidden state never applies — nothing to force-complete.
  var revealTargets = document.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window && !MOTION_OFF) {
    var revealIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in-view'); revealIO.unobserve(en.target); }
      });
    }, { rootMargin: '-12% 0px' });
    revealTargets.forEach(function (el) { revealIO.observe(el); });
  } else {
    revealTargets.forEach(function (el) { el.classList.add('in-view'); });
  }

  // ---- GLASS FRAME MICRO-PARALLAX ----------------------------------------------
  // ±2° perspective tilt toward the pointer — glass catching the light. Desktop
  // fine-pointer only, motion-gated; transform-only (compositor-cheap).
  var fw = document.querySelector('.framed-word');
  if (fw && !MOTION_OFF &&
      window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 821px)').matches) {
    var tiltTX = 0, tiltTY = 0, tiltCX = 0, tiltCY = 0;
    window.addEventListener('pointermove', function (e) {
      tiltTY = ((e.clientX / window.innerWidth) - 0.5) * 4;   // rotateY ±2°
      tiltTX = (0.5 - (e.clientY / vh)) * 3;                  // rotateX ±1.5°
    }, { passive: true });
    subs.push(function () {
      if (Math.abs(tiltTX - tiltCX) + Math.abs(tiltTY - tiltCY) < 0.002) return;
      tiltCX += (tiltTX - tiltCX) * 0.08;
      tiltCY += (tiltTY - tiltCY) * 0.08;
      // orbit the RESTING angle (must match the CSS base transform: rotateY(-8) rotateX(2.5))
      fw.style.transform =
        'perspective(900px) rotateX(' + (2.5 + tiltCX).toFixed(3) + 'deg) rotateY(' + (-8 + tiltCY).toFixed(3) + 'deg)';
    });
  }

  // ---- STICKY SMS PILL (mobile) ------------------------------------------------
  // Visible only between hero-exit and #preview-entry — one dominant conversion
  // element per viewport. CSS keeps it display:none on desktop.
  var pill = document.getElementById('sms-pill');
  var pillHero = document.querySelector('.websites-page');
  var pillPrev = document.getElementById('preview');
  if (pill && pillHero && pillPrev && 'IntersectionObserver' in window) {
    var heroIn = true, prevIn = false;
    var updPill = function () { pill.classList.toggle('on', !heroIn && !prevIn); };
    new IntersectionObserver(function (es) {
      es.forEach(function (e) { heroIn = e.isIntersecting; }); updPill();
    }, { threshold: 0 }).observe(pillHero);
    new IntersectionObserver(function (es) {
      es.forEach(function (e) { prevIn = e.isIntersecting; }); updPill();
    }, { threshold: 0.2 }).observe(pillPrev);
  }

  // ---- THE LOOP ------------------------------------------------------------
  var last = performance.now();
  function frame(now) {
    var dt = now - last; last = now;
    if (dt > 0 && dt < 250) {           // ignore tab-switch gaps
      ftAvg += (dt - ftAvg) * 0.05;
      if (ftAvg > 20) {
        if (++slowFrames >= 60 && !tieredDown) { tieredDown = true; docEl.classList.add('perf-tier-down'); }
      } else {
        slowFrames = 0;
      }
    }
    smoothY += (targetY - smoothY) * 0.12;
    if (Math.abs(targetY - smoothY) < 0.1) smoothY = targetY;
    for (var i = 0; i < subs.length; i++) subs[i](targetY, smoothY);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
