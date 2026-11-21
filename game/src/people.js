import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './config.js';
import { clampBounds, resolveCircle } from './world.js';

const SKIN_TONES = [0xe8b88a, 0xc98a5e, 0x8a5a38, 0xf2c9a0];
const TOP_COLORS = [0x3a6fc2, 0xc23b2e, 0x3aa655, 0xe8c832, 0x7a4fb5, 0xe07b28, 0xd8d8d8, 0x4fb5b0];
const LEG_COLORS = [0x2e3238, 0x3a4a6a, 0x5a4a3a, 0x444444];
const LIMB = new THREE.BoxGeometry(0.22, 0.85, 0.24);
const BODY = new THREE.BoxGeometry(0.62, 0.72, 0.36);
const ARM = new THREE.BoxGeometry(0.18, 0.68, 0.2);
const FACE = new THREE.SphereGeometry(0.24, 12, 10);
const CAP = new THREE.SphereGeometry(0.25, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
const COAT = new THREE.BoxGeometry(0.68, 0.5, 0.42);
const SIDEWALKS = [-186, -124, -62, 0, 62, 124, 186];
const WALKER_TOTAL = 22;

const choose = (rng, values) => rng ? rng.pick(values) : values[0];

export function buildPersonMesh(rng, opts = {}) {
  const person = new THREE.Group();
  const skinMaterial = new THREE.MeshStandardMaterial({ color: choose(rng, SKIN_TONES), roughness: 0.8 });
  const shirtMaterial = new THREE.MeshStandardMaterial({ color: opts.shirt ?? choose(rng, TOP_COLORS), roughness: 0.9 });
  const pantsMaterial = new THREE.MeshStandardMaterial({ color: opts.pants ?? choose(rng, LEG_COLORS), roughness: 0.95 });
  const hairMaterial = new THREE.MeshStandardMaterial({ color: opts.hair ?? 0x2a2018, roughness: 1 });
  const addPart = (geometry, material, x, y, casts = true) => {
    const part = new THREE.Mesh(geometry, material);
    part.position.set(x, y, 0);
    part.castShadow = casts;
    person.add(part);
    return part;
  };

  const leftLeg = addPart(LIMB, pantsMaterial, -0.14, 0.43);
  const rightLeg = addPart(LIMB, pantsMaterial, 0.14, 0.43);
  const torso = addPart(BODY, shirtMaterial, 0, 1.2);
  const leftArm = addPart(ARM, shirtMaterial, -0.42, 1.2);
  const rightArm = addPart(ARM, shirtMaterial, 0.42, 1.2);
  const head = addPart(FACE, skinMaterial, 0, 1.78);
  addPart(CAP, hairMaterial, 0, 1.82, false);

  if (opts.thug) {
    addPart(COAT, new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.7 }), 0, 1.32, false);
  }
  person.userData.limbs = { legL: leftLeg, legR: rightLeg, armL: leftArm, armR: rightArm, torso, head };
  return person;
}

export function createPlayer(scene, x, z) {
  const mesh = buildPersonMesh(null, { shirt: 0x2e6fc2, pants: 0x2e3238, hair: 0x1a1410 });
  scene.add(mesh);
  return { mesh, x, z, y: 0, vy: 0, heading: 0, onGround: true, health: CONFIG.playerHealth, speed: 0, walkPhase: 0, invulnerable: 0 };
}

export function movePlayer(player, move, dt, colliders) {
  const stride = move.sprint ? CONFIG.sprintSpeed : CONFIG.walkSpeed;
  const inputLength = Math.hypot(move.x, move.z);
  const moving = inputLength > 0.01;
  const velocityX = moving ? (move.x / inputLength) * stride : 0;
  const velocityZ = moving ? (move.z / inputLength) * stride : 0;
  if (moving) player.heading = Math.atan2(velocityX, velocityZ);

  const resolved = resolveCircle(player.x + velocityX * dt, player.z + velocityZ * dt, 0.55, colliders);
  const bounded = clampBounds(resolved.x, resolved.z);
  player.x = bounded.x;
  player.z = bounded.z;
  player.speed = moving ? stride : 0;

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

  player.walkPhase += dt * player.speed * 1.6;
  const limbs = player.mesh.userData.limbs;
  const swing = player.speed > 0.1 ? Math.sin(player.walkPhase) * 0.55 : 0;
  limbs.legL.rotation.x = swing;
  limbs.legR.rotation.x = -swing;
  limbs.armL.rotation.x = -swing * 0.8;
  limbs.armR.rotation.x = swing * 0.8;
  limbs.torso.position.y = 1.2 + (player.speed > 0.1 ? Math.abs(Math.sin(player.walkPhase)) * 0.05 : 0);
  player.mesh.position.set(player.x, player.y, player.z);
  player.mesh.rotation.y = player.heading;
}

