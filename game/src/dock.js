// Blackwater Dock — the map: a 56x40 m night container dock.
// Ground, container stacks, gantry cranes, floodlights, water, skyline,
// the three beacons, spawn points and the waypoint graph the bots walk.
// All geometry is built from boxes and canvas textures; nothing is loaded.

import * as THREE from 'three';
import { MAP, TEAMS, BEACON_RADIUS, mulberry32 } from './state.js';

const CONTAINER_COLORS = [0x8a3b2e, 0x2e6b6b, 0xb07a28, 0x4a5a6b, 0x6b4a5e, 0x3d5a3a];
const STACKS = [
  // north lane (z negative)
  { x: -22, z: -14, rot: 0, levels: 2, color: 0 }, { x: -10, z: -14, rot: 0, levels: 1, color: 1 },
  { x: 2, z: -14, rot: 0, levels: 2, color: 2 }, { x: 14, z: -14, rot: 0, levels: 1, color: 3 },
  { x: 22, z: -14, rot: 0, levels: 2, color: 4 },
  // south lane (z positive)
  { x: -18, z: 14, rot: 0, levels: 1, color: 3 }, { x: -6, z: 14, rot: 0, levels: 2, color: 5 },
  { x: 6, z: 14, rot: 0, levels: 1, color: 0 }, { x: 18, z: 14, rot: 0, levels: 2, color: 1 },
  { x: 24, z: 14, rot: 0, levels: 1, color: 2 },
  // crosswise blocks that break the mid sightlines, clear of the beacons
  { x: -12, z: -4, rot: 1, levels: 1, color: 4 }, { x: -12, z: 6, rot: 1, levels: 2, color: 2 },
  { x: 12, z: -6, rot: 1, levels: 2, color: 1 }, { x: 12, z: 5, rot: 1, levels: 1, color: 0 },
  { x: -2, z: -8, rot: 0, levels: 1, color: 5 }, { x: 4, z: 9, rot: 0, levels: 1, color: 3 },
];

const WAYPOINTS = [
  [-25, -16], [-16, -16], [-6, -16], [4, -16], [14, -16], [24, -16],
  [-25, 16], [-16, 16], [-6, 16], [4, 16], [14, 16], [24, 16],
  [-25, 0], [-19, 0], [-14, 0], [-7, 0], [0, 0], [7, 0], [14, 0], [19, 0], [25, 0],
  [-19, -9], [-19, 9], [0, -9], [0, 9], [19, -9], [19, 9],
  [-12, -11], [12, -11], [-12, 11], [12, 11],
];

function groundTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 768;
  const g = c.getContext('2d');
  g.fillStyle = '#23262b'; g.fillRect(0, 0, 1024, 768);
  const rng = mulberry32(7);
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(${20 + rng() * 30 | 0},${22 + rng() * 30 | 0},${26 + rng() * 30 | 0},0.5)`;
    g.fillRect(rng() * 1024, rng() * 768, 2, 2);
  }
  // painted lane lines and container slot outlines
  g.strokeStyle = 'rgba(214,178,60,0.55)'; g.lineWidth = 3;
  g.setLineDash([26, 18]);
  g.beginPath(); g.moveTo(0, 384); g.lineTo(1024, 384); g.stroke();
  g.beginPath(); g.moveTo(512, 0); g.lineTo(512, 768); g.stroke();
  g.setLineDash([]);
  g.strokeStyle = 'rgba(120,130,140,0.35)'; g.lineWidth = 2;
  for (const x of [120, 340, 560, 780, 920]) {
    g.strokeRect(x, 90, 130, 200); g.strokeRect(x, 480, 130, 200);
  }
  // wet sheen patches
  for (let i = 0; i < 26; i++) {
    const x = rng() * 1024, y = rng() * 768, r = 30 + rng() * 90;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(70,110,150,0.14)'); grad.addColorStop(1, 'rgba(70,110,150,0)');
    g.fillStyle = grad; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function containerTexture(color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  const base = new THREE.Color(color);
  g.fillStyle = `#${base.getHexString()}`; g.fillRect(0, 0, 256, 128);
  // corrugation
  for (let x = 0; x < 256; x += 16) {
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x, 0, 5, 128);
    g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(x + 5, 0, 3, 128);
  }
  // rust streaks and stencil number
  const rng = mulberry32(color * 13 + 5);
  for (let i = 0; i < 22; i++) {
    g.fillStyle = `rgba(20,12,8,${0.08 + rng() * 0.2})`;
    g.fillRect(rng() * 256, rng() * 60, 3 + rng() * 8, 30 + rng() * 60);
  }
  g.fillStyle = 'rgba(235,230,220,0.75)';
  g.font = 'bold 20px monospace';
  g.fillText(`BW-${100 + (color % 89)}`, 18, 30);
  g.fillStyle = 'rgba(235,230,220,0.35)';
  g.font = '12px monospace';
  g.fillText('BLACKWATER TERMINAL', 18, 108);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function waterTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#0a1622'; g.fillRect(0, 0, 512, 256);
  const rng = mulberry32(21);
  for (let i = 0; i < 160; i++) {
    g.strokeStyle = `rgba(${90 + rng() * 60 | 0},${140 + rng() * 60 | 0},${180 + rng() * 40 | 0},${0.12 + rng() * 0.25})`;
    g.lineWidth = 1 + rng() * 2;
    const x = rng() * 512, y = rng() * 256, w = 20 + rng() * 70;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 2);
  return t;
}

