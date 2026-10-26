// Every item in the game. Fields:
//   name, desc, category, stack      basic data
//   icon: [shape, ...colors]         drawn by IconRenderer
//   type                             what holding it does: melee | bow | gun | hammer |
//                                    buildplan | deployable | door | consumable | attire
//   maxCond                          durability; lost one point per use
//   melee { damage, range, rate, gather: { tree, ore, flesh } }
//   bow / gun                        ranged weapon stats
//   use { time, calories, hydration, heal, healOverTime, stopBleed, sound }
//   cook { to, time, ovens }         smeltable or cookable in a campfire/furnace
//   fuel                             burns in campfires and furnaces
//   deploy                           deployable kind placed in the world
//   attire { slot, protection, insulation }  slot 0 head, 1 chest, 2 legs

export const CATEGORY_LABELS = {
  tools: 'Tools',
  weapons: 'Weapons',
  ammo: 'Ammo',
  construction: 'Construction',
  items: 'Items',
  medical: 'Medical',
  food: 'Food',
  attire: 'Attire',
  resources: 'Resources',
  components: 'Components',
};

export const ITEMS = {
  // Resources
  wood: {
    name: 'Wood', category: 'resources', stack: 1000, icon: ['logs'], fuel: true,
    desc: 'Chopped from trees. Burns in campfires and furnaces and builds your first walls.',
  },
  stone: {
    name: 'Stone', category: 'resources', stack: 1000, icon: ['stones', '#a19c93'],
    desc: 'Mined from stone nodes. Used for tools, furnaces and stone upgrades.',
  },
  metal_ore: {
    name: 'Metal Ore', category: 'resources', stack: 1000, icon: ['ore', '#6f6a64', '#c27a45'],
    cook: { to: 'metal_frag', time: 2.5, ovens: ['furnace'] },
    desc: 'Raw ore. Smelt it in a furnace to get metal fragments. Split stacks across slots to smelt faster.',
  },
  metal_frag: {
    name: 'Metal Fragments', category: 'resources', stack: 1000, icon: ['frags', '#9aa0a6'],
    desc: 'Smelted metal used for advanced tools, guns and sheet metal upgrades.',
  },
  sulfur_ore: {
    name: 'Sulfur Ore', category: 'resources', stack: 1000, icon: ['ore', '#8d8466', '#e5cf4a'],
    cook: { to: 'sulfur', time: 1.6, ovens: ['furnace'] },
    desc: 'Smelt in a furnace to get sulfur.',
  },
  sulfur: {
    name: 'Sulfur', category: 'resources', stack: 1000, icon: ['powder', '#e8d24f'],
    desc: 'Mixed with charcoal to make gunpowder.',
  },
  charcoal: {
    name: 'Charcoal', category: 'resources', stack: 1000, icon: ['chunks', '#2a2826'],
    desc: 'Left behind when wood burns in a campfire or furnace.',
  },
  gunpowder: {
    name: 'Gunpowder', category: 'resources', stack: 1000, icon: ['powder', '#3a3836'],
    desc: 'Explosive powder for ammunition.',
  },
  cloth: {
    name: 'Cloth', category: 'resources', stack: 1000, icon: ['cloth', '#c9b48a'],
    desc: 'Harvested from hemp plants. Used for bandages, bows and sleeping bags.',
  },
  leather: {
    name: 'Leather', category: 'resources', stack: 1000, icon: ['hide', '#8a5a35'],
    desc: 'Skinned from animals. Makes hide clothing.',
  },
  bone_fragments: {
    name: 'Bone Fragments', category: 'resources', stack: 1000, icon: ['bone', '#e8e0cc'],
    desc: 'Harvested from animal corpses.',
  },
  animal_fat: {
    name: 'Animal Fat', category: 'resources', stack: 1000, icon: ['blob', '#efe6c8'],
    desc: 'Rendered into low grade fuel.',
  },
  low_grade_fuel: {
    name: 'Low Grade Fuel', category: 'resources', stack: 500, icon: ['jerrycan', '#b8322a'],
    desc: 'Crude fuel. Needed for furnaces and medical syringes.',
  },
  scrap: {
    name: 'Scrap', category: 'resources', stack: 1000, icon: ['scrap', '#8b8f7e'],
    desc: 'Salvage found in barrels and crates, or made by recycling components.',
  },

  // Components
  rope: {
    name: 'Rope', category: 'components', stack: 50, icon: ['rope', '#b89a63'],
    desc: 'Recycle it for cloth.',
  },
  metal_pipe: {
    name: 'Metal Pipe', category: 'components', stack: 20, icon: ['pipe', '#7d8389'],
    desc: 'A gun barrel in waiting. Needed for the revolver and pipe shotgun.',
  },
  metal_spring: {
    name: 'Metal Spring', category: 'components', stack: 20, icon: ['spring', '#9aa0a6'],
    desc: 'Recycle it for scrap and metal fragments.',
  },
  gears: {
    name: 'Gears', category: 'components', stack: 20, icon: ['gear', '#8c8f93'],
    desc: 'Recycle it for scrap and metal fragments.',
  },

  // Tools
  rock: {
    name: 'Rock', category: 'tools', stack: 1, type: 'melee', icon: ['rock'],
    melee: { damage: 10, range: 2.0, rate: 0.85, gather: { tree: 6, ore: 5, flesh: 4 } },
    desc: 'A rock. Hit trees and stone with it until you can make something better.',
  },
  torch: {
    name: 'Torch', category: 'tools', stack: 1, type: 'melee', icon: ['torch'], maxCond: 60, torch: true,
    melee: { damage: 8, range: 1.9, rate: 0.8, gather: { tree: 3, ore: 2, flesh: 2 } },
    desc: 'Lights the way at night and keeps you a little warm.',
  },
  stone_hatchet: {
    name: 'Stone Hatchet', category: 'tools', stack: 1, type: 'melee', icon: ['hatchet', '#8f8a82'], maxCond: 100,
    melee: { damage: 15, range: 2.1, rate: 0.75, gather: { tree: 15, ore: 3, flesh: 8 } },
    desc: 'Chops trees about twice as fast as a rock.',
  },
  stone_pickaxe: {
    name: 'Stone Pickaxe', category: 'tools', stack: 1, type: 'melee', icon: ['pickaxe', '#8f8a82'], maxCond: 100,
    melee: { damage: 15, range: 2.1, rate: 0.9, gather: { tree: 4, ore: 12, flesh: 4 } },
    desc: 'Breaks stone, metal and sulfur nodes.',
  },
  metal_hatchet: {
    name: 'Metal Hatchet', category: 'tools', stack: 1, type: 'melee', icon: ['hatchet', '#b9bec3'], maxCond: 200,
    melee: { damage: 25, range: 2.1, rate: 0.7, gather: { tree: 26, ore: 4, flesh: 10 } },
    desc: 'A proper axe. Fells trees fast.',
  },
  metal_pickaxe: {
    name: 'Metal Pickaxe', category: 'tools', stack: 1, type: 'melee', icon: ['pickaxe', '#b9bec3'], maxCond: 200,
    melee: { damage: 25, range: 2.1, rate: 0.9, gather: { tree: 6, ore: 20, flesh: 5 } },
    desc: 'Mines nodes much faster than the stone pickaxe.',
  },
  hammer: {
    name: 'Hammer', category: 'tools', stack: 1, type: 'hammer', icon: ['hammer'],
    melee: { damage: 5, range: 2.6, rate: 0.6, gather: {} },
    desc: 'Hold right mouse on a building piece to upgrade, rotate or demolish it. Also picks up deployables.',
  },
  building_plan: {
    name: 'Building Plan', category: 'construction', stack: 1, type: 'buildplan', icon: ['plan'],
    desc: 'Places twig building pieces. Hold right mouse to choose a piece, R to rotate stairs.',
  },

  // Weapons
  wooden_spear: {
    name: 'Wooden Spear', category: 'weapons', stack: 1, type: 'melee', icon: ['spear'], maxCond: 80,
    melee: { damage: 35, range: 3.0, rate: 1.0, gather: { tree: 2, ore: 1, flesh: 6 } },
    desc: 'Long reach and a solid hit. Keeps wolves at a distance.',
  },
  bone_knife: {
    name: 'Bone Knife', category: 'weapons', stack: 1, type: 'melee', icon: ['knife'], maxCond: 100,
    melee: { damage: 20, range: 1.8, rate: 0.45, gather: { tree: 2, ore: 1, flesh: 20 } },
    desc: 'Fast and the best tool for harvesting animal corpses.',
  },
  hunting_bow: {
    name: 'Hunting Bow', category: 'weapons', stack: 1, type: 'bow', icon: ['bow'], maxCond: 150,
    bow: { damage: 50, drawTime: 0.8, speed: 55, ammo: 'wooden_arrow' },
    desc: 'Hold left mouse to draw, release to fire. Right mouse to aim. Uses wooden arrows.',
  },
  revolver: {
    name: 'Revolver', category: 'weapons', stack: 1, type: 'gun', icon: ['revolver'], maxCond: 200,
    gun: { damage: 34, pellets: 1, rate: 0.2, mag: 8, reload: 2.2, spread: 0.014, adsSpread: 0.004, ammo: 'pistol_ammo', range: 140, sound: 'gunshot', recoil: 0.03 },
    desc: 'Eight shots, semi-automatic. Press R to reload.',
  },
  pipe_shotgun: {
    name: 'Pipe Shotgun', category: 'weapons', stack: 1, type: 'gun', icon: ['shotgun'], maxCond: 150,
    gun: { damage: 14, pellets: 9, rate: 0.6, mag: 1, reload: 2.4, spread: 0.07, adsSpread: 0.05, ammo: 'handmade_shell', range: 50, sound: 'shotgun', recoil: 0.07 },
    desc: 'One devastating shell at close range.',
  },

  // Ammo
  wooden_arrow: {
    name: 'Wooden Arrow', category: 'ammo', stack: 64, icon: ['arrow'],
    desc: 'Ammunition for the hunting bow. Arrows can sometimes be picked up again.',
  },
  pistol_ammo: {
    name: 'Pistol Bullet', category: 'ammo', stack: 128, icon: ['bullets', '#c9a14a'],
    desc: 'Ammunition for the revolver.',
  },
  handmade_shell: {
    name: 'Handmade Shell', category: 'ammo', stack: 64, icon: ['shells', '#b8322a'],
    desc: 'Ammunition for the pipe shotgun.',
  },

  // Medical
  bandage: {
    name: 'Bandage', category: 'medical', stack: 10, type: 'consumable', icon: ['bandage'],
    use: { time: 1.4, heal: 6, stopBleed: true, sound: 'bandage' },
    desc: 'Stops bleeding and heals a little.',
  },
  medical_syringe: {
    name: 'Medical Syringe', category: 'medical', stack: 4, type: 'consumable', icon: ['syringe'],
    use: { time: 0.9, heal: 15, healOverTime: 20, stopBleed: true, sound: 'syringe' },
    desc: 'Heals 15 instantly and 20 more over time.',
  },

  // Food
  raw_meat: {
    name: 'Raw Meat', category: 'food', stack: 20, type: 'consumable', icon: ['meat', '#c4545a'],
    use: { time: 0.6, calories: 20, hydration: -3, heal: -4, sound: 'eat' },
    cook: { to: 'cooked_meat', time: 12, ovens: ['campfire', 'furnace'] },
    desc: 'Eating it raw makes you sick. Cook it on a campfire.',
  },
  cooked_meat: {
    name: 'Cooked Meat', category: 'food', stack: 20, type: 'consumable', icon: ['meat', '#7a4a2a'],
    use: { time: 0.6, calories: 75, hydration: 5, healOverTime: 8, sound: 'eat' },
    desc: 'Filling and safe to eat.',
  },
  mushroom: {
    name: 'Mushroom', category: 'food', stack: 10, type: 'consumable', icon: ['mushroom'],
    use: { time: 0.5, calories: 15, hydration: 5, sound: 'eat' },
    desc: 'Found in forests. A small snack.',
  },
  blueberries: {
    name: 'Blueberries', category: 'food', stack: 20, type: 'consumable', icon: ['berries'],
    use: { time: 0.5, calories: 10, hydration: 18, heal: 1, sound: 'eat' },
    desc: 'Picked from berry bushes. Mostly water.',
  },
  can_of_beans: {
    name: 'Can of Beans', category: 'food', stack: 10, type: 'consumable', icon: ['can', '#c9a14a'],
    use: { time: 0.8, calories: 120, hydration: 20, sound: 'eat' },
    desc: 'Found in crates and barrels. A full meal.',
  },

  // Deployables and construction
  campfire: {
    name: 'Campfire', category: 'items', stack: 1, type: 'deployable', deploy: 'campfire', icon: ['campfire'],
    desc: 'Cooks meat, keeps you warm and burns wood into charcoal.',
  },
  furnace: {
    name: 'Furnace', category: 'items', stack: 1, type: 'deployable', deploy: 'furnace', icon: ['furnace'],
    desc: 'Smelts metal and sulfur ore using wood as fuel.',
  },
  wooden_box: {
    name: 'Wood Storage Box', category: 'items', stack: 1, type: 'deployable', deploy: 'wooden_box', icon: ['box'],
    desc: 'Stores 18 stacks of items.',
  },
  sleeping_bag: {
    name: 'Sleeping Bag', category: 'items', stack: 1, type: 'deployable', deploy: 'sleeping_bag', icon: ['sleeping_bag'],
    desc: 'Respawn here after you die (two minute cooldown).',
  },
  workbench_1: {
    name: 'Workbench Level 1', category: 'items', stack: 1, type: 'deployable', deploy: 'workbench', icon: ['workbench'],
    desc: 'Stand near it to craft guns, metal tools, ammunition and syringes.',
  },
  wooden_door: {
    name: 'Wooden Door', category: 'construction', stack: 1, type: 'door', icon: ['door'],
    desc: 'Place in a doorway. Animals and scientists cannot open doors.',
  },

  // Attire
  bone_helmet: {
    name: 'Bone Helmet', category: 'attire', stack: 1, type: 'attire', icon: ['helmet', '#e3dac2'],
    attire: { slot: 0, protection: 0.15, insulation: 2 },
    desc: 'Head armor. 15% protection.',
  },
  hide_vest: {
    name: 'Hide Vest', category: 'attire', stack: 1, type: 'attire', icon: ['vest', '#8a5a35'],
    attire: { slot: 1, protection: 0.15, insulation: 5 },
    desc: 'Chest armor. 15% protection and warm at night.',
  },
  hide_pants: {
    name: 'Hide Pants', category: 'attire', stack: 1, type: 'attire', icon: ['pants', '#7a4f2e'],
    attire: { slot: 2, protection: 0.1, insulation: 4 },
    desc: 'Leg armor. 10% protection and warm at night.',
  },
  roadsign_jacket: {
    name: 'Road Sign Jacket', category: 'attire', stack: 1, type: 'attire', icon: ['vest', '#9aa0a6'],
    attire: { slot: 1, protection: 0.3, insulation: 1 },
    desc: 'Riveted road signs. 30% protection.',
  },
};

for (const [id, def] of Object.entries(ITEMS)) def.id = id;

export function getItem(id) {
  return ITEMS[id];
}

export function itemName(id) {
  return ITEMS[id]?.name ?? id;
}

// Item types the player uses from the belt; these prefer belt slots when picked up.
export const BELT_TYPES = new Set(['melee', 'bow', 'gun', 'hammer', 'buildplan', 'deployable', 'door', 'consumable']);
