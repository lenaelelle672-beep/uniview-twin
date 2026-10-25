import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CatmullRomCurve3, Vector3 } from 'three'
import { USER_CAMERA_SMOOTH_TIME } from '../scene/stage/cameraTransition'
import { FOG_DENSITY } from '../scene/fog'
import { TOWER_OUTLINE_BOUNDS } from '../scene/shell/rings'
import { resetTwinStore, useTwinStore } from '../store/store'
import {
  TOUR_BOW_CAP_M,
  TOUR_CLEAR_M,
  TOUR_CURVE,
  TOUR_POINT_CAP,
  TOUR_SEGMENT_CAP,
  TOUR_TENSION_CAP,
  cappedSegments,
  cappedTension,
} from './caps'
import { tourPathLayerOn, tourPathWanted } from './gate'
import { mountTourPath, resetTourPathMountForTests } from './mount'
import { tourPreviewPoints } from './path'
import { TOUR_PATH_SOURCE_BLOCK } from '../../scripts/tourPathPlugin'

const here = dirname(fileURLToPath(import.meta.url))

function read(relative: string): string {
  return readFileSync(join(here, relative), 'utf8')
}

function distanceToSegment(point: Vector3, start: Vector3, end: Vector3): number {
  const delta = end.clone().sub(start)
  const lengthSq = delta.lengthSq()
  if (lengthSq === 0) return point.distanceTo(start)
  const t = Math.min(1, Math.max(0, point.clone().sub(start).dot(delta) / lengthSq))
  return point.distanceTo(start.clone().add(delta.multiplyScalar(t)))
}

afterEach(() => {
  resetTourPathMountForTests()
  resetTwinStore()
  vi.unstubAllGlobals()
})

describe('导览轨开关', () => {
  it('默认关，图层或 demoEdit=1 才开，关掉之后本次不再被地址栏打开', () => {
    expect(tourPathLayerOn(undefined)).toBe(false)
    expect(tourPathLayerOn(null)).toBe(false)
    expect(tourPathLayerOn({})).toBe(false)
    expect(tourPathLayerOn({ tourPath: false })).toBe(false)
    expect(tourPathLayerOn({ tourPath: true })).toBe(true)
    expect(tourPathWanted({}, '')).toBe(false)
    expect(tourPathWanted({ tourPath: false }, '?demoEdit=0')).toBe(false)
    expect(tourPathWanted({ tourPath: true }, '')).toBe(true)
    expect(tourPathWanted({}, '?demoEdit=1')).toBe(true)
    expect(tourPathWanted({ tourPath: false }, '?q=balanced&demoEdit=1')).toBe(true)
    expect(tourPathWanted({ tourPath: true }, '?demoEdit=1', true)).toBe(false)
    expect(tourPathWanted({}, '?demoEdit=1', true)).toBe(false)

    expect(useTwinStore.getState().layers).not.toHaveProperty('tourPath')
    expect(tourPathLayerOn(useTwinStore.getState().layers)).toBe(false)
    useTwinStore.getState().setLayer('tourPath', true)
    expect(tourPathLayerOn(useTwinStore.getState().layers)).toBe(true)
    expect(useTwinStore.getState().layers.people).toBe(true)
    expect(useTwinStore.getState().layers.badges).toBe(true)
    useTwinStore.getState().setLayer('tourPath', false)
    expect(tourPathLayerOn(useTwinStore.getState().layers)).toBe(false)
  })

  it('没有 document 时挂载直接返回', () => {
    expect(() => mountTourPath()).not.toThrow()
  })
})

