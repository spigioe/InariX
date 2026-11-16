'use strict';
/* global $, h, S, gamo, Nav, OSK, Sound, toast, modal, confirmBox, icon, coverEl, renderRows, rowCycle, applyState, refreshState,
   loadLibrary, renderLibrary, renderDetail, renderDetailInfo, openDetail, closeDetail, hostById, libHost, fmtTime, fmtDate,
   streamDesktop, wake, setTab, STORE_LABEL, LIB_FILTERS, save, NOTES, setBg */

// ================= Rezgés =================
function rumble(strong = 0.15, weak = 0.35, ms = 35) {
  if (!S.state || !S.state.settings.ui.rumble) return;
  const p = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find(Boolean);
  if (p && p.vibrationActuator && p.vibrationActuator.playEffect) {
    p.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch(() => {});
  }
}
Nav.onInput((a) => { if (a === 'a') rumble(); });

// ================= Gyorsmenü (Guide) =================
async function openQuick() {
  if (S.quickOpen) return closeQuick();
  S.quickOpen = true;
  let panel = $('#quick');
  if (!panel) {
    panel = h('div', { id: 'quick' }, h('div', { class: 'q-head' }), h('div', { class: 'q-rows' }));
    document.body.append(panel);
  }
  panel.classList.remove('hidden');
  S.quick = { vol: null, net: null, sys: {} };
  renderQuick();
  Nav.push(() => $('#quick .q-rows'), {
    b: () => { Sound.back(); closeQuick(); },
    start: () => { closeQuick(); }, guide: () => { closeQuick(); },
    left: () => rowCycle(-1, renderQuick), right: () => rowCycle(1, renderQuick),
    lb: () => true, rb: () => true,
  });
  const [vol, net, bri, pads] = await Promise.all([gamo.volume('VOLGET').catch(() => null), gamo.network().catch(() => null), gamo.brightness().catch(() => null), gamo.padBattery().catch(() => [])]);
  if (!S.quickOpen) return;
  S.quick.vol = vol; S.quick.net = net; S.quick.bri = bri; S.quick.pads = pads;
  renderQuick();
  const st = await gamo.state().catch(() => null);
  if (st && S.quickOpen) { S.state.hostInfo = st.hostInfo; renderQuick(); }
}

function closeQuick() {
  if (!S.quickOpen) return;
  S.quickOpen = false;
  $('#quick').classList.add('hidden');
  Nav.pop();
}

function renderQuick() {
  const panel = $('#quick');
  if (!panel) return;
  const now = new Date();
  panel.querySelector('.q-head').replaceChildren(
    h('div', { class: 'q-time' }, now.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })),
    h('div', { class: 'q-date' }, now.toLocaleDateString('hu-HU', { weekday: 'long', month: 'long', day: 'numeric' })));
  const q = S.quick;
  const rows = [{ group: 'Gyors beállítások' }];
  if (q.vol) {
    rows.push({ type: 'slider', label: 'Hangerő', get: () => q.vol.level, step: 5, fmt: (v) => (q.vol.muted ? 'némítva' : `${v}%`),
      set: async (v) => { q.vol = await gamo.volume(`VOLSET ${v}`); } });
    rows.push({ type: 'toggle', label: 'Némítás', get: () => q.vol.muted, set: async (v) => { q.vol = await gamo.volume(`VOLMUTE ${v ? 1 : 0}`); } });
  }
  if (q.bri !== null && q.bri !== undefined) {
    rows.push({ type: 'slider', label: 'Fényerő', get: () => q.bri, step: 10, fmt: (v) => `${v}%`, set: async (v) => { q.bri = await gamo.brightness(v); } });
  }
  rows.push({ type: 'toggle', label: 'Éjszakai mód', desc: 'Melegebb, kíméletesebb színek a InariX felületén', get: () => !!S.state.settings.ui.nightMode, set: (v) => ({ ui: { nightMode: v } }), after: () => applyNight() });
  rows.push({ type: 'select', label: 'Alvásidőzítő', options: [[0, 'Ki'], [15, '15 perc'], [30, '30 perc'], [60, '1 óra'], [90, '1,5 óra']], get: () => S.sleepMin || 0,
    set: (v) => { setSleepTimer(Number(v)); return true; } });
  const net = q.net;
  rows.push({ type: 'info', label: 'Hálózat', value: () => (!net ? '…' : net.type === 'wifi' ? `Wi-Fi${net.ssid ? ` · ${net.ssid}` : ''}${net.signal !== null ? ` · ${net.signal}%` : ''}` : 'Vezetékes / egyéb') });
  if (S.battery && !(S.battery.charging && S.battery.level === 1 && S.battery.chargingTime === 0)) {
    rows.push({ type: 'info', label: 'Akkumulátor', value: () => `${Math.round(S.battery.level * 100)}%${S.battery.charging ? ' · töltés' : ''}` });
  }
  for (const p of q.pads || []) rows.push({ type: 'info', label: `Kontroller ${p.index + 1}`, value: () => (p.wired ? 'vezetékes' : `akkumulátor: ${p.level}`) });
  rows.push({ group: 'Zene' });
  rows.push({ type: 'action', label: S.radio ? `♫ ${S.radio.name}` : '♫ Rádió és lejátszó', run: () => { closeQuick(); musicMenu(); } });
  rows.push({ type: 'action', label: '⏯ Lejátszás / szünet', run: () => gamo.mediaKey('play') });
  rows.push({ type: 'action', label: '⏭ Következő szám', run: () => gamo.mediaKey('next') });
  const remotes = S.lib.hosts.filter((x) => !x.local);
  if (remotes.length) {
    rows.push({ group: 'Gépek' });
    for (const lh of remotes) {
      const info = (S.state.hostInfo || {})[lh.id];
      rows.push({ type: 'action', label: lh.name, value: () => (lh.online ? `online${info && info.ping ? ` · ${info.ping} ms` : ''}` : 'offline'), run: () => hostPowerMenu(hostById(lh.id)) });
    }
  }
  rows.push({ group: 'Gyors elérés' });
  rows.push({ type: 'action', label: '🎲 Véletlen játék', run: () => { closeQuick(); randomGame(); } });
  rows.push({ type: 'action', label: 'Statisztika', run: () => showStats() });
  rows.push({ type: 'action', label: 'Értesítések', value: () => String(NOTES.length), run: () => showNotes() });
  rows.push({ type: 'action', label: 'Diagnosztika', run: () => showDiagnostics() });
  rows.push({ type: 'action', label: 'Könyvtár frissítése', run: () => { closeQuick(); loadLibrary(true, true); } });
  rows.push({ group: 'Energia' });
  rows.push({ type: 'action', label: 'Vissza a Windows asztalra', desc: 'A InariX a háttérben fut tovább', run: () => { closeQuick(); gamo.hide(); } });
  rows.push({ type: 'action', label: '⏻ Kilépés és energia…', value: () => 'kilépés · alvás · leállítás', run: () => { closeQuick(); exitMenu(); } });
  renderRows(panel.querySelector('.q-rows'), rows, renderQuick);
  if (!Nav.current() || !panel.contains(Nav.current())) Nav.focusFirst();
}

