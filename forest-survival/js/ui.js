/* ============================================================
   Экрандар жана HUD.
   ============================================================ */

import { CFG } from './config.js';
import { Match } from './gamemode.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.screens = ['loading', 'menu', 'roleSelect', 'lobby', 'rules', 'endScreen'];
    this.el = {
      loadbar: $('loadbar'), loadtip: $('loadtip'),
      hud: $('hud'),
      phase: $('phaseLbl'), time: $('timeLbl'),
      sanityBox: $('sanityBox'), sanityFill: $('sanityFill'), sanityName: $('sanityName'),
      hp: $('hpFill'), hunger: $('hungerFill'),
      arrow: $('cntArrow'), deerCnt: $('cntDeer'), cam: $('cntCam'),
      toast: $('toast'), big: $('bigmsg'), hand: $('handLabel'),
      hurt: $('hurt'), eatBar: $('eatBar'), eatFill: $('eatFill'),
      fire: $('btnFire'), use: $('btnUse'),
      cabinHint: $('cabinHint'), cabinDist: $('cabinDist'),
      deathFade: $('deathFade'),
      endTitle: $('endTitle'), endText: $('endText'),
      playerList: $('playerList'),
    };
    this._toastT = 0;
    this._bigT = 0;
  }

  progress(p, text) {
    this.el.loadbar.style.width = Math.round(p * 100) + '%';
    if (text) this.el.loadtip.textContent = text;
  }

  /* Браузер үн чыгарууга уруксат бериши үчүн бир басуу керек */
  showStartGate() {
    $('loading').classList.remove('hidden');
    $('loadbarwrap').classList.add('hidden');
    $('loadtip').classList.add('hidden');
    $('btnGate').classList.remove('hidden');
    $('gateTip').classList.remove('hidden');
  }

  show(name) {
    for (const s of this.screens) $(s).classList.toggle('hidden', s !== name);
    this.el.hud.classList.add('hidden');
  }
  hideAll() {
    for (const s of this.screens) $(s).classList.add('hidden');
  }
  showHud(role) {
    this.hideAll();
    this.el.hud.classList.remove('hidden');
    document.body.classList.remove('role-deer', 'role-hunter', 'role-wendigo');
    document.body.classList.add('role-' + role);
  }

  toast(msg) {
    this.el.toast.textContent = msg;
    this.el.toast.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => this.el.toast.classList.remove('show'), 1800);
  }

  big(msg, ms = 2200, color = '#eaf2e6') {
    this.el.big.textContent = msg;
    this.el.big.style.color = color;
    this.el.big.classList.add('show');
    clearTimeout(this._bigT);
    this._bigT = setTimeout(() => this.el.big.classList.remove('show'), ms);
  }

  flashHurt() {
    this.el.hurt.classList.add('on');
    setTimeout(() => this.el.hurt.classList.remove('on'), 90);
  }

  setPlayerList(list, myId) {
    this.el.playerList.innerHTML = '';
    for (const p of list) {
      const d = document.createElement('div');
      d.className = 'p' + (p.id === myId ? ' me' : '');
      /* Ролдор баштаганда кокустан берилет — азыр көрсөтпөйбүз */
      d.innerHTML = `👤 ${escapeHtml(p.name)}` + (p.host ? ' <span class="h">★</span>' : '');
      this.el.playerList.appendChild(d);
    }
  }

  update(me, match, aliveDeer, extra = {}) {
    this.el.phase.textContent = match.phaseLabel();
    this.el.time.textContent = Match.clock(match.timeLeft);

    if (me.role === 'hunter') {
      this.el.sanityBox.style.display = '';
      this.el.sanityFill.style.width = (me.sanity / CFG.hunter.maxSanity * 100) + '%';
      this.el.sanityName.textContent = me.sanity < 25 ? 'АКЫЛ-ЭС БҮТҮП БАРАТ!' : 'Акыл-эс';
      this.el.hp.style.width = me.health + '%';
      this.el.arrow.textContent = me.arrows;
      this.el.cam.textContent = extra.cams ?? 0;
      this.el.use.textContent = '📷';
      this.el.hand.textContent = me.draw > 0.98 ? 'ЖАА ДАЯР — АТ!'
                               : me.draw > 0.02 ? 'ТАРТЫЛУУДА…'
                               : me.arrows > 0 ? 'ЖАА' : 'ЖЕБЕ КҮТҮҮДӨ…';
      this.el.fire.classList.toggle('armed', me.draw > 0.98);
      this.el.fire.textContent = me.draw > 0.98 ? '🎯' : '🏹';
    } else {
      this.el.sanityBox.style.display = 'none';
      this.el.hunger.style.width = (me.hunger / CFG.deer.maxHunger * 100) + '%';
      this.el.use.textContent = '✋';
      this.el.hand.textContent = me.role === 'wendigo'
        ? 'ВЕНДИГО — 🩸 менен чап'
        : me.hunger <= 0 ? '⚠️ КУРСАГЫҢ КОРУЛДАП ЖАТАТ'
        : me.grazing ? 'ОТТОП ЖАТАСЫҢ'
        : me.fartCd > 0 ? `💨 ${Math.ceil(me.fartCd)}с` : '';
      this.el.fire.textContent = me.role === 'wendigo' ? '🩸' : '🌿';
      this.el.fire.classList.toggle('armed', me.role === 'deer' && !!me.grazing);
    }

    this.el.deerCnt.textContent = aliveDeer;

    /* түндө мергенчиге үйгө чейинки аралык */
    const showCabin = extra.cabinDist != null && me.role === 'hunter';
    this.el.cabinHint.classList.toggle('hidden', !showCabin);
    if (showCabin) this.el.cabinDist.textContent = Math.round(extra.cabinDist);

    /* Ташта турган убакыт / вендигонун катып турушу — колдун жанында */
    if (extra.frozen != null) {
      this.el.hand.textContent = `⏸ ${extra.frozen.toFixed(1)}с — кыймылдай албайсың`;
    } else if (extra.rockLeft != null) {
      this.el.hand.textContent = `⛰️ ТАШТА ${extra.rockLeft.toFixed(1)}с`;
    }

    /* тилке: жеп жатат / эшик ачып жатат / ташта турат */
    const eating = me.eating > 0;
    const entering = (extra.enterRatio || 0) > 0.01 && me.role === 'hunter';
    const onRock = extra.rockLeft != null;
    this.el.eatBar.classList.toggle('show', eating || entering || onRock);
    this.el.eatBar.classList.toggle('enter', entering);
    this.el.eatBar.classList.toggle('rock', onRock && !entering);
    if (entering) this.el.eatFill.style.width = (extra.enterRatio * 100) + '%';
    else if (onRock) this.el.eatFill.style.width = (extra.rockLeft / CFG.rock.maxTime * 100) + '%';
    else if (eating) this.el.eatFill.style.width = ((1 - me.eating / CFG.deer.eatTime) * 100) + '%';
  }

  setDeathFade(k) { this.el.deathFade.style.opacity = k; }

  showEnd(result, myRole, hunterName) {
    const win = result.winner === myRole || (myRole === 'wendigo' && result.winner === 'deer');
    this.el.endTitle.textContent = win ? 'ЖЕҢДИҢ!' : 'ЖЕҢИЛДИҢ';
    this.el.endTitle.style.color = win ? '#b7e86a' : '#e8554a';
    this.el.endText.textContent = hunterName
      ? `${result.text} · 🏹 мергенчи: ${hunterName}`
      : result.text;
    this.show('endScreen');
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
