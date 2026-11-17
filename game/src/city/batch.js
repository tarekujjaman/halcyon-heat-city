// A merged-geometry batch for the city builders: thousands of quads, boxes, cylinders and discs
// pushed into one BufferGeometry so a whole district draws in a single call. Vertex colours carry
// each piece's tint and the UVs its texture repeat. Exports the MeshBatch class.
import * as THREE from 'three';

const tmpColor = new THREE.Color();
const TAU = Math.PI * 2;
const DEFAULT_UV = [[0, 0], [1, 0], [1, 1], [0, 1]];
/** Two triangles per quad, corners a b c d counter-clockwise. */
const QUAD_ORDER = [0, 1, 2, 0, 2, 3];

/** Flat arrays of vertex data that `build()` turns into one mesh. `count` is the vertex count so far. */
export class MeshBatch {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.uvs = [];
    this.colors = [];
    this.count = 0;
  }

  /**
   * A quad from four corners [x, y, z] in order (counter-clockwise seen from the normal side),
   * one normal `n` for all four, optional UVs per corner (default 0..1) and a CSS colour.
   */
  quad(a, b, c, d, n, uv, color) {
    tmpColor.set(color);
    const r = tmpColor.r;
    const g = tmpColor.g;
    const bl = tmpColor.b;
    const uvc = uv || DEFAULT_UV;
    for (let i = 0; i < 6; i += 1) {
      const k = QUAD_ORDER[i];
      const p = k === 0 ? a : k === 1 ? b : k === 2 ? c : d;
      this.positions.push(p[0], p[1], p[2]);
      this.normals.push(n[0], n[1], n[2]);
      this.uvs.push(uvc[k][0], uvc[k][1]);
      this.colors.push(r, g, bl);
    }
    this.count += 6;
  }

  /** The four side faces of an axis-aligned box; `tile` is metres per texture repeat [u, v]. */
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

  /** The top face of a box at height y, w by d from (x, z), facing up. */
  boxTop(x, y, z, w, d, color, tile = [1, 1]) {
    const uw = w / tile[0];
    const vd = d / tile[1];
    this.quad([x, y, z + d], [x + w, y, z + d], [x + w, y, z], [x, y, z], [0, 1, 0], [[0, 0], [uw, 0], [uw, vd], [0, vd]], color);
  }

  /** The underside of a box at height y, facing down (awnings, bridge decks seen from below). */
  boxBottom(x, y, z, w, d, color) {
    this.quad([x, y, z], [x + w, y, z], [x + w, y, z + d], [x, y, z + d], [0, -1, 0], null, color);
  }

  /** An axis-aligned box with its four sides and top (no bottom: it stands on something). */
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
   * A vertical cylinder (a cone when rTop differs, a spire when it is 0) of `segments` sides
   * standing on y, capped on top when rTop > 0. The sides are textured around the base circumference.
   */
  cylinder(cx, y, cz, rBottom, rTop, h, segments, color, tile = [1, 1]) {
    const v = h / tile[1];
    const circumference = TAU * rBottom;
    for (let i = 0; i < segments; i += 1) {
      const a0 = (i / segments) * TAU;
      const a1 = ((i + 1) / segments) * TAU;
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

  /** A flat disc of radius r facing up at height y. */
  disc(cx, y, cz, r, segments, color) {
    for (let i = 0; i < segments; i += 1) {
      const a0 = (i / segments) * TAU;
      const a1 = ((i + 1) / segments) * TAU;
      this.triangle([cx, y, cz], [cx + Math.cos(a1) * r, y, cz + Math.sin(a1) * r], [cx + Math.cos(a0) * r, y, cz + Math.sin(a0) * r], [0, 1, 0], color);
    }
  }

  /** One triangle a b c with normal n and a flat colour (UV 0, 0). */
  triangle(a, b, c, n, color) {
    tmpColor.set(color);
    const r = tmpColor.r;
    const g = tmpColor.g;
    const bl = tmpColor.b;
    for (let i = 0; i < 3; i += 1) {
      const p = i === 0 ? a : i === 1 ? b : c;
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

  /** True when nothing has been added: callers skip the mesh rather than draw an empty one. */
  isEmpty() {
    return this.count === 0;
  }

  /** One static mesh of everything pushed so far, with its bounding sphere, under `material`. */
  build(material, { castShadow = true, receiveShadow = true } = {}) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    mesh.matrixAutoUpdate = false;
    return mesh;
  }
}
