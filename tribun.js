import * as THREE from 'three';
import { ARENA_LIMIT, ARENA_LIMIT_X } from './config.js';
import { worldGroup } from './scene.js';
import { gameState } from './state.js';

const TOGA_C = [
  0xf5f0e8, 0xece5d5, 0xe0d8c4,
  0xc0392b, 0x922b21, 0x7b241c,
  0x6c3483, 0x5b2c6f,
  0xd4ac0d, 0xb7950b,
  0x1a5276, 0x556b2f, 0x8b4513,
];
const SKIN_C = [0xffdbac, 0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524];
const HAIR_C = [0x1a1209, 0x0a0a0a, 0x3b2716, 0x7a5c1e, 0x2f1a0e];

let G, M, togaM, skinM, hairM;

function initRes() {
  if (G) return;

  // Geometriler — orijinal boyut, grp.scale ile 10x büyütülüyor
  G = {
    body:     new THREE.CylinderGeometry(1.5, 2.3, 6, 6),
    head:     new THREE.SphereGeometry(1.8, 8, 6),
    hair:     new THREE.SphereGeometry(1.95, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.55),
    arm:      new THREE.CapsuleGeometry(0.5, 3.2, 4, 5),
    drape:    new THREE.BoxGeometry(0.5, 5, 2),
    // Sütun, meşale, bayrak geometrileri 10x — paylaşımlı, değişmez
    colBase:  new THREE.CylinderGeometry(18, 20, 12, 8),
    capital:  new THREE.BoxGeometry(38, 18, 38),
    brazBowl: new THREE.SphereGeometry(20, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.5),
    flame:    new THREE.ConeGeometry(13, 40, 6),
    flameIn:  new THREE.ConeGeometry(7, 28, 5),
    banner:   new THREE.PlaneGeometry(60, 160),
    shield:   new THREE.CircleGeometry(25, 8),
  };

  M = {
    sand:    new THREE.MeshStandardMaterial({ color: 0xd4c4a0, roughness: 0.85 }),
    sandDk:  new THREE.MeshStandardMaterial({ color: 0xa89070, roughness: 0.9 }),
    sandLt:  new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.7 }),
    marble:  new THREE.MeshStandardMaterial({ color: 0xf0ead6, roughness: 0.3, metalness: 0.08 }),
    marbDk:  new THREE.MeshStandardMaterial({ color: 0xc8b898, roughness: 0.5 }),
    void:    new THREE.MeshStandardMaterial({ color: 0x15120d }),
    gold:    new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.3, metalness: 0.8 }),
    bronze:  new THREE.MeshStandardMaterial({ color: 0xcd7f32, roughness: 0.4, metalness: 0.7 }),
    iron:    new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.5, metalness: 0.7 }),
    red:     new THREE.MeshStandardMaterial({ color: 0x8b1a1a, roughness: 0.7, side: THREE.DoubleSide }),
    flame:   new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.85 }),
    flameIn: new THREE.MeshBasicMaterial({ color: 0xffdd33, transparent: true, opacity: 0.9 }),
  };

  togaM = TOGA_C.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 }));
  skinM = SKIN_C.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }));
  hairM = HAIR_C.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));
}

// ── Seyirci — grp.scale 10x ile büyütülüyor ──────────────────────────
const mkSpec = (x, y, z) => {
  const grp = new THREE.Group();

  const tM = togaM[~~(Math.random() * togaM.length)];
  const sM = skinM[~~(Math.random() * skinM.length)];
  const hM = hairM[~~(Math.random() * hairM.length)];

  const body = new THREE.Mesh(G.body, tM);
  body.position.y = 3;
  body.castShadow = true;
  grp.add(body);

  const drape = new THREE.Mesh(G.drape, tM);
  drape.position.set(-1.5, 3.5, 0);
  drape.rotation.z = 0.12;
  grp.add(drape);

  const head = new THREE.Mesh(G.head, sM);
  head.position.y = 8.2;
  head.castShadow = true;
  grp.add(head);

  const hair = new THREE.Mesh(G.hair, hM);
  hair.position.y = 8.5;
  grp.add(hair);

  const aL = new THREE.Group();
  aL.position.set(-2.6, 6.2, 0);
  const aLm = new THREE.Mesh(G.arm, sM);
  aLm.position.y = -1.6;
  aL.add(aLm);
  aL.rotation.z = -0.75;
  grp.add(aL);

  const aR = new THREE.Group();
  aR.position.set(2.6, 6.2, 0);
  const aRm = new THREE.Mesh(G.arm, sM);
  aRm.position.y = -1.6;
  aR.add(aRm);
  aR.rotation.z = 0.75;
  grp.add(aR);

  // 10x büyütme — geometri orijinal, scale ile büyütülüyor
  grp.scale.setScalar(8.0 + Math.random() * 3.5);
  grp.position.set(x, y, z);
  grp.rotation.y = Math.atan2(x, z) + (Math.random() - 0.5) * 0.3;

  worldGroup.add(grp);

  gameState.bleacherSpectators.push({
    grp, head, aL, aR,
    baseY: y,
    phase: Math.random() * Math.PI * 2,
    speed: 0.8 + Math.random() * 2.0,
    amp:   5 + Math.random() * 10,   // 10x ile orantılı
    wx: x, wz: z,
    cheerCd:  3 + Math.random() * 10,
    cheerT:   Math.random() * 10,
    isCheer:  false,
    cheerDur: 0,
  });
};

