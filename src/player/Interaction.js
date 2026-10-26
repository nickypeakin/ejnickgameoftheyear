import { WATER_LEVEL } from '../world/Terrain.js';

// Works out what the player is looking at: something to use with E, water to
// drink, or just a name to show under the crosshair.

const REACH = 3;

export class Interaction {
  constructor(game) {
    this.game = game;
    this.current = null;
    this.describe = '';
    this.drinkCooldown = 0;
  }

  lookTarget(range = REACH) {
    const game = this.game;
    const cam = game.camera.position;
    const d = game.player.lookDir;
    const hit = game.physics.raycast(cam.x, cam.y, cam.z, d.x, d.y, d.z, range, { ignore: game.player.collider, inflate: 0.06 });
    return hit?.owner ?? null;
  }

  update(dt, input, enabled) {
    this.drinkCooldown -= dt;
    this.current = null;
    this.describe = '';
    if (!enabled) return;
    const game = this.game;
    const player = game.player;
    const cam = game.camera.position;
    const d = player.lookDir;
    const hit = game.physics.raycast(cam.x, cam.y, cam.z, d.x, d.y, d.z, REACH, { ignore: player.collider, inflate: 0.06 });
    const owner = hit?.owner;
    let info = owner?.getInteraction ? owner.getInteraction() : null;

    if (!info) {
      let lookingAtWater = false;
      if (d.y < -0.05) {
        const t = (WATER_LEVEL - cam.y) / d.y;
        lookingAtWater = t > 0 && t < REACH && (!hit || t < hit.dist + 0.05);
      }
      if (lookingAtWater || player.underwater) info = { label: 'Drink water', action: () => this.drink() };
    }
    if (!info && owner) this.describe = this.describeOwner(owner);
    this.current = info;
    if (info?.action && input.wasPressed('KeyE')) info.action();
  }

  describeOwner(owner) {
    switch (owner.kind) {
      case 'resource':
        return owner.name;
      case 'animal':
      case 'corpse':
        return owner.label ?? '';
      case 'building':
        return this.game.building.label(owner);
      case 'barrel':
        return 'Barrel · break it open';
      default:
        return '';
    }
  }

  drink() {
    if (this.drinkCooldown > 0) return;
    this.drinkCooldown = 0.7;
    this.game.player.vitals.apply({ hydration: 25 });
    this.game.audio.play('drink');
  }
}
