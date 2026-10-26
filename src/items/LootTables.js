import { randInt, weightedPick } from '../core/MathUtils.js';

// Weighted loot tables. Each roll picks one entry; `always` entries are added on top.
export const LOOT_TABLES = {
  barrel: {
    rolls: [1, 2],
    always: [{ id: 'scrap', min: 2, max: 5 }],
    entries: [
      { id: 'metal_frag', min: 10, max: 25, weight: 20 },
      { id: 'cloth', min: 5, max: 15, weight: 10 },
      { id: 'low_grade_fuel', min: 4, max: 10, weight: 10 },
      { id: 'rope', min: 1, max: 1, weight: 8 },
      { id: 'metal_pipe', min: 1, max: 1, weight: 7 },
      { id: 'metal_spring', min: 1, max: 1, weight: 6 },
      { id: 'gears', min: 1, max: 1, weight: 6 },
      { id: 'can_of_beans', min: 1, max: 1, weight: 7 },
      { id: 'pistol_ammo', min: 4, max: 8, weight: 4 },
      { id: 'bandage', min: 1, max: 2, weight: 5 },
    ],
  },
  crate: {
    rolls: [2, 3],
    always: [{ id: 'scrap', min: 5, max: 10 }],
    entries: [
      { id: 'metal_frag', min: 20, max: 40, weight: 12 },
      { id: 'rope', min: 1, max: 2, weight: 8 },
      { id: 'metal_pipe', min: 1, max: 1, weight: 8 },
      { id: 'gears', min: 1, max: 2, weight: 6 },
      { id: 'wooden_arrow', min: 6, max: 12, weight: 6 },
      { id: 'bandage', min: 1, max: 3, weight: 7 },
      { id: 'can_of_beans', min: 1, max: 2, weight: 7 },
      { id: 'low_grade_fuel', min: 10, max: 20, weight: 6 },
      { id: 'hide_vest', min: 1, max: 1, weight: 2 },
      { id: 'stone_pickaxe', min: 1, max: 1, weight: 3 },
      { id: 'handmade_shell', min: 4, max: 8, weight: 4 },
    ],
  },
  military_crate: {
    rolls: [2, 4],
    always: [{ id: 'scrap', min: 12, max: 25 }],
    entries: [
      { id: 'revolver', min: 1, max: 1, weight: 4 },
      { id: 'pipe_shotgun', min: 1, max: 1, weight: 4 },
      { id: 'pistol_ammo', min: 10, max: 24, weight: 10 },
      { id: 'handmade_shell', min: 6, max: 12, weight: 8 },
      { id: 'medical_syringe', min: 1, max: 2, weight: 8 },
      { id: 'gunpowder', min: 20, max: 50, weight: 6 },
      { id: 'metal_pipe', min: 1, max: 2, weight: 8 },
      { id: 'metal_spring', min: 1, max: 2, weight: 6 },
      { id: 'roadsign_jacket', min: 1, max: 1, weight: 3 },
      { id: 'metal_frag', min: 50, max: 100, weight: 8 },
      { id: 'metal_hatchet', min: 1, max: 1, weight: 3 },
      { id: 'metal_pickaxe', min: 1, max: 1, weight: 3 },
    ],
  },
  scientist: {
    rolls: [1, 3],
    always: [{ id: 'pistol_ammo', min: 4, max: 12 }],
    entries: [
      { id: 'medical_syringe', min: 1, max: 1, weight: 8 },
      { id: 'scrap', min: 5, max: 15, weight: 10 },
      { id: 'metal_frag', min: 15, max: 40, weight: 8 },
      { id: 'can_of_beans', min: 1, max: 1, weight: 6 },
      { id: 'revolver', min: 1, max: 1, weight: 2 },
      { id: 'bandage', min: 1, max: 2, weight: 6 },
    ],
  },
};

export function rollLoot(tableId) {
  const table = LOOT_TABLES[tableId];
  if (!table) return [];
  const out = [];
  for (const a of table.always ?? []) out.push({ id: a.id, qty: randInt(a.min, a.max) });
  const rolls = randInt(table.rolls[0], table.rolls[1]);
  for (let i = 0; i < rolls; i++) {
    const e = weightedPick(table.entries);
    const existing = out.find((o) => o.id === e.id);
    const qty = randInt(e.min, e.max);
    if (existing) existing.qty += qty;
    else out.push({ id: e.id, qty });
  }
  return out;
}
