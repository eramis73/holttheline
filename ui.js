export const _dom = {};

export function _el(id) {
  return _dom[id] || (_dom[id] = document.getElementById(id));
}

export function vibe(pattern, vibeOn) {
  if (vibeOn !== false && navigator.vibrate) navigator.vibrate(pattern);
}

export function updateBombUI(players) {
  const p = players[0];
  const bombs = p ? (p.bombs || 0) : 0;
  _el('hud-bomb-val').textContent = bombs;
  const btn = _el('btn-bomb');
  if (!btn) return;
  btn.setAttribute('data-bomb-count', bombs);
  btn.classList.toggle('empty', bombs <= 0);
}

export function updateShieldUI(players) {
  const val = players[0] ? (players[0].shields || 0) : 0;
  _el('hud-shield-val').textContent = val;
}

export function updateHUD(gameState, players) {
  const secsLeft = Math.max(0, Math.ceil(gameState.levelDuration * (1 - (gameState.fuseProgress || 0))));
  _el('hud-level-val').textContent = gameState.level;
  _el('hud-timer-val').textContent = secsLeft + 's';
  updateBombUI(players);
  updateShieldUI(players);
}

export function updateMpHud(gameState, players, gameMode) {
  const p1 = players[0], p2 = players[1];
  if (gameMode === 'online-host' || gameMode === 'online-guest') {
    _el('mp-p1-name').textContent = 'HOST';
    _el('mp-p2-name').textContent = 'GUEST';
  } else {
    _el('mp-p1-name').textContent = 'P1';
    _el('mp-p2-name').textContent = 'P2';
  }
  _el('mp-p1-lives').textContent = p1.lives ?? 3;
  _el('mp-p2-lives').textContent = p2.lives ?? 3;
  _el('mp-p1-zombies').textContent = p1.zombiesLeft ?? 0;
  _el('mp-p2-zombies').textContent = p2.zombiesLeft ?? 0;
  _el('mp-p1-bombs').textContent = p1.bombs ?? 0;
  _el('mp-p2-bombs').textContent = p2.bombs ?? 0;
  const btn = _el('btn-bomb');
  if (btn) {
    const bombs = p1.bombs || 0;
    btn.setAttribute('data-bomb-count', bombs);
    btn.classList.toggle('empty', bombs <= 0);
  }
}
