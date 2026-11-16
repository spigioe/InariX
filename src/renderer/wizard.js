'use strict';
/* global $, h, S, gamo, Nav, Sound, toast, applyState, refreshState, loadLibrary, setTab, addHostFlow, manualHost, adminModeFlow,
   THEME_PRESETS, themePreview, renderSettings */
// Első indítási varázsló: teljes képernyős, lépésenkénti beállítás (kontrollerrel és egérrel).
// Lépések: üdvözlés → a gép szerepe → (gaming PC beállítása) → (gaming PC keresése, konzol mód) → téma → kész.

async function setupWizard() {
  if ($('#wizard')) return;
  await refreshState().catch(() => {});
  return new Promise((resolve) => {
    const root = h('div', { id: 'wizard' });
    document.body.append(root);
    document.body.classList.add('wizard-open');
    const st = { i: 0, role: null, found: null, searching: false, added: [], fw: false };
    const save = async (p) => { try { applyState(await gamo.settings(p)); } catch (e) { toast(e.message, 'err'); } };

    const steps = () => {
      const L = ['welcome', 'role'];
      if (st.role === 'host' || st.role === 'both') L.push('host');
      if (st.role === 'client') L.push('find');
      if ((st.role === 'client' || st.role === 'both') && S.state.display && S.state.display.isLaptop) L.push('console');
      L.push('theme', 'done');
      return L;
    };
    const go = (d) => { const L = steps(); st.i = Math.max(0, Math.min(L.length - 1, st.i + d)); Sound[d > 0 ? 'select' : 'back'](); render(); };
    const finish = async (then) => {
      await save({ setupDone: true });
      Nav.pop(); root.remove(); document.body.classList.remove('wizard-open'); resolve();
      loadLibrary(true);
      if (then) then();
    };

    const btn = (label, onclick, { primary = false, def = false, cls = '' } = {}) =>
      h('button', { class: `wz-btn focusable${primary ? ' primary' : ''} ${cls}`, dataset: def ? { default: '1' } : {}, onclick }, label);
    const card = (icon, title, desc, onclick, { def = false, active = false } = {}) =>
      h('button', { class: `wz-card focusable${active ? ' active' : ''}`, dataset: def ? { default: '1' } : {}, onclick }, h('span', { class: 'wz-ic' }, icon), h('span', { class: 'wz-ct' }, title, h('small', {}, desc)));

    function render() {
      const L = steps();
      const id = L[st.i];
      const dots = h('div', { class: 'wz-dots' }, L.map((_, k) => h('i', { class: k === st.i ? 'on' : k < st.i ? 'done' : '' })));
      let title = '', sub = '', body = null, actions = [];
      if (id === 'welcome') {
        title = 'Üdv az InariX-ben';
        sub = 'Pár lépésben beállítjuk: melyik gép mire való, megkeressük a gaming PC-t, és választunk egy témát.';
        body = h('img', { class: 'wz-logo', src: `../../assets/inarix-logo.svg?t=${Date.now()}`, alt: '' });
        actions = [btn('Kihagyás – később beállítom', () => finish()), btn('Kezdés', () => go(1), { primary: true, def: true })];
      } else if (id === 'role') {
        title = 'Mire használod ezt a gépet?';
        sub = 'Később a Beállításokban bármikor módosítható.';
        const pick = (r) => () => { st.role = r; go(1); };
        body = h('div', { class: 'wz-cards' },
          card('💻', 'Laptop – ezen játszom', 'A játékok képét a gaming PC-ről fogadja; külső kijelzőn automatikus konzol mód', pick('client'), { def: true, active: st.role === 'client' }),
          card('🖥', 'Gaming PC – itt futnak a játékok', 'Host mód: a laptop innen indít játékot és streamel', pick('host'), { active: st.role === 'host' }),
          card('🎮', 'Mindkettő', 'Ezen a gépen játszom, és innen streamelek is más gépekre', pick('both'), { active: st.role === 'both' }));
        actions = [btn('Vissza', () => go(-1))];
      } else if (id === 'host') {
        const hm = S.state.settings.hostMode;
        title = 'Gaming PC beállítása';
        sub = 'A Host mód be van kapcsolva. A laptopon ezzel a PIN-nel tudod párosítani ezt a gépet.';
        body = h('div', { class: 'wz-host' },
          h('div', { class: 'wz-pin' }, h('small', {}, hm.name), h('b', {}, hm.token)),
          h('div', { class: 'wz-list' },
            card(st.fw ? '✓' : '🛡', 'Tűzfal engedélyezése', st.fw ? 'Kész – a laptop eléri ezt a gépet' : 'Hogy a laptop megtalálja és elérje ezt a gépet (rendszergazdai jóváhagyást kér)', async () => {
              try { await gamo.firewall(); st.fw = true; toast('Tűzfal szabályok létrehozva', 'ok'); } catch (e) { toast(e.message, 'err'); }
              render();
            }, { def: true }),
            card('🎮', 'Kontroller driver (ViGEmBus)', 'A stream kontrollereihez kell – a letöltési oldal a böngészőben nyílik meg', () => gamo.openExternal('https://github.com/nefarius/ViGEmBus/releases').catch(() => {})),
            card('⚙', 'Rendszergazdai mód (nem kötelező)', 'Admin jogot kérő játékokhoz: az UAC ablak a streamben is jóváhagyható', () => adminModeFlow())));
        actions = [btn('Vissza', () => go(-1)), btn('Tovább', () => go(1), { primary: true })];
      } else if (id === 'find') {
        title = 'A gaming PC megkeresése';
        sub = 'A gaming PC-n fusson az InariX Host módban, ugyanazon a hálózaton.';
        if (st.found === null && !st.searching) search();
        const list = (st.found || []).map((f) => {
          const done = st.added.includes(f.address) || S.state.hosts.some((x) => x.address === f.address);
          return card(done ? '✓' : '🖥', f.name, done ? `${f.address} · párosítva` : `${f.address} · kiválasztás és PIN megadása`, async () => {
            if (done) return;
            const mac = (f.macs || []).find((m) => m.ip === f.address) || (f.macs || [])[0];
            await addHostFlow({ name: f.name, address: f.address, port: f.port, mac: mac ? mac.mac : '' });
            await refreshState();
            if (S.state.hosts.some((x) => x.address === f.address)) st.added.push(f.address);
            render();
          }, { def: !done });
        });
        body = h('div', { class: 'wz-list' },
          st.searching ? h('div', { class: 'wz-wait' }, h('i', { class: 'spinner' }), 'Keresés a hálózaton…') : null,
          !st.searching && st.found && !st.found.length ? h('div', { class: 'wz-wait' }, 'Nem találtam gaming PC-t. Fut rajta az InariX Host módban? Kézzel, IP-címmel is hozzáadható.') : null,
          ...list,
          h('div', { class: 'wz-row' }, btn('Újrakeresés', () => { st.found = null; render(); }), btn('Kézi hozzáadás (IP-cím)', async () => { await manualHost(); await refreshState(); render(); })));
        actions = [btn('Vissza', () => go(-1)), btn(S.state.hosts.length ? 'Tovább' : 'Kihagyás', () => go(1), { primary: true })];
      } else if (id === 'console') {
        const d = S.state.settings.display;
        title = 'Konzol mód a laptopon';
        sub = 'Ha külső kijelzőt (TV, monitor) csatlakoztatsz, az InariX átvált rá, és elindul a konzol – lecsukott fedéllel is.';
        body = h('div', { class: 'wz-list' },
          card(d.alwaysReady ? '✓' : '○', `Mindig kész mód: ${d.alwaysReady ? 'bekapcsolva' : 'kikapcsolva'}`, 'Lecsukott fedéllel is ébren tart egy ideig (alapból csak töltőn), így a kijelző bedugására azonnal indul', async () => { await save({ display: { alwaysReady: !d.alwaysReady } }); render(); }, { def: true }),
          card(d.noLockMode === 'docked' ? '✓' : '○', `PIN dokkoláskor: ${d.noLockMode === 'docked' ? 'nem kér' : 'a Windows alapbeállítása'}`, 'Amíg külső kijelzőn vagy, a Windows nem zárol; kihúzás után újra véd a PIN', async () => { await save({ display: { noLockMode: d.noLockMode === 'docked' ? 'off' : 'docked' } }); render(); }));
        actions = [btn('Vissza', () => go(-1)), btn('Tovább', () => go(1), { primary: true })];
      } else if (id === 'theme') {
        title = 'Válassz témát';
        sub = 'A színek és formák később a Témakezelőben tovább alakíthatók.';
        const cur = S.state.settings.ui.theme || 'aurora';
        body = h('div', { class: 'wz-themes' }, THEME_PRESETS.slice(0, 8).map((t) => {
          const b = h('button', { class: `wz-theme focusable${t.id === cur ? ' active' : ''}`, dataset: t.id === cur ? { default: '1' } : {}, onclick: async () => { await save({ ui: { theme: t.id } }); render(); } },
            typeof themePreview === 'function' ? themePreview(t) : null, h('span', {}, t.name));
          return b;
        }));
        actions = [btn('Vissza', () => go(-1)), btn('Tovább', () => go(1), { primary: true })];
      } else if (id === 'done') {
        title = 'Minden kész!';
        const parts = [];
        if (st.role === 'host' || st.role === 'both') parts.push(`Host mód bekapcsolva · PIN: ${S.state.settings.hostMode.token}`);
        if (S.state.hosts.length) parts.push(`Gaming PC: ${S.state.hosts.map((x) => x.name).join(', ')}`);
        sub = parts.join('  ·  ') || 'Jó játékot!';
        body = h('div', { class: 'wz-list' },
          card('⛁', 'Játékfiókok csatlakoztatása', 'Steam, Epic, GOG, Microsoft Store, Ubisoft – a nem telepített játékaid is megjelennek', () => finish(() => { S.setCat = 'accounts'; setTab('settings'); })));
        actions = [btn('Vissza', () => go(-1)), btn('Indulás', () => finish(), { primary: true, def: true })];
      }
      root.replaceChildren(h('div', { class: 'wz-inner' }, dots, h('h1', {}, title), h('p', { class: 'wz-sub' }, sub), h('div', { class: 'wz-body' }, body), h('div', { class: 'wz-actions' }, actions)));
      requestAnimationFrame(() => Nav.focusFirst());
    }

    async function search() {
      st.searching = true;
      render();
      try { st.found = await gamo.discover(); } catch { st.found = []; }
      st.searching = false;
      render();
    }

    const swallow = () => true;
    Nav.push(() => root, { b: () => { if (st.i > 0) go(-1); return true; }, start: swallow, guide: swallow, select: swallow, lb: swallow, rb: swallow, x: swallow, y: swallow });
    render();
  });
}
