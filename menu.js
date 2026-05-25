import { BIOMES } from './config.js';
import { _el } from './ui.js';
import { initAudio, togglePlayPause, toggleSfx } from './audio.js';
import { gameState } from './state.js';
import { LEVEL_IMAGES } from './level-images.js';

const LEVEL_NAMES = [
  'VALLEY', 'SANDS', 'ISLAND', 'DUNES', 'ECHOES', 'CANYON', 'OBSIDIAN', 'MIRAGE', 'FROST', 'REAPERS',
  'MIST', 'TRENCH', 'HALLOW', 'NIGHTMARE', 'EMBERS', 'GLACIER', 'TOXIC', 'CRYPT', 'SPIRAL', 'SPAWN',
  'BARRIER', 'ATOLL', 'RIFT', 'QUARRY', 'FAIRY', 'LAVA', 'CITADEL', 'CRESCENT', 'UNIT', 'BUNKER'
];

const LEVEL_ICONS = [
  '🌿','🏜️','🏝️','🏜️','🎵','🏞️','🪨','🏜️','❄️','☠️',
  '🌫️','🌊','🎃','🌙','🔥','🧊','☣️','🏰','🌀','🧟',
  '🛡️','🏝️','⚡','⛏️','🧚','🌋','🏯','🌙','🔧','🏚️'
];

const MP_DIFFICULTIES = [
  { id: 'easy', name: 'EASY', emoji: '🌱', zombieCount: 24, barrelCount: 3, cannonPeriod: 15, desc: '24 Zombi\nCannon: 15sn\n3 Barrel' },
  { id: 'medium', name: 'MEDIUM', emoji: '⚔️', zombieCount: 36, barrelCount: 6, cannonPeriod: 10, desc: '36 Zombi\nCannon: 10sn\n6 Barrel' },
  { id: 'hard', name: 'HARD', emoji: '🔥', zombieCount: 46, barrelCount: 9, cannonPeriod: 7, desc: '46 Zombi\nCannon: 7sn\n9 Barrel' },
];

let _mpLobbyTheme = null;
let _mpLobbyDiff = null;
let _launchLevelFn = null;

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
    return ((Math.round(ar + (br - ar) * t) << 16)
      | (Math.round(ag + (bg - ag) * t) << 8)
      | Math.round(ab + (bb - ab) * t));
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

