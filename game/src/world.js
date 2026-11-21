// The city of Port Solmar at golden hour: a street grid with sidewalks,
// buildings with lit windows, a beach and sea on the south edge, a pier, a
// plaza, a parking lot, a garage and a marina. Everything is built from
// boxes, cylinders and canvas textures drawn at boot — no outside assets.
//
// Rendering: static geometry is merged per material into a handful of draw
// calls (see merge.js); only genuinely moving things stay as separate
// meshes. Clouds ride one InstancedMesh.

import * as THREE from '../vendor/three.module.min.js';
import { CONFIG, PALETTE } from './config.js';
import { mergeGeometries, xform, mergedMesh } from './merge.js';

const STREET_CENTERS = [-186, -124, -62, 0, 62, 124, 186];
const BLOCK_CENTERS = [-155, -93, -31, 31, 93, 155];

function facadeTexture(rows, base, rng) {
  const key = `${rows}-${base}`;
  facadeTexture.cache = facadeTexture.cache || new Map();
  if (facadeTexture.cache.has(key)) return facadeTexture.cache.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = `#${base.toString(16).padStart(6, '0')}`;
  g.fillRect(0, 0, 128, 256);
  // Slight vertical shade so the top reads as sunlit and the base as shadow.
  const shade = g.createLinearGradient(0, 0, 0, 256);
  shade.addColorStop(0, 'rgba(255,255,255,0.14)');
  shade.addColorStop(1, 'rgba(0,0,0,0.22)');
  g.fillStyle = shade;
  g.fillRect(0, 0, 128, 256);
  const cols = 5;
  const marginX = 12;
  const marginY = 14;
  const cellW = (128 - marginX * 2) / cols;
  const cellH = (256 - marginY * 2) / rows;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const lit = rng.next() < 0.45;
      g.fillStyle = lit ? '#ffe9a8' : '#2c3a48';
      g.fillRect(
        marginX + c * cellW + cellW * 0.22,
        marginY + r * cellH + cellH * 0.24,
        cellW * 0.56,
        cellH * 0.52,
      );
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  facadeTexture.cache.set(key, tex);
  return tex;
}

