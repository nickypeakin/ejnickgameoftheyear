import * as THREE from '../lib/three.js';
import { part, mergeGeometries, jitterColors } from '../core/GeometryUtils.js';
import { makeYields, harvest, yieldFraction } from '../items/Harvest.js';
import { itemName } from '../items/ItemDatabase.js';

// Harvestable world nodes. Each type is drawn with one InstancedMesh; a node hides
// its instance when exhausted and comes back after its respawn time.

export const NODE_TYPES = {
  pine: { kind: 'tree', gather: 'tree', yields: [['wood', 300]], radius: 0.32, height: 9, respawn: 480 },
  oak: { kind: 'tree', gather: 'tree', yields: [['wood', 400]], radius: 0.42, height: 8, respawn: 480 },
  birch: { kind: 'tree', gather: 'tree', yields: [['wood', 220]], radius: 0.24, height: 9, respawn: 420 },
  stone_node: { kind: 'ore', gather: 'ore', yields: [['stone', 300]], radius: 1.15, respawn: 600 },
  metal_node: { kind: 'ore', gather: 'ore', yields: [['metal_ore', 200], ['stone', 80]], radius: 1.15, respawn: 720 },
  sulfur_node: { kind: 'ore', gather: 'ore', yields: [['sulfur_ore', 200]], radius: 1.15, respawn: 720 },
  hemp: { kind: 'pickup', gives: [['cloth', 10]], label: 'Hemp', radius: 0.45, height: 1.3, respawn: 300 },
  loose_stone: { kind: 'pickup', gives: [['stone', 25]], label: 'Stone', radius: 0.45, height: 0.5, respawn: 300 },
  wood_pile: { kind: 'pickup', gives: [['wood', 25]], label: 'Wood Pile', radius: 0.6, height: 0.6, respawn: 300 },
  metal_pickup: { kind: 'pickup', gives: [['metal_ore', 15]], label: 'Metal Ore', radius: 0.45, height: 0.5, respawn: 420 },
  sulfur_pickup: { kind: 'pickup', gives: [['sulfur_ore', 15]], label: 'Sulfur Ore', radius: 0.45, height: 0.5, respawn: 420 },
  mushroom: { kind: 'pickup', gives: [['mushroom', 1]], label: 'Mushroom', radius: 0.4, height: 0.4, respawn: 300 },
  berry_bush: { kind: 'pickup', gives: [['blueberries', 2]], label: 'Blueberry Bush', radius: 0.7, height: 1.1, respawn: 360 },
};

function oreRock(base, accent) {
  const parts = [
    part(new THREE.DodecahedronGeometry(1.2, 0), base, { y: 0.35, sy: 0.72, ry: 0.4 }),
    part(new THREE.DodecahedronGeometry(0.62, 0), base, { x: 0.9, y: 0.2, z: 0.4, sy: 0.8 }),
    part(new THREE.DodecahedronGeometry(0.5, 0), base, { x: -0.8, y: 0.15, z: -0.5, sy: 0.7 }),
  ];
  if (accent) {
    const spots = [[0.5, 0.9, 0.55], [-0.6, 0.75, 0.4], [0.1, 1.05, -0.5], [0.85, 0.45, -0.6], [-0.3, 0.5, 0.95], [1.2, 0.3, 0.6]];
    for (const [x, y, z] of spots) parts.push(part(new THREE.OctahedronGeometry(0.26, 0), accent, { x, y, z, rx: x, ry: z }));
  }
  return parts;
}

function smallRock(base, accent) {
  const parts = [part(new THREE.DodecahedronGeometry(0.34, 0), base, { y: 0.1, sy: 0.6 })];
  if (accent) parts.push(part(new THREE.OctahedronGeometry(0.12, 0), accent, { x: 0.12, y: 0.22, z: 0.1 }));
  return parts;
}

