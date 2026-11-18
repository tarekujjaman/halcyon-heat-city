// The ground under everything: the kerbed pavement slab of every block with the lawn or lot
// surface inside it, Glasswater Plaza with its fountain and planters, the two parks, the Ocean
// Drive boardwalk, the grass verges, the hills beyond the city and the base plane under it all.
// Merged into a handful of static meshes. Exports buildGround(layout, textures, colliders) -> THREE.Group.
import * as THREE from 'three';
import { CITY } from '../config.js';
import { MeshBatch } from './batch.js';

/** The surface inside a block's pavement ring by district: a tinted concrete lot, or grass. */
const LOT_SURFACE = {
  palmetto: { grass: true },
  saltmarsh: { color: '#8d8a84' },
  coral: { color: '#d9cfb8' },
  neon: { color: '#6e6a70' },
  default: { color: '#b9b5ae' },
};
/** Lot and lawn surfaces sit just above the kerb slab so they never z-fight with it. */
const SURFACE_LIFT = 0.01;
/** Hills: `[x, z, radius, height]` squashed domes north and east, far enough to sit in the fog. */
const HILL_SPOTS = (north) => [
  [-250, north - 120, 150, 42], [-60, north - 150, 190, 58], [160, north - 130, 160, 46], [360, north - 160, 220, 66],
  [CITY.x0 + CITY.width + 160, north + 60, 150, 44], [CITY.x0 + CITY.width + 190, north + 260, 180, 52], [CITY.x0 + CITY.width + 150, north + 440, 140, 38],
  [-420, north - 60, 140, 36], [520, north - 60, 150, 40],
];
const HILL_COLOR = '#6f9a5a';
const HILL_SHADE = '#789f60';

/**
 * Build every ground surface of the plan into one group. The plaza adds its fountain and planter
 * colliders in place; nothing else here blocks movement.
 */
export function buildGround(layout, textures, colliders) {
  const group = new THREE.Group();
  const pavement = new MeshBatch();
  const lots = new MeshBatch();
  const grass = new MeshBatch();
  const plazaBatch = new MeshBatch();
  const surfaceY = CITY.kerb + SURFACE_LIFT;

  for (const block of layout.blocks) {
    pavement.box(block.x, 0, block.z, block.w, CITY.kerb, block.d, '#ffffff', [2, 2]);
    const inner = { x: block.x + CITY.sidewalk, z: block.z + CITY.sidewalk, w: block.w - 2 * CITY.sidewalk, d: block.d - 2 * CITY.sidewalk };
    if (block.special === 'plaza') {
      buildPlaza(plazaBatch, inner, colliders);
      continue;
    }
    const surface = block.special === 'park' ? LOT_SURFACE.palmetto : LOT_SURFACE[block.district] || LOT_SURFACE.default;
    if (surface.grass) grass.floor(inner.x, inner.z, inner.w, inner.d, surfaceY, '#ffffff', [3, 3]);
    else lots.floor(inner.x, inner.z, inner.w, inner.d, surfaceY, surface.color, [4, 4]);
  }

  // The boardwalk along Ocean Drive (a wooden promenade) and its kerb.
  const bw = new MeshBatch();
  bw.box(layout.causewayX1 + CITY.road / 2, 0, layout.boardwalkZ, CITY.width - CITY.road, CITY.kerb, layout.sandZ - layout.boardwalkZ, '#ffffff', [1.2, 1.2]);
  // North and east aprons: a grass verge the hills rise from.
  const verge = new MeshBatch();
  const north = layout.roadZ(0) - CITY.road / 2;
  verge.floor(layout.quayX, north - 60, CITY.width + 60 - (layout.quayX - CITY.x0), 60, 0.1, '#ffffff', [6, 6]);
  verge.floor(CITY.x0 + CITY.width, north, 60, layout.oceanZ + CITY.road / 2 - north, 0.1, '#ffffff', [6, 6]);

  const hills = new MeshBatch();
  for (const [hx, hz, r, h] of HILL_SPOTS(north)) addDome(hills, hx, hz, r, h);

  const pavementMat = new THREE.MeshStandardMaterial({ map: textures.pavement, vertexColors: true, roughness: 0.95 });
  const lotMat = new THREE.MeshStandardMaterial({ map: textures.concrete, vertexColors: true, roughness: 0.95 });
  const grassMat = new THREE.MeshStandardMaterial({ map: textures.grass, vertexColors: true, roughness: 1 });
  const woodMat = new THREE.MeshStandardMaterial({ map: textures.wood, vertexColors: true, roughness: 0.85 });
  const plazaMat = new THREE.MeshStandardMaterial({ map: textures.pavement, vertexColors: true, roughness: 0.6 });
  const hillMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: false });
  group.add(pavement.build(pavementMat, { castShadow: false }));
  group.add(lots.build(lotMat, { castShadow: false }));
  group.add(grass.build(grassMat, { castShadow: false }));
  group.add(bw.build(woodMat, { castShadow: false }));
  group.add(verge.build(grassMat, { castShadow: false }));
  group.add(plazaBatch.build(plazaMat));
  group.add(hills.build(hillMat, { castShadow: false }));

  // The base plane under the city, sand coloured so any gap reads as ground.
  const base = new THREE.Mesh(new THREE.PlaneGeometry(CITY.width + 200, CITY.height + 160), new THREE.MeshStandardMaterial({ color: '#9c9890', roughness: 1 }));
  base.rotation.x = -Math.PI / 2;
  base.position.set(CITY.x0 + CITY.width / 2 - 20, -0.05, CITY.z0 + CITY.height / 2 - 40);
  base.receiveShadow = true;
  group.add(base);
  return group;
}