function textTexture(text, sub, bg, fg) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = fg;
  g.font = 'bold 56px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, sub ? 48 : 64);
  if (sub) {
    g.font = '28px system-ui, sans-serif';
    g.fillText(sub, 256, 96);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function groundTexture(rng) {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 2048;
  const g = canvas.getContext('2d');
  const S = 2048 / 480; // px per world unit, world runs -240..240
  const toPx = (v) => (v + 240) * S;
  // Asphalt base: a warm light grey, so the road reads as a sunlit
  // street against the tan sidewalks instead of a dark band. (The old
  // #3a3f46/#4a4d55 read nearly black in the chase screenshot.)
  g.fillStyle = '#6b675e';
  g.fillRect(0, 0, 2048, 2048);
  // Sidewalk blocks.
  for (const bx of BLOCK_CENTERS) {
    for (const bz of BLOCK_CENTERS) {
      g.fillStyle = '#9a938a';
      g.fillRect(toPx(bx - 24), toPx(bz - 24), 48 * S, 48 * S);
      g.fillStyle = '#8a8378';
      g.fillRect(toPx(bx - 24), toPx(bz - 24), 48 * S, 3);
    }
  }
  // Beach sand on the south edge.
  g.fillStyle = '#e8d5a2';
  g.fillRect(0, toPx(CONFIG.beachZ), 2048, 2048 - toPx(CONFIG.beachZ));
  // Lane dashes along every street.
  g.fillStyle = '#d8d2c0';
  for (const s of STREET_CENTERS) {
    for (let d = -220; d < 220; d += 16) {
      g.fillRect(toPx(d), toPx(s) - 1.5, 8 * S, 3);
      g.fillRect(toPx(s) - 1.5, toPx(d), 3, 8 * S);
    }
  }
  // Stop bars, dark utility covers and fine asphalt repairs make the road
  // surface read as paved city infrastructure without adding draw calls.
  g.fillStyle = 'rgba(244,238,218,0.9)';
  for (const sx of [-62, 0, 62]) {
    for (const sz of [-62, 0, 62]) {
      g.fillRect(toPx(sx - 8), toPx(sz - 10), 16 * S, 0.8 * S);
      g.fillRect(toPx(sx - 10), toPx(sz - 8), 0.8 * S, 16 * S);
    }
  }
  for (const [mx, mz] of [[-31, -62], [31, 0], [62, 31], [0, 124], [-124, 62], [124, -124]]) {
    g.fillStyle = '#514f4a';
    g.beginPath(); g.ellipse(toPx(mx), toPx(mz), 1.1 * S, 0.65 * S, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#8d887c'; g.lineWidth = 2;
    g.beginPath(); g.ellipse(toPx(mx), toPx(mz), 0.8 * S, 0.43 * S, 0, 0, Math.PI * 2); g.stroke();
  }
  g.strokeStyle = 'rgba(48,48,45,0.28)';
  g.lineWidth = 2;
  for (const [x, z, dx, dz] of [[-90, -62, 5, 1], [26, 0, -3, 2], [62, 95, 4, -2], [156, -124, -5, 1], [-186, 62, 3, 2]]) {
    g.beginPath(); g.moveTo(toPx(x), toPx(z)); g.lineTo(toPx(x + dx), toPx(z + dz)); g.lineTo(toPx(x + dx + 1), toPx(z + dz + 2)); g.stroke();
  }
  // Crosswalk stripes at the four main intersections.
  for (const sx of [-62, 0, 62]) {
    for (const sz of [-62, 0, 62]) {
      for (let i = -3; i <= 3; i += 1) {
        g.fillRect(toPx(sx + i * 3) - 2, toPx(sz - 9), 4, 4);
        g.fillRect(toPx(sx - 9), toPx(sz + i * 3) - 2, 4, 4);
      }
    }
  }
  // A few grass patches and plaza paving.
  g.fillStyle = '#6f9e5a';
  g.fillRect(toPx(-24), toPx(-24), 48 * S, 48 * S);
  g.fillStyle = '#c8b8a0';
  g.fillRect(toPx(-24), toPx(-24), 48 * S, 48 * S);
  void rng;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function skyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#20204f'); // saturated indigo zenith
    grad.addColorStop(0.3, '#883c91'); // magenta transition
    grad.addColorStop(0.5, '#ff7546'); // vivid sunset orange
    grad.addColorStop(0.62, '#ffad2f'); // golden band
  grad.addColorStop(1, '#1a1a2e'); // below the horizon, never seen
  g.fillStyle = grad;
  g.fillRect(0, 0, 16, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function box(w, h, d, color, x, y, z, opts = {}) {
  const mat = opts.material || new THREE.MeshStandardMaterial({ color, roughness: opts.roughness ?? 0.9, metalness: opts.metalness ?? 0 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  if (opts.ry) mesh.rotation.y = opts.ry;
  mesh.castShadow = opts.cast === true;
  mesh.receiveShadow = true;
  return mesh;
}

export function buildWorld(scene, rng) {
  const colliders = [];
  const group = new THREE.Group();
  scene.add(group);

  // Golden-hour sky dome: a big gradient sphere, unlit, no fog.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(700, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }),
  );
  group.add(sky);

  // Distant skyline: hazy silhouette towers ringing the city, one mesh.
  {
    const entries = [];
    for (let i = 0; i < 26; i += 1) {
      const a = (i / 26) * Math.PI * 2 + rng.range(-0.06, 0.06);
      const r = rng.range(330, 420);
      const w = rng.range(18, 34);
      const h = rng.range(30, 95);
      const d = rng.range(18, 30);
      entries.push({
        geo: new THREE.BoxGeometry(w, h, d),
        x: Math.sin(a) * r, y: h / 2 - 2, z: Math.cos(a) * r,
        ry: rng.range(0, Math.PI),
      });
    }
    const skyline = mergedMesh(entries, new THREE.MeshStandardMaterial({ color: 0x4a3a5e, roughness: 1 }));
    skyline.castShadow = false;
    group.add(skyline);
  }

  // Ground: one textured plane for asphalt, sidewalks, dashes and sand.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(480, 480),
    new THREE.MeshStandardMaterial({ map: groundTexture(rng), roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // Sea: a wide plane south of the beach, slightly below ground level.
  const seaCanvas = document.createElement('canvas');
  seaCanvas.width = 256;
  seaCanvas.height = 256;
  const sg = seaCanvas.getContext('2d');
  sg.fillStyle = '#2e7f9e';
  sg.fillRect(0, 0, 256, 256);
  sg.strokeStyle = 'rgba(255,255,255,0.25)';
  sg.lineWidth = 2;
  for (let i = 0; i < 40; i += 1) {
    const y = rng.range(0, 256);
    const x = rng.range(0, 256);
    sg.beginPath();
    sg.moveTo(x, y);
    sg.lineTo(x + rng.range(14, 40), y);
    sg.stroke();
  }
  // A warm sunset streak on the water.
  sg.strokeStyle = 'rgba(255,180,90,0.35)';
  sg.lineWidth = 5;
  for (let i = 0; i < 12; i += 1) {
    const y = rng.range(90, 170);
    const x = rng.range(0, 200);
    sg.beginPath();
    sg.moveTo(x, y);
    sg.lineTo(x + rng.range(30, 70), y);
    sg.stroke();
  }
  const seaTex = new THREE.CanvasTexture(seaCanvas);
  seaTex.colorSpace = THREE.SRGBColorSpace;
  seaTex.wrapS = THREE.RepeatWrapping;
  seaTex.wrapT = THREE.RepeatWrapping;
  seaTex.repeat.set(6, 3);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 220),
    new THREE.MeshStandardMaterial({ map: seaTex, roughness: 0.35, metalness: 0.1 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.25, CONFIG.waterZ + 105);
  group.add(sea);

  // ---- Buildings, merged per facade material (color + window rows). ----
  const skip = new Set(['0,0', '62,62', '-155,-155']);
  const buildingBuckets = new Map(); // key -> { mat, entries }
  const roofBuckets = new Map(); // roof color -> entries
  const ledgeEntries = [];
  const balconyEntries = [];
  const awningBuckets = new Map();
  const shopGlassEntries = [];
  const acEntries = [];
  const tankEntries = [];
  const tankRoofEntries = [];
  const antennaEntries = [];
  function buildingMat(color, rows) {
    const key = `${color}-${rows}`;
    if (!buildingBuckets.has(key)) {
      buildingBuckets.set(key, {
        mat: new THREE.MeshStandardMaterial({ map: facadeTexture(rows, color, rng), roughness: 0.92 }),
        entries: [],
      });
    }
    return buildingBuckets.get(key);
  }

  for (const bx of BLOCK_CENTERS) {
    for (const bz of BLOCK_CENTERS) {
      if (skip.has(`${bx},${bz}`)) continue;
      const count = rng.int(1, 3);
      for (let i = 0; i < count; i += 1) {
        const w = rng.range(14, 22);
        const d = rng.range(14, 22);
        // A few landmark towers rise well above the rest.
        const h = rng.chance(0.12) ? rng.range(44, 58) : rng.range(9, 40);
        const ox = bx + rng.range(-10, 10) * (count > 1 ? 0.7 : 0);
        const oz = bz + rng.range(-10, 10) * (count > 1 ? 0.7 : 0);
        const x = Math.max(bx - 24 + w / 2 + 1, Math.min(bx + 24 - w / 2 - 1, ox));
        const z = Math.max(bz - 24 + d / 2 + 1, Math.min(bz + 24 - d / 2 - 1, oz));
        const color = rng.pick(PALETTE.building);
        const rows = h < 20 ? 5 : 9;
        buildingMat(color, rows).entries.push({ geo: new THREE.BoxGeometry(w, h, d), x, y: h / 2, z });
        // A shallow setback at the roof and occasional street-facing balconies
        // break up the flat block silhouette while staying batched by material.
        ledgeEntries.push({ geo: new THREE.BoxGeometry(w + 0.9, 0.28, d + 0.9), x, y: h * 0.72, z });
        if (h > 13 && rng.chance(0.48)) {
          for (const side of [-1, 1]) {
            balconyEntries.push({ geo: new THREE.BoxGeometry(w * 0.58, 0.18, 1.45), x, y: Math.min(h - 1.4, 5.4), z: z + side * (d / 2 + 0.7) });
            balconyEntries.push({ geo: new THREE.BoxGeometry(w * 0.58, 0.7, 0.12), x, y: Math.min(h - 1, 5.8), z: z + side * (d / 2 + 1.35) });
          }
        }
        // Ground-floor shop glazing and striped awnings add a human scale to
        // the otherwise residential tower blocks.
        if (h > 12) {
          for (const side of [-1, 1]) {
            shopGlassEntries.push({ geo: new THREE.BoxGeometry(w * 0.58, 2.5, 0.08), x, y: 1.75, z: z + side * (d / 2 + 0.06) });
            const awningColor = rng.pick([0xc23b2e, 0xe8c832, 0x2e8f8a]);
            if (!awningBuckets.has(awningColor)) awningBuckets.set(awningColor, []);
            awningBuckets.get(awningColor).push({ geo: new THREE.BoxGeometry(w * 0.68, 0.22, 1.3), x, y: 3.25, z: z + side * (d / 2 + 0.62) });
          }
        }
        // Roof cap, merged per roof color.
        const roofColor = rng.pick(PALETTE.roof);
        if (!roofBuckets.has(roofColor)) roofBuckets.set(roofColor, []);
        roofBuckets.get(roofColor).push({ geo: new THREE.BoxGeometry(w + 0.6, 0.8, d + 0.6), x, y: h + 0.4, z });
        // Rooftop clutter: AC box, and on tall towers a water tank + antenna.
        if (rng.chance(0.6)) {
          acEntries.push({ geo: new THREE.BoxGeometry(rng.range(2, 4), rng.range(1.5, 3), rng.range(2, 4)), x: x + rng.range(-w / 4, w / 4), y: h + 1.6, z: z + rng.range(-d / 4, d / 4) });
        }
        if (h > 30 && rng.chance(0.55)) {
          const tx = x + rng.range(-w / 4, w / 4);
          const tz = z + rng.range(-d / 4, d / 4);
          tankEntries.push({ geo: new THREE.CylinderGeometry(1.6, 1.6, 3.2, 10), x: tx, y: h + 2.4, z: tz });
          tankRoofEntries.push({ geo: new THREE.ConeGeometry(1.9, 1.6, 10), x: tx, y: h + 4.8, z: tz });
        }
        if (h > 34 && rng.chance(0.5)) {
          antennaEntries.push({ geo: new THREE.CylinderGeometry(0.08, 0.12, 7, 6), x: x + rng.range(-w / 4, w / 4), y: h + 4.2, z: z + rng.range(-d / 4, d / 4) });
        }
        colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
      }
    }
  }
  // Buildings and roofs do NOT cast shadows: a 40–58 m tower throws a
  // 45–65 m shadow across the avenue, and that dark band is what ruined
  // the chase screenshot (verified: shadows-off the road reads bright
  // and the white police cruisers pop). Cars, people, palms and props
  // still cast, so moving things keep their grounding shadows; the
  // facades carry their own top-lit gradient for modelling.
  for (const { mat, entries } of buildingBuckets.values()) {
    const mesh = mergedMesh(entries, mat, { cast: false });
    group.add(mesh);
  }
  for (const [color, entries] of roofBuckets) {
    const mesh = mergedMesh(entries, new THREE.MeshStandardMaterial({ color, roughness: 0.95 }), { cast: false });
    group.add(mesh);
  }
  group.add(mergedMesh(ledgeEntries, new THREE.MeshStandardMaterial({ color: 0xb2a89a, roughness: 0.88 }), { cast: false }));
  if (balconyEntries.length) group.add(mergedMesh(balconyEntries, new THREE.MeshStandardMaterial({ color: 0x766b60, roughness: 0.8 }), { cast: false }));
  if (shopGlassEntries.length) group.add(mergedMesh(shopGlassEntries, new THREE.MeshStandardMaterial({ color: 0x49636a, roughness: 0.25, metalness: 0.28, emissive: 0x17282c, emissiveIntensity: 0.25 }), { cast: false }));
  for (const [color, entries] of awningBuckets) group.add(mergedMesh(entries, new THREE.MeshStandardMaterial({ color, roughness: 0.72 }), { cast: false }));
  if (acEntries.length) group.add(mergedMesh(acEntries, new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.9 })));
  if (tankEntries.length) group.add(mergedMesh(tankEntries, new THREE.MeshStandardMaterial({ color: 0x6a4a30, roughness: 1 })));
  if (tankRoofEntries.length) group.add(mergedMesh(tankRoofEntries, new THREE.MeshStandardMaterial({ color: 0x4a3423, roughness: 1 })));
  if (antennaEntries.length) group.add(mergedMesh(antennaEntries, new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.6, metalness: 0.5 })));

  // Vera's garage: a low wide building at the north-west block, sign facing the street.
  const garage = box(30, 9, 18, 0x4a6a8a, -155, 4.5, -155, { cast: true });
  group.add(garage);
  const garageSign = new THREE.Mesh(
    new THREE.PlaneGeometry(26, 5),
    new THREE.MeshStandardMaterial({ map: textTexture("VERA'S GARAGE", 'REPAIRS • TOWING • NO QUESTIONS', '#24344a', '#ffd75e'), roughness: 0.8 }),
  );
  garageSign.position.set(-170.5, 6.5, -155);
  garageSign.rotation.y = -Math.PI / 2;
  group.add(garageSign);
  colliders.push({ minX: -170, maxX: -140, minZ: -164, maxZ: -146 });
  // Tire stacks by the garage door.
  {
    const tireEntries = [];
    for (const [tx, tz] of [[-138, -148], [-138, -144], [-141, -146]]) {
      for (let k = 0; k < 3; k += 1) {
        tireEntries.push({ geo: new THREE.CylinderGeometry(0.85, 0.85, 0.5, 12), x: tx, y: 0.25 + k * 0.5, z: tz });
      }
    }
    group.add(mergedMesh(tireEntries, new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 1 })));
  }

  // Downtown billboards.
  const billboards = [
    { x: -31, z: -31, ry: 0, text: 'SOLMAR BAY', sub: 'SUN • SEA • SPEED' },
    { x: 93, z: -93, ry: Math.PI / 2, text: 'COMET GT', sub: '0–60 IN 3.1 SECONDS' },
  ];
  const billPoleEntries = [];
  for (const b of billboards) {
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 6),
      new THREE.MeshStandardMaterial({ map: textTexture(b.text, b.sub, '#20242c', '#f2f2f2'), roughness: 0.7 }),
    );
    board.position.set(b.x, 26, b.z);
    board.rotation.y = b.ry;
    group.add(board);
    billPoleEntries.push({ geo: new THREE.BoxGeometry(1.2, 26, 1.2), x: b.x, y: 13, z: b.z + (b.ry === 0 ? 0.4 : 0) });
  }
  group.add(mergedMesh(billPoleEntries, new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 })));

  // Street signs: named avenues, so the city reads as a place.
  const streetSigns = [
    { x: 4, z: 58, ry: 0, text: 'OCEAN AVE' },
    { x: 58, z: -4, ry: Math.PI / 2, text: 'PALM ST' },
    { x: -58, z: 4, ry: -Math.PI / 2, text: 'VERA WAY' },
    { x: -4, z: -58, ry: Math.PI, text: 'PIER 9' },
  ];
  for (const s of streetSigns) {
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 2.2),
      new THREE.MeshStandardMaterial({ map: textTexture(s.text, '', '#1d5a2e', '#f2f2f2'), roughness: 0.7 }),
    );
    sign.position.set(s.x, 5.4, s.z);
    sign.rotation.y = s.ry;
    group.add(sign);
    group.add(box(0.18, 5.4, 0.18, 0x3a3f46, s.x, 2.7, s.z));
  }

  // The pier: planks out from the beach into the sea, with a hut at the end.
  {
    const plankEntries = [];
    for (let z = CONFIG.beachZ; z <= 234; z += 3) {
      plankEntries.push({ geo: new THREE.BoxGeometry(6, 0.4, 2.8), x: 30, y: 0.35, z });
    }
    group.add(mergedMesh(plankEntries, new THREE.MeshStandardMaterial({ color: PALETTE.pier, roughness: 1 })));
    const railEntries = [];
    for (const side of [-3.4, 3.4]) {
      railEntries.push({ geo: new THREE.BoxGeometry(0.3, 1.1, 38), x: 30 + side, y: 0.9, z: 215 });
    }
    group.add(mergedMesh(railEntries, new THREE.MeshStandardMaterial({ color: 0x6a4a30, roughness: 1 })));
  }
  group.add(box(7, 5, 6, 0x7a5a38, 30, 2.5, 232));
  group.add(box(7.6, 0.5, 6.6, 0x5a4028, 30, 5.2, 232));

  // Street lamps at every intersection, merged into two meshes.
  {
    const poleEntries = [];
    const headEntries = [];
    for (const sx of STREET_CENTERS) {
      for (const sz of STREET_CENTERS) {
        poleEntries.push({ geo: new THREE.CylinderGeometry(0.14, 0.18, 7, 8), x: sx + 8, y: 3.5, z: sz + 8 });
        headEntries.push({ geo: new THREE.BoxGeometry(1.6, 0.3, 0.7), x: sx + 7.2, y: 7, z: sz + 8 });
      }
    }
    group.add(mergedMesh(poleEntries, new THREE.MeshStandardMaterial({ color: PALETTE.lamp, roughness: 0.6, metalness: 0.5 })));
    group.add(mergedMesh(headEntries, new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffdf80, emissiveIntensity: 0.9 })));
  }

  // Traffic lights at the nine main intersections (static green).
  {
    const poleEntries = [];
    const housingEntries = [];
    const lightEntries = [];
    for (const sx of [-62, 0, 62]) {
      for (const sz of [-62, 0, 62]) {
        poleEntries.push({ geo: new THREE.CylinderGeometry(0.12, 0.16, 6.5, 8), x: sx - 8, y: 3.25, z: sz - 8 });
        housingEntries.push({ geo: new THREE.BoxGeometry(0.9, 2.4, 0.7), x: sx - 8, y: 6.8, z: sz - 8 });
        lightEntries.push({ geo: new THREE.BoxGeometry(0.5, 0.5, 0.1), x: sx - 8, y: 6.1, z: sz - 8 + 0.36 });
      }
    }
    group.add(mergedMesh(poleEntries, new THREE.MeshStandardMaterial({ color: 0x2e3238, roughness: 0.6, metalness: 0.5 })));
    group.add(mergedMesh(housingEntries, new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.7 })));
    group.add(mergedMesh(lightEntries, new THREE.MeshStandardMaterial({ color: 0x58c96b, emissive: 0x2fae4e, emissiveIntensity: 1.2 })));
  }

  // Meter posts and benches add curbside detail in a few batched meshes.
  {
    const posts = [];
    const heads = [];
    const seats = [];
    const legs = [];
    for (const [x, z] of [[-52, -18], [-52, 18], [10, -52], [-18, 52], [74, -18], [74, 18], [136, -52], [-136, 52], [198, -18], [-198, 18]]) {
      posts.push({ geo: new THREE.CylinderGeometry(0.07, 0.1, 1.25, 7), x, y: 0.63, z });
      heads.push({ geo: new THREE.BoxGeometry(0.32, 0.38, 0.24), x, y: 1.42, z });
    }
    for (const [x, z, ry] of [[-48, -12, 0], [-48, 12, 0], [14, -48, Math.PI / 2], [-14, 48, Math.PI / 2], [78, -12, 0], [78, 12, 0], [140, -48, Math.PI / 2], [-140, 48, Math.PI / 2]]) {
      seats.push({ geo: new THREE.BoxGeometry(3.8, 0.18, 0.82), x, y: 0.62, z, ry });
      for (const off of [-1.35, 1.35]) legs.push({ geo: new THREE.BoxGeometry(0.18, 0.58, 0.62), x: x + Math.cos(ry) * off, y: 0.3, z: z - Math.sin(ry) * off, ry });
    }
    group.add(mergedMesh(posts, new THREE.MeshStandardMaterial({ color: 0x50565a, roughness: 0.55, metalness: 0.65 })));
    group.add(mergedMesh(heads, new THREE.MeshStandardMaterial({ color: 0xd8d1bd, roughness: 0.45, metalness: 0.35 })));
    group.add(mergedMesh(seats, new THREE.MeshStandardMaterial({ color: 0x765438, roughness: 0.9 })));
    group.add(mergedMesh(legs, new THREE.MeshStandardMaterial({ color: 0x35383a, roughness: 0.7, metalness: 0.4 })));
  }

  // Parked cars fill curb lanes while leaving the traffic and collision grids alone.
  {
    const paints = new Map([[0xc23b2e, []], [0xe8c832, []], [0x2e6fc2, []], [0xd8d8d8, []]]);
    const windows = [];
    const tires = [];
    const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
    wheelGeo.rotateZ(Math.PI / 2);
    for (const [x, z, color, ry] of [[-48, -13, 0xc23b2e, 0], [-48, 13, 0x2e6fc2, Math.PI], [14, -48, 0xe8c832, Math.PI / 2], [76, 13, 0xd8d8d8, Math.PI], [138, -48, 0xc23b2e, Math.PI / 2], [-138, 48, 0x2e6fc2, -Math.PI / 2]]) {
      const add = (entries, geo, px, py, pz) => entries.push({ geo, x: px, y: py, z: pz, ry });
      add(paints.get(color), new THREE.BoxGeometry(1.85, 0.62, 4), x, 0.62, z);
      add(paints.get(color), new THREE.BoxGeometry(1.48, 0.5, 1.8), x, 1.17, z - 0.15);
      add(windows, new THREE.BoxGeometry(1.32, 0.3, 1.55), x, 1.2, z - 0.15);
      for (const side of [-1, 1]) for (const end of [-1, 1]) add(tires, wheelGeo, x + side * 0.9, 0.38, z + end * 1.25);
    }
    for (const [color, entries] of paints) group.add(mergedMesh(entries, new THREE.MeshStandardMaterial({ color, roughness: 0.34, metalness: 0.42 })));
    group.add(mergedMesh(windows, new THREE.MeshStandardMaterial({ color: 0x293c49, roughness: 0.18, metalness: 0.4 })));
    group.add(mergedMesh(tires, new THREE.MeshStandardMaterial({ color: 0x17191c, roughness: 0.95 })));
  }

  // Fire hydrants and trash cans on sidewalk corners, merged.
  {
    const hydrantEntries = [];
    for (const [hx, hz] of [[-54, -54], [70, -54], [-54, 70], [70, 70], [-116, 8], [8, -116], [116, -8], [-8, 116], [-178, -54], [54, 178], [178, 54], [-54, -178]]) {
      hydrantEntries.push({ geo: new THREE.CylinderGeometry(0.32, 0.38, 0.9, 8), x: hx, y: 0.45, z: hz });
      hydrantEntries.push({ geo: new THREE.SphereGeometry(0.32, 8, 6), x: hx, y: 1.0, z: hz });
    }
    group.add(mergedMesh(hydrantEntries, new THREE.MeshStandardMaterial({ color: 0xc23b2e, roughness: 0.6 })));
    const canEntries = [];
    for (const [cx, cz] of [[-70, -8], [8, -70], [70, 8], [-8, 70], [-130, 54], [54, 130], [130, -54], [-54, -130]]) {
      canEntries.push({ geo: new THREE.CylinderGeometry(0.45, 0.4, 1.1, 10), x: cx, y: 0.55, z: cz });
    }
    group.add(mergedMesh(canEntries, new THREE.MeshStandardMaterial({ color: 0x3a4a3a, roughness: 0.8, metalness: 0.3 })));
  }

  // Palm trees along the beach and around the plaza, merged into two meshes.
  {
    const trunkEntries = [];
    const frondEntries = [];
    const palmSpots = [];
    for (let x = -200; x <= 200; x += 22) {
      if (Math.abs(x - 30) < 8) continue;
      palmSpots.push([x + rng.range(-4, 4), 202 + rng.range(-2, 4)]);
    }
    palmSpots.push([-18, -14], [18, 14], [-14, 18], [14, -18]);
    for (const z of [-170, -108, -46, 46, 108, 170]) { palmSpots.push([-8, z], [8, z]); }
    for (const [px, pz] of palmSpots) {
      trunkEntries.push({ geo: new THREE.CylinderGeometry(0.22, 0.34, 6.5, 7), x: px, y: 3.25, z: pz, rz: 0.08 });
      for (let i = 0; i < 6; i += 1) {
        frondEntries.push({
          geo: new THREE.ConeGeometry(0.9, 4.2, 4),
          x: px, y: 6.6, z: pz,
          ry: (i / 6) * Math.PI * 2, rz: Math.PI / 2 + 0.5,
          sx: 1, sy: 1, sz: 0.28,
        });
      }
    }
    const trunks = mergedMesh(trunkEntries, new THREE.MeshStandardMaterial({ color: PALETTE.palmTrunk, roughness: 1 }), { cast: true });
    group.add(trunks);
    group.add(mergedMesh(frondEntries, new THREE.MeshStandardMaterial({ color: PALETTE.palmLeaf, roughness: 0.9 })));
  }

  // Plaza: benches, planters with flowers, café umbrellas and a fountain.
  {
    const benchEntries = [];
    for (const [bx, bz, ry] of [[-10, 0, 0], [10, 0, 0], [0, -10, Math.PI / 2], [0, 10, Math.PI / 2], [-16, -16, Math.PI / 4], [16, 16, Math.PI / 4]]) {
      benchEntries.push({ geo: new THREE.BoxGeometry(5, 0.5, 1.6), x: bx, y: 0.6, z: bz, ry });
    }
    group.add(mergedMesh(benchEntries, new THREE.MeshStandardMaterial({ color: 0x7a5a38, roughness: 1 })));
    const planterEntries = [];
    const flowerEntries = [];
    for (const [px, pz] of [[-16, 0], [16, 0], [0, -16], [0, 16], [-8, -8], [8, 8]]) {
      planterEntries.push({ geo: new THREE.BoxGeometry(2.2, 0.9, 2.2), x: px, y: 0.45, z: pz });
      flowerEntries.push({ geo: new THREE.SphereGeometry(0.5, 8, 6), x: px, y: 1.1, z: pz });
    }
    group.add(mergedMesh(planterEntries, new THREE.MeshStandardMaterial({ color: 0x8a7a68, roughness: 1 })));
    group.add(mergedMesh(flowerEntries, new THREE.MeshStandardMaterial({ color: 0xe87b9a, roughness: 0.8 })));
    const umbrellaPoleEntries = [];
    const umbrellaEntries = [];
    for (const [ux, uz] of [[-14, 10], [14, -10], [-10, -14], [10, 14]]) {
      umbrellaPoleEntries.push({ geo: new THREE.CylinderGeometry(0.08, 0.08, 3, 6), x: ux, y: 1.5, z: uz });
      umbrellaEntries.push({ geo: new THREE.ConeGeometry(2.6, 1.1, 8), x: ux, y: 3.4, z: uz });
    }
    group.add(mergedMesh(umbrellaPoleEntries, new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.9 })));
    group.add(mergedMesh(umbrellaEntries, new THREE.MeshStandardMaterial({ color: 0xc23b2e, roughness: 0.85 })));
  }
  // Fountain: basin + rim merged, water separate.
  {
    const basin = mergedMesh([
      { geo: new THREE.CylinderGeometry(4, 4.4, 1, 20), x: 0, y: 0.5, z: 0 },
      { geo: new THREE.CylinderGeometry(4.5, 4.5, 0.5, 20), x: 0, y: 0.25, z: 0 },
    ], new THREE.MeshStandardMaterial({ color: 0x9aa4ac, roughness: 0.7 }), { cast: true });
    group.add(basin);
    const fountainWater = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 0.3, 20), new THREE.MeshStandardMaterial({ color: 0x4fa8c8, roughness: 0.2, metalness: 0.2 }));
    fountainWater.position.set(0, 1.05, 0);
    group.add(fountainWater);
  }

  // Parking lot: painted bays on the central lot block.
  const lot = new THREE.Mesh(new THREE.PlaneGeometry(44, 44), new THREE.MeshStandardMaterial({ color: 0x4a4f56, roughness: 0.95 }));
  lot.rotation.x = -Math.PI / 2;
  lot.position.set(62, 0.12, 62);
  lot.receiveShadow = true;
  group.add(lot);
  {
    const bayEntries = [];
    for (let i = 0; i < 6; i += 1) {
      bayEntries.push({ geo: new THREE.PlaneGeometry(0.35, 9), x: 48 + i * 5.6, y: 0.16, z: 62, rx: -Math.PI / 2 });
    }
    group.add(mergedMesh(bayEntries, new THREE.MeshBasicMaterial({ color: 0xe8e8e8 })));
  }

  // Beach: umbrellas and a lifeguard tower.
  {
    const poleEntries = [];
    const canopyEntries = [];
    const canopyColors = [0x2e8f8a, 0xe87b28];
    const canopyBuckets = new Map();
    for (const [ux, uz] of [[-80, 206], [-40, 210], [70, 208], [110, 206], [-140, 208], [150, 210]]) {
      poleEntries.push({ geo: new THREE.CylinderGeometry(0.07, 0.07, 2.6, 6), x: ux, y: 1.3, z: uz });
      const color = canopyColors[(ux + uz) % 2 === 0 ? 0 : 1];
      if (!canopyBuckets.has(color)) canopyBuckets.set(color, []);
      canopyBuckets.get(color).push({ geo: new THREE.ConeGeometry(2.2, 1, 8), x: ux, y: 2.9, z: uz });
    }
    group.add(mergedMesh(poleEntries, new THREE.MeshStandardMaterial({ color: 0x8a7a68, roughness: 1 })));
    for (const [color, entries] of canopyBuckets) {
      group.add(mergedMesh(entries, new THREE.MeshStandardMaterial({ color, roughness: 0.85 })));
    }
  }
  // Lifeguard tower.
  {
    const legEntries = [];
    for (const [lx, lz] of [[-62, 203], [-58, 203], [-62, 207], [-58, 207]]) {
      legEntries.push({ geo: new THREE.BoxGeometry(0.3, 4, 0.3), x: lx, y: 2, z: lz });
    }
    group.add(mergedMesh(legEntries, new THREE.MeshStandardMaterial({ color: 0x8a7a68, roughness: 1 })));
    const cabin = box(4.4, 2.2, 4, 0xf2f2f2, -60, 5, 205, { cast: true });
    group.add(cabin);
    group.add(box(5, 0.4, 4.6, 0xc23b2e, -60, 6.3, 205));
    colliders.push({ minX: -62.5, maxX: -57.5, minZ: 202.5, maxZ: 207.5 });
  }

  // Marina boatyard at the east edge: boats on stands, crates, a sign.
  const boatColors = [0xd8d8d8, 0x2e6fc2, 0xc23b2e];
  const boatCabinEntries = [];
  for (let i = 0; i < 3; i += 1) {
    const bx = 196 + rng.range(-3, 3);
    const bz = 128 + i * 20;
    const hull = box(4, 1.6, 12, boatColors[i], bx, 1.6, bz, { ry: 0.12, cast: true });
    group.add(hull);
    boatCabinEntries.push({ geo: new THREE.BoxGeometry(3, 1.4, 4), x: bx, y: 3, z: bz - 1, ry: 0.12 });
    colliders.push({ minX: bx - 2.5, maxX: bx + 2.5, minZ: bz - 6.5, maxZ: bz + 6.5 });
  }
  group.add(mergedMesh(boatCabinEntries, new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.7 })));
  const marinaSign = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 4),
    new THREE.MeshStandardMaterial({ map: textTexture('SOLMAR MARINA', 'BOATS • STORAGE • NO QUESTIONS', '#1d3a4a', '#9fd8e8'), roughness: 0.8 }),
  );
  marinaSign.position.set(188, 5, 150);
  marinaSign.rotation.y = -Math.PI / 2;
  group.add(marinaSign);
  {
    const crateEntries = [];
    for (let i = 0; i < 5; i += 1) {
      const s = rng.range(1.5, 2.5);
      crateEntries.push({ geo: new THREE.BoxGeometry(s, s, s), x: 186 + rng.range(-4, 6), y: s / 2, z: 118 + rng.range(0, 60) });
    }
    group.add(mergedMesh(crateEntries, new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 1 })));
  }

  // Clouds: one InstancedMesh of a 3-puff blob, drifting with the wind.
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffd9c0, roughness: 1, transparent: true, opacity: 0.85 });
  const puffGeos = [];
  for (let j = 0; j < 4; j += 1) {
    puffGeos.push(xform(new THREE.SphereGeometry(rng.range(5, 10), 10, 8), j * 6 - 9, rng.range(-1, 1), rng.range(-2, 2), 0, 0, 0, 1, 0.42, 1));
  }
  const cloudGeo = mergeGeometries(puffGeos);
  const clouds = new THREE.InstancedMesh(cloudGeo, cloudMat, 16);
  const cloudPos = [];
  const _m4 = new THREE.Matrix4();
  for (let i = 0; i < 16; i += 1) {
    const p = { x: rng.range(-220, 220), y: rng.range(58, 92), z: rng.range(-220, 220) };
    cloudPos.push(p);
    _m4.makeTranslation(p.x, p.y, p.z);
    clouds.setMatrixAt(i, _m4);
  }
  clouds.instanceMatrix.needsUpdate = true;
  group.add(clouds);

  // Sun disc in the southern sky, warm and large, roughly where the
  // directional light comes from.
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(26, 24),
    new THREE.MeshBasicMaterial({ color: 0xff9b4d, fog: false }),
  );
  sun.position.set(15, 120, 300);
  sun.lookAt(0, 0, 0);
  group.add(sun);

  // Police helicopter: a simple visual unit circling overhead (posed into
  // the chase/mission shots by stageShot). Seven meshes; the rotor spins.
  const heli = new THREE.Group();
  const heliMat = new THREE.MeshStandardMaterial({ color: 0xd4d9d7, roughness: 0.82, metalness: 0 });
  const heliBody = new THREE.Mesh(new THREE.BoxGeometry(5.8, 1.8, 2.5), heliMat);
  heli.add(heliBody);
  const heliStripe = new THREE.Mesh(new THREE.BoxGeometry(5.9, 0.42, 2.58), new THREE.MeshStandardMaterial({ color: 0x233c52, roughness: 0.78, metalness: 0 }));
  heliStripe.position.y = 0.25;
  heli.add(heliStripe);
  const cockpit = new THREE.Mesh(new THREE.BoxGeometry(1.55, 1.05, 2.36), new THREE.MeshStandardMaterial({ color: 0x263f48, roughness: 0.48, metalness: 0.04, emissive: 0x10191c, emissiveIntensity: 0.12 }));
  cockpit.position.set(2.6, 0.24, 0);
  heli.add(cockpit);
  const heliTail = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.48, 0.58), heliMat);
  heliTail.position.set(-5.3, 0.3, 0);
  heli.add(heliTail);
  const heliFin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.6, 1.2), heliMat);
  heliFin.position.set(-8, 0.9, 0);
  heli.add(heliFin);
  const heliRotor = new THREE.Mesh(new THREE.BoxGeometry(12, 0.16, 0.42), new THREE.MeshStandardMaterial({ color: 0x29343a, roughness: 0.82, metalness: 0 }));
  heliRotor.position.y = 1.2;
  heli.add(heliRotor);
  const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.2, 0.12), new THREE.MeshStandardMaterial({ color: 0x29343a, roughness: 0.82, metalness: 0 }));
  tailRotor.position.set(-8.1, 0.8, 0);
  heli.add(tailRotor);
  const heliSkidL = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.12, 0.25), heliMat);
  heliSkidL.position.set(0, -1.15, 1.05);
  heli.add(heliSkidL);
  const heliSkidR = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.12, 0.25), heliMat);
  heliSkidR.position.set(0, -1.15, -1.05);
  heli.add(heliSkidR);
  const heliLamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffefb0 }));
  heliLamp.position.set(2.7, -0.65, 0);
  heli.add(heliLamp);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(2.8, 5.8, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.24, depthWrite: false, side: THREE.DoubleSide }));
  cone.position.set(2.7, -3.4, 0);
  cone.scale.set(0.42, 1, 0.42);
  heli.add(cone);
  heliRotor.material.transparent = true;
  heliRotor.material.opacity = 0.42;
  group.add(heli);
  heli.scale.setScalar(1.45);
  const heliOrbit = { cx: 0, cz: 0, r: 110, h: 55, angle: 0.6, speed: 0.045 };

  let heliFollow = null;

  return {
    group,
    colliders,
    streets: STREET_CENTERS,
    update(dt) {
      for (let i = 0; i < cloudPos.length; i += 1) {
        const p = cloudPos[i];
        p.x += dt * 1.2;
        if (p.x > 240) p.x = -240;
        _m4.makeTranslation(p.x, p.y, p.z);
        clouds.setMatrixAt(i, _m4);
      }
      clouds.instanceMatrix.needsUpdate = true;
      seaTex.offset.x += dt * 0.008;
      // Helicopter circles its orbit centre, nose along the tangent.
      heliOrbit.angle += dt * heliOrbit.speed;
      heli.position.set(
        heliOrbit.cx + Math.cos(heliOrbit.angle) * heliOrbit.r,
        heliOrbit.h,
        heliOrbit.cz + Math.sin(heliOrbit.angle) * heliOrbit.r,
      );
      heli.rotation.y = -heliOrbit.angle;
      heliRotor.rotation.y += dt * 22;
    },
    // Camera-oriented offsets relative to the moving subject, never a
    // fixed world position. Keep the aircraft over the open avenue.
    followHeli(target, yaw, offset = {}) {
      heliFollow = {
        target, yaw,
        forward: offset.forward ?? 28,
        side: offset.side ?? 9,
        height: offset.height ?? 5.2,
      };
    },
    updateHeliFollow() {
      if (!heliFollow) return;
      const { target, yaw, forward, side, height } = heliFollow;
      const a = yaw();
      heli.position.set(
        target.x + Math.sin(a) * forward + Math.cos(a) * side,
        height,
        target.z + Math.cos(a) * forward - Math.sin(a) * side,
      );
      // Present the fuselage broadside to the camera so its tail, cabin,
      // and spinning rotor read clearly at the longer follow distance.
      heli.rotation.y = a;
    },
    // Pose the helicopter for a screenshot: orbit centre (cx, cz), radius
    // r, height h, starting angle, angular speed (0 = hover in place).
    setHeliOrbit(cx, cz, r, h, angle = 0.6, speed = 0.045) {
      heliOrbit.cx = cx;
      heliOrbit.cz = cz;
      heliOrbit.r = r;
      heliOrbit.h = h;
      heliOrbit.angle = angle;
      heliOrbit.speed = speed;
    },
  };
}

