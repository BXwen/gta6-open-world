// People: the player on foot, sidewalk pedestrians who flee from trouble,
// and rival thugs who fight back. Combat is a melee punch and a hitscan
// pistol with a tracer and floating damage numbers.
//
// Rendering: the 22 sidewalk pedestrians are drawn as instanced parts
// (legs, torso, arms, head, hair) — five draw calls for all of them.
// The player, thugs and the occasional fleeing driver stay regular meshes.

import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './config.js';
import { resolveCircle, clampBounds } from './world.js';

const SKIN = [0xe8b88a, 0xc98a5e, 0x8a5a38, 0xf2c9a0];
const SHIRTS = [0x3a6fc2, 0xc23b2e, 0x3aa655, 0xe8c832, 0x7a4fb5, 0xe07b28, 0xd8d8d8, 0x4fb5b0];
const PANTS = [0x2e3238, 0x3a4a6a, 0x5a4a3a, 0x444444];

// Shared part geometries: one copy each, reused by every person.
const LEG_GEO = new THREE.BoxGeometry(0.22, 0.85, 0.24);
const TORSO_GEO = new THREE.BoxGeometry(0.62, 0.72, 0.36);
const ARM_GEO = new THREE.BoxGeometry(0.18, 0.68, 0.2);
const HEAD_GEO = new THREE.SphereGeometry(0.24, 12, 10);
const HAIR_GEO = new THREE.SphereGeometry(0.25, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
const JACKET_GEO = new THREE.BoxGeometry(0.68, 0.5, 0.42);

export function buildPersonMesh(rng, opts = {}) {
  const group = new THREE.Group();
  const skin = rng ? rng.pick(SKIN) : SKIN[0];
  const shirt = opts.shirt ?? (rng ? rng.pick(SHIRTS) : SHIRTS[0]);
  const pants = opts.pants ?? (rng ? rng.pick(PANTS) : PANTS[0]);
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.8 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.9 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.95 });
  // Legs.
  const legL = new THREE.Mesh(LEG_GEO, pantsMat);
  legL.position.set(-0.14, 0.43, 0);
  legL.castShadow = true;
  const legR = legL.clone();
  legR.position.x = 0.14;
  group.add(legL, legR);
  // Torso.
  const torso = new THREE.Mesh(TORSO_GEO, shirtMat);
  torso.position.y = 1.2;
  torso.castShadow = true;
  group.add(torso);
  // Arms.
  const armL = new THREE.Mesh(ARM_GEO, shirtMat);
  armL.position.set(-0.42, 1.2, 0);
  armL.castShadow = true;
  const armR = armL.clone();
  armR.position.x = 0.42;
  group.add(armL, armR);
  // Head.
  const head = new THREE.Mesh(HEAD_GEO, skinMat);
  head.position.y = 1.78;
  head.castShadow = true;
  group.add(head);
  // Hair cap.
  const hair = new THREE.Mesh(HAIR_GEO, new THREE.MeshStandardMaterial({ color: opts.hair ?? 0x2a2018, roughness: 1 }));
  hair.position.y = 1.82;
  group.add(hair);
  if (opts.thug) {
    // A dark jacket and a cap: Rook's crew reads hostile at a glance.
    const jacket = new THREE.Mesh(JACKET_GEO, new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.7 }));
    jacket.position.y = 1.32;
    group.add(jacket);
  }
  group.userData.limbs = { legL, legR, armL, armR, torso, head };
  return group;
}

export function createPlayer(scene, x, z) {
  const mesh = buildPersonMesh(null, { shirt: 0x2e6fc2, pants: 0x2e3238, hair: 0x1a1410 });
  scene.add(mesh);
  return {
    mesh, x, z, y: 0, vy: 0, heading: 0, onGround: true,
    health: CONFIG.playerHealth, speed: 0, walkPhase: 0, invulnerable: 0,
  };
}

