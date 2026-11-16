'use strict';
// Képernyő-billentyűzet kontrollerhez (fizikai billentyűzettel is gépelhető).
const OSK = (() => {
  const ROWS = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'ö', 'ü', 'ó'],
    ['q', 'w', 'e', 'r', 't', 'z', 'u', 'i', 'o', 'p', 'ő', 'ú'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'é', 'á', 'ű'],
    ['⇧', 'í', 'y', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '-', '⌫'],
    [':', '/', '\\', '_', '@', '"', '(', ')', '!', '?'],
    ['␣', '✓'],
  ];
  let value = '', shift = false, resolver = null, mask = false;
  const el = (id) => document.getElementById(id);

  function render() {
    const v = mask ? '•'.repeat(value.length) : value;
    el('osk-value').textContent = v;
    document.querySelectorAll('#osk-keys .key[data-k]').forEach((k) => {
      const ch = k.dataset.k;
      if (ch.length === 1 && !'␣✓⌫⇧'.includes(ch)) k.textContent = shift ? ch.toUpperCase() : ch;
      if (ch === '⇧') k.classList.toggle('primary', shift);
    });
  }

  function build() {
    const box = el('osk-keys');
    box.innerHTML = '';
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
        else b.textContent = k;
        if (k === 'q') b.dataset.default = '1';
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
    if (k === '⌫') value = value.slice(0, -1);
    else if (k === '⇧') shift = !shift;
    else if (k === '␣') value += ' ';
    else if (k === '✓') return done(true);
    else { value += shift ? k.toUpperCase() : k; if (shift && /[a-zéáűőúöüóí]/.test(k)) shift = false; }
    render();
  }

  function done(ok) {
    el('osk').classList.add('hidden');
    Nav.setKeyboardCapture(null);
    Nav.pop();
    const r = resolver; resolver = null;
    if (ok) Sound.select(); else Sound.back();
    if (r) r(ok ? value : null);
  }

  // gombjelzések a bemeneti módnak megfelelően (kontroller ↔ billentyűzet)
  function renderHints() {
    const pad = document.body.classList.contains('pad-mode');
    const L = pad ? [['btn-x', 'X', 'Törlés'], ['btn-y', 'Y', 'Szóköz'], ['btn-start', '≡', 'Kész'], ['btn-b', 'B', 'Mégse']]
      : [['kbd', 'Backspace', 'Törlés'], ['kbd', 'Szóköz', 'Szóköz'], ['kbd', 'Enter', 'Kész'], ['kbd', 'Esc', 'Mégse']];
    el('osk-hints').replaceChildren(...L.map(([c, k, t]) => { const s = document.createElement('span'); s.className = 'hint'; const b = document.createElement('b'); b.className = c; b.textContent = k; s.append(b, ` ${t}`); return s; }));
  }
  new MutationObserver(() => { if (!el('osk').classList.contains('hidden')) renderHints(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  function prompt({ title = '', value: initial = '', password = false } = {}) {
    return new Promise((resolve) => {
      resolver = resolve;
      value = String(initial || ''); shift = false; mask = password;
      el('osk-title').textContent = title;
      build(); render();
      el('osk').classList.remove('hidden');
      renderHints();
      Nav.push(() => el('osk-keys'), {
        b: () => done(false),
        x: () => { value = value.slice(0, -1); render(); },
        y: () => { value += ' '; render(); },
        start: () => done(true),
        left: () => oskMove('left'), right: () => oskMove('right'), up: () => oskMove('up'), down: () => oskMove('down'),
        lb: () => { shift = !shift; render(); },
        rb: () => { shift = !shift; render(); },
      });
      Nav.setKeyboardCapture((e) => {
        if (e.key === 'Enter') { done(true); return true; }
        if (e.key === 'Escape') { done(false); return true; }
        if (e.key === 'Backspace') { value = value.slice(0, -1); render(); return true; }
        if (e.key.length === 1 && !e.ctrlKey && !e.altKey) { value += e.key; render(); return true; }
        if (e.ctrlKey && e.key.toLowerCase() === 'v') {
          navigator.clipboard.readText().then((t) => { value += t; render(); }).catch(() => {});
          return true;
        }
        return false;
      });
    });
  }

  return { prompt };
})();
