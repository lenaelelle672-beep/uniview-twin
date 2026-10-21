import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))

vi.mock('./floorDecor', () => ({}))
vi.mock('../../blueprint/BlueprintView', () => ({ BlueprintView: () => null }))
vi.mock('../../minimap/mount', () => ({}))
vi.mock('./textRuntime', () => ({}))
vi.mock('../labels/ProgressiveRoomLabels', () => ({}))
vi.mock('./FloorStageCamera', () => ({}))
vi.mock('../../floors/JsonFloorInterior', () => ({}))
vi.mock('./preloadFloorGlyphs', () => ({ scheduleGlyphPreload() {} }))
vi.mock('./prewarmFloorInterior', () => ({ scheduleFloorInteriorPrewarm() {} }))

type TwinWindow = {
  __twinReady?: boolean
  __twinFirstFrameAt?: number
  __twinPrefetchAt?: number
  __twinPrefetchUnixMs?: number
  __twinFirstPrefetchDone?: boolean
  __twinView?: string
  __twinFloorShellAt?: number
  requestAnimationFrame: (cb: FrameRequestCallback) => number
  requestIdleCallback: (cb: IdleRequestCallback, opts?: IdleRequestOptions) => number
  cancelIdleCallback: (id: number) => void
}

let rafQueue: FrameRequestCallback[] = []
let idleQueue: IdleRequestCallback[] = []
let win: TwinWindow

function installWindow() {
  rafQueue = []
  idleQueue = []
  win = {
    requestAnimationFrame(cb) {
      rafQueue.push(cb)
      return rafQueue.length
    },
    requestIdleCallback(cb) {
      idleQueue.push(cb)
      return idleQueue.length
    },
    cancelIdleCallback() {},
  }
  vi.stubGlobal('window', win)
  vi.stubGlobal('requestAnimationFrame', win.requestAnimationFrame)
  vi.stubGlobal('requestIdleCallback', win.requestIdleCallback)
  return win
}

function flushRaf() {
  const q = rafQueue
  rafQueue = []
  for (const cb of q) cb(0)
}

function flushIdle() {
  const q = idleQueue
  idleQueue = []
  for (const cb of q) cb({ didTimeout: false, timeRemaining: () => 50 })
}

async function pump(times = 20) {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve()
    flushRaf()
  }
}

async function loadPrefetch() {
  vi.resetModules()
  installWindow()
  return import('./prefetchLazyChunks')
}

function mountStage(
  api: {
    schedulePrefetchAfterFirstFrame: () => void
    ensurePrefetchStarted: () => void
  },
  view: 'building' | 'floor',
) {
  api.schedulePrefetchAfterFirstFrame()
  if (view === 'floor') api.ensurePrefetchStarted()
}

afterEach(async () => {
  if (win) {
    win.__twinReady = true
    win.__twinFirstFrameAt = win.__twinFirstFrameAt ?? 1
    await pump()
    flushIdle()
  }
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('D223 prefetch 单例调度', () => {
  it('Stage 离开 building 不取消，进层立刻 ensure', () => {
    const stage = readFileSync(join(here, '../../components/Stage.tsx'), 'utf8')
    const prefetch = readFileSync(join(here, 'prefetchLazyChunks.ts'), 'utf8')
    expect(stage).toMatch(/schedulePrefetchAfterFirstFrame\(\)/)
    expect(stage).toMatch(/ensurePrefetchStarted/)
    expect(stage).not.toMatch(/if \(view !== 'building'\) return/)
    expect(stage).not.toMatch(/return schedulePrefetchAfterFirstFrame/)
    expect(prefetch).not.toMatch(/cancelIdleCallback/)
    expect(prefetch).toMatch(/let scheduleArmed = false/)
  })

  it('首帧前不执行 prefetch', async () => {
    const api = await loadPrefetch()
    mountStage(api, 'building')
    win.__twinReady = true
    await pump()
    expect(win.__twinPrefetchAt).toBeUndefined()
    expect(idleQueue).toHaveLength(0)
    flushIdle()
    expect(win.__twinPrefetchAt).toBeUndefined()
  })

  it('building→floor 切换后 prefetch 仍执行且只执行一次', async () => {
    const api = await loadPrefetch()
    mountStage(api, 'building')
    win.__twinReady = true
    win.__twinFirstFrameAt = performance.now()
    await pump()
    expect(win.__twinPrefetchAt).toBeUndefined()
    expect(idleQueue).toHaveLength(0)

    mountStage(api, 'floor')
    expect(win.__twinPrefetchAt).toBeTypeOf('number')
    const first = win.__twinPrefetchAt

    flushIdle()
    api.schedulePrefetchAfterFirstFrame()
    api.ensurePrefetchStarted()
    api.prefetchLazyChunks()
    await pump()
    flushIdle()
    expect(win.__twinPrefetchAt).toBe(first)
    expect(idleQueue).toHaveLength(0)
  })

  it('总览在首帧 cutoff 内不拉 textRuntime，过 2600ms 才拉', async () => {
    const api = await loadPrefetch()
    mountStage(api, 'building')
    win.__twinReady = true
    win.__twinFirstFrameAt = performance.now()
    win.__twinView = 'building'
    await pump()
    flushIdle()
    expect(win.__twinPrefetchAt).toBeUndefined()
    expect(win.__twinFloorShellAt).toBeUndefined()
    expect(idleQueue).toHaveLength(0)

    win.__twinFirstFrameAt = performance.now() - 2600 - 30
    await pump(4)
    expect(win.__twinPrefetchAt).toBeTypeOf('number')
    expect(win.__twinFloorShellAt).toBeTypeOf('number')
    const prefetch = readFileSync(join(here, 'prefetchLazyChunks.ts'), 'utf8')
    expect(prefetch).toMatch(/FLOOR_SHELL_AFTER_FIRST_MS = 2600/)
    expect(prefetch).not.toMatch(/requestIdleCallback/)
  })

  it('直接 floor 启动也会 prefetch', async () => {
    const api = await loadPrefetch()
    mountStage(api, 'floor')
    expect(win.__twinPrefetchAt).toBeUndefined()
    win.__twinReady = true
    win.__twinFirstFrameAt = 12
    await pump()
    expect(win.__twinPrefetchAt).toBeTypeOf('number')
    expect(idleQueue).toHaveLength(0)
    expect(win.__twinFloorShellAt).toBeTypeOf('number')
  })
})
