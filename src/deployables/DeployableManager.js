import * as THREE from '../lib/three.js';
import { buildDeployableModel } from './DeployableModels.js';
import { ItemContainer, createItem } from '../inventory/ItemContainer.js';
import { ITEMS } from '../items/ItemDatabase.js';
import { recycleOutput, canRecycle } from '../items/Recipes.js';

// Placeable objects: campfires and furnaces (ovens), storage boxes, sleeping bags,
// the workbench, and the fixed recyclers found at monuments.

export const DEPLOYABLES = {
  campfire: { name: 'Campfire', item: 'campfire', w: 1.2, d: 1.2, h: 0.5, solid: false, oven: 'campfire' },
  furnace: { name: 'Furnace', item: 'furnace', w: 1.2, d: 1.2, h: 1.9, solid: true, oven: 'furnace' },
  wooden_box: { name: 'Wood Storage Box', item: 'wooden_box', w: 1.0, d: 0.62, h: 0.62, solid: true, storage: 18 },
  sleeping_bag: { name: 'Sleeping Bag', item: 'sleeping_bag', w: 0.9, d: 1.95, h: 0.2, solid: false },
  workbench: { name: 'Workbench Level 1', item: 'workbench_1', w: 2.0, d: 1.0, h: 1.0, solid: true, workbench: 1 },
  recycler: { name: 'Recycler', item: null, w: 1.8, d: 1.4, h: 1.7, solid: true, fixed: true },
};

const OVEN_SPEED = { campfire: { fuel: 5, speed: 1 }, furnace: { fuel: 2.5, speed: 1 } };
const RECYCLE_TIME = 3;

class Oven {
  constructor(manager, dep, kind) {
    this.manager = manager;
    this.dep = dep;
    this.kind = kind;
    this.container = new ItemContainer(6, {
      name: dep.def.name,
      filter: (item, i) => (i === 0 ? Boolean(ITEMS[item.id]?.fuel) : true),
    });
    this.on = false;
    this.burn = 0;
    this.progress = new Array(6).fill(0);
  }

  toggle() {
    if (!this.on) {
      if (!this.container.get(0)) {
        this.manager.game.hud.flashHint('Put wood in the fuel slot first');
        return;
      }
      this.on = true;
      this.manager.game.audio.play('fire_light', { x: this.dep.x, y: this.dep.y, z: this.dep.z });
    } else {
      this.on = false;
    }
    this.container.changed();
  }

  output(id, qty) {
    return this.container.add(createItem(id, qty), { from: 1, to: 5, force: true }) === 0;
  }

  update(dt) {
    if (!this.on) return;
    const cfg = OVEN_SPEED[this.kind];
    let changed = false;
    if (this.burn <= 0) {
      const fuel = this.container.get(0);
      if (!fuel) {
        this.on = false;
        this.container.changed();
        return;
      }
      fuel.qty -= 1;
      if (fuel.qty <= 0) this.container.slots[0] = null;
      this.burn += cfg.fuel;
      if (Math.random() < 0.75) this.output('charcoal', 1);
      changed = true;
    }
    this.burn -= dt;
    // Every slot cooks in parallel, which is why splitting ore across slots is faster.
    for (let i = 1; i < 6; i++) {
      const s = this.container.get(i);
      const cook = s && ITEMS[s.id].cook;
      if (!cook || !cook.ovens.includes(this.kind)) {
        this.progress[i] = 0;
        continue;
      }
      this.progress[i] += dt * cfg.speed;
      if (this.progress[i] < cook.time) continue;
      if (this.container.spaceFor(cook.to, { from: 1, to: 5 }) <= 0 && s.qty > 1) {
        this.progress[i] = cook.time;
        continue;
      }
      this.progress[i] -= cook.time;
      s.qty -= 1;
      if (s.qty <= 0) this.container.slots[i] = null;
      this.output(cook.to, 1);
      changed = true;
    }
    if (changed) this.container.changed();
  }

  serialize() {
    return { items: this.container.serialize(), on: this.on, burn: this.burn };
  }

  load(data) {
    this.container.load(data.items);
    this.on = Boolean(data.on);
    this.burn = data.burn ?? 0;
  }
}

