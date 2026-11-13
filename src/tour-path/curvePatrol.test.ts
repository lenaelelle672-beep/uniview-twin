import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { DynamicDrawUsage, RepeatWrapping } from 'three'
import { FOG_DENSITY } from '../scene/fog'
import { USER_CAMERA_SMOOTH_TIME } from '../scene/stage/cameraTransition'
import { TWIN_TOUR_EVENT } from '../viewmarks/tourEvents'
import { TOUR_CURVE, TOUR_POINT_CAP } from './caps'
import {
  CURVE_PATROL_OFFSET_PER_SECOND,
  startCurveAutoInvalidate,
  type CurveClock,
} from './curveDrive'
import { mountCurvePatrol, resetCurvePatrolMountForTests } from './curveMount'
import { resetCurvePatrolSessionForTests, startCurvePatrol, tourPatrolCurve } from './curveSession'
import { tourPreviewPoints } from './path'
import { withTourMotion } from './overlay'
import {
  CURVE_PATROL_SOURCE_BLOCK,
  FLOW_FALLBACK,
  findCreatePortalBinding,
  stripCurvePatrolSource,
} from '../../scripts/curvePatrolPlugin'

const here = dirname(fileURLToPath(import.meta.url))

function read(relative: string): string {
  return readFileSync(join(here, relative), 'utf8')
}

afterEach(() => {
  resetCurvePatrolMountForTests()
  resetCurvePatrolSessionForTests()
})

describe('巡游推进', () => {
  it('只在会话里 moveAlongCurve，并 autoInvalidate；停下后不再要帧', () => {
    const moved: number[] = []
    const invalidates: number[] = []
    let now = 1_000
    let nextId = 1
    const pending = new Map<number, (time: number) => void>()
    const clock: CurveClock = {
      now: () => now,
      request: (callback) => {
        const id = nextId
        nextId += 1
        pending.set(id, callback)
        return id
      },
      cancel: (id) => {
        pending.delete(id)
      },
    }
    const stop = startCurveAutoInvalidate(
      { moveAlongCurve: (amount) => moved.push(amount) },
      () => invalidates.push(1),
      clock,
      CURVE_PATROL_OFFSET_PER_SECOND,
    )
    expect(pending.size).toBe(1)
    const first = [...pending.values()][0]
    pending.clear()
    now += 1_000
    first?.(now)
    expect(moved).toEqual([0.05 * CURVE_PATROL_OFFSET_PER_SECOND])
    expect(invalidates).toHaveLength(1)
    expect(pending.size).toBe(1)
    const queued = [...pending.values()][0]
    stop()
    expect(pending.size).toBe(0)
    queued?.(now + 500)
    first?.(now + 500)
    expect(moved).toHaveLength(1)
    expect(invalidates).toHaveLength(1)
    stop()
    expect(invalidates).toHaveLength(1)
  })
})

describe('巡游曲线', () => {
  it('跟现有 TourPath 同一组控制点，centripetal，不闭合', () => {
    const curve = tourPatrolCurve()
    const points = tourPreviewPoints()
    expect(points).toHaveLength(TOUR_POINT_CAP)
    expect(curve.points).toHaveLength(points.length)
    expect(curve.closed).toBe(false)
    expect(curve.curveType).toBe(TOUR_CURVE)
    expect(curve.curveType).toBe('centripetal')
    const head = curve.points[0]
    expect(head?.x).toBeCloseTo(points[0]?.[0] ?? 0)
    expect(head?.y).toBeCloseTo(points[0]?.[1] ?? 0)
    expect(head?.z).toBeCloseTo(points[0]?.[2] ?? 0)
    expect(curve.getLength()).toBeGreaterThan(40)
  })
})

