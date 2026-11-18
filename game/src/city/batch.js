// Merged-geometry batching for the city builders: thousands of quads, floors, boxes and cylinders are
// pushed into one BufferGeometry so a whole district draws in a single call. Vertex colours carry each
// piece's tint and the UVs its texture repeat. Exports the MeshBatch class that ground, roads,
// buildings, props and beach fill and then turn into a mesh.
import * as THREE from 'three';

const tmpColor = new THREE.Color();

export class MeshBatch {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.uvs = [];
    this.colors = [];
    this.count = 0;
  }

  /** A quad from four corners in order (counter-clockwise seen from the normal side). */
  quad(a, b, c, d, n, uv, color) {
    tmpColor.set(color);
    const r = tmpColor.r;
    const g = tmpColor.g;
    const bl = tmpColor.b;
    const corners = [a, b, c, d];
    const uvc = uv || [[0, 0], [1, 0], [1, 1], [0, 1]];
    const order = [0, 1, 2, 0, 2, 3];
    for (const k of order) {
      const p = corners[k];
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

  boxTop(x, y, z, w, d, color, tile = [1, 1]) {
    const uw = w / tile[0];
    const vd = d / tile[1];
    this.quad([x, y, z + d], [x + w, y, z + d], [x + w, y, z], [x, y, z], [0, 1, 0], [[0, 0], [uw, 0], [uw, vd], [0, vd]], color);
  }

  boxBottom(x, y, z, w, d, color) {
    this.quad([x, y, z], [x + w, y, z], [x + w, y, z + d], [x, y, z + d], [0, -1, 0], null, color);
  }

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

  /** A vertical cylinder (or cone when rTop differs) of `segments` sides. */
  cylinder(cx, y, cz, rBottom, rTop, h, segments, color, tile = [1, 1]) {
    for (let i = 0; i < segments; i += 1) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      const c0 = Math.cos(a0);
      const s0 = Math.sin(a0);
      const c1 = Math.cos(a1);
      const s1 = Math.sin(a1);
      const n = [Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2)];
      const u0 = (i / segments) * (Math.PI * 2 * rBottom) / tile[0];
      const u1 = ((i + 1) / segments) * (Math.PI * 2 * rBottom) / tile[0];
      const v = h / tile[1];
      this.quad(
        [cx + c1 * rBottom, y, cz + s1 * rBottom], [cx + c0 * rBottom, y, cz + s0 * rBottom],
        [cx + c0 * rTop, y + h, cz + s0 * rTop], [cx + c1 * rTop, y + h, cz + s1 * rTop],
        n, [[u1, 0], [u0, 0], [u0, v], [u1, v]], color,
      );
    }
    if (rTop > 0) {
      for (let i = 0; i < segments; i += 1) {
        const a0 = (i / segments) * Math.PI * 2;
        const a1 = ((i + 1) / segments) * Math.PI * 2;
        this.triangle([cx, y + h, cz], [cx + Math.cos(a1) * rTop, y + h, cz + Math.sin(a1) * rTop], [cx + Math.cos(a0) * rTop, y + h, cz + Math.sin(a0) * rTop], [0, 1, 0], color);
      }
    }
  }

  /** A flat disc facing up. */
  disc(cx, y, cz, r, segments, color) {
    for (let i = 0; i < segments; i += 1) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      this.triangle([cx, y, cz], [cx + Math.cos(a1) * r, y, cz + Math.sin(a1) * r], [cx + Math.cos(a0) * r, y, cz + Math.sin(a0) * r], [0, 1, 0], color);
    }
  }

  triangle(a, b, c, n, color) {
    tmpColor.set(color);
    for (const p of [a, b, c]) {
      this.positions.push(p[0], p[1], p[2]);
      this.normals.push(n[0], n[1], n[2]);
      this.uvs.push(0, 0);
      this.colors.push(tmpColor.r, tmpColor.g, tmpColor.b);
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

  isEmpty() {
    return this.count === 0;
  }

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