// ================= Rendszergazdai mód (UAC) =================
async function adminModeFlow() {
  const st = await gamo.adminState().catch(() => null);
  const on = S.state.settings.hostMode.adminMode;
  const status = st ? `Most: InariX ${st.elevated ? 'rendszergazdaként fut' : 'normál joggal fut'} · UAC ablak ${st.uacOnSecureDesktop ? 'a biztonsági asztalon (nem látszik a streamben)' : 'a normál asztalon (látszik a streamben)'}` : '';
  const v = await modal({
    title: 'Rendszergazdai mód',
    wide: true,
    body: [
      'Admin jogot kérő játék vagy program indításakor a Windows UAC ablaka a „biztonsági asztalon” jelenik meg, amit semmilyen stream nem lát – ezért áll meg a kép, amíg a gaming PC-nél jóvá nem hagyod.',
      '',
      'Bekapcsolva (egyszeri UAC jóváhagyással):',
      ' • a InariX host bejelentkezéskor rendszergazdaként indul (ütemezett feladat, kérdés nélkül) – az általa indított programok nem kérnek UAC-ot,',
      ' • ami mégis kér (pl. Steamen át indított admin játék), annak UAC ablaka a normál asztalra kerül: látszik a streamben, és a laptopról jóváhagyható.',
      '',
      '⚠ Biztonság: a normál asztalon megjelenő UAC ablakot más program is láthatja. Csak saját, megbízható gépen kapcsold be.',
      '',
      status,
    ].join('\n'),
    items: on
      ? [{ label: 'Kikapcsolás', value: 'off', kind: 'danger' }, { label: 'Mégse', value: null }]
      : [{ label: 'Bekapcsolás (UAC jóváhagyás kell)', value: 'on', kind: 'primary' }, { label: 'Mégse', value: null }],
  });
  if (!v) return;
  toast(v === 'on' ? 'Jóváhagyás kérése… (a gaming PC-n UAC ablak jelenik meg)' : 'Kikapcsolás…', '', 5000);
  try {
    await gamo.adminMode(v === 'on');
    toast(v === 'on' ? 'Bekapcsolva – a InariX újraindul rendszergazdaként' : 'Rendszergazdai mód kikapcsolva', 'ok', 6000);
    await refreshState(); if (S.tab === 'settings') renderSettings();
  } catch (e) { toast(e.message, 'err', 7000); }
}

// ================= Futó játék: menü és kilépés a játékból =================
async function runningMenu(e) {
  const r = e.running[0];
  const v = await modal({
    title: e.name,
    body: `Fut: ${r.hostName} · ${fmtSince(r.since)}`,
    items: [
      { label: '▶  Folytatás', value: 'resume', kind: 'primary' },
      { label: '⏹  Kilépés a játékból', value: 'quit', kind: 'danger' },
      { label: 'ⓘ  Adatlap', value: 'detail' },
      { label: 'Mégse', value: null },
    ],
  });
  if (v === 'resume') play(e, r.hostId);
  else if (v === 'quit') quitGameFlow(e, r.hostId);
  else if (v === 'detail') openDetail(e);
}

// A játék összes folyamatának leállítása azon a gépen (mint Xboxon a "Kilépés")
async function quitGameFlow(e, hostId, { confirm = true } = {}) {
  const where = (e.running || []).find((r) => r.hostId === hostId) || { hostName: 'gép' };
  if (confirm && !(await confirmBox('Kilépés a játékból', `Bezárod a(z) ${e.name} játékot a(z) ${where.hostName} gépen?\nA nem mentett játékállás elveszhet.`, 'Kilépés a játékból'))) return false;
  toast(`${e.name} bezárása…`, '', 3000);
  try {
    const r = await gamo.quitGame(e.key, hostId);
    if (r.ok) toast(`${e.name} bezárva (${r.killed} folyamat)`, 'ok');
    else toast(`Nem minden folyamat állt le (${r.left} fut még) – próbáld újra`, 'err', 7000);
  } catch (err) { toast(err.message, 'err'); return false; }
  if (S.detail) closeDetail();
  await loadLibrary(false);
  return true;
}

