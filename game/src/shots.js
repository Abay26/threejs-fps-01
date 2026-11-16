// Blackwater Dock — screenshot staging.
// ?shot=start|play|buy|end&seed=1 puts the game into a fixed, deterministic
// scene so the four screenshots are real renders of real game states:
// the title screen, a live firefight, the buy menu, and a round result.
// Staged games never ask for pointer lock and never need a click.

import { WEAPONS } from './state.js';

function placeActors(game, dock, spots) {
  // spots: [[actorIndex, x, z, yaw], ...]
  for (const [i, x, z, yaw] of spots) {
    const a = game.actors[i];
    if (!a) continue;
    a.pos.set(x, 0, z);
    a.yaw = yaw;
    a.pitch = 0;
    a.alive = true;
    a.hp = 100;
  }
}

export function applyShot(game, dock, search) {
  const params = new URLSearchParams(search);
  const shot = params.get('shot');
  if (!shot) return null;
  const seed = Number(params.get('seed') || 1);
  game.staged = true;
  game.seed = seed;

  if (shot === 'start') {
    // Title over the dock: player at the west gate, bots spread down mid.
    game.phase = 'title';
    game.round = 1;
    placeActors(game, dock, [
      [0, -24, 0, -Math.PI / 2],
      [1, -14, -6, -Math.PI / 2], [2, -10, 5, -Math.PI / 2], [3, -18, 8, -Math.PI / 2],
      [4, 2, -4, Math.PI / 2], [5, 8, 3, Math.PI / 2], [6, 14, -7, Math.PI / 2], [7, 6, 9, Math.PI / 2],
    ]);
    return { steps: 40 };
  }

  if (shot === 'play') {
    // Mid-round firefight at beacon B: an enemy in the sights, an ally on
    // the left, the HUD live and the timer running.
    game.phase = 'round';
    game.timer = 62;
    game.round = 2;
    game.roundPoints = { blue: 2, orange: 1 };
    game.beacons[1].owner = 'blue';
    game.beacons[1].progress = 100;
    game.player.weapon = 'rifle';
    game.player.weapons = ['pistol', 'rifle'];
    game.player.mag = 24;
    game.player.reserve = 90;
    game.player.grenades = 1;
    placeActors(game, dock, [
      [0, -8, 0, -Math.PI / 2],
      [1, -4, -5, -Math.PI / 2], [2, -12, 6, -Math.PI / 2], [3, -2, 8, -Math.PI / 2],
      [4, 4, 0.5, Math.PI / 2], [5, 10, -6, Math.PI / 2], [6, 12, 7, Math.PI / 2], [7, 0, -9, Math.PI / 2],
    ]);
    return { steps: 90, tracer: true };
  }

  if (shot === 'buy') {
    // Between rounds: the buy menu open, a healthy wallet, round 2 coming.
    game.phase = 'buy';
    game.buyTimer = 12;
    game.round = 2;
    game.roundWins = { blue: 1, orange: 0 };
    game.credits = 1450;
    game.player.weapons = ['pistol', 'rifle'];
    game.player.weapon = 'rifle';
    game.player.mag = WEAPONS.rifle.mag;
    game.player.reserve = WEAPONS.rifle.reserve;
    game.player.grenades = 1;
    placeActors(game, dock, [
      [0, -24, 0, -Math.PI / 2],
      [1, -20, -5, -Math.PI / 2], [2, -20, 5, -Math.PI / 2], [3, -24, 8, -Math.PI / 2],
      [4, 20, -4, Math.PI / 2], [5, 22, 4, Math.PI / 2], [6, 16, 8, Math.PI / 2], [7, 18, -8, Math.PI / 2],
    ]);
    return { steps: 30 };
  }

  if (shot === 'end') {
    // Round 3 just won: the result overlay over the dock, score 2–1.
    game.phase = 'roundEnd';
    game.phaseTime = 1;
    game.round = 3;
    game.roundWins = { blue: 2, orange: 1 };
    game.roundWinner = 'blue';
    game.roundReason = 'Tide eliminated';
    game.kills = 5;
    game.beacons[0].owner = 'blue';
    game.beacons[0].progress = 100;
    game.beacons[1].owner = 'blue';
    game.beacons[1].progress = 100;
    placeActors(game, dock, [
      [0, -6, 2, -Math.PI / 2],
      [1, -2, -4, -Math.PI / 2], [2, -10, -6, -Math.PI / 2], [3, -4, 7, -Math.PI / 2],
      [4, 8, 0, Math.PI / 2], [5, 12, -5, Math.PI / 2], [6, 14, 6, Math.PI / 2], [7, 4, -8, Math.PI / 2],
    ]);
    game.actors[4].alive = false;
    game.actors[5].alive = false;
    game.actors[6].alive = false;
    game.actors[7].alive = false;
    return { steps: 30 };
  }

  return null;
}
