// The circular minimap: a pre-painted map of the whole city (districts, roads, water, beach,
// causeway, pier) rotated with the camera, with blips for missions, objectives, police units,
// the search circle, shops, safehouses, races, taxi fares, checkpoints, the waypoint and Sol.
import { CITY } from '../config.js';
import { DISTRICTS } from '../city/layout.js';

export const MAP_SCALE = 1.5;

/** The whole city painted once at MAP_SCALE px per metre. Returns {canvas, toMap(x, z)}. */
export function buildMapImage(layout) {
  const pad = 60;
  const minX = layout.causewayX2 - 70;
  const minZ = layout.roadZ(0) - pad;
  const maxX = CITY.x0 + CITY.width + pad;
  const maxZ = layout.shoreZ + 130;
  const w = Math.ceil((maxX - minX) * MAP_SCALE);
  const h = Math.ceil((maxZ - minZ) * MAP_SCALE);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const X = (x) => (x - minX) * MAP_SCALE;
  const Z = (z) => (z - minZ) * MAP_SCALE;
  ctx.fillStyle = '#2d7fb3';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#b9b19c';
  ctx.fillRect(X(layout.quayX), Z(minZ), X(maxX) - X(layout.quayX), Z(layout.boardwalkZ) - Z(minZ));
  ctx.fillStyle = '#8fb573';
  ctx.fillRect(X(layout.quayX), Z(minZ), X(maxX) - X(layout.quayX), Z(layout.roadZ(0) - CITY.road / 2) - Z(minZ));
  ctx.fillRect(X(CITY.x0 + CITY.width), Z(minZ), X(maxX) - X(CITY.x0 + CITY.width), Z(layout.boardwalkZ) - Z(minZ));
  ctx.fillStyle = '#efd9a8';
  ctx.fillRect(X(CITY.x0), Z(layout.boardwalkZ), X(CITY.x0 + CITY.width + pad) - X(CITY.x0), Z(layout.shoreZ) - Z(layout.boardwalkZ));
  ctx.fillStyle = '#c9a06a';
  ctx.fillRect(X(CITY.x0), Z(layout.boardwalkZ), X(CITY.x0 + CITY.width) - X(CITY.x0), Z(layout.sandZ) - Z(layout.boardwalkZ));
  for (const b of layout.blocks) {
    ctx.fillStyle = DISTRICTS[b.district].mapColor;
    ctx.fillRect(X(b.x), Z(b.z), b.w * MAP_SCALE, b.d * MAP_SCALE);
    if (b.special === 'plaza' || b.special === 'park') {
      ctx.fillStyle = b.special === 'park' ? '#7fb86a' : '#e8e0cf';
      ctx.fillRect(X(b.x + 4), Z(b.z + 4), (b.w - 8) * MAP_SCALE, (b.d - 8) * MAP_SCALE);
    }
    for (const lot of b.lots) {
      if (lot.h <= 0) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.13)';
      ctx.fillRect(X(lot.x), Z(lot.z), lot.w * MAP_SCALE, lot.d * MAP_SCALE);
    }
  }
  ctx.fillStyle = '#4a4d55';
  const half = CITY.road / 2;
  for (const r of layout.roads) {
    if (r.axis === 'x') ctx.fillRect(X(r.x1 - half), Z(r.z - half), (r.x2 - r.x1 + CITY.road) * MAP_SCALE, CITY.road * MAP_SCALE);
    else ctx.fillRect(X(r.x - half), Z(r.z1 - half), CITY.road * MAP_SCALE, (r.z2 - r.z1 + CITY.road) * MAP_SCALE);
  }
  ctx.fillStyle = '#b9b19c';
  ctx.beginPath();
  ctx.arc(X(layout.key.x), Z(layout.key.z), layout.key.r * MAP_SCALE, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#4a4d55';
  ctx.fillRect(X(layout.causewayX2 - 8), Z(layout.oceanZ - half), (layout.causewayX1 - layout.causewayX2 + 8) * MAP_SCALE, CITY.road * MAP_SCALE);
  ctx.fillStyle = '#a9a59c';
  ctx.fillRect(X(layout.quayX), Z(layout.roadZ(0) - half), (CITY.x0 - layout.quayX) * MAP_SCALE, (layout.oceanZ - layout.roadZ(0)) * MAP_SCALE);
  ctx.fillStyle = '#b08858';
  const pier = layout.landmarks;
  ctx.fillRect(X(pier.pier.x - 5.5), Z(pier.pierStart.z), 11 * MAP_SCALE, (pier.pierEnd.z - pier.pierStart.z) * MAP_SCALE);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  for (const r of layout.roads) {
    ctx.beginPath();
    if (r.axis === 'x') { ctx.moveTo(X(r.x1), Z(r.z)); ctx.lineTo(X(r.x2), Z(r.z)); } else { ctx.moveTo(X(r.x), Z(r.z1)); ctx.lineTo(X(r.x), Z(r.z2)); }
    ctx.stroke();
  }
  return { canvas: c, minX, minZ, maxX, maxZ, toMap: (x, z) => [X(x), Z(z)], scale: MAP_SCALE };
}

