import * as Three from '../vendor/three.module.min.js';
import { CAR_COLORS, CONFIG } from './config.js';
import { clampBounds, resolveCircle } from './world.js';
import { mergeGeometries, xform } from './merge.js';

const bodyOutline = new Three.Shape();
bodyOutline.moveTo(-2.6, 0.34);
bodyOutline.lineTo(-2.57, 0.61);
bodyOutline.quadraticCurveTo(-2.48, 0.8, -2.2, 0.82);
bodyOutline.lineTo(-1.32, 0.77);
bodyOutline.lineTo(-0.72, 0.73);
bodyOutline.lineTo(1.42, 0.7);
bodyOutline.lineTo(2.23, 0.62);
bodyOutline.quadraticCurveTo(2.57, 0.57, 2.61, 0.39);
bodyOutline.lineTo(2.56, 0.34);
bodyOutline.closePath();
const shell = new Three.ExtrudeGeometry(bodyOutline, {
  depth: 1.9, steps: 1, bevelEnabled: true,
  bevelSegments: 2, bevelSize: 0.04, bevelThickness: 0.03,
});
shell.rotateY(-Math.PI / 2);
shell.translate(0.95, 0, 0);
const makeBox = (w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) =>
  xform(new Three.BoxGeometry(w, h, d), x, y, z, rx, ry, rz);

const BODY_GEO = mergeGeometries([
  shell,
  makeBox(1.72, 0.07, 1.52, 0, 0.75, 1.12, -0.035),
  makeBox(1.72, 0.07, 0.72, 0, 0.79, -1.92, 0.025),
  makeBox(2, 0.11, 0.14, 0, 0.48, 2.55),
  makeBox(2, 0.11, 0.14, 0, 0.48, -2.55),
]);

function slopedGlass(width, height, depth, taper = 1) {
  const shape = new Three.BoxGeometry(width, height, depth);
  const points = shape.attributes.position;
  for (let vertex = 0; vertex < points.count; vertex += 1) {
    const top = points.getY(vertex) / height + 0.5;
    points.setX(vertex, points.getX(vertex) * (1 + (taper - 1) * top));
  }
  shape.computeVertexNormals();
  return shape;
}

const rake = 34 * Math.PI / 180;
const frontPaneZ = 0.68;
const backPaneZ = -1.29;
const roofCenterZ = (frontPaneZ + backPaneZ) / 2;
const paneRise = 0.52 * Math.sin(rake);
const roofDepth = frontPaneZ - backPaneZ - paneRise;
const CABIN_GEO = mergeGeometries([
  makeBox(0.66, 0.055, roofDepth, -0.3, 1.24, roofCenterZ, 0, 0, 0.035),
  makeBox(0.66, 0.055, roofDepth, 0.3, 1.24, roofCenterZ, 0, 0, -0.035),
  xform(slopedGlass(1.54, 0.52, 0.055, 1.25 / 1.54), 0, 1.01, frontPaneZ, -rake),
  xform(slopedGlass(1.54, 0.52, 0.055, 1.25 / 1.54), 0, 1.01, backPaneZ, rake),
  xform(slopedGlass(0.055, 0.47, frontPaneZ - backPaneZ + paneRise, 1), -0.697, 0.997, roofCenterZ, 0, 0, -0.31),
  xform(slopedGlass(0.055, 0.47, frontPaneZ - backPaneZ + paneRise, 1), 0.697, 0.997, roofCenterZ, 0, 0, 0.31),
]);
const DRIVER_GEO = mergeGeometries([
  xform(new Three.SphereGeometry(0.23, 10, 8), -0.25, 1.31, 0.03),
  makeBox(0.58, 0.24, 0.28, -0.25, 1.03, 0.03),
]);
const LIGHTS_GEO = mergeGeometries([
  makeBox(0.48, 0.13, 0.08, -0.62, 0.59, 2.48),
  makeBox(0.48, 0.13, 0.08, 0.62, 0.59, 2.48),
]);
const TAILS_GEO = mergeGeometries([
  makeBox(0.48, 0.13, 0.08, -0.62, 0.64, -2.48),
  makeBox(0.48, 0.13, 0.08, 0.62, 0.64, -2.48),
]);
const GRILLE_GEO = makeBox(0.78, 0.18, 0.06, 0, 0.53, 2.57);
const MIRRORS_GEO = mergeGeometries([
  makeBox(0.12, 0.08, 0.18, -1, 1, 0.3),
  makeBox(0.12, 0.08, 0.18, 1, 1, 0.3),
]);
const PLATES_GEO = mergeGeometries([
  makeBox(0.5, 0.12, 0.035, 0, 0.49, 2.63),
  makeBox(0.5, 0.12, 0.035, 0, 0.49, -2.63),
]);
const WHEEL_GEO = new Three.CylinderGeometry(0.42, 0.42, 0.34, 12);
WHEEL_GEO.rotateZ(Math.PI / 2);
const HUB_GEO = new Three.CylinderGeometry(0.2, 0.2, 0.36, 12);
HUB_GEO.rotateZ(Math.PI / 2);
const WHEEL_OFFSETS = [[-1.02, 1.58], [1.02, 1.58], [-1.02, -1.58], [1.02, -1.58]];
const POLICE_TRIM_GEO = mergeGeometries([
  makeBox(0.04, 0.28, 1.55, -1.02, 0.64, -0.18),
  makeBox(0.04, 0.28, 1.55, 1.02, 0.64, -0.18),
]);
const POLICE_STRIPE_GEO = mergeGeometries([
  makeBox(0.05, 0.09, 1.5, -1.05, 0.7, -0.18),
  makeBox(0.05, 0.09, 1.5, 1.05, 0.7, -0.18),
]);
const BAR_BASE_GEO = makeBox(1.25, 0.14, 0.42, 0, 1.32, roofCenterZ);
const BAR_RED_GEO = makeBox(0.56, 0.18, 0.38, -0.31, 1.32, roofCenterZ);
const BAR_BLUE_GEO = makeBox(0.56, 0.18, 0.38, 0.31, 1.32, roofCenterZ);

