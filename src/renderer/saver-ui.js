'use strict';
/* global h, $, S, Nav, Sound, Saver, modal, confirmBox, toast, gamo, applyState, renderRows, rowCycle, showSaver, renderSettings, OSK */
// Képernyőkímélő választó (lista + élő előnézet) és dia-szerkesztő jellegű, interaktív szerkesztő.
const SaverUI = (() => {
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const ui = () => (S.state && S.state.settings.ui) || {};
  const customs = () => ui().customSavers || [];
  const bgOf = (id) => Saver.LIST.find((x) => x.id === id);
  const bgName = (id) => (id === 'black' ? 'Fekete' : (bgOf(id) || { name: id }).name);
  const pads = () => (navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : []);
  const isPad = () => document.body.classList.contains('pad-mode');
  const hint = (cls, k, t) => h('span', { class: 'hint' }, h('b', { class: cls }, k), ` ${t}`);

  async function persistList(list) {
    try { applyState(await gamo.settings({ ui: { customSavers: list } })); } catch (e) { toast(`Mentés sikertelen: ${e.message}`, 'err'); return false; }
    return true;
  }
  async function setActive(key) {
    try { applyState(await gamo.settings({ ui: { saverKind: key } })); return true; } catch (e) { toast(e.message, 'err'); return false; }
  }
  function currentName() {
    const k = ui().saverKind || 'random';
    if (k === 'random') return 'Véletlenszerű';
    if (k.startsWith('custom:')) { const c = customs().find((x) => `custom:${x.id}` === k); return c ? c.name : 'Véletlenszerű'; }
    const sc = Saver.SCENES.find((x) => x.id === k); if (sc) return sc.name;
    return (bgOf(k) || { name: 'Véletlenszerű' }).name;
  }

  // ================= Választó =================
  let P = null; // { root, list, stage, title, desc, timer, entry }
  function entries() {
    const se = (x) => ({ key: x.id, name: x.name, scene: x, music: !!x.music, tag: 'ÉLŐ', desc: `${x.widgets.length} komponens · háttér: ${bgName(x.bg)}${x.music ? ' · reagál a zenére' : ''}` });
    const be = (x) => ({ key: x.id, name: x.name, music: !!x.music, desc: x.music ? 'Animáció, ami a gép hangjára reagál (Spotify, YouTube, rádió, játék – bármi, ami szól)' : 'Animáció a téma színeivel' });
    return [
      { group: null, items: [{ key: 'random', name: 'Véletlenszerű', desc: 'Minden alkalommal másik animáció vagy élő adatos jelenet' }] },
      { group: 'Saját', items: [...customs().map((x) => ({ key: `custom:${x.id}`, name: x.name, scene: x, custom: true, music: Saver.needsAudio(x, bgOf(x.bg)), tag: 'SAJÁT', desc: `${(x.widgets || []).length} komponens · háttér: ${bgName(x.bg)}` })),
        { key: 'new', name: 'Új képernyőkímélő…', isNew: true, desc: 'Üres diáról indulva: háttér és komponensek szabadon elhelyezve' }] },
      { group: 'Zenére reagáló', items: [...Saver.SCENES.filter((x) => x.music).map(se), ...Saver.LIST.filter((x) => x.music).map(be)] },
      { group: 'Élő adatok', items: Saver.SCENES.filter((x) => !x.music).map(se) },
      { group: 'Animációk', items: Saver.LIST.filter((x) => !x.music).map(be) },
    ];
  }
  const NEW_SCENE = () => ({ id: uid(), name: 'Saját képernyőkímélő', bg: 'aurora', widgets: [{ type: 'clock', x: 50, y: 45, scale: 1.85, align: 'c', anim: 'float', color: 'theme' }, { type: 'date', x: 50, y: 62, scale: 1, align: 'c', anim: 'none', color: 'muted' }] });
  function previewKind(e) {
    if (!e) return null;
    if (e.isNew) return NEW_SCENE();
    if (e.scene) return clone(e.scene);
    return e.key;
  }

  function open() {
    if (P) return;
    S.saverUi = true;
    const list = h('div', { class: 'sp-list' });
    const stage = h('div', { class: 'sp-stage saver-stage' }, h('canvas'), h('div', { class: 'saver-wl' }), h('div', { class: 'saver-mini' }));
    const title = h('h2'), desc = h('div', { class: 'desc' }), acts = h('div', { class: 'sp-acts' });
    const hints = h('div', { class: 'hints' });
    const root = h('div', { class: 'sp' },
      h('div', { class: 'sp-head' }, h('h1', {}, 'Képernyőkímélő'), h('span', { class: 'sub' }, 'Válassz a listából – jobb oldalt élő előnézet')),
      h('div', { class: 'sp-body' }, list, h('div', { class: 'sp-side' }, stage, title, desc, acts)),
      hints);
    document.body.append(root);
    P = { root, list, stage, title, desc, acts, hints, entry: null, timer: 0 };
    renderList();
    list.addEventListener('navfocus', (ev) => { const e = ev.target._entry; if (e) schedule(e); });
    Nav.push(() => root, {
      b: () => { Sound.back(); close(); return true; },
      y: () => { editEntry(cur()); return true; },
      x: () => { editEntry({ isNew: true }); return true; },
      select: () => { fullPreview(cur()); return true; },
      start: () => { moreMenu(cur()); return true; },
      lb: () => true, rb: () => true,
    });
    renderHints();
    P.mo = new MutationObserver(renderHints); P.mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }
  const cur = () => { const el = Nav.current(); return (el && el._entry) || (P && P.entry); };
  function renderList(focusKey) {
    const active = ui().saverKind || 'random';
    P.list.replaceChildren();
    for (const g of entries()) {
      if (g.group) P.list.append(h('div', { class: 'set-group' }, g.group));
      for (const e of g.items) {
        const b = h('button', { class: `sp-item focusable${e.isNew ? ' new' : ''}`, dataset: (focusKey ? e.key === focusKey : e.key === active) ? { default: '1' } : {} },
          h('span', { class: 'chk' }, e.key === active ? '✓' : ''), h('span', { class: 'nm' }, e.name),
          e.music ? h('span', { class: 'tag music' }, '♪ ZENE') : null, e.tag ? h('span', { class: 'tag' }, e.tag) : null);
        b._entry = e;
        b.onclick = () => choose(e);
        P.list.append(b);
      }
    }
    requestAnimationFrame(() => {
      const d = P && P.list.querySelector('[data-default="1"]');
      if (d) { Nav.focus(d, { silent: true }); d.scrollIntoView({ block: 'center' }); schedule(d._entry, true); }
    });
  }
  function schedule(e, now) {
    clearTimeout(P.timer);
    P.entry = e;
    P.title.textContent = e.name; P.desc.textContent = e.desc || '';
    const A = (icon, label, fn) => h('button', { onclick: fn }, label);
    P.acts.replaceChildren(...[
      e.isNew ? A('', 'Létrehozás', () => editEntry(e)) : A('', e.key === (ui().saverKind || 'random') ? 'Kiválasztva ✓' : 'Kiválasztás', () => choose(e)),
      e.key !== 'random' && !e.isNew ? A('', e.custom ? 'Szerkesztés' : 'Szerkesztés másolatként', () => editEntry(e)) : null,
      !e.isNew ? A('', 'Teljes képernyős előnézet', () => fullPreview(e)) : null,
      e.custom ? A('', 'Törlés', () => removeCustom(e)) : null,
    ].filter(Boolean));
    P.timer = setTimeout(() => startPreview(), now ? 0 : 180);
  }
  function startPreview() {
    if (!P || !P.entry) return;
    const [cv, wl, mini] = P.stage.children;
    Saver.start(previewKind(P.entry), cv, mini, wl);
  }
  function renderHints() {
    if (!P) return;
    P.hints.replaceChildren(...(isPad()
      ? [hint('btn-a', 'A', 'Kiválasztás'), hint('btn-y', 'Y', 'Szerkesztés'), hint('btn-x', 'X', 'Új'), hint('btn-start', '⧉', 'Teljes előnézet'), hint('btn-start', '≡', 'Továbbiak'), hint('btn-b', 'B', 'Vissza')]
      : [hint('kbd', 'Enter', 'Kiválasztás'), hint('kbd', 'Y', 'Szerkesztés'), hint('kbd', 'X', 'Új'), hint('kbd', 'F', 'Teljes előnézet'), hint('kbd', 'M', 'Továbbiak'), hint('kbd', 'Esc', 'Vissza')]));
  }
  async function choose(e) {
    if (!e) return;
    if (e.isNew) return editEntry(e);
    if (await setActive(e.key)) { toast(`Képernyőkímélő: ${e.name}`, 'ok', 2200); renderList(e.key); }
  }
  function close() {
    if (!P) return;
    clearTimeout(P.timer); P.mo.disconnect();
    Saver.stop();
    P.root.remove(); P = null; S.saverUi = false;
    Nav.pop();
    if (S.tab === 'settings' && typeof renderSettings === 'function') renderSettings();
  }
  function fullPreview(e) {
    if (!e || e.isNew) return;
    clearTimeout(P.timer); Saver.stop();
    showSaver(previewKind(e), () => { if (P) startPreview(); });
  }
  async function moreMenu(e) {
    if (!e) return;
    const items = e.isNew ? [{ label: 'Létrehozás', value: 'edit', kind: 'primary' }] : [
      { label: 'Kiválasztás', value: 'pick', kind: 'primary' },
      ...(e.key !== 'random' ? [{ label: e.custom ? 'Szerkesztés' : 'Szerkesztés másolatként', value: 'edit' }] : []),
      ...(e.custom ? [{ label: 'Duplikálás', value: 'dup' }, { label: 'Átnevezés', value: 'ren' }] : []),
      { label: 'Teljes képernyős előnézet', value: 'full' },
      ...(e.custom ? [{ label: 'Törlés', value: 'del', kind: 'danger' }] : []),
    ];
    const v = await modal({ title: e.name, items: [...items, { label: 'Mégse', value: null }] });
    if (v === 'pick') choose(e);
    else if (v === 'edit') editEntry(e);
    else if (v === 'full') fullPreview(e);
    else if (v === 'del') removeCustom(e);
    else if (v === 'dup') { const c = { ...clone(e.scene), id: uid(), name: `${e.scene.name} (másolat)` }; if (await persistList([...clone(customs()), c])) renderList(`custom:${c.id}`); }
    else if (v === 'ren') {
      const n = await OSK.prompt({ title: 'Név', value: e.scene.name });
      if (n && n.trim()) { const L = clone(customs()); const it = L.find((x) => x.id === e.scene.id); if (it) { it.name = n.trim(); if (await persistList(L)) renderList(e.key); } }
    }
  }
  async function removeCustom(e) {
    if (!(await confirmBox('Törlés', `Törlöd: „${e.name}”?`, 'Törlés'))) return;
    if (await persistList(customs().filter((x) => `custom:${x.id}` !== e.key))) {
      if ((ui().saverKind || '') === e.key) await setActive('random');
      toast('Törölve', 'ok', 2000);
      renderList();
    }
  }
  function editEntry(e) {
    if (!e || e.key === 'random') { if (e) toast('A véletlenszerű nem szerkeszthető – válassz egy konkrétat', '', 3000); return; }
    let sc, isNew = true;
    if (e.isNew) sc = NEW_SCENE();
    else if (e.custom) { sc = clone(e.scene); isNew = false; }
    else if (e.scene) sc = { ...clone(e.scene), id: uid(), name: `${e.scene.name} (saját)` };
    else sc = { id: uid(), name: `${e.name} (saját)`, bg: e.key, widgets: [{ type: 'clock', x: 96, y: 92, scale: 1.1, align: 'r', anim: 'none', color: 'white', opacity: 0.6 }] };
    delete sc.music;
    if (P) { clearTimeout(P.timer); Saver.stop(); }
    Editor.open(sc, isNew, (savedId) => { if (P) renderList(savedId ? `custom:${savedId}` : undefined); });
  }

  // ================= Szerkesztő =================
  const Editor = (() => {
    let E = null;
    const stickDeflected = () => pads().some((p) => Math.abs(p.axes[0] || 0) > 0.45 || Math.abs(p.axes[1] || 0) > 0.45);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

    function open(sc, isNew, onClose) {
      S.saverUi = true;
      sc.widgets = sc.widgets || [];
      sc.widgets.forEach(Saver.norm);
      const stage = h('div', { class: 'sed-stage saver-stage' }, h('canvas'), h('div', { class: 'saver-wl' }), h('div', { class: 'sed-ov' }, h('i', { class: 'sed-guide v' }), h('i', { class: 'sed-guide h' })));
      const nameEl = h('h1'), dirtyEl = h('span', { class: 'dirty' });
      const tabs = h('div', { class: 'sed-tabs' }, h('span', { dataset: { t: 'elem' } }, 'Elem'), h('span', { dataset: { t: 'dia' } }, 'Dia'));
      const rowsEl = h('div', { class: 'te-rows' });
      const layers = h('div', { class: 'sed-layers' });
      const panel = h('div', { class: 'sed-panel inactive' }, tabs, rowsEl, layers);
      const hints = h('div', { class: 'hints' });
      const root = h('div', { class: 'sed' },
        h('div', { class: 'sed-head' }, nameEl, h('span', { class: 'sub' }, 'Képernyőkímélő szerkesztő'), dirtyEl),
        h('div', { class: 'sed-body' }, h('div', { class: 'sed-stagewrap' }, stage), panel),
        hints);
      document.body.append(root);
      E = { sc, isNew, onClose, root, stage, ov: stage.lastChild, nameEl, dirtyEl, tabs, rowsEl, layers, panel, hints,
        sel: sc.widgets.length ? 0 : -1, mode: 'stage', tab: 'elem', orig: JSON.stringify(sc), raw: null, raf: 0, last: 0, movedAt: 0, shift: false, drag: null, savedId: null };
      tabs.onclick = (ev) => { const t = ev.target.dataset.t; if (t) { E.tab = t; drawPanel(); } };
      startStage();
      header(); drawPanel(); renderHints();
      Nav.push(() => root, handlers);
      requestAnimationFrame(() => setMode('stage'));
      E.mo = new MutationObserver(renderHints); E.mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
      panel.addEventListener('pointerdown', () => { if (E && E.mode !== 'panel') { E.mode = 'panel'; panel.classList.remove('inactive'); renderHints(); } });
      window.addEventListener('keydown', onKey, true);
      window.addEventListener('keyup', onKeyUp, true);
      stage.addEventListener('pointerdown', onDown);
      stage.addEventListener('wheel', onWheel, { passive: false });
      stage.addEventListener('dblclick', () => { if (E.sel >= 0) { E.tab = 'elem'; drawPanel(); setMode('panel'); } });
      E.raf = requestAnimationFrame(loop);
    }
    function startStage() {
      const [cv, wl] = E.stage.children;
      Saver.start(E.sc, cv, null, wl, { editor: true });
    }
    const W = () => (E && E.sel >= 0 ? E.sc.widgets[E.sel] : null);
    const dirty = () => JSON.stringify(E.sc) !== E.orig;
    function header() {
      E.nameEl.textContent = E.sc.name;
      E.dirtyEl.textContent = E.isNew && !E.savedId ? '● új, még nincs mentve' : dirty() ? '● nem mentett módosítások' : '✓ mentve';
      E.dirtyEl.style.color = dirty() || (E.isNew && !E.savedId) ? '' : '#4ade80';
    }
    // változás után: elrendezés (szinkron), tartalom (aszinkron), panel
    function changed({ content = false, panel = true, bg = false } = {}) {
      if (bg) Saver.setBg(E.sc.bg);
      Saver.layout();
      if (content) Saver.refresh();
      if (panel) drawPanel();
      header();
    }
    function select(i) {
      E.sel = E.sc.widgets.length ? (i + E.sc.widgets.length) % E.sc.widgets.length : -1;
      E.raw = null;
      Sound.move();
      drawPanel();
    }
    function setMode(m) {
      E.mode = m;
      E.panel.classList.toggle('inactive', m !== 'panel');
      if (m === 'stage') document.querySelectorAll('.focused').forEach((x) => x.classList.remove('focused'));
      else {
        const first = E.rowsEl.querySelector('.focusable');
        if (first && !E.rowsEl.contains(Nav.current())) Nav.focus(first, { silent: true });
      }
      renderHints();
    }

    // ---- panel ----
    function elemRows(w) {
      const T = Saver.WIDGETS;
      return [
        { type: 'select', label: 'Komponens', options: Object.entries(T).map(([k, x]) => [k, `${x.music ? '♪ ' : ''}${x.name}`]), get: () => w.type, set: (v) => { w.type = v; changed({ content: true }); return true; } },
        ...(w.type === 'text' ? [{ type: 'text', label: 'Szöveg', get: () => w.text || '', set: (v) => { w.text = v; changed({ content: true }); return true; } }] : []),
        { type: 'slider', label: 'Méret', min: 30, max: 500, step: 10, get: () => Math.round(w.scale * 100), fmt: (v) => `${v}%`, set: (v) => { w.scale = v / 100; changed(); return true; } },
        { type: 'slider', label: 'Vízszintes helyzet', min: 0, max: 100, step: 1, get: () => Math.round(w.x), fmt: (v) => `${v}%`, set: (v) => { w.x = v; changed(); return true; } },
        { type: 'slider', label: 'Függőleges helyzet', min: 0, max: 100, step: 1, get: () => Math.round(w.y), fmt: (v) => `${v}%`, set: (v) => { w.y = v; changed(); return true; } },
        { type: 'select', label: 'Igazítás', options: Object.entries(Saver.ALIGN), get: () => w.align, set: (v) => { w.align = v; changed(); return true; } },
        { type: 'select', label: 'Animáció', options: Object.entries(Saver.ANIM), get: () => w.anim || 'none', set: (v) => { w.anim = v; changed(); return true; } },
        { type: 'toggle', label: 'Zenére lüktet', desc: 'Az ütemre megnő, mint egy hangszóró', get: () => !!w.react, set: (v) => { w.react = !!v; Saver.syncAudio(); changed(); return true; } },
        { type: 'select', label: 'Szín', options: Object.entries(Saver.COLOR), get: () => w.color || 'white', set: (v) => { w.color = v; changed(); return true; } },
        { type: 'slider', label: 'Átlátszatlanság', min: 10, max: 100, step: 10, get: () => Math.round((w.opacity ?? 1) * 100), fmt: (v) => `${v}%`, set: (v) => { w.opacity = v >= 100 ? undefined : v / 100; changed(); return true; } },
        { group: 'Elrendezés' },
        { type: 'action', label: 'Középre igazítás', run: () => { w.x = 50; w.y = 50; w.align = 'c'; changed(); } },
        { type: 'action', label: 'Előrehozás (legfelülre)', run: () => { reorder(1); } },
        { type: 'action', label: 'Hátraküldés (legalulra)', run: () => { reorder(-1); } },
        { type: 'action', label: 'Duplikálás', run: () => duplicate() },
        { type: 'action', label: 'Elem törlése', danger: true, run: () => removeSel() },
      ];
    }
    function diaRows() {
      const sc = E.sc;
      return [
        { type: 'text', label: 'Név', get: () => sc.name, set: (v) => { if (v.trim()) sc.name = v.trim(); changed(); return true; } },
        { type: 'select', label: 'Háttér', options: [['black', 'Fekete'], ...Saver.LIST.map((x) => [x.id, `${x.music ? '♪ ' : ''}${x.name}`])], get: () => sc.bg, set: (v) => { sc.bg = v; changed({ bg: true }); return true; } },
        { type: 'action', label: 'Új elem hozzáadása', value: () => '+', run: () => addElem() },
        { group: 'Mentés' },
        { type: 'action', label: 'Mentés', run: () => save() },
        { type: 'action', label: 'Mentés és beállítás képernyőkímélőnek', run: async () => { if (await save()) { await setActive(`custom:${sc.id}`); toast(`Képernyőkímélő: ${sc.name}`, 'ok', 2200); } } },
        { type: 'action', label: 'Teljes képernyős előnézet', run: () => preview() },
        ...(!E.isNew || E.savedId ? [{ type: 'action', label: 'Képernyőkímélő törlése', danger: true, run: () => removeScene() }] : []),
      ];
    }
    function drawPanel() {
      if (!E) return;
      [...E.tabs.children].forEach((t) => t.classList.toggle('on', t.dataset.t === E.tab));
      const w = W();
      if (E.tab === 'elem' && !w) {
        E.rowsEl.replaceChildren(h('div', { class: 'empty' }, 'Nincs kijelölt elem. ', isPad() ? 'Ⓧ: új elem' : 'X: új elem'));
      } else renderRows(E.rowsEl, E.tab === 'elem' ? elemRows(w) : diaRows(), drawPanel);
      if (E.mode === 'stage') E.rowsEl.querySelectorAll('.focused').forEach((x) => x.classList.remove('focused'));
      E.layers.replaceChildren(...E.sc.widgets.map((x, i) => {
        const s = h('span', { class: i === E.sel ? 'on' : '' }, `${i + 1}. ${(Saver.WIDGETS[x.type] || { name: x.type }).name}`);
        s.onclick = () => { E.sel = i; E.tab = 'elem'; drawPanel(); };
        return s;
      }));
    }
    function renderHints() {
      if (!E) return;
      const pad = isPad();
      let L;
      if (E.mode === 'panel') L = pad ? [hint('btn-a', 'A', 'Módosítás'), hint('btn-start', '◀ ▶', 'Érték'), hint('btn-start', 'LB/RB', 'Elem / Dia'), hint('btn-b', 'B', 'Vissza a diára')]
        : [hint('kbd', 'Enter', 'Módosítás'), hint('kbd', '← →', 'Érték'), hint('kbd', 'Q / E', 'Elem / Dia'), hint('kbd', 'Esc', 'Vissza a diára')];
      else L = pad ? [hint('btn-start', 'L kar', 'Mozgatás'), hint('btn-start', 'D-pad', 'Finom mozgatás'), hint('btn-start', 'LT/RT · R kar', 'Méret'), hint('btn-start', 'LB/RB', 'Elem váltás'), hint('btn-a', 'A', 'Tulajdonságok'), hint('btn-x', 'X', 'Új elem'), hint('btn-y', 'Y', 'Dia'), hint('btn-start', '⧉', 'Előnézet'), hint('btn-start', '≡', 'Mentés'), hint('btn-b', 'B', 'Kilépés')]
        : [hint('kbd', 'Húzás', 'Mozgatás'), hint('kbd', 'Nyilak', 'Finom (Shift: nagy)'), hint('kbd', 'Görgő / + −', 'Méret'), hint('kbd', 'Tab', 'Elem váltás'), hint('kbd', 'Enter', 'Tulajdonságok'), hint('kbd', 'X', 'Új elem'), hint('kbd', 'Del', 'Törlés'), hint('kbd', 'Ctrl+S', 'Mentés'), hint('kbd', 'F', 'Előnézet'), hint('kbd', 'Esc', 'Kilépés')];
      E.hints.replaceChildren(...L);
    }

    // ---- műveletek ----
    function nudge(dx, dy) {
      const w = W(); if (!w) return;
      w.x = clamp(w.x + dx, 0, 100); w.y = clamp(w.y + dy, 0, 100); E.raw = null; E.movedAt = performance.now();
      changed({ panel: false }); panelSoon();
    }
    function resize(k) {
      const w = W(); if (!w) return;
      w.scale = clamp(w.scale * k, 0.3, 5);
      changed({ panel: false }); panelSoon();
    }
    let pT = 0;
    function panelSoon() { clearTimeout(pT); pT = setTimeout(drawPanel, 150); }
    function reorder(dir) {
      const w = W(); if (!w) return;
      E.sc.widgets.splice(E.sel, 1);
      if (dir > 0) E.sc.widgets.push(w); else E.sc.widgets.unshift(w);
      E.sel = dir > 0 ? E.sc.widgets.length - 1 : 0;
      changed({ content: true });
    }
    function duplicate() {
      const w = W(); if (!w) return;
      const c = { ...clone(w), x: clamp(w.x + 3, 0, 100), y: clamp(w.y + 4, 0, 100) };
      E.sc.widgets.push(c); E.sel = E.sc.widgets.length - 1;
      changed({ content: true });
    }
    function removeSel() {
      if (!W()) return;
      E.sc.widgets.splice(E.sel, 1);
      E.sel = Math.min(E.sel, E.sc.widgets.length - 1);
      Sound.back();
      Saver.syncAudio();
      changed({ content: true });
      if (E.mode === 'panel' && E.sel < 0) setMode('stage');
    }
    async function addElem() {
      const t = await modal({ title: 'Új elem', items: [...Object.entries(Saver.WIDGETS).map(([k, x]) => ({ label: `${x.music ? '♪ ' : ''}${x.name}`, value: k })), { label: 'Mégse', value: null }] });
      if (!E) return;
      if (t) {
        E.sc.widgets.push(Saver.norm({ type: t, x: 50, y: 50, scale: 1, align: 'c', anim: 'none', color: 'white', text: t === 'text' ? 'InariX' : undefined }));
        E.sel = E.sc.widgets.length - 1; E.tab = 'elem';
        Saver.syncAudio(); // ha zenei elem került be, induljon a hangelemzés
        changed({ content: true });
        if (t === 'text') { const v = await OSK.prompt({ title: 'Szöveg', value: 'InariX' }); if (E && v !== null) { W().text = v; changed({ content: true }); } }
      }
      setMode(E.mode);
    }
    async function save() {
      const list = clone(customs());
      const out = clone(E.sc);
      const i = list.findIndex((x) => x.id === out.id);
      if (i >= 0) list[i] = out; else list.push(out);
      if (!(await persistList(list))) return false;
      if (!customs().some((x) => x.id === out.id)) { toast('A mentés nem sikerült (a beállítás nem tárolódott)', 'err'); return false; }
      E.orig = JSON.stringify(E.sc); E.savedId = out.id;
      header(); drawPanel();
      toast(`Mentve: ${out.name}`, 'ok', 2000);
      return true;
    }
    async function removeScene() {
      if (!(await confirmBox('Törlés', `Törlöd: „${E.sc.name}”?`, 'Törlés'))) { setMode(E.mode); return; }
      const key = `custom:${E.sc.id}`;
      if (await persistList(customs().filter((x) => x.id !== E.sc.id))) {
        if ((ui().saverKind || '') === key) await setActive('random');
        toast('Törölve', 'ok', 2000);
        close(null);
      }
    }
    function preview() {
      Saver.stop();
      showSaver(clone(E.sc), () => { if (E) { startStage(); setMode(E.mode); } });
    }
    async function askExit() {
      const d = dirty() || (E.isNew && !E.savedId);
      const v = await modal({ title: 'Kilépés a szerkesztőből',
        body: d ? 'Vannak nem mentett módosítások. Mented őket?' : 'Minden módosítás mentve van.',
        items: d ? [{ label: 'Mentés és kilépés', value: 'save', kind: 'primary' }, { label: 'Kilépés mentés nélkül', value: 'discard', kind: 'danger' }, { label: 'Mégse, szerkesztem tovább', value: null }]
          : [{ label: 'Kilépés', value: 'discard', kind: 'primary' }, { label: 'Mentés és kilépés', value: 'save' }, { label: 'Mégse, szerkesztem tovább', value: null }] });
      if (!E) return;
      if (v === 'save') {
        if (!(await save())) { setMode(E.mode); return; }
        if (E.isNew && (ui().saverKind || 'random') !== `custom:${E.sc.id}` && await confirmBox('Mentve', `Legyen ez a képernyőkímélő: „${E.sc.name}”?`, 'Igen')) await setActive(`custom:${E.sc.id}`);
        close(E.sc.id);
      } else if (v === 'discard') close(E.savedId);
      else setMode(E.mode);
    }
    function close(savedId) {
      if (!E) return;
      cancelAnimationFrame(E.raf); E.mo.disconnect();
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp);
      Saver.stop();
      const cb = E.onClose;
      E.root.remove(); E = null;
      Nav.pop();
      S.saverUi = !!P;
      if (cb) cb(savedId);
      if (P) startPreview();
    }

    // ---- bemenet: kontroller (Nav rétegen át + analóg karok képkockánként) ----
    const handlers = {
      b: () => { if (E.mode === 'panel') { Sound.back(); setMode('stage'); } else askExit(); return true; },
      a: () => { if (E.mode === 'stage') { if (E.sel < 0 && E.tab === 'elem') E.tab = 'dia'; drawPanel(); setMode('panel'); Sound.select(); return true; } return false; },
      x: () => { addElem(); return true; },
      y: () => { E.tab = 'dia'; drawPanel(); setMode('panel'); return true; },
      start: () => { save(); return true; },
      select: () => { preview(); return true; },
      guide: () => false,
      lb: () => { if (E.mode === 'panel') { E.tab = E.tab === 'elem' ? 'dia' : 'elem'; drawPanel(); setMode('panel'); } else select(E.sel - 1); return true; },
      rb: () => { if (E.mode === 'panel') { E.tab = E.tab === 'elem' ? 'dia' : 'elem'; drawPanel(); setMode('panel'); } else select(E.sel + 1); return true; },
      lt: () => true, rt: () => true,
      left: () => dir(-1, 0), right: () => dir(1, 0), up: () => dir(0, -1), down: () => dir(0, 1),
      'edge-up': () => true, 'edge-down': () => true, 'edge-left': () => true, 'edge-right': () => true,
    };
    function dir(dx, dy) {
      if (E.mode === 'panel') {
        if (dx) return rowCycle(dx, drawPanel);
        return false; // fel/le: a sorok között a Nav lép
      }
      if (stickDeflected()) return true; // a bal kart a képkocka-ciklus kezeli (folyamatos mozgatás)
      const st = E.shift ? 5 : 0.5;
      nudge(dx * st, dy * st * (16 / 9));
      return true;
    }
    const dz = (v) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82);
    function loop(ts) {
      if (!E) return;
      E.raf = requestAnimationFrame(loop);
      const dt = Math.min(50, E.last ? ts - E.last : 16); E.last = ts;
      syncBoxes();
      const top = Nav.depth() && document.body.contains(E.root) && !$('#modal-layer:not(.hidden)') && !S.saver;
      if (!top || E.mode !== 'stage') return;
      const w = W();
      let moved = false;
      for (const p of pads()) {
        const lx = dz(p.axes[0] || 0), ly = dz(p.axes[1] || 0), ry = dz(p.axes[3] || 0);
        const lt = (p.buttons[6] && p.buttons[6].value) || 0, rt = (p.buttons[7] && p.buttons[7].value) || 0;
        if (!w) continue;
        if (lx || ly) {
          if (!E.raw) E.raw = { x: w.x, y: w.y };
          const sp = 0.045 * dt;
          E.raw.x = clamp(E.raw.x + lx * Math.abs(lx) * sp, 0, 100);
          E.raw.y = clamp(E.raw.y + ly * Math.abs(ly) * sp * (16 / 9), 0, 100);
          // igazítás a középvonalakhoz (mágnes)
          w.x = Math.abs(E.raw.x - 50) < 1.2 ? 50 : E.raw.x;
          w.y = Math.abs(E.raw.y - 50) < 1.6 ? 50 : E.raw.y;
          moved = true;
        }
        const k = (rt - lt) * 0.0012 * dt - ry * 0.0015 * dt;
        if (Math.abs(k) > 0.0001) { w.scale = clamp(w.scale * (1 + k), 0.3, 5); moved = true; }
      }
      if (moved) { E.movedAt = performance.now(); S.lastInput = Date.now(); changed({ panel: false }); panelSoon(); }
    }
    function syncBoxes() {
      const sr = E.stage.getBoundingClientRect();
      const ov = E.ov, n = E.sc.widgets.length;
      const boxes = [...ov.querySelectorAll('.sed-box')];
      while (boxes.length < n) { const b = h('div', { class: 'sed-box' }, h('span', { class: 'lab' })); ov.append(b); boxes.push(b); }
      while (boxes.length > n) boxes.pop().remove();
      boxes.forEach((b, i) => {
        const el = Saver.el(i), c = el && el.firstChild && el.firstChild.firstChild;
        if (!c) return;
        const r = c.getBoundingClientRect();
        b.style.left = `${r.left - sr.left - 4}px`; b.style.top = `${r.top - sr.top - 4}px`;
        b.style.width = `${r.width + 8}px`; b.style.height = `${r.height + 8}px`;
        const sel = i === E.sel;
        b.classList.toggle('sel', sel); b.classList.toggle('grab', sel && !!E.drag);
        if (sel) { const w = E.sc.widgets[i]; b.firstChild.textContent = `${(Saver.WIDGETS[w.type] || { name: w.type }).name} · ${Math.round(w.scale * 100)}%`; }
      });
      const w = W();
      const live = !!w && performance.now() - E.movedAt < 700; // a segédvonal csak mozgatás közben látszik
      ov.querySelector('.sed-guide.v').classList.toggle('on', live && w.x === 50);
      ov.querySelector('.sed-guide.h').classList.toggle('on', live && w.y === 50);
    }
    // ---- egér ----
    function hit(ev) {
      const boxes = [...E.ov.querySelectorAll('.sed-box')];
      for (let i = boxes.length - 1; i >= 0; i--) { const r = boxes[i].getBoundingClientRect(); if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) return i; }
      return -1;
    }
    function onDown(ev) {
      if (ev.button !== 0) return;
      const i = hit(ev);
      E.sel = i; E.tab = 'elem'; E.raw = null;
      setMode('stage'); drawPanel();
      if (i < 0) return;
      const w = W(), sr = E.stage.getBoundingClientRect();
      E.drag = { x0: ev.clientX, y0: ev.clientY, wx: w.x, wy: w.y, sw: sr.width, sh: sr.height };
      window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
      ev.preventDefault();
    }
    function onMove(ev) {
      const d = E && E.drag, w = W(); if (!d || !w) return;
      let x = clamp(d.wx + ((ev.clientX - d.x0) / d.sw) * 100, 0, 100), y = clamp(d.wy + ((ev.clientY - d.y0) / d.sh) * 100, 0, 100);
      if (!ev.altKey) { if (Math.abs(x - 50) < 1.2) x = 50; if (Math.abs(y - 50) < 1.6) y = 50; }
      w.x = Math.round(x * 10) / 10; w.y = Math.round(y * 10) / 10;
      S.lastInput = Date.now(); E.movedAt = performance.now();
      changed({ panel: false });
    }
    function onUp() { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); if (E) { E.drag = null; drawPanel(); } }
    function onWheel(ev) { ev.preventDefault(); if (W()) resize(ev.deltaY < 0 ? 1.06 : 1 / 1.06); }
    // ---- billentyűzet (a Nav által nem kezelt gombok) ----
    function onKey(e) {
      if (!E) return;
      E.shift = e.shiftKey;
      const topmost = !$('#modal-layer:not(.hidden)') && !(document.getElementById('osk') && !document.getElementById('osk').classList.contains('hidden')) && !S.saver;
      if (!topmost) return;
      const k = e.key;
      if ((e.ctrlKey || e.metaKey) && (k === 's' || k === 'S')) { e.preventDefault(); e.stopPropagation(); save(); return; }
      if ((e.ctrlKey || e.metaKey) && (k === 'd' || k === 'D')) { e.preventDefault(); e.stopPropagation(); duplicate(); return; }
      if (E.mode !== 'stage') return;
      if (k === '+' || k === '=') { e.preventDefault(); resize(1.06); }
      else if (k === '-' || k === '_') { e.preventDefault(); resize(1 / 1.06); }
      else if (k === 'Delete') { e.preventDefault(); removeSel(); }
      else if (k === 'Backspace') { e.preventDefault(); e.stopPropagation(); } // ne lépjen ki véletlenül
    }
    function onKeyUp(e) { if (E) E.shift = e.shiftKey; }
    return { open };
  })();

  return { open, currentName };
})();
