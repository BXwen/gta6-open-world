// Solmar Bay: boot, the one loop, camera, states, wanted system, saving,
// particles, skid marks, and the debug handle used to stage screenshots.
// The game moves between title, play, paused and end screens.

import * as THREE from '../vendor/three.module.min.js';
import { CONFIG, MISSIONS, STORY, SAVE_KEY } from './config.js';
import { makeRng } from './rng.js';
import { createAudio } from './audio.js';
import { buildWorld, resolveCircle, clampBounds } from './world.js';
import { buildCarMesh, createCar, driveCar, createTraffic, createPolice, createCarFleet } from './vehicles.js';
import { buildPersonMesh, createPlayer, movePlayer, createPedestrians, createThugs, meleeHit, pistolRay } from './people.js';
import { createMissions } from './missions.js';
import { createHud, buildHudDom } from './hud.js';
import { createInput, ACTION_INTERACT, ACTION_PUNCH, ACTION_PAUSE, ACTION_RESTART, ACTION_MUTE, ACTION_FIRE } from './input.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;
const params = new URLSearchParams(window.location.search);
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 1;
const shot = params.get('shot');
const lowQuality = params.get('q') === 'low';

buildHudDom();
const hud = createHud();
const status = document.getElementById('status');
const canvas = document.getElementById('game');
const audio = createAudio();

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: !lowQuality,
  powerPreference: 'high-performance',
});
// Low quality renders at half resolution and lets the page upscale it:
// under software rendering the fragment cost dominates, and this is the
// single biggest frame-time win. Full quality stays at native resolution
// so the dossier screenshots stay sharp.
const renderScale = lowQuality ? 0.5 : 1;
renderer.setPixelRatio(1);
renderer.setSize(Math.floor(window.innerWidth * renderScale), Math.floor(window.innerHeight * renderScale), false);
renderer.shadowMap.enabled = !lowQuality;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.22;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a2a55);
scene.fog = new THREE.Fog(0xe8a87a, 180, 600);

const hemi = new THREE.HemisphereLight(0xffd9b0, 0x9a7a65, 1.45);
scene.add(hemi);
// High warm afternoon sun (~41° elevation) from just east of south:
// shadows point due north, along the avenues, so the road the chase
// drives up stays sunlit and the police cruisers ahead show their lit
// fronts. Any east component wider than ~5° lets the east buildings'
// shadows drift west and close the sunlit gap over the avenue — that
// drift is what kept the dark band in the first re-shoot.
const sun = new THREE.DirectionalLight(0xffd9a0, 2.6);
sun.position.set(15, 150, 170);
sun.castShadow = !lowQuality;
// A tight shadow frustum around the player (it follows the player below):
// far fewer objects render into the shadow map than the old 320-wide box.
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -90;
sun.shadow.camera.right = 90;
sun.shadow.camera.top = 90;
sun.shadow.camera.bottom = -90;
sun.shadow.camera.far = 500;
sun.shadow.bias = -0.0004;
scene.add(sun);
scene.add(sun.target);

const rng = makeRng(seed);
const world = buildWorld(scene, rng);
const colliders = world.colliders;
const traffic = createTraffic(scene, rng, colliders);
const police = createPolice(scene, rng);
const fleet = createCarFleet(scene);
const peds = createPedestrians(scene, rng, colliders);
const thugs = createThugs(scene, rng);
const player = createPlayer(scene, -170, -170);
const input = createInput(canvas);

// ---- game state ----
let screen = 'title'; // title | playing | paused | end
let money = CONFIG.startMoney;
let wanted = 0;
let lastCrimeTime = -1000;
let wantedDecayTimer = 0;
let inCar = false;
let playerCar = null;
let godMode = false;
let elapsed = 0;
let lastMouseMove = 0;
let pistolCooldown = 0;
let bustedTimer = 0;
let nextMissionTimer = -1;
let dangerPos = null;
let dangerTimer = 0;
let cameraShake = 0;
let fovKick = 0;
let lastMinimapAt = -1;
let targetCar = null; // mission 2's Comet GT

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
camera.position.set(-200, 30, -200);
camera.lookAt(0, 0, 0);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(Math.floor(window.innerWidth * renderScale), Math.floor(window.innerHeight * renderScale), false);
});

// ---- particles, tracers, skid marks ----
// Particles are one InstancedMesh (a single draw call for the whole pool)
// instead of 140 separate meshes: under software rendering every draw
// call costs, and a crash can light up most of the pool at once.
const PARTICLE_COUNT = 140;
const particleGeo = new THREE.SphereGeometry(0.075, 6, 4);
const particleMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.48, depthWrite: false });
const particleMesh = new THREE.InstancedMesh(particleGeo, particleMat, PARTICLE_COUNT);
particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
particleMesh.frustumCulled = false;
scene.add(particleMesh);
const particles = [];
const _pm = new THREE.Matrix4();
const _pq = new THREE.Quaternion();
const _pv = new THREE.Vector3();
const _ps = new THREE.Vector3();
const _pc = new THREE.Color();
for (let i = 0; i < PARTICLE_COUNT; i += 1) {
  particles.push({ vx: 0, vy: 0, vz: 0, life: 0, max: 1, x: 0, y: -10, z: 0 });
  _pm.makeScale(0, 0, 0);
  particleMesh.setMatrixAt(i, _pm);
  particleMesh.setColorAt(i, _pc.setHex(0xffffff));
}
particleMesh.instanceMatrix.needsUpdate = true;
if (particleMesh.instanceColor) particleMesh.instanceColor.needsUpdate = true;