/** Glasswater Plaza inside `inner`: a paved square with diagonal bands, a fountain and four hedged planters. */
function buildPlaza(batch, inner, colliders) {
  const cx = inner.x + inner.w / 2;
  const cz = inner.z + inner.d / 2;
  batch.floor(inner.x, inner.z, inner.w, inner.d, CITY.kerb + 0.01, '#e9e2d3', [2, 2]);
  // Diagonal darker bands for a paving pattern.
  for (let k = -3; k <= 3; k += 1) {
    batch.rotatedFloor(cx + k * 9, CITY.kerb + 0.02, cz, 1.2, inner.d * 1.3, Math.PI / 4, '#cfc6b4');
  }
  batch.cylinder(cx, CITY.kerb, cz, 7.5, 7.5, 0.9, 24, '#d8d0c0');
  batch.cylinder(cx, CITY.kerb + 0.9, cz, 6.6, 6.6, 0.05, 24, '#3f8fc0');
  batch.cylinder(cx, CITY.kerb + 0.9, cz, 1.4, 1.1, 2.6, 12, '#e8e1d2');
  batch.cylinder(cx, CITY.kerb + 3.5, cz, 2.2, 2.2, 0.3, 12, '#e8e1d2');
  colliders.addCircle(cx, cz, 7.6, 1, 'fountain');
  // Planters in the corners with low hedges.
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const px = cx + sx * (inner.w / 2 - 6);
    const pz = cz + sz * (inner.d / 2 - 6);
    batch.box(px - 3, CITY.kerb, pz - 3, 6, 0.6, 6, '#bdb4a2');
    batch.box(px - 2.6, CITY.kerb + 0.6, pz - 2.6, 5.2, 0.9, 5.2, '#4f8a3f');
    colliders.addBox(px - 3, pz - 3, px + 3, pz + 3, 1.5, 'planter');
  }
}

/** A hill: a quarter-sphere profile of `rings` bands, alternately shaded so the slope reads from afar. */
function addDome(batch, cx, cz, r, h) {
  const seg = 18;
  const rings = 6;
  for (let i = 0; i < rings; i += 1) {
    const t0 = i / rings;
    const t1 = (i + 1) / rings;
    const r0 = r * Math.cos(t0 * Math.PI / 2);
    const r1 = r * Math.cos(t1 * Math.PI / 2);
    const y0 = h * Math.sin(t0 * Math.PI / 2);
    const y1 = h * Math.sin(t1 * Math.PI / 2);
    for (let s = 0; s < seg; s += 1) {
      const a0 = (s / seg) * Math.PI * 2;
      const a1 = ((s + 1) / seg) * Math.PI * 2;
      const n = [Math.cos((a0 + a1) / 2) * 0.6, 0.8, Math.sin((a0 + a1) / 2) * 0.6];
      const shade = i % 2 === 0 ? HILL_COLOR : HILL_SHADE;
      batch.quad(
        [cx + Math.cos(a1) * r0, y0, cz + Math.sin(a1) * r0], [cx + Math.cos(a0) * r0, y0, cz + Math.sin(a0) * r0],
        [cx + Math.cos(a0) * r1, y1, cz + Math.sin(a0) * r1], [cx + Math.cos(a1) * r1, y1, cz + Math.sin(a1) * r1],
        n, null, shade,
      );
    }
  }
}
