'use strict';
// A beépített böngésző egyetlen preloadja: Google bejelentkezésnél az oldal Firefoxnak lássa a böngészőt
// (a Google a beágyazott Chromiumot "nem biztonságos böngészőként" tiltja). Node / InariX API nincs kiadva.
const { webFrame } = require('electron');
if (/(^|\.)accounts\.google\.com$/i.test(location.hostname)) {
  webFrame.executeJavaScript(`(() => { try {
    Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => undefined, configurable: true });
    Object.defineProperty(Navigator.prototype, 'vendor', { get: () => '', configurable: true });
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false, configurable: true });
    try { delete window.chrome; } catch (e) {}
  } catch (e) {} })();`);
}
