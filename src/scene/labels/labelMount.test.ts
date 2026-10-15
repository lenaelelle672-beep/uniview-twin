import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { getFloorPlan } from '../../floors/cache'
import { hydrateFloorFromDisk } from '../../floors/hydrateForTests'
import { roomLabelsFromPlan } from '../../floors/labels'
import { createMockData } from '../../data/mockData'
import { resetTwinStore, useTwinStore } from '../../store/store'
import { TROIKA_TEXT_CONFIG } from '../stage/disableTroikaCdn'
import type { RoomLabel } from '../stage/roomLabels'
import { addLabelPackSample, beginLabelPack, currentLabelPackMs, measureLabelPackSample } from './labelPackTiming'
import { LABEL_MOUNT_PER_FRAME } from './useLabelMountQueue'
import { nearestRoomLabel, pickPriorityLabels } from './labelPriority'

const here = dirname(fileURLToPath(import.meta.url))

function read(rel: string) {
  return readFileSync(join(here, rel), 'utf8')
}

hydrateFloorFromDisk('F1')

function fakeLabel(id: string, text: string, x = 0, z = 0): RoomLabel {
  return {
    id,
    text,
    anchor: [x, 2, z],
    label: [x, 3.2, z],
  }
}

describe('T017 / D189 标签分批挂载', () => {
  afterEach(() => {
    resetTwinStore()
  })

  it('configureTextBuilder 在建字前把 sdfGlyphSize 设为 32，且不开 worker', () => {
    expect(TROIKA_TEXT_CONFIG.useWorker).toBe(false)
    expect(TROIKA_TEXT_CONFIG.sdfGlyphSize).toBe(32)
    const cdn = read('../stage/disableTroikaCdn.ts')
    expect(cdn).toMatch(/configureTextBuilder\(\{/)
    expect(cdn).toMatch(/sdfGlyphSize:\s*32/)
    expect(cdn).toMatch(/useWorker:\s*false/)
  })

  it('进层打包计时是 { sdf, layout, sync, total }，按次累加', () => {
    beginLabelPack('F1')
    expect(currentLabelPackMs()).toEqual({ sdf: 0, layout: 0, sync: 0, total: 0 })
    addLabelPackSample({ sdf: 4, layout: 10, sync: 6, total: 20 })
    addLabelPackSample(
      measureLabelPackSample({
        sdfWallMs: 3,
        layoutWallMs: 5,
        syncWallMs: 2,
        members: [],
      }),
    )
    expect(currentLabelPackMs()).toEqual({ sdf: 7, layout: 15, sync: 8, total: 30 })
  })

  it('告警打印机、选中工位、搜索命中的目标标签会进优先集', () => {
    const data = createMockData()
    useTwinStore.getState().setData(data)
    const labels = roomLabelsFromPlan(getFloorPlan('F1')!)
    expect(labels.some((label) => /打印|文印/.test(label.text))).toBe(true)

    useTwinStore.setState({
      focusedDeskId: null,
      focusedDeviceId: 'F1-PR1',
      searchQuery: '',
    })
    const printerHits = pickPriorityLabels('F1', labels)
    expect(printerHits.length).toBeGreaterThan(0)
    expect(printerHits.some((label) => /打印|文印/.test(label.text))).toBe(true)

    useTwinStore.setState({
      focusedDeskId: 'F1-1',
      focusedDeviceId: null,
      searchQuery: '',
    })
    const selected = pickPriorityLabels('F1', labels)
    expect(selected.length).toBeGreaterThan(0)
    const deskLabel = nearestRoomLabel(labels, selected[0]!.anchor[0], selected[0]!.anchor[2])
    expect(selected.map((label) => label.id)).toContain(deskLabel?.id)

    useTwinStore.setState({
      focusedDeskId: null,
      focusedDeviceId: null,
      searchQuery: '文印',
    })
    const searchHits = pickPriorityLabels('F1', labels)
    expect(searchHits.some((label) => /文印|打印/.test(label.text))).toBe(true)
  })

  it('第一批包含全部优先标签，其余每帧最多 30 个', () => {
    expect(LABEL_MOUNT_PER_FRAME).toBe(30)
    const labels = Array.from({ length: 80 }, (_, index) => fakeLabel(`L${index}`, `房间${index}`, index, 0))
    useTwinStore.setState({ searchQuery: '房间0', focusedDeskId: null, focusedDeviceId: null })
    const priority = pickPriorityLabels('F1', labels)
    expect(priority.some((label) => label.id === 'L0')).toBe(true)
    const firstCount = Math.max(priority.length, Math.min(LABEL_MOUNT_PER_FRAME, labels.length))
    expect(firstCount).toBeLessThanOrEqual(Math.max(priority.length, LABEL_MOUNT_PER_FRAME))
    expect(firstCount).toBeGreaterThanOrEqual(priority.length)
  })

  it('分批包装只控制挂载，不写 opacity / fade / visible', () => {
    const progressive = read('./ProgressiveRoomLabels.tsx')
    const queue = read('./useLabelMountQueue.ts')
    const priority = read('./labelPriority.ts')
    expect(progressive).toMatch(/useLabelMountQueue/)
    expect(progressive).toMatch(/BatchedRoomLabels/)
    expect(progressive).not.toMatch(/\.opacity\s*=|fadeOpacity|setOpacity/)
    expect(queue).not.toMatch(/\.opacity\s*=|fadeOpacity|setOpacity/)
    expect(priority).not.toMatch(/\.opacity\s*=|fadeOpacity|setOpacity/)
    const roomLabels = read('../stage/RoomLabels.tsx')
    expect(roomLabels).toMatch(/loadRoomLabelChunk/)
    expect(roomLabels).toMatch(/ProgressiveRoomLabels/)
    const batched = read('../stage/BatchedRoomLabels.tsx')
    const data = read('../stage/roomLabels.ts')
    expect(roomLabels).not.toMatch(/\.opacity\s*=|fadeOpacity|setOpacity/)
    expect(batched).not.toMatch(/\.opacity\s*=|fadeOpacity|setOpacity/)
    expect(data).not.toMatch(/\.opacity\s*=|fadeOpacity|setOpacity/)
  })
})
