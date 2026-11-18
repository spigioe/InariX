'use strict';
/* global $, h, S, gamo, Nav, OSK, Sound, toast, modal, setTab, setHero, setBg, gameTile, openDetail, sortGames, icon, STORE_LABEL, STORE_COLOR,
   PLATFORMS, fmtSince, streamDesktop, hostById, randomGame, focusedGame, searchLibrary, save, IntersectionObserver */
// Konzolos kezdőképernyő (Xbox-szerű elrendezés) és a különálló „Játékaim és alkalmazásaim” könyvtár oldal.
//  - Kezdőképernyő: legutóbbi/futó játékok sora (az első nagy csempe), gyorscsempék (Áruház, Böngésző, Asztal,
//    Gépek, Beállítások…), alatta kitűzött játékok, gyűjtemények, gépenkénti és telepíthető sorok.
//  - Játékaim: bal oldalt kategóriák (összes, telepítve, teljes könyvtár, platformok, gépek, gyűjtemények),
//    jobb oldalt rács lusta betöltéssel (nagy könyvtárnál csak a látható rész jön létre).

const HOME_ROW_MAX = 18;       // ennyi csempe egy kezdőképernyő sorban, utána „Összes” csempe
const GRID_CHUNK = 60;         // a könyvtár rács ennyi csempét rajzol ki egyszerre

const visibleGames = () => {
  const ls = S.state.settings.library;
  return S.lib.games.filter((g) => ls.showHidden || !g.hidden);
};

// ---------------- Kezdőképernyő ----------------
function homeHandlers() {
  return {
    x: () => { const e = focusedGame(); if (e) openDetail(e); return true; },
    y: () => { setTab('library', { silent: true }); searchLibrary(); return true; },
    lb: () => movePin(-1),
    rb: () => movePin(1),
  };
}

// Kitűzött játék mozgatása a sorban (LB/RB)
async function movePin(d) {
  const c = Nav.current();
  const row = c && c.closest('[data-pins="1"], [data-coll]');
  if (!row || !c.dataset.key) return true;
  const keys = [...c.closest('.shelf').querySelectorAll('.tile[data-key]')].map((t) => t.dataset.key);
  const i = keys.indexOf(c.dataset.key), j = i + d;
  if (j < 0 || j >= keys.length) return true;
  [keys[i], keys[j]] = [keys[j], keys[i]];
  S.focusedKey = c.dataset.key;
  if (row.dataset.coll) {
    const list = S.state.settings.collections.map((x) => (x.id === row.dataset.coll ? { ...x, keys: [...keys, ...x.keys.filter((k) => !keys.includes(k))] } : x));
    await save({ collections: list });
  } else await save({ ui: { pinOrder: keys } });
  Sound.move();
  renderHome();
  return true;
}

// ---- Ismerősök sor ----
function friendsRow(list) {
  const shelf = h('div', { class: 'shelf h-shelf q-shelf' }, list.slice(0, 20).map((f) => {
    const t = h('button', { class: 'q-tile friend focusable', dataset: { q: `f:${f.name}` } },
      h('img', { class: 'f-av', src: f.avatar || '', alt: '' }),
      h('span', { class: 'q-label' }, f.name, h('small', {}, f.game ? `▶ ${f.game}` : 'online')));
    t.addEventListener('navfocus', (ev) => { S.focusedKey = null; hideCard(); bgTrailer(null); setHero({ name: f.name, sub: f.game ? `Éppen játszik: ${f.game}` : 'Online' }); homeScroll(t, ev); });
    return t;
  }));
  return h('div', { class: 'h-row', dataset: { first: '0' } }, h('div', { class: 'row-title' }, 'Ismerősök online', h('span', { class: 'count' }, String(list.length))), shelf);
}

// ---- Kibomló játékkártya a kijelölt csempe sora alatt ----
function hideCard() { S.homeHintA = null; if (typeof renderHints === 'function') renderHints(); }
function showCard(e) {
  // a játék adatai a felső címsorban vannak; ide csak az achievement állás és a lenti gombjelzés kerül
  S.homeHintA = e.running && e.running.length ? 'Folytatás' : !e.sources.length ? 'Telepítés' : e.available ? 'Játék' : 'Adatlap';
  if (typeof renderHints === 'function') renderHints();
  const sid = e.store === 'steam' ? e.storeId : null;
  clearTimeout(showCard.t);
  if (sid) showCard.t = setTimeout(async () => {
    const a = await gamo.achievements(sid).catch(() => null);
    const el = $('#hero-sub');
    if (!a || !el || S.focusedKey !== e.key) return;
    el.textContent = `${el.textContent}  ·  🏆 ${a.done}/${a.total} achievement`;
  }, 450);
}

