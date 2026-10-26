import { ITEMS } from '../items/ItemDatabase.js';
import { getIcon } from '../items/IconRenderer.js';

// Renders an item stack into a slot element. Skips DOM work when nothing changed.

export function formatQty(n) {
  if (n >= 10000) return `${Math.floor(n / 1000)}k`;
  return String(n);
}

export function renderSlot(el, item) {
  const sig = item ? `${item.id}|${item.qty}|${item.cond ?? ''}|${item.ammo ?? ''}` : '';
  if (el._sig === sig) return;
  el._sig = sig;
  if (!item) {
    el.innerHTML = '';
    el.classList.remove('filled');
    el.removeAttribute('title');
    return;
  }
  const def = ITEMS[item.id];
  let html = `<img src="${getIcon(item.id)}" alt="" draggable="false">`;
  if (item.qty > 1) html += `<span class="slot-qty">${formatQty(item.qty)}</span>`;
  if (def.maxCond && item.cond !== undefined) {
    const pct = Math.max(0, Math.min(100, (item.cond / def.maxCond) * 100));
    const tone = pct < 25 ? ' low' : '';
    html += `<span class="slot-cond${tone}"><i style="height:${pct}%"></i></span>`;
  }
  if (def.type === 'gun') html += `<span class="slot-ammo">${item.ammo}</span>`;
  el.innerHTML = html;
  el.classList.add('filled');
  el.title = def.name;
}
