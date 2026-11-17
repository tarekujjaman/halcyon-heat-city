// The seeded street plan of Halcyon Bay: a grid of blocks and roads, each block given to a
// district and cut into building lots, the intersections and lanes traffic drives, the sidewalk
// graph pedestrians walk, the water lines and the landmarks every mission and activity points at.
// Pure data: no three.js here, so AI, the minimap and the tests can share it.
import { CITY, DISTRICTS } from '../config.js';
import { createRng, hash2 } from '../rng.js';

export function districtOfBlock(bx, bz) {
  if (bz >= 6) return 'coral';
  if (bx <= 1) return 'saltmarsh';
  if (bz <= 1) return 'palmetto';
  if (bx >= 7) return 'neon';
  return 'glasswater';
}

export function roadX(i) {
  return CITY.x0 + CITY.road / 2 + i * CITY.pitch;
}

export function roadZ(j) {
  return CITY.z0 + CITY.road / 2 + j * CITY.pitch;
}

/** Block (bx, bz) spans x0..x0+block, z0..z0+block (its sidewalk ring included). */
export function blockRect(bx, bz) {
  return { x: CITY.x0 + CITY.road + bx * CITY.pitch, z: CITY.z0 + CITY.road + bz * CITY.pitch, w: CITY.block, d: CITY.block };
}

/** Special blocks: open plazas, the bank, the body shop, the gang bar and the safehouses. */
const SPECIAL = {
  '4,3': 'plaza',
  '5,3': 'bank',
  '1,4': 'garage',
  '8,3': 'gangbar',
  '6,7': 'safehouse-strand',
  '8,4': 'safehouse-neon',
  '5,0': 'safehouse-palmetto',
  '9,5': 'carshop-neon',
  '3,1': 'carshop-palmetto',
  '2,6': 'park',
  '7,1': 'park',
};

function cutLots(rng, rect, nx, nz, gap) {
  const lots = [];
  const cw = (rect.w - gap * (nx + 1)) / nx;
  const cd = (rect.d - gap * (nz + 1)) / nz;
  for (let ix = 0; ix < nx; ix += 1) {
    for (let iz = 0; iz < nz; iz += 1) {
      lots.push({ x: rect.x + gap + ix * (cw + gap), z: rect.z + gap + iz * (cd + gap), w: cw, d: cd, ix, iz });
    }
  }
  return lots;
}

const PASTELS = ['#f7c6d9', '#bfeedd', '#fff1b8', '#ffd3b0', '#c9e4ff', '#f8e2ff', '#ffe8cf', '#d8f5c8'];
const NEON_WALLS = ['#9a7fc4', '#c47fa8', '#7fb0c4', '#c4a37f', '#8f8fb8', '#c48a7f', '#7fc4b0', '#e0d6c8', '#b8b0d8'];
const GLASS_TINTS = ['#8fd6f2', '#a9e3ef', '#bcd9ff', '#8ccfe0', '#dbeefb', '#9fd1f0'];
const WARE_WALLS = ['#8d8f93', '#a3785c', '#6d7f8c', '#9a9ea5', '#7c6a5c', '#5f7a8a'];

