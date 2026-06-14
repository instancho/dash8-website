/* =========================================================================
   PROJECTS BG — Ambient ASCII matrix background for the Projects section.
   Orange/amber palette, flowing brightness waves, diagonal sweep, mouse repel.
   Mirrors char-cloud.js structure but no text masking — full ambient coverage.
   ========================================================================= */
(function () {
  const BG    = '#e3b23c';
  const CHARS = '01ABCDEFGHIJKLMNOPQRSTUVWXYZ.:+*#@!~=-<>{}[]|/\\0184729563RTXY'.split('');

  const CELL = 12;

  function noise2(x, y, t) {
    const s = Math.sin(x * 12.9898 + y * 78.233 + t * 1.1) * 43758.5453;
    return s - Math.floor(s);
  }

  const canvas = document.getElementById('projects-canvas');
  const ctx    = canvas.getContext('2d');

  let W, H, DPR, cols, rows;
  let grid, flash;

  // ── Glitch state ─────────────────────────────────────────────────────────
  const glitch = { active: false, intensity: 0, nextAt: 4 + Math.random() * 5, rowShifts: [] };
  const GLITCH_CHARS = '01▓▒░█▄▀■□▪▫'.split('');

  function resize() {
    const section = canvas.parentElement;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W   = section.clientWidth  || window.innerWidth;
    H   = section.clientHeight || window.innerHeight;
    canvas.width  = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    cols = Math.ceil(W / CELL) + 1;
    rows = Math.ceil(H / CELL) + 1;
    grid  = new Uint8Array(cols * rows);
    flash = new Float32Array(cols * rows);
    for (let i = 0; i < grid.length; i++) grid[i] = (Math.random() * CHARS.length) | 0;
    glitch.rowShifts = Array.from({ length: rows }, () => 0);
  }

  let tPrev = 0;

  // The Projects screen sits at camera rotY = -PI. Skip heavy drawing when the
  // camera isn't facing it (far side of the scene = invisible).
  function projFacing() {
    const rotY = window.dash8CamRotY;
    if (rotY === undefined) return true;
    return Math.abs(rotY + Math.PI) < 1.3;
  }

  function tick(tNow) {
    requestAnimationFrame(tick);
    if (tNow - tPrev < 32) return;          // cap at ~30 fps
    if (!projFacing()) { tPrev = tNow; return; }
    const dt = Math.min(0.05, (tNow - tPrev) / 1000);
    tPrev = tNow;
    const t = tNow / 1000;

    const glyphSize   = Math.max(4, Math.round(CELL * 0.82));
    const shuffleChance = 0.003;

    // ── Global glitch timer ──
    glitch.nextAt -= dt;
    if (glitch.nextAt <= 0 && !glitch.active) {
      glitch.active    = true;
      glitch.intensity = 0.5 + Math.random() * 0.5;
      glitch.rowShifts = Array.from({ length: rows }, () =>
        Math.random() < 0.2 ? (Math.random() - 0.5) * CELL * glitch.intensity * 5 : 0
      );
      setTimeout(() => { glitch.active = false; }, 50 + Math.random() * 110);
      glitch.nextAt = 4 + Math.random() * 6;
    }
    if (!glitch.active && glitch.intensity > 0) glitch.intensity *= 0.7;
    const gi = glitch.intensity;

    // ── Clear ──
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);

    // ── Character grid ──
    ctx.font         = `500 ${glyphSize}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    for (let r = 0; r < rows; r++) {
      const rowShift = gi > 0.05 ? glitch.rowShifts[r] || 0 : 0;

      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const x   = c * CELL + CELL / 2;
        const y   = r * CELL + CELL / 2;

        const nx = x + rowShift;

        // Brightness: one noise call per cell (removed displacement noise calls)
        const b = 0.28 + noise2(c * 0.4, r * 0.4, t * 0.08) * 0.22;

        flash[idx] *= 0.55;

        if (Math.random() < shuffleChance) {
          grid[idx] = (gi > 0.1 && Math.random() < gi * 0.2)
            ? (Math.random() * GLITCH_CHARS.length) | 0 + CHARS.length
            : (Math.random() * CHARS.length) | 0;
        }

        // Global glitch corruption
        if (gi > 0.05 && Math.random() < gi * 0.15) {
          grid[idx] = (Math.random() * CHARS.length) | 0;
          flash[idx] = Math.max(flash[idx], gi * 0.65);
        }

        const totalB = Math.min(1, b + flash[idx]);
        if (totalB < 0.1) continue;

        const charPool = grid[idx] < CHARS.length ? CHARS : GLITCH_CHARS;
        const charIdx  = grid[idx] < CHARS.length ? grid[idx] : grid[idx] - CHARS.length;
        const ch = (charPool[charIdx]) || '.';

        ctx.fillStyle = `rgba(0,0,0,${(0.1 + totalB * 0.75) * 0.5})`;
        ctx.fillText(ch, nx, y);
      }
    }

    // ── Diagonal ASCII wave ──────────────────────────────────────────────
    if (!tick._wave) {
      tick._wave = { active: false, next: 2.5 + Math.random() * 2.5, pos: 0, speed: 0.3, dir: 1 };
    }
    const wv = tick._wave;
    wv.next -= dt;
    if (!wv.active && wv.next <= 0) {
      wv.active = true;
      wv.pos    = -0.15;
      wv.speed  = 0.28 + Math.random() * 0.18;
      wv.dir    = Math.random() > 0.5 ? 1 : -1;
    }
    if (wv.active) {
      wv.pos += wv.speed * dt;
      const bandWidth = 0.055;
      const wAlpha = (wv.pos < 0 ? Math.max(0, 1 + wv.pos / 0.1)
        : wv.pos > 1 ? Math.max(0, 1 - (wv.pos - 1) / 0.12) : 1) * 0.45;
      const waveChars = '01▓▒░█<>/\\|{}[]'.split('');
      ctx.font         = `500 ${glyphSize}px "JetBrains Mono", ui-monospace, monospace`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const diagPos = wv.dir > 0
            ? (c / cols + (rows - r) / rows * 0.5)
            : (1 - c / cols + (rows - r) / rows * 0.5);
          const turb = (noise2(c * 0.5, r * 0.5, t * 2) - 0.5) * 0.055;
          const dist = Math.abs(diagPos + turb - wv.pos);
          if (dist < bandWidth) {
            const intensity = (1 - dist / bandWidth) * wAlpha;
            const wch = waveChars[(c * 7 + r * 13 + (t * 20 | 0)) % waveChars.length];
            ctx.fillStyle = `rgba(0, 0, 0, ${intensity})`;
            ctx.fillText(wch, c * CELL + CELL / 2, r * CELL + CELL / 2);
          }
        }
      }
      if (wv.pos > 1.2) { wv.active = false; wv.next = 2.5 + Math.random() * 2.5; }
    }

    // ── Diagonal card grid preview — visible on 3D screen from outside ─────
    // Fades out as camera zooms in (HTML overlay replaces it)
    {
      const zoom    = window.projectsZoom || 0;
      const showT   = 15;
      const fullT   = 24;
      const cardAlpha = zoom < showT ? 1 : Math.max(0, 1 - (zoom - showT) / (fullT - showT));

      if (cardAlpha > 0) {
        ctx.save();
        ctx.globalAlpha = cardAlpha;

        const cx = W / 2;
        const cy = H / 2;
        ctx.translate(cx, cy);
        ctx.rotate(-18 * Math.PI / 180);

        const cardW = Math.round(W * 0.22);
        const cardH = Math.round(cardW * 0.71);
        const tabH  = Math.round(cardH * 0.12);
        const gap   = Math.round(cardW * 0.11);
        const gridCols = 4;
        const gridRows = 5;
        const totalW = gridCols * cardW + (gridCols - 1) * gap;
        const totalH = gridRows * (cardH + tabH) + (gridRows - 1) * gap;
        const ox = -totalW / 2;
        const oy = -totalH / 2;

        for (let row = 0; row < gridRows; row++) {
          for (let col = 0; col < gridCols; col++) {
            const x = ox + col * (cardW + gap);
            const y = oy + row * (cardH + tabH + gap);
            const r = Math.max(3, Math.round(cardW * 0.03));
            const tabW = Math.round(cardW * 0.35);
            const tabR = Math.max(2, Math.round(r * 0.7));

            // Tab
            ctx.fillStyle = '#0c0c0c';
            ctx.beginPath();
            ctx.roundRect(x, y, tabW, tabH, [tabR, tabR, 0, 0]);
            ctx.fill();

            // Tab label
            const numSz = Math.max(5, Math.round(tabH * 0.5));
            ctx.fillStyle = 'rgba(227,178,60,0.6)';
            ctx.font = `500 ${numSz}px "JetBrains Mono",monospace`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            const projIdx = (row * gridCols + col) % 8 + 1;
            ctx.fillText('/ PROJECT ' + projIdx, x + 4, y + tabH / 2);

            // Card body
            ctx.fillStyle = '#0c0c0c';
            ctx.beginPath();
            ctx.roundRect(x, y + tabH, cardW, cardH, [0, r, r, r]);
            ctx.fill();

            ctx.strokeStyle = 'rgba(255,255,255,0.06)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(x + 0.5, y + tabH + 0.5, cardW - 1, cardH - 1, [0, r, r, r]);
            ctx.stroke();
          }
        }

        ctx.restore();
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
      }
    }
  }

  // ── Events ──────────────────────────────────────────────────────────────
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 80);
  });

  // ── Boot: pre-init canvas size + fill immediately ──────────────────────
  {
    const section = canvas.parentElement;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W   = section.clientWidth  || window.innerWidth;
    H   = section.clientHeight || window.innerHeight;
    canvas.width  = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);
  }

  resize();
  requestAnimationFrame((t) => { tPrev = t; requestAnimationFrame(tick); });
})();
