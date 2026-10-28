# Rustbound

A single-player, Rust-style survival game that runs in the browser. You wash up on a
procedurally generated island with a rock and a torch: gather wood and stone, craft
tools, build a base before nightfall, hunt, smelt ore, and raid the monuments guarded
by armed scientists.

Built with plain JavaScript modules and [three.js](https://threejs.org) (r160, loaded
from a CDN). No build step, no assets: every model, texture, icon and sound is
generated in code.

> This repo also has **[Blockcraft](minecraft/README.md)**, a Minecraft-style voxel
> sandbox with the Wilderness Bound update. Run `npm start` and open
> `http://localhost:8080/minecraft/`.

## Running it

ES modules must be served over HTTP, so opening `index.html` from disk will not work.

```bash
npm start            # zero-dependency static server on http://localhost:8080
# or: PORT=3000 npm start
# or any static server, e.g. python3 -m http.server 8080
```

An internet connection is needed for three.js (jsDelivr) and the Google Fonts. Use a
desktop browser with a keyboard and mouse.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Shift | Sprint |
| Ctrl / C | Crouch (dive while swimming) |
| Space | Jump (swim up) |
| Mouse | Look |
| 1–6 / wheel | Select belt slot |
| E | Use, pick up, open, drink water |
| Left mouse | Attack, gather, place, eat, fire |
| Right mouse | Aim; hold with the building plan or hammer for the radial menu |
| R | Reload, rotate placement |
| Tab | Inventory |
| Q | Crafting |
| M | Map |
| H | Survival tips |
| Esc | Close panel or pause |

Inventory: drag to move, Shift+drag to split a stack, right-click to quick-move, drag
off the panels to drop on the ground.

## What's in the game

- **Island**: seeded heightmap (fractal and ridged simplex noise with a radial
  falloff), beaches, forests, rocky hills, lakes, a day/night cycle with stars and a
  moon, fog, water and swimming. The same seed always builds the same island.
- **Gathering**: trees, stone, metal and sulfur nodes that shrink as you mine them and
  respawn later; hemp, mushrooms, berry bushes and loose stone/wood/ore pickups.
- **Survival**: health, calories, hydration, bleeding, healing over time, body
  temperature (cold at night, warm by fires, clothing insulation), fall damage.
- **Crafting**: 28 recipes with a timed queue and refunds on cancel; some need a
  Workbench Level 1 nearby.
- **Tools and combat**: rock, hatchets, pickaxes, spear, bone knife, hunting bow with
  physical arrows, revolver and pipe shotgun with reloads, durability, armor.
- **Building**: foundations, walls, doorways, windows, floors and stairs on a 3 m grid
  with socket snapping, structural stability (unsupported pieces collapse), upgrades
  twig → wood → stone → sheet metal, and wooden doors that wildlife and scientists
  cannot open.
- **Deployables**: campfire (cooking, warmth, charcoal), furnace (smelting; split ore
  across slots to smelt faster), storage box, sleeping bag (respawn point), workbench.
- **Wildlife**: deer flee, boars charge when you get close, wolves and bears hunt you
  (more wolves at night). Harvest corpses for meat, leather, bone and fat.
- **Monuments**: an abandoned outpost patrolled by scientists with rifles, roadside
  ruins, loot crates, military crates, breakable barrels and recyclers.
- **Death**: your items drop in a backpack marked on the map; respawn on a beach or
  at a sleeping bag.
- **Saving**: autosaves every minute and on demand to `localStorage`, storing only
  what changed relative to the seed.

## Project layout

```
index.html                  Canvas, HUD mount points, menus and dialogs
styles/main.css             All UI styling
server.js                   Zero-dependency static dev server
src/
  main.js                   Entry point
  Game.js                   Renderer, game loop, state machine, save/load orchestration
  lib/three.js              Single pinned three.js import
  core/                     Input, procedural audio, noise, math, settings, saves,
                            geometry helpers, procedural canvas textures, event bus
  world/
    WorldGen.js             Seeded island, monument sites, resource and loot placement
    Terrain.js              Heightmap, mesh, height/normal queries, terrain raycast
    Physics.js              Spatial hash, box/cylinder/sphere/ramp colliders,
                            capsule movement resolution, ground and ray queries
    Sky.js, Water.js        Day/night lighting and the sea
    ResourceManager.js      Instanced trees, ore nodes and pickups; gathering; respawns
    Monuments.js            Outpost and ruins layouts
    LootSpawner.js          Barrels and crates with respawn timers
    Foliage.js              Decorative grass and shrubs
  items/                    Item database, recipes, loot tables, icon painter, harvest math
  inventory/                Item containers, player inventory, crafting queue
  player/                   Player controller, vitals, first-person view model,
                            held-item actions, interaction raycasts
  entities/                 Creature base, animals, scientists, dropped items,
                            lootable bags and crates, entity manager
  building/BuildingSystem.js  Pieces, sockets, stability, upgrades, doors
  deployables/              Campfire, furnace, box, bag, workbench, recycler
  combat/                   Projectiles and particle/tracer/light effects
  ui/                       HUD, inventory, crafting and container panels, radial menu,
                            map, menus
```

## Tuning

Balance lives in data tables:

- `src/items/ItemDatabase.js`: damage, gather rates, durability, food values, armor
- `src/items/Recipes.js`: crafting costs and times, recycling output
- `src/items/LootTables.js`: barrel, crate and scientist loot
- `src/entities/Animal.js` (`SPECIES`): health, speed, damage, detection ranges
- `src/world/ResourceManager.js` (`NODE_TYPES`): yields and respawn times
- `src/building/BuildingSystem.js` (`GRADES`, `PIECES`): building costs

`window.game` is exposed in the browser console for debugging, e.g.
`game.player.inventory.give('wood', 1000)` or `game.sky.time = 21`.