/** The building lots of one block, by district and special use. */
function planBlock(rng, block) {
  const inner = { x: block.x + CITY.sidewalk + 1, z: block.z + CITY.sidewalk + 1, w: block.w - 2 * CITY.sidewalk - 2, d: block.d - 2 * CITY.sidewalk - 2 };
  const lots = [];
  const push = (lot) => lots.push({ ...lot, district: block.district, block });
  switch (block.special) {
    case 'plaza':
    case 'park':
      return lots;
    case 'bank':
      push({ x: inner.x + 4, z: inner.z + 4, w: inner.w - 8, d: inner.d - 8, h: 17, style: 'stone', color: '#f1e9d8', kind: 'bank', sign: 'GLASSWATER MUTUAL' });
      return lots;
    case 'garage':
      push({ x: inner.x + 2, z: inner.z + 2, w: inner.w - 4, d: 22, h: 8, style: 'warehouse', color: '#b9643c', kind: 'garage', sign: "TEO'S BODY SHOP", front: 's' });
      return lots;
    case 'gangbar':
      push({ x: inner.x + 2, z: inner.z + 2, w: inner.w - 4, d: inner.d - 14, h: 12, style: 'neon', color: '#a0507f', kind: 'gangbar', sign: 'THE RIPTIDE', front: 's', neon: '#ff4fd8' });
      return lots;
    case 'safehouse-strand':
      push({ x: inner.x + 2, z: inner.z + 2, w: inner.w - 4, d: inner.d - 4, h: 22, style: 'hotel', color: '#f7c6d9', kind: 'safehouse', sign: 'STRAND APARTMENTS', front: 's' });
      return lots;
    case 'safehouse-neon':
      push({ x: inner.x + 2, z: inner.z + 2, w: inner.w - 4, d: inner.d - 4, h: 16, style: 'neon', color: '#8f8fc0', kind: 'safehouse', sign: 'ROW LOFTS', front: 'w', neon: '#37f3ff' });
      return lots;
    case 'safehouse-palmetto':
      push({ x: inner.x + 6, z: inner.z + 6, w: inner.w - 12, d: inner.d - 22, h: 7, style: 'villa', color: '#fbf6ea', kind: 'safehouse', pool: true, sign: '', front: 's' });
      return lots;
    case 'carshop-neon':
      push({ x: inner.x + 2, z: inner.z + 2, w: inner.w - 4, d: 20, h: 7, style: 'warehouse', color: '#2f5c7a', kind: 'carshop', sign: 'SPRAY KINGS', front: 's' });
      return lots;
    case 'carshop-palmetto':
      push({ x: inner.x + 2, z: inner.z + 2, w: inner.w - 4, d: 20, h: 7, style: 'warehouse', color: '#7a5c2f', kind: 'carshop', sign: 'PALMETTO AUTO', front: 's' });
      return lots;
    default:
      break;
  }
  switch (block.district) {
    case 'glasswater': {
      const n = rng.int(2, 3);
      for (const lot of cutLots(rng, inner, n === 3 ? 2 : 2, n === 3 ? 2 : 1, 3)) {
        if (n === 3 && lot.ix === 1 && lot.iz === 1 && rng.chance(0.5)) continue;
        const tall = rng.chance(0.75);
        push({ ...lot, h: tall ? rng.range(45, 125) : rng.range(18, 34), style: tall ? 'glass' : 'facade', color: tall ? rng.pick(GLASS_TINTS) : '#d9d6cf', podium: tall ? rng.range(7, 13) : 0, tower: tall });
      }
      break;
    }
    case 'neon': {
      for (const lot of cutLots(rng, inner, 3, 2, 2.5)) {
        push({ ...lot, h: rng.range(8, 17), style: 'neon', color: rng.pick(NEON_WALLS), sign: rng.pick(NEON_SIGNS), neon: rng.pick(NEON_COLORS) });
      }
      break;
    }
    case 'coral': {
      const nx = rng.int(2, 3);
      for (const lot of cutLots(rng, inner, nx, 1, 3)) {
        const tall = rng.chance(0.6);
        push({ ...lot, h: tall ? rng.range(22, 40) : rng.range(9, 16), style: 'hotel', color: rng.pick(PASTELS), sign: rng.chance(0.6) ? rng.pick(HOTEL_SIGNS) : '' });
      }
      break;
    }
    case 'palmetto': {
      for (const lot of cutLots(rng, inner, 2, 2, 4)) {
        push({ ...lot, h: rng.range(4.5, 8), style: 'villa', color: rng.pick(['#fbf6ea', '#f4ead6', '#ffffff', '#f9e4d4']), pool: rng.chance(0.8) });
      }
      break;
    }
    case 'saltmarsh': {
      const vertical = rng.chance(0.5);
      for (const lot of cutLots(rng, inner, vertical ? 1 : 2, vertical ? 2 : 1, 4)) {
        const yard = rng.chance(0.3);
        push({ ...lot, h: yard ? 0 : rng.range(8, 13), style: 'warehouse', color: rng.pick(WARE_WALLS), containers: yard || rng.chance(0.4) });
      }
      break;
    }
    default:
      break;
  }
  return lots;
}

