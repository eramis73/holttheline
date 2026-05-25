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
  const wire = p ? (p.wireMeter ?? 0) : 0;
  _el('hud-bomb-val').textContent = bombs;
  const btn = _el('btn-fire');
  if (!btn) return;
  const bombMode = wire <= 0 && bombs > 0;
  btn.classList.toggle('bomb-mode', bombMode);
  btn.classList.toggle('empty', wire <= 0 && bombs <= 0);
  btn.textContent = bombMode ? '💣' : '⚡';
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
  _el('hud-wire-val').textContent = Math.max(0, Math.round(players[0].wireMeter ?? 0));
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
  const p1BombEl = _el('mp-p1-bombs'), p2BombEl = _el('mp-p2-bombs');
  const p1Available = (p1.bombMax || 3) - (p1.activeBombCount || 0);
  const p2Available = (p2.bombMax || 3) - (p2.activeBombCount || 0);
  p1BombEl.textContent = p1.inBombPhase ? p1Available : '-';
  p2BombEl.textContent = p2.inBombPhase ? p2Available : '-';
  const btn = _el('btn-fire');
  if (btn) {
    if (p1.inBombPhase) {
      btn.textContent = '💣';
      btn.setAttribute('data-bomb-count', p1Available);
      btn.classList.add('bomb-mode');
      btn.classList.remove('empty');
    } else {
      btn.textContent = '⚡';
      btn.setAttribute('data-bomb-count', '');
      btn.classList.remove('bomb-mode');
    }
  }
}
