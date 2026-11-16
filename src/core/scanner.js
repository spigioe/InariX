'use strict';
// Telepített játékok felderítése: Steam, Epic, GOG, Ubisoft Connect, egyedi játékok.
const fs = require('fs');
const path = require('path');
const { regKey, regValue, parseVdf, run } = require('./util');
const { directLaunchFor } = require('./steam-appinfo');

const STEAM_SKIP_IDS = new Set(['228980', '1070560', '1391110', '1628350', '1493710', '2180100', '1826330', '250820', '961940']);
const STEAM_SKIP_NAME = /redistributable|steam linux runtime|proton|steamworks common|steamvr|dedicated server|soundtrack|sdk$/i;

const steamArt = (id) => ({
  cover: `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_600x900.jpg`,
  coverFallback: `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/header.jpg`,
  hero: `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_hero.jpg`,
});

async function findSteamPath() {
  const p = (await regValue('HKCU\\Software\\Valve\\Steam', 'SteamPath'))
    || (await regValue('HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath'));
  const cand = [p, 'C:\\Program Files (x86)\\Steam'].filter(Boolean).map((x) => path.normalize(x));
  return cand.find((c) => fs.existsSync(path.join(c, 'steamapps'))) || null;
}

async function scanSteam() {
  const steam = await findSteamPath();
  if (!steam) return [];
  const libs = new Set([path.join(steam, 'steamapps')]);
  try {
    const vdf = parseVdf(fs.readFileSync(path.join(steam, 'steamapps', 'libraryfolders.vdf'), 'utf8'));
    const lf = vdf.libraryfolders || vdf.LibraryFolders || {};
    for (const k of Object.keys(lf)) {
      const v = lf[k];
      const p = typeof v === 'string' ? v : v && v.path;
      if (p) libs.add(path.join(path.normalize(p), 'steamapps'));
    }
  } catch { /* nincs libraryfolders */ }

  const games = [];
  const seenLibs = new Set();
  for (const lib of libs) {
    // ugyanaz a mappa többféle írásmóddal is szerepelhet (c:/… vs C:\…) – csak egyszer olvassuk be
    const k = path.resolve(lib).toLowerCase();
    if (seenLibs.has(k)) continue;
    seenLibs.add(k);
    let files = [];
    try { files = fs.readdirSync(lib).filter((f) => /^appmanifest_\d+\.acf$/i.test(f)); } catch { continue; }
    for (const f of files) {
      try {
        const acf = parseVdf(fs.readFileSync(path.join(lib, f), 'utf8')).AppState;
        if (!acf || !acf.appid || STEAM_SKIP_IDS.has(acf.appid) || STEAM_SKIP_NAME.test(acf.name || '')) continue;
        const flags = parseInt(acf.StateFlags || '4', 10);
        const total = parseInt(acf.BytesToDownload || '0', 10);
        const done = parseInt(acf.BytesDownloaded || '0', 10);
        const download = flags !== 4 && total > 0 && done < total ? { done, total, pct: Math.round((done / total) * 100) } : null;
        const installDir = path.join(lib, 'common', acf.installdir || '');
        // Több indítási mód esetén a Steam választóablakot dobna fel (és addig minden indítást elnyel):
        // ilyenkor az alapértelmezett módot közvetlenül indítjuk, a Steam azonosítóval (overlay, achievementek maradnak)
        let launch = { type: 'uri', uri: `steam://rungameid/${acf.appid}` };
        try {
          const direct = directLaunchFor(steam, acf.appid, installDir);
          if (direct) launch = { type: 'exe', exe: direct.exe, args: direct.args, cwd: direct.cwd, env: { SteamAppId: acf.appid, SteamGameId: acf.appid, SteamOverlayGameId: acf.appid }, note: `közvetlen indítás (${direct.options} indítási mód)` };
        } catch { /* marad a Steam URL */ }
        games.push({
          download,
          installedAt: parseInt(acf.LastUpdated || '0', 10) * 1000 || 0,
          id: `steam:${acf.appid}`, store: 'steam', storeId: acf.appid, name: acf.name || `Steam ${acf.appid}`,
          installDir,
          lastPlayed: parseInt(acf.LastPlayed || '0', 10) * 1000 || 0,
          sizeBytes: parseInt(acf.SizeOnDisk || '0', 10) || 0,
          updating: flags !== 4,
          launch,
          ...steamArt(acf.appid),
        });
      } catch { /* hibás manifest */ }
    }
  }
  return games;
}

async function scanEpic() {
  const dir = 'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests';
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.item')); } catch { return []; }
  const games = [];
  for (const f of files) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (j.bIsIncompleteInstall) continue;
      if (Array.isArray(j.AppCategories) && j.AppCategories.length && !j.AppCategories.includes('games')) continue;
      if (j.MainGameAppName && j.MainGameAppName !== j.AppName) continue; // DLC
      const id = `${j.CatalogNamespace}%3A${j.CatalogItemId}%3A${j.AppName}`;
      games.push({
        id: `epic:${j.AppName}`, store: 'epic', storeId: j.AppName, name: j.DisplayName || j.AppName,
        installDir: j.InstallLocation, lastPlayed: 0, sizeBytes: j.InstallSize || 0,
        launch: { type: 'uri', uri: `com.epicgames.launcher://apps/${id}?action=launch&silent=true` },
      });
    } catch { /* skip */ }
  }
  return games;
}

