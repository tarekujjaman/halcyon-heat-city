// The in-game HUD: health and armor bars, the respect rank bar, wanted stars, money, the weapon
// hotbar, the mission panel (mission chip, objective, timer, stage progress, next step), the police
// response panel with callsigned units while wanted, the speedometer in a car, the radio station
// card, the day clock and district, subtitles with speaker names, notifications, the controls help
// for the first minutes, the hit marker, the damage flash, the pointer-capture prompt and the crosshair.
import { ECONOMY, WEAPONS } from '../config.js';
import { speedKmh } from '../vehicles/physics.js';
import { DISTRICTS } from '../city/layout.js';
import { LOOKS } from '../characters.js';

function el(id) {
  return document.getElementById(id);
}

/** Speaker name → the character look its portrait is painted from and the role under the name. */
const SPEAKERS = {
  'Sol': { look: 'sol', role: 'DRIVER' },
  'Uncle Teo': { look: 'teo', role: 'BODY SHOP' },
  'Dani': { look: 'dani', role: 'WHEELWOMAN' },
  'Kane Okafor': { look: 'kane', role: 'TIDE RUNNERS' },
  'Det. Ruiz': { look: 'ruiz', role: 'HBPD' },
  'Rico': { look: 'gang', role: 'TIDE RUNNERS' },
  'Dispatch': { look: 'officer', role: 'HBPD' },
};
const portraits = new Map();

/** A 72x72 bust painted from the character's look (skin, hair, shirt, jacket, hat); cached per speaker. */
function portraitFor(name, color) {
  if (portraits.has(name)) return portraits.get(name);
  const info = SPEAKERS[name] || { look: 'gang', role: '' };
  const look = LOOKS[info.look] || LOOKS.gang;
  const c = document.createElement('canvas');
  c.width = 72;
  c.height = 72;
  const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, 0, 72);
  bg.addColorStop(0, color || '#ffb347');
  bg.addColorStop(1, '#0b1424');
  g.fillStyle = bg;
  g.fillRect(0, 0, 72, 72);
  // Shoulders and shirt, jacket lapels over them.
  g.fillStyle = look.shirt;
  g.beginPath();
  g.moveTo(6, 72); g.quadraticCurveTo(10, 48, 36, 46); g.quadraticCurveTo(62, 48, 66, 72); g.closePath(); g.fill();
  if (look.jacket) {
    g.fillStyle = look.jacket;
    g.beginPath(); g.moveTo(6, 72); g.quadraticCurveTo(10, 48, 28, 46); g.lineTo(24, 72); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(66, 72); g.quadraticCurveTo(62, 48, 44, 46); g.lineTo(48, 72); g.closePath(); g.fill();
  }
  // Neck and head.
  g.fillStyle = look.skin;
  g.fillRect(30, 40, 12, 10);
  g.beginPath(); g.ellipse(36, 30, 13, 15, 0, 0, Math.PI * 2); g.fill();
  // Hair by style: 0 short cap, 1 fuller with sideburns, 2 swept back; a hat covers it.
  g.fillStyle = look.hair;
  if (look.hat) {
    g.fillStyle = look.hat;
    g.fillRect(19, 14, 34, 7);
    g.beginPath(); g.ellipse(36, 15, 14, 6, 0, Math.PI, 0); g.fill();
  } else if (look.hairStyle === 1) {
    g.beginPath(); g.ellipse(36, 20, 14, 9, 0, Math.PI, 0); g.fill();
    g.fillRect(22, 20, 4, 14); g.fillRect(46, 20, 4, 14);
  } else if (look.hairStyle === 2) {
    g.beginPath(); g.ellipse(37, 19, 14, 8, -0.15, Math.PI, 0); g.fill();
    g.fillRect(23, 19, 26, 4);
  } else {
    g.beginPath(); g.ellipse(36, 19, 13, 7, 0, Math.PI, 0); g.fill();
  }
  // Eyes, brows and mouth.
  g.fillStyle = '#1a1208';
  g.fillRect(29, 28, 4, 3); g.fillRect(39, 28, 4, 3);
  g.fillRect(28, 25, 6, 1.5); g.fillRect(38, 25, 6, 1.5);
  g.fillRect(32, 37, 8, 1.5);
  if (look.badge) {
    g.fillStyle = '#ffd43b';
    g.beginPath(); g.arc(24, 58, 3.5, 0, Math.PI * 2); g.fill();
  }
  portraits.set(name, c);
  return c;
}

