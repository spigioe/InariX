'use strict';
// Egységes könyvtár: helyi játékok + távoli gépek (élő vagy gyorsítótárazott) összefésülve,
// felhasználói statisztikák (kedvenc, rejtett, játékidő) és Steam metaadatok/borítók.
const fs = require('fs');
const path = require('path');
const { scanAll } = require('../core/scanner');
const { runningGames } = require('../core/launcher');
const { agentRequest } = require('../core/net');

const steamArt = (id) => ({
  cover: `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_600x900.jpg`,
  coverFallback: `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/header.jpg`,
  hero: `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_hero.jpg`,
});

function readJson(file, def) { try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch { return def; } }
function writeJson(file, data) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file);
}
const norm = (s) => String(s || '').toLowerCase().replace(/[™®©]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');

async function fetchJson(url, ms = 6000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { 'User-Agent': 'InariX/1.0' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

class Library {
  constructor(dir, getCfg, log = console.log) {
    this.getCfg = getCfg;
    this.log = log;
    this.files = {
      cache: path.join(dir, 'library-cache.json'),
      stats: path.join(dir, 'stats.json'),
      meta: path.join(dir, 'meta-cache.json'),
    };
    this.cache = readJson(this.files.cache, { hosts: {} });
    this.stats = readJson(this.files.stats, {});
    this.meta = readJson(this.files.meta, { steamIds: {}, details: {} });
    this.local = { at: 0, games: [] };
    this.hostState = {}; // hostId -> { online, error, at }
    this.last = { games: [], hosts: [] };
  }

  async localGames(force) {
    if (force || Date.now() - this.local.at > 20000) {
      this.local = { at: Date.now(), games: await scanAll({ customGames: this.getCfg().hostMode.customGames }) };
    }
    return this.local.games;
  }

  async remoteGames(host, force) {
    try {
      const [r, run, acc, sts] = await Promise.all([
        agentRequest(host, 'GET', `/api/games${force ? '?refresh=1' : ''}`, null, 5000),
        agentRequest(host, 'GET', '/api/running', null, 6000).catch(() => ({ running: [] })),
        agentRequest(host, 'GET', '/api/accounts', null, 8000).catch(() => null), // régi host: nincs ilyen végpont
        agentRequest(host, 'GET', '/api/stats', null, 6000).catch(() => null),
      ]);
      const prev = this.cache.hosts[host.id] || {};
      const accounts = acc && acc.status ? { status: acc.status, games: acc.games || [] } : prev.accounts || null;
      const stats = sts && sts.stats ? sts.stats : prev.stats || null;
      this.cache.hosts[host.id] = { at: Date.now(), games: r.games || [], accounts, stats };
      writeJson(this.files.cache, this.cache);
      this.hostState[host.id] = { online: true, at: Date.now() };
      return { online: true, games: r.games || [], running: run.running || [], accounts, stats };
    } catch (e) {
      this.hostState[host.id] = { online: false, error: e.message, at: Date.now() };
      const c = this.cache.hosts[host.id];
      return { online: false, error: e.message, games: c ? c.games : [], cachedAt: c ? c.at : 0, accounts: c ? c.accounts || null : null, stats: c ? c.stats || null : null };
    }
  }

  async build(force = false) {
    const cfg = this.getCfg();
    const hosts = cfg.hosts;
    const [local, ...remote] = await Promise.all([this.localGames(force).catch(() => []), ...hosts.map((h) => this.remoteGames(h, force))]);
    const localRunning = await runningGames(local).catch(() => []);
    const map = new Map();
    const add = (g, src) => {
      const key = g.store === 'custom' ? `custom:${src.hostId}:${g.storeId}` : g.id;
      let e = map.get(key);
      if (!e) {
        e = { key, name: g.name, store: g.store, storeId: g.storeId, cover: g.cover, coverFallback: g.coverFallback, hero: g.hero, lastPlayed: 0, installedAt: 0, sizeBytes: g.sizeBytes || 0, sources: [], download: null };
        map.set(key, e);
      }
      e.lastPlayed = Math.max(e.lastPlayed, g.lastPlayed || 0);
      e.installedAt = Math.max(e.installedAt, g.installedAt || 0);
      if (g.download) e.download = { ...g.download, hostName: src.hostName };
      e.sources.push({ ...src, gameId: g.id, updating: !!g.updating, installDir: g.installDir });
    };
    for (const g of local) add(g, { hostId: 'local', hostName: 'Ez a gép', local: true, online: true });
    remote.forEach((r, i) => { for (const g of r.games) add(g, { hostId: hosts[i].id, hostName: hosts[i].name, local: false, online: r.online }); });
    // Futó játékok: melyik gépen fut éppen (a "Most fut" sorhoz és a folytatáshoz)
    const markRunning = (list, hostId, hostName) => {
      for (const run of list || []) {
        for (const e of map.values()) {
          if (e.sources.some((s) => s.hostId === hostId && s.gameId === run.id)) (e.running = e.running || []).push({ hostId, hostName, since: run.since });
        }
      }
    };
    markRunning(localRunning, 'local', 'Ez a gép');
    remote.forEach((r, i) => { if (r.online) markRunning(r.running, hosts[i].id, hosts[i].name); });

    // Megvásárolt, de sehol nem telepített játékok (a csatlakoztatott fiókok szinkronizált listájából)
    if (cfg.library.showOwned) {
      const byName = new Set([...map.values()].map((e) => `${e.store}|${norm(e.name)}`));
      // saját fiókok + a gaming PC-(k)n csatlakoztatott fiókok játékai
      const ownedAll = [...(this.accounts ? this.accounts.owned() : []), ...remote.flatMap((r) => (r.accounts && r.accounts.games) || [])];
      for (const o of ownedAll) {
        const key = `${o.store}:${o.storeId}`;
        const nk = `${o.store}|${norm(o.name)}`;
        if (map.has(key)) { const e = map.get(key); if (o.installId) e.installId = o.installId; continue; }
        if (byName.has(nk)) continue; // pl. Ubisoft: a telepített és a fiók azonosító eltér – név alapján egyeztetünk
        byName.add(nk);
        const art = o.store === 'steam' ? steamArt(o.storeId) : { cover: o.cover, coverFallback: o.coverFallback, hero: o.hero };
        map.set(key, { key, name: o.name, store: o.store, storeId: o.storeId, installId: o.installId || null, ...art, artAlt: o.artAlt || null,
          lastPlayed: o.lastPlayed || 0, installedAt: 0, sizeBytes: 0, sources: [], owned: true, steamPlaytime: (o.playtimeMin || 0) * 60 });
      }
    }

    const games = [...map.values()];
    await this.resolveArt(games);
    for (const e of games) {
      const st = this.stats[e.key] || {};
      e.prefs = st.prefs || null;
      e.fav = !!st.fav; e.hidden = !!st.hidden; e.playSec = st.playSec || 0; e.launches = st.launches || 0; e.prefer = st.prefer || null;
      e.lastPlayed = Math.max(e.lastPlayed, st.lastPlayed || 0);
      // a többi gépen (pl. a gaming PC-n helyben) játszott idő és utolsó játék is beleszámít
      for (const r of remote) {
        const rs = r.stats && r.stats[e.key];
        if (rs) { e.playSec += rs.playSec || 0; e.lastPlayed = Math.max(e.lastPlayed, rs.lastPlayed || 0); }
      }
      e.available = e.sources.some((s) => s.online);
      e.localAvailable = e.sources.some((s) => s.local);
      e.remoteOnline = e.sources.some((s) => !s.local && s.online);
      e.remoteOffline = e.sources.some((s) => !s.local && !s.online);
    }
    const hostList = [
      { id: 'local', name: 'Ez a gép', local: true, online: true, count: local.length },
      ...hosts.map((h, i) => ({ id: h.id, name: h.name, local: false, online: remote[i].online, error: remote[i].error || null, count: remote[i].games.length, cachedAt: remote[i].cachedAt || 0, mac: h.mac || '', accounts: remote[i].accounts ? remote[i].accounts.status : null })),
    ];
    this.last = { games, hosts: hostList, at: Date.now() };
    return this.last;
  }

  find(key) { return this.last.games.find((g) => g.key === key); }

  // ---- statisztikák ----
  patchStats(key, patch) {
    this.stats[key] = { ...(this.stats[key] || {}), ...patch };
    writeJson(this.files.stats, this.stats);
    const e = this.find(key);
    if (e) Object.assign(e, patch);
    return this.stats[key];
  }
  recordLaunch(key) {
    const st = this.stats[key] || {};
    return this.patchStats(key, { launches: (st.launches || 0) + 1, lastPlayed: Date.now() });
  }
  addPlaytime(key, sec) {
    if (!key || sec < 5) return;
    const st = this.stats[key] || {};
    this.patchStats(key, { playSec: (st.playSec || 0) + Math.round(sec), lastPlayed: Date.now() });
  }

  // ---- borítók nem Steames játékokhoz: Steam keresés név alapján ----
  async steamIdFor(e) {
    if (e.store === 'steam') return e.storeId;
    if (e.key in this.meta.steamIds) return this.meta.steamIds[e.key];
    let id = null;
    try {
      const j = await fetchJson(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(e.name)}&l=english&cc=us`, 5000);
      const n = norm(e.name);
      const hit = (j.items || []).find((it) => { const m = norm(it.name); return m === n || m.startsWith(n) || n.startsWith(m); });
      id = hit ? String(hit.id) : null;
    } catch { return null; } // hálózati hiba: ne cache-eljük
    this.meta.steamIds[e.key] = id;
    writeJson(this.files.meta, this.meta);
    return id;
  }

  async resolveArt(games) {
    const need = games.filter((e) => !e.cover && e.store !== 'steam');
    // már ismert (gyorsítótárazott) eredmények azonnal, az ismeretlenek korlátozott párhuzamossággal
    const queue = [...need];
    await Promise.all(Array.from({ length: Math.min(6, queue.length) }, async () => {
      while (queue.length) {
        const e = queue.shift();
        const id = await this.steamIdFor(e).catch(() => null);
        if (id) { Object.assign(e, steamArt(id), e.hero ? { hero: e.hero } : {}); e.artFromSteam = id; }
        else if (e.artAlt) { e.cover = e.artAlt; }
      }
    }));
  }

  // ---- Steam fiók (opcionális): saját játékok, achievementek ----
  async account() {
    const a = this.getCfg().account || {};
    if (!a.steamApiKey) return null;
    let id = String(a.steamId || '').trim();
    if (!/^\d{17}$/.test(id)) {
      if (id) {
        const cacheKey = `vanity:${id}`;
        if (!this.meta.steamIds[cacheKey]) {
          const j = await fetchJson(`https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${encodeURIComponent(a.steamApiKey)}&vanityurl=${encodeURIComponent(id)}`);
          if (j.response && j.response.success === 1) { this.meta.steamIds[cacheKey] = j.response.steamid; writeJson(this.files.meta, this.meta); }
        }
        id = this.meta.steamIds[cacheKey];
      } else {
        id = await require('../core/store').steamUserId();
      }
    }
    return id ? { key: a.steamApiKey, steamid: id } : null;
  }

  async ownedSteam() {
    if (this.ownedCache && Date.now() - this.ownedCache.at < 3600000) return this.ownedCache.games;
    const acc = await this.account();
    if (!acc) return [];
    const j = await fetchJson(`https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${encodeURIComponent(acc.key)}&steamid=${acc.steamid}&include_appinfo=1&format=json`, 10000);
    const games = (j.response && j.response.games) || [];
    this.ownedCache = { at: Date.now(), games };
    return games;
  }

  async achievementsCached(appid) {
    const c = this.achCache || (this.achCache = {});
    if (c[appid] && Date.now() - c[appid].at < 600000) return c[appid].v;
    const v = await this.achievements(appid);
    c[appid] = { at: Date.now(), v };
    return v;
  }

  // Steam ismerősök (Web API kulccsal): ki online, és mivel játszik
  async friends() {
    if (this.friendsCache && Date.now() - this.friendsCache.at < 60000) return this.friendsCache.list;
    const acc = await this.account().catch(() => null);
    if (!acc) return null;
    try {
      const fl = await fetchJson(`https://api.steampowered.com/ISteamUser/GetFriendList/v1/?key=${encodeURIComponent(acc.key)}&steamid=${acc.steamid}&relationship=friend`, 8000);
      const ids = ((fl.friendslist && fl.friendslist.friends) || []).map((f) => f.steamid).slice(0, 100);
      if (!ids.length) return [];
      const ps = await fetchJson(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${encodeURIComponent(acc.key)}&steamids=${ids.join(',')}`, 8000);
      const list = ((ps.response && ps.response.players) || [])
        .filter((p) => p.personastate > 0 || p.gameextrainfo)
        .map((p) => ({ name: p.personaname, avatar: p.avatarfull || p.avatarmedium, game: p.gameextrainfo || null, appid: p.gameid || null, state: p.personastate }))
        .sort((a, b) => (b.game ? 1 : 0) - (a.game ? 1 : 0) || a.name.localeCompare(b.name));
      this.friendsCache = { at: Date.now(), list };
      return list;
    } catch { return this.friendsCache ? this.friendsCache.list : null; }
  }

  async achievements(appid) {
    const acc = await this.account().catch(() => null);
    if (!acc) return null;
    try {
      const [p, s] = await Promise.all([
        fetchJson(`https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/?key=${encodeURIComponent(acc.key)}&steamid=${acc.steamid}&appid=${appid}&l=hungarian`, 6000),
        fetchJson(`https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/?key=${encodeURIComponent(acc.key)}&appid=${appid}&l=hungarian`, 6000),
      ]);
      const list = (p.playerstats && p.playerstats.achievements) || [];
      if (!list.length) return null;
      const schema = new Map(((s.game && s.game.availableGameStats && s.game.availableGameStats.achievements) || []).map((a) => [a.name, a]));
      const done = list.filter((a) => a.achieved);
      const recent = done.sort((a, b) => b.unlocktime - a.unlocktime).slice(0, 6).map((a) => {
        const sc = schema.get(a.apiname) || {};
        return { name: sc.displayName || a.apiname, desc: sc.description || '', icon: sc.icon || null, at: a.unlocktime * 1000 };
      });
      return { done: done.length, total: list.length, recent };
    } catch { return null; }
  }

  async extras(appid) {
    const c = this.extrasCache || (this.extrasCache = {});
    if (c[appid] && Date.now() - c[appid].at < 600000) return c[appid];
    const [rev, news, ach] = await Promise.all([
      fetchJson(`https://store.steampowered.com/appreviews/${appid}?json=1&language=all&purchase_type=all&num_per_page=0`, 6000).catch(() => null),
      fetchJson(`https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${appid}&count=3&maxlength=280&format=json`, 6000).catch(() => null),
      this.achievements(appid),
    ]);
    const q = rev && rev.query_summary;
    const out = {
      at: Date.now(),
      reviews: q && q.total_reviews ? { desc: q.review_score_desc, pct: Math.round((q.total_positive / q.total_reviews) * 100), total: q.total_reviews } : null,
      news: ((news && news.appnews && news.appnews.newsitems) || []).map((n) => ({ title: n.title, date: n.date * 1000, url: n.url, text: n.contents })),
      achievements: ach,
    };
    c[appid] = out;
    return out;
  }

  // Áruház termékoldal Steam appid alapján
  async storeDetails(appid) {
    const base = await this.steamDetails(String(appid));
    const ex = await this.extras(String(appid));
    return { ...base, ...ex };
  }

  // ---- adatlap ----
  async details(key) {
    const e = this.find(key);
    if (!e) throw new Error('Ismeretlen játék');
    const appid = await this.steamIdFor(e);
    if (!appid) return { appid: null };
    const [base, ex] = await Promise.all([this.steamDetails(appid), this.extras(appid)]);
    return { ...base, ...ex };
  }

  async steamDetails(appid) {
    const cached = this.meta.details[appid];
    if (cached && Date.now() - cached.at < 7 * 86400000 && 'trailer' in cached) return cached;
    try {
      const j = await fetchJson(`https://store.steampowered.com/api/appdetails?appids=${appid}&l=hungarian&cc=hu`, 8000);
      const d = j[appid] && j[appid].success ? j[appid].data : null;
      if (!d) return { appid };
      const out = {
        at: Date.now(), appid,
        description: d.short_description || '',
        genres: (d.genres || []).map((g) => g.description),
        developers: d.developers || [], publishers: d.publishers || [],
        release: d.release_date ? d.release_date.date : '',
        metacritic: d.metacritic ? d.metacritic.score : null,
        screenshots: (d.screenshots || []).slice(0, 8).map((s) => s.path_thumbnail),
        controller: d.controller_support || null,
        background: d.background_raw || d.background || null,
        name: d.name,
        price: d.is_free ? 'Ingyenes' : (d.price_overview ? d.price_overview.final_formatted : null),
        discount: d.price_overview ? d.price_overview.discount_percent : 0,
        comingSoon: d.release_date ? !!d.release_date.coming_soon : false,
        website: d.website || null,
        // előzetes a kezdőképernyő dinamikus hátteréhez (kis felbontású, gyorsan indul)
        // a Steam ma már HLS/DASH streamet ad – a közvetlen mp4 a videó azonosítójából érhető el
        trailer: (() => { const mv = (d.movies || [])[0]; return mv ? (mv.mp4 && (mv.mp4['480'] || mv.mp4.max)) || (mv.id ? `https://cdn.akamai.steamstatic.com/steam/apps/${mv.id}/movie480.mp4` : null) : null; })(),
      };
      this.meta.details[appid] = out;
      writeJson(this.files.meta, this.meta);
      return out;
    } catch (err) {
      return cached || { appid, error: err.message };
    }
  }
}

module.exports = { Library };