class Recycler {
  constructor(manager, dep) {
    this.manager = manager;
    this.dep = dep;
    this.container = new ItemContainer(12, {
      name: 'Recycler',
      filter: (item, i) => i < 6 && canRecycle(item.id),
    });
    this.on = false;
    this.timer = 0;
  }

  hasInput() {
    for (let i = 0; i < 6; i++) if (this.container.get(i)) return true;
    return false;
  }

  toggle() {
    if (!this.on && !this.hasInput()) {
      this.manager.game.hud.flashHint('Put components or crafted items in the input slots');
      return;
    }
    this.on = !this.on;
    this.timer = 0;
    this.container.changed();
  }

  update(dt) {
    if (!this.on) return;
    this.timer += dt;
    if (this.timer < RECYCLE_TIME) return;
    this.timer = 0;
    let slot = -1;
    for (let i = 0; i < 6; i++) {
      if (this.container.get(i)) {
        slot = i;
        break;
      }
    }
    if (slot < 0) {
      this.on = false;
      this.container.changed();
      return;
    }
    const item = this.container.get(slot);
    const out = recycleOutput(item.id) ?? {};
    for (const [id, qty] of Object.entries(out)) {
      if (this.container.spaceFor(id, { from: 6, to: 11 }) < qty) {
        this.on = false;
        this.manager.game.hud.flashHint('Recycler output is full');
        this.container.changed();
        return;
      }
    }
    item.qty -= 1;
    if (item.qty <= 0) this.container.slots[slot] = null;
    for (const [id, qty] of Object.entries(out)) this.container.add(createItem(id, qty), { from: 6, to: 11, force: true });
    const d = this.dep;
    this.manager.game.audio.play('recycler', { x: d.x, y: d.y + 1, z: d.z });
    this.container.changed();
  }

  serialize() {
    return { items: this.container.serialize(), on: this.on };
  }
}

