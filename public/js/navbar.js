/* =========================================================================
   NAVBAR — full-width ruler timeline design
   Labels are positioned at the center of each section's scroll range.
   Divider ticks mark section boundaries. Blue tick = current scroll pos.
   ========================================================================= */

const GLITCH_POOL  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#%&*+=?/\\|[]{}~';
const RGB_SHADOW   = '-2px 0 rgba(255,30,50,0.85), 2px 0 rgba(30,80,255,0.85)';
const CHAR_STAGGER = 42;
const CYCLE_MS     = 32;

/* ── Glitch scramble ─────────────────────────────────────── */
function scrambleText(el) {
  const original = el.dataset.text;
  if (!original) return;
  const chars = original.split('');
  if (el._cancelGlitch) el._cancelGlitch();

  const t0 = performance.now();
  let rafId, lastCycle = 0;

  el.innerHTML = chars.map(ch =>
    ch === ' '
      ? '<span class="gs"> </span>'
      : `<span class="gs" style="text-shadow:${RGB_SHADOW}">${GLITCH_POOL[Math.random() * GLITCH_POOL.length | 0]}</span>`
  ).join('');

  const spans  = el.querySelectorAll('.gs');
  const lockAt = chars.map((ch, i) => ch === ' ' ? t0 : t0 + i * CHAR_STAGGER);

  function frame(ts) {
    const doCycle = ts - lastCycle >= CYCLE_MS;
    if (doCycle) lastCycle = ts;
    let anyUnlocked = false;
    spans.forEach((span, i) => {
      if (chars[i] === ' ') return;
      if (ts >= lockAt[i]) {
        span.textContent = chars[i];
        span.style.textShadow = '';
      } else {
        if (doCycle) span.textContent = GLITCH_POOL[Math.random() * GLITCH_POOL.length | 0];
        anyUnlocked = true;
      }
    });
    if (anyUnlocked) { rafId = requestAnimationFrame(frame); }
    else { el.textContent = original; }
  }

  rafId = requestAnimationFrame(frame);
  el._cancelGlitch = () => { cancelAnimationFrame(rafId); el.textContent = original; };
}

function attachGlitch(el) {
  el.addEventListener('mouseenter', () => scrambleText(el));
  el.addEventListener('mouseleave', () => { if (el._cancelGlitch) el._cancelGlitch(); });
}

document.querySelectorAll('.nav-cta, .nav-link, .contact-btn, .contact-link').forEach(attachGlitch);

/* Lock natural widths so glitch spans don't cause layout shifts */
function lockGlitchWidths() {
  const els = document.querySelectorAll('.nav-cta, .nav-link');
  els.forEach(el => { el.style.width = ''; el.style.display = ''; });
  requestAnimationFrame(() => {
    els.forEach(el => {
      el.style.width   = el.offsetWidth + 'px';
      el.style.display = 'inline-block';
    });
  });
}

/* ── Section layout config ───────────────────────────────── */
// Label centers: where each label is horizontally anchored (0–1 of ruler width)
// Dividers align exactly with labels so the tall tick sits below its text
const LABEL_FRACS   = [0.125, 0.375, 0.625, 0.875];
const DIVIDER_FRACS = LABEL_FRACS;

const navLinks = Array.from(document.querySelectorAll('.nav-link[data-section]'));
const navCta   = document.querySelector('.nav-cta');

function positionLabels() {
  navLinks.forEach((el, i) => {
    el.style.left = ((LABEL_FRACS[i] ?? 0.5) * 100) + '%';
  });
  if (navCta) {
    navCta.style.left = (LABEL_FRACS[LABEL_FRACS.length - 1] * 100) + '%';
  }
}

positionLabels();

/* ── Active section via IntersectionObserver ─────────────── */
function setActive(id) {
  navLinks.forEach(l => l.classList.toggle('active', l.dataset.section === id));
}

const sectionVisibility = new Map();
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => sectionVisibility.set(e.target.id, e.intersectionRatio));
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

if (navLinks.length) setActive(navLinks[0].dataset.section);

/* ── Ruler canvas ────────────────────────────────────────── */
const rulerCanvas = document.getElementById('navRuler');
const rulerCtx    = rulerCanvas.getContext('2d');
let _navProgress  = 0;
let _prevProgress = 0;
let _scrollVel    = 0;