export function createPedestrians(scene, rng, colliders) {
  const crowd = new THREE.Group();
  scene.add(crowd);
  const peds = [];
  const extras = [];
  const parts = [
    new THREE.InstancedMesh(LIMB, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }), WALKER_TOTAL * 2),
    new THREE.InstancedMesh(BODY, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), WALKER_TOTAL),
    new THREE.InstancedMesh(ARM, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), WALKER_TOTAL * 2),
    new THREE.InstancedMesh(FACE, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), WALKER_TOTAL),
    new THREE.InstancedMesh(CAP, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }), WALKER_TOTAL),
  ];
  const [legs, torsos, arms, heads, hair] = parts;
  for (const mesh of parts) {
    mesh.castShadow = true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    crowd.add(mesh);
  }

  const worldMatrix = new THREE.Matrix4();
  const localMatrix = new THREE.Matrix4();
  const outMatrix = new THREE.Matrix4();
  const orientation = new THREE.Quaternion();
  const localOrientation = new THREE.Quaternion();
  const actorEuler = new THREE.Euler();
  const limbEuler = new THREE.Euler();
  const anchor = new THREE.Vector3();
  const localPoint = new THREE.Vector3();
  const scale = new THREE.Vector3(1, 1, 1);
  const hiddenScale = new THREE.Vector3(0.001, 0.001, 0.001);
  const color = new THREE.Color();

  function hideInstance(ped) {
    actorEuler.set(0, ped.heading, 0);
    orientation.setFromEuler(actorEuler);
    anchor.set(ped.x, 0, ped.z);
    outMatrix.compose(anchor, orientation, hiddenScale);
    const idx = ped.index;
    legs.setMatrixAt(idx * 2, outMatrix);
    legs.setMatrixAt(idx * 2 + 1, outMatrix);
    torsos.setMatrixAt(idx, outMatrix);
    arms.setMatrixAt(idx * 2, outMatrix);
    arms.setMatrixAt(idx * 2 + 1, outMatrix);
    heads.setMatrixAt(idx, outMatrix);
    hair.setMatrixAt(idx, outMatrix);
  }

  function partTransform(x, y, z, tilt) {
    limbEuler.set(tilt, 0, 0);
    localOrientation.setFromEuler(limbEuler);
    localPoint.set(x, y, z);
    localMatrix.compose(localPoint, localOrientation, scale);
    outMatrix.multiplyMatrices(worldMatrix, localMatrix);
    return outMatrix;
  }

  function writePerson(ped, swing) {
    actorEuler.set(0, ped.heading, 0);
    orientation.setFromEuler(actorEuler);
    anchor.set(ped.x, 0, ped.z);
    worldMatrix.compose(anchor, orientation, scale);
    const i = ped.index;
    legs.setMatrixAt(i * 2, partTransform(-0.14, 0.43, 0, swing));
    legs.setMatrixAt(i * 2 + 1, partTransform(0.14, 0.43, 0, -swing));
    torsos.setMatrixAt(i, partTransform(0, 1.2, 0, 0));
    arms.setMatrixAt(i * 2, partTransform(-0.42, 1.2, 0, -swing * 0.8));
    arms.setMatrixAt(i * 2 + 1, partTransform(0.42, 1.2, 0, swing * 0.8));
    heads.setMatrixAt(i, partTransform(0, 1.78, 0, 0));
    hair.setMatrixAt(i, partTransform(0, 1.82, 0, 0));
  }

  function placeOnSidewalk(x, z) {
    const road = rng.pick(SIDEWALKS);
    const distance = rng.range(-200, 200);
    const curb = rng.chance(0.5) ? 9.5 : -9.5;
    if (rng.chance(0.5)) return [road + curb, distance];
    return [distance, road + curb];
  }

  function spawn(x, z) {
    const skin = rng.pick(SKIN_TONES);
    const shirt = rng.pick(TOP_COLORS);
    const pants = rng.pick(LEG_COLORS);
    const person = {
      mesh: null, x, z, heading: rng.range(0, Math.PI * 2), speed: rng.range(1, 2.2),
      state: 'walk', fleeTimer: 0, health: 30, down: false, downTimer: 0,
      targetX: x, targetZ: z, waitTimer: rng.range(0, 4), skin, shirt, pants, hair: 0x2a2018,
      instanced: true, index: peds.length,
    };
    const index = person.index;
    legs.setColorAt(index * 2, color.setHex(person.pants));
    legs.setColorAt(index * 2 + 1, color.setHex(person.pants));
    torsos.setColorAt(index, color.setHex(person.shirt));
    arms.setColorAt(index * 2, color.setHex(person.shirt));
    arms.setColorAt(index * 2 + 1, color.setHex(person.shirt));
    heads.setColorAt(index, color.setHex(person.skin));
    hair.setColorAt(index, color.setHex(person.hair));
    writePerson(person, 0);
    peds.push(person);
    return person;
  }

  for (let n = 0; n < WALKER_TOTAL; n += 1) {
    const [x, z] = placeOnSidewalk();
    spawn(x, z);
  }
  for (const mesh of parts) {
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.instanceMatrix.needsUpdate = true;
  }

  function addExtra(person) {
    if (extras.length === 6) {
      const discarded = extras.shift();
      crowd.remove(discarded.mesh);
      const oldIndex = peds.indexOf(discarded);
      if (oldIndex !== -1) peds.splice(oldIndex, 1);
    }
    person.instanced = false;
    extras.push(person);
    peds.push(person);
    crowd.add(person.mesh);
  }

  function nearestPed(x, z, maxDist) {
    let chosen = null;
    let nearestSquared = maxDist * maxDist;
    for (const ped of peds) {
      if (ped.down) continue;
      const dx = ped.x - x;
      const dz = ped.z - z;
      const squared = dx * dx + dz * dz;
      if (squared < nearestSquared) {
        nearestSquared = squared;
        chosen = ped;
      }
    }
    return chosen;
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
        if (ped.instanced) hideInstance(ped);
        continue;
      }

      if (dangerPos) {
        const awayX = ped.x - dangerPos.x;
        const awayZ = ped.z - dangerPos.z;
        if (awayX * awayX + awayZ * awayZ < dangerRadius * dangerRadius) {
          ped.state = 'flee';
          ped.fleeTimer = 4;
        }
      }

      if (ped.state === 'flee') {
        ped.fleeTimer -= dt;
        const dx = ped.x - playerPos.x;
        const dz = ped.z - playerPos.z;
        const length = Math.hypot(dx, dz) || 1;
        ped.heading = Math.atan2(dx / length, dz / length);
        ped.speed = 6;
        if (ped.fleeTimer <= 0) ped.state = 'walk';
      } else {
        ped.waitTimer -= dt;
        if (ped.waitTimer <= 0) {
          [ped.targetX, ped.targetZ] = placeOnSidewalk();
          ped.waitTimer = rng.range(3, 9);
        }
        const dx = ped.targetX - ped.x;
        const dz = ped.targetZ - ped.z;
        const distance = Math.hypot(dx, dz);
        if (distance > 1) {
          ped.heading = Math.atan2(dx / distance, dz / distance);
          ped.speed = 1.6;
        } else {
          ped.speed = 0;
        }
      }

      const next = resolveCircle(
        ped.x + Math.sin(ped.heading) * ped.speed * dt,
        ped.z + Math.cos(ped.heading) * ped.speed * dt,
        0.5,
        colliders,
      );
      const bounded = clampBounds(next.x, next.z);
      ped.x = bounded.x;
      ped.z = bounded.z;
      const gait = ped.speed > 0.1 ? Math.sin(performance.now() / 90 + ped.x) * 0.45 : 0;
      if (ped.instanced) {
        writePerson(ped, gait);
      } else {
        ped.mesh.position.set(ped.x, 0, ped.z);
        ped.mesh.rotation.y = ped.heading;
        const limbs = ped.mesh.userData.limbs;
        limbs.legL.rotation.x = gait;
        limbs.legR.rotation.x = -gait;
        limbs.armL.rotation.x = -gait * 0.8;
        limbs.armR.rotation.x = gait * 0.8;
      }
    }
    for (const mesh of parts) mesh.instanceMatrix.needsUpdate = true;
  }

  function knockDown(ped) {
    ped.down = true;
    ped.downTimer = 2.5;
  }

  function respawnFar(playerPos) {
    for (const ped of peds) {
      if (!ped.instanced) continue;
      const dx = ped.x - playerPos.x;
      const dz = ped.z - playerPos.z;
      if (dx * dx + dz * dz <= 260 * 260) continue;
      ped.x = rng.pick(SIDEWALKS) + 9.5;
      ped.z = playerPos.z + rng.range(-80, 80);
      ped.down = false;
    }
  }

  return { peds, group: crowd, update, nearestPed, addExtra, knockDown, respawnFar };
}

