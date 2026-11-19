'use strict';
// Képernyő-billentyűzet kontrollerhez (fizikai billentyűzettel is gépelhető).
// Oldalak: abc (a kiosztás szerint) · 123 (számok) · #+= (szimbólumok) · fn (különleges billentyűk – csak stream közben, a menüből)
// Ékezetek / változatok (mint Androidon): a billentyűn hosszan nyomva (egér) vagy RT-vel (kontroller).
// Élő mód (stream): minden leütés azonnal a gépre megy; Ctrl / Alt / Shift ragadós módosítók a kombinációkhoz.
const OSK = (() => {
  const NUM_ROWS = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['.', '0', '⌫'], ['ABC', '✓']];
  const SYM_ROWS = [
    ['~', '`', '|', '•', '√', 'π', '÷', '×', '¶', '∆'],
    ['£', '€', '¥', '$', '¢', '^', '°', '=', '{', '}'],
    ['\\', '%', '©', '®', '™', '§', '[', ']', '<', '>'],
    ['+', '*', '#', '&', ';', "'", '«', '»', '¿', '¡'],
  ];
  // különleges billentyűk: felirat → Windows virtuális billentyűkód
  const FN = {
    F1: 0x70, F2: 0x71, F3: 0x72, F4: 0x73, F5: 0x74, F6: 0x75, F7: 0x76, F8: 0x77, F9: 0x78, F10: 0x79, F11: 0x7A, F12: 0x7B,
    Esc: 0x1B, Tab: 0x09, PrtSc: 0x2C, ScrLk: 0x91, Pause: 0x13, Ins: 0x2D, Home: 0x24, PgUp: 0x21, Del: 0x2E, End: 0x23, PgDn: 0x22,
  };
  const FN_ROWS = [['F1', 'F2', 'F3', 'F4', 'F5', 'F6'], ['F7', 'F8', 'F9', 'F10', 'F11', 'F12'], ['Esc', 'Tab', 'PrtSc', 'ScrLk', 'Pause'], ['Ins', 'Home', 'PgUp', 'Del', 'End', 'PgDn']];
  // ékezetek és változatok (hosszú nyomás / RT)
  const ALTS = {
    a: 'áàâäãåæą', e: 'éèêëęėě', i: 'íìîïı', o: 'óòôöőõøœ', u: 'úùûüűů', c: 'çćč', n: 'ñńň', s: 'śšşß', z: 'źżž', y: 'ýÿ', l: 'łľ', d: 'ďð', r: 'řŕ', t: 'ťþ', g: 'ğ',
    '-': '–—_', '.': '…·•', ',': ';', '?': '¿', '!': '¡', '1': '¹½¼', '2': '²', '3': '³¾', '0': '°∅', '"': '„”“«»', "'": '‚’‘‹›', '/': '\\|', '(': '[{<', ')': ']}>', '@': '#&', ':': ';', '$': '€£¥¢', '%': '‰', '*': '×·',
  };
  const MODS = { Ctrl: 'ctrl', Alt: 'alt', Shift: 'shift' };
  let value = '', shift = false, resolver = null, mask = false, page = 'abc';
  const mods = { ctrl: false, alt: false, shift: false };
  // élő mód: live(kind, data) – kind: 'char' (karakter) | 'back' | 'enter' | 'key' ({ vk } vagy { code, ch } + mods)
  let live = null;
  const emit = (kind, data) => { if (live) { try { live(kind, data); } catch { /* */ } } };
  const el = (id) => document.getElementById(id);

  function render() {
    el('osk-value').textContent = mask ? '•'.repeat(value.length) : value;
    document.querySelectorAll('#osk-keys .key[data-k]').forEach((k) => {
      const ch = k.dataset.k;
      if (ch.length === 1 && !'␣✓⌫⇧'.includes(ch)) k.textContent = shift && page === 'abc' ? ch.toUpperCase() : ch;
      if (ch === '⇧') k.classList.toggle('primary', shift);
      if (MODS[ch]) k.classList.toggle('primary', mods[MODS[ch]]);
      if (ALTS[ch.toLowerCase()] && page !== 'fn') k.classList.add('has-alt');
    });
  }

  function rows() {
    if (page === 'num') return NUM_ROWS;
    if (page === 'fn') return [...FN_ROWS, ['Ctrl', 'Alt', 'Shift', 'ABC', '✓']];
    const mod = live ? ['Ctrl', 'Alt'] : [];
    if (page === 'sym') return [...SYM_ROWS, ['ABC', '123', ...mod, '␣', '⌫', '✓']];
    const R = KbLayout.oskRows();
    R[R.length - 1] = ['123', '#+=', ...mod, ...R[R.length - 1]];
    return R;
  }

  function build() {
    const box = el('osk-keys');
    box.innerHTML = '';
    const ROWS = rows();
    box.classList.toggle('num', page === 'num');
    box.classList.toggle('fn', page === 'fn');
    for (const row of ROWS) {
      const r = document.createElement('div');
      r.className = 'krow';
      for (const k of row) {
        const b = document.createElement('button');
        b.className = 'key focusable';
        b.dataset.k = k;
        if (k === '␣') { b.classList.add('w4'); b.textContent = 'Szóköz'; }
        else if (k === '✓') { b.classList.add('w2', 'primary'); b.textContent = live ? 'Enter' : 'Kész'; }
        else if (k === '⌫' || k === '⇧') { b.classList.add('w2'); b.textContent = k; }
        else if (k === '123' || k === 'ABC' || k === '#+=') { b.classList.add('w2', 'mode'); b.textContent = k; b.title = { '123': 'Számok', ABC: 'Betűk', '#+=': 'Szimbólumok' }[k]; }
        else if (MODS[k]) { b.classList.add('mod'); b.textContent = k; }
        else b.textContent = k;
        if (page === 'num' ? k === '5' : k === ROWS[page === 'abc' ? 1 : 0][0]) b.dataset.default = '1';
        // hosszú nyomás (egér / érintés): ékezetek
        let t = 0;
        b.addEventListener('pointerdown', () => { clearTimeout(t); t = setTimeout(() => { b._long = true; openAlt(b); }, 450); });
        b.addEventListener('pointerup', () => clearTimeout(t));
        b.addEventListener('pointerleave', () => clearTimeout(t));
        b.addEventListener('click', () => { if (b._long) { b._long = false; return; } press(k); });
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

  // egy karakter beírása (élő módban Ctrl / Alt mellett billentyűkombinációként megy a gépre)
  function typeChar(c) {
    if (live && (mods.ctrl || mods.alt)) {
      emit('key', { code: KbLayout.codeFor(c), ch: c, mods: { ...mods, shift: mods.shift || shift } });
      mods.ctrl = mods.alt = mods.shift = false;
      return;
    }
    value += c; emit('char', c);
  }
  function switchPage(p) {
    page = p; shift = false; build(); render();
    requestAnimationFrame(() => { const d = el('osk-keys').querySelector('[data-default="1"]'); if (d) Nav.focus(d); });
  }

  function press(k) {
    if (MODS[k]) { mods[MODS[k]] = !mods[MODS[k]]; render(); return; }
    if (FN[k] !== undefined) { emit('key', { vk: FN[k], mods: { ...mods } }); mods.ctrl = mods.alt = mods.shift = false; render(); return; }
    if (k === '⌫') { value = value.slice(0, -1); emit('back'); }
    else if (k === '⇧') shift = !shift;
    else if (k === '␣') typeChar(' ');
    else if (k === '✓') { if (live) { emit('enter'); value = ''; render(); return; } return done(true); }
    else if (k === '123') return switchPage('num');
    else if (k === 'ABC') return switchPage('abc');
    else if (k === '#+=') return switchPage('sym');
    else { const c = shift && page === 'abc' ? k.toUpperCase() : k; typeChar(c); if (shift && /[a-zéáűőúöüóí]/.test(k)) shift = false; }
    if (live && value.length > 60) value = value.slice(-60); // élő módban csak az utolsó leütések látszanak
    render();
  }

  // ---- ékezet / változat választó (Android-szerű kis sor a billentyű fölött) ----
  let altEl = null;
  function openAlt(btn) {
    if (!btn || altEl) return false;
    const base = btn.dataset.k;
    const list = ALTS[String(base).toLowerCase()];
    if (!list) return false;
    const up = shift && page === 'abc';
    altEl = document.createElement('div');
    altEl.className = 'osk-alt';
    for (const ch of [...list]) {
      const c = up ? ch.toUpperCase() : ch;
      const b = document.createElement('button');
      b.className = 'key focusable';
      b.textContent = c;
      b.addEventListener('click', () => { closeAlt(); typeChar(c); if (shift) shift = false; render(); });
      altEl.append(b);
    }
    el('osk-panel').append(altEl);
    const pr = el('osk-panel').getBoundingClientRect(), br = btn.getBoundingClientRect();
    altEl.style.left = `${Math.max(8, Math.min(pr.width - altEl.offsetWidth - 8, br.left - pr.left + br.width / 2 - altEl.offsetWidth / 2))}px`;
    altEl.style.top = `${br.top - pr.top - altEl.offsetHeight - 8}px`;
    altEl._from = btn;
    Nav.push(() => altEl, { b: () => { closeAlt(); return true; }, rt: () => { closeAlt(); return true; }, up: () => true, down: () => { closeAlt(); return true; } });
    requestAnimationFrame(() => Nav.focus(altEl.querySelector('.key')));
    return true;
  }
  function closeAlt() {
    if (!altEl) return;
    const from = altEl._from;
    altEl.remove(); altEl = null;
    Nav.pop();
    if (from && from.isConnected) Nav.focus(from, { silent: true });
  }

  function done(ok) {
    closeAlt();
    el('osk').classList.add('hidden');
    el('osk').classList.remove('float');
    el('osk-panel').style.transform = '';
    live = null;
    mods.ctrl = mods.alt = mods.shift = false;
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
      ? (pad ? [['btn-x', 'X', 'Törlés'], ['btn-y', 'Y', 'Szóköz'], ['btn-start', 'RT', 'Ékezetek'], ['btn-start', 'R kar', 'Mozgatás'], ['btn-start', '≡', 'Enter'], ['btn-b', 'B', 'Bezárás']]
        : [['kbd', 'Hosszan nyomva', 'Ékezetek'], ['kbd', 'Húzás', 'Mozgatás'], ['kbd', 'Enter', 'Enter'], ['kbd', 'Esc', 'Bezárás']])
      : pad ? [['btn-x', 'X', 'Törlés'], ['btn-y', 'Y', 'Szóköz'], ['btn-start', 'RT', 'Ékezetek'], ['btn-start', '≡', 'Kész'], ['btn-b', 'B', 'Mégse']]
        : [['kbd', 'Backspace', 'Törlés'], ['kbd', 'Hosszan nyomva', 'Ékezetek'], ['kbd', 'Enter', 'Kész'], ['kbd', 'Esc', 'Mégse']];
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

  // page: 'abc' | 'num' | 'sym' | 'fn' (az fn csak élő módban, a stream menüjéből)
  function prompt({ title = '', value: initial = '', password = false, numeric = false, live: liveFn = null, page: startPage = null } = {}) {
    return new Promise((resolve) => {
      resolver = resolve;
      value = String(initial || ''); shift = false; mask = password;
      live = liveFn;
      page = startPage === 'fn' && !live ? 'abc' : startPage || (numeric ? 'num' : 'abc');
      mods.ctrl = mods.alt = mods.shift = false;
      el('osk-title').textContent = title;
      build(); render();
      el('osk').classList.toggle('float', !!live);
      if (live) el('osk-panel').style.transform = `translate(${Math.round(pos.x)}px, ${Math.round(pos.y)}px)`;
      el('osk').classList.remove('hidden');
      renderHints();
      Nav.push(() => el('osk-keys'), {
        b: () => done(false),
        x: () => { value = value.slice(0, -1); emit('back'); render(); },
        y: () => { typeChar(' '); render(); },
        start: () => { if (live) { emit('enter'); value = ''; render(); } else done(true); },
        left: () => oskMove('left'), right: () => oskMove('right'), up: () => oskMove('up'), down: () => oskMove('down'),
        lb: () => { shift = !shift; render(); },
        rb: () => { shift = !shift; render(); },
        rt: () => { openAlt(Nav.current()); return true; },
      });
      Nav.setKeyboardCapture((e) => {
        if (e.key === 'Enter') { if (live) { emit('enter'); value = ''; render(); } else done(true); return true; }
        if (e.key === 'Escape') { if (altEl) closeAlt(); else done(false); return true; }
        if (e.key === 'Backspace') { value = value.slice(0, -1); emit('back'); render(); return true; }
        if (e.key.length === 1 && !e.ctrlKey && !e.altKey) { typeChar(e.key); render(); return true; }
        if (e.ctrlKey && e.key.toLowerCase() === 'v') {
          navigator.clipboard.readText().then((t) => { value += t; if (live) emit('char', t); render(); }).catch(() => {});
          return true;
        }
        return false;
      });
      requestAnimationFrame(() => { const d = el('osk-keys').querySelector('[data-default="1"]'); if (d) Nav.focus(d, { silent: true }); });
    });
  }

  return { prompt, moveBy, get open() { return !el('osk').classList.contains('hidden'); } };
})();
