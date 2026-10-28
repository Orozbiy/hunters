/* ============================================================
   Раунддун эрежелери — «Oh Deer» сюжети боюнча.

   1. КАПАС — мергенчи капаста, бугулар бот бугулардын арасына кирет
   2. КҮНДҮЗ — мергенчи аңчылык кылат
   3. ТҮН   — мергенчинин АКЫЛ-ЭСИ НӨЛГӨ ТҮШКӨНДӨ кирет:
              2 секундда кескин караңгы болот, ай чыгат,
              тирүү калган бугулар ВЕНДИГОГО айланат (эки бутуна турат),
              картада ҮЙ (cabin) пайда болот.
   4. БҮТТҮ

   Жеңиш:
     мергенчи — бардык оюнчу-бугуну атса, же түндө ҮЙГӨ жетсе
     бугулар  — түндө мергенчини кармаса, же убакыт бүтсө
   ============================================================ */

import { CFG } from './config.js';

export class Match {
  constructor(world) {
    this.world = world;
    this.phase = 'cage';
    this.timeLeft = CFG.round.cageTime;
    this.over = false;
    this.result = null;
    this.onPhase = null;
    this.onEnd = null;
  }

  get caged()   { return this.phase === 'cage'; }
  get isNight() { return this.phase === 'night'; }

  phaseLabel() {
    switch (this.phase) {
      case 'cage':  return 'КАПАСТА';
      case 'day':   return 'КҮНДҮЗ';
      case 'night': return 'ТҮН · ВЕНДИГО';
      default:      return 'БҮТТҮ';
    }
  }

  _set(phase, time) {
    this.phase = phase;
    if (time !== undefined) this.timeLeft = time;
    this.world.setNight(this.isNight);
    this.onPhase && this.onPhase(phase);
  }

  /* Акыл-эс нөлгө түштү → түн + вендиго */
  fallNight() {
    if (this.phase === 'night' || this.over) return;
    this._set('night', CFG.round.nightTime);
  }

  end(winner, text) {
    if (this.over) return;
    this.over = true;
    this.result = { winner, text };
    this.phase = 'over';
    this.onPhase && this.onPhase('over');
    this.onEnd && this.onEnd(this.result);
  }

  /*
    state = {
      aliveDeer,       // тирүү оюнчу-бугулар
      hunterAlive,
      hunterSanity,
      hunterAtCabin,   // мергенчи үйгө жеттиби (түндө гана)
    }
  */
  update(dt, state) {
    if (this.over) return;
    this.timeLeft -= dt;

    /* Бардык бугу кармалды */
    if (state.aliveDeer <= 0) {
      this.end('hunter', 'Мергенчи бардык бугуну кармады');
      return;
    }

    if (this.phase === 'cage') {
      if (this.timeLeft <= 0) this._set('day', CFG.round.dayTime);
      return;
    }

    if (this.phase === 'day') {
      /* ⚡ негизги шарт: акыл-эс нөл → түн */
      if (state.hunterSanity <= 0) { this.fallNight(); return; }
      if (this.timeLeft <= 0) { this.fallNight(); }      // убакыт бүтсө да түн кирет
      return;
    }

    if (this.phase === 'night') {
      if (!state.hunterAlive) { this.end('deer', 'Вендиголор мергенчини кармады'); return; }
      if (state.hunterAtCabin) { this.end('hunter', 'Мергенчи үйгө жетип кутулду'); return; }
      if (this.timeLeft <= 0) { this.end('deer', 'Таң атты — бугулар аман калды'); }
    }
  }

  static clock(sec) {
    sec = Math.max(0, Math.ceil(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }
}
