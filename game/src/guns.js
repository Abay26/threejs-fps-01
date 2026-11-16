// Blackwater Dock — weapons: firing, recoil, spread, reload, grenades.
// Hits are raycasts against actor hitboxes and container meshes, so a shot
// is blocked by a crate exactly when the tracer is. One shared Raycaster
// and a scratch vector keep the hot path allocation-free.

import * as THREE from 'three';
import { WEAPONS, EYE_HEIGHT } from './state.js';

const raycaster = new THREE.Raycaster();
const tmpDir = new THREE.Vector3();
const tmpOrigin = new THREE.Vector3();
const tmpTarget = new THREE.Vector3();

export function makeArsenal(scene) {
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9 });
  const tracerGeo = new THREE.BufferGeometry();
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  // a small pool of tracer lines, reused so firing never allocates
  const pool = [];
  for (let i = 0; i < 12; i++) {
    const line = new THREE.Line(tracerGeo.clone(), tracerMat.clone());
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    pool.push({ line, life: 0 });
  }
  let nextTracer = 0;
  const flash = new THREE.PointLight(0xffc46b, 0, 9, 2);
  scene.add(flash);
  return { pool, nextTracer, flash };
}

export function fireTracer(arsenal, from, to) {
  const t = arsenal.pool[arsenal.nextTracer];
  arsenal.nextTracer = (arsenal.nextTracer + 1) % arsenal.pool.length;
  const pos = t.line.geometry.attributes.position;
  pos.setXYZ(0, from.x, from.y, from.z);
  pos.setXYZ(1, to.x, to.y, to.z);
  pos.needsUpdate = true;
  t.line.visible = true;
  t.life = 0.07;
  t.line.material.opacity = 0.9;
}

export function updateArsenal(arsenal, dt) {
  for (const t of arsenal.pool) {
    if (t.life > 0) {
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.07) * 0.9;
      if (t.life <= 0) t.line.visible = false;
    }
  }
  arsenal.flash.intensity = Math.max(0, arsenal.flash.intensity - dt * 900);
}

// Spread in radians: still + crouched is best, moving and firing is worst.
export function currentSpread(actor, weapon) {
  let s = weapon.spread;
  const moving = actor.vel.length() > 0.6;
  if (moving) s += weapon.moveSpread;
  if (actor.crouch) s *= 0.55;
  s += actor.bloom * 0.9;
  return s;
}

// Fire one trigger pull (all pellets of one shot). Returns hits for the feed.
export function fireShot(game, arsenal, shooter, scene, hitMeshes, onHit) {
  const weapon = WEAPONS[shooter.weapon];
  if (shooter.mag <= 0 || shooter.reloading) return false;
  shooter.mag -= 1;
  shooter.lastShotAt = game.time;
  shooter.cooldown = weapon.interval;
  shooter.bloom = Math.min(0.05, shooter.bloom + weapon.kick * 0.5);
  // recoil kicks the shooter's aim up a touch
  shooter.pitch += weapon.kick * (shooter.isPlayer ? 1 : 0.4);
  shooter.pitch = Math.min(1.45, shooter.pitch);
  game.shotsFired += shooter.isPlayer ? 1 : 0;

  tmpOrigin.set(shooter.pos.x, shooter.pos.y + (shooter.crouch ? 1.05 : EYE_HEIGHT), shooter.pos.z);
  const spread = currentSpread(shooter, weapon);
  let anyHit = false;
  for (let p = 0; p < weapon.pellets; p++) {
    tmpDir.set(
      -Math.sin(shooter.yaw) * Math.cos(shooter.pitch),
      Math.sin(shooter.pitch),
      -Math.cos(shooter.yaw) * Math.cos(shooter.pitch));
    tmpDir.x += (game.rng() - 0.5) * 2 * spread;
    tmpDir.y += (game.rng() - 0.5) * 2 * spread;
    tmpDir.z += (game.rng() - 0.5) * 2 * spread;
    tmpDir.normalize();
    raycaster.set(tmpOrigin, tmpDir);
    raycaster.far = weapon.range * 1.6;
    const hits = raycaster.intersectObjects(hitMeshes, false);
    let end = tmpTarget.copy(tmpDir).multiplyScalar(weapon.range).add(tmpOrigin);
    for (const h of hits) {
      const ud = h.object.userData;
      if (ud.actor === shooter) continue; // never shoot yourself
      const dist = h.distance;
      const falloff = dist > weapon.range ? weapon.falloff : 1;
      if (ud.actor) {
        const dmg = weapon.damage * (ud.part === 'head' ? weapon.headMul : 1) * falloff;
        onHit(ud.actor, dmg, ud.part === 'head', shooter);
        anyHit = true;
        end = tmpTarget.copy(tmpDir).multiplyScalar(dist).add(tmpOrigin);
      } else {
        // a container or wall stopped the bullet
        end = tmpTarget.copy(tmpDir).multiplyScalar(dist).add(tmpOrigin);
      }
      break; // first thing hit decides the shot
    }
    fireTracer(arsenal, tmpOrigin, end);
  }
  // muzzle flash at the shooter's gun
  arsenal.flash.position.copy(tmpOrigin).addScaledVector(tmpDir, 0.6);
  arsenal.flash.intensity = 60;
  return anyHit;
}

