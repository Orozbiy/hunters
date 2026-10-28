/* ============================================================
   Бот бугулар, бот мергенчи, тармактагы башка оюнчулар, 💨 булут.
   ============================================================ */

import * as THREE from './lib/three.module.js';
import { CFG } from './config.js';
import { clamp } from './utils.js';
import { buildDeer, buildHunter, buildWendigo, addXRaySilhouette } from './models.js';

function angleLerp(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/* ============================================================
   БОТ БУГУЛАР
   isTarget = true болгондору "оюнчу бугу" катары жашынат
   (жалгыз ойногондо мергенчи ушуларды табышы керек).
   ============================================================ */
export class Herd {
  constructor(scene, world, rnd, count, targets = 0) {
    this.scene = scene;
    this.world = world;
    this.rnd = rnd;
    this.list = [];

    const total = count + targets;
    for (let i = 0; i < total; i++) {
      const m = buildDeer(rnd);
      const p = world._spot(20);
      m.group.position.set(p.x, p.y, p.z);
      scene.add(m.group);

      this.list.push({
        m, x: p.x, z: p.z,
        dir: rnd() * 6.28,
        yaw: rnd() * 6.28,
        state: 'graze',
        timer: rnd() * 4,
        dead: false, removed: false,
        isTarget: i >= count,          // "оюнчу" бугу
        panic: 0,
      });
    }
    /* тизмени аралаштыр — мергенчи тартипти билбесин */
    for (let i = this.list.length - 1; i > 0; i--) {
      const j = (rnd() * (i + 1)) | 0;
      [this.list[i], this.list[j]] = [this.list[j], this.list[i]];
    }
  }

  update(dt, hunterPos, hunterForward) {
    const N = CFG.npc, lim = CFG.world.size * 0.46;

    for (const d of this.list) {
      if (d.dead || d.isWendigo) continue;      // вендигого айланганы өзүнчө башкарылат
      d.timer -= dt;
      d.panic = Math.max(0, d.panic - dt * 0.5);

      let dist = 999, seen = false;
      if (hunterPos) {
        const dx = d.x - hunterPos.x, dz = d.z - hunterPos.z;
        dist = Math.hypot(dx, dz);
        if (hunterForward && dist < 40) {
          const nx = dx / dist, nz = dz / dist;
          seen = (nx * hunterForward.x + nz * hunterForward.z) > 0.72;
        }
        /* Бот бугулар жакындаганда качат */
        if (dist < N.fleeRadius) {
          d.state = 'flee';
          d.dir = Math.atan2(dx, dz);
          d.timer = 2.0;
        }
        /* "Оюнчу" бугулар эрте качат — мергенчи ушундан байкайт */
        if (d.isTarget && seen && dist < 26 && d.panic <= 0) {
          d.panic = 2.5;
          d.state = 'flee';
          d.dir = Math.atan2(dx, dz) + (this.rnd() - 0.5) * 0.9;
          d.timer = 2.8;
        }
      }

      if (d.timer <= 0) {
        const r = this.rnd();
        if (d.state === 'flee') { d.state = 'graze'; d.timer = 2 + r * 3; }
        else if (d.state === 'graze') {
          d.state = 'walk';
          d.dir += (r - 0.5) * 2.4;
          d.timer = 2 + r * 4;
        } else { d.state = 'graze'; d.timer = 2 + r * 4; }
      }

      let speed = 0;
      if (d.state === 'walk') speed = N.speed;
      if (d.state === 'flee') speed = N.fleeSpeed;

      if (speed > 0) {
        let nx = d.x + Math.sin(d.dir) * speed * dt;
        let nz = d.z + Math.cos(d.dir) * speed * dt;
        if (Math.abs(nx) > lim || Math.abs(nz) > lim) { d.dir += Math.PI; nx = d.x; nz = d.z; }
        for (const c of this.world.colliders) {
          if (c.r <= 0) continue;
          const ox = nx - c.x, oz = nz - c.z, rr = c.r + 0.6;
          if (ox * ox + oz * oz < rr * rr) { d.dir += 1.1; nx = d.x; nz = d.z; break; }
        }
        d.x = nx; d.z = nz;
        d.yaw = angleLerp(d.yaw, d.dir + Math.PI, 1 - Math.exp(-8 * dt));
      }

      d.m.group.position.set(d.x, this.world.heightAt(d.x, d.z), d.z);
      d.m.group.rotation.y = d.yaw;
      d.m.setAnim(speed > N.speed + 0.5 ? 'run' : (speed > 0 ? 'walk' : 'graze'), dt);
    }
  }

  /* Тармакта: хост жиберген абалды колдонуу */
  applyNetState(arr) {
    for (let i = 0; i < arr.length && i < this.list.length; i++) {
      const d = this.list[i], s = arr[i];
      d.x = s[0]; d.z = s[1]; d.yaw = s[2];
      d.dead = !!s[3];
      d.m.group.visible = !d.dead;
    }
  }

  netState() {
    return this.list.map(d => [
      +d.x.toFixed(2), +d.z.toFixed(2), +d.yaw.toFixed(2), d.dead ? 1 : 0,
    ]);
  }

  kill(d) {
    d.dead = true;
    d.m.group.rotation.z = Math.PI * 0.5;
    d.m.group.position.y = this.world.heightAt(d.x, d.z) + 0.25;
  }

  aliveTargets() { return this.list.filter(d => d.isTarget && !d.dead).length; }
}

/* ============================================================
   БОТ МЕРГЕНЧИ — оюнчу бугу болуп ойногондо
   ============================================================ */
export class BotHunter {
  constructor(scene, world, rnd) {
    this.world = world;
    this.rnd = rnd;
    this.m = buildHunter();
    /* Бугулар мергенчини таштын, дарактын артынан да ак элес болуп көрөт */
    this.xray = addXRaySilhouette(this.m.group, 0xffffff);
    scene.add(this.m.group);

    const p = world._spot(45);
    this.x = p.x; this.z = p.z;
    this.yaw = rnd() * 6.28;
    this.dir = this.yaw;
    this.timer = 0;
    this.suspicion = 0;      // оюнчуга болгон шек 0..100
    this.state = 'patrol';   // patrol | stalk | aim
    this.aimT = 0;           // жаанын тартылышы 0..1
    this.shootCd = 2;
    this.caged = true;
    this.onAimStart = null;  // main.js эскертүү көрсөтөт
  }

  get pos() { return new THREE.Vector3(this.x, this.world.heightAt(this.x, this.z), this.z); }
  forward() { return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) }; }

  /* Ортодо дарак/таш барбы? */
  _losClear(bx, bz) {
    const dx = bx - this.x, dz = bz - this.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.5) return true;
    const ux = dx / d, uz = dz / d;
    for (const c of this.world.colliders) {
      if (c.r <= 0) continue;
      const ox = c.x - this.x, oz = c.z - this.z;
      const t = ox * ux + oz * uz;
      if (t <= 0 || t >= d) continue;
      const px = this.x + ux * t, pz = this.z + uz * t;
      if (Math.hypot(c.x - px, c.z - pz) < c.r + 0.3) return false;
    }
    return true;
  }

  /* player = оюнчунун Avatar'ы. onShoot(bot, player, dist) — жебе учканда. */
  update(dt, player, onShoot) {
    const B = CFG.botHunter;
    this.m.group.position.set(this.x, this.world.heightAt(this.x, this.z), this.z);
    this.m.group.rotation.y = this.yaw;

    if (this.caged) { this.m.setAnim('idle', dt); return; }

    this.shootCd = Math.max(0, this.shootCd - dt);
    this.timer -= dt;

    const dx = player.pos.x - this.x, dz = player.pos.z - this.z;
    const dist = Math.hypot(dx, dz);
    const f = this.forward();
    const dot = dist > 0.1 ? (dx / dist) * f.x + (dz / dist) * f.z : 1;
    const inView = player.alive && dist < B.sightRange && dot > Math.cos(B.sightAngle);
    const clear = inView && this._losClear(player.pos.x, player.pos.z);

    /* --- Шек --- */
    const running = Math.hypot(player.vel.x, player.vel.z) > CFG.deer.walkSpeed + 1;
    if (clear) {
      let rate = B.suspicionRate * (1 + (B.sightRange - dist) / B.sightRange);
      if (running) rate *= 2.6;
      if (!player.onGround) rate *= 2.4;   // секирүү = дароо ачылып каласың
      if (player.grazing) rate *= 0.25;    // оттоп турса — бот бугудан айырмасы жок
      this.suspicion = clamp(this.suspicion + rate * dt * 8, 0, 100);
    } else {
      this.suspicion = clamp(this.suspicion - 11 * dt, 0, 100);
    }

    /* --- ЖААНЫ ТАРТУУ --- */
    if (this.state === 'aim') {
      this.dir = Math.atan2(-dx, -dz);                 // көздөп турат
      this.yaw = angleLerp(this.yaw, this.dir, 1 - Math.exp(-11 * dt));
      this.aimT += dt / B.drawTime;

      /* оюнчу көрүнбөй калса — токтотот */
      if (!clear || dist > B.shootDist * 1.3 || !player.alive) {
        this.state = 'stalk'; this.aimT = 0;
      } else if (this.aimT >= 1) {
        this.aimT = 0;
        this.state = 'stalk';
        this.shootCd = B.reload;
        onShoot && onShoot(this, player, dist);
      }
      this.m.setAnim('aim', dt);
      return;                                           // тартып жатканда кыймылдабайт
    }

    /* --- Атууга өтүүбү? --- */
    if (clear && this.suspicion > B.shootThreshold && dist < B.shootDist && this.shootCd <= 0) {
      this.state = 'aim';
      this.aimT = 0;
      this.onAimStart && this.onAimStart();
      this.m.setAnim('aim', dt);
      return;
    }

    /* --- Басуу --- */
    let speed = B.speed;
    if (clear && this.suspicion > B.chaseThreshold) {
      this.state = 'stalk';
      this.dir = Math.atan2(-dx, -dz);
      speed = B.chaseSpeed;
    } else {
      this.state = 'patrol';
      if (this.timer <= 0) {
        this.timer = 3 + this.rnd() * 4;
        this.dir += (this.rnd() - 0.5) * 2.2;
      }
    }

    let nx = this.x - Math.sin(this.dir) * speed * dt;
    let nz = this.z - Math.cos(this.dir) * speed * dt;
    const lim = CFG.world.size * 0.45;
    if (Math.abs(nx) > lim || Math.abs(nz) > lim) { this.dir += Math.PI; nx = this.x; nz = this.z; }
    const res = this.world.resolveCollision(nx, nz, 0.5);
    this.x = res.x; this.z = res.z;

    this.yaw = angleLerp(this.yaw, this.dir, 1 - Math.exp(-5 * dt));
    this.m.setAnim(speed > B.speed ? 'run' : 'walk', dt);
  }
}

