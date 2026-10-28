/* ============================================================
   3D моделдер: бугу, мергенчи, вендиго.
   Сүрөт/модель файлы керек эмес — баары код менен курулат.

   Өндүрүмдүүлүк: бир моделдин ондогон кичине бөлүгүн бир нече чоң
   геометрияга бириктиребиз (mergeParts), түсү vertex color менен
   берилет. Ошондуктан деталдуу болсо да телефондо тез иштейт.
   ============================================================ */

import * as THREE from './lib/three.module.js';
import { mergeParts, TRS } from './utils.js';

const M = (color, opts = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts });

/* Бугунун түстөрү — БАРДЫК бугу бирдей көрүнүшү керек,
   антпесе оюнчуну бот бугудан дароо айырмалап коюшат. */
const C = {
  fur:    0xb07a44,
  furDk:  0x8a5a30,
  cream:  0xe8d7b8,
  nose:   0x2a1c14,
  eye:    0x120c08,
  hoof:   0x2b2018,
  antler: 0xded0b4,
};

let DEER_GEO = null;
let DEER_MAT = null;

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s = 6) => new THREE.CylinderGeometry(rt, rb, h, s);
const sph = (r) => new THREE.SphereGeometry(r, 8, 6);
const mx  = (p, r, s) => TRS(THREE, p, r, s);

/* ------------------------------------------------------------
   БУГУНУН ГЕОМЕТРИЯСЫ (бир жолу гана курулат)
------------------------------------------------------------ */
function deerGeometry() {
  if (DEER_GEO) return DEER_GEO;

  /* ---------- ДЕНЕ + МОЙН ---------- */
  const body = mergeParts(THREE, [
    { geo: box(0.48, 0.50, 0.44), color: C.fur,   matrix: mx([0, 0.99, -0.30]) },   // көкүрөк
    { geo: box(0.44, 0.47, 0.62), color: C.fur,   matrix: mx([0, 0.96, 0.08]) },    // бел
    { geo: box(0.42, 0.46, 0.30), color: C.fur,   matrix: mx([0, 0.98, 0.48]) },    // сагры
    { geo: box(0.36, 0.13, 0.98), color: C.cream, matrix: mx([0, 0.745, 0.02]) },   // курсак
    { geo: box(0.26, 0.26, 0.08), color: C.cream, matrix: mx([0, 1.02, 0.635]) },   // куйруктун айланасы
    { geo: box(0.30, 0.14, 0.30), color: C.fur,   matrix: mx([0, 1.20, -0.20]) },   // кекилик
    { geo: box(0.27, 0.54, 0.29), color: C.fur,   matrix: mx([0, 1.27, -0.50], [-0.40, 0, 0]) },
    { geo: box(0.17, 0.46, 0.10), color: C.cream, matrix: mx([0, 1.21, -0.63], [-0.40, 0, 0]) },
  ]);

  /* ---------- БАШ (мүйүзү менен) ---------- */
  const hp = [
    { geo: box(0.215, 0.23, 0.32), color: C.fur,   matrix: mx([0, 0, -0.08]) },
    { geo: box(0.19, 0.10, 0.16),  color: C.fur,   matrix: mx([0, 0.105, -0.10]) },
    { geo: box(0.155, 0.15, 0.24), color: C.fur,   matrix: mx([0, -0.045, -0.31]) },
    { geo: box(0.125, 0.085, 0.07),color: C.nose,  matrix: mx([0, -0.045, -0.445]) },
    { geo: box(0.13, 0.03, 0.13),  color: C.cream, matrix: mx([0, -0.115, -0.33]) },
  ];
  for (const s of [-1, 1]) {
    hp.push({ geo: box(0.08, 0.20, 0.045), color: C.fur,
      matrix: mx([s * 0.145, 0.115, -0.01], [-0.18, 0, s * 0.55]) });
    hp.push({ geo: box(0.045, 0.14, 0.02), color: C.cream,
      matrix: mx([s * 0.155, 0.11, -0.035], [-0.18, 0, s * 0.55]) });
    hp.push({ geo: sph(0.036), color: C.eye, matrix: mx([s * 0.108, 0.02, -0.20]) });
    hp.push({ geo: cyl(0.03, 0.035, 0.06, 5), color: C.furDk, matrix: mx([s * 0.072, 0.12, -0.02]) });
    /* мүйүздүн негизги бутагы */
    hp.push({ geo: cyl(0.016, 0.028, 0.52, 5), color: C.antler,
      matrix: mx([s * 0.095, 0.37, 0.0], [-0.12, 0, s * 0.26]) });
    /* каштагы тиш */
    hp.push({ geo: cyl(0.011, 0.017, 0.18, 4), color: C.antler,
      matrix: mx([s * 0.125, 0.25, -0.15], [-0.95, 0, s * 0.45]) });
    /* капталдагы тиштер — алдыга/артка да бурулат, ошондуктан көлөмдүү көрүнөт */
    for (const t of [
      { p: [s * 0.185, 0.44, -0.10], r: [-0.45, s * 0.2, s * 0.95], l: 0.22 },
      { p: [s * 0.245, 0.56, 0.04],  r: [-0.05, s * -0.3, s * 1.05], l: 0.20 },
      { p: [s * 0.265, 0.68, 0.11],  r: [0.35, s * 0.25, s * 0.75],  l: 0.17 },
    ]) hp.push({ geo: cyl(0.010, 0.016, t.l, 4), color: C.antler, matrix: mx(t.p, t.r) });
  }
  const head = mergeParts(THREE, hp);

  /* ---------- БУТТАР ---------- */
  const upperF = mergeParts(THREE, [
    { geo: cyl(0.082, 0.055, 0.40, 6), color: C.fur, matrix: mx([0, -0.20, 0]) },
  ]);
  const upperR = mergeParts(THREE, [
    { geo: cyl(0.095, 0.060, 0.40, 6), color: C.fur, matrix: mx([0, -0.20, 0]) },
  ]);
  const lower = mergeParts(THREE, [
    { geo: cyl(0.045, 0.030, 0.36, 5), color: C.furDk, matrix: mx([0, -0.18, 0]) },
    { geo: box(0.085, 0.09, 0.13),     color: C.hoof,  matrix: mx([0, -0.39, -0.01]) },
  ]);

  /* ---------- КУЙРУК ---------- */
  const tail = mergeParts(THREE, [
    { geo: box(0.115, 0.20, 0.09), color: C.fur,   matrix: mx([0, -0.09, 0]) },
    { geo: box(0.095, 0.17, 0.03), color: C.cream, matrix: mx([0, -0.09, 0.05]) },
  ]);

  DEER_GEO = { body, head, upperF, upperR, lower, tail };
  return DEER_GEO;
}