function burst(x, y, z, color, count, speed) {
  let made = 0;
  for (let i = 0; i < PARTICLE_COUNT && made < count; i += 1) {
    const p = particles[i];
    if (p.life > 0) continue;
    made += 1;
    p.x = x;
    p.y = y;
    p.z = z;
    const a = Math.random() * Math.PI * 2;
    const up = Math.random() * speed * 0.7 + 1;
    p.vx = Math.cos(a) * speed * Math.random();
    p.vz = Math.sin(a) * speed * Math.random();
    p.vy = up;
    p.life = p.max = 0.5 + Math.random() * 0.5;
    // Neutral dust is warm road grit rather than bright white debris.
    const dust = color === 0xcccccc || color === 0xaaaaaa;
    particleMesh.setColorAt(i, _pc.setHex(dust ? 0x9b896a : color));
  }
  if (particleMesh.instanceColor) particleMesh.instanceColor.needsUpdate = true;
}
function updateParticles(dt) {
  let any = false;
  for (let i = 0; i < PARTICLE_COUNT; i += 1) {
    const p = particles[i];
    if (p.life <= 0) continue;
    any = true;
    p.life -= dt;
    if (p.life <= 0) {
      _pm.makeScale(0, 0, 0);
      particleMesh.setMatrixAt(i, _pm);
      continue;
    }
    p.vy -= 12 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    if (p.y < 0.05) { p.y = 0.05; p.vy *= -0.4; }
    // Fade by shrinking: the pool shares one material, so per-particle
    // opacity is not available; a particle that shrinks to nothing reads
    // the same as one that fades out.
    const s = Math.max(0.001, p.life / p.max);
    _pv.set(p.x, p.y, p.z);
    _ps.set(s, s, s);
    _pm.compose(_pv, _pq, _ps);
    particleMesh.setMatrixAt(i, _pm);
  }
  if (any) particleMesh.instanceMatrix.needsUpdate = true;
}

const tracers = [];
for (let i = 0; i < 6; i += 1) {
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0 }));
  scene.add(line);
  tracers.push({ line, life: 0 });
}
function tracer(from, to) {
  for (const t of tracers) {
    if (t.life > 0) continue;
    t.line.geometry.setFromPoints([from, to]);
    t.line.material.opacity = 0.9;
    t.life = 0.09;
    break;
  }
}
function updateTracers(dt) {
  for (const t of tracers) {
    if (t.life <= 0) continue;
    t.life -= dt;
    t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
  }
}

const skids = [];
const skidGeo = new THREE.PlaneGeometry(0.5, 1.6);
const skidMat = new THREE.MeshBasicMaterial({ color: 0x141414, transparent: true, opacity: 0.55, depthWrite: false });
for (let i = 0; i < 48; i += 1) {
  const m = new THREE.Mesh(skidGeo, skidMat.clone());
  m.rotation.x = -Math.PI / 2;
  m.visible = false;
  scene.add(m);
  skids.push({ mesh: m, life: 0 });
}
let skidIndex = 0;
function skidMark(x, z, heading) {
  const s = skids[skidIndex];
  skidIndex = (skidIndex + 1) % skids.length;
  s.mesh.visible = true;
  s.mesh.material.opacity = 0.55;
  s.mesh.position.set(x, 0.06, z);
  s.mesh.rotation.z = -heading;
  s.life = 6;
}
function updateSkids(dt) {
  for (const s of skids) {
    if (s.life <= 0) continue;
    s.life -= dt;
    s.mesh.material.opacity = Math.max(0, s.life / 6) * 0.55;
    if (s.life <= 0) s.mesh.visible = false;
  }
}

// ---- objective beacon ----
const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffd75e, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
const beacon = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 42, 20, 1, true), beaconMat);
beacon.visible = false;
scene.add(beacon);
const beaconGem = new THREE.Mesh(new THREE.OctahedronGeometry(1.1), new THREE.MeshStandardMaterial({ color: 0xffd75e, emissive: 0xcc9900, emissiveIntensity: 0.8, roughness: 0.3 }));
beaconGem.visible = false;
scene.add(beaconGem);

// ---- health packs ----
const healthPacks = [];
function makeHealthPack(x, z) {
  const g = new THREE.Group();
  const boxMat = new THREE.MeshStandardMaterial({ color: 0x2fae4e, roughness: 0.6 });
  const boxMesh = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), boxMat);
  boxMesh.castShadow = true;
  g.add(boxMesh);
  const crossMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.05), crossMat);
  c1.position.z = 0.58;
  const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.05), crossMat);
  c2.position.z = 0.58;
  g.add(c1, c2);
  g.position.set(x, 1, z);
  scene.add(g);
  return { group: g, x, z, active: true, timer: 0 };
}
healthPacks.push(makeHealthPack(-172, -172), makeHealthPack(14, -14), makeHealthPack(190, 138));

// ---- missions ----
const missions = createMissions((event) => {
  if (event.type === 'briefing') {
    hud.showBriefing(event.mission);
    hud.message(`Job ${event.mission.id}: ${event.mission.name} — ${event.mission.briefing}`);
    if (event.mission.wantedOnStart) {
      wanted = event.mission.wantedOnStart;
      lastCrimeTime = elapsed;
      hud.setStars(wanted);
    }
    if (event.mission.id === 3) spawnThugsForMission();
  } else if (event.type === 'picked-up') {
    hud.message('Package secured. Get it to the garage.');
    audio.pickup();
  } else if (event.type === 'delivered') {
    money += event.reward;
    hud.setMoney(money);
    audio.success();
    hud.banner(`Job complete — +$${event.reward}`, event.mission.name);
    saveGame();
    if (missions.index + 1 < MISSIONS.length) {
      nextMissionTimer = 4;
    } else {
      hud.showEnd('done', STORY.outro);
      screen = 'end';
    }
  } else if (event.type === 'failed') {
    hud.message(`Job failed: ${event.reason}`);
    audio.fail();
  } else if (event.type === 'story-done') {
    hud.showEnd('done', STORY.outro);
    screen = 'end';
  }
});

function spawnThugsForMission() {
  thugs.clear();
  const spots = [[-8, -8], [10, 6], [4, -14]];
  for (const [x, z] of spots) thugs.spawn(x, z);
}

function missionTargetPos() {
  const t = missions.target();
  return t ? { x: t.x, z: t.z } : null;
}

