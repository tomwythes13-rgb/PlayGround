/* Tiny synthesised audio engine — no asset downloads required. */

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOn = false;
    this.sirenOn = false;
    this.sirenPhase = 0;
    this.noise = null;
    this.lastCrash = 0;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      this.master.connect(this.ctx.destination);

      // Engine: saw + triangle through a lowpass
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = "lowpass";
      this.engineFilter.frequency.value = 520;
      this.engineFilter.Q.value = 1.2;
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = "sawtooth";
      this.engineOsc.frequency.value = 48;
      this.engineOsc2 = this.ctx.createOscillator();
      this.engineOsc2.type = "triangle";
      this.engineOsc2.frequency.value = 97;
      const engineSub = this.ctx.createGain();
      engineSub.gain.value = 0.45;
      this.engineOsc.connect(this.engineFilter);
      this.engineOsc2.connect(engineSub);
      engineSub.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();
      this.engineOsc2.start();

      // Siren: bandpassed square that wails between two tones
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.sirenFilter = this.ctx.createBiquadFilter();
      this.sirenFilter.type = "bandpass";
      this.sirenFilter.frequency.value = 1100;
      this.sirenFilter.Q.value = 3;
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = "square";
      this.sirenOsc.frequency.value = 720;
      this.sirenOsc.connect(this.sirenFilter);
      this.sirenFilter.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();

      this.noise = this.makeNoise(1.4);
    } catch {
      this.ctx = null;
    }
  }

  makeNoise(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.03 * white) / 1.03;
      data[i] = last * 2.4;
    }
    return buffer;
  }

  setMuted(on) {
    this.muted = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? 0 : 0.8, this.ctx.currentTime, 0.02);
  }

  setEngine(active, ratio = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const target = active ? 0.035 + ratio * 0.055 : 0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.09);
    this.engineOsc.frequency.setTargetAtTime(46 + ratio * 130, t, 0.07);
    this.engineOsc2.frequency.setTargetAtTime(92 + ratio * 240, t, 0.07);
    this.engineFilter.frequency.setTargetAtTime(380 + ratio * 620, t, 0.1);
  }

  setSiren(active) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (active !== this.sirenOn) {
      this.sirenOn = active;
      this.sirenGain.gain.setTargetAtTime(active ? 0.012 : 0, t, 0.15);
    }
    if (active) {
      this.sirenPhase += 0.016;
      const wail = Math.sin(this.sirenPhase * 2.2) > 0;
      this.sirenOsc.frequency.setTargetAtTime(wail ? 850 : 660, t, 0.03);
    }
  }

  crash(strength = 1) {
    if (!this.ctx || !this.noise) return;
    const t = this.ctx.currentTime;
    if (t - this.lastCrash < 0.06) return;
    this.lastCrash = t;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 380 + strength * 900;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(Math.min(0.5, 0.12 + strength * 0.28), t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t, Math.random() * 0.4, 0.38);
  }

  blip(kind = "steal") {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const notes = kind === "steal" ? [440, 660, 880] : kind === "wreck" ? [320, 220] : [520, 780];
    notes.forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.08);
      g.gain.linearRampToValueAtTime(0.11, t + i * 0.08 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.08 + 0.16);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t + i * 0.08);
      osc.stop(t + i * 0.08 + 0.18);
    });
  }

  sting(kind = "win") {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const seq = kind === "win" ? [392, 523, 659, 784, 1047] : [330, 262, 208, 156];
    seq.forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = kind === "win" ? "sawtooth" : "triangle";
      osc.frequency.value = f;
      const at = t + i * (kind === "win" ? 0.1 : 0.16);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(kind === "win" ? 0.09 : 0.12, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.42);
      osc.connect(g);
      g.connect(this.master);
      osc.start(at);
      osc.stop(at + 0.45);
    });
  }

  stopAll() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(0, t, 0.06);
    this.sirenGain.gain.setTargetAtTime(0, t, 0.06);
    this.sirenOn = false;
  }
}