const NEON_SIGNS = ['TIDAL', 'LUNA BAR', 'KOI', 'VELVET', 'MOTEL 9', 'SOL CAFE', 'BLUE FIN', 'DISCO', 'OPEN 24H', 'PALM CLUB', 'ARCADE', 'NOODLE', 'CINEMA', 'TATTOO', 'LIQUOR'];
const NEON_COLORS = ['#ff4fd8', '#37f3ff', '#ffd23f', '#ff6b4a', '#8bff6b', '#c56bff'];
const HOTEL_SIGNS = ['HOTEL SOLANA', 'MAR AZUL', 'THE PELICAN', 'SURF INN', 'CASA CORAL', 'SUNSET SUITES', 'BAYSIDE'];

/** The whole plan for a seed. */
export function buildLayout(seed) {
  const rng = createRng(seed);
  const blocks = [];
  const blockMap = new Map();
  for (let bx = 0; bx < CITY.blocksX; bx += 1) {
    for (let bz = 0; bz < CITY.blocksZ; bz += 1) {
      const rect = blockRect(bx, bz);
      const block = { bx, bz, ...rect, district: districtOfBlock(bx, bz), special: SPECIAL[`${bx},${bz}`] || null, lots: [] };
      block.cx = block.x + block.w / 2;
      block.cz = block.z + block.d / 2;
      blocks.push(block);
      blockMap.set(`${bx},${bz}`, block);
    }
  }
  const lots = [];
  for (const block of blocks) {
    block.lots = planBlock(rng, block);
    lots.push(...block.lots);
  }

  const intersections = [];
  for (let i = 0; i <= CITY.blocksX; i += 1) {
    for (let j = 0; j <= CITY.blocksZ; j += 1) {
      intersections.push({ i, j, x: roadX(i), z: roadZ(j), phase: (i + j) % 2 });
    }
  }
  const roads = [];
  for (let j = 0; j <= CITY.blocksZ; j += 1) {
    for (let i = 0; i < CITY.blocksX; i += 1) {
      roads.push({ axis: 'x', i, j, x1: roadX(i), x2: roadX(i + 1), z: roadZ(j), boulevard: j === CITY.blocksZ || j === 0, oceanDrive: j === CITY.blocksZ });
    }
  }
  for (let i = 0; i <= CITY.blocksX; i += 1) {
    for (let j = 0; j < CITY.blocksZ; j += 1) {
      roads.push({ axis: 'z', i, j, z1: roadZ(j), z2: roadZ(j + 1), x: roadX(i), boulevard: i === 5 || i === 0, quay: i === 0 });
    }
  }
  const oceanZ = roadZ(CITY.blocksZ);
  const boardwalkZ = oceanZ + CITY.road / 2;
  const sandZ = boardwalkZ + 7;
  const shoreZ = sandZ + CITY.beachWidth;
  const quayX = CITY.x0 - 14;
  const causewayX1 = roadX(0);
  const causewayX2 = CITY.x0 - CITY.causewayLength;
  const key = { x: causewayX2 - 26, z: oceanZ, r: 34 };

  const walk = buildWalkGraph(blocks, blockMap);

  const landmarks = buildLandmarks(blockMap, oceanZ, boardwalkZ, shoreZ, key);

  const layout = {
    seed, rng, blocks, blockMap, lots, intersections, roads,
    oceanZ, boardwalkZ, sandZ, shoreZ, quayX, causewayX1, causewayX2, key,
    walk, landmarks,
    bounds: { minX: quayX - 2, maxX: roadX(CITY.blocksX) + 60, minZ: roadZ(0) - 60, maxZ: shoreZ + 4 },
    colliders: { boxes: [], circles: [] },
    roadX, roadZ,
    blockAt: (bx, bz) => blockMap.get(`${bx},${bz}`) || null,
    intersectionAt(i, j) {
      if (i < 0 || j < 0 || i > CITY.blocksX || j > CITY.blocksZ) return null;
      return intersections[i * (CITY.blocksZ + 1) + j];
    },
  };
  layout.blockOf = (x, z) => blockOf(layout, x, z);
  layout.districtAt = (x, z) => districtAt(layout, x, z);
  layout.isRoad = (x, z) => isRoad(layout, x, z);
  layout.nearestIntersection = (x, z) => nearestIntersection(layout, x, z);
  layout.groundHeight = (x, z) => groundHeight(layout, x, z);
  layout.isWater = (x, z) => isWater(layout, x, z);
  return layout;
}

