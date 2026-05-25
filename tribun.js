import * as THREE from 'three';
import { ARENA_LIMIT, ARENA_LIMIT_X } from './config.js';
import { worldGroup } from './scene.js';
import { gameState } from './state.js';

const SCOLS = [0xef5350, 0x42a5f5, 0xffca28, 0x66bb6a, 0xab47bc, 0xff7043, 0x26c6da, 0xfafafa, 0xff80ab, 0x80cbc4];

const mkSpec = (x, y, z, skinMat) => {
  const col = SCOLS[Math.floor(Math.random() * SCOLS.length)];
  const bMat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.8 });
  const grp = new THREE.Group();

  const body = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 3.0, 9, 8), bMat);
  body.position.y = 4.5;
  grp.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(3.6, 8, 6), skinMat.clone());
  head.position.y = 13;
  grp.add(head);

  const aL = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 6, 6), bMat.clone());
  aL.position.set(-4, 10, 0);
  aL.rotation.z = -1.1;
  grp.add(aL);

  const aR = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 6, 6), bMat.clone());
  aR.position.set(4, 10, 0);
  aR.rotation.z = 1.1;
  grp.add(aR);

  grp.position.set(x, y, z);
  worldGroup.add(grp);

  gameState.bleacherSpectators.push({
    grp, baseY: y, aL, aR,
    phase: Math.random() * Math.PI * 2,
    speed: 1.2 + Math.random() * 1.8,
    amp:   1.2 + Math.random() * 2.0,
  });
};

const mkStrip = (cx, cy, cz, w, h, d, specAxis, specLen, concMat, edgeMat, skinMat) => {
  const slab = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), concMat);
  slab.position.set(cx, cy, cz);
  slab.receiveShadow = true;
  worldGroup.add(slab);

  const ew = specAxis === 'z' ? 1.5 : w;
  const ed = specAxis === 'x' ? 1.5 : d;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(ew, 2, ed), edgeMat);
  cap.position.set(cx, cy + h / 2 + 1, cz);
  worldGroup.add(cap);

  const n = Math.floor(specLen / 19);
  for (let i = 0; i < n; i++) {
    if (Math.random() > 0.90) continue;
    const t = ((i + 0.5) / n - 0.5) * specLen * 0.96;
    mkSpec(
      specAxis === 'x' ? cx + t : cx,
      cy + h / 2,
      specAxis === 'z' ? cz + t : cz,
      skinMat
    );
  }
};

export function buildBleachers(fenceT) {
  const ROWS = 5, RD = 18, RH = 12;
  const AX = ARENA_LIMIT_X;
  const AZ = ARENA_LIMIT;

  const concMat = new THREE.MeshStandardMaterial({ color: 0xb0b0a8, roughness: 0.9 });
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0x787870, roughness: 0.9 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xffccaa, roughness: 0.6 });

  gameState.bleacherSpectators = [];

  for (let r = 0; r < ROWS; r++) {
    const off = fenceT / 2 + r * RD + RD / 2;
    const h = (r + 1) * RH;
    const sideLen = AZ * 2 + fenceT;
    const backLen = AX * 2 + fenceT;

    mkStrip(-(AX + off), h / 2, 0,       RD, h, sideLen, 'z', sideLen, concMat, edgeMat, skinMat); // left
    mkStrip( (AX + off), h / 2, 0,       RD, h, sideLen, 'z', sideLen, concMat, edgeMat, skinMat); // right
    mkStrip(0, h / 2, -(AZ + off), backLen, h, RD, 'x', backLen, concMat, edgeMat, skinMat);        // back
    mkStrip(0, h / 2,  (AZ + off), backLen, h, RD, 'x', backLen, concMat, edgeMat, skinMat);        // front

    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const corner = new THREE.Mesh(new THREE.BoxGeometry(RD, h, RD), concMat);
      corner.position.set(sx * (AX + off), h / 2, sz * (AZ + off));
      worldGroup.add(corner);
    }
  }
}

export function tickBleacherSpectators(time) {
  if (!gameState.bleacherSpectators) return;
  gameState.bleacherSpectators.forEach(s => {
    s.grp.position.y = s.baseY + Math.sin(time * s.speed + s.phase) * s.amp;
    s.aL.rotation.z = -1.1 + Math.sin(time * s.speed + s.phase + 0.5) * 0.4;
    s.aR.rotation.z =  1.1 - Math.sin(time * s.speed + s.phase + 0.5) * 0.4;
  });
}
