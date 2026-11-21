import * as Three from '../vendor/three.module.min.js';
import { PALETTE, CONFIG } from './config.js';
import { mergedMesh, xform, mergeGeometries } from './merge.js';

const TURN = 2 * Math.PI;
const RIGHT_ANGLE = TURN / 4;
const GRID = 62;
const GROUND_SIZE = 480;
const AVENUES = Array.from({ length: 7 }, (_, index) => GRID * (index - 3));
const BLOCKS = AVENUES.slice(0, -1).map(avenue => avenue + GRID / 2);
const DOWNTOWN = AVENUES.slice(2, 5);
const SIDES = [-1, 1];
const facadeMaps = new Map();

const flat = properties => new Three.MeshBasicMaterial(properties);
const surface = (color, roughness, properties) =>
  new Three.MeshStandardMaterial({ color, roughness, ...properties });
const cuboid = (...dimensions) => new Three.BoxGeometry(...dimensions);
const cylinder = (...dimensions) => new Three.CylinderGeometry(...dimensions);
const sphere = (...dimensions) => new Three.SphereGeometry(...dimensions);
const cone = (...dimensions) => new Three.ConeGeometry(...dimensions);
const plane = (...dimensions) => new Three.PlaneGeometry(...dimensions);
const limit = (value, low, high) => Math.max(low, Math.min(high, value));
const css = rgb => '#' + (0x1000000 + rgb).toString(16).slice(1);

function* gridPoints(coordinates) {
  for (const east of coordinates) {
    for (const south of coordinates) yield [east, south];
  }
}

function canvasMap(width, height, paint) {
  const image = document.createElement('canvas');
  Object.assign(image, { width, height });
  paint(image.getContext('2d'));
  const map = new Three.CanvasTexture(image);
  map.colorSpace = Three.SRGBColorSpace;
  return map;
}

function rectangle(pen, color, ...bounds) {
  pen.fillStyle = color;
  pen.fillRect(...bounds);
}

function gradient(pen, start, end, stops) {
  const ramp = pen.createLinearGradient(0, start, 0, end);
  for (const [at, color] of stops) ramp.addColorStop(at, color);
  return ramp;
}

function oval(pen, east, south, width, height) {
  pen.beginPath();
  pen.ellipse(east, south, width, height, 0, 0, TURN);
}

function strokePath(pen, first, ...remaining) {
  pen.beginPath();
  pen.moveTo(...first);
  for (const point of remaining) pen.lineTo(...point);
  pen.stroke();
}

function facadeMap(paintColor, rows, random) {
  const id = paintColor * 16 + rows;
  const existing = facadeMaps.get(id);
  if (existing) return existing;

  const atlas = canvasMap(128, 256, pen => {
    rectangle(pen, css(paintColor), 0, 0, 128, 256);
    const shade = gradient(pen, 0, 256, [
      [0, 'rgba(255,255,255,0.14)'], [1, 'rgba(0,0,0,0.22)'],
    ]);
    rectangle(pen, shade, 0, 0, 128, 256);
    const columnPitch = 104 / 5;
    const rowPitch = 228 / rows;
    const glassWidth = columnPitch * 0.62;
    const glassHeight = rowPitch * 0.58;
    for (let tile = 0; tile < rows * 5; ++tile) {
      const left = 12 + (tile % 5 + 0.19) * columnPitch;
      const top = 14 + (Math.floor(tile / 5) + 0.21) * rowPitch;
      const illuminated = random.next() < 0.45;
      rectangle(pen, 'rgba(33,44,57,0.55)', left - 1.5, top - 1, glassWidth + 3, glassHeight + 2);
      rectangle(pen, css(illuminated ? PALETTE.windowLit : PALETTE.windowDark), left, top, glassWidth, glassHeight);
      rectangle(pen, illuminated ? '#fff4ce' : '#65879e', left, top, glassWidth, glassHeight * 0.24);
      rectangle(pen, 'rgba(255,244,222,0.65)', left - 2.5, top + glassHeight, glassWidth + 5, 2);
    }
  });
  facadeMaps.set(id, atlas);
  return atlas;
}

function letteredMap(title, strapline, background, ink) {
  return canvasMap(512, 128, pen => {
    rectangle(pen, background, 0, 0, 512, 128);
    Object.assign(pen, { fillStyle: ink, font: 'bold 56px system-ui, sans-serif', textAlign: 'center', textBaseline: 'middle' });
    pen.fillText(title, 256, strapline ? 48 : 64);
    if (strapline) {
      pen.font = '28px system-ui, sans-serif';
      pen.fillText(strapline, 256, 96);
    }
  });
}

