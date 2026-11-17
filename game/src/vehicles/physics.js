// Arcade car physics: a throttle that ramps in, an engine curve gentle at launch and strongest in
// the mid range, smooth braking and reversing, speed-sensitive steering, handbrake drifts with
// lateral grip loss, a throttle that brakes first when rolling backwards, kerbs (a speed cost once
// per bump) and the ground slope (free), static collisions with impact damage scaled by closing
// speed (scrapes are free), car-to-car impulses by mass, and the smoke-fire-explosion ladder.
import { DAMAGE, DRIVING } from '../config.js';
import { circleOverlap } from '../collision.js';

const KMH = 3.6;

/** Engine pull as a share of peak, by speed share s = v / vmax. */
export function engineCurve(s) {
  if (s < 0) return 1;
  if (s < 0.3) return 0.62 + 0.38 * (s / 0.3);
  if (s < 0.68) return 1;
  const t = (s - 0.68) / 0.32;
  return Math.max(0, 1 - t) ** 1.25;
}

export function maxYawRate(speed) {
  const t = Math.min(1, speed / 42);
  return 1.85 * (1 - t) + 0.62 * t;
}

/** The circles that stand in for a vehicle's body, along its length. */
export function vehicleCircles(v, out = []) {
  out.length = 0;
  const n = v.spec.length > 4.8 ? 3 : 2;
  const r = v.spec.width * 0.5 * (v.spec.open ? 0.9 : 0.98);
  const fx = Math.sin(v.yaw);
  const fz = Math.cos(v.yaw);
  const span = v.spec.length / 2 - r;
  for (let i = 0; i < n; i += 1) {
    const t = n === 1 ? 0 : -span + (2 * span * i) / (n - 1);
    out.push({ x: v.x + fx * t, z: v.z + fz * t, r, t });
  }
  return out;
}

/** Advance one vehicle's driving state by dt (no collisions yet). */
export function stepDriving(v, dt, groundHeight) {
  const spec = v.spec;
  const c = v.ctrl;
  // Inputs ease in: throttle over ~0.3 s, steering over ~0.14 s.
  const throttleTarget = v.wrecked ? 0 : Math.max(0, c.throttle);
  v.throttle += (throttleTarget - v.throttle) * Math.min(1, dt / DRIVING.throttleRamp);
  const steerTarget = v.wrecked ? 0 : c.steer;
  v.steer += (steerTarget - v.steer) * (1 - Math.exp(-dt * DRIVING.steerEase));

  const fx = Math.sin(v.yaw);
  const fz = Math.cos(v.yaw);
  const rx = -Math.cos(v.yaw);
  const rz = Math.sin(v.yaw);
  let vLong = v.vx * fx + v.vz * fz;
  let vLat = v.vx * rx + v.vz * rz;
  const speed = Math.abs(vLong);

  // Engine, brakes and reverse. The throttle while rolling backwards is a firm brake first
  // (at the pedal's raw value, so it bites before the ramp), then drive.
  const braking = c.brake > 0 && !v.wrecked;
  if (vLong < -0.5 && c.throttle > 0.001 && !v.wrecked) {
    vLong = Math.min(0, vLong + spec.brake * Math.max(c.throttle, v.throttle) * dt);
  } else if (v.throttle > 0.001 && vLong > -0.5) {
    vLong += spec.accel * engineCurve(vLong / spec.maxSpeed) * v.throttle * dt;
  }
  if (braking) {
    if (vLong > 0.3) {
      vLong = Math.max(0, vLong - spec.brake * c.brake * dt);
    } else {
      // Reverse: a gentler pull backwards to a low top speed.
      vLong = Math.max(-DRIVING.reverseMax, vLong - spec.accel * 0.45 * c.brake * dt);
    }
  }
  if (c.handbrake && !v.wrecked) {
    vLong -= Math.sign(vLong) * Math.min(Math.abs(vLong), DRIVING.handbrakeDecel * dt);
  }
  // Rolling resistance and aero drag.
  const roll = DRIVING.rolling * (v.wrecked ? 3 : 1);
  vLong -= Math.sign(vLong) * Math.min(Math.abs(vLong), roll * dt);
  vLong -= DRIVING.dragK * vLong * Math.abs(vLong) * dt;
  if (vLong > spec.maxSpeed) vLong = spec.maxSpeed;

  // Lateral grip: tyres kill sideways motion fast, far slower on the handbrake.
  const gripRate = (c.handbrake ? DRIVING.gripHandbrake : DRIVING.gripNormal) * spec.grip;
  vLat *= Math.exp(-dt * gripRate);

  // Steering: speed-sensitive yaw rate, flips in reverse, stronger on the handbrake.
  const steerAuthority = speed / (speed + 2.5);
  let yawRate = -v.steer * maxYawRate(speed) * steerAuthority * spec.turn;
  if (c.handbrake && speed > 4) yawRate *= 1.45;
  if (vLong < -0.2) yawRate = -yawRate;
  v.yawRate = yawRate;
  v.yaw += yawRate * dt;

  v.vx = fx * vLong + rx * vLat;
  v.vz = fz * vLong + rz * vLat;
  v.speed = vLong;
  v.slip = vLat;
  v.x += v.vx * dt;
  v.z += v.vz * dt;

  // Ground: follow the kerbs and the beach slope. A kerb is a sudden step in the ground height
  // between two substeps (far larger than the step before it) and costs a little speed once per
  // bump; a slope changes the height steadily, step after step, and costs nothing, however far
  // the body lags behind it at speed.
  const gy = groundHeight(v.x, v.z);
  const prevGround = v.groundY === undefined ? gy : v.groundY;
  const groundStep = gy - prevGround;
  const prevStep = v.groundStep || 0;
  v.groundY = gy;
  v.groundStep = groundStep;
  v.curbTimer = Math.max(0, (v.curbTimer || 0) - dt);
  const sudden = Math.abs(groundStep) > DRIVING.curbStep && Math.abs(groundStep) > Math.abs(prevStep) * 2.5;
  if (sudden && speed > 4 && v.curbTimer <= 0) {
    v.curbTimer = DRIVING.curbCooldown;
    const loss = DRIVING.curbSpeedLoss;
    v.vx *= loss;
    v.vz *= loss;
    v.bump = Math.min(1, (v.bump || 0) + 0.6);
  }
  v.y += (gy - v.y) * Math.min(1, dt * 14);
  v.bump = (v.bump || 0) * Math.exp(-dt * 5);
  v.wheelSpin += (vLong / 0.33) * dt;
  v.odometer += Math.abs(vLong) * dt;
  v.impactTimer = Math.max(0, v.impactTimer - dt);
}

