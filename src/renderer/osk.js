'use strict';
// Képernyő-billentyűzet kontrollerhez (fizikai billentyűzettel is gépelhető).
const OSK = (() => {
  // a sorok a beállított / felismert billentyűzetkiosztás szerint (KbLayout)
  // számmező: számbillentyűzet (a ⇄ ABC / 123 gombbal bármikor váltható a normál billentyűzetre és vissza)
  const NUM_ROWS = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['.', '0', '⌫'], ['ABC', '✓']];
  let value = '', shift = false, resolver = null, mask = false, numMode = false;
  // élő mód (stream): minden leütés azonnal a gépre megy – live(kind, ch): kind = 'char' | 'back' | 'enter'
  let live = null;
  const emit = (kind, ch) => { if (live) { try { live(kind, ch); } catch { /* */ } } };
  const el = (id) => document.getElementById(id);

  function render() {
    const v = mask ? '•'.repeat(value.length) : value;
    el('osk-value').textContent = v;
    document.querySelectorAll('#osk-keys .key[data-k]').forEach((k) => {
      const ch = k.dataset.k;
      if (ch.length === 1 && !'␣✓⌫⇧'.includes(ch)) k.textContent = shift && !numMode ? ch.toUpperCase() : ch;
      if (ch === '⇧') k.classList.toggle('primary', shift);
    });
  }

  function build() {
    const box = el('osk-keys');
    box.innerHTML = '';
    const ROWS = numMode ? NUM_ROWS : KbLayout.oskRows();
    if (!numMode) ROWS[ROWS.length - 1] = ['123', ...ROWS[ROWS.length - 1]];
    box.classList.toggle('num', numMode);
    for (const row of ROWS) {
      const r = document.createElement('div');
      r.className = 'krow';
      for (const k of row) {
        const b = document.createElement('button');
        b.className = 'key focusable';
        b.dataset.k = k;
        if (k === '␣') { b.classList.add('w4'); b.textContent = 'Szóköz'; }
        else if (k === '✓') { b.classList.add('w2', 'primary'); b.textContent = 'Kész'; }
        else if (k === '⌫' || k === '⇧') { b.classList.add('w2'); b.textContent = k; }
        else if (k === '123' || k === 'ABC') { b.classList.add('w2', 'mode'); b.textContent = k; b.title = k === '123' ? 'Számbillentyűzet' : 'Normál billentyűzet'; }
        else b.textContent = k;
        if (numMode ? k === '5' : k === ROWS[1][0]) b.dataset.default = '1';
        b.addEventListener('click', () => press(k));
        r.appendChild(b);
      }
      box.appendChild(r);
    }
  }

  // Rácsos navigáció: oldalt a sor másik végére fordul, fel/le a legközelebbi billentyűre a szomszéd sorban
  function oskMove(dir) {
    const g = [...el('osk-keys').querySelectorAll('.krow')].map((r) => [...r.querySelectorAll('.key')]);
    const cur = Nav.current();
    const ri = g.findIndex((r) => r.includes(cur));
    if (ri < 0) { Nav.focusFirst(); return true; }
    if (dir === 'left' || dir === 'right') {
      const n = g[ri].length;
      Nav.focus(g[ri][(g[ri].indexOf(cur) + (dir === 'right' ? 1 : -1) + n) % n]);
      return true;
    }
    const nr = ri + (dir === 'down' ? 1 : -1);
    if (nr < 0 || nr >= g.length) return true;
    const c = cur.getBoundingClientRect(), mid = c.left + c.width / 2;
    let best = null, bd = Infinity;
    for (const k of g[nr]) { const r = k.getBoundingClientRect(); const d = Math.abs(r.left + r.width / 2 - mid); if (d < bd) { bd = d; best = k; } }
    Nav.focus(best);
    return true;
  }

  function press(k) {
    if (k === '⌫') { value = value.slice(0, -1); emit('back'); }
    else if (k === '⇧') shift = !shift;
    else if (k === '␣') { value += ' '; emit('char', ' '); }
    else if (k === '✓') { if (live) { emit('enter'); value = ''; render(); return; } return done(true); }
    else if (k === '123' || k === 'ABC') { numMode = k === '123'; shift = false; build(); render(); requestAnimationFrame(() => { const d = el('osk-keys').querySelector('[data-default="1"]'); if (d) Nav.focus(d); }); return; }
    else { const c = shift ? k.toUpperCase() : k; value += c; emit('char', c); if (shift && /[a-zéáűőúöüóí]/.test(k)) shift = false; }
    if (live && value.length > 60) value = value.slice(-60); // élő módban csak az utolsó leütések látszanak
    render();
  }

  function done(ok) {
    el('osk').classList.add('hidden');
    el('osk').classList.remove('float');
    el('osk-panel').style.transform = '';
    live = null;
    Nav.setKeyboardCapture(null);
    Nav.pop();
    const r = resolver; resolver = null;
    if (ok) Sound.select(); else Sound.back();
    if (r) r(ok ? value : null);
  }

  // gombjelzések a bemeneti módnak megfelelően (kontroller ↔ billentyűzet)
  function renderHints() {
    const pad = document.body.classList.contains('pad-mode');
    const L = live
      ? (pad ? [['btn-x', 'X', 'Törlés'], ['btn-y', 'Y', 'Szóköz'], ['btn-start', 'R kar', 'Mozgatás'], ['btn-start', '≡', 'Enter'], ['btn-b', 'B', 'Bezárás']]
        : [['kbd', 'Húzás', 'Mozgatás'], ['kbd', 'Enter', 'Enter'], ['kbd', 'Esc', 'Bezárás']])
      : pad ? [['btn-x', 'X', 'Törlés'], ['btn-y', 'Y', 'Szóköz'], ['btn-start', '≡', 'Kész'], ['btn-b', 'B', 'Mégse']]
        : [['kbd', 'Backspace', 'Törlés'], ['kbd', 'Szóköz', 'Szóköz'], ['kbd', 'Enter', 'Kész'], ['kbd', 'Esc', 'Mégse']];
    el('osk-hints').replaceChildren(...L.map(([c, k, t]) => { const s = document.createElement('span'); s.className = 'hint'; const b = document.createElement('b'); b.className = c; b.textContent = k; s.append(b, ` ${t}`); return s; }));
  }
  new MutationObserver(() => { if (!el('osk').classList.contains('hidden')) renderHints(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  // lebegő panel mozgatása (képpontban, a jelenlegi helyéhez képest)
  let pos = { x: 0, y: 0 };
  function moveBy(dx, dy) {
    const p = el('osk-panel');
    const r = p.getBoundingClientRect();
    pos.x = Math.max(-(innerWidth - r.width) / 2, Math.min((innerWidth - r.width) / 2, pos.x + dx));
    pos.y = Math.max(-(innerHeight - r.height - 10), Math.min(0, pos.y + dy));
    p.style.transform = `translate(${Math.round(pos.x)}px, ${Math.round(pos.y)}px)`;
  }
  (() => { // egérrel a címsoránál fogva húzható
    let drag = null;
    document.addEventListener('mousedown', (e) => { if (live && e.target.closest('#osk-title')) { drag = { x: e.clientX, y: e.clientY }; e.preventDefault(); } });
    document.addEventListener('mousemove', (e) => { if (drag) { moveBy(e.clientX - drag.x, e.clientY - drag.y); drag = { x: e.clientX, y: e.clientY }; } });
    document.addEventListener('mouseup', () => { drag = null; });
  })();

  function prompt({ title = '', value: initial = '', password = false, numeric = false, live: liveFn = null } = {}) {
    return new Promise((resolve) => {
      resolver = resolve;
      value = String(initial || ''); shift = false; mask = password; numMode = !!numeric;
      live = liveFn;
      el('osk-title').textContent = title;
      build(); render();
      el('osk').classList.toggle('float', !!live);
      if (live) el('osk-panel').style.transform = `translate(${Math.round(pos.x)}px, ${Math.round(pos.y)}px)`;
      el('osk').classList.remove('hidden');
      renderHints();
      Nav.push(() => el('osk-keys'), {
        b: () => done(false),
        x: () => { value = value.slice(0, -1); emit('back'); render(); },
        y: () => { value += ' '; emit('char', ' '); render(); },
        start: () => { if (live) { emit('enter'); value = ''; render(); } else done(true); },
        left: () => oskMove('left'), right: () => oskMove('right'), up: () => oskMove('up'), down: () => oskMove('down'),
        lb: () => { shift = !shift; render(); },
        rb: () => { shift = !shift; render(); },
      });
      Nav.setKeyboardCapture((e) => {
        if (e.key === 'Enter') { if (live) { emit('enter'); value = ''; render(); } else done(true); return true; }
        if (e.key === 'Escape') { done(false); return true; }
        if (e.key === 'Backspace') { value = value.slice(0, -1); emit('back'); render(); return true; }
        if (e.key.length === 1 && !e.ctrlKey && !e.altKey) { value += e.key; emit('char', e.key); render(); return true; }
        if (e.ctrlKey && e.key.toLowerCase() === 'v') {
          navigator.clipboard.readText().then((t) => { value += t; render(); }).catch(() => {});
          return true;
        }
        return false;
      });
    });
  }

  return { prompt, moveBy, get open() { return !el('osk').classList.contains('hidden'); } };
})();
