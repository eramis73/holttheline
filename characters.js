import * as THREE from 'three';
import { gameConfig } from './config.js';
import { scene, geoCache, matCache, worldGroup, boneMat, boneOldMat, addOutline, players } from './scene.js';
import { gameState } from './state.js';
import { netState } from './network.js';
import { updateMpHud } from './ui.js';

let _deps = {};
export function initCharacters(deps) { _deps = deps; }

// ── ZOMBIE DROP HELPERS ───────────────────────────────────────────────────────

export const _dropZombieMat = new THREE.MeshStandardMaterial({ color: 0xffdd00, emissive: 0xffaa00, emissiveIntensity: 0.6, roughness: 0.6, metalness: 0.1 });

export function applyDropColor(z) {
  const skip = new Set([...(z.eyeMeshes || []), z.mouthMesh]);
  z.group.traverse(c => {
    if (c.isMesh && !c.userData.isOutline && c.userData.origMat && !skip.has(c))
      c.material = _dropZombieMat;
  });
}

export function assignDropType() {
  return null;
}

export function createDropIndicators(zGroup) {
  const bombGroup = new THREE.Group();
  const bombBodyMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.7, roughness: 0.3 });
  bombGroup.add(Object.assign(new THREE.Mesh(new THREE.SphereGeometry(3.2, 14, 12), bombBodyMat)));
  const fuseMat = new THREE.MeshStandardMaterial({ color: 0x9b7b20, roughness: 0.8 });
  const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 3.2, 8), fuseMat);
  fuse.position.set(0.9, 4.4, 0); fuse.rotation.z = -0.4; bombGroup.add(fuse);
  const sparkMat = new THREE.MeshStandardMaterial({ color: 0xffee00, emissive: 0xffbb00, emissiveIntensity: 5 });
  const spark = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 8), sparkMat);
  spark.position.set(1.6, 5.7, 0); bombGroup.add(spark);
  const bombRing = new THREE.Mesh(new THREE.TorusGeometry(5.2, 0.45, 8, 32), new THREE.MeshStandardMaterial({ color: 0x555555, emissive: 0x333333, emissiveIntensity: 2.0, roughness: 0.4, metalness: 0.6 }));
  bombRing.rotation.x = Math.PI / 2; bombGroup.add(bombRing);
  bombGroup.position.y = 24; bombGroup.visible = false; zGroup.add(bombGroup);

  const wireGroup = new THREE.Group();
  const ltMat = new THREE.MeshStandardMaterial({ color: 0xff8c00, emissive: 0xff5500, emissiveIntensity: 2.5, roughness: 0.3 });
  [{ p: [1.1, 3.2, 0], rz: 0.5, w: 4.5 }, { p: [0, 0, 0], rz: -0.15, w: 3.2 }, { p: [-1.1, -3.2, 0], rz: 0.5, w: 4.5 }]
    .forEach(({ p, rz, w }) => {
      const s = new THREE.Mesh(new THREE.BoxGeometry(w, 1.4, 1.2), ltMat);
      s.position.set(...p); s.rotation.z = rz; wireGroup.add(s);
    });
  const wireRing = new THREE.Mesh(new THREE.TorusGeometry(5.2, 0.45, 8, 32), new THREE.MeshStandardMaterial({ color: 0xffee00, emissive: 0xffdd00, emissiveIntensity: 3.0, roughness: 0.3 }));
  wireRing.rotation.x = Math.PI / 2; wireGroup.add(wireRing);
  wireGroup.position.y = 24; wireGroup.visible = false; zGroup.add(wireGroup);

  const shieldGroup = new THREE.Group();
  const sShape = new THREE.Shape();
  sShape.moveTo(-3.8, 4.8); sShape.lineTo(3.8, 4.8); sShape.lineTo(3.8, 0.5);
  sShape.quadraticCurveTo(3.8, -3.0, 0, -5.8);
  sShape.quadraticCurveTo(-3.8, -3.0, -3.8, 0.5);
  sShape.closePath();
  const sExtCfg = { depth: 1.4, bevelEnabled: true, bevelThickness: 0.35, bevelSize: 0.35, bevelSegments: 3 };
  const shieldBodyMat = new THREE.MeshStandardMaterial({ color: 0x1565c0, emissive: 0x0a2d55, emissiveIntensity: 0.5, metalness: 0.85, roughness: 0.2 });
  const shieldBody = new THREE.Mesh(new THREE.ExtrudeGeometry(sShape, sExtCfg), shieldBodyMat);
  shieldBody.position.z = -0.7; shieldGroup.add(shieldBody);
  const sRimCfg = { depth: 0.6, bevelEnabled: false };
  const shieldRimBodyMat = new THREE.MeshStandardMaterial({ color: 0x4fc3f7, emissive: 0x1976d2, emissiveIntensity: 0.8, metalness: 0.9, roughness: 0.15 });
  const sRimShape = new THREE.Shape();
  sRimShape.moveTo(-4.3, 5.3); sRimShape.lineTo(4.3, 5.3); sRimShape.lineTo(4.3, 0.5);
  sRimShape.quadraticCurveTo(4.3, -3.5, 0, -6.5);
  sRimShape.quadraticCurveTo(-4.3, -3.5, -4.3, 0.5);
  sRimShape.closePath();
  const shieldRimBody = new THREE.Mesh(new THREE.ExtrudeGeometry(sRimShape, sRimCfg), shieldRimBodyMat);
  shieldRimBody.position.z = -1.2; shieldGroup.add(shieldRimBody);
  const bossMat = new THREE.MeshStandardMaterial({ color: 0x90caf9, emissive: 0x42a5f5, emissiveIntensity: 1.5, metalness: 0.8, roughness: 0.15 });
  const boss = new THREE.Mesh(new THREE.SphereGeometry(1.4, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2), bossMat);
  boss.position.set(0, 0, 0.75); shieldGroup.add(boss);
  [[-2.8, 3.8], [2.8, 3.8], [-3.2, -0.5], [3.2, -0.5]].forEach(([bx, by]) => {
    const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 8), bossMat);
    rivet.position.set(bx, by, 0.8); shieldGroup.add(rivet);
  });
  const shieldRing = new THREE.Mesh(new THREE.TorusGeometry(6.5, 0.45, 8, 32), new THREE.MeshStandardMaterial({ color: 0x42a5f5, emissive: 0x1565c0, emissiveIntensity: 3.0, roughness: 0.2, metalness: 0.4 }));
  shieldRing.rotation.x = Math.PI / 2; shieldGroup.add(shieldRing);
  shieldGroup.position.y = 24; shieldGroup.visible = false; zGroup.add(shieldGroup);

  return { bomb: bombGroup, wire: wireGroup, shield: shieldGroup };
}

