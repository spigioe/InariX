'use strict';
/* global streamHost, RTC */
// Beépített stream – HOST rögzítő (rejtett ablak).
// Videó: képernyő → WebCodecs VideoEncoder (hardveres H.264, realtime) → main → UDP (FEC + NACK)
// Hang:  rendszerhang → WebRTC Opus sáv
// Bemenet: adatcsatornák → main → inputd (SendInput / ViGEm)
let pc = null, media = null, encoder = null, reader = null, statsTimer = null, rcTimer = null;
let session = 0;
let onKeyReq = () => {}, onNet = () => {};
streamHost.onKeyReq(() => onKeyReq());
streamHost.onNet((d) => onNet(d));

function cleanup() {
  session++;
  clearInterval(statsTimer); statsTimer = null;
  clearInterval(rcTimer); rcTimer = null;
  try { if (reader) reader.cancel(); } catch { /* már leállt */ }
  reader = null;
  try { if (encoder && encoder.state !== 'closed') encoder.close(); } catch { /* már zárva */ }
  encoder = null;
  if (pc) { try { pc.close(); } catch { /* már zárva */ } pc = null; }
  if (media) { media.getTracks().forEach((t) => t.stop()); media = null; }
}
streamHost.onStop(() => cleanup());

// Kódoló választás: a kliens által hardveresen dekódolható kodekek közül a leghatékonyabb, amit itt hardveresen
// kódolni is tudunk (AV1 > HEVC > H.264). AV1/HEVC csak hardveresen (szoftveresen túl lassú); H.264 a végső tartalék.
const ENC = {
  av1: { codecs: ['av01.0.08M.08'], extra: {} },
  hevc: { codecs: ['hvc1.1.6.L120.90', 'hev1.1.6.L120.90'], extra: { hevc: { format: 'annexb' } } },
  h264: { codecs: ['avc1.640033', 'avc1.4D0033', 'avc1.42E033'], extra: { avc: { format: 'annexb' } } },
};
async function pickEncoderConfig(width, height, bitrate, codecs = ['h264'], prefer = 'auto') {
  let order = ['av1', 'hevc', 'h264'].filter((k) => k === 'h264' || codecs.includes(k));
  if (prefer !== 'auto' && order.includes(prefer)) order = [prefer, ...order.filter((k) => k !== prefer)];
  const tries = [];
  for (const k of order) {
    for (const hw of k === 'h264' ? ['prefer-hardware', 'no-preference'] : ['prefer-hardware']) {
      for (const codec of ENC[k].codecs) {
        const base = { width, height, bitrate: bitrate * 1000, latencyMode: 'realtime', ...ENC[k].extra };
        // állandó bitráta (CBR): a hardveres kódolók ezt tartják be megbízhatóan (változóban a HEVC 10× túllőtt)
        tries.push({ ...base, codec, hardwareAcceleration: hw, bitrateMode: 'constant' });
        tries.push({ ...base, codec, hardwareAcceleration: hw });
        tries.push({ ...base, codec, hardwareAcceleration: hw, bitrate: undefined });
      }
    }
  }
  for (const cfg of tries) {
    const c = Object.fromEntries(Object.entries(cfg).filter(([, v]) => v !== undefined));
    try { if ((await VideoEncoder.isConfigSupported(c)).supported) return c; } catch { /* következő */ }
  }
  throw new Error('Nincs használható H.264 kódoló');
}

