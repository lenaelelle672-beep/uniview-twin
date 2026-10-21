import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { floorSpec } from '../data/floors'
import { CAMERA_LIMITS } from '../scene/cameras'
import { CAMERA_UPDATE_DELTA_CAP, USER_CAMERA_SMOOTH_TIME } from '../scene/stage/cameraTransition'
import { resetTwinStore, useTwinStore } from '../store/store'
import { formatViewpoint } from '../url/viewpoint'
import {
  VIEWMARK_LIMIT,
  createViewmarkId,
  forgetBookmark,
  loadBookmarks,
  rememberBookmark,
  saveBookmarks,
  type BookmarkStorage,
  type Viewmark,
} from './bookmarks'
import { alarmFloorIds, floorTourPose } from './tourPose'

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

function memoryStorage(): BookmarkStorage & { dump: () => string | null } {
  let raw: string | null = null
  return {
    getItem: () => raw,
    setItem: (_key, value) => {
      raw = value
    },
    dump: () => raw,
  }
}

function mark(partial: Partial<Viewmark> = {}): Viewmark {
  const token = formatViewpoint({
    px: 10,
    py: 20,
    pz: 30,
    tx: 0,
    ty: 12,
    tz: 4,
    fov: 40,
    fx: 0,
    fy: 0,
    fz: 0,
  })
  return {
    id: partial.id ?? createViewmarkId(),
    name: partial.name ?? '大堂',
    token: partial.token ?? token ?? '',
    view: partial.view ?? 'building',
    floor: partial.floor ?? null,
    cam: partial.cam ?? null,
    pos: partial.pos ?? null,
  }
}