/* ============================================================
   БОТ ВЕНДИГО
   Түн киргенде мергенчи таппай калган бугулар ушуга айланып,
   аны кубалай баштайт. Өлтүрүүгө болбойт — жебе тийсе бир аз
   токтоп калат, башка айла жок: ҮЙГӨ жетүү керек.
   ============================================================ */
export class BotWendigo {
  constructor(scene, world, x, z) {
    this.scene = scene;
    this.world = world;
    this.m = buildWendigo();
    scene.add(this.m.group);
    this.x = x; this.z = z;
    this.yaw = Math.random() * 6.28;
    this.attackCd = 1.6;
    this.stun = 0;
    this.spawnT = 0;                    // жерден көтөрүлүп чыгуу анимациясы
    this.freeze = CFG.wendigo.startFreeze;   // ⏸ башында катып турат
    this.alive = true;
  }

  /*
    target — мергенчинин орду
    cabinDoor — үйдүн эшиги (же null). Мергенчи үйгө жакындаса,
    вендиго түз артынан кубалабай, ЭШИКТИН АЛДЫН ТОСОТ.
  */
  update(dt, target, onAttack, cabinDoor, targetOnRock) {
    if (!this.alive) return;
    const W = CFG.wendigo;

    /* жерден көтөрүлүп чыгат */
    this.spawnT = Math.min(1, this.spawnT + dt / 1.2);
    /* ⏸ көтөрүлгөндөн кийин бир аз катып турат — мергенчи качып алсын */
    if (this.spawnT >= 1 && this.freeze > 0) this.freeze -= dt;

    this.attackCd = Math.max(0, this.attackCd - dt);
    this.stun = Math.max(0, this.stun - dt);

    const dx = target.x - this.x, dz = target.z - this.z;
    const dist = Math.hypot(dx, dz);

    /* Кайда чуркайт: мергенчигеби же эшиктин алдынабы? */
    let gx = target.x, gz = target.z;
    this.guarding = false;
    if (cabinDoor) {
      const hToCabin = Math.hypot(target.x - cabinDoor.x, target.z - cabinDoor.z);
      const meToCabin = Math.hypot(this.x - cabinDoor.x, this.z - cabinDoor.z);
      /* мергенчи үйгө жакындап калса жана мен андан алыс эмес болсом — тосом */
      if (hToCabin < CFG.cabin.wendigoGuard && meToCabin > CFG.cabin.radius + 1.5 &&
          meToCabin < hToCabin + 25) {
        gx = cabinDoor.x; gz = cabinDoor.z;
        this.guarding = true;
      }
    }

    const gdx = gx - this.x, gdz = gz - this.z;
    const gdist = Math.hypot(gdx, gdz);

    let state = 'idle';
    if (this.stun <= 0 && this.spawnT >= 1 && this.freeze <= 0) {
      /* Таштын үстүндөгү адамды кармай албайт — астында күтөт */
      if (dist <= W.attackRange && !targetOnRock) {
        if (this.attackCd <= 0) {
          this.attackCd = W.attackCooldown;
          onAttack && onAttack(this, dist);
        }
      } else if (gdist > (targetOnRock ? 2.0 : 0.6)) {
        const sp = gdist > 16 ? W.runSpeed : W.walkSpeed + (W.runSpeed - W.walkSpeed) * 0.55;
        const nx = this.x + (gdx / gdist) * sp * dt;
        const nz = this.z + (gdz / gdist) * sp * dt;
        const res = this.world.resolveCollision(nx, nz, 0.6);
        this.x = res.x; this.z = res.z;
        state = sp > W.walkSpeed + 1 ? 'run' : 'walk';
      }
    }

    /* жакын болсо мергенчиге карайт, алыс болсо барчу жагына */
    const fdx = dist < 8 ? dx : gdx, fdz = dist < 8 ? dz : gdz;
    const want = Math.atan2(fdx, fdz) + Math.PI;
    this.yaw = angleLerp(this.yaw, want, 1 - Math.exp(-7 * dt));

    const gy = this.world.heightAt(this.x, this.z);
    /* чыгып жатканда жер астынан көтөрүлөт */
    this.m.group.position.set(this.x, gy - (1 - this.spawnT) * 2.6, this.z);
    this.m.group.rotation.y = this.yaw;
    this.m.setAnim(this.stun > 0 ? 'idle' : state, dt);
  }