/*
  Бугу. Бардык бугу бирдей көрүнөт — оюндун мааниси ушунда.
  Кайтарат: { group, legs[], head, tail, body, setAnim(state, dt) }
*/
export function buildDeer(rnd = Math.random, opts = {}) {
  const G = deerGeometry();
  if (!DEER_MAT) DEER_MAT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const mat = opts.material || DEER_MAT;

  const g = new THREE.Group();
  const body = new THREE.Mesh(G.body, mat);
  g.add(body);

  const head = new THREE.Group();
  head.position.set(0, 1.54, -0.72);
  head.add(new THREE.Mesh(G.head, mat));
  g.add(head);

  const tail = new THREE.Group();
  tail.position.set(0, 1.08, 0.645);
  tail.add(new THREE.Mesh(G.tail, mat));
  g.add(tail);

  /* төрт бут: [алдыңкы сол, алдыңкы оң, арткы сол, арткы оң] */
  const legs = [];
  for (const s of [
    { x: -0.17, z: -0.33, front: true },
    { x:  0.17, z: -0.33, front: true },
    { x: -0.18, z:  0.42, front: false },
    { x:  0.18, z:  0.42, front: false },
  ]) {
    const upper = new THREE.Group();
    upper.position.set(s.x, 0.82, s.z);
    upper.rotation.x = s.front ? -0.06 : 0.28;
    upper.add(new THREE.Mesh(s.front ? G.upperF : G.upperR, mat));

    const lower = new THREE.Group();
    lower.position.y = -0.40;
    lower.rotation.x = s.front ? 0.08 : -0.46;
    lower.add(new THREE.Mesh(G.lower, mat));
    upper.add(lower);

    g.add(upper);
    legs.push({ upper, lower, baseU: upper.rotation.x, baseL: lower.rotation.x });
  }

  if (opts.scale) g.scale.setScalar(opts.scale);

  const HEAD_UP = new THREE.Vector3(0, 1.54, -0.72);
  const HEAD_DOWN = new THREE.Vector3(0, 1.30, -0.86);

  const api = {
    group: g, legs, head, tail, body, male: true,
    phase: rnd() * 6.28,
    /* state: 'idle' | 'graze' | 'walk' | 'run' */
    setAnim(state, dt) {
      if (state === 'walk' || state === 'run') {
        const sp = state === 'run' ? 12 : 6.2;
        const amp = state === 'run' ? 0.62 : 0.34;
        api.phase += dt * sp;
        for (let i = 0; i < 4; i++) {
          const L = legs[i];
          const off = (i === 0 || i === 3) ? 0 : Math.PI;   // диагоналдык жүрүш
          L.upper.rotation.x = L.baseU + Math.sin(api.phase + off) * amp;
          L.lower.rotation.x = L.baseL - Math.max(0, Math.sin(api.phase + off + 1.0)) * amp * 0.9;
        }
        head.position.lerp(HEAD_UP, 1 - Math.exp(-10 * dt));
        head.rotation.x = state === 'run' ? -0.2 : -0.05;
        body.position.y = Math.abs(Math.sin(api.phase)) * (state === 'run' ? 0.055 : 0.018);
        tail.rotation.x = Math.sin(api.phase * 1.6) * 0.3;
      } else if (state === 'graze') {
        api.phase += dt * 1.3;
        relax(legs, dt);
        head.position.lerp(HEAD_DOWN, 1 - Math.exp(-7 * dt));
        head.rotation.x = 0.95 + Math.sin(api.phase) * 0.1;
        body.position.y = 0;
        tail.rotation.x = Math.sin(api.phase * 2.4) * 0.35;
      } else {
        api.phase += dt * 0.9;
        relax(legs, dt);
        head.position.lerp(HEAD_UP, 1 - Math.exp(-7 * dt));
        head.rotation.x = Math.sin(api.phase * 0.6) * 0.08;
        body.position.y = Math.sin(api.phase) * 0.006;
        tail.rotation.x = Math.sin(api.phase * 1.9) * 0.18;
      }
    },
  };
  return api;
}

