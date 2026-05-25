import { BIOMES, gameConfig } from './config.js';
import { gameState } from './state.js';
import { _el } from './ui.js';
import { initAudio, playSfx, suspendAudio, resumeAudio } from './audio.js';
import { showOnlineScreen, showOnlineError, hideOnlinePanel, openMpLevelSelect, applyMpDifficultyConfig } from './menu.js';

const WS_URL = 'wss://htl-server-production.up.railway.app';
const _ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
const MM_TIMEOUT = 12;

const LEVEL_NAMES = [
  'Summer Forest', 'Desert', 'Volcanic', 'Dark Forest', 'Arctic',
  'Tropical Beach', 'Graveyard', 'Laboratory', 'Tundra', 'Savanna',
  'Space', 'Underwater', 'Autumn', 'Blood Lake', 'Neon City',
  'Ice Desert', 'Toxic Swamp', 'Deep Space', 'Sunset', 'Ancient Ruins',
  'Mushroom Land', 'Winter Forest', 'Lava Fields', 'Cyberpunk', 'Fairy Forest',
  'Storm', 'Coral Reef', 'Cursed Lands', 'Crystal Cave', 'Golden Plains'
];

export const MP_DIFFICULTIES = [
  { id: 'easy',   name: 'EASY',   emoji: '🌱', zombieCount: 24, barrelCount: 3, cannonPeriod: 15, desc: '24 Zombi\nCannon: 15sn\n3 Barrel' },
  { id: 'medium', name: 'MEDIUM', emoji: '⚔️', zombieCount: 36, barrelCount: 6, cannonPeriod: 10, desc: '36 Zombi\nCannon: 10sn\n6 Barrel' },
  { id: 'hard',   name: 'HARD',   emoji: '🔥', zombieCount: 46, barrelCount: 9, cannonPeriod: 7,  desc: '46 Zombi\nCannon: 7sn\n9 Barrel' },
];

// ── Shared mutable network state ────────────────────────────────────────────
export const netState = {
  onlineRole: null,
  onlineRoomCode: null,
  onlineWs: null,
  onlineP2Input: { vx: 0, vz: 0, fi: false, da: false, bm: false },
  guestLastState: null,
  netEvents: [],
  levelSeed: 0,
  lastSeed: 0,
  guestBombQueued: false,
  zombieNetId: 0,
  mpLobbyTheme: null,
  mpLobbyDiff: null,
  playerNames: ['Player 1', 'Player 2'],
  restartVotedLocal: false,
  restartVotedPeer: false,
  onlineLevel: 1,
};

export const guestZombieMap = new Map();
export const guestBombMap = new Map();

// ── Private RTC + matchmaking state ─────────────────────────────────────────
let _rtcPeer = null, _rtcChan = null, _rtcReady = false;
let _wsKeepAlive = null;
let _mmTimer = null, _mmCountdown = 0;

// ── Injected game deps ───────────────────────────────────────────────────────
let _deps = {};

// ── Core send helper ─────────────────────────────────────────────────────────
export function rtcSendOrWs(data) {
  if (_rtcReady && _rtcChan && _rtcChan.readyState === 'open') {
    try { _rtcChan.send(data); return true; } catch (e) { }
  }
  if (netState.onlineWs && netState.onlineWs.readyState === WebSocket.OPEN) {
    netState.onlineWs.send(data);
    return true;
  }
  return false;
}

function _rtcSend(data) {
  if (_rtcReady && _rtcChan && _rtcChan.readyState === 'open') {
    try { _rtcChan.send(data); return true; } catch (e) { }
  }
  return false;
}

