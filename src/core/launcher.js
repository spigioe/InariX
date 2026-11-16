'use strict';
// Játék indítás és telepítés az adott gépen (ahol ez a kód fut).
const fs = require('fs');
const { openUri, startExe, run } = require('./util');

// extraArgs: játékonként beállított indítási paraméterek (szöveg vagy tömb)
function launchGame(game, extraArgs) {
  if (!game || !game.launch) throw new Error('Ismeretlen játék');
  const l = game.launch;
  const extra = Array.isArray(extraArgs) ? extraArgs : String(extraArgs || '').match(/"[^"]*"|\S+/g) || [];
  const clean = extra.map((a) => a.replace(/^"|"$/g, '')).filter(Boolean).slice(0, 30);
  if (l.type === 'uri') {
    const m = /^steam:\/\/rungameid\/(\d+)$/.exec(l.uri);
    // Steam: paraméterek a steam://run/<appid>//<paraméterek>/ formával
    if (m && clean.length) openUri(`steam://run/${m[1]}//${encodeURIComponent(clean.join(' '))}/`);
    else openUri(l.uri);
  } else if (l.type === 'exe') {
    if (!fs.existsSync(l.exe)) throw new Error(`Nem található: ${l.exe}`);
    startExe(l.exe, [...(l.args || []), ...clean], l.cwd, l.env);
  } else throw new Error('Nem támogatott indítási mód');
  return { ok: true };
}

async function findLegendary() {
  const r = await run('where', ['legendary']);
  return r.code === 0 ? r.stdout.split(/\r?\n/)[0].trim() : null;
}

// Telepítés store-ból. item: { store, storeId, name }
async function installGame(item) {
  if (!item || !item.store || !item.storeId) throw new Error('Hiányos telepítési adat');
  const id = String(item.storeId).replace(/[^\w.\-:%]/g, '');
  switch (item.store) {
    case 'steam':
      openUri(`steam://install/${id}`);
      return { ok: true, needsConfirm: true, message: 'A Steam telepítési ablaka megnyílt a gépen. Erősítsd meg streamben.' };
    case 'msstore': {
      const pfn = String(item.installId || item.storeId).replace(/[^\w.\-]/g, '');
      openUri(`ms-windows-store://pdp/?PFN=${pfn}`);
      return { ok: true, needsConfirm: true, message: 'A Microsoft Store megnyílt a gépen.' };
    }
    case 'epic': {
      if (item.installId && !item.installId.includes('%')) {
        const full = String(item.installId).split(':').map(encodeURIComponent).join('%3A');
        openUri(`com.epicgames.launcher://apps/${full}?action=install`);
        return { ok: true, needsConfirm: true, message: 'Az Epic Launcher megnyílt a gépen.' };
      }
      const leg = await findLegendary();
      if (leg) {
        startExe(leg, ['install', id, '-y']);
        return { ok: true, message: 'Epic játék letöltése elindult (legendary).' };
      }
      openUri(`com.epicgames.launcher://apps/${id}?action=install`);
      return { ok: true, needsConfirm: true, message: 'Az Epic Launcher megnyílt a gépen.' };
    }
    case 'gog':
      openUri(`goggalaxy://openGameView/${id}`);
      return { ok: true, needsConfirm: true, message: 'GOG Galaxy megnyílt a gépen.' };
    case 'ubisoft':
      openUri(`uplay://install/${id}`);
      return { ok: true, needsConfirm: true, message: 'Ubisoft Connect megnyílt a gépen.' };
    default:
      throw new Error('Nem támogatott store');
  }
}

// Játék műveletek: validate | uninstall | folder
function gameAction(game, action) {
  if (!game) throw new Error('Ismeretlen játék');
  const id = String(game.storeId || '').replace(/[^\w.\-:%]/g, '');
  if (action === 'folder') {
    if (!game.installDir || !fs.existsSync(game.installDir)) throw new Error('A telepítési mappa nem található');
    startExe('explorer.exe', [game.installDir]);
    return { ok: true, message: 'Mappa megnyitva' };
  }
  if (action === 'validate') {
    if (game.store !== 'steam') throw new Error('Fájlellenőrzés csak Steam játékoknál érhető el innen');
    openUri(`steam://validate/${id}`);
    return { ok: true, message: 'A Steam elindította a fájlok ellenőrzését' };
  }
  if (action === 'uninstall') {
    if (game.store === 'steam') { openUri(`steam://uninstall/${id}`); return { ok: true, needsConfirm: true, message: 'A Steam eltávolító ablaka megnyílt' }; }
    if (game.store === 'epic') { openUri(`com.epicgames.launcher://apps/${id}?action=uninstall`); return { ok: true, needsConfirm: true, message: 'Az Epic Launcher megnyílt' }; }
    if (game.store === 'ubisoft') { openUri(`uplay://uninstall/${id}`); return { ok: true, needsConfirm: true, message: 'Ubisoft Connect megnyílt' }; }
    if (game.store === 'gog') { openUri(`goggalaxy://openGameView/${id}`); return { ok: true, needsConfirm: true, message: 'GOG Galaxy megnyílt' }; }
    throw new Error('Egyedi játékot a Beállításokban tudsz eltávolítani a listából');
  }
  throw new Error('Ismeretlen művelet');
}

