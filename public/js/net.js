/* ============================================================
   Wi-Fi тармагы (WebSocket кардары).
   Сервер — server.js (таза Node.js, эч кандай пакет керек эмес).
   Бир эле серверден бет да, оюн да тейленет, ошондуктан
   даректи location'дан алабыз: iPhone'до да, Android'де да иштейт.
   ============================================================ */

import { FIREBASE_READY } from './firebase-config.js';

/*
  Кайсы транспортту колдонобуз?
    · Firebase толтурулган болсо → интернет аркылуу (ноутбук керек эмес)
    · Болбосо → Wi-Fi, node server.js аркылуу
*/
export async function createNet() {
  if (FIREBASE_READY) {
    const { NetFirebase } = await import('./net-firebase.js');
    return new NetFirebase();
  }
  return new Net();
}

export const NET_KIND = FIREBASE_READY ? 'firebase' : 'wifi';

export class Net {
  constructor() {
    this.kind = 'wifi';
    this.ws = null;
    this.id = null;
    this.isHost = false;
    this.room = '';
    this.name = '';
    this.players = new Map();     // id -> {id,name,role,host}
    this.connected = false;

    /* окуялар — main.js ушуларды толтурат */
    this.onPlayers = null;
    this.onStart   = null;
    this.onState   = null;        // (id, msg)
    this.onWorld   = null;        // (msg)  — хосттон
    this.onEvent   = null;        // (id, msg)
    this.onClose   = null;
    this.onError   = null;
  }

  static url() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${location.host}`;
  }

  connect(room, name, timeoutMs = 6000) {
    return new Promise((resolve, reject) => {
      let ws;
      try { ws = new WebSocket(Net.url()); }
      catch (e) { reject(e); return; }
      this.ws = ws;
      this.room = room;
      this.name = name;

      let done = false;
      const ok = (v) => { if (!done) { done = true; clearTimeout(timer); resolve(v); } };
      const fail = (msg) => {
        if (done) return;
        done = true; clearTimeout(timer);
        try { ws.onclose = null; ws.close(); } catch { /* жабылган */ }
        reject(new Error(msg));
      };

      /* Live Server сыяктуу "башка" сервер WebSocket'ти кабыл алып,
         бирок жооп бербей коюшу мүмкүн — ошондуктан күтүү чеги керек. */
      const timer = setTimeout(() => fail('timeout'), timeoutMs);

      ws.onerror = () => fail('байланыш түзүлбөдү');

      ws.onopen = () => {
        ws.onerror = (e) => this.onError && this.onError(e);
        this.send({ t: 'join', room, name });
      };
      ws.addEventListener('close', () => fail('байланыш жабылды'));
      this._resolveJoin = ok;

      ws.onmessage = (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch { return; }

        switch (m.t) {
          case 'joined':
            this.id = m.id;
            this.isHost = m.host;
            this.connected = true;
            this._resolveJoin(this);
            break;
          case 'players': {
            this.players.clear();
            for (const p of m.list) this.players.set(p.id, p);
            const me = this.players.get(this.id);
            if (me) this.isHost = !!me.host;
            this.onPlayers && this.onPlayers([...this.players.values()]);
            break;
          }
          case 'start': this.onStart && this.onStart(m); break;
          case 's':     this.onState && this.onState(m.id, m); break;
          case 'w':     this.onWorld && this.onWorld(m); break;
          case 'e':     this.onEvent && this.onEvent(m.id, m); break;
          case 'err':   this.onError && this.onError(new Error(m.msg)); break;
        }
      };

      ws.onclose = () => {
        this.connected = false;
        this.onClose && this.onClose();
      };
    });
  }

  send(obj) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
  }

  setRole(role) { this.send({ t: 'role', role }); }
  startGame(roles) { this.send({ t: 'start', roles }); }

  sendState(x, z, yaw, st, alive) {
    this.send({ t: 's', x: +x.toFixed(2), z: +z.toFixed(2), yaw: +yaw.toFixed(2), st, al: alive ? 1 : 0 });
  }

  sendWorld(data) { this.send({ t: 'w', ...data }); }
  sendEvent(data) { this.send({ t: 'e', ...data }); }

  close() { if (this.ws) { this.ws.onclose = null; this.ws.close(); } this.connected = false; }
}
