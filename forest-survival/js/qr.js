/* ============================================================
   QR КОД ЖАРАТКЫЧ (кичине, китепканасыз)
   Байт режими, L деңгээли, 1–5 версия (105 белгиге чейин).
   Бизге керегинин баары: http://192.168.x.x:8080/
   ============================================================ */

/* [бардык codeword, EC codeword, маалымат codeword] — L деңгээли */
const VER = {
  1: [26, 7, 19],
  2: [44, 10, 34],
  3: [70, 15, 55],
  4: [100, 20, 80],
  5: [134, 26, 108],
};
/* Тегиздөө үлгүлөрүнүн борборлору */
const ALIGN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30] };

/* ---------- GF(256) ---------- */
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
(function () {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x; LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();
const mul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];

function genPoly(n) {
  let g = [1];
  for (let i = 0; i < n; i++) {
    const ng = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      ng[j] ^= g[j];                      // g · x
      ng[j + 1] ^= mul(g[j], EXP[i]);     // g · α^i
    }
    g = ng;
  }
  return g;
}

function ecc(data, n) {
  const g = genPoly(n);
  const res = new Array(n).fill(0);
  for (const d of data) {
    const factor = d ^ res[0];
    res.shift(); res.push(0);
    if (factor !== 0) for (let i = 0; i < n; i++) res[i] ^= mul(g[i + 1], factor);
  }
  return res;
}

/* ---------- Маалыматты коддоо ---------- */
function encode(text) {
  const bytes = new TextEncoder().encode(text);

  let ver = 0;
  for (let v = 1; v <= 5; v++) {
    const cap = VER[v][2] - 2;                 // режим + узундук = 12 бит ≈ 2 байт
    if (bytes.length <= cap) { ver = v; break; }
  }
  if (!ver) throw new Error('текст өтө узун');

  const [, ecLen, dataLen] = VER[ver];
  const bits = [];
  const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };

  push(0b0100, 4);           // байт режими
  push(bytes.length, 8);     // 1–9 версияда узундук 8 бит
  for (const b of bytes) push(b, 8);

  const cap = dataLen * 8;
  for (let i = 0; i < 4 && bits.length < cap; i++) bits.push(0);   // токтотуу
  while (bits.length % 8) bits.push(0);

  const data = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    data.push(b);
  }
  const PAD = [0xec, 0x11];
  let k = 0;
  while (data.length < dataLen) data.push(PAD[k++ % 2]);

  return { ver, all: data.concat(ecc(data, ecLen)) };
}

/* ---------- Матрица ---------- */
function build(ver, codewords) {
  const size = 17 + ver * 4;
  const m = Array.from({ length: size }, () => new Array(size).fill(null));
  const fixed = Array.from({ length: size }, () => new Array(size).fill(false));

  const set = (x, y, v) => { m[y][x] = v; fixed[y][x] = true; };

  /* тапкыч үлгүлөр + бөлгүчтөр */
  const finder = (ox, oy) => {
    for (let y = -1; y <= 7; y++) {
      for (let x = -1; x <= 7; x++) {
        const px = ox + x, py = oy + y;
        if (px < 0 || py < 0 || px >= size || py >= size) continue;
        const on = (x >= 0 && x <= 6 && (y === 0 || y === 6)) ||
                   (y >= 0 && y <= 6 && (x === 0 || x === 6)) ||
                   (x >= 2 && x <= 4 && y >= 2 && y <= 4);
        set(px, py, on ? 1 : 0);
      }
    }
  };
  finder(0, 0); finder(size - 7, 0); finder(0, size - 7);

  /* убакыт сызыктары */
  for (let i = 8; i < size - 8; i++) {
    set(i, 6, i % 2 === 0 ? 1 : 0);
    set(6, i, i % 2 === 0 ? 1 : 0);
  }

  /* тегиздөө үлгүлөрү */
  const ac = ALIGN[ver];
  for (const cy of ac) {
    for (const cx of ac) {
      if ((cx <= 8 && cy <= 8) || (cx <= 8 && cy >= size - 9) || (cx >= size - 9 && cy <= 8)) continue;
      for (let y = -2; y <= 2; y++) {
        for (let x = -2; x <= 2; x++) {
          const on = Math.max(Math.abs(x), Math.abs(y)) !== 1;
          set(cx + x, cy + y, on ? 1 : 0);
        }
      }
    }
  }

  /* караңгы модуль + формат орундары */
  set(8, size - 8, 1);
  for (let i = 0; i <= 8; i++) {
    if (!fixed[8][i]) set(i, 8, 0);
    if (!fixed[i][8]) set(8, i, 0);
  }
  for (let i = 0; i < 8; i++) {
    if (!fixed[8][size - 1 - i]) set(size - 1 - i, 8, 0);
    if (!fixed[size - 1 - i][8]) set(8, size - 1 - i, 0);
  }

  /* маалыматты зигзаг менен жайгаштыруу */
  let bit = 0;
  const total = codewords.length * 8;
  const getBit = (i) => (codewords[i >> 3] >> (7 - (i & 7))) & 1;

  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;                       // 6-мамыча убакыт сызыгы
    for (let row = 0; row < size; row++) {
      const y = upward ? size - 1 - row : row;
      for (let c = 0; c < 2; c++) {
        const x = col - c;
        if (fixed[y][x]) continue;
        m[y][x] = bit < total ? getBit(bit) : 0;
        bit++;
      }
    }
    upward = !upward;
  }

  return { m, fixed, size };
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x, y) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => ((((x * y) % 2) + ((x * y) % 3)) % 2) === 0,
  (x, y) => ((((x + y) % 2) + ((x * y) % 3)) % 2) === 0,
];

