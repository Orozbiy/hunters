/* ============================================================
   ТҮНКҮ ТОКОЙ — башкы файл
   Менюлар, раунд, жалгыз ойноо жана Wi-Fi аркылуу команда менен ойноо.
   ============================================================ */

import * as THREE from './lib/three.module.js';
import { CFG } from './config.js';
import { makeRandom } from './utils.js';
import { World } from './world.js';
import { Avatar } from './player.js';
import { Controls } from './controls.js';
import { Herd, BotHunter, BotWendigo, RemoteAvatar, FartFX } from './entities.js';
import { ArrowSystem, NoisePings, TrailCams, Cabin } from './items.js';
import { Match } from './gamemode.js';
import { createNet, NET_KIND } from './net.js';
import { UI } from './ui.js';
import { Audio } from './audio.js';
import { Intro } from './intro.js';
import { drawQR } from './qr.js';

const WORLD_SEED = 20261028;     // баарында бирдей токой болушу үчүн

const ui = new UI();
const audio = new Audio();
let stepTimer = 0;
let renderer, scene, camera, world, me, controls;
let arrows, fartFX, pings, cams, cabin;
let herd = null, botHunter = null, cage = null, match = null;
let botWendigos = [];
let intro = null;
let shareLink = '';
let hunterHistory = [];   // кезек: ким мергенчи болуп бүттү
let hunterName = '';      // ушул раундда ким мергенчи
let serverOk = null;      // оюндун өз сервери иштеп турабы
let net = null, remotes = new Map();

let mode = 'none';
let myRole = 'deer';
let pickedRole = null;
let running = false, last = 0;
let netTimer = 0, worldTimer = 0, sanityTimer = 0;
let hunterSanity = CFG.hunter.maxSanity;
let botHunterHealth = CFG.hunter.health;
let spectating = false, specAngle = 0;

/* ============================================================
   ОРНОТУУ
   ============================================================ */
async function init() {
  const canvas = document.getElementById('scene');
  renderer = new THREE.WebGLRenderer({
    canvas, antialias: window.devicePixelRatio < 2, powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 500);
  scene.add(camera);

  await step(0.12, 'токой өстүрүлүүдө…');
  world = new World(scene, WORLD_SEED);

  await step(0.7, 'даярдалууда…');
  arrows = new ArrowSystem(scene, world);
  fartFX = new FartFX(scene);
  pings  = new NoisePings(scene, world);
  cams   = new TrailCams(scene, world);
  cabin  = new Cabin(scene, world);
  me = new Avatar(camera, world, scene);
  me.onNoise = onMyNoise;
  me.onMantle = () => {
    audio.sfx('land');
    ui.toast(`⛰️ Ташка чыктың — ${CFG.rock.maxTime}с коопсузсуң`);
  };
  me.onFellOffRock = () => {
    audio.sfx('land');
    ui.toast('⚠️ Таштан түштүң — жүгүр!');
    ui.flashHurt();
  };
  controls = new Controls();
  cage = buildCage();
  scene.add(cage);
  cage.visible = false;

  await step(1, 'даяр!');
  bindMenus();

  intro = new Intro(scene, camera, world, audio);
  intro.onDone = () => { ui.show('menu'); };
  document.getElementById('btnSkip').onclick = () => { audio.sfx('ui'); intro.finish(); };

  camera.position.set(0, world.heightAt(0, 0) + 3, 14);
  camera.lookAt(0, world.heightAt(0, 0) + 2, 0);

  /* Трейлер браузер үн чыгарууга уруксат бергенден кийин башталат,
     ошондуктан жүктөө экранында «БАШТОО» баскычын көрсөтөбүз. */
  ui.showStartGate();
  document.getElementById('btnGate').onclick = async () => {
    await audio.start();
    ui.hideAll();
    goLandscape();
    intro.start();
  };

  requestAnimationFrame(idleLoop);

  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 250));

  window.GAME = { world, me, CFG, scene, camera, renderer, audio,
    herd: () => herd, match: () => match, cabin: () => cabin,
    bot: () => botHunter, cams: () => cams, intro: () => intro,
    wendigos: () => botWendigos };
}

function step(p, t) { ui.progress(p, t); return new Promise(r => setTimeout(r, 30)); }

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

async function goLandscape() {
  try {
    const el = document.documentElement;
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  } catch { /* браузер уруксат бербеди */ }
  try { if (screen.orientation?.lock) await screen.orientation.lock('landscape'); } catch { /* iOS */ }
}

const isPortrait = () => window.innerHeight > window.innerWidth;

function buildCage() {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x6b4a2c, flatShading: true });
  const barGeo = new THREE.CylinderGeometry(0.06, 0.06, 2.6, 5);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const b = new THREE.Mesh(barGeo, mat);
    b.position.set(Math.cos(a) * 2.3, 1.3, Math.sin(a) * 2.3);
    g.add(b);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.07, 5, 22), mat);
  ring.rotation.x = Math.PI / 2; ring.position.y = 2.55;
  g.add(ring);
  const ring2 = ring.clone(); ring2.position.y = 0.15; g.add(ring2);
  return g;
}

/* ============================================================
   МЕНЮЛАР
   ============================================================ */