describe('巡游会话', () => {
  it('挂上节点，取消后卸掉并且不再 driving', () => {
    const flushed: number[] = []
    const paints: number[] = []
    const previous = globalThis.window
    Object.assign(globalThis, {
      window: {
        __twinSceneOverlayFlush: () => {
          flushed.push(1)
          return true
        },
        setTimeout: () => 0,
      },
    })
    try {
      const session = startCurvePatrol()
      expect(window.__twinCurvePatrolNode).toBeTruthy()
      expect(window.__twinCurvePatrol).toMatchObject({
        active: true,
        mounted: false,
        driving: false,
        curve: 'centripetal',
        points: TOUR_POINT_CAP,
      })
      expect(flushed.length).toBeGreaterThan(0)
      session.cancel()
      expect(window.__twinCurvePatrolNode).toBeNull()
      expect(window.__twinCurvePatrol).toMatchObject({ active: false, mounted: false, driving: false })
      session.cancel()
      expect(paints).toHaveLength(0)
    } finally {
      if (previous === undefined) delete (globalThis as { window?: unknown }).window
      else Object.assign(globalThis, { window: previous })
    }
  })

  it('导览事件才加载身体，结束就取消，重复的楼层事件不重开', async () => {
    const listeners = new Set<(event: Event) => void>()
    const previous = globalThis.window
    Object.assign(globalThis, {
      window: {
        addEventListener: (_type: string, listener: (event: Event) => void) => listeners.add(listener),
        removeEventListener: (_type: string, listener: (event: Event) => void) => listeners.delete(listener),
      },
    })
    const started: string[] = []
    const stopped: number[] = []
    let resolveLoad: (value: { startCurvePatrol: () => { cancel: () => void } }) => void = () => {}
    const load = () =>
      new Promise<{ startCurvePatrol: () => { cancel: () => void } }>((resolve) => {
        resolveLoad = resolve
      })
    try {
      mountCurvePatrol(load)
      const emit = (detail: { active: boolean; floorId: string | null; empty: boolean }) => {
        const event = new Event(TWIN_TOUR_EVENT)
        Object.assign(event, { detail })
        for (const listener of listeners) listener(event)
      }
      emit({ active: false, floorId: null, empty: true })
      expect(started).toHaveLength(0)
      emit({ active: true, floorId: 'F1', empty: false })
      emit({ active: true, floorId: 'F2', empty: false })
      let loads = 0
      const original = resolveLoad
      resolveLoad = (value) => {
        loads += 1
        original(value)
      }
      resolveLoad({
        startCurvePatrol: () => {
          started.push('go')
          return { cancel: () => stopped.push(1) }
        },
      })
      await Promise.resolve()
      expect(loads).toBe(1)
      expect(started).toEqual(['go'])
      emit({ active: true, floorId: 'F6', empty: false })
      await Promise.resolve()
      expect(started).toEqual(['go'])
      emit({ active: false, floorId: 'F6', empty: false })
      expect(stopped).toEqual([1])
      expect(listeners.size).toBe(1)
    } finally {
      if (previous === undefined) delete (globalThis as { window?: unknown }).window
      else Object.assign(globalThis, { window: previous })
    }
  })

  it('会话还没加载完就结束，不会再挂上', async () => {
    const listeners = new Set<(event: Event) => void>()
    const previous = globalThis.window
    Object.assign(globalThis, {
      window: {
        addEventListener: (_type: string, listener: (event: Event) => void) => listeners.add(listener),
        removeEventListener: (_type: string, listener: (event: Event) => void) => listeners.delete(listener),
      },
    })
    const stopped: number[] = []
    let resolveLoad: (value: { startCurvePatrol: () => { cancel: () => void } }) => void = () => {}
    try {
      mountCurvePatrol(
        () =>
          new Promise((resolve) => {
            resolveLoad = resolve
          }),
      )
      const emit = (active: boolean) => {
        const event = new Event(TWIN_TOUR_EVENT)
        Object.assign(event, { detail: { active, floorId: 'F1', empty: false } })
        for (const listener of listeners) listener(event)
      }
      emit(true)
      emit(false)
      resolveLoad({
        startCurvePatrol: () => {
          stopped.push(0)
          return { cancel: () => stopped.push(1) }
        },
      })
      await Promise.resolve()
      expect(stopped).toEqual([])
    } finally {
      if (previous === undefined) delete (globalThis as { window?: unknown }).window
      else Object.assign(globalThis, { window: previous })
    }
  })
})

describe('格网槽', () => {
  it('没有巡游体时不改沿轨节点', () => {
    expect(withTourMotion(null)).toBeNull()
    expect(withTourMotion('grid')).toBe('grid')
  })

  it('巡游体接在已有叠层后面', () => {
    const previous = globalThis.window
    Object.assign(globalThis, { window: { __twinCurvePatrolNode: 'body' } })
    try {
      expect(withTourMotion(null)).toBe('body')
      const both = withTourMotion('grid')
      expect(both).not.toBe('grid')
      expect(both).not.toBe('body')
    } finally {
      if (previous === undefined) delete (globalThis as { window?: unknown }).window
      else Object.assign(globalThis, { window: previous })
    }
  })
})

