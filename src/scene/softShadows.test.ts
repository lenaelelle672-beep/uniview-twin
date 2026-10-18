import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { BasicShadowMap, PCFShadowMap, ShaderChunk, VSMShadowMap, type ShadowMapType } from 'three'
import {
  assignBalancedShadowType,
  capturePrePcssShadowType,
  resetSoftShadowsMountedForTests,
  setSoftShadowsMounted,
  shadowTypeAfterSoftShadowsUnmount,
  SOFT_SHADOW_FOCUS,
  SOFT_SHADOW_SAMPLES,
  SOFT_SHADOW_SIZE,
  softShadowGateOpen,
  softShadowsMounted,
  softShadowsQualityOn,
} from './softShadows'

const here = dirname(fileURLToPath(import.meta.url))

afterEach(() => {
  resetSoftShadowsMountedForTests()
})

describe('SoftShadows 门闩', () => {
  it('samples 在 4–6，size / focus 用社区默认', () => {
    expect(SOFT_SHADOW_SAMPLES).toBeGreaterThanOrEqual(4)
    expect(SOFT_SHADOW_SAMPLES).toBeLessThanOrEqual(6)
    expect(SOFT_SHADOW_SIZE).toBe(25)
    expect(SOFT_SHADOW_FOCUS).toBe(0)
  })

  it('perf 关，balanced 和 high 开', () => {
    expect(softShadowsQualityOn('perf')).toBe(false)
    expect(softShadowsQualityOn('balanced')).toBe(true)
    expect(softShadowsQualityOn('high')).toBe(true)
  })

  it('首帧之前、烘影未完成、单层飞入中都不开门', () => {
    const base = {
      quality: 'balanced',
      firstFrameAt: 10,
      frames: 2,
      bakePending: false,
      view: 'building',
      cameraRested: false,
    }
    expect(softShadowGateOpen({ ...base, firstFrameAt: null })).toBe(false)
    expect(softShadowGateOpen({ ...base, frames: 0 })).toBe(false)
    expect(softShadowGateOpen({ ...base, frames: undefined })).toBe(false)
    expect(softShadowGateOpen({ ...base, bakePending: true })).toBe(false)
    expect(softShadowGateOpen({ ...base, quality: 'perf' })).toBe(false)
    expect(softShadowGateOpen({ ...base, view: 'floor', cameraRested: false })).toBe(false)
    expect(softShadowGateOpen({ ...base, view: 'floor', cameraRested: true, bakePending: true })).toBe(false)
  })

  it('总览不要求相机停稳；单层停稳且烘影结束后才开', () => {
    expect(
      softShadowGateOpen({
        quality: 'high',
        firstFrameAt: 1,
        frames: 1,
        bakePending: false,
        view: 'building',
        cameraRested: false,
      }),
    ).toBe(true)
    expect(
      softShadowGateOpen({
        quality: 'balanced',
        firstFrameAt: 1,
        frames: 1,
        bakePending: false,
        view: 'floor',
        cameraRested: true,
      }),
    ).toBe(true)
  })

  it('卸载后 BasicShadowMap 回到挂载前的类型，已经是 PCF 则保持', () => {
    expect(shadowTypeAfterSoftShadowsUnmount(PCFShadowMap, PCFShadowMap)).toBe(PCFShadowMap)
    expect(shadowTypeAfterSoftShadowsUnmount(PCFShadowMap, BasicShadowMap)).toBe(PCFShadowMap)
    expect(shadowTypeAfterSoftShadowsUnmount(VSMShadowMap, BasicShadowMap)).toBe(VSMShadowMap)
    expect(shadowTypeAfterSoftShadowsUnmount(BasicShadowMap, BasicShadowMap)).toBe(PCFShadowMap)
  })

  it('记下 PCSS 之前的类型，不把 BasicShadowMap 当成还原目标', () => {
    expect(capturePrePcssShadowType(PCFShadowMap, PCFShadowMap)).toBe(PCFShadowMap)
    expect(capturePrePcssShadowType(PCFShadowMap, BasicShadowMap)).toBe(PCFShadowMap)
  })

  it('PCSS 挂着时预热不再写回 PCF', () => {
    const shadowMap: { type: ShadowMapType } = { type: PCFShadowMap }
    assignBalancedShadowType(shadowMap)
    expect(shadowMap.type).toBe(PCFShadowMap)
    shadowMap.type = VSMShadowMap
    assignBalancedShadowType(shadowMap)
    expect(shadowMap.type).toBe(PCFShadowMap)
    setSoftShadowsMounted(true)
    expect(softShadowsMounted()).toBe(true)
    shadowMap.type = BasicShadowMap
    assignBalancedShadowType(shadowMap)
    expect(shadowMap.type).toBe(BasicShadowMap)
  })

  it('three 0.186 的阴影块能让 drei 走到 BasicShadowMap 注入点', () => {
    const chunk = ShaderChunk.shadowmap_pars_fragment
    expect(chunk.includes('sampler2DShadow')).toBe(true)
    expect(chunk.lastIndexOf('float getShadow( sampler2D shadowMap')).toBeGreaterThan(0)
    expect(chunk.includes('if ( frustumTest ) {')).toBe(true)
  })

  it('Scene 只在非 perf 挂 SoftShadows，不进场地门，也不开 Bloom', () => {
    const scene = readFileSync(join(here, '../components/Scene.tsx'), 'utf8')
    const gate = readFileSync(join(here, '../components/scene/BalancedSoftShadows.tsx'), 'utf8')
    const fx = readFileSync(join(here, '../components/scene/postfx/balancedFx.tsx'), 'utf8')
    const ground = readFileSync(join(here, 'groundTextures.ts'), 'utf8')
    const pkg = readFileSync(join(here, '../../package.json'), 'utf8')
    expect(scene).toMatch(/quality !== 'perf' \? <BalancedSoftShadows \/> : null/)
    expect(gate).toMatch(/@react-three\/drei\/core\/softShadows/)
    expect(gate).toMatch(/samples=\{SOFT_SHADOW_SAMPLES\}/)
    expect(gate).toMatch(/softShadowGateOpen/)
    expect(gate).toMatch(/shadowTypeAfterSoftShadowsUnmount/)
    expect(gate).toMatch(/requestAnimationFrame/)
    expect(gate).not.toMatch(/groundTextures|FLOOR_SHELL_AFTER_FIRST_MS/)
    expect(gate).not.toMatch(/Bloom|SelectiveBloom|postprocessing/)
    expect(scene).not.toMatch(/Bloom|SelectiveBloom/)
    expect(fx).not.toMatch(/Bloom|SelectiveBloom/)
    expect(ground).toMatch(/FLOOR_SHELL_AFTER_FIRST_MS/)
    expect(pkg).toMatch(/"@react-three\/drei": "10\.7\.9"/)
    expect(pkg).not.toMatch(/postprocessing": "\^/)
  })
})
