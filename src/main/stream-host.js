'use strict';
// Beépített stream – HOST oldal (a gaming PC-n fut, a InariX Host módjában).
// Rejtett rögzítő ablak (WebRTC: képernyő + rendszerhang küldése) + bemeneti segéd (SendInput / ViGEm).
const { BrowserWindow, ipcMain, desktopCapturer, session, screen } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');

// KeyboardEvent.code → [scancode (set 1), kiterjesztett]
const KEYMAP = {
  Escape: [0x01], Digit1: [0x02], Digit2: [0x03], Digit3: [0x04], Digit4: [0x05], Digit5: [0x06], Digit6: [0x07], Digit7: [0x08], Digit8: [0x09], Digit9: [0x0A], Digit0: [0x0B],
  Minus: [0x0C], Equal: [0x0D], Backspace: [0x0E], Tab: [0x0F],
  KeyQ: [0x10], KeyW: [0x11], KeyE: [0x12], KeyR: [0x13], KeyT: [0x14], KeyY: [0x15], KeyU: [0x16], KeyI: [0x17], KeyO: [0x18], KeyP: [0x19], BracketLeft: [0x1A], BracketRight: [0x1B], Enter: [0x1C],
  ControlLeft: [0x1D], KeyA: [0x1E], KeyS: [0x1F], KeyD: [0x20], KeyF: [0x21], KeyG: [0x22], KeyH: [0x23], KeyJ: [0x24], KeyK: [0x25], KeyL: [0x26], Semicolon: [0x27], Quote: [0x28], Backquote: [0x29],
  ShiftLeft: [0x2A], Backslash: [0x2B], KeyZ: [0x2C], KeyX: [0x2D], KeyC: [0x2E], KeyV: [0x2F], KeyB: [0x30], KeyN: [0x31], KeyM: [0x32], Comma: [0x33], Period: [0x34], Slash: [0x35], ShiftRight: [0x36],
  NumpadMultiply: [0x37], AltLeft: [0x38], Space: [0x39], CapsLock: [0x3A],
  F1: [0x3B], F2: [0x3C], F3: [0x3D], F4: [0x3E], F5: [0x3F], F6: [0x40], F7: [0x41], F8: [0x42], F9: [0x43], F10: [0x44], NumLock: [0x45], ScrollLock: [0x46],
  Numpad7: [0x47], Numpad8: [0x48], Numpad9: [0x49], NumpadSubtract: [0x4A], Numpad4: [0x4B], Numpad5: [0x4C], Numpad6: [0x4D], NumpadAdd: [0x4E], Numpad1: [0x4F], Numpad2: [0x50], Numpad3: [0x51], Numpad0: [0x52], NumpadDecimal: [0x53],
  IntlBackslash: [0x56], F11: [0x57], F12: [0x58],
  NumpadEnter: [0x1C, 1], ControlRight: [0x1D, 1], NumpadDivide: [0x35, 1], PrintScreen: [0x37, 1], AltRight: [0x38, 1],
  Home: [0x47, 1], ArrowUp: [0x48, 1], PageUp: [0x49, 1], ArrowLeft: [0x4B, 1], ArrowRight: [0x4D, 1], End: [0x4F, 1], ArrowDown: [0x50, 1], PageDown: [0x51, 1], Insert: [0x52, 1], Delete: [0x53, 1],
  MetaLeft: [0x5B, 1], MetaRight: [0x5C, 1], ContextMenu: [0x5D, 1],
};

const int = (v, min, max) => Math.max(min, Math.min(max, Math.round(Number(v) || 0)));

// WINS sor: „WINS sw sh fg inDir|h\tpid\tl\tt\tr\tb\tflags\texe|…”
function parseWins(line) {
  const [head, ...rows] = line.trim().split('|').filter(Boolean);
  const [, sw, sh, fg, inDir] = head.split(' ');
  const list = rows.map((r) => { const f = r.split('\t'); const l = +f[2], t = +f[3], rr = +f[4], b = +f[5]; return { h: f[0], pid: +f[1], l, t, r: rr, b, area: (rr - l) * (b - t), flags: +f[6], exe: f[7] || '', company: f[8] || '' }; });
  return { sw: +sw || 1920, sh: +sh || 1080, fg: String(fg), inDir: +inDir || 0, list };
}