// Oldalirányú görgetésnél elmosódó szélek – csak azon az oldalon, ahol még van tartalom
function enhanceShelves(root) {
  for (const sh of root.querySelectorAll('.h-shelf')) {
    if (sh.parentElement.classList.contains('shelf-wrap')) continue;
    const wrap = h('div', { class: 'shelf-wrap' });
    sh.before(wrap);
    wrap.append(h('div', { class: 'edge l' }), sh, h('div', { class: 'edge r' }));
    const upd = () => {
      wrap.classList.toggle('show-l', sh.scrollLeft > 6);
      wrap.classList.toggle('show-r', sh.scrollLeft + sh.clientWidth < sh.scrollWidth - 6);
    };
    sh.addEventListener('scroll', upd, { passive: true });
    requestAnimationFrame(upd);
  }
}

// ---- Dinamikus háttér: a kijelölt játék előzetese néhány másodperc után, halkan ----
function bgTrailer(e) {
  const v = $('#bg-video');
  clearTimeout(bgTrailer.t);
  if (v) { v.classList.remove('on'); v.pause(); }
  document.body.classList.remove('vid-on');
  const mode = S.state.settings.ui.bgVideo || 'quiet';
  const busy = () => S.launching || (typeof StreamClient !== 'undefined' && StreamClient.active());
  if (!e || !v || mode === 'off' || S.tab !== 'home' || consoleHidden || busy()) return;
  const sid = e.store === 'steam' ? e.storeId : e.artFromSteam;
  if (!sid) return;
  bgTrailer.t = setTimeout(async () => {
    const url = await gamo.trailer(sid).catch(() => null);
    if (!url || S.focusedKey !== e.key || S.tab !== 'home' || consoleHidden || busy()) return;
    v.src = url; v.muted = mode !== 'quiet'; v.volume = 0.15;
    const on = () => { v.classList.add('on'); document.body.classList.add('vid-on'); };
    v.play().then(on).catch(() => { v.muted = true; v.play().then(on).catch(() => {}); });
  }, 2000);
}

function quickTile({ id, label, sub, glyph, color, onclick }) {
  const t = h('button', { class: 'q-tile focusable', dataset: { q: id }, onclick },
    h('span', { class: 'q-glyph', style: color ? `background:${color}` : '' }, glyphIcon(glyph)),
    h('span', { class: 'q-label' }, label, sub ? h('small', {}, sub) : null));
  t.addEventListener('navfocus', (ev) => { S.focusedKey = null; hideCard(); bgTrailer(null); setHero({ name: label, sub: sub || '' }); homeScroll(t, ev); });
  return t;
}

function moreTile(label, count, onclick) {
  const t = h('button', { class: 'tile more-tile focusable', onclick }, h('div', { class: 'more-in' }, h('div', { class: 'more-ico' }, uiIcon('grid')), h('div', {}, label), count != null ? h('small', {}, `${count} játék`) : null));
  t.addEventListener('navfocus', (ev) => { S.focusedKey = null; setHero({ name: label, sub: count != null ? `${count} játék` : '' }); homeScroll(t, ev); });
  return t;
}

// Függőleges görgetés a kezdőképernyőn: a fókuszált sor kerüljön a látható részre; lejjebb görgetve a háttér elsötétül
function homeScroll(el, ev) {
  // egérrel kijelölve nem mozdítjuk a felületet (csak a görgő görget)
  if (ev && ev.detail && ev.detail.scroll === false) return;
  const sc = $('#home-scroll');
  if (!sc) return;
  const row = el.closest('.h-row') || el;
  // csak annyit görgetünk, amennyi kell, hogy a kijelölt sor (és a kártya) teljesen látsszon – a címsor együtt gördül az oldallal
  const sr0 = sc.getBoundingClientRect(), rr = row.getBoundingClientRect();
  const heroH = ($('#screen-home #hero') || { offsetHeight: 0 }).offsetHeight + ($('#topbar') || { offsetHeight: 0 }).offsetHeight;
  const sr = { top: sr0.top + heroH, bottom: sr0.bottom }; // a rögzített címsor alatti terület
  const margin = 20;
  if (row.dataset.first === '1') sc.scrollTo({ top: 0, behavior: 'smooth' });
  else if (rr.top < sr.top + margin) sc.scrollBy({ top: rr.top - sr.top - margin, behavior: 'smooth' });
  else if (rr.bottom > sr.bottom - margin) sc.scrollBy({ top: Math.min(rr.bottom - sr.bottom + margin, rr.top - sr.top - margin), behavior: 'smooth' });
}

function homeRow(title, games, { more, first = false, extra = [] } = {}) {
  const shelf = h('div', { class: 'shelf h-shelf' });
  const shown = games.slice(0, HOME_ROW_MAX);
  shown.forEach((e, i) => {
    const t = gameTile(e);
    t.addEventListener('navfocus', (ev) => { homeScroll(t, ev); showCard(e, t); bgTrailer(e); });
    shelf.append(t);
  });
  for (const x of extra) shelf.append(x);
  if (more && games.length > HOME_ROW_MAX) shelf.append(moreTile(`Összes (${games.length})`, null, more));
  return h('div', { class: `h-row${first ? ' first' : ''}`, dataset: { first: first ? '1' : '0' } },
    title ? h('div', { class: 'row-title' }, title, h('span', { class: 'count' }, games.length ? String(games.length) : '')) : null, shelf);
}

