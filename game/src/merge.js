import * as Engine from "../vendor/three.module.min.js";
export function mergeGeometries(geoms) {
  const pieces = geoms.map((source) => source.index ? source.toNonIndexed() : source.clone());
  const output = new Engine.BufferGeometry();
  const widths = { position: 3, normal: 3, uv: 2 };
  const vertexCount = pieces.reduce((total, geometry) => total + geometry.getAttribute("position").count, 0);
  for (const [key, width] of Object.entries(widths)) {
    if (key !== "position" && !pieces.some((geometry) => geometry.hasAttribute(key))) continue;
    const merged = new Float32Array(vertexCount * width);
    let start = 0;
    for (const geometry of pieces) {
      const count = geometry.getAttribute("position").count;
      const source = geometry.getAttribute(key);
      if (source) {
        for (let vertex = 0; vertex < count; vertex++) {
          for (let axis = 0; axis < width; axis++) merged[start + vertex * width + axis] = source.getComponent(vertex, axis);
        }
      }
      start += count * width;
    }
    output.setAttribute(key, new Engine.BufferAttribute(merged, width));
  }
  pieces.forEach((geometry) => geometry.dispose());
  return output;
}
export function xform(geo, px, py, pz, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const place = new Engine.Vector3(px, py, pz);
  const orient = new Engine.Quaternion().setFromEuler(new Engine.Euler(rx, ry, rz, "XYZ"));
  const size = new Engine.Vector3(sx, sy, sz);
  return geo.applyMatrix4(new Engine.Matrix4().compose(place, orient, size));
}
function triple(value, fallback) {
  if (value == null) return fallback;
  if (Array.isArray(value)) return [value[0] ?? fallback[0], value[1] ?? fallback[1], value[2] ?? fallback[2]];
  return [value.x ?? fallback[0], value.y ?? fallback[1], value.z ?? fallback[2]];
}
export function mergedMesh(entries, material, opts = {}) {
  const prepared = entries.map((entry) => {
    const position = triple(entry.position, [entry.x ?? 0, entry.y ?? 0, entry.z ?? 0]);
    const rotation = triple(entry.rotation, [entry.rx ?? 0, entry.ry ?? 0, entry.rz ?? 0]);
    const scale = triple(entry.scale, [entry.sx ?? 1, entry.sy ?? 1, entry.sz ?? 1]);
    return xform(entry.geo.clone(), ...position, ...rotation, ...scale);
  });
  const mesh = new Engine.Mesh(mergeGeometries(prepared), material);
  prepared.forEach((geometry) => geometry.dispose());
  mesh.receiveShadow = true;
  mesh.castShadow = opts.cast === true;
  return mesh;
}