function roadMap() {
  const size = 2048;
  const scale = size / GROUND_SIZE;
  const pixel = coordinate => (coordinate + GROUND_SIZE / 2) * scale;
  const map = canvasMap(size, size, pen => {
    const plot = (color, east, south, width, depth) =>
      rectangle(pen, color, pixel(east), pixel(south), width * scale, depth * scale);

    rectangle(pen, css(PALETTE.asphalt), 0, 0, size, size);
    for (const [east, south] of gridPoints(BLOCKS)) {
      plot(css(PALETTE.sidewalk), east - 24, south - 24, 48, 48);
      rectangle(pen, '#707981', pixel(east - 24), pixel(south - 24), 48 * scale, 3);
    }
    const sheen = 'rgba(144,175,200,0.08)';
    for (const lane of AVENUES) {
      plot(sheen, -GROUND_SIZE / 2, lane - 2.1, GROUND_SIZE, 4.2);
      plot(sheen, lane - 2.1, -GROUND_SIZE / 2, 4.2, GROUND_SIZE);
    }
    pen.fillStyle = css(PALETTE.asphaltLine);
    for (const lane of AVENUES) {
      const center = pixel(lane) - 2.1;
      for (let dash = 0; dash < 28; ++dash) {
        const along = pixel(dash * 16 - 220);
        pen.fillRect(along, center, 8 * scale, 4.2);
        pen.fillRect(center, along, 4.2, 8 * scale);
      }
    }
    const crossingPaint = 'rgba(244,238,218,0.9)';
    for (const [east, south] of gridPoints(DOWNTOWN)) {
      plot(crossingPaint, east - 8, south - 10, 16, 0.8);
      plot(crossingPaint, east - 10, south - 8, 0.8, 16);
    }
    const covers = [[-31, -62], [31, 0], [62, 31], [0, 124], [-124, 62], [124, -124]];
    for (const [east, south] of covers) {
      const center = [pixel(east), pixel(south)];
      pen.fillStyle = '#514f4a';
      oval(pen, ...center, 1.1 * scale, 0.65 * scale);
      pen.fill();
      pen.strokeStyle = '#8d887c';
      pen.lineWidth = 2;
      oval(pen, ...center, 0.8 * scale, 0.43 * scale);
      pen.stroke();
    }
    pen.strokeStyle = 'rgba(48,48,45,0.28)';
    const seams = [[-90, -62, 5, 1], [26, 0, -3, 2], [62, 95, 4, -2], [156, -124, -5, 1], [-186, 62, 3, 2]];
    for (const [east, south, run, rise] of seams) {
      strokePath(pen, [pixel(east), pixel(south)], [pixel(east + run), pixel(south + rise)],
        [pixel(east + run + 1), pixel(south + rise + 2)]);
    }
    for (const [east, south] of gridPoints(DOWNTOWN)) {
      for (let offset = -9; offset <= 9; offset += 3) {
        pen.fillRect(pixel(east + offset) - 2, pixel(south - 9), 4, 4);
        pen.fillRect(pixel(east - 9), pixel(south + offset) - 2, 4, 4);
      }
    }
    plot('#c8b8a0', -24, -24, 48, 48);
    const shore = pixel(CONFIG.beachZ);
    rectangle(pen, css(PALETTE.sand), 0, shore, size, size - shore);
  });
  map.anisotropy = 4;
  return map;
}

function duskMap() {
  return canvasMap(128, 512, pen => {
    const horizon = gradient(pen, 0, 512, [
      [0, '#326fb5'], [0.26, '#4f8fc4'], [0.445, css(PALETTE.sky)], [0.485, '#f69e98'],
      [0.5, '#ffb36b'], [0.535, '#ff9a7a'], [0.65, '#704f68'], [1, '#26384d'],
    ]);
    rectangle(pen, horizon, 0, 0, 128, 512);
    for (let band = 0; band < 13; ++band) {
      const line = 219 + (band % 5) * 8 + Math.floor(band / 5) * 4;
      pen.fillStyle = gradient(pen, line - 9, line + 9, [
        [0, 'rgba(255,248,236,0)'], [0.5, 'rgba(255,239,225,0.16)'], [1, 'rgba(255,248,236,0)'],
      ]);
      oval(pen, (47 * band) % 128, line, 28 + 8 * (band % 4), 8 + 2 * (band % 3));
      pen.fill();
    }
  });
}

function waterMap(random) {
  const map = canvasMap(256, 256, pen => {
    rectangle(pen, '#2e7f9e', 0, 0, 256, 256);
    const streaks = [
      { color: 'rgba(255,255,255,0.25)', weight: 2, count: 40, top: 0, bottom: 256, reach: 256, length: [14, 40] },
      { color: 'rgba(255,180,90,0.35)', weight: 5, count: 12, top: 90, bottom: 170, reach: 200, length: [30, 70] },
    ];
    for (const style of streaks) {
      pen.strokeStyle = style.color;
      pen.lineWidth = style.weight;
      for (let streak = 0; streak < style.count; ++streak) {
        const row = random.range(style.top, style.bottom);
        const left = random.range(0, style.reach);
        strokePath(pen, [left, row], [left + random.range(...style.length), row]);
      }
    }
  });
  map.wrapS = map.wrapT = Three.RepeatWrapping;
  map.repeat.set(6, 3);
  return map;
}

function mount(parent, geometry, material, position = [0, 0, 0], options = {}) {
  const mesh = new Three.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(options.pitch ?? 0, options.yaw ?? 0, options.roll ?? 0);
  mesh.castShadow = options.shadows === true;
  mesh.receiveShadow = options.receive === true;
  parent.add(mesh);
  return mesh;
}