function chooseDesktopHost() {
  const online = S.lib.hosts.filter((x) => !x.local && x.online);
  if (!online.length) { toast(S.lib.hosts.some((x) => !x.local) ? 'Egyik gaming PC sem elérhető' : 'Még nincs gaming PC hozzáadva (Gépek)', 'err'); return; }
  if (online.length === 1) return streamDesktop(hostById(online[0].id));
  modal({ title: 'Melyik gép asztala?', items: [...online.map((x) => ({ label: x.name, value: x.id })), { label: 'Mégse', value: null }] })
    .then((id) => { if (id) streamDesktop(hostById(id)); });
}

// ha a konzol el van rejtve (tálcán / kis méretben), az előzetes ne menjen a háttérben; előhozáskor újraindul
let consoleHidden = false;
function onConsoleVisibility(hidden) {
  consoleHidden = hidden;
  if (hidden) { bgTrailer(null); return; }
  const e = typeof focusedGame === 'function' ? focusedGame() : null;
  if (e && S.tab === 'home') bgTrailer(e);
}
document.addEventListener('visibilitychange', () => onConsoleVisibility(document.hidden));
gamo.on('hidden', () => onConsoleVisibility(true));
gamo.on('shown', () => onConsoleVisibility(false));

// görgetéskor a rögzített címsor alatt elmosódó sáv jelenik meg
function bindHomeScroll() {
  const sc = $('#home-scroll');
  if (!sc || sc.dataset.bound) return;
  sc.dataset.bound = '1';
  sc.addEventListener('scroll', () => document.body.classList.toggle('home-scrolled', sc.scrollTop > 4), { passive: true });
  const setTop = () => { const t = $('#topbar'); if (t) document.documentElement.style.setProperty('--topbar-h', `${t.offsetHeight}px`); };
  setTop(); window.addEventListener('resize', setTop);
}

// ---- Hírek és akciók sor ----
function newsRow(n) {
  const tiles = [];
  for (const s of n.sales.slice(0, 8)) {
    const t = h('button', { class: 'q-tile news-tile focusable', dataset: { q: `s:${s.appid}` }, style: `background-image:linear-gradient(to top, rgba(0,0,0,.85), rgba(0,0,0,.15)), url("https://cdn.cloudflare.steamstatic.com/steam/apps/${s.appid}/header.jpg")`, onclick: () => Browser.navigate(`https://store.steampowered.com/app/${s.appid}/`) },
      h('span', { class: 'sale-badge' }, `-${s.discount}%`), h('span', { class: 'q-label' }, s.name, h('small', {}, `Kívánságlista · ${s.price || ''}`)));
    t.addEventListener('navfocus', (ev) => { S.focusedKey = null; hideCard(); bgTrailer(null); setHero({ name: s.name, sub: `Akció: -${s.discount}% · ${s.price || ''}` }); homeScroll(t, ev); });
    tiles.push(t);
  }
  for (const it of n.news.slice(0, 10)) {
    const t = h('button', { class: 'q-tile news-tile focusable', dataset: { q: `n:${it.url}` }, style: `background-image:linear-gradient(to top, rgba(0,0,0,.88), rgba(0,0,0,.2)), url("https://cdn.cloudflare.steamstatic.com/steam/apps/${it.appid}/header.jpg")`, onclick: () => Browser.navigate(it.url) },
      h('span', { class: 'q-label' }, it.title, h('small', {}, `${it.game} · ${fmtDate(it.date)}`)));
    t.addEventListener('navfocus', (ev) => { S.focusedKey = null; hideCard(); bgTrailer(null); setHero({ name: it.game, sub: it.title }); homeScroll(t, ev); });
    tiles.push(t);
  }
  return h('div', { class: 'h-row', dataset: { first: '0' } }, h('div', { class: 'row-title' }, 'Hírek és akciók'), h('div', { class: 'shelf h-shelf q-shelf' }, tiles));
}

// ---- Felső sáv: időjárás és dátum ----
async function updateTopInfo() {
  const el = $('#wx');
  if (!el || !S.state) return;
  const ui = S.state.settings.ui;
  const parts = [];
  if (ui.weatherCity) { const w = await gamo.weather().catch(() => null); if (w) parts.push(`${w.icon} ${w.temp}° ${w.city}`); }
  if (ui.showDate !== false) parts.push(new Date().toLocaleDateString('hu-HU', { weekday: 'short', month: 'short', day: 'numeric' }));
  el.textContent = parts.join(' · ');
  el.classList.toggle('on', parts.length > 0);
}

