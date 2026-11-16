// Blackwater Dock — interface: HUD, buy menu, minimap, overlays.
// All DOM lives in index.html; this module owns the wiring and the per-frame
// refresh. Writes are cached so a steady value never touches the DOM twice.

import { WEAPONS, WEAPON_ORDER, GRENADE_PRICE, ARMOR_PRICE, ARMOR_VALUE } from './state.js';

const $ = (id) => document.getElementById(id);
const cache = new Map();
function setText(id, value) {
  if (cache.get(id) !== value) { cache.set(id, value); const el = $(id); if (el) el.textContent = value; }
}
function setStyle(id, prop, value) {
  const key = `${id}:${prop}`;
  if (cache.get(key) !== value) { cache.set(key, value); const el = $(id); if (el) el.style[prop] = value; }
}
function setClass(id, cls, on) {
  const key = `${id}.${cls}`;
  if (cache.get(key) !== on) { cache.set(key, on); const el = $(id); if (el) el.classList.toggle(cls, on); }
}

export function buildBuyMenu(game, onBuy) {
  const root = $('buy-items');
  if (!root) return;
  root.innerHTML = '';
  for (const id of WEAPON_ORDER) {
    const w = WEAPONS[id];
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'buy-card';
    card.dataset.weapon = id;
    card.innerHTML = `<b>${w.name}</b><span>$${w.price} · ${w.mag} rnd · ${w.damage} dmg</span><i class="buy-state"></i>`;
    card.addEventListener('click', () => onBuy(id));
    root.appendChild(card);
  }
  const grenade = document.createElement('button');
  grenade.type = 'button';
  grenade.className = 'buy-card';
  grenade.dataset.weapon = 'grenade';
  grenade.innerHTML = `<b>Frag Grenade</b><span>$${GRENADE_PRICE} · throw with G</span><i class="buy-state"></i>`;
  grenade.addEventListener('click', () => onBuy('grenade'));
  root.appendChild(grenade);
  const armor = document.createElement('button');
  armor.type = 'button';
  armor.className = 'buy-card';
  armor.dataset.weapon = 'armor';
  armor.innerHTML = `<b>Kevlar Vest</b><span>$${ARMOR_PRICE} · +${ARMOR_VALUE} armour</span><i class="buy-state"></i>`;
  armor.addEventListener('click', () => onBuy('armor'));
  root.appendChild(armor);
}

export function refreshBuyMenu(game) {
  const player = game.player;
  if (!player) return;
  setText('buy-credits', `$${game.credits}`);
  document.querySelectorAll('#buy-items .buy-card').forEach((card) => {
    const id = card.dataset.weapon;
    const state = card.querySelector('.buy-state');
    if (!state) return;
    if (id === 'grenade') state.textContent = player.grenades > 0 ? `owned ×${player.grenades}` : '';
    else if (id === 'armor') state.textContent = player.boughtArmor ? 'worn' : '';
    else if (player.weapons.includes(id)) state.textContent = player.weapon === id ? 'equipped' : 'owned';
    else state.textContent = game.credits >= WEAPONS[id].price ? '' : 'no credits';
    card.classList.toggle('owned', player.weapons.includes(id) || (id === 'grenade' && player.grenades > 0));
    card.classList.toggle('cant', id !== 'grenade' && id !== 'armor' && !player.weapons.includes(id) && game.credits < WEAPONS[id].price);
  });
}

export function updateHUD(game, spreadRad) {
  const p = game.player;
  if (!p) return;
  setText('health-num', String(Math.ceil(p.hp)));
  setStyle('health-fill', 'width', `${Math.max(0, p.hp)}%`);
  setClass('health-fill', 'low', p.hp <= 30);
  setText('armor-num', String(Math.ceil(p.armor)));
  setClass('armor-row', 'hidden', p.armor <= 0);
  const w = WEAPONS[p.weapon];
  setText('ammo-mag', String(p.mag));
  setText('ammo-reserve', `/ ${p.reserve}`);
  setText('ammo-weapon', w.name);
  setClass('ammo', 'empty', p.mag === 0);
  setClass('ammo', 'reloading', p.reloading);
  setText('timer', game.phase === 'round' ? fmtTime(game.timer) : game.phase === 'buy' ? `BUY ${Math.ceil(game.buyTimer)}` : '—');
  setText('round-label', `ROUND ${game.round}`);
  setText('score-blue', String(game.roundWins.blue));
  setText('score-orange', String(game.roundWins.orange));
  setText('score-points', `${game.roundPoints.blue} : ${game.roundPoints.orange}`);
  setText('credits', `$${game.credits}`);
  setText('kills', `${game.kills} K · ${game.deaths} D`);
  setText('grenades', `G ×${p.grenades}`);
  for (const b of game.beacons) {
    const chip = $(`beacon-${b.id}`);
    if (!chip) continue;
    chip.classList.toggle('blue', b.owner === 'blue');
    chip.classList.toggle('orange', b.owner === 'orange');
    chip.classList.toggle('capturing', b.holder !== null && b.owner !== b.holder);
    const bar = chip.querySelector('i');
    if (bar) bar.style.width = `${b.progress}%`;
  }
  // crosshair gap follows live spread
  const gap = 6 + Math.min(26, spreadRad * 900);
  setStyle('crosshair', '--gap', `${gap.toFixed(1)}px`);
  // kill feed
  const feed = $('feed');
  if (feed) {
    const html = game.feed.map((f) => `<div class="feed-${f.kind}">${f.text}</div>`).join('');
    if (cache.get('feed') !== html) { cache.set('feed', html); feed.innerHTML = html; }
  }
}

