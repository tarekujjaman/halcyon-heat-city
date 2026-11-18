// Side activities: three street races against two AI drivers through checkpoints, taxi fares
// picked up in a cab and paid by distance (with a bonus for a fast ride), twenty sea-glass shards
// hidden across the districts, the paint shops that respray, repair and shake the cops, and the
// safehouse doors that open the save and purchase menus. Exports createActivities(G); the pause
// menu, the map and the save file read its shards and race records.
import * as THREE from 'three';
import { ECONOMY } from './config.js';
import { createDriver } from './vehicles/driver.js';
import { frand } from './rng.js';

const shardGeo = new THREE.OctahedronGeometry(0.45, 0);
const shardMat = new THREE.MeshStandardMaterial({ color: '#5de0d6', emissive: new THREE.Color('#2ab8ad'), emissiveIntensity: 0.9, roughness: 0.2, metalness: 0.2, transparent: true, opacity: 0.9 });
/** A shard floats this high, is picked up from this close, and is nudged off a post by one of these offsets. */
const SHARD_HOVER = 0.9;
const SHARD_PICKUP_RADIUS = 2.2;
const SHARD_NUDGES = [[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5], [2.5, 2.5], [-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5]];
/** Races: the countdown, how long Sol may be out of her car, how close a rival must pass a checkpoint. */
const RACE_COUNTDOWN = 3.5;
const RACE_ABANDON_SECONDS = 8;
const RIVAL_CHECKPOINT_RADIUS = 9;
const RIVAL_COOLDOWN_SPEED = 10;
const RIVAL_SPECS = [{ type: 'coupe', color: '#ffd166', limit: 19 }, { type: 'sedan', color: '#7b2cbf', limit: 21 }];
/** Taxi: seconds in a cab before a fare hails (first, then after each), how far away they stand, when they give up. */
const TAXI_FIRST_WAIT = 8;
const TAXI_NEXT_WAIT = 14;
const TAXI_AFTER_DROP_WAIT = 10;
const TAXI_WALK_OFF_SECONDS = 12;
const FARE_MIN_DISTANCE = 40;
const FARE_MAX_DISTANCE = 110;
const FARE_STOP_SPEED = 3;
const FARE_DESTINATIONS = [
  { name: 'the Pier', spot: 'pierStart' }, { name: 'Glasswater Plaza', spot: 'plaza' }, { name: 'The Riptide', spot: 'gangBar' },
  { name: 'the Docks', spot: 'docksYardRoad' }, { name: 'Palmetto Heights', spot: 'palmettoDrive' }, { name: 'the Strand', spot: 'strand' },
];

/**
 * The activities for a game: `shardsFound` (indices), `shardMeshes`, `race`, `racesWon`, `taxi`,
 * `busy` (a race is on, so missions wait), with init() after a new game or load, update(dt),
 * abortAll() when Sol goes down, and serialize()/restore()/reset().
 */
