import { Animal } from './Animal.js';
import { Scientist } from './Scientist.js';
import { DroppedItem } from './DroppedItem.js';
import { WorldContainer } from './WorldContainer.js';
import { randRange } from '../core/MathUtils.js';

// Owns every moving or temporary thing in the world: wildlife (spawned around
// the player to keep population targets), monument scientists (respawning per
// slot), dropped items and lootable bags.

const DAY_TARGETS = { deer: 8, boar: 6, wolf: 4, bear: 2 };
const NIGHT_TARGETS = { deer: 6, boar: 5, wolf: 10, bear: 3 };
const DESPAWN_DISTANCE = 240;

export class EntityManager {
  constructor(game) {
    this.game = game;
    this.animals = [];
    this.npcs = [];
    this.drops = [];
    this.containers = [];
    this.npcSlots = [];
    this.spawnTimer = 1;
    this.howlTimer = 30;
  }

  setupNPCs(sites) {
    for (const site of sites) {
      for (const spawn of site.npcs) {
        this.npcSlots.push({ home: { x: site.x, z: site.z }, waypoints: site.waypoints, spawn, npc: null, timer: 0 });
      }
    }
    for (const slot of this.npcSlots) this.spawnNPC(slot);
  }

  spawnNPC(slot) {
    const npc = new Scientist(this.game, slot);
    slot.npc = npc;
    this.npcs.push(npc);
  }

  spawnAnimal(species, x, z) {
    const animal = new Animal(this.game, species, x, z);
    this.animals.push(animal);
    return animal;
  }

  findSpawnPoint(minDist, maxDist) {
    const terrain = this.game.terrain;
    const p = this.game.player.position;
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = randRange(minDist, maxDist);
      const x = p.x + Math.cos(a) * r;
      const z = p.z + Math.sin(a) * r;
      if (!terrain.inBounds(x, z)) continue;
      const h = terrain.getHeight(x, z);
      if (h < 1.5 || h > 32 || terrain.getSlope(x, z) > 0.3) continue;
      if (this.game.monuments.siteAt(x, z, 15)) continue;
      if (this.game.physics.boxBlocked(x - 1, h, z - 1, x + 1, h + 2, z + 1)) continue;
      return { x, z };
    }
    return null;
  }

  populateAnimals() {
    const targets = this.game.sky.isNight() ? NIGHT_TARGETS : DAY_TARGETS;
    const counts = {};
    for (const a of this.animals) if (!a.dead) counts[a.species] = (counts[a.species] ?? 0) + 1;
    for (const [species, target] of Object.entries(targets)) {
      if ((counts[species] ?? 0) >= target) continue;
      const spot = this.findSpawnPoint(70, 170);
      if (spot) this.spawnAnimal(species, spot.x, spot.z);
      return;
    }
  }

  dropItem(item, pos, vel = null) {
    const v = vel ?? { x: randRange(-1, 1), y: 2.5, z: randRange(-1, 1) };
    const drop = new DroppedItem(this.game, item, pos.x, pos.y, pos.z, v.x, v.y, v.z);
    this.drops.push(drop);
    return drop;
  }

  spawnContainer(opts) {
    const c = new WorldContainer(this.game, opts);
    this.containers.push(c);
    return c;
  }

  removeAnimal(a) {
    a.dispose();
    const i = this.animals.indexOf(a);
    if (i >= 0) this.animals.splice(i, 1);
  }

  removeNPC(n) {
    n.dispose();
    const i = this.npcs.indexOf(n);
    if (i >= 0) this.npcs.splice(i, 1);
  }

  removeDrop(d) {
    const i = this.drops.indexOf(d);
    if (i >= 0) this.drops.splice(i, 1);
  }

  removeContainer(c) {
    const i = this.containers.indexOf(c);
    if (i >= 0) this.containers.splice(i, 1);
  }

  // Scare nearby wildlife and alert scientists, e.g. after a gunshot.
  noise(x, z, radius) {
    for (const a of this.animals) {
      if (a.dead || Math.hypot(a.pos.x - x, a.pos.z - z) > radius) continue;
      if (a.spec.temper === 'passive') a.aggro = 8;
    }
    for (const n of this.npcs) {
      if (n.dead || Math.hypot(n.pos.x - x, n.pos.z - z) > radius) continue;
      n.lastSeen = { x, z };
      if (n.state === 'patrol') n.setState('search');
    }
  }

  update(dt) {
    const p = this.game.player.position;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 2.5;
      this.populateAnimals();
    }
    if (this.game.sky.isNight()) {
      this.howlTimer -= dt;
      if (this.howlTimer <= 0) {
        this.howlTimer = randRange(40, 90);
        const wolf = this.animals.find((a) => a.species === 'wolf' && !a.dead);
        if (wolf) this.game.audio.play('wolf_howl', { x: wolf.pos.x, y: wolf.pos.y, z: wolf.pos.z, range: 260, falloff: 60, volume: 0.7 });
      }
    }

    for (let i = this.animals.length - 1; i >= 0; i--) {
      const a = this.animals[i];
      const d = Math.hypot(a.pos.x - p.x, a.pos.z - p.z);
      if (!a.dead && d > DESPAWN_DISTANCE) {
        this.removeAnimal(a);
        continue;
      }
      // Far-away animals think less often.
      if (d > 120 && !a.dead) {
        a.farTick = (a.farTick ?? 0) + dt;
        if (a.farTick < 0.25) continue;
        a.update(a.farTick);
        a.farTick = 0;
      } else {
        a.update(dt);
      }
    }

    for (let i = this.npcs.length - 1; i >= 0; i--) this.npcs[i].update(dt);
    for (const slot of this.npcSlots) {
      if (slot.npc && !slot.npc.dead) continue;
      slot.timer -= dt;
      if (slot.timer <= 0 && Math.hypot(slot.spawn.x - p.x, slot.spawn.z - p.z) > 60) this.spawnNPC(slot);
    }

    for (let i = this.drops.length - 1; i >= 0; i--) this.drops[i].update(dt);
    for (let i = this.containers.length - 1; i >= 0; i--) this.containers[i].update(dt);
  }

  serialize() {
    return {
      drops: this.drops.map((d) => d.serialize()),
      containers: this.containers.filter((c) => c.persist).map((c) => c.serialize()),
    };
  }

  load(data) {
    for (const d of data?.drops ?? []) {
      const drop = this.dropItem(d.item, { x: d.x, y: d.y + 0.2, z: d.z }, { x: 0, y: 0, z: 0 });
      drop.lifetime = d.life ?? 600;
    }
    for (const c of data?.containers ?? []) {
      this.spawnContainer({
        name: c.name,
        model: c.model,
        size: c.items.length,
        items: c.items.filter(Boolean),
        x: c.x,
        y: c.y + 0.2,
        z: c.z,
        rot: c.rot,
        lifetime: c.life ?? Infinity,
        persist: true,
      });
    }
  }
}