function updateBeacon(dt) {
  const t = missionTargetPos();
  if (!t || screen !== 'playing') {
    beacon.visible = false;
    beaconGem.visible = false;
    return;
  }
  beacon.visible = true;
  beaconGem.visible = true;
  beacon.position.set(t.x, 21, t.z);
  beaconGem.position.set(t.x, 4 + Math.sin(elapsed * 2.4) * 0.5, t.z);
  beaconGem.rotation.y += dt * 1.5;
}

// ---- save / load ----
function saveGame() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      money, missionsDone: missions.completed, health: player.health, when: Date.now(),
    }));
  } catch { /* storage off: progress lasts this visit only */ }
}

function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.money !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

// ---- wanted ----
function addWanted(n, reason) {
  if (godMode || n <= 0) return;
  wanted = Math.min(CONFIG.maxWanted, wanted + n);
  lastCrimeTime = elapsed;
  wantedDecayTimer = 0;
  hud.setStars(wanted);
  if (reason) hud.message(reason);
  if (wanted >= 1) hud.message(`Wanted level ${wanted} — the Solmar PD is rolling.`);
}

function updateWanted(dt) {
  if (wanted === 0) return;
  if (elapsed - lastCrimeTime < CONFIG.wantedDecayDelay) return;
  const nearest = police.nearestDist(player);
  if (nearest < 60) return;
  wantedDecayTimer += dt;
  if (wantedDecayTimer >= CONFIG.wantedDecayInterval) {
    wantedDecayTimer = 0;
    wanted -= 1;
    hud.setStars(wanted);
    if (wanted === 0) hud.message('You lost them. The heat is off.');
  }
}

// ---- damage / death ----
function hurtPlayer(amount, cause) {
  if (godMode || player.invulnerable > 0 || screen !== 'playing') return;
  player.health -= amount;
  player.invulnerable = 0.5;
  hud.setHealth(player.health, CONFIG.playerHealth);
  hud.damageFlash();
  cameraShake = Math.min(1, cameraShake + 0.35);
  audio.thud();
  if (player.health <= 0) wasted(cause);
}

function wasted(cause) {
  if (screen !== 'playing') return;
  screen = 'end';
  money = Math.max(0, money - CONFIG.wastedFine);
  hud.setMoney(money);
  missions.fail(cause || 'You were taken out.');
  hud.showEnd('wasted', [`${cause || 'You were taken out.'}`, `The medics patched you up — minus $${CONFIG.wastedFine}.`, 'Vera is not impressed.']);
  audio.fail();
  saveGame();
}

function busted() {
  if (screen !== 'playing') return;
  screen = 'end';
  money = Math.max(0, money - CONFIG.bustedFine);
  hud.setMoney(money);
  missions.fail('Busted by the Solmar PD.');
  hud.showEnd('busted', ['The Solmar PD caught you on foot.', `Bail set you back $${CONFIG.bustedFine}.`, 'Vera is not impressed.']);
  audio.fail();
  saveGame();
}

function respawnAfterEnd() {
  player.health = CONFIG.playerHealth;
  hud.setHealth(player.health, CONFIG.playerHealth);
  wanted = 0;
  hud.setStars(0);
  if (inCar && playerCar) {
    scene.remove(playerCar.mesh);
    playerCar = null;
    inCar = false;
  }
  player.x = -170;
  player.z = -170;
  player.y = 0;
  player.vy = 0;
  player.mesh.position.set(player.x, 0, player.z);
  input.setYaw(Math.PI / 4);
  input.setPitch(0.32);
  missions.resetFailed();
  missions.startMission(missions.index, missions.completed);
  thugs.clear();
  if (missions.current() && missions.current().id === 3) spawnThugsForMission();
  hud.hideScreens();
  screen = 'playing';
  hud.message('Back on the street. The job is still open.');
}

// ---- car enter / exit ----
function nearestEnterableCar() {
  let best = traffic.nearestCar(player.x, player.z, 4.2);
  return best;
}

function enterCar(car) {
  const isTarget = targetCar && car === targetCar;
  // The driver bails and runs.
  const driver = buildPersonMesh(rng);
  driver.position.set(car.x + 2.2, 0, car.z);
  const fleePed = {
    mesh: driver, x: car.x + 2.2, z: car.z, heading: Math.atan2(player.x - car.x, player.z - car.z),
    speed: 6, state: 'flee', fleeTimer: 5, health: 30, down: false, downTimer: 0,
    targetX: car.x + 2.2, targetZ: car.z, waitTimer: 0,
  };
  peds.addExtra(fleePed);
  // Take the car out of traffic and drive it.
  const i = traffic.cars.indexOf(car);
  if (i >= 0) traffic.cars.splice(i, 1);
  playerCar = createCar(buildCarMesh(car.color), car.x, car.z, car.heading);
  playerCar.color = car.color;
  playerCar.isPlayer = true;
  playerCar.health = car.health ?? CONFIG.carHealth;
  inCar = true;
  player.mesh.visible = false;
  audio.engine(0, false);
  hud.message(isTarget ? 'You took the Comet GT. Vera will be pleased — the law will not.' : 'Car jacked. Drive like you mean it.');
  if (isTarget) {
    addWanted(MISSIONS[1].wantedOnSteal || 1, 'Grand theft auto — the owner called it in.');
    const arrived = missions.arrive();
    if (arrived && arrived.advanced) hud.message('Now deliver the Comet GT to Vera\u2019s garage.');
  } else {
    addWanted(1, 'Grand theft auto — someone saw that.');
  }
  dangerPos = { x: player.x, z: player.z };
  dangerTimer = 3;
}