// ── WebSocket connection ─────────────────────────────────────────────────────
function _connectWS(role, codeToJoin) {
  netState.onlineRole = role === 'matchmake' ? null : role;
  const nick = _el('op-nick-input').value.trim() || 'Survivor';
  netState.playerNames[0] = nick;
  _el('mp-p1-name').textContent = nick;

  if (_wsKeepAlive) { clearInterval(_wsKeepAlive); _wsKeepAlive = null; }
  if (netState.onlineWs) { try { netState.onlineWs.onclose = null; netState.onlineWs.close(); } catch (e) { } }
  netState.onlineWs = new WebSocket(WS_URL);
  netState.onlineWs.onopen = () => {
    if (role === 'host') netState.onlineWs.send(JSON.stringify({ t: 'create', nick }));
    else if (role === 'guest') netState.onlineWs.send(JSON.stringify({ t: 'join', code: codeToJoin, nick }));
    else if (role === 'matchmake') netState.onlineWs.send(JSON.stringify({ t: 'matchmake', nick }));
    _wsKeepAlive = setInterval(() => {
      if (netState.onlineWs && netState.onlineWs.readyState === WebSocket.OPEN)
        netState.onlineWs.send(JSON.stringify({ t: 'ping' }));
    }, 25000);
  };
  netState.onlineWs.onmessage = e => {
    try { _handleOnlineMsg(JSON.parse(e.data)); }
    catch (ex) { showOnlineError('Err: ' + (ex.message || ex)); }
  };
  netState.onlineWs.onerror = () => {
    if (role === 'matchmake') _mmNoOpponent();
    else showOnlineError('Bağlantı başarısız');
  };
  netState.onlineWs.onclose = () => {
    if (_wsKeepAlive) { clearInterval(_wsKeepAlive); _wsKeepAlive = null; }
    if (gameState.active) _deps.returnToMenu();
    else if (netState.onlineRole) { showOnlineError('Disconnected'); showOnlineScreen('op-main'); netState.onlineRole = null; }
  };
}

// ── WebRTC ───────────────────────────────────────────────────────────────────
function _cleanupRTC() {
  _rtcReady = false;
  if (_rtcChan) { try { _rtcChan.close(); } catch (e) { } _rtcChan = null; }
  if (_rtcPeer) { try { _rtcPeer.close(); } catch (e) { } _rtcPeer = null; }
  _updateRtcIndicator();
}

function _updateRtcIndicator() {
  const el = document.getElementById('rtc-indicator');
  if (!el) return;
  if (_rtcReady) { el.textContent = '● P2P'; el.style.color = '#4ade80'; }
  else { el.textContent = '● WS'; el.style.color = '#facc15'; }
}

function _setupRtcChannel(chan) {
  _rtcChan = chan;
  chan.onopen = () => { _rtcReady = true; _updateRtcIndicator(); };
  chan.onclose = () => { _rtcReady = false; _updateRtcIndicator(); };
  chan.onerror = () => { _rtcReady = false; _updateRtcIndicator(); };
  chan.onmessage = e => { try { _handleOnlineMsg(JSON.parse(e.data)); } catch (ex) { } };
}

function _initRTC(isHost) {
  _cleanupRTC();
  _rtcPeer = new RTCPeerConnection({ iceServers: _ICE });
  _rtcPeer.onicecandidate = e => {
    if (e.candidate && netState.onlineWs && netState.onlineWs.readyState === WebSocket.OPEN)
      netState.onlineWs.send(JSON.stringify({ t: 'rtc_ice', ice: e.candidate }));
  };
  _rtcPeer.onconnectionstatechange = () => {
    if (_rtcPeer && (_rtcPeer.connectionState === 'failed' || _rtcPeer.connectionState === 'disconnected'))
      _rtcReady = false;
  };
  if (isHost) {
    const chan = _rtcPeer.createDataChannel('game', { ordered: true });
    _setupRtcChannel(chan);
    _rtcPeer.createOffer()
      .then(o => _rtcPeer.setLocalDescription(o))
      .then(() => {
        if (netState.onlineWs && netState.onlineWs.readyState === WebSocket.OPEN)
          netState.onlineWs.send(JSON.stringify({ t: 'rtc_offer', sdp: _rtcPeer.localDescription }));
      }).catch(() => { });
  } else {
    _rtcPeer.ondatachannel = e => _setupRtcChannel(e.channel);
  }
}

