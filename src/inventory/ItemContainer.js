import { ITEMS } from '../items/ItemDatabase.js';

// A fixed-size grid of item stacks. Items are plain objects:
//   { id, qty, cond?, ammo? }   cond = durability, ammo = rounds loaded in a gun

export function createItem(id, qty = 1) {
  const def = ITEMS[id];
  if (!def) throw new Error(`Unknown item: ${id}`);
  const item = { id, qty };
  if (def.maxCond) item.cond = def.maxCond;
  if (def.type === 'gun') item.ammo = 0;
  return item;
}

export const stackLimit = (id) => ITEMS[id]?.stack ?? 1;

export class ItemContainer {
  constructor(size, { name = 'Container', filter = null } = {}) {
    this.size = size;
    this.name = name;
    this.filter = filter;
    this.slots = new Array(size).fill(null);
    this.listeners = new Set();
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  changed() {
    for (const fn of this.listeners) fn(this);
  }

  get(i) {
    return this.slots[i];
  }

  set(i, item) {
    this.slots[i] = item && item.qty > 0 ? item : null;
    this.changed();
  }

  accepts(item, i) {
    return !this.filter || this.filter(item, i);
  }

  // Stacks into matching slots first, then fills empty ones. Returns the quantity
  // that did not fit. `force` bypasses the slot filter (used by ovens and recyclers
  // writing into their own output slots).
  add(item, { from = 0, to = this.size - 1, force = false } = {}) {
    const limit = stackLimit(item.id);
    let remaining = item.qty;
    if (limit > 1) {
      for (let i = from; i <= to && remaining > 0; i++) {
        const s = this.slots[i];
        if (s && s.id === item.id && s.qty < limit && (force || this.accepts(item, i))) {
          const n = Math.min(limit - s.qty, remaining);
          s.qty += n;
          remaining -= n;
        }
      }
    }
    for (let i = from; i <= to && remaining > 0; i++) {
      if (!this.slots[i] && (force || this.accepts(item, i))) {
        const n = Math.min(limit, remaining);
        this.slots[i] = { ...item, qty: n };
        remaining -= n;
      }
    }
    if (remaining !== item.qty) this.changed();
    return remaining;
  }

  addId(id, qty, opts) {
    return this.add(createItem(id, qty), opts);
  }

  // How many of an item would fit without actually adding it.
  spaceFor(id, { from = 0, to = this.size - 1 } = {}) {
    const limit = stackLimit(id);
    let space = 0;
    for (let i = from; i <= to; i++) {
      const s = this.slots[i];
      if (!s) space += limit;
      else if (s.id === id && limit > 1) space += limit - s.qty;
    }
    return space;
  }

  count(id) {
    let n = 0;
    for (const s of this.slots) if (s && s.id === id) n += s.qty;
    return n;
  }

  remove(id, qty) {
    let left = qty;
    for (let i = this.size - 1; i >= 0 && left > 0; i--) {
      const s = this.slots[i];
      if (!s || s.id !== id) continue;
      const n = Math.min(s.qty, left);
      s.qty -= n;
      left -= n;
      if (s.qty <= 0) this.slots[i] = null;
    }
    if (left !== qty) this.changed();
    return qty - left;
  }

  takeSlot(i, qty = Infinity) {
    const s = this.slots[i];
    if (!s) return null;
    const n = Math.min(qty, s.qty);
    const out = { ...s, qty: n };
    s.qty -= n;
    if (s.qty <= 0) this.slots[i] = null;
    this.changed();
    return out;
  }

  firstEmpty(from = 0, to = this.size - 1) {
    for (let i = from; i <= to; i++) if (!this.slots[i]) return i;
    return -1;
  }

  isEmpty() {
    return this.slots.every((s) => !s);
  }

  items() {
    return this.slots.filter(Boolean);
  }

  clear() {
    this.slots.fill(null);
    this.changed();
  }

  serialize() {
    return this.slots.map((s) => (s ? { ...s } : null));
  }

  load(data) {
    for (let i = 0; i < this.size; i++) {
      const s = data?.[i];
      this.slots[i] = s && ITEMS[s.id] && s.qty > 0 ? { ...s } : null;
    }
    this.changed();
  }
}

// Move a stack (or part of it) between two slots: into an empty slot, merged into a
// matching stack, or swapped with a different item.
export function transfer(src, si, dst, di, qty = null) {
  const a = src.get(si);
  if (!a || (src === dst && si === di)) return false;
  const moveQty = Math.min(qty ?? a.qty, a.qty);
  const b = dst.get(di);
  if (!b) {
    const moving = { ...a, qty: moveQty };
    if (!dst.accepts(moving, di)) return false;
    dst.slots[di] = moving;
    a.qty -= moveQty;
    if (a.qty <= 0) src.slots[si] = null;
  } else if (b.id === a.id && stackLimit(a.id) > 1) {
    const n = Math.min(stackLimit(a.id) - b.qty, moveQty);
    if (n <= 0) return false;
    b.qty += n;
    a.qty -= n;
    if (a.qty <= 0) src.slots[si] = null;
  } else {
    if (moveQty !== a.qty) return false;
    if (!dst.accepts(a, di) || !src.accepts(b, si)) return false;
    dst.slots[di] = a;
    src.slots[si] = b;
  }
  src.changed();
  if (dst !== src) dst.changed();
  return true;
}

// Move a whole stack into whichever slots of another container will take it.
export function quickMove(src, si, dst, range) {
  const a = src.get(si);
  if (!a) return false;
  const left = dst.add({ ...a }, range);
  if (left === a.qty) return false;
  a.qty = left;
  if (a.qty <= 0) src.slots[si] = null;
  src.changed();
  return true;
}
