// HALCYON HEAT boot and game loop. Builds Halcyon Bay and every system, runs the title screen,
// new game / continue / load, the fixed-step simulation, pause, the map, hospital and arrest, and
// exposes window.__game for the playtest and the screenshot scenes (?shot=name&seed=n, ?test=1).
import * as THREE from 'three';
import { storyMissions } from './missions/story.js';
import { createMissions } from './missions/missions.js';
import { createWanted } from './wanted.js';
import { createPolice } from './police.js';
import { createWeapons } from './weapons.js';
import { createCombat } from './combat.js';
import { createGangs } from './gangs.js';
import { createEconomy } from './economy.js';
import { createSave } from './save.js';
import { createActivities } from './activities.js';
import { createPlayer } from './player.js';
import { createCamera } from './camera.js';
import { createFleet } from './vehicles/fleet.js';
import { setVehicleEnvironment } from './vehicles/models.js';
import { createTraffic } from './traffic.js';
import { createPedestrians } from './pedestrians.js';
import { createMarkers } from './markers.js';
import { createHud } from './hud/hud.js';
import { createMinimap } from './hud/minimap.js';
import { createMapScreen } from './mapscreen.js';
import { createMenus } from './menus.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createRadio } from './radio.js';
import { createInput, KEYS } from './input.js';
import { createNavigation } from './navigation.js';
import { createWorld } from './world.js';
import { stageShot } from './shots.js';
import { CAMERA, PHYSICS, TIME, WANTED } from './config.js';
import { seedShared } from './rng.js';

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const SEED = Number.isInteger(seedParam) ? seedParam : 1;
const testMode = params.get('test') === '1';
seedShared(SEED * 7919 + 13);

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.98;

/** The game context every system shares. */
const G = {
  seed: SEED, state: 'loading', renderer, canvas, testMode,
  settings: { volume: 0.8, music: 0.7, sensitivity: CAMERA.sensitivity, invertY: false, shadows: true },
  events: createEvents(),
  storyMissions,
};
window.__game = G;

function createEvents() {
  const handlers = new Map();
  return {
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, []);
      handlers.get(name).push(fn);
    },
    emit(name, ...args) {
      for (const fn of handlers.get(name) || []) fn(...args);
    },
  };
}

G.world = createWorld(SEED);
G.world.sky.buildEnvironment(renderer);
setVehicleEnvironment(G.world.sky.state.envMap);
G.nav = createNavigation(G.world.layout);
G.input = createInput(canvas);
G.input.state.testMode = testMode;
G.audio = createAudio();
G.radio = createRadio(G.audio);
G.camera = createCamera(window.innerWidth / window.innerHeight);
G.effects = createEffects(G.world.scene, G.world.textures);
G.hud = createHud(G);
G.notify = (text) => G.hud.notify(text);
G.say = (name, text, seconds, color) => G.hud.say(name, text, seconds, color);
G.fleet = createFleet(G.world, G.effects);
G.combat = createCombat(G);
G.player = createPlayer(G);
G.weapons = createWeapons(G);
G.economy = createEconomy(G);
G.wanted = createWanted(G);
G.pedestrians = createPedestrians(G);
G.traffic = createTraffic(G);
G.police = createPolice(G);
G.gangs = createGangs(G);
G.markers = createMarkers(G);
G.activities = createActivities(G);
G.missions = createMissions(G);
G.save = createSave(G);
G.minimap = createMinimap(G, document.getElementById('minimap'));
G.menus = createMenus(G, document.getElementById('menus'));
G.mapscreen = createMapScreen(G, document.getElementById('mapscreen'), document.getElementById('map-canvas'), G.minimap.map);

