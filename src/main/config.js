'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { newToken } = require('../core/agent-server');

const DEFAULTS = () => ({
  hosts: [],                // távoli gépek: { id, name, address, port, token, mac, streamHost }
  lastHostId: 'local',
  moonlight: { path: '', app: 'Desktop', args: '' },
  display: {
    autoConsole: true,        // külső kijelző csatlakoztatásakor konzol mód
    topology: 'external',     // external | clone | extend | none
    keepAwakeOnLid: true,     // külső kijelzővel lecsukott fedél ne altasson
    alwaysReady: false,       // fedél lecsukva külső kijelző nélkül sem alszik azonnal
    alwaysReadyMinutes: 15,
    alwaysReadyOnlyAC: true,
    sleepOnUndock: true,      // lecsukott fedéllel kihúzva -> alvás
    hideOnUndock: true,
    disableLockOnWake: false, // régi kapcsoló (→ noLockMode 'always')
    noLockMode: 'off',        // off | docked | always – mikor ne kérjen PIN-t/jelszót a Windows
  },
  hostMode: { enabled: false, name: os.hostname(), port: 47800, token: newToken(), steamApiKey: '', customGames: [], excludedExes: [], sunshineUser: '', sunshinePass: '', allowStream: true, adminMode: false },
  setupDone: false,         // első indítás varázsló lefutott-e
  ui: { sounds: true, bootAnimation: true, theme: 'aurora', accent: 'aurora', scale: 100, screensaverMin: 5, pinOrder: [], weatherCity: '', showDate: true, nightMode: false, hostNotify: true, rumble: true, reduceMotion: false, kbLayout: 'auto' },
  library: { preferLocal: false, showHidden: false, sort: 'recent', groupByHost: true, showOwned: true },
  stream: { mic: false, engine: 'builtin', preset: 'auto', bitrate: 0, vsync: true, hostSleepAfter: 0, wifiWarn: true, hdr: false, overlay: false, codec: 'auto' },
  account: { steamApiKey: '', steamId: '' },
  collections: [],          // [{ id, name, keys: [] }]
  themes: [],               // saját témák (témakezelő)
  wishlist: [],             // [{ store, storeId, name, cover, coverFallback }]
  // Könyvtár szinkron fiókonként (nyilvános állapot; a tokenek titkosítva az accounts.dat-ban)
  sync: {
    steam: { enabled: true, connected: false, user: '', count: 0, at: 0, error: '' },
    epic: { enabled: true, connected: false, user: '', count: 0, at: 0, error: '' },
    gog: { enabled: true, connected: false, user: '', count: 0, at: 0, error: '' },
    msstore: { enabled: true, connected: false, user: '', count: 0, at: 0, error: '' },
    ubisoft: { enabled: true, connected: false, user: '', count: 0, at: 0, error: '' },
  },
  browser: { home: '', search: 'google', bookmarks: [], history: [], saveHistory: true, cursorSpeed: 100 }, // beépített böngésző
  autostart: true,
  power: { originalLid: null, originalLock: null },
});

function merge(base, over) {
  if (!over || typeof over !== 'object' || Array.isArray(over)) return over === undefined ? base : over;
  const out = { ...base };
  for (const k of Object.keys(over)) {
    out[k] = base && typeof base[k] === 'object' && !Array.isArray(base[k]) && base[k] !== null ? merge(base[k], over[k]) : over[k];
  }
  return out;
}

class Config {
  constructor(dir) {
    this.file = path.join(dir, 'config.json');
    let saved = {};
    if (fs.existsSync(this.file)) {
      try {
        saved = JSON.parse(fs.readFileSync(this.file, 'utf8').replace(/^﻿/, ''));
      } catch (e) {
        // sérült / kézzel elrontott konfig: ne veszítsük el, mentsük el mellé
        try { fs.copyFileSync(this.file, `${this.file}.bak`); } catch { /* ignore */ }
        console.error(`[config] hibás config.json (${e.message}), mentve: config.json.bak`);
      }
    }
    this.data = merge(DEFAULTS(), saved);
    // egyszeri migráció: a fiók szinkron óta a nem telepített játékok alapból látszanak
    if (!this.data.library.ownedV2) { this.data.library.showOwned = true; this.data.library.ownedV2 = true; }
    this.save();
  }
  get() { return this.data; }
  update(partial) { this.data = merge(this.data, partial); this.save(); return this.data; }
  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }
}

module.exports = { Config, DEFAULTS, merge };
