import { BufferAttribute, BufferGeometry, Color, MeshStandardMaterial } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { extrudeUp } from './extrude'
import { B1_ATRIUM, B1_CANTEEN, B1_LOBBY, B1_PLAZA, B1_ROOMS, ellipseRing, ringFromAabb } from './stage/b1Plan'
import { fanOutline } from './stage/layout'

/** 与原先 6 个 zoneMaterials 相同的色值。 */
export const B1_ZONE_COLORS = ['#c5ccd4', '#d9e2ea', '#d7c4b0', '#e4d3bf', '#cfc8be', '#d4cfc6'] as const

/** 合并前各自一次绘制的色块数量（不含石材楼板）。 */
export const B1_COLOR_BLOCK_COUNT = 10

export const zoneBlockMaterial = new MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.9,
  metalness: 0,
})

function paint(geometry: BufferGeometry, hex: string) {
  const color = new Color(hex)
  const count = geometry.getAttribute('position').count
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i += 1) {
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  return geometry
}

function lift(ring: Array<[number, number]>, y: number, hex: string) {
  const geometry = extrudeUp(ring, 0.12)
  const base = geometry.index ? geometry.toNonIndexed() : geometry
  base.translate(0, y, 0)
  if (base !== geometry) geometry.dispose()
  return paint(base, hex)
}

/** 色块和室内房间用同一套 B1.pdf 轮廓。拾取区不在这里，它贴在场地广场上。 */
export function b1ZoneRings(): Array<Array<[number, number]>> {
  return [
    ringFromAabb(B1_PLAZA),
    ringFromAabb(B1_LOBBY),
    fanOutline(),
    ellipseRing(B1_ATRIUM.cx, B1_ATRIUM.cz, B1_ATRIUM.rx, B1_ATRIUM.rz),
    ringFromAabb(B1_CANTEEN),
    ...B1_ROOMS.map((room) => ringFromAabb(room)),
  ]
}

/** 把 B1 色块收成一个带顶点色的网格，主 pass 从 10 次降到 1 次。 */
export function buildB1ZoneGeometry(): BufferGeometry {
  const rings = b1ZoneRings()
  const parts = rings.map((ring, index) => lift(ring, index === 1 ? 0.2 : 0.16, B1_ZONE_COLORS[index % B1_ZONE_COLORS.length]))
  const merged = mergeGeometries(parts, false)
  parts.forEach((geometry) => geometry.dispose())
  if (!merged) throw new Error('B1 色块几何为空')
  if (rings.length !== B1_COLOR_BLOCK_COUNT) throw new Error('B1 色块数量变了')
  return merged
}