// ── Message handler ───────────────────────────────────────────────────────────
function _handleOnlineMsg(msg) {
  if (msg.t === 'nick_sync') {
    netState.playerNames[msg.role === 'host' ? 0 : 1] = msg.nick;
    _el('mp-p1-name').textContent = netState.playerNames[0];
    _el('mp-p2-name').textContent = netState.playerNames[1];
    return;
  }
  if (msg.t === 'matched') {
    if (_mmTimer) { clearInterval(_mmTimer); _mmTimer = null; }
    _el('mm-status').textContent = '🎉 Rakip bulundu!';
    _el('mm-fill').style.width = '100%';
    netState.onlineRoomCode = msg.code;
    netState.onlineRole = msg.role;
    if (msg.role === 'host') {
      netState.onlineWs.send(JSON.stringify({ t: 'nick_sync', role: 'host', nick: netState.playerNames[0] }));
      _initRTC(true);
      _deps.setGameMode('online-host');
      setTimeout(() => { hideOnlinePanel(); _startMatchmakedGame(); }, 700);
    } else {
      _initRTC(false);
      netState.onlineWs.send(JSON.stringify({ t: 'nick_sync', role: 'guest', nick: netState.playerNames[0] }));
      _el('mm-status').textContent = '🎉 Bağlandı! Oyun başlıyor...';
    }
    return;
  }
  if (msg.t === 'created') {
    netState.onlineRoomCode = msg.code;
    document.getElementById('op-code').textContent = msg.code;
    document.getElementById('op-status').textContent = 'Waiting for opponent…';
    showOnlineScreen('op-creating');
  } else if (msg.t === 'peer_joined') {
    if (netState.onlineRole === 'host') netState.onlineWs.send(JSON.stringify({ t: 'nick_sync', role: 'host', nick: netState.playerNames[0] }));
    _initRTC(true);
    _deps.setGameMode('online-host');
    hideOnlinePanel();
    openMpLevelSelect();
  } else if (msg.t === 'joined') {
    netState.onlineRoomCode = msg.code;
    _initRTC(false);
    showOnlineScreen('op-waiting');
    document.getElementById('op-wait-code').textContent = msg.code;
    netState.onlineWs.send(JSON.stringify({ t: 'nick_sync', role: 'guest', nick: netState.playerNames[1] }));
  } else if (msg.t === 'peer_left') {
    if (gameState.active) _deps.returnToMenu();
    else { showOnlineError('Opponent disconnected'); showOnlineScreen('op-main'); }
  } else if (msg.t === 'err') {
    showOnlineError(msg.msg || 'Error');
    showOnlineScreen('op-join');
  } else if (msg.t === 'lvl_start') {
    netState.levelSeed = msg.seed;
    _deps.setGameMode('online-guest');
    if (msg.diff) { netState.mpLobbyDiff = msg.diff; applyMpDifficultyConfig(msg.diff); }
    hideOnlinePanel();
    _deps.launchLevel(msg.lvl);
    if (gameState.entities && gameState.entities.zombies) {
      gameState.entities.zombies.forEach(z => { z.active = false; if (z.group) z.group.visible = false; });
      gameState.entities.zombies = [];
    }
    gameState.zombiesSpawned = 0;
    guestZombieMap.clear(); guestBombMap.clear();
  } else if (msg.t === 'fl_add') {
    if (_deps.getGameMode() === 'online-guest' && gameState.entities) _deps.spawnBombPhaseDiamond(msg.x, msg.z);
  } else if (msg.t === 's') {
    netState.guestLastState = msg;
  } else if (msg.t === 'input') {
    netState.onlineP2Input.vx = msg.vx || 0;
    netState.onlineP2Input.vz = msg.vz || 0;
    netState.onlineP2Input.fi = !!msg.fi;
    netState.onlineP2Input.da = !!msg.da;
    if (msg.bm) netState.onlineP2Input.bm = true;
    if (msg.px !== undefined && gameState.active) {
      const p2 = _deps.players[1];
      if (p2 && p2.alive) {
        p2.x = msg.px; p2.z = msg.pz;
        if (p2.group) { p2.group.position.x = msg.px; p2.group.position.z = msg.pz; p2.group.rotation.y = msg.rot || 0; }
      }
      if (msg.wp && p2 && p2.alive) {
        p2.isDrawingWire = true;
        p2.wirePoints = msg.wp.map(pt => ({ x: pt[0], z: pt[1] }));
        if (p2.wireMesh && msg.wp.length >= 2) {
          _deps.updateP2Wire(p2, msg.wp);
        }
      } else if (!msg.wp && p2) {
        p2.isDrawingWire = false;
      }
    }
  } else if (msg.t === 'rtc_offer') {
    if (!_rtcPeer) return;
    _rtcPeer.setRemoteDescription(msg.sdp)
      .then(() => _rtcPeer.createAnswer())
      .then(a => _rtcPeer.setLocalDescription(a))
      .then(() => {
        if (netState.onlineWs && netState.onlineWs.readyState === WebSocket.OPEN)
          netState.onlineWs.send(JSON.stringify({ t: 'rtc_answer', sdp: _rtcPeer.localDescription }));
      }).catch(() => { });
  } else if (msg.t === 'rtc_answer') {
    if (!_rtcPeer) return;
    _rtcPeer.setRemoteDescription(msg.sdp).catch(() => { });
  } else if (msg.t === 'rtc_ice') {
    if (!_rtcPeer) return;
    _rtcPeer.addIceCandidate(msg.ice).catch(() => { });
  } else if (msg.t === 'match_result') {
    const guestWon = msg.winnerId === 2;
    _showOnlineResult(guestWon);
    playSfx(guestWon ? 'win' : 'die');
  } else if (msg.t === 'restart_vote') {
    netState.restartVotedPeer = true;
    _checkBothRestarted();
  }
}

