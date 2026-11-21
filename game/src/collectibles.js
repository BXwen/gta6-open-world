import * as THREE from '../vendor/three.module.min.js';

const PACKAGE_TOTAL = 12;
const PICKUP_DISTANCE = 2;
const MIN_PACKAGE_GAP = 15;
const SIDEWALK_GRID = [-186, -124, -62, 0, 62, 124, 186];

function randomValue(rng) {
  if (typeof rng === 'function') return rng();
  if (rng && typeof rng.next === 'function') return rng.next();
  return Math.random();
}

function within(min, max, rng) {
  return min + randomValue(rng) * (max - min);
}

function randomSidewalk(rng) {
  const street = SIDEWALK_GRID[Math.floor(randomValue(rng) * SIDEWALK_GRID.length)];
  const along = within(-195, 195, rng);
  const curb = randomValue(rng) < 0.5 ? -9.5 : 9.5;
  return randomValue(rng) < 0.5 ? { x: street + curb, z: along } : { x: along, z: street + curb };
}

function intersectsBuilding(x, z, colliders) {
  for (const collider of colliders || []) {
    const left = collider.minX ?? collider.min?.x ?? collider.x1 ?? -Infinity;
    const right = collider.maxX ?? collider.max?.x ?? collider.x2 ?? Infinity;
    const near = collider.minZ ?? collider.min?.z ?? collider.z1 ?? -Infinity;
    const far = collider.maxZ ?? collider.max?.z ?? collider.z2 ?? Infinity;
    if (x > left - 3 && x < right + 3 && z > near - 3 && z < far + 3) return true;
  }
  return false;
}

function spacedFromOthers(position, positions, minimum) {
  return positions.every((prior) => Math.hypot(position.x - prior.x, position.z - prior.z) >= minimum);
}

function createPackage() {
  const group = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({
    color: 0xffc928,
    emissive: 0x8d5b00,
    emissiveIntensity: 0.72,
    metalness: 0.35,
    roughness: 0.28,
  });
  const ribbon = new THREE.MeshStandardMaterial({ color: 0xfff2a1, emissive: 0x8d6700, emissiveIntensity: 0.45 });
  const casing = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 0.7), gold);
  casing.position.y = 0.42;
  casing.castShadow = true;
  casing.receiveShadow = true;
  group.add(casing);

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.58, 0.72), ribbon);
  stripe.position.set(0, 0.42, 0);
  stripe.castShadow = true;
  group.add(stripe);

  const haloMaterial = new THREE.MeshBasicMaterial({ color: 0xffd34f, transparent: true, opacity: 0.52, side: THREE.DoubleSide, depthWrite: false });
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.94, 28), haloMaterial);
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.035;
  group.add(halo);

  const glow = new THREE.PointLight(0xffc928, 1.4, 7, 2);
  glow.position.y = 1.2;
  group.add(glow);
  group.userData.motion = { phase: 0, casing, halo, glow, haloMaterial };
  group.userData.collected = false;
  return group;
}

function candidate(rng, colliders, selected, minimum) {
  for (let trial = 0; trial < 500; trial += 1) {
    const point = randomSidewalk(rng);
    if (Math.abs(point.x) > 205 || Math.abs(point.z) > 205) continue;
    if (intersectsBuilding(point.x, point.z, colliders)) continue;
    if (!spacedFromOthers(point, selected, minimum)) continue;
    return point;
  }
  return null;
}

export function createCollectibles(scene, rng, colliders) {
  const objects = [];
  const occupied = [];
  for (let index = 0; index < PACKAGE_TOTAL; index += 1) {
    let point = candidate(rng, colliders, occupied, MIN_PACKAGE_GAP);
    if (!point) point = candidate(rng, colliders, occupied, MIN_PACKAGE_GAP * 0.72);
    if (!point) break;
    const packageObject = createPackage();
    packageObject.position.set(point.x, 0, point.z);
    packageObject.userData.motion.phase = randomValue(rng) * Math.PI * 2;
    packageObject.userData.originX = point.x;
    packageObject.userData.originZ = point.z;
    scene.add(packageObject);
    objects.push(packageObject);
    occupied.push(point);
  }
  return objects;
}

function animatePackage(item, now) {
  const motion = item.userData.motion;
  const phase = now * 0.002 + motion.phase;
  const pulse = 0.5 + (Math.sin(phase * 1.7) + 1) * 0.25;
  item.position.y = 0.06 + Math.sin(phase * 1.35) * 0.13;
  item.rotation.y = phase * 0.55;
  motion.casing.rotation.y = Math.sin(phase) * 0.035;
  motion.halo.scale.setScalar(0.92 + pulse * 0.2);
  motion.haloMaterial.opacity = 0.3 + pulse * 0.3;
  motion.glow.intensity = 0.8 + pulse * 0.95;
  motion.glow.distance = 6.5 + pulse * 2.5;
}

export function updateCollectibles(collectibles, playerPos, onCollect) {
  const list = collectibles || [];
  const now = performance.now();
  let count = 0;
  for (const item of list) {
    if (item.userData.collected) {
      count += 1;
      continue;
    }
    animatePackage(item, now);
    const dx = item.position.x - playerPos.x;
    const dz = item.position.z - playerPos.z;
    if (dx * dx + dz * dz > PICKUP_DISTANCE * PICKUP_DISTANCE) continue;
    item.userData.collected = true;
    item.visible = false;
    count += 1;
    onCollect?.(count, PACKAGE_TOTAL);
  }
  return count;
}

export function getCollectibleCount(collectibles) {
  return (collectibles || []).reduce((count, item) => count + Number(Boolean(item.userData.collected)), 0);
}
