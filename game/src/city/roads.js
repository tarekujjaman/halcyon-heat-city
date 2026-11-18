// The road network as geometry: every street segment with its lane texture, the intersection
// boxes with crosswalks and stop lines, the Pelican Causeway over the harbour mouth, Pelican Key's
// turning loop, the dock quay, and the invisible sea and edge walls nobody drives off. One merged
// mesh per surface. Exports buildRoads(layout, textures, colliders) -> THREE.Group.
import * as THREE from 'three';
import { CITY } from '../config.js';
import { MeshBatch } from './batch.js';

const PAINT = '#efe9da';
/** Paint sits a hair above the asphalt (the material also uses a polygon offset). */
const PAINT_Y = 0.012;
/** Metres of road per repeat of the lane texture (one dash cycle). */
const LANE_TILE = 12;
/** Stop lines: a bar this wide, this far before the crosswalk, across the approach lanes. */
const STOP_LINE_WIDTH = 0.5;
const STOP_LINE_SETBACK = 3.6;
/** Crosswalks: zebra stripes this far from the segment end, this many across the carriageway. */
const CROSSWALK_INSET = 1.5;
const CROSSWALK_DEPTH = 3;
const CROSSWALK_STRIPES = 9;
const CROSSWALK_STRIPE_WIDTH = 0.6;

/**
 * Build every road surface and the kerbside colliders of the plan. The returned group is static;
 * colliders are added in place (railings, bollards, quay edge, the sea and the city edges).
 */
