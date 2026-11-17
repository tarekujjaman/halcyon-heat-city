// Traffic: AI cars of every type spawned on the lanes around the player, driving their lanes,
// obeying the traffic lights (whose phases are decided here and shown by the props), queuing
// behind obstacles without piling up forever, honking when stuck, and the drivers who flee when
// Sol takes their car.
import { TRAFFIC } from './config.js';
import { createDriver } from './vehicles/driver.js';
import { createRng, frand, fpick } from './rng.js';
import { createCharacter, civilianLook } from './characters.js';
import { vehicleCircles } from './vehicles/physics.js';

const TYPES = ['sedan', 'sedan', 'coupe', 'taxi', 'pickup', 'van', 'bike', 'sedan', 'coupe'];
const circles = [];

export function createTraffic(G) {
  const rng = createRng(G.seed + 505);
  const nav = G.nav;
  const cars = [];
  let lightTime = 0;
  let spawnTimer = 0;
  const lightsByNode = new Map();
  for (const l of G.world.props.lights) {
    const key = `${l.i},${l.j}`;
    if (!lightsByNode.has(key)) lightsByNode.set(key, []);
    lightsByNode.get(key).push(l);
  }

  /** Signal state at a node for travel direction d: the north-south and east-west phases alternate. */
  function lightState(node, d) {
    if (!node || node.key) return 'green';
    const cycle = TRAFFIC.lightCycle + TRAFFIC.yellow;
    const t = (lightTime + node.phase * cycle) % (cycle * 2);
    const ns = d === 'n' || d === 's';
    const phaseT = ns ? t : (t + cycle) % (cycle * 2);
    if (phaseT < TRAFFIC.lightCycle) return 'green';
    if (phaseT < cycle) return 'yellow';
    return 'red';
  }

  function updateLightProps() {
    for (const [key, lights] of lightsByNode) {
      const [i, j] = key.split(',').map(Number);
      const node = G.world.layout.intersectionAt(i, j);
      for (const l of lights) G.world.props.setLight(l, lightState(node, l.dir));
    }
  }

  /** Distance to the nearest vehicle, person or the player ahead in the car's lane corridor. */
  function obstacleGap(v, lookahead, chasing = false) {
    const fx = Math.sin(v.yaw);
    const fz = Math.cos(v.yaw);
    const rx = -Math.cos(v.yaw);
    const rz = Math.sin(v.yaw);
    let gap = Infinity;
    const halfW = v.spec.width / 2 + 0.55;
    for (const o of G.fleet.vehicles) {
      if (o === v || o.removed) continue;
      if (chasing && o.driver === G.player) continue;
      const dx = o.x - v.x;
      const dz = o.z - v.z;
      const lz = dx * fx + dz * fz;
      if (lz < 0 || lz > lookahead + o.spec.length) continue;
      const lx = dx * rx + dz * rz;
      // Also consider the obstacle's extent.
      if (Math.abs(lx) > halfW + o.spec.width / 2) continue;
      const g = lz - o.spec.length / 2 - v.spec.length / 2;
      if (g < gap) gap = g;
    }
    const people = [G.player.state === 'foot' ? G.player : null, ...G.pedestrians.list];
    for (const n of people) {
      if (!n || n.dead || n.knocked) continue;
      const dx = n.x - v.x;
      const dz = n.z - v.z;
      const lz = dx * fx + dz * fz;
      if (lz < 0 || lz > lookahead) continue;
      const lx = dx * rx + dz * rz;
      if (Math.abs(lx) > halfW + 0.3) continue;
      const g = lz - v.spec.length / 2 - 0.4;
      if (g < gap) gap = g;
    }
    return gap;
  }

  /** Is the lane beyond the node free, so a car entering the box will not block it? */
  function exitClear(node, d, lane) {
    const e = nav.lanePoint(node, d, lane, nav.half + 5);
    for (const o of G.fleet.vehicles) {
      if (Math.hypot(o.x - e.x, o.z - e.z) < 5.5 && Math.abs(o.speed) < 2) return false;
    }
    return true;
  }

  const ctx = { lightState, obstacleGap, exitClear };

  function spawnCar(spot, type = fpick(TYPES)) {
    const v = G.fleet.spawn(type, spot.x, spot.z, spot.yaw, { rng, role: 'traffic' });
    const ai = createDriver(v, nav, { limit: TRAFFIC.cruiseSpeed * rng.range(0.85, 1.15) });
    ai.reset(spot.node, spot.dir, spot.lane);
    v.ai = ai;
    v.driver = { kind: 'ped', look: civilianLook(rng), x: v.x, z: v.z };
    if (v.spec.open) {
      const rider = createCharacter(v.driver.look);
      v.model.seat.add(rider.group);
      rider.animateSeated(true, 0);
      v.rider = rider;
    }
    cars.push(v);
    return v;
  }

  function despawn(v) {
    const i = cars.indexOf(v);
    if (i >= 0) cars.splice(i, 1);
    G.fleet.remove(v);
  }

  /** The driver bails out and runs; the car is Sol's now. */
  function ejectDriver(v, thief) {
    if (!v.driver || v.driver === thief) return;
    const look = v.driver.look;
    if (v.rider) {
      v.model.seat.remove(v.rider.group);
      v.rider = null;
    }
    v.driver = null;
    v.ai = null;
    const i = cars.indexOf(v);
    if (i >= 0) cars.splice(i, 1);
    const ped = G.pedestrians.spawnFleeingDriver(v, look);
    G.pedestrians.alarm(v.x, v.z, 12, ped);
    G.audio.play('scream', 0.5);
  }

  /** A driver who was shot at or punched floors it to get away. */
  function scareDriver(v) {
    if (!v.ai || v.driver === G.player) return;
    v.ai.limit = TRAFFIC.boulevardSpeed * 1.4;
    v.ai.ignoreLights = true;
    v.horn = 1;
  }

  function update(dt) {
    lightTime += dt;
    updateLightProps();
    const p = G.player;
    spawnTimer -= dt;
    const px = p.x;
    const pz = p.z;
    if (cars.length < TRAFFIC.cars && spawnTimer <= 0) {
      const spot = nav.randomLaneSpot(rng, px, pz, 70, TRAFFIC.spawnRadius);
      if (spot && G.fleet.spotFree(spot.x, spot.z, 9) && !G.world.layout.isWater(spot.x, spot.z)) {
        const v = spawnCar(spot);
        if (v.ai.node.key || G.world.layout.districtAt(spot.x, spot.z) === 'coral') v.ai.limit = TRAFFIC.boulevardSpeed;
      }
      spawnTimer = 0.25;
    }
    for (let i = cars.length - 1; i >= 0; i -= 1) {
      const v = cars[i];
      const d = Math.hypot(v.x - px, v.z - pz);
      if (v.removed || (d > TRAFFIC.despawnRadius && !v.mission) || (v.wrecked && d > 80)) {
        despawn(v);
        continue;
      }
      if (!v.ai) continue;
      // A car stuck for long out of sight simply leaves.
      if (v.ai.stuck > 14 && d > 90) {
        despawn(v);
        continue;
      }
      v.ai.step(dt, ctx);
      if (v.rider) v.rider.animateSeated(true, v.model.bodyGroup.rotation.z * 0.5);
      if (v.horn > 0 && d < 60) G.audio.horn(v);
    }
  }

  /** Park a car with an AI driver pointing along the lane at (x, z): for missions. */
  function spawnParked(type, x, z, yaw, options = {}) {
    const v = G.fleet.spawn(type, x, z, yaw, { ...options, parked: true, rng });
    v.ctrl.handbrake = true;
    return v;
  }

  return {
    cars, update, lightState, obstacleGap, exitClear, ejectDriver, scareDriver, spawnCar, spawnParked, despawn, ctx,
    clear() {
      for (const v of [...cars]) despawn(v);
    },
    /** All cars within a radius, for the minimap. */
    near(x, z, r) {
      return cars.filter((v) => Math.hypot(v.x - x, v.z - z) < r);
    },
    circlesOf: (v) => vehicleCircles(v, circles),
  };
}
