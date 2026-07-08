// fluid-hero.js — WebGL fluid background for the ZXY /websites hero.
//
// Library: webgl-fluid-enhanced@0.6.1 (PINNED). Its static API is config()/splat()/simulation()/pause().
// NOTE: 0.6.1 exposes config(), NOT setConfig() — calling setConfig() silently no-ops, which leaves every
// splat at the initial SPLAT_RADIUS and blows the cursor core out to white. Per-splat radius MUST go through
// config({ SPLAT_RADIUS }).
//
// Ported from the approved Claude Design source, with fluid BEHAVIOUR rebuilt to the acceptance criteria
// (the design's look is preserved verbatim; only the logic below was corrected):
//   • 60fps — capped sim/dye resolution, throttled splats, sim paused on hidden tab
//   • bloom — kept LOW (BLOOM_INTENSITY 0.45, BLOOM_THRESHOLD 0.75) so only the brightest cores glow; this is
//     what keeps the dye deep & saturated instead of washing the whole field into a pale white haze
//   • intro — TWO huge mist pairs collide (red fills the top, blue the bottom), billowing into the midline so
//     their overlap reads as a clean PURPLE seam (emergent); held ~4.5s, then dissipates into ambient
//   • cursor — soft saturated colour halo OUTSIDE + a faint white pinpoint INSIDE; low-green colours + low bloom
//     keep it deep COLOUR, never a white wash; inject only after >10px of travel; halo slides red→purple→blue at
//     3s/transition, sampled per-splat at injection time; purple every 5th collision
//   • ambient — continuous breathing; each splat fully randomized 0–360° direction, straight OR curvy,
//     no repeated paths; red/blue overlaps go purple additively
//   • fallback — reduced-motion / mobile / no-WebGL → static low-intensity CSS bloom, no canvas, no timers

import webGLFluidEnhanced from 'webgl-fluid-enhanced';

const RED  = ['#FF3B30', '#FF6B5E'];
const BLUE = ['#2E6BFF', '#4DA3FF'];

// Cursor palette — VIVID with LOW secondary channels (red keeps green≈0, etc.) so dense overlap stays
// SATURATED COLOUR instead of climbing to white. The red↔blue midpoint lands on a vivid magenta-purple.
// CUR_WHITE is a FAINT pinpoint (luminance below the bloom threshold) so the core never flares to a white cloud.
const CUR_RED = '#FF0A33', CUR_BLUE = '#2E50FF', CUR_PURPLE = '#B833FF', CUR_WHITE = '#ADADBA';

// Intro dye lifecycle: hold the banded look (slow fade), then release to the breathing fade rate.
const HOLD_DISSIPATION = 0.2;     // lower = dye lingers → the bands/purple hold ~2–3s longer
const AMBIENT_DISSIPATION = 1.0;  // breathing fade (matches CONFIG.DENSITY_DISSIPATION)

// LOOK config — copied from the approved design. PERF caps (SIM/DYE resolution) added per acceptance criteria.
const CONFIG = {
  SIM_RESOLUTION: 128,        // perf cap
  DYE_RESOLUTION: 512,        // perf cap — design used the lib default (1024); 512 holds the bloomed look at 60fps
  BACK_COLOR: '#000000',
  TRANSPARENT: false,
  COLOR_PALETTE: [...RED, ...BLUE],
  COLORFUL: false,            // palette only — no rainbow cycling
  BLOOM: true,
  BLOOM_INTENSITY: 0.45,      // down from 0.8 — bloom was over-amplifying the dye into a pale white wash
  BLOOM_THRESHOLD: 0.75,      // up from default 0.6 — only the brightest cores glow → deep saturated colour
  CURL: 32,                   // vorticity → billowing tendrils
  DENSITY_DISSIPATION: 1.0,   // dye fades between bursts → the breathing
  VELOCITY_DISSIPATION: 0.25,
  SPLAT_RADIUS: 0.25,
  SPLAT_FORCE: 6000,
  SHADING: true,
  HOVER: false,              // cursor handled manually below
  BRIGHTNESS: 0.6,
  INITIAL: false,
  SUNRAYS: true,
};

let started = false;
let stopped = false;
let simPaused = false;
let breathTimer = null;

// cursor state
let lastPt = null, lastInjPt = null, lastMove = 0, purpleUntil = 0, colCount = 0, wasInBand = false;

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
  } catch (e) { return false; }
}

function lerpHex(a, b, t) {
  const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
  const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}

// Every splat declares its own radius — config() (the real 0.6.1 method) sets it atomically just before the
// splat, so the small cursor core stays small and never blooms to white.
function splat(x, y, dx, dy, color, radius) {
  try {
    webGLFluidEnhanced.config({ SPLAT_RADIUS: radius });
    webGLFluidEnhanced.splat(x, y, dx, dy, color);
  } catch (e) { /* sim not ready — drop this splat */ }
}

