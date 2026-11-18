// Money, reputation and property: cash earned and spent, reputation points that climb the ranks
// from Nobody to Legend and unlock weapons and missions, the safehouses Sol owns, and the stats
// the pause menu and the mission-complete screen show.
import { ECONOMY, WEAPONS } from './config.js';

export function createEconomy(G) {
  const e = {
    money: ECONOMY.startMoney,
    rep: 0,
    safehouses: { strand: true },
    stats: { missions: 0, carsStolen: 0, pedsHit: 0, pedsDown: 0, copsDown: 0, gangKilled: 0, shotsFired: 0, escapes: 0, races: 0, fares: 0, shards: 0, distanceDriven: 0, distanceWalked: 0, playtime: 0, arrests: 0, hospital: 0, earned: 0 },
  };

  e.repLevel = () => {
    let level = 0;
    for (let i = 1; i < ECONOMY.repLevels.length; i += 1) if (e.rep >= ECONOMY.repLevels[i]) level = i;
    return level;
  };
  e.repName = () => ECONOMY.repNames[e.repLevel()];
  e.nextRepAt = () => ECONOMY.repLevels[Math.min(ECONOMY.repLevels.length - 1, e.repLevel() + 1)];

  e.addMoney = (amount, reason = '') => {
    e.money += amount;
    if (amount > 0) e.stats.earned += amount;
    G.hud.moneyPulse(amount);
    if (reason) G.notify(`${amount >= 0 ? '+' : '-'}$${Math.abs(amount).toLocaleString()} ${reason}`);
  };

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

  e.addRep = (amount) => {
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

  e.stat = (key, n = 1) => {
    e.stats[key] = (e.stats[key] || 0) + n;
  };

  e.ownsSafehouse = (id) => !!e.safehouses[id];
  e.buySafehouse = (id) => {
    const def = ECONOMY.safehouses.find((s) => s.id === id);
    if (!def || e.safehouses[id]) return false;
    if (!e.spend(def.price, `for ${def.name}`)) return false;
    e.safehouses[id] = true;
    e.addRep(15);
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
  e.restore = (data) => {
    if (!data) return;
    e.money = data.money ?? e.money;
    e.rep = data.rep ?? e.rep;
    e.safehouses = { strand: true, ...(data.safehouses || {}) };
    Object.assign(e.stats, data.stats || {});
  };
  e.reset = () => {
    e.money = ECONOMY.startMoney;
    e.rep = 0;
    e.safehouses = { strand: true };
    for (const k of Object.keys(e.stats)) e.stats[k] = 0;
  };
  return e;
}