function _showOnlineScreen(id) {
  document.querySelectorAll('.op-screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
  const err = document.getElementById('op-error');
  if (err) err.style.display = 'none';
}

export function showOnlineScreen(id) {
  _showOnlineScreen(id);
}

export function showOnlineError(msg) {
  const el = document.getElementById('op-error');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

export function hideOnlinePanel() {
  document.getElementById('online-panel').classList.remove('open');
}

export function applyMpDifficultyConfig(diffId) {
  const d = MP_DIFFICULTIES.find(x => x.id === diffId) || MP_DIFFICULTIES[1];
  gameState._mpDiff = { zombieCount: d.zombieCount, barrelCount: d.barrelCount, cannonPeriod: d.cannonPeriod };
}

function openMpLobby() {
  _mpLobbyTheme = null;
  _mpLobbyDiff = null;
  document.querySelectorAll('#mpl-diff-grid .mpl-diff-btn').forEach(b => b.classList.remove('selected'));
  document.querySelectorAll('#mpl-theme-grid .mpl-theme-btn').forEach(b => b.classList.remove('selected'));
  const startBtn = document.getElementById('mpl-start-btn'); if (startBtn) startBtn.disabled = true;
  _el('mpl-step-theme').classList.add('active');
  _el('mpl-step-diff').classList.remove('active');
  _el('mp-lobby').classList.add('open');
}

export function openMpLevelSelect() {
  openMpLobby();
}

function _buildCarousel() {
  const carousel = document.getElementById('ls-carousel');
  if (!carousel || carousel.childElementCount > 0) return;
  for (let i = 1; i <= 30; i++) {
    const stars = i <= 10 ? 1 : i <= 20 ? 2 : 3;
    const img = LEVEL_IMAGES[i - 1] || '';

    const card = document.createElement('div');
    card.className = 'ls-card';

    const imgDiv = document.createElement('div');
    imgDiv.className = 'ls-card-img';
    if (img) imgDiv.style.backgroundImage = `url('${img}')`;

    const lvNum = document.createElement('span');
    lvNum.className = 'ls-card-lvnum';
    lvNum.textContent = 'LV ' + i;
    imgDiv.appendChild(lvNum);


    const foot = document.createElement('div');
    foot.className = 'ls-card-foot';

    const nameEl = document.createElement('div');
    nameEl.className = 'ls-card-name';
    nameEl.textContent = LEVEL_NAMES[i - 1];
    foot.appendChild(nameEl);

    const starsEl = document.createElement('div');
    starsEl.className = 'ls-card-stars';
    for (let s = 1; s <= 3; s++) {
      const star = document.createElement('span');
      star.className = s <= stars ? 'ls-star on' : 'ls-star';
      star.textContent = '★';
      starsEl.appendChild(star);
    }
    foot.appendChild(starsEl);

    const btn = document.createElement('button');
    btn.className = 'ls-card-start';
    btn.textContent = '▶ START';
    btn.addEventListener('click', (function(lvl) {
      return function() { _launchLevelFn && _launchLevelFn(lvl); };
    })(i));
    foot.appendChild(btn);

    card.appendChild(imgDiv);
    card.appendChild(foot);
    carousel.appendChild(card);
  }
}

export function openSingleLevelSelect() {
  _buildCarousel();
  document.getElementById('level-select').classList.add('open');
}

function buildMpLobby(onMpLobbyStart) {
  const MP_THEMES = [
    { level: 12, biomeIdx: 11, name: 'Underwater' },
    { level: 13, biomeIdx: 12, name: 'Autumn' },
    { level: 16, biomeIdx: 15, name: 'Ice Desert' },
    { level: 17, biomeIdx: 16, name: 'Toxic Swamp' },
    { level: 25, biomeIdx: 24, name: 'Fairy Forest' },
  ];

  const themeGrid = _el('mpl-theme-grid');
  if (themeGrid) {
    MP_THEMES.forEach(theme => {
      const thumb = _genBiomeThumb(theme.biomeIdx);
      const btn = document.createElement('button');
      btn.className = 'mpl-theme-btn';
      btn.dataset.level = theme.level;
      btn.innerHTML = `<div class="mpl-theme-img" style="background-image:url('${thumb}')"></div><span class="mpl-theme-name">${theme.name}</span>`;
      btn.addEventListener('click', () => {
        _mpLobbyTheme = theme.level;
        themeGrid.querySelectorAll('.mpl-theme-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        _el('mpl-selected-theme-label').textContent = LEVEL_NAMES[theme.level - 1];
        _el('mpl-step-theme').classList.remove('active');
        _el('mpl-step-diff').classList.add('active');
      });
      themeGrid.appendChild(btn);
    });
  }

  const diffGrid = _el('mpl-diff-grid');
  if (diffGrid) {
    MP_DIFFICULTIES.forEach(d => {
      const btn = document.createElement('button');
      btn.className = 'mpl-diff-btn';
      btn.dataset.diff = d.id;
      btn.innerHTML = `<span class="mpl-diff-emoji">${d.emoji}</span><span class="mpl-diff-name">${d.name}</span><span class="mpl-diff-desc">${d.desc.replace(/\n/g, '<br>')}</span>`;
      btn.addEventListener('click', () => {
        _mpLobbyDiff = d.id;
        diffGrid.querySelectorAll('.mpl-diff-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        const startBtn = _el('mpl-start-btn'); if (startBtn) startBtn.disabled = false;
      });
      diffGrid.appendChild(btn);
    });
  }

  const startBtn = _el('mpl-start-btn');
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      if (!_mpLobbyTheme || !_mpLobbyDiff) return;
      applyMpDifficultyConfig(_mpLobbyDiff);
      if (typeof onMpLobbyStart === 'function') onMpLobbyStart(_mpLobbyTheme);
    });
  }

  const backMain = _el('mpl-back-main');
  if (backMain) {
    backMain.addEventListener('click', () => {
      _el('mp-lobby').classList.remove('open');
      _el('main-menu').style.pointerEvents = '';
    });
  }

  const backTheme = _el('mpl-back-theme');
  if (backTheme) {
    backTheme.addEventListener('click', () => {
      _mpLobbyDiff = null;
      const diffBtnEls = _el('mpl-diff-grid').querySelectorAll('.mpl-diff-btn');
      diffBtnEls.forEach(b => b.classList.remove('selected'));
      const startBtnEl = _el('mpl-start-btn'); if (startBtnEl) startBtnEl.disabled = true;
      _el('mpl-step-diff').classList.remove('active');
      _el('mpl-step-theme').classList.add('active');
    });
  }
}

export function setupMenuUI({ startGame, launchLevel, setGameMode, onMpLobbyStart }) {
  _launchLevelFn = launchLevel;
  _buildCarousel();

  const settingsPanel = _el('settings-panel');
  const btnSettingsOpen = _el('btn-settings-open');
  const btnSettingsClose = _el('btn-settings-close');
  if (btnSettingsOpen) btnSettingsOpen.addEventListener('click', () => {
    initAudio();
    if (settingsPanel) settingsPanel.classList.add('open');
  });
  if (btnSettingsClose) btnSettingsClose.addEventListener('click', () => {
    if (settingsPanel) settingsPanel.classList.remove('open');
  });

  const togSfx = _el('tog-sfx');
  if (togSfx) togSfx.addEventListener('click', () => { toggleSfx(); });
  const togMusic = _el('tog-music');
  if (togMusic) togMusic.addEventListener('click', () => { togglePlayPause(); });

  const lsBack = _el('ls-back-btn');
  if (lsBack) lsBack.addEventListener('click', () => {
    _el('level-select').classList.remove('open');
    _el('main-menu').style.pointerEvents = '';
  });

  const startBtn = _el('start-btn');
  if (startBtn) startBtn.addEventListener('click', () => {
    initAudio();
    setGameMode('single');
    openSingleLevelSelect();
  });

  const btnOnline = _el('btn-online');
  if (btnOnline) btnOnline.addEventListener('click', () => {
    initAudio();
    _showOnlineScreen('op-main');
    document.getElementById('online-panel').classList.add('open');
  });

  const opBack = _el('op-back');
  if (opBack) opBack.addEventListener('click', () => {
    document.getElementById('online-panel').classList.remove('open');
  });

  buildMpLobby(onMpLobbyStart);
}
