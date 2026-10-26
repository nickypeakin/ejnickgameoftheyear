import { ITEMS, CATEGORY_LABELS, itemName } from '../items/ItemDatabase.js';
import { getIcon } from '../items/IconRenderer.js';
import { transfer, quickMove } from '../inventory/ItemContainer.js';
import { renderSlot } from './SlotView.js';
import { CraftingPanel } from './CraftingPanel.js';
import { ContainerPanel } from './ContainerPanel.js';

// Full-screen inventory: clothing, main grid, belt, item details, and a side panel
// that shows either crafting or the container being looted.
// Mouse: drag to move, Shift+drag to split, right-click to quick-move, drag
// outside the panels to drop on the ground.

const WEAR_LABELS = ['Head', 'Chest', 'Legs'];

export class InventoryUI {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('inventory');
    this.root.innerHTML = `
      <div class="inv-layout">
        <section class="panel inv-wear" aria-label="Clothing">
          <h2 class="panel-title">Clothing</h2>
          <div class="slot-grid wear-grid">${WEAR_LABELS.map((l, i) => `<div class="slot" data-c="wear" data-i="${i}" data-label="${l}"></div>`).join('')}</div>
          <dl class="wear-stats"></dl>
          <ul class="inv-help">
            <li><b>Drag</b> to move</li>
            <li><b>Shift + drag</b> to split</li>
            <li><b>Right-click</b> to quick move</li>
            <li><b>Drag off the panels</b> to drop</li>
          </ul>
        </section>
        <section class="panel inv-main" aria-label="Inventory">
          <h2 class="panel-title">Inventory</h2>
          <div class="slot-grid main-grid">${Array.from({ length: 24 }, (_, i) => `<div class="slot" data-c="main" data-i="${i}"></div>`).join('')}</div>
          <h2 class="panel-title">Belt</h2>
          <div class="slot-grid belt-grid">${Array.from({ length: 6 }, (_, i) => `<div class="slot" data-c="belt" data-i="${i}" data-key="${i + 1}"></div>`).join('')}</div>
          <div class="item-info"></div>
        </section>
        <section class="panel inv-side">
          <div class="side-tabs" role="tablist">
            <button type="button" class="tab" data-tab="craft" role="tab">Crafting</button>
            <button type="button" class="tab" data-tab="container" role="tab" hidden></button>
          </div>
          <div class="side-body craft-body"></div>
          <div class="side-body container-body" hidden></div>
        </section>
      </div>
      <img class="drag-ghost" hidden alt="">`;
    this.slotEls = [...this.root.querySelectorAll('.inv-wear .slot, .inv-main .slot')];
    this.info = this.root.querySelector('.item-info');
    this.wearStats = this.root.querySelector('.wear-stats');
    this.ghost = this.root.querySelector('.drag-ghost');
    this.craftBody = this.root.querySelector('.craft-body');
    this.containerBody = this.root.querySelector('.container-body');
    this.tabs = [...this.root.querySelectorAll('.tab')];
    this.crafting = new CraftingPanel(game, this.craftBody);
    this.containerPanel = new ContainerPanel(game, this.containerBody);
    this.ext = null;
    this.selected = null;
    this.drag = null;
    this.tab = 'craft';
    this.renderQueued = false;
    this.unsubs = [];
    this.bindEvents();
  }

  get isOpen() {
    return !this.root.hidden;
  }

  containerFor(key) {
    const inv = this.game.player.inventory;
    if (key === 'ext') return this.ext?.container ?? null;
    return inv[key];
  }

  open({ tab = 'craft', container = null } = {}) {
    this.ext = container;
    this.selected = null;
    this.root.hidden = false;
    const containerTab = this.tabs.find((t) => t.dataset.tab === 'container');
    containerTab.hidden = !container;
    if (container) {
      containerTab.textContent = container.title;
      this.containerPanel.open(container);
    }
    this.setTab(container ? 'container' : tab);
    for (const off of this.unsubs) off();
    const containers = [...this.game.player.inventory.containers];
    if (container) containers.push(container.container);
    this.unsubs = containers.map((c) => c.onChange(() => this.queueRender()));
    this.render();
  }

  close() {
    this.endDrag();
    this.root.hidden = true;
    for (const off of this.unsubs) off();
    this.unsubs = [];
    this.ext = null;
  }

  setTab(tab) {
    this.tab = tab;
    for (const t of this.tabs) {
      t.classList.toggle('active', t.dataset.tab === tab);
      t.setAttribute('aria-selected', String(t.dataset.tab === tab));
    }
    this.craftBody.hidden = tab !== 'craft';
    this.containerBody.hidden = tab !== 'container';
    if (tab === 'craft') this.crafting.render();
  }

  queueRender() {
    if (this.renderQueued) return;
    this.renderQueued = true;
    requestAnimationFrame(() => {
      this.renderQueued = false;
      if (this.isOpen) this.render();
    });
  }

  render() {
    for (const el of this.slotEls) {
      const c = this.containerFor(el.dataset.c);
      renderSlot(el, c?.get(Number(el.dataset.i)));
      el.classList.toggle('selected', this.selected?.c === el.dataset.c && this.selected?.i === Number(el.dataset.i));
      if (el.dataset.c === 'belt') el.classList.toggle('active', Number(el.dataset.i) === this.game.player.activeSlot);
    }
    const inv = this.game.player.inventory;
    this.wearStats.innerHTML = `
      <div><dt>Protection</dt><dd>${Math.round(inv.protection() * 100)}%</dd></div>
      <div><dt>Warmth</dt><dd>+${inv.insulation()}°C</dd></div>`;
    if (this.ext) this.containerPanel.refresh();
    if (this.tab === 'craft') this.crafting.render();
    this.renderInfo();
  }

  renderInfo() {
    const sel = this.selected;
    const item = sel ? this.containerFor(sel.c)?.get(sel.i) : null;
    if (!item) {
      this.info.innerHTML = '<p class="info-empty">Select an item to see what it does.</p>';
      return;
    }
    const def = ITEMS[item.id];
    const stats = [];
    if (def.melee && def.type !== 'hammer') {
      stats.push(['Damage', def.melee.damage]);
      const g = def.melee.gather ?? {};
      if (g.tree) stats.push(['Wood per hit', g.tree]);
      if (g.ore) stats.push(['Ore per hit', g.ore]);
      if (g.flesh) stats.push(['Harvesting', g.flesh]);
    }
    if (def.gun) {
      stats.push(['Damage', def.gun.pellets > 1 ? `${def.gun.damage} × ${def.gun.pellets}` : def.gun.damage]);
      stats.push(['Magazine', `${item.ammo ?? 0} / ${def.gun.mag}`]);
      stats.push(['Ammo', itemName(def.gun.ammo)]);
    }
    if (def.bow) {
      stats.push(['Damage', `up to ${def.bow.damage}`]);
      stats.push(['Ammo', itemName(def.bow.ammo)]);
    }
    if (def.use) {
      if (def.use.calories) stats.push(['Calories', `${def.use.calories > 0 ? '+' : ''}${def.use.calories}`]);
      if (def.use.hydration) stats.push(['Hydration', `${def.use.hydration > 0 ? '+' : ''}${def.use.hydration}`]);
      if (def.use.heal) stats.push(['Health', `${def.use.heal > 0 ? '+' : ''}${def.use.heal}`]);
      if (def.use.healOverTime) stats.push(['Healing over time', `+${def.use.healOverTime}`]);
      if (def.use.stopBleed) stats.push(['Stops bleeding', 'Yes']);
    }
    if (def.attire) {
      stats.push(['Protection', `${Math.round(def.attire.protection * 100)}%`]);
      stats.push(['Warmth', `+${def.attire.insulation}°C`]);
    }
    if (def.cook) stats.push([def.cook.ovens.includes('campfire') ? 'Cooks into' : 'Smelts into', `${itemName(def.cook.to)} (${def.cook.ovens.join(' or ')})`]);
    if (def.fuel) stats.push(['Fuel', 'Burns in campfires and furnaces']);
    if (def.maxCond) stats.push(['Condition', `${Math.ceil(item.cond)} / ${def.maxCond}`]);
    const actions = [];
    if (def.type === 'consumable' && sel.c !== 'ext') actions.push(`<button type="button" class="btn" data-info="use">${def.category === 'medical' ? 'Use' : 'Eat'}</button>`);
    if (item.qty > 1) actions.push('<button type="button" class="btn" data-info="split">Split</button>');
    actions.push('<button type="button" class="btn btn-ghost" data-info="drop">Drop</button>');
    this.info.innerHTML = `
      <div class="info-head">
        <img src="${getIcon(item.id)}" alt="">
        <div><h3>${def.name}${item.qty > 1 ? ` <small>×${item.qty}</small>` : ''}</h3><p class="info-cat">${CATEGORY_LABELS[def.category]}</p></div>
      </div>
      <p class="info-desc">${def.desc}</p>
      ${stats.length ? `<dl class="info-stats">${stats.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>` : ''}
      <div class="info-actions">${actions.join('')}</div>`;
  }

  bindEvents() {
    const root = this.root;
    root.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const slot = e.target.closest('.slot[data-c]');
      if (!slot) return;
      const c = this.containerFor(slot.dataset.c);
      const i = Number(slot.dataset.i);
      if (!c?.get(i)) return;
      e.preventDefault();
      this.drag = { key: slot.dataset.c, c, i, x: e.clientX, y: e.clientY, started: false, half: e.shiftKey, el: slot };
    });
    window.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d) return;
      if (!d.started && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) {
        d.started = true;
        const item = d.c.get(d.i);
        if (!item) {
          this.endDrag();
          return;
        }
        this.ghost.src = getIcon(item.id);
        this.ghost.hidden = false;
        d.el.classList.add('dragging');
      }
      if (d.started) {
        this.ghost.style.transform = `translate(${e.clientX - 28}px, ${e.clientY - 28}px)`;
      }
    });
    window.addEventListener('pointerup', (e) => {
      const d = this.drag;
      if (!d) return;
      if (d.started) {
        const under = document.elementFromPoint(e.clientX, e.clientY);
        const target = under?.closest('.slot[data-c]');
        const item = d.c.get(d.i);
        const qty = item && d.half ? Math.ceil(item.qty / 2) : null;
        if (target && item) {
          const dst = this.containerFor(target.dataset.c);
          const di = Number(target.dataset.i);
          if (dst && transfer(d.c, d.i, dst, di, qty)) {
            this.game.audio.play('ui_click');
            this.selected = { c: target.dataset.c, i: di };
          }
        } else if (item && this.isOpen && !under?.closest('.panel')) {
          this.dropToWorld(d.c, d.i, qty ?? item.qty);
        }
      } else {
        this.selected = { c: d.key, i: d.i };
        this.game.audio.play('ui_click');
      }
      this.endDrag();
      this.render();
    });
    root.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const slot = e.target.closest('.slot[data-c]');
      if (slot) this.quickMove(slot.dataset.c, Number(slot.dataset.i));
    });
    root.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-tab]');
      if (tab) {
        this.setTab(tab.dataset.tab);
        this.game.audio.play('ui_click');
        return;
      }
      const act = e.target.closest('[data-info]');
      if (act) this.infoAction(act.dataset.info);
    });
  }

  endDrag() {
    if (this.drag?.el) this.drag.el.classList.remove('dragging');
    this.drag = null;
    this.ghost.hidden = true;
  }

  dropToWorld(container, index, qty) {
    const taken = container.takeSlot(index, qty);
    if (!taken) return;
    const p = this.game.player;
    const d = p.lookDir;
    this.game.entities.dropItem(taken, p.dropPosition(), { x: d.x * 3, y: 2.5, z: d.z * 3 });
    this.game.audio.play('ui_click');
  }

  quickMove(key, index) {
    const inv = this.game.player.inventory;
    const src = this.containerFor(key);
    const item = src?.get(index);
    if (!item) return;
    const def = ITEMS[item.id];
    let moved = false;
    if (this.ext) {
      const ext = this.ext.container;
      if (key === 'ext') {
        const added = inv.addItem(item, { notify: false });
        item.qty -= added;
        if (item.qty <= 0) src.slots[index] = null;
        src.changed();
        moved = added > 0;
      } else if (this.ext.kind === 'oven' && def.fuel) {
        moved = quickMove(src, index, ext, { from: 0, to: 0 }) || quickMove(src, index, ext, { from: 1, to: 5 });
      } else if (this.ext.kind === 'oven') {
        moved = quickMove(src, index, ext, { from: 1, to: 5 });
      } else if (this.ext.kind === 'recycler') {
        moved = quickMove(src, index, ext, { from: 0, to: 5 });
      } else {
        moved = quickMove(src, index, ext);
      }
    } else if (def.attire && key !== 'wear') {
      moved = transfer(src, index, inv.wear, def.attire.slot);
    } else if (key === 'wear') {
      moved = quickMove(src, index, inv.main) || quickMove(src, index, inv.belt);
    } else if (key === 'main') {
      moved = quickMove(src, index, inv.belt);
    } else {
      moved = quickMove(src, index, inv.main);
    }
    if (moved) this.game.audio.play('ui_click');
    this.render();
  }

  infoAction(action) {
    const sel = this.selected;
    if (!sel) return;
    const c = this.containerFor(sel.c);
    const item = c?.get(sel.i);
    if (!item) return;
    const def = ITEMS[item.id];
    if (action === 'use' && def.use) {
      this.game.player.vitals.apply(def.use);
      this.game.audio.play(def.use.sound ?? 'eat');
      item.qty -= 1;
      if (item.qty <= 0) c.slots[sel.i] = null;
      c.changed();
    } else if (action === 'split') {
      const empty = c.firstEmpty();
      if (empty < 0) {
        this.game.hud.flashHint('No free slot to split into');
        return;
      }
      transfer(c, sel.i, c, empty, Math.floor(item.qty / 2));
    } else if (action === 'drop') {
      this.dropToWorld(c, sel.i, item.qty);
    }
    this.render();
  }

  tick() {
    if (this.tab === 'craft') this.crafting.tick();
    else if (this.ext) this.containerPanel.refresh();
  }
}
