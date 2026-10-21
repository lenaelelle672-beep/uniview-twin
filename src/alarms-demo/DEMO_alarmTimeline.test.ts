import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEMO_END_MS, formatAlarmTime } from '../alarms/time'
import { createMockData } from '../data/mockData'
import { hydrateFloorFromDisk } from '../floors/hydrateForTests'
import {
  ALARM_OUTLINE_COLOR,
  MULTI_OUTLINE_CAP,
  SEARCH_OUTLINE_COLOR,
  multiOutlineShells,
} from '../scene/stage/deskOutline'
import { zoneAlarmCounts } from '../scene/stage/zoneHeat'
import { resetTwinStore, useTwinStore } from '../store/store'
import {
  DEMO_HISTORY_PER_FLOOR,
  DEMO_NOW_MS,
  DEMO_SAMPLE,
  DEMO_WINDOW_MS,
  buildDemoSpans,
  formatDemoClock,
  frameFromSpans,
  livePcAlarmDeskIds,
  playbackAt,
} from './DEMO_alarmTimeline'
import { ALARM_TIMELINE_INVALIDATE_THROTTLE_MS, createInvalidateThrottle } from './invalidateThrottle'
import { clearAlarmPlayback, setAlarmPlayback } from './playbackStore'

hydrateFloorFromDisk('F12')

const here = dirname(fileURLToPath(import.meta.url))

function readRepo(relative: string): string {
  return readFileSync(join(here, relative), 'utf8')
}

function f12ShellCount(devices: ReturnType<typeof createMockData>['devices'], cursorMs: number): number {
  const frame = playbackAt(devices, createMockData().alarms, cursorMs)
  if (!frame) return multiOutlineShells('F12', devices, [], null).length
  return multiOutlineShells('F12', devices, [], null, MULTI_OUTLINE_CAP, frame.alarmDeskIds).length
}

describe('DEMO 告警时间序列', () => {
  const data = createMockData()
  const spans = buildDemoSpans(data.devices, data.alarms)
  const liveIds = livePcAlarmDeskIds(data.devices)

  it('文件名和注释标明 DEMO，截止时刻与散列演示时钟对齐', () => {
    const source = readRepo('DEMO_alarmTimeline.ts')
    expect(source).toMatch(/DEMO/)
    expect(source).toMatch(/合成/)
    expect(source).toMatch(/不是出现\/恢复/)
    expect(DEMO_NOW_MS).toBe(DEMO_END_MS)
    expect(formatDemoClock(DEMO_NOW_MS)).toBe(formatAlarmTime(DEMO_NOW_MS))
    expect(DEMO_WINDOW_MS).toBe(8 * 60 * 60 * 1000)
    expect(DEMO_HISTORY_PER_FLOOR).toBeGreaterThan(1)
  })

  it('现在不产出回放帧；前一分钟的电脑工位与现网告警一致', () => {
    expect(playbackAt(data.devices, data.alarms, DEMO_NOW_MS)).toBeNull()
    expect(playbackAt(data.devices, data.alarms, DEMO_NOW_MS + 60_000)).toBeNull()
    const almost = frameFromSpans(spans, DEMO_SAMPLE.almostNowMs)
    expect(almost?.alarmDeskIds).toEqual(liveIds)
    const liveShells = multiOutlineShells('F12', data.devices, [], null)
    const via = multiOutlineShells('F12', data.devices, [], null, MULTI_OUTLINE_CAP, almost?.alarmDeskIds)
    expect(via.map((shell) => shell.deskId)).toEqual(liveShells.map((shell) => shell.deskId))
    expect(via.map((shell) => shell.color)).toEqual(liveShells.map((shell) => shell.color))
    expect(via.every((shell) => shell.color === ALARM_OUTLINE_COLOR || shell.color === SEARCH_OUTLINE_COLOR)).toBe(true)
  })

  it('窗口起点没有描边，中段含已恢复工位，各采样点的描边数不完全相同', () => {
    const start = frameFromSpans(spans, DEMO_SAMPLE.startMs)
    expect(start?.alarmDeskIds).toEqual([])
    const history = frameFromSpans(spans, DEMO_SAMPLE.withHistoryMs)
    expect(history).not.toBeNull()
    const liveSet = new Set(liveIds)
    expect(history?.alarmDeskIds.some((deskId) => !liveSet.has(deskId))).toBe(true)
    expect(history?.alarms.some((alarm) => alarm.id.startsWith('DEMO-'))).toBe(true)
    const partial = frameFromSpans(spans, DEMO_SAMPLE.partialMs)
    expect(partial?.alarmDeskIds.every((deskId) => liveSet.has(deskId))).toBe(true)
    expect(partial?.alarmDeskIds.length).toBeLessThan(liveIds.length)

    const counts = [
      f12ShellCount(data.devices, DEMO_SAMPLE.startMs),
      f12ShellCount(data.devices, DEMO_SAMPLE.withHistoryMs),
      f12ShellCount(data.devices, DEMO_SAMPLE.partialMs),
      f12ShellCount(data.devices, DEMO_SAMPLE.almostNowMs),
    ]
    expect(new Set(counts).size, counts.join(',')).toBeGreaterThanOrEqual(3)
    expect(counts[0]).toBe(0)
    expect(counts[3]).toBeGreaterThan(0)
    expect(counts[3]).toBeLessThanOrEqual(MULTI_OUTLINE_CAP)
  })

  it('热力仍吃告警数组：起点全绿，临近现在的分区计数与现网一致', () => {
    const liveCounts = zoneAlarmCounts('F12', data.alarms, data.devices)
    const start = frameFromSpans(spans, DEMO_SAMPLE.startMs)
    const startCounts = zoneAlarmCounts('F12', start?.alarms ?? [], data.devices)
    expect(liveCounts.length).toBeGreaterThan(0)
    expect(startCounts).toHaveLength(liveCounts.length)
    expect(startCounts.every((count) => count === 0)).toBe(true)
    expect(liveCounts.some((count) => count > 0)).toBe(true)
    const almost = frameFromSpans(spans, DEMO_SAMPLE.almostNowMs)
    expect(zoneAlarmCounts('F12', almost?.alarms ?? [], data.devices)).toEqual(liveCounts)
  })
})

