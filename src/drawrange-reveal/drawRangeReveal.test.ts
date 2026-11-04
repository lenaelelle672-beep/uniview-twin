import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { DRAW_RANGE_REVEAL_SOURCE_BLOCK } from '../../scripts/drawRangeRevealPlugin'
import { USER_CAMERA_SMOOTH_TIME } from '../scene/stage/cameraTransition'
import { createRevealDriver, type RevealEnv, type RevealFrameState } from './driver'
import { mountDrawRangeReveal } from './mount'
import {
  collectRevealMeshes,
  DRAW_RANGE_REVEAL_MS,
  drawableCount,
  easeReveal,
  revealableMesh,
  revealCount,
  revealSkip,
  revealTick,
  type RangeMesh,
  type RevealGate,
} from './plan'
import { createDrawRangeReveal } from './reveal'

const here = dirname(fileURLToPath(import.meta.url))

function read(path: string): string {
  return readFileSync(join(here, path), 'utf8')
}

const material = new THREE.MeshBasicMaterial()
const renderer = {} as THREE.WebGLRenderer
const camera = new THREE.PerspectiveCamera()

function range(object: THREE.Object3D): RangeMesh {
  return object as unknown as RangeMesh
}

function named<T extends THREE.Object3D>(object: T, name: string): T {
  object.name = name
  return object
}

/** 10×10 段平面：600 个索引，121 个顶点。 */
function slabGeometry(): THREE.BufferGeometry {
  return new THREE.PlaneGeometry(10, 10, 10, 10)
}

/** 与 three 的 renderObject 同序：onBeforeRender → 读 drawRange 画 → onAfterRender。 */
function draw(mesh: THREE.Mesh, group: THREE.Group | null = null): { start: number; count: number } {
  const scene = new THREE.Scene()
  mesh.onBeforeRender(renderer, scene, camera, mesh.geometry, material, group as never)
  const seen = { start: mesh.geometry.drawRange.start, count: mesh.geometry.drawRange.count }
  mesh.onAfterRender(renderer, scene, camera, mesh.geometry, material, group as never)
  return seen
}

function defaultRange(geometry: THREE.BufferGeometry) {
  expect(geometry.drawRange.start).toBe(0)
  expect(geometry.drawRange.count).toBe(Infinity)
}

function ownHooks(mesh: THREE.Object3D): boolean {
  return Object.prototype.hasOwnProperty.call(mesh, 'onBeforeRender') || Object.prototype.hasOwnProperty.call(mesh, 'onAfterRender')
}

function floorScene() {
  const scene = new THREE.Scene()
  const interior = named(new THREE.Group(), 'FloorInterior')
  const plate = named(new THREE.Group(), 'FloorPlate')
  const slab = named(new THREE.Mesh(slabGeometry(), material), 'FloorSlab')
  const cores = named(new THREE.Mesh(new THREE.BoxGeometry(2, 3, 2).toNonIndexed(), material), 'FloorCores')
  const desks = named(new THREE.InstancedMesh(new THREE.BoxGeometry(), material, 40), 'Workstations')
  plate.add(slab)
  interior.add(plate, cores, desks)
  scene.add(interior)
  return { scene, interior, slab, cores, desks }
}