export function createThugs(scene, rng) {
  const group = new THREE.Group();
  scene.add(group);
  const thugs = [];

  function spawn(x, z) {
    const mesh = buildPersonMesh(rng, { thug: true, shirt: 0x8a2a2a, hair: 0x0e0c0a });
    mesh.position.set(x, 0, z);
    group.add(mesh);
    const thug = { mesh, x, z, heading: 0, speed: 3.4, health: 60, attackTimer: 0, windup: 0, dead: false, punchAnim: 0 };
    thugs.push(thug);
    return thug;
  }

  function update(dt, player, colliders, onHitPlayer) {
    const clock = performance.now() / 110;
    for (const thug of thugs) {
      if (thug.dead) continue;
      const dx = player.x - thug.x;
      const dz = player.z - thug.z;
      const gap = Math.hypot(dx, dz);
      thug.attackTimer -= dt;
      if (thug.windup > 0) {
        thug.windup -= dt;
        if (thug.windup <= 0 && gap < 2.4) onHitPlayer(8);
        thug.punchAnim = 0.35;
      } else if (gap < 2.1 && thug.attackTimer <= 0) {
        thug.windup = 0.45;
        thug.attackTimer = 1.4;
      } else if (gap > 1.8) {
        thug.heading = Math.atan2(dx / gap, dz / gap);
        const next = resolveCircle(
          thug.x + Math.sin(thug.heading) * thug.speed * dt,
          thug.z + Math.cos(thug.heading) * thug.speed * dt,
          0.55,
          colliders,
        );
        const bounded = clampBounds(next.x, next.z);
        thug.x = bounded.x;
        thug.z = bounded.z;
      }
      thug.mesh.position.set(thug.x, 0, thug.z);
      thug.mesh.rotation.y = thug.heading;
      const limbs = thug.mesh.userData.limbs;
      const stride = Math.sin(clock + thug.x) * 0.4;
      limbs.legL.rotation.x = stride;
      limbs.legR.rotation.x = -stride;
      if (thug.punchAnim > 0) {
        thug.punchAnim -= dt;
        limbs.armR.rotation.x = -1.6;
      } else {
        limbs.armR.rotation.x = thug.windup > 0 ? -2.4 : -stride * 0.8;
      }
    }
  }

  function clear() {
    for (const thug of thugs) group.remove(thug.mesh);
    thugs.length = 0;
  }

  return { thugs, group, spawn, update, clear, aliveCount: () => thugs.filter((thug) => !thug.dead).length };
}

