import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import {
  commitShadowBake,
  labelShownAt,
  labelWindowAnchor,
  labelWindowClosed,
  markShadowEntry,
  noteLabelHarnessReady,
  observeLabelMembers,
  requestShadowBake,
  resetShadowBake,
  shadowBakePending,
  shadowSceneReady,
  shouldDeferShadowBake,
  stepShadowBake,
} from './shadowBake'

describe('shadowBake', () => {
  afterEach(() => {
    resetShadowBake()
    delete (globalThis as { __twinLabelReadyAt?: number }).__twinLabelReadyAt
    delete (globalThis as { __twinFrames?: number }).__twinFrames
    delete (globalThis as { __twinFloorReadyAt?: number }).__twinFloorReadyAt
  })

  function sample(members: Parameters<typeof observeLabelMembers>[0], now: number, fading = false, frame = now) {
    ;(globalThis as { __twinFrames?: number }).__twinFrames = frame
    return observeLabelMembers(members, fading, now)
  }

  it('进层推迟，标签窗没关时不烘，关上后空过一帧再烘', () => {
    expect(shouldDeferShadowBake({ reason: 'floor', view: 'floor', rested: true, labelWindowClosed: true })).toBe(true)
    expect(requestShadowBake('floor:F2', true)).toBe('defer')
    expect(shadowBakePending()).toBe(true)
    const flying = shadowSceneReady({
      view: 'floor',
      rested: false,
      interiorMounted: true,
      cutActive: true,
      clippingEnabled: true,
      labelWindowClosed: true,
    })
    expect(flying).toBe(false)
    expect(stepShadowBake(flying)).toBeNull()
    const sceneOnly = shadowSceneReady({
      view: 'floor',
      rested: true,
      interiorMounted: true,
      cutActive: true,
      clippingEnabled: true,
      labelWindowClosed: false,
    })
    expect(sceneOnly).toBe(false)
    expect(stepShadowBake(sceneOnly)).toBeNull()
    expect(shadowBakePending()).toBe(true)
    const ready = shadowSceneReady({
      view: 'floor',
      rested: true,
      interiorMounted: true,
      cutActive: true,
      clippingEnabled: true,
      labelWindowClosed: true,
    })
    expect(stepShadowBake(ready)).toBeNull()
    expect(shadowBakePending()).toBe(true)
    expect(stepShadowBake(ready)).toBe('floor:F2')
    expect(shadowBakePending()).toBe(false)
  })

  it('剖切还没挂上时继续等', () => {
    requestShadowBake('floor:F2', true)
    const cutLate = shadowSceneReady({
      view: 'floor',
      rested: true,
      interiorMounted: true,
      cutActive: true,
      clippingEnabled: false,
    })
    expect(stepShadowBake(cutLate)).toBeNull()
    expect(shadowBakePending()).toBe(true)
  })

  it('总览昼夜立即烘，单层窗开着时昼夜继续推迟', () => {
    expect(shouldDeferShadowBake({ reason: 'day-night', view: 'building', rested: true })).toBe(false)
    expect(requestShadowBake('surface:lit:night', false)).toBe('bake-now')
    expect(shadowBakePending()).toBe(false)

    expect(shouldDeferShadowBake({ reason: 'day-night', view: 'floor', rested: true, labelWindowClosed: false })).toBe(true)
    expect(shouldDeferShadowBake({ reason: 'day-night', view: 'floor', rested: true, labelWindowClosed: true })).toBe(false)
    expect(requestShadowBake('surface:lit:night', true)).toBe('defer')
    const closed = shadowSceneReady({
      view: 'floor',
      rested: true,
      interiorMounted: true,
      cutActive: true,
      clippingEnabled: true,
      labelWindowClosed: true,
    })
    expect(stepShadowBake(closed)).toBeNull()
    expect(stepShadowBake(closed)).toBe('surface:lit:night')
  })

  it('连续三次合格采样后再过 1 秒才算窗关，淡入中重计', () => {
    markShadowEntry(0)
    const member = { scale: { x: 1, y: 1 }, fillOpacity: 1, textRenderInfo: { blockBounds: [0, 0, 1, 1] } }
    expect(sample([member], 0)).toBeNull()
    expect(sample([member], 20, true)).toBeNull()
    expect(sample([member], 100)).toBeNull()
    expect(sample([member], 200)).toBeNull()
    expect(sample([member], 300)).toBe(400)
    expect(labelShownAt()).toBe(400)
    expect(labelWindowAnchor()).toBe(400)
    expect((globalThis as { __twinFloorReadyAt?: number }).__twinFloorReadyAt).toBe(400)
    expect(labelWindowClosed(1399)).toBe(false)
    expect(labelWindowClosed(1400)).toBe(true)
  })

  it('同帧或间隔不足 100ms 不算新采样，首绘 ReadyAt 不能提前关窗', () => {
    markShadowEntry(0)
    ;(globalThis as { __twinLabelReadyAt?: number }).__twinLabelReadyAt = 5
    expect(labelWindowClosed(5000)).toBe(false)
    const member = { scale: { x: 1, y: 1 }, fillOpacity: 1, textRenderInfo: { blockBounds: [0, 0, 1, 1] } }
    expect(sample([member], 0, false, 1)).toBeNull()
    expect(sample([member], 16, false, 2)).toBeNull()
    expect(sample([member], 32, false, 3)).toBeNull()
    expect(sample([member], 200, false, 3)).toBeNull()
    expect(labelShownAt()).toBeNull()
    expect(sample([member], 200, false, 4)).toBeNull()
    expect(sample([member], 300, false, 5)).toBe(400)
    expect(labelWindowAnchor()).toBe(400)
    expect(labelWindowClosed(1399)).toBe(false)
    expect(labelWindowClosed(1400)).toBe(true)
    noteLabelHarnessReady(900)
    expect(labelWindowAnchor()).toBe(400)
    expect((globalThis as { __twinLabelReadyAt?: number }).__twinLabelReadyAt).toBe(5)
    noteLabelHarnessReady(4000)
    expect(labelWindowAnchor()).toBe(400)
    expect((globalThis as { __twinLabelReadyAt?: number }).__twinLabelReadyAt).toBe(5)
  })

  it('可见过滤用 max(|x|,|y|)，隐藏成员和缺字形的可见成员按 poller 处理', () => {
    markShadowEntry(0)
    const ready = { scale: { x: 1, y: 1 }, fillOpacity: 1, textRenderInfo: { blockBounds: [0, 0, 1, 1] } }
    const bare = { scale: { x: 1, y: 1 }, fillOpacity: 1 }
    expect(sample([ready, bare], 0)).toBeNull()
    expect(sample([ready, bare], 100)).toBeNull()
    expect(sample([ready, bare], 200)).toBeNull()
    expect(labelShownAt()).toBeNull()
    const hidden = { scale: { x: 0.001, y: 0.001 }, fillOpacity: 0.2 }
    expect(sample([ready, { ...hidden, fillOpacity: 0.4 }], 300)).toBeNull()
    expect(sample([ready, { ...hidden, fillOpacity: 0.8 }], 400)).toBeNull()
    expect(sample([ready, hidden], 500)).toBe(600)
    const tall = { scale: { x: 0.2, y: 1 }, fillOpacity: 1, textRenderInfo: { blockBounds: [0, 0, 1, 1] } }
    const tallerX = { scale: { x: 0.4, y: 1 }, fillOpacity: 1, textRenderInfo: { blockBounds: [0, 0, 1, 1] } }
    resetShadowBake()
    markShadowEntry(0)
    expect(sample([tall], 0)).toBeNull()
    expect(sample([tallerX], 100)).toBeNull()
    expect(sample([tall], 200)).toBe(300)
    const scaled = { scale: { x: 1, y: 1.2 }, fillOpacity: 1, textRenderInfo: { blockBounds: [0, 0, 1, 1] } }
    resetShadowBake()
    markShadowEntry(0)
    expect(sample([ready], 0)).toBeNull()
    expect(sample([ready], 100)).toBeNull()
    expect(sample([scaled], 200)).toBeNull()
    expect(sample([scaled], 300)).toBeNull()
    expect(sample([scaled], 400)).toBe(500)
  })

  it('离开单层立即烘，并取消飞入推迟', () => {
    requestShadowBake('floor:F2', true)
    expect(requestShadowBake('view:building', false)).toBe('bake-now')
    expect(stepShadowBake(true)).toBeNull()
    const gl = { shadowMap: { autoUpdate: true, needsUpdate: false } }
    commitShadowBake(gl, 'view:building', { rested: true, interior: false, deferred: false })
    expect(gl.shadowMap.autoUpdate).toBe(false)
    expect(gl.shadowMap.needsUpdate).toBe(true)
  })

  it('DemandLoop 飞入不打 needsUpdate，装饰停稳再挂，格栅裁切仍补影子', () => {
    const loop = readFileSync(new URL('../../components/scene/DemandLoop.tsx', import.meta.url), 'utf8')
    const interior = readFileSync(new URL('../../floors/JsonFloorInterior.tsx', import.meta.url), 'utf8')
    const grille = readFileSync(new URL('../../components/scene/EastGrille.tsx', import.meta.url), 'utf8')
    expect(loop).toMatch(/shadowMap\.autoUpdate = false/)
    expect(loop).toMatch(/shouldDeferShadowBake/)
    expect(loop).toMatch(/needsUpdate = false/)
    expect(loop).toMatch(/else if \(ready\)/)
    expect(loop).not.toMatch(/\[exploded, gl, quality, selectedFloor, view\]/)
    expect(loop).toMatch(/markShadowEntry/)
    expect(loop).toMatch(/ensureLabelWatch/)
    expect(loop).toMatch(/labelWindowClosed/)
    const bake = readFileSync(new URL('./shadowBake.ts', import.meta.url), 'utf8')
    const d269 = readFileSync(new URL('../../../scripts/_t014-d269.mjs', import.meta.url), 'utf8')
    const labels = readFileSync(new URL('./RoomLabels.tsx', import.meta.url), 'utf8')
    expect(bake).toMatch(/__twinLabelReadyAt/)
    expect(bake).not.toMatch(/__twinLabelReadyAt\s*=/)
    expect(bake).toMatch(/__twinFloorReadyAt/)
    const poller = readFileSync(new URL('./floorReadyPoller.ts', import.meta.url), 'utf8')
    expect(poller).toMatch(/Math\.floor\(now \/ FLOOR_READY_GAP_MS\)/)
    expect(poller).toMatch(/FLOOR_READY_GAP_MS = 100/)
    expect(poller).toMatch(/Math\.max/)
    expect(d269).toMatch(/Math\.floor\(now \/ GAP_MS\)/)
    expect(d269).toMatch(/GAP_MS = 100/)
    expect(d269).toMatch(/Math\.max\(Math\.abs/)
    expect(bake).toMatch(/labelWindowAnchor/)
    expect(bake).toMatch(/noteLabelHarnessReady/)
    expect(labels).toMatch(/noteLabelHarnessReady/)
    expect(labels).toMatch(/applyOpacity/)
    expect(labels).toMatch(/queueMicrotask/)
    expect(loop).toMatch(/subscribeLabelWindowOpen/)
    expect(interior).toMatch(/useAfterInteriorPaint/)
    expect(interior).toMatch(/useAfterLabelWindow/)
    expect(interior).toMatch(/FloorLabels/)
    expect(interior).toMatch(/FloorHeavy/)
    expect(interior).not.toMatch(/useFloorExtrasReady/)
    expect(grille).toMatch(/clipShadows/)
    expect(grille).toMatch(/shadowBakePending/)
  })
})
