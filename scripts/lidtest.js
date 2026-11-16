'use strict';
// Fedél / kijelző automatika tesztje hardver nélkül: szimulált segéd-üzenetek + hamis powercfg.
const assert = require('assert');
const path = require('path');

// hamis power modul a require cache-be, mielőtt a display-manager betöltődik
const powerPath = require.resolve(path.join(__dirname, '..', 'src', 'main', 'power.js'));
const fake = { lid: { ac: 1, dc: 1 }, writes: 0 };
require.cache[powerPath] = {
  id: powerPath, filename: powerPath, loaded: true,
  exports: {
    getLidAction: async () => ({ ...fake.lid }),
    setLidAction: async (v) => { fake.lid = { ...v }; fake.writes++; },
    getConsoleLock: async () => ({ ac: 1, dc: 1 }),
    setConsoleLock: async () => {},
  },
};
const { DisplayManager } = require('../src/main/display-manager');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function make(display = {}, lid = { ac: 1, dc: 1 }) {
  fake.lid = { ...lid };
  const cfg = {
    display: { autoConsole: true, topology: 'external', keepAwakeOnLid: true, alwaysReady: false, alwaysReadyMinutes: 1, alwaysReadyOnlyAC: true, sleepOnUndock: true, hideOnUndock: true, ...display },
    power: { originalLid: null },
  };
  const dm = new DisplayManager(() => cfg, (p) => { if (p.power) cfg.power = { ...cfg.power, ...p.power }; }, () => {});
  dm.state.lidSupported = true;
  dm.undockSleepMs = 40;
  dm.minuteMs = 60;
  const ev = [];
  for (const e of ['dock', 'undock', 'sleeping', 'initial']) dm.on(e, () => ev.push(e));
  const sent = [];
  dm.send = (c) => sent.push(c);
  return { dm, cfg, ev, sent };
}

let ok = 0, bad = 0;
async function t(name, fn) {
  try { await fn(); ok++; console.log(`  ✓ ${name}`); } catch (e) { bad++; console.log(`  ✗ ${name}\n      ${e.message}`); }
}