// Energia: sleep | restart | shutdown | cancel
function powerAction(action) {
  if (action === 'sleep') {
    startExe('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command',
      "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Application]::SetSuspendState('Suspend', $false, $false)"]);
  } else if (action === 'restart') startExe('shutdown.exe', ['/r', '/t', '5', '/c', 'InariX: újraindítás']);
  else if (action === 'shutdown') startExe('shutdown.exe', ['/s', '/t', '5', '/c', 'InariX: leállítás']);
  else if (action === 'cancel') startExe('shutdown.exe', ['/a']);
  else if (action === 'logoff') startExe('shutdown.exe', ['/l']);
  else throw new Error('Ismeretlen energia művelet');
  return { ok: true };
}

// Lemezterület a megadott mappák meghajtóin
function diskInfo(dirs = []) {
  const drives = new Map();
  for (const d of dirs) {
    const m = /^([a-z]):/i.exec(d || '');
    if (!m) continue;
    const root = `${m[1].toUpperCase()}:\\`;
    if (drives.has(root)) continue;
    try {
      const s = fs.statfsSync(root);
      drives.set(root, { drive: root, free: s.bavail * s.bsize, total: s.blocks * s.bsize });
    } catch { /* nem elérhető meghajtó */ }
  }
  return [...drives.values()];
}

// ---------- Futó játékok felismerése és bezárása ----------
// Egy játék akkor "fut", ha van olyan folyamat, amelynek exe-je a játék telepítési mappájában van.
// (Egyedi játéknál pontosan az exe.) A launchereket (Steam, Epic…) nem érinti.
async function listProcesses() {
  const ps = "Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath } | ForEach-Object { [pscustomobject]@{ pid = $_.ProcessId; exe = $_.ExecutablePath; start = if ($_.CreationDate) { $_.CreationDate.ToString('o') } else { $null } } } | ConvertTo-Json -Compress";
  const r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { timeout: 20000 });
  try { const j = JSON.parse(r.stdout || '[]'); return Array.isArray(j) ? j : [j]; } catch { return []; }
}

const normDir = (d) => String(d || '').replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
function gameProcesses(game, procs) {
  if (!game) return [];
  if (game.store === 'custom' && game.launch && game.launch.exe) {
    const exe = normDir(game.launch.exe);
    return procs.filter((p) => normDir(p.exe) === exe);
  }
  const dir = normDir(game.installDir);
  if (dir.length < 8 || /^[a-z]:\\?$/.test(dir)) return []; // biztonság: meghajtó gyökér vagy túl rövid útvonal soha
  return procs.filter((p) => normDir(p.exe).startsWith(`${dir}\\`));
}

async function runningGames(games, procs) {
  const list = procs || await listProcesses();
  const out = [];
  for (const g of games) {
    const ps = gameProcesses(g, list);
    if (!ps.length) continue;
    const starts = ps.map((p) => Date.parse(p.start)).filter((n) => !Number.isNaN(n));
    out.push({ id: g.id, name: g.name, pids: ps.map((p) => p.pid), since: starts.length ? Math.min(...starts) : Date.now() });
  }
  return out;
}

// "Kilépés a játékból": a játék összes folyamatának leállítása (folyamatfával együtt)
async function quitGame(game) {
  const ps = gameProcesses(game, await listProcesses());
  if (!ps.length) return { ok: true, killed: 0 };
  const args = ['/F', '/T'];
  for (const p of ps) args.push('/PID', String(p.pid));
  await run('taskkill', args, { timeout: 20000 });
  const left = gameProcesses(game, await listProcesses());
  return { ok: left.length === 0, killed: ps.length - left.length, left: left.length };
}

module.exports = { launchGame, installGame, findLegendary, gameAction, powerAction, diskInfo, listProcesses, runningGames, quitGame, gameProcesses };