export function movePlayer(player, move, dt, colliders) {
  // move: {x, z} world-space wish direction, already camera-relative.
  const speed = move.sprint ? CONFIG.sprintSpeed : CONFIG.walkSpeed;
  const len = Math.hypot(move.x, move.z);
  let vx = 0;
  let vz = 0;
  if (len > 0.01) {
    vx = (move.x / len) * speed;
    vz = (move.z / len) * speed;
    player.heading = Math.atan2(vx, vz);
  }
  let nx = player.x + vx * dt;
  let nz = player.z + vz * dt;
  const fixed = resolveCircle(nx, nz, 0.55, colliders);
  nx = fixed.x;
  nz = fixed.z;
  const clamped = clampBounds(nx, nz);
  player.x = clamped.x;
  player.z = clamped.z;
  player.speed = len > 0.01 ? speed : 0;
  // Jump and gravity.
  if (move.jump && player.onGround) {
    player.vy = CONFIG.jumpSpeed;
    player.onGround = false;
  }
  player.vy -= 24 * dt;
  player.y += player.vy * dt;
  if (player.y <= 0) {
    player.y = 0;
    player.vy = 0;
    player.onGround = true;
  }
  if (player.invulnerable > 0) player.invulnerable -= dt;
  // Walk cycle: legs and arms swing opposite, torso bobs.
  player.walkPhase += dt * player.speed * 1.6;
  const swing = player.speed > 0.1 ? Math.sin(player.walkPhase) * 0.55 : 0;
  const limbs = player.mesh.userData.limbs;
  limbs.legL.rotation.x = swing;
  limbs.legR.rotation.x = -swing;
  limbs.armL.rotation.x = -swing * 0.8;
  limbs.armR.rotation.x = swing * 0.8;
  limbs.torso.position.y = 1.2 + (player.speed > 0.1 ? Math.abs(Math.sin(player.walkPhase)) * 0.05 : 0);
  player.mesh.position.set(player.x, player.y, player.z);
  player.mesh.rotation.y = player.heading;
}