// ── Meşale — 10x geometri ─────────────────────────────────────────────
const mkBrazier = (x, y, z, withLight) => {
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(5, 7, y, 6), M.iron);
  pole.position.set(x, y / 2, z);
  worldGroup.add(pole);

  const bowl = new THREE.Mesh(G.brazBowl, M.bronze);
  bowl.position.set(x, y + 5, z);
  bowl.rotation.x = Math.PI;
  worldGroup.add(bowl);

  const f1 = new THREE.Mesh(G.flame, M.flame.clone());
  f1.position.set(x, y + 30, z);
  worldGroup.add(f1);

  const f2 = new THREE.Mesh(G.flameIn, M.flameIn.clone());
  f2.position.set(x, y + 28, z);
  worldGroup.add(f2);

  let light = null;
  if (withLight) {
    light = new THREE.PointLight(0xff6622, 1.5, 60, 1.5);
    light.position.set(x, y + 50, z);
    worldGroup.add(light);
  }

  gameState.braziers.push({ f1, f2, light, baseY: y + 30, phase: Math.random() * 10 });
};

// ── Sütun — 10x shaft yarıçapı, COL_H ile orantılı yükseklik ─────────
const mkColumn = (x, y, z, h) => {
  const base = new THREE.Mesh(G.colBase, M.marble);
  base.position.set(x, y + 6, z);
  worldGroup.add(base);

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(13, 15, h - 3, 8), M.marble);
  shaft.position.set(x, y + h / 2, z);
  shaft.castShadow = true;
  worldGroup.add(shaft);

  const cap = new THREE.Mesh(G.capital, M.marble);
  cap.position.set(x, y + h - 9, z);
  worldGroup.add(cap);
};

// ── Bayrak — 10x geometri ─────────────────────────────────────────────
const mkBanner = (x, y, z, rotY) => {
  const b = new THREE.Mesh(G.banner, M.red);
  b.position.set(x, y, z);
  b.rotation.y = rotY;
  worldGroup.add(b);

  const s = new THREE.Mesh(G.shield, M.gold);
  s.position.set(x, y + 2, z);
  s.rotation.y = rotY;
  s.translateZ(5);
  worldGroup.add(s);

  gameState.banners.push({ mesh: b, baseRot: rotY, phase: Math.random() * 10 });
};

// ── Tribün şeridi ─────────────────────────────────────────────────────
const mkStrip = (cx, cy, cz, w, h, d, specAxis, specLen, rowIdx, faceSign) => {
  const blockMat = rowIdx < 2 ? M.sandLt : (rowIdx < 4 ? M.sand : M.sandDk);

  const slab = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), blockMat);
  slab.position.set(cx, cy, cz);
  slab.receiveShadow = true;
  slab.castShadow = true;
  worldGroup.add(slab);

  const corn = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 1.5, d + 1), M.marble);
  corn.position.set(cx, cy + h / 2 + 0.75, cz);
  worldGroup.add(corn);

  if (rowIdx === 0) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 2, d + 0.5), M.marbDk);
    base.position.set(cx, 1, cz);
    worldGroup.add(base);
  }

  if (h > 10) {
    const archSpacing = 30;
    const nArch = Math.max(0, Math.floor(specLen / archSpacing));
    for (let i = 0; i < nArch; i++) {
      const t = ((i + 0.5) / nArch - 0.5) * specLen * 0.88;
      const archH = Math.min(h * 0.5, 20);
      const archW = archSpacing * 0.4;

      let ax, az, aw, ad;
      if (specAxis === 'z') {
        ax = cx + faceSign * (w / 2 - 1);
        az = cz + t;
        aw = 3; ad = archW;
      } else {
        ax = cx + t;
        az = cz + faceSign * (d / 2 - 1);
        aw = archW; ad = 3;
      }

      const v = new THREE.Mesh(new THREE.BoxGeometry(aw, archH, ad), M.void);
      v.position.set(ax, cy - (h - archH) * 0.25, az);
      worldGroup.add(v);
    }
  }

  for (let s = 0; s < 2; s++) {
    const rw = specAxis === 'z' ? w * 0.85 : specLen * 0.92;
    const rd = specAxis === 'z' ? specLen * 0.92 : d * 0.85;
    const row = new THREE.Mesh(new THREE.BoxGeometry(rw, 0.5, rd), M.marbDk);
    row.position.set(cx, cy + h / 2 + 0.5 + s * 3.5, cz);
    worldGroup.add(row);
  }

  // Seyirciler her 16 birimde bir
  const n = Math.floor(specLen / 16);
  for (let i = 0; i < n; i++) {
    if (Math.random() > 0.92) continue;
    const t = ((i + 0.5) / n - 0.5) * specLen * 0.94;
    mkSpec(
      specAxis === 'x' ? cx + t : cx,
      cy + h / 2 + 1,
      specAxis === 'z' ? cz + t : cz
    );
  }
};