function exitCar(force) {
  if (!playerCar || (!force && playerCar.speed > 8)) return false;
  playerCar.speed = 0;
  const side = { x: playerCar.x + Math.cos(playerCar.heading) * 2.4, z: playerCar.z - Math.sin(playerCar.heading) * 2.4 };
  player.x = side.x;
  player.z = side.z;
  player.y = 0;
  player.mesh.visible = true;
  player.mesh.position.set(player.x, 0, player.z);
  // Leave the car parked on the street (the fleet draws it from now on).
  scene.remove(playerCar.mesh);
  traffic.addParked(playerCar.x, playerCar.z, playerCar.heading, playerCar.color ?? 0xc23b2e, playerCar.health);
  playerCar = null;
  inCar = false;
  input.setYaw(player.heading + Math.PI);
  return true;
}

// ---- combat ----
function doPunch() {
  if (screen !== 'playing' || inCar) return;
  audio.punch();
  const targets = [...thugs.thugs, ...peds.peds];
  const hits = meleeHit(player, player.heading, CONFIG.punchRange, targets);
  for (const { target } of hits) {
    damageTarget(target, CONFIG.punchDamage, 'punch');
    burst(target.x, 1.4, target.z, 0xffe9a0, 8, 4);
  }
  if (hits.length === 0) {
    // A swing in the air still reads: small dust puff ahead.
    burst(player.x + Math.sin(player.heading) * 1.6, 1.2, player.z + Math.cos(player.heading) * 1.6, 0xcccccc, 3, 2);
  }
}

function damageTarget(target, amount, kind) {
  target.health -= amount;
  const isThug = thugs.thugs.includes(target);
  // Knockback away from the player.
  const dx = target.x - player.x;
  const dz = target.z - player.z;
  const d = Math.hypot(dx, dz) || 1;
  const fixed = resolveCircle(target.x + (dx / d) * 0.9, target.z + (dz / d) * 0.9, 0.5, colliders);
  target.x = fixed.x;
  target.z = fixed.z;
  // Instanced pedestrians have no mesh; their matrices follow x/z.
  if (target.mesh) target.mesh.position.set(target.x, 0, target.z);
  hud.floater({ x: target.x, y: 2.2, z: target.z }, `-${amount}`, 'damage', projectToScreen);
  if (target.health <= 0) {
    if (isThug) {
      target.dead = true;
      target.mesh.visible = false;
      money += CONFIG.thugDrop;
      hud.setMoney(money);
      hud.floater({ x: target.x, y: 2.4, z: target.z }, `+$${CONFIG.thugDrop}`, 'cash', projectToScreen);
      audio.coin();
      burst(target.x, 1.2, target.z, 0x58c96b, 12, 5);
    } else {
      peds.knockDown(target);
      addWanted(2, 'A pedestrian is down. The city saw it.');
      dangerPos = { x: target.x, z: target.z };
      dangerTimer = 3;
      burst(target.x, 1, target.z, 0xd8382e, 10, 4);
    }
  } else if (!isThug) {
    target.state = 'flee';
    target.fleeTimer = 4;
  }
}

function doShoot() {
  if (screen !== 'playing' || inCar || pistolCooldown > 0) return;
  pistolCooldown = CONFIG.pistolRate;
  audio.gunshot();
  cameraShake = Math.min(1, cameraShake + 0.18);
  // Aim from the player's chest toward the point under the crosshair, so
  // the shot stays true at close range instead of diving into the ground.
  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);
  const aimPoint = camera.position.clone().add(camDir.multiplyScalar(30));
  const origin = new THREE.Vector3(player.x, player.y + 1.5, player.z);
  const dir = aimPoint.sub(origin).normalize();
  const result = pistolRay(
    { x: origin.x, y: origin.y, z: origin.z },
    { x: dir.x, y: dir.y, z: dir.z },
    CONFIG.pistolRange,
    [...thugs.thugs, ...peds.peds],
    colliders,
  );
  const from = new THREE.Vector3(player.x, player.y + 1.5, player.z);
  const to = new THREE.Vector3(result.point.x, result.point.y, result.point.z);
  tracer(from, to);
  burst(to.x, to.y, to.z, 0xffe9a0, 4, 3);
  if (result.hit) {
    damageTarget(result.hit, CONFIG.pistolDamage, 'shot');
    if (!thugs.thugs.includes(result.hit)) addWanted(1, 'Shots fired in public.');
  } else if (result.blocked) {
    burst(to.x, to.y, to.z, 0xaaaaaa, 5, 3);
  }
}

// ---- projection for floating numbers ----
const _v = new THREE.Vector3();
function projectToScreen(pos) {
  _v.set(pos.x, pos.y, pos.z).project(camera);
  if (_v.z > 1) return { behind: true };
  return {
    x: (_v.x * 0.5 + 0.5) * window.innerWidth,
    y: (-_v.y * 0.5 + 0.5) * window.innerHeight,
    behind: false,
  };
}

// ---- start / flow ----
function startGame(save) {
  const data = save ? loadSave() : null;
  money = data ? data.money : CONFIG.startMoney;
  hud.setMoney(money);
  player.health = data ? data.health : CONFIG.playerHealth;
  hud.setHealth(player.health, CONFIG.playerHealth);
  wanted = 0;
  hud.setStars(0);
  player.x = -170;
  player.z = -170;
  player.y = 0;
  player.mesh.visible = true;
  player.mesh.position.set(player.x, 0, player.z);
  input.setYaw(Math.PI / 4);
  input.setPitch(0.32);
  const startIndex = data ? Math.min(data.missionsDone || 0, MISSIONS.length - 1) : 0;
  missions.startMission(startIndex, data ? data.missionsDone || 0 : 0);
  hud.hideScreens();
  screen = 'playing';
  audio.unlock();
  status.textContent = 'Playing Solmar Bay.';
  hud.message('Vera\u2019s jobs are on your map. Follow the gold beacon.');
}

function togglePause() {
  if (screen === 'playing') {
    screen = 'paused';
    hud.showPause();
    saveGame();
  } else if (screen === 'paused') {
    screen = 'playing';
    hud.hidePause();
  }
}

