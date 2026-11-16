'use strict';
const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen, powerMonitor, powerSaveBlocker, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { Config } = require('./config');
const { DisplayManager } = require('./display-manager');
const { setupBrowser } = require('./browser');
const { Accounts } = require('./accounts');
const { setupOverlay } = require('./overlay');
const homeinfo = require('./homeinfo');
const moonlight = require('./moonlight');
const power = require('./power');
const { scanAll } = require('../core/scanner');
const { launchGame, installGame, gameAction, powerAction, diskInfo, runningGames, quitGame } = require('../core/launcher');
const { steamSearch, steamStoreRows, ownedGames } = require('../core/store');
const { run } = require('../core/util');
const { discover, wakeOnLan, agentRequest, AGENT_PORT } = require('../core/net');
const { createAgent, newToken, VERSION } = require('../core/agent-server');
const { Library } = require('./library');
const { StreamHost } = require('./stream-host');

const args = process.argv.slice(1);
const START_HIDDEN = args.includes('--background');
const FORCE_BOOT = args.includes('--boot');
const NO_INTEGRATION = !!process.env.INARIX_NO_INTEGRATION; // teszteléshez: ne hozzon létre parancsikont / autostartot

if (process.env.INARIX_USERDATA) app.setPath('userData', process.env.INARIX_USERDATA);
// Egyszeri adatáttelepítés az átnevezés előtti adatmappából (beállítások, fiókok, statisztikák, böngésző).
// Csak akkor fut, ha az új mappa még nem létezik. Miután minden gép frissült, ez a blokk törölhető.
if (!process.env.INARIX_USERDATA) {
  try {
    const LEGACY_DIR = path.join(app.getPath('appData'), 'GamoTex');
    const dir = app.getPath('userData');
    if (!fs.existsSync(path.join(dir, 'config.json')) && fs.existsSync(path.join(LEGACY_DIR, 'config.json'))) {
      fs.cpSync(LEGACY_DIR, dir, { recursive: true, force: false, filter: (src) => !/[\/](Cache|Code Cache|GPUCache|DawnCache|blob_storage)([\/]|$)/i.test(src) && !/lockfile$/i.test(src) });
      // a böngésző munkamenet (sütik, bejelentkezések) az új partíció néven
      const oldPart = path.join(dir, 'Partitions', 'gamotex-browser'), newPart = path.join(dir, 'Partitions', 'inarix-browser');
      if (fs.existsSync(oldPart) && !fs.existsSync(newPart)) fs.renameSync(oldPart, newPart);
    }
  } catch { /* áttelepítés nélkül is indul */ }
}
// Beépített stream (WebRTC, LAN): valódi helyi IP-k az ICE jelöltekben (mDNS álnevek helyett),
// és hardveres videókódolás/dekódolás engedélyezése, ahol a Chromium támogatja.
// A Chromium képernyőmegosztásnál szoftveres kódolót választ (prezentációhoz jó) – játékhoz a hardveres (NVENC/AMF/QSV) kell
app.commandLine.appendSwitch('disable-features', process.env.INARIX_DISABLE_FEATURES || 'WebRtcHideLocalIpsWithMdns,WebRtcScreenshareSwEncoding');
app.commandLine.appendSwitch('enable-features', process.env.INARIX_FEATURES || 'MediaFoundationH264CbpEncoding,MediaFoundationH264Encoding,PlatformHEVCDecoderSupport,PlatformHEVCEncoderSupport');
if (!process.argv.includes('--cleanup') && !app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

let cfg, win, tray, display, library, agent = null;
let browser = null;
let accounts = null;
let overlay = null;
let streaming = null; // { proc, host, blocker, startedAt } – Moonlight
let streamHost = null; // beépített stream host (lusta létrehozás)
let clientStream = null; // beépített stream kliens oldali nyilvántartás (játékidő)
let clientBlocker = null;

// ---- Frissítés: a gaming PC frissítő szerveréről (később GitHub). Indításkor és 5 percenként, ha nincs stream. ----
let updateInfo = null, lastSeenBuild = null, updateAbort = null;
const UPDATE_REPO = 'spigioe/InariX';
const myBuildInfo = () => { try { return JSON.parse(fs.readFileSync(path.join(path.dirname(process.execPath), 'build.json'), 'utf8')); } catch { return null; } };
const myBuild = () => { const b = myBuildInfo(); return b ? b.build : null; };
// Verzió összehasonlítás (semver-szerű, előzetes kiadással: 0.8.0-alpha < 0.8.0-beta < 0.8.0 < 0.8.1-alpha); egyezésnél a build dönt
function compareVersions(a, b) {
  const p = (v) => { const [main, pre = ''] = String(v || '0').split('-'); return { n: main.split('.').map((x) => parseInt(x, 10) || 0), pre }; };
  const A = p(a), B = p(b);
  for (let i = 0; i < 3; i++) { const d = (A.n[i] || 0) - (B.n[i] || 0); if (d) return Math.sign(d); }
  if (A.pre === B.pre) return 0;
  if (!A.pre) return 1; if (!B.pre) return -1;
  return A.pre.localeCompare(B.pre, 'en', { numeric: true });
}
const isNewer = (m, mine) => { const c = compareVersions(m.version, mine.version); return c > 0 || (c === 0 && String(m.build || '') > String(mine.build || '')); };
async function getJson(url, headers = {}, ms = 8000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'InariX-Updater', Accept: 'application/json', ...headers }, signal: ac.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}
// Frissítés keresése: 1) GitHub kiadás (spigioe/InariX), 2) tartalék: a gaming PC frissítő szervere a helyi hálózaton
async function checkUpdate(force = false) {
  if (!app.isPackaged) return null;
  if (!force && (clientBlocker !== null || streaming)) return updateInfo;
  const mineInfo = myBuildInfo();
  if (!mineInfo) return null;
  const mine = `${mineInfo.version} (${mineInfo.build})`;
  let found = null;
  try {
    // a „latest” végpont kihagyja az előzetes (alpha) kiadásokat → a legutóbbi kiadások közül a legfrissebb
    const rels = await getJson(`https://api.github.com/repos/${UPDATE_REPO}/releases?per_page=5`, { Accept: 'application/vnd.github+json' });
    const rel = (rels || []).find((x) => !x.draft) || {};
    const ma = (rel.assets || []).find((x) => x.name === 'update-manifest.json');
    if (ma) {
      const m = await getJson(ma.browser_download_url);
      const za = (rel.assets || []).find((x) => x.name === m.file);
      if (za && m.build && isNewer(m, mineInfo)) found = { build: `${m.version} (${m.build})`, current: mine, source: 'GitHub', hostName: 'GitHub', url: za.browser_download_url, headers: {}, sha256: m.sha256, size: m.size, notes: rel.body || '' };
    }
  } catch { /* GitHub nem érhető el – helyi tartalék */ }
  if (!found) {
    for (const h of cfg.get().hosts) {
      try {
        const m = await getJson(`http://${h.address}:47810/manifest`, { 'X-InariX-Token': h.token || '' }, 4000);
        if (m.build && isNewer(m, mineInfo)) { found = { build: `${m.version} (${m.build})`, current: mine, source: 'lan', hostName: h.name, url: `http://${h.address}:47810/package`, headers: { 'X-InariX-Token': h.token || '' }, sha256: m.sha256, size: m.size }; break; }
      } catch { /* a gépen nem fut frissítő szerver */ }
    }
  }
  const fresh = found && (!updateInfo || updateInfo.build !== found.build);
  updateInfo = found ? { ...found, zip: updateInfo && updateInfo.build === found.build ? updateInfo.zip : null } : null;
  if (fresh) { log(`[frissítés] új verzió: ${found.build} (${found.hostName})`); sendUI('update', publicUpdate()); }
  return publicUpdate();
}
const publicUpdate = () => (updateInfo ? { build: updateInfo.build, current: updateInfo.current, hostName: updateInfo.hostName, size: updateInfo.size, ready: !!updateInfo.zip } : null);

// Letöltés folyamatjelzéssel (update-progress) és SHA-256 ellenőrzéssel
async function downloadUpdate() {
  if (!updateInfo) throw new Error('Nincs elérhető frissítés');
  if (updateInfo.zip && fs.existsSync(updateInfo.zip)) return publicUpdate();
  const file = path.join(app.getPath('temp'), `InariX-update-${Date.now()}.zip`);
  updateAbort = new AbortController();
  const r = await fetch(updateInfo.url, { headers: { 'User-Agent': 'InariX-Updater', ...updateInfo.headers }, signal: updateAbort.signal });
  if (!r.ok) throw new Error(`Letöltési hiba: HTTP ${r.status}`);
  const total = Number(r.headers.get('content-length')) || updateInfo.size || 0;
  const hash = require('crypto').createHash('sha256');
  const out = fs.createWriteStream(file);
  let got = 0, last = 0;
  try {
    for await (const chunk of r.body) {
      hash.update(chunk); out.write(chunk); got += chunk.length;
      if (Date.now() - last > 150) { last = Date.now(); sendUI('update-progress', { received: got, total }); }
    }
  } finally { await new Promise((res) => out.end(res)); updateAbort = null; }
  sendUI('update-progress', { received: got, total: total || got });
  if (updateInfo.sha256 && hash.digest('hex') !== updateInfo.sha256) { fs.rmSync(file, { force: true }); throw new Error('A letöltött csomag sérült (SHA-256 eltérés) – próbáld újra'); }
  updateInfo.zip = file;
  log(`[frissítés] letöltve: ${file}`);
  return publicUpdate();
}

