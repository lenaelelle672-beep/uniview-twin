import { afterEach, describe, expect, it } from 'vitest'
import {
  markHdrLoaded,
  markHdrNotRequired,
  markHdrPmremReady,
  markSuspenseReady,
  markTreeLoReady,
  resetHdrReadyMarks,
  resetOverviewReadyMarks,
} from './overviewReady'

type Twin = typeof globalThis & Window

function tw(): Twin {
  return globalThis as Twin
}

afterEach(() => {
  resetOverviewReadyMarks()
  resetHdrReadyMarks()
})

describe('总览就绪闸门 D126', () => {
  it('Suspense 到了但 HDR/PMREM 没到，不置 __twinReady', () => {
    markSuspenseReady()
    expect(tw().__twinReady).toBeFalsy()
    markHdrLoaded()
    expect(tw().__twinReady).toBeFalsy()
    expect(tw().__twinHdrLoadedAt).toBeGreaterThan(0)
  })

  it('HDR 完成再 PMREM 再 Suspense，才置 ready，顺序时间戳递增', () => {
    markHdrLoaded()
    const loaded = tw().__twinHdrLoadedAt!
    markHdrPmremReady()
    const pmrem = tw().__twinHdrReadyAt!
    markTreeLoReady()
    markSuspenseReady()
    expect(tw().__twinReady).toBe(true)
    expect(tw().__twinReadyAt).toBeGreaterThanOrEqual(pmrem)
    expect(pmrem).toBeGreaterThanOrEqual(loaded)
  })

  it('白模不要求 HDR，Suspense 到了就 ready', () => {
    markHdrNotRequired()
    expect(tw().__twinReady).toBeFalsy()
    markSuspenseReady()
    expect(tw().__twinReady).toBe(true)
  })

  it('Suspense 和 HDR 到了但树 lo 没到，不置 __twinReady', () => {
    markHdrPmremReady()
    markSuspenseReady()
    expect(tw().__twinReady).toBeFalsy()
    markTreeLoReady()
    expect(tw().__twinReady).toBe(true)
  })
})
