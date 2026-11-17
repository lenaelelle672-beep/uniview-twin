import { courtyardHole, outset, podiumFocus, podiumOutline, PODIUM_HEIGHT_M } from '../scene/massing'
import { PODIUM_SOUTH_ADDON } from '../scene/shell/rings'
import {
  COURT_CURB_HEIGHT_M,
  COURT_CURB_WIDTH_M,
  COURT_CURB_Y_M,
  COURT_DEPTH_M,
  COURT_PLANT_LIFT_M,
  COURT_PLANT_MARGIN_M,
  COURT_STEP_COUNT,
  COURT_STEP_TOP_Y_M,
  EAVE_HEIGHT_M,
  EAVE_OUTSET_M,
  ROOF_GRASS_INSET_M,
  ROOF_GRASS_THICKNESS_M,
  courtStepInset,
  courtStepRiseM,
  offsetToward,
  ringCentroid,
} from './plan'

export interface MeshArrays {
  positions: number[]
  normals: number[]
  uvs: number[]
  indices: number[]
}

function emptyMesh(): MeshArrays {
  return { positions: [], normals: [], uvs: [], indices: [] }
}

function pushVertex(mesh: MeshArrays, x: number, y: number, z: number) {
  const index = mesh.positions.length / 3
  mesh.positions.push(x, y, z)
  mesh.uvs.push(x, -z)
  mesh.normals.push(0, 0, 0)
  return index
}

function addTriangle(mesh: MeshArrays, a: number, b: number, c: number) {
  const px = mesh.positions
  const ax = px[a * 3] ?? 0
  const ay = px[a * 3 + 1] ?? 0
  const az = px[a * 3 + 2] ?? 0
  const bx = px[b * 3] ?? 0
  const by = px[b * 3 + 1] ?? 0
  const bz = px[b * 3 + 2] ?? 0
  const cx = px[c * 3] ?? 0
  const cy = px[c * 3 + 1] ?? 0
  const cz = px[c * 3 + 2] ?? 0
  const abx = bx - ax
  const aby = by - ay
  const abz = bz - az
  const acx = cx - ax
  const acy = cy - ay
  const acz = cz - az
  const nx = aby * acz - abz * acy
  const ny = abz * acx - abx * acz
  const nz = abx * acy - aby * acx
  mesh.indices.push(a, b, c)
  for (const i of [a, b, c]) {
    mesh.normals[i * 3] = (mesh.normals[i * 3] ?? 0) + nx
    mesh.normals[i * 3 + 1] = (mesh.normals[i * 3 + 1] ?? 0) + ny
    mesh.normals[i * 3 + 2] = (mesh.normals[i * 3 + 2] ?? 0) + nz
  }
}

function normalizeNormals(mesh: MeshArrays) {
  for (let i = 0; i < mesh.normals.length; i += 3) {
    const nx = mesh.normals[i] ?? 0
    const ny = mesh.normals[i + 1] ?? 0
    const nz = mesh.normals[i + 2] ?? 0
    const len = Math.hypot(nx, ny, nz) || 1
    mesh.normals[i] = nx / len
    mesh.normals[i + 1] = ny / len
    mesh.normals[i + 2] = nz / len
  }
}

function area2(points: Array<[number, number]>): number {
  let sum = 0
  const n = points.length
  for (let i = 0; i < n; i += 1) {
    const [x1, z1] = points[i] ?? [0, 0]
    const [x2, z2] = points[(i + 1) % n] ?? [0, 0]
    sum += x1 * z2 - x2 * z1
  }
  return sum
}

function isCCW(points: Array<[number, number]>): boolean {
  return area2(points) > 0
}

function pointInTri(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
): boolean {
  const s = (ax - cx) * (pz - cz) - (az - cz) * (px - cx)
  const t = (bx - ax) * (pz - az) - (bz - az) * (px - ax)
  if (s < 0 !== t < 0 && s !== 0 && t !== 0) return false
  const d = (cx - bx) * (pz - bz) - (cz - bz) * (px - bx)
  return d === 0 || d < 0 === s + t <= 0
}

