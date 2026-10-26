import * as THREE from '../lib/three.js';
import { dampAngle } from '../core/MathUtils.js';

// Shared body for animals and NPCs: collision-aware steering, gravity, line of
// sight and a physics collider that follows the model.

const losFilter = (c) => c.layer !== 'pickup' && c.layer !== 'drop' && c.layer !== 'entity' && c.layer !== 'corpse' && c.layer !== 'container';

export class Creature {
  constructor(game, { x, z, radius, height, hp, minGround = 0.4 }) {
    this.game = game;
    const y = game.physics.getGroundHeight(x, z, game.terrain.getHeight(x, z) + 1, 1);
    this.pos = new THREE.Vector3(x, y, z);
    this.yaw = Math.random() * Math.PI * 2;
    this.radius = radius;
    this.height = height;
    this.hp = hp;
    this.maxHp = hp;
    this.minGround = minGround;
    this.dead = false;
    this.removed = false;
    this.vy = 0;
    this.speed = 0;
    this.stuck = 0;
    this.detourTimer = 0;
    this.detourDir = 1;
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.collider = game.physics.add({
      shape: 'cyl', x, z, r: radius, y0: y, y1: y + height, layer: 'entity', solid: true, owner: this,
    });
  }

  distanceToPlayer() {
    const p = this.game.player.position;
    return Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
  }

  // Steer toward a direction at the given speed. Returns the fraction of the
  // intended distance actually covered. Walking into water is refused, and when
  // the creature keeps getting blocked it tries a temporary detour. With
  // face = false the creature moves without turning (strafing, backing off).
  move(dirX, dirZ, speed, dt, turnRate = 5, face = true) {
    if (speed <= 0 || (Math.abs(dirX) < 1e-5 && Math.abs(dirZ) < 1e-5)) {
      this.speed = 0;
      return 1;
    }
    let angle = Math.atan2(dirX, dirZ);
    if (this.detourTimer > 0) {
      this.detourTimer -= dt;
      angle += this.detourDir * 1.25;
    }
    let heading = angle;
    if (face) {
      this.yaw = dampAngle(this.yaw, angle, turnRate, dt);
      heading = this.yaw;
    }
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    const terrain = this.game.terrain;
    const ahead = terrain.getHeight(this.pos.x + fx * 1.6, this.pos.z + fz * 1.6);
    if (ahead < this.minGround && ahead < this.pos.y - 0.05) {
      this.speed = 0;
      this.bumped(dt);
      return 0;
    }
    const step = speed * dt;
    const p = { x: this.pos.x + fx * step, y: this.pos.y, z: this.pos.z + fz * step };
    this.game.physics.resolveCircle(p, this.radius, this.height, 0.55, this.collider);
    const half = terrain.half - 4;
    p.x = Math.max(-half, Math.min(half, p.x));
    p.z = Math.max(-half, Math.min(half, p.z));
    const moved = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
    this.pos.x = p.x;
    this.pos.z = p.z;
    this.speed = moved / dt;
    const ratio = moved / step;
    if (ratio < 0.35) this.bumped(dt);
    else this.stuck = Math.max(0, this.stuck - dt);
    return ratio;
  }

  bumped(dt) {
    this.stuck += dt;
    if (this.stuck > 0.5) {
      this.stuck = 0;
      this.detourTimer = 1.1 + Math.random() * 0.8;
      this.detourDir = Math.random() < 0.5 ? -1 : 1;
    }
  }

  applyGravity(dt) {
    const ground = this.game.physics.getGroundHeight(this.pos.x, this.pos.z, this.pos.y, 0.55, this.radius);
    if (this.pos.y > ground + 0.05) {
      this.vy -= 20 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= ground) {
        this.pos.y = ground;
        this.vy = 0;
      }
    } else {
      this.pos.y = ground;
      this.vy = 0;
    }
  }

  syncCollider() {
    const c = this.collider;
    c.x = this.pos.x;
    c.z = this.pos.z;
    c.y0 = this.pos.y;
    c.y1 = this.pos.y + this.height;
    this.game.physics.move(c);
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
  }

  canSee(tx, ty, tz, maxDist) {
    const ex = this.pos.x;
    const ey = this.pos.y + this.height * 0.9;
    const ez = this.pos.z;
    let dx = tx - ex;
    let dy = ty - ey;
    let dz = tz - ez;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > maxDist) return false;
    if (dist < 0.01) return true;
    dx /= dist;
    dy /= dist;
    dz /= dist;
    const hit = this.game.physics.raycast(ex, ey, ez, dx, dy, dz, dist - 0.3, { ignore: this.collider, filter: (c) => losFilter(c) && c.layer !== 'player' });
    return !hit;
  }

  canSeePlayer(maxDist) {
    const p = this.game.player;
    if (p.dead) return false;
    return this.canSee(p.position.x, p.position.y + p.eyeHeight, p.position.z, maxDist);
  }

  dispose() {
    if (this.removed) return;
    this.removed = true;
    this.game.scene.remove(this.group);
    this.game.physics.remove(this.collider);
  }
}

const boxCache = new Map();

// Helper to build blocky body parts; geometries are shared between creatures.
export function block(w, h, d, material, x = 0, y = 0, z = 0) {
  const key = `${w}|${h}|${d}`;
  if (!boxCache.has(key)) boxCache.set(key, new THREE.BoxGeometry(w, h, d));
  const mesh = new THREE.Mesh(boxCache.get(key), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

// A leg (or arm) that swings from a pivot at its top.
export function limb(w, h, d, material, x, y, z) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  pivot.add(block(w, h, d, material, 0, -h / 2, 0));
  return pivot;
}