async function runVideo(track, rel, opts, my) {
  const processor = new MediaStreamTrackProcessor({ track });
  reader = processor.readable.getReader();
  let cfg = null, wantKey = true, sentBytes = 0, sentFrames = 0, dropped = 0, lastSentAt = 0, udpQueue = 0, resent = 0;
  let rtt = 0, rttBase = 0, fecGroup = 8;
  const stats = { t: performance.now() };
  const rc = RTC.rateController(opts.fps, opts.bitrate, performance.now());
  let encKbps = rc.kbps();

  const sendFrame = (chunk) => {
    const data = new ArrayBuffer(chunk.byteLength);
    chunk.copyTo(data);
    streamHost.frame(chunk.type === 'key', chunk.timestamp, data);
    sentBytes += chunk.byteLength; sentFrames++;
  };

  const makeEncoder = async (w, h) => {
    if (encoder && encoder.state !== 'closed') encoder.close();
    cfg = await pickEncoderConfig(w, h, encKbps, opts.codecs, opts.prefer);
    encoder = new VideoEncoder({ output: sendFrame, error: (e) => { streamHost.stats({ error: `kódoló: ${e.message}` }); wantKey = true; } });
    encoder.configure(cfg);
    rel.send(JSON.stringify({ t: 'vconf', codec: cfg.codec, width: w, height: h, hw: cfg.hardwareAcceleration }));
    wantKey = true;
  };

  // Bitráta módosítás menet közben (ritkán, mert az újrakonfigurálás kulcskockát igényelhet)
  let comp = 1; // a kódoló túllövésének mért aránya (tényleges / beállított) – ennyivel kevesebbet kérünk tőle
  const applyBitrate = (now) => {
    const want = Math.round(rc.kbps() / comp);
    if (!cfg || !encoder || encoder.state !== 'configured' || !cfg.bitrate) return;
    if (Math.abs(want - encKbps) / encKbps < 0.15 || now - rc.lastReconf < 1500) return;
    rc.lastReconf = now;
    encKbps = want;
    cfg = { ...cfg, bitrate: want * 1000 };
    try { encoder.configure(cfg); wantKey = true; } catch { /* marad a régi */ }
  };

  // Kulcskocka kérés (UDP-n a klienstől, vagy a megbízható csatornán dekóder hibánál)
  onKeyReq = () => { wantKey = true; };
  rel.addEventListener('message', (m) => {
    if (typeof m.data !== 'string') return;
    let msg; try { msg = JSON.parse(m.data); } catch { return; }
    if (msg.t === 'kf') wantKey = true;
    if (msg.t === 'fb') { rc.lateFrames += msg.late || 0; if ((msg.q || 0) > 4) rc.congestion++; }
  });
  // Hálózati állapot a main-től: UDP küldési sor + a kliens csomagvesztés statisztikája
  onNet = (d) => {
    udpQueue = d.queue || 0; resent = d.resent || 0;
    if (udpQueue > highWater()) rc.congestion++;
    const c = d.client;
    fecGroup = d.fecGroup || fecGroup;
    if (c) {
      if (c.rtt) { rtt = c.rtt; rttBase = c.base || rtt; }
      // késés alapú torlódásjelzés: ha a késés jóval az alapérték fölé nő, a hálózatban sorban állnak a csomagok
      if (c.rtt && c.base && c.rtt - c.base > Math.max(25, c.base * 0.8)) rc.congestion++;
      if (c.pkts > 50) {
        const lossy = (c.nacks + c.fec) / c.pkts;
        if (lossy > 0.05 || c.lost > 0) rc.congestion++;
      }
    }
  };
  // Küldési sor felső határa: ~2 kocka az aktuális bitrátán (min. 192 KB)
  const highWater = () => Math.max(192 * 1024, ((rc.kbps() * 1000) / 8 / rc.fps) * 2);

  rcTimer = setInterval(() => {
    if (my !== session) return;
    const now = performance.now();
    if (rc.tick(now)) {
      applyBitrate(now);
      if (rel.readyState === 'open') rel.send(JSON.stringify({ t: 'rate', fps: rc.fps, kbps: rc.kbps() }));
    }
  }, 500);

  let overshoot = 0, note = '';
  statsTimer = setInterval(() => {
    const now = performance.now(), dt = (now - stats.t) / 1000;
    stats.t = now;
    // Őrfigyelés: ha a kódoló tartósan túllövi a cél bitrátát, elárasztja a hálózatot → újraindítás,
    // ismétlődés esetén visszaváltás H.264-re
    const realKbps = (sentBytes * 8) / dt / 1000;
    // zárt szabályozás: a kódoló tényleges kimenetéhez igazítjuk a neki beállított bitrátát
    if (cfg && cfg.bitrate && realKbps > 2000 && encKbps > 0) {
      comp = Math.max(1, Math.min(4, comp * 0.7 + 0.3 * (realKbps / encKbps)));
      applyBitrate(now);
    }
    overshoot = cfg && realKbps > rc.kbps() * 3 && realKbps > 4000 ? overshoot + 1 : 0;
    if (overshoot >= 3 && cfg && now - (stats.lastRestart || 0) > 10000) {
      stats.lastRestart = now;
      overshoot = 0;
      const isH264 = cfg.codec.startsWith('avc1');
      if (!isH264 && (stats.restarts = (stats.restarts || 0) + 1) >= 2) { opts.codecs = ['h264']; opts.prefer = 'h264'; note = `${cfg.codec} túllövi a bitrátát → H.264`; }
      else note = `kódoló újraindítva (túllövés ${Math.round(realKbps)} / ${rc.kbps()} kbps)`;
      encKbps = rc.kbps();
      makeEncoder(cfg.width, cfg.height).catch((e) => streamHost.stats({ error: e.message }));
    }
    streamHost.stats({ fps: Math.round(sentFrames / dt), kbps: Math.round((sentBytes * 8) / dt / 1000), targetFps: rc.fps, targetKbps: rc.kbps(), quality: Math.round(rc.q * 100), w: cfg && cfg.width, h: cfg && cfg.height, encoder: cfg ? `WebCodecs ${cfg.codec}` : '?', hw: cfg ? cfg.hardwareAcceleration : '?', dropped, udpQueue, resent, transport: 'UDP', rtt, rttBase, fecGroup, mode: cfg ? cfg.bitrateMode || 'variable' : '?', comp: +comp.toFixed(2), encKbps, note: note || undefined });
    note = '';
    sentBytes = 0; sentFrames = 0;
  }, 1000);

  for (;;) {
    const { value: frame, done } = await reader.read();
    if (done || my !== session) { if (frame) frame.close(); break; }
    try {
      const w = frame.displayWidth & ~1, h = frame.displayHeight & ~1;
      if (!encoder || !cfg || cfg.width !== w || cfg.height !== h) await makeEncoder(w, h);
      const now = performance.now();
      // Képfrissítés korlát (cél fps), egyenletes ütemezéssel
      const interval = 1000 / rc.fps;
      if (lastSentAt && now - lastSentAt < interval * 0.8) continue;
      // Torlódás: a kockát KÓDOLÁS ELŐTT dobjuk el – ez nem rontja a képet, kulcskocka sem kell hozzá
      if (encoder.encodeQueueSize > 2 || udpQueue > highWater() * 2) { dropped++; rc.congestion++; continue; }
      lastSentAt = lastSentAt && now - lastSentAt < interval * 2 ? lastSentAt + interval : now;
      encoder.encode(frame, { keyFrame: wantKey });
      wantKey = false;
    } catch (e) {
      streamHost.stats({ error: e.message });
    } finally {
      frame.close();
    }
  }
}