const paintMaterial = (color = 0xffffff) => new Three.MeshPhysicalMaterial({
  color, roughness: 0.24, metalness: 0.18, clearcoat: 1, clearcoatRoughness: 0.14,
});
const WHEEL_MAT = new Three.MeshStandardMaterial({ color: 0x14161a, roughness: 0.95 });
const GLASS_MAT = new Three.MeshBasicMaterial({ color: 0x88a8b8, fog: false, toneMapped: false });
const DRIVER_MAT = new Three.MeshBasicMaterial({ color: 0x20262b });
const HEADLIGHT_MAT = new Three.MeshStandardMaterial({ color: 0xfff6c8, emissive: 0xffe9a0, emissiveIntensity: 0.8 });
const TAILLIGHT_MAT = new Three.MeshStandardMaterial({ color: 0xc02020, emissive: 0x800000, emissiveIntensity: 0.6 });
const GRILLE_MAT = new Three.MeshStandardMaterial({ color: 0x20252a, roughness: 0.55, metalness: 0.35 });
const HUB_MAT = new Three.MeshStandardMaterial({ color: 0xc5c7c9, roughness: 0.35, metalness: 0.8 });
const PLATE_MAT = new Three.MeshStandardMaterial({ color: 0xe9e1c9, roughness: 0.8 });
const TRIM_MAT = new Three.MeshStandardMaterial({ color: 0x14161a, roughness: 0.4, metalness: 0.4 });
const STRIPE_MAT = new Three.MeshStandardMaterial({ color: 0xe8e1c8, roughness: 0.55 });
const DARK_MAT = new Three.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 });
const RED_FLASH_MAT = new Three.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff0000, emissiveIntensity: 1.5 });
const BLUE_FLASH_MAT = new Three.MeshStandardMaterial({ color: 0x2040ff, emissive: 0x0020ff, emissiveIntensity: 1.5 });

