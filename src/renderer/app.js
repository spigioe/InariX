'use strict';
/* global gamo, Nav, OSK, Sound */
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v);
  }
  for (const c of kids.flat(Infinity)) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
}

const ICONS = {
  cloud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M7 18.5h10.2a4.3 4.3 0 0 0 .5-8.57A6.2 6.2 0 0 0 5.9 9.2 4.7 4.7 0 0 0 7 18.5z"/></svg>',
  cloudOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M7 18.5h10.2a4.3 4.3 0 0 0 .5-8.57A6.2 6.2 0 0 0 5.9 9.2 4.7 4.7 0 0 0 7 18.5z"/><path d="M3.5 3.5l17 17" stroke-width="2.4"/></svg>',
  laptop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="5" width="16" height="11" rx="1.6"/><path d="M2 19.5h20"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>',
  power: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v8"/><path d="M6.3 6.8a8 8 0 1 0 11.4 0"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11"/><path d="M7 10.5l5 5 5-5"/><path d="M4.5 19.5h15"/></svg>',
};
const icon = (name) => h('span', { class: 'ico', html: ICONS[name] });

const TABS = ['home', 'library', 'store', 'browser', 'hosts', 'settings'];
const TAB_TITLE = { home: '', library: 'Játékaim és alkalmazásaim', store: 'Áruház', browser: 'Böngésző', hosts: 'Gépek', settings: 'Beállítások' };
const STORE_LABEL = { steam: 'Steam', epic: 'Epic Games', gog: 'GOG', msstore: 'Microsoft Store', ubisoft: 'Ubisoft Connect', custom: 'Egyedi' };
const PLATFORMS = ['steam', 'epic', 'gog', 'msstore', 'ubisoft', 'custom'];
const STORE_COLOR = { steam: '#1b9fff', epic: '#e5e5e5', gog: '#a855f7', msstore: '#22c55e', ubisoft: '#3b82f6', custom: '#f59e0b' };
const S = {
  tab: 'home', libCat: 'all', state: null, lib: { games: [], hosts: [] }, libLoading: false, libLoaded: false, libAt: 0,
  filter: '', focusedKey: null, platform: null, instState: 'all', setCat: 'accounts', hostStatus: {}, storeTarget: 'local',
  store: { mode: 'featured', q: '', items: [], loading: false, error: null, loaded: false },
  launching: null, launchCancelled: false, booting: false, detail: null, lastInput: Date.now(), saver: false,
};

// ---------------- Segédek ----------------
const NOTES = [];
function toast(msg, kind = '', ms = 4500) {
  NOTES.unshift({ msg, kind, at: Date.now() });
  if (NOTES.length > 50) NOTES.pop();
  const t = h('div', { class: `toast ${kind}` }, msg);
  $('#toasts').append(t);
  setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, ms);
  if (kind === 'err') Sound.error();
}

