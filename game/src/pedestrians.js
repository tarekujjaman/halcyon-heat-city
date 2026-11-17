// Pedestrians: people walking the sidewalk graph of the blocks nearest the player, crossing at the
// corners, panicking and running from gunfire and crashes, knocked down by cars, drivers fleeing a
// stolen car, and the fares that hail a taxi.
import { PEDS, WANTED } from './config.js';
import { createCharacter, civilianLook } from './characters.js';
import { createRng, frand } from './rng.js';
import { vehicleCircles } from './vehicles/physics.js';
import { circleOverlap } from './collision.js';

const hits = [];
const circles = [];

export function createPedestrians(G) {
  const rng = createRng(G.seed + 909);
  const list = [];
  const graph = G.world.layout.walk;
  let spawnTimer = 0;

  function makePed(x, z, look = civilianLook(rng)) {
    const model = createCharacter(look);
    G.world.scene.add(model.group);
    const ped = {
      kind: 'ped', x, z, y: G.world.layout.groundHeight(x, z), yaw: rng.range(0, Math.PI * 2), vx: 0, vz: 0,
      hp: PEDS.health, dead: false, removed: false, radius: 0.4, height: 1.85, model, look,
      state: 'walk', node: -1, from: -1, offset: rng.range(-1, 1), speed: PEDS.walkSpeed * rng.range(0.85, 1.2),
      panicTimer: 0, panicFrom: null, deadTimer: 0, hitTimer: 0, waitTimer: 0, knocked: false, fare: false,
      onHit(dmg, source) {
        if (ped.dead) return;
        ped.hp -= dmg;
        ped.hitTimer = 0.25;
        if (ped.hp <= 0) kill(ped, source);
        else startPanic(ped, source && source.x !== undefined ? source : { x: ped.x, z: ped.z });
      },
    };
    list.push(ped);
    return ped;
  }

  function kill(ped, source) {
    ped.dead = true;
    ped.deadTimer = 0;
    ped.model.animateDead(frand() < 0.5 ? 1 : -1);
    G.economy.stat('pedsDown', 1);
    alarm(ped.x, ped.z, 25, ped);
  }

  function startPanic(ped, from) {
    if (ped.dead) return;
    ped.state = 'panic';
    ped.panicTimer = 5 + frand() * 5;
    ped.panicFrom = { x: from.x, z: from.z };
    ped.waitTimer = 0;
  }

  /** Everyone within `radius` of a danger runs from it. */
  function alarm(x, z, radius, except = null) {
    for (const ped of list) {
      if (ped === except || ped.dead) continue;
      const d = Math.hypot(ped.x - x, ped.z - z);
      if (d < radius) startPanic(ped, { x, z });
    }
  }

  function nearestNode(x, z) {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < graph.nodes.length; i += 1) {
      const n = graph.nodes[i];
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  function pickNext(ped) {
    const node = graph.nodes[ped.node];
    const links = node.links.filter((l) => l !== ped.from);
    const pool = links.length ? links : node.links;
    ped.from = ped.node;
    ped.node = pool[Math.floor(frand() * pool.length)];
  }

  function spawnNear(x, z) {
    const candidates = [];
    for (let i = 0; i < graph.nodes.length; i += 1) {
      const n = graph.nodes[i];
      const d = Math.hypot(n.x - x, n.z - z);
      if (d > 35 && d < PEDS.spawnRadius) candidates.push(i);
    }
    if (!candidates.length) return null;
    const idx = candidates[Math.floor(frand() * candidates.length)];
    const n = graph.nodes[idx];
    const ped = makePed(n.x, n.z);
    ped.node = idx;
    ped.from = -1;
    pickNext(ped);
    return ped;
  }

  function removePed(ped) {
    ped.removed = true;
    G.world.scene.remove(ped.model.group);
    const i = list.indexOf(ped);
    if (i >= 0) list.splice(i, 1);
  }

  function moveToward(ped, tx, tz, speed, dt) {
    const dx = tx - ped.x;
    const dz = tz - ped.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return 0;
    const step = Math.min(d, speed * dt);
    ped.x += (dx / d) * step;
    ped.z += (dz / d) * step;
    const want = Math.atan2(dx, dz);
    let diff = want - ped.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    ped.yaw += diff * Math.min(1, dt * 10);
    return d;
  }

  function collide(ped) {
    const body = { x: ped.x, z: ped.z };
    const res = G.world.colliders.resolveCircle(body, ped.radius, 0, hits);
    if (res.length) {
      ped.x = body.x;
      ped.z = body.z;
    }
    // Vehicles push and hurt.
    for (const v of G.fleet.vehicles) {
      const d = Math.hypot(v.x - ped.x, v.z - ped.z);
      if (d > v.spec.length / 2 + 1.2) continue;
      for (const c of vehicleCircles(v, circles)) {
        const o = circleOverlap(ped.x, ped.z, ped.radius, c.x, c.z, c.r);
        if (!o) continue;
        ped.x += o.nx * o.depth;
        ped.z += o.nz * o.depth;
        const vs = Math.hypot(v.vx, v.vz);
        const toward = -(v.vx * o.nx + v.vz * o.nz);
        if (vs > 2.5 && toward > 1.5 && !ped.dead) {
          const dmg = (vs - 2) * 9;
          ped.knocked = true;
          ped.vx = o.nx * vs * 0.9 + v.vx * 0.6;
          ped.vz = o.nz * vs * 0.9 + v.vz * 0.6;
          G.audio.play('thud', 0.7);
          G.effects.dust(ped.x, ped.y + 0.5, ped.z);
          ped.onHit(dmg, v.driver === G.player ? G.player : v);
          if (v.driver === G.player) {
            G.wanted.crime(ped.dead ? 'killPed' : 'hitPed', ped.x, ped.z);
            G.economy.stat('pedsHit', 1);
          }
        } else if (!ped.dead) startPanic(ped, { x: v.x, z: v.z });
      }
    }
    // The player pushes through crowds.
    const p = G.player;
    if (p.state === 'foot') {
      const o = circleOverlap(ped.x, ped.z, ped.radius, p.x, p.z, p.radius);
      if (o) {
        ped.x += o.nx * o.depth * 0.7;
        ped.z += o.nz * o.depth * 0.7;
      }
    }
  }

  function update(dt) {
    const p = G.player;
    const px = p.x;
    const pz = p.z;
    spawnTimer -= dt;
    if (list.length < PEDS.count && spawnTimer <= 0) {
      spawnNear(px, pz);
      spawnTimer = 0.15;
    }
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const ped = list[i];
      const dist = Math.hypot(ped.x - px, ped.z - pz);
      if (dist > PEDS.despawnRadius && !ped.mission) {
        removePed(ped);
        continue;
      }
      if (ped.dead) {
        ped.deadTimer += dt;
        if (ped.deadTimer > 25 && dist > 40) removePed(ped);
        ped.model.group.position.set(ped.x, ped.y, ped.z);
        continue;
      }
      ped.hitTimer = Math.max(0, ped.hitTimer - dt);
      if (ped.knocked) {
        ped.x += ped.vx * dt;
        ped.z += ped.vz * dt;
        ped.vx *= Math.exp(-dt * 4);
        ped.vz *= Math.exp(-dt * 4);
        if (Math.hypot(ped.vx, ped.vz) < 0.5) ped.knocked = false;
        ped.model.animateDead(1);
      } else if (ped.state === 'panic') {
        ped.panicTimer -= dt;
        const f = ped.panicFrom;
        let dx = ped.x - f.x;
        let dz = ped.z - f.z;
        const d = Math.hypot(dx, dz) || 1;
        dx /= d;
        dz /= d;
        // Swerve a little so a crowd fans out.
        const sw = Math.sin(G.world.time * 3 + ped.offset * 5) * 0.4;
        const tx = ped.x + (dx - dz * sw) * 4;
        const tz = ped.z + (dz + dx * sw) * 4;
        moveToward(ped, tx, tz, PEDS.panicSpeed, dt);
        ped.model.resetPose();
        ped.model.animateWalk(PEDS.panicSpeed, dt, true);
        ped.model.parts.shoulderL.rotation.x = -2.6 + Math.sin(G.world.time * 14) * 0.3;
        ped.model.parts.shoulderR.rotation.x = -2.6 - Math.sin(G.world.time * 14) * 0.3;
        if (ped.panicTimer <= 0) {
          ped.state = 'walk';
          ped.node = nearestNode(ped.x, ped.z);
          ped.from = -1;
        }
      } else if (ped.state === 'flee') {
        ped.panicTimer -= dt;
        const f = ped.panicFrom;
        const dx = ped.x - f.x;
        const dz = ped.z - f.z;
        const d = Math.hypot(dx, dz) || 1;
        moveToward(ped, ped.x + (dx / d) * 4, ped.z + (dz / d) * 4, PEDS.panicSpeed * 0.9, dt);
        ped.model.resetPose();
        ped.model.animateWalk(PEDS.panicSpeed, dt, true);
        if (ped.panicTimer <= 0) {
          ped.state = 'walk';
          ped.node = nearestNode(ped.x, ped.z);
          ped.from = -1;
        }
      } else if (ped.state === 'wait') {
        ped.waitTimer -= dt;
        ped.model.resetPose();
        ped.model.animateIdle(G.world.time + ped.offset);
        if (ped.fare) {
          ped.model.parts.shoulderR.rotation.x = -2.8;
          ped.model.parts.shoulderR.rotation.z = -0.3 + Math.sin(G.world.time * 6) * 0.25;
        }
        if (ped.waitTimer <= 0 && !ped.fare) ped.state = 'walk';
      } else {
        if (ped.node < 0) {
          ped.node = nearestNode(ped.x, ped.z);
          ped.from = -1;
        }
        const n = graph.nodes[ped.node];
        const prev = ped.from >= 0 ? graph.nodes[ped.from] : null;
        // Keep to one side of the sidewalk by the per-ped offset.
        let ox = 0;
        let oz = 0;
        if (prev) {
          const ex = n.x - prev.x;
          const ez = n.z - prev.z;
          const el = Math.hypot(ex, ez) || 1;
          ox = (-ez / el) * ped.offset;
          oz = (ex / el) * ped.offset;
        }
        const d = moveToward(ped, n.x + ox, n.z + oz, ped.speed, dt);
        if (d < 1.2) {
          if (frand() < 0.06) {
            ped.state = 'wait';
            ped.waitTimer = 1 + frand() * 3;
          }
          pickNext(ped);
        }
        ped.model.resetPose();
        ped.model.animateWalk(ped.speed, dt, false);
      }
      if (!ped.knocked) collide(ped);
      ped.y = G.world.layout.groundHeight(ped.x, ped.z);
      ped.model.group.position.set(ped.x, ped.y + ped.model.group.position.y * 0, ped.z);
      ped.model.group.rotation.y = ped.yaw;
      if (ped.hitTimer > 0) ped.model.parts.torso.rotation.x = -0.3;
    }
  }

  /** The driver thrown out of a stolen car: appears at the door and runs. */
  function spawnFleeingDriver(v, look) {
    const rx = -Math.cos(v.yaw);
    const rz = Math.sin(v.yaw);
    const w = v.spec.width / 2 + 1.2;
    const x = v.x + rx * w;
    const z = v.z + rz * w;
    const ped = makePed(x, z, look || civilianLook(rng));
    ped.state = 'flee';
    ped.panicTimer = 7;
    ped.panicFrom = { x: v.x, z: v.z };
    return ped;
  }

  /** A fare waiting on the pavement, waving: for the taxi activity. */
  function spawnFare(x, z) {
    const ped = makePed(x, z);
    ped.state = 'wait';
    ped.fare = true;
    ped.waitTimer = 999;
    ped.mission = true;
    return ped;
  }

  G.combat.registerGroup(list);
  return {
    list, update, alarm, spawnFleeingDriver, spawnFare, removePed, makePed, startPanic,
    /** Clear everyone (new game, teleports). */
    clear() {
      for (const ped of [...list]) removePed(ped);
    },
    count: () => list.length,
    radiusHint: WANTED.sightRange,
  };
}
