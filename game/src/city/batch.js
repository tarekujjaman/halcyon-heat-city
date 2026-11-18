// The merged-geometry batch the whole city is built with: thousands of boxes, quads, cylinders and
// discs pushed into one BufferGeometry so a district, the roads or the beach draw in one call.
// Vertex colours carry each piece's tint and the UVs its texture repeat in metres. Exports MeshBatch;
// used by ground.js, roads.js, buildings.js, props.js and beach.js at start-up only.
import * as THREE from 'three';

const tmpColor = new THREE.Color();
/** Two triangles per quad, corners 0-1-2 and 0-2-3. */
const QUAD_ORDER = [0, 1, 2, 0, 2, 3];
/** One texture repeat across the quad when the caller gives no UVs. */
const QUAD_UV = [[0, 0], [1, 0], [1, 1], [0, 1]];
const TWO_PI = Math.PI * 2;

/** Accumulates triangles (positions, normals, UVs, colours) and builds one mesh from them. */
export class MeshBatch {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.uvs = [];
    this.colors = [];
    this.count = 0;
  }

  /**
   * A quad from four corners `[x, y, z]` in order (counter-clockwise seen from the normal side) with
   * one normal `n` for all of them; `uv` is four `[u, v]` pairs or null for a single repeat.
   */
  quad(a, b, c, d, n, uv, color) {
    tmpColor.set(color);
    const r = tmpColor.r;
    const g = tmpColor.g;
    const bl = tmpColor.b;
    const uvc = uv || QUAD_UV;
    for (const k of QUAD_ORDER) {
      const p = k === 0 ? a : k === 1 ? b : k === 2 ? c : d;
      this.positions.push(p[0], p[1], p[2]);
      this.normals.push(n[0], n[1], n[2]);
      this.uvs.push(uvc[k][0], uvc[k][1]);
      this.colors.push(r, g, bl);
    }
    this.count += 6;
  }

  /**
   * The four side faces of an axis-aligned box with its minimum corner at (x, y, z); `tile` is the
   * metres per texture repeat [u, v] and `uvOffset` shifts u so neighbouring facades do not line up.
   */
  boxSides(x, y, z, w, h, d, color, tile = [1, 1], uvOffset = 0) {
    const x2 = x + w;
    const y2 = y + h;
    const z2 = z + d;
    const uw = w / tile[0];
    const ud = d / tile[0];
    const vh = h / tile[1];
    const uvs = (u) => [[uvOffset, 0], [uvOffset + u, 0], [uvOffset + u, vh], [uvOffset, vh]];
    this.quad([x, y, z2], [x2, y, z2], [x2, y2, z2], [x, y2, z2], [0, 0, 1], uvs(uw), color);
    this.quad([x2, y, z], [x, y, z], [x, y2, z], [x2, y2, z], [0, 0, -1], uvs(uw), color);
    this.quad([x2, y, z2], [x2, y, z], [x2, y2, z], [x2, y2, z2], [1, 0, 0], uvs(ud), color);
    this.quad([x, y, z], [x, y, z2], [x, y2, z2], [x, y2, z], [-1, 0, 0], uvs(ud), color);
  }

  /** An upward-facing rectangle at height y covering x..x+w, z..z+d. */
  boxTop(x, y, z, w, d, color, tile = [1, 1]) {
    const uw = w / tile[0];
    const vd = d / tile[1];
    this.quad([x, y, z + d], [x + w, y, z + d], [x + w, y, z], [x, y, z], [0, 1, 0], [[0, 0], [uw, 0], [uw, vd], [0, vd]], color);
  }

  /** A downward-facing rectangle at height y (the underside of a canopy or a pier). */
  boxBottom(x, y, z, w, d, color) {
    this.quad([x, y, z], [x + w, y, z], [x + w, y, z + d], [x, y, z + d], [0, -1, 0], null, color);
  }

  /** A closed-top box with its minimum corner at (x, y, z) and no bottom face (it stands on something). */
  box(x, y, z, w, h, d, color, tile = [1, 1]) {
    this.boxSides(x, y, z, w, h, d, color, tile);
    this.boxTop(x, y + h, z, w, d, color, tile);
  }

  /** A box centred on (cx, cz) and rotated about Y by yaw: for cars parked at angles, boats, cranes. */
  rotatedBox(cx, y, cz, w, h, d, yaw, color, tile = [1, 1]) {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const P = (lx, ly, lz) => [cx + lx * c + lz * s, y + ly, cz - lx * s + lz * c];
    const hw = w / 2;
    const hd = d / 2;
    const N = (nx, nz) => [nx * c + nz * s, 0, -nx * s + nz * c];
    const uv = (u, v) => [[0, 0], [u, 0], [u, v], [0, v]];
    this.quad(P(-hw, 0, hd), P(hw, 0, hd), P(hw, h, hd), P(-hw, h, hd), N(0, 1), uv(w / tile[0], h / tile[1]), color);
    this.quad(P(hw, 0, -hd), P(-hw, 0, -hd), P(-hw, h, -hd), P(hw, h, -hd), N(0, -1), uv(w / tile[0], h / tile[1]), color);
    this.quad(P(hw, 0, hd), P(hw, 0, -hd), P(hw, h, -hd), P(hw, h, hd), N(1, 0), uv(d / tile[0], h / tile[1]), color);
    this.quad(P(-hw, 0, -hd), P(-hw, 0, hd), P(-hw, h, hd), P(-hw, h, -hd), N(-1, 0), uv(d / tile[0], h / tile[1]), color);
    this.quad(P(-hw, h, hd), P(hw, h, hd), P(hw, h, -hd), P(-hw, h, -hd), [0, 1, 0], uv(w / tile[0], d / tile[1]), color);
  }

  /**
   * A vertical cylinder of `segments` sides from y to y+h, a cone when rTop differs from rBottom,
   * with a flat cap on top unless rTop is 0. The texture wraps once around the base per `tile[0]` metres.
   */
  cylinder(cx, y, cz, rBottom, rTop, h, segments, color, tile = [1, 1]) {
    const circumference = TWO_PI * rBottom;
    const v = h / tile[1];
    for (let i = 0; i < segments; i += 1) {
      const a0 = (i / segments) * TWO_PI;
      const a1 = ((i + 1) / segments) * TWO_PI;
      const c0 = Math.cos(a0);
      const s0 = Math.sin(a0);
      const c1 = Math.cos(a1);
      const s1 = Math.sin(a1);
      const n = [Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2)];
      const u0 = (i / segments) * circumference / tile[0];
      const u1 = ((i + 1) / segments) * circumference / tile[0];
      this.quad(
        [cx + c1 * rBottom, y, cz + s1 * rBottom], [cx + c0 * rBottom, y, cz + s0 * rBottom],
        [cx + c0 * rTop, y + h, cz + s0 * rTop], [cx + c1 * rTop, y + h, cz + s1 * rTop],
        n, [[u1, 0], [u0, 0], [u0, v], [u1, v]], color,
      );
    }
    if (rTop > 0) this.disc(cx, y + h, cz, rTop, segments, color);
  }

  /** A flat disc of `segments` wedges facing up at height y. */
  disc(cx, y, cz, r, segments, color) {
    for (let i = 0; i < segments; i += 1) {
      const a0 = (i / segments) * TWO_PI;
      const a1 = ((i + 1) / segments) * TWO_PI;
      this.triangle([cx, y, cz], [cx + Math.cos(a1) * r, y, cz + Math.sin(a1) * r], [cx + Math.cos(a0) * r, y, cz + Math.sin(a0) * r], [0, 1, 0], color);
    }
  }

  /** One triangle a-b-c with a single normal; its UVs are all (0, 0), so it takes the texture's corner colour. */
  triangle(a, b, c, n, color) {
    tmpColor.set(color);
    const r = tmpColor.r;
    const g = tmpColor.g;
    const bl = tmpColor.b;
    for (let k = 0; k < 3; k += 1) {
      const p = k === 0 ? a : k === 1 ? b : c;
      this.positions.push(p[0], p[1], p[2]);
      this.normals.push(n[0], n[1], n[2]);
      this.uvs.push(0, 0);
      this.colors.push(r, g, bl);
    }
    this.count += 3;
  }

  /** A flat horizontal quad at height y (ground tiles, markings, water edges). */
  floor(x, z, w, d, y, color, tile = [1, 1]) {
    this.boxTop(x, y, z, w, d, color, tile);
  }

  /** A flat quad rotated about Y, centred on (cx, cz): lane dashes and crosswalk stripes at any angle. */
  rotatedFloor(cx, y, cz, w, d, yaw, color) {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const P = (lx, lz) => [cx + lx * c + lz * s, y, cz - lx * s + lz * c];
    const hw = w / 2;
    const hd = d / 2;
    this.quad(P(-hw, hd), P(hw, hd), P(hw, -hd), P(-hw, -hd), [0, 1, 0], null, color);
  }

  /** True until the first piece is added; callers skip building (and drawing) an empty batch. */
  isEmpty() {
    return this.count === 0;
  }

  /**
   * Everything pushed so far as one static mesh (its matrix never updates, so place it at the origin).
   * An empty batch still builds a valid mesh with an empty bounding sphere rather than a NaN one.
   */
  build(material, { castShadow = true, receiveShadow = true } = {}) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    if (this.count > 0) geometry.computeBoundingSphere();
    else geometry.boundingSphere = new THREE.Sphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    mesh.matrixAutoUpdate = false;
    return mesh;
  }
}