function part(geometry, east, elevation, south, angles = {}) {
  return { geo: geometry, x: east, y: elevation, z: south, ...angles };
}

function batch(parent, parts, material, cast = false) {
  if (parts.length > 0) parent.add(mergedMesh(parts, material, { cast }));
}

function bucket(map, key, create = () => []) {
  if (!map.has(key)) map.set(key, create());
  return map.get(key);
}

function footprint(barriers, east, south, halfWidth, halfDepth) {
  barriers.push({
    minX: east - halfWidth, maxX: east + halfWidth,
    minZ: south - halfDepth, maxZ: south + halfDepth,
  });
}

function addSkyline(city, random) {
  const palette = [0xc48e83, 0x9b92b3, 0xb6a2a1, 0x879cb7, 0xb89cae];
  const warm = new Three.Color(0xffc3a0);
  const shapes = [];
  const rgb = [];
  const towerCount = 26;
  for (let slot = 0; slot < towerCount; ++slot) {
    const heading = slot / towerCount * TURN + random.range(-0.06, 0.06);
    const distance = random.range(330, 420);
    const width = random.range(18, 34);
    const height = random.range(16, 63) * (slot % 4 ? 0.88 : 1.22);
    const depth = random.range(18, 30);
    const east = Math.sin(heading) * distance;
    const south = Math.cos(heading) * distance;
    const rotation = random.range(0, RIGHT_ANGLE * 2);
    const tint = new Three.Color(palette[slot % palette.length]);
    const stack = (w, h, d, elevation, shade) => {
      const geometry = xform(cuboid(w, h, d), east, elevation, south, 0, rotation);
      shapes.push(geometry);
      for (let vertex = 0; vertex < geometry.attributes.position.count; ++vertex) {
        rgb.push(shade.r, shade.g, shade.b);
      }
    };
    stack(width, height, depth, height / 2 - 2, tint);
    const profile = slot % 3;
    if (profile !== 1) {
      const crown = height * (profile === 0 ? 0.23 : 0.13);
      stack(width * 0.68, crown, depth * 0.73, height - 2 + crown / 2, tint.lerp(warm, 0.16));
    }
  }
  const silhouette = mergeGeometries(shapes);
  silhouette.setAttribute('color', new Three.Float32BufferAttribute(rgb, 3));
  mount(city, silhouette, flat({ vertexColors: true, toneMapped: false }));
}

function addTerrain(city, random) {
  mount(city, sphere(700, 24, 16), flat({
    map: duskMap(), side: Three.BackSide, fog: false, toneMapped: false,
  }));
  addSkyline(city, random);
  mount(city, plane(GROUND_SIZE, GROUND_SIZE), surface(0xffffff, 0.95, { map: roadMap() }),
    [0, 0, 0], { pitch: -RIGHT_ANGLE, receive: true });
  const water = waterMap(random);
  mount(city, plane(560, 220), surface(0xffffff, 0.35, { map: water, metalness: 0.1 }),
    [0, -0.25, CONFIG.waterZ + 105], { pitch: -RIGHT_ANGLE });
  return water;
}

