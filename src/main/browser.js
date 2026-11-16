'use strict';
// Beépített böngésző (fő folyamat oldal): elkülönített munkamenet, biztonsági korlátok, letöltések.
// A megjelenítés a renderer <webview> elemében történik (src/renderer/browser.js).
const { app, session, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const PARTITION = 'persist:inarix-browser';
const SAFE_URL = /^(https?:|about:blank)/i;
// Engedélyek, amelyek egy konzolos böngészőben értelmesek; minden más (kamera, mikrofon, hely, értesítés…) tiltva
const ALLOWED_PERMISSIONS = new Set(['fullscreen', 'clipboard-sanitized-write', 'pointerLock', 'keyboardLock']);

function chromeUA() {
  // Electron/InariX tokenek nélkül – egyes oldalak (pl. Google bejelentkezés) az ismeretlen böngészőket letiltják
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;
}

// A Google a beágyazott (Chromium alapú) böngészőkből tiltja a bejelentkezést („nem biztonságos böngésző”).
// A Google fiók oldalain Firefox azonosítóval jelentkezünk, a Chromium kliens-tippeket (Sec-CH-UA) elhagyjuk.
const FIREFOX_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0';
const GOOGLE_AUTH = /^https:\/\/accounts\.google\.com\//i;

function uniquePath(dir, name) {
  const safe = (name || 'letoltes').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 180) || 'letoltes';
  const ext = path.extname(safe), base = path.basename(safe, ext);
  let p = path.join(dir, safe);
  for (let i = 1; fs.existsSync(p); i++) p = path.join(dir, `${base} (${i})${ext}`);
  return p;
}

function setupBrowser({ getWin, sendUI, log, onWebview }) {
  const ses = session.fromPartition(PARTITION);
  ses.setUserAgent(chromeUA());
  ses.setPermissionRequestHandler((_wc, perm, cb) => cb(ALLOWED_PERMISSIONS.has(perm)));
  ses.setPermissionCheckHandler((_wc, perm) => ALLOWED_PERMISSIONS.has(perm));
  ses.webRequest.onBeforeSendHeaders({ urls: ['https://accounts.google.com/*'] }, (details, cb) => {
    const hdr = { ...details.requestHeaders, 'User-Agent': FIREFOX_UA };
    for (const k of Object.keys(hdr)) if (/^sec-ch-ua/i.test(k)) delete hdr[k];
    cb({ requestHeaders: hdr });
  });

  ses.on('will-download', (_e, item) => {
    const dir = app.getPath('downloads');
    const file = uniquePath(dir, item.getFilename());
    item.setSavePath(file);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const name = path.basename(file);
    sendUI('browser:download', { id, name, state: 'started', total: item.getTotalBytes() });
    let last = 0;
    item.on('updated', (_ev, state) => {
      const now = Date.now();
      if (now - last < 500) return;
      last = now;
      sendUI('browser:download', { id, name, state, received: item.getReceivedBytes(), total: item.getTotalBytes() });
    });
    item.once('done', (_ev, state) => {
      log(`[böngésző] letöltés ${state}: ${file}`);
      sendUI('browser:download', { id, name, state, file, received: item.getReceivedBytes(), total: item.getTotalBytes() });
    });
  });

  app.on('web-contents-created', (_e, wc) => {
    if (wc.getType() !== 'webview') return;
    if (onWebview) onWebview(wc);
    // Google bejelentkezés: a teljes oldal (navigator.userAgent is) Firefoxnak látszik, utána vissza Chrome-ra
    wc.on('did-start-navigation', (ev) => {
      const url = ev.url || '';
      if (!ev.isMainFrame || !/^https?:/i.test(url)) return;
      const ua = GOOGLE_AUTH.test(url) ? FIREFOX_UA : chromeUA();
      if (wc.getUserAgent() !== ua) wc.setUserAgent(ua);
    });
    // HTML teljes képernyő: Esc-re mindig kilépünk (Electronban ez magától nem működik)
    let htmlFs = false;
    wc.on('enter-html-full-screen', () => { htmlFs = true; });
    wc.on('leave-html-full-screen', () => { htmlFs = false; });
    // Felugró ablakok (target=_blank, window.open) ugyanabban a nézetben nyílnak meg – konzolon nincs ablakkezelés
    wc.setWindowOpenHandler(({ url }) => {
      if (SAFE_URL.test(url)) sendUI('browser:open', { url });
      else if (/^mailto:/i.test(url)) shell.openExternal(url).catch(() => {});
      return { action: 'deny' };
    });
    wc.on('will-navigate', (ev, url) => { if (!SAFE_URL.test(url)) ev.preventDefault(); });
    wc.on('will-redirect', (ev, url) => { if (!SAFE_URL.test(url)) ev.preventDefault(); });
    // Billentyűs kiugrás a weboldalból (a fókusz a webview-ban van, a konzol nem látja a billentyűket)
    wc.on('before-input-event', (ev, input) => {
      if (input.type !== 'keyDown') return;
      const k = input.key;
      if (k === 'F6' || (input.control && k.toLowerCase() === 'l')) { ev.preventDefault(); sendUI('browser:key', 'address'); }
      else if (input.alt && k === 'ArrowLeft') { ev.preventDefault(); sendUI('browser:key', 'back'); }
      else if (input.alt && k === 'ArrowRight') { ev.preventDefault(); sendUI('browser:key', 'forward'); }
      else if (k === 'F5') { ev.preventDefault(); sendUI('browser:key', 'reload'); }
      else if (input.alt && k === 'Home') { ev.preventDefault(); sendUI('browser:key', 'home'); }
      else if (k === 'Escape' && htmlFs) { ev.preventDefault(); wc.executeJavaScript('document.fullscreenElement && document.exitFullscreen()', true).catch(() => {}); sendUI('browser:key', 'exitfs'); }
      else if (k === 'Escape' && input.shift) { ev.preventDefault(); sendUI('browser:key', 'exit'); }
      else if (k === 'F12') { ev.preventDefault(); wc.toggleDevTools(); }
    });
  });

  const win = getWin();
  win.webContents.on('will-attach-webview', (ev, prefs, params) => {
    // A weboldal semmilyen InariX/Node hozzáférést nem kaphat
    prefs.preload = path.join(__dirname, 'browser-preload.js'); // csak a Google bejelentkezési javítás
    prefs.nodeIntegration = false;
    prefs.nodeIntegrationInSubFrames = false;
    prefs.contextIsolation = true;
    prefs.sandbox = true;
    prefs.webSecurity = true;
    if (params.partition !== PARTITION || (params.src && !SAFE_URL.test(params.src))) {
      log(`[böngésző] tiltott webview csatolás: ${params.partition} ${params.src}`);
      ev.preventDefault();
    }
  });

  return {
    async clearData(what = 'all') {
      if (what === 'cache') await ses.clearCache();
      else { await ses.clearCache(); await ses.clearStorageData(); }
      return true;
    },
    downloadsDir: () => app.getPath('downloads'),
  };
}

module.exports = { setupBrowser, PARTITION, chromeUA };
