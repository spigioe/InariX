'use strict';
// Launcher nélküli (kézzel telepített, DRM-mentes, hordozható) játékok felkutatása a gépen.
// Hol keres: minden fix meghajtón a Games / Játékok / Jatekok mappákban (mindent), a Program Files mappákban
// csak a játékmotor-jegyekkel rendelkező mappákat (Unity, Unreal, Steamworks / EOS SDK, Bink, FMOD…).
// Eredmény: [{ name, exe, dir }] – a már ismert (launcheres / hozzáadott / kizárt) játékok nélkül.
const fs = require('fs');
const path = require('path');

const GAME_ROOTS = ['Games', 'Game', 'Játékok', 'Jatekok', 'My Games'];
const PF_ROOTS = ['Program Files', 'Program Files (x86)'];
// launcher / rendszer mappák – ezeket a saját szkennerük kezeli, vagy nem játékok
const SKIP_DIRS = /^(steam|steamlibrary|epic games|gog galaxy|ubisoft|ea games|ea|electronic arts|origin|battle\.net|riot games|rockstar games launcher|xboxgames|windowsapps|common files|microsoft.*|windows.*|internet explorer|nvidia.*|amd|intel|realtek|google|mozilla.*|java|node(js)?|git|python.*|dotnet|reference assemblies|msbuild|iis.*|uninstall information|installshield.*|package cache|inarix|gamotex|obs-studio|discord|spotify|vlc|7-zip|winrar|notepad\+\+|adobe|autodesk|jetbrains|docker|oracle|vmware|virtualbox|sunshine|moonlight.*|vigem.*|wireshark|teamviewer|anydesk|zoom|thirdparty|third party|tools|mods|modding|.*mod ?manager.*|redist|_commonredist|directx)$/i;
const MARKERS = [/^unityplayer\.dll$/i, /^steam_api(64)?\.dll$/i, /^eossdk-win64-shipping\.dll$/i, /^bink2?w(32|64)\.dll$/i, /^fmod(ex)?(64)?\.dll$/i, /^galaxy(64)?\.dll$/i, /^xinput1_3\.dll$/i, /^physx.*\.dll$/i, /^d3dcompiler_43\.dll$/i, /^mono\.dll$/i, /^.+_data$/i, /^engine$/i, /^content$/i];
const BAD_EXE = /(unins|setup|install|crash|report|redist|vc_?redist|dxsetup|directx|prereq|helper|update|patch|launcher_?helper|cefsharp|errorreporter|benchmark|config(urator)?|settings|editor|server|dedicated|easyanticheat|battleye|be_service|7z|unitycrashhandler|ue4prereq|dotnet|vcredist|oalinst|touchup|cleanup|errorhandler|handler|modmanager|mod_?manager|ui32|uploader|overlay|compiler|webwallpaper|wallpaper32)/i;

const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };
const ls = (p) => { try { return fs.readdirSync(p, { withFileTypes: true }); } catch { return []; } };
const size = (p) => { try { return fs.statSync(p).size; } catch { return 0; } };

function drives() {
  const out = [];
  for (const l of 'CDEFGHIJKLMNOPQRSTUVWXYZ') if (exists(`${l}:\\`)) out.push(`${l}:\\`);
  return out;
}

// a mappa (max. 3 szint mélyen) legjobb indítható .exe-je: a motor jegyei melletti, egyébként a legnagyobb
function bestExe(dir, depth = 0, acc = { marked: [], all: [] }) {
  if (depth > 3) return acc;
  const ents = ls(dir);
  const marked = ents.some((e) => MARKERS.some((m) => m.test(e.name)));
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isFile() && /\.exe$/i.test(e.name) && !BAD_EXE.test(e.name)) {
      const it = { exe: p, size: size(p), depth };
      acc.all.push(it);
      if (marked) acc.marked.push(it);
    }
  }
  for (const e of ents) if (e.isDirectory() && !/^(redist|_commonredist|directx|support|tools|docs?|manual|__installer|installers?|prereqs?|dotnet|vcredist|logs?|saves?|screenshots?)$/i.test(e.name)) bestExe(path.join(dir, e.name), depth + 1, acc);
  return acc;
}
// a legnagyobbak közül (a legnagyobb méretének legalább 30%-a) a legkevésbé mélyen lévő – a játék fő exe-je jellemzően a gyökérben van
const pick = (list) => {
  if (!list.length) return null;
  const max = Math.max(...list.map((x) => x.size));
  return list.filter((x) => x.size >= max * 0.3).sort((a, b) => (a.depth - b.depth) || (b.size - a.size))[0];
};