// ---- Zene: internetes rádió + rendszer médiavezérlés (Spotify / bármely lejátszó) ----
let radioEl = null;
function playRadio(st) {
  if (!radioEl) { radioEl = new Audio(); radioEl.addEventListener('error', () => { toast('A rádió nem játszható le', 'err'); S.radio = null; }); }
  if (!st) { radioEl.pause(); radioEl.removeAttribute('src'); S.radio = null; try { navigator.mediaSession.metadata = null; } catch { /* */ } return; }
  radioEl.src = st.url; radioEl.volume = 0.8;
  radioEl.play().then(() => { S.radio = st; toast(`♫ ${st.name}`, 'ok', 3000); if (S.tab === 'home') renderHome(); }).catch((e) => toast(`Rádió: ${e.message}`, 'err'));
  // a Windows médiavezérlője (és a Zene panel) a csatorna nevét mutassa, ne csak azt, hogy „InariX”
  try { navigator.mediaSession.metadata = new MediaMetadata({ title: st.name, artist: 'Internetes rádió', artwork: st.logo ? [{ src: st.logo }] : [] }); } catch { /* nem támogatott */ }
}
// ---------------- Alkalmazások (teljes képernyős, konzolbarát webes appok a böngésző fiókjaival) ----------------
// a natív (nem webes) appok az Alkalmazások között
const NATIVE_APPS = {
  browser: { title: 'Böngésző', sub: 'Web kontrollerrel', icon: 'browser', color: 'linear-gradient(135deg,#14b8a6,#0ea5e9)', run: () => Browser.showBrowser() },
  radio: { title: 'Internetes rádió', sub: 'Magyar rádiók élőben', icon: 'radio', color: 'linear-gradient(135deg,#f59e0b,#b45309)', run: () => radioMenu() },
};
// app ikon: a design system vonalas ikonja az app saját színével, a téma panelszínén
function appIcon(id, cls = '') {
  const a = (Browser.APPS && Browser.APPS[id]) || NATIVE_APPS[id] || {};
  const brand = (String(a.color || '').match(/#[0-9a-f]{6}/i) || ['#a1a1aa'])[0];
  return h('span', { class: `app-ic ${cls}`, style: `--brand:${brand}` }, uiIcon(a.icon || 'apps'));
}
const appsView = () => { try { return localStorage.getItem('inx-apps-view') || 'grid'; } catch { return 'grid'; } };
async function appsMenu(focusId) {
  const open = new Map(Browser.openApps().map((a) => [a.id, a]));
  const view = appsView();
  const node = h('div', { class: `apps-list v-${view}` });
  let pick = null, toggle = false;
  const close = () => { const m = $('#modal-layer .menu-item:last-child'); if (m) m.click(); };
  const all = [['browser', NATIVE_APPS.browser], ...Object.entries(Browser.APPS), ['radio', NATIVE_APPS.radio]];
  for (const [id, a] of all) {
    node.append(h('button', { class: 'app-card focusable', dataset: { id, ...(id === (focusId || 'youtube') ? { default: '1' } : {}) }, onclick: () => { pick = id; close(); } },
      appIcon(id, view === 'grid' ? 'big' : ''), h('b', {}, a.title), view === 'card' ? h('small', {}, id === 'radio' && S.radio ? `Most: ${S.radio.name}` : a.sub || '') : null,
    ));
  }
  const n = open.size;
  await modal({
    title: 'Alkalmazások', node, wide: true, noDefault: true,
    body: `${n ? `${n} app megnyitva – ≡ (Start): váltás · ` : ''}Ⓨ: ${view === 'grid' ? 'kártya' : 'rács'} nézet`,
    items: [{ label: 'Bezárás', value: null }],
    handlers: { y: () => { toggle = true; close(); return true; }, start: () => { if (n) { pick = '#switch'; close(); } return true; } },
  });
  if (toggle) { try { localStorage.setItem('inx-apps-view', view === 'grid' ? 'card' : 'grid'); } catch { /* */ } const c = Nav.current(); return appsMenu(c && c.dataset && c.dataset.id); }
  if (pick === '#switch') { Browser.appSwitcher(); return; }
  if (pick && NATIVE_APPS[pick]) NATIVE_APPS[pick].run();
  else if (pick) Browser.openApp(pick);
}

// ---------------- Zene: mi szól most (app → rádió → Windows lejátszó), vezérlés – a gyorsmenü használja ----------------
const radioNow = () => (S.radio && radioEl ? { kind: 'radio', src: 'Rádió', title: S.radio.name, sub: 'Internetes rádió', playing: !radioEl.paused, art: S.radio.logo || null } : null);
async function nowPlayingAny() {
  // megnyitott app: ha szól (vagy épp szüneteltetett, de volt hangja)
  if (Browser.openApps().length) {
    const a = await Browser.appMedia().catch(() => null);
    if (a && a.has && (a.audible || a.paused)) return { kind: 'app', src: a.appTitle, title: a.title || a.appTitle, sub: a.artist || '', playing: a.audible && !a.paused, art: a.art || null };
  }
  const r = radioNow();
  if (r) return r;
  const n = await gamo.nowPlaying('info', false).catch(() => null);
  // a saját (InariX / Electron) munkamenetünk nem számít – a rádiót és az appokat fent már kezeltük
  if (n && n.session && n.title && !/inarix|electron/i.test(`${n.app || ''} ${n.title}`)) return { kind: 'smtc', src: n.spotify ? 'Spotify' : 'Lejátszó', title: n.title, sub: n.artist || '', playing: n.playing, art: null };
  return null;
}
async function mediaCmd(np, cmd) {
  if (!np) return;
  if (np.kind === 'app') { await Browser.appCmd(cmd); return; }
  if (np.kind === 'radio') {
    if (cmd === 'toggle') { if (radioEl.paused) radioEl.play().catch(() => {}); else radioEl.pause(); return; }
    const list = await gamo.radios().catch(() => []);
    const i = list.findIndex((x) => x.url === S.radio.url);
    if (list.length) playRadio(list[(i + (cmd === 'next' ? 1 : -1) + list.length) % list.length]);
    return;
  }
  const r = await gamo.nowPlaying(cmd).catch(() => null);
  if (!r || !r.session) await gamo.mediaKey(cmd === 'toggle' ? 'play' : cmd).catch(() => {});
}
// Internetes rádió (az Alkalmazások közül)
async function radioMenu() {
  const list = await gamo.radios().catch((e) => { toast(e.message, 'err'); return []; });
  const items = [];
  if (S.radio) items.push({ icon: 'stop', label: `Leállítás: ${S.radio.name}`, value: 'stop', kind: 'danger' });
  items.push(...list.map((r, k) => ({ icon: 'radio', label: r.name, value: String(k), def: S.radio && S.radio.url === r.url })), { label: 'Bezárás', value: null });
  const v = await modal({ title: 'Internetes rádió', wide: true, items });
  if (v === 'stop') playRadio(null);
  else if (v !== null && v !== undefined) playRadio(list[Number(v)]);
}
// Spotify (asztali alkalmazás – az Alkalmazások közül)
async function spotifyApp() {
  const has = await gamo.spotifyInstalled().catch(() => false);
  if (!has) {
    if (await confirmBox('Spotify', 'A Spotify nincs telepítve ezen a gépen. Megnyissam a Microsoft Store-ban?', 'Telepítés')) gamo.spotifyInstall();
    return;
  }
  if (S.radio) playRadio(null);
  toast('Spotify megnyitása…', '', 3000);
  gamo.spotifyOpen('app', null, false).catch((e) => toast(e.message, 'err'));
}

function renderHome() {
  if (!renderHome.top) { renderHome.top = true; updateTopInfo(); setInterval(updateTopInfo, 20 * 60000); }
  bindHomeScroll();
  if (S.friends === undefined) {
    S.friends = null;
    const load = () => gamo.friends().then((f) => { const had = (S.friends || []).length; S.friends = f || []; if (S.tab === 'home' && (f || []).length !== had) renderHome(); }).catch(() => {});
    load(); setInterval(load, 120000);
  }
  const recentEl = $('#home-rows');
  if (!recentEl) return;
  if (!S.libLoaded) { recentEl.replaceChildren(); setHero({ name: 'Játékok betöltése…', sub: 'Gépek és launcherek átvizsgálása' }); return; }
  const all = visibleGames();
  const installed = all.filter((g) => g.sources.length);
  {
    // alapállapot, amíg egyik csempe sincs kijelölve (a kijelölés felülírja)
    const hr = new Date().getHours();
    const nOnline = S.lib.hosts.filter((x) => !x.local && x.online).length;
    if (!$('#home-rows .focused')) setHero({ name: hr < 10 && hr >= 4 ? 'Jó reggelt!' : hr < 18 && hr >= 4 ? 'Szia!' : 'Jó estét!', sub: `${installed.length} telepített játék${nOnline ? ` · ${nOnline} gép online` : ''}` });
  }
  const running = installed.filter((g) => g.running && g.running.length);
  const seen = new Set();
  const take = (list) => list.filter((g) => (seen.has(g.key) ? false : seen.add(g.key)));
  const recent = [
    ...take(running),
    ...take(sortGames(installed.filter((g) => g.lastPlayed > 0), 'recent')),
    ...take([...installed].sort((a, b) => (b.installedAt || 0) - (a.installedAt || 0))),
  ].slice(0, 8);

  const libTile = moreTile('Játékaim és alkalmazásaim', all.length, () => setTab('library'));
  libTile.classList.add('lib-tile');
  const rows = [homeRow(null, recent, { first: true, extra: [libTile] })];

  const online = S.lib.hosts.filter((x) => !x.local && x.online);
  rows.push(h('div', { class: 'h-row', dataset: { first: '0' } }, h('div', { class: 'shelf h-shelf q-shelf' },
    quickTile({ id: 'store', label: 'Áruház', sub: 'Keresés és telepítés', glyph: 'store', color: 'linear-gradient(135deg,#0ea5e9,#6366f1)', onclick: () => setTab('store') }),
    quickTile({ id: 'apps', label: 'Alkalmazások', sub: 'Böngésző, YouTube, Twitch, Discord…', glyph: 'apps', color: 'linear-gradient(135deg,#ef4444,#7c3aed)', onclick: () => appsMenu() }),
    quickTile({ id: 'desktop', label: 'Asztal', sub: online.length ? `${online[0].name} képernyője, egérrel` : 'Gaming PC asztala', glyph: 'desktop', color: 'linear-gradient(135deg,#a855f7,#ec4899)', onclick: chooseDesktopHost }),
    quickTile({ id: 'hosts', label: 'Gépek', sub: `${online.length} online`, glyph: 'hosts', color: 'linear-gradient(135deg,#f59e0b,#ef4444)', onclick: () => setTab('hosts') }),
    quickTile({ id: 'random', label: 'Véletlen játék', sub: 'Dobj egyet', glyph: 'random', color: 'linear-gradient(135deg,#22c55e,#84cc16)', onclick: () => randomGame() }),
    quickTile({ id: 'settings', label: 'Beállítások', sub: 'Fiókok, téma, kijelző', glyph: 'settings', color: 'linear-gradient(135deg,#64748b,#334155)', onclick: () => setTab('settings') }))));

  const order = S.state.settings.ui.pinOrder || [];
  const pos = (g) => { const i = order.indexOf(g.key); return i < 0 ? 1e6 : i; };
  // hírek és akciók (a háttérben töltődik, utána újrarajzol)
  if (S.homeNews === undefined) { S.homeNews = null; gamo.homeNews().then((n) => { S.homeNews = n; if (S.tab === 'home' && n && (n.news.length || n.sales.length)) renderHome(); }).catch(() => { S.homeNews = { news: [], sales: [] }; }); }
  if (S.homeNews && (S.homeNews.news.length || S.homeNews.sales.length)) rows.push(newsRow(S.homeNews));
  const fav = sortGames(all.filter((g) => g.fav), 'name').sort((a, b) => pos(a) - pos(b));
  if (fav.length) { const r = homeRow('★ Kitűzött · LB/RB: sorrend', fav, { more: () => openLibCat('fav') }); r.dataset.pins = '1'; rows.push(r); }
  // ismerősök (Steam Web API kulccsal)
  if (S.friends && S.friends.length) rows.push(friendsRow(S.friends));
  // ajánlások a játékidő alapján
  const DAY = 86400000, now = Date.now();
  const longAgo = sortGames(installed.filter((g) => g.playSec > 1800 && g.lastPlayed && now - g.lastPlayed > 30 * DAY), 'playtime');
  if (longAgo.length) rows.push(homeRow('Régóta nem játszottál vele', longAgo, { more: () => openLibCat('installed') }));
  const unfinished = sortGames(installed.filter((g) => g.playSec > 600 && g.lastPlayed && now - g.lastPlayed > 7 * DAY && now - g.lastPlayed <= 30 * DAY), 'recent');
  if (unfinished.length) rows.push(homeRow('Félbehagyott játékok', unfinished, { more: () => openLibCat('installed') }));
  const untried = sortGames(installed.filter((g) => !g.playSec && !g.lastPlayed && !g.steamPlaytime), 'name');
  if (untried.length) rows.push(homeRow('Még ki sem próbáltad', untried, { more: () => openLibCat('installed') }));
  // saját csoportok: egyedi ikon és szín, a játékok sorrendje LB/RB-vel állítható
  for (const c of S.state.settings.collections) {
    const cg = all.filter((g) => c.keys.includes(g.key)).sort((a, b) => c.keys.indexOf(a.key) - c.keys.indexOf(b.key));
    if (!cg.length) continue;
    const r = homeRow(`${c.icon || '▤'} ${c.name} · LB/RB: sorrend`, cg, { more: () => openLibCat(`c:${c.id}`) });
    r.dataset.coll = c.id;
    if (c.color) r.style.setProperty('--grp', c.color);
    rows.push(r);
  }
  for (const hst of S.lib.hosts.filter((x) => !x.local && x.count > 0)) {
    const hg = sortGames(installed.filter((g) => g.sources.some((s) => s.hostId === hst.id)), 'recent');
    if (hg.length) rows.push(homeRow(hst.online ? `Streamelhető – ${hst.name}` : `${hst.name} (nem elérhető)`, hg, { more: () => openLibCat(`h:${hst.id}`) }));
  }
  const local = S.lib.hosts.find((x) => x.local);
  const lg = sortGames(installed.filter((g) => g.localAvailable), 'recent');
  if (local && lg.length && S.lib.hosts.length > 1) rows.push(homeRow('Ezen a gépen', lg, { more: () => openLibCat('h:local') }));
  const owned = sortGames(all.filter((g) => !g.sources.length), 'name');
  if (owned.length) rows.push(homeRow('Teljes könyvtár – telepíthető', owned, { more: () => openLibCat('owned') }));

  const cur = Nav.current();
  const keep = cur && recentEl.contains(cur) ? (cur.dataset.key || cur.dataset.q || null) : null;
  recentEl.replaceChildren(...rows);
  enhanceShelves(recentEl);
  requestAnimationFrame(() => {
    if (S.tab !== 'home' || Nav.depth()) return;
    let target = keep && (recentEl.querySelector(`[data-key="${CSS.escape(keep)}"]`) || recentEl.querySelector(`[data-q="${keep}"]`));
    if (!target && S.focusedKey) target = recentEl.querySelector(`[data-key="${CSS.escape(S.focusedKey)}"]`);
    if (!target) target = recentEl.querySelector('.focusable');
    const now = Nav.current();
    if (!now || !now.isConnected || !recentEl.contains(now) || target !== now) Nav.focus(target, { silent: true });
  });
}

// ---------------- Játékaim (könyvtár) ----------------
function libCategories() {
  const all = visibleGames();
  const L = [];
  const add = (c) => { c.count = all.filter(c.fn).length; L.push(c); };
  add({ id: 'all', glyph: '▦', label: 'Összes játék', fn: () => true });
  add({ id: 'installed', glyph: '▶', label: 'Telepítve', fn: (g) => g.sources.length > 0 });
  add({ id: 'owned', glyph: '☁', label: 'Teljes könyvtár', sub: 'saját, nincs telepítve', fn: (g) => !g.sources.length });
  add({ id: 'running', glyph: '●', label: 'Most fut', fn: (g) => g.running && g.running.length });
  add({ id: 'fav', glyph: '★', label: 'Kitűzött', fn: (g) => g.fav });
  L.push({ group: 'Platformok' });
  for (const p of PLATFORMS) add({ id: `p:${p}`, dot: STORE_COLOR[p], label: STORE_LABEL[p], fn: (g) => g.store === p });
  L.push({ group: 'Gépek' });
  for (const hst of S.lib.hosts) add({ id: `h:${hst.id}`, glyph: hst.local ? '💻' : '🖥', label: hst.local ? 'Ezen a gépen' : hst.name, sub: hst.local ? '' : hst.online ? 'online' : 'nem elérhető', fn: (g) => g.sources.some((s) => s.hostId === hst.id) });
  if (S.state.settings.collections.length) {
    L.push({ group: 'Gyűjtemények' });
    for (const c of S.state.settings.collections) add({ id: `c:${c.id}`, glyph: '▤', label: c.name, fn: (g) => c.keys.includes(g.key) });
  }
  const hiddenCount = S.lib.games.filter((g) => g.hidden).length;
  if (hiddenCount) L.push({ id: 'hidden', glyph: '◌', label: 'Rejtett', count: hiddenCount, fn: (g) => g.hidden, raw: true });
  // üres kategóriák (az alapokon kívül) elrejtése, és az üressé vált csoportcímeké is
  const keepIds = new Set(['all', 'installed', 'owned']);
  const out = L.filter((c) => c.group || keepIds.has(c.id) || c.count > 0);
  return out.filter((c, i) => !c.group || (out[i + 1] && !out[i + 1].group));
}

function openLibCat(id) { S.libCat = id; S.filter = ''; setTab('library'); }

function libraryHandlers() {
  const cats = () => libCategories().filter((c) => !c.group);
  const step = (d) => { const L = cats(); const i = L.findIndex((c) => c.id === S.libCat); S.libCat = L[(i + d + L.length) % L.length].id; Sound.tab(); renderLibrary(true); return true; };
  return {
    y: () => { searchLibrary(); return true; },
    x: () => { const e = focusedGame(); if (e) openDetail(e); return true; },
    lb: () => step(-1),
    rb: () => step(1),
    b: () => {
      if (S.filter) { S.filter = ''; Sound.back(); renderLibrary(true); return true; }
      const c = Nav.current();
      if (c && c.closest('#lib-grid')) { const b = $(`#lib-nav [data-cat="${S.libCat}"]`); if (b) { Sound.back(); Nav.focus(b); return true; } }
      return false; // → kezdőképernyő
    },
  };
}

const SORTS = [['recent', 'Legutóbb játszott'], ['name', 'Név (A–Z)'], ['playtime', 'Játékidő'], ['installed', 'Telepítés ideje']];
function sortLib(list, mode) {
  if (mode === 'installed') return [...list].sort((a, b) => (b.installedAt || 0) - (a.installedAt || 0) || a.name.localeCompare(b.name, 'hu'));
  return sortGames(list, mode);
}

let gridObs = null;
function renderLibrary(focusFirst) {
  const navEl = $('#lib-nav'), grid = $('#lib-grid');
  if (!navEl) return;
  if (!S.libLoaded) { grid.replaceChildren(h('div', { class: 'empty small' }, 'Játékok betöltése…')); return; }
  const cats = libCategories();
  if (!cats.some((c) => c.id === S.libCat)) S.libCat = 'all';
  const cat = cats.find((c) => c.id === S.libCat);
  const ls = S.state.settings.library;

  // bal oldali kategória lista
  const cur = Nav.current();
  const navFocus = cur && navEl.contains(cur) ? cur.dataset.cat : null;
  const act = (icon, label, fn) => h('button', { class: 'lib-tool focusable', onclick: fn }, uiIcon(icon), label);
  const tools = h('div', { class: 'lib-tools' }, act('search', 'Keresés', () => scanAndAddAll()), act('download', 'Hozzáadás', () => addCustomGame()));
  navEl.replaceChildren(...cats.map((c) => {
    if (c.group) return h('div', { class: 'lib-group' }, c.group);
    const b = h('button', { class: `set-cat lib-cat focusable${c.id === S.libCat ? ' active' : ''}`, dataset: { cat: c.id } },
      h('span', { class: 'ci', style: c.dot ? `background:${c.dot}` : '' }, c.dot ? '' : glyphIcon(c.glyph)),
      h('span', { class: 'ct' }, c.label, c.sub ? h('small', {}, c.sub) : null),
      h('span', { class: 'cc' }, String(c.count)));
    b.addEventListener('navfocus', () => {
      if (S.libCat === c.id) return;
      S.libCat = c.id; S.filter = '';
      navEl.querySelectorAll('.lib-cat').forEach((x) => x.classList.toggle('active', x.dataset.cat === c.id));
      fillGrid(false);
    });
    b.addEventListener('click', () => { const f = grid.querySelector('.focusable'); if (f) Nav.focus(f); });
    return b;
  }));
  navEl.append(tools); // keresés / hozzáadás a lista alján
  if (navFocus) { const b = navEl.querySelector(`[data-cat="${navFocus}"]`); if (b) Nav.focus(b, { silent: true, scroll: false }); }

  // eszközök: keresés, rendezés
  $('#lib-tools').replaceChildren(
    h('button', { class: 'pill focusable', onclick: () => searchLibrary() }, '⌕ ', S.filter ? `„${S.filter}”` : 'Keresés'),
    h('button', { class: 'pill focusable', onclick: async () => {
      const i = SORTS.findIndex(([k]) => k === ls.sort);
      await save({ library: { sort: SORTS[(i + 1) % SORTS.length][0] } });
      renderLibrary();
    } }, `⇅ ${(SORTS.find(([k]) => k === ls.sort) || SORTS[0])[1]}`));

  fillGrid(focusFirst || !cur || !cur.isConnected);

  function fillGrid(focus) {
    const c = libCategories().find((x) => x.id === S.libCat) || cat;
    let list = (c.raw ? S.lib.games : visibleGames()).filter(c.fn);
    if (S.filter) { const q = S.filter.toLowerCase(); list = list.filter((g) => g.name.toLowerCase().includes(q)); }
    list = c.id === 'owned' ? sortLib(list, 'name') : sortLib(list, ls.sort);
    $('#lib-title').textContent = S.filter ? `Keresés: „${S.filter}”` : c.label;
    $('#lib-count').textContent = `${list.length} játék`;
    if (gridObs) { gridObs.disconnect(); gridObs = null; }
    grid.replaceChildren();
    grid.scrollTop = 0;
    if (!list.length) {
      grid.append(h('div', { class: 'empty small' }, S.filter ? 'Nincs találat.' : c.id === 'owned' ? 'Nincs nem telepített játék – csatlakoztass fiókokat a Beállítások → Fiókok és könyvtár alatt.' : 'Ebben a kategóriában nincs játék.'));
      return;
    }
    let n = 0;
    const sentinel = h('div', { class: 'grid-sentinel' });
    const more = () => {
      const end = Math.min(list.length, n + GRID_CHUNK);
      const frag = document.createDocumentFragment();
      for (; n < end; n++) {
        const t = gameTile(list[n]);
        delete t.dataset.scroll; // rácsban a böngésző natív görgetése (nem vízszintes polc)
        const idx = n;
        t.addEventListener('navfocus', () => { if (idx > n - 12 && n < list.length) more(); });
        frag.append(t);
      }
      grid.insertBefore(frag, sentinel);
      if (n >= list.length) { sentinel.remove(); if (gridObs) gridObs.disconnect(); }
    };
    grid.append(sentinel);
    more();
    // továbbtöltés: a lista vége felé görgetve / fókuszálva (az observer csak állapotváltáskor jelez, ezért görgetést is figyelünk)
    gridObs = new IntersectionObserver((ents) => { if (ents.some((x) => x.isIntersecting) && n < list.length && grid.scrollHeight > grid.clientHeight) more(); }, { root: grid, rootMargin: '600px' });
    gridObs.observe(sentinel);
    grid.onscroll = () => { if (n < list.length && grid.scrollTop + grid.clientHeight > grid.scrollHeight - 1200) more(); };
    if (focus) requestAnimationFrame(() => {
      const keep = S.focusedKey && grid.querySelector(`[data-key="${CSS.escape(S.focusedKey)}"]`);
      Nav.focus(keep || grid.querySelector('.focusable'), { silent: true });
    });
  }
}

// Kezdőképernyő vagy könyvtár újrarajzolása (amelyik éppen látszik)
function refreshLibViews(focus) {
  if (S.tab === 'home') renderHome();
  else if (S.tab === 'library') renderLibrary(focus);
}