export function buildCarMesh(color) {
  const car = new Three.Group();
  const paint = paintMaterial(color);
  const body = new Three.Mesh(BODY_GEO, paint);
  body.castShadow = true;
  car.add(body);
  const cabin = new Three.Mesh(CABIN_GEO, GLASS_MAT);
  cabin.castShadow = true;
  car.add(cabin);
  car.add(new Three.Mesh(DRIVER_GEO, DRIVER_MAT));
  car.add(new Three.Mesh(GRILLE_GEO, GRILLE_MAT));
  car.add(new Three.Mesh(MIRRORS_GEO, paint));
  car.add(new Three.Mesh(PLATES_GEO, PLATE_MAT));
  car.add(new Three.Mesh(LIGHTS_GEO, HEADLIGHT_MAT));
  car.add(new Three.Mesh(TAILS_GEO, TAILLIGHT_MAT));
  const rollingWheels = [];
  for (const [side, axle] of WHEEL_OFFSETS) {
    const tire = new Three.Mesh(WHEEL_GEO, WHEEL_MAT);
    tire.position.set(side, 0.42, axle);
    tire.castShadow = true;
    car.add(tire);
    const hub = new Three.Mesh(HUB_GEO, HUB_MAT);
    hub.position.set(side * 1.018, 0.42, axle);
    car.add(hub);
    rollingWheels.push(tire);
  }
  car.userData.wheels = rollingWheels;
  return car;
}

export function createCarFleet(scene, capacity = 40, policeCapacity = 8) {
  const bodyPaint = paintMaterial();
  const pieces = [
    new Three.InstancedMesh(BODY_GEO, bodyPaint, capacity),
    new Three.InstancedMesh(CABIN_GEO, GLASS_MAT, capacity),
    new Three.InstancedMesh(DRIVER_GEO, DRIVER_MAT, capacity),
    new Three.InstancedMesh(GRILLE_GEO, GRILLE_MAT, capacity),
    new Three.InstancedMesh(MIRRORS_GEO, bodyPaint, capacity),
    new Three.InstancedMesh(PLATES_GEO, PLATE_MAT, capacity),
    new Three.InstancedMesh(LIGHTS_GEO, HEADLIGHT_MAT, capacity),
    new Three.InstancedMesh(TAILS_GEO, TAILLIGHT_MAT, capacity),
    new Three.InstancedMesh(WHEEL_GEO, WHEEL_MAT, capacity * 4),
    new Three.InstancedMesh(HUB_GEO, HUB_MAT, capacity * 4),
  ];
  const [body, cabin, drivers, grille, mirrors, plates, headlights, taillights, tires, hubs] = pieces;
  const policeParts = [
    new Three.InstancedMesh(BAR_BASE_GEO, DARK_MAT, policeCapacity),
    new Three.InstancedMesh(POLICE_TRIM_GEO, TRIM_MAT, policeCapacity),
    new Three.InstancedMesh(POLICE_STRIPE_GEO, STRIPE_MAT, policeCapacity),
    new Three.InstancedMesh(BAR_RED_GEO, RED_FLASH_MAT, policeCapacity),
    new Three.InstancedMesh(BAR_BLUE_GEO, BLUE_FLASH_MAT, policeCapacity),
  ];
  const [bar, trim, stripe, red, blue] = policeParts;
  const badges = [];
  for (let slot = 0; slot < policeCapacity; slot += 1) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    context.fillStyle = '#17202a';
    context.fillRect(2, 2, 252, 60);
    context.fillStyle = '#fff1be';
    context.font = 'bold 38px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('POLICE', 128, 32);
    const texture = new Three.CanvasTexture(canvas);
    texture.colorSpace = Three.SRGBColorSpace;
    const badge = new Three.Mesh(new Three.PlaneGeometry(1.55, 0.39), new Three.MeshBasicMaterial({
      map: texture, transparent: true, side: Three.DoubleSide, depthWrite: false,
    }));
    scene.add(badge);
    badges.push(badge);
  }

  for (const mesh of [...pieces, ...policeParts]) {
    mesh.castShadow = false;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(Three.DynamicDrawUsage);
    scene.add(mesh);
  }
  const rootMatrix = new Three.Matrix4();
  const wheelMatrix = new Three.Matrix4();
  const orientation = new Three.Quaternion();
  const rotation = new Three.Euler();
  const location = new Three.Vector3();
  const scale = new Three.Vector3(1, 1, 1);
  const tint = new Three.Color();

  function transformFor(car, size = 1) {
    rotation.set(0, car.heading, 0);
    orientation.setFromEuler(rotation);
    location.set(car.x, 0, car.z);
    rootMatrix.compose(location, orientation, scale.setScalar(size));
    scale.set(1, 1, 1);
    return rootMatrix;
  }

  function sync(trafficCars, policeCars) {
    let rendered = 0;
    const copyCar = (car, size = 1) => {
      if (rendered === capacity) return;
      const slot = rendered++;
      transformFor(car, size);
      for (const mesh of [body, cabin, drivers, grille, mirrors, plates, headlights, taillights]) {
        mesh.setMatrixAt(slot, rootMatrix);
      }
      const color = tint.setHex(car.color ?? 0xd8d8d8);
      body.setColorAt(slot, color);
      mirrors.setColorAt(slot, color);
      for (let wheel = 0; wheel < WHEEL_OFFSETS.length; wheel += 1) {
        rotation.set(car.wheelSpin || 0, 0, 0);
        orientation.setFromEuler(rotation);
        const [side, axle] = WHEEL_OFFSETS[wheel];
        location.set(side, 0.42, axle);
        wheelMatrix.compose(location, orientation, scale);
        wheelMatrix.premultiply(rootMatrix);
        tires.setMatrixAt(slot * 4 + wheel, wheelMatrix);
        hubs.setMatrixAt(slot * 4 + wheel, wheelMatrix);
      }
    };

    for (const car of trafficCars) copyCar(car);
    let marked = 0;
    for (const car of policeCars) {
      copyCar(car, 1.18);
      if (marked >= policeCapacity) continue;
      transformFor(car, 1.18);
      for (const mesh of [bar, trim, stripe, red, blue]) mesh.setMatrixAt(marked, rootMatrix);
      const badge = badges[marked];
      badge.position.set(
        car.x + Math.sin(car.heading) * 2.62,
        0.78,
        car.z + Math.cos(car.heading) * 2.62,
      );
      badge.rotation.set(0, car.heading, 0);
      badge.scale.setScalar(1.18);
      marked += 1;
    }

    for (const mesh of pieces.slice(0, 8)) mesh.count = rendered;
    tires.count = rendered * WHEEL_OFFSETS.length;
    hubs.count = rendered * WHEEL_OFFSETS.length;
    for (const mesh of policeParts) mesh.count = marked;
    badges.forEach((badge, index) => { badge.visible = index < marked; });
    for (const mesh of [...pieces, ...policeParts]) mesh.instanceMatrix.needsUpdate = true;
    if (body.instanceColor) body.instanceColor.needsUpdate = true;
    if (mirrors.instanceColor) mirrors.instanceColor.needsUpdate = true;
    const redPhase = Math.floor(performance.now() / 260) % 2 === 0;
    RED_FLASH_MAT.emissiveIntensity = redPhase ? 2.2 : 0.25;
    BLUE_FLASH_MAT.emissiveIntensity = redPhase ? 0.25 : 2.2;
  }
  return { sync };
}