function addNeighborhoods(city, barriers, random) {
  const facades = new Map();
  const roofs = new Map();
  const awnings = new Map();
  const ledges = [], balconies = [], storefronts = [], vents = [], tanks = [], lids = [], aerials = [];

  function addBuilding(blockEast, blockSouth, ordinal, occupancy) {
    const width = random.range(14, 22);
    const depth = random.range(14, 22);
    const height = random.chance(0.12) ? random.range(44, 58) : random.range(9, 40);
    const scatter = occupancy > 1 ? 0.7 : 0;
    const center = (block, span) => limit(block + scatter * random.range(-10, 10),
      block - 24 + span / 2 + 1, block + 24 - span / 2 - 1);
    const east = center(blockEast, width);
    const south = center(blockSouth, depth);
    const paint = random.pick(PALETTE.building);
    const floors = height < 20 ? 5 : 9;
    const facade = bucket(facades, paint * 16 + floors, () => ({
      material: surface(0xffffff, 0.92, { map: facadeMap(paint, floors, random) }),
      pieces: [],
    }));

    const setback = height > 22 ? height * (Math.abs(blockEast + blockSouth + ordinal) % 3 * 0.09) : 0;
    const base = height - setback;
    const crownWidth = setback ? width * 0.74 : width;
    const crownDepth = setback ? depth * 0.76 : depth;
    const atCenter = (geometry, elevation) => part(geometry, east, elevation, south);
    facade.pieces.push(atCenter(cuboid(width, base, depth), base / 2));
    if (setback) facade.pieces.push(atCenter(cuboid(crownWidth, setback, crownDepth), base + setback / 2));
    ledges.push(atCenter(cuboid(width + 0.9, 0.42, depth + 0.9), setback ? base : height * 0.72));

    const frontage = (geometry, elevation, side, offset, angles) =>
      part(geometry, east, elevation, south + side * (depth / 2 + offset), angles);
    if (height > 13 && random.chance(0.48)) {
      const deck = cuboid(width * 0.58, 0.18, 1.45);
      const guard = cuboid(width * 0.58, 0.7, 0.12);
      for (const side of SIDES) {
        balconies.push(frontage(deck, Math.min(height - 1.4, 5.4), side, 0.7),
          frontage(guard, Math.min(height - 1, 5.8), side, 1.35));
      }
    }
    if (height > 12) {
      const glazing = cuboid(width * 0.58, 2.5, 0.08);
      const shade = cuboid(width * 0.68, 0.28, 1.75);
      for (const side of SIDES) {
        storefronts.push(frontage(glazing, 1.75, side, 0.06));
        const fabric = random.pick([0xc23b2e, 0xe8c832, 0x2e8f8a]);
        bucket(awnings, fabric).push(frontage(shade, 3.25, side, 0.81, { rx: 0.19 * side }));
      }
    }

    const tile = random.pick(PALETTE.roof);
    bucket(roofs, tile).push(atCenter(cuboid(crownWidth + 0.8, 0.9, crownDepth + 0.8), height + 0.45));
    const roofEast = () => east + random.range(-width / 4, width / 4);
    const roofSouth = () => south + random.range(-depth / 4, depth / 4);
    if (random.chance(0.6)) {
      const unit = cuboid(random.range(2, 4), random.range(1.5, 3), random.range(2, 4));
      vents.push(part(unit, roofEast(), height + 1.6, roofSouth()));
    }
    if (height > 30 && random.chance(0.55)) {
      const tankEast = roofEast();
      const tankSouth = roofSouth();
      tanks.push(part(cylinder(1.6, 1.6, 3.2, 10), tankEast, height + 2.4, tankSouth));
      lids.push(part(cone(1.9, 1.6, 10), tankEast, height + 4.8, tankSouth));
    }
    if (height > 34 && random.chance(0.5)) {
      aerials.push(part(cylinder(0.08, 0.12, 7, 6), roofEast(), height + 4.2, roofSouth()));
    }
    footprint(barriers, east, south, width / 2, depth / 2);
  }

  for (const [east, south] of gridPoints(BLOCKS)) {
    if (east === BLOCKS[0] && south === BLOCKS[0]) continue;
    const density = random.int(1, 3);
    for (let ordinal = 0; ordinal < density; ++ordinal) addBuilding(east, south, ordinal, density);
  }

  for (const facade of facades.values()) batch(city, facade.pieces, facade.material);
  for (const [tile, pieces] of roofs) batch(city, pieces, surface(tile, 0.95));
  batch(city, ledges, surface(0xb2a89a, 0.88));
  batch(city, balconies, surface(0x766b60, 0.8));
  batch(city, storefronts, surface(0x49636a, 0.25, { metalness: 0.28, emissive: 0x17282c, emissiveIntensity: 0.25 }));
  for (const [fabric, pieces] of awnings) batch(city, pieces, surface(fabric, 0.72));
  batch(city, vents, surface(0x777777, 0.9));
  batch(city, tanks, surface(0x6a4a30, 1));
  batch(city, lids, surface(0x4a3423, 1));
  batch(city, aerials, surface(0x333333, 0.6, { metalness: 0.5 }));
}

function sign(city, position, yaw, dimensions, words, colors, roughness = 0.7) {
  const map = letteredMap(...words, ...colors);
  mount(city, plane(...dimensions), surface(0xffffff, roughness, { map }), position, { yaw });
}

function solid(city, dimensions, color, position, options = {}) {
  mount(city, cuboid(...dimensions), surface(color, 0.9), position, { receive: true, ...options });
}

function addSignsAndPier(city, barriers) {
  solid(city, [30, 9, 18], 0x4a6a8a, [-155, 4.5, -155], { shadows: true });
  sign(city, [-170.5, 6.5, -155], -RIGHT_ANGLE, [26, 5],
    ["VERA'S GARAGE", 'REPAIRS • TOWING • NO QUESTIONS'], ['#24344a', '#ffd75e'], 0.8);
  footprint(barriers, -155, -155, 15, 9);
  const rubber = cylinder(0.85, 0.85, 0.5, 12);
  const stacks = [[-138, -148], [-138, -144], [-141, -146]];
  batch(city, stacks.flatMap(([east, south]) =>
    [0.25, 0.75, 1.25].map(level => part(rubber, east, level, south))), surface(0x1c1e22, 1));

  const billboardPosts = [];
  const ads = [
    [-31, -31, 0, 'SOLMAR BAY', 'SUN • SEA • SPEED'],
    [93, -93, RIGHT_ANGLE, 'COMET GT', '0–60 IN 3.1 SECONDS'],
  ];
  for (const [east, south, yaw, title, subtitle] of ads) {
    sign(city, [east, 26, south], yaw, [24, 6], [title, subtitle], ['#20242c', '#f2f2f2']);
    billboardPosts.push(part(cuboid(1.2, 26, 1.2), east, 13, south + (yaw ? 0 : 0.4)));
  }
  batch(city, billboardPosts, surface(0x333333, 0.8));

  const wayfinding = [
    [4, 58, 0, 'OCEAN AVE'], [58, -4, RIGHT_ANGLE, 'PALM ST'],
    [-58, 4, -RIGHT_ANGLE, 'VERA WAY'], [-4, -58, 2 * RIGHT_ANGLE, 'PIER 9'],
  ];
  for (const [east, south, yaw, label] of wayfinding) {
    sign(city, [east, 5.4, south], yaw, [9, 2.2], [label, ''], ['#1d5a2e', '#f2f2f2']);
    solid(city, [0.18, 5.4, 0.18], 0x3a3f46, [east, 2.7, south]);
  }

  const decking = cuboid(6, 0.4, 2.8);
  const boards = [];
  for (let shoreward = CONFIG.beachZ; shoreward <= 234; shoreward += 3) {
    boards.push(part(decking, 30, 0.35, shoreward));
  }
  batch(city, boards, surface(PALETTE.pier, 1));
  const handrail = cuboid(0.3, 1.1, 38);
  batch(city, [26.6, 33.4].map(east => part(handrail, east, 0.9, 215)), surface(0x6a4a30, 1));
  solid(city, [7, 5, 6], 0x7a5a38, [30, 2.5, 232]);
  solid(city, [7.6, 0.5, 6.6], 0x5a4028, [30, 5.2, 232]);
}

