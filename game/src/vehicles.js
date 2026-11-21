// Cars: a shared mesh builder, the player's arcade driving, street traffic
// that follows the grid, and police cars that chase and ram.
//
// Rendering: traffic and police cars are pure data; one shared fleet of
// InstancedMeshes draws them all (a body, cabin, lights, tails and wheels
// instanced mesh, plus police light-bar meshes). The player's car alone
// stays a regular mesh group, built from the same shared geometries.

import * as THREE from '../vendor/three.module.min.js';
import { CONFIG, CAR_COLORS } from './config.js';
import { resolveCircle, clampBounds } from './world.js';
import { mergeGeometries, xform } from './merge.js';

// Shared geometries (car-local space, origin at ground centre).
const BODY_GEO = mergeGeometries([
  xform(new THREE.BoxGeometry(1.92, 0.5, 4.25), 0, 0.58, 0),
  xform(new THREE.BoxGeometry(1.88, 0.24, 1.05), 0, 0.88, 1.55),
  xform(new THREE.BoxGeometry(1.08, 0.18, 1.48), 0, 1.49, -0.28),
  xform(new THREE.BoxGeometry(2.02, 0.16, 0.18), 0, 0.53, 2.16),
  xform(new THREE.BoxGeometry(2.02, 0.16, 0.18), 0, 0.53, -2.16),
]);
const CABIN_GEO = mergeGeometries([
  xform(new THREE.BoxGeometry(1.34, 0.27, 0.07), 0, 1.27, 0.57, -0.28),
  xform(new THREE.BoxGeometry(1.34, 0.27, 0.07), 0, 1.27, -1.12, 0.28),
  xform(new THREE.BoxGeometry(0.07, 0.27, 0.62), -0.72, 1.27, -0.28),
  xform(new THREE.BoxGeometry(0.07, 0.27, 0.62), 0.72, 1.27, -0.28),
]);
const LIGHTS_GEO = mergeGeometries([
  xform(new THREE.BoxGeometry(0.42, 0.16, 0.08), -0.62, 0.66, 2.22),
  xform(new THREE.BoxGeometry(0.42, 0.16, 0.08), 0.62, 0.66, 2.22),
]);
const TAILS_GEO = mergeGeometries([
  xform(new THREE.BoxGeometry(0.42, 0.16, 0.08), -0.62, 0.66, -2.22),
  xform(new THREE.BoxGeometry(0.42, 0.16, 0.08), 0.62, 0.66, -2.22),
]);
const GRILLE_GEO = xform(new THREE.BoxGeometry(0.72, 0.22, 0.06), 0, 0.62, 2.18);
const HUB_GEO = new THREE.CylinderGeometry(0.2, 0.2, 0.36, 12);
HUB_GEO.rotateZ(Math.PI / 2);
const MIRROR_GEO = mergeGeometries([
  xform(new THREE.BoxGeometry(0.12, 0.08, 0.18), -0.99, 1.12, 0.3),
  xform(new THREE.BoxGeometry(0.12, 0.08, 0.18), 0.99, 1.12, 0.3),
]);
const PLATE_GEO = mergeGeometries([
  xform(new THREE.BoxGeometry(0.48, 0.16, 0.035), 0, 0.62, 2.225),
  xform(new THREE.BoxGeometry(0.48, 0.16, 0.035), 0, 0.62, -2.225),
]);
const WHEEL_GEO = new THREE.CylinderGeometry(0.42, 0.42, 0.34, 12);
WHEEL_GEO.rotateZ(Math.PI / 2); // axle along x; spin is rotation.x
const WHEEL_OFFSETS = [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]];
const DOORS_GEO = mergeGeometries([
  xform(new THREE.BoxGeometry(0.04, 0.5, 1.9), -1.01, 0.72, -0.2),
  xform(new THREE.BoxGeometry(0.04, 0.5, 1.9), 1.01, 0.72, -0.2),
]);
const POLICE_STRIPE_GEO = mergeGeometries([
  xform(new THREE.BoxGeometry(0.05, 0.12, 1.65), -1.04, 0.8, -0.2),
  xform(new THREE.BoxGeometry(0.05, 0.12, 1.65), 1.04, 0.8, -0.2),
]);
const LIGHTBAR_GEO = xform(new THREE.BoxGeometry(1.2, 0.16, 0.5), 0, 1.56, -0.25);
const LIGHTBAR_RED_GEO = xform(new THREE.BoxGeometry(0.55, 0.2, 0.45), -0.3, 1.56, -0.25);
const LIGHTBAR_BLUE_GEO = xform(new THREE.BoxGeometry(0.55, 0.2, 0.45), 0.3, 1.56, -0.25);

