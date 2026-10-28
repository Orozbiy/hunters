/* ============================================================
   КИРҮҮ ТРЕЙЛЕРИ
   Оюн ачылганда ойнолуучу кыска кино: токой → бугулар → мергенчи
   → түн кескин кирет → вендиго. Үнү менен.
   «Өткөрүп жиберүү» баскычы бар.
   ============================================================ */

import * as THREE from './lib/three.module.js';
import { buildDeer, buildHunter, buildWendigo } from './models.js';

const $ = (id) => document.getElementById(id);

export class Intro {
  constructor(scene, camera, world, audio) {
    this.scene = scene;
    this.camera = camera;
    this.world = world;
    this.audio = audio;
    this.actors = [];
    this.running = false;
    this.t = 0;
    this.onDone = null;
    this._shotIndex = -1;
  }

  /* Кокустан эмес — ар дайым ачык, кооз жер */
  _spot(r, a) {
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    return { x, z, y: this.world.heightAt(x, z) };
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.t = 0;
    this._shotIndex = -1;

    const W = this.world;
    W.setNight(false);
    W.nightBlend = 0;

    /* --- Актёрлорду коёбуз --- */
    this.deer = [];
    const spots = [[0, -8], [3.4, -12.5], [-4.2, -14], [6.5, -18]];
    for (const [x, z] of spots) {
      const d = buildDeer(Math.random);
      d.group.position.set(x, W.heightAt(x, z), z);
      d.group.rotation.y = Math.random() * 6.28;
      this.scene.add(d.group);
      this.deer.push({ m: d, x, z });
      this.actors.push(d.group);
    }

    this.hunter = buildHunter();
    this.hunter.group.position.set(-2.2, W.heightAt(-2.2, 6), 6);
    this.hunter.group.rotation.y = Math.PI;      // бугуларды көздөй
    this.scene.add(this.hunter.group);
    this.actors.push(this.hunter.group);

    this.wendigo = buildWendigo();
    this.wendigo.group.position.set(0, W.heightAt(0, -6) - 4, -6);
    this.wendigo.group.visible = false;
    this.scene.add(this.wendigo.group);
    this.actors.push(this.wendigo.group);

    /* --- Экран --- */
    $('intro').classList.remove('hidden');
    this._setText('', '');
    this.audio.start().then(() => this.audio.setMode('day'));

    this.shots = this._buildShots();
    this.total = this.shots.reduce((s, x) => s + x.dur, 0);
  }

  _setText(big, small) {
    const t = $('introText');
    t.innerHTML = big ? `<b>${big}</b>${small ? `<i>${small}</i>` : ''}` : '';
    t.classList.toggle('show', !!big);
  }