G.fleet.onExplosion((v) => G.combat.explosion(v.x, v.y + 0.5, v.z, v));
G.fleet.onImpact((v, closing, other) => {
  const p = G.player;
  const d = Math.hypot(v.x - p.x, v.z - p.z);
  if (d < 70) G.audio.play(closing > 9 ? 'crash' : 'scrape', Math.max(0.2, 1 - d / 70));
  if (closing > 6) G.effects.sparks(v.x, v.y + 0.5, v.z, 6);
  if (other && other.driver === p && v.driver && v.driver.kind === 'officer') { G.wanted.crime('ramPolice', v.x, v.z); G.wanted.noticePlayer(); }
  if (v.driver === p && other && other.driver && other.driver.kind === 'officer') G.wanted.noticePlayer();
});
G.events.on('playerDied', () => {
  G.missions.onPlayerDown('died');
  G.activities.abortAll();
  G.deathTimer = 2.4;
});
G.events.on('arrested', () => {
  if (G.player.dead || G.player.surrender) return;
  G.player.surrender = true;
  G.missions.onPlayerDown('arrested');
  G.activities.abortAll();
  G.arrestTimer = 1.6;
});

function applySettings(s) {
  Object.assign(G.settings, s);
  G.audio.setVolume(G.settings.volume);
  G.audio.setMusicVolume(G.settings.music);
  G.input.state.settings.sensitivity = G.settings.sensitivity;
  G.input.state.settings.invertY = G.settings.invertY;
  G.world.sky.sun.castShadow = G.settings.shadows;
  G.save.saveSettings(G.settings);
}
G.applySettings = applySettings;
applySettings(G.save.loadSettings() || {});

/** Everything dynamic goes: cars, people, police, markers of a run. */
G.resetWorldState = () => {
  G.traffic.clear();
  G.pedestrians.clear();
  G.police.clearAll();
  G.gangs.clear();
  for (const v of [...G.fleet.vehicles]) G.fleet.remove(v);
  G.activities.abortAll();
  for (const m of [...G.markers.list]) G.markers.remove(m);
  G.missions.reset();
  G.wanted.clear();
  G.hud.setObjective('');
  G.hud.setWaypoint(null);
  G.hud.setTimer(null);
  G.hud.state.subs.length = 0;
  G.deathTimer = 0;
  G.arrestTimer = 0;
};

function startPlaying() {
  G.state = 'playing';
  G.menus.hide();
  G.mapscreen.hide();
  G.hud.show(true);
  G.audio.unlock();
  G.input.captureMouse();
  G.input.setEnabled(true);
}

G.newGame = () => {
  G.resetWorldState();
  G.economy.reset();
  G.activities.reset();
  G.weapons.restore({ current: 'fists', inv: { fists: { owned: true, ammo: -1, clip: -1 }, pistol: { owned: false, ammo: 0, clip: 0 }, smg: { owned: false, ammo: 0, clip: 0 }, shotgun: { owned: false, ammo: 0, clip: 0 } } });
  G.gangs.setHostile(false);
  G.world.sky.setHour(TIME.startHour);
  const L = G.world.layout.landmarks;
  G.player.revive(L.start.x, L.start.z, 0);
  G.camera.snapTo(0, 0.26);
  const park = L.safehouses.strand.park;
  G.fleet.spawn('sedan', park.x, park.z, Math.PI / 2, { color: '#8d99ae', role: 'player', owner: 'player', parked: true });
  G.activities.init();
  G.missions.init();
  G.hud.showHelp(true);
  startPlaying();
  G.say('Sol', 'Halcyon Bay. Five years, and the sun still sets over the docks.', 4, '#ffb347');
  G.say('Sol', "Teo's shop is in Saltmarsh. Let's see what trouble he is in.", 4, '#ffb347');
  G.hud.hint("Follow the yellow M on the minimap to Teo's Body Shop");
};

G.continueGame = () => {
  const latest = G.save.latest();
  if (!latest) return;
  G.loadGame(latest.slot);
};

G.loadGame = (slot) => {
  if (G.save.load(slot)) {
    G.activities.init();
    startPlaying();
  }
};

