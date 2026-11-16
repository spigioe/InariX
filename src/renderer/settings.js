'use strict';
/* global $, h, S, gamo, Nav, OSK, Sound, toast, modal, confirmBox, renderRows, rowCycle, applyState, refreshState, loadLibrary, setTab, Browser,
   STORE_LABEL, STORE_COLOR, fmtTime, showStats, collectionMenu, currentThemeName, openThemeManager, playBoot, controllerTester, autoLogonGuide,
   streamSelfTest, installMoonlight, adminModeFlow, addCustomGame, showDiagnostics, setupWizard, showHelp, showLog */
// Beállítások: kétoszlopos, kategóriás felület (bal: kategóriák, jobb: a kategória beállításai) – mint a konzolokon.

function settingsHandlers() {
  const inPane = () => { const c = Nav.current(); return c && c.closest('.set-pane'); };
  const toCat = () => { const b = $(`.set-cat[data-cat="${S.setCat}"]`); if (b) Nav.focus(b); return true; };
  return {
    left: () => { if (!inPane()) return false; if (rowCycle(-1, renderSettings)) return true; return toCat(); },
    right: () => {
      const c = Nav.current();
      if (c && c.closest('.set-nav')) { const f = $('.set-pane .set-rows .focusable'); if (f) Nav.focus(f); return true; }
      return rowCycle(1, renderSettings);
    },
    b: () => { if (!inPane()) return false; Sound.back(); return toCat(); },
  };
}

async function save(partial) {
  try { applyState(await gamo.settings(partial)); } catch (e) { toast(e.message, 'err'); }
  if (S.tab === 'settings') renderSettings();
}

// ---------------- Fiókok (könyvtár szinkron) ----------------
const ACCOUNT_STORES = ['steam', 'epic', 'gog', 'msstore', 'ubisoft'];
const ACCOUNT_DESC = {
  steam: 'Bejelentkezés a Steam oldalán (vagy Steam Web API kulccsal)',
  epic: 'A teljes Epic könyvtár, az ingyenes játékokkal együtt',
  gog: 'Minden GOG.com-on megvásárolt játék',
  msstore: 'Microsoft fiók: az Xbox appban / Microsoft Store-ban játszott PC játékok',
  ubisoft: 'A Ubisoft Connect fiókod játékai',
};
const sinceText = (at) => {
  const m = Math.round((Date.now() - at) / 60000);
  return m < 1 ? 'épp most' : m < 60 ? `${m} perce` : m < 1440 ? `${Math.floor(m / 60)} órája` : `${Math.floor(m / 1440)} napja`;
};
const accState = (p) => (S.state.settings.sync && S.state.settings.sync[p]) || {};
const steamApiOnly = (p) => p === 'steam' && !accState(p).connected && !!S.state.settings.account.steamApiKey;
// A gaming PC(-k)n csatlakoztatott fiók (a host /api/accounts végpontjából, a könyvtár betöltésekor)
const remoteAcc = (p) => {
  for (const hst of S.lib.hosts || []) { const a = hst.accounts && hst.accounts[p]; if (!hst.local && a && a.connected) return { host: hst, a }; }
  return null;
};
const remoteHostsWithAccounts = () => (S.lib.hosts || []).filter((hst) => !hst.local && hst.online && hst.accounts && Object.values(hst.accounts).some((a) => a && a.connected));

function accountRow(p) {
  const a = accState(p);
  const linked = a.connected || steamApiOnly(p);
  const r = !linked ? remoteAcc(p) : null;
  if (r) {
    return {
      type: 'action', icon: { color: STORE_COLOR[p], text: STORE_LABEL[p].charAt(0) }, label: STORE_LABEL[p], cls: 'linked',
      desc: r.a.error ? `⚠ ${r.host.name}: ${r.a.error}` : `A(z) ${r.host.name} gépen bejelentkezve – a játékai itt is látszanak${r.host.online ? '' : ' (a gép most nem elérhető)'}`,
      value: () => (S.syncing && (S.syncing[p] || S.syncing['*']) ? 'Szinkronizálás…' : `${r.a.user || 'Bejelentkezve'} · ${r.a.count || 0} játék`),
      run: () => accountMenu(p),
    };
  }
  const busy = S.syncing && (S.syncing[p] || S.syncing['*']);
  const status = busy ? 'Szinkronizálás…'
    : linked ? `${a.user || (a.connected ? 'Csatlakoztatva' : 'API kulcs')} · ${a.count || 0} játék${a.enabled === false ? ' · elrejtve' : ''}`
      : 'Csatlakoztatás ›';
  return {
    type: 'action', icon: { color: STORE_COLOR[p], text: STORE_LABEL[p].charAt(0) }, label: STORE_LABEL[p], cls: linked ? 'linked' : '',
    desc: a.error ? `⚠ ${a.error}` : a.at && linked ? `Utolsó szinkron: ${sinceText(a.at)}` : ACCOUNT_DESC[p],
    value: () => status, run: () => accountMenu(p),
  };
}