describe('count 语义', () => {
  it('有索引数索引，没索引数顶点，按整三角形取', () => {
    const indexed = slabGeometry()
    expect(drawableCount(range(new THREE.Mesh(indexed)).geometry)).toBe(600)
    expect(drawableCount(range(new THREE.Mesh(indexed.toNonIndexed())).geometry)).toBe(600)
    const odd = new THREE.BufferGeometry()
    odd.setAttribute('position', new THREE.BufferAttribute(new Float32Array(10 * 3), 3))
    expect(drawableCount(range(new THREE.Mesh(odd)).geometry)).toBe(10)
    expect(revealCount(10, 1)).toBe(9)
    expect(revealCount(600, 0)).toBe(0)
    expect(revealCount(600, 0.5)).toBe(525)
    expect(revealCount(600, 1)).toBe(600)
    for (let t = 0; t <= 1; t += 0.05) expect(revealCount(600, t) % 3).toBe(0)
    expect(drawableCount(null)).toBe(0)
  })

  it('缓出曲线单调，两端钳住', () => {
    expect(easeReveal(-1)).toBe(0)
    expect(easeReveal(Number.NaN)).toBe(0)
    expect(easeReveal(0.5)).toBeCloseTo(0.875)
    expect(easeReveal(2)).toBe(1)
    let last = 0
    for (let t = 0; t <= 1; t += 0.01) {
      expect(easeReveal(t)).toBeGreaterThanOrEqual(last)
      last = easeReveal(t)
    }
  })

  it('实例化、批量、蒙皮和 InstancedBufferGeometry 一律不收，同名也不收', () => {
    const instanced = named(new THREE.InstancedMesh(slabGeometry(), material, 40), 'FloorSlab')
    const batched = named(new THREE.BatchedMesh(4, 200, 600, material), 'FloorCores')
    const skinned = named(new THREE.SkinnedMesh(slabGeometry(), material), 'FloorSlab')
    const troika = new THREE.InstancedBufferGeometry()
    troika.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12 * 3), 3))
    troika.instanceCount = 5
    const text = named(new THREE.Mesh(troika, material), 'FloorSlab')
    for (const mesh of [instanced, batched, skinned, text]) expect(revealableMesh(range(mesh))).toBe(false)

    const interior = named(new THREE.Group(), 'FloorInterior')
    interior.add(instanced, batched, skinned, text)
    expect(collectRevealMeshes(range(interior))).toEqual([])

    const reveal = createDrawRangeReveal()
    expect(reveal.begin([instanced, batched, skinned, text].map(range))).toBe(0)
    expect(instanced.count).toBe(40)
    expect(troika.instanceCount).toBe(5)
    expect(ownHooks(instanced)).toBe(false)
  })

  it('别人改过 drawRange 的、空几何、非 Mesh 都跳过', () => {
    const custom = slabGeometry()
    custom.setDrawRange(6, 300)
    expect(revealableMesh(range(new THREE.Mesh(custom)))).toBe(false)
    expect(revealableMesh(range(new THREE.Mesh(new THREE.BufferGeometry())))).toBe(false)
    expect(revealableMesh(range(new THREE.Group()))).toBe(false)
    expect(revealableMesh(range(new THREE.Line(slabGeometry())))).toBe(false)
    expect(revealableMesh(null)).toBe(false)
  })

  it('只收 FloorInterior 下的 FloorSlab / FloorCores，同几何只收一次', () => {
    const { interior, slab, cores } = floorScene()
    const twin = named(new THREE.Mesh(slab.geometry, material), 'FloorSlab')
    interior.add(twin)
    interior.add(named(new THREE.Mesh(slabGeometry(), material), 'PantryPad'))
    const found = collectRevealMeshes(range(interior))
    expect(found.length).toBe(2)
    expect(found[0]).toBe(slab)
    expect(found[1]).toBe(cores)
    expect(collectRevealMeshes(null)).toEqual([])
  })
})

