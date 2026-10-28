/* ============================================================
   Жардамчы функциялар: туруктуу random, ызы-чуу (noise), текстура.
   ============================================================ */

/* Туруктуу (seeded) random — ар жолу бирдей дүйнө чыгышы үчүн */
export function makeRandom(seed = 1337) {
  let s = seed >>> 0;
  return function () {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
}

export const lerp  = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const smooth = (t) => t * t * (3 - 2 * t);

/* --- Жөнөкөй value-noise (жер бетинин дөбөлөрү үчүн) --- */
const P = new Uint8Array(512);
(function initPerm() {
  const rnd = makeRandom(9123);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = (rnd() * (i + 1)) | 0;
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) P[i] = p[i & 255];
})();

function hash2(x, y) { return P[(P[x & 255] + y) & 255] / 255; }

export function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = smooth(xf), v = smooth(yf);
  const a = hash2(xi,     yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi,     yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

/* Бир нече катмарлуу noise — табигыйыраак рельеф */
export function fbm(x, y, octaves = 4) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum  += noise2(x * freq, y * freq) * amp;
    norm += amp;
    amp  *= 0.5;
    freq *= 2.0;
  }
  return sum / norm;
}

/* ============================================================
   ГЕОМЕТРИЯЛАРДЫ БИРИКТИРҮҮ
   Бир моделди ондогон кичине меш-тен эмес, бир нече чоң меш-тен
   курабыз — телефондо алда канча тез иштейт.
   Ар бир бөлүккө өз түсүн "күйгүзүп" коёбуз (vertex colors).
   parts: [{ geo, color, matrix? }]
   ============================================================ */
export function mergeParts(THREE, parts) {
  const positions = [], normals = [], colors = [];
  const c = new THREE.Color();
  const nm = new THREE.Matrix3();

  for (const p of parts) {
    let g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    if (p.matrix) {
      g.applyMatrix4(p.matrix);
    }
    if (!g.attributes.normal) g.computeVertexNormals();

    const pos = g.attributes.position.array;
    const nor = g.attributes.normal.array;
    c.set(p.color);

    for (let i = 0; i < pos.length; i += 3) {
      positions.push(pos[i], pos[i + 1], pos[i + 2]);
      normals.push(nor[i], nor[i + 1], nor[i + 2]);
      colors.push(c.r, c.g, c.b);
    }
    g.dispose();
  }
  void nm;

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  out.setAttribute('normal',   new THREE.Float32BufferAttribute(normals, 3));
  out.setAttribute('color',    new THREE.Float32BufferAttribute(colors, 3));
  return out;
}

/* Жайгаштыруу матрицасын тез түзүү */
export function TRS(THREE, pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1]) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(pos[0], pos[1], pos[2]),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])),
    new THREE.Vector3(scl[0], scl[1], scl[2])
  );
}

/* ============================================================
   Текстуралар код менен тартылат — сүрөт файлдары керек эмес.
   ============================================================ */

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

/* Кайыңдын кабыгы (ак фон + кара сызыктар) */
export function birchTexture(THREE, rnd) {
  const [c, g] = canvas(128);
  g.fillStyle = '#efeae0'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 90; i++) {
    const x = rnd() * 128, y = rnd() * 128;
    const w = 3 + rnd() * 22, h = 1 + rnd() * 3;
    g.fillStyle = `rgba(${30 + rnd() * 40 | 0},${28 + rnd() * 30 | 0},${26 + rnd() * 25 | 0},${0.35 + rnd() * 0.5})`;
    g.fillRect(x, y, w, h);
  }
  for (let i = 0; i < 25; i++) {
    g.fillStyle = `rgba(190,180,160,${0.2 + rnd() * 0.3})`;
    g.fillRect(rnd() * 128, rnd() * 128, 2 + rnd() * 6, 10 + rnd() * 40);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 2);
  return t;
}

/* Карагайдын / кадимки дарактын кабыгы */
export function barkTexture(THREE, rnd) {
  const [c, g] = canvas(64);
  g.fillStyle = '#6b4a33'; g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 160; i++) {
    const v = 0.5 + rnd() * 0.6;
    g.fillStyle = `rgba(${(80 * v) | 0},${(56 * v) | 0},${(38 * v) | 0},.8)`;
    g.fillRect(rnd() * 64, rnd() * 64, 1 + rnd() * 3, 4 + rnd() * 16);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 2);
  return t;
}

/* Жердин чөп текстурасы (тактар менен) */
export function groundTexture(THREE, rnd) {
  const [c, g] = canvas(256);
  g.fillStyle = '#4e8f3b'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const v = rnd();
    g.fillStyle = v > 0.72
      ? `rgba(120,170,70,${0.25 + rnd() * 0.4})`
      : `rgba(42,92,36,${0.2 + rnd() * 0.35})`;
    g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 4, 1 + rnd() * 4);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(26, 26);
  return t;
}