// Telepítés: a frissítéskezelő indítása, majd – miután meggyőződtünk róla, hogy fut – a „mehet” üzenet átadása
async function applyUpdate() {
  if (!updateInfo || !updateInfo.zip) throw new Error('A frissítés még nincs letöltve');
  const dir = path.dirname(process.execPath);
  const src = path.join(app.getAppPath(), 'updater', 'InariX-Updater.exe');
  if (!fs.existsSync(src)) throw new Error('A frissítéskezelő nem található (updater\\InariX-Updater.exe)');
  // ideiglenes másolatból fut, így a telepítési mappát szabadon felülírhatja
  const tmpExe = path.join(app.getPath('temp'), `InariX-Updater-${Date.now()}.exe`);
  fs.copyFileSync(src, tmpExe);
  const pipeName = `InariX-Updater-${process.pid}-${Date.now()}`;
  require('child_process').spawn(tmpExe, ['--pipe', pipeName], { detached: true, stdio: 'ignore' }).unref();
  const net = require('net');
  const connect = () => new Promise((res, rej) => { const c = net.connect(`\\\\.\\pipe\\${pipeName}`); c.once('connect', () => res(c)); c.once('error', rej); });
  let sock = null;
  for (let i = 0; i < 60 && !sock; i++) { try { sock = await connect(); } catch { await new Promise((r) => setTimeout(r, 250)); } }
  if (!sock) throw new Error('A frissítéskezelő nem indult el');
  const answer = await new Promise((res) => {
    let buf = '';
    sock.on('data', (d) => { buf += d.toString(); if (buf.includes('\n')) res(buf.trim()); });
    sock.write(`GO|${updateInfo.zip}|${dir}|${path.basename(process.execPath)}|${process.pid}|${updateInfo.build}\n`);
    setTimeout(() => res(buf.trim() || 'TIMEOUT'), 8000);
  });
  if (answer !== 'OK') throw new Error(`A frissítéskezelő nem igazolta vissza az üzenetet (${answer})`);
  log(`[frissítés] átadva a frissítéskezelőnek: ${updateInfo.build}`);
  cfg.update({ pendingUpdate: { build: updateInfo.build, from: updateInfo.current, at: Date.now() } });
  // a kezelő leállítja az InariX-et; biztonsági háló, ha mégsem tenné
  app.isQuitting = true;
  setTimeout(() => app.exit(0), 4000);
  return true;
}
function updateLog() {
  try { return fs.readFileSync(path.join(app.getPath('temp'), 'InariX-update.log'), 'utf8').split(/\r?\n/).slice(-40).join('\n'); } catch { return '(nincs frissítési napló)'; }
}
function reportUpdateResult() {
  const pu = cfg.get().pendingUpdate;
  if (!pu || !pu.build) return;
  let mine = null;
  try { mine = JSON.parse(fs.readFileSync(path.join(path.dirname(process.execPath), 'build.json'), 'utf8')).build; } catch { /* dev */ }
  cfg.update({ pendingUpdate: null });
  sendUI('update-result', { ok: mine === pu.build, build: pu.build, current: mine, log: updateLog() });
}
const streamEngine = () => (cfg.get().stream.engine || 'builtin');
function getStreamHost() {
  if (!streamHost) streamHost = new StreamHost(log);
  return streamHost;
}

// ---- Beépített stream: UDP videó fogadó (kliens oldal) ----
let videoRx = null, videoRxTimer = null, rxTick = 0;
async function startVideoReceiver(address, creds) {
  const { UdpVideoReceiver } = require('../core/udp-video');
  const rx = new UdpVideoReceiver({ log });
  rx.onFrame = (f) => {
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send('stream:frame', { key: f.key, ts: f.ts, data: f.data });
  };
  await rx.start(address, creds);
  videoRx = rx;
  let last = { ...rx.stats };
  videoRxTimer = setInterval(() => {
    const s = rx.stats;
    const d = { pkts: s.pkts - last.pkts, fec: s.fecFixed - last.fecFixed, nacks: s.nacks - last.nacks, lost: s.lost - last.lost, frames: s.frames - last.frames,
      rtt: Math.round(rx.rtt.srtt), base: Math.round(rx.rtt.base), deadline: Math.round(rx.deadline()) };
    last = { ...s };
    rx.sendStats(d);
    sendUI('stream:net', { ...d, total: { ...s } });
    // hibakereséshez: másodpercenkénti napló (userData/stream-stats.log); frames ×2 = fps
    if ((rxTick = (rxTick + 1) % 2) === 0) fs.appendFile(path.join(app.getPath('userData'), 'stream-stats.log'), `${new Date().toISOString()} KLIENS ${JSON.stringify(d)}
`, () => {});
  }, 500);
  log(`[stream] UDP videó: ${address}:${creds.port}`);
}
function stopVideoReceiver() {
  clearInterval(videoRxTimer); videoRxTimer = null;
  if (videoRx) { videoRx.close(); videoRx = null; }
}
const hostSleepTimers = {};
let autoOpened = false;
const logLines = [];
function log(...a) {
  const line = `[${new Date().toLocaleTimeString('hu-HU')}] ${a.join(' ')}`;
  logLines.push(line); if (logLines.length > 300) logLines.shift();
  console.log(line);
  if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send('log', line);
}

const ICON = path.join(__dirname, '..', '..', 'assets', 'icon.png');

// ---------- Ablak ----------
function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 720, show: false, frame: false, backgroundColor: '#05060a',
    title: 'InariX', icon: fs.existsSync(ICON) ? ICON : undefined, autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, webviewTag: true },
  });
  browser = setupBrowser({ getWin: () => win, sendUI, log, onWebview: (wc) => { if (accounts) accounts.attach(wc); } });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.on('close', (e) => { if (!app.isQuitting) { e.preventDefault(); hideConsole(); } });
  // kis méretben / rejtve a felület jelezze a rendererrel (a háttérvideó álljon meg)
  win.on('minimize', () => sendUI('hidden'));
  win.on('restore', () => sendUI('shown'));
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools();
  });
}

let rendererReady = false;
const pending = [];
function sendUI(ch, data) {
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return;
  if (!rendererReady) pending.push([ch, data]); else win.webContents.send(ch, data);
}

function showConsole({ boot = false } = {}) {
  if (!win) return;
  const d = screen.getPrimaryDisplay();
  if (!win.isFullScreen()) win.setBounds(d.bounds);
  win.show();
  win.setFullScreen(true);
  win.focus();
  win.moveTop();
  if (boot && cfg.get().ui.bootAnimation) sendUI('boot');
  sendUI('shown');
}

function hideConsole() {
  if (!win) return;
  win.setFullScreen(false);
  win.hide();
  sendUI('hidden');
  autoOpened = false;
}

// ---------- Hostok ----------
function localHost() {
  return { id: 'local', name: 'Ez a gép', local: true };
}
function allHosts() { return [localHost(), ...cfg.get().hosts]; }
function getHost(id) {
  const h = allHosts().find((x) => x.id === id);
  if (!h) throw new Error('Ismeretlen gép');
  return h;
}

async function hostGames(host, refresh) {
  if (host.local) return scanAll({ customGames: cfg.get().hostMode.customGames });
  const r = await agentRequest(host, 'GET', `/api/games${refresh ? '?refresh=1' : ''}`, null, 15000);
  return r.games || [];
}

// ---------- Streaming ----------
const PRESETS = { '720p60': ['1280x720', 60], '1080p60': ['1920x1080', 60], '1080p120': ['1920x1080', 120], '1440p60': ['2560x1440', 60], '1440p120': ['2560x1440', 120], '4k60': ['3840x2160', 60] };
function streamArgs() {
  const c = cfg.get();
  const a = [];
  const p = PRESETS[c.stream.preset];
  if (p) a.push('--resolution', p[0], '--fps', String(p[1]));
  if (c.stream.bitrate) a.push('--bitrate', String(c.stream.bitrate * 1000));
  if (c.stream.vsync === false) a.push('--no-vsync');
  if (c.stream.hdr) a.push('--hdr');
  if (c.stream.overlay) a.push('--performance-overlay');
  if (c.stream.codec && c.stream.codec !== 'auto') a.push('--video-codec', c.stream.codec);
  a.push('--display-mode', 'fullscreen', '--keep-awake');
  return `${a.join(' ')} ${c.moonlight.args || ''}`.trim();
}

