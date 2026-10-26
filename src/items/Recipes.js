import { ITEMS } from './ItemDatabase.js';

// Crafting recipes. cost is consumed when the job is queued; workbench is the
// workbench level the player must stand near.
export const RECIPES = [
  { out: 'stone_hatchet', amount: 1, time: 8, cost: { wood: 100, stone: 50 } },
  { out: 'stone_pickaxe', amount: 1, time: 8, cost: { wood: 100, stone: 50 } },
  { out: 'torch', amount: 1, time: 3, cost: { wood: 20, cloth: 5 } },
  { out: 'hammer', amount: 1, time: 3, cost: { wood: 50 } },
  { out: 'building_plan', amount: 1, time: 2, cost: { wood: 20, cloth: 5 } },
  { out: 'metal_hatchet', amount: 1, time: 10, cost: { wood: 100, metal_frag: 75 }, workbench: 1 },
  { out: 'metal_pickaxe', amount: 1, time: 10, cost: { wood: 100, metal_frag: 125 }, workbench: 1 },

  { out: 'wooden_spear', amount: 1, time: 6, cost: { wood: 150 } },
  { out: 'bone_knife', amount: 1, time: 5, cost: { bone_fragments: 20 } },
  { out: 'hunting_bow', amount: 1, time: 10, cost: { wood: 200, cloth: 50 } },
  { out: 'revolver', amount: 1, time: 15, cost: { metal_frag: 125, metal_pipe: 1, cloth: 25 }, workbench: 1 },
  { out: 'pipe_shotgun', amount: 1, time: 15, cost: { metal_frag: 100, metal_pipe: 1, wood: 75 }, workbench: 1 },

  { out: 'wooden_arrow', amount: 2, time: 2, cost: { wood: 25, stone: 10 } },
  { out: 'pistol_ammo', amount: 4, time: 4, cost: { metal_frag: 10, gunpowder: 5 }, workbench: 1 },
  { out: 'handmade_shell', amount: 2, time: 3, cost: { stone: 5, gunpowder: 3 } },
  { out: 'gunpowder', amount: 10, time: 5, cost: { charcoal: 30, sulfur: 20 }, workbench: 1 },
  { out: 'low_grade_fuel', amount: 4, time: 3, cost: { animal_fat: 3, cloth: 1 } },

  { out: 'campfire', amount: 1, time: 5, cost: { wood: 100 } },
  { out: 'furnace', amount: 1, time: 10, cost: { stone: 150, wood: 50, low_grade_fuel: 10 } },
  { out: 'wooden_box', amount: 1, time: 5, cost: { wood: 100 } },
  { out: 'sleeping_bag', amount: 1, time: 5, cost: { cloth: 30 } },
  { out: 'workbench_1', amount: 1, time: 15, cost: { wood: 300, metal_frag: 75, scrap: 40 } },
  { out: 'wooden_door', amount: 1, time: 5, cost: { wood: 200 } },

  { out: 'bandage', amount: 1, time: 2, cost: { cloth: 4 } },
  { out: 'medical_syringe', amount: 1, time: 5, cost: { cloth: 15, metal_frag: 10, low_grade_fuel: 10 }, workbench: 1 },

  { out: 'bone_helmet', amount: 1, time: 6, cost: { bone_fragments: 30, leather: 10 } },
  { out: 'hide_vest', amount: 1, time: 6, cost: { leather: 25, cloth: 10 } },
  { out: 'hide_pants', amount: 1, time: 6, cost: { leather: 20, cloth: 10 } },
];

for (const r of RECIPES) {
  r.id = r.out;
  r.workbench = r.workbench ?? 0;
  r.category = ITEMS[r.out].category;
}

export const RECIPE_BY_ID = Object.fromEntries(RECIPES.map((r) => [r.id, r]));

// Components and salvage break down into these when recycled.
const RECYCLE = {
  rope: { cloth: 15 },
  metal_pipe: { scrap: 5, metal_frag: 8 },
  metal_spring: { scrap: 10, metal_frag: 10 },
  gears: { scrap: 10, metal_frag: 13 },
  roadsign_jacket: { metal_frag: 40, scrap: 5 },
};

export const canRecycle = (id) => Boolean(RECYCLE[id] || RECIPE_BY_ID[id]);

// Crafted items recycle into half their ingredients, rounded randomly.
export function recycleOutput(id) {
  if (RECYCLE[id]) return { ...RECYCLE[id] };
  const recipe = RECIPE_BY_ID[id];
  if (!recipe) return null;
  const out = {};
  for (const [res, qty] of Object.entries(recipe.cost)) {
    const exact = (qty * 0.5) / recipe.amount;
    const n = Math.floor(exact) + (Math.random() < exact % 1 ? 1 : 0);
    if (n > 0) out[res] = n;
  }
  return Object.keys(out).length ? out : null;
}