function addSignals(city) {
  const corners = Array.from(gridPoints(AVENUES));
  const lamps = cylinder(0.14, 0.18, 7, 8);
  const lantern = cuboid(1.6, 0.3, 0.7);
  batch(city, corners.map(([east, south]) => part(lamps, east + 8, 3.5, south + 8)),
    surface(PALETTE.lamp, 0.6, { metalness: 0.5 }));
  batch(city, corners.map(([east, south]) => part(lantern, east + 7.2, 7, south + 8)),
    surface(0xfff2c0, 1, { emissive: 0xffdf80, emissiveIntensity: 0.9 }));

  const junctions = Array.from(gridPoints(DOWNTOWN));
  const signalPart = (geometry, height, offset = 0) => junctions.map(([east, south]) =>
    part(geometry, east - 8, height, south - 8 + offset));
  batch(city, signalPart(cylinder(0.12, 0.16, 6.5, 8), 3.25), surface(0x2e3238, 0.6, { metalness: 0.5 }));
  batch(city, signalPart(cuboid(0.9, 2.4, 0.7), 6.8), surface(0x1c1e22, 0.7));
  batch(city, signalPart(cuboid(0.5, 0.5, 0.1), 6.1, 0.36),
    surface(0x58c96b, 1, { emissive: 0x2fae4e, emissiveIntensity: 1.2 }));
}

function scatter(city, spots, geometry, elevation, material) {
  batch(city, spots.map(([east, south]) => part(geometry, east, elevation, south)), material);
}

function addStreetFurniture(city) {
  const meters = [[-52, -18], [-52, 18], [10, -52], [-18, 52], [74, -18], [74, 18], [136, -52], [-136, 52], [198, -18], [-198, 18]];
  scatter(city, meters, cylinder(0.07, 0.1, 1.25, 7), 0.63, surface(0x50565a, 0.55, { metalness: 0.65 }));
  scatter(city, meters, cuboid(0.32, 0.38, 0.24), 1.42, surface(0xd8d1bd, 0.45, { metalness: 0.35 }));

  const benches = [
    [-48, -12, 0], [-48, 12, 0], [14, -48, 1], [-14, 48, 1],
    [78, -12, 0], [78, 12, 0], [140, -48, 1], [-140, 48, 1],
  ];
  const seat = cuboid(3.8, 0.18, 0.82);
  const leg = cuboid(0.18, 0.58, 0.62);
  batch(city, benches.map(([east, south, facing]) =>
    part(seat, east, 0.62, south, { ry: facing * RIGHT_ANGLE })), surface(0x765438, 0.9));
  batch(city, benches.flatMap(([east, south, facing]) => {
    const heading = facing * RIGHT_ANGLE;
    return SIDES.map(side => {
      const spacing = side * 1.35;
      return part(leg, east + Math.cos(heading) * spacing, 0.3, south - Math.sin(heading) * spacing, { ry: heading });
    });
  }), surface(0x35383a, 0.7, { metalness: 0.4 }));
}

function addParkedCars(city) {
  const pigments = [0xc23b2e, 0xe8c832, 0x2e6fc2, 0xd8d8d8];
  const bodies = pigments.map(() => []);
  const glass = [];
  const wheels = [];
  const wheel = cylinder(0.36, 0.36, 0.28, 10).rotateZ(RIGHT_ANGLE);
  const chassis = cuboid(1.85, 0.62, 4);
  const cabin = cuboid(1.48, 0.5, 1.8);
  const windshield = cuboid(1.32, 0.3, 1.55);
  const spaces = [
    [-48, -13, 0, 0], [-48, 13, 2, 2], [14, -48, 1, 1],
    [76, 13, 3, 2], [138, -48, 0, 1], [-138, 48, 2, -1],
  ];
  for (const [east, south, pigment, quarterTurns] of spaces) {
    const rotation = { ry: quarterTurns * RIGHT_ANGLE };
    bodies[pigment].push(part(chassis, east, 0.62, south, rotation),
      part(cabin, east, 1.17, south - 0.15, rotation));
    glass.push(part(windshield, east, 1.2, south - 0.15, rotation));
    for (const [side, end] of gridPoints(SIDES)) {
      wheels.push(part(wheel, east + side * 0.9, 0.38, south + end * 1.25, rotation));
    }
  }
  pigments.forEach((color, index) => batch(city, bodies[index], surface(color, 0.34, { metalness: 0.42 })));
  batch(city, glass, surface(0x293c49, 0.18, { metalness: 0.4 }));
  batch(city, wheels, surface(0x17191c, 0.95));
}

