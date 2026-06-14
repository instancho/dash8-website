(function () {
  const el     = document.getElementById('preloader');
  const canvas = document.getElementById('preloader-canvas');
  if (!el || !canvas) return;
  const ctx = canvas.getContext('2d');

  // ── Loading milestones ─────────────────────────────────────────────────────
  const milestones = {
    fonts:    { done: false, weight: 15 },
    hdri:     { done: false, weight: 30 },
    hero:     { done: false, weight: 25 },
    projects: { done: false, weight: 15 },
    scene:    { done: false, weight: 15 },
  };
  let totalWeight = 0;
  for (const k in milestones) totalWeight += milestones[k].weight;
  let dismissed = false;
  let loadPct = 0;
  let animElapsed = 0;
  const MIN_DISPLAY = 8.0;

  function updateLoad() {
    let loaded = 0;
    for (const k in milestones) {
      if (milestones[k].done) loaded += milestones[k].weight;
    }
    loadPct = loaded / totalWeight;

    if (loadPct >= 1 && !dismissed && animElapsed >= MIN_DISPLAY) {
      dismissed = true;
      // Start camera intro sequence as preloader fades
      if (window._startCameraIntro) window._startCameraIntro();
      setTimeout(() => {
        el.classList.add('done');
        document.body.style.overflow = '';
        setTimeout(() => {
          cancelAnimationFrame(animId);
          bgVid.pause();
          bgVid.remove();
          el.remove();
        }, 900);
      }, 600);
    }
  }

  window.preloaderDone = function (key) {
    if (milestones[key]) {
      milestones[key].done = true;
      updateLoad();
    }
  };

  if (document.fonts?.ready) {
    document.fonts.ready.then(() => window.preloaderDone('fonts'));
    setTimeout(() => window.preloaderDone('fonts'), 3500);
  } else {
    window.preloaderDone('fonts');
  }
  setTimeout(() => window.preloaderDone('scene'), 500);
  document.body.style.overflow = 'hidden';

  // ── Ring config ────────────────────────────────────────────────────────────
  let W, H, DPR, cx, cy;
  const RING_RADIUS   = 210;
  const RING_THICK    = 3;
  const GLOW_THICK    = 12;
  const FILL_DURATION = 8.0;  // seconds to fill the ring
  const BASE_SPEED    = 0.8;  // rotations per second at full fill
  const PI2 = Math.PI * 2;

  // Chrome + VIBGYOR spectrum — metallic base with prismatic color refractions
  const SPECTRUM = [
    { pos: 0.00, r: 100, g: 100, b: 110 },  // dark chrome
    { pos: 0.05, r: 140, g: 50,  b: 180 },  // violet
    { pos: 0.12, r: 70,  g: 60,  b: 220 },  // indigo
    { pos: 0.18, r: 50,  g: 120, b: 255 },  // blue
    { pos: 0.24, r: 180, g: 195, b: 220 },  // chrome bright
    { pos: 0.30, r: 40,  g: 210, b: 200 },  // cyan-green
    { pos: 0.36, r: 60,  g: 220, b: 80  },  // green
    { pos: 0.42, r: 255, g: 252, b: 245 },  // white hotspot
    { pos: 0.48, r: 230, g: 240, b: 50  },  // yellow
    { pos: 0.54, r: 255, g: 180, b: 30  },  // orange
    { pos: 0.60, r: 255, g: 60,  b: 40  },  // red
    { pos: 0.66, r: 200, g: 195, b: 180 },  // warm chrome
    { pos: 0.72, r: 80,  g: 78,  b: 85  },  // deep shadow
    { pos: 0.78, r: 120, g: 125, b: 140 },  // mid steel
    { pos: 0.84, r: 60,  g: 100, b: 200 },  // blue flash
    { pos: 0.90, r: 200, g: 210, b: 225 },  // bright chrome
    { pos: 0.95, r: 150, g: 60,  b: 120 },  // magenta hint
    { pos: 1.00, r: 100, g: 100, b: 110 },  // back to dark chrome
  ];

  function getSpectrumColor(t) {
    t = ((t % 1) + 1) % 1;
    for (let i = 0; i < SPECTRUM.length - 1; i++) {
      if (t >= SPECTRUM[i].pos && t <= SPECTRUM[i + 1].pos) {
        const f = (t - SPECTRUM[i].pos) / (SPECTRUM[i + 1].pos - SPECTRUM[i].pos);
        const a = SPECTRUM[i], b = SPECTRUM[i + 1];
        return [
          a.r + (b.r - a.r) * f,
          a.g + (b.g - a.g) * f,
          a.b + (b.b - a.b) * f,
        ];
      }
    }
    return [180, 40, 255];
  }

  // ── Background ASCII matrix ─────────────────────────────────────────────────
  const BG_CHARS   = '01ABCDEFGHIJKLMNOPQRSTUVWXYZ.:+*#@!~=-<>{}[]|/\\0184729563RTXY';
  const BG_GLITCH  = '▓▒░█▄▀■□▪▫◆◇';
  const BG_CELL    = 10;
  let bgCols, bgRows, bgGrid, bgColors;

  // Pre-built palette of vivid matrix colors
  const BG_PALETTE = [
    [255,255,255], [180,40,255], [70,60,220], [50,120,255],
    [40,210,200],  [60,220,80],  [230,240,50],[255,180,30],
    [255,60,40],   [150,60,120], [60,100,200],[200,210,225],
  ];

  let bgGlitchRows = [], bgGlitchTimer = 0, bgGlitchActive = false, bgGlitchNextAt = 0.5;
  let _bgSeed = 12345;
  function bgRand() { _bgSeed = (_bgSeed * 16807) % 2147483647; return _bgSeed / 2147483647; }

  function resizeBg() {
    bgCols = Math.ceil(W / BG_CELL);
    bgRows = Math.ceil(H / BG_CELL);
    const total = bgCols * bgRows;
    bgGrid   = new Uint8Array(total);
    bgColors = new Uint8Array(total);
    for (let i = 0; i < total; i++) {
      bgGrid[i]   = (Math.random() * BG_CHARS.length) | 0;
      bgColors[i] = (Math.random() * BG_PALETTE.length) | 0;
    }
  }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width  = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    cx = W / 2;
    cy = H / 2;
    resizeBg();
  }

  // ── Logo ────────────────────────────────────────────────────────────────────
  let logoReady = false;
  let logoW = 0, logoH = 0;
  const logoImg = new Image();
  logoImg.src = '/Assets/Dash8studio.png';
  logoImg.onload = function () {
    const maxW = RING_RADIUS * 1.5;
    const scale = maxW / logoImg.width;
    logoW = Math.round(logoImg.width * scale);
    logoH = Math.round(logoImg.height * scale);
    logoReady = true;
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  let startTime = null;
  let animId;

  function render(ts) {
    animId = requestAnimationFrame(render);
    if (!startTime) startTime = ts;
    const elapsed = (ts - startTime) / 1000;
    animElapsed = elapsed;
    if (loadPct >= 1 && !dismissed) updateLoad();

    ctx.filter = 'none';
    ctx.clearRect(0, 0, W, H);

    // Fill progress: 0 → 1 over FILL_DURATION
    const fillT = Math.min(1, elapsed / FILL_DURATION);
    const fillEased = fillT * fillT * (3 - 2 * fillT);

    // ── Background ASCII matrix with chaos + glitch ──────────────────────────
    if (bgCols && bgRows) {
      const dt = Math.min(0.05, 1/60);
      const bgAlpha = 0.12 + fillEased * 0.22;

      // Glitch tear system
      bgGlitchTimer += dt;
      if (!bgGlitchActive && bgGlitchTimer >= bgGlitchNextAt) {
        bgGlitchActive = true;
        bgGlitchRows.length = 0;
        const count = 3 + (Math.random() * 6) | 0;
        for (let g = 0; g < count; g++) {
          const startRow = (Math.random() * bgRows) | 0;
          const h = 1 + (Math.random() * 4) | 0;
          for (let hh = 0; hh < h; hh++) {
            bgGlitchRows.push({
              row: startRow + hh,
              shift: (Math.random() - 0.5) * BG_CELL * 4,
              duration: 0.04 + Math.random() * 0.1,
              elapsed: 0,
            });
          }
        }
      }

      const rowShifts = new Float32Array(bgRows);
      if (bgGlitchActive) {
        let allDone = true;
        _bgSeed = (elapsed * 1000) | 0;
        for (let g = 0; g < bgGlitchRows.length; g++) {
          const gr = bgGlitchRows[g];
          gr.elapsed += dt;
          if (gr.elapsed < gr.duration && gr.row < bgRows) {
            allDone = false;
            rowShifts[gr.row] = gr.shift;
          }
        }
        if (allDone) {
          bgGlitchActive = false;
          bgGlitchTimer = 0;
          bgGlitchNextAt = 0.3 + Math.random() * 0.8;
        }
      }

      // Shuffle characters — more chaos as ring fills
      const shuffleRate = 0.01 + fillEased * 0.06;
      const colorShift = 0.003 + fillEased * 0.015;
      const total = bgCols * bgRows;
      for (let i = 0; i < total; i++) {
        if (Math.random() < shuffleRate) bgGrid[i] = (Math.random() * BG_CHARS.length) | 0;
        if (Math.random() < colorShift)  bgColors[i] = (Math.random() * BG_PALETTE.length) | 0;
      }

      ctx.font = (BG_CELL - 1) + 'px "JetBrains Mono", monospace';
      ctx.textBaseline = 'top';
      let lastStyle = '';

      for (let r = 0; r < bgRows; r++) {
        const xShift = rowShifts[r];
        const isGlitch = xShift !== 0;
        const rOff = r * bgCols;

        for (let c = 0; c < bgCols; c++) {
          const i = rOff + c;
          let ch;
          if (isGlitch && bgRand() < 0.4) {
            ch = BG_GLITCH[(bgRand() * BG_GLITCH.length) | 0];
          } else {
            ch = BG_CHARS[bgGrid[i] % BG_CHARS.length];
          }

          const [pr, pg, pb] = BG_PALETTE[bgColors[i]];
          const brightness = isGlitch ? 1.0 : 0.3 + bgRand() * 0.7;
          const a = brightness * bgAlpha * (isGlitch ? 1.6 : 1);

          const style = 'rgba(' + pr + ',' + pg + ',' + pb + ',' + Math.min(1, a).toFixed(2) + ')';
          if (style !== lastStyle) { ctx.fillStyle = style; lastStyle = style; }
          ctx.fillText(ch, c * BG_CELL + xShift, r * BG_CELL);
        }
      }
    }

    // ── Turbulence — subtle shake on entire scene, synced with rotation speed ─
    const turbStrength = 0.5 + fillEased * 1.5;
    const turbSpeed = 0.15 + fillEased * fillEased * 2.5;
    const shakeX = Math.sin(elapsed * turbSpeed * 3.7) * turbStrength + Math.sin(elapsed * turbSpeed * 7.3) * turbStrength * 0.3;
    const shakeY = Math.cos(elapsed * turbSpeed * 2.9) * turbStrength + Math.cos(elapsed * turbSpeed * 5.1) * turbStrength * 0.3;
    const shakeRot = Math.sin(elapsed * turbSpeed * 1.9) * 0.002 * (0.3 + fillEased);
    ctx.save();
    ctx.translate(cx + shakeX, cy + shakeY);
    ctx.rotate(shakeRot);
    ctx.translate(-cx, -cy);

    // Angular coverage: starts as a tiny spark, grows to full ring
    const coverage = 0.05 + fillEased * 0.95; // 5% → 100% of ring
    const coverageAngle = coverage * PI2;

    // Rotation — starts slow, ramps up exponentially toward the end
    const rotSpeed = BASE_SPEED * (0.15 + fillEased * fillEased * 2.5);
    const rotation = elapsed * rotSpeed * PI2;

    // Number of spectral bands that appear (more as ring fills)
    const bandIntensity = 0.2 + fillEased * 0.8;

    // Pulsing glow — breathes up and down over time
    const breathe = Math.sin(elapsed * 1.2) * 0.3 + 0.7; // 0.4–1.0
    const glowPulse = breathe * (0.5 + fillEased * 0.5);

    // ── Draw dark chrome ring base ─────────────────────────────────────────────
    // Outer bevel — lighter edge
    ctx.beginPath();
    ctx.arc(cx, cy, RING_RADIUS, 0, PI2);
    ctx.lineWidth = RING_THICK + 6;
    ctx.strokeStyle = 'rgba(50,52,58,0.7)';
    ctx.stroke();

    // Main ring body — dark chrome
    ctx.beginPath();
    ctx.arc(cx, cy, RING_RADIUS, 0, PI2);
    ctx.lineWidth = RING_THICK + 2;
    ctx.strokeStyle = 'rgba(28,30,35,0.95)';
    ctx.stroke();

    // Top highlight edge — simulates directional light on metal
    ctx.beginPath();
    ctx.arc(cx, cy, RING_RADIUS, -Math.PI * 0.8, -Math.PI * 0.2);
    ctx.lineWidth = RING_THICK + 3;
    ctx.strokeStyle = 'rgba(70,72,80,0.3)';
    ctx.stroke();

    // ── Draw chromatic reflection segments ────────────────────────────────────
    const segments = 180;
    const segAngle = coverageAngle / segments;

    for (let i = 0; i < segments; i++) {
      const t = i / segments; // 0–1 within the lit portion
      const angle = rotation + t * coverageAngle - coverageAngle / 2;

      // Spectral color at this position
      const [sr, sg, sb] = getSpectrumColor(t * bandIntensity + elapsed * 0.1);

      // Brightness envelope — bright in center, fades at edges
      const edgeDist = Math.abs(t - 0.5) * 2; // 0 at center, 1 at edges
      const envelope = 1 - edgeDist * edgeDist;
      // Hotspot — extra bright concentrated area
      const hotspot = Math.exp(-((t - 0.35) * (t - 0.35)) * 30) * 0.6;
      const brightness = (envelope * 0.7 + hotspot) * bandIntensity;

      if (brightness < 0.01) continue;

      const x1 = cx + Math.cos(angle) * (RING_RADIUS - RING_THICK / 2);
      const y1 = cy + Math.sin(angle) * (RING_RADIUS - RING_THICK / 2);
      const x2 = cx + Math.cos(angle) * (RING_RADIUS + RING_THICK / 2);
      const y2 = cy + Math.sin(angle) * (RING_RADIUS + RING_THICK / 2);

      // Core reflection line
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineWidth = segAngle * RING_RADIUS * 1.2;
      ctx.lineCap = 'round';
      const alpha = brightness * 0.9 * glowPulse;
      ctx.strokeStyle = `rgba(${sr | 0},${sg | 0},${sb | 0},${alpha.toFixed(3)})`;
      ctx.stroke();

      // Outer bloom — very wide, very soft
      if (brightness > 0.08) {
        const bloomAlpha = brightness * 0.08 * glowPulse;
        ctx.beginPath();
        ctx.arc(cx, cy, RING_RADIUS, angle - segAngle * 3, angle + segAngle * 3);
        ctx.lineWidth = GLOW_THICK * 3;
        ctx.strokeStyle = `rgba(${sr | 0},${sg | 0},${sb | 0},${bloomAlpha.toFixed(3)})`;
        ctx.stroke();
      }

      // Mid glow layer
      if (brightness > 0.1) {
        const glowAlpha = brightness * 0.22 * glowPulse;
        ctx.beginPath();
        ctx.arc(cx, cy, RING_RADIUS, angle - segAngle * 1.2, angle + segAngle * 1.2);
        ctx.lineWidth = GLOW_THICK;
        ctx.strokeStyle = `rgba(${sr | 0},${sg | 0},${sb | 0},${glowAlpha.toFixed(3)})`;
        ctx.stroke();
      }

      // Inner tight glow — bright halo hugging the ring
      if (brightness > 0.2) {
        const innerGlowAlpha = brightness * 0.3 * glowPulse;
        ctx.beginPath();
        ctx.arc(cx, cy, RING_RADIUS, angle - segAngle * 0.6, angle + segAngle * 0.6);
        ctx.lineWidth = RING_THICK * 2;
        ctx.strokeStyle = `rgba(${Math.min(255, (sr | 0) + 40)},${Math.min(255, (sg | 0) + 40)},${Math.min(255, (sb | 0) + 40)},${innerGlowAlpha.toFixed(3)})`;
        ctx.stroke();
      }

      // White hotspot overlay — concentrated bright point
      if (hotspot > 0.08) {
        const whiteAlpha = hotspot * brightness * 0.7 * glowPulse;
        ctx.beginPath();
        ctx.arc(cx, cy, RING_RADIUS, angle - segAngle * 0.8, angle + segAngle * 0.8);
        ctx.lineWidth = RING_THICK * 0.8;
        ctx.strokeStyle = `rgba(255,255,255,${whiteAlpha.toFixed(3)})`;
        ctx.stroke();
      }

      // Specular pinpoint — tiny bright core
      if (brightness > 0.5) {
        const specAlpha = (brightness - 0.5) * 0.8 * glowPulse;
        ctx.beginPath();
        ctx.arc(cx, cy, RING_RADIUS, angle - segAngle * 0.2, angle + segAngle * 0.2);
        ctx.lineWidth = RING_THICK * 0.3;
        ctx.strokeStyle = `rgba(255,255,255,${specAlpha.toFixed(3)})`;
        ctx.stroke();
      }
    }

    // ── Soft blur pass — redraw the bright areas with canvas blur for smooth glow ─
    ctx.save();
    ctx.filter = `blur(${4 + glowPulse * 6}px)`;
    ctx.globalAlpha = 0.35 * glowPulse;
    ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, W, H);
    ctx.restore();
    ctx.filter = 'none';

    // ── Metallic sheen — multiple soft travelling highlights ──────────────────
    if (fillEased > 0.15) {
      const sheenBase = (fillEased - 0.15) * 0.15;
      // 5 independent reflections at different speeds/widths
      const sheenConfig = [
        { speed: 1.0, phase: 0,   width: 25, warmth: [220, 225, 235] },
        { speed: 1.5, phase: 1.8, width: 18, warmth: [200, 195, 185] },
        { speed: 0.7, phase: 3.6, width: 30, warmth: [180, 190, 210] },
        { speed: 2.0, phase: 0.9, width: 12, warmth: [240, 238, 230] },
        { speed: 1.2, phase: 4.5, width: 22, warmth: [195, 205, 220] },
      ];
      for (const sc of sheenConfig) {
        const sheenAngle = elapsed * sc.speed + sc.phase;
        for (let i = -sc.width; i <= sc.width; i++) {
          const a = sheenAngle + i * 0.015;
          const falloff = Math.exp(-(i * i) / (sc.width * 2));
          const sa = sheenBase * falloff;
          if (sa < 0.003) continue;
          ctx.beginPath();
          ctx.arc(cx, cy, RING_RADIUS, a, a + 0.025);
          ctx.lineWidth = RING_THICK * 0.6;
          ctx.strokeStyle = `rgba(${sc.warmth[0]},${sc.warmth[1]},${sc.warmth[2]},${sa.toFixed(3)})`;
          ctx.stroke();
          // Glow for sheen
          if (sa > 0.02) {
            ctx.beginPath();
            ctx.arc(cx, cy, RING_RADIUS, a - 0.01, a + 0.035);
            ctx.lineWidth = RING_THICK * 2;
            ctx.strokeStyle = `rgba(${sc.warmth[0]},${sc.warmth[1]},${sc.warmth[2]},${(sa * 0.3).toFixed(3)})`;
            ctx.stroke();
          }
        }
      }
    }

    // ── Ambient reflection on ring surface — subtle environment light ────────
    for (let i = 0; i < 360; i += 3) {
      const a = (i / 180) * Math.PI;
      const envReflect = (Math.sin(a * 2 - elapsed * 0.3) * 0.5 + 0.5) * 0.04 * fillEased;
      if (envReflect < 0.005) continue;
      ctx.beginPath();
      ctx.arc(cx, cy, RING_RADIUS, a, a + 0.06);
      ctx.lineWidth = RING_THICK * 0.7;
      ctx.strokeStyle = `rgba(180,185,195,${envReflect.toFixed(3)})`;
      ctx.stroke();
    }

    // ── Inner disc — matte finish with directional grey gradient ───────────────
    const innerR = RING_RADIUS - RING_THICK / 2 - 1;
    // Directional gradient — lighter top-left, darker bottom-right (simulates soft light)
    const matteGrad = ctx.createLinearGradient(cx - innerR, cy - innerR, cx + innerR, cy + innerR);
    matteGrad.addColorStop(0, 'rgba(38,38,42,0.95)');
    matteGrad.addColorStop(0.3, 'rgba(28,28,32,0.95)');
    matteGrad.addColorStop(0.6, 'rgba(18,18,22,0.95)');
    matteGrad.addColorStop(1, 'rgba(12,12,16,0.95)');
    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, PI2);
    ctx.fillStyle = matteGrad;
    ctx.fill();

    // Subtle radial vignette on top
    const vigGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, innerR);
    vigGrad.addColorStop(0, 'rgba(32,32,36,0.15)');
    vigGrad.addColorStop(0.6, 'rgba(0,0,0,0)');
    vigGrad.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, PI2);
    ctx.fillStyle = vigGrad;
    ctx.fill();

    // Soft inner shadow — rotating opposite to ring
    const shadowAngle = -elapsed * 1.8;
    const shadowOffX = Math.cos(shadowAngle) * innerR * 0.25;
    const shadowOffY = Math.sin(shadowAngle) * innerR * 0.25;
    const shadowGrad = ctx.createRadialGradient(
      cx + shadowOffX, cy + shadowOffY, innerR * 0.3,
      cx, cy, innerR
    );
    shadowGrad.addColorStop(0, 'rgba(0,0,0,0)');
    shadowGrad.addColorStop(0.5, 'rgba(0,0,0,0.12)');
    shadowGrad.addColorStop(0.8, 'rgba(0,0,0,0.3)');
    shadowGrad.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, PI2);
    ctx.fillStyle = shadowGrad;
    ctx.fill();

    // ── Edge highlight on inner disc — rim light ─────────────────────────────
    const rimAlpha = 0.06 + fillEased * 0.08;
    ctx.beginPath();
    ctx.arc(cx, cy, RING_RADIUS - RING_THICK / 2 - 2, 0, PI2);
    ctx.lineWidth = 1;
    ctx.strokeStyle = `rgba(160,165,175,${rimAlpha.toFixed(3)})`;
    ctx.stroke();

    // ── Logo at center ─────────────────────────────────────────────────────────
    if (logoReady) {
      const logoAlpha = Math.min(1, fillEased * 1.5) * glowPulse;
      ctx.save();
      ctx.globalAlpha = logoAlpha;
      ctx.drawImage(logoImg, Math.round(cx - logoW / 2), Math.round(cy - logoH / 2), logoW, logoH);
      ctx.restore();
    }

    ctx.restore(); // end turbulence transform
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  resize();
  window.addEventListener('resize', resize);
  animId = requestAnimationFrame(render);
})();
