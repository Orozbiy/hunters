/* ============================================================
   ҮН СИСТЕМАСЫ — Web Audio менен, бир дагы аудио файлсыз.
   Баары коддон жаратылат: музыка, табият үндөрү, эффекттер.

   Режимдер:
     'menu'  — жай, тынч пад
     'day'   — күндүз: куштар, шамал, жеңил музыка
     'night' — ТҮН: коркунучтуу дрон, жүрөк кагуу, шыбыш, кыйкырык

   Колдонулушу:
     audio.start()            // оюнчу баскычты басканда (браузер талабы)
     audio.setMode('night')
     audio.sfx('bowRelease')
     audio.setTension(0..1)   // коркунуч канчалык жакын
   ============================================================ */

const SCALE = [0, 3, 5, 7, 10];          // минор пентатоника
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class Audio {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.mode = 'none';
    this.tension = 0;
    this._timer = null;
    this._next = 0;
    this._beat = 0;
    this._heart = 0;
    this._amb = {};
  }

  /* --- Браузер талабы: биринчи басуудан кийин гана ачылат --- */
  async start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    if (this.ctx.state === 'suspended') { try { await this.ctx.resume(); } catch { /* кийин */ } }

    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(c.destination);

    /* жумшак лимитер — үндөр кагышып кетпеси үчүн */
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 7;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.2;
    this.comp.connect(this.master);

    this.musicBus = c.createGain(); this.musicBus.gain.value = 0.5; this.musicBus.connect(this.comp);
    this.ambBus   = c.createGain(); this.ambBus.gain.value = 0.45;  this.ambBus.connect(this.comp);
    this.sfxBus   = c.createGain(); this.sfxBus.gain.value = 0.95;  this.sfxBus.connect(this.comp);

    /* reverb ордуна — жөнөкөй кайталоо (delay) */
    this.delay = c.createDelay(1.0);
    this.delay.delayTime.value = 0.26;
    this.fb = c.createGain(); this.fb.gain.value = 0.3;
    this.dlyLP = c.createBiquadFilter(); this.dlyLP.type = 'lowpass'; this.dlyLP.frequency.value = 2200;
    this.delay.connect(this.dlyLP); this.dlyLP.connect(this.fb); this.fb.connect(this.delay);
    this.delay.connect(this.comp);

    this.noiseBuf = this._makeNoise(2.0);
    this.ready = true;
    this._startScheduler();
  }

  _makeNoise(sec) {
    const c = this.ctx;
    const b = c.createBuffer(1, Math.floor(c.sampleRate * sec), c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  setTension(t) { this.tension = Math.max(0, Math.min(1, t)); }

  /* ============================================================
     ЖАРДАМЧЫЛАР
     ============================================================ */
  _osc(type, freq, t0, dur, gain, dest, detune = 0) {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (detune) o.detune.value = detune;
    g.gain.setValueAtTime(0.0001, t0);
    o.connect(g); g.connect(dest || this.sfxBus);
    o.start(t0);
    o.stop(t0 + dur + 0.1);
    return { o, g };
  }

  /* кыска нота: тез чыгып, акырын өчөт */
  _ping(freq, t0, dur, gain, type = 'triangle', dest) {
    const { o, g } = this._osc(type, freq, t0, dur, gain, dest);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    return o;
  }

  /* ызы-чуу (шамал, кадам, кырсылдоо) */
  _noise(t0, dur, gain, filterType, freq, Q = 1, dest) {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    const f = c.createBiquadFilter();
    f.type = filterType; f.frequency.value = freq; f.Q.value = Q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(dest || this.sfxBus);
    s.start(t0); s.stop(t0 + dur + 0.05);
    return { s, f, g };
  }

  /* ============================================================
     РЕЖИМ АЛМАШТЫРУУ
     ============================================================ */
  setMode(mode) {
    if (!this.ready || this.mode === mode) return;
    const prev = this.mode;
    this.mode = mode;
    this._beat = 0;
    this._next = this.ctx.currentTime + 0.1;

    this._stopAmbience();
    if (mode === 'day' || mode === 'menu') this._dayAmbience();
    if (mode === 'night') this._nightAmbience();

    /* күндүзгө кайтканда дрон жок болот */
    void prev;
  }

  _stopAmbience() {
    const c = this.ctx;
    for (const k of Object.keys(this._amb)) {
      const n = this._amb[k];
      try {
        if (n.g) n.g.gain.setTargetAtTime(0.0001, c.currentTime, 0.4);
        setTimeout(() => { try { n.s && n.s.stop(); } catch { /* бүткөн */ } }, 1600);
      } catch { /* ok */ }
    }
    this._amb = {};
  }

  /* --- Күндүзгү шамал --- */
  _dayAmbience() {
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 480; f.Q.value = 0.7;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.045, t + 2);
    /* шамал күчөп-басаңдайт */
    const lfo = c.createOscillator(); lfo.frequency.value = 0.07;
    const lfoG = c.createGain(); lfoG.gain.value = 260;
    lfo.connect(lfoG); lfoG.connect(f.frequency);
    lfo.start(t);
    s.connect(f); f.connect(g); g.connect(this.ambBus);
    s.start(t);
    this._amb.wind = { s, g, lfo };
  }

  /* --- ТҮНКҮ КОРКУНУЧ: дрон + жогорку чыңалуу --- */
  _nightAmbience() {
    const c = this.ctx, t = c.currentTime;

    /* 1. Төмөнкү дрон — эки ооз бир аз айырмаланат, "жылып" турат */
    const dg = c.createGain(); dg.gain.setValueAtTime(0.0001, t);
    dg.gain.exponentialRampToValueAtTime(0.16, t + 3);
    const dlp = c.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 220; dlp.Q.value = 3;
    dg.connect(this.ambBus);
    dlp.connect(dg);
    const oscs = [];
    for (const [f0, det] of [[41.2, 0], [41.2, 11], [61.7, -7]]) {
      const o = c.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = f0; o.detune.value = det;
      o.connect(dlp); o.start(t);
      oscs.push(o);
    }
    /* фильтр жай ачылып-жабылат — "дем алган" сыяктуу */
    const lfo = c.createOscillator(); lfo.frequency.value = 0.045;
    const lfoG = c.createGain(); lfoG.gain.value = 110;
    lfo.connect(lfoG); lfoG.connect(dlp.frequency); lfo.start(t);
    this._amb.drone = { g: dg, oscs, lfo, s: oscs[0] };

    /* 2. Жогорку чыңалуу (мителий жука сызык) */
    const hg = c.createGain(); hg.gain.setValueAtTime(0.0001, t);
    hg.gain.exponentialRampToValueAtTime(0.012, t + 5);
    hg.connect(this.ambBus);
    const h1 = c.createOscillator(); h1.type = 'sine'; h1.frequency.value = 1245;
    const h2 = c.createOscillator(); h2.type = 'sine'; h2.frequency.value = 1318;  // кичине секунда — кулакка жагымсыз
    h1.connect(hg); h2.connect(hg); h1.start(t); h2.start(t);
    this._amb.high = { g: hg, s: h1, oscs: [h1, h2] };

    /* 3. Түнкү шамал — төмөнүрөөк, калыңыраак */
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 340; f.Q.value = 1;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.075, t + 2);
    const wl = c.createOscillator(); wl.frequency.value = 0.05;
    const wlG = c.createGain(); wlG.gain.value = 170;
    wl.connect(wlG); wlG.connect(f.frequency); wl.start(t);
    s.connect(f); f.connect(g); g.connect(this.ambBus);
    s.start(t);
    this._amb.nwind = { s, g, lfo: wl };
  }

  /* ============================================================
     МУЗЫКА ПЛАНИРОВЩИГИ
     ============================================================ */
  _startScheduler() {
    if (this._timer) return;
    this._timer = setInterval(() => this._schedule(), 45);
  }

  _schedule() {
    if (!this.ready || this.muted) return;
    const c = this.ctx;
    const look = c.currentTime + 0.35;

    while (this._next < look) {
      const t = this._next;
      if (this.mode === 'day' || this.mode === 'menu') this._dayBeat(t, this._beat);
      else if (this.mode === 'night') this._nightBeat(t, this._beat);
      this._beat++;
      this._next += this.mode === 'night' ? 0.44 : 0.42;
    }
  }

  /* --- Күндүзгү музыка: жумшак, сейрек --- */
  _dayBeat(t, b) {
    const bar = Math.floor(b / 8);
    const step = b % 8;

    /* пад — ар 8 кадамда алмашат */
    if (step === 0) {
      const roots = [45, 50, 43, 48];
      const root = roots[bar % 4];
      for (const iv of [0, 7, 12]) {
        const { o, g } = this._osc('triangle', midi(root + iv), t, 3.4, 0.05, this.musicBus,
          (Math.random() - 0.5) * 9);
        g.gain.linearRampToValueAtTime(0.045, t + 1.2);
        g.gain.linearRampToValueAtTime(0.0001, t + 3.4);
        o.detune.value += 0;
      }
    }

    /* тамчылаган мелодия */
    if (step % 2 === 0 && Math.random() > 0.35) {
      const oct = Math.random() > 0.7 ? 12 : 0;
      const n = 69 + SCALE[(Math.random() * SCALE.length) | 0] + oct;
      const o = this._ping(midi(n), t, 1.1, 0.055, 'triangle', this.musicBus);
      const send = this.ctx.createGain(); send.gain.value = 0.3;
      o.connect(send); send.connect(this.delay);
    }

    /* кушчалар — музыкадан эмес, табияттан */
    if (Math.random() > 0.93) this._bird(t + Math.random() * 0.3);
  }

  _bird(t) {
    const c = this.ctx;
    const n = 2 + ((Math.random() * 3) | 0);
    const base = 2200 + Math.random() * 1600;
    for (let i = 0; i < n; i++) {
      const tt = t + i * 0.07;
      const o = c.createOscillator(); o.type = 'sine';
      const g = c.createGain();
      o.frequency.setValueAtTime(base, tt);
      o.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.5), tt + 0.05);
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.exponentialRampToValueAtTime(0.03, tt + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.06);
      o.connect(g); g.connect(this.ambBus);
      o.start(tt); o.stop(tt + 0.1);
    }
  }

  /* --- ТҮНКҮ МУЗЫКА: жүрөк кагуу + коркунучтуу үндөр --- */
  _nightBeat(t, b) {
    /* 1. Жүрөк кагуу — коркунуч жакындаган сайын тездейт */
    const rate = 1.4 - this.tension * 0.85;        // секунд
    this._heart -= 0.44;
    if (this._heart <= 0) {
      this._heart = rate;
      this._thump(t, 0.16 + this.tension * 0.14);
      this._thump(t + 0.17, 0.11 + this.tension * 0.1);
    }

    /* 2. Сейрек, жагымсыз нота */
    if (b % 16 === 0) {
      const root = [38, 37, 40, 36][(b / 16) % 4 | 0];
      for (const iv of [0, 1, 13]) {               // кичине секунда — коркунучтуу
        const { o, g } = this._osc('sawtooth', midi(root + iv), t, 5.0, 0.03, this.musicBus,
          (Math.random() - 0.5) * 14);
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 500;
        g.disconnect(); g.connect(lp); lp.connect(this.musicBus);
        g.gain.linearRampToValueAtTime(0.028, t + 2.2);
        g.gain.linearRampToValueAtTime(0.0001, t + 5.0);
        void o;
      }
    }

    /* 3. Кокустан чыккан үндөр: бутак сынуу, алыскы үшкүрүк, үкү */
    if (Math.random() > 0.955) this._twig(t);
    if (Math.random() > 0.975) this._distantGrowl(t);
    if (Math.random() > 0.985) this._owl(t);

    /* 4. Коркунуч жогору болсо — шыбыш */
    if (this.tension > 0.6 && Math.random() > 0.9) this._whisper(t);
  }

  _thump(t, gain) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'sine';
    const g = c.createGain();
    o.frequency.setValueAtTime(78, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.14);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g); g.connect(this.comp);
    o.start(t); o.stop(t + 0.35);
  }

  _twig(t) { this._noise(t, 0.09, 0.07, 'bandpass', 2400 + Math.random() * 1500, 6, this.ambBus); }

  _owl(t) {
    const c = this.ctx;
    for (let i = 0; i < 2; i++) {
      const tt = t + i * 0.38;
      const o = c.createOscillator(); o.type = 'sine';
      const g = c.createGain();
      o.frequency.setValueAtTime(420, tt);
      o.frequency.exponentialRampToValueAtTime(330, tt + 0.22);
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.exponentialRampToValueAtTime(0.035, tt + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.3);
      o.connect(g); g.connect(this.ambBus);
      o.start(tt); o.stop(tt + 0.35);
    }
  }

  _distantGrowl(t) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'sawtooth';
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300;
    const g = c.createGain();
    o.frequency.setValueAtTime(70 + Math.random() * 25, t);
    o.frequency.linearRampToValueAtTime(48, t + 1.1);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    o.connect(lp); lp.connect(g); g.connect(this.ambBus);
    o.start(t); o.stop(t + 1.3);
  }

  _whisper(t) {
    const n = this._noise(t, 0.6, 0.02, 'bandpass', 1100 + Math.random() * 900, 12, this.ambBus);
    n.f.frequency.linearRampToValueAtTime(700, t + 0.6);
  }

  /* ============================================================
     ЭФФЕКТТЕР
     ============================================================ */
  sfx(name, opt = {}) {
    if (!this.ready || this.muted) return;
    const c = this.ctx, t = c.currentTime + 0.001;
    const v = opt.vol ?? 1;

    switch (name) {

      /* --- Түн кирди: чоң коркунучтуу сокку --- */
      case 'nightfall': {
        /* көтөрүлүү */
        const ns = this._noise(t, 1.5, 0.0001, 'highpass', 900, 1, this.comp);
        ns.g.gain.cancelScheduledValues(t);
        ns.g.gain.setValueAtTime(0.0001, t);
        ns.g.gain.exponentialRampToValueAtTime(0.16, t + 1.4);
        ns.g.gain.exponentialRampToValueAtTime(0.0001, t + 1.75);
        /* сокку */
        const h = t + 1.4;
        const o = c.createOscillator(); o.type = 'sine';
        const g = c.createGain();
        o.frequency.setValueAtTime(260, h);
        o.frequency.exponentialRampToValueAtTime(32, h + 1.1);
        g.gain.setValueAtTime(0.0001, h);
        g.gain.exponentialRampToValueAtTime(0.5, h + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, h + 1.8);
        o.connect(g); g.connect(this.comp);
        o.start(h); o.stop(h + 2);
        this._noise(h, 0.8, 0.22, 'lowpass', 700, 1, this.comp);
        /* кыйкырган струналар */
        for (const f of [880, 932, 1245]) {
          const { o: so, g: sg } = this._osc('sawtooth', f, h, 2.2, 0.05, this.comp);
          sg.gain.exponentialRampToValueAtTime(0.05, h + 0.05);
          sg.gain.exponentialRampToValueAtTime(0.0001, h + 2.2);
          so.frequency.linearRampToValueAtTime(f * 0.94, h + 2.2);
        }
        break;
      }

      /* --- Вендигонун кыйкырыгы --- */
      case 'wendigoRoar': {
        const o = c.createOscillator(); o.type = 'sawtooth';
        const lp = c.createBiquadFilter(); lp.type = 'lowpass';
        lp.frequency.setValueAtTime(1600, t);
        lp.frequency.exponentialRampToValueAtTime(260, t + 1.6);
        const g = c.createGain();
        o.frequency.setValueAtTime(210, t);
        o.frequency.exponentialRampToValueAtTime(62, t + 1.5);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.34 * v, t + 0.08);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
        o.connect(lp); lp.connect(g); g.connect(this.comp);
        o.start(t); o.stop(t + 1.8);
        this._noise(t, 1.2, 0.1 * v, 'bandpass', 500, 2, this.comp);
        break;
      }

      /* --- Жаа --- */
      case 'bowDraw': {
        const n = this._noise(t, 0.75, 0.05 * v, 'bandpass', 700, 8);
        n.f.frequency.setValueAtTime(600, t);
        n.f.frequency.linearRampToValueAtTime(1500, t + 0.7);
        break;
      }
      case 'bowRelease': {
        this._noise(t, 0.12, 0.3 * v, 'bandpass', 1600, 3);
        const o = this._ping(220, t, 0.18, 0.18 * v, 'triangle');
        o.frequency.exponentialRampToValueAtTime(120, t + 0.18);
        break;
      }
      case 'whoosh': {
        const n = this._noise(t, 0.3, 0.11 * v, 'bandpass', 1200, 4);
        n.f.frequency.setValueAtTime(2200, t);
        n.f.frequency.exponentialRampToValueAtTime(500, t + 0.3);
        break;
      }
      case 'hitFlesh': {
        this._noise(t, 0.2, 0.3 * v, 'lowpass', 500, 1);
        const o = this._ping(130, t, 0.22, 0.25 * v, 'sine');
        o.frequency.exponentialRampToValueAtTime(55, t + 0.22);
        break;
      }
      case 'hitWood': {
        this._noise(t, 0.1, 0.18 * v, 'bandpass', 900, 5);
        this._ping(330, t, 0.1, 0.1 * v, 'square');
        break;
      }

      /* --- Бугу --- */
      case 'eat': {
        for (let i = 0; i < 3; i++) {
          this._noise(t + i * 0.1 + Math.random() * 0.03, 0.07, 0.12 * v,
            'bandpass', 1500 + Math.random() * 1200, 7);
        }
        break;
      }
      case 'growl': {
        const o = c.createOscillator(); o.type = 'sawtooth';
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240;
        const g = c.createGain();
        o.frequency.setValueAtTime(58, t);
        o.frequency.linearRampToValueAtTime(44, t + 0.9);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.14 * v, t + 0.15);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
        /* кекиртектей титирөө */
        const lfo = c.createOscillator(); lfo.frequency.value = 17;
        const lg = c.createGain(); lg.gain.value = 12;
        lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + 1);
        o.connect(lp); lp.connect(g); g.connect(this.sfxBus);
        o.start(t); o.stop(t + 1.1);
        break;
      }
      case 'fart': {
        const o = c.createOscillator(); o.type = 'sawtooth';
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
        const g = c.createGain();
        o.frequency.setValueAtTime(120, t);
        o.frequency.linearRampToValueAtTime(65, t + 0.45);
        const lfo = c.createOscillator(); lfo.frequency.value = 26;
        const lg = c.createGain(); lg.gain.value = 45;
        lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + 0.5);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.2 * v, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        o.connect(lp); lp.connect(g); g.connect(this.sfxBus);
        o.start(t); o.stop(t + 0.55);
        break;
      }
      case 'jump':  this._ping(400, t, 0.12, 0.07 * v, 'sine'); break;
      case 'land':  this._noise(t, 0.1, 0.1 * v, 'lowpass', 300, 1); break;

      /* кадам: бугунун туягы / мергенчинин өтүгү */
      case 'stepHoof': {
        this._noise(t, 0.07, 0.055 * v, 'bandpass', 420 + Math.random() * 180, 4);
        this._ping(150 + Math.random() * 40, t, 0.05, 0.035 * v, 'sine');
        break;
      }
      case 'stepBoot':
        this._noise(t, 0.09, 0.05 * v, 'lowpass', 900 + Math.random() * 400, 1);
        break;

      /* --- Мергенчи --- */
      case 'camPlace': {
        this._ping(880, t, 0.06, 0.1 * v, 'square');
        this._ping(1320, t + 0.07, 0.07, 0.08 * v, 'square');
        break;
      }
      case 'camAlert': {
        for (let i = 0; i < 3; i++) this._ping(1760, t + i * 0.12, 0.08, 0.1 * v, 'square');
        break;
      }
      case 'wrongShot': {
        const o = this._ping(300, t, 0.9, 0.16 * v, 'sawtooth');
        o.frequency.exponentialRampToValueAtTime(95, t + 0.9);
        this._noise(t, 0.5, 0.07 * v, 'lowpass', 600, 1);
        break;
      }
      case 'rightShot': {
        [660, 880, 1320].forEach((f, i) => this._ping(f, t + i * 0.09, 0.3, 0.1 * v, 'triangle'));
        break;
      }

      /* --- Раунд --- */
      case 'roundStart': {
        [392, 523, 659].forEach((f, i) => this._ping(f, t + i * 0.12, 0.5, 0.1 * v, 'triangle', this.musicBus));
        break;
      }
      case 'cageOpen': {
        this._noise(t, 0.4, 0.14 * v, 'bandpass', 500, 3);
        const o = this._ping(180, t, 0.6, 0.14 * v, 'sawtooth');
        o.frequency.linearRampToValueAtTime(110, t + 0.6);
        break;
      }
      case 'death': {
        const o = this._ping(330, t, 1.6, 0.22 * v, 'sawtooth');
        o.frequency.exponentialRampToValueAtTime(48, t + 1.6);
        this._noise(t, 0.9, 0.13 * v, 'lowpass', 500, 1);
        break;
      }
      case 'win': {
        [523, 659, 784, 1047].forEach((f, i) =>
          this._ping(f, t + i * 0.13, 0.9, 0.11 * v, 'triangle', this.musicBus));
        break;
      }
      case 'lose': {
        [392, 349, 294, 220].forEach((f, i) =>
          this._ping(f, t + i * 0.18, 1.1, 0.11 * v, 'triangle', this.musicBus));
        break;
      }
      case 'ui': this._ping(700, t, 0.07, 0.07 * v, 'square'); break;
    }
  }
}
