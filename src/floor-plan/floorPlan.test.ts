import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { FLOOR_PLAN_SOURCE_BLOCK, stripFloorPlanSource, threeImportNames } from '../../scripts/floorPlanPlugin'
import { pausePlanRig, resumePlanRig, type PlanRig } from './hold'
import {
  captureReadyMarks,
  notePresented,
  readyMarksLost,
  rememberReadyMarks,
  restoreReadyMarks,
  type ReadyWindow,
} from './marks'
import {
  acceptsFloorPlanKey,
  FLOOR_PLAN_PADDING,
  floorPlanBootOn,
  floorPlanBootOnAt,
  floorPlanReason,
  frameFloorPlan,
  sameFrame,
  searchOfUrl,
} from './plan'

const here = dirname(fileURLToPath(import.meta.url))

function read(relative: string): string {
  return readFileSync(join(here, relative), 'utf8')
}

describe('平面图门闩', () => {
  const open = {
    session: true,
    view: 'floor',
    firstFrame: true,
    touring: false,
    motion: false,
    station: false,
  }

  it('只在单层会话、首帧之后打开', () => {
    expect(floorPlanReason(open)).toBe('on')
    expect(floorPlanReason({ ...open, session: false })).toBe('off-session')
    expect(floorPlanReason({ ...open, firstFrame: false })).toBe('off-first-frame')
    expect(floorPlanReason({ ...open, view: 'building' })).toBe('off-view')
    expect(floorPlanReason({ ...open, view: 'blueprint' })).toBe('off-view')
    expect(floorPlanReason({ ...open, touring: true })).toBe('yield-tour')
    expect(floorPlanReason({ ...open, motion: true })).toBe('yield-motion')
    expect(floorPlanReason({ ...open, station: true })).toBe('yield-station')
  })

  it('总览上先算视图，不因为导览或爆炸去装相机', () => {
    expect(floorPlanReason({ ...open, view: 'building', touring: true, station: true })).toBe('off-view')
    expect(floorPlanReason({ ...open, session: false, view: 'floor', station: true })).toBe('off-session')
    expect(floorPlanReason({ ...open, firstFrame: false, touring: true })).toBe('off-first-frame')
  })

  it('?floorPlan=1 只在启动时打开这次会话', () => {
    expect(floorPlanBootOn('')).toBe(false)
    expect(floorPlanBootOn('?floorPlan=1')).toBe(true)
    expect(floorPlanBootOn('floorPlan=1&q=balanced')).toBe(true)
    expect(floorPlanBootOn('?floorPlan=0')).toBe(false)
    expect(floorPlanBootOn('?view=floor&floor=F12')).toBe(false)
    expect(searchOfUrl('http://127.0.0.1:5190/?floorPlan=1#x')).toBe('?floorPlan=1')
    expect(searchOfUrl('http://127.0.0.1:5190/')).toBe('')
    expect(floorPlanBootOnAt('', 'http://127.0.0.1:5190/?view=floor&floorPlan=1')).toBe(true)
    expect(floorPlanBootOnAt('?q=perf', 'http://127.0.0.1:5190/?q=perf')).toBe(false)
  })

  it('快捷键 P 不吃输入框和带修饰键的情况', () => {
    expect(acceptsFloorPlanKey({ key: 'p' })).toBe(true)
    expect(acceptsFloorPlanKey({ key: 'P' })).toBe(true)
    expect(acceptsFloorPlanKey({ key: 'g' })).toBe(false)
    expect(acceptsFloorPlanKey({ key: 'p', repeat: true })).toBe(false)
    expect(acceptsFloorPlanKey({ key: 'p', ctrlKey: true })).toBe(false)
    expect(acceptsFloorPlanKey({ key: 'p', metaKey: true })).toBe(false)
    expect(acceptsFloorPlanKey({ key: 'p', altKey: true })).toBe(false)
    expect(acceptsFloorPlanKey({ key: 'p', target: { tagName: 'INPUT' } })).toBe(false)
    expect(acceptsFloorPlanKey({ key: 'p', target: { tagName: 'TEXTAREA' } })).toBe(false)
    expect(acceptsFloorPlanKey({ key: 'p', target: { isContentEditable: true } })).toBe(false)
    expect(acceptsFloorPlanKey({ key: 'p', target: { tagName: 'BUTTON' } })).toBe(true)
  })
})

