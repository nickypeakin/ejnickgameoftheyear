import * as THREE from '../lib/three.js';
import { worldBox, mergeGeometries } from '../core/GeometryUtils.js';
import { getTexture } from '../core/Textures.js';

// Base building on a world-aligned 3 m grid.
//   Cell pieces (foundation, floor) sit on grid cells; their origin is the top surface.
//   Edge pieces (wall, doorway, window) sit on cell edges; their origin is the base.
//   Stairs fill a cell and climb one storey toward their facing.
// Pieces snap to sockets on existing pieces, must be supported (stability), and can
// be upgraded twig → wood → stone → sheet metal with the hammer.

export const CELL = 3;
const STOREY = 3;
const MIN_STABILITY = 0.2;

export const PIECES = {
  foundation: { name: 'Foundation', cost: 1, slot: 'cell' },
  wall: { name: 'Wall', cost: 1, slot: 'edge' },
  doorway: { name: 'Doorway', cost: 0.7, slot: 'edge' },
  window: { name: 'Window', cost: 0.7, slot: 'edge' },
  floor: { name: 'Floor', cost: 0.5, slot: 'cell' },
  stairs: { name: 'Stairs', cost: 1, slot: 'stairs' },
};
export const PIECE_ORDER = ['foundation', 'wall', 'doorway', 'window', 'floor', 'stairs'];

export const GRADES = [
  { name: 'Twig', resource: 'wood', base: 50 },
  { name: 'Wood', resource: 'wood', base: 200 },
  { name: 'Stone', resource: 'stone', base: 300 },
  { name: 'Sheet Metal', resource: 'metal_frag', base: 200 },
];

export function gradeCost(type, grade) {
  const g = GRADES[grade];
  return { [g.resource]: Math.round(g.base * PIECES[type].cost) };
}

// Edge pieces as boxes in edge space: [u0, u1, v0, v1, y0, y1], u along the edge.
const EDGE_BOXES = {
  wall: [[-1.5, 1.5, -0.1, 0.1, 0, 3]],
  doorway: [[-1.5, -0.55, -0.1, 0.1, 0, 3], [0.55, 1.5, -0.1, 0.1, 0, 3], [-0.55, 0.55, -0.1, 0.1, 2.2, 3]],
  window: [[-1.5, -0.6, -0.1, 0.1, 0, 3], [0.6, 1.5, -0.1, 0.1, 0, 3], [-0.6, 0.6, -0.1, 0.1, 0, 1.0], [-0.6, 0.6, -0.1, 0.1, 2.0, 3]],
};

const yKey = (y) => Math.round(y * 10);
const cellKey = (i, k, y) => `C:${i}:${k}:${yKey(y)}`;
const edgeKey = (a, i, k, y) => `E:${a}:${i}:${k}:${yKey(y)}`;
const stairKey = (i, k, y) => `S:${i}:${k}:${yKey(y)}`;
const doorKey = (a, i, k, y) => `D:${a}:${i}:${k}:${yKey(y)}`;

const cellEdges = (i, k) => [['x', i, k], ['x', i, k + 1], ['z', i, k], ['z', i + 1, k]];
const edgeCells = (a, i, k) => (a === 'x' ? [[i, k - 1], [i, k]] : [[i - 1, k], [i, k]]);
const cellCenter = (i, k) => ({ x: (i + 0.5) * CELL, z: (k + 0.5) * CELL });
const edgeCenter = (a, i, k) => (a === 'x' ? { x: (i + 0.5) * CELL, z: k * CELL } : { x: i * CELL, z: (k + 0.5) * CELL });

function edgeToWorld(a, ex, ez, y, [u0, u1, v0, v1, y0, y1]) {
  if (a === 'x') return { minX: ex + u0, maxX: ex + u1, minZ: ez + v0, maxZ: ez + v1, minY: y + y0, maxY: y + y1 };
  return { minX: ex + v0, maxX: ex + v1, minZ: ez - u1, maxZ: ez - u0, minY: y + y0, maxY: y + y1 };
}

function stairRamp(i, k, y, rot) {
  const c = cellCenter(i, k);
  const alongZ = rot % 2 === 0;
  const halfW = 1.2;
  return {
    shape: 'ramp',
    minX: alongZ ? c.x - halfW : c.x - 1.5,
    maxX: alongZ ? c.x + halfW : c.x + 1.5,
    minZ: alongZ ? c.z - 1.5 : c.z - halfW,
    maxZ: alongZ ? c.z + 1.5 : c.z + halfW,
    minY: y,
    lowY: y + 0.25,
    maxY: y + STOREY,
    axis: alongZ ? 'z' : 'x',
    dir: rot < 2 ? 1 : -1,
  };
}

