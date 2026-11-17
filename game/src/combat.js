// Combat resolution: bullets as rays against walls, cars and people (whoever is nearest along the
// ray), punches in an arc, explosion damage by distance, who gets hurt by what, and the deaths,
// arrests and hospital trips that end a fight. Every NPC module registers its people here.
import * as THREE from 'three';
import { DAMAGE, WANTED } from './config.js';
import { igniteVehicle, vehicleCircles } from './vehicles/physics.js';

const scratchCircles = [];
const hitPoint = new THREE.Vector3();

export function createCombat(G) {
  const groups = [];
  const api = {
    /** Register a list of people {x, z, y, hp, dead, radius, height, kind, onHit(dmg, source)}. */
    registerGroup(list) {
      groups.push(list);
    },
    *people() {
      for (const list of groups) for (const n of list) if (!n.dead && !n.removed) yield n;
    },

    /** Nearest thing a ray hits within range: {point, kind: 'static'|'vehicle'|'person', target}. */
    raycast(origin, dir, range, ignore = null) {
      let best = null;
      const s = G.world.colliders.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, range);
      if (s) best = { t: s.t, kind: 'static', point: new THREE.Vector3(s.x, s.y, s.z), target: s.collider };
      // Ground.
      if (dir.y < -1e-4) {
        const t = -(origin.y - G.world.layout.groundHeight(origin.x, origin.z)) / dir.y;
        if (t > 0 && t < range && (!best || t < best.t)) best = { t, kind: 'ground', point: origin.clone().addScaledVector(dir, t), target: null };
      }
      for (const v of G.fleet.vehicles) {
        if (v === ignore || v.removed) continue;
        const dx = v.x - origin.x;
        const dz = v.z - origin.z;
        if (dx * dx + dz * dz > (range + 6) ** 2) continue;
        for (const c of vehicleCircles(v, scratchCircles)) {
          const t = rayCylinder(origin, dir, c.x, c.z, c.r, v.y, v.y + v.spec.height + 0.2);
          if (t !== null && t < range && (!best || t < best.t)) best = { t, kind: 'vehicle', point: origin.clone().addScaledVector(dir, t), target: v };
        }
      }
      for (const n of api.people()) {
        if (n === ignore) continue;
        const dx = n.x - origin.x;
        const dz = n.z - origin.z;
        if (dx * dx + dz * dz > (range + 2) ** 2) continue;
        const t = rayCylinder(origin, dir, n.x, n.z, n.radius || 0.45, n.y, n.y + (n.height || 1.9));
        if (t !== null && t < range && (!best || t < best.t)) best = { t, kind: 'person', point: origin.clone().addScaledVector(dir, t), target: n };
      }
      if (ignore !== G.player && G.player && !G.player.dead && G.player.state === 'foot') {
        const p = G.player;
        const t = rayCylinder(origin, dir, p.x, p.z, 0.45, p.y, p.y + 1.85);
        if (t !== null && t < range && (!best || t < best.t)) best = { t, kind: 'player', point: origin.clone().addScaledVector(dir, t), target: p };
      }
      return best;
    },

    /** A bullet from `shooter` (the player or an NPC). Applies damage and effects; returns the hit. */
    shoot(origin, dir, range, damage, shooter) {
      const hit = api.raycast(origin, dir, range, shooter === G.player ? (G.player.vehicle || G.player) : shooter);
      if (!hit) return null;
      const pt = hit.point;
      if (hit.kind === 'static' || hit.kind === 'ground') {
        G.effects.hitSparks(pt.x, pt.y, pt.z);
        G.audio.play('ricochet', 0.4);
      } else if (hit.kind === 'vehicle') {
        const v = hit.target;
        G.effects.hitSparks(pt.x, pt.y, pt.z);
        // Bullets dent bodywork; crashes are what wreck a car (a chase under fire should last).
        api.damageVehicle(v, damage * DAMAGE.bulletToCar, shooter);
        if (shooter === G.player && v.driver && v.driver.kind === 'officer') G.wanted.crime('shootPolice', v.x, v.z);
        if (shooter === G.player && v.driver && v.driver.kind === 'ped') G.traffic.scareDriver(v);
      } else if (hit.kind === 'person') {
        const n = hit.target;
        G.effects.bloodPuff(pt.x, pt.y, pt.z);
        n.onHit(damage, shooter);
        if (shooter === G.player) {
          if (n.kind === 'officer') G.wanted.crime(n.dead ? 'killPolice' : 'shootPolice', n.x, n.z);
          else if (n.kind === 'ped' && n.dead) G.wanted.crime('killPed', n.x, n.z);
          else if (n.kind === 'gang' && n.dead) { G.wanted.crime('killGang', n.x, n.z); G.economy.stat('gangKilled', 1); }
          G.hud.hitMarker(n.dead);
        }
      } else if (hit.kind === 'player') {
        G.player.damage(damage, shooter && shooter.kind ? shooter.kind : 'gunfire');
        G.effects.bloodPuff(pt.x, pt.y, pt.z);
      }
      return hit;
    },

    /** Bullet, blast or helicopter damage to a car; the fire and its warning come from the fleet. */
    damageVehicle(v, amount, source) {
      if (v.wrecked) return;
      v.hp = Math.max(0, v.hp - amount);
      if (v.hp <= DAMAGE.fireAt) igniteVehicle(v);
      if (v.driver === G.player && source !== G.player) G.hud.flashDamage(0.3);
    },

    /** A punch from `attacker` toward whatever stands in the arc ahead. */
    meleeAttack(attacker, damage, range) {
      const fx = Math.sin(attacker.yaw);
      const fz = Math.cos(attacker.yaw);
      let best = null;
      let bestD = range;
      for (const n of api.people()) {
        const dx = n.x - attacker.x;
        const dz = n.z - attacker.z;
        const d = Math.hypot(dx, dz);
        if (d > range + 0.4) continue;
        const dot = (dx * fx + dz * fz) / (d || 1);
        if (dot < 0.35) continue;
        if (d < bestD) {
          bestD = d;
          best = n;
        }
      }
      if (best) {
        best.onHit(damage, attacker);
        G.effects.bloodPuff(best.x, best.y + 1.3, best.z);
        G.audio.play('hit');
        if (attacker === G.player) {
          if (best.kind === 'officer') G.wanted.crime(best.dead ? 'killPolice' : 'hitPolice', best.x, best.z);
          else if (best.kind === 'ped' && best.dead) G.wanted.crime('killPed', best.x, best.z);
          G.pedestrians.alarm(attacker.x, attacker.z, 14);
        }
        return best;
      }
      // Cars dent a little when punched.
      const v = G.fleet.nearest(attacker.x + fx * 1.2, attacker.z + fz * 1.2, 2.2);
      if (v && attacker === G.player) {
        G.effects.sparks(v.x, v.y + 0.8, v.z, 3);
        G.audio.play('thud');
        if (v.driver && v.driver.kind === 'ped') G.traffic.scareDriver(v);
      }
      return null;
    },

    /** Hurt everyone and every car by distance from an explosion. */
    explosion(x, y, z, except = null) {
      const R = DAMAGE.explosionRadius;
      const falloff = (d) => Math.max(0, 1 - d / R);
      const p = G.player;
      if (p.state === 'foot' && !p.dead) {
        const d = Math.hypot(p.x - x, p.z - z);
        if (d < R) p.damage(DAMAGE.explosionDamage * falloff(d), 'explosion');
      }
      for (const n of api.people()) {
        const d = Math.hypot(n.x - x, n.z - z);
        if (d < R) n.onHit(DAMAGE.explosionDamage * falloff(d), 'explosion');
      }
      for (const v of G.fleet.vehicles) {
        if (v === except || v.wrecked) continue;
        const d = Math.hypot(v.x - x, v.z - z);
        if (d < R + 2) {
          api.damageVehicle(v, 70 * falloff(d - 1), 'explosion');
          const k = 6 * falloff(d);
          v.vx += ((v.x - x) / (d || 1)) * k;
          v.vz += ((v.z - z) / (d || 1)) * k;
        }
      }
      G.pedestrians.alarm(x, z, 60);
      G.camera.kick(Math.max(0, 1 - Math.hypot(p.x - x, p.z - z) / 40));
      G.audio.play('explosion');
    },

    /** How badly the player is doing, for the HUD. */
    healthFraction: () => G.player.health / 100,
    fees: { arrest: WANTED.arrestFee, hospital: WANTED.hospitalFee },
  };
  return api;
}

