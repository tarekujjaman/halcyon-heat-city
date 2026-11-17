// Static collision for Halcyon Bay: every building, wall, post, railing and sea line of the city
// lives in this spatial hash, which pushes circles (people, the circles a car's body is made of)
// out of them, answers overlap queries for spawning, and raycasts in 3D for bullets, police sight
// lines and the camera. Exports StaticColliders and the circle-against-circle test circleOverlap.

/** Hash cell size in metres: a block is 56 m, so a body query touches one to four cells. */
const CELL = 24;
/** Cell coordinates pack into one integer key, so a lookup allocates no string in the hot loops. */
const KEY_OFFSET = 32768;
const cellKey = (cx, cz) => (cx + KEY_OFFSET) * 65536 + (cz + KEY_OFFSET);

/** Bumped once per query: a collider spanning several cells is reported once without a Set. */
let queryStamp = 0;
const scratch = [];

/**
 * Axis-aligned boxes with a height and vertical cylinders (posts) in a grid of cells. A collider
 * is {kind, h, tag, data, ...} where `tag` names what it is ('wall', 'sea', 'railing', ...), so
 * the police can see over railings and the camera knows what it hit.
 */
export class StaticColliders {
  constructor() {
    this.boxes = [];
    this.circles = [];
    this.cells = new Map();
  }

  /** The integer key of cell (cx, cz). */
  key(cx, cz) {
    return cellKey(cx, cz);
  }

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
   * An axis-aligned box from (x1, z1) to (x2, z2) in any corner order, floor to height h.
   * `tag` names what it is and `data` rides along for the caller. Returns the collider.
   */
  addBox(x1, z1, x2, z2, h = 10, tag = 'wall', data = null) {
    const box = { kind: 'box', x1: Math.min(x1, x2), z1: Math.min(z1, z2), x2: Math.max(x1, x2), z2: Math.max(z1, z2), h, tag, data, stamp: 0 };
    this.boxes.push(box);
    this.insert(box, box.x1, box.z1, box.x2, box.z2);
    return box;
  }

  /** A vertical post of radius r at (x, z), floor to height h. Returns the collider. */
  addCircle(x, z, r, h = 6, tag = 'post', data = null) {
    const circle = { kind: 'circle', x, z, r, h, tag, data, stamp: 0 };
    this.circles.push(circle);
    this.insert(circle, x - r, z - r, x + r, z + r);
    return circle;
  }

  /** Every collider whose cell overlaps the circle (x, z, r), each once, into `out` (reused). */
  query(x, z, r, out = []) {
    out.length = 0;
    queryStamp += 1;
    const cx1 = Math.floor((x - r) / CELL);
    const cz1 = Math.floor((z - r) / CELL);
    const cx2 = Math.floor((x + r) / CELL);
    const cz2 = Math.floor((z + r) / CELL);
    for (let cx = cx1; cx <= cx2; cx += 1) {
      for (let cz = cz1; cz <= cz2; cz += 1) {
        const list = this.cells.get(cellKey(cx, cz));
        if (!list) continue;
        for (const item of list) {
          if (item.stamp === queryStamp) continue;
          item.stamp = queryStamp;
          out.push(item);
        }
      }
    }
    return out;
  }

  /**
   * Push a circle `body` {x, z} of radius r out of everything it overlaps (two passes, so a corner
   * settles). Returns the hits {nx, nz, collider} with unit normals pointing away from the
   * obstacle, so callers can kill the velocity into the wall. `y` is the body's height above the
   * ground: a jumping body clears any collider lower than that.
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

  /** The first collider the circle (x, z, r) overlaps at height y (no push), or null. */
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
   * A 3D ray from (ox, oy, oz) along the unit direction (dx, dy, dz) up to maxDist: the nearest
   * box or post it hits as {t, x, y, z, collider}, or null. Tests only the colliders in the cells
   * under the ray's 2D bounding rectangle, so a shot across the whole city stays cheap.
   */
  raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    let best = null;
    const ex = ox + dx * maxDist;
    const ez = oz + dz * maxDist;
    const cx1 = Math.floor(Math.min(ox, ex) / CELL);
    const cz1 = Math.floor(Math.min(oz, ez) / CELL);
    const cx2 = Math.floor(Math.max(ox, ex) / CELL);
    const cz2 = Math.floor(Math.max(oz, ez) / CELL);
    queryStamp += 1;
    for (let cx = cx1; cx <= cx2; cx += 1) {
      for (let cz = cz1; cz <= cz2; cz += 1) {
        const list = this.cells.get(cellKey(cx, cz));
        if (!list) continue;
        for (const c of list) {
          if (c.stamp === queryStamp) continue;
          c.stamp = queryStamp;
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

// The slab test keeps its running interval in module state so it allocates nothing per axis.
let slabMin = 0;
let slabMax = Infinity;

/** Narrow [slabMin, slabMax] to the ray's overlap with lo..hi on one axis; false when empty. */
function slab(o, d, lo, hi) {
  if (Math.abs(d) < 1e-9) return o >= lo && o <= hi;
  let t1 = (lo - o) / d;
  let t2 = (hi - o) / d;
  if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
  if (t1 > slabMin) slabMin = t1;
  if (t2 < slabMax) slabMax = t2;
  return slabMin <= slabMax;
}

/** Ray against a box standing on the ground: the entry distance (0 when the origin is inside), or null. */
function rayBox(ox, oy, oz, dx, dy, dz, b) {
  slabMin = 0;
  slabMax = Infinity;
  if (!slab(ox, dx, b.x1, b.x2) || !slab(oy, dy, 0, b.h) || !slab(oz, dz, b.z1, b.z2)) return null;
  return slabMin;
}

/** Ray against a post: the distance to its side between the ground and its top, or null. */
function rayCylinder(ox, oy, oz, dx, dy, dz, c) {
  const fx = ox - c.x;
  const fz = oz - c.z;
  const a = dx * dx + dz * dz;
  if (a < 1e-9) return null;
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

/**
 * Circle a against circle b: {depth, nx, nz} with the overlap depth and the unit normal from b
 * to a, or null when they do not touch. Used for people against cars and cars against cars.
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
