/* ============================================================
   Оюнчунун аватары. Үч роль:
     'hunter'  — 1-көрүнүш (FPS), жаа, Sanity
     'deer'    — 3-көрүнүш (TPS), Hunger, козу карын жейт, 💨
     'wendigo' — 3-көрүнүш, мергенчини аңдыйт
   ============================================================ */

import * as THREE from './lib/three.module.js';
import { CFG } from './config.js';
import { clamp, lerp } from './utils.js';
import { buildDeer, buildWendigo } from './models.js';

/* бурчтарды кыска жол менен жакындатуу */
function angleLerp(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export class Avatar {
  constructor(camera, world, scene) {
    this.camera = camera;
    this.world = world;
    this.scene = scene;

    this.pos = new THREE.Vector3(0, 0, 0);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = -0.12;
    this.modelYaw = 0;
    this.onGround = true;
    this.bob = 0;
    this.alive = true;
    this.role = null;

    /* Мергенчи */
    this.sanity = CFG.hunter.maxSanity;
    this.arrows = CFG.hunter.maxArrows;
    this.arrowTimer = 0;
    this.draw = 0;
    this.aiming = false;      // жаа тартылып, даяр турганын билдирет
    this.fireCd = 0;
    this.health = CFG.hunter.health;

    /* Бугу */
    this.hunger = CFG.deer.maxHunger;
    this.eating = 0;
    this.eatTarget = null;
    this.fartCd = 0;
    this.growlTimer = 0;
    this.grazing = false;

    /* Үн чыкканда main.js кабар алат: onNoise(kind, x, z) */
    this.onNoise = null;

    /* Вендиго */
    this.attackCd = 0;

    /* Таштын үстү */
    this.onPlatform = null;
    this.rockTime = 0;
    this.frozen = 0;          // түн киргенде вендиго бир аз катып турат
    this.onMantle = null;
    this.onFellOffRock = null;

    this._buildViewModel();
    this.camRig = new THREE.Vector3();
  }

  /* ---------- Мергенчинин колундагы жаа (FPS) ---------- */
  _buildViewModel() {
    this.vm = new THREE.Group();
    this.camera.add(this.vm);

    const vmMat = (color, emi = 0.42) => new THREE.MeshLambertMaterial({
      color, emissive: new THREE.Color(color).multiplyScalar(emi), flatShading: true,
    });

    this.bowGroup = new THREE.Group();
    const R = 0.17, ARC = Math.PI * 1.08;
    const bow = new THREE.Mesh(new THREE.TorusGeometry(R, 0.011, 6, 20, ARC), vmMat(0x8a5c33));
    bow.rotation.z = Math.PI - ARC / 2;
    this.bowGroup.add(bow);

    const sx = R * Math.cos(ARC / 2), sy = R * Math.sin(ARC / 2);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      sx, sy, 0,  sx, 0, 0,  sx, -sy, 0,
    ]), 3));
    this.bowString = new THREE.Line(sg, new THREE.LineBasicMaterial({ color: 0xf2ecdc }));
    this.bowGroup.add(this.bowString);

    this.nockedArrow = new THREE.Group();
    const shaft = new THREE.CylinderGeometry(0.0038, 0.0038, 0.34, 5);
    shaft.rotateX(Math.PI / 2); shaft.translate(0, 0, -0.17);
    this.nockedArrow.add(new THREE.Mesh(shaft, vmMat(0xd9c49b)));
    const tip = new THREE.ConeGeometry(0.011, 0.04, 5);
    tip.rotateX(-Math.PI / 2); tip.translate(0, 0, -0.355);
    this.nockedArrow.add(new THREE.Mesh(tip, vmMat(0x9aa2a8, 0.3)));
    this.nockedArrow.position.set(sx, 0, 0);
    this.bowGroup.add(this.nockedArrow);

    this.bowGroup.scale.setScalar(0.9);
    this.bowGroup.position.set(0.20, -0.10, -0.52);
    this.bowGroup.rotation.set(0, -0.22, 0.06);
    this.vm.add(this.bowGroup);
    this.vm.visible = false;
  }

  /* ---------- Ролду коюу ---------- */
  setRole(role) {
    this.role = role;

    if (this.model) { this.scene.remove(this.model.group); this.model = null; }
    this.vm.visible = (role === 'hunter');

    if (role === 'deer') {
      this.model = buildDeer(Math.random, { male: true });
      this.scene.add(this.model.group);
      this.height = CFG.deer.height;
      this.hunger = CFG.deer.maxHunger;
      this.pitch = -0.24;          // бугуну бир аз жогортон көрөбүз
      this.grazing = false;
    } else if (role === 'wendigo') {
      this.model = buildWendigo();
      this.scene.add(this.model.group);
      this.height = CFG.wendigo.height;
      this.pitch = -0.24;
      this.grazing = false;
    } else {
      this.height = CFG.hunter.height;
    }
    this.alive = true;
  }

  get spec() {
    if (this.role === 'deer')    return CFG.deer;
    if (this.role === 'wendigo') return CFG.wendigo;
    return CFG.hunter;
  }
  get thirdPerson() { return this.role !== 'hunter'; }

  spawnAt(x, z) {
    this.pos.set(x, this.world.heightAt(x, z), z);
    this.vel.set(0, 0, 0);
  }

  forward() { return new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion); }

  /* Жебе/сокку тийген чекит */
  centerPos() {
    const h = this.role === 'hunter' ? 1.1 : (this.role === 'wendigo' ? 1.5 : 1.0);
    return new THREE.Vector3(this.pos.x, this.pos.y + h, this.pos.z);
  }

  /* ============================================================
     АР КАДАМДА
     ============================================================ */
  update(dt, input, opts = {}) {
    if (!this.alive) { this._updateCamera(dt); return; }
    const S = this.spec;

    /* --- Кароо --- */
    this.yaw   -= input.lookDX;
    this.pitch -= input.lookDY;
    this.pitch = clamp(this.pitch, this.thirdPerson ? -0.9 : -1.35, this.thirdPerson ? 0.75 : 1.35);

    /* --- Катып калуу (вендигого айланган учур) ---
       Кароого болот, бирок кыймылдабайсың — мергенчи качып алсын. */
    if (this.frozen > 0) {
      this.frozen -= dt;
      input = { ...input, move: { x: 0, y: 0 },
        pressed: { ...input.pressed, jump: false, fire: false } };
    }

    /* --- Ылдамдык --- */
    let speed = input.running ? S.runSpeed : S.walkSpeed;
    if (this.role === 'deer') {
      if (this.hunger <= 0) speed *= CFG.deer.starveSlow;
      if (this.eating > 0 || this.grazing) speed = 0;
      /* кыймылдаса оттоо токтойт */
      if (this.grazing && (input.move.x || input.move.y)) this.grazing = false;
    }
    if (this.role === 'hunter' && this.draw > 0.05) speed *= 0.45;

    /* Камеранын багытына карата басуу */
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const fx = -sin, fz = -cos, rx = cos, rz = -sin;
    this.vel.x = (fx * input.move.y + rx * input.move.x) * speed;
    this.vel.z = (fz * input.move.y + rz * input.move.x) * speed;

    /* --- Секирүү / таштын үстүнө чыгуу / гравитация ---
       ⚠️ Бот бугулар секире албайт. Ошондуктан бугу секирсе
       катуу үн чыгат жана мергенчи дароо байкайт. */
    if (input.pressed.jump && this.onGround && this.eating <= 0) {
      /* Жакында чыгууга боло турган таш барбы? Болсо — ага чыгабыз. */
      const rock = this.world.mantleTarget(this.pos.x, this.pos.z, this.pos.y, 1.3);
      if (rock) {
        const dx = this.pos.x - rock.x, dz = this.pos.z - rock.z;
        const d = Math.max(0.001, Math.hypot(dx, dz));
        const k = Math.min(1, (rock.r * 0.45) / d);
        this.pos.x = rock.x + dx * k;
        this.pos.z = rock.z + dz * k;
        this.pos.y = rock.top + 0.02;
        this.vel.y = 0;
        this.onGround = true;
        this.grazing = false;
        this.onMantle && this.onMantle();
      } else {
        this.vel.y = S.jumpSpeed;
        this.onGround = false;
        this.grazing = false;
      }
      if (this.role === 'deer') this._noise('jump');
    }
    this.vel.y -= CFG.player.gravity * dt;

    /* --- Жаңы орун --- */
    const r = this.role === 'deer' ? 0.55 : CFG.player.radius;
    const n = this.world.resolveCollision(
      this.pos.x + this.vel.x * dt,
      this.pos.z + this.vel.z * dt,
      r, this.pos.y
    );
    this.pos.x = n.x; this.pos.z = n.z;
    this.pos.y += this.vel.y * dt;

    /* Жер — же топурак, же таштын үстү */
    const gy = this.world.heightAt(this.pos.x, this.pos.z);
    const plat = this.world.platformAt(this.pos.x, this.pos.z, this.pos.y);
    const floor = plat ? Math.max(gy, plat.top) : gy;

    if (this.pos.y <= floor) {
      this.pos.y = floor; this.vel.y = 0; this.onGround = true;
      this.onPlatform = (plat && floor === plat.top) ? plat : null;
    } else if (this.vel.y > 0.1) {
      this.onPlatform = null;
    }

    /* ⏳ Ташта 5 секунд гана тура аласың */
    if (this.onPlatform && this.onGround) {
      this.rockTime += dt;
      if (this.rockTime >= CFG.rock.maxTime) {
        const p = this.onPlatform;
        p.cd = CFG.rock.cooldown;                   // ошол ташка убактылуу чыга албайсың
        const dx = this.pos.x - p.x, dz = this.pos.z - p.z;
        const d = Math.max(0.001, Math.hypot(dx, dz));
        this.pos.x = p.x + (dx / d) * (p.r + 0.9);  // ылдый түртүлөт
        this.pos.z = p.z + (dz / d) * (p.r + 0.9);
        this.vel.y = 1.5;
        this.onGround = false;
        this.onPlatform = null;
        this.rockTime = 0;
        this.onFellOffRock && this.onFellOffRock();
      }
    } else if (this.rockTime > 0) {
      this.rockTime = Math.max(0, this.rockTime - dt * 2);
    }

    /* --- Ролго тиешелүү --- */
    if (this.role === 'hunter')      this._updateHunter(dt, input, opts);
    else if (this.role === 'deer')   this._updateDeer(dt, input, opts);
    else                              this._updateWendigo(dt, input, opts);

    /* --- Модель жана камера --- */
    this._updateModel(dt, input);
    this._updateCamera(dt);
  }

  /* ---------- Мергенчи ---------- */
  _updateHunter(dt, input, opts) {
    const H = CFG.hunter;
    this.fireCd = Math.max(0, this.fireCd - dt);

    /* Жебелер акырындык менен кайра толот (бардыгы 3) */
    if (this.arrows < H.maxArrows) {
      this.arrowTimer += dt;
      if (this.arrowTimer >= H.arrowRegen) { this.arrowTimer = 0; this.arrows++; }
    } else this.arrowTimer = 0;

    if (!opts.caged && !this.world.isNight) {
      this.sanity -= H.sanityDrain * dt;
      /* чуркоо акыл-эсти тезирээк түшүрөт */
      if (input.running && (input.move.x || input.move.y)) {
        this.sanity -= H.sprintSanityDrain * dt;
      }
    }
    this.sanity = clamp(this.sanity, 0, H.maxSanity);

    /* Эки кадамдуу атуу: бир басканда тартылат, даяр турат;
       экинчи басканда бошотулат. */
    if (this.aiming && this.arrows > 0) {
      this.draw = Math.min(1, this.draw + dt / CFG.bow.drawTime);
    } else if (!this.aiming && this.draw > 0) {
      this.draw = Math.max(0, this.draw - dt / 0.25);
    }

    const d = this.draw;
    this.bowGroup.position.x = lerp(0.20, 0.07, d);
    this.bowGroup.position.y = lerp(-0.10, -0.04, d);
    this.bowGroup.position.z = lerp(-0.52, -0.48, d);
    this.bowGroup.rotation.y = lerp(-0.22, -0.02, d);
    this.bowGroup.rotation.z = lerp(0.06, 0.0, d);
    const pull = d * 0.14;
    const p = this.bowString.geometry.attributes.position;
    p.setZ(1, pull); p.needsUpdate = true;
    this.nockedArrow.position.z = pull;
    this.nockedArrow.visible = this.arrows > 0;
  }

  /* Жааны тарта баштоо. true = тартылды */
  startDraw() {
    if (this.role !== 'hunter' || this.aiming || this.fireCd > 0) return false;
    if (this.arrows <= 0) return false;
    this.aiming = true;
    return true;
  }

  /* Бошотуу. Кайтарат: күчү 0..1 (0 = атылган жок) */
  releaseBow() {
    if (!this.aiming) return 0;
    const power = this.draw;
    this.aiming = false;
    this.draw = 0;
    if (power < 0.35 || this.arrows <= 0) return 0;   // толук тартылбаса — учпайт
    this.arrows--;
    this.fireCd = CFG.hunter.fireCooldown;
    return power;
  }

  /* ---------- Бугу ---------- */
  _updateDeer(dt, input, opts) {
    const D = CFG.deer;
    this.fartCd = Math.max(0, this.fartCd - dt);

    if (!opts.frozen) {
      this.hunger -= D.hungerDrain * dt;
      if (input.running && (input.move.x || input.move.y)) this.hunger -= D.sprintDrain * dt;
    }
    this.hunger = clamp(this.hunger, 0, D.maxHunger);

    if (this.eating > 0) {
      this.eating -= dt;
      /* кырсылдаган үн */
      this._eatNoiseT = (this._eatNoiseT || 0) - dt;
      if (this._eatNoiseT <= 0) { this._eatNoiseT = 0.7; this._noise('eat'); }
      if (this.eating <= 0 && this.eatTarget) {
        this.world.eatMushroom(this.eatTarget);
        this.hunger = clamp(this.hunger + D.eatGain, 0, D.maxHunger);
        this.eatTarget = null;
      }
    }

    /* ⚠️ Курсагы бош болсо — корулдап, ордун ачып берет */
    if (this.hunger <= 0) {
      this.growlTimer -= dt;
      if (this.growlTimer <= 0) {
        this.growlTimer = CFG.noise.growlEvery;
        this._noise('growl');
      }
    } else {
      this.growlTimer = 1.5;
    }
  }

  _noise(kind) {
    this.onNoise && this.onNoise(kind, this.pos.x, this.pos.z);
  }

  /* Козу карын жей баштоо. true = башталды */
  tryEat() {
    if (this.role !== 'deer' || this.eating > 0) return false;
    const m = this.world.nearestMushroom(this.pos.x, this.pos.z, 2.8);
    if (!m) return false;
    this.eatTarget = m;
    this.eating = CFG.deer.eatTime;
    return true;
  }

  tryFart() {
    if (this.role !== 'deer' || this.fartCd > 0) return false;
    this.fartCd = CFG.deer.fartCooldown;
    this._noise('fart');
    return true;
  }

  /* ---------- Вендиго ---------- */
  _updateWendigo(dt) {
    this.attackCd = Math.max(0, this.attackCd - dt);
  }

  tryAttack() {
    if (this.role !== 'wendigo' || this.attackCd > 0) return false;
    this.attackCd = CFG.wendigo.attackCooldown;
    return true;
  }

  /* ---------- Модель ---------- */
  _updateModel(dt, input) {
    if (!this.model) return;

    const moving = Math.hypot(this.vel.x, this.vel.z) > 0.4;
    if (moving) {
      const want = Math.atan2(-this.vel.x, -this.vel.z);
      this.modelYaw = angleLerp(this.modelYaw, want, 1 - Math.exp(-10 * dt));
    }

    this.model.group.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.model.group.rotation.y = this.modelYaw;

    let state = 'idle';
    if (this.eating > 0 || this.grazing) state = 'graze';
    else if (moving) state = input.running ? 'run' : 'walk';
    this.model.setAnim(state, dt);
  }

  /* ---------- Камера ---------- */
  _updateCamera(dt) {
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ')
    );

    if (!this.thirdPerson) {
      const moving = Math.hypot(this.vel.x, this.vel.z) > 0.4 && this.onGround;
      this.bob = moving ? this.bob + dt * 8 : lerp(this.bob, 0, dt * 8);
      const by = moving ? Math.sin(this.bob) * 0.045 : 0;
      const bx = moving ? Math.cos(this.bob * 0.5) * 0.03 : 0;
      this.camera.position.set(this.pos.x + bx, this.pos.y + this.height + by, this.pos.z);
      this.camera.quaternion.copy(q);
      return;
    }

    /* 3-көрүнүш: артынан ээрчиген камера */
    const S = this.role === 'wendigo'
      ? { camDist: 6.2, camHeight: 2.8, camSide: 0.5 }
      : { camDist: CFG.deer.camDist, camHeight: CFG.deer.camHeight, camSide: CFG.deer.camSide };

    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    const target = new THREE.Vector3(this.pos.x, this.pos.y + S.camHeight, this.pos.z)
      .addScaledVector(right, S.camSide);
    const back = new THREE.Vector3(0, 0, 1).applyQuaternion(q);

    /* Дарактарга кирип кетпесин — аралыкты кыскартабыз */
    let dist = S.camDist;
    for (const c of this.world.colliders) {
      if (c.r <= 0) continue;
      const dx = c.x - target.x, dz = c.z - target.z;
      const t = dx * back.x + dz * back.z;           // артка проекция
      if (t <= 0 || t > dist) continue;
      const px = target.x + back.x * t, pz = target.z + back.z * t;
      const d = Math.hypot(c.x - px, c.z - pz);
      if (d < c.r + 0.5) dist = Math.min(dist, Math.max(1.2, t - 0.4));
    }

    const want = target.clone().addScaledVector(back, dist);
    const gy = this.world.heightAt(want.x, want.z) + 0.6;
    if (want.y < gy) want.y = gy;

    const k = 1 - Math.exp(-14 * dt);
    this.camera.position.lerp(want, k);
    this.camera.quaternion.copy(q);
  }

  hurt(n) {
    this.health = clamp(this.health - n, 0, 100);
    if (this.health <= 0) this.alive = false;
  }

  die() {
    this.alive = false;
    if (this.model) this.model.group.visible = false;
  }
}