function modal({ title, body = '', items = [], wide = false, log = false, node = null, onClose = null, handlers = {}, noDefault = false }) {
  return new Promise((resolve) => {
    const layer = $('#modal-layer');
    const box = h('div', { class: `modal${wide ? ' wide' : ''}` },
      h('h2', {}, title),
      body ? h('div', { class: `body${log ? ' log' : ''}` }, body) : null,
      node,
      h('div', { class: 'actions' }, items.map((it, i) =>
        h('button', { class: `menu-item focusable ${it.kind || ''}`, dataset: (it.def || (i === 0 && !noDefault && !items.some((x) => x.def))) ? { default: '1' } : {}, onclick: () => close(it.value) }, it.icon ? uiIcon(it.icon, 'mi-ico') : null, it.label))));
    layer.innerHTML = '';
    layer.append(box);
    layer.classList.remove('hidden');
    let done = false;
    function close(v) {
      if (done) return; done = true;
      if (onClose) onClose();
      layer.classList.add('hidden'); layer.innerHTML = '';
      Nav.pop();
      resolve(v);
    }
    Nav.push(() => layer, { b: () => { Sound.back(); close(null); }, ...handlers });
    if (log) { const b = box.querySelector('.body'); b.scrollTop = b.scrollHeight; }
  });
}
const confirmBox = (title, body, yes = 'Igen') => modal({ title, body, items: [{ label: yes, value: true, kind: 'primary' }, { label: 'Mégse', value: false }] });
const fmtTime = (sec) => { const hh = Math.floor(sec / 3600), mm = Math.round((sec % 3600) / 60); return hh ? `${hh} ó ${mm} p` : `${mm} perc`; };
const fmtSince = (ms) => { const m = Math.max(0, Math.round((Date.now() - ms) / 60000)); return m < 1 ? 'most indult' : m < 60 ? `${m} perce` : `${Math.floor(m / 60)} ó ${m % 60} p óta`; };
const fmtDate = (ms) => (ms ? new Date(ms).toLocaleDateString('hu-HU', { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
const hostById = (id) => S.state.hosts.find((x) => x.id === id);
const libHost = (id) => S.lib.hosts.find((x) => x.id === id);
const htmlToText = (html) => new DOMParser().parseFromString(String(html || ''), 'text/html').body.textContent || '';

// ---------------- Állapot ----------------
function applyState(st) {
  S.state = st;
  const ui = st.settings.ui;
  Sound.setEnabled(ui.sounds);
  KbLayout.set(ui.kbLayout);
  if (typeof applyTheme === 'function' && !S.themePreview) applyTheme(activeTheme());
  document.body.classList.toggle('reduce-motion', !!ui.reduceMotion);
  document.body.classList.toggle('night', !!ui.nightMode);
  document.documentElement.style.setProperty('--scale', String((ui.scale || 100) / 100));
  if (!hostById(S.storeTarget)) S.storeTarget = 'local';
  renderHostChip();
}
async function refreshState() { applyState(await gamo.state()); }

function renderHostChip() {
  const remotes = S.lib.hosts.filter((x) => !x.local);
  const dot = $('#host-chip .dot');
  if (!remotes.length) { $('#host-name').textContent = 'Ez a gép'; dot.className = 'dot on'; return; }
  const on = remotes.filter((x) => x.online).length;
  $('#host-name').textContent = remotes.length === 1 ? remotes[0].name : `${on}/${remotes.length} gép online`;
  dot.className = `dot ${on === remotes.length ? 'on' : on ? 'wait' : 'off'}`;
}

// ---------------- Fülek ----------------
function setTab(tab, { silent = false } = {}) {
  // a varázslóból indított belépés közben a böngésző elhagyása = megszakítás, vissza a varázslóba
  if (S.loginReturn && tab !== 'browser') { if (S.loginStore) cancelLogin(); loginFinished(); return; }
  if (S.tab === 'browser' && tab !== 'browser' && typeof Browser !== 'undefined') Browser.onTabLeave();
  S.tab = tab;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === `screen-${tab}`));
  if (!silent) Sound.tab();
  const handlers = { home: homeHandlers, library: libraryHandlers, store: storeHandlers, browser: () => Browser.handlers(), hosts: hostsHandlers, settings: settingsHandlers }[tab]();
  Nav.setBase(() => $(`#screen-${tab}`), handlers, globalHandlers);
  ({ home: renderHome, library: () => renderLibrary(true), store: renderStore, browser: () => Browser.render(), hosts: renderHosts, settings: renderSettings })[tab]();
  document.body.dataset.page = tab;
  if (tab !== 'home' && typeof bgTrailer === 'function') bgTrailer(null);
  document.body.classList.remove('home-down');
  $('#page-title').textContent = TAB_TITLE[tab] || '';
  renderHints();
  requestAnimationFrame(() => { if (!Nav.current()) Nav.focusFirst(); });
}

const globalHandlers = {
  // ≡ (Start): futó játékon a játék menüje (Folytatás / Kilépés a játékból), egyébként a gyorsmenü
  start: () => {
    const e = S.tab === 'library' || S.tab === 'home' ? focusedGame() : null;
    if (e && e.running && e.running.length) return runningMenu(e);
    if (typeof Browser !== 'undefined' && Browser.openApps().length) return Browser.appSwitcher();
    return openQuick();
  },
  guide: () => openQuick(),
  select: () => openQuick(),
  b: () => {
    if (S.tab !== 'home') { Sound.back(); setTab('home', { silent: true }); return; }
    exitMenu(); // a kezdőképernyőn a Vissza a kilépés menüt nyitja (mint a konzoloknál)
  },
};

// Billentyűzet / egér mód: a kontroller gombok helyett a megfelelő billentyűk (a Nav KEYMAP szerint)
const KB_KEYS = { A: 'Enter', B: 'Esc', X: 'X', Y: 'Y', LB: 'Q', RB: 'E', '≡': 'M', '⧉': 'F', 'LB/RB': 'Q / E' };
function renderHints() {
  const pad = document.body.classList.contains('pad-mode');
  const H = (cls, k, t) => (pad || !KB_KEYS[k]
    ? h('span', { class: 'hint' }, h('b', { class: cls }, k), t)
    : h('span', { class: 'hint' }, h('b', { class: 'kbd' }, KB_KEYS[k]), t));
  const list = {
    home: [H('btn-a', 'A', S.homeHintA || 'Kiválasztás'), H('btn-x', 'X', 'Adatlap'), H('btn-y', 'Y', 'Keresés'), H('btn-start', '≡', 'Menü'), H('btn-b', 'B', 'Kilépés')],
    library: [H('btn-a', 'A', 'Játék'), H('btn-x', 'X', 'Adatlap'), H('btn-y', 'Y', 'Keresés'), H('btn-start', 'LB/RB', 'Kategória'), H('btn-b', 'B', 'Kezdőlap')],
    store: [H('btn-a', 'A', 'Kiválasztás'), H('btn-y', 'Y', 'Keresés'), H('btn-b', 'B', 'Vissza'), H('btn-start', '≡', 'Menü')],
    hosts: [H('btn-a', 'A', 'Kiválasztás'), H('btn-y', 'Y', 'Frissítés'), H('btn-b', 'B', 'Vissza'), H('btn-start', '≡', 'Menü')],
    settings: [H('btn-a', 'A', 'Módosítás'), H('btn-b', 'B', 'Vissza'), H('btn-start', '≡', 'Menü')],
    browser: typeof Browser !== 'undefined' ? Browser.hints(H) : [],
  }[S.tab];
  $('#hints').replaceChildren(...list);
}

// ---------------- Könyvtár (lásd home.js) ----------------
const focusedGame = () => S.lib.games.find((g) => g.key === S.focusedKey) || null;

async function loadLibrary(force, announce) {
  S.libLoading = true;
  if (!S.libLoaded) refreshLibViews();
  try {
    const prevOnline = Object.fromEntries(S.lib.hosts.map((x) => [x.id, x.online]));
    const prevDl = new Map(S.lib.games.filter((g) => g.download || g.sources.some((x) => x.updating)).map((g) => [g.key, g]));
    S.lib = await gamo.library(force);
    // értesítések: letöltés / frissítés befejeződött, új frissítés indult
    if (S.libLoaded) {
      for (const g of S.lib.games) {
        const was = prevDl.get(g.key);
        const upd = g.sources.some((x) => x.updating);
        if (was && !g.download && !upd) toast(`✓ Letöltés kész: ${g.name}`, 'ok', 6000);
        else if (!was && (g.download || upd)) toast(`⭳ ${g.download ? 'Letöltés' : 'Frissítés'} indult: ${g.name}`, '', 5000);
      }
    }
    S.libLoaded = true; S.libAt = Date.now();
    for (const host of S.lib.hosts) S.hostStatus[host.id] = { online: host.online, error: host.error };
    renderHostChip();
    if (announce) toast(`${S.lib.games.length} játék a könyvtárban`, 'ok', 2500);
    void prevOnline;
  } catch (e) {
    toast(`Könyvtár hiba: ${e.message}`, 'err');
  } finally {
    S.libLoading = false;
    if (!S.detail) refreshLibViews();
    if (S.tab === 'hosts') renderHosts(false);
    if (S.tab === 'settings' && S.setCat === 'accounts' && !Nav.depth()) renderSettings(); // a gaming PC fiókjai a könyvtárral együtt frissülnek
  }
}

async function searchLibrary() {
  const q = await OSK.prompt({ title: 'Keresés a könyvtárban', value: S.filter });
  if (q === null) return;
  S.filter = q.trim();
  renderLibrary(true);
}

function sortGames(list, mode) {
  const a = [...list];
  if (mode === 'name') a.sort((x, y) => x.name.localeCompare(y.name, 'hu', { numeric: true }));
  else if (mode === 'playtime') a.sort((x, y) => (y.playSec - x.playSec) || x.name.localeCompare(y.name, 'hu', { numeric: true }));
  else a.sort((x, y) => (y.lastPlayed - x.lastPlayed) || x.name.localeCompare(y.name, 'hu', { numeric: true }));
  return a;
}

const LIB_FILTERS = {
  available: { label: 'Csak elérhető', fn: (g) => g.available },
  local: { label: 'Ezen a gépen telepítve', fn: (g) => g.localAvailable },
  stream: { label: 'Streamelhető', fn: (g) => g.remoteOnline },
  installed: { label: 'Telepítve (bárhol)', fn: (g) => g.sources.length > 0 },
  notinstalled: { label: 'Nincs telepítve', fn: (g) => !g.sources.length },
  steam: { label: 'Steam', fn: (g) => g.store === 'steam' },
  epic: { label: 'Epic Games', fn: (g) => g.store === 'epic' },
  gog: { label: 'GOG', fn: (g) => g.store === 'gog' },
  msstore: { label: 'Microsoft Store', fn: (g) => g.store === 'msstore' },
  ubisoft: { label: 'Ubisoft Connect', fn: (g) => g.store === 'ubisoft' },
  custom: { label: 'Egyedi', fn: (g) => g.store === 'custom' },
};

// Csempekép a csempe AKTUÁLIS alakjához (álló / négyzetes / fekvő – a kijelölt kezdőképernyős csempe szélesebb is lesz):
// a jelöltek közül a képarányban legközelebbit választja; ha egyik sem illik, a teljes képet mutatja elmosott háttéren
// (vágás helyett). Steam játékoknál: álló borító, széles kapszula, fejléc és a „hero” kép + logó (négyzetes / fekvő csempékhez).
const ART_RATIO = new Map(); // kép URL → mért képarány (nem Steam képeknél)
const ART_BAD = new Set(); // nem betölthető kép URL-ek
let artObserver = null;
function artCandidates(item) {
  const c = [];
  const sid = item.store === 'steam' && /^\d+$/.test(String(item.storeId || '')) ? item.storeId : null;
  if (sid) {
    const b = `https://cdn.cloudflare.steamstatic.com/steam/apps/${sid}`;
    c.push({ src: `${b}/library_600x900.jpg`, r: 2 / 3 });
    c.push({ src: `${b}/capsule_616x353.jpg`, r: 616 / 353 });
    c.push({ src: `${b}/header.jpg`, r: 460 / 215 });
    c.push({ src: `${b}/library_hero.jpg`, logo: `${b}/logo.png`, hero: true });
  }
  for (const src of [item.cover, item.coverFallback]) if (src && !c.some((x) => x.src === src)) c.push({ src, r: ART_RATIO.get(src) || null });
  return c.filter((x) => !ART_BAD.has(x.src) && !(x.logo && ART_BAD.has(x.logo)));
}
function artScore(x, tr) {
  // a hero kép (+ logó) középre vágva a négyzetes és enyhén fekvő csempéken mutat jól
  if (x.hero) return tr >= 0.85 && tr <= 1.45 ? 0.1 : 9;
  if (!x.r) return 0.5; // még ismeretlen arány: közepes jelölt, a betöltés után pontosítunk
  return Math.abs(Math.log(x.r / tr));
}
// Képek betöltése és dekódolása egyszer (gyorsítótárban) – a csempén csak teljesen kész kép jelenik meg
const ART_LOAD = new Map();
function loadArt(src) {
  if (!ART_LOAD.has(src)) {
    ART_LOAD.set(src, new Promise((res, rej) => {
      const im = new Image();
      im.decoding = 'async';
      im.onload = () => (im.decode ? im.decode().catch(() => {}) : Promise.resolve()).then(() => res({ w: im.naturalWidth, h: im.naturalHeight }));
      im.onerror = () => { ART_BAD.add(src); rej(new Error('kép hiba')); };
      im.src = src;
    }));
  }
  return ART_LOAD.get(src);
}
// A csempe VÉGLEGES mérete (a kijelölt kezdőképernyős csempe szélesedése még csak most indul): egy átmenet nélküli
// rejtett másolatot mérünk le – így az új kép már a nagyítás kezdetén megjelenik, nem utána
function finalRatio(tile) {
  if (tile.closest('#home-rows')) {
    const c = document.createElement('div');
    c.className = tile.className;
    c.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;transition:none;animation:none;pointer-events:none';
    tile.parentElement.append(c);
    const w = c.offsetWidth, hh = c.offsetHeight;
    c.remove();
    if (w && hh) return w / hh;
  }
  return tile.clientWidth && tile.clientHeight ? tile.clientWidth / tile.clientHeight : 0;
}
function pickArt(item, tr) {
  const list = artCandidates(item);
  let best = null, bs = Infinity;
  for (const x of list) { const sc = artScore(x, tr); if (sc < bs) { bs = sc; best = x; } }
  return best ? { best, fit: bs > 0.22 } : null;
}
// az összes képváltozat előtöltése (amint a csempe látható) – a váltás így azonnali
function preloadArt(tile) {
  const st = tile._art;
  if (!st || st.pre) return;
  st.pre = true;
  for (const x of artCandidates(st.item)) {
    loadArt(x.src).then((d) => { if (!x.r && !x.hero) ART_RATIO.set(x.src, d.w / d.h); }).catch(() => {});
    if (x.logo) loadArt(x.logo).catch(() => {});
  }
}
async function applyArt(tile, ratio) {
  const st = tile._art;
  if (!st || !tile.isConnected) return;
  const tr = ratio || finalRatio(tile);
  if (!tr) return;
  const token = ++st.token;
  for (let guard = 0; guard < 10; guard++) {
    const pk = pickArt(st.item, tr);
    if (!pk) { st.fallback(); return; }
    const { best, fit } = pk;
    if (st.cur === best.src && st.fit === fit) return; // már ez látszik
    try {
      const dim = await loadArt(best.src);
      if (!best.r && !best.hero && !ART_RATIO.has(best.src)) { ART_RATIO.set(best.src, dim.w / dim.h); continue; }
      if (best.hero) await loadArt(best.logo).catch(() => { throw new Error('logó'); });
    } catch { continue; }
    if (token !== st.token || !tile.isConnected) return;
    showArt(tile, best, fit);
    return;
  }
}
// új képréteg áttűnéssel a régi fölé (a régi a beúszás után eltűnik)
function showArt(tile, best, fit) {
  const st = tile._art;
  const layer = h('div', { class: `art-layer${fit ? ' fit' : ''}${best.hero ? ' hero' : ''}${st.layer ? '' : ' first'}` },
    fit && !best.hero ? h('img', { class: 'art-bg', src: best.src, alt: '', draggable: 'false' }) : null,
    h('img', { class: 'art', src: best.src, alt: '', draggable: 'false' }),
    best.hero ? h('img', { class: 'art-logo', src: best.logo, alt: '', draggable: 'false' }) : null);
  const old = st.layer;
  if (old) old.after(layer); else tile.prepend(layer);
  st.layer = layer; st.cur = best.src; st.fit = fit;
  requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.add('in')));
  if (old) setTimeout(() => old.remove(), 420);
}
let artIO = null, artRO = null;
function coverEl(item, cls = 'tile') {
  const tile = h('div', { class: cls });
  const fallback = () => {
    tile.querySelectorAll('.art-layer').forEach((x) => x.remove());
    tile._art = null;
    if (tile.querySelector('.ph')) return;
    const ini = (item.name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
    tile.prepend(h('div', { class: 'ph' }, h('div', { class: 'ini' }, ini), item.name));
  };
  if (!artCandidates(item).length) { fallback(); return tile; }
  tile._art = { item, cur: null, fit: null, token: 0, layer: null, pre: false, timer: 0, fallback };
  if (!artIO) {
    artIO = new IntersectionObserver((ents) => { for (const e of ents) if (e.isIntersecting) { preloadArt(e.target); applyArt(e.target); } }, { rootMargin: '300px' });
    // egyéb méretváltozás (ablak, téma): a végleges méretre, kis késleltetéssel
    artRO = new ResizeObserver((ents) => { for (const e of ents) { const st = e.target._art; if (!st || !st.layer) continue; clearTimeout(st.timer); st.timer = setTimeout(() => applyArt(e.target), 300); } });
  }
  artIO.observe(tile); artRO.observe(tile);
  // kijelölés / kijelölés megszűnése: azonnal a végleges alakhoz illő kép (a nagyítással együtt úszik be)
  new MutationObserver(() => {
    const f = tile.classList.contains('focused');
    if (f === tile._artFocused) return;
    tile._artFocused = f;
    if (tile._art && tile._art.layer) applyArt(tile);
  }).observe(tile, { attributes: true, attributeFilter: ['class'] });
  return tile;
}

function statusBadge(e) {
  if (!e.sources.length) return h('div', { class: 'st', title: 'Nincs telepítve', html: ICONS.download });
  if (!e.available) return h('div', { class: 'st off', title: 'A távoli gép nem elérhető', html: ICONS.cloudOff });
  if (e.remoteOnline) return h('div', { class: 'st', title: 'Streamelhető', html: ICONS.cloud });
  return h('div', { class: 'st', title: 'Ezen a gépen', html: ICONS.laptop });
}

function gameTile(e) {
  const t = coverEl(e, `tile focusable${e.available ? '' : ' unavailable'}`);
  t.dataset.scroll = 'center';
  t.dataset.key = e.key;
  t.append(statusBadge(e));
  if (e.fav) t.append(h('div', { class: 'fav' }, uiIcon('starFill')));
  if (e.running && e.running.length) { t.classList.add('is-running'); t.append(h('div', { class: 'run-badge' }, '● FUT')); }
  if (e.download) t.append(h('div', { class: 'prog' }, h('div', { style: `width:${e.download.pct}%` })), h('div', { class: 'flag' }, `${e.download.pct}%`));
  if (!e.sources.length) t.classList.add('notinstalled');
  t.append(h('div', { class: 'ttl' }, e.name));
  t.addEventListener('navfocus', () => { S.focusedKey = e.key; setHero(e); scrollRowIntoView(t); });
  t.addEventListener('click', () => (e.available && e.sources.length ? play(e) : openDetail(e)));
  return t;
}

// Függőlegesen a fókuszált sor kerüljön a sorok tetejére (konzolos "sor-ugrás")
function scrollRowIntoView(el, rows = $('#rows')) {
  if (!rows) return;
  if (el.closest('.shelf.wrap')) { // rácsban a csempe sorához görgetünk
    const top = rows.scrollTop + el.getBoundingClientRect().top - rows.getBoundingClientRect().top - 60;
    rows.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    return;
  }
  const row = el.closest('.lib-row');
  if (row) rows.scrollTo({ top: Math.max(0, row.offsetTop - 16), behavior: 'smooth' });
}

function sourceSummary(e) {
  if (!e.sources) return '';
  if (!e.sources.length) return 'Saját játék · nincs telepítve';
  const on = e.sources.filter((s) => s.online);
  if (!on.length) return `Nem elérhető – ${e.sources.map((s) => s.hostName).join(', ')} offline`;
  return on.map((s) => (s.local ? 'Ezen a gépen' : `Stream: ${s.hostName}`)).join('  ·  ');
}

function setHero(e) {
  $('#hero-title').textContent = e.name || '';
  const badge = $('#hero-store');
  badge.className = `badge ${e.store || ''}`;
  badge.textContent = e.store ? STORE_LABEL[e.store] || e.store : '';
  badge.style.display = e.store ? '' : 'none';
  let sub = e.sub || '';
  if (!sub && e.sources) {
    const parts = [e.running && e.running.length ? `▶ Fut: ${e.running[0].hostName} (${fmtSince(e.running[0].since)})` : sourceSummary(e)];
    if (e.playSec) parts.push(`${fmtTime(e.playSec)} játékidő`);
    if (e.lastPlayed) parts.push(`utoljára: ${fmtDate(e.lastPlayed)}`);
    sub = parts.join('  ·  ');
  }
  $('#hero-sub').textContent = sub;
  const acts = $('#hero-actions');
  acts.style.visibility = e.sources ? 'visible' : 'hidden';
  if (e.sources) {
    const isRunning = e.running && e.running.length;
    if (isRunning) {
      acts.replaceChildren(
        h('span', { class: 'hint' }, h('b', { class: 'btn-a' }, 'A'), 'Folytatás'),
        h('span', { class: 'hint' }, h('b', { class: 'btn-start' }, '≡'), 'Lehetőségek (kilépés a játékból)'),
        h('span', { class: 'hint' }, h('b', { class: 'btn-x' }, 'X'), 'Adatlap'));
    } else acts.replaceChildren(
      h('span', { class: 'hint' }, h('b', { class: 'btn-a' }, 'A'), e.available ? 'Játék' : 'Adatlap'),
      e.available ? h('span', { class: 'hint' }, h('b', { class: 'btn-x' }, 'X'), 'Adatlap') : h('span', { class: 'hint off-hint' }, icon('cloudOff'), 'A gép nem elérhető'),
      h('span', { class: 'hint' }, h('b', { class: 'btn-y' }, 'Y'), 'Keresés'));
  }
  setBg(e.hero || e.cover ? [e.hero, e.coverFallback, e.cover].filter(Boolean) : null);
}

let bgToken = 0;
function setBg(urls, el = $('#bg-img')) {
  const my = ++bgToken;
  if (!urls || !urls.length) { el.style.backgroundImage = ''; return; }
  const tryNext = (i) => {
    if (i >= urls.length || my !== bgToken) return;
    const img = new Image();
    img.onload = () => { if (my === bgToken) el.style.backgroundImage = `url("${urls[i]}")`; };
    img.onerror = () => tryNext(i + 1);
    img.src = urls[i];
  };
  tryNext(0);
}

// ---------------- Adatlap ----------------
async function openDetail(e) {
  const first = !S.detail;
  S.detail = e;
  renderDetail(e);
  $('#detail').classList.remove('hidden');
  if (first) {
    Nav.push(() => $('#detail'), {
      b: () => { Sound.back(); closeDetail(); },
      y: () => { toggleFav(S.detail); return true; },
      lb: () => true, rb: () => true,
    });
  }
  const d = await gamo.details(e.key).catch(() => null);
  if (S.detail && S.detail.key === e.key && d) renderDetailInfo(e, d);
}

function closeDetail() {
  if (!S.detail) return;
  S.detail = null;
  $('#detail').classList.add('hidden');
  Nav.pop();
  refreshLibViews();
}

function renderDetail(e) {
  e = S.lib.games.find((g) => g.key === e.key) || e;
  S.detail = e;
  $('#d-cover').replaceChildren(coverEl(e, `tile${e.available ? '' : ' unavailable'}`, true));
  $('#d-title').textContent = e.name;
  const badges = [h('span', { class: `badge ${e.store}` }, STORE_LABEL[e.store] || e.store)];
  if (e.fav) badges.push(h('span', { class: 'badge' }, uiIcon('starFill'), ' Kedvenc'));
  if (e.hidden) badges.push(h('span', { class: 'badge' }, 'Rejtett'));
  $('#d-badges').replaceChildren(...badges);
  $('#d-sources').replaceChildren(...e.sources.map((s) => h('span', { class: `src ${s.online ? 'on' : 'off'}` },
    icon(s.local ? 'laptop' : s.online ? 'cloud' : 'cloudOff'),
    s.local ? 'Ezen a gépen' : `${s.hostName}${s.online ? ' · streamelhető' : ' · nem elérhető'}`,
    s.updating ? ' · frissül' : '')));

  const acts = [];
  const online = e.sources.filter((s) => s.online);
  const ordered = [...online].sort((a, b) => (b.hostId === e.prefer) - (a.hostId === e.prefer) || (S.state.settings.library.preferLocal ? b.local - a.local : a.local - b.local));
  const runOn = (hid) => e.running && e.running.some((r) => r.hostId === hid);
  ordered.sort((a, b) => runOn(b.hostId) - runOn(a.hostId)); // ahol fut, az legyen az első (folytatás)
  ordered.forEach((s, i) => acts.push(h('button', { class: `pill focusable${i === 0 ? ' primary big' : ''}`, dataset: i === 0 ? { default: '1' } : {}, onclick: () => play(e, s.hostId) },
    icon('play'), runOn(s.hostId) ? `Folytatás${s.local ? '' : ` – ${s.hostName}`}` : (s.local ? 'Játék ezen a gépen' : `Játék – stream: ${s.hostName}`))));
  for (const r of e.running || []) acts.push(h('button', { class: 'pill focusable danger-pill', onclick: () => quitGameFlow(e, r.hostId) }, `⏹ Kilépés a játékból (${r.hostName})`));
  const offline = e.sources.filter((s) => !s.online && !s.local);
  for (const s of offline) {
    const host = libHost(s.hostId);
    if (host && host.mac) acts.push(h('button', { class: `pill focusable${online.length ? '' : ' primary big'}`, dataset: online.length ? {} : { default: '1' }, onclick: () => wakeAndPlay(e, s.hostId) }, icon('power'), `Felébresztés és játék (${s.hostName})`));
  }
  if (!e.sources.length) {
    S.lib.hosts.filter((x) => x.online).forEach((x, i) => acts.push(h('button', { class: `pill focusable${i === 0 ? ' primary big' : ''}`, dataset: i === 0 ? { default: '1' } : {}, onclick: () => installTo(e, x.id) },
      icon('download'), `Telepítés: ${x.local ? 'ezen a gépen' : x.name}`)));
  }
  if (e.download) acts.push(h('div', { class: 'dl-note' }, icon('download'), `Letöltés (${e.download.hostName}): ${e.download.pct}% · ${(e.download.done / 1073741824).toFixed(1)} / ${(e.download.total / 1073741824).toFixed(1)} GB`));
  acts.push(h('button', { class: 'pill focusable', onclick: () => toggleFav(e) }, uiIcon(e.fav ? 'starFill' : 'star'), e.fav ? 'Kedvenc' : 'Kedvencekhez'));
  acts.push(h('button', { class: 'pill focusable', onclick: () => addToCollection(e) }, uiIcon('layers'), 'Gyűjtemény'));
  if (e.sources.length > 1) {
    acts.push(h('button', { class: 'pill focusable', onclick: () => choosePrefer(e) }, `Alapértelmezett: ${e.prefer ? (e.sources.find((s) => s.hostId === e.prefer) || {}).hostName || 'auto' : 'automatikus'}`));
  }
  for (const s of online.filter((x) => !x.local)) acts.push(h('button', { class: 'pill focusable', onclick: () => streamDesktop(hostById(s.hostId)) }, `Asztal: ${s.hostName}`));
  acts.push(h('button', { class: 'pill focusable', onclick: () => moreActions(e) }, uiIcon('more'), 'Továbbiak'));

  const note = !e.available && e.sources.length ? h('div', { class: 'offline-note' }, icon('cloudOff'),
    h('div', {}, h('b', {}, 'A távoli gép jelenleg nem elérhető. '),
      offline.some((s) => (libHost(s.hostId) || {}).mac) ? 'Felébresztheted Wake-on-LAN-nal, vagy indítsd el a gépet kézzel.' : 'Kapcsold be a gaming PC-t, és ellenőrizd, hogy fut-e rajta a InariX Host mód.')) : null;
  $('#d-actions').replaceChildren(...(note ? [note] : []), ...acts);
  if (note) { $('#d-actions').style.flexDirection = ''; }

  $('#d-stats').replaceChildren(
    h('div', { class: 'stat' }, h('div', { class: 'k' }, 'Játékidő (stream)'), h('div', { class: 'v' }, e.playSec ? fmtTime(e.playSec) : '—')),
    h('div', { class: 'stat' }, h('div', { class: 'k' }, 'Indítások'), h('div', { class: 'v' }, String(e.launches || 0))),
    h('div', { class: 'stat' }, h('div', { class: 'k' }, 'Utoljára'), h('div', { class: 'v' }, fmtDate(e.lastPlayed))));
  $('#d-info').replaceChildren(h('div', { class: 'spinner' }));
  $('#d-shots').replaceChildren();
  const bg = $('#detail-bg');
  bg.style.backgroundImage = '';
  setBg([e.hero, e.coverFallback].filter(Boolean), bg);
  requestAnimationFrame(() => Nav.focusFirst());
}

function renderDetailInfo(e, d) {
  const info = [];
  if (d.description) info.push(h('div', {}, htmlToText(d.description)));
  const meta = [];
  const row = (k, v) => { if (v) meta.push(h('div', { class: 'k' }, k), h('div', {}, v)); };
  row('Műfaj', (d.genres || []).join(', '));
  row('Fejlesztő', (d.developers || []).join(', '));
  row('Kiadó', (d.publishers || []).join(', '));
  row('Megjelenés', d.release);
  if (d.metacritic) { meta.push(h('div', { class: 'k' }, 'Metacritic'), h('div', {}, h('span', { class: 'mc' }, String(d.metacritic)))); }
  row('Kontroller', d.controller === 'full' ? 'Teljes támogatás' : d.controller === 'partial' ? 'Részleges támogatás' : '');
  if (d.reviews) row('Értékelések', `${d.reviews.desc} · ${d.reviews.pct}% pozitív · ${d.reviews.total.toLocaleString('hu-HU')} értékelés`);
  if (d.price && e.sources && !e.sources.length) row('Ár', d.price);
  const loc = (e.sources || []).find((s) => s.installDir);
  row('Telepítve', loc ? `${loc.hostName}: ${loc.installDir}` : '');
  if (meta.length) info.push(h('div', { class: 'meta' }, meta));
  if (d.achievements) {
    const a = d.achievements;
    info.push(h('div', { class: 'ach' },
      h('div', { class: 'ach-head' }, h('b', {}, uiIcon('trophy', 'h2-ico'), 'Achievementek'), h('span', {}, `${a.done} / ${a.total}  ·  ${Math.round((a.done / a.total) * 100)}%`)),
      h('div', { class: 'bar' }, h('div', { class: 'fill', style: `width:${(a.done / a.total) * 100}%` })),
      h('div', { class: 'ach-list' }, a.recent.map((x) => h('div', { class: 'ach-item', title: x.desc }, x.icon ? h('img', { src: x.icon, alt: '' }) : null, h('span', {}, x.name))))));
  }
  if (d.news && d.news.length) {
    info.push(h('div', { class: 'set-group' }, 'Hírek'));
    for (const n of d.news) {
      info.push(h('button', { class: 'news focusable', onclick: () => gamo.openExternal(n.url).catch(() => {}) },
        h('div', { class: 'nt' }, n.title), h('div', { class: 'nd' }, `${fmtDate(n.date)} · ${htmlToText(n.text).replace(/\{STEAM_CLAN_IMAGE\}\S*/g, '').slice(0, 200)}…`)));
    }
  }
  if (!info.length) info.push(h('div', { class: 'k' }, d.error ? `Adatok nem tölthetők be: ${d.error}` : 'Ehhez a játékhoz nincs elérhető leírás.'));
  $('#d-info').replaceChildren(...info);
  $('#d-shots').replaceChildren(...(d.screenshots || []).map((src) => h('img', { src, alt: '', loading: 'lazy' })));
}

async function toggleFav(e) {
  const v = !e.fav;
  await gamo.stat(e.key, { fav: v });
  e.fav = v; Sound.select();
  toast(v ? `★ ${e.name} hozzáadva a kedvencekhez` : `${e.name} eltávolítva a kedvencekből`, 'ok', 2000);
  if (S.detail) renderDetail(e); else refreshLibViews();
}

async function toggleHidden(e) {
  const v = !e.hidden;
  await gamo.stat(e.key, { hidden: v });
  e.hidden = v;
  toast(v ? `${e.name} elrejtve (Beállítások → Rejtett játékok)` : `${e.name} újra látható`, 'ok', 3000);
  if (S.detail) closeDetail(); else refreshLibViews();
}

async function choosePrefer(e) {
  const v = await modal({ title: 'Alapértelmezett indítás', body: 'Honnan induljon a játék, ha több helyen is elérhető?',
    items: [{ label: 'Automatikus', value: '__auto' }, ...e.sources.map((s) => ({ label: s.local ? 'Ezen a gépen' : `Stream: ${s.hostName}`, value: s.hostId }))] });
  if (!v) return;
  const prefer = v === '__auto' ? null : v;
  await gamo.stat(e.key, { prefer });
  e.prefer = prefer;
  renderDetail(e);
}

// ---------------- Indítás / stream ----------------
function showLaunch(item, text) {
  S.launching = item; S.launchCancelled = false;
  const cover = $('#launch-cover');
  cover.removeAttribute('src');
  if (item.cover) { cover.src = item.cover; cover.onerror = () => { if (item.coverFallback && cover.src !== item.coverFallback) cover.src = item.coverFallback; }; }
  $('#launch-title').textContent = item.name;
  $('#launch-text').textContent = text;
  $('#launch').classList.remove('hidden');
  Nav.push(() => $('#launch'), {
    b: () => { Sound.back(); S.launchCancelled = true; gamo.stopStream().catch(() => {}); hideLaunch(); },
    a: () => true, x: () => true, y: () => true, lb: () => true, rb: () => true, start: () => true,
  });
}
function hideLaunch() {
  if (!S.launching) return;
  S.launching = null;
  $('#launch').classList.add('hidden');
  Nav.pop();
}
const launchText = (t) => { if (S.launching) $('#launch-text').textContent = t; };

async function play(e, hostId) {
  if (!e.sources.length) { openDetail(e); return; }
  const resuming = e.running && e.running.length;
  showLaunch(e, resuming ? `Folytatás: ${e.running[0].hostName}…` : 'Indítás…');
  if (S.state.settings.stream.wifiWarn && e.remoteOnline) {
    gamo.network().then((n) => {
      if (n && n.type === 'wifi' && n.signal !== null && n.signal < 50) toast(`Gyenge Wi-Fi jel (${n.signal}%) – a stream akadozhat. Vezetékes kapcsolat vagy 5 GHz ajánlott.`, 'err', 7000);
    }).catch(() => {});
  }
  try {
    const r = await gamo.play(e.key, hostId);
    if (r.local) { launchText(r.alreadyRunning ? 'Már fut ezen a gépen.' : 'Elindítva ezen a gépen. Jó játékot!'); setTimeout(hideLaunch, 3000); }
    else if (r.builtin) {
      launchText(r.alreadyRunning ? `Visszacsatlakozás: ${r.hostName}…` : `Kapcsolódás: ${r.hostName}…`);
      // játékonkénti beállítások: felbontás és vezérlés (kontroller vagy egér mód)
      const pf = r.prefs || {};
      const pr = pf.preset && STREAM_PRESETS[pf.preset] ? { width: STREAM_PRESETS[pf.preset][0], height: STREAM_PRESETS[pf.preset][1], fps: STREAM_PRESETS[pf.preset][2] } : {};
      await startBuiltin(r.hostId, { ...pr, desktop: pf.input === 'mouse', game: { key: e.key, name: e.name, hostId: r.hostId, gameId: r.gameId, resume: !!r.alreadyRunning } });
    }
    else launchText(`Csatlakozás a streamhez: ${r.hostName}…`);
  } catch (err) {
    hideLaunch();
    if (/^OFFLINE/.test(err.message)) { toast('A gép nem elérhető', 'err'); await loadLibrary(false); openDetail(e); return; }
    const src = e.sources && e.sources.find((s) => s.hostId === hostId || (!hostId && !s.local));
    handleStreamError(err.message, src ? hostById(src.hostId) : null);
  }
}

async function wakeAndPlay(e, hostId) {
  const host = hostById(hostId);
  if (S.detail) closeDetail();
  showLaunch(e, `${host.name} felébresztése…`);
  try { await gamo.wake(hostId); } catch (err) { hideLaunch(); toast(err.message, 'err'); return; }
  const t0 = Date.now();
  while (Date.now() - t0 < 150000) {
    await new Promise((r) => setTimeout(r, 4000));
    if (S.launchCancelled) return;
    launchText(`Várakozás a gépre… ${Math.round((Date.now() - t0) / 1000)} mp`);
    const st = await gamo.ping(hostId).catch(() => ({ online: false }));
    if (st.online) {
      launchText(`${host.name} online! Játék indítása…`);
      await loadLibrary(true);
      hideLaunch();
      return play(S.lib.games.find((g) => g.key === e.key) || e, hostId);
    }
  }
  hideLaunch();
  toast(`${host.name} nem ébredt fel 2,5 percen belül. Engedélyezve van a Wake-on-LAN a BIOS-ban és a hálózati kártyán?`, 'err', 9000);
}

async function streamDesktop(host) {
  if (!host) return;
  const builtin = (S.state.settings.stream.engine || 'builtin') === 'builtin';
  showLaunch({ name: `${host.name} – asztal` }, builtin ? 'Kapcsolódás…' : 'Csatlakozás a streamhez (Moonlight)…');
  try {
    const r = await gamo.streamDesktop(host.id);
    if (r && r.builtin) await startBuiltin(host.id, { desktop: true }); // asztal: a kontroller egérként működik
  } catch (e) { hideLaunch(); handleStreamError(e.message, host); }
}

// ---- Beépített stream (WebRTC) ----
const STREAM_PRESETS = { '720p60': [1280, 720, 60], '1080p60': [1920, 1080, 60], '1080p120': [1920, 1080, 120], '1440p60': [2560, 1440, 60], '1440p120': [2560, 1440, 120], '4k60': [3840, 2160, 60] };
function builtinOpts() {
  const s = S.state.settings.stream;
  const [width, height, fps] = STREAM_PRESETS[s.preset] || [1920, 1080, 60];
  const codec = { 'H.264': 'h264', HEVC: 'hevc', AV1: 'av1' }[s.codec] || 'auto';
  return { width, height, fps, bitrate: (s.bitrate || 35) * 1000, codec, mic: !!s.mic };
}
async function startBuiltin(hostId, extra = {}) {
  gamo.streamState(true);
  try {
    await StreamClient.start(hostId, { ...builtinOpts(), ...extra }, (end) => {
      gamo.streamState(false);
      hideLaunch();
      if (end.error) toast(`Stream: ${end.error}`, 'err', 7000);
      loadLibrary(false);
    });
    hideLaunch();
  } catch (e) {
    gamo.streamState(false);
    throw e;
  }
}
async function streamSelfTest() {
  showLaunch({ name: 'Stream teszt' }, 'A saját képernyő streamelése önmagának…');
  try {
    await startBuiltin('local', { preview: true });
    toast('Teszt stream fut a jobb alsó sarokban (statisztikával). Leállítás: 10 mp múlva magától.', 'ok', 6000);
    setTimeout(() => StreamClient.stop('teszt vége'), 10000);
  }
  catch (e) { hideLaunch(); toast(`Stream teszt: ${e.message}`, 'err', 8000); }
}

async function handleStreamError(msg, host) {
  toast(msg, 'err', 7000);
  if (/Moonlight nincs telepítve/.test(msg)) {
    if (await confirmBox('Moonlight szükséges', 'A streameléshez a Moonlight kliens kell. Telepítsem most (winget)?', 'Telepítés')) installMoonlight();
  } else if (/párosítva/i.test(msg) && host && !host.local) {
    const v = await modal({ title: 'Párosítás szükséges?', body: 'Ha a Moonlight még nincs párosítva ezzel a géppel, indítsd el a párosítást. Ha a gaming PC-n meg van adva a Sunshine jelszó, ez automatikus; különben egy PIN-t kell beírni a Sunshine webes felületén.', items: [{ label: 'Párosítás indítása', value: 'pair', kind: 'primary' }, { label: 'Moonlight megnyitása', value: 'gui' }, { label: 'Diagnosztika', value: 'diag' }, { label: 'Mégse', value: null }] });
    if (v === 'pair') pairHost(host);
    if (v === 'diag') showDiagnostics();
    if (v === 'gui') gamo.moonlightGui().catch((e) => toast(e.message, 'err'));
  }
}

async function installMoonlight() {
  toast('Moonlight telepítése folyamatban… (1-2 perc)', '', 8000);
  try { const p = await gamo.moonlightInstall(); toast(`Moonlight telepítve: ${p}`, 'ok'); await refreshState(); if (S.tab === 'settings') renderSettings(); }
  catch (e) { toast(e.message, 'err', 9000); }
}

async function wake(host) {
  try { await gamo.wake(host.id); toast(`Ébresztő csomag elküldve: ${host.name}. Kb. 30 mp…`, 'ok', 6000); }
  catch (e) { toast(e.message, 'err'); }
}

// ---------------- Áruház ----------------
function storeHandlers() { return { y: () => { searchStore(); return true; } }; }

// Áruházak: csak azok választhatók, amelyekhez fiók van csatolva (ezen a gépen vagy egy gaming PC-n).
// Steam és GOG: saját felület (kiemelt sorok, keresés); a többinél a saját nem telepített játékok + a webes áruház a beépített böngészőben.
const SHOPS = {
  steam: { native: true },
  gog: { native: true },
  epic: { web: 'https://store.epicgames.com/hu/', search: (q) => `https://store.epicgames.com/hu/browse?q=${encodeURIComponent(q)}&sortBy=relevancy&sortDir=DESC&count=40` },
  msstore: { web: 'https://www.xbox.com/hu-HU/games/browse', search: (q) => `https://www.xbox.com/hu-HU/search/results/games?q=${encodeURIComponent(q)}` },
  ubisoft: { web: 'https://store.ubisoft.com/ie/home', search: (q) => `https://store.ubisoft.com/ie/search?q=${encodeURIComponent(q)}` },
};
function availableShops() {
  const L = ACCOUNT_STORES.filter((p) => SHOPS[p] && (accState(p).connected || steamApiOnly(p) || remoteAcc(p)));
  return L.length ? L : ['steam'];
}
function currentShop() {
  const L = availableShops();
  if (!L.includes(S.store.shop)) S.store.shop = L[0];
  return S.store.shop;
}
async function chooseShop() {
  const L = availableShops();
  const linked = ACCOUNT_STORES.some((p) => accState(p).connected || steamApiOnly(p) || remoteAcc(p));
  const items = L.map((p) => ({ label: `${STORE_LABEL[p]}${SHOPS[p].native ? '' : ' (webes áruház a böngészőben)'}`, value: p, kind: p === S.store.shop ? 'primary' : '' }));
  items.push({ icon: 'accounts', label: 'További fiók csatlakoztatása…', value: '#acc' }, { label: 'Mégse', value: null });
  const v = await modal({ title: 'Áruház', body: linked ? 'A csatolt fiókjaid áruházai.' : 'Még nincs csatolt fiók – addig a Steam áruház érhető el.', items });
  if (!v) return;
  if (v === '#acc') { S.setCat = 'accounts'; setTab('settings'); return; }
  S.store.shop = v; S.store.q = '';
  loadStore('featured');
}

async function searchStore() {
  const shop = currentShop();
  const q = await OSK.prompt({ title: `Keresés: ${STORE_LABEL[shop]}`, value: S.store.q });
  if (q !== null && q.trim() && !SHOPS[shop].native) { Browser.navigate(SHOPS[shop].search(q.trim())); return; }
  if (q === null) return;
  S.store.q = q.trim();
  loadStore(S.store.q ? 'search' : 'featured');
}

async function loadStore(mode) {
  S.store.mode = mode; S.store.loading = true; S.store.error = null; S.store.items = []; S.store.loaded = true;
  renderStore();
  try {
    const shop = currentShop();
    S.store.rows = null;
    if (mode === 'search') S.store.items = await gamo.storeSearch(S.store.q, shop);
    else if (mode === 'owned') S.store.items = (await gamo.owned(S.storeTarget)).filter((it) => it.store === shop);
    else if (mode === 'wishlist') S.store.items = S.state.settings.wishlist.filter((it) => (it.store || 'steam') === shop);
    else if (!SHOPS[shop].native) {
      // webes áruház: a saját, még nem telepített játékok ebből a boltból (a könyvtárból)
      S.store.items = S.lib.games.filter((g) => g.store === shop && !g.sources.length)
        .map((g) => ({ store: g.store, storeId: g.storeId, installId: g.installId, name: g.name, cover: g.cover, coverFallback: g.coverFallback, owned: true }));
    } else { S.store.rows = await gamo.storeRows(shop); S.store.items = S.store.rows.flatMap((r) => r.items); }
  } catch (e) { S.store.error = e.message; }
  S.store.loading = false;
  if (S.tab === 'store') { renderStore(); requestAnimationFrame(() => { const f = $('#store-grid .focusable'); if (f && mode !== 'featured') Nav.focus(f, { silent: true }); }); }
}

async function chooseStoreTarget() {
  const items = S.lib.hosts.map((x) => ({ label: `${x.local ? 'Ez a gép' : x.name}${x.online ? '' : ' (offline)'}`, value: x.id, kind: x.id === S.storeTarget ? 'primary' : '' }));
  const v = await modal({ title: 'Hova telepítsünk?', items });
  if (!v) return;
  S.storeTarget = v;
  gamo.settings({ lastHostId: v }).then(applyState).catch(() => {});
  if (S.store.mode === 'owned') loadStore('owned'); else renderStore();
}

function renderStore() {
  const target = hostById(S.storeTarget) || hostById('local');
  $('#store-host').textContent = target.name;
  const shop = currentShop();
  $('#store-shop-name').textContent = STORE_LABEL[shop];
  $('#store-shop-ic').replaceChildren(uiIcon('store'));
  $('#store-search-ic').replaceChildren(uiIcon('search'));
  $('#store-shop').onclick = chooseShop;
  const qEl = $('#store-q');
  qEl.textContent = S.store.q || `Keresés: ${STORE_LABEL[shop]}${SHOPS[shop].native ? '' : ' (böngészőben)'}…`;
  qEl.className = S.store.q ? 'val' : 'ph';
  $('#store-search').onclick = searchStore;
  $('#store-owned').onclick = () => loadStore('owned');
  $('#store-home').onclick = () => { S.store.q = ''; loadStore('featured'); };
  $('#store-wish').onclick = () => loadStore('wishlist');
  $('#store-wish').replaceChildren(uiIcon('heart'), ` Kívánságlista (${S.state.settings.wishlist.length})`);
  $('#store-target').onclick = chooseStoreTarget;
  if (!S.store.loaded) { loadStore('featured'); return; }
  $('#store-title').textContent = { featured: SHOPS[shop].native ? '' : `${STORE_LABEL[shop]} – a saját, nem telepített játékaid`, search: `Találatok: „${S.store.q}”`, owned: `Saját könyvtár – nincs telepítve (${target.name})`, wishlist: 'Kívánságlista' }[S.store.mode];
  const grid = $('#store-grid');
  const rowsEl = $('#store-rows');
  grid.innerHTML = '';
  rowsEl.innerHTML = '';
  const showRows = S.store.mode === 'featured' && !S.store.loading && !S.store.error && S.store.rows;
  rowsEl.classList.toggle('hidden', !showRows);
  grid.classList.toggle('hidden', !!showRows);
  $('#store-title').classList.toggle('hidden', !!showRows);
  if (showRows) {
    for (const r of S.store.rows) {
      const shelf = h('div', { class: 'shelf' });
      for (const it of r.items) shelf.append(storeTile(it));
      rowsEl.append(h('div', { class: 'lib-row' }, h('div', { class: 'row-title' }, r.title, h('span', { class: 'count' }, String(r.items.length))), shelf));
    }
    return;
  }
  if (S.store.loading) { grid.append(h('div', { class: 'empty' }, h('span', { class: 'spinner' }))); return; }
  if (S.store.error) { grid.append(h('div', { class: 'empty' }, `Hiba: ${S.store.error}`)); return; }
  if (S.store.mode === 'featured' && !SHOPS[shop].native) {
    grid.append(h('button', { class: 'grid-item focusable web-shop', dataset: { default: '1' }, onclick: () => Browser.navigate(SHOPS[shop].web) },
      h('div', { class: 'tile web-shop-tile' }, uiIcon('browser'), h('b', {}, `${STORE_LABEL[shop]} áruház`), h('small', {}, 'Megnyitás a beépített böngészőben')),
      h('div', { class: 'cap' }, h('div', {}, 'Böngészés és vásárlás'), h('div', { class: 'p' }, 'webes áruház'))));
  }
  if (!S.store.items.length && !(S.store.mode === 'featured' && !SHOPS[shop].native)) {
    grid.append(h('div', { class: 'empty' }, S.store.mode === 'owned'
      ? 'Nincs megjeleníthető saját játék. A Steam könyvtárhoz add meg a Steam Web API kulcsot a cél gépen (Beállítások → Host mód), Epichez telepítsd a legendary CLI-t.'
      : 'Nincs találat.'));
    return;
  }
  for (const it of S.store.items) {
    const key = `${it.store}:${it.storeId}`;
    const have = S.lib.games.find((g) => g.key === key && g.sources.length);
    const tile = coverEl(it, 'tile');
    if (have) tile.append(h('div', { class: 'flag' }, 'Telepítve'));
    if (it.discount) tile.append(h('div', { class: 'disc' }, `-${it.discount}%`));
    grid.append(h('div', { class: 'grid-item focusable', onclick: () => (it.store === 'steam' && !it.owned ? openStoreDetail(it) : storeItem(it)) }, tile,
      h('div', { class: 'cap' }, h('div', {}, it.name), h('div', { class: 'p' }, it.owned ? `${STORE_LABEL[it.store]} · saját` : it.price || ''))));
  }
}

function storeTile(it) {
  const t = coverEl(it, 'tile focusable');
  t.dataset.scroll = 'center';
  const have = S.lib.games.find((g) => g.key === `${it.store}:${it.storeId}` && g.sources.length);
  if (have) t.append(h('div', { class: 'flag' }, 'Telepítve'));
  if (it.discount) t.append(h('div', { class: 'disc' }, `-${it.discount}%`));
  t.append(h('div', { class: 'ttl' }, it.name, it.price ? h('div', { class: 'tp' }, it.price) : null));
  t.addEventListener('navfocus', () => scrollRowIntoView(t, $('#store-rows')));
  t.addEventListener('click', () => (it.store === 'steam' ? openStoreDetail(it) : storeItem(it)));
  return t;
}

async function storeItem(it) {
  const target = hostById(S.storeTarget) || hostById('local');
  const have = S.lib.games.find((g) => g.key === `${it.store}:${it.storeId}`);
  if (have) {
    const v = await modal({ title: it.name, body: `Már a könyvtáradban van (${have.sources.map((s) => s.hostName).join(', ')}).`, items: [{ label: 'Adatlap', value: 'detail', kind: 'primary' }, { label: `Telepítés ide is: ${target.name}`, value: 'install' }, { label: 'Mégse', value: null }] });
    if (v === 'detail') { setTab('library'); openDetail(have); return; }
    if (v !== 'install') return;
  } else {
    // megvásárolt (saját) játék: telepítés; áruházi (még nem saját) GOG játék: adatlap a böngészőben vagy a GOG Galaxyban
    const buy = !it.owned && it.store !== 'steam';
    const items = buy
      ? [{ icon: 'browser', label: 'Adatlap és vásárlás (böngésző)', value: 'web', kind: 'primary' }, { icon: 'download', label: `Megnyitás a GOG Galaxyban: ${target.name}`, value: 'install' }]
      : [{ icon: 'download', label: 'Telepítés', value: 'install', kind: 'primary' }];
    items.push({ icon: 'hosts', label: 'Másik gépre…', value: 'target' }, { label: 'Mégse', value: null });
    const v = await modal({
      title: it.name,
      body: `${STORE_LABEL[it.store]}${it.price ? ` · ${it.price}` : ''}${it.owned ? ' · saját' : ''}\nCél gép: ${target.name}${it.store === 'steam' && !it.owned ? '\n\nHa még nincs meg a játék, a Steam a vásárlási oldalt nyitja meg.' : ''}`,
      items,
    });
    if (v === 'web') { Browser.navigate(it.url || `https://www.gog.com/game/${it.storeId}`); return; }
    if (v === 'target') { await chooseStoreTarget(); return storeItem(it); }
    if (v !== 'install') return;
  }
  try {
    const r = await gamo.install(target.id, { store: it.store, storeId: it.storeId, name: it.name });
    toast(r.message || 'A telepítő megnyílt', 'ok', 6000);
    if (r.needsConfirm && !target.local) {
      if (await confirmBox('Megerősítés szükséges', 'A telepítő ablak megnyílt a gaming PC-n. Megnyissam az asztal streamet, hogy megerősítsd?', 'Asztal streamelése')) streamDesktop(target);
    } else if (r.needsConfirm && target.local) gamo.hide();
    setTimeout(() => loadLibrary(true), 30000);
  } catch (e) { toast(e.message, 'err'); }
}

// ---------------- Gépek ----------------
function hostsHandlers() {
  refreshState().then(() => { if (S.tab === 'hosts') renderHosts(); }).catch(() => {});
  return { y: () => { loadLibrary(true, true); return true; } };
}

function renderHosts() {
  const list = $('#host-list');
  list.innerHTML = '';
  for (const host of S.state.hosts) {
    const lh = libHost(host.id) || {};
    const online = host.local || lh.online;
    const dot = h('i', { class: `dot ${host.local || lh.online !== undefined ? (online ? 'on' : 'off') : 'wait'}` });
    let sub;
    if (host.local) sub = `Helyi játékok · ${lh.count || 0} játék`;
    else {
      sub = `${host.address} · ${online ? 'online' : (lh.error || 'offline')} · ${lh.count || 0} játék${!online && lh.cachedAt ? ` (mentett lista: ${fmtDate(lh.cachedAt)})` : ''}`;
      const info = online && S.state.hostInfo && S.state.hostInfo[host.id];
      if ((S.state.settings.stream.engine || 'builtin') === 'builtin') {
        if (info && info.stream && !info.stream.available) sub += ' · ⚠ beépített stream nem elérhető';
        else if (info && info.stream && info.stream.vigem === false) sub += ' · ⚠ nincs ViGEmBus (kontroller)';
      } else {
        const sun = info && info.sunshine;
        if (sun && !sun.installed) sub += ' · ⚠ Sunshine nincs telepítve';
        else if (sun && !sun.running) sub += ' · ⚠ Sunshine nem fut';
      }
    }
    list.append(h('button', { class: 'card focusable', onclick: () => hostMenu(host) },
      h('div', { class: 't' }, dot, host.name, host.local ? null : icon(online ? 'cloud' : 'cloudOff')),
      h('div', { class: 's' }, sub)));
  }
  $('#host-discover').onclick = discoverHosts;
  $('#host-manual').onclick = manualHost;
  const hm = S.state.settings.hostMode;
  $('#hosts-help').innerHTML = `<b>Hogyan működik?</b><br>
    1. A <b>gaming PC-n</b> telepítsd a <b>Sunshine</b>-t és a <b>InariXet</b>, ott kapcsold be a <b>Beállítások → Host mód</b>-ot (ott látod a PIN-t is).<br>
    2. A <b>laptopon</b> itt add hozzá a gépet (keresés a hálózaton vagy IP-cím + PIN).<br>
    3. Párosítsd a Moonlightot (gép → <b>Moonlight párosítás</b>), a PIN-t a Sunshine webes felületén (<code>https://localhost:47990</code>) kell beírni.<br>
    A könyvtárban minden gép játékai együtt látszanak. Ha egy gép offline, a játékai <b>áthúzott felhővel</b> jelennek meg; ami a laptopon is fent van, az helyben is indítható.
    ${hm.enabled ? `<br><br>Ez a gép is host: <b>${esc(hm.name)}</b>, PIN: <b>${esc(hm.token)}</b>` : ''}`;
}

async function hostMenu(host) {
  if (host.local) {
    const v = await modal({ title: 'Ez a gép', body: 'A laptopon telepített játékok közvetlenül, stream nélkül indulnak.', items: [{ label: 'Újrakeresés', value: 'scan', kind: 'primary' }, { label: 'Bezárás', value: null }] });
    if (v === 'scan') loadLibrary(true, true);
    return;
  }
  const lh = libHost(host.id) || {};
  const items = [];
  if (lh.online) items.push({ label: 'Asztal streamelése', value: 'desktop', kind: 'primary' });
  if (!lh.online && host.mac) items.push({ label: 'Felébresztés (Wake-on-LAN)', value: 'wake', kind: 'primary' });
  items.push({ label: 'Moonlight párosítás', value: 'pair' });
  items.push({ label: 'Átnevezés', value: 'name' });
  items.push({ label: 'PIN módosítása', value: 'pin' });
  items.push({ label: 'Stream cím (ha eltér az IP-től)', value: 'streamHost' });
  items.push({ label: 'MAC cím (Wake-on-LAN)', value: 'mac' });
  items.push({ label: 'Eltávolítás', value: 'remove', kind: 'danger' });
  const v = await modal({ title: host.name, body: `${host.address}:${host.port}${host.mac ? `\nMAC: ${host.mac}` : ''}`, items });
  if (v === 'desktop') streamDesktop(host);
  else if (v === 'pair') pairHost(host);
  else if (v === 'wake') { await wake(host); setTimeout(() => loadLibrary(false), 30000); }
  else if (v === 'remove') {
    if (await confirmBox('Eltávolítás', `${host.name} törlése a listából? A mentett játéklistája is eltűnik a könyvtárból.`, 'Törlés')) {
      await gamo.hostRemove(host.id); await refreshState(); await loadLibrary(false); renderHosts();
    }
  } else if (['pin', 'streamHost', 'mac', 'name'].includes(v)) {
    const titles = { pin: 'Host PIN', streamHost: 'Moonlight cím (pl. IP vagy gépnév)', mac: 'MAC cím (pl. aa:bb:cc:dd:ee:ff)', name: 'Gép neve' };
    const key = v === 'pin' ? 'token' : v;
    const val = await OSK.prompt({ title: titles[v], value: host[key] || '', numeric: v === 'pin' });
    if (val === null) return;
    await gamo.hostUpdate(host.id, { [key]: val.trim() });
    await refreshState(); await loadLibrary(false); renderHosts(); toast('Mentve', 'ok', 2000);
  }
}

async function addHostFlow(base) {
  const token = await OSK.prompt({ title: `PIN a gaming PC-ről (${base.name || base.address}) – ott: Beállítások → Host mód`, numeric: true });
  if (token === null) return;
  try {
    const host = await gamo.hostAdd({ ...base, token });
    toast(`Hozzáadva: ${host.name}`, 'ok');
    await refreshState();
    await loadLibrary(true);
    renderHosts();
    if ((S.state.settings.stream.engine || 'builtin') === 'moonlight' && await confirmBox('Moonlight párosítás', `A streameléshez a Moonlightot is párosítani kell a(z) ${host.name} géppel (egyszer kell). Indítsam most?`, 'Párosítás')) {
      await pairHost(host);
    }
  } catch (e) { toast(`Nem sikerült: ${e.message}`, 'err', 7000); }
}

async function discoverHosts() {
  toast('Gépek keresése a hálózaton…', '', 2000);
  let found = [];
  try { found = await gamo.discover(); } catch (e) { toast(e.message, 'err'); return; }
  const known = new Set(S.state.hosts.map((x) => x.address));
  found = found.filter((f) => !known.has(f.address));
  if (!found.length) { toast('Nem találtam új InariX gépet. Be van kapcsolva a Host mód a gaming PC-n, és a tűzfal engedi?', 'err', 8000); return; }
  const v = await modal({ title: 'Talált gépek', items: [...found.map((f, i) => ({ label: `${f.name}  ·  ${f.address}`, value: String(i), kind: i === 0 ? 'primary' : '' })), { label: 'Mégse', value: null }] });
  if (v === null || v === undefined) return;
  const f = found[Number(v)];
  const mac = (f.macs || []).find((m) => m.ip === f.address) || (f.macs || [])[0];
  addHostFlow({ name: f.name, address: f.address, port: f.port, mac: mac ? mac.mac : '' });
}

async function manualHost() {
  const addr = await OSK.prompt({ title: 'A gaming PC IP-címe vagy neve (pl. 192.168.1.20)', numeric: true });
  if (!addr) return;
  addHostFlow({ address: addr.trim() });
}

// ---------------- Beállítások: lásd settings.js ----------------
// ---------------- Játékok hozzáadása / eltávolítása (egyszerűen) ----------------
// A launcherek (Steam, Epic, GOG, Ubisoft, MS Store) játékai maguktól megjelennek; ez a többiekhez kell.
const machines = () => S.lib.hosts.filter((x) => x.local || x.online);
const mName = (x) => (x.local ? 'ez a gép' : x.name);

// Keresés minden gépen, és minden talált játék azonnal bekerül (amit nem kérsz, a játék menüjéből eltávolíthatod)
async function scanAndAddAll() {
  const list = machines();
  toast(`Játékok keresése: ${list.map(mName).join(', ')}…`, '', 30000);
  let added = [];
  await Promise.all(list.map(async (hst) => {
    try {
      const games = await gamo.gamesDiscover(hst.id);
      if (games.length) await gamo.gamesCustom(hst.id, { add: games.map((g) => ({ name: g.name, exe: g.exe })) });
      added = added.concat(games.map((g) => g.name));
    } catch (e) { toast(`${mName(hst)}: ${e.message}`, 'err', 6000); }
  }));
  await refreshState();
  await loadLibrary(true, true);
  toast(added.length ? `${added.length} új játék: ${added.slice(0, 4).join(', ')}${added.length > 4 ? '…' : ''}` : 'Nem találtam új játékot – egyesével a „Játék hozzáadása” gombbal adhatsz hozzá', added.length ? 'ok' : '', 6000);
}

// Egyesével: (több gépnél gépválasztás) → .exe kiválasztása → kész (a név a mappából)
async function addCustomGame() {
  const list = machines();
  let host = list.find((x) => x.local) || { id: 'local', local: true };
  if (list.length > 1) {
    const id = await modal({ title: 'Melyik gépen van a játék?', items: [...list.map((x) => ({ icon: x.local ? 'laptop' : 'desktop', label: x.local ? 'Ezen a gépen' : x.name, value: x.id })), { label: 'Mégse', value: null }] });
    if (!id) return;
    host = list.find((x) => x.id === id);
  }
  let exe = host.local ? await gamo.pickExe().catch(() => null) : await OSK.prompt({ title: `${host.name}: a játék .exe fájljának útvonala (pl. D:\\Games\\X\\x.exe)` });
  if (!exe) return;
  exe = exe.trim().replace(/^"|"$/g, '');
  if (!/\.exe$/i.test(exe)) { toast('Ez nem .exe fájl', 'err'); return; }
  const parts = exe.split(/[\\/]/);
  const name = (parts.length > 2 ? parts[parts.length - 2] : parts[parts.length - 1].replace(/\.exe$/i, '')).replace(/[_.]+/g, ' ').trim();
  try {
    await gamo.gamesCustom(host.id, { add: [{ name, exe }], unexclude: [exe] });
    await refreshState();
    await loadLibrary(true, true);
    toast(`Hozzáadva: ${name} (átnevezés: a játék menüjében)`, 'ok', 5000);
  } catch (e) { toast(e.message, 'err'); }
}
// a beállításokból
async function gamesManager() {
  const v = await modal({ title: 'Játékok', items: [{ icon: 'search', label: 'Játékok keresése', value: 'scan', kind: 'primary' }, { icon: 'download', label: 'Játék hozzáadása', value: 'add' }, { label: 'Bezárás', value: null }] });
  if (v === 'scan') scanAndAddAll(); else if (v === 'add') addCustomGame();
}
// Eltávolítás a listából: a hozzáadott játék törlődik (a keresés sem hozza vissza), a többi elrejtésre kerül
async function removeFromList(e) {
  const custom = e.sources.filter((x) => x.gameId && x.gameId.startsWith('custom:'));
  if (custom.length) {
    for (const src of custom) await gamo.gamesCustom(src.hostId, { remove: [src.gameId.slice(7)] }).catch((err) => toast(err.message, 'err'));
    await refreshState();
    await loadLibrary(true, true);
  } else await toggleHidden(e);
  toast(`${e.name} eltávolítva a listából${custom.length ? '' : ' (a „Rejtett” kategóriából visszahozható)'}`, 'ok', 4000);
}
async function renameGame(e) {
  const src = e.sources.find((x) => x.gameId && x.gameId.startsWith('custom:'));
  if (!src) return;
  const name = await OSK.prompt({ title: 'A játék neve', value: e.name });
  if (!name || !name.trim()) return;
  const r = await gamo.gamesCustomList(src.hostId).catch(() => null);
  const g = r && (r.customGames || []).find((x) => String(x.id) === src.gameId.slice(7));
  if (!g) return;
  await gamo.gamesCustom(src.hostId, { remove: [String(g.id)], unexclude: [g.exe] });
  await gamo.gamesCustom(src.hostId, { add: [{ name: name.trim(), exe: g.exe }], unexclude: [g.exe] });
  await refreshState();
  await loadLibrary(true, true);
}

async function showLog() {
  const st = await gamo.state();
  await modal({ title: 'Napló', body: st.logs.join('\n') || '(üres)', log: true, wide: true, items: [{ label: 'Bezárás', value: null }] });
}

function showHelp() {
  return modal({ title: 'Irányítás', wide: true, body:
    'Kontroller:  A – kiválasztás/játék · B – vissza · X – adatlap · Y – keresés / kedvenc · LB/RB – fülváltás · ≡ Start – menü\n\n' +
    'Billentyűzet:  nyilak – mozgás · Enter – kiválasztás · Esc/Backspace – vissza · Q/E vagy Tab – fülváltás · X – adatlap · Y/F5 – keresés · F12 – fejlesztői eszközök\n\n' +
    'Képernyő-billentyűzet:  X – törlés · Y – szóköz · LB/RB – nagybetű · Start – kész. Fizikai billentyűzettel is lehet gépelni, Ctrl+V beillesztés.\n\n' +
    'Stream közben a Moonlight saját kilépő kombinációja: Select+Start+LB+RB (vagy Ctrl+Alt+Shift+Q).',
    items: [{ label: 'Rendben', value: null }] });
}

// ---------------- Boot ----------------
function playBoot() {
  if (S.booting) return;
  S.booting = true;
  const boot = $('#boot');
  boot.classList.remove('hidden', 'out');
  const bl = $('#boot-logo');
  if (bl) bl.src = `../../assets/inarix-logo.svg?t=${Date.now()}`;
  boot.querySelectorAll('*').forEach((n) => { n.style.animation = 'none'; void n.getBoundingClientRect(); n.style.animation = ''; });
  document.body.classList.add('booting');
  Sound.boot();
  const swallow = () => true;
  let finished = false;
  const finish = () => {
    if (finished) return; finished = true;
    boot.classList.add('out');
    document.body.classList.remove('booting');
    setTimeout(() => { boot.classList.add('hidden'); S.booting = false; }, 700);
    Nav.pop();
  };
  Nav.push(() => boot, { a: finish, start: finish, b: swallow, x: swallow, y: swallow, lb: swallow, rb: swallow, up: swallow, down: swallow, left: swallow, right: swallow, select: swallow, guide: swallow });
  setTimeout(finish, 3300);
}

// ---------------- Képernyővédő ----------------
function touch() { S.lastInput = Date.now(); }
function showSaver() {
  if (S.saver) return;
  S.saver = true;
  const el = $('#saver');
  el.classList.remove('hidden');
  const box = $('.saver-box', el);
  const upd = () => {
    $('.saver-clock', el).textContent = new Date().toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
    $('.saver-sub', el).textContent = new Date().toLocaleDateString('hu-HU', { weekday: 'long', month: 'long', day: 'numeric' });
    box.style.left = `${10 + Math.random() * 55}%`;
    box.style.top = `${10 + Math.random() * 60}%`;
  };
  upd();
  S.saverTimer = setInterval(upd, 8000);
  const all = {};
  for (const k of ['a', 'b', 'x', 'y', 'lb', 'rb', 'up', 'down', 'left', 'right', 'start', 'select', 'guide']) all[k] = () => { hideSaver(); return true; };
  Nav.push(() => el, all);
}
function hideSaver() {
  if (!S.saver) return;
  S.saver = false;
  clearInterval(S.saverTimer);
  $('#saver').classList.add('hidden');
  Nav.pop();
  touch();
}
setInterval(() => {
  const min = S.state && S.state.settings.ui.screensaverMin;
  if (!min || S.saver || S.launching || S.booting || document.hidden || (typeof Browser !== 'undefined' && Browser.blocksSaver())) return;
  if (Date.now() - S.lastInput > min * 60000) showSaver();
}, 5000);

// ---------------- Óra, akku ----------------
function tickClock() { $('#clock').textContent = new Date().toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' }); }
async function initBattery() {
  if (!navigator.getBattery) return;
  const b = await navigator.getBattery();
  S.battery = b;
  const upd = () => {
    const el = $('#battery');
    if (b.charging && b.level === 1 && b.chargingTime === 0) { el.textContent = ''; return; }
    el.replaceChildren(uiIcon(b.charging ? 'bolt' : 'battery'), ` ${Math.round(b.level * 100)}%`);
    el.classList.add('on');
    if (!b.charging && b.level <= 0.15 && !S.lowBatWarned) { S.lowBatWarned = true; toast(`Alacsony akkumulátor: ${Math.round(b.level * 100)}%`, 'err', 8000); }
    if (b.charging) S.lowBatWarned = false;
  };
  b.addEventListener('levelchange', upd); b.addEventListener('chargingchange', upd);
  upd();
}

// ---------------- Indulás ----------------
async function init() {
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => setTab(t.dataset.tab)));
  $('#host-chip').addEventListener('click', () => setTab('hosts'));
  $('#power-btn').addEventListener('click', () => exitMenu());
  if (typeof Browser !== 'undefined') Browser.init();
  if (typeof initAccountEvents === 'function') initAccountEvents();
  if (typeof initUpdateEvents === 'function') initUpdateEvents();
  // a bemeneti mód (kontroller ↔ billentyűzet/egér) váltásakor a gombjelzések is váltanak
  let wasPad = document.body.classList.contains('pad-mode');
  new MutationObserver(() => { const p = document.body.classList.contains('pad-mode'); if (p !== wasPad) { wasPad = p; renderHints(); } }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  Nav.onInput(touch);
  document.addEventListener('mousemove', () => { touch(); if (S.saver) hideSaver(); });
  window.addEventListener('gamepadconnected', (e) => toast(`Kontroller csatlakoztatva: ${e.gamepad.id.replace(/\(.*\)/, '').trim() || 'gamepad'}`, 'ok', 2500));
  window.addEventListener('gamepaddisconnected', () => toast('Kontroller leválasztva', '', 2500));

  gamo.on('boot', () => playBoot());
  gamo.on('shown', () => { touch(); if (Date.now() - S.libAt > 60000) loadLibrary(false); });
  gamo.on('display', (d) => { if (S.state) { S.state.display = d; if (S.tab === 'settings') renderSettings(); } });
  gamo.on('hosts', (e) => {
    for (const c of e.changes) {
      if (c.online && S.state.settings.ui.hostNotify) toast(`${c.name} elérhető – a játékai indíthatók`, 'ok', 5000);
      if (!c.online) toast(`${c.name} elérhetetlenné vált`, '', 4000);
    }
    loadLibrary(false);
  });
  gamo.on('stream', (e) => {
    if (e.state === 'starting') launchText('Csatlakozás a streamhez (Moonlight)…');
    if (e.state === 'ended') {
      hideLaunch();
      if (e.error) handleStreamError(e.error, hostById(e.hostId));
      else loadLibrary(false);
    }
  });

  applyState(await gamo.state());
  S.storeTarget = S.state.settings.lastHostId || 'local';
  if (!hostById(S.storeTarget)) S.storeTarget = 'local';
  setTab('home', { silent: true });
  tickClock(); setInterval(tickClock, 10000);
  initBattery().catch(() => {});
  gamo.on('pair', (e) => {
    const host = hostById(e.hostId);
    toast(e.ok ? `✓ Párosítva: ${host ? host.name : 'gép'}` : 'A párosítás nem sikerült – próbáld újra a Gépek fülön', e.ok ? 'ok' : 'err', 6000);
  });
  gamo.ready();
  await loadLibrary(false);
  if (!S.state.settings.setupDone) {
    setTimeout(async () => {
      while (S.booting) await new Promise((r) => setTimeout(r, 300)); // a boot animáció után
      setupWizard().catch((e) => toast(e.message, 'err'));
    }, 1500);
  }
}

// Minden script betöltése után indulunk (extras.js, themes.js is kell)
window.addEventListener('DOMContentLoaded', () => {
  init().catch((e) => { document.body.innerHTML = `<pre style="color:#f87171;padding:40px">Indítási hiba: ${esc(e.stack || e.message)}</pre>`; });
});