describe('回放 store', () => {
  afterEach(() => {
    resetTwinStore()
  })

  it('清空、离层和重新装数都卸掉回放帧', () => {
    const frame = {
      cursorMs: DEMO_SAMPLE.partialMs,
      alarmDeskIds: ['F12-1'],
      alarms: [{ id: 'DEMO-x', deviceId: 'F12-1-PC', floorId: 'F12', message: 'DEMO' }],
    }
    setAlarmPlayback(frame)
    expect(useTwinStore.getState().alarmPlayback?.cursorMs).toBe(DEMO_SAMPLE.partialMs)
    clearAlarmPlayback()
    expect(useTwinStore.getState().alarmPlayback).toBeNull()
    clearAlarmPlayback()
    expect(useTwinStore.getState().alarmPlayback).toBeNull()

    useTwinStore.getState().enterFloor('F12')
    setAlarmPlayback(frame)
    useTwinStore.getState().exitFloor()
    expect(useTwinStore.getState().view).toBe('building')
    expect(useTwinStore.getState().alarmPlayback).toBeNull()
    expect(useTwinStore.getState().selectedFloor).toBe('F12')

    setAlarmPlayback(frame)
    useTwinStore.getState().setData(createMockData())
    expect(useTwinStore.getState().alarmPlayback).toBeNull()
    setAlarmPlayback(frame)
    useTwinStore.getState().setLoading()
    expect(useTwinStore.getState().alarmPlayback).toBeNull()
  })
})

