import * as Engine from "../vendor/three.module.min.js";
import { CAR_COLORS, CONFIG } from "./config.js";
import { mergeGeometries, xform } from "./merge.js";
import { clampBounds, resolveCircle } from "./world.js";
export function buildCarMesh(color) {
  const car = new Engine.Group();
  const paint = new Engine.MeshPhysicalMaterial({ color, metalness: 0.24, roughness: 0.24, clearcoat: 0.65 });
  const rubber = new Engine.MeshStandardMaterial({ color: 0x17191d, roughness: 0.94 });
  const glass = new Engine.MeshBasicMaterial({ color: 0xb7cfda, fog: false, toneMapped: false });
  const dark = new Engine.MeshBasicMaterial({ color: 0x16191c });
  const lamp = new Engine.MeshStandardMaterial({ color: 0xffedbe, emissive: 0xffb14a, emissiveIntensity: 1.8 });
  const rearLamp = new Engine.MeshStandardMaterial({ color: 0xff3434, emissive: 0xe00000, emissiveIntensity: 1.4 });
  const metal = new Engine.MeshStandardMaterial({ color: 0x292d32, metalness: 0.78, roughness: 0.26 });
  const hubMaterial = new Engine.MeshStandardMaterial({ color: 0xb9bec0, metalness: 0.82, roughness: 0.2 });
  const plateMaterial = new Engine.MeshStandardMaterial({ color: 0xe7e2cb, roughness: 0.8 });
  const parts = new Map();
  const addPart = (geometry, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    if (!parts.has(material)) parts.set(material, []);
    parts.get(material).push(xform(geometry, x, y, z, rx, ry, rz));
  };
  const box = (w, h, d, material, x, y, z, rx = 0, ry = 0, rz = 0) => {
    addPart(new Engine.BoxGeometry(w, h, d), material, x, y, z, rx, ry, rz);
  };
  const outline = new Engine.Shape();
  outline.moveTo(-2.6, 0.18);
  outline.lineTo(2.6, 0.18);
  outline.lineTo(2.43, 0.55);
  outline.lineTo(1.9, 0.72);
  outline.lineTo(-1.9, 0.72);
  outline.lineTo(-2.48, 0.53);
  outline.closePath();
  const shellGeometry = new Engine.ExtrudeGeometry(outline, { depth: 2.1, bevelEnabled: false });
  shellGeometry.rotateY(Math.PI / 2);
  shellGeometry.translate(-1.05, 0, 0);
  addPart(shellGeometry, paint);
  box(1.58, 0.63, 2.5, paint, 0, 0.87, -0.12);
  box(1.27, 0.08, 1.82, paint, 0, 1.22, -0.17);
  box(1.42, 0.44, 0.09, glass, 0, 1.01, 0.82, -0.48);
  box(1.42, 0.43, 0.09, glass, 0, 1, -1.08, 0.48);
  box(0.09, 0.35, 1.52, glass, -0.79, 1, -0.12);
  box(0.09, 0.35, 1.52, glass, 0.79, 1, -0.12);
  addPart(new Engine.SphereGeometry(0.13, 8, 6), dark, 0, 1.03, 0.12);
  box(0.42, 0.08, 0.13, lamp, -0.68, 0.49, 2.47);
  box(0.42, 0.08, 0.13, lamp, 0.68, 0.49, 2.47);
  box(0.45, 0.15, 0.09, rearLamp, -0.68, 0.48, -2.5);
  box(0.45, 0.15, 0.09, rearLamp, 0.68, 0.48, -2.5);
  box(0.92, 0.18, 0.1, metal, 0, 0.37, 2.5);
  box(0.38, 0.1, 0.06, plateMaterial, 0, 0.34, 2.57);
  box(0.38, 0.1, 0.06, plateMaterial, 0, 0.34, -2.57);
  box(0.19, 0.1, 0.27, paint, -1.09, 0.92, 0.47, 0, 0, -0.12);
  box(0.19, 0.1, 0.27, paint, 1.09, 0.92, 0.47, 0, 0, 0.12);
  for (const side of [-1, 1]) {
    for (const end of [-1, 1]) {
      addPart(new Engine.CylinderGeometry(0.42, 0.42, 0.34, 12), rubber,
        side * 1.02, 0.42, end * 1.58, 0, 0, Math.PI / 2);
      addPart(new Engine.CylinderGeometry(0.22, 0.22, 0.355, 10), hubMaterial,
        side * 1.02 + side * 0.02, 0.42, end * 1.58, 0, 0, Math.PI / 2);
    }
  }
  for (const [material, geometries] of parts) {
    const mesh = new Engine.Mesh(mergeGeometries(geometries), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    car.add(mesh);
    geometries.forEach((geometry) => geometry.dispose());
  }
  car.userData.paintColor = color;
  car.userData.paintMaterial = paint;
  return car;
}
export function createCarFleet(scene, capacity = 40, policeCapacity = 8) {
  const civilianPool = Array.from({ length: capacity }, () => buildCarMesh(CAR_COLORS[0]));
  const policePool = Array.from({ length: policeCapacity }, () => {
    const unit = buildCarMesh(0xf4f2e9);
    const trim = new Engine.MeshStandardMaterial({ color: 0x181b21, metalness: 0.35, roughness: 0.45 });
    const stripe = new Engine.MeshStandardMaterial({ color: 0xd8d9d5, roughness: 0.6 });
    const bar = new Engine.Group();
    const red = new Engine.MeshStandardMaterial({ color: 0xff2222, emissive: 0xd00000, emissiveIntensity: 1.5 });
    const blue = new Engine.MeshStandardMaterial({ color: 0x237dff, emissive: 0x003bff, emissiveIntensity: 1.5 });
    for (const [material, x] of [[red, -0.34], [blue, 0.34]]) {
      const beacon = new Engine.Mesh(new Engine.BoxGeometry(0.42, 0.13, 0.23), material);
      beacon.position.set(x, 1.38, -0.12);
      bar.add(beacon);
    }
    unit.add(bar);
    const bandGeometries = [0.81, -0.81].map((x) =>
      xform(new Engine.BoxGeometry(0.025, 0.13, 2.35), x, 0.77, -0.1));
    const sideBand = new Engine.Mesh(mergeGeometries(bandGeometries), stripe);
    unit.add(sideBand);
    bandGeometries.forEach((geometry) => geometry.dispose());
    const frontTrim = new Engine.Mesh(new Engine.BoxGeometry(2.02, 0.16, 0.14), trim);
    frontTrim.position.set(0, 0.3, 2.53);
    unit.add(frontTrim);
    return unit;
  });
  for (const mesh of [...civilianPool, ...policePool]) {
    mesh.visible = false;
    scene.add(mesh);
  }
  function sync(trafficCars, policeCars) {
    const assignments = [[trafficCars, civilianPool], [policeCars, policePool]];
    for (const [states, pool] of assignments) {
      states.forEach((state, index) => {
        const mesh = pool[index];
        if (!mesh) return;
        const paint = state.color ?? (state.isPolice ? 0xf4f2e9 : CAR_COLORS[0]);
        mesh.userData.paintMaterial.color.setHex(paint);
        mesh.userData.paintColor = paint;
        mesh.position.set(state.x, 0, state.z);
        mesh.rotation.set(0, state.heading, 0);
        mesh.visible = true;
      });
      for (let index = states.length; index < pool.length; index++) pool[index].visible = false;
    }
  }
  return { sync };
}
export function createCar(mesh, x, z, heading) {
  return {
    mesh, x, z, heading, speed: 0,
    color: mesh?.userData?.paintColor ?? mesh?.userData?.color,
    health: CONFIG.carHealth, modelName: "SPORT GT", isPlayer: false,
    isPolice: false, wrecked: false, touchingWall: false
  };
}
export function driveCar(car, input, dt, colliders, onCrash) {
  if (car.wrecked) return;
  const step = Math.max(0, dt);
  if (input.handbrake) {
    car.speed *= Math.max(0, 1 - step * 8);
  } else if (input.throttle) {
    car.speed = Math.min(CONFIG.carMaxSpeed, car.speed + CONFIG.carAccel * step);
  } else if (input.brake) {
    if (car.speed > 0.35) car.speed = Math.max(0, car.speed - CONFIG.carBrake * step);
    else car.speed = Math.max(-CONFIG.carMaxReverse, car.speed - CONFIG.carReverse * step);
  } else {
    const drag = 6 * step;
    car.speed = Math.abs(car.speed) <= drag ? 0 : car.speed - Math.sign(car.speed) * drag;
  }
  car.heading += input.steer * Math.min(1, Math.abs(car.speed) / 7) * step * 1.15 * (car.speed < 0 ? -1 : 1);
  const proposedX = car.x + Math.sin(car.heading) * car.speed * step;
  const proposedZ = car.z + Math.cos(car.heading) * car.speed * step;
  const collisionPoint = resolveCircle(proposedX, proposedZ, 1.6, colliders);
  const boundedPoint = clampBounds(collisionPoint.x, collisionPoint.z);
  const touched = Math.hypot(boundedPoint.x - proposedX, boundedPoint.z - proposedZ) > 0.015;
  car.x = boundedPoint.x;
  car.z = boundedPoint.z;
  if (touched) {
    const travel = Math.abs(car.speed) * step;
    const direction = Math.sign(car.speed);
    const blocked = (proposedX - boundedPoint.x) * Math.sin(car.heading) * direction
      + (proposedZ - boundedPoint.z) * Math.cos(car.heading) * direction;
    const fraction = travel > 0 ? Math.max(0, Math.min(1, blocked / travel)) : 0;
    const speedBeforeImpact = Math.abs(car.speed);
    car.speed *= 1 - fraction;
    const lost = speedBeforeImpact - Math.abs(car.speed);
    if (lost > 0.1) {
      car.health -= Math.min(9, lost * 0.2);
      if (onCrash) onCrash(lost);
    }
  }
  car.touchingWall = touched;
  if (car.health <= 0) {
    car.wrecked = true;
    car.speed = 0;
  }
  if (car.mesh) {
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
  }
}
function streetCoordinate(value) {
  return Math.round(value / 62) * 62;
}
function makeRoadCar(x, z, heading, color, speed = 0) {
  const car = createCar(null, x, z, heading);
  car.color = color;
  car.speed = speed;
  return car;
}
export function createTraffic(scene, rng, colliders) {
  const cars = [];
  for (let i = 0; i < 14; i++) {
    const vertical = i < 7;
    const slot = i % 7;
    const road = slot - 3;
    const lane = slot % 2 ? 3.5 : -3.5;
    const x = vertical ? road * 62 + lane : -174 + slot * 58;
    const z = vertical ? -174 + slot * 58 : road * 62 + lane;
    const heading = vertical ? (slot % 2 ? Math.PI : 0) : (slot % 2 ? -Math.PI / 2 : Math.PI / 2);
    cars.push(makeRoadCar(x, z, heading, rng.pick(CAR_COLORS), rng.range(6, 12)));
  }
  function update(dt, playerPos, playerCar, policeCars) {
    const time = Math.max(0, dt);
    for (const car of cars) {
      if (car.parked) continue;
      const beforeX = car.x;
      const beforeZ = car.z;
      const moved = Math.abs(Math.sin(car.heading) * car.speed * time) + Math.abs(Math.cos(car.heading) * car.speed * time);
      car.x += Math.sin(car.heading) * car.speed * time;
      car.z += Math.cos(car.heading) * car.speed * time;
      const crossed = Math.floor(beforeX / 62) !== Math.floor(car.x / 62) || Math.floor(beforeZ / 62) !== Math.floor(car.z / 62);
      if (crossed && rng.chance(0.24)) car.heading = rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]);
      const fixed = resolveCircle(car.x, car.z, 1.35, colliders);
      car.x = fixed.x;
      car.z = fixed.z;
      const boundary = clampBounds(car.x, car.z);
      car.x = boundary.x;
      car.z = boundary.z;
      if (Math.hypot(car.x - playerPos.x, car.z - playerPos.z) > 260) {
        const direction = rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]);
        const offset = rng.range(-95, 95);
        car.x = direction === 0 || direction === Math.PI ? streetCoordinate(playerPos.x + offset) : playerPos.x + offset;
        car.z = direction === Math.PI / 2 || direction === -Math.PI / 2 ? streetCoordinate(playerPos.z + offset) : playerPos.z + offset;
        car.heading = direction;
      }
      for (const other of [playerCar, ...policeCars]) {
        if (!other) continue;
        const dx = car.x - other.x;
        const dz = car.z - other.z;
        const distance = Math.hypot(dx, dz);
        if (distance > 0.01 && distance < 3.6) {
          const push = (3.6 - distance) * 0.55;
          car.x += dx / distance * push;
          car.z += dz / distance * push;
        }
      }
      if (moved > 0) car.touchingWall = false;
    }
  }
  function nearestCar(x, z, radius) {
    let found = null;
    let best = radius;
    for (const car of cars) {
      const gap = Math.hypot(car.x - x, car.z - z);
      if (gap <= best) {
        found = car;
        best = gap;
      }
    }
    return found;
  }
  function remove(car) {
    const index = cars.indexOf(car);
    if (index >= 0) cars.splice(index, 1);
  }
  function addParked(x, z, heading, color, health = CONFIG.carHealth) {
    const parked = makeRoadCar(x, z, heading, color, 0);
    parked.parked = true;
    parked.health = health;
    cars.push(parked);
    return parked;
  }
  return { cars, update, nearestCar, remove, addParked };
}
export function createPolice(scene, rng) {
  const cars = [];
  const streetBlockSize = 62;
  let spawnClock = 0;
  function addCruiser(player, speed) {
    const heading = rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]);
    const distance = rng.range(40, 60);
    const dx = Math.cos(heading);
    const dz = Math.sin(heading);
    let x = streetCoordinate(player.x + dx * distance);
    let z = streetCoordinate(player.z + dz * distance);
    if (Math.hypot(x - player.x, z - player.z) < 55) {
      const fartherDistance = distance + streetBlockSize;
      x = streetCoordinate(player.x + dx * fartherDistance);
      z = streetCoordinate(player.z + dz * fartherDistance);
    }
    const cruiser = makeRoadCar(x, z, Math.atan2(player.x - x, player.z - z), 0xf4f2e9, 0);
    cruiser.isPolice = true;
    cruiser.speed = speed;
    cruiser.ramCooldown = 0;
    cars.push(cruiser);
  }
  function update(dt, wanted, player, playerCar, colliders, onRam) {
    const desired = Math.max(0, Math.min(CONFIG.maxWanted, Math.floor(wanted)));
    if (!desired) {
      cars.length = 0;
      spawnClock = 0;
      return;
    }
    const target = playerCar || player;
    const pursuitSpeed = playerCar ? 27 : 14;
    spawnClock += Math.max(0, dt);
    while (cars.length < desired && spawnClock >= 1.5) {
      spawnClock -= 1.5;
      addCruiser(target, pursuitSpeed);
    }
    for (const unit of cars) {
      unit.ramCooldown = Math.max(0, unit.ramCooldown - dt);
      const dx = target.x - unit.x;
      const dz = target.z - unit.z;
      const distance = Math.hypot(dx, dz);
      const desiredHeading = Math.atan2(dx, dz);
      let turn = desiredHeading - unit.heading;
      while (turn > Math.PI) turn -= Math.PI * 2;
      while (turn < -Math.PI) turn += Math.PI * 2;
      unit.heading += Math.max(-1, Math.min(1, turn)) * Math.min(1, dt * 2.2);
      unit.speed = pursuitSpeed;
      if (distance < 3.2) {
        unit.speed *= 0.2;
        if (unit.ramCooldown <= 0) {
          if (onRam) onRam(unit);
          unit.ramCooldown = 0.8;
          unit.x -= Math.sin(unit.heading) * 0.8;
          unit.z -= Math.cos(unit.heading) * 0.8;
        }
      }
      const next = resolveCircle(unit.x + Math.sin(unit.heading) * unit.speed * dt, unit.z + Math.cos(unit.heading) * unit.speed * dt, 1.5, colliders);
      const bounded = clampBounds(next.x, next.z);
      unit.x = bounded.x;
      unit.z = bounded.z;
    }
  }
  function nearestDist(player) {
    let nearest = 9999;
    for (const cruiser of cars) nearest = Math.min(nearest, Math.hypot(cruiser.x - player.x, cruiser.z - player.z));
    return nearest;
  }
  return { cars, update, nearestDist };
}
