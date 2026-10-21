import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createMockData } from '../data/mockData'
import { hydrateAllAboveGrade } from '../floors/hydrateForTests'
import { USER_CAMERA_SMOOTH_TIME } from '../scene/stage/cameraTransition'
import { workstationPosition } from '../scene/stage/workstationPosition'
import { floorPlanGeometry, planDesks } from '../blueprint/plan'
import {
  MINIMAP_PROJECT_MS,
  createProjectionThrottle,
  horizontalFovRad,
  minimapShows,
  planPointToWorld,
  polygonPoints,
  projectToPlan,
  slideLookAt,
  viewConeOnPlane,
} from './project'

hydrateAllAboveGrade()

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

describe('楼层小地图投影', () => {
  it('平面坐标与 workstationPosition、蓝图 viewBox 对齐', () => {
    const data = createMockData()
    for (const floorId of ['B1', 'F12'] as const) {
      const geometry = floorPlanGeometry(floorId)
      const desks = planDesks(floorId, data.desks, data.devices)
      expect(desks.length).toBeGreaterThan(10)
      for (const desk of desks) {
        const place = workstationPosition(floorId, desk.id)
        expect(desk.x).toBe(place.x)
        expect(desk.z).toBe(place.z)
        const plot = projectToPlan(desk.x, desk.z, geometry.bounds)
        const world = planPointToWorld(plot.x, plot.y, geometry.bounds)
        expect(world.x).toBeCloseTo(place.x, 6)
        expect(world.z).toBeCloseTo(place.z, 6)
        expect(plot.x).toBeGreaterThanOrEqual(0)
        expect(plot.y).toBeGreaterThanOrEqual(0)
        expect(plot.x).toBeLessThanOrEqual(geometry.bounds.width)
        expect(plot.y).toBeLessThanOrEqual(geometry.bounds.depth)
      }
    }
  })

  it('视锥从眼点指向目标，左右对称', () => {
    const bounds = { minX: -2, minZ: -4, width: 40, depth: 50 }
    const cone = viewConeOnPlane({
      eyeX: 8,
      eyeZ: 6,
      targetX: 18,
      targetZ: 6,
      fovDeg: 48,
      aspect: 1.5,
      bounds,
    })
    expect(cone.eye).toEqual(projectToPlan(8, 6, bounds))
    expect(cone.headingX).toBeCloseTo(1, 5)
    expect(cone.headingZ).toBeCloseTo(0, 5)
    const [apex, left, right] = cone.polygon
    expect(apex).toEqual(cone.eye)
    expect(left.x).toBeGreaterThan(apex.x)
    expect(right.x).toBeGreaterThan(apex.x)
    expect(left.y).toBeGreaterThan(apex.y)
    expect(right.y).toBeLessThan(apex.y)
    expect((left.y + right.y) / 2).toBeCloseTo(apex.y, 5)
    expect(polygonPoints(cone.polygon)).toContain(`${apex.x},${apex.y}`)
    expect(horizontalFovRad(48, 1.5)).toBeGreaterThan((48 * Math.PI) / 180)
  })

  it('垂直下看时沿用上一帧朝向', () => {
    const bounds = { minX: 0, minZ: 0, width: 20, depth: 20 }
    const cone = viewConeOnPlane({
      eyeX: 4,
      eyeZ: 5,
      targetX: 4,
      targetZ: 5,
      fovDeg: 48,
      aspect: 1,
      bounds,
      headingX: 0,
      headingZ: -1,
    })
    expect(cone.headingX).toBeCloseTo(0, 5)
    expect(cone.headingZ).toBeCloseTo(-1, 5)
    const farY = (cone.polygon[1].y + cone.polygon[2].y) / 2
    expect(farY).toBeLessThan(cone.eye.y)
  })

  it('点击只平移水平位置，高度和视线差不动', () => {
    const eye = { x: 1, y: 8.5, z: 2 }
    const target = { x: 4, y: 1.2, z: 6 }
    const next = slideLookAt(eye, target, { x: 11, z: 3 })
    expect(next).not.toBeNull()
    if (!next) return
    expect(next.eye.y).toBe(eye.y)
    expect(next.target.y).toBe(target.y)
    expect(next.target).toEqual({ x: 11, y: target.y, z: 3 })
    expect(next.eye.x - next.target.x).toBeCloseTo(eye.x - target.x)
    expect(next.eye.z - next.target.z).toBeCloseTo(eye.z - target.z)
    expect(slideLookAt(eye, target, { x: target.x, z: target.z })).toBeNull()
  })

  it('投影按间隔合并，停住的最后一次还会补上', () => {
    expect(MINIMAP_PROJECT_MS).toBe(100)
    let now = 1_000
    const queued: Array<{ fn: () => void; ms: number }> = []
    const calls: string[] = []
    const throttle = createProjectionThrottle(
      MINIMAP_PROJECT_MS,
      () => now,
      (fn, ms) => {
        queued.push({ fn, ms })
        return queued.length
      },
      (id) => {
        queued[id - 1] = { fn: () => {}, ms: -1 }
      },
    )
    throttle.push(() => calls.push('a'))
    now = 1_030
    throttle.push(() => calls.push('b'))
    now = 1_050
    throttle.push(() => calls.push('c'))
    expect(calls).toEqual(['a'])
    expect(queued).toHaveLength(1)
    expect(queued[0]?.ms).toBe(70)
    now = 1_100
    queued[0]?.fn()
    expect(calls).toEqual(['a', 'c'])
    now = 1_250
    throttle.push(() => calls.push('d'))
    expect(calls).toEqual(['a', 'c', 'd'])
    throttle.cancel()
  })

  it('全屏蓝图和总览不显示小地图', () => {
    expect(minimapShows('floor', 'F12')).toBe(true)
    expect(minimapShows('floor', 'B1')).toBe(true)
    expect(minimapShows('blueprint', 'F12')).toBe(false)
    expect(minimapShows('building', 'F12')).toBe(false)
    expect(minimapShows('floor', null)).toBe(false)
    expect(minimapShows('floor', 'F99')).toBe(false)
  })
})