const MODEL_BUILDERS = {
  pine() {
    return [
      part(new THREE.CylinderGeometry(0.18, 0.32, 3.4, 7), '#5a3d24', { y: 1.7 }),
      part(new THREE.ConeGeometry(2.1, 3.3, 8), '#2c4722', { y: 3.7 }),
      part(new THREE.ConeGeometry(1.65, 2.9, 8), '#32512a', { y: 5.4, ry: 0.3 }),
      part(new THREE.ConeGeometry(1.15, 2.5, 8), '#38592c', { y: 7.0, ry: 0.6 }),
      part(new THREE.ConeGeometry(0.6, 1.6, 7), '#3e6130', { y: 8.4 }),
    ];
  },
  oak() {
    return [
      part(new THREE.CylinderGeometry(0.28, 0.42, 3.8, 8), '#5b4128', { y: 1.9 }),
      part(new THREE.CylinderGeometry(0.1, 0.16, 1.8, 6), '#5b4128', { x: 0.6, y: 3.6, rz: -0.7 }),
      part(new THREE.CylinderGeometry(0.1, 0.16, 1.8, 6), '#5b4128', { x: -0.6, y: 3.5, rz: 0.7 }),
      part(new THREE.IcosahedronGeometry(2.3, 0), '#4b6a2c', { y: 5.3 }),
      part(new THREE.IcosahedronGeometry(1.6, 0), '#557632', { x: 1.6, y: 4.6, z: 0.6 }),
      part(new THREE.IcosahedronGeometry(1.7, 0), '#46632a', { x: -1.5, y: 4.8, z: -0.5 }),
      part(new THREE.IcosahedronGeometry(1.5, 0), '#5a7b34', { x: 0.3, y: 6.5, z: -0.4 }),
      part(new THREE.IcosahedronGeometry(1.4, 0), '#4f6e2e', { x: -0.4, y: 4.4, z: 1.5 }),
    ];
  },
  birch() {
    return [
      part(new THREE.CylinderGeometry(0.14, 0.24, 6.5, 7), '#ddd8cb', { y: 3.25 }),
      part(new THREE.CylinderGeometry(0.245, 0.245, 0.18, 7), '#3a3530', { y: 1.6 }),
      part(new THREE.CylinderGeometry(0.22, 0.22, 0.14, 7), '#3a3530', { y: 3.1 }),
      part(new THREE.IcosahedronGeometry(1.5, 0), '#7d9c3e', { y: 6.8 }),
      part(new THREE.IcosahedronGeometry(1.1, 0), '#86a545', { x: 0.9, y: 5.9, z: 0.3 }),
      part(new THREE.IcosahedronGeometry(1.0, 0), '#759437', { x: -0.8, y: 6.1, z: -0.4 }),
    ];
  },
  stone_node: () => oreRock('#8a857d'),
  metal_node: () => oreRock('#6c6762', '#c47a45'),
  sulfur_node: () => oreRock('#8f876a', '#e5cf4a'),
  hemp() {
    const parts = [];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const x = Math.cos(a) * 0.12;
      const z = Math.sin(a) * 0.12;
      parts.push(part(new THREE.CylinderGeometry(0.02, 0.03, 1.1, 4), '#6b8c3a', { x, y: 0.55, z, rz: x * 1.2, rx: z * 1.2 }));
      parts.push(part(new THREE.ConeGeometry(0.16, 0.45, 5), '#86ad47', { x: x * 2.2, y: 1.15, z: z * 2.2 }));
    }
    parts.push(part(new THREE.ConeGeometry(0.22, 0.4, 6), '#a3c35a', { y: 1.25 }));
    return parts;
  },
  loose_stone: () => smallRock('#8f8a82'),
  metal_pickup: () => smallRock('#6c6762', '#c47a45'),
  sulfur_pickup: () => smallRock('#8f876a', '#e5cf4a'),
  wood_pile() {
    return [
      part(new THREE.CylinderGeometry(0.12, 0.12, 1.1, 6), '#7a5230', { y: 0.12, z: -0.14, rz: Math.PI / 2 }),
      part(new THREE.CylinderGeometry(0.12, 0.12, 1.0, 6), '#86603a', { y: 0.12, z: 0.14, rz: Math.PI / 2 }),
      part(new THREE.CylinderGeometry(0.11, 0.11, 1.05, 6), '#6f4a2a', { y: 0.33, rz: Math.PI / 2 }),
    ];
  },
  mushroom() {
    const parts = [];
    for (const [x, z, s] of [[0, 0, 1], [0.18, 0.12, 0.7], [-0.14, 0.15, 0.6]]) {
      parts.push(part(new THREE.CylinderGeometry(0.035 * s, 0.045 * s, 0.24 * s, 5), '#ece4d2', { x, y: 0.12 * s, z }));
      parts.push(part(new THREE.SphereGeometry(0.13 * s, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), '#b8322a', { x, y: 0.22 * s, z }));
    }
    return parts;
  },
  berry_bush() {
    const parts = [
      part(new THREE.IcosahedronGeometry(0.6, 0), '#3f6b2a', { y: 0.55, sy: 0.85 }),
      part(new THREE.IcosahedronGeometry(0.42, 0), '#467530', { x: 0.4, y: 0.4, z: 0.2 }),
    ];
    for (const [x, y, z] of [[0.35, 0.8, 0.35], [-0.4, 0.6, 0.3], [0.1, 0.95, -0.35], [0.5, 0.45, -0.3], [-0.2, 0.4, 0.55]]) {
      parts.push(part(new THREE.SphereGeometry(0.07, 5, 4), '#3a4f9c', { x, y, z }));
    }
    return parts;
  },
};