async function accountMenu(p) {
  const s = S.state.settings;
  const a = accState(p);
  const r = !a.connected && !steamApiOnly(p) ? remoteAcc(p) : null;
  if (r) {
    const v = await modal({
      title: STORE_LABEL[p],
      body: `A(z) ${r.host.name} gépen bejelentkezve: ${r.a.user || '—'}
${r.a.count || 0} játék · utolsó szinkron: ${r.a.at ? sinceText(r.a.at) : '—'}

A fiók a gaming PC-n van csatlakoztatva, a játéklistája innen is látszik.`,
      items: [{ label: `Szinkronizálás a(z) ${r.host.name} gépen`, value: 'rsync', kind: 'primary' }, { label: 'Csatlakoztatás ezen a gépen is', value: 'login' }, { label: 'Mégse', value: null }],
    });
    if (v === 'rsync') syncAccount(p, r.host.id);
    else if (v === 'login') connectAccount(p);
    return;
  }
  if (!a.connected && !steamApiOnly(p)) return connectAccount(p);
  const items = [
    { label: 'Szinkronizálás most', value: 'sync', kind: 'primary' },
    { label: a.enabled === false ? 'Megjelenítés a könyvtárban' : 'Elrejtés a könyvtárból (a fiók csatlakoztatva marad)', value: 'toggle' },
  ];
  if (p === 'steam') items.push({ label: `Steam Web API kulcs: ${s.account.steamApiKey ? 'megadva' : 'nincs megadva'} (achievementekhez)`, value: 'key' });
  items.push(a.connected ? { label: 'Fiók leválasztása', value: 'disconnect', kind: 'danger' } : { label: 'Bejelentkezés', value: 'login' });
  items.push({ label: 'Mégse', value: null });
  const body = a.connected
    ? `Bejelentkezve: ${a.user || '—'}\n${a.count || 0} játék · utolsó szinkron: ${a.at ? sinceText(a.at) : '—'}${a.error ? `\n⚠ ${a.error}` : ''}`
    : 'Steam Web API kulccsal csatlakoztatva.';
  const v = await modal({ title: STORE_LABEL[p], body, items });
  if (v === 'sync') syncAccount(p);
  else if (v === 'toggle') { await save({ sync: { [p]: { enabled: a.enabled === false } } }); loadLibrary(false); }
  else if (v === 'login') connectAccount(p);
  else if (v === 'key') {
    const k = await OSK.prompt({ title: 'Steam Web API kulcs (steamcommunity.com/dev/apikey)', value: s.account.steamApiKey || '', password: true });
    if (k !== null) await save({ account: { steamApiKey: k.trim() } });
  } else if (v === 'disconnect' && await confirmBox('Fiók leválasztása',
    `A(z) ${STORE_LABEL[p]} fiók hozzáférése törlődik erről a gépről, a nem telepített játékai eltűnnek a könyvtárból. A telepített játékok maradnak.`, 'Leválasztás')) {
    try { applyState(await gamo.accountDisconnect(p)); } catch (e) { toast(e.message, 'err'); }
    renderSettings();
    loadLibrary(false);
  }
}

async function syncAccount(p, hostId) {
  const k = p || '*';
  S.syncing = { ...(S.syncing || {}), [k]: true };
  if (S.tab === 'settings') renderSettings();
  try {
    if (hostId) await gamo.accountSyncRemote(hostId, p);
    else {
      // helyi fiókok + minden elérhető gaming PC fiókjai
      const jobs = [gamo.accountSync(p).then(applyState)];
      if (!p) for (const hst of remoteHostsWithAccounts()) jobs.push(gamo.accountSyncRemote(hst.id, null).catch((e) => toast(`${hst.name}: ${e.message}`, 'err')));
      await Promise.all(jobs);
    }
    await loadLibrary(true);
  } catch (e) { toast(e.message, 'err'); }
  delete S.syncing[k];
  if (S.tab === 'settings') renderSettings();
  loadLibrary(false);
}

async function connectAccount(p) {
  if (p === 'msstore') return deviceLogin(p);
  const ext = p === 'epic' || p === 'gog';
  const items = [{ label: 'Bejelentkezés itt, a beépített böngészőben', value: 'inapp', kind: 'primary' }];
  if (ext) items.push({ label: 'Bejelentkezés az asztali böngészőben (kód beillesztésével)', value: 'ext' });
  items.push({ label: 'Mégse', value: null });
  const v = await modal({
    title: `${STORE_LABEL[p]} csatlakoztatása`,
    body: `Lépj be a(z) ${STORE_LABEL[p]} fiókodba – sikeres belépés után a InariX magától visszalép ide, és letölti a játéklistádat.\n\n`
      + 'Kontrollerrel: bal kar = kurzor, Ⓐ = kattintás, Ⓧ = gépelés a kijelölt mezőbe.\n\n'
      + 'Tipp: a Google / Facebook / Xbox gombos belépést a szolgáltatók beágyazott böngészőben gyakran letiltják („nem biztonságos böngésző”). Használd az e-mail + jelszót'
      + (ext ? ', vagy az asztali böngészős belépést.' : '.')
      + '\n\nA jelszavadat a InariX nem tárolja: csak a platform hozzáférési tokenjét, titkosítva, ezen a gépen.',
    items,
  });
  if (v === 'ext') return externalLogin(p);
  if (v !== 'inapp') return;
  try {
    const { url } = await gamo.accountConnect(p);
    S.loginStore = p;
    Browser.navigate(url);
    Browser.setBanner(`${STORE_LABEL[p]} bejelentkezés – lépj be a fiókodba (megszakítás: ≡ menü)`);
  } catch (e) { toast(e.message, 'err'); }
}