export function buildDock(scene, game) {
  const colliders = [];
  const shootables = []; // every mesh a bullet or a sightline can hit: ground, walls, crates
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const addCollider = (x, z, hw, hd) => colliders.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd });

  scene.fog = new THREE.FogExp2(0x0a1018, 0.016);
  scene.background = new THREE.Color(0x0a1018);

  // lights: moon, hemisphere, four sodium floodlights
  const hemi = new THREE.HemisphereLight(0x2a3d55, 0x0c0e12, 0.9);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0x8fb2e8, 0.55);
  moon.position.set(-18, 30, -12);
  scene.add(moon);
  const floodPositions = [[-20, -17], [20, -17], [-20, 17], [20, 17]];
  const floodMats = [];
  for (const [fx, fz] of floodPositions) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 9, 8),
      new THREE.MeshStandardMaterial({ color: 0x2c3138, roughness: 0.8 }));
    pole.position.set(fx, 4.5, fz);
    scene.add(pole);
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x332211, emissive: 0xffb347, emissiveIntensity: 2.2 });
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.25, 0.45), lampMat);
    lamp.position.set(fx, 9, fz);
    scene.add(lamp);
    const light = new THREE.PointLight(0xffb347, 260, 34, 1.8);
    light.position.set(fx, 8.6, fz);
    scene.add(light);
    floodMats.push(lampMat);
  }

  // ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP.w + 4, MAP.d + 4),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.85, metalness: 0.15 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  shootables.push(ground);

  // water beyond the north and south walls
  const waterMat = new THREE.MeshStandardMaterial({ map: waterTexture(), roughness: 0.35, metalness: 0.6 });
  for (const z of [-26, 26]) {
    const water = new THREE.Mesh(new THREE.PlaneGeometry(140, 14), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, -0.15, z);
    scene.add(water);
  }

  // perimeter walls
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.9 });
  for (const [x, z, w, d] of [[0, -20.6, MAP.w + 4, 1.2], [0, 20.6, MAP.w + 4, 1.2],
    [-28.6, 0, 1.2, MAP.d + 4], [28.6, 0, 1.2, MAP.d + 4]]) {
    const wall = new THREE.Mesh(boxGeo, wallMat);
    wall.scale.set(w, 1.6, d);
    wall.position.set(x, 0.8, z);
    scene.add(wall);
    shootables.push(wall);
  }
  addCollider(0, -20.6, MAP.halfW + 2, 0.6);
  addCollider(0, 20.6, MAP.halfW + 2, 0.6);
  addCollider(-28.6, 0, 0.6, MAP.halfD + 2);
  addCollider(28.6, 0, 0.6, MAP.halfD + 2);

  // distant skyline glow: dark slabs with lit windows, outside the walls
  const skyRng = mulberry32(99);
  const winMat = new THREE.MeshStandardMaterial({ color: 0x0c1220, emissive: 0xffc46b, emissiveIntensity: 0.5 });
  const slabMat = new THREE.MeshStandardMaterial({ color: 0x0e1420, roughness: 1 });
  for (let i = 0; i < 16; i++) {
    const h = 8 + skyRng() * 22;
    const slab = new THREE.Mesh(boxGeo, skyRng() > 0.7 ? winMat : slabMat);
    const side = i % 2 === 0 ? -1 : 1;
    slab.scale.set(4 + skyRng() * 5, h, 3);
    slab.position.set(-52 + i * 7, h / 2 - 0.5, side * (30 + skyRng() * 8));
    scene.add(slab);
  }

  // gantry cranes: legs, top beam, trolley, hook cable
  const craneMat = new THREE.MeshStandardMaterial({ color: 0x9a7b2d, roughness: 0.6, metalness: 0.5 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x22262c, roughness: 0.8 });
  for (const cx of [-10, 12]) {
    for (const [lx, lz] of [[cx - 3.4, -17], [cx + 3.4, -17], [cx - 3.4, 17], [cx + 3.4, 17]]) {
      const leg = new THREE.Mesh(boxGeo, craneMat);
      leg.scale.set(0.7, 13, 0.7);
      leg.position.set(lx, 6.5, lz);
      scene.add(leg);
      addCollider(lx, lz, 0.45, 0.45);
    }
    const beam = new THREE.Mesh(boxGeo, craneMat);
    beam.scale.set(8.4, 1.1, 1.4);
    beam.position.set(cx, 13.4, 0);
    scene.add(beam);
    const trolley = new THREE.Mesh(boxGeo, darkMat);
    trolley.scale.set(1.6, 1.2, 1.8);
    trolley.position.set(cx + 1, 12.4, -4);
    scene.add(trolley);
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 7, 6), darkMat);
    cable.position.set(cx + 1, 8.6, -4);
    scene.add(cable);
    const hook = new THREE.Mesh(boxGeo, darkMat);
    hook.scale.set(0.8, 0.5, 0.5);
    hook.position.set(cx + 1, 5, -4);
    scene.add(hook);
  }

  // container stacks
  const texCache = new Map();
  const getTex = (c) => {
    if (!texCache.has(c)) texCache.set(c, containerTexture(c));
    return texCache.get(c);
  };
  for (const s of STACKS) {
    const along = s.rot === 0;
    const len = 6.1, wid = 2.5, hgt = 2.6;
    for (let lvl = 0; lvl < s.levels; lvl++) {
      const mat = new THREE.MeshStandardMaterial({ map: getTex(CONTAINER_COLORS[s.color]), roughness: 0.75, metalness: 0.35 });
      const box = new THREE.Mesh(boxGeo, mat);
      box.scale.set(along ? len : wid, hgt, along ? wid : len);
      box.position.set(s.x, hgt / 2 + lvl * hgt, s.z);
      box.castShadow = true; box.receiveShadow = true;
      scene.add(box);
      shootables.push(box);
      if (lvl === 0) addCollider(s.x, s.z, along ? len / 2 : wid / 2, along ? wid / 2 : len / 2);
    }
  }

  // beacons: ground ring, light beam, floating marker
  const beaconMeshes = [];
  for (const b of game.beacons) {
    const group = new THREE.Group();
    group.position.set(b.x, 0, b.z);
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.5, BEACON_RADIUS, 40),
      new THREE.MeshBasicMaterial({ color: 0x9aa4b0, transparent: true, opacity: 0.65, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    group.add(ring);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(2.4, 40),
      new THREE.MeshBasicMaterial({ color: 0x9aa4b0, transparent: true, opacity: 0.08, side: THREE.DoubleSide }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.025;
    group.add(disc);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0x9aa4b0, transparent: true, opacity: 0.10, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.6, 14, 12, 1, true), beamMat);
    beam.position.y = 7;
    group.add(beam);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.55),
      new THREE.MeshStandardMaterial({ color: 0x9aa4b0, emissive: 0x9aa4b0, emissiveIntensity: 0.9, roughness: 0.3 }));
    gem.position.y = 3.4;
    group.add(gem);
    scene.add(group);
    beaconMeshes.push({ group, ring, disc, beam, beamMat, gem, beacon: b });
  }

  // spawn points: blue west, orange east
  const spawnBlue = [
    { x: -25.5, z: -6, yaw: -Math.PI / 2 }, { x: -25.5, z: -2, yaw: -Math.PI / 2 },
    { x: -25.5, z: 2, yaw: -Math.PI / 2 }, { x: -25.5, z: 6, yaw: -Math.PI / 2 },
  ];
  const spawnOrange = [
    { x: 25.5, z: -6, yaw: Math.PI / 2 }, { x: 25.5, z: -2, yaw: Math.PI / 2 },
    { x: 25.5, z: 2, yaw: Math.PI / 2 }, { x: 25.5, z: 6, yaw: Math.PI / 2 },
  ];

  const waypoints = WAYPOINTS.map(([x, z]) => ({ x, z }));

  function update(dt, g) {
    for (const m of beaconMeshes) {
      const b = m.beacon;
      const team = b.owner ? TEAMS[b.owner] : null;
      const col = team ? team.color : 0x9aa4b0;
      m.ring.material.color.setHex(col);
      m.disc.material.color.setHex(col);
      m.beamMat.color.setHex(col);
      m.gem.material.color.setHex(col);
      m.gem.material.emissive.setHex(col);
      m.gem.rotation.y += dt * 1.4;
      m.gem.position.y = 3.4 + Math.sin(g.time * 1.8 + b.x) * 0.25;
      m.beamMat.opacity = 0.08 + 0.04 * Math.sin(g.time * 2.2 + b.x);
      // capture progress: ring fills by scaling a second arc — approximated by opacity pulse
      m.ring.material.opacity = 0.45 + 0.3 * (b.progress / 100);
    }
    // one floodlight flickers faintly
    floodMats[0].emissiveIntensity = 2.2 + Math.sin(game.time * 13.7) * 0.15;
  }

  return { colliders, waypoints, spawnBlue, spawnOrange, shootables, beaconMeshes, update };
}