/** Ray against a vertical cylinder (cap-less) from y1 to y2: the distance along the ray, or null. */
export function rayCylinder(o, d, cx, cz, r, y1, y2) {
  const fx = o.x - cx;
  const fz = o.z - cz;
  const a = d.x * d.x + d.z * d.z;
  const b = 2 * (fx * d.x + fz * d.z);
  const c = fx * fx + fz * fz - r * r;
  if (a < 1e-9) {
    if (c > 0) return null;
    // Straight down or up inside the cylinder.
    const t = d.y < 0 ? (y2 - o.y) / d.y : (y1 - o.y) / d.y;
    return t > 0 ? t : null;
  }
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  let t = (-b - sq) / (2 * a);
  if (t < 0) t = (-b + sq) / (2 * a);
  if (t < 0) return null;
  const y = o.y + d.y * t;
  if (y < y1 || y > y2) {
    // Try the caps.
    const capY = d.y > 0 ? y1 : y2;
    if (Math.abs(d.y) < 1e-6) return null;
    const tc = (capY - o.y) / d.y;
    if (tc < 0) return null;
    const px = o.x + d.x * tc - cx;
    const pz = o.z + d.z * tc - cz;
    if (px * px + pz * pz <= r * r) return tc;
    return null;
  }
  return t;
}

export { hitPoint };