function relax(legs, dt) {
  const k = 1 - Math.exp(-9 * dt);
  for (const L of legs) {
    L.upper.rotation.x += (L.baseU - L.upper.rotation.x) * k;
    L.lower.rotation.x += (L.baseL - L.lower.rotation.x) * k;
  }
}

/* ------------------------------------------------------------
   МЕРГЕНЧИ (видеодогудай кызыл көйнөкчөн адам)
------------------------------------------------------------ */
export function buildHunter() {
  const g = new THREE.Group();
  const skin = M(0xd9a06b);
  const shirt = M(0xc0392b);
  const pants = M(0x2f3640);
  const boot = M(0x1d2228);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.6, 0.26), shirt);
  torso.position.y = 1.22;
  g.add(torso);

  const head = new THREE.Group();
  head.position.y = 1.72;
  head.add(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.28, 0.26), skin));
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.1, 0.29), M(0x8e2a20));
  cap.position.y = 0.18; head.add(cap);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.03, 0.14), M(0x8e2a20));
  brim.position.set(0, 0.14, -0.2); head.add(brim);
  g.add(head);

  const arms = [], legs = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.52, 0.14), shirt);
    arm.geometry.translate(0, -0.26, 0);
    arm.position.set(s * 0.3, 1.46, 0);
    g.add(arm); arms.push(arm);

    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.62, 0.18), pants);
    leg.geometry.translate(0, -0.31, 0);
    leg.position.set(s * 0.12, 0.92, 0);
    g.add(leg); legs.push(leg);

    const b = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.12, 0.26), boot);
    b.position.set(s * 0.12, 0.06, -0.03);
    g.add(b);
  }

  /* --- ЖАА: өзүнчө топ, тартылганы көрүнүп турат --- */
  const ARC = Math.PI * 1.1, R = 0.3;
  const bowGroup = new THREE.Group();
  const limb = new THREE.Mesh(new THREE.TorusGeometry(R, 0.018, 5, 16, ARC), M(0x7a5130));
  limb.rotation.z = Math.PI - ARC / 2;
  bowGroup.add(limb);

  const sx = R * Math.cos(ARC / 2), sy = R * Math.sin(ARC / 2);
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    sx, sy, 0,  sx, 0, 0,  sx, -sy, 0,
  ]), 3));
  const bowString = new THREE.Line(sg, new THREE.LineBasicMaterial({ color: 0xf2ecdc }));
  bowGroup.add(bowString);

  /* нокталган жебе — тартканда гана көрүнөт */
  const nock = new THREE.Group();
  const shaft = new THREE.CylinderGeometry(0.009, 0.009, 0.6, 5);
  shaft.rotateX(Math.PI / 2); shaft.translate(0, 0, -0.3);
  nock.add(new THREE.Mesh(shaft, M(0xd9c49b)));
  const tipG = new THREE.ConeGeometry(0.022, 0.07, 5);
  tipG.rotateX(-Math.PI / 2); tipG.translate(0, 0, -0.63);
  nock.add(new THREE.Mesh(tipG, M(0x9aa2a8)));
  nock.position.set(sx, 0, 0);
  nock.visible = false;
  bowGroup.add(nock);

  g.add(bowGroup);

  /* эки поза: колунда салаңдап турат ↔ көздөп турат */
  const REST_P = new THREE.Vector3(-0.36, 1.18, 0.12);
  const REST_R = new THREE.Euler(0, Math.PI / 2, 0.35);
  const AIM_P  = new THREE.Vector3(0.02, 1.46, -0.34);
  const AIM_R  = new THREE.Euler(0, 0, 0);
  bowGroup.position.copy(REST_P);
  bowGroup.rotation.copy(REST_R);

  const api = {
    group: g, head, arms, legs, bowGroup, phase: 0, aim: 0,

    /* t = 0..1 — жаанын тартылышы */
    setAim(t, dt = 0.016) {
      api.aim += (t - api.aim) * (1 - Math.exp(-12 * dt));
      const a = api.aim;

      bowGroup.position.lerpVectors(REST_P, AIM_P, a);
      bowGroup.rotation.set(
        REST_R.x + (AIM_R.x - REST_R.x) * a,
        REST_R.y + (AIM_R.y - REST_R.y) * a,
        REST_R.z + (AIM_R.z - REST_R.z) * a
      );

      /* колдор алдыга көтөрүлөт */
      if (a > 0.02) {
        arms[0].rotation.x = -1.5 * a;    // сол кол жааны созуп кармайт
        arms[1].rotation.x = -0.95 * a;   // оң кол кылды тартып, бүгүлүп турат
        arms[0].rotation.z = -0.22 * a;
        arms[1].rotation.z = 0.3 * a;
      }

      /* кыл артка тартылат */
      const pull = a * 0.26;
      const pos = bowString.geometry.attributes.position;
      pos.setZ(1, pull); pos.needsUpdate = true;
      nock.position.z = pull;
      nock.visible = a > 0.05;
    },

    setAnim(state, dt) {
      const aiming = state === 'aim';
      api.setAim(aiming ? 1 : 0, dt);

      if (aiming) {
        /* көздөп турганда буттар токтойт */
        for (const l of legs) l.rotation.x *= 0.8;
        return;
      }
      if (state === 'walk' || state === 'run') {
        api.phase += dt * (state === 'run' ? 10 : 6.5);
        const s = Math.sin(api.phase) * (state === 'run' ? 0.9 : 0.5);
        legs[0].rotation.x = s; legs[1].rotation.x = -s;
        if (api.aim < 0.05) {
          arms[0].rotation.x = -s * 0.6; arms[1].rotation.x = s * 0.6;
        }
      } else {
        for (const l of legs) l.rotation.x *= 0.85;
        if (api.aim < 0.05) for (const a of arms) a.rotation.x *= 0.85;
      }
      if (api.aim < 0.05) { arms[0].rotation.z = 0; arms[1].rotation.z = 0; }
    },
  };
  return api;
}

