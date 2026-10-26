// Procedural sound effects built from oscillators and filtered noise, so the game
// ships without any audio files. Sounds can be positional: volume falls off with
// distance and they pan left/right relative to the listener's facing.

const MAX_DISTANCE = 140;

function rand(min, max) {
  return min + Math.random() * (max - min);
}

export class AudioEngine {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.master = null;
    this.listener = { x: 0, y: 0, z: 0, yaw: 0 };
    this.cricketTimer = 2;
    this.windGain = null;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch {
      this.ctx = null;
      return;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = this.settings.get('volume');
    const compressor = this.ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.ratio.value = 4;
    this.master.connect(compressor);
    compressor.connect(this.ctx.destination);
    this.noiseBuffer = this.makeNoiseBuffer(2);
    this.startAmbience();
  }

  setVolume(v) {
    if (this.master) this.master.gain.value = v;
  }

  setListener(x, y, z, yaw) {
    this.listener.x = x;
    this.listener.y = y;
    this.listener.z = z;
    this.listener.yaw = yaw;
  }

  makeNoiseBuffer(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  startAmbience() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 380;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.05;
    src.connect(filter);
    filter.connect(this.windGain);
    this.windGain.connect(this.master);
    src.start();
    lfo.start();
  }

  // Returns gain and stereo pan for a sound at an optional world position.
  spatial(opts) {
    if (opts.x === undefined) return { gain: 1, pan: 0 };
    const L = this.listener;
    const dx = opts.x - L.x;
    const dy = (opts.y ?? L.y) - L.y;
    const dz = opts.z - L.z;
    const dist = Math.hypot(dx, dy, dz);
    const range = opts.range ?? MAX_DISTANCE;
    if (dist > range) return { gain: 0, pan: 0 };
    const gain = Math.min(1, 1 / (1 + dist / (opts.falloff ?? 9))) * (1 - dist / range);
    const rx = Math.cos(L.yaw);
    const rz = -Math.sin(L.yaw);
    const pan = dist > 0.5 ? Math.max(-0.85, Math.min(0.85, (dx * rx + dz * rz) / dist)) : 0;
    return { gain, pan };
  }

  output(gain, pan) {
    const g = this.ctx.createGain();
    g.gain.value = gain;
    if (pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      p.connect(this.master);
      setTimeout(() => p.disconnect(), 4000);
    } else {
      g.connect(this.master);
    }
    setTimeout(() => g.disconnect(), 4000);
    return g;
  }

  noise(dest, t, { dur = 0.2, attack = 0.004, gain = 0.5, type = 'bandpass', freq = 1000, freqEnd = null, q = 1, rate = 1 }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = rate;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (freqEnd) filter.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
    filter.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(env);
    env.connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  tone(dest, t, { type = 'sine', freq = 440, freqEnd = null, dur = 0.2, attack = 0.005, gain = 0.3 }) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env);
    env.connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  play(name, opts = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const fn = SOUNDS[name];
    if (!fn) return;
    const { gain, pan } = this.spatial(opts);
    const volume = gain * (opts.volume ?? 1);
    if (volume < 0.01) return;
    const out = this.output(volume, pan);
    fn(this, out, this.ctx.currentTime, opts);
  }

  update(dt, { night, underwater }) {
    if (!this.ctx) return;
    if (this.windGain) this.windGain.gain.value = underwater ? 0.015 : night ? 0.035 : 0.05;
    if (!night) return;
    this.cricketTimer -= dt;
    if (this.cricketTimer <= 0) {
      this.cricketTimer = rand(0.8, 3.5);
      this.play('cricket', { volume: rand(0.15, 0.35) });
    }
  }
}