function addUtilityProps(city) {
  const hydrants = [
    [-54, -54], [70, -54], [-54, 70], [70, 70], [-116, 8], [8, -116],
    [116, -8], [-8, 116], [-178, -54], [54, 178], [178, 54], [-54, -178],
  ];
  const stem = cylinder(0.32, 0.38, 0.9, 8);
  const cap = sphere(0.32, 8, 6);
  batch(city, hydrants.flatMap(([east, south]) =>
    [part(stem, east, 0.45, south), part(cap, east, 1, south)]), surface(0xc23b2e, 0.6));
  const bins = [[-70, -8], [8, -70], [70, 8], [-8, 70], [-130, 54], [54, 130], [130, -54], [-54, -130]];
  scatter(city, bins, cylinder(0.45, 0.4, 1.1, 10), 0.55, surface(0x3a4a3a, 0.8, { metalness: 0.3 }));
}

function addPalms(city, random) {
  const grove = [];
  for (let coast = -200; coast <= 200; coast += 22) {
    if (Math.abs(coast - 30) >= 8) {
      grove.push([coast + random.range(-4, 4), 202 + random.range(-2, 4)]);
    }
  }
  grove.push([-18, -14], [18, 14], [-14, 18], [14, -18]);
  const medianRows = [-170, -108, -46, 46, 108, 170];
  grove.push(...medianRows.flatMap(south => [[-8, south], [8, south]]));
  const bark = cylinder(0.22, 0.34, 6.5, 7);
  const leaf = cone(0.9, 4.2, 4);
  const frondAngles = Array.from({ length: 6 }, (_, index) => ({
    ry: index / 6 * TURN, rz: RIGHT_ANGLE + 0.5, sz: 0.28,
  }));
  batch(city, grove.map(([east, south]) => part(bark, east, 3.25, south, { rz: 0.08 })),
    surface(PALETTE.palmTrunk, 1), true);
  batch(city, grove.flatMap(([east, south]) =>
    frondAngles.map(angles => part(leaf, east, 6.6, south, angles))), surface(PALETTE.palmLeaf, 0.9));
}

function addPlaza(city) {
  const seating = [[-10, 0, 0], [10, 0, 0], [0, -10, 1], [0, 10, 1], [-16, -16, 0.5], [16, 16, 0.5]];
  const bench = cuboid(5, 0.5, 1.6);
  batch(city, seating.map(([east, south, turn]) =>
    part(bench, east, 0.6, south, { ry: turn * RIGHT_ANGLE })), surface(0x7a5a38, 1));
  const beds = [[-16, 0], [16, 0], [0, -16], [0, 16], [-8, -8], [8, 8]];
  scatter(city, beds, cuboid(2.2, 0.9, 2.2), 0.45, surface(0x8a7a68, 1));
  scatter(city, beds, sphere(0.5, 8, 6), 1.1, surface(0xe87b9a, 0.8));
  const cafe = [[-14, 10], [14, -10], [-10, -14], [10, 14]];
  scatter(city, cafe, cylinder(0.08, 0.08, 3, 6), 1.5, surface(0x5a4a3a, 0.9));
  scatter(city, cafe, cone(2.6, 1.1, 8), 3.4, surface(0xc23b2e, 0.85));
  const fountainStone = [
    part(cylinder(4, 4.4, 1, 20), 0, 0.5, 0),
    part(cylinder(4.5, 4.5, 0.5, 20), 0, 0.25, 0),
  ];
  batch(city, fountainStone, surface(0x9aa4ac, 0.7), true);
  mount(city, cylinder(3.5, 3.5, 0.3, 20), surface(0x4fa8c8, 0.2, { metalness: 0.2 }), [0, 1.05, 0]);
}

function addParking(city) {
  mount(city, plane(44, 44), surface(0x4a4f56, 0.95), [GRID, 0.12, GRID],
    { pitch: -RIGHT_ANGLE, receive: true });
  const stripe = plane(0.35, 9);
  const lines = Array.from({ length: 6 }, (_, bay) =>
    part(stripe, 48 + 5.6 * bay, 0.16, GRID, { rx: -RIGHT_ANGLE }));
  batch(city, lines, flat({ color: 0xe8e8e8 }));
}

