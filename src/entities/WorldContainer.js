import * as THREE from '../lib/three.js';
import { ItemContainer, createItem } from '../inventory/ItemContainer.js';
import { part, mergeGeometries, worldBox } from '../core/GeometryUtils.js';
import { getTexture } from '../core/Textures.js';

// Lootable containers that live in the world: loot crates, scientist loot bags and
// the backpack the player drops on death.

const SHAPES = {
  bag: { solid: false, w: 0.6, h: 0.55, d: 0.6 },
  backpack: { solid: false, w: 0.7, h: 0.6, d: 0.5 },
  crate: { solid: true, w: 1.25, h: 0.8, d: 0.85 },
  military: { solid: true, w: 1.45, h: 0.75, d: 0.85 },
};

const geometryCache = {};
const materialCache = {};

function modelFor(model) {
  if (model === 'crate') {
    materialCache.crate ??= new THREE.MeshLambertMaterial({ map: getTexture('planks'), color: '#c8a070' });
    geometryCache.crate ??= mergeGeometries([worldBox(1.25, 0.8, 0.85, 0, 0.4, 0, 0.8)]);
    return new THREE.Mesh(geometryCache.crate, materialCache.crate);
  }
  materialCache.vc ??= new THREE.MeshLambertMaterial({ vertexColors: true });
  if (!geometryCache[model]) {
    if (model === 'military') {
      geometryCache.military = mergeGeometries([
        part(new THREE.BoxGeometry(1.45, 0.6, 0.85), '#4a5a36', { y: 0.3 }),
        part(new THREE.BoxGeometry(1.5, 0.15, 0.9), '#3a4729', { y: 0.67 }),
        part(new THREE.BoxGeometry(0.12, 0.62, 0.88), '#2c3520', { x: -0.45, y: 0.31 }),
        part(new THREE.BoxGeometry(0.12, 0.62, 0.88), '#2c3520', { x: 0.45, y: 0.31 }),
        part(new THREE.BoxGeometry(0.3, 0.1, 0.05), '#c9b04a', { y: 0.45, z: 0.44 }),
      ]);
    } else if (model === 'backpack') {
      geometryCache.backpack = mergeGeometries([
        part(new THREE.BoxGeometry(0.55, 0.5, 0.35), '#4c5a3a', { y: 0.25 }),
        part(new THREE.BoxGeometry(0.57, 0.18, 0.37), '#3c4a2c', { y: 0.45 }),
        part(new THREE.BoxGeometry(0.4, 0.22, 0.1), '#3c4a2c', { y: 0.2, z: 0.2 }),
      ]);
    } else {
      geometryCache.bag = mergeGeometries([
        part(new THREE.DodecahedronGeometry(0.32, 0), '#8a7350', { y: 0.26, sy: 0.85 }),
        part(new THREE.CylinderGeometry(0.08, 0.12, 0.15, 6), '#6d5a3c', { y: 0.55 }),
      ]);
    }
  }
  return new THREE.Mesh(geometryCache[model], materialCache.vc);
}

export class WorldContainer {
  constructor(game, {
    name,
    size = 12,
    items = [],
    model = 'bag',
    x, y, z,
    rot = 0,
    lifetime = Infinity,
    removeWhenEmpty = true,
    persist = false,
    onRemoved = null,
  }) {
    this.game = game;
    this.kind = 'container';
    this.name = name;
    this.model = model;
    this.persist = persist;
    this.lifetime = lifetime;
    this.removeWhenEmpty = removeWhenEmpty;
    this.onRemoved = onRemoved;
    this.removed = false;
    this.container = new ItemContainer(size, { name, filter: () => false });
    for (const it of items) this.container.add(it.cond !== undefined || it.ammo !== undefined ? it : createItem(it.id, it.qty), { force: true });

    const shape = SHAPES[model];
    const ground = game.physics.getGroundHeight(x, z, y + 0.5, 1.5, 0.3);
    this.x = x;
    this.y = Math.max(ground, game.terrain.getHeight(x, z)) + 0.01;
    this.z = z;
    this.rot = rot;
    this.mesh = modelFor(model);
    this.mesh.position.set(x, this.y, z);
    this.mesh.rotation.y = rot;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    game.scene.add(this.mesh);

    // Colliders are axis aligned; crates use the larger footprint so any rotation is covered.
    const half = Math.max(shape.w, shape.d) / 2;
    this.collider = shape.solid
      ? game.physics.add({ shape: 'box', minX: x - half * 0.85, minY: this.y, minZ: z - half * 0.85, maxX: x + half * 0.85, maxY: this.y + shape.h, maxZ: z + half * 0.85, layer: 'container', solid: true, owner: this })
      : game.physics.add({ shape: 'cyl', x, z, r: 0.42, y0: this.y - 0.1, y1: this.y + shape.h + 0.1, layer: 'container', solid: false, owner: this });
  }

  getInteraction() {
    if (this.removed) return null;
    return {
      label: `Open ${this.name}`,
      action: () => {
        this.game.audio.play('crate_open', { x: this.x, y: this.y, z: this.z });
        this.game.ui.openContainer({ title: this.name, container: this.container, kind: 'loot', target: this });
      },
    };
  }

  onClosed() {
    if (this.removeWhenEmpty && this.container.isEmpty()) this.remove();
  }

  update(dt) {
    if (this.lifetime === Infinity) return;
    this.lifetime -= dt;
    if (this.lifetime <= 0 && this.game.ui.openTarget !== this) this.remove();
  }

  remove() {
    if (this.removed) return;
    this.removed = true;
    this.game.scene.remove(this.mesh);
    this.game.physics.remove(this.collider);
    this.game.entities.removeContainer(this);
    this.onRemoved?.(this);
  }

  serialize() {
    return {
      name: this.name,
      model: this.model,
      x: this.x,
      y: this.y,
      z: this.z,
      rot: this.rot,
      life: Number.isFinite(this.lifetime) ? Math.round(this.lifetime) : null,
      items: this.container.serialize(),
    };
  }
}