describe('setDrawRange 薄封装', () => {
  it('只在这块网格那次绘制里收窄，画完放回原值', () => {
    const { slab, cores } = floorScene()
    const reveal = createDrawRangeReveal()
    expect(reveal.begin([range(slab), range(cores)])).toBe(2)
    expect(reveal.active()).toBe(true)

    expect(draw(slab)).toEqual({ start: 0, count: 0 })
    defaultRange(slab.geometry)

    reveal.frame(0.5)
    expect(reveal.shown()).toEqual([525, 30])
    expect(draw(slab)).toEqual({ start: 0, count: 525 })
    expect(draw(cores)).toEqual({ start: 0, count: 30 })
    defaultRange(slab.geometry)
    defaultRange(cores.geometry)

    reveal.frame(1)
    expect(draw(slab)).toEqual({ start: 0, count: 600 })
    reveal.end()
    expect(reveal.active()).toBe(false)
    expect(ownHooks(slab)).toBe(false)
    expect(ownHooks(cores)).toBe(false)
    expect(draw(slab).count).toBe(Infinity)
    reveal.end()
  })

  it('帧与帧之间 clone、射线和包围盒都看到整块', () => {
    const { slab } = floorScene()
    slab.updateMatrixWorld(true)
    const reveal = createDrawRangeReveal()
    reveal.begin([range(slab)])
    reveal.frame(0)
    expect(draw(slab).count).toBe(0)

    expect(slab.geometry.clone().drawRange.count).toBe(Infinity)
    const raycaster = new THREE.Raycaster(new THREE.Vector3(4.3, 3.6, 5), new THREE.Vector3(0, 0, -1))
    expect(raycaster.intersectObject(slab).length).toBe(1)
    slab.geometry.computeBoundingBox()
    expect(slab.geometry.boundingBox?.max.x).toBeCloseTo(5)
    reveal.end()
  })

  it('多材质按 group 各画一次，每次都收窄、都放回', () => {
    const geometry = slabGeometry()
    geometry.addGroup(0, 300, 0)
    geometry.addGroup(300, 300, 1)
    const mesh = named(new THREE.Mesh(geometry, [material, material]), 'FloorSlab')
    const reveal = createDrawRangeReveal()
    reveal.begin([range(mesh)])
    reveal.frame(0.5)
    const groupA = new THREE.Group()
    const groupB = new THREE.Group()
    expect(draw(mesh, groupA).count).toBe(525)
    expect(draw(mesh, groupB).count).toBe(525)
    defaultRange(geometry)
    reveal.end()
  })

  it('原有钩子先调、原样放回；别人中途换的钩子不动', () => {
    const { slab, cores } = floorScene()
    const before = vi.fn()
    const after = vi.fn()
    slab.onBeforeRender = before
    slab.onAfterRender = after
    const reveal = createDrawRangeReveal()
    reveal.begin([range(slab), range(cores)])
    reveal.frame(0.5)
    expect(draw(slab).count).toBe(525)
    expect(before).toHaveBeenCalledTimes(1)
    expect(after).toHaveBeenCalledTimes(1)
    expect(before.mock.calls[0]?.[3]).toBe(slab.geometry)

    const theirs = vi.fn()
    cores.onBeforeRender = theirs
    reveal.end()
    expect(slab.onBeforeRender).toBe(before)
    expect(slab.onAfterRender).toBe(after)
    expect(cores.onBeforeRender).toBe(theirs)
    expect(Object.prototype.hasOwnProperty.call(cores, 'onAfterRender')).toBe(false)
  })

  it('绘制中途收尾也把 drawRange 放回；别的几何经过钩子不收窄', () => {
    const { slab } = floorScene()
    const reveal = createDrawRangeReveal()
    reveal.begin([range(slab)])
    reveal.frame(0.5)
    const scene = new THREE.Scene()
    slab.onBeforeRender(renderer, scene, camera, slab.geometry, material, null as never)
    slab.onBeforeRender(renderer, scene, camera, slab.geometry, material, null as never)
    expect(slab.geometry.drawRange.count).toBe(525)
    reveal.end()
    defaultRange(slab.geometry)

    reveal.begin([range(slab)])
    const other = slabGeometry()
    slab.onBeforeRender(renderer, scene, camera, other, material, null as never)
    defaultRange(slab.geometry)
    defaultRange(other)
    reveal.end()
  })

  it('绘制时下一帧没排上就整帧画全，帧后收尾一次', async () => {
    const { slab, cores } = floorScene()
    let queued = true
    const onStall = vi.fn()
    const reveal = createDrawRangeReveal({ nextFrame: () => queued, onStall })
    reveal.begin([range(slab), range(cores)])
    reveal.frame(0.5)
    expect(draw(slab).count).toBe(525)
    queued = false
    expect(draw(slab).count).toBe(Infinity)
    queued = true
    expect(draw(cores).count).toBe(Infinity)
    expect(reveal.stalled()).toBe(true)
    expect(onStall).not.toHaveBeenCalled()
    await Promise.resolve()
    expect(onStall).toHaveBeenCalledTimes(1)
    defaultRange(slab.geometry)

    reveal.begin([range(slab)])
    expect(reveal.stalled()).toBe(false)
    expect(draw(slab).count).toBe(0)
    reveal.end()
  })
})

