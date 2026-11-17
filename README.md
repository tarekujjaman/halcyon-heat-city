# HALCYON HEAT
[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/tarekujjaman/halcyon-heat-city/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/tarekujjaman/halcyon-heat-city/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original 3D open-world crime game in the browser, set in Halcyon Bay: a sun-soaked coastal city at
golden hour with five districts (Coral Strand, Glasswater Downtown, Neon Row, Palmetto Heights and
Saltmarsh Docks), traffic, pedestrians, cars to steal, a five-star wanted system with cruisers, roadblocks
and a helicopter, seven story missions, street races, taxi fares, sea-glass shards, paint shops and
safehouses with saving. You play Marisol "Sol" Vega, a getaway driver back in town to pull her uncle Teo
out of a debt to Kane Okafor's crew. Everything is built in code with three.js: geometry, canvas
textures, synthesized sound and three procedural radio stations. No network requests at run time.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Walk / drive (S brakes, then reverses; W brakes a reversing car, then drives) |
| Shift | Run |
| Space | Jump on foot, handbrake in a car |
| Mouse | Look around (click the game to capture the pointer; after a menu, click once to resume) |
| Left click | Punch or shoot (the click that recaptures the mouse never fires) |
| 1 2 3 4, wheel | Weapons |
| F or E | Steal or enter a car, get out |
| R | Next radio station |
| M | Map and waypoints |
| H | Horn |
| Esc | Pause, save, settings (releasing the pointer with Esc also pauses) |
| Arrow keys | Turn the camera without the mouse |

Settings (Esc, or the title screen) has master and music volume, a mouse sensitivity slider from 1 to 12
(radians per pixel x1000, default 2.5), Invert Y and shadows. Settings are saved in the browser.

## Run it

```
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. `node tools/shoot.mjs` retakes the screenshots and
`node tools/playtest.mjs` plays through every system in headless Chrome. `MAKEFUN_OUTPUT_DIR=out node main.ts`
writes the entry (game, screenshots and dossier) to `out/`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=y2gg1pq1&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