export function buildRoads(layout, textures, colliders) {
  const group = new THREE.Group();
  const roadBatch = new MeshBatch();
  const asphaltBatch = new MeshBatch();
  const paintBatch = new MeshBatch();
  const concreteBatch = new MeshBatch();
  const half = CITY.road / 2;

  for (const road of layout.roads) {
    if (road.axis === 'x') {
      const x1 = road.x1 + half;
      const x2 = road.x2 - half;
      const z = road.z;
      const len = x2 - x1;
      // u across (0..1 = kerb to kerb), v along: eastbound traffic keeps the dashes aligned.
      roadBatch.quad([x1, 0, z + half], [x2, 0, z + half], [x2, 0, z - half], [x1, 0, z - half], [0, 1, 0], [[1, 0], [1, len / LANE_TILE], [0, len / LANE_TILE], [0, 0]], '#ffffff');
      addCrosswalk(paintBatch, x1 + CROSSWALK_INSET, z, 'x');
      addCrosswalk(paintBatch, x2 - CROSSWALK_INSET, z, 'x');
      // Stop lines on the right-hand approach lanes of each end.
      paintBatch.floor(x2 - STOP_LINE_SETBACK, z, STOP_LINE_WIDTH, half, PAINT_Y, PAINT);
      paintBatch.floor(x1 + STOP_LINE_SETBACK - STOP_LINE_WIDTH, z - half, STOP_LINE_WIDTH, half, PAINT_Y, PAINT);
    } else {
      const z1 = road.z1 + half;
      const z2 = road.z2 - half;
      const x = road.x;
      const len = z2 - z1;
      roadBatch.quad([x - half, 0, z1], [x - half, 0, z2], [x + half, 0, z2], [x + half, 0, z1], [0, 1, 0], [[1, 0], [1, len / LANE_TILE], [0, len / LANE_TILE], [0, 0]], '#ffffff');
      addCrosswalk(paintBatch, x, z1 + CROSSWALK_INSET, 'z');
      addCrosswalk(paintBatch, x, z2 - CROSSWALK_INSET, 'z');
      paintBatch.floor(x - half, z2 - STOP_LINE_SETBACK, half, STOP_LINE_WIDTH, PAINT_Y, PAINT);
      paintBatch.floor(x, z1 + STOP_LINE_SETBACK - STOP_LINE_WIDTH, half, STOP_LINE_WIDTH, PAINT_Y, PAINT);
    }
  }
  for (const n of layout.intersections) {
    asphaltBatch.floor(n.x - half, n.z - half, CITY.road, CITY.road, 0, '#ffffff', [8, 8]);
  }

  // Pelican Causeway: a deck over the water from the west end of Ocean Drive to Pelican Key.
  const cz = layout.oceanZ;
  const cx1 = layout.causewayX1 - half;
  const cx2 = layout.causewayX2;
  const len = cx1 - cx2;
  roadBatch.quad([cx2, 0, cz + half], [cx1, 0, cz + half], [cx1, 0, cz - half], [cx2, 0, cz - half], [0, 1, 0], [[1, 0], [1, len / LANE_TILE], [0, len / LANE_TILE], [0, 0]], '#ffffff');
  concreteBatch.box(cx2 - 2, -1.6, cz - half - 1.6, len + 2, 1.6, CITY.road + 3.2, '#b9b5ad', [4, 4]);
  concreteBatch.box(cx2 - 2, 0, cz - half - 1.6, len + 2, 1.1, 0.5, '#d8d4cc');
  concreteBatch.box(cx2 - 2, 0, cz + half + 1.1, len + 2, 1.1, 0.5, '#d8d4cc');
  for (let x = cx2 + 8; x < cx1; x += 24) {
    concreteBatch.cylinder(x, -6, cz - half + 1, 1.3, 1.3, 5, 8, '#a8a39a');
    concreteBatch.cylinder(x, -6, cz + half - 1, 1.3, 1.3, 5, 8, '#a8a39a');
  }
  colliders.addBox(cx2 - 2, cz - half - 1.6, cx1, cz - half - 1.1, 1.1, 'railing');
  colliders.addBox(cx2 - 2, cz + half + 1.1, cx1, cz + half + 1.6, 1.1, 'railing');

  // Pelican Key: a round island at the end of the causeway.
  const key = layout.key;
  concreteBatch.cylinder(key.x, -3, key.z, key.r + 3, key.r, 3, 28, '#b5ad9d', [6, 6]);
  asphaltBatch.disc(key.x, 0.02, key.z, key.r - 4, 28, '#ffffff');
  asphaltBatch.floor(key.x - 6, key.z - half, cx2 - key.x + 8, CITY.road, 0.01, '#ffffff', [8, 8]);
  // Turning loop kerb and an outer rim wall so cars stay on the island.
  for (let a = 0; a < Math.PI * 2; a += 0.22) {
    const px = key.x + Math.cos(a) * (key.r - 1);
    const pz = key.z + Math.sin(a) * (key.r - 1);
    if (Math.abs(pz - key.z) < half + 1 && px > key.x) continue;
    concreteBatch.cylinder(px, 0, pz, 0.35, 0.3, 1, 6, '#e6e1d6');
    colliders.addCircle(px, pz, 0.6, 1, 'bollard');
  }

  // The dock quay along the west edge: concrete apron with bollards and a low edge wall.
  const q = layout.quayX;
  const zTop = layout.roadZ(0) - half;
  const zBottom = layout.oceanZ - half;
  concreteBatch.box(q, -2.2, zTop, CITY.x0 - q, 2.5, zBottom - zTop, '#a9a59c', [4, 4]);
  concreteBatch.box(q, 0.3, zTop, 0.6, 0.8, zBottom - zTop, '#8f8a80');
  colliders.addBox(q - 1, zTop, q + 0.6, zBottom, 1.2, 'quay-edge');
  for (let z = zTop + 6; z < zBottom; z += 14) {
    concreteBatch.cylinder(q + 1.6, 0.3, z, 0.35, 0.3, 0.7, 6, '#3b3b3b');
  }
  // Sea walls: nothing drives into the water. Beach shoreline wall (open at the pier) and the quay's south end.
  const pier = layout.pier;
  colliders.addBox(layout.quayX - 40, layout.shoreZ + 3, pier.x - pier.halfW, layout.shoreZ + 6, 3, 'sea');
  colliders.addBox(pier.x + pier.halfW, layout.shoreZ + 3, CITY.x0 + CITY.width + 80, layout.shoreZ + 6, 3, 'sea');
  // Pelican Key rim: a ring of short walls, open where the causeway arrives.
  for (let k = 0; k < 36; k += 1) {
    const a0 = (k / 36) * Math.PI * 2;
    const a1 = ((k + 1) / 36) * Math.PI * 2;
    const mx = key.x + Math.cos((a0 + a1) / 2) * (key.r - 0.6);
    const mz = key.z + Math.sin((a0 + a1) / 2) * (key.r - 0.6);
    if (Math.abs(mz - key.z) < half + 2 && mx > key.x) continue;
    colliders.addBox(mx - 3.2, mz - 3.2, mx + 3.2, mz + 3.2, 1.2, 'sea');
  }
  colliders.addBox(q - 40, zTop - 40, q, layout.oceanZ - half - 2, 3, 'sea');
  colliders.addBox(q - 40, layout.oceanZ + half + 2, q, layout.shoreZ + 6, 3, 'sea');
  // (The road onto Pelican Key stays open: the island's own rim wall has a gap where the causeway arrives.)
  // City outer edges north and east: hills and a highway shoulder nobody drives off.
  colliders.addBox(layout.quayX - 40, zTop - 44, CITY.x0 + CITY.width + 80, zTop - 40, 4, 'edge');
  colliders.addBox(CITY.x0 + CITY.width + 40, zTop - 44, CITY.x0 + CITY.width + 44, layout.shoreZ + 6, 4, 'edge');

  const roadMat = new THREE.MeshStandardMaterial({ map: textures.road, vertexColors: true, roughness: 0.92, metalness: 0.0 });
  const asphaltMat = new THREE.MeshStandardMaterial({ map: textures.asphalt, vertexColors: true, roughness: 0.92 });
  const paintMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -1 });
  const concreteMat = new THREE.MeshStandardMaterial({ map: textures.concrete, vertexColors: true, roughness: 0.9 });
  group.add(roadBatch.build(roadMat, { castShadow: false }));
  group.add(asphaltBatch.build(asphaltMat, { castShadow: false }));
  group.add(paintBatch.build(paintMat, { castShadow: false }));
  group.add(concreteBatch.build(concreteMat));
  return group;
}

/** Zebra stripes across a road end centred on (x, z), the road running along `axis` ('x' or 'z'). */
function addCrosswalk(batch, x, z, axis) {
  const half = CITY.road / 2;
  const halfDepth = CROSSWALK_DEPTH / 2;
  const pitch = (CITY.road - 2) / CROSSWALK_STRIPES;
  for (let k = 0; k < CROSSWALK_STRIPES; k += 1) {
    const offset = -half + 1 + k * pitch + (pitch - CROSSWALK_STRIPE_WIDTH) / 2;
    if (axis === 'x') batch.floor(x - halfDepth, z + offset, CROSSWALK_DEPTH, CROSSWALK_STRIPE_WIDTH, PAINT_Y, PAINT);
    else batch.floor(x + offset, z - halfDepth, CROSSWALK_STRIPE_WIDTH, CROSSWALK_DEPTH, PAINT_Y, PAINT);
  }
}
