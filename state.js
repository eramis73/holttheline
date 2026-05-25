export const gameState = {
  active: false,
  level: 1,
  transitioning: false,
  zombiesAwake: true,
  spawnTimer: 0,
  kills: 0,
  _wasFrozen: false,
  slowMoTimer: 0,
  _mpNextLevel: false,
  lakes: [],
  entities: { zombies: [], trees: [], flowers: [], barrels: [], powerups: [], patrollers: [], powerupBoxes: [], diamonds: [] },
  boxSpawnTimes: [],
  lightningSpawnTimes: [],
  diamondSpawnTimes: [],
  levelTime: 0,
  paused: false
};

export function _ensurePowerupBoxes() {
  if (!gameState.entities) gameState.entities = {};
  if (!gameState.entities.powerupBoxes) gameState.entities.powerupBoxes = [];
}
