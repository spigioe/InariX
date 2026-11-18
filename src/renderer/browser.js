'use strict';
// Beépített konzolos böngésző: <webview> + kontrolleres kurzor, görgetés, képernyő-billentyűzet.
// Két üzemmód:
//  - eszköztár: a megszokott fókusz-navigáció (vissza/előre/cím/könyvjelző… gombok, kezdőlap csempék)
//  - oldal: a kontroller közvetlenül az oldalt vezérli (bal kar = kurzor, A = kattintás, jobb kar = görgetés)
const Browser = (() => {
  const PARTITION = 'persist:inarix-browser';
  const SEARCH = {
    google: ['Google', 'https://www.google.com/search?q='],
    duckduckgo: ['DuckDuckGo', 'https://duckduckgo.com/?q='],
    bing: ['Bing', 'https://www.bing.com/search?q='],
  };
  const QUICK = [
    ['YouTube', 'https://www.youtube.com/', '#ff0033'],
    ['Twitch', 'https://www.twitch.tv/', '#9146ff'],
    ['Google', 'https://www.google.com/', '#4285f4'],
    ['Wikipédia', 'https://hu.wikipedia.org/', '#a1a1aa'],
    ['Reddit', 'https://www.reddit.com/', '#ff4500'],
    ['Steam közösség', 'https://steamcommunity.com/', '#1b9fff'],
    ['ProtonDB', 'https://www.protondb.com/', '#f43f5e'],
    ['HowLongToBeat', 'https://howlongtobeat.com/', '#3b82f6'],
  ];
  const ZOOMS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5];
  // „Alkalmazások”: teljes képernyős böngésző (eszköztár nélkül) a beépített böngésző bejelentkezéseivel,
  // saját, TV-re optimalizált CSS-sel (src/renderer/apps/*.css – csak azt kell szerkeszteni)
  // pass: azon belül a D-pad balra/jobbra az oldalé (lejátszó); rawPad: a kontroller közvetlenül az oldalé (felhős játék)
  const APPS = {
    youtube: { title: 'YouTube', sub: 'Videók – a böngésző Google-fiókjával', icon: 'b-youtube', color: 'linear-gradient(135deg,#ff0033,#b3001b)', url: 'https://www.youtube.com/', css: 'apps/youtube-tv.css', match: /(^|\.)youtube\.com$/i, zoom: 1.25, pass: '#movie_player',
      init: "const h=document.documentElement; const set=()=>{ if(!h.hasAttribute('dark')) h.setAttribute('dark',''); }; set(); new MutationObserver(set).observe(h,{attributes:true,attributeFilter:['dark']});", card: 'ytd-rich-item-renderer, ytd-compact-video-renderer, ytd-video-renderer, ytd-grid-video-renderer, yt-lockup-view-model, ytd-playlist-renderer' },
    twitch: { title: 'Twitch', sub: 'Élő adások', icon: 'b-twitch', color: 'linear-gradient(135deg,#9146ff,#5b21b6)', url: 'https://www.twitch.tv/', css: 'apps/twitch.css', match: /(^|\.)twitch\.tv$/i, zoom: 1.2, pass: '[data-a-target="video-player"]', card: 'article',
      init: "const h=document.documentElement; const set=()=>{ if(!h.classList.contains('tw-root--theme-dark')){ h.classList.remove('tw-root--theme-light'); h.classList.add('tw-root--theme-dark'); } }; set(); new MutationObserver(set).observe(h,{attributes:true,attributeFilter:['class']});" },
    ytmusic: { fit: true, title: 'YouTube Music', sub: 'Zene a YouTube-fiókoddal', icon: 'b-ytmusic', color: 'linear-gradient(135deg,#ff0033,#7f1d1d)', url: 'https://music.youtube.com/', css: 'apps/ytmusic.css', match: /^music\.youtube\.com$/i, zoom: 1.2, pass: 'ytmusic-player', card: 'ytmusic-two-row-item-renderer, ytmusic-responsive-list-item-renderer' },
    discord: { fit: true, title: 'Discord', sub: 'Szerverek és üzenetek', icon: 'b-discord', color: 'linear-gradient(135deg,#5865f2,#3730a3)', url: 'https://discord.com/app', css: 'apps/discord.css', match: /(^|\.)discord\.com$/i, zoom: 1 },
    steamchat: { fit: true, title: 'Steam Chat', sub: 'Barátok és üzenetek', icon: 'b-steam', color: 'linear-gradient(135deg,#1b9fff,#1e3a8a)', url: 'https://steamcommunity.com/chat', css: 'apps/steamchat.css', match: /(^|\.)steamcommunity\.com$/i, zoom: 1.2 },
    xcloud: { fit: true, title: 'Xbox Cloud Gaming', sub: 'Game Pass játékok letöltés nélkül', icon: 'b-xbox', color: 'linear-gradient(135deg,#107c10,#0b5c0b)', url: 'https://www.xbox.com/hu-HU/play', css: 'apps/xcloud.css', match: /(^|\.)xbox\.com$/i, zoom: 1, rawPad: true },
    spotify: { fit: true, title: 'Spotify', sub: 'Zene – open.spotify.com, a Spotify-fiókoddal', icon: 'b-spotify', color: 'linear-gradient(135deg,#1db954,#14532d)', url: 'https://open.spotify.com/', css: 'apps/spotify.css', match: /(^|\.)spotify\.com$/i, zoom: 1.15, card: '[data-testid="tracklist-row"], [data-encore-id="card"]' },
    geforcenow: { fit: true, title: 'GeForce NOW', sub: 'Felhős játék a saját Steam / Epic könyvtáradból', icon: 'b-geforce', color: 'linear-gradient(135deg,#76b900,#365314)', url: 'https://play.geforcenow.com/', css: 'apps/geforcenow.css', match: /(^|\.)geforcenow\.com$/i, zoom: 1, rawPad: true },
    reddit: { title: 'Reddit', sub: 'Közösségek és hírfolyam', icon: 'b-reddit', color: 'linear-gradient(135deg,#ff4500,#9a3412)', url: 'https://www.reddit.com/r/gaming/', css: 'apps/reddit.css', match: /(^|\.)reddit\.com$/i, zoom: 1.2, card: 'shreddit-post, article' },
    hltb: { title: 'HowLongToBeat', sub: 'Mennyi idő végigjátszani', icon: 'clock', color: 'linear-gradient(135deg,#3b82f6,#1e3a8a)', url: 'https://howlongtobeat.com/', css: 'apps/hltb.css', match: /(^|\.)howlongtobeat\.com$/i, zoom: 1.2 },
    radar: { fit: true, map: true, title: 'Időjárás radar', sub: 'Csapadék, szél, felhők (Windy)', icon: 'radar', color: 'linear-gradient(135deg,#0ea5e9,#0f766e)', url: 'https://www.windy.com/-Radar-radar?radar,47.3,19.4,7', css: 'apps/radar.css', match: /(^|\.)windy\.com$/i, zoom: 1.1 },
    news: { title: 'Hírek', sub: 'Google Hírek – a legfontosabb hírek', icon: 'news', color: 'linear-gradient(135deg,#4285f4,#1e40af)', url: 'https://news.google.com/home?hl=hu&gl=HU&ceid=HU:hu', css: 'apps/news.css', match: /^news\.google\.com$/i, zoom: 1.2, card: 'article' },
    maps: { fit: true, map: true, title: 'Térkép', sub: 'Google Maps és Street View', icon: 'b-maps', color: 'linear-gradient(135deg,#34a853,#166534)', url: 'https://www.google.com/maps/@47.4979,19.0402,12z?hl=hu', css: 'apps/maps.css', match: /^(www\.)?google\.[a-z.]+$/i, zoom: 1.1 },
    speedtest: { title: 'Sebességmérő', sub: 'A net sebessége (fast.com)', icon: 'gauge', color: 'linear-gradient(135deg,#e11d48,#7c2d12)', url: 'https://fast.com/', css: 'apps/speedtest.css', match: /(^|\.)fast\.com$/i, zoom: 1 },
  };
  let NAV_JS = null, BASE_CSS = null, SCROLL_CSS = null;
  // az app nagyítása az InariX „Felület mérete” beállításához igazodik (100% = az app alapnagyítása)
  const appZoom = (a) => Math.round((a.zoom || 1) * (((S.state && S.state.settings.ui.scale) || 100) / 100) * 100) / 100;

  const B = {
    wv: null, ready: false, mode: 'toolbar', showPage: false, url: '', title: '', loading: false,
    canBack: false, canFwd: false, zoom: 1, fullscreen: false, playing: false, hideBar: false,
    cur: { x: -1, y: -1 }, curVisible: false, padHeld: {}, raf: 0, lastT: 0, downloads: [],
    app: null, // { id, title, css, match, zoom, prevZoom }
  };
  const cfg = () => (S.state && S.state.settings.browser) || { bookmarks: [], history: [], search: 'google', home: '', saveHistory: true, cursorSpeed: 100 };
  const el = (id) => document.getElementById(id);
  const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

  // ---------- Mentés (debounce: az előzmények gyakran változnak) ----------
  let saveTimer = null;
  function save(now = false) {
    clearTimeout(saveTimer);
    const run = () => { const c = cfg(); gamo.settings({ browser: { bookmarks: c.bookmarks, history: c.history, search: c.search, home: c.home, saveHistory: c.saveHistory, cursorSpeed: c.cursorSpeed } }).catch(() => {}); };
    if (now) run(); else saveTimer = setTimeout(run, 2000);
  }

  // ---------- Cím értelmezése ----------
  function resolveInput(text) {
    const t = String(text || '').trim();
    if (!t) return null;
    if (/^https?:\/\//i.test(t)) return t;
    if (/^about:blank$/i.test(t)) return t;
    if (!/\s/.test(t) && (/^localhost(:\d+)?(\/|$)/i.test(t) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/.test(t))) return `http://${t}`;
    if (!/\s/.test(t) && /^[^./][^\s]*\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(t)) return `https://${t}`;
    const eng = SEARCH[cfg().search] || SEARCH.google;
    return eng[1] + encodeURIComponent(t);
  }

  // ---------- Webview ----------
  // Több nézet: a böngészőnek és minden megnyitott appnak saját webview-ja van (egyszerre több app futhat,
  // a háttérben lévők tovább szólnak). B.wv / B.app mindig az előtérben lévő nézet.
  const VIEWS = new Map(); // kulcs ('browser' vagy app id) → webview
  function saveViewState() {
    if (!B.wv) return;
    B.wv._st = { showPage: B.showPage, url: B.url, title: B.title, zoom: B.zoom, vstate: B.vstate };
    // előnézeti kép az appváltóhoz
    if (B.wv._app && B.wv._ready && B.showPage) {
      const w = B.wv;
      w.capturePage().then((img) => { try { w._thumb = img.resize({ width: 480 }).toDataURL(); } catch { /* */ } }).catch(() => {});
    }
  }
  function activate(key) {
    if (B.wv && B.wv._key === key) return;
    saveViewState();
    leavePage({ focus: false });
    for (const [k, w] of VIEWS) w.classList.toggle('bgview', k !== key);
    const wv = VIEWS.get(key) || null;
    B.key = key; B.wv = wv; B.ready = !!(wv && wv._ready);
    const st = (wv && wv._st) || { showPage: false, url: '', title: '', zoom: 1, vstate: null };
    B.showPage = st.showPage; B.url = st.url; B.title = st.title; B.zoom = st.zoom || 1; B.vstate = st.vstate || null;
    B.app = wv ? wv._app || null : null;
    B.canBack = !!(wv && B.ready && wv.canGoBack()); B.canFwd = !!(wv && B.ready && wv.canGoForward());
    B.playing = !!(wv && wv._playing);
  }
  const audible = (w) => { try { return !!(w && w._ready && w.isCurrentlyAudible()); } catch { return false; } };
  function openApps() {
    return [...VIEWS.values()].filter((w) => w._app).map((w) => ({ id: w._key, title: w._app.title, icon: w._app.icon, color: w._app.color,
      brand: w._app.brand, front: w === B.wv && S.tab === 'browser', audible: audible(w), thumb: w._thumb || null }));
  }

  function ensureView() {
    if (B.wv) return B.wv;
    const key = B.key || 'browser';
    const wv = document.createElement('webview');
    wv._key = key; wv._app = B.app || null;
    VIEWS.set(key, wv);
    wv.setAttribute('partition', PARTITION);
    wv.setAttribute('allowpopups', ''); // a felugrókat a fő folyamat ugyanebbe a nézetbe irányítja
    wv.setAttribute('webpreferences', 'contextIsolation=yes, sandbox=yes');
    if (key === 'browser') wv.id = 'br-webview';
    el('br-view').prepend(wv);
    const cur = () => B.wv === wv;
    const sync = () => {
      if (!cur() || !B.ready) return;
      B.canBack = wv.canGoBack(); B.canFwd = wv.canGoForward();
      B.url = wv.getURL(); B.title = wv.getTitle() || hostOf(B.url);
      renderBar();
      if (B.app) updateAppHints();
    };
    wv.addEventListener('dom-ready', () => {
      if (!wv._ready) { wv._ready = true; wv.setZoomFactor(cur() ? B.zoom : 1); }
      if (cur()) B.ready = true;
      applyAppCss(wv);
      sync();
    });
    wv.addEventListener('did-start-loading', () => { if (cur()) { B.loading = true; renderBar(); } });
    wv.addEventListener('did-stop-loading', () => { if (cur()) { B.loading = false; sync(); } });
    wv.addEventListener('did-navigate', (e) => { if (!cur()) return; B.url = e.url; sync(); if (!wv._app) addHistory(e.url, wv.getTitle()); });
    wv.addEventListener('did-navigate-in-page', (e) => { if (cur() && e.isMainFrame) { B.url = e.url; sync(); if (!wv._app) addHistory(e.url, wv.getTitle()); } });
    wv.addEventListener('page-title-updated', (e) => { if (!cur()) return; B.title = e.title; renderBar(); updateHistoryTitle(B.url, e.title); });
    wv.addEventListener('did-fail-load', (e) => {
      if (!cur() || !e.isMainFrame || e.errorCode === -3) return; // -3: megszakítva (pl. új navigáció)
      toast(`Az oldal nem tölthető be (${e.errorDescription || e.errorCode})`, 'err');
    });
    wv.addEventListener('enter-html-full-screen', () => { if (cur()) setFullscreen(true); });
    wv.addEventListener('leave-html-full-screen', () => { if (cur()) setFullscreen(false); });
    wv.addEventListener('media-started-playing', () => { wv._playing = true; if (cur()) B.playing = true; });
    wv.addEventListener('media-paused', () => { wv._playing = false; if (cur()) B.playing = false; });
    wv.addEventListener('render-process-gone', () => { toast('Az oldal összeomlott – újratöltés…', 'err'); setTimeout(() => wv.reload(), 800); });
    B.wv = wv;
    return wv;
  }

  // az alkalmazás CSS-e minden oldalbetöltéskor (csak az alkalmazás saját domainjén)
  function applyAppCss(wv = B.wv) {
    const a = wv && wv._app;
    if (!a || !a.css || !wv._ready) return;
    let host = '';
    try { host = new URL(wv.getURL()).hostname; } catch { /* */ }
    if (a.match && !a.match.test(host)) return;
    // a design system: az aktuális InariX téma színei, betűtípusa, lekerekítése CSS-változókként (az app CSS-e ezekből dolgozik)
    // téma változók és design system görgetősáv minden appban (a felhős játékokban is)
    wv.insertCSS(themeVars()).catch(() => {});
    if (SCROLL_CSS) wv.insertCSS(SCROLL_CSS).catch(() => {});
    if (BASE_CSS && !a.rawPad) wv.insertCSS(BASE_CSS).catch(() => {});
    wv.insertCSS(a.css).catch(() => {});
    // rögzített elrendezésű appnál a nézet már a gombsáv fölött ér véget – nem kell alsó margó
    if (a.fit) wv.insertCSS('body { padding-bottom: 0 !important; }').catch(() => {});
    wv.setZoomFactor(appZoom(a));
    // térkép appok: a térkép kapja a billentyűzetet (nyilak = mozgatás, +/- = nagyítás)
    if (a.map) wv.executeJavaScript(`setTimeout(() => { let best = null, area = 0; for (const e of document.querySelectorAll('.leaflet-container, #map-container, [tabindex], canvas')) { const r = e.getBoundingClientRect(); if (r.width * r.height > area) { area = r.width * r.height; best = e; } } const pref = document.querySelector('.leaflet-container, #map-container'); if (pref) best = pref; if (best) { if (!best.hasAttribute('tabindex')) best.setAttribute('tabindex', '0'); best.focus(); } }, 1500)`, false).catch(() => {});
    // konzolos D-pad navigáció az oldalon (felhős játéknál nem kell – ott a kontroller a játéké)
    if (NAV_JS && !a.rawPad && !a.map) wv.executeJavaScript(`window.__inxPass = ${JSON.stringify(a.pass || '')}; window.__inxCard = ${JSON.stringify(a.card || '')}; window.__inxInit = ${a.init ? `() => { ${a.init} }` : 'null'};\n${NAV_JS}`, false).catch(() => {});
  }
  // ---- Háttérbe tétel: az app tovább fut, a kezdőképernyőre lépünk; több app is futhat egyszerre ----
  function backgroundApp({ toHome = true } = {}) {
    if (!B.app) return;
    const a = B.app, w = B.wv;
    if (B.fullscreen) exitFullscreen();
    activate('browser');
    document.body.classList.remove('br-fs', 'br-app', 'br-fit');
    B.hideBar = false;
    updateAppHints();
    if (toHome && S.tab === 'browser') setTab('home');
    // csak akkor mondjuk, hogy a gyorsmenüből hallgatható, ha tényleg szól
    setTimeout(() => toast(audible(w) ? `${a.title} tovább szól – vezérlés: gyorsmenü` : `${a.title} a háttérben vár – ≡ (Start): megnyitott appok`, 'ok', 4000), 150);
  }
  function enterAppUi() {
    B.hideBar = true;
    document.body.classList.add('br-fs', 'br-app');
    document.body.classList.toggle('br-fit', !!(B.app && B.app.fit));
    if (S.tab !== 'browser') setTab('browser', { silent: true });
    renderBar(); renderView();
    setTimeout(() => enterPage(), 120);
    clearTimeout(vTimer); setTimeout(pollVideo, 400);
    updateAppHints();
  }
  function resumeApp(id) { openApp(id || (openApps()[0] || {}).id); }
  // a gyorsmenünek: egy app médiája és vezérlése (alapból az előtérben lévő, különben amelyik szól)
  function mediaView(id) {
    if (id) return VIEWS.get(id) || null;
    const apps = [...VIEWS.values()].filter((w) => w._app && !w._app.rawPad && w._ready);
    return apps.find((w) => audible(w)) || (B.app && B.wv) || apps.find((w) => w._playing) || null;
  }
  async function appMedia(id) {
    const w = mediaView(id);
    if (!w) return null;
    const st = await w.executeJavaScript('window.__inxPlayer ? window.__inxPlayer("state") : null', false).catch(() => null);
    return st ? { ...st, appId: w._key, appTitle: w._app.title, bg: w !== B.wv || S.tab !== 'browser', audible: audible(w) } : null;
  }
  const appCmd = (cmd, arg, id) => { const w = mediaView(id); return w ? w.executeJavaScript(`window.__inxPlayer ? window.__inxPlayer(${JSON.stringify(cmd)}, ${Number(arg) || 0}) : null`, true).catch(() => null) : Promise.resolve(null); };

  function themeVars() {
    const t = typeof activeTheme === 'function' ? activeTheme() : {};
    const font = (typeof FONTS !== 'undefined' && FONTS[t.font] ? FONTS[t.font][1] : '"Segoe UI", system-ui, sans-serif');
    const a1 = t.a1 || '#7c3aed', a2 = t.a2 || '#22d3ee', bg = t.bg || '#05060a', panel = t.panel || '#12141e', rad = t.radius ?? 14;
    return `:root { --inx-a1: ${a1}; --inx-a2: ${a2}; --inx-bg: ${bg}; --inx-panel: ${panel}; --inx-grad: linear-gradient(135deg, ${a1}, ${a2});
      --inx-radius: ${rad}px; --inx-radius-sm: ${Math.round(rad * 0.6)}px; --inx-font: ${font};
      --inx-text: #f4f4f5; --inx-muted: #a1a1aa; --inx-line: rgba(255, 255, 255, .1); --inx-panel2: color-mix(in srgb, ${panel} 80%, #fff 6%); }`;
  }

  async function openApp(id) {
    if (id === 'browser') { showBrowser(); return; }
    const def = APPS[id];
    if (!def) return;
    const txt = (f) => fetch(f).then((r) => r.text()).catch(() => '');
    let css;
    [css, NAV_JS, BASE_CSS, SCROLL_CSS] = await Promise.all([txt(def.css), NAV_JS || txt('apps/console-nav.js'), BASE_CSS || txt('apps/console.css'), SCROLL_CSS || txt('apps/scrollbar.css')]);
    if (VIEWS.has(id)) { activate(id); enterAppUi(); return; } // már fut: előtérbe
    saveViewState();
    leavePage({ focus: false });
    for (const w of VIEWS.values()) w.classList.add('bgview');
    B.key = id; B.wv = null; B.ready = false; B.showPage = false; B.vstate = null; B.zoom = 1;
    B.app = { id, ...def, css };
    enterAppUi();
    navigate(def.url);
    toast(`${def.title} – ≡ (Start): megnyitott appok · Guide: kilépés`, '', 4000);
  }
  // a beépített böngésző (az Alkalmazások közül)
  function showBrowser() {
    if (B.app) { saveViewState(); document.body.classList.remove('br-fs', 'br-app', 'br-fit'); B.hideBar = false; }
    activate('browser');
    updateAppHints();
    setTab('browser');
  }
  function closeApp({ home = true, id } = {}) {
    const key = id || (B.app && B.app.id);
    const w = key && VIEWS.get(key);
    if (!w || !w._app) return false;
    const front = w === B.wv;
    if (front) { if (B.fullscreen) exitFullscreen(); activate('browser'); document.body.classList.remove('br-fs', 'br-app', 'br-fit'); B.hideBar = false; }
    VIEWS.delete(key);
    try { w.remove(); } catch { /* */ }
    updateAppHints();
    if (front && home) setTab('home');
    return true;
  }

  // ---- Appváltó (≡ / Start): a megnyitott appok áttekintése, mint iOS-en ----
  let switching = false;
  async function appSwitcher() {
    if (switching) return;
    switching = true;
    updateAppHints();
    if (B.app) saveViewState();
    leavePage({ focus: false });
    await new Promise((r) => setTimeout(r, 120)); // az előnézeti kép elkészül
    const node = h('div', { class: 'app-switch' });
    let pick = null;
    const close = () => { const m = $('#modal-layer .menu-item:last-child'); if (m) m.click(); };
    const list = openApps();
    for (const a of list) {
      const card = h('button', { class: 'as-card focusable', dataset: { id: a.id, ...(a.front ? { default: '1' } : {}) }, onclick: () => { pick = a.id; close(); } },
        h('div', { class: 'as-shot', style: a.thumb ? `background-image:url(${a.thumb})` : '' }, a.thumb ? null : appIcon(a.id, 'big')),
        h('div', { class: 'as-cap' }, appIcon(a.id), h('b', {}, a.title), a.audible ? h('span', { class: 'as-sound' }, uiIcon('volume'), 'szól') : null));
      // bezárás gomb az app alatt (kontrollerrel: lefelé lépve, vagy Ⓧ a kártyán)
      const x = h('button', { class: 'as-close focusable', dataset: { closeId: a.id }, onclick: () => closeOne(wrap) }, uiIcon('close'), 'Bezárás');
      const wrap = h('div', { class: 'as-item', dataset: { id: a.id } }, card, x);
      node.append(wrap);
    }
    node.append(h('button', { class: 'as-card as-home focusable', dataset: list.length ? {} : { default: '1' }, onclick: () => { pick = '#home'; close(); } },
      h('div', { class: 'as-shot' }, uiIcon('apps')), h('div', { class: 'as-cap' }, h('b', {}, list.length ? 'Kezdőlap / más app' : 'Nincs megnyitott app'))));
    function closeOne(wrap) {
      if (!wrap) return;
      closeApp({ id: wrap.dataset.id, home: false });
      const nx = wrap.nextElementSibling || wrap.previousElementSibling;
      wrap.remove();
      if (nx) Nav.focus(nx.matches('.focusable') ? nx : nx.querySelector('.as-card'));
      toast('App bezárva', '', 1500);
    }
    const closeFocused = () => { const c = Nav.current(); closeOne(c && c.closest('.as-item')); return true; };
    document.body.classList.add('switcher-open');
    await modal({ title: 'Megnyitott appok', body: 'Ⓐ megnyitás · Ⓧ vagy a Bezárás gomb: app bezárása · Ⓑ vissza', node, wide: true, noDefault: true, items: [{ label: 'Vissza', value: null }],
      handlers: { x: closeFocused, start: () => { close(); return true; } } });
    switching = false;
    document.body.classList.remove('switcher-open');
    if (pick === '#home') { if (B.app) backgroundApp(); else setTab('home'); if (typeof appsMenu === 'function') appsMenu(); return; }
    if (pick) { openApp(pick); return; }
    if (B.app && VIEWS.has(B.app.id)) enterAppUi(); // vissza az előtérben lévő apphoz
  }

  // ---- Gombjelző sáv az appokban (teljes képernyős videónál rejtve) ----
  let hintEl = null, vTimer = 0;
  function appHintsEl() {
    if (hintEl) return hintEl;
    hintEl = document.createElement('div');
    hintEl.id = 'br-app-hints';
    hintEl.setAttribute('popover', 'manual');
    // resume: a gomb után vissza az oldalra (vissza / előre), különben a gomb maga dönt (kilépés, háttérbe, menü)
    const btn = (cls, text, title, fn, resume = false) => { const b = document.createElement('button'); b.className = `ah-btn ${cls}`; b.textContent = text; b.title = title; b.addEventListener('click', (e) => { e.stopPropagation(); barDone(resume); fn(); }); return b; };
    const nav = document.createElement('div');
    nav.className = 'ah-nav';
    nav.append(btn('', '‹  Vissza', 'Vissza (LB)', () => back(), true), btn('', 'Előre  ›', 'Előre (RB)', () => forward(), true), btn('bgb', '⤓  Háttérbe', 'Háttérbe – tovább szól', () => backgroundApp()),
      btn('', '≡  Menü', 'Nagyítás, könyvjelző…', () => menu()), btn('exit', '✕  Kilépés', 'Kilépés (Guide)', () => confirmExit()));
    const list = document.createElement('div');
    list.className = 'ah-list';
    hintEl.append(nav, list);
    document.body.append(hintEl);
    return hintEl;
  }
  function updateAppHints() {
    const el = appHintsEl();
    const show = !!B.app && !switching && S.tab === 'browser' && !B.fullscreen && !(B.vstate && B.vstate.fs) && !exitAsking;
    try {
      if (!show) { if (el.matches(':popover-open')) el.hidePopover(); return; }
      const pad = document.body.classList.contains('pad-mode') || Nav.padConnected();
      const H = (cls, k, t) => { const s = document.createElement('span'); s.className = 'hint'; const b = document.createElement('b'); b.className = cls; b.textContent = k; s.append(b, t); return s; };
      const v = B.vstate && B.vstate.has;
      const L = B.app.rawPad ? [H('btn-start', 'Guide', 'Kilépés')]
        : B.app.map ? (pad ? [H('btn-start', '✚', 'Mozgatás'), H('btn-start', 'LT/RT', 'Nagyítás'), H('btn-start', 'L', 'Kurzor'), H('btn-a', 'A', 'Kattintás'), H('btn-start', '≡', 'Appok'), H('btn-start', 'Guide', 'Kilépés')]
          : [H('kbd', 'Nyilak', 'Mozgatás'), H('kbd', 'Görgő', 'Nagyítás'), H('kbd', 'F9', 'Appok'), H('kbd', 'Esc', 'Kilépés')])
        : !pad ? [H('kbd', 'Nyilak', 'Navigáció'), H('kbd', 'Enter', 'Kiválasztás'), H('kbd', 'F9', 'Appok'), H('kbd', 'F10', 'Gombsáv'), H('kbd', 'Alt+←/→', 'Vissza / előre'), ...(v ? [H('kbd', 'Szóköz', 'Lejátszás / szünet'), H('kbd', 'F', 'Teljes képernyő')] : []), H('kbd', 'Esc', 'Kilépés')]
          : v ? [H('btn-a', 'A', 'Kattintás'), H('btn-y', 'Y', B.vstate.paused ? 'Lejátszás' : 'Szünet'), H('btn-start', 'LT/RT', '−/+ 10 mp'), H('btn-x', 'X', 'Teljes képernyő'), H('btn-start', '≡', 'Appok'), H('btn-start', 'Guide', 'Kilépés')]
            : [H('btn-start', '✚', 'Navigáció'), H('btn-a', 'A', 'Kiválasztás'), H('btn-start', 'LB/RB', 'Vissza / előre'), H('btn-x', 'X', 'Gépelés'), H('btn-start', '≡', 'Appok'), H('btn-start', 'Guide', 'Kilépés')];
      el.querySelector('.ah-list').replaceChildren(...L);
      const bk = el.querySelector('.ah-btn');
      if (bk) { bk.disabled = !(B.wv && B.ready && B.wv.canGoBack()); bk.nextSibling.disabled = !(B.wv && B.ready && B.wv.canGoForward()); }
      if (!el.matches(':popover-open')) el.showPopover();
    } catch { /* */ }
  }
  // A gombsáv kontrollerrel (≡) és billentyűzettel (F10) is elérhető: balra/jobbra a gombok, Ⓐ/Enter megnyomja,
  // Ⓑ / Esc / fel: vissza az oldalra
  function focusBar() {
    if (!B.app || B.barFocus) return;
    const el = appHintsEl();
    updateAppHints();
    if (!el.matches(':popover-open')) return;
    leavePage({ focus: false });
    const nav = el.querySelector('.ah-nav');
    nav.querySelectorAll('.ah-btn').forEach((b) => b.classList.add('focusable'));
    B.barFocus = true;
    el.classList.add('active');
    const out = () => { barDone(true); return true; };
    Nav.push(() => nav, { b: out, start: out, up: out, down: () => true, guide: () => { barDone(false); confirmExit(); return true; } });
    requestAnimationFrame(() => Nav.focus(nav.querySelector('.ah-btn:not(:disabled)')));
    Sound.move();
  }
  function barDone(resume) {
    if (!B.barFocus) return;
    B.barFocus = false;
    Nav.pop();
    if (hintEl) { hintEl.classList.remove('active'); hintEl.querySelectorAll('.focused').forEach((x) => x.classList.remove('focused')); }
    if (resume && B.app && B.showPage) enterPage();
  }

  function pollVideo() {
    clearTimeout(vTimer);
    if (!B.app || B.app.rawPad) { B.vstate = null; updateAppHints(); return; }
    if (B.wv && B.ready) {
      B.wv.executeJavaScript('window.__inxPlayer ? window.__inxPlayer("state") : null', false)
        .then((st) => { B.vstate = st; updateAppHints(); }).catch(() => {});
    }
    vTimer = setTimeout(pollVideo, 1000);
  }

  let exitAsking = false;
  async function confirmExit() {
    if (exitAsking) return;
    exitAsking = true;
    updateAppHints();
    if (B.fullscreen) exitFullscreen();
    const wasPage = B.mode === 'page';
    leavePage({ focus: false });
    const name = B.app ? B.app.title : 'a böngészőből';
    const v = await modal({
      title: B.app ? `Kilépsz: ${B.app.title}?` : 'Kilépsz a böngészőből?',
      body: B.app ? 'Visszatérsz az InariX kezdőképernyőjére.' : 'A megnyitott oldal bezárul, és visszatérsz a kezdőképernyőre.',
      items: [{ icon: 'close', label: 'Kilépés', value: 'exit', kind: 'danger' }, ...(B.app && !B.app.rawPad ? [{ icon: 'toDesktop', label: 'Háttérbe (nyitva marad)', value: 'bg' }] : []), { label: 'Mégse', value: null, def: true }, { icon: 'settings', label: 'Gyorsmenü', value: 'quick' }],
    });
    exitAsking = false;
    void name;
    updateAppHints();
    if (v === 'exit') { if (B.app) closeApp(); else { closePage(); setTab('home'); } return; }
    if (v === 'quick') { openQuick(); return; }
    if (v === 'bg') { backgroundApp(); return; }
    if (wasPage && B.showPage) enterPage();
  }

  function navigate(url, { focusPage = true } = {}) {
    if (!url) return;
    if (S.tab !== 'browser') setTab('browser', { silent: true });
    const wv = ensureView();
    B.showPage = true; B.url = url; B.title = hostOf(url);
    if (B.ready) wv.loadURL(url).catch(() => {}); else wv.setAttribute('src', url);
    renderBar(); renderView();
    if (focusPage) setTimeout(() => enterPage(), 150);
  }

  async function promptAddress() {
    leavePage();
    const v = await OSK.prompt({ title: 'Cím vagy keresés', value: B.showPage && /^https?:/.test(B.url) ? B.url : '' });
    const url = resolveInput(v);
    if (url) navigate(url);
  }

  function goHome() {
    const home = cfg().home;
    if (home) return navigate(home);
    B.showPage = false;
    leavePage();
    renderView(); renderStart();
    requestAnimationFrame(() => Nav.focus(el('br-search'), { silent: true }));
  }
  const back = () => { if (B.wv && B.ready && B.wv.canGoBack()) { B.wv.goBack(); return true; } return false; };
  const forward = () => { if (B.wv && B.ready && B.wv.canGoForward()) { B.wv.goForward(); return true; } return false; };
  const reload = () => { if (B.wv && B.ready && B.showPage) (B.loading ? B.wv.stop() : B.wv.reload()); };

  function setZoom(z) {
    B.zoom = Math.max(ZOOMS[0], Math.min(ZOOMS[ZOOMS.length - 1], z));
    if (B.wv && B.ready) B.wv.setZoomFactor(B.zoom);
    toast(`Nagyítás: ${Math.round(B.zoom * 100)}%`, '', 1200);
    renderBar();
  }
  const zoomStep = (d) => { const i = ZOOMS.findIndex((z) => z >= B.zoom - 0.001); setZoom(ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, (i < 0 ? 4 : i) + d))]); };

  // HTML teljes képernyő: ilyenkor a <webview> elem a legfelső rétegbe kerül, minden más elem alá csúszik.
  // A kurzor és a kilépési sáv ezért "popover" (szintén legfelső réteg, a webview fölött).
  function setFullscreen(v) {
    B.fullscreen = v;
    setTimeout(updateAppHints, 0);
    document.body.classList.toggle('br-fs', v || B.hideBar);
    if (v && B.mode !== 'page') enterPage();
    showFsBar(v);
    placeCursor();
  }
  let fsBarTimer = 0;
  function showFsBar(v) {
    const bar = el('br-fs-bar');
    if (!bar) return;
    clearTimeout(fsBarTimer);
    try {
      if (v) {
        if (!bar.matches(':popover-open')) bar.showPopover();
        bar.classList.remove('fade');
        fsBarTimer = setTimeout(() => bar.classList.add('fade'), 4000);
      } else if (bar.matches(':popover-open')) bar.hidePopover();
    } catch { /* */ }
  }
  // A legfelső rétegben a később megjelenített elem van felül: a teljes képernyőre váltás után a
  // popovereket újra megnyitjuk, hogy a teljes képernyős weboldal fölé kerüljenek
  function restack() {
    for (const id of ['br-fs-bar', 'br-app-hints', 'br-cursor']) {
      const e = el(id);
      try { if (e && e.matches(':popover-open')) { e.hidePopover(); e.showPopover(); } } catch { /* */ }
    }
  }
  document.addEventListener('fullscreenchange', () => { if (document.fullscreenElement) { showFsBar(B.fullscreen); placeCursor(); restack(); } });
  function exitFullscreen() {
    if (B.wv && B.ready) B.wv.executeJavaScript('document.fullscreenElement && document.exitFullscreen()', true).catch(() => {});
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    // ha az oldal nem reagál, akkor is visszaállunk
    setTimeout(() => { if (B.fullscreen) { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); setFullscreen(false); } }, 600);
  }
  function toggleBar() {
    B.hideBar = !B.hideBar;
    document.body.classList.toggle('br-fs', B.fullscreen || B.hideBar);
    if (B.hideBar && B.mode !== 'page') enterPage();
  }

  // ---------- Előzmények, könyvjelzők ----------
  function addHistory(url, title) {
    const c = cfg();
    if (!c.saveHistory || !/^https?:/.test(url)) return;
    const h = c.history || (c.history = []);
    const i = h.findIndex((x) => x.url === url);
    if (i >= 0) h.splice(i, 1);
    h.unshift({ url, title: title || hostOf(url), at: Date.now() });
    if (h.length > 300) h.length = 300;
    save();
  }
  function updateHistoryTitle(url, title) {
    const h = cfg().history || [];
    const e = h.find((x) => x.url === url);
    if (e && title && e.title !== title) { e.title = title; save(); }
  }
  const isBookmarked = () => (cfg().bookmarks || []).some((b) => b.url === B.url);
  function toggleBookmark() {
    if (!B.showPage || !/^https?:/.test(B.url)) return;
    const c = cfg();
    c.bookmarks = c.bookmarks || [];
    const i = c.bookmarks.findIndex((b) => b.url === B.url);
    if (i >= 0) { c.bookmarks.splice(i, 1); toast('Könyvjelző eltávolítva'); }
    else { c.bookmarks.unshift({ url: B.url, title: B.title || hostOf(B.url), at: Date.now() }); toast('Könyvjelző hozzáadva', 'ok'); }
    save(true);
    renderBar();
  }

  // ---------- Megjelenítés ----------
  function renderBar() {
    const u = el('br-url');
    if (!u) return;
    const secure = /^https:/.test(B.url);
    u.replaceChildren(
      h('span', { class: `br-lock${B.showPage && !secure ? ' insecure' : ''}` }, uiIcon(B.showPage ? (secure ? 'lock' : 'alert') : 'search')),
      B.showPage ? h('span', { class: 'val' }, B.title || B.url, h('small', {}, `  ${hostOf(B.url)}`)) : h('span', { class: 'ph' }, 'Keresés vagy webcím'));
    el('br-back').disabled = !B.canBack || !B.showPage;
    el('br-fwd').disabled = !B.canFwd || !B.showPage;
    el('br-reload').replaceChildren(uiIcon(B.loading ? 'close' : 'restart'));
    el('br-reload').title = B.loading ? 'Leállítás' : 'Újratöltés';
    el('br-star').replaceChildren(uiIcon(isBookmarked() ? 'starFill' : 'star'));
    el('br-star').classList.toggle('on', isBookmarked());
    el('br-star').disabled = !B.showPage;
    el('br-page').disabled = !B.showPage;
    el('br-zoom').textContent = `${Math.round(B.zoom * 100)}%`;
    el('screen-browser').classList.toggle('loading', B.loading);
  }

  function renderView() {
    el('br-start').classList.toggle('hidden', B.showPage);
    if (B.wv) B.wv.classList.toggle('off', !B.showPage);
  }

  function linkCard(title, url, color, extra) {
    const letter = (title || hostOf(url) || '?').replace(/^www\./, '').charAt(0).toUpperCase();
    return h('button', { class: 'focusable br-link', title: url, onclick: () => navigate(url) },
      h('span', { class: 'br-ico', style: color ? `background:${color}` : '' }, letter),
      h('span', { class: 'br-lt' }, title || hostOf(url)),
      h('span', { class: 'br-lh' }, extra || hostOf(url)));
  }

  function renderStart() {
    const c = cfg();
    const eng = (SEARCH[c.search] || SEARCH.google)[0];
    const box = el('br-start');
    const sections = [
      h('button', { class: 'focusable search-box br-search', id: 'br-search', dataset: { default: '1' }, onclick: promptAddress },
        h('span', { class: 'ico' }, uiIcon('search')), h('span', { class: 'ph' }, `Keresés (${eng}) vagy webcím`)),
      h('div', { class: 'section-title small' }, 'Gyorslinkek'),
      h('div', { class: 'br-links' }, QUICK.map(([t, u, col]) => linkCard(t, u, col))),
    ];
    if ((c.bookmarks || []).length) {
      sections.push(h('div', { class: 'section-title small' }, 'Könyvjelzők'),
        h('div', { class: 'br-links' }, c.bookmarks.slice(0, 16).map((b) => linkCard(b.title, b.url))));
    }
    const recent = (c.history || []).slice(0, 8);
    if (recent.length) {
      sections.push(h('div', { class: 'section-title small' }, 'Legutóbb'),
        h('div', { class: 'br-links' }, recent.map((x) => linkCard(x.title, x.url, null, `${hostOf(x.url)} · ${fmtSince(x.at)}`))));
    }
    sections.push(h('div', { class: 'help br-help' },
      'Oldalon: bal kar = kurzor, Ⓐ = kattintás, jobb kar = görgetés, Ⓧ = gépelés, Ⓨ = cím, Ⓑ = vissza, LB/RB = előző/következő oldal, ⧉ (Select) = eszköztár, ≡ = menü. ',
      'Billentyűzettel: F6 vagy Ctrl+L = címsor, Shift+Esc = vissza az eszköztárra. DRM-védett szolgáltatások (Netflix, Spotify, Disney+) itt nem játszhatók le.'));
    box.replaceChildren(...sections);
  }

  function render() {
    renderBar(); renderView();
    if (!B.showPage) renderStart();
    requestAnimationFrame(() => {
      if (B.showPage && B.mode === 'page') return;
      if (!Nav.current()) Nav.focus(B.showPage ? el('br-page') : el('br-search'), { silent: true });
    });
  }

  // ---------- Oldal mód: kontroller → weboldal ----------
  const cursorEl = () => el('br-cursor');
  function placeCursor() {
    const c = cursorEl();
    const show = B.curVisible && B.mode === 'page' && !!B.wv;
    if (show) {
      const r = B.wv.getBoundingClientRect();
      c.style.transform = `translate(${r.left + B.cur.x}px, ${r.top + B.cur.y}px)`;
    }
    c.classList.toggle('hidden', !show);
    try {
      if (show && !c.matches(':popover-open')) c.showPopover();
      else if (!show && c.matches(':popover-open')) c.hidePopover();
    } catch { /* */ }
  }
  function enterPage() {
    if (!B.showPage || !B.wv) return;
    if (B.mode === 'page') return;
    B.mode = 'page';
    Nav.suspend(true);
    document.querySelectorAll('#screen-browser .focused').forEach((x) => x.classList.remove('focused'));
    el('screen-browser').classList.add('page-mode');
    const r = B.wv.getBoundingClientRect();
    if (B.cur.x > r.width || B.cur.y > r.height || B.cur.x <= 0) B.cur = { x: r.width / 2, y: r.height / 2 };
    B.curVisible = Nav.padConnected();
    placeCursor();
    try { B.wv.focus(); } catch { /* még nincs csatolva */ }
    B.padHeld = snapshotPressed(); // a belépést kiváltó gomb felengedéséig ne kattintson
    B.lastT = performance.now();
    cancelAnimationFrame(B.raf);
    B.raf = requestAnimationFrame(padLoop);
    renderHints();
    updateAppHints();
  }
  function leavePage({ focus = true } = {}) {
    if (B.mode !== 'page') return;
    B.mode = 'toolbar';
    cancelAnimationFrame(B.raf);
    if (B.mouseDown) sendMouse('mouseUp');
    el('screen-browser').classList.remove('page-mode');
    placeCursor();
    if (B.fullscreen) exitFullscreen();
    if (B.hideBar && !B.app) { B.hideBar = false; document.body.classList.toggle('br-fs', B.fullscreen); }
    try { document.activeElement && document.activeElement.blur(); window.focus(); } catch { /* */ }
    Nav.suspend(false);
    if (focus && S.tab === 'browser') requestAnimationFrame(() => Nav.focus(el('br-page'), { silent: true }));
    renderHints();
  }

  function snapshotPressed() {
    const held = {};
    for (const p of navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : []) p.buttons.forEach((b, i) => { if (b.pressed) held[i] = { since: 0, last: 0, swallow: true }; });
    return held;
  }

  function sendMouse(type, extra = {}) {
    if (!B.wv || !B.ready) return;
    const x = Math.round(B.cur.x), y = Math.round(B.cur.y);
    try { B.wv.sendInputEvent({ type, x, y, button: 'left', clickCount: 1, ...extra }); } catch { /* */ }
    if (type === 'mouseDown') B.mouseDown = true;
    if (type === 'mouseUp') B.mouseDown = false;
  }
  function sendKey(keyCode, mods) {
    if (!B.wv || !B.ready) return;
    try {
      B.wv.sendInputEvent({ type: 'keyDown', keyCode, modifiers: mods });
      if (keyCode === 'Enter') B.wv.sendInputEvent({ type: 'char', keyCode: '\r' });
      B.wv.sendInputEvent({ type: 'keyUp', keyCode, modifiers: mods });
    } catch { /* */ }
  }

  async function typeText(field) {
    // a képernyő-billentyűzet a konzol felületén jelenik meg; a szöveg a weboldal fókuszált mezőjébe kerül
    // (szövegmezőnél a mező jelenlegi tartalmával nyílik, és a kész szöveg lecseréli)
    const wv = B.wv;
    leavePage({ focus: false });
    const t = await OSK.prompt({ title: field && field.label ? field.label : 'Gépelés az oldalra (≡ = kész)', value: field ? field.value : '', password: !!(field && field.password), numeric: !!(field && field.numeric) });
    enterPage();
    if (t === null || !wv) return;
    try {
      wv.focus();
      if (field) await wv.executeJavaScript('window.__inxSelectField && window.__inxSelectField()', true);
      if (t || field) await wv.insertText(t);
      // szövegmezőben a kész szöveg után az Enter elküldi (pl. keresés)
      if (field && t) setTimeout(() => sendKey('Enter'), 60);
    } catch { /* */ }
  }
  // Ⓐ: ha a D-paddal kijelölt elemen állunk (a kurzor rejtve), azt aktiválja – szövegmezőn a képernyő-billentyűzet nyílik
  async function activateFocused() {
    if (!B.wv || !B.ready) return false;
    const r = await B.wv.executeJavaScript('window.__inxActivate ? window.__inxActivate() : null', true).catch(() => null);
    if (!r || r.kind === 'none') return false;
    if (r.kind === 'edit') typeText(r);
    return true;
  }

  const BTN_REPEAT = new Set([12, 13, 14, 15]);
  // felhős játék közben csak a Guide gombot figyeljük (a többi a játéké, a Gamepad API-n át)
  let guidePrev = false;
  function pollGuideOnly() {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    const g = pads.some((p) => p.buttons[16] && p.buttons[16].pressed);
    if (g && !guidePrev) confirmExit();
    guidePrev = g;
  }
  // videós oldalon a lejátszó kontrollerrel: Ⓨ lejátszás/szünet, LB/RB ±10 mp, LT/RT hangerő, Ⓧ teljes képernyő,
  // teljes képernyőn Ⓐ is lejátszás/szünet (a D-pad ott a lejátszó saját nyilaié: tekerés, hangerő)
  const player = (cmd, arg = 0) => (B.wv && B.ready ? B.wv.executeJavaScript(`window.__inxPlayer ? window.__inxPlayer(${JSON.stringify(cmd)}, ${Number(arg) || 0}) : null`, true).then((st) => { if (st) { B.vstate = st; updateAppHints(); } }).catch(() => {}) : null);
  function playerButton(i) {
    const v = B.vstate;
    if (!v || !v.has) return false;
    if (i === 3) { player('toggle'); return true; }
    if (i === 2) { player('fs'); return true; }
    if (i === 6) { player('seek', -10); return true; }
    if (i === 7) { player('seek', 10); return true; }
    if (i === 11) { player('mute'); return true; }
    if (i === 0 && B.fullscreen) { player('toggle'); return true; }
    return false;
  }

  // térkép nagyítás: görgő a térkép közepén (minden térképes oldalon működik)
  // Térkép vezérlés: ha az oldalon Leaflet-térkép van (Windy), annak API-ján; különben billentyűkkel (Google Maps)
  const MAP_JS = `(window.W && W.map && (W.map.map || W.map)) || null`;
  function mapCmd(kind, a = 0, b = 0) {
    if (!B.wv || !B.ready) return;
    const w = B.wv;
    w.executeJavaScript(`(() => { const m = ${MAP_JS}; if (!m) return false; ${kind === 'zoom' ? `a > 0 ? m.zoomIn() : m.zoomOut()`.replace(/a > 0/, String(a > 0)) : `m.panBy([${a}, ${b}])`}; return true; })()`, true)
      .then((ok) => {
        if (ok) return;
        if (kind === 'zoom') sendKey(a > 0 ? '=' : '-');
        else sendKey(a > 0 ? 'Right' : a < 0 ? 'Left' : b > 0 ? 'Down' : 'Up');
      }).catch(() => {});
  }
  const mapZoom = (d) => mapCmd('zoom', d);
  function onButton(i, phase) {
    if (phase === 'up') { if (i === 0 && B.mouseDown) sendMouse('mouseUp'); return; }
    S.lastInput = Date.now();
    if (i === 16) { confirmExit(); return; } // Guide: kilépés megerősítéssel – mindig (teljes képernyős videóban is)
    if (B.app && B.app.rawPad) return; // felhős játék: minden más gomb a játéké
    if (B.app && playerButton(i)) return;
    if (B.app && i === 8) { confirmExit(); return; }
    if (B.app && i === 9 && !B.fullscreen) { appSwitcher(); return; }
    // térkép appok: LT/RT nagyítás (a D-pad nyilakkal mozgat, a bal kar kurzor, Ⓐ kattint)
    if (B.app && B.app.map && (i === 6 || i === 7)) { mapZoom(i === 7 ? 1 : -1); return; }
    if (B.app && B.app.map && i >= 12 && i <= 15) { const st = 160; mapCmd('pan', i === 14 ? -st : i === 15 ? st : 0, i === 12 ? -st : i === 13 ? st : 0); return; }
    if (B.app && i === 1 && !B.fullscreen && !(B.wv && B.ready && B.wv.canGoBack())) { confirmExit(); return; }
    switch (i) {
      case 0:
        if (!B.curVisible && B.app && !B.app.map) { activateFocused().then((ok) => { if (!ok) { B.curVisible = true; placeCursor(); sendMouse('mouseDown'); sendMouse('mouseUp'); } }); break; }
        B.curVisible = true; placeCursor(); sendMouse('mouseDown'); break;
      case 1:
        if (B.fullscreen) { exitFullscreen(); break; }
        if (!back()) { Sound.back(); leavePage(); }
        break;
      case 2: (B.app ? B.wv.executeJavaScript('(()=>{const e=document.activeElement; return e && (e.isContentEditable || /^(INPUT|TEXTAREA)$/.test(e.tagName)) ? { value: e.isContentEditable ? e.innerText.replace(/\\n$/, "") : e.value || "", label: e.getAttribute("aria-label") || e.getAttribute("placeholder") || "" } : null })()', true).catch(() => null) : Promise.resolve(null)).then((f) => typeText(f)); break;
      case 3: promptAddress(); break;
      case 4: back(); break;
      case 5: forward(); break;
      case 6: sendKey('PageUp'); break;
      case 7: sendKey('PageDown'); break;
      case 8: if (B.fullscreen) exitFullscreen(); else leavePage(); break;
      case 9: if (B.fullscreen) { showFsBar(true); break; } leavePage(); menu(); break;
      case 10: B.curVisible = !B.curVisible; placeCursor(); break; // bal kar lenyomás: kurzor elrejtése (pl. videónézéshez)
      case 11: sendKey('Enter'); break;
      case 12: if (B.curVisible) { B.curVisible = false; placeCursor(); } sendKey('Up'); break;
      case 13: if (B.curVisible) { B.curVisible = false; placeCursor(); } sendKey('Down'); break;
      case 14: if (B.curVisible) { B.curVisible = false; placeCursor(); } sendKey('Left'); break;
      case 15: if (B.curVisible) { B.curVisible = false; placeCursor(); } sendKey('Right'); break;
      default: break;
    }
  }

  function padLoop(t) {
    if (B.mode !== 'page') return;
    if (B.app && B.app.rawPad) { pollGuideOnly(); B.raf = requestAnimationFrame(padLoop); return; }
    const dt = Math.min(0.05, (t - B.lastT) / 1000);
    B.lastT = t;
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    const pressed = new Set();
    let lx = 0, ly = 0, rx = 0, ry = 0;
    for (const p of pads) {
      p.buttons.forEach((b, i) => { if (b.pressed) pressed.add(i); });
      if (Math.abs(p.axes[0] || 0) > Math.abs(lx)) lx = p.axes[0];
      if (Math.abs(p.axes[1] || 0) > Math.abs(ly)) ly = p.axes[1];
      if (Math.abs(p.axes[2] || 0) > Math.abs(rx)) rx = p.axes[2];
      if (Math.abs(p.axes[3] || 0) > Math.abs(ry)) ry = p.axes[3];
    }
    // Select+Start 1 mp-ig nyomva (mint a streamben): ki a teljes képernyőből, vissza az eszköztárra
    if (pressed.has(8) && pressed.has(9)) {
      if (!B.comboAt) B.comboAt = t;
      else if (t - B.comboAt > 900) { B.comboAt = 0; B.padHeld = snapshotPressed(); Sound.back(); leavePage(); return; }
    } else B.comboAt = 0;
    // gombok (élek + ismétlés a D-padon)
    for (const i of pressed) {
      const hd = B.padHeld[i];
      if (!hd) { B.padHeld[i] = { since: t, last: t }; onButton(i, 'down'); if (B.mode !== 'page') return; }
      else if (!hd.swallow && BTN_REPEAT.has(i) && t - hd.since > 380 && t - hd.last > 70) { hd.last = t; onButton(i, 'down'); }
    }
    for (const k of Object.keys(B.padHeld)) {
      if (!pressed.has(Number(k))) { const was = B.padHeld[k]; delete B.padHeld[k]; if (!was.swallow) onButton(Number(k), 'up'); }
    }
    // bal kar: kurzor (négyzetes görbe a finom mozgáshoz)
    const curve = (v, dz = 0.14) => { const a = Math.abs(v); if (a < dz) return 0; const n = (a - dz) / (1 - dz); return Math.sign(v) * n * n; };
    const cx = curve(lx), cy = curve(ly);
    if (cx || cy) {
      const r = B.wv.getBoundingClientRect();
      const speed = 1500 * ((cfg().cursorSpeed || 100) / 100) * (B.mouseDown ? 0.6 : 1);
      B.cur.x = Math.max(0, Math.min(r.width - 2, B.cur.x + cx * speed * dt));
      B.cur.y = Math.max(0, Math.min(r.height - 2, B.cur.y + cy * speed * dt));
      B.curVisible = true;
      placeCursor();
      sendMouse('mouseMove', B.mouseDown ? { button: 'left' } : {});
      S.lastInput = Date.now();
    }
    // jobb kar: görgetés
    const sx = curve(rx, 0.18), sy = curve(ry, 0.18);
    if (sx || sy) {
      if (B.wv && B.ready) {
        try { B.wv.sendInputEvent({ type: 'mouseWheel', x: Math.round(B.cur.x), y: Math.round(B.cur.y), deltaX: -sx * 1800 * dt, deltaY: -sy * 1800 * dt, canScroll: true }); } catch { /* */ }
      }
      S.lastInput = Date.now();
    }
    B.raf = requestAnimationFrame(padLoop);
  }

  // ---------- Fiók-bejelentkezés sáv ----------
  function setBanner(text) {
    let b = el('br-banner');
    if (!text) { if (b) b.remove(); return; }
    if (!b) { b = h('div', { id: 'br-banner' }); el('br-view').before(b); }
    b.textContent = text;
  }
  function closePage() {
    leavePage({ focus: false });
    B.showPage = false;
    if (B.wv && B.ready) B.wv.loadURL('about:blank').catch(() => {});
    renderView(); renderStart(); renderBar();
  }

  // ---------- Menük ----------
  async function menu() {
    const items = [];
    if (B.app) items.push({ icon: 'close', label: `Kilépés: ${B.app.title}`, value: 'close-app', kind: 'danger' });
    if (S.loginStore) items.push({ label: `Bejelentkezés megszakítása (${STORE_LABEL[S.loginStore]})`, value: 'cancel-login', kind: 'danger' });
    if (B.showPage) {
      items.push({ label: isBookmarked() ? '★ Könyvjelző eltávolítása' : '☆ Könyvjelző hozzáadása', value: 'star' });
      items.push({ label: 'Nagyítás +', value: 'zin' }, { label: 'Nagyítás −', value: 'zout' }, { label: `Nagyítás alaphelyzet (most ${Math.round(B.zoom * 100)}%)`, value: 'z1' });
      items.push({ label: 'Teljes nézet (eszköztár elrejtése)', value: 'bar' });
      items.push({ label: 'Beállítás kezdőlapnak', value: 'sethome' });
      items.push({ label: 'Megnyitás asztali böngészőben', value: 'ext' });
    }
    items.push({ label: 'Könyvjelzők', value: 'bm' }, { label: 'Előzmények', value: 'hist' }, { label: `Letöltések${B.downloads.length ? ` (${B.downloads.length})` : ''}`, value: 'dl' });
    items.push({ label: 'Böngésző beállítások', value: 'settings' });
    items.push({ label: 'Bezárás', value: null });
    const v = await modal({ title: B.showPage ? (B.title || 'Böngésző') : 'Böngésző', body: B.showPage ? B.url : '', items });
    if (v === 'cancel-login') { cancelLogin(); closePage(); loginFinished(); return; }
    if (v === 'close-app') { closeApp(); return; }
    if (v === 'star') toggleBookmark();
    else if (v === 'zin') zoomStep(1);
    else if (v === 'zout') zoomStep(-1);
    else if (v === 'z1') setZoom(1);
    else if (v === 'bar') toggleBar();
    else if (v === 'sethome') { cfg().home = B.url; save(true); toast('Kezdőlap beállítva', 'ok'); }
    else if (v === 'ext') { gamo.openExternal(B.url).catch(() => {}); }
    else if (v === 'bm') listMenu('Könyvjelzők', cfg().bookmarks || [], true);
    else if (v === 'hist') listMenu('Előzmények', cfg().history || [], false);
    else if (v === 'dl') downloadsMenu();
    else if (v === 'settings') settingsMenu();
  }

  async function listMenu(title, list, removable) {
    if (!list.length) { toast(removable ? 'Még nincs könyvjelző (≡ menü → Könyvjelző hozzáadása)' : 'Az előzmények üresek'); return; }
    const items = list.slice(0, 40).map((x, i) => ({ label: `${x.title || hostOf(x.url)}  ·  ${hostOf(x.url)}`, value: i }));
    if (removable) items.push({ label: 'Könyvjelző törlése…', value: 'del' });
    else items.push({ label: 'Előzmények törlése', value: 'clear', kind: 'danger' });
    items.push({ label: 'Vissza', value: null });
    const v = await modal({ title, items, wide: true });
    if (typeof v === 'number') navigate(list[v].url);
    else if (v === 'clear' && await confirmBox('Előzmények törlése', 'Minden mentett előzmény törlődik.', 'Törlés')) {
      cfg().history = []; save(true); toast('Előzmények törölve', 'ok'); if (!B.showPage) renderStart();
    } else if (v === 'del') {
      const d = await modal({ title: 'Melyik könyvjelzőt törlöd?', items: [...list.map((x, i) => ({ label: x.title || x.url, value: i })), { label: 'Mégse', value: null }] });
      if (typeof d === 'number') { list.splice(d, 1); save(true); renderBar(); if (!B.showPage) renderStart(); toast('Könyvjelző törölve'); }
    }
  }

  async function downloadsMenu() {
    if (!B.downloads.length) { toast('Ebben a munkamenetben még nem volt letöltés'); return; }
    const fmt = (d) => d.state === 'completed' ? 'kész' : d.state === 'progressing' || d.state === 'started' ? `${d.total ? Math.round((d.received || 0) / d.total * 100) : 0}%` : d.state === 'cancelled' ? 'megszakítva' : 'hiba';
    const items = B.downloads.map((d, i) => ({ label: `${d.name}  ·  ${fmt(d)}`, value: i }));
    items.push({ label: 'Vissza', value: null });
    const v = await modal({ title: 'Letöltések (Letöltések mappa)', items, wide: true });
    if (typeof v === 'number' && B.downloads[v].file) gamo.browserShowDownload(B.downloads[v].file).catch((e) => toast(e.message, 'err'));
  }

  async function settingsMenu() {
    const c = cfg();
    const v = await modal({
      title: 'Böngésző beállítások',
      items: [
        { label: `Keresőmotor: ${(SEARCH[c.search] || SEARCH.google)[0]}`, value: 'search' },
        { label: `Kezdőlap: ${c.home ? hostOf(c.home) : 'InariX kezdőlap'}`, value: 'home' },
        { label: `Kurzor sebesség: ${c.cursorSpeed || 100}%`, value: 'speed' },
        { label: `Előzmények mentése: ${c.saveHistory ? 'be' : 'ki'}`, value: 'hist' },
        { label: 'Gyorsítótár törlése', value: 'cache' },
        { label: 'Minden böngészési adat törlése (sütik, bejelentkezések)', value: 'all', kind: 'danger' },
        { label: 'Vissza', value: null },
      ],
    });
    if (v === 'search') {
      const keys = Object.keys(SEARCH);
      c.search = keys[(keys.indexOf(c.search) + 1) % keys.length]; save(true); renderStart(); return settingsMenu();
    }
    if (v === 'home') { c.home = ''; save(true); toast('Kezdőlap: InariX kezdőlap (oldalon a ≡ menüben bármelyik oldal beállítható)'); return settingsMenu(); }
    if (v === 'speed') { const steps = [50, 75, 100, 125, 150, 200]; c.cursorSpeed = steps[(steps.indexOf(c.cursorSpeed || 100) + 1) % steps.length]; save(true); return settingsMenu(); }
    if (v === 'hist') { c.saveHistory = !c.saveHistory; save(true); return settingsMenu(); }
    if (v === 'cache') { await gamo.browserClear('cache'); toast('Gyorsítótár törölve', 'ok'); }
    if (v === 'all' && await confirmBox('Böngészési adatok törlése', 'Minden süti, bejelentkezés és tárolt oldaladat törlődik. Az előzmények és könyvjelzők megmaradnak.', 'Törlés')) {
      await gamo.browserClear('all'); toast('Böngészési adatok törölve', 'ok');
      if (B.wv && B.ready && B.showPage) B.wv.reload();
    }
  }

  // ---------- Fül integráció ----------
  function handlers() {
    return {
      y: () => { promptAddress(); return true; },
      x: () => { if (B.showPage) enterPage(); return true; },
      start: () => { if (B.app || openApps().length) appSwitcher(); else menu(); return true; },
      guide: () => { if (B.showPage || B.app) { confirmExit(); return true; } return false; },
      'edge-down': () => { if (B.showPage) enterPage(); },
      lt: () => back(), rt: () => forward(),
      b: () => {
        if (B.showPage && back()) { Sound.back(); return true; }
        if (B.app) { confirmExit(); return true; } // az alkalmazás kezdőlapján: kilépés (megerősítéssel)
        if (B.showPage) { Sound.back(); B.showPage = false; render(); requestAnimationFrame(() => Nav.focus(el('br-search'), { silent: true })); return true; }
        return false; // a kezdőlapon a globális Vissza (→ Könyvtár)
      },
    };
  }

  function hints(H) {
    if (B.mode === 'page') return [H('btn-a', 'A', 'Kattintás'), H('btn-x', 'X', 'Gépelés'), H('btn-y', 'Y', 'Cím'), H('btn-b', 'B', 'Vissza'), H('btn-start', '⧉', 'Eszköztár'), H('btn-start', '≡', 'Menü')];
    return [H('btn-a', 'A', 'Kiválasztás'), H('btn-y', 'Y', 'Cím / keresés'), ...(B.showPage ? [H('btn-x', 'X', 'Oldal vezérlése')] : []), H('btn-b', 'B', 'Vissza'), H('btn-start', '≡', 'Menü')];
  }

  function init() {
    el('br-back').onclick = () => back();
    el('br-fwd').onclick = () => forward();
    el('br-reload').onclick = () => reload();
    el('br-home').onclick = () => goHome();
    el('br-url').onclick = () => promptAddress();
    el('br-star').onclick = () => toggleBookmark();
    el('br-zoom').onclick = () => zoomStep(1);
    el('br-page').onclick = () => enterPage();
    el('br-menu').onclick = () => menu();
    // valódi egérrel a weboldalra kattintva a kontrolleres kurzor eltűnik
    el('br-view').addEventListener('mousedown', () => { B.curVisible = false; placeCursor(); }, true);
    gamo.on('browser:open', ({ url }) => navigate(url, { focusPage: B.mode === 'page' }));
    gamo.on('browser:key', (k) => {
      if (k === 'address') promptAddress();
      else if (k === 'back') back();
      else if (k === 'forward') forward();
      else if (k === 'reload') reload();
      else if (k === 'home') goHome();
      else if (k === 'exit') confirmExit();
      else if (k === 'esc' && B.app && !B.fullscreen) confirmExit();
      else if (k === 'bar' && B.app) focusBar();
      else if (k === 'switcher') appSwitcher();
      else if (k === 'exitfs') exitFullscreen();
    });
    gamo.on('browser:download', (d) => {
      const i = B.downloads.findIndex((x) => x.id === d.id);
      if (i >= 0) B.downloads[i] = { ...B.downloads[i], ...d }; else B.downloads.unshift(d);
      if (d.state === 'started') toast(`Letöltés: ${d.name}`);
      else if (d.state === 'completed') toast(`Letöltve: ${d.name} (Letöltések mappa)`, 'ok');
      else if (d.state === 'interrupted' || d.state === 'cancelled') toast(`A letöltés nem sikerült: ${d.name}`, 'err');
    });
    renderBar(); renderView(); renderStart();
  }

  return {
    init, render, handlers, hints, navigate, menu, leavePage, setBanner, closePage, openApp, closeApp, confirmExit, APPS, backgroundApp, resumeApp, appMedia, appCmd,
    get app() { return B.app; }, openApps, appSwitcher, showBrowser,
    // képernyővédő ne induljon videó közben vagy amíg az oldalt vezérlik
    // előtérben futó app vagy lejátszás közben nincs képernyővédő
    blocksSaver: () => (B.app && S.tab === 'browser') || openApps().some((a) => a.audible) || (B.vstate && B.vstate.has && !B.vstate.paused) || (S.tab === 'browser' && (B.playing || B.mode === 'page' && Date.now() - S.lastInput < 15 * 60000)),
    // másik fülre lépve a futó app a háttérbe kerül (tovább szól)
    onTabLeave: () => { if (B.app) backgroundApp({ toHome: false }); else leavePage({ focus: false }); },
    state: () => ({ mode: B.mode, url: B.url, title: B.title, showPage: B.showPage, ready: B.ready, loading: B.loading, zoom: B.zoom, cur: { ...B.cur }, fs: B.fullscreen }),
    _test: { resolveInput, sendMouse, sendKey, enterPage, mapZoom, onButton, B },
  };
})();