export class DeployableManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.nextId = 1;
    this.ghostMaterial = new THREE.MeshBasicMaterial({ color: 0x5fd06a, transparent: true, opacity: 0.4, depthWrite: false });
    this.ghosts = {};
    this.activeGhost = null;
    this.placement = null;
    this.flicker = 0;
  }

  footprint(type, rot) {
    const def = DEPLOYABLES[type];
    return rot % 2 ? { w: def.d, d: def.w } : { w: def.w, d: def.d };
  }

  ghostFor(type) {
    if (!this.ghosts[type]) {
      const g = buildDeployableModel(type);
      g.traverse((o) => {
        if (o.isMesh) {
          o.material = this.ghostMaterial;
          o.castShadow = false;
          o.visible = true;
        }
      });
      g.visible = false;
      g.renderOrder = 5;
      this.game.scene.add(g);
      this.ghosts[type] = g;
    }
    return this.ghosts[type];
  }

  hideGhost() {
    if (this.activeGhost) this.activeGhost.visible = false;
    this.activeGhost = null;
    this.placement = null;
  }

  validate(type, x, y, z, rot) {
    const game = this.game;
    const def = DEPLOYABLES[type];
    const { w, d } = this.footprint(type, rot);
    if (game.monuments.siteAt(x, z, 8)) return 'Cannot place inside a monument';
    if (y < 0.15) return 'Cannot place in water';
    const corners = [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]];
    for (const [cx, cz] of corners) {
      const g = game.physics.getGroundHeight(x + cx, z + cz, y + 0.35, 0.7, 0.1);
      if (Math.abs(g - y) > 0.4) return 'Ground is too uneven';
    }
    const blocker = game.physics.boxBlocked(x - w / 2 + 0.05, y + 0.06, z - d / 2 + 0.05, x + w / 2 - 0.05, y + def.h, z + d / 2 - 0.05);
    if (blocker) return blocker.layer === 'player' ? 'You are in the way' : 'Something is in the way';
    // Non-solid deployables (campfires, bags) still claim their footprint.
    for (const other of this.list) {
      const c = other.collider;
      if (c.maxX <= x - w / 2 || c.minX >= x + w / 2 || c.maxZ <= z - d / 2 || c.minZ >= z + d / 2) continue;
      if (c.maxY <= y + 0.05 || c.minY >= y + def.h) continue;
      return 'Something is in the way';
    }
    return null;
  }

  updatePlacement(type, rot) {
    const game = this.game;
    const o = game.camera.position;
    const dir = game.player.lookDir;
    const hit = game.physics.raycast(o.x, o.y, o.z, dir.x, dir.y, dir.z, 5, { ignore: game.player.collider, filter: (c) => c.solid });
    const ghost = this.ghostFor(type);
    if (this.activeGhost && this.activeGhost !== ghost) this.activeGhost.visible = false;
    this.activeGhost = ghost;
    if (!hit || hit.ny < 0.7) {
      ghost.visible = false;
      this.placement = { type, error: 'Aim at flat ground or a floor' };
      return this.placement;
    }
    const error = this.validate(type, hit.x, hit.y, hit.z, rot);
    ghost.position.set(hit.x, hit.y, hit.z);
    ghost.rotation.y = rot * (Math.PI / 2);
    ghost.visible = true;
    this.ghostMaterial.color.set(error ? 0xd8483c : 0x5fd06a);
    this.placement = { type, x: hit.x, y: hit.y, z: hit.z, rot, error };
    return this.placement;
  }

  place() {
    const pl = this.placement;
    if (!pl || pl.error || pl.x === undefined) {
      this.game.hud.flashHint(pl?.error ?? 'Cannot place here');
      return false;
    }
    this.spawn(pl.type, pl.x, pl.y, pl.z, pl.rot);
    this.game.audio.play('deploy', { x: pl.x, y: pl.y, z: pl.z });
    return true;
  }

  spawn(type, x, y, z, rot = 0, state = null) {
    const def = DEPLOYABLES[type];
    const dep = { id: this.nextId++, kind: 'deployable', type, def, x, y, z, rot, removed: false };
    dep.group = buildDeployableModel(type);
    dep.group.position.set(x, y, z);
    dep.group.rotation.y = rot * (Math.PI / 2);
    this.game.scene.add(dep.group);
    const { w, d } = this.footprint(type, rot);
    dep.collider = this.game.physics.add({
      shape: 'box',
      minX: x - w / 2, maxX: x + w / 2, minY: y, maxY: y + def.h, minZ: z - d / 2, maxZ: z + d / 2,
      layer: 'deployable', solid: def.solid, owner: dep,
    });
    if (def.oven) dep.oven = new Oven(this, dep, def.oven);
    if (def.storage) dep.container = new ItemContainer(def.storage, { name: def.name });
    if (type === 'recycler') dep.recycler = new Recycler(this, dep);
    if (type === 'sleeping_bag') dep.cooldown = 0;
    if (state) {
      if (dep.oven && state.oven) dep.oven.load(state.oven);
      if (dep.container && state.items) dep.container.load(state.items);
      if (dep.recycler && state.items) dep.recycler.container.load(state.items);
    }
    dep.getInteraction = () => this.interactionFor(dep);
    this.list.push(dep);
    return dep;
  }

  interactionFor(dep) {
    const ui = this.game.ui;
    switch (dep.type) {
      case 'campfire':
      case 'furnace':
        return { label: `Open ${dep.def.name}`, action: () => ui.openContainer({ title: dep.def.name, container: dep.oven.container, kind: 'oven', target: dep }) };
      case 'wooden_box':
        return { label: 'Open Storage Box', action: () => ui.openContainer({ title: dep.def.name, container: dep.container, kind: 'storage', target: dep }) };
      case 'recycler':
        return { label: 'Use Recycler', action: () => ui.openContainer({ title: 'Recycler', container: dep.recycler.container, kind: 'recycler', target: dep }) };
      case 'workbench':
        return { label: 'Open Crafting', action: () => ui.openInventory('craft') };
      case 'sleeping_bag':
        return { label: 'Sleeping Bag', sub: 'Respawn point', action: null };
      default:
        return null;
    }
  }

  contentsOf(dep) {
    if (dep.oven) return dep.oven.container;
    if (dep.recycler) return dep.recycler.container;
    return dep.container ?? null;
  }

  pickup(dep) {
    if (dep.def.fixed) return;
    const contents = this.contentsOf(dep);
    if (contents && !contents.isEmpty()) {
      this.game.hud.flashHint('Empty it before picking it up');
      return;
    }
    this.remove(dep);
    this.game.player.inventory.give(dep.def.item, 1);
  }

  remove(dep, { spill = false } = {}) {
    if (dep.removed) return;
    dep.removed = true;
    if (spill) {
      const contents = this.contentsOf(dep);
      if (contents && !contents.isEmpty()) {
        this.game.entities.spawnContainer({ name: `${dep.def.name} Contents`, model: 'bag', size: contents.size, items: contents.items(), x: dep.x, y: dep.y + 0.5, z: dep.z, lifetime: 900, persist: true });
      }
    }
    this.game.scene.remove(dep.group);
    this.game.physics.remove(dep.collider);
    const i = this.list.indexOf(dep);
    if (i >= 0) this.list.splice(i, 1);
    if (this.game.ui.openTarget === dep) this.game.ui.closeAll();
  }

  // Destroy deployables left floating after the building under them was removed.
  checkSupport() {
    for (const dep of [...this.list]) {
      if (dep.def.fixed) continue;
      const ground = this.game.physics.getGroundHeight(dep.x, dep.z, dep.y + 0.1, 0.25, 0.4);
      if (ground < dep.y - 0.3) this.remove(dep, { spill: true });
    }
  }

  workbenchLevelAt(pos) {
    let level = 0;
    for (const dep of this.list) {
      if (!dep.def.workbench) continue;
      if (Math.hypot(dep.x - pos.x, dep.y - pos.y, dep.z - pos.z) < 4.5) level = Math.max(level, dep.def.workbench);
    }
    return level;
  }

  warmthAt(pos) {
    let warmth = 0;
    for (const dep of this.list) {
      if (!dep.oven?.on) continue;
      const d = Math.hypot(dep.x - pos.x, dep.y - pos.y, dep.z - pos.z);
      const radius = dep.type === 'campfire' ? 5 : 4;
      if (d < radius) warmth = Math.max(warmth, (dep.type === 'campfire' ? 18 : 12) * (1 - d / radius));
    }
    return warmth;
  }

  sleepingBags() {
    return this.list.filter((d) => d.type === 'sleeping_bag');
  }

  update(dt) {
    this.flicker += dt;
    const p = this.game.player.position;
    const fires = [];
    for (const dep of this.list) {
      dep.oven?.update(dt);
      dep.recycler?.update(dt);
      if (dep.cooldown > 0) dep.cooldown -= dt;
      const flame = dep.group.userData.flame;
      if (flame) {
        const lit = Boolean(dep.oven?.on);
        flame.visible = lit;
        if (lit) {
          const s = 0.85 + Math.sin(this.flicker * 17 + dep.id) * 0.1 + Math.sin(this.flicker * 29 + dep.id * 3) * 0.06;
          flame.scale.set(1, s, 1);
          fires.push({ dep, d: Math.hypot(dep.x - p.x, dep.z - p.z) });
          // Standing in a lit campfire burns.
          if (dep.type === 'campfire' && Math.hypot(dep.x - p.x, dep.z - p.z) < 0.55 && Math.abs(dep.y - p.y) < 0.6) {
            this.game.player.takeDamage(4 * dt, { cause: 'Burned to death', silent: true });
          }
        }
      }
    }
    fires.sort((a, b) => a.d - b.d);
    const lights = this.game.effects.fireLights;
    lights.forEach((light, i) => {
      const f = fires[i];
      if (!f) {
        light.intensity = 0;
        return;
      }
      const isCampfire = f.dep.type === 'campfire';
      light.position.set(f.dep.x, f.dep.y + (isCampfire ? 0.6 : 0.7), f.dep.z);
      const base = isCampfire ? 9 : 5;
      light.intensity = base * (0.85 + Math.sin(this.flicker * 13 + i) * 0.1 + Math.random() * 0.08);
    });
  }

  serialize() {
    return this.list
      .filter((d) => !d.def.fixed)
      .map((d) => ({
        type: d.type,
        x: d.x,
        y: d.y,
        z: d.z,
        rot: d.rot,
        oven: d.oven?.serialize(),
        items: d.container?.serialize(),
      }));
  }

  load(data) {
    for (const d of data ?? []) {
      if (!DEPLOYABLES[d.type]) continue;
      this.spawn(d.type, d.x, d.y, d.z, d.rot, d);
    }
  }
}