  _buildShots() {
    const W = this.world;
    const gy = (x, z) => W.heightAt(x, z);
    const cam = this.camera;
    const look = (x, y, z) => cam.lookAt(x, y, z);
    const ease = (k) => k * k * (3 - 2 * k);

    return [
      /* 1. Чөптүн үстү менен сыдырылып учуу */
      {
        dur: 3.2,
        enter: () => this._setText('ТОКОЙДО ОН БУГУ ЖҮРӨТ', 'алардын бири — оюнчу'),
        fn: (k) => {
          const z = 14 - ease(k) * 13;
          const x = -1.5 + Math.sin(k * 2) * 1.2;
          cam.position.set(x, gy(x, z) + 0.75 + k * 0.5, z);
          look(0, gy(0, -9) + 1.1, -9);
        },
      },

      /* 2. Бугунун айланасында */
      {
        dur: 2.9,
        enter: () => this._setText('БОТ БУГУЛАРДАН АЙЫРМАҢ БИЛИНБЕСИН', 'оттоп тур, акырын бас'),
        fn: (k) => {
          const a = -0.6 + ease(k) * 1.9;
          const r = 6.2 - ease(k) * 1.6;
          const cx = 0 + Math.cos(a) * r, cz = -8 + Math.sin(a) * r;
          cam.position.set(cx, gy(cx, cz) + 1.5, cz);
          look(0, gy(0, -8) + 1.25, -8);
        },
      },

      /* 3. Мергенчи жааны тартат */
      {
        dur: 3.0,
        enter: () => {
          this._setText('МЕРГЕНЧИ АҢДЫП ЖҮРӨТ', 'бир жаңылса — акыл-эси түшөт');
          this.audio.sfx('bowDraw');
        },
        fn: (k) => {
          this.hunter.setAnim('aim', 0.016);
          const a = 2.4 - ease(k) * 0.9;
          const r = 4.6 - ease(k) * 1.5;
          const cx = -2.2 + Math.cos(a) * r, cz = 6 + Math.sin(a) * r;
          cam.position.set(cx, gy(cx, cz) + 1.75, cz);
          look(-2.2, gy(-2.2, 6) + 1.5, 6);
          if (k > 0.93 && !this._shot3) { this._shot3 = true; this.audio.sfx('bowRelease'); }
        },
      },

      /* 4. ТҮН КЕСКИН КИРЕТ */
      {
        dur: 2.2,
        enter: () => {
          this._setText('', '');
          this.audio.sfx('nightfall');
          W.setNight(true);
          setTimeout(() => this.audio.setMode('night'), 1400);
        },
        fn: (k) => {
          const cx = -1 + k * 0.6, cz = -2 + k * 1.5;
          cam.position.set(cx, gy(cx, cz) + 1.6, cz);
          look(0, gy(0, -7) + 1.6, -7);
        },
      },

      /* 5. Вендиго жерден көтөрүлүп каптайт */
      {
        dur: 3.6,
        enter: () => {
          this._setText('АКЫЛ-ЭС БҮТКӨНДӨ — ОЛЖО АЛМАШАТ', 'бугулар эки бутуна турат');
          this.wendigo.group.visible = true;
          setTimeout(() => this.audio.sfx('wendigoRoar'), 900);
        },
        fn: (k) => {
          const e = ease(Math.min(1, k * 1.5));
          const wz = -6 + e * 3.4;
          this.wendigo.group.position.set(0, gy(0, wz) - (1 - e) * 3.2, wz);
          this.wendigo.group.rotation.y = 0;
          this.wendigo.setAnim(k > 0.45 ? 'run' : 'idle', 0.016);

          const sh = k > 0.5 ? (Math.random() - 0.5) * 0.09 * (k - 0.5) * 2 : 0;
          const cz = 1.6 - k * 0.6;
          cam.position.set(sh, gy(0, cz) + 1.55 + sh, cz);
          look(0, gy(0, wz) + 1.9, wz);
        },
      },

      /* 6. Аталышы */
      {
        dur: 2.6,
        enter: () => this._setText('ТҮНКҮ ТОКОЙ', 'Oh Deer стилинде'),
        fn: (k) => {
          const e = ease(k);
          const cz = 1.0 + e * 11;
          const cx = e * 3;
          cam.position.set(cx, gy(cx, cz) + 2.0 + e * 3.4, cz);
          look(0, gy(0, -4) + 2.2, -4);
          $('intro').style.setProperty('--fade', k > 0.8 ? (k - 0.8) / 0.2 : 0);
        },
      },
    ];
  }

  update(dt) {
    if (!this.running) return;
    this.t += dt;

    /* кайсы кадр? */
    let acc = 0, idx = -1, local = 0;
    for (let i = 0; i < this.shots.length; i++) {
      const s = this.shots[i];
      if (this.t < acc + s.dur) { idx = i; local = (this.t - acc) / s.dur; break; }
      acc += s.dur;
    }
    if (idx < 0) { this.finish(); return; }

    if (idx !== this._shotIndex) {
      this._shotIndex = idx;
      this.shots[idx].enter && this.shots[idx].enter();
    }
    this.shots[idx].fn(local);

    /* бугулар оттоп турат */
    for (const d of this.deer) d.m.setAnim('graze', dt);
    if (this._shotIndex < 2) this.hunter.setAnim('idle', dt);

    this.world.update(dt, this.camera);
  }

  finish() {
    if (!this.running) return;
    this.running = false;
    for (const a of this.actors) this.scene.remove(a);
    this.actors = [];
    this.deer = [];
    this.world.setNight(false);
    this.world.nightBlend = 0;
    $('intro').classList.add('hidden');
    $('intro').style.removeProperty('--fade');
    this._setText('', '');
    this.audio.setMode('menu');
    this.onDone && this.onDone();
  }
}
