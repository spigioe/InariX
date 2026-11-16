'use strict';
// Gyors öntesztek: npm test
const assert = require('assert');
const http = require('http');
const { parseVdf } = require('../src/core/util');
const { createAgent } = require('../src/core/agent-server');
const { agentRequest, discover } = require('../src/core/net');
const { splitArgs } = require('../src/main/moonlight');

let passed = 0, failed = 0;
async function t(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n      ${e.message}`); }
}

(async () => {
  console.log('InariX öntesztek\n');

  await t('VDF parser: libraryfolders', () => {
    const v = parseVdf('"libraryfolders"\n{\n "0"\n {\n  "path"  "C:\\\\Program Files (x86)\\\\Steam"\n  "apps" { "242760" "123" }\n }\n "1" { "path" "D:\\\\SteamLibrary" }\n}');
    assert.strictEqual(v.libraryfolders['0'].path, 'C:\\Program Files (x86)\\Steam');
    assert.strictEqual(v.libraryfolders['1'].path, 'D:\\SteamLibrary');
    assert.strictEqual(v.libraryfolders['0'].apps['242760'], '123');
  });

  await t('VDF parser: appmanifest', () => {
    const v = parseVdf('"AppState"\n{\n\t"appid"\t\t"570"\n\t"name"\t\t"Dota \\"2\\""\n\t"StateFlags"\t\t"4"\n}');
    assert.strictEqual(v.AppState.appid, '570');
    assert.strictEqual(v.AppState.name, 'Dota "2"');
  });

  await t('Moonlight paraméter bontás', () => {
    assert.deepStrictEqual(splitArgs('--resolution 1920x1080 --fps 60 "--x y"'), ['--resolution', '1920x1080', '--fps', '60', '--x y']);
    assert.deepStrictEqual(splitArgs(''), []);
  });

  await t('powercfg kimenet feldolgozás (angol és magyar Windows)', () => {
    const { parseIndex } = require('../src/main/power');
    const en = `Power Scheme GUID: 381b4222-f694-41f0-9685-ff5bb260df2e  (Balanced)
  Subgroup GUID: 4f971e89-eebd-4455-a8de-9e59040e7347  (Power buttons and lid)
    Power Setting GUID: 5ca83367-6e45-459f-a27b-476b1d01c936  (Lid close action)
      Possible Setting Index: 000
      Possible Setting Friendly Name: Do nothing
      Possible Setting Index: 001
      Possible Setting Friendly Name: Sleep
    Current AC Power Setting Index: 0x00000001
    Current DC Power Setting Index: 0x00000002
`;
    assert.deepStrictEqual(parseIndex(en), { ac: 1, dc: 2 });
    const hu = `Energiaséma GUID: 381b4222-f694-41f0-9685-ff5bb260df2e  (Kiegyensúlyozott)
  Alcsoport GUID: 4f971e89-eebd-4455-a8de-9e59040e7347  (Főkapcsoló és fedél)
    Energiabeállítás GUID: 5ca83367-6e45-459f-a27b-476b1d01c936  (Fedél lecsukása)
      Lehetséges beállítási index: 000
      Lehetséges beállítás rövid neve: Semmi
    Aktuális hálózati energiaellátási beállítás indexe: 0x00000000\r
    Aktuális akkumulátoros energiaellátási beállítás indexe: 0x00000001\r
`;
    assert.deepStrictEqual(parseIndex(hu), { ac: 0, dc: 1 });
    assert.strictEqual(parseIndex('Power Scheme GUID: x  (Ultimate)\n  GUID Alias: SCHEME_MIN\n'), null);
  });

  await t('Konfig összefésülés (merge)', () => {
    // a config modul Electron nélkül is betölthető
    const { merge } = require('../src/main/config');
    const m = merge({ a: { b: 1, c: 2 }, l: [1, 2] }, { a: { c: 3 }, l: [9] });
    assert.deepStrictEqual(m, { a: { b: 1, c: 3 }, l: [9] });
  });

  await t('Konfig: BOM-os fájl beolvasása, sérült fájl mentése', () => {
    const fs = require('fs'); const os = require('os'); const path = require('path');
    const { Config } = require('../src/main/config');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtx-'));
    fs.writeFileSync(path.join(dir, 'config.json'), '﻿{"hosts":[{"id":"x","name":"PC"}]}');
    assert.strictEqual(new Config(dir).get().hosts[0].name, 'PC');
    fs.writeFileSync(path.join(dir, 'config.json'), '{rossz json');
    new Config(dir);
    assert.ok(fs.existsSync(path.join(dir, 'config.json.bak')));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const cfg = { name: 'TestHost', port: 47899, token: '424242', customGames: [] };
  const agent = createAgent(() => cfg, () => {});
  await agent.start();
  const host = { address: '127.0.0.1', port: 47899, token: '424242' };

  await t('Agent: /api/info PIN nélkül elérhető', async () => {
    const r = await agentRequest({ ...host, token: '' }, 'GET', '/api/info');
    assert.strictEqual(r.name, 'TestHost');
  });

  await t('Agent: hibás PIN elutasítva', async () => {
    await assert.rejects(agentRequest({ ...host, token: 'rossz' }, 'GET', '/api/games'), /PIN/);
  });

  await t('Agent: játéklista helyes PIN-nel', async () => {
    const r = await agentRequest(host, 'GET', '/api/games', null, 30000);
    assert.ok(Array.isArray(r.games));
    console.log(`      (${r.games.length} játék: ${r.games.slice(0, 4).map((g) => g.name).join(', ')}${r.games.length > 4 ? '…' : ''})`);
  });

  await t('Agent: ismeretlen játék indítása 404', async () => {
    await assert.rejects(agentRequest(host, 'POST', '/api/launch', { id: 'steam:0' }), /nem található/);
  });

  await t('Agent: Sunshine állapot az /api/auth válaszban', async () => {
    const r = await agentRequest(host, 'GET', '/api/auth');
    assert.ok(r.sunshine && typeof r.sunshine.running === 'boolean');
    console.log(`      (Sunshine telepítve: ${r.sunshine.installed}, fut: ${r.sunshine.running})`);
  });

  await t('Hálózati felderítés (UDP broadcast)', async () => {
    const found = await discover(1200);
    assert.ok(found.some((f) => f.name === 'TestHost'), `nem található, talált: ${JSON.stringify(found.map((f) => f.name))}`);
  });

  await t('Elérhetetlen gép: időtúllépés vagy hiba', async () => {
    await assert.rejects(agentRequest({ address: '127.0.0.1', port: 1, token: 'x' }, 'GET', '/api/games', null, 1500));
  });

  await t('Agent: beépített stream önálló agentnél nem elérhető (501), PIN nélkül 401', async () => {
    await assert.rejects(agentRequest(host, 'POST', '/api/stream/offer', { sdp: 'v=0' }), /nem érhető el a beépített stream/);
    await assert.rejects(agentRequest({ ...host, token: 'x' }, 'POST', '/api/stream/offer', { sdp: 'v=0' }), /PIN/);
    const i = await agentRequest(host, 'GET', '/api/auth');
    assert.strictEqual(i.stream.available, false);
  });

  await t('Agent: stream szolgáltatóval az ajánlat továbbítódik, a kliens címe átadódik', async () => {
    const calls = [];
    const a2 = createAgent(() => ({ ...cfg, port: 47898 }), () => {}, { stream: {
      offer: async (b, client) => { calls.push([b.sdp, client]); return { sdp: 'v=0 answer', vigem: true }; },
      stop: () => calls.push(['stop']), status: () => ({ available: true, vigem: true, active: false }),
    } });
    await a2.start();
    try {
      const h2 = { ...host, port: 47898 };
      const r = await agentRequest(h2, 'POST', '/api/stream/offer', { sdp: 'v=0 offer', width: 1920 });
      assert.strictEqual(r.sdp, 'v=0 answer');
      assert.strictEqual(calls[0][0], 'v=0 offer');
      assert.ok(/127\.0\.0\.1/.test(calls[0][1]));
      await agentRequest(h2, 'POST', '/api/stream/stop', {});
      assert.deepStrictEqual(calls[1], ['stop']);
      assert.strictEqual((await agentRequest(h2, 'GET', '/api/auth')).stream.available, true);
    } finally { await a2.stop(); }
  });

  await t('Fiókok: a host fiókjai és nem telepített játékai a kliens könyvtárában is megjelennek', async () => {
    const fs = require('fs'); const os = require('os'); const path = require('path');
    const { Library } = require('../src/main/library');
    const syncCalls = [];
    const status = { epic: { enabled: true, connected: true, user: 'HostUser', count: 2, at: Date.now(), error: '' }, gog: { enabled: true, connected: false } };
    const a4 = createAgent(() => ({ ...cfg, port: 47897 }), () => {}, { accounts: {
      status: () => status,
      owned: () => [
        { store: 'epic', storeId: 'Fortnite', name: 'Fortnite', cover: 'https://x/fn.jpg', installId: 'fn:abc:Fortnite' },
        { store: 'epic', storeId: 'TestOnlyGame', name: 'InariX Teszt Játék' },
      ],
      sync: async (store) => { syncCalls.push(store); return status; },
    } });
    await a4.start();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtx-'));
    try {
      const h4 = { id: 'h4', name: 'Gaming PC', address: '127.0.0.1', port: 47897, token: '424242' };
      const conf = { hosts: [h4], hostMode: { customGames: [] }, library: { showOwned: true }, account: {} };
      const lib = new Library(dir, () => conf, () => {});
      lib.resolveArt = async () => {}; // ne menjen ki a netre borítóért
      const r = await lib.build(false);
      const fn = r.games.find((g) => g.key === 'epic:Fortnite');
      assert.ok(fn && fn.owned && fn.sources.length === 0, 'a host fiókjának játéka nem telepítettként megjelenik');
      assert.strictEqual(fn.installId, 'fn:abc:Fortnite');
      assert.strictEqual(r.hosts.find((x) => x.id === 'h4').accounts.epic.user, 'HostUser');
      const st = await agentRequest(h4, 'POST', '/api/accounts/sync', { store: 'epic' });
      assert.strictEqual(st.status.epic.connected, true);
      assert.deepStrictEqual(syncCalls, ['epic']);
      // offline host: a gyorsítótárból továbbra is látszanak a játékai és a fiók állapota
      await a4.stop();
      const r2 = await lib.build(false);
      assert.ok(r2.games.some((g) => g.key === 'epic:TestOnlyGame'));
      assert.strictEqual(r2.hosts.find((x) => x.id === 'h4').accounts.epic.connected, true);
      // kikapcsolt "nem telepített" opciónál nem jelennek meg
      conf.library.showOwned = false;
      assert.ok(!(await lib.build(false)).games.some((g) => g.key === 'epic:TestOnlyGame'));
    } finally { await a4.stop().catch(() => {}); fs.rmSync(dir, { recursive: true, force: true }); }
  });

  await t('Fiókok: régi host (fiók szinkron nélkül) üres listát ad, a szinkron 501', async () => {
    const r = await agentRequest(host, 'GET', '/api/accounts');
    assert.deepStrictEqual(r, { status: {}, games: [] });
    await assert.rejects(agentRequest(host, 'POST', '/api/accounts/sync', {}), /nincs fiók szinkron/);
  });

  await t('Billentyű → scancode tábla (WASD, nyilak kiterjesztett, F1–F12)', () => {
    // a stream-host Electron nélkül csak a KEYMAP miatt töltődik be: az electron modult kicseréljük
    const Module = require('module');
    const orig = Module._load;
    Module._load = function (req, ...rest) { return req === 'electron' ? {} : orig.call(this, req, ...rest); };
    const { KEYMAP } = require('../src/main/stream-host');
    Module._load = orig;
    assert.deepStrictEqual([KEYMAP.KeyW[0], KEYMAP.KeyA[0], KEYMAP.KeyS[0], KEYMAP.KeyD[0]], [0x11, 0x1E, 0x1F, 0x20]);
    assert.deepStrictEqual(KEYMAP.ArrowUp, [0x48, 1]);
    assert.deepStrictEqual(KEYMAP.ControlRight, [0x1D, 1]);
    for (let n = 1; n <= 12; n++) assert.ok(KEYMAP[`F${n}`], `F${n}`);
  });

  await t('Stream szabályozó: torlódásnál előbb bitráta (60%-ig), aztán fps (min. 30), végül bitráta; javuláskor vissza', () => {
    const fs = require('fs'); const vm = require('vm'); const path = require('path');
    const ctx = {};
    vm.runInNewContext(`${fs.readFileSync(path.join(__dirname, '..', 'src', 'stream', 'rtc-common.js'), 'utf8')}\nthis.RTC = RTC;`, ctx);
    const rc = ctx.RTC.rateController(60, 20000, 0);
    let now = 0;
    const step = (bad) => { now += 500; if (bad) rc.congestion++; return rc.tick(now); };
    const fpsSeen = [];
    for (let i = 0; i < 12; i++) { step(true); fpsSeen.push(rc.fps); }
    assert.ok(fpsSeen.every((f) => f >= 30), `30 alá ment: ${fpsSeen}`);
    assert.strictEqual(rc.fps, 30, 'tartós torlódásnál 30 fps-en kell állnia');
    assert.ok(rc.q < 1 && rc.q >= 0.25, `a minőségnek kellett csökkennie 30 fps-nél (q=${rc.q})`);
    assert.strictEqual(fpsSeen[0], 60, 'az első lépésben még az fps marad (csak a bitráta csökken)');
    const lowKbps = rc.kbps();
    for (let i = 0; i < 80; i++) step(false);
    assert.strictEqual(rc.q, 1, 'javuláskor a minőség visszaáll');
    assert.strictEqual(rc.fps, 60, 'javuláskor az fps visszaáll 60-ra');
    assert.ok(rc.kbps() > lowKbps && rc.kbps() === 20000);
  });

  await t('UDP videó: 5% csomagvesztés mellett is minden kocka bájtra pontosan megérkezik (FEC + NACK)', async () => {
    const crypto = require('crypto');
    const { UdpVideoSender, UdpVideoReceiver } = require('../src/core/udp-video');
    const tx = new UdpVideoSender({ port: 47897 });
    await tx.start();
    const realSend = tx.sock.send.bind(tx.sock);
    let dropped = 0;
    tx.sock.send = (buf, ...rest) => { if (Math.random() < 0.05) { dropped++; return; } return realSend(buf, ...rest); };
    const rx = new UdpVideoReceiver();
    const got = [];
    rx.onFrame = (f) => got.push(f);
    await rx.start('127.0.0.1', tx.credentials());
    await new Promise((r) => setTimeout(r, 300)); // HELLO
    const sent = [];
    for (let i = 0; i < 120; i++) {
      const size = i % 30 === 0 ? 150000 : 3000 + Math.floor(Math.random() * 40000); // időnként nagy "kulcskocka"
      const data = crypto.randomBytes(size);
      sent.push(data);
      tx.sendFrame(data, i % 30 === 0, i * 16666);
      await new Promise((r) => setTimeout(r, 8));
    }
    await new Promise((r) => setTimeout(r, 800));
    rx.close(); tx.close();
    const ok = got.filter((f, k) => f.data.equals(sent[k])).length;
    console.log(`      (eldobott csomag: ${dropped}, FEC javítás: ${rx.stats.fecFixed}, újrakérés: ${rx.stats.nacks}, átadott kocka: ${got.length}/120, egyező: ${ok}, elveszett: ${rx.stats.lost})`);
    assert.ok(dropped > 20, 'a teszt nem dobott elég csomagot');
    assert.strictEqual(got.length, 120, 'nem érkezett meg minden kocka');
    assert.strictEqual(ok, 120, 'tartalmi eltérés');
    assert.ok(rx.stats.fecFixed > 0, 'a FEC nem javított semmit');
  });

  await t('Futó játék felismerése és "Kilépés a játékból" (csak a játék mappájának folyamatai)', async () => {
    const fs = require('fs'); const os = require('os'); const path = require('path'); const { spawn } = require('child_process');
    const { runningGames, quitGame, gameProcesses } = require('../src/core/launcher');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtx-game-'));
    const exe = path.join(dir, 'FakeGame.exe');
    fs.copyFileSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'PING.EXE'), exe);
    const p = spawn(exe, ['-n', '60', '127.0.0.1'], { stdio: 'ignore', windowsHide: true });
    const game = { id: 'steam:999', name: 'Fake', store: 'steam', installDir: dir };
    try {
      await new Promise((r) => setTimeout(r, 800));
      const run = await runningGames([game, { id: 'steam:1', name: 'Másik', store: 'steam', installDir: 'C:\\Nincs\\Ilyen' }]);
      assert.strictEqual(run.length, 1, `futónak kell lennie: ${JSON.stringify(run)}`);
      assert.ok(run[0].pids.includes(p.pid));
      // biztonság: meghajtó gyökér sosem illeszkedik
      assert.strictEqual(gameProcesses({ store: 'steam', installDir: 'C:\\' }, [{ pid: 1, exe: 'C:\\Windows\\explorer.exe' }]).length, 0);
      const q = await quitGame(game);
      assert.ok(q.ok && q.killed >= 1, JSON.stringify(q));
      assert.strictEqual((await runningGames([game])).length, 0);
    } finally {
      try { p.kill(); } catch { /* már leállt */ }
      await new Promise((r) => setTimeout(r, 300));
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  await t('Agent: már futó játék indításakor nem indít újra (folytatás)', async () => {
    const fs = require('fs'); const os = require('os'); const path = require('path'); const { spawn } = require('child_process');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtx-game-'));
    const exe = path.join(dir, 'FakeGame2.exe');
    fs.copyFileSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'PING.EXE'), exe);
    const p = spawn(exe, ['-n', '60', '127.0.0.1'], { stdio: 'ignore', windowsHide: true });
    const c3 = { ...cfg, port: 47896, customGames: [{ id: 'fake', name: 'Fake2', exe }] };
    const a3 = createAgent(() => c3, () => {});
    await a3.start();
    try {
      await new Promise((r) => setTimeout(r, 800));
      const h3 = { ...host, port: 47896 };
      const r = await agentRequest(h3, 'POST', '/api/launch', { id: 'custom:fake' }, 15000);
      assert.strictEqual(r.alreadyRunning, true);
      const run = await agentRequest(h3, 'GET', '/api/running', null, 15000);
      assert.ok(run.running.some((x) => x.id === 'custom:fake'));
      const q = await agentRequest(h3, 'POST', '/api/quit', { id: 'custom:fake' }, 20000);
      assert.ok(q.ok, JSON.stringify(q));
    } finally {
      await a3.stop();
      try { p.kill(); } catch { /* már leállt */ }
      await new Promise((r) => setTimeout(r, 300));
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  await t('Steam appinfo.vdf: indítási módok olvasása (több mód → közvetlen indítás, VR mód kerülése)', async () => {
    const fs = require('fs'); const path = require('path');
    const { findSteamPath } = require('../src/core/scanner');
    const { readAppInfo, launchConfigs, directLaunchFor } = require('../src/core/steam-appinfo');
    const steam = await findSteamPath();
    const file = steam && path.join(steam, 'appcache', 'appinfo.vdf');
    if (!file || !fs.existsSync(file)) { console.log('      (nincs Steam – kihagyva)'); return; }
    const local = (await require('../src/core/scanner').scanSteam());
    const info = readAppInfo(file, local.map((g) => g.storeId));
    assert.ok(Object.keys(info).length > 0, 'egyetlen telepített játék adata sem olvasható');
    for (const g of local) {
      const cfgs = launchConfigs(info[g.storeId]);
      const d = directLaunchFor(steam, g.storeId, g.installDir);
      console.log(`      (${g.name}: ${cfgs.length} indítási mód → ${d ? `közvetlen: ${path.basename(d.exe)}` : 'Steam URL'})`);
      if (cfgs.length >= 2) { assert.ok(d, 'több módnál közvetlen indítás kell'); assert.ok(!/vr/i.test(path.basename(d.exe)) || cfgs.every((c) => /vr/i.test(c.type || '')), 'VR módot választott'); }
      else assert.strictEqual(d, null);
    }
  });

  await t('Agent: párosítás érvénytelen PIN-nel elutasítva', async () => {
    await assert.rejects(agentRequest(host, 'POST', '/api/pair', { pin: '12' }), /Érvénytelen PIN/);
  });

  await t('Agent: párosítás Sunshine jelszó nélkül → NOCREDS', async () => {
    await assert.rejects(agentRequest(host, 'POST', '/api/pair', { pin: '1234' }), /NOCREDS/);
  });

  await t('Sunshine API: hibás jelszó felismerése (ha fut helyben Sunshine)', async () => {
    const { checkCreds } = require('../src/core/sunshine');
    try {
      await checkCreds({ user: 'inarix-selftest', pass: 'rossz-jelszo' });
      throw new Error('elfogadta a hibás jelszót');
    } catch (e) {
      assert.ok(/Hibás Sunshine|nem fut|nem válaszol/.test(e.message), e.message);
      console.log(`      (${e.message})`);
    }
  });

  await t('Könyvtár: helyi + offline gép mentett listája összefésülve', async () => {
    const fs = require('fs'); const os = require('os'); const path = require('path');
    const { Library } = require('../src/main/library');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtx-lib-'));
    const local = await require('../src/core/scanner').scanAll();
    const shared = local[0];
    fs.writeFileSync(path.join(dir, 'library-cache.json'), JSON.stringify({ hosts: { off: { at: 1, games: [
      { id: 'steam:1091500', store: 'steam', storeId: '1091500', name: 'Cyberpunk 2077', cover: 'x' },
      ...(shared ? [{ ...shared }] : []),
    ] } } }));
    fs.writeFileSync(path.join(dir, 'meta-cache.json'), JSON.stringify({ steamIds: Object.fromEntries(local.map((g) => [g.id, null])), details: {} }));
    const cfg = { hosts: [{ id: 'off', name: 'Offline PC', address: '127.0.0.1', port: 1, token: 'x' }], hostMode: { customGames: [] }, library: { showOwned: false }, account: {} };
    const lib = new Library(dir, () => cfg, () => {});
    const r = await lib.build(false);
    const cp = r.games.find((g) => g.key === 'steam:1091500');
    assert.ok(cp, 'a mentett játék hiányzik');
    assert.strictEqual(cp.available, false, 'offline gép játéka nem lehet elérhető');
    assert.strictEqual(cp.remoteOffline, true);
    assert.strictEqual(r.hosts.find((x) => x.id === 'off').online, false);
    if (shared) {
      const s = r.games.find((g) => g.key === shared.id);
      assert.strictEqual(s.sources.length, 2, 'közös játéknál két forrás kell');
      assert.strictEqual(s.available, true, 'helyben telepített játék elérhető kell legyen');
      assert.strictEqual(s.localAvailable, true);
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  await agent.stop();
  void http;
  console.log(`\n${passed} sikeres, ${failed} sikertelen`);
  process.exit(failed ? 1 : 0);
})();