// Pedestrians: walk the sidewalks, idle or stroll, and run from crimes.
// The 22 spawned pedestrians are instanced parts; fleeing drivers (added
// when the player steals a car) are regular meshes in `extras`.
export function createPedestrians(scene, rng, colliders) {
  const group = new THREE.Group();
  scene.add(group);
  const peds = [];
  const extras = [];
  const streets = [-186, -124, -62, 0, 62, 124, 186];
  const COUNT = 22;

  // Instanced parts, white materials tinted per pedestrian via instanceColor.
  const white = (roughness) => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness });
  const legsIM = new THREE.InstancedMesh(LEG_GEO, white(0.95), COUNT * 2);
  const torsoIM = new THREE.InstancedMesh(TORSO_GEO, white(0.9), COUNT);
  const armsIM = new THREE.InstancedMesh(ARM_GEO, white(0.9), COUNT * 2);
  const headIM = new THREE.InstancedMesh(HEAD_GEO, white(0.8), COUNT);
  const hairIM = new THREE.InstancedMesh(HAIR_GEO, white(1), COUNT);
  for (const m of [legsIM, torsoIM, armsIM, headIM, hairIM]) {
    m.castShadow = true;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(m);
  }

  const _m = new THREE.Matrix4();
  const _ped = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const _v = new THREE.Vector3();
  const _s = new THREE.Vector3(1, 1, 1);
  const _c = new THREE.Color();

  function pedMatrix(ped) {
    _e.set(0, ped.heading, 0);
    _q.setFromEuler(_e);
    _v.set(ped.x, 0, ped.z);
    _ped.compose(_v, _q, _s);
    return _ped;
  }

  function partMatrix(ox, oy, oz, rx) {
    _e.set(rx, 0, 0);
    _q.setFromEuler(_e);
    _v.set(ox, oy, oz);
    _m.compose(_v, _q, _s);
    _m.premultiply(_ped);
    return _m;
  }

  function writePedInstances(index, ped, swing) {
    pedMatrix(ped);
    legsIM.setMatrixAt(index * 2, partMatrix(-0.14, 0.43, 0, swing));
    legsIM.setMatrixAt(index * 2 + 1, partMatrix(0.14, 0.43, 0, -swing));
    torsoIM.setMatrixAt(index, partMatrix(0, 1.2, 0, 0));
    armsIM.setMatrixAt(index * 2, partMatrix(-0.42, 1.2, 0, -swing * 0.8));
    armsIM.setMatrixAt(index * 2 + 1, partMatrix(0.42, 1.2, 0, swing * 0.8));
    headIM.setMatrixAt(index, partMatrix(0, 1.78, 0, 0));
    hairIM.setMatrixAt(index, partMatrix(0, 1.82, 0, 0));
  }

  function spawn(x, z) {
    const skin = rng.pick(SKIN);
    const shirt = rng.pick(SHIRTS);
    const pants = rng.pick(PANTS);
    const hair = 0x2a2018;
    const ped = {
      mesh: null, x, z, heading: rng.range(0, Math.PI * 2), speed: rng.range(1, 2.2),
      state: 'walk', fleeTimer: 0, health: 30, down: false, downTimer: 0,
      targetX: x, targetZ: z, waitTimer: rng.range(0, 4),
      skin, shirt, pants, hair, instanced: true, index: peds.length,
    };
    // Tint the instance slots once; clothes never change.
    const i = ped.index;
    legsIM.setColorAt(i * 2, _c.setHex(pants));
    legsIM.setColorAt(i * 2 + 1, _c.setHex(pants));
    torsoIM.setColorAt(i, _c.setHex(shirt));
    armsIM.setColorAt(i * 2, _c.setHex(shirt));
    armsIM.setColorAt(i * 2 + 1, _c.setHex(shirt));
    headIM.setColorAt(i, _c.setHex(skin));
    hairIM.setColorAt(i, _c.setHex(hair));
    writePedInstances(i, ped, 0);
    peds.push(ped);
    return ped;
  }

  for (let i = 0; i < COUNT; i += 1) {
    const street = rng.pick(streets);
    const along = rng.range(-200, 200);
    const side = rng.chance(0.5) ? 9.5 : -9.5;
    if (rng.chance(0.5)) spawn(street + side, along);
    else spawn(along, street + side);
  }
  for (const m of [legsIM, torsoIM, armsIM, headIM, hairIM]) {
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.instanceMatrix.needsUpdate = true;
  }

  function addExtra(ped) {
    // A fleeing driver (regular mesh). Cap the extras so a long session
    // of car thefts cannot grow the draw-call count without bound.
    if (extras.length >= 6) {
      const old = extras.shift();
      group.remove(old.mesh);
      const oi = peds.indexOf(old);
      if (oi >= 0) peds.splice(oi, 1);
    }
    ped.instanced = false;
    extras.push(ped);
    peds.push(ped);
    group.add(ped.mesh);
  }

  function nearestPed(x, z, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const ped of peds) {
      if (ped.down) continue;
      const dx = ped.x - x;
      const dz = ped.z - z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < bestD) { bestD = d; best = ped; }
    }
    return best;
  }

  function update(dt, playerPos, dangerPos, dangerRadius) {
    for (const ped of peds) {
      if (ped.down) {
        ped.downTimer -= dt;
        if (!ped.instanced) ped.mesh.rotation.x = -Math.PI / 2;
        if (ped.downTimer <= 0) {
          ped.down = false;
          if (!ped.instanced) ped.mesh.rotation.x = 0;
          ped.state = 'flee';
          ped.fleeTimer = 4;
        }
        // Down pedestrians lie flat: hide the instanced parts by scaling
        // them to zero, and show them again when they get up.
        if (ped.instanced) {
          _e.set(0, ped.heading, 0);
          _q.setFromEuler(_e);
          _v.set(ped.x, 0, ped.z);
          _m.compose(_v, _q, new THREE.Vector3(0.001, 0.001, 0.001));
          const i = ped.index;
          legsIM.setMatrixAt(i * 2, _m);
          legsIM.setMatrixAt(i * 2 + 1, _m);
          torsoIM.setMatrixAt(i, _m);
          armsIM.setMatrixAt(i * 2, _m);
          armsIM.setMatrixAt(i * 2 + 1, _m);
          headIM.setMatrixAt(i, _m);
          hairIM.setMatrixAt(i, _m);
        }
        continue;
      }
      // A crime nearby sends everyone running.
      if (dangerPos) {
        const dx = ped.x - dangerPos.x;
        const dz = ped.z - dangerPos.z;
        if (dx * dx + dz * dz < dangerRadius * dangerRadius) {
          ped.state = 'flee';
          ped.fleeTimer = 4;
        }
      }
      if (ped.state === 'flee') {
        ped.fleeTimer -= dt;
        const dx = ped.x - playerPos.x;
        const dz = ped.z - playerPos.z;
        const d = Math.hypot(dx, dz) || 1;
        ped.heading = Math.atan2(dx / d, dz / d);
        ped.speed = 6;
        if (ped.fleeTimer <= 0) ped.state = 'walk';
      } else {
        ped.waitTimer -= dt;
        if (ped.waitTimer <= 0) {
          ped.waitTimer = rng.range(3, 9);
          const street = rng.pick(streets);
          const along = rng.range(-200, 200);
          const side = rng.chance(0.5) ? 9.5 : -9.5;
          if (rng.chance(0.5)) { ped.targetX = street + side; ped.targetZ = along; }
          else { ped.targetX = along; ped.targetZ = street + side; }
        }
        const dx = ped.targetX - ped.x;
        const dz = ped.targetZ - ped.z;
        const d = Math.hypot(dx, dz);
        if (d > 1) {
          ped.heading = Math.atan2(dx / d, dz / d);
          ped.speed = 1.6;
        } else ped.speed = 0;
      }
      let nx = ped.x + Math.sin(ped.heading) * ped.speed * dt;
      let nz = ped.z + Math.cos(ped.heading) * ped.speed * dt;
      const fixed = resolveCircle(nx, nz, 0.5, colliders);
      const clamped = clampBounds(fixed.x, fixed.z);
      ped.x = clamped.x;
      ped.z = clamped.z;
      const swing = ped.speed > 0.1 ? Math.sin(performance.now() / 90 + ped.x) * 0.45 : 0;
      if (ped.instanced) {
        writePedInstances(ped.index, ped, swing);
      } else {
        ped.mesh.position.set(ped.x, 0, ped.z);
        ped.mesh.rotation.y = ped.heading;
        const limbs = ped.mesh.userData.limbs;
        limbs.legL.rotation.x = swing;
        limbs.legR.rotation.x = -swing;
        limbs.armL.rotation.x = -swing * 0.8;
        limbs.armR.rotation.x = swing * 0.8;
      }
    }
    for (const m of [legsIM, torsoIM, armsIM, headIM, hairIM]) {
      m.instanceMatrix.needsUpdate = true;
    }
  }

  return {
    peds,
    group,
    update,
    nearestPed,
    addExtra,
    knockDown(ped) {
      ped.down = true;
      ped.downTimer = 2.5;
    },
    respawnFar(playerPos) {
      // Keep the sidewalks populated: recycle peds that wandered far away.
      for (const ped of peds) {
        if (!ped.instanced) continue;
        const dx = ped.x - playerPos.x;
        const dz = ped.z - playerPos.z;
        if (dx * dx + dz * dz > 260 * 260) {
          const street = rng.pick(streets);
          const along = playerPos.z + rng.range(-80, 80);
          ped.x = street + 9.5;
          ped.z = along;
          ped.down = false;
        }
      }
    },
  };
}

