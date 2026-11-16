'use strict';
// Kezdőképernyő és gyors beállítások adatforrásai (a renderer CSP-je miatt a fő folyamatban kérdezzük le):
// játékhírek (Steam), kívánságlista akciók, időjárás (Open-Meteo, kulcs nélkül), internetes rádiók (radio-browser.info),
// médiagombok (Spotify / bármely lejátszó), fényerő (laptop kijelző), kontroller akkumulátor (XInput).
const { run } = require('../core/util');

async function fetchJson(url, ms = 8000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { 'User-Agent': 'InariX/1.0' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

const cache = {};
async function cached(key, ms, fn) {
  const c = cache[key];
  if (c && Date.now() - c.at < ms) return c.v;
  const v = await fn();
  cache[key] = { at: Date.now(), v };
  return v;
}

// Hírek a legutóbb játszott Steam játékokhoz + akciók a kívánságlistáról
function news(library, getCfg) {
  return cached('news', 30 * 60000, async () => {
    const games = (library.last.games || []).filter((g) => g.store === 'steam' && g.sources.length)
      .sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0)).slice(0, 8);
    const items = (await Promise.all(games.map(async (g) => {
      try {
        const j = await fetchJson(`https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${g.storeId}&count=1&maxlength=160&format=json`);
        const n = j.appnews && j.appnews.newsitems && j.appnews.newsitems[0];
        return n ? { appid: g.storeId, key: g.key, game: g.name, title: n.title, url: n.url, date: n.date * 1000, feed: n.feedlabel || '' } : null;
      } catch { return null; }
    }))).filter(Boolean).sort((a, b) => b.date - a.date);
    const wl = (getCfg().wishlist || []).filter((w) => w.store === 'steam').slice(0, 30);
    const sales = (await Promise.all(wl.map(async (w) => {
      try {
        const d = await library.steamDetails(w.storeId);
        return d && d.discount > 0 ? { appid: w.storeId, name: d.name || w.name, discount: d.discount, price: d.price } : null;
      } catch { return null; }
    }))).filter(Boolean).sort((a, b) => b.discount - a.discount);
    return { news: items, sales };
  });
}

// Időjárás (WMO kódok → leírás + ikon)
const WMO = [[0, '☀', 'derült'], [2, '⛅', 'részben felhős'], [3, '☁', 'borult'], [48, '🌫', 'köd'], [57, '🌦', 'szitálás'], [67, '🌧', 'eső'], [77, '🌨', 'havazás'], [82, '🌧', 'zápor'], [86, '🌨', 'hózápor'], [99, '⛈', 'zivatar']];
function weather(city) {
  if (!city) return Promise.resolve(null);
  return cached(`w:${city}`, 20 * 60000, async () => {
    const g = await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=hu`);
    const p = g.results && g.results[0];
    if (!p) throw new Error('A város nem található');
    const f = await fetchJson(`https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&current=temperature_2m,weather_code&timezone=auto`);
    const code = f.current ? f.current.weather_code : 0;
    const w = WMO.find(([max]) => code <= max) || WMO[WMO.length - 1];
    return { city: p.name, temp: Math.round(f.current.temperature_2m), icon: w[1], desc: w[2] };
  });
}

// Népszerű internetes rádiók (alapból magyarok)
function radios(country = 'HU') {
  return cached(`radio:${country}`, 6 * 3600000, async () => {
    const j = await fetchJson(`https://de1.api.radio-browser.info/json/stations/bycountrycodeexact/${encodeURIComponent(country)}?order=clickcount&reverse=true&limit=25&hidebroken=true`);
    return j.filter((s) => s.url_resolved && /^https:/i.test(s.url_resolved)).map((s) => ({ name: s.name.trim(), url: s.url_resolved, tags: s.tags || '' })).slice(0, 20);
  });
}

// Médiagombok: a rendszer médiavezérlése (Spotify, böngésző, bármely lejátszó)
const VK = { play: 0xB3, next: 0xB0, prev: 0xB1 };
function mediaKey(k) {
  const vk = VK[k];
  if (!vk) throw new Error('Ismeretlen médiagomb');
  const ps = `Add-Type -Name K -Namespace W -MemberDefinition '[DllImport("user32.dll")] public static extern void keybd_event(byte v, byte s, uint f, UIntPtr e);'; [W.K]::keybd_event(${vk},0,1,[UIntPtr]::Zero); [W.K]::keybd_event(${vk},0,3,[UIntPtr]::Zero)`;
  return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { timeout: 8000 }).then(() => true);
}

// Fényerő (csak beépített laptop kijelzőn – külső monitornál nincs WMI vezérlés)
async function brightness(set) {
  if (set === undefined) {
    const r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction Stop | Select-Object -First 1).CurrentBrightness'], { timeout: 8000 });
    const v = parseInt(r.stdout.trim(), 10);
    return Number.isFinite(v) ? v : null;
  }
  const v = Math.max(0, Math.min(100, Math.round(set)));
  await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `$m = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods -ErrorAction Stop | Select-Object -First 1; Invoke-CimMethod -InputObject $m -MethodName WmiSetBrightness -Arguments @{Timeout=1; Brightness=${v}} | Out-Null`], { timeout: 8000 });
  return v;
}

// Kontroller akkumulátor (XInput): 0 üres, 1 alacsony, 2 közepes, 3 teli; vezetékes = 'wired'
async function padBattery() {
  const ps = `Add-Type -Name B -Namespace X -MemberDefinition '[StructLayout(LayoutKind.Sequential)] public struct I { public byte t; public byte l; } [DllImport("xinput1_4.dll")] public static extern int XInputGetBatteryInformation(int u, byte d, out I i);'; $o = @(); for ($u=0; $u -lt 4; $u++) { $i = New-Object X.B+I; if ([X.B]::XInputGetBatteryInformation($u, 0, [ref]$i) -eq 0 -and $i.t -ne 0) { $o += "$u $($i.t) $($i.l)" } }; $o -join ';'`;
  const r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { timeout: 8000 });
  return r.stdout.trim().split(';').filter(Boolean).map((x) => {
    const [u, t, l] = x.split(' ').map(Number);
    return { index: u, wired: t === 1, level: ['üres', 'alacsony', 'közepes', 'teli'][l] || '?' };
  });
}

module.exports = { news, weather, radios, mediaKey, brightness, padBattery };
