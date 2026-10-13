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
  })

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

  it('连续三帧出齐后再过 1 秒才算窗关，淡入中重计', () => {
    markShadowEntry(0)
    const member = { scale: { x: 1 }, fillOpacity: 1, textRenderInfo: { blockBounds: [0, 0, 1, 1] } }
    expect(observeLabelMembers([member], false, 10)).toBeNull()
    expect(observeLabelMembers([member], true, 20)).toBeNull()
    expect(observeLabelMembers([member], false, 30)).toBeNull()
    expect(observeLabelMembers([member], false, 40)).toBeNull()
    expect(observeLabelMembers([member], false, 50)).toBe(50)
    expect(labelShownAt()).toBe(50)
    expect(labelWindowAnchor()).toBe(50)
    expect(labelWindowClosed(1049)).toBe(false)
    expect(labelWindowClosed(1050)).toBe(true)
  })

  it('关窗锚点取 shownAt 与 QA ready 的较晚者，上屏时间单独不能关窗', () => {
    markShadowEntry(0)
    ;(globalThis as { __twinLabelReadyAt?: number }).__twinLabelReadyAt = 400
    expect(labelWindowClosed(5000)).toBe(false)
    const member = { scale: { x: 1 }, fillOpacity: 1, textRenderInfo: { blockBounds: [0, 0, 1, 1] } }
    expect(observeLabelMembers([member], false, 10)).toBeNull()
    expect(observeLabelMembers([member], false, 20)).toBeNull()
    expect(observeLabelMembers([member], false, 30)).toBe(30)
    expect(labelWindowAnchor()).toBe(400)
    expect(labelWindowClosed(1399)).toBe(false)
    expect(labelWindowClosed(1400)).toBe(true)
    noteLabelHarnessReady(900)
    expect(labelWindowAnchor()).toBe(400)
    expect((globalThis as { __twinLabelReadyAt?: number }).__twinLabelReadyAt).toBe(400)
    noteLabelHarnessReady(4000)
    expect(labelWindowAnchor()).toBe(400)
    expect((globalThis as { __twinLabelReadyAt?: number }).__twinLabelReadyAt).toBe(400)
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
    const labels = readFileSync(new URL('./RoomLabels.tsx', import.meta.url), 'utf8')
    expect(bake).toMatch(/__twinLabelReadyAt/)
    expect(bake).not.toMatch(/__twinLabelReadyAt\s*=/)
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
