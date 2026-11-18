// Screenshot scenes behind ?shot=<name>&seed=<n>: each sets up the real game (the real city, cars,
// AI, missions and HUD) at a chosen moment, runs the simulation forward deterministically, places
// the camera and lets main.js paint it. chase: a three-star pursuit on Ocean Drive; onfoot: a Neon
// Row gunfight mid-mission; map: the pause map; mission: the mission-complete screen; title;
// plus street views (neon, downtown, docks, beach) used to review the art.
import * as THREE from 'three';
import { KEYS } from './input.js';
import { seedShared } from './rng.js';
import { glowTexture } from './textures.js';

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
    // The cover. Westbound on Ocean Drive at four stars: the red coupe drifts big in the middle
    // of the frame, two cruisers close behind it with their lightbars going, the helicopter and
    // its beam over them, palms lining both pavements, the hotels on the left and the beach,
    // pier and ferris wheel on the right, traffic and a watching crowd, the full HUD.
    const z = layout.oceanZ - 1.75;
    const shiftParam = Number.parseFloat(new URLSearchParams(window.location.search).get('shift'));
    const x0 = layout.roadX(4) + 48 + (Number.isFinite(shiftParam) ? shiftParam : 0);
    const coupe = G.fleet.spawn('coupe', x0, z, -Math.PI / 2, { color: '#c81e2e', role: 'player', owner: 'player' });
    G.player.enterVehicle(coupe);
    // Mid-game: Day 2, five story missions done, Boss rank 60% of the way to Legend, three guns.
    G.missions.restore({ completed: ['welcome', 'clock', 'neon', 'tail', 'docks'] });
    G.world.sky.state.day = 2;
    G.economy.money = 47250;
    G.economy.rep = 512;
    G.player.health = 82;
    G.player.armor = 45;
    G.weapons.give('pistol', 64);
    G.weapons.give('shotgun', 18);
    G.weapons.give('smg', 120);
    G.weapons.select('smg');
    G.radio.setStation(0, true);
    G.world.sky.setHour(17.45);
    // Traffic along the drive: eastbound cars in the far lanes ahead of the camera, a van behind.
    G.traffic.spawnCar({ x: x0 + 14, z: layout.oceanZ + 5.25, yaw: Math.PI / 2, node: G.nav.node(5, 9), dir: 'e', lane: 1 }, 'taxi');
    G.traffic.spawnCar({ x: x0 + 34, z: layout.oceanZ + 1.75, yaw: Math.PI / 2, node: G.nav.node(6, 9), dir: 'e', lane: 0 }, 'sedan');
    G.traffic.spawnCar({ x: x0 + 52, z: layout.oceanZ + 5.25, yaw: Math.PI / 2, node: G.nav.node(6, 9), dir: 'e', lane: 1 }, 'pickup');
    G.traffic.spawnCar({ x: x0 + 48, z: layout.oceanZ - 5.25, yaw: -Math.PI / 2, node: G.nav.node(5, 9), dir: 'w', lane: 1 }, 'van');
    // An oncoming taxi in the near eastbound lane: the coupe threads past it (the NEAR MISS).
    G.traffic.spawnCar({ x: x0 - 30, z: layout.oceanZ + 1.75, yaw: Math.PI / 2, node: G.nav.node(5, 9), dir: 'e', lane: 0 }, 'taxi');
    const from = { x: x0 - 20, z };
    crowd(G, [
      [x0 - 15, layout.oceanZ - 9, false], [x0 - 19, layout.oceanZ - 8.4, false], [x0 - 9, layout.oceanZ - 9.6, true], [x0 + 2, layout.oceanZ - 8.8, false], [x0 + 10, layout.oceanZ - 9.2, true], [x0 + 22, layout.oceanZ - 9.4, false],
      [x0 - 14, layout.boardwalkZ + 2.5, true], [x0 - 6, layout.boardwalkZ + 4, true], [x0 + 4, layout.boardwalkZ + 3, false], [x0 - 22, layout.boardwalkZ + 3.5, false], [x0 + 14, layout.boardwalkZ + 2, false], [x0 - 26, layout.boardwalkZ + 2.2, false], [x0 + 26, layout.boardwalkZ + 3.2, false],
    ], from);
    // Bystanders who stay put and watch the chase go by.
    for (const ped of G.pedestrians.list) if (ped.state === 'walk') { ped.state = 'wait'; ped.waitTimer = 30; ped.yaw = Math.atan2(x0 - 24 - ped.x, z - ped.z); }
    G.wanted.setStars(4);
    G.wanted.search.x = x0 + 40;
    G.wanted.search.z = z + 20;
    G.wanted.search.r = 95;
    G.hud.setObjective("Lose the cops before reaching Teo's garage");
    G.hud.setWaypoint(L.garageParking.x, L.garageParking.z, 'objective');
    if (G.missions.startMarker) G.markers.remove(G.missions.startMarker);
    // The drift: full speed west, then a handbrake flick to the right that swings the tail out.
    coupe.vx = -22;
    drive(G, 0.9, [KEYS.forward]);
    drive(G, 0.45, [KEYS.forward, KEYS.handbrake, KEYS.right]);
    drive(G, 0.15, [KEYS.forward, KEYS.right]);
    const v = G.player.vehicle;
    v.hp = 61;
    // Two cruisers right on its tail, one in each lane, angled in toward it, lightbars on; a third
    // further back in pursuit and a roadblock forming ahead, so the HBPD panel lists five units.
    const cruisers = [];
    for (const [dx, dz, turn] of [[9, -4.5, 0.2], [14.5, -0.5, -0.12], [27, 3.2, 0.05]]) {
      const c = G.police.spawnCruiser({ x: v.x + dx, z: v.z + dz, yaw: -Math.PI / 2 + turn });
      c.vx = -19;
      c.siren = true;
      c.ai.setChase(playerTarget(G), 30);
      cruisers.push(c);
    }
    // Camera ahead of the coupe on the beach side, raised, looking back east down the drive with
    // a tight lens that keeps the nearest palm crowns out of the corners; the helicopter hangs
    // low over the road behind the cruisers, in the clear sky under the objective, nose to us.
    // (?cam=dx,dy,dz,lx,ly,lz,fov,hx,hz,hy and ?shift=metres override these for composition reviews.)
    const cam = [-19, 8.2, 2.4, 12, -2.2, 1, 48, 26.5, 0.3, 7.4];
    const camParam = new URLSearchParams(window.location.search).get('cam');
    if (camParam) camParam.split(',').forEach((n, i) => { if (Number.isFinite(Number.parseFloat(n))) cam[i] = Number.parseFloat(n); });
    G.police.summonHeli(v.x + cam[7], v.z + cam[8]);
    G.police.heli.y = cam[9];
    G.police.heli.angle = Math.PI;
    G.simulate(0.06, 1 / 60);
    const camPos = { x: v.x + cam[0], y: v.y + cam[1], z: v.z + cam[2] };
    const look = { x: v.x + cam[3], y: v.y + cam[4], z: v.z + cam[5] };
    G.camera.camera.fov = cam[6];
    G.camera.camera.updateProjectionMatrix();
    placeCamera(G, camPos, look);
    // A roadblock entry for the panel, forming just past the next corner, out of frame.
    const block = { x: v.x - 23, z: v.z, cruisers: [], officers: [] };
    G.police.roadblocks.push(block);
    // Mission state for the panel: The Glasswater Job (mission 6) at its getaway stage, on the clock.
    const bank = G.missions.defs.find((d) => d.id === 'bank');
    const stage = bank.stages.findIndex((s) => typeof s.objective === 'string' && s.objective.includes('lose the heat'));
    G.missions.current = { def: bank, ctx: { G, def: bank, data: {} }, stage, time: 0 };
    G.hud.setTimer(87);
    // Golden-hour grade: brighter exposure, warmer sun and sky fill, an orange haze on the horizon.
    G.world.scene.fog.near = 60;
    G.world.scene.fog.far = 480;
    G.world.scene.fog.color.set('#ffa461');
    G.renderer.toneMappingExposure = 1.24;
    G.world.sky.sun.color.set('#ffb468');
    G.world.sky.sun.intensity *= 1.15;
    G.world.scene.traverse((o) => {
      if (o.isHemisphereLight) { o.color.set('#ffc890'); o.groundColor.set('#d0885a'); }
    });
    // Cheap bloom: additive halos on the sun and on the street lamps near the chase.
    const halo = (color, opacity) => new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const sunGlow = new THREE.Sprite(halo('#ffb060', 0.85));
    sunGlow.material.depthTest = false;
    sunGlow.renderOrder = -8;
    sunGlow.position.copy(G.world.sky.state.sunDir).multiplyScalar(420).add(new THREE.Vector3(camPos.x, camPos.y, camPos.z));
    sunGlow.scale.set(420, 420, 1);
    G.world.scene.add(sunGlow);
    const lampMat = halo('#ffc870', 0.75);
    for (const l of G.world.props.lamps) {
      if (Math.hypot(l.x - v.x, l.z - v.z) > 160) continue;
      const s = new THREE.Sprite(lampMat);
      s.position.set(l.x, 6.6, l.z);
      s.scale.set(3.6, 3.6, 1);
      G.world.scene.add(s);
    }
    finish();
    G.hud.say('Dani', "Teo's garage, two blocks. Don't lift now, Sol, they're right on you!", 8, '#ffd43b');
    G.hud.update(0.016);
    return;
  }

  if (name === 'onfoot') {
    const b = L.gangBar;
    G.world.sky.setHour(17.9);
    G.player.revive(b.x + 1, b.z + 10, Math.PI);
    G.missions.restore({ completed: ['welcome', 'clock', 'neon'] });
    G.world.sky.state.day = 2;
    G.economy.money = 14820;
    G.economy.rep = 215;
    G.player.health = 64;
    G.player.armor = 30;
    G.weapons.give('pistol', 48);
    G.weapons.give('smg', 90);
    G.weapons.select('pistol');
    G.wanted.setStars(1);
    G.wanted.search.x = b.x;
    G.wanted.search.z = b.z;
    G.wanted.search.r = 90;
    G.hud.setObjective('Deal with the Tide Runners');
    const squad = G.gangs.spawnSquad([{ x: b.x - 2.6, z: b.z + 4.2 }, { x: b.x + 3.2, z: b.z + 3.4, weapon: 'smg' }, { x: b.x + 0.2, z: b.z + 2.2 }]);
    crowd(G, [[b.x - 12, b.z + 6, true], [b.x - 9, b.z + 9, true], [b.x + 13, b.z + 7, true], [b.x + 16, b.z + 11, true], [b.x - 16, b.z + 12, true], [b.x + 7, b.z + 14, true]], { x: b.x, z: b.z });
    G.traffic.spawnCar({ x: b.x - 26, z: b.z + 20.5, yaw: Math.PI / 2, node: G.nav.node(8, 4), dir: 'e', lane: 0 }, 'coupe');
    G.traffic.spawnCar({ x: b.x + 24, z: b.z + 14.5, yaw: -Math.PI / 2, node: G.nav.node(8, 4), dir: 'w', lane: 1 }, 'taxi');
    G.camera.snapTo(Math.PI, 0.16);
    G.camera.update(0.016, G.player.focus(new THREE.Vector3()), 'foot', null, G.input, G.world.colliders, window.innerWidth);
    G.simulate(0.7, 1 / 60);
    G.player.aimTimer = 3;
    G.player.yaw = Math.PI + 0.08;
    G.simulate(0.02, 1 / 60);
    G.weapons.cooldown = 0;
    G.weapons.fire();
    G.gangs.shoot(squad[0]);
    G.gangs.shoot(squad[1]);
    G.gangs.shoot(squad[2]);
    G.simulate(1 / 60, 1 / 60);
    // Over Sol's right shoulder, close, the three Runners big in frame; a dusk grade bright enough
    // to read the street under the neon.
    G.camera.camera.fov = 58;
    G.camera.camera.updateProjectionMatrix();
    const p = G.player;
    placeCamera(G, { x: p.x + 1.1, y: 2.25, z: p.z + 3.1 }, { x: b.x + 0.4, y: 1.25, z: b.z + 2.5 });
    G.renderer.toneMappingExposure = 1.3;
    G.world.sky.sun.color.set('#ffc890');
    G.world.scene.fog.color.set('#c89a8a');
    G.world.scene.traverse((o) => {
      if (o.isHemisphereLight) { o.color.set('#ffe0c0'); o.groundColor.set('#8a7a90'); o.intensity *= 1.4; }
    });
    finish();
    G.hud.say('Rico', 'Kane says the debt is forgiven. Now beat it, driver.', 8, '#ff6b4a');
    G.hud.stunt('TAKEDOWN', 350, '', 'takedown');
    G.hud.hitMarker(false);
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
    // Pier Pressure (mission 7 of 8) just paid out: the white sedan parked on Ocean Drive at sunset,
    // the compact results card at the right edge and the full HUD undimmed beside it.
    G.missions.restore({ completed: ['welcome', 'clock', 'neon', 'tail', 'docks', 'bank'] });
    G.world.sky.state.day = 2;
    G.economy.stats.carsStolen = 23;
    G.economy.stats.escapes = 7;
    G.activities.restore({ shards: [0, 1, 3, 5, 7, 9, 11, 13, 15], racesWon: { coast: 1, downtown: 1 } });
    G.player.distanceDriven = 48600;
    G.world.sky.setHour(17.55);
    const x = layout.roadX(4) + 30;
    const z = layout.oceanZ + 1.75;
    const car = G.fleet.spawn('sedan', x, z, Math.PI / 2 - 0.25, { color: '#f4f1e8', role: 'player', owner: 'player' });
    G.player.revive(x - 2.5, z + 3.2, Math.PI);
    G.weapons.give('pistol', 64);
    G.weapons.give('smg', 120);
    G.weapons.select('smg');
    crowd(G, [[x + 6, layout.boardwalkZ + 2.5, false], [x - 8, layout.boardwalkZ + 3, false], [x + 14, layout.oceanZ - 9, false], [x - 14, layout.oceanZ - 8.6, false]], { x, z });
    G.traffic.spawnCar({ x: x + 26, z: layout.oceanZ - 5.25, yaw: -Math.PI / 2, node: G.nav.node(5, 9), dir: 'w', lane: 1 }, 'taxi');
    G.simulate(0.4, 1 / 60);
    const pier = G.missions.defs.find((d) => d.id === 'pier');
    const tide = G.missions.defs.find((d) => d.id === 'tide');
    G.missions.completed.add('pier');
    G.economy.money = 21480;
    G.economy.rep = 395;
    G.economy.stats.missions = 7;
    // Low on the hotel side, the car in the left half of the frame, the beach and sunset sky behind.
    G.camera.camera.fov = 52;
    G.camera.camera.updateProjectionMatrix();
    placeCamera(G, { x: car.x + 7, y: 2.6, z: car.z - 9 }, { x: car.x - 7, y: 2.4, z: car.z + 4 });
    G.renderer.toneMappingExposure = 1.2;
    finish();
    G.menus.showMissionComplete({ def: pier, money: pier.reward.money, rep: pier.reward.rep, levelUp: false, next: tide, finale: false });
    document.getElementById('menus').classList.add('side');
    document.getElementById('hud').classList.remove('dimmed');
    G.hud.update(0.016);
    return;
  }

  if (name === 'vista') {
    // High over Coral Strand at golden hour: the beach, the pier and its ferris wheel below, Ocean
    // Drive's traffic and the boardwalk crowd, the Glasswater towers behind, the district card up.
    G.missions.restore({ completed: ['welcome', 'clock', 'neon', 'tail'] });
    G.world.sky.state.day = 2;
    G.economy.money = 18640;
    G.economy.rep = 260;
    G.weapons.give('pistol', 48);
    G.weapons.select('pistol');
    G.world.sky.setHour(17.5);
    const ps = L.pierStart;
    for (let i = 0; i < 6; i += 1) {
      const tx = ps.x - 70 + i * 26;
      G.traffic.spawnCar({ x: tx, z: layout.oceanZ + (i % 2 ? 1.75 : 5.25), yaw: Math.PI / 2, node: G.nav.node(5, 9), dir: 'e', lane: i % 2 ? 0 : 1 }, ['taxi', 'sedan', 'coupe', 'pickup', 'van', 'taxi'][i]);
      G.traffic.spawnCar({ x: tx + 12, z: layout.oceanZ - (i % 2 ? 1.75 : 5.25), yaw: -Math.PI / 2, node: G.nav.node(5, 9), dir: 'w', lane: i % 2 ? 0 : 1 }, ['sedan', 'coupe', 'taxi', 'van', 'sedan', 'pickup'][i]);
    }
    const walkers = [];
    for (let i = 0; i < 18; i += 1) walkers.push([ps.x - 45 + i * 5, layout.boardwalkZ + 1.5 + (i % 3) * 1.5, false]);
    for (let i = 0; i < 8; i += 1) walkers.push([ps.x - 30 + i * 8, layout.shoreZ - 6 - (i % 2) * 4, false]);
    crowd(G, walkers, ps);
    G.player.revive(ps.x - 6, ps.z + 1, 0);
    G.simulate(1.2, 1 / 60);
    // From over the water, looking back inland past the pier toward the towers.
    const dx = L.plaza.x - L.pier.x;
    const dz = L.plaza.z - L.pier.z;
    const n = Math.hypot(dx, dz) || 1;
    const ux = dx / n;
    const uz = dz / n;
    const cam = { x: L.pier.x - ux * 120 - uz * 50, y: 62, z: L.pier.z - uz * 120 + ux * 50 };
    G.camera.camera.fov = 55;
    G.camera.camera.updateProjectionMatrix();
    placeCamera(G, cam, { x: L.pier.x + ux * 110, y: 4, z: L.pier.z + uz * 110 });
    G.world.scene.fog.near = 200;
    G.world.scene.fog.far = 1400;
    G.world.scene.fog.color.set('#ffb070');
    G.renderer.toneMappingExposure = 1.2;
    G.world.sky.sun.color.set('#ffb468');
    finish();
    return;
  }

  if (name === 'newgame') {
    // The first seconds of a new game, exactly as a player sees them (help card included).
    G.hud.showHelp(true);
    G.simulate(1.5, 1 / 60);
    G.camera.update(0.016, G.player.focus(new THREE.Vector3()), 'foot', null, G.input, G.world.colliders, window.innerWidth);
    G.hud.update(0.016);
    return;
  }

  if (name === 'vehicles') {
    // Every vehicle type lined up on Ocean Drive for review.
    const z = layout.oceanZ + 3;
    const types = ['coupe', 'sedan', 'taxi', 'pickup', 'van', 'cruiser', 'bike'];
    let x = layout.roadX(4) - 18;
    G.world.sky.setHour(17.3);
    for (const t of types) {
      const v = G.fleet.spawn(t, x, z, Math.PI / 2 + 0.5, { role: 'test' });
      if (t === 'cruiser') v.siren = true;
      x += 6.5;
    }
    G.player.revive(layout.roadX(4) - 24, z - 6, 0);
    G.simulate(0.3, 1 / 60);
    placeCamera(G, { x: layout.roadX(4) + 4, y: 3.2, z: z + 13 }, { x: layout.roadX(4) + 2, y: 0.8, z: z });
    finish();
    return;
  }

  if (name === 'rider') {
    // Sol and an AI rider on Kestrels, side on, for reviewing the seat and the lean.
    const z = layout.oceanZ + 1.75;
    const x = layout.roadX(4) - 10;
    G.world.sky.setHour(17.3);
    const bike = G.fleet.spawn('bike', x, z, Math.PI / 2, { role: 'player', owner: 'player', color: '#c1121f' });
    G.player.revive(x, z - 2, 0);
    G.player.enterVehicle(bike);
    const ai = G.traffic.spawnCar({ x: x + 4, z: z - 3.5, yaw: Math.PI / 2 - 0.6, node: G.nav.node(5, 9), dir: 'e', lane: 0 }, 'bike');
    ai.ai.limit = 0;
    ai.ctrl.handbrake = true;
    G.simulate(0.3, 1 / 60);
    bike.model.bodyGroup.rotation.z = 0.25;
    G.player.model.animateSeated(true, 0.25 * 0.35);
    G.simulate(1 / 60, 1 / 60);
    bike.model.bodyGroup.rotation.z = 0.25;
    placeCamera(G, { x: x + 1.5, y: 1.5, z: z + 4.6 }, { x: x + 1.2, y: 0.9, z: z });
    finish();
    return;
  }

  if (name === 'cast') {
    // Everyone in the cast, close up, for reviewing the figures.
    const p = L.plaza;
    G.world.sky.setHour(17.4);
    G.player.revive(p.x, p.z, Math.PI);
    const looks = ['teo', 'dani', 'kane', 'ruiz', 'officer', 'gang'];
    let x = p.x - 5;
    for (const key of looks) {
      const { createCharacter, LOOKS } = await import('./characters.js');
      const model = createCharacter(LOOKS[key]);
      model.group.position.set(x, G.world.layout.groundHeight(x, p.z - 2.5), p.z - 2.5);
      model.group.rotation.y = Math.PI;
      model.animateIdle(x);
      G.world.scene.add(model.group);
      x += 2;
    }
    for (let i = 0; i < 6; i += 1) {
      const ped = G.pedestrians.makePed(p.x - 5 + i * 2, p.z - 5.5);
      ped.state = 'wait';
      ped.waitTimer = 99;
      ped.yaw = Math.PI;
    }
    G.simulate(0.5, 1 / 60);
    placeCamera(G, { x: p.x + 1, y: 1.9, z: p.z + 6 }, { x: p.x + 1, y: 1.1, z: p.z - 3 });
    finish();
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