describe('门闩与跳过', () => {
  const open: RevealGate = {
    view: 'floor',
    overlay: false,
    night: false,
    reducedMotion: false,
    hidden: false,
    stationBusy: false,
  }

  it('加载条已收、昼景、没有减少动态时才显形', () => {
    expect(revealSkip(open)).toBeNull()
    expect(revealSkip({ ...open, view: 'building' })).toBe('view')
    expect(revealSkip({ ...open, overlay: true })).toBe('overlay')
    expect(revealSkip({ ...open, night: true })).toBe('night')
    expect(revealSkip({ ...open, reducedMotion: true })).toBe('reduced-motion')
    expect(revealSkip({ ...open, hidden: true })).toBe('hidden')
    expect(revealSkip({ ...open, stationBusy: true })).toBe('station')
  })

  it('时长落在进层滑行里', () => {
    expect(USER_CAMERA_SMOOTH_TIME).toBe(0.42)
    expect(DRAW_RANGE_REVEAL_MS).toBe(420)
    const tick = { now: 0, startedAt: 0, view: 'floor', attached: true, hidden: false }
    expect(revealTick(tick)).toEqual({ progress: 0 })
    expect(revealTick({ ...tick, now: 210 })).toEqual({ progress: 0.5 })
    expect(revealTick({ ...tick, now: 420 })).toEqual({ end: 'done' })
    expect(revealTick({ ...tick, view: 'building' })).toEqual({ end: 'view' })
    expect(revealTick({ ...tick, attached: false })).toEqual({ end: 'detached' })
    expect(revealTick({ ...tick, hidden: true })).toEqual({ end: 'hidden' })
    expect(revealTick({ ...tick, now: Number.NaN })).toEqual({ end: 'done' })
  })
})

interface Flags {
  view: string | undefined
  overlay: boolean
  night: boolean
  reducedMotion: boolean
  hidden: boolean
  stationBusy: boolean
}

/**
 * late：分包挂上时已经停在这一层。默认先在总览跑过一帧，和 dock 晚加载后再进层一样。
 */
function harness(scene: THREE.Scene, flags: Partial<Flags> = {}, options: { late?: boolean } = {}) {
  const state: Flags = {
    view: 'floor',
    overlay: false,
    night: false,
    reducedMotion: false,
    hidden: false,
    stationBusy: false,
    ...flags,
  }
  let now = 1000
  let nextTimer = 0
  const timers = new Map<number, () => void>()
  /** 空闲门是否放行。关掉时 invalidate 不动 frames，和店里被推迟时一样。 */
  let gateOpen = true
  const internal = { frames: 0 }
  const invalidate = vi.fn(() => {
    if (gateOpen) internal.frames = 2
  })
  const frame: RevealFrameState = { invalidate, internal }
  const env: RevealEnv = {
    now: () => now,
    view: () => state.view,
    scene: () => range(scene),
    overlay: () => state.overlay,
    night: () => state.night,
    reducedMotion: () => state.reducedMotion,
    hidden: () => state.hidden,
    stationBusy: () => state.stationBusy,
    floorId: () => 'F12',
    setTimer: (run) => {
      nextTimer += 1
      timers.set(nextTimer, run)
      return nextTimer
    },
    clearTimer: (id) => {
      timers.delete(id as number)
    },
    kick: vi.fn(),
    publish: vi.fn(),
  }
  const driver = createRevealDriver(env)
  if (!options.late) {
    const view = state.view
    state.view = 'building'
    driver.onFrame(frame)
    state.view = view
  }
  return {
    state,
    env,
    driver,
    invalidate,
    timers,
    advance(ms: number) {
      now += ms
    },
    closeGate() {
      gateOpen = false
    },
    openGate() {
      gateOpen = true
    },
    /**
     * R3F 一帧：先跑订阅者，再画，再把 frames 减一，然后清微任务。
     * later：同一帧里排在后面的订阅者（比如 FloorStageCamera 开始滑行）又要了一帧。
     */
    async tick(meshes: THREE.Mesh[] = [], later?: () => void) {
      internal.frames = Math.max(internal.frames, 1)
      driver.onFrame(frame)
      later?.()
      const counts = meshes.map((mesh) => draw(mesh).count)
      internal.frames = Math.max(0, internal.frames - 1)
      await Promise.resolve()
      return counts
    },
    fireTimers() {
      const pending = [...timers.values()]
      timers.clear()
      for (const run of pending) run()
    },
  }
}