const tmpMatrix = new THREE.Matrix4();
const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const tmpEuler = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

class ResourceNode {
  constructor(manager, index, type, x, y, z, rot, scale) {
    this.manager = manager;
    this.index = index;
    this.type = type;
    this.def = NODE_TYPES[type];
    this.kind = this.def.kind === 'pickup' ? 'pickup' : 'resource';
    this.x = x;
    this.y = y;
    this.z = z;
    this.rot = rot;
    this.scale = scale;
    this.alive = true;
    this.respawnTimer = 0;
    this.shake = 0;
    this.yields = this.def.yields ? makeYields(this.def.yields, scale) : null;
    this.instance = -1;
    this.collider = null;
  }

  get name() {
    if (this.def.kind === 'tree') return 'Tree';
    if (this.def.kind === 'ore') return this.yields[0].id === 'stone' ? 'Stone Node' : `${itemName(this.yields[0].id)} Node`;
    return this.def.label;
  }

  onMeleeHit(ctx) {
    return this.manager.gather(this, ctx);
  }

  getInteraction() {
    if (this.kind !== 'pickup') return null;
    return { label: `Pick up ${this.def.label}`, action: () => this.manager.pickup(this) };
  }
}

export class ResourceManager {
  constructor(game) {
    this.game = game;
    this.nodes = [];
    this.meshes = {};
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.geometries = {};
    this.falling = [];
    this.shaking = new Set();
  }

  // specs: [{ type, x, z, rot, scale }]
  build(specs) {
    const counts = {};
    for (const s of specs) counts[s.type] = (counts[s.type] ?? 0) + 1;
    for (const [type, count] of Object.entries(counts)) {
      const geometry = mergeGeometries(MODEL_BUILDERS[type]().map((g) => jitterColors(g, 0.06)));
      this.geometries[type] = geometry;
      const mesh = new THREE.InstancedMesh(geometry, this.material, count);
      mesh.frustumCulled = false;
      const def = NODE_TYPES[type];
      mesh.castShadow = def.kind !== 'pickup' || type === 'berry_bush';
      mesh.receiveShadow = true;
      mesh.count = 0;
      mesh.name = `nodes:${type}`;
      this.meshes[type] = mesh;
      this.game.scene.add(mesh);
    }
    const terrain = this.game.terrain;
    for (const s of specs) {
      const y = terrain.getHeight(s.x, s.z) - (NODE_TYPES[s.type].kind === 'tree' ? 0.15 : 0);
      const node = new ResourceNode(this, this.nodes.length, s.type, s.x, y, s.z, s.rot, s.scale);
      const mesh = this.meshes[s.type];
      node.instance = mesh.count++;
      this.nodes.push(node);
      this.addCollider(node);
      this.writeMatrix(node);
    }
    for (const mesh of Object.values(this.meshes)) mesh.instanceMatrix.needsUpdate = true;
  }

