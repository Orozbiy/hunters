/* ============================================================
   Жебелер (физика менен) жана аларды тейлөө.
   ============================================================ */

import * as THREE from './lib/three.module.js';
import { CFG } from './config.js';

/*
  A→B кесиндиси (cx,cy,cz) борборлуу, r радиустуу шарды кесеби?
  Кайтарат: кесишкен жердин t мааниси (0..1), же тийбесе -1.
*/
function segSphere(ax, ay, az, bx, by, bz, cx, cy, cz, r) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const fx = ax - cx, fy = ay - cy, fz = az - cz;

  const A = dx * dx + dy * dy + dz * dz;
  if (A < 1e-9) return (fx * fx + fy * fy + fz * fz <= r * r) ? 0 : -1;

  const B = 2 * (fx * dx + fy * dy + fz * dz);
  const Cc = fx * fx + fy * fy + fz * fz - r * r;

  const disc = B * B - 4 * A * Cc;
  if (disc < 0) return -1;

  const sq = Math.sqrt(disc);
  const t1 = (-B - sq) / (2 * A);
  if (t1 >= 0 && t1 <= 1) return t1;
  const t2 = (-B + sq) / (2 * A);
  if (t2 >= 0 && t2 <= 1) return t2;
  /* эки чекит тең кесиндиден тышкары, бирок башы шардын ичинде болсо */
  return (Cc <= 0) ? 0 : -1;
}

export class ArrowSystem {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.pool = [];
    this.active = [];

    const shaft = new THREE.CylinderGeometry(0.012, 0.012, 0.8, 5);
    shaft.rotateX(Math.PI / 2);
    const tip = new THREE.ConeGeometry(0.03, 0.1, 5);
    tip.rotateX(-Math.PI / 2);
    tip.translate(0, 0, -0.44);

    this.geoShaft = shaft;
    this.geoTip = tip;
    this.matShaft = new THREE.MeshLambertMaterial({ color: 0xc9b089 });
    this.matTip   = new THREE.MeshLambertMaterial({ color: 0x8e9499 });
    this.matFletch = new THREE.MeshLambertMaterial({ color: 0xdd4433, side: THREE.DoubleSide });
  }

  _make() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(this.geoShaft, this.matShaft));
    g.add(new THREE.Mesh(this.geoTip, this.matTip));
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.14), this.matFletch);
    fl.position.z = 0.33;
    g.add(fl);
    const fl2 = fl.clone(); fl2.rotation.z = Math.PI / 2;
    g.add(fl2);
    this.scene.add(g);
    return g;
  }

  /* owner: 'me' | 'remote' | 'bot' */
  shoot(origin, dir, power, owner = 'me') {
    const obj = this.pool.pop() || this._make();
    obj.visible = true;
    obj.position.copy(origin);
    const v = dir.clone().multiplyScalar(CFG.bow.arrowSpeed * (0.5 + power * 0.5));
    this.active.push({ obj, v, life: CFG.bow.arrowLife, stuck: false, owner });
  }

  /*
    hitTargets: [{ x, y, z, r, onHit(arrow) }]

    ⚠️ Жебе секундасына ~46 метр учат — бир кадрда 1–1.5 метр жылат.
    Ошондуктан "азыркы ордун" гана текшерсек, жебе денеден тешип өтүп кетет.
    Биз мурунку орду менен жаңы ордунун ОРТОСУНДАГЫ КЕСИНДИНИ текшеребиз.
  */
  update(dt, hitTargets = []) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const a = this.active[i];
      a.life -= dt;

      if (!a.stuck) {
        const px = a.obj.position.x, py = a.obj.position.y, pz = a.obj.position.z;

        a.v.y -= CFG.bow.arrowGravity * dt;
        a.obj.position.addScaledVector(a.v, dt);
        a.obj.lookAt(a.obj.position.clone().add(a.v));

        const nx = a.obj.position.x, ny = a.obj.position.y, nz = a.obj.position.z;

        /* --- Нысанага тийдиби? (кесинди ↔ шар) --- */
        let hit = null, hitT = 2;
        for (const t of hitTargets) {
          const s = segSphere(px, py, pz, nx, ny, nz, t.x, t.y, t.z, t.r);
          if (s >= 0 && s < hitT) { hitT = s; hit = t; }
        }
        if (hit) {
          a.obj.position.set(px + (nx - px) * hitT, py + (ny - py) * hitT, pz + (nz - pz) * hitT);
          a.stuck = true;
          a.life = 0.35;
          hit.onHit && hit.onHit(a);
        }

        /* --- Жерге / даракка тийдиби? (кесиндини бөлүп текшеребиз) --- */
        if (!a.stuck) {
          const dist = Math.hypot(nx - px, ny - py, nz - pz);
          const steps = Math.max(1, Math.min(8, Math.ceil(dist / 0.4)));
          for (let s = 1; s <= steps; s++) {
            const k = s / steps;
            const x = px + (nx - px) * k, y = py + (ny - py) * k, z = pz + (nz - pz) * k;
            if (y <= this.world.heightAt(x, z) + 0.02) {
              a.obj.position.set(x, y, z);
              a.stuck = true; a.life = Math.min(a.life, 4);
              break;
            }
            let blocked = false;
            for (const c of this.world.colliders) {
              if (c.r <= 0) continue;
              const ox = x - c.x, oz = z - c.z;
              if (ox * ox + oz * oz < c.r * c.r) { blocked = true; break; }
            }
            if (blocked) {
              a.obj.position.set(x, y, z);
              a.stuck = true; a.life = Math.min(a.life, 4);
              break;
            }
          }
        }
      }

      if (a.life <= 0) {
        a.obj.visible = false;
        this.pool.push(a.obj);
        this.active.splice(i, 1);
      }
    }
  }

  clear() {
    for (const a of this.active) { a.obj.visible = false; this.pool.push(a.obj); }
    this.active.length = 0;
  }
}

