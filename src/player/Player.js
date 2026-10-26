import * as THREE from '../lib/three.js';
import { clamp, damp, TAU } from '../core/MathUtils.js';
import { PlayerInventory } from '../inventory/PlayerInventory.js';
import { Vitals } from './Vitals.js';
import { WATER_LEVEL } from '../world/Terrain.js';

const GRAVITY = 20;
const SPEED = { walk: 4.2, sprint: 6.8, crouch: 2.0, swim: 2.6 };
const JUMP_VELOCITY = 6.6;
const SAFE_FALL_SPEED = 13;

// First-person survivor: movement and collision, swimming, fall damage, vitals
// and the inventory.
export class Player {
  constructor(game) {
    this.game = game;
    this.kind = 'player';
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.recoilPitch = 0;
    this.lookDir = new THREE.Vector3(0, 0, -1);
    this.radius = 0.38;
    this.height = 1.8;
    this.eyeHeight = 1.62;
    this.onGround = false;
    this.crouching = false;
    this.sprinting = false;
    this.swimming = false;
    this.inWater = false;
    this.underwater = false;
    this.moving = false;
    this.inventory = new PlayerInventory(game);
    this.vitals = new Vitals();
    this.activeSlot = 0;
    this.dead = false;
    this.stepDistance = 0;
    this.bobPhase = 0;
    this.bobAmount = 0;
    this.collider = game.physics.add({ shape: 'cyl', x: 0, z: 0, r: 0.4, y0: 0, y1: 1.8, layer: 'player', solid: true, owner: this });
  }

  get activeItem() {
    return this.inventory.belt.get(this.activeSlot);
  }

  spawnAt(x, z, yaw = Math.random() * TAU) {
    const terrainY = this.game.terrain.getHeight(x, z);
    const y = this.game.physics.getGroundHeight(x, z, terrainY + 2, 2.5, this.radius);
    this.position.set(x, Math.max(y, terrainY), z);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.dead = false;
    this.onGround = true;
    this.syncCollider();
    this.updateLookDir();
  }

  dropPosition() {
    return { x: this.position.x + this.lookDir.x * 0.8, y: this.position.y + 1.2, z: this.position.z + this.lookDir.z * 0.8 };
  }

  look(input, dt, zoom = 1) {
    const { dx, dy } = input.consumeLook();
    const settings = this.game.settings;
    const sens = settings.get('sensitivity') * 0.0022 * zoom;
    const invert = settings.get('invertY') ? -1 : 1;
    this.yaw -= dx * sens;
    this.pitch -= dy * sens * invert;
    const keyYaw = (input.isDown('ArrowLeft') ? 1 : 0) - (input.isDown('ArrowRight') ? 1 : 0);
    const keyPitch = (input.isDown('ArrowUp') ? 1 : 0) - (input.isDown('ArrowDown') ? 1 : 0);
    this.yaw += keyYaw * 2.2 * dt;
    this.pitch += keyPitch * 1.6 * dt;
    this.pitch = clamp(this.pitch, -1.55, 1.55);
  }

