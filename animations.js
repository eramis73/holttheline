import * as THREE from 'three';
import { BIOMES } from './config.js';
import { scene, geoCache, matCache, explosions, players, worldGroup } from './scene.js';
import { gameState } from './state.js';
import { netState } from './network.js';
import { playSfx } from './audio.js';
import { vibe } from './ui.js';

// Injected app-level callbacks
let _deps = {};
export function initAnimations(deps) { _deps = deps; }

// ── VISUAL EFFECT CREATORS ───────────────────────────────────────────────────

export function createSplatter(pos) {
  const parts = [];
  const b = gameState.biome || BIOMES[0];
  const splatMat1 = new THREE.MeshBasicMaterial({ color: b.s1 });
  const splatMat2 = new THREE.MeshBasicMaterial({ color: b.s2 });
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(geoCache.smokePuff, (Math.random() > 0.5) ? splatMat1 : splatMat2);
    m.position.copy(pos); m.position.y += 5.0; scene.add(m);
    parts.push({ mesh: m, vx: (Math.random() - 0.5) * 150, vy: Math.random() * 120 + 30, vz: (Math.random() - 0.5) * 150 });
  }
  explosions.push({ parts: parts, life: 0.5 });
}

export function createWireZap(fromPt, toPos) {
  const from = new THREE.Vector3(fromPt.x, 4, fromPt.z);
  const to = new THREE.Vector3(toPos.x, toPos.y + 8, toPos.z);

  function makeBolt(start, end, roughness) {
    const pts = [start.clone()];
    const dir = new THREE.Vector3().subVectors(end, start);
    const len = dir.length();
    const perp = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
    const segs = Math.max(5, Math.floor(len / 12));
    for (let i = 1; i < segs; i++) {
      const t = i / segs;
      const p = new THREE.Vector3().lerpVectors(start, end, t);
      p.addScaledVector(perp, (Math.random() - 0.5) * roughness * len * 0.5);
      p.y += (Math.random() - 0.5) * roughness * 10;
      pts.push(p);
    }
    pts.push(end.clone());
    return pts;
  }

  function spawnLine(pts, color, opacity, duration) {
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
    const line = new THREE.Line(geo, mat);
    scene.add(line);
    let age = 0;
    const fade = () => {
      age += 0.016;
      mat.opacity = Math.max(0, opacity * (1 - age / duration));
      if (age < duration) requestAnimationFrame(fade);
      else scene.remove(line);
    };
    requestAnimationFrame(fade);
    return pts;
  }

  const mainPts = makeBolt(from, to, 0.35);
  spawnLine(mainPts, 0xffffff, 1.0, 0.4);
  spawnLine(mainPts, 0x4499ff, 0.85, 0.45);

  const branchCount = 4 + Math.floor(Math.random() * 3);
  for (let b = 0; b < branchCount; b++) {
    const t0 = 0.15 + Math.random() * 0.65;
    const bStart = new THREE.Vector3().lerpVectors(from, to, t0);
    const dir = new THREE.Vector3().subVectors(to, from).normalize();
    const perp = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
    const bLen = 20 + Math.random() * 35;
    const bEnd = bStart.clone()
      .addScaledVector(dir, bLen * (0.3 + Math.random() * 0.5))
      .addScaledVector(perp, (Math.random() - 0.5) * bLen * 1.2);
    bEnd.y += (Math.random() - 0.5) * 15;
    const bPts = makeBolt(bStart, bEnd, 0.5);
    spawnLine(bPts, 0x88ccff, 0.75, 0.3);
    if (Math.random() < 0.4 && bPts.length > 2) {
      const subStart = bPts[Math.floor(bPts.length * 0.4)].clone();
      const subEnd = subStart.clone()
        .addScaledVector(dir, 10 + Math.random() * 15)
        .addScaledVector(perp, (Math.random() - 0.5) * 20);
      spawnLine(makeBolt(subStart, subEnd, 0.6), 0x66aaff, 0.55, 0.25);
    }
  }
}

export function createElectricShock(pos) {
  const parts = [];
  for (let i = 0; i < 8; i++) {
    const mat = (Math.random() > 0.5) ? matCache.shockSparkCyan : matCache.shockSparkYellow;
    const m = new THREE.Mesh(geoCache.shockSpark, mat);
    m.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    m.position.copy(pos); m.position.y += 5.0; scene.add(m);
    parts.push({ mesh: m, vx: (Math.random() - 0.5) * 300, vy: (Math.random() - 0.5) * 300, vz: (Math.random() - 0.5) * 300, isSpark: true });
  }
  explosions.push({ parts: parts, life: 0.4 });
}

