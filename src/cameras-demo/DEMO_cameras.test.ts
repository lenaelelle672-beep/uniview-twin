import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { floorIdList } from '../data/floors'
import { CAMERA_LIMITS } from '../scene/cameras'
import { BUILDING_HIGHLIGHT_ORDER } from '../scene/overlayOrder'
import { pointInB1Slab } from '../scene/stage/b1Plan'
import { USER_CAMERA_SMOOTH_TIME } from '../scene/stage/cameraTransition'
import {
  CAMERA_CONE_CAP,
  CAMERA_CONE_MIN,
  CAMERA_MOUNT_Y,
  POV_DROP_M,
  POV_REACH_M,
  cameraPovLook,
  demoCameraAnchors,
  demoConeCount,
  headingDirection,
} from './DEMO_cameras'
import { CAMERA_CONE_ORDER, createCameraConeGeometry, createCameraConeMaterial } from './coneGeometry'

const here = dirname(fileURLToPath(import.meta.url))

function readRepo(relative: string): string {
  return readFileSync(join(here, relative), 'utf8')
}

function firstRing(value: unknown): Array<[number, number]> {
  if (!Array.isArray(value) || value.length === 0) return []
  const inner = value[0]
  if (Array.isArray(inner) && inner.length >= 2 && typeof inner[0] === 'number') {
    return value as Array<[number, number]>
  }
  return Array.isArray(inner) ? (inner as Array<[number, number]>) : []
}

function pointInRing(x: number, z: number, ring: Array<[number, number]>): boolean {
  let inside = false
  for (let index = 0, prev = ring.length - 1; index < ring.length; prev = index, index += 1) {
    const [xi, zi] = ring[index]!
    const [xj, zj] = ring[prev]!
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi + Number.EPSILON) + xi) inside = !inside
  }
  return inside
}

describe('DEMO 摄像头锚点', () => {
  it('文件标明 DEMO，每层 4–6 个点加朝向，并封顶', () => {
    const source = readRepo('DEMO_cameras.ts')
    expect(source).toMatch(/DEMO/)
    expect(source).toMatch(/合成/)
    expect(source).toMatch(/不是设备台账/)
    expect(CAMERA_CONE_CAP).toBe(6)
    expect(CAMERA_CONE_MIN).toBe(4)
    expect(floorIdList()).toHaveLength(23)
    for (const floorId of floorIdList()) {
      const anchors = demoCameraAnchors(floorId)
      expect(anchors.length, floorId).toBe(demoConeCount(floorId))
      expect(anchors.length).toBeGreaterThanOrEqual(4)
      expect(anchors.length).toBeLessThanOrEqual(CAMERA_CONE_CAP)
      const headings = new Set(anchors.map((anchor) => anchor.heading))
      expect(headings.size).toBeGreaterThan(1)
      for (const anchor of anchors) {
        expect(anchor.id.startsWith(`DEMO-${floorId}-`)).toBe(true)
        expect(anchor.floorId).toBe(floorId)
        expect(Number.isFinite(anchor.x)).toBe(true)
        expect(Number.isFinite(anchor.z)).toBe(true)
        expect(Number.isFinite(anchor.heading)).toBe(true)
      }
    }
    expect(demoCameraAnchors('F99')).toEqual([])
    expect(demoConeCount('nope')).toBe(0)
  })

  it('地上层锚点在板内且不在核心筒，B1 锚点在楼板上', () => {
    for (let level = 1; level <= 22; level += 1) {
      const file = `F${String(level).padStart(2, '0')}`
      const plan = JSON.parse(readRepo(`../../public/floors/${file}.json`)) as {
        outline: unknown
        cores?: Array<{ polygon: unknown }>
      }
      const outline = firstRing(plan.outline)
      const cores = (plan.cores ?? []).map((core) => firstRing(core.polygon))
      for (const anchor of demoCameraAnchors(`F${level}`)) {
        expect(pointInRing(anchor.x, anchor.z, outline), `${anchor.id} outline`).toBe(true)
        expect(
          cores.some((ring) => pointInRing(anchor.x, anchor.z, ring)),
          `${anchor.id} core`,
        ).toBe(false)
      }
    }
    for (const anchor of demoCameraAnchors('B1')) {
      expect(pointInB1Slab(anchor.x, anchor.z), anchor.id).toBe(true)
    }
  })

  it('朝向 0 朝北，POV 眼点在机位且距离大于最近限制', () => {
    expect(headingDirection(0).z).toBeCloseTo(-1)
    expect(headingDirection(0).x).toBeCloseTo(0)
    expect(headingDirection(-Math.PI / 2).x).toBeCloseTo(1)
    expect(headingDirection(Math.PI).z).toBeCloseTo(1)
    expect(headingDirection(Math.PI / 2).x).toBeCloseTo(-1)
    expect(POV_REACH_M).toBeGreaterThan(CAMERA_LIMITS.minDistance)
    const look = cameraPovLook(demoCameraAnchors('F12')[0]!)
    expect(look.eye.y).toBe(CAMERA_MOUNT_Y)
    const distance = Math.hypot(look.target.x - look.eye.x, look.target.y - look.eye.y, look.target.z - look.eye.z)
    expect(distance).toBeGreaterThan(CAMERA_LIMITS.minDistance)
    expect(look.target.y).toBeCloseTo(look.eye.y - POV_DROP_M)
  })
})

