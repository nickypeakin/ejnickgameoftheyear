import { clamp, damp } from '../core/MathUtils.js';

// Health, hunger (calories), thirst (hydration), bleeding, healing over time and
// body temperature.

export const MAX_VITALS = { health: 100, calories: 500, hydration: 250 };

export class Vitals {
  constructor() {
    this.reset();
  }

  reset() {
    this.health = 60;
    this.calories = 180;
    this.hydration = 120;
    this.bleeding = 0;
    this.healPool = 0;
    this.temperature = 18;
    this.wet = 0;
    this.comfort = 0;
  }

  get cold() {
    return this.temperature < 8;
  }

  get freezing() {
    return this.temperature < 2;
  }

  // Returns a death cause string when health runs out, otherwise null.
  update(dt, { sprinting, moving, envTemp, insulation, warmth, inWater }) {
    if (inWater) this.wet = 25;
    else this.wet = Math.max(0, this.wet - dt);
    this.comfort = warmth;

    const target = envTemp + warmth + insulation - (this.wet > 0 ? 7 : 0);
    this.temperature = damp(this.temperature, target, 0.35, dt);

    const effort = sprinting ? 2.2 : moving ? 1.3 : 1;
    this.calories -= 0.075 * effort * (this.cold ? 1.8 : 1) * dt;
    this.hydration -= 0.1 * effort * (this.temperature > 28 ? 1.5 : 1) * dt;

    let cause = 'Died';
    if (this.healPool > 0) {
      const h = Math.min(this.healPool, 2.5 * dt);
      this.health += h;
      this.healPool -= h;
    }
    if (this.bleeding > 0) {
      this.health -= 1.1 * dt;
      this.bleeding = Math.max(0, this.bleeding - dt);
      cause = 'Bled out';
    }
    if (this.calories <= 0) {
      this.health -= 0.4 * dt;
      cause = 'Starved to death';
    }
    if (this.hydration <= 0) {
      this.health -= 0.6 * dt;
      cause = 'Died of thirst';
    }
    if (this.freezing) {
      this.health -= 0.3 * dt;
      cause = 'Froze to death';
    }
    if (this.calories > 250 && this.hydration > 120 && this.bleeding <= 0) this.health += 0.12 * dt;

    this.health = clamp(this.health, 0, MAX_VITALS.health);
    this.calories = clamp(this.calories, 0, MAX_VITALS.calories);
    this.hydration = clamp(this.hydration, 0, MAX_VITALS.hydration);
    return this.health <= 0 ? cause : null;
  }

  // Apply a food, drink or medical effect.
  apply(use) {
    if (use.calories) this.calories = clamp(this.calories + use.calories, 0, MAX_VITALS.calories);
    if (use.hydration) this.hydration = clamp(this.hydration + use.hydration, 0, MAX_VITALS.hydration);
    if (use.heal) this.health = clamp(this.health + use.heal, 0, MAX_VITALS.health);
    if (use.healOverTime) this.healPool += use.healOverTime;
    if (use.stopBleed) this.bleeding = 0;
  }

  serialize() {
    return {
      health: this.health,
      calories: this.calories,
      hydration: this.hydration,
      bleeding: this.bleeding,
      healPool: this.healPool,
      temperature: this.temperature,
    };
  }

  load(data) {
    if (!data) return;
    Object.assign(this, {
      health: data.health ?? 60,
      calories: data.calories ?? 180,
      hydration: data.hydration ?? 120,
      bleeding: data.bleeding ?? 0,
      healPool: data.healPool ?? 0,
      temperature: data.temperature ?? 18,
    });
  }
}