export function buildBleachers(fenceT) {
  initRes();

  const ROWS = 5, RD = 18, RH = 12;
  const AX = ARENA_LIMIT_X;
  const AZ = ARENA_LIMIT;
  const POD_H = 6, POD_T = 4;

  gameState.bleacherSpectators = [];
  gameState.braziers = [];
  gameState.banners = [];

  // Podium duvarı
  for (const s of [-1, 1]) {
    const pw1 = new THREE.Mesh(new THREE.BoxGeometry(POD_T, POD_H, AZ * 2 + fenceT), M.sandLt);
    pw1.position.set(s * (AX + fenceT / 2 + POD_T / 2), POD_H / 2, 0);
    pw1.castShadow = true;
    worldGroup.add(pw1);

    const pw2 = new THREE.Mesh(new THREE.BoxGeometry(AX * 2 + fenceT, POD_H, POD_T), M.sandLt);
    pw2.position.set(0, POD_H / 2, s * (AZ + fenceT / 2 + POD_T / 2));
    pw2.castShadow = true;
    worldGroup.add(pw2);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const pc = new THREE.Mesh(new THREE.BoxGeometry(POD_T, POD_H, POD_T), M.sandLt);
    pc.position.set(sx * (AX + fenceT / 2 + POD_T / 2), POD_H / 2, sz * (AZ + fenceT / 2 + POD_T / 2));
    worldGroup.add(pc);
  }

  // 5 kademe tribün — köşeler yan şeritlerle kapatılıyor, ayrı köşe bloğu yok
  for (let r = 0; r < ROWS; r++) {
    const off = fenceT / 2 + POD_T + r * RD + RD / 2;
    const h = (r + 1) * RH + POD_H;

    // Yan şeritler (sol/sağ): köşe alanını da kapsayacak şekilde uzatıldı
    const sideLen = 2 * (AZ + off + RD / 2);

    // Ön/arka şeritler: yan şeridin iç kenarında biter — örtüşme yok
    const backLen = 2 * (AX + off - RD / 2);

    mkStrip(-(AX + off), h / 2, 0,       RD, h, sideLen, 'z', sideLen, r,  1); // sol
    mkStrip( (AX + off), h / 2, 0,       RD, h, sideLen, 'z', sideLen, r, -1); // sağ
    mkStrip(0, h / 2, -(AZ + off), backLen, h, RD, 'x', backLen, r,  1);        // arka
    mkStrip(0, h / 2,  (AZ + off), backLen, h, RD, 'x', backLen, r, -1);        // ön

    // En üst katman: sütunlar, meşaleler, bayraklar
    if (r === ROWS - 1) {
      const COL_H = 60, topY = h, COL_SP = 60;

      for (const sx of [-1, 1]) {
        const nC = Math.floor(sideLen / COL_SP);
        for (let i = 0; i < nC; i++) {
          const cz = ((i + 0.5) / nC - 0.5) * sideLen * 0.9;
          mkColumn(sx * (AX + off), topY, cz, COL_H);
          if (i % 2 === 0) mkBanner(sx * (AX + off), topY + COL_H * 0.6, cz, Math.PI / 2);
        }
      }

      for (const sz of [-1, 1]) {
        const nC = Math.floor(backLen / COL_SP);
        for (let i = 0; i < nC; i++) {
          const cx = ((i + 0.5) / nC - 0.5) * backLen * 0.9;
          mkColumn(cx, topY, sz * (AZ + off), COL_H);
          if (i % 2 === 0) mkBanner(cx, topY + COL_H * 0.6, sz * (AZ + off), 0);
        }
      }

      // Köşe meşaleleri — ışıksız
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        mkBrazier(sx * (AX + off), topY, sz * (AZ + off), false);
      }
    }
  }

  // İmparator Locası (Pulvinar)
  const empW = 40, empH = 30;
  const empOff = fenceT / 2 + POD_T + RD / 2;

  const empBox = new THREE.Mesh(new THREE.BoxGeometry(empW, empH, RD + 2), M.marble);
  empBox.position.set(0, empH / 2, AZ + empOff);
  worldGroup.add(empBox);

  const empCorn = new THREE.Mesh(new THREE.BoxGeometry(empW + 4, 2, RD + 6), M.gold);
  empCorn.position.set(0, empH + 1, AZ + empOff);
  worldGroup.add(empCorn);

  const empBase = new THREE.Mesh(new THREE.BoxGeometry(empW + 2, 1.5, RD + 4), M.gold);
  empBase.position.set(0, 0.75, AZ + empOff);
  worldGroup.add(empBase);

  for (const sx of [-1, 0, 1]) {
    mkColumn(sx * (empW / 3), empH, AZ + empOff - RD / 2, 40);
  }

  mkBrazier(-empW / 2 - 3, empH, AZ + empOff, true);
  mkBrazier( empW / 2 + 3, empH, AZ + empOff, true);

  mkBanner(0, empH + 30, AZ + empOff - RD / 2, 0);

  const canopy = new THREE.Mesh(new THREE.BoxGeometry(empW + 8, 0.8, RD + 10), M.red);
  canopy.position.set(0, empH + 22, AZ + empOff);
  worldGroup.add(canopy);
}

