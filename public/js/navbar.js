/* =========================================================================
   NAVBAR — glitch hover + active section tracking + scroll-progress dots
   ========================================================================= */

const GLITCH_POOL  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#%&*+=?/\\|[]{}~';
const RGB_SHADOW   = '-2px 0 rgba(255,30,50,0.85), 2px 0 rgba(30,80,255,0.85)';
const CHAR_STAGGER = 42;   // ms between each char locking in left-to-right
const CYCLE_MS     = 32;   // ms between random char swaps (~30fps per char)

/* ── Glitch scramble ─────────────────────────────────────── */
function scrambleText(el) {
  const original = el.dataset.text;
  const chars    = original.split('');
  if (el._cancelGlitch) el._cancelGlitch();

  const t0       = performance.now();
  let   rafId, lastCycle = 0;

  // Replace content with one span per character
  el.innerHTML = chars.map(ch =>
    ch === ' '
      ? '<span class="gs"> </span>'
      : `<span class="gs" style="text-shadow:${RGB_SHADOW}">${GLITCH_POOL[Math.random() * GLITCH_POOL.length | 0]}</span>`
  ).join('');

  const spans     = el.querySelectorAll('.gs');
  // Each char locks in at its stagger offset; space chars lock immediately
  const lockAt    = chars.map((ch, i) => ch === ' ' ? t0 : t0 + i * CHAR_STAGGER);

  function frame(ts) {
    const doCycle = ts - lastCycle >= CYCLE_MS;
    if (doCycle) lastCycle = ts;

    let anyUnlocked = false;
    spans.forEach((span, i) => {
      if (chars[i] === ' ') return;
      if (ts >= lockAt[i]) {
        span.textContent  = chars[i];
        span.style.textShadow = '';
      } else {
        if (doCycle) span.textContent = GLITCH_POOL[Math.random() * GLITCH_POOL.length | 0];
        anyUnlocked = true;
      }
    });

    if (anyUnlocked) {
      rafId = requestAnimationFrame(frame);
    } else {
      el.textContent = original; // collapse spans back to plain text
    }
  }

  rafId = requestAnimationFrame(frame);
  el._cancelGlitch = () => { cancelAnimationFrame(rafId); el.textContent = original; };
}

function attachGlitch(el) {
  el.addEventListener('mouseenter', () => scrambleText(el));
  el.addEventListener('mouseleave', () => { if (el._cancelGlitch) el._cancelGlitch(); });
}

document.querySelectorAll('.nav-cta, .nav-link').forEach(attachGlitch);

/* Lock every glitch element to its natural rendered width so span-based
   scramble never causes a reflow / navbar jitter.                      */
function lockGlitchWidths() {
  const els = document.querySelectorAll('.nav-cta, .nav-link');
  els.forEach(el => { el.style.width = ''; });
  requestAnimationFrame(() => {
    els.forEach(el => {
      el.style.width     = el.offsetWidth + 'px';
      el.style.textAlign = 'center';
      el.style.display   = 'inline-block';
    });
  });
}

document.fonts.ready.then(lockGlitchWidths);
window.addEventListener('resize', lockGlitchWidths);

/* ── Active section via IntersectionObserver ─────────────── */
const navLinks = document.querySelectorAll('.nav-link[data-section]');

function setActive(id) {
  navLinks.forEach(l => {
    l.classList.toggle('active', l.dataset.section === id);
  });
}

const sectionVisibility = new Map();

const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => sectionVisibility.set(e.target.id, e.intersectionRatio));

  // pick the section with the highest visibility ratio
  let best = null, bestRatio = 0;
  sectionVisibility.forEach((ratio, id) => {
    if (ratio > bestRatio) { bestRatio = ratio; best = id; }
  });
  if (best) setActive(best);
}, { threshold: Array.from({ length: 21 }, (_, i) => i / 20) });

navLinks.forEach(l => {
  const sec = document.getElementById(l.dataset.section);
  if (sec) { sectionVisibility.set(sec.id, 0); observer.observe(sec); }
});

// Activate the first visible section on load
if (navLinks.length) setActive(navLinks[0].dataset.section);

/* ── Scroll-progress dot bar ──────────────────────────────── */
const progressBar = document.getElementById('navProgress');

function buildDots() {
  progressBar.innerHTML = '';
  // match dot bar width to the nav-inner width
  const innerW = document.querySelector('.nav-inner').offsetWidth;
  const dotSize = 2, gap = 5;
  const count = Math.max(1, Math.floor(innerW / (dotSize + gap)));
  for (let i = 0; i < count; i++) {
    const d = document.createElement('span');
    d.className = 'nav-dot';
    progressBar.appendChild(d);
  }
}

let _navProgress = 0;

function updateDots() {
  const dots = progressBar.querySelectorAll('.nav-dot');
  if (!dots.length) return;
  const activeDot = Math.round(_navProgress * (dots.length - 1));
  dots.forEach((d, i) => {
    d.className = 'nav-dot';
    if (i < activeDot)        d.classList.add('filled');
    else if (i === activeDot) d.classList.add('active');
  });
}

// Called by scroll-manager with a 0–1 fraction across all sections
window.setNavProgress = function (fraction) {
  _navProgress = Math.min(1, Math.max(0, fraction));
  updateDots();
};

// wait for fonts so nav-inner width is accurate
document.fonts.ready.then(() => { buildDots(); updateDots(); });
window.addEventListener('resize', () => { buildDots(); updateDots(); });