export function createCar(mesh, x, z, heading) {
  return {
    mesh, x, z, heading, speed: 0, health: CONFIG.carHealth,
    steer: 0, wrecked: false, driver: null, isPlayer: false,
    isPolice: false, wheelSpin: 0,
  };
}

export function driveCar(car, input, dt, colliders, onCrash) {
  if (car.wrecked) return;
  if (input.throttle > 0) car.speed += CONFIG.carAccel * dt * input.throttle;
  if (input.brake > 0) {
    car.speed -= (car.speed > 0.5 ? CONFIG.carBrake : CONFIG.carReverse) * dt;
  }
  if (input.throttle <= 0 && input.brake <= 0) {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 6 * dt);
  }
  if (input.handbrake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 12 * dt);
  car.speed = Math.max(-CONFIG.carMaxReverse, Math.min(CONFIG.carMaxSpeed, car.speed));
  const traction = Math.min(1, Math.abs(car.speed) / 12);
  const steeringGoal = input.steer * 0.55 * (1 - traction * 0.55);
  car.steer += (steeringGoal - car.steer) * Math.min(1, dt * 8);
  car.heading += car.steer * (car.speed / 3.2) * (input.handbrake ? 1.5 : 1) * dt;

  const proposedX = car.x + Math.sin(car.heading) * car.speed * dt;
  const proposedZ = car.z + Math.cos(car.heading) * car.speed * dt;
  const resolved = resolveCircle(proposedX, proposedZ, 1.5, colliders);
  const withinCity = clampBounds(resolved.x, resolved.z);
  const contacted = Math.abs(proposedX - withinCity.x) > 0.01 || Math.abs(proposedZ - withinCity.z) > 0.01;
  if (contacted && !car.touchingWall && Math.abs(car.speed) > 6) {
    const hitSpeed = Math.abs(car.speed);
    car.speed *= 0.45;
    car.health -= hitSpeed * 0.9;
    if (onCrash) onCrash(hitSpeed);
  }
  car.touchingWall = contacted;
  car.x = withinCity.x;
  car.z = withinCity.z;
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  car.wheelSpin += car.speed * dt * 2.4;
  for (const wheel of car.mesh.userData.wheels) wheel.rotation.x = car.wheelSpin;
  if (car.health <= 0) {
    car.wrecked = true;
    car.speed = 0;
    car.mesh.rotation.z = 0.22;
  }
}

