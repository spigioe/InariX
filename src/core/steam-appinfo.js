'use strict';
// Steam appinfo.vdf (bináris KeyValues, v27–v29) olvasó: a játékok indítási beállításai (config/launch).
// Erre azért van szükség, mert ha egy játéknak több indítási módja van, a Steam választóablakot dob fel,
// és amíg arra nem válaszolnak, minden további indítási kérést figyelmen kívül hagy.
const fs = require('fs');
const path = require('path');

const MAGIC_V27 = 0x07564427, MAGIC_V28 = 0x07564428, MAGIC_V29 = 0x07564429;

// Bináris KeyValues olvasás. getKey: a kulcs kiolvasása (v29: string tábla index, korábban C-string)
function readKV(buf, pos, getKey) {
  const obj = {};
  for (;;) {
    const type = buf[pos++];
    if (type === 0x08 || type === 0x0b) return [obj, pos];
    let key;
    [key, pos] = getKey(buf, pos);
    if (type === 0x00) { let sub; [sub, pos] = readKV(buf, pos, getKey); obj[key] = sub; }
    else if (type === 0x01) { const end = buf.indexOf(0, pos); obj[key] = buf.toString('utf8', pos, end); pos = end + 1; }
    else if (type === 0x02) { obj[key] = buf.readInt32LE(pos); pos += 4; }
    else if (type === 0x03) { obj[key] = buf.readFloatLE(pos); pos += 4; }
    else if (type === 0x07) { obj[key] = buf.readBigUInt64LE(pos).toString(); pos += 8; }
    else if (type === 0x0a) { obj[key] = buf.readBigInt64LE(pos).toString(); pos += 8; }
    else throw new Error(`Ismeretlen KV típus: ${type} @${pos - 1}`);
  }
}

const cstr = (buf, pos) => { const end = buf.indexOf(0, pos); return [buf.toString('utf8', pos, end), end + 1]; };

// A megadott appid-k adatainak kiolvasása (a teljes fájlt nem dolgozzuk fel, csak a kért bejegyzéseket)
function readAppInfo(file, appids) {
  const want = new Set(appids.map(String));
  const buf = fs.readFileSync(file);
  const magic = buf.readUInt32LE(0);
  if (![MAGIC_V27, MAGIC_V28, MAGIC_V29].includes(magic)) throw new Error(`Ismeretlen appinfo formátum: 0x${magic.toString(16)}`);
  let pos = 8;
  let getKey = cstr;
  if (magic === MAGIC_V29) {
    const tableOff = Number(buf.readBigInt64LE(8));
    pos = 16;
    const count = buf.readUInt32LE(tableOff);
    const strings = new Array(count);
    let p = tableOff + 4;
    for (let i = 0; i < count; i++) { const end = buf.indexOf(0, p); strings[i] = buf.toString('utf8', p, end); p = end + 1; }
    getKey = (b, at) => [strings[b.readUInt32LE(at)], at + 4];
  }
  const out = {};
  // bejegyzés fejléc: appid(4) size(4) | infoState(4) lastUpdated(4) picsToken(8) sha1(20) changeNumber(4) [binSha1(20) v28+] | KV
  const headAfterSize = magic === MAGIC_V27 ? 40 : 60;
  while (pos + 8 <= buf.length) {
    const appid = buf.readUInt32LE(pos);
    if (appid === 0) break;
    const size = buf.readUInt32LE(pos + 4);
    const start = pos + 8;
    if (want.has(String(appid))) {
      try {
        const [kv] = readKV(buf, start + headAfterSize, getKey);
        out[appid] = kv.appinfo || kv;
      } catch { /* sérült bejegyzés */ }
      if (Object.keys(out).length === want.size) break;
    }
    pos = start + size;
  }
  return out;
}

// Indítási beállítások egy játékhoz (csak Windowsra érvényesek; a béta/DLC feltételhez kötöttek kimaradnak)
function launchConfigs(info) {
  const launch = info && info.config && info.config.launch;
  if (!launch) return [];
  return Object.keys(launch).sort((a, b) => Number(a) - Number(b)).map((k) => ({ id: k, ...launch[k] })).filter((l) => {
    const os = (l.config && l.config.oslist) || '';
    if (os && !os.split(',').includes('windows')) return false;
    if (l.config && (l.config.betakey || l.config.ownsdlc)) return false;
    if (l.type === 'none') return false;
    return !!l.executable;
  });
}

let cache = { at: 0, file: null, data: {} };
// Steam játék "közvetlen" indítási adata, ha a Steam választóablakot dobna fel; különben null
function directLaunchFor(steamPath, appid, installDir) {
  const file = path.join(steamPath, 'appcache', 'appinfo.vdf');
  if (!fs.existsSync(file)) return null;
  const mtime = fs.statSync(file).mtimeMs;
  if (cache.file !== file || cache.at !== mtime) cache = { at: mtime, file, data: {} };
  if (!(appid in cache.data)) {
    try { cache.data[appid] = readAppInfo(file, [appid])[appid] || null; } catch { cache.data[appid] = null; }
  }
  const configs = launchConfigs(cache.data[appid]);
  if (configs.length < 2) return null; // egyetlen indítási mód: a Steam nem kérdez, maradhat a normál indítás
  // alapértelmezett mód: 'default' típus, különben az első nem VR-os (a VR mód headset nélkül nem indulna)
  const def = configs.find((c) => c.type === 'default') || configs.find((c) => !/vr/i.test(c.type || '')) || configs[0];
  const exe = path.join(installDir, def.executable.replace(/\//g, '\\'));
  if (!fs.existsSync(exe)) return null;
  return {
    exe,
    args: (def.arguments || '').match(/"[^"]*"|\S+/g)?.map((a) => a.replace(/^"|"$/g, '')) || [],
    cwd: def.workingdir ? path.join(installDir, def.workingdir) : path.dirname(exe),
    description: def.description || '',
    options: configs.length,
  };
}

module.exports = { readAppInfo, launchConfigs, directLaunchFor };
