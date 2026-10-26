import { ItemContainer, createItem } from './ItemContainer.js';
import { ITEMS, BELT_TYPES } from '../items/ItemDatabase.js';

// The player's three containers: 24 main slots, 6 belt slots (the hotbar) and
// 3 clothing slots (head, chest, legs).
export class PlayerInventory {
  constructor(game) {
    this.game = game;
    this.main = new ItemContainer(24, { name: 'Inventory' });
    this.belt = new ItemContainer(6, { name: 'Belt' });
    this.wear = new ItemContainer(3, {
      name: 'Clothing',
      filter: (item, i) => ITEMS[item.id]?.attire?.slot === i,
    });
  }

  get containers() {
    return [this.main, this.belt, this.wear];
  }

  // Add as much of a stack as fits, preferring the belt for things you hold and
  // use. Returns the quantity added.
  addItem(item, { notify = true } = {}) {
    const def = ITEMS[item.id];
    const order = BELT_TYPES.has(def.type) ? [this.belt, this.main] : [this.main, this.belt];
    let left = item.qty;
    for (const c of order) {
      if (left <= 0) break;
      left = c.add({ ...item, qty: left });
    }
    const added = item.qty - left;
    if (notify && added > 0) this.game.events.emit('itemGained', { id: item.id, qty: added });
    return added;
  }

  // Like addItem, but anything that does not fit is dropped at the player's feet.
  giveItem(item, opts) {
    const added = this.addItem(item, opts);
    const left = item.qty - added;
    if (left > 0) {
      this.game.entities.dropItem({ ...item, qty: left }, this.game.player.dropPosition());
      this.game.hud.flashHint('Inventory full, item dropped');
    }
    return added;
  }

  give(id, qty, opts) {
    if (qty <= 0) return 0;
    return this.giveItem(createItem(id, qty), opts);
  }

  count(id) {
    return this.main.count(id) + this.belt.count(id);
  }

  has(cost, times = 1) {
    return Object.entries(cost).every(([id, qty]) => this.count(id) >= qty * times);
  }

  take(id, qty) {
    let removed = this.main.remove(id, qty);
    if (removed < qty) removed += this.belt.remove(id, qty - removed);
    return removed;
  }

  takeCost(cost, times = 1) {
    if (!this.has(cost, times)) return false;
    for (const [id, qty] of Object.entries(cost)) this.take(id, qty * times);
    return true;
  }

  protection() {
    let p = 0;
    for (const s of this.wear.slots) if (s) p += ITEMS[s.id].attire.protection;
    return Math.min(0.6, p);
  }

  insulation() {
    let n = 0;
    for (const s of this.wear.slots) if (s) n += ITEMS[s.id].attire.insulation;
    return n;
  }

  allItems() {
    return [...this.main.items(), ...this.belt.items(), ...this.wear.items()].map((s) => ({ ...s }));
  }

  clear() {
    for (const c of this.containers) c.clear();
  }

  serialize() {
    return { main: this.main.serialize(), belt: this.belt.serialize(), wear: this.wear.serialize() };
  }

  load(data) {
    this.main.load(data?.main);
    this.belt.load(data?.belt);
    this.wear.load(data?.wear);
  }
}
