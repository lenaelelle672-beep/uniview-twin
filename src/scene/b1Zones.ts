import { BoxGeometry, BufferAttribute, BufferGeometry, Color, MeshStandardMaterial } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { extrudeUp } from './extrude'
import { courtyardHole } from './massing'
import { FOOTPRINT, TOWER } from './siteGeometry'

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

function place(geometry: BufferGeometry, x: number, y: number, z: number, hex: string) {
  const base = geometry.index ? geometry.toNonIndexed() : geometry.clone()
  base.translate(x, y, z)
  return paint(base, hex)
}

/** 把 B1 色块收成一个带顶点色的网格，主 pass 从 10 次降到 1 次。 */
export function buildB1ZoneGeometry(): BufferGeometry {
  const atrium = extrudeUp(courtyardHole(), 0.12)
  const fanX = (FOOTPRINT.minX + FOOTPRINT.maxX) / 2
  const fanZ = (FOOTPRINT.minZ + FOOTPRINT.maxZ) / 2
  const fanPoints: Array<[number, number]> = [[fanX, fanZ]]
  for (let i = 0; i <= 14; i += 1) {
    const t = -0.4 + (2.2 * i) / 14
    fanPoints.push([fanX + Math.cos(t) * 12, fanZ + Math.sin(t) * 10])
  }
  const fan = extrudeUp(fanPoints, 0.12)
  const rooms = new BoxGeometry(4.2, 0.16, 5.2)
  const lobby = new BoxGeometry(18, 0.16, 14)
  const eastHall = new BoxGeometry(28, 0.16, 16)
  const eastRoom = new BoxGeometry(16, 0.16, 12)
  const eastX = (FOOTPRINT.minX + FOOTPRINT.maxX) / 2
  const eastZ = (FOOTPRINT.minZ + FOOTPRINT.maxZ) / 2
  const parts = [
    place(atrium, 0, 0.28, 0, B1_ZONE_COLORS[1]),
    place(lobby, 0, 0.36, -2, B1_ZONE_COLORS[0]),
    place(fan, 0, 0.28, 0, B1_ZONE_COLORS[2]),
    place(eastHall, eastX, 0.36, eastZ - 6, B1_ZONE_COLORS[3]),
    place(eastRoom, eastX + 8, 0.36, eastZ + 10, B1_ZONE_COLORS[4]),
    ...Array.from({ length: 5 }, (_, index) => place(rooms, -24 + index * 5.2, 0.36, TOWER.maxZ - 4, B1_ZONE_COLORS[5])),
  ]
  const merged = mergeGeometries(parts, false)
  parts.forEach((geometry) => geometry.dispose())
  ;[atrium, fan, rooms, lobby, eastHall, eastRoom].forEach((geometry) => geometry.dispose())
  if (!merged) throw new Error('B1 色块几何为空')
  return merged
}