function fmtTime(s) {
  const v = Math.max(0, Math.ceil(s));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
}

let hitTimer = 0;
export function flashHitmarker(headshot) {
  const el = $('hitmarker');
  if (!el) return;
  el.classList.add('on');
  el.classList.toggle('head', !!headshot);
  clearTimeout(hitTimer);
  hitTimer = setTimeout(() => el.classList.remove('on'), 140);
}

export function flashDamage() {
  const el = $('damage-vignette');
  if (!el) return;
  el.classList.add('on');
  setTimeout(() => el.classList.remove('on'), 260);
}

let bannerTimer = 0;
export function banner(main, sub) {
  const el = $('banner');
  if (!el) return;
  el.innerHTML = main + (sub ? `<span>${sub}</span>` : '');
  el.classList.add('on');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => el.classList.remove('on'), 2200);
}

export function showPhase(game) {
  const phase = game.phase;
  setClass('overlay-title', 'hidden', phase !== 'title');
  setClass('overlay-buy', 'hidden', phase !== 'buy');
  setClass('overlay-round', 'hidden', phase !== 'roundEnd');
  setClass('overlay-match', 'hidden', phase !== 'matchEnd');
  setClass('hud', 'hidden', phase === 'title' || phase === 'matchEnd');
  if (phase === 'roundEnd') {
    const won = game.roundWinner === 'blue';
    setText('round-result', won ? 'ROUND WON' : 'ROUND LOST');
    setClass('round-result', 'won', won);
    setClass('round-result', 'lost', !won);
    setText('round-reason', game.roundReason || '');
    setText('round-score', `Harbor ${game.roundWins.blue} — ${game.roundWins.orange} Tide`);
  }
  if (phase === 'matchEnd') {
    const won = game.winner === 'blue';
    setText('match-result', won ? 'MATCH WON' : 'MATCH LOST');
    setClass('match-result', 'won', won);
    setClass('match-result', 'lost', !won);
    setText('match-score', `Harbor ${game.roundWins.blue} — ${game.roundWins.orange} Tide · ${game.kills} kills`);
  }
}

// Minimap: 2D canvas, drawn a few times a second. Containers from the
// collider list, beacons as diamonds, actors as dots.
export function drawMinimap(game, dock) {
  const canvas = $('minimap');
  if (!canvas) return;
  const g = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const sx = W / 60, sz = H / 44;
  const X = (x) => (x + 30) * sx;
  const Z = (z) => (z + 22) * sz;
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(10,16,24,0.82)';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(150,170,190,0.5)';
  g.strokeRect(X(-28), Z(-20), 56 * sx, 40 * sz);
  g.fillStyle = 'rgba(120,130,140,0.55)';
  for (const c of dock.colliders) {
    const w = c.maxX - c.minX, d = c.maxZ - c.minZ;
    if (w > 30 || d > 30) continue; // skip the perimeter walls
    g.fillRect(X(c.minX), Z(c.minZ), w * sx, d * sz);
  }
  for (const b of game.beacons) {
    const cx = X(b.x), cy = Z(b.z);
    g.save();
    g.translate(cx, cy);
    g.rotate(Math.PI / 4);
    g.fillStyle = b.owner === 'blue' ? '#4d9fff' : b.owner === 'orange' ? '#ff9a3d' : '#9aa4b0';
    g.fillRect(-4, -4, 8, 8);
    g.restore();
    g.fillStyle = '#e9e6df';
    g.font = 'bold 9px monospace';
    g.fillText(b.id, cx + 6, cy + 3);
  }
  for (const a of game.actors) {
    if (!a.alive) continue;
    const cx = X(a.pos.x), cy = Z(a.pos.z);
    if (a.isPlayer) {
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(cx, cy, 3.4, 0, 7);
      g.fill();
      // facing tick
      g.strokeStyle = '#ffffff';
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx - Math.sin(a.yaw) * 7, cy - Math.cos(a.yaw) * 7);
      g.stroke();
    } else {
      g.fillStyle = a.team === 'blue' ? '#4d9fff' : '#ff9a3d';
      g.beginPath();
      g.arc(cx, cy, 2.6, 0, 7);
      g.fill();
    }
  }
}