function blockOf(L, x, z) {
  const bx = Math.floor((x - CITY.x0 - CITY.road) / CITY.pitch);
  const bz = Math.floor((z - CITY.z0 - CITY.road) / CITY.pitch);
  const b = L.blockAt(bx, bz);
  if (!b) return null;
  if (x >= b.x && x <= b.x + b.w && z >= b.z && z <= b.z + b.d) return b;
  return null;
}

function districtAt(L, x, z) {
  const b = blockOf(L, x, z);
  if (b) return b.district;
  if (z > L.oceanZ - CITY.road) return 'coral';
  if (x < CITY.x0 + CITY.road) return 'saltmarsh';
  const bx = Math.min(CITY.blocksX - 1, Math.max(0, Math.floor((x - CITY.x0 - CITY.road / 2) / CITY.pitch)));
  const bz = Math.min(CITY.blocksZ - 1, Math.max(0, Math.floor((z - CITY.z0 - CITY.road / 2) / CITY.pitch)));
  return districtOfBlock(bx, bz);
}

function isRoad(L, x, z) {
  if (z > L.oceanZ - CITY.road / 2 && z < L.oceanZ + CITY.road / 2 && x < L.causewayX1 && x > L.causewayX2) return true;
  if (x < CITY.x0 || z < CITY.z0 || x > CITY.x0 + CITY.width || z > CITY.z0 + CITY.height) return false;
  return blockOf(L, x, z) === null;
}

function isWater(L, x, z) {
  if (z > L.shoreZ) return !(Math.hypot(x - L.key.x, z - L.key.z) < L.key.r);
  if (x < L.quayX) {
    if (Math.hypot(x - L.key.x, z - L.key.z) < L.key.r) return false;
    if (z > L.oceanZ - CITY.road / 2 && z < L.oceanZ + CITY.road / 2 && x > L.causewayX2) return false;
    return true;
  }
  return false;
}

function groundHeight(L, x, z) {
  if (z > L.sandZ && z <= L.shoreZ + 20) {
    const t = Math.min(1, Math.max(0, (z - L.sandZ) / CITY.beachWidth));
    return 0.12 - 0.62 * t * t;
  }
  if (z > L.boardwalkZ && z <= L.sandZ) return CITY.kerb;
  if (x < CITY.x0 && x >= L.quayX) return 0.3;
  const b = blockOf(L, x, z);
  if (b) return CITY.kerb;
  if (x < CITY.x0 || x > CITY.x0 + CITY.width || z < CITY.z0) return 0.1;
  return 0;
}

function nearestIntersection(L, x, z) {
  const i = Math.round((x - CITY.x0 - CITY.road / 2) / CITY.pitch);
  const j = Math.round((z - CITY.z0 - CITY.road / 2) / CITY.pitch);
  return L.intersectionAt(Math.min(CITY.blocksX, Math.max(0, i)), Math.min(CITY.blocksZ, Math.max(0, j)));
}