export function createSmokePuff(pos) {
  const parts = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(geoCache.smokePuff, matCache.smokePuff);
    m.position.copy(pos); m.position.y += 6.0; scene.add(m);
    parts.push({ mesh: m, vx: (Math.random() - 0.5) * 30, vy: Math.random() * 25 + 10, vz: (Math.random() - 0.5) * 30, isSmoke: true });
  }
  explosions.push({ parts: parts, life: 1.0 });
}

export function createFireExplosion(pos) {
  const parts = [];
  for (let i = 0; i < 14; i++) {
    const mat = (Math.random() > 0.5) ? matCache.fireOrange : matCache.fireYellow;
    const m = new THREE.Mesh(geoCache.fireBall, mat);
    m.position.copy(pos); m.position.y += 4.0; scene.add(m);
    parts.push({ mesh: m, vx: (Math.random() - 0.5) * 260, vy: Math.random() * 180 + 40, vz: (Math.random() - 0.5) * 260, isFire: true });
  }
  explosions.push({ parts: parts, life: 1.2 });
}

export function createNapalmBlast(pos, radius) {
  const parts = [];
  const LIFE = 2.4;

  const fireCircle = new THREE.Mesh(geoCache.napalmCircle, matCache.napalmCircleMat);
  fireCircle.rotation.x = -Math.PI / 2;
  fireCircle.position.set(pos.x, 0.3, pos.z);
  scene.add(fireCircle);
  parts.push({ mesh: fireCircle, isAreaFire: true, opacityMat: matCache.napalmCircleMat, lifeBase: LIFE, _cached: true });

  for (let i = 0; i < 10; i++) {
    const r = Math.sqrt(Math.random()) * radius * 0.95;
    const theta = Math.random() * 2 * Math.PI;
    const mat = (Math.random() > 0.4) ? matCache.napalmFlame2 : matCache.napalmFlame1;
    const m = new THREE.Mesh(geoCache.fireBall, mat);
    m.position.set(pos.x + r * Math.cos(theta), Math.random() * 3 + 1.0, pos.z + r * Math.sin(theta));
    scene.add(m);
    parts.push({ mesh: m, vx: (Math.random() - 0.5) * 9, vy: 12 + Math.random() * 18, vz: (Math.random() - 0.5) * 9, isNapalmFlame: true, _cached: true });
  }

  for (let j = 0; j < 3; j++) {
    const sm = new THREE.Mesh(geoCache.smokePuff, matCache.smokePuff);
    sm.position.set(pos.x + (Math.random() - 0.5) * radius, 2 + Math.random() * 4, pos.z + (Math.random() - 0.5) * radius);
    scene.add(sm);
    parts.push({ mesh: sm, vx: (Math.random() - 0.5) * 8, vy: 18 + Math.random() * 12, vz: (Math.random() - 0.5) * 8, isSmoke: true });
  }

  explosions.push({
    parts, life: LIFE, maxLife: LIFE, _hazardPos: pos.clone(), _hazardRadius: radius, _hazardKilled: false
  });
}

export function createSharedExplosion(pos, blastRange, ranges) {
  playSfx('boom');
  createBarrelBlastRays(pos, blastRange, ranges);
  createSmokePuff(pos.clone());
  createSmokePuff(pos.clone().add(new THREE.Vector3(8, 0, 0)));
  if (_deps.getGameMode && _deps.getGameMode() === 'online-host') netState.netEvents.push({ t: 'exp', x: Math.round(pos.x), z: Math.round(pos.z), r: blastRange });
}

