/* =========================================================================
   CHARACTER CLOUD — hero section animation
   Intro: glitchy matrix reveal — characters materialise inside the text shape
   in randomised bursts. Uses a SINGLE render loop throughout — the intro is
   just a per-cell visibility mask layered onto the normal renderer, so when
   it finishes the transition is perfectly seamless (no separate phases).
   ========================================================================= */

const DISPLAY_FONT = '"HouseSansComp", sans-serif';
const GLYPH_FONT   = '"JetBrains Mono", ui-monospace, monospace';
const BG           = '#1C48E8';
const DOT_ALPHA    = 0.055;

// ── Fixed config ──────────────────────────────────────────────────────────
const CHARS   = 'RT34EFAK.:+*%^@!~+11-=@#0189mjTrTYXfabfiuweh9238472819vcw{}>?AFVY(*&@'.split('');
const CELL    = 6;
const CHAOS   = 0.66;
const DISSOLVE = 0.15;
const TEXT_LINES = ['Beyond', 'Aesthetics'];

const GLITCH_CHARS = '01▓▒░█▄▀■□▪▫'.split('');

// ── Sin/cos lookup table — replaces Math.sin/cos in the inner grid loop ──
const _ST_SIZE = 512;
const _ST      = new Float32Array(_ST_SIZE);
for (let _i = 0; _i < _ST_SIZE; _i++) _ST[_i] = Math.sin((_i / _ST_SIZE) * Math.PI * 2);
function fastSin(x) {
  const pos = (((x / (Math.PI * 2)) % 1 + 1) % 1) * _ST_SIZE;
  const i0  = pos | 0;
  return _ST[i0] + (_ST[(i0 + 1) % _ST_SIZE] - _ST[i0]) * (pos - i0);
}
function fastCos(x) { return fastSin(x + Math.PI * 0.5); }

// ── Intro config ──────────────────────────────────────────────────────────
const INTRO_DURATION    = 1.6;   // seconds to reveal all cells
const INTRO_CYCLE_SPEED = 24;    // glyph cycle speed during reveal
const INTRO_SETTLE_TIME = 0.18;  // per-cell cycling time before lock-in

// ── DOM ───────────────────────────────────────────────────────────────────
const canvas = document.getElementById('hero-canvas');
const ctx    = canvas.getContext('2d');
const loader = document.getElementById('hero-loader');

// ── State ─────────────────────────────────────────────────────────────────
let W, H, DPR;
let cols, rows;
let grid, brightness, flash;
let mask, maskW, maskH;

const mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
const rot   = { x: 0, y: 0 };

const glitch = {
  active: false,
  intensity: 0,
  nextAt: 3.0,
  rowShifts: [],
};

// ── Ambient floating characters ───────────────────────────────────────────
const AMBIENT_POOL  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#%&*+=?/|{}[]~^<>'.split('');
const AMBIENT_COUNT = 55;

function makeAmbientChar() {
  const lifespan = 0.12 + Math.random() * 0.55;
  return {
    x:        Math.random() * (W || window.innerWidth),
    y:        Math.random() * (H || window.innerHeight),
    ch:       AMBIENT_POOL[(Math.random() * AMBIENT_POOL.length) | 0],
    size:     7 + Math.random() * 14,
    alpha:    0,
    maxAlpha: 0.18 + Math.random() * 0.32,
    lifespan,
    age:      0,
    flickerSpeed: 8 + Math.random() * 20,
  };
}

const ambientChars = Array.from({ length: AMBIENT_COUNT }, makeAmbientChar);

// ── Intro state ───────────────────────────────────────────────────────────
let introActive = true;
let introStartTime = 0;
let cellReveal = null;
let revealOrder = null;
let revealCursor = 0;

// ── Outro state ───────────────────────────────────────────────────────────
const OUTRO_DURATION    = 1.5;   // total time to schedule all cells to hide
const OUTRO_SETTLE_TIME = 0.38;  // per-cell fade-out duration (smoother than intro)
let outroActive = false;
let outroStartTime = 0;
let cellHide = null;
let hideOrder = null;
let hideCursor = 0;