describe('帧驱动', () => {
  it('进层：只在动画期 invalidate，画完摘钩子、计数归位', async () => {
    const { scene, slab, cores, desks } = floorScene()
    const h = harness(scene)
    expect(await h.tick([slab, cores])).toEqual([0, 0])
    expect(h.driver.stats()).toMatchObject({ active: true, runs: 1, meshes: ['FloorSlab', 'FloorCores'], floorId: 'F12' })
    expect(h.invalidate).toHaveBeenCalledTimes(1)
    expect(h.timers.size).toBe(1)

    h.advance(210)
    expect(await h.tick([slab, cores])).toEqual([525, 30])
    expect(h.invalidate).toHaveBeenCalledTimes(2)
    defaultRange(slab.geometry)

    h.advance(210)
    expect(await h.tick([slab, cores])).toEqual([Infinity, Infinity])
    expect(h.driver.stats()).toMatchObject({ active: false, completed: 1, last: 'done', progress: 1 })
    expect(h.invalidate).toHaveBeenCalledTimes(2)
    expect(h.timers.size).toBe(0)
    expect(ownHooks(slab)).toBe(false)
    expect(ownHooks(cores)).toBe(false)
    expect(desks.count).toBe(40)

    h.advance(50)
    await h.tick([slab])
    await h.tick([slab])
    expect(h.invalidate).toHaveBeenCalledTimes(2)
    expect(h.driver.stats().runs).toBe(1)
  })

  it('空闲门推迟下一帧时，这一帧直接画全，帧后收尾，不停在半截', async () => {
    const { scene, slab } = floorScene()
    const h = harness(scene)
    await h.tick([slab])
    h.closeGate()
    h.advance(100)
    expect(await h.tick([slab])).toEqual([Infinity])
    expect(h.driver.stats()).toMatchObject({ active: false, last: 'no-frame' })
    expect(ownHooks(slab)).toBe(false)
    expect(h.timers.size).toBe(0)
  })

  it('首次进层：镜头在同一帧稍后才开始滑，照样显形', async () => {
    const { scene, slab } = floorScene()
    const h = harness(scene)
    h.closeGate()
    const glide = () => {
      h.openGate()
      void h.invalidate()
    }
    expect(await h.tick([slab], glide)).toEqual([0])
    expect(h.driver.stats()).toMatchObject({ active: true, runs: 1, last: null })
    h.advance(210)
    expect(await h.tick([slab])).toEqual([525])
  })

  it('镜头已停稳又没有别的续帧：第一帧就画全，什么都不留', async () => {
    const { scene, slab } = floorScene()
    const h = harness(scene)
    h.closeGate()
    expect(await h.tick([slab])).toEqual([Infinity])
    expect(h.driver.stats()).toMatchObject({ active: false, runs: 1, last: 'no-frame' })
    expect(ownHooks(slab)).toBe(false)
    await h.tick([slab])
    expect(h.driver.stats().runs).toBe(1)
  })

  it('分包晚挂上时已经画出来的这一层不重画', async () => {
    const { scene, slab, cores } = floorScene()
    const h = harness(scene, {}, { late: true })
    expect(await h.tick([slab])).toEqual([Infinity])
    expect(h.driver.stats()).toMatchObject({ active: false, runs: 0, last: 'late' })
    expect(h.invalidate).not.toHaveBeenCalled()
    expect(ownHooks(slab)).toBe(false)

    slab.geometry = slabGeometry()
    cores.geometry = new THREE.BoxGeometry(1, 3, 1)
    expect(await h.tick([slab, cores])).toEqual([0, 0])
    expect(h.driver.stats().runs).toBe(1)
  })

  it('加载条、夜景、减少动态、工位爆炸、页面隐藏都不显形，也不 invalidate', async () => {
    const cases: Array<[Partial<Flags>, string]> = [
      [{ overlay: true }, 'overlay'],
      [{ night: true }, 'night'],
      [{ reducedMotion: true }, 'reduced-motion'],
      [{ stationBusy: true }, 'station'],
      [{ hidden: true }, 'hidden'],
    ]
    for (const [flags, reason] of cases) {
      const { scene, slab } = floorScene()
      const h = harness(scene, flags)
      expect(await h.tick([slab])).toEqual([Infinity])
      expect(h.driver.stats()).toMatchObject({ active: false, runs: 0, last: reason })
      expect(h.invalidate).not.toHaveBeenCalled()
      expect(ownHooks(slab)).toBe(false)
      h.state.overlay = false
      h.state.night = false
      await h.tick([slab])
      expect(h.driver.stats().runs).toBe(0)
    }
  })

  it('不在楼层视图什么都不做；离层收尾，再进同一层再显形', async () => {
    const { scene, slab } = floorScene()
    const h = harness(scene, { view: 'building' })
    await h.tick([slab])
    expect(h.driver.stats()).toMatchObject({ runs: 0, last: null })
    expect(h.invalidate).not.toHaveBeenCalled()

    h.state.view = 'floor'
    await h.tick([slab])
    h.advance(100)
    h.state.view = 'building'
    expect(await h.tick([slab])).toEqual([Infinity])
    expect(h.driver.stats()).toMatchObject({ active: false, last: 'view' })

    h.state.view = 'floor'
    expect(await h.tick([slab])).toEqual([0])
    expect(h.driver.stats().runs).toBe(2)
  })

  it('网格被卸下或页面切到后台就收尾', async () => {
    const { scene, slab, interior } = floorScene()
    const h = harness(scene)
    await h.tick([slab])
    interior.removeFromParent()
    await h.tick()
    expect(h.driver.stats().last).toBe('detached')
    expect(ownHooks(slab)).toBe(false)

    const next = floorScene()
    const g = harness(next.scene)
    await g.tick([next.slab])
    g.state.hidden = true
    expect(await g.tick([next.slab])).toEqual([Infinity])
    expect(g.driver.stats().last).toBe('hidden')
  })

  it('换层复用同一块网格、只换几何，也重新显形', async () => {
    const { scene, slab, cores } = floorScene()
    const h = harness(scene)
    await h.tick([slab])
    h.advance(DRAW_RANGE_REVEAL_MS)
    await h.tick([slab])
    expect(h.driver.stats().runs).toBe(1)

    slab.geometry = slabGeometry()
    cores.geometry = new THREE.BoxGeometry(1, 3, 1)
    expect(await h.tick([slab, cores])).toEqual([0, 0])
    expect(h.driver.stats().runs).toBe(2)
  })

  it('帧回调断了，看门狗放回原值并补一帧', async () => {
    const { scene, slab } = floorScene()
    const h = harness(scene)
    await h.tick([slab])
    h.fireTimers()
    expect(h.driver.stats()).toMatchObject({ active: false, last: 'watchdog' })
    expect(h.env.kick).toHaveBeenCalledTimes(1)
    expect(ownHooks(slab)).toBe(false)
    defaultRange(slab.geometry)
  })

  it('节点环境直接挂载也不抛', () => {
    expect(() => mountDrawRangeReveal()).not.toThrow()
  })
})