// Microsoft: eszközkód (mint Xboxon) – a kódot telefonon vagy bármely böngészőben kell beírni
async function deviceLogin(p) {
  let info;
  try { info = await gamo.accountDevice(p); } catch (e) { toast(e.message, 'err'); return; }
  S.loginStore = p;
  const node = h('div', { class: 'device-code' },
    h('div', { class: 'dc-step' }, '1. Nyisd meg telefonon vagy számítógépen:'),
    h('div', { class: 'dc-url' }, info.url.replace(/^https?:\/\/(www\.)?/, '')),
    h('div', { class: 'dc-step' }, '2. Írd be ezt a kódot, és jelentkezz be a Microsoft fiókoddal:'),
    h('div', { class: 'dc-code' }, info.code),
    h('div', { class: 'dc-wait' }, h('i', { class: 'spinner' }), `Várakozás a bejelentkezésre… (a kód ${Math.round(info.expires / 60)} percig érvényes)`));
  S.deviceModal = true;
  const v = await modal({ title: 'Microsoft fiók csatlakoztatása', node, items: [{ label: 'Megnyitás ezen a gépen', value: 'open' }, { label: 'Mégse', value: null }], noDefault: true });
  S.deviceModal = false;
  if (v === 'open') { gamo.openExternal(info.url); toast(`Kód: ${info.code} – a bejelentkezés után a InariX magától folytatja`, 'ok', 15000); return; }
  if (S.loginStore === p && !S.deviceDone) cancelLogin();
  S.deviceDone = false;
}

async function externalLogin(p) {
  try { await gamo.accountExternal(p); } catch (e) { toast(e.message, 'err'); return; }
  const hint = p === 'epic'
    ? 'Az asztali böngészőben megnyílt az Epic bejelentkezés. Belépés után egy rövid szöveges oldal jelenik meg – másold ki az „authorizationCode” utáni kódot (vagy az egész oldalt), és illeszd be ide (Ctrl+V).'
    : 'Az asztali böngészőben megnyílt a GOG bejelentkezés. Belépés után egy üres oldalra jutsz – másold ki a címsorból a teljes címet (benne van a kód), és illeszd be ide (Ctrl+V).';
  const ok = await modal({ title: `${STORE_LABEL[p]} – kód beillesztése`, body: hint, items: [{ label: 'Kód beillesztése', value: true, kind: 'primary' }, { label: 'Mégse', value: false }] });
  if (!ok) return;
  const text = await OSK.prompt({ title: `${STORE_LABEL[p]} kód vagy cím (Ctrl+V)` });
  if (!text) return;
  try { await gamo.accountCode(p, text); } catch (e) { toast(e.message, 'err', 9000); }
}

async function cancelLogin() {
  S.loginStore = null;
  Browser.setBanner(null);
  await gamo.accountCancel().catch(() => {});
}

function onAccountDone(r) {
  S.loginStore = null;
  Browser.setBanner(null);
  if (S.deviceModal) { S.deviceDone = true; const m = $('#modal-layer .menu-item:last-child'); if (m) m.click(); }
  if (!r.ok) { toast(`${STORE_LABEL[r.store]}: ${r.error || 'a bejelentkezés nem sikerült'}`, 'err', 8000); return; }
  toast(`✓ ${STORE_LABEL[r.store]} csatlakoztatva${r.user ? ` (${r.user})` : ''} – játéklista letöltése…`, 'ok', 6000);
  Browser.closePage();
  S.setCat = 'accounts';
  setTab('settings', { silent: true });
}

function initAccountEvents() {
  S.syncing = {};
  gamo.on('account:done', onAccountDone);
  gamo.on('accounts', (sync) => { if (S.state) { S.state.settings.sync = sync; if (S.tab === 'settings') renderSettings(); } });
  gamo.on('accounts:syncing', ({ store, on }) => {
    if (on) S.syncing[store] = true; else delete S.syncing[store];
    if (S.tab === 'settings') renderSettings();
  });
  gamo.on('accounts:synced', ({ store, count, error }) => {
    if (error) toast(`${STORE_LABEL[store]} szinkron: ${error}`, 'err', 7000);
    else toast(`${STORE_LABEL[store]}: ${count} játék a könyvtárban`, 'ok', 3500);
    loadLibrary(false);
  });
}

