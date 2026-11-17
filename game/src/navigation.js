// The road network as a graph for every AI driver: the intersections of the street plan plus
// the causeway's dead end at Pelican Key, neighbours by compass direction, lane points on each
// approach and exit, turn options, a breadth-first route between two nodes that police and
// mission cars follow, and random lane spots to spawn traffic out of sight. Exports the compass
// helpers (DIRS, OPPOSITE, dirVec, rightVec, yawOfDir, dirOfYaw, laneOffset) and createNavigation(layout).
import { CITY } from './config.js';

/** Compass directions of travel; +x is east and +z is south, as the street plan lays them. */
export const DIRS = ['n', 'e', 's', 'w'];
const VEC = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
const RIGHT = { n: [1, 0], s: [-1, 0], e: [0, 1], w: [0, -1] };
export const OPPOSITE = { n: 's', s: 'n', e: 'w', w: 'e' };
const LEFT_OF = { n: 'w', w: 's', s: 'e', e: 'n' };
const RIGHT_OF = { n: 'e', e: 's', s: 'w', w: 'n' };

/** The unit [x, z] of travel direction d. */
export function dirVec(d) {
  return VEC[d];
}

/** The unit [x, z] pointing to the right of a driver travelling d (where the lanes are). */
export function rightVec(d) {
  return RIGHT[d];
}

/** The yaw a vehicle faces when travelling d (yaw 0 faces +z, south). */
export function yawOfDir(d) {
  return d === 's' ? 0 : d === 'e' ? Math.PI / 2 : d === 'n' ? Math.PI : -Math.PI / 2;
}

/** The compass direction nearest a yaw. */
export function dirOfYaw(yaw) {
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  if (Math.abs(fx) > Math.abs(fz)) return fx > 0 ? 'e' : 'w';
  return fz > 0 ? 's' : 'n';
}

/** Metres from the road's centre line to the middle of lane 0 (kerb side) or lane 1 (fast lane). */
export function laneOffset(lane) {
  return CITY.laneWidth / 2 + lane * CITY.laneWidth;
}

/**
 * The navigation graph over `layout`'s intersections: {keyNode, node, neighbor, turnOptions,
 * lanePoint, stopPoint, exitPoint, route, locate, nearestNode, randomLaneSpot, stopDistance,
 * half, leftOf, rightOf}. Nodes are the layout's own intersection objects {i, j, x, z, phase}
 * plus keyNode, the turning loop on Pelican Key (i = -1) reached only from the west end of Ocean Drive.
 */
export function createNavigation(layout) {
  const half = CITY.road / 2;
  const keyNode = { i: -1, j: CITY.blocksZ, x: layout.causewayX2 - 6, z: layout.oceanZ, key: true, phase: 0 };

  /** The node at grid (i, j), the key node for (-1, blocksZ), or null off the grid. */
  function node(i, j) {
    if (i === -1 && j === CITY.blocksZ) return keyNode;
    return layout.intersectionAt(i, j);
  }

  /** The node reached by leaving n in direction d, or null at the edge of the map. */
  function neighbor(n, d) {
    if (n.key) return d === 'e' ? node(0, CITY.blocksZ) : null;
    if (n.i === 0 && n.j === CITY.blocksZ && d === 'w') return keyNode;
    const v = VEC[d];
    return node(n.i + v[0], n.j + v[1]);
  }

  /** The directions a driver can leave `n` by when it arrived travelling `d`. */
  function turnOptions(n, d) {
    const out = [];
    for (const nd of DIRS) {
      if (nd === OPPOSITE[d] && !n.key) continue;
      if (neighbor(n, nd)) out.push(nd);
    }
    if (out.length === 0) out.push(OPPOSITE[d]);
    return out;
  }

  /** A point on lane `lane` for travel direction `d`, `along` metres from the node centre (negative before it). */
  function lanePoint(n, d, lane, along) {
    const v = VEC[d];
    const r = RIGHT[d];
    const off = laneOffset(lane);
    return { x: n.x + v[0] * along + r[0] * off, z: n.z + v[1] * along + r[1] * off };
  }

  /** How far before a node's centre a car stops for its light: the kerb line plus a little. */
  const stopDistance = half + 3.2;

  /** Where a car travelling d on `lane` waits at node n. */
  function stopPoint(n, d, lane) {
    return lanePoint(n, d, lane, -stopDistance);
  }

  /** Where a car leaving node n in direction d on `lane` is clear of the box. */
  function exitPoint(n, d, lane) {
    return lanePoint(n, d, lane, half + 2);
  }

  /**
   * Breadth-first route from node a to node b: the list of directions to drive, [] when they are
   * the same node, null when either is missing or b cannot be reached.
   */
  function route(a, b) {
    if (!a || !b) return null;
    if (a === b) return [];
    // Nodes are singletons, so they key the visited map directly.
    const prev = new Map();
    const queue = [a];
    prev.set(a, null);
    for (let head = 0; head < queue.length; head += 1) {
      const n = queue[head];
      if (n === b) break;
      for (const d of DIRS) {
        const m = neighbor(n, d);
        if (!m || prev.has(m)) continue;
        prev.set(m, { from: n, d });
        queue.push(m);
      }
    }
    if (!prev.has(b)) return null;
    const dirs = [];
    let cur = b;
    while (prev.get(cur)) {
      const p = prev.get(cur);
      dirs.unshift(p.d);
      cur = p.from;
    }
    return dirs;
  }

  /** The nearest node and the direction of travel implied by a position and yaw. */
  function locate(x, z, yaw) {
    const n = nearestNode(x, z);
    return { node: n, dir: dirOfYaw(yaw) };
  }

  /** The nearest node to (x, z), the key node or Ocean Drive's west end when on the causeway. */
  function nearestNode(x, z) {
    if (x < layout.causewayX1 - half && Math.abs(z - layout.oceanZ) < half + 2) {
      return x < (layout.causewayX1 + layout.causewayX2) / 2 ? keyNode : node(0, CITY.blocksZ);
    }
    return layout.nearestIntersection(x, z);
  }

  /**
   * A random road position near (x, z) at roughly `dist` metres, with the lane heading: used to
   * spawn traffic and police out of sight. Returns {x, z, yaw, node, dir, lane} or null.
   */
  function randomLaneSpot(rng, x, z, minDist, maxDist, tries = 12) {
    for (let t = 0; t < tries; t += 1) {
      const a = rng.next() * Math.PI * 2;
      const r = minDist + rng.next() * (maxDist - minDist);
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      const n = layout.nearestIntersection(px, pz);
      if (!n) continue;
      const d = rng.pick(DIRS);
      const m = neighbor(n, d);
      if (!m || m.key) continue;
      const lane = rng.int(0, 1);
      // Somewhere along the segment from n toward m.
      const along = 12 + rng.next() * (CITY.pitch - 24);
      const v = VEC[d];
      const rt = RIGHT[d];
      const off = laneOffset(lane);
      const sx = n.x + v[0] * along + rt[0] * off;
      const sz = n.z + v[1] * along + rt[1] * off;
      if (Math.hypot(sx - x, sz - z) < minDist * 0.8) continue;
      return { x: sx, z: sz, yaw: yawOfDir(d), node: m, dir: d, lane };
    }
    return null;
  }

  return {
    keyNode, node, neighbor, turnOptions, lanePoint, stopPoint, exitPoint, route, locate, nearestNode, randomLaneSpot,
    stopDistance, half, leftOf: (d) => LEFT_OF[d], rightOf: (d) => RIGHT_OF[d],
  };
}