/** Gear read from the road speed: reverse, then G1-G5 over the coupe's range. */
function gearFor(v, kmh) {
  if (v.speed < -1) return 'R';
  if (kmh < 24) return 'G1';
  if (kmh < 52) return 'G2';
  if (kmh < 88) return 'G3';
  if (kmh < 128) return 'G4';
  return 'G5';
}

/** Hotbar slots 1-5: the four real weapons, the fifth stays empty. */
const SLOT_IDS = ['fists', 'pistol', 'smg', 'shotgun', null];
const CALLSIGNS = ['MARLIN', 'HERON', 'OSPREY', 'TARPON', 'PELICAN', 'KESTREL'];
const POLICE_ROWS = 6;

export function createHud(G) {
  const dom = {
    hud: el('hud'), health: el('bar-health'), armor: el('bar-armor'), stars: el('stars'), money: el('money'),
    weapon: el('weapon-name'), ammo: el('weapon-ammo'), objective: el('objective'), objectiveText: el('objective-text'), timer: el('mission-timer'),
    speed: el('speedo'), speedValue: el('speed-value'), vehicleName: el('vehicle-name'), radio: el('radio'), radioName: el('radio-name'),
    clock: el('clock'), district: el('district'), subtitles: el('subtitles'), subSpeaker: el('sub-speaker'), subText: el('sub-text'),
    notifications: el('notifications'), prompt: el('pointer-prompt'), crosshair: el('crosshair'), flash: el('damage-flash'),
    help: el('controls-help'), hitmarker: el('hitmarker'), banner: el('banner'), bannerTitle: el('banner-title'), bannerSub: el('banner-sub'),
    waypointInfo: el('waypoint-info'), hint: el('hint'), arrest: el('arrest-bar'), arrestFill: el('arrest-fill'), moneyDelta: el('money-delta'),
    missionPanel: el('mission-panel'), missionChip: el('mission-chip'), missionTitle: el('mission-title'), stageSegs: el('stage-segs'),
    stageLabel: el('stage-label'), missionNext: el('mission-next-text'), policePanel: el('police-panel'), policeCount: el('police-count'),
    policeStatus: el('police-status'), policeRows: el('police-rows'), hotbar: el('hotbar'), repChip: el('rep-chip'), repName: el('rep-name'),
    repNext: el('rep-next'), repFill: el('rep-fill'), condFill: el('cond-fill'), gear: el('gear'), radioSong: el('radio-song'),
    radioArtist: el('radio-artist'), radioEq: el('radio-eq'), subPortrait: el('sub-portrait'), subRole: el('sub-role'),
  };
  const eqBars = Array.from(dom.radioEq.children);
  let portraitName = null;
  const starEls = [];
  for (let i = 0; i < 5; i += 1) {
    const s = document.createElement('span');
    s.className = 'star';
    s.textContent = '★';
    dom.stars.appendChild(s);
    starEls.push(s);
  }
  // Weapon hotbar slots, built once.
  const slotEls = SLOT_IDS.map((id, i) => {
    const slot = document.createElement('div');
    slot.className = id ? 'slot' : 'slot empty';
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = String(i + 1);
    const icon = document.createElement('div');
    icon.className = `icon icon-${id || 'empty'}`;
    const ammo = document.createElement('span');
    ammo.className = 'ammo';
    ammo.textContent = id ? '' : 'EMPTY';
    slot.append(num, icon, ammo);
    dom.hotbar.appendChild(slot);
    return { slot, ammo };
  });
  // Police unit rows, built once and filled with the nearest units each frame.
  const unitRows = [];
  for (let i = 0; i < POLICE_ROWS; i += 1) {
    const row = document.createElement('div');
    row.className = 'unit hidden';
    const parts = {};
    for (const key of ['cs', 'kind', 'dist', 'chip']) {
      const s = document.createElement('span');
      s.className = key === 'chip' ? 'chip' : key;
      row.appendChild(s);
      parts[key] = s;
    }
    dom.policeRows.appendChild(row);
    unitRows.push({ row, ...parts });
  }
  const callsigns = new WeakMap();
  let callsignCount = 0;
  /** One callsign per unit for its whole life: MARLIN-11, HERON-12, BLOCK-3, AIR-1. */
  function callsign(unit, kind) {
    let s = callsigns.get(unit);
    if (!s) {
      callsignCount += 1;
      if (kind === 'heli') s = 'AIR-1';
      else if (kind === 'block') s = `BLOCK-${callsignCount}`;
      else s = `${CALLSIGNS[callsignCount % CALLSIGNS.length]}-${10 + (callsignCount % 89)}`;
      callsigns.set(unit, s);
    }
    return s;
  }
  const units = [];
  const state = {
    objective: '', timer: null, waypoint: null, subs: [], subTimer: 0, notes: [], helpTime: 0, helpShown: false, hintText: '', hintTimer: 0,
    bannerTimer: 0, flashTimer: 0, hitTimer: 0, weaponFlash: 0, moneyPulse: 0, visible: true, lastDistrict: '', districtTimer: 0,
    lastMissionDef: null, lastStage: -2,
  };

  function setObjective(text) {
    state.objective = text || '';
    dom.objectiveText.textContent = state.objective;
    dom.objective.classList.toggle('hidden', !state.objective);
  }

  /** Mission chip, stage segments and the next step; rebuilt only when the mission or stage changes. */
  function updateMissionPanel() {
    const M = G.missions;
    const cur = M && M.current;
    if (!cur) {
      state.lastMissionDef = null;
      state.lastStage = -2;
      dom.missionPanel.classList.add('compact');
      dom.missionPanel.classList.toggle('hidden', !state.objective);
      return;
    }
    dom.missionPanel.classList.remove('compact', 'hidden');
    if (cur.def === state.lastMissionDef && cur.stage === state.lastStage) return;
    state.lastMissionDef = cur.def;
    state.lastStage = cur.stage;
    const defs = M.defs || [];
    dom.missionChip.textContent = `MISSION ${defs.indexOf(cur.def) + 1}/${defs.length}`;
    dom.missionTitle.textContent = cur.def.title;
    const stages = cur.def.stages;
    let total = 0;
    let now = -1;
    let nextText = '';
    for (let i = 0; i < stages.length; i += 1) {
      const obj = stages[i].objective;
      if (!obj) continue;
      if (i === cur.stage) now = total;
      if (i > cur.stage && !nextText) nextText = typeof obj === 'function' ? obj(cur.ctx) : obj;
      total += 1;
    }
    if (now < 0) now = total;
    dom.stageSegs.textContent = '';
    for (let i = 0; i < total; i += 1) {
      const seg = document.createElement('i');
      if (i < now) seg.className = 'done';
      else if (i === now) seg.className = 'now';
      dom.stageSegs.appendChild(seg);
    }
    dom.stageLabel.textContent = `STAGE ${Math.min(now + 1, total)}/${total}`;
    dom.missionNext.textContent = nextText || 'Wrap up and collect the reward';
  }

  function pushUnit(unit, kind, label, stateText, cls, px, pz) {
    units.push({ cs: callsign(unit, kind), kind: label, d: Math.hypot(unit.x - px, unit.z - pz), text: stateText, cls });
  }

  /** The HBPD panel: live count, sight status and the six nearest units with their state. */
  function updatePolicePanel() {
    const p = G.player;
    const P = G.police;
    const wanted = G.wanted.stars > 0 && !p.dead && P && P.cruisers;
    dom.policePanel.classList.toggle('hidden', !wanted);
    if (!wanted) return;
    units.length = 0;
    for (const v of P.cruisers) {
      if (v.wrecked || v.leaving || v.roadblock || v.driver === p) continue;
      const chasing = v.ai && v.ai.mode === 'chase';
      const d = Math.hypot(v.x - p.x, v.z - p.z);
      const ramming = chasing && d < 16 && Math.abs(v.speed) > 6;
      pushUnit(v, 'car', 'Cruiser', ramming ? 'RAMMING' : chasing ? 'PURSUIT' : 'SEARCH', ramming ? 'ramming' : chasing ? 'pursuit' : 'search', p.x, p.z);
    }
    for (const b of P.roadblocks) pushUnit(b, 'block', 'Roadblock', 'ROADBLOCK', 'roadblock', p.x, p.z);
    for (const o of P.officers) {
      if (o.dead) continue;
      const close = Math.hypot(o.x - p.x, o.z - p.z) < 5;
      pushUnit(o, 'foot', 'Officer', close ? 'ARREST' : 'ON FOOT', close ? 'arrest' : 'onfoot', p.x, p.z);
    }
    if (P.heli) pushUnit(P.heli, 'heli', 'Helicopter', 'SEARCHLIGHT', 'searchlight', p.x, p.z);
    units.sort((a, b) => a.d - b.d);
    dom.policeCount.textContent = `${units.length} UNIT${units.length === 1 ? '' : 'S'}`;
    const inSight = !!G.wanted.inSight;
    dom.policeStatus.textContent = inSight ? 'IN SIGHT' : 'SEARCHING';
    dom.policeStatus.className = `chip ${inSight ? 'insight' : 'searching'}`;
    for (let i = 0; i < POLICE_ROWS; i += 1) {
      const r = unitRows[i];
      const u = units[i];
      r.row.classList.toggle('hidden', !u);
      if (!u) continue;
      r.cs.textContent = u.cs;
      r.kind.textContent = u.kind;
      r.dist.textContent = `${Math.round(u.d)} m`;
      r.chip.textContent = u.text;
      r.chip.className = `chip ${u.cls}`;
    }
  }

  function updateHotbar() {
    const w = G.weapons;
    for (let i = 0; i < SLOT_IDS.length; i += 1) {
      const id = SLOT_IDS[i];
      if (!id) continue;
      const { slot, ammo } = slotEls[i];
      const inv = w.inv[id];
      const owned = !!(inv && inv.owned);
      const selected = w.current === id;
      slot.classList.toggle('selected', selected);
      slot.classList.toggle('locked', !owned);
      if (!owned) ammo.textContent = 'LOCKED';
      else if (id === 'fists') ammo.textContent = '∞';
      else if (selected && w.reloading > 0) ammo.textContent = 'RELOAD';
      else ammo.textContent = `${inv.clip}/${inv.ammo}`;
    }
  }

  function updateRespect() {
    const e = G.economy;
    const level = e.repLevel();
    const base = ECONOMY.repLevels[level];
    const next = ECONOMY.repLevels[level + 1];
    const frac = next === undefined ? 1 : Math.max(0, Math.min(1, (e.rep - base) / (next - base)));
    dom.repChip.textContent = `REP ${level}`;
    dom.repName.textContent = e.repName();
    dom.repNext.textContent = next === undefined ? 'MAX RANK' : `${e.rep} / ${next}`;
    dom.repFill.style.width = `${frac * 100}%`;
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
      updateHotbar();
      updateRespect();
      // Mission panel, police response, objective + timer.
      updateMissionPanel();
      updatePolicePanel();
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
        const kmh = Math.round(speedKmh(v));
        dom.speedValue.textContent = String(kmh);
        dom.gear.textContent = gearFor(v, kmh);
        const fire = v.onFire ? `  ⚠ ON FIRE ${Math.max(0, Math.ceil(v.fuse))} s` : v.hp < 38 ? '  ⚠ DAMAGED' : '';
        dom.vehicleName.textContent = v.spec.name + fire;
        dom.vehicleName.classList.toggle('warn', v.hp < 38 || v.onFire);
        dom.vehicleName.classList.toggle('fire', !!v.onFire);
        const hp = Math.max(0, Math.min(100, v.hp));
        dom.condFill.style.width = `${hp}%`;
        dom.condFill.className = hp < 38 ? 'low' : hp < 70 ? 'mid' : '';
        dom.radio.classList.remove('hidden');
        dom.radioName.textContent = G.radio.stationName();
        dom.radioSong.textContent = G.radio.trackTitle();
        dom.radioArtist.textContent = G.radio.trackArtist();
        dom.radio.classList.toggle('off', !G.radio.playing);
        // Equalizer bars bounce on the world clock, so a still frame reads as music too.
        const tm = G.world.time;
        for (let i = 0; i < eqBars.length; i += 1) {
          const h = 0.3 + 0.7 * Math.abs(Math.sin(tm * (5 + i * 1.3) + i * 1.7));
          eqBars[i].style.height = `${Math.round(h * 100)}%`;
        }
      } else {
        dom.speed.classList.add('hidden');
        dom.radio.classList.add('hidden');
      }
      // Clock and district.
      dom.clock.textContent = `DAY ${G.world.sky.day || 1}  ${G.world.sky.clockText()}`;
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
        const info = SPEAKERS[line.name];
        dom.subRole.textContent = info ? info.role : '';
        dom.subRole.classList.toggle('hidden', !(info && info.role));
        dom.subtitles.style.borderLeftColor = line.color;
        if (portraitName !== line.name) {
          portraitName = line.name;
          const ctx2d = dom.subPortrait.getContext('2d');
          ctx2d.clearRect(0, 0, 72, 72);
          ctx2d.drawImage(portraitFor(line.name, line.color), 0, 0);
        }
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