// ---------------- Kategóriák ----------------
function settingsCategories() {
  const st = S.state; const s = st.settings; const d = s.display; const hm = s.hostMode; const ds = st.display || {}; const L = s.library;
  const hiddenCount = S.lib.games.filter((g) => g.hidden).length;
  const totalPlay = S.lib.games.reduce((n, g) => n + (g.playSec || 0), 0);
  const moon = (s.stream.engine || 'builtin') === 'moonlight';
  const linked = ACCOUNT_STORES.filter((p) => accState(p).connected || steamApiOnly(p) || remoteAcc(p)).length;
  const dispState = `${ds.isLaptop ? 'Laptop' : 'Asztali gép'} · külső kijelző: ${ds.external ? 'igen' : 'nem'}`;
  return [
    { id: 'accounts', icon: '⛁', title: 'Fiókok és könyvtár', sub: linked ? `${linked} fiók csatlakoztatva` : 'Steam, Epic, GOG, Microsoft Store, Ubisoft', rows: [
      { group: 'Játékplatform fiókok' },
      { type: 'note', label: 'A csatlakoztatott fiókok összes játéka megjelenik a könyvtárban – a nem telepítettek is, telepítés gombbal. A könyvtár tetején platform szerint szűrhetsz.' },
      ...ACCOUNT_STORES.map(accountRow),
      { type: 'action', label: 'Minden fiók szinkronizálása most', value: () => (S.syncing && S.syncing['*'] ? 'Folyamatban…' : '⟳'), run: () => syncAccount(null) },
      { group: 'Könyvtár' },
      { type: 'toggle', label: 'Nem telepített játékok mutatása', desc: 'A fiókjaidban lévő, de egyik gépen sem telepített játékok is látszanak', get: () => L.showOwned, set: (v) => ({ library: { showOwned: v } }), after: () => loadLibrary(true) },
      { type: 'select', label: 'Rendezés', options: [['recent', 'Legutóbb játszott'], ['name', 'Név szerint'], ['playtime', 'Játékidő szerint']], get: () => L.sort, set: (v) => ({ library: { sort: v } }) },
      { type: 'toggle', label: 'Sorok gépenként', desc: 'Külön sor minden gép játékainak', get: () => L.groupByHost, set: (v) => ({ library: { groupByHost: v } }) },
      { type: 'toggle', label: 'Helyi indítás előnyben', desc: 'Ha a játék a laptopon és a gaming PC-n is megvan, a laptopon induljon', get: () => L.preferLocal, set: (v) => ({ library: { preferLocal: v } }) },
      { type: 'toggle', label: `Rejtett játékok megjelenítése (${hiddenCount})`, get: () => L.showHidden, set: (v) => ({ library: { showHidden: v } }) },
      { type: 'action', label: 'Statisztika', value: () => (totalPlay ? `${fmtTime(totalPlay)} összesen` : '—'), run: () => showStats() },
      ...s.collections.map((c) => ({ type: 'action', label: `▤ ${c.name}`, value: () => `${c.keys.length} játék`, run: () => collectionMenu(c) })),
    ] },

    { id: 'look', icon: '◐', title: 'Megjelenés és hang', sub: `Téma: ${currentThemeName()}`, rows: [
      { group: 'Téma' },
      { type: 'action', label: 'Témakezelő', desc: 'Beépített (Xbox, PS5…) és saját témák: színek, háttér, betűtípus, csempék', value: () => currentThemeName(), run: () => openThemeManager() },
      { type: 'select', label: 'Felület mérete', options: [[85, '85%'], [100, '100%'], [115, '115%'], [130, '130%'], [150, '150%']], get: () => s.ui.scale, set: (v) => ({ ui: { scale: Number(v) } }) },
      { type: 'text', label: 'Időjárás a felső sávban – város', desc: 'Üresen hagyva nem jelenik meg (adatforrás: Open-Meteo)', get: () => s.ui.weatherCity || '', set: (v) => ({ ui: { weatherCity: v.trim() } }), after: () => { if (typeof updateTopInfo === 'function') updateTopInfo(); } },
      { type: 'toggle', label: 'Dátum a felső sávban', get: () => s.ui.showDate !== false, set: (v) => ({ ui: { showDate: v } }), after: () => { if (typeof updateTopInfo === 'function') updateTopInfo(); } },
      { type: 'select', label: 'Dinamikus háttér (játék előzetes)', desc: 'A kijelölt játék előzetese a kezdőképernyő hátterében, néhány másodperc után', options: [['quiet', 'Be, halk hanggal'], ['muted', 'Be, hang nélkül'], ['off', 'Ki']], get: () => s.ui.bgVideo || 'quiet', set: (v) => ({ ui: { bgVideo: v } }) },
      { type: 'toggle', label: 'Csökkentett mozgás', desc: 'Animációk és áttűnések kikapcsolása', get: () => s.ui.reduceMotion, set: (v) => ({ ui: { reduceMotion: v } }) },
      { group: 'Hang és visszajelzés' },
      { type: 'toggle', label: 'Hangok', get: () => s.ui.sounds, set: (v) => ({ ui: { sounds: v } }) },
      { type: 'toggle', label: 'Kontroller rezgés', desc: 'Rövid rezgés kiválasztáskor (ha a kontroller támogatja)', get: () => s.ui.rumble, set: (v) => ({ ui: { rumble: v } }) },
      { type: 'toggle', label: 'Értesítés, ha egy gép elérhetővé válik', get: () => s.ui.hostNotify, set: (v) => ({ ui: { hostNotify: v } }) },
      { group: 'Indulás és tétlenség' },
      { type: 'toggle', label: 'Boot animáció', get: () => s.ui.bootAnimation, set: (v) => ({ ui: { bootAnimation: v } }) },
      { type: 'action', label: 'Boot animáció lejátszása', run: () => playBoot() },
      { type: 'select', label: 'Képernyővédő', options: [[0, 'Kikapcsolva'], [2, '2 perc'], [5, '5 perc'], [10, '10 perc'], [30, '30 perc']], get: () => s.ui.screensaverMin, set: (v) => ({ ui: { screensaverMin: Number(v) } }) },
      { type: 'action', label: 'Kontroller teszt', run: () => controllerTester() },
    ] },

    { id: 'display', icon: '▭', title: 'Kijelző és energia', sub: dispState, rows: [
      { type: 'info', label: 'Állapot', value: () => `${dispState} · fedél: ${{ open: 'nyitva', closed: 'lecsukva' }[ds.lid] || 'n/a'}` },
      { group: 'Külső kijelző' },
      { type: 'toggle', label: 'Konzol mód külső kijelzőn', desc: 'Kijelző csatlakoztatásakor boot animációval indul a konzol', get: () => d.autoConsole, set: (v) => ({ display: { autoConsole: v } }) },
      { type: 'select', label: 'Kijelző mód csatlakoztatáskor', options: [['external', 'Csak külső'], ['clone', 'Tükrözés'], ['extend', 'Kiterjesztés'], ['none', 'Ne változtasson']], get: () => d.topology, set: (v) => ({ display: { topology: v } }) },
      { type: 'action', label: 'Váltás most: csak külső kijelző', run: () => gamo.topology('external') },
      { type: 'action', label: 'Váltás most: csak laptop kijelző', run: () => gamo.topology('internal') },
      { group: 'Fedél és alvás' },
      { type: 'toggle', label: 'Lecsukott fedél ne altasson külső kijelzővel', desc: 'Amíg külső kijelző van csatlakoztatva', get: () => d.keepAwakeOnLid, set: (v) => ({ display: { keepAwakeOnLid: v } }) },
      { type: 'toggle', label: 'Mindig kész mód', desc: 'Lecsukva is ébren marad egy ideig, így a kijelző bedugására azonnal indul', get: () => d.alwaysReady, set: (v) => ({ display: { alwaysReady: v } }) },
      ...(d.alwaysReady ? [
        { type: 'select', label: '   Ébren tartás ideje', options: [[5, '5 perc'], [15, '15 perc'], [30, '30 perc'], [60, '1 óra'], [180, '3 óra'], [720, '12 óra']], get: () => d.alwaysReadyMinutes, set: (v) => ({ display: { alwaysReadyMinutes: Number(v) } }) },
        { type: 'toggle', label: '   Csak töltőn', desc: 'Akkumulátorról a szokásos módon alszik', get: () => d.alwaysReadyOnlyAC, set: (v) => ({ display: { alwaysReadyOnlyAC: v } }) },
      ] : []),
      { type: 'toggle', label: 'Kihúzáskor lecsukott fedéllel alvás', get: () => d.sleepOnUndock, set: (v) => ({ display: { sleepOnUndock: v } }) },
      { type: 'toggle', label: 'Kihúzáskor konzol elrejtése', get: () => d.hideOnUndock, set: (v) => ({ display: { hideOnUndock: v } }) },
      { group: 'Zárolás' },
      { type: 'select', label: 'PIN / jelszó kérése', desc: '„Dokkolva”: útközben véd a PIN, otthon nem kell feloldani · „Amíg fut”: kilépéskor visszaáll',
        options: [['off', 'Mindig kér (Windows alap)'], ['docked', 'Dokkolva nem kér (ajánlott)'], ['running', 'Amíg a InariX fut, nem kér'], ['always', 'Soha nem kér']],
        get: () => d.noLockMode || (d.disableLockOnWake ? 'always' : 'off'),
        set: (v) => ({ display: { noLockMode: v, disableLockOnWake: false } }),
        after: (v) => { if (v === 'always') toast('Figyelem: így bárki, aki felnyitja a laptopot, belép a fiókodba.', 'err', 7000); } },
      { type: 'action', label: 'Automatikus bejelentkezés gépindításkor', desc: 'Újraindítás után se kelljen PIN – útmutató', run: () => autoLogonGuide() },
    ] },

    { id: 'stream', icon: '▶', title: 'Streaming', sub: moon ? 'Moonlight + Sunshine' : 'Beépített InariX stream', rows: [
      { type: 'select', label: 'Stream motor', desc: 'Beépített: nem kell hozzá Sunshine és Moonlight (a gaming PC-n InariX Host mód kell)',
        options: [['builtin', 'Beépített (InariX)'], ['moonlight', 'Moonlight + Sunshine']], get: () => s.stream.engine || 'builtin', set: (v) => ({ stream: { engine: v } }) },
      { group: 'Kép' },
      { type: 'select', label: 'Felbontás és képfrissítés', options: [['auto', 'Automatikus'], ['720p60', '720p · 60 fps'], ['1080p60', '1080p · 60 fps'], ['1080p120', '1080p · 120 fps'], ['1440p60', '1440p · 60 fps'], ['1440p120', '1440p · 120 fps'], ['4k60', '4K · 60 fps']], get: () => s.stream.preset, set: (v) => ({ stream: { preset: v } }) },
      { type: 'select', label: 'Bitráta', desc: 'Wi-Fin 20–40 Mbps az ajánlott, kábelen több is lehet', options: [[0, 'Automatikus'], [10, '10 Mbps'], [20, '20 Mbps'], [40, '40 Mbps'], [60, '60 Mbps'], [80, '80 Mbps'], [150, '150 Mbps']], get: () => s.stream.bitrate, set: (v) => ({ stream: { bitrate: Number(v) } }) },
      { type: 'select', label: 'Videó kodek', desc: 'Automatikus: AV1 > HEVC > H.264 – a leghatékonyabb, amit mindkét gép hardveresen tud (jobb kép ugyanakkora bitrátán)', options: [['auto', 'Automatikus'], ['H.264', 'H.264'], ['HEVC', 'HEVC (H.265)'], ['AV1', 'AV1']], get: () => s.stream.codec, set: (v) => ({ stream: { codec: v } }) },
      { type: 'toggle', label: 'Mikrofon átvitele a gaming PC-re', desc: 'Hangcsevegéshez. A gaming PC-n telepítsd a VB-CABLE-t (ingyenes virtuális hangkábel), és a játékban / Discordban a „CABLE Output” legyen a mikrofon', get: () => !!s.stream.mic, set: (v) => ({ stream: { mic: v } }) },
      { group: 'Kényelem' },
      { type: 'toggle', label: 'Gyenge Wi-Fi figyelmeztetés', desc: 'Stream indításakor szól, ha a jelerősség 50% alatt van', get: () => s.stream.wifiWarn, set: (v) => ({ stream: { wifiWarn: v } }) },
      { type: 'select', label: 'Gaming PC altatása stream után', desc: 'Ha addig nem indul új stream', options: [[0, 'Soha'], [5, '5 perc'], [15, '15 perc'], [30, '30 perc'], [60, '1 óra']], get: () => s.stream.hostSleepAfter, set: (v) => ({ stream: { hostSleepAfter: Number(v) } }) },
      { type: 'action', label: 'Stream teszt ezen a gépen', desc: 'A saját képernyőt streameli önmagának', run: () => streamSelfTest() },
      ...(moon ? [
        { group: 'Moonlight' },
        { type: 'action', label: 'Moonlight kliens', value: () => (st.moonlightPath ? 'Telepítve · A: megnyitás' : 'Nincs telepítve · A: telepítés'), run: () => (st.moonlightPath ? gamo.moonlightGui() : installMoonlight()) },
        { type: 'toggle', label: 'V-Sync', desc: 'Kikapcsolva kisebb a késleltetés, de lehet képtörés', get: () => s.stream.vsync, set: (v) => ({ stream: { vsync: v } }) },
        { type: 'toggle', label: 'HDR', desc: 'Csak HDR-képes kijelzőn és gaming PC-n', get: () => s.stream.hdr, set: (v) => ({ stream: { hdr: v } }) },
        { type: 'toggle', label: 'Teljesítmény overlay', get: () => s.stream.overlay, set: (v) => ({ stream: { overlay: v } }) },
        { type: 'text', label: 'Streamelt Sunshine alkalmazás', desc: 'Alap: Desktop', get: () => s.moonlight.app, set: (v) => ({ moonlight: { app: v || 'Desktop' } }) },
        { type: 'text', label: 'Moonlight extra paraméterek', get: () => s.moonlight.args, set: (v) => ({ moonlight: { args: v } }) },
        { type: 'text', label: 'Moonlight.exe útvonal (opcionális)', get: () => s.moonlight.path, set: (v) => ({ moonlight: { path: v } }) },
      ] : []),
    ] },

    { id: 'host', icon: '⌂', title: 'Gaming PC (Host mód)', sub: hm.enabled ? `Bekapcsolva${st.hostRunning ? ' · fut' : ''}` : 'Kikapcsolva – csak a gaming PC-n kell', rows: [
      { type: 'toggle', label: 'Host mód', desc: `Azon a gépen kapcsold be, amelyiken a játékok futnak – a laptop innen indít és streamel (port ${hm.port})`, get: () => hm.enabled, set: (v) => ({ hostMode: { enabled: v } }) },
      ...(hm.enabled ? [
        { type: 'text', label: 'Gép neve', get: () => hm.name, set: (v) => ({ hostMode: { name: v } }) },
        { type: 'action', label: 'PIN (kliens párosításhoz)', value: () => hm.token, mono: true, run: async () => { if (await confirmBox('Új PIN', 'A régi PIN-nel párosított kliensek nem fognak tudni csatlakozni.', 'Új PIN')) { await gamo.newHostToken(); await refreshState(); renderSettings(); } } },
        { type: 'toggle', label: 'Beépített stream engedélyezése', desc: 'Képernyő, hang, billentyűzet, egér, kontroller – Sunshine nélkül', get: () => hm.allowStream !== false, set: (v) => ({ hostMode: { allowStream: v } }) },
        { type: 'action', label: 'Rendszergazdai mód', desc: 'Admin jogot kérő játékok: az UAC ablak a streamben is jóváhagyható', value: () => (hm.adminMode ? 'Bekapcsolva' : 'Kikapcsolva'), run: () => adminModeFlow() },
        { type: 'action', label: 'Tűzfal engedélyezése', desc: 'Hogy a laptop megtalálja és elérje ezt a gépet (rendszergazdai jóváhagyás)', run: async () => { await gamo.firewall(); toast('Tűzfal szabályok létrehozva', 'ok'); } },
        { type: 'action', label: 'Távoli elérés VPN-nel', desc: 'Játék otthonon kívülről is (Tailscale / ZeroTier / WireGuard) – súgó', value: () => '?', run: () => vpnHelp() },
        { group: 'Egyedi játékok' },
        { type: 'action', label: 'Egyedi játék hozzáadása (.exe)', run: addCustomGame },
        ...hm.customGames.map((g, i) => ({ type: 'action', label: `• ${g.name}`, value: () => g.exe, run: async () => {
          if (await confirmBox(g.name, `${g.exe}\n\nEltávolítod a listából?`, 'Eltávolítás')) { await save({ hostMode: { customGames: hm.customGames.filter((_, j) => j !== i) } }); loadLibrary(true); }
        } })),
        { group: 'Moonlight kompatibilitás (opcionális)' },
        { type: 'text', label: 'Sunshine felhasználónév', desc: 'Automatikus Moonlight párosításhoz', get: () => hm.sunshineUser, set: (v) => ({ hostMode: { sunshineUser: v.trim() } }) },
        { type: 'text', label: 'Sunshine jelszó', password: true, get: () => hm.sunshinePass, set: (v) => ({ hostMode: { sunshinePass: v } }) },
        { type: 'action', label: 'Sunshine bejelentkezés ellenőrzése', run: async () => { await gamo.sunshineCheck(); toast('✓ Sunshine bejelentkezés rendben', 'ok'); } },
        { type: 'text', label: 'Steam Web API kulcs (klienseknek)', desc: 'A kliensek Áruház → „Saját, nem telepített” listájához', get: () => hm.steamApiKey, set: (v) => ({ hostMode: { steamApiKey: v.trim() } }), password: true },
      ] : []),
    ] },

    { id: 'system', icon: '⚙', title: 'Rendszer', sub: S.update ? `Frissítés elérhető: ${S.update.build}` : `InariX ${st.version}`, rows: [
      S.update
        ? { type: 'action', label: `Frissítés elérhető (${S.update.build})`, desc: `A(z) ${S.update.hostName} gépről · jelenlegi: ${S.update.current}`, value: () => 'Telepítés ›', cls: 'linked', run: () => installUpdateFlow() }
        : { type: 'action', label: 'Frissítések keresése', desc: 'Automatikusan is: indításkor és 5 percenként, ha nincs stream', run: async () => { const i = await gamo.updateCheck(); S.update = i; toast(i ? `Új verzió: ${i.build}` : 'A InariX naprakész (vagy a gaming PC frissítő szervere nem fut)', i ? 'ok' : ''); renderSettings(); } },
      { type: 'toggle', label: 'Indítás a Windows-zal (háttérben)', desc: 'Szükséges az automatikus konzol módhoz és a Host módhoz', get: () => s.autostart, set: (v) => ({ autostart: v }) },
      { type: 'action', label: 'Frissítési napló', desc: 'Az utolsó frissítés lépései', run: () => showUpdateLog('Frissítési napló') },
      { type: 'action', label: 'Diagnosztika', desc: 'Minden részegység ellenőrzése (kijelző, fedél, gépek, tűzfal)', run: () => showDiagnostics() },
      { type: 'action', label: 'Első beállítás varázsló', run: () => setupWizard() },
      { type: 'action', label: 'Billentyűzet és kontroller súgó', run: showHelp },
      { type: 'action', label: 'Napló', run: showLog },
      { type: 'info', label: 'Verzió', value: () => `InariX ${st.version}` },
      { type: 'action', label: 'Kilépés a InariXből', danger: true, run: async () => { if (await confirmBox('Kilépés', 'Bezárod a InariXet?', 'Kilépés')) gamo.quit(); } },
    ] },
  ];
}