describe('平面图取景', () => {
  it('从正上方框住楼板，北朝屏幕上方', () => {
    const frame = frameFloorPlan(
      { minX: 0, maxX: 100, minY: 10, maxY: 12, minZ: 0, maxZ: 40 },
      200,
      100,
    )
    expect(frame).not.toBeNull()
    const padX = 100 * FLOOR_PLAN_PADDING
    const padZ = 40 * FLOOR_PLAN_PADDING
    expect(frame?.zoom).toBeCloseTo(Math.min(200 / padX, 100 / padZ))
    expect(frame?.x).toBeCloseTo(50)
    expect(frame?.z).toBeCloseTo(20)
    expect(frame?.targetX).toBe(frame?.x)
    expect(frame?.targetZ).toBe(frame?.z)
    expect(frame?.y).toBeGreaterThan(frame?.targetY ?? 0)
    expect(frame?.upX).toBe(0)
    expect(frame?.upY).toBe(0)
    expect(frame?.upZ).toBe(-1)
    expect(frame?.near).toBe(0.1)
    expect(frame?.far).toBeGreaterThan((frame?.y ?? 0) - 10)
  })

  it('没有尺寸或楼板是空的就不给相机', () => {
    const box = { minX: 0, maxX: 10, minY: 0, maxY: 1, minZ: 0, maxZ: 10 }
    expect(frameFloorPlan(box, 0, 100)).toBeNull()
    expect(frameFloorPlan(box, 100, 0)).toBeNull()
    expect(frameFloorPlan({ ...box, maxX: 0 }, 100, 100)).toBeNull()
    expect(frameFloorPlan({ ...box, maxZ: Number.NaN }, 100, 100)).toBeNull()
  })

  it('同一镜不换对象', () => {
    const box = { minX: 0, maxX: 80, minY: 0, maxY: 1, minZ: -20, maxZ: 20 }
    const a = frameFloorPlan(box, 800, 600)
    const b = frameFloorPlan(box, 800, 600)
    expect(sameFrame(a, b)).toBe(true)
    expect(sameFrame(a, null)).toBe(false)
    expect(sameFrame(null, null)).toBe(true)
  })
})

describe('平面图首帧锁存', () => {
  it('首帧出现过一次之后，标记被清掉也不再算没出首帧', () => {
    expect(notePresented(false, undefined)).toBe(false)
    expect(notePresented(false, Number.NaN)).toBe(false)
    expect(notePresented(false, 12)).toBe(true)
    expect(notePresented(true, undefined)).toBe(false)
  })

  it('换相机清掉的就绪标记可以写回去，空快照不覆盖', () => {
    const source: ReadyWindow = {
      __twinReady: true,
      __twinReadyAt: 10,
      __twinSuspenseReady: true,
      __twinTreeLoReadyAt: 8,
      __twinFirstFrameAt: 12,
      __twinFirstFrameUnixMs: 99,
    }
    const snap = captureReadyMarks(source)
    const empty = captureReadyMarks({})
    expect(rememberReadyMarks(snap, empty)).toBe(snap)
    const wiped: ReadyWindow = {}
    restoreReadyMarks(wiped, snap)
    expect(wiped.__twinReady).toBe(true)
    expect(wiped.__twinReadyAt).toBe(10)
    expect(wiped.__twinSuspenseReady).toBe(true)
    expect(wiped.__twinTreeLoReadyAt).toBe(8)
    expect(wiped.__twinFirstFrameAt).toBe(12)
    expect(wiped.__twinFirstFrameUnixMs).toBe(99)
    wiped.__twinFirstFrameAt = 40
    restoreReadyMarks(wiped, snap)
    expect(wiped.__twinFirstFrameAt).toBe(40)
  })

  it('记过的标记被清掉才算丢，还在的不用补', () => {
    const snap = captureReadyMarks({
      __twinReady: true,
      __twinReadyAt: 10,
      __twinSuspenseReady: true,
      __twinTreeLoReadyAt: 8,
      __twinFirstFrameAt: 12,
      __twinFirstFrameUnixMs: 99,
    })
    expect(readyMarksLost(null, {})).toBe(false)
    expect(readyMarksLost(snap, { __twinReady: true, __twinReadyAt: 10, __twinSuspenseReady: true, __twinTreeLoReadyAt: 8, __twinFirstFrameAt: 12, __twinFirstFrameUnixMs: 99 })).toBe(false)
    expect(readyMarksLost(snap, {})).toBe(true)
    expect(readyMarksLost(snap, { __twinReady: true, __twinReadyAt: 10, __twinSuspenseReady: true, __twinFirstFrameAt: 12, __twinFirstFrameUnixMs: 99 })).toBe(true)
  })
})

