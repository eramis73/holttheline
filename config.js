// v2
export const gameConfig = {
  player: {
    baseSpeed: 75,
    buffSpeed: 129,
    slowSpeed: 32,
    dashSpeed: 322,
    dashDuration: 0.20,
    dashCooldown: 1.5,
    bodyRadius: 7,
    kickStrength: 25,
    barrelKickStrength: 5,
    wireLimit: 500,
  },
  zombies: {
    baseSpeed: 12.65,
    speedIncrement: 0.4,
    spawnInterval: 2.0,
    collisionRadius: 4.0,
    killRadiusLarge: 11.0,
    killRadiusSmall: 7.0,
  },
  bombs: {
    fuseTime: 5.0,
    maxFlameRange: 180,
    coreBlastRadius: 20,
    collisionRadius: 16,
    kickMaxStrength: 500,
  },
  barrels: {
    collisionRadius: 20,
    kickMaxStrength: 40,
    blastRange: 60,
    blastHalfWidth: 5,
  },
  arena: {
    limitZ: 226,
    limitX: 314,
  },
  zombieDrops: {
    bombCount: 2,
    shieldCount: 2,
    wireCount: 2,
    wireAmount: 300,
  },
};

export const ARENA_LIMIT = gameConfig.arena.limitZ;
export const ARENA_LIMIT_X = gameConfig.arena.limitX;