/** Sidewalk corners of every block, joined along the block sides and across the roads by crosswalks. */
function buildWalkGraph(blocks, blockMap) {
  const nodes = [];
  const edges = [];
  const inset = CITY.sidewalk / 2;
  const cornerIndex = new Map();
  const add = (x, z) => {
    nodes.push({ x, z, links: [] });
    return nodes.length - 1;
  };
  for (const b of blocks) {
    const nw = add(b.x + inset, b.z + inset);
    const ne = add(b.x + b.w - inset, b.z + inset);
    const se = add(b.x + b.w - inset, b.z + b.d - inset);
    const sw = add(b.x + inset, b.z + b.d - inset);
    cornerIndex.set(`${b.bx},${b.bz}`, { nw, ne, se, sw });
    edges.push([nw, ne], [ne, se], [se, sw], [sw, nw]);
  }
  for (const b of blocks) {
    const me = cornerIndex.get(`${b.bx},${b.bz}`);
    const east = cornerIndex.get(`${b.bx + 1},${b.bz}`);
    const south = cornerIndex.get(`${b.bx},${b.bz + 1}`);
    if (east) edges.push([me.ne, east.nw], [me.se, east.sw]);
    if (south) edges.push([me.sw, south.nw], [me.se, south.ne]);
  }
  for (const [a, b] of edges) {
    nodes[a].links.push(b);
    nodes[b].links.push(a);
  }
  return { nodes, edges, cornerIndex };
}