function buildHideOrder() {
  hideOrder = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * CELL + CELL / 2;
      const y = r * CELL + CELL / 2;
      if (sampleMask(x, y) >= 0.20) hideOrder.push(r * cols + c);
    }
  }
  for (let i = hideOrder.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [hideOrder[i], hideOrder[j]] = [hideOrder[j], hideOrder[i]];
  }
  cellHide = new Float32Array(cols * rows).fill(-1);
  hideCursor = 0;
}

window.triggerHeroOutro = function () {
  if (outroActive) return;
  // Force-complete intro if still running so outro can start immediately
  if (introActive) {
    introActive = false;
    cellReveal  = null;
    revealOrder = null;
  }
  buildHideOrder();
  outroStartTime = 0;
  outroActive = true;
};

window.resetHeroIntro = function () {
  // Clear outro
  outroActive  = false;
  cellHide     = null;
  hideOrder    = null;
  hideCursor   = 0;
  outroStartTime = 0;
  // Replay intro
  introActive    = true;
  introStartTime = 0;
  buildRevealOrder();
};

// ── Setup & resize ────────────────────────────────────────────────────────
function resize() {
  const hero = canvas.parentElement;
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = hero.clientWidth;
  H = hero.clientHeight;
  canvas.width  = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  cols = Math.ceil(W / CELL) + 1;
  rows = Math.ceil(H / CELL) + 1;

  grid       = new Uint8Array(cols * rows);
  brightness = new Float32Array(cols * rows);
  flash      = new Float32Array(cols * rows);
  for (let i = 0; i < grid.length; i++) grid[i] = (Math.random() * CHARS.length) | 0;

  rebuildMask();
  if (introActive) buildRevealOrder();
  ambientChars.forEach(a => { a.x = Math.random() * W; a.y = Math.random() * H; });
}

function rebuildMask() {
  maskW = W; maskH = H;
  const m = document.createElement('canvas');
  m.width = maskW; m.height = maskH;
  const mctx = m.getContext('2d', { willReadFrequently: true });

  mctx.fillStyle = '#000';
  mctx.fillRect(0, 0, maskW, maskH);
  mctx.fillStyle = '#fff';
  mctx.textAlign = 'center';
  mctx.textBaseline = 'middle';

  const target = W * 0.78;
  let size = Math.floor(H * 0.224);
  const sizeMax = H * 0.288;
  const measure = () => Math.max(...TEXT_LINES.map(l => mctx.measureText(l).width));
  mctx.font = `italic 700 ${size}px ${DISPLAY_FONT}`;
  while (measure() > target && size > 24) {
    size -= Math.max(2, (size * 0.05) | 0);
    mctx.font = `italic 700 ${size}px ${DISPLAY_FONT}`;
  }
  while (measure() < target * 0.85 && size < sizeMax) {
    size += Math.max(2, (size * 0.04) | 0);
    mctx.font = `italic 700 ${size}px ${DISPLAY_FONT}`;
  }
  const lineH = size * 1.1;
  const totalH = TEXT_LINES.length * lineH;
  TEXT_LINES.forEach((line, i) => {
    const y = maskH / 2 - totalH / 2 + lineH * i + lineH / 2;
    mctx.fillText(line, maskW / 2, y);
  });

  const data = mctx.getImageData(0, 0, maskW, maskH).data;
  mask = new Uint8ClampedArray(maskW * maskH);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) mask[j] = data[i];
}

function sampleMask(x, y) {
  if (x < 0 || y < 0 || x >= maskW || y >= maskH) return 0;
  return mask[(y | 0) * maskW + (x | 0)] / 255;
}

function noise2(x, y, t) {
  return (
    fastSin(x * 0.035 + t * 0.7) * fastCos(y * 0.04 - t * 0.5) * 0.6 +
    fastSin(x * 0.08  - t * 0.3) * fastCos(y * 0.09 + t * 0.4) * 0.4
  );
}

