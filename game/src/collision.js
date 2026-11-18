// Static collision for Halcyon Bay: every building, wall, post, railing and water line is an
// axis-aligned box or a vertical post in a spatial hash of 24 m cells. Exports StaticColliders
// (circle push-out for people and cars, the overlap test, the 3D raycast for bullets and the
// camera) and circleOverlap, the circle test the vehicle and pedestrian code shares. No three.js.

const CELL = 24;
/** Cell coordinates are shifted into the positive range and packed into one integer map key. */
const KEY_OFFSET = 4096;
const KEY_STRIDE = 2 * KEY_OFFSET;
const EPSILON = 1e-9;

function cellKey(cx, cz) {
  return (cx + KEY_OFFSET) * KEY_STRIDE + (cz + KEY_OFFSET);
}

/** Bumped per query; a collider carrying the current stamp was already listed. */
let queryStamp = 0;
/** Candidate list reused by resolveCircle and overlaps (never handed out). */
const scratch = [];
/** The running [tmin, tmax] of the slab test, so a raycast allocates nothing per box. */
const slabT = new Float64Array(2);

/** The static world: boxes `{kind:'box', x1, z1, x2, z2, h, tag}` and posts `{kind:'circle', x, z, r, h, tag}` in a spatial hash, immutable once added. */
export class StaticColliders {
  constructor() {
    this.boxes = [];
    this.circles = [];
    this.cells = new Map();
  }

  /** Register `item` in every cell its footprint touches. */
  insert(item, minX, minZ, maxX, maxZ) {
    const cx1 = Math.floor(minX / CELL);
    const cz1 = Math.floor(minZ / CELL);
    const cx2 = Math.floor(maxX / CELL);
    const cz2 = Math.floor(maxZ / CELL);
    for (let cx = cx1; cx <= cx2; cx += 1) {
      for (let cz = cz1; cz <= cz2; cz += 1) {
        const k = cellKey(cx, cz);
        let list = this.cells.get(k);
        if (!list) {
          list = [];
          this.cells.set(k, list);
        }
        list.push(item);
      }
    }
  }

  /**
   * An axis-aligned box from (x1, z1) to (x2, z2) (any corner order), floor to height `h`: a body
   * whose `y` is above `h` passes over it. `tag` names what it is ('wall', 'sea', 'railing', ...).
   */
  addBox(x1, z1, x2, z2, h = 10, tag = 'wall', data = null) {
    const box = { kind: 'box', x1: Math.min(x1, x2), z1: Math.min(z1, z2), x2: Math.max(x1, x2), z2: Math.max(z1, z2), h, tag, data, stamp: 0 };
    this.boxes.push(box);
    this.insert(box, box.x1, box.z1, box.x2, box.z2);
    return box;
  }

  /** A vertical post of radius `r` and height `h` at (x, z): lamp posts, palms, bollards, umbrellas. */
  addCircle(x, z, r, h = 6, tag = 'post', data = null) {
    const circle = { kind: 'circle', x, z, r, h, tag, data, stamp: 0 };
    this.circles.push(circle);
    this.insert(circle, x - r, z - r, x + r, z + r);
    return circle;
  }

  /** Every collider whose cell overlaps the circle (x, z, r), each once, into `out` (cleared first). */
  query(x, z, r, out = []) {
    out.length = 0;
    queryStamp += 1;
    const stamp = queryStamp;
    const cx1 = Math.floor((x - r) / CELL);
    const cz1 = Math.floor((z - r) / CELL);
    const cx2 = Math.floor((x + r) / CELL);
    const cz2 = Math.floor((z + r) / CELL);
    for (let cx = cx1; cx <= cx2; cx += 1) {
      for (let cz = cz1; cz <= cz2; cz += 1) {
        const list = this.cells.get(cellKey(cx, cz));
        if (!list) continue;
        for (const item of list) {
          if (item.stamp === stamp) continue;
          item.stamp = stamp;
          out.push(item);
        }
      }
    }
    return out;
  }

  /**
   * Push a circle `body` ({x, z}, moved in place) of radius `r` out of everything it overlaps (two
   * passes so a corner settles). Fills `out` with `{nx, nz, collider}` per contact, the unit normal
   * pointing away from the obstacle; `y` is the body's height, so a jumper clears low walls.
   */
  resolveCircle(body, r, y = 0, out = []) {
    out.length = 0;
    const candidates = this.query(body.x, body.z, r, scratch);
    for (let pass = 0; pass < 2; pass += 1) {
      for (const c of candidates) {
        if (y > c.h) continue;
        if (c.kind === 'box') {
          const nx = Math.max(c.x1, Math.min(body.x, c.x2));
          const nz = Math.max(c.z1, Math.min(body.z, c.z2));
          let dx = body.x - nx;
          let dz = body.z - nz;
          const d2 = dx * dx + dz * dz;
          if (d2 >= r * r) continue;
          if (d2 < 1e-8) {
            // Centre inside the box: leave by the nearest face.
            const left = body.x - c.x1;
            const right = c.x2 - body.x;
            const top = body.z - c.z1;
            const bottom = c.z2 - body.z;
            const m = Math.min(left, right, top, bottom);
            if (m === left) { body.x = c.x1 - r; dx = -1; dz = 0; } else if (m === right) { body.x = c.x2 + r; dx = 1; dz = 0; } else if (m === top) { body.z = c.z1 - r; dx = 0; dz = -1; } else { body.z = c.z2 + r; dx = 0; dz = 1; }
            out.push({ nx: dx, nz: dz, collider: c });
            continue;
          }
          const d = Math.sqrt(d2);
          const push = r - d;
          dx /= d;
          dz /= d;
          body.x += dx * push;
          body.z += dz * push;
          out.push({ nx: dx, nz: dz, collider: c });
        } else {
          let dx = body.x - c.x;
          let dz = body.z - c.z;
          const rr = r + c.r;
          const d2 = dx * dx + dz * dz;
          if (d2 >= rr * rr) continue;
          const d = Math.sqrt(d2) || 1e-4;
          dx /= d;
          dz /= d;
          body.x = c.x + dx * rr;
          body.z = c.z + dz * rr;
          out.push({ nx: dx, nz: dz, collider: c });
        }
      }
    }
    return out;
  }

