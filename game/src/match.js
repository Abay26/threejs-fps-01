// Blackwater Dock — the match: buy phase, rounds, beacon capture and scoring.
// A round is won by eliminating the other team, or by holding more beacon
// points when the timer runs out. First team to 5 round wins takes the match.

import { ROUND_SECONDS, BUY_SECONDS, ROUNDS_TO_WIN, BEACON_RADIUS, CAPTURE_SECONDS, aliveCount, pushFeed, WEAPONS } from './state.js';

export function resetActorForRound(game, actor, spawn) {
  actor.alive = true;
  actor.hp = 100;
  actor.armor = actor.boughtArmor ? 50 : 0;
  actor.pos.set(spawn.x, 0, spawn.z);
  actor.yaw = spawn.yaw;
  actor.pitch = 0;
  actor.vel.set(0, 0, 0);
  actor.crouch = false;
  actor.reloading = false;
  actor.reloadEnd = 0;
  actor.cooldown = 0;
  actor.bloom = 0;
  actor.mode = 'patrol';
  actor.enemy = null;
  actor.waypoint = null;
  actor.investigate = null;
  actor.hearPos = null;
  actor.thinkAt = game.time + Math.random() * 0.2;
  const w = WEAPONS[actor.weapon];
  actor.mag = w.mag;
  actor.reserve = w.reserve;
}

export function startBuyPhase(game, dock) {
  game.phase = 'buy';
  game.phaseTime = 0;
  game.buyTimer = BUY_SECONDS;
  game.roundPoints = { blue: 0, orange: 0 };
  for (const b of game.beacons) {
    b.owner = null; b.progress = 0; b.holder = null; b.tickAcc = 0;
  }
  game.actors.forEach((a, i) => {
    const spawns = a.team === 'blue' ? dock.spawnBlue : dock.spawnOrange;
    resetActorForRound(game, a, spawns[i % spawns.length]);
  });
}

export function startRound(game) {
  game.phase = 'round';
  game.phaseTime = 0;
  game.timer = ROUND_SECONDS;
  pushFeed(game, `Round ${game.round} — hold the beacons`, 'info');
}

export function endRound(game, winner, reason) {
  if (game.phase !== 'round') return;
  game.phase = 'roundEnd';
  game.phaseTime = 0;
  game.roundWinner = winner;
  game.roundReason = reason;
  game.roundWins[winner] += 1;
  const won = winner === 'blue';
  game.credits += won ? 400 : 200;
  pushFeed(game, won ? `Round ${game.round} won — ${reason}` : `Round ${game.round} lost — ${reason}`, won ? 'win' : 'loss');
}

function checkRoundEnd(game) {
  const blueAlive = aliveCount(game, 'blue');
  const orangeAlive = aliveCount(game, 'orange');
  if (blueAlive === 0 && orangeAlive > 0) return endRound(game, 'orange', 'Harbor eliminated');
  if (orangeAlive === 0 && blueAlive > 0) return endRound(game, 'blue', 'Tide eliminated');
  if (game.timer <= 0) {
    const bp = game.roundPoints.blue, op = game.roundPoints.orange;
    if (bp === op) return endRound(game, blueAlive >= orangeAlive ? 'blue' : 'orange', 'time — more survivors');
    return endRound(game, bp > op ? 'blue' : 'orange', `time — beacons ${Math.max(bp, op)}:${Math.min(bp, op)}`);
  }
}

function stepBeacons(game, dt) {
  for (const b of game.beacons) {
    let blueIn = 0, orangeIn = 0;
    for (const a of game.actors) {
      if (!a.alive) continue;
      if (Math.hypot(a.pos.x - b.x, a.pos.z - b.z) < BEACON_RADIUS) {
        if (a.team === 'blue') blueIn++; else orangeIn++;
      }
    }
    const contested = blueIn > 0 && orangeIn > 0;
    const holder = blueIn > 0 && orangeIn === 0 ? 'blue' : orangeIn > 0 && blueIn === 0 ? 'orange' : null;
    if (holder && !contested) {
      if (b.holder !== holder) { b.holder = holder; b.progress = b.owner === holder ? 100 : 0; }
      if (b.owner !== holder) {
        b.progress += (dt / CAPTURE_SECONDS) * 100;
        if (b.progress >= 100) {
          b.progress = 100;
          b.owner = holder;
          pushFeed(game, `Beacon ${b.id} taken by ${holder === 'blue' ? 'Harbor' : 'Tide'}`, holder === 'blue' ? 'win' : 'loss');
          if (holder === 'blue') game.credits += 150;
        }
      } else {
        // holding a beacon you own scores a point every 2 seconds
        b.tickAcc += dt;
        if (b.tickAcc >= 2) {
          b.tickAcc -= 2;
          game.roundPoints[holder] += 1;
        }
      }
    } else {
      b.holder = contested ? b.holder : null;
      if (!contested) b.progress = b.owner ? 100 : 0;
    }
  }
}

export function stepMatch(game, dt, onMatchEnd) {
  game.phaseTime += dt;
  if (game.phase === 'buy') {
    game.buyTimer -= dt;
    if (game.buyTimer <= 0) startRound(game);
    return;
  }
  if (game.phase === 'round') {
    game.timer -= dt;
    stepBeacons(game, dt);
    checkRoundEnd(game);
    return;
  }
  if (game.phase === 'roundEnd') {
    if (game.phaseTime > 4) {
      if (game.roundWins.blue >= ROUNDS_TO_WIN || game.roundWins.orange >= ROUNDS_TO_WIN) {
        game.phase = 'matchEnd';
        game.phaseTime = 0;
        game.winner = game.roundWins.blue >= ROUNDS_TO_WIN ? 'blue' : 'orange';
        if (onMatchEnd) onMatchEnd(game.winner);
      } else {
        game.round += 1;
        startBuyPhase(game, game.dock);
      }
    }
    return;
  }
  if (game.phase === 'matchEnd') return;
}

export function restartMatch(game, dock) {
  game.round = 1;
  game.roundWins = { blue: 0, orange: 0 };
  game.credits = 800;
  game.kills = 0;
  game.deaths = 0;
  game.shotsFired = 0;
  game.shotsHit = 0;
  game.winner = null;
  for (const a of game.actors) {
    a.weapons = ['pistol'];
    a.weapon = 'pistol';
    a.grenades = 0;
    a.boughtArmor = false;
  }
  startBuyPhase(game, dock);
}