function addBeach(city, barriers) {
  const towels = [[-80, 206], [-40, 210], [70, 208], [110, 206], [-140, 208], [150, 210]];
  scatter(city, towels, cylinder(0.07, 0.07, 2.6, 6), 1.3, surface(0x8a7a68, 1));
  const umbrellas = new Map();
  const canvas = cone(2.2, 1, 8);
  for (const [east, south] of towels) {
    const color = (east + south) % 2 ? 0xe87b28 : 0x2e8f8a;
    bucket(umbrellas, color).push(part(canvas, east, 2.9, south));
  }
  for (const [color, patches] of umbrellas) batch(city, patches, surface(color, 0.85));
  const stilts = [[-62, 203], [-58, 203], [-62, 207], [-58, 207]];
  scatter(city, stilts, cuboid(0.3, 4, 0.3), 2, surface(0x8a7a68, 1));
  solid(city, [4.4, 2.2, 4], 0xf2f2f2, [-60, 5, 205], { shadows: true });
  solid(city, [5, 0.4, 4.6], 0xc23b2e, [-60, 6.3, 205]);
  footprint(barriers, -60, 205, 2.5, 2.5);
}

function addMarina(city, barriers, random) {
  const fleet = [0xd8d8d8, 0x2e6fc2, 0xc23b2e];
  const wheelhouses = [];
  const yaw = 0.12;
  const cabin = cuboid(3, 1.4, 4);
  fleet.forEach((paint, index) => {
    const dockEast = 196 + random.range(-3, 3);
    const dockSouth = 128 + 20 * index;
    solid(city, [4, 1.6, 12], paint, [dockEast, 1.6, dockSouth], { yaw, shadows: true });
    wheelhouses.push(part(cabin, dockEast, 3, dockSouth - 1, { ry: yaw }));
    footprint(barriers, dockEast, dockSouth, 2.5, 6.5);
  });
  batch(city, wheelhouses, surface(0xf2f2f2, 0.7));
  sign(city, [188, 5, 150], -RIGHT_ANGLE, [20, 4],
    ['SOLMAR MARINA', 'BOATS • STORAGE • NO QUESTIONS'], ['#1d3a4a', '#9fd8e8'], 0.8);
  const cargo = Array.from({ length: 5 }, () => {
    const edge = random.range(1.5, 2.5);
    return part(cuboid(edge, edge, edge), 186 + random.range(-4, 6), edge / 2, 118 + random.range(0, 60));
  });
  batch(city, cargo, surface(0x8a6a42, 1));
}

function addCloudLayer(city, random) {
  const lobes = Array.from({ length: 4 }, (_, index) =>
    xform(sphere(random.range(5, 10), 10, 8), index * 6 - 9, random.range(-1, 1),
      random.range(-2, 2), 0, 0, 0, 1, 0.42, 1));
  const cloudMaterial = surface(0xffffff, 1, { transparent: true, opacity: 0.88 });
  const layer = new Three.InstancedMesh(mergeGeometries(lobes), cloudMaterial, 16);
  const tints = [0xfffaf3, 0xf4f8ff, 0xfff0e6].map(color => new Three.Color(color));
  const matrix = new Three.Matrix4();
  const positions = Array.from({ length: layer.count }, (_, index) => {
    const coordinates = [random.range(-220, 220), random.range(58, 92), random.range(-220, 220)];
    layer.setMatrixAt(index, matrix.makeTranslation(...coordinates));
    layer.setColorAt(index, tints[index % tints.length]);
    return coordinates;
  });
  layer.instanceColor.needsUpdate = true;
  layer.instanceMatrix.needsUpdate = true;
  city.add(layer);
  return elapsed => {
    positions.forEach((coordinates, index) => {
      const east = coordinates[0] + elapsed * 1.2;
      coordinates[0] = east > GROUND_SIZE / 2 ? -GROUND_SIZE / 2 : east;
      layer.setMatrixAt(index, matrix.makeTranslation(...coordinates));
    });
    layer.instanceMatrix.needsUpdate = true;
  };
}

function addSun(city) {
  const disk = mount(city, new Three.CircleGeometry(15, 24), flat({
    opacity: 0.84, color: 0xffcd96, fog: false, transparent: true, toneMapped: false,
  }), [15, 120, 300]);
  disk.lookAt(0, 0, 0);
}

function addAircraft(city) {
  const aircraft = new Three.Group();
  const enamel = surface(0xd4d9d7, 0.82);
  const frame = [
    [[5.8, 1.8, 2.5], [0, 0, 0]],
    [[5.8, 0.48, 0.58], [-5.3, 0.3, 0]],
    [[0.3, 1.6, 1.2], [-8, 0.9, 0]],
    ...SIDES.map(side => [[4.4, 0.12, 0.25], [0, -1.15, -1.05 * side]]),
  ];
  for (const [size, position] of frame) mount(aircraft, cuboid(...size), enamel, position);
  mount(aircraft, cuboid(5.9, 0.42, 2.58), surface(0x233c52, 0.78), [0, 0.25, 0]);
  const glass = surface(0x263f48, 0.48, { metalness: 0.04, emissive: 0x10191c, emissiveIntensity: 0.12 });
  mount(aircraft, cuboid(1.55, 1.05, 2.36), glass, [2.6, 0.24, 0]);
  const rotor = mount(aircraft, cuboid(12, 0.16, 0.42),
    surface(0x29343a, 0.82, { transparent: true, opacity: 0.42 }), [0, 1.2, 0]);
  mount(aircraft, cuboid(0.12, 2.2, 0.12), surface(0x29343a, 0.82), [-8.1, 0.8, 0]);

  const lamp = [0.35, -0.65, 0];
  mount(aircraft, sphere(0.28, 8, 6), flat({ color: 0xfff2c5, toneMapped: false }), lamp);
  const beam = { length: 8.2, tilt: 0.24 };
  const midpoint = [
    lamp[0] + Math.sin(beam.tilt) * beam.length / 2,
    lamp[1] - Math.cos(beam.tilt) * beam.length / 2,
    lamp[2],
  ];
  for (const [radius, facets, hue, opacity] of [[3, 24, 0xfff3c8, 0.35], [1.5, 20, 0xfff8df, 0.3]]) {
    mount(aircraft, cone(radius, beam.length, facets, 1, true), flat({
      color: hue, opacity, side: Three.DoubleSide, toneMapped: false, transparent: true, depthWrite: false,
    }), midpoint, { roll: beam.tilt });
  }
  aircraft.scale.setScalar(1.2);
  city.add(aircraft);
  return { aircraft, rotor };
}