function bindMenus() {
  const $ = (id) => document.getElementById(id);

  /* Биринчи басууда гана үн системасы ачылат (браузердин талабы) */
  const wake = async () => { await audio.start(); audio.setMode('menu'); audio.sfx('ui'); };

  $('btnQuick').onclick = () => { wake(); goLandscape(); ui.show('roleSelect'); };
  $('btnTeam').onclick  = () => { wake(); goLandscape(); ui.show('lobby'); };
  $('btnRules').onclick = () => { wake(); ui.show('rules'); };
  $('btnReplayIntro').onclick = () => { wake(); ui.hideAll(); intro.start(); };

  $('btnMute').onclick = (e) => {
    e.stopPropagation();
    audio.setMuted(!audio.muted);
    $('btnMute').textContent = audio.muted ? '🔇' : '🔊';
    $('btnMute').classList.toggle('off', audio.muted);
  };
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyM') $('btnMute').click();
  });
  $('btnRulesBack').onclick = () => ui.show('menu');
  $('btnRoleBack').onclick  = () => ui.show('menu');
  $('btnLobbyBack').onclick = () => { leaveNet(); ui.show('menu'); };

  document.querySelectorAll('.rolecard').forEach(c => {
    c.onclick = () => {
      document.querySelectorAll('.rolecard').forEach(o => o.classList.remove('sel'));
      c.classList.add('sel');
      pickedRole = c.dataset.role;
      $('btnRoleGo').disabled = false;
    };
  });
  $('btnRoleGo').onclick = () => startSolo(pickedRole || 'deer');

  /* --- Достор кире турган шилтеме ---
     localhost'то ачылса, досторго жарабайт — серверден чыныгы
     Wi-Fi дарегин сурап алабыз. */
  const dir = location.pathname.replace(/[^/]*$/, '');
  shareLink = location.origin + dir;
  $('shareUrl2').value = shareLink;

  if (NET_KIND === 'firebase') {
    /* 🌍 Интернет режими — сервердин да, бирдей Wi-Fi'дын да кереги жок */
    serverOk = true;
    $('srvWarn').classList.add('hidden');
    $('netModeNote').textContent =
      '🌍 Интернет режими (Firebase) — ноутбук да, бирдей Wi-Fi да керек эмес. ' +
      'Досторуң каалаган жерден кире алат.';
    $('netModeNote').classList.remove('hidden');
    document.querySelector('#lobbyPick .wifihelp')?.classList.add('hidden');
  } else {
    /* 📶 Wi-Fi режими: барак оюндун ӨЗ сервери аркылуу ачылганбы?
       /__ip жообу — биздин сервердин белгиси (Live Server берген жок). */
    fetch('/__ip', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(j => {
        if (!j || !Array.isArray(j.ips)) throw new Error('башка сервер');
        serverOk = true;
        $('srvWarn').classList.add('hidden');
        if (j.ips.length && /^(localhost|127\.|\[?::1)/.test(location.hostname)) {
          shareLink = `http://${j.ips[0]}:${j.port}${dir}`;
          $('shareUrl2').value = shareLink;
        }
      })
      .catch(() => {
        serverOk = false;
        $('srvWarn').classList.remove('hidden');
        $('btnCreate').classList.add('dim');
        $('btnJoin').classList.add('dim');
      });
  }

  $('btnCopy2').onclick = async () => {
    const inp = $('shareUrl2'), btn = $('btnCopy2');
    inp.select(); inp.setSelectionRange(0, 999);
    let ok = false;
    try { await navigator.clipboard.writeText(inp.value); ok = true; }
    catch { try { ok = document.execCommand('copy'); } catch { ok = false; } }
    btn.textContent = ok ? '✅ Көчүрүлдү' : '👆 Белгиленди';
    audio.sfx('ui');
    setTimeout(() => { btn.textContent = '📋 Көчүрүү'; }, 2200);
  };

  /* --- 🏠 БӨЛМӨ ТҮЗҮҮ: кодду өзү ойлоп табат --- */
  $('btnCreate').onclick = () => {
    const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // окшош тамгалар жок
    let code = '';
    for (let i = 0; i < 4; i++) code += L[(Math.random() * L.length) | 0];
    connectRoom(code);
  };

  /* --- 🚪 БӨЛМӨГӨ КИРҮҮ --- */
  $('btnJoin').onclick = () => {
    audio.sfx('ui');
    $('lobbyPick').classList.add('hidden');
    $('lobbyJoin').classList.remove('hidden');
    $('inpRoom').focus();
  };
  $('btnJoinBack').onclick = () => {
    $('lobbyJoin').classList.add('hidden');
    $('lobbyPick').classList.remove('hidden');
  };
  $('btnConnect').onclick = () => {
    const room = ($('inpRoom').value || '').trim().toUpperCase();
    if (!room) { $('netHint').textContent = 'Бөлмө кодун жаз'; return; }
    connectRoom(room);
  };

  /* 🎲 Мергенчи кокустан тандалат. Кезек менен: мурун мергенчи
     болгондор экинчи айлам башталганга чейин кайра тандалбайт. */
  $('btnHostStart').onclick = () => {
    const list = [...net.players.values()];
    if (!list.length) return;

    let pool = list.filter(p => !hunterHistory.includes(p.id));
    if (!pool.length) { hunterHistory = []; pool = list; }
    const hunter = pool[(Math.random() * pool.length) | 0];
    hunterHistory.push(hunter.id);

    const roles = {};
    for (const p of list) roles[p.id] = (p.id === hunter.id) ? 'hunter' : 'deer';

    net.startGame(roles);
    startOnline(roles);
  };

  $('btnLeave').onclick = () => {
    leaveNet();
    $('lobbyRoom').classList.add('hidden');
    $('lobbyJoin').classList.add('hidden');
    $('lobbyPick').classList.remove('hidden');
  };

  $('btnAgain').onclick = () => {
    audio.sfx('ui');
    if (mode === 'solo') { startSolo(myRole === 'wendigo' ? 'deer' : myRole); return; }
    /* Онлайн: бөлмөгө кайтабыз — хост БАШТОО басса жаңы мергенчи тандалат */
    ui.show('lobby');
    if (net?.connected) {
      $('lobbyPick').classList.add('hidden');
      $('lobbyJoin').classList.add('hidden');
      $('lobbyRoom').classList.remove('hidden');
    } else {
      $('lobbyRoom').classList.add('hidden');
      $('lobbyJoin').classList.add('hidden');
      $('lobbyPick').classList.remove('hidden');
    }
  };
  $('btnToMenu').onclick = () => { audio.sfx('ui'); audio.setMode('menu'); leaveNet(); ui.show('menu'); };
}

/* Бөлмөгө кошулуу (түзүү да, кирүү да ушул аркылуу) */
async function connectRoom(code) {
  const $ = (id) => document.getElementById(id);

  /* Live Server болсо — дароо түшүндүрүп коёбуз, күттүрбөйбүз */
  if (serverOk === false) {
    $('srvWarn').classList.remove('hidden');
    $('srvWarn').scrollIntoView({ block: 'nearest' });
    ui.toast('⚠️ Алгач node server.js иштет');
    audio.sfx('wrongShot', { vol: 0.4 });
    return;
  }

  const name = ($('inpName').value || 'Оюнчу').trim();
  $('btnConnect').disabled = true;
  $('btnCreate').disabled = true;
  ui.toast('⏳ Серверге кошулуп жатат…');
  audio.sfx('ui');

  try {
    net = await createNet();
    bindNet();
    await net.connect(code, name);

    $('roomCode').textContent = net.room;
    $('roomCode2').textContent = net.room;
    $('lobbyPick').classList.add('hidden');
    $('lobbyJoin').classList.add('hidden');
    $('lobbyRoom').classList.remove('hidden');

    /* QR код — достор камера менен скандап эле кирет */
    try { drawQR($('qrCanvas'), shareLink, { px: 236 }); }
    catch { /* шилтеме өтө узун болсо — QR жок, шилтеме калат */ }

    net.setRole('deer');     // ролдор баштаганда кокустан берилет
  } catch {
    $('lobbyRoom').classList.add('hidden');
    $('lobbyJoin').classList.add('hidden');
    $('lobbyPick').classList.remove('hidden');
    $('srvWarn').classList.remove('hidden');
    ui.toast('❌ Серверге кошулбады');
    audio.sfx('wrongShot', { vol: 0.4 });
  }
  $('btnConnect').disabled = false;
  $('btnCreate').disabled = false;
}

function bindNet() {
  net.onPlayers = (list) => {
    ui.setPlayerList(list, net.id);
    document.getElementById('btnHostStart').classList.toggle('hidden', !net.isHost);
    document.getElementById('waitHost').classList.toggle('hidden', net.isHost);
    for (const [id, r] of remotes) {
      if (!net.players.has(id)) { r.dispose(); remotes.delete(id); }
    }
  };
  net.onStart = (m) => startOnline(m.roles);
  net.onState = (id, m) => {
    if (id === net.id) return;
    let r = remotes.get(id);
    if (!r) {
      const p = net.players.get(id);
      r = new RemoteAvatar(scene, world, p?.role || 'deer', p?.name || '');
      remotes.set(id, r);
    }
    r.setTarget(m.x, m.z, m.yaw, m.st, !!m.al);
  };
  net.onWorld = (m) => {
    if (net.isHost || !match) return;
    if (m.npc && herd) herd.applyNetState(m.npc);
    if (m.ph && m.ph !== match.phase) {
      match.phase = m.ph;
      world.setNight(match.isNight);
      onPhaseChanged(m.ph);
    }
    match.timeLeft = m.tl;
    if (m.san !== undefined) hunterSanity = m.san;
    if (m.cab && !cabin.active) cabin.place(m.cab[0], m.cab[1]);
  };
  net.onEvent = (id, m) => {
    if (m.k === 'shoot') {
      arrows.shoot(new THREE.Vector3(m.x, m.y, m.z), new THREE.Vector3(m.dx, m.dy, m.dz), m.p, 'remote');
    } else if (m.k === 'noise') {
      if (myRole === 'hunter') { pings.spawn(m.x, m.z); ui.toast(`🔊 ${m.l}`); }
    } else if (m.k === 'fart') {
      fartFX.spawn(m.x, world.heightAt(m.x, m.z), m.z);
    } else if (m.k === 'kill') {
      if (m.tid === net.id) playerDied();
      else { const r = remotes.get(m.tid); if (r) r.alive = false; }
    } else if (m.k === 'san') {
      hunterSanity = m.v;
    } else if (m.k === 'npcdead' && herd) {
      const d = herd.list[m.i]; if (d && !d.dead) herd.kill(d);
    } else if (m.k === 'claw') {
      if (myRole === 'hunter' && me.alive) {
        me.hurt(m.dmg); ui.flashHurt();
        if (!me.alive) net?.sendEvent({ k: 'hunterdead' });
      }
    } else if (m.k === 'hunterdead') {
      for (const [, r] of remotes) if (r.role === 'hunter') r.alive = false;
    } else if (m.k === 'win') {
      if (match && !match.over) match.end(m.w, m.t);
    }
  };
  net.onClose = () => { if (running) ui.toast('Байланыш үзүлдү'); };
}

function leaveNet() {
  if (net) { net.close(); net = null; }
  for (const [, r] of remotes) r.dispose();
  remotes.clear();
}

/* ============================================================
   РАУНД
   ============================================================ */
function clearRound() {
  if (herd) { for (const d of herd.list) scene.remove(d.m.group); herd = null; }
  if (botHunter) { scene.remove(botHunter.m.group); botHunter = null; }
  for (const w of botWendigos) w.dispose();
  botWendigos = [];
  arrows.clear();
  pings.clear();
  cams.clear();
  cabin.hide();
  world.setNight(false);
  world.nightBlend = 0;
  cage.visible = false;
  botHunterHealth = CFG.hunter.health;
  spectating = false;
  deathCam = null;
  ui.setDeathFade(0);
  document.getElementById('hud').classList.remove('dying');
}

function resetMe(role) {
  me.setRole(role);
  me.sanity = CFG.hunter.maxSanity;
  me.health = CFG.hunter.health;
  me.arrows = CFG.hunter.maxArrows;
  me.hunger = CFG.deer.maxHunger;
  hunterSanity = CFG.hunter.maxSanity;
}

function startSolo(role) {
  mode = 'solo';
  myRole = role;
  hunterName = '';
  clearRound();

  const rnd = makeRandom(Date.now() & 0xffff);
  herd = new Herd(scene, world, rnd, CFG.round.npcDeer, role === 'hunter' ? CFG.round.botTargets : 0);
  resetMe(role);

  if (role === 'hunter') {
    me.spawnAt(0, 0);
  } else {
    const p = world._spot(45, 80);
    me.spawnAt(p.x, p.z);
    botHunter = new BotHunter(scene, world, rnd);
    botHunter.x = 0; botHunter.z = 0;
    botHunter.onAimStart = () => {
      ui.big('🏹 МЕРГЕНЧИ СЕНИ КӨЗДӨП ЖАТАТ!', 1400, '#ff8a4a');
      ui.flashHurt();
      audio.sfx('bowDraw');
    };
  }
  cage.position.set(0, world.heightAt(0, 0), 0);
  cage.visible = true;

  beginMatch();
}

function startOnline(roles) {
  mode = 'online';
  myRole = roles[net.id] || 'deer';
  clearRound();

  /* Ким мергенчи болуп калды? */
  hunterName = '';
  for (const [id, r] of Object.entries(roles)) {
    if (r !== 'hunter') continue;
    hunterName = (+id === net.id) ? 'сен' : (net.players.get(+id)?.name || 'оюнчу');
  }

  const rnd = makeRandom(WORLD_SEED);
  herd = new Herd(scene, world, rnd, CFG.round.npcDeer, 0);
  resetMe(myRole);

  for (const [id, r] of remotes) r.setRole(roles[id] || 'deer');
  for (const [id, role] of Object.entries(roles)) {
    const nid = +id;
    if (nid === net.id || remotes.has(nid)) continue;
    const p = net.players.get(nid);
    remotes.set(nid, new RemoteAvatar(scene, world, role, p?.name || ''));
  }

  if (myRole === 'hunter') me.spawnAt(0, 0);
  else {
    const a = (net.id * 2.1) % 6.28, r = 50 + (net.id * 7) % 25;
    me.spawnAt(Math.cos(a) * r, Math.sin(a) * r);
  }
  cage.position.set(0, world.heightAt(0, 0), 0);
  cage.visible = true;

  beginMatch();
}

function beginMatch() {
  match = new Match(world);
  match.onPhase = onPhaseChanged;
  match.onEnd = (res) => {
    running = false;
    if (mode === 'online' && net?.isHost) net.sendEvent({ k: 'win', w: res.winner, t: res.text });
    const win = res.winner === myRole || (myRole === 'wendigo' && res.winner === 'deer');
    audio.setMode('menu');
    audio.sfx(win ? 'win' : 'lose');
    ui.showEnd(res, myRole, hunterName);
  };

  ui.showHud(myRole);
  ui.big(myRole === 'hunter'
    ? 'СЕН МЕРГЕНЧИСИҢ\n3 жебең бар · капастан чыкканды күт'
    : 'СЕН БУГУСУҢ\nбот бугулардын арасына жашын', 3400);

  audio.start().then(() => { audio.setMode('day'); audio.sfx('roundStart'); });

  running = true;
  last = performance.now();
  requestAnimationFrame(loop);
}

function onPhaseChanged(phase) {
  if (phase === 'day') {
    cage.visible = false;
    if (botHunter) botHunter.caged = false;
    ui.big(myRole === 'hunter' ? 'АҢЧЫЛЫК БАШТАЛДЫ' : 'МЕРГЕНЧИ ЧЫКТЫ!', 2200, '#ffb36a');
    audio.sfx('cageOpen');

  } else if (phase === 'night') {
    /* 🔊 чоң коркунучтуу сокку, анан түнкү дрон */
    audio.sfx('nightfall');
    setTimeout(() => { audio.setMode('night'); }, 1400);
    setTimeout(() => audio.sfx('wendigoRoar'), 2600);
    /* ⚡ Акыл-эс бүттү: кескин түн + вендиго + үй */
    ui.big(myRole === 'hunter'
      ? 'АКЫЛ-ЭСИҢ БҮТТҮ!\nүйгө жет — башка кутулуу жок'
      : 'ВЕНДИГО!\nэми сен аңчысың', 3600, '#ff4a3a');

    /* Үй МЕРГЕНЧИДЕН алыс жерде пайда болот — жанында туруп калуу болбойт */
    if (mode === 'solo' || net?.isHost) {
      const hp = myRole === 'hunter' ? me.pos : (nearestRemoteHunter() || { x: 0, z: 0 });
      const p = pickCabinSpot(hp);
      cabin.place(p.x, p.z);
      if (mode === 'online') net?.sendWorld({ cab: [p.x, p.z], ph: 'night', tl: match.timeLeft });
    }

    if (myRole === 'deer' && me.alive) {
      myRole = 'wendigo';
      const keep = { x: me.pos.x, z: me.pos.z };
      me.setRole('wendigo');
      me.spawnAt(keep.x, keep.z);
      me.frozen = CFG.wendigo.startFreeze;     // ⏸ мергенчи качып алсын
      ui.showHud('wendigo');
    }

    /* Мергенчиге: качууга 3 секунд бар */
    if (myRole === 'hunter') {
      setTimeout(() => ui.big(
        `ВЕНДИГОЛОР ${CFG.wendigo.startFreeze}с КАТЫП ТУРАТ\nЖҮГҮР!`, 2800, '#ff6a4a'), 3200);
    }
    for (const [, r] of remotes) if (r.role === 'deer') r.setRole('wendigo');

    /* ⚡ ЖАЛГЫЗ ОЙНОГОНДО МЕРГЕНЧИ БОЛСОҢ:
       таппай калган бугулар вендигого айланып сени кубалайт. */
    if (mode === 'solo' && myRole === 'hunter' && herd) {
      for (const d of herd.list) {
        if (!d.isTarget || d.dead) continue;
        d.isWendigo = true;
        d.m.group.visible = false;
        botWendigos.push(new BotWendigo(scene, world, d.x, d.z));
      }
      if (botWendigos.length) {
        ui.big(`${botWendigos.length} ВЕНДИГО ОЯНДЫ!\nүйгө жүгүр`, 3600, '#ff3a28');
      }
    }
  }
}

/* Мергенчиден эң кеминде CFG.cabin.minDist алыс жер табабыз */
function pickCabinSpot(from) {
  let best = null, bestD = -1;
  for (let i = 0; i < 60; i++) {
    const p = world._spot(25, CFG.world.size * 0.42);
    const d = Math.hypot(p.x - from.x, p.z - from.z);
    if (d >= CFG.cabin.minDist) return p;
    if (d > bestD) { bestD = d; best = p; }
  }
  return best;
}

function playerDied() {
  me.die();
  spectating = true;
  ui.big('СЕН КАРМАЛДЫҢ\nэми көрүүчүсүң', 3000, '#e8554a');
  ui.flashHurt();
  audio.sfx('hitFlesh');
  audio.sfx('death');
}

/* Менин үнүм чыкты → мергенчиге белги (жана чыныгы үн) */
function onMyNoise(kind, x, z) {
  audio.sfx(kind === 'jump' ? 'jump' : kind);     // eat | growl | fart | jump
  const n = CFG.noise[kind];
  if (!n) return;
  if (mode === 'online') {
    net?.sendEvent({ k: 'noise', x: +x.toFixed(1), z: +z.toFixed(1), l: n.label });
  } else if (botHunter) {
    const d = Math.hypot(botHunter.x - x, botHunter.z - z);
    if (d < n.range) {
      /* бот мергенчи үндү угуп ошол жакка бурулат */
      botHunter.dir = Math.atan2(-(x - botHunter.x), -(z - botHunter.z));
      botHunter.suspicion = Math.min(100, botHunter.suspicion + (kind === 'jump' ? 45 : 22));
      ui.toast(kind === 'jump' ? '⚠️ Секирдиң — мергенчи укту!' : '🔊 Үн чыкты');
    }
  }
}

/* ============================================================
   МЕНЮНУН АРТЫНДАГЫ КӨРҮНҮШ
   ============================================================ */
let idleLast = 0;
function idleLoop(now) {
  if (running) return;
  requestAnimationFrame(idleLoop);
  let dt = (now - idleLast) / 1000;
  idleLast = now;
  /* кадр түшүп калса убакытты кыркабыз — бирок нөлгө түшүрбөйбүз,
     болбосо трейлер эч качан бүтпөйт */
  if (!(dt > 0)) dt = 0.016;
  else if (dt > 0.1) dt = 0.1;

  if (intro && intro.running) {
    intro.update(dt);
  } else {
    const t = now * 0.00008;
    const y = world.heightAt(0, 0) + 3;
    camera.position.set(Math.cos(t) * 16, y, Math.sin(t) * 16);
    camera.lookAt(0, y - 1, 0);
    world.update(dt, camera);
  }
  renderer.render(scene, camera);
}

/* ============================================================
   НЕГИЗГИ ЦИКЛ
   ============================================================ */
function loop(now) {
  if (!running) { requestAnimationFrame(idleLoop); return; }
  requestAnimationFrame(loop);

  if (isPortrait()) { last = now; renderer.render(scene, camera); return; }

  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.1) dt = 0.1;

  const input = controls.poll();
  const caged = match.caged && myRole === 'hunter';
  if (caged) { input.move.x = 0; input.move.y = 0; input.pressed.jump = false; }

  world.update(dt, camera);

  if (deathCam) {
    updateDeathScene(dt);
    herd.update(dt, me.pos, null);
    for (const w of botWendigos) if (w !== deathCam.w) w.update(dt, me.pos, null, null);
    renderer.render(scene, camera);
    return;
  }

  if (spectating) {
    updateSpectator(dt);
  } else {
    me.update(dt, input, { caged, frozen: match.caged });
    if (caged) {
      const d = Math.hypot(me.pos.x, me.pos.z);
      if (d > 1.9) { me.pos.x *= 1.9 / d; me.pos.z *= 1.9 / d; }
    }
  }

  /* бот бугулар */
  const hFwd = myRole === 'hunter'
    ? { x: -Math.sin(me.yaw), z: -Math.cos(me.yaw) }
    : (botHunter ? botHunter.forward() : null);
  const hPos = myRole === 'hunter' ? me.pos : (botHunter ? botHunter.pos : nearestRemoteHunter());
  herd.update(dt, hPos, hFwd);

  if (botHunter) {
    botHunter.update(dt, me, botShoot);
    /* бугу мергенчини дубал аркылуу ак элес болуп көрөт */
    botHunter.xray.setVisible(myRole !== 'hunter');
  }
  for (const [, r] of remotes) {
    r.update(dt);
    if (r.role === 'hunter') r.setXRay(myRole !== 'hunter');
  }

  /* --- Бот вендиголор мергенчини кубалайт, үйдүн алдын тосот --- */
  const door = cabin.active ? cabin.door : null;
  const onRock = !!me.onPlatform;
  for (const w of botWendigos) w.update(dt, me.pos, onWendigoAttack, door, onRock);

  /* --- Кадам үндөрү --- */
  const spd = Math.hypot(me.vel.x, me.vel.z);
  if (!spectating && me.alive && me.onGround && spd > 0.5) {
    stepTimer -= dt * spd;
    if (stepTimer <= 0) {
      stepTimer = myRole === 'hunter' ? 3.0 : 2.6;
      audio.sfx(myRole === 'hunter' ? 'stepBoot' : 'stepHoof');
    }
  } else stepTimer = 0.5;

  /* --- Чыңалуу: коркунуч канчалык жакын (жүрөк кагуусун тездетет) --- */
  let tens = 0;
  if (myRole === 'hunter') {
    tens = 1 - me.sanity / CFG.hunter.maxSanity;
    /* түндө: эң жакынкы вендиго канча алыс */
    for (const w of botWendigos) {
      const d = Math.hypot(w.x - me.pos.x, w.z - me.pos.z);
      tens = Math.max(tens, Math.max(0, 1 - d / 26));
    }
  } else if (hPos) {
    const d = Math.hypot(hPos.x - me.pos.x, hPos.z - me.pos.z);
    tens = Math.max(0, 1 - d / 32);
  }
  audio.setTension(tens);

  fartFX.update(dt);
  pings.update(dt, myRole === 'hunter');
  arrows.update(dt, buildHitTargets());

  /* trail cam'дар — мергенчиге кабар берет */
  if (myRole === 'hunter') {
    cams.update(dt, camTargets(), (x, z) => {
      pings.spawn(x, z, 0x66ff99);
      ui.toast('📷 Камера кыймыл байкады');
      audio.sfx('camAlert');
    });
  }

  if (!spectating) handleActions(input, dt);

  /* жалгыз ойноодо бугу болсоң — бот мергенчинин акыл-эси да түшөт */
  if (mode === 'solo' && myRole !== 'hunter' && match.phase === 'day') {
    hunterSanity = Math.max(0, hunterSanity - CFG.hunter.sanityDrain * 1.6 * dt);
  }
  if (myRole === 'hunter') hunterSanity = me.sanity;

  /* раунддун жүрүшү */
  const aliveDeer = countAliveDeer();
  /* Үйгө жетүү заматта эмес — эшикти ачууга убакыт керек */
  let hunterAtCabin = false;
  if (match.isNight && cabin.active) {
    if (myRole === 'hunter') {
      hunterAtCabin = cabin.tryEnter(me.pos, dt);
      if (cabin.enterT > 0 && !hunterAtCabin) ui.toast('🚪 Эшикти ачып жатасың…');
    } else {
      hunterAtCabin = botAtCabin();
    }
  }
  /* өлүм сценасы жүрүп жатканда раунд бүтпөйт — кино аякташы керек */
  if (!deathCam && (mode === 'solo' || net?.isHost)) {
    match.update(dt, {
      aliveDeer,
      hunterAlive: myRole === 'hunter' ? me.alive : hunterRemoteAlive(),
      hunterSanity,
      hunterAtCabin,
    });
  }

  if (mode === 'online' && net?.connected) netSend(dt);

  ui.update(me, match, aliveDeer, {
    cams: cams.left,
    cabinDist: match.isNight && cabin.active ? cabin.distance(me.pos) : null,
    enterRatio: cabin.enterRatio,
    rockLeft: me.onPlatform ? Math.max(0, CFG.rock.maxTime - me.rockTime) : null,
    frozen: me.frozen > 0 ? me.frozen : null,
    spectating,
  });
  renderer.render(scene, camera);
}