// ================= Kilépés menü (B a kezdőképernyőn, energia gomb, gyorsmenü) =================
let exitOpen = false;
async function exitMenu() {
  if (exitOpen) return;
  exitOpen = true;
  try {
    const isLaptop = S.state.display && S.state.display.isLaptop;
    const mode = S.state.settings.display.noLockMode || 'off';
    const v = await modal({
      title: 'Kilépés',
      body: mode === 'running' ? 'A InariX kilépése után a Windows újra kéri a PIN-t (Amíg fut, nem kér mód).' : '',
      items: [
        { label: '🖥  Vissza a Windows asztalra (a háttérben fut tovább)', value: 'hide', kind: 'primary' },
        { label: '✕  Kilépés a InariXből', value: 'quit' },
        { label: '☾  Alvó mód', value: 'sleep' },
        { label: '⇠  Kijelentkezés a Windowsból', value: 'logoff' },
        { label: '↻  Újraindítás', value: 'restart' },
        { label: '⏻  Leállítás', value: 'shutdown', kind: 'danger' },
        { label: 'Mégse', value: null },
      ],
    });
    if (!v) return;
    if (v === 'hide') return gamo.hide();
    if (v === 'quit') {
      if (await confirmBox('Kilépés a InariXből', `A InariX teljesen bezárul${isLaptop ? ', a kijelző és fedél automatika leáll' : ''}. A Windows-zal együtt legközelebb újra elindul.`, 'Kilépés')) gamo.quit();
      return;
    }
    if (v === 'sleep') return gamo.power('local', 'sleep').catch((e) => toast(e.message, 'err'));
    const labels = { logoff: 'Kijelentkezel a Windowsból?', restart: 'Újraindítod a gépet?', shutdown: 'Leállítod a gépet?' };
    if (await confirmBox('Megerősítés', `${labels[v]}\nA nem mentett munkák elveszhetnek.`, 'Igen')) {
      gamo.power('local', v).then(() => toast(v === 'logoff' ? 'Kijelentkezés…' : 'A gép 5 mp múlva ' + (v === 'restart' ? 'újraindul' : 'leáll'), 'ok')).catch((e) => toast(e.message, 'err'));
    }
  } finally { exitOpen = false; }
}

async function hostPowerMenu(host) {
  if (!host) return;
  const lh = libHost(host.id) || {};
  const local = host.local;
  const items = [];
  if (!local && !lh.online) {
    if (host.mac) items.push({ label: 'Felébresztés (Wake-on-LAN)', value: 'wake', kind: 'primary' });
  } else {
    if (!local) items.push({ label: 'Asztal streamelése', value: 'desktop', kind: 'primary' });
    items.push({ label: 'Alvó mód', value: 'sleep' });
    items.push({ label: 'Újraindítás', value: 'restart' });
    items.push({ label: 'Leállítás', value: 'shutdown', kind: 'danger' });
    if (!local) items.push({ label: 'Rendszer info (lemezterület)', value: 'sys' });
  }
  items.push({ label: 'Mégse', value: null });
  const v = await modal({ title: local ? 'Ez a gép' : host.name, items });
  if (!v) return;
  if (v === 'wake') return wake(host);
  if (v === 'desktop') { closeQuick(); return streamDesktop(host); }
  if (v === 'sys') return showSystem(host);
  const labels = { sleep: 'alvó módba tesszük', restart: 'újraindítjuk', shutdown: 'leállítjuk' };
  if (!(await confirmBox('Megerősítés', `Biztosan ${labels[v]}: ${local ? 'ez a gép' : host.name}?`, 'Igen'))) return;
  try {
    await gamo.power(host.id, v);
    toast(`${local ? 'Ez a gép' : host.name}: ${labels[v]}`, 'ok');
    if (!local) setTimeout(() => loadLibrary(false), 8000);
  } catch (e) { toast(e.message, 'err'); }
}

async function showSystem(host) {
  try {
    const s = await gamo.system(host.id);
    const gb = (b) => `${(b / 1073741824).toFixed(0)} GB`;
    const node = h('div', { class: 'sys' }, (s.disks || []).map((d) => h('div', { class: 'disk' },
      h('div', { class: 'ach-head' }, h('b', {}, d.drive), h('span', {}, `${gb(d.free)} szabad / ${gb(d.total)}`)),
      h('div', { class: 'bar' }, h('div', { class: 'fill', style: `width:${((d.total - d.free) / d.total) * 100}%` })))));
    await modal({ title: `${host.name} – rendszer`, node, body: s.uptime ? `Üzemidő: ${fmtTime(s.uptime)}` : '', items: [{ label: 'Bezárás', value: null }] });
  } catch (e) { toast(e.message, 'err'); }
}

// ================= Könyvtár: szűrés, véletlen, gyűjtemények =================
async function filterMenu() {
  const items = [{ label: 'Nincs szűrő', value: '__none', kind: S.libFilter ? '' : 'primary' }];
  for (const [k, f] of Object.entries(LIB_FILTERS)) {
    if (!S.lib.games.some(f.fn)) continue;
    items.push({ label: `${f.label} (${S.lib.games.filter(f.fn).length})`, value: k, kind: S.libFilter === k ? 'primary' : '' });
  }
  items.push({ label: '🎲 Véletlen játék', value: '__random' });
  const v = await modal({ title: 'Szűrés', items });
  if (!v) return;
  if (v === '__random') return randomGame();
  const MAPC = { installed: 'installed', notinstalled: 'owned', local: 'h:local', available: 'all', stream: 'all', installedAny: 'installed' };
  S.libCat = v === '__none' ? 'all' : MAPC[v] || (PLATFORMS.includes(v) ? `p:${v}` : 'all');
  S.filter = '';
  setTab('library');
}

function randomGame() {
  const pool = S.lib.games.filter((g) => g.available && g.sources.length && !g.hidden);
  if (!pool.length) { toast('Nincs indítható játék'); return; }
  const g = pool[Math.floor(Math.random() * pool.length)];
  rumble(0.4, 0.6, 120);
  toast(`🎲 ${g.name}`, 'ok', 2500);
  openDetail(g);
}

