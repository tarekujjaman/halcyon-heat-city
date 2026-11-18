// Money, reputation and property: cash earned and spent, reputation points that climb the ranks
// from Nobody to Legend and unlock weapons and missions, the safehouses Sol owns, and the stats
// the pause menu and the mission-complete screen show. Exports createEconomy(G); the object it
// returns is read by the HUD and menus and serialized into the save file.
import { ECONOMY, WEAPONS } from './config.js';

const START_SAFEHOUSES = () => ({ strand: true });

/** Money, rep and stats with the mutators every other system calls. Amounts that are not finite numbers are ignored. */
export function createEconomy(G) {
  const e = {
    money: ECONOMY.startMoney,
    rep: 0,
    safehouses: START_SAFEHOUSES(),
    stats: { missions: 0, carsStolen: 0, pedsHit: 0, pedsDown: 0, copsDown: 0, gangKilled: 0, shotsFired: 0, escapes: 0, races: 0, fares: 0, shards: 0, distanceDriven: 0, distanceWalked: 0, playtime: 0, arrests: 0, hospital: 0, earned: 0 },
  };

  /** The rank index 0..5 the current rep has reached. */
  e.repLevel = () => {
    let level = 0;
    for (let i = 1; i < ECONOMY.repLevels.length; i += 1) if (e.rep >= ECONOMY.repLevels[i]) level = i;
    return level;
  };
  /** The rank's name (Nobody .. Legend). */
  e.repName = () => ECONOMY.repNames[e.repLevel()];
  /** The rep the next rank needs (the top threshold once Legend is reached). */
  e.nextRepAt = () => ECONOMY.repLevels[Math.min(ECONOMY.repLevels.length - 1, e.repLevel() + 1)];

  /** Add (or with a negative amount take) money; `reason` makes it a notification. */
  e.addMoney = (amount, reason = '') => {
    if (!Number.isFinite(amount)) return;
    e.money += amount;
    if (amount > 0) e.stats.earned += amount;
    G.hud.moneyPulse(amount);
    if (reason) G.notify(`${amount >= 0 ? '+' : '-'}$${Math.abs(amount).toLocaleString()} ${reason}`);
  };

  /** Pay `amount` if Sol has it: true and the cash sound, or false and a refusal. */
  e.spend = (amount, reason = '') => {
    if (!Number.isFinite(amount)) return false;
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

  /** Add reputation; crossing a rank announces it, the weapons it unlocks, and emits 'repLevel'. */
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

  /** Bump a counter in `stats` (created if new). */
  e.stat = (key, n = 1) => {
    e.stats[key] = (e.stats[key] || 0) + n;
  };

  e.ownsSafehouse = (id) => !!e.safehouses[id];
  /** Buy a safehouse from ECONOMY.safehouses by id: false if unknown, already owned or unaffordable. */
  e.buySafehouse = (id) => {
    const def = ECONOMY.safehouses.find((s) => s.id === id);
    if (!def || e.safehouses[id]) return false;
    if (!e.spend(def.price, `for ${def.name}`)) return false;
    e.safehouses[id] = true;
    e.addRep(ECONOMY.safehouseRep);
    G.notify(`${def.name} is yours. Save and rest here.`);
    return true;
  };

  /** What the next rank brings, for the mission-complete screen. */
  e.unlocksAt = (level) => {
    const list = [];
    for (const [id, w] of Object.entries(WEAPONS)) if (w.unlockRep === level && id !== 'fists') list.push(w.name);
    return list;
  };

  e.serialize = () => ({ money: e.money, rep: e.rep, safehouses: { ...e.safehouses }, stats: { ...e.stats } });
  /** Put a serialized economy back; the first safehouse is always owned and odd values keep the current ones. */
  e.restore = (data) => {
    if (!data) return;
    if (Number.isFinite(data.money)) e.money = data.money;
    if (Number.isFinite(data.rep)) e.rep = data.rep;
    e.safehouses = { ...START_SAFEHOUSES(), ...(data.safehouses || {}) };
    for (const [k, v] of Object.entries(data.stats || {})) if (Number.isFinite(v)) e.stats[k] = v;
  };
  /** A new game: starting money, no rep, only the Strand apartment, every stat at zero. */
  e.reset = () => {
    e.money = ECONOMY.startMoney;
    e.rep = 0;
    e.safehouses = START_SAFEHOUSES();
    for (const k of Object.keys(e.stats)) e.stats[k] = 0;
  };
  return e;
}
