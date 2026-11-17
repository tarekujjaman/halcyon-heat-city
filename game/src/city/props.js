// Street furniture and landmarks: palms along Ocean Drive and the boulevards, street lamps with
// night-time light pools, traffic lights whose lamps the traffic system switches, benches, the
// Saltmarsh cranes, the moored freighter, the lighthouse on Pelican Key and the rooftop water tanks.
import * as THREE from 'three';
import { CITY } from '../config.js';
import { MeshBatch } from './batch.js';
import { createRng } from '../rng.js';

export function buildProps(layout, textures, colliders) {
  const rng = createRng(layout.seed + 202);
  const trunks = new MeshBatch();
  const fronds = new MeshBatch();
  const metal = new MeshBatch();
  const lampHeads = new MeshBatch();
  const pools = new MeshBatch();
  const lightHeads = new MeshBatch();
  const lamps = [];
  const palms = [];
  const half = CITY.road / 2;

  const addPalm = (x, z, h = rng.range(6, 10), lean = rng.range(-0.08, 0.08)) => {
    palms.push({ x, z, h });
    const segs = 4;
    let px = x;
    let pz = z;
    for (let s = 0; s < segs; s += 1) {
      const y = (h / segs) * s;
      const r0 = 0.32 - s * 0.05;
      const r1 = 0.32 - (s + 1) * 0.05;
      trunks.cylinder(px, y, pz, r0, r1, h / segs + 0.05, 6, s % 2 ? '#8b6b45' : '#7b5d3b', [1, 1]);
      px += lean * (h / segs) * (s + 1) * 0.5;
      pz += lean * 0.4 * (h / segs);
    }
    const crownX = px;
    const crownZ = pz;
    const n = 9;
    for (let k = 0; k < n; k += 1) {
      const a = (k / n) * Math.PI * 2 + rng.range(-0.2, 0.2);
      const len = rng.range(3.0, 4.0);
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      const nx = -dz;
      const nz = dx;
      const tipDrop = rng.range(1.4, 2.2);
      const rise = rng.range(0.4, 0.8);
      // The frond arches up then droops: four stations (out, up, half-width).
      const st = [[0.1, 0.05, 0.14], [1.1, rise, 0.42], [2.3, rise * 0.35, 0.36], [len, -tipDrop, 0.08]];
      const light = rng.pick(['#4c9a44', '#5aa64f', '#45944a']);
      const dark = rng.pick(['#2f6f2c', '#357a33', '#2c6a35']);
      for (let i = 0; i < st.length - 1; i += 1) {
        const [o0, u0, w0] = st[i];
        const [o1, u1, w1] = st[i + 1];
        const rib0 = [crownX + dx * o0, h + u0 + 0.12, crownZ + dz * o0];
        const rib1 = [crownX + dx * o1, h + u1 + 0.12, crownZ + dz * o1];
        const l0 = [rib0[0] - nx * w0, h + u0 - 0.08, rib0[2] - nz * w0];
        const l1 = [rib1[0] - nx * w1, h + u1 - 0.08, rib1[2] - nz * w1];
        const r0 = [rib0[0] + nx * w0, h + u0 - 0.08, rib0[2] + nz * w0];
        const r1 = [rib1[0] + nx * w1, h + u1 - 0.08, rib1[2] + nz * w1];
        // A shallow V: two half-blades sloping down from the rib.
        fronds.quad(l0, rib0, rib1, l1, [-nx * 0.4, 0.9, -nz * 0.4], null, i === 2 ? dark : light);
        fronds.quad(rib0, r0, r1, rib1, [nx * 0.4, 0.9, nz * 0.4], null, i === 2 ? light : dark);
      }
    }
    // Coconuts under the crown.
    for (let k = 0; k < 3; k += 1) {
      const a = rng.range(0, Math.PI * 2);
      trunks.cylinder(crownX + Math.cos(a) * 0.3, h - 0.5, crownZ + Math.sin(a) * 0.3, 0.16, 0.14, 0.25, 5, '#6b4a1e');
    }
    trunks.cylinder(crownX, h - 0.4, crownZ, 0.5, 0.2, 0.8, 6, '#6b4f2e');
    colliders.addCircle(x, z, 0.4, h, 'palm');
  };

  const addLamp = (x, z, yaw) => {
    const h = 7;
    metal.cylinder(x, CITY.kerb, z, 0.16, 0.12, h, 6, '#4a4f55');
    const ax = x + Math.sin(yaw) * 1.6;
    const az = z + Math.cos(yaw) * 1.6;
    metal.rotatedBox((x + ax) / 2, CITY.kerb + h - 0.15, (z + az) / 2, 0.16, 0.16, 2.0, yaw, '#4a4f55');
    lampHeads.rotatedBox(ax, CITY.kerb + h - 0.45, az, 0.5, 0.3, 1.0, yaw, '#fff1c9');
    pools.rotatedFloor(ax, CITY.kerb + 0.03, az, 9, 9, 0, '#ffd27a');
    lamps.push({ x: ax, z: az });
    colliders.addCircle(x, z, 0.2, h, 'lamp');
  };

  // Palms on both pavements of Ocean Drive and the north boulevard, lamps everywhere else.
  for (const road of layout.roads) {
    if (road.axis === 'x') {
      const spacing = road.oceanDrive ? 9 : 24;
      for (let x = road.x1 + half + 5; x < road.x2 - half - 3; x += spacing) {
        const zN = road.z - half - 1.6;
        const zS = road.z + half + 1.6;
        if (road.oceanDrive) {
          addPalm(x, zN, rng.range(7, 11));
          addPalm(x + 3, zS + 2.5, rng.range(8, 12));
          if ((x - road.x1) % 27 < spacing) addLamp(x + 4.5, zN, Math.PI);
        } else if (road.boulevard) {
          addPalm(x, zN, rng.range(6, 9));
          addLamp(x + 12, zS, 0);
        } else {
          addLamp(x, zN, 0);
          addLamp(x + 12, zS, Math.PI);
          const district = layout.districtAt(x, zN - 2);
          if (district === 'coral' || district === 'palmetto') addPalm(x + 6, zS, rng.range(5, 8));
        }
      }
    } else {
      const spacing = 24;
      for (let z = road.z1 + half + 5; z < road.z2 - half - 3; z += spacing) {
        const xW = road.x - half - 1.6;
        const xE = road.x + half + 1.6;
        if (road.boulevard && !road.quay) {
          addPalm(xW, z, rng.range(6, 9));
          addPalm(xE, z + 12, rng.range(6, 9));
          addLamp(xE, z, -Math.PI / 2);
        } else {
          addLamp(xW, z, Math.PI / 2);
          addLamp(xE, z + 12, -Math.PI / 2);
          const district = layout.districtAt(xE + 2, z);
          if (district === 'coral' || district === 'palmetto') addPalm(xW, z + 12, rng.range(5, 8));
        }
      }
    }
  }
  // Palms in the villa gardens and the parks and the plaza.
  for (const block of layout.blocks) {
    if (block.district === 'palmetto' || block.special === 'park') {
      const n = block.special === 'park' ? 10 : 5;
      for (let k = 0; k < n; k += 1) {
        const x = block.x + rng.range(5, block.w - 5);
        const z = block.z + rng.range(5, block.d - 5);
        if (colliders.overlaps(x, z, 1.2)) continue;
        addPalm(x, z, rng.range(5, 9));
      }
    }
    if (block.special === 'plaza') {
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        addPalm(block.cx + sx * 20, block.cz + sz * 20, 7);
        addPalm(block.cx + sx * 20, block.cz + sz * 12, 6.5);
      }
    }
  }
  // Beach palms scattered on the sand side of the boardwalk.
  for (let x = CITY.x0 + 20; x < CITY.x0 + CITY.width - 10; x += rng.range(14, 26)) {
    addPalm(x, layout.sandZ + rng.range(2, 10), rng.range(7, 12), rng.range(-0.15, 0.15));
  }

  // Traffic lights: one pole at each corner of every intersection, head facing the approach.
  const lights = [];
  for (const n of layout.intersections) {
    const corners = [
      { x: n.x - half - 1.2, z: n.z + half + 1.2, dir: 'n', hx: n.x - half + 1.2, hz: n.z + half + 1.0 },
      { x: n.x + half + 1.2, z: n.z - half - 1.2, dir: 's', hx: n.x + half - 1.2, hz: n.z - half - 1.0 },
      { x: n.x - half - 1.2, z: n.z - half - 1.2, dir: 'e', hx: n.x - half - 1.0, hz: n.z - half + 1.2 },
      { x: n.x + half + 1.2, z: n.z + half + 1.2, dir: 'w', hx: n.x + half + 1.0, hz: n.z + half - 1.2 },
    ];
    for (const c of corners) {
      const edge = (c.dir === 'n' && n.j === CITY.blocksZ) || (c.dir === 's' && n.j === 0) || (c.dir === 'e' && n.i === 0) || (c.dir === 'w' && n.i === CITY.blocksX);
      if (edge) continue;
      metal.cylinder(c.x, CITY.kerb, c.z, 0.14, 0.12, 5.2, 6, '#3d4046');
      const armYaw = c.dir === 'n' ? Math.PI / 2 : c.dir === 's' ? -Math.PI / 2 : c.dir === 'e' ? 0 : Math.PI;
      const ax = (c.x + c.hx) / 2;
      const az = (c.z + c.hz) / 2;
      const armLen = Math.hypot(c.hx - c.x, c.hz - c.z);
      metal.rotatedBox(ax, CITY.kerb + 5.0, az, 0.14, 0.14, armLen, armYaw, '#3d4046');
      lightHeads.rotatedBox(c.hx, CITY.kerb + 3.9, c.hz, 0.5, 1.4, 0.4, 0, '#2a2c30');
      // Three lamp quads on the face toward the approaching traffic.
      const faces = { n: 's', s: 'n', e: 'w', w: 'e' };
      const face = faces[c.dir];
      const lamp = (yOff, color) => {
        const start = lightHeads.count;
        const r = 0.16;
        const y = CITY.kerb + 4.2 + yOff;
        const o = 0.21;
        if (face === 's') lightHeads.quad([c.hx - r, y - r, c.hz + o], [c.hx + r, y - r, c.hz + o], [c.hx + r, y + r, c.hz + o], [c.hx - r, y + r, c.hz + o], [0, 0, 1], null, color);
        else if (face === 'n') lightHeads.quad([c.hx + r, y - r, c.hz - o], [c.hx - r, y - r, c.hz - o], [c.hx - r, y + r, c.hz - o], [c.hx + r, y + r, c.hz - o], [0, 0, -1], null, color);
        else if (face === 'e') lightHeads.quad([c.hx + o, y - r, c.hz + r], [c.hx + o, y - r, c.hz - r], [c.hx + o, y + r, c.hz - r], [c.hx + o, y + r, c.hz + r], [1, 0, 0], null, color);
        else lightHeads.quad([c.hx - o, y - r, c.hz - r], [c.hx - o, y - r, c.hz + r], [c.hx - o, y + r, c.hz + r], [c.hx - o, y + r, c.hz - r], [-1, 0, 0], null, color);
        return start;
      };
      const red = lamp(0.45, '#3a0d0d');
      const yellow = lamp(0, '#3a2f0d');
      const green = lamp(-0.45, '#0d3a16');
      lights.push({ i: n.i, j: n.j, dir: c.dir, red, yellow, green, state: 'red' });
      colliders.addCircle(c.x, c.z, 0.18, 5, 'pole');
    }
  }

  // Benches and bins on the busier pavements.
  for (const block of layout.blocks) {
    if (block.district === 'saltmarsh') continue;
    const n = block.special === 'plaza' ? 8 : 2;
    for (let k = 0; k < n; k += 1) {
      const side = rng.int(0, 3);
      const t = rng.range(0.2, 0.8);
      let x;
      let z;
      let yaw;
      if (side === 0) { x = block.x + block.w * t; z = block.z + 1.4; yaw = 0; } else if (side === 1) { x = block.x + block.w * t; z = block.z + block.d - 1.4; yaw = Math.PI; } else if (side === 2) { x = block.x + 1.4; z = block.z + block.d * t; yaw = Math.PI / 2; } else { x = block.x + block.w - 1.4; z = block.z + block.d * t; yaw = -Math.PI / 2; }
      if (block.special === 'plaza') {
        x = block.cx + rng.range(-16, 16);
        z = block.cz + rng.range(-16, 16);
        if (Math.hypot(x - block.cx, z - block.cz) < 10) continue;
      }
      if (colliders.overlaps(x, z, 1)) continue;
      metal.rotatedBox(x, CITY.kerb + 0.4, z, 1.8, 0.08, 0.5, yaw, '#8a5a35');
      metal.rotatedBox(x, CITY.kerb + 0.48, z - 0.2, 1.8, 0.45, 0.06, yaw, '#8a5a35');
      metal.rotatedBox(x - 0.8, CITY.kerb, z, 0.08, 0.4, 0.45, yaw, '#333');
      metal.rotatedBox(x + 0.8, CITY.kerb, z, 0.08, 0.4, 0.45, yaw, '#333');
      colliders.addBox(x - 0.9, z - 0.3, x + 0.9, z + 0.3, 1, 'bench');
    }
  }

  // Saltmarsh Docks: gantry cranes and container stacks on the quay, the moored freighter.
  const quay = layout.quayX;
  const craneZs = [layout.roadZ(1) + 20, layout.roadZ(2) + 30, layout.roadZ(4) + 10];
  for (const cz of craneZs) {
    const cx = quay + 7;
    const legH = 26;
    for (const dz of [-6, 6]) {
      metal.box(cx - 3, 0.3, cz + dz - 0.6, 1.2, legH, 1.2, '#d64b2f');
      metal.box(cx + 3, 0.3, cz + dz - 0.6, 1.2, legH, 1.2, '#d64b2f');
      colliders.addBox(cx - 3, cz + dz - 0.6, cx - 1.8, cz + dz + 0.6, legH, 'crane');
      colliders.addBox(cx + 3, cz + dz - 0.6, cx + 4.2, cz + dz + 0.6, legH, 'crane');
    }
    metal.box(cx - 4, legH, cz - 7, 9, 1.6, 14, '#d64b2f');
    metal.box(cx - 36, legH + 1.6, cz - 1.2, 54, 1.4, 2.4, '#e05a3a');
    metal.box(cx - 2, legH + 3, cz - 2, 4, 2.6, 4, '#f0d9a8');
    for (let k = -30; k < 18; k += 6) metal.box(cx + k, legH + 1.6, cz - 1.4, 0.3, 1.4, 2.8, '#b53d26');
  }
  const stacks = createRng(layout.seed + 7);
  const CONT = ['#c0392b', '#2471a3', '#1e8449', '#d68910', '#5d6d7e', '#a04000'];
  for (let z = layout.roadZ(0) + 10; z < layout.roadZ(5); z += 14) {
    if (stacks.chance(0.35)) continue;
    const x = quay + 3;
    const n = stacks.int(1, 3);
    for (let s = 0; s < n; s += 1) metal.box(x, 0.3 + s * 2.6, z, 2.5, 2.6, 12, stacks.pick(CONT), [1, 2.6]);
    colliders.addBox(x, z, x + 2.5, z + 12, n * 2.6, 'container');
  }
  // The freighter "Marisol Star" alongside the quay.
  const shipZ = layout.roadZ(2) + 10;
  const shipX = quay - 24;
  metal.box(shipX - 11, -1.5, shipZ - 70, 22, 8, 140, '#7a2f2f');
  metal.box(shipX - 11.3, 4.8, shipZ - 70.3, 22.6, 1.5, 140.6, '#d9d2c4');
  metal.box(shipX - 7, 6.3, shipZ + 44, 14, 16, 16, '#efece4');
  metal.box(shipX - 1.5, 22.3, shipZ + 50, 3, 7, 4, '#c0392b');
  for (let k = 0; k < 10; k += 1) {
    const cz = shipZ - 60 + k * 10;
    const stack = (k * 7) % 3 + 1;
    for (let s = 0; s < stack; s += 1) {
      for (const dx of [-7, -2.2, 2.6]) metal.box(shipX + dx, 6.3 + s * 2.6, cz, 4.4, 2.6, 9, CONT[(k + s + (dx > 0 ? 1 : 0)) % CONT.length], [1, 2.6]);
    }
  }
  metal.box(shipX - 11, 6, shipZ - 70, 22, 0.1, 140, '#8f8a80');
  // Small boats in the marina water south-west, near the causeway.
  const boats = createRng(layout.seed + 9);
  for (let k = 0; k < 7; k += 1) {
    const bx = quay - 10 - boats.range(0, 30);
    const bz = layout.oceanZ + 20 + boats.range(0, 40);
    const yaw = boats.range(0, Math.PI * 2);
    metal.rotatedBox(bx, -0.5, bz, 2.2, 1, 6, yaw, boats.pick(['#ffffff', '#f1f1f1', '#e8f4ff']));
    metal.rotatedBox(bx, 0.5, bz, 1.4, 0.9, 2.4, yaw, '#4d6b8a');
  }
  // Pelican Key lighthouse.
  const lh = layout.landmarks.lighthouse;
  metal.cylinder(lh.x, 0, lh.z, 3.2, 2.4, 18, 12, '#f4f1ea');
  metal.cylinder(lh.x, 6, lh.z, 2.95, 2.8, 2.5, 12, '#d64b2f');
  metal.cylinder(lh.x, 12, lh.z, 2.65, 2.55, 2.5, 12, '#d64b2f');
  metal.cylinder(lh.x, 18, lh.z, 2.6, 2.6, 0.6, 12, '#3d4046');
  lampHeads.cylinder(lh.x, 18.6, lh.z, 1.6, 1.6, 2.4, 10, '#fff6d6');
  metal.cylinder(lh.x, 21, lh.z, 2.2, 0.3, 1.8, 10, '#d64b2f');
  colliders.addCircle(lh.x, lh.z, 3.3, 22, 'lighthouse');

  const group = new THREE.Group();
  const barkMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  const frondMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
  const metalMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 });
  const lampMat = new THREE.MeshStandardMaterial({ vertexColors: true, emissive: new THREE.Color('#ffe2a8'), emissiveIntensity: 0, roughness: 0.4 });
  const poolMat = new THREE.MeshBasicMaterial({ vertexColors: true, map: textures.glow, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const headMat = new THREE.MeshStandardMaterial({ vertexColors: true, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.9, roughness: 0.5 });
  group.add(trunks.build(barkMat));
  group.add(fronds.build(frondMat));
  group.add(metal.build(metalMat));
  group.add(lampHeads.build(lampMat, { castShadow: false }));
  const poolMesh = pools.build(poolMat, { castShadow: false, receiveShadow: false });
  poolMesh.renderOrder = 2;
  group.add(poolMesh);
  const headMesh = lightHeads.build(headMat, { castShadow: false });
  headMesh.geometry.attributes.color.setUsage(THREE.DynamicDrawUsage);
  group.add(headMesh);

  const colorAttr = headMesh.geometry.attributes.color;
  const setLamp = (start, color) => {
    const c = new THREE.Color(color);
    for (let k = 0; k < 6; k += 1) colorAttr.setXYZ(start + k, c.r, c.g, c.b);
  };
  /** Switch one traffic light head: state is 'red' | 'yellow' | 'green'. */
  const setLight = (light, state) => {
    if (light.state === state) return;
    light.state = state;
    setLamp(light.red, state === 'red' ? '#ff2a1a' : '#3a0d0d');
    setLamp(light.yellow, state === 'yellow' ? '#ffc21a' : '#3a2f0d');
    setLamp(light.green, state === 'green' ? '#2aff5a' : '#0d3a16');
    colorAttr.needsUpdate = true;
  };
  for (const l of lights) {
    l.state = '';
    setLight(l, 'red');
  }
  return {
    group,
    lights,
    setLight,
    lamps,
    palms,
    emissiveMats: [{ material: lampMat, day: 0, night: 1.6 }],
    nightMats: [poolMat],
  };
}
