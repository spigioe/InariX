'use strict';
// Overlay menü: kontrollerrel (Gamepad API) és billentyűzettel vezérelhető
let st = { games: [], volume: null, perf: false }, sel = 0, items = [];
const $ = (id) => document.getElementById(id);
function build() {
  items = [{ id: 'close', label: 'Vissza a játékba' }, { id: 'home', label: 'InariX kezdőképernyő' }];
  for (const g of st.games) items.push({ id: 'quit', arg: g.id, label: `Kilépés: ${g.name}`, danger: true });
  const v = st.volume && st.volume.level !== undefined ? st.volume.level : null;
  items.push({ id: 'vol', arg: -1, label: 'Hangerő −', sub: v !== null && v !== undefined ? `${v}%` : '' });
  items.push({ id: 'vol', arg: 1, label: 'Hangerő +' });
  items.push({ id: 'perf', label: 'Teljesítmény kijelző', sub: st.perf ? 'be' : 'ki' });
  sel = Math.min(sel, items.length - 1);
  $('items').replaceChildren(...items.map((it, i) => {
    const d = document.createElement('div');
    d.className = `it${i === sel ? ' sel' : ''}${it.danger ? ' danger' : ''}`;
    d.textContent = it.label;
    if (it.sub) { const s = document.createElement('small'); s.textContent = it.sub; d.append(s); }
    d.onclick = () => { sel = i; activate(); };
    return d;
  }));
  $('clock').textContent = new Date().toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
}
async function activate() {
  const it = items[sel];
  const r = await window.ov.action(it.id, it.arg);
  if (r && r.state) { st = r.state; build(); }
}
const move = (d) => { sel = (sel + d + items.length) % items.length; build(); };
window.ov.onState((s) => { st = s; sel = 0; build(); held = snapshot(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') move(1); else if (e.key === 'ArrowUp') move(-1);
  else if (e.key === 'Enter') activate(); else if (e.key === 'Escape') window.ov.action('close');
});
// kontroller: a megnyitáskor lenyomott gombok (pl. Guide) felengedéséig nem reagálunk
let held = {};
const snapshot = () => { const h = {}; for (const p of navigator.getGamepads()) if (p) p.buttons.forEach((b, i) => { if (b.pressed) h[i] = 1; }); return h; };
let rep = 0;
(function poll() {
  const now = {};
  for (const p of navigator.getGamepads()) if (p) {
    p.buttons.forEach((b, i) => { if (b.pressed) now[i] = 1; });
    if ((p.axes[1] || 0) > 0.6) now[13] = 1; else if ((p.axes[1] || 0) < -0.6) now[12] = 1;
  }
  for (const k of Object.keys(now)) if (!held[k]) {
    const i = Number(k);
    if (i === 0) activate(); else if (i === 1 || i === 16) window.ov.action('close');
    else if (i === 13) move(1); else if (i === 12) move(-1);
    rep = performance.now();
  }
  if ((now[12] || now[13]) && performance.now() - rep > 350) { move(now[13] ? 1 : -1); rep = performance.now() - 250; }
  held = now;
  requestAnimationFrame(poll);
})();