function penalty(m, size) {
  let p = 0;
  /* 1: катарда/мамычада 5+ бирдей */
  for (let i = 0; i < size; i++) {
    for (const dir of [0, 1]) {
      let run = 1;
      for (let j = 1; j < size; j++) {
        const a = dir ? m[j - 1][i] : m[i][j - 1];
        const b = dir ? m[j][i] : m[i][j];
        if (a === b) { run++; if (run === 5) p += 3; else if (run > 5) p++; }
        else run = 1;
      }
    }
  }
  /* 2: 2x2 блоктор */
  for (let y = 0; y < size - 1; y++)
    for (let x = 0; x < size - 1; x++)
      if (m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3;
  /* 4: караңгы модулдардын үлүшү */
  let dark = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) dark += m[y][x];
  const ratio = (dark * 100) / (size * size);
  p += Math.floor(Math.abs(ratio - 50) / 5) * 10;
  return p;
}

function formatBits(mask) {
  /* L деңгээли = 01 */
  let d = (0b01 << 3) | mask;
  let v = d << 10;
  for (let i = 4; i >= 0; i--) if ((v >> (i + 10)) & 1) v ^= 0b10100110111 << i;
  return ((d << 10) | v) ^ 0b101010000010010;
}

/*
  Кайтарат: { size, modules } — modules[y][x] = 0 | 1
*/
export function qrMatrix(text, forceMask) {
  const { ver, all } = encode(text);
  const { m, fixed, size } = build(ver, all);

  /* эң жакшы маскканы тандайбыз */
  let best = null, bestP = Infinity;
  for (let k = 0; k < 8; k++) {
    if (forceMask !== undefined && k !== forceMask) continue;
    const t = m.map(r => r.slice());
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++)
        if (!fixed[y][x] && MASKS[k](x, y)) t[y][x] ^= 1;

    /* формат биттери */
    const f = formatBits(k);
    const put = (x, y, b) => { t[y][x] = b; };
    for (let i = 0; i < 15; i++) {
      const b = (f >> i) & 1;

      /* 1-көчүрмө: 8-мамычанын үстү, анан 8-катардын солу */
      if (i < 6) put(8, i, b);
      else if (i === 6) put(8, 7, b);
      else if (i === 7) put(8, 8, b);
      else if (i === 8) put(7, 8, b);
      else put(14 - i, 8, b);

      /* 2-көчүрмө: 8-катардын оңу, анан 8-мамычанын асты */
      if (i < 8) put(size - 1 - i, 8, b);
      else put(8, size - 15 + i, b);
    }
    t[size - 8][8] = 1;

    const p = penalty(t, size);
    if (p < bestP) { bestP = p; best = t; }
  }

  return { size, modules: best };
}

/* QR'ды <canvas>'ка тартуу */
export function drawQR(canvas, text, opts = {}) {
  const quiet = opts.quiet ?? 3;
  const dark = opts.dark || '#0a120c';
  const light = opts.light || '#ffffff';

  const { size, modules } = qrMatrix(text);
  const total = size + quiet * 2;
  const px = Math.max(2, Math.floor((opts.px || 160) / total));
  canvas.width = canvas.height = total * px;

  const g = canvas.getContext('2d');
  g.fillStyle = light;
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = dark;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      if (modules[y][x]) g.fillRect((x + quiet) * px, (y + quiet) * px, px, px);
}
