// Screenshot scenes behind ?shot=<name>&seed=<n>: each sets up the real game (the real city, cars,
// AI, missions and HUD) at a chosen moment, runs the simulation forward deterministically, places
// the camera and lets main.js paint it. chase: a three-star pursuit on Ocean Drive; onfoot: a Neon
// Row gunfight mid-mission; map: the pause map; mission: the mission-complete screen; title;
// plus street views (neon, downtown, docks, beach) used to review the art.
import * as THREE from 'three';
import { KEYS } from './input.js';
import { seedShared } from './rng.js';

function drive(G, seconds, keys, stepSize = 1 / 60) {
  for (const k of keys) G.input.pressKey(k);
  G.simulate(seconds, stepSize);
  for (const k of keys) G.input.releaseKey(k);
}

function placeCamera(G, pos, look, yawForHud) {
  const cam = G.camera.camera;
  cam.position.set(pos.x, pos.y, pos.z);
  cam.lookAt(new THREE.Vector3(look.x, look.y, look.z));
  cam.updateMatrixWorld();
  const yaw = yawForHud ?? Math.atan2(look.x - pos.x, look.z - pos.z);
  G.camera.state.yaw = yaw;
  G.camera.state.targetYaw = yaw;
}

function playerTarget(G) {
  return { get x() { return G.player.x; }, get z() { return G.player.z; }, get vx() { return G.player.vehicle ? G.player.vehicle.vx : 0; }, get vz() { return G.player.vehicle ? G.player.vehicle.vz : 0; }, get speed() { return G.player.vehicle ? G.player.vehicle.speed : 0; } };
}

function crowd(G, points, from) {
  for (const [x, z, panic] of points) {
    const ped = G.pedestrians.makePed(x, z);
    if (panic) {
      ped.state = 'panic';
      ped.panicTimer = 4;
      ped.panicFrom = from;
    }
  }
}

