(function () {
  const COLORS    = ['#F3305D', '#EEFF52', '#54BA5B', '#05299E'];
  const CHAR_DARK = [false, true, false, false];
  const VIDEO_SRC = ['/About Us/Vid1.mp4', '/About Us/Vid2.mp4', '/About Us/Vid3.mp4', '/About Us/Vid4.mp4'];
  const CHARS      = ' .:-=+*#%@';
  const GLITCH_CHARS = '01▓▒░█▄▀■□';
  const CELL       = 7;
  const FONT_SIZE  = 7;
  const CHARS_LEN  = CHARS.length;
  const GLITCH_LEN = GLITCH_CHARS.length;

  const cards   = document.querySelectorAll('.service-card');
  const aboutEl = document.getElementById('about');
  const canvas  = document.getElementById('about-ascii-canvas');
  if (!cards.length || !aboutEl || !canvas) return;
  const ctx = canvas.getContext('2d', { alpha: false });

  // Pre-compute RGB values for colors to avoid parsing hex every frame
  const COLORS_RGB = COLORS.map(hex => {
    const v = parseInt(hex.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  });

  // ── State ──────────────────────────────────────────────────────────────────
  let W, H, DPR;
  let cols, rows, totalCells;
  let animId    = null;
  let isVisible = false;
  let needsRender = true;

  let scrollPos    = 0;
  let targetPos    = 0;
  const SCROLL_SENSITIVITY = 0.003;
  const SNAP_SPEED = 0.08;
  let snapping     = false;
  let snapTimer    = null;
  const SNAP_DELAY = 300;

  let dissolveMask = null;
  let activeCard = 0;

  // ── Glitch state ───────────────────────────────────────────────────────────
  let glitchActive   = false;
  let glitchRows     = [];
  let glitchNextAt   = 2 + Math.random() * 3;
  let glitchTimer    = 0;
  let frameCount = 0;

  // ── Pre-computed sin/cos LUT for turbulence ────────────────────────────────
  const LUT_SIZE = 512;
  const sinLUT = new Float32Array(LUT_SIZE);
  const cosLUT = new Float32Array(LUT_SIZE);
  for (let i = 0; i < LUT_SIZE; i++) {
    sinLUT[i] = Math.sin((i / LUT_SIZE) * Math.PI * 2);
    cosLUT[i] = Math.cos((i / LUT_SIZE) * Math.PI * 2);
  }
  function fastSin(x) {
    const idx = (((x / (Math.PI * 2)) % 1 + 1) % 1) * LUT_SIZE;
    return sinLUT[idx | 0];
  }
  function fastCos(x) {
    const idx = (((x / (Math.PI * 2)) % 1 + 1) % 1) * LUT_SIZE;
    return cosLUT[idx | 0];
  }

  // ── Pre-computed alpha strings to avoid string concat per cell ─────────────
  const ALPHA_WHITE = new Array(101);
  const ALPHA_BLACK = new Array(101);
  for (let i = 0; i <= 100; i++) {
    const a = (i / 100).toFixed(2);
    ALPHA_WHITE[i] = 'rgba(255,255,255,' + a + ')';
    ALPHA_BLACK[i] = 'rgba(0,0,0,' + a + ')';
  }

  // ── Seeded PRNG — deterministic per-frame noise without Math.random() spam
  let _seed = 1;
  function fastRand() {
    _seed = (_seed * 16807 + 0) % 2147483647;
    return _seed / 2147483647;
  }

  // ── Video elements ─────────────────────────────────────────────────────────
  const videos   = [];
  const samplers = [];
  const sampCtxs = [];

  for (let i = 0; i < VIDEO_SRC.length; i++) {
    const vid = document.createElement('video');
    vid.muted       = true;
    vid.loop        = true;
    vid.playsInline = true;
    vid.preload     = 'none';   // defer download until the section is approached
    vid.crossOrigin = 'anonymous';
    vid._src        = VIDEO_SRC[i];  // real src attached lazily
    videos.push(vid);

    const sc  = document.createElement('canvas');
    const scx = sc.getContext('2d', { willReadFrequently: true });
    samplers.push(sc);
    sampCtxs.push(scx);
  }

  // ── Sizing ─────────────────────────────────────────────────────────────────
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

    for (let i = 0; i < samplers.length; i++) {
      samplers[i].width  = cols;
      samplers[i].height = rows;
    }

    rebuildDissolveMask();
    needsRender = true;
  }

  function rebuildDissolveMask() {
    dissolveMask = new Float32Array(totalCells);
    for (let i = 0; i < totalCells; i++) dissolveMask[i] = Math.random();
  }

  // ── Video sampling ─────────────────────────────────────────────────────────
  function sampleVideo(idx) {
    if (idx < 0 || idx >= videos.length) return false;
    const vid = videos[idx];
    if (!vid || vid.readyState < 2) return false;
    const vw = vid.videoWidth, vh = vid.videoHeight;
    if (!vw || !vh) return false;
    const vidAspect = vw / vh;
    const canAspect = cols / rows;
    let sx, sy, sw, sh;
    if (vidAspect > canAspect) {
      sh = vh; sw = vh * canAspect; sx = (vw - sw) / 2; sy = 0;
    } else {
      sw = vw; sh = vw / canAspect; sx = 0; sy = (vh - sh) / 2;
    }
    sampCtxs[idx].drawImage(vid, sx, sy, sw, sh, 0, 0, cols, rows);
    return true;
  }

  // Reuse typed array for brightness to avoid GC pressure
  let brightnessPool = [null, null];

  function getBrightness(idx, poolIdx) {
    const data = sampCtxs[idx].getImageData(0, 0, cols, rows).data;
    let out = brightnessPool[poolIdx];
    if (!out || out.length !== totalCells) {
      out = new Float32Array(totalCells);
      brightnessPool[poolIdx] = out;
    }
    for (let i = 0, off = 0; i < totalCells; i++, off += 4) {
      out[i] = (data[off] * 77 + data[off + 1] * 150 + data[off + 2] * 29) >> 8;
      // out[i] is 0–255 integer, we'll use it directly
    }
    return out;
  }

  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) * (-2 * t + 2) / 2;
  }

  // ── Card visibility ────────────────────────────────────────────────────────
  function updateCards() {
    const nearest = Math.round(scrollPos);
    if (nearest === activeCard) return;

    const direction = nearest > activeCard ? 'down' : 'up';
    cards[activeCard].classList.remove('active', 'exit-up');
    if (direction === 'up') cards[activeCard].classList.add('exit-up');

    cards[nearest].classList.remove('exit-up');
    cards[nearest].classList.add('active');

    activeCard = nearest;
  }

  function ensureLoaded(i) {
    const v = videos[i];
    if (!v.src && v._src) { v.src = v._src; v.load(); }
  }

  function updateVideoPlayback() {
    const floor = Math.floor(scrollPos);
    const ceil  = Math.min(floor + 1, videos.length - 1);
    for (let i = 0; i < videos.length; i++) {
      if (i === floor || i === ceil) {
        ensureLoaded(i);
        if (videos[i].paused) videos[i].play().catch(() => {});
      } else {
        videos[i].pause();
      }
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  // The About screen sits at camera rotY = -PI/2. Only render the heavy ASCII
  // when the camera is roughly facing it (within ~74°); otherwise the canvas is
  // invisible (far side of the scene) and rendering is pure waste.
  const ABOUT_ROTY = -Math.PI * 0.5;
  let wasFacing = true;
  function isFacing() {
    const rotY = window.dash8CamRotY;
    if (rotY === undefined) return true; // before main.js initialises, render anyway
    return Math.abs(rotY - ABOUT_ROTY) < 1.3;
  }

  function render() {
    animId = requestAnimationFrame(render);

    const facing = isFacing();

    // Pause all heavy work + video decode when the screen isn't facing the camera
    if (!facing) {
      if (wasFacing) {
        for (let i = 0; i < videos.length; i++) videos[i].pause();
        wasFacing = false;
      }
      return;
    }
    if (!wasFacing) {            // just came back into view
      updateVideoPlayback();
      wasFacing = true;
    }

    if (snapping) {
      scrollPos += (targetPos - scrollPos) * SNAP_SPEED;
      if (Math.abs(scrollPos - targetPos) < 0.005) {
        scrollPos = targetPos;
        snapping = false;
      }
      updateCards();
      updateVideoPlayback();
      updateNavButtons();
      needsRender = true;
    }

    // Skip heavy rendering if nothing changed and not playing video
    const currentVidPlaying = videos[Math.floor(scrollPos)] && !videos[Math.floor(scrollPos)].paused;
    if (!needsRender && !currentVidPlaying && !snapping) return;

    const floor = Math.floor(scrollPos);
    const ceil  = Math.min(floor + 1, COLORS.length - 1);
    const frac  = scrollPos - floor;

    // Background color — lerp using pre-computed RGB
    const ca = COLORS_RGB[floor], cb = COLORS_RGB[ceil];
    if (frac < 0.001) {
      ctx.fillStyle = COLORS[floor];
    } else {
      const r = (ca[0] + (cb[0] - ca[0]) * frac) | 0;
      const g = (ca[1] + (cb[1] - ca[1]) * frac) | 0;
      const bl = (ca[2] + (cb[2] - ca[2]) * frac) | 0;
      ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + bl + ')';
    }
    ctx.fillRect(0, 0, W, H);

    const hasFloor = sampleVideo(floor);
    const hasCeil  = (ceil !== floor) ? sampleVideo(ceil) : false;

    if (!hasFloor && !hasCeil) return;

    // Use pool indices to avoid allocating new arrays
    const brightnessA = hasFloor ? getBrightness(floor, 0) : null;
    const brightnessB = hasCeil  ? getBrightness(ceil, 1)  : null;

    ctx.font = FONT_SIZE + 'px "JetBrains Mono", monospace';
    ctx.textBaseline = 'top';

    const eased = easeInOut(frac);
    const dt = 1 / 60;
    frameCount++;
    _seed = frameCount * 73856093; // reset PRNG seed per frame for consistency

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

    // Build row-shift lookup as typed array instead of object
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

    // ── Batch draw — group by fillStyle to minimize state changes ─────────
    const now = frameCount * 0.016;
    const dissolving = brightnessA && brightnessB && frac > 0.001;

    // We'll batch by dark/light and approximate alpha bucket
    let lastStyle = '';

    for (let r = 0; r < rows; r++) {
      const rowXShift = rowShiftArr[r];
      const isGlitchRow = rowXShift !== 0;
      const rOffset = r * cols;

      for (let c = 0; c < cols; c++) {
        const i = rOffset + c;
        let b, cellSource;

        if (dissolving) {
          const fromA = dissolveMask[i] > eased;
          b = fromA ? brightnessA[i] : brightnessB[i];
          cellSource = fromA ? floor : ceil;
        } else if (brightnessA) {
          b = brightnessA[i];
          cellSource = floor;
        } else {
          b = brightnessB[i];
          cellSource = ceil;
        }

        // b is 0–255 here
        const charIdx = (b * CHARS_LEN) >> 8;
        let ch;

        if (isGlitchRow) {
          ch = fastRand() < 0.3
            ? GLITCH_CHARS[(fastRand() * GLITCH_LEN) | 0]
            : CHARS[charIdx];
        } else if (fastRand() < 0.003) {
          ch = GLITCH_CHARS[(fastRand() * GLITCH_LEN) | 0];
        } else {
          ch = CHARS[charIdx];
        }
        if (ch === ' ') continue;

        const turbX = fastSin(now * 1.7 + r * 0.13 + c * 0.09) * 0.6;
        const turbY = fastCos(now * 1.3 + c * 0.11 + r * 0.07) * 0.4;

        // Alpha: map b (0–255) to 0.3–1.0 range
        let alphaInt = (30 + ((b * 70) >> 8)) | 0;

        if (fastRand() < 0.008) alphaInt = (alphaInt * (30 + (fastRand() * 70) | 0) / 100) | 0;
        if (isGlitchRow) alphaInt = Math.min(100, (alphaInt * 1.4) | 0);

        const style = CHAR_DARK[cellSource] ? ALPHA_BLACK[alphaInt] : ALPHA_WHITE[alphaInt];
        if (style !== lastStyle) {
          ctx.fillStyle = style;
          lastStyle = style;
        }
        ctx.fillText(ch, c * CELL + rowXShift + turbX, r * CELL + turbY);
      }
    }

    needsRender = false;
  }

  // ── Start / stop ───────────────────────────────────────────────────────────
  function start() {
    if (isVisible) return;
    isVisible = true;
    updateVideoPlayback();
    needsRender = true;
  }

  function stop() {
    isVisible = false;
  }

  const mo = new MutationObserver(() => {
    if (aboutEl.classList.contains('active')) start();
    else stop();
  });
  mo.observe(aboutEl, { attributes: true, attributeFilter: ['class'] });

  // ── Arrow navigation ────────────────────────────────────────────────────────
  const prevBtn = document.getElementById('service-prev');
  const nextBtn = document.getElementById('service-next');

  function updateNavButtons() {
    if (prevBtn) prevBtn.classList.toggle('hidden', Math.round(scrollPos) <= 0);
    if (nextBtn) nextBtn.classList.toggle('hidden', Math.round(scrollPos) >= cards.length - 1);
  }

  function navigateTo(idx) {
    if (idx < 0 || idx >= cards.length) return;
    rebuildDissolveMask();
    targetPos = idx;
    snapping = true;
    needsRender = true;
    updateCards();
    updateVideoPlayback();
    updateNavButtons();
  }

  if (prevBtn) prevBtn.addEventListener('click', () => navigateTo(Math.round(scrollPos) - 1));
  if (nextBtn) nextBtn.addEventListener('click', () => navigateTo(Math.round(scrollPos) + 1));

  // ── Wheel scroll ───────────────────────────────────────────────────────────
  cards[0].classList.add('active');
  updateNavButtons();

  aboutEl.addEventListener('wheel', function (e) {
    if (!aboutEl.classList.contains('active')) return;

    const next = scrollPos + e.deltaY * SCROLL_SENSITIVITY;
    const clamped = Math.max(0, Math.min(cards.length - 1, next));

    if ((e.deltaY > 0 && scrollPos >= cards.length - 1) ||
        (e.deltaY < 0 && scrollPos <= 0)) return;

    e.preventDefault();
    e.stopPropagation();

    const prevFloor = Math.floor(scrollPos);
    scrollPos = clamped;
    snapping = false;
    needsRender = true;

    updateCards();
    updateVideoPlayback();
    updateNavButtons();

    if (Math.floor(scrollPos) !== prevFloor) rebuildDissolveMask();

    clearTimeout(snapTimer);
    snapTimer = setTimeout(() => {
      targetPos = Math.round(scrollPos);
      snapping = true;
    }, SNAP_DELAY);
  }, { passive: false });

  // ── Position based on approach direction ────────────────────────────────────
  function setToStart() {
    cards.forEach(c => c.classList.remove('active', 'exit-up'));
    cards[0].classList.add('active');
    scrollPos  = 0;
    targetPos  = 0;
    activeCard = 0;
    snapping   = false;
    needsRender = true;
    updateVideoPlayback();
    updateNavButtons();
  }

  function setToEnd() {
    cards.forEach(c => c.classList.remove('active', 'exit-up'));
    cards[cards.length - 1].classList.add('active');
    scrollPos  = cards.length - 1;
    targetPos  = cards.length - 1;
    activeCard = cards.length - 1;
    snapping   = false;
    needsRender = true;
    updateVideoPlayback();
    updateNavButtons();
  }

  window._aboutServicesEnter = function (direction) {
    if (direction === 'backward') setToEnd();
    else setToStart();
  };

  window._aboutServicesReset = function () {
    setToStart();
  };

  window._aboutScrollFraction = function () {
    return scrollPos / (cards.length - 1);
  };

  // ── Build card bodies from services-data.js (Google Sheet backend) ──────────
  function buildServiceCards(services) {
    cards.forEach((card, i) => {
      card.innerHTML = '';
      const data = services && services[i];
      if (!data) return;

      const inner = document.createElement('div');
      inner.className = 'service-inner';
      inner.style.setProperty('--svc-accent', COLORS[i] || '#F3305D');

      // Header card — title + divider + subtext
      if (data.title || data.subtext) {
        const head = document.createElement('div');
        head.className = 'service-head-card';
        if (data.title) {
          const t = document.createElement('h2');
          t.className = 'service-head-title';
          t.textContent = data.title;
          head.appendChild(t);
        }
        if (data.title && data.subtext) {
          const div = document.createElement('div');
          div.className = 'service-divider';
          head.appendChild(div);
        }
        if (data.subtext) {
          const s = document.createElement('p');
          s.className = 'service-head-sub';
          s.textContent = data.subtext;
          head.appendChild(s);
        }
        inner.appendChild(head);
      }

      // Bullet cards — one per point
      (data.points || []).forEach((pt) => {
        if (!pt.title && !pt.desc) return;
        const pc = document.createElement('div');
        pc.className = 'service-point-card';

        const bullet = document.createElement('span');
        bullet.className = 'service-point-bullet';
        pc.appendChild(bullet);

        const body = document.createElement('span');
        body.className = 'service-point-body';
        if (pt.title) {
          const lbl = document.createElement('span');
          lbl.className = 'service-point-title';
          lbl.textContent = pt.title + (pt.desc ? ': ' : '');
          body.appendChild(lbl);
        }
        if (pt.desc) {
          const d = document.createElement('span');
          d.className = 'service-point-desc';
          d.textContent = pt.desc;
          body.appendChild(d);
        }
        pc.appendChild(body);
        inner.appendChild(pc);
      });

      card.appendChild(inner);
    });
  }

  if (window.fetchServices) window.fetchServices().then(buildServiceCards);

  // ── Init ───────────────────────────────────────────────────────────────────
  resize();
  window.addEventListener('resize', resize);
  // Videos load lazily on first facing (see updateVideoPlayback / render gate).
  animId = requestAnimationFrame(render);
})();
