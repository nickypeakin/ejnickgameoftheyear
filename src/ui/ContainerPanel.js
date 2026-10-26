import { renderSlot } from './SlotView.js';

// The right-hand panel shown while looting or using a box, campfire, furnace or
// recycler. Slots carry data-c="ext" so the inventory's drag and drop can reach them.

export class ContainerPanel {
  constructor(game, mount) {
    this.game = game;
    this.mount = mount;
    this.ctx = null;
    this.slots = [];
    mount.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]');
      if (!act || !this.ctx) return;
      const target = this.ctx.target;
      if (act.dataset.act === 'toggle') {
        if (this.ctx.kind === 'oven') target.oven.toggle();
        if (this.ctx.kind === 'recycler') target.recycler.toggle();
        this.game.audio.play('ui_click');
      } else if (act.dataset.act === 'take-all') {
        this.takeAll();
      }
      this.refresh();
    });
  }

  open(ctx) {
    this.ctx = ctx;
    const c = ctx.container;
    let body = '';
    const slot = (i, label = '') => `<div class="slot" data-c="ext" data-i="${i}"${label ? ` data-label="${label}"` : ''}></div>`;
    if (ctx.kind === 'oven') {
      const furnace = ctx.target.type === 'furnace';
      body = `
        <p class="container-note">${furnace ? 'Wood in the fuel slot, ore in the others. Split ore across slots to smelt faster.' : 'Wood in the fuel slot, raw meat in the others.'}</p>
        <div class="oven-row">
          <div class="slot-group"><span class="group-label">Fuel</span>${slot(0, 'Fuel')}</div>
          <div class="slot-group"><span class="group-label">${furnace ? 'Smelting' : 'Cooking'}</span><div class="slot-grid oven-grid">${[1, 2, 3, 4, 5].map((i) => slot(i)).join('')}</div></div>
        </div>
        <div class="container-actions"><span class="container-status"></span><button type="button" class="btn btn-toggle" data-act="toggle"></button></div>`;
    } else if (ctx.kind === 'recycler') {
      body = `
        <p class="container-note">Recycles components and crafted items into scrap and resources.</p>
        <span class="group-label">Input</span>
        <div class="slot-grid six-grid">${[0, 1, 2, 3, 4, 5].map((i) => slot(i)).join('')}</div>
        <span class="group-label">Output</span>
        <div class="slot-grid six-grid">${[6, 7, 8, 9, 10, 11].map((i) => slot(i)).join('')}</div>
        <div class="container-actions"><span class="container-status"></span><button type="button" class="btn btn-toggle" data-act="toggle"></button></div>`;
    } else {
      body = `
        <div class="slot-grid ext-grid">${Array.from({ length: c.size }, (_, i) => slot(i)).join('')}</div>
        <div class="container-actions"><span class="container-status"></span><button type="button" class="btn" data-act="take-all">Take all</button></div>`;
    }
    this.mount.innerHTML = `<div class="container-panel"><h2 class="panel-title">${ctx.title}</h2>${body}</div>`;
    this.slots = [...this.mount.querySelectorAll('.slot')];
    this.status = this.mount.querySelector('.container-status');
    this.toggleBtn = this.mount.querySelector('.btn-toggle');
    this.refresh();
  }

  takeAll() {
    const c = this.ctx.container;
    const inv = this.game.player.inventory;
    let moved = false;
    for (let i = 0; i < c.size; i++) {
      const item = c.get(i);
      if (!item) continue;
      const added = inv.addItem(item, { notify: false });
      if (added > 0) moved = true;
      item.qty -= added;
      if (item.qty <= 0) c.slots[i] = null;
    }
    c.changed();
    if (moved) this.game.audio.play('pickup');
    if (c.isEmpty() && this.ctx.kind === 'loot') this.game.ui.closeAll();
  }

  refresh() {
    if (!this.ctx) return;
    const c = this.ctx.container;
    for (const el of this.slots) renderSlot(el, c.get(Number(el.dataset.i)));
    const target = this.ctx.target;
    if (this.ctx.kind === 'oven') {
      const on = target.oven.on;
      const fuel = c.get(0)?.qty ?? 0;
      this.toggleBtn.textContent = on ? 'Extinguish' : 'Light';
      this.toggleBtn.classList.toggle('on', on);
      this.status.textContent = on ? `Burning · ${fuel} fuel left` : fuel ? `${fuel} fuel ready` : 'No fuel';
    } else if (this.ctx.kind === 'recycler') {
      const on = target.recycler.on;
      this.toggleBtn.textContent = on ? 'Turn off' : 'Turn on';
      this.toggleBtn.classList.toggle('on', on);
      this.status.textContent = on ? 'Recycling…' : 'Idle';
    } else {
      const n = c.items().length;
      this.status.textContent = n ? `${n} stack${n === 1 ? '' : 's'}` : 'Empty';
    }
  }
}
