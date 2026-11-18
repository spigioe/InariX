'use strict';
// Host agent: a gaming PC-n fut, REST API-n keresztül listáz, indít, telepít.
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { run } = require('./util');
const { submitPin } = require('./sunshine');
const { scanAll } = require('./scanner');
const { launchGame, installGame, gameAction, powerAction, diskInfo, runningGames, quitGame } = require('./launcher');
const { ownedGames } = require('./store');
const { AGENT_PORT, startDiscoveryResponder, localMacs } = require('./net');

// a verzió egyetlen forrása a package.json (pl. 0.8.0-alpha)
const VERSION = (() => { try { return require('../../package.json').version; } catch { return '0.0.0'; } })();

// opts.stream: beépített stream szolgáltató { offer(body, client), stop(), status() } – csak az Electron hostban
function createAgent(getConfig, log = console.log, opts = {}) {
  let cache = { at: 0, games: [] };
  let runCache = { at: 0, list: [] };
  async function games(force) {
    if (force || Date.now() - cache.at > 20000) {
      cache = { at: Date.now(), games: await scanAll({ customGames: getConfig().customGames }) };
    }
    return cache.games;
  }

  // Sunshine állapot (telepítve / fut), 30 mp-ig cache-elve
  let sun = { at: 0, installed: false, running: false };
  async function sunshine() {
    if (Date.now() - sun.at < 30000) return sun;
    const installed = fs.existsSync(path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Sunshine', 'sunshine.exe'))
      || fs.existsSync(path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Apollo', 'sunshine.exe'));
    const r = await run('tasklist', ['/FI', 'IMAGENAME eq sunshine.exe', '/NH']);
    sun = { at: Date.now(), installed, running: /sunshine\.exe/i.test(r.stdout) };
    return sun;
  }

  const info = () => {
    const cfg = getConfig();
    return {
      name: cfg.name || os.hostname(), version: VERSION, port: cfg.port || AGENT_PORT, macs: localMacs(), platform: process.platform,
      sunshine: { installed: sun.installed, running: sun.running },
      updateBuild: opts.updateBuild ? opts.updateBuild() : null, // a gépen elérhető legfrissebb InariX csomag (frissítő szerver)
      stream: opts.stream && cfg.allowStream !== false ? opts.stream.status() : { available: false },
    };
  };

  const server = http.createServer(async (req, res) => {
    const send = (code, obj) => {
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(obj));
    };
    try {
      const url = new URL(req.url, 'http://x');
      if (url.pathname === '/api/info') return send(200, info());
      if (req.headers['x-inarix-token'] !== String(getConfig().token)) return send(401, { error: 'Hibás vagy hiányzó PIN' });

      let body = {};
      if (req.method === 'POST') {
        const chunks = [];
        for await (const c of req) { chunks.push(c); if (chunks.length > 100) break; }
        try { body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { body = {}; }
      }

      if (url.pathname === '/api/auth') { await sunshine(); return send(200, { ok: true, ...info() }); }
      if (url.pathname === '/api/games') return send(200, { games: await games(url.searchParams.get('refresh') === '1') });
      if (url.pathname === '/api/launch' && req.method === 'POST') {
        const g = (await games()).find((x) => x.id === body.id) || (await games(true)).find((x) => x.id === body.id);
        if (!g) return send(404, { error: 'A játék nem található ezen a gépen' });
        // Ha már fut, nem indítjuk újra – a kliens csak visszacsatlakozik (folytatás)
        const already = await runningGames([g]).catch(() => []);
        if (already.length) { log(`[agent] folytatás (már fut): ${g.name}`); return send(200, { ok: true, alreadyRunning: true, since: already[0].since }); }
        log(`[agent] indítás: ${g.name}`);
        runCache.at = 0;
        // a stream ablakkövetőjének: a már nyitott ablakok pillanatképe az indítás előtt
        if (opts.stream && opts.stream.prepare) await Promise.race([opts.stream.prepare(g), new Promise((r) => setTimeout(r, 2500))]).catch(() => {});
        return send(200, launchGame(g, body.args));
      }
      if (url.pathname === '/api/running') {
        if (Date.now() - runCache.at > 2500) runCache = { at: Date.now(), list: await runningGames(await games()) };
        return send(200, { running: runCache.list });
      }
      if (url.pathname === '/api/quit' && req.method === 'POST') {
        const g = (await games()).find((x) => x.id === body.id);
        if (!g) return send(404, { error: 'A játék nem található ezen a gépen' });
        log(`[agent] kilépés a játékból: ${g.name}`);
        runCache.at = 0;
        return send(200, await quitGame(g));
      }
      // játékkeresés ezen a gépen (launcher nélküli játékok), és az egyedi játéklista módosítása
      if (url.pathname === '/api/discover') {
        log('[agent] játékkeresés a gépen…');
        return send(200, { games: await require('./discover-games').discoverOnThisPc(getConfig()) });
      }
      if (url.pathname === '/api/custom' && req.method === 'POST') {
        if (!opts.custom) return send(501, { error: 'Nem támogatott' });
        const r = require('./discover-games').applyCustomChange(getConfig(), body);
        opts.custom(r);
        cache.at = 0;
        log(`[agent] játéklista módosítva (+${(body.add || []).length}, kizárva ${(body.exclude || []).length})`);
        return send(200, { ok: true, ...r });
      }
      if (url.pathname === '/api/install' && req.method === 'POST') {
        log(`[agent] telepítés: ${body.store}:${body.storeId} ${body.name || ''}`);
        cache.at = 0;
        return send(200, await installGame(body));
      }
      if (url.pathname === '/api/action' && req.method === 'POST') {
        const g = (await games(true)).find((x) => x.id === body.id);
        if (!g) return send(404, { error: 'A játék nem található ezen a gépen' });
        log(`[agent] művelet: ${body.action} ${g.name}`);
        cache.at = 0;
        return send(200, gameAction(g, body.action));
      }
      // A host csatlakoztatott fiókjai (Steam/Epic/GOG/MS Store/Ubisoft): állapot + szinkronizált játéklista.
      // Tokent nem adunk ki – a kliens csak a listát kapja meg.
      // Ébresztés továbbítása: egy mindig bekapcsolt eszköz (pl. másik gép, Raspberry Pi agenttel) a saját helyi
      // hálózatára küldi ki a Wake-on-LAN csomagot – így VPN-en át is felébreszthető a gaming PC
      if (url.pathname === '/api/wake' && req.method === 'POST') {
        const mac = String((body && body.mac) || '');
        if (!/^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(mac)) return send(400, { error: 'Hibás MAC cím' });
        await require('./net').wakeOnLan(mac);
        log(`[agent] ébresztés továbbítva: ${mac}`);
        return send(200, { ok: true });
      }
      if (url.pathname === '/api/stats') return send(200, { stats: opts.stats ? opts.stats() : {} });
      if (url.pathname === '/api/accounts') {
        if (!opts.accounts) return send(200, { status: {}, games: [] });
        return send(200, { status: opts.accounts.status(), games: opts.accounts.owned() });
      }
      if (url.pathname === '/api/accounts/sync' && req.method === 'POST') {
        if (!opts.accounts) return send(501, { error: 'Ezen a gépen nincs fiók szinkron (régi InariX host)' });
        return send(200, { status: await opts.accounts.sync(body && body.store) });
      }
      if (url.pathname === '/api/stream/offer' && req.method === 'POST') {
        if (!opts.stream || getConfig().allowStream === false) return send(501, { error: 'Ezen a gépen nem érhető el a beépített stream (a InariX appban kell Host módot bekapcsolni)' });
        return send(200, await opts.stream.offer(body, req.socket.remoteAddress));
      }
      if (url.pathname === '/api/stream/stop' && req.method === 'POST') {
        if (opts.stream) opts.stream.stop('a kliens leállította');
        return send(200, { ok: true });
      }
      if (url.pathname === '/api/pair' && req.method === 'POST') {
        if (!/^\d{4}$/.test(String(body.pin || ''))) return send(400, { error: 'Érvénytelen PIN' });
        const c = getConfig();
        log(`[agent] Moonlight párosítás PIN beküldése (${body.name || 'kliens'})`);
        return send(200, await submitPin({ user: c.sunshineUser, pass: c.sunshinePass }, body.pin, String(body.name || 'InariX').slice(0, 40)));
      }
      if (url.pathname === '/api/power' && req.method === 'POST') {
        log(`[agent] energia: ${body.action}`);
        setTimeout(() => { try { powerAction(body.action); } catch (e) { log(e.message); } }, 500);
        return send(200, { ok: true });
      }
      if (url.pathname === '/api/system') {
        const gs = await games();
        return send(200, { disks: diskInfo([...gs.map((g) => g.installDir), process.env.SystemDrive || 'C:']), uptime: os.uptime(), ...info() });
      }
      if (url.pathname === '/api/owned') {
        const installed = new Set((await games()).map((g) => g.id));
        return send(200, { games: await ownedGames(getConfig(), installed) });
      }
      send(404, { error: 'Nincs ilyen végpont' });
    } catch (e) {
      send(500, { error: e.message });
    }
  });

  let stopDiscovery = null;
  return {
    start() {
      const port = getConfig().port || AGENT_PORT;
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '0.0.0.0', () => {
          stopDiscovery = startDiscoveryResponder(info);
          log(`[agent] fut: http://0.0.0.0:${port}  PIN: ${getConfig().token}`);
          resolve(port);
        });
      });
    },
    stop() {
      if (stopDiscovery) stopDiscovery();
      return new Promise((r) => {
        server.close(() => r());
        if (server.closeAllConnections) server.closeAllConnections();
        setTimeout(r, 1500);
      });
    },
    games, info,
  };
}

function newToken() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

module.exports = { createAgent, newToken, VERSION };
