(function () {
  // ── Google Sheet backend (same pattern as projects-data.js) ─────────────────
  // 1. Build a sheet with columns:  service | title | subtext | point_title | point_desc
  //    - `service` is the card number 1–4 (maps to the 4 service screens).
  //    - Put `title` + `subtext` on the FIRST row of each service; leave blank on
  //      the following rows. Each row's `point_title` / `point_desc` becomes one
  //      bullet card. Add a row to add a point, delete a row to remove one.
  // 2. File ▸ Share ▸ Publish to web ▸ (this sheet) ▸ CSV ▸ Publish.
  // 3. Paste the published CSV link below.
  // Until a URL is set (or if the fetch fails) the DEFAULT_SERVICES sample is used.
  const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1JruikXJ3KW70zrhcxy-lY88YffsBj4QSa-l-_D9QABI/gviz/tq?tqx=out:csv';

  // ── CSV parser (handles quoted fields with commas/newlines) ─────────────────
  function parseCSV(text) {
    const rows = [];
    let current = '';
    let inQuotes = false;
    const lines = [];

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') {
        if (inQuotes && text[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        rows.push(current); current = '';
      } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
        if (current || rows.length > 0) {
          rows.push(current); lines.push(rows.splice(0)); current = '';
        }
        if (ch === '\r' && text[i + 1] === '\n') i++;
      } else {
        current += ch;
      }
    }
    if (current || rows.length > 0) { rows.push(current); lines.push(rows.splice(0)); }
    return lines;
  }

  // ── Group flat CSV rows into up to 4 services (indexed 0–3) ──────────────────
  function csvToServices(text) {
    const lines = parseCSV(text.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].map(h => h.trim().toLowerCase());
    const col = (row, name) => {
      const idx = headers.indexOf(name);
      return idx >= 0 ? (row[idx] || '').trim() : '';
    };

    const services = [];
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i];
      if (!row || row.length === 0) continue;

      const svc = col(row, 'service');
      if (!svc) continue;
      const idx = Math.max(0, Math.min(3, parseInt(svc, 10) - 1)); // 1-based → 0-based, clamp 0–3
      if (Number.isNaN(idx)) continue;

      if (!services[idx]) services[idx] = { title: '', subtext: '', points: [] };
      const s = services[idx];

      const title = col(row, 'title');
      const subtext = col(row, 'subtext');
      if (title && !s.title) s.title = title;
      if (subtext && !s.subtext) s.subtext = subtext;

      const pTitle = col(row, 'point_title');
      const pDesc = col(row, 'point_desc');
      if (pTitle || pDesc) s.points.push({ title: pTitle, desc: pDesc });
    }
    return services;
  }

  // ── Sample fallback — replaced entirely once the Google Sheet is connected ──
  const DEFAULT_SERVICES = [
    {
      title: 'BRANDING',
      subtext: "Visual identity systems that cut through the noise and scale across every touchpoint.",
      points: [
        { title: 'IDENTITY SYSTEMS', desc: 'Logos, type, and colour built as a flexible kit.' },
        { title: 'ART DIRECTION', desc: 'A consistent visual language across every surface.' },
        { title: 'GUIDELINES', desc: 'Clear rules so the brand stays sharp as it grows.' },
      ],
    },
    {
      title: 'WEBSITE DESIGN AND DEVELOPMENT',
      subtext: "We build high-performance, conversion-driven websites—from clean UI to immersive 3D experiences—tailored to your clients' needs.",
      points: [
        { title: 'CUSTOM STRATEGY', desc: 'Fully documented, bespoke design and architecture.' },
        { title: 'IMMERSIVE UI/UX', desc: 'From subtle interactions to 3D scroll experiences.' },
        { title: 'FUNCTIONAL BACKENDS', desc: 'Easy-to-manage blogs, portfolios, and case studies.' },
        { title: 'OPTIMIZATION', desc: 'Mobile-first, SEO-ready, and fully tested.' },
      ],
    },
    {
      title: 'DEVELOPMENT',
      subtext: 'Engineered front-ends with cinematic precision and rock-solid performance.',
      points: [
        { title: 'MOTION & 3D', desc: 'GSAP, WebGL, and shader-driven interfaces.' },
        { title: 'PERFORMANCE', desc: 'Optimised assets and buttery-smooth frame rates.' },
        { title: 'INTEGRATIONS', desc: 'Connected to the tools your business already runs on.' },
      ],
    },
    {
      title: 'STRATEGY',
      subtext: 'Creative direction aligned with real business goals, not just aesthetics.',
      points: [
        { title: 'POSITIONING', desc: 'Sharpening what you say and who you say it to.' },
        { title: 'CONTENT', desc: 'Messaging frameworks that carry across the whole site.' },
        { title: 'ROADMAP', desc: 'A prioritised plan from launch to iteration.' },
      ],
    },
  ];

  let cached = null;
  let fetchPromise = null;

  window.fetchServices = function () {
    if (cached) return Promise.resolve(cached);
    if (fetchPromise) return fetchPromise;

    if (!SHEET_CSV_URL) {
      cached = DEFAULT_SERVICES;
      return Promise.resolve(cached);
    }

    fetchPromise = fetch(SHEET_CSV_URL)
      .then(r => { if (!r.ok) throw new Error('Services sheet fetch failed: ' + r.status); return r.text(); })
      .then(text => {
        const parsed = csvToServices(text);
        cached = (parsed && parsed.filter(Boolean).length) ? parsed : DEFAULT_SERVICES;
        return cached;
      })
      .catch(err => {
        console.error('Services data error:', err);
        cached = DEFAULT_SERVICES;
        return cached;
      });

    return fetchPromise;
  };

  // Pre-fetch so data is ready by the time the About screen is reached.
  window.fetchServices();
})();
