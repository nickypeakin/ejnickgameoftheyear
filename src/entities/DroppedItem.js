import * as THREE from '../lib/three.js';
import { ITEMS } from '../items/ItemDatabase.js';
import { getIcon } from '../items/IconRenderer.js';

// A single item stack lying on the ground, shown as a small pouch with the item's
// icon floating above it.

const CATEGORY_COLORS = {
  resources: '#8a7350',
  components: '#6c6f73',
  tools: '#7a5230',
  weapons: '#5a5e62',
  ammo: '#9a7a3a',
  medical: '#d8d2c4',
  food: '#9c4a3a',
  items: '#6b4a2b',
  construction: '#2f5a86',
  attire: '#5a4a3a',
};

const pouchGeometry = new THREE.BoxGeometry(0.26, 0.18, 0.26);
const pouchMaterials = {};
const iconMaterials = {};
const loader = new THREE.TextureLoader();

function iconMaterial(id) {
  if (!iconMaterials[id]) {
    const tex = loader.load(getIcon(id));
    tex.colorSpace = THREE.SRGBColorSpace;
    iconMaterials[id] = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  }
  return iconMaterials[id];
}

export class DroppedItem {
  constructor(game, item, x, y, z, vx = 0, vy = 0, vz = 0) {
    this.game = game;
    this.kind = 'drop';
    this.item = { ...item };
    this.removed = false;
    this.lifetime = 600;
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3(vx, vy, vz);
    this.resting = false;
    this.t = Math.random() * 10;

    const category = ITEMS[item.id]?.category ?? 'resources';
    pouchMaterials[category] ??= new THREE.MeshLambertMaterial({ color: CATEGORY_COLORS[category] ?? '#8a7350' });
    this.group = new THREE.Group();
    const pouch = new THREE.Mesh(pouchGeometry, pouchMaterials[category]);
    pouch.position.y = 0.09;
    pouch.castShadow = true;
    this.icon = new THREE.Sprite(iconMaterial(item.id));
    this.icon.scale.setScalar(0.38);
    this.icon.position.y = 0.45;
    this.group.add(pouch, this.icon);
    this.group.position.copy(this.pos);
    game.scene.add(this.group);
    this.collider = game.physics.add({ shape: 'cyl', x, z, r: 0.38, y0: y - 0.1, y1: y + 0.65, layer: 'drop', solid: false, owner: this });
  }

  get label() {
    const def = ITEMS[this.item.id];
    return this.item.qty > 1 ? `${def.name} ×${this.item.qty}` : def.name;
  }

  getInteraction() {
    if (this.removed) return null;
    return { label: `Pick up ${this.label}`, action: () => this.pickup() };
  }

  pickup() {
    const added = this.game.player.inventory.addItem(this.item);
    if (added <= 0) {
      this.game.hud.flashHint('Inventory full');
      return;
    }
    this.game.audio.play('pickup');
    this.item.qty -= added;
    if (this.item.qty <= 0) this.remove();
  }

  update(dt) {
    this.lifetime -= dt;
    if (this.lifetime <= 0) {
      this.remove();
      return;
    }
    this.t += dt;
    if (!this.resting) {
      this.vel.y -= 18 * dt;
      this.pos.addScaledVector(this.vel, dt);
      const ground = this.game.physics.getGroundHeight(this.pos.x, this.pos.z, this.pos.y + 0.3, 0.6, 0.2);
      const floor = Math.max(ground, this.pos.y < 0 ? -0.4 : -Infinity);
      if (this.pos.y <= floor) {
        this.pos.y = floor;
        this.resting = true;
      }
      this.group.position.copy(this.pos);
      Object.assign(this.collider, { x: this.pos.x, z: this.pos.z, y0: this.pos.y - 0.1, y1: this.pos.y + 0.65 });
      this.game.physics.move(this.collider);
    }
    this.icon.position.y = 0.45 + Math.sin(this.t * 2.2) * 0.04;
  }

  remove() {
    if (this.removed) return;
    this.removed = true;
    this.game.scene.remove(this.group);
    this.game.physics.remove(this.collider);
    this.game.entities.removeDrop(this);
  }

  serialize() {
    return { item: this.item, x: this.pos.x, y: this.pos.y, z: this.pos.z, life: Math.round(this.lifetime) };
  }
}