export function createBarrelBlastRays(pos, blastRange, ranges) {
  const parts = [];
  const LIFE = 1.6;

  if (ranges) {
    const DIRS = [
      { dirX: 1, dirZ: 0, maxLen: ranges.px },
      { dirX: -1, dirZ: 0, maxLen: ranges.nx },
      { dirX: 0, dirZ: 1, maxLen: ranges.pz },
      { dirX: 0, dirZ: -1, maxLen: ranges.nz },
    ];
    const LAYERS = [
      { width: 14, col: 0xff0000, yOff: 4.0 },
      { width: 8, col: 0xff6600, yOff: 4.2 },
      { width: 3, col: 0xffee00, yOff: 4.4 },
      { width: 1, col: 0xffffff, yOff: 4.6 },
    ];
    DIRS.forEach(d => {
      if (d.maxLen <= 0) return;
      LAYERS.forEach(l => {
        const mat = new THREE.MeshBasicMaterial({ color: l.col, transparent: true, opacity: 1.0, blending: THREE.AdditiveBlending, depthWrite: false });
        const geo = d.dirX !== 0
          ? new THREE.BoxGeometry(1, 0.5, l.width)
          : new THREE.BoxGeometry(l.width, 0.5, 1);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(pos.x, l.yOff, pos.z);
        scene.add(mesh);
        parts.push({ mesh, isRay: true, isDirRay: true, dirX: d.dirX, dirZ: d.dirZ, baseX: pos.x, baseZ: pos.z, maxLen: d.maxLen, mat, disposeMat: true });
      });
    });
  } else {
    const beamLen = blastRange * 4.5;
    const addBeam = (width, col, yOff) => {
      const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 1.0, blending: THREE.AdditiveBlending, depthWrite: false });
      const mX = new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, width), mat);
      mX.position.set(pos.x, yOff, pos.z); scene.add(mX);
      parts.push({ mesh: mX, isRay: true, isModernRay: true, isX: true, maxLen: beamLen, mat, disposeMat: true });
      const mZ = new THREE.Mesh(new THREE.BoxGeometry(width, 0.5, 1), mat);
      mZ.position.set(pos.x, yOff, pos.z); scene.add(mZ);
      parts.push({ mesh: mZ, isRay: true, isModernRay: true, isX: false, maxLen: beamLen, mat, disposeMat: true });
    };
    addBeam(14, 0xff0000, 4.0);
    addBeam(8, 0xff6600, 4.2);
    addBeam(3, 0xffee00, 4.4);
    addBeam(1.0, 0xffffff, 4.6);
  }

  for (let i = 0; i < 16; i++) {
    const ang = (i / 16) * Math.PI * 2;
    const spd = 200 + Math.random() * 350;
    const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 1.0, blending: THREE.AdditiveBlending, depthWrite: false });
    const spark = new THREE.Mesh(new THREE.SphereGeometry(1.4, 4, 4), sparkMat);
    spark.position.set(pos.x, 5 + Math.random() * 5, pos.z);
    scene.add(spark);
    parts.push({ mesh: spark, vx: Math.cos(ang) * spd, vy: 50 + Math.random() * 120, vz: Math.sin(ang) * spd, isBlastSpark: true, mat: sparkMat, disposeMat: true });
  }

  const maxR = ranges ? Math.max(ranges.px, ranges.nx, ranges.pz, ranges.nz) : blastRange * 4.5;
  explosions.push({
    parts, life: LIFE, maxLife: LIFE,
    _blastPos: pos.clone(), _blastRange: maxR, _blastWidth: 14, _killUntil: LIFE * 0.4, _killed: false,
    _ranges: ranges || null
  });
}

export function createBloodSplatter(pos) {
  const parts = [];
  for (let i = 0; i < 40; i++) {
    const m = new THREE.Mesh(geoCache.bloodDrop, matCache.bloodRed);
    m.position.copy(pos); m.position.y += 6.0; scene.add(m);
    parts.push({ mesh: m, vx: (Math.random() - 0.5) * 350, vy: Math.random() * 200 + 100, vz: (Math.random() - 0.5) * 350, isBlood: true });
  }
  explosions.push({ parts: parts, life: 1.5 });
}

export function createWaterSplash(pos) {
  const parts = [];
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(geoCache.waterDrop, matCache.waterBlue);
    m.position.copy(pos); m.position.y += 4; scene.add(m);
    const ang = Math.random() * Math.PI * 2;
    const spd = 80 + Math.random() * 160;
    parts.push({ mesh: m, vx: Math.cos(ang) * spd, vy: 100 + Math.random() * 120, vz: Math.sin(ang) * spd, isBlood: true });
  }
  explosions.push({ parts, life: 0.9 });
}

export function createGunSmoke(pos) {
  const parts = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(geoCache.smoke, matCache.smokePuff);
    m.position.copy(pos); scene.add(m);
    parts.push({ mesh: m, vx: (Math.random() - 0.5) * 60, vy: Math.random() * 60 + 20, vz: (Math.random() - 0.5) * 60, isSmoke: true });
  }
  explosions.push({ parts: parts, life: 0.6 });
}