export function createActivities(G) {
  const L = G.world.layout.landmarks;
  const a = {
    shardsFound: new Set(),
    shardMeshes: [],
    race: null,
    racesWon: {},
    taxi: null,
    taxiTimer: TAXI_FIRST_WAIT,
    shopMarkers: [],
    safehouseMarkers: [],
    raceMarkers: [],
    busy: false,
  };

  // Shards: one small crystal per spot not yet found.
  function placeShards() {
    for (const m of a.shardMeshes) G.world.scene.remove(m);
    a.shardMeshes = [];
    L.shards.forEach((s, i) => {
      if (a.shardsFound.has(i)) return;
      // Nudge a shard off any post or wall it landed against.
      if (G.world.colliders.overlaps(s.x, s.z, 0.5)) {
        for (const [ox, oz] of SHARD_NUDGES) {
          if (!G.world.colliders.overlaps(s.x + ox, s.z + oz, 0.5)) { s.x += ox; s.z += oz; break; }
        }
      }
      const mesh = new THREE.Mesh(shardGeo, shardMat);
      mesh.position.set(s.x, G.world.layout.groundHeight(s.x, s.z) + SHARD_HOVER, s.z);
      mesh.userData.index = i;
      G.world.scene.add(mesh);
      a.shardMeshes.push(mesh);
    });
  }

  function updateShards(dt) {
    const p = G.player;
    for (let i = a.shardMeshes.length - 1; i >= 0; i -= 1) {
      const m = a.shardMeshes[i];
      m.rotation.y += dt * 1.6;
      m.position.y = G.world.layout.groundHeight(m.position.x, m.position.z) + SHARD_HOVER + Math.sin(G.world.time * 2 + i) * 0.15;
      if (Math.hypot(p.x - m.position.x, p.z - m.position.z) < SHARD_PICKUP_RADIUS) {
        a.shardsFound.add(m.userData.index);
        G.world.scene.remove(m);
        a.shardMeshes.splice(i, 1);
        G.economy.addMoney(ECONOMY.shardPrize, 'sea-glass shard');
        G.economy.stat('shards', 1);
        G.economy.addRep(ECONOMY.shardRep);
        G.audio.play('pickup');
        G.effects.sparks(m.position.x, m.position.y, m.position.z, 14, '#8ff7ee');
        const n = a.shardsFound.size;
        G.notify(`Sea-glass shard ${n} / ${ECONOMY.shardCount}`);
        if (n === ECONOMY.shardCount) {
          G.economy.addMoney(ECONOMY.shardsBonus, 'all shards found!');
          G.economy.addRep(ECONOMY.shardsBonusRep);
        }
      }
    }
  }

  // Paint shops.
  function placeShops() {
    for (const shop of L.carShops) {
      const m = G.markers.add(shop.x, shop.z, {
        radius: 3.5, color: '#37f3ff', kind: 'shop', label: shop.name, needVehicle: true, once: false,
        onEnter() {
          const v = G.player.vehicle;
          if (!v) return;
          if (!G.economy.spend(ECONOMY.repaintPrice, `${shop.name} respray`)) return;
          const colors = v.spec.colors.filter((c) => c !== v.color);
          G.fleet.repaint(v, colors.length ? colors[Math.floor(frand() * colors.length)] : v.color);
          G.fleet.repair(v);
          if (G.wanted.stars > 0 && G.wanted.stars <= 3) {
            G.wanted.clear();
            G.notify('New paint, new car: the cops lost you');
          } else if (G.wanted.stars > 3) G.notify('Too hot for a respray to help');
          G.audio.play('spray');
          G.effects.smoke(v.x, v.y + 1, v.z, { size: 3, color: v.color, life: 1.2 });
        },
      });
      a.shopMarkers.push(m);
    }
  }

  // Safehouses: save, heal, buy.
  function placeSafehouses() {
    for (const def of ECONOMY.safehouses) {
      const spot = L.safehouses[def.id];
      const m = G.markers.add(spot.x, spot.z, {
        radius: 2.6, color: '#8bff6b', kind: 'safehouse', label: def.name, needFoot: true, once: false, beam: true,
        onEnter() {
          if (G.economy.ownsSafehouse(def.id)) G.menus.openSafehouse(def);
          else G.menus.openPurchase(def);
        },
      });
      a.safehouseMarkers.push(m);
    }
  }

  // Races.
  function placeRaces() {
    for (const race of L.races) {
      const n = G.world.layout.intersectionAt(race.start.i, race.start.j);
      const x = n.x + 1.75;
      const z = n.z - 18;
      const m = G.markers.add(x, z, {
        radius: 4, color: '#ff6ad5', kind: 'race', label: race.name, needVehicle: true, once: false,
        onEnter() {
          if (a.race || G.missions.current) return;
          startRace(race);
        },
      });
      a.raceMarkers.push(m);
    }
  }

  /** The world positions of a race's checkpoints (intersection centres), computed once per race. */
  function checkpointPoints(race) {
    return race.checkpoints.map(([i, j]) => {
      const n = G.world.layout.intersectionAt(i, j);
      return { x: n.x, z: n.z };
    });
  }

  /** Line up two rivals beside Sol's car and start the countdown. */
  function startRace(race) {
    const v = G.player.vehicle;
    if (!v) return;
    a.busy = true;
    const rivals = [];
    for (let k = 0; k < RIVAL_SPECS.length; k += 1) {
      const spec = RIVAL_SPECS[k];
      const side = k === 0 ? 1 : -1;
      const rx = v.x + (k + 1) * 4.2 * -Math.cos(v.yaw) * side;
      const rz = v.z + (k + 1) * 4.2 * Math.sin(v.yaw) * side;
      const rv = G.fleet.spawn(spec.type, rx, rz, v.yaw, { role: 'racer', mission: true, color: spec.color });
      const ai = createDriver(rv, G.nav, { limit: spec.limit, ignoreLights: true });
      ai.setRoad();
      rv.ai = ai;
      rv.driver = { kind: 'ped', look: null };
      rivals.push({ v: rv, next: 0 });
    }
    a.race = { def: race, points: checkpointPoints(race), next: 0, time: 0, countdown: RACE_COUNTDOWN, rivals, marker: null, started: false, outOfCar: 0 };
    G.hud.setObjective(`${race.name}: get ready`);
    G.notify(`${race.name} — ${race.checkpoints.length} checkpoints, $${ECONOMY.racePrize[0]} to win`);
    G.audio.play('countdown');
    setCheckpoint();
  }

  function setCheckpoint() {
    const r = a.race;
    if (r.marker) G.markers.remove(r.marker);
    const pos = r.points[r.next];
    r.marker = G.markers.add(pos.x, pos.z, { radius: 7, color: '#ffd166', kind: 'checkpoint', label: `Checkpoint ${r.next + 1}`, once: false, needVehicle: true, onEnter: passCheckpoint });
    G.hud.setWaypoint(pos.x, pos.z, 'checkpoint');
  }

  function passCheckpoint() {
    const r = a.race;
    if (!r || !r.started) return;
    r.next += 1;
    G.audio.play('checkpoint');
    if (r.next >= r.def.checkpoints.length) finishRace();
    else {
      setCheckpoint();
      G.hud.setObjective(`${r.def.name}: checkpoint ${r.next + 1} / ${r.def.checkpoints.length}`);
    }
  }

  /** Tear the race down (a rival car Sol has taken for herself stays with her). */
  function endRace() {
    const r = a.race;
    if (!r) return;
    if (r.marker) G.markers.remove(r.marker);
    for (const rv of r.rivals) if (rv.v.driver !== G.player) G.fleet.remove(rv.v);
    a.race = null;
    a.busy = false;
    G.hud.setObjective('');
    G.hud.setWaypoint(null);
  }

  const rivalFinished = (r, rv) => rv.next >= r.points.length;

  /** Sol crossed the last checkpoint: place by the rivals already home, prize and rep for a win or second. */
  function finishRace() {
    const r = a.race;
    const ahead = r.rivals.filter((rv) => rivalFinished(r, rv)).length;
    const place = ahead + 1;
    const prize = place === 1 ? ECONOMY.racePrize[0] : place === 2 ? Math.floor(ECONOMY.racePrize[0] * ECONOMY.raceSecondShare) : 0;
    const rep = place === 1 ? ECONOMY.raceRep : 0;
    G.economy.stat('races', 1);
    if (place === 1) {
      a.racesWon[r.def.id] = (a.racesWon[r.def.id] || 0) + 1;
      G.economy.addRep(rep);
    }
    G.menus.showResult({
      title: place === 1 ? 'RACE WON' : `FINISHED ${place}${place === 2 ? 'ND' : 'RD'}`,
      lines: [`${r.def.name}`, `Time ${r.time.toFixed(1)} s`, prize ? `Prize $${prize.toLocaleString()}` : 'No prize'],
      money: prize, rep,
    });
    if (prize) G.economy.addMoney(prize);
    endRace();
  }

  /** Countdown, then drive the rivals checkpoint to checkpoint; abandon when Sol leaves her car or both rivals finish. */
  function updateRace(dt) {
    const r = a.race;
    if (!r) return;
    const p = G.player;
    if (!r.started) {
      r.countdown -= dt;
      const n = Math.ceil(r.countdown);
      G.hud.setObjective(n > 0 ? `${r.def.name}: ${n}` : `${r.def.name}: GO!`);
      if (r.countdown <= 0) {
        r.started = true;
        G.audio.play('go');
        for (const rv of r.rivals) if (rv.v.ai) rv.v.ai.routeTo(r.points[0].x, r.points[0].z);
      }
      if (p.vehicle) {
        p.vehicle.ctrl.throttle = 0;
        p.vehicle.ctrl.brake = 1;
      }
      return;
    }
    r.time += dt;
    for (const rv of r.rivals) {
      // A rival whose car Sol stole (its driver fled, its AI is gone) is out of the race.
      if (!rv.v.ai || rivalFinished(r, rv)) continue;
      const pos = r.points[rv.next];
      const d = Math.hypot(rv.v.x - pos.x, rv.v.z - pos.z);
      if (d < RIVAL_CHECKPOINT_RADIUS) {
        rv.next += 1;
        if (rv.next < r.points.length) rv.v.ai.routeTo(r.points[rv.next].x, r.points[rv.next].z);
        else rv.v.ai.limit = RIVAL_COOLDOWN_SPEED;
      } else if (!rv.v.ai.routeDirs || rv.v.ai.routeDirs.length === 0) {
        rv.v.ai.routeTo(pos.x, pos.z);
      }
      rv.v.ai.step(dt, G.traffic.ctx);
    }
    if (p.state !== 'car') {
      r.outOfCar += dt;
      if (r.outOfCar > RACE_ABANDON_SECONDS) {
        G.notify('Race abandoned');
        endRace();
        return;
      }
    } else r.outOfCar = 0;
    if (r.rivals.every((rv) => rivalFinished(r, rv))) {
      G.notify('Both rivals finished. Race lost.');
      endRace();
    }
  }

  /** Taxi fares: only while Sol drives a cab; a fare left waiting or carried out of the cab for too long gives up. */
  function updateTaxi(dt) {
    const p = G.player;
    const inTaxi = p.state === 'car' && p.vehicle && p.vehicle.type === 'taxi';
    const t = a.taxi;
    if (!inTaxi) {
      if (t && t.phase === 'ride') {
        t.outTimer += dt;
        if (t.outTimer > TAXI_WALK_OFF_SECONDS) {
          G.notify('The fare walked off');
          cancelTaxi();
        }
      } else if (t) cancelTaxi();
      return;
    }
    if (!t) {
      a.taxiTimer -= dt;
      if (a.taxiTimer <= 0 && !G.missions.current && !a.race) {
        const spot = pickSidewalkSpot(p.x, p.z, FARE_MIN_DISTANCE, FARE_MAX_DISTANCE);
        if (spot) {
          const ped = G.pedestrians.spawnFare(spot.x, spot.z);
          const m = G.markers.add(spot.x, spot.z, { radius: 5, color: '#ffd43b', kind: 'taxi', label: 'Fare', needVehicle: true, once: true, onEnter: () => pickUpFare() });
          a.taxi = { phase: 'pickup', ped, marker: m, spot, outTimer: 0 };
          G.hud.setObjective('Taxi: pick up the fare');
          G.hud.setWaypoint(spot.x, spot.z, 'taxi');
          G.notify('A fare is waving you down');
        }
        a.taxiTimer = TAXI_NEXT_WAIT;
      }
      return;
    }
    if (t.phase === 'ride') {
      t.time += dt;
      G.hud.setObjective(`Taxi: drop the fare at ${t.destName}  (${Math.round(Math.hypot(p.x - t.dest.x, p.z - t.dest.z))} m)`);
    }
  }

  /** A random sidewalk corner between minD and maxD metres from (x, z), or null. */
  function pickSidewalkSpot(x, z, minD, maxD) {
    const nodes = G.world.layout.walk.nodes;
    const candidates = [];
    for (const n of nodes) {
      const d = Math.hypot(n.x - x, n.z - z);
      if (d >= minD && d <= maxD) candidates.push(n);
    }
    if (!candidates.length) return null;
    const n = candidates[Math.floor(frand() * candidates.length)];
    return { x: n.x, z: n.z };
  }

  /** A fare marker that fires again when Sol has stopped (the first pass through it may be too fast). */
  function fareMarker(x, z, onEnter, label = '') {
    return G.markers.add(x, z, { radius: 5, color: '#ffd43b', kind: 'taxi', label, needVehicle: true, once: true, onEnter });
  }

  /** Sol stopped by the fare: they get in and name a destination. */
  function pickUpFare() {
    const t = a.taxi;
    if (!t || t.phase !== 'pickup') return;
    const p = G.player;
    if (!p.vehicle || Math.abs(p.vehicle.speed) > FARE_STOP_SPEED) {
      G.notify('Stop next to the fare');
      t.marker = fareMarker(t.spot.x, t.spot.z, pickUpFare);
      return;
    }
    G.pedestrians.removePed(t.ped);
    const dest = FARE_DESTINATIONS[Math.floor(frand() * FARE_DESTINATIONS.length)];
    const spot = dest.spot === 'strand' ? L.safehouses.strand : L[dest.spot];
    t.phase = 'ride';
    t.dest = { x: spot.x, z: spot.z };
    t.destName = dest.name;
    t.time = 0;
    t.startDist = Math.hypot(p.x - t.dest.x, p.z - t.dest.z);
    t.marker = fareMarker(t.dest.x, t.dest.z, dropFare);
    G.hud.setWaypoint(t.dest.x, t.dest.z, 'taxi');
    G.audio.play('door');
    G.say('Fare', `Take me to ${t.destName}, and step on it.`, 3);
  }

  /** Sol stopped at the destination: the fare pays by the straight-line distance, more for a quick ride. */
  function dropFare() {
    const t = a.taxi;
    if (!t || t.phase !== 'ride') return;
    const p = G.player;
    if (!p.vehicle || Math.abs(p.vehicle.speed) > FARE_STOP_SPEED) {
      G.notify('Stop to let the fare out');
      t.marker = fareMarker(t.dest.x, t.dest.z, dropFare);
      return;
    }
    const fast = t.time < t.startDist / ECONOMY.taxiFastSpeed;
    const pay = Math.round(ECONOMY.taxiBase + t.startDist * ECONOMY.taxiPerMetre * (fast ? ECONOMY.taxiFastBonus : 1));
    G.economy.addMoney(pay, 'taxi fare');
    G.economy.stat('fares', 1);
    G.economy.addRep(ECONOMY.taxiRep);
    G.say('Fare', fast ? 'Fast! Keep the change.' : 'Thanks for the ride.', 2.5);
    a.taxi = null;
    a.taxiTimer = TAXI_AFTER_DROP_WAIT;
    G.hud.setObjective('');
    G.hud.setWaypoint(null);
  }

  /** Drop the current fare job, its marker and its waiting passenger. */
  function cancelTaxi() {
    const t = a.taxi;
    if (!t) return;
    if (t.marker && !t.marker.removed) G.markers.remove(t.marker);
    if (t.ped && !t.ped.removed) G.pedestrians.removePed(t.ped);
    a.taxi = null;
    G.hud.setObjective('');
    G.hud.setWaypoint(null);
  }

  /** Per step: shards spin and are collected, the race runs, the taxi job advances. */
  a.update = (dt) => {
    updateShards(dt);
    updateRace(dt);
    updateTaxi(dt);
  };
  /** Place every marker and shard for the current progress (after a new game or a load). */
  a.init = () => {
    for (const m of [...a.shopMarkers, ...a.safehouseMarkers, ...a.raceMarkers]) G.markers.remove(m);
    a.shopMarkers = [];
    a.safehouseMarkers = [];
    a.raceMarkers = [];
    placeShards();
    placeShops();
    placeSafehouses();
    placeRaces();
  };
  /** End any race or fare in progress (Sol died, was arrested, or the world is being reset). */
  a.abortAll = () => {
    if (a.race) endRace();
    cancelTaxi();
  };
  a.serialize = () => ({ shards: [...a.shardsFound], racesWon: { ...a.racesWon } });
  /** Put the shard and race progress back from a save (missing or malformed parts read as none). */
  a.restore = (data) => {
    a.shardsFound = new Set(data && Array.isArray(data.shards) ? data.shards : []);
    a.racesWon = data && data.racesWon && typeof data.racesWon === 'object' ? { ...data.racesWon } : {};
    placeShards();
  };
  /** A new game: nothing found or won. */
  a.reset = () => {
    a.shardsFound = new Set();
    a.racesWon = {};
    a.abortAll();
    placeShards();
  };
  a.raceActive = () => !!a.race;
  return a;
}
