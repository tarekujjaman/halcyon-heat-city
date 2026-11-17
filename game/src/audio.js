// All sound is synthesized with the Web Audio API, no files: gunshots, impacts, footsteps, doors,
// UI blips and fanfares, the player's engine whose pitch follows the revs, police sirens by
// distance and car horns. Created on the first click or key press, as browsers require.

export function createAudio() {
  let ctx = null;
  let master = null;
  let sfx = null;
  let music = null;
  let engine = null;
  const sirens = new Map();
  const horns = new Map();
  const settings = { volume: 0.8, music: 0.7 };
  let noiseBuffer = null;

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return false;
    }
    master = ctx.createGain();
    master.gain.value = settings.volume;
    master.connect(ctx.destination);
    sfx = ctx.createGain();
    sfx.gain.value = 0.9;
    sfx.connect(master);
    music = ctx.createGain();
    music.gain.value = settings.music;
    music.connect(master);
    const len = ctx.sampleRate * 2;
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) d[i] = Math.random() * 2 - 1;
    return true;
  }

  function noise(duration, { filter = 'lowpass', freq = 1000, q = 1, gain = 0.5, attack = 0.002, decay = duration, sweepTo = null, out = sfx } = {}) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, ctx.currentTime + decay);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.linearRampToValueAtTime(gain, ctx.currentTime + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + decay);
    src.connect(f).connect(g).connect(out);
    src.start();
    src.stop(ctx.currentTime + duration + 0.05);
  }

  function tone(freq, duration, { type = 'sine', gain = 0.3, attack = 0.005, slideTo = null, out = sfx, delay = 0 } = {}) {
    const o = ctx.createOscillator();
    o.type = type;
    const t0 = ctx.currentTime + delay;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    o.connect(g).connect(out);
    o.start(t0);
    o.stop(t0 + duration + 0.05);
  }

  const SOUNDS = {
    pistol: (v) => { noise(0.18, { filter: 'bandpass', freq: 1800, q: 0.7, gain: 0.9 * v, decay: 0.16 }); tone(140, 0.12, { type: 'triangle', gain: 0.5 * v, slideTo: 50 }); },
    smg: (v) => { noise(0.1, { filter: 'bandpass', freq: 2200, q: 0.8, gain: 0.6 * v, decay: 0.09 }); tone(180, 0.07, { type: 'square', gain: 0.25 * v, slideTo: 70 }); },
    shotgun: (v) => { noise(0.35, { filter: 'lowpass', freq: 1800, gain: 1.2 * v, decay: 0.3, sweepTo: 300 }); tone(90, 0.25, { type: 'triangle', gain: 0.7 * v, slideTo: 35 }); },
    punch: (v) => { noise(0.12, { filter: 'lowpass', freq: 500, gain: 0.5 * v, decay: 0.1 }); },
    hit: (v) => { noise(0.15, { filter: 'lowpass', freq: 700, gain: 0.7 * v, decay: 0.13 }); tone(120, 0.1, { type: 'sine', gain: 0.4 * v, slideTo: 60 }); },
    thud: (v) => { noise(0.3, { filter: 'lowpass', freq: 400, gain: 0.9 * v, decay: 0.28 }); tone(70, 0.25, { type: 'sine', gain: 0.6 * v, slideTo: 30 }); },
    crash: (v) => { noise(0.5, { filter: 'lowpass', freq: 1200, gain: 1.1 * v, decay: 0.45, sweepTo: 200 }); noise(0.3, { filter: 'highpass', freq: 3000, gain: 0.4 * v, decay: 0.25 }); tone(60, 0.35, { type: 'sine', gain: 0.6 * v, slideTo: 25 }); },
    scrape: (v) => { noise(0.25, { filter: 'bandpass', freq: 2500, q: 2, gain: 0.3 * v, decay: 0.22 }); },
    ricochet: (v) => { tone(2400, 0.12, { type: 'sine', gain: 0.18 * v, slideTo: 900 }); noise(0.06, { filter: 'highpass', freq: 4000, gain: 0.2 * v }); },
    explosion: (v) => { noise(1.6, { filter: 'lowpass', freq: 900, gain: 1.4 * v, decay: 1.4, sweepTo: 80 }); tone(50, 1.0, { type: 'sine', gain: 0.9 * v, slideTo: 20 }); noise(0.5, { filter: 'highpass', freq: 2000, gain: 0.5 * v, decay: 0.4 }); },
    door: (v) => { noise(0.08, { filter: 'lowpass', freq: 900, gain: 0.4 * v }); tone(220, 0.06, { type: 'square', gain: 0.1 * v }); },
    step: (v) => { noise(0.06, { filter: 'lowpass', freq: 700, gain: 0.16 * v, decay: 0.05 }); },
    jump: (v) => { noise(0.08, { filter: 'lowpass', freq: 600, gain: 0.2 * v }); },
    land: (v) => { noise(0.1, { filter: 'lowpass', freq: 500, gain: 0.3 * v }); },
    switch: (v) => { tone(600, 0.05, { type: 'square', gain: 0.12 * v }); tone(900, 0.05, { type: 'square', gain: 0.12 * v, delay: 0.05 }); },
    reload: (v) => { tone(400, 0.04, { type: 'square', gain: 0.15 * v }); tone(300, 0.05, { type: 'square', gain: 0.15 * v, delay: 0.25 }); noise(0.05, { filter: 'highpass', freq: 2000, gain: 0.2 * v, delay: 0.3 }); },
    empty: (v) => { tone(500, 0.03, { type: 'square', gain: 0.15 * v }); },
    cash: (v) => { for (let i = 0; i < 3; i += 1) tone(1200 + i * 300, 0.12, { type: 'sine', gain: 0.2 * v, delay: i * 0.06 }); },
    pickup: (v) => { tone(880, 0.1, { type: 'sine', gain: 0.25 * v }); tone(1320, 0.18, { type: 'sine', gain: 0.25 * v, delay: 0.08 }); },
    deny: (v) => { tone(160, 0.2, { type: 'square', gain: 0.15 * v }); tone(120, 0.25, { type: 'square', gain: 0.15 * v, delay: 0.12 }); },
    click: (v) => { tone(1000, 0.03, { type: 'square', gain: 0.1 * v }); },
    wantedUp: (v) => { tone(660, 0.15, { type: 'square', gain: 0.2 * v }); tone(880, 0.25, { type: 'square', gain: 0.2 * v, delay: 0.16 }); },
    levelUp: (v) => { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, { type: 'triangle', gain: 0.25 * v, delay: i * 0.1 })); },
    missionStart: (v) => { tone(392, 0.3, { type: 'sawtooth', gain: 0.15 * v }); tone(523, 0.5, { type: 'sawtooth', gain: 0.15 * v, delay: 0.15 }); tone(659, 0.7, { type: 'sawtooth', gain: 0.15 * v, delay: 0.3 }); },
    missionComplete: (v) => { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.5, { type: 'triangle', gain: 0.28 * v, delay: i * 0.12 })); noise(0.6, { filter: 'highpass', freq: 5000, gain: 0.1 * v, decay: 0.5 }); },
    missionFail: (v) => { [440, 370, 311, 262].forEach((f, i) => tone(f, 0.45, { type: 'sawtooth', gain: 0.2 * v, delay: i * 0.18 })); },
    save: (v) => { tone(1046, 0.12, { type: 'sine', gain: 0.2 * v }); tone(1568, 0.25, { type: 'sine', gain: 0.2 * v, delay: 0.1 }); },
    spray: (v) => { noise(1.2, { filter: 'highpass', freq: 3000, gain: 0.35 * v, decay: 1.1 }); },
    scream: (v) => { tone(700, 0.5, { type: 'sawtooth', gain: 0.08 * v, slideTo: 400 }); },
    countdown: (v) => { tone(660, 0.15, { type: 'square', gain: 0.2 * v }); },
    go: (v) => { tone(1320, 0.4, { type: 'square', gain: 0.25 * v }); },
    checkpoint: (v) => { tone(988, 0.1, { type: 'sine', gain: 0.25 * v }); tone(1318, 0.2, { type: 'sine', gain: 0.25 * v, delay: 0.08 }); },
    siren: () => {},
  };

  function play(name, volume = 1) {
    if (!ctx || ctx.state !== 'running') return;
    const fn = SOUNDS[name];
    if (fn) fn(Math.max(0, Math.min(1.5, volume)));
  }

  /** The player's engine: two oscillators and a breath of noise, pitched by rpm and loudened by throttle. */
  function engineVoice() {
    const g = ctx.createGain();
    g.gain.value = 0;
    const o1 = ctx.createOscillator();
    o1.type = 'sawtooth';
    const o2 = ctx.createOscillator();
    o2.type = 'square';
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 600;
    const g2 = ctx.createGain();
    g2.gain.value = 0.35;
    o1.connect(f);
    o2.connect(g2).connect(f);
    f.connect(g).connect(sfx);
    o1.start();
    o2.start();
    return { g, o1, o2, f };
  }

  function sirenVoice() {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    const g = ctx.createGain();
    g.gain.value = 0;
    o.connect(g).connect(sfx);
    o.start();
    return { o, g, phase: 0, used: true };
  }

  return {
    settings,
    get context() {
      return ctx;
    },
    unlock() {
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    play,
    setVolume(v) {
      settings.volume = v;
      if (master) master.gain.value = v;
    },
    setMusicVolume(v) {
      settings.music = v;
      if (music) music.gain.value = v;
    },
    musicBus: () => music,
    sfxBus: () => sfx,
    /** Per frame: the player's car (or null), the cruisers' sirens updated through siren(). */
    updateEngine(vehicle, dt) {
      if (!ctx || ctx.state !== 'running') return;
      if (!engine) engine = engineVoice();
      if (!vehicle || vehicle.wrecked) {
        engine.g.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        return;
      }
      const speed = Math.abs(vehicle.speed);
      const ratio = speed / vehicle.spec.maxSpeed;
      // Four gears: revs climb and fall back as speed crosses each band.
      const gear = Math.min(3, Math.floor(ratio * 4.2));
      const inGear = (ratio * 4.2 - gear);
      const rpm = 0.25 + Math.min(1, inGear) * 0.75 + vehicle.throttle * 0.15;
      const base = vehicle.spec.open ? 110 : 55;
      const freq = base * (0.8 + rpm * 2.2);
      engine.o1.frequency.setTargetAtTime(freq, ctx.currentTime, 0.05);
      engine.o2.frequency.setTargetAtTime(freq / 2, ctx.currentTime, 0.05);
      engine.f.frequency.setTargetAtTime(400 + rpm * 1800, ctx.currentTime, 0.05);
      const vol = 0.05 + vehicle.throttle * 0.1 + rpm * 0.06;
      engine.g.gain.setTargetAtTime(vol, ctx.currentTime, 0.08);
      void dt;
    },
    siren(v, distance) {
      if (!ctx || ctx.state !== 'running') return;
      let s = sirens.get(v.id);
      if (!s) {
        s = sirenVoice();
        sirens.set(v.id, s);
      }
      s.used = true;
      s.phase += 0.016 * 1.4;
      const f = 650 + Math.sin(s.phase * Math.PI * 2) * 250;
      s.o.frequency.setTargetAtTime(f, ctx.currentTime, 0.02);
      const vol = Math.max(0, 0.16 * (1 - distance / 70));
      s.g.gain.setTargetAtTime(v.siren ? vol : 0, ctx.currentTime, 0.05);
    },
    horn(v) {
      if (!ctx || ctx.state !== 'running') return;
      let h = horns.get(v.id);
      if (!h) {
        const o = ctx.createOscillator();
        o.type = 'square';
        o.frequency.value = v.spec.open ? 520 : 380;
        const o2 = ctx.createOscillator();
        o2.type = 'square';
        o2.frequency.value = v.spec.open ? 660 : 470;
        const g = ctx.createGain();
        g.gain.value = 0;
        o.connect(g);
        o2.connect(g);
        g.connect(sfx);
        o.start();
        o2.start();
        h = { g, used: true };
        horns.set(v.id, h);
      }
      h.used = true;
      h.g.gain.setTargetAtTime(v.horn > 0 ? 0.08 : 0, ctx.currentTime, 0.03);
    },
    /** End of frame: silence voices nobody updated. */
    endFrame() {
      if (!ctx) return;
      for (const [id, s] of sirens) {
        if (!s.used) {
          s.g.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
          s.idle = (s.idle || 0) + 1;
          if (s.idle > 120) {
            s.o.stop();
            sirens.delete(id);
          }
        } else s.idle = 0;
        s.used = false;
      }
      for (const [id, h] of horns) {
        if (!h.used) {
          h.g.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
          h.idle = (h.idle || 0) + 1;
          if (h.idle > 120) horns.delete(id);
        } else h.idle = 0;
        h.used = false;
      }
    },
    noise,
    tone,
    get ready() {
      return !!ctx && ctx.state === 'running';
    },
  };
}
