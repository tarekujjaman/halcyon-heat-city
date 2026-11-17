// HALCYON HEAT: the tunables of the whole game in one place. Distances are metres, speeds m/s,
// times seconds, angles radians. Every system reads its numbers from here so a feel change is one edit.

export const GAME_TITLE = 'HALCYON HEAT';
export const CITY_NAME = 'Halcyon Bay';
export const SAVE_PREFIX = 'halcyon-heat';

/** The city grid: blocks of BLOCK metres separated by roads of ROAD metres (carriageway, kerb to kerb). */
export const CITY = {
  blocksX: 10,
  blocksZ: 9,
  block: 56,
  road: 14,
  sidewalk: 3.5,
  laneWidth: 3.5,
  kerb: 0.14,
  beachWidth: 64,
  causewayLength: 170,
  seaDepth: 2.2,
};
CITY.pitch = CITY.block + CITY.road;
CITY.width = CITY.blocksX * CITY.pitch + CITY.road;
CITY.height = CITY.blocksZ * CITY.pitch + CITY.road;
CITY.x0 = -CITY.width / 2;
CITY.z0 = -CITY.height / 2;

/** District ids, names and their map colours. */
export const DISTRICTS = {
  coral: { id: 'coral', name: 'Coral Strand', color: '#f6b36b', mapColor: '#f3c27e' },
  glasswater: { id: 'glasswater', name: 'Glasswater Downtown', color: '#7fd3ff', mapColor: '#8ec9e8' },
  neon: { id: 'neon', name: 'Neon Row', color: '#ff6ad5', mapColor: '#e98ad0' },
  palmetto: { id: 'palmetto', name: 'Palmetto Heights', color: '#9be37a', mapColor: '#a9d98a' },
  saltmarsh: { id: 'saltmarsh', name: 'Saltmarsh Docks', color: '#c9b48a', mapColor: '#c7b793' },
};

export const PLAYER = {
  radius: 0.42,
  height: 1.78,
  walkSpeed: 3.4,
  runSpeed: 7.2,
  accel: 22,
  jumpSpeed: 5.2,
  gravity: 16,
  maxHealth: 100,
  maxArmor: 100,
  punchRange: 1.6,
  punchDamage: 18,
};

export const CAMERA = {
  sensitivity: 0.0025,
  smoothing: 18,
  minPitch: -0.5,
  maxPitch: 1.05,
  footDistance: 4.6,
  footHeight: 1.5,
  carDistance: 7.5,
  carDistanceFast: 10.5,
  carHeight: 2.6,
  fovFoot: 62,
  fovCar: 66,
  fovCarFast: 78,
  autoReturnDelay: 1.5,
  edgeTurnZone: 24,
  edgeTurnRate: 1.8,
  keyTurnRate: 2.2,
};

export const DRIVING = {
  throttleRamp: 0.3,
  steerEase: 7,
  brakeDecel: 13,
  handbrakeDecel: 9,
  reverseMax: 9,
  gripNormal: 9,
  gripHandbrake: 1.6,
  rolling: 0.45,
  dragK: 0.0022,
  smokeSlip: 3.5,
  curbSpeedLoss: 0.9,
  curbStep: 0.1,
  curbCooldown: 0.35,
};

export const DAMAGE = {
  impactCooldown: 0.5,
  scrapeSpeed: 4.2,
  crashScale: 1.2,
  crashMax: 34,
  carToCar: 0.5,
  pairCooldown: 1.2,
  driverHurtSpeed: 13,
  driverHurt: 4,
  runOverSpeed: 2.5,
  smokeAt: 38,
  fireAt: 16,
  fuseSeconds: 5,
  explosionRadius: 9,
  explosionDamage: 90,
};

export const WANTED = {
  maxStars: 5,
  starHeat: [0, 12, 35, 70, 120, 190],
  heatCooldown: 3,
  evadeSeconds: [0, 10, 16, 24, 34, 45],
  searchRadius: [0, 90, 120, 160, 210, 260],
  sightRange: 48,
  arrestSpeed: 1.4,
  arrestSeconds: 2.2,
  arrestFee: 500,
  hospitalFee: 350,
  crimes: {
    steal: 12,
    hitPed: 10,
    killPed: 22,
    shoot: 12,
    shootUnseen: 3,
    killGang: 8,
    hitPolice: 22,
    killPolice: 45,
    shootPolice: 14,
    ramPolice: 10,
    heist: 150,
  },
};

export const POLICE = {
  cruisersByStar: [0, 1, 2, 3, 4, 5],
  officersByStar: [0, 1, 2, 3, 4, 5],
  ramSpeed: 16,
  pistolDamage: 6,
  fireInterval: 1.1,
  accuracy: 0.38,
  officerRange: 32,
  roadblockStars: 3,
  heliStars: 4,
  heliHeight: 32,
  heliDamage: 2,
  heliInterval: 0.45,
};

export const WEAPONS = {
  fists: { name: 'Fists', slot: 1, damage: 18, range: 1.7, rate: 0.45, ammo: Infinity, clip: Infinity, spread: 0, tracer: false, auto: false, pellets: 1, unlockRep: 0 },
  pistol: { name: 'Pistol', slot: 2, damage: 24, range: 70, rate: 0.28, ammo: 120, clip: 12, spread: 0.012, tracer: true, auto: false, pellets: 1, unlockRep: 0, price: 450 },
  smg: { name: 'SMG', slot: 3, damage: 13, range: 55, rate: 0.085, ammo: 300, clip: 30, spread: 0.035, tracer: true, auto: true, pellets: 1, unlockRep: 2, price: 1200 },
  shotgun: { name: 'Shotgun', slot: 4, damage: 11, range: 24, rate: 0.75, ammo: 60, clip: 6, spread: 0.08, tracer: true, auto: false, pellets: 7, unlockRep: 3, price: 1600 },
};

export const ECONOMY = {
  startMoney: 250,
  repLevels: [0, 40, 110, 220, 380, 600],
  repNames: ['Nobody', 'Driver', 'Runner', 'Wheelman', 'Boss', 'Legend'],
  safehouses: [
    { id: 'strand', name: 'Strand Apartment', district: 'coral', price: 0, owned: true },
    { id: 'neon', name: 'Neon Row Loft', district: 'neon', price: 6000 },
    { id: 'palmetto', name: 'Palmetto Villa', district: 'palmetto', price: 15000 },
  ],
  repaintPrice: 220,
  taxiBase: 25,
  taxiPerMetre: 0.9,
  racePrize: [1500, 2500, 4000],
  shardPrize: 150,
  shardCount: 20,
  shardsBonus: 5000,
};

export const TIME = {
  startHour: 17.5,
  secondsPerHour: 240,
  nightStart: 18.3,
  nightEnd: 6.4,
};

export const TRAFFIC = {
  cars: 34,
  spawnRadius: 190,
  despawnRadius: 240,
  cruiseSpeed: 12.5,
  boulevardSpeed: 16,
  turnSpeed: 6.5,
  followGap: 7,
  lightCycle: 14,
  yellow: 2.2,
};

export const PEDS = {
  count: 44,
  spawnRadius: 120,
  despawnRadius: 160,
  walkSpeed: 1.35,
  panicSpeed: 5.6,
  panicRadius: 40,
  health: 60,
};

export const PHYSICS = {
  maxFrame: 0.05,
  subStep: 1 / 60,
};

export const RADIO_STATIONS = ['Halcyon FM', 'Coral 88', 'Dock Talk'];
