'use strict';
// Játékon belüli InariX overlay (a gépen futó játék fölött, helyben és streamben is):
//  - a kontroller Guide (Xbox) gombja nyitja – amíg a InariX fut, a Windows Game Bar nem foglalja le
//  - menü: vissza a játékba, InariX kezdőképernyő, kilépés a játékból, hangerő, teljesítmény kijelző
//  - teljesítmény kijelző (opcionális): kis, átkattintható panel a sarokban (CPU, RAM, GPU terhelés és hőmérséklet)
// Kizárólagos teljes képernyős játék fölé ablak nem rajzolható – keret nélküli ablakos módban működik.
const { BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { run } = require('../core/util');

const GAMEBAR_KEY = 'HKCU\\Software\\Microsoft\\GameBar';

async function regGetDword(key, name) {
  const r = await run('reg', ['query', key, '/v', name]);
  const m = r.code === 0 && r.stdout.match(/REG_DWORD\s+0x([0-9a-f]+)/i);
  return m ? parseInt(m[1], 16) : null;
}

function setupOverlay({ getWin, showConsole, log, getCfg, updateCfg, volume, runningLocal, quitLocal, isStreaming }) {
  let ov = null, perf = null, watcher = null, perfTimer = null, cpuPrev = null;

  // ---- Windows Game Bar: a Guide gomb ne nyissa meg, amíg a InariX fut (kilépéskor visszaállítjuk) ----
  async function claimGuide() {
    try {
      const cur = await regGetDword(GAMEBAR_KEY, 'UseNexusForGameBarEnabled');
      const p = getCfg().power || {};
      if (p.originalNexus === undefined || p.originalNexus === null) updateCfg({ power: { originalNexus: cur === null ? -1 : cur } });
      if (cur !== 0) await run('reg', ['add', GAMEBAR_KEY, '/v', 'UseNexusForGameBarEnabled', '/t', 'REG_DWORD', '/d', '0', '/f']);
    } catch (e) { log(`[overlay] Game Bar: ${e.message}`); }
  }
  async function releaseGuide() {
    const orig = (getCfg().power || {}).originalNexus;
    if (orig === undefined || orig === null) return;
    if (orig === -1) await run('reg', ['delete', GAMEBAR_KEY, '/v', 'UseNexusForGameBarEnabled', '/f']);
    else await run('reg', ['add', GAMEBAR_KEY, '/v', 'UseNexusForGameBarEnabled', '/t', 'REG_DWORD', '/d', String(orig), '/f']);
    updateCfg({ power: { originalNexus: null } });
  }

  // ---- Guide gomb figyelés (XInput – a stream virtuális kontrollere is) ----
  function startWatcher() {
    const script = path.join(__dirname, 'helpers', 'guidewatch.ps1').replace('app.asar', 'app.asar.unpacked');
    watcher = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], { windowsHide: true });
    let buf = '';
    watcher.stdout.on('data', (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (line.startsWith('GUIDE')) onGuide();
      }
    });
    watcher.on('exit', () => { watcher = null; });
  }

  function onGuide() {
    // stream közben az overlay a KLIENSEN nyílik (a stream menü) – a hoston nem lehetne vele interaktálni
    if (isStreaming && isStreaming()) { if (ov && !ov.isDestroyed() && ov.isVisible()) hide(); return; }
    const win = getWin();
    // ha a InariX konzol van előtérben, ott a saját gyorsmenüje kezeli
    if (win && !win.isDestroyed() && win.isVisible() && win.isFocused()) return;
    if (ov && !ov.isDestroyed() && ov.isVisible()) hide(); else show();
  }

  function ensureOverlay() {
    if (ov && !ov.isDestroyed()) return ov;
    ov = new BrowserWindow({
      show: false, frame: false, transparent: true, resizable: false, skipTaskbar: true, alwaysOnTop: true, hasShadow: false,
      backgroundColor: '#00000000',
      webPreferences: { preload: path.join(__dirname, '..', 'overlay', 'overlay-preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
    });
    ov.setAlwaysOnTop(true, 'screen-saver');
    ov.loadFile(path.join(__dirname, '..', 'overlay', 'overlay.html'));
    ov.on('blur', () => { if (ov && ov.isVisible()) hide(); });
    return ov;
  }

  async function state() {
    const games = await runningLocal().catch(() => []);
    let vol = null;
    try { vol = await volume('VOLGET'); } catch { /* nincs hangkezelés */ }
    return { games: games.map((g) => ({ id: g.id, name: g.name })), volume: vol, perf: !!getCfg().ui.perfWidget, time: Date.now() };
  }

  async function show() {
    const w = ensureOverlay();
    const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    w.setBounds(d.bounds);
    w.webContents.send('overlay:state', await state());
    w.show(); w.focus(); w.moveTop();
    log('[overlay] megnyitva');
  }
  function hide() { if (ov && !ov.isDestroyed()) ov.hide(); }

  // ---- Teljesítmény kijelző ----
  function cpuPercent() {
    const t = os.cpus().reduce((a, c) => { for (const k of Object.keys(c.times)) a[k] = (a[k] || 0) + c.times[k]; return a; }, {});
    const total = Object.values(t).reduce((a, b) => a + b, 0);
    const prev = cpuPrev; cpuPrev = { total, idle: t.idle };
    if (!prev) return null;
    return Math.round(100 * (1 - (t.idle - prev.idle) / Math.max(1, total - prev.total)));
  }
  async function gpuStats() {
    const r = await run('nvidia-smi', ['--query-gpu=utilization.gpu,temperature.gpu', '--format=csv,noheader,nounits'], { timeout: 3000 });
    if (r.code !== 0) return null;
    const [u, t] = r.stdout.trim().split('\n')[0].split(',').map((x) => parseInt(x, 10));
    return { load: u, temp: t };
  }
  function setPerf(on) {
    if (on) {
      if (!perf || perf.isDestroyed()) {
        const d = screen.getPrimaryDisplay();
        perf = new BrowserWindow({ width: 420, height: 46, x: d.bounds.x + d.bounds.width - 440, y: d.bounds.y + 16, show: false, frame: false, transparent: true, resizable: false, skipTaskbar: true, focusable: false, alwaysOnTop: true, hasShadow: false,
          webPreferences: { preload: path.join(__dirname, '..', 'overlay', 'overlay-preload.js'), contextIsolation: true } });
        perf.setAlwaysOnTop(true, 'screen-saver');
        perf.setIgnoreMouseEvents(true);
        perf.loadFile(path.join(__dirname, '..', 'overlay', 'perf.html'));
        perf.once('ready-to-show', () => perf.showInactive());
      }
      clearInterval(perfTimer);
      perfTimer = setInterval(async () => {
        if (!perf || perf.isDestroyed()) return;
        const gpu = await gpuStats().catch(() => null);
        perf.webContents.send('perf:data', { cpu: cpuPercent(), ram: Math.round(100 * (1 - os.freemem() / os.totalmem())), gpu });
      }, 2000);
    } else {
      clearInterval(perfTimer); perfTimer = null;
      if (perf && !perf.isDestroyed()) perf.destroy();
      perf = null;
    }
  }

  // ---- Az overlay felület műveletei ----
  ipcMain.handle('overlay:action', async (_e, action, arg) => {
    try {
      if (action === 'close') hide();
      else if (action === 'home') { hide(); showConsole(); }
      else if (action === 'quit') { await quitLocal(arg); hide(); }
      else if (action === 'vol') {
        const cur = await volume('VOLGET').catch(() => null);
        const v = Math.max(0, Math.min(100, (Number(cur && cur.level !== undefined ? cur.level : 50)) + (arg > 0 ? 10 : -10)));
        await volume(`VOLSET ${v}`);
      } else if (action === 'perf') { updateCfg({ ui: { perfWidget: !getCfg().ui.perfWidget } }); setPerf(getCfg().ui.perfWidget); }
      return { ok: true, state: await state() };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  claimGuide();
  startWatcher();
  if (getCfg().ui.perfWidget) setPerf(true);

  return {
    show, hide,
    async dispose() {
      if (watcher) { try { watcher.kill(); } catch { /* */ } }
      setPerf(false);
      await releaseGuide().catch(() => {});
    },
  };
}

module.exports = { setupOverlay };
