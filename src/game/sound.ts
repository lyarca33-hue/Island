/**
 * Sons du jeu, fabriqués à la volée (Web Audio, sans fichier) : le grésillement d'une poêle,
 * l'eau qui bout, le bip du four et du micro-ondes, la vaisselle qui tinte, le verre qui casse ;
 * la chasse d'eau ; et l'ambiance : les pas, les oiseaux le jour, les grillons la nuit, la pluie. Coupables dans le menu (Affichage), réglage gardé dans le navigateur.
 *
 * Le navigateur ne laisse jouer un son qu'après un geste du joueur : le contexte audio naît au
 * premier clic ou à la première touche.
 */

const KEY = 'island-sons';

export type SoundName = 'bip' | 'ding' | 'tinte' | 'casse' | 'verse' | 'pas' | 'pas-herbe' | 'chasse';

/** Ambiance continue, de 0 à 1 (distance et murs déjà comptés), donnée à chaque image. */
export interface Ambience {
  /** Oiseaux (le jour) et grillons (la nuit). */
  oiseaux: number;
  grillons: number;
  /** Pluie qu'on entend ; `dedans` l'assourdit (toit et murs). */
  pluie: number;
  dedans: boolean;
}

type Loop = { gain: GainNode; filter: BiquadFilterNode };