function buildGeometries() {
  const g = {
    foundation: worldBox(3, 3, 3, 0, -1.5, 0),
    floor: worldBox(3, 0.2, 3, 0, -0.1, 0),
  };
  for (const [type, boxes] of Object.entries(EDGE_BOXES)) {
    g[type] = mergeGeometries(boxes.map(([u0, u1, v0, v1, y0, y1]) => worldBox(u1 - u0, y1 - y0, v1 - v0, (u0 + u1) / 2, (y0 + y1) / 2, (v0 + v1) / 2)));
  }
  const steps = [];
  for (let s = 0; s < 6; s++) {
    const h = (s + 1) * 0.5;
    steps.push(worldBox(2.4, h, 0.5, 0, h / 2, -1.5 + 0.25 + s * 0.5));
  }
  g.stairs = mergeGeometries(steps);
  g.door = worldBox(1.08, 2.18, 0.08, 0.55, 1.1, 0, 1.1);
  return g;
}

export class BuildingSystem {
  constructor(game) {
    this.game = game;
    this.pieces = new Map();
    this.doors = new Map();
    this.nextId = 1;
    this.geometries = buildGeometries();
    const twig = new THREE.MeshLambertMaterial({ map: getTexture('twig'), color: '#e0b479', alphaTest: 0.5, side: THREE.DoubleSide });
    this.materials = [
      twig,
      new THREE.MeshLambertMaterial({ map: getTexture('planks') }),
      new THREE.MeshLambertMaterial({ map: getTexture('stoneBlocks') }),
      new THREE.MeshLambertMaterial({ map: getTexture('metalSheet') }),
    ];
    this.doorMaterial = new THREE.MeshLambertMaterial({ map: getTexture('planks'), color: '#c79a6a' });
    this.ghostMaterial = new THREE.MeshBasicMaterial({ color: 0x5fd06a, transparent: true, opacity: 0.38, depthWrite: false });
    this.ghost = new THREE.Mesh(this.geometries.foundation, this.ghostMaterial);
    this.ghost.visible = false;
    this.ghost.renderOrder = 5;
    game.scene.add(this.ghost);
    this.placement = null;
  }

  // ---- lookup helpers -------------------------------------------------------

  cellPiece(i, k, y) {
    return this.pieces.get(cellKey(i, k, y));
  }

  edgePiece(a, i, k, y) {
    return this.pieces.get(edgeKey(a, i, k, y));
  }

  keyFor(p) {
    if (PIECES[p.type].slot === 'cell') return cellKey(p.i, p.k, p.y);
    if (p.type === 'stairs') return stairKey(p.i, p.k, p.y);
    return edgeKey(p.a, p.i, p.k, p.y);
  }

  anchorOf(p) {
    if (PIECES[p.type].slot === 'edge') {
      const e = edgeCenter(p.a, p.i, p.k);
      return { x: e.x, y: p.y + 1.5, z: e.z };
    }
    const c = cellCenter(p.i, p.k);
    return { x: c.x, y: p.type === 'stairs' ? p.y + 1.5 : p.y, z: c.z };
  }

  boxesFor(p) {
    if (p.type === 'foundation' || p.type === 'floor') {
      const depth = p.type === 'foundation' ? STOREY : 0.2;
      return [{ minX: p.i * CELL, maxX: (p.i + 1) * CELL, minZ: p.k * CELL, maxZ: (p.k + 1) * CELL, minY: p.y - depth, maxY: p.y }];
    }
    if (p.type === 'stairs') return [stairRamp(p.i, p.k, p.y, p.rot)];
    const e = edgeCenter(p.a, p.i, p.k);
    return EDGE_BOXES[p.type].map((b) => edgeToWorld(p.a, e.x, e.z, p.y, b));
  }

  // ---- stability ---------------------------------------------------------------

