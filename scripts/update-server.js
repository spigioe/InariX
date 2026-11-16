'use strict';
// InariX frissítő szerver: a legfrissebb csomagot (dist/) kiszolgálja a hálózaton a laptop Frissites.cmd szkriptjének.
// Használat ezen a gépen:  npm run update-server   (opcionálisan: --port=47810)
// Védelem: a letöltéshez PIN kell (a InariX host PIN-je, ha van; különben saját, a konzolra kiírva).
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const portArg = process.argv.find((a) => a.startsWith('--port='));
const PORT = portArg ? Number(portArg.split('=')[1]) : 47810;

function readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch { return null; } }

// PIN: a InariX host PIN-je (így a laptop már ismeri), különben saját, tartós PIN
function resolvePin() {
  const appCfg = readJson(path.join(process.env.APPDATA || os.homedir(), 'InariX', 'config.json'));
  if (appCfg && appCfg.hostMode && appCfg.hostMode.token) return { pin: String(appCfg.hostMode.token), source: 'InariX host PIN' };
  const dir = path.join(process.env.APPDATA || os.homedir(), 'InariX-Update');
  const file = path.join(dir, 'pin.txt');
  try { return { pin: fs.readFileSync(file, 'utf8').trim(), source: 'frissítő PIN' }; } catch { /* új */ }
  const pin = String(100000 + crypto.randomInt(900000));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, pin);
  return { pin, source: 'frissítő PIN (új)' };
}
const { pin: PIN, source: PIN_SOURCE } = resolvePin();

function manifest() {
  const m = readJson(path.join(dist, 'update-manifest.json'));
  if (!m || !m.file || !fs.existsSync(path.join(dist, m.file))) return null;
  return m;
}

function authorized(req) {
  const given = Buffer.from(String(req.headers['x-inarix-token'] || ''));
  const want = Buffer.from(PIN);
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}

const server = http.createServer((req, res) => {
  const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
  const url = new URL(req.url, 'http://x');
  const who = req.socket.remoteAddress;
  if (url.pathname === '/ping') return send(200, { inarixUpdate: 1 });
  if (!authorized(req)) { console.log(`[${new Date().toLocaleTimeString('hu-HU')}] elutasítva (hibás PIN): ${who}`); return send(401, { error: 'Hibás PIN' }); }
  const m = manifest();
  if (!m) return send(404, { error: 'Nincs csomag. Futtasd: npm run package' });
  if (url.pathname === '/manifest') return send(200, m);
  if (url.pathname === '/package') {
    const file = path.join(dist, m.file);
    console.log(`[${new Date().toLocaleTimeString('hu-HU')}] letöltés: ${who} · build ${m.build}`);
    res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': fs.statSync(file).size, 'Content-Disposition': `attachment; filename="${m.file}"` });
    fs.createReadStream(file).pipe(res);
    return undefined;
  }
  return send(404, { error: 'Nincs ilyen végpont' });
});

server.on('error', (e) => {
  console.error(e.code === 'EADDRINUSE' ? `A ${PORT}-es port foglalt (fut már a frissítő szerver?)` : e.message);
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter((a) => a && a.family === 'IPv4' && !a.internal).map((a) => a.address);
  const m = manifest();
  console.log('');
  console.log('  InariX frissítő szerver fut');
  console.log(`  Cím      : ${ips.map((ip) => `${ip}:${PORT}`).join(', ') || `localhost:${PORT}`}`);
  console.log(`  PIN      : ${PIN}  (${PIN_SOURCE})`);
  console.log(`  Csomag   : ${m ? `${m.file} · build ${m.build} · ${m.commit} · ${(m.size / 1048576).toFixed(0)} MB` : 'NINCS – futtasd: npm run package'}`);
  console.log('');
  console.log(`  A laptopon: InariX telepítési mappa → Frissites.cmd ${ips[0] || '<IP>'}`);
  console.log('  Leállítás: Ctrl+C');
  console.log('');
});