export function startReload(shooter) {
  const weapon = WEAPONS[shooter.weapon];
  if (shooter.reloading || shooter.mag === weapon.mag || shooter.reserve <= 0) return false;
  shooter.reloading = true;
  shooter.reloadEnd = weapon.reload;
  return true;
}

export function finishReload(shooter) {
  const weapon = WEAPONS[shooter.weapon];
  const need = weapon.mag - shooter.mag;
  const take = Math.min(need, shooter.reserve);
  shooter.mag += take;
  shooter.reserve -= take;
  shooter.reloading = false;
  shooter.reloadEnd = 0;
}

export function buyWeapon(game, actor, id) {
  const w = WEAPONS[id];
  if (!w || actor.weapons.includes(id)) return false;
  if (game.credits < w.price) return false;
  game.credits -= w.price;
  actor.weapons.push(id);
  actor.weapon = id;
  actor.mag = w.mag;
  actor.reserve = w.reserve;
  actor.reloading = false;
  return true;
}

export function throwGrenade(game, actor) {
  if (actor.grenades <= 0) return null;
  actor.grenades -= 1;
  const g = {
    pos: new THREE.Vector3(actor.pos.x, actor.pos.y + 1.4, actor.pos.z),
    vel: new THREE.Vector3(
      -Math.sin(actor.yaw) * Math.cos(actor.pitch) * 13,
      Math.sin(actor.pitch) * 13 + 4.5,
      -Math.cos(actor.yaw) * Math.cos(actor.pitch) * 13),
    fuse: 1.6,
    owner: actor,
  };
  game.grenades.push(g);
  return g;
}

// Grenade physics + explosion. Returns a list of {actor, damage} to apply.
export function stepGrenades(game, dt, colliders) {
  const events = [];
  for (let i = game.grenades.length - 1; i >= 0; i--) {
    const g = game.grenades[i];
    g.fuse -= dt;
    g.vel.y -= 22 * dt;
    g.pos.addScaledVector(g.vel, dt);
    if (g.pos.y < 0.15) { g.pos.y = 0.15; g.vel.y *= -0.35; g.vel.x *= 0.6; g.vel.z *= 0.6; }
    // bounce off container sides, cheaply: clamp inside map, stop on a collider
    for (const c of colliders) {
      if (g.pos.x > c.minX - 0.15 && g.pos.x < c.maxX + 0.15 && g.pos.z > c.minZ - 0.15 && g.pos.z < c.maxZ + 0.15 && g.pos.y < 2.7) {
        g.vel.x *= -0.4; g.vel.z *= -0.4;
        g.pos.x += g.vel.x * dt * 2; g.pos.z += g.vel.z * dt * 2;
      }
    }
    if (g.fuse <= 0) {
      events.push({ pos: g.pos.clone(), owner: g.owner });
      game.grenades.splice(i, 1);
    }
  }
  return events;
}