/* ---------- Өлгөндөн кийинки эркин камера ---------- */
function updateSpectator(dt) {
  specAngle += dt * 0.12;
  const r = 26, h = 16;
  const cx = Math.cos(specAngle) * r, cz = Math.sin(specAngle) * r;
  camera.position.set(me.pos.x + cx, world.heightAt(me.pos.x + cx, me.pos.z + cz) + h, me.pos.z + cz);
  camera.lookAt(me.pos.x, me.pos.y + 1, me.pos.z);
}

function nearestRemoteHunter() {
  for (const [, r] of remotes) if (r.role === 'hunter') return { x: r.x, z: r.z, y: 0 };
  return null;
}
function hunterRemoteAlive() {
  for (const [, r] of remotes) if (r.role === 'hunter') return r.alive;
  return true;
}
function botAtCabin() {
  if (!botHunter) return false;
  return cabin.isNear({ x: botHunter.x, z: botHunter.z });
}

function countAliveDeer() {
  if (mode === 'solo') {
    if (myRole === 'hunter') return herd.aliveTargets();
    return me.alive ? 1 : 0;
  }
  let n = (myRole !== 'hunter' && me.alive) ? 1 : 0;
  for (const [, r] of remotes) if (r.role !== 'hunter' && r.alive) n++;
  return n;
}