export async function stageShot(name, G) {
  seedShared(G.seed * 1013 + 7);
  G.input.state.testMode = true;
  G.input.state.lockRefused = true;
  const L = G.world.layout.landmarks;
  const layout = G.world.layout;
  G.newGame();
  G.hud.showHelp(false);
  G.input.releaseMouse();
  const finish = () => {
    G.hud.clearTransient();
    G.hud.update(0.016);
  };

  if (name === 'chase') {
    // Westbound on Ocean Drive: the sun ahead-left over the sea, the pier and hotels behind.
    const z = layout.oceanZ - 1.75;
    const x0 = layout.roadX(4) + 18;
    const coupe = G.fleet.spawn('coupe', x0, z, -Math.PI / 2, { color: '#c81e2e', role: 'player', owner: 'player' });
    G.player.enterVehicle(coupe);
    G.economy.money = 4350;
    G.player.health = 82;
    G.player.armor = 45;
    G.weapons.give('smg', 120);
    G.weapons.select('smg');
    G.radio.setStation(0, true);
    G.world.sky.setHour(17.45);
    G.traffic.spawnCar({ x: x0 + 48, z: layout.oceanZ + 5.25, yaw: Math.PI / 2, node: G.nav.node(5, 9), dir: 'e', lane: 1 }, 'taxi');
    G.traffic.spawnCar({ x: x0 + 70, z: layout.oceanZ + 1.75, yaw: Math.PI / 2, node: G.nav.node(5, 9), dir: 'e', lane: 0 }, 'sedan');
    G.traffic.spawnCar({ x: x0 - 70, z: layout.oceanZ - 5.25, yaw: -Math.PI / 2, node: G.nav.node(3, 9), dir: 'w', lane: 1 }, 'van');
    const from = { x: x0, z };
    crowd(G, [
      [x0 - 6, layout.oceanZ - 9, true], [x0 - 11, layout.oceanZ - 8.5, true], [x0 + 4, layout.oceanZ - 9.5, true], [x0 + 12, layout.oceanZ - 8.8, false],
      [x0 - 2, layout.boardwalkZ + 2.5, true], [x0 + 9, layout.boardwalkZ + 4, true], [x0 + 18, layout.boardwalkZ + 3, false], [x0 - 14, layout.boardwalkZ + 3.5, true], [x0 + 26, layout.boardwalkZ + 2, false],
    ], from);
    const cruisers = [];
    for (const [dx, dz] of [[14, 0.2], [21, -3.4], [27, 3.2]]) {
      const c = G.police.spawnCruiser({ x: x0 + dx, z: z + dz, yaw: -Math.PI / 2 });
      c.vx = -20;
      cruisers.push(c);
    }
    G.wanted.setStars(3);
    G.wanted.search.x = x0 + 40;
    G.wanted.search.z = z + 20;
    G.wanted.search.r = 95;
    G.hud.setObjective("Lose the cops before reaching Teo's garage");
    G.hud.setWaypoint(L.garageParking.x, L.garageParking.z, 'objective');
    if (G.missions.startMarker) G.markers.remove(G.missions.startMarker);
    coupe.vx = -22;
    for (const c of cruisers) c.ai.setChase(playerTarget(G), 30);
    drive(G, 1.1, [KEYS.forward]);
    drive(G, 0.7, [KEYS.forward, KEYS.handbrake, KEYS.right]);
    drive(G, 0.2, [KEYS.forward, KEYS.right]);
    for (const c of cruisers) c.siren = true;
    const v = G.player.vehicle;
    G.police.summonHeli(v.x + 22, v.z - 6);
    G.police.heli.y = 12.5;
    G.simulate(0.06, 1 / 60);
    // Camera ahead of the coupe (west, by the road's direction) on the sea side, looking back east.
    const camPos = { x: v.x - 11, y: v.y + 2.3, z: v.z + 5 };
    const look = { x: v.x + 7, y: v.y + 2.6, z: v.z - 0.5 };
    placeCamera(G, camPos, look);
    finish();
    return;
  }

  if (name === 'onfoot') {
    const b = L.gangBar;
    G.world.sky.setHour(18.8);
    G.player.revive(b.x + 1, b.z + 10, Math.PI);
    G.economy.money = 2180;
    G.player.health = 64;
    G.player.armor = 30;
    G.weapons.give('pistol', 48);
    G.weapons.select('pistol');
    G.wanted.setStars(1);
    G.wanted.search.x = b.x;
    G.wanted.search.z = b.z;
    G.wanted.search.r = 90;
    G.hud.setObjective('Deal with the Tide Runners');
    const squad = G.gangs.spawnSquad([{ x: b.x - 4.5, z: b.z + 3 }, { x: b.x + 5, z: b.z + 2, weapon: 'smg' }, { x: b.x - 1, z: b.z + 5.5 }, { x: b.x + 9, z: b.z + 4.5 }]);
    crowd(G, [[b.x - 12, b.z + 6, true], [b.x - 9, b.z + 9, true], [b.x + 13, b.z + 7, true], [b.x + 16, b.z + 11, true], [b.x - 16, b.z + 12, true], [b.x + 7, b.z + 14, true]], { x: b.x, z: b.z });
    G.traffic.spawnCar({ x: b.x - 26, z: b.z + 20.5, yaw: Math.PI / 2, node: G.nav.node(8, 4), dir: 'e', lane: 0 }, 'coupe');
    G.traffic.spawnCar({ x: b.x + 24, z: b.z + 14.5, yaw: -Math.PI / 2, node: G.nav.node(8, 4), dir: 'w', lane: 1 }, 'taxi');
    G.camera.snapTo(Math.PI, 0.16);
    G.simulate(0.7, 1 / 60);
    G.player.aimTimer = 3;
    G.player.yaw = Math.PI;
    G.camera.snapTo(Math.PI + 0.22, 0.14);
    G.simulate(0.02, 1 / 60);
    G.weapons.cooldown = 0;
    G.weapons.fire();
    G.gangs.shoot(squad[0]);
    G.gangs.shoot(squad[1]);
    G.hud.say('Rico', 'Kane says the debt is forgiven. Now beat it, driver.', 8, '#ff6b4a');
    G.simulate(1 / 60, 1 / 60);
    G.camera.update(0.016, G.player.focus(new THREE.Vector3()), 'foot', null, G.input, G.world.colliders, window.innerWidth);
    finish();
    G.hud.say('Rico', 'Kane says the debt is forgiven. Now beat it, driver.', 8, '#ff6b4a');
    G.hud.update(0.016);
    return;
  }

  if (name === 'map') {
    G.missions.restore({ completed: ['welcome', 'clock', 'neon'] });
    G.economy.money = 7420;
    G.economy.rep = 120;
    G.activities.restore({ shards: [0, 3, 7, 11, 15, 19], racesWon: { coast: 1 } });
    G.player.revive(L.plaza.x + 10, L.plaza.z + 30, 0);
    G.wanted.setStars(2);
    G.wanted.search.x = L.plaza.x + 60;
    G.wanted.search.z = L.plaza.z + 40;
    G.wanted.search.r = 120;
    G.hud.setWaypoint(L.safehouses.palmetto.x, L.safehouses.palmetto.z, 'waypoint');
    G.state = 'playing';
    G.openMap();
    finish();
    return;
  }

  if (name === 'mission') {
    G.missions.restore({ completed: ['welcome', 'clock', 'neon', 'tail', 'docks'] });
    G.economy.stats.carsStolen = 23;
    G.economy.stats.escapes = 6;
    G.activities.restore({ shards: [0, 1, 3, 5, 7, 9, 11, 13, 15], racesWon: { coast: 1, downtown: 1 } });
    G.player.distanceDriven = 42300;
    const spot = L.bankRoad;
    G.world.sky.setHour(17.7);
    const car = G.fleet.spawn('coupe', spot.x, spot.z + 6, 0, { color: '#ffd166', role: 'player', owner: 'player' });
    G.player.revive(spot.x - 4, spot.z + 2, Math.PI / 2);
    G.simulate(0.4, 1 / 60);
    const bank = G.missions.defs.find((d) => d.id === 'bank');
    const tide = G.missions.defs.find((d) => d.id === 'tide');
    G.missions.completed.add('bank');
    G.economy.money = 9850;
    G.economy.rep = 295;
    G.economy.stats.missions = 6;
    const cam = { x: car.x - 18, y: 7, z: car.z + 20 };
    placeCamera(G, cam, { x: car.x + 10, y: 12, z: car.z - 30 });
    finish();
    G.menus.showMissionComplete({ def: bank, money: 5000, rep: 80, levelUp: true, next: tide, finale: false });
    return;
  }

  if (['neon', 'downtown', 'docks', 'beach', 'villas', 'riptide', 'hotel'].includes(name)) {
    const spots = {
      neon: { pos: { x: L.gangBar.x - 20, z: L.gangBar.z + 24 }, look: { x: L.gangBar.x + 10, z: L.gangBar.z - 10 }, hour: 18.9 },
      downtown: { pos: { x: L.plaza.x - 30, z: L.plaza.z + 60 }, look: { x: L.plaza.x + 30, z: L.plaza.z - 40 }, hour: 17.4 },
      docks: { pos: { x: L.garage.x + 40, z: L.garage.z + 30 }, look: { x: L.garage.x - 60, z: L.garage.z - 40 }, hour: 17.4 },
      beach: { pos: { x: L.pier.x - 60, z: layout.boardwalkZ + 2 }, look: { x: L.pier.x + 30, z: layout.shoreZ + 60 }, hour: 17.4 },
      villas: { pos: { x: L.safehouses.palmetto.x - 30, z: L.safehouses.palmetto.z + 10 }, look: { x: L.safehouses.palmetto.x + 20, z: L.safehouses.palmetto.z - 40 }, hour: 17.4 },
      riptide: { pos: { x: L.gangBar.x + 6, z: L.gangBar.z + 20 }, look: { x: L.gangBar.x, z: L.gangBar.z - 10 }, hour: 18.6 },
      hotel: { pos: { x: L.safehouses.strand.x + 10, z: L.safehouses.strand.z + 22 }, look: { x: L.safehouses.strand.x, z: L.safehouses.strand.z - 20 }, hour: 17.4 },
    };
    const s = spots[name];
    const hourParam = Number.parseFloat(new URLSearchParams(window.location.search).get('hour'));
    G.world.sky.setHour(Number.isFinite(hourParam) ? hourParam : s.hour);
    G.player.revive(s.pos.x, s.pos.z, 0);
    G.simulate(1.5, 1 / 60);
    placeCamera(G, { x: s.pos.x, y: 4, z: s.pos.z }, { x: s.look.x, y: 6, z: s.look.z });
    finish();
    return;
  }

  // Title screen over the live city.
  G.quitToTitle();
  G.world.sky.setHour(17.5);
  const cx = layout.roadX(5);
  const cz = layout.oceanZ - 40;
  G.simulate(0.1, 1 / 60);
  placeCamera(G, { x: cx + 120, y: 40, z: cz + 100 }, { x: cx, y: 10, z: cz });
}
