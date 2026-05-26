const SHOP_KEY = 'htl_shop_v1';
const DEF = { coins: 0, wireUpgrade: 0, pendingWire: 0, pendingBombs: 0, pendingShields: 0, pendingSpeed: false };

export function getShop() {
  try { return { ...DEF, ...JSON.parse(localStorage.getItem(SHOP_KEY) || '{}') }; }
  catch { return { ...DEF }; }
}
function _save(s) { localStorage.setItem(SHOP_KEY, JSON.stringify(s)); }

export function calcCoins(level, kills, timeLeft, hasShields) {
  const base      = level * 15;
  const killBonus = kills * 2;
  const timeBonus = Math.max(0, Math.floor(timeLeft));
  const shieldBonus = hasShields ? 40 : 0;
  return { base, killBonus, timeBonus, shieldBonus, total: base + killBonus + timeBonus + shieldBonus };
}

export function awardCoins(breakdown) {
  const s = getShop();
  s.coins = (s.coins || 0) + breakdown.total;
  _save(s);
}

export function getWireForLevel() {
  const s = getShop();
  return 8000 + (s.wireUpgrade || 0) * 2000;
}

export function getLoadout() {
  const s = getShop();
  return {
    wire:    getWireForLevel() + (s.pendingWire || 0),
    bombs:   s.pendingBombs  || 0,
    shields: s.pendingShields || 0,
    speed:   s.pendingSpeed   || false,
  };
}

export function consumeLoadout() {
  const s = getShop();
  s.pendingWire = 0; s.pendingBombs = 0; s.pendingShields = 0; s.pendingSpeed = false;
  _save(s);
}

export const SHOP_ITEMS = [
  {
    id: 'wire200', label: '+4000 Tel', icon: '🔗', color: '#4ade80', glow: 'rgba(74,222,128,0.35)',
    desc: 'Sonraki level +4000 tel', price: 60, type: 'consumable',
    getCount:    (s) => Math.floor((s.pendingWire || 0) / 4000),
    canBuy:      (s) => Math.floor((s.pendingWire || 0) / 4000) < 3,
    buy:         (s) => { s.pendingWire = (s.pendingWire || 0) + 4000; },
  },
  {
    id: 'bomb1', label: '+1 Bomba', icon: '💣', color: '#fb923c', glow: 'rgba(251,146,60,0.35)',
    desc: 'Sonraki level +1 bomba', price: 80, type: 'consumable',
    getCount:    (s) => s.pendingBombs || 0,
    canBuy:      (s) => (s.pendingBombs || 0) < 3,
    buy:         (s) => { s.pendingBombs = (s.pendingBombs || 0) + 1; },
  },
  {
    id: 'shield1', label: '+1 Kalkan', icon: '🛡️', color: '#fbbf24', glow: 'rgba(251,191,36,0.35)',
    desc: 'Sonraki level +1 kalkan', price: 100, type: 'consumable',
    getCount:    (s) => s.pendingShields || 0,
    canBuy:      (s) => (s.pendingShields || 0) < 2,
    buy:         (s) => { s.pendingShields = (s.pendingShields || 0) + 1; },
  },
  {
    id: 'speed1', label: 'Hız Buff', icon: '👟', color: '#60a5fa', glow: 'rgba(96,165,250,0.35)',
    desc: 'Sonraki level +%20 hız', price: 120, type: 'consumable',
    getCount:    (s) => s.pendingSpeed ? 1 : 0,
    canBuy:      (s) => !s.pendingSpeed,
    buy:         (s) => { s.pendingSpeed = true; },
  },
  {
    id: 'wireUp1', label: 'Tel Upgrade I', icon: '⚡', color: '#a78bfa', glow: 'rgba(167,139,250,0.35)',
    desc: 'Kalıcı: her levela +2000 tel', price: 400, type: 'permanent',
    getCount:    (s) => 0,
    isPurchased: (s) => (s.wireUpgrade || 0) >= 1,
    canBuy:      (s) => (s.wireUpgrade || 0) < 1,
    buy:         (s) => { s.wireUpgrade = Math.max(s.wireUpgrade || 0, 1); },
  },
  {
    id: 'wireUp2', label: 'Tel Upgrade II', icon: '⚡⚡', color: '#e879f9', glow: 'rgba(232,121,249,0.35)',
    desc: 'Kalıcı: her levela +4000 tel daha', price: 800, type: 'permanent',
    getCount:    (s) => 0,
    isPurchased: (s) => (s.wireUpgrade || 0) >= 2,
    canBuy:      (s) => (s.wireUpgrade || 0) === 1,
    buy:         (s) => { s.wireUpgrade = 2; },
  },
];

export function buyItem(itemId) {
  const item = SHOP_ITEMS.find(i => i.id === itemId);
  if (!item) return { ok: false };
  const s = getShop();
  if (s.coins < item.price) return { ok: false, reason: 'coins' };
  if (item.isPurchased && item.isPurchased(s)) return { ok: false, reason: 'owned' };
  if (!item.canBuy(s)) return { ok: false, reason: 'max' };
  s.coins -= item.price;
  item.buy(s);
  _save(s);
  return { ok: true, coins: s.coins };
}
