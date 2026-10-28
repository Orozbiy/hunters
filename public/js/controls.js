/* ============================================================
   Башкаруу: сенсордук джойстик + манжа менен кароо + баскычтар.
   Компьютерде текшерүү үчүн WASD жана чычкан да иштейт.
   ============================================================ */

import { CFG } from './config.js';

export class Controls {
  constructor() {
    this.move = { x: 0, y: 0 };     // -1..1 джойстик
    this.lookDX = 0;                 // ушул кадрда канча бурулду
    this.lookDY = 0;
    this.running = false;

    this.pressed = { jump: false, fire: false, use: false, fart: false };
    this.held    = { fire: false };

    this._stickId = null;
    this._lookId  = null;
    this._lookPrev = { x: 0, y: 0 };
    this._stickOrigin = { x: 0, y: 0 };

    this.base = document.getElementById('stickBase');
    this.knob = document.getElementById('stickKnob');
    this.zone = document.getElementById('stickZone');

    this._bindStick();
    this._bindLook();
    this._bindButtons();
    this._bindKeyboard();
  }

  /* ---------- Джойстик ---------- */
  _bindStick() {
    const R = 46;  // кыймылдын радиусу (px)

    const start = (e) => {
      if (this._stickId !== null) return;
      const t = e.changedTouches ? e.changedTouches[0] : e;
      this._stickId = t.identifier !== undefined ? t.identifier : 'mouse';
      this._stickOrigin.x = t.clientX;
      this._stickOrigin.y = t.clientY;
      // джойстиктин негизин манжа баскан жерге кой
      this.base.style.left = (t.clientX - 59) + 'px';
      this.base.style.bottom = 'auto';
      this.base.style.top = (t.clientY - 59) + 'px';
      this.base.style.opacity = '1';
      e.preventDefault();
    };

    const move = (e) => {
      if (this._stickId === null) return;
      const list = e.changedTouches ? Array.from(e.changedTouches) : [e];
      const t = list.find(x => (x.identifier !== undefined ? x.identifier : 'mouse') === this._stickId);
      if (!t) return;
      let dx = t.clientX - this._stickOrigin.x;
      let dy = t.clientY - this._stickOrigin.y;
      const len = Math.hypot(dx, dy);
      if (len > R) { dx = dx / len * R; dy = dy / len * R; }
      this.knob.style.transform = `translate(${dx}px,${dy}px)`;
      this.move.x = dx / R;
      this.move.y = -dy / R;
      this.running = len > R * 0.82;
      e.preventDefault();
    };

    const end = (e) => {
      if (this._stickId === null) return;
      const list = e.changedTouches ? Array.from(e.changedTouches) : [e];
      const t = list.find(x => (x.identifier !== undefined ? x.identifier : 'mouse') === this._stickId);
      if (!t && e.changedTouches) return;
      this._stickId = null;
      this.move.x = this.move.y = 0;
      this.running = false;
      this.knob.style.transform = 'translate(0,0)';
      this.base.style.left = ''; this.base.style.top = ''; this.base.style.bottom = '';
      this.base.style.opacity = '';
    };

    this.zone.addEventListener('touchstart', start, { passive: false });
    this.zone.addEventListener('touchmove',  move,  { passive: false });
    this.zone.addEventListener('touchend',   end);
    this.zone.addEventListener('touchcancel', end);
    this.zone.addEventListener('mousedown',  start);
    window.addEventListener('mousemove', (e) => { if (this._stickId === 'mouse') move(e); });
    window.addEventListener('mouseup',   (e) => { if (this._stickId === 'mouse') end(e); });
  }