// Thugs: Rook's crew. They close in and punch; they drop cash when beaten.
export function createThugs(scene, rng) {
  const group = new THREE.Group();
  scene.add(group);
  const thugs = [];

  function spawn(x, z) {
    const mesh = buildPersonMesh(rng, { thug: true, shirt: 0x8a2a2a, hair: 0x0e0c0a });
    group.add(mesh);
    const thug = {
      mesh, x, z, heading: 0, speed: 3.4, health: 60,
      attackTimer: 0, windup: 0, dead: false, punchAnim: 0,
    };
    mesh.position.set(x, 0, z);
    thugs.push(thug);
    return thug;
  }

  function update(dt, player, colliders, onHitPlayer) {
    for (const thug of thugs) {
      if (thug.dead) continue;
      const dx = player.x - thug.x;
      const dz = player.z - thug.z;
      const d = Math.hypot(dx, dz);
      thug.attackTimer -= dt;
      if (thug.windup > 0) {
        thug.windup -= dt;
        if (thug.windup <= 0 && d < 2.4) onHitPlayer(8);
        thug.punchAnim = 0.35;
      } else if (d < 2.1 && thug.attackTimer <= 0) {
        thug.windup = 0.45;
        thug.attackTimer = 1.4;
      } else if (d > 1.8) {
        thug.heading = Math.atan2(dx / d, dz / d);
        const fixed = resolveCircle(
          thug.x + Math.sin(thug.heading) * thug.speed * dt,
          thug.z + Math.cos(thug.heading) * thug.speed * dt,
          0.55, colliders,
        );
        const clamped = clampBounds(fixed.x, fixed.z);
        thug.x = clamped.x;
        thug.z = clamped.z;
      }
      thug.mesh.position.set(thug.x, 0, thug.z);
      thug.mesh.rotation.y = thug.heading;
      const limbs = thug.mesh.userData.limbs;
      const swing = Math.sin(performance.now() / 110 + thug.x) * 0.4;
      limbs.legL.rotation.x = swing;
      limbs.legR.rotation.x = -swing;
      if (thug.punchAnim > 0) {
        thug.punchAnim -= dt;
        limbs.armR.rotation.x = -1.6;
      } else {
        limbs.armR.rotation.x = thug.windup > 0 ? -2.4 : -swing * 0.8;
      }
    }
  }

  return {
    thugs,
    group,
    spawn,
    update,
    clear() {
      for (const thug of thugs) group.remove(thug.mesh);
      thugs.length = 0;
    },
    aliveCount() {
      return thugs.filter((t) => !t.dead).length;
    },
  };
}