async function addToCollection(e) {
  const cols = S.state.settings.collections;
  const items = cols.map((c) => ({ label: `${c.keys.includes(e.key) ? '✓' : '○'}  ${c.name}`, value: c.id }));
  items.push({ label: '＋ Új gyűjtemény…', value: '__new', kind: cols.length ? '' : 'primary' });
  const v = await modal({ title: `Gyűjtemény – ${e.name}`, items });
  if (!v) return;
  let list = cols.map((c) => ({ ...c, keys: [...c.keys] }));
  if (v === '__new') {
    const name = await OSK.prompt({ title: 'Új gyűjtemény neve' });
    if (!name || !name.trim()) return;
    list.push({ id: Date.now().toString(36), name: name.trim(), keys: [e.key] });
    toast(`Hozzáadva: ${name.trim()}`, 'ok', 2500);
  } else {
    const c = list.find((x) => x.id === v);
    if (c.keys.includes(e.key)) { c.keys = c.keys.filter((k) => k !== e.key); toast(`Eltávolítva: ${c.name}`, '', 2500); }
    else { c.keys.push(e.key); toast(`Hozzáadva: ${c.name}`, 'ok', 2500); }
  }
  await save({ collections: list });
  if (S.detail) renderDetail(e);
}

async function collectionMenu(c) {
  const v = await modal({ title: `${c.icon || '▤'} ${c.name}`, body: `${c.keys.length} játék`, items: [{ label: 'Átnevezés', value: 'rename' }, { label: `Ikon: ${c.icon || '▤'}`, value: 'icon' }, { label: 'Szín', value: 'color' }, { label: 'Törlés', value: 'delete', kind: 'danger' }, { label: 'Mégse', value: null }] });
  const list = S.state.settings.collections;
  if (v === 'icon') {
    const ICONS = ['▤', '🎮', '⚔', '🏎', '👻', '🧩', '🌍', '⭐', '🔫', '🏆', '🛡', '🎯', '🧙', '🚀', '⚽', '🎵'];
    const ic = await modal({ title: 'Csoport ikonja', items: [...ICONS.map((x) => ({ label: x, value: x })), { label: 'Mégse', value: null }] });
    if (ic) await save({ collections: list.map((x) => (x.id === c.id ? { ...x, icon: ic } : x)) });
    return;
  }
  if (v === 'color') {
    const COLORS = [['', 'Alap (téma)'], ['#ef4444', 'Piros'], ['#f97316', 'Narancs'], ['#eab308', 'Sárga'], ['#22c55e', 'Zöld'], ['#06b6d4', 'Türkiz'], ['#3b82f6', 'Kék'], ['#a855f7', 'Lila'], ['#ec4899', 'Rózsaszín']];
    const col = await modal({ title: 'Csoport színe', items: [...COLORS.map(([k, n]) => ({ label: n, value: k || 'none' })), { label: 'Mégse', value: null }] });
    if (col) await save({ collections: list.map((x) => (x.id === c.id ? { ...x, color: col === 'none' ? '' : col } : x)) });
    return;
  }
  if (v === 'rename') {
    const name = await OSK.prompt({ title: 'Gyűjtemény neve', value: c.name });
    if (name && name.trim()) await save({ collections: list.map((x) => (x.id === c.id ? { ...x, name: name.trim() } : x)) });
  } else if (v === 'delete' && await confirmBox('Törlés', `Törlöd a(z) „${c.name}” gyűjteményt? A játékok megmaradnak.`, 'Törlés')) {
    await save({ collections: list.filter((x) => x.id !== c.id) });
  }
}

// ================= Adatlap: további műveletek, telepítés =================
async function moreActions(e) {
  const items = [];
  for (const s of e.sources) {
    const where = s.local ? 'ezen a gépen' : s.hostName;
    if (!s.online) continue;
    if (e.store === 'steam') items.push({ label: `Fájlok ellenőrzése (${where})`, value: `validate|${s.hostId}` });
    if (s.local) items.push({ label: 'Telepítési mappa megnyitása', value: `folder|${s.hostId}` });
    if (e.store !== 'custom') items.push({ label: `Eltávolítás (${where})`, value: `uninstall|${s.hostId}`, kind: 'danger' });
  }
  const steamId = e.store === 'steam' ? e.storeId : e.artFromSteam;
  if (steamId) items.push({ label: 'Áruház oldal megnyitása (böngésző)', value: 'store' });
  items.push({ label: 'Játék beállításai (felbontás, vezérlés, indítási paraméterek)', value: 'prefs', kind: 'primary' });
  items.push({ label: e.hidden ? 'Megjelenítés a könyvtárban' : 'Elrejtés a könyvtárból', value: 'hide' });
  if (e.playSec || e.launches) items.push({ label: 'Játékidő statisztika nullázása', value: 'reset' });
  items.push({ label: 'Mégse', value: null });
  const v = await modal({ title: e.name, items });
  if (v === 'prefs') return gamePrefs(e);
  if (!v) return;
  if (v === 'store') return gamo.openExternal(`https://store.steampowered.com/app/${steamId}`).catch(() => {});
  if (v === 'hide') return toggleHidden(e);
  if (v === 'reset') {
    if (await confirmBox('Nullázás', 'A InariXben mért játékidő és indításszám törlődik.', 'Nullázás')) { await gamo.resetStats(e.key); e.playSec = 0; e.launches = 0; renderDetail(e); }
    return;
  }
  const [action, hostId] = v.split('|');
  if (action === 'uninstall' && !(await confirmBox('Eltávolítás', `Biztosan eltávolítod: ${e.name}?`, 'Eltávolítás'))) return;
  try {
    const r = await gamo.gameAction(e.key, hostId, action);
    toast(r.message || 'Kész', 'ok', 5000);
    const host = hostById(hostId);
    if (r.needsConfirm) {
      if (host && !host.local) { if (await confirmBox('Megerősítés szükséges', 'Az ablak a gaming PC-n nyílt meg. Megnyissam az asztal streamet?', 'Asztal streamelése')) streamDesktop(host); }
      else gamo.hide();
    }
    if (action === 'uninstall') setTimeout(() => loadLibrary(true), 20000);
  } catch (err) { toast(err.message, 'err'); }
}