/** Speed in km/h as the HUD shows it. */
export function speedKmh(v) {
  return Math.abs(v.speed) * KMH;
}

/**
 * Push a vehicle out of static colliders and turn the impact into damage, a yaw kick and a camera
 * shake. Returns the hardest closing speed this step (m/s), 0 when nothing was hit.
 */
export function collideStatic(v, colliders, hits = []) {
  const circles = vehicleCircles(v, v.circles);
  let hardest = 0;
  const mass = v.spec.mass;
  for (const circ of circles) {
    const body = { x: circ.x, z: circ.z };
    const result = colliders.resolveCircle(body, circ.r, 0, hits);
    if (result.length === 0) continue;
    const pushX = body.x - circ.x;
    const pushZ = body.z - circ.z;
    v.x += pushX;
    v.z += pushZ;
    for (const h of result) {
      const closing = -(v.vx * h.nx + v.vz * h.nz);
      if (closing <= 0) continue;
      hardest = Math.max(hardest, closing);
      const e = 0.18;
      v.vx += h.nx * closing * (1 + e);
      v.vz += h.nz * closing * (1 + e);
      // Yaw kick: a wall met by the front circle on the car's right turns the nose left.
      const rx = -Math.cos(v.yaw);
      const rz = Math.sin(v.yaw);
      const lateral = h.nx * rx + h.nz * rz;
      const lever = circ.t > 0 ? 1 : -1;
      v.yawKick = (v.yawKick || 0) + lateral * lever * Math.min(closing, 12) * 0.02 * (1200 / mass);
      // Scraping along a wall bleeds a little speed.
      v.vx *= 0.985;
      v.vz *= 0.985;
    }
  }
  if (hardest > 0) applyImpact(v, hardest, null);
  return hardest;
}

/** Crash damage for a closing speed: nothing under the scrape dead zone, capped at crashMax. */
function crashDamage(closing) {
  return Math.min(DAMAGE.crashMax, Math.max(0, closing - DAMAGE.scrapeSpeed) * DAMAGE.crashScale);
}

/**
 * Damage from one impact at `closing` m/s. One hit per cooldown, so a bounce along a wall is
 * not charged twice; but a harder hit inside the cooldown (a post clipped on the way into a
 * wall) is charged the difference, so the wall is never free. Scrapes under the dead zone cost nothing.
 */
export function applyImpact(v, closing, other) {
  if (closing < DAMAGE.scrapeSpeed) return 0;
  const full = crashDamage(closing);
  let dmg = full;
  if (v.impactTimer > 0) {
    const charged = v.impactCharged || 0;
    if (full <= charged + 1) return 0;
    dmg = full - charged;
  }
  v.impactTimer = DAMAGE.impactCooldown;
  v.impactCharged = full;
  damageVehicle(v, dmg, other || 'crash');
  v.lastImpact = { closing, dmg, at: performance.now() };
  return dmg;
}

