import { HUD } from './HUD.js';
import { InventoryUI } from './InventoryUI.js';
import { MapUI } from './MapUI.js';
import { RadialMenu } from './RadialMenu.js';
import { Menus } from './Menus.js';

// Owns every overlay and decides which modal (inventory or map) is open. Opening a
// modal releases the mouse pointer; closing it captures the pointer again.
export class UIManager {
  constructor(game) {
    this.game = game;
    this.hud = new HUD(game);
    this.inventory = new InventoryUI(game);
    this.map = new MapUI(game);
    this.radial = new RadialMenu(game);
    this.menus = new Menus(game);
    this.modal = null;
    this.openTarget = null;
  }

  get isModalOpen() {
    return this.modal !== null;
  }

  beginModal(name) {
    this.radial.close(false);
    this.modal = name;
    this.game.input.reset();
    this.game.input.exitLock();
    this.game.audio.play('ui_open');
  }

  openInventory(tab = 'craft') {
    if (this.modal === 'map') this.map.close();
    this.beginModal('inventory');
    this.inventory.open({ tab });
  }

  openContainer(ctx) {
    if (this.modal) this.closeAll({ relock: false });
    this.beginModal('inventory');
    this.openTarget = ctx.target;
    this.inventory.open({ container: ctx });
  }

  openMap() {
    if (this.modal === 'inventory') this.inventory.close();
    this.beginModal('map');
    this.map.open();
  }

  toggleInventory(tab) {
    if (this.modal === 'inventory') this.closeAll();
    else this.openInventory(tab);
  }

  toggleMap() {
    if (this.modal === 'map') this.closeAll();
    else this.openMap();
  }

  closeAll({ relock = true } = {}) {
    if (!this.modal) return;
    const target = this.openTarget;
    this.inventory.close();
    this.map.close();
    this.modal = null;
    this.openTarget = null;
    target?.onClosed?.();
    if (relock && this.game.state === 'playing' && !this.game.player?.dead) this.game.input.requestLock();
  }

  tick() {
    if (this.modal === 'inventory') this.inventory.tick();
    if (this.modal === 'map') this.map.draw();
  }
}
