// Shared gathering math for resource nodes and animal corpses.

export function makeYields(spec, scale = 1) {
  return spec
    .map(([id, total]) => {
      const t = Math.max(1, Math.round(total * scale));
      return { id, total: t, remaining: t, acc: 0 };
    })
    .sort((a, b) => b.total - a.total);
}

export const yieldFraction = (yields) => (yields[0] ? yields[0].remaining / yields[0].total : 0);

// `power` is how much of the primary (largest) yield one hit removes; secondary
// yields come out in proportion. Returns true once the node is exhausted.
export function harvest(yields, power, give) {
  const primary = yields[0];
  if (!primary || primary.remaining <= 0) return true;
  for (const y of yields) {
    if (y.remaining <= 0) continue;
    y.acc += power * (y.total / primary.total) * (0.9 + Math.random() * 0.2);
    const n = Math.min(Math.floor(y.acc), y.remaining);
    if (n > 0) {
      y.acc -= n;
      y.remaining -= n;
      give(y.id, n);
    }
  }
  if (primary.remaining > 0) return false;
  for (const y of yields) {
    if (y.remaining > 0) {
      give(y.id, y.remaining);
      y.remaining = 0;
    }
  }
  return true;
}
