// Blackwater Dock — bot brains.
// Every 0.15 s a bot thinks: find a visible enemy, or pick a beacon to take.
// Between thinks it steers, strafes in a duel, bursts fire with a reaction
// delay and an aim error set by its skill, investigates gunfire it heard,
// and sidesteps free when a container wedges it.

import * as THREE from 'three';
import { hasLineOfSight, moveActor } from './actors.js';
import { fireShot } from './guns.js';
import { BEACON_RADIUS } from './state.js';

const EYE = new THREE.Vector3();
const TARGET_EYE = new THREE.Vector3();
const THINK_EVERY = 0.15;
const HEAR_RADIUS = 22;
const SIGHT_RANGE = 46;

export function notifyShot(game, shooter) {
  for (const b of game.actors) {
    if (b.isPlayer || !b.alive || b === shooter) continue;
    const d = Math.hypot(b.pos.x - shooter.pos.x, b.pos.z - shooter.pos.z);
    if (d < HEAR_RADIUS && !b.enemy) {
      b.hearPos = { x: shooter.pos.x, z: shooter.pos.z };
      b.hearAt = game.time;
    }
  }
}

function nearestVisibleEnemy(game, bot, blockers) {
  let best = null, bestD = Infinity;
  EYE.set(bot.pos.x, bot.pos.y + 1.5, bot.pos.z);
  const fx = -Math.sin(bot.yaw), fz = -Math.cos(bot.yaw);
  for (const e of game.actors) {
    if (e.team === bot.team || !e.alive) continue;
    const dx = e.pos.x - bot.pos.x, dz = e.pos.z - bot.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > SIGHT_RANGE || d >= bestD) continue;
    // field of view: in front, or very close behind
    if (d > 3 && (dx * fx + dz * fz) / d < 0.25) continue;
    TARGET_EYE.set(e.pos.x, e.pos.y + 1.2, e.pos.z);
    if (!hasLineOfSight(EYE, TARGET_EYE, blockers)) continue;
    best = e; bestD = d;
  }
  return best ? { enemy: best, dist: bestD } : null;
}

function nearestBeacon(game, bot, wantEnemy) {
  let best = null, bestD = Infinity;
  for (const b of game.beacons) {
    const mine = b.owner === bot.team;
    if (wantEnemy && mine) continue;
    if (!wantEnemy && !mine) continue;
    const d = Math.hypot(b.x - bot.pos.x, b.z - bot.pos.z);
    if (d < bestD) { best = b; bestD = d; }
  }
  return best;
}

function pickWaypoint(bot, waypoints, tx, tz) {
  let best = null, bestScore = Infinity;
  const curD = Math.hypot(tx - bot.pos.x, tz - bot.pos.z);
  for (const w of waypoints) {
    if (bot.waypoint && w === bot.waypoint) continue;
    const dBot = Math.hypot(w.x - bot.pos.x, w.z - bot.pos.z);
    const dTarget = Math.hypot(tx - w.x, tz - w.z);
    if (dTarget > curD + 1) continue; // must make progress toward the goal
    const score = dTarget * 2 + dBot;
    if (score < bestScore) { best = w; bestScore = score; }
  }
  return best;
}

function aimAt(bot, tx, ty, tz) {
  const dx = tx - bot.pos.x, dz = tz - bot.pos.z;
  const wantYaw = Math.atan2(-dx, -dz);
  let dy = wantYaw - bot.yaw;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  const turn = 7.5; // rad/s the bot can turn
  bot.yaw += Math.max(-turn * (1 / 60), Math.min(turn * (1 / 60), dy));
  const dist = Math.hypot(dx, dz);
  const wantPitch = Math.atan2(ty - (bot.pos.y + 1.5), Math.max(1, dist));
  bot.pitch += (wantPitch - bot.pitch) * 0.35;
  return Math.abs(dy) < 0.08;
}