export function createFireball() {
  const group = new THREE.Group();
  const prof = [
    new THREE.Vector2(0, 0), new THREE.Vector2(1.25, 0.4), new THREE.Vector2(2.25, 1.75),
    new THREE.Vector2(2.5, 3.0), new THREE.Vector2(2.1, 4.5), new THREE.Vector2(1.4, 5.5),
    new THREE.Vector2(0.6, 6.25), new THREE.Vector2(0, 6.75),
  ];
  const outer = new THREE.Mesh(
    new THREE.LatheGeometry(prof, 12),
    new THREE.MeshStandardMaterial({ color: 0xcc1100, emissive: 0x991100, emissiveIntensity: 2.0, transparent: true, opacity: 0.72, roughness: 1.0, side: THREE.DoubleSide })
  );
  group.add(outer);
  const midProf = prof.map(pt => new THREE.Vector2(pt.x * 0.75, pt.y * 0.88));
  const mid = new THREE.Mesh(
    new THREE.LatheGeometry(midProf, 10),
    new THREE.MeshStandardMaterial({ color: 0xff5500, emissive: 0xff3300, emissiveIntensity: 3.5, transparent: true, opacity: 0.88, roughness: 0.8 })
  );
  mid.rotation.y = Math.random() * Math.PI * 2; group.add(mid);
  const innerProf = prof.map(pt => new THREE.Vector2(pt.x * 0.45, pt.y * 0.75));
  const inner = new THREE.Mesh(
    new THREE.LatheGeometry(innerProf, 8),
    new THREE.MeshStandardMaterial({ color: 0xffee44, emissive: 0xffcc00, emissiveIntensity: 5.0, roughness: 0.3 })
  );
  group.add(inner);
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(1.25, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 8.0, roughness: 0.0 })
  );
  core.position.y = 1.5; group.add(core);
  return group;
}

export function createFireTrail(pos) {
  const fireMats = [matCache.fireTr1, matCache.fireTr2, matCache.fireTr3, matCache.fireTr4];
  const parts = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(geoCache.smoke, fireMats[i % fireMats.length]);
    m.position.copy(pos); scene.add(m);
    parts.push({ mesh: m, vx: (Math.random() - 0.5) * 80, vy: Math.random() * 80 + 30, vz: (Math.random() - 0.5) * 80, isSmoke: false });
  }
  explosions.push({ parts: parts, life: 0.4 });
}

// ── ZOMBIE VISUAL STATE ───────────────────────────────────────────────────────

export function applyShockVisuals(z) {
  const eyes = [];
  [-2.2, 2.2].forEach(ox => {
    const e = new THREE.Mesh(geoCache.shockEye, matCache.shockEyeMat);
    e.position.set(ox, 13.0, 4.5);
    z.group.add(e);
    eyes.push(e);
  });
  z._shockLights = eyes;
  const tongue = new THREE.Mesh(geoCache.shockTongue, matCache.shockTongueMat);
  tongue.position.set(0, 8.0, 3.5);
  tongue.rotation.x = 0.4;
  z.group.add(tongue);
  z._tongue = tongue;
}

export function removeShockVisuals(z) {
  if (z._shockLights) { z._shockLights.forEach(l => z.group.remove(l)); z._shockLights = null; }
  if (z._tongue) { z.group.remove(z._tongue); z._tongue = null; }
  z.group.traverse(c => { if (c.userData.isOutline) c.visible = false; });
  if (z.lArm) z.lArm.rotation.set(0, 0, 0);
  if (z.rArm) z.rArm.rotation.set(0, 0, 0);
  if (z.lLeg) z.lLeg.rotation.set(0, 0, 0);
  if (z.rLeg) z.rLeg.rotation.set(0, 0, 0);
}

export function applyRedGlow(z) {
  if (!z || !z.eyeMeshes) return;
  const redEye = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 3.5 });
  const redMouth = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 2.0 });
  z.eyeMeshes.forEach(m => { m.material = redEye; });
  if (z.mouthMesh) z.mouthMesh.material = redMouth;
}

// ── PLAYER DEATH SCATTER ─────────────────────────────────────────────────────

export function playerDeathScatter(p) {
  playSfx('die');
  if (_deps.isMP && !_deps.isMP()) _deps.onSinglePlayerDeath && _deps.onSinglePlayerDeath();
  vibe([80, 40, 200]);
  createBloodSplatter(p.group.position.clone());
  const wp = new THREE.Vector3();
  const wq = new THREE.Quaternion();
  const deathParts = [];
  const meshRefs = [p._headRef, p._bodyRef, p.lArm, p.rArm, p.lLeg, p.rLeg];

  meshRefs.forEach((mesh, i) => {
    if (!mesh) return;
    mesh.getWorldPosition(wp);
    mesh.getWorldQuaternion(wq);
    const clone = mesh.clone();
    clone.position.copy(wp);
    clone.quaternion.copy(wq);
    clone.scale.setScalar(1.4);
    scene.add(clone);
    const angle = (i / meshRefs.length) * Math.PI * 2 + (Math.random() - 0.5) * 0.8;
    const speed = 18 + Math.random() * 20;
    deathParts.push({
      mesh: clone,
      vx: Math.cos(angle) * speed, vy: 30 + Math.random() * 20, vz: Math.sin(angle) * speed,
      rx: (Math.random() - 0.5) * 8, rz: (Math.random() - 0.5) * 8,
      landed: false, isPlayerPart: true
    });
  });

  explosions.push({ parts: deathParts, life: 4.4 });
  createSmokePuff(p.group.position);
}

