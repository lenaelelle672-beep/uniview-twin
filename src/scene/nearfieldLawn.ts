import { Mesh, PlaneGeometry } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { _roots } from '@react-three/fiber'
import { extrudeUp } from './extrude'
import { stampWorldGroundUv } from './groundTextures'
import { grassMaterial, roadMaterial, sidewalkMaterial } from './materials'
import { ORIGIN_PAGE_X, ORIGIN_PAGE_Y, pageToWorld, PT_PER_M } from './scale'
import type { Ribbon } from './siteGeometry'

/**
 * 南侧圆形大草坪（公园绿地内，红线西侧、月明路以北）。
 * 总平面 A-01-01 此区只标「公园绿地」、没有画圆；轮廓按 exterior/03 与南向实拍目视对准。
 * 圆心世界坐标约 (-46, 123)，草坪半径 25 m，外侧 3.2 m 环行人行，南缘接近月明路北树带。
 *
 * 本模块由 scheduleGroundTextures 在首帧门闩之后动态 import，不进 hardGate。
 * 几何是挤出正多边形和条带，沿用已有 grass / sidewalk / road 材质，不新下场地贴图。
 */
export const SOUTH_LAWN = {
  center: pageToWorld(1238.0, 1784.3),
  radius: 25,
  ringWidth: 3.2,
} as const

/** 沿圆心在 XZ 平面上取正多边形，供挤出圆形草坪和环行人行。 */
export function circlePolygon(center: [number, number], radius: number, steps = 28): Array<[number, number]> {
  const points: Array<[number, number]> = []
  for (let i = 0; i < steps; i += 1) {
    const angle = (i / steps) * Math.PI * 2
    points.push([center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius])
  }
  return points
}

export function southLawnOutline(): Array<[number, number]> {
  return circlePolygon(SOUTH_LAWN.center, SOUTH_LAWN.radius)
}

export function southLawnRingOuter(): Array<[number, number]> {
  return circlePolygon(SOUTH_LAWN.center, SOUTH_LAWN.radius + SOUTH_LAWN.ringWidth)
}

function offsetRibbon(a: [number, number], b: [number, number], outwardM: number, halfWidth: number): Ribbon {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
  let nx = -(b[1] - a[1]) / len
  let ny = (b[0] - a[0]) / len
  const ox = (a[0] + b[0]) / 2 - ORIGIN_PAGE_X
  const oy = (a[1] + b[1]) / 2 - ORIGIN_PAGE_Y
  if (nx * ox + ny * oy < 0) {
    nx = -nx
    ny = -ny
  }
  const shift = outwardM * PT_PER_M
  return {
    a: pageToWorld(a[0] + nx * shift, a[1] + ny * shift),
    b: pageToWorld(b[0] + nx * shift, b[1] + ny * shift),
    halfWidth,
  }
}

/** 西南转角接到月明路，以及南向实拍里斑马线西侧的进场路。 */
export function nearfieldSpurRibbons(): Ribbon[] {
  return [
    offsetRibbon([1651.1, 1877.8], [1723.7, 1934.7], 8, 6),
    offsetRibbon([1723.7, 1934.7], [1869.4, 1934.7], 8, 6),
    { a: pageToWorld(1900, 2049.772), b: pageToWorld(1900, 1850), halfWidth: 3.6 },
    { a: pageToWorld(1900, 1850), b: pageToWorld(1750, 1700), halfWidth: 3.6 },
  ]
}

function ribbonMesh(ribbons: Ribbon[], y: number, material: typeof roadMaterial, name: string): Mesh {
  const parts = ribbons.map((ribbon) => {
    const dx = ribbon.b[0] - ribbon.a[0]
    const dz = ribbon.b[1] - ribbon.a[1]
    const geometry = new PlaneGeometry(Math.max(Math.hypot(dx, dz), 0.1), ribbon.halfWidth * 2)
    geometry.rotateX(-Math.PI / 2)
    geometry.rotateY(-Math.atan2(dz, dx))
    geometry.translate((ribbon.a[0] + ribbon.b[0]) / 2, y, (ribbon.a[1] + ribbon.b[1]) / 2)
    return geometry
  })
  const merged = mergeGeometries(parts)
  parts.forEach((geometry) => geometry.dispose())
  if (!merged) throw new Error('近场辅路几何为空')
  stampWorldGroundUv(merged)
  const mesh = new Mesh(merged, material)
  mesh.name = name
  mesh.receiveShadow = true
  return mesh
}

let mounted: Mesh[] = []

function findParkParent(): Mesh['parent'] | null {
  let park: Mesh | undefined
  for (const root of _roots.values()) {
    root.store.getState().scene.traverse((object) => {
      if (!park && object.name === 'Park' && object instanceof Mesh) park = object
    })
    if (park) break
  }
  return park?.parent ?? null
}

/** 把圆形草坪、环行人行和辅路挂到 Park 所在组。可重复调用，已挂过则跳过。 */
export function mountNearfieldLawn(attempt = 0): void {
  if (typeof document === 'undefined' || mounted.length > 0) return
  const parent = findParkParent()
  if (!parent) {
    if (attempt >= 8) return
    window.requestAnimationFrame(() => mountNearfieldLawn(attempt + 1))
    return
  }
  const lawn = new Mesh(extrudeUp(southLawnOutline(), 0.18, [], 'top'), grassMaterial)
  lawn.name = 'SouthLawn'
  lawn.renderOrder = 1
  lawn.receiveShadow = true
  const ring = new Mesh(extrudeUp(southLawnRingOuter(), 0.1, [southLawnOutline()], 'top'), sidewalkMaterial)
  ring.name = 'SouthLawnRing'
  ring.receiveShadow = true
  const spurs = nearfieldSpurRibbons()
  const sidewalks = ribbonMesh(
    spurs.map((ribbon) => ({ ...ribbon, halfWidth: ribbon.halfWidth + 3.2 })),
    0.08,
    sidewalkMaterial,
    'NearfieldSpurSidewalks',
  )
  const roads = ribbonMesh(spurs, 0.12, roadMaterial, 'NearfieldSpurRoads')
  parent.add(lawn, ring, sidewalks, roads)
  mounted = [lawn, ring, sidewalks, roads]
  void window.__twinInvalidate?.()
}