describe('覆盖锥几何', () => {
  it('尖在原点、沿 -Z 张开，材质半透明且不写深度', () => {
    const geometry = createCameraConeGeometry()
    geometry.computeBoundingBox()
    const box = geometry.boundingBox
    expect(box).not.toBeNull()
    expect(box!.max.z).toBeCloseTo(0, 1)
    expect(box!.min.z).toBeLessThan(-7)
    expect(Math.abs(box!.min.x)).toBeLessThan(4)
    expect(CAMERA_CONE_ORDER).toBe(BUILDING_HIGHLIGHT_ORDER)
    geometry.dispose()

    const idle = createCameraConeMaterial(false)
    const selected = createCameraConeMaterial(true)
    expect(idle.transparent).toBe(true)
    expect(idle.depthWrite).toBe(false)
    expect(idle.fog).toBe(true)
    expect(idle.opacity).toBeLessThan(selected.opacity)
    expect(idle.toneMapped).toBe(false)
    idle.dispose()
    selected.dispose()
  })
})

describe('视锥分包不进首屏，也不改 T032', () => {
  it('只从室内动态引入，点锥复用 setLookAt，smoothTime 仍是 0.42', () => {
    const gate = readRepo('lazyCameraFov.tsx')
    const cones = readRepo('CameraFovCones.tsx')
    const pov = readRepo('cameraPov.ts')
    const interior = readRepo('../floors/JsonFloorInterior.tsx')
    const basement = readRepo('../scene/stage/B1Interior.tsx')
    const stage = readRepo('../scene/stage/FloorStage.tsx')
    const scene = readRepo('../components/Scene.tsx')
    const prefetch = readRepo('../scene/stage/prefetchLazyChunks.ts')
    const order = readRepo('../scene/overlayOrder.ts')
    const rig = readRepo('../components/scene/CameraRig.tsx')
    const transition = readRepo('../scene/stage/cameraTransition.ts')
    const fx = readRepo('../components/scene/postfx/balancedFx.tsx')
    const pkg = readRepo('../../package.json')

    expect(gate).toMatch(/import\('\.\/CameraFovCones'\)/)
    expect(gate).not.toMatch(/from '\.\/CameraFovCones'/)
    const coneSource = readRepo('coneGeometry.ts')
    expect(cones).toMatch(/createCameraConeGeometry/)
    expect(cones).toMatch(/createCameraConeMaterial/)
    expect(coneSource).toMatch(/new ConeGeometry\(/)
    expect(coneSource).toMatch(/MeshBasicMaterial/)
    expect(coneSource).toMatch(/depthWrite: false/)
    expect(cones).toMatch(/CAMERA_CONE_ORDER/)
    expect(cones).toMatch(/name="CameraFovCone"/)
    expect(cones).toMatch(/delete window\.__twinCameraFov/)
    expect(cones).toMatch(/flyCameraPov\(/)
    expect(pov).toMatch(/setLookAt\(eye\.x, eye\.y, eye\.z, target\.x, target\.y, target\.z, true\)/)
    expect(pov).not.toMatch(/smoothTime/)
    expect(cones).not.toMatch(/smoothTime/)
    expect(gate).not.toMatch(/smoothTime/)

    expect(interior).toMatch(/<CameraFov floorId=\{spec\.id\} \/>/)
    expect(interior).not.toMatch(/CameraFovCones|cameras-demo\/DEMO_cameras|coneGeometry/)
    expect(basement).toMatch(/<CameraFov floorId="B1" \/>/)
    expect(basement).not.toMatch(/CameraFovCones/)
    expect(stage).not.toMatch(/cameras-demo|CameraFov/)
    expect(scene).not.toMatch(/cameras-demo|CameraFov/)
    expect(prefetch).not.toMatch(/cameras-demo|CameraFov/)
    expect(order).not.toMatch(/CameraFov|cameras-demo/)
    expect(fx).not.toMatch(/CameraFov|cameras-demo|OutlineEffect/)

    expect(USER_CAMERA_SMOOTH_TIME).toBe(0.42)
    expect(transition).toMatch(/USER_CAMERA_SMOOTH_TIME = 0\.42/)
    expect(rig).toMatch(/smoothTime=\{USER_CAMERA_SMOOTH_TIME\}/)
    expect(rig).not.toMatch(/cameras-demo|CameraFov/)

    const blob = [gate, cones, pov, readRepo('DEMO_cameras.ts'), readRepo('coneGeometry.ts')].join('\n')
    expect(blob).not.toMatch(
      /OutlineEffect|OutlinePass|Reflector|transmission|Vignette|ssgi|pathtracer|jsdelivr|FloorBadges|SoftShadows|DemandLoop|cameraRest|frameSchedule/i,
    )
    expect(pkg).not.toMatch(/cameras-demo/)
    expect(pkg).toMatch(/"three": "0\.186\.1"/)
  })
})