const WHEEL_MAT = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.95 });
const GLASS_MAT = new THREE.MeshStandardMaterial({ color: 0x1c2a38, roughness: 0.15, metalness: 0.4 });
const LIGHT_MAT = new THREE.MeshStandardMaterial({ color: 0xfff6c8, emissive: 0xffe9a0, emissiveIntensity: 0.8 });
const TAIL_MAT = new THREE.MeshStandardMaterial({ color: 0xc02020, emissive: 0x800000, emissiveIntensity: 0.6 });
const DARK_MAT = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 });
const GRILLE_MAT = new THREE.MeshStandardMaterial({ color: 0x20252a, roughness: 0.55, metalness: 0.35 });
const HUB_MAT = new THREE.MeshStandardMaterial({ color: 0xc5c7c9, roughness: 0.35, metalness: 0.8 });
const PLATE_MAT = new THREE.MeshStandardMaterial({ color: 0xe9e1c9, roughness: 0.8 });
const DOOR_MAT = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.4, metalness: 0.4 });
const POLICE_STRIPE_MAT = new THREE.MeshStandardMaterial({ color: 0xe8e1c8, roughness: 0.55 });
const RED_FLASH_MAT = new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff0000, emissiveIntensity: 1.5 });
const BLUE_FLASH_MAT = new THREE.MeshStandardMaterial({ color: 0x2040ff, emissive: 0x0020ff, emissiveIntensity: 1.5 });

// The player's car: a regular mesh group from the shared geometries
// (7 meshes instead of the old 11; the police look lives in the fleet).
export function buildCarMesh(color) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.55 });
  const body = new THREE.Mesh(BODY_GEO, bodyMat);
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(CABIN_GEO, GLASS_MAT);
  cabin.castShadow = true;
  group.add(cabin);
  const grille = new THREE.Mesh(GRILLE_GEO, GRILLE_MAT);
  group.add(grille);
  const mirrors = new THREE.Mesh(MIRROR_GEO, bodyMat);
  group.add(mirrors);
  group.add(new THREE.Mesh(PLATE_GEO, PLATE_MAT));
  const head = new THREE.Mesh(LIGHTS_GEO, LIGHT_MAT);
  group.add(head);
  const tail = new THREE.Mesh(TAILS_GEO, TAIL_MAT);
  group.add(tail);
  const wheels = [];
  for (const [wx, wz] of WHEEL_OFFSETS) {
    const wheel = new THREE.Mesh(WHEEL_GEO, WHEEL_MAT);
    wheel.position.set(wx, 0.42, wz);
    wheel.castShadow = true;
    group.add(wheel);
    const hub = new THREE.Mesh(HUB_GEO, HUB_MAT);
    hub.position.set(wx * 1.018, 0.42, wz);
    group.add(hub);
    wheels.push(wheel);
  }
  group.userData.wheels = wheels;
  return group;
}

