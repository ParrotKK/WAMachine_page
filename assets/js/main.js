/* Vanilla JavaScript, deliberately dependency-free. All article content has static fallbacks. */
(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const data = window.WAMACHINE_DATA;
  const config = window.WAMACHINE_CONFIG || {};
  const number = (value, decimals = 2) => Number(value).toLocaleString('en-US', {
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  });
  const escapeHTML = value => String(value).replace(/[&<>"']/g, char => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
  ));
  let toastTimer;
  function notify(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2700);
  }
  // Disallow script URLs in configurable links. Local and blob links are only allowed for the paper.
  function safeURL(value, allowLocal = false) {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      const url = new URL(value.trim(), document.baseURI);
      if (['http:', 'https:'].includes(url.protocol)) return url.href;
      if (allowLocal && ['file:', 'blob:'].includes(url.protocol)) return url.href;
    } catch (_) { /* An unset or malformed link stays disabled. */ }
    return null;
  }
  const paperURL = safeURL(config.paperUrl, true);
  if (paperURL) $$('[data-paper-link]').forEach(link => { link.href = paperURL; });
  if (window.WAMACHINE_OFFLINE_PREVIEW) {
    $$('[data-paper-link]').forEach(link => { link.setAttribute('download', 'wamachine.pdf'); });
  }
  const codeURL = safeURL(config.codeUrl);
  if (codeURL) {
    const link = $('#code-link');
    link.href = codeURL;
    link.hidden = false;
    $('#code-pending').hidden = true;
  } else if (config.codePendingLabel) {
    $('#code-pending-label').textContent = config.codePendingLabel;
  }
  const arxivURL = safeURL(config.arxivUrl);
  if (arxivURL) { $('#arxiv-link').href = arxivURL; $('#arxiv-link').hidden = false; }
  const projectURL = safeURL(config.projectUrl);
  if (projectURL) {
    let canonical = $('link[rel="canonical"]');
    if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.appendChild(canonical); }
    canonical.href = projectURL;
  }
  // Mobile navigation, including escape and link-selection behavior.
  const nav = $('#site-nav');
  const navToggle = $('.nav-toggle');
  function closeNav() { nav.classList.remove('is-open'); navToggle.setAttribute('aria-expanded', 'false'); navToggle.setAttribute('aria-label', 'Open navigation'); }
  navToggle.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('is-open');
    navToggle.setAttribute('aria-expanded', String(isOpen));
    navToggle.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
  });
  $$('a', nav).forEach(link => link.addEventListener('click', closeNav));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeNav(); });
  document.addEventListener('click', event => { if (!event.target.closest('.site-header')) closeNav(); });
  const menuMedia = window.matchMedia('(min-width: 761px)');
  if (menuMedia.addEventListener) menuMedia.addEventListener('change', () => { if (menuMedia.matches) closeNav(); });

  // Accessible tabs: arrows, Home and End work in both tab groups.
  function wireTabs(selector, callback) {
    const buttons = $$(selector);
    function select(button, focus = false) {
      for (const item of buttons) {
        const selected = item === button;
        item.setAttribute('aria-selected', String(selected)); item.tabIndex = selected ? 0 : -1;
      }
      callback(button);
      if (focus) button.focus();
    }
    buttons.forEach((button, index) => {
      button.addEventListener('click', () => select(button));
      button.addEventListener('keydown', event => {
        let target;
        if (event.key === 'ArrowRight') target = (index + 1) % buttons.length;
        else if (event.key === 'ArrowLeft') target = (index - 1 + buttons.length) % buttons.length;
        else if (event.key === 'Home') target = 0;
        else if (event.key === 'End') target = buttons.length - 1;
        else return;
        event.preventDefault(); select(buttons[target], true);
      });
    });
  }
  wireTabs('.mechanism-tab', button => {
    $$('.method-panel').forEach(panel => { panel.hidden = panel.id !== button.getAttribute('aria-controls'); });
  });
  function renderModel(key, announce = true) {
    const model = data && data.efficiency && data.efficiency[key];
    if (!model || !Array.isArray(model.rows) || model.rows.length < 2) return;
    const native = model.rows.find(row => row[0] === 'Native');
    const ours = model.rows.find(row => row[0] === 'WAMachine');
    if (!native || !ours) return;
    $('#selected-model').textContent = model.label;
    $('#table-model').textContent = model.label;
    $('#selected-benchmark').textContent = model.benchmark;
    $('#selected-subset').textContent = model.subset;
    $('#model-note').textContent = model.note;
    $('#model-result-panel').setAttribute('aria-labelledby', 'result-tab-' + key);
    for (const [metric, column, speedup] of [['gpu', 1, model.gpuSpeedup], ['o2a', 3, model.o2aSpeedup]]) {
      const maximum = Math.max(native[column], ours[column]);
      $('#' + metric + '-speedup').innerHTML = number(speedup) + '×<span>speedup</span>';
      $('#' + metric + '-native-value').textContent = number(native[column]);
      $('#' + metric + '-ours-value').textContent = number(ours[column]);
      $('#' + metric + '-native-bar').style.width = (native[column] / maximum * 100) + '%';
      $('#' + metric + '-ours-bar').style.width = (ours[column] / maximum * 100) + '%';
      $('#' + metric + '-chart-description').textContent = `${model.label}: Native ${number(native[column])} ms, WAMachine ${number(ours[column])} ms; ${number(speedup)} times speedup.`;
    }
    $('#efficiency-body').innerHTML = model.rows.map(([name, gpu, gs, o2a, os, sr]) => {
      const rowClass = name === 'WAMachine' ? 'ours' : name === 'Native' ? 'native' : '';
      return `<tr class="${rowClass}"><th scope="row">${escapeHTML(name)}</th><td class="num">${number(gpu)}</td><td class="num">${number(gs)}×</td><td class="num">${number(o2a)}</td><td class="num">${number(os)}×</td><td class="num">${number(sr, 1)}</td></tr>`;
    }).join('');
    if (announce) $('#result-announcement').textContent = `${model.label}, ${model.benchmark}. GPU inference speedup ${number(model.gpuSpeedup)} times; observation-to-action speedup ${number(model.o2aSpeedup)} times. Table updated.`;
  }
  wireTabs('.result-tab', button => renderModel(button.dataset.model));
  renderModel('fastwam', false);

  // The static tables work without JS. Dynamic versions use the same local data source.
  if (data && data.largeSample) {
    $('#success-cards').innerHTML = data.largeSample.map(row => {
      const suites = Object.entries(row.suites).map(([name, values]) => `<tr><th scope="row">${escapeHTML(name)}</th><td class="num">${number(values[0])}</td><td class="num">${number(values[1])}</td></tr>`).join('');
      return `<article class="success-card"><h4>${escapeHTML(row.model)}</h4><p class="card-sub">${escapeHTML(row.benchmark)} · ${number(row.episodes, 0)} episodes / method</p><div class="retention">${number(row.retention)}%<span>of native average task success retained</span></div><div class="success-pair"><div><div class="value">${number(row.native)}%</div><div class="label">Native average SR</div></div><div><div class="value ours-text">${number(row.wamachine)}%</div><div class="label">WAMachine average SR</div></div></div><details class="suite-details"><summary>See individual suites / settings</summary><table class="suite-table"><caption class="sr-only">${escapeHTML(row.model)} success rate by suite, in percent</caption><thead><tr><th scope="col">Suite</th><th scope="col" class="num">Native</th><th scope="col" class="num">WAMachine</th></tr></thead><tbody>${suites}</tbody></table></details></article>`;
    }).join('');
  }
  if (data && data.ablation) {
    $('#ablation-body').innerHTML = data.ablation.map(row => {
      const [name, tr, or, rr, graph, gpu, o2a, sr] = row;
      const flags = [tr, or, rr, graph].map(enabled => enabled ? '<td class="center"><span class="check" aria-label="Enabled">✓</span></td>' : '<td class="center"><span class="dash" aria-label="Disabled">–</span></td>').join('');
      return `<tr class="${name === 'WAMachine' ? 'ours' : name === 'Native' ? 'native' : ''}"><th scope="row">${escapeHTML(name)}</th>${flags}<td class="num">${number(gpu)}</td><td class="num">${number(o2a)}</td><td class="num">${number(sr, 1)}</td></tr>`;
    }).join('');
  }

  // Native dialog traps focus and supports Escape. The anchor remains a no-JS fallback.
  const dialog = $('#figure-dialog');
  const dialogBody = $('#dialog-body');
  const zoomButton = $('#dialog-zoom');
  let previousOverflow = '';
  const titles = { 'execution-figure': 'Figure 1 · The main idea', 'framework-figure': 'Figure 3 · WAMachine framework', 'analysis-figure': 'Figure 2 · Evidence for state continuity' };
  $$('.zoomable').forEach(link => link.addEventListener('click', event => {
    if (typeof dialog.showModal !== 'function') return;
    event.preventDefault();
    const title = link.dataset.title || 'Paper figure';
    $('#dialog-title').textContent = titles[link.closest('figure').id] || title;
    $('#dialog-image').src = link.href;
    $('#dialog-image').alt = title;
    $('#dialog-original').href = link.dataset.original;
    dialogBody.classList.remove('is-zoomed');
    zoomButton.setAttribute('aria-pressed', 'false');
    zoomButton.setAttribute('aria-label', 'Zoom figure');
    previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    dialog.showModal();
    dialogBody.scrollTop = 0; dialogBody.scrollLeft = 0;
    $('#dialog-close').focus();
  }));
  $('#dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { document.documentElement.style.overflow = previousOverflow; });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  });
  zoomButton.addEventListener('click', () => {
    const zoomed = dialogBody.classList.toggle('is-zoomed');
    zoomButton.setAttribute('aria-pressed', String(zoomed));
    zoomButton.setAttribute('aria-label', zoomed ? 'Fit figure to window' : 'Zoom figure');
  });

  // BibTeX is provisional until the real arXiv metadata is configured.
  const bibtexField = $('#bibtex');
  let bibtex = bibtexField.textContent;
  const bibSafe = value => String(value).replace(/[{}\r\n\\]/g, '').trim();
  if (config.citationKey) bibtex = bibtex.replace(/@misc\{[^,]+,/, '@misc{' + bibSafe(config.citationKey) + ',');
  if (config.citationYear) bibtex = bibtex.replace(/year\s*=\s*\{[^}]+\}/, 'year   = {' + bibSafe(config.citationYear) + '}');
  if (config.citationNote) bibtex = bibtex.replace(/note\s*=\s*\{[^}]+\}/, 'note   = {' + bibSafe(config.citationNote) + '}');
  if (arxivURL) {
    const parsed = new URL(arxivURL);
    const match = parsed.hostname.replace(/^www\./, '') === 'arxiv.org' && parsed.pathname.match(/^\/abs\/([0-9]{4}\.[0-9]{4,5}(?:v\d+)?|[a-z.-]+\/[0-9]{7})$/i);
    if (match) {
      bibtex = bibtex.replace(/  note\s*=\s*\{[^}]+\}/, `  eprint = {${match[1]}},\n  archivePrefix = {arXiv},\n  url    = {${arxivURL}}`);
      $('#citation-note').firstChild.textContent = 'Citation metadata uses the configured arXiv record. ';
    }
  }
  bibtexField.textContent = bibtex;
  let bibtexBlobURL;
  try {
    bibtexBlobURL = URL.createObjectURL(new Blob([bibtex + '\n'], { type: 'application/x-bibtex;charset=utf-8' }));
    $('a[download]', $('#citation-note')).href = bibtexBlobURL;
    $('a[download]', $('#citation-note')).setAttribute('download', 'wamachine.bib');
  } catch (_) { /* Static .bib link remains usable. */ }
  async function copyText(text) {
    try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; } } catch (_) { /* Local-file fallback below. */ }
    const temporary = document.createElement('textarea');
    temporary.value = text;
    temporary.setAttribute('readonly', '');
    temporary.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(temporary); temporary.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch (_) { /* Offer selectable text. */ }
    temporary.remove();
    return copied;
  }
  $('#copy-citation').addEventListener('click', async () => {
    const copied = await copyText(bibtexField.textContent);
    if (copied) {
      $('#copy-label').textContent = 'Copied'; notify('BibTeX copied to clipboard.');
      setTimeout(() => { $('#copy-label').textContent = 'Copy citation'; }, 2400);
    } else {
      const selection = window.getSelection(); const range = document.createRange();
      range.selectNodeContents(bibtexField); selection.removeAllRanges(); selection.addRange(range);
      notify('Citation selected. Press Ctrl+C or ⌘C to copy.');
    }
  });

  const sections = $$('.section[id]');
  const progress = $('.read-progress');
  let queued = false;
  function updateReadingPosition() {
    queued = false;
    const available = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.width = (available > 0 ? Math.min(100, Math.max(0, window.scrollY / available * 100)) : 0) + '%';
    let current = '';
    for (const section of sections) { if (section.getBoundingClientRect().top <= 145) current = section.id; }
    $$('a[href^="#"]', nav).forEach(link => {
      const active = link.getAttribute('href') === '#' + current;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current');
    });
  }
  window.addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(updateReadingPosition); } }, { passive: true });
  window.addEventListener('resize', updateReadingPosition);
  updateReadingPosition();
})();