async function installTo(e, hostId) {
  const host = hostById(hostId);
  try {
    const r = await gamo.install(hostId, { store: e.store, storeId: e.storeId, installId: e.installId || undefined, name: e.name });
    toast(r.message || 'Telepítés elindítva', 'ok', 6000);
    if (r.needsConfirm) {
      if (!host.local) { if (await confirmBox('Megerősítés szükséges', 'A telepítő ablak megnyílt a gaming PC-n. Megnyissam az asztal streamet?', 'Asztal streamelése')) streamDesktop(host); }
      else gamo.hide();
    }
    setTimeout(() => loadLibrary(true), 30000);
  } catch (err) { toast(err.message, 'err'); }
}

// ================= Áruház termékoldal, kívánságlista =================
const inWishlist = (it) => S.state.settings.wishlist.some((w) => w.store === it.store && w.storeId === it.storeId);

async function toggleWish(it) {
  const list = S.state.settings.wishlist;
  const has = inWishlist(it);
  const next = has ? list.filter((w) => !(w.store === it.store && w.storeId === it.storeId))
    : [...list, { store: it.store, storeId: it.storeId, name: it.name, cover: it.cover, coverFallback: it.coverFallback, price: it.price }];
  applyState(await gamo.settings({ wishlist: next }));
  toast(has ? `${it.name} eltávolítva a kívánságlistáról` : `♡ ${it.name} a kívánságlistán`, 'ok', 2200);
  Sound.select();
  if (S.detail && S.detail.item === it) renderStoreDetail(it, S.detail.data);
}

async function openStoreDetail(it) {
  const first = !S.detail;
  S.detail = { key: `store:${it.storeId}`, item: it, data: null };
  renderStoreDetail(it, null);
  $('#detail').classList.remove('hidden');
  if (first) {
    Nav.push(() => $('#detail'), {
      b: () => { Sound.back(); closeDetail(); },
      y: () => { if (S.detail && S.detail.item) toggleWish(S.detail.item); return true; },
      lb: () => true, rb: () => true,
    });
  }
  const d = await gamo.storeDetails(it.storeId).catch((e) => ({ error: e.message }));
  if (S.detail && S.detail.item === it) { S.detail.data = d; renderStoreDetail(it, d); }
}

function renderStoreDetail(it, d) {
  const have = S.lib.games.find((g) => g.key === `${it.store}:${it.storeId}`);
  const target = hostById(S.storeTarget) || hostById('local');
  $('#d-cover').replaceChildren(coverEl(it, 'tile', true));
  $('#d-title').textContent = (d && d.name) || it.name;
  const badges = [h('span', { class: 'badge steam' }, 'Steam áruház')];
  if (it.discount || (d && d.discount)) badges.push(h('span', { class: 'badge disc-b' }, `-${it.discount || d.discount}%`));
  if (inWishlist(it)) badges.push(h('span', { class: 'badge' }, '♡ Kívánságlistán'));
  $('#d-badges').replaceChildren(...badges);
  $('#d-sources').replaceChildren(...(have && have.sources.length
    ? have.sources.map((s) => h('span', { class: `src ${s.online ? 'on' : 'off'}` }, icon(s.local ? 'laptop' : s.online ? 'cloud' : 'cloudOff'), `Telepítve: ${s.hostName}`))
    : [h('span', { class: 'src' }, (d && d.price) || it.price || '')].filter((x) => x.textContent)));
  const acts = [];
  const installed = have && have.sources.length;
  if (installed) acts.push(h('button', { class: 'pill focusable primary big', dataset: { default: '1' }, onclick: () => { closeDetail(); setTab('library'); openDetail(have); } }, icon('play'), 'Ugrás a játékhoz'));
  acts.push(h('button', { class: `pill focusable${installed ? '' : ' primary big'}`, dataset: installed ? {} : { default: '1' }, onclick: () => installTo({ ...it }, target.id) }, icon('download'), `Telepítés: ${target.local ? 'ezen a gépen' : target.name}`));
  for (const x of S.lib.hosts.filter((y) => y.online && y.id !== target.id)) acts.push(h('button', { class: 'pill focusable', onclick: () => installTo({ ...it }, x.id) }, `Telepítés: ${x.local ? 'ezen a gépen' : x.name}`));
  acts.push(h('button', { class: 'pill focusable', onclick: () => toggleWish(it) }, inWishlist(it) ? '♥ Kívánságlistán' : '♡ Kívánságlistára'));
  acts.push(h('button', { class: 'pill focusable', onclick: () => gamo.openExternal(`https://store.steampowered.com/app/${it.storeId}`).catch(() => {}) }, 'Megnyitás böngészőben'));
  $('#d-actions').replaceChildren(...acts);
  $('#d-stats').replaceChildren(
    h('div', { class: 'stat' }, h('div', { class: 'k' }, 'Ár'), h('div', { class: 'v' }, (d && d.price) || it.price || '—')),
    h('div', { class: 'stat' }, h('div', { class: 'k' }, 'Értékelés'), h('div', { class: 'v' }, d && d.reviews ? `${d.reviews.pct}%` : '—')),
    h('div', { class: 'stat' }, h('div', { class: 'k' }, 'Megjelenés'), h('div', { class: 'v' }, (d && d.release) || '—')));
  if (!d) { $('#d-info').replaceChildren(h('div', { class: 'spinner' })); $('#d-shots').replaceChildren(); }
  else renderDetailInfo({ sources: [], store: 'steam' }, d);
  const bg = $('#detail-bg');
  bg.style.backgroundImage = '';
  setBg([`https://cdn.cloudflare.steamstatic.com/steam/apps/${it.storeId}/library_hero.jpg`, d && d.background].filter(Boolean), bg);
  if (!Nav.current() || !$('#detail').contains(Nav.current())) requestAnimationFrame(() => Nav.focusFirst());
}