/* trail cam текшере турган нысаналар */
function camTargets() {
  const out = [];
  if (mode === 'solo') {
    for (const d of herd.list) if (d.isTarget && !d.dead) out.push({ x: d.x, z: d.z });
  } else {
    for (const [, r] of remotes) if (r.role !== 'hunter' && r.alive) out.push({ x: r.x, z: r.z });
  }
  return out;
}

/* ---------- Жебе тийе турган нерселер ---------- */
function buildHitTargets() {
  const list = [];

  if (myRole === 'hunter') {
    for (let i = 0; i < herd.list.length; i++) {
      const d = herd.list[i];
      if (d.dead) continue;
      list.push({ x: d.x, y: world.heightAt(d.x, d.z) + 1.0, z: d.z, r: 0.8,
        onHit: () => onHitNpc(d, i) });
    }
    for (const [id, r] of remotes) {
      if (r.role === 'hunter' || !r.alive) continue;
      list.push({ x: r.x, y: world.heightAt(r.x, r.z) + 1.0, z: r.z, r: 0.85,
        onHit: () => onHitPlayer(id, r) });
    }
    /* вендигону өлтүрүүгө болбойт, бирок жебе аны токтотуп турат */
    for (const w of botWendigos) {
      list.push({ x: w.x, y: world.heightAt(w.x, w.z) + 1.5, z: w.z, r: 1.0,
        onHit: () => { w.hit(); audio.sfx('hitFlesh'); ui.toast('🩸 Токтоду — бирок өлбөйт!'); } });
    }
  } else if (me.alive && !spectating) {
    /* Мен бугумун — мага учкан жебени өзүм текшерем */
    const c = me.centerPos();
    list.push({ x: c.x, y: c.y, z: c.z, r: 0.95, onHit: () => onHitMe() });
  }
  return list;
}

