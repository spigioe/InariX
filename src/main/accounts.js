'use strict';
// Játékkönyvtár szinkronizáció: Steam, Epic Games, GOG, Microsoft Store / Xbox, Ubisoft Connect fiókok.
// A bejelentkezés a beépített böngészőben történik (kontrollerrel is használható); a fő folyamat figyeli
// a webview navigációját, és a sikeres belépés után kiolvassa a hozzáférést (kód / süti / token).
// A tokenek titkosítva (Windows DPAPI – safeStorage) az accounts.dat fájlban vannak, a konfigba csak
// a nyilvános állapot kerül (csatlakoztatva, név, játékszám, utolsó szinkron, hiba).
const { BrowserWindow, safeStorage, session } = require('electron');
const fs = require('fs');
const path = require('path');
const { PARTITION, chromeUA } = require('./browser');

const STORES = ['steam', 'epic', 'gog', 'msstore', 'ubisoft'];
const STORE_NAME = { steam: 'Steam', epic: 'Epic Games', gog: 'GOG', msstore: 'Microsoft Store', ubisoft: 'Ubisoft Connect' };
// Nyilvános (a hivatalos asztali kliensek által is használt) OAuth azonosítók – ugyanezt használja a Legendary/Heroic/Playnite
const EPIC = { id: '34a02cf8f4414e29b15921876da36f9a', secret: 'daafbccc737745039dffe53d94fc76cf' };
const GOG = { id: '46899977096215655', secret: '9d85c43b1482497dbbce61f6e4aa173a433796eeef2deb9d', redirect: 'https://embed.gog.com/on_login_success?origin=client' };
const MS = { id: '0000000048093EE3', redirect: 'https://login.live.com/oauth20_desktop.srf', scope: 'service::user.auth.xboxlive.com::MBI_SSL' };
const UBI_APPS = ['314d4fef-e568-454a-ae06-43e3bece12a6', 'f68a4bb5-608a-4ff2-8123-be8ef797e0a6'];
const STALE_MS = 6 * 3600 * 1000;

const LOGIN_URL = {
  steam: 'https://steamcommunity.com/login/home/?goto=my%2Fgames%2F%3Ftab%3Dall',
  epic: `https://www.epicgames.com/id/login?redirectUrl=${encodeURIComponent(`https://www.epicgames.com/id/api/redirect?clientId=${EPIC.id}&responseType=code`)}`,
  gog: `https://auth.gog.com/auth?client_id=${GOG.id}&redirect_uri=${encodeURIComponent(GOG.redirect)}&response_type=code&layout=client2`,
  msstore: `https://login.live.com/oauth20_authorize.srf?client_id=${MS.id}&response_type=token&scope=${encodeURIComponent(MS.scope)}&redirect_uri=${encodeURIComponent(MS.redirect)}&display=touch`,
  ubisoft: `https://connect.ubisoft.com/login?appId=${UBI_APPS[0]}&lang=hu-HU&nextUrl=${encodeURIComponent('https://connect.ubisoft.com/ready')}`,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function readJson(file, def) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return def; } }
function writeJson(file, data) { const tmp = `${file}.tmp`; fs.writeFileSync(tmp, JSON.stringify(data)); fs.renameSync(tmp, file); }

async function http(url, { method = 'GET', headers = {}, form, json, timeout = 20000 } = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeout);
  const h = { 'User-Agent': chromeUA(), Accept: 'application/json', ...headers };
  let body;
  if (form) { body = new URLSearchParams(form).toString(); h['Content-Type'] = 'application/x-www-form-urlencoded'; }
  if (json !== undefined) { body = JSON.stringify(json); h['Content-Type'] = 'application/json'; }
  try {
    const r = await fetch(String(url), { method, headers: h, body, signal: ac.signal });
    const text = await r.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    if (!r.ok) {
      const msg = data && typeof data === 'object' ? (data.errorMessage || data.error_description || data.message || data.error || '') : '';
      const e = new Error(`HTTP ${r.status}${msg ? `: ${msg}` : ''}`);
      e.status = r.status;
      e.data = data;
      throw e;
    }
    return data;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('időtúllépés');
    throw e;
  } finally { clearTimeout(t); }
}

// Párhuzamos feldolgozás korláttal
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k).catch(() => null); }
  }));
  return out;
}