  update(dt, input, controls) {
    const game = this.game;
    const physics = game.physics;
    const p = this.position;
    const key = (code) => (controls && input.isDown(code) ? 1 : 0);
    const forward = key('KeyW') - key('KeyS');
    const strafe = key('KeyD') - key('KeyA');
    this.crouching = Boolean(key('ControlLeft') || key('KeyC'));

    const depth = WATER_LEVEL - p.y;
    this.inWater = depth > 0.25;
    this.swimming = depth > 1.25;
    this.sprinting = Boolean(key('ShiftLeft')) && forward > 0 && !this.crouching && !this.swimming;

    let speed = this.swimming ? SPEED.swim : this.crouching ? SPEED.crouch : this.sprinting ? SPEED.sprint : SPEED.walk;
    if (this.inWater && !this.swimming) speed *= 0.75;

    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    let wx = -sin * forward + cos * strafe;
    let wz = -cos * forward - sin * strafe;
    const len = Math.hypot(wx, wz);
    if (len > 0) {
      wx /= len;
      wz /= len;
    }
    const accel = this.onGround || this.swimming ? 12 : 2.5;
    this.velocity.x = damp(this.velocity.x, wx * speed, accel, dt);
    this.velocity.z = damp(this.velocity.z, wz * speed, accel, dt);

    if (this.swimming) {
      const floatY = WATER_LEVEL - 1.38;
      let target = (floatY - p.y) * 2.5;
      if (key('Space')) target = 2.4;
      else if (this.crouching) target = -2.4;
      this.velocity.y = damp(this.velocity.y, target, 4, dt);
    } else {
      if (controls && input.wasPressed('Space') && this.onGround) {
        this.velocity.y = JUMP_VELOCITY;
        this.onGround = false;
      }
      this.velocity.y -= GRAVITY * dt;
    }

    const prevX = p.x;
    const prevZ = p.z;
    const prevY = p.y;
    p.x += this.velocity.x * dt;
    p.z += this.velocity.z * dt;
    physics.resolveCircle(p, this.radius, this.height, this.onGround ? 0.5 : 0.3, this.collider);
    const half = game.terrain.half - 3;
    p.x = clamp(p.x, -half, half);
    p.z = clamp(p.z, -half, half);

    const wasOnGround = this.onGround;
    const fallSpeed = -this.velocity.y;
    p.y += this.velocity.y * dt;
    // Query from the higher of the old and new heights so fast falls cannot tunnel through floors.
    const ground = physics.getGroundHeight(p.x, p.z, Math.max(prevY, p.y), 0.5, this.radius);
    const snap = wasOnGround && this.velocity.y <= 0 && !this.swimming ? 0.4 : 0;
    if (p.y <= ground + snap) {
      if (!wasOnGround && fallSpeed > 4) game.audio.play('land', { volume: Math.min(1, fallSpeed / 12) });
      if (!wasOnGround && fallSpeed > SAFE_FALL_SPEED && !this.inWater) {
        this.takeDamage((fallSpeed - SAFE_FALL_SPEED) * 5, { cause: 'Fell to death', ignoreArmor: true });
      }
      p.y = ground;
      if (this.velocity.y < 0) this.velocity.y = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }

    this.height = this.crouching ? 1.2 : 1.8;
    const ceiling = physics.getCeiling(p.x, p.z, p.y + 0.5, this.radius);
    if (p.y + this.height > ceiling) {
      p.y = Math.max(ground, ceiling - this.height);
      if (this.velocity.y > 0) this.velocity.y = 0;
    }

    this.syncCollider();

    const moved = Math.hypot(p.x - prevX, p.z - prevZ) / Math.max(dt, 1e-4);
    this.moving = moved > 0.5;
    if ((this.onGround || this.inWater) && this.moving) {
      this.stepDistance += moved * dt;
      if (this.stepDistance > (this.sprinting ? 2.7 : 2.1)) {
        this.stepDistance = 0;
        const onBuilding = p.y > game.terrain.getHeight(p.x, p.z) + 0.15;
        const surface = this.inWater ? 'water' : onBuilding ? 'wood' : p.y < 2.2 ? 'stone' : 'ground';
        game.audio.play('footstep', { surface, volume: this.crouching ? 0.3 : this.sprinting ? 0.9 : 0.6 });
      }
    }
    this.bobPhase += moved * dt * 1.9;
    this.bobAmount = damp(this.bobAmount, this.onGround && this.moving ? Math.min(1, moved / 6) : 0, 8, dt);

    const holdingTorch = this.activeItem?.id === 'torch';
    const cause = this.vitals.update(dt, {
      sprinting: this.sprinting,
      moving: this.moving,
      envTemp: game.sky.temperatureAt(p.y),
      insulation: this.inventory.insulation(),
      warmth: game.deployables.warmthAt(p) + (holdingTorch ? 3 : 0),
      inWater: this.inWater,
    });
    if (cause && !this.dead) game.onPlayerDeath(cause);
  }

  updateLookDir() {
    const cp = Math.cos(this.pitch);
    this.lookDir.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  updateCamera(camera, dt) {
    this.eyeHeight = damp(this.eyeHeight, this.crouching ? 1.05 : 1.62, 12, dt);
    this.recoilPitch = damp(this.recoilPitch, 0, 9, dt);
    const bob = Math.sin(this.bobPhase * 2) * 0.035 * this.bobAmount;
    camera.position.set(this.position.x, this.position.y + this.eyeHeight + bob, this.position.z);
    camera.rotation.set(this.pitch + this.recoilPitch, this.yaw, 0);
    this.updateLookDir();
    this.underwater = camera.position.y < WATER_LEVEL - 0.05;
  }

  takeDamage(amount, { cause = 'Died', bleed = 0, from = null, silent = false, ignoreArmor = false } = {}) {
    if (this.dead || amount <= 0) return;
    const dmg = ignoreArmor ? amount : amount * (1 - this.inventory.protection());
    this.vitals.health -= dmg;
    if (bleed > 0 && Math.random() < 0.6) this.vitals.bleeding = Math.max(this.vitals.bleeding, bleed * 3);
    if (!silent) {
      this.game.hud.damage(dmg, from);
      this.game.audio.play('hurt', { volume: 0.8 });
    }
    if (this.vitals.health <= 0) {
      this.vitals.health = 0;
      this.game.onPlayerDeath(cause);
    }
  }

  syncCollider() {
    const c = this.collider;
    c.x = this.position.x;
    c.z = this.position.z;
    c.y0 = this.position.y;
    c.y1 = this.position.y + this.height;
    this.game.physics.move(c);
  }

  serialize() {
    return {
      x: this.position.x,
      y: this.position.y,
      z: this.position.z,
      yaw: this.yaw,
      pitch: this.pitch,
      slot: this.activeSlot,
      dead: this.dead,
      vitals: this.vitals.serialize(),
      inventory: this.inventory.serialize(),
    };
  }

  load(data) {
    this.position.set(data.x, data.y, data.z);
    this.velocity.set(0, 0, 0);
    this.yaw = data.yaw ?? 0;
    this.pitch = data.pitch ?? 0;
    this.activeSlot = data.slot ?? 0;
    this.vitals.load(data.vitals);
    this.inventory.load(data.inventory);
    this.onGround = true;
    this.syncCollider();
    this.updateLookDir();
  }
}
