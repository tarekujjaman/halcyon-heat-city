// Three procedural radio stations, sequenced on the audio clock: Halcyon FM (synthwave: pulsing
// bass, arpeggios, gated drums), Coral 88 (chill: warm pads, slow lead with echo, brushed hats)
// and Dock Talk (a talk station: two synthetic voices trading lines over a jingle). R switches
// stations; the music plays while Sol is in a car.
import { RADIO_STATIONS } from './config.js';

const TRACKS = [
  ['Chrome Coast', 'Neon Ballast', 'Sodium Nights', 'Mirror Drive', 'Palmetto Pulse'],
  ['Low Tide Loop', 'Sea Glass', 'Slow Boardwalk', 'Pelican Hour'],
  ['The Dock Talk Hour', 'Harbour Report', 'Saltmarsh Call-In'],
];
const ARTISTS = [
  ['Marina Volt', 'Glass Tower Kids', 'Okafor Sound', 'Sol & the Strands', 'Causeway'],
  ['Coral Choir', 'Dusk Pilots', 'Tide Runners (Instrumental)', 'Sandbar'],
  ['with Benny Alder', 'with Lu Marsh', 'with Benny Alder'],
];

const CHORDS = {
  synth: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]],
  chill: [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65]],
};

const midi = (n) => 440 * 2 ** ((n - 69) / 12);

