// Coral Strand's beach and the sea: sloping sand, the animated water shader with sun glitter and
// shore foam, Halcyon Pier on its pylons with the pavilion, the turning ferris wheel, umbrellas,
// towels and the lifeguard tower.
import * as THREE from 'three';
import { CITY } from '../config.js';
import { MeshBatch } from './batch.js';
import { createRng } from '../rng.js';

const WATER_VERT = `
uniform float uTime;
varying vec3 vWorld;
varying float vWave;
void main() {
  vec3 p = position;
  vec4 world = modelMatrix * vec4(p, 1.0);
  float w = sin(world.x * 0.12 + uTime * 1.1) * 0.18 + sin(world.z * 0.17 - uTime * 0.9) * 0.14 + sin((world.x + world.z) * 0.05 + uTime * 0.6) * 0.2;
  world.y += w;
  vWave = w;
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const WATER_FRAG = `
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uSky;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
uniform vec3 uCamera;
uniform float uShoreZ;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
varying vec3 vWorld;
varying float vWave;
void main() {
  float nx = sin(vWorld.x * 0.9 + uTime * 2.0) * 0.08 + sin(vWorld.z * 1.3 - uTime * 1.7) * 0.06;
  float nz = cos(vWorld.z * 0.8 + uTime * 1.6) * 0.08 + cos(vWorld.x * 1.1 + uTime * 1.3) * 0.06;
  vec3 n = normalize(vec3(nx, 1.0, nz));
  vec3 v = normalize(uCamera - vWorld);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  float shore = clamp((vWorld.z - uShoreZ) / 60.0, 0.0, 1.0);
  vec3 base = mix(uShallow, uDeep, shore);
  vec3 col = mix(base, uSky, fres * 0.3);
  vec3 h = normalize(uSunDir + v);
  float spec = pow(max(dot(n, h), 0.0), 180.0);
  col += uSunColor * spec * 1.4;
  float glitter = pow(max(dot(n, h), 0.0), 60.0) * 0.18;
  col += uSunColor * glitter;
  float foam = smoothstep(2.0, 0.0, abs(vWorld.z - uShoreZ - 3.0 - sin(vWorld.x * 0.25 + uTime * 1.5) * 1.5)) * 0.8;
  foam += smoothstep(0.3, 0.0, abs(fract((vWorld.z - uShoreZ) * 0.06 - uTime * 0.08) - 0.5) - 0.42) * 0.25 * (1.0 - shore);
  col = mix(col, vec3(1.0), clamp(foam, 0.0, 1.0) * 0.8);
  float depth = length(uCamera - vWorld);
  float fog = clamp((depth - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  col = mix(col, uFogColor, fog);
  gl_FragColor = vec4(col, 1.0);
}`;

export function buildBeach(layout, textures, colliders) {
  const group = new THREE.Group();
  const rng = createRng(layout.seed + 303);
  const sand = new MeshBatch();
  const wood = new MeshBatch();
  const flat = new MeshBatch();

  // Sand as a strip of quads following the ground slope, from the boardwalk under the water line.
  const x1 = layout.quayX - 10;
  const x2 = CITY.x0 + CITY.width + 60;
  const cols = 24;
  const rows = 12;
  const zA = layout.sandZ;
  const zB = layout.shoreZ + 24;
  for (let i = 0; i < cols; i += 1) {
    for (let j = 0; j < rows; j += 1) {
      const xa = x1 + ((x2 - x1) * i) / cols;
      const xb = x1 + ((x2 - x1) * (i + 1)) / cols;
      const za = zA + ((zB - zA) * j) / rows;
      const zb = zA + ((zB - zA) * (j + 1)) / rows;
      const wet = j >= rows - 4 ? '#d9c08f' : '#ffffff';
      sand.quad([xa, layout.groundHeight(xa, zb), zb], [xb, layout.groundHeight(xb, zb), zb], [xb, layout.groundHeight(xb, za), za], [xa, layout.groundHeight(xa, za), za], [0, 1, 0], [[xa / 6, zb / 6], [xb / 6, zb / 6], [xb / 6, za / 6], [xa / 6, za / 6]], wet);
    }
  }

  // The sea: a big plane with the water shader, sitting just under the shore slope.
  const seaSize = 2600;
  const seaGeo = new THREE.PlaneGeometry(seaSize, seaSize, 60, 60);
  seaGeo.rotateX(-Math.PI / 2);
  const water = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color('#0b4f9a') },
      uShallow: { value: new THREE.Color('#19b4cc') },
      uSky: { value: new THREE.Color('#ffb070') },
      uSunColor: { value: new THREE.Color('#ffd9a0') },
      uSunDir: { value: new THREE.Vector3(-0.6, 0.3, 0.7) },
      uCamera: { value: new THREE.Vector3() },
      uShoreZ: { value: layout.shoreZ },
      uFogColor: { value: new THREE.Color('#ffc890') },
      uFogNear: { value: 200 },
      uFogFar: { value: 900 },
    },
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
  });
  const sea = new THREE.Mesh(seaGeo, water);
  sea.position.set(CITY.x0 + CITY.width / 2 - 200, -0.42, layout.shoreZ + 300);
  group.add(sea);

  // Halcyon Pier: planks on pylons, railings, lamps, a pavilion at the end.
  const pier = layout.landmarks;
  const px = pier.pier.x;
  const pz1 = pier.pierStart.z;
  const pz2 = pier.pierTip.z;
  const pw = 11;
  wood.box(px - pw / 2, 0.14, pz1, pw, 0.5, pz2 - pz1, '#ffffff', [1.2, 1.2]);
  for (let z = pz1 + 6; z < pz2; z += 8) {
    wood.cylinder(px - pw / 2 + 1, -3, z, 0.4, 0.4, 3.6, 6, '#6b4f30');
    wood.cylinder(px + pw / 2 - 1, -3, z, 0.4, 0.4, 3.6, 6, '#6b4f30');
  }
  flat.box(px - pw / 2, 0.64, pz1, 0.15, 1.1, pz2 - pz1, '#efe9dd');
  flat.box(px + pw / 2 - 0.15, 0.64, pz1, 0.15, 1.1, pz2 - pz1, '#efe9dd');
  flat.box(px - pw / 2, 0.64, pz2 - 0.15, pw, 1.1, 0.15, '#efe9dd');
  colliders.addBox(px - pw / 2 - 1.5, pz1, px - pw / 2 + 0.15, pz2, 1.2, 'railing');
  colliders.addBox(px + pw / 2 - 0.15, pz1, px + pw / 2 + 1.5, pz2, 1.2, 'railing');
  colliders.addBox(px - pw / 2, pz2 - 0.3, px + pw / 2, pz2 + 1.5, 1.2, 'railing');
  for (let z = pz1 + 10; z < pz2 - 10; z += 16) {
    flat.cylinder(px - pw / 2 + 0.6, 0.64, z, 0.12, 0.1, 4, 6, '#3d4046');
    flat.cylinder(px + pw / 2 - 0.6, 0.64, z, 0.12, 0.1, 4, 6, '#3d4046');
  }
  // Pavilion with a pyramid roof and a snack bar.
  const pav = { x: px, z: pz2 - 10 };
  flat.box(pav.x - 4, 0.64, pav.z - 3, 8, 3.2, 6, '#f6f1e6');
  flat.cylinder(pav.x, 3.8, pav.z, 6.5, 0.3, 3, 4, '#d64b2f');
  colliders.addBox(pav.x - 4, pav.z - 3, pav.x + 4, pav.z + 3, 4, 'pavilion');
  // Pier approach steps from the boardwalk.
  wood.box(px - pw / 2, 0.14, pz1 - 2, pw, 0.3, 2.2, '#ffffff', [1.2, 1.2]);

  // The ferris wheel east of the pier on the sand: static frame, turning wheel.
  const wheel = buildFerrisWheel(flat, px + 44, layout.sandZ + 26, colliders);

  // Umbrellas, towels and a lifeguard tower.
  const umbrellaColors = ['#ff6b6b', '#ffd93d', '#6bcbff', '#ff9ff3', '#7bed9f', '#ffffff'];
  for (let k = 0; k < 44; k += 1) {
    const ux = CITY.x0 + 30 + rng.range(0, CITY.width - 60);
    const uz = layout.sandZ + 14 + rng.range(0, CITY.beachWidth - 30);
    if (Math.abs(ux - px) < 10) continue;
    const y = layout.groundHeight(ux, uz);
    const color = rng.pick(umbrellaColors);
    if (rng.chance(0.65)) {
      flat.cylinder(ux, y, uz, 0.06, 0.05, 2.4, 5, '#555');
      flat.cylinder(ux, y + 1.8, uz, 1.6, 0.05, 0.7, 10, color);
      colliders.addCircle(ux, uz, 0.15, 2.4, 'umbrella');
    }
    flat.rotatedFloor(ux + rng.range(-2, 2), y + 0.03, uz + rng.range(1, 2.5), 1.0, 2.0, rng.range(0, 1), rng.pick(umbrellaColors));
  }
  const lg = { x: CITY.x0 + CITY.width * 0.3, z: layout.sandZ + 30 };
  const lgy = layout.groundHeight(lg.x, lg.z);
  for (const [dx, dz] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) flat.box(lg.x + dx - 0.15, lgy, lg.z + dz - 0.15, 0.3, 3, 0.3, '#f4e4c1');
  flat.box(lg.x - 2, lgy + 3, lg.z - 2, 4, 2.4, 4, '#f6d35b');
  flat.cylinder(lg.x, lgy + 5.4, lg.z, 3.2, 0.2, 1.2, 4, '#d64b2f');
  colliders.addBox(lg.x - 2, lg.z - 2, lg.x + 2, lg.z + 2, 6, 'tower');

  const sandMat = new THREE.MeshStandardMaterial({ map: textures.sand, vertexColors: true, roughness: 1 });
  const woodMat = new THREE.MeshStandardMaterial({ map: textures.wood, vertexColors: true, roughness: 0.85 });
  const flatMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide });
  group.add(sand.build(sandMat, { castShadow: false }));
  group.add(wood.build(woodMat));
  group.add(flat.build(flatMat));
  group.add(wheel.mesh);

  return {
    group,
    water,
    update(dt, time, cameraPos) {
      water.uniforms.uTime.value = time;
      water.uniforms.uCamera.value.copy(cameraPos);
      wheel.mesh.rotation.z += dt * 0.12;
    },
    setLighting(sunDir, sunColor, skyColor, fogColor, fogNear, fogFar) {
      water.uniforms.uSunDir.value.copy(sunDir);
      water.uniforms.uSunColor.value.copy(sunColor);
      water.uniforms.uSky.value.copy(skyColor);
      water.uniforms.uFogColor.value.copy(fogColor);
      water.uniforms.uFogNear.value = fogNear;
      water.uniforms.uFogFar.value = fogFar;
    },
  };
}

function buildFerrisWheel(flat, x, z, colliders) {
  const R = 13;
  const hubY = R + 3;
  // Static A-frame supports.
  for (const s of [-1, 1]) {
    flat.rotatedBox(x + s * 4, 0.1, z - 3.2, 0.7, hubY + 1, 0.7, 0, '#d9d9e0');
    flat.rotatedBox(x + s * 4, 0.1, z + 3.2, 0.7, hubY + 1, 0.7, 0, '#d9d9e0');
  }
  flat.box(x - 6, 0.1, z - 4, 12, 0.6, 8, '#9a9aa5');
  colliders.addBox(x - 6, z - 4, x + 6, z + 4, 3, 'wheel');
  // The turning wheel, built around the origin in the x-y plane and placed at the hub.
  const w = new MeshBatch();
  const spokes = 12;
  for (let k = 0; k < spokes; k += 1) {
    const a = (k / spokes) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const len = R;
    const segs = 6;
    for (let q = 0; q < segs; q += 1) {
      const t0 = (q / segs) * len;
      const t1 = ((q + 1) / segs) * len;
      for (const dz of [-2.2, 2.2]) {
        w.quad([c * t0 - s * 0.12, s * t0 + c * 0.12, dz], [c * t0 + s * 0.12, s * t0 - c * 0.12, dz], [c * t1 + s * 0.12, s * t1 - c * 0.12, dz], [c * t1 - s * 0.12, s * t1 + c * 0.12, dz], [0, 0, 1], null, '#e8e8f0');
      }
    }
    // Gondola hanging at the rim.
    const gx = c * (R - 0.4);
    const gy = s * (R - 0.4);
    w.box(gx - 0.9, gy - 1.8, -1.0, 1.8, 1.6, 2.0, ['#ff6b6b', '#ffd93d', '#6bcbff', '#7bed9f'][k % 4]);
  }
  // Rim ring as short boxes.
  const rimSegs = 36;
  for (let k = 0; k < rimSegs; k += 1) {
    const a0 = (k / rimSegs) * Math.PI * 2;
    const a1 = ((k + 1) / rimSegs) * Math.PI * 2;
    for (const dz of [-2.2, 2.2]) {
      w.quad([Math.cos(a0) * (R - 0.25), Math.sin(a0) * (R - 0.25), dz], [Math.cos(a0) * (R + 0.25), Math.sin(a0) * (R + 0.25), dz], [Math.cos(a1) * (R + 0.25), Math.sin(a1) * (R + 0.25), dz], [Math.cos(a1) * (R - 0.25), Math.sin(a1) * (R - 0.25), dz], [0, 0, 1], null, '#ffb347');
    }
  }
  w.box(-0.8, -0.8, -2.6, 1.6, 1.6, 5.2, '#3d4046');
  const mesh = w.build(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }));
  mesh.matrixAutoUpdate = true;
  mesh.position.set(x, hubY, z);
  return { mesh };
}
