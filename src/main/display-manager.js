'use strict';
// Kijelző + fedél automatika.
//  - külső kijelző bedugása  -> fedél művelet "semmi", topológia váltás (csak külső), 'dock' esemény (konzol mód)
//  - külső kijelző kihúzása  -> eredeti fedél művelet vissza, 'undock'; lecsukott fedélnél alvás
//  - "Mindig kész" mód       -> lecsukott fedéllel (külső kijelző nélkül) X percig ébren marad, hogy a bedugásra
//                               el tudjon indulni a konzol; utána alvó mód.
const { EventEmitter } = require('events');
const { spawn } = require('child_process');
const path = require('path');
const power = require('./power');

class DisplayManager extends EventEmitter {
  constructor(getCfg, updateCfg, log = console.log) {
    super();
    this.getCfg = getCfg;
    this.updateCfg = updateCfg;
    this.log = log;
    this.state = { ready: false, ext: 0, int: 0, extActive: 0, intActive: 0, lid: 'unknown', onAC: true, lidSupported: false, isLaptop: false };
    this.initial = true;
    this.chain = Promise.resolve();
    this.standbyTimer = null;
    this.standbyAt = 0;
    this.restarts = 0;
    this.undockSleepMs = 5000; // tesztekhez felülírható
    this.minuteMs = 60000;
  }

  async start() {
    const lid = await power.getLidAction().catch(() => null);
    this.state.lidSupported = !!lid;
    this.spawnHelper();
  }

