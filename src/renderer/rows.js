'use strict';
/* global h, Nav, OSK, Sound, toast, gamo, applyState */
// Közös sorlista-motor (Beállítások, Gyorsmenü, Téma szerkesztő).
// Sor típusok: group | toggle | select | slider | text | action | info
// row.set(v) visszaadhat egy konfig-részletet (azt elmentjük) vagy maga végzi el a műveletet.

async function applyRow(row, v, rerender) {
  try {
    const res = await row.set(v);
    if (res && typeof res === 'object' && !Array.isArray(res) && !res.ok) applyState(await gamo.settings(res));
  } catch (e) { toast(e.message, 'err'); }
  if (rerender) rerender();
  if (row.after) row.after(v);
}

// Balra/jobbra a fókuszált sor értékét lépteti (select, slider). false = nem kezeltük.
function rowCycle(dir, rerender) {
  const el = Nav.current();
  const row = el && el._row;
  if (!row) return false;
  if (row.type === 'select') {
    const opts = row.options;
    const i = opts.findIndex(([v]) => String(v) === String(row.get()));
    Sound.move();
    applyRow(row, opts[(i + dir + opts.length) % opts.length][0], rerender);
    return true;
  }
  // a sor melletti négyzetes gombról balra visszalépünk a csúszkára
  if (el._sideOf) { if (dir < 0) { Nav.focus(el._sideOf); Sound.move(); } return true; }
  if (row.type === 'slider') {
    const step = row.step || 5, min = row.min ?? 0, max = row.max ?? 100;
    // jobbra a maximumon túl: a sor melletti gombra lépünk
    if (dir > 0 && row.side && el._side && Number(row.get()) >= max) { Nav.focus(el._side); Sound.move(); return true; }
    const v = Math.max(min, Math.min(max, (Number(row.get()) || 0) + dir * step));
    Sound.move();
    applyRow(row, v, rerender);
    return true;
  }
  return false;
}

function renderRows(container, rows, rerender) {
  const cur = Nav.current();
  const prevIdx = cur && container.contains(cur) ? cur.dataset.idx : null;
  container.innerHTML = '';
  rows.forEach((row, idx) => {
    if (!row) return;
    if (row.group) { container.append(h('div', { class: 'set-group' }, row.group)); return; }
    if (row.type === 'note') { container.append(h('div', { class: 'set-note' }, row.label)); return; }
    const lbl = h('div', { class: 'lbl' }, row.label, row.desc ? h('small', {}, row.desc) : null);
    const ico = row.icon ? h('span', { class: 'row-ico', style: row.icon.color ? `background:${row.icon.color}` : '' }, row.icon.text || '') : null;
    let right;
    const val = row.get ? row.get() : null;
    if (row.type === 'toggle') right = h('div', { class: `toggle${val ? ' on' : ''}` });
    else if (row.type === 'select') {
      const opt = row.options.find(([v]) => String(v) === String(val)) || [null, '?'];
      right = h('div', { class: 'val sel-val' }, row.swatch ? h('i', { class: 'swatch', style: `background:${opt[0]}` }) : null, opt[1]);
    } else if (row.type === 'slider') {
      const pct = ((Number(val) - (row.min ?? 0)) / ((row.max ?? 100) - (row.min ?? 0))) * 100;
      right = h('div', { class: 'slider' }, h('div', { class: 'bar' }, h('div', { class: 'fill', style: `width:${pct}%` })), h('span', { class: 'val' }, row.fmt ? row.fmt(val) : `${val}`));
    } else if (row.type === 'text') right = h('div', { class: 'val' }, row.password && val ? '••••••••' : (val || '—'));
    else right = h('div', { class: `val${row.mono ? ' mono' : ''}` }, row.value ? row.value() : (row.type === 'action' ? '›' : ''));
    const el = h('button', { class: `row-item focusable${row.danger ? ' danger' : ''}${row.cls ? ` ${row.cls}` : ''}`, dataset: { idx } }, ico, lbl, right);
    el._row = row;
    el.addEventListener('click', async (ev) => {
      if (row.type === 'toggle') await applyRow(row, !row.get(), rerender);
      else if (row.type === 'select') rowCycle(1, rerender);
      else if (row.type === 'slider' && row.side && ev.detail === 0) row.side.run(); // kontroller Ⓐ / Enter: a sor gombja (pl. némítás)
      else if (row.type === 'slider') rowCycle(1, rerender);
      else if (row.type === 'text') {
        const v = await OSK.prompt({ title: row.label, value: row.get() || '' });
        if (v !== null) await applyRow(row, v, rerender);
      } else if (row.type === 'action') {
        try { await row.run(); } catch (e) { toast(e.message, 'err'); }
      }
    });
    if (row.side) {
      // csúszka + négyzetes gomb egy sor helyén
      const sb = h('button', { class: `row-side focusable${row.side.active ? ' on' : ''}`, title: row.side.title || '', dataset: { idx: `${idx}s` }, onclick: (ev) => { ev.stopPropagation(); row.side.run(); } }, uiIcon(row.side.icon));
      sb._row = row; sb._sideOf = el; el._side = sb;
      el.classList.add('has-side');
      container.append(h('div', { class: 'row-pair' }, el, sb));
      requestAnimationFrame(() => { if (el.offsetHeight) { sb.style.width = `${el.offsetHeight}px`; sb.style.height = `${el.offsetHeight}px`; } }); // pontos négyzet: a sor magassága
    } else container.append(el);
  });
  if (prevIdx !== null) {
    const el = container.querySelector(`[data-idx="${prevIdx}"]`);
    if (el) Nav.focus(el, { silent: true, scroll: false });
  }
}