G.pause = () => {
  if (G.state !== 'playing') return;
  G.state = 'paused';
  G.input.releaseMouse();
  G.menus.showPause();
};
G.resume = () => {
  G.menus.hide();
  G.mapscreen.hide();
  startPlaying();
};
G.pauseFor = (kind) => {
  G.state = kind === 'death' ? 'death' : 'menu';
  G.input.releaseMouse();
};
G.openMap = () => {
  if (G.state !== 'playing' && G.state !== 'paused') return;
  G.state = 'map';
  G.menus.hide();
  G.input.releaseMouse();
  G.mapscreen.show();
};
G.closeMap = () => {
  G.mapscreen.hide();
  startPlaying();
};
G.quitToTitle = () => {
  G.resetWorldState();
  G.state = 'title';
  G.hud.show(false);
  G.input.releaseMouse();
  G.menus.showTitle();
};

function hospitalize() {
  const fee = Math.min(G.economy.money, WANTED.hospitalFee);
  G.menus.showDeath('HOSPITALIZED', fee, () => {
    G.economy.money -= fee;
    G.economy.stat('hospital', 1);
    G.wanted.clear();
    G.police.clearAll();
    const h = G.world.layout.landmarks.hospital;
    G.player.revive(h.x, h.z, Math.PI);
    G.camera.snapTo(Math.PI, 0.26);
    G.resume();
    G.notify(`You wake up at ${h.name}`);
  });
}

function arrest() {
  const fee = Math.min(G.economy.money, WANTED.arrestFee);
  G.menus.showDeath('ARRESTED', fee, () => {
    G.economy.money -= fee;
    G.economy.stat('arrests', 1);
    G.wanted.clear();
    G.police.clearAll();
    for (const id of ['pistol', 'smg', 'shotgun']) { G.weapons.inv[id].ammo = 0; G.weapons.inv[id].clip = 0; }
    const s = G.world.layout.landmarks.policeStation;
    G.player.revive(s.x, s.z, Math.PI);
    G.camera.snapTo(Math.PI, 0.26);
    G.resume();
    G.notify(`Released from ${s.name}`);
  });
}

/** One simulation step of h seconds (edge-triggered keys only count on the first substep of a frame). */
function step(h) {
  const p = G.player;
  p.update(h, G.input);
  G.weapons.update(h, G.input);
  G.fleet.update(h, G.world.time);
  G.traffic.update(h);
  G.pedestrians.update(h);
  G.police.update(h);
  G.wanted.update(h);
  G.gangs.update(h);
  G.markers.update(h);
  G.missions.update(h);
  G.activities.update(h);
  G.effects.update(h);
  G.economy.stats.playtime += h;
  G.world.update(h, p.focus(focusV), G.camera.camera.position);
  if (G.deathTimer > 0) {
    G.deathTimer -= h;
    if (G.deathTimer <= 0) hospitalize();
  }
  if (G.arrestTimer > 0) {
    G.arrestTimer -= h;
    if (G.arrestTimer <= 0) arrest();
  }
}

const focusV = new THREE.Vector3();

function simulate(dt, stepSize = PHYSICS.subStep) {
  const n = Math.max(1, Math.ceil(dt / stepSize - 1e-6));
  const h = dt / n;
  for (let i = 0; i < n; i += 1) {
    G.input.state.edgesEnabled = i === 0;
    step(h);
  }
  G.input.state.edgesEnabled = true;
}
G.simulate = simulate;

function handleFrameKeys() {
  const input = G.input;
  if (G.state === 'playing') {
    if (input.wasPressed(KEYS.pause)) { G.pause(); return; }
    if (input.wasPressed(KEYS.map)) { G.openMap(); return; }
    if (input.wasPressed(KEYS.radio) && G.player.state === 'car') { G.radio.next(); G.notify(`Radio: ${G.radio.stationName()}`); }
    if (input.wasPressed(KEYS.dialogueSkip)) G.hud.skipLine();
    if (input.clicked() && !input.locked) input.captureMouse();
  } else if (G.state === 'map') {
    if (input.wasPressed(KEYS.map) || input.wasPressed(KEYS.pause)) G.closeMap();
  } else if (G.state === 'paused' || G.state === 'menu') {
    G.menus.handleKeys(input);
  } else if (G.state === 'title') {
    if (input.wasPressed('Enter')) G.newGame();
  }
}

