// The story of HALCYON HEAT: Marisol "Sol" Vega, a getaway driver back in Halcyon Bay after five
// years away, her uncle Teo's body shop in debt to Kane Okafor's Tide Runners, her cousin Dani in
// trouble, and Detective Ruiz who wants Okafor more than she wants Sol. Seven missions, each a
// list of stages with objectives, dialogue, markers, timers, fail conditions and rewards.

export const CHARACTERS = {
  sol: { name: 'Sol', color: '#ffb347', look: 'sol' },
  teo: { name: 'Uncle Teo', color: '#8bff6b', look: 'teo' },
  dani: { name: 'Dani', color: '#ffd43b', look: 'dani' },
  kane: { name: 'Kane Okafor', color: '#ff4fd8', look: 'kane' },
  ruiz: { name: 'Det. Ruiz', color: '#7fd3ff', look: 'ruiz' },
  rico: { name: 'Rico', color: '#ff6b4a', look: 'gang' },
  radio: { name: 'Teo (phone)', color: '#8bff6b', look: null },
};

const COUNTDOWN = 150;

/** The missions in story order; `L` is the layout's landmarks. */
export function storyMissions(L) {
  return [
    {
      id: 'welcome', title: 'Welcome Home', giver: 'teo', start: L.garage, reward: { money: 800, rep: 20 },
      brief: 'Get Dani out of Neon Row before the Tide Runners find him.',
      stages: [
        {
          objective: "Listen to Teo",
          enter(ctx) {
            ctx.actor('teo', L.garage.x + 2, L.garage.z - 1.5);
            ctx.say('teo', 'Sol. Five years away and you still park like a maniac. Welcome home, mija.');
            ctx.say('sol', 'You said it was urgent, Teo.');
            ctx.say('teo', "Dani got in deep with Kane Okafor's crew. He's hiding at The Riptide in Neon Row. Get him out before they find him.");
          },
          update(ctx) {
            return ctx.talking() ? null : 'next';
          },
        },
        {
          objective: 'Get a car and pick up Dani outside The Riptide',
          enter(ctx) {
            ctx.goTo(L.gangBarRoad.x, L.gangBarRoad.z, { radius: 6, needVehicle: true, label: 'Dani' });
            ctx.actor('dani', L.gangBar.x + 3, L.gangBar.z - 1, { hide: false });
            if (!ctx.player.vehicle) ctx.hint('Press F next to any car to take it');
          },
          update(ctx) {
            if (ctx.reached()) {
              ctx.removeActors();
              ctx.say('dani', 'Sol! Drive, drive, they saw me come out!');
              ctx.data.chasers = [
                ctx.gangCar(L.gangBarRoad.x + 26, L.gangBarRoad.z, Math.PI / 2 + Math.PI),
                ctx.gangCar(L.gangBarRoad.x - 30, L.gangBarRoad.z - 7, Math.PI / 2),
              ];
              for (const c of ctx.data.chasers) c.ai.setChase(ctx.playerTarget, 27);
              ctx.notify('Dani is in the car');
              return 'next';
            }
            return null;
          },
        },
        {
          objective: 'Lose the Tide Runners',
          enter(ctx) {
            ctx.data.clear = 0;
          },
          update(ctx, dt) {
            const p = ctx.player;
            if (p.state !== 'car') ctx.hint('Get back in the car');
            const near = ctx.data.chasers.some((c) => !c.wrecked && Math.hypot(c.x - p.x, c.z - p.z) < 85);
            ctx.data.clear = near ? 0 : ctx.data.clear + dt;
            if (ctx.data.clear > 4) {
              for (const c of ctx.data.chasers) if (!c.wrecked) { c.ai.setRoad(); c.ai.limit = 12; }
              return 'next';
            }
            return null;
          },
        },
        {
          objective: "Bring Dani to Teo's garage",
          enter(ctx) {
            ctx.goTo(L.garageParking.x, L.garageParking.z, { radius: 6, needVehicle: true, label: "Teo's garage" });
          },
          update(ctx) {
            if (ctx.reached()) {
              ctx.say('dani', "Kane's not going to let this go, you know.");
              ctx.say('sol', "Then he'll have to deal with me.");
              return 'next';
            }
            return null;
          },
        },
        { objective: '', enter() {}, update: (ctx) => (ctx.talking() ? null : 'next') },
      ],
    },
    {
      id: 'clock', title: 'Clock Runner', giver: 'teo', start: L.garage, reward: { money: 1200, rep: 25 },
      brief: 'Steal a Vega GT from Palmetto Heights and deliver it in one piece, against the clock.',
      stages: [
        {
          objective: 'Listen to Teo',
          enter(ctx) {
            ctx.actor('teo', L.garage.x + 2, L.garage.z - 1.5);
            ctx.say('teo', "A client up in Palmetto Heights left a Vega GT in his driveway. He wants it gone before his wife is back from the airport.");
            ctx.say('teo', 'Bring it here without a scratch. You have as long as her drive takes.');
            ctx.say('sol', 'So, no scratches and no time. My favourite kind of job.');
          },
          update: (ctx) => (ctx.talking() ? null : 'next'),
        },
        {
          objective: 'Get to the Vega GT in Palmetto Heights',
          enter(ctx) {
            const spot = L.palmettoDrive;
            ctx.data.car = ctx.spawnCar('coupe', spot.x, spot.z, Math.PI / 2, { color: '#ffd166', parked: true });
            ctx.goTo(spot.x, spot.z, { radius: 8, label: 'Vega GT' });
          },
          update(ctx) {
            if (ctx.player.vehicle === ctx.data.car) return 'next';
            return null;
          },
        },
        {
          objective: "Deliver the Vega GT to Teo's garage before the time runs out. Keep it clean.",
          enter(ctx) {
            ctx.timer(COUNTDOWN);
            ctx.goTo(L.garageParking.x, L.garageParking.z, { radius: 6, needVehicle: true, label: "Teo's garage" });
            ctx.say('radio', 'Clock is running, Sol. Her flight just landed.');
          },
          update(ctx) {
            const car = ctx.data.car;
            if (car.wrecked) return 'fail:The Vega GT was destroyed';
            if (car.hp < 30) return 'fail:The Vega GT is too damaged to sell';
            if (ctx.timeLeft() <= 0) return 'fail:Time ran out';
            if (ctx.reached()) {
              if (ctx.player.vehicle !== car) return 'fail:Wrong car';
              ctx.releaseVehicle(car);
              ctx.say('teo', 'Not a scratch. Maybe you did learn something out there.');
              return 'next';
            }
            return null;
          },
        },
        { objective: '', enter() {}, update: (ctx) => (ctx.talking() ? null : 'next') },
      ],
    },
    {
      id: 'neon', title: 'Neon Collection', giver: 'teo', start: L.garage, reward: { money: 1500, rep: 30 },
      brief: "Collect the money the Tide Runners owe Teo at The Riptide. They will not pay politely.",
      stages: [
        {
          objective: 'Listen to Teo',
          enter(ctx) {
            ctx.actor('teo', L.garage.x + 2, L.garage.z - 1.5);
            ctx.say('teo', "Kane's people owe me three months of bodywork. Go to The Riptide and collect.");
            ctx.say('teo', 'Take this. Try not to use it.');
            ctx.giveWeapon('pistol', 60);
            ctx.say('sol', "I'll be polite. Once.");
          },
          update: (ctx) => (ctx.talking() ? null : 'next'),
        },
        {
          objective: "Collect Teo's money at The Riptide",
          enter(ctx) {
            ctx.goTo(L.gangBar.x, L.gangBar.z, { radius: 4, needFoot: true, label: 'The Riptide' });
            ctx.data.rico = ctx.gangActor(L.gangBar.x - 2, L.gangBar.z - 2, { name: 'Rico', hostile: false });
          },
          update(ctx) {
            if (ctx.reached()) {
              ctx.say('rico', 'Kane says the debt is forgiven. Now beat it, driver.');
              ctx.say('sol', "That's not how it works.");
              return 'next';
            }
            return null;
          },
        },
        {
          objective: 'Deal with the Tide Runners',
          enter(ctx) {
            const b = L.gangBar;
            ctx.data.squad = ctx.squad([
              { x: b.x - 9, z: b.z + 4 }, { x: b.x + 9, z: b.z + 5 }, { x: b.x - 4, z: b.z + 12 }, { x: b.x + 6, z: b.z + 13 },
            ]);
            ctx.data.rico.hostile = true;
            ctx.data.squad.push(ctx.data.rico);
            ctx.setGangHostile(true);
            ctx.hint('Left click to shoot, 2 for the pistol');
          },
          update(ctx) {
            if (ctx.talking()) return null;
            if (ctx.allDead(ctx.data.squad)) return 'next';
            return null;
          },
        },
        {
          objective: 'Take the money from the bar',
          enter(ctx) {
            ctx.goTo(L.gangBar.x, L.gangBar.z, { radius: 3, needFoot: true, label: 'Cash' });
          },
          update(ctx) {
            if (ctx.reached()) {
              ctx.say('sol', 'Tell Kane the Vegas say hi.');
              return 'next';
            }
            return null;
          },
        },
        { objective: '', enter() {}, update: (ctx) => (ctx.talking() ? null : 'next') },
      ],
    },
    {
      id: 'tail', title: 'Tail Lights', giver: 'ruiz', start: L.plaza, reward: { money: 2000, rep: 40 },
      brief: "Detective Ruiz wants Kane's courier stopped. However you like.",
      stages: [
        {
          objective: 'Listen to Detective Ruiz',
          enter(ctx) {
            ctx.actor('ruiz', L.plaza.x + 2, L.plaza.z + 9);
            ctx.say('ruiz', "Marisol Vega. Detective Ruiz, HPD. Relax, I'm not here for you. I'm here for Okafor.");
            ctx.say('sol', 'You want a driver?');
            ctx.say('ruiz', "I want his courier. Teal coupe, leaving Saltmarsh Docks with a bag of his money. Stop it, however you like. I'll be looking elsewhere.");
          },
          update: (ctx) => (ctx.talking() ? null : 'next'),
        },
        {
          objective: 'Get to Saltmarsh Docks before the courier leaves',
          enter(ctx) {
            const s = L.docksYardRoad;
            ctx.data.courier = ctx.spawnCar('coupe', s.x, s.z, 0, { color: '#1c8a7a', parked: true, driverKind: 'gang' });
            ctx.goTo(s.x, s.z + 10, { radius: 40, label: 'Courier' });
            ctx.data.wait = 0;
          },
          update(ctx, dt) {
            ctx.data.wait += dt;
            if (ctx.reached() || ctx.data.wait > 75) {
              ctx.makeFlee(ctx.data.courier, 26);
              ctx.say('radio', "That's the car, Sol. Don't let it reach the highway.");
              return 'next';
            }
            return null;
          },
        },
        {
          objective: "Stop the courier's car",
          enter(ctx) {
            ctx.data.stopped = 0;
            ctx.data.far = 0;
          },
          update(ctx, dt) {
            const c = ctx.data.courier;
            const p = ctx.player;
            ctx.waypoint(c.x, c.z);
            const d = Math.hypot(c.x - p.x, c.z - p.z);
            if (d > 420) {
              ctx.data.far += dt;
              if (ctx.data.far > 25) return 'fail:The courier escaped';
            } else ctx.data.far = 0;
            const halted = Math.abs(c.speed) < 1.5 && d < 14;
            ctx.data.stopped = halted ? ctx.data.stopped + dt : 0;
            if (c.wrecked || c.hp < 35 || ctx.data.stopped > 2.5) {
              ctx.bailOut(c);
              ctx.say('sol', 'End of the line.');
              return 'next';
            }
            return null;
          },
        },
        {
          objective: 'Grab the bag from the car',
          enter(ctx) {
            const c = ctx.data.courier;
            ctx.goTo(c.x, c.z, { radius: 4, label: 'The bag' });
          },
          update(ctx) {
            if (ctx.reached()) {
              ctx.say('ruiz', 'Nice work. Keep the bag. We never spoke.');
              return 'next';
            }
            return null;
          },
        },
        { objective: '', enter() {}, update: (ctx) => (ctx.talking() ? null : 'next') },
      ],
    },
    {
      id: 'docks', title: 'Saltmarsh Standoff', giver: 'teo', start: L.garage, reward: { money: 2500, rep: 50 },
      brief: 'Clear the Tide Runners out of the container yard, then lose the police the gunfire brings.',
      stages: [
        {
          objective: 'Listen to Teo',
          enter(ctx) {
            ctx.actor('teo', L.garage.x + 2, L.garage.z - 1.5);
            ctx.say('teo', "The Runners moved their product into the container yard. That's Kane's answer to you.");
            ctx.say('teo', 'Clear them out tonight, before they clear me out.');
            ctx.say('sol', 'Keep the doors open. I might come back fast.');
            ctx.giveWeapon('pistol', 48);
          },
          update: (ctx) => (ctx.talking() ? null : 'next'),
        },
        {
          objective: 'Go to the container yard',
          enter(ctx) {
            const y = L.docksYard;
            ctx.goTo(y.x, y.z + 20, { radius: 10, label: 'Container yard' });
          },
          update(ctx) {
            if (ctx.reached()) {
              const y = L.docksYard;
              ctx.data.squad = ctx.squad([
                { x: y.x - 12, z: y.z - 10 }, { x: y.x + 10, z: y.z - 12 }, { x: y.x - 6, z: y.z + 2 }, { x: y.x + 14, z: y.z + 4 }, { x: y.x, z: y.z - 20 }, { x: y.x + 4, z: y.z - 4, weapon: 'smg' },
              ]);
              ctx.say('rico', "It's the Vega girl! Light her up!");
              return 'next';
            }
            return null;
          },
        },
        {
          objective: 'Clear the Tide Runners out of the yard',
          enter() {},
          update(ctx) {
            if (ctx.allDead(ctx.data.squad)) {
              ctx.setWanted(3);
              ctx.say('radio', 'Sol, every cop on the quay just heard that. Get out of there!');
              return 'next';
            }
            return null;
          },
        },
        {
          objective: 'Lose the police',
          enter(ctx) {
            ctx.hint('Leave the search circle on the minimap and stay out of sight');
          },
          update(ctx) {
            return ctx.wantedStars() === 0 ? 'next' : null;
          },
        },
        {
          objective: "Get back to Teo's garage",
          enter(ctx) {
            ctx.goTo(L.garage.x, L.garage.z, { radius: 8, label: "Teo's garage" });
          },
          update(ctx) {
            if (ctx.reached()) {
              ctx.say('teo', 'You brought the whole police department to my door.');
              ctx.say('sol', "They left, didn't they?");
              return 'next';
            }
            return null;
          },
        },
        { objective: '', enter() {}, update: (ctx) => (ctx.talking() ? null : 'next') },
      ],
    },
    {
      id: 'bank', title: 'The Glasswater Job', giver: 'ruiz', start: L.plaza, reward: { money: 5000, rep: 80 },
      brief: "Take Kane's money from his box at Glasswater Mutual and get it to Teo's before the city catches you.",
      stages: [
        {
          objective: 'Listen to Detective Ruiz',
          enter(ctx) {
            ctx.actor('ruiz', L.plaza.x + 2, L.plaza.z + 9);
            ctx.say('ruiz', 'Okafor keeps his real money in a box at Glasswater Mutual, across the plaza. Walk in, walk out with it, and he is finished.');
            ctx.say('sol', "And the alarm?");
            ctx.say('ruiz', 'Response is four minutes. I can make it five. After that, you are on your own.');
          },
          update: (ctx) => (ctx.talking() ? null : 'next'),
        },
        {
          objective: 'Walk into Glasswater Mutual',
          enter(ctx) {
            ctx.goTo(L.bankDoor.x, L.bankDoor.z, { radius: 3.5, needFoot: true, label: 'Glasswater Mutual' });
          },
          update(ctx) {
            if (ctx.reached()) {
              ctx.say('sol', 'Everybody stay calm. This is a withdrawal.');
              const b = L.bank;
              ctx.data.guards = ctx.squad([{ x: b.x - 10, z: b.z - 8 }, { x: b.x - 12, z: b.z + 8 }, { x: b.x - 4, z: b.z + 14 }, { x: b.x - 6, z: b.z - 14 }]);
              ctx.setWanted(2);
              ctx.timer(40);
              return 'next';
            }
            return null;
          },
        },
        {
          objective: "Hold the entrance while the box opens",
          enter() {},
          update(ctx) {
            const d = Math.hypot(ctx.player.x - L.bankDoor.x, ctx.player.z - L.bankDoor.z);
            if (d > 30) return 'fail:You left the bank';
            if (ctx.timeLeft() <= 0) {
              ctx.clearTimer();
              ctx.setWanted(4);
              ctx.say('radio', 'The whole city is coming, Sol. Get the money to my place, I will close the doors behind you.');
              return 'next';
            }
            return null;
          },
        },
        {
          objective: "Get the money to Teo's garage and lose the heat",
          enter(ctx) {
            ctx.goTo(L.garageParking.x, L.garageParking.z, { radius: 7, label: "Teo's garage" });
            ctx.hint('A respray at a paint shop shakes up to three stars');
          },
          update(ctx) {
            if (ctx.reached()) {
              ctx.setWanted(0);
              ctx.say('teo', 'Doors are shut. Nobody saw a thing.');
              ctx.say('sol', 'Kane did.');
              return 'next';
            }
            return null;
          },
        },
        { objective: '', enter() {}, update: (ctx) => (ctx.talking() ? null : 'next') },
      ],
    },
    {
      id: 'tide', title: 'High Tide', giver: 'teo', start: L.garage, reward: { money: 10000, rep: 150 }, finale: true,
      brief: 'Kane has Dani at Halcyon Pier. End it.',
      stages: [
        {
          objective: 'Listen to Teo',
          enter(ctx) {
            ctx.actor('teo', L.garage.x + 2, L.garage.z - 1.5);
            ctx.say('teo', 'Kane called. He wants you at the end of Halcyon Pier at sundown, alone. He has Dani.');
            ctx.say('sol', "Then he'll get me.");
            ctx.giveWeapon('shotgun', 24);
            ctx.giveWeapon('smg', 90);
          },
          update: (ctx) => (ctx.talking() ? null : 'next'),
        },
        {
          objective: 'Go to the end of Halcyon Pier',
          enter(ctx) {
            ctx.goTo(L.pierEnd.x, L.pierEnd.z - 16, { radius: 5, needFoot: true, label: 'Halcyon Pier' });
            ctx.data.kane = ctx.gangActor(L.pierEnd.x, L.pierEnd.z - 6, { name: 'Kane Okafor', look: 'kane', hostile: false, hp: 260, weapon: 'shotgun' });
            ctx.actor('dani', L.pierEnd.x + 3.5, L.pierEnd.z - 3);
          },
          update(ctx) {
            if (ctx.reached()) {
              ctx.say('kane', 'The driver who cost me a courier, a bank box and six good men.');
              ctx.say('sol', "Where's Dani?");
              ctx.say('kane', "In my boat. He's leaving with me. You're staying.");
              return 'next';
            }
            return null;
          },
        },
        {
          objective: 'Take down Kane Okafor',
          enter(ctx) {
            ctx.removeActors();
            const x = L.pierEnd.x;
            const z = L.pierEnd.z;
            ctx.data.squad = ctx.squad([{ x: x - 4, z: z - 30 }, { x: x + 4, z: z - 42 }, { x: x - 3, z: z - 56 }, { x: x + 3, z: z - 12, weapon: 'smg' }, { x: x - 4, z: z - 70 }]);
            ctx.data.kane.hostile = true;
            ctx.data.squad.push(ctx.data.kane);
          },
          update(ctx) {
            if (ctx.data.kane.dead) {
              ctx.setWanted(5);
              ctx.say('dani', 'Sol! The cops are everywhere!');
              ctx.say('sol', "Teo's boat is at Pelican Key. Run.");
              return 'next';
            }
            return null;
          },
        },
        {
          objective: "Get Dani to Teo's boat at the Pelican Key lighthouse",
          enter(ctx) {
            const lh = L.lighthouse;
            ctx.goTo(lh.x + 8, lh.z + 6, { radius: 9, label: 'Pelican Key' });
            ctx.hint('Take Ocean Drive west over the causeway');
          },
          update(ctx) {
            if (ctx.reached()) {
              ctx.setWanted(0);
              ctx.say('teo', 'Get in, both of you. The bay is big and the night is bigger.');
              ctx.say('sol', 'Halcyon Bay. I missed you too.');
              return 'next';
            }
            return null;
          },
        },
        { objective: '', enter() {}, update: (ctx) => (ctx.talking() ? null : 'next') },
      ],
    },
  ];
}
