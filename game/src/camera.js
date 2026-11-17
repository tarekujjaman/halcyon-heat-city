// The third-person camera: a free 360-degree orbit from the mouse on foot and in a car, smoothed
// on the raw yaw so a fast flick never swings the short way round, with edge-turn and arrow-key
// turning when the pointer is not captured, a chase mode that eases
// back behind the car once the mouse rests, speed-eased distance and field of view, and a wall
// check that pulls the camera in rather than through a building.
import * as THREE from 'three';
import { CAMERA } from './config.js';
import { KEYS } from './input.js';

const tmp = new THREE.Vector3();

export function shortestAngle(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** The forward direction of a yaw: the way an object with rotation.y = yaw faces. */
export function forwardOf(yaw, out = new THREE.Vector3()) {
  return out.set(Math.sin(yaw), 0, Math.cos(yaw));
}

export function createCamera(aspect) {
  const camera = new THREE.PerspectiveCamera(CAMERA.fovFoot, aspect, 0.3, 2600);
  const state = {
    yaw: Math.PI,
    pitch: 0.28,
    targetYaw: Math.PI,
    targetPitch: 0.28,
    distance: CAMERA.footDistance,
    fov: CAMERA.fovFoot,
    restTime: 0,
    position: new THREE.Vector3(),
    lookAt: new THREE.Vector3(),
    forward: new THREE.Vector3(0, 0, 1),
    locked: false,
    shake: 0,
  };

  function applyLook(dx, dy, sensitivity) {
    state.targetYaw -= dx * sensitivity;
    state.targetPitch += dy * sensitivity * 0.8;
    state.targetPitch = Math.max(CAMERA.minPitch, Math.min(CAMERA.maxPitch, state.targetPitch));
    if (dx !== 0 || dy !== 0) state.restTime = 0;
  }

  return {
    camera,
    state,
    get yaw() {
      return state.yaw;
    },
    get forward() {
      return state.forward;
    },
    snapTo(yaw, pitch = 0.22) {
      // Snapping to an angle given in another winding must not spin the camera a full turn.
      const wound = state.yaw + shortestAngle(state.yaw, yaw);
      state.yaw = wound;
      state.targetYaw = wound;
      state.pitch = pitch;
      state.targetPitch = pitch;
    },
    snapBehind(vehicleYaw, pitch = 0.2) {
      this.snapTo(vehicleYaw, pitch);
    },
    kick(amount) {
      state.shake = Math.min(1, state.shake + amount);
    },
    /**
     * One frame. `focus` is the point orbited (the player's chest or the car's roof), `mode` 'foot' or
     * 'car', `vehicle` the driven car, `input` the input module, `colliders` the static world.
     */
    update(dt, focus, mode, vehicle, input, colliders, width) {
      const sens = input.state.settings.sensitivity;
      const look = input.takeLook();
      applyLook(look.dx, look.dy, sens);
      // The arrow keys and the window edges turn the view when the pointer is not captured
      // (E stays the interact key, so Q/E never steer the camera).
      let keyTurn = 0;
      if (input.isDown(KEYS.lookLeft)) keyTurn -= 1;
      if (input.isDown(KEYS.lookRight)) keyTurn += 1;
      let keyTilt = 0;
      if (input.isDown(KEYS.lookUp)) keyTilt -= 1;
      if (input.isDown(KEYS.lookDown)) keyTilt += 1;
      const edge = input.edgeTurn(width, CAMERA.edgeTurnZone);
      const turn = keyTurn * CAMERA.keyTurnRate + edge * CAMERA.edgeTurnRate;
      if (turn !== 0 || keyTilt !== 0) {
        state.targetYaw -= turn * dt;
        state.targetPitch = Math.max(CAMERA.minPitch, Math.min(CAMERA.maxPitch, state.targetPitch + keyTilt * dt * 1.2));
        state.restTime = 0;
      } else {
        state.restTime += dt;
      }

      let dist = CAMERA.footDistance;
      let fov = CAMERA.fovFoot;
      let height = CAMERA.footHeight;
      if (mode === 'car' && vehicle) {
        const speed = Math.abs(vehicle.speed);
        const t = Math.min(1, speed / 40);
        dist = CAMERA.carDistance + (CAMERA.carDistanceFast - CAMERA.carDistance) * t + vehicle.spec.length * 0.35;
        fov = CAMERA.fovCar + (CAMERA.fovCarFast - CAMERA.fovCar) * t;
        height = CAMERA.carHeight;
        // Swing back behind the car once the mouse has rested and the car drives forward.
        if (state.restTime > CAMERA.autoReturnDelay && vehicle.speed > 1.5) {
          const d = shortestAngle(state.targetYaw, vehicle.yaw);
          const k = 1 - Math.exp(-dt * 2.2);
          state.targetYaw += d * k;
          state.targetPitch += (0.2 - state.targetPitch) * k;
        }
      }
      // Smooth on the raw difference, not the shortest angle: a fast flick of more than a half
      // turn must swing the way the mouse went, never snap round the short way.
      const smooth = 1 - Math.exp(-dt * CAMERA.smoothing);
      state.yaw += (state.targetYaw - state.yaw) * smooth;
      state.pitch += (state.targetPitch - state.pitch) * smooth;
      // Keep both angles bounded by wrapping them together, which changes nothing visible.
      if (Math.abs(state.yaw) > Math.PI * 4) {
        const wrap = Math.round(state.yaw / (Math.PI * 2)) * Math.PI * 2;
        state.yaw -= wrap;
        state.targetYaw -= wrap;
      }
      const ease = 1 - Math.exp(-dt * 4);
      state.distance += (dist - state.distance) * ease;
      state.fov += (fov - state.fov) * ease;
      if (Math.abs(camera.fov - state.fov) > 0.05) {
        camera.fov = state.fov;
        camera.updateProjectionMatrix();
      }

      forwardOf(state.yaw, state.forward);
      const fx = focus.x;
      const fy = focus.y + height;
      const fz = focus.z;
      const cosP = Math.cos(state.pitch);
      const sinP = Math.sin(state.pitch);
      let dx = -state.forward.x * cosP;
      let dy = sinP;
      let dz = -state.forward.z * cosP;
      let want = state.distance;
      if (colliders) {
        const hit = colliders.raycast(fx, fy, fz, dx, dy, dz, want + 0.5);
        if (hit) want = Math.max(0.6, hit.t - 0.45);
      }
      // Never under the ground.
      const px = fx + dx * want;
      let py = fy + dy * want;
      const pz = fz + dz * want;
      const minY = focus.y + 0.5;
      if (py < minY) py = minY;
      state.position.set(px, py, pz);
      state.lookAt.set(fx + state.forward.x * 1.2, fy - 0.2, fz + state.forward.z * 1.2);
      if (state.shake > 0.001) {
        const s = state.shake * 0.25;
        state.position.x += (Math.random() - 0.5) * s;
        state.position.y += (Math.random() - 0.5) * s;
        state.shake *= Math.exp(-dt * 6);
      }
      camera.position.copy(state.position);
      camera.lookAt(state.lookAt);
      camera.updateMatrixWorld();
    },
    /** The world-space direction the crosshair points at, for aiming. */
    aimRay(out = new THREE.Vector3()) {
      return camera.getWorldDirection(out);
    },
    resize(width, height) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
    tmp,
  };
}
