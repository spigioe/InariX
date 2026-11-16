'use strict';
// Áruház: Steam keresés (nyilvános API), saját könyvtár (Steam Web API kulccsal, Epic legendaryvel).
const fs = require('fs');
const path = require('path');
const { parseVdf, run } = require('./util');
const { findSteamPath } = require('./scanner');
const { findLegendary } = require('./launcher');

async function fetchJson(url, timeoutMs = 10000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { 'User-Agent': 'InariX/1.0' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

async function steamSearch(term, cc = 'hu') {
  if (!term || !term.trim()) return [];
  const j = await fetchJson(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(term)}&l=hungarian&cc=${cc}`);
  return (j.items || []).filter((it) => it.type === 'app').map((it) => ({
    store: 'steam', storeId: String(it.id), name: it.name,
    cover: `https://cdn.cloudflare.steamstatic.com/steam/apps/${it.id}/library_600x900.jpg`,
    coverFallback: it.tiny_image || `https://cdn.cloudflare.steamstatic.com/steam/apps/${it.id}/header.jpg`,
    price: it.price ? `${(it.price.final / 100).toLocaleString('hu-HU')} ${it.price.currency}` : 'Ingyenes',
  }));
}

// Áruház nyitóoldal sorokban (mint a konzolos áruházakban)
async function steamStoreRows(cc = 'hu') {
  const j = await fetchJson(`https://store.steampowered.com/api/featuredcategories/?cc=${cc}&l=hungarian`);
  const map = (items) => (items || []).filter((it) => it.type === 0).map((it) => ({
    store: 'steam', storeId: String(it.id), name: it.name,
    cover: `https://cdn.cloudflare.steamstatic.com/steam/apps/${it.id}/library_600x900.jpg`,
    coverFallback: it.large_capsule_image || it.header_image,
    price: it.final_price ? `${(it.final_price / 100).toLocaleString('hu-HU')} ${it.currency}` : (it.discounted === false && it.final_price === 0 ? 'Ingyenes' : ''),
    discount: it.discount_percent || 0,
  }));
  const dedupe = (arr) => { const s = new Set(); return arr.filter((x) => !s.has(x.storeId) && s.add(x.storeId)); };
  return [
    { id: 'specials', title: 'Akciók', items: dedupe(map(j.specials && j.specials.items)) },
    { id: 'top', title: 'Toplista', items: dedupe(map(j.top_sellers && j.top_sellers.items)) },
    { id: 'new', title: 'Újdonságok', items: dedupe(map(j.new_releases && j.new_releases.items)) },
    { id: 'soon', title: 'Hamarosan', items: dedupe(map(j.coming_soon && j.coming_soon.items)) },
  ].filter((r) => r.items.length);
}

// Legutóbb bejelentkezett Steam felhasználó SteamID64-e
async function steamUserId() {
  const steam = await findSteamPath();
  if (!steam) return null;
  try {
    const users = parseVdf(fs.readFileSync(path.join(steam, 'config', 'loginusers.vdf'), 'utf8')).users || {};
    const ids = Object.keys(users);
    return ids.find((id) => users[id].MostRecent === '1') || ids[0] || null;
  } catch { return null; }
}

async function ownedGames({ steamApiKey } = {}, installedIds = new Set()) {
  const out = [];
  if (steamApiKey) {
    const sid = await steamUserId();
    if (sid) {
      try {
        const j = await fetchJson(`https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${encodeURIComponent(steamApiKey)}&steamid=${sid}&include_appinfo=1&format=json`);
        for (const g of (j.response && j.response.games) || []) {
          if (installedIds.has(`steam:${g.appid}`)) continue;
          out.push({
            store: 'steam', storeId: String(g.appid), name: g.name, owned: true,
            cover: `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/library_600x900.jpg`,
            coverFallback: `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/header.jpg`,
            playtime: g.playtime_forever || 0,
          });
        }
      } catch (e) { out.push({ error: `Steam: ${e.message}` }); }
    }
  }
  const leg = await findLegendary();
  if (leg) {
    const r = await run(leg, ['list', '--json'], { timeout: 60000 });
    try {
      for (const g of JSON.parse(r.stdout)) {
        if (installedIds.has(`epic:${g.app_name}`)) continue;
        out.push({ store: 'epic', storeId: g.app_name, name: g.app_title, owned: true });
      }
    } catch { /* legendary nincs bejelentkezve */ }
  }
  return out.filter((x) => !x.error).sort((a, b) => (b.playtime || 0) - (a.playtime || 0));
}

// GOG: nyilvános katalógus API (catalog.gog.com) – keresés és kiemelt sorok
const GOG_CAT = 'https://catalog.gog.com/v1/catalog?productType=in:game,pack&countryCode=HU&locale=en-US&currencyCode=EUR';
const gogItem = (p) => ({
  store: 'gog', storeId: String(p.id), name: p.title,
  cover: p.coverVertical || p.coverHorizontal, coverFallback: p.coverHorizontal || p.coverVertical,
  price: p.price ? (p.price.finalMoney && Number(p.price.finalMoney.amount) === 0 ? 'Ingyenes' : p.price.final) : '',
  discount: p.price && p.price.discount ? Math.abs(parseInt(p.price.discount, 10)) || 0 : 0,
  url: p.slug ? `https://www.gog.com/game/${p.slug}` : '',
});
async function gogSearch(term) {
  if (!term || !term.trim()) return [];
  const j = await fetchJson(`${GOG_CAT}&limit=48&order=desc:score&query=like:${encodeURIComponent(term.trim())}`);
  return (j.products || []).map(gogItem);
}
async function gogStoreRows() {
  const get = (q) => fetchJson(`${GOG_CAT}&limit=24&${q}`).then((j) => (j.products || []).map(gogItem)).catch(() => []);
  const [specials, trending, best, fresh] = await Promise.all([get('order=desc:discount&discounted=eq:true&reviewsRating=gte:40'), get('order=desc:trending'), get('order=desc:bestselling'), get('order=desc:releaseDate&releaseStatuses=in:new-arrival')]);
  return [
    { id: 'specials', title: 'Akciók', items: specials },
    { id: 'trending', title: 'Felkapott', items: trending },
    { id: 'top', title: 'Toplista', items: best },
    { id: 'new', title: 'Újdonságok', items: fresh },
  ].filter((r) => r.items.length);
}

module.exports = { steamSearch, steamStoreRows, gogSearch, gogStoreRows, ownedGames, steamUserId };
