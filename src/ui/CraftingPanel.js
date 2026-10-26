import { RECIPES, RECIPE_BY_ID } from '../items/Recipes.js';
import { ITEMS, CATEGORY_LABELS, itemName } from '../items/ItemDatabase.js';
import { getIcon } from '../items/IconRenderer.js';

// Crafting tab: category filter, search, recipe grid, details with ingredient
// counts, an amount stepper and the live crafting queue.

const CATEGORY_ORDER = ['all', 'tools', 'weapons', 'ammo', 'construction', 'items', 'medical', 'attire', 'resources'];

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export class CraftingPanel {
  constructor(game, mount) {
    this.game = game;
    this.mount = mount;
    this.category = 'all';
    this.search = '';
    this.selected = 'stone_hatchet';
    this.amount = 1;
    const cats = CATEGORY_ORDER.filter((c) => c === 'all' || RECIPES.some((r) => r.category === c));
    mount.innerHTML = `
      <div class="craft">
        <div class="craft-top">
          <label class="visually-hidden" for="craft-search">Search recipes</label>
          <input id="craft-search" class="craft-search" type="search" placeholder="Search recipes" autocomplete="off">
          <div class="craft-cats">${cats.map((c) => `<button type="button" class="chip-btn" data-cat="${c}">${c === 'all' ? 'All' : CATEGORY_LABELS[c]}</button>`).join('')}</div>
        </div>
        <div class="craft-grid"></div>
        <div class="craft-detail"></div>
        <div class="craft-queue-list"></div>
      </div>`;
    this.grid = mount.querySelector('.craft-grid');
    this.detail = mount.querySelector('.craft-detail');
    this.queueEl = mount.querySelector('.craft-queue-list');
    this.searchEl = mount.querySelector('.craft-search');
    this.catButtons = [...mount.querySelectorAll('[data-cat]')];

    this.searchEl.addEventListener('input', () => {
      this.search = this.searchEl.value.trim().toLowerCase();
      this.render();
    });
    this.searchEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Tab') {
        e.preventDefault();
        this.searchEl.blur();
        game.ui.closeAll();
      }
      e.stopPropagation();
    });
    mount.addEventListener('click', (e) => {
      const cat = e.target.closest('[data-cat]');
      if (cat) {
        this.category = cat.dataset.cat;
        this.game.audio.play('ui_click');
        this.render();
        return;
      }
      const recipe = e.target.closest('[data-recipe]');
      if (recipe) {
        this.selected = recipe.dataset.recipe;
        this.amount = 1;
        this.game.audio.play('ui_click');
        this.render();
        return;
      }
      const act = e.target.closest('[data-act]');
      if (!act) return;
      const r = RECIPE_BY_ID[this.selected];
      switch (act.dataset.act) {
        case 'minus':
          this.amount = Math.max(1, this.amount - 1);
          break;
        case 'plus':
          this.amount = Math.min(99, this.amount + 1);
          break;
        case 'max':
          this.amount = Math.max(1, this.game.crafting.maxCraftable(r));
          break;
        case 'craft':
          if (this.game.crafting.enqueue(r.id, this.amount)) this.amount = 1;
          break;
        case 'cancel':
          this.game.crafting.cancel(Number(act.dataset.index));
          break;
        default:
          break;
      }
      this.render();
    });
    game.events.on('craftQueueChanged', () => {
      if (!this.mount.hidden) this.render();
    });
  }

  visibleRecipes() {
    return RECIPES.filter((r) => {
      if (this.category !== 'all' && r.category !== this.category) return false;
      if (this.search && !ITEMS[r.out].name.toLowerCase().includes(this.search)) return false;
      return true;
    });
  }

  render() {
    const game = this.game;
    const inv = game.player.inventory;
    const wb = game.crafting.workbenchLevel();
    for (const b of this.catButtons) b.classList.toggle('active', b.dataset.cat === this.category);

    const list = this.visibleRecipes();
    this.grid.innerHTML = list.length
      ? list.map((r) => {
        const can = inv.has(r.cost) && r.workbench <= wb;
        return `<button type="button" class="recipe${can ? ' can' : ''}${r.id === this.selected ? ' selected' : ''}" data-recipe="${r.id}" title="${ITEMS[r.out].name}">
          <img src="${getIcon(r.out)}" alt="">
          <span>${ITEMS[r.out].name}</span>
          ${r.workbench ? `<em class="wb-badge">WB${r.workbench}</em>` : ''}
        </button>`;
      }).join('')
      : `<p class="empty-note">No recipes match “${escapeHtml(this.search)}”.</p>`;

    const r = RECIPE_BY_ID[this.selected];
    const def = ITEMS[r.out];
    const check = game.crafting.check(r, this.amount);
    const rows = Object.entries(r.cost).map(([id, qty]) => {
      const need = qty * this.amount;
      const have = inv.count(id);
      return `<tr class="${have >= need ? 'ok' : 'missing'}"><td><img src="${getIcon(id)}" alt=""></td><td>${itemName(id)}</td><td class="num">${need}</td><td class="num have">${have}</td></tr>`;
    }).join('');
    this.detail.innerHTML = `
      <div class="detail-head">
        <img src="${getIcon(r.out)}" alt="">
        <div>
          <h3>${def.name}${r.amount > 1 ? ` <small>×${r.amount}</small>` : ''}</h3>
          <p>${def.desc}</p>
        </div>
      </div>
      <table class="cost-table">
        <thead><tr><th></th><th>Ingredient</th><th class="num">Need</th><th class="num">Have</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${r.workbench ? `<p class="wb-note${wb >= r.workbench ? ' ok' : ''}">Requires Workbench Level ${r.workbench}${wb >= r.workbench ? ' (in range)' : ' — stand next to one'}</p>` : ''}
      <div class="craft-actions">
        <div class="stepper">
          <button type="button" data-act="minus" aria-label="Fewer">−</button>
          <output>${this.amount}</output>
          <button type="button" data-act="plus" aria-label="More">+</button>
          <button type="button" data-act="max" class="max">Max</button>
        </div>
        <button type="button" class="btn btn-craft" data-act="craft" ${check.ok ? '' : 'disabled'}>Craft · ${Math.ceil(r.time * this.amount)}s</button>
      </div>
      ${check.ok ? '' : `<p class="craft-reason">${check.reason}</p>`}`;

    const q = game.crafting.queue;
    this.queueEl.innerHTML = q.length
      ? `<h4>Crafting queue</h4>${q.map((job, i) => `
        <div class="queue-row">
          <img src="${getIcon(job.recipe.out)}" alt="">
          <span>${ITEMS[job.recipe.out].name} ×${job.remaining * job.recipe.amount}</span>
          ${i === 0 ? `<span class="queue-progress"><i style="width:${(1 - job.timeLeft / job.recipe.time) * 100}%"></i></span>` : '<span class="queue-wait">waiting</span>'}
          <button type="button" data-act="cancel" data-index="${i}" aria-label="Cancel">✕</button>
        </div>`).join('')}`
      : '';
  }

  // Cheap per-frame refresh of the queue progress bar.
  tick() {
    const bar = this.queueEl.querySelector('.queue-progress i');
    const job = this.game.crafting.queue[0];
    if (bar && job) bar.style.width = `${(1 - job.timeLeft / job.recipe.time) * 100}%`;
  }
}
