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
  // P10 · CONFLUENCE: the canvas returns the same way for the #preview window —
  // fading in over the first 20vh of overlap and out over the last, so the
  // reducer's pause at zero overlap always lands at opacity 0 there too.
  var lastFade = -1;
  if (document.getElementById('fluid-canvas')) {
    var confTop = Infinity, confH = 0;   // Infinity until the confluence is confirmed → term stays 0
    var measureConf = function () {
      var el = document.body.classList.contains('confluence-on') && document.getElementById('preview');
      if (!el) { confTop = Infinity; confH = 0; return; }
      var r = el.getBoundingClientRect();
      confTop = r.top + (window.scrollY || 0); confH = r.height;
    };
    window.addEventListener('resize', measureConf, { passive: true });
    window.addEventListener('load', measureConf);
    // fluid-hero flags the body when the sim confirms (usually <1s, worst-case
    // slower) — poll until the flag lands, then stop; resize keeps it fresh
    var confTries = 0;
    var confPoll = setInterval(function () {
      measureConf();
      if (confTop !== Infinity || ++confTries > 14) clearInterval(confPoll);
    }, 1000);
    subs.push(function (y) {
      var f = 1 - Math.min(1, Math.max(0, (y - vh * 0.8) / (vh * 0.2)));
      var fi = Math.min(1, Math.max(0, (y + vh - confTop) / (vh * 0.2)));
      var fo = Math.min(1, Math.max(0, (confTop + confH - y) / (vh * 0.2)));
      f = Math.max(f, Math.min(fi, fo));
      f = Math.round(f * 100) / 100;
      if (f !== lastFade) { lastFade = f; docEl.style.setProperty('--fluid-fade', f); }
    });
  }

  // ---- REVEAL PRIMITIVE --------------------------------------------------------
  // [data-reveal] fades up on first viewport entry; stagger with --i on the element.
  // Reduced motion: the CSS hidden state never applies — nothing to force-complete.
  var revealTargets = document.querySelectorAll('[data-reveal], .page-section, .site-footer');
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

  // ---- STAT COUNT-UP (#why) ------------------------------------------------------
  // Animates only the digits; the localized label lives in a separate i18n'd span,
  // so a mid-count language flip can never corrupt the number.
  var statEls = document.querySelectorAll('.stat-n');
  if (statEls.length && 'IntersectionObserver' in window && !MOTION_OFF) {
    var statIO = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        statIO.unobserve(e.target);
        var raw = e.target.textContent;
        var suffix = raw.replace(/[0-9]/g, '');
        var target = parseInt(raw, 10) || 0;
        var t0 = performance.now(), dur = 900;
        (function tick(now) {
          var p = Math.min(1, (now - t0) / dur);
          var eased = 1 - Math.pow(1 - p, 4);
          e.target.textContent = Math.round(target * eased) + suffix;
          if (p < 1) requestAnimationFrame(tick); else e.target.textContent = raw;
        })(t0);
      });
    }, { threshold: 0.6 });
    statEls.forEach(function (el) { statIO.observe(el); });
  }

  // ---- X-RAY LENS (Boréal tile) --------------------------------------------------
  // The alt layer always carries the OTHER language; a MutationObserver on
  // <html lang> keeps it in sync with the toggle.
  var lensHost = document.getElementById('lens-host');
  if (lensHost) {
    var altH1 = lensHost.querySelector('.alt-h1');
    var lensChip = document.getElementById('lens-chip');
    var syncAlt = function () {
      var alt = (document.documentElement.lang === 'fr') ? 'en' : 'fr';
      if (altH1 && altH1.dataset[alt]) altH1.textContent = altH1.dataset[alt];
      if (lensChip) lensChip.textContent = alt.toUpperCase() + ' — LIVE';
    };
    syncAlt();
    new MutationObserver(syncAlt).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches && !MOTION_OFF) {
      lensHost.addEventListener('pointermove', function (e) {
        var r = lensHost.getBoundingClientRect();
        lensHost.style.setProperty('--lx', (e.clientX - r.left) + 'px');
        lensHost.style.setProperty('--ly', (e.clientY - r.top) + 'px');
        lensHost.classList.add('lensing');
      });
      lensHost.addEventListener('pointerleave', function () { lensHost.classList.remove('lensing'); });
    } else {
      // coarse pointer / reduced motion: tap flips the whole tile
      lensHost.addEventListener('click', function () { lensHost.classList.toggle('flipped'); });
    }
  }

  // ---- THE PREVIEW FORGE -----------------------------------------------------------
  // Debounced textContent mirrors only (XSS-safe); first keystroke strips the
  // data-i18n defaults so the language toggle can't stomp typed values.
  var forge = document.getElementById('forge');
  var fBiz = document.getElementById('f-business');
  var fTrade = document.getElementById('f-trade');
  if (forge && fBiz) {
    var fH1 = document.getElementById('forge-h1');
    var fBrand = document.getElementById('forge-brand');
    var fUrl = document.getElementById('forge-url');
    var slugify = function (v) {
      return v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
    };
    var forgeTimer;
    fBiz.addEventListener('input', function () {
      clearTimeout(forgeTimer);
      forgeTimer = setTimeout(function () {
        var v = fBiz.value.trim();
        if (!v) return;   // keep the localized defaults until there's a name
        [fH1, fBrand, fUrl].forEach(function (el) { if (el) el.removeAttribute('data-i18n'); });
        if (fH1) fH1.textContent = v + '.';
        if (fBrand) fBrand.textContent = v.toUpperCase();
        if (fUrl) fUrl.textContent = (slugify(v) || 'votresite') + '.ca';
      }, 120);
    });
    var fEye = document.getElementById('forge-eyebrow');
    var fDetail = document.getElementById('f-trade-detail');
    var fDetailOpt = document.getElementById('f-trade-detail-opt');
    if (fTrade) {
      fTrade.addEventListener('change', function () {
        forge.setAttribute('data-trade', fTrade.value || '');
        // "Other" must say what they do; everyone else may (Zay's rule)
        var isOther = fTrade.value === 'other';
        if (fDetail) fDetail.required = isOther;
        if (fDetailOpt) fDetailOpt.hidden = isOther;
        if (fEye && fTrade.value && !(fDetail && fDetail.value.trim())) {
          fEye.removeAttribute('data-i18n');
          fEye.textContent = 'MONTRÉAL — ' + fTrade.options[fTrade.selectedIndex].text.toUpperCase();
        }
      });
    }
    // the specify box mirrors into the Forge eyebrow — their words, their site
    if (fDetail) {
      var detailTimer;
      fDetail.addEventListener('input', function () {
        clearTimeout(detailTimer);
        detailTimer = setTimeout(function () {
          var v = fDetail.value.trim();
          if (!v || !fEye) return;
          // the eyebrow is a one-line badge — clamp so a long entry can't clutter it
          if (v.length > 32) v = v.slice(0, 31).replace(/\s+$/, '') + '…';
          fEye.removeAttribute('data-i18n');
          fEye.textContent = 'MONTRÉAL — ' + v.toUpperCase();
        }, 140);
      });
    }
  }

  // ---- INSTRUMENT TELEMETRY ------------------------------------------------------
  // (a) progress hairline: scaleX driven from the spine (doc height cached on resize)
  var progressBar = document.getElementById('nav-progress');
  if (progressBar) {
    var docSpan = 1;
    var measureDoc = function () {
      docSpan = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    };
    window.addEventListener('resize', measureDoc, { passive: true });
    window.addEventListener('load', measureDoc);
    measureDoc();
    var lastP = -1;
    subs.push(function (y) {
      var p = Math.min(1, Math.max(0, y / docSpan));
      p = Math.round(p * 500) / 500;
      if (p !== lastP) { lastP = p; progressBar.style.transform = 'scaleX(' + p + ')'; }
    });
  }
  // (b) scroll-spy: whichever section owns the viewport centre lights its nav link
  //     and feeds the mono readout (text comes from the section's own localized chapter)
  var sections = document.querySelectorAll('.page-section');
  var readout = document.getElementById('section-readout');
  var menuLinks = document.querySelectorAll('.hero-nav .menu a');
  if (sections.length && 'IntersectionObserver' in window) {
    var spy = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        var id = e.target.id;
        menuLinks.forEach(function (a) {
          if (a.getAttribute('href') === '#' + id) a.setAttribute('aria-current', 'true');
          else a.removeAttribute('aria-current');
        });
        if (readout) {
          var ch = e.target.querySelector('.section-chapter');
          if (ch) { readout.textContent = ch.textContent; readout.classList.add('on'); }
        }
      });
    }, { rootMargin: '-45% 0px -45%', threshold: 0 });
    sections.forEach(function (s) { spy.observe(s); });
    // hero owns the top: clear state + hide readout while the hero is in view
    var heroEl = document.querySelector('.websites-page');
    if (heroEl) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (e.isIntersecting && e.intersectionRatio > 0.4) {
            menuLinks.forEach(function (a) { a.removeAttribute('aria-current'); });
            if (readout) readout.classList.remove('on');
          }
        });
      }, { threshold: 0.4 }).observe(heroEl);
    }
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
