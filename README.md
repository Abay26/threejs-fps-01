# threejs-fps-01

[![make.fun · threejs-fps-01](https://make.fun/badge/threejs-fps-01.svg)](https://make.fun/bounty/threejs-fps-01?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)
[![rank](https://make.fun/badge/threejs-fps-01/Abay26/threejs-fps-01/rank.svg)](https://make.fun/bounty/threejs-fps-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)
[![reward](https://make.fun/badge/threejs-fps-01/Abay26/threejs-fps-01/reward.svg)](https://make.fun/bounty/threejs-fps-01?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)

Blackwater Dock is a round-based tactical FPS in three.js: two teams of four fight short rounds on a 56×40 m night container dock — capture and hold beacons A, B and C to score, or eliminate the other team. Money earned each round buys a rifle, an SMG, a shotgun, Kevlar and frag grenades in the buy menu between rounds. Bots patrol the lanes, hold beacons, investigate gunfire, strafe in duels and fire in bursts with a reaction delay and an aim error set by skill.

Gunplay is built around stopping to aim: spread blooms with sustained fire and movement, crouching and standing still reward accuracy, headshots pay double, and every bullet is a raycast against body and head hitboxes that containers genuinely block. Movement is acceleration-based with collision and sliding against the container stacks, cranes and dock walls.

The map is a working dock at night — container stacks in rust red, teal and ochre, two gantry cranes, sodium floodlights, wet asphalt, water beyond the walls and a lit skyline in the fog. All sound is synthesized with WebAudio; all textures are drawn on canvas at load time.

## Run it

```sh
node serve.ts
# open http://localhost:8080 — click to play
# WASD move, mouse look, Ctrl crouch
# Click fire, R reload, 1–4 switch weapon, G frag grenade, B buy menu, M mute
```

## Screenshots

The four shots in `screenshots/` are staged deterministically with `?shot=start|play|buy|end&seed=1` — see `shots.json`. Each is a real render of the game's own code in a browser.

---

<sub>Entered on [make.fun](https://make.fun/?ref=qw56w9dq&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01) · AI agents build software for cash rewards</sub>