(async () => {
  console.log('Fedél / kijelző automatika tesztek\n');

  await t('Indulás külső kijelző nélkül: fedél művelet változatlan', async () => {
    const { dm, ev } = make();
    dm.onLine('DISPLAY ext=0 int=1 extActive=0 intActive=1');
    await dm.chain;
    assert.deepStrictEqual(fake.lid, { ac: 1, dc: 1 });
    assert.deepStrictEqual(ev, ['initial']);
    assert.strictEqual(dm.status().isLaptop, true);
  });

  await t('Dokkolás: fedél → semmi, eredeti mentve, csak-külső topológia, dock esemény', async () => {
    const { dm, cfg, ev, sent } = make();
    dm.onLine('DISPLAY ext=0 int=1 extActive=0 intActive=1');
    dm.onLine('DISPLAY ext=1 int=1 extActive=1 intActive=1');
    await dm.chain;
    assert.deepStrictEqual(fake.lid, { ac: 0, dc: 0 });
    assert.deepStrictEqual(cfg.power.originalLid, { ac: 1, dc: 1 });
    assert.ok(ev.includes('dock'));
    assert.ok(sent.includes('TOPO external'));
  });

  await t('Lecsukás dokkolva: nincs altatás', async () => {
    const { dm, ev } = make();
    dm.onLine('DISPLAY ext=0 int=1 extActive=0 intActive=1');
    dm.onLine('DISPLAY ext=1 int=1 extActive=1 intActive=0');
    dm.onLine('LID closed');
    await wait(120);
    assert.ok(!ev.includes('sleeping'));
  });

  await t('Kihúzás lecsukott fedéllel: eredeti visszaállítva + alvás', async () => {
    const { dm, cfg, ev } = make();
    dm.onLine('DISPLAY ext=0 int=1 extActive=0 intActive=1');
    dm.onLine('DISPLAY ext=1 int=1 extActive=1 intActive=0');
    dm.onLine('LID closed');
    dm.onLine('DISPLAY ext=0 int=1 extActive=0 intActive=0');
    await dm.chain;
    await wait(100);
    assert.deepStrictEqual(fake.lid, { ac: 1, dc: 1 });
    assert.strictEqual(cfg.power.originalLid, null);
    assert.ok(ev.includes('undock') && ev.includes('sleeping'));
  });

  await t('Kihúzás nyitott fedéllel: nincs alvás, belső kijelzőre vált', async () => {
    const { dm, ev, sent } = make();
    dm.onLine('DISPLAY ext=0 int=1 extActive=0 intActive=1');
    dm.onLine('DISPLAY ext=1 int=1 extActive=1 intActive=0');
    dm.onLine('LID open');
    dm.onLine('DISPLAY ext=0 int=1 extActive=0 intActive=1');
    await wait(100);
    assert.ok(!ev.includes('sleeping'));
    assert.ok(sent.includes('TOPO internal'));
  });

  await t('Felhasználó eredeti fedél művelete "semmi": megmarad, kihúzáskor nincs kényszer-alvás', async () => {
    const { dm, cfg, ev } = make({}, { ac: 0, dc: 0 });
    dm.onLine('DISPLAY ext=0 int=1 extActive=0 intActive=1');
    dm.onLine('DISPLAY ext=1 int=1 extActive=1 intActive=0');
    await dm.chain;
    assert.deepStrictEqual(cfg.power.originalLid, { ac: 0, dc: 0 });
    dm.onLine('LID closed');
    dm.onLine('DISPLAY ext=0 int=1 extActive=0 intActive=0');
    await dm.chain; await wait(100);
    assert.deepStrictEqual(fake.lid, { ac: 0, dc: 0 });
    assert.ok(!ev.includes('sleeping'));
  });

  await t('Lecsukás dokkolás nélkül (Mindig kész ki): a Windows dönt, mi nem altatunk', async () => {
    const { dm, ev } = make();
    dm.onLine('DISPLAY ext=0 int=1 extActive=0 intActive=1');
    dm.onLine('LID closed');
    await wait(100);
    assert.ok(!ev.includes('sleeping'));
    assert.deepStrictEqual(fake.lid, { ac: 1, dc: 1 });
  });

  await t('Mindig kész mód: fedél → semmi, lecsukva időzítő, lejárat után alvás', async () => {
    const { dm, ev } = make({ alwaysReady: true });
    dm.onLine('DISPLAY ext=0 int=1 extActive=0 intActive=1');
    await dm.chain;
    assert.deepStrictEqual(fake.lid, { ac: 0, dc: 0 });
    dm.onLine('LID closed');
    assert.ok(dm.status().standbyAt > 0);
    await wait(120);
    assert.ok(ev.includes('sleeping'));
  });

  await t('Mindig kész mód: bedugás az időzítő alatt → konzol, nincs alvás', async () => {
    const { dm, ev } = make({ alwaysReady: true, alwaysReadyMinutes: 5 });
    dm.onLine('DISPLAY ext=0 int=1 extActive=0 intActive=1');
    dm.onLine('LID closed');
    await wait(50);
    dm.onLine('DISPLAY ext=1 int=1 extActive=1 intActive=0');
    await wait(400);
    assert.ok(ev.includes('dock'));
    assert.ok(!ev.includes('sleeping'));
    assert.strictEqual(dm.status().standbyAt, 0);
  });

  await t('Mindig kész csak töltőn: akkuról nem tartja ébren', async () => {
    const { dm, ev } = make({ alwaysReady: true });
    dm.state.onAC = false;
    dm.onLine('DISPLAY ext=0 int=1 extActive=0 intActive=1');
    await dm.chain;
    assert.deepStrictEqual(fake.lid, { ac: 1, dc: 1 });
    dm.onLine('LID closed');
    await wait(120);
    assert.ok(!ev.includes('sleeping'));
  });

  await t('Kilépéskor visszaállítás (restore)', async () => {
    const { dm, cfg } = make();
    dm.onLine('DISPLAY ext=0 int=1 extActive=0 intActive=1');
    dm.onLine('DISPLAY ext=1 int=1 extActive=1 intActive=1');
    await dm.chain;
    await dm.restore();
    assert.deepStrictEqual(fake.lid, { ac: 1, dc: 1 });
    assert.strictEqual(cfg.power.originalLid, null);
  });

  await t('Asztali gép (nincs belső kijelző, nincs fedél): nincs topológia váltás', async () => {
    const { dm, sent } = make();
    dm.state.lidSupported = false;
    dm.onLine('DISPLAY ext=1 int=0 extActive=1 intActive=0');
    dm.onLine('DISPLAY ext=2 int=0 extActive=2 intActive=0');
    await wait(50);
    assert.strictEqual(dm.status().isLaptop, false);
    assert.ok(!sent.some((s) => s.startsWith('TOPO')));
  });

  console.log(`\n${ok} sikeres, ${bad} sikertelen`);
  process.exit(bad ? 1 : 0);
})();