  hit() {
    this.stun = 1.6;
    return false;              // өлтүрүүгө болбойт
  }

  dispose() { this.scene.remove(this.m.group); this.alive = false; }
}

/* ============================================================
   ТАРМАКТАГЫ БАШКА ОЮНЧУЛАР
   ============================================================ */
export class RemoteAvatar {
  constructor(scene, world, role, name) {
    this.scene = scene;
    this.world = world;
    this.name = name;
    this.role = null;
    this.x = 0; this.z = 0; this.yaw = 0;
    this.tx = 0; this.tz = 0; this.tyaw = 0;
    this.state = 'idle';
    this.alive = true;
    this.setRole(role);
  }

  setRole(role) {
    if (this.role === role) return;
    if (this.m) this.scene.remove(this.m.group);
    this.role = role;
    this.m = role === 'hunter' ? buildHunter()
           : role === 'wendigo' ? buildWendigo()
           : buildDeer(Math.random, { male: true });
    /* мергенчи дубал аркылуу көрүнүүчү элеси менен */
    this.xray = role === 'hunter' ? addXRaySilhouette(this.m.group, 0xffffff) : null;
    this.scene.add(this.m.group);
  }

  /* Бугулар үчүн элести күйгүзүү/өчүрүү */
  setXRay(on) { if (this.xray) this.xray.setVisible(on); }