// Keep ambient splats out of the headline / CTA channel (left-center) so the copy stays readable.
function avoidText(xf, yf) {
  if (xf < 0.46 && yf > 0.26 && yf < 0.84) {
    yf = (Math.random() < 0.5) ? Math.random() * 0.20 : 0.86 + Math.random() * 0.12;
  }
  return yf;
}

// INTRO — TWO PAIRS OF HUGE MIST that collide. A RED pair fills the top (one huge puff sweeping in from the
// left, one from the right → they collide across the top). A BLUE pair fills the bottom the same way. The red
// top and blue bottom overlap at the horizontal midline and bloom PURPLE additively (emergent, NOT seeded),
// reading red → wavy purple seam → blue, covering most of the screen. Radius is genuinely huge: the lib scales
// SPLAT_RADIUS by 1/100 internally, so each puff's reach ≈ sqrt(R/100) of the screen — R≈11 ≈ a half-screen puff.
// Dye is held (low dissipation), then released to dissipate over ~4–5s into the ambient breathing state.
const MIST_R = 11;   // HUGE — half-screen puffs (sqrt(11/100) ≈ 0.33 of the screen each)
function intro() {
  const W = window.innerWidth, H = window.innerHeight;
  try { webGLFluidEnhanced.config({ DENSITY_DISSIPATION: HOLD_DISSIPATION }); } catch (e) {}

  const mist = (xf, yf, vx, vy, color) => {
    const jx = (Math.random() * 2 - 1) * 0.03, jy = (Math.random() * 2 - 1) * 0.03;   // organic variation
    splat(W * (xf + jx), H * (yf + jy), vx, vy, color, MIST_R);
  };
  // Two huge pairs: RED fills the top, BLUE the bottom, each billowing toward the midline so they overlap
  // into a PURPLE seam. With bloom turned down the dye stays deep & saturated, so red / purple / blue read
  // as distinct bands (emergent purple — no dense seam booster, which only added to the wash).
  const fire = () => {
    if (stopped) return;
    mist(0.28, 0.29,  950 + Math.random() * 450,  420, RED[0]);    // RED pair, top, billows DOWN to the midline
    mist(0.72, 0.29, -950 - Math.random() * 450,  420, RED[1]);
    mist(0.28, 0.71,  950 + Math.random() * 450, -420, BLUE[0]);   // BLUE pair, bottom, billows UP to the midline
    mist(0.72, 0.71, -950 - Math.random() * 450, -420, BLUE[1]);
  };
  fire();
  setTimeout(fire, 300);   // second pass deepens coverage to fill most of the screen (keeps ~1s reveal)

  // hold the banded look ~4.5s (low dissipation), then release so it dissipates into ambient (~2–3s longer)
  setTimeout(() => { try { webGLFluidEnhanced.config({ DENSITY_DISSIPATION: AMBIENT_DISSIPATION }); } catch (e) {} }, 4500);
}

// AMBIENT — one breathing streak: red biased left-center, blue biased right-center (their overlap → purple),
// full 0–360° direction, randomly straight OR a chained curvy bend. Never the same path twice.
function ambientSplat(isRed) {
  const W = window.innerWidth, H = window.innerHeight;
  const pal = isRed ? RED : BLUE;
  const color = pal[(Math.random() * pal.length) | 0];
  const xf = isRed ? (0.06 + Math.pow(Math.random(), 1.6) * 0.50)
                   : (0.96 - Math.pow(Math.random(), 1.6) * 0.52);
  let px = W * xf, py = H * avoidText(xf, Math.random());
  const force = 800 + Math.random() * 1800;
  const a = Math.random() * Math.PI * 2;
  if (Math.random() < 0.5) {
    splat(px, py, Math.cos(a) * force, Math.sin(a) * force, color, 0.25);   // STRAIGHT
  } else {
    const steps = 2 + (Math.random() < 0.5 ? 1 : 0);                        // CURVY — chained, rotating
    const da = (Math.random() < 0.5 ? 1 : -1) * (0.35 + Math.random() * 0.45);
    const stepLen = (0.04 + Math.random() * 0.05) * W;
    let ang = a;
    for (let k = 0; k < steps; k++) {
      splat(px, py, Math.cos(ang) * force, Math.sin(ang) * force, color, 0.18);
      ang += da;
      px += Math.cos(ang) * stepLen;
      py = H * avoidText(px / W, (py + Math.sin(ang) * stepLen) / H);
    }
  }
}