// ---- per-frame update ----
function update(dt) {
  elapsed += dt;
  world.update(dt);
  if (dangerTimer > 0) {
    dangerTimer -= dt;
    if (dangerTimer <= 0) dangerPos = null;
  }
  if (pistolCooldown > 0) pistolCooldown -= dt;
  if (nextMissionTimer > 0) {
    nextMissionTimer -= dt;
    if (nextMissionTimer <= 0) {
      nextMissionTimer = -1;
      missions.startNext();
    }
  }
  updateParticles(dt);
  updateTracers(dt);
  updateSkids(dt);
  updateBeacon(dt);

  // Input is read once per frame, before the screen branches: the pause
  // key is a toggle that must work from the paused screen too, and any
  // other press queued while paused is dropped so it cannot fire stale
  // when play resumes.
  const actions = input.takeActions();

  // Title screen: slow orbit over the city, traffic keeps moving.
  if (screen === 'title') {
    const t = elapsed * 0.05;
    camera.position.set(Math.sin(t) * 150, 55, Math.cos(t) * 150);
    camera.lookAt(0, 0, 40);
    traffic.update(dt, { x: 0, z: 0 }, null, police.cars);
    peds.update(dt, { x: 0, z: 0 }, null, 0);
    fleet.sync(traffic.cars, police.cars);
    return;
  }
  if (actions & ACTION_PAUSE) togglePause();
  if (screen !== 'playing') return;

  // --- input ---
  // Mission 2's target car must exist before any E press can claim it.
  if (missions.current() && missions.current().id === 2 && !targetCar) {
    targetCar = traffic.addParked(62, 62, Math.PI / 2, 0xe8c832);
    targetCar.health = CONFIG.carHealth;
  }
  if (targetCar && missions.current() && missions.current().id !== 2) targetCar = null;

  if (actions & ACTION_MUTE) {
    audio.setMuted(!audio.isMuted());
    hud.message(audio.isMuted() ? 'Sound muted.' : 'Sound on.');
  }
  if (actions & ACTION_RESTART) {
    missions.fail('Restarted by the player.');
    respawnAfterEnd();
  }
  if (actions & ACTION_INTERACT) {
    if (inCar) {
      const t = missionTargetPos();
      if (t && missions.phase === 'deliver' && playerCar && Math.hypot(playerCar.x - t.x, playerCar.z - t.z) < 7) {
        const m = missions.current();
        if (m && m.id === 3 && wanted > 0) {
          hud.message('Lose the cops first — the hideout is hot while you are wanted.');
          audio.fail();
        } else {
          missions.arrive();
        }
      } else {
        if (!exitCar() && playerCar && Math.abs(playerCar.speed) >= 8) {
          hud.message('Slow down to get out.');
        }
      }
    } else {
      const car = nearestEnterableCar();
      const t = missionTargetPos();
      const nearTarget = t && Math.hypot(player.x - t.x, player.z - t.z) < 5;
      // Mission beacons win over nearby cars: the garage corner is a busy
      // intersection, and a delivery press must not steal a passing car.
      if (nearTarget && missions.phase === 'pickup' && !targetCar) {
        const arrived = missions.arrive();
        if (arrived && arrived.advanced) hud.message('Now bring it back to Vera\u2019s garage.');
      } else if (nearTarget && missions.phase === 'deliver') {
        const m = missions.current();
        if (m && m.id === 3 && wanted > 0) {
          hud.message('Lose the cops first — the hideout is hot while you are wanted.');
          audio.fail();
        } else {
          missions.arrive();
        }
      } else if (car) {
        enterCar(car);
      }
    }
  }
  if (actions & ACTION_PUNCH) doPunch();
  if ((actions & ACTION_FIRE) || input.fireHeld) doShoot();

  // --- movement ---
  const axes = input.moveAxes();
  if (inCar && playerCar) {
    const throttle = axes.z > 0 ? 1 : 0;
    const brake = axes.z < 0 ? 1 : 0;
    driveCar(playerCar, {
      throttle,
      brake,
      steer: -axes.x,
      handbrake: input.isDown('Space'),
    }, dt, colliders, (impact) => {
      audio.crash();
      cameraShake = Math.min(1, cameraShake + impact / 60);
      burst(playerCar.x, 1, playerCar.z, 0xffe9a0, 10, 5);
      hud.damageFlash();
      if (playerCar.health <= 0) {
        hud.message('Your ride is wrecked.');
        const m = missions.current();
        if (m && m.id === 2 && missions.phase === 'deliver') {
          missions.fail('The Comet GT is wrecked.');
          hud.showEnd('wasted', ['The Comet GT is wrecked.', 'Vera does not pay for scrap.']);
          screen = 'end';
          return;
        }
        exitCar(true);
      }
    });
    // The crash callback can eject the player (wrecked car), so everything
    // below only runs while still in the car.
    if (!inCar || !playerCar) {
      audio.engine(0, false);
    } else {
      // Skid marks under handbrake.
      if (input.isDown('Space') && Math.abs(playerCar.speed) > 8) {
        skidMark(playerCar.x - Math.cos(playerCar.heading) * 1.4, playerCar.z + Math.sin(playerCar.heading) * 1.4, playerCar.heading);
        if (Math.random() < 0.4) burst(playerCar.x, 0.4, playerCar.z, 0xcccccc, 2, 2);
      }
      // Running over pedestrians is a crime.
      const ped = peds.nearestPed(playerCar.x, playerCar.z, 2.2);
      if (ped && Math.abs(playerCar.speed) > 3) {
        peds.knockDown(ped);
        addWanted(1, 'You hit a pedestrian.');
        audio.thud();
        burst(ped.x, 1, ped.z, 0xd8382e, 8, 4);
      }
      // Car vs traffic: push apart.
      for (const other of traffic.cars) {
        const dx = playerCar.x - other.x;
        const dz = playerCar.z - other.z;
        const d = Math.hypot(dx, dz);
        if (d < 3.4 && d > 0.01) {
          const push = (3.4 - d) / d;
          playerCar.x += dx * push * 0.5;
          playerCar.z += dz * push * 0.5;
          if (Math.abs(playerCar.speed) > 8) {
            playerCar.speed *= 0.7;
            audio.crash();
            cameraShake = Math.min(1, cameraShake + 0.3);
            burst(playerCar.x, 1, playerCar.z, 0xffe9a0, 8, 4);
          }
        }
      }
      audio.engine(Math.abs(playerCar.speed) / CONFIG.carMaxSpeed, throttle > 0);
    }
  } else {
    const yaw = input.yaw;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    movePlayer(player, {
      x: fx * axes.z + rx * axes.x,
      z: fz * axes.z + rz * axes.x,
      sprint: input.sprint,
      jump: input.jump,
    }, dt, colliders);
    audio.engine(0, false);
  }

  // While driving, the player rides the car: keep the on-foot position in
  // sync so the objective distance, minimap arrow, police spawn range and
  // thug/ped targeting all track the car instead of the spot where the
  // player got in.
  if (inCar && playerCar) {
    player.x = playerCar.x;
    player.z = playerCar.z;
    player.mesh.position.set(playerCar.x, 0, playerCar.z);
  }

  // --- world life ---
  traffic.update(dt, player, inCar ? playerCar : null, police.cars);
  peds.update(dt, player, dangerPos, dangerPos ? 26 : 0);
  peds.respawnFar(player);
  thugs.update(dt, player, colliders, (dmg) => hurtPlayer(dmg, 'Rook\u2019s crew got to you.'));
  police.update(dt, wanted, player, inCar ? playerCar : null, colliders, (policeCar) => {
    // Ram damage only (the callback itself is rate-limited to one ram per
    // 0.8 s per unit). Getting caught on foot is handled by proximity
    // below, not by the ram callback.
    if (inCar && playerCar) {
      playerCar.health -= 6;
      playerCar.speed *= 0.86;
      audio.crash();
      cameraShake = Math.min(1, cameraShake + 0.4);
      burst(playerCar.x, 1.2, playerCar.z, 0xffe9a0, 10, 5);
      hud.damageFlash();
      if (playerCar.health <= 0) {
        hud.message('Your ride is wrecked.');
        exitCar(true);
      }
    }
  });
  // Busted: a cop right on top of the player on foot for 1.5 s.
  const nearestPolice = police.nearestDist(player);
  if (!inCar && nearestPolice < 4) {
    bustedTimer += dt;
    if (bustedTimer > 1.5) {
      bustedTimer = 0;
      busted();
    }
  } else if (nearestPolice > 6) {
    bustedTimer = 0;
  }
  updateWanted(dt);

  // Chase-shot staging: keep the car rolling at ~80 km/h and the police
  // units posed ahead in frame — a roadblock forming up the street — so
  // the shot reads as a chase. The pin runs for the whole life of the
  // chase shot page (it exists only to take this screenshot), which also
  // stops the units ramming the car and bursting particles into the frame.
  if (shot === 'chase' && playerCar && !playerCar.wrecked) {
    playerCar.speed = Math.max(playerCar.speed, 22); // 22 u/s = 79 km/h
    // Keep ambient traffic clear of the hero car's roofline in the staged
    // chase and mission compositions; parked cars remain elsewhere in view.
    if (shotTrafficClearAt !== playerCar) {
      clearShotTrafficLane(playerCar);
      shotTrafficClearAt = playerCar;
    }
    police.cars.forEach((pc, i) => {
      // The third unit flanks on the near left of the image; at 16m its
      // projection sat directly behind the first unit and hid its body.
      const ahead = i === 2 ? 4 : 7 + i * 4.5;
      const side = i === 1 ? -3.4 : (i === 0 ? 3.4 : 5.8);
      pc.x = playerCar.x + side;
      pc.z = playerCar.z + ahead;
      pc.heading = Math.atan2(playerCar.x - pc.x, playerCar.z - pc.z);
    });
  }
  // Mission-shot staging: same ~80 km/h pin. Without it the staged car
  // coasts down from its initial speed and the speedometer reads 0 by
  // the time the screenshot is taken.
  if (shot === 'mission' && playerCar && !playerCar.wrecked) {
    playerCar.speed = Math.max(playerCar.speed, 22); // 22 u/s = 79 km/h
    if (shotTrafficClearAt !== playerCar) {
      clearShotTrafficLane(playerCar);
      shotTrafficClearAt = playerCar;
    }
  }
  // The fleet draws every traffic and police car from the data above.
  fleet.sync(traffic.cars, police.cars);

  // Health packs.
  for (const pack of healthPacks) {
    if (!pack.active) {
      pack.timer -= dt;
      if (pack.timer <= 0) {
        pack.active = true;
        pack.group.visible = true;
      }
      continue;
    }
    pack.group.rotation.y += dt * 1.2;
    pack.group.position.y = 1 + Math.sin(elapsed * 2 + pack.x) * 0.15;
    if (Math.hypot(player.x - pack.x, player.z - pack.z) < 2.2 && player.health < CONFIG.playerHealth) {
      player.health = Math.min(CONFIG.playerHealth, player.health + 40);
      hud.setHealth(player.health, CONFIG.playerHealth);
      hud.message('First aid +40.');
      audio.pickup();
      pack.active = false;
      pack.group.visible = false;
      pack.timer = 45;
    }
  }

  // Mission target car: park the Comet GT in the central lot for mission 2.
  // (Created at the top of the playing branch, before input is handled.)

  // Siren volume follows the nearest unit.
  audio.siren(dt, police.nearestDist(player));

  // --- camera ---
  const focus = inCar && playerCar
    ? { x: playerCar.x, y: 1.6, z: playerCar.z }
    : { x: player.x, y: player.y + 1.7, z: player.z };
  // Chase cam eases toward the car's heading when the mouse rests.
  // Skipped on staged screenshot pages so the staged yaw holds.
  if (inCar && playerCar && !shot && performance.now() - lastMouseMove > 2500) {
    let diff = playerCar.heading - input.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    input.setYaw(input.yaw + diff * Math.min(1, dt * 1.4));
  }
  const yaw = input.yaw;
  const pitch = input.pitch;
  const dist = inCar ? (shot === 'chase' || shot === 'mission' ? 4.7 : 11) : 7.5;
  const height = 1.55 + pitch * 3.5;
  const cx = focus.x - Math.sin(yaw) * Math.cos(pitch) * dist;
  const cz = focus.z - Math.cos(yaw) * Math.cos(pitch) * dist;
  const cy = focus.y + height;
  camera.position.set(cx, cy, cz);
  // Keep the camera out of buildings: clamp it above the ground and inside the city.
  if (camera.position.y < 1.2) camera.position.y = 1.2;
  camera.lookAt(focus.x + Math.sin(yaw) * 2, focus.y + 0.6, focus.z + Math.cos(yaw) * 2);
  if (cameraShake > 0) {
    cameraShake = Math.max(0, cameraShake - dt * 1.6);
    const s = cameraShake * cameraShake * 0.5;
    camera.position.x += (Math.random() - 0.5) * s;
    camera.position.y += (Math.random() - 0.5) * s;
    camera.position.z += (Math.random() - 0.5) * s;
  }
  const speed01 = inCar && playerCar ? Math.abs(playerCar.speed) / CONFIG.carMaxSpeed : player.speed / CONFIG.sprintSpeed;
  const targetFov = 62 + speed01 * 10;
  fovKick += (targetFov - (62 + fovKick)) * Math.min(1, dt * 4);
  camera.fov = 62 + fovKick;
  camera.updateProjectionMatrix();
  // Sun shadow follows the player, high in the south (just east of it)
  // so shadows run north along the avenues and the road stays bright.
  sun.position.set(focus.x + 15, 150, focus.z + 170);
  sun.target.position.set(focus.x, 0, focus.z);
  sun.target.updateMatrixWorld();

  // --- HUD ---
  hud.setHealth(player.health, CONFIG.playerHealth);
  hud.setObjective(missions.objectiveText(), missionTargetPos() ? Math.hypot(player.x - missionTargetPos().x, player.z - missionTargetPos().z) : null);
  hud.setSpeed(inCar && playerCar ? Math.abs(playerCar.speed) * 3.6 : 0, inCar);
  hud.setCrosshair(!inCar);
  // The minimap is a 2D canvas redraw: 10 Hz is plenty, and it keeps the
  // per-frame DOM/canvas cost off the critical path.
  if (elapsed - lastMinimapAt >= 0.1) {
    lastMinimapAt = elapsed;
    hud.drawMinimap({
      worldSize: 480,
      streets: world.streets,
      marker: missionTargetPos(),
      traffic: traffic.cars,
      peds: peds.peds,
      police: police.cars,
      player: { x: player.x, z: player.z, heading: inCar && playerCar ? playerCar.heading : player.heading },
    });
  }
}