describe('平面图不抢 CameraControls', () => {
  it('暂停只关拖曳，update 和 setLookAt 还是原来那两份', () => {
    const update = () => false
    const setLookAt = () => undefined
    const stop = () => {
      stopped = true
    }
    let stopped = false
    const rig: PlanRig = { enabled: true, update, setLookAt, stop }
    expect(pausePlanRig(rig)).toBe(true)
    expect(rig.enabled).toBe(false)
    expect(rig.update).toBe(update)
    expect(rig.setLookAt).toBe(setLookAt)
    expect(stopped).toBe(true)
    expect(pausePlanRig(rig)).toBe(true)
    expect(resumePlanRig(rig)).toBe(true)
    expect(rig.enabled).toBe(true)
    expect(rig.__twinPlanPaused).toBe(false)
    expect(resumePlanRig(rig)).toBe(false)
  })

  it('原来就是关的，或者沿轨占着，都不替它打开', () => {
    const closed: PlanRig = { enabled: false, update: () => false }
    expect(pausePlanRig(closed)).toBe(true)
    expect(resumePlanRig(closed)).toBe(true)
    expect(closed.enabled).toBe(false)

    const claimed: PlanRig = { enabled: true, __twinMotionClaim: true, update: () => true }
    expect(pausePlanRig(claimed)).toBe(false)
    expect(claimed.enabled).toBe(true)
    expect(claimed.__twinPlanPaused).toBeUndefined()
  })
})

