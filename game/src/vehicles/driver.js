// AI driver for any vehicle: follows lane points through intersections with pure-pursuit steering,
// keeps its lane, stops at red lights and behind obstacles, waits until the exit is clear, reverses
// when stuck and can chase a target directly. Traffic, police and mission cars all drive with this.
// Exports createDriver(vehicle, nav, options), the driver its owner resets onto a lane and steps each frame.
import { OPPOSITE, yawOfDir } from '../navigation.js';
import { frand } from '../rng.js';

export function createDriver(v, nav, options = {}) {
  const ai = {
    node: null, dir: 'n', lane: 0, path: [], beforeStop: false, stopNode: null, stopDir: null,
    limit: options.limit || 12, ignoreLights: !!options.ignoreLights, aggressive: !!options.aggressive,
    waiting: 0, stuck: 0, mode: 'road', target: null, lastProgress: 0, reverseTimer: 0, honk: 0,
    turnBias: options.turnBias || null, onArrive: null, destination: null, routeDirs: null,
  };

  /** Put the driver on the approach to `node` heading `dir` on lane `lane` (the car is placed by the caller). */
  ai.reset = (node, dir, lane) => {
    ai.node = node;
    ai.dir = dir;
    ai.lane = lane;
    ai.path = [nav.stopPoint(node, dir, lane)];
    ai.beforeStop = true;
    ai.stopNode = node;
    ai.stopDir = dir;
    ai.routeDirs = null;
    ai.nextDir = chooseNext();
  };

  /** Decide which way to leave the node ahead: routed, else mostly straight, else a random turn. */
  function chooseNext() {
    const n = ai.node;
    let next = null;
    if (ai.routeDirs && ai.routeDirs.length) next = ai.routeDirs.shift();
    if (!next || !nav.neighbor(n, next)) {
      const options = nav.turnOptions(n, ai.dir);
      const straight = options.includes(ai.dir) ? ai.dir : null;
      if (straight && frand() < 0.58) next = straight;
      else next = options[Math.floor(frand() * options.length)];
    }
    if (n.key) next = 'e';
    return next;
  }

  /** Plan through the current node with the chosen direction and extend the path. */
  ai.planNext = () => {
    const n = ai.node;
    const next = ai.nextDir || chooseNext();
    const exit = nav.exitPoint(n, next, ai.lane);
    const after = nav.neighbor(n, next);
    ai.path.push(exit);
    if (after) {
      ai.path.push(nav.stopPoint(after, next, ai.lane));
      ai.node = after;
    }
    ai.dir = next;
    ai.beforeStop = false;
    ai.pendingStop = after ? { node: after, dir: next } : null;
  };

  /** Route toward a world position by road; the driver then continues at random. */
  ai.routeTo = (x, z) => {
    const target = nav.nearestNode(x, z);
    if (!ai.node) return;
    const dirs = nav.route(ai.node, target);
    ai.routeDirs = dirs && dirs.length ? dirs : null;
    ai.destination = { x, z };
  };

  /**
   * Drive one step. `ctx` supplies: lightState(node, dir) -> 'green'|'yellow'|'red', obstacleGap(v, lookahead)
   * -> metres to the nearest thing ahead (Infinity), exitClear(point) -> bool, and dt.
   */
  ai.step = (dt, ctx) => {
    if (v.wrecked) {
      v.ctrl.throttle = 0;
      v.ctrl.brake = 0;
      return;
    }
    if (ai.mode === 'chase' && ai.target) {
      chaseStep(dt, ctx);
      return;
    }
    if (ai.path.length === 0) ai.planNext();
    let target = ai.path[0];
    const fx = Math.sin(v.yaw);
    const fz = Math.cos(v.yaw);
    const rx = -Math.cos(v.yaw);
    const rz = Math.sin(v.yaw);
    let dx = target.x - v.x;
    let dz = target.z - v.z;
    let dist = Math.hypot(dx, dz);
    const along = dx * fx + dz * fz;
    // Reached (or passed) the point: advance.
    if (dist < 2.6 || (along < -1 && dist < 7)) {
      ai.path.shift();
      if (ai.beforeStop) {
        ai.beforeStop = false;
        ai.planNext();
      } else if (ai.pendingStop && ai.path.length === 1) {
        ai.beforeStop = true;
        ai.stopNode = ai.pendingStop.node;
        ai.stopDir = ai.pendingStop.dir;
        ai.pendingStop = null;
        ai.nextDir = chooseNext();
      }
      if (ai.path.length === 0) ai.planNext();
      target = ai.path[0];
      dx = target.x - v.x;
      dz = target.z - v.z;
      dist = Math.hypot(dx, dz);
    }
    // Pure pursuit toward a point a little ahead on the path for smoother turns.
    let aimX = target.x;
    let aimZ = target.z;
    if (ai.path.length > 1 && dist < 7) {
      const t = 1 - dist / 7;
      aimX = target.x + (ai.path[1].x - target.x) * t * 0.5;
      aimZ = target.z + (ai.path[1].z - target.z) * t * 0.5;
    }
    const lx = (aimX - v.x) * rx + (aimZ - v.z) * rz;
    const lz = (aimX - v.x) * fx + (aimZ - v.z) * fz;
    const angle = Math.atan2(lx, Math.max(0.5, lz));
    v.ctrl.steer = Math.max(-1, Math.min(1, angle * 2.6));

    // Desired speed: the limit, lower in turns, to zero at a red light or behind an obstacle.
    let want = ai.limit;
    const turning = ai.path.length > 0 && !ai.beforeStop;
    if (turning) {
      const nextYaw = Math.atan2(ai.path[0].x - v.x, ai.path[0].z - v.z);
      const turnAmount = Math.abs(Math.atan2(Math.sin(nextYaw - v.yaw), Math.cos(nextYaw - v.yaw)));
      if (turnAmount > 0.25) want = Math.min(want, 6.5);
    }
    if (ai.beforeStop && ai.stopNode) {
      const light = ai.ignoreLights ? 'green' : ctx.lightState(ai.stopNode, ai.stopDir);
      const toStop = Math.hypot(target.x - v.x, target.z - v.z);
      const mustStop = light === 'red' || (light === 'yellow' && toStop > 6);
      const exitBlocked = toStop < 14 && !ctx.exitClear(ai.stopNode, ai.nextDir || ai.stopDir, ai.lane);
      if (mustStop || exitBlocked) {
        want = Math.min(want, Math.max(0, (toStop - 2.5) * 1.3));
        if (toStop < 3.2) want = 0;
        ai.waiting += dt;
      } else ai.waiting = 0;
    }
    const gap = ctx.obstacleGap(v, 6 + Math.abs(v.speed) * 1.3);
    if (gap < Infinity) {
      want = Math.min(want, Math.max(0, (gap - 2.5) * 1.5));
      if (Math.abs(v.speed) < 0.5) ai.stuck += dt;
      if (ai.stuck > 2.5 && ai.honk <= 0) {
        ai.honk = 4 + frand() * 4;
        v.horn = 0.4;
      }
    } else if (Math.abs(v.speed) > 0.5) ai.stuck = 0;
    // Boxed in for too long: back up a little and try again around the obstacle.
    ai.reverseTimer = Math.max(0, ai.reverseTimer - dt);
    if (ai.stuck > 9 && ai.reverseTimer <= 0 && !ai.beforeStop) {
      ai.reverseTimer = 1.4;
      ai.stuck = 0;
      ai.sidestep = frand() < 0.5 ? -1 : 1;
    }
    if (ai.reverseTimer > 0 && ai.mode === 'road') {
      v.ctrl.throttle = 0;
      v.ctrl.brake = 1;
      v.ctrl.steer = ai.sidestep || 1;
      v.ctrl.handbrake = false;
      return;
    }
    if (ai.stuck > 9 && ai.beforeStop) {
      // Waiting at the box with something dead ahead: creep around it.
      v.ctrl.steer = (ai.sidestep || 1) * 0.6;
      want = Math.max(want, 2.5);
      if (ai.stuck > 16) ai.stuck = 0;
    }
    ai.honk = Math.max(0, ai.honk - dt);
    if (v.horn > 0) v.horn = Math.max(0, v.horn - dt);
    speedControl(want, dt);
  };

  function speedControl(want, dt) {
    const s = v.speed;
    if (s < want - 0.3) {
      v.ctrl.throttle = Math.min(1, (want - s) / 4);
      v.ctrl.brake = 0;
    } else if (s > want + 0.3) {
      v.ctrl.throttle = 0;
      v.ctrl.brake = Math.min(1, (s - want) / 4 + 0.15);
    } else {
      v.ctrl.throttle = want > 0.5 ? 0.15 : 0;
      v.ctrl.brake = 0;
    }
    if (want === 0 && Math.abs(s) < 0.4) {
      v.ctrl.brake = 1;
    }
    v.ctrl.handbrake = false;
  }

  /** Chase: steer at the target's predicted position, full throttle, reversing out when stuck. */
  function chaseStep(dt, ctx) {
    const t = ai.target;
    const tx = t.x + (t.vx || 0) * 0.5;
    const tz = t.z + (t.vz || 0) * 0.5;
    const fx = Math.sin(v.yaw);
    const fz = Math.cos(v.yaw);
    const rx = -Math.cos(v.yaw);
    const rz = Math.sin(v.yaw);
    const lx = (tx - v.x) * rx + (tz - v.z) * rz;
    const lz = (tx - v.x) * fx + (tz - v.z) * fz;
    const dist = Math.hypot(lx, lz);
    ai.reverseTimer = Math.max(0, ai.reverseTimer - dt);
    if (Math.abs(v.speed) < 1 && dist > 4) ai.stuck += dt;
    else ai.stuck = 0;
    if (ai.stuck > 1.6 && ai.reverseTimer <= 0) {
      ai.reverseTimer = 1.4;
      ai.stuck = 0;
    }
    if (ai.reverseTimer > 0) {
      v.ctrl.throttle = 0;
      v.ctrl.brake = 1;
      v.ctrl.steer = lx > 0 ? -1 : 1;
      v.ctrl.handbrake = false;
      return;
    }
    const angle = Math.atan2(lx, lz);
    v.ctrl.steer = Math.max(-1, Math.min(1, angle * 2.2));
    const behind = lz < 0;
    let want = ai.limit;
    if (behind && dist < 25) want = 8;
    if (dist < 7 && (t.speed === undefined || Math.abs(t.speed) < 3)) want = Math.min(want, 5);
    if (Math.abs(angle) > 1.2) want = Math.min(want, 7);
    const gap = ctx.obstacleGap(v, 5 + Math.abs(v.speed), true);
    if (gap < Infinity && gap < 3) want = Math.min(want, 2);
    speedControl(want, dt);
    v.ctrl.handbrake = Math.abs(angle) > 1.8 && Math.abs(v.speed) > 8;
  }

  ai.setChase = (target, limit) => {
    ai.mode = 'chase';
    ai.target = target;
    if (limit) ai.limit = limit;
  };
  ai.setRoad = () => {
    ai.mode = 'road';
    ai.target = null;
    const loc = nav.locate(v.x, v.z, v.yaw);
    const d = loc.dir;
    // Snap to the nearest lane heading our way and re-plan toward the next node ahead.
    const n = loc.node;
    const nextNode = nav.neighbor(n, d);
    const ahead = nextNode && ((n.x - v.x) * Math.sin(v.yaw) + (n.z - v.z) * Math.cos(v.yaw)) < 0 ? nextNode : n;
    ai.reset(ahead, d, Math.round(frand()));
  };
  ai.yawOfDir = yawOfDir;
  ai.OPPOSITE = OPPOSITE;
  return ai;
}
