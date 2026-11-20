'use strict';
// DRM-es streaming appok (Netflix, HBO Max): a beépített Electron nem tud Widevine / PlayReady lejátszást,
// ezért a gépen lévő Microsoft Edge-ben (vagy Chrome-ban) futnak, saját InariX profillal, app módban, teljes képernyőn.
// A kontrollert közben a padbridge segéd alakítja egér- és billentyűleütésekké; Guide (vagy View+Start): vissza az InariX-be.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn, execFile, execFileSync } = require('child_process');

const APPS = {
  netflix: { title: 'Netflix', url: 'https://www.netflix.com/browse' },
  hbomax: { title: 'HBO Max', url: 'https://play.hbomax.com/' },
};

function findBrowser() {
  const pf = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean);
  for (const [kind, rel] of [['edge', 'Microsoft\\Edge\\Application\\msedge.exe'], ['chrome', 'Google\\Chrome\\Application\\chrome.exe']]) {
    for (const base of pf) { const p = path.join(base, rel); if (fs.existsSync(p)) return { kind, exe: p }; }
  }
  return null;
}
let elevatedCache = null;
function isElevated() {
  if (elevatedCache === null) { try { execFileSync('net', ['session'], { stdio: 'ignore', windowsHide: true }); elevatedCache = true; } catch { elevatedCache = false; } }
  return elevatedCache;
}

function setupWebApps({ getWin, sendUI, log }) {
  let cur = null; // { id, dir, bridge, timer, closing }
  const profileDir = (kind) => path.join(app.getPath('userData'), 'webapps', kind);
  const lockOf = (dir) => path.join(dir, 'lockfile');
  // a Chromium a profil „lockfile”-ját kizárólagosan nyitva tartja, amíg fut
  function running(dir) {
    const f = lockOf(dir);
    if (!fs.existsSync(f)) return false;
    try { fs.rmSync(f); return false; } catch { return true; }
  }
  function killProfile(dir, force) {
    const needle = path.basename(path.dirname(dir)) + '\\' + path.basename(dir);
    const ps = `Get-CimInstance Win32_Process -Filter "Name='msedge.exe' OR Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*${needle.replace(/'/g, "''")}*' -and $_.CommandLine -notlike '*--type=*' } | ForEach-Object { taskkill.exe /PID $_.ProcessId /T ${force ? '/F' : ''} | Out-Null }`;
    return new Promise((res) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true }, () => res()));
  }
  function startBridge() {
    const script = path.join(__dirname, 'helpers', 'padbridge.ps1').replace('app.asar', 'app.asar.unpacked');
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let buf = '';
    p.stdout.on('data', (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (line === 'QUIT') close();
      }
    });
    p.stderr.on('data', (d) => log('[webapp:bridge]', d.toString().trim()));
    return p;
  }
  function finished() {
    if (!cur) return;
    const c = cur; cur = null;
    clearInterval(c.timer);
    try { c.bridge.stdin.write('EXIT\n'); } catch { /* már leállt */ }
    setTimeout(() => { try { c.bridge.kill(); } catch { /* */ } }, 800);
    log(`[webapp] bezárva: ${c.id}`);
    const win = getWin();
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.show(); win.setAlwaysOnTop(true); win.focus(); setTimeout(() => { if (!win.isDestroyed()) win.setAlwaysOnTop(false); }, 300);
    }
    sendUI('webapp:closed', { id: c.id });
  }
  async function close() {
    if (!cur || cur.closing) return;
    cur.closing = true;
    const dir = cur.dir;
    await killProfile(dir, false);
    setTimeout(async () => { if (cur && cur.dir === dir && running(dir)) await killProfile(dir, true); }, 3000);
  }
  async function open(id) {
    const def = APPS[id];
    if (!def) throw new Error('Ismeretlen app');
    const br = findBrowser();
    if (!br) throw new Error('A Netflixhez / HBO Max-hoz Microsoft Edge vagy Google Chrome kell (a DRM-es lejátszás miatt)');
    if (cur) { if (cur.id === id) return { ok: true, already: true }; await close(); for (let i = 0; i < 30 && cur; i++) await new Promise((r) => setTimeout(r, 200)); finished(); }
    const dir = profileDir(br.kind);
    fs.mkdirSync(dir, { recursive: true });
    if (running(dir)) await killProfile(dir, true);
    const args = [`--user-data-dir=${dir}`, `--app=${def.url}`, '--start-fullscreen', '--no-first-run', '--no-default-browser-check',
      '--disable-session-crashed-bubble', '--hide-crash-restore-bubble', '--autoplay-policy=no-user-gesture-required', '--disable-features=msEdgeSidebarV2,msImplicitSignin,msHubApps'];
    if (isElevated()) {
      // rendszergazdaként futó InariX-ből (pl. a gaming PC-n) ne rendszergazdaként induljon a böngésző:
      // parancsikont készítünk, és az Explorer (a bejelentkezett felhasználó normál jogaival) nyitja meg
      const lnk = path.join(dir, '..', `${id}.lnk`);
      const q = (x) => x.replace(/'/g, "''");
      const argStr = args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ');
      await new Promise((res, rej) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        `$s=(New-Object -ComObject WScript.Shell).CreateShortcut('${q(lnk)}'); $s.TargetPath='${q(br.exe)}'; $s.Arguments='${q(argStr)}'; $s.Save()`],
      { windowsHide: true }, (err) => (err ? rej(new Error(`Az indító parancsikon nem készült el: ${err.message}`)) : res())));
      spawn('explorer.exe', [lnk], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn(br.exe, args, { detached: true, stdio: 'ignore' }).unref();
    }
    log(`[webapp] indul: ${id} (${br.kind}${isElevated() ? ', explorer' : ''})`);
    cur = { id, dir, bridge: startBridge(), started: Date.now(), seen: false, closing: false };
    // figyeljük, mikor zárul be (a profil zárolása megszűnik); ha 25 mp alatt el sem indul, feladjuk
    cur.timer = setInterval(() => {
      if (!cur) return;
      const r = running(cur.dir);
      if (r) cur.seen = true;
      else if (cur.seen || Date.now() - cur.started > 25000) finished();
    }, 1000);
    return { ok: true, browser: br.kind };
  }
  app.on('before-quit', () => { if (cur) { killProfile(cur.dir, true); try { cur.bridge.kill(); } catch { /* */ } } });
  return { open, close, current: () => (cur ? cur.id : null), APPS };
}

module.exports = { setupWebApps };