describe('平面图接线', () => {
  it('正交相机懒在 dock 哈希之后，不进首屏、不进 balancedFx、不抢主相机', () => {
    const dock = read('../viewmarks/dock.tsx')
    const plugin = read('../../scripts/floorPlanPlugin.ts')
    const vite = read('../../vite.config.ts')
    const mount = read('./mount.ts')
    const live = read('./FloorPlanCamera.tsx')
    const plan = read('./plan.ts')
    const hold = read('./hold.ts')
    const rig = read('../components/scene/CameraRig.tsx')
    const floor = read('../scene/stage/FloorStageCamera.tsx')
    const scene = read('../components/Scene.tsx')
    const fx = read('../components/scene/postfx/balancedFx.tsx')
    const pkg = JSON.parse(read('../../package.json')) as {
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
    }

    expect(dock).toContain(FLOOR_PLAN_SOURCE_BLOCK)
    expect(dock).toMatch(/mountDiscardProxy\(\)\n\}\)\n\/\/ T118：/)
    expect(stripFloorPlanSource(dock)).not.toMatch(/floor-plan|mountFloorPlan/)
    expect(stripFloorPlanSource(dock)).toMatch(/mountDiscardProxy\(\)\n\}\)\n\nlet root/)
    expect(() => stripFloorPlanSource('const dock = 1')).toThrow()
    expect(plugin).toContain(FLOOR_PLAN_SOURCE_BLOCK)
    expect(plugin).toMatch(/name: 'floor-plan-after-hash'/)
    expect(plugin).toMatch(/apply: 'build'/)
    expect(plugin).toMatch(/assets\/FloorPlanMount\.js/)
    expect(plugin).toMatch(/assets\/FloorPlanCamera\.js/)
    expect(threeImportNames()).toEqual([
      'Box3',
      'DepthTexture',
      'FloatType',
      'HalfFloatType',
      'LinearFilter',
      'WebGLRenderTarget',
    ])

    const plugins = vite.slice(vite.lastIndexOf('plugins: ['))
    expect(plugins.indexOf('gradientSkyAfterHash()')).toBeGreaterThanOrEqual(0)
    expect(plugins.indexOf('gradientSkyAfterHash()')).toBeLessThan(plugins.indexOf('discardProxyAfterHash()'))
    expect(plugins.indexOf('discardProxyAfterHash()')).toBeLessThan(plugins.indexOf('floorPlanAfterHash()'))
    expect(plugins.indexOf('floorPlanAfterHash()')).toBeLessThan(plugins.indexOf('isolateTransformControlsLeaves()'))

    expect(mount).toMatch(/import\('\.\/FloorPlanCamera'\)/)
    expect(mount).not.toMatch(/import \{ FloorPlanCamera \}/)
    expect(mount).not.toMatch(/@react-three|from 'three'|https?:|setFrameloop|CameraControls|setLookAt/)
    expect(mount).toMatch(/__twinSetFloorPlan/)
    expect(mount).toMatch(/floorPlanBootOnAt/)
    expect(mount).toMatch(/notePresented/)
    expect(mount).toMatch(/rememberReadyMarks/)
    expect(mount).toMatch(/readyMarksLost/)
    expect(mount).toMatch(/sceneRevisionOf/)
    expect(mount).toMatch(/firstFrame: presented/)
    expect(plan).not.toMatch(/from 'three'|@react-three|https?:/)
    expect(hold).not.toMatch(/from 'three'|@react-three|fitToBox|dollyTo/)
    expect(hold).not.toMatch(/\.update\s*=|\.setLookAt\s*=/)
    expect(hold).toMatch(/enabled = false/)

    expect(live).toMatch(/from '@react-three\/drei\/core\/OrthographicCamera'/)
    expect(live).toMatch(/<OrthographicCamera/)
    expect(live).toMatch(/makeDefault/)
    expect(live).not.toMatch(/from '@react-three\/drei'/)
    expect(live).not.toMatch(/CameraControls|setLookAt|fitToBox|dollyTo|setFrameloop/)
    expect(live).not.toMatch(/https?:|githack|jsdelivr|unpkg/)
    expect(live).toMatch(/FloorPlate/)
    expect(live).toMatch(/upZ: -1|frame\.upZ/)

    expect(rig).toMatch(/from '@react-three\/drei\/core\/CameraControls'/)
    expect(rig).toMatch(/makeDefault/)
    expect(rig).toMatch(/camera=\{camera\}/)
    expect(rig).toMatch(/isPerspectiveCamera\) pinnedCamera/)
    expect(rig).not.toMatch(/OrthographicCamera|floor-plan|__twinFloorPlan/)
    expect(floor).toMatch(/__twinFloorPlan\?\.held/)
    expect(floor).toMatch(/fitToBox\(box, false\)/)
    expect(floor).not.toMatch(/OrthographicCamera|floor-plan|makeDefault/)
    expect(scene).toMatch(/fov: pose\.fov, near: 0\.35, far: 2400/)
    expect(scene).not.toMatch(/OrthographicCamera|floor-plan|__twinFloorPlan/)

    expect(fx).toMatch(/const copyCamera = new OrthographicCamera\(-1, 1, 1, -1, 0, 1\)/)
    expect(fx).not.toMatch(/floor-plan|FloorPlan|mountFloorPlan|__twinFloorPlan/)

    const eager = [
      '../components/Scene.tsx',
      '../components/Stage.tsx',
      '../App.tsx',
      '../main.tsx',
      '../components/scene/postfx/balancedFx.tsx',
      '../components/scene/DemandLoop.tsx',
      '../components/scene/CameraRig.tsx',
      '../components/scene/LocalEnvironment.tsx',
      '../scene/softShadows.ts',
      '../scene/demandFrame.ts',
      '../scene/stage/cameraTransition.ts',
    ]
    for (const file of eager) {
      expect(read(file), file).not.toMatch(/floor-plan|mountFloorPlan|FloorPlanCamera|__twinFloorPlan/)
    }

    expect(pkg.dependencies['@react-three/drei']).toBe('10.7.9')
    expect(pkg.dependencies.three).toBe('0.186.1')
    expect(pkg.dependencies['@react-three/fiber']).toBe('9.8.1')
    expect(pkg.dependencies['@react-three/postprocessing']).toBe('3.1.3')
    expect(Object.keys(pkg.dependencies).sort()).toEqual([
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
    ])
  })
})