// ── Matchmaking ───────────────────────────────────────────────────────────────
function _startMatchmaking() {
  _mmCountdown = MM_TIMEOUT;
  _el('mm-status').textContent = 'Gerçek rakip aranıyor...';
  _el('mm-fill').style.transition = 'none';
  _el('mm-fill').style.width = '100%';
  _el('mm-secs').textContent = _mmCountdown + 'sn';
  showOnlineScreen('op-matchmaking');
  requestAnimationFrame(() => { _el('mm-fill').style.transition = 'width 1s linear'; });
  _connectWS('matchmake');
  if (_mmTimer) clearInterval(_mmTimer);
  _mmTimer = setInterval(() => {
    _mmCountdown--;
    _el('mm-secs').textContent = Math.max(0, _mmCountdown) + 'sn';
    _el('mm-fill').style.width = (_mmCountdown / MM_TIMEOUT * 100) + '%';
    if (_mmCountdown <= 0) { clearInterval(_mmTimer); _mmTimer = null; _mmNoOpponent(); }
  }, 1000);
}

function _cancelMatchmaking() {
  if (_mmTimer) { clearInterval(_mmTimer); _mmTimer = null; }
  if (netState.onlineWs && netState.onlineWs.readyState === WebSocket.OPEN)
    netState.onlineWs.send(JSON.stringify({ t: 'cancel_matchmake' }));
  if (netState.onlineWs) { try { netState.onlineWs.onclose = null; netState.onlineWs.close(); } catch (e) { } netState.onlineWs = null; }
  showOnlineScreen('op-main');
}

function _mmNoOpponent() {
  if (_mmTimer) { clearInterval(_mmTimer); _mmTimer = null; }
  if (netState.onlineWs) { try { netState.onlineWs.onclose = null; netState.onlineWs.close(); } catch (e) { } netState.onlineWs = null; }
  _el('mm-status').textContent = 'Rakip bulunamadı. Tekrar dene!';
  _el('mm-fill').style.width = '0%';
  setTimeout(() => showOnlineScreen('op-main'), 2000);
}

