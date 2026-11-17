// The Tide Runners, Kane Okafor's crew: members loitering at their spots in Neon Row and the
// docks, turning hostile when attacked or when the story makes them enemies, advancing, strafing
// and shooting with their own AI; squads spawned for mission shootouts; and the getaway cars
// their drivers flee in.
import * as THREE from 'three';
import { createCharacter, createGunMesh, LOOKS } from './characters.js';
import { createRng, frand } from './rng.js';
import { createDriver } from './vehicles/driver.js';

const eye = new THREE.Vector3();
const dir = new THREE.Vector3();
const GANG_SHIRTS = ['#1c8a7a', '#128c7e', '#20b2aa', '#0f766e'];

export function createGangs(G) {
  const rng = createRng(G.seed + 808);
  const members = [];
  const spotTimers = new Map();
  let hostileAll = false;

  function spawnMember(x, z, options = {}) {
    const look = { ...LOOKS.gang, shirt: rng.pick(GANG_SHIRTS), skin: rng.pick(['#c68642', '#8d5524', '#5c3a1e', '#e0ac7e']), hairStyle: rng.int(0, 2), hat: rng.chance(0.3) ? '#111' : null };
    if (options.look) Object.assign(look, options.look);
    const model = createCharacter(look);
    const weapon = options.weapon || (rng.chance(0.3) ? 'smg' : 'pistol');
    model.setWeapon(createGunMesh(weapon));
    G.world.scene.add(model.group);
    const m = {
      kind: 'gang', x, z, y: G.world.layout.groundHeight(x, z), yaw: rng.range(0, Math.PI * 2), hp: options.hp || 80, dead: false, removed: false,
      radius: 0.42, height: 1.85, model, weapon, hostile: !!options.hostile, group: options.group || 'street', spot: options.spot || null,
      fireTimer: 1 + frand(), strafe: frand() < 0.5 ? 1 : -1, strafeTimer: 0, deadTimer: 0, idleTimer: frand() * 3, home: { x, z }, name: options.name || null,
      onHit(dmg, source) {
        if (m.dead) return;
        m.hp -= dmg;
        m.hostile = true;
        alert(m.x, m.z, 30, true);
        if (m.hp <= 0) {
          m.dead = true;
          m.deadTimer = 0;
          m.model.animateDead(frand() < 0.5 ? 1 : -1);
          G.events.emit('gangKilled', m);
          if (m.group === 'street') G.economy.addMoney(40 + Math.floor(frand() * 60), 'cash dropped');
        }
      },
    };
    members.push(m);
    return m;
  }

  function remove(m) {
    m.removed = true;
    G.world.scene.remove(m.model.group);
    const i = members.indexOf(m);
    if (i >= 0) members.splice(i, 1);
  }

  /** Members near a disturbance turn hostile (if the crew already has a grudge, or `force`). */
  function alert(x, z, radius, force = false) {
    for (const m of members) {
      if (m.dead) continue;
      if (Math.hypot(m.x - x, m.z - z) > radius) continue;
      if (force || hostileAll || m.group !== 'street') m.hostile = true;
    }
  }

  function shoot(m) {
    const p = G.player;
    eye.set(m.x, m.y + 1.45, m.z);
    dir.set(p.x - eye.x, p.y + 1.1 - eye.y, p.z - eye.z);
    const d = dir.length() || 1;
    dir.divideScalar(d);
    const accuracy = m.weapon === 'smg' ? 0.25 : 0.33;
    if (frand() > accuracy) {
      dir.x += (frand() - 0.5) * 0.3;
      dir.y += (frand() - 0.5) * 0.15;
      dir.z += (frand() - 0.5) * 0.3;
      dir.normalize();
    }
    G.effects.muzzleFlash(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z);
    const dmg = m.weapon === 'smg' ? 5 : 8;
    const hit = G.combat.shoot(eye, dir, 60, dmg, m);
    const end = hit ? hit.point : eye.clone().addScaledVector(dir, 60);
    G.effects.tracer(eye.x, eye.y, eye.z, end.x, end.y, end.z);
    G.audio.play(m.weapon === 'smg' ? 'smg' : 'pistol', Math.max(0.2, 1 - d / 60));
    G.pedestrians.alarm(m.x, m.z, 30);
  }

  function updateMember(m, dt) {
    const p = G.player;
    if (m.dead) {
      m.deadTimer += dt;
      if (m.deadTimer > 40 && m.group === 'street') remove(m);
      m.model.group.position.set(m.x, m.y, m.z);
      return;
    }
    const dx = p.x - m.x;
    const dz = p.z - m.z;
    const d = Math.hypot(dx, dz);
    if (!m.hostile && (hostileAll && d < 14 && !p.dead)) m.hostile = true;
    if (m.hostile && !p.dead && d < 90) {
      m.yaw = Math.atan2(dx, dz);
      const clear = G.police.canSeePlayer ? true : true;
      void clear;
      const los = !G.world.colliders.raycast(m.x, m.y + 1.5, m.z, dx / (d || 1), 0, dz / (d || 1), d);
      m.strafeTimer -= dt;
      if (m.strafeTimer <= 0) {
        m.strafeTimer = 1.2 + frand() * 2;
        m.strafe = -m.strafe;
      }
      let speed = 0;
      let mx = 0;
      let mz = 0;
      if (d > 18 || !los) {
        speed = 4.6;
        mx = dx / (d || 1);
        mz = dz / (d || 1);
      } else if (d < 7) {
        speed = 2.5;
        mx = -dx / (d || 1);
        mz = -dz / (d || 1);
      } else {
        speed = 1.8;
        mx = (-dz / (d || 1)) * m.strafe;
        mz = (dx / (d || 1)) * m.strafe;
      }
      m.x += mx * speed * dt;
      m.z += mz * speed * dt;
      const body = { x: m.x, z: m.z };
      const res = G.world.colliders.resolveCircle(body, m.radius, 0, []);
      if (res.length) { m.x = body.x; m.z = body.z; }
      m.fireTimer -= dt;
      if (los && d < 55 && m.fireTimer <= 0) {
        m.fireTimer = m.weapon === 'smg' ? 0.5 + frand() * 0.6 : 1.1 + frand() * 0.8;
        shoot(m);
      }
      m.model.resetPose();
      m.model.animateWalk(speed, dt, speed > 3);
      m.model.animateAim(true);
    } else {
      // Loiter: turn now and then, shift a step.
      m.idleTimer -= dt;
      if (m.idleTimer <= 0) {
        m.idleTimer = 2 + frand() * 4;
        m.yaw += (frand() - 0.5) * 1.5;
      }
      m.model.resetPose();
      m.model.animateIdle(G.world.time + m.home.x);
      m.model.parts.shoulderR.rotation.x = -0.6;
      m.model.parts.elbowR.rotation.x = -0.8;
    }
    m.y = G.world.layout.groundHeight(m.x, m.z);
    m.model.group.position.set(m.x, m.y, m.z);
    m.model.group.rotation.y = m.yaw;
  }

  function update(dt) {
    const p = G.player;
    // Street presence at the crew's spots when Sol is near.
    const spots = G.world.layout.landmarks.gangSpots;
    for (let i = 0; i < spots.length; i += 1) {
      const s = spots[i];
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      const have = members.filter((m) => m.spot === i && !m.dead).length;
      const t = (spotTimers.get(i) || 0) - dt;
      spotTimers.set(i, t);
      if (d < 140 && d > 45 && have < 2 && t <= 0) {
        for (let k = 0; k < 2 - have; k += 1) spawnMember(s.x + rng.range(-3, 3), s.z + rng.range(-2, 2), { spot: i });
        spotTimers.set(i, 60);
      }
    }
    for (let i = members.length - 1; i >= 0; i -= 1) {
      const m = members[i];
      const d = Math.hypot(m.x - p.x, m.z - p.z);
      if (m.group === 'street' && d > 200) {
        remove(m);
        continue;
      }
      updateMember(m, dt);
    }
  }

  /** A squad for a mission shootout; returns the members. */
  function spawnSquad(points, options = {}) {
    return points.map((pt) => spawnMember(pt.x, pt.z, { ...options, group: options.group || 'mission', hostile: options.hostile !== false }));
  }

  function allDead(list) {
    return list.every((m) => m.dead || m.removed);
  }

  /** A gang car with a driver who flees Sol by road (the chase mission). */
  function spawnFleeingCar(type, x, z, yaw, options = {}) {
    const v = G.fleet.spawn(type, x, z, yaw, { color: options.color || '#1c8a7a', role: 'gang', mission: true });
    const ai = createDriver(v, G.nav, { limit: options.limit || 24, ignoreLights: true });
    ai.setRoad();
    v.ai = ai;
    v.driver = { kind: 'gang' };
    v.flee = true;
    return v;
  }

  G.combat.registerGroup(members);
  return {
    members, update, alert, spawnMember, spawnSquad, allDead, remove, spawnFleeingCar, shoot,
    setHostile(v) {
      hostileAll = v;
    },
    get hostile() {
      return hostileAll;
    },
    clear(groupOnly = null) {
      for (const m of [...members]) if (!groupOnly || m.group === groupOnly) remove(m);
    },
  };
}