function ambientLoop() {
  if (stopped) return;
  if (!document.hidden) {
    const n = 2 + (Math.random() < 0.5 ? 1 : 0);   // 2–3 splats / tick
    for (let i = 0; i < n; i++) ambientSplat(Math.random() < 0.5);
  }
  breathTimer = setTimeout(ambientLoop, 1200 + Math.random() * 400);  // ~1200–1600ms
}

// CURSOR — coloured halo (~28–30px) + small grey core (capped at #999 = mid-grey, below the bloom-flare
// threshold). Inject ONLY after >10px of travel since the last injection, so a resting or slow pointer
// injects nothing and white can never pile up (the blinding fix).
function onPointerMove(e) {
  if (stopped) return;
  const now = performance.now();
  if (now - lastMove < 16) return;     // light throttle (~60fps)
  lastMove = now;

  const W = window.innerWidth, H = window.innerHeight;
  const x = e.clientX, y = e.clientY;  // canvas is fixed full-viewport → client coords map 1:1
  const xf = x / W;

  // collision = a debounced ENTRY into the central mixed band; every 5th entry → purple for ~1.5s
  const inBand = (xf > 0.42 && xf < 0.58);
  if (inBand && !wasInBand) {
    colCount++;
    if (colCount % 5 === 0) purpleUntil = now + 1500;
  }
  wasInBand = inBand;

  let dx = 0, dy = 0;
  if (lastPt) { dx = (x - lastPt.x) * 8; dy = (y - lastPt.y) * 8; }
  lastPt = { x, y };

  // distance gate — the whole blinding fix
  if (lastInjPt && Math.hypot(x - lastInjPt.x, y - lastInjPt.y) < 10) return;
  lastInjPt = { x, y };

  // Halo colour is sampled HERE, at injection time, from a continuous now-based triangle wave so it
  // actually slides red↔blue (3s each way). No cached value — every splat reads the current phase.
  let haloColor;
  if (now < purpleUntil) {
    haloColor = CUR_PURPLE;
  } else {
    const phase = (now % 6000) / 6000;                    // 0..1 continuous, 6s full cycle
    const tri = phase < 0.5 ? phase * 2 : 2 - phase * 2;  // 0..1..0 linear → 3s per one-way transition
    haloColor = lerpHex(CUR_RED, CUR_BLUE, tri);
  }
  // Colour OUTSIDE, white INSIDE: a big soft colour halo that billows into smoke, with a small soft-white
  // core at its centre. Vivid mid-luminance colour glows softly (no flare); the tiny core reads as the
  // bright dense centre without blowing out to white.
  splat(x, y, dx, dy, haloColor, 0.10);                   // soft saturated colour halo → billowing smoke
  splat(x, y, dx * 0.4, dy * 0.4, CUR_WHITE, 0.004);      // faint white pinpoint inside (below bloom threshold)
}

function onVisibility() {
  if (stopped || !started) return;
  if (document.hidden) {
    if (!simPaused) { try { webGLFluidEnhanced.pause(); } catch (e) {} simPaused = true; }
    if (breathTimer) { clearTimeout(breathTimer); breathTimer = null; }   // no timers while hidden
  } else {
    if (simPaused) { try { webGLFluidEnhanced.pause(); } catch (e) {} simPaused = false; }
    if (!breathTimer) ambientLoop();   // resume breathing (re-seeds promptly)
  }
}

function startFluid(canvas) {
  if (started || stopped) return false;
  try {
    webGLFluidEnhanced.simulation(canvas, CONFIG);
  } catch (e) { return false; }
  // self-verify: simulation() resizes the canvas synchronously; if still at default it didn't take.
  if (canvas.width === 300 || canvas.width === 0) return false;
  started = true;

  document.body.classList.add('fluid-active');   // crossfade: canvas in, CSS fallback out

  intro();
  breathTimer = setTimeout(ambientLoop, 8000);   // hold ~4.5s + dissipate, then ambient breathing (~8s total)

  window.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  return true;
}

function init() {
  const canvas = document.getElementById('fluid-canvas');
  if (!canvas) return;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobile = window.matchMedia('(max-width: 820px)').matches || window.matchMedia('(pointer: coarse)').matches;

  // reduced-motion / mobile / no-WebGL → static low-intensity CSS bloom (no canvas, no timers)
  if (reduce || mobile || !hasWebGL()) {
    canvas.remove();
    return;
  }

  // Poll until the canvas has laid out, then start. startFluid() is idempotent.
  let attempts = 0;
  const poll = setInterval(() => {
    if (started || stopped || attempts++ > 140) { clearInterval(poll); return; }
    if (canvas.getBoundingClientRect().width < 1) return;   // wait for layout
    if (startFluid(canvas)) clearInterval(poll);
  }, 100);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(init));
} else {
  requestAnimationFrame(init);
}