export function tickBleacherSpectators(time, dt) {

  if (gameState.bleacherSpectators) {
    const waveAngle = time * 0.5;

    gameState.bleacherSpectators.forEach(s => {
      const t = time * s.speed + s.phase;

      // Meksika dalgası
      const sa = Math.atan2(s.wz, s.wx);
      let ad = sa - waveAngle;
      ad = ((ad % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
      const wave = Math.max(0, 1 - Math.abs(ad) * 1.8);

      // Bireysel tezahürat
      s.cheerT += dt;
      if (!s.isCheer && s.cheerT > s.cheerCd) {
        s.isCheer = true;
        s.cheerDur = 1 + Math.random() * 2;
        s.cheerT = 0;
        s.cheerCd = 3 + Math.random() * 10;
      }
      if (s.isCheer) {
        s.cheerDur -= dt;
        if (s.cheerDur <= 0) s.isCheer = false;
      }

      const ex = Math.min(1, wave + (s.isCheer ? 0.8 : 0));

      s.grp.position.y = s.baseY
        + Math.sin(t) * s.amp * 0.3
        + ex * 30;   // 10x ile orantılı zıplama

      s.aL.rotation.z = -0.75
        + Math.sin(t * 0.5) * 0.05
        + ex * (2.2 + Math.sin(t * 3) * 0.3);

      s.aR.rotation.z = 0.75
        - Math.sin(t * 0.5 + 1) * 0.05
        - ex * (2.2 + Math.sin(t * 3 + 0.5) * 0.3);

      s.head.rotation.y = Math.sin(t * 0.7) * 0.15 + ex * Math.sin(t * 3) * 0.2;
      s.head.rotation.x = -ex * 0.15;
    });
  }

  if (gameState.braziers) {
    gameState.braziers.forEach(b => {
      const fl = Math.sin(time * 8  + b.phase) * 0.30
               + Math.sin(time * 13 + b.phase * 2) * 0.15
               + Math.sin(time * 21 + b.phase * 3) * 0.10;

      const sy  = 1 + fl * 0.4;
      const sxz = 1 + fl * 0.15;

      b.f1.scale.set(sxz, sy, sxz);
      b.f1.position.y = b.baseY + fl * 5;
      b.f1.rotation.z = Math.sin(time * 5 + b.phase) * 0.15;

      b.f2.scale.set(sxz * 0.9, sy * 1.1, sxz * 0.9);
      b.f2.position.y = b.baseY - 2 + fl * 3;

      if (b.light) b.light.intensity = 1.5 + fl;

      const hue = 0.06 + fl * 0.02;
      b.f1.material.color.setHSL(hue, 1, 0.5);
      b.f2.material.color.setHSL(hue + 0.05, 1, 0.6);
    });
  }

  if (gameState.banners) {
    gameState.banners.forEach(bn => {
      bn.mesh.rotation.y = bn.baseRot
        + Math.sin(time * 1.2 + bn.phase) * 0.08
        + Math.sin(time * 2.5 + bn.phase * 1.5) * 0.04;
      bn.mesh.rotation.x = Math.sin(time * 0.8 + bn.phase) * 0.03;
    });
  }
}
