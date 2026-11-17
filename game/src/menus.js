// Menus: the title screen (New Game, Continue, Load, Settings, Controls), the pause menu with
// three save slots, settings (volume, mouse sensitivity, invert Y, shadows), the controls card,
// safehouse and purchase panels, the mission-complete and race-result screens, and the
// hospital/arrest screens with their fees.
import { GAME_TITLE, ECONOMY, WEAPONS } from './config.js';
import { KEYS } from './input.js';

const CONTROLS = [
  ['W A S D', 'Walk / drive (S brakes, then reverses)'], ['Shift', 'Run'], ['Space', 'Jump / handbrake'], ['Mouse', 'Look around (click to capture)'],
  ['Left click', 'Punch / shoot'], ['1 2 3 4 / wheel', 'Weapons'], ['F', 'Enter or steal a car / get out'], ['R', 'Radio station'],
  ['M', 'Map and waypoints'], ['H', 'Horn'], ['Esc', 'Pause'], ['Arrows / Q E', 'Turn the camera without the mouse'],
];

export function createMenus(G, root) {
  const panels = {};
  let openPanel = null;
  let deathTimer = 0;
  let deathCb = null;

  function panel(id, html, cls = '') {
    const d = document.createElement('div');
    d.id = `panel-${id}`;
    d.className = `panel hidden ${cls}`;
    d.innerHTML = html;
    root.appendChild(d);
    panels[id] = d;
    return d;
  }

  function show(id) {
    for (const p of Object.values(panels)) p.classList.add('hidden');
    if (id) {
      panels[id].classList.remove('hidden');
      root.classList.remove('hidden');
    } else root.classList.add('hidden');
    openPanel = id;
  }

  function button(label, onClick, cls = '') {
    return `<button class="btn ${cls}" data-action="${label}">${label}</button>`;
  }

  // Title.
  panel('title', `
    <div class="title-wrap">
      <div class="logo"><span class="logo-a">HALCYON</span><span class="logo-b">HEAT</span></div>
      <div class="tagline">A Halcyon Bay story · open world · golden hour</div>
      <div class="menu-list" id="title-buttons"></div>
      <div class="title-foot">Marisol "Sol" Vega is back in town. Steal it, drive it, outrun it.</div>
    </div>`, 'title');
  function refreshTitle() {
    const list = panels.title.querySelector('#title-buttons');
    const hasSave = G.save.hasAny();
    list.innerHTML = '';
    const add = (label, fn, disabled = false) => {
      const b = document.createElement('button');
      b.className = `btn big${disabled ? ' disabled' : ''}`;
      b.textContent = label;
      b.id = `btn-${label.toLowerCase().replace(/\s+/g, '-')}`;
      b.addEventListener('click', () => { if (!disabled) { G.audio.play('click'); fn(); } });
      list.appendChild(b);
    };
    add('New Game', () => G.newGame());
    add('Continue', () => G.continueGame(), !hasSave);
    add('Load', () => showSlots('load', 'title'), !hasSave);
    add('Settings', () => showSettings('title'));
    add('Controls', () => showControls('title'));
  }

  // Pause.
  panel('pause', `
    <h1>PAUSED</h1>
    <div class="menu-list" id="pause-buttons"></div>
    <div class="pause-stats" id="pause-stats"></div>`);
  function refreshPause() {
    const list = panels.pause.querySelector('#pause-buttons');
    list.innerHTML = '';
    const add = (label, fn) => {
      const b = document.createElement('button');
      b.className = 'btn';
      b.textContent = label;
      b.id = `btn-pause-${label.toLowerCase().replace(/\s+/g, '-')}`;
      b.addEventListener('click', () => { G.audio.play('click'); fn(); });
      list.appendChild(b);
    };
    add('Resume', () => G.resume());
    add('Map', () => G.openMap());
    add('Save', () => showSlots('save', 'pause'));
    add('Load', () => showSlots('load', 'pause'));
    add('Settings', () => showSettings('pause'));
    add('Controls', () => showControls('pause'));
    add('Quit to title', () => G.quitToTitle());
    const e = G.economy;
    const s = e.stats;
    panels.pause.querySelector('#pause-stats').innerHTML = `
      <div><span>Cash</span><b>$${e.money.toLocaleString()}</b></div>
      <div><span>Reputation</span><b>${e.repName()} · ${e.rep} / ${e.nextRepAt()}</b></div>
      <div><span>Missions</span><b>${s.missions} / ${G.missions.defs.length}</b></div>
      <div><span>Cars stolen</span><b>${s.carsStolen}</b></div>
      <div><span>Driven</span><b>${(G.player.distanceDriven / 1000).toFixed(1)} km</b></div>
      <div><span>Police escapes</span><b>${s.escapes}</b></div>
      <div><span>Races won</span><b>${Object.values(G.activities.racesWon).reduce((a, b) => a + b, 0)}</b></div>
      <div><span>Shards</span><b>${G.activities.shardsFound.size} / 20</b></div>
      <div><span>Play time</span><b>${Math.floor(s.playtime / 60)} min</b></div>`;
  }

  // Slots.
  panel('slots', `<h1 id="slots-title">SAVE</h1><div class="slot-list" id="slot-list"></div><button class="btn back" id="slots-back">Back</button>`);
  let slotsBackTo = 'title';
  function showSlots(mode, backTo) {
    slotsBackTo = backTo;
    panels.slots.querySelector('#slots-title').textContent = mode === 'save' ? 'SAVE GAME' : 'LOAD GAME';
    const list = panels.slots.querySelector('#slot-list');
    list.innerHTML = '';
    for (const s of G.save.list()) {
      if (mode === 'save' && s.slot === 'auto') continue;
      const b = document.createElement('button');
      b.className = `btn slot${s.empty ? ' empty' : ''}`;
      b.id = `btn-slot-${s.slot}`;
      const name = s.slot === 'auto' ? 'Autosave' : `Slot ${s.slot}`;
      b.innerHTML = s.empty ? `<b>${name}</b><span>Empty</span>` : `<b>${name}</b><span>${new Date(s.time).toLocaleString()} · $${s.money.toLocaleString()} · ${s.missions} missions · ${Math.floor(s.playtime / 60)} min</span>`;
      b.addEventListener('click', () => {
        G.audio.play('click');
        if (mode === 'save') {
          G.save.write(s.slot);
          showSlots('save', backTo);
        } else if (!s.empty) G.loadGame(s.slot);
      });
      list.appendChild(b);
    }
    show('slots');
  }
  panels.slots.querySelector('#slots-back').addEventListener('click', () => show(slotsBackTo));

  // Settings.
  panel('settings', `
    <h1>SETTINGS</h1>
    <label class="setting"><span>Master volume</span><input type="range" id="set-volume" min="0" max="100" step="1"><b id="set-volume-v"></b></label>
    <label class="setting"><span>Music volume</span><input type="range" id="set-music" min="0" max="100" step="1"><b id="set-music-v"></b></label>
    <label class="setting"><span>Mouse sensitivity</span><input type="range" id="set-sens" min="1" max="12" step="0.5"><b id="set-sens-v"></b></label>
    <label class="setting check"><span>Invert mouse Y</span><input type="checkbox" id="set-invert"></label>
    <label class="setting check"><span>Shadows</span><input type="checkbox" id="set-shadows"></label>
    <button class="btn back" id="settings-back">Back</button>`);
  let settingsBackTo = 'title';
  function showSettings(backTo) {
    settingsBackTo = backTo;
    const s = G.settings;
    const p = panels.settings;
    p.querySelector('#set-volume').value = Math.round(s.volume * 100);
    p.querySelector('#set-music').value = Math.round(s.music * 100);
    p.querySelector('#set-sens').value = s.sensitivity * 1000;
    p.querySelector('#set-invert').checked = s.invertY;
    p.querySelector('#set-shadows').checked = s.shadows;
    updateSettingLabels();
    show('settings');
  }
  function updateSettingLabels() {
    const p = panels.settings;
    p.querySelector('#set-volume-v').textContent = `${p.querySelector('#set-volume').value}%`;
    p.querySelector('#set-music-v').textContent = `${p.querySelector('#set-music').value}%`;
    p.querySelector('#set-sens-v').textContent = `${Number(p.querySelector('#set-sens').value).toFixed(1)}`;
  }
  panels.settings.addEventListener('input', () => {
    const p = panels.settings;
    G.applySettings({
      volume: Number(p.querySelector('#set-volume').value) / 100,
      music: Number(p.querySelector('#set-music').value) / 100,
      sensitivity: Number(p.querySelector('#set-sens').value) / 1000,
      invertY: p.querySelector('#set-invert').checked,
      shadows: p.querySelector('#set-shadows').checked,
    });
    updateSettingLabels();
  });
  panels.settings.querySelector('#settings-back').addEventListener('click', () => show(settingsBackTo));

  // Controls.
  panel('controls', `<h1>CONTROLS</h1><table class="controls">${CONTROLS.map(([k, v]) => `<tr><td><kbd>${k}</kbd></td><td>${v}</td></tr>`).join('')}</table><button class="btn back" id="controls-back">Back</button>`);
  let controlsBackTo = 'title';
  function showControls(backTo) {
    controlsBackTo = backTo;
    show('controls');
  }
  panels.controls.querySelector('#controls-back').addEventListener('click', () => show(controlsBackTo));

  // Safehouse.
  panel('safehouse', `<h1 id="sh-title">SAFEHOUSE</h1><p id="sh-text"></p><div class="menu-list" id="sh-buttons"></div>`);
  function openSafehouse(def) {
    G.pauseFor('safehouse');
    panels.safehouse.querySelector('#sh-title').textContent = def.name.toUpperCase();
    panels.safehouse.querySelector('#sh-text').textContent = 'Rest, patch up and save your progress.';
    const list = panels.safehouse.querySelector('#sh-buttons');
    list.innerHTML = '';
    const add = (label, fn) => {
      const b = document.createElement('button');
      b.className = 'btn';
      b.textContent = label;
      b.addEventListener('click', () => { G.audio.play('click'); fn(); });
      list.appendChild(b);
    };
    add('Save game', () => showSlots('save', 'safehouse'));
    add('Sleep until morning (heal)', () => { G.player.heal(); G.player.armor = Math.max(G.player.armor, 25); G.world.sky.setHour(7.2); G.wanted.clear(); G.notify('You slept. A new day in Halcyon Bay.'); G.resume(); });
    add('Buy armor ($300)', () => { if (G.economy.spend(300, 'for armor')) G.player.armor = 100; });
    for (const [id, w] of Object.entries(WEAPONS)) {
      if (id === 'fists') continue;
      const unlocked = G.economy.repLevel() >= w.unlockRep;
      add(unlocked ? `Buy ${w.name} ammo ($${w.price})` : `${w.name}: reputation ${ECONOMY.repNames[w.unlockRep]} needed`, () => {
        if (!unlocked) { G.notify(`Reach ${ECONOMY.repNames[w.unlockRep]} first`); return; }
        if (G.economy.spend(w.price, `for ${w.name}`)) G.weapons.give(id, w.ammo);
      });
    }
    add('Leave', () => G.resume());
    show('safehouse');
  }
  function openPurchase(def) {
    G.pauseFor('safehouse');
    panels.safehouse.querySelector('#sh-title').textContent = def.name.toUpperCase();
    panels.safehouse.querySelector('#sh-text').textContent = `For sale: $${def.price.toLocaleString()}. A place to sleep, save and shake the heat.`;
    const list = panels.safehouse.querySelector('#sh-buttons');
    list.innerHTML = '';
    const buy = document.createElement('button');
    buy.className = 'btn';
    buy.textContent = `Buy for $${def.price.toLocaleString()}`;
    buy.addEventListener('click', () => { if (G.economy.buySafehouse(def.id)) G.resume(); });
    const leave = document.createElement('button');
    leave.className = 'btn';
    leave.textContent = 'Leave';
    leave.addEventListener('click', () => G.resume());
    list.append(buy, leave);
    show('safehouse');
  }

  // Mission complete / result.
  panel('complete', `
    <div class="complete-head"><div class="complete-kicker" id="cp-kicker">MISSION COMPLETE</div><h1 id="cp-title"></h1></div>
    <div class="rewards" id="cp-rewards"></div>
    <div class="cp-stats" id="cp-stats"></div>
    <div class="cp-next" id="cp-next"></div>
    <button class="btn big" id="cp-continue">Continue</button>`, 'complete');
  panels.complete.querySelector('#cp-continue').addEventListener('click', () => { G.audio.play('click'); G.resume(); });
  function showMissionComplete({ def, money, rep, levelUp, next, finale }) {
    G.pauseFor('complete');
    const p = panels.complete;
    p.querySelector('#cp-kicker').textContent = finale ? 'STORY COMPLETE' : 'MISSION COMPLETE';
    p.querySelector('#cp-title').textContent = def.title;
    const e = G.economy;
    const level = e.repLevel();
    p.querySelector('#cp-rewards').innerHTML = `
      <div class="reward"><span>Reward</span><b>+$${money.toLocaleString()}</b></div>
      <div class="reward"><span>Reputation</span><b>+${rep} RP${levelUp ? ` · now ${e.repName()}` : ''}</b></div>
      <div class="reward"><span>Cash</span><b>$${e.money.toLocaleString()}</b></div>`;
    const s = e.stats;
    p.querySelector('#cp-stats').innerHTML = `
      <div><span>Missions done</span><b>${s.missions} / ${G.missions.defs.length}</b></div>
      <div><span>Cars stolen</span><b>${s.carsStolen}</b></div>
      <div><span>Distance driven</span><b>${(G.player.distanceDriven / 1000).toFixed(1)} km</b></div>
      <div><span>Police escapes</span><b>${s.escapes}</b></div>
      <div><span>Rank</span><b>${e.repName()} (${e.rep} RP)</b></div>
      <div><span>Shards</span><b>${G.activities.shardsFound.size} / 20</b></div>`;
    const unlocks = levelUp ? e.unlocksAt(level) : [];
    p.querySelector('#cp-next').innerHTML = (next ? `<div class="next"><span>NEXT MISSION UNLOCKED</span><b>${next.title}</b><i>from ${G.missions.CHARACTERS[next.giver].name} · ${next.brief}</i></div>` : `<div class="next"><span>THE END</span><b>Sol and Dani slip out of the bay on Teo's boat.</b><i>Halcyon Bay is still yours: races, fares, shards and safehouses await.</i></div>`)
      + (unlocks.length ? `<div class="unlock">UNLOCKED: ${unlocks.join(', ')}</div>` : '');
    show('complete');
  }
  function showResult({ title, lines, money, rep }) {
    G.pauseFor('complete');
    const p = panels.complete;
    p.querySelector('#cp-kicker').textContent = 'RESULT';
    p.querySelector('#cp-title').textContent = title;
    p.querySelector('#cp-rewards').innerHTML = `<div class="reward"><span>Prize</span><b>${money ? `+$${money.toLocaleString()}` : '—'}</b></div><div class="reward"><span>Reputation</span><b>${rep ? `+${rep} RP` : '—'}</b></div>`;
    p.querySelector('#cp-stats').innerHTML = lines.map((l) => `<div><b>${l}</b></div>`).join('');
    p.querySelector('#cp-next').innerHTML = '';
    show('complete');
  }

  // Death / arrest.
  panel('death', `<div class="death-wrap"><h1 id="death-title">HOSPITALIZED</h1><p id="death-text"></p></div>`, 'death');
  function showDeath(kind, fee, cb) {
    G.pauseFor('death');
    panels.death.querySelector('#death-title').textContent = kind;
    panels.death.querySelector('#death-text').textContent = kind === 'ARRESTED' ? `Weapons confiscated. Bail $${fee.toLocaleString()}.` : `Hospital bill $${fee.toLocaleString()}. You wake up at the clinic.`;
    panels.death.className = `panel death ${kind === 'ARRESTED' ? 'arrested' : 'hospital'}`;
    show('death');
    deathTimer = 3.2;
    deathCb = cb;
  }

  root.addEventListener('click', (e) => {
    if (e.target.classList && e.target.classList.contains('btn')) e.target.blur();
  });

  return {
    panels,
    get open() {
      return openPanel;
    },
    showTitle() {
      refreshTitle();
      show('title');
    },
    showPause() {
      refreshPause();
      show('pause');
    },
    hide() {
      show(null);
    },
    showSettings, showControls, showSlots, openSafehouse, openPurchase, showMissionComplete, showResult, showDeath,
    update(dt) {
      if (deathTimer > 0) {
        deathTimer -= dt;
        if (deathTimer <= 0 && deathCb) {
          const cb = deathCb;
          deathCb = null;
          cb();
        }
      }
    },
    /** Enter closes a result screen; Escape backs out of sub panels. */
    handleKeys(input) {
      if (openPanel === 'complete' && (input.wasPressed(KEYS.dialogueSkip) || input.wasPressed('Space'))) G.resume();
      if (input.wasPressed(KEYS.pause)) {
        if (openPanel === 'settings') show(settingsBackTo);
        else if (openPanel === 'controls') show(controlsBackTo);
        else if (openPanel === 'slots') show(slotsBackTo);
        else if (openPanel === 'safehouse') G.resume();
        else if (openPanel === 'pause') G.resume();
      }
    },
    GAME_TITLE,
  };
}
