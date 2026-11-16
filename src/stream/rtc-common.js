'use strict';
// Közös WebRTC segédek (host és kliens).
/* exported RTC */
const RTC = {
  // H.264 előre (hardveres kódolás NVENC/AMF/QuickSync) – azon belül High > Main > Constrained Baseline,
  // utána VP9, VP8; RTX/RED/FEC a végén
  orderCodecs(codecs) {
    const rank = (c) => {
      const m = c.mimeType.toLowerCase();
      const f = (c.sdpFmtpLine || '').toLowerCase();
      if (m === 'video/h264') {
        const pm = f.includes('packetization-mode=1') ? 0 : 5;
        const prof = /profile-level-id=64/.test(f) ? 0 : /profile-level-id=4d/.test(f) ? 1 : /profile-level-id=42e0/.test(f) ? 2 : 3;
        return pm + prof;
      }
      if (m === 'video/vp9') return 10;
      if (m === 'video/vp8') return 11;
      if (m === 'video/av1') return 12;
      return 20;
    };
    return [...codecs].sort((a, b) => rank(a) - rank(b));
  },

  // Bitráta beállítása az SDP-ben (Chromium x-google paraméterek + b=AS). A küldő a fogadó leírásából olvassa.
  mungeBitrate(sdp, kbps) {
    const lines = sdp.split('\r\n');
    const out = [];
    let video = false;
    for (const l of lines) {
      if (l.startsWith('m=')) video = l.startsWith('m=video');
      if (video && l.startsWith('b=AS:')) continue;
      if (video && l.startsWith('a=fmtp:') && !l.includes('apt=')) {
        // H.264 szint 3.1 → 5.1: a 3.1 csak 720p-ig elég, felette a Chromium szoftveres kódolóra esik vissza
        const lvl = l.replace(/profile-level-id=([0-9a-f]{4})1f/i, 'profile-level-id=$133');
        out.push(`${lvl};x-google-start-bitrate=${Math.round(kbps * 0.7)};x-google-min-bitrate=${Math.round(kbps * 0.25)};x-google-max-bitrate=${kbps}`);
        continue;
      }
      out.push(l);
      if (video && l.startsWith('c=')) out.push(`b=AS:${kbps}`);
    }
    return out.join('\r\n');
  },

  // Adaptív szabályozó: a folyamatos (lehetőleg 60) fps az elsődleges.
  // Torlódáskor: 1) bitráta le a beállított 60%-áig, 2) fps le (min. 30), 3) bitráta tovább (min. 25%).
  // Javuláskor fordítva: előbb az fps jön vissza, utána a minőség.
  rateController(maxFps, maxKbps, now0 = 0) {
    const MIN_FPS = Math.min(30, maxFps);
    const MIN_Q = 0.25; // a beállított bitráta legalább 25%-a
    const SOFT_Q = 0.6; // eddig csak a bitráta csökken, az fps marad
    const rc = { fps: maxFps, q: 1, congestion: 0, lateFrames: 0, clearSince: now0, lastChange: -1e9, lastReconf: -1e9, minFps: MIN_FPS };
    // kevesebb fps → valamivel kevesebb bitráta (de kockánként több bit, így szebb kép)
    rc.kbps = () => Math.round(maxKbps * rc.q * (0.55 + 0.45 * (rc.fps / maxFps)));
    rc.tick = (now) => {
      const bad = rc.congestion > 0 || rc.lateFrames > 2;
      rc.congestion = 0; rc.lateFrames = 0;
      if (bad) {
        rc.clearSince = now;
        if (now - rc.lastChange < 400) return false;
        rc.lastChange = now;
        if (rc.q > SOFT_Q) rc.q = Math.max(SOFT_Q, rc.q * 0.8);
        else if (rc.fps > MIN_FPS) rc.fps = Math.max(MIN_FPS, rc.fps - 10);
        else rc.q = Math.max(MIN_Q, rc.q * 0.8);
        return true;
      }
      // stabil hálózat: 2 mp után lépésenként vissza (előbb a minimum fölé a minőség, aztán fps, végül a teljes minőség)
      if (now - rc.clearSince > 1200 && now - rc.lastChange > 700) {
        if (rc.q < SOFT_Q && rc.fps <= MIN_FPS) { rc.lastChange = now; rc.q = Math.min(SOFT_Q, rc.q * 1.35); return true; }
        if (rc.fps < maxFps) { rc.lastChange = now; rc.fps = Math.min(maxFps, rc.fps + 10); return true; }
        if (rc.q < 1) { rc.lastChange = now; rc.q = Math.min(1, rc.q * 1.3); return true; }
      }
      return false;
    };
    return rc;
  },

  // Megvárjuk az ICE jelöltek összegyűjtését (LAN-on gyors), így egyetlen SDP csere elég
  iceDone(pc, ms = 3000) {
    if (pc.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise((resolve) => {
      const t = setTimeout(resolve, ms);
      pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); resolve(); } });
    });
  },
};
