import * as THREE from '../lib/three.js';
import { ITEMS, itemName } from '../items/ItemDatabase.js';
import { PIECES, PIECE_ORDER, GRADES, gradeCost } from '../building/BuildingSystem.js';
import { getIcon } from '../items/IconRenderer.js';

// What the held item does: melee swings and gathering, bow and gun fire, eating
// and healing, building-plan and deployable placement, and the hammer's menu.

const meleeFilter = (c) => c.layer !== 'pickup' && c.layer !== 'drop';
const shotFilter = (c) => c.layer !== 'pickup' && c.layer !== 'drop' && c.layer !== 'corpse';

const HIT_SOUNDS = { wood: 'hit_wood', stone: 'hit_stone', flesh: 'hit_flesh', metal: 'hit_metal', ground: 'hit_ground', none: 'hit_ground' };

function costText(cost) {
  return Object.entries(cost).map(([id, n]) => `${n} ${itemName(id)}`).join(', ');
}

export class ItemActions {
  constructor(game) {
    this.game = game;
    this.currentItem = null;
    this.currentId = null;
    this.cooldown = 0;
    this.pendingHit = -1;
    this.draw = 0;
    this.reloading = 0;
    this.useTimer = -1;
    this.rot = 0;
    this.buildType = 'foundation';
    this.aiming = false;
    this.tmpDir = new THREE.Vector3();
    this.tmpOrigin = new THREE.Vector3();
  }

  get player() {
    return this.game.player;
  }

  onEquip(item) {
    const game = this.game;
    this.currentItem = item;
    this.currentId = item?.id ?? null;
    this.pendingHit = -1;
    this.draw = 0;
    this.reloading = 0;
    this.useTimer = -1;
    this.aiming = false;
    this.cooldown = Math.max(this.cooldown, 0.25);
    game.viewModel.setItem(this.currentId);
    game.building.hideGhost();
    game.deployables.hideGhost();
    game.ui.radial.close(false);
    const type = item ? ITEMS[item.id].type : null;
    if (type === 'deployable') this.rot = ((Math.round((this.player.yaw + Math.PI) / (Math.PI / 2)) % 4) + 4) % 4;
  }

  update(dt, input, enabled) {
    const game = this.game;
    const player = this.player;
    const item = player.activeItem;
    if (item !== this.currentItem || (item?.id ?? null) !== this.currentId) this.onEquip(item);
    this.cooldown -= dt;
    this.updateTorch(item);
    const def = item ? ITEMS[item.id] : null;
    if (!enabled || player.dead || !def) {
      this.aiming = false;
      if (!enabled) {
        game.building.hideGhost();
        game.deployables.hideGhost();
      }
      return;
    }
    switch (def.type) {
      case 'melee':
        this.handleMelee(dt, input, item, def);
        break;
      case 'hammer':
        this.handleHammer(dt, input, item, def);
        break;
      case 'bow':
        this.handleBow(dt, input, item, def);
        break;
      case 'gun':
        this.handleGun(dt, input, item, def);
        break;
      case 'consumable':
        this.handleConsumable(dt, input, item, def);
        break;
      case 'buildplan':
        this.handleBuildPlan(input);
        break;
      case 'deployable':
        this.handleDeployable(input, item, def);
        break;
      case 'door':
        this.handleDoor(input, item);
        break;
      default:
        break;
    }
  }

  updateTorch(item) {
    const light = this.game.effects.torchLight;
    if (item?.id === 'torch' && !this.player.dead) {
      const cam = this.game.camera;
      const d = this.player.lookDir;
      light.position.set(cam.position.x + d.x * 0.5 + Math.cos(this.player.yaw) * 0.3, cam.position.y + 0.15, cam.position.z + d.z * 0.5 - Math.sin(this.player.yaw) * 0.3);
      light.intensity = 7 + Math.sin(performance.now() * 0.02) * 0.6 + Math.random() * 0.5;
    } else {
      light.intensity = 0;
    }
  }

  // ---- melee -----------------------------------------------------------------

  handleMelee(dt, input, item, def) {
    if (this.pendingHit >= 0) {
      this.pendingHit -= dt;
      if (this.pendingHit < 0) this.meleeHit(item, def);
    }
    if (input.mouseDown(0) && this.cooldown <= 0) {
      const rate = def.melee.rate;
      this.cooldown = rate;
      this.pendingHit = rate * 0.42;
      this.game.viewModel.swing(rate);
      this.game.audio.play('swing', { volume: 0.5 });
    }
  }

