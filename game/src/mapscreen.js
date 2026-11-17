// The full-screen pause map: the whole of Halcyon Bay with district names, mission, activity,
// shop and safehouse icons, police units, the legend, the story progress and stats, and a
// click to set (or clear) a waypoint the minimap and HUD then point at.
import { DISTRICTS } from './city/layout.js';
import { CITY } from './config.js';

export function createMapScreen(G, root, canvas, mapImage) {
  const ctx = canvas.getContext('2d');
  const side = root.querySelector('#map-side');
  let open = false;
  let view = { scale: 1, ox: 0, oy: 0 };

  function fit() {
    const W = root.clientWidth;
    const H = root.clientHeight;
    canvas.width = Math.max(320, W - 360);
    canvas.height = H;
    const sx = canvas.width / mapImage.canvas.width;
    const sy = canvas.height / mapImage.canvas.height;
    const s = Math.min(sx, sy) * 0.96;
    view = { scale: s, ox: (canvas.width - mapImage.canvas.width * s) / 2, oy: (canvas.height - mapImage.canvas.height * s) / 2 };
  }

  const toScreen = (x, z) => {
    const [mx, mz] = mapImage.toMap(x, z);
    return [view.ox + mx * view.scale, view.oy + mz * view.scale];
  };
  const toWorld = (sx, sy) => {
    const mx = (sx - view.ox) / view.scale;
    const mz = (sy - view.oy) / view.scale;
    return [mx / mapImage.scale + mapImage.minX, mz / mapImage.scale + mapImage.minZ];
  };

  function icon(x, z, color, shape, r = 7, text = '') {
    const [sx, sy] = toScreen(x, z);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.fillStyle = color;
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (shape === 'dot') ctx.arc(0, 0, r, 0, Math.PI * 2);
    else if (shape === 'square') ctx.rect(-r, -r, r * 2, r * 2);
    else if (shape === 'diamond') { ctx.moveTo(0, -r * 1.3); ctx.lineTo(r * 1.3, 0); ctx.lineTo(0, r * 1.3); ctx.lineTo(-r * 1.3, 0); ctx.closePath(); }
    else if (shape === 'house') { ctx.moveTo(-r, r); ctx.lineTo(-r, 0); ctx.lineTo(0, -r); ctx.lineTo(r, 0); ctx.lineTo(r, r); ctx.closePath(); }
    else if (shape === 'flag') { ctx.rect(-1, -r, 2, r * 2); ctx.rect(0, -r, r * 1.4, r * 0.9); }
    ctx.fill();
    ctx.stroke();
    if (text) {
      ctx.fillStyle = '#111';
      ctx.font = 'bold 10px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(text, 0, 4);
    }
    ctx.restore();
  }

  function draw() {
    fit();
    ctx.fillStyle = '#0d1b2a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.scale, view.scale);
    ctx.drawImage(mapImage.canvas, 0, 0);
    ctx.restore();
    const L = G.world.layout.landmarks;
    // District names.
    ctx.font = 'bold 22px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    const names = [
      ['coral', CITY.x0 + CITY.width * 0.55, G.world.layout.roadZ(7) + 10],
      ['glasswater', G.world.layout.roadX(4) + 35, G.world.layout.roadZ(2) + 2],
      ['neon', G.world.layout.roadX(8) + 35, G.world.layout.roadZ(4) + 2],
      ['palmetto', G.world.layout.roadX(6), G.world.layout.roadZ(1)],
      ['saltmarsh', G.world.layout.roadX(1), G.world.layout.roadZ(3)],
    ];
    for (const [id, x, z] of names) {
      const [sx, sy] = toScreen(x, z);
      ctx.fillStyle = DISTRICTS[id].color;
      ctx.strokeText(DISTRICTS[id].name.toUpperCase(), sx, sy);
      ctx.fillText(DISTRICTS[id].name.toUpperCase(), sx, sy);
    }
    ctx.font = 'bold 14px Arial, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.lineWidth = 3;
    const places = [[L.pier.x, L.pierEnd.z + 16, 'Halcyon Pier'], [L.key.x + 60, L.key.z - 30, 'Pelican Key'], [(L.key.x + G.world.layout.causewayX1) / 2 + 30, L.key.z + 22, 'Pelican Causeway'], [L.bank.x + 20, L.bank.z - 30, 'Glasswater Mutual'], [L.garage.x, L.garage.z + 14, "Teo's Body Shop"], [L.gangBar.x, L.gangBar.z + 14, 'The Riptide'], [L.hospital.x, L.hospital.z + 12, 'Bayside Clinic'], [L.policeStation.x, L.policeStation.z + 12, 'HPD']];
    for (const [x, z, t] of places) {
      const [sx, sy] = toScreen(x, z);
      ctx.strokeText(t, sx, sy);
      ctx.fillText(t, sx, sy);
    }
    // Search circle.
    const w = G.wanted;
    if (w.stars > 0) {
      const [sx, sy] = toScreen(w.search.x, w.search.z);
      ctx.beginPath();
      ctx.arc(sx, sy, w.search.r * mapImage.scale * view.scale, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,40,40,0.15)';
      ctx.fill();
      ctx.strokeStyle = '#ff4444';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // Icons: markers, shards remaining, police, player.
    for (const m of G.markers.list) {
      if (!m.blip || m.hidden) continue;
      const colors = { mission: '#ffd43b', objective: '#ffd43b', checkpoint: '#ffd166', shop: '#37f3ff', safehouse: '#8bff6b', race: '#ff6ad5', taxi: '#ffd43b' };
      const shapes = { mission: 'diamond', objective: 'dot', checkpoint: 'dot', shop: 'square', safehouse: 'house', race: 'flag', taxi: 'square' };
      icon(m.x, m.z, colors[m.kind] || m.color, shapes[m.kind] || 'dot', m.kind === 'mission' ? 9 : 7, m.kind === 'mission' ? 'M' : m.kind === 'shop' ? 'P' : m.kind === 'race' ? '' : m.kind === 'safehouse' ? 'S' : '');
    }
    for (const s of G.activities.shardMeshes) icon(s.position.x, s.position.z, '#5de0d6', 'diamond', 4);
    for (const v of G.police.cruisers) if (!v.wrecked) icon(v.x, v.z, '#3b6bff', 'dot', 5);
    if (G.police.heli) icon(G.police.heli.x, G.police.heli.z, '#3b6bff', 'square', 6);
    const wp = G.hud.state.waypoint;
    if (wp) icon(wp.x, wp.z, wp.kind === 'waypoint' ? '#c56bff' : '#ffd43b', 'diamond', 8);
    const p = G.player;
    const [px, py] = toScreen(p.x, p.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.PI - (p.state === 'car' && p.vehicle ? p.vehicle.yaw : p.yaw));
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(8, 9);
    ctx.lineTo(0, 4);
    ctx.lineTo(-8, 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // Legend.
    const legend = [['#ffd43b', 'diamond', 'Story mission'], ['#ffd43b', 'dot', 'Objective'], ['#ff6ad5', 'flag', 'Street race'], ['#37f3ff', 'square', 'Paint shop'], ['#8bff6b', 'house', 'Safehouse'], ['#5de0d6', 'diamond', 'Sea-glass shard'], ['#3b6bff', 'dot', 'Police'], ['#c56bff', 'diamond', 'Waypoint']];
    const lx = 18;
    let ly = 48;
    ctx.fillStyle = 'rgba(8,14,24,0.78)';
    ctx.fillRect(lx - 10, ly - 30, 190, legend.length * 24 + 44);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 15px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('LEGEND', lx, ly - 10);
    ctx.font = '14px Arial, sans-serif';
    for (const [color, shape, text] of legend) {
      ctx.save();
      ctx.translate(lx + 8, ly + 8);
      ctx.fillStyle = color;
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const r = 6;
      if (shape === 'dot') ctx.arc(0, 0, r, 0, Math.PI * 2);
      else if (shape === 'square') ctx.rect(-r, -r, r * 2, r * 2);
      else if (shape === 'diamond') { ctx.moveTo(0, -r * 1.3); ctx.lineTo(r * 1.3, 0); ctx.lineTo(0, r * 1.3); ctx.lineTo(-r * 1.3, 0); ctx.closePath(); }
      else if (shape === 'house') { ctx.moveTo(-r, r); ctx.lineTo(-r, 0); ctx.lineTo(0, -r); ctx.lineTo(r, 0); ctx.lineTo(r, r); ctx.closePath(); }
      else if (shape === 'flag') { ctx.rect(-1, -r, 2, r * 2); ctx.rect(0, -r, r * 1.4, r * 0.9); }
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#fff';
      ctx.fillText(text, lx + 24, ly + 13);
      ly += 24;
    }
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = '13px Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('Click the map to set a waypoint  ·  M or Esc to close', canvas.width - 14, canvas.height - 12);
    drawSide();
  }

  function drawSide() {
    const list = G.missions.progressList();
    const e = G.economy;
    const done = list.filter((m) => m.done).length;
    const shards = G.activities.shardsFound.size;
    side.innerHTML = `
      <h2>HALCYON BAY</h2>
      <div class="map-stat"><span>Cash</span><b>$${e.money.toLocaleString()}</b></div>
      <div class="map-stat"><span>Reputation</span><b>${e.repName()} (${e.rep})</b></div>
      <div class="map-stat"><span>Story</span><b>${done} / ${list.length} missions</b></div>
      <div class="map-stat"><span>Sea-glass shards</span><b>${shards} / 20</b></div>
      <div class="map-stat"><span>Safehouses</span><b>${Object.keys(e.safehouses).length} / 3</b></div>
      <h3>STORY PROGRESS</h3>
      <ol class="story-list">${list.map((m) => `<li class="${m.done ? 'done' : m.active ? 'active' : ''}"><span class="mark">${m.done ? '✔' : m.active ? '▶' : '○'}</span><span class="title">${m.title}</span><span class="giver">${m.giver}</span></li>`).join('')}</ol>
      <h3>DISTRICTS</h3>
      <ul class="district-list">${Object.values(DISTRICTS).map((d) => `<li><i style="background:${d.mapColor}"></i>${d.name}</li>`).join('')}</ul>`;
  }

  canvas.addEventListener('click', (ev) => {
    if (!open) return;
    const rect = canvas.getBoundingClientRect();
    const [x, z] = toWorld(ev.clientX - rect.left, ev.clientY - rect.top);
    const wp = G.hud.state.waypoint;
    if (wp && wp.kind === 'waypoint' && Math.hypot(wp.x - x, wp.z - z) < 12) {
      G.hud.setWaypoint(null);
      G.notify('Waypoint cleared');
    } else {
      G.hud.setWaypoint(x, z, 'waypoint');
      G.notify('Waypoint set');
    }
    G.audio.play('click');
    draw();
  });

  return {
    get open() {
      return open;
    },
    show() {
      open = true;
      root.classList.remove('hidden');
      draw();
    },
    hide() {
      open = false;
      root.classList.add('hidden');
    },
    draw,
  };
}