const SOUNDS = {
  swing(a, out, t) {
    a.noise(out, t, { dur: 0.22, attack: 0.05, gain: 0.25, type: 'bandpass', freq: 500, freqEnd: 1800, q: 0.8 });
  },
  hit_wood(a, out, t) {
    a.tone(out, t, { type: 'triangle', freq: rand(170, 210), freqEnd: 90, dur: 0.16, gain: 0.55 });
    a.noise(out, t, { dur: 0.12, gain: 0.4, type: 'bandpass', freq: 900, q: 1.5 });
  },
  hit_stone(a, out, t) {
    a.noise(out, t, { dur: 0.09, gain: 0.6, type: 'highpass', freq: 2200, q: 0.7 });
    a.tone(out, t, { type: 'square', freq: rand(900, 1200), freqEnd: 600, dur: 0.06, gain: 0.08 });
  },
  hit_metal(a, out, t) {
    a.tone(out, t, { type: 'triangle', freq: rand(1400, 1700), dur: 0.35, gain: 0.25 });
    a.tone(out, t, { type: 'sine', freq: rand(2600, 3000), dur: 0.25, gain: 0.12 });
    a.noise(out, t, { dur: 0.05, gain: 0.3, type: 'highpass', freq: 3000 });
  },
  hit_flesh(a, out, t) {
    a.noise(out, t, { dur: 0.14, gain: 0.55, type: 'lowpass', freq: 600, q: 1 });
    a.tone(out, t, { type: 'sine', freq: 120, freqEnd: 60, dur: 0.12, gain: 0.4 });
  },
  hit_ground(a, out, t) {
    a.noise(out, t, { dur: 0.12, gain: 0.35, type: 'lowpass', freq: 800 });
  },
  tree_fall(a, out, t) {
    a.noise(out, t, { dur: 1.4, attack: 0.3, gain: 0.35, type: 'lowpass', freq: 900, freqEnd: 200 });
    a.tone(out, t + 1.2, { type: 'sine', freq: 70, freqEnd: 35, dur: 0.6, gain: 0.7 });
    a.noise(out, t + 1.2, { dur: 0.5, gain: 0.5, type: 'lowpass', freq: 400 });
  },
  rock_break(a, out, t) {
    a.noise(out, t, { dur: 0.5, gain: 0.6, type: 'lowpass', freq: 1500, freqEnd: 300 });
    a.tone(out, t, { type: 'sine', freq: 90, freqEnd: 45, dur: 0.4, gain: 0.5 });
  },
  pickup(a, out, t) {
    a.noise(out, t, { dur: 0.12, gain: 0.3, type: 'bandpass', freq: 1400, q: 2 });
    a.tone(out, t + 0.02, { type: 'sine', freq: 660, freqEnd: 880, dur: 0.08, gain: 0.08 });
  },
  craft_start(a, out, t) {
    a.noise(out, t, { dur: 0.18, gain: 0.25, type: 'bandpass', freq: 700, q: 1.2 });
  },
  craft_done(a, out, t) {
    a.tone(out, t, { type: 'triangle', freq: 523, dur: 0.12, gain: 0.18 });
    a.tone(out, t + 0.09, { type: 'triangle', freq: 784, dur: 0.18, gain: 0.18 });
  },
  footstep(a, out, t, o) {
    const surface = o.surface || 'ground';
    if (surface === 'wood') a.tone(out, t, { type: 'triangle', freq: rand(110, 140), freqEnd: 70, dur: 0.08, gain: 0.25 });
    if (surface === 'water') {
      a.noise(out, t, { dur: 0.25, gain: 0.25, type: 'bandpass', freq: 900, q: 0.6 });
      return;
    }
    a.noise(out, t, { dur: 0.09, gain: surface === 'stone' ? 0.25 : 0.18, type: 'bandpass', freq: surface === 'stone' ? 2000 : rand(500, 800), q: 0.9 });
  },
  land(a, out, t) {
    a.noise(out, t, { dur: 0.15, gain: 0.4, type: 'lowpass', freq: 500 });
  },
  hurt(a, out, t) {
    a.tone(out, t, { type: 'sawtooth', freq: rand(180, 220), freqEnd: 110, dur: 0.22, gain: 0.18 });
    a.noise(out, t, { dur: 0.12, gain: 0.35, type: 'lowpass', freq: 500 });
  },
  death(a, out, t) {
    a.tone(out, t, { type: 'sawtooth', freq: 160, freqEnd: 50, dur: 1.1, gain: 0.25 });
    a.noise(out, t, { dur: 0.6, gain: 0.4, type: 'lowpass', freq: 400 });
  },
  bow_draw(a, out, t) {
    a.noise(out, t, { dur: 0.5, attack: 0.25, gain: 0.12, type: 'bandpass', freq: 300, freqEnd: 700, q: 4 });
  },
  bow_release(a, out, t) {
    a.tone(out, t, { type: 'triangle', freq: 140, freqEnd: 70, dur: 0.15, gain: 0.4 });
    a.noise(out, t, { dur: 0.15, gain: 0.25, type: 'highpass', freq: 1500 });
  },
  arrow_hit(a, out, t) {
    a.tone(out, t, { type: 'triangle', freq: 260, freqEnd: 120, dur: 0.1, gain: 0.3 });
  },
  gunshot(a, out, t) {
    a.noise(out, t, { dur: 0.28, attack: 0.002, gain: 1.0, type: 'lowpass', freq: 3500, freqEnd: 400 });
    a.tone(out, t, { type: 'sine', freq: 140, freqEnd: 40, dur: 0.22, gain: 0.8 });
  },
  shotgun(a, out, t) {
    a.noise(out, t, { dur: 0.45, attack: 0.002, gain: 1.0, type: 'lowpass', freq: 2500, freqEnd: 200 });
    a.tone(out, t, { type: 'sine', freq: 100, freqEnd: 30, dur: 0.35, gain: 1.0 });
  },
  rifle(a, out, t) {
    a.noise(out, t, { dur: 0.18, attack: 0.002, gain: 0.9, type: 'lowpass', freq: 4500, freqEnd: 600 });
    a.tone(out, t, { type: 'sine', freq: 160, freqEnd: 50, dur: 0.14, gain: 0.6 });
  },
  dry_fire(a, out, t) {
    a.tone(out, t, { type: 'square', freq: 1800, dur: 0.03, gain: 0.1 });
  },
  reload(a, out, t) {
    a.tone(out, t, { type: 'square', freq: 900, dur: 0.04, gain: 0.08 });
    a.noise(out, t + 0.35, { dur: 0.08, gain: 0.25, type: 'highpass', freq: 2500 });
    a.tone(out, t + 0.7, { type: 'square', freq: 1200, dur: 0.05, gain: 0.1 });
  },
  build_place(a, out, t) {
    a.noise(out, t, { dur: 0.25, gain: 0.45, type: 'lowpass', freq: 900 });
    a.tone(out, t, { type: 'triangle', freq: 150, freqEnd: 90, dur: 0.18, gain: 0.35 });
  },
  build_upgrade(a, out, t) {
    for (let i = 0; i < 3; i++) a.tone(out, t + i * 0.11, { type: 'triangle', freq: 180 + i * 40, freqEnd: 100, dur: 0.1, gain: 0.35 });
    a.noise(out, t + 0.3, { dur: 0.3, gain: 0.3, type: 'lowpass', freq: 1200 });
  },
  demolish(a, out, t) {
    a.noise(out, t, { dur: 0.8, gain: 0.6, type: 'lowpass', freq: 700, freqEnd: 150 });
  },
  deploy(a, out, t) {
    a.noise(out, t, { dur: 0.2, gain: 0.35, type: 'lowpass', freq: 600 });
  },
  door(a, out, t) {
    a.tone(out, t, { type: 'sawtooth', freq: 90, freqEnd: 130, dur: 0.35, gain: 0.08 });
    a.noise(out, t + 0.3, { dur: 0.12, gain: 0.3, type: 'lowpass', freq: 500 });
  },
  eat(a, out, t) {
    for (let i = 0; i < 3; i++) a.noise(out, t + i * 0.13, { dur: 0.08, gain: 0.3, type: 'bandpass', freq: rand(700, 1100), q: 1.5 });
  },
  drink(a, out, t) {
    for (let i = 0; i < 3; i++) a.tone(out, t + i * 0.16, { type: 'sine', freq: rand(300, 380), freqEnd: 600, dur: 0.1, gain: 0.15 });
  },
  bandage(a, out, t) {
    a.noise(out, t, { dur: 0.6, attack: 0.1, gain: 0.2, type: 'bandpass', freq: 1800, q: 0.7 });
  },
  syringe(a, out, t) {
    a.tone(out, t, { type: 'sine', freq: 1200, freqEnd: 900, dur: 0.15, gain: 0.08 });
    a.noise(out, t + 0.05, { dur: 0.1, gain: 0.15, type: 'highpass', freq: 3000 });
  },
  ui_click(a, out, t) {
    a.tone(out, t, { type: 'square', freq: 1400, dur: 0.025, gain: 0.05 });
  },
  ui_open(a, out, t) {
    a.noise(out, t, { dur: 0.12, gain: 0.18, type: 'bandpass', freq: 1200, q: 1 });
  },
  hitmarker(a, out, t) {
    a.tone(out, t, { type: 'square', freq: 2100, dur: 0.035, gain: 0.07 });
  },
  wolf_growl(a, out, t) {
    a.tone(out, t, { type: 'sawtooth', freq: 85, freqEnd: 70, dur: 0.6, attack: 0.08, gain: 0.25 });
    a.noise(out, t, { dur: 0.6, attack: 0.1, gain: 0.2, type: 'bandpass', freq: 300, q: 3 });
  },
  wolf_howl(a, out, t) {
    a.tone(out, t, { type: 'sine', freq: 420, freqEnd: 640, dur: 0.6, attack: 0.25, gain: 0.25 });
    a.tone(out, t + 0.6, { type: 'sine', freq: 640, freqEnd: 380, dur: 1.4, attack: 0.05, gain: 0.25 });
  },
  bear_roar(a, out, t) {
    a.tone(out, t, { type: 'sawtooth', freq: 70, freqEnd: 50, dur: 1.0, attack: 0.1, gain: 0.35 });
    a.noise(out, t, { dur: 1.0, attack: 0.15, gain: 0.35, type: 'bandpass', freq: 250, q: 2 });
  },
  animal_hurt(a, out, t) {
    a.tone(out, t, { type: 'sawtooth', freq: rand(300, 420), freqEnd: 180, dur: 0.25, gain: 0.18 });
  },
  npc_alert(a, out, t) {
    a.tone(out, t, { type: 'square', freq: 520, dur: 0.12, gain: 0.08 });
    a.tone(out, t + 0.15, { type: 'square', freq: 520, dur: 0.12, gain: 0.08 });
  },
  barrel_break(a, out, t) {
    a.tone(out, t, { type: 'triangle', freq: 300, freqEnd: 120, dur: 0.3, gain: 0.4 });
    a.noise(out, t, { dur: 0.3, gain: 0.5, type: 'highpass', freq: 1200 });
  },
  crate_open(a, out, t) {
    a.noise(out, t, { dur: 0.25, gain: 0.3, type: 'bandpass', freq: 500, q: 1 });
  },
  fire_light(a, out, t) {
    a.noise(out, t, { dur: 0.6, attack: 0.15, gain: 0.35, type: 'lowpass', freq: 1200, freqEnd: 400 });
  },
  recycler(a, out, t) {
    a.tone(out, t, { type: 'sawtooth', freq: 55, dur: 0.5, attack: 0.05, gain: 0.12 });
    a.noise(out, t, { dur: 0.4, gain: 0.15, type: 'bandpass', freq: 400, q: 2 });
  },
  cricket(a, out, t) {
    const f = rand(4200, 4800);
    for (let i = 0; i < 3; i++) a.tone(out, t + i * 0.07, { type: 'sine', freq: f, dur: 0.04, gain: 0.05 });
  },
  splash(a, out, t) {
    a.noise(out, t, { dur: 0.5, gain: 0.4, type: 'bandpass', freq: 800, freqEnd: 300, q: 0.5 });
  },
};