// ================= Moonlight párosítás (automatikus PIN) =================
async function pairHost(host) {
  if (!host || host.local) return;
  if (!S.state.moonlightPath) {
    if (await confirmBox('Moonlight szükséges', 'A párosításhoz előbb a Moonlight klienst kell telepíteni. Telepítsem most?', 'Telepítés')) await installMoonlight();
    await refreshState();
    if (!S.state.moonlightPath) return;
  }
  toast(`Párosítás: ${host.name}…`, '', 4000);
  try {
    const r = await gamo.autoPair(host.id);
    if (r.ok) { toast(`✓ Párosítva: ${host.name}. Indulhat a streamelés!`, 'ok', 6000); return true; }
    if (r.manual) {
      await modal({
        title: 'Párosító PIN',
        node: h('div', { class: 'pin-box' }, h('div', { class: 'pin' }, r.pin)),
        body: `Írd be ezt a PIN-t a gaming PC-n (${host.name}) a Sunshine webes felületén: https://localhost:47990 → PIN.\n\nTipp: ha a gaming PC InariX beállításaiban megadod a Sunshine felhasználónevet és jelszót, legközelebb ez automatikus lesz.\n(${r.reason})`,
        items: [{ label: 'Kész', value: null }],
      });
    }
  } catch (e) { toast(e.message, 'err', 8000); }
  return false;
}

// ================= Diagnosztika =================
async function showDiagnostics() {
  toast('Ellenőrzés folyamatban…', '', 2500);
  let list = [];
  try { list = await gamo.diagnostics(); } catch (e) { toast(e.message, 'err'); return; }
  const ICON = { ok: '✓', warn: '!', err: '✕', info: 'i' };
  const groups = [...new Set(list.map((x) => x.group))];
  const errs = list.filter((x) => x.status === 'err').length, warns = list.filter((x) => x.status === 'warn').length;
  const node = h('div', { class: 'diag' },
    h('div', { class: `diag-sum ${errs ? 'err' : warns ? 'warn' : 'ok'}` }, errs ? `${errs} hiba, ${warns} figyelmeztetés` : warns ? `Minden működik, ${warns} figyelmeztetés` : 'Minden rendben ✓'),
    groups.map((g) => [h('div', { class: 'set-group' }, g), ...list.filter((x) => x.group === g).map((x) =>
      h('div', { class: `diag-row focusable ${x.status}` }, h('span', { class: 'di' }, ICON[x.status]), h('div', {}, h('b', {}, x.name), h('div', { class: 'k' }, x.detail))))]));
  return modal({ title: 'Diagnosztika', node, wide: true, items: [{ label: 'Újra', value: 'again' }, { label: 'Bezárás', value: null }] })
    .then((v) => (v === 'again' ? showDiagnostics() : null));
}

// ================= Automatikus bejelentkezés (gépindításkor) =================
async function autoLogonGuide() {
  const ls = await gamo.lockState().catch(() => ({}));
  const steps = [
    ls.autoLogon ? '✓ Az automatikus bejelentkezés már be van kapcsolva ezen a gépen.' : null,
    ls.helloOnly ? '1. Kapcsold KI: Beállítások → Fiókok → Bejelentkezési lehetőségek → „A nagyobb biztonság érdekében csak Windows Hello bejelentkezés engedélyezése…”. Enélkül a Windows nem engedi az automatikus bejelentkezést.' : '1. (A „csak Windows Hello” mód nincs bekapcsolva, ez a lépés kimarad.)',
    '2. Töltsd le a Microsoft hivatalos „Autologon” eszközét (Sysinternals), futtasd, és add meg a fiókod jelszavát. Titkosítva tárolja (LSA secret), nem sima szövegként.',
    '   Alternatíva: Win+R → netplwiz → vedd ki a pipát a „Felhasználóknak meg kell adniuk…” elől.',
    '3. Kész: újraindítás után a Windows bejelentkezik, a InariX pedig a háttérben indul.',
    '',
    '⚠ Biztonság: bárki, aki bekapcsolja a gépet, hozzáfér a fiókodhoz. BitLockerrel titkosított meghajtón a lemez adatai továbbra is védettek, ha a gépet ellopják.',
  ].filter((x) => x !== null).join('\n');
  const v = await modal({
    title: 'Automatikus bejelentkezés', body: steps, wide: true,
    items: [
      { label: 'Bejelentkezési beállítások megnyitása', value: 'signin', kind: 'primary' },
      { label: 'Autologon letöltése (böngésző)', value: 'autologon' },
      { label: 'netplwiz megnyitása', value: 'netplwiz' },
      { label: 'Bezárás', value: null },
    ],
  });
  if (v === 'signin') gamo.openSystem('signin').catch((e) => toast(e.message, 'err'));
  else if (v === 'netplwiz') gamo.openSystem('netplwiz').catch((e) => toast(e.message, 'err'));
  else if (v === 'autologon') gamo.openExternal('https://learn.microsoft.com/sysinternals/downloads/autologon').catch(() => {});
}

// ================= Első indítás varázsló =================
async function setupWizard() {
  const role = await modal({
    title: 'Üdv a InariXben! 🎮',
    body: 'Pár lépésben beállítjuk. Mire használod ezt a gépet?',
    items: [
      { label: '💻  Laptop – ezen játszom (stream fogadása, konzol mód)', value: 'client', kind: 'primary' },
      { label: '🖥  Gaming PC – innen streamelem a játékokat', value: 'host' },
      { label: 'Kihagyás, később beállítom', value: 'skip' },
    ],
  });
  if (role === 'host') await setupHost();
  else if (role === 'client') await setupClient();
  applyState(await gamo.settings({ setupDone: true }));
}