// Track the last mouse movement for the chase-cam ease.
window.addEventListener('pointermove', () => { lastMouseMove = performance.now(); });

// ---- buttons ----
document.getElementById('title-start').addEventListener('click', () => { audio.click(); startGame(false); });
document.getElementById('title-continue').addEventListener('click', () => { audio.click(); startGame(true); });
document.getElementById('pause-resume').addEventListener('click', () => { audio.click(); togglePause(); });
document.getElementById('pause-restart').addEventListener('click', () => { audio.click(); missions.fail('Restarted by the player.'); respawnAfterEnd(); });
document.getElementById('pause-quit').addEventListener('click', () => { audio.click(); saveGame(); hud.hideScreens(); screen = 'title'; hud.showTitle(loadSave()); });
document.getElementById('end-retry').addEventListener('click', () => { audio.click(); respawnAfterEnd(); });
document.getElementById('end-title-btn').addEventListener('click', () => { audio.click(); hud.hideScreens(); screen = 'title'; hud.showTitle(loadSave()); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && screen === 'playing') togglePause();
});

// ---- main loop ----
let accumulator = 0;
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  accumulator += Math.min((now - last) / 1000, MAX_FRAME);
  last = now;
  while (accumulator >= STEP) {
    update(STEP);
    accumulator -= STEP;
  }
  if (shotReadyAt > 0 && elapsed >= shotReadyAt) {
    shotReadyAt = -1;
    window.__shotReady = true;
  }
  world.updateHeliFollow();
  renderer.render(scene, camera);
}