function renderSettings() {
  const root = $('#settings-list');
  const cats = settingsCategories();
  if (!cats.some((c) => c.id === S.setCat)) S.setCat = cats[0].id;
  let nav = root.querySelector('.set-nav');
  let pane = root.querySelector('.set-pane');
  if (!nav) {
    root.replaceChildren(nav = h('div', { class: 'set-nav' }), pane = h('div', { class: 'set-pane' },
      h('div', { class: 'set-head' }, h('h2', {}), h('div', { class: 'set-sub' })), h('div', { class: 'set-rows' })));
  }
  const cur = Nav.current();
  const navFocus = cur && nav.contains(cur) ? cur.dataset.cat : null;
  const fill = (c) => {
    pane.querySelector('h2').textContent = `${c.icon}  ${c.title}`;
    pane.querySelector('.set-sub').textContent = c.sub || '';
    renderRows(pane.querySelector('.set-rows'), c.rows, renderSettings);
  };
  nav.replaceChildren(...cats.map((c) => {
    const b = h('button', { class: `set-cat focusable${c.id === S.setCat ? ' active' : ''}`, dataset: { cat: c.id, default: c.id === S.setCat ? '1' : '0' } },
      h('span', { class: 'ci' }, c.icon), h('span', { class: 'ct' }, c.title, h('small', {}, c.sub || '')));
    b.addEventListener('navfocus', () => {
      if (S.setCat === c.id) return;
      S.setCat = c.id;
      nav.querySelectorAll('.set-cat').forEach((x) => x.classList.toggle('active', x.dataset.cat === c.id));
      pane.querySelector('.set-rows').scrollTop = 0;
      fill(settingsCategories().find((x) => x.id === c.id));
    });
    b.addEventListener('click', () => { const f = pane.querySelector('.set-rows .focusable'); if (f) Nav.focus(f); });
    return b;
  }));
  if (navFocus) { const b = nav.querySelector(`[data-cat="${navFocus}"]`); if (b) Nav.focus(b, { silent: true, scroll: false }); }
  fill(cats.find((c) => c.id === S.setCat));
}