// ── PLAYER ────────────────────────────────────────────────────────────────────

export function initPlayer(p) {
  p.group = new THREE.Group();
  const isRed = (p.teamColor === 'red');
  const shirtColor = isRed ? 0xc62828 : 0x1565c0;
  const pantsColor = isRed ? 0x6d1b1b : 0x0d3a6e;
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.8 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: pantsColor, roughness: 0.8 });

  const head = new THREE.Mesh(geoCache.head, matCache.skin);
  head.position.y = 11.5; head.castShadow = true; p.group.add(head);
  const hair = new THREE.Mesh(geoCache.hair, new THREE.MeshStandardMaterial({ color: 0x3e2723 }));
  hair.position.y = 1.0; head.add(hair);
  const body = new THREE.Mesh(geoCache.body, shirtMat);
  body.position.y = 7.0; body.castShadow = true; p.group.add(body);
  p._headRef = head; p._bodyRef = body;

  p.lArm = new THREE.Mesh(geoCache.arm, matCache.skin);
  p.lArm.position.set(-4.2, 9.5, 0); p.lArm.castShadow = true; p.group.add(p.lArm);
  p.rArm = new THREE.Mesh(geoCache.arm, matCache.skin);
  p.rArm.position.set(4.2, 9.5, 0); p.rArm.castShadow = true; p.group.add(p.rArm);

  p.lLeg = new THREE.Mesh(geoCache.leg, pantsMat);
  p.lLeg.position.set(-1.8, 5.0, 0); p.lLeg.castShadow = true; p.group.add(p.lLeg);
  p.rLeg = new THREE.Mesh(geoCache.leg, pantsMat);
  p.rLeg.position.set(1.8, 5.0, 0); p.rLeg.castShadow = true; p.group.add(p.rLeg);

  scene.add(p.group);

  const wireInnerCol = isRed ? 0xff4444 : 0x00e5ff;
  const wireOuterCol = isRed ? 0xff8800 : 0xffcc00;
  p.wireMat = new THREE.MeshStandardMaterial({ color: wireInnerCol, emissive: wireInnerCol, emissiveIntensity: 0.6, roughness: 0.3 });
  p.wireMesh = new THREE.Mesh(new THREE.BufferGeometry(), p.wireMat);
  p.wireMesh.position.y = 3.0; scene.add(p.wireMesh);

  p.wireOuterMat = new THREE.MeshBasicMaterial({ color: wireOuterCol, side: THREE.BackSide });
  p.wireOuterMesh = new THREE.Mesh(new THREE.BufferGeometry(), p.wireOuterMat);
  p.wireOuterMesh.position.y = 3.0; scene.add(p.wireOuterMesh);

  p.startMarker = new THREE.Mesh(geoCache.wireMarker, matCache.wireMarker);
  p.startMarker.position.y = 3.0; p.startMarker.visible = false; scene.add(p.startMarker);

  const shieldMat = new THREE.MeshStandardMaterial({
    color: 0x80d8ff, emissive: 0x00bcd4, emissiveIntensity: 0.4,
    transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide
  });
  p._shieldMesh = new THREE.Mesh(new THREE.CapsuleGeometry(7, 9, 8, 16), shieldMat);
  p._shieldMesh.position.y = 8; p._shieldMesh.visible = false;
  p.group.add(p._shieldMesh);
  p._shieldOutline = null;

  p.group.scale.setScalar(1.995);
  p.group.traverse(c => {
    if (c.isMesh && c !== p._shieldMesh) {
      c.material = c.material.clone();
      c.origColor = c.material.color.getHex();
    }
  });

  resetPlayer(p);
}

