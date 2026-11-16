'use strict';
/* global gamo, Nav, RTC, toast */
// Beépített stream – KLIENS (laptop).
// Videó: adatcsatorna (kódolt H.264 kockák) → WebCodecs VideoDecoder (hardveres) → vászon (azonnali kirajzolás)
// Hang: WebRTC Opus sáv · Bemenet: billentyűzet, egér, kontroller → adatcsatornák
// Kilépés: Select+Start+LB+RB (nyomva tartva) vagy Ctrl+Alt+Shift+Q
// Egér rögzítése (játékokhoz, relatív mód): Ctrl+Alt+Shift+M · Statisztika: Ctrl+Alt+Shift+S
const StreamClient = (() => {
  let pc = null, fast = null, rel = null, vch = null, ui = null, hostId = null, onEnd = null;
  let decoder = null, ctx = null, canvas = null, vconf = null, needKey = true;
  let padTimer = null, statsTimer = null, hintTimer = null, discTimer = null, comboSince = 0, menuSince = 0, fbTimer = null, barTimer = null;
  let menuOpen = false, rate = { fps: 60, kbps: 0 }, lastArrival = 0, late = 0, waitRelease = false, game = null;
  // Egér mód: a kontroller a gép egerét/billentyűzetét vezérli (asztal streamnél alapból bekapcsolva)
  let mouseMode = false, mousePicked = false, runTimer = null, micTrack = null; const mm = { held: {}, fx: 0, fy: 0, fw: 0, last: 0, typing: false };
  const pads = new Map();
  const listeners = [];
  const frames = new Map(); // frameId → { total, got, buf, key, ts }
  const st = { bytes: 0, decoded: 0, dropped: 0, decodeMs: 0, t: performance.now(), firstFrame: false };
  const XB = { A: 0x1000, B: 0x2000, X: 0x4000, Y: 0x8000, LB: 0x0100, RB: 0x0200, BACK: 0x0020, START: 0x0010, LS: 0x0040, RS: 0x0080, UP: 0x0001, DOWN: 0x0002, LEFT: 0x0004, RIGHT: 0x0008, GUIDE: 0x0400 };
  const MAP = [XB.A, XB.B, XB.X, XB.Y, XB.LB, XB.RB, 0, 0, XB.BACK, XB.START, XB.LS, XB.RS, XB.UP, XB.DOWN, XB.LEFT, XB.RIGHT, XB.GUIDE];

  const sendFast = (m) => { if (fast && fast.readyState === 'open') fast.send(JSON.stringify(m)); };
  const sendRel = (m) => { if (rel && rel.readyState === 'open') rel.send(JSON.stringify(m)); };
  const on = (el, ev, fn, opt) => { el.addEventListener(ev, fn, opt); listeners.push([el, ev, fn, opt]); };
  const requestKey = () => { needKey = true; sendRel({ t: 'kf' }); gamo.streamKeyReq().catch(() => {}); };
  let net = null; // UDP statisztika a main-től

  function buildUi() {
    ui = document.createElement('div');
    ui.id = 'stream';
    ui.innerHTML = `
      <canvas id="stream-canvas" width="1920" height="1080"></canvas>
      <audio id="stream-audio" autoplay></audio>
      <div id="stream-wait"><div class="spinner"></div><div class="sw-text">Csatlakozás…</div></div>
      <div id="stream-hint">Menü / vissza a InariXbe: <b>Select + Start</b> (1 mp) · egérrel a <b>képernyő tetején</b> · <b>Ctrl+Alt+Shift+Q</b></div>
      <div id="stream-bar"><button data-a="menu">☰ Menü</button><button data-a="exit">⏏ Vissza a InariXbe</button></div>
      <div id="stream-stats" class="hidden"></div>`;
    document.body.appendChild(ui);
    canvas = ui.querySelector('#stream-canvas');
    ctx = canvas.getContext('2d', { alpha: false, desynchronized: true }); // alacsony késleltetésű vászon
    hintTimer = setTimeout(() => ui && ui.querySelector('#stream-hint').classList.add('fade'), 6000);
  }

  // ---- Videó dekódolás ----
  function setupDecoder(conf) {
    vconf = conf;
    if (decoder && decoder.state !== 'closed') { try { decoder.close(); } catch { /* zárva */ } }
    decoder = new VideoDecoder({
      output: (frame) => {
        if (canvas.width !== frame.displayWidth || canvas.height !== frame.displayHeight) { canvas.width = frame.displayWidth; canvas.height = frame.displayHeight; }
        ctx.drawImage(frame, 0, 0);
        frame.close();
        st.decoded++;
        if (!st.firstFrame) { st.firstFrame = true; const w = ui && ui.querySelector('#stream-wait'); if (w) w.classList.add('hidden'); }
      },
      error: () => { requestKey(); setTimeout(() => vconf && setupDecoder(vconf), 0); },
    });
    decoder.configure({ codec: conf.codec, hardwareAcceleration: 'prefer-hardware', optimizeForLatency: true });
    requestKey();
  }

  // Teljes, sorrendben érkező kocka a main UDP fogadójától (FEC/NACK már lefutott)
  function onFrame(f) {
    const now = performance.now();
    // Érkezési egyenletesség: a vártnál jóval később érkező kocka = hálózati akadás (visszajelzés a hostnak)
    if (lastArrival && now - lastArrival > Math.max(50, (1000 / rate.fps) * 2.2)) late++;
    lastArrival = now;
    st.bytes += f.data.byteLength;
    if (!decoder || decoder.state !== 'configured') return;
    if (needKey && !f.key) { st.dropped++; return; }
    // Csak súlyos lemaradásnál ugrunk (a hardveres dekóder normál esetben bőven tartja a tempót)
    if (decoder.decodeQueueSize > 10 && !f.key) { st.dropped++; requestKey(); return; }
    needKey = false;
    decoder.decode(new EncodedVideoChunk({ type: f.key ? 'key' : 'delta', timestamp: f.ts, data: f.data }));
  }
  gamo.on('stream:frame', (f) => { if (pc && decoder) onFrame(f); });
  gamo.on('stream:net', (n) => { net = n; });

  // Vászon tartalom téglalapja (object-fit: contain miatt fekete sávok lehetnek)
  function contentRect() {
    const r = canvas.getBoundingClientRect();
    const scale = Math.min(r.width / canvas.width, r.height / canvas.height);
    const w = canvas.width * scale, h = canvas.height * scale;
    return { x: r.left + (r.width - w) / 2, y: r.top + (r.height - h) / 2, w, h };
  }

  // ---- Stream menü (vissza a InariXbe) ----
  async function openMenu() {
    if (menuOpen || !ui) return;
    menuOpen = true;
    sendRel({ t: 'reset' });
    if (document.pointerLockElement) document.exitPointerLock();
    document.body.classList.add('stream-menu');
    Nav.suspend(false);
    const statsEl = ui.querySelector('#stream-stats');
    const v = await modal({
      title: 'Stream',
      body: rate.kbps ? `Most: ${rate.fps} fps · ${(rate.kbps / 1000).toFixed(1)} Mbps (automatikus, min. 30 fps)` : '',
      items: [
        { label: '▶  Folytatás', value: null, kind: 'primary' },
        { label: mouseMode ? '🎮  Kontroller mód (a játék kapja a kontrollert)' : '🖱  Egér mód (kontrollerrel egér és billentyűzet)', value: 'mouse' },
        { label: '⏏  Vissza a InariXbe (a játék fut tovább a gépen)', value: 'exit' },
        ...(game ? [{ label: `⏹  Kilépés a játékból (${game.name})`, value: 'quit', kind: 'danger' }] : []),
        { label: statsEl && statsEl.classList.contains('hidden') ? '📊  Statisztika mutatása' : '📊  Statisztika elrejtése', value: 'stats' },
        { label: '🖱  Egér rögzítése (játékokhoz)', value: 'lock' },
      ],
    });
    document.body.classList.remove('stream-menu');
    menuOpen = false;
    waitRelease = true; // a menüt bezáró gombnyomás ne jusson el a játékba
    if (!ui) return;
    Nav.suspend(true);
    if (v === 'exit') stop('kilépés');
    else if (v === 'quit' && game) {
      const g = game;
      Nav.suspend(false); document.body.classList.add('stream-menu'); menuOpen = true;
      const ok = await confirmBox('Kilépés a játékból', `Bezárod a(z) ${g.name} játékot a gépen? A nem mentett játékállás elveszhet.`, 'Kilépés a játékból');
      document.body.classList.remove('stream-menu'); menuOpen = false; waitRelease = true;
      if (!ok) { Nav.suspend(true); return; }
      await stop('kilépés a játékból');
      const e = S.lib.games.find((x) => x.key === g.key) || { key: g.key, name: g.name, running: [{ hostId: g.hostId, hostName: '' }] };
      quitGameFlow(e, g.hostId, { confirm: false });
    }
    else if (v === 'mouse') { mousePicked = true; setMouseMode(!mouseMode); }
    else if (v === 'stats' && statsEl) statsEl.classList.toggle('hidden');
    else if (v === 'lock' && canvas) canvas.requestPointerLock();
  }

  function setMouseMode(on) {
    mouseMode = !!on;
    // a virtuális kontroller állapotát nullázzuk, hogy ne maradjon lenyomva semmi
    for (const i of pads.keys()) sendRel({ t: 'px', i });
    pads.clear(); mm.held = {};
    toast(mouseMode ? 'Egér mód: bal kar = egér · Ⓐ bal / Ⓑ jobb klikk · jobb kar = görgetés · Ⓧ = gépelés · Select+Start = menü' : 'Kontroller mód: a játék kapja a kontrollert', 'ok', 5000);
  }

  // Egér mód: egy kontroller állapotából egér/billentyű események
  const MM_KEYS = { 3: 'Enter', 4: 'Escape', 5: 'MetaLeft', 6: 'Backspace', 12: 'ArrowUp', 13: 'ArrowDown', 14: 'ArrowLeft', 15: 'ArrowRight' };
  function mouseFromPad(p, now) {
    const dt = Math.min(0.05, mm.last ? (now - mm.last) / 1000 : 0.004);
    mm.last = now;
    const curve = (v, dz) => { const a = Math.abs(v); if (a < dz) return 0; const n = (a - dz) / (1 - dz); return Math.sign(v) * n * n; };
    // bal kar: egér (gyorsuló görbe), jobb kar: görgetés
    const sp = 1700 * dt;
    mm.fx += curve(p.axes[0] || 0, 0.14) * sp; mm.fy += curve(p.axes[1] || 0, 0.14) * sp;
    const dx = Math.trunc(mm.fx), dy = Math.trunc(mm.fy);
    if (dx || dy) { mm.fx -= dx; mm.fy -= dy; sendFast({ t: 'mr', dx, dy }); }
    mm.fw += -curve(p.axes[3] || 0, 0.2) * 2400 * dt;
    const w = Math.trunc(mm.fw / 30) * 30;
    if (w) { mm.fw -= w; sendRel({ t: 'mw', dy: w, dx: 0 }); }
    // gombok élre
    const edge = (k, fn) => { const pr = !!(p.buttons[k] && p.buttons[k].pressed); if (pr !== !!mm.held[k]) { mm.held[k] = pr; fn(pr); } };
    edge(0, (d) => sendRel({ t: 'mb', b: 0, d: d ? 1 : 0 }));
    edge(1, (d) => sendRel({ t: 'mb', b: 2, d: d ? 1 : 0 }));
    edge(10, (d) => sendRel({ t: 'mb', b: 1, d: d ? 1 : 0 }));
    for (const [k, code] of Object.entries(MM_KEYS)) edge(Number(k), (d) => sendRel({ t: 'k', c: code, d: d ? 1 : 0 }));
    edge(2, (d) => { if (d) typeText(); });
  }
  async function typeText() {
    if (mm.typing) return;
    mm.typing = true; menuOpen = true;
    Nav.suspend(false); document.body.classList.add('stream-menu');
    const t = await OSK.prompt({ title: 'Gépelés a gépre (≡ = küldés)' });
    document.body.classList.remove('stream-menu');
    Nav.suspend(true); menuOpen = false; waitRelease = true; mm.held = {}; mm.typing = false;
    if (t) sendRel({ t: 'text', s: t });
  }

  function showBar() {
    const bar = ui && ui.querySelector('#stream-bar');
    if (!bar) return;
    bar.classList.add('show');
    clearTimeout(barTimer);
    barTimer = setTimeout(() => bar.classList.remove('show'), 2500);
  }

  function bindInput() {
    const bar = ui.querySelector('#stream-bar');
    bar.addEventListener('click', (e) => {
      const a = e.target.closest('button') && e.target.closest('button').dataset.a;
      if (a === 'menu') openMenu();
      if (a === 'exit') stop('kilépés');
    });
    on(window, 'mousemove', (e) => { if (!document.pointerLockElement && e.clientY < 14) showBar(); });
    on(window, 'keydown', (e) => {
      if (menuOpen) return; // a menüt a konzol navigáció kezeli
      if (e.ctrlKey && e.altKey && e.shiftKey) {
        const ch = KbLayout.letter(e);
        if (ch === 'q') { e.preventDefault(); stop('kilépés'); return; }
        if (ch === 'm') { e.preventDefault(); if (document.pointerLockElement) document.exitPointerLock(); else canvas.requestPointerLock(); return; }
        if (ch === 's') { e.preventDefault(); ui.querySelector('#stream-stats').classList.toggle('hidden'); return; }
      }
      e.preventDefault(); e.stopPropagation();
      sendRel({ t: 'k', c: e.code, d: 1 });
    }, true);
    on(window, 'keyup', (e) => { if (menuOpen) return; e.preventDefault(); e.stopPropagation(); sendRel({ t: 'k', c: e.code, d: 0 }); }, true);
    on(canvas, 'mousemove', (e) => {
      if (document.pointerLockElement === canvas) { if (e.movementX || e.movementY) sendFast({ t: 'mr', dx: e.movementX, dy: e.movementY }); return; }
      const r = contentRect();
      sendFast({ t: 'ma', x: Math.min(1, Math.max(0, (e.clientX - r.x) / r.w)), y: Math.min(1, Math.max(0, (e.clientY - r.y) / r.h)) });
    });
    on(canvas, 'mousedown', (e) => { e.preventDefault(); sendRel({ t: 'mb', b: e.button, d: 1 }); });
    on(window, 'mouseup', (e) => { sendRel({ t: 'mb', b: e.button, d: 0 }); });
    on(canvas, 'wheel', (e) => { e.preventDefault(); const k = e.deltaMode === 1 ? 40 : 1.2; sendRel({ t: 'mw', dy: -Math.round(e.deltaY * k), dx: Math.round(e.deltaX * k) }); }, { passive: false });
    on(canvas, 'contextmenu', (e) => e.preventDefault());
    on(window, 'blur', () => sendRel({ t: 'reset' }));

    // Kontrollerek: ~250 Hz lekérdezés, változáskor + 100 ms-onként küldés
    padTimer = setInterval(() => {
      if (menuOpen) return; // a menü alatt a kontroller a InariXet vezérli, nem a gépet
      const list = navigator.getGamepads ? navigator.getGamepads() : [];
      const seen = new Set();
      if (waitRelease && ![...list].some((p) => p && p.connected && p.buttons.some((x) => x.pressed))) waitRelease = false;
      for (const p of list) {
        if (!p || !p.connected) continue;
        const i = p.index; seen.add(i);
        let b = 0;
        if (!waitRelease) p.buttons.forEach((btn, k) => { if (btn.pressed && MAP[k]) b |= MAP[k]; });
        if (mouseMode && !waitRelease) {
          mouseFromPad(p, performance.now());
          const nowM = performance.now(), menuCombo = XB.BACK | XB.START;
          if ((b & menuCombo) === menuCombo) { if (!menuSince) menuSince = nowM; else if (nowM - menuSince > 1000) { menuSince = 0; openMenu(); return; } } else menuSince = 0;
          continue;
        }
        const ax = (n) => Math.round(Math.max(-1, Math.min(1, p.axes[n] || 0)) * 32767);
        const s = { t: 'p', i, b, lt: Math.round(((p.buttons[6] && p.buttons[6].value) || 0) * 255), rt: Math.round(((p.buttons[7] && p.buttons[7].value) || 0) * 255), lx: ax(0), ly: -ax(1), rx: ax(2), ry: -ax(3) };
        const key = JSON.stringify(s);
        const prev = pads.get(i);
        const now = performance.now();
        if (!prev || prev.key !== key || now - prev.at > 100) { sendFast(s); pads.set(i, { key, at: now }); }
        // Select+Start+LB+RB (0,6 mp): azonnali kilépés · Select+Start (1 mp): stream menü
        const combo = XB.BACK | XB.START | XB.LB | XB.RB;
        const menuCombo = XB.BACK | XB.START;
        if ((b & combo) === combo) { if (!comboSince) comboSince = now; else if (now - comboSince > 600) { comboSince = 0; stop('kilépés'); return; } } else comboSince = 0;
        if ((b & menuCombo) === menuCombo && (b & (XB.LB | XB.RB)) === 0) { if (!menuSince) menuSince = now; else if (now - menuSince > 1000) { menuSince = 0; openMenu(); return; } } else menuSince = 0;
      }
      for (const i of [...pads.keys()]) if (!seen.has(i)) { pads.delete(i); sendRel({ t: 'px', i }); }
    }, 4);
  }

  // Figyelmeztető jelzés a stream sarkában (gyenge hálózat / alacsony fps / képkocka vesztés)
  function updateWarn(fps) {
    if (!ui) return;
    let w = ui.querySelector('#stream-warn');
    if (!w) { w = document.createElement('div'); w.id = 'stream-warn'; ui.append(w); }
    const msgs = [];
    if (net && net.rtt > 60) msgs.push(`gyenge hálózat · késés ${net.rtt} ms`);
    if (st.firstFrame && fps > 0 && fps < 30) msgs.push(`alacsony képfrissítés · ${fps} fps`);
    if (net && net.lost > 0) msgs.push('képkocka vesztés');
    w.textContent = msgs.length ? `⚠ ${msgs.join(' · ')}` : '';
    w.classList.toggle('show', msgs.length > 0);
  }

  function startStats() {
    statsTimer = setInterval(async () => {
      if (!pc) return;
      const now = performance.now(), dt = (now - st.t) / 1000;
      st.t = now;
      let rtt = null;
      (await pc.getStats()).forEach((s) => { if (s.type === 'candidate-pair' && s.state === 'succeeded' && s.nominated && s.currentRoundTripTime !== undefined) rtt = s.currentRoundTripTime; });
      const txt = [
        `${canvas.width}×${canvas.height} · ${Math.round(st.decoded / dt)} fps`,
        `${((st.bytes * 8) / dt / 1e6).toFixed(1)} Mbps`,
        `RTT ${rtt !== null ? Math.round(rtt * 1000) : '?'} ms`,
        `cél ${rate.fps} fps / ${(rate.kbps / 1000).toFixed(1)} Mbps`,
        `kodek ${vconf ? vconf.codec : '?'} (${vconf ? vconf.hw : '?'})`,
        `dekóder sor ${decoder ? decoder.decodeQueueSize : 0}`,
        net ? `UDP: FEC javítás ${net.fec} · újrakérés ${net.nacks} · elveszett kocka ${net.lost}` : 'UDP: –',
        `eldobott ${st.dropped}`,
      ].join(' · ');
      st.last = { net, fps: Math.round(st.decoded / dt), mbps: +((st.bytes * 8) / dt / 1e6).toFixed(2), rtt: rtt !== null ? Math.round(rtt * 1000) : null, codec: vconf && vconf.codec, hw: vconf && vconf.hw, dropped: st.dropped, w: canvas.width, h: canvas.height };
      updateWarn(Math.round(st.decoded / dt));
      st.bytes = 0; st.decoded = 0;
      const el = ui && ui.querySelector('#stream-stats');
      if (el) el.textContent = txt;
    }, 1000);
  }

  // Hardveresen dekódolható kodekek (a host ezek közül a leghatékonyabbat választja: AV1 > HEVC > H.264)
  const DEC_CANDS = [['av1', 'av01.0.08M.08'], ['hevc', 'hvc1.1.6.L120.90'], ['h264', 'avc1.640033']];
  async function decodableCodecs() {
    const out = [];
    for (const [k, codec] of DEC_CANDS) {
      try { if ((await VideoDecoder.isConfigSupported({ codec, hardwareAcceleration: 'prefer-hardware' })).supported) out.push(k); } catch { /* nem támogatott */ }
    }
    if (!out.includes('h264')) out.push('h264');
    return out;
  }

  async function start(id, opts, endCb) {
    if (pc) await stop('új stream');
    hostId = id; onEnd = endCb || null; game = opts.game || null;
    mouseMode = !!opts.desktop; mousePicked = false; mm.held = {}; mm.last = 0;
    // asztal streamben ha a gépen játék indul, a kontroller automatikusan a játéké lesz (nem egér)
    clearInterval(runTimer);
    if (opts.desktop && id !== 'local') runTimer = setInterval(async () => {
      if (!mouseMode || mousePicked) return;
      try { const r = await gamo.hostRunning(id); if (r.length && mouseMode && !mousePicked) setMouseMode(false); } catch { /* a gép nem válaszol */ }
    }, 3000);
    Object.assign(st, { bytes: 0, decoded: 0, dropped: 0, firstFrame: false, t: performance.now(), last: null });
    rate = { fps: opts.fps || 60, kbps: opts.bitrate || 0 }; lastArrival = 0; late = 0; menuOpen = false; waitRelease = false;
    needKey = true; vconf = null; frames.clear();
    if (!opts.preview) Nav.suspend(true);
    buildUi();
    // Helyi teszt: kis előnézet a sarokban (különben a saját képernyő önmagát rögzítené → fekete "tükörfolyosó")
    if (opts.preview) ui.classList.add('preview');
    const audioEl = ui.querySelector('#stream-audio');
    try {
      pc = new RTCPeerConnection({ iceServers: [] });
      // mikrofon (opcionális): a gaming PC-n virtuális hangkábelre (VB-CABLE) kerül, így a játék / Discord hallja
      let mic = null;
      if (opts.mic) {
        try { mic = (await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })).getAudioTracks()[0]; }
        catch (e) { toast(`Mikrofon nem érhető el: ${e.message}`, 'err'); }
      }
      if (mic) { const tr = pc.addTransceiver('audio', { direction: 'sendrecv' }); await tr.sender.replaceTrack(mic); micTrack = mic; }
      else pc.addTransceiver('audio', { direction: 'recvonly' });
      fast = pc.createDataChannel('fast', { ordered: false, maxRetransmits: 0 });
      rel = pc.createDataChannel('rel', { ordered: true });
      rel.onmessage = (m) => {
        let msg; try { msg = JSON.parse(m.data); } catch { return; }
        if (msg.t === 'vconf') setupDecoder(msg);
        if (msg.t === 'rate') rate = { fps: msg.fps, kbps: msg.kbps };
      };
      // Visszajelzés a host szabályozójának (fél másodpercenként)
      fbTimer = setInterval(() => {
        sendRel({ t: 'fb', late, q: decoder ? decoder.decodeQueueSize : 0 });
        late = 0;
      }, 500);
      pc.ontrack = (e) => {
        if ('jitterBufferTarget' in e.receiver) e.receiver.jitterBufferTarget = 0;
        audioEl.srcObject = new MediaStream([e.track]);
      };
      pc.onconnectionstatechange = () => {
        if (!pc) return;
        clearTimeout(discTimer);
        if (pc.connectionState === 'failed') stop('a kapcsolat megszakadt', true);
        if (pc.connectionState === 'disconnected') discTimer = setTimeout(() => pc && pc.connectionState !== 'connected' && stop('a kapcsolat megszakadt', true), 5000);
      };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await RTC.iceDone(pc);
      const codecs = await decodableCodecs();
      const r = await gamo.streamOffer(id, { proto: 2, sdp: pc.localDescription.sdp, width: opts.width, height: opts.height, fps: opts.fps, bitrate: opts.bitrate, codecs, prefer: opts.codec || 'auto' });
      await pc.setRemoteDescription({ type: 'answer', sdp: r.sdp });
      if (r.vigem === false) toast('A gaming PC-n nincs ViGEmBus driver: a kontroller nem fog működni (billentyűzet/egér igen).', 'err', 8000);
      if (!opts.preview) bindInput();
      else ui.querySelector('#stream-stats').classList.remove('hidden');
      startStats();
      setTimeout(() => {
        if (!ui || st.firstFrame) return;
        const n = net && net.total ? net.total.pkts : 0;
        ui.querySelector('.sw-text').textContent = n
          ? 'Érkeznek adatok, de még nincs teljes kép – várakozás kulcskockára…'
          : 'Nem érkezik kép. A gaming PC-n engedélyezd a tűzfalban a InariXet (Beállítások → Host mód → Tűzfal engedélyezése, UDP 47802), és mindkét gépen ugyanaz a InariX verzió fusson.';
      }, 6000);
      return true;
    } catch (e) {
      await stop(e.message, true);
      throw e;
    }
  }

  async function stop(reason = 'vége', isError = false) {
    clearInterval(runTimer); runTimer = null;
    if (micTrack) { micTrack.stop(); micTrack = null; }
    if (!pc && !ui) return;
    sendRel({ t: 'reset' });
    clearInterval(padTimer); clearInterval(statsTimer); clearTimeout(hintTimer); clearTimeout(discTimer); clearInterval(fbTimer); clearTimeout(barTimer);
    padTimer = statsTimer = hintTimer = discTimer = fbTimer = barTimer = null;
    if (menuOpen) { const layer = document.querySelector('#modal-layer .menu-item'); if (layer) layer.click(); }
    document.body.classList.remove('stream-menu');
    for (const [el, ev, fn, opt] of listeners.splice(0)) el.removeEventListener(ev, fn, opt);
    if (document.pointerLockElement) document.exitPointerLock();
    pads.clear(); frames.clear();
    try { if (decoder && decoder.state !== 'closed') decoder.close(); } catch { /* zárva */ }
    decoder = null;
    const h = hostId;
    const old = pc; pc = null;
    setTimeout(() => { try { old && old.close(); } catch { /* zárva */ } }, 150);
    fast = rel = vch = null;
    if (ui) { ui.remove(); ui = null; }
    Nav.suspend(false);
    if (h) gamo.streamStop(h).catch(() => {});
    hostId = null;
    const cb = onEnd; onEnd = null;
    if (cb) cb({ reason, error: isError ? reason : null });
  }

  return {
    start, stop, active: () => !!pc, menu: () => openMenu(),
    debug: () => ({ state: pc ? pc.connectionState : 'nincs', firstFrame: st.firstFrame, last: st.last, codec: vconf }),
    // Diagnosztika: a vászon tartalmának mintavétele (átlagos fényerő, színváltozatosság)
    sample: () => {
      if (!canvas) return null;
      const t = document.createElement('canvas'); t.width = 64; t.height = 36;
      const x = t.getContext('2d'); x.drawImage(canvas, 0, 0, 64, 36);
      const d = x.getImageData(0, 0, 64, 36).data;
      let sum = 0; const uniq = new Set();
      for (let i = 0; i < d.length; i += 4) { const v = d[i] + d[i + 1] + d[i + 2]; sum += v; uniq.add(v >> 4); }
      return { avg: Math.round(sum / (d.length / 4)), colors: uniq.size };
    },
  };
})();
