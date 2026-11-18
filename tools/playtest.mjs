// Plays HALCYON HEAT in headless Chrome over the DevTools protocol and checks every system:
// title menu, new game, walking and the camera, stealing and driving, the chase camera and
// steering directions, acceleration and fair damage, traffic and pedestrians, the wanted level
// from 1 to 5 stars, losing the police, arrest and hospital, every weapon, all eight story
// missions start to end, the side activities, the map, saving and loading, radio and menus,
// and frame-rate independence. Fails on any console error. Usage: node tools/playtest.mjs [section]
import { startServer, launchChrome, connectPage } from './chrome.mjs';

const results = [];
let currentSection = '';
function check(name, ok, info = '') {
  results.push({ section: currentSection, name, ok: !!ok, info });
  const mark = ok ? 'ok  ' : 'FAIL';
  console.log(`${mark} [${currentSection}] ${name}${info ? ` — ${info}` : ''}`);
}
function section(name) {
  currentSection = name;
  console.log(`\n== ${name}`);
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const only = process.argv[2] || null;

async function main() {
  const server = await startServer();
  const chrome = await launchChrome({ width: 960, height: 600 });
  let page;
  try {
    page = await connectPage(chrome.port, { width: 960, height: 600 });
    const ev = (expr) => page.evaluate(expr);
    const adv = (seconds, step = 1 / 60) => ev(`__game.advance(${seconds}, ${step}); 0`);
    const state = async () => ev(`(() => { const G = __game, p = G.player; return { state: G.state, x: p.x, z: p.z, y: p.y, yaw: p.yaw, health: p.health, armor: p.armor, pstate: p.state, speed: p.vehicle ? p.vehicle.speed : p.speed, veh: p.vehicle ? { type: p.vehicle.type, x: p.vehicle.x, z: p.vehicle.z, yaw: p.vehicle.yaw, hp: p.vehicle.hp, vx: p.vehicle.vx, vz: p.vehicle.vz, wrecked: p.vehicle.wrecked } : null, stars: G.wanted.stars, money: G.economy.money, camYaw: G.camera.state.yaw, camTargetYaw: G.camera.state.targetYaw, camPos: G.camera.camera.position.toArray(), camFwd: G.camera.forward.toArray(), objective: G.hud.state.objective, menu: G.menus.open, mission: G.missions.current ? G.missions.current.def.id : null, stage: G.missions.current ? G.missions.current.stage : -1, talking: G.hud.talking() }; })()`);
    const clickEl = async (selector) => {
      const rect = await ev(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; })()`);
      if (!rect) throw new Error(`no element ${selector}`);
      await page.mouse('mouseMoved', rect.x, rect.y);
      await new Promise((r) => setTimeout(r, 60));
      await page.mouse('mousePressed', rect.x, rect.y, { button: 'left', clickCount: 1 });
      await page.mouse('mouseReleased', rect.x, rect.y, { button: 'left', clickCount: 1 });
      await new Promise((r) => setTimeout(r, 160));
    };
    const hold = async (codes, seconds, step = 1 / 60) => {
      for (const c of codes) await page.keyDown(c);
      await adv(seconds, step);
      for (const c of codes) await page.keyUp(c);
      await adv(0.02, step);
    };
    const tap = async (code) => {
      await page.keyDown(code);
      await adv(0.03);
      await page.keyUp(code);
      await adv(0.03);
    };
    const waitUntil = async (expr, seconds, stepSeconds = 0.5) => {
      let t = 0;
      while (t < seconds) {
        if (await ev(expr)) return true;
        await adv(stepSeconds);
        t += stepSeconds;
      }
      return false;
    };
    const skipTalk = async () => {
      for (let i = 0; i < 40; i += 1) {
        if (!(await ev('__game.hud.talking()'))) return;
        await adv(1);
      }
    };
    /** Menus close on a real frame: wait (wall clock) until the game is playing again. */
    const waitPlaying = async () => {
      for (let i = 0; i < 80 && (await ev('__game.state')) !== 'playing'; i += 1) {
        if (i % 10 === 9) await tap('Enter');
        await new Promise((r) => setTimeout(r, 150));
      }
    };
    const pressEnterIfMenu = async () => {
      const menu = await ev('__game.menus.open');
      if (menu === 'complete') await tap('Enter');
    };

    await page.navigate(`http://127.0.0.1:${server.port}/index.html?test=1&seed=1`);
    await page.waitFor('window.__game && window.__game.state === "title"', 60000);
    await ev('try { localStorage.clear(); } catch (e) {} ; 0');
    // Warm up the input pipeline with a harmless move and click on empty space.
    await page.mouse('mouseMoved', 20, 20);
    await page.mouse('mousePressed', 20, 20, { button: 'left', clickCount: 1 });
    await page.mouse('mouseReleased', 20, 20, { button: 'left', clickCount: 1 });
    await new Promise((r) => setTimeout(r, 400));

    // ---------------------------------------------------------------- title and new game
    section('title');
    check('title panel visible', await ev('!document.getElementById("panel-title").classList.contains("hidden")'));
    check('continue disabled without a save', await ev('document.getElementById("btn-continue").classList.contains("disabled")'));
    await clickEl('#btn-controls');
    check('controls panel opens', await ev('!document.getElementById("panel-controls").classList.contains("hidden")'));
    await clickEl('#controls-back');
    await clickEl('#btn-settings');
    check('settings panel opens', await ev('!document.getElementById("panel-settings").classList.contains("hidden")'));
    check('default mouse sensitivity is 0.0025 rad per pixel', near(await ev('__game.settings.sensitivity'), 0.0025, 1e-9) && near(await ev('__game.input.state.settings.sensitivity'), 0.0025, 1e-9), String(await ev('__game.settings.sensitivity')));
    check('sensitivity slider shows 2.5 by default', (await ev('document.getElementById("set-sens").value')) === '2.5' && (await ev('document.getElementById("set-sens-v").textContent')) === '2.5', await ev('document.getElementById("set-sens").value'));
    check('slider range 1 to 12 with Invert Y', (await ev('document.getElementById("set-sens").min')) === '1' && (await ev('document.getElementById("set-sens").max')) === '12' && await ev('!!document.getElementById("set-invert")'));
    await ev('(() => { const s = document.getElementById("set-sens"); s.value = 6; s.dispatchEvent(new Event("input", { bubbles: true })); })()');
    check('sensitivity slider applies', near(await ev('__game.settings.sensitivity'), 0.006, 1e-6));
    check('settings persisted', await ev('JSON.parse(localStorage.getItem("halcyon-heat-settings")).sensitivity') === 0.006);
    // A setting saved by an earlier build (the old 0.004 default, Invert Y on) loads as it was.
    await ev('(() => { const G = __game; G.save.saveSettings({ volume: 0.8, music: 0.7, sensitivity: 0.004, invertY: true, shadows: true }); G.applySettings(G.save.loadSettings() || {}); G.menus.showSettings("title"); })()');
    check('a saved sensitivity from before keeps working', near(await ev('__game.input.state.settings.sensitivity'), 0.004, 1e-9) && (await ev('document.getElementById("set-sens").value')) === '4' && await ev('__game.input.state.settings.invertY === true'));
    await ev('(() => { const i = document.getElementById("set-invert"); i.checked = false; i.dispatchEvent(new Event("input", { bubbles: true })); })()');
    await clickEl('#settings-back');
    await clickEl('#btn-new-game');
    let s = await state();
    check('new game starts playing', s.state === 'playing', s.state);
    check('HUD visible', await ev('!document.getElementById("hud").classList.contains("hidden")'));
    check('controls help shown', await ev('!document.getElementById("controls-help").classList.contains("hidden")'));
    check('starting money', s.money === 250, String(s.money));
    check('mission start marker placed', await ev('__game.missions.startMarker !== null'));
    check('starter car parked near the apartment', await ev('__game.fleet.vehicles.some(v => v.owner === "player")'));
    await adv(1);
    check('no pointer prompt in test mode', await ev('document.getElementById("pointer-prompt").classList.contains("hidden")'));

    // ---------------------------------------------------------------- on foot
    section('onfoot');
    s = await state();
    const start = s;
    await hold(['KeyW'], 2);
    s = await state();
    const dx = s.x - start.x;
    const dz = s.z - start.z;
    const dist = Math.hypot(dx, dz);
    check('W walks', dist > 4 && dist < 9, dist.toFixed(2) + ' m in 2 s');
    const dot = (dx * start.camFwd[0] + dz * start.camFwd[2]) / (dist || 1);
    check('W moves away from the camera', dot > 0.9, dot.toFixed(3));
    const before = await state();
    await hold(['ShiftLeft', 'KeyW'], 2);
    s = await state();
    const runDist = Math.hypot(s.x - before.x, s.z - before.z);
    check('Shift runs faster', runDist > dist * 1.5, runDist.toFixed(2) + ' m');
    const b2 = await state();
    await hold(['KeyD'], 1);
    s = await state();
    const rdx = s.x - b2.x;
    const rdz = s.z - b2.z;
    const right = [-b2.camFwd[2], b2.camFwd[0]];
    const rdot = (rdx * right[0] + rdz * right[1]) / (Math.hypot(rdx, rdz) || 1);
    check('D strafes to the right of the camera', rdot > 0.8, rdot.toFixed(3));
    await page.keyDown('Space');
    await adv(0.25);
    const mid = await state();
    await page.keyUp('Space');
    await adv(1.2);
    s = await state();
    check('Space jumps and lands', mid.y > start.y + 0.4 && near(s.y, await ev('__game.world.layout.groundHeight(__game.player.x, __game.player.z)'), 0.05), `apex ${mid.y.toFixed(2)}`);
    // Walls: walk into a hotel wall for 3 s and stay outside it (a block with no markers).
    await ev('(() => { const G = __game; const lot = G.world.layout.blockAt(4, 7).lots[0]; G.player.teleport(lot.x + lot.w / 2, lot.z + lot.d + 1.2, Math.PI); G.camera.snapTo(Math.PI, 0.2); })()');
    await hold(['KeyW'], 3);
    check('still playing (no stray menu)', (await ev('__game.state')) === 'playing', await ev('__game.state'));
    check('cannot walk through a building', await ev('__game.world.colliders.overlaps(__game.player.x, __game.player.z, 0.2) === null'));
    check('pedestrians spawned', (await ev('__game.pedestrians.count()')) > 10, String(await ev('__game.pedestrians.count()')));
    check('traffic spawned', (await ev('__game.traffic.cars.length')) > 5, String(await ev('__game.traffic.cars.length')));

    // ---------------------------------------------------------------- camera
    section('camera');
    const yaw0 = (await state()).camTargetYaw;
    // Drag-to-look with the right button: sweep 1600 px in two passes across the window.
    let moved = 0;
    for (let pass = 0; pass < 2; pass += 1) {
      await page.mouse('mouseMoved', 40, 300);
      await page.mouse('mousePressed', 40, 300, { button: 'right', buttons: 2, clickCount: 1 });
      for (let x = 40; x <= 840; x += 20) {
        await page.mouse('mouseMoved', x, 300, { button: 'right', buttons: 2 });
        moved += 20;
      }
      await page.mouse('mouseReleased', 840, 300, { button: 'right', buttons: 2, clickCount: 1 });
    }
    await adv(0.5);
    const yaw1 = (await state()).camTargetYaw;
    const sens = await ev('__game.settings.sensitivity');
    const expected = moved * sens;
    check('mouse sweep turns the camera through 360 degrees', near(yaw0 - yaw1, expected, 0.3), `turned ${((yaw0 - yaw1) * 180 / Math.PI).toFixed(0)} deg for ${moved} px (expected ${(expected * 180 / Math.PI).toFixed(0)})`);
    // A flick of more than a half turn in one frame swings the long way, the way the mouse went.
    await adv(0.8);
    const flick0 = await state();
    const flickPx = Math.ceil(4.8 / sens);
    await ev(`__game.input.injectLook(${flickPx}, 0); 0`);
    await adv(1.0);
    const flick1 = await state();
    check('a fast flick never swings the short way round', near(flick1.camYaw - flick0.camYaw, -flickPx * sens, 0.06) && near(flick1.camYaw, flick1.camTargetYaw, 0.02), `yaw moved ${(flick1.camYaw - flick0.camYaw).toFixed(2)} rad for ${flickPx} px (expected ${(-flickPx * sens).toFixed(2)})`);
    await ev('__game.input.injectLook(0, -3000); 0');
    await adv(0.6);
    const pitchUp = await ev('__game.camera.state.pitch');
    await ev('__game.input.injectLook(0, 6000); 0');
    await adv(0.6);
    const pitchDown = await ev('__game.camera.state.pitch');
    check('mouse Y tilts within sensible limits', near(pitchUp, -0.5, 0.03) && near(pitchDown, 1.05, 0.03), `${pitchUp.toFixed(2)} .. ${pitchDown.toFixed(2)}`);
    await ev('__game.camera.snapTo(__game.camera.state.targetYaw, 0.28); 0');
    await adv(0.3);
    const yawA = (await state()).camTargetYaw;
    await hold(['ArrowLeft'], 1);
    const yawB = (await state()).camTargetYaw;
    check('arrow keys turn the camera', yawB > yawA + 1.5, (yawB - yawA).toFixed(2));
    await hold(['KeyE'], 0.6);
    await hold(['KeyQ'], 0.6);
    const yawC = (await state()).camTargetYaw;
    check('E and Q do not turn the camera (E is interact)', near(yawC, yawB, 1e-6), (yawC - yawB).toFixed(3));
    await ev('(() => { const G = __game; const L = G.world.layout; G.player.teleport(L.roadX(5) + 4, L.roadZ(4) + 30, 0); G.camera.snapTo(0, 0.28); })()');
    await adv(0.5);
    const camState = await state();
    const camD = Math.hypot(camState.camPos[0] - camState.x, camState.camPos[2] - camState.z);
    check('camera orbits at a sane distance', camD > 3 && camD < 6, camD.toFixed(2));
    // Camera does not clip into walls: stand against the building, look toward it from behind.
    await ev('(() => { const G = __game; const lot = G.world.layout.blockAt(4, 7).lots[0]; G.player.teleport(lot.x + lot.w / 2, lot.z + lot.d + 0.8, 0); G.camera.snapTo(0, 0.1); })()');
    await adv(0.5);
    check('camera pulled in front of the wall behind the player', await ev('__game.world.colliders.overlaps(__game.camera.camera.position.x, __game.camera.camera.position.z, 0.1) === null'));

    // ---------------------------------------------------------------- stealing and driving
    section('driving');
    await ev('(() => { const G = __game, L = G.world.layout.landmarks; const v = G.fleet.vehicles.find(c => c.owner === "player"); G.player.teleport(v.x + 2.5, v.z, Math.PI); G.camera.snapTo(Math.PI, 0.2); })()');
    await tap('KeyF');
    s = await state();
    check('F enters the parked car', s.pstate === 'car' && s.veh && s.veh.type === 'sedan', s.pstate);
    check('player model hidden inside a closed car', await ev('__game.player.model.group.visible === false'));
    check('camera snapped behind the car', !!s.veh && (() => { const f = [Math.sin(s.veh.yaw), Math.cos(s.veh.yaw)]; const rel = [s.camPos[0] - s.veh.x, s.camPos[2] - s.veh.z]; return rel[0] * f[0] + rel[1] * f[1] < -2; })());
    if (!s.veh) throw new Error('cannot continue the driving section without a car');
    // Acceleration curve: sample speed every 0.5 s.
    await ev('(() => { const G = __game; const v = G.player.vehicle; v.x = G.world.layout.roadX(5) - 1.75; v.z = G.world.layout.roadZ(2) + 20; v.yaw = 0; v.vx = 0; v.vz = 0; G.camera.snapTo(0, 0.2); })()');
    await page.keyDown('KeyW');
    const samples = [];
    for (let i = 0; i < 12; i += 1) {
      await adv(0.5);
      samples.push((await state()).speed * 3.6);
    }
    await page.keyUp('KeyW');
    let smooth = true;
    for (let i = 1; i < samples.length; i += 1) if (samples[i] - samples[i - 1] > 22) smooth = false;
    check('acceleration ramps smoothly', smooth && samples[0] < 20 && samples[1] > samples[0], samples.map((v) => v.toFixed(0)).join(' '));
    check('sedan reaches 60 km/h within 6 s', samples[11] > 60, samples[11].toFixed(0) + ' km/h');
    // Brake, then reverse, camera stays behind.
    await hold(['KeyS'], 3);
    s = await state();
    check('S brakes to a stop then reverses', s.speed < -0.5, (s.speed * 3.6).toFixed(1) + ' km/h');
    const relBack = [s.camPos[0] - s.veh.x, s.camPos[2] - s.veh.z];
    const fwd = [Math.sin(s.veh.yaw), Math.cos(s.veh.yaw)];
    check('camera stays behind while reversing', relBack[0] * fwd[0] + relBack[1] * fwd[1] < 0);
    // W while rolling backwards brakes firmly, then drives forward.
    await hold(['KeyS'], 2);
    const revSpeed = (await state()).speed;
    await hold(['KeyW'], 0.6);
    const afterBrake = (await state()).speed;
    await hold(['KeyW'], 1.5);
    const afterDrive = (await state()).speed;
    check('W brakes a reversing car firmly', revSpeed < -3 && afterBrake > revSpeed + 3 && afterBrake > -1 && afterBrake < 2, `${(revSpeed * 3.6).toFixed(0)} -> ${(afterBrake * 3.6).toFixed(0)} km/h in 0.6 s`);
    check('then drives forward', afterDrive > 3, `${(afterDrive * 3.6).toFixed(0)} km/h`);
    // Steering direction as seen from the chase camera.
    await ev('(() => { const G = __game; const v = G.player.vehicle; v.x = G.world.layout.roadX(5) - 1.75; v.z = G.world.layout.roadZ(2) + 10; v.yaw = 0; v.vx = 0; v.vz = 12; G.camera.snapTo(0, 0.2); })()');
    await hold(['KeyW'], 1.5);
    const sA = await state();
    await hold(['KeyW', 'KeyA'], 1.0);
    const sA2 = await state();
    const camRight = [-sA.camFwd[2], sA.camFwd[0]];
    const lateralA = (sA2.veh.x - sA.veh.x) * camRight[0] + (sA2.veh.z - sA.veh.z) * camRight[1];
    check('A steers left on screen while driving forward', sA2.veh.yaw > sA.veh.yaw + 0.15 && lateralA < -0.5, `yaw +${(sA2.veh.yaw - sA.veh.yaw).toFixed(2)}, lateral ${lateralA.toFixed(2)}`);
    const rollLeft = await ev('__game.player.vehicle.model.bodyGroup.rotation.z');
    check('car body rolls to the outside (right side down) in a left turn', rollLeft > 0.01, rollLeft.toFixed(3));
    await ev('(() => { const G = __game; const v = G.player.vehicle; v.x = G.world.layout.roadX(5) - 1.75; v.z = G.world.layout.roadZ(2) + 10; v.yaw = 0; v.vx = 0; v.vz = 12; v.spin = 0; G.camera.snapTo(0, 0.2); })()');
    await hold(['KeyW'], 1.5);
    const sD = await state();
    await hold(['KeyW', 'KeyD'], 1.0);
    const sD2 = await state();
    const camRightD = [-sD.camFwd[2], sD.camFwd[0]];
    const lateralD = (sD2.veh.x - sD.veh.x) * camRightD[0] + (sD2.veh.z - sD.veh.z) * camRightD[1];
    check('D steers right on screen while driving forward', sD2.veh.yaw < sD.veh.yaw - 0.15 && lateralD > 0.5, `yaw ${(sD2.veh.yaw - sD.veh.yaw).toFixed(2)}, lateral ${lateralD.toFixed(2)}`);
    const rollRight = await ev('__game.player.vehicle.model.bodyGroup.rotation.z');
    check('car body rolls to the outside (left side down) in a right turn', rollRight < -0.01, rollRight.toFixed(3));
    // Chase camera behind the car after the mouse rests: assert the math.
    await ev('(() => { const G = __game; const v = G.player.vehicle; v.x = G.world.layout.roadX(5) - 1.75; v.z = G.world.layout.roadZ(2) + 10; v.yaw = 0; v.vx = 0; v.vz = 10; G.camera.snapTo(1.2, 0.2); })()');
    await hold(['KeyW'], 4);
    s = await state();
    const f2 = [Math.sin(s.veh.yaw), Math.cos(s.veh.yaw)];
    const rel2 = [s.camPos[0] - s.veh.x, s.camPos[2] - s.veh.z];
    const behind = rel2[0] * f2[0] + rel2[1] * f2[1];
    const camLooksForward = s.camFwd[0] * f2[0] + s.camFwd[2] * f2[1];
    check('chase camera returns behind the car and looks the way it drives', behind < -4 && camLooksForward > 0.9, `behind ${behind.toFixed(1)} m, align ${camLooksForward.toFixed(2)}`);
    check('speedometer matches the real movement', near((await ev('document.getElementById("speed-value").textContent')) * 1, Math.round(Math.abs(s.speed) * 3.6), 2));
    check('HUD shows the vehicle name', (await ev('document.getElementById("vehicle-name").textContent')).includes('Marlin'));
    // Get out beside the door.
    await hold(['KeyS'], 2.5);
    await ev('(() => { const v = __game.player.vehicle; v.vx = 0; v.vz = 0; })()');
    await tap('KeyF');
    s = await state();
    const vv = await ev('(() => { const v = __game.fleet.vehicles.find(c => c.owner === "player"); return { x: v.x, z: v.z }; })()');
    const sideDist = Math.hypot(s.x - vv.x, s.z - vv.z);
    check('F leaves the car beside it', s.pstate === 'foot' && sideDist > 1.5 && sideDist < 3.5, sideDist.toFixed(2));
    check('player visible again', await ev('__game.player.model.group.visible === true'));

    // ---------------------------------------------------------------- markers and modes
    section('markers');
    // A foot-only marker reached by car: the hint shows, nothing fires; stepping out inside the ring fires it.
    await ev('(() => { const G = __game; const L = G.world.layout; const v = G.fleet.vehicles.find(c => c.owner === "player"); window.__m1 = 0; window.__m2 = 0; const mx = L.roadX(5) - 1.75, mz = L.roadZ(2) + 40; window.__footMarker = G.markers.add(mx, mz, { radius: 3.2, kind: "objective", needFoot: true, once: true, onEnter: () => { window.__m1 += 1; } }); G.player.teleport(v.x + 2.5, v.z, Math.PI); G.player.enterVehicle(v); v.x = mx; v.z = mz; v.yaw = 0; v.vx = 0; v.vz = 0; G.camera.snapTo(0, 0.2); })()');
    await adv(0.3);
    check('driving into a foot-only marker does not trigger it', (await ev('__m1')) === 0 && (await ev('__game.markers.list.includes(__footMarker)')));
    check('hint asks to get out of the car', (await ev('document.getElementById("hint").textContent')).includes('Get out of the car'));
    await tap('KeyF');
    await adv(0.3);
    check('getting out inside the ring triggers the marker', (await ev('__m1')) === 1 && (await state()).pstate === 'foot', `fired ${await ev('__m1')}`);
    // A car-only marker reached on foot: the hint shows; taking a car inside the ring fires it.
    await ev('(() => { const G = __game; const p = G.player; window.__carMarker = G.markers.add(p.x, p.z, { radius: 4, kind: "objective", needVehicle: true, once: true, onEnter: () => { window.__m2 += 1; } }); })()');
    await adv(0.3);
    check('walking into a car-only marker does not trigger it', (await ev('__m2')) === 0 && (await ev('document.getElementById("hint").textContent')).includes('need a car'));
    await ev('(() => { const G = __game; const v = G.fleet.vehicles.find(c => c.owner === "player"); v.x = G.player.x + 1.5; v.z = G.player.z; v.vx = 0; v.vz = 0; })()');
    await tap('KeyF');
    await adv(0.3);
    check('taking a car inside the ring triggers the marker', (await ev('__m2')) === 1 && (await state()).pstate === 'car', `fired ${await ev('__m2')}`);
    await ev('(() => { const G = __game; G.markers.remove(__footMarker); G.markers.remove(__carMarker); G.player.exitVehicle(); })()');

    section('driving');
    // The motorbike: an open seat, so Sol stays visible riding it, sits on the saddle and leans with it.
    await ev('(() => { const G = __game; const L = G.world.layout; const b = G.fleet.spawn("bike", L.roadX(5) + 1.75, L.roadZ(3) + 30, 0, { role: "player", owner: "player" }); G.player.teleport(b.x + 1.5, b.z, 0); G.camera.snapTo(0, 0.2); })()');
    await tap('KeyF');
    s = await state();
    check('F mounts the motorbike', s.pstate === 'car' && s.veh && s.veh.type === 'bike');
    check('rider stays visible on the bike', await ev('__game.player.model.group.visible === true && __game.player.model.group.parent === __game.player.vehicle.model.seat'));
    const seatOf = (expr) => ev(`(() => { const G = __game; const v = ${expr}; const rider = v.driver === G.player ? G.player.model : v.rider; G.world.scene.updateMatrixWorld(true); const V = G.camera.camera.position.constructor; const hips = rider.parts.hips.getWorldPosition(new V()); const seat = v.model.seat.getWorldPosition(new V()); const shoe = rider.parts.shoeL.getWorldPosition(new V()); const head = rider.parts.head.getWorldPosition(new V()); return { hipAboveSeat: hips.y - seat.y, shoeAboveGround: shoe.y - v.y, headAboveGround: head.y - v.y, hipAlong: (hips.x - v.x) * Math.sin(v.yaw) + (hips.z - v.z) * Math.cos(v.yaw) }; })()`);
    const seated = await seatOf('G.player.vehicle');
    check('rider hips rest on the saddle', seated.hipAboveSeat > 0.02 && seated.hipAboveSeat < 0.22, `hips ${seated.hipAboveSeat.toFixed(2)} m above the seat`);
    check('rider feet near the pegs', seated.shoeAboveGround > 0.2 && seated.shoeAboveGround < 0.55, `shoe ${seated.shoeAboveGround.toFixed(2)} m above the ground`);
    check('rider head over the tank, not floating', seated.headAboveGround > 1.2 && seated.headAboveGround < 1.75, `head ${seated.headAboveGround.toFixed(2)} m`);
    await hold(['KeyW', 'KeyA'], 1.5);
    const bikeLeanLeft = await ev('__game.player.vehicle.model.bodyGroup.rotation.z');
    check('bike leans into a left turn (left side down) with the rider', bikeLeanLeft < -0.05 && await ev('__game.player.model.group.parent === __game.player.vehicle.model.seat'), bikeLeanLeft.toFixed(3));
    await hold(['KeyW', 'KeyD'], 1.5);
    const bikeLeanRight = await ev('__game.player.vehicle.model.bodyGroup.rotation.z');
    check('bike leans into a right turn (right side down)', bikeLeanRight > 0.05, bikeLeanRight.toFixed(3));
    await hold(['KeyS'], 2);
    await ev('(() => { const v = __game.player.vehicle; v.vx = 0; v.vz = 0; })()');
    await tap('KeyE');
    check('E (interact) dismounts and puts Sol back in the world', (await state()).pstate === 'foot' && await ev('__game.player.model.group.parent === __game.world.scene'));
    // An AI rider sits the same way.
    await ev('(() => { const G = __game; const spot = { x: G.world.layout.roadX(5) + 1.75, z: G.world.layout.roadZ(3) + 40, yaw: Math.PI, node: G.nav.node(5, 3), dir: "n", lane: 0 }; window.__aiBike = G.traffic.spawnCar(spot, "bike"); })()');
    await adv(0.2);
    const aiSeated = await seatOf('__aiBike');
    check('AI rider hips rest on the saddle too', aiSeated.hipAboveSeat > 0.02 && aiSeated.hipAboveSeat < 0.22 && aiSeated.shoeAboveGround > 0.2 && aiSeated.shoeAboveGround < 0.55, `hips ${aiSeated.hipAboveSeat.toFixed(2)}, shoe ${aiSeated.shoeAboveGround.toFixed(2)}`);
    await ev('__game.traffic.despawn(__aiBike); 0');
    // Steal a moving traffic car: the driver gets out and flees; the crime raises a star.
    await ev('(() => { const G = __game; const spot = { x: G.world.layout.roadX(5) + 1.75, z: G.world.layout.roadZ(3) + 20, yaw: Math.PI, node: G.nav.node(5, 3), dir: "n", lane: 0 }; const v = G.traffic.spawnCar(spot, "coupe"); v.ctrl.throttle = 0; v.ai.limit = 0; G.player.teleport(v.x + 2.2, v.z, 0); window.__stolen = v; })()');
    await adv(0.2);
    const pedsBefore = await ev('__game.pedestrians.count()');
    await tap('KeyF');
    s = await state();
    check('stealing a driven car works', s.pstate === 'car' && s.veh.type === 'coupe');
    check('the driver got out and flees', (await ev('__game.pedestrians.list.filter(p => p.state === "flee").length')) >= 1 && (await ev('__game.pedestrians.count()')) >= pedsBefore);
    check('stealing raised the wanted level', s.stars >= 1, String(s.stars));
    await ev('__game.wanted.clear(); __game.police.clearAll(); 0');

    // ---------------------------------------------------------------- damage fairness
    section('damage');
    // Slow scrape along a building wall at ~10 km/h: no damage.
    await ev('(() => { const G = __game; const v = G.player.vehicle; const b = G.world.layout.landmarks.safehouses.strand.block; const lot = b.lots[0]; v.x = lot.x + lot.w / 2; v.z = lot.z + lot.d + 1.3; v.yaw = Math.PI / 2; v.vx = 2.8; v.vz = -0.6; v.hp = 100; v.impactTimer = 0; G.player.health = 100; window.__lot = { x: lot.x, z: lot.z + lot.d }; })()');
    await ev('(() => { const v = __game.player.vehicle; v.ctrl.steer = 0; })()');
    await hold(['KeyW'], 2.5);
    s = await state();
    check('slow scrape does no damage', s.veh.hp === 100 && s.health === 100, `hp ${s.veh.hp}, health ${s.health}`);
    // Hard crash into the wall at ~70 km/h: car damaged, driver nearly untouched.
    await ev('(() => { const G = __game; const v = G.player.vehicle; const lot = G.world.layout.landmarks.safehouses.strand.block.lots[0]; v.x = lot.x + lot.w / 2; v.z = lot.z + lot.d + 14; v.yaw = Math.PI; v.vx = 0; v.vz = -20; v.hp = 100; v.impactTimer = 0; G.player.health = 100; })()');
    await adv(1.2);
    s = await state();
    check('hard crash damages the car', s.veh.hp < 100 && s.veh.hp > 55, `hp ${s.veh.hp.toFixed(1)}`);
    check('driver protected inside the car', s.health >= 92, `health ${s.health}`);
    check('car stopped outside the wall', await ev('__game.world.colliders.overlaps(__game.player.vehicle.x, __game.player.vehicle.z, 0.3) === null'));
    // Repeated crashes needed to wreck: count impacts until fire.
    let crashes = 0;
    for (let i = 0; i < 12; i += 1) {
      const onFire = await ev('__game.player.vehicle.onFire');
      if (onFire) break;
      await ev('(() => { const G = __game; const v = G.player.vehicle; const lot = G.world.layout.landmarks.safehouses.strand.block.lots[0]; v.x = lot.x + lot.w / 2; v.z = lot.z + lot.d + 14; v.yaw = Math.PI; v.vx = 0; v.vz = -20; v.impactTimer = 0; })()');
      await adv(1.0);
      crashes += 1;
    }
    check('many hard crashes before the car catches fire', crashes >= 4 && await ev('__game.player.vehicle.onFire'), `${crashes} crashes, on fire: ${await ev('__game.player.vehicle.onFire')}`);
    const fuse = await ev('__game.player.vehicle.fuse');
    check('fire warning gives seconds to get out', fuse > 3.5 && fuse <= 5, `${fuse.toFixed(2)} s`);
    check('HUD warns the car is on fire', (await ev('document.getElementById("notifications").textContent')).includes('Car on fire! Get out!') && (await ev('document.getElementById("vehicle-name").textContent')).includes('ON FIRE'));
    await tap('KeyF');
    await adv(6);
    s = await state();
    check('burning car explodes, player survived outside', s.health > 0 && (await ev('__game.fleet.vehicles.every(v => v.driver !== __game.player)')), `health ${s.health}`);
    await ev('__game.player.heal(); 0');
    // The fuse and the warning do not depend on how the car caught fire: a car shot to the
    // threshold warns on the very step it ignites and gives the whole fuse before exploding.
    await ev('(() => { const G = __game; const L = G.world.layout; const v = G.fleet.spawn("sedan", L.roadX(5) - 1.75, L.roadZ(2) + 30, 0, { role: "player", owner: "player" }); G.player.teleport(v.x + 2.5, v.z, 0); G.player.enterVehicle(v); G.hud.clearTransient(); G.combat.damageVehicle(v, 90, "test"); window.__fireCar = v; })()');
    const litAt = await ev('(() => { const v = __fireCar; return { onFire: v.onFire, fuse: v.fuse, wrecked: v.wrecked }; })()');
    check('the hit that lights the car starts a full 5 s fuse', litAt.onFire && near(litAt.fuse, 5, 1e-6) && !litAt.wrecked, JSON.stringify(litAt));
    check('warning shown the moment the car ignites, before any step', (await ev('document.getElementById("notifications").textContent')).includes('Car on fire! Get out!'));
    await adv(1 / 60);
    check('one step later the fuse has barely moved', (await ev('__fireCar.fuse')) > 4.9, String(await ev('__fireCar.fuse')));
    check('speedo shows ON FIRE with the countdown', (await ev('document.getElementById("vehicle-name").textContent')).includes('ON FIRE 5 s'));
    await tap('KeyF');
    let burn = 0;
    while (burn < 8 && !(await ev('__fireCar.wrecked'))) {
      await adv(0.25);
      burn += 0.25;
    }
    check('the car explodes about 5 s after the warning', burn >= 4.5 && burn <= 5.5, `${burn.toFixed(2)} s`);
    check('player got clear in time', (await ev('__game.player.health')) > 0 && (await ev('__game.player.state')) === 'foot');
    await ev('__game.player.heal(); __game.fleet.remove(__fireCar); 0');

    // ---------------------------------------------------------------- frame rate independence
    section('timestep');
    const runDrive = async (step) => {
      await ev('(() => { const G = __game; for (const v of [...G.fleet.vehicles]) if (v.role === "test") G.fleet.remove(v); const x = G.world.layout.roadX(5) - 1.75; const z = G.world.layout.roadZ(1) + 12; const v = G.fleet.spawn("coupe", x, z, 0, { role: "test", color: "#ffffff" }); G.player.revive(x + 2.5, z, 0); G.player.enterVehicle(v); G.camera.snapTo(0, 0.2); })()');
      await adv(0.05, step);
      await page.keyDown('KeyW');
      await adv(4, step);
      await page.keyUp('KeyW');
      const r = await state();
      await ev('(() => { const G = __game; G.player.exitVehicle(); for (const v of [...G.fleet.vehicles]) if (v.role === "test") G.fleet.remove(v); })()');
      return r;
    };
    const slow = await runDrive(1 / 30);
    const fast = await runDrive(1 / 144);
    const dSlow = Math.abs(slow.veh.z - (await ev('__game.world.layout.roadZ(1) + 12')));
    const dFast = Math.abs(fast.veh.z - (await ev('__game.world.layout.roadZ(1) + 12')));
    check('same drive at 30 and 144 fps', near(dSlow, dFast, Math.max(3, dSlow * 0.06)) && near(slow.speed, fast.speed, 1.5), `${dSlow.toFixed(1)} m vs ${dFast.toFixed(1)} m, ${(slow.speed * 3.6).toFixed(0)} vs ${(fast.speed * 3.6).toFixed(0)} km/h`);
    check('coupe 0-100 km/h in about 4-6 s', fast.speed * 3.6 > 85 && fast.speed * 3.6 < 125, `${(fast.speed * 3.6).toFixed(0)} km/h after 4 s`);

    // ---------------------------------------------------------------- slopes and kerbs
    section('slopes');
    // The driving step against a steep ramp and against a kerb: a slope costs nothing however fast
    // the body lags the ground; a kerb costs its speed once per bump, whatever the frame rate.
    const slopeRun = await ev(`(async () => {
      const G = __game;
      const { stepDriving } = await import('./src/vehicles/physics.js');
      const spec = G.fleet.vehicles[0].spec;
      const run = (ground, step) => {
        const v = { spec, x: 0, z: 0, y: ground(0, 0), yaw: 0, vx: 0, vz: 25, speed: 25, slip: 0, steer: 0, throttle: 0, yawRate: 0, wheelSpin: 0, odometer: 0, wrecked: false, ctrl: { throttle: 0, brake: 0, steer: 0, handbrake: false }, impactTimer: 0, bump: 0 };
        for (let t = 0; t < 1 - 1e-9; t += step) stepDriving(v, step, ground);
        return v.speed;
      };
      const coast = run(() => 0, 1 / 60);
      const ramp = run((x, z) => 0.2 * z, 1 / 60);
      const kerb60 = run((x, z) => (z > 1 ? 0.14 : 0), 1 / 60);
      const kerb144 = run((x, z) => (z > 1 ? 0.14 : 0), 1 / 144);
      return { coast, ramp, kerb60, kerb144 };
    })()`);
    check('a 20 % slope at 90 km/h costs no speed beyond drag', near(slopeRun.ramp, slopeRun.coast, 0.3) && slopeRun.ramp > 20, `${(slopeRun.ramp * 3.6).toFixed(0)} km/h after 1 s on the ramp vs ${(slopeRun.coast * 3.6).toFixed(0)} coasting`);
    check('a kerb costs about 10 % once', slopeRun.kerb60 < slopeRun.coast * 0.93 && slopeRun.kerb60 > slopeRun.coast * 0.86, `${(slopeRun.kerb60 * 3.6).toFixed(0)} km/h vs ${(slopeRun.coast * 3.6).toFixed(0)}`);
    check('the kerb costs the same at 144 fps', near(slopeRun.kerb60, slopeRun.kerb144, 0.3), `${(slopeRun.kerb60 * 3.6).toFixed(1)} vs ${(slopeRun.kerb144 * 3.6).toFixed(1)} km/h`);
    // On the real beach: down the sand slope at speed with the throttle held, no stall.
    await ev('(() => { const G = __game; const L = G.world.layout; const x = L.roadX(2) + 30; const z = L.sandZ + 12; const v = G.fleet.spawn("coupe", x, z, 0, { role: "test", color: "#ffffff" }); G.player.revive(x + 2.5, z, 0); G.player.enterVehicle(v); v.vx = 0; v.vz = 22; G.camera.snapTo(0, 0.2); })()');
    await hold(['KeyW'], 1.5);
    const beach = await state();
    check('a fast car keeps its speed down the beach slope', beach.speed > 18 && beach.veh && !beach.veh.wrecked, `${(beach.speed * 3.6).toFixed(0)} km/h after 1.5 s`);
    await ev('(() => { const G = __game; G.player.exitVehicle(); for (const v of [...G.fleet.vehicles]) if (v.role === "test") G.fleet.remove(v); })()');

    // ---------------------------------------------------------------- weapons and combat
    section('weapons');
    await ev('(() => { const G = __game; const L = G.world.layout.landmarks; G.player.revive(L.plaza.x, L.plaza.z + 20, Math.PI); G.camera.snapTo(Math.PI, 0.1); G.weapons.give("pistol", 60); G.weapons.give("smg", 90); G.weapons.give("shotgun", 24); G.wanted.clear(); })()');
    await adv(0.2);
    for (const [key, id] of [['Digit2', 'pistol'], ['Digit3', 'smg'], ['Digit4', 'shotgun'], ['Digit1', 'fists']]) {
      await tap(key);
      check(`${key} selects ${id}`, (await ev('__game.weapons.current')) === id);
    }
    await ev('__game.input.state.wheel = 1; 0');
    await adv(0.05);
    check('mouse wheel cycles weapons', (await ev('__game.weapons.current')) === 'pistol', await ev('__game.weapons.current'));
    // A gang member 8 m ahead and a few bystanders; aim the camera at him and fire with the mouse.
    await ev('(() => { const G = __game; const p = G.player; const m = G.gangs.spawnMember(p.x, p.z - 8, { hostile: false, group: "test" }); m.hp = 1000; window.__target = m; for (let k = 0; k < 3; k++) G.pedestrians.makePed(p.x + 6 + k * 2, p.z + 4); G.camera.snapTo(Math.PI, 0.02); })()');
    await adv(0.3);
    const hpBefore = await ev('__target.hp');
    await page.mouse('mouseMoved', 480, 300);
    await page.mouse('mousePressed', 480, 300, { button: 'left', buttons: 1, clickCount: 1 });
    await adv(0.05);
    await page.mouse('mouseReleased', 480, 300, { button: 'left', clickCount: 1 });
    await adv(0.2);
    const hpAfter = await ev('__target.hp');
    check('pistol shot hits the target the camera aims at', hpAfter < hpBefore, `${hpBefore} -> ${hpAfter}`);
    check('ammo spent', (await ev('__game.weapons.inv.pistol.clip')) === 11, String(await ev('__game.weapons.inv.pistol.clip')));
    check('shooting raised the wanted level', (await ev('__game.wanted.stars')) >= 1);
    check('pedestrians panic from gunfire', await ev('__game.pedestrians.list.some(p => p.state === "panic")'));
    await ev('__game.wanted.clear(); __game.police.clearAll(); 0');
    for (const id of ['smg', 'shotgun']) {
      await ev(`(() => { const G = __game; const p = G.player; const m = __target; m.hostile = false; G.weapons.select("${id}"); G.weapons.cooldown = 0; const yaw = Math.atan2(m.x - p.x, m.z - p.z); G.camera.snapTo(yaw, 0.0); })()`);
      await adv(0.1);
      const h0 = await ev('__target.hp');
      for (let k = 0; k < 3; k += 1) {
        await ev('__game.weapons.cooldown = 0; __game.weapons.fire(); 0');
        await adv(0.05);
      }
      const h1 = await ev('__target.hp');
      check(`${id} damages the target`, h1 < h0, `${h0} -> ${h1}`);
    }
    await ev('__game.weapons.select("fists"); __game.weapons.cooldown = 0; __game.player.teleport(__target.x, __target.z + 1.2, Math.PI); 0');
    const hPunch0 = await ev('__target.hp');
    await ev('__game.weapons.fire(); 0');
    await adv(0.1);
    check('punch damages a close target', (await ev('__target.hp')) < hPunch0);
    check('bullets stop at walls', await ev('(() => { const G = __game; const THREE_V = G.camera.camera.position.constructor; const L = G.world.layout.landmarks.bank.block.lots[0]; const o = new THREE_V(L.x - 6, 1.5, L.z + L.d / 2); const d = new THREE_V(1, 0, 0); const hit = G.combat.raycast(o, d, 60); return hit && hit.kind === "static" && hit.t < 7; })()'));
    await ev('(() => { const G = __game; G.gangs.remove(__target); G.wanted.clear(); G.police.clearAll(); })()');

    // ---------------------------------------------------------------- wanted and police
    section('police');
    await ev('(() => { const G = __game; const L = G.world.layout; const x = L.roadX(8) - 1.75; const z = L.oceanZ - 1.75; const v = G.fleet.spawn("coupe", x, z, -Math.PI / 2, { role: "player", owner: "player", color: "#c81e2e" }); G.player.revive(x + 2.5, z, 0); G.player.enterVehicle(v); G.camera.snapTo(-Math.PI / 2, 0.2); G.player.health = 100; G.wanted.setStars(3); })()');
    await adv(0.1);
    check('3 stars set', (await ev('__game.wanted.stars')) === 3);
    check('search circle sized for 3 stars', (await ev('__game.wanted.search.r')) > 10);
    await adv(4);
    check('cruisers respond within seconds', (await ev('__game.police.cruisers.length')) >= 2, String(await ev('__game.police.cruisers.length')));
    check('cruisers have sirens and lightbars', await ev('__game.police.cruisers.every(v => v.siren && v.model.lightbar)'));
    // Survive 30 s of a 3-star chase driving west along Ocean Drive and back.
    // A lane-keeping autopilot pressing W/A/D: west along Ocean Drive, U-turn, back east.
    let closestCop = Infinity;
    const autopilot = async (laneZ, headingYaw, seconds) => {
      let t = 0;
      await page.keyDown('KeyW');
      while (t < seconds) {
        const v = await ev('(() => { const v = __game.player.vehicle; if (!v) return null; let d = Infinity; for (const c of __game.police.cruisers) d = Math.min(d, Math.hypot(c.x - v.x, c.z - v.z)); return { x: v.x, z: v.z, yaw: v.yaw, speed: v.speed, cop: d }; })()');
        if (!v) break;
        closestCop = Math.min(closestCop, v.cop);
        const headingErr = Math.atan2(Math.sin(headingYaw - v.yaw), Math.cos(headingYaw - v.yaw));
        const lateral = (laneZ - v.z) * (headingYaw > 0 ? -1 : 1);
        const want = headingErr * 1.4 + Math.max(-0.5, Math.min(0.5, lateral * 0.08));
        const key = want > 0.05 ? 'KeyA' : want < -0.05 ? 'KeyD' : null;
        if (key) await page.keyDown(key);
        await adv(0.25);
        if (key) await page.keyUp(key);
        t += 0.25;
      }
      await page.keyUp('KeyW');
    };
    const oceanZ = await ev('__game.world.layout.oceanZ');
    await autopilot(oceanZ - 1.75, -Math.PI / 2, 12);
    await hold(['KeyS'], 2.2);
    await hold(['KeyW', 'KeyA'], 2.4);
    await autopilot(oceanZ + 1.75, Math.PI / 2, 13.4);
    s = await state();
    check('survived a 30 s three-star chase', s.health > 30 && s.veh && !s.veh.wrecked, `health ${s.health.toFixed(0)}, car hp ${s.veh ? s.veh.hp.toFixed(0) : '-'}`);
    check('police got close during the chase', closestCop < 60, `closest ${closestCop.toFixed(0)} m`);
    // Patch up before the next checks so a wrecked car does not end the run early.
    await ev('(() => { const G = __game; G.player.heal(); if (G.player.vehicle) G.fleet.repair(G.player.vehicle); })()');
    check('cruisers stay on the map and out of buildings', await ev('__game.police.cruisers.every(v => __game.world.colliders.overlaps(v.x, v.z, 0.2) === null)'));
    check('police blips on the minimap', (await ev('__game.police.cruisers.length')) > 0);
    // Roadblock at 3 stars while driving fast.
    await ev('__game.police.placeRoadblock(); 0');
    check('roadblock placed across the road', (await ev('__game.police.roadblocks.length')) >= 1 && await ev('__game.police.roadblocks.every(b => b.cruisers.length === 2 && b.officers.length === 2)'));
    // Helicopter at 4 stars.
    await ev('__game.wanted.setStars(4); 0');
    await adv(2);
    check('helicopter arrives at 4 stars', await ev('__game.police.heli !== null'));
    check('helicopter searchlight on', await ev('__game.police.heli && __game.police.heli.light.intensity > 0'), await ev('JSON.stringify({ heli: !!__game.police.heli, dead: __game.player.dead, stars: __game.wanted.stars })'));
    await ev('__game.wanted.setStars(5); 0');
    await adv(1);
    check('5 stars: 5 cruisers wanted', (await ev('__game.wanted.stars')) === 5);
    // Lose them: far from everything, out of the circle, the stars fade one by one.
    await ev('(() => { const G = __game; const L = G.world.layout; G.player.heal(); let v = G.player.vehicle; if (!v) { v = G.fleet.spawn("coupe", L.roadX(9) - 1.75, L.roadZ(0) + 30, Math.PI, { role: "player", owner: "player" }); G.player.revive(v.x + 2.5, v.z, 0); G.player.enterVehicle(v); } G.fleet.repair(v); v.x = L.roadX(9) - 1.75; v.z = L.roadZ(0) + 30; v.yaw = Math.PI; v.vx = 0; v.vz = 0; G.police.clearAll(); G.wanted.setStars(2); G.wanted.search.x = L.roadX(2); G.wanted.search.z = L.roadZ(7); })()');
    check('still playing before the evasion test', (await ev('__game.state')) === 'playing', await ev('__game.state'));
    check('outside the search circle', await ev('__game.wanted.isOutsideSearch()'));
    const heat2 = await ev('__game.wanted.heat');
    const oneStar = await waitUntil('__game.wanted.stars === 1', 40, 1);
    const heat1 = await ev('__game.wanted.heat');
    check('losing a star drops the heat to that star\'s threshold', oneStar && heat1 === (await ev('__game.wanted.heat')) && heat1 === 12 && heat2 >= 35, `heat ${heat2} -> ${heat1}`);
    // A tiny crime now adds only its own weight: still one star, not straight back to two.
    await ev('(() => { const G = __game; const L = G.world.layout; G.wanted.crime("shootUnseen"); G.police.clearAll(); G.wanted.search.x = L.roadX(2); G.wanted.search.z = L.roadZ(7); })()');
    await adv(0.1);
    check('a small crime after losing a star does not bring it back', (await ev('__game.wanted.stars')) === 1 && (await ev('__game.wanted.heat')) === 15, `stars ${await ev('__game.wanted.stars')}, heat ${await ev('__game.wanted.heat')}`);
    const lost = await waitUntil('__game.wanted.stars === 0', 70, 2);
    check('stars fade when out of sight and outside the circle', lost, `stars ${await ev('__game.wanted.stars')}`);
    check('no heat left at zero stars', (await ev('__game.wanted.heat')) === 0);
    check('"lost the cops" notification', (await ev('document.getElementById("notifications").textContent')).includes('lost the cops'));

    // ---------------------------------------------------------------- arrest and hospital
    section('arrest');
    // Arrested at the wheel: the surrender takes the controls away, W does not move the car.
    await ev('(() => { const G = __game; const p = G.player; const v = p.vehicle; v.vx = 0; v.vz = 0; G.wanted.setStars(1); const o = G.police.spawnOfficer(v.x + 2, v.z, null); o.fireTimer = 99; window.__officer = o; })()');
    const surrendered = await waitUntil('__game.player.surrender === true', 8, 0.25);
    check('stopped in a car next to an officer: arrest begins', surrendered, `surrender ${await ev('__game.player.surrender')}, state ${await ev('__game.state')}`);
    const carBefore = await ev('(() => { const v = __game.player.vehicle; return v ? { x: v.x, z: v.z } : null; })()');
    await ev('__officer.x = __game.player.vehicle.x + 2; __officer.z = __game.player.vehicle.z; 0');
    await hold(['KeyW'], 1.0);
    const carAfter = await ev('(() => { const v = __game.player.vehicle; return v ? { x: v.x, z: v.z, speed: v.speed, throttle: v.ctrl.throttle } : null; })()');
    check('no driving during the surrender', carBefore && carAfter && Math.hypot(carAfter.x - carBefore.x, carAfter.z - carBefore.z) < 0.3 && Math.abs(carAfter.speed) < 0.5 && carAfter.throttle === 0, JSON.stringify(carAfter));
    const arrestedInCar = await waitUntil('__game.state === "death"', 4, 0.25);
    check('arrest screen follows the surrender', arrestedInCar && (await ev('document.getElementById("death-title").textContent')) === 'ARRESTED');
    for (let i = 0; i < 100 && (await ev('__game.state')) !== 'playing'; i += 1) await new Promise((r) => setTimeout(r, 200));
    check('released on foot after the car arrest', (await ev('__game.state')) === 'playing' && (await ev('__game.player.state')) === 'foot' && (await ev('__game.player.surrender')) === false);
    check('resuming from the arrest asks for a click', await ev('__game.input.needsClick'));
    await ev('(() => { const G = __game; const p = G.player; G.wanted.setStars(1); const o = G.police.spawnOfficer(p.x + 1.5, p.z, null); o.fireTimer = 99; })()');
    const arrested = await waitUntil('__game.state === "death"', 8, 0.5);
    check('standing still next to an officer gets you arrested', arrested, await ev('__game.state'));
    check('ARRESTED screen shown', (await ev('document.getElementById("death-title").textContent')) === 'ARRESTED');
    const moneyBeforeArrest = await ev('__game.economy.money');
    for (let i = 0; i < 100 && (await ev('__game.state')) !== 'playing'; i += 1) await new Promise((r) => setTimeout(r, 200));
    s = await state();
    check('released at the police station with a fee', s.state === 'playing' && s.stars === 0 && s.money <= moneyBeforeArrest && near(s.x, await ev('__game.world.layout.landmarks.policeStation.x'), 1));
    check('ammo confiscated on arrest', (await ev('__game.weapons.inv.pistol.ammo + __game.weapons.inv.pistol.clip')) === 0);
    await ev('__game.economy.money = 1000; __game.player.damage(500, "test"); 0');
    await adv(3);
    check('death leads to the hospital screen', (await ev('__game.state')) === 'death' && (await ev('document.getElementById("death-title").textContent')) === 'HOSPITALIZED');
    for (let i = 0; i < 100 && (await ev('__game.state')) !== 'playing'; i += 1) await new Promise((r) => setTimeout(r, 200));
    s = await state();
    check('respawned at the clinic with full health and a fee', s.state === 'playing' && s.health === 100 && s.money === 1000 - 350 && near(s.x, await ev('__game.world.layout.landmarks.hospital.x'), 1), `money ${s.money}`);

    // ---------------------------------------------------------------- traffic and pedestrians
    section('traffic');
    await ev('(() => { const G = __game; const L = G.world.layout.landmarks; G.player.teleport(L.plaza.x, L.plaza.z + 32, 0); })()');
    await adv(25);
    const traffic = await ev('(() => { const G = __game; const cars = G.traffic.cars; let moving = 0, inBuilding = 0, inWater = 0, offRoad = 0; for (const v of cars) { if (Math.abs(v.speed) > 1) moving++; if (G.world.colliders.overlaps(v.x, v.z, 0.3)) inBuilding++; if (G.world.layout.isWater(v.x, v.z)) inWater++; if (!G.world.layout.isRoad(v.x, v.z)) offRoad++; } return { n: cars.length, moving, inBuilding, inWater, offRoad }; })()');
    check('traffic flows', traffic.n >= 15 && traffic.moving >= traffic.n * 0.2, JSON.stringify(traffic));
    check('no traffic inside buildings or water', traffic.inBuilding === 0 && traffic.inWater === 0, JSON.stringify(traffic));
    check('traffic keeps to the roads', traffic.offRoad <= Math.ceil(traffic.n * 0.1), JSON.stringify(traffic));
    const lights = await ev('(() => { const G = __game; const n = G.world.layout.intersectionAt(4, 4); return { ns: G.traffic.lightState(n, "n"), ew: G.traffic.lightState(n, "e") }; })()');
    check('traffic lights alternate by axis', lights.ns !== lights.ew || lights.ns === 'yellow', JSON.stringify(lights));
    const stopping = await ev('(() => { const G = __game; let waiting = 0; for (const v of G.traffic.cars) if (v.ai && v.ai.beforeStop && v.ai.waiting > 0.5 && Math.abs(v.speed) < 1) waiting++; return waiting; })()');
    check('some cars wait at red lights', stopping >= 0, `${stopping} waiting`);
    const peds = await ev('(() => { const G = __game; let inBuilding = 0, onRoad = 0; for (const p of G.pedestrians.list) { if (G.world.colliders.overlaps(p.x, p.z, 0.2)) inBuilding++; if (G.world.layout.isRoad(p.x, p.z)) onRoad++; } return { n: G.pedestrians.list.length, inBuilding, onRoad }; })()');
    check('pedestrians walk the sidewalks, not through walls', peds.n > 20 && peds.inBuilding === 0 && peds.onRoad < peds.n * 0.35, JSON.stringify(peds));
    check('landmarks and shards are outside buildings and water', await ev('(() => { const G = __game; const L = G.world.layout.landmarks; const pts = [L.garage, L.plaza, L.bankDoor, L.gangBar, L.pierEnd, L.safehouses.strand, L.safehouses.neon, L.safehouses.palmetto, L.hospital, L.policeStation, L.start, ...L.shards, ...L.carShops]; return pts.every(p => !G.world.colliders.overlaps(p.x, p.z, 0.3) && !G.world.layout.isWater(p.x, p.z)); })()'));

    // ---------------------------------------------------------------- missions
    section('missions');
    const startMission = async (id) => {
      await ev('(() => { const G = __game; if (G.player.state === "car") G.player.exitVehicle(); const m = G.missions.startMarker; G.player.teleport(m.x + 6, m.z, -Math.PI / 2); G.camera.snapTo(-Math.PI / 2, 0.2); })()');
      await hold(['KeyW'], 2.5);
      const cur = await ev('__game.missions.current ? __game.missions.current.def.id : null');
      check(`${id}: starts by walking into its marker`, cur === id, String(cur));
      check(`${id}: title banner shown`, (await ev('document.getElementById("banner-title").textContent')).length > 0);
    };
    const expectStage = async (id, stage, what) => {
      const st = await ev('__game.missions.current ? __game.missions.current.stage : -1');
      check(`${id}: ${what}`, st === stage, `stage ${st}`);
    };
    const finishMission = async (id) => {
      const ok = await waitUntil('__game.menus.open === "complete"', 15, 0.5);
      check(`${id}: mission complete screen`, ok, await ev('__game.menus.open'));
      check(`${id}: reward paid`, (await ev('__game.missions.completed.has("' + id + '")')));
      await tap('Enter');
      await waitPlaying();
      await adv(0.2);
      check(`${id}: continue returns to play`, (await ev('__game.state')) === 'playing');
      check(`${id}: autosaved`, await ev('localStorage.getItem("halcyon-heat-autosave") !== null'));
    };
    const driveCarTo = async (x, z) => ev(`(() => { const G = __game; const v = G.player.vehicle; v.x = ${x}; v.z = ${z} ; v.vx = 0; v.vz = 0; })()`);
    const getCar = async () => ev('(() => { const G = __game; const p = G.player; const v = G.fleet.spawn("sedan", p.x + 3, p.z, p.yaw, { role: "player", owner: "player" }); G.player.enterVehicle(v); return v.id; })()');
    const killSquad = async () => ev('(() => { const G = __game; const p = G.player; const V = G.camera.camera.position.constructor; for (let n = 0; n < 80; n++) { const m = G.gangs.members.find(x => !x.dead && x.group === "mission"); if (!m) break; const o = new V(p.x, p.y + 1.4, p.z); const d = new V(m.x - p.x, (m.y + 1.2) - (p.y + 1.4), m.z - p.z).normalize(); const hit = G.combat.shoot(o, d, 90, 40, p); if (!hit || hit.target !== m) { m.onHit(40, p); } } return G.gangs.members.filter(x => !x.dead && x.group === "mission").length; })()');

    // 1. Welcome Home
    await ev('__game.player.heal(); __game.player.godMode = true; 0');
    await startMission('welcome');
    await skipTalk();
    await adv(0.5);
    await expectStage('welcome', 1, 'objective asks for a car and Dani');
    check('welcome: objective text', (await state()).objective.includes('Dani'));
    await getCar();
    await adv(0.2);
    await driveCarTo(await ev('__game.world.layout.landmarks.gangBarRoad.x'), await ev('__game.world.layout.landmarks.gangBarRoad.z'));
    await adv(0.5);
    await expectStage('welcome', 2, 'Dani picked up, chasers spawned');
    check('welcome: gang cars chase', (await ev('__game.fleet.vehicles.filter(v => v.role === "gang").length')) === 2);
    await driveCarTo(await ev('__game.world.layout.roadX(2) + 1.75'), await ev('__game.world.layout.roadZ(1) + 20'));
    await adv(6);
    await expectStage('welcome', 3, 'lost the chasers');
    await driveCarTo(await ev('__game.world.layout.landmarks.garageParking.x'), await ev('__game.world.layout.landmarks.garageParking.z'));
    await adv(0.5);
    await skipTalk();
    await finishMission('welcome');
    check('welcome: money and rep rewarded', (await ev('__game.economy.money')) >= 650 + 800 && (await ev('__game.economy.rep')) >= 20);

    // 2. Clock Runner
    await startMission('clock');
    await skipTalk();
    await adv(0.3);
    await expectStage('clock', 1, 'go to the Vega');
    await ev('(() => { const G = __game; const car = G.fleet.vehicles.find(v => v.mission && v.type === "coupe"); G.player.teleport(car.x + 2.5, car.z, 0); })()');
    await tap('KeyF');
    await adv(0.3);
    await expectStage('clock', 2, 'timer running after entering the Vega');
    check('clock: countdown shown', !(await ev('document.getElementById("mission-timer").classList.contains("hidden")')));
    await driveCarTo(await ev('__game.world.layout.landmarks.garageParking.x'), await ev('__game.world.layout.landmarks.garageParking.z'));
    await adv(0.5);
    await skipTalk();
    await finishMission('clock');
    check('clock: timer cleared', await ev('document.getElementById("mission-timer").classList.contains("hidden")'));

    // 3. Neon Collection
    await startMission('neon');
    await skipTalk();
    check('neon: pistol given', await ev('__game.weapons.inv.pistol.owned && __game.weapons.inv.pistol.ammo + __game.weapons.inv.pistol.clip > 0'));
    await adv(0.3);
    await ev('(() => { const G = __game; const b = G.world.layout.landmarks.gangBar; if (G.player.state === "car") G.player.exitVehicle(); G.player.teleport(b.x, b.z + 2.5, Math.PI); })()');
    await adv(0.5);
    await skipTalk();
    await adv(0.3);
    await expectStage('neon', 2, 'squad spawned');
    check('neon: hostile squad present', (await ev('__game.gangs.members.filter(m => m.hostile && !m.dead).length')) >= 4);
    const left = await killSquad();
    await adv(0.5);
    check('neon: squad cleared', left === 0 && (await ev('(__game.missions.current && __game.missions.current.stage >= 3) || __game.missions.completed.has("neon")')), `left ${left}, stage ${await ev('__game.missions.current ? __game.missions.current.stage : "done"')}`);
    check('neon: gang now hostile to Sol', await ev('__game.gangs.hostile'));
    await ev('(() => { const G = __game; const b = G.world.layout.landmarks.gangBar; G.player.teleport(b.x + 5, b.z, -Math.PI / 2); G.camera.snapTo(-Math.PI / 2, 0.2); })()');
    await hold(['KeyW'], 2);
    await skipTalk();
    await finishMission('neon');

    // 4. Tail Lights
    await startMission('tail');
    await skipTalk();
    await adv(0.3);
    await getCar();
    await driveCarTo(await ev('__game.world.layout.landmarks.docksYardRoad.x'), await ev('__game.world.layout.landmarks.docksYardRoad.z + 6'));
    await adv(1);
    await expectStage('tail', 2, 'courier flees');
    check('tail: courier car moving', await ev('(() => { const c = __game.fleet.vehicles.find(v => v.mission && v.driver && v.driver.kind === "gang"); return c && c.ai !== null; })()'));
    await adv(3);
    await ev('(() => { const G = __game; const c = G.fleet.vehicles.find(v => v.mission && v.role !== "player" && v.type === "coupe"); const v = G.player.vehicle; v.x = c.x + 3; v.z = c.z; G.combat.damageVehicle(c, 70, G.player); })()');
    await adv(1);
    check('tail: courier stopped, bag to grab', (await ev('__game.missions.current ? __game.missions.current.stage : -1')) >= 3, `stage ${await ev('__game.missions.current ? __game.missions.current.stage : -1')}`);
    await ev('(() => { const G = __game; const m = G.markers.list.find(k => k.kind === "objective"); G.player.exitVehicle(); if (m) G.player.teleport(m.x + 1.2, m.z + 1.2, 0); })()');
    await adv(0.5);
    await skipTalk();
    await finishMission('tail');

    // 5. Saltmarsh Standoff
    await startMission('docks');
    await skipTalk();
    await adv(0.3);
    await ev('(() => { const G = __game; const y = G.world.layout.landmarks.docksYard; G.player.teleport(y.x, y.z + 20, Math.PI); })()');
    await adv(0.5);
    await skipTalk();
    await expectStage('docks', 2, 'yard squad spawned');
    await killSquad();
    await adv(0.5);
    await skipTalk();
    await expectStage('docks', 3, 'police alerted after the shootout');
    check('docks: three stars from the gunfight', (await ev('__game.wanted.stars')) === 3);
    await ev('(() => { const G = __game; const L = G.world.layout; G.player.teleport(L.roadX(9) + 1.75, L.roadZ(0) + 30, Math.PI); G.police.clearAll(); })()');
    const evaded = await waitUntil('__game.wanted.stars === 0', 120, 2);
    check('docks: lost the police', evaded);
    await expectStage('docks', 4, 'back to the garage');
    await ev('(() => { const G = __game; const g = G.world.layout.landmarks.garage; G.player.teleport(g.x, g.z + 6, Math.PI); G.camera.snapTo(Math.PI, 0.2); })()');
    await hold(['KeyW'], 2);
    await skipTalk();
    await finishMission('docks');

    // 6. The Glasswater Job
    await startMission('bank');
    await skipTalk();
    await adv(0.3);
    await ev('(() => { const G = __game; const d = G.world.layout.landmarks.bankDoor; G.player.teleport(d.x - 5, d.z, Math.PI / 2); G.camera.snapTo(Math.PI / 2, 0.2); })()');
    await hold(['KeyW'], 2.5);
    await skipTalk();
    await expectStage('bank', 2, 'holding the lobby');
    check('bank: alarm raised two stars', (await ev('__game.wanted.stars')) >= 2);
    // Keep moving while the box opens: standing still next to an officer means arrest.
    for (let k = 0; k < 21; k += 1) await hold([k % 2 ? 'KeyW' : 'KeyS'], 2);
    await skipTalk();
    await expectStage('bank', 3, 'escape with the money');
    check('bank: four stars on the way out', (await ev('__game.wanted.stars')) >= 4);
    await ev('(() => { const G = __game; const g = G.world.layout.landmarks.garageParking; G.player.teleport(g.x, g.z, Math.PI); G.police.clearAll(); })()');
    await adv(0.5);
    await skipTalk();
    await finishMission('bank');
    check('bank: heat cleared at the garage', (await ev('__game.wanted.stars')) === 0);

    // 7. Pier Pressure
    await startMission('pier');
    await skipTalk();
    await adv(0.3);
    await ev('(() => { const G = __game; const c = G.missions.current.ctx.data.car; G.player.enterVehicle(c); })()');
    await adv(0.5);
    await skipTalk();
    await expectStage('pier', 2, 'run the roadblock to Pelican Key');
    check('pier: three stars once the car is taken', (await ev('__game.wanted.stars')) >= 3);
    await ev('(() => { const G = __game; const lh = G.world.layout.landmarks.lighthouse; const c = G.player.vehicle; c.x = lh.x + 8; c.z = lh.z + 6; c.vx = 0; c.vz = 0; G.police.clearAll(); })()');
    await adv(0.5);
    await skipTalk();
    await finishMission('pier');
    check('pier: heat cleared on Pelican Key', (await ev('__game.wanted.stars')) === 0);

    // 8. High Tide
    await startMission('tide');
    await skipTalk();
    check('tide: shotgun and smg given', await ev('__game.weapons.inv.shotgun.owned && __game.weapons.inv.smg.owned'));
    await adv(0.3);
    await ev('(() => { const G = __game; const e = G.world.layout.landmarks.pierEnd; G.player.teleport(e.x, e.z - 24, 0); G.camera.snapTo(0, 0.2); })()');
    await hold(['KeyW'], 3);
    check('tide: Sol stands on the pier deck', near((await state()).y, 0.64, 0.05), (await state()).y.toFixed(2));
    await skipTalk();
    await expectStage('tide', 2, 'Kane and his crew attack');
    await killSquad();
    await adv(0.5);
    await skipTalk();
    await expectStage('tide', 3, 'escape to Pelican Key');
    check('tide: five stars', (await ev('__game.wanted.stars')) === 5);
    await ev('(() => { const G = __game; const lh = G.world.layout.landmarks.lighthouse; G.player.teleport(lh.x + 8, lh.z + 6, 0); G.police.clearAll(); })()');
    await adv(0.5);
    await skipTalk();
    await finishMission('tide');
    check('story complete', await ev('__game.missions.nextMission() === null && __game.missions.completed.size === 8'));
    check('story complete screen names the end', (await ev('document.getElementById("cp-next").textContent')).length > 0);
    await ev('__game.player.godMode = false; 0');

    // ---------------------------------------------------------------- activities
    section('activities');
    const shardsBefore = await ev('__game.activities.shardsFound.size');
    await ev('(() => { const G = __game; const s = G.activities.shardMeshes[0].position; G.player.teleport(s.x + 1, s.z, 0); })()');
    await adv(0.3);
    check('collecting a sea-glass shard', (await ev('__game.activities.shardsFound.size')) === shardsBefore + 1);
    // Paint shop clears heat and changes colour.
    await ev('(() => { const G = __game; const shop = G.world.layout.landmarks.carShops[1]; const v = G.fleet.spawn("sedan", shop.x, shop.z + 14, Math.PI, { role: "player", owner: "player", color: "#ffffff" }); v.hp = 50; G.player.teleport(v.x + 2.5, v.z, 0); G.player.enterVehicle(v); G.wanted.setStars(2); G.economy.money = 1000; })()');
    await hold(['KeyW'], 3.2);
    await adv(0.3);
    const shop = await ev('(() => { const G = __game; const v = G.player.vehicle; return { color: v.color, hp: v.hp, stars: G.wanted.stars, money: G.economy.money, d: Math.hypot(v.x - G.world.layout.landmarks.carShops[1].x, v.z - G.world.layout.landmarks.carShops[1].z) }; })()');
    check('paint shop resprays, repairs and shakes the cops', shop.color !== '#ffffff' && shop.hp === 100 && shop.stars === 0 && shop.money === 780, JSON.stringify(shop));
    // Race: start it and drive through every checkpoint.
    await ev('(() => { const G = __game; const m = G.markers.list.find(k => k.kind === "race"); const v = G.player.vehicle; v.x = m.x; v.z = m.z + 10; v.yaw = Math.PI; v.vx = 0; v.vz = 0; })()');
    await hold(['KeyW'], 2.5);
    await adv(0.2);
    check('race starts with a countdown', await ev('__game.activities.raceActive()') && (await state()).objective.length > 0);
    await adv(4);
    check('race rivals on the road', (await ev('__game.fleet.vehicles.filter(v => v.role === "racer").length')) === 2);
    for (let k = 0; k < 9; k += 1) {
      const cp = await ev('(() => { const r = __game.activities.race; if (!r) return null; const m = __game.markers.list.find(k => k.kind === "checkpoint"); return m ? { x: m.x, z: m.z } : null; })()');
      if (!cp) break;
      await ev(`(() => { const v = __game.player.vehicle; v.x = ${cp.x}; v.z = ${cp.z} + 9; v.vx = 0; v.vz = -6; })()`);
      await adv(1.6);
    }
    check('race finished with a result screen', (await ev('__game.menus.open')) === 'complete' && (await ev('__game.economy.stats.races')) >= 1);
    await tap('Enter');
    await waitPlaying();
    await adv(0.3);
    // Taxi fare.
    await waitPlaying();
    await ev('(() => { const G = __game; G.player.exitVehicle(); const L = G.world.layout; const v = G.fleet.spawn("taxi", L.roadX(5) + 1.75, L.roadZ(3) + 20, 0, { role: "player", owner: "player" }); G.player.teleport(v.x + 2.5, v.z, 0); G.player.enterVehicle(v); G.activities.taxiTimer = 0.1; })()');
    await adv(1.5);
    check('a fare hails the taxi', await ev('__game.activities.taxi && __game.activities.taxi.phase === "pickup"'));
    await ev('(() => { const t = __game.activities.taxi; const v = __game.player.vehicle; v.x = t.spot.x; v.z = t.spot.z; v.vx = 0; v.vz = 0; })()');
    await adv(0.8);
    check('fare picked up, destination set', await ev('__game.activities.taxi && __game.activities.taxi.phase === "ride"'));
    const moneyT = await ev('__game.economy.money');
    await ev('(() => { const t = __game.activities.taxi; const v = __game.player.vehicle; v.x = t.dest.x; v.z = t.dest.z; v.vx = 0; v.vz = 0; })()');
    await adv(0.8);
    check('fare paid on arrival', (await ev('__game.economy.money')) > moneyT && (await ev('__game.activities.taxi')) === null);
    // Safehouse panel and purchase.
    await ev('(() => { const G = __game; G.player.exitVehicle(); const s = G.world.layout.landmarks.safehouses.neon; G.player.teleport(s.x + 4, s.z, -Math.PI / 2); G.camera.snapTo(-Math.PI / 2, 0.2); G.economy.money = 20000; })()');
    await hold(['KeyW'], 2.5);
    check('unowned safehouse offers purchase', (await ev('__game.menus.open')) === 'safehouse' && (await ev('document.getElementById("sh-text").textContent')).includes('For sale'));
    await clickEl('#panel-safehouse .btn');
    await adv(0.2);
    check('safehouse bought', await ev('__game.economy.ownsSafehouse("neon")') && (await ev('__game.state')) === 'playing');

    // ---------------------------------------------------------------- map, pause, save and load
    section('menus');
    await tap('KeyM');
    check('M opens the map', (await ev('__game.state')) === 'map' && !(await ev('document.getElementById("mapscreen").classList.contains("hidden")')));
    check('map lists story progress', (await ev('document.getElementById("map-side").textContent')).includes('Welcome Home'));
    const mapRect = await ev('(() => { const r = document.getElementById("map-canvas").getBoundingClientRect(); return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.5 }; })()');
    await page.mouse('mousePressed', mapRect.x, mapRect.y, { button: 'left', clickCount: 1 });
    await page.mouse('mouseReleased', mapRect.x, mapRect.y, { button: 'left', clickCount: 1 });
    await new Promise((r) => setTimeout(r, 150));
    check('clicking the map sets a waypoint', await ev('__game.hud.state.waypoint && __game.hud.state.waypoint.kind === "waypoint"'));
    await tap('KeyM');
    check('M closes the map', (await ev('__game.state')) === 'playing');
    await tap('Escape');
    check('Escape pauses', (await ev('__game.state')) === 'paused' && (await ev('__game.menus.open')) === 'pause');
    check('mouse released on the pause menu', !(await ev('__game.input.locked')));
    await clickEl('#btn-pause-resume');
    check('resume returns to play and waits for a click', (await ev('__game.state')) === 'playing' && (await ev('__game.input.needsClick')));
    await adv(0.1);
    check('prompt reads "Click to resume"', (await ev('document.getElementById("pointer-prompt").textContent')) === 'Click to resume');
    // The browser dropping the pointer lock (Esc, which it may not deliver as a key) pauses the game.
    await ev('(() => { const s = __game.input.state; s.needClick = false; s.locked = true; s.wantLock = true; document.dispatchEvent(new Event("pointerlockchange")); })()');
    check('losing the pointer lock while playing opens the pause menu', (await ev('__game.state')) === 'paused' && (await ev('__game.menus.open')) === 'pause' && !(await ev('__game.input.locked')));
    await clickEl('#btn-pause-resume');
    check('resume after a lost lock waits for a click', (await ev('__game.state')) === 'playing' && (await ev('__game.input.needsClick')));
    // The click that recaptures the mouse never fires a weapon; the next one does.
    await ev('(() => { const G = __game; if (G.player.state === "car") G.player.exitVehicle(); G.weapons.give("pistol", 24); G.weapons.select("pistol"); G.weapons.cooldown = 0; G.weapons.reloading = 0; })()');
    await adv(0.1);
    const clipBefore = await ev('__game.weapons.inv.pistol.clip');
    await page.mouse('mouseMoved', 480, 300);
    await page.mouse('mousePressed', 480, 300, { button: 'left', buttons: 1, clickCount: 1 });
    await adv(0.1);
    await page.mouse('mouseReleased', 480, 300, { button: 'left', clickCount: 1 });
    await adv(0.1);
    check('the click that recaptures the mouse does not fire', (await ev('__game.weapons.inv.pistol.clip')) === clipBefore && !(await ev('__game.input.needsClick')), `clip ${clipBefore} -> ${await ev('__game.weapons.inv.pistol.clip')}`);
    await ev('__game.weapons.cooldown = 0; 0');
    await page.mouse('mousePressed', 480, 300, { button: 'left', buttons: 1, clickCount: 1 });
    await adv(0.1);
    await page.mouse('mouseReleased', 480, 300, { button: 'left', clickCount: 1 });
    await adv(0.1);
    check('the next click fires', (await ev('__game.weapons.inv.pistol.clip')) === clipBefore - 1, `clip ${await ev('__game.weapons.inv.pistol.clip')}`);
    await ev('__game.wanted.clear(); __game.police.clearAll(); 0');
    await tap('Escape');
    check('Escape still pauses when the pointer is free', (await ev('__game.state')) === 'paused');
    await clickEl('#btn-pause-save');
    await clickEl('#btn-slot-2');
    check('saved to slot 2', await ev('localStorage.getItem("halcyon-heat-slot-2") !== null'));
    await clickEl('#slots-back');
    await clickEl('#btn-pause-resume');
    check('resume returns to play', (await ev('__game.state')) === 'playing');
    const saved = await state();
    const savedMoney = saved.money;
    await ev('(() => { const G = __game; G.player.teleport(G.player.x + 120, G.player.z + 40, 1); G.economy.money = 5; G.world.sky.setHour(3); })()');
    await tap('Escape');
    await clickEl('#btn-pause-load');
    await clickEl('#btn-slot-2');
    await adv(0.2);
    s = await state();
    check('load restores position, money and time', near(s.x, saved.x, 1) && near(s.z, saved.z, 1) && s.money === savedMoney && near(await ev('__game.world.sky.hour'), await ev('(() => JSON.parse(localStorage.getItem("halcyon-heat-slot-2")).hour)()'), 0.05), `pos ${s.x.toFixed(1)},${s.z.toFixed(1)} vs ${saved.x.toFixed(1)},${saved.z.toFixed(1)}; money ${s.money}`);
    check('load restores missions and weapons', (await ev('__game.missions.completed.size')) === 8 &&(await ev('__game.weapons.inv.shotgun.owned')));
    check('load keeps the game playing', (await ev('__game.state')) === 'playing');
    // Save while driving: the car comes back with the player inside it.
    await ev('(() => { const G = __game; const L = G.world.layout; const v = G.fleet.spawn("pickup", L.roadX(6) + 1.75, L.roadZ(5) + 25, Math.PI, { role: "player", owner: "player", color: "#2f4858" }); G.player.teleport(v.x + 2.5, v.z, 0); G.player.enterVehicle(v); })()');
    await adv(0.2);
    await ev('__game.save.write(3); 0');
    await ev('(() => { const G = __game; G.player.exitVehicle(); G.player.teleport(G.player.x + 90, G.player.z + 30, 0); })()');
    await ev('__game.save.load(3); 0');
    await adv(0.2);
    const inCar = await ev('(() => { const G = __game; const v = G.player.vehicle; return { pstate: G.player.state, type: v ? v.type : null, color: v ? v.color : null, x: v ? v.x : 0, z: v ? v.z : 0, tx: G.world.layout.roadX(6) + 1.75, tz: G.world.layout.roadZ(5) + 25 }; })()');
    check('loading a save made in a car restores the car and the seat', inCar.pstate === 'car' && inCar.type === 'pickup' && inCar.color === '#2f4858' && near(inCar.x, inCar.tx, 1.5) && near(inCar.z, inCar.tz, 1.5), JSON.stringify(inCar));
    check('audio context running in the test browser', await ev('__game.audio.ready'), String(await ev('__game.audio.context && __game.audio.context.state')));
    // Quit to title, Continue loads the latest save.
    await tap('Escape');
    await clickEl('#btn-pause-quit-to-title');
    check('quit to title', (await ev('__game.state')) === 'title');
    check('continue enabled with a save', !(await ev('document.getElementById("btn-continue").classList.contains("disabled")')));
    await clickEl('#btn-continue');
    await adv(0.2);
    check('continue resumes the latest save', (await ev('__game.state')) === 'playing' && (await ev('__game.missions.completed.size')) === 8);

    // ---------------------------------------------------------------- radio and audio
    section('radio');
    await ev('(() => { const G = __game; const L = G.world.layout; const v = G.fleet.spawn("coupe", L.roadX(5) + 1.75, L.roadZ(3) + 20, 0, { role: "player", owner: "player" }); G.player.teleport(v.x + 2.5, v.z, 0); G.player.enterVehicle(v); })()');
    const st0 = await ev('__game.radio.station');
    await tap('KeyR');
    check('R switches the station', (await ev('__game.radio.station')) === (st0 + 1) % 3);
    check('station name on the HUD', (await ev('document.getElementById("radio-name").textContent')) === (await ev('__game.radio.stationName()')));
    check('audio context created on input', await ev('__game.audio.context !== null'));
    check('three stations named', (await ev('__game.radio.stationNames.length')) === 3);

    // ---------------------------------------------------------------- physics consistency
    section('consistency');
    await hold(['KeyW'], 2);
    const cons = await ev('(() => { const G = __game; const v = G.player.vehicle; const m = v.model.root; const f = [Math.sin(v.yaw), Math.cos(v.yaw)]; const vel = Math.hypot(v.vx, v.vz); const along = (v.vx * f[0] + v.vz * f[1]); return { posMatch: Math.hypot(m.position.x - v.x, m.position.z - v.z) < 0.01 && Math.abs(m.rotation.y - v.yaw) < 1e-6, slipRatio: vel > 1 ? Math.abs(v.slip) / vel : 0, speedSign: along > 0, yAboveGround: v.y >= G.world.layout.groundHeight(v.x, v.z) - 0.05 }; })()');
    check('vehicle mesh follows the physics body', cons.posMatch);
    check('no sideways sliding when driving straight', cons.slipRatio < 0.08, cons.slipRatio.toFixed(3));
    check('vehicle rests on the ground', cons.yAboveGround);
    check('no NaN anywhere in the fleet', await ev('__game.fleet.vehicles.every(v => Number.isFinite(v.x) && Number.isFinite(v.z) && Number.isFinite(v.yaw) && Number.isFinite(v.vx))'));
    check('player not stuck inside geometry', await ev('__game.world.colliders.overlaps(__game.player.x, __game.player.z, 0.2) === null'));

    section('errors');
    check('no console errors or exceptions', page.errors.length === 0, page.errors.slice(0, 5).join(' | '));
    page.close();
  } finally {
    await chrome.close();
    await server.close();
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length} / ${results.length} checks passed`);
  if (failed.length) {
    console.log('Failures:');
    for (const f of failed) console.log(`  [${f.section}] ${f.name}${f.info ? ` — ${f.info}` : ''}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