// ── FLOATING HEARTS ──────────────────────────────────────────────────────────

export function spawnFloatingHearts(cp) {
  const count = 10;
  for (let i = 0; i < count; i++) {
    const hGroup = new THREE.Group();
    const col = [0xff1493, 0xff69b4, 0xff0066, 0xff4da6][Math.floor(Math.random() * 4)];
    const mat = new THREE.MeshStandardMaterial({
      color: col, emissive: col, emissiveIntensity: 0.6, transparent: true, opacity: 1.0
    });
    const s1 = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 8), mat);
    s1.position.set(-0.8, 0.4, 0); hGroup.add(s1);
    const s2 = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 8), mat.clone());
    s2.position.set(0.8, 0.4, 0); hGroup.add(s2);
    const tri = new THREE.Mesh(new THREE.ConeGeometry(1.4, 2.2, 4), mat.clone());
    tri.rotation.z = Math.PI; tri.rotation.y = Math.PI / 4;
    tri.position.set(0, -0.7, 0); hGroup.add(tri);
    const hLight = new THREE.PointLight(0xff1493, 30, 40);
    hGroup.add(hLight);
    const ox = (Math.random() - 0.5) * 14;
    const oz = (Math.random() - 0.5) * 12;
    hGroup.position.set(cp.x + ox, 14 + Math.random() * 4, cp.z + oz);
    hGroup.scale.setScalar(0.5 + Math.random() * 0.8);
    worldGroup.add(hGroup);
    gameState.floatingHearts.push({
      group: hGroup, mats: [mat, s2.material, tri.material],
      vy: 12 + Math.random() * 8, vx: (Math.random() - 0.5) * 5, vz: (Math.random() - 0.5) * 5,
      rotY: (Math.random() - 0.5) * 3, life: 0, maxLife: 2.0 + Math.random() * 1.5,
    });
  }
}

// ── TICK FUNCTIONS ────────────────────────────────────────────────────────────