  addCollider(node) {
    const def = node.def;
    const s = node.scale;
    let c;
    if (def.kind === 'tree') {
      c = { shape: 'cyl', x: node.x, z: node.z, r: def.radius * s, y0: node.y - 0.5, y1: node.y + def.height * s, layer: 'resource', solid: true, owner: node };
    } else if (def.kind === 'ore') {
      const r = def.radius * s * (0.55 + 0.45 * yieldFraction(node.yields));
      c = { shape: 'sphere', x: node.x, y: node.y + 0.3 * s, z: node.z, r, layer: 'resource', solid: true, owner: node };
    } else {
      c = { shape: 'cyl', x: node.x, z: node.z, r: def.radius, y0: node.y - 0.2, y1: node.y + def.height, layer: 'pickup', solid: false, owner: node };
    }
    node.collider = this.game.physics.add(c);
  }

  removeCollider(node) {
    if (node.collider) this.game.physics.remove(node.collider);
    node.collider = null;
  }

  writeMatrix(node, extraTilt = 0) {
    const mesh = this.meshes[node.type];
    if (!node.alive) {
      tmpMatrix.makeScale(0, 0, 0);
    } else {
      let s = node.scale;
      if (node.def.kind === 'ore') s *= 0.45 + 0.55 * yieldFraction(node.yields);
      tmpPos.set(node.x, node.y, node.z);
      tmpEuler.set(extraTilt, node.rot, extraTilt * 0.6);
      tmpQuat.setFromEuler(tmpEuler);
      tmpScale.set(s, s, s);
      tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
    }
    mesh.setMatrixAt(node.instance, tmpMatrix);
    mesh.instanceMatrix.needsUpdate = true;
  }

  gather(node, ctx) {
    const def = node.def;
    if (!node.alive || def.kind === 'pickup') return { material: 'none' };
    const material = def.kind === 'tree' ? 'wood' : 'stone';
    const power = ctx.tool?.melee?.gather?.[def.gather] ?? 0;
    const fx = this.game.effects;
    fx.burst(ctx.point.x, ctx.point.y, ctx.point.z, {
      count: 7,
      color: material === 'wood' ? 0x8a6238 : 0x9a958d,
      speed: 3,
      size: 0.06,
      normal: ctx.normal,
    });
    if (power <= 0) return { material };
    const inv = this.game.player.inventory;
    const depleted = harvest(node.yields, power, (id, n) => inv.give(id, n));
    node.shake = 0.3;
    this.shaking.add(node);
    if (depleted) this.deplete(node);
    else if (def.kind === 'ore') {
      this.writeMatrix(node);
      this.removeCollider(node);
      this.addCollider(node);
    }
    return { material, gathered: true };
  }

  deplete(node) {
    node.alive = false;
    node.respawnTimer = node.def.respawn;
    this.removeCollider(node);
    this.shaking.delete(node);
    this.writeMatrix(node);
    if (node.def.kind === 'tree') {
      this.spawnFallingTree(node);
      this.game.audio.play('tree_fall', { x: node.x, y: node.y + 2, z: node.z });
    } else {
      this.game.audio.play('rock_break', { x: node.x, y: node.y, z: node.z });
      this.game.effects.burst(node.x, node.y + 0.6, node.z, { count: 20, color: 0x8a857d, speed: 4, size: 0.14, life: 1 });
    }
  }