function onHitNpc(d, i) {
  herd.kill(d);
  audio.sfx('hitFlesh');
  if (d.isTarget) {
    me.sanity = Math.min(CFG.hunter.maxSanity, me.sanity + CFG.hunter.rightShotReward);
    ui.big('ОЮНЧУ БУГУ!', 1600, '#b7e86a');
    audio.sfx('rightShot');
  } else {
    me.sanity = Math.max(0, me.sanity - CFG.hunter.wrongShotPenalty);
    ui.big('ЖАҢЫЛДЫҢ!\nбул жөн эле бугу — акыл-эс түштү', 2200, '#e8554a');
    ui.flashHurt();
    audio.sfx('wrongShot');
  }
  if (mode === 'online') net?.sendEvent({ k: 'npcdead', i });
}

function onHitPlayer(id, r) {
  r.alive = false;
  me.sanity = Math.min(CFG.hunter.maxSanity, me.sanity + CFG.hunter.rightShotReward);
  ui.big('ОЮНЧУ БУГУ КАРМАЛДЫ!', 1800, '#b7e86a');
  audio.sfx('hitFlesh'); audio.sfx('rightShot');
  net?.sendEvent({ k: 'kill', tid: id });
}

function onHitMe() {
  if (!me.alive) return;
  if (myRole === 'wendigo') { me.hurt(45); ui.flashHurt(); if (!me.alive) playerDied(); return; }
  playerDied();
  if (mode === 'online') net?.sendEvent({ k: 'kill', tid: net.id });
}

