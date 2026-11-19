'use strict';
// Kontroller + billentyűzet navigáció: térbeli fókuszkezelés rétegekkel (képernyő, modál, billentyűzet).
const Nav = (() => {
  const layers = []; // { root: () => Element, handlers: {}, focus: Element|null }
  let suspended = false; // stream közben a konzol UI nem kezel bemenetet
  let base = { root: () => document.body, handlers: {}, focus: null };
  let keyboardCapture = null;
  const listeners = { input: [] };

  const top = () => layers[layers.length - 1] || base;

  function candidates() {
    const root = top().root();
    if (!root) return [];
    return [...root.querySelectorAll('.focusable')].filter((el) => {
      if (el.disabled || el.closest('.hidden')) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
  }

  function current() {
    const L = top();
    if (L.focus && L.focus.isConnected && !L.focus.closest('.hidden')) return L.focus;
    return null;
  }

  function focus(el, { silent = false, scroll = true } = {}) {
    if (!el) return;
    document.querySelectorAll('.focused').forEach((x) => x.classList.remove('focused'));
    el.classList.add('focused');
    top().focus = el;
    if (scroll) {
      if (el.dataset.scroll === 'center') {
        // vízszintes polc: csak a polcot görgetjük, középre igazítva
        const p = el.parentElement;
        p.scrollTo({ left: el.offsetLeft - p.clientWidth / 2 + el.offsetWidth / 2, behavior: 'smooth' });
      } else {
        // ha a kijelölt elem fölött csoportcím van (pl. menü blokk címe), az is maradjon látható – különben felfelé lépve levágódik
        const prev = el.previousElementSibling;
        const sc = prev && prev.matches('.set-group, .lib-group') ? scrollParent(el) : null;
        if (sc) {
          const s = sc.getBoundingClientRect(), p = prev.getBoundingClientRect(), r = el.getBoundingClientRect();
          if (p.top < s.top + 8) sc.scrollBy({ top: p.top - s.top - 12, behavior: 'smooth' });
          else if (r.bottom > s.bottom - 8) sc.scrollBy({ top: r.bottom - s.bottom + 18, behavior: 'smooth' });
        } else el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      }
    }
    el.dispatchEvent(new CustomEvent('navfocus', { bubbles: true, detail: { scroll } }));
    if (!silent) Sound.move();
  }

  function scrollParent(el) {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p).overflowY;
      if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) return p;
    }
    return null;
  }

  function focusFirst() {
    const els = candidates();
    const pref = els.find((e) => e.dataset.default === '1') || els[0];
    if (pref) focus(pref, { silent: true });
  }

  function move(dir) {
    const els = candidates();
    const cur = current();
    if (!cur || !els.includes(cur)) return focusFirst();
    const r = cur.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let best = null, bestScore = Infinity;
    for (const el of els) {
      if (el === cur) continue;
      const b = el.getBoundingClientRect();
      const x = b.left + b.width / 2, y = b.top + b.height / 2;
      let primary, secondary;
      if ((dir === 'left' || dir === 'right') && Math.min(b.bottom, r.bottom) - Math.max(b.top, r.top) < Math.min(b.height, r.height) * 0.3) continue; // másik sorba nem ugrunk
      // fel/le csak a ténylegesen alatta / fölötte lévő elemre (nem az ugyanabban a sorban, de lejjebb kezdődőre)
      if (dir === 'down' && b.top < r.bottom - Math.min(r.height * 0.25, 40)) continue;
      if (dir === 'up' && b.bottom > r.top + Math.min(r.height * 0.25, 40)) continue;
      if (dir === 'right') { primary = x - cx; secondary = Math.abs(y - cy); if (b.left < r.left + 2) continue; }
      else if (dir === 'left') { primary = cx - x; secondary = Math.abs(y - cy); if (b.right > r.right - 2) continue; }
      else if (dir === 'down') { primary = y - cy; secondary = Math.abs(x - cx); if (b.top < r.top + 2) continue; }
      else { primary = cy - y; secondary = Math.abs(x - cx); if (b.bottom > r.bottom - 2) continue; }
      if (primary <= 0) continue;
      const score = primary + secondary * 2.5;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    // fel/le: mindig a legközelebbi sorba lépünk (a távolabbi, de pont alatta lévő elem nem előzheti meg),
    // azon belül a vízszintesen legközelebbire
    if (best && (dir === 'up' || dir === 'down')) {
      const gap = (b) => (dir === 'down' ? b.top - r.top : r.bottom - b.bottom);
      let near = Infinity;
      const ok = [];
      for (const el of els) {
        if (el === cur) continue;
        const b = el.getBoundingClientRect();
        if (dir === 'down' && (b.top < r.bottom - Math.min(r.height * 0.25, 40) || b.top < r.top + 2)) continue;
        if (dir === 'up' && (b.bottom > r.top + Math.min(r.height * 0.25, 40) || b.bottom > r.bottom - 2)) continue;
        ok.push([el, b]);
        near = Math.min(near, gap(b));
      }
      let bs = Infinity;
      for (const [el, b] of ok) {
        if (gap(b) > near + Math.max(30, b.height * 0.5)) continue; // nem a legközelebbi sorban van
        const d = Math.abs(b.left + b.width / 2 - cx);
        if (d < bs) { bs = d; best = el; }
      }
    }
    if (best) focus(best);
    else dispatch(`edge-${dir}`);
  }

  function dispatch(action) {
    for (const fn of listeners.input) fn(action);
    const L = top();
    if (L.handlers[action] && L.handlers[action]() !== false) return true;
    if (layers.length === 0 && base.global && base.global[action]) { base.global[action](); return true; }
    if (['up', 'down', 'left', 'right'].includes(action)) { move(action); return true; }
    if (action === 'a') {
      const cur = current();
      if (cur) { Sound.select(); cur.click(); }
      else focusFirst();
      return true;
    }
    return false;
  }

  // --- Billentyűzet ---
  const KEYMAP = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'a', Escape: 'b', Backspace: 'b', F5: 'y', Tab: 'rb', Home: 'guide' };
  // betűs gyorsbillentyűk a billentyűre nyomtatott betű szerint (a kiosztástól függetlenül: magyar QWERTZ-en az Y az Y)
  const LETTERS = { q: 'lb', e: 'rb', x: 'x', y: 'y', f: 'select', g: 'guide', m: 'start' };
  window.addEventListener('keydown', (e) => {
    if (suspended) return;
    document.body.classList.remove('pad-mode');
    if (keyboardCapture && keyboardCapture(e)) { e.preventDefault(); return; }
    const a = KEYMAP[e.code] || LETTERS[KbLayout.letter(e)];
    if (!a) return;
    if (e.code === 'Tab' && e.shiftKey) { e.preventDefault(); dispatch('lb'); return; }
    e.preventDefault();
    dispatch(a);
  });

  // Egér: rámutatás fókuszál – de csak valódi egérmozgásra, különben egy felnyíló menü
  // a mozdulatlan egérmutató alatt "ellopná" a kontroller fókuszát
  let lastMouseMove = 0, lastXY = '';
  document.addEventListener('mousemove', (e) => {
    if (suspended) return;
    const xy = `${e.screenX},${e.screenY}`;
    if (xy === lastXY) return;
    lastXY = xy;
    lastMouseMove = performance.now();
    document.body.classList.remove('pad-mode');
    const el = e.target.closest && e.target.closest('.focusable');
    if (el && el !== current() && top().root().contains(el)) focus(el, { silent: true, scroll: false });
  });
  document.addEventListener('mouseover', (e) => {
    if (performance.now() - lastMouseMove > 150) return;
    const el = e.target.closest && e.target.closest('.focusable');
    if (el && el !== current() && top().root().contains(el)) focus(el, { silent: true, scroll: false });
  });

  // --- Gamepad ---
  const BTN = { 0: 'a', 1: 'b', 2: 'x', 3: 'y', 4: 'lb', 5: 'rb', 6: 'lt', 7: 'rt', 8: 'select', 9: 'start', 12: 'up', 13: 'down', 14: 'left', 15: 'right', 16: 'guide' };
  const REPEAT = new Set(['up', 'down', 'left', 'right']);
  const held = {}; // action -> { since, last }
  let padConnected = false;
  function poll() {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    if (pads.length !== (padConnected ? 1 : 0)) {
      padConnected = pads.length > 0;
      const ind = document.getElementById('pad-ind');
      if (ind) ind.classList.toggle('on', padConnected);
    }
    const now = performance.now();
    const active = new Set();
    if (suspended) { for (const a of Object.keys(held)) delete held[a]; requestAnimationFrame(poll); return; }
    for (const p of pads) {
      p.buttons.forEach((b, i) => { if (b.pressed && BTN[i]) active.add(BTN[i]); });
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      if (ax > 0.55) active.add('right'); else if (ax < -0.55) active.add('left');
      if (ay > 0.55) active.add('down'); else if (ay < -0.55) active.add('up');
    }
    for (const a of active) {
      const h = held[a];
      if (!h) {
        held[a] = { since: now, last: now };
        document.body.classList.add('pad-mode');
        dispatch(a);
      } else if (REPEAT.has(a) && now - h.since > 380 && now - h.last > 85) {
        h.last = now; dispatch(a);
      }
    }
    for (const a of Object.keys(held)) if (!active.has(a)) delete held[a];
    requestAnimationFrame(poll);
  }
  requestAnimationFrame(poll);

  return {
    setBase(root, handlers = {}, global = {}) {
      const keep = base.focus;
      base = { root, handlers, global, focus: null };
      if (keep && root().contains(keep)) base.focus = keep;
    },
    push(root, handlers = {}) { layers.push({ root, handlers, focus: null }); requestAnimationFrame(focusFirst); },
    pop() { layers.pop(); const c = current(); if (c) focus(c, { silent: true }); },
    depth: () => layers.length,
    focus, focusFirst, current, move, dispatch, candidates,
    setKeyboardCapture(fn) { keyboardCapture = fn; },
    onInput(fn) { listeners.input.push(fn); },
    padConnected: () => padConnected,
    suspend(v) {
      suspended = !!v;
      for (const a of Object.keys(held)) delete held[a];
      // visszakapcsoláskor a még lenyomott gombok ne számítsanak új nyomásnak
      // (pl. a stream menüben „Vissza a InariXbe”-t kiválasztó A ne indítsa újra a játékot)
      if (!suspended) {
        const now = performance.now();
        for (const p of navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : []) {
          p.buttons.forEach((b, i) => { if (b.pressed && BTN[i]) held[BTN[i]] = { since: now + 1e9, last: now + 1e9 }; });
        }
      }
    },
    isSuspended: () => suspended,
  };
})();
