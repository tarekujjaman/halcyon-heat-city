// Visual effects: two point clouds (soft smoke with normal blending, additive glow) for tyre and
// engine smoke, dust, blood, sparks, muzzle flashes, flames and explosions; a pool of line segments
// for bullet tracers; and the muzzle and explosion lights with the expanding blast sphere. Particle
// records are pooled, so a long chase allocates nothing per frame. Exports createEffects(scene, textures).
import * as THREE from 'three';
import { frand } from './rng.js';

const SMOKE_MAX = 900;
const GLOW_MAX = 600;
const MAX_TRACERS = 48;
const TRACER_LIFE = 0.09;
const MUZZLE_LIGHT_SECONDS = 0.06;
const MUZZLE_LIGHT_INTENSITY = 14;
const EXPLOSION_LIGHT_SECONDS = 0.5;
const EXPLOSION_LIGHT_INTENSITY = 60;
const BLAST_SPHERE_SECONDS = 0.35;
const BLAST_SPHERE_GROWTH = 7;
const BLAST_SPHERE_OPACITY = 0.8;

const POINT_VERT = `
attribute float aSize;
attribute float aAlpha;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vColor = color;
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (420.0 / max(1.0, -mv.z));
  gl_Position = projectionMatrix * mv;
}`;

const POINT_FRAG = `
uniform sampler2D uMap;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec4 t = texture2D(uMap, gl_PointCoord);
  gl_FragColor = vec4(vColor, t.a * vAlpha);
  if (gl_FragColor.a < 0.01) discard;
}`;

/**
 * Up to `max` live particles in one THREE.Points. Records live in `particles` (oldest first) and
 * are recycled through `pool` when they die; emitting into a full cloud retires the oldest.
 */
class ParticleCloud {
  constructor(scene, texture, max, additive) {
    this.max = max;
    this.positions = new Float32Array(max * 3);
    this.colors = new Float32Array(max * 3);
    this.sizes = new Float32Array(max);
    this.alphas = new Float32Array(max);
    this.particles = [];
    this.pool = [];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = geo;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: texture } },
      vertexShader: POINT_VERT,
      fragmentShader: POINT_FRAG,
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 6 : 5;
    scene.add(this.points);
    this.color = new THREE.Color();
  }

  /**
   * One particle at (x, y, z): `size` in metres (scaled by `grow` over its `life`), `color`, a
   * velocity, `fade` the peak alpha, `gravity` in m/s² and `drag` as an exponential rate.
   */
  emit(x, y, z, { size = 1, color = '#ffffff', life = 1, vx = 0, vy = 0, vz = 0, grow = 1.0, fade = 1, gravity = 0, drag = 0 } = {}) {
    const p = this.particles.length >= this.max ? this.particles.shift() : this.pool.pop() || {};
    this.color.set(color);
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.size = size;
    p.size0 = size;
    p.life = life;
    p.age = 0;
    p.r = this.color.r;
    p.g = this.color.g;
    p.b = this.color.b;
    p.grow = grow;
    p.fade = fade;
    p.gravity = gravity;
    p.drag = drag;
    this.particles.push(p);
  }

  /** Age, move and fade every particle, pack the survivors into the buffers and upload them. */
  update(dt) {
    const list = this.particles;
    let n = 0;
    for (let i = 0; i < list.length; i += 1) {
      const p = list[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.pool.push(p);
        continue;
      }
      p.vy -= p.gravity * dt;
      if (p.drag) {
        const k = Math.exp(-dt * p.drag);
        p.vx *= k;
        p.vy *= k;
        p.vz *= k;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const t = p.age / p.life;
      p.size = p.size0 * (1 + (p.grow - 1) * t);
      list[n] = p;
      this.positions[n * 3] = p.x;
      this.positions[n * 3 + 1] = p.y;
      this.positions[n * 3 + 2] = p.z;
      this.colors[n * 3] = p.r;
      this.colors[n * 3 + 1] = p.g;
      this.colors[n * 3 + 2] = p.b;
      this.sizes[n] = p.size;
      this.alphas[n] = p.fade * (1 - t) * (t < 0.1 ? t / 0.1 : 1);
      n += 1;
    }
    list.length = n;
    this.geo.setDrawRange(0, n);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
  }
}

