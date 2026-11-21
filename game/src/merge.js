// Geometry assembly helpers shared by the world and vehicle renderers.
import * as Three from '../vendor/three.module.min.js';

export function mergeGeometries(geoms) {
  const vertexTotal = geoms.reduce((sum, item) => sum + item.attributes.position.count, 0);
  const triangleTotal = geoms.reduce((sum, item) => sum + (item.index ? item.index.count : item.attributes.position.count), 0);
  const positions = new Float32Array(vertexTotal * 3);
  const normals = new Float32Array(vertexTotal * 3);
  const textureCoords = new Float32Array(vertexTotal * 2);
  const indices = new Uint32Array(triangleTotal);
  let vertexBase = 0;
  let indexBase = 0;

  for (const geometry of geoms) {
    const positionAttr = geometry.attributes.position;
    const normalAttr = geometry.attributes.normal;
    const uvAttr = geometry.attributes.uv;
    const vertices = positionAttr.count;
    positions.set(positionAttr.array, vertexBase * 3);
    normals.set(normalAttr.array, vertexBase * 3);
    textureCoords.set(uvAttr.array, vertexBase * 2);

    if (geometry.index) {
      const sourceIndex = geometry.index.array;
      for (let cursor = 0; cursor < sourceIndex.length; cursor += 1) {
        indices[indexBase + cursor] = vertexBase + sourceIndex[cursor];
      }
      indexBase += sourceIndex.length;
    } else {
      for (let cursor = 0; cursor < vertices; cursor += 1) {
        indices[indexBase + cursor] = vertexBase + cursor;
      }
      indexBase += vertices;
    }
    vertexBase += vertices;
  }

  const merged = new Three.BufferGeometry();
  merged.setAttribute('position', new Three.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new Three.BufferAttribute(normals, 3));
  merged.setAttribute('uv', new Three.BufferAttribute(textureCoords, 2));
  merged.setIndex(new Three.BufferAttribute(indices, 1));
  return merged;
}

export function xform(geo, px, py, pz, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const rotation = new Three.Euler(rx, ry, rz);
  const orientation = new Three.Quaternion().setFromEuler(rotation);
  const offset = new Three.Vector3(px, py, pz);
  const dimensions = new Three.Vector3(sx, sy, sz);
  return geo.applyMatrix4(new Three.Matrix4().compose(offset, orientation, dimensions));
}

export function mergedMesh(entries, material, opts = {}) {
  const geometries = [];
  for (const part of entries) {
    const copy = part.geo.clone();
    xform(copy,
      part.x ?? 0, part.y ?? 0, part.z ?? 0,
      part.rx ?? 0, part.ry ?? 0, part.rz ?? 0,
      part.sx ?? 1, part.sy ?? 1, part.sz ?? 1);
    geometries.push(copy);
  }
  const object = new Three.Mesh(mergeGeometries(geometries), material);
  object.castShadow = opts.cast === true;
  object.receiveShadow = opts.receive !== false;
  return object;
}