describe('导览轨几何', () => {
  it('控制点封顶，引用稳定，曲线弓高和离塔距离也封顶', () => {
    expect(TOUR_POINT_CAP).toBe(6)
    expect(TOUR_SEGMENT_CAP).toBeLessThanOrEqual(16)
    expect(TOUR_TENSION_CAP).toBeLessThanOrEqual(0.5)
    expect(TOUR_TENSION_CAP).toBeGreaterThan(0)
    expect(TOUR_CURVE).toBe('centripetal')
    expect(cappedSegments(40)).toBe(TOUR_SEGMENT_CAP)
    expect(cappedSegments(0)).toBe(1)
    expect(cappedTension(2)).toBe(TOUR_TENSION_CAP)
    expect(cappedTension(-1)).toBe(0)

    const points = tourPreviewPoints()
    expect(tourPreviewPoints()).toBe(points)
    expect(points.length).toBe(TOUR_POINT_CAP)
    expect(points.length).toBeLessThanOrEqual(TOUR_POINT_CAP)
    for (let index = 1; index < points.length; index += 1) {
      expect(points[index]![1]).toBeGreaterThan(points[index - 1]![1])
    }

    const cx = (TOWER_OUTLINE_BOUNDS.minX + TOWER_OUTLINE_BOUNDS.maxX) / 2
    const cz = (TOWER_OUTLINE_BOUNDS.minZ + TOWER_OUTLINE_BOUNDS.maxZ) / 2
    const curve = new CatmullRomCurve3(
      points.map((point) => new Vector3(point[0], point[1], point[2])),
      false,
      TOUR_CURVE,
      TOUR_TENSION_CAP,
    )
    const samples = curve.getPoints(TOUR_SEGMENT_CAP)
    expect(samples).toHaveLength(TOUR_SEGMENT_CAP + 1)
    const controls = points.map((point) => new Vector3(point[0], point[1], point[2]))
    let bow = 0
    for (const sample of samples) {
      let nearest = Infinity
      for (let index = 1; index < controls.length; index += 1) {
        nearest = Math.min(nearest, distanceToSegment(sample, controls[index - 1]!, controls[index]!))
      }
      bow = Math.max(bow, nearest)
      const clear = Math.hypot(sample.x - cx, sample.z - cz)
      expect(clear).toBeGreaterThan(TOUR_CLEAR_M)
    }
    expect(bow).toBeLessThanOrEqual(TOUR_BOW_CAP_M)
    expect(bow).toBeGreaterThan(0.2)
  })
})