async function setupHost() {
  applyState(await gamo.settings({ hostMode: { enabled: true } }));
  toast('Host mód bekapcsolva', 'ok');
  if (await confirmBox('Tűzfal', 'Ahhoz, hogy a laptop megtalálja ezt a gépet, engedélyezni kell a Windows tűzfalban (rendszergazdai jóváhagyást kér).', 'Engedélyezés')) {
    try { await gamo.firewall(); toast('Tűzfal szabályok létrehozva', 'ok'); } catch (e) { toast(e.message, 'err'); }
  }
  const sun = await modal({
    title: 'Moonlight párosítás (opcionális)',
    body: 'A InariX beépített streamjéhez nem kell Sunshine – ezt a lépést nyugodtan kihagyhatod.\n\nHa mégis a Moonlight motort használnád: add meg a Sunshine webes felületének felhasználónevét és jelszavát, így a laptop gombnyomásra párosít. A jelszó csak ezen a gépen tárolódik.',
    items: [{ label: 'Kihagyás (beépített stream)', value: null, kind: 'primary' }, { label: 'Megadom (Moonlight)', value: 'yes' }],
  });
  if (sun === 'yes') {
    const user = await OSK.prompt({ title: 'Sunshine felhasználónév' });
    const pass = user ? await OSK.prompt({ title: 'Sunshine jelszó', password: true }) : null;
    if (user && pass) {
      applyState(await gamo.settings({ hostMode: { sunshineUser: user.trim(), sunshinePass: pass } }));
      try { await gamo.sunshineCheck(); toast('✓ Sunshine bejelentkezés rendben', 'ok'); } catch (e) { toast(`Sunshine: ${e.message}`, 'err', 8000); }
    }
  }
  const hm = S.state.settings.hostMode;
  await modal({ title: 'Kész! Most a laptop jön', node: h('div', { class: 'pin-box' }, h('div', { class: 'k' }, `Gép neve: ${hm.name}`), h('div', { class: 'pin' }, hm.token)),
    body: 'A laptopon indítsd el a InariXet → Gépek → Keresés a hálózaton, és add meg ezt a PIN-t.\n\nEz a gép a Windows-zal együtt, a háttérben fog indulni.', items: [{ label: 'Rendben', value: null }] });
}

async function setupClient() {
  await refreshState();
  if ((S.state.settings.stream.engine || 'builtin') === 'moonlight' && !S.state.moonlightPath) {
    if (await confirmBox('1/3 · Moonlight', 'A játékok képének fogadásához a Moonlight kliens kell. Telepítsem most? (1–2 perc)', 'Telepítés')) await installMoonlight();
  }
  for (;;) {
    toast('Gaming PC keresése a hálózaton…', '', 2500);
    const found = (await gamo.discover().catch(() => [])).filter((f) => !S.state.hosts.some((x) => x.address === f.address));
    const items = found.map((f, i) => ({ label: `${f.name} · ${f.address}`, value: `f${i}`, kind: i === 0 ? 'primary' : '' }));
    items.push({ label: 'Újrakeresés', value: 'again' }, { label: 'Kézi hozzáadás (IP-cím)', value: 'manual' }, { label: 'Kihagyás', value: null });
    const v = await modal({ title: '2/3 · Gaming PC', body: found.length ? 'Ezeket a gépeket találtam. Melyiken futnak a játékaid?' : 'Nem találtam gaming PC-t. Fut rajta a InariX Host módban, és ugyanazon a hálózaton van?', items });
    if (v === 'again') continue;
    if (v === 'manual') { await manualHost(); break; }
    if (v && v.startsWith('f')) {
      const f = found[Number(v.slice(1))];
      const mac = (f.macs || []).find((m) => m.ip === f.address) || (f.macs || [])[0];
      await addHostFlow({ name: f.name, address: f.address, port: f.port, mac: mac ? mac.mac : '' });
    }
    break;
  }
  await refreshState();
  if (S.state.display && S.state.display.isLaptop) {
    const v = await modal({
      title: '3/3 · Konzol mód',
      body: 'Ha külső kijelzőt (TV, monitor) csatlakoztatsz, a InariX automatikusan átvált rá és elindul a konzol – lecsukott fedéllel is.\n\nA „Mindig kész” mód lecsukott fedéllel is ébren tartja a laptopot egy ideig (alapból csak töltőn), így a kijelző bedugására azonnal indul a konzol.',
      items: [{ label: 'Mindig kész mód bekapcsolása', value: 'on', kind: 'primary' }, { label: 'Most nem', value: null }],
    });
    if (v === 'on') applyState(await gamo.settings({ display: { alwaysReady: true } }));
    const lock = await modal({
      title: 'PIN kérése dokkoláskor',
      body: 'Ha bedugod a kijelzőt, a Windows normál esetben PIN-t kér, mielőtt a konzol megjelenne.\n\n„Dokkolva nem kér”: amíg külső kijelzőn vagy (vagy Mindig kész módban), a Windows nem zárol – kihúzás után újra véd a PIN.',
      items: [{ label: 'Dokkolva ne kérjen PIN-t (ajánlott)', value: 'docked', kind: 'primary' }, { label: 'Maradjon a Windows alapbeállítása', value: null }],
    });
    if (lock) applyState(await gamo.settings({ display: { noLockMode: lock } }));
  }
  toast('Beállítás kész. Jó játékot! 🎮', 'ok', 5000);
  loadLibrary(true);
}

