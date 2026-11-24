import * as THREE from '../vendor/three.module.min.js';
import { CONFIG, MISSIONS, PALETTE, STORY, SAVE_KEY } from './config.js';
import { makeRng } from './rng.js';
import { createAudio } from './audio.js';
import { buildWorld, resolveCircle, clampBounds } from './world.js';
import { buildCarMesh, createCar, driveCar, createTraffic, createPolice, createCarFleet } from './vehicles.js';
import { buildPersonMesh, createPlayer, movePlayer, createPedestrians, createThugs, meleeHit, pistolRay } from './people.js';
import { createMissions } from './missions.js';
import { createHud, buildHudDom } from './hud.js';
import { createInput, ACTION_INTERACT, ACTION_PUNCH, ACTION_PAUSE, ACTION_RESTART, ACTION_MUTE, ACTION_FIRE } from './input.js';
import { createCollectibles, updateCollectibles } from './collectibles.js';
buildHudDom();
const ui = createHud();
const sound = createAudio();
const query = new URLSearchParams(location.search);
const shotPage = query.get('shot');
const reduced = query.get('q') === 'low';
const resolution = reduced ? 0.5 : 1;
const display = new THREE.WebGLRenderer({ antialias: !reduced, powerPreference: 'high-performance' });
display.setPixelRatio(1);
display.shadowMap.enabled = !reduced;
display.shadowMap.type = THREE.PCFSoftShadowMap;
display.outputColorSpace = THREE.SRGBColorSpace;
display.toneMapping = THREE.ACESFilmicToneMapping;
display.toneMappingExposure = 1.22;
document.body.prepend(display.domElement);
const stage = new THREE.Scene();
stage.background = new THREE.Color(PALETTE.sky);
stage.fog = new THREE.Fog(PALETTE.fog, 180, 600);
stage.add(new THREE.HemisphereLight(0xfff1d5, 0xb89b78, 1.45));
const daylight = new THREE.DirectionalLight(0xffefcf, 2.6);
daylight.position.set(15, 150, 170);
daylight.castShadow = !reduced;
daylight.shadow.mapSize.set(2048, 2048);
Object.assign(daylight.shadow.camera, { left: -150, right: 150, top: 150, bottom: -150, far: 450 });
stage.add(daylight, daylight.target);
const lens = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 900);
lens.position.set(-200, 30, -200);
function fitWindow() {
  lens.aspect = innerWidth / innerHeight;
  lens.updateProjectionMatrix();
  display.setSize(Math.floor(innerWidth * resolution), Math.floor(innerHeight * resolution), false);
  Object.assign(display.domElement.style, { width: '100vw', height: '100vh', display: 'block' });
}
addEventListener('resize', fitWindow);
fitWindow();
const random = makeRng(Number.parseInt(query.get('seed') || '1', 10) || 1);
const town = buildWorld(stage, random);
const barriers = town.colliders;
const motorists = createTraffic(stage, random, barriers);
const patrol = createPolice(stage, random);
const fleetView = createCarFleet(stage);
const crowd = createPedestrians(stage, random, barriers);
const gang = createThugs(stage, random);
const hero = createPlayer(stage, -170, -170);
const controls = createInput(display.domElement);
const packages = createCollectibles(stage, random, barriers);
let mode = 'title', cash = 250, heat = 0, crimeAt = -1000, cooling = 0;
let driving = false, ride = null, invincible = false, clock = 0, mouseAt = 0;
let gunWait = 0, arrestWait = 0, jobWait = -1, threat = null, threatWait = 0;
let tremor = 0, zoomKick = 0, mapAt = -1, prizeCar = null;
let readyAt = Infinity, readySent = false, laneCleared = false;
const position = () => driving && ride ? ride : hero;
const healthLimit = CONFIG.playerHealth || 100;
const automobileLimit = CONFIG.carHealth || 100;
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const sparks = [];
const particleCloud = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.48, depthWrite: false }), 140);
particleCloud.frustumCulled = false;
stage.add(particleCloud);
const transform = new THREE.Object3D();
for (let slot = 0; slot < 140; slot++) sparks.push({ life: 0, duration: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 });
function scatter(at, tint, amount = 8, force = 4) {
  let remaining = amount;
  for (let slot = 0; slot < sparks.length && remaining > 0; slot++) {
    const mote = sparks[slot];
    if (mote.life > 0) continue;
    const angle = random.range(0, Math.PI * 2), magnitude = random.range(0.25, 1) * force;
    Object.assign(mote, { x: at.x, y: at.y ?? 1, z: at.z, vx: Math.sin(angle) * magnitude, vz: Math.cos(angle) * magnitude, vy: random.range(1, force + 1), duration: random.range(0.5, 1) });
    mote.life = mote.duration;
    particleCloud.setColorAt(slot, new THREE.Color(tint));
    remaining--;
  }
  if (particleCloud.instanceColor) particleCloud.instanceColor.needsUpdate = true;
}
const bullets = Array.from({ length: 12 }, () => {
  const beam = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xffedac, transparent: true, opacity: 0 }));
  stage.add(beam);
  return { beam, ttl: 0 };
});
function traceShot(a, b) {
  const entry = bullets.find(item => item.ttl <= 0) || bullets.reduce((a, b) => a.ttl < b.ttl ? a : b);
  entry.beam.geometry.setFromPoints([new THREE.Vector3(a.x, a.y, a.z), new THREE.Vector3(b.x, b.y, b.z)]);
  entry.ttl = 0.12;
}
let rubberIndex = 0;
const rubber = Array.from({ length: 90 }, () => {
  const patch = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.6), new THREE.MeshBasicMaterial({ color: 0x171717, transparent: true, opacity: 0, depthWrite: false }));
  patch.rotation.x = -Math.PI / 2;
  stage.add(patch);
  return { patch, ttl: 0 };
});
function tirePrint(car) {
  const entry = rubber[rubberIndex++ % rubber.length];
  entry.patch.position.set(car.x, 0.035, car.z);
  entry.patch.rotation.z = -car.heading;
  entry.ttl = 6;
}
const pillar = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 42, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd35c, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(1.1), new THREE.MeshStandardMaterial({ color: 0xffd35c, emissive: 0xb98a10, emissiveIntensity: 0.8 }));
pillar.visible = diamond.visible = false;
stage.add(pillar, diamond);
const firstAid = [[-172, -172], [14, -14], [190, 138]].map(([east, north]) => {
  const box = new THREE.Group();
  const caseMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 0.8, 0.45), new THREE.MeshStandardMaterial({ color: 0xf5f5e9 }));
  box.add(caseMesh);
  const red = new THREE.MeshBasicMaterial({ color: 0xe34848 });
  box.add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.48), red), new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.48), red));
  box.position.set(east, 1, north);
  stage.add(box);
  return { box, east, north, wait: 0 };
});
function objectivePoint() {
  if (jobs.current()?.id === 2 && jobs.phase === 'pickup' && prizeCar) return prizeCar;
  return jobs.target();
}
function animateEffects(delta) {
  sparks.forEach((mote, slot) => {
    mote.life = Math.max(0, mote.life - delta);
    if (mote.life > 0) {
      mote.vy -= delta * 8;
      mote.x += mote.vx * delta;
      mote.y += mote.vy * delta;
      mote.z += mote.vz * delta;
    }
    transform.position.set(mote.x, Math.max(0, mote.y), mote.z);
    transform.scale.setScalar(mote.life > 0 ? mote.life / mote.duration : 0.00001);
    transform.updateMatrix();
    particleCloud.setMatrixAt(slot, transform.matrix);
  });
  particleCloud.instanceMatrix.needsUpdate = true;
  for (const item of bullets) {
    item.ttl = Math.max(0, item.ttl - delta);
    item.beam.material.opacity = item.ttl / 0.12;
  }
  for (const item of rubber) {
    item.ttl = Math.max(0, item.ttl - delta);
    item.patch.material.opacity = 0.55 * item.ttl / 6;
  }
  const goal = objectivePoint();
  pillar.visible = diamond.visible = !!goal && mode === 'playing';
  if (goal) {
    pillar.position.set(goal.x, 21, goal.z);
    diamond.position.set(goal.x, 4 + Math.sin(clock * 2.4) * 0.5, goal.z);
    diamond.rotation.y += delta * 0.7;
  }
}
function storeProgress() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ money: cash, missionsDone: jobs.completed, health: hero.health, when: Date.now() })); } catch {}
}
function readProgress() {
  try {
    const record = JSON.parse(localStorage.getItem(SAVE_KEY));
    return record && typeof record.money === 'number' ? record : null;
  } catch { return null; }
}
function deployGang() {
  gang.clear();
  for (const [east, north] of [[-8, -8], [10, 6], [4, -14]]) gang.spawn(east, north);
}
function storyEnd() {
  mode = 'end';
  ui.showEnd('complete', Array.isArray(STORY.outro) ? STORY.outro : [STORY.outro || '']);
}
const jobs = createMissions(event => {
  const job = event.mission;
  switch (event.type) {
    case 'briefing':
      ui.showBriefing(job);
      ui.message(`Job ${job.id}: ${job.name} — ${job.briefing}`);
      if (job.wantedOnStart) {
        heat = job.wantedOnStart;
        crimeAt = clock;
        ui.setStars(heat);
      }
      if (job.id === 3) deployGang();
      break;
    case 'pickedUp':
    case 'pickedup':
    case 'picked-up':
    case 'pickup':
      ui.message('Package secured. Get it to the garage.');
      sound.pickup?.();
      break;
    case 'delivered':
      cash += event.reward;
      ui.setMoney(cash);
      sound.success();
      ui.banner(`Job complete — +$${event.reward}`, job.name);
      storeProgress();
      if (jobs.completed < MISSIONS.length) jobWait = 4;
      else storyEnd();
      break;
    case 'failed':
      ui.message(`Job failed: ${event.reason}`);
      sound.fail();
      break;
    case 'storyDone':
    case 'story-done':
    case 'done': storyEnd(); break;
  }
});
function maintainPrize() {
  if (jobs.current()?.id !== 2) { prizeCar = null; return; }
  if (!prizeCar) prizeCar = motorists.addParked(62, 62, Math.PI * 0.5, 0xe8c832, automobileLimit);
}
function relocate(east, north) {
  hero.x = east;
  hero.z = north;
  hero.y = 0;
  hero.vy = 0;
  hero.onGround = true;
  hero.mesh.position.set(east, 0, north);
  if (driving && ride) {
    ride.x = east;
    ride.z = north;
    ride.mesh.position.set(east, 0, north);
  }
}
function leaveRide(force = false) {
  if (!driving || !ride) return;
  if (!force && Math.abs(ride.speed) > 8) { ui.message('Slow down to get out.'); return; }
  ride.speed = 0;
  const abandoned = ride;
  driving = false;
  ride = null;
  relocate(abandoned.x + Math.cos(abandoned.heading) * 2.4, abandoned.z - Math.sin(abandoned.heading) * 2.4);
  hero.mesh.visible = true;
  stage.remove(abandoned.mesh);
  motorists.addParked(abandoned.x, abandoned.z, abandoned.heading, abandoned.color, abandoned.health);
  threat = { x: hero.x, z: hero.z };
  threatWait = 3;
}
function resetStreet() {
  if (ride) stage.remove(ride.mesh);
  ride = null;
  driving = false;
  hero.mesh.visible = true;
  relocate(-170, -170);
  heat = 0;
  cooling = 0;
  arrestWait = 0;
  crimeAt = -1000;
  jobWait = -1;
  ui.setStars(0);
}
function beginSession(saved = false) {
  const record = saved ? readProgress() : null;
  resetStreet();
  cash = record?.money ?? 250;
  hero.health = record?.health ?? healthLimit;
  jobs.setCompleted(record?.missionsDone ?? 0);
  prizeCar = null;
  gang.clear();
  jobs.startMission(Math.min(record?.missionsDone ?? 0, MISSIONS.length - 1), record?.missionsDone ?? 0);
  maintainPrize();
  ui.setMoney(cash);
  ui.setHealth(hero.health, healthLimit);
  ui.hideScreens();
  mode = 'playing';
  sound.unlock();
  ui.message("Vera's jobs are on your map. Follow the gold beacon.");
}
function retryStreet() {
  resetStreet();
  hero.health = healthLimit;
  const progress = readProgress()?.missionsDone ?? jobs.completed;
  prizeCar = null;
  jobs.startMission(Math.min(progress, MISSIONS.length - 1), progress);
  maintainPrize();
  ui.hideScreens();
  mode = 'playing';
  ui.message('Back on the street. The job is still open.');
}
function pauseSwitch() {
  if (mode === 'playing') {
    mode = 'paused';
    ui.showPause();
    storeProgress();
  } else if (mode === 'paused') {
    mode = 'playing';
    ui.hidePause();
  }
}
function raiseHeat(amount, explanation) {
  if (invincible) return;
  heat = Math.min(5, heat + amount);
  crimeAt = clock;
  cooling = 0;
  ui.setStars(heat);
  if (explanation) ui.message(explanation);
  if (heat === 1) ui.message(`Wanted level ${heat} — the Solmar PD is rolling.`);
}
function finishInjury(reason = 'You were taken out.') {
  if (mode !== 'playing') return;
  mode = 'end';
  cash = Math.max(0, cash - 200);
  ui.setMoney(cash);
  jobs.fail(reason);
  ui.showEnd('wasted', [reason, 'The medics patched you up — minus $200.', 'Vera is not impressed.']);
  sound.fail();
  storeProgress();
}
function arrest() {
  if (mode !== 'playing') return;
  mode = 'end';
  cash = Math.max(0, cash - 150);
  ui.setMoney(cash);
  jobs.fail('Busted by the Solmar PD.');
  ui.showEnd('busted', ['The Solmar PD caught you on foot.', 'Bail set you back $150.', 'Vera is not impressed.']);
  sound.fail();
  storeProgress();
}
function injure(amount, reason = "Rook's crew got to you.") {
  if (invincible || hero.invulnerable > 0 || mode !== 'playing') return;
  hero.health = Math.max(0, hero.health - amount);
  hero.invulnerable = 0.5;
  ui.setHealth(hero.health, healthLimit);
  ui.damageFlash();
  sound.thud();
  if (hero.health === 0) finishInjury(reason);
}
function takeVehicle(vehicle) {
  const special = vehicle === prizeCar;
  const driverMesh = buildPersonMesh(random);
  const escapee = { mesh: driverMesh, x: vehicle.x + 2.2, z: vehicle.z, heading: vehicle.heading + Math.PI / 2, speed: 6, state: 'flee', fleeTimer: 5, health: 30, down: false, downTimer: 0, targetX: vehicle.x + 12, targetZ: vehicle.z, waitTimer: 0 };
  crowd.addExtra(escapee);
  motorists.remove(vehicle);
  if (vehicle.isPolice) {
    const index = patrol.cars.indexOf(vehicle);
    if (index >= 0) patrol.cars.splice(index, 1);
  }
  const chassis = buildCarMesh(vehicle.color ?? 0xe8c832);
  stage.add(chassis);
  ride = createCar(chassis, vehicle.x, vehicle.z, vehicle.heading);
  Object.assign(ride, { color: vehicle.color, health: vehicle.health, modelName: special ? 'Comet GT' : vehicle.isPolice ? 'PD CRUISER' : 'SPORT GT', isPlayer: true });
  driving = true;
  hero.mesh.visible = false;
  ui.message(special ? 'You took the Comet GT. Vera will be pleased — the law will not.' : 'Car jacked. Drive like you mean it.');
  sound.engine(0, true);
  if (special) {
    raiseHeat(1, 'Grand theft auto — the owner called it in.');
    jobs.arrive();
  } else raiseHeat(1);
}
function grantRide(paint = 0xe44f32) {
  if (ride) stage.remove(ride.mesh);
  const body = buildCarMesh(paint);
  stage.add(body);
  ride = createCar(body, hero.x + 3, hero.z, hero.heading);
  ride.color = paint;
  ride.modelName = jobs.current()?.id === 2 && paint === 0xe8c832 ? 'Comet GT' : 'SPORT GT';
  ride.isPlayer = true;
  driving = true;
  hero.mesh.visible = false;
  return ride;
}
const liveGangster = () => gang.thugs.find(person => !person.dead);
function projectPoint(point) {
  const projected = new THREE.Vector3(point.x, point.y ?? 1.5, point.z).project(lens);
  return { x: (1 + projected.x) * innerWidth / 2, y: (1 - projected.y) * innerHeight / 2, behind: projected.z > 1 };
}
function woundTarget(victim, amount) {
  if (!victim || victim.dead || victim.down) return;
  victim.health -= amount;
  ui.floater({ x: victim.x, y: 2, z: victim.z }, String(amount), 'damage', projectPoint);
  scatter(victim, 0xffce58, 7);
  threat = { x: victim.x, z: victim.z };
  threatWait = 3;
  if (victim.health > 0) return;
  scatter(victim, 0xbe3030, 12);
  if (gang.thugs.includes(victim)) {
    victim.dead = true;
    if (victim.mesh) victim.mesh.visible = false;
    cash += 50;
    ui.setMoney(cash);
    ui.floater({ x: victim.x, y: 2, z: victim.z }, '+$50', 'cash', projectPoint);
    sound.coin();
    scatter(victim, 0x53d66d, 10);
  } else {
    crowd.knockDown(victim);
    raiseHeat(2);
  }
}
function throwPunch() {
  if (driving) return;
  sound.punch();
  const contacts = meleeHit(hero, hero.heading, 2.4, [...crowd.peds, ...gang.thugs]);
  const victims = Array.isArray(contacts) ? contacts : contacts ? [contacts] : [];
  for (const hit of victims) woundTarget(hit.target, 25);
  if (!victims.length) scatter({ x: hero.x + Math.sin(hero.heading) * 2, y: 1, z: hero.z + Math.cos(hero.heading) * 2 }, 0xbdbdb5, 4, 2);
}
function firePistol() {
  if (mode !== 'playing' || driving || gunWait > 0) return;
  gunWait = 0.28;
  sound.gunshot();
  const muzzle = { x: hero.x, y: 1.4, z: hero.z };
  const direction = { x: Math.sin(controls.yaw), y: 0, z: Math.cos(controls.yaw) };
  hero.heading = controls.yaw;
  const impact = pistolRay(muzzle, direction, 70, [...crowd.peds, ...gang.thugs], barriers);
  const endpoint = impact?.point || { x: muzzle.x + direction.x * 70, y: muzzle.y, z: muzzle.z + direction.z * 70 };
  traceShot(muzzle, endpoint);
  scatter(endpoint, impact?.hit ? 0xffd15c : 0xb9b7ad, 5, 3);
  if (impact?.hit) woundTarget(impact.hit, 34);
  raiseHeat(1);
}
function interactWithWorld() {
  if (driving) {
    const goal = objectivePoint();
    if (jobs.phase === 'deliver' && ride && goal && distance(ride, goal) < 7) {
      if (jobs.current()?.id === 3 && heat > 0) {
        ui.message('Lose the cops first — the hideout is hot while you are wanted.');
        sound.fail();
        return;
      }
      jobs.arrive();
      return;
    }
    leaveRide();
    return;
  }
  const goal = objectivePoint();
  if (goal && distance(hero, goal) < 5) {
    if (jobs.phase === 'deliver' && jobs.current()?.id === 3 && heat > 0) {
      ui.message('Lose the cops first — the hideout is hot while you are wanted.');
      sound.fail();
      return;
    }
    if (jobs.phase === 'pickup' && jobs.current()?.id === 2 && prizeCar) { takeVehicle(prizeCar); return; }
    const wasPickup = jobs.phase === 'pickup';
    jobs.arrive();
    if (wasPickup) ui.message("Now bring it back to Vera's garage.");
    return;
  }
  let candidate = motorists.nearestCar(hero.x, hero.z, 4.2);
  for (const cruiser of patrol.cars) if (distance(hero, cruiser) < 4.2 && (!candidate || distance(hero, cruiser) < distance(hero, candidate))) candidate = cruiser;
  if (candidate) takeVehicle(candidate);
}
function wreckRide() {
  if (!ride || ride.wrecked) return;
  ride.wrecked = true;
  ride.speed = 0;
  ui.message('Your ride is wrecked.');
  if (jobs.current()?.id === 2 && jobs.phase === 'deliver') jobs.fail('The Comet GT is wrecked.');
  mode = 'end';
  ui.showEnd('wrecked', ['The Comet GT is wrecked.', 'Vera does not pay for scrap.']);
  sound.fail();
  storeProgress();
}
function rammed() {
  if (!driving || !ride || invincible) return;
  ride.health = Math.max(0, ride.health - 6);
  ride.speed *= 0.86;
  sound.crash();
  tremor += 0.4;
  scatter(ride, 0xffc45a, 12, 5);
  ui.damageFlash();
  if (ride.health <= 0) wreckRide();
}
function clearShotLane() {
  if (!ride) return;
  if (shotPage === 'city') {
    // City shot: random traffic keeps driving/respawning into the hero car, so
    // a one-time clear cannot hold. Clear every frame instead, but only
    // non-parked (random) cars near the hero; the staged cars are parked.
    for (const vehicle of [...motorists.cars]) {
      if (vehicle.parked) continue;
      const dx = vehicle.x - ride.x, dz = vehicle.z - ride.z;
      if (dx * dx + dz * dz < 14 * 14) motorists.remove(vehicle);
    }
    return;
  }
  for (const vehicle of [...motorists.cars]) {
    const dx = vehicle.x - ride.x, dz = vehicle.z - ride.z;
    const forward = dx * Math.sin(ride.heading) + dz * Math.cos(ride.heading);
    const lateral = dx * Math.cos(ride.heading) - dz * Math.sin(ride.heading);
    if (forward > -2 && forward < 8 && Math.abs(lateral) < 1.8) motorists.remove(vehicle);
  }
}
function pinShot() {
  if (!ride || ride.wrecked || !['chase', 'mission'].includes(shotPage)) return;
  ride.speed = Math.max(22, ride.speed);
  clearShotLane();
  patrol.cars.slice(0, 3).forEach((unit, index) => {
    const ahead = index === 0 ? 5.0 : index === 1 ? 5.8 : 10.5;
    const side = index === 0 ? 3.2 : index === 1 ? -3.2 : -3.8;
    unit.x = ride.x + Math.sin(ride.heading) * ahead + Math.cos(ride.heading) * side;
    unit.z = ride.z + Math.cos(ride.heading) * ahead - Math.sin(ride.heading) * side;
    unit.heading = ride.heading + (index === 0 ? -0.12 : index === 1 ? 0.12 : 0.05);
    unit.speed = 22;
  });
  if (motorists.cars.length >= 3) {
    const t0 = motorists.cars[0];
    t0.x = ride.x + Math.sin(ride.heading) * 26 + Math.cos(ride.heading) * 3.6;
    t0.z = ride.z + Math.cos(ride.heading) * 26 - Math.sin(ride.heading) * 3.6;
    t0.heading = ride.heading;
    t0.speed = 18;

    const t1 = motorists.cars[1];
    t1.x = ride.x + Math.sin(ride.heading) * 42 + Math.cos(ride.heading) * -3.4;
    t1.z = ride.z + Math.cos(ride.heading) * 42 - Math.sin(ride.heading) * -3.4;
    t1.heading = ride.heading;
    t1.speed = 14;

    const t2 = motorists.cars[2];
    t2.x = ride.x + Math.sin(ride.heading) * -12 + Math.cos(ride.heading) * -3.6;
    t2.z = ride.z + Math.cos(ride.heading) * -12 - Math.sin(ride.heading) * -3.6;
    t2.heading = ride.heading;
    t2.speed = 20;
  }
}
function updateMedicine(delta) {
  for (const aid of firstAid) {
    aid.wait = Math.max(0, aid.wait - delta);
    aid.box.visible = aid.wait === 0;
    aid.box.position.y = 1 + Math.sin(clock * 2 + aid.east) * 0.2;
    aid.box.rotation.y += delta * 0.7;
    if (aid.wait > 0 || hero.health >= healthLimit || Math.hypot(position().x - aid.east, position().z - aid.north) >= 2.2) continue;
    hero.health = Math.min(healthLimit, hero.health + 40);
    aid.wait = 45;
    aid.box.visible = false;
    ui.message('First aid +40.');
    sound.pickup?.();
  }
}
function aimCamera(delta) {
  const subject = position();
  if (driving && !shotPage && performance.now() - mouseAt > 2500) {
    const turn = Math.atan2(Math.sin(ride.heading - controls.yaw), Math.cos(ride.heading - controls.yaw));
    controls.setYaw(controls.yaw + turn * Math.min(1, delta * 1.4));
  }
  const compact = ['chase', 'mission'].includes(shotPage);
  const radius = driving ? compact ? 4.5 : 12.5 : shotPage === 'city' ? 5.2 : 7.5;
  const elevation = driving ? (compact ? 2.0 : 2.8) + controls.pitch * 4 : (shotPage === 'city' ? 1.4 : 1.55) + controls.pitch * 3.5;
  const yawAngle = controls.yaw;
  const pitchAngle = controls.pitch;
  const desired = new THREE.Vector3(subject.x - Math.sin(yawAngle) * Math.cos(pitchAngle) * radius, Math.max(1.2, (hero.y || 0) + elevation + Math.sin(pitchAngle) * radius), subject.z - Math.cos(yawAngle) * Math.cos(pitchAngle) * radius);
  lens.position.lerp(desired, Math.min(1, delta * 8));
  tremor = Math.max(0, tremor - delta * 1.6);
  const amplitude = tremor * tremor * 0.5;
  lens.position.x += random.range(-amplitude, amplitude);
  lens.position.y += random.range(-amplitude, amplitude);
  lens.lookAt(subject.x + Math.sin(yawAngle) * 2, (hero.y || 0) + 0.6, subject.z + Math.cos(yawAngle) * 2);
  const speedRatio = driving ? Math.min(1, Math.abs(ride.speed) / (CONFIG.carMaxSpeed || 45)) : 0;
  zoomKick += (speedRatio * 10 - zoomKick) * Math.min(1, delta * 4);
  lens.fov = 62 + zoomKick;
  lens.updateProjectionMatrix();
  daylight.position.set(subject.x + 15, 150, subject.z + 170);
  daylight.target.position.set(subject.x, 0, subject.z);
}
function refreshUi() {
  const subject = position();
  const goal = objectivePoint();
  ui.setHealth(hero.health, healthLimit);
  updateCollectibles(packages, new THREE.Vector3(subject.x, 0, subject.z), (collected, total) => {
    cash += 100;
    ui.setMoney(cash);
    ui.setPackages(collected, total);
    ui.message(`COLLECTIBLE SECURED +$100 (${collected}/12)`, 2200);
    sound.pickup?.();
  });
  ui.setObjective(jobs.objectiveText(), goal ? distance(subject, goal) : null);
  ui.setSpeed(driving ? Math.abs(ride.speed) * 3.6 : 0, driving);
  ui.setMission(jobs.current(), jobs.phase, jobs.completed);
  const locator = { x: subject.x, z: subject.z, heading: driving ? ride.heading : hero.heading };
  ui.setPoliceResponse(patrol.cars, locator, heat);
  ui.setVehicleInfo(driving, ride?.modelName || '');
  ui.setCrosshair(!driving);
  if (clock - mapAt >= 0.1) {
    mapAt = clock;
    ui.drawMinimap({ player: locator, police: patrol.cars, peds: crowd.peds, traffic: motorists.cars, marker: goal, streets: town.streets, worldSize: 480 });
  }
}
function advanceSimulation(delta) {
  clock += delta;
  town.update(delta);
  if (jobWait >= 0 && mode === 'playing') {
    jobWait -= delta;
    if (jobWait <= 0) { jobWait = -1; jobs.startNext(); maintainPrize(); }
  }
  animateEffects(delta);
  const pressed = controls.takeActions();
  if (pressed & ACTION_MUTE) {
    sound.setMuted(!sound.isMuted());
    ui.message(sound.isMuted() ? 'Sound muted.' : 'Sound on.');
  }
  if (mode === 'paused') {
    if (pressed & ACTION_PAUSE) pauseSwitch();
    return;
  }
  if (mode === 'title') {
    const orbit = clock * 0.05;
    lens.position.set(Math.sin(orbit) * 150, 55, Math.cos(orbit) * 150);
    lens.lookAt(0, 0, 40);
    motorists.update(delta, { x: 0, z: 0 }, null, patrol.cars);
    crowd.update(delta, { x: 0, z: 0 }, null, 0);
    fleetView.sync(motorists.cars, patrol.cars);
    return;
  }
  if (mode !== 'playing') return;
  if (pressed & ACTION_PAUSE) { pauseSwitch(); return; }
  if (pressed & ACTION_RESTART) { jobs.fail('Restarted by the player.'); retryStreet(); }
  maintainPrize();
  gunWait = Math.max(0, gunWait - delta);
  if (pressed & ACTION_INTERACT) interactWithWorld();
  if (pressed & ACTION_PUNCH) throwPunch();
  if ((pressed & ACTION_FIRE) || controls.fireHeld) firePistol();
  const axes = controls.moveAxes();
  if (driving && ride) {
    driveCar(ride, { throttle: Math.max(0, axes.z), brake: Math.max(0, -axes.z), steer: axes.x * -1, handbrake: controls.isDown('Space') }, delta, barriers, () => {
      sound.crash();
      tremor += 0.2;
      scatter(ride, 0xffbf57, 8, 5);
    });
    hero.x = ride.x;
    hero.z = ride.z;
    if (controls.isDown('Space') && Math.abs(ride.speed) > 8) {
      tirePrint(ride);
      if (random.chance(0.2)) scatter(ride, 0xc5c1b6, 3, 2);
    }
    for (const person of crowd.peds) if (!person.down && Math.abs(ride.speed) > 3 && distance(ride, person) < 2.2) {
      crowd.knockDown(person);
      raiseHeat(1, 'You hit a pedestrian.');
      sound.thud();
      scatter(person, 0xb52f2f, 9);
    }
    for (const other of motorists.cars) if (Math.abs(ride.speed) > 8 && distance(ride, other) < 3.4) {
      const dx = ride.x - other.x;
      const dz = ride.z - other.z;
      const gap = Math.hypot(dx, dz);
      const push = (3.4 - gap) * 0.5 / (gap || 1);
      ride.x += gap ? dx * push : 1.7;
      ride.z += dz * push;
      ride.speed *= 0.7;
      sound.crash();
      scatter(ride, 0xffcc65, 8, 5);
    }
    sound.engine(Math.min(1, Math.abs(ride.speed) / 45), axes.z > 0);
    if (ride.health <= 0) wreckRide();
  } else {
    const sine = Math.sin(controls.yaw), cosine = Math.cos(controls.yaw);
    movePlayer(hero, { x: sine * axes.z + cosine * axes.x, z: cosine * axes.z - sine * axes.x, sprint: controls.sprint, jump: controls.jump }, delta, barriers);
    sound.engine(0, false);
  }
  const subject = position();
  motorists.update(delta, subject, driving ? ride : null, patrol.cars);
  threatWait = Math.max(0, threatWait - delta);
  if (threatWait === 0) threat = null;
  crowd.update(delta, subject, threat, threat ? 26 : 0);
  crowd.respawnFar(subject);
  gang.update(delta, hero, barriers, amount => injure(amount));
  patrol.update(delta, heat, hero, driving ? ride : null, barriers, rammed);
  const nearest = patrol.nearestDist(subject);
  if (!driving && heat > 0 && nearest < 4) arrestWait += delta;
  else if (nearest > 6 || driving || heat === 0) arrestWait = 0;
  if (arrestWait > 1.5) arrest();
  if (heat > 0 && clock - crimeAt > 20) {
    cooling += delta;
    if (cooling >= 12) {
      cooling -= 12;
      heat--;
      ui.setStars(heat);
      if (heat === 0) ui.message('You lost them. The heat is off.');
    }
  }
  pinShot();
  fleetView.sync(motorists.cars, patrol.cars);
  updateMedicine(delta);
  sound.siren(delta, nearest);
  aimCamera(delta);
  refreshUi();
}
const rounded = (value, places = 1) => Number(Number(value).toFixed(places));
function snapshotCar(vehicle) {
  if (!vehicle) return null;
  return { x: rounded(vehicle.x), z: rounded(vehicle.z), heading: rounded(vehicle.heading, 3), speed: rounded(vehicle.speed), health: rounded(vehicle.health), touchingWall: Boolean(vehicle.touchingWall) };
}
window.__solmar = {
  get state() {
    const subject = position(), opponent = liveGangster();
    return {
      screen: mode, money: cash, wanted: heat, health: hero.health,
      mission: jobs.current()?.id || 0, phase: jobs.phase, completed: jobs.completed,
      inCar: driving, player: { x: subject.x, z: subject.z }, elapsed: clock,
      traffic: motorists.cars.length, police: patrol.cars.length,
      thugs: gang.aliveCount(), peds: crowd.peds.length,
      targetCar: prizeCar ? { x: prizeCar.x, z: prizeCar.z } : null,
      thug: opponent ? { x: opponent.x, z: opponent.z, health: opponent.health } : null
    };
  },
  teleport: (x, z) => relocate(x, z),
  setYaw: angle => controls.setYaw(angle),
  setHeading: angle => { hero.heading = angle; },
  nearestThug() {
    const opponent = liveGangster();
    return opponent ? { x: opponent.x, z: opponent.z, health: opponent.health } : null;
  },
  findCar() {
    const nearby = motorists.nearestCar(hero.x, hero.z, 500);
    return nearby ? { x: nearby.x, z: nearby.z, heading: nearby.heading } : null;
  },
  teleportNearCar() {
    const nearby = motorists.nearestCar(hero.x, hero.z, 500);
    if (nearby) relocate(nearby.x + 2.5, nearby.z);
    return nearby ? { x: nearby.x, z: nearby.z, heading: nearby.heading } : null;
  },
  setWanted: level => { heat = level; crimeAt = clock; cooling = 0; ui.setStars(level); },
  policeCars: () => patrol.cars.map(unit => ({ x: rounded(unit.x), z: rounded(unit.z), speed: rounded(unit.speed) })),
  carSpeed: () => ride ? rounded(ride.speed) : 0,
  car: () => snapshotCar(ride),
  traffic: () => motorists.cars.map(vehicle => ({ x: rounded(vehicle.x), z: rounded(vehicle.z), speed: rounded(vehicle.speed) })),
  startMission: index => { jobs.startMission(index, jobs.completed); prizeCar = null; maintainPrize(); },
  arrive: () => jobs.arrive(),
  giveCar: paint => grantRide(paint),
  spawnPolice: () => patrol.update(0.1, Math.max(1, heat), hero, driving ? ride : null, barriers, null),
  setMoney: value => { cash = value; ui.setMoney(value); },
  setHealth: value => { hero.health = value; ui.setHealth(value, healthLimit); },
  god: enabled => { invincible = enabled !== false; },
  renderInfo: () => ({ calls: display.info.render.calls, triangles: display.info.render.triangles }),
  version: 'solmar-bay-1'
};
function setupShot(label) {
  beginSession(false);
  readyAt = clock + 3;
  readySent = false;
  window.__shotReady = false;
  if (label === 'start') {
    town.setHeliOrbit(14, -62, 0, 34, 0, 0);
    mode = 'title';
    ui.showTitle(null);
    return;
  }
  if (label === 'city') {
    relocate(4, 95);
    hero.heading = 0;
    controls.setYaw(0);
    controls.setPitch(0.04);
    town.followHeli(hero, () => controls.yaw, { forward: 18, side: -3.5, height: 7.2, yawOffset: 0.5 });
    return;
  }
  if (label === 'mission' || label === 'chase') {
    if (label === 'mission') {
      jobs.startMission(1, 1);
      maintainPrize();
    }
    grantRide(label === 'mission' ? 0xe8c832 : 0xe86a2c);
    relocate(2, 35);
    ride.heading = 0;
    ride.speed = 22;
    controls.setYaw(0);
    hero.heading = 0;
    heat = 3;
    crimeAt = clock;
    ui.setStars(heat);
    patrol.update(0.1, 3, hero, ride, barriers, null);
    for (let attempt = 0; attempt < 12 && patrol.cars.length < 3; attempt++) patrol.update(10, 3, hero, ride, barriers, null);
    // Shot camera: default pitch 0.32 tilts the chase camera down ~29 deg, so the
    // frame's top edge sits below horizontal and a helicopter at forward 17 /
    // height 6.5 projects above the frame (only its light cone shows). Level the
    // camera to pitch 0.05 so the helicopter lands in the upper frame, and shift
    // it to side +5 so it clears the PIER 9 sign in chase (sign spans x -8.5..0.5).
    controls.setPitch(0.05);
    town.followHeli(ride, () => ride.heading, {
      forward: 14, side: -2.6, height: 4.8, yawOffset: 0.45, aimAtTarget: true,
    });
    pinShot();
    fleetView.sync(motorists.cars, patrol.cars);
  }
}
function wireButton(names, operation) {
  for (const name of names) {
    const node = document.getElementById(name) || ui.els?.[name];
    if (!node) continue;
    node.addEventListener('click', () => { sound.click(); operation(); });
    return;
  }
}
wireButton(['btn-start', 'title-start', 'start'], () => beginSession(false));
wireButton(['btn-continue', 'title-continue', 'continue'], () => beginSession(true));
wireButton(['btn-resume', 'pause-resume', 'resume'], pauseSwitch);
wireButton(['btn-restart', 'pause-restart', 'restart'], () => { jobs.fail('Restarted by the player.'); retryStreet(); });
function returnToTitle(saveFirst) {
  if (saveFirst) storeProgress();
  ui.hideScreens();
  mode = 'title';
  ui.showTitle(readProgress());
  sound.engine(0, false);
}
wireButton(['btn-quit', 'pause-quit', 'quit'], () => returnToTitle(true));
wireButton(['btn-retry', 'end-retry', 'retry'], retryStreet);
wireButton(['btn-title', 'end-title', 'title', 'end-title-btn'], () => returnToTitle(false));
addEventListener('pointermove', () => { mouseAt = performance.now(); });
ui.showTitle(shotPage ? null : readProgress());
if (shotPage) setupShot(shotPage);
let previousFrame = performance.now(), remainder = 0;
const quantum = 1 / 60;
function animatePage(now) {
  requestAnimationFrame(animatePage);
  remainder += Math.min(0.25, Math.max(0, (now - previousFrame) / 1000));
  previousFrame = now;
  while (remainder >= quantum) {
    advanceSimulation(quantum);
    remainder -= quantum;
  }
  if (!readySent && clock > readyAt) {
    readySent = true;
    window.__shotReady = true;
  }
  town.updateHeliFollow();
  display.render(stage, lens);
}
requestAnimationFrame(animatePage);