function startStream(host, gameKey = null) {
  const c = cfg.get().moonlight;
  const exe = moonlight.findMoonlight(c.path);
  if (!exe) throw new Error('A Moonlight nincs telepítve. Beállítások → Streaming → Moonlight telepítése');
  if (streaming) throw new Error('Már fut egy stream');
  if (hostSleepTimers[host.id]) { clearTimeout(hostSleepTimers[host.id]); delete hostSleepTimers[host.id]; }
  const target = host.streamHost || host.address;
  const extra = streamArgs();
  log(`[stream] Moonlight indul: ${target} / ${c.app} ${extra}`);
  const proc = moonlight.stream(exe, target, c.app, extra);
  let errOut = '';
  proc.stderr.on('data', (d) => { errOut += d.toString(); });
  proc.stdout.on('data', (d) => { errOut += d.toString(); });
  const blocker = powerSaveBlocker.start('prevent-display-sleep');
  streaming = { proc, host, blocker, startedAt: Date.now() };
  sendUI('stream', { state: 'starting', host: host.name });
  const hideTimer = setTimeout(() => { if (streaming && streaming.proc === proc) { win.setFullScreen(false); win.hide(); sendUI('stream', { state: 'running' }); } }, 3500);
  proc.on('error', (e) => log('[stream] hiba', e.message));
  proc.on('exit', (code) => {
    clearTimeout(hideTimer);
    const dur = Date.now() - streaming.startedAt;
    powerSaveBlocker.stop(blocker);
    streaming = null;
    log(`[stream] vége (kód: ${code}, ${Math.round(dur / 1000)} mp)`);
    if (gameKey && dur > 15000) library.addPlaytime(gameKey, dur / 1000);
    // Gaming PC altatása a stream után X perccel (ha közben nem indul új stream)
    const after = cfg.get().stream.hostSleepAfter;
    if (after > 0 && dur > 15000) {
      log(`[stream] ${host.name} altatása ${after} perc múlva`);
      hostSleepTimers[host.id] = setTimeout(() => {
        delete hostSleepTimers[host.id];
        if (streaming) return;
        log(`[stream] ${host.name} altatása`);
        agentRequest(host, 'POST', '/api/power', { action: 'sleep' }).catch((e) => log('[stream] altatás sikertelen', e.message));
      }, after * 60000);
    }
    showConsole();
    const failed = code !== 0 && dur < 15000;
    if (failed && errOut.trim()) log(`[stream] Moonlight kimenet: ${errOut.trim().slice(-800)}`);
    sendUI('stream', {
      state: 'ended', code, hostId: host.id,
      error: failed ? `A stream nem indult el (kód ${code}). Párosítva van a Moonlight a géppel, és fut rajta a Sunshine? Részletek: Beállítások → Napló.` : null,
    });
  });
}

// ---------- Host mód (agent) ----------
async function applyHostMode() {
  const hm = cfg.get().hostMode;
  if (agent) { await agent.stop().catch(() => {}); agent = null; }
  if (!hm.enabled) return { running: false };
  agent = createAgent(() => cfg.get().hostMode, log, {
    stats: () => library.stats,
    updateBuild: () => { try { return JSON.parse(fs.readFileSync(path.join(app.getAppPath(), 'dist', 'update-manifest.json'), 'utf8')).build; } catch { return null; } },
    accounts: {
      status: () => cfg.get().sync || {},
      owned: () => accounts.owned(),
      sync: async (store) => { if (store) await accounts.sync(store, true); else await accounts.syncAll(true); return cfg.get().sync; },
    },
    stream: {
      // laptop csatlakozásakor a host InariX ablaka eltűnik, hogy ne takarja a játékot a streamben
      offer: async (body, client) => { const r = await getStreamHost().offer(body, client); hideConsole(); return r; },
      stop: (reason) => { if (streamHost) streamHost.stop(reason); },
      status: () => (streamHost ? streamHost.status() : { available: true, vigem: null, active: false }),
    },
  });
  try { await agent.start(); return { running: true }; }
  catch (e) { log('[agent] nem indult:', e.message); agent = null; return { running: false, error: e.message }; }
}

// ---------- Autostart ----------
function applyAutostart() {
  if (process.platform !== 'win32' || !app.isPackaged || NO_INTEGRATION) return; // fejlesztői módban ne regisztráljuk az electron.exe-t
  // rendszergazdai módban az ütemezett feladat indít, a normál automatikus indítás kikapcsol (különben kétszer indulna)
  const on = !!cfg.get().autostart && !cfg.get().hostMode.adminMode;
  const a = app.isPackaged ? ['--background'] : [app.getAppPath(), '--background'];
  app.setLoginItemSettings({ openAtLogin: on, path: process.execPath, args: a });
}

// ---------- IPC ----------
function handle(name, fn) {
  ipcMain.handle(name, async (_e, ...a) => {
    try { return { ok: true, data: await fn(...a) }; } catch (e) { log(`[ipc:${name}]`, e.message); return { ok: false, error: e.message }; }
  });
}

function publicState() {
  const c = cfg.get();
  return {
    version: VERSION, settings: c, hosts: allHosts(),
    display: display ? display.status() : null,
    moonlightPath: moonlight.findMoonlight(c.moonlight.path),
    hostRunning: !!agent, streaming: !!streaming, logs: logLines.slice(-80), hostInfo,
    packaged: app.isPackaged,
  };
}