/* ------------------------------------------------------------
   ВЕНДИГО — мергенчинин акыл-эси нөлгө түшкөндө бугу ЭКИ БУТУНА
   туруп, адам сыяктуу басат. Башы бугунуку, кызыл аура жанат.
------------------------------------------------------------ */
export function buildWendigo() {
  const G = deerGeometry();
  const g = new THREE.Group();
  const fur  = M(0x2e1c14);
  const dark = M(0x160f0c);
  const bone = M(0xc9bba1);
  const glow = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false });

  /* --- Тик турган дене --- */
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 1.05, 0.44), fur);
  torso.position.y = 1.52;
  g.add(torso);
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.4, 0.46), fur);
  chest.position.y = 1.92;
  g.add(chest);

  /* ачылган кабыргалар */
  for (let i = 0; i < 5; i++) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.05, 0.47), bone);
    rib.position.set(0, 1.2 + i * 0.17, 0.0);
    g.add(rib);
  }

  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, 0.24), fur);
  neck.position.set(0, 2.24, -0.02);
  g.add(neck);

  /* --- БАШ: чыныгы бугунун башы, кара түктө --- */
  const head = new THREE.Group();
  head.position.set(0, 2.44, -0.02);
  const skull = new THREE.Mesh(G.head, fur);
  skull.scale.setScalar(1.15);
  head.add(skull);
  /* ачылган жаак */
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 0.3), bone);
  jaw.position.set(0, -0.16, -0.34);
  jaw.rotation.x = 0.3;
  head.add(jaw);
  /* жанган кызыл көздөр */
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 7, 6),
      new THREE.MeshBasicMaterial({ color: 0xff3418 }));
    eye.position.set(s * 0.125, 0.025, -0.235);
    head.add(eye);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.1, 7, 6), glow(0xff3a20, 0.3));
    halo.position.copy(eye.position);
    head.add(halo);
  }
  g.add(head);

  /* --- Колдор (мурунку алдыңкы буттар) --- */
  const arms = [], legs = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.86, 3, 6), fur);
    arm.geometry.translate(0, -0.43, 0);
    arm.position.set(s * 0.33, 2.0, 0);
    arm.rotation.z = s * 0.12;
    g.add(arm); arms.push(arm);

    const claw = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 4), bone);
    claw.position.set(0, -0.92, 0);
    claw.rotation.x = Math.PI;
    arm.add(claw);

    /* --- Арткы буттар: бугунукундай артка ийилген --- */
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.56, 3, 6), fur);
    thigh.geometry.translate(0, -0.28, 0);
    thigh.position.set(s * 0.16, 1.05, 0);
    g.add(thigh); legs.push(thigh);

    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.48, 3, 6), dark);
    shin.geometry.translate(0, -0.24, 0);
    shin.position.set(0, -0.56, 0.08);
    shin.rotation.x = -0.5;
    thigh.add(shin);

    const hoof = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.1, 0.26), bone);
    hoof.position.set(0, -0.48, -0.08);
    hoof.rotation.x = 0.5;
    shin.add(hoof);
  }

  /* --- Кызыл аура: денеге жабышкан жука жарык --- */
  const aura = new THREE.Mesh(new THREE.SphereGeometry(0.52, 12, 10), glow(0xff2414, 0.07));
  aura.position.y = 1.6;
  aura.scale.set(0.95, 2.1, 0.95);
  g.add(aura);
  const auraLight = new THREE.PointLight(0xff3018, 2.0, 8, 1.9);
  auraLight.position.y = 1.7;
  g.add(auraLight);

  const api = {
    group: g, head, arms, legs, aura, auraLight, phase: 0,
    setAnim(state, dt) {
      api.phase += dt * (state === 'run' ? 8.5 : state === 'idle' ? 1.6 : 5);
      const amp = state === 'idle' ? 0.1 : (state === 'run' ? 0.85 : 0.5);
      const s = Math.sin(api.phase) * amp;
      legs[0].rotation.x = s;  legs[1].rotation.x = -s;
      arms[0].rotation.x = -s * 0.75; arms[1].rotation.x = s * 0.75;
      head.rotation.x = -0.1 + Math.sin(api.phase * 0.7) * 0.05;
      torso.position.y = 1.52 + Math.abs(Math.sin(api.phase)) * (state === 'run' ? 0.05 : 0.015);
      aura.material.opacity = 0.07 + Math.sin(api.phase * 2.1) * 0.025;
      auraLight.intensity = 1.8 + Math.sin(api.phase * 2.1) * 0.7;
    },
  };
  return api;
}

/* ------------------------------------------------------------
   ДУБАЛ АРКЫЛУУ КӨРҮНГӨН ЭЛЕС (x-ray силуэт)
   Бугулар мергенчини таштын, дарактын артынан да көрүп турат.
------------------------------------------------------------ */
export function addXRaySilhouette(group, color = 0xffffff) {
  const mat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.72,
    depthTest: false,      // ← дубалдын артынан да көрүнөт
    depthWrite: false, fog: false,
  });

  const meshes = [];
  group.traverse((o) => { if (o.isMesh && o.geometry) meshes.push(o); });

  const ghosts = [];
  for (const o of meshes) {
    const c = new THREE.Mesh(o.geometry, mat);
    c.scale.setScalar(1.05);
    c.renderOrder = 999;
    c.visible = false;
    o.add(c);
    ghosts.push(c);
  }

  return {
    material: mat,
    setVisible(v) { for (const c of ghosts) c.visible = v; },
    setOpacity(o) { mat.opacity = o; },
  };
}
