import * as THREE from 'three';
import { gameConfig, ARENA_LIMIT, ARENA_LIMIT_X, BIOMES, LEVELS } from './config.js';
import { segsIntersect, isPointInPolygon, _seedRng } from './utils.js';
import { renderer, scene, camera, floatContainer, worldGroup, updateCamera, geoCache, matCache, players, explosions, boneMat, boneOldMat, addOutline } from './scene.js';
import { initNetwork, netState, guestZombieMap, guestBombMap, rtcSendOrWs, cleanupOnlineSession, mpDeclareWinner, onlineRestartVote } from './network.js';
import { gameState, _ensurePowerupBoxes } from './state.js';
import { _el, vibe, updateBombUI, updateShieldUI, updateHUD, updateMpHud } from './ui.js';
import { initAudio, unlockAudio, togglePlayPause, toggleSfx, playSfx, suspendAudio, resumeAudio, startMusicIfEnabled, stopMusic } from './audio.js';
import { setupMenuUI, openMpLevelSelect, openSingleLevelSelect, showOnlineScreen, showOnlineError, hideOnlinePanel, applyMpDifficultyConfig } from './menu.js';
import { buildBleachers, tickBleacherSpectators } from './tribun.js';
import { initAnimations, createSplatter, createWireZap, createElectricShock, createSmokePuff, createFireExplosion, createNapalmBlast, createSharedExplosion, createBarrelBlastRays, createBloodSplatter, createWaterSplash, createGunSmoke, createFireball, createFireTrail, playerDeathScatter, applyShockVisuals, removeShockVisuals, applyRedGlow, spawnFloatingHearts, tickExplosions, tickPlayerWalkAnim, tickZombieWalkAnim, tickZombieJawAnim, tickCagedGirlAnim, tickPlayerSink, tickDoorOpen, tickFloatingHearts } from './animations.js';
import { initCharacters, initPlayer, resetPlayer, respawnPlayer, spawnZombieAt, applyDropColor, assignDropType, createDropIndicators, _dropZombieMat } from './characters.js';

let gameMode = 'single';
const isMP = () => gameMode === 'multi' || gameMode === 'online-host' || gameMode === 'online-guest' || gameMode === 'online-local';