export function stepBot(game, bot, dt, ctx) {
  if (!bot.alive) return;
  const { colliders, blockers, waypoints, arsenal, hitMeshes, onHit } = ctx;

  // --- think ---
  if (game.time >= bot.thinkAt) {
    bot.thinkAt = game.time + THINK_EVERY;
    const seen = nearestVisibleEnemy(game, bot, blockers);
    if (seen) {
      if (bot.enemy !== seen.enemy) {
        bot.enemy = seen.enemy;
        bot.reactAt = game.time + 0.35 + (1 - bot.skill) * 0.55 + game.rng() * 0.2;
        bot.burstLeft = 0;
      }
      bot.mode = 'combat';
    } else if (bot.enemy) {
      bot.enemy = null;
      bot.mode = 'patrol';
    }
    if (bot.mode !== 'combat') {
      // objective: nearest beacon we do not own; if we own them all, hold one
      let target = nearestBeacon(game, bot, true);
      if (!target) target = nearestBeacon(game, bot, false);
      bot.targetBeacon = target;
      // investigate a heard shot when there is nothing better to do
      if (bot.hearPos && game.time - bot.hearAt < 6 && (!target || Math.hypot(target.x - bot.pos.x, target.z - bot.pos.z) > 12)) {
        bot.investigate = bot.hearPos;
      } else {
        bot.investigate = null;
      }
    }
    // stuck check: barely moved while trying to walk
    if (bot.moving && game.time - bot.moveMarkAt > 1.2) {
      const moved = Math.hypot(bot.pos.x - bot.moveMark.x, bot.pos.z - bot.moveMark.z);
      if (moved < 0.4) {
        bot.stuckUntil = game.time + 0.9;
        bot.stuckDir = game.rng() > 0.5 ? 1 : -1;
        bot.waypoint = null;
      }
      bot.moveMark = { x: bot.pos.x, z: bot.pos.z };
      bot.moveMarkAt = game.time;
    }
  }

  // --- act ---
  let wishX = 0, wishZ = 0;
  bot.moving = false;
  if (bot.mode === 'combat' && bot.enemy && bot.enemy.alive) {
    const e = bot.enemy;
    const dx = e.pos.x - bot.pos.x, dz = e.pos.z - bot.pos.z;
    const dist = Math.hypot(dx, dz);
    const aimed = aimAt(bot, e.pos.x, e.pos.y + 1.25, e.pos.z);
    // strafe sideways, flip direction every couple of seconds; close in if far
    if (game.time >= bot.strafeAt) {
      bot.strafeAt = game.time + 1.2 + game.rng() * 1.4;
      bot.strafeDir = game.rng() > 0.5 ? 1 : -1;
    }
    const fx = -Math.sin(bot.yaw), fz = -Math.cos(bot.yaw);
    const px = -fz * bot.strafeDir, pz = fx * bot.strafeDir;
    let mx = px, mz = pz;
    if (dist > 16) { mx += fx * 0.8; mz += fz * 0.8; }
    else if (dist < 5) { mx -= fx * 0.7; mz -= fz * 0.7; }
    const ml = Math.hypot(mx, mz) || 1;
    wishX = mx / ml; wishZ = mz / ml;
    bot.moving = true;
    // burst fire once reacted and roughly on target
    if (aimed && game.time >= bot.reactAt && bot.cooldown <= 0 && !bot.reloading) {
      if (bot.burstLeft <= 0) {
        bot.burstLeft = 3 + Math.floor(game.rng() * 4);
        bot.burstPauseUntil = 0;
      }
      if (game.time >= (bot.burstPauseUntil || 0)) {
        // aim error grows with distance and shrinks with skill
        const err = (1 - bot.skill) * 0.05 + dist * 0.0009;
        const saveYaw = bot.yaw, savePitch = bot.pitch;
        bot.yaw += (game.rng() - 0.5) * 2 * err;
        bot.pitch += (game.rng() - 0.5) * 2 * err;
        fireShot(game, arsenal, bot, null, hitMeshes, onHit);
        bot.yaw = saveYaw; bot.pitch = savePitch;
        bot.burstLeft -= 1;
        if (bot.burstLeft <= 0) bot.burstPauseUntil = game.time + 0.55 + game.rng() * 0.5;
      }
    }
  } else {
    // walk to the goal: straight when the lane is clear, waypoints otherwise
    let gx, gz;
    if (bot.investigate) { gx = bot.investigate.x; gz = bot.investigate.z; }
    else if (bot.targetBeacon) { gx = bot.targetBeacon.x; gz = bot.targetBeacon.z; }
    else { gx = bot.pos.x; gz = bot.pos.z; }
    const distGoal = Math.hypot(gx - bot.pos.x, gz - bot.pos.z);
    if (distGoal > 1.4) {
      if (game.time < bot.stuckUntil) {
        // sidestep free of the wedge
        const fx = -Math.sin(bot.yaw), fz = -Math.cos(bot.yaw);
        wishX = -fz * bot.stuckDir; wishZ = fx * bot.stuckDir;
        bot.yaw += bot.stuckDir * 1.4 * dt;
      } else {
        EYE.set(bot.pos.x, bot.pos.y + 1.2, bot.pos.z);
        TARGET_EYE.set(gx, 1.2, gz);
        let wx = gx, wz = gz;
        if (!hasLineOfSight(EYE, TARGET_EYE, blockers)) {
          if (!bot.waypoint || Math.hypot(bot.waypoint.x - bot.pos.x, bot.waypoint.z - bot.pos.z) < 1.2) {
            bot.waypoint = pickWaypoint(bot, waypoints, gx, gz) || bot.waypoint;
          }
          if (bot.waypoint) { wx = bot.waypoint.x; wz = bot.waypoint.z; }
        } else {
          bot.waypoint = null;
        }
        const dx = wx - bot.pos.x, dz = wz - bot.pos.z;
        const dl = Math.hypot(dx, dz) || 1;
        wishX = dx / dl; wishZ = dz / dl;
        aimAt(bot, wx, 1.2, wz);
      }
      bot.moving = true;
      if (!bot.moveMark) { bot.moveMark = { x: bot.pos.x, z: bot.pos.z }; bot.moveMarkAt = game.time; }
    } else {
      // on the beacon: hold it low and keep scanning
      bot.yaw += 0.25 * dt;
      bot.crouch = true;
    }
    if (distGoal > BEACON_RADIUS + 0.5) bot.crouch = false;
  }

  moveActor(bot, wishX, wishZ, dt, colliders);
  if (bot.cooldown > 0) bot.cooldown -= dt;
  if (bot.bloom > 0) bot.bloom = Math.max(0, bot.bloom - dt * 0.06);
  if (bot.reloading) {
    bot.reloadEnd -= dt;
    if (bot.reloadEnd <= 0) {
      const { finishReload } = ctx;
      finishReload(bot);
    }
  }
  if (bot.mag === 0 && !bot.reloading && bot.reserve > 0) {
    const { startReload } = ctx;
    startReload(bot);
  }
}