// ── Match result / online restart ─────────────────────────────────────────────
function _showOnlineResult(isWinner) {
  netState.restartVotedLocal = false; netState.restartVotedPeer = false;
  netState.onlineLevel = gameState.level;
  const title = _el('go-title');
  title.textContent = isWinner ? 'YOU WIN! 🏆' : 'YOU LOST';
  title.style.color = isWinner ? '#4ade80' : '#ff1744';
  title.style.textShadow = isWinner ? '0 0 24px #4ade80, 0 0 60px rgba(74,222,128,0.4)' : '0 0 24px #ff1744';
  _el('go-winner').textContent = '';
  _el('go-online-btns').style.display = 'flex';
  _el('go-offline-btns').style.display = 'none';
  _el('go-waiting').style.display = 'none';
  _el('go-restart-btn').disabled = false;
  _el('go-restart-btn').textContent = 'RESTART';
  _el('game-over-screen').style.display = 'flex';
  suspendAudio();
}

function _checkBothRestarted() {
  if (!netState.restartVotedLocal || !netState.restartVotedPeer) return;
  _el('game-over-screen').style.display = 'none';
  resumeAudio();
  if (_deps.getGameMode() === 'online-host') {
    gameState._mpNextLevel = false;
    _deps.startGame(netState.mpLobbyTheme || netState.onlineLevel);
  }
}

export function onlineRestartVote() {
  if (netState.restartVotedLocal) return;
  netState.restartVotedLocal = true;
  _el('go-restart-btn').disabled = true;
  _el('go-waiting').style.display = 'block';
  const voteMsg = JSON.stringify({ t: 'restart_vote' });
  rtcSendOrWs(voteMsg);
  _checkBothRestarted();
}

export function mpDeclareWinner(deadPlayer, skipLivesDecrement = false) {
  const gameMode = _deps.getGameMode();
  const isSupported = gameMode === 'multi' || gameMode === 'online-host' || gameMode === 'online-guest' || gameMode === 'online-local';
  if (!isSupported) return false;
  if (!skipLivesDecrement) {
    deadPlayer.lives = Math.max(0, (deadPlayer.lives ?? 3) - 1);
    _deps.updateMpHud(gameState, _deps.players, gameMode);
    if (deadPlayer.lives > 0) {
      const pName = deadPlayer.teamColor === 'blue' ? netState.playerNames[0] : netState.playerNames[1];
      _deps.showFloatingText(deadPlayer.group.position.clone(), pName + ' ' + deadPlayer.lives + ' CAN KALDI',
        deadPlayer.teamColor === 'blue' ? '#42a5f5' : '#ef5350');
      _deps.respawnPlayer(deadPlayer);
      return true;
    }
  }
  gameState._mpNextLevel = true;
  gameState.transitioning = true;
  const winner = _deps.players.find(p => p !== deadPlayer && p.alive && !p.sinking);
  if (!winner) return true;
  const wName = winner.teamColor === 'blue' ? netState.playerNames[0] : netState.playerNames[1];
  const wLabel = wName + ' WINS!';
  const wColor = winner.teamColor === 'blue' ? '#42a5f5' : '#ef5350';
  _deps.showFloatingText(winner.group.position, wLabel, wColor);
  _el('mp-phase-label').textContent = wLabel;

  if (gameMode === 'multi' || gameMode === 'online-local') {
    setTimeout(() => {
      _el('go-title').textContent = 'MATCH OVER';
      _el('go-title').style.color = '#facc15';
      _el('go-title').style.textShadow = '0 0 24px #facc15';
      _el('go-winner').textContent = wLabel;
      _el('go-online-btns').style.display = 'none';
      _el('go-offline-btns').style.display = 'flex';
      _el('game-over-screen').style.display = 'flex';
      playSfx('win');
    }, 2000);
  } else if (gameMode === 'online-host') {
    const resultMsg = JSON.stringify({ t: 'match_result', winnerId: winner.id });
    rtcSendOrWs(resultMsg);
    setTimeout(() => {
      _showOnlineResult(winner.id === 1);
      playSfx(winner.id === 1 ? 'win' : 'die');
    }, 1500);
  }
  return true;
}

