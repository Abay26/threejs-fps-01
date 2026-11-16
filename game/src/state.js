// Blackwater Dock — shared state, constants and the seeded RNG.
// One state object owns the whole match; every module reads and writes it,
// so a saved or staged game is just this object plus the three.js scene.

export const TICK = 1 / 60;
export const MAP = { w: 56, d: 40, halfW: 28, halfD: 20 };
export const ROUND_SECONDS = 100;
export const BUY_SECONDS = 15;
export const ROUNDS_TO_WIN = 5;
export const BEACON_RADIUS = 3.2;
export const CAPTURE_SECONDS = 6;
export const PLAYER_RADIUS = 0.38;
export const PLAYER_HEIGHT = 1.7;
export const EYE_HEIGHT = 1.55;
export const CROUCH_EYE = 1.05;

// Seeded RNG (mulberry32) so a ?shot= staging and a replayed round agree.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const TEAMS = {
  blue: { name: 'Harbor', color: 0x3f8cff, css: '#4d9fff', dark: 0x1d4e89 },
  orange: { name: 'Tide', color: 0xff8c2e, css: '#ff9a3d', dark: 0x8a4a12 },
};

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', price: 0, damage: 26, headMul: 2.0,
    mag: 12, reserve: 48, interval: 0.28, auto: false, spread: 0.016,
    moveSpread: 0.030, range: 34, falloff: 0.55, pellets: 1, reload: 1.1, kick: 0.011,
  },
  rifle: {
    id: 'rifle', name: 'KR-7 Harbor Rifle', price: 900, damage: 34, headMul: 2.0,
    mag: 30, reserve: 90, interval: 0.115, auto: true, spread: 0.010,
    moveSpread: 0.026, range: 55, falloff: 0.7, pellets: 1, reload: 1.9, kick: 0.016,
  },
  smg: {
    id: 'smg', name: 'Tide SMG', price: 600, damage: 22, headMul: 2.0,
    mag: 32, reserve: 96, interval: 0.08, auto: true, spread: 0.017,
    moveSpread: 0.034, range: 26, falloff: 0.5, pellets: 1, reload: 1.6, kick: 0.011,
  },
  shotgun: {
    id: 'shotgun', name: 'Breacher 12', price: 700, damage: 15, headMul: 1.6,
    mag: 6, reserve: 24, interval: 0.78, auto: false, spread: 0.055,
    moveSpread: 0.075, range: 16, falloff: 0.35, pellets: 8, reload: 2.4, kick: 0.055,
  },
};
export const WEAPON_ORDER = ['pistol', 'rifle', 'smg', 'shotgun'];
export const GRENADE_PRICE = 200;
export const ARMOR_PRICE = 400;
export const ARMOR_VALUE = 50;

export function createGame(seed) {
  const rng = mulberry32(seed);
  return {
    seed,
    rng,
    time: 0,
    phase: 'title', // title | buy | round | roundEnd | matchEnd
    phaseTime: 0,
    round: 1,
    roundWins: { blue: 0, orange: 0 },
    roundPoints: { blue: 0, orange: 0 },
    timer: ROUND_SECONDS,
    buyTimer: BUY_SECONDS,
    credits: 800,
    kills: 0,
    deaths: 0,
    shotsFired: 0,
    shotsHit: 0,
    beacons: [
      { id: 'A', x: -19, z: 0, owner: null, progress: 0, holder: null, tickAcc: 0 },
      { id: 'B', x: 0, z: 0, owner: null, progress: 0, holder: null, tickAcc: 0 },
      { id: 'C', x: 19, z: 0, owner: null, progress: 0, holder: null, tickAcc: 0 },
    ],
    actors: [],
    player: null,
    tracers: [],
    grenades: [],
    flashes: [],
    feed: [],
    winner: null,
    roundWinner: null,
    roundReason: '',
    muted: false,
    staged: false,
    errors: [],
  };
}

export function aliveCount(game, team) {
  let n = 0;
  for (const a of game.actors) if (a.team === team && a.alive) n++;
  return n;
}

export function pushFeed(game, text, kind) {
  game.feed.unshift({ text, kind: kind || 'info', t: game.time });
  if (game.feed.length > 5) game.feed.length = 5;
}
