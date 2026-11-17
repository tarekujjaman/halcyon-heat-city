// Money, reputation and property, the progression of a run: cash earned and spent, reputation
// points that climb the ranks from Nobody to Legend and unlock weapons and missions, the
// safehouses Sol owns, and the stats the pause menu and the mission-complete screen show.
// Exports createEconomy(G), whose state is saved and restored with the run.
import { ECONOMY, WEAPONS } from './config.js';

/**
 * The economy: {money, rep, safehouses, stats, repLevel, repName, nextRepAt, addMoney, spend,
 * addRep, stat, ownsSafehouse, buySafehouse, unlocksAt, serialize, restore, reset}.
 */
export function createEconomy(G) {
  const e = {
    money: ECONOMY.startMoney,
    rep: 0,
    safehouses: { strand: true },
    stats: { missions: 0, carsStolen: 0, pedsHit: 0, pedsDown: 0, copsDown: 0, gangKilled: 0, shotsFired: 0, escapes: 0, races: 0, fares: 0, shards: 0, distanceDriven: 0, distanceWalked: 0, playtime: 0, arrests: 0, hospital: 0, earned: 0 },
  };

  /** The rank index (0 Nobody .. 5 Legend) the current reputation has reached. */
  e.repLevel = () => {
    let level = 0;
    for (let i = 1; i < ECONOMY.repLevels.length; i += 1) if (e.rep >= ECONOMY.repLevels[i]) level = i;
    return level;
  };
  /** The current rank's name. */
  e.repName = () => ECONOMY.repNames[e.repLevel()];
  /** The reputation the next rank needs (the top rank's own threshold once reached). */
  e.nextRepAt = () => ECONOMY.repLevels[Math.min(ECONOMY.repLevels.length - 1, e.repLevel() + 1)];

  /** Add (or with a negative amount, take) cash, pulsing the HUD and naming the `reason` if given. */
  e.addMoney = (amount, reason = '') => {
    if (!Number.isFinite(amount)) return;
    e.money += amount;
    if (amount > 0) e.stats.earned += amount;
    G.hud.moneyPulse(amount);
    if (reason) G.notify(`${amount >= 0 ? '+' : '-'}$${Math.abs(amount).toLocaleString()} ${reason}`);
  };

  /** Pay `amount` if Sol can afford it (true), else refuse with a notice and a sound (false). */
  e.spend = (amount, reason = '') => {
    if (e.money < amount) {
      G.notify(`Not enough money ($${amount.toLocaleString()} needed)`);
      G.audio.play('deny');
      return false;
    }
    e.money -= amount;
    G.hud.moneyPulse(-amount);
    if (reason) G.notify(`-$${amount.toLocaleString()} ${reason}`);
    G.audio.play('cash');
    return true;
  };

  /** Add reputation points; crossing a rank announces it, the weapons it unlocks, and emits 'repLevel'. */
  e.addRep = (amount) => {
    if (!Number.isFinite(amount)) return;
    const before = e.repLevel();
    e.rep += amount;
    const after = e.repLevel();
    if (after > before) {
      G.notify(`Reputation up: ${ECONOMY.repNames[after]}`);
      G.audio.play('levelUp');
      for (const [id, w] of Object.entries(WEAPONS)) {
        if (w.unlockRep === after && id !== 'fists') G.notify(`${w.name} now sold at Teo's`);
      }
      G.events.emit('repLevel', after);
    }
  };

  /** Count `n` toward the stat `key` (created at 0 if new). */
  e.stat = (key, n = 1) => {
    e.stats[key] = (e.stats[key] || 0) + n;
  };

  /** Does Sol own safehouse `id`? */
  e.ownsSafehouse = (id) => !!e.safehouses[id];
  /** Buy safehouse `id` from ECONOMY.safehouses if affordable and not yet owned; true on success. */
  e.buySafehouse = (id) => {
    const def = ECONOMY.safehouses.find((s) => s.id === id);
    if (!def || e.safehouses[id]) return false;
    if (!e.spend(def.price, `for ${def.name}`)) return false;
    e.safehouses[id] = true;
    e.addRep(ECONOMY.safehouseRep);
    G.notify(`${def.name} is yours. Save and rest here.`);
    return true;
  };

  /** The weapon names rank `level` unlocks, for the mission-complete screen. */
  e.unlocksAt = (level) => {
    const list = [];
    for (const [id, w] of Object.entries(WEAPONS)) if (w.unlockRep === level && id !== 'fists') list.push(w.name);
    return list;
  };

  /** The save form: money, reputation, owned safehouses and the stats. */
  e.serialize = () => ({ money: e.money, rep: e.rep, safehouses: { ...e.safehouses }, stats: { ...e.stats } });
  /** Put a serialized economy back; missing fields keep their current values and the Strand is always owned. */
  e.restore = (data) => {
    if (!data) return;
    e.money = Number.isFinite(data.money) ? data.money : e.money;
    e.rep = Number.isFinite(data.rep) ? data.rep : e.rep;
    e.safehouses = { strand: true, ...(data.safehouses || {}) };
    Object.assign(e.stats, data.stats || {});
  };
  /** A fresh run: starting cash, no reputation, the Strand only, every stat at zero. */
  e.reset = () => {
    e.money = ECONOMY.startMoney;
    e.rep = 0;
    e.safehouses = { strand: true };
    for (const k of Object.keys(e.stats)) e.stats[k] = 0;
  };
  return e;
}