function registerIpc() {
  ipcMain.on('renderer-ready', () => {
    rendererReady = true;
    for (const [ch, d] of pending.splice(0)) win.webContents.send(ch, d);
  });
  handle('state', () => publicState());
  handle('ping', async (hostId) => {
    const h = getHost(hostId);
    if (h.local) return { online: true };
    try { const i = await agentRequest(h, 'GET', '/api/auth', null, 2500); return { online: true, info: i }; }
    catch (e) { return { online: false, error: e.message }; }
  });
  handle('library', (force) => library.build(!!force));
  handle('details', (key) => library.details(key));
  handle('friends', () => library.friends());
  handle('home-news', () => homeinfo.news(library, () => cfg.get()));
  handle('weather', () => homeinfo.weather((cfg.get().ui.weatherCity || '').trim()));
  handle('radios', () => homeinfo.radios());
  handle('media-key', (k) => homeinfo.mediaKey(k));
  handle('brightness', (v) => homeinfo.brightness(v === null ? undefined : v));
  handle('pad-battery', () => homeinfo.padBattery());
  handle('trailer', async (appid) => (await library.steamDetails(String(appid).replace(/\D/g, ''))).trailer || null);
  handle('achievements', (appid) => library.achievementsCached(String(appid).replace(/\D/g, '')));
  handle('stat', (key, patch) => {
    const allowed = {};
    for (const k of ['fav', 'hidden', 'prefer']) if (k in patch) allowed[k] = patch[k];
    if (patch.prefs && typeof patch.prefs === 'object') {
      const p = patch.prefs;
      allowed.prefs = { preset: String(p.preset || 'default').slice(0, 12), input: p.input === 'mouse' ? 'mouse' : 'pad', args: String(p.args || '').slice(0, 300) };
    }
    return library.patchStats(key, allowed);
  });
  handle('reset-stats', (key) => library.patchStats(key, { playSec: 0, launches: 0 }));
  // Játék indítása: forrás kiválasztása (kért gép > preferált > beállítás szerint stream/helyi)
  handle('play', async (key, hostId) => {
    let e = library.find(key);
    if (!e) { await library.build(false); e = library.find(key); }
    if (!e) throw new Error('A játék nem található');
    const online = e.sources.filter((s) => s.online);
    if (!online.length) throw new Error('OFFLINE: A játékot tartalmazó gép jelenleg nem elérhető');
    const preferLocal = cfg.get().library.preferLocal;
    const src = (hostId && online.find((s) => s.hostId === hostId))
      // ha valahol már fut, oda csatlakozunk vissza (folytatás, nem új indítás)
      || (e.running && online.find((s) => e.running.some((r) => r.hostId === s.hostId)))
      || (e.prefer && online.find((s) => s.hostId === e.prefer))
      || (preferLocal ? online.find((s) => s.local) : online.find((s) => !s.local))
      || online[0];
    if (src.local) {
      const g = (await library.localGames(false)).find((x) => x.id === src.gameId);
      if (!g) throw new Error('A játék már nincs telepítve ezen a gépen');
      if ((await runningGames([g])).length) return { local: true, hostName: src.hostName, alreadyRunning: true };
      launchGame(g, e.prefs && e.prefs.args);
      library.recordLaunch(key);
      log(`[play] helyi indítás: ${e.name}`);
      setTimeout(() => { if (win && !streaming) { win.setFullScreen(false); win.minimize(); } }, 2500);
      return { local: true, hostName: src.hostName };
    }
    const h = getHost(src.hostId);
    const lr = await agentRequest(h, 'POST', '/api/launch', { id: src.gameId, args: (e.prefs && e.prefs.args) || '' });
    log(`[play] ${lr.alreadyRunning ? 'folytatás' : 'stream indítás'}: ${e.name} @ ${h.name}`);
    if (!lr.alreadyRunning) library.recordLaunch(key);
    if (streamEngine() === 'builtin') {
      // a beépített streamet a renderer indítja (WebRTC); a játékidőt a stream vége után rögzítjük
      clientStream = { key, hostId: h.id, since: Date.now() };
      return { local: false, hostName: h.name, builtin: true, hostId: h.id, alreadyRunning: !!lr.alreadyRunning, gameId: src.gameId, prefs: e.prefs || null };
    }
    await new Promise((r) => setTimeout(r, 1200));
    startStream(h, key);
    return { local: false, hostName: h.name };
  });
  handle('stream-desktop', (hostId) => {
    if (streamEngine() === 'builtin') { clientStream = { key: null, hostId, since: Date.now() }; return { builtin: true, hostId }; }
    return startStream(getHost(hostId));
  });

  // ---- Kilépés a játékból (a játék összes folyamatának leállítása azon a gépen, ahol fut) ----
  handle('quit-game', async (key, hostId) => {
    const e = library.find(key);
    if (!e) throw new Error('A játék nem található');
    const where = hostId || (e.running && e.running[0] && e.running[0].hostId);
    const src = e.sources.find((s) => s.hostId === where);
    if (!src) throw new Error('A játék nem fut egyik gépen sem');
    log(`[play] kilépés a játékból: ${e.name} @ ${src.hostName}`);
    if (src.local) {
      const g = (await library.localGames(false)).find((x) => x.id === src.gameId);
      return quitGame(g);
    }
    return agentRequest(getHost(src.hostId), 'POST', '/api/quit', { id: src.gameId }, 30000);
  });

  // ---- Beépített stream: kliens oldali jelzéscsere a host agenttel ----
  handle('stream-offer', async (hostId, payload) => {
    stopVideoReceiver();
    // a kliens buildje a host naplójához (verzióeltérés felderítése)
    try { payload.clientBuild = JSON.parse(fs.readFileSync(path.join(path.dirname(process.execPath), 'build.json'), 'utf8')).build; } catch { payload.clientBuild = app.isPackaged ? 'ismeretlen' : 'dev'; }
    const answer = hostId === 'local'
      ? await getStreamHost().offer(payload, 'helyi teszt')
      : await agentRequest(getHost(hostId), 'POST', '/api/stream/offer', payload, 25000);
    if (answer.udp) await startVideoReceiver(hostId === 'local' ? '127.0.0.1' : getHost(hostId).address, answer.udp);
    return { sdp: answer.sdp, vigem: answer.vigem, udp: !!answer.udp };
  });
  handle('stream-keyreq', () => { if (videoRx) videoRx.requestKey(); return true; });
  handle('stream-stop', async (hostId) => {
    if (clientStream) {
      const dur = Date.now() - clientStream.since;
      if (clientStream.key && dur > 15000) library.addPlaytime(clientStream.key, dur / 1000);
      log(`[stream] beépített stream vége (${Math.round(dur / 1000)} mp)`);
      clientStream = null;
    }
    if (clientBlocker !== null) { powerSaveBlocker.stop(clientBlocker); clientBlocker = null; }
    stopVideoReceiver();
    if (hostId === 'local') { if (streamHost) streamHost.stop('helyi teszt vége'); return true; }
    const h = getHost(hostId);
    return agentRequest(h, 'POST', '/api/stream/stop', {}, 4000).catch(() => true);
  });
  handle('host-running', async (hostId) => {
    const h = getHost(hostId);
    if (!h) return [];
    const r = await agentRequest(h, 'GET', '/api/running', null, 4000);
    return r.running || [];
  });
  handle('update-state', () => publicUpdate());
  handle('update-check', () => checkUpdate(true));
  handle('update-download', () => downloadUpdate());
  handle('update-cancel', () => { if (updateAbort) updateAbort.abort(); return true; });
  handle('update-apply', () => applyUpdate());
  handle('update-log', () => updateLog());
  handle('stream-client-state', (active) => {
    if (active && clientBlocker === null) clientBlocker = powerSaveBlocker.start('prevent-display-sleep');
    if (!active && clientBlocker !== null) { powerSaveBlocker.stop(clientBlocker); clientBlocker = null; }
    return true;
  });

  // ---- Játék műveletek (ellenőrzés, eltávolítás, mappa) helyben vagy távoli gépen ----
  handle('game-action', async (key, hostId, action) => {
    const e = library.find(key);
    const src = e && e.sources.find((s) => s.hostId === hostId);
    if (!src) throw new Error('A játék nem található ezen a gépen');
    if (src.local) {
      const g = (await library.localGames(true)).find((x) => x.id === src.gameId);
      return gameAction(g, action);
    }
    if (action === 'folder') throw new Error('Távoli gép mappáját az asztal streamben tudod megnyitni');
    return agentRequest(getHost(hostId), 'POST', '/api/action', { id: src.gameId, action }, 15000);
  });

  // ---- Energia ----
  handle('power', async (hostId, action) => {
    if (hostId === 'local') {
      if (action === 'sleep') { hideConsole(); display.sleep(); return { ok: true }; }
      // leállítás/újraindítás/kijelentkezés előtt az eredeti beállítások visszaállítása (fedél, zárolás)
      if (['restart', 'shutdown', 'logoff'].includes(action)) {
        await display.restore().catch(() => {});
        const c = cfg.get();
        if (c.power.originalLock && (c.display.noLockMode || 'off') !== 'always') await applyLockSetting(false).catch(() => {});
      }
      return powerAction(action);
    }
    if (action === 'logoff') throw new Error('Távoli gépről nem lehet kijelentkezni');
    return agentRequest(getHost(hostId), 'POST', '/api/power', { action }, 5000);
  });

  // ---- Rendszer info (lemezterület) ----
  handle('system', async (hostId) => {
    if (hostId === 'local') {
      const gs = await library.localGames(false);
      return { disks: diskInfo([...gs.map((g) => g.installDir), process.env.SystemDrive || 'C:']) };
    }
    return agentRequest(getHost(hostId), 'GET', '/api/system', null, 5000);
  });

  // ---- Hangerő, hálózat ----
  handle('volume', (cmd) => {
    if (!/^(VOLGET|VOLSET \d{1,3}|VOLMUTE [01])$/.test(cmd)) throw new Error('Érvénytelen hangerő parancs');
    return display.volume(cmd);
  });
  handle('network', () => networkInfo());

  // ---- Áruház ----
  handle('store-rows', () => steamStoreRows());

  // ---- Témák export / import ----
  handle('theme-export', (theme) => {
    const safe = String(theme.name || 'tema').replace(/[^\p{L}\p{N} _-]/gu, '').trim().replace(/\s+/g, '-') || 'tema';
    const file = path.join(app.getPath('documents'), `InariX-tema-${safe}.json`);
    fs.writeFileSync(file, JSON.stringify({ inarixTheme: 1, ...theme }, null, 2));
    return file;
  });
  handle('theme-import', (file) => {
    if (!/\.json$/i.test(file) || !fs.existsSync(file)) throw new Error('Nem található .json fájl ezen az útvonalon');
    const t = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
    if (!t || typeof t !== 'object' || !t.a1 || !t.a2) throw new Error('Ez nem InariX téma fájl');
    const hex = /^#[0-9a-f]{6}$/i;
    for (const k of ['a1', 'a2', 'bg', 'panel']) if (t[k] && !hex.test(t[k])) throw new Error(`Érvénytelen szín: ${k}`);
    return t;
  });
  handle('store-details', (appid) => library.storeDetails(String(appid).replace(/\D/g, '')));
  handle('stop-stream', () => { if (streaming) streaming.proc.kill(); });
  handle('install', async (hostId, item) => {
    const h = getHost(hostId);
    if (h.local) return installGame(item);
    return agentRequest(h, 'POST', '/api/install', item, 20000);
  });
  handle('owned', async (hostId) => {
    const h = getHost(hostId);
    if (h.local) {
      const installed = new Set((await hostGames(h)).map((g) => g.id));
      const c = cfg.get();
      return ownedGames({ steamApiKey: c.account.steamApiKey || c.hostMode.steamApiKey }, installed);
    }
    return (await agentRequest(h, 'GET', '/api/owned', null, 60000)).games;
  });
  handle('store-search', (q) => steamSearch(q));
  handle('discover', () => discover(1800));
  handle('host-add', async (h) => {
    const host = {
      id: `h${Date.now().toString(36)}`, name: h.name || h.address, address: String(h.address).trim(),
      port: Number(h.port) || AGENT_PORT, token: String(h.token || '').trim(), mac: h.mac || '', streamHost: h.streamHost || '',
    };
    const info = await agentRequest(host, 'GET', '/api/auth', null, 4000);
    host.name = h.name || info.name || host.name;
    if (!host.mac && info.macs) {
      const m = info.macs.find((x) => x.ip === host.address) || info.macs[0];
      host.mac = m ? m.mac : '';
    }
    cfg.update({ hosts: [...cfg.get().hosts, host], lastHostId: host.id });
    return host;
  });
  handle('host-remove', (id) => { cfg.update({ hosts: cfg.get().hosts.filter((h) => h.id !== id) }); });
  handle('host-update', (id, patch) => {
    cfg.update({ hosts: cfg.get().hosts.map((h) => (h.id === id ? { ...h, ...patch } : h)) });
  });
  handle('wake', async (hostId) => {
    const h = getHost(hostId);
    if (!h.mac) throw new Error('Ehhez a géphez nincs MAC cím megadva');
    await wakeOnLan(h.mac);
    // VPN / más hálózat: a többi elérhető InariX gép (vagy Raspberry Pi agent) is kiküldi a saját hálózatán
    const relays = cfg.get().hosts.filter((x) => x.id !== h.id && hostOnline[x.id]);
    const res = await Promise.all(relays.map((x) => agentRequest(x, 'POST', '/api/wake', { mac: h.mac }, 4000).then(() => x.name).catch(() => null)));
    const via = res.filter(Boolean);
    if (via.length) log(`[wake] ${h.name} ébresztése továbbítva: ${via.join(', ')}`);
    return { ok: true, via };
  });
  handle('settings', async (partial) => {
    const before = JSON.stringify(cfg.get().hostMode);
    cfg.update(partial);
    if (partial.account || (partial.library && 'showOwned' in partial.library)) library.ownedCache = null;
    if (partial.account) accounts.sync('steam', true).catch(() => {});
    if (partial.autostart !== undefined) applyAutostart();
    if (partial.display) {
      display.applyLidPolicy();
      await lockPolicy();
    }
    if (JSON.stringify(cfg.get().hostMode) !== before) await applyHostMode();
    return publicState();
  });
  handle('host-token-new', async () => { cfg.update({ hostMode: { token: newToken() } }); await applyHostMode(); return cfg.get().hostMode.token; });
  handle('moonlight-install', async () => {
    const r = await moonlight.installWithWinget();
    if (!moonlight.findMoonlight()) throw new Error(`Telepítés sikertelen: ${(r.stdout + r.stderr).trim().slice(-300)}`);
    return moonlight.findMoonlight();
  });
  // Automatikus párosítás: mi generáljuk a PIN-t, a Moonlight vele párosít,
  // a host agent pedig a Sunshine API-n beküldi. Ha a hoston nincs Sunshine jelszó, a PIN-t kézzel kell beírni.
  handle('moonlight-autopair', async (hostId) => {
    const exe = moonlight.findMoonlight(cfg.get().moonlight.path);
    if (!exe) throw new Error('A Moonlight nincs telepítve');
    const h = getHost(hostId);
    const target = h.streamHost || h.address;
    const pin = String(1000 + Math.floor(Math.random() * 9000));
    log(`[pair] párosítás indul: ${h.name}`);
    const pairing = moonlight.pairWithPin(exe, target, pin);
    await new Promise((r) => setTimeout(r, 2500));
    let lastErr = null;
    for (let i = 0; i < 5; i++) {
      try {
        await agentRequest(h, 'POST', '/api/pair', { pin, name: require('os').hostname() }, 10000);
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        if (/NOCREDS|Hibás|nem fut/.test(e.message)) break;
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    if (lastErr) {
      log(`[pair] automatikus PIN beküldés nem sikerült: ${lastErr.message}`);
      pairing.then((r) => {
        log(`[pair] kézi párosítás eredménye: ${r.code}`);
        sendUI('pair', { hostId, ok: r.code === 0 });
      });
      return { manual: true, pin, reason: lastErr.message.replace(/^NOCREDS: /, '') };
    }
    const r = await pairing;
    log(`[pair] eredmény: ${r.code} ${r.out.trim().slice(-200)}`);
    if (r.code !== 0) throw new Error(`A párosítás nem sikerült (${r.out.trim().split('\n').pop() || r.code})`);
    return { ok: true };
  });
  handle('diagnostics', () => runDiagnostics());
  // Könyvtár szinkron (fiókok)
  handle('account-connect', (store) => ({ url: accounts.beginLogin(store) }));
  handle('account-cancel', () => accounts.cancel());
  handle('account-device', (store) => accounts.startDeviceLogin(store));
  handle('account-external', (store) => { const u = accounts.externalLoginUrl(store); shell.openExternal(u); return { url: u }; });
  handle('account-code', (store, text) => accounts.submitCode(store, text));
  handle('account-disconnect', (store) => { accounts.disconnect(store); return publicState(); });
  handle('account-sync', async (store) => { if (store) await accounts.sync(store, true); else await accounts.syncAll(true); return publicState(); });
  handle('account-syncing', () => Object.keys(accounts.syncing));
  // Szinkron indítása egy távoli gépen (a host fiókjaival)
  handle('account-sync-remote', async (hostId, store) => {
    const h = cfg.get().hosts.find((x) => x.id === hostId);
    if (!h) throw new Error('Ismeretlen gép');
    const r = await agentRequest(h, 'POST', '/api/accounts/sync', { store: store || null }, 180000);
    return r.status;
  });
  // Beépített böngésző
  handle('browser-clear', (what) => browser.clearData(what));
  handle('browser-show-download', (file) => {
    // csak a Letöltések mappán belüli fájlt mutatjuk meg (megnyitni/futtatni nem engedjük)
    const dir = path.resolve(browser.downloadsDir());
    const f = path.resolve(String(file || ''));
    if (!f.toLowerCase().startsWith(dir.toLowerCase() + path.sep)) throw new Error('Nem engedélyezett');
    shell.showItemInFolder(f); hideConsole();
    return true;
  });
  handle('admin-state', () => adminModeState());
  handle('admin-mode', (on) => (on ? enableAdminMode() : disableAdminMode()));
  handle('lock-state', () => power.getLockState());
  // Windows beállítási oldalak / rendszereszközök megnyitása (csak engedélyezett listából)
  handle('open-system', (what) => {
    const allowed = { signin: 'ms-settings:signinoptions', power: 'ms-settings:powersleep', display: 'ms-settings:display' };
    if (what === 'netplwiz') { require('../core/util').startExe('netplwiz.exe'); hideConsole(); return true; }
    if (!allowed[what]) throw new Error('Nem engedélyezett');
    shell.openExternal(allowed[what]); hideConsole();
    return true;
  });
  handle('sunshine-check', () => require('../core/sunshine').checkCreds({ user: cfg.get().hostMode.sunshineUser, pass: cfg.get().hostMode.sunshinePass }));
  handle('moonlight-gui', () => {
    const exe = moonlight.findMoonlight(cfg.get().moonlight.path);
    if (!exe) throw new Error('A Moonlight nincs telepítve');
    moonlight.openGui(exe); hideConsole();
  });
  handle('topology', (t) => display.setTopology(t));
  // Windows tűzfal szabályok a Host módhoz (UAC megerősítést kér)
  handle('firewall', async () => {
    const port = Number(cfg.get().hostMode.port) || AGENT_PORT;
    const exe = process.execPath.replace(/'/g, "''");
    const inner = [
      "Remove-NetFirewallRule -DisplayName 'InariX Host*' -ErrorAction SilentlyContinue",
      `New-NetFirewallRule -DisplayName 'InariX Host TCP' -Direction Inbound -Protocol TCP -LocalPort ${port} -Action Allow -Profile Any -RemoteAddress LocalSubnet,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,100.64.0.0/10`,
      `New-NetFirewallRule -DisplayName 'InariX Host UDP' -Direction Inbound -Protocol UDP -LocalPort ${port + 1} -Action Allow -Profile Any -RemoteAddress LocalSubnet,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,100.64.0.0/10`,
      "New-NetFirewallRule -DisplayName 'InariX Host Stream UDP' -Direction Inbound -Protocol UDP -LocalPort 47802 -Action Allow -Profile Any -RemoteAddress LocalSubnet,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,100.64.0.0/10",
      `New-NetFirewallRule -DisplayName 'InariX Host App' -Direction Inbound -Program '${exe}' -Action Allow -Profile Any -RemoteAddress LocalSubnet,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,100.64.0.0/10`,
    ].join('; ');
    const encoded = Buffer.from(inner, 'utf16le').toString('base64');
    const r = await require('../core/util').run('powershell.exe', ['-NoProfile', '-Command',
      `Start-Process powershell -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile','-EncodedCommand','${encoded}'`], { timeout: 120000 });
    if (r.code !== 0) throw new Error('A tűzfal szabály nem jött létre (elutasítottad az admin jogot?)');
    log('[setup] tűzfal szabályok létrehozva');
    return true;
  });
  handle('hide', () => hideConsole());
  handle('sleep', () => { hideConsole(); display.sleep(); });
  handle('quit', () => { app.isQuitting = true; app.quit(); });
  handle('open-external', (url) => { if (/^https:\/\//.test(url)) shell.openExternal(url); });
}

// ---------- Hálózat: Wi-Fi jelerősség (netsh, nyelvfüggetlen feldolgozás) ----------
let netCache = { at: 0, data: null };
async function networkInfo() {
  if (Date.now() - netCache.at < 5000 && netCache.data) return netCache.data;
  const r = await run('netsh', ['wlan', 'show', 'interfaces']);
  let data = { type: 'ethernet', signal: null, ssid: null };
  if (r.code === 0) {
    const lines = r.stdout.split(/\r?\n/);
    const connected = lines.some((l) => /:\s*(connected|csatlakoztatva|verbunden)\s*$/i.test(l));
    const sig = lines.map((l) => /:\s*(\d{1,3})\s*%\s*$/.exec(l)).find(Boolean);
    const ssid = lines.map((l) => /^\s*SSID\s*:\s*(.+)$/.exec(l)).find(Boolean);
    if (connected || sig) data = { type: 'wifi', signal: sig ? parseInt(sig[1], 10) : null, ssid: ssid ? ssid[1].trim() : null };
  }
  netCache = { at: Date.now(), data };
  return data;
}

// ---------- Rendszergazdai mód (admin jogot kérő játékok streameléshez) ----------
// 1) "InariX Host" ütemezett feladat: bejelentkezéskor rendszergazdaként indul (UAC kérdés nélkül) →
//    az általa indított programok nem kérnek UAC-ot, és a bemeneti segéd az emelt jogú ablakokat is vezérli.
// 2) PromptOnSecureDesktop=0: az UAC ablak a normál asztalon jelenik meg → látszik a streamben, a laptopról kattintható.
const ADMIN_TASK = 'InariX Host';
let elevatedCache = null;
async function isElevated() {
  if (elevatedCache !== null) return elevatedCache;
  const r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)']);
  elevatedCache = /true/i.test(r.stdout);
  return elevatedCache;
}
async function adminModeState() {
  const [elevated, task, sec] = await Promise.all([
    isElevated(),
    run('schtasks', ['/Query', '/TN', ADMIN_TASK]),
    power.regGet('HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System', 'PromptOnSecureDesktop'),
  ]);
  return { elevated, task: task.code === 0, uacOnSecureDesktop: sec === null ? true : Number(sec) !== 0 };
}
// Emelt jogú PowerShell parancs futtatása (egy UAC jóváhagyás)
async function runElevated(script) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const r = await run('powershell.exe', ['-NoProfile', '-Command',
    `try { $p = Start-Process powershell -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand','${encoded}'; exit $p.ExitCode } catch { exit 1223 }`], { timeout: 180000 });
  if (r.code === 1223) throw new Error('Elutasítottad a rendszergazdai jóváhagyást');
  if (r.code !== 0) throw new Error(`A művelet nem sikerült (kód ${r.code})`);
}
async function enableAdminMode() {
  const exe = process.execPath.replace(/'/g, "''");
  const argsLine = (app.isPackaged ? '--background' : `"${app.getAppPath()}" --background`).replace(/'/g, "''");
  const user = `${process.env.USERDOMAIN || ''}\\${process.env.USERNAME || ''}`.replace(/'/g, "''");
  await runElevated([
    `$a = New-ScheduledTaskAction -Execute '${exe}' -Argument '${argsLine}'`,
    `$t = New-ScheduledTaskTrigger -AtLogOn -User '${user}'`,
    `$p = New-ScheduledTaskPrincipal -UserId '${user}' -LogonType Interactive -RunLevel Highest`,
    '$s = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Seconds 0) -MultipleInstances IgnoreNew',
    `Register-ScheduledTask -TaskName '${ADMIN_TASK}' -Action $a -Trigger $t -Principal $p -Settings $s -Force | Out-Null`,
    "New-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System' -Name PromptOnSecureDesktop -Value 0 -PropertyType DWord -Force | Out-Null",
    'exit 0',
  ].join('; '));
  cfg.update({ hostMode: { adminMode: true } });
  applyAutostart();
  log('[admin] rendszergazdai mód bekapcsolva – újraindítás emelt joggal');
  // a régi példány kilép, majd az ütemezett feladat emelt joggal újraindítja
  spawn('cmd.exe', ['/c', `timeout /t 2 /nobreak >nul & schtasks /Run /TN "${ADMIN_TASK}"`], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  setTimeout(() => { app.isQuitting = true; app.quit(); }, 300);
  return true;
}
async function disableAdminMode() {
  await runElevated([
    `Unregister-ScheduledTask -TaskName '${ADMIN_TASK}' -Confirm:$false -ErrorAction SilentlyContinue`,
    "New-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System' -Name PromptOnSecureDesktop -Value 1 -PropertyType DWord -Force | Out-Null",
    'exit 0',
  ].join('; '));
  cfg.update({ hostMode: { adminMode: false } });
  applyAutostart();
  log('[admin] rendszergazdai mód kikapcsolva');
  if (await isElevated() && app.isPackaged) {
    // emelt példányból normál jogú újraindítás: az Intézőn keresztül indítva nem örökli az emelt jogot
    spawn('cmd.exe', ['/c', `timeout /t 2 /nobreak >nul & explorer.exe "${process.execPath}"`], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    setTimeout(() => { app.isQuitting = true; app.quit(); }, 300);
  }
  return true;
}

// ---------- Zárolás kikapcsolása / visszaállítása ----------
// noLockMode: off = a Windows dönt · always = soha ne kérjen (kilépés után is) · running = amíg a InariX fut
// (háttérben is), kilépéskor visszaáll · docked = ne kérjen, amíg külső kijelző van
// vagy Mindig kész mód aktív (így a lecsukott, ébren tartott laptop bedugáskor egyből a konzolt mutatja).
let lockChain = Promise.resolve();
function lockPolicy() {
  lockChain = lockChain.then(async () => {
    const c = cfg.get();
    const mode = c.display.noLockMode || (c.display.disableLockOnWake ? 'always' : 'off');
    const st = display ? display.status() : { external: false };
    const want = mode === 'always' || mode === 'running'
      || (mode === 'docked' && (st.external || (display && display.alwaysReadyActive())));
    const applied = !!c.power.originalLock;
    if (want !== applied) await applyLockSetting(want);
  }).catch((e) => log('[lock] hiba', e.message));
  return lockChain;
}

async function applyLockSetting(noLock) {
  try {
    if (noLock) {
      const orig = await power.disableLock(cfg.get().power.originalLock);
      cfg.update({ power: { originalLock: orig } });
      log('[lock] Windows zárolás kikapcsolva (ébredés, képernyővédő, Modern Standby)');
    } else {
      await power.restoreLock(cfg.get().power.originalLock);
      cfg.update({ power: { originalLock: null } });
      log('[lock] Windows zárolás visszaállítva');
    }
  } catch (e) { log('[lock] hiba', e.message); throw e; }
}

// ---------- Diagnosztika: minden fontos részegység ellenőrzése ----------
async function runDiagnostics() {
  const c = cfg.get();
  const out = [];
  const add = (group, name, status, detail) => out.push({ group, name, status, detail });
  const ds = display.status();
  const lidName = (v) => ({ 0: 'semmi', 1: 'alvás', 2: 'hibernálás', 3: 'leállítás' }[v] ?? String(v));

  add('Rendszer', 'InariX verzió', 'info', `${VERSION} · Electron ${process.versions.electron} · ${app.isPackaged ? 'telepített' : 'fejlesztői mód'}`);
  add('Rendszer', 'Natív rendszerfigyelő', ds.ready ? 'ok' : 'err', ds.ready ? 'fut (fedél, kijelzők, hangerő)' : 'nem indult el – PowerShell vagy .NET hiba, lásd a naplót');
  add('Rendszer', 'Eszköz típusa', 'info', ds.isLaptop ? 'Laptop' : 'Asztali gép (fedél automatika nem szükséges)');
  add('Kijelző', 'Kijelzők', 'info', `külső: ${ds.ext} (aktív: ${ds.extActive}) · belső: ${ds.int} (aktív: ${ds.intActive})`);
  add('Kijelző', 'Fedél állapota', ds.lid === 'unknown' ? (ds.isLaptop ? 'warn' : 'info') : 'ok', { open: 'nyitva', closed: 'lecsukva', unknown: 'nem jelzett még' }[ds.lid]);
  const lid = await power.getLidAction().catch(() => null);
  if (lid) {
    const expect0 = (c.display.keepAwakeOnLid && ds.ext > 0) || (c.display.alwaysReady && (!c.display.alwaysReadyOnlyAC || ds.onAC));
    const ok = expect0 ? lid.ac === 0 && lid.dc === 0 : true;
    add('Kijelző', 'Fedél lecsukás művelet', ok ? 'ok' : 'err', `töltőn: ${lidName(lid.ac)} · akkuról: ${lidName(lid.dc)}${expect0 ? ' (elvárt: semmi)' : ''}${c.power.originalLid ? ` · eredeti mentve: ${lidName(c.power.originalLid.ac)}/${lidName(c.power.originalLid.dc)}` : ''}`);
  } else add('Kijelző', 'Fedél lecsukás művelet', ds.isLaptop ? 'warn' : 'info', 'nem elérhető ezen a gépen (powercfg nem ad LIDACTION értéket)');
  const ls = await power.getLockState().catch(() => null);
  if (ls) {
    const mode = c.display.noLockMode || (c.display.disableLockOnWake ? 'always' : 'off');
    const want = mode === 'always' || mode === 'running' || (mode === 'docked' && (ds.external || display.alwaysReadyActive()));
    if (mode === 'docked') add('Zárolás', 'PIN mód', 'info', `„Nem kér dokkolva” – most ${want ? 'aktív (nem kér)' : 'inaktív (kér, mert nincs külső kijelző)'}`);
    const wakeOk = ls.wakeLockNever && (!ls.consoleLock || (!ls.consoleLock.ac && !ls.consoleLock.dc));
    add('Zárolás', 'PIN / jelszó ébredéskor', want ? (wakeOk ? 'ok' : 'err') : 'info',
      wakeOk ? 'nem kér (a kijelző bedugásakor egyből a konzol jön)' : `kér${want ? ' – a beállítás nem érvényesült (céges gép? lásd a házirend sort)' : ' (Beállítások → Kijelző és fedél → PIN / jelszó kérése)'}`);
    add('Zárolás', 'Képernyővédő zárolás', ls.screenSaverSecure ? (want ? 'warn' : 'info') : 'ok', ls.screenSaverSecure ? 'zárol' : 'nem zárol');
    if (ls.policyTimeout) add('Zárolás', 'Céges házirend', 'warn', `inaktivitás után ${Math.round(ls.policyTimeout / 60)} perccel zárol – ezt csak a rendszergazda kapcsolhatja ki`);
    add('Zárolás', 'Automatikus bejelentkezés gépindításkor', ls.autoLogon ? 'ok' : 'info',
      ls.autoLogon ? 'bekapcsolva' : `kikapcsolva${ls.helloOnly ? ' · a „csak Windows Hello” mód be van kapcsolva, előbb azt kell kikapcsolni' : ''} (Beállítások → Kijelző és fedél → útmutató)`);
  }
  add('Kijelző', 'Konzol mód külső kijelzőn', c.display.autoConsole ? 'ok' : 'warn', c.display.autoConsole ? `bekapcsolva · kijelző mód: ${c.display.topology}` : 'kikapcsolva');
  if (process.platform === 'win32' && app.isPackaged) {
    const li = app.getLoginItemSettings({ path: process.execPath, args: ['--background'] });
    add('Rendszer', 'Indítás a Windows-zal', li.openAtLogin ? 'ok' : (c.autostart ? 'err' : 'warn'), li.openAtLogin ? 'regisztrálva' : 'nincs regisztrálva – nélküle nem indul automatikusan a konzol mód');
  } else add('Rendszer', 'Indítás a Windows-zal', 'info', 'fejlesztői módban nem regisztráljuk');

  const builtin = (c.stream.engine || 'builtin') === 'builtin';
  add('Streaming', 'Stream motor', 'info', builtin ? 'Beépített (InariX) – nem kell Sunshine és Moonlight' : 'Moonlight + Sunshine');
  if (!builtin) {
    const ml = moonlight.findMoonlight(c.moonlight.path);
    add('Streaming', 'Moonlight', ml ? 'ok' : (c.hosts.length ? 'err' : 'warn'), ml || 'nincs telepítve (Beállítások → Streaming)');
  }
  const net = await networkInfo().catch(() => null);
  if (net) add('Streaming', 'Hálózat', net.type === 'wifi' && net.signal !== null && net.signal < 50 ? 'warn' : 'ok', net.type === 'wifi' ? `Wi-Fi ${net.ssid || ''} · ${net.signal ?? '?'}%` : 'vezetékes / egyéb');
  for (const h of c.hosts) {
    const t0 = Date.now();
    try {
      const i = await agentRequest(h, 'GET', '/api/auth', null, 3000);
      const ms = Date.now() - t0;
      add('Gépek', h.name, ms > 60 ? 'warn' : 'ok', `elérhető · ${ms} ms${ms > 60 ? ' (magas késleltetés)' : ''}`);
      if (builtin) {
        const s = i.stream || {};
        add('Gépek', `${h.name} – beépített stream`, s.available ? 'ok' : 'err', s.available ? 'elérhető' : 'nem elérhető – a gaming PC-n a InariX appban kell Host módot bekapcsolni (nem az önálló agent)');
        if (s.available) add('Gépek', `${h.name} – virtuális kontroller`, s.vigem === false ? 'warn' : 'ok', s.vigem === false ? 'nincs ViGEmBus driver – kontroller nem megy (billentyűzet/egér igen)' : s.vigem ? 'ViGEmBus rendben' : 'az első streamnél derül ki');
      } else {
        add('Gépek', `${h.name} – Sunshine`, i.sunshine && i.sunshine.running ? 'ok' : 'err', !i.sunshine ? 'ismeretlen' : !i.sunshine.installed ? 'nincs telepítve' : i.sunshine.running ? 'fut' : 'telepítve, de nem fut');
      }
      if (!h.mac) add('Gépek', `${h.name} – Wake-on-LAN`, 'warn', 'nincs MAC cím megadva');
    } catch (e) {
      add('Gépek', h.name, 'err', e.message);
    }
  }
  if (!c.hosts.length) add('Gépek', 'Gaming PC', 'warn', 'még nincs hozzáadva (Gépek fül)');

  if (c.hostMode.enabled) {
    add('Host mód', 'Agent', agent ? 'ok' : 'err', agent ? `fut a ${c.hostMode.port}-es porton · PIN: ${c.hostMode.token}` : 'nem fut (foglalt port?)');
    const am = await adminModeState().catch(() => null);
    if (am) {
      add('Host mód', 'Rendszergazdai mód', am.elevated ? 'ok' : (c.hostMode.adminMode ? 'err' : 'info'),
        am.elevated ? 'a InariX rendszergazdaként fut – az indított programok nem kérnek UAC-ot' : (c.hostMode.adminMode ? 'be van kapcsolva, de a InariX nem emelt joggal fut – indítsd újra (vagy jelentkezz ki-be)' : 'kikapcsolva – admin jogot kérő játéknál a gaming PC-nél kell jóváhagyni'));
      add('Host mód', 'UAC ablak a streamben', am.uacOnSecureDesktop ? (c.hostMode.adminMode ? 'warn' : 'info') : 'ok',
        am.uacOnSecureDesktop ? 'nem látszik (biztonsági asztal) – a stream megáll, amíg a gaming PC-nél jóvá nem hagyod' : 'látszik a streamben, a laptopról jóváhagyható');
    }
    const fw = await run('netsh', ['advfirewall', 'firewall', 'show', 'rule', 'name=InariX Host TCP']);
    add('Host mód', 'Tűzfal szabály', fw.code === 0 ? 'ok' : 'warn', fw.code === 0 ? 'létrehozva' : 'nincs – Beállítások → Host mód → Tűzfal engedélyezése');
    if (c.hostMode.sunshineUser) {
      try { await require('../core/sunshine').checkCreds({ user: c.hostMode.sunshineUser, pass: c.hostMode.sunshinePass }); add('Host mód', 'Sunshine API', 'ok', 'bejelentkezés rendben – automatikus párosítás elérhető'); }
      catch (e) { add('Host mód', 'Sunshine API', 'err', e.message); }
    } else add('Host mód', 'Sunshine API', 'warn', 'nincs megadva felhasználó/jelszó – a párosítás PIN-jét kézzel kell beírni');
  }
  if (c.account.steamApiKey) {
    try { const n = (await library.ownedSteam()).length; add('Fiók', 'Steam Web API', n ? 'ok' : 'warn', n ? `${n} saját játék` : 'a kulcs működik, de 0 játék (privát profil?)'); }
    catch (e) { add('Fiók', 'Steam Web API', 'err', e.message); }
  }
  return out;
}

// ---------- Gép monitor: távoli gépek elérhetősége a háttérben ----------
const hostOnline = {};
const hostInfo = {};
function startHostMonitor() {
  const tick = async () => {
    const hosts = cfg.get().hosts;
    const changes = [];
    await Promise.all(hosts.map(async (h) => {
      let online = false;
      const t0 = Date.now();
      try { hostInfo[h.id] = await agentRequest(h, 'GET', '/api/auth', null, 2500); hostInfo[h.id].ping = Date.now() - t0; online = true; } catch { online = false; }
      // a gépen új csomag készült → azonnal ellenőrizzük és értesítünk (nem kell 5 percet várni)
      const ub = online && hostInfo[h.id].updateBuild;
      if (ub && (!updateInfo || updateInfo.build !== ub) && ub !== lastSeenBuild) { lastSeenBuild = ub; checkUpdate().catch(() => {}); }
      if (hostOnline[h.id] !== undefined && hostOnline[h.id] !== online) changes.push({ id: h.id, name: h.name, online });
      hostOnline[h.id] = online;
    }));
    if (changes.length) {
      for (const c of changes) log(`[hosts] ${c.name}: ${c.online ? 'online' : 'offline'}`);
      sendUI('hosts', { changes, status: { ...hostOnline } });
    }
  };
  tick();
  setInterval(tick, 15000);
}

// ---------- Start menü parancsikon (csomagolt verzió első indításakor) ----------
const SHORTCUTS = () => [
  path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'InariX.lnk'),
  path.join(app.getPath('desktop'), 'InariX.lnk'),
];
// Parancsikonok létrehozása, illetve frissítése, ha az exe máshová került (pl. Letöltésekből a Programs mappába)
function ensureShortcuts() {
  // átnevezés (InariX → InariX): a régi parancsikonok törlése
  for (const old of [path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'InariX.lnk'), path.join(app.getPath('desktop'), 'InariX.lnk')]) {
    try { if (app.isPackaged && fs.existsSync(old)) fs.unlinkSync(old); } catch { /* */ }
  }
  if (!app.isPackaged || process.platform !== 'win32' || NO_INTEGRATION) return;
  for (const lnk of SHORTCUTS()) {
    try {
      let current = null;
      if (fs.existsSync(lnk)) { try { current = shell.readShortcutLink(lnk).target; } catch { current = null; } }
      if (current && path.resolve(current).toLowerCase() === path.resolve(process.execPath).toLowerCase()) continue;
      shell.writeShortcutLink(lnk, fs.existsSync(lnk) ? 'replace' : 'create', { target: process.execPath, description: 'InariX konzol', icon: process.execPath, iconIndex: 0 });
      log(`[setup] parancsikon: ${lnk}`);
    } catch (e) { log('[setup] parancsikon hiba', e.message); }
  }
}

// --cleanup: eltávolítás előtti takarítás (fedél művelet visszaállítása, autostart törlése, parancsikonok)
async function cleanupAndExit() {
  try {
    const c = new Config(app.getPath('userData'));
    if (c.get().power.originalLid) await power.setLidAction(c.get().power.originalLid).catch(() => {});
    if (c.get().display.disableLockOnWake || c.get().power.originalLock) await power.restoreLock(c.get().power.originalLock).catch(() => {});
    c.update({ power: { originalLid: null, originalLock: null } });
    app.setLoginItemSettings({ openAtLogin: false, path: process.execPath, args: ['--background'] });
    for (const lnk of SHORTCUTS()) { try { fs.unlinkSync(lnk); } catch { /* nincs */ } }
  } finally { app.exit(0); }
}

// ---------- Tálca ----------
function createTray() {
  // tálca ikon: csak a róka (assets/tray.png + tray@2x.png nagy DPI-hez)
  const TRAY = path.join(__dirname, '..', '..', 'assets', 'tray.png');
  const img = fs.existsSync(TRAY) ? nativeImage.createFromPath(TRAY) : fs.existsSync(ICON) ? nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }) : nativeImage.createEmpty();
  tray = new Tray(img);
  tray.setToolTip('InariX');
  const menu = () => Menu.buildFromTemplate([
    { label: 'Konzol megnyitása', click: () => showConsole({ boot: true }) },
    { label: `Host mód: ${agent ? 'fut' : 'ki'}`, enabled: false },
    { type: 'separator' },
    { label: 'Teszt: külső kijelző csatlakoztatás szimulálása', click: () => onDock(true) },
    { type: 'separator' },
    { label: 'Kilépés', click: () => { app.isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu());
  tray.on('click', () => showConsole());
  tray.on('right-click', () => tray.setContextMenu(menu()));
}

function onDock(simulated) {
  if (!cfg.get().display.autoConsole && !simulated) return;
  if (!simulated && display && !display.status().isLaptop) return;
  log('[display] konzol mód indítása');
  autoOpened = true;
  setTimeout(() => showConsole({ boot: true }), simulated ? 0 : 1800);
}

// ---------- Indulás ----------
app.whenReady().then(async () => {
  app.setAppUserModelId('InariX');
  if (args.includes('--cleanup')) return cleanupAndExit();
  cfg = new Config(app.getPath('userData'));
  library = new Library(app.getPath('userData'), () => cfg.get(), log);
  accounts = new Accounts(app.getPath('userData'), { getCfg: () => cfg.get(), updateCfg: (p) => cfg.update(p), log, sendUI });
  library.accounts = accounts;
  createWindow();
  setTimeout(() => checkUpdate().catch(() => {}), 20000);
  setTimeout(() => reportUpdateResult(), 6000);
  setInterval(() => checkUpdate().catch(() => {}), 5 * 60000);
  ensureShortcuts();
  startHostMonitor();
  createTray();
  registerIpc();
  applyAutostart();
  await applyHostMode();

  display = new DisplayManager(() => cfg.get(), (p) => cfg.update(p), log);
  display.on('state', (s) => sendUI('display', s));
  // játékon belüli overlay (Guide gomb) + teljesítmény kijelző
  if (!process.env.INARIX_NO_INTEGRATION) {
    overlay = setupOverlay({
      getWin: () => win, showConsole: () => showConsole(), log, getCfg: () => cfg.get(), updateCfg: (p) => cfg.update(p),
      volume: (cmd) => display.volume(cmd),
      runningLocal: async () => runningGames(await library.localGames(false)),
      quitLocal: async (id) => { const g = (await library.localGames(false)).find((x) => x.id === id); if (g) await quitGame(g); },
    });
  }
  display.on('dock', () => { lockPolicy(); onDock(false); });
  display.on('undock', () => {
    lockPolicy();
    if (cfg.get().display.hideOnUndock && autoOpened && !streaming) hideConsole();
  });
  display.on('initial', (s) => {
    lockPolicy();
    log(`[display] kijelzők: külső=${s.ext} belső=${s.int} laptop=${s.isLaptop}`);
    if (START_HIDDEN && s.isLaptop && s.ext > 0 && cfg.get().display.autoConsole) onDock(false);
  });
  display.setOnAC(!powerMonitor.isOnBatteryPower());
  powerMonitor.on('on-ac', () => { display.setOnAC(true); lockPolicy(); });
  powerMonitor.on('on-battery', () => { display.setOnAC(false); lockPolicy(); });
  powerMonitor.on('resume', () => { log('[power] ébredés'); display.send('QUERY'); });
  await display.start();

  if (!START_HIDDEN || FORCE_BOOT) win.once('ready-to-show', () => showConsole({ boot: true }));
  log(`InariX ${VERSION} elindult${START_HIDDEN ? ' (háttér)' : ''}`);
  if (process.env.INARIX_SCRIPT) runTestScript(process.env.INARIX_SCRIPT);
});

// Fejlesztői teszt: INARIX_SCRIPT="wait:3000;key:Right;shot:a.png;quit"
async function runTestScript(script) {
  const outDir = process.env.INARIX_SHOTDIR || app.getPath('temp');
  for (const step of script.split(';').map((x) => x.trim()).filter(Boolean)) {
    const [cmd, ...rest] = step.split(':');
    const arg = rest.join(':');
    if (cmd === 'wait') await new Promise((r) => setTimeout(r, Number(arg)));
    else if (cmd === 'key') {
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: arg });
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode: arg });
      await new Promise((r) => setTimeout(r, 250));
    } else if (cmd === 'shot') {
      const img = await win.webContents.capturePage();
      fs.writeFileSync(path.join(outDir, arg), img.toPNG());
      log(`[test] képernyőkép: ${arg}`);
    } else if (cmd === 'eval') {
      log('[test] eval:', JSON.stringify(await win.webContents.executeJavaScript(arg).catch((e) => e.message)));
    } else if (cmd === 'emit') {
      display.emit(arg, display.status());
    } else if (cmd === 'gpuinfo') {
      const gi = await app.getGPUInfo('complete').catch((e) => ({ error: e.message }));
      const enc = (gi.auxAttributes && gi.auxAttributes.videoEncodeAcceleratorSupportedProfile) || gi.videoEncodeAcceleratorSupportedProfile || null;
      const dec = (gi.auxAttributes && gi.auxAttributes.videoDecodeAcceleratorSupportedProfile) || null;
      log('[test] GPU encode:', JSON.stringify(enc));
      log('[test] GPU decode:', JSON.stringify(dec && dec.map ? dec.map((d) => d.profile) : dec));
      log('[test] GPU feature status:', JSON.stringify(app.getGPUFeatureStatus()));
    } else if (cmd === 'streamstats') {
      log('[test] host stream:', JSON.stringify(streamHost ? streamHost.status() : null));
    } else if (cmd === 'dock') {
      onDock(true);
    } else if (cmd === 'hide') {
      hideConsole();
    } else if (cmd === 'quit') { app.isQuitting = true; app.quit(); }
  }
}

app.on('second-instance', (_e, argv) => showConsole({ boot: argv.includes('--boot') }));
app.on('window-all-closed', (e) => e.preventDefault());
app.on('before-quit', () => { app.isQuitting = true; });
app.on('will-quit', async (e) => {
  if (display && !display.restoredOnQuit) {
    e.preventDefault();
    display.restoredOnQuit = true;
    setTimeout(() => app.exit(0), 3000); // biztonsági háló: semmi ne tartsa életben a folyamatot
    try {
      if (streaming) streaming.proc.kill();
      if (streamHost) streamHost.dispose();
      await display.restore();
      if (overlay) await overlay.dispose().catch(() => {});
      // a "running" és "docked" zárolási mód csak az app futása alatt érvényes → kilépéskor visszaállítjuk
      const c = cfg.get();
      if (c.power.originalLock && (c.display.noLockMode || 'off') !== 'always') await applyLockSetting(false).catch(() => {});
      display.stop();
      if (agent) await agent.stop().catch(() => {});
    } finally { app.exit(0); }
  }
});

// Kezeletlen hibák: naplózás fájlba, ne dobjon fel hibaablakot
function crashLog(kind, err) {
  const line = `[${new Date().toISOString()}] ${kind}: ${err && err.stack ? err.stack : err}\n`;
  try { fs.appendFileSync(path.join(app.getPath('userData'), 'error.log'), line); } catch { /* ignore */ }
  try { log(`[hiba] ${kind}: ${err && err.message ? err.message : err}`); } catch { /* ignore */ }
}
process.on('uncaughtException', (err) => crashLog('uncaughtException', err));
process.on('unhandledRejection', (err) => crashLog('unhandledRejection', err));