// Push a circle (x, z, radius) out of every building AABB it overlaps.
// Returns the corrected position as a new object.
export function resolveCircle(x, z, radius, colliders) {
  for (const c of colliders) {
    const cx = Math.max(c.minX, Math.min(x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
    const dx = x - cx;
    const dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    if (d2 < 1e-6) {
      // Centre is inside the box: push out along the smallest penetration.
      const pl = x - c.minX;
      const pr = c.maxX - x;
      const pt = z - c.minZ;
      const pb = c.maxZ - z;
      const m = Math.min(pl, pr, pt, pb);
      if (m === pl) x = c.minX - radius;
      else if (m === pr) x = c.maxX + radius;
      else if (m === pt) z = c.minZ - radius;
      else z = c.maxZ + radius;
    } else {
      const d = Math.sqrt(d2);
      const push = (radius - d) / d;
      x += dx * push;
      z += dz * push;
    }
  }
  return { x, z };
}

export function clampBounds(x, z) {
  return {
    x: Math.max(-CONFIG.cityHalf, Math.min(CONFIG.cityHalf, x)),
    z: Math.max(-CONFIG.cityHalf, Math.min(236, z)),
  };
}

// Snap a point onto the nearest street centre line (used for traffic spawns).
export function nearestStreetPoint(x, z, rng) {
  let best = null;
  let bestD = Infinity;
  for (const s of STREET_CENTERS) {
    const d = Math.abs(x - s);
    if (d < bestD) { bestD = d; best = { x: s, z, axis: 'z' }; }
    const d2 = Math.abs(z - s);
    if (d2 < bestD) { bestD = d2; best = { x, z: s, axis: 'x' }; }
  }
  void rng;
  return best;
}