export function resetPlayer(p) {
  p.alive = true; p.group.visible = true;
  p.sinking = false; p.sinkTimer = 0;
  p.group.rotation.set(0, 0, 0);
  p.group.scale.setScalar(1.995);
  p.x = 0; p.z = 0;
  p.group.position.set(p.x, 0, p.z);
  p.dashTimer = 0; p.isDashing = false; p.combo = 0; p.comboTime = 0; p.dashDur = 0;
  p.isDrawingWire = false; p.wirePoints = [];
  p.wireMesh.geometry.dispose(); p.wireMesh.geometry = new THREE.BufferGeometry();
  p.wireOuterMesh.geometry.dispose(); p.wireOuterMesh.geometry = new THREE.BufferGeometry();
  p.startMarker.visible = false;
  p.wireMesh.visible = true; p.wireOuterMesh.visible = true;
  p.buffSpeedTime = 0; p.shield = false; p.shields = 0; p.slowTime = 0; p.bombs = 0; p._bombKeyHeld = false;
  if (p._shieldMesh) p._shieldMesh.visible = false;
  if (p._shieldOutline) p._shieldOutline.visible = false;
  p.group.traverse(c => { if (c.isMesh && c.origColor) c.material.color.setHex(c.origColor); });
}

export function respawnPlayer(p) {
  if (!gameState.active) return;
  resetPlayer(p);
  const spawnX = p.id === 1 ? -40 : 40;
  p.x = spawnX; p.z = 0;
  p.group.position.set(spawnX, 0, 0);
  p._cannonHit = false;
  gameState.transitioning = false;
  updateMpHud(gameState, players, _deps.getGameMode ? _deps.getGameMode() : 'single');
  _deps.showFloatingText && _deps.showFloatingText(p.group.position, '▶ RESPAWN', p.teamColor === 'blue' ? '#42a5f5' : '#ef5350');
}