describe('视角书签与导览', () => {
  it('T032 过渡常量不动', () => {
    expect(USER_CAMERA_SMOOTH_TIME).toBe(0.42)
    expect(CAMERA_UPDATE_DELTA_CAP).toBe(0.1)
    const transition = read('../scene/stage/cameraTransition.ts')
    expect(transition).toMatch(/USER_CAMERA_SMOOTH_TIME = 0\.42/)
    expect(transition).toMatch(/CAMERA_UPDATE_DELTA_CAP = 0\.1/)
  })

  it('导览是独立懒包，书签面板晚于 cutoff，不引用禁项', () => {
    const dock = read('./ViewmarkDock.tsx')
    const tour = read('./alarmTour.ts')
    const pose = read('./tourPose.ts')
    const stage = read('../components/Stage.tsx')
    const scene = read('../components/Scene.tsx')
    const rig = read('../components/scene/CameraRig.tsx')
    const css = read('../index.css')
    const prefetch = read('../scene/stage/prefetchLazyChunks.ts')
    expect(prefetch).toMatch(/import\('\.\.\/\.\.\/viewmarks\/dock'\)/)
    expect(prefetch).toMatch(/FLOOR_SHELL_AFTER_FIRST_MS = 2600/)
    expect(dock).toMatch(/import\('\.\/alarmTour'\)/)
    expect(dock).not.toMatch(/from '\.\/alarmTour'/)
    expect(stage).toMatch(/data-vm/)
    expect(stage).not.toMatch(/alarmTour|ViewmarkDock|mountDock/)
    expect(rig).not.toMatch(/import\('\.\/(?:applyViewpoint|vp)'\)/)
    expect(scene).not.toMatch(/viewmarks|alarmTour/)
    expect(rig).not.toMatch(/alarmTour|ViewmarkDock/)
    expect(rig).not.toMatch(/from '\.\.\/\.\.\/scene\/stage\/cameraRest'/)
    expect(rig).not.toMatch(/from '\.\.\/\.\.\/scene\/frameSchedule'/)
    expect(rig).toMatch(/smoothTime=\{USER_CAMERA_SMOOTH_TIME\}/)
    expect(rig).not.toMatch(/smoothTime\s*=\s*0/)
    expect(css).not.toMatch(/viewmark/)
    const banned = [
      'cameraRest',
      'frameSchedule',
      'cameraMotion',
      'balancedFx',
      'SoftShadows',
      'DemandLoop',
      'Workstations',
      'ZoneHeat',
      'FloorStencilCap',
      'JsonFloorInterior',
      'OutlinePass',
      'FloorStageCamera',
    ]
    for (const name of banned) {
      expect(tour).not.toContain(name)
      expect(pose).not.toContain(name)
      expect(dock).not.toContain(name)
    }
    expect(tour).not.toMatch(/smoothTime/)
    expect(tour).toMatch(/setLookAt\(/)
  })

  it('只收集有告警的楼层，并给出限制内的看点', () => {
    expect(
      alarmFloorIds([
        { id: 'F12', level: 12, alarmCount: 2 },
        { id: 'F1', level: 1, alarmCount: 0 },
        { id: 'B1', level: -1, alarmCount: 1 },
        { id: 'F3', level: 3, alarmCount: 4 },
        { id: 'nope', level: 9, alarmCount: 9 },
      ]),
    ).toEqual(['B1', 'F3', 'F12'])

    for (const floorId of ['B1', 'F1', 'F12', 'F22']) {
      const pose = floorTourPose(floorId)
      const spec = floorSpec(floorId)
      const distance = Math.hypot(pose.px - pose.tx, pose.py - pose.ty, pose.pz - pose.tz)
      expect(distance).toBeGreaterThan(CAMERA_LIMITS.minDistance)
      expect(distance).toBeLessThan(CAMERA_LIMITS.maxDistance)
      expect(pose.py).toBeGreaterThan(CAMERA_LIMITS.minCameraY)
      expect(pose.ty).toBeCloseTo(spec.elevation + spec.height * 0.45, 5)
      expect(pose.fov).toBe(48)
    }
  })

  it('本地最多 12 条，坏数据丢掉', () => {
    const storage = memoryStorage()
    let marks: Viewmark[] = []
    for (let index = 0; index < VIEWMARK_LIMIT; index += 1) {
      const next = rememberBookmark(marks, mark({ name: `视角${index + 1}` }))
      expect(next.ok).toBe(true)
      if (next.ok) marks = next.marks
    }
    expect(rememberBookmark(marks, mark({ name: '溢出' })).ok).toBe(false)
    expect(saveBookmarks(storage, marks)).toBe(true)
    expect(loadBookmarks(storage)).toHaveLength(VIEWMARK_LIMIT)
    storage.setItem('uniview-viewmarks-v1', '{')
    expect(loadBookmarks(storage)).toEqual([])
    storage.setItem(
      'uniview-viewmarks-v1',
      JSON.stringify([mark({ name: '留下' }), { id: 'x', name: '', token: 'bad' }]),
    )
    expect(loadBookmarks(storage).map((item) => item.name)).toEqual(['留下'])
    expect(forgetBookmark(marks, marks[0]?.id ?? '').some((item) => item.id === marks[0]?.id)).toBe(false)
    expect(rememberBookmark([], mark({ name: '  ' })).ok).toBe(false)
  })

  it('套用书签会推动序号，换层则放开视角锁定', () => {
    resetTwinStore()
    const holder = {} as Window
    const host = globalThis as { window?: Window }
    const previous = host.window
    host.window = holder
    const token = formatViewpoint({
      px: 12,
      py: 40,
      pz: 80,
      tx: 0,
      ty: 20,
      tz: 4,
      fov: 36,
      fx: 0,
      fy: 0,
      fz: 0,
    })
    expect(token).toBeTruthy()
    useTwinStore.getState().showViewpoint({
      token: token ?? '',
      view: 'floor',
      floor: 'F8',
      cam: null,
      pos: 'F8-1',
    })
    expect(useTwinStore.getState().vpSeq).toBe(1)
    expect(useTwinStore.getState().focusedDeskId).toBe('F8-1')
    expect(holder.__vpH).toBe(true)
    useTwinStore.getState().showViewpoint({
      token: token ?? '',
      view: 'floor',
      floor: 'F8',
      cam: null,
      pos: 'F8-1',
    })
    expect(useTwinStore.getState().vpSeq).toBe(2)
    useTwinStore.getState().enterFloor('F9')
    expect(useTwinStore.getState().vp).toBeNull()
    expect(useTwinStore.getState().selectedFloor).toBe('F9')
    expect(holder.__vpH).toBe(false)
    host.window = previous
    resetTwinStore()
  })
})