function vpnHelp() {
  const body = `A InariX helyi hálózatra készült, de VPN-en át otthonon kívülről is működik, ha a két gép egy virtuális hálózatban van. Ajánlott: Tailscale (ingyenes, nem kell routert állítani).

1. Telepítsd a Tailscale-t a gaming PC-re és a laptopra (tailscale.com), és jelentkezz be mindkettőn ugyanazzal a fiókkal.
2. A gaming PC-n: Beállítások → Gaming PC → Tűzfal engedélyezése (újra, ha korábban már megnyomtad) – így a VPN-es címekről is fogadja a kapcsolatot.
3. A Tailscale alkalmazásban nézd meg a gaming PC címét (100.x.x.x).
4. A laptopon: Gépek → Kézi hozzáadás (IP) → add meg ezt a címet, majd a PIN-t.

Tudnivalók:
• A hálózati keresés és a távoli ébresztés (Wake-on-LAN) VPN-en nem működik – a gaming PC legyen ébren.
• Otthonon kívül a feltöltési sebesség a szűk keresztmetszet: 20 Mbps feltöltés alatt állíts 10–15 Mbps bitrátát és 720p-t (Beállítások → Streaming).
• A sima VPN szolgáltatások (NordVPN, ProtonVPN stb.) nem jók erre: azok nem kötik össze a két gépet.
• ZeroTier és saját WireGuard is működik, ha a gépek kölcsönösen elérik egymást.`;
  return modal({ title: 'Távoli elérés VPN-nel', wide: true, body, items: [{ label: 'Rendben', value: null }] });
}

