/* ============================================================
   Дүйнө: жер, асман, жарык, дарактар, таштар, козу карындар, чөп.
   Күн/түн: түн КЕСКИН кирет (CFG.round.nightFade секундда).
   ============================================================ */

import * as THREE from './lib/three.module.js';
import { CFG } from './config.js';
import { makeRandom, fbm, lerp, clamp,
         birchTexture, barkTexture, groundTexture } from './utils.js';

export class World {
  constructor(scene, seed = 20261028) {
    this.scene = scene;
    this.rnd = makeRandom(seed);

    this.colliders = [];   // {x,z,r,top?} — кире албаган нерселер
    this.platforms = [];   // {x,z,r,top} — таштардын үстү (чыгып турса болот)
    this.trees = [];
    this.mushrooms = [];   // бугулар жей турган
    this.glowMats = [];

    this.nightBlend = 0;   // 0 = күндүз, 1 = түн
    this.targetNight = 0;
    this.elapsed = 0;

    this._buildSky();
    this._buildLights();
    this._buildGround();
    this._buildTrees();
    this._buildRocks();
    this._buildBushes();
    this._buildMushrooms();
    this._buildFlowers();
    this._buildGlowPlants();
    this._buildGrass();
  }

  get isNight() { return this.nightBlend > 0.5; }

  /* Түндү күйгүзүү / өчүрүү — кескин өтөт */
  setNight(on) { this.targetNight = on ? 1 : 0; }

  /* ---------- Жердин бийиктиги ---------- */
  heightAt(x, z) {
    const s = CFG.world.size;
    const h = CFG.world.hillHeight;
    const d = Math.sqrt(x * x + z * z) / (s * 0.5);
    const flat = clamp(1 - Math.exp(-d * 2.2), 0, 1);
    const n = fbm(x * 0.012 + 50, z * 0.012 + 50, 4);
    const n2 = fbm(x * 0.045, z * 0.045, 2) * 0.25;
    return (n - 0.5) * 2 * h * flat + n2 * flat * 2;
  }