  meleeHit(item, def) {
    const game = this.game;
    const cam = game.camera.position;
    const d = this.player.lookDir;
    const hit = game.physics.raycast(cam.x, cam.y, cam.z, d.x, d.y, d.z, def.melee.range, {
      ignore: this.player.collider,
      inflate: 0.15,
      filter: meleeFilter,
    });
    if (!hit) return;
    const ctx = {
      tool: def,
      item,
      player: this.player,
      point: { x: hit.x, y: hit.y, z: hit.z },
      normal: { x: hit.nx, y: hit.ny, z: hit.nz },
    };
    let material = 'stone';
    const owner = hit.owner;
    if (owner?.onMeleeHit) {
      const result = owner.onMeleeHit(ctx);
      material = result?.material ?? 'stone';
      if (result?.damaged) game.hud.hitmarker(result.killed);
    } else if (hit.layer === 'terrain') {
      material = 'ground';
      game.effects.burst(hit.x, hit.y, hit.z, { count: 5, color: 0x6b5a40, speed: 2, size: 0.05, life: 0.5 });
    } else if (hit.layer === 'building' && owner?.grade !== undefined) {
      material = owner.grade >= 2 ? (owner.grade === 3 ? 'metal' : 'stone') : 'wood';
    } else if (hit.layer === 'deployable' || hit.layer === 'container') {
      material = 'wood';
    }
    game.audio.play(HIT_SOUNDS[material] ?? 'hit_stone', { x: hit.x, y: hit.y, z: hit.z });
    this.wear(item, def);
  }

  // Lose one point of durability; the item breaks at zero.
  wear(item, def) {
    if (!def.maxCond || item.cond === undefined) return;
    item.cond -= 1;
    const belt = this.player.inventory.belt;
    if (item.cond <= 0) {
      const slot = belt.slots.indexOf(item);
      if (slot >= 0) belt.set(slot, null);
      this.game.hud.flashHint(`${def.name} broke`);
      this.game.audio.play('hit_metal', { volume: 0.5 });
    } else {
      belt.changed();
    }
  }

  // ---- hammer ----------------------------------------------------------------

  handleHammer(dt, input, item, def) {
    if (this.game.ui.radial.isOpen) return;
    this.handleMelee(dt, input, item, def);
    if (!input.mousePressed(2)) return;
    const target = this.game.interaction.lookTarget(4);
    if (!target) return;
    const game = this.game;
    const options = [];
    if (target.kind === 'building') {
      const building = game.building;
      for (let g = target.grade + 1; g < GRADES.length; g++) {
        const cost = gradeCost(target.type, g);
        options.push({
          label: GRADES[g].name,
          sub: costText(cost),
          icon: getIcon(GRADES[g].resource),
          disabled: !this.player.inventory.has(cost),
          action: () => building.upgrade(target, g),
        });
      }
      if (target.type === 'stairs') options.push({ label: 'Rotate', sub: 'Turn 90°', action: () => building.rotate(target) });
      options.push({ label: 'Demolish', sub: 'Refunds some wood', danger: true, action: () => building.demolish(target) });
      game.ui.radial.open(building.label(target), options);
    } else if (target.kind === 'door') {
      game.ui.radial.open('Wooden Door', [{ label: 'Pick up', sub: 'Return to inventory', action: () => game.building.pickupDoor(target) }]);
    } else if (target.kind === 'deployable' && !target.def.fixed) {
      game.ui.radial.open(target.def.name, [{ label: 'Pick up', sub: 'Must be empty', action: () => game.deployables.pickup(target) }]);
    }
  }

  // ---- bow -------------------------------------------------------------------

  handleBow(dt, input, item, def) {
    const bow = def.bow;
    const inv = this.player.inventory;
    const arrows = inv.count(bow.ammo);
    this.aiming = input.mouseDown(2);
    if (input.mouseDown(0) && arrows > 0 && !this.player.sprinting) {
      if (this.draw === 0) this.game.audio.play('bow_draw', { volume: 0.6 });
      this.draw = Math.min(bow.drawTime, this.draw + dt);
    } else if (this.draw > 0) {
      if (this.draw >= 0.2 && arrows > 0) this.fireArrow(item, def, this.draw / bow.drawTime);
      this.draw = 0;
    }
    if (input.mousePressed(0) && arrows === 0) this.game.hud.flashHint('No wooden arrows');
    this.game.viewModel.setDraw(this.draw / bow.drawTime);
  }