/* ============================================================
   ҮН БЕЛГИЛЕРИ
   Бугу секиргенде / жегенде / курсагы корулдаганда мергенчиге
   ошол жерде кеңейген шакек көрүнөт. Бот бугулар СЕКИРЕ АЛБАЙТ —
   ошондуктан секирүү эң коркунучтуу үн.
   ============================================================ */
export class NoisePings {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.list = [];
    this.geo = new THREE.RingGeometry(0.85, 1, 24);
    this.geo.rotateX(-Math.PI / 2);
  }

  spawn(x, z, color = 0xffe08a) {
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.85,
      depthTest: false, depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    const m = new THREE.Mesh(this.geo, mat);
    m.position.set(x, this.world.heightAt(x, z) + 0.12, z);
    m.renderOrder = 998;
    m.scale.setScalar(0.4);
    this.scene.add(m);
    this.list.push({ m, t: 0 });
  }

  update(dt, visible) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.t += dt;
      const k = p.t / CFG.noise.life;
      p.m.scale.setScalar(0.4 + k * 5.5);
      p.m.material.opacity = Math.max(0, 0.85 * (1 - k));
      p.m.visible = visible;
      if (k >= 1) {
        this.scene.remove(p.m);
        p.m.material.dispose();
        this.list.splice(i, 1);
      }
    }
  }

  clear() {
    for (const p of this.list) { this.scene.remove(p.m); p.m.material.dispose(); }
    this.list.length = 0;
  }
}

/* ============================================================
   TRAIL CAM — мергенчи коёт, 180° бурчта кыймылды байкайт
   ============================================================ */
export class TrailCams {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.list = [];
    this.left = CFG.cam.count;
  }

  _build() {
    const g = new THREE.Group();
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.05, 1.1, 5),
      new THREE.MeshLambertMaterial({ color: 0x4a4038, flatShading: true })
    );
    post.position.y = 0.55;
    g.add(post);
    const boxm = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.22, 0.13),
      new THREE.MeshLambertMaterial({ color: 0x3c4a35, flatShading: true })
    );
    boxm.position.y = 1.15;
    g.add(boxm);
    const lens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.04, 8),
      new THREE.MeshBasicMaterial({ color: 0x101418 })
    );
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, 1.16, -0.08);
    g.add(lens);
    const led = new THREE.Mesh(
      new THREE.SphereGeometry(0.022, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0x33ff55 })
    );
    led.position.set(0.07, 1.22, -0.07);
    g.add(led);
    g.userData.led = led;
    return g;
  }

  place(x, z, yaw) {
    if (this.left <= 0) return null;
    this.left--;
    const g = this._build();
    g.position.set(x, this.world.heightAt(x, z), z);
    g.rotation.y = yaw;
    this.scene.add(g);
    const cam = { g, x, z, yaw, cd: 0, led: g.userData.led };
    this.list.push(cam);
    return cam;
  }

  /* targets: [{x,z}] — текшерилүүчү бугулар. onDetect(x,z) чакырылат. */
  update(dt, targets, onDetect) {
    for (const c of this.list) {
      c.cd = Math.max(0, c.cd - dt);
      const hot = c.cd > CFG.cam.cooldown - 1.2;
      c.led.material.color.setHex(hot ? 0xff3322 : 0x33ff55);
      if (c.cd > 0) continue;

      const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
      for (const t of targets) {
        const dx = t.x - c.x, dz = t.z - c.z;
        const d = Math.hypot(dx, dz);
        if (d > CFG.cam.range || d < 0.3) continue;
        if ((dx / d) * fx + (dz / d) * fz < Math.cos(CFG.cam.angle)) continue;
        c.cd = CFG.cam.cooldown;
        onDetect && onDetect(t.x, t.z);
        break;
      }
    }
  }

  clear() {
    for (const c of this.list) this.scene.remove(c.g);
    this.list.length = 0;
    this.left = CFG.cam.count;
  }
}