  setTarget(x, z, yaw, state, alive) {
    this.tx = x; this.tz = z; this.tyaw = yaw;
    this.state = state; this.alive = alive;
  }

  update(dt) {
    const k = 1 - Math.exp(-12 * dt);
    this.x += (this.tx - this.x) * k;
    this.z += (this.tz - this.z) * k;
    this.yaw = angleLerp(this.yaw, this.tyaw, k);
    this.m.group.position.set(this.x, this.world.heightAt(this.x, this.z), this.z);
    this.m.group.rotation.y = this.yaw;
    this.m.group.visible = this.alive;
    this.m.setAnim(this.state, dt);
  }

  dispose() { this.scene.remove(this.m.group); }
}

/* ============================================================
   💨 БУЛУТ (бугунун шамалы) — мергенчини алаксытат
   ============================================================ */
export class FartFX {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.geo = new THREE.SphereGeometry(1, 10, 8);
  }
  spawn(x, y, z) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x9ad35a, transparent: true, opacity: 0.55, depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.geo, mat);
    mesh.position.set(x, y + 0.6, z);
    mesh.scale.setScalar(0.3);
    this.scene.add(mesh);
    this.list.push({ mesh, t: 0 });
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i];
      f.t += dt;
      const s = 0.3 + f.t * 1.9;
      f.mesh.scale.setScalar(s);
      f.mesh.position.y += dt * 0.35;
      f.mesh.material.opacity = Math.max(0, 0.55 * (1 - f.t / 2.4));
      if (f.t > 2.4) {
        this.scene.remove(f.mesh);
        f.mesh.material.dispose();
        this.list.splice(i, 1);
      }
    }
  }
}