export function createRadio(audio) {
  const r = { station: 0, playing: false, track: 0, trackTimer: 0, nextTime: 0, stepIndex: 0, bar: 0, fade: 0, voiceTimer: 0, speaker: 0 };
  let bus = null;
  let stationGain = null;

  function ensureBus() {
    const ctx = audio.context;
    if (!ctx || bus) return !!bus;
    bus = ctx.createGain();
    bus.gain.value = 0;
    stationGain = bus;
    bus.connect(audio.musicBus());
    return true;
  }

  function osc(ctx, type, freq, t, dur, gain, { attack = 0.01, release = 0.05, detune = 0, filterFreq = null, slide = null } = {}) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.setValueAtTime(gain, t + Math.max(attack, dur - release));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.02);
    let node = o;
    if (filterFreq) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filterFreq;
      o.connect(f);
      node = f;
    }
    node.connect(g).connect(bus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function noiseHit(ctx, t, dur, gain, freq, type = 'highpass') {
    const src = ctx.createBufferSource();
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(bus);
    src.start(t);
  }

  /** One sixteenth step of Halcyon FM at 118 bpm. */
  function stepSynth(ctx, t, step, stepDur) {
    const chord = CHORDS.synth[Math.floor(step / 16) % 4];
    const sixteenth = step % 16;
    // Bass on every eighth, octave jump on the off-beat.
    if (sixteenth % 2 === 0) {
      const root = chord[0] - 24 + (sixteenth % 4 === 2 ? 12 : 0);
      osc(ctx, 'sawtooth', midi(root), t, stepDur * 1.6, 0.16, { filterFreq: 500, release: 0.03 });
    }
    // Arpeggio.
    const arpNote = chord[(sixteenth * 2) % chord.length] + 12 + (sixteenth % 8 >= 4 ? 12 : 0);
    osc(ctx, 'square', midi(arpNote), t, stepDur * 0.8, 0.045, { filterFreq: 2600, release: 0.02 });
    // Pad on the bar.
    if (sixteenth === 0) {
      for (const n of chord) {
        osc(ctx, 'sawtooth', midi(n), t, stepDur * 16, 0.028, { attack: 0.3, release: 0.4, detune: 6, filterFreq: 1200 });
        osc(ctx, 'sawtooth', midi(n), t, stepDur * 16, 0.028, { attack: 0.3, release: 0.4, detune: -6, filterFreq: 1200 });
      }
    }
    // Drums.
    if (sixteenth % 4 === 0) osc(ctx, 'sine', 150, t, 0.22, 0.4, { slide: 40, release: 0.1 });
    if (sixteenth % 8 === 4) noiseHit(ctx, t, 0.18, 0.3, 1800);
    if (sixteenth % 2 === 0) noiseHit(ctx, t, 0.04, 0.12, 7000);
    // Lead every other bar.
    if (Math.floor(step / 16) % 2 === 1 && sixteenth % 4 === 2) {
      const lead = chord[(sixteenth / 2) % chord.length] + 24;
      osc(ctx, 'sawtooth', midi(lead), t, stepDur * 3, 0.06, { filterFreq: 3000, release: 0.1, detune: 4 });
    }
  }

  /** One eighth step of Coral 88 at 84 bpm. */
  function stepChill(ctx, t, step, stepDur) {
    const chord = CHORDS.chill[Math.floor(step / 8) % 4];
    const eighth = step % 8;
    if (eighth === 0) {
      for (const n of chord) osc(ctx, 'triangle', midi(n), t, stepDur * 8, 0.06, { attack: 0.5, release: 0.8, filterFreq: 1500 });
      osc(ctx, 'sine', midi(chord[0] - 24), t, stepDur * 8, 0.18, { attack: 0.05, release: 0.5 });
    }
    if (eighth % 2 === 1) noiseHit(ctx, t, 0.08, 0.06, 6000);
    if (eighth === 4) noiseHit(ctx, t, 0.1, 0.1, 2500, 'bandpass');
    // Lead: a slow pentatonic line with an echo.
    if (eighth % 3 === 0 && Math.random() < 0.7) {
      const scale = [0, 2, 4, 7, 9];
      const n = chord[0] + 24 + scale[Math.floor(Math.random() * scale.length)];
      osc(ctx, 'sine', midi(n), t, stepDur * 2.2, 0.09, { attack: 0.03, release: 0.3 });
      osc(ctx, 'sine', midi(n), t + stepDur * 1.5, stepDur * 2, 0.04, { attack: 0.03, release: 0.3 });
      osc(ctx, 'sine', midi(n), t + stepDur * 3, stepDur * 2, 0.02, { attack: 0.03, release: 0.3 });
    }
  }

  /** Dock Talk: syllables of a filtered saw, two hosts, a jingle now and then. */
  function stepTalk(ctx, t, step, stepDur) {
    if (step % 64 === 0) {
      // Jingle.
      [60, 64, 67, 72].forEach((n, i) => osc(ctx, 'triangle', midi(n), t + i * 0.12, 0.3, 0.12, { release: 0.1 }));
      r.speaker = 1 - r.speaker;
    }
    if (step % 64 < 6) return;
    // Syllables with a pause between phrases.
    const phrasePos = step % 14;
    if (phrasePos > 10) return;
    const base = r.speaker === 0 ? 120 : 190;
    const f = base * (0.85 + Math.random() * 0.4);
    const dur = stepDur * (0.6 + Math.random() * 0.5);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f, t);
    o.frequency.linearRampToValueAtTime(f * (0.9 + Math.random() * 0.25), t + dur);
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.value = 500 + Math.random() * 1200;
    f1.Q.value = 4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f1).connect(g).connect(bus);
    o.start(t);
    o.stop(t + dur + 0.02);
    if (phrasePos === 10 && Math.random() < 0.3) r.speaker = 1 - r.speaker;
  }

  const STATIONS = [
    { bpm: 118, div: 4, step: stepSynth },
    { bpm: 84, div: 2, step: stepChill },
    { bpm: 110, div: 2, step: stepTalk },
  ];

  r.stationName = () => RADIO_STATIONS[r.station];
  r.trackName = () => `${TRACKS[r.station][r.track % TRACKS[r.station].length]} · ${ARTISTS[r.station][r.track % ARTISTS[r.station].length]}`;
  r.setStation = (i, quiet = false) => {
    r.station = ((i % STATIONS.length) + STATIONS.length) % STATIONS.length;
    r.stepIndex = 0;
    r.nextTime = 0;
    r.track = Math.floor(Math.random() * 5);
    if (!quiet) audio.play('click');
  };
  r.next = () => r.setStation(r.station + 1);
  r.stationNames = RADIO_STATIONS;

  /** Per frame: schedule the next steps when the player is in a car. */
  r.update = (dt, inCar) => {
    const ctx = audio.context;
    if (!ctx || ctx.state !== 'running' || !ensureBus()) return;
    const target = inCar ? 1 : 0;
    r.fade += (target - r.fade) * Math.min(1, dt * 3);
    stationGain.gain.setTargetAtTime(r.fade * 0.9, ctx.currentTime, 0.1);
    r.playing = inCar;
    if (!inCar) return;
    r.trackTimer += dt;
    if (r.trackTimer > 95) {
      r.trackTimer = 0;
      r.track += 1;
    }
    const st = STATIONS[r.station];
    const stepDur = 60 / st.bpm / st.div;
    if (r.nextTime < ctx.currentTime) r.nextTime = ctx.currentTime + 0.05;
    while (r.nextTime < ctx.currentTime + 0.25) {
      st.step(ctx, r.nextTime, r.stepIndex, stepDur);
      r.stepIndex += 1;
      r.nextTime += stepDur;
    }
  };
  return r;
}