/* ============================================================
   ҮЙ (CABIN) — түндө мергенчинин жалгыз кутулуу жолу
   ============================================================ */
export class Cabin {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.active = false;

    const g = new THREE.Group();
    const wood = new THREE.MeshLambertMaterial({ color: 0x6b4a2c, flatShading: true });
    const roof = new THREE.MeshLambertMaterial({ color: 0x4a3524, flatShading: true });

    const walls = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.6, 3.6), wood);
    walls.position.y = 1.3;
    g.add(walls);

    const top = new THREE.Mesh(new THREE.ConeGeometry(3.3, 1.5, 4), roof);
    top.position.y = 3.35;
    top.rotation.y = Math.PI / 4;
    g.add(top);

    const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.8, 0.12),
      new THREE.MeshLambertMaterial({ color: 0x33241a, flatShading: true }));
    door.position.set(0, 0.9, -1.84);
    g.add(door);

    /* терезеден жарык — алыстан көрүнүп турат */
    for (const s of [-1, 1]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.7),
        new THREE.MeshBasicMaterial({ color: 0xffd98a }));
      win.position.set(s * 1.3, 1.6, -1.81);
      g.add(win);
    }
    const lamp = new THREE.PointLight(0xffc266, 3.2, 16, 1.6);
    lamp.position.set(0, 2, -2.4);
    g.add(lamp);

    /* Асманга чыккан КЫЗЫЛ мамы — чыныгы оюндагыдай үй кызыл менен
       белгиленет. Дарактын артынан да көрүнсүн деп depthTest өчүк. */
    this.beamMat = new THREE.MeshBasicMaterial({
      color: 0xff3326, transparent: true, opacity: 0.16,
      side: THREE.DoubleSide, depthWrite: false, depthTest: false, fog: false,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 2.0, 40, 10, 1, true), this.beamMat);
    beam.position.y = 20;
    beam.renderOrder = 997;
    g.add(beam);
    this.beam = beam;

    /* эшиктин алдындагы кызыл тегерек */
    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0xff3326, transparent: true, opacity: 0.5,
      side: THREE.DoubleSide, depthWrite: false, fog: false,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(CFG.cabin.radius - 0.35, CFG.cabin.radius, 28), this.ringMat);
    ring.rotateX(-Math.PI / 2);
    ring.position.set(0, 0.08, -2.2);
    g.add(ring);

    g.visible = false;
    scene.add(g);
    this.obj = g;
    this.enterT = 0;
  }

  place(x, z) {
    this.obj.position.set(x, this.world.heightAt(x, z), z);
    this.obj.visible = true;
    this.active = true;
    this.enterT = 0;
  }

  /* Эшиктин алдында турган убакытты эсептейт. true = кирди */
  tryEnter(pos, dt) {
    if (!this.active) { this.enterT = 0; return false; }
    if (this.isNear(pos)) {
      this.enterT += dt;
      const k = 0.4 + Math.sin(performance.now() * 0.012) * 0.25;
      this.ringMat.opacity = k + 0.3;
      if (this.enterT >= CFG.cabin.enterTime) return true;
    } else {
      this.enterT = Math.max(0, this.enterT - dt * 1.6);
      this.ringMat.opacity = 0.45;
    }
    return false;
  }

  get enterRatio() { return Math.min(1, this.enterT / CFG.cabin.enterTime); }

  hide() { this.active = false; this.obj.visible = false; this.enterT = 0; }

  /* Эшиктин ордун кайтарат (үйдүн борбору эмес) */
  get door() {
    return { x: this.obj.position.x, z: this.obj.position.z - 2.2 };
  }

  isNear(pos) {
    if (!this.active) return false;
    const d = this.door;
    const dx = pos.x - d.x, dz = pos.z - d.z;
    return dx * dx + dz * dz < CFG.cabin.radius * CFG.cabin.radius;
  }

  distance(pos) {
    if (!this.active) return Infinity;
    const d = this.door;
    return Math.hypot(pos.x - d.x, pos.z - d.z);
  }
}
