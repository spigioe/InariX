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

  const B = {
    wv: null, ready: false, mode: 'toolbar', showPage: false, url: '', title: '', loading: false,
    canBack: false, canFwd: false, zoom: 1, fullscreen: false, playing: false, hideBar: false,
    cur: { x: -1, y: -1 }, curVisible: false, padHeld: {}, raf: 0, lastT: 0, downloads: [],
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
  function ensureView() {
    if (B.wv) return B.wv;
    const wv = document.createElement('webview');
    wv.setAttribute('partition', PARTITION);
    wv.setAttribute('allowpopups', ''); // a felugrókat a fő folyamat ugyanebbe a nézetbe irányítja
    wv.setAttribute('webpreferences', 'contextIsolation=yes, sandbox=yes');
    wv.id = 'br-webview';
    el('br-view').prepend(wv);
    const sync = () => {
      if (!B.ready) return;
      B.canBack = wv.canGoBack(); B.canFwd = wv.canGoForward();
      B.url = wv.getURL(); B.title = wv.getTitle() || hostOf(B.url);
      renderBar();
    };
    wv.addEventListener('dom-ready', () => {
      if (!B.ready) { B.ready = true; wv.setZoomFactor(B.zoom); }
      sync();
    });
    wv.addEventListener('did-start-loading', () => { B.loading = true; renderBar(); });
    wv.addEventListener('did-stop-loading', () => { B.loading = false; sync(); });
    wv.addEventListener('did-navigate', (e) => { B.url = e.url; sync(); addHistory(e.url, wv.getTitle()); });
    wv.addEventListener('did-navigate-in-page', (e) => { if (e.isMainFrame) { B.url = e.url; sync(); addHistory(e.url, wv.getTitle()); } });
    wv.addEventListener('page-title-updated', (e) => { B.title = e.title; renderBar(); updateHistoryTitle(B.url, e.title); });
    wv.addEventListener('did-fail-load', (e) => {
      if (!e.isMainFrame || e.errorCode === -3) return; // -3: megszakítva (pl. új navigáció)
      toast(`Az oldal nem tölthető be (${e.errorDescription || e.errorCode})`, 'err');
    });
    wv.addEventListener('enter-html-full-screen', () => setFullscreen(true));
    wv.addEventListener('leave-html-full-screen', () => setFullscreen(false));
    wv.addEventListener('media-started-playing', () => { B.playing = true; });
    wv.addEventListener('media-paused', () => { B.playing = false; });
    wv.addEventListener('render-process-gone', () => { toast('Az oldal összeomlott – újratöltés…', 'err'); setTimeout(() => wv.reload(), 800); });
    B.wv = wv;
    return wv;
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
    for (const id of ['br-fs-bar', 'br-cursor']) {
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
  }
  function leavePage({ focus = true } = {}) {
    if (B.mode !== 'page') return;
    B.mode = 'toolbar';
    cancelAnimationFrame(B.raf);
    if (B.mouseDown) sendMouse('mouseUp');
    el('screen-browser').classList.remove('page-mode');
    placeCursor();
    if (B.fullscreen) exitFullscreen();
    if (B.hideBar) { B.hideBar = false; document.body.classList.toggle('br-fs', B.fullscreen); }
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

  async function typeText() {
    // a képernyő-billentyűzet a konzol felületén jelenik meg, a szöveget a weboldal fókuszált mezőjébe szúrjuk be
    const wv = B.wv;
    leavePage({ focus: false });
    const t = await OSK.prompt({ title: 'Gépelés az oldalra (≡ = kész)' });
    enterPage();
    if (t && wv) { try { wv.focus(); await wv.insertText(t); } catch { /* */ } }
  }

  const BTN_REPEAT = new Set([12, 13, 14, 15]);
  function onButton(i, phase) {
    if (phase === 'up') { if (i === 0 && B.mouseDown) sendMouse('mouseUp'); return; }
    S.lastInput = Date.now();
    switch (i) {
      case 0: B.curVisible = true; placeCursor(); sendMouse('mouseDown'); break;
      case 1:
        if (B.fullscreen) { exitFullscreen(); break; }
        if (!back()) { Sound.back(); leavePage(); }
        break;
      case 2: typeText(); break;
      case 3: promptAddress(); break;
      case 4: back(); break;
      case 5: forward(); break;
      case 6: sendKey('PageUp'); break;
      case 7: sendKey('PageDown'); break;
      case 8: if (B.fullscreen) exitFullscreen(); else leavePage(); break;
      case 9: if (B.fullscreen) { showFsBar(true); break; } leavePage(); menu(); break;
      case 10: B.curVisible = !B.curVisible; placeCursor(); break; // bal kar lenyomás: kurzor elrejtése (pl. videónézéshez)
      case 11: sendKey('Enter'); break;
      case 12: sendKey('Up'); break;
      case 13: sendKey('Down'); break;
      case 14: sendKey('Left'); break;
      case 15: sendKey('Right'); break;
      case 16: leavePage(); openQuick(); break;
      default: break;
    }
  }

  function padLoop(t) {
    if (B.mode !== 'page') return;
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
      start: () => { menu(); return true; },
      'edge-down': () => { if (B.showPage) enterPage(); },
      lt: () => back(), rt: () => forward(),
      b: () => {
        if (B.showPage && back()) { Sound.back(); return true; }
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
      else if (k === 'exit') leavePage();
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
    init, render, handlers, hints, navigate, menu, leavePage, setBanner, closePage,
    // képernyővédő ne induljon videó közben vagy amíg az oldalt vezérlik
    blocksSaver: () => S.tab === 'browser' && (B.playing || B.mode === 'page' && Date.now() - S.lastInput < 15 * 60000),
    onTabLeave: () => leavePage({ focus: false }),
    state: () => ({ mode: B.mode, url: B.url, title: B.title, showPage: B.showPage, ready: B.ready, loading: B.loading, zoom: B.zoom, cur: { ...B.cur }, fs: B.fullscreen }),
    _test: { resolveInput, sendMouse, sendKey, enterPage, B },
  };
})();