  supportFor(p, valueOf) {
    if (p.type === 'foundation') return 1;
    let s = 0;
    if (p.type === 'floor') {
      for (const [a, i, k] of cellEdges(p.i, p.k)) {
        const w = this.edgePiece(a, i, k, p.y - STOREY);
        if (w) s = Math.max(s, valueOf(w));
      }
      for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = this.cellPiece(p.i + di, p.k + dk, p.y);
        if (n) s = Math.max(s, valueOf(n) * 0.5);
      }
      return s;
    }
    if (p.type === 'stairs') {
      const base = this.cellPiece(p.i, p.k, p.y);
      return base ? valueOf(base) : 0;
    }
    for (const [i, k] of edgeCells(p.a, p.i, p.k)) {
      const c = this.cellPiece(i, k, p.y);
      if (c) s = Math.max(s, valueOf(c));
    }
    const below = this.edgePiece(p.a, p.i, p.k, p.y - STOREY);
    if (below) s = Math.max(s, valueOf(below));
    return s * 0.9;
  }

  recomputeStability() {
    for (const p of this.pieces.values()) p.stability = p.type === 'foundation' ? 1 : 0;
    for (let iter = 0; iter < 64; iter++) {
      let changed = false;
      for (const p of this.pieces.values()) {
        if (p.type === 'foundation') continue;
        const s = this.supportFor(p, (q) => q.stability);
        if (Math.abs(s - p.stability) > 1e-4) {
          p.stability = s;
          changed = true;
        }
      }
      if (!changed) break;
    }
  }

  // ---- placement ---------------------------------------------------------------

  candidatesFor(type, near) {
    const out = [];
    const seen = new Set();
    const push = (c) => {
      const key = this.keyFor(c);
      if (seen.has(key) || this.pieces.has(key)) return;
      seen.add(key);
      out.push(c);
    };
    for (const p of near) {
      const isCell = p.type === 'foundation' || p.type === 'floor';
      const isEdge = PIECES[p.type].slot === 'edge';
      if (type === 'foundation' && p.type === 'foundation') {
        for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) push({ type, i: p.i + di, k: p.k + dk, y: p.y });
      } else if (type === 'floor') {
        if (isCell) for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) push({ type, i: p.i + di, k: p.k + dk, y: p.y });
        if (isEdge) for (const [i, k] of edgeCells(p.a, p.i, p.k)) push({ type, i, k, y: p.y + STOREY });
      } else if (PIECES[type].slot === 'edge') {
        if (isCell) for (const [a, i, k] of cellEdges(p.i, p.k)) push({ type, a, i, k, y: p.y });
        if (isEdge) push({ type, a: p.a, i: p.i, k: p.k, y: p.y + STOREY });
      } else if (type === 'stairs' && isCell) {
        push({ type, i: p.i, k: p.k, y: p.y, rot: 0 });
      }
    }
    return out;
  }

  // Ray-to-point distance used to pick the socket the player is aiming at.
  static rayDistance(o, d, pt) {
    const vx = pt.x - o.x;
    const vy = pt.y - o.y;
    const vz = pt.z - o.z;
    const t = vx * d.x + vy * d.y + vz * d.z;
    if (t < 0.3 || t > 8) return Infinity;
    return Math.hypot(vx - d.x * t, vy - d.y * t, vz - d.z * t);
  }

  piecesNear(x, z, radius) {
    const out = [];
    for (const p of this.pieces.values()) {
      const a = this.anchorOf(p);
      if (Math.hypot(a.x - x, a.z - z) < radius) out.push(p);
    }
    return out;
  }

  validate(c) {
    const game = this.game;
    const anchor = this.anchorOf(c);
    if (game.monuments.siteAt(anchor.x, anchor.z, 12)) return 'Building blocked near monument';
    if (c.type === 'foundation') {
      const x0 = c.i * CELL;
      const z0 = c.k * CELL;
      const corners = [[x0, z0], [x0 + CELL, z0], [x0, z0 + CELL], [x0 + CELL, z0 + CELL], [x0 + 1.5, z0 + 1.5]].map(([x, z]) => game.terrain.getHeight(x, z));
      if (Math.min(...corners) < -1.5) return 'Too close to water';
      if (c.y - Math.min(...corners) > STOREY - 0.15) return 'Too far above the ground';
      if (Math.max(...corners) > c.y + 0.35) return 'Blocked by terrain';
      for (const p of this.pieces.values()) {
        if ((p.type === 'foundation' || p.type === 'floor' || p.type === 'stairs') && p.i === c.i && p.k === c.k && Math.abs(p.y - c.y) < STOREY) return 'Overlaps another piece';
      }
    } else {
      if (this.supportFor(c, (q) => q.stability) < MIN_STABILITY) return 'Not enough support';
    }
    if (c.type === 'floor' && this.pieces.has(stairKey(c.i, c.k, c.y - STOREY))) return 'Stairs below need open space';
    if (c.type === 'stairs' && this.pieces.has(cellKey(c.i, c.k, c.y + STOREY))) return 'Floor above blocks the stairs';
    for (const b of this.boxesFor(c)) {
      const s = 0.06;
      const blocker = game.physics.boxBlocked(b.minX + s, b.minY + s, b.minZ + s, b.maxX - s, b.maxY - s, b.maxZ - s, (col) => col.layer !== 'building');
      if (blocker) return blocker.layer === 'player' ? 'You are in the way' : 'Something is in the way';
    }
    return null;
  }

  // Called every frame while the building plan is held. Positions the ghost and
  // remembers the best valid socket for place().
  updatePlacement(type, rot) {
    const game = this.game;
    const cam = game.camera;
    const o = cam.position;
    const d = game.player.lookDir;
    const hit = game.physics.raycast(o.x, o.y, o.z, d.x, d.y, d.z, 7, { ignore: game.player.collider, filter: (c) => c.solid });
    const aim = hit ? { x: hit.x, y: hit.y, z: hit.z } : { x: o.x + d.x * 4, y: o.y + d.y * 4, z: o.z + d.z * 4 };
    const near = this.piecesNear(aim.x, aim.z, 10);
    let best = null;
    let bestDist = PIECES[type].slot === 'edge' ? 1.7 : 2.0;
    for (const c of this.candidatesFor(type, near)) {
      if (type === 'stairs') c.rot = rot;
      const dist = BuildingSystem.rayDistance(o, d, this.anchorOf(c));
      if (dist < bestDist) {
        bestDist = dist;
        best = c;
      }
    }
    if (!best && type === 'foundation' && hit && hit.layer === 'terrain' && hit.dist < 6.5) {
      const i = Math.floor(hit.x / CELL);
      const k = Math.floor(hit.z / CELL);
      const x0 = i * CELL;
      const z0 = k * CELL;
      const top = Math.max(...[[x0, z0], [x0 + CELL, z0], [x0, z0 + CELL], [x0 + CELL, z0 + CELL], [x0 + 1.5, z0 + 1.5]].map(([x, z]) => game.terrain.getHeight(x, z)));
      best = { type, i, k, y: Math.round((top + 0.15) * 10) / 10 };
    }
    if (!best) {
      this.ghost.visible = false;
      this.placement = { candidate: null, error: type === 'foundation' ? 'Aim at the ground' : `Aim at a socket for the ${PIECES[type].name.toLowerCase()}` };
      return this.placement;
    }
    const error = this.validate(best);
    this.showGhost(best, !error);
    this.placement = { candidate: best, error };
    return this.placement;
  }

  showGhost(c, valid) {
    const g = this.ghost;
    g.geometry = this.geometries[c.type];
    this.applyTransform(g, c);
    this.ghostMaterial.color.set(valid ? 0x5fd06a : 0xd8483c);
    g.visible = true;
  }

  hideGhost() {
    this.ghost.visible = false;
    this.placement = null;
  }

  applyTransform(obj, c) {
    if (PIECES[c.type].slot === 'edge') {
      const e = edgeCenter(c.a, c.i, c.k);
      obj.position.set(e.x, c.y, e.z);
      obj.rotation.set(0, c.a === 'x' ? 0 : Math.PI / 2, 0);
    } else {
      const cc = cellCenter(c.i, c.k);
      obj.position.set(cc.x, c.y, cc.z);
      obj.rotation.set(0, c.type === 'stairs' ? (c.rot ?? 0) * (Math.PI / 2) : 0, 0);
    }
  }

  place() {
    const pl = this.placement;
    if (!pl?.candidate) {
      if (pl?.error) this.game.hud.flashHint(pl.error);
      return false;
    }
    if (pl.error) {
      this.game.hud.flashHint(pl.error);
      return false;
    }
    const cost = gradeCost(pl.candidate.type, 0);
    if (!this.game.player.inventory.takeCost(cost)) {
      this.game.hud.flashHint('Not enough wood');
      return false;
    }
    const piece = this.addPiece({ ...pl.candidate, grade: 0 });
    const a = this.anchorOf(piece);
    this.game.audio.play('build_place', { x: a.x, y: a.y, z: a.z });
    this.game.stats.built += 1;
    return true;
  }

  addPiece(data) {
    const piece = {
      id: this.nextId++,
      kind: 'building',
      type: data.type,
      grade: data.grade ?? 0,
      i: data.i,
      k: data.k,
      y: data.y,
      a: data.a ?? null,
      rot: data.rot ?? 0,
      stability: 0,
      colliders: [],
    };
    piece.mesh = new THREE.Mesh(this.geometries[piece.type], this.materials[piece.grade]);
    piece.mesh.castShadow = true;
    piece.mesh.receiveShadow = true;
    this.applyTransform(piece.mesh, piece);
    this.game.scene.add(piece.mesh);
    for (const b of this.boxesFor(piece)) {
      piece.colliders.push(this.game.physics.add({ shape: 'box', ...b, layer: 'building', solid: true, owner: piece }));
    }
    this.pieces.set(this.keyFor(piece), piece);
    piece.stability = this.supportFor(piece, (q) => q.stability);
    return piece;
  }

  removePiece(piece) {
    this.game.scene.remove(piece.mesh);
    for (const c of piece.colliders) this.game.physics.remove(c);
    this.pieces.delete(this.keyFor(piece));
    if (piece.type === 'doorway') {
      const door = this.doors.get(doorKey(piece.a, piece.i, piece.k, piece.y));
      if (door) this.removeDoor(door);
    }
  }

  label(piece) {
    return `${GRADES[piece.grade].name} ${PIECES[piece.type].name}`;
  }

  upgrade(piece, grade) {
    if (grade <= piece.grade) return;
    const cost = gradeCost(piece.type, grade);
    if (!this.game.player.inventory.takeCost(cost)) {
      this.game.hud.flashHint(`Not enough resources for ${GRADES[grade].name}`);
      return;
    }
    piece.grade = grade;
    piece.mesh.material = this.materials[grade];
    const a = this.anchorOf(piece);
    this.game.audio.play('build_upgrade', { x: a.x, y: a.y, z: a.z });
    this.game.effects.burst(a.x, a.y, a.z, { count: 14, color: grade === 2 ? 0x9a958d : grade === 3 ? 0x8d9398 : 0xa07848, speed: 3, size: 0.1 });
  }

  rotate(piece) {
    if (piece.type !== 'stairs') return;
    const next = { ...piece, rot: (piece.rot + 1) % 4 };
    for (const c of piece.colliders) this.game.physics.remove(c);
    const blocked = this.boxesFor(next).some((b) => this.game.physics.boxBlocked(b.minX + 0.06, b.minY + 0.06, b.minZ + 0.06, b.maxX - 0.06, b.maxY - 0.06, b.maxZ - 0.06, (col) => col.layer !== 'building'));
    if (!blocked) piece.rot = next.rot;
    piece.colliders = this.boxesFor(piece).map((b) => this.game.physics.add({ shape: 'box', ...b, layer: 'building', solid: true, owner: piece }));
    this.applyTransform(piece.mesh, piece);
    if (blocked) this.game.hud.flashHint('Something is in the way');
  }

  demolish(piece) {
    const refund = gradeCost(piece.type, 0);
    for (const [id, qty] of Object.entries(refund)) this.game.player.inventory.give(id, Math.floor(qty / 2));
    const a = this.anchorOf(piece);
    this.game.audio.play('demolish', { x: a.x, y: a.y, z: a.z });
    this.game.effects.burst(a.x, a.y, a.z, { count: 24, color: 0x8a7a60, speed: 4, size: 0.15, life: 1 });
    this.removePiece(piece);
    this.collapseUnsupported();
  }

  collapseUnsupported() {
    this.recomputeStability();
    const falling = [...this.pieces.values()].filter((p) => p.stability < MIN_STABILITY);
    for (const p of falling) {
      const a = this.anchorOf(p);
      this.game.effects.burst(a.x, a.y, a.z, { count: 10, color: 0x8a7a60, speed: 3, size: 0.12, life: 0.8 });
      this.removePiece(p);
    }
    this.game.deployables.checkSupport();
  }

  // ---- doors -----------------------------------------------------------------

  updateDoorPlacement() {
    const game = this.game;
    const o = game.camera.position;
    const d = game.player.lookDir;
    let best = null;
    let bestDist = 1.8;
    for (const p of this.piecesNear(o.x + d.x * 3, o.z + d.z * 3, 8)) {
      if (p.type !== 'doorway' || this.doors.has(doorKey(p.a, p.i, p.k, p.y))) continue;
      const e = edgeCenter(p.a, p.i, p.k);
      const dist = BuildingSystem.rayDistance(o, d, { x: e.x, y: p.y + 1.1, z: e.z });
      if (dist < bestDist) {
        bestDist = dist;
        best = p;
      }
    }
    if (!best) {
      this.ghost.visible = false;
      this.placement = { door: null, error: 'Aim at an empty doorway' };
      return this.placement;
    }
    const g = this.ghost;
    g.geometry = this.geometries.door;
    const e = edgeCenter(best.a, best.i, best.k);
    const hinge = best.a === 'x' ? { x: e.x - 0.55, z: e.z } : { x: e.x, z: e.z + 0.55 };
    g.position.set(hinge.x, best.y, hinge.z);
    g.rotation.set(0, best.a === 'x' ? 0 : Math.PI / 2, 0);
    this.ghostMaterial.color.set(0x5fd06a);
    g.visible = true;
    this.placement = { door: best, error: null };
    return this.placement;
  }

  placeDoor() {
    const doorway = this.placement?.door;
    if (!doorway) {
      this.game.hud.flashHint('Aim at an empty doorway');
      return false;
    }
    this.addDoor({ a: doorway.a, i: doorway.i, k: doorway.k, y: doorway.y, open: false });
    this.game.audio.play('build_place');
    return true;
  }

  addDoor({ a, i, k, y, open = false, swing = 1 }) {
    const e = edgeCenter(a, i, k);
    const door = { kind: 'door', a, i, k, y, open, swing, ex: e.x, ez: e.z, collider: null };
    door.group = new THREE.Group();
    door.group.position.set(e.x, y, e.z);
    door.group.rotation.y = a === 'x' ? 0 : Math.PI / 2;
    door.hinge = new THREE.Group();
    door.hinge.position.x = -0.55;
    const mesh = new THREE.Mesh(this.geometries.door, this.doorMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    door.hinge.add(mesh);
    door.group.add(door.hinge);
    this.game.scene.add(door.group);
    door.getInteraction = () => ({ label: door.open ? 'Close Door' : 'Open Door', action: () => this.toggleDoor(door) });
    this.doors.set(doorKey(a, i, k, y), door);
    this.syncDoor(door);
    return door;
  }

  syncDoor(door) {
    door.hinge.rotation.y = door.open ? door.swing * (Math.PI / 2) * 0.95 : 0;
    if (door.collider) this.game.physics.remove(door.collider);
    const box = door.open
      ? edgeToWorld(door.a, door.ex, door.ez, door.y, [-0.62, -0.48, door.swing > 0 ? -1.12 : 0.02, door.swing > 0 ? -0.02 : 1.12, 0, 2.2])
      : edgeToWorld(door.a, door.ex, door.ez, door.y, [-0.55, 0.55, -0.05, 0.05, 0, 2.2]);
    door.collider = this.game.physics.add({ shape: 'box', ...box, layer: 'building', solid: true, owner: door });
  }

  toggleDoor(door) {
    if (!door.open) {
      // `side` is the player's offset across the doorway in the door's local v axis.
      // A positive hinge rotation swings the leaf toward -v, so pick the sign that
      // opens the door away from the player.
      const p = this.game.player.position;
      const side = door.a === 'x' ? p.z - door.ez : p.x - door.ex;
      door.swing = side > 0 ? 1 : -1;
    }
    door.open = !door.open;
    this.syncDoor(door);
    this.game.audio.play('door', { x: door.ex, y: door.y + 1, z: door.ez });
  }

  removeDoor(door) {
    this.game.scene.remove(door.group);
    this.game.physics.remove(door.collider);
    this.doors.delete(doorKey(door.a, door.i, door.k, door.y));
  }

  pickupDoor(door) {
    this.removeDoor(door);
    this.game.player.inventory.give('wooden_door', 1);
  }

  // ---- persistence -------------------------------------------------------------

  serialize() {
    return {
      pieces: [...this.pieces.values()].map((p) => ({ t: p.type, g: p.grade, i: p.i, k: p.k, y: p.y, a: p.a, r: p.rot })),
      doors: [...this.doors.values()].map((d) => ({ a: d.a, i: d.i, k: d.k, y: d.y, open: d.open, swing: d.swing })),
    };
  }

  load(data) {
    for (const p of data?.pieces ?? []) {
      if (!PIECES[p.t]) continue;
      this.addPiece({ type: p.t, grade: p.g, i: p.i, k: p.k, y: p.y, a: p.a, rot: p.r });
    }
    this.recomputeStability();
    for (const d of data?.doors ?? []) {
      if (this.pieces.has(edgeKey(d.a, d.i, d.k, d.y))) this.addDoor(d);
    }
  }
}