async function installUpdateFlow() {
  if (!S.update) return;
  // 1) letöltés – a design rendszerbe illeszkedő, folyamatjelzős ablakban
  const fmtMB = (b) => `${(b / 1048576).toFixed(1)} MB`;
  const node = h('div', { class: 'upd-box' },
    h('div', { class: 'upd-ver' }, h('span', {}, S.update.current || '—'), h('b', {}, '→'), h('span', { class: 'upd-new' }, S.update.build)),
    h('div', { class: 'upd-bar' }, h('i', { id: 'upd-fill' })),
    h('div', { class: 'upd-txt', id: 'upd-txt' }, `Letöltés innen: ${S.update.hostName || 'GitHub'}…`));
  let cancelled = false;
  const dl = modal({ title: 'InariX frissítés letöltése', node, items: [{ label: 'Mégse', value: 'cancel' }], noDefault: true });
  dl.then((v) => { if (v === 'cancel' || v === null) { cancelled = true; gamo.updateCancel().catch(() => {}); } });
  S.onUpdateProgress = (p) => {
    const f = $('#upd-fill'), t = $('#upd-txt');
    if (!f || !t) return;
    const pct = p.total ? Math.min(100, Math.round((p.received / p.total) * 100)) : 0;
    f.style.width = `${pct}%`;
    t.textContent = p.total ? `${fmtMB(p.received)} / ${fmtMB(p.total)} · ${pct}%` : fmtMB(p.received);
  };
  try { await gamo.updateDownload(); }
  catch (e) { S.onUpdateProgress = null; if (!cancelled) { closeModal(); toast(`A letöltés nem sikerült: ${e.message}`, 'err', 9000); } return; }
  S.onUpdateProgress = null;
  if (cancelled) return;
  closeModal();
  // 2) manuális jóváhagyás az újraindításhoz
  const ok = await confirmBox('Frissítés telepítése', `Az InariX ${S.update.build} letöltve. Újraindítod a programot a frissítés telepítéséhez? A frissítő leállítja az InariX-et, telepít, majd jelzi az eredményt.`, 'Újraindítás és telepítés');
  if (!ok) { toast('A letöltött frissítés később is telepíthető: Beállítások → Rendszer', '', 6000); return; }
  try { await gamo.updateApply(); toast('A frissítő átvette – az InariX most leáll…', 'ok', 8000); }
  catch (e) { toast(`A frissítő nem indult: ${e.message}`, 'err', 10000); }
}
const closeModal = () => { const b = $('#modal-layer .menu-item:last-child'); if (b && !$('#modal-layer').classList.contains('hidden')) b.click(); };

