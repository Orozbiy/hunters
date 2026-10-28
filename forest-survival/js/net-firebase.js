/* ============================================================
   ТАРМАК — FIREBASE вариант (ноутбуксуз, интернет аркылуу)

   Realtime Database бөлмө катары колдонулат:

     rooms/{КОД}/
       players/{id} : {name, role, ts}     ← ким бар (presence)
       start        : {roles, ts}          ← хост баштады
       state/{id}   : {x,z,yaw,st,al}      ← ар кимдин орду
       world        : {npc, ph, tl, san, cab}  ← хост жөнөтөт
       events/{key} : {id, k, ...}         ← аткан жебе, үн, өлүм…

   Хост = эң биринчи кирген оюнчу (ts эң кичине). Ал чыгып кетсе,
   кийинкиси автоматтык түрдө хост болот.

   js/net.js менен БИРДЕЙ API: connect, setRole, startGame,
   sendState, sendWorld, sendEvent, close + ошол эле окуялар.
   ============================================================ */

import { FIREBASE_CONFIG } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
let FB = null;         // SDK бир жолу гана жүктөлөт

async function loadSDK() {
  if (FB) return FB;
  const [app, db] = await Promise.all([
    import(SDK + 'firebase-app.js'),
    import(SDK + 'firebase-database.js'),
  ]);
  FB = { ...app, ...db };
  return FB;
}

export class NetFirebase {
  constructor() {
    this.id = null;
    this.isHost = false;
    this.room = '';
    this.name = '';
    this.players = new Map();
    this.connected = false;
    this.kind = 'firebase';

    this.onPlayers = null;
    this.onStart = null;
    this.onState = null;
    this.onWorld = null;
    this.onEvent = null;
    this.onClose = null;
    this.onError = null;

    this._unsub = [];
    this._lastStart = 0;
    this._joinTs = 0;
    this._cleanTimer = null;
  }

  async connect(room, name) {
    const f = await loadSDK();
    this.room = String(room).toUpperCase().slice(0, 8);
    this.name = String(name || 'Оюнчу').slice(0, 14);

    const app = f.getApps?.().length ? f.getApp() : f.initializeApp(FIREBASE_CONFIG);
    const db = f.getDatabase(app);
    this.f = f; this.db = db;

    const roomRef = f.ref(db, `rooms/${this.room}`);
    this.roomRef = roomRef;

    /* --- Бөлмөгө кошулуу --- */
    const meRef = f.push(f.ref(db, `rooms/${this.room}/players`));
    this.id = meRef.key;
    this._joinTs = Date.now();
    await f.set(meRef, { name: this.name, role: 'deer', ts: this._joinTs });
    f.onDisconnect(meRef).remove();
    f.onDisconnect(f.ref(db, `rooms/${this.room}/state/${this.id}`)).remove();
    this.meRef = meRef;
    this.connected = true;

    /* --- Оюнчулардын тизмеси --- */
    this._unsub.push(f.onValue(f.ref(db, `rooms/${this.room}/players`), (snap) => {
      const v = snap.val() || {};
      const list = Object.entries(v)
        .map(([id, p]) => ({ id, name: p.name, role: p.role || 'deer', ts: p.ts || 0 }))
        .sort((a, b) => a.ts - b.ts);

      /* эң эрте киргени — хост */
      list.forEach((p, i) => { p.host = i === 0; });
      this.players.clear();
      for (const p of list) this.players.set(p.id, p);
      this.isHost = list.length > 0 && list[0].id === this.id;

      this.onPlayers && this.onPlayers(list);
    }));

    /* --- Хост баштады --- */
    this._unsub.push(f.onValue(f.ref(db, `rooms/${this.room}/start`), (snap) => {
      const v = snap.val();
      if (!v || !v.ts || v.ts === this._lastStart) return;
      this._lastStart = v.ts;
      if (v.by === this.id) return;                 // өзүм баштадым
      this.onStart && this.onStart({ roles: v.roles });
    }));

    /* --- Башкалардын орду --- */
    const stRef = f.ref(db, `rooms/${this.room}/state`);
    const onSt = (snap) => {
      const id = snap.key;
      if (id === this.id) return;
      const m = snap.val();
      if (m) this.onState && this.onState(id, m);
    };
    this._unsub.push(f.onChildAdded(stRef, onSt));
    this._unsub.push(f.onChildChanged(stRef, onSt));

    /* --- Хосттун дүйнөсү --- */
    this._unsub.push(f.onValue(f.ref(db, `rooms/${this.room}/world`), (snap) => {
      const m = snap.val();
      if (m) this.onWorld && this.onWorld(m);
    }));

    /* --- Окуялар --- */
    this._unsub.push(f.onChildAdded(f.ref(db, `rooms/${this.room}/events`), (snap) => {
      const m = snap.val();
      if (!m || m.id === this.id) return;
      if (m.ts && m.ts < this._joinTs - 2000) return;    // эски окуя
      this.onEvent && this.onEvent(m.id, m);
    }));

    /* Хост окуяларды мезгил-мезгили менен тазалап турат */
    this._cleanTimer = setInterval(() => {
      if (this.isHost) f.remove(f.ref(db, `rooms/${this.room}/events`)).catch(() => {});
    }, 15000);

    return this;
  }

  setRole(role) {
    if (!this.meRef) return;
    this.f.update(this.meRef, { role }).catch(() => {});
  }

  startGame(roles) {
    if (!this.db) return;
    const ts = Date.now();
    this._lastStart = ts;
    this.f.set(this.f.ref(this.db, `rooms/${this.room}/start`), { roles, ts, by: this.id })
      .catch(() => {});
    /* эски абалдарды тазалайбыз */
    this.f.remove(this.f.ref(this.db, `rooms/${this.room}/events`)).catch(() => {});
  }

  sendState(x, z, yaw, st, alive) {
    if (!this.db) return;
    this.f.set(this.f.ref(this.db, `rooms/${this.room}/state/${this.id}`), {
      x: +x.toFixed(2), z: +z.toFixed(2), yaw: +yaw.toFixed(2), st, al: alive ? 1 : 0,
    }).catch(() => {});
  }

  sendWorld(data) {
    if (!this.db || !this.isHost) return;
    this.f.update(this.f.ref(this.db, `rooms/${this.room}/world`), data).catch(() => {});
  }

  sendEvent(data) {
    if (!this.db) return;
    this.f.push(this.f.ref(this.db, `rooms/${this.room}/events`),
      { ...data, id: this.id, ts: Date.now() }).catch(() => {});
  }

  close() {
    for (const u of this._unsub) { try { u(); } catch { /* жабылган */ } }
    this._unsub = [];
    clearInterval(this._cleanTimer);
    if (this.meRef) {
      try {
        this.f.remove(this.meRef);
        this.f.remove(this.f.ref(this.db, `rooms/${this.room}/state/${this.id}`));
      } catch { /* ok */ }
    }
    this.connected = false;
  }
}