// Combat helpers shared by the main loop: melee arc and hitscan pistol.
export function meleeHit(origin, heading, range, targets) {
  const hits = [];
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  for (const t of targets) {
    if (t.dead || t.down) continue;
    const dx = t.x - origin.x;
    const dz = t.z - origin.z;
    const d = Math.hypot(dx, dz);
    if (d > range) continue;
    const dot = (dx * fx + dz * fz) / (d || 1);
    if (dot > 0.25) hits.push({ target: t, dist: d });
  }
  return hits;
}

export function pistolRay(origin, dir, maxDist, targets, colliders) {
  // Step the ray in small increments; buildings stop it, people take it.
  const step = 0.8;
  let travelled = 0;
  let x = origin.x;
  let y = origin.y;
  let z = origin.z;
  while (travelled < maxDist) {
    x += dir.x * step;
    z += dir.z * step;
    y += dir.y * step;
    travelled += step;
    for (const c of colliders) {
      if (x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ && y < 45) {
        return { hit: null, point: { x, y, z }, blocked: true };
      }
    }
    for (const t of targets) {
      if (t.dead || t.down) continue;
      const dx = t.x - x;
      const dz = t.z - z;
      if (dx * dx + dz * dz < 1.1 && y > 0 && y < 2.4) {
        return { hit: t, point: { x, y, z }, blocked: false };
      }
    }
    if (y < 0) break;
  }
  return { hit: null, point: { x, y, z }, blocked: false };
}