// A frissítő napló élő megjelenítése (a InariX a frissítés közben bezárul – utána újraindulva jelzi az eredményt)
async function showUpdateLog(title, live = false) {
  let timer = null;
  const p = modal({ title, body: await gamo.updateLog(), log: true, wide: true, items: [{ label: 'Bezárás', value: null }], onClose: () => clearInterval(timer) });
  if (live) timer = setInterval(async () => { const b = $('#modal-layer .body'); if (b) { b.textContent = await gamo.updateLog(); b.scrollTop = b.scrollHeight; } }, 700);
  return p;
}

function initUpdateEvents() {
  gamo.on('update-progress', (p) => { if (S.onUpdateProgress) S.onUpdateProgress(p); });
  gamo.updateState().then((i) => { S.update = i; }).catch(() => {});
  gamo.on('update-result', (r) => {
    S.update = null;
    if (r.ok) toast(`✓ Frissítve: ${r.build}`, 'ok', 8000);
    else { toast(`A frissítés nem sikerült (${r.build}) – napló: Beállítások → Rendszer`, 'err', 12000); showUpdateLog('A frissítés nem sikerült – napló'); }
  });
  gamo.on('update', (i) => {
    S.update = i;
    toast(`Új InariX verzió érhető el (${i.build}) – Beállítások → Rendszer → Telepítés`, 'ok', 9000);
    if (S.tab === 'settings') renderSettings();
  });
}