function aviation(aircraft, rotor) {
  let orbit = { east: 0, south: 0, radius: 110, altitude: 55, heading: 0.6, rate: 0.045 };
  let chase;
  return {
    advance(elapsed) {
      const heading = orbit.heading + elapsed * orbit.rate;
      orbit.heading = heading;
      aircraft.position.set(
        orbit.east + orbit.radius * Math.cos(heading), orbit.altitude,
        orbit.south + orbit.radius * Math.sin(heading),
      );
      aircraft.rotation.y = -heading;
      rotor.rotation.y += 22 * elapsed;
    },
    followHeli(target, yaw, offset = {}) {
      const ahead = offset.forward ?? 12;
      const lateral = offset.side ?? 0;
      const altitude = offset.height ?? 8;
      chase = () => {
        const facing = yaw();
        const sine = Math.sin(facing);
        const cosine = Math.cos(facing);
        const east = target.x + sine * ahead + cosine * lateral;
        const south = target.z + cosine * ahead - sine * lateral;
        aircraft.position.set(east, altitude, south);
        aircraft.rotation.y = facing;
      };
    },
    updateHeliFollow() {
      chase?.();
    },
    setHeliOrbit(cx, cz, r, h, angle = 0.6, speed = 0.045) {
      orbit = { east: cx, south: cz, radius: r, altitude: h, heading: angle, rate: speed };
    },
  };
}

export function buildWorld(scene, rng) {
  const city = new Three.Group();
  const barriers = [];
  scene.add(city);
  const water = addTerrain(city, rng);
  addNeighborhoods(city, barriers, rng);
  addSignsAndPier(city, barriers);
  addSignals(city);
  addStreetFurniture(city);
  addParkedCars(city);
  addUtilityProps(city);
  addPalms(city, rng);
  addPlaza(city);
  addParking(city);
  addBeach(city, barriers);
  addMarina(city, barriers, rng);
  const blowClouds = addCloudLayer(city, rng);
  addSun(city);
  const { aircraft, rotor } = addAircraft(city);
  const flight = aviation(aircraft, rotor);
  return {
    group: city,
    colliders: barriers,
    streets: AVENUES,
    followHeli: flight.followHeli,
    updateHeliFollow: flight.updateHeliFollow,
    setHeliOrbit: flight.setHeliOrbit,
    update(dt) {
      blowClouds(dt);
      water.offset.x += 0.008 * dt;
      flight.advance(dt);
    },
  };
}

export function resolveCircle(x, z, radius, colliders) {
  const reachSquared = radius * radius;
  for (const bounds of colliders) {
    const { minX, minZ, maxX, maxZ } = bounds;
    const east = x - limit(x, minX, maxX);
    const south = z - limit(z, minZ, maxZ);
    const separation = east * east + south * south;
    if (separation >= reachSquared) continue;
    if (separation >= 1e-6) {
      const distance = Math.sqrt(separation);
      const correction = (radius - distance) / distance;
      x += correction * east;
      z += correction * south;
      continue;
    }
    const west = x - minX;
    const north = z - minZ;
    const right = maxX - x;
    const bottom = maxZ - z;
    const shallowest = Math.min(west, right, north, bottom);
    switch (shallowest) {
      case west: x = minX - radius; break;
      case right: x = maxX + radius; break;
      case north: z = minZ - radius; break;
      default: z = maxZ + radius;
    }
  }
  return { z, x };
}

export function clampBounds(x, z) {
  const extent = CONFIG.cityHalf;
  return { x: limit(x, -extent, extent), z: limit(z, -extent, GROUND_SIZE / 2 - 4) };
}

export function nearestStreetPoint(x, z, rng) {
  let distance = Infinity;
  let result = null;
  for (const center of AVENUES) {
    const eastDistance = Math.abs(center - x);
    if (eastDistance < distance) {
      distance = eastDistance;
      result = { x: center, z, axis: 'z' };
    }
    const southDistance = Math.abs(center - z);
    if (southDistance < distance) {
      distance = southDistance;
      result = { x, z: center, axis: 'x' };
    }
  }
  return result;
}