// Rejtett ablakban (a böngésző munkamenetével, tehát bejelentkezve) betölt egy oldalt és kiolvas belőle valamit
async function scrape(url, js, timeout = 30000) {
  const w = new BrowserWindow({ show: false, webPreferences: { partition: PARTITION, sandbox: true, contextIsolation: true } });
  w.webContents.setAudioMuted(true);
  try {
    await Promise.race([w.loadURL(url).catch(() => {}), sleep(timeout)]);
    for (let i = 0; i < 12; i++) {
      const r = await w.webContents.executeJavaScript(js).catch(() => null);
      if (r) return r;
      await sleep(1000);
    }
    return null;
  } finally { w.destroy(); }
}

class Accounts {
  constructor(dir, { getCfg, updateCfg, log, sendUI }) {
    Object.assign(this, { getCfg, updateCfg, log, sendUI });
    this.file = path.join(dir, 'accounts.dat');
    this.cacheFile = path.join(dir, 'owned-cache.json');
    this.metaFile = path.join(dir, 'owned-meta.json');
    this.secrets = this.load();
    this.cache = readJson(this.cacheFile, {});
    this.meta = readJson(this.metaFile, { epic: {} });
    this.pending = null;
    this.syncing = {};
  }

  // ---------- titkos adatok ----------
  load() {
    try {
      const raw = fs.readFileSync(this.file);
      return JSON.parse(safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString('utf8'));
    } catch { return {}; }
  }
  persist() {
    const txt = JSON.stringify(this.secrets);
    fs.writeFileSync(this.file, safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(txt) : txt);
  }
  setStatus(store, patch) {
    this.updateCfg({ sync: { [store]: patch } });
    this.sendUI('accounts', this.getCfg().sync);
  }

  // ---------- bejelentkezés ----------
  beginLogin(store) {
    if (!LOGIN_URL[store]) throw new Error('Ismeretlen platform');
    this.pending = { store, at: Date.now(), busy: false };
    this.log(`[fiók] bejelentkezés indul: ${STORE_NAME[store]}`);
    return LOGIN_URL[store];
  }
  cancel() { this.pending = null; return true; }

  // A böngésző minden webview-jára ráakaszkodunk (src/main/browser.js hívja)
  attach(wc) {
    const on = (kind) => (_e, url) => this.onUrl(wc, url || wc.getURL(), kind).catch(() => {});
    wc.on('will-redirect', on('redirect'));
    wc.on('did-redirect-navigation', on('redirect'));
    wc.on('did-navigate', on('nav'));
    wc.on('did-navigate-in-page', on('inpage'));
    wc.on('did-finish-load', () => this.onUrl(wc, wc.getURL(), 'load').catch(() => {}));
    // Ubisoft: a belépési adat a localStorage-ba kerül, oldalbetöltés nélkül is – figyeljük
    const iv = setInterval(() => {
      if (wc.isDestroyed()) return clearInterval(iv);
      if (this.pending && this.pending.store === 'ubisoft') this.onUrl(wc, wc.getURL(), 'poll').catch(() => {});
    }, 1500);
    wc.once('destroyed', () => clearInterval(iv));
  }