export function damageVehicle(v, amount, source = 'damage') {
  if (v.wrecked) return;
  v.hp = Math.max(0, v.hp - amount);
  v.damageEvents.push({ amount, source });
  if (v.hp <= DAMAGE.fireAt) igniteVehicle(v);
}

/**
 * Set a car alight: the full fuse starts now (never shortened by the hit that lit it, since the
 * fuse only burns down in the fleet's own update) and the fleet's ignite listeners fire at once,
 * which is where the driver's warning comes from. Every damage path ends here.
 */
export function igniteVehicle(v) {
  if (v.onFire || v.wrecked) return false;
  v.onFire = true;
  v.fuse = DAMAGE.fuseSeconds;
  v.fuseStarted = false;
  if (v.onIgnite) v.onIgnite(v);
  return true;
}

/** Resolve one pair of vehicles: separation by mass, an impulse along the normal, damage by closing speed. */
export function collidePair(a, b, pairTimers, now) {
  const ca = vehicleCircles(a, a.circles);
  const cb = vehicleCircles(b, b.circles);
  let deepest = null;
  for (const x of ca) {
    for (const y of cb) {
      const o = circleOverlap(x.x, x.z, x.r, y.x, y.z, y.r);
      if (o && (!deepest || o.depth > deepest.depth)) deepest = { ...o, ta: x.t, tb: y.t };
    }
  }
  if (!deepest) return 0;
  const ma = a.spec.mass;
  const mb = b.spec.mass;
  const wa = a.static ? 0 : mb / (ma + mb);
  const wb = b.static ? 0 : ma / (ma + mb);
  const sep = deepest.depth + 0.02;
  a.x += deepest.nx * sep * wa;
  a.z += deepest.nz * sep * wa;
  b.x -= deepest.nx * sep * wb;
  b.z -= deepest.nz * sep * wb;
  // Relative velocity along the normal (from b to a): approaching when negative.
  const rvx = a.vx - b.vx;
  const rvz = a.vz - b.vz;
  const vn = rvx * deepest.nx + rvz * deepest.nz;
  if (vn < 0) {
    const closing = -vn;
    const e = 0.22;
    const j = (closing * (1 + e)) / (1 / ma + 1 / mb);
    if (!a.static) { a.vx += (deepest.nx * j) / ma; a.vz += (deepest.nz * j) / ma; }
    if (!b.static) { b.vx -= (deepest.nx * j) / mb; b.vz -= (deepest.nz * j) / mb; }
    // Yaw kicks from the offset contact.
    const kick = Math.min(closing, 10) * 0.025;
    const lat = (v, nx, nz) => nx * -Math.cos(v.yaw) + nz * Math.sin(v.yaw);
    a.yawKick = (a.yawKick || 0) + lat(a, deepest.nx, deepest.nz) * (deepest.ta > 0 ? 1 : -1) * kick * (mb / ma);
    b.yawKick = (b.yawKick || 0) + lat(b, -deepest.nx, -deepest.nz) * (deepest.tb > 0 ? 1 : -1) * kick * (ma / mb);
    const key = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
    const last = pairTimers.get(key) || -Infinity;
    if (closing >= DAMAGE.scrapeSpeed && now - last >= DAMAGE.pairCooldown) {
      pairTimers.set(key, now);
      // Car-to-car hits hurt less than walls: bodywork gives, and a chase should last. The
      // heavier car hurts the lighter one a little more, within a cap.
      const dmg = Math.min(DAMAGE.crashMax * 0.5, (closing - DAMAGE.scrapeSpeed) * DAMAGE.crashScale * DAMAGE.carToCar);
      damageVehicle(a, dmg * Math.min(1.15, mb / ma), b);
      damageVehicle(b, dmg * Math.min(1.15, ma / mb), a);
      a.lastImpact = { closing, dmg, at: now, other: b };
      b.lastImpact = { closing, dmg, at: now, other: a };
      return closing;
    }
  }
  return 0;
}

/** Apply the accumulated yaw kicks and settle the visual body motion. */
export function settleVehicle(v, dt) {
  if (v.yawKick) {
    v.spin = (v.spin || 0) + Math.max(-1.2, Math.min(1.2, v.yawKick)) * 2.5;
    v.yawKick = 0;
  }
  if (v.spin) {
    v.yaw += v.spin * dt;
    v.spin *= Math.exp(-dt * 4);
    if (Math.abs(v.spin) < 0.01) v.spin = 0;
  }
}