// ── Build reveal order ────────────────────────────────────────────────────
// Collect every grid cell that falls on the text mask, shuffle them.
function buildRevealOrder() {
  const total = cols * rows;
  cellReveal = new Float32Array(total).fill(-1);  // -1 = not revealed yet
  revealOrder = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * CELL + CELL / 2;
      const y = r * CELL + CELL / 2;
      if (sampleMask(x, y) >= 0.20) {
        revealOrder.push(r * cols + c);
      }
    }
  }

  // Fisher-Yates shuffle
  for (let i = revealOrder.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [revealOrder[i], revealOrder[j]] = [revealOrder[j], revealOrder[i]];
  }

  revealCursor = 0;
}

// ── Single unified render loop ────────────────────────────────────────────
let tPrev = 0;
let heroRafId = null;

function heroActive() {
  const el = document.getElementById('hero');
  return !!(el && el.classList.contains('active'));
}

function stopHeroLoop() {
  if (heroRafId !== null) { cancelAnimationFrame(heroRafId); heroRafId = null; }
}

function startHeroLoop() {
  if (heroRafId !== null) return;
  heroRafId = requestAnimationFrame(tick);
}

function tick(tNow) {
  heroRafId = null;
  if (!heroActive()) return;  // section not visible — stop until reactivated
  const dt = Math.min(0.05, (tNow - tPrev) / 1000);
  tPrev = tNow;
  const t = tNow / 1000;

  // ── Intro: advance reveal cursor ──
  if (introActive && cellReveal) {
    if (introStartTime === 0) introStartTime = tNow;
    const elapsed = (tNow - introStartTime) / 1000;
    const progress = Math.min(1, elapsed / INTRO_DURATION);

    // Activate cells up to current progress point
    const targetCount = Math.ceil(progress * revealOrder.length);
    while (revealCursor < targetCount && revealCursor < revealOrder.length) {
      cellReveal[revealOrder[revealCursor]] = tNow;
      revealCursor++;
    }

    // Intro ends when all cells have been revealed AND settled
    if (revealCursor >= revealOrder.length && elapsed > INTRO_DURATION + INTRO_SETTLE_TIME + 0.15) {
      introActive = false;
      cellReveal = null;
      revealOrder = null;
    }
  }

  // ── Outro: reverse matrix de-reveal ──
  if (outroActive && cellHide) {
    if (outroStartTime === 0) outroStartTime = tNow;
    const elapsed = (tNow - outroStartTime) / 1000;
    const progress = Math.min(1, elapsed / OUTRO_DURATION);

    const targetHidden = Math.ceil(progress * hideOrder.length);
    while (hideCursor < targetHidden && hideCursor < hideOrder.length) {
      cellHide[hideOrder[hideCursor]] = tNow;
      hideCursor++;
    }

    // Fire early so section-2 fade-in overlaps with final cells vanishing
    if (hideCursor >= hideOrder.length && elapsed > OUTRO_DURATION + OUTRO_SETTLE_TIME * 0.5) {
      outroActive = false;
      window.dispatchEvent(new CustomEvent('heroOutroDone'));
    }
  }

  // ── Mouse & rotation ──
  mouse.x += (mouse.tx - mouse.x) * 0.55;
  mouse.y += (mouse.ty - mouse.y) * 0.55;
  const targetY = (mouse.x - 0.5) *  0.245;  // left/right tilt
  const targetX = (mouse.y - 0.5) * -0.126;  // up/down tilt
  rot.y += (targetY - rot.y) * 0.06;
  rot.x += (targetX - rot.x) * 0.06;

  // ── Global glitch timer ──
  glitch.nextAt -= dt;
  if (glitch.nextAt <= 0 && !glitch.active) {
    glitch.active = true;
    glitch.intensity = 0.6 + Math.random() * 0.4;
    glitch.rowShifts = Array.from({ length: rows }, () =>
      Math.random() < 0.25 ? (Math.random() - 0.5) * CELL * glitch.intensity * 6 : 0
    );
    setTimeout(() => { glitch.active = false; }, 60 + Math.random() * 120);
    glitch.nextAt = 2 + Math.random() * 4;
  }
  if (!glitch.active && glitch.intensity > 0) glitch.intensity *= 0.75;

  const shuffleChance = 0.003 + CHAOS * 0.06;
  const dispPx        = CELL * (0.6 + DISSOLVE * 2.8);
  const mouseRadius   = 120;
  const repelMax      = 8;    // max px a character flies from cursor
  const glyphSize     = Math.max(4, Math.round(CELL * 0.78));
  const gi            = glitch.intensity;

  // ── Clear ──
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  // ── Matrix rain during intro ──
  if (introActive) {
    const elapsed = (tNow - introStartTime) / 1000;
    const rainAlpha = Math.min(0.15, elapsed * 0.12) * Math.max(0, 1 - (elapsed - INTRO_DURATION) * 3);
    if (rainAlpha > 0.005) {
      ctx.font = `500 ${glyphSize}px ${GLYPH_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const rainCols = Math.min(80, 30 + (elapsed * 12) | 0);
      for (let i = 0; i < rainCols; i++) {
        const rc = ((Math.sin(i * 127.1 + 42) * 0.5 + 0.5) * cols) | 0;
        const headRow = ((elapsed * (14 + Math.sin(i * 3.7) * 6) + i * 7) % (rows + 10)) | 0;
        for (let tr = 0; tr < 6; tr++) {
          const rr = headRow - tr;
          if (rr < 0 || rr >= rows) continue;
          const rx = rc * CELL + CELL / 2;
          const ry = rr * CELL + CELL / 2;
          const ch = CHARS[((elapsed * INTRO_CYCLE_SPEED + i + tr) | 0) % CHARS.length];
          ctx.fillStyle = `rgba(0,255,70,${rainAlpha * (1 - tr / 6) * 0.6})`;
          ctx.fillText(ch, rx, ry);
        }
      }
    }
  }

  // ── Dot grid ──
  ctx.fillStyle = `rgba(255,255,255,${DOT_ALPHA})`;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      ctx.fillRect(c * CELL + CELL / 2 - 0.5, r * CELL + CELL / 2 - 0.5, 1, 1);

  // ── Character grid ──
  ctx.font = `500 ${glyphSize}px ${GLYPH_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const mouseXpx = mouse.x * W;
  const mouseYpx = mouse.y * H;

  // Occasional scanline tear during intro
  const doScanline = introActive && Math.random() < 0.08;
  let scanlineRow = -1, scanlineShift = 0;
  if (doScanline) {
    scanlineRow = (Math.random() * rows) | 0;
    scanlineShift = (Math.random() - 0.5) * CELL * 4;
  }

  // Rotation cos/sin constant for the whole frame — hoist out of cell loop
  const cosY = fastCos(rot.y), sinY = fastSin(rot.y);
  const cosX = fastCos(rot.x), sinX = fastSin(rot.x);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const x = c * CELL + CELL / 2;
      const y = r * CELL + CELL / 2;

      // ── Standard displacement & mask sampling (always runs) ──
      const dx = x - mouseXpx, dy = y - mouseYpx;
      const mDist = Math.sqrt(dx * dx + dy * dy);
      const mInf  = Math.max(0, 1 - mDist / mouseRadius);

      const invD  = mDist > 0.001 ? 1 / mDist : 0;
      const repel = mInf * mInf * repelMax;
      const ox = dx * invD * repel;
      const oy = dy * invD * repel;

      const n1 = noise2(c, r, t);
      const n2 = noise2(c + 113, r + 57, t + 4);
      const nx = x + n1 * dispPx;
      const ny = y + n2 * dispPx;
      // 3-D perspective projection — Y-axis (mouse.x) + X-axis (mouse.y) rotation
      const fov  = 900;
      const px   = nx - W / 2;
      const py   = ny - H / 2;
      const rx   =  px * cosY;
      const ry   =  py * cosX + px * sinY * sinX;
      const rz   =  py * sinX - px * sinY * cosX;
      const psc  = fov / (fov + rz);
      const sx   = W / 2 + rx * psc;
      const sy   = H / 2 + ry * psc;

      let b = sampleMask(sx, sy);
      const jitter = (fastSin(c * 12.9898 + r * 78.233) * 0.5 + 0.5) * 0.15;
      b -= jitter * (1 - DISSOLVE * 0.6);
      brightness[idx] = b;

      flash[idx] *= 0.55;

      // Normal shuffle
      if (Math.random() < shuffleChance + mInf * mInf + mInf * 0.6) {
        const useGlitch = mInf > 0.3 && Math.random() < mInf * 0.7;
        grid[idx] = useGlitch
          ? (Math.random() * GLITCH_CHARS.length) | 0
          : (Math.random() * CHARS.length) | 0;
        if (mInf > 0) flash[idx] = mInf * 0.9;
      }

      // Global glitch corruption
      if (gi > 0.05 && Math.random() < gi * 0.18) {
        grid[idx] = (Math.random() * GLITCH_CHARS.length) | 0;
        flash[idx] = Math.max(flash[idx], gi * 0.7);
      }

      if (b <= 0.18) continue;

      // ── Outro: cell is being de-revealed ──
      if (cellHide) {
        const hideTime = cellHide[idx];
        if (hideTime < 0) {
          // not yet scheduled to hide — render normally until its turn
        } else {
          const hideAge  = (tNow - hideTime) / 1000;
          const hideP    = Math.min(1, hideAge / OUTRO_SETTLE_TIME);
          if (hideP >= 1) continue; // fully gone

          const cycleIdx  = (t * INTRO_CYCLE_SPEED + idx * 0.3) | 0;
          let displayChar;
          if (hideP < 0.3) {
            displayChar = CHARS[grid[idx]] || '.';
          } else if (hideP < 0.7) {
            displayChar = Math.random() < 0.5
              ? CHARS[cycleIdx % CHARS.length]
              : GLITCH_CHARS[cycleIdx % GLITCH_CHARS.length];
          } else {
            displayChar = GLITCH_CHARS[cycleIdx % GLITCH_CHARS.length];
          }

          const fadeAlpha = (1 - hideP) * b * (0.5 + Math.abs(Math.sin(t * 22 + idx)) * 0.5);
          // white → green → gone (mirror of intro colour transition)
          const gg = Math.round(235 * (1 - hideP) + 255 * hideP);
          const rr = Math.round(234 * (1 - hideP));
          const bb2 = Math.round(234 * (1 - hideP));
          ctx.fillStyle = `rgba(${rr},${gg},${bb2},${fadeAlpha})`;
          ctx.fillText(displayChar, x + ox, y + oy);
          if (hideP < 0.5) {
            ctx.fillStyle = `rgba(0,255,70,${fadeAlpha * 0.1})`;
            ctx.fillRect(x + ox - CELL / 2, y + oy - CELL / 2, CELL, CELL);
          }
          continue;
        }
      }

      // ── Intro masking: if this cell hasn't been revealed yet, skip it ──
      if (cellReveal) {
        const revealTime = cellReveal[idx];
        if (revealTime < 0) continue;  // not activated yet — invisible

        // Cell was activated — compute how far through its settle animation
        const cellAge = (tNow - revealTime) / 1000;
        const settleProgress = Math.min(1, cellAge / INTRO_SETTLE_TIME);

        if (settleProgress < 1) {
          // ── Matrix decode effect on this cell ──
          let displayChar;
          if (settleProgress < 0.65) {
            const cycleIdx = (t * INTRO_CYCLE_SPEED + idx * 0.3) | 0;
            displayChar = Math.random() < 0.35
              ? GLITCH_CHARS[cycleIdx % GLITCH_CHARS.length]
              : CHARS[cycleIdx % CHARS.length];
          } else if (settleProgress < 0.85) {
            displayChar = Math.random() < 0.5
              ? (CHARS[grid[idx]] || '.')
              : GLITCH_CHARS[((t * 30 + idx) | 0) % GLITCH_CHARS.length];
          } else {
            displayChar = CHARS[grid[idx]] || '.';
          }

          // Alpha: sharp pop then flicker
          let alpha;
          if (settleProgress < 0.08) {
            alpha = settleProgress / 0.08;
          } else if (settleProgress < 0.65) {
            alpha = 0.6 + Math.sin(t * 20 + idx) * 0.15;
          } else {
            alpha = 0.7 + settleProgress * 0.3;
          }
          alpha *= b;

          const drawX = x + ox + (doScanline && r === scanlineRow ? scanlineShift : 0);
          const drawY = y + oy;

          // Green → white colour transition
          if (settleProgress < 0.65) {
            const rr = Math.round(30 + settleProgress * 140);
            const gg = Math.round(180 + settleProgress * 75);
            const bb = Math.round(30 + settleProgress * 60);

            if (Math.random() < 0.06) {
              ctx.fillStyle = `rgba(255,255,255,${alpha})`;
            } else {
              ctx.fillStyle = `rgba(${rr},${gg},${bb},${alpha})`;
            }
            ctx.fillText(displayChar, drawX, drawY);

            if (alpha > 0.3) {
              ctx.fillStyle = `rgba(0,255,70,${alpha * 0.08})`;
              ctx.fillRect(drawX - CELL / 2, drawY - CELL / 2, CELL, CELL);
            }
          } else if (settleProgress < 0.95) {
            // Chromatic lock-in flicker
            const lockI = 1 - (settleProgress - 0.85) / 0.15;
            if (lockI > 0.1) {
              const sp = lockI * CELL * 0.4;
              ctx.fillStyle = `rgba(255,40,60,${alpha * 0.25 * lockI})`;
              ctx.fillText(displayChar, drawX - sp, drawY);
              ctx.fillStyle = `rgba(40,120,255,${alpha * 0.25 * lockI})`;
              ctx.fillText(displayChar, drawX + sp, drawY);
            }
            ctx.fillStyle = `rgba(234,234,234,${alpha})`;
            ctx.fillText(displayChar, drawX, drawY);
          } else {
            ctx.fillStyle = `rgba(234,234,234,${alpha})`;
            ctx.fillText(displayChar, drawX, drawY);
          }
          continue;  // skip the normal draw for this cell
        }
        // settleProgress >= 1 → fall through to normal rendering
      }

      // ── Normal rendering (always used post-intro, blends in during intro) ──
      const f = flash[idx];
      let alpha = Math.min(1, b * 1.1 + f * 0.4) * (1 - mInf * 0.3);

      const rowShift    = (gi > 0.05 && glitch.rowShifts[r]) ? glitch.rowShifts[r] : 0;
      const isGlitched  = gi > 0.05 && Math.random() < gi * 0.12;
      const glyph = (flash[idx] > 0.15 && grid[idx] < GLITCH_CHARS.length) || isGlitched
        ? GLITCH_CHARS[grid[idx] % GLITCH_CHARS.length]
        : (CHARS[grid[idx]] || '.');

      const drawX = x + ox + rowShift;
      const drawY = y + oy;

      if (mInf > 0.05) {
        const split   = mInf * CELL * 1.1;
        const jitterX = (Math.random() - 0.5) * mInf * CELL * 0.6;
        const jitterY = (Math.random() - 0.5) * mInf * CELL * 0.4;
        const hoverGlyph = Math.random() < mInf * 0.55
          ? GLITCH_CHARS[(Math.random() * GLITCH_CHARS.length) | 0]
          : glyph;
        ctx.fillStyle = `rgba(255,40,60,${alpha * 0.75})`;
        ctx.fillText(hoverGlyph, drawX - split + jitterX, drawY + jitterY);
        ctx.fillStyle = `rgba(40,120,255,${alpha * 0.75})`;
        ctx.fillText(hoverGlyph, drawX + split + jitterX, drawY + jitterY);
        ctx.fillStyle = `rgba(234,234,234,${alpha})`;
        ctx.fillText(hoverGlyph, drawX, drawY);
      } else if (gi > 0.05) {
        const gSplit = gi * CELL * 0.55;
        ctx.fillStyle = `rgba(255,40,60,${alpha * gi * 0.5})`;
        ctx.fillText(glyph, drawX - gSplit, drawY);
        ctx.fillStyle = `rgba(40,120,255,${alpha * gi * 0.5})`;
        ctx.fillText(glyph, drawX + gSplit, drawY);
        ctx.fillStyle = `rgba(234,234,234,${alpha})`;
        ctx.fillText(glyph, drawX, drawY);
      } else {
        ctx.fillStyle = `rgba(234,234,234,${alpha})`;
        ctx.fillText(glyph, drawX, drawY);
      }
    }
  }

  // ── Horizontal glitch tears during intro ──
  if (introActive && Math.random() < 0.12) {
    const tearY = (Math.random() * H) | 0;
    const tearH = 1 + (Math.random() * 3) | 0;
    ctx.fillStyle = `rgba(255,40,60,0.04)`;
    ctx.fillRect(0, tearY, W, tearH);
  }

  // ── Diagonal ASCII wave ──
  if (!tick._waveState) {
    tick._waveState = { active: false, nextWave: 3 + Math.random() * 2, pos: 0, alpha: 0 };
  }
  const wave = tick._waveState;
  wave.nextWave -= dt;
  if (!wave.active && wave.nextWave <= 0) {
    wave.active = true;
    wave.pos = -0.2;
    wave.alpha = 0;
    wave.speed = 0.3 + Math.random() * 0.2;
    wave.dir = Math.random() > 0.5 ? 1 : -1; // left-to-right or right-to-left
  }
  if (wave.active) {
    wave.pos += wave.speed * dt;
    const bandWidth = 0.15;
    // Fade in quickly, sustain, fade out
    wave.alpha = wave.pos < 0 ? Math.max(0, 1 + wave.pos / 0.1)
      : wave.pos > 1 ? Math.max(0, 1 - (wave.pos - 1) / 0.15) : 1;
    wave.alpha *= 0.3;

    ctx.font = `500 ${Math.max(4, Math.round(CELL * 0.78))}px ${GLYPH_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const waveChars = '01▓▒░█<>/\\|{}[]'.split('');
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // Diagonal position: normalized 0-1 corner to corner
        const diagPos = wave.dir > 0
          ? (c / cols) * 0.5 + (r / rows) * 0.5
          : (1 - c / cols) * 0.5 + (r / rows) * 0.5;
        // Turbulence: offset the wave front per cell using noise
        const turb = fastSin(c * 0.7 + r * 1.3 + t * 0.002) * 0.06
                   + fastSin(r * 0.5 - c * 0.9 + t * 0.003) * 0.04;
        const dist = Math.abs(diagPos + turb - wave.pos);
        if (dist < bandWidth) {
          const intensity = (1 - dist / bandWidth) * wave.alpha;
          if (intensity > 0.01) {
            const wx = c * CELL + CELL / 2;
            const wy = r * CELL + CELL / 2;
            const wch = waveChars[(c * 7 + r * 13 + (t * 0.01 | 0)) % waveChars.length];
            ctx.fillStyle = `rgba(255,255,255,${intensity})`;
            ctx.fillText(wch, wx, wy);
          }
        }
      }
    }
    if (wave.pos > 1.2) {
      wave.active = false;
      wave.nextWave = 3 + Math.random() * 2; // 3-5s until next wave
    }
  }

  // ── Ambient floating characters ──
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < ambientChars.length; i++) {
    const a = ambientChars[i];
    a.age += dt;

    const progress = a.age / a.lifespan;

    // flickery alpha envelope: sharp in, noisy hold, sharp out
    const envelope = progress < 0.15
      ? progress / 0.15
      : progress > 0.75
        ? 1 - (progress - 0.75) / 0.25
        : 1;
    const flicker = Math.abs(Math.sin(t * a.flickerSpeed + i)) > 0.3 ? 1 : 0.4;
    const outroDim = outroActive
      ? Math.max(0, 1 - (tNow - outroStartTime) / (OUTRO_DURATION * 1000))
      : 1;
    a.alpha = a.maxAlpha * envelope * flicker * 0.5 * outroDim; // 50% cap

    // randomly swap character mid-life for glitch feel
    if (Math.random() < 0.04) {
      a.ch = AMBIENT_POOL[(Math.random() * AMBIENT_POOL.length) | 0];
    }

    ctx.font = `${a.size}px ${GLYPH_FONT}`;
    // random RGB tint per character, re-rolled occasionally
    const rnd = Math.sin(i * 127.1 + t * a.flickerSpeed) * 0.5 + 0.5;
    if (rnd < 0.33) {
      // red channel offset
      ctx.fillStyle = `rgba(255,40,60,${a.alpha * 0.7})`;
      ctx.fillText(a.ch, a.x - 1.5, a.y);
      ctx.fillStyle = `rgba(40,255,140,${a.alpha * 0.5})`;
      ctx.fillText(a.ch, a.x + 1.5, a.y + 1);
      ctx.fillStyle = `rgba(234,234,234,${a.alpha})`;
    } else if (rnd < 0.66) {
      // blue/cyan split
      ctx.fillStyle = `rgba(40,120,255,${a.alpha * 0.7})`;
      ctx.fillText(a.ch, a.x + 2, a.y);
      ctx.fillStyle = `rgba(255,40,180,${a.alpha * 0.5})`;
      ctx.fillText(a.ch, a.x - 2, a.y - 1);
      ctx.fillStyle = `rgba(234,234,234,${a.alpha})`;
    } else {
      // pure green matrix flash
      ctx.fillStyle = `rgba(0,255,70,${a.alpha * 0.85})`;
    }
    ctx.fillText(a.ch, a.x, a.y);

    // respawn when lifespan ends
    if (a.age >= a.lifespan) {
      ambientChars[i] = makeAmbientChar();
    }
  }

  heroRafId = requestAnimationFrame(tick);
}

// ── Events ────────────────────────────────────────────────────────────────
window.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  mouse.tx = (e.clientX - rect.left) / rect.width;
  mouse.ty = (e.clientY - rect.top)  / rect.height;
});

window.addEventListener('touchmove', (e) => {
  const touch = e.touches[0]; if (!touch) return;
  const rect = canvas.getBoundingClientRect();
  mouse.tx = (touch.clientX - rect.left) / rect.width;
  mouse.ty = (touch.clientY - rect.top)  / rect.height;
}, { passive: true });

window.addEventListener('touchstart', (e) => {
  const touch = e.touches[0]; if (!touch) return;
  const rect = canvas.getBoundingClientRect();
  mouse.tx = (touch.clientX - rect.left) / rect.width;
  mouse.ty = (touch.clientY - rect.top)  / rect.height;
}, { passive: true });

// Re-run resize on orientation change and visual-viewport resize (mobile)
let resizeTimer;
const scheduleResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 80); };
window.addEventListener('resize', scheduleResize);
window.addEventListener('orientationchange', scheduleResize);
if (window.visualViewport) window.visualViewport.addEventListener('resize', scheduleResize);

// ── Boot ──────────────────────────────────────────────────────────────────
(async function boot() {
  // Pre-init: size canvas and paint the background immediately, before font loading.
  // This ensures the Three.js CanvasTexture sees a properly-sized, non-blank canvas
  // right away rather than the HTML default 300×150 placeholder.
  {
    const hero = canvas.parentElement;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = hero.clientWidth  || window.innerWidth;
    H = hero.clientHeight || window.innerHeight;
    canvas.width  = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);
  }

  try {
    if (document.fonts?.load) {
      const fontTimeout = new Promise(r => setTimeout(r, 3000));
      await Promise.race([
        Promise.all([
          document.fonts.load('italic 700 200px "HouseSansComp"'),
          document.fonts.load('500 14px "JetBrains Mono"'),
          document.fonts.ready,
        ]),
        fontTimeout,
      ]);
    }
  } catch (_) {}

  resize();

  // Watch for hero becoming active/inactive so the RAF loop starts/stops correctly.
  const heroEl = document.getElementById('hero');
  if (heroEl) {
    new MutationObserver(() => {
      if (heroEl.classList.contains('active')) {
        startHeroLoop();
      } else {
        stopHeroLoop();
      }
    }).observe(heroEl, { attributes: true, attributeFilter: ['class'] });
  }

  // Start immediately if hero is the first visible scene.
  if (!heroEl || heroEl.classList.contains('active')) {
    requestAnimationFrame((t) => { tPrev = t; heroRafId = requestAnimationFrame(tick); });
  }
  requestAnimationFrame(() => {
    loader.classList.add('hidden');
    if (window.preloaderDone) window.preloaderDone('hero');
  });
})();