describe('懒挂与禁项', () => {
  it('CurveModifier 和 Flow 留在会话分包，不进首屏，不改雾', () => {
    expect(USER_CAMERA_SMOOTH_TIME).toBe(0.42)
    expect(FOG_DENSITY.day).toBe(0.00112)
    expect(FOG_DENSITY.night).toBe(0.00096)
    expect(RepeatWrapping).toBe(FLOW_FALLBACK.RepeatWrapping)
    expect(DynamicDrawUsage).toBe(FLOW_FALLBACK.DynamicDrawUsage)

    const dock = read('../viewmarks/dock.tsx')
    const session = read('./curveSession.tsx')
    const mount = read('./curveMount.ts')
    const drive = read('./curveDrive.ts')
    const plugin = read('../../scripts/curvePatrolPlugin.ts')
    const vite = read('../../vite.config.ts')
    const pkg = JSON.parse(read('../../package.json')) as {
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
    }
    const modifier = read('../../node_modules/@react-three/drei/core/CurveModifier.js')
    const flow = read('../../node_modules/three-stdlib/modifiers/CurveModifier.js')

    expect(dock).toContain(CURVE_PATROL_SOURCE_BLOCK.trimEnd())
    expect(stripCurvePatrolSource(dock)).not.toMatch(/mountCurvePatrol|curveMount|__twinCurvePatrol/)
    expect(dock).not.toMatch(/from '\.\.\/tour-path\/curveMount'/)
    expect(plugin).toContain(CURVE_PATROL_SOURCE_BLOCK)
    expect(plugin).toMatch(/assets\/CurveModifier\.js/)
    expect(plugin).toMatch(/assets\/Flow\.js/)
    expect(plugin).toMatch(/assets\/CurvePatrolBody\.js/)
    expect(plugin).toMatch(/assets\/CurvePatrolMount\.js/)
    expect(vite).toMatch(/curvePatrolAfterHash/)

    expect(mount).toMatch(/import\('\.\/curveSession'\)/)
    expect(mount.indexOf('detail.active !== true')).toBeLessThan(mount.indexOf('void load()'))
    expect(mount).not.toMatch(/@react-three|from 'three'|moveAlongCurve|useFrame|from '@react-three\/drei'/)
    expect(session).toMatch(/from '@react-three\/drei\/core\/CurveModifier'/)
    expect(session).not.toMatch(/from '@react-three\/drei'/)
    expect(session).not.toMatch(/useFrame|MotionPathControls|CorridorPeople|gsap|anime/)
    expect(session).toMatch(/moveAlongCurve/)
    expect(session).toMatch(/TourPatrolBody/)
    expect(session).toMatch(/tourPreviewPoints/)
    expect(drive).toMatch(/startCurveAutoInvalidate/)
    expect(drive).toMatch(/moveAlongCurve/)
    expect(drive).not.toMatch(/useFrame|gsap|anime/)

    expect(modifier).toMatch(/createPortal/)
    expect(modifier).toMatch(/\bFlow\b/)
    expect(modifier).not.toMatch(/useFrame/)
    expect(flow).toMatch(/moveAlongCurve/)
    expect(gzipSync(modifier).length).toBeGreaterThan(400)
    expect(gzipSync(flow).length).toBeGreaterThan(2_000)

    const eager = [
      '../components/Scene.tsx',
      '../components/Stage.tsx',
      '../components/scene/postfx/balancedFx.tsx',
      '../components/scene/DemandLoop.tsx',
      '../components/scene/CameraRig.tsx',
      '../viewmarks/alarmTour.ts',
      '../viewmarks/ViewmarkDock.tsx',
      '../scene/fog.ts',
      '../scene/stage/cameraTransition.ts',
      '../scene/stage/CorridorPeople.tsx',
      '../scene/stage/corridor.ts',
    ]
    for (const file of eager) {
      expect(read(file), file).not.toMatch(/CurveModifier|mountCurvePatrol|TourPatrolBody|curveSession/)
    }

    expect(pkg.dependencies['@react-three/drei']).toBe('10.7.9')
    expect(pkg.dependencies['@react-three/fiber']).toBe('9.8.1')
    expect(pkg.dependencies.three).toBe('0.186.1')
    expect(pkg.dependencies['@react-three/postprocessing']).toBe('3.1.3')
    expect(pkg.dependencies.postprocessing).toBe('6.39.5')
    expect(pkg.dependencies.gsap).toBeUndefined()
    expect(pkg.dependencies.animejs).toBeUndefined()
    expect(pkg.devDependencies.gsap).toBeUndefined()
    expect(pkg.devDependencies.animejs).toBeUndefined()
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

  it('从压缩产物里认出 createPortal', () => {
    const code =
      'function q(e,r,t){return(0,x.jsx)(A,{children:e,container:r,state:t})}export{q as cP,z as useThree}'
    expect(findCreatePortalBinding([{ fileName: 'assets/index-abc.js', code }])).toEqual({
      file: 'index-abc.js',
      exportName: 'cP',
    })
    const arrow = 'const q=(e,t,n)=>(0,x.jsx)(A,{children:e,container:t,state:n});export{q as portal}'
    expect(findCreatePortalBinding([{ fileName: 'assets/other-aaa.js', code: arrow }]).exportName).toBe('portal')
  })
})
