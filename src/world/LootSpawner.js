import * as THREE from '../lib/three.js';
import { part, mergeGeometries } from '../core/GeometryUtils.js';
import { rollLoot } from '../items/LootTables.js';
import { createItem } from '../inventory/ItemContainer.js';

// Breakable barrels and openable crates at fixed spots. Each spot refills on a
// timer after it has been looted.

const BARREL_RESPAWN = 360;
const CRATE_RESPAWN = 600;

const barrelGeometries = {};
const barrelMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });

function barrelGeometry(color) {
  barrelGeometries[color] ??= mergeGeometries([
    part(new THREE.CylinderGeometry(0.4, 0.4, 1.0, 12), color, { y: 0.5 }),
    part(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 12), '#2a2a28', { y: 0.2 }),
    part(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 12), '#2a2a28', { y: 0.8 }),
    part(new THREE.CylinderGeometry(0.36, 0.36, 0.02, 12), '#3a3a36', { y: 1.0 }),
  ]);
  return barrelGeometries[color];
}

class Barrel {
  constructor(spawner, spot) {
    const game = spawner.game;
    this.game = game;
    this.spawner = spawner;
    this.spot = spot;
    this.kind = 'barrel';
    this.name = 'Barrel';
    this.hp = 25;
    this.broken = false;
    const y = spot.y ?? game.terrain.getHeight(spot.x, spot.z);
    this.y = y;
    this.mesh = new THREE.Mesh(barrelGeometry(Math.random() < 0.5 ? '#2f5f8a' : '#8a4a2a'), barrelMaterial);
    this.mesh.position.set(spot.x, y - 0.02, spot.z);
    this.mesh.rotation.y = Math.random() * Math.PI;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    game.scene.add(this.mesh);
    this.collider = game.physics.add({ shape: 'cyl', x: spot.x, z: spot.z, r: 0.42, y0: y, y1: y + 1.02, layer: 'loot', solid: true, owner: this });
  }

  onMeleeHit(ctx) {
    this.takeDamage({ damage: ctx.tool.melee.damage, point: ctx.point });
    return { material: 'metal', damaged: true };
  }

  takeDamage(ctx) {
    if (this.broken) return { killed: false };
    this.hp -= ctx.damage;
    this.game.audio.play('hit_metal', { x: this.spot.x, y: this.y + 0.5, z: this.spot.z, volume: 0.7 });
    this.mesh.rotation.z = (Math.random() - 0.5) * 0.08;
    if (this.hp > 0) return { killed: false };
    this.break();
    return { killed: true };
  }

  break() {
    this.broken = true;
    const { game, spot } = this;
    game.audio.play('barrel_break', { x: spot.x, y: this.y + 0.5, z: spot.z });
    game.effects.burst(spot.x, this.y + 0.6, spot.z, { count: 16, color: 0x5a5a52, speed: 4, size: 0.1, life: 0.9 });
    for (const loot of rollLoot('barrel')) {
      game.entities.dropItem(createItem(loot.id, loot.qty), { x: spot.x, y: this.y + 0.8, z: spot.z });
    }
    game.stats.barrels += 1;
    this.remove();
    spot.timer = BARREL_RESPAWN;
  }

  remove() {
    this.game.scene.remove(this.mesh);
    this.game.physics.remove(this.collider);
    this.spot.entity = null;
  }
}

export class LootSpawner {
  constructor(game) {
    this.game = game;
    this.barrelSpots = [];
    this.crateSpots = [];
    this.timer = 0;
  }

  init(barrelSpots, crateSpots, sites) {
    this.barrelSpots = barrelSpots.map((s) => ({ ...s, entity: null, timer: 0 }));
    this.crateSpots = crateSpots.map((s) => ({ ...s, entity: null, timer: 0 }));
    for (const site of sites) {
      for (const b of site.barrels) this.barrelSpots.push({ ...b, entity: null, timer: 0 });
      for (const c of site.crates) this.crateSpots.push({ ...c, entity: null, timer: 0 });
    }
    for (const s of this.barrelSpots) this.spawnBarrel(s);
    for (const s of this.crateSpots) this.spawnCrate(s);
  }

  spawnBarrel(spot) {
    spot.entity = new Barrel(this, spot);
  }

  spawnCrate(spot) {
    const military = spot.table === 'military_crate';
    spot.entity = this.game.entities.spawnContainer({
      name: military ? 'Military Crate' : 'Wooden Crate',
      model: military ? 'military' : 'crate',
      size: 12,
      items: rollLoot(spot.table),
      x: spot.x,
      y: (spot.y ?? this.game.terrain.getHeight(spot.x, spot.z)) + 0.3,
      z: spot.z,
      rot: spot.rot ?? 0,
      removeWhenEmpty: true,
      onRemoved: () => {
        spot.entity = null;
        spot.timer = CRATE_RESPAWN;
      },
    });
  }

  update(dt) {
    this.timer += dt;
    if (this.timer < 1) return;
    const step = this.timer;
    this.timer = 0;
    const p = this.game.player.position;
    const far = (s) => Math.hypot(s.x - p.x, s.z - p.z) > 30;
    for (const s of this.barrelSpots) {
      if (s.entity) continue;
      s.timer -= step;
      if (s.timer <= 0 && far(s)) this.spawnBarrel(s);
    }
    for (const s of this.crateSpots) {
      if (s.entity) continue;
      s.timer -= step;
      if (s.timer <= 0 && far(s)) this.spawnCrate(s);
    }
  }
}