class StreamHost {
  constructor(log = console.log) {
    this.log = log;
    this.win = null;
    this.ready = null;
    this.inputd = null;
    this.vigem = false;
    this.active = null;            // { client, since }
    this.down = { keys: new Set(), buttons: new Set(), pads: new Set() };
    this.waiters = new Map();
    ipcMain.on('stream-host:answer', (_e, id, data) => { const w = this.waiters.get(id); if (w) { this.waiters.delete(id); w(data); } });
    ipcMain.on('stream-host:input', (_e, msg) => this.onInput(msg));
    ipcMain.on('stream-host:state', (_e, st) => this.onState(st));
    ipcMain.on('stream-host:stats', (_e, s) => {
      if (this.active) this.active.stats = s;
      // hibakereséshez: másodpercenkénti napló (userData/stream-stats.log)
      try {
        const f = require('path').join(require('electron').app.getPath('userData'), 'stream-stats.log');
        require('fs').appendFile(f, `${new Date().toISOString()} HOST ${JSON.stringify(s)}
`, () => {});
      } catch { /* napló nélkül is megy */ }
    });
    // kódolt kocka a rögzítő ablakból → UDP
    ipcMain.on('stream-host:frame', (_e, key, ts, data) => { if (this.udp) this.udp.sendFrame(Buffer.from(data), key, ts); });

    // A rögzítő ablak saját munkamenetében az elsődleges kijelzőt + a rendszerhangot adjuk (nincs választó ablak)
    this.ses = session.fromPartition('inarix-stream-host');
    this.ses.setDisplayMediaRequestHandler((_req, cb) => {
      desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
        const primary = screen.getPrimaryDisplay();
        const src = sources.find((s) => String(s.display_id) === String(primary.id)) || sources[0];
        cb({ video: src, audio: 'loopback' });
      }).catch(() => cb({}));
    });
  }

  ensureWindow() {
    if (this.win && !this.win.isDestroyed()) return this.ready;
    this.win = new BrowserWindow({
      show: false, width: 320, height: 200, skipTaskbar: true,
      webPreferences: { partition: 'inarix-stream-host', preload: path.join(__dirname, '..', 'stream', 'host-preload.js'), backgroundThrottling: false, contextIsolation: true },
    });
    this.ready = new Promise((r) => this.win.webContents.once('did-finish-load', r));
    this.win.loadFile(path.join(__dirname, '..', 'stream', 'host.html'));
    this.win.on('closed', () => { this.win = null; });
    return this.ready;
  }

  ensureInput() {
    if (this.inputd) return;
    const script = path.join(__dirname, 'helpers', 'inputd.ps1').replace('app.asar', 'app.asar.unpacked');
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.inputd = p;
    let buf = '';
    p.stdout.on('data', (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (line.startsWith('COMP')) { const w = this.compWait; this.compWait = null; if (w) w(line); continue; }
        if (line.startsWith('WINS ')) { const w = this.winsWait; this.winsWait = null; if (w) w(parseWins(line)); continue; }
        if (line.startsWith('RUMBLE')) {
          const [, i, l, s] = line.split(' ').map(Number);
          if (this.win && !this.win.isDestroyed()) this.win.webContents.send('stream-host:rumble', { i, l, s });
          continue;
        }
        if (line.startsWith('READY')) { this.vigem = /vigem=1/.test(line); this.log(`[stream] bemeneti segéd kész · virtuális kontroller: ${this.vigem ? 'igen' : 'nem (ViGEmBus nincs telepítve)'}`); }
        else if (line) this.log(`[inputd] ${line}`);
      }
    });
    p.stderr.on('data', (d) => this.log('[inputd:err]', d.toString().trim()));
    p.on('exit', () => { if (this.inputd === p) this.inputd = null; });
  }

  // Windows „kommunikációs” elhalkítás: a kliens mikrofonjának lejátszásakor a játék hangját halkítaná (és ezt rögzítenénk).
  // Stream alatt kikapcsoljuk (HKCU, nincs szükség rendszergazdára), utána az eredeti érték visszaáll.
  noDucking(on) {
    const { execFile } = require('child_process');
    const KEY = 'HKCU\\Software\\Microsoft\\Multimedia\\Audio';
    if (on) {
      if (this.duckPrev !== undefined) return;
      execFile('reg', ['query', KEY, '/v', 'UserDuckingPreference'], { windowsHide: true }, (err, out) => {
        const m = !err && /UserDuckingPreference\s+REG_DWORD\s+0x([0-9a-f]+)/i.exec(String(out));
        this.duckPrev = m ? parseInt(m[1], 16) : null;
        execFile('reg', ['add', KEY, '/v', 'UserDuckingPreference', '/t', 'REG_DWORD', '/d', '3', '/f'], { windowsHide: true }, () => {});
      });
    } else if (this.duckPrev !== undefined) {
      const prev = this.duckPrev; this.duckPrev = undefined;
      if (prev === null) execFile('reg', ['delete', KEY, '/v', 'UserDuckingPreference', '/f'], { windowsHide: true }, () => {});
      else execFile('reg', ['add', KEY, '/v', 'UserDuckingPreference', '/t', 'REG_DWORD', '/d', String(prev), '/f'], { windowsHide: true }, () => {});
    }
  }

  send(cmd) { if (this.inputd && this.inputd.stdin.writable) this.inputd.stdin.write(`${cmd}\n`); }

  // ---------- Játék-stream: csak a játék (vagy a launchere) ablaka látszik, a többi fekete ----------
  // 1. az indítás után elsőként megnyíló új ablak (launcher, Steam indítóablak, vagy maga a játék)
  // 2. ha az bezárult: a játék mappájából futó program ablaka (MS Store / Xbox játéknál: teljes képernyő)
  // 3. ha a játék mappájából már semmi sem fut: a stream bezárul. Asztal módban mindig teljes képernyő.
  wins(dir = '') {
    this.ensureInput();
    return new Promise((res) => {
      const t = setTimeout(() => { if (this.winsWait === done) this.winsWait = null; res(null); }, 3000);
      const done = (v) => { clearTimeout(t); res(v); };
      if (this.winsWait) { const prev = this.winsWait; this.winsWait = (v) => { prev(v); done(v); }; } else this.winsWait = done;
      this.send(`WINS ${dir}`);
    });
  }
  // indítás előtt: a már nyitott ablakok (ezek nem „új” ablakok)
  async prepareLaunch(game) {
    const w = await this.wins().catch(() => null);
    this.pending = { game, baseline: new Set(w ? w.list.map((x) => x.h) : []), at: Date.now() };
    this.log(`[stream] játékindítás előkészítve: ${game.name} (${this.pending.baseline.size} meglévő ablak)`);
  }
  // .exe gyártók egy mappában (a játék kiadójának felismeréséhez)
  companies(dir) {
    this.ensureInput();
    return new Promise((res) => {
      const t = setTimeout(() => { this.compWait = null; res([]); }, 6000);
      this.compWait = (line) => { clearTimeout(t); res(line.slice(5).split('|').map((x) => x.trim()).filter(Boolean)); };
      this.send(`COMP ${dir}`);
    });
  }
  startTracker(gameInfo) {
    this.stopTracker(false);
    if (this.win && !this.win.isDestroyed()) this.win.webContents.send('stream-host:mask', { black: true }); // amíg nincs mit mutatni
    const pend = this.pending && this.pending.game && this.pending.game.id === gameInfo.id && Date.now() - this.pending.at < 120000 ? this.pending : null;
    const game = (pend && pend.game) || gameInfo.game;
    if (!game) return;
    const ms = game.store === 'msstore';
    const dir = path.resolve(game.store === 'custom' && game.launch && game.launch.exe ? path.dirname(game.launch.exe) : game.installDir || '').toLowerCase();
    const T = { game, ms, dir, baseline: pend ? pend.baseline : null, seen: false, gone: 0, start: Date.now(), last: null, state: '', pubs: [] };
    this.tracker = T;
    const self = path.dirname(process.execPath).toLowerCase();
    const SYS = /\\(explorer|textinputhost|shellexperiencehost|searchhost|startmenuexperiencehost|lockapp|systemsettings|searchapp|widgets|gamebar|gamebarftserver|xboxgamebarwidgets|code|devenv|chrome|msedge|firefox|discord|spotify|teams|ms-teams|outlook|slack|telegram|whatsapp|obs64|powershell|windowsterminal|conhost|cmd|notepad|taskmgr)\.exe$/i;
    // a játékok indítói (ezek ablakai mindig átmehetnek: bejelentkezés, frissítés, indítási választó)
    const LAUNCHER = /\\(steam|steamwebhelper|epicgameslauncher|eadesktop|eabackgroundservice|origin|ubisoftconnect|upc|uplay|uplaywebcore|battle\.net|agent|launcher|launcherpatcher|rockstarservice|socialclubhelper|playgtav|playrdr2|galaxyclient|gog galaxy|riotclientux|riotclientservices|bethesdanetlauncher|wargaminggamecenter|minecraftlauncher|xboxapp|gamingservices)\.exe$/i;
    const LAUNCHER_DIR = /\\(steam|epic games\\launcher|electronic arts|ea games|origin|ubisoft|battle\.net|rockstar games|gog galaxy|riot games|bethesda\.net launcher)\\/i;
    const GENERIC = /^(microsoft|nvidia|intel|advanced micro devices|amd|google|mozilla|oracle|python|the chromium authors|easy anti-cheat|epic games, inc\.? easy|battleye|realtek|valve)/i;
    const norm = (c) => String(c || '').toLowerCase().replace(/[.,]/g, '').replace(/\b(inc|ltd|llc|gmbh|sa|s a|corporation|corp|co|limited|entertainment|games|studios?|interactive)\b/g, '').replace(/\s+/g, ' ').trim();
    const pubMatch = (c) => { const n = norm(c); return !!n && n.length > 1 && T.pubs.some((p) => n === p || n.includes(p) || p.includes(n)); };
    const ignore = (x) => !x.exe || x.exe.toLowerCase().startsWith(self) || SYS.test(x.exe);
    const inDir = (x) => x.exe && x.exe.toLowerCase().startsWith(`${T.dir}\\`);
    // a kiadó: a játék mappájának .exe gyártói + Steamnél az áruház kiadója / fejlesztője
    if (!ms && T.dir) {
      this.companies(T.dir).then((list) => { for (const c of list) if (!GENERIC.test(c)) T.pubs.push(norm(c)); this.log(`[stream] kiadó (exe): ${list.filter((c) => !GENERIC.test(c)).join(', ') || '–'}`); }).catch(() => {});
    }
    if (game.store === 'steam' && game.storeId) {
      fetch(`https://store.steampowered.com/api/appdetails?appids=${encodeURIComponent(game.storeId)}&filters=basic`).then((r) => r.json()).then((j) => {
        const d = j && j[game.storeId] && j[game.storeId].data;
        for (const c of [...((d && d.publishers) || []), ...((d && d.developers) || [])]) if (c && !GENERIC.test(c)) T.pubs.push(norm(c));
      }).catch(() => {});
    }
    this.log(`[stream] játék stream: ${game.name} · ${ms ? 'MS Store – teljes képernyő' : `mappa: ${T.dir}`}${gameInfo.resume ? ' · folytatás' : ''}`);
    const tick = async () => {
      if (this.tracker !== T) return;
      const w = await this.wins(T.dir).catch(() => null);
      if (this.tracker !== T) return;
      if (w) {
        if (!T.baseline) T.baseline = new Set(w.list.map((x) => x.h)); // nincs előzetes pillanatkép: a mostaniak a régiek
        // kilépés: a játék mappájából már semmi sem fut (miután már futott)
        if (w.inDir !== T.lastIn) { this.log(`[stream] a játék mappájából futó folyamatok: ${w.inDir}`); T.lastIn = w.inDir; }
        if (w.inDir > 0) { T.seen = true; T.gone = 0; } else if (T.seen) T.gone++;
        if (T.seen && T.gone >= 3) { this.endGame('A játék bezárult'); return; }
        // átengedhető ablakok: a játék mappájából, a kiadótól, ismert indítóból, vagy az indítás óta nyílt
        const allowed = w.list.filter((x) => !ignore(x) && (inDir(x) || pubMatch(x.company) || LAUNCHER.test(x.exe) || LAUNCHER_DIR.test(x.exe) || !T.baseline.has(x.h)));
        let target = allowed.find((x) => x.h === w.fg) // ami előtérben van
          || allowed.filter(inDir).sort((a, b) => b.area - a.area)[0] // a játék ablaka
          || (T.last && allowed.find((x) => x.h === T.last)) // ami eddig látszott
          || allowed.find((x) => !T.baseline.has(x.h)) // a legfelső új ablak
          || null;
        let state = target ? (inDir(target) ? 'game' : 'launcher') : 'wait';
        // ha valami más (pl. egy korábban nyitott Discord) van előtérben, a látható ablakot előre hozzuk
        if (target && w.fg !== target.h && !allowed.some((x) => x.h === w.fg) && Date.now() - (T.fgAt || 0) > 1500) {
          T.fgAt = Date.now();
          this.send(`FG ${target.h}`);
        }
        if (target && target.h !== T.last) { T.last = target.h; this.log(`[stream] látható ablak: ${path.basename(target.exe)}${target.company ? ` (${target.company})` : ''}`); }
        let mask;
        if (T.ms || (!target && Date.now() - T.start > 180000)) { mask = null; if (!target) state = 'full'; }
        else if (!target) mask = { black: true };
        else {
          // a kiválasztott ablak + ugyanannak a programnak a többi (felugró) ablaka
          const grp = allowed.filter((x) => x.pid === target.pid);
          const x = Math.max(0, Math.min(...grp.map((g) => g.l))), y = Math.max(0, Math.min(...grp.map((g) => g.t)));
          const r = Math.min(w.sw, Math.max(...grp.map((g) => g.r))), b = Math.min(w.sh, Math.max(...grp.map((g) => g.b)));
          mask = (r - x) * (b - y) >= w.sw * w.sh * 0.97 ? null : { x: x / w.sw, y: y / w.sh, w: Math.max(0, r - x) / w.sw, h: Math.max(0, b - y) / w.sh };
        }
        // az egér a látható ablakon belül marad (a Windows feloldja ablakváltáskor, ezért minden körben újra beállítjuk)
        if (target && mask) {
          const grp = allowed.filter((x) => x.pid === target.pid);
          const l = Math.max(0, Math.min(...grp.map((g) => g.l))), t = Math.max(0, Math.min(...grp.map((g) => g.t)));
          const r = Math.min(w.sw, Math.max(...grp.map((g) => g.r))), b = Math.min(w.sh, Math.max(...grp.map((g) => g.b)));
          this.send(`CLIP ${l} ${t} ${r} ${b}`); T.clipped = true;
        } else if (T.clipped) { this.send('CLIP'); T.clipped = false; }
        const key = JSON.stringify(mask);
        if (key !== T.maskKey) { T.maskKey = key; if (this.win && !this.win.isDestroyed()) this.win.webContents.send('stream-host:mask', mask); }
        if (state !== T.state) { T.state = state; if (this.win && !this.win.isDestroyed()) this.win.webContents.send('stream-host:gstate', { phase: state, name: game.name }); }
      }
      T.timer = setTimeout(tick, 600);
    };
    tick();
  }
  stopTracker(clear = true) {
    if (this.tracker) { clearTimeout(this.tracker.timer); if (this.tracker.clipped) this.send('CLIP'); this.tracker = null; }
    if (clear && this.win && !this.win.isDestroyed()) this.win.webContents.send('stream-host:mask', null);
  }
  endGame(reason) {
    this.log(`[stream] ${reason} – a stream bezárul`);
    if (this.win && !this.win.isDestroyed()) this.win.webContents.send('stream-host:gstate', { phase: 'ended', reason });
    this.stopTracker();
    setTimeout(() => this.stop(reason), 1500);
  }

  // Kliens ajánlat (SDP) → válasz. opts: { sdp, width, height, fps, bitrate (kbps) }
  async offer(opts, client = '?') {
    if (!opts || typeof opts.sdp !== 'string' || !opts.sdp.startsWith('v=')) throw new Error('Érvénytelen ajánlat');
    // A videó UDP-n megy (protokoll 2); a régebbi kliens az adatcsatornán várná → nem lenne kép, csak bemenet
    this.log(`[stream] ajánlat: ${client} · kliens build: ${opts.clientBuild || 'régi (nem küld buildet)'} · protokoll: ${opts.proto || 1}`);
    if (!opts.proto || opts.proto < 2) throw new Error('A laptopon régebbi InariX fut, ami nem támogatja az új (UDP) videót – frissítsd a laptopot (Frissites.cmd), utána lesz kép.');
    this.releaseAll();
    await this.ensureWindow();
    this.ensureInput();
    this.boostPriority();
    await this.startUdp(opts.udpPort);
    const id = crypto.randomUUID();
    const params = { id, game: !!(opts.game && opts.game.id), sdp: opts.sdp, width: int(opts.width, 640, 3840) || 1920, height: int(opts.height, 360, 2160) || 1080, fps: int(opts.fps, 24, 144) || 60, bitrate: int(opts.bitrate, 2000, 150000) || 20000,
      codecs: Array.isArray(opts.codecs) ? opts.codecs.filter((c) => ['av1', 'hevc', 'h264'].includes(c)) : ['h264'], prefer: ['av1', 'hevc', 'h264'].includes(opts.prefer) ? opts.prefer : 'auto' };
    const answer = await new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.waiters.delete(id); reject(new Error('A host nem válaszolt időben')); }, 20000);
      this.waiters.set(id, (d) => { clearTimeout(t); resolve(d); });
      this.win.webContents.send('stream-host:offer', params);
    });
    if (answer.error) throw new Error(answer.error);
    this.active = { client, since: Date.now(), stats: null };
    this.noDucking(true);
    // játék stream: ablakkövetés (asztal módban nincs – ott mindig teljes képernyő)
    if (opts.game && opts.game.id && this.resolveGame) {
      this.resolveGame(String(opts.game.id)).then((g) => { if (this.active) this.startTracker({ id: String(opts.game.id), game: g, resume: !!opts.game.resume }); }).catch(() => {});
    } else this.stopTracker(!(opts.game && opts.game.id));
    this.log(`[stream] kapcsolat: ${client} · ${params.width}x${params.height}@${params.fps} · ${params.bitrate} kbps · UDP ${this.udp.port}`);
    const udpRef = this.udp;
    setTimeout(() => {
      if (this.udp === udpRef && !udpRef.peer) this.log(`[udp] FIGYELEM: a kliens (${client}) 6 mp alatt sem jelentkezett az UDP ${udpRef.port} porton – nem lesz kép. Tűzfal blokkolja, vagy a kliens nem éri el ezt a gépet.`);
    }, 6000);
    return { sdp: answer.sdp, vigem: this.vigem, udp: this.udp.credentials() };
  }

  // Teljes GPU terhelésnél (pl. játék fix 60 fps-sel) a Windows a képernyőrögzítést hátrasorolja → pár fps a kliensen.
  // A rögzítő ablak, a GPU és a fő folyamat magas CPU és GPU ütemezési prioritást kap (rendszergazdaként valós idejűt).
  boostPriority() {
    try {
      const { app } = require('electron');
      const os = require('os');
      const pids = new Set([process.pid]);
      if (this.win && !this.win.isDestroyed()) pids.add(this.win.webContents.getOSProcessId());
      for (const m of app.getAppMetrics()) if (m.type === 'GPU') pids.add(m.pid);
      for (const pid of pids) {
        try { os.setPriority(pid, os.constants.priority.PRIORITY_HIGH); } catch { /* nincs jog */ }
        this.send(`GP ${pid} 5`);
      }
    } catch (e) { this.log(`[stream] prioritás emelés: ${e.message}`); }
  }

  // UDP videó küldő (munkamenetenként új titokkal)
  async startUdp(port) {
    this.stopUdp();
    const { UdpVideoSender, DEFAULT_PORT } = require('../core/udp-video');
    const s = new UdpVideoSender({ port: port || DEFAULT_PORT, log: this.log });
    await s.start();
    s.onKeyRequest = () => { if (this.win && !this.win.isDestroyed()) this.win.webContents.send('stream-host:keyreq'); };
    s.onStats = (st) => { this.netStats = st; this.adaptFec(st); };
    this.udp = s;
    // hálózati állapot a szabályozónak (küldési sor + kliens visszajelzés)
    this.netTimer = setInterval(() => {
      if (!this.udp || !this.win || this.win.isDestroyed()) return;
      this.win.webContents.send('stream-host:net', { queue: this.udp.queueBytes, client: this.netStats || null, resent: this.udp.stats.resent, fecGroup: this.udp.group });
      this.netStats = null;
    }, 250);
  }

  // Alkalmazkodó FEC: veszteségnél vagy nagy késésnél (ahol az újrakérés nem ér vissza időben) sűrűbb paritás
  adaptFec(st) {
    if (!this.udp || !st || !(st.pkts > 40)) return;
    const loss = ((st.nacks || 0) + (st.fec || 0) + (st.lost || 0) * 4) / st.pkts;
    const rtt = st.rtt || 0;
    let want = 8;
    if (loss > 0.06 || st.lost > 1) want = 3;
    else if (loss > 0.02 || rtt > 40) want = 4;
    else if (loss > 0.005 || rtt > 15) want = 6;
    const cur = this.udp.group;
    // lefelé (több védelem) azonnal, felfelé lassan (csak ha 5 mp-ig nyugodt)
    if (want < cur) { this.udp.setGroup(want); this.fecCalm = Date.now(); }
    else if (want > cur && Date.now() - (this.fecCalm || 0) > 5000) { this.udp.setGroup(Math.min(want, cur + 2)); this.fecCalm = Date.now(); }
    if (want < cur || this.udp.group !== this.lastGroupLogged) { this.lastGroupLogged = this.udp.group; }
  }

  stopUdp() {
    clearInterval(this.netTimer); this.netTimer = null;
    if (this.udp) { this.udp.close(); this.udp = null; }
  }

  stop(reason = 'leállítva') {
    this.noDucking(false);
    this.stopTracker();
    if (this.win && !this.win.isDestroyed()) this.win.webContents.send('stream-host:stop');
    this.stopUdp();
    this.releaseAll();
    if (this.active) this.log(`[stream] vége: ${reason}`);
    this.active = null;
  }

  onState(st) {
    if (st === 'failed' || st === 'closed') this.stop(`kapcsolat ${st}`);
  }

  // Beragadt gombok elkerülése: minden lenyomott billentyű/gomb felengedése, kontrollerek leválasztása
  releaseAll() {
    for (const code of this.down.keys) { const k = KEYMAP[code]; if (k) this.send(`K ${k[0]} ${k[1] ? 1 : 0} 0`); }
    for (const b of this.down.buttons) this.send(`MB ${b} 0`);
    for (const i of this.down.pads) this.send(`PX ${i}`);
    this.down.keys.clear(); this.down.buttons.clear(); this.down.pads.clear();
  }

  onInput(raw) {
    let m;
    try { m = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return; }
    if (!m || !this.active) return;
    switch (m.t) {
      case 'ma': this.send(`MA ${int(m.x * 65535, 0, 65535)} ${int(m.y * 65535, 0, 65535)}`); break;
      case 'mr': this.send(`MR ${int(m.dx, -5000, 5000)} ${int(m.dy, -5000, 5000)}`); break;
      case 'mb': {
        const b = int(m.b, 0, 4);
        if (m.d) this.down.buttons.add(b); else this.down.buttons.delete(b);
        this.send(`MB ${b} ${m.d ? 1 : 0}`);
        break;
      }
      case 'mw': this.send(`MW ${int(m.dy, -12000, 12000)} ${int(m.dx, -12000, 12000)}`); break;
      case 'k': {
        const k = KEYMAP[m.c];
        if (!k) return;
        if (m.d) this.down.keys.add(m.c); else this.down.keys.delete(m.c);
        this.send(`K ${k[0]} ${k[1] ? 1 : 0} ${m.d ? 1 : 0}`);
        break;
      }
      case 'p': {
        const i = int(m.i, 0, 3);
        this.down.pads.add(i);
        this.send(`P ${i} ${int(m.b, 0, 65535)} ${int(m.lt, 0, 255)} ${int(m.rt, 0, 255)} ${int(m.lx, -32768, 32767)} ${int(m.ly, -32768, 32767)} ${int(m.rx, -32768, 32767)} ${int(m.ry, -32768, 32767)}`);
        break;
      }
      case 'text': { // képernyő-billentyűzetről gépelt szöveg (kontrolleres egér módban)
        const txt = String(m.s || '').slice(0, 500);
        for (let i = 0; i < txt.length; i++) {
          const c = txt.charCodeAt(i);
          if (c === 10 || c === 13) { this.send('K 28 0 1'); this.send('K 28 0 0'); } else this.send(`U ${c}`);
        }
        break;
      }
      case 'px': { const i = int(m.i, 0, 3); this.down.pads.delete(i); this.send(`PX ${i}`); break; }
      case 'reset': this.releaseAll(); break;
      default: break;
    }
  }

  status() {
    return { available: true, vigem: this.vigem, active: !!this.active, client: this.active ? this.active.client : null, since: this.active ? this.active.since : 0, stats: this.active ? this.active.stats : null };
  }

  dispose() {
    this.stop('kilépés');
    if (this.inputd) { this.send('EXIT'); const p = this.inputd; setTimeout(() => { try { p.kill(); } catch {} }, 500); }
    if (this.win && !this.win.isDestroyed()) this.win.destroy();
  }
}

module.exports = { StreamHost, KEYMAP };
