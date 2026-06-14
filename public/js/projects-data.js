(function () {
  const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSj2kWQy3QyR2vbqrwvlOClheXHoNvqOOjxR8GIuZrfQYaOmYKndhii3P1dLkDTn4Bvz7Re25J9_m7w/pub?output=csv';

  function parseCSV(text) {
    const rows = [];
    let current = '';
    let inQuotes = false;
    const lines = [];

    // Handle quoted fields with commas/newlines
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') {
        if (inQuotes && text[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        rows.push(current);
        current = '';
      } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
        if (current || rows.length > 0) {
          rows.push(current);
          lines.push(rows.splice(0));
          current = '';
        }
        if (ch === '\r' && text[i + 1] === '\n') i++;
      } else {
        current += ch;
      }
    }
    if (current || rows.length > 0) {
      rows.push(current);
      lines.push(rows.splice(0));
    }

    return lines;
  }

  function csvToProjects(text) {
    const lines = parseCSV(text.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].map(h => h.trim().toLowerCase());
    const projects = [];

    for (let i = 1; i < lines.length; i++) {
      const row = lines[i];
      if (!row || row.length === 0) continue;

      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = (row[idx] || '').trim();
      });

      // Skip empty rows
      if (!obj.name && !obj.number) continue;

      projects.push({
        number:      obj.number || String(i),
        name:        obj.name || 'Untitled',
        type:        obj.type || '',
        tags:        obj.tags ? obj.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        thumbnail:   obj.thumbnail || '',
        link:        obj.link || '#',
        description: obj.description || '',
      });
    }

    return projects;
  }

  let cachedProjects = null;
  let fetchPromise = null;

  window.fetchProjects = function () {
    if (cachedProjects) return Promise.resolve(cachedProjects);
    if (fetchPromise) return fetchPromise;

    fetchPromise = fetch(SHEET_CSV_URL)
      .then(r => {
        if (!r.ok) throw new Error('Sheet fetch failed: ' + r.status);
        return r.text();
      })
      .then(text => {
        cachedProjects = csvToProjects(text);
        if (window.preloaderDone) window.preloaderDone('projects');
        return cachedProjects;
      })
      .catch(err => {
        console.error('Projects data error:', err);
        if (window.preloaderDone) window.preloaderDone('projects');
        return [];
      });

    return fetchPromise;
  };

  // Pre-fetch on page load so data is ready when the section is reached
  window.fetchProjects();
})();
