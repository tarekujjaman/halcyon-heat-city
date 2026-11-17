// The vehicle fleet: spawning and pooling every car in the world (the player's, traffic, police,
// mission cars), running their physics and pairwise collisions, animating wheels, brake lights,
// lightbars and body roll, the smoke-fire-explosion ladder, and finding cars to steal.
import * as THREE from 'three';
import { DAMAGE } from '../config.js';
import { frand } from '../rng.js';
import { createVehicleModel, setVehiclePaint, VEHICLE_SPECS } from './models.js';
import { collidePair, collideStatic, settleVehicle, stepDriving } from './physics.js';

export function createFleet(world, effects) {
  const vehicles = [];
  const pairTimers = new Map();
  let nextId = 1;
  let now = 0;
  const listeners = { explosion: [], impact: [] };

  function spawn(type, x, z, yaw, options = {}) {
    const spec = VEHICLE_SPECS[type];
    const color = options.color || spec.colors[Math.floor((options.rng ? options.rng.next() : frand()) * spec.colors.length)];
    const model = createVehicleModel(type, color);
    const v = {
      id: nextId, type, spec, model, color,
      x, z, y: world.layout.groundHeight(x, z), yaw,
      vx: 0, vz: 0, speed: 0, slip: 0, steer: 0, throttle: 0, yawRate: 0, wheelSpin: 0, odometer: 0,
      hp: 100, onFire: false, fuse: 0, wrecked: false, smoking: false,
      ctrl: { throttle: 0, brake: 0, steer: 0, handbrake: false },
      circles: [], impactTimer: 0, damageEvents: [], lastImpact: null,
      driver: null, role: options.role || 'traffic', ai: null, parked: !!options.parked, static: false,
      siren: false, mission: options.mission || null, locked: false, horn: 0, headlights: false,
      bump: 0, spin: 0, yawKick: 0, name: spec.name, stolen: false, owner: options.owner || null,
    };
    nextId += 1;
    model.root.position.set(x, v.y, z);
    model.root.rotation.y = yaw;
    world.scene.add(model.root);
    vehicles.push(v);
    return v;
  }

  function remove(v) {
    const i = vehicles.indexOf(v);
    if (i >= 0) vehicles.splice(i, 1);
    world.scene.remove(v.model.root);
    v.removed = true;
  }

  function explode(v) {
    if (v.wrecked) return;
    v.wrecked = true;
    v.onFire = false;
    v.hp = 0;
    v.ctrl.throttle = 0;
    v.ctrl.brake = 0;
    v.siren = false;
    setVehiclePaint(v.model, '#1a1a1a');
    v.model.lamps.visible = false;
    v.model.brake.visible = false;
    effects.explosion(v.x, v.y + 0.8, v.z);
    v.vx *= 0.3;
    v.vz *= 0.3;
    for (const fn of listeners.explosion) fn(v);
  }

  function updateVisuals(v, dt) {
    const m = v.model;
    m.root.position.set(v.x, v.y, v.z);
    m.root.rotation.y = v.yaw;
    const targetRoll = Math.max(-0.07, Math.min(0.07, -v.slip * 0.012));
    const bikeLean = v.spec.open ? -v.steer * Math.min(1, Math.abs(v.speed) / 12) * 0.38 : 0;
    m.bodyGroup.rotation.z += (targetRoll + bikeLean - m.bodyGroup.rotation.z) * Math.min(1, dt * 10);
    const accelPitch = -(v.throttle * 0.02) + (v.ctrl.brake > 0 && v.speed > 2 ? 0.025 : 0) + v.bump * 0.03 * Math.sin(now * 40);
    m.bodyGroup.rotation.x += (accelPitch - m.bodyGroup.rotation.x) * Math.min(1, dt * 8);
    for (const w of m.wheels) w.rotation.x = v.wheelSpin;
    for (const p of m.steerPivots) p.rotation.y = -v.steer * 0.5;
    m.brake.visible = !v.wrecked && (v.ctrl.brake > 0 || v.ctrl.handbrake) && !!v.driver;
    if (m.lightbar) {
      const lb = m.lightbar;
      if (v.siren) {
        lb.phase += dt * 9;
        const on = Math.sin(lb.phase) > 0;
        lb.red.visible = on;
        lb.blue.visible = !on;
        lb.red.scale.setScalar(on ? 1.25 : 1);
        lb.blue.scale.setScalar(on ? 1 : 1.25);
        lb.glowR.intensity = on ? 9 : 0;
        lb.glowB.intensity = on ? 0 : 9;
        lb.spriteR.visible = on;
        lb.spriteB.visible = !on;
      } else {
        lb.red.visible = true;
        lb.blue.visible = true;
        lb.red.scale.setScalar(1);
        lb.blue.scale.setScalar(1);
        lb.glowR.intensity = 0;
        lb.glowB.intensity = 0;
        lb.spriteR.visible = false;
        lb.spriteB.visible = false;
      }
    }
    // Engine smoke and fire by damage.
    if (!v.wrecked && v.hp < DAMAGE.smokeAt) {
      v.smoking = true;
      const p = engineWorld(v);
      if (frand() < dt * (v.hp < DAMAGE.fireAt ? 40 : 14)) effects.smoke(p.x, p.y, p.z, { size: 1.2, color: v.hp < DAMAGE.fireAt ? '#2a2a2a' : '#777', life: 1.6, vy: 1.2 });
      if (v.onFire && frand() < dt * 60) effects.flame(p.x, p.y - 0.2, p.z);
    } else if (v.wrecked) {
      const p = engineWorld(v);
      if (frand() < dt * 10) effects.smoke(p.x, p.y, p.z, { size: 1.6, color: '#222', life: 2.4, vy: 1.4 });
    }
  }

  const tmpV = new THREE.Vector3();
  function engineWorld(v) {
    v.model.engine.getWorldPosition(tmpV);
    return tmpV;
  }

  function update(dt, time) {
    now = time;
    const colliders = world.colliders;
    for (const v of vehicles) {
      stepDriving(v, dt, world.layout.groundHeight);
      const hit = collideStatic(v, colliders);
      if (hit > 2) for (const fn of listeners.impact) fn(v, hit, null);
      if (v.onFire) {
        v.fuse -= dt;
        if (v.fuse <= 0) explode(v);
      }
    }
    // Pairwise collisions among nearby vehicles.
    for (let i = 0; i < vehicles.length; i += 1) {
      const a = vehicles[i];
      for (let j = i + 1; j < vehicles.length; j += 1) {
        const b = vehicles[j];
        const dx = a.x - b.x;
        const dz = a.z - b.z;
        const reach = (a.spec.length + b.spec.length) * 0.5 + 1;
        if (dx * dx + dz * dz > reach * reach) continue;
        const closing = collidePair(a, b, pairTimers, now);
        if (closing > 2) for (const fn of listeners.impact) fn(a, closing, b);
      }
    }
    for (const v of vehicles) {
      settleVehicle(v, dt);
      updateVisuals(v, dt);
      // Tyre smoke on a drift.
      if (!v.wrecked && Math.abs(v.slip) > 3.5 && Math.abs(v.speed) > 5) {
        const fx = Math.sin(v.yaw);
        const fz = Math.cos(v.yaw);
        const rx = -Math.cos(v.yaw);
        const rz = Math.sin(v.yaw);
        const back = -v.spec.length * 0.42;
        for (const side of [-1, 1]) {
          const px = v.x + fx * back + rx * side * v.spec.width * 0.45;
          const pz = v.z + fz * back + rz * side * v.spec.width * 0.45;
          if (frand() < dt * 45) effects.smoke(px, v.y + 0.2, pz, { size: 1.0 + frand() * 0.7, color: '#e8e8ee', life: 0.9, vy: 0.5, vx: -v.vx * 0.05, vz: -v.vz * 0.05, grow: 2.2, fade: 0.5 });
        }
        v.drifting = true;
      } else {
        v.drifting = false;
      }
      v.damageEvents.length = 0;
    }
  }

  /** The nearest drivable vehicle to a point, within maxDist, that passes the filter. */
  function nearest(x, z, maxDist, filter = null) {
    let best = null;
    let bestD = maxDist;
    for (const v of vehicles) {
      if (v.wrecked || v.removed) continue;
      if (filter && !filter(v)) continue;
      const d = Math.hypot(v.x - x, v.z - z);
      if (d < bestD) {
        bestD = d;
        best = v;
      }
    }
    return best;
  }

  /** Is the spot free of other vehicles? */
  function spotFree(x, z, r = 3.5, except = null) {
    for (const v of vehicles) {
      if (v === except) continue;
      if (Math.hypot(v.x - x, v.z - z) < r + v.spec.length / 2) return false;
    }
    return true;
  }

  return {
    vehicles, spawn, remove, explode, update, nearest, spotFree,
    onExplosion: (fn) => listeners.explosion.push(fn),
    onImpact: (fn) => listeners.impact.push(fn),
    repaint(v, color) {
      v.color = color;
      setVehiclePaint(v.model, color);
    },
    repair(v) {
      v.hp = 100;
      v.onFire = false;
      v.smoking = false;
    },
    /** Visible, driveable and not on fire: what the HUD counts as a car worth taking. */
    isUsable: (v) => v && !v.wrecked && !v.removed,
  };
}