// Manifest + icon embedded — no external files needed
    (function () {
      const iconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192"><rect width="192" height="192" fill="#0a0e1a"/><text x="96" y="130" font-size="120" text-anchor="middle" fill="#fb923c">⚡</text></svg>';
      const iconData = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(iconSvg);

      const fav = document.createElement('link'); fav.rel = 'icon'; fav.href = iconData; document.head.appendChild(fav);

      const manifest = { name: "Hold the Line", short_name: "Hold the Line", display: "fullscreen", orientation: "landscape", start_url: window.location.pathname, background_color: "#000000", theme_color: "#000000", icons: [{ src: iconData, sizes: "any", type: "image/svg+xml" }] };
      const blob = new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' });
      const link = document.createElement('link');
      link.rel = 'manifest';
      link.href = URL.createObjectURL(blob);
      document.head.appendChild(link);
    })();

    // Pinch-zoom prevention (PWA/iOS)
    document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
    document.addEventListener('touchstart', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

    document.addEventListener('DOMContentLoaded', () => {
      const btn = document.getElementById('btn-fullscreen');
      btn.addEventListener('click', () => {
        const el = document.documentElement;
        const isFs = document.fullscreenElement || document.webkitFullscreenElement;
        if (!isFs) {
          if (el.requestFullscreen) el.requestFullscreen();
          else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
          else if (el.mozRequestFullScreen) el.mozRequestFullScreen();
        } else {
          if (document.exitFullscreen) document.exitFullscreen();
          else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
          else if (document.mozCancelFullScreen) document.mozCancelFullScreen();
        }
      });
      const onFsChange = () => {
        const isFs = document.fullscreenElement || document.webkitFullscreenElement;
        btn.textContent = isFs ? '✕' : '⛶';
      };
      document.addEventListener('fullscreenchange', onFsChange);
      document.addEventListener('webkitfullscreenchange', onFsChange);
    });

      // DEBUG: Display error on screen
      window.onerror = function (msg, url, line) {
        const div = document.createElement('div');
        div.style.cssText = 'position:fixed;top:0;left:0;background:red;color:white;z-index:9000;font-size:10px;padding:5px;';
        div.innerText = 'ERROR: ' + msg + ' (Line: ' + line + ')';
        document.body.appendChild(div);
      };

      const _isMobileDevice = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

      function showFloatingText(pos3D, text, color) {
        const p = pos3D.clone();
        p.project(camera);
        const x = (p.x * 0.5 + 0.5) * renderer.domElement.clientWidth;
        const y = (p.y * -0.5 + 0.5) * renderer.domElement.clientHeight;
        const el = document.createElement('div');
        el.className = 'floating-text';
        el.innerText = text;
        el.style.color = color || '#fff';
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        floatContainer.appendChild(el);
        setTimeout(() => el.remove(), 1200);
        if (gameMode === 'online-host') netState.netEvents.push({ t:'txt', x:Math.round(pos3D.x), y:Math.round(pos3D.y), z:Math.round(pos3D.z), msg:text, c:color||'#fff' });
      }

      // ── CAMERA DYNAMIC OFFSETS ──────────────────────────────────────────
      let cameraDynZ = 0;
      let cameraDynX = 0; // Default center X position
      const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

      // ── BOMB SYSTEM ──────────────────────────────────────────────────────
      let activeBombs = [];

      // Haptic feedback helper
      // (imported from ui.js)

      function breakShield(p, msg) {
        p.shields = Math.max(0, (p.shields || 0) - 1);
        if (p.shields > 0) {
          // Next shield activates
          p.shield = true;
          showFloatingText(p.group.position, '🛡️ SHIELD BROKEN! ' + p.shields + ' LEFT', '#ff8800');
        } else {
          p.shield = false;
          if (p._shieldMesh) p._shieldMesh.visible = false;
          if (p._shieldOutline) p._shieldOutline.visible = false;
          showFloatingText(p.group.position, msg || 'SHIELD BROKEN!', '#ff0000');
        }
        updateShieldUI(players);
      }

      // Returns how far the bomb flame can travel in (dirX,dirZ) before hitting a tree/rock
      function getBombFlameRange(ox, oz, dirX, dirZ, maxRange, halfW = 10) {
        const STEP = 6;
        for (let dist = STEP; dist <= maxRange; dist += STEP) {
          const rx = ox + dirX * dist, rz = oz + dirZ * dist;
          for (const t of gameState.entities.trees) {
            if (Math.hypot(rx - t.x, rz - t.z) < t.radius + halfW) return dist;
          }
        }
        return maxRange;
      }

      function bombExplode(bomb) {
        playSfx('boom');
        const pos = bomb.group.position.clone();
        worldGroup.remove(bomb.group);
        bomb.done = true;

        if (isMP() && bomb.owner) {
          bomb.owner.activeBombCount = Math.max(0, bomb.owner.activeBombCount - 1);
          updateMpHud(gameState, players, gameMode);
        }

        // Calculate per-direction flame ranges (blocked by trees/rocks)
        const MAX_FLAME = gameConfig.bombs.maxFlameRange;
        const ranges = {
          px: getBombFlameRange(pos.x, pos.z, 1, 0, MAX_FLAME),
          nx: getBombFlameRange(pos.x, pos.z, -1, 0, MAX_FLAME),
          pz: getBombFlameRange(pos.x, pos.z, 0, 1, MAX_FLAME),
          nz: getBombFlameRange(pos.x, pos.z, 0, -1, MAX_FLAME),
        };

        // Directional visual explosion
        createBarrelBlastRays(pos, 90, ranges);
        createSmokePuff(pos.clone());
        createSmokePuff(pos.clone().add(new THREE.Vector3(8, 0, 0)));

        const HW = 14; // flame half-width for collision
        const inBombRay = (dx, dz) =>
          (dx > 0 && dx < ranges.px && Math.abs(dz) < HW) ||
          (dx < 0 && -dx < ranges.nx && Math.abs(dz) < HW) ||
          (dz > 0 && dz < ranges.pz && Math.abs(dx) < HW) ||
          (dz < 0 && -dz < ranges.nz && Math.abs(dx) < HW) ||
          Math.hypot(dx, dz) < gameConfig.bombs.coreBlastRadius; // core blast radius

        // Directional zombie kills
        gameState.entities.zombies.forEach(z => {
          if (!z.active || z.shocked) return;
          const dx = z.group.position.x - pos.x, dz = z.group.position.z - pos.z;
          if (!inBombRay(dx, dz)) return;
          z.hp = 0; z.shocked = true; z.shockTimer = 0.5; z.shockTimerMax = 0.5; z.smokeTimer = 0;
          applyRedGlow(z);
          z.group.traverse(c => { if (c.isMesh && !c.userData.isOutline && (!z.eyeMeshes || !z.eyeMeshes.includes(c)) && z.mouthMesh !== c) { const sm = (c.userData.origMat || c.material).clone(); sm.emissive = new THREE.Color(0xff2200); sm.emissiveIntensity = 3.0; c.material = sm; c.userData.shockMat = sm; } });
          applyShockVisuals(z);
          if (isMP() && z.teamIdx >= 0) {
            const owner = players[z.teamIdx];
            owner.zombiesLeft = Math.max(0, owner.zombiesLeft - 1);
            _checkPlayerBombPhase(owner);
          }
        });
        if (isMP()) updateMpHud(gameState, players, gameMode);

        // MP: bomb damages all players (including owner) — lives system
        if (isMP() && !gameState.transitioning) {
          players.forEach(p => {
            if (!p.alive || p._invTimer > 0) return;
            const dx = p.x - pos.x, dz = p.z - pos.z;
            if (!inBombRay(dx, dz)) return;
            _onlinePlayerKilled(p, 2.0);
          });
        }
      }

      function triggerBarrelBlast(pos, depth) {
        if (depth > 4) return;
        const MAX_FLAME = gameConfig.barrels.blastRange;
        const HFW = gameConfig.barrels.blastHalfWidth;
        const ranges = {
          px: getBombFlameRange(pos.x, pos.z, 1, 0, MAX_FLAME, HFW),
          nx: getBombFlameRange(pos.x, pos.z, -1, 0, MAX_FLAME, HFW),
          pz: getBombFlameRange(pos.x, pos.z, 0, 1, MAX_FLAME, HFW),
          nz: getBombFlameRange(pos.x, pos.z, 0, -1, MAX_FLAME, HFW),
        };
        const HW = 14;
        const inRay = (dx, dz) =>
          (dx > 0 && dx < ranges.px && Math.abs(dz) < HW) ||
          (dx < 0 && -dx < ranges.nx && Math.abs(dz) < HW) ||
          (dz > 0 && dz < ranges.pz && Math.abs(dx) < HW) ||
          (dz < 0 && -dz < ranges.nz && Math.abs(dx) < HW) ||
          Math.hypot(dx, dz) < 20;
        showFloatingText(pos, "CHAIN!", "#ff5722");
        createSharedExplosion(pos, 40, ranges);
        gameState.entities.zombies.forEach(z => {
          if (!z.active || z.shocked) return;
          const dx = z.group.position.x - pos.x, dz = z.group.position.z - pos.z;
          if (!inRay(dx, dz)) return;
          z.hp = 0; z.shocked = true; z.shockTimer = 0.5; z.shockTimerMax = 0.5; z.smokeTimer = 0;
          applyShockVisuals(z);
        });
        const next = [];
        gameState.entities.barrels.forEach(b => {
          if (!b.active) return;
          const dx = b.mesh.position.x - pos.x, dz = b.mesh.position.z - pos.z;
          if (inRay(dx, dz)) { b.active = false; b.mesh.visible = false; next.push(b.mesh.position.clone()); }
        });
        next.forEach((cp, i) => setTimeout(() => triggerBarrelBlast(cp, depth + 1), 200 * (i + 1)));
      }

      function createBarrelBombMesh() {
        const g = new THREE.Group();
        const body = new THREE.Mesh(geoCache.bombBodyGeo, matCache.bombBodyMat);
        body.scale.y = 0.9; body.position.y = 7; body.castShadow = true; g.add(body);
        const shine = new THREE.Mesh(geoCache.bombSparkGeo, matCache.dCore);
        shine.scale.setScalar(0.86); shine.position.set(2.5, 12, 2.5); g.add(shine);
        const fuseBase = new THREE.Mesh(geoCache.bombFuseGeo, matCache.bombFuseMat);
        fuseBase.position.set(1.5, 13.5, 0); fuseBase.rotation.z = -0.35; g.add(fuseBase);
        const spark = new THREE.Mesh(geoCache.bombSparkGeo, matCache.bombSparkMat);
        spark.position.set(3.2, 16.2, 0); g.add(spark);
        g.scale.setScalar(1.25);
        return g;
      }

      function _buildGuestBombMesh(x, z) {
        const bGroup = new THREE.Group();
        bGroup.position.set(x, 0, z);
        worldGroup.add(bGroup);
        const body = new THREE.Mesh(new THREE.SphereGeometry(7, 16, 16), matCache.bombBodyMat);
        body.scale.y = 0.9; body.position.y = 7; body.castShadow = true; bGroup.add(body);
        const shine = new THREE.Mesh(new THREE.SphereGeometry(1.2, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
        shine.position.set(2.5, 12, 2.5); bGroup.add(shine);
        const fuseBase = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 5, 6), new THREE.MeshStandardMaterial({ color: 0x6b4c1e, roughness: 0.9 }));
        fuseBase.position.set(1.5, 13.5, 0); fuseBase.rotation.z = -0.35; bGroup.add(fuseBase);
        const spark = new THREE.Mesh(new THREE.SphereGeometry(1.4, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff6600 }));
        spark.position.set(3.2, 16.2, 0); bGroup.add(spark);
        const sparkLight = new THREE.PointLight(0xff8800, 80, 40);
        sparkLight.position.copy(spark.position); bGroup.add(sparkLight);
        return { group: bGroup, spark, sparkLight };
      }

      function placeBomb(player) {
        if (!player || !player.alive) return;
        if (isMP()) {
          if (!player.inBombPhase || player.activeBombCount >= (player.bombMax || 3)) return;
          player.activeBombCount++;
          updateMpHud(gameState, players, gameMode);
        } else {
          if ((player.bombs || 0) <= 0) return;
          player.bombs--;
          updateBombUI(players);
        }

        const bGroup = new THREE.Group();
        bGroup.position.set(player.x, 0, player.z);
        worldGroup.add(bGroup);

        // Body — round ball (color from matCache)
        const body = new THREE.Mesh(new THREE.SphereGeometry(7, 16, 16), matCache.bombBodyMat);
        body.scale.y = 0.9; body.position.y = 7; body.castShadow = true; bGroup.add(body);

        // Small white dot for shiny reflection
        const shineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const shine = new THREE.Mesh(new THREE.SphereGeometry(1.2, 6, 6), shineMat);
        shine.position.set(2.5, 12, 2.5); bGroup.add(shine);

        // Fuse handle (small cylinder)
        const fuseMat = new THREE.MeshStandardMaterial({ color: 0x6b4c1e, roughness: 0.9 });
        const fuseBase = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 5, 6), fuseMat);
        fuseBase.position.set(1.5, 13.5, 0); fuseBase.rotation.z = -0.35; bGroup.add(fuseBase);

        // Fuse tip spark
        const sparkMat = new THREE.MeshBasicMaterial({ color: 0xff6600 });
        const spark = new THREE.Mesh(new THREE.SphereGeometry(1.4, 6, 6), sparkMat);
        spark.position.set(3.2, 16.2, 0); bGroup.add(spark);

        // Spark light
        const sparkLight = new THREE.PointLight(0xff8800, 80, 40);
        sparkLight.position.copy(spark.position); bGroup.add(sparkLight);

        activeBombs.push({ group: bGroup, spark, sparkLight, fuseMat, fuseTimer: gameConfig.bombs.fuseTime, sparkTimer: 0, done: false, owner: player });
      }

      // ── BALL SYSTEM ──────────────────────────────────────────────────────
      const cannons = [];
      let cannonScatters = [];

      // ── CORNER BALL (WALL CANNON) SYSTEM ────────────────────────────────
      const wallCannons = [];

      function spawnWallCannon() {
        const AL = ARENA_LIMIT, ALX = ARENA_LIMIT_X;
        const IN = 14; // inside from corner
        const corners = [
          { cx: -ALX + IN, cz: -AL + IN, centerA: Math.PI / 4, name: 'TL' },
          { cx: ALX - IN, cz: -AL + IN, centerA: -Math.PI / 4, name: 'TR' },
          { cx: ALX - IN, cz: AL - IN, centerA: -Math.PI * 3 / 4, name: 'BR' },
          { cx: -ALX + IN, cz: AL - IN, centerA: Math.PI * 3 / 4, name: 'BL' },
        ];
        const used = wallCannons.map(c => c.name);
        const avail = corners.filter(c => !used.includes(c.name));
        if (!avail.length) return;
        const def = avail[Math.floor(Math.random() * avail.length)];

        // MATERIALS - TSAR CANNON STYLE
        const barrelMat = new THREE.MeshStandardMaterial({ color: 0x6ab075, roughness: 0.65, metalness: 0.35 });
        const carriageMat = new THREE.MeshStandardMaterial({ color: 0x44484b, roughness: 0.65, metalness: 0.6 });
        const ballMat = new THREE.MeshStandardMaterial({ color: 0x222528, roughness: 0.8, metalness: 0.3 });

        // Main group — carriage + barrel pivot, rotates to center angle
        const grp = new THREE.Group();
        grp.position.set(def.cx, 0, def.cz);
        grp.rotation.y = def.centerA;
        worldGroup.add(grp);

        // ── Araba (carriage) ──
        // Side bodies — massive cast side plates
        [-9, 9].forEach(ox => {
          const sidePanel = new THREE.Mesh(new THREE.BoxGeometry(3, 10, 26), carriageMat);
          sidePanel.position.set(ox, 7, 5);
          grp.add(sidePanel);

          // Dekoratif kabartmalar
          const deco = new THREE.Mesh(new THREE.BoxGeometry(3.5, 6, 18), carriageMat);
          deco.position.set(ox, 7, 5);
          grp.add(deco);
        });
        // Rear and top mass base
        const backBase = new THREE.Mesh(new THREE.BoxGeometry(16, 6, 8), carriageMat);
        backBase.position.set(0, 5, -5); grp.add(backBase);

        const frontBase = new THREE.Mesh(new THREE.BoxGeometry(16, 10, 8), carriageMat);
        frontBase.position.set(0, 7, 14); grp.add(frontBase);

        // Lion Head Relief (below barrel at front)
        const lionGroup = new THREE.Group();
        lionGroup.position.set(0, 9, 18);
        grp.add(lionGroup);
        const lionHead = new THREE.Mesh(new THREE.SphereGeometry(3.5, 12, 12), carriageMat);
        lionHead.scale.set(1, 1, 0.6); // Flatten
        lionGroup.add(lionHead);
        const lionSnout = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.0, 3, 10), carriageMat);
        lionSnout.rotation.x = Math.PI / 2;
        lionSnout.position.set(0, -1, 1.5);
        lionGroup.add(lionSnout);

        // Wheel Axle
        const axle = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 32, 12), carriageMat);
        axle.rotation.z = Math.PI / 2; axle.position.set(0, 8, 3); grp.add(axle);

        // Dev Tekerlekler
        [-16, 16].forEach(ox => {
          const wg = new THREE.Group();
          wg.position.set(ox, 8, 3); wg.rotation.y = Math.PI / 2; grp.add(wg);
          const rim = new THREE.Mesh(new THREE.TorusGeometry(11, 2.0, 10, 24), carriageMat); wg.add(rim);
          const band = new THREE.Mesh(new THREE.TorusGeometry(11.5, 0.8, 6, 24), carriageMat); wg.add(band);
          const hub = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 3.0, 5, 12), carriageMat);
          hub.rotation.x = Math.PI / 2; wg.add(hub);

          for (let s = 0; s < 8; s++) {
            const a = (s / 8) * Math.PI * 2;
            const spk = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.8, 9, 6), carriageMat);
            spk.rotation.z = a + Math.PI / 2;
            spk.position.set(Math.cos(a) * 5.0, Math.sin(a) * 5.0, 0); wg.add(spk);
          }
        });

        // ── Barrel pivot — rotates around Y axis ──
        const pivot = new THREE.Group();
        pivot.position.set(0, 16, 5); grp.add(pivot);

        // Barrel body (facing +Z direction)
        const bGroup = new THREE.Group();
        bGroup.rotation.x = Math.PI / 2;
        bGroup.position.z = 10;
        pivot.add(bGroup);

        // Part 1 (Breech - thick rear body)
        const b1 = new THREE.Mesh(new THREE.CylinderGeometry(5.0, 5.5, 10, 20), barrelMat);
        b1.position.y = -10; bGroup.add(b1);

        // Part 2 (Middle body)
        const b2 = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 12, 20), barrelMat);
        b2.position.y = 1; bGroup.add(b2);

        // Part 3 (Front barrel)
        const b3 = new THREE.Mesh(new THREE.CylinderGeometry(4.0, 4.0, 10, 20), barrelMat);
        b3.position.y = 12; bGroup.add(b3);

        // Muzzle flare (Flange)
        const b4 = new THREE.Mesh(new THREE.CylinderGeometry(6.0, 4.0, 6, 20), barrelMat);
        b4.position.y = 20; bGroup.add(b4);

        // Muzzle hole
        const muzzleHole = new THREE.Mesh(new THREE.CircleGeometry(4.0, 16), new THREE.MeshBasicMaterial({ color: 0x000000 }));
        muzzleHole.rotation.x = -Math.PI / 2; muzzleHole.position.y = 23.05; bGroup.add(muzzleHole);

        // Arka topak (Cascabel)
        const breechBack = new THREE.Mesh(new THREE.SphereGeometry(5.0, 16, 12), barrelMat);
        breechBack.position.y = -15; bGroup.add(breechBack);
        const cascabel = new THREE.Mesh(new THREE.SphereGeometry(2.0, 10, 10), barrelMat);
        cascabel.position.y = -21; bGroup.add(cascabel);
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 3, 8), barrelMat);
        neck.position.y = -19; bGroup.add(neck);

        // Thick rings (decorative)
        [-5, 7, 17].forEach(y => {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(4.8, 0.8, 8, 24), barrelMat);
          ring.rotation.x = Math.PI / 2; ring.position.y = y; bGroup.add(ring);
        });

        // Carrying handles (small side rings)
        [-1, 1].forEach(sx => {
          const handleGeo = new THREE.TorusGeometry(1.5, 0.4, 6, 12, Math.PI);
          const handle1 = new THREE.Mesh(handleGeo, barrelMat);
          handle1.rotation.y = sx * Math.PI / 2;
          handle1.position.set(sx * 4.4, 0, 0);
          bGroup.add(handle1);

          const handle2 = new THREE.Mesh(handleGeo, barrelMat);
          handle2.rotation.y = sx * Math.PI / 2;
          handle2.position.set(sx * 3.8, 10, 0);
          bGroup.add(handle2);
        });

        // Ground Pyramid Cannonballs (Tsar Cannon style)
        const ballsGroup = new THREE.Group();
        ballsGroup.position.set(-22, 0, 8);
        grp.add(ballsGroup);

        const br = 4.5;
        const bPos = [
          [0, br, 0], [1.1 * br, br, 1.8 * br], [-1.1 * br, br, 1.8 * br], // base triangle
          [0, br + 1.6 * br, 1.0 * br] // tepe
        ];
        bPos.forEach(p => {
          const bm = new THREE.Mesh(new THREE.SphereGeometry(br, 16, 16), ballMat);
          bm.position.set(p[0], p[1], p[2]);
          ballsGroup.add(bm);
        });

        // Top mermisi
        const ball = new THREE.Mesh(
          new THREE.SphereGeometry(5.5, 10, 8),
          new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5, metalness: 0.7 })
        );
        ball.visible = false; worldGroup.add(ball);

        // Drop point shadow
        const shadowMat = new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
        const shadowMesh = new THREE.Mesh(new THREE.CircleGeometry(11, 20), shadowMat);
        shadowMesh.rotation.x = -Math.PI / 2;
        shadowMesh.position.y = 1.2;
        shadowMesh.visible = false;
        worldGroup.add(shadowMesh);

        // Calculate dynamic period by level (minimum 9 seconds)
        // lvl=1 ~16s, lvl=30 ~9s
        const basePeriod = Math.max(6, 16 - Math.floor(gameState.level / 3));

        wallCannons.push({
          grp, pivot, ball, shadowMesh, shadowMat, name: def.name, cx: def.cx, cz: def.cz, centerA: def.centerA,
          sweepAngle: 0, sweepDir: 1, sweepSpeed: 0.55,
          cooldown: 4.0 + Math.random() * 4, // Random delay before first shot
          shootIn: -1,
          ballX: def.cx, ballZ: def.cz, ballDX: 0, ballDZ: 0,
          ballFlying: false, ballSpeed: 230, active: true,
          basePeriod
        });
      }

      function cannonballKillZombie(z, dx, dz) {
        if (!z.active || z._cannonKilled) return;
        z._cannonKilled = true;
        z.active = false;
        applyRedGlow(z);
        z.group.visible = false;
        if (gameMode === 'online-host') netState.netEvents.push({ t: 'scatter', x: Math.round(z.group.position.x), z: Math.round(z.group.position.z) });
        playSfx('bone');
        playSfx('wood');

        if (cannonScatters.length >= 8) {
          const old = cannonScatters.shift();
          old.pieces.forEach(p => { scene.remove(p.mesh); if (p.mesh.geometry) p.mesh.geometry.dispose(); });
          old.done = true;
        }

        const zx = z.group.position.x, zz2 = z.group.position.z;
        const partDefs = [
          { geo: geoCache.boneBody, lY: 8.4, ox: 0, delay: 0.05 },
          { geo: geoCache.boneLeg, lY: 3.78, ox: -2.52, delay: 0.0 },
          { geo: geoCache.boneLeg, lY: 3.78, ox: 2.52, delay: 0.0 },
          { geo: geoCache.boneArm, lY: 6.72, ox: -5, delay: 0.02 },
          { geo: geoCache.boneArm, lY: 6.72, ox: 5, delay: 0.02 },
          { geo: geoCache.boneHead, lY: 13.0, ox: 0, isHead: true, delay: 0.5 },
        ];
        const pieces = [];
        partDefs.forEach(pd => {
          const mesh = new THREE.Mesh(pd.geo, matCache.boneMat);
          mesh.position.set(zx + pd.ox, pd.lY, zz2);
          scene.add(mesh);
          const spread = pd.isHead ? 0.2 : 1.0;
          pieces.push({
            mesh,
            vx: dx * 70 * spread + (Math.random() - 0.5) * (pd.isHead ? 40 : 130),
            vy: pd.isHead ? 90 + Math.random() * 50 : Math.random() * 110 + 50,
            vz: dz * 70 * spread + (Math.random() - 0.5) * (pd.isHead ? 40 : 130),
            rvx: (Math.random() - 0.5) * 12, rvy: (Math.random() - 0.5) * 12, rvz: (Math.random() - 0.5) * 12,
            delay: pd.delay, landed: false, isHead: !!pd.isHead,
          });
        });
        cannonScatters.push({ pieces, life: 0, maxLife: 2.2, origin: new THREE.Vector3(zx, 5, zz2), done: false });

        // Update kill counter
        z.hp = 0;
        if (typeof gameState.zombiesKilled === 'number') gameState.zombiesKilled++;
      }

      function spawnCannon() {
        const AL = ARENA_LIMIT, ALX = ARENA_LIMIT_X;
        const side = Math.floor(Math.random() * 4);
        let wx, wz, dx, dz, ry;
        const offset = (Math.random() - 0.5) * 1.4;
        if (side === 0) { wx = offset * ALX; wz = -AL; dx = 0; dz = 1; ry = 0; }
        else if (side === 1) { wx = offset * ALX; wz = AL; dx = 0; dz = -1; ry = Math.PI; }
        else if (side === 2) { wx = ALX; wz = offset * AL; dx = -1; dz = 0; ry = -Math.PI / 2; }
        else { wx = -ALX; wz = offset * AL; dx = 1; dz = 0; ry = Math.PI / 2; }

        // Wall hole
        const hole = new THREE.Mesh(geoCache.cannonHoleGeo, matCache.cannonHoleMat);
        hole.position.set(wx + dx * 0.5, 10, wz + dz * 0.5);
        hole.rotation.y = ry;
        worldGroup.add(hole);

        // Arbalet ana grubu
        const grp = new THREE.Group();
        grp.position.set(wx, 10, wz);
        grp.rotation.y = ry;
        worldGroup.add(grp);

        // Crossbow body (slides together)
        const barrel = new THREE.Group();
        barrel.position.z = -16;
        grp.add(barrel);

        // Stok
        const stock = new THREE.Mesh(geoCache.cannonStock, matCache.cannonWood);
        barrel.add(stock);
        // Scope
        const scope = new THREE.Mesh(geoCache.cannonScope, matCache.cannonMetal);
        scope.rotation.x = Math.PI / 2; scope.position.set(0, 3.5, 2);
        barrel.add(scope);
        // Tetiklik
        const grip = new THREE.Mesh(geoCache.cannonGrip, matCache.cannonDarkWood);
        grip.position.set(0, -4.5, -5); barrel.add(grip);
        // Bow arms
        const lLimb = new THREE.Mesh(geoCache.cannonLimb, matCache.cannonLimbMat);
        lLimb.rotation.z = Math.PI / 2; lLimb.position.set(-15, 0, 10); barrel.add(lLimb);
        const rLimb = new THREE.Mesh(geoCache.cannonLimb, matCache.cannonLimbMat);
        rLimb.rotation.z = Math.PI / 2; rLimb.position.set(15, 0, 10); barrel.add(rLimb);
        [-15, 15].forEach(ox => {
          const cap = new THREE.Mesh(geoCache.cannonCap, matCache.cannonLimbMat);
          cap.position.set(ox < 0 ? -30 : 30, 0, 10); barrel.add(cap);
        });

        // Yay ipi
        const stringPts = [new THREE.Vector3(-30, 0, 10), new THREE.Vector3(0, 0, 10), new THREE.Vector3(30, 0, 10)];
        const stringGeo = new THREE.BufferGeometry().setFromPoints(stringPts);
        const stringLine = new THREE.Line(stringGeo, new THREE.LineBasicMaterial({ color: 0xddcc88 }));
        barrel.add(stringLine);

        // Arrow (initially hidden)
        const arrowGrp = new THREE.Group();
        arrowGrp.rotation.y = ry;
        arrowGrp.visible = false;
        worldGroup.add(arrowGrp);

        const shaft = new THREE.Mesh(geoCache.cannonShaft, matCache.cannonArrowWood);
        shaft.rotation.x = Math.PI / 2; arrowGrp.add(shaft);
        const tip = new THREE.Mesh(geoCache.cannonTip, matCache.cannonArrowMetal);
        tip.rotation.x = Math.PI / 2; tip.position.z = 26; arrowGrp.add(tip);
        for (let i = 0; i < 3; i++) {
          const fin = new THREE.Mesh(geoCache.cannonFin, matCache.cannonArrowWood);
          fin.position.z = -18;
          fin.rotation.z = (i / 3) * Math.PI * 2;
          fin.position.x = Math.sin((i / 3) * Math.PI * 2) * 2.0;
          fin.position.y = Math.cos((i / 3) * Math.PI * 2) * 2.0;
          arrowGrp.add(fin);
        }

        cannons.push({
          grp, barrel, hole, ball: arrowGrp, stringLine, wx, wz, dx, dz,
          emergeTimer: 2.0, fireTimer: 3.0, state: 'emerging', active: true,
          ballX: wx, ballZ: wz, speed: 200
        });
      }

      function clearWorld() {
        cannons.forEach(c => {
          worldGroup.remove(c.grp); worldGroup.remove(c.hole); worldGroup.remove(c.ball);
        });
        cannons.length = 0;
        wallCannons.forEach(c => { worldGroup.remove(c.grp); worldGroup.remove(c.ball); if (c.shadowMesh) worldGroup.remove(c.shadowMesh); });
        wallCannons.length = 0;
        cannonScatters.forEach(s => s.pieces.forEach(p => { scene.remove(p.mesh); if (p.mesh.geometry) p.mesh.geometry.dispose(); }));
        cannonScatters = [];
        activeBombs.forEach(b => { if (!b.done) worldGroup.remove(b.group); });
        activeBombs = [];
        guestBombMap.clear();
        worldGroup.clear();
        explosions.forEach(e => { if (e.mesh) scene.remove(e.mesh); if (e.parts) e.parts.forEach(p => scene.remove(p.mesh)); }); explosions.length = 0;
        gameState.entities = { zombies: [], trees: [], flowers: [], barrels: [], powerups: [], patrollers: [] };
        gameState.lakes = [];
        gameState.transitioning = false;
      }

      function createPowerupBox(type) {
        const group = new THREE.Group();
        
        // Bluish Glass Material (Premium)
        const boxMat = new THREE.MeshPhysicalMaterial({
          color: 0x00b0ff, metalness: 0.1, roughness: 0.05,
          transmission: 0.95, thickness: 1.5, transparent: true, opacity: 0.45,
          side: THREE.DoubleSide
        });
        
        const size = 18.72;
        const box = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), boxMat);
        box.position.y = size/2;
        box.castShadow = true;
        group.add(box);

        // Yellow Frame Joints (Bars along edges)
        const frameMat = new THREE.MeshStandardMaterial({ color: 0xffeb3b, emissive: 0xffeb3b, emissiveIntensity: 0.5 });
        const barThick = 1.0; // thicker bars for bigger box
        const barLen = size + barThick;

        for(let i=0; i<12; i++) {
          const bar = new THREE.Mesh(new THREE.BoxGeometry(barThick, barThick, barLen), frameMat);
          if (i < 4) { // Vertical
            bar.rotation.x = Math.PI/2;
            bar.position.set((i%2?1:-1)*(size/2), size/2, (i<2?1:-1)*(size/2));
          } else if (i < 8) { // Horizontal X
            bar.rotation.y = Math.PI/2;
            bar.position.set(0, (i%2?1:-1)*(size/2) + size/2, (i<6?1:-1)*(size/2));
          } else { // Horizontal Z
            bar.position.set((i%2?1:-1)*(size/2), (i<10?size:0), 0);
          }
          group.add(bar);
        }

        // Add Icon inside (floating slightly above)
        let icon = new THREE.Group();
        let lightCol = 0xffffff;

        if (type === 'bomb') {
          lightCol = 0xff3300;
          const bBody = new THREE.Mesh(new THREE.SphereGeometry(6.5, 16, 16), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2 }));
          icon.add(bBody);
          const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 3.5, 6), new THREE.MeshStandardMaterial({ color: 0x6b4c1e }));
          fuse.position.set(2.0, 5.5, 0); fuse.rotation.z = -0.5;
          icon.add(fuse);
          const spark = new THREE.Mesh(new THREE.SphereGeometry(1.4, 8, 8), new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xffaa00, emissiveIntensity: 2 }));
          spark.position.set(3.5, 7.5, 0);
          icon.add(spark);
        } else if (type === 'shield') {
          lightCol = 0x0088ff;
          // Rotated to be parallel to ground (y-axis is now the depth)
          const sBody = new THREE.Mesh(new THREE.BoxGeometry(9, 1.5, 10), new THREE.MeshStandardMaterial({ color: 0x1565c0, metalness: 0.8 }));
          icon.add(sBody);
          const cross = new THREE.Mesh(new THREE.BoxGeometry(2, 0.5, 7), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.5 }));
          cross.position.y = 0.8; icon.add(cross);
          const crossH = new THREE.Mesh(new THREE.BoxGeometry(6, 0.5, 2), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.5 }));
          crossH.position.y = 0.8; crossH.position.z = 0.5; icon.add(crossH);
        } else if (type === 'speed') {
          lightCol = 0xffcc00;
          const bolt = new THREE.Group();
          const part1 = new THREE.Mesh(new THREE.BoxGeometry(2, 7, 2), new THREE.MeshStandardMaterial({ color: 0xffcc00, emissive: 0xffcc00, emissiveIntensity: 1.0 }));
          part1.rotation.z = 0.5; part1.position.set(2.5, 3, 0); bolt.add(part1);
          const part2 = new THREE.Mesh(new THREE.BoxGeometry(2, 7, 2), new THREE.MeshStandardMaterial({ color: 0xffcc00, emissive: 0xffcc00, emissiveIntensity: 1.0 }));
          part2.rotation.z = 0.5; part2.position.set(-2.5, -3, 0); bolt.add(part2);
          icon.add(bolt);
        } else if (type === 'freeze') {
          lightCol = 0x00ffff;
          for(let i=0; i<3; i++) {
            const bar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 12, 1.5), new THREE.MeshStandardMaterial({ color: 0x80d8ff, emissive: 0x80d8ff, emissiveIntensity: 1.0 }));
            bar.rotation.z = (i/3) * Math.PI;
            icon.add(bar);
            const bar2 = new THREE.Mesh(new THREE.BoxGeometry(1.5, 12, 1.5), new THREE.MeshStandardMaterial({ color: 0x80d8ff, emissive: 0x80d8ff, emissiveIntensity: 1.0 }));
            bar2.rotation.x = (i/3) * Math.PI;
            icon.add(bar2);
          }
        } else if (type === 'slowDown') {
          lightCol = 0xaaaaaa;
          const ring = new THREE.Mesh(new THREE.TorusGeometry(6, 2, 8, 16), new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5 }));
          ring.rotation.x = Math.PI/2;
          icon.add(ring);
          const core = new THREE.Mesh(new THREE.SphereGeometry(2.5, 8, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.5 }));
          icon.add(core);
        } else if (type === 'zombieCall') {
          lightCol = 0xff0000;
          const skull = new THREE.Mesh(new THREE.SphereGeometry(4, 10, 10), new THREE.MeshStandardMaterial({ color: 0xeeeeee }));
          icon.add(skull);
          const jaw = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 3), new THREE.MeshStandardMaterial({ color: 0xdddddd }));
          jaw.position.y = -3; icon.add(jaw);
        } else if (type === 'lightning') {
          lightCol = 0xffffff;
          const boltMat = new THREE.MeshStandardMaterial({ color: 0xffff00, emissive: 0xffff00, emissiveIntensity: 2.5 });
          const p1 = new THREE.Mesh(new THREE.BoxGeometry(3, 9, 3), boltMat);
          p1.rotation.z = 0.5; p1.position.set(3, 3.5, 0); icon.add(p1);
          const p2 = new THREE.Mesh(new THREE.BoxGeometry(3, 9, 3), boltMat);
          p2.rotation.z = 0.5; p2.position.set(-3, -3.5, 0); icon.add(p2);
          const mid = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 3), boltMat);
          mid.position.set(0, 0, 0); icon.add(mid);
        }

        icon.position.y = size / 2;
        group.add(icon);

        const frameColor = type === 'lightning' ? 0x00e5ff : 0xffeb3b;
        group.traverse(c => { if(c.isMesh && c.geometry.type === 'BoxGeometry' && c.geometry.parameters.width === 1.0) c.material.color.set(frameColor); });

        // Add a glowing light inside the glass
        const pLight = new THREE.PointLight(lightCol, 50, 60);
        pLight.position.y = size / 2;
        group.add(pLight);

        return { group, icon, type, pLight };
      }

      function spawnFormation() {
        if (gameState.zombiesSpawned >= gameState.targetKills) return;
        const conf = LEVELS[gameState.level - 1] || LEVELS[LEVELS.length - 1];
        const lvl = gameState.level;
        const rows = 2;
        const cols = 2;
        const spacing = 20;
        const side = Math.floor(Math.random() * 4);
        const AL = ARENA_LIMIT, ALX = ARENA_LIMIT_X;
        let anchorX = 0, anchorZ = 0;
        if (side === 0) { anchorX = -ALX; anchorZ = (Math.random() - 0.5) * AL * 1.5; }
        else if (side === 1) { anchorX = ALX; anchorZ = (Math.random() - 0.5) * AL * 1.5; }
        else if (side === 2) { anchorZ = -AL; anchorX = (Math.random() - 0.5) * ALX * 1.5; }
        else { anchorZ = AL; anchorX = (Math.random() - 0.5) * ALX * 1.5; }
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (gameState.zombiesSpawned >= gameState.targetKills) return;
            const colOffset = (c - (cols - 1) / 2) * spacing;
            const rowOffset = r * spacing;
            let zx, zz;
            if (side === 0) { zx = anchorX + rowOffset; zz = anchorZ + colOffset; }
            else if (side === 1) { zx = anchorX - rowOffset; zz = anchorZ + colOffset; }
            else if (side === 2) { zx = anchorX + colOffset; zz = anchorZ + rowOffset; }
            else { zx = anchorX + colOffset; zz = anchorZ - rowOffset; }
            spawnZombieAt(zx, zz, conf.zombieSpeed);
            gameState.zombiesSpawned++;
          }
        }
        updateHUD(gameState, players);
      }

      function makeOrganicLakeGeo(avgR) {
        const seg = 22;
        const ctrlPts = [];
        for (let i = 0; i <= seg; i++) {
          const a = (i / seg) * Math.PI * 2;
          // Two-frequency noise → natural lake shore
          const r = avgR * (0.72 + Math.random() * 0.56 + Math.sin(a * 3 + Math.random()) * 0.1);
          ctrlPts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
        }
        ctrlPts[ctrlPts.length - 1] = ctrlPts[0].clone(); // close the loop
        const curve = new THREE.SplineCurve(ctrlPts);
        return new THREE.ShapeGeometry(new THREE.Shape(curve.getPoints(90)));
      }

      // Effect pool unlocked by level
      function _buildDiamondMesh(scale) {
        const g = new THREE.Group();
        const top = new THREE.Mesh(geoCache.dTop, matCache.diamond);
        top.position.y = 0; top.castShadow = true;
        top.add(new THREE.LineSegments(new THREE.EdgesGeometry(geoCache.dTop), matCache.dLine));
        g.add(top);
        const bot = new THREE.Mesh(geoCache.dBot, matCache.diamond);
        bot.rotation.x = Math.PI; bot.position.y = -4; bot.castShadow = true;
        bot.add(new THREE.LineSegments(new THREE.EdgesGeometry(geoCache.dBot), matCache.dLine));
        g.add(bot);
        g.scale.setScalar(scale);
        return g;
      }

      function spawnLevelDiamond() {
        let rx, rz, ok = false, att = 0;
        while (!ok && att < 80) {
          att++;
          rx = (Math.random() - 0.5) * ARENA_LIMIT_X * 1.4;
          rz = (Math.random() - 0.5) * ARENA_LIMIT * 1.4;
          if (Math.hypot(rx, rz) < 40) continue;
          let blocked = false;
          if (gameState.lakes) gameState.lakes.forEach(lk => { if (Math.hypot(rx - lk.x, rz - lk.z) < lk.r + 12) blocked = true; });
          gameState.entities.trees.forEach(t => { if (Math.hypot(rx - t.x, rz - t.z) < t.radius + 10) blocked = true; });
          if (!blocked) ok = true;
        }
        if (!ok) return;
        const g = _buildDiamondMesh(1.75);
        g.position.set(rx, 14, rz);
        worldGroup.add(g);
        gameState.entities.diamonds.push({ group: g, active: true, x: rx, z: rz, effect: null });
      }

      function spawnBombPhaseDiamond(forceX, forceZ) {
        let rx = forceX, rz = forceZ;
        if (rx === undefined) {
          let ok = false, att = 0;
          while (!ok && att < 80) {
            att++;
            rx = (Math.random() - 0.5) * 320;
            rz = (Math.random() - 0.5) * 320;
            if (Math.hypot(rx, rz) < 30) continue;
            let blocked = false;
            if (gameState.lakes) gameState.lakes.forEach(lk => { if (Math.hypot(rx - lk.x, rz - lk.z) < lk.r + 12) blocked = true; });
            players.forEach(p => { if (p.alive && Math.hypot(p.x - rx, p.z - rz) < 35) blocked = true; });
            if (!blocked) ok = true;
          }
        }
        const _diamondPool = [];
        const _dType = _diamondPool[Math.floor(Math.random() * _diamondPool.length)];
        const pBox = createPowerupBox(_dType);
        pBox.group.position.set(rx, 0, rz);
        worldGroup.add(pBox.group);
        gameState.entities.powerupBoxes.push({ ...pBox, active: true, x: rx, z: rz });
        showFloatingText(new THREE.Vector3(rx, 20, rz), '💎 ELMAS!', '#ff69b4');
      }

      function applyMysteryEffect(effect, p, pos) {
        playSfx('pickup');
        switch (effect) {
          case 'speed':
            showFloatingText(pos, '⚡ SPEED!', '#00e5ff');
            break;
          case 'shield':
            p.shields = (p.shields || 0) + 1;
            p.shield = true;
            updateShieldUI(players);
            showFloatingText(pos, '🛡️ SHIELD! x' + p.shields, '#ffa000');
            break;
          case 'bomb': {
            if (isMP()) {
              p.bombMax = (p.bombMax || 3) + 1;
              updateMpHud(gameState, players, gameMode);
              showFloatingText(pos, '💣 +1 BOMBA HAKKI!', '#ff6600');
            } else {
              let kills = 0;
              gameState.entities.zombies.forEach(z => {
                if (z.active && !z.isFalling && Math.hypot(p.x - z.group.position.x, p.z - z.group.position.z) < 75) {
                  z.hp = 0; z.shocked = true; z.shockTimer = 0.6; z.shockTimerMax = 0.6; z.smokeTimer = 0;
                  z.group.traverse(c => { if (c.isMesh && !c.userData.isOutline) { const sm = (c.userData.origMat || c.material).clone(); sm.emissive = new THREE.Color(0x00e5ff); sm.emissiveIntensity = 3.0; c.material = sm; c.userData.shockMat = sm; } });
                  z.group.traverse(c => { if (c.userData.isOutline) c.visible = true; });
                  if (z.lArm) z.lArm.rotation.set(-0.3, -Math.PI / 2, 0);
                  if (z.rArm) z.rArm.rotation.set(-0.3, Math.PI / 2, 0);
                  if (z.lLeg) z.lLeg.rotation.set(0, 0, -0.55);
                  if (z.rLeg) z.rLeg.rotation.set(0, 0, 0.55);
                  applyShockVisuals(z); createElectricShock(z.group.position); kills++;
                }
              });
              gameState.kills += kills;
              if (kills > 0) vibe(Math.min(40 + kills * 25, 180));
              showFloatingText(pos, '💣 BOMBA! +' + kills, '#ff5722');
            }
            break;
          }
          case 'freeze':
            gameState.freezeTimer = 7;
            showFloatingText(pos, '❄️ FREEZE! 3.5s', '#80d8ff');
            break;
          case 'slowDown':
            p.slowTime = 5;
            showFloatingText(pos, '🐌 SLOWED! 5s', '#9e9e9e');
            break;
          case 'zombieCall': {
            const spd = (LEVELS[gameState.level - 1] || LEVELS[LEVELS.length - 1]).zombieSpeed;
            for (let i = 0; i < 3; i++) {
              const angle = (i / 3) * Math.PI * 2;
              const dist = 55 + Math.random() * 30;
              spawnZombieAt(p.x + Math.cos(angle) * dist, p.z + Math.sin(angle) * dist, spd);
            }
            showFloatingText(pos, '☠️ ZOMBIE INCOMING!', '#e53935');
            break;
          }
          case 'lightning':
            p.wireMeter = (p.wireMeter || 0) + 300;
            showFloatingText(pos, '⚡ +300m TEL!', '#ffff00');
            break;
          case 'trapCancel':
            p.isDrawingWire = false; p.wirePoints = [];
            p.wireMesh.geometry.dispose(); p.wireMesh.geometry = new THREE.BufferGeometry();
            p.wireOuterMesh.geometry.dispose(); p.wireOuterMesh.geometry = new THREE.BufferGeometry();
            p.startMarker.visible = false;
            showFloatingText(pos, '⚠️ TRAP CANCEL!', '#ff1744');
            break;
          case 'bombPickup':
            if (isMP()) {
              p.bombMax = (p.bombMax || 3) + 1;
              updateMpHud(gameState, players, gameMode);
              showFloatingText(pos, '💣 +1 BOMBA HAKKI!', '#ff6600');
            } else {
              p.bombs = (p.bombs || 0) + 1;
              updateBombUI(players);
              showFloatingText(pos, '💣 BOMBA!', '#ff6600');
            }
            break;
        }
        createSmokePuff(pos);
        updateHUD(gameState, players);
      }

      function spawnSoldierWave(levelIndex) {
        return;
        const cp = gameState.cagePos;
        const soldierSpeed = 16.1 + levelIndex * 0.92;

        // ── Total soldier count ─────────────────────────────────────────────
        // Level 1: 6 soldiers, +1 per level
        const totalSoldiers = 5 + levelIndex;

        const colGap = 11;  // distance between columns
        const rowGap = 13;  // distance between rows

        // ── Parameters random from level 5 ─────────────────────────────────
        let cols, numGroups;
        if (levelIndex < 5) {
          cols = 1;
          numGroups = 1;
        } else {
          cols = Math.floor(Math.random() * 3) + 1;
          numGroups = Math.floor(Math.random() * 4) + 1;
        }

        // Sort corners by distance to cage — spawn from farthest
        const corners = [
          { x: -175, z: -175 },
          { x: 175, z: -175 },
          { x: -175, z: 175 },
          { x: 175, z: 175 },
        ];
        corners.sort((a, b) =>
          Math.hypot(b.x - cp.x, b.z - cp.z) - Math.hypot(a.x - cp.x, a.z - cp.z)
        );
        const activeCorners = corners.slice(0, numGroups);

        const perGroup = Math.ceil(totalSoldiers / numGroups);

        // Shared materials
        const soldierMat = new THREE.MeshStandardMaterial({ color: 0x4caf50, roughness: 0.7 });
        const helmetMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.6, metalness: 0.3 });
        const bootMat = new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 0.9 });
        const skinMat = new THREE.MeshStandardMaterial({ color: 0xffccaa, roughness: 0.5 });

        activeCorners.forEach((corner, gi) => {
          const count = Math.min(perGroup, totalSoldiers - gi * perGroup);
          if (count <= 0) return;

          // L-path: first along Z axis (edge), then X axis (toward cage)
          const zDir = Math.sign(cp.z - corner.z) || 1;  // Z direction from corner to cage

          const groupRows = Math.ceil(count / cols);

          for (let r = 0; r < groupRows; r++) {
            for (let c = 0; c < cols; c++) {
              if (r * cols + c >= count) break;

              // Columns spread on X axis (fixed X, walk straight along edge)
              const colOff = (c - (cols - 1) / 2) * colGap;

              // Spawn: corner X + column offset, sorted far from cage
              const spawnX = corner.x + colOff;
              const spawnZ = corner.z - zDir * r * rowGap;  // r=0 front, back rows farther

              // Hinge point: moves along edge, turns when aligned with cage Z
              const hingeX = corner.x + colOff;
              const hingeZ = cp.z;

              // Son hedef: kafes merkezi
              const targetX = cp.x;
              const targetZ = cp.z;

              const group = new THREE.Group();

              // ── Asker modeli ─────────────────────────────────────────────
              const body = new THREE.Mesh(new THREE.CapsuleGeometry(3.5, 5.0, 8, 8), soldierMat);
              body.position.y = 7.0; body.castShadow = true; group.add(body);

              const head = new THREE.Mesh(new THREE.SphereGeometry(3.5, 12, 12), skinMat);
              head.position.y = 13.0; head.castShadow = true; group.add(head);

              const helmet = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 3.2, 3.0, 12), helmetMat);
              helmet.position.y = 2.2; head.add(helmet);

              [-1, 1].forEach(s => {
                const sh = new THREE.Mesh(new THREE.SphereGeometry(1.5, 6, 6), helmetMat);
                sh.position.set(s * 4.0, 10.5, 0); group.add(sh);
              });

              const lArm = new THREE.Mesh(new THREE.CapsuleGeometry(1.3, 4.5, 6, 6), soldierMat);
              lArm.geometry = lArm.geometry.clone(); lArm.geometry.translate(0, -2.25, 0);
              lArm.position.set(-4.5, 10.0, 0); lArm.castShadow = true; group.add(lArm);

              const rArm = new THREE.Mesh(new THREE.CapsuleGeometry(1.3, 4.5, 6, 6), soldierMat);
              rArm.geometry = rArm.geometry.clone(); rArm.geometry.translate(0, -2.25, 0);
              rArm.position.set(4.5, 10.0, 0); rArm.castShadow = true; group.add(rArm);

              const lLeg = new THREE.Mesh(new THREE.CapsuleGeometry(1.5, 5.0, 6, 6), bootMat);
              lLeg.geometry = lLeg.geometry.clone(); lLeg.geometry.translate(0, -2.5, 0);
              lLeg.position.set(-1.7, 3.0, 0); lLeg.castShadow = true; group.add(lLeg);

              const rLeg = new THREE.Mesh(new THREE.CapsuleGeometry(1.5, 5.0, 6, 6), bootMat);
              rLeg.geometry = rLeg.geometry.clone(); rLeg.geometry.translate(0, -2.5, 0);
              rLeg.position.set(1.7, 3.0, 0); rLeg.castShadow = true; group.add(rLeg);
              // ─────────────────────────────────────────────────────────────

              group.position.set(spawnX, 0, spawnZ);
              group.rotation.y = Math.atan2(0, zDir);

              worldGroup.add(group);
              group.traverse(ch => { if (ch.isMesh) ch.userData.origMat = ch.material; });

              const walkPhase = r * Math.PI * 0.5;

              gameState.soldiers.push({
                group, lLeg, rLeg, lArm, rArm,
                x: spawnX, z: spawnZ,
                waypoints: [{ x: hingeX, z: hingeZ }, { x: targetX, z: targetZ }],
                speed: soldierSpeed,
                active: true,
                shocked: false, shockTimer: 0,
                isFalling: false, fallTime: 0,
                walkCycle: walkPhase,
              });
            }
          }
        });
      }

      function spawnPatrollers(levelIndex, biome) {
        const count = 4; // fixed 4 insects per level
        const speed = 25.3 + (levelIndex - 1) * 3.45;
        const arenaBounds = ARENA_LIMIT * 0.85;

        for (let i = 0; i < count; i++) {
          const group = new THREE.Group();

          // Color by biome
          const bodyColor = biome.tc;
          const shellMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.4, metalness: 0.2 });
          const shellDarkMat = new THREE.MeshStandardMaterial({ color: biome.s1, roughness: 0.5, metalness: 0.1 });
          const legMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.7 });
          const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
          const eyePupilMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3, emissive: 0x111111, emissiveIntensity: 0.5 });

          // Round main body
          const body = new THREE.Mesh(new THREE.SphereGeometry(6, 12, 10), shellMat);
          body.scale.set(1, 0.78, 1.1);
          body.position.y = 5.5; group.add(body);

          // Back ridge (wing split)
          const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 11), shellDarkMat);
          stripe.position.set(0, 11.3, 0); group.add(stripe);

          // Small head
          const head = new THREE.Mesh(new THREE.SphereGeometry(3.2, 10, 8), shellMat);
          head.position.set(0, 4.8, 6.5); group.add(head);

          // Eyes — white + black pupil
          [-1.6, 1.6].forEach(ox => {
            const eyeW = new THREE.Mesh(new THREE.SphereGeometry(1.4, 8, 8), eyeWhiteMat);
            eyeW.position.set(ox, 5.8, 9.2); group.add(eyeW);
            const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.75, 7, 7), eyePupilMat);
            pupil.position.set(ox * 1.05, 5.8, 10.2); group.add(pupil);
          });

          // Antenler
          [-1.2, 1.2].forEach(ox => {
            const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.1, 5, 5), legMat);
            ant.position.set(ox, 7.5, 8.5);
            ant.rotation.x = -0.6; ant.rotation.z = ox * 0.3;
            group.add(ant);
            const antTip = new THREE.Mesh(new THREE.SphereGeometry(0.4, 6, 6), shellDarkMat);
            antTip.position.set(ox * 1.3, 10.5, 6.5); group.add(antTip);
          });

          // 6 bacak — 3 her yanda
          [-1.5, 0, 1.5].forEach((oz, idx) => {
            [-1, 1].forEach(side => {
              const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.18, 5, 5), legMat);
              leg.position.set(side * 6.5, 2.5, oz * 2.2);
              leg.rotation.z = side * 0.9;
              leg.rotation.x = (idx - 1) * 0.15;
              group.add(leg);
              const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.12, 3, 4), legMat);
              foot.position.set(side * 10.5, 0.5, oz * 2.2 + side * 0.3);
              foot.rotation.z = side * 1.4;
              group.add(foot);
            });
          });

          // Spawn position — away from center, lake and trees
          let bx = 0, bz = 0, valid = false, att = 0;
          while (!valid && att < 200) {
            att++;
            bx = (Math.random() - 0.5) * arenaBounds * 1.8;
            bz = (Math.random() - 0.5) * arenaBounds * 1.8;
            if (Math.hypot(bx, bz) < 35) continue;
            let blocked = false;
            gameState.lakes.forEach(lk => { if (Math.hypot(bx - lk.x, bz - lk.z) < lk.r + 10) blocked = true; });
            gameState.entities.trees.forEach(t => { if (Math.hypot(bx - t.x, bz - t.z) < t.radius + 8) blocked = true; });
            if (!blocked) valid = true;
          }

          const startAngle = Math.random() * Math.PI * 2;

          group.position.set(bx, 0, bz);
          worldGroup.add(group);
          group.traverse(child => { if (child.isMesh) child.userData.origMat = child.material; });

          gameState.entities.patrollers.push({
            group,
            x: bx, z: bz,
            dx: Math.cos(startAngle), dz: Math.sin(startAngle),
            speed,
            active: true,
            hp: 1, maxHp: 1,
            isFalling: false, fallTime: 0,
            walkCycle: Math.random() * Math.PI * 2,
            wanderTimer: Math.random() * 2
          });
        }
      }

      function buildGridArena(levelIndex) {
        let _origMathRand = null;
        if (netState.levelSeed) { _origMathRand = Math.random; Math.random = _seedRng(netState.levelSeed); netState.levelSeed = 0; }
        clearWorld();
        const arenaBounds = ARENA_LIMIT; // spawn limit = fence limit
        const treeBounds = ARENA_LIMIT;  // trees stay within fence

        const biome = BIOMES[(levelIndex - 1) % BIOMES.length];
        gameState.biome = biome;
        scene.background = new THREE.Color(biome.sky);

        // If ground is dark make bombs red, else keep black
        const bg = biome.ground;
        const lum = 0.299 * ((bg >> 16) & 255) + 0.587 * ((bg >> 8) & 255) + 0.114 * (bg & 255);
        const bombColor = (lum < 100) ? 0xcc1111 : 0x222222;
        matCache.bombBodyMat.color.setHex(bombColor);

        const AZ = ARENA_LIMIT;      // z half-extent
        const AX = ARENA_LIMIT_X;    // x half-extent (16:9)
        const baseMesh = new THREE.Mesh(new THREE.BoxGeometry(AX * 2, 2, AZ * 2), new THREE.MeshStandardMaterial({ color: biome.ground, roughness: 1.0 }));
        baseMesh.position.y = -1; baseMesh.receiveShadow = true;
        worldGroup.add(baseMesh);

        // Fence walls — 4 edges, 16:9 rectangle
        const fenceH = 22, fenceT = 5;
        const fenceMat = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.9, metalness: 0.05 });
        const fenceTopMat = new THREE.MeshStandardMaterial({ color: 0x4e342e, roughness: 0.8 });
        const fenceSides = [
          { pos: [0, fenceH / 2, -AZ], size: [AX * 2 + fenceT, fenceH, fenceT] },
          { pos: [0, fenceH / 2, AZ], size: [AX * 2 + fenceT, fenceH, fenceT] },
          { pos: [-AX, fenceH / 2, 0], size: [fenceT, fenceH, AZ * 2 + fenceT] },
          { pos: [AX, fenceH / 2, 0], size: [fenceT, fenceH, AZ * 2 + fenceT] },
        ];
        fenceSides.forEach(({ pos, size }) => {
          const wall = new THREE.Mesh(new THREE.BoxGeometry(...size), fenceMat);
          wall.position.set(...pos); wall.castShadow = true; wall.receiveShadow = true;
          worldGroup.add(wall);
          const cap = new THREE.Mesh(new THREE.BoxGeometry(size[0], 2.5, size[2] + 1), fenceTopMat);
          cap.position.set(pos[0], pos[1] + fenceH / 2 + 1.25, pos[2]);
          worldGroup.add(cap);
        });
        // Corner posts
        for (let cx of [-AX, AX]) for (let cz of [-AZ, AZ]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(fenceT + 3, fenceH + 6, fenceT + 3), fenceTopMat);
          post.position.set(cx, (fenceH + 6) / 2, cz);
          post.castShadow = true; worldGroup.add(post);
        }

        // ── Bleachers ────────────────────────────────────────────────────────
        buildBleachers(fenceT);
        // ── End Bleachers ─────────────────────────────────────────────────────

        const numLakes = 3;
        let attempts = 0;

        while (gameState.lakes.length < numLakes && attempts < 200) {
          attempts++;
          let lr = Math.random() * 22 + 25;
          let lx = (Math.random() - 0.5) * (ARENA_LIMIT_X - lr) * 1.8;
          let lz = (Math.random() - 0.5) * (arenaBounds - lr) * 1.8;

          if (Math.hypot(lx, lz) < lr + 35) continue;
          if (Math.hypot(lx, lz) < lr + 40) continue; // clear around cage

          let overlaps = false;
          gameState.lakes.forEach(lk => {
            if (Math.hypot(lx - lk.x, lz - lk.z) < lr + lk.r + 5) overlaps = true;
          });
          if (overlaps) continue;

          // Organically shaped lake — natural shore not a circle
          const lakeGeo = makeOrganicLakeGeo(lr);
          const lakeMat = new THREE.MeshPhysicalMaterial({
            color: biome.lake, emissive: biome.lem, emissiveIntensity: 0.25,
            transparent: true, opacity: 0.92, roughness: 0.04, metalness: 0.15,
            transmission: 0.3
          });
          const lakeMesh = new THREE.Mesh(lakeGeo, lakeMat);
          lakeMesh.rotation.x = -Math.PI / 2;   // Lay XY plane onto XZ
          lakeMesh.position.set(lx, 0.15, lz);
          lakeMesh.receiveShadow = true;
          worldGroup.add(lakeMesh);

          // Organic shore strip — slightly larger, same faded color
          const shoreGeo = makeOrganicLakeGeo(lr * 1.08);
          const shoreMat = new THREE.MeshBasicMaterial({ color: biome.lem, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false });
          const shoreMesh = new THREE.Mesh(shoreGeo, shoreMat);
          shoreMesh.rotation.x = -Math.PI / 2;
          shoreMesh.position.set(lx, 0.08, lz);
          worldGroup.add(shoreMesh);

          gameState.lakes.push({ x: lx, z: lz, r: lr, mesh: lakeMesh, lakeMat, splashColor: biome.lake });

          // Shore stones — various sizes along organic shore
          const rockMat = new THREE.MeshStandardMaterial({ color: biome.rc, roughness: 0.95, metalness: 0.03 });
          const rockCount = 20 + Math.floor(Math.random() * 12);
          for (let ri = 0; ri < rockCount; ri++) {
            const angle = (ri / rockCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
            const onShore = Math.random() > 0.25; // 75% on shore, 25% in water (submerged stone)
            const dist = onShore
              ? lr * (0.90 + Math.random() * 0.18)   // outside shore
              : lr * (0.72 + Math.random() * 0.16);   // in water, half submerged
            const rx = lx + Math.cos(angle) * dist;
            const rz = lz + Math.sin(angle) * dist;
            const size = 1.2 + Math.random() * (Math.random() > 0.8 ? 5.5 : 3.0); // mostly small, occasionally large
            const geoType = Math.random();
            const geo = geoType > 0.6
              ? new THREE.DodecahedronGeometry(size, 0)
              : geoType > 0.3
                ? new THREE.IcosahedronGeometry(size, 0)
                : new THREE.SphereGeometry(size, 4, 3);
            const rock = new THREE.Mesh(geo, rockMat);
            const embedY = onShore ? size * 0.25 : -size * 0.4; // submerged stones lower
            rock.position.set(rx, embedY, rz);
            rock.rotation.set(Math.random() * 0.9, Math.random() * Math.PI * 2, Math.random() * 0.9);
            rock.castShadow = true; rock.receiveShadow = true;
            worldGroup.add(rock);
          }

          // Reeds — short reed group
          const reedMat = new THREE.MeshStandardMaterial({ color: biome.reed, roughness: 1.0 });
          const reedTopMat = new THREE.MeshStandardMaterial({ color: 0x4e342e, roughness: 1.0 });
          const reedGroups = 3 + Math.floor(Math.random() * 3);
          for (let rg = 0; rg < reedGroups; rg++) {
            const gAngle = Math.random() * Math.PI * 2;
            const gx = lx + Math.cos(gAngle) * lr * (0.86 + Math.random() * 0.1);
            const gz = lz + Math.sin(gAngle) * lr * (0.86 + Math.random() * 0.1);
            for (let rr = 0; rr < 2 + Math.floor(Math.random() * 3); rr++) {
              const h = 3 + Math.random() * 3;
              const ox = (Math.random() - 0.5) * 4, oz = (Math.random() - 0.5) * 4;
              const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, h, 5), reedMat);
              stem.position.set(gx + ox, h * 0.5, gz + oz);
              stem.rotation.z = (Math.random() - 0.5) * 0.3;
              worldGroup.add(stem);
              const top = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 2, 6), reedTopMat);
              top.position.set(gx + ox, h + 0.8, gz + oz);
              worldGroup.add(top);
            }
          }
        }

        const numTrees = 20;
        let treeAttempts = 0, placedTrees = 0;
        while (placedTrees < numTrees && treeAttempts < 250) {
          treeAttempts++;
          let x = (Math.random() - 0.5) * ARENA_LIMIT_X * 1.7;
          let z = (Math.random() - 0.5) * arenaBounds * 1.7;
          if (Math.hypot(x, z) < 30) continue;
          if (Math.hypot(x, z) < 45) continue; // clear around cage

          let inLake = false;
          gameState.lakes.forEach(lk => { if (Math.hypot(x - lk.x, z - lk.z) < lk.r + 8) inLake = true; });
          if (inLake) continue;

          placedTrees++;
          const tGroup = new THREE.Group();

          if (biome.tree === 'pine') {
            const trunk = new THREE.Mesh(geoCache.trunk, new THREE.MeshStandardMaterial({ color: biome.tr }));
            trunk.position.y = 5.0; trunk.castShadow = true; trunk.receiveShadow = true; tGroup.add(trunk);
            const leavesMat = new THREE.MeshStandardMaterial({ color: biome.tc, roughness: 1.0 });
            const cone1 = new THREE.Mesh(new THREE.ConeGeometry(8, 14, 16), leavesMat);
            cone1.position.y = 14; cone1.castShadow = true; cone1.receiveShadow = true; tGroup.add(cone1);
            const cone2 = new THREE.Mesh(new THREE.ConeGeometry(5, 10, 16), leavesMat);
            cone2.position.y = 22; cone2.castShadow = true; cone2.receiveShadow = true; tGroup.add(cone2);
          }
          else if (biome.tree === 'cactus') {
            const cMat = new THREE.MeshStandardMaterial({ color: biome.tc, roughness: 0.9 });
            const main = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 22, 8), cMat);
            main.position.y = 11; main.castShadow = true; main.receiveShadow = true; tGroup.add(main);
            const arm = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 12, 8), cMat);
            arm.position.set(4, 12, 0); arm.rotation.z = Math.PI / 4; arm.castShadow = true; tGroup.add(arm);
            const arm2 = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 10, 8), cMat);
            arm2.position.set(-4, 16, 0); arm2.rotation.z = -Math.PI / 4; arm2.castShadow = true; tGroup.add(arm2);
          }
          else if (biome.tree === 'rock') {
            const rMat = new THREE.MeshStandardMaterial({ color: biome.tc, roughness: 0.8 });
            const r1 = new THREE.Mesh(new THREE.DodecahedronGeometry(12, 0), rMat);
            r1.position.y = 6; r1.castShadow = true; r1.receiveShadow = true; tGroup.add(r1);
            if (Math.random() > 0.5) {
              const r2 = new THREE.Mesh(new THREE.DodecahedronGeometry(8, 0), rMat);
              r2.position.set(6, 4, 0); r2.castShadow = true; r2.receiveShadow = true; tGroup.add(r2);
            }
          }
          else if (biome.tree === 'balls') {
            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(3, 4, 15, 8), new THREE.MeshStandardMaterial({ color: biome.tr }));
            trunk.position.y = 7.5; trunk.castShadow = true; trunk.receiveShadow = true; tGroup.add(trunk);
            const leavesMat = new THREE.MeshStandardMaterial({ color: biome.tc, roughness: 0.9 });
            const b1 = new THREE.Mesh(new THREE.IcosahedronGeometry(10, 1), leavesMat);
            b1.position.y = 18; b1.castShadow = true; b1.receiveShadow = true; tGroup.add(b1);
          }
          else if (biome.tree === 'crystal') {
            const cMat = new THREE.MeshStandardMaterial({ color: biome.tc, transparent: true, opacity: 0.85, roughness: 0.1, emissive: 0x006064 });
            const cry = new THREE.Mesh(new THREE.OctahedronGeometry(8, 0), cMat);
            cry.position.y = 10; cry.scale.y = 2.5; cry.castShadow = true; tGroup.add(cry);
          }
          else if (biome.tree === 'neon') {
            const mMat = new THREE.MeshStandardMaterial({ color: biome.tr, metalness: 0.8, roughness: 0.2 });
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 25, 8), mMat);
            pole.position.y = 12.5; pole.castShadow = true; pole.receiveShadow = true; tGroup.add(pole);
            const nMat = new THREE.MeshStandardMaterial({ color: biome.tc, emissive: biome.tc, emissiveIntensity: 1.0 });
            const ring1 = new THREE.Mesh(new THREE.TorusGeometry(3.5, 0.5, 8, 16), nMat);
            ring1.position.y = 18; ring1.rotation.x = Math.PI / 2; tGroup.add(ring1);
            const ring2 = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.5, 8, 16), nMat);
            ring2.position.y = 22; ring2.rotation.x = Math.PI / 2; tGroup.add(ring2);
          }
          else if (biome.tree === 'grave') {
            const gMat = new THREE.MeshStandardMaterial({ color: biome.tc, roughness: 0.9 });
            const base = new THREE.Mesh(new THREE.BoxGeometry(10, 4, 6), gMat);
            base.position.y = 2; base.castShadow = true; base.receiveShadow = true; tGroup.add(base);
            const stone = new THREE.Mesh(new THREE.BoxGeometry(8, 14, 4), gMat);
            stone.position.y = 11; stone.castShadow = true; stone.receiveShadow = true; tGroup.add(stone);
            const top = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 4, 16), gMat);
            top.position.y = 18; top.rotation.x = Math.PI / 2; top.castShadow = true; tGroup.add(top);
            const crossMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
            const cx = new THREE.Mesh(new THREE.BoxGeometry(5, 1.5, 4.5), crossMat);
            cx.position.y = 15; tGroup.add(cx);
            const cy = new THREE.Mesh(new THREE.BoxGeometry(1.5, 7, 4.5), crossMat);
            cy.position.y = 15; tGroup.add(cy);
          }
          else if (biome.tree === 'labPillar') {
            const pMat = new THREE.MeshStandardMaterial({ color: biome.tr, roughness: 0.5, metalness: 0.5 });
            const base = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 20, 16), pMat);
            base.position.y = 10; base.castShadow = true; base.receiveShadow = true; tGroup.add(base);
            const capMat = new THREE.MeshStandardMaterial({ color: biome.tc, roughness: 0.7 });
            const cap1 = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 2, 16), capMat);
            cap1.position.y = 5; tGroup.add(cap1);
            const cap2 = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 2, 16), capMat);
            cap2.position.y = 15; tGroup.add(cap2);
            const glassMat = new THREE.MeshPhysicalMaterial({ color: biome.lem, transparent: true, opacity: 0.6, roughness: 0.1, emissive: biome.lem, emissiveIntensity: 0.5 });
            const glass = new THREE.Mesh(new THREE.CylinderGeometry(4.8, 4.8, 8, 16), glassMat);
            glass.position.y = 10; tGroup.add(glass);
          }

          tGroup.position.set(x, 0, z);
          const scale = (0.8 + Math.random() * 0.6) * 1.8;
          tGroup.scale.setScalar(scale);
          tGroup.rotation.y = Math.random() * Math.PI;
          worldGroup.add(tGroup);

          // Visual bounding radius per object type (local-space, unscaled)
          // pine cone root r=8; cactus arm ~9.74 units; rock 2nd stone (6,4,0)+r8=14
          const _baseR = { pine: 5.5, cactus: 7, rock: 10, balls: 7, crystal: 5.5, neon: 2.5, grave: 4, labPillar: 4 };
          gameState.entities.trees.push({ x: x, z: z, radius: (_baseR[biome.tree] || 10) * scale, group: tGroup });
        }

        gameState.entities.barrels = [];

        // --- POWERUP GLASS BOXES ---
        gameState.entities.powerupBoxes = [];
        gameState.entities.diamonds = [];
        gameState.levelTime = 0;
        gameState.boxSpawnTimes = [];
        gameState.lightningSpawnTimes = [];
        gameState.diamondSpawnTimes = [];
        gameState.bombBoxTimer = 30;


        gameState.entities.powerups = [];

        // No cage/girl/dynamite in multiplayer mode
        if (gameState.mpCageSkip) {
          cagedGirl = null;
          gameState.cagePos = null;
          if (_origMathRand) { Math.random = _origMathRand; _origMathRand = null; }
        } else {
          // Rastgele kafes konumu
          (function pickCagePosition() {
            const RANGE = 100;
            const MIN_CENTER = 25;
            for (let att = 0; att < 40; att++) {
              const cx = (Math.random() - 0.5) * RANGE * 2;
              const cz = (Math.random() - 0.5) * RANGE * 2;
              if (Math.hypot(cx, cz) < MIN_CENTER) continue;
              const nearLake = gameState.lakes.some(lk => Math.hypot(cx - lk.x, cz - lk.z) < lk.r + 30);
              const nearTree = gameState.entities.trees.some(tr => Math.hypot(cx - tr.x, cz - tr.z) < tr.radius + 15);
              if (!nearLake && !nearTree) { gameState.cagePos = { x: cx, z: cz }; return; }
            }
            gameState.cagePos = { x: 0, z: 50 };
          })();

          // Girl character in cage
          cagedGirl = null;
          spawnCagedGirl();

          // ===== FUSE — WAVY + SPARKY =====
          (function buildFuse() {
            const cp = gameState.cagePos;

            // Different wave parameters each level
            const wAmp = 4 + Math.random() * 6;          // wave amplitude
            const wFreq = 1.2 + Math.random() * 1.8;      // wave frequency
            const wPhase = Math.random() * Math.PI * 2;    // rastgele faz

            fuseLinePts = [];

            // Dynamite world position: in front of cage door (25.6 units toward origin)
            const cDist = Math.hypot(cp.x, cp.z) || 1;
            const dynWX = cp.x - (cp.x / cDist) * 25.6;
            const dynWZ = cp.z - (cp.z / cDist) * 25.6;

            // Fuse: map edge → dynamite (flat wavy, ground level)
            const steps = 120;
            const mainDX = dynWX - 170, mainDZ = dynWZ - cp.z;
            const mainLen = Math.hypot(mainDX, mainDZ) || 1;
            const nx = -mainDZ / mainLen, nz = mainDX / mainLen; // perpendicular direction
            for (let i = 0; i <= steps; i++) {
              const t = i / steps;
              const x = 170 + mainDX * t;
              const z = cp.z + mainDZ * t;
              const wave = Math.sin(t * Math.PI * wFreq * 2 + wPhase) * wAmp;
              const y = 1.5 + Math.abs(Math.sin(t * Math.PI * wFreq + wPhase * 0.7)) * 1.2;
              fuseLinePts.push(new THREE.Vector3(x + nx * wave, y, z + nz * wave));
            }

            // Fuse line — dark brown rope
            const fuseGeo = new THREE.BufferGeometry().setFromPoints(fuseLinePts);
            const fuseLine = new THREE.Line(fuseGeo,
              new THREE.LineBasicMaterial({ color: 0x3b1a08, linewidth: 3 })
            );
            worldGroup.add(fuseLine);

            // ── KIVILCIM GRUBU ───────────────────────────────────────────────────
            const sparkGroup = new THREE.Group();

            // White hot center
            const core = new THREE.Mesh(
              new THREE.SphereGeometry(0.3, 8, 8),
              new THREE.MeshBasicMaterial({ color: 0xffffff })
            );
            sparkGroup.add(core);

            // Yellow inner halo
            const haloIn = new THREE.Mesh(
              new THREE.SphereGeometry(0.55, 8, 8),
              new THREE.MeshBasicMaterial({ color: 0xffee00, transparent: true, opacity: 0.75 })
            );
            sparkGroup.add(haloIn);

            // Orange outer halo
            const haloOut = new THREE.Mesh(
              new THREE.SphereGeometry(0.875, 8, 8),
              new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.35 })
            );
            sparkGroup.add(haloOut);

            // Star rays — 8 cones in XZ plane (4 long + 4 short alternating)
            const rayGroup = new THREE.Group();
            for (let i = 0; i < 8; i++) {
              const angle = (i / 8) * Math.PI * 2;
              const isMain = i % 2 === 0;
              const rLen = isMain ? 1.875 : 1.125;
              const rRadius = isMain ? 0.14 : 0.09;
              const ray = new THREE.Mesh(
                new THREE.ConeGeometry(rRadius, rLen, 4),
                new THREE.MeshBasicMaterial({ color: isMain ? 0xff8800 : 0xffcc00, transparent: true, opacity: isMain ? 0.9 : 0.7 })
              );
              ray.rotation.z = Math.PI / 2;
              ray.position.set(Math.cos(angle) * (rLen / 2 + 0.75), 0, Math.sin(angle) * (rLen / 2 + 0.75));
              ray.rotation.order = 'YXZ';
              ray.rotation.y = -angle;
              rayGroup.add(ray);
            }
            // Diagonal 4 rays (45° up-down)
            for (let i = 0; i < 4; i++) {
              const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
              const ray = new THREE.Mesh(
                new THREE.ConeGeometry(0.1, 1.375, 4),
                new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.65 })
              );
              ray.rotation.z = Math.PI / 4;
              ray.position.set(Math.cos(angle) * 0.875, Math.sin(angle) * 0.875, 0);
              ray.rotation.order = 'YXZ';
              ray.rotation.y = -angle;
              rayGroup.add(ray);
            }
            sparkGroup.add(rayGroup);

            // Flying spark particles
            const SPARK_N = 24;
            const sparkPos = new Float32Array(SPARK_N * 3);
            for (let i = 0; i < SPARK_N * 3; i++) sparkPos[i] = (Math.random() - 0.5) * 2.5;
            const sparkBuf = new THREE.BufferGeometry();
            const sparkAttr = new THREE.BufferAttribute(sparkPos, 3);
            sparkBuf.setAttribute('position', sparkAttr);
            const sparkPts = new THREE.Points(sparkBuf,
              new THREE.PointsMaterial({
                color: 0xffdd44, size: 0.275, sizeAttenuation: true,
                transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false
              })
            );
            sparkGroup.add(sparkPts);

            // Flickering light
            const sLight = new THREE.PointLight(0xffaa00, 180, 220);
            sparkGroup.add(sLight);

            // Animation references in userData
            sparkGroup.userData.rayGroup = rayGroup;
            sparkGroup.userData.sLight = sLight;
            sparkGroup.userData.sparkAttr = sparkAttr;
            sparkGroup.userData.haloIn = haloIn;
            sparkGroup.userData.haloOut = haloOut;

            sparkGroup.position.copy(fuseLinePts[0]);
            worldGroup.add(sparkGroup);
            fuseBallMesh = sparkGroup;
          })();
          if (_origMathRand) { Math.random = _origMathRand; _origMathRand = null; }
        } // end else (single player cage/fuse block)
        // ===== FUSE END =====


        // Spawn startZombies zombies at game start across 4 edges
        const spd = LEVELS[levelIndex - 1].zombieSpeed;
        const startCount = LEVELS[levelIndex - 1].startZombies || 4;
        for (let i = 0; i < startCount; i++) {
          const side = i % 4;
          let sx = 0, sz = 0;
          if (side === 0) { sx = -arenaBounds; sz = (Math.random() - 0.5) * arenaBounds * 1.6; }
          else if (side === 1) { sx = arenaBounds; sz = (Math.random() - 0.5) * arenaBounds * 1.6; }
          else if (side === 2) { sz = -arenaBounds; sx = (Math.random() - 0.5) * arenaBounds * 1.6; }
          else { sz = arenaBounds; sx = (Math.random() - 0.5) * arenaBounds * 1.6; }
          spawnZombieAt(sx, sz, spd);
          gameState.zombiesSpawned = (gameState.zombiesSpawned || 0) + 1;
        }

      }

      initPlayer(players[0]);
      initPlayer(players[1]);
      players[1].group.visible = false; // Hidden until multiplayer is selected

      // ========== GIRL CHARACTER + CAGE — IN GAME SCENE ==========
      let cagedGirl = null; // { head, lArm, rArm, group }
      let fuseBallMesh = null;  // moving fireball on fuse
      let fuseLinePts = [];     // fuse points (dynamite to cage)
      let rescueLight = null;   // yellow light in front of cage (appears on level complete)
      let rescueRing = null;   // glowing yellow ring on ground

      function spawnCagedGirl() {
        // Blue transparent glass
        const glassMat = new THREE.MeshPhysicalMaterial({
          color: 0x88ccff, roughness: 0.0, metalness: 0.0,
          transparent: true, opacity: 0.22,
          transmission: 0.92, thickness: 2.5, ior: 1.5,
          depthWrite: false, side: THREE.DoubleSide
        });
        // Brown wooden frame (joint lines)
        const frameMat = new THREE.MeshStandardMaterial({ color: 0x5d3a1a, roughness: 0.9 });
        const frameMatDark = new THREE.MeshStandardMaterial({ color: 0x3e2005, roughness: 1.0 });

        // Cage dimensions
        const cW = 18, cH = 24, cD = 16;
        const root = new THREE.Group();

        // Glass floor + ceiling panel
        const floor = new THREE.Mesh(new THREE.BoxGeometry(cW, 1.2, cD), glassMat);
        floor.position.y = -0.6; root.add(floor);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(cW, 1.2, cD), glassMat);
        roof.position.y = cH + 0.6; root.add(roof);

        // Brown corner posts (frame joints)
        [[-cW / 2, -cD / 2], [cW / 2, -cD / 2], [-cW / 2, cD / 2], [cW / 2, cD / 2]].forEach(([x, z]) => {
          const post = new THREE.Mesh(new THREE.BoxGeometry(1.8, cH + 2, 1.8), frameMat);
          post.position.set(x, cH / 2, z); root.add(post);
        });

        // Horizontal brown frame strips (top + bottom edges)
        [[0], [cH]].forEach(([y]) => {
          const bx = new THREE.Mesh(new THREE.BoxGeometry(cW + 2, 1.4, 1.4), frameMat);
          bx.position.set(0, y, -cD / 2); root.add(bx);
          const bx2 = bx.clone(); bx2.position.set(0, y, cD / 2); root.add(bx2);
          const bz = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, cD + 2), frameMat);
          bz.position.set(-cW / 2, y, 0); root.add(bz);
          const bz2 = bz.clone(); bz2.position.set(cW / 2, y, 0); root.add(bz2);
        });

        // Middle horizontal brown strip (cH*0.45)
        [cH * 0.45].forEach(y => {
          [-(cD / 2), cD / 2].forEach(z => {
            const b = new THREE.Mesh(new THREE.BoxGeometry(cW + 2, 1.2, 1.2), frameMatDark);
            b.position.set(0, y, z); root.add(b);
          });
          [-(cW / 2), cW / 2].forEach(x => {
            const b = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, cD + 2), frameMatDark);
            b.position.set(x, y, 0); root.add(b);
          });
        });

        // Blue glass bars — vertical panels on two faces
        const frontDoorBars = [];
        [-6, -3, 0, 3, 6].forEach(x => {
          [-(cD / 2), cD / 2].forEach(z => {
            const b = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, cH - 1, 8), glassMat);
            b.position.set(x, cH / 2, z); root.add(b);
            if (z === cD / 2 && (x === -3 || x === 0 || x === 3)) frontDoorBars.push(b);
          });
        });
        [-4, 0, 4].forEach(z => {
          [-(cW / 2), cW / 2].forEach(x => {
            const b = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, cH - 1, 8), glassMat);
            b.position.set(x, cH / 2, z); root.add(b);
          });
        });

        // ── DYNAMITE (on top of cage, HORIZONTAL) ────────────────────────────────
        const dynGroup = new THREE.Group();

        const stickMat2 = new THREE.MeshStandardMaterial({ color: 0xcc1111, roughness: 0.75 });
        const strapMat2 = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
        const timerMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.5 });
        const screenMat = new THREE.MeshStandardMaterial({ color: 0x001500, emissive: 0x00dd00, emissiveIntensity: 2.5, roughness: 0.4 });
        const ledGreen = new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x00ff00, emissiveIntensity: 3.5 });
        const ledOrange = new THREE.MeshStandardMaterial({ color: 0xff6600, emissive: 0xff6600, emissiveIntensity: 3.5 });

        // 7 dynamite sticks — VERTICAL (along Y axis, standing in front of door)
        const sR = 1.35, sH = 11;
        const hexXZ = [[0, 0], [2.7, 0], [1.35, 2.34], [-1.35, 2.34], [-2.7, 0], [-1.35, -2.34], [1.35, -2.34]];
        hexXZ.forEach(([ox, oz]) => {
          const stick = new THREE.Mesh(new THREE.CylinderGeometry(sR, sR, sH, 10), stickMat2);
          stick.position.set(ox, sH / 2, oz);
          dynGroup.add(stick);
        });

        // Siyah bantlar (2 adet) — dinamit demetini saran halka
        [sH * 0.25, sH * 0.72].forEach(y => {
          const strap = new THREE.Mesh(new THREE.CylinderGeometry(4.08, 4.08, 1.1, 16, 1, false), strapMat2);
          strap.position.y = y;
          dynGroup.add(strap);
        });

        // Timer box — visible on front face (Z+ direction, readable top-down)
        const tBox = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.5, sH * 0.55), timerMat);
        tBox.position.set(0, sH * 0.75, 4.5);
        dynGroup.add(tBox);

        // LCD ekran
        const tScreen = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.25, sH * 0.42), screenMat);
        tScreen.position.set(0, sH * 0.75 + 0.9, 4.6);
        dynGroup.add(tScreen);

        // Small LED dots
        const lGr = new THREE.Mesh(new THREE.SphereGeometry(0.24, 6, 6), ledGreen);
        lGr.position.set(-0.9, sH * 0.75 + 0.92, 3.0); dynGroup.add(lGr);
        const lOr = new THREE.Mesh(new THREE.SphereGeometry(0.24, 6, 6), ledOrange);
        lOr.position.set(0.9, sH * 0.75 + 0.92, 3.0); dynGroup.add(lOr);

        // Dynamite red glow light
        const dynLight = new THREE.PointLight(0xff2200, 80, 150);
        dynLight.position.set(0, sH / 2, 0);
        dynGroup.add(dynLight);

        // Place in front of door (z = +cD/2 outside, standing on ground)
        dynGroup.position.set(0, 0, cD / 2 + 8);
        root.add(dynGroup);

        // --- GIRL CHARACTER (exact same geometries as player) ---
        const girl = new THREE.Group();
        const gSkin = new THREE.MeshStandardMaterial({ color: 0xffccaa, roughness: 0.5 });
        const gDress = new THREE.MeshStandardMaterial({ color: 0xe91e63, roughness: 0.7 });
        const gSkirt = new THREE.MeshStandardMaterial({ color: 0xad1457, roughness: 0.7 });
        const gHair = new THREE.MeshStandardMaterial({ color: 0x4a148c, roughness: 0.8 });

        // Head — same as geoCache.head: SphereGeometry(4.0)
        const head = new THREE.Mesh(new THREE.SphereGeometry(4.0, 16, 16), gSkin);
        head.position.y = 11.5; head.castShadow = true; girl.add(head);

        // Hair — upper hemisphere (SphereGeometry(4.2) upper half)
        const hairTop = new THREE.Mesh(new THREE.SphereGeometry(4.25, 14, 14, 0, Math.PI * 2, 0, Math.PI / 2), gHair);
        hairTop.position.y = 1.0; head.add(hairTop);
        // Long hair extending backward
        const hairBack = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 1.1, 8, 8), gHair);
        hairBack.position.set(0, -4.5, -1.0); hairBack.rotation.x = -0.1; head.add(hairBack);
        // Side hair
        [-1, 1].forEach(s => {
          const st = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.4, 6, 6), gHair);
          st.position.set(s * 3.3, -4.0, 0); st.rotation.z = s * 0.22; head.add(st);
        });

        // Eyes — same as geoCache.eye: SphereGeometry(0.8)
        [-1.5, 1.5].forEach(ox => {
          const eye = new THREE.Mesh(new THREE.SphereGeometry(0.8, 10, 10), new THREE.MeshStandardMaterial({ color: 0x1a237e }));
          eye.position.set(ox, 0.5, 3.5); head.add(eye);
          const shine = new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
          shine.position.set(ox + 0.25, 0.8, 3.8); head.add(shine);
        });

        // Body — same as player CapsuleGeometry(3.8, 5.0) but pink
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(3.8, 5.0, 10, 10), gDress);
        body.position.y = 7.0; body.castShadow = true; girl.add(body);

        // Skirt — cone below body
        const skirtMesh = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 7.5, 6.0, 14), gSkirt);
        skirtMesh.position.y = 3.2; girl.add(skirtMesh);

        // Arms — same as player CapsuleGeometry(1.4, 5.0) + translate
        const lArm = new THREE.Mesh(new THREE.CapsuleGeometry(1.4, 5.0, 8, 8), gSkin);
        lArm.geometry = lArm.geometry.clone(); lArm.geometry.translate(0, -2.5, 0);
        lArm.position.set(-4.2, 9.5, 0); lArm.castShadow = true; girl.add(lArm);

        const rArm = new THREE.Mesh(new THREE.CapsuleGeometry(1.4, 5.0, 8, 8), gSkin);
        rArm.geometry = rArm.geometry.clone(); rArm.geometry.translate(0, -2.5, 0);
        rArm.position.set(4.2, 9.5, 0); rArm.castShadow = true; girl.add(rArm);

        // Legs — same as geoCache.leg CapsuleGeometry(1.6, 5.5) + translate
        [-1.8, 1.8].forEach(x => {
          const leg = new THREE.Mesh(new THREE.CapsuleGeometry(1.6, 5.5, 8, 8), gSkin);
          leg.geometry = leg.geometry.clone(); leg.geometry.translate(0, -2.75, 0);
          leg.position.set(x, 3.0, 0); girl.add(leg);
        });

        girl.position.set(0, 0, 0);
        root.add(girl);

        // Different position each level — from gameState.cagePos
        const cp = gameState.cagePos;
        root.scale.setScalar(1.6);
        root.position.set(cp.x, 0, cp.z);
        root.rotation.y = Math.atan2(cp.x, cp.z) + Math.PI;

        worldGroup.add(root);
        cagedGirl = { group: root, girl, head, lArm, rArm, frontDoorBars, dynGroup };
      }
      // ============================================================

      const keys = {};
      window.addEventListener('keydown', e => { keys[e.code] = true; });
      window.addEventListener('keyup', e => { keys[e.code] = false; });

      // ── Touch input ──
      const touch = { vx: 0, vz: 0, fire: false, dash: false };
      const tcEl = document.getElementById('touch-controls');
      const jBase = document.getElementById('joystick-base');
      const jKnob = document.getElementById('joystick-knob');
      const btnFire = document.getElementById('btn-fire');
      const btnDash = document.getElementById('btn-dash');
      const MAX_R = 48;
      const LOCK_THRESHOLD = MAX_R * 0.92; // 92% of edge = "snap lock" zone
      let jTouchId = null, jCX = 0, jCY = 0;
      let _jAtEdge = false, _jLocked = false, _jLockedKx = 0, _jLockedKy = 0;

      const JOY_DEADZONE = 7;

      function joystickReset() {
        jTouchId = null;
        if (_jAtEdge) {
          // Was at edge → lock direction, knob stays at edge
          _jLocked = true;
          jKnob.style.transform = `translate(calc(-50% + ${_jLockedKx}px), calc(-50% + ${_jLockedKy}px))`;
          // touch.vx / touch.vz kept as-is
        } else {
          // Not at edge → stop, center knob, clear lock
          _jLocked = false;
          touch.vx = 0; touch.vz = 0;
          jKnob.style.transform = 'translate(-50%,-50%)';
        }
        _jAtEdge = false;
      }

      // Knob starts centered
      jKnob.style.cssText += '; left:50%; top:50%; transform:translate(-50%,-50%);';

      jBase.addEventListener('touchstart', e => {
        e.preventDefault();
        if (jTouchId !== null) return;
        const t = e.changedTouches[0];
        jTouchId = t.identifier;
        // Clear any previous lock on new touch
        _jLocked = false; _jAtEdge = false;
        touch.vx = 0; touch.vz = 0;
        jKnob.style.transform = 'translate(-50%,-50%)';
        const r = jBase.getBoundingClientRect();
        jCX = r.left + r.width / 2; jCY = r.top + r.height / 2;
      }, { passive: false });

      jBase.addEventListener('touchmove', e => {
        e.preventDefault();
        for (const t of e.changedTouches) {
          if (t.identifier !== jTouchId) continue;
          const dx = t.clientX - jCX, dy = t.clientY - jCY;
          const rawDist = Math.hypot(dx, dy);
          if (rawDist < JOY_DEADZONE) {
            touch.vx = 0; touch.vz = 0;
            _jAtEdge = false;
            jKnob.style.transform = 'translate(-50%,-50%)';
          } else {
            const dist = Math.min(rawDist, MAX_R);
            const ang = Math.atan2(dy, dx);
            const kx = Math.cos(ang) * dist, ky = Math.sin(ang) * dist;
            jKnob.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;
            touch.vx = kx / MAX_R; touch.vz = ky / MAX_R;
            // Track whether we're in snap-lock zone
            _jAtEdge = rawDist >= LOCK_THRESHOLD;
            if (_jAtEdge) { _jLockedKx = kx; _jLockedKy = ky; }
          }
        }
      }, { passive: false });

      jBase.addEventListener('touchend', e => {
        for (const t of e.changedTouches) {
          if (t.identifier === jTouchId) joystickReset();
        }
      }, { passive: false });
      jBase.addEventListener('touchcancel', joystickReset);

      btnFire.addEventListener('touchstart', e => {
        e.preventDefault();
        const p = players[0];
        const inBombMode = p && (p.wireMeter ?? 0) <= 0 && (p.bombs || 0) > 0;
        if (inBombMode) {
          if (gameMode === 'online-guest') { netState.guestBombQueued = true; }
          else { placeBomb(p); }
        } else {
          touch.fire = true;
        }
      }, { passive: false });
      btnFire.addEventListener('touchend', e => { e.preventDefault(); touch.fire = false; }, { passive: false });
      btnFire.addEventListener('click', () => {
        const p = players[0];
        const inBombMode = p && (p.wireMeter ?? 0) <= 0 && (p.bombs || 0) > 0;
        if (inBombMode) {
          if (gameMode === 'online-guest') { netState.guestBombQueued = true; }
          else { placeBomb(p); }
        }
      });
      btnDash.addEventListener('touchstart', e => { e.preventDefault(); touch.dash = true; }, { passive: false });
      btnDash.addEventListener('touchend', e => { e.preventDefault(); touch.dash = false; }, { passive: false });

      // ── Level names ─────────────────────────────────────────────────────
      const LEVEL_NAMES = [
        'Summer Forest', 'Desert', 'Volcanic', 'Dark Forest', 'Arctic',
        'Tropical Beach', 'Graveyard', 'Laboratory', 'Tundra', 'Savanna',
        'Space', 'Underwater', 'Autumn', 'Blood Lake', 'Neon City',
        'Ice Desert', 'Toxic Swamp', 'Deep Space', 'Sunset', 'Ancient Ruins',
        'Mushroom Land', 'Winter Forest', 'Lava Fields', 'Cyberpunk', 'Fairy Forest',
        'Storm', 'Coral Reef', 'Cursed Lands', 'Crystal Cave', 'Golden Plains'
      ];
      const LEVEL_ICONS = [
        '🌲', '🏜️', '🌋', '🌿', '🧊', '🏖️', '💀', '🔬', '❄️', '🦒',
        '🚀', '🐠', '🍂', '🩸', '🌆', '🌨️', '☠️', '🌌', '🌅', '🏛️',
        '🍄', '⛄', '🔥', '🤖', '🌸', '⛈️', '🐚', '👻', '💎', '🌾'
      ];

      function launchLevel(lvl) {
        // Reset joystick state so player doesn't start moving immediately
        touch.vx = 0; touch.vz = 0; touch.fire = false; touch.dash = false;
        jTouchId = null;
        jKnob.style.transform = 'translate(-50%,-50%)';
        document.getElementById('level-select').classList.remove('open');
        document.getElementById('main-menu').style.display = 'none';
        document.getElementById('main-menu').style.pointerEvents = '';
        tcEl.classList.add('active');
        document.getElementById('btn-back').style.display = 'flex';
        if (isMP()) {
          document.getElementById('mp-hud').style.display = 'block';
          startGame(lvl);
        } else {
          document.getElementById('hud').style.display = 'flex';
          document.getElementById('hud').style.flexDirection = 'row';
          startGame(lvl);
        }
      }

      function returnToMenu() {
        gameState.active = false;
        gameState.transitioning = false;
        clearWorld();
        touch.vx = 0; touch.vz = 0; touch.fire = false; touch.dash = false;
        jTouchId = null;
        jKnob.style.transform = 'translate(-50%,-50%)';
        tcEl.classList.remove('active');
        document.getElementById('hud').style.display = 'none';
        document.getElementById('mp-hud').style.display = 'none';
        document.getElementById('btn-back').style.display = 'none';
        cleanupOnlineSession();
        const mm = document.getElementById('main-menu');
        mm.style.display = '';
        mm.style.pointerEvents = '';
        gameMode = 'single';
        _hideGameOver();
        startMusicIfEnabled();
      }

      document.getElementById('btn-back').addEventListener('click', returnToMenu);

      // ── NETWORK MODULE INIT (called after all game functions are defined) ────
      // see bottom of file for initNetwork({...}) call

      function _serializeState() {
        // High-frequency compact state
        const sZombies = [];
        const zs = gameState.entities.zombies;
        for (let i = 0; i < zs.length; i++) {
          const z = zs[i];
          if (!z.active) continue;
          // [id, x, z, rot, hp, shocked, falling, team, dropCode]
          // dropCode: 0=none, 1=bomb, 2=wire, 3=shield
          const _dc = z.dropType === 'bomb' ? 1 : z.dropType === 'wire' ? 2 : z.dropType === 'shield' ? 3 : 0;
          sZombies.push([
            z._netId,
            Math.round(z.group.position.x * 10) / 10,
            Math.round(z.group.position.z * 10) / 10,
            Math.round(z.group.rotation.y * 100) / 100,
            z.hp,
            z.shocked ? 1 : 0,
            z.isFalling ? 1 : 0,
            z.teamIdx,
            _dc
          ]);
        }

        const sPlayers = [];
        for (let i = 0; i < players.length; i++) {
          const p = players[i];
          const wPts = (p.isDrawingWire && p.wirePoints.length >= 2)
            ? p.wirePoints.map(wp => [Math.round(wp.x), Math.round(wp.z)]) : null;
          // [x, z, alive, sinking, dashing, rot, wireFlag, wirePoints, score, zombiesLeft, inBombPhase, activeBombCount, shields]
          sPlayers.push([
            Math.round(p.x * 10) / 10,
            Math.round(p.z * 10) / 10,
            p.alive ? 1 : 0,
            p.sinking ? 1 : 0,
            p.isDashing ? 1 : 0,
            Math.round(p.group.rotation.y * 100) / 100,
            p.isDrawingWire ? 1 : 0,
            wPts,
            p.score || 0,
            p.zombiesLeft || 0,
            p.inBombPhase ? 1 : 0,
            p.activeBombCount || 0,
            p.shields || 0
          ]);
        }

        const sBombs = [];
        const abs = activeBombs;
        for (let i = 0; i < abs.length; i++) {
          const b = abs[i];
          if (b.done) continue;
          sBombs.push([Math.round(b.group.position.x), Math.round(b.group.position.z), Math.round(b.fuseTimer * 10) / 10]);
        }

        const sBarrels = [];
        const brs = gameState.entities.barrels;
        for (let i = 0; i < brs.length; i++) {
          if (brs[i].active) sBarrels.push(i);
        }

        const sFlowers = gameState.entities.flowers.map(f => f.active ? 1 : 0);

        // Arbalest cannon arrows in flight
        const sCannons = [];
        for (let i = 0; i < cannons.length; i++) {
          const c = cannons[i];
          if (!c.active) continue;
          sCannons.push([i, Math.round(c.ballX), Math.round(c.ballZ), c.ball.visible ? 1 : 0]);
        }

        // Wall cannon sweeps + balls
        const sWallCannons = [];
        for (let i = 0; i < wallCannons.length; i++) {
          const wc = wallCannons[i];
          if (!wc.active) continue;
          sWallCannons.push([i,
            Math.round(wc.sweepAngle * 100) / 100,
            Math.round(wc.ballX), Math.round(wc.ballZ),
            wc.ballFlying ? 1 : 0,
            Math.round(wc.ball.position.y)
          ]);
        }

        // Flush one-shot events
        const sEvents = netState.netEvents.length ? netState.netEvents.splice(0) : undefined;

        return JSON.stringify({
          t: 's',
          p: sPlayers,
          z: sZombies,
          b: sBombs,
          ba: sBarrels,
          k: gameState.kills,
          tm: Math.round(gameState.levelTime),
          fl: sFlowers,
          cn: sCannons,
          wn: sWallCannons,
          ev: sEvents,
          fz: Math.round(Math.max(0, gameState.freezeTimer) * 10) / 10
        });
      }

      function applyGuestState(msg) {
        if (!msg) return;

        // Interpolated update for players
        if (msg.p) {
          for (let i = 0; i < msg.p.length; i++) {
            const pd = msg.p[i]; // [x, z, alive, sinking, dashing, rot, wireFlag, wirePoints]
            const p = players[i];
            if (!p) continue;

            const isLocalGuest = (i === 1 && gameMode === 'online-guest');

            if (isLocalGuest) {
              // Guest's own player (P2): never overwrite isDrawingWire from host —
              // local self-prediction owns wire state; overwriting causes a race condition
              // where _sendGuestInput reads the stale host value and sends fi:false,
              // immediately cancelling the wire the guest just started.
              p.alive = !!pd[2]; p.sinking = !!pd[3]; p.isDashing = !!pd[4];
              const snapDist = Math.hypot(pd[0] - p.x, pd[1] - p.z);
              if (snapDist > 100) { p.x = pd[0]; p.z = pd[1]; if (p.group) p.group.position.set(p.x, 0, p.z); }
            } else {
              p._targetX = pd[0]; p._targetZ = pd[1];
              p.alive = !!pd[2];
              p.sinking = !!pd[3];
              p.isDashing = !!pd[4];
              p._gFaceY = pd[5];
              p.isDrawingWire = !!pd[6];
            }

            const wPts = pd[7];
            if (pd[8] !== undefined) p.score = pd[8];
            if (pd[9] !== undefined) p.zombiesLeft = pd[9];
            if (pd[10] !== undefined) {
              const wasPhase = p.inBombPhase;
              p.inBombPhase = !!pd[10];
              if (!wasPhase && p.inBombPhase) {
                const label = i === 0 ? 'HOST' : 'GUEST';
                _el('mp-phase-label').textContent = label + ' BOMB PHASE!';
              }
            }
            if (pd[11] !== undefined) p.activeBombCount = pd[11];
            if (pd[12] !== undefined) { p.shields = pd[12]; p.shield = pd[12] > 0; }

            if (p.group) {
              p.group.visible = p.alive || p.sinking;
            }

            // Wire sync logic — skip for local guest (uses self-prediction wire)
            if (!isLocalGuest && p.isDrawingWire && wPts && wPts.length >= 2) {
              if (p.wireMesh) {
                p.wireMesh.visible = true;
                const prevLen = p._gWLen || 0;
                if (wPts.length !== prevLen) {
                  const vPts = wPts.map(pt => new THREE.Vector3(pt[0], 0, pt[1]));
                  const curve = new THREE.CatmullRomCurve3(vPts);
                  if (p.wireMesh.geometry) p.wireMesh.geometry.dispose();
                  p.wireMesh.geometry = new THREE.TubeGeometry(curve, Math.max(wPts.length * 2, 8), 2.5, 6, false);
                  if (p.wireOuterMesh.geometry) p.wireOuterMesh.geometry.dispose();
                  p.wireOuterMesh.geometry = new THREE.TubeGeometry(curve, Math.max(wPts.length * 2, 8), 3.2, 6, false);
                  p._gWLen = wPts.length;
                  if (p.startMarker) { p.startMarker.position.set(wPts[0][0], 3.5, wPts[0][1]); p.startMarker.visible = true; }
                }
              }
            } else if (!isLocalGuest) {
              // Hide wire for remote P1 when not drawing
              if (p.wireMesh) p.wireMesh.visible = false;
              if (p.wireOuterMesh) p.wireOuterMesh.visible = false;
              if (p.startMarker) p.startMarker.visible = false;
              p._gWLen = 0;
            }
          }
        }

        // Interpolated update for zombies
        if (msg.z) {
          const seenIds = new Set();
          for (let i = 0; i < msg.z.length; i++) {
            const zd = msg.z[i]; // [id, x, z, rot, hp, shocked, falling, team]
            const zid = zd[0];
            seenIds.add(zid);
            let z = guestZombieMap.get(zid);
            if (!z || !z.active) {
              z = spawnZombieAt(zd[1], zd[2], gameConfig.zombies.baseSpeed);
              if (z) { z._netId = zid; guestZombieMap.set(zid, z); }
            }
            if (z && z.group) {
              z._tX = zd[1]; z._tZ = zd[2]; // Target positions for lerp
              z._tR = zd[3];
              z.hp = zd[4];
              const prevShocked = z.shocked;
              z.shocked = !!zd[5];
              z.isFalling = !!zd[6];
              z.teamIdx = zd[7];
              if (z._teamCapMesh) {
                z._teamCapMesh.visible = isMP() && z.teamIdx >= 0;
                if (z._teamCapMesh.visible) {
                  const cc = z.teamIdx === 0 ? 0x1565c0 : 0xc62828;
                  z._teamCapMesh.material.color.setHex(cc);
                  z._teamCapMesh.material.emissive.setHex(cc);
                }
              }
              // Sync drop indicator
              const _dropNames = [null, 'bomb', 'wire', 'shield'];
              const _newDrop = _dropNames[zd[8] || 0];
              if (z._dropMeshes && z.dropType !== _newDrop) {
                z.dropType = _newDrop;
                Object.values(z._dropMeshes).forEach(m => { m.visible = false; });
                if (_newDrop && z._dropMeshes[_newDrop]) z._dropMeshes[_newDrop].visible = true;
              }
              // Shocked material transition
              if (z.shocked !== prevShocked) {
                if (z.shocked) {
                  z.group.traverse(c => {
                    if (c.isMesh && !c.userData.isOutline) {
                      const sm = (c.userData.origMat || c.material).clone();
                      sm.emissive = new THREE.Color(0x00e5ff); sm.emissiveIntensity = 3.0;
                      c.material = sm; c.userData.shockMat = sm;
                    }
                  });
                  z.group.traverse(c => { if (c.userData.isOutline) c.visible = true; });
                } else {
                  z.group.traverse(c => {
                    if (c.isMesh && !c.userData.isOutline && c.userData.origMat) {
                      c.material = c.userData.origMat; c.userData.shockMat = null;
                    }
                  });
                  z.group.traverse(c => { if (c.userData.isOutline) c.visible = false; });
                }
              }
            }
          }
          guestZombieMap.forEach((z, id) => {
            if (!seenIds.has(id)) { z.active = false; z.group.visible = false; guestZombieMap.delete(id); }
          });
          // Hide any leftover locally-spawned zombies not tracked by network
          gameState.entities.zombies.forEach(z => {
            if (z.active && (!z._netId || !seenIds.has(z._netId))) {
              z.active = false; if (z.group) z.group.visible = false;
            }
          });
        }

        // Active ground bombs — create/update/remove meshes on guest
        if (msg.b !== undefined) {
          const currentKeys = new Set();
          (msg.b || []).forEach(bd => {
            const key = bd[0] + ':' + bd[1];
            currentKeys.add(key);
            if (!guestBombMap.has(key)) guestBombMap.set(key, _buildGuestBombMesh(bd[0], bd[1]));
            const bm = guestBombMap.get(key);
            const prog = 1 - Math.max(0, bd[2]) / (gameConfig.bombs.fuseTime || 5);
            bm.spark.position.set(3.2 - prog * 1.8, 16.2 - prog * 2.5, 0);
            bm.sparkLight.position.copy(bm.spark.position);
          });
          guestBombMap.forEach((bm, key) => {
            if (!currentKeys.has(key)) { worldGroup.remove(bm.group); guestBombMap.delete(key); }
          });
        }

        if (msg.ba) {
          const brs = gameState.entities.barrels;
          const activeSet = new Set(msg.ba);
          for (let i = 0; i < brs.length; i++) {
            const isActive = activeSet.has(i);
            if (brs[i].active && !isActive) createSharedExplosion(brs[i].mesh.position.clone(), 40);
            brs[i].active = isActive;
            brs[i].mesh.visible = isActive;
          }
        }

        if (msg.fl && gameState.entities && gameState.entities.flowers) {
          const fls = gameState.entities.flowers;
          for (let i = 0; i < Math.min(msg.fl.length, fls.length); i++) {
            if (!msg.fl[i] && fls[i].active) { fls[i].active = false; fls[i].mesh.visible = false; }
          }
        }

        // Arbalest cannon arrows
        if (msg.cn !== undefined) {
          const activeSet = new Set(msg.cn.map(cd => cd[0]));
          cannons.forEach((c, i) => {
            if (!c.active) return;
            const cd = msg.cn.find(d => d[0] === i);
            if (cd) { c.ball.visible = !!cd[3]; if (cd[3]) c.ball.position.set(cd[1], 8, cd[2]); }
            else c.ball.visible = false;
          });
        }

        // Wall cannon sweeps + balls
        if (msg.wn !== undefined) {
          wallCannons.forEach((wc, i) => {
            if (!wc.active) return;
            const wd = msg.wn.find(d => d[0] === i);
            if (wd) {
              wc.pivot.rotation.y = wd[1];
              wc.ball.visible = !!wd[4];
              if (wd[4]) wc.ball.position.set(wd[2], wd[5], wd[3]);
              else wc.shadowMesh.visible = false;
            } else { wc.ball.visible = false; wc.shadowMesh.visible = false; }
          });
        }

        // One-shot events (explosions, floating texts)
        if (msg.ev) {
          msg.ev.forEach(ev => {
            if (ev.t === 'exp') createSharedExplosion(new THREE.Vector3(ev.x, 0, ev.z), ev.r);
            else if (ev.t === 'txt') showFloatingText(new THREE.Vector3(ev.x, ev.y, ev.z), ev.msg, ev.c);
            else if (ev.t === 'scatter') { playSfx('bone'); createSmokePuff(new THREE.Vector3(ev.x, 0, ev.z)); }
          });
        }

        if (msg.fz !== undefined) gameState.freezeTimer = msg.fz;
        if (msg.k !== undefined) gameState.kills = msg.k;
        if (msg.tm !== undefined) gameState.levelTime = msg.tm;
        updateHUD(gameState, players); if (isMP()) updateMpHud(gameState, players, gameMode);
      }

      function _sendGuestInput() {
        let vx = 0, vz = 0;
        if (keys['KeyW'] || keys['ArrowUp']) vz -= 1;
        if (keys['KeyS'] || keys['ArrowDown']) vz += 1;
        if (keys['KeyA'] || keys['ArrowLeft']) vx -= 1;
        if (keys['KeyD'] || keys['ArrowRight']) vx += 1;
        vx += touch.vx; vz += touch.vz;
        const len = Math.hypot(vx, vz); if (len > 1) { vx /= len; vz /= len; }
        const p2 = players[1];
        const fi = !!(p2.isDrawingWire);
        const da = !!(keys['ShiftLeft'] || keys['ShiftRight'] || touch.dash);
        const bm = !!netState.guestBombQueued; netState.guestBombQueued = false;
        const wPts = (fi && p2.wirePoints && p2.wirePoints.length >= 2)
          ? p2.wirePoints.map(wp => [Math.round(wp.x), Math.round(wp.z)]) : null;
        const _im = JSON.stringify({
          t: 'input',
          vx: +vx.toFixed(2), vz: +vz.toFixed(2),
          fi, da, bm,
          px: Math.round(p2.x * 10) / 10,
          pz: Math.round(p2.z * 10) / 10,
          rot: Math.round((p2.group ? p2.group.rotation.y : 0) * 100) / 100,
          wp: wPts
        });
        rtcSendOrWs(_im);
      }


      function _showGameOver() {
        const el = document.getElementById('game-over-screen');
        if (el) {
          _el('go-title').textContent = 'GAME OVER';
          _el('go-title').style.color = '#ff1744';
          _el('go-winner').textContent = '';
          el.style.display = 'flex';
        }
      }
      function _hideGameOver() {
        const el = document.getElementById('game-over-screen');
        if (el) { el.style.display = 'none'; }
      }

      function startGame(lvl) {
        _hideGameOver();
        stopMusic(); // music only on main menu
        updateCamera();
        setTimeout(updateCamera, 200);
        if (gameState._mpNextLevel) gameState._mpNextLevel = false;
        gameState.level = lvl; gameState.active = true; gameState.kills = 0; gameState.levelComplete = false;
        gameState.levelTime = 0; gameState.zombiesSpawned = 0;
        gameState.freezeTimer = 0; gameState._wasFrozen = false;
        gameState.mpBombPhaseTimer = 0; gameState.mpBombDiamondTimer = 40;
        gameState.levelDuration = isMP() ? 120 : 90;
        gameState.fuseProgress = 0;
        gameState.fuseDead = false;
        gameState.rescueReady = false;
        gameState.rescueDone = false;
        gameState.doorOpening = false;
        gameState.doorProgress = 0;
        gameState.floatingHearts = [];
        gameState.soldierWave = false;
        gameState.soldiers = [];
        fuseBallMesh = null; fuseLinePts = [];
        rescueLight = null;
        if (rescueRing) { worldGroup.remove(rescueRing); rescueRing = null; }
        gameState.targetKills = Math.min(Math.round((10 + (lvl - 1) * 3) * 0.75), 75);

        if (gameMode === 'multi' || gameMode === 'online-local') {
          // Multiplayer / Local test: two players, zombies split equally
          if (lvl === 1) { players[0].score = 0; players[1].score = 0; }
          players[0].lives = 4; players[1].lives = 4;
          players[0].wireMeter = gameMode === 'online-local' ? 99999 : gameConfig.player.wireLimit;
          players[1].wireMeter = gameMode === 'online-local' ? 99999 : gameConfig.player.wireLimit;
          gameState._carryWire = false;
          gameState.dropBudget = { bomb: gameConfig.zombieDrops.bombCount, shield: gameConfig.zombieDrops.shieldCount, wire: gameConfig.zombieDrops.wireCount };
          const _mb0 = players[0].bombs || 0, _ms0 = players[0].shields || 0;
          const _mb1 = players[1].bombs || 0, _ms1 = players[1].shields || 0;
          resetPlayer(players[0]); resetPlayer(players[1]);
          players[0].bombs = _mb0; players[0].shields = _ms0; players[0].shield = _ms0 > 0;
          players[1].bombs = _mb1; players[1].shields = _ms1; players[1].shield = _ms1 > 0;
          players[0].x = -40; players[0].z = 0; players[0].group.position.set(-40, 0, 0);
          players[1].x = 40; players[1].z = 0; players[1].group.position.set(40, 0, 0);
          players[0].group.visible = true; players[1].group.visible = true;
          if (gameMode === 'online-local') gameState.targetKills = 30;
          players[0].zombiesLeft = Math.ceil(gameState.targetKills / 2);
          players[1].zombiesLeft = Math.floor(gameState.targetKills / 2);
          players[0].inBombPhase = false; players[1].inBombPhase = false;
          players[0].activeBombCount = 0; players[1].activeBombCount = 0;
          players[0].bombMax = 3; players[1].bombMax = 3;
          // Show MP HUD, hide normal HUD
          document.getElementById('hud').style.display = 'none';
          document.getElementById('mp-hud').style.display = 'block';
          updateMpHud(gameState, players, gameMode);
          // No cage/girl/dynamite in MP — checked inside buildGridArena
          gameState.mpCageSkip = true;
        } else if (gameMode === 'online-host') {
          // Online host: P1 local, P2 controlled by remote inputs
          if (lvl === 1) { players[0].score = 0; players[1].score = 0; }
          players[0].lives = 4; players[1].lives = 4;
          players[0].wireMeter = 99999; players[1].wireMeter = 99999;
          gameState._carryWire = false;
          gameState.dropBudget = { bomb: gameConfig.zombieDrops.bombCount, shield: gameConfig.zombieDrops.shieldCount, wire: gameConfig.zombieDrops.wireCount };
          const _ob0 = players[0].bombs || 0, _os0 = players[0].shields || 0;
          const _ob1 = players[1].bombs || 0, _os1 = players[1].shields || 0;
          resetPlayer(players[0]); resetPlayer(players[1]);
          players[0].bombs = _ob0; players[0].shields = _os0; players[0].shield = _os0 > 0;
          players[1].bombs = _ob1; players[1].shields = _os1; players[1].shield = _os1 > 0;
          players[0].x = -40; players[0].z = 0; players[0].group.position.set(-40, 0, 0);
          players[1].x = 40; players[1].z = 0; players[1].group.position.set(40, 0, 0);
          players[0].group.visible = true; players[1].group.visible = true;
          players[0].zombiesLeft = Math.ceil(gameState.targetKills / 2);
          players[1].zombiesLeft = Math.floor(gameState.targetKills / 2);
          players[0].inBombPhase = false; players[1].inBombPhase = false;
          players[0].activeBombCount = 0; players[1].activeBombCount = 0;
          players[0].bombMax = 3; players[1].bombMax = 3;
          document.getElementById('hud').style.display = 'none';
          document.getElementById('mp-hud').style.display = 'block';
          updateMpHud(gameState, players, gameMode);
          gameState.mpCageSkip = true;
          netState.lastSeed = netState.levelSeed = ((Date.now() & 0xFFFF) * (lvl + 1) + 0x4A3C) & 0x7FFFFFFF;
        } else if (gameMode === 'online-guest') {
          // Online guest: both players visible; state driven by host
          players[0].score = 0; players[1].score = 0;
          resetPlayer(players[0]); resetPlayer(players[1]);
          players[0].x = -40; players[0].z = 0; players[0].group.position.set(-40, 0, 0);
          players[1].x = 40; players[1].z = 0; players[1].group.position.set(40, 0, 0);
          players[0].group.visible = true; players[1].group.visible = true;
          players[0].zombiesLeft = 0; players[1].zombiesLeft = 0;
          players[0].inBombPhase = false; players[1].inBombPhase = false;
          players[0].activeBombCount = 0; players[1].activeBombCount = 0;
          document.getElementById('hud').style.display = 'none';
          document.getElementById('mp-hud').style.display = 'block';
          updateMpHud(gameState, players, gameMode);
          gameState.mpCageSkip = true;
          guestZombieMap.clear();
          netState.guestLastState = null;
        } else {
          if (lvl === 1) { players[0].score = 0; }
          players[0].wireMeter = gameConfig.player.wireLimit;
          gameState._carryWire = false;
          gameState.dropBudget = { bomb: gameConfig.zombieDrops.bombCount, shield: gameConfig.zombieDrops.shieldCount, wire: gameConfig.zombieDrops.wireCount };
          const savedBombs = players[0].bombs || 0;
          const savedShields = players[0].shields || 0;
          resetPlayer(players[0]);
          players[0].bombs = savedBombs;
          players[0].shields = savedShields;
          players[0].shield = savedShields > 0;
          players[1].group.visible = false;
          players[1].alive = false;
          players[1].isDrawingWire = false; players[1].wirePoints = [];
          if (players[1].wireMesh) { players[1].wireMesh.geometry.dispose(); players[1].wireMesh.geometry = new THREE.BufferGeometry(); }
          if (players[1].wireOuterMesh) { players[1].wireOuterMesh.geometry.dispose(); players[1].wireOuterMesh.geometry = new THREE.BufferGeometry(); }
          if (players[1].startMarker) players[1].startMarker.visible = false;
          document.getElementById('hud').style.display = 'flex';
          gameState.mpCageSkip = false;
        }


        // Apply MP difficulty overrides
        if (isMP() && gameState._mpDiff) {
          const md = gameState._mpDiff;
          gameState.targetKills = md.zombieCount;
          players[0].zombiesLeft = Math.ceil(gameState.targetKills / 2);
          players[1].zombiesLeft = Math.floor(gameState.targetKills / 2);
          gameState._mpDiffCannonPeriod = md.cannonPeriod;
          gameState._mpDiffBarrelCount = md.barrelCount;
        } else if (!isMP()) {
          gameState._mpDiff = null;
          gameState._mpDiffCannonPeriod = null;
          gameState._mpDiffBarrelCount = null;
        }

        buildGridArena(lvl);
        if (gameMode === 'online-host') {
          const _lvlMsg = JSON.stringify({ t: 'lvl_start', seed: netState.lastSeed, lvl, diff: netState.mpLobbyDiff || 'medium' });
          rtcSendOrWs(_lvlMsg);
        }
        gameState.spawnTimer = 2.0;
        gameState.zombiesAwake = true;
        // Ball spawn timer — active from level 3'den itibaren aktif
        if (isMP() && gameState._mpDiffCannonPeriod === null) {
          gameState.cannonTimer = Infinity; // Easy: no cannon
        } else if (isMP() && gameState._mpDiffCannonPeriod) {
          gameState.cannonPeriod = gameState._mpDiffCannonPeriod;
          gameState.cannonTimer = gameState.cannonPeriod * (0.8 + Math.random() * 0.4);
        } else if (lvl >= 3) {
          gameState.cannonPeriod = Math.max(5, 15 - Math.floor(lvl / 2));
          gameState.cannonTimer = gameState.cannonPeriod * (0.8 + Math.random() * 0.4);
        } else {
          gameState.cannonTimer = Infinity;
        }
        // ── CANNONBALL SPAWN STRATEGY (By Level) ──
        // Reset balls from previous level to prevent overlap
        wallCannons.forEach(wc => {
          wc.active = false;
          if (wc.grp) worldGroup.remove(wc.grp);
          if (wc.ball) worldGroup.remove(wc.ball);
          if (wc.shadowMesh) worldGroup.remove(wc.shadowMesh);
        });
        wallCannons.length = 0;

        let wcCount = 0;
        if (lvl >= 1) wcCount = 1;
        if (lvl >= 6) wcCount = 2;
        if (lvl >= 16) wcCount = 3;
        if (lvl >= 26) wcCount = 4;
        for (let _i = 0; _i < wcCount; _i++) spawnWallCannon();

        updateHUD(gameState, players);

      }



      function togglePause() {
        if (!gameState.active || gameState.transitioning) return;
        gameState.paused = !gameState.paused;
        const screen = document.getElementById('pause-screen');
        screen.style.display = gameState.paused ? 'flex' : 'none';
        if (gameState.paused) {
          suspendAudio();
        } else {
          resumeAudio();
        }
      }

      function resumeGame() {
        if (gameState.paused) togglePause();
      }

      function backToMenu() {
        gameState.paused = false;
        document.getElementById('pause-screen').style.display = 'none';
        document.getElementById('game-over-screen').style.display = 'none';
        resumeAudio();
        gameState.active = false;
        document.getElementById('hud').style.display = 'none';
        document.getElementById('mp-hud').style.display = 'none';
        document.getElementById('main-menu').style.display = 'flex';
        clearWorld();
      }

      const _isOnline = () => gameMode === 'online-host' || gameMode === 'online-local';

      function _checkPlayerBombPhase(p) {
        if (!isMP() || p.inBombPhase || p.zombiesLeft > 0) return;
        p.inBombPhase = true;
        p.isDrawingWire = false; p.wirePoints = [];
        if (p.wireMesh) p.wireMesh.geometry.setFromPoints([]);
        if (p.wireOuterMesh) p.wireOuterMesh.geometry.setFromPoints([]);
        if (p.startMarker) p.startMarker.visible = false;
        p.bombMax = p.bombMax || 3;
        showFloatingText(p.group.position.clone().add(new THREE.Vector3(0, 20, 0)), '💣 BOMB PHASE!', '#ffcc00');
        updateMpHud(gameState, players, gameMode);
      }

      function _onlinePlayerKilled(p, invDuration = 3.0) {
        if (gameState.transitioning || !p.alive) return;
        // Reset movement state
        p.isDrawingWire = false; p.wirePoints = [];
        p.wireMesh.geometry.dispose(); p.wireMesh.geometry = new THREE.BufferGeometry();
        p.wireOuterMesh.geometry.dispose(); p.wireOuterMesh.geometry = new THREE.BufferGeometry();
        p.startMarker.visible = false;
        p._cannonHit = false; p.sinking = false; p.sinkTimer = 0;
        p.isDashing = false; p.dashTimer = 0;
        // Decrement lives
        const livesAfter = (p.lives || 4) - 1;
        p.lives = Math.max(0, livesAfter);
        updateMpHud(gameState, players, gameMode);
        if (p.lives <= 0) {
          p.alive = false; p.group.visible = false;
          mpDeclareWinner(p, true);
          return;
        }
        // Respawn with invincibility
        const spawnX = players.indexOf(p) === 0 ? -40 : 40;
        p.x = spawnX; p.z = 0;
        p.group.position.set(spawnX, 0, 0);
        p.group.rotation.set(0, 0, 0);
        p.alive = true; p.group.visible = true;
        p._invTimer = invDuration; p._invBlink = 0;
        showFloatingText(p.group.position.clone(), '💔 -1 CAN', p.teamColor === 'blue' ? '#42a5f5' : '#ef5350');
      }

      function triggerGameOver() {
        if (gameState.transitioning) return;
        gameState.transitioning = true;
        setTimeout(() => {
          document.getElementById('game-over-screen').style.display = 'flex';
          suspendAudio();
        }, 2000);
      }

      function restartLevel() {
        document.getElementById('game-over-screen').style.display = 'none';
        resumeAudio();
        gameState._mpNextLevel = false;
        const targetLvl = (isMP() && netState.mpLobbyTheme) ? netState.mpLobbyTheme : gameState.level;
        startGame(targetLvl);
      }

      function backToMenuFromGameOver() {
        backToMenu();
      }

      window.togglePause = togglePause;
      window.resumeGame = resumeGame;
      window.backToMenu = backToMenu;
      window._toggleSfx = toggleSfx;
      window._togglePlayPause = togglePlayPause;
      window.restartLevel = restartLevel;
      window.backToMenuFromGameOver = backToMenuFromGameOver;
      window.onlineRestartVote = onlineRestartVote;

      // ── Wire up network module with game callbacks ──────────────────────────
      function _handleMpStart(lvl) {
        document.getElementById('main-menu').style.display = 'none';
        document.getElementById('main-menu').style.pointerEvents = '';
        tcEl.classList.add('active');
        document.getElementById('btn-back').style.display = 'flex';
        touch.vx = 0; touch.vz = 0; touch.fire = false; touch.dash = false;
        jTouchId = null; jKnob.style.transform = 'translate(-50%,-50%)';
        document.getElementById('mp-hud').style.display = 'block';
        startGame(lvl);
      }

      function _updateP2Wire(p2, wpArr) {
        p2.isDrawingWire = true;
        p2.wirePoints = wpArr.map(pt => ({ x: pt[0], z: pt[1] }));
        if (p2.wireMesh && wpArr.length >= 2) {
          const vPts = wpArr.map(pt => new THREE.Vector3(pt[0], 3.5, pt[1]));
          const curve = new THREE.CatmullRomCurve3(vPts);
          if (p2.wireMesh.geometry) p2.wireMesh.geometry.dispose();
          p2.wireMesh.geometry = new THREE.TubeGeometry(curve, Math.max(wpArr.length * 2, 8), 2.5, 6, false);
          if (p2.wireOuterMesh.geometry) p2.wireOuterMesh.geometry.dispose();
          p2.wireOuterMesh.geometry = new THREE.TubeGeometry(curve, Math.max(wpArr.length * 2, 8), 3.2, 6, false);
          p2.wireMesh.visible = true; p2.wireOuterMesh.visible = true;
          if (p2.startMarker) { p2.startMarker.position.set(wpArr[0][0], 3.5, wpArr[0][1]); p2.startMarker.visible = true; }
        }
      }

      initCharacters({
        getGameMode: () => gameMode,
        showFloatingText,
      });

      initAnimations({
        isMP,
        getGameMode: () => gameMode,
        onSinglePlayerDeath: () => setTimeout(_showGameOver, 600),
        triggerGameOver,
        breakShield,
        cannonballKillZombie,
        bombExplode,
        showFloatingText,
        startGame,
        mpDeclareWinner,
        getActiveBombs: () => activeBombs,
        updateHUD,
      });

      initNetwork({
        players,
        getGameMode: () => gameMode,
        setGameMode: m => { gameMode = m; },
        isMP,
        launchLevel,
        startGame,
        returnToMenu,
        applyGuestState,
        spawnBombPhaseDiamond,
        showFloatingText,
        respawnPlayer,
        updateMpHud,
        updateP2Wire: _updateP2Wire,
        onMpStart: _handleMpStart,
      });

      setupMenuUI({
        startGame,
        launchLevel,
        setGameMode: m => { gameMode = m; },
        onMpLobbyStart: lvl => { gameMode = 'multi'; launchLevel(lvl); },
      });

      const _localTestBtn = document.getElementById('op-local-test-btn');
      if (_localTestBtn) _localTestBtn.addEventListener('click', () => {
        initAudio();
        gameMode = 'online-local';
        document.getElementById('online-panel').classList.remove('open');
        launchLevel(16);
      });

      const clock = new THREE.Clock();
      let screenShake = 0.0;
      let _lastStateSend = 0, _lastInputSend = 0, _lastHudUpdate = 0;

      function applyPillarPhysics(x, z, r) {
        let nx = x, nz = z;
        for (let _iter = 0; _iter < 2; _iter++) {
          gameState.entities.trees.forEach(t => {
            const dx = nx - t.x, dz = nz - t.z, dSq = dx * dx + dz * dz, minRadi = t.radius + r;
            if (dSq < minRadi * minRadi) {
              const dist = Math.sqrt(dSq) || 0.1, push = (minRadi - dist) / dist;
              nx += dx * push; nz += dz * push;
            }
          });
        }
        if (cagedGirl && gameState.cagePos) {
          const dx = nx - gameState.cagePos.x, dz = nz - gameState.cagePos.z, dSq = dx * dx + dz * dz, minRadi = 10 + r;
          if (dSq < minRadi * minRadi) {
            const dist = Math.sqrt(dSq) || 0.1, push = (minRadi - dist) / dist;
            nx += dx * push; nz += dz * push;
          }
        }
        return { x: nx, z: nz };
      }

      let _frameCount = 0, _lastFrameTime = 0;
      const _TARGET_FRAME_MS = _isMobileDevice ? 1000 / 30 : 0;

      function animate(now) {
        requestAnimationFrame(animate);
        if (_TARGET_FRAME_MS > 0 && now - _lastFrameTime < _TARGET_FRAME_MS) return;
        _lastFrameTime = now; _frameCount++;
        const arenaLimit = ARENA_LIMIT;
        const arenaLimitX = ARENA_LIMIT_X;
        const conf = LEVELS[gameState.level - 1] || LEVELS[LEVELS.length - 1];

        let dt = Math.min(clock.getDelta(), 0.1);
        if (gameState.paused) {
          renderer.render(scene, camera);
          return;
        }
        if (gameState.slowMoTimer > 0) { gameState.slowMoTimer -= dt; dt *= 0.25; }
        const time = clock.getElapsedTime();

        const isLakeDeath = (x, z) => {
          let dead = false;
          gameState.lakes.forEach(lk => { if (Math.hypot(x - lk.x, z - lk.z) < lk.r - 2.0) dead = true; });
          return dead;
        };

        // ── ONLINE GUEST: early return — render received state only ──────────
        if (gameMode === 'online-guest') {
          if (now - _lastInputSend >= 16) _sendGuestInput();
          if (netState.guestLastState) { applyGuestState(netState.guestLastState); netState.guestLastState = null; }

          // P1 (host's player): lerp toward host-reported position
          const _hp = players[0];
          if (_hp && _hp.group && _hp._targetX !== undefined) {
            const _dx = _hp._targetX - _hp.x, _dz = _hp._targetZ - _hp.z, _d = Math.hypot(_dx, _dz);
            if (_d > 30) { _hp.x = _hp._targetX; _hp.z = _hp._targetZ; }
            else { _hp.x += _dx * 0.6; _hp.z += _dz * 0.6; }
            _hp.group.position.set(_hp.x, _hp.group.position.y, _hp.z);
            _hp._gMoving = _d > 0.4;
          }

          // P2 (guest's own player): self-prediction — apply input immediately
          const _gp = players[1];
          if (_gp && _gp.group && _gp.alive && !_gp.sinking) {
            let _pvx = 0, _pvz = 0;
            if (keys['KeyW'] || keys['ArrowUp']) _pvz -= 1;
            if (keys['KeyS'] || keys['ArrowDown']) _pvz += 1;
            if (keys['KeyA'] || keys['ArrowLeft']) _pvx -= 1;
            if (keys['KeyD'] || keys['ArrowRight']) _pvx += 1;
            _pvx += touch.vx; _pvz += touch.vz;
            const _pLen = Math.hypot(_pvx, _pvz);
            if (_pLen > 0) {
              _pvx /= _pLen; _pvz /= _pLen;
              _gp.x += _pvx * gameConfig.player.baseSpeed * dt;
              _gp.z += _pvz * gameConfig.player.baseSpeed * dt;
              _gp.x = Math.max(-ARENA_LIMIT_X + 10, Math.min(ARENA_LIMIT_X - 10, _gp.x));
              _gp.z = Math.max(-ARENA_LIMIT + 10, Math.min(ARENA_LIMIT - 10, _gp.z));
              _gp.group.rotation.y = Math.atan2(_pvx, _pvz);
              _gp._gMoving = true;
            } else {
              _gp._gMoving = false;
            }
            _gp.group.position.set(_gp.x, _gp.group.position.y, _gp.z);

            // Wire toggle logic for guest
            const wireCommand = !!(keys['Space'] || keys['Enter'] || touch.fire);
            if (wireCommand && time > _gp.lastWireTick + 0.3) {
              _gp.lastWireTick = time;
              _gp.isDrawingWire = !_gp.isDrawingWire;
              if (_gp.isDrawingWire) {
                _gp.wirePoints = [{ x: _gp.x, z: _gp.z }];
                _gp.startMarker.position.set(_gp.x, 3.5, _gp.z);
                _gp.startMarker.visible = true;
                if (_gp.wireMesh) _gp.wireMesh.visible = true;
                if (_gp.wireOuterMesh) _gp.wireOuterMesh.visible = true;
              } else {
                _gp.wirePoints = []; _gp.startMarker.visible = false;
                if (_gp.wireMesh) { _gp.wireMesh.visible = false; _gp.wireMesh.geometry.dispose(); _gp.wireMesh.geometry = new THREE.BufferGeometry(); }
                if (_gp.wireOuterMesh) { _gp.wireOuterMesh.visible = false; _gp.wireOuterMesh.geometry.dispose(); _gp.wireOuterMesh.geometry = new THREE.BufferGeometry(); }
              }
            }

            // Update local wire mesh geometry for instant feedback
            if (_gp.isDrawingWire) {
              _gp.startMarker.rotation.y += 5 * dt;
              const tail = _gp.wirePoints[_gp.wirePoints.length - 1];
              if (tail && Math.hypot(tail.x - _gp.x, tail.z - _gp.z) > 4.0) {
                _gp.wirePoints.push({ x: _gp.x, z: _gp.z });
                const vPts = _gp.wirePoints.map(wp => new THREE.Vector3(wp.x, 0, wp.z));
                vPts.push(new THREE.Vector3(_gp.x, 0, _gp.z));
                if (vPts.length >= 2) {
                  const curve = new THREE.CatmullRomCurve3(vPts);
                  const oldGeo = _gp.wireMesh.geometry;
                  _gp.wireMesh.geometry = new THREE.TubeGeometry(curve, Math.max(vPts.length * 2, 8), 2.5, 6, false);
                  oldGeo.dispose();
                  const oldGeoO = _gp.wireOuterMesh.geometry;
                  _gp.wireOuterMesh.geometry = new THREE.TubeGeometry(curve, Math.max(vPts.length * 2, 8), 3.2, 6, false);
                  oldGeoO.dispose();
                }
                // Polygon close detection — reset wire locally (host handles kills)
                if (_gp.wirePoints.length > 10) {
                  for (let _ci = 0; _ci < _gp.wirePoints.length - 10; _ci++) {
                    if (Math.hypot(_gp.x - _gp.wirePoints[_ci].x, _gp.z - _gp.wirePoints[_ci].z) < 8.0) {
                      _gp.isDrawingWire = false; _gp.wirePoints = [];
                      _gp.startMarker.visible = false;
                      if (_gp.wireMesh) { _gp.wireMesh.geometry.dispose(); _gp.wireMesh.geometry = new THREE.BufferGeometry(); }
                      if (_gp.wireOuterMesh) { _gp.wireOuterMesh.geometry.dispose(); _gp.wireOuterMesh.geometry = new THREE.BufferGeometry(); }
                      break;
                    }
                  }
                }
              }
            }
          }

          // Zombie lerp + walk/shock/fall animation
          guestZombieMap.forEach(z => {
            if (!z.active || !z.group) return;
            // Falling: tilt forward until despawn
            if (z.isFalling) {
              z.group.rotation.x -= dt * 3.0;
              return;
            }
            // Shocked: flicker material + vibrate
            if (z.shocked) {
              z.group.traverse(c => {
                if (c.isMesh && c.userData.shockMat) {
                  c.userData.shockMat.emissiveIntensity = Math.random() < 0.65 ? (2.5 + Math.random() * 3.5) : 0.2;
                }
              });
              z.group.position.x += (Math.random() - 0.5) * 1.5;
              z.group.position.z += (Math.random() - 0.5) * 1.5;
              return;
            }
            if (z._tX !== undefined) {
              const zdx = z._tX - z.group.position.x, zdz = z._tZ - z.group.position.z, zDist = Math.hypot(zdx, zdz);
              let movedDist = 0;
              if (zDist > 25) {
                z.group.position.set(z._tX, 0, z._tZ);
                movedDist = zDist;
              } else {
                const px = z.group.position.x, pz = z.group.position.z;
                z.group.position.x += zdx * 0.22; z.group.position.z += zdz * 0.22;
                z.group.rotation.y += (z._tR - z.group.rotation.y) * 0.22;
                movedDist = Math.hypot(z.group.position.x - px, z.group.position.z - pz);
              }
              if (zDist > 0.5) {
                tickZombieWalkAnim(z, movedDist, dt);
              } else {
                z.group.position.y = 0;
              }
            }
          });

          // Shield mesh pulse for both players
          players.forEach(p => {
            if (!p._shieldMesh) return;
            p._shieldMesh.visible = !!p.shield;
            if (p.shield) {
              const pulse = 1.0 + Math.sin(time * 4) * 0.06;
              p._shieldMesh.scale.setScalar(pulse);
              p._shieldMesh.material.opacity = 0.22 + Math.sin(time * 4) * 0.08;
            }
          });

          // Animations
          players.forEach((p, pidx) => {
            if (!p.alive || !p.group || !p.lLeg) {
              // If local player was alive but now is dead (from host sync), trigger local game over
              if (pidx === 1 && p._lastAliveStatus === true && p.alive === false) {
                playerDeathScatter(p);
                triggerGameOver();
              }
              p._lastAliveStatus = p.alive;
              return;
            }
            p._lastAliveStatus = p.alive;

            p.group.rotation.x = p.isDashing ? -0.4 : 0;
            if (p._gMoving) {
              p.walkCycle = (p.walkCycle || 0) + dt * 9.6;
              if (pidx === 0 && p._gFaceY !== undefined) p.group.rotation.y = p._gFaceY; // P1: host-reported dir; P2: self-predicted dir already set
              p.lLeg.rotation.x = Math.sin(p.walkCycle) * 1.2;
              p.rLeg.rotation.x = -Math.sin(p.walkCycle) * 1.2;
              p.lArm.rotation.x = -Math.sin(p.walkCycle) * 1.2;
              p.rArm.rotation.x = Math.sin(p.walkCycle) * 1.2;
              p.group.position.y = Math.abs(Math.cos(p.walkCycle)) * 0.8;
            } else {
              p.lLeg.rotation.x = 0; p.rLeg.rotation.x = 0; p.lArm.rotation.x = 0; p.rArm.rotation.x = 0; p.group.position.y = 0;
            }
          });

          // Local collision check for Guest (P2) to provide instant feedback
          if (_gp && _gp.alive && !_gp.sinking) {
            guestZombieMap.forEach(z => {
              if (z.active && Math.hypot(_gp.x - z.group.position.x, _gp.z - z.group.position.z) < 8.5) {
                playerDeathScatter(_gp);
                _gp.alive = false; _gp.group.visible = false;
                triggerGameOver();
              }
            });
          }

          // Camera
          if (isMobile) {
            const lp = players[1];
            if (lp && lp.alive && lp.group) {
              const deadZ = ARENA_LIMIT / 3;
              let targetZ = 0;
              if (lp.z > deadZ) targetZ = ((lp.z - deadZ) / (ARENA_LIMIT * 0.67)) * 95;
              else if (lp.z < -deadZ) targetZ = ((lp.z + deadZ) / (ARENA_LIMIT * 0.67)) * 95;
              cameraDynZ += (targetZ - cameraDynZ) * Math.min(1, dt * 3.5);
              const zone5Start = ARENA_LIMIT_X * 0.6, zone1Start = -ARENA_LIMIT_X * 0.6;
              let targetX = 0;
              if (lp.x > zone5Start) targetX = ((lp.x - zone5Start) / (ARENA_LIMIT_X * 0.4)) * 120;
              else if (lp.x < zone1Start) targetX = -((lp.x - zone1Start) / (-ARENA_LIMIT_X * 0.4)) * 120;
              cameraDynX += (targetX - cameraDynX) * Math.min(1, dt * 3.5);
              cameraDynX = Math.max(-112, Math.min(75, cameraDynX));
            }
          } else { cameraDynX = -20; cameraDynZ = 0; }
          camera.position.set(cameraDynX, 300, cameraDynZ + 252);
          camera.lookAt(cameraDynX, 0, cameraDynZ);
          if (now - _lastHudUpdate > 250) { _lastHudUpdate = now; updateHUD(gameState, players); if (isMP()) updateMpHud(gameState, players, gameMode); }
          if (gameState.entities && gameState.entities.flowers) {
            gameState.entities.flowers.forEach(f => {
              if (!f.active || !f.mesh) return;
              f.mesh.position.y = f.startY + Math.sin(time * 2.5 + f.timeOfs) * 1.2;
              f.mesh.rotation.y += dt * 0.6;
            });
          }
          // Freeze visual: apply/remove ice material on guest zombies
          if (gameState.freezeTimer > 0) {
            gameState._wasFrozen = true;
            guestZombieMap.forEach(z => {
              if (!z.active || z.isFalling || z.shocked) return;
              z.group.traverse(c => {
                if (c.isMesh && !c.userData.isOutline && c.userData.origMat && c.material !== matCache.zFrozen)
                  c.material = matCache.zFrozen;
              });
            });
          } else if (gameState._wasFrozen) {
            gameState._wasFrozen = false;
            guestZombieMap.forEach(z => {
              if (!z.active || z.shocked) return;
              z.group.traverse(c => {
                if (c.isMesh && !c.userData.isOutline && c.userData.origMat) c.material = c.userData.origMat;
              });
            });
          }
          // Bomb spark flicker on guest
          guestBombMap.forEach(bm => {
            bm.sparkLight.intensity = 60 + Math.random() * 40;
          });
          tickBleacherSpectators(clock.getElapsedTime(), dt);
          renderer.render(scene, camera);
          return;
        }

        // ── ONLINE HOST: send state via WebRTC (fallback: WebSocket) ──────────
        if (gameMode === 'online-host' && gameState.active) {
          if (now - _lastStateSend >= 16) {
            _lastStateSend = now;
            const _s = _serializeState();
            rtcSendOrWs(_s);
          }
        }
        // bot mode: no state broadcast needed

        // Update Animations (Walk Cycles) — host & local only
        players.forEach(p => tickPlayerWalkAnim(p, p.isMoving, dt));

        // Invincibility blink
        if (_isOnline()) {
          players.forEach(p => {
            if (p._invTimer > 0) {
              p._invTimer -= dt;
              p._invBlink = (p._invBlink || 0) + dt;
              p.group.visible = Math.floor(p._invBlink * 8) % 2 === 0;
              if (p._invTimer <= 0) { p._invTimer = 0; p.group.visible = p.alive; }
            }
          });
        }

        tickExplosions(dt);

        if (gameState.active && !gameState.transitioning) {
          gameState.levelTime += dt;

          // ZOMBIE SPAWN - her 2 saniyede 1 zombi, rastgele kenara
          if (gameState.zombiesAwake) {
            gameState.spawnTimer -= dt;
            if (gameState.spawnTimer <= 0 && gameState.zombiesSpawned < gameState.targetKills) {
              gameState.spawnTimer = 2.0;
              let sX = 0, sZ = 0, found = false;
              for (let attempt = 0; attempt < 12; attempt++) {
                const side = Math.floor(Math.random() * 4);
                let cx = 0, cz = 0;
                if (side === 0) { cx = -arenaLimitX; cz = (Math.random() - 0.5) * arenaLimit * 2; }
                else if (side === 1) { cx = arenaLimitX; cz = (Math.random() - 0.5) * arenaLimit * 2; }
                else if (side === 2) { cz = -arenaLimit; cx = (Math.random() - 0.5) * arenaLimitX * 2; }
                else { cz = arenaLimit; cx = (Math.random() - 0.5) * arenaLimitX * 2; }
                const tooClose = gameState.entities.zombies.some(z => z.active && Math.hypot(z.group.position.x - cx, z.group.position.z - cz) < 70);
                if (!tooClose) { sX = cx; sZ = cz; found = true; break; }
              }
              if (found) {
                spawnZombieAt(sX, sZ, (conf && conf.zombieSpeed) ? conf.zombieSpeed : 11);
                gameState.zombiesSpawned++;
                updateHUD(gameState, players);
              } else {
                gameState.spawnTimer = 0.5;
              }
            }
          }

          players.forEach(p => {
            if (!p.alive || p.sinking) return;

            if (p.comboTime > 0) {
              p.comboTime -= dt;
              if (p.comboTime <= 0) { p.combo = 0; updateHUD(gameState, players); }
            }

            let vx = 0, vz = 0, wireCommand = false, baseDash = false;
            if (gameMode === 'online-host') {
              // Host: P1 = local (all keys + touch), P2 = remote inputs
              if (p.id === 1) {
                if (keys['KeyW'] || keys['ArrowUp']) vz -= 1;
                if (keys['KeyS'] || keys['ArrowDown']) vz += 1;
                if (keys['KeyA'] || keys['ArrowLeft']) vx -= 1;
                if (keys['KeyD'] || keys['ArrowRight']) vx += 1;
                vx += touch.vx; vz += touch.vz;
                if (p.inBombPhase) {
                  const fireKey = keys['Space'] || keys['Enter'] || touch.fire;
                  if (fireKey && !p._bombKeyHeld) { p._bombKeyHeld = true; placeBomb(p); }
                  if (!fireKey) p._bombKeyHeld = false;
                } else {
                  wireCommand = !!(keys['Space'] || keys['Enter'] || touch.fire);
                }
                baseDash = !!(keys['ShiftLeft'] || keys['ShiftRight'] || touch.dash);
              } else {
                vx = netState.onlineP2Input.vx || 0; vz = netState.onlineP2Input.vz || 0;
                if (p.inBombPhase) {
                  if (netState.onlineP2Input.bm && !p._bombKeyHeld) { p._bombKeyHeld = true; placeBomb(p); netState.onlineP2Input.bm = false; }
                  if (!netState.onlineP2Input.bm) p._bombKeyHeld = false;
                } else {
                  // Online P2: isDrawingWire is synced directly from guest intent
                  if (netState.onlineP2Input.fi !== p.isDrawingWire) {
                    // fi just went false → guest detected polygon close; do a final kill pass before clearing
                    if (!netState.onlineP2Input.fi && p.isDrawingWire && p.wirePoints.length > 10) {
                      const poly = [...p.wirePoints, { x: p.x, z: p.z }];
                      let deadZs = 0;
                      gameState.entities.zombies.forEach(z => {
                        if (!z.active || z.shocked) return;
                        if (!isPointInPolygon({ x: z.group.position.x, z: z.group.position.z }, poly)) return;
                        z.hp = 0; z._killedBy = p; z.shocked = true; z.shockTimer = 1.2; z.shockTimerMax = 1.2; z.smokeTimer = 0;
                        applyShockVisuals(z); applyRedGlow(z); deadZs++;
                        if (z.teamIdx >= 0) {
                          const owner = players[z.teamIdx];
                          owner.zombiesLeft = Math.max(0, owner.zombiesLeft - 1);
                          _checkPlayerBombPhase(owner);
                        }
                      });
                      if (deadZs > 0) {
                        p.combo = (p.combo || 0) + 1; p.comboTime = 3.5;
                        gameState.kills += deadZs; p.score += deadZs * 25 * p.combo;
                        if (isMP()) updateMpHud(gameState, players, gameMode);
                        playSfx('zap'); playSfx('scream');
                      }
                    }
                    p.isDrawingWire = netState.onlineP2Input.fi;
                    if (p.isDrawingWire) {
                      p.wirePoints = [{ x: p.x, z: p.z }];
                      p.startMarker.position.set(p.x, 3.5, p.z);
                      p.startMarker.visible = true;
                    } else {
                      p.wirePoints = []; p.startMarker.visible = false;
                      p.wireMesh.geometry.dispose(); p.wireMesh.geometry = new THREE.BufferGeometry();
                      p.wireOuterMesh.geometry.dispose(); p.wireOuterMesh.geometry = new THREE.BufferGeometry();
                    }
                  }
                }
                baseDash = !!netState.onlineP2Input.da;
              }
            } else if (gameMode === 'multi' || gameMode === 'online-local') {
              // Multiplayer / Local test: P1 WASD+Space, P2 Arrow+Enter
              if (p.id === 1) {
                if (keys['KeyW']) vz -= 1;
                if (keys['KeyS']) vz += 1;
                if (keys['KeyA']) vx -= 1;
                if (keys['KeyD']) vx += 1;
                if (p.inBombPhase) {
                  if (keys['Space'] && !p._bombKeyHeld) { p._bombKeyHeld = true; placeBomb(p); }
                  if (!keys['Space']) p._bombKeyHeld = false;
                } else {
                  wireCommand = !!keys['Space'];
                }
                baseDash = !!keys['ShiftLeft'];
              } else {
                if (keys['ArrowUp']) vz -= 1;
                if (keys['ArrowDown']) vz += 1;
                if (keys['ArrowLeft']) vx -= 1;
                if (keys['ArrowRight']) vx += 1;
                if (p.inBombPhase) {
                  if (keys['Enter'] && !p._bombKeyHeld) { p._bombKeyHeld = true; placeBomb(p); }
                  if (!keys['Enter']) p._bombKeyHeld = false;
                } else {
                  wireCommand = !!keys['Enter'];
                }
                baseDash = !!keys['ShiftRight'];
              }
            } else {
              // Single player: all keys for P1
              if (keys['KeyW'] || keys['ArrowUp']) vz -= 1;
              if (keys['KeyS'] || keys['ArrowDown']) vz += 1;
              if (keys['KeyA'] || keys['ArrowLeft']) vx -= 1;
              if (keys['KeyD'] || keys['ArrowRight']) vx += 1;
              if (keys['Space'] || keys['Enter']) wireCommand = true;
              if (keys['ShiftLeft'] || keys['ShiftRight'] || keys['ControlRight']) baseDash = true;
              // Touch input
              vx += touch.vx; vz += touch.vz;
              if (touch.fire) wireCommand = true;
              if (touch.dash) baseDash = true;
            }

            p.group.position.y = 0;


            if (wireCommand && time > p.lastWireTick + 0.3) {
              p.lastWireTick = time;
              if (!p.isDrawingWire && (p.wireMeter ?? 0) <= 0) { /* no wire left */ }
              else p.isDrawingWire = !p.isDrawingWire;

              if (p.isDrawingWire) {
                p.wirePoints = [{ x: p.x, z: p.z }];
                p.startMarker.position.set(p.x, 3.5, p.z);
                p.startMarker.rotation.set(Math.random(), Math.random(), 0);
                p.startMarker.visible = true;
                p.wireMesh.geometry.dispose(); p.wireMesh.geometry = new THREE.BufferGeometry();
                p.wireOuterMesh.geometry.dispose(); p.wireOuterMesh.geometry = new THREE.BufferGeometry();
              } else {
                p.wirePoints = []; p.wireMesh.geometry.dispose(); p.wireMesh.geometry = new THREE.BufferGeometry();
                p.wireOuterMesh.geometry.dispose(); p.wireOuterMesh.geometry = new THREE.BufferGeometry(); p.startMarker.visible = false;
              }
            }

            if (p.isDrawingWire) {
              p.startMarker.rotation.y += 5 * dt;
              p.startMarker.rotation.x += 5 * dt;

              const tail = p.wirePoints[p.wirePoints.length - 1];
              if (Math.hypot(tail.x - p.x, tail.z - p.z) > 4.0) {
                const segLen = Math.hypot(p.x - tail.x, p.z - tail.z) / 5;
                p.wireMeter = (p.wireMeter ?? 0) - segLen;
                if (isMP()) updateMpHud(gameState, players, gameMode); else updateHUD(gameState, players);
                if (p.wireMeter <= 0) {
                  p.wireMeter = 0;
                  p.isDrawingWire = false; p.wirePoints = []; p.wireMesh.geometry.dispose(); p.wireMesh.geometry = new THREE.BufferGeometry();
                  p.wireOuterMesh.geometry.dispose(); p.wireOuterMesh.geometry = new THREE.BufferGeometry(); p.startMarker.visible = false;
                  showFloatingText(p.group.position, 'HAT BİTTİ!', '#f87171');
                  return;
                }
                p.wirePoints.push({ x: p.x, z: p.z });

                // MP: cancel wire if new segment intersects other player wire
                let wireCut = false;
                if (isMP() && p.wirePoints.length >= 2) {
                  const other = players.find(pp => pp !== p);
                  if (other && other.isDrawingWire && other.wirePoints.length >= 2) {
                    const myA = p.wirePoints[p.wirePoints.length - 2];
                    const myB = p.wirePoints[p.wirePoints.length - 1];
                    for (let si = 1; si < other.wirePoints.length && !wireCut; si++) {
                      if (segsIntersect(myA, myB, other.wirePoints[si - 1], other.wirePoints[si])) wireCut = true;
                    }
                  }
                  if (wireCut) {
                    p.isDrawingWire = false; p.wirePoints = [];
                    p.wireMesh.geometry.dispose(); p.wireMesh.geometry = new THREE.BufferGeometry();
                    p.wireOuterMesh.geometry.dispose(); p.wireOuterMesh.geometry = new THREE.BufferGeometry();
                    p.startMarker.visible = false;
                    showFloatingText(p.group.position, 'WIRE CUT!', p.teamColor === 'blue' ? '#42a5f5' : '#ef5350');
                  }
                }

                if (!wireCut) {
                  const vPts = p.wirePoints.map(wp => new THREE.Vector3(wp.x, 0, wp.z));
                  vPts.push(new THREE.Vector3(p.x, 0, p.z));
                  if (vPts.length >= 2) {
                    const curve = new THREE.CatmullRomCurve3(vPts);
                    const oldGeo = p.wireMesh.geometry;
                    p.wireMesh.geometry = new THREE.TubeGeometry(curve, Math.max(vPts.length * 2, 8), 2.5, 6, false);
                    oldGeo.dispose();
                    const oldGeoO = p.wireOuterMesh.geometry;
                    p.wireOuterMesh.geometry = new THREE.TubeGeometry(curve, Math.max(vPts.length * 2, 8), 3.2, 6, false);
                    oldGeoO.dispose();
                  }
                }
              }

              const MIN_L = 10;
              if (p.wirePoints.length > MIN_L) {
                let closedIdx = -1;
                for (let i = 0; i < p.wirePoints.length - MIN_L; i++) {
                  if (Math.hypot(p.x - p.wirePoints[i].x, p.z - p.wirePoints[i].z) < 8.0) {
                    closedIdx = i; break;
                  }
                }

                if (closedIdx !== -1) {
                  let poly = p.wirePoints.slice(closedIdx);
                  poly.push({ x: p.x, z: p.z });

                  let deadZs = 0; let totalScore = 0; let centerPos = new THREE.Vector3();
                  let zapCount = 0, shockCount = 0;
                  gameState.entities.zombies.forEach(z => {
                    if (z.active && !z.shocked && isPointInPolygon({ x: z.group.position.x, z: z.group.position.z }, poly)) {
                      z.hp = 0; z._killedBy = p;
                      // Lightning effect: max 3 zombies get visuals, rest die silently
                      if (zapCount < 3) {
                        let nearestWirePt = poly[0];
                        let nearestDist = Infinity;
                        poly.forEach(pt => {
                          const d = Math.hypot(pt.x - z.group.position.x, pt.z - z.group.position.z);
                          if (d < nearestDist) { nearestDist = d; nearestWirePt = pt; }
                        });
                        createWireZap(nearestWirePt, z.group.position);
                        zapCount++;
                      }
                      if (shockCount < 5) { createElectricShock(z.group.position); shockCount++; }
                      z.shocked = true; z.shockTimer = 1.2; z.shockTimerMax = 1.2; z.smokeTimer = 0;
                      applyRedGlow(z);
                      z.group.traverse(c => { if (c.isMesh && !c.userData.isOutline && (!z.eyeMeshes || !z.eyeMeshes.includes(c)) && z.mouthMesh !== c) { const sm = (c.userData.origMat || c.material).clone(); sm.emissive = new THREE.Color(0x00e5ff); sm.emissiveIntensity = 3.0; c.material = sm; c.userData.shockMat = sm; } });
                      z.group.traverse(c => { if (c.userData.isOutline) c.visible = true; });
                      if (z.lArm) z.lArm.rotation.set(-0.3, -Math.PI / 2, 0);
                      if (z.rArm) z.rArm.rotation.set(-0.3, Math.PI / 2, 0);
                      if (z.lLeg) z.lLeg.rotation.set(0, 0, -0.55);
                      if (z.rLeg) z.rLeg.rotation.set(0, 0, 0.55);
                      applyShockVisuals(z);
                      deadZs++;
                      centerPos.add(z.group.position);
                      // MP: decrement team counter for killed zombie
                      if (isMP() && z.teamIdx >= 0) {
                        const owner = players[z.teamIdx];
                        owner.zombiesLeft = Math.max(0, owner.zombiesLeft - 1);
                        _checkPlayerBombPhase(owner);
                      }
                    }
                  });
                  if (isMP()) updateMpHud(gameState, players, gameMode);



                  // Cage check — if wire covers cage position game ends
                  if (cagedGirl && isPointInPolygon({ x: gameState.cagePos.x, z: gameState.cagePos.z }, poly)) {
                    const cagePos = new THREE.Vector3(gameState.cagePos.x, 0, gameState.cagePos.z);
                    createFireExplosion(cagePos);
                    createFireExplosion(cagePos.clone().add(new THREE.Vector3(10, 0, 0)));
                    createFireExplosion(cagePos.clone().add(new THREE.Vector3(-10, 0, 0)));
                    createFireExplosion(cagePos.clone().add(new THREE.Vector3(0, 0, 10)));
                    createSmokePuff(cagePos);
                    createSmokePuff(cagePos.clone().add(new THREE.Vector3(5, 0, 5)));
                    const wireFireL = new THREE.PointLight(0xff2200, 1200, 350);
                    wireFireL.position.set(gameState.cagePos.x, 40, gameState.cagePos.z);
                    worldGroup.add(wireFireL);
                    // Cage wood + girl turns to char (same effect as dynamite)
                    if (cagedGirl.dynGroup) cagedGirl.dynGroup.visible = false;
                    const charMat2 = new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 1.0, metalness: 0.0 });
                    cagedGirl.group.traverse(c => {
                      if (!c.isMesh) return;
                      const col = c.material.color;
                      if (col) { const h = col.getHex(); if (h === 0x5d3a1a || h === 0x3e2005 || c.parent === cagedGirl.girl || c.parent?.parent === cagedGirl.girl) c.material = charMat2; }
                    });
                    if (cagedGirl.girl) cagedGirl.girl.traverse(c => { if (c.isMesh) c.material = charMat2; });
                    showFloatingText(cagePos, "⚠️ GIRL BURNED IN CAGE! GAME OVER!", "#ff3d00");
                    if (gameState.transitioning) return;
                    p.wireOuterMesh.geometry.dispose(); p.wireOuterMesh.geometry = new THREE.BufferGeometry(); p.startMarker.visible = false;
                    triggerGameOver();
                    return;
                  }

                  let barrelExploded = false; let explPos = null;
                  const _barsInPoly = [];
                  gameState.entities.barrels.forEach(b => {
                    if (b.active && isPointInPolygon({ x: b.mesh.position.x, z: b.mesh.position.z }, poly)) {
                      b.active = false; b.mesh.visible = false;
                      _barsInPoly.push(b.mesh.position.clone());
                    }
                  });
                  if (_barsInPoly.length > 0) {
                    barrelExploded = true; explPos = _barsInPoly[0];
                  }
                  if (barrelExploded) {
                    showFloatingText(explPos, "BLAST!", "#ff5722");

                    const MAX_FLAME = gameConfig.barrels.blastRange;
                    const HFW = gameConfig.barrels.blastHalfWidth;
                    const ranges = {
                      px: getBombFlameRange(explPos.x, explPos.z, 1, 0, MAX_FLAME, HFW),
                      nx: getBombFlameRange(explPos.x, explPos.z, -1, 0, MAX_FLAME, HFW),
                      pz: getBombFlameRange(explPos.x, explPos.z, 0, 1, MAX_FLAME, HFW),
                      nz: getBombFlameRange(explPos.x, explPos.z, 0, -1, MAX_FLAME, HFW),
                    };
                    const HW = 14;
                    const inBlastRay = (dx, dz) =>
                      (dx > 0 && dx < ranges.px && Math.abs(dz) < HW) ||
                      (dx < 0 && -dx < ranges.nx && Math.abs(dz) < HW) ||
                      (dz > 0 && dz < ranges.pz && Math.abs(dx) < HW) ||
                      (dz < 0 && -dz < ranges.nz && Math.abs(dx) < HW) ||
                      Math.hypot(dx, dz) < 20; // Core blast radius

                    createSharedExplosion(explPos, 40, ranges);

                    gameState.entities.zombies.forEach(z => {
                      if (!z.active || z.shocked) return;
                      const dx = z.group.position.x - explPos.x, dz = z.group.position.z - explPos.z;
                      if (inBlastRay(dx, dz)) {
                        z.hp = 0; z.shocked = true; z.shockTimer = 0.5; z.shockTimerMax = 0.5; z.smokeTimer = 0;
                        z.group.traverse(c => { if (c.isMesh && !c.userData.isOutline) { const sm = (c.userData.origMat || c.material).clone(); sm.emissive = new THREE.Color(0xff2200); sm.emissiveIntensity = 3.0; c.material = sm; c.userData.shockMat = sm; } });
                        applyShockVisuals(z);
                        deadZs++;
                        if (isMP() && z.teamIdx >= 0) {
                          const owner = players[z.teamIdx];
                          owner.zombiesLeft = Math.max(0, owner.zombiesLeft - 1);
                          _checkPlayerBombPhase(owner);
                        }
                      }
                    });
                    if (isMP()) updateMpHud(gameState, players, gameMode);
                    players.forEach(p => {
                      if (!gameState.levelComplete || !p.alive) return;
                      const dx = p.x - explPos.x, dz = p.z - explPos.z;
                      if (inBlastRay(dx, dz)) {
                        if (p.shield) { breakShield(p, "SHIELD BLOCKED!"); }
                        else { p.alive = false; p.group.visible = false; p.isDrawingWire = false; p.wirePoints = []; p.wireMesh.geometry.dispose(); p.wireMesh.geometry = new THREE.BufferGeometry(); p.wireOuterMesh.geometry.dispose(); p.wireOuterMesh.geometry = new THREE.BufferGeometry(); p.startMarker.visible = false; if (!mpDeclareWinner(p)) triggerGameOver(); }
                      }
                    });
                    const _chainTargets = [];
                    gameState.entities.barrels.forEach(b => {
                      if (!b.active) return;
                      const dx = b.mesh.position.x - explPos.x, dz = b.mesh.position.z - explPos.z;
                      if (inBlastRay(dx, dz)) { b.active = false; b.mesh.visible = false; _chainTargets.push(b.mesh.position.clone()); }
                    });
                    _chainTargets.forEach((cp, i) => setTimeout(() => triggerBarrelBlast(cp, 0), 200 * (i + 1)));
                    _barsInPoly.slice(1).forEach(cp => setTimeout(() => triggerBarrelBlast(cp, 0), 0));
                  }

                  if (deadZs > 0) {
                    playSfx('zap');
                    playSfx('scream');
                    p.combo += 1; p.comboTime = 3.5;
                    gameState.kills += deadZs;
                    let pts = deadZs * 25 * p.combo;
                    p.score += pts;
                    updateHUD(gameState, players);
                    if (deadZs >= 5) { showFloatingText(p.group.position, "COMBO! x" + deadZs, "#ff3d00"); }
                    vibe(Math.min(30 + deadZs * 20, 150));
                  }

                  p.isDrawingWire = false; p.wirePoints = []; p.wireMesh.geometry.dispose(); p.wireMesh.geometry = new THREE.BufferGeometry();
                  p.wireOuterMesh.geometry.dispose(); p.wireOuterMesh.geometry = new THREE.BufferGeometry(); p.startMarker.visible = false;
                }
              }
            }

            if (baseDash && p.dashTimer <= 0) { p.isDashing = true; p.dashDur = gameConfig.player.dashDuration; p.dashTimer = gameConfig.player.dashCooldown; }

            if (p.buffSpeedTime > 0) { p.buffSpeedTime -= dt; }
            if (p.slowTime > 0) { p.slowTime -= dt; }
            // Screen darkening (slowdown effect)
            if (p.isDashing && p.dashDur > 0) {
              p.dashDur -= dt; p.speed = gameConfig.player.dashSpeed; p.group.rotation.x = -0.4;
            } else {
              p.isDashing = false;
              if (p.slowTime > 0) p.speed = gameConfig.player.slowSpeed;
              else p.speed = p.buffSpeedTime > 0 ? gameConfig.player.buffSpeed : gameConfig.player.baseSpeed;
              p.group.rotation.x = 0;
              if (p.dashTimer > 0) p.dashTimer -= dt;
            }
            // Show/hide shield capsule + subtle pulse animation
            if (p._shieldMesh) {
              p._shieldMesh.visible = !!p.shield;
              if (p._shieldOutline) p._shieldOutline.visible = !!p.shield;
              if (p.shield) {
                const pulse = 1.0 + Math.sin(time * 4) * 0.06;
                p._shieldMesh.scale.setScalar(pulse);
                p._shieldMesh.material.opacity = 0.22 + Math.sin(time * 4) * 0.08;
                if (p._shieldOutline) p._shieldOutline.scale.setScalar(pulse * 1.12);
              }
            }
            p.group.traverse(c => {
              if (c.isMesh && c.origColor) {
                if (p.buffSpeedTime > 0) {
                  const isSkin = c.origColor === 0xffccaa || c.origColor === 0x3e2723;
                  if (isSkin) {
                    c.material.color.setHex(c.origColor);
                  } else {
                    // fast transition between light pink (0xffb3ba) and red (0xff1111)
                    const t = (Math.sin(time * 10) + 1) * 0.5;
                    c.material.color.setRGB(1.0, (179 - 153 * t) / 255, (186 - 160 * t) / 255);
                  }
                } else {
                  c.material.color.setHex(c.origColor);
                }
              }
            });


            const speedFactor = p.speed * dt;
            if (vx !== 0 || vz !== 0) {
              const len = Math.hypot(vx, vz);
              vx = (vx / len) * speedFactor; vz = (vz / len) * speedFactor;
              p.x += vx; p.z += vz;
              p._lastDx = vx; p._lastDz = vz;
              p.group.rotation.y = Math.atan2(vx, vz);
              // Adim animasyonu mesafeye gore - Tam senkronize (kayma engellendi)
              const prevCycle = p.walkCycle;
              p.walkCycle += speedFactor * 0.16;
              p.lLeg.rotation.x = Math.sin(p.walkCycle) * 1.2;
              p.rLeg.rotation.x = -Math.sin(p.walkCycle) * 1.2;
              p.lArm.rotation.x = -Math.sin(p.walkCycle) * 1.2;
              p.rArm.rotation.x = Math.sin(p.walkCycle) * 1.2;
              // Body bounce - ground impact feel
              p.group.position.y = Math.abs(Math.cos(p.walkCycle)) * 0.8;
              // Footstep sound on each leg-down (sin crosses 0 going negative = heel strike)
              if (gameMode !== 'online-guest' && (p.id === 1 || gameMode === 'multi') &&
                  Math.sin(prevCycle) > 0 && Math.sin(p.walkCycle) <= 0) {
                playSfx('step');
              }
            } else {
              p.lLeg.rotation.x = 0; p.rLeg.rotation.x = 0; p.lArm.rotation.x = 0; p.rArm.rotation.x = 0;
              p.group.position.y = 0;
            }

            // Player visual width: arm tips ±9.8 units → full overlap with r=10
            const coll = applyPillarPhysics(p.x, p.z, gameConfig.player.bodyRadius);
            p.x = coll.x; p.z = coll.z;

            // Bomb collision + kick: impassable, slides on touch
            activeBombs.forEach(b => {
              if (b.done) return;
              let bdx = p.x - b.group.position.x;
              let bdz = p.z - b.group.position.z;
              let bdist = Math.hypot(bdx, bdz);
              const minBombDist = gameConfig.bombs.collisionRadius;
              if (bdist < 0.5) { bdx = 1; bdz = 0; bdist = 0.5; } // default direction if overlapping
              if (bdist < minBombDist) {
                // Same method as tree collision: full distance correction
                const push = (minBombDist - bdist) / bdist;
                p.x += bdx * push;
                p.z += bdz * push;
                // Slide bomb in player movement direction (kick)
                const playerSpeed = Math.hypot(p._lastDx || 0, p._lastDz || 0);
                if (playerSpeed > 0.5) {
                  const kickStr = Math.min(playerSpeed * gameConfig.player.kickStrength, gameConfig.bombs.kickMaxStrength);
                  b.kickVx = (b.kickVx || 0) - (bdx / bdist) * kickStr;
                  b.kickVz = (b.kickVz || 0) - (bdz / bdist) * kickStr;
                }
              }
            });

            // Barrel collision + kick
            gameState.entities.barrels.forEach(b => {
              if (!b.active) return;
              let bdx = p.x - b.mesh.position.x;
              let bdz = p.z - b.mesh.position.z;
              let bdist = Math.hypot(bdx, bdz);
              const minBarrelDist = gameConfig.barrels.collisionRadius;
              if (bdist < 0.5) { bdx = 1; bdz = 0; bdist = 0.5; }
              if (bdist < minBarrelDist) {
                const push = (minBarrelDist - bdist) / bdist;
                p.x += bdx * push;
                p.z += bdz * push;
                const playerSpeed = Math.hypot(p._lastDx || 0, p._lastDz || 0);
                if (playerSpeed > 0.5) {
                  const kickStr = Math.min(playerSpeed * gameConfig.player.barrelKickStrength, gameConfig.barrels.kickMaxStrength);
                  b.kickVx = (b.kickVx || 0) - (bdx / bdist) * kickStr;
                  b.kickVz = (b.kickVz || 0) - (bdz / bdist) * kickStr;
                }
              }
            });

            // Multiplayer: players cannot pass through each other
            if (isMP()) {
              const other = players.find(pp => pp !== p && pp.alive && !pp.sinking);
              if (other) {
                const pdx = p.x - other.x, pdz = p.z - other.z;
                const pdSq = pdx * pdx + pdz * pdz;
                const minD = gameConfig.player.bodyRadius * 2; // sum of two player radii
                if (pdSq < minD * minD && pdSq > 0) {
                  const pdist = Math.sqrt(pdSq);
                  const overlap = (minD - pdist) / pdist;
                  p.x += pdx * overlap * 0.5;
                  p.z += pdz * overlap * 0.5;
                  other.x -= pdx * overlap * 0.5;
                  other.z -= pdz * overlap * 0.5;
                }
              }
            }

            const _pr = gameConfig.player.bodyRadius; // player body half-width
            p.x = Math.max(-arenaLimitX + _pr, Math.min(arenaLimitX - _pr, p.x));
            p.z = Math.max(-arenaLimit + _pr, Math.min(arenaLimit - _pr, p.z));
            p.group.position.x = p.x; p.group.position.z = p.z; // y korundu (bounce animasyonu)


            // Lake edge warning
            if (!p._lakeWarnTimer) p._lakeWarnTimer = 0;
            p._lakeWarnTimer = Math.max(0, p._lakeWarnTimer - dt);
            gameState.lakes.forEach(lk => {
              const d = Math.hypot(p.x - lk.x, p.z - lk.z);
              if (d < lk.r + 12 && d > lk.r - 2 && p._lakeWarnTimer <= 0) {
                showFloatingText(p.group.position, "⚠ DANGER! LAKE!", "#ff4400");
                p._lakeWarnTimer = 2.0;
              }
            });

            if (isLakeDeath(p.x, p.z)) {
              const nearLake = gameState.lakes.find(lk => Math.hypot(p.x - lk.x, p.z - lk.z) < lk.r);
              const splashCol = nearLake ? nearLake.splashColor : 0x00ccff;
              if (p.shield) {
                breakShield(p, "SHIELD MELTED!");
                createWaterSplash(p.group.position, splashCol);
                p.x += (Math.random() - 0.5) * 25; p.z += (Math.random() - 0.5) * 25;
              } else if (p._invTimer > 0) {
                p.x += (Math.random() - 0.5) * 25; p.z += (Math.random() - 0.5) * 25;
              } else {
                vibe([80, 40, 200]);
                createWaterSplash(p.group.position, splashCol);
                if (_isOnline()) { _onlinePlayerKilled(p); return; }
                p.alive = false;
                p.sinking = true; p.sinkTimer = 2.4; p.sinkMax = 2.4; p._sinkLakeColor = splashCol; p._waterDisc = null;
                p.startMarker.visible = false; p.wireMesh.visible = false; p.wireOuterMesh.visible = false;
                if (!mpDeclareWinner(p)) triggerGameOver();
              }
            }
          });




          // --- Powerup Glass Box Update, Spawn & Pickup ---
          _ensurePowerupBoxes();
          if (gameState.active && !gameState.transitioning) {
            gameState.levelTime += dt;
            
            // Function to handle the actual spawning
            const _spawnBox = (type) => {
              let rx, rz, ok = false, att = 0;
              const arenaBounds = ARENA_LIMIT * 0.75;
              while (!ok && att < 50) {
                att++;
                rx = (Math.random() - 0.5) * ARENA_LIMIT_X * 1.4;
                rz = (Math.random() - 0.5) * arenaBounds * 1.4;
                if (Math.hypot(rx, rz) < 50) continue;
                let blocked = false;
                gameState.entities.trees.forEach(t => { if (Math.hypot(rx - t.x, rz - t.z) < t.radius + 15) blocked = true; });
                gameState.lakes.forEach(l => { if (Math.hypot(rx - l.x, rz - l.z) < l.r + 15) blocked = true; });
                if (!blocked) ok = true;
              }
              if (ok) {
                const pBox = createPowerupBox(type);
                pBox.group.position.set(rx, 0, rz);
                worldGroup.add(pBox.group);
                gameState.entities.powerupBoxes.push({ ...pBox, active: true, x: rx, z: rz });
              }
            };

            // Spawn Bomb Box every 30s
            gameState.bombBoxTimer -= dt;
            if (gameState.bombBoxTimer <= 0) {
              gameState.bombBoxTimer = 30;
              _spawnBox('bomb');
            }
          }

          gameState.entities.powerupBoxes.forEach(pb => {
            if (!pb.active) return;
            // Animation: slow rotation
            pb.group.rotation.y += dt * 0.8;
            if (pb.icon) pb.icon.position.y = 18.72 / 2 + Math.sin(time * 3 + pb.x) * 1.5;

            players.forEach(p => {
              if (!p.alive || !pb.active) return;
              const dist = Math.hypot(p.x - pb.x, p.z - pb.z);
              if (dist < 28.0) { // Increased pickup radius for easier collection
                pb.active = false;
                worldGroup.remove(pb.group);
                applyMysteryEffect(pb.type, p, pb.group.position.clone());
                playSfx('pickup');
                createSmokePuff(pb.group.position);
              }
            });
          });

          // Level diamonds: animate + collect
          if (gameState.entities.diamonds) {
            const _dPool = [];
            gameState.entities.diamonds.forEach(d => {
              if (!d.active) return;
              d.group.rotation.y += dt * 1.2;
              d.group.position.y = 14 + Math.sin(time * 2.5 + d.x) * 3;
              players.forEach(p => {
                if (!p.alive || !d.active) return;
                if (Math.hypot(p.x - d.x, p.z - d.z) < 24) {
                  d.active = false;
                  worldGroup.remove(d.group);
                  const eff = _dPool[Math.floor(Math.random() * _dPool.length)];
                  applyMysteryEffect(eff, p, d.group.position.clone());
                  playSfx('pickup');
                  createSmokePuff(d.group.position);
                }
              });
            });
          }

          // MP BOMB PHASE timer (diamond spawn disabled)
          if (isMP() && gameState.levelComplete && players.some(p => p.inBombPhase) && !gameState.transitioning) {
            gameState.mpBombPhaseTimer = (gameState.mpBombPhaseTimer || 0) + dt;
          }

          // ALL ENEMIES DEAD → START RESCUE SEQUENCE
          const allZombiesDead = gameState.zombiesSpawned >= gameState.targetKills &&
            gameState.entities.zombies.every(z => !z.active) &&
            true;

          // ── BALL SPAWN + ANIMATION ──────────────────────────────────────────
          if (gameState.cannonTimer !== Infinity) {
            gameState.cannonTimer -= dt;
            if (gameState.cannonTimer <= 0) {
              const lvl = gameState.level;
              const maxCannons = Math.min(10, 3 + Math.floor((lvl - 3) / 3));
              const active = cannons.filter(c => c.active).length;
              if (active < maxCannons) spawnCannon();
              gameState.cannonTimer = gameState.cannonPeriod * (0.8 + Math.random() * 0.4);
            }
          }

          cannons.forEach(c => {
            if (!c.active) return;
            if (c.state === 'stuck') {
              c.stuckTimer -= dt;
              if (c.stuckTimer <= 0) {
                c.fallVY += -320 * dt;
                c.ballY += c.fallVY * dt;
                c.ball.position.y = c.ballY;
                if (c.ballY < -60) {
                  c.active = false;
                  worldGroup.remove(c.ball);
                }
              }
              return;
            }
            if (c.state === 'emerging') {
              c.emergeTimer -= dt;
              const prog = Math.max(0, 1 - c.emergeTimer / 2.0);
              c.barrel.position.z = -16 + prog * 20;
              if (c.emergeTimer <= 0) { c.state = 'ready'; }
            } else if (c.state === 'ready') {
              c.fireTimer -= dt;
              // Bowstring tension animation — center point pulled back
              if (c.stringLine) {
                const pullT = Math.max(0, 1 - c.fireTimer / 3.0);
                const stringZ = 10 - pullT * 18; // 10'dan -8'e gerilir
                const pos = c.stringLine.geometry.attributes.position;
                pos.setXYZ(0, -30, 0, 10);
                pos.setXYZ(1, 0, 0, stringZ);
                pos.setXYZ(2, 30, 0, 10);
                pos.needsUpdate = true;
              }
              if (c.fireTimer <= 0) {
                // String released — instantly launches forward
                if (c.stringLine) {
                  const pos = c.stringLine.geometry.attributes.position;
                  pos.setXYZ(0, -30, 0, 10);
                  pos.setXYZ(1, 0, 0, 10);
                  pos.setXYZ(2, 30, 0, 10);
                  pos.needsUpdate = true;
                }
                c.state = 'fired';
                playSfx('whoosh');
                c.ball.visible = true;
                c.ballX = c.wx + c.dx * 16;
                c.ballZ = c.wz + c.dz * 16;
                c.ball.position.set(c.ballX, 8, c.ballZ);
                c.retractTimer = 2.0;
              }
            } else if (c.state === 'fired') {
              // Arrow movement — flies straight, does not rotate
              c.ballX += c.dx * c.speed * dt;
              c.ballZ += c.dz * c.speed * dt;
              c.ball.position.set(c.ballX, 8, c.ballZ);
              // Barrel recoils
              c.retractTimer -= dt;
              const retProg = Math.max(0, 1 - c.retractTimer / 2.0);
              c.barrel.position.z = 4 - retProg * 20;
              // Hitting player — ball continues, player dies
              players.forEach(p => {
                if (!p.alive || gameState.levelComplete || p._invTimer > 0) return;
                if (Math.hypot(p.x - c.ballX, p.z - c.ballZ) < 14) {
                  if (p.shield) {
                    createSmokePuff(c.ball.position.clone());
                    breakShield(p, 'SHIELD BROKEN!');
                  } else if (!p._cannonHit) {
                    p._cannonHit = true;
                    if (_isOnline()) { _onlinePlayerKilled(p); return; }
                    playerDeathScatter(p);
                    p.alive = false; p.group.visible = false; p.startMarker.visible = false; p.wireMesh.visible = false; p.wireOuterMesh.visible = false;
                    if (!mpDeclareWinner(p)) triggerGameOver();
                  }
                }
              });
              // Hitting zombies — ball continues, kills each zombie
              gameState.entities.zombies.forEach(z => {
                if (!z.active || z._cannonKilled) return;
                if (Math.hypot(z.group.position.x - c.ballX, z.group.position.z - c.ballZ) < 16) {
                  cannonballKillZombie(z, c.dx, c.dz);
                }
              });
              // Arrow hits ground bombs — detonate immediately
              activeBombs.forEach(b => {
                if (b.done) return;
                if (Math.hypot(c.ballX - b.group.position.x, c.ballZ - b.group.position.z) < 18) {
                  b.fuseTimer = 0;
                }
              });
              // Arrow hits barrels — trigger blast
              gameState.entities.barrels.forEach(b => {
                if (!b.active) return;
                if (Math.hypot(c.ballX - b.mesh.position.x, c.ballZ - b.mesh.position.z) < 16) {
                  b.active = false; b.mesh.visible = false;
                  triggerBarrelBlast(b.mesh.position, 0);
                }
              });

              // Hitting cage or 3D obstacles (rock/cactus/stone) — arrow drops and disappears
              let arrowHit = false;
              if (cagedGirl && gameState.cagePos &&
                Math.hypot(c.ballX - gameState.cagePos.x, c.ballZ - gameState.cagePos.z) < 15) {
                arrowHit = true;
              }
              if (!arrowHit && gameState.entities.trees) {
                for (const t of gameState.entities.trees) {
                  if (Math.hypot(c.ballX - t.x, c.ballZ - t.z) < t.radius + 4) {
                    arrowHit = true; break;
                  }
                }
              }
              if (arrowHit) {
                c.state = 'stuck';
                c.stuckTimer = 0.18;
                c.fallVY = 0;
                c.ballY = 8;
                worldGroup.remove(c.grp); worldGroup.remove(c.hole);
                return;
              }

              // Out of arena or retraction complete → remove cannon
              const ballOut = Math.abs(c.ballX) > ARENA_LIMIT_X + 20 || Math.abs(c.ballZ) > ARENA_LIMIT + 20;
              if (ballOut) {
                c.ball.visible = false;
                if (c.retractTimer <= -2.0) {
                  c.active = false;
                  worldGroup.remove(c.grp); worldGroup.remove(c.hole); worldGroup.remove(c.ball);
                }
              } else if (c.retractTimer <= -2.0 && !ballOut) {
                // Retraction done but ball still inside — only remove cannon structure
                c.active = false;
                worldGroup.remove(c.grp); worldGroup.remove(c.hole);
              }
            }
          });

          // ── CORNER BALL ANIMATION ───────────────────────────────────────────
          wallCannons.forEach(wc => {
            if (!wc.active) return;
            // Barrel sweep
            wc.sweepAngle += wc.sweepDir * wc.sweepSpeed * dt;
            if (wc.sweepAngle >= Math.PI / 4) { wc.sweepAngle = Math.PI / 4; wc.sweepDir = -1; }
            if (wc.sweepAngle <= -Math.PI / 4) { wc.sweepAngle = -Math.PI / 4; wc.sweepDir = 1; }
            wc.pivot.rotation.y = wc.sweepAngle;
            // Fire timer
            if (!wc.ballFlying) {
              if (wc.cooldown > 0) { wc.cooldown -= dt; }
              else if (wc.shootIn < 0) { wc.shootIn = 0.4 + Math.random() * 1.6; }
              else {
                wc.shootIn -= dt;
                if (wc.shootIn <= 0) {
                  // FIRE
                  const wa = wc.centerA + wc.sweepAngle;
                  wc.ballDX = Math.sin(wa); wc.ballDZ = Math.cos(wa);
                  wc.ballX = wc.cx + Math.sin(wc.centerA) * 5 + wc.ballDX * 32.5;
                  wc.ballZ = wc.cz + Math.cos(wc.centerA) * 5 + wc.ballDZ * 32.5;

                  wc.ballStartX = wc.ballX;
                  wc.ballStartZ = wc.ballZ;
                  wc.ballStartY = 10;
                  wc.targetDist = 120 + Math.random() * 220;
                  wc.flightTime = wc.targetDist / (wc.ballSpeed * 0.6);
                  wc.flightAge = 0;
                  wc.arcHeight = 60 + Math.random() * 80;

                  wc.ball.position.set(wc.ballX, wc.ballStartY, wc.ballZ);
                  wc.ball.visible = true; wc.ballFlying = true;
                  wc.shootIn = -1;
                  // Position drop point shadow
                  const landX = wc.ballStartX + wc.ballDX * wc.targetDist;
                  const landZ = wc.ballStartZ + wc.ballDZ * wc.targetDist;
                  wc.shadowMesh.position.set(landX, 1.2, landZ);
                  wc.shadowMesh.visible = true;
                  wc.shadowMat.opacity = 0.12;
                  // Reset period after firing (basePeriod + small random offset)
                  wc.cooldown = wc.basePeriod + (Math.random() * 2.0 - 1.0);
                  createSmokePuff(new THREE.Vector3(wc.ballX, 10, wc.ballZ));
                }
              }
            }
            // Ball flight
            if (wc.ballFlying) {
              wc.flightAge += dt;
              let prog = wc.flightAge / wc.flightTime;
              if (prog >= 1.0) prog = 1.0;

              wc.ballX = wc.ballStartX + wc.ballDX * wc.targetDist * prog;
              wc.ballZ = wc.ballStartZ + wc.ballDZ * wc.targetDist * prog;
              let bY = wc.ballStartY * (1 - prog) + wc.arcHeight * Math.sin(prog * Math.PI);
              wc.ball.position.set(wc.ballX, bY, wc.ballZ);

              // Shadow: darkens and shakes as projectile approaches
              if (wc.shadowMesh.visible) {
                const pulse = 0.5 + 0.5 * Math.sin(time * 14);
                wc.shadowMat.opacity = 0.12 + prog * prog * 0.58 + pulse * 0.08 * prog;
                const sc = 1.0 + (1.0 - prog) * 0.25 - prog * 0.15;
                wc.shadowMesh.scale.setScalar(sc);
              }

              if (bY < 15 && prog < 1.0) {
                players.forEach(p => {
                  if (!p.alive || gameState.levelComplete) return;
                  if (Math.hypot(p.x - wc.ballX, p.z - wc.ballZ) < 14) {
                    if (p.shield) { createSmokePuff(wc.ball.position.clone()); breakShield(p, 'SHIELD BROKEN!'); wc.ballFlying = false; wc.ball.visible = false; wc.shadowMesh.visible = false; wc.shadowMesh.scale.setScalar(1.0); }
                    else if (!p._cannonHit && !(p._invTimer > 0)) { p._cannonHit = true; if (_isOnline()) { _onlinePlayerKilled(p); return; } playerDeathScatter(p); p.alive = false; p.group.visible = false; p.isDrawingWire = false; p.wirePoints = []; p.startMarker.visible = false; p.wireMesh.geometry.dispose(); p.wireMesh.geometry = new THREE.BufferGeometry(); p.wireOuterMesh.geometry.dispose(); p.wireOuterMesh.geometry = new THREE.BufferGeometry(); if (!mpDeclareWinner(p) && !gameState.transitioning) { gameState.transitioning = true; setTimeout(() => { setTimeout(() => startGame(gameState.level), 3000); }, 1000); } }
                  }
                });
              }

              if (prog >= 1.0) {
                wc.ballFlying = false; wc.ball.visible = false;
                wc.shadowMesh.visible = false; wc.shadowMesh.scale.setScalar(1.0);
                const hitPos = new THREE.Vector3(wc.ballX, 0, wc.ballZ);
                playSfx('boom'); // Top yere çarptığında patlama sesi
                createSmokePuff(hitPos);
                createNapalmBlast(hitPos, 18); // Burns those entering / standing inside
                const _wcHitBarrels = [];
                gameState.entities.barrels.forEach(b => {
                  if (!b.active) return;
                  if (Math.hypot(b.mesh.position.x - hitPos.x, b.mesh.position.z - hitPos.z) < 18 + gameConfig.barrels.collisionRadius) {
                    b.active = false; b.mesh.visible = false;
                    _wcHitBarrels.push(b.mesh.position.clone());
                  }
                });
                _wcHitBarrels.forEach((cp, i) => setTimeout(() => triggerBarrelBlast(cp, 0), 200 * i));
              }
            }
          });

          if (allZombiesDead && !gameState.levelComplete) {
            gameState.levelComplete = true;
            if (isMP()) {
              // Force-check bomb phase for both players (safety net if per-kill tracking was off)
              players.forEach(p => { p.zombiesLeft = 0; _checkPlayerBombPhase(p); });
              gameState.mpBombPhaseTimer = 0;
              gameState.mpBombDiamondTimer = 40;
            } else {
              gameState.rescueReady = true;
              if (!rescueRing && cagedGirl) {
                const cp = gameState.cagePos;
                const ringMat = new THREE.MeshBasicMaterial({ color: 0xffee44, transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthWrite: false });
                rescueRing = new THREE.Mesh(new THREE.RingGeometry(28, 33, 64), ringMat);
                rescueRing.rotation.x = -Math.PI / 2;
                rescueRing.position.set(cp.x, 1.5, cp.z);
                rescueRing.userData.mat = ringMat;
                worldGroup.add(rescueRing);
              }
            }
          }

          // IF APPROACHING RESCUE SEQUENCE
          if (gameState.rescueReady && !gameState.rescueDone && !gameState.transitioning && cagedGirl) {
            players.forEach(p => {
              if (!p.alive || gameState.rescueDone) return;
              const cp = gameState.cagePos;
              if (Math.hypot(p.x - cp.x, p.z - cp.z) < 30) {
                gameState.rescueDone = true;
                gameState.transitioning = true;
                gameState.doorOpening = true;
                gameState.doorProgress = 0;
                if (rescueRing) { rescueRing.visible = false; }
                spawnFloatingHearts(cp);
                players.forEach(p2 => { p2.isDrawingWire = false; p2.wirePoints = []; p2.wireMesh.geometry.setFromPoints([]); p2.startMarker.visible = false; });
                showFloatingText(new THREE.Vector3(cp.x, 18, cp.z), "🩷 RESCUED! LEVEL COMPLETE!", "#ff80ab");
                vibe([100, 60, 100, 60, 300]);
                setTimeout(() => { if (gameState.active && gameState.level < 30) { startGame(gameState.level + 1); } }, 2500);
              }
            });
          }

          // Yellow ring — opacity pulse only
          if (rescueRing && rescueRing.visible && gameState.rescueReady && !gameState.rescueDone) {
            rescueRing.userData.mat.opacity = 0.60 + Math.sin(time * 4) * 0.32;
          }

          // Fuse / countdown timer
          if (!gameState.levelComplete && !gameState.transitioning && !gameState.fuseDead && gameState.levelDuration > 0 && !isMP()) {
            gameState.fuseProgress += dt / gameState.levelDuration;
            if (gameState.fuseProgress >= 1.0) {
              gameState.fuseProgress = 1.0;
              gameState.fuseDead = true;
              if (gameState.transitioning) return;
              gameState.transitioning = true;
              const cp = gameState.cagePos;
              const cagePos = new THREE.Vector3(cp ? cp.x : 0, 0, cp ? cp.z : 0);

              // ── Fire blast + smoke ──────────────────────────────────────────────
              createFireExplosion(cagePos);
              createFireExplosion(cagePos.clone().add(new THREE.Vector3(10, 0, 0)));
              createFireExplosion(cagePos.clone().add(new THREE.Vector3(-10, 0, 0)));
              createFireExplosion(cagePos.clone().add(new THREE.Vector3(0, 0, 10)));
              createSmokePuff(cagePos);
              createSmokePuff(cagePos.clone().add(new THREE.Vector3(5, 0, 5)));

              // ── Red light ───────────────────────────────────────────────────────
              const fireL = new THREE.PointLight(0xff2200, 1200, 350);
              fireL.position.set(cp.x, 40, cp.z);
              worldGroup.add(fireL);

              // ── Dinamit yok olur ──────────────────────────────────────────
              if (cagedGirl && cagedGirl.dynGroup) cagedGirl.dynGroup.visible = false;

              // ── Brown wooden frame → black, girl → black ───────────────────────
              if (cagedGirl && cagedGirl.group) {
                const charMat = new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 1.0, metalness: 0.0 });
                cagedGirl.group.traverse(c => {
                  if (!c.isMesh) return;
                  const col = c.material.color;
                  // Turn brown wooden or girl meshes black
                  if (col) { const h = col.getHex(); if (h === 0x5d3a1a || h === 0x3e2005 || c.parent === cagedGirl.girl || c.parent?.parent === cagedGirl.girl) c.material = charMat; }
                });
                // Turn girl completely black
                if (cagedGirl.girl) cagedGirl.girl.traverse(c => { if (c.isMesh) c.material = charMat; });
              }

              setTimeout(() => { worldGroup.remove(fireL); startGame(gameState.level); }, 5000);
            }
            // Advance spark along fuse + animasyon
            if (fuseBallMesh && fuseLinePts.length >= 2) {
              // Calculate total path length, position on correct segment
              let totalLen = 0;
              for (let i = 1; i < fuseLinePts.length; i++) totalLen += fuseLinePts[i - 1].distanceTo(fuseLinePts[i]);
              let travel = gameState.fuseProgress * totalLen;
              for (let i = 1; i < fuseLinePts.length; i++) {
                const segLen = fuseLinePts[i - 1].distanceTo(fuseLinePts[i]);
                if (travel <= segLen || i === fuseLinePts.length - 1) {
                  fuseBallMesh.position.lerpVectors(fuseLinePts[i - 1], fuseLinePts[i], Math.min(travel / segLen, 1));
                  break;
                }
                travel -= segLen;
              }

              // ── Spark animation ─────────────────────────────────────────────────
              const ud = fuseBallMesh.userData;
              if (ud.rayGroup) {
                // Star rays rotate fast
                ud.rayGroup.rotation.y += dt * 8.5;
                ud.rayGroup.rotation.x += dt * 3.2;
              }
              // Flickering light
              if (ud.sLight) {
                const flicker = 0.75 + Math.sin(time * 23) * 0.15 + Math.sin(time * 47) * 0.1;
                ud.sLight.intensity = 200 * flicker;
              }
              // Hale nefes alma (puls)
              if (ud.haloIn) { const s = 0.85 + Math.sin(time * 18) * 0.18; ud.haloIn.scale.setScalar(s); }
              if (ud.haloOut) { const s = 0.7 + Math.sin(time * 11 + 1) * 0.3; ud.haloOut.scale.setScalar(s); }
              // Flying spark particles — randomly refresh each frame
              if (ud.sparkAttr) {
                const arr = ud.sparkAttr.array;
                for (let k = 0; k < arr.length; k += 3) {
                  arr[k] = (Math.random() - 0.5) * 3.5;
                  arr[k + 1] = Math.random() * 2.25;
                  arr[k + 2] = (Math.random() - 0.5) * 3.5;
                }
                ud.sparkAttr.needsUpdate = true;
              }
            }
          }

          // Freeze timer
          if (gameState.freezeTimer > 0) {
            gameState.freezeTimer -= dt;
            gameState._wasFrozen = true;
            // Ice material swap for frozen zombies (does not modify shared material)
            gameState.entities.zombies.forEach(z => {
              if (!z.active || z.isFalling || z.shocked) return;
              z.group.traverse(c => {
                if (c.isMesh && !c.userData.isOutline && c.userData.origMat && c.material !== matCache.zFrozen)
                  c.material = matCache.zFrozen;
              });
            });
          } else if (gameState._wasFrozen) {
            gameState._wasFrozen = false;
            // Freeze over — return to original materials
            gameState.entities.zombies.forEach(z => {
              if (!z.active || z.shocked) return;
              z.group.traverse(c => {
                if (c.isMesh && !c.userData.isOutline && c.userData.origMat) c.material = c.userData.origMat;
              });
            });
          }

          if (gameState.zombiesAwake) {
            gameState.entities.zombies.forEach(z => {
              if (!z.active) return;

              if (z.isFalling) {
                z.fallTime -= dt;
                z.group.rotation.x -= dt * 3.0;
                if (z.fallTime <= 0) { z.active = false; z.group.visible = false; }
                return;
              }

              // FROZEN — do not move
              if (gameState.freezeTimer > 0 && !z.shocked) return;

              if (z.shocked) {
                z.shockTimer -= dt;
                z.smokeTimer -= dt;
                const totalTime = z.shockTimerMax || 1.2;
                const elapsed = totalTime - z.shockTimer;
                const phase1End = totalTime * 0.6; // first 60% electric glow

                if (elapsed < phase1End) {
                  // PHASE 1 — electric glow: bone color preserved, only emissive glow flickers
                  const electricColors = [0x00e5ff, 0xffffff, 0x80ffff, 0x00ffff, 0xaae8ff];
                  const ec = electricColors[Math.floor(Math.random() * electricColors.length)];
                  const intensity = 2.5 + Math.random() * 3.5;
                  z.group.traverse(c => {
                    if (c.isMesh && c.userData.shockMat) {
                      c.userData.shockMat.emissive.setHex(ec);
                      c.userData.shockMat.emissiveIntensity = Math.random() < 0.65 ? intensity : 0.2;
                    }
                  });
                  // Vibration
                  z.group.position.x += (Math.random() - 0.5) * 1.5;
                  z.group.position.z += (Math.random() - 0.5) * 1.5;
                  // Duman
                  if (z.smokeTimer <= 0) {
                    z.smokeTimer = 0.06;
                    const sm = new THREE.Mesh(geoCache.smoke, matCache.smoke);
                    sm.position.set(z.group.position.x + (Math.random() - 0.5) * 4, z.group.position.y + 8 + Math.random() * 4, z.group.position.z + (Math.random() - 0.5) * 4);
                    scene.add(sm);
                    explosions.push({ parts: [{ mesh: sm, vx: (Math.random() - 0.5) * 8, vy: 18 + Math.random() * 12, vz: (Math.random() - 0.5) * 8, isSmoke: true }], life: 0.5 });
                  }
                } else {
                  // PHASE 2 — charcoal black: apply only once
                  if (!z._charApplied) {
                    z._charApplied = true;
                    const charMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 1.0, metalness: 0.0 });
                    z.group.traverse(c => { if (c.isMesh && !c.userData.isOutline) c.material = charMat; });
                  }
                  // Hafif siyah duman
                  if (z.smokeTimer <= 0) {
                    z.smokeTimer = 0.12;
                    const sm = new THREE.Mesh(geoCache.smoke, matCache.smoke);
                    sm.position.set(z.group.position.x + (Math.random() - 0.5) * 3, z.group.position.y + 6 + Math.random() * 3, z.group.position.z + (Math.random() - 0.5) * 3);
                    scene.add(sm);
                    explosions.push({ parts: [{ mesh: sm, vx: (Math.random() - 0.5) * 4, vy: 10 + Math.random() * 8, vz: (Math.random() - 0.5) * 4, isSmoke: true }], life: 0.4 });
                  }
                }

                if (z.shockTimer <= 0) {
                  removeShockVisuals(z);
                  if (z.dropType) {
                    const killer = z._killedBy || players[0];
                    if (z.dropType === 'bomb') {
                      if (isMP()) {
                        killer.bombMax = (killer.bombMax || 3) + 1;
                        showFloatingText(z.group.position, '💣 +1 BOMBA HAKKI!', '#ff6600');
                        updateMpHud(gameState, players, gameMode);
                      } else {
                        killer.bombs = (killer.bombs || 0) + 1;
                        showFloatingText(z.group.position, '+BOMB', '#ff6600');
                        updateBombUI(players);
                      }
                    } else if (z.dropType === 'shield') {
                      killer.shields = (killer.shields || 0) + 1;
                      killer.shield = true;
                      updateShieldUI(players);
                      showFloatingText(z.group.position, '+SHIELD', '#42a5f5');
                    }
                    z.dropType = null;
                    if (z._dropMeshes) { Object.values(z._dropMeshes).forEach(m => { m.visible = false; }); }
                  }
                  z.active = false; z.group.visible = false;
                  z.group.rotation.set(0, 0, 0);
                  createSmokePuff(z.group.position);
                }
                return;
              }

              // Update wander offset — each zombie targets different point
              z.wanderTimer = (z.wanderTimer || 0) - dt;
              if (z.wanderTimer <= 0) {
                z.wanderX = (Math.random() - 0.5) * 80;
                z.wanderZ = (Math.random() - 0.5) * 80;
                z.wanderTimer = 3 + Math.random() * 4;
              }

              let cd = Infinity, tX = z.group.position.x, tZ = z.group.position.z;
              const targetPool = (isMP() && z.teamIdx >= 0) ? [players[z.teamIdx]] : players;
              targetPool.forEach(p => {
                if (p.alive) {
                  const d = Math.hypot(p.x - z.group.position.x, p.z - z.group.position.z);
                  if (d < cd) {
                    cd = d;
                    // Deviation decreases on approach: full at 80 units, zero within 25 units
                    const wt = Math.max(0, Math.min(1, (cd - 25) / 55));
                    tX = p.x + z.wanderX * wt;
                    tZ = p.z + z.wanderZ * wt;
                  }
                }
              });

              if (cd > 0 && cd !== Infinity) {
                let angle = Math.atan2(tX - z.group.position.x, tZ - z.group.position.z);
                angle += Math.sin(time * 3 + z.group.position.x) * 0.15;
                z.dirX = Math.sin(angle); z.dirZ = Math.cos(angle);
              }

              // Rotate and bob drop indicator
              if (z.dropType && z._dropMeshes) {
                const dm = z._dropMeshes[z.dropType];
                dm.rotation.y += dt * 2.2;
                dm.rotation.z += dt * 1.1;
                dm.position.y = 24 + Math.sin(time * 3 + z.group.position.x) * 1.8;
              }

              // LAKE NAVIGATION (prevents getting stuck) - apply repulsion force from lakes
              let pushX = 0, pushZ = 0;
              // Separation steering — zombies push each other, prevents piling
              const SEP_R = 14, SEP_F = 40;
              if (_frameCount % 3 === 0) {
                gameState.entities.zombies.forEach(other => {
                  if (other === z || !other.active || other.isFalling) return;
                  const sdx = z.group.position.x - other.group.position.x;
                  const sdz = z.group.position.z - other.group.position.z;
                  if (Math.abs(sdx) > SEP_R || Math.abs(sdz) > SEP_R) return;
                  const sd = Math.hypot(sdx, sdz);
                  if (sd < SEP_R && sd > 0.01) {
                    const f = (SEP_R - sd) / SEP_R;
                    pushX += (sdx / sd) * f * SEP_F;
                    pushZ += (sdz / sd) * f * SEP_F;
                  }
                });
                z._pushX = pushX; z._pushZ = pushZ;
              } else {
                pushX = z._pushX || 0; pushZ = z._pushZ || 0;
              }
              let nx = z.group.position.x + (z.dirX * z.speed + pushX) * dt;
              let nz = z.group.position.z + (z.dirZ * z.speed + pushZ) * dt;

              // Lake hard collision — route around edge like trees
              if (gameState.lakes) {
                gameState.lakes.forEach(lk => {
                  const dx = nx - lk.x, dz = nz - lk.z;
                  const dist = Math.hypot(dx, dz);
                  const minDist = lk.r + 7.0;
                  if (dist < minDist && dist > 0) {
                    nx = lk.x + (dx / dist) * minDist;
                    nz = lk.z + (dz / dist) * minDist;
                    const normX = dx / dist, normZ = dz / dist;
                    const dot = z.dirX * normX + z.dirZ * normZ;
                    if (dot < 0) {
                      z.dirX -= 2 * dot * normX;
                      z.dirZ -= 2 * dot * normZ;
                      const len = Math.hypot(z.dirX, z.dirZ);
                      if (len > 0) { z.dirX /= len; z.dirZ /= len; }
                    }
                  }
                });
              }
              const coll = applyPillarPhysics(nx, nz, gameConfig.zombies.collisionRadius);
              z.group.position.x = coll.x; z.group.position.z = coll.z;

              // Zombie pushes barrels
              gameState.entities.barrels.forEach(b => {
                if (!b.active) return;
                const bdx = z.group.position.x - b.mesh.position.x;
                const bdz = z.group.position.z - b.mesh.position.z;
                const bdist = Math.hypot(bdx, bdz);
                const minD = gameConfig.barrels.collisionRadius + gameConfig.zombies.collisionRadius * 0.6;
                if (bdist < minD && bdist > 0.01) {
                  const push = (minD - bdist) / bdist;
                  z.group.position.x += bdx * push * 0.3;
                  z.group.position.z += bdz * push * 0.3;
                  b.kickVx = (b.kickVx || 0) - (bdx / bdist) * z.speed * 0.6;
                  b.kickVz = (b.kickVz || 0) - (bdz / bdist) * z.speed * 0.6;
                }
              });

              z.group.position.x = Math.max(-arenaLimitX, Math.min(arenaLimitX, z.group.position.x));
              z.group.position.z = Math.max(-arenaLimit, Math.min(arenaLimit, z.group.position.z));

              z.group.rotation.y = Math.atan2(z.dirX, z.dirZ);
              const zDist = z.speed * dt;
              tickZombieWalkAnim(z, zDist, dt);
              tickZombieJawAnim(z);
              // Halo animation — attached to skull, slow rotation only
              if (z._teamCapMesh && z._teamCapMesh.visible) {
                z._teamCapMesh.rotation.z += dt * 1.2;
              }

              players.forEach(p => {
                if (!gameState.levelComplete && p.alive && !(p._invTimer > 0) && Math.hypot(p.x - z.group.position.x, p.z - z.group.position.z) < (z.type === 1 ? gameConfig.zombies.killRadiusLarge : gameConfig.zombies.killRadiusSmall)) {
                  if (p.shield) {
                    z.active = false; z.group.visible = false; createSmokePuff(z.group.position);
                    breakShield(p, "KALKAN KIRILDI!");
                    return;
                  }
                  if (_isOnline()) {
                    z.active = false; z.group.visible = false; createSmokePuff(z.group.position);
                    if (isMP() && z.teamIdx >= 0) { const owner = players[z.teamIdx]; owner.zombiesLeft = Math.max(0, owner.zombiesLeft - 1); _checkPlayerBombPhase(owner); }
                    _onlinePlayerKilled(p); return;
                  }
                  playerDeathScatter(p);
                  p.alive = false; p.group.visible = false; p.isDrawingWire = false; p.wirePoints = []; p.startMarker.visible = false; p.wireMesh.geometry.dispose(); p.wireMesh.geometry = new THREE.BufferGeometry(); p.wireOuterMesh.geometry.dispose(); p.wireOuterMesh.geometry = new THREE.BufferGeometry();
                  if (!isMP() || !mpDeclareWinner(p)) triggerGameOver();
                }
              });
            });
          }

        }
        // Continuously update timers in HUD
        if (gameState.active) { updateHUD(gameState, players); if (isMP()) updateMpHud(gameState, players, gameMode); }

        // GIRL CHARACTER ANIMATION
        tickCagedGirlAnim(cagedGirl, dt);

        // ── Lake sinking animation (also runs during transitioning) ──
        players.forEach(p => tickPlayerSink(p, dt));

        // ── Cage door opening animation (also runs during transitioning) ──
        tickDoorOpen(cagedGirl, dt);

        // ── Flying hearts (also runs during transitioning) ──────────────────
        tickFloatingHearts(dt);


        // ── BARREL KICK MOTION ───────────────────────────────────────────────
        gameState.entities.barrels.forEach(b => {
          if (!b.active || (!b.kickVx && !b.kickVz)) return;
          b.mesh.position.x += (b.kickVx || 0) * dt;
          b.mesh.position.z += (b.kickVz || 0) * dt;
          b.kickVx = (b.kickVx || 0) * (1 - dt * 1);
          b.kickVz = (b.kickVz || 0) * (1 - dt * 1);
          if (Math.hypot(b.kickVx, b.kickVz) < 0.5) { b.kickVx = 0; b.kickVz = 0; }
        });

        // ── ACTIVE BOMBS ─────────────────────────────────────────────────────

        activeBombs = activeBombs.filter(b => {
          if (b.done) return false;
          // Kick motion — fades with friction
          if (b.kickVx || b.kickVz) {
            b.group.position.x += (b.kickVx || 0) * dt;
            b.group.position.z += (b.kickVz || 0) * dt;
            b.kickVx = (b.kickVx || 0) * (1 - dt * 8);
            b.kickVz = (b.kickVz || 0) * (1 - dt * 8);
            if (Math.hypot(b.kickVx, b.kickVz) < 0.5) { b.kickVx = 0; b.kickVz = 0; }
          }
          b.fuseTimer -= dt;
          b.sparkTimer -= dt;
          // Spark flicker
          if (b.sparkTimer <= 0) {
            b.sparkTimer = 0.06 + Math.random() * 0.08;
            const colors = [0xff6600, 0xffcc00, 0xffffff, 0xff3300];
            b.spark.material.color.setHex(colors[Math.floor(Math.random() * colors.length)]);
            b.spark.scale.setScalar(0.7 + Math.random() * 0.6);
            b.sparkLight.intensity = 60 + Math.random() * 80;
            // Small spark particles
            if (Math.random() < 0.5) {
              const sp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 4, 4),
                new THREE.MeshBasicMaterial({ color: 0xffaa00 }));
              const wp = new THREE.Vector3(); b.spark.getWorldPosition(wp);
              sp.position.copy(wp);
              scene.add(sp);
              const sv = { mesh: sp, vx: (Math.random() - 0.5) * 30, vy: Math.random() * 25 + 10, vz: (Math.random() - 0.5) * 30, life: 0, isFire: true };
              explosions.push({ parts: [sv], life: 0.25 });
            }
          }
          // Fuse burning — spark moves toward body
          const prog = 1 - Math.max(0, b.fuseTimer) / 5.0;
          b.spark.position.set(3.2 - prog * 1.8, 16.2 - prog * 2.5, 0);
          b.sparkLight.position.copy(b.spark.position);
          // Balloon pulse — faster and bigger as fuse runs out
          b._pulseT = (b._pulseT || 0) + dt;
          const pulseSpeed = 2.5 + prog * 7.0;
          const pulseAmp  = 0.08 + prog * 0.22;
          const pulse = 1.0 + Math.sin(b._pulseT * pulseSpeed) * pulseAmp;
          b.group.scale.setScalar(pulse);
          // Patlama!
          if (b.fuseTimer <= 0) {
            bombExplode(b);
            return false;
          }
          return true;
        });

        // ── CANNONBALL BONE SCATTER ANIMATION ───────────────────────────────
        cannonScatters = cannonScatters.filter(s => {
          s.life += dt;
          s.pieces.forEach(p => {
            if (s.life < p.delay) return;
            if (!p.landed) {
              p.mesh.position.x += p.vx * dt;
              p.mesh.position.z += p.vz * dt;
              p.mesh.position.y += p.vy * dt;
              p.vy -= 320 * dt; // gravity
              p.mesh.rotation.x += p.rvx * dt;
              p.mesh.rotation.y += p.rvy * dt;
              p.mesh.rotation.z += p.rvz * dt;
              if (p.mesh.position.y <= 0.5) {
                p.mesh.position.y = 0.5;
                p.vy = 0; p.vx *= 0.15; p.vz *= 0.15;
                p.landed = true;
              }
            }
          });
          if (s.life >= s.maxLife) {
            // Toz bulutu ve temizlik
            createSmokePuff(s.origin);
            s.pieces.forEach(p => scene.remove(p.mesh));
            return false;
          }
          return true;
        });

        // Kamera Takibi — sadece mobilde dinamik, masaüstünde sabit
        if (isMobile) {
          const p0 = players[0];
          if (p0 && p0.alive) {
            const deadZ = ARENA_LIMIT / 3;
            let targetZ = 0;
            if (p0.z > deadZ) targetZ = ((p0.z - deadZ) / (ARENA_LIMIT * 0.67)) * 95;
            else if (p0.z < -deadZ) targetZ = ((p0.z + deadZ) / (ARENA_LIMIT * 0.67)) * 95;
            cameraDynZ += (targetZ - cameraDynZ) * Math.min(1, dt * 3.5);

            const zone5Start = ARENA_LIMIT_X * 0.6;
            const zone1Start = -ARENA_LIMIT_X * 0.6;
            let targetX = 0;
            if (p0.x > zone5Start) {
              targetX = ((p0.x - zone5Start) / (ARENA_LIMIT_X * 0.4)) * 120;
            } else if (p0.x < zone1Start) {
              targetX = -((p0.x - zone1Start) / (-ARENA_LIMIT_X * 0.4)) * 120;
            }
            cameraDynX += (targetX - cameraDynX) * Math.min(1, dt * 3.5);
            cameraDynX = Math.max(-112, Math.min(75, cameraDynX));
          } else {
            cameraDynZ += (0 - cameraDynZ) * Math.min(1, dt * 3.5);
            cameraDynX += (0 - cameraDynX) * Math.min(1, dt * 3.5);
          }
        } else {
          cameraDynX = -20;
          cameraDynZ = 0;
        }

        camera.position.set(cameraDynX, 300, cameraDynZ + 252);
        camera.lookAt(cameraDynX, 0, cameraDynZ);

        if (now - _lastHudUpdate > 250) {
          _lastHudUpdate = now;
          updateHUD(gameState, players);
          if (isMP()) updateMpHud(gameState, players, gameMode);
        }
        tickBleacherSpectators(time, dt);
        renderer.render(scene, camera);
      }
      animate();

      // Mobile audio fix: resume context on first interaction
      document.addEventListener('touchstart', () => { resumeAudio(); }, { once: true });
      document.addEventListener('mousedown', () => { resumeAudio(); }, { once: true });

      // onlineRestartVote already exposed above; re-expose for safety
      window.onlineRestartVote = onlineRestartVote;
