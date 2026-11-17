// The mission runner: start markers for the next story mission, stages with objectives, dialogue
// subtitles, markers and waypoints, countdown timers, mission cars and actors, fail conditions
// (death, arrest, time, a wrecked car, an escaped target), rewards and the autosave on completion.
import { createCharacter, LOOKS } from '../characters.js';
import { createDriver } from '../vehicles/driver.js';
import { storyMissions, CHARACTERS } from './story.js';

export function createMissions(G) {
  const defs = storyMissions(G.world.layout.landmarks);
  const m = { defs, completed: new Set(), current: null, startMarker: null, failCooldown: 0, storyDone: false, lastResult: null };

  m.nextMission = () => defs.find((d) => !m.completed.has(d.id)) || null;

  function makeContext(def) {
    const stuff = { markers: [], actors: [], cars: [], squads: [], timer: null, reached: false, waypoint: null };
    const ctx = {
      G, def, data: {}, player: G.player, L: G.world.layout.landmarks,
      playerTarget: { get x() { return G.player.x; }, get z() { return G.player.z; }, get vx() { return G.player.vehicle ? G.player.vehicle.vx : 0; }, get vz() { return G.player.vehicle ? G.player.vehicle.vz : 0; }, get speed() { return G.player.vehicle ? G.player.vehicle.speed : 0; } },
      say(who, text, seconds) {
        const c = CHARACTERS[who] || { name: who, color: '#fff' };
        G.say(c.name, text, seconds, c.color);
      },
      talking: () => G.hud.talking(),
      notify: (t) => G.notify(t),
      hint: (t) => G.hud.hint(t),
      /** A marker to reach; `reached()` reads the flag. */
      goTo(x, z, options = {}) {
        stuff.reached = false;
        const marker = G.markers.add(x, z, { radius: options.radius || 4, color: '#ffd43b', kind: 'objective', label: options.label || '', needVehicle: !!options.needVehicle, needFoot: !!options.needFoot, once: true, onEnter: () => { stuff.reached = true; } });
        stuff.markers.push(marker);
        G.hud.setWaypoint(x, z, 'objective');
        stuff.waypoint = { x, z };
        return marker;
      },
      reached: () => stuff.reached,
      waypoint(x, z) {
        G.hud.setWaypoint(x, z, 'target');
      },
      timer(seconds) {
        stuff.timer = seconds;
        G.hud.setTimer(seconds);
      },
      timeLeft: () => (stuff.timer === null ? Infinity : stuff.timer),
      clearTimer() {
        stuff.timer = null;
        G.hud.setTimer(null);
      },
      actor(lookKey, x, z) {
        const c = CHARACTERS[lookKey];
        const model = createCharacter(LOOKS[c.look] || LOOKS.teo);
        G.world.scene.add(model.group);
        const y = G.world.layout.groundHeight(x, z);
        model.group.position.set(x, y, z);
        model.group.rotation.y = Math.atan2(G.player.x - x, G.player.z - z);
        model.animateIdle(0);
        const a = { model, x, z, y };
        stuff.actors.push(a);
        return a;
      },
      removeActors() {
        for (const a of stuff.actors) G.world.scene.remove(a.model.group);
        stuff.actors.length = 0;
      },
      gangActor(x, z, options = {}) {
        const look = options.look ? LOOKS[options.look] : null;
        const member = G.gangs.spawnMember(x, z, { hostile: !!options.hostile, group: 'mission', hp: options.hp, weapon: options.weapon, look, name: options.name });
        member.yaw = Math.atan2(G.player.x - x, G.player.z - z);
        stuff.squads.push(member);
        return member;
      },
      squad(points, options = {}) {
        const list = points.map((pt) => G.gangs.spawnMember(pt.x, pt.z, { hostile: true, group: 'mission', weapon: pt.weapon || options.weapon }));
        stuff.squads.push(...list);
        return list;
      },
      allDead: (list) => G.gangs.allDead(list),
      spawnCar(type, x, z, yaw, options = {}) {
        const v = G.fleet.spawn(type, x, z, yaw, { color: options.color, mission: true, role: options.driverKind === 'gang' ? 'gang' : 'mission' });
        v.mission = true;
        if (options.parked) v.ctrl.handbrake = true;
        if (options.driverKind === 'gang') v.driver = { kind: 'gang' };
        stuff.cars.push(v);
        return v;
      },
      gangCar(x, z, yaw) {
        const v = G.gangs.spawnFleeingCar('coupe', x, z, yaw, { limit: 26 });
        v.mission = true;
        stuff.cars.push(v);
        return v;
      },
      makeFlee(v, limit) {
        const ai = createDriver(v, G.nav, { limit, ignoreLights: true });
        ai.setRoad();
        v.ai = ai;
        v.driver = { kind: 'gang' };
        v.ctrl.handbrake = false;
        v.parked = false;
      },
      bailOut(v) {
        v.ai = null;
        v.driver = null;
        v.ctrl.throttle = 0;
        v.ctrl.brake = 1;
        v.ctrl.handbrake = true;
        v.vx *= 0.2;
        v.vz *= 0.2;
        const ped = G.pedestrians.spawnFleeingDriver(v, { ...LOOKS.gang, scale: 1 });
        ped.panicTimer = 12;
      },
      /** A mission car that stays in the world as the player's after the mission. */
      releaseVehicle(v) {
        const i = stuff.cars.indexOf(v);
        if (i >= 0) stuff.cars.splice(i, 1);
        v.mission = false;
      },
      giveWeapon: (id, ammo) => G.weapons.give(id, ammo),
      setGangHostile: (v) => G.gangs.setHostile(v),
      setWanted: (n) => G.wanted.setStars(n),
      wantedStars: () => G.wanted.stars,
      stuff,
    };
    return ctx;
  }

  function cleanupStage(ctx) {
    for (const mk of ctx.stuff.markers) G.markers.remove(mk);
    ctx.stuff.markers.length = 0;
    G.hud.setWaypoint(null);
  }

  function cleanupMission(ctx, keepCars = false) {
    cleanupStage(ctx);
    ctx.removeActors();
    ctx.clearTimer();
    for (const member of ctx.stuff.squads) if (!member.dead) G.gangs.remove(member);
    for (const v of ctx.stuff.cars) {
      if (keepCars && v.driver === G.player) continue;
      if (v.driver === G.player) G.player.exitVehicle();
      G.fleet.remove(v);
    }
    G.hud.setObjective('');
  }

  function placeStartMarker() {
    if (m.startMarker) {
      G.markers.remove(m.startMarker);
      m.startMarker = null;
    }
    const def = m.nextMission();
    if (!def) {
      m.storyDone = true;
      return;
    }
    const c = CHARACTERS[def.giver];
    m.startMarker = G.markers.add(def.start.x, def.start.z, { radius: 3.2, color: '#ffd43b', kind: 'mission', label: `${def.title} (${c.name})`, once: true, needFoot: true, onEnter: () => m.start(def) });
  }

  m.start = (def) => {
    if (m.current) return;
    if (G.activities.busy) G.activities.abortAll();
    if (m.startMarker) {
      G.markers.remove(m.startMarker);
      m.startMarker = null;
    }
    const ctx = makeContext(def);
    m.current = { def, ctx, stage: -1, time: 0 };
    G.hud.missionTitle(def.title);
    G.audio.play('missionStart');
    advance();
  };

  function advance() {
    const cur = m.current;
    cleanupStage(cur.ctx);
    cur.stage += 1;
    if (cur.stage >= cur.def.stages.length) {
      complete();
      return;
    }
    const stage = cur.def.stages[cur.stage];
    G.hud.setObjective(typeof stage.objective === 'function' ? stage.objective(cur.ctx) : stage.objective);
    stage.enter(cur.ctx);
  }

  function complete() {
    const cur = m.current;
    const def = cur.def;
    cleanupMission(cur.ctx, true);
    m.completed.add(def.id);
    m.current = null;
    G.economy.addMoney(def.reward.money);
    const levelBefore = G.economy.repLevel();
    G.economy.addRep(def.reward.rep);
    G.economy.stat('missions', 1);
    G.wanted.clear();
    const next = m.nextMission();
    m.lastResult = { def, levelUp: G.economy.repLevel() > levelBefore, next };
    G.menus.showMissionComplete({ def, money: def.reward.money, rep: def.reward.rep, levelUp: G.economy.repLevel() > levelBefore, next, finale: !!def.finale });
    G.audio.play('missionComplete');
    placeStartMarker();
    G.save.autosave();
    G.events.emit('missionComplete', def);
  }

  m.fail = (reason) => {
    const cur = m.current;
    if (!cur) return;
    cleanupMission(cur.ctx);
    m.current = null;
    m.failCooldown = 3;
    G.hud.missionFailed(reason);
    G.audio.play('missionFail');
    G.events.emit('missionFailed', cur.def, reason);
  };

  m.update = (dt) => {
    if (!m.current) {
      if (m.failCooldown > 0) {
        m.failCooldown -= dt;
        if (m.failCooldown <= 0) placeStartMarker();
      } else if (!m.startMarker && !m.storyDone) placeStartMarker();
      return;
    }
    const cur = m.current;
    cur.time += dt;
    const ctx = cur.ctx;
    if (ctx.stuff.timer !== null) {
      ctx.stuff.timer = Math.max(0, ctx.stuff.timer - dt);
      G.hud.setTimer(ctx.stuff.timer);
    }
    if (G.player.dead) return;
    const stage = cur.def.stages[cur.stage];
    const result = stage.update(ctx, dt);
    if (result === 'next') advance();
    else if (typeof result === 'string' && result.startsWith('fail:')) m.fail(result.slice(5));
  };

  m.onPlayerDown = (how) => {
    if (m.current) m.fail(how === 'arrested' ? 'You were arrested' : 'You were hospitalized');
  };

  m.progressList = () => defs.map((d) => ({ id: d.id, title: d.title, giver: CHARACTERS[d.giver].name, done: m.completed.has(d.id), active: !!(m.current && m.current.def.id === d.id), brief: d.brief }));
  m.serialize = () => ({ completed: [...m.completed] });
  m.restore = (data) => {
    if (m.current) cleanupMission(m.current.ctx);
    m.current = null;
    m.completed = new Set((data && data.completed) || []);
    m.storyDone = false;
    placeStartMarker();
  };
  m.reset = () => {
    if (m.current) cleanupMission(m.current.ctx);
    m.current = null;
    m.completed = new Set();
    m.storyDone = false;
    placeStartMarker();
  };
  m.init = () => placeStartMarker();
  m.CHARACTERS = CHARACTERS;
  return m;
}