export function createTraffic(scene, rng, colliders) {
  void scene;
  void colliders;
  const intersections = [-186, -124, -62, 0, 62, 124, 186];
  const cars = [];

  function placeOnRoad(car, x, z, axis, direction) {
    car.x = x;
    car.z = z;
    car.axis = axis;
    car.dir = direction;
    car.heading = axis === 'x'
      ? (direction > 0 ? Math.PI / 2 : -Math.PI / 2)
      : (direction > 0 ? 0 : Math.PI);
    car.speed = rng.range(8, 13);
  }

  const freshCar = () => ({
    x: 0, z: 0, axis: 'x', dir: 1, heading: 0, speed: 10,
    health: 100, color: rng.pick(CAR_COLORS), wheelSpin: 0,
  });
  for (let index = 0; index < 14; index += 1) {
    const vehicle = freshCar();
    const roadAxis = rng.chance(0.5) ? 'x' : 'z';
    const crossStreet = rng.pick(intersections);
    const progress = rng.range(-200, 200);
    placeOnRoad(vehicle,
      roadAxis === 'x' ? progress : crossStreet,
      roadAxis === 'x' ? crossStreet : progress,
      roadAxis,
      rng.chance(0.5) ? 1 : -1);
    cars.push(vehicle);
  }

  function distanceAhead(car, others, drivenCar) {
    const frontX = Math.sin(car.heading);
    const frontZ = Math.cos(car.heading);
    let nearest = Infinity;
    const measure = (x, z) => {
      const dx = x - car.x;
      const dz = z - car.z;
      const along = dx * frontX + dz * frontZ;
      const across = Math.abs(dx * frontZ - dz * frontX);
      if (along > 0 && along < nearest && across < 2.6) nearest = along;
    };
    for (const other of others) if (other !== car) measure(other.x, other.z);
    if (drivenCar) measure(drivenCar.x, drivenCar.z);
    return nearest;
  }

  function update(dt, playerPos, playerCar, policeCars) {
    for (const car of cars) {
      if (car.parked) continue;
      const offsetX = car.x - playerPos.x;
      const offsetZ = car.z - playerPos.z;
      if (offsetX * offsetX + offsetZ * offsetZ > 280 * 280) {
        const axis = rng.chance(0.5) ? 'x' : 'z';
        const crossing = rng.pick(intersections);
        const along = playerPos[axis] + rng.range(-90, 90);
        placeOnRoad(car, axis === 'x' ? along : crossing, axis === 'x' ? crossing : along,
          axis, rng.chance(0.5) ? 1 : -1);
      }
      const atJunction = intersections.some((street) => Math.abs(car.x - street) < 2.2)
        && intersections.some((street) => Math.abs(car.z - street) < 2.2);
      if (atJunction && rng.chance(dt * 0.55)) {
        car.axis = car.axis === 'x' ? 'z' : 'x';
        car.dir = rng.chance(0.5) ? 1 : -1;
        if (car.axis === 'x') {
          car.heading = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
          car.x = intersections.reduce((best, value) => Math.abs(value - car.x) < Math.abs(best - car.x) ? value : best, intersections[0]);
        } else {
          car.heading = car.dir > 0 ? 0 : Math.PI;
          car.z = intersections.reduce((best, value) => Math.abs(value - car.z) < Math.abs(best - car.z) ? value : best, intersections[0]);
        }
      }
      const desiredSpeed = distanceAhead(car, cars, playerCar) < 12 ? 0 : rng.range(8, 13);
      car.speed += (desiredSpeed - car.speed) * Math.min(1, dt * 1.5);
      car.x += Math.sin(car.heading) * car.speed * dt;
      car.z += Math.cos(car.heading) * car.speed * dt;
      const bounded = clampBounds(car.x, car.z);
      const reachedEdge = bounded.x !== car.x || bounded.z !== car.z;
      car.x = bounded.x;
      car.z = bounded.z;
      if (reachedEdge) {
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
      let closest = null;
      let limit = maxDist;
      for (const car of cars) {
        const distance = Math.hypot(car.x - x, car.z - z);
        if (distance < limit) {
          closest = car;
          limit = distance;
        }
      }
      return closest;
    },
    remove(car) {
      const position = cars.indexOf(car);
      if (position !== -1) cars.splice(position, 1);
    },
    addParked(x, z, heading, color) {
      const vehicle = {
        x, z, axis: 'x', dir: 1, heading, speed: 0, health: 100,
        color, parked: true, wheelSpin: 0,
      };
      cars.push(vehicle);
      return vehicle;
    },
  };
}

export function createPolice(scene, rng) {
  void scene;
  const cars = [];
  let nextSpawn = 0;

  function addCruiser(playerPos) {
    const angle = rng.range(0, Math.PI * 2);
    const x = playerPos.x + Math.sin(angle) * 95;
    const z = playerPos.z + Math.cos(angle) * 95;
    const cruiser = createCar(null, x, z, Math.atan2(playerPos.x - x, playerPos.z - z));
    cruiser.isPolice = true;
    cruiser.color = 0xf2f2f2;
    cruiser.maxSpeed = 42;
    cars.push(cruiser);
    return cruiser;
  }

  function update(dt, wanted, playerPos, playerCar, colliders, onRam) {
    nextSpawn -= dt;
    const desiredCount = Math.min(4, wanted);
    if (wanted > 0 && cars.length < desiredCount && nextSpawn <= 0) {
      addCruiser(playerPos);
      nextSpawn = 2.5;
    }
    for (let index = cars.length - 1; index >= 0; index -= 1) {
      const cruiser = cars[index];
      if (wanted === 0) {
        cruiser.speed = Math.min(cruiser.speed + 10 * dt, 20);
        cruiser.heading += 0.4 * dt;
        cruiser.x += Math.sin(cruiser.heading) * cruiser.speed * dt;
        cruiser.z += Math.cos(cruiser.heading) * cruiser.speed * dt;
        const awayX = cruiser.x - playerPos.x;
        const awayZ = cruiser.z - playerPos.z;
        if (awayX * awayX + awayZ * awayZ > 150 * 150) cars.splice(index, 1);
        cruiser.wheelSpin += cruiser.speed * dt * 2.4;
        continue;
      }
      const targetX = playerCar ? playerCar.x : playerPos.x;
      const targetZ = playerCar ? playerCar.z : playerPos.z;
      const intended = Math.atan2(targetX - cruiser.x, targetZ - cruiser.z);
      let turn = intended - cruiser.heading;
      while (turn > Math.PI) turn -= Math.PI * 2;
      while (turn < -Math.PI) turn += Math.PI * 2;
      cruiser.heading += Math.max(-1.6 * dt, Math.min(1.6 * dt, turn * 2.4 * dt));
      const cruiseSpeed = 26 + wanted * 2.5;
      cruiser.speed += (cruiseSpeed - cruiser.speed) * Math.min(1, dt * 0.8);
      const proposed = resolveCircle(
        cruiser.x + Math.sin(cruiser.heading) * cruiser.speed * dt,
        cruiser.z + Math.cos(cruiser.heading) * cruiser.speed * dt,
        1.5,
        colliders,
      );
      const legal = clampBounds(proposed.x, proposed.z);
      cruiser.x = legal.x;
      cruiser.z = legal.z;
      cruiser.wheelSpin += cruiser.speed * dt * 2.4;
      const targetDist = Math.hypot(targetX - cruiser.x, targetZ - cruiser.z);
      cruiser.ramCooldown = Math.max(0, (cruiser.ramCooldown ?? 0) - dt);
      if (targetDist < 3.4 && cruiser.ramCooldown <= 0 && onRam) {
        cruiser.ramCooldown = 0.8;
        onRam(cruiser, targetDist);
      }
    }
  }

  return {
    cars,
    update,
    nearestDist(playerPos) {
      let minimum = Infinity;
      for (const car of cars) minimum = Math.min(minimum, Math.hypot(car.x - playerPos.x, car.z - playerPos.z));
      return minimum;
    },
  };
}