// One fleet draws every traffic and police car as instanced parts.
// sync() is called once per frame with the live car arrays.
export function createCarFleet(scene, capacity = 40, policeCapacity = 8) {
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.55 });
  const body = new THREE.InstancedMesh(BODY_GEO, bodyMat, capacity);
  const cabin = new THREE.InstancedMesh(CABIN_GEO, GLASS_MAT, capacity);
  const grille = new THREE.InstancedMesh(GRILLE_GEO, GRILLE_MAT, capacity);
  const mirrors = new THREE.InstancedMesh(MIRROR_GEO, bodyMat, capacity);
  const plates = new THREE.InstancedMesh(PLATE_GEO, PLATE_MAT, capacity);
  const lights = new THREE.InstancedMesh(LIGHTS_GEO, LIGHT_MAT, capacity);
  const tails = new THREE.InstancedMesh(TAILS_GEO, TAIL_MAT, capacity);
  const wheels = new THREE.InstancedMesh(WHEEL_GEO, WHEEL_MAT, capacity * 4);
  const hubs = new THREE.InstancedMesh(HUB_GEO, HUB_MAT, capacity * 4);
  const barBase = new THREE.InstancedMesh(LIGHTBAR_GEO, DARK_MAT, policeCapacity);
  const doors = new THREE.InstancedMesh(DOORS_GEO, DOOR_MAT, policeCapacity);
  const policeStripe = new THREE.InstancedMesh(POLICE_STRIPE_GEO, POLICE_STRIPE_MAT, policeCapacity);
  const red = new THREE.InstancedMesh(LIGHTBAR_RED_GEO, RED_FLASH_MAT, policeCapacity);
  const blue = new THREE.InstancedMesh(LIGHTBAR_BLUE_GEO, BLUE_FLASH_MAT, policeCapacity);
  // The fleet does not cast shadows: the instanced parts self-shadowed
  // (acne) and turned the white police cruisers black in the chase shot.
  // The player's own car (buildCarMesh) and pedestrians still cast, so
  // moving things keep their grounding shadows.
  for (const m of [body, cabin, grille, mirrors, plates, lights, tails, wheels, hubs, barBase, doors, policeStripe, red, blue]) {
    m.castShadow = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(m);
  }
  body.instanceColor = null;
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const _v = new THREE.Vector3();
  const _s = new THREE.Vector3(1, 1, 1);
  const _c = new THREE.Color();
  const _wm = new THREE.Matrix4();

  function carMatrix(car) {
    _e.set(0, car.heading, 0);
    _q.setFromEuler(_e);
    _v.set(car.x, 0, car.z);
    _m.compose(_v, _q, _s);
    return _m;
  }

  function sync(trafficCars, policeCars) {
    let n = 0;
    const writeCar = (car) => {
      if (n >= capacity) return;
      const i = n;
      n += 1;
      carMatrix(car);
      body.setMatrixAt(i, _m);
      body.setColorAt(i, _c.setHex(car.color ?? 0xd8d8d8));
      mirrors.setColorAt(i, _c.setHex(car.color ?? 0xd8d8d8));
      cabin.setMatrixAt(i, _m);
      grille.setMatrixAt(i, _m);
      mirrors.setMatrixAt(i, _m);
      plates.setMatrixAt(i, _m);
      lights.setMatrixAt(i, _m);
      tails.setMatrixAt(i, _m);
      // Wheels: car matrix times the local offset + spin.
      for (let w = 0; w < 4; w += 1) {
        _e.set(car.wheelSpin || 0, 0, 0);
        _q.setFromEuler(_e);
        _v.set(WHEEL_OFFSETS[w][0], 0.42, WHEEL_OFFSETS[w][1]);
        _wm.compose(_v, _q, _s);
        _wm.premultiply(_m);
        wheels.setMatrixAt(i * 4 + w, _wm);
        hubs.setMatrixAt(i * 4 + w, _wm);
      }
    };
    for (const car of trafficCars) writeCar(car);
    let p = 0;
    for (const car of policeCars) {
      writeCar(car);
      if (p < policeCapacity) {
        carMatrix(car);
        barBase.setMatrixAt(p, _m);
        doors.setMatrixAt(p, _m);
        policeStripe.setMatrixAt(p, _m);
        red.setMatrixAt(p, _m);
        blue.setMatrixAt(p, _m);
        p += 1;
      }
    }
    body.count = n;
    cabin.count = n;
    grille.count = n;
    mirrors.count = n;
    plates.count = n;
    lights.count = n;
    tails.count = n;
    wheels.count = n * 4;
    hubs.count = n * 4;
    barBase.count = p;
    doors.count = p;
    red.count = p;
    blue.count = p;
    if (body.instanceColor) body.instanceColor.needsUpdate = true;
    if (mirrors.instanceColor) mirrors.instanceColor.needsUpdate = true;
    policeStripe.count = p;
    for (const m of [body, cabin, grille, mirrors, plates, lights, tails, wheels, hubs, barBase, doors, policeStripe, red, blue]) {
      m.instanceMatrix.needsUpdate = true;
    }
    // Light bar flash, in sync across units (same phase as before).
    const phase = Math.floor(performance.now() / 260) % 2 === 0;
    RED_FLASH_MAT.emissiveIntensity = phase ? 2.2 : 0.25;
    BLUE_FLASH_MAT.emissiveIntensity = phase ? 0.25 : 2.2;
  }

  return { sync };
}