streamHost.onOffer(async ({ id, sdp, width, height, fps, bitrate, codecs, prefer }) => {
  try {
    cleanup();
    const my = session;
    media = await navigator.mediaDevices.getDisplayMedia({
      video: { width: { max: width }, height: { max: height }, frameRate: { ideal: fps, max: fps } },
      audio: true,
    });
    const video = media.getVideoTracks()[0];
    const audio = media.getAudioTracks()[0] || null;
    video.contentHint = 'motion';

    pc = new RTCPeerConnection({ iceServers: [] });
    let started = false;
    pc.ondatachannel = (e) => {
      const ch = e.channel;
      if (ch.label === 'fast' || ch.label === 'rel') ch.onmessage = (m) => { if (typeof m.data === 'string' && !/"t":"(kf|fb)"/.test(m.data)) streamHost.input(m.data); };
      if (ch.label === 'rel') {
        const go = () => { if (!started && my === session) { started = true; runVideo(video, ch, { bitrate, fps, codecs, prefer }, my).catch((err) => streamHost.stats({ error: err.message })); } };
        if (ch.readyState === 'open') go(); else ch.onopen = go;
      }
    };
    // a kliens mikrofonja → virtuális hangkábel (VB-CABLE „CABLE Input”), a játékban „CABLE Output” a mikrofon
    pc.ontrack = async (e) => {
      if (e.track.kind !== 'audio') return;
      try {
        const devs = await navigator.mediaDevices.enumerateDevices();
        const out = devs.find((d) => d.kind === 'audiooutput' && /cable input|vb-audio|virtual/i.test(d.label));
        if (!out) { streamHost.stats({ note: 'mikrofon érkezik, de nincs virtuális hangkábel (VB-CABLE) – nem játsszuk le' }); return; }
        const a = new Audio();
        a.srcObject = new MediaStream([e.track]);
        await a.setSinkId(out.deviceId);
        await a.play();
        streamHost.stats({ note: `mikrofon → ${out.label}` });
      } catch (err) { streamHost.stats({ note: `mikrofon hiba: ${err.message}` }); }
    };
    pc.onconnectionstatechange = () => {
      streamHost.state(pc ? pc.connectionState : 'closed');
      if (pc && (pc.connectionState === 'failed' || pc.connectionState === 'closed')) cleanup();
    };

    await pc.setRemoteDescription({ type: 'offer', sdp });
    for (const t of pc.getTransceivers()) {
      const kind = t.receiver.track.kind;
      if (kind === 'audio') { t.direction = audio ? 'sendrecv' : 'recvonly'; if (audio) await t.sender.replaceTrack(audio); } else t.direction = 'inactive';
    }
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await RTC.iceDone(pc);
    streamHost.answer(id, { sdp: pc.localDescription.sdp });
  } catch (e) {
    cleanup();
    streamHost.answer(id, { error: `Képernyőrögzítés hiba: ${e.message}` });
  }
});