/** Named places: safehouses, shops, mission spots, race routes and the 20 sea-glass shards. */
function buildLandmarks(blockMap, oceanZ, boardwalkZ, shoreZ, key) {
  const b = (bx, bz) => blockMap.get(`${bx},${bz}`);
  const front = (block, side = 'south') => {
    if (side === 'south') return { x: block.cx, z: block.z + block.d - CITY.sidewalk / 2 };
    if (side === 'north') return { x: block.cx, z: block.z + CITY.sidewalk / 2 };
    if (side === 'west') return { x: block.x + CITY.sidewalk / 2, z: block.cz };
    return { x: block.x + block.w - CITY.sidewalk / 2, z: block.cz };
  };
  const roadSpot = (block, side = 'south', lane = 1) => {
    if (side === 'south') return { x: block.cx, z: block.z + block.d + CITY.road / 2 - lane * CITY.laneWidth / 2 };
    if (side === 'north') return { x: block.cx, z: block.z - CITY.road / 2 + lane * CITY.laneWidth / 2 };
    if (side === 'east') return { x: block.x + block.w + CITY.road / 2 - lane * CITY.laneWidth / 2, z: block.cz };
    return { x: block.x - CITY.road / 2 + lane * CITY.laneWidth / 2, z: block.cz };
  };
  const garage = b(1, 4);
  const plaza = b(4, 3);
  const bank = b(5, 3);
  const bar = b(8, 3);
  const strand = b(6, 7);
  const neonLoft = b(8, 4);
  const villa = b(5, 0);
  const pierX = roadX(5);
  const landmarks = {
    garage: { ...front(garage, 'south'), yaw: Math.PI, name: "Teo's Body Shop", block: garage, lot: { x: garage.x + 6, z: garage.z + 30, w: garage.w - 12, d: 20 } },
    garageParking: { x: garage.cx, z: garage.z + 40, yaw: 0 },
    plaza: { x: plaza.cx, z: plaza.cz, name: 'Glasswater Plaza', block: plaza },
    bank: { ...front(bank, 'west'), name: 'Glasswater Mutual', block: bank },
    bankDoor: { x: bank.x + CITY.sidewalk + 5.5, z: bank.cz },
    bankRoad: roadSpot(bank, 'west'),
    gangBar: { ...front(bar, 'south'), name: 'The Riptide', block: bar },
    gangBarRoad: roadSpot(bar, 'south'),
    pier: { x: pierX, z: shoreZ + 40, name: 'Halcyon Pier' },
    pierEnd: { x: pierX, z: shoreZ + 110 },
    pierStart: { x: pierX, z: boardwalkZ + 3 },
    key: { x: key.x, z: key.z, name: 'Pelican Key' },
    lighthouse: { x: key.x - 6, z: key.z - 8 },
    safehouses: {
      strand: { ...front(strand, 'south'), name: 'Strand Apartment', district: 'coral', block: strand, park: roadSpot(strand, 'south') },
      neon: { ...front(neonLoft, 'west'), name: 'Neon Row Loft', district: 'neon', block: neonLoft, park: roadSpot(neonLoft, 'west') },
      palmetto: { ...front(villa, 'south'), name: 'Palmetto Villa', district: 'palmetto', block: villa, park: roadSpot(villa, 'south') },
    },
    carShops: [
      { id: 'teo', name: "Teo's Body Shop", x: garage.cx, z: garage.z + garage.d - 9, block: garage },
      { id: 'spray', name: 'Spray Kings', x: b(9, 5).cx, z: b(9, 5).z + 36, block: b(9, 5) },
      { id: 'palmetto', name: 'Palmetto Auto', x: b(3, 1).cx, z: b(3, 1).z + 36, block: b(3, 1) },
    ],
    gangSpots: [
      { x: bar.cx - 8, z: bar.z + bar.d - 6 },
      { x: bar.cx + 6, z: bar.z + bar.d - 5 },
      { x: b(7, 4).cx, z: b(7, 4).z + 2 },
      { x: b(0, 2).cx, z: b(0, 2).z + b(0, 2).d - 2 },
      { x: b(1, 1).cx + 10, z: b(1, 1).z + b(1, 1).d - 2 },
    ],
    docksYard: { x: b(0, 3).cx, z: b(0, 3).cz, block: b(0, 3) },
    docksYardRoad: roadSpot(b(0, 3), 'east'),
    neonStreet: roadSpot(b(8, 3), 'south'),
    oceanDriveStart: { x: roadX(1) + 20, z: oceanZ + 1.75, yaw: Math.PI / 2 },
    oceanDriveEast: { x: roadX(8), z: oceanZ + 1.75 },
    palmettoDrive: roadSpot(b(6, 1), 'south'),
    taxiStand: { x: roadX(5) + 1.75 + 3.5, z: roadZ(2) + 20 },
    hospital: { ...front(b(3, 5), 'south'), name: 'Bayside Clinic' },
    policeStation: { ...front(b(6, 4), 'south'), name: 'HPD Glasswater' },
    start: { ...front(strand, 'south'), yaw: 0 },
    races: [
      { id: 'coast', name: 'Coast Run', start: { i: 1, j: 9 }, checkpoints: [[3, 9], [6, 9], [9, 9], [9, 6], [7, 6], [7, 8], [4, 8], [1, 8], [1, 9]] },
      { id: 'downtown', name: 'Glasswater Loop', start: { i: 3, j: 2 }, checkpoints: [[6, 2], [6, 5], [3, 5], [3, 2], [6, 2], [6, 5], [3, 5], [3, 2]] },
      { id: 'heights', name: 'Heights Dash', start: { i: 2, j: 1 }, checkpoints: [[5, 1], [9, 1], [10, 3], [10, 6], [8, 6], [8, 2], [5, 2], [2, 2], [2, 1]] },
    ],
    shards: [],
  };
  const shardSpots = [
    [2, 8, 'se'], [4, 6, 'nw'], [9, 7, 'sw'], [3, 7, 'ne'], [7, 7, 'se'], [1, 6, 'nw'],
    [4, 3, 'c'], [6, 2, 'ne'], [3, 4, 'sw'], [5, 5, 'se'],
    [8, 2, 'nw'], [9, 4, 'ne'], [7, 5, 'sw'],
    [3, 0, 'ne'], [7, 1, 'c'], [9, 0, 'se'],
    [0, 1, 'nw'], [1, 3, 'sw'], [0, 5, 'se'],
    ['pier'],
  ];
  for (const spot of shardSpots) {
    if (spot[0] === 'pier') {
      landmarks.shards.push({ x: pierX + 3, z: shoreZ + 100 });
      continue;
    }
    const bl = b(spot[0], spot[1]);
    const inset = CITY.sidewalk / 2;
    const corner = spot[2];
    const pos = corner === 'c' ? { x: bl.cx + 3, z: bl.cz + 3 }
      : { x: corner.includes('w') ? bl.x + inset : bl.x + bl.w - inset, z: corner.includes('n') ? bl.z + inset : bl.z + bl.d - inset };
    landmarks.shards.push(pos);
  }
  return landmarks;
}

/** A deterministic 0..1 per world position, for scattering props. */
export function cellNoise(x, z, salt = 0) {
  return hash2(Math.floor(x), Math.floor(z), salt);
}

export { DISTRICTS };