  /* ---------- Кароо (экрандын оң жарымын сүрүү) ---------- */
  _bindLook() {
    const canvas = document.getElementById('scene');

    const isLookArea = (x) => x > window.innerWidth * 0.42;

    canvas.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        if (this._lookId === null && isLookArea(t.clientX)) {
          this._lookId = t.identifier;
          this._lookPrev.x = t.clientX;
          this._lookPrev.y = t.clientY;
        }
      }
    }, { passive: true });

    canvas.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._lookId) {
          this.lookDX += (t.clientX - this._lookPrev.x);
          this.lookDY += (t.clientY - this._lookPrev.y);
          this._lookPrev.x = t.clientX;
          this._lookPrev.y = t.clientY;
        }
      }
      e.preventDefault();
    }, { passive: false });

    const stop = (e) => {
      for (const t of e.changedTouches) if (t.identifier === this._lookId) this._lookId = null;
    };
    canvas.addEventListener('touchend', stop);
    canvas.addEventListener('touchcancel', stop);

    /* Компьютер: чычкан басылганда айлантуу */
    let mouseDown = false;
    canvas.addEventListener('mousedown', (e) => {
      if (isLookArea(e.clientX)) { mouseDown = true; this._lookPrev = { x: e.clientX, y: e.clientY }; }
    });
    window.addEventListener('mouseup', () => { mouseDown = false; });
    window.addEventListener('mousemove', (e) => {
      if (!mouseDown) return;
      this.lookDX += e.clientX - this._lookPrev.x;
      this.lookDY += e.clientY - this._lookPrev.y;
      this._lookPrev = { x: e.clientX, y: e.clientY };
    });
  }

  /* ---------- Баскычтар ---------- */
  _bindButtons() {
    const tap = (id, name) => {
      const el = document.getElementById(id);
      if (!el) return;
      const down = (e) => { e.preventDefault(); e.stopPropagation(); this.pressed[name] = true; if (name === 'fire') this.held.fire = true; };
      const up   = (e) => { e.preventDefault(); e.stopPropagation(); if (name === 'fire') this.held.fire = false; };
      el.addEventListener('touchstart', down, { passive: false });
      el.addEventListener('touchend', up,     { passive: false });
      el.addEventListener('touchcancel', up,  { passive: false });
      el.addEventListener('mousedown', down);
      el.addEventListener('mouseup', up);
      el.addEventListener('mouseleave', up);
    };
    tap('btnJump', 'jump');
    tap('btnFire', 'fire');
    tap('btnUse',  'use');
    tap('btnFart', 'fart');
  }

  /* ---------- Клавиатура (компьютерде текшерүү үчүн) ---------- */
  _bindKeyboard() {
    const keys = {};
    window.addEventListener('keydown', (e) => {
      keys[e.code] = true;
      if (e.repeat) return;
      if (e.code === 'Space') this.pressed.jump = true;
      if (e.code === 'KeyE')  this.pressed.use  = true;
      if (e.code === 'KeyG')  this.pressed.fart = true;
      if (e.code === 'KeyR' || e.code === 'KeyF') { this.pressed.fire = true; this.held.fire = true; }
    });
    window.addEventListener('keyup', (e) => {
      keys[e.code] = false;
      if (e.code === 'KeyR' || e.code === 'KeyF') this.held.fire = false;
    });
    this._keys = keys;
  }

  /* Ар кадамда main.js чакырат */
  poll() {
    let mx = this.move.x, my = this.move.y, run = this.running;

    const k = this._keys;
    if (k) {
      let kx = 0, ky = 0;
      if (k['KeyW'] || k['ArrowUp'])    ky += 1;
      if (k['KeyS'] || k['ArrowDown'])  ky -= 1;
      if (k['KeyD'] || k['ArrowRight']) kx += 1;
      if (k['KeyA'] || k['ArrowLeft'])  kx -= 1;
      if (kx || ky) {
        const l = Math.hypot(kx, ky);
        mx = kx / l; my = ky / l;
        run = !!k['ShiftLeft'];
      }
    }

    const out = {
      move: { x: mx, y: my },
      running: run,
      lookDX: this.lookDX * CFG.player.lookSpeed,
      lookDY: this.lookDY * CFG.player.lookSpeed,
      pressed: { ...this.pressed },
      heldFire: this.held.fire,
    };
    this.lookDX = this.lookDY = 0;
    this.pressed.jump = this.pressed.fire = this.pressed.use = this.pressed.fart = false;
    return out;
  }
}