  /* ---------- Асман ---------- */
  _buildSky() {
    const geo = new THREE.SphereGeometry(400, 24, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: {
        topColor:    { value: new THREE.Color(0x4fa3e0) },
        bottomColor: { value: new THREE.Color(0xcfe6f2) },
      },
      vertexShader: `varying vec3 vPos;
        void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 topColor; uniform vec3 bottomColor; varying vec3 vPos;
        void main(){
          float h = clamp(normalize(vPos).y * 0.5 + 0.5, 0.0, 1.0);
          gl_FragColor = vec4(mix(bottomColor, topColor, pow(h, 0.75)), 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);

    const sg = new THREE.BufferGeometry();
    const n = 700, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = this.rnd() * Math.PI * 2;
      const v = this.rnd() * 0.75 + 0.05;
      pos[i * 3]     = Math.cos(u) * Math.cos(v) * 350;
      pos[i * 3 + 1] = Math.sin(v) * 350;
      pos[i * 3 + 2] = Math.sin(u) * Math.cos(v) * 350;
    }
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.starsMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.7, transparent: true, opacity: 0 });
    this.stars = new THREE.Points(sg, this.starsMat);
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);

    /* Толгон ай — түн киргенде чыгат */
    this.moonMat = new THREE.MeshBasicMaterial({ color: 0xfff3d8, transparent: true, opacity: 0, fog: false });
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(16, 20, 16), this.moonMat);
    this.moon.frustumCulled = false;
    this.scene.add(this.moon);

    this.moonHaloMat = new THREE.MeshBasicMaterial({
      color: 0xffe7b0, transparent: true, opacity: 0, side: THREE.BackSide, fog: false, depthWrite: false,
    });
    this.moonHalo = new THREE.Mesh(new THREE.SphereGeometry(30, 16, 12), this.moonHaloMat);
    this.moonHalo.frustumCulled = false;
    this.scene.add(this.moonHalo);
  }

  _buildLights() {
    this.sun = new THREE.DirectionalLight(0xfff2d0, 1.5);
    this.sun.position.set(40, 70, 20);
    this.scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xbfe4ff, 0x3f6a2e, 0.85);
    this.scene.add(this.hemi);

    this.fog = new THREE.Fog(0xbfd9e8, CFG.world.fogNear, CFG.world.fogFar);
    this.scene.fog = this.fog;
  }

  /* ---------- Жер ---------- */
  _buildGround() {
    const s = CFG.world.size, seg = CFG.world.segments;
    const geo = new THREE.PlaneGeometry(s, s, seg, seg);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const cA = new THREE.Color(0x4d8f3a), cB = new THREE.Color(0x6fae45), cC = new THREE.Color(0x7a6a44);

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const y = this.heightAt(x, z);
      pos.setY(i, y);
      const t = clamp((y + 3) / 9, 0, 1);
      const c = cA.clone().lerp(cB, fbm(x * 0.06, z * 0.06, 2));
      c.lerp(cC, clamp((t - 0.72) * 2.4, 0, 0.55));
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    this.groundMat = new THREE.MeshLambertMaterial({
      map: groundTexture(THREE, this.rnd), vertexColors: true,
    });
    this.ground = new THREE.Mesh(geo, this.groundMat);
    this.scene.add(this.ground);

    const wg = new THREE.PlaneGeometry(s * 2.6, s * 2.6);
    wg.rotateX(-Math.PI / 2);
    this.waterMat = new THREE.MeshLambertMaterial({ color: 0x2f6f9e, transparent: true, opacity: 0.82 });
    this.water = new THREE.Mesh(wg, this.waterMat);
    this.water.position.y = -3.2;
    this.scene.add(this.water);
  }

  _spot(minR = 6, maxR = CFG.world.size * 0.46) {
    for (let i = 0; i < 40; i++) {
      const a = this.rnd() * Math.PI * 2;
      const r = minR + this.rnd() * (maxR - minR);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (this.heightAt(x, z) > -2.4) return { x, z, y: this.heightAt(x, z) };
    }
    return { x: 0, z: 0, y: this.heightAt(0, 0) };
  }

  /* ---------- Дарактар ----------
     Instancing менен: 190 дарак = 760 меш эмес, 8 гана чакырык.
     Телефондо чоң айырма. */
  _buildTrees() {
    const rnd = this.rnd;

    /* 1-кадам: бардык дарактын ордун эсептеп алабыз */
    const birchList = [], barkList = [];
    const leafLists = [[], [], [], [], [], []];

    for (let i = 0; i < CFG.world.trees; i++) {
      const p = this._spot(14);
      const birch = rnd() > 0.45;
      const hgt = 5 + rnd() * 6;
      const yaw = rnd() * 6.28;

      (birch ? birchList : barkList).push({
        x: p.x, y: p.y, z: p.z, h: hgt, yaw,
        sx: 1 + rnd() * 0.3, sz: 1 + rnd() * 0.3,
      });

      const autumn = rnd() > 0.78;
      const blobs = 2 + (rnd() * 3 | 0);
      for (let b = 0; b < blobs; b++) {
        const ci = autumn ? 3 + (rnd() * 3 | 0) : (rnd() * 3 | 0);
        const sc = 1.5 + rnd() * 1.5;
        leafLists[ci].push({
          x: p.x + (rnd() - 0.5) * 2.2,
          y: p.y + hgt * (0.78 + rnd() * 0.3),
          z: p.z + (rnd() - 0.5) * 2.2,
          sx: sc, sy: sc * (0.7 + rnd() * 0.4), sz: sc,
          rx: rnd() * 3, ry: rnd() * 3, rz: rnd() * 3,
        });
      }

      const col = { x: p.x, z: p.z, r: 0.75 };
      this.colliders.push(col);
      this.trees.push({ x: p.x, y: p.y, z: p.z, h: hgt, col });
    }

    /* 2-кадам: instanced меш-терди курабыз */
    const trunkGeo = new THREE.CylinderGeometry(0.17, 0.26, 1, 7, 1);
    trunkGeo.translate(0, 0.5, 0);
    const leafGeo = new THREE.IcosahedronGeometry(1, 0);
    const d = new THREE.Object3D();

    const makeTrunks = (list, mat) => {
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(trunkGeo, mat, list.length);
      list.forEach((t, i) => {
        d.position.set(t.x, t.y, t.z);
        d.rotation.set(0, t.yaw, 0);
        d.scale.set(t.sx, t.h, t.sz);
        d.updateMatrix();
        mesh.setMatrixAt(i, d.matrix);
      });
      this.scene.add(mesh);
    };
    makeTrunks(birchList, new THREE.MeshLambertMaterial({ map: birchTexture(THREE, rnd) }));
    makeTrunks(barkList,  new THREE.MeshLambertMaterial({ map: barkTexture(THREE, rnd) }));

    const leafColors = [0x4e9e35, 0x62b544, 0x3d8a2c, 0x8d2b22, 0xa8402c, 0xc27a1e];
    leafLists.forEach((list, ci) => {
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(
        leafGeo,
        new THREE.MeshLambertMaterial({ color: leafColors[ci], flatShading: true }),
        list.length
      );
      list.forEach((l, i) => {
        d.position.set(l.x, l.y, l.z);
        d.rotation.set(l.rx, l.ry, l.rz);
        d.scale.set(l.sx, l.sy, l.sz);
        d.updateMatrix();
        mesh.setMatrixAt(i, d.matrix);
      });
      this.scene.add(mesh);
    });
  }

  _buildRocks() {
    const rnd = this.rnd;
    const mesh = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(1, 0),
      new THREE.MeshLambertMaterial({ color: 0x9aa3a8, flatShading: true }),
      CFG.world.rocks
    );
    const d = new THREE.Object3D();
    for (let i = 0; i < CFG.world.rocks; i++) {
      const p = this._spot(8);
      const s = 0.7 + rnd() * 2.6;
      const sy = s * (0.5 + rnd() * 0.5);
      d.position.set(p.x, p.y + s * 0.25, p.z);
      d.scale.set(s, sy, s * (0.8 + rnd() * 0.5));
      d.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix);

      if (s > 1.3) {
        /* top = үстүнө чыгып турса боло турган бийиктик */
        const top = p.y + s * 0.25 + sy * 0.86;
        const col = { x: p.x, z: p.z, r: s * 0.8, top };
        this.colliders.push(col);
        /* үстүндө тура турган аянтча */
        this.platforms.push({ x: p.x, z: p.z, r: s * 0.62, top, cd: 0 });
      }
    }
    this.scene.add(mesh);
  }

  _buildBushes() {
    const rnd = this.rnd;
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const mats = [0x3f8a2e, 0x4fa03a, 0x2f7526].map(c => new THREE.MeshLambertMaterial({ color: c, flatShading: true }));
    const per = Math.ceil(CFG.world.bushes / mats.length);
    const d = new THREE.Object3D();
    mats.forEach(mat => {
      const mesh = new THREE.InstancedMesh(geo, mat, per);
      for (let i = 0; i < per; i++) {
        const p = this._spot(10);
        const s = 0.8 + rnd() * 1.5;
        d.position.set(p.x, p.y + s * 0.4, p.z);
        d.scale.set(s, s * 0.8, s);
        d.rotation.set(rnd(), rnd() * 3, rnd());
        d.updateMatrix();
        mesh.setMatrixAt(i, d.matrix);
      }
      this.scene.add(mesh);
    });
  }

  /* ---------- Козу карындар (бугулар жейт, кайра өсөт) ---------- */
  _buildMushrooms() {
    const rnd = this.rnd;
    const stemGeo = new THREE.CylinderGeometry(0.05, 0.07, 0.22, 6);
    const capGeo  = new THREE.SphereGeometry(0.17, 8, 6, 0, 6.3, 0, 1.4);
    const stemMat = new THREE.MeshLambertMaterial({ color: 0xf0e6d2 });
    const capMat  = new THREE.MeshLambertMaterial({ color: 0xcf2a22 });
    const dotMat  = new THREE.MeshLambertMaterial({ color: 0xf7f1e4 });

    this.mushGroup = new THREE.Group();
    this.scene.add(this.mushGroup);

    for (let i = 0; i < CFG.world.mushrooms; i++) {
      const p = this._spot(5);
      const g = new THREE.Group();
      const s = new THREE.Mesh(stemGeo, stemMat); s.position.y = 0.11;
      const c = new THREE.Mesh(capGeo, capMat);   c.position.y = 0.22;
      g.add(s, c);
      for (let k = 0; k < 3; k++) {
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.028, 5, 4), dotMat);
        const a = rnd() * 6.28, r = 0.05 + rnd() * 0.08;
        dot.position.set(Math.cos(a) * r, 0.3, Math.sin(a) * r);
        g.add(dot);
      }
      g.scale.setScalar(0.85 + rnd() * 0.8);
      g.position.set(p.x, p.y, p.z);
      this.mushGroup.add(g);
      this.mushrooms.push({ obj: g, x: p.x, y: p.y, z: p.z, eaten: false, regrow: 0 });
    }
  }

  _buildFlowers() {
    const rnd = this.rnd;
    const geo = new THREE.SphereGeometry(0.08, 5, 4);
    const mats = [0xf2e34a, 0xf0f0f0, 0xd96fd0, 0xf09a3a].map(c => new THREE.MeshBasicMaterial({ color: c }));
    const per = Math.ceil(CFG.world.flowers / mats.length);
    const d = new THREE.Object3D();
    mats.forEach(mat => {
      const mesh = new THREE.InstancedMesh(geo, mat, per);
      for (let i = 0; i < per; i++) {
        const p = this._spot(2);
        d.position.set(p.x, p.y + 0.18, p.z);
        d.scale.setScalar(0.7 + rnd() * 0.6);
        d.updateMatrix();
        mesh.setMatrixAt(i, d.matrix);
      }
      this.scene.add(mesh);
    });
  }

  _buildGlowPlants() {
    const rnd = this.rnd;
    const geo = new THREE.ConeGeometry(0.1, 0.5, 5);
    const d = new THREE.Object3D();
    const per = Math.ceil(CFG.world.glowPlants / 3);
    [0xff5fd0, 0x7ae8ff, 0xc9ff5f].forEach(c => {
      const mat = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.2 });
      this.glowMats.push(mat);
      const mesh = new THREE.InstancedMesh(geo, mat, per * 3);
      let k = 0;
      for (let i = 0; i < per; i++) {
        const p = this._spot(5);
        for (let j = 0; j < 3; j++) {
          d.position.set(p.x + (rnd() - 0.5) * 0.9, p.y + 0.25, p.z + (rnd() - 0.5) * 0.9);
          d.scale.setScalar(0.7 + rnd() * 0.9);
          d.rotation.set((rnd() - 0.5) * 0.5, rnd() * 3, (rnd() - 0.5) * 0.5);
          d.updateMatrix();
          mesh.setMatrixAt(k++, d.matrix);
        }
      }
      this.scene.add(mesh);
    });
  }

  _buildGrass() {
    const rnd = this.rnd;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      -0.045, 0, 0,  0.045, 0, 0,  0.0, 0.55, 0,
      -0.03, 0.3, 0, 0.03, 0.3, 0, 0.0, 0.75, 0,
    ]), 3));
    g.computeVertexNormals();

    const mesh = new THREE.InstancedMesh(
      g,
      new THREE.MeshLambertMaterial({ color: 0x69b63f, side: THREE.DoubleSide, flatShading: true }),
      CFG.world.grass
    );
    const d = new THREE.Object3D();
    const colorAttr = new Float32Array(CFG.world.grass * 3);
    const c = new THREE.Color();
    for (let i = 0; i < CFG.world.grass; i++) {
      const p = this._spot(2, CFG.world.size * 0.47);
      d.position.set(p.x, p.y, p.z);
      d.rotation.set(0, rnd() * 6.28, (rnd() - 0.5) * 0.25);
      d.scale.set(1, 0.7 + rnd() * 1.1, 1);
      d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix);
      c.setHSL(0.26 + rnd() * 0.06, 0.55, 0.32 + rnd() * 0.18);
      c.toArray(colorAttr, i * 3);
    }
    mesh.instanceColor = new THREE.InstancedBufferAttribute(colorAttr, 3);
    this.scene.add(mesh);
  }

  /* Бугу козу карын жеди */
  eatMushroom(m) {
    m.eaten = true;
    m.obj.visible = false;
    m.regrow = 25 + Math.random() * 20;
  }

  /* Эң жакын жей турган козу карын */
  nearestMushroom(x, z, maxDist = 2.6) {
    let best = null, bd = maxDist * maxDist;
    for (const m of this.mushrooms) {
      if (m.eaten) continue;
      const dx = m.x - x, dz = m.z - z, d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  /*
    Тоскоолдуктарды эсепке алып жылдыруу.
    feetY берилсе, аяк таштын үстүнөн жогору болсо — ал таш тоспойт
    (анын үстүндө басып жүрө берет).
  */
  resolveCollision(x, z, radius, feetY) {
    for (const c of this.colliders) {
      if (c.r <= 0) continue;
      if (feetY !== undefined && c.top !== undefined && feetY >= c.top - 0.3) continue;
      const dx = x - c.x, dz = z - c.z;
      const rr = c.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        x = c.x + (dx / d) * rr;
        z = c.z + (dz / d) * rr;
      }
    }
    const lim = CFG.world.size * 0.48;
    return { x: clamp(x, -lim, lim), z: clamp(z, -lim, lim) };
  }

  /*
    Берилген чекиттин астындагы таштын үстүн табат.
    feetY — оюнчунун аягы. Ташка жерден эмес, үстүнөн түшкөндө гана конот.
  */
  platformAt(x, z, feetY) {
    let best = null;
    for (const p of this.platforms) {
      if (p.cd > 0) continue;
      const dx = x - p.x, dz = z - p.z;
      if (dx * dx + dz * dz > p.r * p.r) continue;
      if (feetY < p.top - 0.45) continue;              // астында турат
      if (!best || p.top > best.top) best = p;
    }
    return best;
  }

  /* Жакын жерде чыгууга боло турган таш барбы? (mantle) */
  mantleTarget(x, z, feetY, reach = 1.2) {
    let best = null;
    for (const p of this.platforms) {
      if (p.cd > 0) continue;
      const d = Math.hypot(x - p.x, z - p.z);
      if (d > p.r + reach) continue;
      const up = p.top - feetY;
      if (up < 0.25 || up > CFG.rock.mantleHeight) continue;
      if (!best || p.top > best.top) best = p;
    }
    return best;
  }

  /* ---------- Ар кадамда ---------- */
  update(dt, camera) {
    this.elapsed += dt;

    /* Түн кескин кирет */
    const rate = 1 / Math.max(0.1, CFG.round.nightFade);
    if (this.nightBlend < this.targetNight) this.nightBlend = Math.min(this.targetNight, this.nightBlend + rate * dt);
    else if (this.nightBlend > this.targetNight) this.nightBlend = Math.max(this.targetNight, this.nightBlend - rate * dt);

    const n = this.nightBlend;
    const day = 1 - n;

    /* Күн жай жылат (көрүнүш үчүн) */
    const ang = this.elapsed * 0.012;
    this.sun.position.set(Math.cos(ang) * 80, 60 - n * 95, Math.sin(ang) * 50);
    if (camera) {
      this.sun.target.position.copy(camera.position);
      this.sun.target.updateMatrixWorld();
      this.sky.position.copy(camera.position);
      this.stars.position.copy(camera.position);
      this.water.position.x = camera.position.x;
      this.water.position.z = camera.position.z;
    }

    /* Түстөр */
    const skyTop = new THREE.Color(0x3f93dc).lerp(new THREE.Color(0x120406), n);
    const skyBot = new THREE.Color(0xcfe6f2).lerp(new THREE.Color(0x2a0709), n);
    this.sky.material.uniforms.topColor.value.copy(skyTop);
    this.sky.material.uniforms.bottomColor.value.copy(skyBot);

    const fogC = new THREE.Color(0xbfd9e8).lerp(new THREE.Color(0x3a0c10), n);
    this.fog.color.copy(fogC);
    this.scene.background = fogC;
    this.fog.far  = lerp(CFG.world.fogFar, 42, n);
    this.fog.near = lerp(CFG.world.fogNear, 2, n);

    /* Түнкүсүн ай жарыгы калат — караңгы, бирок жол көрүнөт */
    this.sun.intensity = lerp(1.55, 0.5, n);
    this.sun.color.setHex(0xfff2d0).lerp(new THREE.Color(0x9a4a52), n);
    this.hemi.intensity = lerp(0.9, 0.42, n);
    this.hemi.color.setHex(0xbfe4ff).lerp(new THREE.Color(0x7a2630), n);
    this.hemi.groundColor.setHex(0x3f6a2e).lerp(new THREE.Color(0x401418), n);

    this.starsMat.opacity = n * 0.9;
    this.glowMats.forEach(m => { m.opacity = lerp(0.12, 1.0, n); });

    /* Ай: түн киргенде көтөрүлөт */
    const mp = new THREE.Vector3(-150, -40 + n * 180, -230);
    if (camera) mp.add(camera.position);
    this.moon.position.copy(mp);
    this.moonHalo.position.copy(mp);
    this.moonMat.opacity = n;
    this.moonHaloMat.opacity = n * 0.22;
    this.waterMat.color.setHex(0x2f6f9e).lerp(new THREE.Color(0x160a16), n);

    /* Таштардын "кайра чыгууга болбойт" убактысы */
    for (const p of this.platforms) if (p.cd > 0) p.cd -= dt;

    /* Козу карындар кайра өсөт */
    for (const m of this.mushrooms) {
      if (!m.eaten) continue;
      m.regrow -= dt;
      if (m.regrow <= 0) { m.eaten = false; m.obj.visible = true; }
    }

    void day;
  }
}
