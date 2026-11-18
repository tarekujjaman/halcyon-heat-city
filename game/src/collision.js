// Static collision for the city: every building, wall, post and water edge stored in a spatial hash of
// axis-aligned boxes (with a height) and circles. Resolves the circle push-out that keeps people and
// cars out of walls and the 3D raycast that stops bullets and pulls the camera in front of a building.
// Exports the StaticColliders class and the circleOverlap helper that pedestrians and cars share.

const CELL = 24;

export class StaticColliders {
  constructor() {
    this.boxes = [];
    this.circles = [];
    this.cells = new Map();
  }

  key(cx, cz) {
    return `${cx},${cz}`;
  }

  insert(item, minX, minZ, maxX, maxZ) {
    const cx1 = Math.floor(minX / CELL);
    const cz1 = Math.floor(minZ / CELL);
    const cx2 = Math.floor(maxX / CELL);
    const cz2 = Math.floor(maxZ / CELL);
    for (let cx = cx1; cx <= cx2; cx += 1) {
      for (let cz = cz1; cz <= cz2; cz += 1) {
        const k = this.key(cx, cz);
        let list = this.cells.get(k);
        if (!list) {
          list = [];
          this.cells.set(k, list);
        }
        list.push(item);
      }
    }
  }

  /** An axis-aligned box from (x1, z1) to (x2, z2), floor to height h; `tag` names what it is. */
  addBox(x1, z1, x2, z2, h = 10, tag = 'wall', data = null) {
    const box = { kind: 'box', x1: Math.min(x1, x2), z1: Math.min(z1, z2), x2: Math.max(x1, x2), z2: Math.max(z1, z2), h, tag, data };
    this.boxes.push(box);
    this.insert(box, box.x1, box.z1, box.x2, box.z2);
    return box;
  }

  addCircle(x, z, r, h = 6, tag = 'post', data = null) {
    const circle = { kind: 'circle', x, z, r, h, tag, data };
    this.circles.push(circle);
    this.insert(circle, x - r, z - r, x + r, z + r);
    return circle;
  }

  /** Every collider whose cell overlaps the circle (x, z, r). */
  query(x, z, r, out = []) {
    out.length = 0;
    const cx1 = Math.floor((x - r) / CELL);
    const cz1 = Math.floor((z - r) / CELL);
    const cx2 = Math.floor((x + r) / CELL);
    const cz2 = Math.floor((z + r) / CELL);
    for (let cx = cx1; cx <= cx2; cx += 1) {
      for (let cz = cz1; cz <= cz2; cz += 1) {
        const list = this.cells.get(this.key(cx, cz));
        if (!list) continue;
        for (const item of list) if (!out.includes(item)) out.push(item);
      }
    }
    return out;
  }

  /**
   * Push a circle out of everything it overlaps. Returns the hit normals (unit vectors pointing away
   * from the obstacle) so callers can kill velocity into the wall. `y` lets a jumping body clear low walls.
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

  /** Does the circle overlap anything (no push)? */
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
   * A 3D ray from (ox, oy, oz) along (dx, dy, dz) up to maxDist: the nearest box or post hit, or null.
   * Walks the cells the ray's 2D footprint crosses, so it is cheap even across the whole city.
   */
  raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    let best = null;
    const ex = ox + dx * maxDist;
    const ez = oz + dz * maxDist;
    const cx1 = Math.floor(Math.min(ox, ex) / CELL);
    const cz1 = Math.floor(Math.min(oz, ez) / CELL);
    const cx2 = Math.floor(Math.max(ox, ex) / CELL);
    const cz2 = Math.floor(Math.max(oz, ez) / CELL);
    const tested = new Set();
    for (let cx = cx1; cx <= cx2; cx += 1) {
      for (let cz = cz1; cz <= cz2; cz += 1) {
        const list = this.cells.get(this.key(cx, cz));
        if (!list) continue;
        for (const c of list) {
          if (tested.has(c)) continue;
          tested.add(c);
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

const scratch = [];

function rayBox(ox, oy, oz, dx, dy, dz, b) {
  let tmin = 0;
  let tmax = Infinity;
  const axes = [[ox, dx, b.x1, b.x2], [oy, dy, 0, b.h], [oz, dz, b.z1, b.z2]];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return null;
    } else {
      let t1 = (lo - o) / d;
      let t2 = (hi - o) / d;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}

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

/** Circle against circle: the overlap depth and the unit normal from b to a, or null. */
export function circleOverlap(ax, az, ar, bx, bz, br) {
  const dx = ax - bx;
  const dz = az - bz;
  const rr = ar + br;
  const d2 = dx * dx + dz * dz;
  if (d2 >= rr * rr) return null;
  const d = Math.sqrt(d2) || 1e-4;
  return { depth: rr - d, nx: dx / d, nz: dz / d };
}
