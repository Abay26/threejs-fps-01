// Blackwater Dock — bootstrap and the fixed-step loop.
// Simulation runs at a fixed 60 Hz, apart from rendering; input, bots,
// the match clock and the HUD all read the one game state.

import * as THREE from 'three';
import { createGame, TICK, WEAPONS, GRENADE_PRICE, ARMOR_PRICE, EYE_HEIGHT, CROUCH_EYE, mulberry32 } from './state.js';
import { buildDock } from './dock.js';
import { makeArsenal, fireShot, startReload, finishReload, updateArsenal, throwGrenade, stepGrenades, buyWeapon, currentSpread, fireTracer } from './guns.js';
import { makeActor, buildSoldier, moveActor, syncMesh, damageActor } from './actors.js';
import { stepBot, notifyShot } from './ai.js';
import { startBuyPhase, startRound, stepMatch, restartMatch } from './match.js';
import { buildBuyMenu, refreshBuyMenu, updateHUD, drawMinimap, showPhase, flashHitmarker, flashDamage, banner } from './ui.js';
import { sfx, unlockAudio, setMuted } from './sound.js';
import { applyShot } from './shots.js';

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') || 1);
const game = createGame(seed);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.08, 220);
camera.rotation.order = 'YXZ';
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.getElementById('game').appendChild(renderer.domElement);

const dock = buildDock(scene, game);
game.dock = dock;
const arsenal = makeArsenal(scene);

// --- actors: the player, three allies, four enemies ---
const BOT_NAMES = {
  blue: ['Rook', 'Sable', 'Mire'],
  orange: ['Gull', 'Tarn', 'Vex', 'Slade'],
};
const skills = [0.86, 0.78, 0.9, 0.74, 0.82, 0.7, 0.88];
function addActor(team, isPlayer, name, spawn, skill) {
  const a = makeActor(game, { id: game.actors.length, name, team, isPlayer, x: spawn.x, z: spawn.z, yaw: spawn.yaw, skill });
  a.ammoCache = {};
  buildSoldier(a);
  scene.add(a.mesh);
  game.actors.push(a);
  return a;
}
const player = addActor('blue', true, 'You', dock.spawnBlue[0], 1);
game.player = player;
for (let i = 0; i < 3; i++) addActor('blue', false, BOT_NAMES.blue[i], dock.spawnBlue[i + 1], skills[i]);
for (let i = 0; i < 4; i++) addActor('orange', false, BOT_NAMES.orange[i], dock.spawnOrange[i], skills[3 + i]);

// first-person view model: a simple rifle that kicks with the bloom
const viewGun = new THREE.Group();
const vmMat = new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.45, metalness: 0.6 });
const vmBody = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.55), vmMat);
const vmBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 8), vmMat);
vmBarrel.rotation.x = Math.PI / 2;
vmBarrel.position.set(0, 0.02, -0.38);
const vmSight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.08), vmMat);
vmSight.position.set(0, 0.1, -0.1);
viewGun.add(vmBody, vmBarrel, vmSight);
viewGun.position.set(0.3, -0.26, -0.55);
camera.add(viewGun);
scene.add(camera);

// --- hit handling ---
let hitMeshes = [];
function rebuildHitMeshes() {
  hitMeshes = [];
  for (const a of game.actors) hitMeshes.push(...a.hitMeshes);
  hitMeshes.push(...dock.shootables);
}
rebuildHitMeshes();

function onHit(target, dmg, isHead, attacker) {
  const died = damageActor(game, target, dmg, isHead, attacker, (t, atk, head) => {
    if (atk && atk.isPlayer) {
      game.credits += 100;
      sfx.kill();
      banner('ELIMINATED', `${t.name} · +$100`);
    }
    if (t.isPlayer) {
      flashDamage();
      sfx.hurt();
    }
  });
  if (attacker && attacker.isPlayer) {
    game.shotsHit += 1;
    flashHitmarker(isHead);
    if (isHead) sfx.headshot(); else sfx.hit();
  }
  return died;
}

function explodeGrenade(ev) {
  sfx.grenade();
  arsenal.flash.position.copy(ev.pos);
  arsenal.flash.intensity = 200;
  for (const a of game.actors) {
    if (!a.alive) continue;
    const d = Math.hypot(a.pos.x - ev.pos.x, a.pos.z - ev.pos.z) + Math.abs(a.pos.y - ev.pos.y);
    if (d < 6.5) {
      const dmg = 95 * (1 - d / 6.5) + 10;
      damageActor(game, a, dmg, false, ev.owner, (t, atk) => {
        if (atk && atk.isPlayer) { game.credits += 100; sfx.kill(); }
        if (t.isPlayer) { flashDamage(); sfx.hurt(); }
      });
    }
  }
}

// --- input ---
const keys = {};
let firing = false;
let locked = false;
let prevPhase = game.phase;

addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys[e.code] = true;
  if (e.code === 'KeyR') tryReload();
  if (e.code === 'KeyG') tryGrenade();
  if (e.code === 'KeyB') toggleBuy();
  if (e.code === 'KeyM') { game.muted = !game.muted; setMuted(game.muted); }
  if (e.code === 'Digit1') switchWeapon('pistol');
  if (e.code === 'Digit2') switchWeapon('rifle');
  if (e.code === 'Digit3') switchWeapon('smg');
  if (e.code === 'Digit4') switchWeapon('shotgun');
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('mousedown', (e) => {
  if (e.button === 0 && locked && (game.phase === 'round' || game.phase === 'buy')) {
    firing = true;
    if (!WEAPONS[player.weapon].auto) tryFire();
  }
});
addEventListener('mouseup', (e) => { if (e.button === 0) firing = false; });
addEventListener('mousemove', (e) => {
  if (!locked) return;
  player.yaw -= e.movementX * 0.0021;
  player.pitch -= e.movementY * 0.0021;
  player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch));
});
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === renderer.domElement;
  // The pause prompt only makes sense mid-round: during the buy phase the
  // buy menu (or a canvas click) is how you lock back in.
  document.getElementById('overlay-pause').classList.toggle('hidden',
    locked || game.phase !== 'round' || game.staged);
});
renderer.domElement.addEventListener('click', () => {
  if (!game.staged && (game.phase === 'round' || game.phase === 'buy') && !locked) {
    renderer.domElement.requestPointerLock();
  }
});

function tryFire() {
  if (player.cooldown > 0 || player.reloading || game.phase !== 'round') return;
  if (player.mag <= 0) { sfx.dryFire(); tryReload(); return; }
  const hit = fireShot(game, arsenal, player, scene, hitMeshes, onHit);
  sfx.shot(player.weapon);
  notifyShot(game, player);
  void hit;
}

function tryReload() {
  if (startReload(player)) sfx.reload();
}

function tryGrenade() {
  if (game.phase !== 'round' || player.grenades <= 0) return;
  const g = throwGrenade(game, player);
  if (g) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x2a4a2a, roughness: 0.5, metalness: 0.4 }));
    scene.add(mesh);
    g.mesh = mesh;
    sfx.click();
  }
}

function switchWeapon(id) {
  if (!player.weapons.includes(id) || player.weapon === id) return;
  player.ammoCache[player.weapon] = { mag: player.mag, reserve: player.reserve };
  const cached = player.ammoCache[id];
  const w = WEAPONS[id];
  player.weapon = id;
  player.mag = cached ? cached.mag : w.mag;
  player.reserve = cached ? cached.reserve : w.reserve;
  player.reloading = false;
  player.reloadEnd = 0;
  sfx.click();
}

function toggleBuy() {
  if (game.phase !== 'buy') return;
  const menu = document.getElementById('overlay-buy');
  const open = menu.classList.contains('hidden');
  menu.classList.toggle('hidden', !open);
  if (open && document.pointerLockElement) document.exitPointerLock();
  if (!open) renderer.domElement.requestPointerLock();
}

// --- UI wiring ---
buildBuyMenu(game, (id) => {
  if (id === 'grenade') {
    if (game.credits >= GRENADE_PRICE && player.grenades < 2) {
      game.credits -= GRENADE_PRICE;
      player.grenades += 1;
      sfx.buy();
    }
    refreshBuyMenu(game);
    return;
  }
  if (id === 'armor') {
    if (game.credits >= ARMOR_PRICE && !player.boughtArmor) {
      game.credits -= ARMOR_PRICE;
      player.boughtArmor = true;
      player.armor = 50;
      sfx.buy();
    }
    refreshBuyMenu(game);
    return;
  }
  if (buyWeapon(game, player, id)) {
    player.ammoCache = {};
    sfx.buy();
  }
  refreshBuyMenu(game);
});
document.getElementById('play-btn').addEventListener('click', () => {
  unlockAudio();
  restartMatch(game, dock);
  // No pointer lock here: the buy menu opens first and needs the mouse.
});
document.getElementById('again-btn').addEventListener('click', () => {
  unlockAudio();
  restartMatch(game, dock);
});
document.getElementById('resume-btn').addEventListener('click', () => {
  renderer.domElement.requestPointerLock();
});
document.getElementById('buy-close').addEventListener('click', () => {
  document.getElementById('overlay-buy').classList.add('hidden');
  renderer.domElement.requestPointerLock();
});
document.getElementById('buy-continue').addEventListener('click', () => {
  document.getElementById('overlay-buy').classList.add('hidden');
  renderer.domElement.requestPointerLock();
});

// --- the fixed step ---
const botCtx = {
  colliders: dock.colliders,
  blockers: dock.shootables,
  waypoints: dock.waypoints,
  arsenal,
  hitMeshes,
  onHit,
  startReload,
  finishReload,
};