function drawRuler() {
  const W = rulerCanvas.offsetWidth;
  if (!W) return;
  const H   = rulerCanvas.offsetHeight || 26;
  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  rulerCanvas.width  = Math.round(W * DPR);
  rulerCanvas.height = Math.round(H * DPR);
  rulerCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
  rulerCtx.clearRect(0, 0, W, H);

  const TICK_GAP  = 9;
  const tickCount = Math.floor(W / TICK_GAP) + 1;
  const totalW    = (tickCount - 1) * TICK_GAP;
  const xStart    = (W - totalW) / 2;

  const smallH = 7;
  const bigH   = Math.round(H * 0.75);

  const dividerIndices = DIVIDER_FRACS.map(f => Math.round(f * (tickCount - 1)));
  const dividerSet  = new Set(dividerIndices);
  const progressIdx = Math.round(_navProgress * (tickCount - 1));

  const PYRAMID_RADIUS = 2;

  for (let i = 0; i < tickCount; i++) {
    const x       = xStart + i * TICK_GAP;
    const isPast  = i < progressIdx;
    const isCur   = i === progressIdx;
    const isDiv   = dividerSet.has(i);

    let minDist = Infinity;
    for (let d = 0; d < dividerIndices.length; d++) {
      const dist = Math.abs(i - dividerIndices[d]);
      if (dist < minDist) minDist = dist;
    }

    let h, color;
    const pyramidT = minDist <= PYRAMID_RADIUS ? 1 - minDist / PYRAMID_RADIUS : 0;
    const pyramidH = smallH + pyramidT * (bigH - smallH);

    const SCROLL_POP_RADIUS = 2;
    const scrollDist = Math.abs(i - progressIdx);
    const popT = scrollDist <= SCROLL_POP_RADIUS ? 1 - scrollDist / SCROLL_POP_RADIUS : 0;
    const popBoost = popT * smallH * 0.6;

    if (isDiv) {
      h     = bigH;
      color = isPast ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.28)';
    } else if (pyramidT > 0) {
      h     = pyramidH + popBoost;
      color = isPast ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.15)';
    } else {
      h     = smallH + popBoost;
      color = isPast ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.15)';
    }

    if (isCur) {
      color = '#1C4FE8';
    } else if (popT > 0 && !isDiv) {
      const alpha = isPast ? 0.65 : 0.15 + popT * 0.25;
      color = `rgba(28,79,232,${alpha})`;
    }

    const baseW = 1.5;
    const w = baseW + popT * baseW * 0.5;
    const MAX_SHIFT = 3;
    const dir = Math.max(-1, Math.min(1, _scrollVel * 800));
    const xShift = popT * dir * MAX_SHIFT;
    rulerCtx.fillStyle = color;
    rulerCtx.fillRect(Math.round(x) + xShift - w / 2, H - h, w, h);
  }
}

/* Called by main.js with a 0–1 fraction across the full scroll range */
window.setNavProgress = function (fraction) {
  const clamped = Math.min(1, Math.max(0, fraction));
  const raw = clamped - _navProgress;
  _scrollVel += (raw - _scrollVel) * 0.15;
  _prevProgress = _navProgress;
  _navProgress = clamped;
  drawRuler();
};

/* ── Boot ────────────────────────────────────────────────── */
document.fonts.ready.then(() => {
  positionLabels();
  lockGlitchWidths();
  drawRuler();
});

window.addEventListener('resize', () => {
  positionLabels();
  lockGlitchWidths();
  drawRuler();
});

/* ── Enquiry form submission ────────────────────────── */
const enquiryForm = document.getElementById('enquiry-form');
if (enquiryForm) {
  enquiryForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const messageEl = document.getElementById('enquiry-message');
    const submitBtn = enquiryForm.querySelector('.enquiry-submit');
    const originalText = submitBtn.textContent;

    submitBtn.disabled = true;
    submitBtn.textContent = 'SENDING...';
    messageEl.textContent = '';
    messageEl.className = '';

    const formData = new FormData(enquiryForm);
    try {
      const res = await fetch('https://formspree.io/f/mzdqopnd', {
        method: 'POST',
        body: formData,
        headers: { 'Accept': 'application/json' },
      });

      if (res.ok) {
        messageEl.textContent = 'Message sent successfully!';
        messageEl.classList.add('success');
        enquiryForm.reset();
        setTimeout(() => {
          messageEl.textContent = '';
          messageEl.className = '';
        }, 4000);
      } else {
        throw new Error('Form submission failed');
      }
    } catch (err) {
      messageEl.textContent = 'Error sending message. Try again.';
      messageEl.classList.add('error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  });
}