// ── MP Lobby (shared between local and online host) ───────────────────────────
function _genBiomeThumb(biomeIdx) {
  const W = 320, H = 200;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const b = BIOMES[biomeIdx];
  const hex = n => '#' + Math.max(0, n).toString(16).padStart(6, '0');
  const blend = (a, c, t) => {
    const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
    const br = (c >> 16) & 255, bg = (c >> 8) & 255, bb = c & 255;
    return ((Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t));
  };

  const skyG = ctx.createLinearGradient(0, 0, 0, H * 0.48);
  skyG.addColorStop(0, hex(blend(b.sky, 0xffffff, 0.08)));
  skyG.addColorStop(1, hex(blend(b.sky, b.ground, 0.25)));
  ctx.fillStyle = skyG; ctx.fillRect(0, 0, W, H * 0.48);

  const gndG = ctx.createLinearGradient(0, H * 0.48, 0, H);
  gndG.addColorStop(0, hex(blend(b.ground, b.sky, 0.18)));
  gndG.addColorStop(1, hex(blend(b.ground, 0x000000, 0.15)));
  ctx.fillStyle = gndG; ctx.fillRect(0, H * 0.48, W, H * 0.52);

  ctx.strokeStyle = hex(blend(b.ground, 0x000000, 0.22));
  ctx.lineWidth = 0.8; ctx.globalAlpha = 0.5;
  for (let i = 1; i < 6; i++) {
    const y = H * 0.48 + (H * 0.52) * (i / 6);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  const vp = { x: W / 2, y: H * 0.48 };
  [-0.38, -0.15, 0.15, 0.38].forEach(xf => {
    ctx.beginPath(); ctx.moveTo(vp.x, vp.y); ctx.lineTo(W * (0.5 + xf * 2), H); ctx.stroke();
  });
  ctx.globalAlpha = 1;

  const hzG = ctx.createLinearGradient(0, H * 0.42, 0, H * 0.56);
  hzG.addColorStop(0, 'transparent');
  hzG.addColorStop(0.5, hex(blend(b.lem || b.lake, 0xffffff, 0.3)) + '55');
  hzG.addColorStop(1, 'transparent');
  ctx.fillStyle = hzG; ctx.fillRect(0, H * 0.42, W, H * 0.14);

  ctx.fillStyle = hex(b.lake); ctx.globalAlpha = 0.72;
  ctx.beginPath(); ctx.ellipse(W * 0.72, H * 0.74, W * 0.14, H * 0.09, 0.15, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 0.35; ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.ellipse(W * 0.68, H * 0.70, W * 0.04, H * 0.02, -0.3, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;

  const treePositions = [[0.1, 0.44], [0.22, 0.43], [0.34, 0.455], [0.58, 0.44], [0.72, 0.43], [0.86, 0.445], [0.94, 0.455]];
  treePositions.forEach(([xf, yf], i) => {
    const tx = W * xf, ty = H * yf, ts = H * (0.055 + ((i * 7) % 3) * 0.015);
    ctx.fillStyle = hex(b.tr || 0x4a3728); ctx.globalAlpha = 0.9;
    ctx.fillRect(tx - ts * 0.18, ty, ts * 0.36, ts * 0.7);
    ctx.fillStyle = hex(b.tc); ctx.globalAlpha = 0.88;
    ctx.beginPath(); ctx.arc(tx, ty, ts, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = hex(blend(b.tc, 0xffffff, 0.35)); ctx.globalAlpha = 0.4;
    ctx.beginPath(); ctx.arc(tx - ts * 0.25, ty - ts * 0.25, ts * 0.45, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  });

  [[0.3, 0.68], [0.45, 0.72], [0.55, 0.65], [0.2, 0.75]].forEach(([xf, yf]) => {
    const zx = W * xf, zy = H * yf, zh = H * 0.055;
    ctx.fillStyle = hex(blend(b.ground, 0x000000, 0.6)); ctx.globalAlpha = 0.75;
    ctx.fillRect(zx - zh * 0.18, zy - zh, zh * 0.36, zh * 0.7);
    ctx.beginPath(); ctx.arc(zx, zy - zh * 1.1, zh * 0.28, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  });

  ctx.strokeStyle = hex(blend(b.rc || 0x607d8b, 0xffffff, 0.2));
  ctx.lineWidth = 1.5; ctx.globalAlpha = 0.4;
  ctx.strokeRect(W * 0.04, H * 0.52, W * 0.92, H * 0.42);
  ctx.globalAlpha = 1;

  const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.85);
  vig.addColorStop(0, 'transparent'); vig.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);
  return cv.toDataURL('image/jpeg', 0.88);
}

function _startMatchmakedGame() {
  const MATCHMAKE_LEVEL = 17;
  const MATCHMAKE_DIFF = 'medium';
  netState.mpLobbyTheme = MATCHMAKE_LEVEL;
  netState.mpLobbyDiff = MATCHMAKE_DIFF;
  applyMpDifficultyConfig(MATCHMAKE_DIFF);
  document.getElementById('main-menu').style.display = 'none';
  document.getElementById('main-menu').style.pointerEvents = '';
  const tcEl = document.getElementById('touch-controls');
  if (tcEl) tcEl.classList.add('active');
  const btnBack = document.getElementById('btn-back');
  if (btnBack) btnBack.style.display = 'flex';
  document.getElementById('mp-hud').style.display = 'block';
  _deps.startGame(MATCHMAKE_LEVEL);
}

function _buildMpLobby() {
  const MP_THEMES = [
    { level: 12, biomeIdx: 11, name: 'Underwater' },
    { level: 13, biomeIdx: 12, name: 'Autumn' },
    { level: 16, biomeIdx: 15, name: 'Ice Desert' },
    { level: 17, biomeIdx: 16, name: 'Toxic Swamp' },
    { level: 25, biomeIdx: 24, name: 'Fairy Forest' },
  ];

  const themeGrid = document.getElementById('mpl-theme-grid');
  if (themeGrid) {
    MP_THEMES.forEach(theme => {
      const thumb = _genBiomeThumb(theme.biomeIdx);
      const btn = document.createElement('button');
      btn.className = 'mpl-theme-btn';
      btn.dataset.level = theme.level;
      btn.innerHTML = `<div class="mpl-theme-img" style="background-image:url('${thumb}')"></div><span class="mpl-theme-name">${theme.name}</span>`;
      btn.addEventListener('click', () => {
        netState.mpLobbyTheme = theme.level;
        themeGrid.querySelectorAll('.mpl-theme-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        document.getElementById('mpl-selected-theme-label').textContent = LEVEL_NAMES[theme.level - 1];
        document.getElementById('mpl-step-theme').classList.remove('active');
        document.getElementById('mpl-step-diff').classList.add('active');
      });
      themeGrid.appendChild(btn);
    });
  }

  const diffGrid = document.getElementById('mpl-diff-grid');
  if (diffGrid) {
    MP_DIFFICULTIES.forEach(d => {
      const btn = document.createElement('button');
      btn.className = 'mpl-diff-btn';
      btn.dataset.diff = d.id;
      btn.innerHTML = `<span class="mpl-diff-emoji">${d.emoji}</span><span class="mpl-diff-name">${d.name}</span><span class="mpl-diff-desc">${d.desc.replace(/\n/g, '<br>')}</span>`;
      btn.addEventListener('click', () => {
        netState.mpLobbyDiff = d.id;
        diffGrid.querySelectorAll('.mpl-diff-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        const startBtn = document.getElementById('mpl-start-btn');
        if (startBtn) startBtn.disabled = false;
      });
      diffGrid.appendChild(btn);
    });
  }

  const startBtn = document.getElementById('mpl-start-btn');
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      if (!netState.mpLobbyTheme || !netState.mpLobbyDiff) return;
      applyMpDifficultyConfig(netState.mpLobbyDiff);
      document.getElementById('mp-lobby').classList.remove('open');
      _deps.onMpStart(netState.mpLobbyTheme);
    });
  }

  const backMain = document.getElementById('mpl-back-main');
  if (backMain) {
    backMain.addEventListener('click', () => {
      document.getElementById('mp-lobby').classList.remove('open');
      document.getElementById('main-menu').style.pointerEvents = '';
    });
  }

  const backTheme = document.getElementById('mpl-back-theme');
  if (backTheme) {
    backTheme.addEventListener('click', () => {
      netState.mpLobbyDiff = null;
      const diffBtnEls = document.getElementById('mpl-diff-grid').querySelectorAll('.mpl-diff-btn');
      diffBtnEls.forEach(b => b.classList.remove('selected'));
      const startBtnEl = document.getElementById('mpl-start-btn');
      if (startBtnEl) startBtnEl.disabled = true;
      document.getElementById('mpl-step-diff').classList.remove('active');
      document.getElementById('mpl-step-theme').classList.add('active');
    });
  }
}

// ── Online panel button wiring ─────────────────────────────────────────────────
function _wireOnlinePanelUI() {
  document.getElementById('btn-online').addEventListener('click', () => {
    initAudio();
    showOnlineScreen('op-main');
    document.getElementById('online-panel').classList.add('open');
  });
  document.getElementById('op-back').addEventListener('click', () => hideOnlinePanel());
  document.getElementById('op-friend-back').addEventListener('click', () => showOnlineScreen('op-main'));
  document.getElementById('op-friend-btn').addEventListener('click', () => {
    document.getElementById('op-error').style.display = 'none';
    showOnlineScreen('op-friend');
  });
  document.getElementById('op-random-btn').addEventListener('click', () => {
    document.getElementById('op-error').style.display = 'none';
    _startMatchmaking();
  });
  document.getElementById('op-mm-cancel').addEventListener('click', _cancelMatchmaking);
  document.getElementById('op-create-btn').addEventListener('click', () => {
    document.getElementById('op-error').style.display = 'none';
    document.getElementById('op-status').textContent = 'Connecting…';
    showOnlineScreen('op-creating');
    _connectWS('host');
  });
  document.getElementById('op-join-btn').addEventListener('click', () => {
    document.getElementById('op-code-input').value = '';
    document.getElementById('op-error').style.display = 'none';
    showOnlineScreen('op-join');
  });
  document.getElementById('op-join-go').addEventListener('click', () => {
    const code = document.getElementById('op-code-input').value.trim().toUpperCase();
    if (code.length < 4) { showOnlineError('Enter a valid room code'); return; }
    document.getElementById('op-error').style.display = 'none';
    _connectWS('guest', code);
  });
  document.getElementById('op-code-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('op-join-go').click();
  });
  document.getElementById('op-code').addEventListener('click', () => {
    if (!netState.onlineRoomCode) return;
    navigator.clipboard.writeText(netState.onlineRoomCode).then(() => {
      const hint = document.getElementById('op-copy-hint');
      if (hint) { hint.textContent = 'COPIED!'; setTimeout(() => { hint.textContent = 'TAP CODE TO COPY'; }, 1500); }
    }).catch(() => { });
  });
  document.getElementById('op-cancel').addEventListener('click', () => {
    if (netState.onlineWs) { try { netState.onlineWs.onclose = null; netState.onlineWs.close(); } catch (e) { } netState.onlineWs = null; }
    showOnlineScreen('op-main');
  });
  document.getElementById('op-wait-cancel').addEventListener('click', () => {
    if (netState.onlineWs) { try { netState.onlineWs.onclose = null; netState.onlineWs.close(); } catch (e) { } netState.onlineWs = null; }
    showOnlineScreen('op-main');
  });
  document.getElementById('op-join-back-btn').addEventListener('click', () => showOnlineScreen('op-main'));

  _buildMpLobby();
}

// ── Cleanup (called by returnToMenu) ─────────────────────────────────────────
export function cleanupOnlineSession() {
  if (_wsKeepAlive) { clearInterval(_wsKeepAlive); _wsKeepAlive = null; }
  _cleanupRTC();
  if (netState.onlineWs) { try { netState.onlineWs.onclose = null; netState.onlineWs.close(); } catch (e) { } netState.onlineWs = null; }
  netState.onlineRole = null;
  netState.onlineRoomCode = null;
  netState.guestLastState = null;
  guestZombieMap.clear();
  guestBombMap.clear();
}

// ── initNetwork — call once at startup after game functions are ready ─────────
export function initNetwork(deps) {
  _deps = deps;
  _wireOnlinePanelUI();
}