/** 简单耳切。轮廓已在 plan.test 里保证不自交。 */
function triangulate(points: Array<[number, number]>): number[] {
  const n0 = points.length
  if (n0 < 3) return []
  const ccw = isCCW(points)
  const idx: number[] = []
  for (let i = 0; i < n0; i += 1) idx.push(i)
  const faces: number[] = []
  let guard = 0
  while (idx.length > 3 && guard < n0 * n0) {
    guard += 1
    let cut = false
    for (let i = 0; i < idx.length; i += 1) {
      const prev = idx[(i + idx.length - 1) % idx.length] ?? 0
      const curr = idx[i] ?? 0
      const next = idx[(i + 1) % idx.length] ?? 0
      const [ax, az] = points[prev] ?? [0, 0]
      const [bx, bz] = points[curr] ?? [0, 0]
      const [cx, cz] = points[next] ?? [0, 0]
      const cross = (bx - ax) * (cz - az) - (bz - az) * (cx - ax)
      if (ccw ? cross <= 1e-8 : cross >= -1e-8) continue
      let inside = false
      for (const other of idx) {
        if (other === prev || other === curr || other === next) continue
        const [px, pz] = points[other] ?? [0, 0]
        if (pointInTri(px, pz, ax, az, bx, bz, cx, cz)) {
          inside = true
          break
        }
      }
      if (inside) continue
      if (ccw) faces.push(prev, curr, next)
      else faces.push(prev, next, curr)
      idx.splice(i, 1)
      cut = true
      break
    }
    if (!cut) break
  }
  if (idx.length === 3) {
    const [a, b, c] = idx
    if (a != null && b != null && c != null) {
      if (ccw) faces.push(a, b, c)
      else faces.push(a, c, b)
    }
  }
  return faces
}

function addSlab(mesh: MeshArrays, points: Array<[number, number]>, y0: number, y1: number, cap: 'top' | 'both') {
  const top = points.map(([x, z]) => pushVertex(mesh, x, y1, z))
  const faces = triangulate(points)
  for (let i = 0; i < faces.length; i += 3) {
    addTriangle(mesh, top[faces[i] ?? 0] ?? 0, top[faces[i + 1] ?? 0] ?? 0, top[faces[i + 2] ?? 0] ?? 0)
  }
  if (cap === 'both' && Math.abs(y1 - y0) > 1e-4) {
    const bottom = points.map(([x, z]) => pushVertex(mesh, x, y0, z))
    for (let i = 0; i < faces.length; i += 3) {
      addTriangle(mesh, bottom[faces[i] ?? 0] ?? 0, bottom[faces[i + 2] ?? 0] ?? 0, bottom[faces[i + 1] ?? 0] ?? 0)
    }
    const count = points.length
    for (let i = 0; i < count; i += 1) {
      const j = (i + 1) % count
      const a = pushVertex(mesh, points[i]?.[0] ?? 0, y0, points[i]?.[1] ?? 0)
      const b = pushVertex(mesh, points[j]?.[0] ?? 0, y0, points[j]?.[1] ?? 0)
      const c = pushVertex(mesh, points[j]?.[0] ?? 0, y1, points[j]?.[1] ?? 0)
      const d = pushVertex(mesh, points[i]?.[0] ?? 0, y1, points[i]?.[1] ?? 0)
      addTriangle(mesh, a, b, c)
      addTriangle(mesh, a, c, d)
    }
  }
}

function addBand(mesh: MeshArrays, outer: Array<[number, number]>, inner: Array<[number, number]>, y: number, thickness: number) {
  const count = Math.min(outer.length, inner.length)
  if (count < 3) return
  const y1 = y + thickness
  for (let i = 0; i < count; i += 1) {
    const j = (i + 1) % count
    const ox0 = outer[i]?.[0] ?? 0
    const oz0 = outer[i]?.[1] ?? 0
    const ox1 = outer[j]?.[0] ?? 0
    const oz1 = outer[j]?.[1] ?? 0
    const ix0 = inner[i]?.[0] ?? 0
    const iz0 = inner[i]?.[1] ?? 0
    const ix1 = inner[j]?.[0] ?? 0
    const iz1 = inner[j]?.[1] ?? 0
    const a = pushVertex(mesh, ox0, y1, oz0)
    const b = pushVertex(mesh, ox1, y1, oz1)
    const c = pushVertex(mesh, ix1, y1, iz1)
    const d = pushVertex(mesh, ix0, y1, iz0)
    addTriangle(mesh, a, b, c)
    addTriangle(mesh, a, c, d)
    if (thickness > 1e-4) {
      const e = pushVertex(mesh, ox0, y, oz0)
      const f = pushVertex(mesh, ox1, y, oz1)
      const g = pushVertex(mesh, ix1, y, iz1)
      const h = pushVertex(mesh, ix0, y, iz0)
      addTriangle(mesh, e, h, g)
      addTriangle(mesh, e, g, f)
    }
  }
}

function addWall(mesh: MeshArrays, ring: Array<[number, number]>, y0: number, y1: number) {
  const count = ring.length
  for (let i = 0; i < count; i += 1) {
    const j = (i + 1) % count
    const a = pushVertex(mesh, ring[i]?.[0] ?? 0, y0, ring[i]?.[1] ?? 0)
    const b = pushVertex(mesh, ring[j]?.[0] ?? 0, y0, ring[j]?.[1] ?? 0)
    const c = pushVertex(mesh, ring[j]?.[0] ?? 0, y1, ring[j]?.[1] ?? 0)
    const d = pushVertex(mesh, ring[i]?.[0] ?? 0, y1, ring[i]?.[1] ?? 0)
    addTriangle(mesh, a, b, c)
    addTriangle(mesh, a, c, d)
  }
}