// Arcade car state: position, heading, speed and health. Steering is
// speed-sensitive; the rear slides a little under handbrake.
export function createCar(mesh, x, z, heading) {
  return {
    mesh, x, z, heading, speed: 0, health: CONFIG.carHealth,
    steer: 0, wrecked: false, driver: null, isPlayer: false, isPolice: false,
    wheelSpin: 0,
  };
}

export function driveCar(car, input, dt, colliders, onCrash) {
  if (car.wrecked) return;
  const forward = input.throttle > 0;
  const braking = input.brake > 0;
  const handbrake = input.handbrake;
  if (forward) car.speed += CONFIG.carAccel * dt * input.throttle;
  if (braking) {
    if (car.speed > 0.5) car.speed -= CONFIG.carBrake * dt;
    else car.speed -= CONFIG.carReverse * dt;
  }
  if (!forward && !braking) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 6 * dt);
  if (handbrake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 12 * dt);
  car.speed = Math.max(-CONFIG.carMaxReverse, Math.min(CONFIG.carMaxSpeed, car.speed));
  const speedFactor = Math.min(1, Math.abs(car.speed) / 12);
  const targetSteer = input.steer * 0.55 * (1 - speedFactor * 0.55);
  car.steer += (targetSteer - car.steer) * Math.min(1, dt * 8);
  const turnRate = car.steer * (car.speed / 3.2) * (handbrake ? 1.5 : 1);
  car.heading += turnRate * dt;
  let nx = car.x + Math.sin(car.heading) * car.speed * dt;
  let nz = car.z + Math.cos(car.heading) * car.speed * dt;
  const before = { x: nx, z: nz };
  const fixed = resolveCircle(nx, nz, 1.5, colliders);
  nx = fixed.x;
  nz = fixed.z;
  const clamped = clampBounds(nx, nz);
  nx = clamped.x;
  nz = clamped.z;
  const hitWall = Math.abs(before.x - nx) > 0.01 || Math.abs(before.z - nz) > 0.01;
  if (hitWall) {
    // Crash damage only on the moment of impact, not every frame while
    // the car grinds against the wall — otherwise a wedged car dies in
    // two seconds of holding the throttle.
    if (!car.touchingWall && Math.abs(car.speed) > 6) {
      const impact = Math.abs(car.speed);
      car.speed *= 0.45;
      car.health -= impact * 0.9;
      if (onCrash) onCrash(impact);
    }
    car.touchingWall = true;
  } else {
    car.touchingWall = false;
  }
  car.x = nx;
  car.z = nz;
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  car.wheelSpin += car.speed * dt * 2.4;
  for (const wheel of car.mesh.userData.wheels) {
    wheel.rotation.x = car.wheelSpin;
  }
  if (car.health <= 0 && !car.wrecked) {
    car.wrecked = true;
    car.speed = 0;
    car.mesh.rotation.z = 0.22;
  }
}