  spawnHelper() {
    const script = path.join(__dirname, 'helpers', 'syswatch.ps1').replace('app.asar', 'app.asar.unpacked');
    this.proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let buf = '';
    this.proc.stdout.on('data', (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) this.onLine(line); }
    });
    this.proc.stderr.on('data', (d) => this.log('[syswatch:err]', d.toString().trim()));
    this.proc.on('exit', (code) => {
      this.log('[syswatch] kilépett', code);
      this.proc = null;
      if (this.stopping || this.restarts++ > 5) return;
      setTimeout(() => this.spawnHelper(), 2000 * this.restarts);
    });
  }

  send(cmd) { if (this.proc && this.proc.stdin.writable) this.proc.stdin.write(`${cmd}\n`); }

  onLine(line) {
    if (line === 'READY') { this.state.ready = true; this.restarts = 0; return; }
    if (line.startsWith('LID ')) return this.onLid(line.slice(4));
    if (line.startsWith('VOL ')) {
      const [, v, m] = line.split(' ');
      const r = { level: parseInt(v, 10), muted: m === '1' };
      const waiters = this.volWaiters || [];
      this.volWaiters = [];
      waiters.forEach((fn) => fn(r));
      return;
    }
    if (line.startsWith('DISPLAY ') && !line.includes('error')) {
      const kv = Object.fromEntries(line.slice(8).split(' ').map((p) => p.split('=')).map(([k, v]) => [k, parseInt(v, 10)]));
      return this.onDisplay(kv);
    }
    this.log('[syswatch]', line);
  }

  onDisplay(kv) {
    const prevExt = this.state.ext > 0;
    Object.assign(this.state, kv);
    this.state.isLaptop = this.state.int > 0 || this.state.lidSupported || this.state.lid !== 'unknown';
    const nowExt = this.state.ext > 0;
    if (this.initial) {
      this.initial = false;
      this.applyLidPolicy();
      this.emit('initial', { ...this.state });
    } else if (!prevExt && nowExt) this.handleDock();
    else if (prevExt && !nowExt) this.handleUndock();
    this.emit('state', this.status());
  }

  onLid(s) {
    const prev = this.state.lid;
    this.state.lid = s;
    this.state.isLaptop = true;
    this.log(`[display] fedél: ${s}`);
    if (s === 'open') this.clearStandby();
    // Külső kijelző nélkül lecsukva: csak a Mindig kész időzítő a mi dolgunk, egyébként a Windows a saját beállítása szerint jár el
    else if (s === 'closed' && prev !== 'closed' && this.state.ext === 0 && this.alwaysReadyActive()) this.onLidClosedUndocked(false);
    this.emit('state', this.status());
  }

  setOnAC(onAC) {
    this.state.onAC = onAC;
    this.applyLidPolicy();
  }

  alwaysReadyActive() {
    const d = this.getCfg().display;
    return !!d.alwaysReady && (!d.alwaysReadyOnlyAC || this.state.onAC);
  }

  handleDock() {
    const d = this.getCfg().display;
    this.log('[display] külső kijelző csatlakoztatva');
    this.clearStandby();
    this.applyLidPolicy();
    if (this.state.isLaptop && d.topology && d.topology !== 'none') this.send(`TOPO ${d.topology}`);
    this.emit('dock', this.status());
  }

  handleUndock() {
    const d = this.getCfg().display;
    this.log('[display] külső kijelző leválasztva');
    // az eredeti (felhasználói) fedél művelet, mielőtt visszaállítjuk
    const orig = this.getCfg().power.originalLid;
    const userAction = orig ? (this.state.onAC ? orig.ac : orig.dc) : 1;
    this.applyLidPolicy();
    this.emit('undock', this.status());
    if (this.state.lid === 'closed') this.onLidClosedUndocked(userAction !== 0);
    else if (this.state.isLaptop && d.topology !== 'none') this.send('TOPO internal');
  }

  // allowSleep: kihúzáskor altathatunk-e (a felhasználó eredeti fedél művelete nem "semmi")
  onLidClosedUndocked(allowSleep) {
    const d = this.getCfg().display;
    if (this.alwaysReadyActive()) {
      this.clearStandby();
      const ms = Math.max(1, d.alwaysReadyMinutes || 15) * this.minuteMs;
      this.standbyAt = Date.now() + ms;
      this.log(`[display] Mindig kész mód: ${d.alwaysReadyMinutes} percig ébren`);
      this.standbyTimer = setTimeout(() => {
        this.standbyTimer = null; this.standbyAt = 0;
        if (this.state.lid === 'closed' && this.state.ext === 0) this.sleep();
      }, ms);
    } else if (d.sleepOnUndock && allowSleep) {
      setTimeout(() => { if (this.state.lid === 'closed' && this.state.ext === 0) this.sleep(); }, this.undockSleepMs);
    }
  }

  clearStandby() {
    if (this.standbyTimer) clearTimeout(this.standbyTimer);
    this.standbyTimer = null; this.standbyAt = 0;
  }

  sleep() {
    this.log('[display] alvó mód');
    this.emit('sleeping');
    setTimeout(() => this.send('SLEEP'), 300);
  }

  setTopology(t) { this.send(`TOPO ${t}`); }

  // Hangerő: cmd = 'VOLGET' | 'VOLSET 40' | 'VOLMUTE 1'
  volume(cmd) {
    return new Promise((resolve, reject) => {
      if (!this.proc) return reject(new Error('A rendszerfigyelő nem fut'));
      (this.volWaiters = this.volWaiters || []).push(resolve);
      this.send(cmd);
      setTimeout(() => reject(new Error('Hangerő: nincs válasz')), 3000);
    });
  }

  // Fedél művelet: "semmi" amíg külső kijelző van (vagy Mindig kész mód), egyébként az eredeti érték.
  applyLidPolicy() {
    if (!this.state.lidSupported) return Promise.resolve();
    this.chain = this.chain.then(async () => {
      const cfg = this.getCfg();
      const need0 = (cfg.display.keepAwakeOnLid && this.state.ext > 0) || this.alwaysReadyActive();
      const cur = await power.getLidAction();
      if (!cur) return;
      const orig = cfg.power.originalLid;
      if (need0) {
        // az eredeti értéket egyszer mentjük (konfigba is, így összeomlás után is visszaállítható)
        if (!orig) this.updateCfg({ power: { originalLid: { ac: cur.ac, dc: cur.dc } } });
        if (cur.ac !== 0 || cur.dc !== 0) { await power.setLidAction({ ac: 0, dc: 0 }); this.log('[power] fedél: semmi'); }
      } else if (orig) {
        await power.setLidAction(orig);
        this.updateCfg({ power: { originalLid: null } });
        this.log(`[power] fedél visszaállítva: AC=${orig.ac} DC=${orig.dc}`);
      }
    }).catch((e) => this.log('[power] hiba', e.message));
    return this.chain;
  }

  async restore() {
    const orig = this.getCfg().power.originalLid;
    if (orig) {
      await power.setLidAction(orig).catch(() => {});
      this.updateCfg({ power: { originalLid: null } });
    }
  }

  status() {
    return { ...this.state, standbyAt: this.standbyAt, external: this.state.ext > 0 };
  }

  stop() {
    this.stopping = true;
    this.clearStandby();
    this.send('EXIT');
    setTimeout(() => { try { this.proc && this.proc.kill(); } catch {} }, 500);
  }
}

module.exports = { DisplayManager };