describe('分包不进首屏', () => {
  it('懒挂在 dock 哈希之后，不碰 demand 闸门、加载条和楼层几何', () => {
    const dock = read('../viewmarks/dock.tsx')
    const plan = read('./plan.ts')
    const reveal = read('./reveal.ts')
    const driver = read('./driver.ts')
    const mount = read('./mount.ts')
    const plugin = read('../../scripts/drawRangeRevealPlugin.ts')
    const vite = read('../../vite.config.ts')
    const pkg = JSON.parse(read('../../package.json')) as {
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
    }

    expect(dock).toContain(DRAW_RANGE_REVEAL_SOURCE_BLOCK)
    expect(dock).toMatch(/mountOverviewClouds\(\)\n\}\)\n\/\/ T112：/)
    expect(dock).toMatch(/import\('\.\.\/drawrange-reveal\/mount'\)/)
    expect(dock).not.toMatch(/from '\.\.\/drawrange-reveal\/mount'/)
    expect(dock.replace(DRAW_RANGE_REVEAL_SOURCE_BLOCK, '')).not.toMatch(/drawrange-reveal|mountDrawRangeReveal/)
    expect(dock.replace(DRAW_RANGE_REVEAL_SOURCE_BLOCK, '')).toMatch(/mountOverviewClouds\(\)\n\}\)\n\nlet root/)
    expect(plugin).toContain(DRAW_RANGE_REVEAL_SOURCE_BLOCK)
    expect(plugin).toMatch(/name: 'draw-range-reveal-after-hash'/)
    expect(plugin).toMatch(/apply: 'build'/)
    expect(plugin).toMatch(/assets\/DrawRangeReveal\.js/)
    const plugins = vite.slice(vite.lastIndexOf('plugins: ['))
    expect(plugins.indexOf('visualViewportAfterHash()')).toBeLessThan(plugins.indexOf('drawRangeRevealAfterHash()'))
    expect(plugins.indexOf('drawRangeRevealAfterHash()')).toBeLessThan(plugins.indexOf('isolateTransformControlsLeaves()'))

    expect(reveal).toMatch(/setDrawRange\(/)
    expect(mount).toMatch(/subscribe\?\.\(\{ current: onFrame \}, 0, root\.store\)/)
    expect(mount).toMatch(/data-twin-asset-load/)
    expect(mount).toMatch(/prefers-reduced-motion/)
    const blob = [plan, reveal, driver, mount].join('\n')
    expect(blob).not.toMatch(/from ['"][^'"]*(three|zustand|react|gsap|framer|spring|anime|maath|viewmarks|demandFrame|idleFrames)/)
    expect(blob).not.toMatch(/requestAnimationFrame|setInterval|askFrame|holdDemandFrame|\.frames\s*=[^=]/)
    expect(blob).not.toMatch(/clippingPlanes|localClippingEnabled|stencil|SoftShadows|FogExp2|ssgi|jsdelivr/i)
    expect(blob).not.toMatch(/console\./)

    const untouched = [
      '../scene/demandFrame.ts',
      '../scene/demandFrameMount.ts',
      '../scene/idleFrames.ts',
      '../scene/stage/cameraRest.ts',
      '../components/scene/DemandLoop.tsx',
      '../components/AssetLoadOverlay.tsx',
      '../scene/stage/FloorStageCamera.tsx',
      '../floors/JsonFloorInterior.tsx',
      '../floors/floorInteriorMesh.ts',
      '../scene/stage/B1Interior.tsx',
      '../scene/stage/TowerInterior.tsx',
      '../scene/pick/PickBvh.tsx',
      '../scene/wire/targets.ts',
    ]
    for (const file of untouched) {
      expect(read(file), file).not.toMatch(/setDrawRange|drawrange-reveal|__twinDrawRangeReveal/)
    }

    expect(pkg.dependencies['@react-three/drei']).toBe('10.7.9')
    expect(pkg.dependencies['@react-three/fiber']).toBe('9.8.1')
    expect(pkg.dependencies.three).toBe('0.186.1')
    expect(pkg.dependencies['@react-three/postprocessing']).toBe('3.1.3')
    expect(pkg.dependencies.postprocessing).toBe('6.39.5')
    const deps = [...Object.keys(pkg.dependencies), ...Object.keys(pkg.devDependencies)]
    for (const name of ['gsap', 'framer-motion', '@react-spring/three', 'animejs', 'maath', 'popmotion', '@tweenjs/tween.js']) {
      expect(deps).not.toContain(name)
    }
  })
})
