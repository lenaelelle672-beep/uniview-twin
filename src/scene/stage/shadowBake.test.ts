import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import {
  commitShadowBake,
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
  })

  it('进层推迟，停稳且室内与剖切就绪后空过一帧再烘', () => {
    expect(shouldDeferShadowBake({ reason: 'floor', view: 'floor', rested: true })).toBe(true)
    expect(requestShadowBake('floor:F2', true)).toBe('defer')
    expect(shadowBakePending()).toBe(true)
    const flying = shadowSceneReady({
      view: 'floor',
      rested: false,
      interiorMounted: true,
      cutActive: true,
      clippingEnabled: true,
    })
    expect(flying).toBe(false)
    expect(stepShadowBake(flying)).toBeNull()
    const ready = shadowSceneReady({
      view: 'floor',
      rested: true,
      interiorMounted: true,
      cutActive: true,
      clippingEnabled: true,
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

  it('总览昼夜立即烘，飞入中的昼夜推迟到停稳', () => {
    expect(shouldDeferShadowBake({ reason: 'day-night', view: 'building', rested: true })).toBe(false)
    expect(requestShadowBake('surface:lit:night', false)).toBe('bake-now')
    expect(shadowBakePending()).toBe(false)

    expect(shouldDeferShadowBake({ reason: 'day-night', view: 'floor', rested: false })).toBe(true)
    expect(requestShadowBake('surface:lit:night', true)).toBe('defer')
    expect(
      stepShadowBake(
        shadowSceneReady({
          view: 'floor',
          rested: true,
          interiorMounted: true,
          cutActive: true,
          clippingEnabled: true,
        }),
      ),
    ).toBeNull()
    expect(
      stepShadowBake(
        shadowSceneReady({
          view: 'floor',
          rested: true,
          interiorMounted: true,
          cutActive: true,
          clippingEnabled: true,
        }),
      ),
    ).toBe('surface:lit:night')
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
    expect(interior).toMatch(/useFloorExtrasReady/)
    expect(interior).toMatch(/RestedFloorExtras/)
    expect(grille).toMatch(/clipShadows/)
    expect(grille).toMatch(/shadowBakePending/)
  })
})