function finish(mesh: MeshArrays): MeshArrays {
  normalizeNormals(mesh)
  return mesh
}

export function makeRoofGrassMesh(): MeshArrays {
  const focus = podiumFocus()
  const main = offsetToward(podiumOutline(), ROOF_GRASS_INSET_M, focus)
  const addonFocus = ringCentroid(PODIUM_SOUTH_ADDON)
  const addon = offsetToward(PODIUM_SOUTH_ADDON, Math.min(ROOF_GRASS_INSET_M, 0.3), addonFocus)
  const mesh = emptyMesh()
  addSlab(mesh, main, PODIUM_HEIGHT_M, PODIUM_HEIGHT_M + ROOF_GRASS_THICKNESS_M, 'both')
  addSlab(mesh, addon, PODIUM_HEIGHT_M, PODIUM_HEIGHT_M + ROOF_GRASS_THICKNESS_M, 'both')
  return finish(mesh)
}

export function makeAddonEaveMesh(): MeshArrays {
  const focus = podiumFocus()
  const ring = outset(PODIUM_SOUTH_ADDON, EAVE_OUTSET_M, focus)
  const y0 = 0
  const mesh = emptyMesh()
  addSlab(mesh, ring, y0, EAVE_HEIGHT_M, 'both')
  return finish(mesh)
}

export function makeCourtCurbMesh(): MeshArrays {
  const ring = courtyardHole()
  const focus = ringCentroid(ring)
  const outer = offsetToward(ring, -COURT_CURB_WIDTH_M / 2, focus)
  const inner = offsetToward(ring, COURT_CURB_WIDTH_M / 2, focus)
  const mesh = emptyMesh()
  addBand(mesh, outer, inner, COURT_CURB_Y_M, COURT_CURB_HEIGHT_M)
  addWall(mesh, outer, COURT_CURB_Y_M, COURT_CURB_Y_M + COURT_CURB_HEIGHT_M)
  addWall(mesh, inner, COURT_CURB_Y_M, COURT_CURB_Y_M + COURT_CURB_HEIGHT_M)
  return finish(mesh)
}

export function makeCourtTreadMesh(): MeshArrays {
  const ring = courtyardHole()
  const focus = ringCentroid(ring)
  const rise = courtStepRiseM()
  const mesh = emptyMesh()
  for (let i = 0; i < COURT_STEP_COUNT; i += 1) {
    const outer = offsetToward(ring, courtStepInset(i), focus)
    const inner = offsetToward(ring, courtStepInset(i + 1), focus)
    const y = COURT_STEP_TOP_Y_M - i * rise
    addBand(mesh, outer, inner, y - 0.06, 0.06)
  }
  return finish(mesh)
}

export function makeCourtRiserMesh(): MeshArrays {
  const ring = courtyardHole()
  const focus = ringCentroid(ring)
  const rise = courtStepRiseM()
  const mesh = emptyMesh()
  for (let i = 0; i < COURT_STEP_COUNT; i += 1) {
    const inner = offsetToward(ring, courtStepInset(i + 1), focus)
    const y1 = COURT_STEP_TOP_Y_M - i * rise
    const y0 = i === COURT_STEP_COUNT - 1 ? -COURT_DEPTH_M : COURT_STEP_TOP_Y_M - (i + 1) * rise
    addWall(mesh, inner, y0, y1)
  }
  return finish(mesh)
}

export function makeCourtPlantMesh(): MeshArrays {
  const ring = courtyardHole()
  const focus = ringCentroid(ring)
  const outer = offsetToward(ring, courtStepInset(COURT_STEP_COUNT) + COURT_PLANT_MARGIN_M, focus)
  const inner = offsetToward(ring, courtStepInset(COURT_STEP_COUNT) + COURT_PLANT_MARGIN_M + 2.4, focus)
  const mesh = emptyMesh()
  addBand(mesh, outer, inner, -COURT_DEPTH_M, COURT_PLANT_LIFT_M)
  return finish(mesh)
}

export function meshBounds(mesh: MeshArrays) {
  let minX = Infinity
  let minY = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let maxZ = -Infinity
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const x = mesh.positions[i] ?? 0
    const y = mesh.positions[i + 1] ?? 0
    const z = mesh.positions[i + 2] ?? 0
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    minZ = Math.min(minZ, z)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
    maxZ = Math.max(maxZ, z)
  }
  return { minX, minY, minZ, maxX, maxY, maxZ }
}

export function meshVertexCount(mesh: MeshArrays): number {
  return mesh.positions.length / 3
}