describe('scrub 节流', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('120ms 内多次推送只跑第一次和窗口结束时的最后一次', () => {
    vi.useFakeTimers()
    let clock = 5_000
    const calls: string[] = []
    const throttle = createInvalidateThrottle(ALARM_TIMELINE_INVALIDATE_THROTTLE_MS, () => clock)
    expect(ALARM_TIMELINE_INVALIDATE_THROTTLE_MS).toBe(120)
    throttle.push(() => calls.push('a'))
    clock = 5_010
    throttle.push(() => calls.push('b'))
    clock = 5_030
    throttle.push(() => calls.push('c'))
    expect(calls).toEqual(['a'])
    clock = 5_120
    vi.advanceTimersByTime(110)
    expect(calls).toEqual(['a', 'c'])
  })

  it('松手立刻补上最后一次，取消则丢掉还没跑的', () => {
    vi.useFakeTimers()
    let clock = 8_000
    const calls: string[] = []
    const throttle = createInvalidateThrottle(120, () => clock)
    throttle.push(() => calls.push('a'))
    clock = 8_020
    throttle.push(() => calls.push('b'))
    throttle.flush()
    expect(calls).toEqual(['a', 'b'])
    clock = 8_040
    throttle.push(() => calls.push('c'))
    throttle.cancel()
    vi.advanceTimersByTime(200)
    expect(calls).toEqual(['a', 'b'])
  })
})

describe('时间轴分包不进首屏图', () => {
  it('UI 和过滤只从门槛里动态引入，描边和热力不夹这份实现', () => {
    const gate = readRepo('../components/AlarmTimelineGate.tsx')
    const stage = readRepo('../components/Stage.tsx')
    const ui = readRepo('AlarmTimeline.tsx')
    const dock = readRepo('../viewmarks/dock.tsx')
    const prefetch = readRepo('../scene/stage/prefetchLazyChunks.ts')
    const outlines = readRepo('../scene/stage/DeskOutline.tsx')
    const logic = readRepo('../scene/stage/deskOutline.ts')
    const heat = readRepo('../scene/stage/ZoneHeatMesh.tsx')
    const interior = readRepo('../floors/JsonFloorInterior.tsx')
    const scene = readRepo('../components/Scene.tsx')
    const app = readRepo('../App.tsx')
    expect(gate).toMatch(/import\('\.\.\/alarms-demo\/AlarmTimeline'\)/)
    expect(gate).not.toMatch(/from '\.\.\/alarms-demo\/AlarmTimeline'/)
    expect(gate).toMatch(/SOFT_SHADOW_CHUNK_AFTER_FIRST_MS/)
    expect(stage).not.toMatch(/AlarmTimeline/)
    expect(dock).toMatch(/mountAlarmTimeline/)
    expect(dock).not.toMatch(/alarms-demo/)
    expect(prefetch).toMatch(/import\('\.\.\/\.\.\/viewmarks\/dock'\)/)
    expect(prefetch).toMatch(/FLOOR_SHELL_AFTER_FIRST_MS = 2600/)
    expect(prefetch).not.toMatch(/requestIdleCallback/)
    expect(ui).toMatch(/import '\.\/AlarmTimeline\.css'/)
    expect(ui).toMatch(/createInvalidateThrottle/)
    expect(ui).toMatch(/flush\(\)/)
    expect(ui).toMatch(/clearAlarmPlayback/)
    expect(ui).toMatch(/DEMO/)
    expect(prefetch).not.toMatch(/alarms-demo/)
    expect(outlines).not.toMatch(/alarms-demo/)
    expect(logic).not.toMatch(/alarms-demo/)
    expect(heat).not.toMatch(/alarms-demo/)
    expect(heat).toMatch(/buildZoneHeatGeometry/)
    expect(heat).toMatch(/alarmPlayback/)
    expect(interior).not.toMatch(/alarms-demo|AlarmTimeline/)
    expect(scene).not.toMatch(/alarms-demo|AlarmTimeline/)
    expect(app).not.toMatch(/alarms-demo|AlarmTimeline/)
    const blob = [gate, ui, readRepo('DEMO_alarmTimeline.ts'), readRepo('invalidateThrottle.ts')].join('\n')
    expect(blob).not.toMatch(/OutlinePass|Reflector|transmission|Vignette|ssgi|pathtracer|jsdelivr|FloorBadges/i)
    expect(logic).toMatch(/MULTI_OUTLINE_CAP = 12/)
    expect(logic).toMatch(/ALARM_OUTLINE_COLOR = '#ff4d4f'/)
    expect(logic).toMatch(/SEARCH_OUTLINE_COLOR = '#faad14'/)
    expect(logic).toMatch(/DESK_OUTLINE_COLOR = '#3df0ff'/)
  })
})