export function tickExplosions(dt) {
  if (explosions.length > 100) {
    const toRemove = explosions.splice(0, explosions.length - 100);
    toRemove.forEach(e => { if (e.parts) e.parts.forEach(p => scene.remove(p.mesh)); });
  }

  for (let i = explosions.length - 1; i >= 0; i--) {
    let e = explosions[i];
    if (!e || !e.parts) continue;

    e.life -= dt * (e.parts[0] && e.parts[0].isSpark ? 3.0 : (e.parts[0] && e.parts[0].isRay ? 1.4 : (e.parts[0] && e.parts[0].isAreaFire ? 1.0 : 1.8)));

    if (e._hazardPos && e.life > 0) {
      const HR = e._hazardRadius;
      players.forEach(pl => {
        if (!pl.alive || e._hazardKilled) return;
        if (Math.hypot(pl.x - e._hazardPos.x, pl.z - e._hazardPos.z) < HR) {
          e._hazardKilled = true;
          if (pl.shield) { _deps.breakShield && _deps.breakShield(pl, 'SHIELD MELTED!'); }
          else if (!pl._cannonHit) { pl._cannonHit = true; playerDeathScatter(pl); pl.alive = false; pl.group.visible = false; if (!_deps.mpDeclareWinner || !_deps.mpDeclareWinner(pl)) { if (!gameState.transitioning) { gameState.transitioning = true; setTimeout(() => { setTimeout(() => _deps.startGame && _deps.startGame(gameState.level), 3000); }, 1000); } } }
        }
      });
      gameState.entities.zombies.forEach(z => {
        if (!z.active || z._cannonKilled) return;
        const dzx = z.group.position.x - e._hazardPos.x;
        const dzz = z.group.position.z - e._hazardPos.z;
        const dist = Math.hypot(dzx, dzz);
        if (dist < HR) _deps.cannonballKillZombie && _deps.cannonballKillZombie(z, dist > 0 ? dzx / dist : 0, dist > 0 ? dzz / dist : 1);
      });
    }

    if (e._blastPos && e.life > e._killUntil) {
      const BW = e._blastWidth, BR = e._blastRange, R = e._ranges;
      const calcInRay = (dx, dz) => R
        ? ((dx > 0 && dx < R.px && Math.abs(dz) < BW) || (dx < 0 && -dx < R.nx && Math.abs(dz) < BW) ||
          (dz > 0 && dz < R.pz && Math.abs(dx) < BW) || (dz < 0 && -dz < R.nz && Math.abs(dx) < BW))
        : ((Math.abs(dx) < BW && Math.abs(dz) < BR) || (Math.abs(dz) < BW && Math.abs(dx) < BR));

      players.forEach(pl => {
        if (!pl.alive || pl._rayHit === e) return;
        const dx = pl.x - e._blastPos.x, dz = pl.z - e._blastPos.z;
        if (!calcInRay(dx, dz)) return;
        pl._rayHit = e;
        if (pl.shield) { _deps.breakShield && _deps.breakShield(pl, 'SHIELD BLOCKED!'); }
        else { playerDeathScatter(pl); pl.alive = false; pl.group.visible = false; _deps.triggerGameOver && _deps.triggerGameOver(); }
      });

      gameState.entities.zombies.forEach(z => {
        if (!z.active || z.shocked || z._rayHit === e) return;
        const dx = z.group.position.x - e._blastPos.x, dz = z.group.position.z - e._blastPos.z;
        if (!calcInRay(dx, dz)) return;
        z._rayHit = e;
        z.hp = 0; z.shocked = true; z.shockTimer = 0.5; z.shockTimerMax = 0.5; z.smokeTimer = 0;
        z.group.traverse(c => { if (c.isMesh && !c.userData.isOutline) { const sm = (c.userData.origMat || c.material).clone(); sm.emissive = new THREE.Color(0xff2200); sm.emissiveIntensity = 3.0; c.material = sm; c.userData.shockMat = sm; } });
        applyShockVisuals(z);
        gameState.kills++;
        players[0].score += 25;
        if (_deps.updateHUD) _deps.updateHUD(gameState, players);
      });

      gameState.entities.barrels.forEach(b => {
        if (!b.active || b._rayHit === e) return;
        const dx = b.mesh.position.x - e._blastPos.x, dz = b.mesh.position.z - e._blastPos.z;
        if (Math.hypot(dx, dz) > 10 && calcInRay(dx, dz)) {
          b._rayHit = e;
          b.active = false; b.mesh.visible = false;
          createSharedExplosion(b.mesh.position.clone(), 40);
          _deps.showFloatingText && _deps.showFloatingText(b.mesh.position, 'CHAIN!', '#ff5722');
        }
      });

      const activeBombs = _deps.getActiveBombs ? _deps.getActiveBombs() : [];
      activeBombs.forEach(b => {
        if (b.done || b._rayHit === e) return;
        const dx = b.group.position.x - e._blastPos.x, dz = b.group.position.z - e._blastPos.z;
        if (Math.hypot(dx, dz) > 10 && calcInRay(dx, dz)) {
          b._rayHit = e;
          _deps.bombExplode && _deps.bombExplode(b);
        }
      });
    }

    e.parts.forEach(p => {
      if (p.isPlayerPart) {
        if (!p.landed) {
          p.mesh.position.x += p.vx * dt; p.mesh.position.y += p.vy * dt; p.mesh.position.z += p.vz * dt;
          p.vy -= 400 * dt;
          p.mesh.rotation.x += p.rx * dt; p.mesh.rotation.z += p.rz * dt;
          if (p.mesh.position.y <= 0) { p.mesh.position.y = 0; p.vx = 0; p.vz = 0; p.vy = 0; p.rx = 0; p.rz = 0; p.landed = true; }
        }
        return;
      }
      if (p.isRay) {
        if (p.isDirRay) {
          const prog = 1.0 - Math.max(0, e.life / e.maxLife);
          const stretch = Math.min(1.0, prog / 0.15);
          const len = Math.max(0.001, stretch * p.maxLen);
          const widthScale = 1.0 - Math.max(0, (prog - 0.6) / 0.4);
          if (p.dirX !== 0) { p.mesh.position.set(p.baseX + p.dirX * len / 2, p.mesh.position.y, p.baseZ); p.mesh.scale.set(len, 1, widthScale); }
          else { p.mesh.position.set(p.baseX, p.mesh.position.y, p.baseZ + p.dirZ * len / 2); p.mesh.scale.set(widthScale, 1, len); }
          p.mat.opacity = 1.0 - Math.pow(Math.max(0, (prog - 0.4) / 0.6), 2.0);
        } else if (p.isModernRay) {
          const prog = 1.0 - Math.max(0, e.life / e.maxLife);
          const stretch = Math.min(1.0, prog / 0.15);
          const widthScale = 1.0 - Math.max(0, (prog - 0.6) / 0.4);
          if (p.isX) p.mesh.scale.set(stretch * p.maxLen, 1, widthScale);
          else p.mesh.scale.set(widthScale, 1, stretch * p.maxLen);
          p.mat.opacity = 1.0 - Math.pow(Math.max(0, (prog - 0.4) / 0.6), 2.0);
        } else {
          const s = Math.max(0.01, e.life * 0.44);
          p.mesh.scale.set(s, 1, s);
        }
        return;
      }
      if (p.isCore) {
        if (p.isModernCore) {
          const prog = 1.0 - Math.max(0, e.life / e.maxLife);
          p.mesh.scale.setScalar(1.0 + prog * 2.0);
          p.mat.opacity = 1.0 - Math.pow(Math.max(0, (prog - 0.4) / 0.6), 2.0);
        } else {
          p.mesh.scale.setScalar(Math.max(0.01, e.life * 0.44));
        }
        return;
      }
      if (p.isBlastSpark) {
        p.mesh.position.x += p.vx * dt; p.mesh.position.y += p.vy * dt; p.mesh.position.z += p.vz * dt;
        p.vy -= 380 * dt;
        if (p.mat && e.maxLife) p.mat.opacity = Math.max(0, e.life / e.maxLife);
        p.mesh.scale.setScalar(Math.max(0.01, e.life * 0.8));
        return;
      }
      p.mesh.position.x += p.vx * dt; p.mesh.position.y += p.vy * dt; p.mesh.position.z += p.vz * dt;
      if (p.isBlood) p.vy -= 400 * dt;
      if (p.isAreaFire) { const fade = Math.max(0, e.life / p.lifeBase); p.opacityMat.opacity = fade * 0.85; return; }
      if (p.isLight) { p.lightObj.intensity = Math.max(0, (e.life / p.lifeBase) * 450); return; }
      const sObj = Math.max(0.01, e.life * (p.isNapalmFlame ? 1.5 : (p.isSpark ? 1.0 : (p.isSmoke ? 1.2 : (p.isFire ? 4.5 : (p.isBlood ? 1.5 : 1.5))))));
      if (p.isNapalmFlame) { p.mesh.scale.set(sObj * 0.7, sObj * 1.5, sObj * 0.7); p.mesh.rotation.y += Math.random() * 0.15; }
      else p.mesh.scale.setScalar(sObj);
      if (p.isSpark) { p.mesh.rotation.x += Math.random() * 2; p.mesh.rotation.y += Math.random() * 2; }
    });

    if (e.life <= 0) {
      e.parts.forEach(p => {
        if (p.isLight) scene.remove(p.lightObj);
        else scene.remove(p.mesh);
        if (p._cached) return;
        if (p.isAreaFire && p.opacityMat) p.opacityMat.dispose();
        if (p.mesh && p.mesh.geometry && (p.isRay || p.isCore || p.isBlastSpark || p.isAreaFire)) p.mesh.geometry.dispose();
        if (p.disposeMat && p.mesh && p.mesh.material) p.mesh.material.dispose();
        if (p.isBlastSpark) p.mesh.material.dispose();
        if (p.isPlayerPart) p.mesh.traverse(c => { if (c.isMesh && c.material) c.material.dispose(); });
      });
      explosions.splice(i, 1);
    }
  }
}

