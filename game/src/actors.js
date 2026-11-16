// Blackwater Dock — actors: the player and the seven bots.
// One body for both: position, velocity, health, armour, weapons, and a
// low-poly soldier mesh whose torso and head are the raycast hitboxes.
// Movement is acceleration-based with circle-vs-box collision and sliding.

import * as THREE from 'three';
import { WEAPONS, PLAYER_RADIUS, PLAYER_HEIGHT, MAP } from './state.js';

const WALK_SPEED = 4.3;
const CROUCH_SPEED = 2.1;
const ACCEL = 42;
const FRICTION = 11;

const BODY_MATS = {};
function teamMaterials(team) {
  if (!BODY_MATS[team]) {
    const base = team === 'blue' ? 0x2f6fd0 : 0xd06a24;
    BODY_MATS[team] = {
      torso: new THREE.MeshStandardMaterial({ color: base, roughness: 0.75 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.85 }),
      head: new THREE.MeshStandardMaterial({ color: 0x8a6f52, roughness: 0.8 }),
      visor: new THREE.MeshStandardMaterial({ color: 0x101418, roughness: 0.25, metalness: 0.6 }),
    };
  }
  return BODY_MATS[team];
}

// Build the soldier mesh. userData on torso/head/legs marks the hitboxes
// the gun raycast reads: { actor, part: 'body' | 'head' }.
export function buildSoldier(actor) {
  const m = teamMaterials(actor.team);
  const group = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), m.torso);
  torso.position.y = 1.08;
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.34, 0.34), m.dark);
  vest.position.y = 1.12;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), m.head);
  head.position.y = 1.58;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.05), m.visor);
  visor.position.set(0, 1.6, 0.16);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.72, 0.24), m.dark);
  legL.position.set(-0.14, 0.36, 0);
  const legR = legL.clone();
  legR.position.x = 0.14;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, 0.72), m.dark);
  gun.position.set(0.24, 1.18, 0.3);
  group.add(torso, vest, head, visor, legL, legR, gun);
  torso.userData = { actor, part: 'body' };
  vest.userData = { actor, part: 'body' };
  legL.userData = { actor, part: 'body' };
  legR.userData = { actor, part: 'body' };
  head.userData = { actor, part: 'head' };
  visor.userData = { actor, part: 'head' };
  actor.hitMeshes = [torso, vest, head, visor, legL, legR];
  actor.mesh = group;
  actor.gunMesh = gun;
  return group;
}

export function makeActor(game, opts) {
  const a = {
    id: opts.id,
    name: opts.name,
    team: opts.team,
    isPlayer: !!opts.isPlayer,
    alive: true,
    hp: 100,
    armor: 0,
    pos: new THREE.Vector3(opts.x, 0, opts.z),
    yaw: opts.yaw || 0,
    pitch: 0,
    vel: new THREE.Vector3(),
    crouch: false,
    weapon: 'pistol',
    weapons: ['pistol'],
    mag: WEAPONS.pistol.mag,
    reserve: WEAPONS.pistol.reserve,
    grenades: 0,
    reloading: false,
    reloadEnd: 0,
    cooldown: 0,
    bloom: 0,
    lastShotAt: -10,
    skill: opts.skill ?? 0.8,
    // bot brain
    mode: 'patrol',
    waypoint: null,
    waypointAt: 0,
    thinkAt: 0,
    reactAt: 0,
    enemy: null,
    burstLeft: 0,
    strafeDir: 1,
    strafeAt: 0,
    hearAt: 0,
    hearPos: null,
    mesh: null,
    hitMeshes: [],
  };
  return a;
}

// Push a circle out of every box it overlaps. Runs twice so corners slide.
export function resolveCollisions(pos, radius, colliders) {
  for (let pass = 0; pass < 2; pass++) {
    for (const c of colliders) {
      const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
      const dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * radius;
        pos.z = cz + (dz / d) * radius;
      } else {
        // centre inside the box: push out along the shallowest side
        const pl = pos.x - c.minX, pr = c.maxX - pos.x;
        const pt = pos.z - c.minZ, pb = c.maxZ - pos.z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) pos.x = c.minX - radius;
        else if (m === pr) pos.x = c.maxX + radius;
        else if (m === pt) pos.z = c.minZ - radius;
        else pos.z = c.maxZ + radius;
      }
    }
  }
  pos.x = Math.max(-MAP.halfW + 0.6, Math.min(MAP.halfW - 0.6, pos.x));
  pos.z = Math.max(-MAP.halfD + 0.6, Math.min(MAP.halfD - 0.6, pos.z));
}

// wishX/wishZ is a unit-ish direction in world space; speed caps the run.
export function moveActor(actor, wishX, wishZ, dt, colliders) {
  const targetSpeed = actor.crouch ? CROUCH_SPEED : WALK_SPEED;
  const wishLen = Math.hypot(wishX, wishZ);
  const nx = wishLen > 0.01 ? wishX / wishLen : 0;
  const nz = wishLen > 0.01 ? wishZ / wishLen : 0;
  actor.vel.x += nx * ACCEL * dt;
  actor.vel.z += nz * ACCEL * dt;
  // friction when no input, and cap speed
  const speed = Math.hypot(actor.vel.x, actor.vel.z);
  if (wishLen < 0.01) {
    const f = Math.max(0, 1 - FRICTION * dt);
    actor.vel.x *= f; actor.vel.z *= f;
  } else if (speed > targetSpeed) {
    actor.vel.x *= targetSpeed / speed;
    actor.vel.z *= targetSpeed / speed;
  }
  actor.pos.x += actor.vel.x * dt;
  actor.pos.z += actor.vel.z * dt;
  resolveCollisions(actor.pos, PLAYER_RADIUS, colliders);
}

export function syncMesh(actor) {
  if (!actor.mesh) return;
  actor.mesh.position.copy(actor.pos);
  actor.mesh.rotation.y = actor.yaw + Math.PI; // model faces +z, yaw 0 looks -z
  actor.mesh.visible = actor.alive && !actor.isPlayer;
  if (!actor.alive) {
    actor.mesh.rotation.z = Math.PI / 2;
    actor.mesh.position.y = 0.25;
  } else {
    actor.mesh.rotation.z = 0;
    actor.mesh.position.y = 0;
  }
}

// Armour soaks half the damage until it runs out.
export function damageActor(game, target, amount, isHead, attacker, onKill) {
  if (!target.alive) return false;
  let rest = amount;
  if (target.armor > 0) {
    const soaked = Math.min(target.armor, rest * 0.5);
    target.armor -= soaked;
    rest -= soaked;
  }
  target.hp -= rest;
  if (target.hp <= 0) {
    target.hp = 0;
    target.alive = false;
    target.vel.set(0, 0, 0);
    if (attacker && attacker.isPlayer && target !== attacker) game.kills += 1;
    if (target.isPlayer) game.deaths += 1;
    if (onKill) onKill(target, attacker, isHead);
    return true;
  }
  return false;
}

// Line of sight between two eye-level points, blocked only by containers.
const losRay = new THREE.Raycaster();
const losFrom = new THREE.Vector3();
const losDir = new THREE.Vector3();
export function hasLineOfSight(from, to, blockers) {
  losFrom.copy(from);
  losDir.copy(to).sub(from);
  const dist = losDir.length();
  if (dist < 0.01) return true;
  losDir.multiplyScalar(1 / dist);
  losRay.set(losFrom, losDir);
  losRay.far = dist;
  const hits = losRay.intersectObjects(blockers, false);
  return hits.length === 0;
}

export { PLAYER_HEIGHT };