// ── ZOMBIE TYPES ──────────────────────────────────────────────────────────────
// Level 1-6: gray beret  |  7-12: orange hazmat  |  13-18: green helmet
// 19-24: dark teal helmet  |  25-30: pink clown

const ZOMBIE_TYPES = [
  { clothColor: 0x808080, accentColor: 0xDC143C, hat: 'beret'  },
  { clothColor: 0xFF8C00, accentColor: null,      hat: null     },
  { clothColor: 0x2E8B57, accentColor: 0x2F4F4F, hat: 'helmet' },
  { clothColor: 0x00CED1, accentColor: 0x111111, hat: 'helmet' },
  { clothColor: 0xFF69B4, accentColor: 0xFF0000, hat: 'clown'  },
];

function _getZombieTypeIdx() {
  return Math.floor(Math.random() * 5);
}

function _buildZombieGroup(typeIdx, mpCapColor) {
  const S = 10;
  const cfg = ZOMBIE_TYPES[typeIdx];
  const rBone = Math.random() < 0.5 ? boneMat : boneOldMat;
  const clothMat = new THREE.MeshStandardMaterial({ color: cfg.clothColor, roughness: 1.0 });
  const darkMat  = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
  const socketMat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.9 });
  const eyeIrisMat = new THREE.MeshStandardMaterial({ color: 0xcc0000, emissive: 0xaa0000, emissiveIntensity: 2.5, roughness: 0.2 });
  const mouthMat  = new THREE.MeshStandardMaterial({ color: 0xcc0000, emissive: 0x880000, emissiveIntensity: 1.5, roughness: 0.7 });

  const zGroup = new THREE.Group();

  // ── Torso ──
  const torso = new THREE.Group();
  torso.position.y = 1.3 * S;
  zGroup.add(torso);

  const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.05*S, 0.06*S, 0.7*S, 8), rBone);
  spine.position.y = -0.1*S; spine.castShadow = true;
  torso.add(spine); addOutline(spine, 1.06);

  for (let i = 0; i < 4; i++) {
    const ribSize = (0.22 - i * 0.025) * S;
    const rib = new THREE.Mesh(new THREE.TorusGeometry(ribSize, 0.035*S, 8, 16, Math.PI * 1.2), rBone);
    rib.rotation.x = Math.PI / 2; rib.rotation.z = Math.PI * 0.9;
    rib.position.y = (0.1 - i * 0.12) * S; rib.position.z = -0.05*S;
    rib.castShadow = true; torso.add(rib);
  }

  const shirt = new THREE.Mesh(new THREE.CylinderGeometry(0.35*S, 0.38*S, 0.4*S, 16, 1, false, 0, Math.PI * 1.5), clothMat);
  shirt.position.y = 0.1*S; shirt.castShadow = true; torso.add(shirt);

  // ── Head ──
  const neckGroup = new THREE.Group();
  neckGroup.position.y = 0.35 * S;
  torso.add(neckGroup);

  const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.4*S, 24, 16), rBone);
  cranium.position.y = 0.2*S; cranium.castShadow = true;
  neckGroup.add(cranium); addOutline(cranium, 1.08);

  // Jaw
  const jawGrp = new THREE.Group();
  jawGrp.position.set(0, 0, 0.05*S);
  neckGroup.add(jawGrp);

  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.32*S, 0.2*S, 0.35*S), rBone);
  jaw.castShadow = true; jawGrp.add(jaw); addOutline(jaw, 1.1);

  const mouthGlow = new THREE.Mesh(new THREE.BoxGeometry(0.22*S, 0.07*S, 0.1*S), mouthMat);
  mouthGlow.position.set(0, -0.04*S, 0.1*S); jawGrp.add(mouthGlow);

  for (let i = -2; i <= 2; i++) {
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.03*S, 0.08*S, 0.03*S), rBone);
    tooth.position.set(i * 0.04*S, -0.03*S, 0.12*S); jawGrp.add(tooth);
  }

  // Eyes
  const eyeMeshes = [];
  [-0.13*S, 0.13*S].forEach(ox => {
    const sock = new THREE.Mesh(new THREE.SphereGeometry(0.09*S, 10, 8), socketMat);
    sock.position.set(ox, 0.2*S, 0.34*S); neckGroup.add(sock); eyeMeshes.push(sock);
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.065*S, 8, 6), eyeIrisMat);
    iris.position.set(ox, 0.2*S, 0.375*S); neckGroup.add(iris); eyeMeshes.push(iris);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.028*S, 6, 5), socketMat.clone());
    pupil.position.set(ox, 0.2*S, 0.405*S); neckGroup.add(pupil); eyeMeshes.push(pupil);
  });
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.05*S, 0.12*S, 3), socketMat);
  nose.rotation.x = Math.PI / 2; nose.position.set(0, 0.1*S, 0.32*S);
  neckGroup.add(nose); eyeMeshes.push(nose);

  // Team cap ring (invisible by default, shown in MP)
  const capColor = mpCapColor || 0x1565c0;
  const capMat = new THREE.MeshStandardMaterial({ color: capColor, emissive: capColor, emissiveIntensity: mpCapColor ? 2.0 : 0, roughness: 0.3, transparent: true, opacity: 0.92 });
  const capMesh = new THREE.Mesh(new THREE.TorusGeometry(3.65, 1.5, 8, 28), capMat);
  capMesh.rotation.x = -Math.PI / 2; capMesh.position.y = 0.6*S;
  capMesh.visible = false; capMesh.userData.isTeamCap = true; neckGroup.add(capMesh);

  // Type-specific hat
  if (cfg.hat === 'clown') {
    const hatMat = new THREE.MeshStandardMaterial({ color: cfg.accentColor, roughness: 0.6 });
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.3*S, 0.6*S, 16), hatMat);
    hat.position.y = (0.2 + 0.3)*S; hat.castShadow = true; neckGroup.add(hat);
    const pompom = new THREE.Mesh(new THREE.SphereGeometry(0.1*S, 8, 8), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    pompom.position.y = 0.3*S; hat.add(pompom);
  } else if (cfg.hat === 'helmet') {
    const hatMat = new THREE.MeshStandardMaterial({ color: cfg.accentColor, roughness: 0.4, metalness: 0.6 });
    const hat = new THREE.Mesh(new THREE.SphereGeometry(0.36*S, 24, 16, 0, Math.PI*2, 0, Math.PI/2), hatMat);
    hat.position.y = 0.2*S; hat.castShadow = true; neckGroup.add(hat);
  } else if (cfg.hat === 'beret') {
    const hatMat = new THREE.MeshStandardMaterial({ color: cfg.accentColor, roughness: 0.8 });
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.35*S, 0.35*S, 0.1*S, 24), hatMat);
    hat.position.y = 0.55*S; hat.rotation.z = 0.3; hat.castShadow = true; neckGroup.add(hat);
  }

  // ── Left Arm ──
  const armLGroup = new THREE.Group();
  armLGroup.position.set(-0.45*S, 0.15*S, 0); torso.add(armLGroup);

  const upperArmL = new THREE.Mesh(new THREE.CapsuleGeometry(0.12*S, 0.1875*S, 4, 8), clothMat);
  upperArmL.position.y = -0.15*S; upperArmL.castShadow = true; armLGroup.add(upperArmL);

  const elbowL = new THREE.Group(); elbowL.position.y = -0.36*S; armLGroup.add(elbowL);
  const lowerArmL = new THREE.Mesh(new THREE.CapsuleGeometry(0.048*S, 0.225*S, 4, 8), rBone);
  lowerArmL.position.y = -0.15*S; lowerArmL.castShadow = true; elbowL.add(lowerArmL);
  const handL = new THREE.Mesh(new THREE.BoxGeometry(0.12*S, 0.05*S, 0.08*S), rBone);
  handL.position.y = -0.32*S; handL.castShadow = true; elbowL.add(handL);

  // ── Right Arm ──
  const armRGroup = new THREE.Group();
  armRGroup.position.set(0.45*S, 0.15*S, 0); torso.add(armRGroup);

  const upperArmR = new THREE.Mesh(new THREE.CapsuleGeometry(0.12*S, 0.1875*S, 4, 8), clothMat);
  upperArmR.position.y = -0.15*S; upperArmR.castShadow = true; armRGroup.add(upperArmR);

  const elbowR = new THREE.Group(); elbowR.position.y = -0.36*S; armRGroup.add(elbowR);
  const lowerArmR = new THREE.Mesh(new THREE.CapsuleGeometry(0.048*S, 0.225*S, 4, 8), rBone);
  lowerArmR.position.y = -0.15*S; lowerArmR.castShadow = true; elbowR.add(lowerArmR);
  const handR = new THREE.Mesh(new THREE.BoxGeometry(0.12*S, 0.05*S, 0.08*S), rBone);
  handR.position.y = -0.32*S; handR.castShadow = true; elbowR.add(handR);

  // ── Left Leg ──
  const legLGroup = new THREE.Group();
  legLGroup.position.set(-0.2*S, 0.9*S, 0); zGroup.add(legLGroup);

  const thighL = new THREE.Mesh(new THREE.CapsuleGeometry(0.144*S, 0.2625*S, 4, 8), darkMat);
  thighL.position.y = -0.15*S; thighL.castShadow = true; legLGroup.add(thighL);

  const kneeL = new THREE.Group(); kneeL.position.y = -0.38*S; legLGroup.add(kneeL);
  const shinL = new THREE.Mesh(new THREE.CapsuleGeometry(0.12*S, 0.2625*S, 4, 8), clothMat);
  shinL.position.y = -0.15*S; shinL.castShadow = true; kneeL.add(shinL);
  const shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.18*S, 0.15*S, 0.25*S), darkMat);
  shoeL.position.set(0, -0.36*S, 0.05*S); shoeL.castShadow = true; kneeL.add(shoeL);

  // ── Right Leg ──
  const legRGroup = new THREE.Group();
  legRGroup.position.set(0.2*S, 0.9*S, 0); zGroup.add(legRGroup);

  const thighR = new THREE.Mesh(new THREE.CapsuleGeometry(0.144*S, 0.2625*S, 4, 8), darkMat);
  thighR.position.y = -0.15*S; thighR.castShadow = true; legRGroup.add(thighR);

  const kneeR = new THREE.Group(); kneeR.position.y = -0.38*S; legRGroup.add(kneeR);
  const shinR = new THREE.Mesh(new THREE.CapsuleGeometry(0.072*S, 0.2625*S, 4, 8), rBone);
  shinR.position.y = -0.15*S; shinR.castShadow = true; kneeR.add(shinR);
  const shoeR = new THREE.Mesh(new THREE.BoxGeometry(0.18*S, 0.15*S, 0.25*S), darkMat);
  shoeR.position.set(0, -0.36*S, 0.05*S); shoeR.castShadow = true; kneeR.add(shoeR);

  return { zGroup, lArm: armLGroup, rArm: armRGroup, lLeg: legLGroup, rLeg: legRGroup, jawGrp, eyeMeshes, mouthMesh: mouthGlow, capMesh };
}