export function tickPlayerWalkAnim(p, isMoving, dt) {
  if (!p.alive || !p.group || !p.lLeg) return;
  if (isMoving) {
    p.walkCycle = (p.walkCycle || 0) + dt * 10;
    p.lLeg.rotation.x = Math.sin(p.walkCycle) * 1.2;
    p.rLeg.rotation.x = -Math.sin(p.walkCycle) * 1.2;
    p.lArm.rotation.x = -Math.sin(p.walkCycle) * 1.2;
    p.rArm.rotation.x = Math.sin(p.walkCycle) * 1.2;
    p.group.position.y = Math.abs(Math.cos(p.walkCycle)) * 0.8;
  } else {
    p.lLeg.rotation.x = 0; p.rLeg.rotation.x = 0;
    p.lArm.rotation.x = 0; p.rArm.rotation.x = 0;
    p.group.position.y = 0;
  }
}

export function tickZombieWalkAnim(z, movedDist, dt) {
  if (!z.lLeg || !z.lArm) return;
  z._walkCycle = (z._walkCycle || 0) + movedDist * 0.55;
  const wc = z._walkCycle;
  const _legAnim = (phase) => {
    const s = Math.sin(phase);
    const hipAngle = s * 0.72;
    const swingT = Math.max(0, s);
    const kneeAngle = swingT * swingT * 1.1;
    const tibiaComp = -swingT * 0.55;
    return { hipAngle, kneeAngle, tibiaComp };
  };
  const lAnim = _legAnim(wc);
  const rAnim = _legAnim(wc + Math.PI);
  z.lLeg.rotation.x = lAnim.hipAngle;
  z.rLeg.rotation.x = rAnim.hipAngle;
  const lKnee = z.lLeg.children[3];
  const rKnee = z.rLeg.children[3];
  if (lKnee) lKnee.rotation.x = lAnim.kneeAngle + lAnim.tibiaComp;
  if (rKnee) rKnee.rotation.x = rAnim.kneeAngle + rAnim.tibiaComp;
  const ARM_SWING = 0.50;
  z.lArm.rotation.x = -Math.PI / 2 + Math.sin(wc) * ARM_SWING;
  z.rArm.rotation.x = -Math.PI / 2 - Math.sin(wc) * ARM_SWING;
  const lFore = z.lArm.children[2];
  const rFore = z.rArm.children[2];
  if (lFore) lFore.rotation.x = 0.65 + Math.sin(wc) * 0.22;
  if (rFore) rFore.rotation.x = 0.65 - Math.sin(wc) * 0.22;
  z.group.position.y = Math.max(0, Math.cos(wc * 2)) * 0.9;
}

