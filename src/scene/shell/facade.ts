import { PlaneGeometry, Vector3, type BufferGeometry, type NormalBufferAttributes } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Ring } from './rings'

export const TOWER_BAND = 0.78

function faceOutward(geometry: PlaneGeometry, outward: Vector3) {
  const attribute = geometry.getAttribute('normal') as NormalBufferAttributes['normal']
  const normal = new Vector3().fromBufferAttribute(attribute, 0)
  if (normal.dot(outward) >= 0) return
  const index = geometry.getIndex()
  if (!index) throw new Error('幕墙缺少索引，无法翻转绕序')
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i)
    const c = index.getX(i + 2)
    index.setX(i, c)
    index.setX(i + 2, a)
  }
  geometry.computeVertexNormals()
}

export function ringCentroid(ring: Ring): [number, number] {
  const sx = ring.reduce((sum, [x]) => sum + x, 0)
  const sz = ring.reduce((sum, [, z]) => sum + z, 0)
  return [sx / ring.length, sz / ring.length]
}

function edgeOutward(a: [number, number], b: [number, number], centroid: [number, number]) {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const len = Math.hypot(dx, dz)
  const mx = (a[0] + b[0]) / 2
  const mz = (a[1] + b[1]) / 2
  if (len < 1e-3) return { len: 0, nx: 0, nz: 0, mx, mz }
  let nx = dz / len
  let nz = -dx / len
  if (nx * (mx - centroid[0]) + nz * (mz - centroid[1]) < 0) {
    nx = -nx
    nz = -nz
  }
  return { len, nx, nz, mx, mz }
}

/** 沿闭合折线立一圈朝外的幕墙平面。 */
export function createRingGlass(ring: Ring, elevation: number, height: number, inset = 0.06): BufferGeometry {
  const glassHeight = Math.max(height - TOWER_BAND, 0.2)
  const y = elevation + TOWER_BAND + glassHeight / 2
  const centroid = ringCentroid(ring)
  const parts: PlaneGeometry[] = []
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    const { len, nx, nz, mx, mz } = edgeOutward(a, b, centroid)
    if (len < 0.08) continue
    const plane = new PlaneGeometry(len, glassHeight)
    plane.rotateY(Math.atan2(nx, nz))
    plane.translate(mx - nx * inset, y, mz - nz * inset)
    faceOutward(plane, new Vector3(nx, 0, nz))
    parts.push(plane)
  }
  const merged = mergeGeometries(parts)
  parts.forEach((geometry) => geometry.dispose())
  if (!merged) throw new Error('楼层幕墙为空')
  return merged
}

/** 沿折线外侧放一圈楼层条或女儿墙。默认只留外露面（D125-3）。 */
export function createRingBand(
  ring: Ring,
  yCenter: number,
  height: number,
  thickness = 0.28,
  outset = 0.12,
  faces: 'outer' | 'outer-top' = 'outer',
): BufferGeometry {
  const centroid = ringCentroid(ring)
  const parts: PlaneGeometry[] = []
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    const { len, nx, nz, mx, mz } = edgeOutward(a, b, centroid)
    if (len < 0.08) continue
    const plane = new PlaneGeometry(len + 0.08, height)
    plane.rotateY(Math.atan2(nx, nz))
    plane.translate(mx + nx * (outset + thickness / 2), yCenter, mz + nz * (outset + thickness / 2))
    faceOutward(plane, new Vector3(nx, 0, nz))
    parts.push(plane)
    if (faces === 'outer-top') {
      const top = new PlaneGeometry(len + 0.08, thickness)
      top.rotateX(-Math.PI / 2)
      top.rotateY(Math.atan2(nx, nz))
      top.translate(mx + nx * (outset + thickness / 2), yCenter + height / 2, mz + nz * (outset + thickness / 2))
      parts.push(top)
    }
  }
  const merged = mergeGeometries(parts)
  parts.forEach((geometry) => geometry.dispose())
  if (!merged) throw new Error('楼层条为空')
  return merged
}
