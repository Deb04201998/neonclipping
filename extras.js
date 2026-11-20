// ShortCircuit extras: style panel, caption animation, SRT/ASS import, facecam finder, AI parts.
// Loaded after app.js. It only adds to the page and wraps request()/exportSettings()/openSavedClip(); app.js stays as it is.
(function () {
  const $ = id => document.getElementById(id);
  const STYLE_KEYS = ['template', 'tpl_name', 'tpl_handle', 'bg_mode', 'bg_color', 'bg_color2', 'bg_image', 'bg_dim', 'bg_blur', 'padding', 'radius',
    'watermark_image', 'watermark_pos', 'watermark_size', 'watermark_opacity', 'credit', 'outro_text', 'outro_seconds',
    'music', 'music_volume', 'music_peak', 'music_riser', 'caption_anim'];
  const assets = { bg_image: '', watermark_image: '', music: '' };

  // ---- reading / writing the style fields
  function raw() {
    const v = {
      template: $('st-template').value, tpl_name: $('st-tpl-name').value.trim(), tpl_handle: $('st-tpl-handle').value.trim(),
      bg_mode: $('st-bg-mode').value === 'none' ? '' : $('st-bg-mode').value, bg_color: $('st-bg-color').value, bg_color2: $('st-bg-color2').value,
      bg_image: assets.bg_image, bg_dim: Number($('st-bg-dim').value) / 100, padding: Number($('st-padding').value), radius: Number($('st-radius').value),
      watermark_image: assets.watermark_image, watermark_pos: $('st-wm-pos').value, watermark_size: Number($('st-wm-size').value),
      watermark_opacity: Number($('st-wm-opacity').value) / 100, credit: $('st-credit').value.trim(), outro_text: $('st-outro').value.trim(),
      outro_seconds: Number($('st-outro-sec').value), music: assets.music, music_volume: Number($('st-music-vol').value) / 100,
      music_peak: Number($('st-music-peak').value) / 100, music_riser: Number($('st-music-riser').value),
      caption_anim: $('caption-anim') ? $('caption-anim').value : 'highlight'
    };
    return v;
  }
  // only what is switched on (Make / export), so plain exports stay exactly as before
  function styleFields() {
    const v = raw(), o = {};
    if (v.template !== 'none') { o.template = v.template; o.tpl_name = v.tpl_name; o.tpl_handle = v.tpl_handle; }
    if (v.bg_mode) { o.bg_mode = v.bg_mode; o.bg_color = v.bg_color; o.bg_color2 = v.bg_color2; o.bg_dim = v.bg_dim; if (v.bg_mode === 'image' && v.bg_image) o.bg_image = v.bg_image; }
    if (v.padding > 0) { o.padding = v.padding; o.radius = v.radius; } else if (v.radius > 0 && v.bg_mode) { o.radius = v.radius; }
    if (v.watermark_image) { o.watermark_image = v.watermark_image; o.watermark_pos = v.watermark_pos; o.watermark_size = v.watermark_size; o.watermark_opacity = v.watermark_opacity; }
    if (v.credit) o.credit = v.credit;
    if (v.outro_text) { o.outro_text = v.outro_text; o.outro_seconds = v.outro_seconds; }
    if (v.music) { o.music = v.music; o.music_volume = v.music_volume; o.music_peak = v.music_peak; o.music_riser = v.music_riser; }
    if (v.caption_anim && v.caption_anim !== 'highlight') o.caption_anim = v.caption_anim;
    return o;
  }
  // every key, '' when off: used when editing saved clips so a switched-off option really turns off
  function styleState() {
    const on = styleFields(), s = {};
    for (const k of STYLE_KEYS) s[k] = on[k] === undefined ? (k === 'template' ? 'none' : k === 'caption_anim' ? 'highlight' : '') : on[k];
    return s;
  }
  function setRange(id, outId, value, scale) { if ($(id)) $(id).value = value; if ($(outId)) $(outId).textContent = Math.round(Number($(id).value) * (scale || 1)); }
  function loadStyleFields(s) {
    s = s || {};
    $('st-template').value = s.template || 'none'; $('st-tpl-name').value = s.tpl_name || ''; $('st-tpl-handle').value = s.tpl_handle || '';
    $('st-bg-mode').value = s.bg_mode || 'none'; if (s.bg_color) $('st-bg-color').value = s.bg_color; if (s.bg_color2) $('st-bg-color2').value = s.bg_color2;
    setRange('st-padding', 'st-padding-o', s.padding || 0); setRange('st-radius', 'st-radius-o', s.radius || 0);
    setRange('st-bg-dim', 'st-dim-o', Math.round((s.bg_dim === undefined ? .25 : s.bg_dim) * 100));
    assets.bg_image = s.bg_image || ''; assets.watermark_image = s.watermark_image || ''; assets.music = s.music || '';
    $('st-bg-name').textContent = assets.bg_image ? 'image set' : ''; $('st-wm-name').textContent = assets.watermark_image ? 'logo set' : 'no logo';
    $('st-music-name').textContent = assets.music ? 'music set' : 'no music';
    $('st-wm-pos').value = s.watermark_pos || 'tr'; setRange('st-wm-size', 'st-wm-size-o', s.watermark_size || 16);
    setRange('st-wm-opacity', 'st-wm-op-o', Math.round((s.watermark_opacity === undefined ? .85 : s.watermark_opacity) * 100));
    $('st-credit').value = s.credit || ''; $('st-outro').value = s.outro_text || ''; $('st-outro-sec').value = s.outro_seconds || 3;
    setRange('st-music-vol', 'st-mv-o', Math.round((s.music_volume === undefined ? .15 : s.music_volume) * 100));
    setRange('st-music-peak', 'st-mp-o', Math.round((s.music_peak === undefined ? .85 : s.music_peak) * 100));
    $('st-music-riser').value = s.music_riser || 4;
    if ($('caption-anim')) $('caption-anim').value = s.caption_anim || 'highlight';
  }

  // ---- uploads (logo, wallpaper, music)
  async function uploadAsset(file, kind, nameEl, key) {
    nameEl.textContent = 'uploading…';
    const fd = new FormData(); fd.append('file', file);
    try {
      const r = await fetch('/upload-asset?kind=' + kind, { method: 'POST', body: fd });
      const j = await r.json();
      if (!r.ok) throw Error(j.detail || 'Upload failed');
      assets[key] = j.id; nameEl.textContent = j.name || 'uploaded';
    } catch (e) { assets[key] = ''; nameEl.textContent = '⚠ ' + e.message; }
  }
  const hook = (id, fn) => { const el = $(id); if (el) el.addEventListener('change', fn); };
  hook('st-bg-file', e => { const f = e.target.files[0]; if (f) { uploadAsset(f, 'image', $('st-bg-name'), 'bg_image'); if ($('st-bg-mode').value === 'none') $('st-bg-mode').value = 'image'; } });
  hook('st-wm-file', e => { const f = e.target.files[0]; if (f) uploadAsset(f, 'image', $('st-wm-name'), 'watermark_image'); });
  hook('st-music-file', e => { const f = e.target.files[0]; if (f) uploadAsset(f, 'audio', $('st-music-name'), 'music'); });
  [['st-padding', 'st-padding-o', 1], ['st-radius', 'st-radius-o', 1], ['st-bg-dim', 'st-dim-o', 1], ['st-wm-size', 'st-wm-size-o', 1], ['st-wm-opacity', 'st-wm-op-o', 1], ['st-music-vol', 'st-mv-o', 1], ['st-music-peak', 'st-mp-o', 1]]
    .forEach(([i, o]) => { const el = $(i); if (el) el.addEventListener('input', () => { $(o).textContent = el.value; }); });
  if ($('st-reset')) $('st-reset').onclick = () => loadStyleFields({});

  // ---- caption animation + SRT/ASS import (added to the "Give it a voice" panel next to the language picker)
  const lang = $('language');
  if (lang && !$('caption-anim')) {
    const anchor = lang.closest('label') || lang;
    const sel = document.createElement('label');
    sel.innerHTML = 'Caption animation<select id="caption-anim"><option value="highlight">Highlight (word by word)</option><option value="pop_in">Pop-in</option>' +
      '<option value="pop_in_line">Pop-in line</option><option value="one_by_one">One by one</option><option value="build_up">Build up</option><option value="full_line">Full line</option></select>';
    anchor.parentNode.insertBefore(sel, anchor.nextSibling);
    const up = document.createElement('label');
    up.className = 'upload'; up.innerHTML = '↑ Import .srt / .ass<input id="srt-file" type="file" accept=".srt,.ass,.ssa" hidden>';
    sel.parentNode.insertBefore(up, sel.nextSibling);
    $('srt-file').addEventListener('change', async e => {
      const f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      try {
        const text = await f.text();
        const j = await request('/captions/parse', { text, start: Number($('start').value) || 0, end: Number($('end').value) || null });
        words = j.words; wordRange = signature(); renderWords(); if ($('captions')) $('captions').checked = true;
        status('Imported ' + j.words.length + ' caption words from ' + f.name + ' (' + j.cues + ' lines). Check and edit them below.');
      } catch (err) { status(err.message); }
    });
  }

  // ---- facecam finder + "find it automatically for Make clips"
  const row = document.querySelector('.preset-row');
  if (row && !$('find-cam')) {
    const b = document.createElement('button');
    b.className = 'chip'; b.id = 'find-cam'; b.textContent = '🔎 Find my facecam';
    const none = row.querySelector('[data-preset=none]');
    row.insertBefore(b, none || null);
    const lab = document.createElement('label');
    lab.className = 'check'; lab.innerHTML = '<input id="cam-auto" type="checkbox"> Find it automatically when I press Make clips';
    row.appendChild(lab);
    b.onclick = async () => {
      if (!id) { $('preset-note').textContent = 'Add a video first (wait for it to finish loading).'; return; }
      b.disabled = true; $('preset-note').textContent = 'Looking for the facecam (a few seconds)…';
      try {
        const r = await request('/facecam/detect', { id });
        if (r.found) {
          rectEdited = true; rect = { cam: { ...r.cam }, game: { ...r.game } };
          document.querySelectorAll('[data-preset]').forEach(x => x.classList.remove('on'));
          $('preset-note').textContent = 'Facecam found (' + Math.round(r.confidence * 100) + '% sure, ' + r.method + '). Boxes set; fine-tune in step 03 if needed.';
          const stack = document.querySelector('[data-layout=stack]'); if (stack) stack.click();
        } else {
          $('preset-note').textContent = 'No facecam found: ' + (r.reason || 'nothing convincing') + '. Pick a position or draw the boxes yourself.';
        }
      } catch (e) { $('preset-note').textContent = e.message; } finally { b.disabled = false; }
    };
  }

  // ---- wrap the app.js helpers
  const baseRequest = window.request;
  window.request = function (path, body) {
    if (path === '/make' && body) {
      const extra = { ...styleFields(), cam_auto: !!($('cam-auto') && $('cam-auto').checked), credit_auto: !!$('st-credit-auto').checked };
      body = { ...extra, ...body };
      if (window.__aiMoments) { body.moments = window.__aiMoments; window.__aiMoments = null; }
    }
    if (path === '/clips/reedit' && body && body.changes) body = { ...body, changes: { ...body.changes, ...styleState() } };
    const p = baseRequest(path, body);
    if (typeof path === 'string' && path.startsWith('/make/')) {
      return p.then(r => {
        if (r && r.facecam && $('preset-note')) {
          $('preset-note').textContent = r.facecam.found ? 'Facecam found automatically (' + Math.round((r.facecam.confidence || 0) * 100) + '% sure) and used for every clip.'
            : 'No facecam found automatically; your selected boxes were used.';
        }
        return r;
      });
    }
    return p;
  };
  const baseExport = window.exportSettings;
  window.exportSettings = function (...a) { return Object.assign(baseExport.apply(this, a), styleFields()); };
  const baseOpen = window.openSavedClip;
  window.openSavedClip = async function (file) {
    await baseOpen(file);
    try { const saved = await baseRequest('/clips/' + file + '/edit'); loadStyleFields(saved.settings); } catch (e) { /* the clip loaded; style fields keep their values */ }
  };

  // ---- keyboard shortcuts for trimming: I = in point, O = out point, Space = play / pause
  document.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (['input', 'textarea', 'select', 'button'].includes(tag) || e.ctrlKey || e.metaKey || e.altKey) return;
    const vid = $('video');
    if (!vid || !id || $('editor-view').hidden) return;
    const k = e.key.toLowerCase();
    const t = Math.round(vid.currentTime * 100) / 100;
    if (k === 'i') {
      const end = Number($('end').value);
      window.setRange(t, end > t + 1 ? end : Math.min(t + 30, sourceDuration || t + 30));
      status('In point set to ' + t.toFixed(2) + ' s');
    } else if (k === 'o') {
      const start = Number($('start').value);
      if (t > start + .5) { window.setRange(start, t); status('Out point set to ' + t.toFixed(2) + ' s'); } else status('Move the video past the in point first.');
    } else if (k === ' ') { e.preventDefault(); if (vid.paused) vid.play(); else vid.pause(); }
  });
  const endBox = $('end');
  if (endBox && endBox.parentNode && !$('kbd-hint')) {
    const h = document.createElement('div'); h.id = 'kbd-hint'; h.className = 'muted'; h.textContent = 'Shortcuts: I = set start here · O = set end here · Space = play / pause';
    (endBox.closest('.controls') || endBox.parentNode).appendChild(h);
  }

  // ---- AI parts
  let aiInfo = null, aiMoments = [];
  const aiStatus = t => { $('ai-status').textContent = t; };
  async function copyText(text, btn) {
    try { await navigator.clipboard.writeText(text); } catch (e) {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
    const old = btn.textContent; btn.textContent = 'Copied ✓'; setTimeout(() => { btn.textContent = old; }, 1500);
  }
  if ($('ai-split')) {
    $('ai-split').onclick = async () => {
      const url = $('ai-url').value.trim(); if (!url) { aiStatus('Paste a YouTube link first.'); return; }
      $('ai-split').disabled = true; aiStatus('Reading the video and its captions…'); $('ai-list').replaceChildren();
      try {
        const body = { url, per_part: Number($('ai-per').value) || 3 }; if ($('ai-parts').value) body.parts = Number($('ai-parts').value);
        body.min_len = Number($('minlen') ? $('minlen').value : 30); body.max_len = Number($('length') ? $('length').value : 60);
        aiInfo = await request('/ai/parts', body);
        aiStatus(aiInfo.parts.length + ' parts for “' + aiInfo.title + '”. Paste each prompt into a chatbot (one chat per part works best), then paste all answers below.');
        for (const p of aiInfo.parts) {
          const d = document.createElement('div'); d.className = 'queue-item';
          const t = document.createElement('b'); t.textContent = 'Part ' + p.index + ' · ' + p.label;
          const m = document.createElement('small'); m.textContent = p.lines + ' lines · ' + Math.round(p.chars / 1000) + 'k characters';
          const c = document.createElement('button'); c.className = 'secondary'; c.textContent = 'Copy prompt'; c.onclick = () => copyText(p.prompt, c);
          d.append(t, m, c); $('ai-list').append(d);
        }
      } catch (e) { aiStatus('⚠ ' + e.message); } finally { $('ai-split').disabled = false; }
    };
    $('ai-read').onclick = async () => {
      try {
        const r = await request('/ai/answers', { text: $('ai-answers').value, duration: aiInfo ? aiInfo.duration : null });
        aiMoments = r.moments; $('ai-moments').replaceChildren();
        r.moments.forEach((m, i) => {
          const d = document.createElement('label'); d.className = 'queue-item';
          const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = true; cb.dataset.i = i;
          const t = document.createElement('b'); t.textContent = m.start_label + ' → ' + m.end_label + ' · ' + (m.title || 'Moment ' + (i + 1));
          d.append(cb, t); $('ai-moments').append(d);
        });
        if (r.rejected.length) { const n = document.createElement('small'); n.textContent = r.rejected.length + ' lines skipped: ' + r.rejected.slice(0, 3).map(x => x.why).join(', '); $('ai-moments').append(n); }
        $('ai-make').disabled = false; aiStatus(r.moments.length + ' moments ready.');
      } catch (e) { aiStatus('⚠ ' + e.message); $('ai-make').disabled = true; }
    };
    $('ai-make').onclick = () => {
      const picked = [...$('ai-moments').querySelectorAll('input[type=checkbox]')].filter(c => c.checked).map(c => aiMoments[Number(c.dataset.i)]);
      if (!picked.length) { aiStatus('Tick at least one moment.'); return; }
      const url = (aiInfo && aiInfo.url) || $('ai-url').value.trim();
      $('url').value = url; window.__aiMoments = picked.map(m => ({ start: m.start, end: m.end, title: m.title, hook: m.hook }));
      aiStatus('Making ' + picked.length + ' clips… watch the progress in step 01 / Make clips.');
      $('make').scrollIntoView({ behavior: 'smooth' }); $('make').click();
    };
  }
})();
