import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { installExplodeProgress } from '../explode-progress/publish'
import { resetTwinStore, useTwinStore } from './store'
import type { LayerKey } from './viewSlice'

describe('昼夜', () => {
  it('切夜间同步写入，不包进 startTransition', () => {
    const source = readFileSync(new URL('./viewSlice.ts', import.meta.url), 'utf8')
    const body = source.slice(source.lastIndexOf('setDayNight:'), source.lastIndexOf('setQuality:'))
    expect(body).not.toMatch(/startTransition\(/)
    expect(body).toMatch(/set\(\{ dayNight \}\)/)
    resetTwinStore()
    useTwinStore.getState().setDayNight('night')
    expect(useTwinStore.getState().dayNight).toBe('night')
    useTwinStore.getState().setDayNight('night')
    expect(useTwinStore.getState().dayNight).toBe('night')
  })
})

describe('楼层双击事件', () => {
  beforeEach(() => {
    resetTwinStore()
  })

  it('双击只记录飞入请求，不改变视图', () => {
    useTwinStore.getState().emitFloorFly('F12')
    const first = useTwinStore.getState()
    expect(first.floorFlyRequest).toEqual({ floorId: 'F12', nonce: 1 })
    expect(first.view).toBe('building')
    expect(first.selectedFloor).toBeNull()

    useTwinStore.getState().emitFloorFly('F12')
    expect(useTwinStore.getState().floorFlyRequest).toEqual({ floorId: 'F12', nonce: 2 })
    useTwinStore.getState().emitFloorFly('F3')
    expect(useTwinStore.getState().floorFlyRequest).toEqual({ floorId: 'F3', nonce: 3 })
    expect(useTwinStore.getState().view).toBe('building')
  })
})

describe('图层开关', () => {
  beforeEach(() => {
    resetTwinStore()
  })

  it('人流到圆标默认开，结构边默认关；关掉一项不影响其余', () => {
    const initial = useTwinStore.getState().layers
    expect(initial).toEqual({
      people: true,
      labels: true,
      heat: true,
      outlines: true,
      badges: true,
      edges: false,
    })
    useTwinStore.getState().setLayer('heat', false)
    const next = useTwinStore.getState().layers
    expect(next).toEqual({
      people: true,
      labels: true,
      heat: false,
      outlines: true,
      badges: true,
      edges: false,
    })
    expect(next).not.toBe(initial)
    useTwinStore.getState().setLayer('heat', false)
    expect(useTwinStore.getState().layers).toBe(next)
    const withWire = { ...next, wireframe: true }
    useTwinStore.setState({ layers: withWire })
    useTwinStore.getState().setLayer('edges', true)
    const withEdges = useTwinStore.getState().layers
    expect(withEdges.edges).toBe(true)
    expect(withEdges.heat).toBe(false)
    expect((withEdges as { wireframe?: boolean }).wireframe).toBe(true)
    const keys: LayerKey[] = ['people', 'labels', 'heat', 'outlines', 'badges', 'edges']
    for (const key of keys) useTwinStore.getState().setLayer(key, false)
    expect(useTwinStore.getState().layers).toEqual({
      people: false,
      labels: false,
      heat: false,
      outlines: false,
      badges: false,
      edges: false,
      wireframe: true,
    })
    useTwinStore.getState().enterFloor('F3')
    expect(useTwinStore.getState().layers.people).toBe(false)
    expect(useTwinStore.getState().view).toBe('floor')
  })
})

describe('爆炸进度还没装上', () => {
  beforeEach(() => {
    resetTwinStore()
    delete (globalThis as { __ea?: number }).__ea
    delete (globalThis as { __es?: boolean }).__es
  })

  it('首屏布尔开关不写进度字段', () => {
    expect(useTwinStore.getState().explodeProgress).toBeUndefined()
    expect(useTwinStore.getState().setExplodeProgress).toBeUndefined()
    useTwinStore.getState().setExploded(true)
    expect(useTwinStore.getState()).toMatchObject({ exploded: true })
    expect(useTwinStore.getState().explodeProgress).toBeUndefined()
    const held = useTwinStore.getState()
    held.setExploded(true)
    expect(useTwinStore.getState()).toBe(held)
  })
})

describe('爆炸进度', () => {
  beforeEach(() => {
    resetTwinStore()
    delete (globalThis as { __ea?: number }).__ea
    delete (globalThis as { __es?: boolean }).__es
    installExplodeProgress()
  })

  it('进度和 exploded 一起写，滑杆不改补间标记，按钮会清掉', () => {
    expect(useTwinStore.getState()).toMatchObject({ exploded: false, explodeProgress: 0 })
    useTwinStore.getState().setExploded(true)
    expect(useTwinStore.getState()).toMatchObject({ exploded: true, explodeProgress: 1 })
    expect((globalThis as { __ea?: number }).__ea).toBe(1)
    ;(globalThis as { __es?: boolean }).__es = true
    useTwinStore.getState().setExplodeProgress(0.5)
    expect(useTwinStore.getState()).toMatchObject({ exploded: true, explodeProgress: 0.5 })
    expect((globalThis as { __ea?: number }).__ea).toBe(0.5)
    expect((globalThis as { __es?: boolean }).__es).toBe(true)
    useTwinStore.getState().setExplodeProgress(1.4)
    expect(useTwinStore.getState().explodeProgress).toBe(1)
    useTwinStore.getState().setExplodeProgress(Number.NaN)
    expect(useTwinStore.getState()).toMatchObject({ exploded: false, explodeProgress: 0 })
    useTwinStore.getState().setExplodeProgress(0.25)
    useTwinStore.getState().setExploded(true)
    expect(useTwinStore.getState()).toMatchObject({ exploded: true, explodeProgress: 1 })
    expect((globalThis as { __es?: boolean }).__es).toBe(false)
    useTwinStore.getState().setExploded(false)
    const held = useTwinStore.getState()
    expect(held).toMatchObject({ exploded: false, explodeProgress: 0 })
    held.setExploded(false)
    expect(useTwinStore.getState()).toBe(held)
  })

  it('改进度会放下地址栏视角', () => {
    useTwinStore.getState().showViewpoint({ token: 'vp-1', view: 'building', floor: null, cam: null })
    expect(useTwinStore.getState().vp).toBe('vp-1')
    useTwinStore.getState().setExplodeProgress(0.2)
    expect(useTwinStore.getState().vp).toBeNull()
    expect(useTwinStore.getState()).toMatchObject({ exploded: true, explodeProgress: 0.2 })
  })
})