  async onUrl(wc, url, kind) {
    const p = this.pending;
    if (!p || p.busy || !url) return;
    let creds = null;
    try {
      switch (p.store) {
        case 'steam':
          if (/^https:\/\/(steamcommunity\.com|store\.steampowered\.com)\//.test(url) && !/\/login\//.test(url) && (kind === 'load' || kind === 'nav')) {
            const id = await this.steamCookieId(wc.session);
            if (id) { p.busy = true; creds = { steamId: id, user: await this.steamName(id) }; }
          }
          break;
        case 'epic':
          if (url.startsWith('https://www.epicgames.com/id/api/redirect') && kind === 'load') {
            const txt = await wc.executeJavaScript('document.body ? document.body.innerText : ""');
            let j = {}; try { j = JSON.parse(txt); } catch { /* */ }
            if (j.authorizationCode) {
              p.busy = true;
              const t = await this.epicToken({ grant_type: 'authorization_code', code: j.authorizationCode });
              creds = { refresh: t.refresh_token, user: t.displayName || '', accountId: t.account_id };
            }
          }
          break;
        case 'gog':
          if (url.startsWith('https://embed.gog.com/on_login_success')) {
            const code = new URL(url).searchParams.get('code');
            if (code) {
              p.busy = true;
              const t = await this.gogToken({ grant_type: 'authorization_code', code, redirect_uri: GOG.redirect });
              let user = '';
              try { user = (await http('https://embed.gog.com/userData.json', { headers: { Authorization: `Bearer ${t.access_token}` } })).username || ''; } catch { /* */ }
              creds = { refresh: t.refresh_token, user, userId: t.user_id };
            }
          }
          break;
        case 'msstore':
          if (url.startsWith(MS.redirect)) {
            // Xbox app kliens: a token a címsor # része után érkezik (implicit folyamat)
            const u = new URL(url);
            const q = new URLSearchParams(u.hash.replace(/^#/, ''));
            const err = q.get('error') || u.searchParams.get('error');
            if (err) throw new Error(q.get('error_description') || u.searchParams.get('error_description') || 'A bejelentkezés megszakadt');
            const access = q.get('access_token');
            if (access) {
              p.busy = true;
              const x = await this.xboxAuth(access);
              creds = { refresh: q.get('refresh_token') || null, access, accessExp: Date.now() + (Number(q.get('expires_in')) || 3600) * 1000, user: x.gamertag || '' };
            }
          }
          break;
        case 'ubisoft':
          if (/^https:\/\/connect\.ubisoft\.com\//.test(url)) {
            const raw = await wc.executeJavaScript('localStorage.getItem("PRODloginData")').catch(() => null);
            let d = null; try { d = JSON.parse(raw); } catch { /* */ }
            if (d && d.ticket) {
              p.busy = true;
              creds = { remember: d.rememberMeTicket || null, ticket: d.ticket, sessionId: d.sessionId, user: d.nameOnPlatform || '', profileId: d.profileId || d.userId };
            }
          }
          break;
        default: break;
      }
    } catch (e) {
      this.pending = null;
      this.log(`[fiók] ${STORE_NAME[p.store]} bejelentkezés hiba: ${e.message}`);
      this.sendUI('account:done', { store: p.store, ok: false, error: e.message });
      return;
    }
    if (!creds) { if (p.busy) p.busy = false; return; }
    this.finish(p.store, creds);
  }

  finish(store, creds) {
    this.pending = null;
    this.secrets[store] = { ...creds, at: Date.now() };
    this.persist();
    this.updateCfg({ library: { showOwned: true } });
    this.setStatus(store, { enabled: true, connected: true, user: creds.user || '', error: '' });
    this.log(`[fiók] ${STORE_NAME[store]} csatlakoztatva (${creds.user || 'névtelen'})`);
    this.sendUI('account:done', { store, ok: true, user: creds.user || '' });
    this.sync(store, true).catch(() => {});
  }
  fail(store, msg) {
    this.pending = null;
    this.log(`[fiók] ${STORE_NAME[store]} bejelentkezés hiba: ${msg}`);
    this.sendUI('account:done', { store, ok: false, error: msg });
  }

  // Microsoft: eszközkódos belépés (mint Xboxon) – a felhasználó a telefonján / bármely böngészőben a
  // microsoft.com/link oldalon beírja a kódot; a beágyazott böngészőre nincs szükség.
  async startDeviceLogin(store) {
    if (store !== 'msstore') throw new Error('Ehhez a platformhoz nincs kódos belépés');
    const j = await http('https://login.live.com/oauth20_connect.srf', { method: 'POST', form: { client_id: MS.id, scope: MS.scope, response_type: 'device_code' } });
    const p = { store, device: j.device_code, busy: false };
    this.pending = p;
    const until = Date.now() + (j.expires_in || 900) * 1000;
    const interval = Math.max(3, j.interval || 5) * 1000;
    (async () => {
      while (this.pending === p && Date.now() < until) {
        await sleep(interval);
        if (this.pending !== p) return;
        try {
          const t = await this.msToken({ grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: p.device });
          const x = await this.xboxAuth(t.access_token);
          return this.finish(store, { refresh: t.refresh_token || null, access: t.access_token, accessExp: Date.now() + (t.expires_in || 3600) * 1000, user: x.gamertag || '' });
        } catch (e) {
          const code = e.data && e.data.error;
          if (code === 'authorization_pending' || code === 'slow_down') continue;
          return this.fail(store, code === 'expired_token' ? 'A kód lejárt – kérj újat' : e.message);
        }
      }
      if (this.pending === p) this.fail(store, 'A kód lejárt – kérj újat');
    })();
    return { code: j.user_code, url: j.verification_uri || 'https://www.microsoft.com/link', expires: j.expires_in || 900 };
  }

  // Epic / GOG: belépés a rendszer saját böngészőjében, a kapott kód (vagy a teljes cím) beillesztésével
  externalLoginUrl(store) {
    if (store === 'epic') return LOGIN_URL.epic;
    if (store === 'gog') return LOGIN_URL.gog;
    throw new Error('Ennél a platformnál nem támogatott');
  }
  async submitCode(store, text) {
    const t = String(text || '').trim();
    if (!t) throw new Error('Üres kód');
    try {
      if (store === 'epic') {
        let code = t;
        const m = t.match(/"authorizationCode"\s*:\s*"([0-9a-f]+)"/i) || t.match(/([0-9a-f]{32})/i);
        if (m) code = m[1];
        const r = await this.epicToken({ grant_type: 'authorization_code', code });
        return this.finish(store, { refresh: r.refresh_token, user: r.displayName || '', accountId: r.account_id });
      }
      if (store === 'gog') {
        let code = t;
        const m = t.match(/[?&]code=([^&#\s]+)/);
        if (m) code = decodeURIComponent(m[1]);
        const r = await this.gogToken({ grant_type: 'authorization_code', code, redirect_uri: GOG.redirect });
        let user = '';
        try { user = (await http('https://embed.gog.com/userData.json', { headers: { Authorization: `Bearer ${r.access_token}` } })).username || ''; } catch { /* */ }
        return this.finish(store, { refresh: r.refresh_token, user, userId: r.user_id });
      }
      throw new Error('Ennél a platformnál nem támogatott');
    } catch (e) {
      throw new Error(`A kód nem fogadható el (${e.message}) – lépj be újra, és a legfrissebb kódot másold be`);
    }
  }

  disconnect(store) {
    delete this.secrets[store];
    delete this.cache[store];
    this.persist();
    writeJson(this.cacheFile, this.cache);
    this.setStatus(store, { connected: false, user: '', count: 0, at: 0, error: '' });
    return true;
  }

  // ---------- szinkron ----------
  isConnected(store) {
    if (store === 'steam') return !!(this.secrets.steam || this.steamApiKey());
    return !!this.secrets[store];
  }
  steamApiKey() { const c = this.getCfg(); return (c.account && c.account.steamApiKey) || (c.hostMode && c.hostMode.steamApiKey) || ''; }

  async sync(store, force = false) {
    if (this.syncing[store]) return this.syncing[store];
    const c = this.cache[store];
    if (!force && c && Date.now() - c.at < STALE_MS) return c.games;
    const run = (async () => {
      this.sendUI('accounts:syncing', { store, on: true });
      try {
        const games = await this[`owned_${store}`]();
        this.cache[store] = { at: Date.now(), games };
        writeJson(this.cacheFile, this.cache);
        this.setStatus(store, { count: games.length, at: Date.now(), error: '' });
        this.log(`[fiók] ${STORE_NAME[store]}: ${games.length} játék szinkronizálva`);
        this.sendUI('accounts:synced', { store, count: games.length });
        return games;
      } catch (e) {
        this.log(`[fiók] ${STORE_NAME[store]} szinkron hiba: ${e.message}`);
        this.setStatus(store, { error: e.message });
        this.sendUI('accounts:synced', { store, error: e.message });
        return c ? c.games : [];
      } finally {
        delete this.syncing[store];
        this.sendUI('accounts:syncing', { store, on: false });
      }
    })();
    this.syncing[store] = run;
    return run;
  }

  // A könyvtár ezt hívja: azonnal a gyorsítótárból válaszol, az elavult platformokat a háttérben frissíti
  owned() {
    const cfg = this.getCfg().sync || {};
    const out = [];
    for (const s of STORES) {
      if (!cfg[s] || cfg[s].enabled === false || !this.isConnected(s)) continue;
      const c = this.cache[s];
      if (!c || Date.now() - c.at > STALE_MS) this.sync(s).catch(() => {});
      if (c) out.push(...c.games);
    }
    return out;
  }
  syncAll(force = true) { return Promise.all(STORES.filter((s) => this.isConnected(s)).map((s) => this.sync(s, force))); }

  // ---------- Steam ----------
  async steamCookieId(ses) {
    const list = await ses.cookies.get({ name: 'steamLoginSecure' }).catch(() => []);
    for (const c of list) { const m = decodeURIComponent(c.value).match(/^(\d{17})/); if (m) return m[1]; }
    return null;
  }
  async steamName(id) {
    try { const x = await http(`https://steamcommunity.com/profiles/${id}/?xml=1`, { timeout: 8000 }); const m = String(x).match(/<steamID><!\[CDATA\[(.*?)\]\]>/); return m ? m[1] : ''; } catch { return ''; }
  }
  async owned_steam() {
    let id = this.secrets.steam && this.secrets.steam.steamId;
    const key = this.steamApiKey();
    if (!id) {
      const a = this.getCfg().account || {};
      id = /^\d{17}$/.test(a.steamId || '') ? a.steamId : await require('../core/store').steamUserId();
    }
    if (!id) throw new Error('Nincs Steam fiók – jelentkezz be');
    const mk = (g) => ({ store: 'steam', storeId: String(g.appid), name: g.name, playtimeMin: g.playtime_forever || 0, lastPlayed: (g.rtime_last_played || 0) * 1000 });
    // 1) Web API kulcs (ha meg van adva)
    if (key) {
      try {
        const j = await http(`https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${encodeURIComponent(key)}&steamid=${id}&include_appinfo=1&format=json`);
        const games = (j.response && j.response.games) || [];
        if (games.length) return games.map(mk);
      } catch (e) { this.log(`[fiók] Steam API: ${e.message}`); }
    }
    // 2) A profil játéklistája bejelentkezett munkamenettel (privát profillal is működik a saját fióknál)
    const raw = await scrape(`https://steamcommunity.com/profiles/${id}/games/?tab=all`,
      '(() => { const el = document.querySelector("[data-profile-gameslist]"); return el ? el.getAttribute("data-profile-gameslist") : null })()');
    if (raw) {
      try { const j = JSON.parse(raw); if (j.rgGames && j.rgGames.length) return j.rgGames.map(mk); } catch { /* */ }
    }
    // 3) Áruház felhasználói adatai (csak azonosítók) + nevek a nyilvános áruház API-ból
    const ses = session.fromPartition(PARTITION);
    const r = await ses.fetch('https://store.steampowered.com/dynamicstore/userdata/', { headers: { 'User-Agent': chromeUA() } });
    const ud = await r.json().catch(() => ({}));
    const ids = (ud.rgOwnedApps || []).slice(0, 5000);
    if (!ids.length) throw new Error('Nem sikerült lekérni a Steam játékokat (jelentkezz be újra, vagy add meg a Steam Web API kulcsot)');
    const out = [];
    for (let i = 0; i < ids.length; i += 200) {
      const input = { ids: ids.slice(i, i + 200).map((appid) => ({ appid })), context: { language: 'english', country_code: 'US' }, data_request: {} };
      const j = await http(`https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(JSON.stringify(input))}`).catch(() => ({}));
      for (const it of (j.response && j.response.store_items) || []) if (it.name && (it.type === 0 || it.type === undefined)) out.push(mk({ appid: it.appid, name: it.name }));
    }
    return out;
  }

  // ---------- Epic Games ----------
  epicToken(form) {
    return http('https://account-public-service-prod03.ol.epicgames.com/account/api/oauth/token', {
      method: 'POST', form: { ...form, token_type: 'eg1' },
      headers: { Authorization: `basic ${Buffer.from(`${EPIC.id}:${EPIC.secret}`).toString('base64')}` },
    });
  }
  async owned_epic() {
    const s = this.secrets.epic;
    if (!s) throw new Error('Nincs Epic fiók');
    let t;
    try { t = await this.epicToken({ grant_type: 'refresh_token', refresh_token: s.refresh }); } catch (e) { throw new Error(`Az Epic bejelentkezés lejárt – csatlakoztasd újra (${e.message})`); }
    s.refresh = t.refresh_token; this.persist();
    const auth = { Authorization: `bearer ${t.access_token}` };
    const recs = [];
    let cursor = null;
    do {
      const u = new URL('https://library-service.live.use1a.on.epicgames.com/library/api/public/items');
      u.searchParams.set('includeMetadata', 'true');
      if (cursor) u.searchParams.set('cursor', cursor);
      const j = await http(u, { headers: auth });
      recs.push(...(j.records || []));
      cursor = j.responseMetadata && j.responseMetadata.nextCursor;
    } while (cursor && recs.length < 10000);
    const seen = new Set();
    const items = recs.filter((r) => r.namespace !== 'ue' && r.appName && r.catalogItemId && !seen.has(r.appName) && seen.add(r.appName));
    const meta = this.meta.epic || (this.meta.epic = {});
    await pool(items.filter((r) => !meta[r.catalogItemId]), 8, async (r) => {
      const j = await http(`https://catalog-public-service-prod06.ol.epicgames.com/catalog/api/shared/namespace/${encodeURIComponent(r.namespace)}/bulk/items?id=${encodeURIComponent(r.catalogItemId)}&includeDLCDetails=true&includeMainGameDetails=true&country=HU&locale=hu`, { headers: auth });
      const it = j[r.catalogItemId];
      if (!it) return;
      const img = (type) => ((it.keyImages || []).find((k) => k.type === type) || {}).url || null;
      const cats = (it.categories || []).map((c) => c.path);
      meta[r.catalogItemId] = {
        title: it.title, tall: img('DieselGameBoxTall') || img('Thumbnail'), wide: img('DieselGameBox') || img('OfferImageWide'),
        game: !it.mainGameItem && !cats.includes('addons') && (cats.includes('games') || !cats.length),
      };
    });
    writeJson(this.metaFile, this.meta);
    return items.map((r) => ({ r, m: meta[r.catalogItemId] })).filter(({ m }) => m && m.game && m.title).map(({ r, m }) => ({
      store: 'epic', storeId: r.appName, name: m.title, cover: m.tall || undefined, coverFallback: m.wide || undefined, hero: m.wide || undefined,
      installId: `${r.namespace}:${r.catalogItemId}:${r.appName}`,
    }));
  }

  // ---------- GOG ----------
  gogToken(params) {
    const q = new URLSearchParams({ client_id: GOG.id, client_secret: GOG.secret, ...params });
    return http(`https://auth.gog.com/token?${q}`);
  }
  async owned_gog() {
    const s = this.secrets.gog;
    if (!s) throw new Error('Nincs GOG fiók');
    let t;
    try { t = await this.gogToken({ grant_type: 'refresh_token', refresh_token: s.refresh }); } catch (e) { throw new Error(`A GOG bejelentkezés lejárt – csatlakoztasd újra (${e.message})`); }
    s.refresh = t.refresh_token; this.persist();
    const out = [];
    let page = 1, total = 1;
    do {
      const j = await http(`https://embed.gog.com/account/getFilteredProducts?mediaType=1&sortBy=title&page=${page}`, { headers: { Authorization: `Bearer ${t.access_token}` } });
      total = j.totalPages || 1;
      for (const p of j.products || []) {
        if (p.isGame === false) continue;
        const img = p.image ? `https:${p.image}.jpg` : undefined;
        out.push({ store: 'gog', storeId: String(p.id), name: p.title, hero: img, artAlt: img });
      }
      page++;
    } while (page <= total && page < 100);
    return out;
  }

  // ---------- Microsoft Store / Xbox ----------
  msToken(form) {
    return http('https://login.live.com/oauth20_token.srf', { method: 'POST', form: { client_id: MS.id, redirect_uri: MS.redirect, scope: MS.scope, ...form } });
  }
  async xboxAuth(accessToken) {
    const u = await http('https://user.auth.xboxlive.com/user/authenticate', {
      method: 'POST', headers: { 'x-xbl-contract-version': '1' },
      json: { Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: accessToken }, RelyingParty: 'http://auth.xboxlive.com', TokenType: 'JWT' },
    });
    const x = await http('https://xsts.auth.xboxlive.com/xsts/authorize', {
      method: 'POST', headers: { 'x-xbl-contract-version': '1' },
      json: { Properties: { SandboxId: 'RETAIL', UserTokens: [u.Token] }, RelyingParty: 'http://xboxlive.com', TokenType: 'JWT' },
    });
    const xui = (x.DisplayClaims && x.DisplayClaims.xui && x.DisplayClaims.xui[0]) || {};
    if (!xui.xid) throw new Error('Ehhez a Microsoft fiókhoz nem tartozik Xbox profil');
    return { token: x.Token, uhs: xui.uhs, xid: xui.xid, gamertag: xui.gtg };
  }
  async owned_msstore() {
    const s = this.secrets.msstore;
    if (!s) throw new Error('Nincs Microsoft fiók');
    let access = s.access && s.accessExp > Date.now() + 60000 ? s.access : null;
    if (!access) {
      if (!s.refresh) throw new Error('A Microsoft bejelentkezés lejárt – csatlakoztasd újra');
      let t;
      try { t = await this.msToken({ grant_type: 'refresh_token', refresh_token: s.refresh }); } catch (e) { throw new Error(`A Microsoft bejelentkezés lejárt – csatlakoztasd újra (${e.message})`); }
      access = t.access_token;
      Object.assign(s, { access, accessExp: Date.now() + (t.expires_in || 3600) * 1000, refresh: t.refresh_token || s.refresh });
      this.persist();
    }
    const x = await this.xboxAuth(access);
    const j = await http(`https://titlehub.xboxlive.com/users/xuid(${x.xid})/titles/titlehistory/decoration/detail,image?maxItems=5000`, {
      headers: { Authorization: `XBL3.0 x=${x.uhs};${x.token}`, 'x-xbl-contract-version': '2', 'Accept-Language': 'hu-HU' },
    });
    const img = (tt, ...types) => { for (const ty of types) { const f = (tt.images || []).find((i) => i.type === ty); if (f) return f.url; } return null; };
    return (j.titles || [])
      .filter((tt) => tt.type === 'Game' && tt.pfn && (tt.devices || []).includes('PC'))
      .map((tt) => ({
        store: 'msstore', storeId: tt.pfn, name: tt.name,
        cover: img(tt, 'Poster', 'BoxArt') || tt.displayImage || undefined,
        coverFallback: img(tt, 'BrandedKeyArt', 'SuperHeroArt') || tt.displayImage || undefined,
        hero: img(tt, 'SuperHeroArt', 'TitledHeroArt', 'Screenshot') || undefined,
        lastPlayed: tt.titleHistory && tt.titleHistory.lastTimePlayed ? Date.parse(tt.titleHistory.lastTimePlayed) || 0 : 0,
      }));
  }

  // ---------- Ubisoft Connect ----------
  async ubiSession(s) {
    if (s.remember) {
      for (const appId of UBI_APPS) {
        try {
          const j = await http('https://public-ubiservices.ubi.com/v3/profiles/sessions', {
            method: 'POST', json: { rememberMe: true },
            headers: { 'Ubi-AppId': appId, Authorization: `rm_v1 t=${s.remember}`, 'Ubi-RequestedPlatformType': 'uplay' },
          });
          Object.assign(s, { ticket: j.ticket, sessionId: j.sessionId, remember: j.rememberMeTicket || s.remember, appId });
          this.persist();
          return s;
        } catch (e) { if (e.status !== 401 && e.status !== 403) throw e; }
      }
    }
    if (!s.ticket) throw new Error('A Ubisoft bejelentkezés lejárt – csatlakoztasd újra');
    return s;
  }
  async owned_ubisoft() {
    const s0 = this.secrets.ubisoft;
    if (!s0) throw new Error('Nincs Ubisoft fiók');
    const s = await this.ubiSession(s0);
    const query = 'query AllGames {viewer {id ...ownedGamesList __typename}}fragment ownedGamesList on User {ownedGames: games(filterBy: {isOwned: true}) {totalCount nodes {...ownedGameProps __typename} __typename} __typename}fragment ownedGameProps on Game {id spaceId name __typename}';
    let lastErr = null;
    for (const appId of [s.appId, ...UBI_APPS].filter(Boolean)) {
      try {
        const j = await http('https://public-ubiservices.ubi.com/v1/profiles/me/uplay/graphql', {
          method: 'POST', json: { operationName: 'AllGames', variables: { owned: true }, query },
          headers: { 'Ubi-AppId': appId, Authorization: `Ubi_v1 t=${s.ticket}`, 'Ubi-SessionId': s.sessionId },
        });
        const nodes = (j.data && j.data.viewer && j.data.viewer.ownedGames && j.data.viewer.ownedGames.nodes) || [];
        if (!nodes.length && j.errors) throw new Error(j.errors[0].message);
        return nodes.filter((n) => n.name).map((n) => ({ store: 'ubisoft', storeId: String(n.id), name: n.name, installId: String(n.id) }));
      } catch (e) { lastErr = e; if (e.status === 401) throw new Error('A Ubisoft bejelentkezés lejárt – csatlakoztasd újra'); }
    }
    throw lastErr || new Error('Ubisoft: ismeretlen hiba');
  }
}

module.exports = { Accounts, STORES, STORE_NAME };