const BLIP_COLORS = { mission: '#ffd43b', objective: '#ffd43b', checkpoint: '#ffd166', shop: '#37f3ff', safehouse: '#8bff6b', race: '#ff6ad5', taxi: '#ffd43b', waypoint: '#c56bff' };
const BLIP_SHAPES = { mission: 'diamond', objective: 'dot', checkpoint: 'dot', shop: 'square', safehouse: 'house', race: 'diamond', taxi: 'square' };

export function createMinimap(G, canvas) {
  const ctx = canvas.getContext('2d');
  const map = buildMapImage(G.world.layout);
  const size = canvas.width;
  const R = size / 2;
  const CY = R + 18;
  const zoom = 0.62; // screen px per map px: about 260 m across the dial
  let pulse = 0;
  let rot = 0;
  let px = 0;
  let pz = 0;

  /** World to minimap pixels, rotated so the camera's forward points up. */
  function toScreen(x, z) {
    const [mx, mz] = map.toMap(x, z);
    const dx = (mx - px) * zoom;
    const dz = (mz - pz) * zoom;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    return [R + dx * c - dz * s, CY + dx * s + dz * c];
  }

  function shape(sx, sy, r, kind) {
    ctx.beginPath();
    if (kind === 'dot') ctx.arc(sx, sy, r, 0, Math.PI * 2);
    else if (kind === 'square') ctx.rect(sx - r, sy - r, r * 2, r * 2);
    else if (kind === 'diamond') { ctx.moveTo(sx, sy - r * 1.35); ctx.lineTo(sx + r * 1.35, sy); ctx.lineTo(sx, sy + r * 1.35); ctx.lineTo(sx - r * 1.35, sy); ctx.closePath(); }
    else if (kind === 'house') { ctx.moveTo(sx - r, sy + r); ctx.lineTo(sx - r, sy); ctx.lineTo(sx, sy - r); ctx.lineTo(sx + r, sy); ctx.lineTo(sx + r, sy + r); ctx.closePath(); }
  }

  /** A blip clamped to the dial's edge when it is out of range, so far objectives still point the way. */
  function blip(x, z, color, r, kind = 'dot', clamp = false, text = '') {
    let [sx, sy] = toScreen(x, z);
    const dx = sx - R;
    const dy = sy - CY;
    const d = Math.hypot(dx, dy);
    const limit = R - 12;
    if (d > limit) {
      if (!clamp) return;
      sx = R + (dx / d) * limit;
      sy = CY + (dy / d) * limit;
    }
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.lineWidth = 2;
    shape(sx, sy, r, kind);
    ctx.fill();
    ctx.stroke();
    if (text) {
      ctx.fillStyle = '#111';
      ctx.font = 'bold 10px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(text, sx, sy + 3.5);
    }
  }

  return {
    map,
    update(dt) {
      pulse += dt;
      const p = G.player;
      const yaw = G.camera.yaw;
      rot = -Math.PI / 2 - Math.atan2(Math.cos(yaw), Math.sin(yaw));
      [px, pz] = map.toMap(p.x, p.z);
      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.beginPath();
      ctx.arc(R, R, R - 3, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = '#1b3a52';
      ctx.fillRect(0, 0, size, size);
      ctx.save();
      ctx.translate(R, CY);
      ctx.rotate(rot);
      ctx.scale(zoom, zoom);
      ctx.translate(-px, -pz);
      ctx.drawImage(map.canvas, 0, 0);
      ctx.restore();
      // Search circle.
      const w = G.wanted;
      if (w.stars > 0 && w.search.r > 1) {
        const [sx, sy] = toScreen(w.search.x, w.search.z);
        ctx.beginPath();
        ctx.arc(sx, sy, w.search.r * map.scale * zoom, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,40,40,0.18)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,70,70,0.95)';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      for (const m of G.markers.list) {
        if (!m.blip || m.hidden) continue;
        const important = m.kind === 'mission' || m.kind === 'objective' || m.kind === 'checkpoint' || m.kind === 'taxi';
        blip(m.x, m.z, BLIP_COLORS[m.kind] || m.color, important ? 7 : 5, BLIP_SHAPES[m.kind] || 'dot', important, m.kind === 'mission' ? 'M' : m.kind === 'shop' ? 'P' : m.kind === 'safehouse' ? 'S' : '');
      }
      const wp = G.hud.state.waypoint;
      if (wp) blip(wp.x, wp.z, wp.kind === 'waypoint' ? '#c56bff' : '#ffd43b', 7 + Math.sin(pulse * 6) * 1.5, 'diamond', true);
      const flash = Math.sin(pulse * 10) > 0;
      for (const v of G.police.cruisers) if (!v.wrecked) blip(v.x, v.z, flash ? '#ff3b3b' : '#3b6bff', 5.5, 'dot');
      for (const o of G.police.officers) if (!o.dead) blip(o.x, o.z, '#3b6bff', 3.5, 'dot');
      if (G.police.heli) blip(G.police.heli.x, G.police.heli.z, flash ? '#ff3b3b' : '#3b6bff', 6, 'square', true);
      for (const g of G.gangs.members) if (!g.dead && g.hostile) blip(g.x, g.z, '#ff6b4a', 3.5, 'dot');
      for (const s of G.activities.shardMeshes) blip(s.position.x, s.position.z, '#5de0d6', 3.5, 'diamond');
      for (const v of G.fleet.vehicles) if (v.mission && v.role === 'gang' && !v.wrecked) blip(v.x, v.z, '#ff6b4a', 5, 'square', true);
      ctx.restore();
      // Sol: an arrow at the centre pointing the way she faces relative to the camera.
      ctx.save();
      ctx.translate(R, CY);
      const facing = p.state === 'car' && p.vehicle ? p.vehicle.yaw : p.yaw;
      ctx.rotate(-(facing - yaw));
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -11);
      ctx.lineTo(7, 8);
      ctx.lineTo(0, 4);
      ctx.lineTo(-7, 8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      // North on the rim.
      const nx = R + Math.cos(rot - Math.PI / 2) * (R - 16);
      const ny = R + Math.sin(rot - Math.PI / 2) * (R - 16);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.font = 'bold 15px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeText('N', nx, ny);
      ctx.fillText('N', nx, ny);
      ctx.textBaseline = 'alphabetic';
      ctx.beginPath();
      ctx.arc(R, R, R - 3, 0, Math.PI * 2);
      ctx.strokeStyle = G.wanted.stars > 0 ? (flash ? '#ff3b3b' : '#3b6bff') : 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 4;
      ctx.stroke();
    },
  };
}
