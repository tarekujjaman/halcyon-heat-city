// Marisol "Sol" Vega on foot and at the wheel: camera-relative walking and running, jumping,
// collision with walls, cars and people, entering and leaving vehicles (stealing them with F or E,
// the driver fleeing), no control while surrendering to an arrest, being run over, health and
// armor, and the figure's animation (seated on the bike's saddle when riding).
import * as THREE from 'three';
import { PLAYER, DAMAGE } from './config.js';
import { KEYS } from './input.js';
import { createCharacter, LOOKS } from './characters.js';
import { vehicleCircles } from './vehicles/physics.js';
import { circleOverlap } from './collision.js';

const hits = [];
const circles = [];

export function createPlayer(G) {
  const model = createCharacter(LOOKS.sol);
  G.world.scene.add(model.group);
  const p = {
    x: 0, y: 0, z: 0, yaw: 0, vx: 0, vz: 0, vy: 0, onGround: true,
    health: PLAYER.maxHealth, armor: 0, state: 'foot', vehicle: null,
    model, running: false, moving: false, speed: 0, punchTimer: 0, aimTimer: 0, hurtTimer: 0, runOverTimer: 0,
    dead: false, surrender: false, wading: false, godMode: false, idleTime: 0, distanceWalked: 0, distanceDriven: 0,
    lastVehicle: null, radius: PLAYER.radius,
  };

  function groundAt(x, z) {
    return G.world.layout.groundHeight(x, z);
  }

  p.teleport = (x, z, yaw = 0) => {
    p.x = x;
    p.z = z;
    p.y = groundAt(x, z);
    p.yaw = yaw;
    p.vx = 0;
    p.vz = 0;
    p.vy = 0;
    model.group.position.set(x, p.y, z);
    model.group.rotation.y = yaw;
  };

  p.position = (out = new THREE.Vector3()) => {
    if (p.state === 'car' && p.vehicle) return out.set(p.vehicle.x, p.vehicle.y, p.vehicle.z);
    return out.set(p.x, p.y, p.z);
  };

  p.enterVehicle = (v) => {
    if (!v || v.wrecked) return false;
    if (v.driver && v.driver !== p) {
      if (v.driver.kind === 'officer' || v.driver.kind === 'gang') {
        G.notify('The driver will not give up the wheel');
        return false;
      }
      G.traffic.ejectDriver(v, p);
      v.stolen = true;
      G.wanted.crime('steal', v.x, v.z);
      G.economy.stat('carsStolen', 1);
    } else if (v.role === 'police' && !v.owner) {
      v.stolen = true;
      G.wanted.crime('steal', v.x, v.z);
    }
    v.driver = p;
    v.ai = null;
    v.parked = false;
    p.vehicle = v;
    p.lastVehicle = v;
    p.state = 'car';
    p.vx = 0;
    p.vz = 0;
    p.vy = 0;
    if (v.spec.open) {
      model.setVisible(true);
      v.model.seat.add(model.group);
      model.group.rotation.set(0, 0, 0);
      model.animateSeated(true, 0);
    } else {
      model.setVisible(false);
    }
    G.audio.play('door');
    G.camera.snapBehind(v.yaw, 0.2);
    G.events.emit('enterVehicle', v);
    return true;
  };

  p.exitVehicle = () => {
    const v = p.vehicle;
    if (!v) return;
    // Step out beside the left door, or the right if the left is blocked.
    const rx = -Math.cos(v.yaw);
    const rz = Math.sin(v.yaw);
    const w = v.spec.width / 2 + 0.9;
    let placed = false;
    for (const side of [-1, 1, 0]) {
      const x = side === 0 ? v.x - Math.sin(v.yaw) * (v.spec.length / 2 + 1) : v.x + rx * side * w;
      const z = side === 0 ? v.z - Math.cos(v.yaw) * (v.spec.length / 2 + 1) : v.z + rz * side * w;
      if (!G.world.colliders.overlaps(x, z, PLAYER.radius)) {
        p.x = x;
        p.z = z;
        placed = true;
        break;
      }
    }
    if (!placed) {
      p.x = v.x + rx * -w;
      p.z = v.z + rz * -w;
    }
    p.y = groundAt(p.x, p.z);
    p.yaw = v.yaw;
    v.driver = null;
    v.ctrl.throttle = 0;
    v.ctrl.steer = 0;
    v.ctrl.brake = Math.abs(v.speed) > 0.5 ? 1 : 0;
    v.ctrl.handbrake = Math.abs(v.speed) < 2;
    if (v.spec.open) {
      v.model.seat.remove(model.group);
      G.world.scene.add(model.group);
      model.resetPose();
    }
    model.setVisible(true);
    model.group.position.set(p.x, p.y, p.z);
    model.group.rotation.set(0, p.yaw, 0);
    p.vehicle = null;
    p.state = 'foot';
    G.audio.play('door');
    G.camera.snapTo(G.camera.yaw, 0.28);
    G.events.emit('exitVehicle', v);
  };

  p.damage = (amount, source = 'unknown') => {
    if (p.dead || p.godMode || amount <= 0) return;
    let left = amount;
    if (p.armor > 0) {
      const absorbed = Math.min(p.armor, left * 0.7);
      p.armor -= absorbed;
      left -= absorbed;
    }
    p.health = Math.max(0, p.health - left);
    p.hurtTimer = 0.5;
    G.hud.flashDamage();
    if (p.health <= 0) {
      p.dead = true;
      G.events.emit('playerDied', source);
    }
  };

  p.heal = (amount = PLAYER.maxHealth) => {
    p.health = Math.min(PLAYER.maxHealth, p.health + amount);
  };

  p.revive = (x, z, yaw) => {
    p.dead = false;
    p.surrender = false;
    p.health = PLAYER.maxHealth;
    p.armor = 0;
    if (p.state === 'car' && p.vehicle) {
      const v = p.vehicle;
      v.driver = null;
      if (v.spec.open) {
        v.model.seat.remove(model.group);
        G.world.scene.add(model.group);
      }
      p.vehicle = null;
    }
    p.state = 'foot';
    model.resetPose();
    model.setVisible(true);
    p.teleport(x, z, yaw);
  };

  function footUpdate(dt, input) {
    const cam = G.camera;
    const fwd = cam.forward;
    const rx = -fwd.z;
    const rz = fwd.x;
    let mx = 0;
    let mz = 0;
    const control = !p.dead && !p.surrender;
    if (control) {
      if (input.isDown(KEYS.forward)) { mx += fwd.x; mz += fwd.z; }
      if (input.isDown(KEYS.back)) { mx -= fwd.x; mz -= fwd.z; }
      if (input.isDown(KEYS.right)) { mx += rx; mz += rz; }
      if (input.isDown(KEYS.left)) { mx -= rx; mz -= rz; }
    }
    const len = Math.hypot(mx, mz);
    p.moving = len > 0.01;
    if (p.moving) {
      mx /= len;
      mz /= len;
    }
    p.running = p.moving && input.isDown(KEYS.run);
    const target = p.moving ? (p.running ? PLAYER.runSpeed : PLAYER.walkSpeed) : 0;
    const tvx = mx * target;
    const tvz = mz * target;
    const k = Math.min(1, dt * (p.moving ? PLAYER.accel / 3 : PLAYER.accel / 2));
    p.vx += (tvx - p.vx) * k;
    p.vz += (tvz - p.vz) * k;
    if (control && p.onGround && input.wasPressed(KEYS.jump)) {
      p.vy = PLAYER.jumpSpeed;
      p.onGround = false;
      G.audio.play('jump');
    }
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    const ground = groundAt(p.x, p.z);
    if (!p.onGround) {
      p.vy -= PLAYER.gravity * dt;
      p.y += p.vy * dt;
      if (p.y <= ground) {
        p.y = ground;
        p.vy = 0;
        p.onGround = true;
        G.audio.play('land');
      }
    } else {
      p.y += (ground - p.y) * Math.min(1, dt * 20);
    }
    p.speed = Math.hypot(p.vx, p.vz);
    p.distanceWalked += p.speed * dt;
    // Walls, posts and the water line.
    const body = { x: p.x, z: p.z };
    const res = G.world.colliders.resolveCircle(body, PLAYER.radius, p.y - ground, hits);
    if (res.length) {
      p.x = body.x;
      p.z = body.z;
      for (const h of res) {
        const into = p.vx * h.nx + p.vz * h.nz;
        if (into < 0) {
          p.vx -= h.nx * into;
          p.vz -= h.nz * into;
        }
      }
    }
    // Vehicles: pushed out, hurt when hit fast.
    p.runOverTimer = Math.max(0, p.runOverTimer - dt);
    for (const v of G.fleet.vehicles) {
      const d = Math.hypot(v.x - p.x, v.z - p.z);
      if (d > v.spec.length / 2 + 1.5) continue;
      const cs = vehicleCircles(v, circles);
      for (const c of cs) {
        const o = circleOverlap(p.x, p.z, PLAYER.radius, c.x, c.z, c.r);
        if (!o) continue;
        p.x += o.nx * o.depth;
        p.z += o.nz * o.depth;
        const vSpeed = Math.hypot(v.vx, v.vz);
        const toward = -(v.vx * o.nx + v.vz * o.nz);
        if (vSpeed > DAMAGE.runOverSpeed && toward > DAMAGE.runOverSpeed * 0.6 && p.runOverTimer <= 0) {
          p.runOverTimer = 0.6;
          const dmg = Math.min(60, (vSpeed - DAMAGE.runOverSpeed) * 4.5);
          p.damage(dmg, 'vehicle');
          p.vx += o.nx * vSpeed * 0.8 + v.vx * 0.5;
          p.vz += o.nz * vSpeed * 0.8 + v.vz * 0.5;
          if (!p.onGround) {} else if (vSpeed > 6) { p.vy = 3.5; p.onGround = false; }
          G.audio.play('thud');
          G.camera.kick(0.5);
          if (v.driver && v.driver.kind === 'officer') G.wanted.noticePlayer();
        } else {
          p.vx += o.nx * 0.5;
          p.vz += o.nz * 0.5;
        }
      }
    }
    // Facing: toward the move direction, or the camera when aiming.
    const aiming = p.aimTimer > 0;
    if (aiming) {
      p.yaw = Math.atan2(fwd.x, fwd.z);
    } else if (p.moving) {
      const want = Math.atan2(mx, mz);
      let d = want - p.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      p.yaw += d * Math.min(1, dt * 14);
    }
    p.wading = G.world.layout.isWater(p.x, p.z);
    // Animation.
    model.group.position.set(p.x, p.y, p.z);
    model.group.rotation.set(0, p.yaw, 0);
    if (p.dead) {
      model.animateDead(1);
    } else if (p.surrender) {
      model.animateIdle(G.world.time);
      model.animateSurrender();
    } else if (p.punchTimer > 0) {
      model.animateWalk(p.speed, dt, p.running);
      model.animatePunch(1 - p.punchTimer / 0.4);
    } else if (p.moving || p.speed > 0.3) {
      model.animateWalk(p.speed, dt, p.running);
      if (aiming) model.animateAim(G.weapons.current !== 'fists');
    } else {
      model.animateIdle(G.world.time);
      if (aiming) model.animateAim(G.weapons.current !== 'fists');
    }
    if (!p.onGround) {
      model.parts.hipL.rotation.x = -0.5;
      model.parts.hipR.rotation.x = 0.3;
      model.parts.kneeL.rotation.x = 0.9;
    }
    p.punchTimer = Math.max(0, p.punchTimer - dt);
    p.aimTimer = Math.max(0, p.aimTimer - dt);
    p.hurtTimer = Math.max(0, p.hurtTimer - dt);
    if (p.moving && p.onGround) {
      p.stepAcc = (p.stepAcc || 0) + p.speed * dt;
      if (p.stepAcc > (p.running ? 1.6 : 1.1)) {
        p.stepAcc = 0;
        G.audio.play('step');
      }
    }
  }

  function carUpdate(dt, input) {
    const v = p.vehicle;
    if (!v) {
      p.state = 'foot';
      return;
    }
    // No control while dead, wrecked or surrendering to an arrest: the car brakes to a stop.
    const control = !p.dead && !v.wrecked && !p.surrender;
    v.ctrl.throttle = control && input.isDown(KEYS.forward) ? 1 : 0;
    v.ctrl.brake = control ? (input.isDown(KEYS.back) ? 1 : 0) : 1;
    v.ctrl.steer = control ? (input.isDown(KEYS.right) ? 1 : 0) - (input.isDown(KEYS.left) ? 1 : 0) : 0;
    v.ctrl.handbrake = control ? input.isDown(KEYS.handbrake) : Math.abs(v.speed) < 2;
    v.horn = control && input.isDown(KEYS.horn) ? 1 : 0;
    p.x = v.x;
    p.z = v.z;
    p.y = v.y;
    p.yaw = v.yaw;
    p.distanceDriven += Math.abs(v.speed) * dt;
    if (v.spec.open) {
      // Seated on the bike: the rider leans with it, hanging a little less than the machine.
      model.animateSeated(true, v.model.bodyGroup.rotation.z * 0.35);
    }
    // Crashes hurt the car; only a very hard one reaches the driver. (The fire warning comes
    // from the fleet's ignite listener in main.js, the moment the fuse starts.)
    if (v.lastImpact && !v.lastImpact.seen) {
      v.lastImpact.seen = true;
      if (v.lastImpact.closing > DAMAGE.driverHurtSpeed) p.damage(DAMAGE.driverHurt * (v.spec.open ? 3 : 1), 'crash');
      G.camera.kick(Math.min(1, v.lastImpact.closing / 15));
    }
    if (v.wrecked) {
      p.damage(DAMAGE.explosionDamage, 'explosion');
      if (!p.dead) p.exitVehicle();
    }
    if (control && (input.wasPressed(KEYS.enter) || input.wasPressed(KEYS.interact))) {
      if (Math.abs(v.speed) < 9) p.exitVehicle();
      else G.notify('Slow down to get out');
    }
  }

  p.update = (dt, input) => {
    if (p.state === 'car') carUpdate(dt, input);
    else {
      footUpdate(dt, input);
      if (!p.dead && !p.surrender && (input.wasPressed(KEYS.enter) || input.wasPressed(KEYS.interact))) {
        const v = G.fleet.nearest(p.x, p.z, 4.2, (c) => !c.wrecked);
        if (v) p.enterVehicle(v);
        else G.notify('No car within reach');
      }
    }
    if (p.state === 'foot' && !p.dead) {
      // Stay inside the playable bounds.
      const b = G.world.layout.bounds;
      p.x = Math.max(b.minX, Math.min(b.maxX, p.x));
      p.z = Math.max(b.minZ, Math.min(b.maxZ, p.z));
    }
  };

  p.focus = (out = new THREE.Vector3()) => {
    if (p.state === 'car' && p.vehicle) return out.set(p.vehicle.x, p.vehicle.y + 0.4, p.vehicle.z);
    return out.set(p.x, p.y, p.z);
  };

  return p;
}