// ================= Statisztika, értesítések, kontroller teszt =================
function showStats() {
  const g = S.lib.games;
  const total = g.reduce((n, x) => n + (x.playSec || 0), 0);
  const launches = g.reduce((n, x) => n + (x.launches || 0), 0);
  const top = [...g].filter((x) => x.playSec > 0).sort((a, b) => b.playSec - a.playSec).slice(0, 10);
  const max = top.length ? top[0].playSec : 1;
  const byStore = {};
  for (const x of g.filter((y) => y.sources.length)) byStore[x.store] = (byStore[x.store] || 0) + 1;
  const card = (k, v) => h('div', { class: 'stat' }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v));
  const node = h('div', { class: 'stats' },
    h('div', { class: 'stat-cards' },
      card('Játékidő (stream)', total ? fmtTime(total) : '—'), card('Indítások', String(launches)),
      card('Telepített játék', String(g.filter((x) => x.sources.length).length)), card('Gépek', String(S.lib.hosts.length))),
    h('div', { class: 'set-group' }, 'Legtöbbet játszott'),
    top.length ? h('div', { class: 'toplist' }, top.map((x) => h('div', { class: 'top-row' },
      h('span', { class: 'tn' }, x.name), h('div', { class: 'bar' }, h('div', { class: 'fill', style: `width:${(x.playSec / max) * 100}%` })), h('span', { class: 'tv' }, fmtTime(x.playSec)))))
      : h('div', { class: 'k' }, 'Még nincs mért játékidő. A InariXből indított streamek ideje automatikusan számolódik.'),
    h('div', { class: 'set-group' }, 'Áruházak szerint'),
    h('div', { class: 'k' }, Object.entries(byStore).map(([k, n]) => `${STORE_LABEL[k] || k}: ${n}`).join('  ·  ') || '—'));
  return modal({ title: 'Statisztika', node, wide: true, items: [{ label: 'Bezárás', value: null }] });
}

function showNotes() {
  const node = h('div', { class: 'notes' }, NOTES.length ? NOTES.map((n) => h('div', { class: `note focusable ${n.kind}` },
    h('span', { class: 'nt' }, new Date(n.at).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })), n.msg)) : h('div', { class: 'k' }, 'Nincs értesítés.'));
  return modal({ title: 'Értesítések', node, wide: true, items: [{ label: 'Bezárás', value: null }] });
}

function controllerTester() {
  const names = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Select', 'Start', 'LS', 'RS', '↑', '↓', '←', '→', 'Guide'];
  const btns = names.map((n) => h('div', { class: 'ct-btn' }, n));
  const sticks = [h('div', { class: 'ct-dot' }), h('div', { class: 'ct-dot' })];
  const label = h('div', { class: 'k' }, 'Nincs csatlakoztatott kontroller. Nyomj meg egy gombot rajta.');
  const node = h('div', { class: 'ct' }, label, h('div', { class: 'ct-btns' }, btns),
    h('div', { class: 'ct-sticks' }, sticks.map((d) => h('div', { class: 'ct-stick' }, d))),
    h('button', { class: 'pill focusable', onclick: () => rumble(0.8, 0.8, 400) }, 'Rezgés teszt'));
  let alive = true;
  const loop = () => {
    if (!alive) return;
    const p = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find(Boolean);
    if (p) {
      label.textContent = `${p.id} · mapping: ${p.mapping || 'nem szabványos'} · ${p.buttons.length} gomb, ${p.axes.length} tengely`;
      btns.forEach((b, i) => b.classList.toggle('on', !!(p.buttons[i] && p.buttons[i].pressed)));
      [[0, 1], [2, 3]].forEach(([x, y], i) => { sticks[i].style.transform = `translate(${(p.axes[x] || 0) * 28}px, ${(p.axes[y] || 0) * 28}px)`; });
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  return modal({ title: 'Kontroller teszt', node, wide: true, body: 'A B gomb a modált is bezárja.', items: [{ label: 'Bezárás', value: null }], onClose: () => { alive = false; } });
}

// Játékonkénti beállítások: stream felbontás, vezérlés (kontroller / egér), indítási paraméterek
async function gamePrefs(e) {
  const p = { preset: 'default', input: 'pad', args: '', ...(e.prefs || {}) };
  const PRESETS = [['default', 'Alapértelmezett (Beállítások)'], ['720p60', '720p · 60 fps'], ['1080p60', '1080p · 60 fps'], ['1080p120', '1080p · 120 fps'], ['1440p60', '1440p · 60 fps'], ['4k60', '4K · 60 fps']];
  for (;;) {
    const v = await modal({ title: `${e.name} – beállítások`, items: [
      { label: `Stream felbontás: ${(PRESETS.find(([k]) => k === p.preset) || PRESETS[0])[1]}`, value: 'preset' },
      { label: `Vezérlés: ${p.input === 'mouse' ? 'Egér mód (kontroller = egér és billentyűzet)' : 'Kontroller (a játék kapja)'}`, value: 'input' },
      { label: `Indítási paraméterek: ${p.args || '—'}`, value: 'args' },
      { label: 'Kész', value: null, kind: 'primary' },
    ] });
    if (!v) return;
    if (v === 'preset') { const i = PRESETS.findIndex(([k]) => k === p.preset); p.preset = PRESETS[(i + 1) % PRESETS.length][0]; }
    if (v === 'input') p.input = p.input === 'mouse' ? 'pad' : 'mouse';
    if (v === 'args') { const t = await OSK.prompt({ title: 'Indítási paraméterek (pl. -dx11 -windowed)', value: p.args }); if (t !== null) p.args = t.trim(); }
    await gamo.stat(e.key, { prefs: { ...p } });
    e.prefs = { ...p };
  }
}

// Éjszakai mód (a InariX felületén meleg színszűrő) és alvásidőzítő
function applyNight() { document.body.classList.toggle('night', !!(S.state && S.state.settings.ui.nightMode)); }
function setSleepTimer(min) {
  clearTimeout(S.sleepTimer);
  S.sleepMin = min;
  if (!min) { toast('Alvásidőzítő kikapcsolva'); return; }
  S.sleepTimer = setTimeout(() => { S.sleepMin = 0; toast('Alvásidőzítő: a gép alvó módba lép', '', 4000); setTimeout(() => gamo.sleep(), 4000); }, min * 60000);
  toast(`A gép ${min} perc múlva alvó módba lép`, 'ok');
}