// ── ZOMBIE ────────────────────────────────────────────────────────────────────

export function spawnZombieAt(zx, zz, baseSpeed) {
  let zType = 0; let scale = 1.89; let hp = 1; let speed = baseSpeed;

  const gameMode = _deps.getGameMode ? _deps.getGameMode() : 'single';
  const mpTeamIdx = (gameMode === 'multi' || gameMode === 'online-host' || gameMode === 'online-local') ? (gameState.zombiesSpawned % 2) : -1;
  const mpCapColor = mpTeamIdx === 0 ? 0x1565c0 : mpTeamIdx === 1 ? 0xc62828 : null;

  let z = gameState.entities.zombies.find(zm => !zm.active);
  if (z) {
    z.active = true; z.group.visible = true; z.group.position.set(zx, 0, zz); z.speed = speed;
    z.hp = hp; z.maxHp = hp; z.type = zType; z.group.scale.setScalar(scale);
    z.isFalling = false; z.fallTime = 0;
    z.shocked = false; z.shockTimer = 0; z.smokeTimer = 0; z._charApplied = false;
    z.group.rotation.set(0, 0, 0);
    z.group.traverse(child => { if (child.isMesh && !child.userData.isOutline && child.userData.origMat) { child.material = child.userData.origMat; child.userData.shockMat = null; } });
    z._netId = ++netState.zombieNetId;
    z.wanderX = (Math.random() - 0.5) * 80; z.wanderZ = (Math.random() - 0.5) * 80; z.wanderTimer = 2 + Math.random() * 3;
    z.teamIdx = mpTeamIdx;
    if (z._teamCapMesh) { z._teamCapMesh.visible = false; }
    if (z._dropMeshes) { Object.values(z._dropMeshes).forEach(m => { m.visible = false; }); }
    z.dropType = assignDropType();
    z._killedBy = null;
    if (z.dropType && z._dropMeshes) { z._dropMeshes[z.dropType].visible = true; }
    if (z.dropType) applyDropColor(z);
    if (mpTeamIdx >= 0) {
      const eyeMat = mpTeamIdx === 0
        ? new THREE.MeshStandardMaterial({ color: 0x1e88e5, emissive: 0x1565c0, emissiveIntensity: 3.0, roughness: 0.2 })
        : new THREE.MeshStandardMaterial({ color: 0xff1744, emissive: 0xb71c1c, emissiveIntensity: 3.0, roughness: 0.2 });
      [0, 1, 2, 3].forEach(i => { if (z.eyeMeshes && z.eyeMeshes[i]) z.eyeMeshes[i].material = eyeMat; });
    }
    return z;
  }
  if (gameState.entities.zombies.length > 700) return;

  const { zGroup, lArm, rArm, lLeg, rLeg, jawGrp, eyeMeshes, mouthMesh: mouthGlow, capMesh } = _buildZombieGroup(_getZombieTypeIdx(), mpCapColor);

  zGroup.scale.setScalar(scale);
  zGroup.position.set(zx, 0, zz); worldGroup.add(zGroup);
  zGroup.traverse(child => { if (child.isMesh && !child.userData.isOutline) child.userData.origMat = child.material; });
  const _dropMeshes = createDropIndicators(zGroup);
  const _dropType = assignDropType();
  if (_dropType) { _dropMeshes[_dropType].visible = true; }
  if (_dropType) {
    const _skipEyes = new Set([...eyeMeshes, mouthGlow]);
    zGroup.traverse(c => { if (c.isMesh && !c.userData.isOutline && c.userData.origMat && !_skipEyes.has(c)) c.material = _dropZombieMat; });
  }
  if (mpTeamIdx >= 0) {
    const eyeMat = mpTeamIdx === 0
      ? new THREE.MeshStandardMaterial({ color: 0x1e88e5, emissive: 0x1565c0, emissiveIntensity: 3.0, roughness: 0.2 })
      : new THREE.MeshStandardMaterial({ color: 0xff1744, emissive: 0xb71c1c, emissiveIntensity: 3.0, roughness: 0.2 });
    [0, 1, 2, 3].forEach(i => { if (eyeMeshes[i]) eyeMeshes[i].material = eyeMat; });
  }
  gameState.entities.zombies.push({
    group: zGroup, lLeg: lLeg, rLeg: rLeg, lArm: lArm, rArm: rArm, jawGrp: jawGrp,
    eyeMeshes: eyeMeshes, mouthMesh: mouthGlow,
    active: true, dirX: 0, dirZ: 0, speed: speed,
    hp: hp || 1, maxHp: hp || 1, type: zType || 0,
    isFalling: false, fallTime: 0,
    shocked: false, shockTimer: 0, smokeTimer: 0,
    wanderX: (Math.random() - 0.5) * 80, wanderZ: (Math.random() - 0.5) * 80, wanderTimer: 2 + Math.random() * 3,
    teamIdx: mpTeamIdx, _teamCapMesh: capMesh, _haloPhase: Math.random() * Math.PI * 2,
    _netId: ++netState.zombieNetId, _guestOnly: false,
    _dropMeshes: _dropMeshes, dropType: _dropType, _killedBy: null
  });
  return gameState.entities.zombies[gameState.entities.zombies.length - 1];
}