const prettyName = (folder) => folder.replace(/[_.]+/g, ' ').replace(/\s+/g, ' ').replace(/\b(v?\d+(\.\d+)+|x64|x86|win64|gog|repack|portable)\b/gi, '').trim();

// known: ismert telepítési mappák és exe-k (kisbetűs útvonalak) – ezeket kihagyjuk
function discoverGames({ knownDirs = [], knownExes = [], excluded = [] } = {}) {
  const kd = knownDirs.filter(Boolean).map((d) => path.resolve(d).toLowerCase());
  const ke = new Set([...knownExes, ...excluded].filter(Boolean).map((e) => path.resolve(e).toLowerCase()));
  const isKnownDir = (d) => { const l = d.toLowerCase(); return kd.some((k) => l === k || l.startsWith(`${k}\\`) || k.startsWith(`${l}\\`)); };
  const found = [];
  const consider = (dir, requireMarker) => {
    if (isKnownDir(dir)) return;
    const acc = bestExe(dir);
    if (requireMarker && !acc.marked.length) return;
    const best = pick(acc.marked.length ? acc.marked : acc.all);
    if (!best || best.size < 300 * 1024) return; // apró segédprogramok
    if (ke.has(path.resolve(best.exe).toLowerCase())) return;
    found.push({ name: prettyName(path.basename(dir)) || path.basename(best.exe, '.exe'), exe: best.exe, dir });
  };
  for (const d of drives()) {
    for (const r of GAME_ROOTS) {
      const root = path.join(d, r);
      for (const e of ls(root)) if (e.isDirectory() && !SKIP_DIRS.test(e.name)) consider(path.join(root, e.name), false);
    }
    for (const r of PF_ROOTS) {
      const root = path.join(d, r);
      for (const e of ls(root)) {
        if (!e.isDirectory() || SKIP_DIRS.test(e.name)) continue;
        const sub = path.join(root, e.name);
        consider(sub, true);
        // kiadói mappák: Program Files\Kiadó\Játék
        for (const e2 of ls(sub)) if (e2.isDirectory() && !SKIP_DIRS.test(e2.name)) consider(path.join(sub, e2.name), true);
      }
    }
  }
  const seen = new Set();
  return found.filter((g) => { const k = g.exe.toLowerCase(); return seen.has(k) ? false : seen.add(k); }).sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = { discoverGames };

// Egy gép (ahol a kód fut) keresése: a már ismert (launcheres + hozzáadott + kizárt) játékok nélkül
async function discoverOnThisPc(hostCfg) {
  const { scanAll } = require('./scanner');
  const known = await scanAll({ customGames: hostCfg.customGames || [] });
  return discoverGames({
    knownDirs: known.map((g) => g.installDir),
    knownExes: (hostCfg.customGames || []).map((g) => g.exe),
    excluded: hostCfg.excludedExes || [],
  });
}
// a gép egyedi játéklistájának módosítása: add [{name, exe}], exclude [exe], unexclude [exe], remove [custom id]
function applyCustomChange(hostCfg, { add = [], exclude = [], unexclude = [], remove = [] } = {}) {
  const list = [...(hostCfg.customGames || [])];
  const have = new Set(list.map((g) => String(g.exe).toLowerCase()));
  let n = 0;
  for (const g of add) {
    if (!g || !g.exe || !/\.exe$/i.test(g.exe) || have.has(String(g.exe).toLowerCase())) continue;
    list.push({ id: `${Date.now().toString(36)}${(n++).toString(36)}`, name: String(g.name || path.basename(g.exe, '.exe')).slice(0, 120), exe: String(g.exe) });
    have.add(String(g.exe).toLowerCase());
  }
  const ex = new Set((hostCfg.excludedExes || []).map((e) => String(e)));
  for (const e of exclude) if (e) ex.add(String(e));
  for (const g of list) if (remove.includes(String(g.id))) ex.add(String(g.exe));
  for (const e of unexclude) ex.delete(String(e));
  return { customGames: list.filter((g) => !remove.includes(String(g.id))), excludedExes: [...ex] };
}
module.exports.discoverOnThisPc = discoverOnThisPc;
module.exports.applyCustomChange = applyCustomChange;