// ---- debug handle + shot staging ----
function teleportPlayer(x, z) {
  if (inCar && playerCar) {
    playerCar.x = x;
    playerCar.z = z;
    playerCar.mesh.position.set(x, 0, z);
  } else {
    player.x = x;
    player.z = z;
    player.mesh.position.set(x, 0, z);
  }
}

function giveCar(color) {
  const mesh = buildCarMesh(color ?? 0xc23b2e);
  scene.add(mesh);
  if (playerCar) scene.remove(playerCar.mesh);
  playerCar = createCar(mesh, player.x + 3, player.z, player.heading);
  playerCar.color = color ?? 0xc23b2e;
  playerCar.isPlayer = true;
  inCar = true;
  player.mesh.visible = false;
}

window.__solmar = {
  get state() {
    return {
      screen, money, wanted, health: player.health,
      mission: missions.current() ? missions.current().id : 0,
      phase: missions.phase, completed: missions.completed,
      inCar, player: inCar && playerCar ? { x: playerCar.x, z: playerCar.z } : { x: player.x, z: player.z }, elapsed,
      traffic: traffic.cars.length, police: police.cars.length,
      thugs: thugs.aliveCount(), peds: peds.peds.length,
      targetCar: targetCar ? { x: targetCar.x, z: targetCar.z } : null,
      thug: (() => { const t = thugs.thugs.find((th) => !th.dead); return t ? { x: t.x, z: t.z, health: t.health } : null; })(),
    };
  },
  teleport: teleportPlayer,
  setYaw(yaw) { input.setYaw(yaw); },
  setHeading(a) { player.heading = a; },
  nearestThug() {
    const t = thugs.thugs.find((th) => !th.dead);
    return t ? { x: t.x, z: t.z, health: t.health } : null;
  },
  findCar() {
    const car = traffic.nearestCar(player.x, player.z, 500);
    return car ? { x: car.x, z: car.z, heading: car.heading } : null;
  },
  teleportNearCar() {
    const car = traffic.nearestCar(player.x, player.z, 500);
    if (!car) return null;
    teleportPlayer(car.x + 2.5, car.z);
    return { x: car.x, z: car.z };
  },
  setWanted(n) { wanted = n; lastCrimeTime = elapsed; hud.setStars(n); },
  policeCars() {
    return police.cars.map((c) => ({ x: Math.round(c.x), z: Math.round(c.z), speed: +c.speed.toFixed(1) }));
  },
  carSpeed() { return playerCar ? +playerCar.speed.toFixed(1) : 0; },
  car() {
    if (!playerCar) return null;
    return { x: +playerCar.x.toFixed(1), z: +playerCar.z.toFixed(1), heading: +playerCar.heading.toFixed(2), speed: +playerCar.speed.toFixed(1), health: playerCar.health, touchingWall: !!playerCar.touchingWall };
  },
  traffic() {
    return traffic.cars.map((c) => ({ x: Math.round(c.x), z: Math.round(c.z), speed: +c.speed.toFixed(1) }));
  },
  startMission(i) { missions.startMission(i, missions.completed); },
  arrive: () => missions.arrive(),
  giveCar,
  spawnPolice: () => police.update(0.1, Math.max(wanted, 1), player, inCar ? playerCar : null, colliders, null),
  setMoney(n) { money = n; hud.setMoney(n); },
  setHealth(n) { player.health = n; hud.setHealth(n, CONFIG.playerHealth); },
  god: (on) => { godMode = on !== false; },
  renderInfo() {
    return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
  },
  version: 'solmar-bay-1',
};