// Traffic: cars that cruise the street grid, turn at intersections, slow
// for the car ahead, and respawn near the player when they drift too far.
// Cars are data only; the fleet in main.js draws them.
export function createTraffic(scene, rng, colliders) {
  const streets = [-186, -124, -62, 0, 62, 124, 186];
  const cars = [];
  void scene;

  function spawnAt(car, x, z, axis, dir) {
    car.x = x;
    car.z = z;
    car.axis = axis;
    car.dir = dir;
    car.heading = axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
    car.speed = rng.range(8, 13);
  }

  function makeCar() {
    return {
      x: 0, z: 0, axis: 'x', dir: 1, heading: 0, speed: 10,
      health: 100, color: rng.pick(CAR_COLORS), wheelSpin: 0,
    };
  }

  for (let i = 0; i < 14; i += 1) {
    const car = makeCar();
    const axis = rng.chance(0.5) ? 'x' : 'z';
    const street = rng.pick(streets);
    const along = rng.range(-200, 200);
    spawnAt(car, axis === 'x' ? along : street, axis === 'x' ? street : along, axis, rng.chance(0.5) ? 1 : -1);
    cars.push(car);
  }

  function nearestAhead(car, others, playerCar) {
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    let best = Infinity;
    const check = (ox, oz) => {
      const dx = ox - car.x;
      const dz = oz - car.z;
      const along = dx * fx + dz * fz;
      if (along > 0 && along < best) {
        const side = Math.abs(dx * fz - dz * fx);
        if (side < 2.6) best = along;
      }
    };
    for (const other of others) if (other !== car) check(other.x, other.z);
    if (playerCar) check(playerCar.x, playerCar.z);
    return best;
  }

  function update(dt, playerPos, playerCar, policeCars) {
    for (const car of cars) {
      // Parked cars (left by the player) stay where they are.
      if (car.parked) continue;
      // Respawn far-away cars near the player so the streets stay busy.
      const dx = car.x - playerPos.x;
      const dz = car.z - playerPos.z;
      if (dx * dx + dz * dz > 280 * 280) {
        const axis = rng.chance(0.5) ? 'x' : 'z';
        const street = rng.pick(streets);
        const along = playerPos[axis === 'x' ? 'x' : 'z'] + rng.range(-90, 90);
        spawnAt(car, axis === 'x' ? along : street, axis === 'x' ? street : along, axis, rng.chance(0.5) ? 1 : -1);
      }
      // Turn at intersections sometimes.
      const onIntersection = streets.some((s) => Math.abs(car.x - s) < 2.2) && streets.some((s) => Math.abs(car.z - s) < 2.2);
      if (onIntersection && rng.chance(dt * 0.55)) {
        if (car.axis === 'x') {
          car.axis = 'z';
          car.dir = rng.chance(0.5) ? 1 : -1;
          car.heading = car.dir > 0 ? 0 : Math.PI;
          car.z = streets.reduce((a, s) => (Math.abs(s - car.z) < Math.abs(a - car.z) ? s : a), streets[0]);
        } else {
          car.axis = 'x';
          car.dir = rng.chance(0.5) ? 1 : -1;
          car.heading = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
          car.x = streets.reduce((a, s) => (Math.abs(s - car.x) < Math.abs(a - car.x) ? s : a), streets[0]);
        }
      }
      const ahead = nearestAhead(car, cars, playerCar);
      const targetSpeed = ahead < 12 ? 0 : rng.range(8, 13);
      car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 1.5);
      car.x += Math.sin(car.heading) * car.speed * dt;
      car.z += Math.cos(car.heading) * car.speed * dt;
      const clamped = clampBounds(car.x, car.z);
      const hitEdge = clamped.x !== car.x || clamped.z !== car.z;
      car.x = clamped.x;
      car.z = clamped.z;
      if (hitEdge) {
        // End of the street: turn around and drive back instead of
        // pushing against the city wall forever (a stuck car is also a
        // car the player can steal and then not drive).
        car.dir *= -1;
        car.heading += Math.PI;
        car.x += Math.sin(car.heading) * 2;
        car.z += Math.cos(car.heading) * 2;
      }
      car.wheelSpin += car.speed * dt * 2.4;
    }
    void policeCars;
  }

  return {
    cars,
    update,
    nearestCar(x, z, maxDist) {
      let best = null;
      let bestD = maxDist;
      for (const car of cars) {
        const dx = car.x - x;
        const dz = car.z - z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d < bestD) { bestD = d; best = car; }
      }
      return best;
    },
    remove(car) {
      const i = cars.indexOf(car);
      if (i >= 0) cars.splice(i, 1);
    },
    addParked(x, z, heading, color) {
      const car = {
        x, z, axis: 'x', dir: 1, heading, speed: 0,
        health: 100, color, parked: true, wheelSpin: 0,
      };
      cars.push(car);
      return car;
    },
  };
}