  spawnFallingTree(node) {
    const mesh = new THREE.Mesh(this.geometries[node.type], this.material);
    mesh.castShadow = true;
    const pivot = new THREE.Group();
    pivot.position.set(node.x, node.y, node.z);
    mesh.rotation.y = node.rot;
    mesh.scale.setScalar(node.scale);
    pivot.add(mesh);
    // Fall away from the player.
    const px = this.game.player.position.x;
    const pz = this.game.player.position.z;
    const away = new THREE.Vector3(node.x - px, 0, node.z - pz).normalize();
    const axis = new THREE.Vector3().crossVectors(UP, away).normalize();
    if (axis.lengthSq() < 0.5) axis.set(1, 0, 0);
    this.game.scene.add(pivot);
    this.falling.push({ pivot, axis, t: 0 });
  }

  pickup(node) {
    if (!node.alive) return;
    const inv = this.game.player.inventory;
    for (const [id, qty] of node.def.gives) inv.give(id, qty);
    this.game.audio.play('pickup');
    node.alive = false;
    node.respawnTimer = node.def.respawn;
    this.removeCollider(node);
    this.writeMatrix(node);
  }

  update(dt) {
    for (const node of this.shaking) {
      node.shake -= dt;
      if (node.shake <= 0 || !node.alive) {
        this.shaking.delete(node);
        if (node.alive) this.writeMatrix(node);
        continue;
      }
      const amp = node.def.kind === 'tree' ? 0.035 : 0.015;
      this.writeMatrix(node, Math.sin(node.shake * 60) * amp * (node.shake / 0.3));
    }

    for (let i = this.falling.length - 1; i >= 0; i--) {
      const f = this.falling[i];
      f.t += dt;
      const angle = Math.min(Math.PI / 2, Math.pow(f.t / 1.6, 2.2) * (Math.PI / 2));
      f.pivot.quaternion.setFromAxisAngle(f.axis, angle);
      if (f.t > 2.2) f.pivot.position.y -= dt * 1.5;
      if (f.t > 3.6) {
        this.game.scene.remove(f.pivot);
        this.falling.splice(i, 1);
      }
    }

    // Respawn exhausted nodes, but never right next to the player.
    this.respawnAccumulator = (this.respawnAccumulator ?? 0) + dt;
    if (this.respawnAccumulator < 1) return;
    const step = this.respawnAccumulator;
    this.respawnAccumulator = 0;
    const p = this.game.player.position;
    for (const node of this.nodes) {
      if (node.alive) continue;
      node.respawnTimer -= step;
      if (node.respawnTimer > 0) continue;
      if (Math.hypot(node.x - p.x, node.z - p.z) < 20) {
        node.respawnTimer = 10;
        continue;
      }
      this.restore(node);
    }
  }

  restore(node) {
    node.alive = true;
    node.respawnTimer = 0;
    if (node.def.yields) node.yields = makeYields(node.def.yields, node.scale);
    this.addCollider(node);
    this.writeMatrix(node);
  }

  serialize() {
    const out = [];
    for (const node of this.nodes) {
      if (!node.alive) out.push({ i: node.index, t: Math.round(node.respawnTimer) });
      else if (node.yields && node.yields[0].remaining < node.yields[0].total) {
        out.push({ i: node.index, r: node.yields.map((y) => y.remaining) });
      }
    }
    return out;
  }

  load(data) {
    for (const entry of data ?? []) {
      const node = this.nodes[entry.i];
      if (!node) continue;
      if (entry.t !== undefined) {
        node.alive = false;
        node.respawnTimer = entry.t;
        this.removeCollider(node);
      } else if (entry.r && node.yields) {
        entry.r.forEach((r, k) => {
          if (node.yields[k]) node.yields[k].remaining = r;
        });
        this.removeCollider(node);
        this.addCollider(node);
      }
      this.writeMatrix(node);
    }
  }
}