describe('导览轨分包', () => {
  it('CatmullRomLine 只在过了哈希的懒包里，人流仍用 Line，雾和 T032 不动', () => {
    expect(USER_CAMERA_SMOOTH_TIME).toBe(0.42)
    expect(FOG_DENSITY.day).toBe(0.00112)
    expect(FOG_DENSITY.night).toBe(0.00096)

    const dock = read('../viewmarks/dock.tsx')
    const mount = read('./mount.ts')
    const live = read('./TourPathLine.tsx')
    const gate = read('./gate.ts')
    const path = read('./path.ts')
    const caps = read('./caps.ts')
    const plugin = read('../../scripts/tourPathPlugin.ts')
    const vite = read('../../vite.config.ts')
    const view = read('../store/viewSlice.ts')
    const walks = read('../scene/stage/WalkPaths.tsx')
    const walkLogic = read('../scene/stage/walkPaths.ts')
    const fx = read('../components/scene/postfx/balancedFx.tsx')
    const fog = read('../scene/fog.ts')
    const transition = read('../scene/stage/cameraTransition.ts')
    const loop = read('../components/scene/DemandLoop.tsx')
    const pkg = JSON.parse(read('../../package.json')) as { dependencies: Record<string, string> }

    expect(dock).toContain(TOUR_PATH_SOURCE_BLOCK.trimEnd())
    expect(dock).toMatch(/import\('\.\.\/tour-path\/mount'\)/)
    expect(dock).toMatch(/mountTourPath\(\)/)
    expect(dock).not.toMatch(/from '\.\.\/tour-path\/mount'/)
    expect(plugin).toContain(TOUR_PATH_SOURCE_BLOCK)
    expect(plugin).toMatch(/name: 'tour-path-after-hash'/)
    expect(plugin).toMatch(/apply: 'build'/)
    expect(plugin).toMatch(/assets\/TourPathMount\.js/)
    expect(plugin).toMatch(/assets\/TourPathLine\.js/)
    expect(vite).toMatch(/tourPathAfterHash/)

    expect(mount).toMatch(/import\('\.\/TourPathLine'\)/)
    expect(mount).not.toMatch(/import \{ TourPathLine \}/)
    expect(mount).not.toMatch(/CatmullRomLine|@react-three|from 'three'|useFrame/)
    expect(mount).toMatch(/dataset\.layer = 'tourPath'/)
    expect(mount).toMatch(/导览轨/)
    expect(mount).toMatch(/__tourBridge/)
    expect(view).toMatch(/LayerToggleKey = LayerKey \| 'wireframe' \| 'plaques' \| 'decals' \| 'segments' \| 'tourPath'/)
    expect(view).not.toMatch(/tourPath:\s*(true|false)/)

    expect(live).toMatch(/@react-three\/drei\/core\/CatmullRomLine/)
    expect(live).toMatch(/<CatmullRomLine/)
    expect(live).not.toMatch(/from '@react-three\/drei'/)
    expect(live).toMatch(/name="TourPath"/)
    expect(live).toMatch(/curveType=\{TOUR_CURVE\}/)
    expect(live).toMatch(/segments=\{SEGMENTS\}/)
    expect(live).toMatch(/tension=\{TENSION\}/)
    expect(live).toMatch(/tourPreviewPoints\(\)/)
    expect(live).toMatch(/invalidate\(\)/)
    expect(live).not.toMatch(/useFrame/)
    expect(live).not.toMatch(/vertexColors/)
    expect(live).not.toMatch(/WalkPaths|walkPaths/)
    expect(caps).toMatch(/TOUR_SEGMENT_CAP = 12/)
    expect(caps).toMatch(/TOUR_TENSION_CAP = 0\.35/)
    expect(path).not.toMatch(/CatmullRomLine|@react-three|walkPaths|WalkPaths/)
    expect(gate).not.toMatch(/@react-three|from 'three'|CatmullRom|walkPaths/)

    expect(walks).toMatch(/from '@react-three\/drei\/core\/Line'/)
    expect(walks).not.toMatch(/CatmullRomLine/)
    expect(walkLogic).not.toMatch(/CatmullRomLine/)
    expect(loop).not.toMatch(/CatmullRom|tour-path|TourPath/)
    expect(fx).not.toMatch(/CatmullRom|TourPath|tour-path/)
    expect(fog).toMatch(/day: 0\.00112/)
    expect(fog).toMatch(/night: 0\.00096/)
    expect(transition).toMatch(/USER_CAMERA_SMOOTH_TIME = 0\.42/)

    const eager = [
      '../components/Scene.tsx',
      '../components/Stage.tsx',
      '../App.tsx',
      '../main.tsx',
      '../index.css',
      '../components/scene/postfx/balancedFx.tsx',
      '../components/scene/DemandLoop.tsx',
      '../scene/stage/prefetchLazyChunks.ts',
      '../scene/stage/FloorStage.tsx',
      '../scene/stage/floorDecor.tsx',
      '../scene/stage/WalkPaths.tsx',
      '../scene/fog.ts',
      '../scene/stage/cameraTransition.ts',
      '../components/scene/CameraRig.tsx',
    ]
    for (const file of eager) {
      expect(read(file), file).not.toMatch(/CatmullRomLine|tour-path|TourPathLine|mountTourPath/)
    }

    const blob = [mount, live, gate, path, caps].join('\n')
    expect(blob).not.toMatch(/FOG_DENSITY|smoothTime|balancedFx|SoftShadows|DemandLoop|Vignette|transmission|Reflector/)
    expect(pkg.dependencies['@react-three/drei']).toBe('10.7.9')
    expect(pkg.dependencies.three).toBe('0.186.1')
    expect(pkg.dependencies['@react-three/fiber']).toBe('9.8.1')
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

  it('和网格、贴花抢同一个测距槽时不会互相 flush 到爆栈', () => {
    const seen: string[] = []
    let upstream: ((node: unknown) => void) | null = null
    const setNode = (node: unknown) => {
      seen.push(node == null ? 'empty' : 'node')
      if (seen.length > 40) throw new Error('cycle')
    }
    const rewrap = (flag: '__gridBridge' | '__decalBridge') => {
      const current = window.__twinMeasureSlot as ((node: unknown) => void) & {
        __gridBridge?: boolean
        __decalBridge?: boolean
        __tourBridge?: boolean
      }
      if (!current || current[flag]) return
      const previous = current
      const wrapped = (node: unknown) => {
        seen.push(flag)
        if (seen.length > 40) throw new Error('cycle')
        previous(node)
      }
      ;(wrapped as { __gridBridge?: boolean; __decalBridge?: boolean })[flag] = true
      if (flag === '__decalBridge' && previous.__gridBridge) {
        ;(wrapped as { __gridBridge?: boolean }).__gridBridge = true
      }
      window.__twinMeasureSlot = wrapped
      upstream = wrapped
    }
    const intervals: Array<() => void> = []
    vi.stubGlobal('window', {
      __twinMeasureSlot: setNode,
      setInterval: (fn: () => void) => {
        intervals.push(fn)
        return intervals.length
      },
      __twinTourPath: undefined,
    })
    vi.stubGlobal('document', {
      querySelector: () => null,
      body: {},
    })
    vi.stubGlobal(
      'MutationObserver',
      class {
        observe() {}
        disconnect() {}
      },
    )
    mountTourPath()
    for (const tick of intervals) tick()
    expect(window.__twinMeasureSlot).toBe(setNode)
    rewrap('__gridBridge')
    rewrap('__decalBridge')
    for (let index = 0; index < 6; index += 1) {
      for (const tick of intervals) tick()
      rewrap('__gridBridge')
      rewrap('__decalBridge')
    }
    expect(upstream).toBeTypeOf('function')
    expect(seen.length).toBeLessThan(40)
    expect(window.__twinTourPath?.on).toBe(false)
    expect(window.__twinTourPath?.mounted).toBe(false)
    window.__twinMeasureSlot?.(null)
    expect(() => {
      for (const tick of intervals) tick()
    }).not.toThrow()
  })
})
