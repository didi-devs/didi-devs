export type SfxName =
  | 'jump'
  | 'land'
  | 'slide'
  | 'laneChange'
  | 'coin'
  | 'powerupPickup'
  | 'powerupActivate'
  | 'powerupExpire'
  | 'uiClick'
  | 'collision'
  | 'milestone'
  | 'newHighScore'
  | 'nearMiss'
  | 'countdown'
  | 'go';

/**
 * All audio is synthesized procedurally via the Web Audio API so the game
 * ships with fully functional sound without external asset files. The
 * architecture (named cues + volume buses) is asset-file agnostic --
 * swapping in real recordings later only means loading AudioBuffers into
 * `sampleBuffers` and branching in `playSfx`.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private musicGain!: GainNode;
  private sfxGain!: GainNode;
  private masterGain!: GainNode;
  private musicNodes: { stop: () => void } | null = null;
  private unlocked = false;

  private musicVolume = 0.6;
  private sfxVolume = 0.8;
  private muted = false;

  init(): void {
    if (this.ctx) return;
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AC();
    this.masterGain = this.ctx.createGain();
    this.musicGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    this.musicGain.connect(this.masterGain);
    this.sfxGain.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);
    this.applyVolumes();

    const unlock = () => {
      this.resume();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('touchstart', unlock);
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    this.unlocked = true;
  }

  setMusicVolume(v: number): void {
    this.musicVolume = v;
    this.applyVolumes();
  }

  setSfxVolume(v: number): void {
    this.sfxVolume = v;
    this.applyVolumes();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const m = this.muted ? 0 : 1;
    this.musicGain.gain.setTargetAtTime(this.musicVolume * m, this.ctx.currentTime, 0.05);
    this.sfxGain.gain.setTargetAtTime(this.sfxVolume * m, this.ctx.currentTime, 0.05);
  }

  private now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  private envGain(duration: number, peak = 1, attack = 0.01): GainNode {
    const g = this.ctx!.createGain();
    const t0 = this.now();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    return g;
  }

  private tone(freq: number, duration: number, type: OscillatorType = 'sine', peak = 0.5): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.now());
    const g = this.envGain(duration, peak);
    osc.connect(g).connect(this.sfxGain);
    osc.start();
    osc.stop(this.now() + duration + 0.02);
  }

  private sweep(freqFrom: number, freqTo: number, duration: number, type: OscillatorType = 'sine', peak = 0.5): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freqFrom, this.now());
    osc.frequency.exponentialRampToValueAtTime(Math.max(freqTo, 1), this.now() + duration);
    const g = this.envGain(duration, peak);
    osc.connect(g).connect(this.sfxGain);
    osc.start();
    osc.stop(this.now() + duration + 0.02);
  }

  private noiseBurst(duration: number, peak = 0.4, filterFreq = 2000): void {
    if (!this.ctx) return;
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const g = this.envGain(duration, peak, 0.002);
    src.connect(filter).connect(g).connect(this.sfxGain);
    src.start();
  }

  playSfx(name: SfxName): void {
    if (!this.ctx) return;
    switch (name) {
      case 'jump':
        this.sweep(340, 640, 0.16, 'triangle', 0.4);
        break;
      case 'land':
        this.noiseBurst(0.12, 0.35, 900);
        this.tone(120, 0.1, 'sine', 0.3);
        break;
      case 'slide':
        this.noiseBurst(0.22, 0.25, 1400);
        break;
      case 'laneChange':
        this.tone(520, 0.07, 'triangle', 0.22);
        break;
      case 'coin':
        this.tone(880, 0.08, 'square', 0.18);
        this.tone(1320, 0.12, 'sine', 0.22);
        break;
      case 'powerupPickup':
        this.sweep(440, 880, 0.2, 'sawtooth', 0.25);
        break;
      case 'powerupActivate':
        this.sweep(220, 990, 0.35, 'sawtooth', 0.3);
        break;
      case 'powerupExpire':
        this.sweep(700, 240, 0.3, 'triangle', 0.2);
        break;
      case 'uiClick':
        this.tone(600, 0.05, 'square', 0.2);
        break;
      case 'collision':
        this.noiseBurst(0.4, 0.55, 500);
        this.sweep(180, 60, 0.35, 'sawtooth', 0.4);
        break;
      case 'milestone':
        this.tone(660, 0.1, 'sine', 0.25);
        this.tone(990, 0.15, 'sine', 0.2);
        break;
      case 'newHighScore':
        [523, 659, 784, 1046].forEach((f, i) => {
          setTimeout(() => this.tone(f, 0.25, 'triangle', 0.3), i * 90);
        });
        break;
      case 'nearMiss':
        this.tone(1400, 0.06, 'square', 0.15);
        break;
      case 'countdown':
        this.tone(440, 0.12, 'square', 0.25);
        break;
      case 'go':
        this.sweep(440, 1100, 0.3, 'sawtooth', 0.35);
        break;
    }
  }

  startMusic(): void {
    if (!this.ctx || this.musicNodes) return;
    const ctx = this.ctx;
    const bassOsc = ctx.createOscillator();
    bassOsc.type = 'sine';
    const bassGain = ctx.createGain();
    bassGain.gain.value = 0.18;
    bassOsc.connect(bassGain).connect(this.musicGain);

    const padOsc = ctx.createOscillator();
    padOsc.type = 'triangle';
    const padGain = ctx.createGain();
    padGain.gain.value = 0.06;
    padOsc.connect(padGain).connect(this.musicGain);

    const notes = [110, 110, 130.8, 98];
    let step = 0;
    bassOsc.frequency.setValueAtTime(notes[0], ctx.currentTime);
    padOsc.frequency.setValueAtTime(notes[0] * 2, ctx.currentTime);

    const interval = window.setInterval(() => {
      step = (step + 1) % notes.length;
      const t = ctx.currentTime;
      bassOsc.frequency.setTargetAtTime(notes[step], t, 0.08);
      padOsc.frequency.setTargetAtTime(notes[step] * 2, t, 0.08);
    }, 900);

    bassOsc.start();
    padOsc.start();

    this.musicNodes = {
      stop: () => {
        clearInterval(interval);
        bassOsc.stop();
        padOsc.stop();
      },
    };
  }

  stopMusic(): void {
    this.musicNodes?.stop();
    this.musicNodes = null;
  }

  get isUnlocked(): boolean {
    return this.unlocked;
  }
}
