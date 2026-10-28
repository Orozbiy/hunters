/* ============================================================
   ТҮНКҮ ТОКОЙ — Wi-Fi сервери
   Таза Node.js. Эч кандай npm пакет керек эмес.

   Иштетүү:   node server.js
   Телефондон: терминалда чыккан http://192.168.x.x:8080 дарегине кир
               (телефон да, компьютер да бир Wi-Fi'да болушу керек)
   ============================================================ */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;

/* ------------------------------------------------------------
   1. Статикалык файлдар
------------------------------------------------------------ */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.webmanifest': 'application/manifest+json',
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);

  /* Оюн барагы досторго жиберүүчү чыныгы Wi-Fi дарегин ушундан билет */
  if (p === '/__ip') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ips: localIPs(), port: PORT }));
    return;
  }

  if (p === '/') p = '/index.html';

  const file = path.join(ROOT, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }

  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('404'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
});

/* ------------------------------------------------------------
   2. WebSocket (RFC 6455) — кол менен жазылган, пакетсиз
------------------------------------------------------------ */
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function encodeFrame(str, opcode = 0x1) {
  const payload = Buffer.from(str, 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(len, 6);
  }
  header[0] = 0x80 | opcode;
  return Buffer.concat([header, payload]);
}

class Conn {
  constructor(socket) {
    this.socket = socket;
    this.buf = Buffer.alloc(0);
    this.frag = [];
    this.fragOp = 0;
    this.open = true;
    this.onmessage = null;
    this.onclose = null;

    socket.on('data', (d) => this._data(d));
    socket.on('error', () => this.close());
    socket.on('close', () => {
      if (!this.open) return;
      this.open = false;
      this.onclose && this.onclose();
    });
  }

  _data(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);

    for (;;) {
      const b = this.buf;
      if (b.length < 2) return;

      const fin    = (b[0] & 0x80) !== 0;
      const opcode = b[0] & 0x0f;
      const masked = (b[1] & 0x80) !== 0;
      let len = b[1] & 0x7f;
      let off = 2;

      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) {
        if (b.length < 10) return;
        const big = b.readBigUInt64BE(2);
        if (big > 8_000_000n) { this.close(); return; }
        len = Number(big); off = 10;
      }

      let mask = null;
      if (masked) { if (b.length < off + 4) return; mask = b.subarray(off, off + 4); off += 4; }
      if (b.length < off + len) return;

      const payload = Buffer.from(b.subarray(off, off + len));
      if (mask) for (let i = 0; i < len; i++) payload[i] ^= mask[i & 3];
      this.buf = b.subarray(off + len);

      if (opcode === 0x8) { this.close(); return; }          // close
      if (opcode === 0x9) { this._raw(encodeFrame('', 0xA)); continue; }  // ping → pong
      if (opcode === 0xA) continue;                           // pong

      if (opcode === 0x0) this.frag.push(payload);            // continuation
      else { this.frag = [payload]; this.fragOp = opcode; }

      if (fin) {
        const full = Buffer.concat(this.frag);
        this.frag = [];
        if (this.fragOp === 0x1 && this.onmessage) {
          this.onmessage(full.toString('utf8'));
        }
      }
    }
  }

  _raw(buf) {
    if (!this.open) return;
    try { this.socket.write(buf); } catch { this.close(); }
  }

  send(str) { this._raw(encodeFrame(str)); }

  close() {
    if (!this.open) return;
    this.open = false;
    try { this.socket.end(); } catch { /* жабылып калган */ }
    this.onclose && this.onclose();
  }
}

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );
  socket.setNoDelay(true);
  handleClient(new Conn(socket));
});

/* ------------------------------------------------------------
   3. Бөлмөлөр жана кабар алмашуу
------------------------------------------------------------ */
const rooms = new Map();     // code -> Set<client>
let nextId = 1;

function roomList(code) {
  const set = rooms.get(code);
  if (!set) return [];
  return [...set].map(c => ({ id: c.id, name: c.name, role: c.role, host: c.host }));
}

function broadcast(code, obj, except = null) {
  const set = rooms.get(code);
  if (!set) return;
  const s = JSON.stringify(obj);
  for (const c of set) if (c !== except) c.conn.send(s);
}

function sendPlayers(code) {
  broadcast(code, { t: 'players', list: roomList(code) });
}

function handleClient(conn) {
  const client = { id: nextId++, conn, name: 'Оюнчу', role: 'deer', host: false, room: null };

  conn.onmessage = (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }

    if (m.t === 'join') {
      const code = String(m.room || 'TOKOI').toUpperCase().slice(0, 8);
      client.name = String(m.name || 'Оюнчу').slice(0, 14);
      client.room = code;

      if (!rooms.has(code)) rooms.set(code, new Set());
      const set = rooms.get(code);
      if (set.size >= 10) { conn.send(JSON.stringify({ t: 'err', msg: 'Бөлмө толуп калды (10)' })); conn.close(); return; }

      client.host = set.size === 0;
      set.add(client);

      conn.send(JSON.stringify({ t: 'joined', id: client.id, host: client.host, room: code }));
      sendPlayers(code);
      console.log(`[+] ${client.name} → ${code} (${set.size} оюнчу)`);
      return;
    }

    if (!client.room) return;

    switch (m.t) {
      case 'role':
        client.role = m.role;
        sendPlayers(client.room);
        break;
      case 'start':
        if (client.host) broadcast(client.room, { t: 'start', roles: m.roles, seed: m.seed });
        break;
      case 's':
        m.id = client.id;
        broadcast(client.room, m, client);
        break;
      case 'w':
        if (client.host) { m.id = client.id; broadcast(client.room, m, client); }
        break;
      case 'e':
        m.id = client.id;
        broadcast(client.room, m, client);
        break;
    }
  };

  conn.onclose = () => {
    const code = client.room;
    if (!code) return;
    const set = rooms.get(code);
    if (!set) return;
    set.delete(client);
    console.log(`[-] ${client.name} ← ${code} (${set.size} калды)`);
    if (set.size === 0) { rooms.delete(code); return; }
    if (client.host) { const next = [...set][0]; next.host = true; }
    broadcast(code, { t: 'left', id: client.id });
    sendPlayers(code);
  };
}

/* ------------------------------------------------------------
   4. Жүргүзүү
------------------------------------------------------------ */
function localIPs() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
    }
  }
  return out;
}

server.listen(PORT, '0.0.0.0', () => {
  const ips = localIPs();
  console.log('');
  console.log('  🌲  ТҮНКҮ ТОКОЙ сервери иштеп жатат');
  console.log('  ─────────────────────────────────────────');
  console.log(`  Ушул компьютерде : http://localhost:${PORT}`);
  if (ips.length) {
    console.log('  Телефондон кир   :');
    for (const ip of ips) console.log(`      http://${ip}:${PORT}`);
  } else {
    console.log('  (Wi-Fi дареги табылган жок)');
  }
  console.log('');
  console.log('  Телефон менен компьютер бир Wi-Fi\'да болушу керек.');
  console.log('  iPhone — Safari, Android — Chrome. Экөө тең иштейт.');
  console.log('  Токтотуу: Ctrl+C');
  console.log('');
});