  fireArrow(item, def, power) {
    const game = this.game;
    const bow = def.bow;
    const d = this.tmpDir.copy(this.player.lookDir);
    const spread = this.aiming ? 0.004 : 0.016;
    d.x += (Math.random() * 2 - 1) * spread;
    d.y += (Math.random() * 2 - 1) * spread;
    d.z += (Math.random() * 2 - 1) * spread;
    d.normalize();
    const origin = this.tmpOrigin.copy(game.camera.position).addScaledVector(d, 0.4);
    game.projectiles.fireArrow(origin, d, bow.speed * (0.45 + 0.55 * power), bow.damage * (0.35 + 0.65 * power));
    this.player.inventory.take(bow.ammo, 1);
    game.audio.play('bow_release');
    this.wear(item, def);
  }

  // ---- guns ------------------------------------------------------------------

  handleGun(dt, input, item, def) {
    const gun = def.gun;
    this.aiming = input.mouseDown(2) && this.reloading <= 0;
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) this.finishReload(item, def);
      return;
    }
    if (input.wasPressed('KeyR')) {
      this.startReload(item, def);
      return;
    }
    if (input.mousePressed(0) && this.cooldown <= 0) {
      if (item.ammo <= 0) {
        this.game.audio.play('dry_fire');
        this.startReload(item, def);
        return;
      }
      this.fireGun(item, def);
      this.cooldown = gun.rate;
    }
  }

  startReload(item, def) {
    const gun = def.gun;
    if (item.ammo >= gun.mag) return;
    if (this.player.inventory.count(gun.ammo) <= 0) {
      this.game.hud.flashHint(`No ${itemName(gun.ammo).toLowerCase()}s`);
      return;
    }
    this.reloading = gun.reload;
    this.game.viewModel.reload(gun.reload);
    this.game.audio.play('reload');
  }

  finishReload(item, def) {
    const gun = def.gun;
    const taken = this.player.inventory.take(gun.ammo, gun.mag - item.ammo);
    item.ammo += taken;
    this.player.inventory.belt.changed();
  }

  fireGun(item, def) {
    const game = this.game;
    const gun = def.gun;
    const cam = game.camera.position;
    const look = this.player.lookDir;
    item.ammo -= 1;
    const moving = this.player.moving ? 1.6 : 1;
    const spread = (this.aiming ? gun.adsSpread : gun.spread) * moving;
    const right = { x: Math.cos(this.player.yaw), z: -Math.sin(this.player.yaw) };
    const muzzle = {
      x: cam.x + look.x * 0.6 + right.x * (this.aiming ? 0 : 0.14),
      y: cam.y + look.y * 0.6 - (this.aiming ? 0.06 : 0.12),
      z: cam.z + look.z * 0.6 + right.z * (this.aiming ? 0 : 0.14),
    };
    let hitSomething = false;
    let killed = false;
    let headshot = false;
    for (let i = 0; i < gun.pellets; i++) {
      const d = this.tmpDir.copy(look);
      d.x += (Math.random() * 2 - 1) * spread;
      d.y += (Math.random() * 2 - 1) * spread;
      d.z += (Math.random() * 2 - 1) * spread;
      d.normalize();
      const hit = game.physics.raycast(cam.x, cam.y, cam.z, d.x, d.y, d.z, gun.range, { ignore: this.player.collider, filter: shotFilter });
      const end = hit ?? { x: cam.x + d.x * gun.range, y: cam.y + d.y * gun.range, z: cam.z + d.z * gun.range };
      if (i < 3) game.effects.tracer(muzzle.x, muzzle.y, muzzle.z, end.x, end.y, end.z);
      if (!hit) continue;
      const target = hit.owner;
      if (target?.takeDamage && !target.dead) {
        const falloff = hit.dist > 30 ? Math.max(0.5, 1 - (hit.dist - 30) / gun.range) : 1;
        const result = target.takeDamage({ damage: gun.damage * falloff, point: hit, attacker: this.player });
        hitSomething = true;
        killed = killed || result?.killed;
        headshot = headshot || result?.headshot;
      } else {
        const color = hit.layer === 'terrain' ? 0x6b5a40 : 0xa09a8a;
        game.effects.burst(hit.x, hit.y, hit.z, { count: 4, color, speed: 2, size: 0.04, life: 0.4, normal: { x: hit.nx, y: hit.ny, z: hit.nz } });
      }
    }
    if (hitSomething) game.hud.hitmarker(killed, headshot);
    game.effects.muzzleFlash(muzzle.x, muzzle.y, muzzle.z);
    game.audio.play(gun.sound);
    this.player.recoilPitch += gun.recoil * (this.aiming ? 0.6 : 1);
    this.player.pitch += gun.recoil * 0.35;
    game.viewModel.recoil(gun.pellets > 1 ? 1.4 : 1);
    game.entities.noise(this.player.position.x, this.player.position.z, 90);
    this.wear(item, def);
  }

  // ---- food and medicine -----------------------------------------------------

  handleConsumable(dt, input, item, def) {
    if (this.useTimer >= 0) {
      this.useTimer -= dt;
      if (this.useTimer < 0) this.consume(item, def);
      return;
    }
    if (input.mousePressed(0) && this.cooldown <= 0) {
      this.useTimer = def.use.time;
      this.game.viewModel.use(def.use.time);
      this.game.audio.play(def.use.sound ?? 'eat');
    }
  }

  consume(item, def) {
    const belt = this.player.inventory.belt;
    const slot = belt.slots.indexOf(item);
    if (slot < 0) return;
    this.player.vitals.apply(def.use);
    item.qty -= 1;
    if (item.qty <= 0) belt.set(slot, null);
    else belt.changed();
    this.cooldown = 0.3;
    if (def.use.heal < 0) this.game.hud.flashHint('Raw meat made you sick. Cook it on a campfire.');
  }

  // ---- placement ---------------------------------------------------------------

  handleBuildPlan(input) {
    const game = this.game;
    if (game.ui.radial.isOpen) {
      game.building.hideGhost();
      return;
    }
    if (input.mousePressed(2)) {
      const options = PIECE_ORDER.map((type) => ({
        label: PIECES[type].name,
        sub: costText(gradeCost(type, 0)),
        selected: type === this.buildType,
        action: () => {
          this.buildType = type;
        },
      }));
      game.ui.radial.open('Building Plan', options);
      return;
    }
    if (input.wasPressed('KeyR')) this.rot = (this.rot + 1) % 4;
    game.building.updatePlacement(this.buildType, this.rot);
    if (input.mousePressed(0)) game.building.place();
  }

  handleDeployable(input, item, def) {
    const game = this.game;
    if (input.wasPressed('KeyR')) this.rot = (this.rot + 1) % 4;
    game.deployables.updatePlacement(def.deploy, this.rot);
    if (input.mousePressed(0) && game.deployables.place()) this.consumeOne(item);
  }

  handleDoor(input, item) {
    const game = this.game;
    game.building.updateDoorPlacement();
    if (input.mousePressed(0) && game.building.placeDoor()) this.consumeOne(item);
  }

  consumeOne(item) {
    const belt = this.player.inventory.belt;
    const slot = belt.slots.indexOf(item);
    if (slot < 0) return;
    item.qty -= 1;
    if (item.qty <= 0) belt.set(slot, null);
    else belt.changed();
  }

  // Short text for the HUD describing controls of the held item.
  controlsHint() {
    const item = this.player.activeItem;
    const def = item ? ITEMS[item.id] : null;
    if (!def) return '';
    switch (def.type) {
      case 'buildplan':
        return `${PIECES[this.buildType].name} · ${costText(gradeCost(this.buildType, 0))} · Right mouse: choose piece${this.buildType === 'stairs' ? ' · R: rotate' : ''}`;
      case 'deployable':
        return 'Left mouse: place · R: rotate';
      case 'door':
        return 'Left mouse: place in a doorway';
      case 'hammer':
        return 'Hold right mouse on a building piece to upgrade or demolish';
      case 'bow':
        return 'Hold left mouse to draw · Right mouse: aim';
      case 'gun':
        return 'Left mouse: fire · Right mouse: aim · R: reload';
      case 'consumable':
        return def.category === 'medical' ? 'Left mouse: use' : 'Left mouse: eat';
      default:
        return '';
    }
  }
}