function stepPlayer(dt) {
  if (game.phase !== 'round' && game.phase !== 'buy') return;
  const f = -Math.sin(player.yaw), r = -Math.cos(player.yaw);
  let wx = 0, wz = 0;
  if (keys.KeyW) { wx += f; wz += r; }
  if (keys.KeyS) { wx -= f; wz -= r; }
  if (keys.KeyA) { wx += r; wz -= f; }
  if (keys.KeyD) { wx -= r; wz += f; }
  player.crouch = !!(keys.ControlLeft || keys.ControlRight || keys.KeyC);
  moveActor(player, wx, wz, dt, dock.colliders);
  if (player.cooldown > 0) player.cooldown -= dt;
  if (player.bloom > 0) player.bloom = Math.max(0, player.bloom - dt * 0.09);
  if (player.reloading) {
    player.reloadEnd -= dt;
    if (player.reloadEnd <= 0) finishReload(player);
  }
  if (firing && WEAPONS[player.weapon].auto) tryFire();
  if (player.mag === 0 && !player.reloading && player.reserve > 0) tryReload();
}

function step(dt) {
  game.time += dt;
  stepPlayer(dt);
  for (const a of game.actors) {
    if (!a.isPlayer) stepBot(game, a, dt, botCtx);
  }
  const prev = game.phase;
  stepMatch(game, dt, (winner) => sfx[winner === 'blue' ? 'roundWin' : 'roundLoss']());
  if (prev === 'round' && game.phase === 'roundEnd') {
    sfx[game.roundWinner === 'blue' ? 'roundWin' : 'roundLoss']();
  }
  if (prev === 'buy' && game.phase === 'round') {
    banner(`ROUND ${game.round}`, 'hold the beacons');
    document.getElementById('overlay-buy').classList.add('hidden');
  }
  if (prev !== 'buy' && game.phase === 'buy') {
    refreshBuyMenu(game);
    // Free the mouse: the buy menu is clicked, not aimed with.
    if (document.pointerLockElement) document.exitPointerLock();
  }
  // grenades
  for (const ev of stepGrenades(game, dt, dock.colliders)) explodeGrenade(ev);
  for (const g of game.grenades) if (g.mesh) g.mesh.position.copy(g.pos);
  updateArsenal(arsenal, dt);
  dock.update(dt, game);
  for (const a of game.actors) syncMesh(a);
  // camera follows the player
  const eye = player.crouch ? CROUCH_EYE : EYE_HEIGHT;
  camera.position.set(player.pos.x, player.pos.y + eye, player.pos.z);
  camera.rotation.set(player.pitch, player.yaw, 0);
  viewGun.position.z = -0.55 + player.bloom * 1.6;
  viewGun.position.y = -0.26 + player.bloom * 0.4;
  prevPhase = game.phase;
}

// --- staging for screenshots ---
// Initialise the actors at their spawns first; the staging then overrides
// positions, phase and loadout for its fixed scene.
startBuyPhaseSilent();
const staging = applyShot(game, dock, location.search);
if (staging) {
  for (let i = 0; i < (staging.steps || 0); i++) step(TICK);
  // The staging sets credits and loadout after the buy transition, so
  // refresh the menu once here or its header shows stale values.
  refreshBuyMenu(game);
  if (staging.tracer) {
    const enemy = game.actors[4];
    const from = new THREE.Vector3(player.pos.x, player.pos.y + EYE_HEIGHT, player.pos.z);
    const to = new THREE.Vector3(enemy.pos.x, enemy.pos.y + 1.2, enemy.pos.z);
    fireTracer(arsenal, from, to);
  }
}
function startBuyPhaseSilent() {
  // actors to spawn, phase to buy; the title overlay sits on top until Play.
  startBuyPhase(game, dock);
  game.phase = 'title';
  game.phaseTime = 0;
}

// --- render loop ---
let last = performance.now();
let acc = 0;
let minimapAt = 0;
let ready = false;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;
  acc += dt;
  let n = 0;
  while (acc >= TICK && n < 5) { step(TICK); acc -= TICK; n++; }
  if (acc > TICK * 5) acc = 0;
  updateHUD(game, currentSpread(player, WEAPONS[player.weapon]));
  if (game.time - minimapAt > 0.15) { minimapAt = game.time; drawMinimap(game, dock); }
  showPhase(game);
  renderer.render(scene, camera);
  if (!ready) {
    ready = true;
    window.__dockReady = true;
  }
}
requestAnimationFrame(frame);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// debug hook for the headless play-test
window.__dock = {
  game,
  renderer,
  get triangles() { return renderer.info.render.triangles; },
  get ready() { return ready; },
};
addEventListener('error', (e) => game.errors.push(String(e.message || e.error)));
const origConsoleError = console.error.bind(console);
console.error = (...args) => { game.errors.push(args.map(String).join(' ')); origConsoleError(...args); };
