// InariX – konzolos navigáció a beépített appokban (minden app oldalába betöltődik).
// A kontroller D-padja nyílbillentyűként érkezik: a nyilak a látható, kattintható elemek között lépkednek
// (a legközelebbi sorba / oszlopba), az Enter (Ⓐ) a kijelöltre kattint. Az InariX a betöltés előtt
// beállítja a window.__inxPass értékét: azon belül (pl. videólejátszó) a balra/jobbra az oldalé marad.
(() => {
  if (window.__inxNav) return;
  window.__inxNav = true;
  const SEL = [
    'a[href]', 'button', 'input:not([type="hidden"])', 'textarea', 'select', '[contenteditable="true"]',
    '[role="button"]', '[role="link"]', '[role="tab"]', '[role="option"]', '[role="menuitem"]', '[role="treeitem"]', '[role="checkbox"]', '[role="switch"]',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');
  let cur = null;
  const editable = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 6 || r.height < 6) return null;
    if (r.bottom < -innerHeight || r.top > innerHeight * 2 || r.right < 0 || r.left > innerWidth) return null;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0 || cs.pointerEvents === 'none') return null;
    return r;
  };
  function candidates() {
    const out = [];
    for (const el of document.querySelectorAll(SEL)) {
      if (el.disabled || el.closest('[inert]')) continue;
      // az aria-hidden linkek is kellenek (pl. a YouTube bélyegképei), a többi rejtett elem nem
      if (el.closest('[aria-hidden="true"]') && !(el.tagName === 'A' && el.getAttribute('href'))) continue;
      const r = visible(el);
      if (!r) continue;
      if (r.width < 22 && r.height < 22) continue; // apró ikonok, jelvények
      // csak a ténylegesen látható elem számít: a közepe a képernyőn van, és ott valóban ő (vagy a része) látszik –
      // így kiesnek a belső görgethető panelből kilógó (Discord, Spotify) és a kitakart (sütiablak alatti) elemek
      const cx = Math.min(innerWidth - 2, Math.max(1, r.left + r.width / 2)), cy = r.top + Math.min(r.height / 2, 30);
      if (cy < 0 || cy > innerHeight) continue;
      const hit = document.elementFromPoint(cx, cy);
      if (!hit || !(hit === el || el.contains(hit) || hit.contains(el))) continue;
      // tároló (lista, panel) nem megálló, ha van benne kijelölhető elem – a benne lévő elemek az egyes megállók
      const container = el.tagName !== 'A' && el.tagName !== 'BUTTON' && !editable(el) && el.querySelector(SEL);
      if (container) continue;
      // linkben / gombban lévő belső elem (pl. ikon, név): a külső link / gomb a megálló
      const outer = el.parentElement && el.parentElement.closest('a[href], button, [role="button"], [role="link"], [role="tab"], [role="option"], [role="menuitem"], [role="treeitem"]');
      if (outer && visible(outer)) continue;
      out.push([el, r]);
    }
    // kártyánként (pl. egy videó: bélyegkép + cím + csatorna) csak egy megálló: a legnagyobb elem
    if (window.__inxCard) {
      const best = new Map();
      const rest = [];
      for (const it of out) {
        const card = it[0].closest(window.__inxCard);
        if (!card) { rest.push(it); continue; }
        const b = best.get(card);
        if (!b || it[1].width * it[1].height > b[1].width * b[1].height) best.set(card, it);
      }
      return [...rest, ...best.values()];
    }
    return out;
  }
  function mark(el) {
    if (cur && cur !== el) cur.classList.remove('inx-focus');
    cur = el;
    if (!el) return;
    el.classList.add('inx-focus');
    try { el.focus({ preventScroll: true }); } catch { /* */ }
    reveal(el);
  }
  // Begörgetés: csak a legközelebbi valóban görgethető tárolót (vagy az oldalt) görgetjük – a scrollIntoView a rögzített
  // fejléceket / nem görgethető tárolókat is elmozdítaná. Rögzített (fixed / sticky) sávban lévő elemnél nincs görgetés.
  function scrollerOf(el) {
    for (let p = el && el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (/(auto|scroll)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight + 4) return p;
    }
    return null;
  }
  function reveal(el) {
    let sc = null;
    for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.position === 'fixed' || cs.position === 'sticky') return;
      if (/(auto|scroll)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight + 4) { sc = p; break; }
    }
    const r = el.getBoundingClientRect();
    const box = sc ? sc.getBoundingClientRect() : { top: 0, bottom: innerHeight };
    const h = box.bottom - box.top;
    const top = box.top + h * 0.2, bot = box.bottom - h * 0.15;
    let dy = 0;
    if (r.top < top) dy = r.top - top;
    else if (r.bottom > bot) dy = Math.min(r.bottom - bot, r.top - top);
    if (Math.abs(dy) > 2) (sc || window).scrollBy({ top: dy, behavior: 'smooth' });
  }
  function move(dir) {
    const list = candidates();
    if (!list.length) return false;
    const live = cur && document.contains(cur) && visible(cur);
    if (!live) {
      // első lépés: a képernyő bal felső részéhez legközelebbi elem
      let best = null, bs = Infinity;
      for (const [el, r] of list) { if (r.bottom < 0 || r.top > innerHeight) continue; const s = r.top * 1.5 + r.left; if (s < bs) { bs = s; best = el; } }
      mark(best || list[0][0]);
      return true;
    }
    const c = cur.getBoundingClientRect();
    const cx = c.left + c.width / 2, cy = c.top + c.height / 2;
    const horiz = dir === 'Left' || dir === 'Right';
    if (move.again === undefined) move.again = false;
    let near = Infinity;
    const ok = [];
    for (const [el, r] of list) {
      if (el === cur || el.contains(cur) || cur.contains(el)) continue;
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      let gap, off;
      if (dir === 'Down') { if (r.top < c.bottom - Math.min(c.height * 0.3, 20)) continue; gap = r.top - c.bottom; off = Math.abs(x - cx); }
      else if (dir === 'Up') { if (r.bottom > c.top + Math.min(c.height * 0.3, 20)) continue; gap = c.top - r.bottom; off = Math.abs(x - cx); }
      else if (dir === 'Right') { if (r.left < c.right - Math.min(c.width * 0.3, 20)) continue; gap = r.left - c.right; off = Math.abs(y - cy); if (off > Math.max(c.height, r.height) * 1.2) continue; }
      else { if (r.right > c.left + Math.min(c.width * 0.3, 20)) continue; gap = c.left - r.right; off = Math.abs(y - cy); if (off > Math.max(c.height, r.height) * 1.2) continue; }
      gap = Math.max(0, gap);
      ok.push([el, gap, off]);
      near = Math.min(near, gap);
    }
    if (!ok.length) {
      // nincs több látható elem arra: a kijelölt elem görgethető paneljét (vagy az oldalt) görgetjük, majd továbblépünk
      if (horiz || move.again) return !horiz;
      const sc = scrollerOf(cur);
      const h = sc ? sc.clientHeight : innerHeight;
      (sc || window).scrollBy({ top: (dir === 'Down' ? 1 : -1) * h * 0.6, behavior: 'smooth' });
      clearTimeout(move.retry);
      move.retry = setTimeout(() => { move.again = true; move(dir); move.again = false; }, 420);
      return true;
    }
    let best = null, bs = Infinity;
    for (const [el, gap, off] of ok) {
      const score = horiz ? gap + off * 2 : (gap > near + 60 ? 1e6 : 0) + off + gap * 0.5;
      if (score < bs) { bs = score; best = el; }
    }
    mark(best);
    return true;
  }
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const k = e.key.replace('Arrow', '');
    const ae = document.activeElement;
    if (document.fullscreenElement) return; // teljes képernyős videó: minden billentyű a lejátszóé
    const pass = window.__inxPass && ae && ae.closest && ae.closest(window.__inxPass);
    if (k === 'Enter') {
      if (cur && document.contains(cur) && !editable(cur) && !/^(A|BUTTON)$/.test(cur.tagName)) { e.preventDefault(); cur.click(); }
      return;
    }
    if (!['Up', 'Down', 'Left', 'Right'].includes(k)) return;
    if (pass && (k === 'Left' || k === 'Right')) return; // lejátszón belül: tekerés
    if (editable(ae)) {
      // szövegmezőből csak fel/le lehet kilépni, és többsoros mezőből csak ha üres
      if (k === 'Left' || k === 'Right') return;
      const txt = ae.isContentEditable ? ae.textContent : ae.value;
      if ((ae.tagName === 'TEXTAREA' || ae.isContentEditable) && txt && txt.trim()) return;
    }
    if (move(k)) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  // ---- Kontrolleres lejátszóvezérlés: az oldal legnagyobb látható videóján ----
  const mainVideo = () => {
    let best = null, area = 0;
    for (const v of document.querySelectorAll('video')) {
      const r = v.getBoundingClientRect();
      const a = r.width * r.height;
      if (r.width > 200 && a > area && (v.readyState > 0 || v.currentSrc)) { area = a; best = v; }
    }
    return best;
  };
  const fmt = (x) => { x = Math.max(0, Math.round(x || 0)); const h = Math.floor(x / 3600), m = Math.floor((x % 3600) / 60), s = String(x % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`; };
  let osdTimer = 0;
  function osd(text) {
    let o = document.getElementById('inx-osd');
    if (!o) {
      o = document.createElement('div');
      o.id = 'inx-osd';
      o.style.cssText = 'position:fixed;left:50%;bottom:9%;transform:translateX(-50%);z-index:2147483647;padding:14px 28px;border-radius:999px;background:rgba(8,10,16,.82);color:#fff;font:700 26px "Segoe UI",sans-serif;pointer-events:none;transition:opacity .25s;box-shadow:0 10px 40px rgba(0,0,0,.5)';
    }
    (document.fullscreenElement || document.body).appendChild(o);
    o.textContent = text;
    o.style.opacity = '1';
    clearTimeout(osdTimer);
    osdTimer = setTimeout(() => { o.style.opacity = '0'; }, 1300);
  }
  // a YouTube / YouTube Music saját lejátszó API-ja (a videóelem közvetlen állítását a lejátszó felülírja)
  const ytp = () => { const p = document.getElementById('movie_player'); return p && typeof p.pauseVideo === 'function' ? p : null; };
  window.__inxPlayer = (cmd, arg) => {
    const v = mainVideo();
    const yt = ytp();
    const meta = () => {
      const m = navigator.mediaSession && navigator.mediaSession.metadata;
      const art = m && m.artwork && m.artwork.length ? m.artwork[m.artwork.length - 1].src : '';
      return { title: (m && m.title) || document.title.replace(/ - YouTube( Music)?$/, '').replace(/^\(\d+\) /, ''), artist: (m && m.artist) || '', art };
    };
    const state = () => (v ? { has: true, paused: v.paused, t: Math.round(v.currentTime), d: isFinite(v.duration) ? Math.round(v.duration) : 0,
      vol: yt ? yt.getVolume() : Math.round(v.volume * 100), muted: yt ? yt.isMuted() : v.muted, fs: !!document.fullscreenElement, ...meta() } : { has: false, fs: !!document.fullscreenElement });
    if (cmd === 'state' || !v) return state();
    if (cmd === 'toggle') {
      const play = v.paused;
      if (yt) { if (play) yt.playVideo(); else yt.pauseVideo(); } else if (play) v.play().catch(() => {}); else v.pause();
      osd(play ? '▶  Lejátszás' : '❚❚  Szünet');
      return { ...state(), paused: !play };
    }
    else if (cmd === 'seek') { const live = !isFinite(v.duration); if (!live) { v.currentTime = Math.max(0, Math.min(v.duration - 1, v.currentTime + arg)); osd(`${arg > 0 ? '⏩' : '⏪'}  ${fmt(v.currentTime)} / ${fmt(v.duration)}`); } }
    else if (cmd === 'vol' || cmd === 'setvol') {
      const curV = yt ? yt.getVolume() / 100 : v.volume;
      const nv = Math.max(0, Math.min(1, cmd === 'vol' ? Math.round((curV + arg) * 20) / 20 : arg));
      if (yt) { yt.unMute(); yt.setVolume(Math.round(nv * 100)); } else { v.muted = false; v.volume = nv; }
      osd(`🔊  ${Math.round(nv * 100)}%`);
      return { ...state(), vol: Math.round(nv * 100), muted: false };
    }
    else if (cmd === 'next' && yt && typeof yt.nextVideo === 'function' && !document.querySelector('ytmusic-player-bar')) { yt.nextVideo(); osd('⏭  Következő'); }
    else if (cmd === 'next') { const b = document.querySelector('.ytp-next-button, ytmusic-player-bar .next-button, [aria-label="Next"], [aria-label="Következő"]'); if (b) b.click(); else v.currentTime = Math.max(0, (v.duration || 0) - 0.5); osd('⏭  Következő'); }
    else if (cmd === 'prev') { const b = document.querySelector('ytmusic-player-bar .previous-button'); if (b) b.click(); else if (v.currentTime > 5) v.currentTime = 0; else history.back(); osd('⏮  Előző'); }
    else if (cmd === 'mute') {
      const m = yt ? !yt.isMuted() : !v.muted;
      if (yt) { if (m) yt.mute(); else yt.unMute(); } else v.muted = m;
      osd(m ? '🔇  Némítva' : '🔊  Hang be');
      return { ...state(), muted: m };
    }
    else if (cmd === 'fs') {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else {
        // a lejátszó saját teljes képernyő gombja (megmarad a saját felülete), különben a videó tárolója
        const btn = document.querySelector('.ytp-fullscreen-button, [data-a-target="player-fullscreen-button"], ytmusic-player-bar .fullscreen-button');
        if (btn) btn.click();
        else { const box = (window.__inxPass && v.closest(window.__inxPass)) || v.parentElement || v; (box.requestFullscreen ? box : v).requestFullscreen().catch(() => {}); }
      }
    }
    return state();
  };

  // app-specifikus előkészítés (pl. az oldal sötét témája), amit az InariX ad át
  if (typeof window.__inxInit === 'function') { try { window.__inxInit(); } catch { /* */ } }

  // egérrel / kurzorral kattintva a kijelölés oda kerül
  document.addEventListener('pointerdown', (e) => { const t = e.target.closest && e.target.closest(SEL); if (t) { if (cur) cur.classList.remove('inx-focus'); cur = t; t.classList.add('inx-focus'); } }, true);
})();