// Police: spawn at the edge of the player's view, chase by steering at the
// player, ram on contact, and leave when the heat dies down.
// Cars are data only; the fleet in main.js draws them.
export function createPolice(scene, rng) {
  void scene;
  const cars = [];
  let spawnTimer = 0;

  function spawnNear(playerPos) {
    const angle = rng.range(0, Math.PI * 2);
    const x = playerPos.x + Math.sin(angle) * 95;
    const z = playerPos.z + Math.cos(angle) * 95;
    const car = createCar(null, x, z, Math.atan2(playerPos.x - x, playerPos.z - z));
    car.isPolice = true;
    car.color = 0xf2f2f2;
    car.maxSpeed = 42;
    cars.push(car);
    return car;
  }

  function update(dt, wanted, playerPos, playerCar, colliders, onRam) {
    spawnTimer -= dt;
    const want = Math.min(4, wanted);
    if (wanted > 0 && cars.length < want && spawnTimer <= 0) {
      spawnNear(playerPos);
      spawnTimer = 2.5;
    }
    for (let i = cars.length - 1; i >= 0; i -= 1) {
      const car = cars[i];
      if (wanted === 0) {
        // Heat is off: the unit pulls away and despawns.
        car.speed = Math.min(car.speed + 10 * dt, 20);
        car.heading += 0.4 * dt;
        car.x += Math.sin(car.heading) * car.speed * dt;
        car.z += Math.cos(car.heading) * car.speed * dt;
        const dx = car.x - playerPos.x;
        const dz = car.z - playerPos.z;
        if (dx * dx + dz * dz > 150 * 150) {
          cars.splice(i, 1);
        }
        car.wheelSpin += car.speed * dt * 2.4;
        continue;
      }
      // Pursuit: steer at the player, faster with more stars.
      const tx = playerCar ? playerCar.x : playerPos.x;
      const tz = playerCar ? playerCar.z : playerPos.z;
      const desired = Math.atan2(tx - car.x, tz - car.z);
      let diff = desired - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      car.heading += Math.max(-1.6 * dt, Math.min(1.6 * dt, diff * 2.4 * dt));
      const targetSpeed = 26 + wanted * 2.5;
      car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 0.8);
      let nx = car.x + Math.sin(car.heading) * car.speed * dt;
      let nz = car.z + Math.cos(car.heading) * car.speed * dt;
      const fixed = resolveCircle(nx, nz, 1.5, colliders);
      nx = fixed.x;
      nz = fixed.z;
      const clamped = clampBounds(nx, nz);
      car.x = clamped.x;
      car.z = clamped.z;
      car.wheelSpin += car.speed * dt * 2.4;
      // Ram: touching the player's car or the player on foot hurts — but
      // at most once per 0.8 s per unit, so a glued-on cruiser cannot
      // shred a car (or the player) in a single second of contact.
      const px = playerCar ? playerCar.x : playerPos.x;
      const pz = playerCar ? playerCar.z : playerPos.z;
      const dx = px - car.x;
      const dz = pz - car.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      car.ramCooldown = Math.max(0, (car.ramCooldown ?? 0) - dt);
      if (d < 3.4 && car.ramCooldown <= 0 && onRam) {
        car.ramCooldown = 0.8;
        onRam(car, d);
      }
    }
  }

  return {
    cars,
    update,
    nearestDist(playerPos) {
      let best = Infinity;
      for (const car of cars) {
        const dx = car.x - playerPos.x;
        const dz = car.z - playerPos.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d < best) best = d;
      }
      return best;
    },
  };
}
