// The in-game HUD: health and armor bars, wanted stars, money, weapon and ammo, the objective
// line with its timer, the speedometer in a car, the radio station card, the clock and district,
// subtitles with speaker names, notifications, the controls help for the first minutes, the hit
// marker, the damage flash, the pointer-capture prompt and the crosshair.
import { WEAPONS } from '../config.js';
import { speedKmh } from '../vehicles/physics.js';
import { DISTRICTS } from '../city/layout.js';

function el(id) {
  return document.getElementById(id);
}

export function createHud(G) {
  const dom = {
    hud: el('hud'), health: el('bar-health'), armor: el('bar-armor'), stars: el('stars'), money: el('money'),
    weapon: el('weapon-name'), ammo: el('weapon-ammo'), objective: el('objective'), objectiveText: el('objective-text'), timer: el('mission-timer'),
    speed: el('speedo'), speedValue: el('speed-value'), vehicleName: el('vehicle-name'), radio: el('radio'), radioName: el('radio-name'),
    clock: el('clock'), district: el('district'), subtitles: el('subtitles'), subSpeaker: el('sub-speaker'), subText: el('sub-text'),
    notifications: el('notifications'), prompt: el('pointer-prompt'), crosshair: el('crosshair'), flash: el('damage-flash'),
    help: el('controls-help'), hitmarker: el('hitmarker'), banner: el('banner'), bannerTitle: el('banner-title'), bannerSub: el('banner-sub'),
    waypointInfo: el('waypoint-info'), hint: el('hint'), arrest: el('arrest-bar'), arrestFill: el('arrest-fill'), moneyDelta: el('money-delta'),
  };
  const starEls = [];
  for (let i = 0; i < 5; i += 1) {
    const s = document.createElement('span');
    s.className = 'star';
    s.textContent = '★';
    dom.stars.appendChild(s);
    starEls.push(s);
  }
  const state = {
    objective: '', timer: null, waypoint: null, subs: [], subTimer: 0, notes: [], helpTime: 0, helpShown: false, hintText: '', hintTimer: 0,
    bannerTimer: 0, flashTimer: 0, hitTimer: 0, weaponFlash: 0, moneyPulse: 0, visible: true, lastDistrict: '', districtTimer: 0,
  };

  function setObjective(text) {
    state.objective = text || '';
    dom.objectiveText.textContent = state.objective;
    dom.objective.classList.toggle('hidden', !state.objective);
  }

  const hud = {
    state,
    setObjective,
    setWaypoint(x, z, kind = 'waypoint') {
      state.waypoint = x === null ? null : { x, z, kind };
    },
    setTimer(seconds) {
      state.timer = seconds;
    },
    say(name, text, seconds = 3.6, color = '#ffd43b') {
      state.subs.push({ name, text, seconds: Math.max(2.2, seconds || Math.min(6, 1.6 + text.length * 0.045)), color });
    },
    talking: () => state.subs.length > 0,
    skipLine() {
      if (state.subs.length) {
        state.subs.shift();
        state.subTimer = 0;
      }
    },
    notify(text) {
      const n = document.createElement('div');
      n.className = 'note';
      n.textContent = text;
      dom.notifications.prepend(n);
      state.notes.push({ el: n, t: 4.5 });
      while (state.notes.length > 5) {
        const old = state.notes.shift();
        old.el.remove();
      }
    },
    hint(text) {
      state.hintText = text;
      state.hintTimer = 5;
    },
    flashDamage(strength = 0.6) {
      state.flashTimer = Math.max(state.flashTimer, strength);
    },
    flashWeapon() {
      state.weaponFlash = 1;
    },
    hitMarker(kill) {
      state.hitTimer = 0.25;
      dom.hitmarker.classList.toggle('kill', !!kill);
    },
    moneyPulse(amount) {
      state.moneyPulse = 1.2;
      dom.moneyDelta.textContent = `${amount >= 0 ? '+' : '-'}$${Math.abs(amount).toLocaleString()}`;
      dom.moneyDelta.className = amount >= 0 ? 'gain' : 'loss';
    },
    missionTitle(title) {
      dom.bannerTitle.textContent = title;
      dom.bannerSub.textContent = 'MISSION';
      dom.banner.className = 'banner show mission';
      state.bannerTimer = 3.5;
    },
    missionFailed(reason) {
      dom.bannerTitle.textContent = 'MISSION FAILED';
      dom.bannerSub.textContent = reason || '';
      dom.banner.className = 'banner show failed';
      state.bannerTimer = 3.5;
      setObjective('');
      state.timer = null;
    },
    banner(title, sub, cls = '') {
      dom.bannerTitle.textContent = title;
      dom.bannerSub.textContent = sub || '';
      dom.banner.className = `banner show ${cls}`;
      state.bannerTimer = 3.5;
    },
    show(v) {
      state.visible = v;
      dom.hud.classList.toggle('hidden', !v);
    },
    /** Drop hints, notifications, banners and queued lines (screenshot scenes, new game). */
    clearTransient() {
      state.hintTimer = 0;
      state.subs.length = 0;
      state.bannerTimer = 0;
      dom.banner.className = 'banner';
      for (const n of state.notes) n.el.remove();
      state.notes.length = 0;
      dom.hint.classList.add('hidden');
    },
    showHelp(v) {
      state.helpShown = v;
      state.helpTime = v ? 0 : 999;
      dom.help.classList.toggle('hidden', !v);
    },
    update(dt) {
      const p = G.player;
      // Bars.
      dom.health.style.width = `${Math.max(0, Math.min(100, p.health))}%`;
      dom.armor.style.width = `${Math.max(0, Math.min(100, p.armor))}%`;
      dom.health.parentElement.classList.toggle('low', p.health < 30);
      // Stars.
      const stars = G.wanted.stars;
      const blink = G.wanted.stars > 0 && !G.wanted.inSight && Math.sin(G.world.time * 6) > 0;
      for (let i = 0; i < 5; i += 1) {
        starEls[i].classList.toggle('on', i < stars);
        starEls[i].classList.toggle('blink', i < stars && blink);
        starEls[i].classList.toggle('flash', i < stars && G.wanted.flash > 0 && Math.sin(G.world.time * 20) > 0);
      }
      // Money.
      dom.money.textContent = `$${G.economy.money.toLocaleString()}`;
      if (state.moneyPulse > 0) {
        state.moneyPulse -= dt;
        dom.moneyDelta.style.opacity = Math.min(1, state.moneyPulse);
      } else dom.moneyDelta.style.opacity = 0;
      // Weapon.
      const w = G.weapons;
      dom.weapon.textContent = WEAPONS[w.current].name;
      dom.ammo.textContent = w.reloading > 0 ? 'RELOADING' : w.ammoText();
      if (state.weaponFlash > 0) {
        state.weaponFlash -= dt * 2;
        dom.weapon.parentElement.classList.add('flash');
      } else dom.weapon.parentElement.classList.remove('flash');
      // Objective + timer.
      if (state.timer !== null) {
        const t = Math.max(0, state.timer);
        const mm = Math.floor(t / 60);
        const ss = Math.floor(t % 60);
        dom.timer.textContent = `${mm}:${String(ss).padStart(2, '0')}`;
        dom.timer.classList.remove('hidden');
        dom.timer.classList.toggle('urgent', t < 20);
      } else dom.timer.classList.add('hidden');
      if (state.waypoint) {
        const d = Math.hypot(state.waypoint.x - p.x, state.waypoint.z - p.z);
        dom.waypointInfo.textContent = `${Math.round(d)} m`;
        dom.waypointInfo.classList.remove('hidden');
      } else dom.waypointInfo.classList.add('hidden');
      // Speed.
      const v = p.vehicle;
      if (p.state === 'car' && v) {
        dom.speed.classList.remove('hidden');
        dom.speedValue.textContent = String(Math.round(speedKmh(v)));
        const fire = v.onFire ? `  ⚠ ON FIRE ${Math.max(0, Math.ceil(v.fuse))} s` : v.hp < 38 ? '  ⚠ DAMAGED' : '';
        dom.vehicleName.textContent = v.spec.name + fire;
        dom.vehicleName.classList.toggle('warn', v.hp < 38 || v.onFire);
        dom.vehicleName.classList.toggle('fire', !!v.onFire);
        dom.radio.classList.remove('hidden');
        dom.radioName.textContent = G.radio.stationName();
        dom.radio.classList.toggle('off', !G.radio.playing);
      } else {
        dom.speed.classList.add('hidden');
        dom.radio.classList.add('hidden');
      }
      // Clock and district.
      dom.clock.textContent = G.world.sky.clockText();
      const districtId = G.world.layout.districtAt(p.x, p.z);
      const districtName = DISTRICTS[districtId] ? DISTRICTS[districtId].name : '';
      if (districtName !== state.lastDistrict) {
        state.lastDistrict = districtName;
        state.districtTimer = 4;
        dom.district.style.color = DISTRICTS[districtId] ? DISTRICTS[districtId].color : '#fff';
      }
      dom.district.textContent = districtName;
      state.districtTimer = Math.max(0, state.districtTimer - dt);
      dom.district.classList.toggle('big', state.districtTimer > 0);
      // Subtitles.
      if (state.subs.length) {
        const line = state.subs[0];
        dom.subtitles.classList.remove('hidden');
        dom.subSpeaker.textContent = line.name;
        dom.subSpeaker.style.color = line.color;
        dom.subText.textContent = line.text;
        state.subTimer += dt;
        if (state.subTimer >= line.seconds) {
          state.subs.shift();
          state.subTimer = 0;
        }
      } else dom.subtitles.classList.add('hidden');
      // Notifications.
      for (let i = state.notes.length - 1; i >= 0; i -= 1) {
        const n = state.notes[i];
        n.t -= dt;
        if (n.t < 1) n.el.style.opacity = Math.max(0, n.t);
        if (n.t <= 0) {
          n.el.remove();
          state.notes.splice(i, 1);
        }
      }
      // Hint.
      if (state.hintTimer > 0) {
        state.hintTimer -= dt;
        dom.hint.textContent = state.hintText;
        dom.hint.classList.remove('hidden');
      } else dom.hint.classList.add('hidden');
      // Help card for the first minutes of a new game.
      if (state.helpShown) {
        state.helpTime += dt;
        if (state.helpTime > 75) hud.showHelp(false);
      }
      // Banner.
      if (state.bannerTimer > 0) {
        state.bannerTimer -= dt;
        if (state.bannerTimer <= 0) dom.banner.className = 'banner';
      }
      // Flash and hit marker.
      if (state.flashTimer > 0) {
        state.flashTimer -= dt * 1.5;
        dom.flash.style.opacity = Math.max(0, Math.min(0.7, state.flashTimer));
      } else dom.flash.style.opacity = 0;
      if (state.hitTimer > 0) {
        state.hitTimer -= dt;
        dom.hitmarker.classList.add('show');
      } else dom.hitmarker.classList.remove('show');
      // Crosshair when armed on foot.
      const armed = p.state === 'foot' && G.weapons.current !== 'fists';
      dom.crosshair.classList.toggle('hidden', !armed);
      // Pointer prompt: "Click to resume" after a menu, else the first capture of a session.
      const needsClick = G.input.needsClick;
      const needPrompt = G.state === 'playing' && !G.input.locked && (needsClick || !G.input.lockRefused) && !G.input.state.testMode;
      dom.prompt.textContent = needsClick ? 'Click to resume' : 'Click to control the camera';
      dom.prompt.classList.toggle('hidden', !needPrompt);
      // Arrest bar.
      const ap = G.police.arrestProgress();
      dom.arrest.classList.toggle('hidden', ap <= 0.02);
      dom.arrestFill.style.width = `${Math.min(100, ap * 100)}%`;
    },
  };
  setObjective('');
  return hud;
}
