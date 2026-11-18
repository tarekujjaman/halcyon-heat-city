// Particles and flashes in two point clouds (soft smoke, additive glow): tyre and engine smoke,
// hit sparks, muzzle flashes, bullet tracers, flames, explosions and the police searchlight beam.
import * as THREE from 'three';
import { frand } from './rng.js';

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

class ParticleCloud {
  constructor(scene, texture, max, additive) {
    this.max = max;
    this.positions = new Float32Array(max * 3);
    this.colors = new Float32Array(max * 3);
    this.sizes = new Float32Array(max);
    this.alphas = new Float32Array(max);
    this.particles = [];
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

  emit(x, y, z, { size = 1, color = '#ffffff', life = 1, vx = 0, vy = 0, vz = 0, grow = 1.0, fade = 1, gravity = 0, drag = 0 } = {}) {
    if (this.particles.length >= this.max) this.particles.shift();
    this.color.set(color);
    this.particles.push({ x, y, z, vx, vy, vz, size, size0: size, life, age: 0, r: this.color.r, g: this.color.g, b: this.color.b, grow, fade, gravity, drag });
  }

  update(dt) {
    const list = this.particles;
    let n = 0;
    for (let i = 0; i < list.length; i += 1) {
      const p = list[i];
      p.age += dt;
      if (p.age >= p.life) continue;
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

export function createEffects(scene, textures) {
  const smokeCloud = new ParticleCloud(scene, textures.smoke, 900, false);
  const glowCloud = new ParticleCloud(scene, textures.glow, 600, true);

  // Tracers: a pool of line segments.
  const MAX_TRACERS = 48;
  const tracerPos = new Float32Array(MAX_TRACERS * 6);
  const tracerGeo = new THREE.BufferGeometry();
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(tracerPos, 3).setUsage(THREE.DynamicDrawUsage));
  const tracerMat = new THREE.LineBasicMaterial({ color: '#ffe9a8', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const tracers = new THREE.LineSegments(tracerGeo, tracerMat);
  tracers.frustumCulled = false;
  scene.add(tracers);
  const tracerList = [];

  // Muzzle light and explosion flash.
  const flashLight = new THREE.PointLight('#ffd27a', 0, 12, 2);
  scene.add(flashLight);
  let flashTime = 0;
  const explosionLight = new THREE.PointLight('#ff8a2a', 0, 40, 2);
  scene.add(explosionLight);
  let explosionTime = 0;
  const flashSphere = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), new THREE.MeshBasicMaterial({ color: '#ffd080', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  flashSphere.visible = false;
  scene.add(flashSphere);
  let sphereAge = 1;

  const listeners = [];

  return {
    smoke(x, y, z, o = {}) {
      smokeCloud.emit(x, y, z, { size: 1.2, color: '#cfcfd4', life: 1.4, vy: 0.8, grow: 2.6, fade: 0.55, ...o });
    },
    dust(x, y, z) {
      smokeCloud.emit(x, y, z, { size: 1, color: '#d8c8a8', life: 0.8, vy: 0.6, grow: 2.2, fade: 0.4 });
    },
    sparks(x, y, z, n = 8, color = '#ffd27a') {
      for (let i = 0; i < n; i += 1) {
        glowCloud.emit(x, y, z, { size: 0.25, color, life: 0.3 + frand() * 0.3, vx: (frand() - 0.5) * 7, vy: frand() * 5, vz: (frand() - 0.5) * 7, gravity: 12, grow: 0.4, fade: 1 });
      }
    },
    hitSparks(x, y, z) {
      this.sparks(x, y, z, 6, '#ffe6a0');
      smokeCloud.emit(x, y, z, { size: 0.5, color: '#9a9a9a', life: 0.5, vy: 0.6, grow: 2.5, fade: 0.5 });
    },
    bloodPuff(x, y, z) {
      smokeCloud.emit(x, y, z, { size: 0.45, color: '#8a1a1a', life: 0.45, vy: 0.3, grow: 2, fade: 0.7 });
    },
    muzzleFlash(x, y, z, dx, dy, dz) {
      glowCloud.emit(x + dx * 0.4, y + dy * 0.4, z + dz * 0.4, { size: 1.1, color: '#fff1b0', life: 0.07, grow: 1.6, fade: 1 });
      glowCloud.emit(x + dx * 0.7, y + dy * 0.7, z + dz * 0.7, { size: 0.6, color: '#ffb347', life: 0.08, grow: 2, fade: 1 });
      flashLight.position.set(x + dx, y + dy, z + dz);
      flashLight.intensity = 14;
      flashTime = 0.06;
    },
    tracer(x1, y1, z1, x2, y2, z2) {
      tracerList.push({ x1, y1, z1, x2, y2, z2, age: 0, life: 0.09 });
      if (tracerList.length > MAX_TRACERS) tracerList.shift();
    },
    flame(x, y, z) {
      glowCloud.emit(x + (frand() - 0.5) * 0.6, y, z + (frand() - 0.5) * 0.6, { size: 0.9 + frand() * 0.6, color: frand() < 0.5 ? '#ff7a1a' : '#ffc64a', life: 0.5 + frand() * 0.3, vy: 2.2 + frand(), grow: 0.5, fade: 0.9 });
    },
    explosion(x, y, z) {
      for (let i = 0; i < 40; i += 1) {
        glowCloud.emit(x, y, z, { size: 2 + frand() * 2.5, color: i % 3 === 0 ? '#ffe08a' : i % 3 === 1 ? '#ff7a1a' : '#ff3a10', life: 0.5 + frand() * 0.5, vx: (frand() - 0.5) * 12, vy: frand() * 9, vz: (frand() - 0.5) * 12, gravity: 4, grow: 1.8, fade: 1, drag: 2 });
      }
      for (let i = 0; i < 30; i += 1) {
        smokeCloud.emit(x, y + 0.5, z, { size: 2.5 + frand() * 2, color: '#2a2a2a', life: 2.5 + frand() * 1.5, vx: (frand() - 0.5) * 6, vy: 2 + frand() * 3, vz: (frand() - 0.5) * 6, grow: 2.5, fade: 0.8, drag: 1.5 });
      }
      this.sparks(x, y, z, 30, '#ffd27a');
      explosionLight.position.set(x, y + 1, z);
      explosionLight.intensity = 60;
      explosionTime = 0.5;
      flashSphere.position.set(x, y, z);
      flashSphere.visible = true;
      sphereAge = 0;
      for (const fn of listeners) fn({ type: 'explosion', x, y, z });
    },
    onEvent(fn) {
      listeners.push(fn);
    },
    update(dt) {
      smokeCloud.update(dt);
      glowCloud.update(dt);
      flashTime -= dt;
      if (flashTime <= 0) flashLight.intensity = 0;
      if (explosionTime > 0) {
        explosionTime -= dt;
        explosionLight.intensity = Math.max(0, explosionTime / 0.5) * 60;
      } else explosionLight.intensity = 0;
      if (flashSphere.visible) {
        sphereAge += dt;
        const t = sphereAge / 0.35;
        if (t >= 1) flashSphere.visible = false;
        else {
          flashSphere.scale.setScalar(1 + t * 7);
          flashSphere.material.opacity = 0.8 * (1 - t);
        }
      }
      let n = 0;
      for (const t of tracerList) {
        t.age += dt;
        if (t.age > t.life) continue;
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
