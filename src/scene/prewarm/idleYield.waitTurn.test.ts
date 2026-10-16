import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetTwinStore, useTwinStore } from '../../store/store'
import {
  PREWARM_SCENE_PAUSE_POLL_MS,
  createYieldController,
  floorLabelsPending,
  waitPrewarmTurn,
} from './idleYield'

function installWindow() {
  vi.stubGlobal('window', {
    addEventListener() {},
    removeEventListener() {},
    get setTimeout() {
      return setTimeout
    },
    get clearTimeout() {
      return clearTimeout
    },
  })
}

describe('D214 waitTurn 不得堵住事件循环', () => {
  beforeEach(() => {
    installWindow()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('shouldPause 一直为 true 时，同一期间排的 setTimeout 仍能执行', async () => {
    vi.useFakeTimers()
    const yieldCtl = createYieldController()
    vi.spyOn(yieldCtl, 'shouldPause').mockReturnValue(true)
    vi.spyOn(yieldCtl, 'pauseReason').mockReturnValue('scene')

    let cancelled = false
    const turn = waitPrewarmTurn(yieldCtl, undefined, () => cancelled)

    let macrotaskRan = false
    window.setTimeout(() => {
      macrotaskRan = true
    }, 50)

    await vi.advanceTimersByTimeAsync(50)
    expect(macrotaskRan).toBe(true)
    expect(PREWARM_SCENE_PAUSE_POLL_MS).toBeGreaterThanOrEqual(100)

    cancelled = true
    await vi.advanceTimersByTimeAsync(PREWARM_SCENE_PAUSE_POLL_MS)
    await turn
    yieldCtl.dispose()
  })

  it('真实 timers 下 waitTurn 跑着时 50ms 的 setTimeout 能在合理时间内 resolve', async () => {
    const yieldCtl = createYieldController()
    vi.spyOn(yieldCtl, 'shouldPause').mockReturnValue(true)
    vi.spyOn(yieldCtl, 'pauseReason').mockReturnValue('scene')

    let cancelled = false
    const turn = waitPrewarmTurn(yieldCtl, undefined, () => cancelled)
    const started = Date.now()
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50)
    })
    expect(Date.now() - started).toBeLessThan(400)

    cancelled = true
    await turn
    yieldCtl.dispose()
  })

  it('D229 楼层标签未齐时 pauseReason 含楼层标签未齐，出齐或回总览后继续', () => {
    resetTwinStore()
    useTwinStore.setState({ view: 'floor', selectedFloor: 'F1', floorFlyRequest: null })
    delete window.__twinLabelReadyAt
    delete window.__twinLabelMount
    const yieldCtl = createYieldController()
    expect(floorLabelsPending()).toBe(true)
    expect(yieldCtl.pauseReason()).toBe('楼层标签未齐')

    window.__twinLabelMount = {
      floorId: 'F1',
      mounted: 2,
      total: 4,
      priorityIds: [],
      firstBatchIds: [],
      mountedIds: ['a', 'b'],
      done: false,
    }
    expect(yieldCtl.pauseReason()).toBe('楼层标签未齐')

    window.__twinLabelReadyAt = 10
    window.__twinLabelMount = {
      floorId: 'F1',
      mounted: 4,
      total: 4,
      priorityIds: [],
      firstBatchIds: [],
      mountedIds: ['a', 'b', 'c', 'd'],
      done: true,
    }
    expect(floorLabelsPending()).toBe(false)
    expect(yieldCtl.pauseReason()).toBeNull()
    yieldCtl.dispose()

    useTwinStore.setState({ view: 'building', selectedFloor: null })
    delete window.__twinLabelReadyAt
    delete window.__twinLabelMount
    const overview = createYieldController()
    expect(floorLabelsPending()).toBe(false)
    expect(overview.pauseReason()).toBeNull()
    overview.dispose()
    resetTwinStore()
  })
})
