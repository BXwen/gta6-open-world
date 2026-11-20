// Geometry helpers for Solmar Bay: merge static boxes/cylinders/cones into a
// few draw calls, and apply transforms to geometries before merging.
// Written for this game; no outside code.

import * as THREE from '../vendor/three.module.min.js';

// Concatenate indexed geometries that share position/normal/uv attributes
// (Box, Cylinder, Cone, Sphere, Plane all qualify). Returns one geometry.
export function mergeGeometries(geoms) {
  let vCount = 0;
  let iCount = 0;
  for (const g of geoms) {
    vCount += g.attributes.position.count;
    iCount += g.index ? g.index.count : 0;
  }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const idx = new Uint32Array(iCount);
  let vo = 0;
  let io = 0;
  for (const g of geoms) {
    const p = g.attributes.position.array;
    const n = g.attributes.normal.array;
    const u = g.attributes.uv.array;
    pos.set(p, vo * 3);
    nor.set(n, vo * 3);
    uv.set(u, vo * 2);
    if (g.index) {
      const gi = g.index.array;
      for (let i = 0; i < gi.length; i += 1) idx[io + i] = gi[i] + vo;
      io += gi.length;
    }
    vo += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

// Apply a transform to a geometry in place (same compose as a mesh:
// translate, rotate (Euler XYZ), scale). Returns the geometry.
export function xform(geo, px, py, pz, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));
  m.compose(new THREE.Vector3(px, py, pz), q, new THREE.Vector3(sx, sy, sz));
  geo.applyMatrix4(m);
  return geo;
}

// Build one mesh from a list of {geo, ...transform} entries sharing one
// material. Each entry's geometry is cloned, transformed and merged.
export function mergedMesh(entries, material, opts = {}) {
  const geoms = entries.map((e) => xform(e.geo.clone(), e.x || 0, e.y || 0, e.z || 0, e.rx || 0, e.ry || 0, e.rz || 0, e.sx || 1, e.sy || 1, e.sz || 1));
  const mesh = new THREE.Mesh(mergeGeometries(geoms), material);
  mesh.castShadow = opts.cast === true;
  mesh.receiveShadow = opts.receive !== false;
  return mesh;
}