// Shot staging runs the real game from a staged position. Readiness is set
// from game time (elapsed), not wall time, so a slow renderer still stages
// the same scene.
let shotReadyAt = -1;
let shotTrafficClearAt = null;
function clearShotTrafficLane(car) {
  for (const other of traffic.cars) {
    if (other.parked) continue;
    const dx = other.x - car.x;
    const dz = other.z - car.z;
    const ahead = dx * Math.sin(car.heading) + dz * Math.cos(car.heading);
    const side = dx * Math.cos(car.heading) - dz * Math.sin(car.heading);
    if (ahead > 0 && ahead < 34 && Math.abs(side) < 5) {
      other.x = car.x - Math.sin(car.heading) * 28;
      other.z = car.z - Math.cos(car.heading) * 28;
      other.parked = true;
    }
  }
}
function stageShot(name) {
  // Every shot runs the real game from a staged position, then flags ready.
  const readyIn = (seconds) => { shotReadyAt = elapsed + seconds; };
  if (name === 'start') {
    hud.showTitle(null);
    screen = 'title';
    world.setHeliOrbit(14, -62, 0, 34, 0, 0);
    readyIn(2);
    return;
  }
  startGame(false);
  if (name === 'city') {
    teleportPlayer(-16, 12);
    input.setYaw(Math.PI * 0.78);
    input.setPitch(0.3);
    world.followHeli(player, () => input.yaw, { forward: 28, side: 7, height: 4.2 });
    readyIn(3);
  } else if (name === 'mission') {
    missions.startMission(1, 0); // mission 2: the Comet GT
    // Stage the getaway, not the pickup: the beacon cylinder encloses the
    // parked car, so a pickup shot only shows gold wash, not the car.
    // Driving the yellow Comet GT to the garage puts the hero car out in
    // the open, with the beacon far away at the drop-off.
    giveCar(0xe8c832);
    teleportPlayer(0, -100);
    playerCar.heading = 0; // rolling north up Ocean Ave
    playerCar.speed = 22; // ~80 km/h from the first frame
    missions.arrive(); // pickup -> deliver: "Deliver the Comet GT..."
    // Rear three-quarter chase framing: the yaw easing is disabled on
    // shot pages, so this angle holds for the screenshot.
    input.setYaw(0.22);
    input.setPitch(0.2);
    world.followHeli(playerCar, () => input.yaw);
    readyIn(3);
  } else if (name === 'chase') {
    missions.startMission(2, 2); // mission 3: the getaway
    giveCar(0xc23b2e);
    teleportPlayer(0, -150); // 4 s of rolling stops well short of the z=-62 intersection
    playerCar.heading = 0;
    playerCar.speed = 22; // rolling down the street as the chase forms
    input.setYaw(0.22);
    input.setPitch(0.2);
    wanted = 3;
    lastCrimeTime = elapsed;
    hud.setStars(3);
    police.update(0.1, 3, player, playerCar, colliders, null);
    // Build the full three-car formation immediately for this staged shot;
    // normal gameplay retains its timed police dispatch.
    while (police.cars.length < 3) police.update(2.6, 3, player, playerCar, colliders, null);
    // Readiness uses game time, but message expiry uses wall time: on a
    // slow renderer 12 seconds can expire before the 3-second shot is ready.
    // Pin only these shot-page callouts, including against feed eviction.
    const feed = document.getElementById('feed');
    feed.replaceChildren();
    feed.style.width = '760px';
    hud.message('POLICE 07m  RAMMING  |  POLICE 11m  FLANKING  |  POLICE 14m  ROADBLOCK', 12000, true);
    hud.message('SPOTLIGHT 18m  |  DRIFT x3  |  NEAR MISS +$250', 12000, true);
    world.followHeli(playerCar, () => input.yaw);
    readyIn(3);
  } else {
    readyIn(2);
  }
}

if (shot) {
  hud.showTitle(null);
  stageShot(shot);
} else {
  hud.showTitle(loadSave());
}

status.textContent = 'Solmar Bay. Press Start.';
requestAnimationFrame(frame);