/**
 * The effects system for one scene. Every emitter takes a world position; `update(dt)` must run
 * once per simulation step (and per frame while a menu shows the world) to age everything.
 */
export function createEffects(scene, textures) {
  const smokeCloud = new ParticleCloud(scene, textures.smoke, SMOKE_MAX, false);
  const glowCloud = new ParticleCloud(scene, textures.glow, GLOW_MAX, true);

  // Tracers: a fixed number of line segments; records are recycled like the particles.
  const tracerPos = new Float32Array(MAX_TRACERS * 6);
  const tracerGeo = new THREE.BufferGeometry();
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(tracerPos, 3).setUsage(THREE.DynamicDrawUsage));
  const tracerMat = new THREE.LineBasicMaterial({ color: '#ffe9a8', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const tracers = new THREE.LineSegments(tracerGeo, tracerMat);
  tracers.frustumCulled = false;
  scene.add(tracers);
  const tracerList = [];
  const tracerPool = [];

  // Muzzle light and explosion flash.
  const flashLight = new THREE.PointLight('#ffd27a', 0, 12, 2);
  scene.add(flashLight);
  let flashTime = 0;
  const explosionLight = new THREE.PointLight('#ff8a2a', 0, 40, 2);
  scene.add(explosionLight);
  let explosionTime = 0;
  const flashSphere = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), new THREE.MeshBasicMaterial({ color: '#ffd080', transparent: true, opacity: BLAST_SPHERE_OPACITY, blending: THREE.AdditiveBlending, depthWrite: false }));
  flashSphere.visible = false;
  scene.add(flashSphere);
  let sphereAge = 1;

  return {
    /** A puff of smoke; `o` overrides size, color, life, velocity, grow and fade. */
    smoke(x, y, z, o = {}) {
      smokeCloud.emit(x, y, z, { size: 1.2, color: '#cfcfd4', life: 1.4, vy: 0.8, grow: 2.6, fade: 0.55, ...o });
    },
    /** Sandy dust where a body hits the ground. */
    dust(x, y, z) {
      smokeCloud.emit(x, y, z, { size: 1, color: '#d8c8a8', life: 0.8, vy: 0.6, grow: 2.2, fade: 0.4 });
    },
    /** `n` glowing sparks thrown out and falling under gravity. */
    sparks(x, y, z, n = 8, color = '#ffd27a') {
      for (let i = 0; i < n; i += 1) {
        glowCloud.emit(x, y, z, { size: 0.25, color, life: 0.3 + frand() * 0.3, vx: (frand() - 0.5) * 7, vy: frand() * 5, vz: (frand() - 0.5) * 7, gravity: 12, grow: 0.4, fade: 1 });
      }
    },
    /** A bullet striking metal or stone: sparks and a little grey smoke. */
    hitSparks(x, y, z) {
      this.sparks(x, y, z, 6, '#ffe6a0');
      smokeCloud.emit(x, y, z, { size: 0.5, color: '#9a9a9a', life: 0.5, vy: 0.6, grow: 2.5, fade: 0.5 });
    },
    /** A bullet or punch landing on someone. */
    bloodPuff(x, y, z) {
      smokeCloud.emit(x, y, z, { size: 0.45, color: '#8a1a1a', life: 0.45, vy: 0.3, grow: 2, fade: 0.7 });
    },
    /** The flash at a gun's muzzle at (x, y, z) firing along the unit direction (dx, dy, dz), with a brief light. */
    muzzleFlash(x, y, z, dx, dy, dz) {
      glowCloud.emit(x + dx * 0.4, y + dy * 0.4, z + dz * 0.4, { size: 1.1, color: '#fff1b0', life: 0.07, grow: 1.6, fade: 1 });
      glowCloud.emit(x + dx * 0.7, y + dy * 0.7, z + dz * 0.7, { size: 0.6, color: '#ffb347', life: 0.08, grow: 2, fade: 1 });
      flashLight.position.set(x + dx, y + dy, z + dz);
      flashLight.intensity = MUZZLE_LIGHT_INTENSITY;
      flashTime = MUZZLE_LIGHT_SECONDS;
    },
    /** A bullet's path from the muzzle to where it stopped, shown for a few frames. */
    tracer(x1, y1, z1, x2, y2, z2) {
      const t = tracerList.length >= MAX_TRACERS ? tracerList.shift() : tracerPool.pop() || {};
      t.x1 = x1;
      t.y1 = y1;
      t.z1 = z1;
      t.x2 = x2;
      t.y2 = y2;
      t.z2 = z2;
      t.age = 0;
      t.life = TRACER_LIFE;
      tracerList.push(t);
    },
    /** One tongue of fire from a burning engine (call every frame with some probability). */
    flame(x, y, z) {
      glowCloud.emit(x + (frand() - 0.5) * 0.6, y, z + (frand() - 0.5) * 0.6, { size: 0.9 + frand() * 0.6, color: frand() < 0.5 ? '#ff7a1a' : '#ffc64a', life: 0.5 + frand() * 0.3, vy: 2.2 + frand(), grow: 0.5, fade: 0.9 });
    },
    /** A car blowing up: fireball, black smoke, sparks, a light and the expanding blast sphere. */
    explosion(x, y, z) {
      for (let i = 0; i < 40; i += 1) {
        glowCloud.emit(x, y, z, { size: 2 + frand() * 2.5, color: i % 3 === 0 ? '#ffe08a' : i % 3 === 1 ? '#ff7a1a' : '#ff3a10', life: 0.5 + frand() * 0.5, vx: (frand() - 0.5) * 12, vy: frand() * 9, vz: (frand() - 0.5) * 12, gravity: 4, grow: 1.8, fade: 1, drag: 2 });
      }
      for (let i = 0; i < 30; i += 1) {
        smokeCloud.emit(x, y + 0.5, z, { size: 2.5 + frand() * 2, color: '#2a2a2a', life: 2.5 + frand() * 1.5, vx: (frand() - 0.5) * 6, vy: 2 + frand() * 3, vz: (frand() - 0.5) * 6, grow: 2.5, fade: 0.8, drag: 1.5 });
      }
      this.sparks(x, y, z, 30, '#ffd27a');
      explosionLight.position.set(x, y + 1, z);
      explosionLight.intensity = EXPLOSION_LIGHT_INTENSITY;
      explosionTime = EXPLOSION_LIGHT_SECONDS;
      flashSphere.position.set(x, y, z);
      flashSphere.visible = true;
      sphereAge = 0;
    },
    /** Advance every effect by dt seconds. */
    update(dt) {
      smokeCloud.update(dt);
      glowCloud.update(dt);
      flashTime -= dt;
      if (flashTime <= 0) flashLight.intensity = 0;
      if (explosionTime > 0) {
        explosionTime -= dt;
        explosionLight.intensity = Math.max(0, explosionTime / EXPLOSION_LIGHT_SECONDS) * EXPLOSION_LIGHT_INTENSITY;
      } else explosionLight.intensity = 0;
      if (flashSphere.visible) {
        sphereAge += dt;
        const t = sphereAge / BLAST_SPHERE_SECONDS;
        if (t >= 1) flashSphere.visible = false;
        else {
          flashSphere.scale.setScalar(1 + t * BLAST_SPHERE_GROWTH);
          flashSphere.material.opacity = BLAST_SPHERE_OPACITY * (1 - t);
        }
      }
      let n = 0;
      for (let i = 0; i < tracerList.length; i += 1) {
        const t = tracerList[i];
        t.age += dt;
        if (t.age > t.life) {
          tracerPool.push(t);
          continue;
        }
        tracerList[n] = t;
        tracerPos[n * 6] = t.x1;
        tracerPos[n * 6 + 1] = t.y1;
        tracerPos[n * 6 + 2] = t.z1;
        tracerPos[n * 6 + 3] = t.x2;
        tracerPos[n * 6 + 4] = t.y2;
        tracerPos[n * 6 + 5] = t.z2;
        n += 1;
      }
      tracerList.length = n;
      tracerGeo.setDrawRange(0, n * 2);
      tracerGeo.attributes.position.needsUpdate = true;
    },
  };
}