  /** The first collider the circle (x, z, r) at height `y` overlaps, or null. Nothing is moved. */
  overlaps(x, z, r, y = 0) {
    const candidates = this.query(x, z, r, scratch);
    for (const c of candidates) {
      if (y > c.h) continue;
      if (c.kind === 'box') {
        const nx = Math.max(c.x1, Math.min(x, c.x2));
        const nz = Math.max(c.z1, Math.min(z, c.z2));
        if ((x - nx) ** 2 + (z - nz) ** 2 < r * r) return c;
      } else if ((x - c.x) ** 2 + (z - c.z) ** 2 < (r + c.r) ** 2) return c;
    }
    return null;
  }

  /**
   * A 3D ray from (ox, oy, oz) along the unit (dx, dy, dz) up to `maxDist`: the nearest box or post
   * as `{t, collider, x, y, z}`, or null. Only cells under the ray's 2D bounding rectangle are visited.
   */
  raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    let best = null;
    queryStamp += 1;
    const stamp = queryStamp;
    const ex = ox + dx * maxDist;
    const ez = oz + dz * maxDist;
    const cx1 = Math.floor(Math.min(ox, ex) / CELL);
    const cz1 = Math.floor(Math.min(oz, ez) / CELL);
    const cx2 = Math.floor(Math.max(ox, ex) / CELL);
    const cz2 = Math.floor(Math.max(oz, ez) / CELL);
    for (let cx = cx1; cx <= cx2; cx += 1) {
      for (let cz = cz1; cz <= cz2; cz += 1) {
        const list = this.cells.get(cellKey(cx, cz));
        if (!list) continue;
        for (const c of list) {
          if (c.stamp === stamp) continue;
          c.stamp = stamp;
          const t = c.kind === 'box' ? rayBox(ox, oy, oz, dx, dy, dz, c) : rayCylinder(ox, oy, oz, dx, dy, dz, c);
          if (t !== null && t >= 0 && t <= maxDist && (best === null || t < best.t)) best = { t, collider: c };
        }
      }
    }
    if (best) {
      best.x = ox + dx * best.t;
      best.y = oy + dy * best.t;
      best.z = oz + dz * best.t;
    }
    return best;
  }
}

/**
 * Circle a against circle b: `{depth, nx, nz}` with the overlap depth and the unit normal from b
 * toward a (pushing a by depth along it separates them), or null when they do not touch.
 */
export function circleOverlap(ax, az, ar, bx, bz, br) {
  const dx = ax - bx;
  const dz = az - bz;
  const rr = ar + br;
  const d2 = dx * dx + dz * dz;
  if (d2 >= rr * rr) return null;
  const d = Math.sqrt(d2) || 1e-4;
  return { depth: rr - d, nx: dx / d, nz: dz / d };
}

/** Narrow slabT to the ray's overlap with the slab lo..hi on one axis; false when the ray misses it. */
function slab(o, d, lo, hi) {
  if (Math.abs(d) < EPSILON) return o >= lo && o <= hi;
  let t1 = (lo - o) / d;
  let t2 = (hi - o) / d;
  if (t1 > t2) {
    const t = t1;
    t1 = t2;
    t2 = t;
  }
  if (t1 > slabT[0]) slabT[0] = t1;
  if (t2 < slabT[1]) slabT[1] = t2;
  return slabT[0] <= slabT[1];
}

/** Ray against a box standing on the ground: the entry distance (0 when the origin is inside), or null. */
function rayBox(ox, oy, oz, dx, dy, dz, b) {
  slabT[0] = 0;
  slabT[1] = Infinity;
  if (!slab(ox, dx, b.x1, b.x2) || !slab(oy, dy, 0, b.h) || !slab(oz, dz, b.z1, b.z2)) return null;
  return slabT[0];
}

/** Ray against a vertical post from the ground to its height: the entry distance, or null. */
function rayCylinder(ox, oy, oz, dx, dy, dz, c) {
  const fx = ox - c.x;
  const fz = oz - c.z;
  const a = dx * dx + dz * dz;
  if (a < EPSILON) return null;
  const bq = 2 * (fx * dx + fz * dz);
  const cq = fx * fx + fz * fz - c.r * c.r;
  const disc = bq * bq - 4 * a * cq;
  if (disc < 0) return null;
  const t = (-bq - Math.sqrt(disc)) / (2 * a);
  if (t < 0) return null;
  const y = oy + dy * t;
  if (y < 0 || y > c.h) return null;
  return t;
}