export class KitchenSound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private sizzle: { gain: GainNode; filter: BiquadFilterNode } | null = null;
  private boil: { gain: GainNode; filter: BiquadFilterNode } | null = null;
  private rainLoop: Loop | null = null;
  private crackle = 0;
  private bubble = 0;
  private chirp = 1;
  private cricket = 0.5;
  private drop = 0;
  private _rain = 0;
  private _on: boolean;
  private _volume: number;
  /** Ce qui a joué (les derniers sons, avec leur heure) : pour le banc de test et le débogage. */
  readonly log: Array<{ name: string; at: number }> = [];
  /** Niveau des sons continus en cours (0 à 1). */
  levels = { gresille: 0, bout: 0, oiseaux: 0, grillons: 0, pluie: 0 };

  constructor() {
    let saved: { on?: boolean; volume?: number } = {};
    try {
      saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    } catch {
      // stockage indisponible : réglage par défaut
    }
    this._on = saved.on ?? true;
    this._volume = saved.volume ?? 0.6;
    const wake = () => {
      this.ensure();
      if (this.ctx?.state === 'suspended') void this.ctx.resume();
    };
    window.addEventListener('pointerdown', wake, { passive: true });
    window.addEventListener('keydown', wake);
  }

  get on(): boolean {
    return this._on;
  }
  set on(v: boolean) {
    this._on = v;
    this.apply();
  }
  get volume(): number {
    return this._volume;
  }
  set volume(v: number) {
    this._volume = Math.min(1, Math.max(0, v));
    this.apply();
  }

  /** Pluie qui tombe dehors, de 0 (rien) à 1 (averse) : la météo la règle. */
  get rain(): number {
    return this._rain;
  }
  setRain(level: number): void {
    this._rain = Math.min(1, Math.max(0, level));
  }

  private apply(): void {
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this._on ? this._volume : 0, this.ctx.currentTime, 0.05);
    try {
      localStorage.setItem(KEY, JSON.stringify({ on: this._on, volume: this._volume }));
    } catch {
      // stockage indisponible : réglage pour cette partie seulement
    }
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    const ctx = (this.ctx = new Ctx());
    this.master = ctx.createGain();
    this.master.gain.value = this._on ? this._volume : 0;
    this.master.connect(ctx.destination);
    // deux secondes de bruit blanc, rejouées en boucle par les sons continus
    const buf = (this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate));
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const loop = (type: BiquadFilterType, freq: number, q: number): Loop => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      filter.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.master!);
      src.start();
      return { gain, filter };
    };
    this.sizzle = loop('highpass', 3200, 0.7);
    this.boil = loop('lowpass', 420, 1.2);
    this.rainLoop = loop('bandpass', 1800, 0.35);
    return ctx;
  }

  /**
   * Sons continus, à chaque image : `gresille` (poêles qui cuisent) et `bout` (eau qui bout), de 0
   * à 1, déjà atténués par la distance.
   */
  update(dt: number, gresille: number, bout: number): void {
    this.levels = { ...this.levels, gresille, bout };
    const ctx = this.ctx;
    if (!ctx || !this.sizzle || !this.boil) return;
    const t = ctx.currentTime;
    // le grésillement crépite : son volume saute un peu au hasard
    this.crackle -= dt;
    if (this.crackle <= 0) {
      this.crackle = 0.03 + Math.random() * 0.08;
      this.sizzle.gain.gain.setTargetAtTime(gresille * (0.12 + Math.random() * 0.12), t, 0.015);
    }
    // l'eau qui bout : des bulles, un grondement sourd qui monte et descend
    this.bubble -= dt;
    if (this.bubble <= 0) {
      this.bubble = 0.06 + Math.random() * 0.12;
      this.boil.gain.gain.setTargetAtTime(bout * (0.25 + Math.random() * 0.35), t, 0.03);
      this.boil.filter.frequency.setTargetAtTime(300 + Math.random() * 350, t, 0.03);
      if (bout > 0.2 && Math.random() < 0.5) this.blip(180 + Math.random() * 260, 0.05, bout * 0.08);
    }
  }

  /** Ambiance continue, à chaque image (voir `Ambience`). */
  ambient(dt: number, a: Ambience): void {
    this.levels = { ...this.levels, oiseaux: a.oiseaux, grillons: a.grillons, pluie: a.pluie };
    const ctx = this.ctx;
    if (!ctx || !this.rainLoop) return;
    const t = ctx.currentTime;
    // la pluie : un bruissement large, étouffé et plus grave à l'intérieur, et des gouttes
    this.rainLoop.gain.gain.setTargetAtTime(a.pluie * (a.dedans ? 0.12 : 0.22), t, 0.3);
    this.rainLoop.filter.frequency.setTargetAtTime(a.dedans ? 700 : 1800, t, 0.3);
    this.drop -= dt;
    if (this.drop <= 0) {
      this.drop = 0.02 + Math.random() * 0.12 / Math.max(0.2, a.pluie);
      if (a.pluie > 0.05 && !a.dedans) this.blip(1400 + Math.random() * 1800, 0.025, a.pluie * 0.03);
    }
    // les oiseaux : une petite phrase de deux à cinq notes qui glissent, de temps en temps
    this.chirp -= dt;
    if (this.chirp <= 0) {
      this.chirp = 0.6 + Math.random() * 2.5;
      if (a.oiseaux > 0.02) {
        const n = 2 + Math.floor(Math.random() * 4);
        const base = 2600 + Math.random() * 1800;
        const v = a.oiseaux * (0.035 + Math.random() * 0.03);
        for (let i = 0; i < n; i++) this.slide('sine', base * (0.9 + Math.random() * 0.2), base * (1.15 + Math.random() * 0.35), 0.07, v, t + i * (0.09 + Math.random() * 0.05));
      }
    }
    // les grillons : trois stridulations aiguës, régulières
    this.cricket -= dt;
    if (this.cricket <= 0) {
      this.cricket = 0.45 + Math.random() * 0.35;
      if (a.grillons > 0.02) {
        const f = 4300 + Math.random() * 300;
        for (let i = 0; i < 3; i++) this.tone('sine', f, t + i * 0.055, 0.04, a.grillons * 0.03);
      }
    }
  }

  /** Un son ponctuel ; `volume` 0 à 1 (la distance déjà comprise). */
  play(name: SoundName, volume = 1): void {
    this.log.push({ name, at: performance.now() });
    if (this.log.length > 50) this.log.shift();
    const ctx = this.ctx;
    if (!ctx || volume <= 0.01) return;
    const t = ctx.currentTime;
    if (name === 'bip') {
      // trois bips aigus : le four ou le micro-ondes a fini
      for (let i = 0; i < 3; i++) this.tone('square', 1850, t + i * 0.22, 0.12, 0.08 * volume);
    } else if (name === 'ding') {
      this.tone('sine', 1320, t, 0.9, 0.22 * volume);
      this.tone('sine', 2640, t, 0.5, 0.06 * volume);
    } else if (name === 'tinte') {
      // vaisselle posée : deux harmoniques métalliques très courtes, un peu au hasard
      const f = 2100 + Math.random() * 900;
      this.tone('sine', f, t, 0.18, 0.09 * volume);
      this.tone('sine', f * 1.51, t, 0.12, 0.05 * volume);
    } else if (name === 'casse') {
      this.burst(t, 0.35, 2600, 0.5 * volume);
      for (let i = 0; i < 4; i++) this.tone('sine', 2500 + Math.random() * 3000, t + Math.random() * 0.15, 0.1, 0.05 * volume);
    } else if (name === 'verse') {
      this.burst(t, 1.2, 900, 0.08 * volume);
    } else if (name === 'pas') {
      // un pas sur le parquet ou le carrelage : un choc sourd et un léger claquement
      this.tone('sine', 85 + Math.random() * 25, t, 0.08, 0.12 * volume);
      this.burst(t, 0.05, 1400 + Math.random() * 600, 0.05 * volume);
    } else if (name === 'pas-herbe') {
      // dans l'herbe : un froissement doux
      this.burst(t, 0.12, 2400 + Math.random() * 800, 0.035 * volume);
    } else if (name === 'chasse') {
      // la chasse d'eau : l'eau qui se rue (un souffle qui monte puis retombe), puis le réservoir qui gargouille
      this.sweep(t, 2.6, 350, 1300, 0.3 * volume);
      for (let i = 0; i < 6; i++) this.blipAt(t + 1.6 + Math.random() * 1.6, 150 + Math.random() * 200, 0.08, 0.05 * volume);
    }
  }

  /** Un souffle d'eau qui enfle puis retombe, son filtre glissant de `from` à `to` (chasse d'eau). */
  private sweep(at: number, len: number, from: number, to: number, peak: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.8;
    filter.frequency.setValueAtTime(from, at);
    filter.frequency.exponentialRampToValueAtTime(to, at + len * 0.3);
    filter.frequency.exponentialRampToValueAtTime(from * 0.8, at + len);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + 0.25);
    gain.gain.setValueAtTime(peak, at + len * 0.4);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + len);
    src.connect(filter).connect(gain).connect(this.master!);
    src.start(at);
    src.stop(at + len + 0.05);
  }

  private tone(type: OscillatorType, freq: number, at: number, len: number, peak: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(peak, at + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + len);
    osc.connect(gain).connect(this.master!);
    osc.start(at);
    osc.stop(at + len + 0.05);
  }

  /** Une note qui glisse de `from` à `to` (chant d'oiseau). */
  private slide(type: OscillatorType, from: number, to: number, len: number, peak: number, at = this.ctx!.currentTime): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(to, at + len);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(peak, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + len);
    osc.connect(gain).connect(this.master!);
    osc.start(at);
    osc.stop(at + len + 0.05);
  }

  /** Une bulle qui éclate : une note grave qui glisse vers le haut. */
  private blip(freq: number, len: number, peak: number): void {
    this.blipAt(this.ctx!.currentTime, freq, len, peak);
  }

  private blipAt(t: number, freq: number, len: number, peak: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 2.2, t + len);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(peak, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + len);
    osc.connect(gain).connect(this.master!);
    osc.start(t);
    osc.stop(t + len + 0.02);
  }

  /** Un éclat de bruit filtré (verre brisé, eau versée). */
  private burst(at: number, len: number, freq: number, peak: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(peak, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + len);
    src.connect(filter).connect(gain).connect(this.master!);
    src.start(at);
    src.stop(at + len + 0.05);
  }
}
