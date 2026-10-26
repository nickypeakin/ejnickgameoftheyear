import { RECIPE_BY_ID } from '../items/Recipes.js';
import { itemName } from '../items/ItemDatabase.js';

const MAX_QUEUE = 8;

// Crafting queue. Ingredients are taken when a job is queued and refunded if it is
// cancelled; jobs complete one at a time.
export class CraftingSystem {
  constructor(game) {
    this.game = game;
    this.queue = [];
  }

  workbenchLevel() {
    return this.game.deployables.workbenchLevelAt(this.game.player.position);
  }

  check(recipe, times = 1) {
    if (recipe.workbench > this.workbenchLevel()) {
      return { ok: false, reason: `Needs Workbench Level ${recipe.workbench} nearby` };
    }
    if (!this.game.player.inventory.has(recipe.cost, times)) return { ok: false, reason: 'Not enough resources' };
    if (this.queue.length >= MAX_QUEUE) return { ok: false, reason: 'Crafting queue is full' };
    return { ok: true };
  }

  maxCraftable(recipe) {
    const inv = this.game.player.inventory;
    let max = Infinity;
    for (const [id, qty] of Object.entries(recipe.cost)) max = Math.min(max, Math.floor(inv.count(id) / qty));
    return Math.min(max, 99);
  }

  enqueue(recipeId, times = 1) {
    const recipe = RECIPE_BY_ID[recipeId];
    if (!recipe || times < 1) return false;
    const result = this.check(recipe, times);
    if (!result.ok) {
      this.game.hud.flashHint(result.reason);
      return false;
    }
    this.game.player.inventory.takeCost(recipe.cost, times);
    this.queue.push({ recipe, remaining: times, timeLeft: recipe.time });
    this.game.audio.play('craft_start');
    this.game.events.emit('craftQueueChanged');
    return true;
  }

  cancel(index) {
    const job = this.queue[index];
    if (!job) return;
    for (const [id, qty] of Object.entries(job.recipe.cost)) this.game.player.inventory.give(id, qty * job.remaining, { notify: false });
    this.queue.splice(index, 1);
    this.game.events.emit('craftQueueChanged');
  }

  update(dt) {
    const job = this.queue[0];
    if (!job || this.game.player.dead) return;
    job.timeLeft -= dt;
    if (job.timeLeft > 0) return;
    const { recipe } = job;
    this.game.player.inventory.give(recipe.out, recipe.amount);
    this.game.audio.play('craft_done');
    this.game.stats.crafted += recipe.amount;
    job.remaining -= 1;
    if (job.remaining > 0) job.timeLeft = recipe.time;
    else {
      this.queue.shift();
      this.game.hud.flashHint(`Crafted ${itemName(recipe.out)}`);
    }
    this.game.events.emit('craftQueueChanged');
  }

  // Refund everything (used when the player dies with jobs queued).
  refundAll() {
    while (this.queue.length) this.cancel(0);
  }

  serialize() {
    return this.queue.map((j) => ({ id: j.recipe.id, remaining: j.remaining, timeLeft: j.timeLeft }));
  }

  load(data) {
    this.queue = (data ?? [])
      .filter((j) => RECIPE_BY_ID[j.id])
      .map((j) => ({ recipe: RECIPE_BY_ID[j.id], remaining: j.remaining, timeLeft: j.timeLeft }));
    this.game.events.emit('craftQueueChanged');
  }
}
