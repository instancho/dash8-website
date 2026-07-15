(function () {
  const grid = document.getElementById('projects-grid');
  const wrap = document.getElementById('projects-grid-wrap');
  if (!grid || !wrap) return;

  function buildCard(proj) {
    const card = document.createElement('a');
    card.className = 'proj-card';
    card.href = proj.link || '#';
    card.target = '_blank';
    card.rel = 'noopener';

    if (proj.thumbnail) {
      const img = document.createElement('img');
      img.className = 'proj-card-thumb';
      img.src = proj.thumbnail;
      img.alt = proj.name;
      img.loading = 'lazy';
      card.appendChild(img);
    }

    // ── Default overlay (visible in normal state) ────────────────────────────
    const overlay = document.createElement('div');
    overlay.className = 'proj-card-overlay';

    const num = document.createElement('span');
    num.className = 'proj-card-number';
    num.textContent = '// PROJECT ' + proj.number + (proj.type ? ' — ' + proj.type : '');

    const name = document.createElement('span');
    name.className = 'proj-card-name';
    name.textContent = proj.name;

    overlay.appendChild(num);
    overlay.appendChild(name);
    card.appendChild(overlay);

    // ── Hover detail panel (slides up on hover) ──────────────────────────────
    const detail = document.createElement('div');
    detail.className = 'proj-card-detail';

    const detailType = document.createElement('span');
    detailType.className = 'proj-detail-type';
    detailType.textContent = proj.type || '';

    const detailName = document.createElement('span');
    detailName.className = 'proj-detail-name';
    detailName.textContent = proj.name;

    const detailDesc = document.createElement('p');
    detailDesc.className = 'proj-detail-desc';
    detailDesc.textContent = proj.description || '';

    const tagsWrap = document.createElement('div');
    tagsWrap.className = 'proj-detail-tags';
    if (proj.tags && proj.tags.length) {
      proj.tags.forEach(tag => {
        const pill = document.createElement('span');
        pill.className = 'proj-tag';
        pill.textContent = tag;
        tagsWrap.appendChild(pill);
      });
    }

    const viewBtn = document.createElement('span');
    viewBtn.className = 'proj-detail-link';
    viewBtn.textContent = 'View Project →';

    detail.appendChild(detailType);
    detail.appendChild(detailName);
    if (proj.description) detail.appendChild(detailDesc);
    detail.appendChild(tagsWrap);
    detail.appendChild(viewBtn);
    card.appendChild(detail);

    return card;
  }

  function fillGrid(projects) {
    if (!projects.length) return;

    grid.innerHTML = '';

    const totalSlots = 24;
    for (let i = 0; i < totalSlots; i++) {
      const proj = projects[i % projects.length];
      grid.appendChild(buildCard(proj));
    }

    const diag = Math.sqrt(window.innerWidth ** 2 + window.innerHeight ** 2);
    const pad = diag * 1.2;
    grid.style.width = pad + 'px';
    grid.style.height = pad + 'px';
    grid.style.gridTemplateColumns = 'repeat(4, 336px)';
    grid.style.gridAutoRows = '240px';
    grid.style.justifyContent = 'center';
    grid.style.alignContent = 'center';
  }

  // ── Mouse parallax ─────────────────────────────────────────────────────────
  let mx = 0, my = 0;
  let sx = 0, sy = 0;
  const STRENGTH = 50;
  const SMOOTH = 0.05;

  wrap.addEventListener('mousemove', (e) => {
    mx = (e.clientX / window.innerWidth - 0.5) * 2;
    my = (e.clientY / window.innerHeight - 0.5) * 2;
  });

  function animate() {
    requestAnimationFrame(animate);
    sx += (-mx * STRENGTH - sx) * SMOOTH;
    sy += (-my * STRENGTH - sy) * SMOOTH;
    grid.style.transform =
      'translate(calc(-50% + ' + sx.toFixed(1) + 'px), calc(-50% + ' + sy.toFixed(1) + 'px)) rotate(-18deg)';
  }
  animate();

  window.fetchProjects().then(fillGrid);

  // Debounced — cached projects resolve synchronously, so this only rebuilds
  // the grid once the user stops resizing.
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (window.fetchProjects) window.fetchProjects().then(fillGrid);
    }, 150);
  });
})();
