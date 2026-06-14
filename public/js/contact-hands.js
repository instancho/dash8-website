(function () {
  const BG        = '#22162B';
  const CHARS     = ' .:-=+*#%@';
  const MATRIX_CHARS = '01ABCDEFGHIJKLMNOPQRSTUVWXYZ.:+*#@!~=-<>{}[]|/\\0184729563RTXY'.split('');
  const CELL      = 6;
  const FONT_SIZE = 6;
  const CHARS_LEN = CHARS.length;
  const GLITCH_CHARS = '01▓▒░█▄▀■□';
  const GLITCH_LEN = GLITCH_CHARS.length;

  const contactEl = document.getElementById('contact');
  const canvas    = document.getElementById('contact-ascii-canvas');
  const btn       = document.getElementById('contact-btn');
  if (!contactEl || !canvas || !btn) return;
  const ctx = canvas.getContext('2d', { alpha: false });

  let W, H, DPR, cols, rows, totalCells;
  let animId = null;
  const MAX_DISTANCE = 500;

  let frames = [];
  let allFramesReady = false;
  let currentFrame = 0;
  let targetFrame  = 0;
  const LERP_SPEED = 0.25;

  // Ripple state — triggered when fingers touch (last frame reached)
  let rippleActive = false;
  let rippleTime   = 0;
  let rippleCX     = 0.5; // center in 0–1 coords
  let rippleCY     = 0.5;
  let wasAtEnd     = false;
  const RIPPLE_SPEED    = 1.8;
  const RIPPLE_DURATION = 2.0;
  const RIPPLE_WIDTH    = 0.06;

  // Glitch tear state
  let glitchActive  = false;
  let glitchRows    = [];
  let glitchNextAt  = 2 + Math.random() * 3;
  let glitchTimer   = 0;

  // ── Ambient ASCII matrix grid ───────────────────────────────────────────────
  let matrixGrid = null;
  const MATRIX_SHUFFLE = 0.003;
  const MATRIX_ALPHA_BASE = 0.08;
  let matGlitchActive  = false;
  let matGlitchRows    = [];
  let matGlitchNextAt  = 2 + Math.random() * 3;
  let matGlitchTimer   = 0;

  function initMatrix() {
    matrixGrid = new Uint8Array(totalCells);
    for (let i = 0; i < totalCells; i++) {
      matrixGrid[i] = (Math.random() * MATRIX_CHARS.length) | 0;
    }
  }

  // Seeded PRNG
  let _seed = 1;
  function fastRand() {
    _seed = (_seed * 16807) % 2147483647;
    return _seed / 2147483647;
  }

  const ALPHA_STR = new Array(101);
  for (let i = 0; i <= 100; i++) {
    ALPHA_STR[i] = 'rgba(255,255,255,' + (i / 100).toFixed(2) + ')';
  }

  const LUT_SIZE = 512;
  const sinLUT = new Float32Array(LUT_SIZE);
  for (let i = 0; i < LUT_SIZE; i++) sinLUT[i] = Math.sin((i / LUT_SIZE) * Math.PI * 2);
  function fastSin(x) {
    return sinLUT[(((x / (Math.PI * 2)) % 1 + 1) % 1) * LUT_SIZE | 0];
  }

  let mouseX = -9999, mouseY = -9999;
  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    W   = canvas.clientWidth;
    H   = canvas.clientHeight;
    canvas.width  = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    cols = Math.ceil(W / CELL);
    rows = Math.ceil(H / CELL);
    totalCells = cols * rows;
    initMatrix();
  }

  function extractBrightness(vid, sampCtx) {
    const vw = vid.videoWidth, vh = vid.videoHeight;
    if (!vw || !vh) return null;
    const vidAspect = vw / vh;
    const canAspect = cols / rows;
    let sx, sy, sw, sh;
    if (vidAspect > canAspect) {
      sh = vh; sw = vh * canAspect; sx = (vw - sw) / 2; sy = 0;
    } else {
      sw = vw; sh = vw / canAspect; sx = 0; sy = (vh - sh) / 2;
    }
    sampCtx.drawImage(vid, sx, sy, sw, sh, 0, 0, cols, rows);
    const data = sampCtx.getImageData(0, 0, cols, rows).data;
    // Store R, G, B, brightness per cell
    const frame = new Uint8Array(totalCells * 4);
    for (let i = 0, off = 0; i < totalCells; i++, off += 4) {
      const r = data[off], g = data[off + 1], b = data[off + 2];
      frame[i * 4]     = r;
      frame[i * 4 + 1] = g;
      frame[i * 4 + 2] = b;
      frame[i * 4 + 3] = (r * 77 + g * 150 + b * 29) >> 8;
    }
    return frame;
  }

  // ── Sequential seek extraction — reliable frame-by-frame ───────────────────
  function decodeAllFrames() {
    const vid = document.createElement('video');
    vid.src         = '/Contact/Contact.mp4';
    vid.muted       = true;
    vid.playsInline = true;
    vid.preload     = 'auto';
    vid.crossOrigin = 'anonymous';
    vid.style.cssText = 'position:fixed;opacity:0;pointer-events:none;width:1px;height:1px;z-index:-1';
    document.body.appendChild(vid);

    const sampCanvas = document.createElement('canvas');
    sampCanvas.width  = cols;
    sampCanvas.height = rows;
    const sampCtx = sampCanvas.getContext('2d', { willReadFrequently: true });

    vid.addEventListener('loadeddata', () => {
      const duration = vid.duration;
      const totalFrames = 72;
      const step = duration / (totalFrames - 1);
      let idx = 0;

      function onSeeked() {
        const b = extractBrightness(vid, sampCtx);
        if (b) frames.push(b);
        idx++;
        if (idx < totalFrames) {
          vid.currentTime = Math.min(duration - 0.01, idx * step);
        } else {
          allFramesReady = true;
          vid.removeEventListener('seeked', onSeeked);
          vid.remove();
        }
      }

      vid.addEventListener('seeked', onSeeked);

      // Extract frame 0 directly (seeked won't fire if already at 0)
      const first = extractBrightness(vid, sampCtx);
      if (first) frames.push(first);
      idx = 1;
      if (totalFrames > 1) {
        vid.currentTime = Math.min(duration - 0.01, step);
      } else {
        allFramesReady = true;
      }
    });

    vid.load();
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  let frameCount = 0;

  // The Contact screen sits at camera rotY = -3PI/2. Skip the heavy per-cell draw
  // when the camera isn't facing it (far side of the scene = invisible).
  const CONTACT_ROTY = -Math.PI * 1.5;
  function isFacing() {
    const rotY = window.dash8CamRotY;
    if (rotY === undefined) return true;
    return Math.abs(rotY - CONTACT_ROTY) < 1.3;
  }

  let decodeStarted = false;

  function render() {
    animId = requestAnimationFrame(render);

    if (!isFacing()) return;

    // Kick off frame extraction the first time we approach the section
    if (!decodeStarted) { decodeStarted = true; decodeAllFrames(); }

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);

    // ── Ambient ASCII matrix background ──────────────────────────────────────
    if (matrixGrid) {
      ctx.font = FONT_SIZE + 'px "JetBrains Mono", monospace';
      ctx.textBaseline = 'top';
      frameCount++;
      const matNow = frameCount * 0.016;
      const matDt = 1 / 60;

      // Matrix glitch tear system (independent from video glitch)
      matGlitchTimer += matDt;
      if (!matGlitchActive && matGlitchTimer >= matGlitchNextAt) {
        matGlitchActive = true;
        matGlitchRows.length = 0;
        const count = 3 + (Math.random() * 5) | 0;
        for (let g = 0; g < count; g++) {
          const startRow = (Math.random() * rows) | 0;
          const height = 1 + (Math.random() * 4) | 0;
          for (let h = 0; h < height; h++) {
            matGlitchRows.push({
              row: startRow + h,
              shift: (Math.random() - 0.5) * 22,
              duration: 0.05 + Math.random() * 0.1,
              elapsed: 0,
            });
          }
        }
      }

      const matRowShifts = new Float32Array(rows);
      if (matGlitchActive) {
        let allDone = true;
        for (let g = 0; g < matGlitchRows.length; g++) {
          const gr = matGlitchRows[g];
          gr.elapsed += matDt;
          if (gr.elapsed < gr.duration) {
            allDone = false;
            if (gr.row < rows) matRowShifts[gr.row] = gr.shift;
          }
        }
        if (allDone) {
          matGlitchActive = false;
          matGlitchTimer = 0;
          matGlitchNextAt = 2 + Math.random() * 4;
        }
      }

      for (let r = 0; r < rows; r++) {
        const rowShift = matRowShifts[r];
        const isMatGlitchRow = rowShift !== 0;

        for (let c = 0; c < cols; c++) {
          const i = r * cols + c;

          // Shuffle characters randomly
          if (Math.random() < MATRIX_SHUFFLE) {
            matrixGrid[i] = (Math.random() * MATRIX_CHARS.length) | 0;
          }
          // Glitch rows force extra char swaps
          if (isMatGlitchRow && Math.random() < 0.25) {
            matrixGrid[i] = (Math.random() * MATRIX_CHARS.length) | 0;
          }

          // Wave brightness
          const wave = fastSin(matNow * 0.3 + r * 0.08 + c * 0.05);
          let alpha = MATRIX_ALPHA_BASE + wave * 0.03;

          // Glitch row brightness boost
          if (isMatGlitchRow) alpha = Math.min(0.2, alpha * 2.5);

          // Random flicker
          if (Math.random() < 0.005) alpha *= 0.2 + Math.random() * 0.8;

          if (alpha < 0.02) continue;

          // Turbulence jitter
          const turbX = fastSin(matNow * 1.5 + r * 0.12 + c * 0.1) * 0.5;
          const turbY = fastSin(matNow * 1.1 + c * 0.1 + r * 0.08 + 1.57) * 0.3;

          // RGB channel split on glitch rows
          if (isMatGlitchRow) {
            const a3 = alpha.toFixed(3);
            // Red shifted right
            ctx.fillStyle = 'rgba(255,60,60,' + a3 + ')';
            ctx.fillText(MATRIX_CHARS[matrixGrid[i]], c * CELL + rowShift + turbX + 1.5, r * CELL + turbY);
            // Blue shifted left
            ctx.fillStyle = 'rgba(60,60,255,' + a3 + ')';
            ctx.fillText(MATRIX_CHARS[matrixGrid[i]], c * CELL + rowShift + turbX - 1.5, r * CELL + turbY);
            // Green center
            ctx.fillStyle = 'rgba(60,255,60,' + a3 + ')';
            ctx.fillText(MATRIX_CHARS[matrixGrid[i]], c * CELL + rowShift + turbX, r * CELL + turbY);
          } else {
            ctx.fillStyle = 'rgba(255,255,255,' + alpha.toFixed(3) + ')';
            ctx.fillText(MATRIX_CHARS[matrixGrid[i]], c * CELL + turbX, r * CELL + turbY);
          }
        }
      }
    }

    if (frames.length === 0) return;

    let idxA, idxB, blend;

    if (!allFramesReady) {
      // Show first frame as static while extracting
      idxA = 0; idxB = 0; blend = 0;
    } else {
      const btnRect = btn.getBoundingClientRect();
      const btnCX = btnRect.left + btnRect.width / 2;
      const btnCY = btnRect.top + btnRect.height / 2;
      const dx = mouseX - btnCX;
      const dy = mouseY - btnCY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const proximity = Math.max(0, Math.min(1, 1 - dist / MAX_DISTANCE));
      targetFrame = proximity * (frames.length - 1);

      const diff = targetFrame - currentFrame;
      const step = diff * LERP_SPEED;
      const minStep = 0.8;
      currentFrame += Math.abs(step) < minStep ? Math.sign(diff) * Math.min(minStep, Math.abs(diff)) : step;
      const clamped = Math.max(0, Math.min(frames.length - 1, currentFrame));
      idxA = Math.floor(clamped);
      idxB = Math.min(idxA + 1, frames.length - 1);
      blend = clamped - idxA;

      // Trigger ripple when reaching the last frame
      const atEnd = currentFrame >= frames.length - 20;
      if (atEnd && !wasAtEnd) {
        rippleActive = true;
        rippleTime = 0;
        rippleCX = 0.5;
        rippleCY = 0.5;
      }
      wasAtEnd = atEnd;
    }

    // Advance ripple
    if (rippleActive) {
      rippleTime += 1 / 60;
      if (rippleTime >= RIPPLE_DURATION) rippleActive = false;
    }

    const frameA = frames[idxA];
    const frameB = frames[idxB];

    ctx.font = FONT_SIZE + 'px "JetBrains Mono", monospace';
    ctx.textBaseline = 'top';

    const now = frameCount * 0.016;
    const dt = 1 / 60;
    _seed = frameCount * 73856093;
    let lastStyle = '';

    // ── Glitch tear system ───────────────────────────────────────────────────
    glitchTimer += dt;
    if (!glitchActive && glitchTimer >= glitchNextAt) {
      glitchActive = true;
      glitchRows.length = 0;
      const count = 2 + (Math.random() * 4) | 0;
      for (let g = 0; g < count; g++) {
        const startRow = (Math.random() * rows) | 0;
        const height = 1 + (Math.random() * 3) | 0;
        for (let h = 0; h < height; h++) {
          glitchRows.push({
            row: startRow + h,
            shift: (Math.random() - 0.5) * 18,
            duration: 0.06 + Math.random() * 0.12,
            elapsed: 0,
          });
        }
      }
    }

    const rowShiftArr = new Float32Array(rows);
    if (glitchActive) {
      let allDone = true;
      for (let g = 0; g < glitchRows.length; g++) {
        const gr = glitchRows[g];
        gr.elapsed += dt;
        if (gr.elapsed < gr.duration) {
          allDone = false;
          if (gr.row < rows) rowShiftArr[gr.row] = gr.shift;
        }
      }
      if (allDone) {
        glitchActive = false;
        glitchTimer = 0;
        glitchNextAt = 3 + Math.random() * 5;
      }
    }

    // ── Draw with turbulence, glitch tears, RGB shift, flicker ───────────────
    for (let r = 0; r < rows; r++) {
      const rOffset = r * cols;
      const rowXShift = rowShiftArr[r];
      const isGlitchRow = rowXShift !== 0;

      for (let c = 0; c < cols; c++) {
        const i4 = (rOffset + c) * 4;
        let cr = (frameA[i4]     + (frameB[i4]     - frameA[i4])     * blend) | 0;
        let cg = (frameA[i4 + 1] + (frameB[i4 + 1] - frameA[i4 + 1]) * blend) | 0;
        let cb = (frameA[i4 + 2] + (frameB[i4 + 2] - frameA[i4 + 2]) * blend) | 0;
        const b  = (frameA[i4 + 3] + (frameB[i4 + 3] - frameA[i4 + 3]) * blend) | 0;

        const charIdx = (b * CHARS_LEN) >> 8;
        let ch;

        if (isGlitchRow && fastRand() < 0.3) {
          ch = GLITCH_CHARS[(fastRand() * GLITCH_LEN) | 0];
        } else if (fastRand() < 0.003) {
          ch = GLITCH_CHARS[(fastRand() * GLITCH_LEN) | 0];
        } else {
          ch = CHARS[charIdx];
        }
        if (ch === ' ') continue;

        let turbX = fastSin(now * 1.3 + r * 0.11 + c * 0.08) * 0.6;
        let turbY = fastSin(now * 1.7 + c * 0.09 + r * 0.06 + 1.57) * 0.4;

        let alpha = 0.3 + (b / 255) * 0.7;

        // Ripple effect — expanding ring from center
        if (rippleActive) {
          const nx = c / cols - rippleCX;
          const ny = r / rows - rippleCY;
          const cellDist = Math.sqrt(nx * nx + ny * ny);
          const rippleRadius = rippleTime * RIPPLE_SPEED;
          const ringDist = Math.abs(cellDist - rippleRadius);
          if (ringDist < RIPPLE_WIDTH) {
            const rippleStrength = (1 - ringDist / RIPPLE_WIDTH) * Math.max(0, 1 - rippleTime / RIPPLE_DURATION);
            // Push cells outward from center
            const angle = Math.atan2(ny, nx);
            turbX += Math.cos(angle) * rippleStrength * 4;
            turbY += Math.sin(angle) * rippleStrength * 4;
            // Brightness flash on ring
            alpha = Math.min(1, alpha + rippleStrength * 0.5);
            // Swap some chars to glitch on the ring
            if (rippleStrength > 0.3 && fastRand() < 0.4) {
              ch = GLITCH_CHARS[(fastRand() * GLITCH_LEN) | 0];
            }
          }
        }

        // Subtle random flicker
        if (fastRand() < 0.008) alpha *= 0.3 + fastRand() * 0.7;

        // Glitch row: brightness boost + RGB channel shift
        if (isGlitchRow) {
          alpha = Math.min(1, alpha * 1.4);
          // RGB shift — offset channels for chromatic aberration
          const shiftAmt = 2;
          const cLeft  = Math.max(0, c - shiftAmt);
          const cRight = Math.min(cols - 1, c + shiftAmt);
          const iR = (rOffset + cRight) * 4;
          const iB = (rOffset + cLeft) * 4;
          cr = (frameA[iR]     + (frameB[iR]     - frameA[iR])     * blend) | 0;
          cb = (frameA[iB + 2] + (frameB[iB + 2] - frameA[iB + 2]) * blend) | 0;
        }

        const style = 'rgba(' + cr + ',' + cg + ',' + cb + ',' + alpha.toFixed(2) + ')';
        if (style !== lastStyle) {
          ctx.fillStyle = style;
          lastStyle = style;
        }
        ctx.fillText(ch, c * CELL + rowXShift + turbX, r * CELL + turbY);
      }
    }
  }

  resize();
  window.addEventListener('resize', resize);
  // Frame extraction is deferred to the first time the Contact screen faces the
  // camera (see render gate) so it doesn't compete with first paint.
  animId = requestAnimationFrame(render);
})();
