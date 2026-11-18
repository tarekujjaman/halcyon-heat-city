// Saving and loading: three manual slots and an autosave in localStorage (every access wrapped in
// try/catch), a snapshot of the whole run (position, car, money, reputation, missions, weapons,
// shards, time of day, wanted level, settings) and the restore that puts it all back.
import { SAVE_PREFIX, TIME } from './config.js';

export const SAVE_VERSION = 3;
const SLOTS = [1, 2, 3];

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function createSave(G) {
  const keyOf = (slot) => `${SAVE_PREFIX}-slot-${slot}`;
  const AUTO = `${SAVE_PREFIX}-autosave`;
  const SETTINGS = `${SAVE_PREFIX}-settings`;

  function readRaw(key) {
    try {
      const s = storage();
      if (!s) return null;
      const text = s.getItem(key);
      return text ? JSON.parse(text) : null;
    } catch {
      return null;
    }
  }

  function writeRaw(key, value) {
    try {
      const s = storage();
      if (!s) return false;
      s.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  /** Everything that makes this run. */
  function snapshot(label = 'manual') {
    const p = G.player;
    const v = p.vehicle;
    return {
      version: SAVE_VERSION,
      label,
      time: Date.now(),
      playtime: G.economy.stats.playtime,
      player: { x: p.x, z: p.z, yaw: p.yaw, health: p.health, armor: p.armor },
      vehicle: v && !v.wrecked ? { type: v.type, color: v.color, x: v.x, z: v.z, yaw: v.yaw, hp: v.hp } : null,
      economy: G.economy.serialize(),
      missions: G.missions.serialize(),
      activities: G.activities.serialize(),
      weapons: G.weapons.serialize(),
      wanted: G.wanted.serialize(),
      hour: G.world.sky.hour,
      radio: G.radio.station,
      gangHostile: G.gangs.hostile,
      seed: G.seed,
    };
  }

  function restore(data) {
    if (!data || typeof data !== 'object') return false;
    G.resetWorldState();
    G.economy.restore(data.economy);
    G.missions.restore(data.missions);
    G.activities.restore(data.activities);
    G.weapons.restore(data.weapons);
    G.wanted.restore(data.wanted);
    G.gangs.setHostile(!!data.gangHostile);
    if (typeof data.hour === 'number') G.world.sky.setHour(data.hour);
    if (typeof data.radio === 'number') G.radio.setStation(data.radio, true);
    const p = data.player || {};
    G.player.revive(p.x ?? 0, p.z ?? 0, p.yaw ?? 0);
    G.player.health = p.health ?? 100;
    G.player.armor = p.armor ?? 0;
    if (data.vehicle) {
      const d = data.vehicle;
      const v = G.fleet.spawn(d.type, d.x, d.z, d.yaw, { color: d.color, role: 'player', owner: 'player' });
      v.hp = d.hp ?? 100;
      G.player.enterVehicle(v);
    }
    G.economy.stats.playtime = data.playtime || 0;
    G.camera.snapTo(G.player.yaw + Math.PI, 0.25);
    G.camera.snapTo(G.player.yaw, 0.25);
    return true;
  }

  return {
    SLOTS,
    write(slot, label = 'manual') {
      const data = snapshot(label);
      const ok = writeRaw(slot === 'auto' ? AUTO : keyOf(slot), data);
      if (ok) G.notify(slot === 'auto' ? 'Autosaved' : `Saved to slot ${slot}`);
      else G.notify('Could not save (storage unavailable)');
      G.audio.play(ok ? 'save' : 'deny');
      return ok;
    },
    read(slot) {
      return readRaw(slot === 'auto' ? AUTO : keyOf(slot));
    },
    load(slot) {
      const data = this.read(slot);
      if (!data) {
        G.notify('That slot is empty');
        return false;
      }
      const ok = restore(data);
      if (ok) G.notify(slot === 'auto' ? 'Autosave loaded' : `Slot ${slot} loaded`);
      return ok;
    },
    /** Slot summaries for the menus: null for an empty slot. */
    list() {
      return [...SLOTS, 'auto'].map((slot) => {
        const d = this.read(slot);
        if (!d) return { slot, empty: true };
        return { slot, empty: false, time: d.time, money: d.economy ? d.economy.money : 0, missions: d.missions ? d.missions.completed.length : 0, playtime: d.playtime || 0, label: d.label };
      });
    },
    /** The most recent save of any slot, for Continue. */
    latest() {
      let best = null;
      for (const s of this.list()) if (!s.empty && (!best || s.time > best.time)) best = s;
      return best;
    },
    hasAny() {
      return this.latest() !== null;
    },
    autosave() {
      return this.write('auto', 'auto');
    },
    snapshot,
    restore,
    saveSettings(settings) {
      writeRaw(SETTINGS, settings);
    },
    loadSettings() {
      return readRaw(SETTINGS);
    },
    defaultHour: TIME.startHour,
  };
}