describe('小地图分包', () => {
  it('懒挂在书签入口之后，不进首屏、不改 T032、不用 Hud', () => {
    const dock = read('../viewmarks/dock.tsx')
    const stage = read('../components/Stage.tsx')
    const scene = read('../components/Scene.tsx')
    const rig = read('../components/scene/CameraRig.tsx')
    const css = read('../index.css')
    const fx = read('../components/scene/postfx/balancedFx.tsx')
    const prefetch = read('../scene/stage/prefetchLazyChunks.ts')
    const transition = read('../scene/stage/cameraTransition.ts')
    const loop = read('../components/scene/DemandLoop.tsx')
    const fog = read('../scene/fog.ts')
    const app = read('../App.tsx')
    const fly = read('./fly.ts')
    const ui = read('./FloorMinimap.tsx')
    const mount = read('./mount.tsx')
    const plan = read('./project.ts')
    const blob = [fly, ui, mount, plan, read('./minimap.css')].join('\n')

    expect(USER_CAMERA_SMOOTH_TIME).toBe(0.42)
    expect(transition).toMatch(/USER_CAMERA_SMOOTH_TIME = 0\.42/)
    expect(rig).toMatch(/smoothTime=\{USER_CAMERA_SMOOTH_TIME\}/)
    expect(dock).toMatch(/import\('\.\.\/minimap\/mount'\)/)
    expect(dock).not.toMatch(/from '\.\.\/minimap\/mount'/)
    expect(prefetch).toMatch(/import\('\.\.\/\.\.\/viewmarks\/dock'\)/)
    expect(prefetch).toMatch(/FLOOR_SHELL_AFTER_FIRST_MS = 2600/)

    for (const source of [stage, scene, rig, css, fx, prefetch, transition, loop, fog, app]) {
      expect(source).not.toMatch(/minimap|FloorMinimap/)
    }
    expect(ui).toMatch(/floorPlanGeometry/)
    expect(ui).toMatch(/planDesks/)
    expect(ui).toMatch(/projectToPlan/)
    expect(ui).toMatch(/getScreenCTM/)
    expect(ui).toMatch(/MINIMAP_PROJECT_MS/)
    expect(fly).toMatch(/setLookAt\([\s\S]*true\)/)
    expect(mount).toMatch(/pointerEvents = 'none'/)
    expect(mount).toMatch(/hidden/)
    expect(read('./minimap.css')).toMatch(/pointer-events:\s*none/)
    expect(read('./minimap.css')).toMatch(/pointer-events:\s*auto/)
    expect(ui).toMatch(/minimapShows/)
    expect(blob).not.toMatch(/smoothTime/)
    expect(blob).not.toMatch(/@react-three\/drei|<Hud\b|<View[\s/>]/)
    expect(blob).not.toMatch(
      /balancedFx|cameraRest|frameSchedule|DemandLoop|SoftShadows|OutlinePass|Reflector|transmission|Vignette|ssgi|pathtracer|jsdelivr|FloorBadges|FogExp2/i,
    )
    const pkg = JSON.parse(read('../../package.json')) as { dependencies: Record<string, string> }
    expect(Object.keys(pkg.dependencies).sort()).toEqual(
      [
        '@react-three/drei',
        '@react-three/fiber',
        '@react-three/postprocessing',
        'postprocessing',
        'react',
        'react-dom',
        'three',
        'troika-three-text',
        'troika-three-utils',
        'troika-worker-utils',
        'zustand',
      ].sort(),
    )
  })
})