export function meleeHit(origin, heading, range, targets) {
  const forwardX = Math.sin(heading);
  const forwardZ = Math.cos(heading);
  const hits = [];
  for (const target of targets) {
    if (target.dead || target.down) continue;
    const dx = target.x - origin.x;
    const dz = target.z - origin.z;
    const distance = Math.hypot(dx, dz);
    if (distance > range) continue;
    const facing = (dx * forwardX + dz * forwardZ) / (distance || 1);
    if (facing > 0.25) hits.push({ target, dist: distance });
  }
  return hits;
}

export function pistolRay(origin, dir, maxDist, targets, colliders) {
  const increment = 0.8;
  let x = origin.x;
  let y = origin.y;
  let z = origin.z;
  let travelled = 0;
  while (travelled < maxDist) {
    x += dir.x * increment;
    y += dir.y * increment;
    z += dir.z * increment;
    travelled += increment;
    for (const wall of colliders) {
      const inside = x > wall.minX && x < wall.maxX && z > wall.minZ && z < wall.maxZ;
      if (inside && y < 45) return { hit: null, point: { x, y, z }, blocked: true };
    }
    for (const target of targets) {
      if (target.dead || target.down) continue;
      const dx = target.x - x;
      const dz = target.z - z;
      if (dx * dx + dz * dz < 1.1 && y > 0 && y < 2.4) {
        return { hit: target, point: { x, y, z }, blocked: false };
      }
    }
    if (y < 0) break;
  }
  return { hit: null, point: { x, y, z }, blocked: false };
}