const titleFocus = new THREE.Vector3();
function titleCamera(dt) {
  const L = G.world.layout;
  const t = G.world.time * 0.05;
  const cx = L.roadX(5);
  const cz = L.oceanZ - 40;
  const cam = G.camera.camera;
  cam.position.set(cx + Math.cos(t) * 140, 38 + Math.sin(t * 0.7) * 6, cz + Math.sin(t) * 120);
  titleFocus.set(cx, 10, cz);
  cam.lookAt(titleFocus);
  G.world.update(dt, titleFocus, cam.position);
  G.fleet.update(dt, G.world.time);
  G.traffic.update(dt);
  G.effects.update(dt);
}

let last = performance.now();
let frames = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const rawDt = Math.min(1, Math.max(0, (now - last) / 1000));
  const dt = Math.min(PHYSICS.maxFrame, rawDt);
  last = now;
  frames += 1;
  handleFrameKeys();
  if (G.state === 'playing') {
    if (!testMode) simulate(dt);
    G.camera.update(dt, G.player.focus(focusV), G.player.state === 'car' ? 'car' : 'foot', G.player.vehicle, G.input, G.world.colliders, window.innerWidth);
    G.hud.update(dt);
    G.minimap.update(dt);
    G.audio.updateEngine(G.player.vehicle, dt);
    G.radio.update(dt, G.player.state === 'car');
  } else if (G.state === 'title') {
    titleCamera(dt);
    G.radio.update(dt, false);
  } else {
    // Menu timers (hospital, arrest) run on wall-clock time, not the clamped step.
    G.menus.update(rawDt);
    G.radio.update(dt, false);
    G.audio.updateEngine(null, dt);
    if (G.state === 'death' || G.state === 'menu') {
      // Keep the world alive behind the overlay, lightly.
      G.effects.update(dt);
      G.hud.update(dt);
      G.minimap.update(dt);
    }
  }
  renderer.render(G.world.scene, G.camera.camera);
  G.audio.endFrame();
  // In test mode the harness advances the simulation itself and consumes the key presses.
  if (!testMode || G.state !== 'playing') G.input.endFrame(now / 1000);
}

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  G.camera.resize(window.innerWidth, window.innerHeight);
});
window.addEventListener('mousedown', () => G.audio.unlock(), { once: false });
window.addEventListener('keydown', () => G.audio.unlock(), { once: false });

/** The test harness: advance the simulation deterministically and render on demand. */
G.advance = (seconds, stepSize = PHYSICS.subStep) => {
  handleFrameKeys();
  if (G.state !== 'playing') {
    // The press was consumed here; the frame loop must not act on it again.
    G.input.endFrame(G.world.time);
    return;
  }
  let left = seconds;
  while (left > 1e-6) {
    const dt = Math.min(PHYSICS.maxFrame, left);
    simulate(dt, stepSize);
    G.camera.update(dt, G.player.focus(focusV), G.player.state === 'car' ? 'car' : 'foot', G.player.vehicle, G.input, G.world.colliders, window.innerWidth);
    G.hud.update(dt);
    G.input.endFrame(G.world.time);
    left -= dt;
  }
};
G.render = () => {
  renderer.render(G.world.scene, G.camera.camera);
  G.minimap.update(0);
};
G.frames = () => frames;

if (shotName) {
  G.state = 'shot';
  stageShot(shotName, G).then(() => {
    let painted = 0;
    const paint = () => {
      G.hud.update(0.016);
      G.minimap.update(0.016);
      if (G.mapscreen.open) G.mapscreen.draw();
      renderer.render(G.world.scene, G.camera.camera);
      painted += 1;
      if (painted < 3) requestAnimationFrame(paint);
      else window.__shotReady = true;
    };
    requestAnimationFrame(paint);
  });
} else {
  G.state = 'title';
  G.hud.show(false);
  G.menus.showTitle();
  requestAnimationFrame(frame);
}
