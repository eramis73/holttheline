import * as THREE from 'three';
import { gameConfig, BIOMES, ARENA_LIMIT_X, ARENA_LIMIT } from './config.js';

export const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      const gameWrap = document.getElementById('game-wrap');
      gameWrap.appendChild(renderer.domElement);

      export const scene = new THREE.Scene();

      export const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 4000);

export function updateCamera() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        renderer.setSize(w, h);
        const aspect = w / h;
        const halfW = ARENA_LIMIT_X + 16;
        const halfH = halfW / aspect;
        const shiftX = 0;
        const shiftY = 10;
        camera.left   = -halfW + shiftX;
        camera.right  =  halfW + shiftX;
        camera.top    =  halfH + shiftY;
        camera.bottom = -halfH + shiftY;
        camera.updateProjectionMatrix();
        camera.up.set(0, 0, -1);
        camera.position.set(0, 300, 252);
        camera.lookAt(0, 0, 0);
      }
      updateCamera();
      window.addEventListener('resize', updateCamera);
      if (window.visualViewport) window.visualViewport.addEventListener('resize', updateCamera);

      export const floatContainer = document.getElementById('float-container');

      const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
      scene.add(ambientLight);

      const sun = new THREE.DirectionalLight(0xfffae6, 2.0);
      sun.position.set(-150, 400, 100);
      sun.castShadow = true;
      sun.shadow.mapSize.width = 2048; sun.shadow.mapSize.height = 2048;
      sun.shadow.camera.near = 10; sun.shadow.camera.far = 1200;
      const sd = 420;
      sun.shadow.camera.left = -sd; sun.shadow.camera.right = sd;
      sun.shadow.camera.top = sd; sun.shadow.camera.bottom = -sd;
      sun.shadow.bias = -0.0005;
      scene.add(sun);

      export const geoCache = {
        tree: new THREE.IcosahedronGeometry(20, 2),
        trunk: new THREE.CylinderGeometry(4.5, 5, 20, 16),
        head: new THREE.SphereGeometry(4.0, 32, 32),
        body: new THREE.CapsuleGeometry(3.8, 5.0, 16, 16),
        arm: new THREE.CapsuleGeometry(1.4, 5.0, 16, 16),
        leg: new THREE.CapsuleGeometry(1.6, 5.5, 16, 16),
        hair: new THREE.SphereGeometry(4.2, 32, 32, 0, Math.PI * 2, 0, Math.PI / 2),
        eye: new THREE.SphereGeometry(0.8, 16, 16),
        wireMarker: new THREE.TorusGeometry(2.5, 1.2, 16, 32),
        dTop: new THREE.CylinderGeometry(3.6, 5.0, 2.0, 6),
        dBot: new THREE.ConeGeometry(5.0, 6.0, 6),
        smoke: new THREE.SphereGeometry(2.0, 8, 8),
        smokePuff: new THREE.SphereGeometry(3.5, 8, 8),
        barrel: new THREE.CylinderGeometry(4.0, 4.0, 10, 12),
        box: new THREE.BoxGeometry(6, 6, 6),
        turretBase: new THREE.CylinderGeometry(8, 10, 10, 16),
        turretChair: new THREE.BoxGeometry(6, 6, 6),
        turretBarrel: new THREE.CylinderGeometry(1.5, 1.5, 20, 8),
        bulletGeo: new THREE.CylinderGeometry(0.3, 0.3, 10, 6),
        bloodDrop: new THREE.SphereGeometry(1.0, 8, 8),
        shockSpark: new THREE.CylinderGeometry(0.5, 0.5, 12, 4),
        shockEye: new THREE.SphereGeometry(1.0, 6, 6),
        shockTongue: new THREE.BoxGeometry(0.8, 0.3, 2.2),
        fireBall: new THREE.SphereGeometry(5.0, 6, 6),
        waterDrop: new THREE.SphereGeometry(2.0, 5, 5),
        // Cannon geometries — create once, share always
        cannonStock: new THREE.BoxGeometry(4, 3.5, 28),
        cannonScope: new THREE.CylinderGeometry(1.0, 1.0, 12, 8),
        cannonGrip: new THREE.BoxGeometry(2.5, 6, 3),
        cannonLimb: new THREE.CylinderGeometry(2.2, 1.4, 30, 8),
        cannonCap: new THREE.SphereGeometry(1.4, 6, 6),
        cannonHoleGeo: new THREE.CircleGeometry(6, 12),
        cannonShaft: new THREE.CylinderGeometry(1.2, 1.2, 44, 6),
        cannonTip: new THREE.ConeGeometry(2.8, 10, 6),
        cannonFin: new THREE.BoxGeometry(0.6, 5, 7),
        // Bone pieces (scale 1.4 fixed)
        boneBody: new THREE.BoxGeometry(6.72, 8.4, 4.2),
        boneLeg: new THREE.BoxGeometry(2.52, 7.56, 2.52),
        boneArm: new THREE.BoxGeometry(2.52, 6.72, 2.52),
        boneHead: new THREE.SphereGeometry(3.85, 6, 6),
        // Barrel explosion rays (blastRange=40 → length=80)
        blastRayA: new THREE.CylinderGeometry(9, 9, 80, 6),
        blastRayB: new THREE.CylinderGeometry(4, 4, 80, 6),
        blastRayC: new THREE.CylinderGeometry(1.5, 1.5, 80, 6),
        blastCore: new THREE.SphereGeometry(14, 6, 6),
        blastSpark: new THREE.SphereGeometry(2.0, 4, 4),
        napalmCircle: new THREE.CircleGeometry(17, 8),
        // Bomb visual geometries
        bombBodyGeo: new THREE.SphereGeometry(7, 10, 10),
        bombFuseGeo: new THREE.CylinderGeometry(0.8, 0.8, 5, 6),
        bombSparkGeo: new THREE.SphereGeometry(1.4, 6, 6),
      };
      geoCache.leg.translate(0, -2.75, 0);
      geoCache.arm.translate(0, -2.5, 0);


      export const matCache = {
        turretMat: new THREE.MeshStandardMaterial({ color: 0x455a64, roughness: 0.4, metalness: 0.6 }),
        bulletMat: new THREE.MeshBasicMaterial({ color: 0xff3d00 }),
        bloodMat: new THREE.MeshBasicMaterial({ color: 0xb71c1c }),
        ground: new THREE.MeshStandardMaterial({ color: 0x90a4ae, roughness: 0.8 }),
        wall: new THREE.MeshStandardMaterial({ color: 0x4caf50, roughness: 0.9 }),
        trunkMat: new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 1.0 }),

        skin: new THREE.MeshStandardMaterial({ color: 0xffccaa, roughness: 0.5 }),
        shirt1: new THREE.MeshStandardMaterial({ color: 0x29b6f6, roughness: 0.7 }),
        pants1: new THREE.MeshStandardMaterial({ color: 0x1565c0, roughness: 0.8 }),

        zSkin: new THREE.MeshStandardMaterial({ color: 0xbfb8b4, roughness: 0.6 }),
        zShirt: new THREE.MeshStandardMaterial({ color: 0x546e7a, roughness: 0.8 }),
        zPants: new THREE.MeshStandardMaterial({ color: 0x37474f, roughness: 0.9 }),
        zEye: new THREE.MeshStandardMaterial({ color: 0xff1744, roughness: 0.2, emissive: 0xb71c1c }),
        zShockedBody: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 1.0 }),
        zShockedEye: new THREE.MeshStandardMaterial({ color: 0xffff00, emissive: 0xffff00, emissiveIntensity: 1.0 }),
        zFrozen: new THREE.MeshStandardMaterial({ color: 0x80d8ff, roughness: 0.3, metalness: 0.2 }),
        // Solid shading for diamond visuals
        diamond: new THREE.MeshStandardMaterial({ color: 0x3aa7ff, emissive: 0x114488, emissiveIntensity: 0.3, roughness: 0.2, metalness: 0.1, flatShading: true }),
        dLine: new THREE.LineBasicMaterial({ color: 0xdff8ff, transparent: true, opacity: 0.8 }),
        dCore: new THREE.MeshBasicMaterial({ color: 0xffffff }),
        smoke: new THREE.MeshBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.6 }),
        smokePuff: new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.8 }),
        shockSparkCyan: new THREE.MeshBasicMaterial({ color: 0x00e5ff }),
        shockSparkYellow: new THREE.MeshBasicMaterial({ color: 0xffea00 }),
        shockEyeMat: new THREE.MeshStandardMaterial({ color: 0xffff00, emissive: 0xffff00, emissiveIntensity: 4.0, roughness: 0.2 }),
        shockTongueMat: new THREE.MeshStandardMaterial({ color: 0xd32f2f, roughness: 0.5 }),
        fireOrange: new THREE.MeshBasicMaterial({ color: 0xff3d00 }),
        fireYellow: new THREE.MeshBasicMaterial({ color: 0xffa000 }),
        bloodRed: new THREE.MeshBasicMaterial({ color: 0xb71c1c }),
        waterBlue: new THREE.MeshBasicMaterial({ color: 0x00ccff }),
        fireTr1: new THREE.MeshBasicMaterial({ color: 0xff6600 }),
        fireTr2: new THREE.MeshBasicMaterial({ color: 0xff3300 }),
        fireTr3: new THREE.MeshBasicMaterial({ color: 0xffaa00 }),
        fireTr4: new THREE.MeshBasicMaterial({ color: 0xdd2200 }),
        barrelMat: new THREE.MeshStandardMaterial({ color: 0xd32f2f, roughness: 0.7, metalness: 0.2 }),
        bombBodyMat: new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.3, metalness: 0.85 }),
        bombFuseMat: new THREE.MeshStandardMaterial({ color: 0x6b4c1e, roughness: 0.9 }),
        bombSparkMat: new THREE.MeshBasicMaterial({ color: 0xff6600 }),
        pupShoe: new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x006064, roughness: 0.2 }),
        pupShield: new THREE.MeshStandardMaterial({ color: 0xffa000, emissive: 0xff6f00, roughness: 0.2 }),
        pupInvincible: new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xffaa00, emissiveIntensity: 1.5, roughness: 0.1, metalness: 0.8 }),

        wireMarker: new THREE.MeshStandardMaterial({ color: 0xffeb3b, emissive: 0xffeb3b, emissiveIntensity: 0.8, metalness: 0.5 }),
        // Cannon materials — compile shaders at startup not during gameplay
        cannonWood: new THREE.MeshStandardMaterial({ color: 0x5c3310, roughness: 0.9, metalness: 0.05 }),
        cannonDarkWood: new THREE.MeshStandardMaterial({ color: 0x3a1f08, roughness: 0.85, metalness: 0.05 }),
        cannonMetal: new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.4, metalness: 0.85 }),
        cannonLimbMat: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5, metalness: 0.8 }),
        cannonArrowWood: new THREE.MeshStandardMaterial({ color: 0x8b5e3c, roughness: 0.7 }),
        cannonArrowMetal: new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.3, metalness: 0.9 }),
        cannonHoleMat: new THREE.MeshBasicMaterial({ color: 0x000000, depthWrite: false }),
        boneMat: new THREE.MeshStandardMaterial({ color: 0xd4c5a9, roughness: 0.8 }),
        // Barrel explosion materials
        blastMatOuter: new THREE.MeshBasicMaterial({ color: 0xbb0000, blending: THREE.AdditiveBlending, depthWrite: false }),
        blastMatMid: new THREE.MeshBasicMaterial({ color: 0xff4400, blending: THREE.AdditiveBlending, depthWrite: false }),
        blastMatInner: new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false }),
        blastMatCore: new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false }),
        napalmCircleMat: new THREE.MeshBasicMaterial({ color: 0xb71c1c, transparent: true, opacity: 0.8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
        napalmFlame1: new THREE.MeshBasicMaterial({ color: 0xffdd00, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
        napalmFlame2: new THREE.MeshBasicMaterial({ color: 0xff3300, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
      };

      // targetKills is set separately per level in gameState

      scene.background = new THREE.Color(BIOMES[0].sky);

      export const explosions = [];

      // SKELETON COLOR PALETTE
      export const boneMat = new THREE.MeshStandardMaterial({ color: 0xf0ece0, roughness: 0.6 });
      export const boneOldMat = new THREE.MeshStandardMaterial({ color: 0xe0d8b0, roughness: 0.7 });
      const skeletonOutlineMat = new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.BackSide });
      export function addOutline(mesh, s) {
        const ol = new THREE.Mesh(mesh.geometry, skeletonOutlineMat);
        ol.scale.setScalar(s || 1.22);
        ol.userData.isOutline = true;
        ol.visible = false;
        mesh.add(ol);
      }

      const _mkPlayer = (id) => ({ id, group: null, lLeg: null, rLeg: null, lArm: null, rArm: null, x: 0, z: 0, score: 0, alive: true, speed: gameConfig.player.baseSpeed, lastWireTick: 0, dashTimer: 0, isDashing: false, dashDur: 0, combo: 0, comboTime: 0, isDrawingWire: false, buffSpeedTime: 0, shield: false, shields: 0, wirePoints: [], wireMesh: null, startMarker: null, walkCycle: 0, bombs: 0, teamColor: id === 1 ? 'blue' : 'red', activeBombCount: 0, zombiesLeft: 0, inBombPhase: false, lives: 3, wireMeter: 0 });
      export const players = [_mkPlayer(1), _mkPlayer(2)];

      export const worldGroup = new THREE.Group();
      scene.add(worldGroup);