/* ============================================================
   ӨЛҮМ СЦЕНАСЫ
   Вендиго жеткенде: камера кескин ага бурулат, экран титирейт,
   вендиго каптап келет, анан адам жерге кулайт.
   ============================================================ */
let deathCam = null;

function startDeathScene(w) {
  if (deathCam) return;
  me.alive = false;
  me.health = 0;
  me.aiming = false;
  me.draw = 0;
  me.vm.visible = false;            // колдогу жаа кино учурунда жашырылат
  controls && (controls.move.x = controls.move.y = 0);

  deathCam = {
    t: 0,
    w,
    /* өлүм учурундагы абал */
    px: me.pos.x, py: me.pos.y + CFG.hunter.height, pz: me.pos.z,
    yaw0: me.yaw, pitch0: me.pitch,
    /* вендигонун баштапкы орду */
    wx0: w.x, wz0: w.z,
    roll: 0,
    done: false,
  };

  audio.sfx('wendigoRoar', { vol: 1 });
  audio.sfx('hitFlesh');
  setTimeout(() => audio.sfx('death'), 420);
  ui.big('', 1);
  document.getElementById('hud').classList.add('dying');
}

function updateDeathScene(dt) {
  const D = deathCam;
  D.t += dt;
  const t = D.t;
  const w = D.w;

  /* Вендиго камерага каптап келет, бирок дал үстүнө чыкпайт —
     1.7 метр калганда токтойт, ошондо экранды толтуруп турат. */
  const lungeK = Math.min(1, Math.max(0, (t - 0.1) / 0.7));
  const vx = D.wx0 - D.px, vz = D.wz0 - D.pz;
  const vl = Math.max(0.001, Math.hypot(vx, vz));
  const stopX = D.px + (vx / vl) * 1.7, stopZ = D.pz + (vz / vl) * 1.7;
  const e = lungeK * lungeK * (3 - 2 * lungeK);
  const tx = stopX, tz = stopZ;
  w.x = D.wx0 + (stopX - D.wx0) * e;
  w.z = D.wz0 + (stopZ - D.wz0) * e;
  w.m.group.position.set(w.x, world.heightAt(w.x, w.z), w.z);
  w.m.group.rotation.y = Math.atan2(D.px - w.x, D.pz - w.z) + Math.PI;
  void tx; void tz;
  w.m.setAnim('run', dt);

  /* 1. Камера кескин вендигого бурулат */
  const wantYaw = Math.atan2(-(w.x - D.px), -(w.z - D.pz));
  const snap = 1 - Math.exp(-14 * dt);
  me.yaw += (((wantYaw - me.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * snap;
  me.pitch += (0.12 - me.pitch) * snap;

  /* 2. Титирөө — башында катуу, анан басаңдайт */
  const shakeAmt = t < 1.3 ? 0.12 * (1 - t / 1.3) + 0.03 : Math.max(0, 0.05 * (1 - (t - 1.3) / 1.2));
  const sx = (Math.random() - 0.5) * shakeAmt;
  const sy = (Math.random() - 0.5) * shakeAmt;

  /* 3. Жерге кулоо */
  let camY = D.py;
  if (t > 1.15) {
    const k = Math.min(1, (t - 1.15) / 1.0);
    const e = k * k * (3 - 2 * k);                 // жумшак кулоо
    camY = D.py + (world.heightAt(D.px, D.pz) + 0.3 - D.py) * e;
    D.roll = e * 1.35;
    me.pitch += (( -0.35) - me.pitch) * (1 - Math.exp(-5 * dt));
  }

  camera.position.set(D.px + sx, camY + sy, D.pz);
  camera.rotation.set(me.pitch, me.yaw, D.roll, 'YXZ');

  /* 4. Кызыл экран күчөйт */
  ui.setDeathFade(Math.min(1, t / 2.0));

  if (t > 2.6 && !D.done) {
    D.done = true;
    document.getElementById('hud').classList.remove('dying');
    match.end('deer', 'Вендиго мергенчини кармады');
  }
}

/* Бот вендиго мергенчини чапты — бир сокку = өлүм */
function onWendigoAttack(w) {
  if (myRole !== 'hunter' || !me.alive || deathCam) return;
  startDeathScene(w);
}

function botShoot(bot, player, dist) {
  const B = CFG.botHunter;
  const from = new THREE.Vector3(bot.x, world.heightAt(bot.x, bot.z) + 1.45, bot.z);

  /* оюнчунун кыймылын эсепке алып, бир аз алдын көздөйт */
  const to = player.centerPos().clone();
  const flight = dist / CFG.bow.arrowSpeed;
  to.x += player.vel.x * flight * 0.7;
  to.z += player.vel.z * flight * 0.7;
  /* гравитацияны компенсациялоо */
  to.y += 0.5 * CFG.bow.arrowGravity * flight * flight;

  const dir = to.sub(from).normalize();
  const miss = B.accuracy * (0.5 + dist / B.shootDist);
  dir.x += (Math.random() - 0.5) * miss;
  dir.y += (Math.random() - 0.5) * miss * 0.5;
  dir.z += (Math.random() - 0.5) * miss;
  dir.normalize();

  arrows.shoot(from, dir, 1, 'bot');
  ui.toast('🏹 Мергенчи атты!');
  const vol = Math.max(0.25, 1 - dist / 50);
  audio.sfx('bowRelease', { vol });
  setTimeout(() => audio.sfx('whoosh', { vol: 0.8 }), 90);
}

/* ============================================================
   БАСКЫЧТАР
   ============================================================ */
function handleActions(input, dt) {
  if (!me.alive) return;

  if (myRole === 'hunter') {
    /* 🏹 эки кадам: бир бас — тартылат, экинчи бас — атылат */
    if (input.pressed.fire) {
      if (!me.aiming) {
        if (match.caged) ui.toast('Капастан чыкканды күт');
        else if (!me.startDraw()) ui.toast(me.arrows <= 0 ? 'Жебе жок — күтө тур' : '…');
        else audio.sfx('bowDraw');
      } else {
        const power = me.releaseBow();
        if (power > 0) {
          const dir = me.forward();
          const origin = camera.position.clone().addScaledVector(dir, 0.6);
          origin.y -= 0.1;
          arrows.shoot(origin, dir, power, 'me');
          audio.sfx('bowRelease');
          setTimeout(() => audio.sfx('whoosh', { vol: 0.5 }), 70);
          if (mode === 'online') net?.sendEvent({
            k: 'shoot',
            x: +origin.x.toFixed(2), y: +origin.y.toFixed(2), z: +origin.z.toFixed(2),
            dx: +dir.x.toFixed(3), dy: +dir.y.toFixed(3), dz: +dir.z.toFixed(3), p: power,
          });
        } else ui.toast('Толук тартылган жок');
      }
    }
    /* 📷 камера коюу */
    if (input.pressed.use) {
      if (match.caged) { ui.toast('Капастан чыкканды күт'); return; }
      const dir = me.forward();
      const x = me.pos.x + dir.x * 1.6, z = me.pos.z + dir.z * 1.6;
      if (cams.place(x, z, me.yaw)) { ui.toast(`📷 Камера коюлду (${cams.left} калды)`); audio.sfx('camPlace'); }
      else ui.toast('Камера калган жок');
    }

  } else if (myRole === 'wendigo') {
    if (input.pressed.fire && me.tryAttack()) {
      const target = mode === 'solo'
        ? (botHunter ? { x: botHunter.x, z: botHunter.z } : null)
        : nearestRemoteHunter();
      if (target) {
        const d = Math.hypot(target.x - me.pos.x, target.z - me.pos.z);
        if (d < CFG.wendigo.attackRange) {
          ui.big('ЧАПТЫҢ!', 900, '#ff6a4a');
          audio.sfx('wendigoRoar', { vol: 0.6 });
          audio.sfx('hitFlesh');
          if (mode === 'online') net?.sendEvent({ k: 'claw', dmg: CFG.wendigo.damage });
          else {
            botHunterHealth -= CFG.wendigo.damage;
            if (botHunterHealth <= 0) match.end('deer', 'Вендиго мергенчини кармады');
          }
        } else ui.toast('Жакындап бар');
      }
    }

  } else {
    /* бугу */
    if (input.pressed.use) {
      if (!me.tryEat()) ui.toast('Жакын жерде козу карын жок');
    }
    if (input.pressed.fart) {
      if (me.tryFart()) {
        fartFX.spawn(me.pos.x, me.pos.y, me.pos.z);
        if (mode === 'online') net?.sendEvent({ k: 'fart', x: +me.pos.x.toFixed(1), z: +me.pos.z.toFixed(1) });
      } else ui.toast('💨 даяр эмес');
    }
    if (input.pressed.fire) {
      me.grazing = !me.grazing;
      ui.toast(me.grazing ? '🌿 Оттоп жатасың — бот бугудай' : 'Турдуң');
    }
  }
}

/* ============================================================
   ТАРМАК
   ============================================================ */
function netSend(dt) {
  netTimer -= dt;
  if (netTimer <= 0) {
    netTimer = 1 / CFG.net.sendRate;
    const moving = Math.hypot(me.vel.x, me.vel.z) > 0.4;
    /* мергенчи жааны тартып жатса — башкалар муну көрүшү керек */
    const st = (myRole === 'hunter' && me.draw > 0.05) ? 'aim'
             : (me.eating > 0 || me.grazing) ? 'graze'
             : (moving ? 'walk' : 'idle');
    net.sendState(me.pos.x, me.pos.z, myRole === 'hunter' ? me.yaw : me.modelYaw, st, me.alive);
  }
  if (net.isHost) {
    worldTimer -= dt;
    if (worldTimer <= 0) {
      worldTimer = 1 / CFG.net.worldRate;
      net.sendWorld({
        npc: herd.netState(),
        ph: match.phase,
        tl: +match.timeLeft.toFixed(1),
        san: +hunterSanity.toFixed(1),
      });
    }
  }
  if (myRole === 'hunter') {
    sanityTimer -= dt;
    if (sanityTimer <= 0) {
      sanityTimer = 0.4;
      net.sendEvent({ k: 'san', v: +me.sanity.toFixed(1) });
    }
  }
}

/* ------------------------------------------------------------ */
init();