export function tickZombieJawAnim(z) {
  if (!z.jawGrp) return;
  const biteDist = z.type === 1 ? 14.0 : 10.0;
  let closestDist = Infinity;
  players.forEach(p => { if (p.alive) { const d = Math.hypot(p.x - z.group.position.x, p.z - z.group.position.z); if (d < closestDist) closestDist = d; } });
  const biteT = Math.max(0, 1 - closestDist / biteDist);
  z.jawGrp.rotation.x = biteT * 1.3;
  z.jawGrp.position.z = 1.5 + biteT * 3.5;
  z.jawGrp.scale.setScalar(1 + biteT * 0.6);
}

let _girlAnimTime = 0;
export function tickCagedGirlAnim(cagedGirl, dt) {
  if (!cagedGirl || gameState.fuseDead) return;
  _girlAnimTime += dt;
  cagedGirl.head.rotation.y = Math.sin(_girlAnimTime * 0.55) * 0.28;
  cagedGirl.head.rotation.z = Math.sin(_girlAnimTime * 0.8) * 0.05;
  cagedGirl.lArm.rotation.z = Math.sin(_girlAnimTime * 1.3) * 0.25 + 0.15;
  cagedGirl.rArm.rotation.z = -Math.sin(_girlAnimTime * 1.3) * 0.25 - 0.15;
  cagedGirl.girl.position.y = Math.sin(_girlAnimTime * 1.1) * 0.4;
}

export function tickPlayerSink(p, dt) {
  if (!p.sinking) return;
  p.sinkTimer -= dt;
  const prog = 1.0 - Math.max(0, p.sinkTimer / p.sinkMax);
  const flatProg = Math.min(1, prog / 0.20);
  p.group.rotation.x = flatProg * Math.PI / 2;
  if (p.lArm) p.lArm.rotation.z = -flatProg * Math.PI / 2;
  if (p.rArm) p.rArm.rotation.z = flatProg * Math.PI / 2;
  p.group.scale.setScalar(1.75);
  if (p.sinkTimer <= 0) {
    p.sinking = false; p.group.visible = false;
    p.group.rotation.set(0, 0, 0); p.group.scale.setScalar(1.75);
    if (p.lArm) p.lArm.rotation.z = 0;
    if (p.rArm) p.rArm.rotation.z = 0;
  }
}

export function tickDoorOpen(cagedGirl, dt) {
  if (!gameState.doorOpening || !cagedGirl) return;
  gameState.doorProgress = Math.min(1, gameState.doorProgress + dt * 2.2);
  const ease = gameState.doorProgress * gameState.doorProgress;
  cagedGirl.frontDoorBars.forEach(b => { b.position.y = 12 - ease * 40; });
  if (gameState.doorProgress >= 1) {
    gameState.doorOpening = false;
    cagedGirl.frontDoorBars.forEach(b => { b.visible = false; });
  }
}

export function tickFloatingHearts(dt) {
  if (!gameState.floatingHearts || gameState.floatingHearts.length === 0) return;
  gameState.floatingHearts = gameState.floatingHearts.filter(h => {
    h.life += dt;
    if (h.life >= h.maxLife) { worldGroup.remove(h.group); return false; }
    h.group.position.y += h.vy * dt;
    h.group.position.x += h.vx * dt + Math.sin(h.life * 4 + h.rotY) * 0.08;
    h.group.position.z += h.vz * dt;
    h.group.rotation.y += h.rotY * dt;
    h.vy = Math.max(2, h.vy - 6 * dt);
    const fade = Math.min(1, (1 - h.life / h.maxLife) / 0.4);
    h.mats.forEach(m => { m.opacity = Math.max(0, fade); });
    return true;
  });
}