async function scanGog() {
  const root = await regKey('HKLM\\SOFTWARE\\WOW6432Node\\GOG.com\\Games');
  if (!root) return [];
  const games = [];
  for (const sk of root.subkeys) {
    const k = await regKey(sk);
    if (!k) continue;
    const v = k.values;
    if (!v.gameName || !v.exe) continue;
    if (v.dependsOn && v.dependsOn.trim()) continue; // DLC
    games.push({
      id: `gog:${v.gameID || path.basename(sk)}`, store: 'gog', storeId: v.gameID || path.basename(sk), name: v.gameName,
      installDir: v.path, lastPlayed: 0,
      launch: { type: 'exe', exe: v.exe, cwd: v.workingDir || v.path, args: v.launchParam ? v.launchParam.split(' ').filter(Boolean) : [] },
    });
  }
  return games;
}

async function scanUbisoft() {
  const root = await regKey('HKLM\\SOFTWARE\\WOW6432Node\\Ubisoft\\Launcher\\Installs');
  if (!root) return [];
  const games = [];
  for (const sk of root.subkeys) {
    const id = path.basename(sk);
    const dir = await regValue(sk, 'InstallDir');
    if (!dir || !fs.existsSync(dir)) continue;
    games.push({
      id: `ubisoft:${id}`, store: 'ubisoft', storeId: id, name: path.basename(dir.replace(/[\\/]+$/, '')),
      installDir: dir, lastPlayed: 0,
      launch: { type: 'uri', uri: `uplay://launch/${id}/0` },
    });
  }
  return games;
}

// Microsoft Store / Xbox app (PC Game Pass) játékok: a MicrosoftGame.config fájllal rendelkező Store csomagok.
// Lassú (PowerShell, 1-3 mp), ezért 5 percig gyorsítótárazzuk.
const MS_PS = `$ErrorActionPreference='SilentlyContinue'
$out = foreach ($p in Get-AppxPackage) {
  if ($p.IsFramework -or $p.SignatureKind -ne 'Store' -or -not $p.InstallLocation) { continue }
  $cf = Join-Path $p.InstallLocation 'MicrosoftGame.config'
  if (-not (Test-Path -LiteralPath $cf)) { continue }
  $name = $null; $exe = $null
  try { [xml]$g = Get-Content -LiteralPath $cf -Raw; $name = $g.Game.ShellVisuals.DefaultDisplayName; $exe = @($g.Game.ExecutableList.Executable)[0].Name } catch {}
  $m = Get-AppxPackageManifest $p
  $app = @($m.Package.Applications.Application)[0].Id
  if (-not $name -or $name -like 'ms-resource*') { $name = $m.Package.Properties.DisplayName }
  if (-not $name -or $name -like 'ms-resource*') { $name = $p.Name }
  [pscustomobject]@{ pfn = $p.PackageFamilyName; name = [string]$name; dir = $p.InstallLocation; app = $app; ver = [string]$p.Version }
}
ConvertTo-Json -Compress -InputObject @($out)`;
let msCache = { at: 0, games: [] };
async function scanMsStore(force = false) {
  if (process.platform !== 'win32') return [];
  if (!force && Date.now() - msCache.at < 300000) return msCache.games;
  const r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', MS_PS], { timeout: 30000 });
  let list = [];
  try { list = JSON.parse(r.stdout.trim() || '[]'); } catch { return msCache.games; }
  const games = (Array.isArray(list) ? list : [list]).filter((x) => x && x.pfn && x.app).map((x) => ({
    id: `msstore:${x.pfn}`, store: 'msstore', storeId: x.pfn, name: x.name, installDir: x.dir, lastPlayed: 0,
    launch: { type: 'exe', exe: 'explorer.exe', args: [`shell:AppsFolder\${x.pfn}!${x.app}`] },
  }));
  msCache = { at: Date.now(), games };
  return games;
}

function customGames(list = []) {
  return list.filter((g) => g && g.name && g.exe).map((g, i) => ({
    id: `custom:${g.id || i}`, store: 'custom', storeId: String(g.id || i), name: g.name,
    installDir: path.dirname(g.exe), lastPlayed: 0,
    launch: { type: 'exe', exe: g.exe, cwd: path.dirname(g.exe), args: g.args ? String(g.args).split(' ').filter(Boolean) : [] },
  }));
}

async function scanAll(opts = {}) {
  const results = await Promise.allSettled([scanSteam(), scanEpic(), scanGog(), scanUbisoft(), scanMsStore(opts.force)]);
  const games = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  games.push(...customGames(opts.customGames));
  const seen = new Set();
  return games
    .filter((g) => (seen.has(g.id) ? false : seen.add(g.id)))
    .sort((a, b) => (b.lastPlayed - a.lastPlayed) || a.name.localeCompare(b.name));
}

module.exports = { scanAll, scanSteam, scanEpic, scanGog, scanUbisoft, scanMsStore, findSteamPath };