export const BIOMES = [
  { sky: 0x263238, ground: 0x7cb342, lake: 0x00d4ff, lem: 0x004488, tree: 'pine', tc: 0x4caf50, tr: 0x5d4037, s1: 0xaed581, s2: 0x00d4ff, rc: 0x78909c, reed: 0x558b2f },
  { sky: 0x3d2000, ground: 0xffb74d, lake: 0x1de9b6, lem: 0x00bfa5, tree: 'cactus', tc: 0x81c784, tr: 0xafb42b, s1: 0xaed581, s2: 0x1de9b6, rc: 0xd7ccc8, reed: 0xc8a560 },
  { sky: 0x1a0000, ground: 0x424242, lake: 0xff3d00, lem: 0xff1744, tree: 'rock', tc: 0x212121, tr: 0x000000, s1: 0xaed581, s2: 0xff3d00, rc: 0x1a1a1a, reed: 0x4e342e },
  { sky: 0x002200, ground: 0x33691e, lake: 0xb2ff59, lem: 0x64dd17, tree: 'balls', tc: 0x558b2f, tr: 0x3e2723, s1: 0xaed581, s2: 0xb2ff59, rc: 0x4e342e, reed: 0x33691e },
  { sky: 0x000022, ground: 0xe0f7fa, lake: 0x00e5ff, lem: 0x0088cc, tree: 'crystal', tc: 0xb2ebf2, tr: 0x4dd0e1, s1: 0xaed581, s2: 0x00e5ff, rc: 0xeceff1, reed: 0x80deea },
  { sky: 0x006994, ground: 0xf4d03f, lake: 0x00b4d8, lem: 0x0077a8, tree: 'pine', tc: 0x27ae60, tr: 0x6d4c41, s1: 0xfad02e, s2: 0x00b4d8, rc: 0xfaf0e6, reed: 0xf39c12 },
  { sky: 0x3e0000, ground: 0x221515, lake: 0x550000, lem: 0xff0000, tree: 'grave', tc: 0x4a4a4a, tr: 0x2b2b2b, s1: 0x8a0303, s2: 0x111111, rc: 0x37474f, reed: 0x3e2723 },
  { sky: 0x1a202c, ground: 0xa0aec0, lake: 0xeab308, lem: 0xfacc15, tree: 'labPillar', tc: 0xeab308, tr: 0x1e293b, s1: 0xeab308, s2: 0x64748b, rc: 0x546e7a, reed: 0x37474f },
  { sky: 0x8ecae6, ground: 0xdde5ed, lake: 0x90caf9, lem: 0x1565c0, tree: 'pine', tc: 0xb0bec5, tr: 0x78909c, s1: 0xffffff, s2: 0x90caf9, rc: 0xe0e0e0, reed: 0x607d8b },
  { sky: 0xf9a825, ground: 0xc8a951, lake: 0x80cbc4, lem: 0x00695c, tree: 'cactus', tc: 0xa5d6a7, tr: 0x8d6e63, s1: 0xffe082, s2: 0x80cbc4, rc: 0xd7ccc8, reed: 0xbcaaa4 },
  { sky: 0x0a0015, ground: 0x1a0033, lake: 0x7c4dff, lem: 0xb388ff, tree: 'crystal', tc: 0xce93d8, tr: 0x7b1fa2, s1: 0xf3e5f5, s2: 0x7c4dff, rc: 0x4a148c, reed: 0x6a1b9a },
  { sky: 0x003366, ground: 0x005577, lake: 0x00acc1, lem: 0x00e5ff, tree: 'balls', tc: 0x26c6da, tr: 0x00838f, s1: 0x80deea, s2: 0x00e5ff, rc: 0x006064, reed: 0x0097a7 },
  { sky: 0x4a2800, ground: 0xbf6b25, lake: 0x6d4c41, lem: 0xff7043, tree: 'pine', tc: 0xe64a19, tr: 0x4e342e, s1: 0xffcc80, s2: 0xffa726, rc: 0xa1887f, reed: 0x8d6e63 },
  { sky: 0x200000, ground: 0x3b0000, lake: 0xb71c1c, lem: 0xff1744, tree: 'rock', tc: 0x4e0000, tr: 0x1a0000, s1: 0xff8a80, s2: 0xff1744, rc: 0x212121, reed: 0x5d1010 },
  { sky: 0x0d0d1a, ground: 0x1a1a2e, lake: 0xff00ff, lem: 0xff80ab, tree: 'labPillar', tc: 0xff00ff, tr: 0x0d0d1a, s1: 0xff80ab, s2: 0xff00ff, rc: 0x1a0033, reed: 0x6a0080 },
  { sky: 0xe3f2fd, ground: 0xffffff, lake: 0x81d4fa, lem: 0x0288d1, tree: 'cactus', tc: 0xe0f7fa, tr: 0xb0bec5, s1: 0xffffff, s2: 0x81d4fa, rc: 0xeceff1, reed: 0x90a4ae },
  { sky: 0x1b2000, ground: 0x33400a, lake: 0xaeea00, lem: 0x76ff03, tree: 'balls', tc: 0xccff90, tr: 0x33691e, s1: 0xf4ff81, s2: 0xaeea00, rc: 0x558b2f, reed: 0x9e9d24 },
  { sky: 0x000000, ground: 0x0d0d0d, lake: 0x311b92, lem: 0x7c4dff, tree: 'crystal', tc: 0x4527a0, tr: 0x1a0057, s1: 0x9575cd, s2: 0x7c4dff, rc: 0x12005e, reed: 0x4527a0 },
  { sky: 0xff6f00, ground: 0xff8f00, lake: 0xff3d00, lem: 0xffab40, tree: 'pine', tc: 0xffd54f, tr: 0x6d4c41, s1: 0xffe082, s2: 0xff6e40, rc: 0xd84315, reed: 0xe65100 },
  { sky: 0x8d6e63, ground: 0xd7b899, lake: 0xa1887f, lem: 0x6d4c41, tree: 'rock', tc: 0xbcaaa4, tr: 0x5d4037, s1: 0xffe0b2, s2: 0xffccbc, rc: 0x8d6e63, reed: 0x795548 },
  { sky: 0x4a148c, ground: 0x6a1b9a, lake: 0xf48fb1, lem: 0xf06292, tree: 'balls', tc: 0xf8bbd0, tr: 0x880e4f, s1: 0xfce4ec, s2: 0xf48fb1, rc: 0xad1457, reed: 0xc2185b },
  { sky: 0xb0c4de, ground: 0xf5f5f5, lake: 0x90caf9, lem: 0x1e88e5, tree: 'pine', tc: 0xffffff, tr: 0x546e7a, s1: 0xe3f2fd, s2: 0xbbdefb, rc: 0xcfd8dc, reed: 0x78909c },
  { sky: 0x110000, ground: 0x3e1000, lake: 0xff6d00, lem: 0xff9100, tree: 'rock', tc: 0xff3d00, tr: 0x220000, s1: 0xff6e40, s2: 0xff6d00, rc: 0x111111, reed: 0x7f0000 },
  { sky: 0x050510, ground: 0x0a1628, lake: 0x00ff87, lem: 0x00e676, tree: 'labPillar', tc: 0x00e676, tr: 0x002d1b, s1: 0xb9f6ca, s2: 0x00ff87, rc: 0x00251a, reed: 0x005b3a },
  { sky: 0xfce4ec, ground: 0xf8bbd0, lake: 0xf48fb1, lem: 0xe91c63, tree: 'pine', tc: 0xffc1e3, tr: 0xad1457, s1: 0xfff9c4, s2: 0xf48fb1, rc: 0xf06292, reed: 0xe91c63 },
  { sky: 0x1c2833, ground: 0x2e4053, lake: 0x1a5276, lem: 0x2980b9, tree: 'pine', tc: 0x566573, tr: 0x1c2833, s1: 0xaeb6bf, s2: 0x2e86c1, rc: 0x34495e, reed: 0x2c3e50 },
  { sky: 0x006073, ground: 0x00838f, lake: 0x00bcd4, lem: 0x00e5ff, tree: 'crystal', tc: 0xffab91, tr: 0xff7043, s1: 0xff80ab, s2: 0xf48fb1, rc: 0x00acc1, reed: 0xff7043 },
  { sky: 0x1a0030, ground: 0x2d003d, lake: 0x7b00d4, lem: 0xaa00ff, tree: 'grave', tc: 0x6a0080, tr: 0x1a0030, s1: 0xe1bee7, s2: 0xaa00ff, rc: 0x311b92, reed: 0x4a148c },
  { sky: 0x0d1b2a, ground: 0x112233, lake: 0x0097a7, lem: 0x00e5ff, tree: 'crystal', tc: 0x80deea, tr: 0x006064, s1: 0xe0f7fa, s2: 0x00acc1, rc: 0x004d5a, reed: 0x00838f },
  { sky: 0xfff8e1, ground: 0xffe082, lake: 0xffca28, lem: 0xf9a825, tree: 'cactus', tc: 0xffd54f, tr: 0xa1887f, s1: 0xfff9c4, s2: 0xffd740, rc: 0xffecb3, reed: 0xffb300 },
];

export const LEVELS = [];
for (let i = 1; i <= 30; i++) {
  const totalZ = Math.min(Math.round((10 + (i - 1) * 3) * 0.75), 75);
  LEVELS.push({
    totalZombies: totalZ,
    startZombies: Math.max(3, Math.floor(totalZ * 0.35)),
    zombieSpeed: gameConfig.zombies.baseSpeed + (Math.min(i, 5) - 1) * gameConfig.zombies.speedIncrement,
    chanceTank: Math.min(0.35, i > 4 ? (i - 4) * 0.025 : 0),
    barrelCount: Math.min(8, Math.floor(i / 2)),
    powerupChance: 0.25 + i * 0.015,
  });
};
