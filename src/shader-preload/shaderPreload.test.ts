import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { stripShaderPreloadSource } from '../../scripts/shaderPreloadStrip'
import { FLOOR_SHELL_AFTER_FIRST_MS } from '../scene/stage/prefetchLazyChunks'
import { SOFT_SHADOW_CHUNK_AFTER_FIRST_MS } from '../scene/softShadows'
import { SHADER_PRELOAD_AFTER_FIRST_MS, shaderPreloadDue } from './gate'

function read(url: string): string {
  return readFileSync(new URL(url, import.meta.url), 'utf8')
}

describe('T090 drei Preload', () => {
  it('首帧窗口未到不挂，到点与 T032 同一毫秒', () => {
    expect(SHADER_PRELOAD_AFTER_FIRST_MS).toBe(2600)
    expect(SHADER_PRELOAD_AFTER_FIRST_MS).toBe(SOFT_SHADOW_CHUNK_AFTER_FIRST_MS)
    expect(SHADER_PRELOAD_AFTER_FIRST_MS).toBe(FLOOR_SHELL_AFTER_FIRST_MS)
    const first = 10_000
    expect(shaderPreloadDue(null, first)).toBe(false)
    expect(shaderPreloadDue(undefined, first)).toBe(false)
    expect(shaderPreloadDue(Number.NaN, first)).toBe(false)
    expect(shaderPreloadDue(first, Number.NaN)).toBe(false)
    expect(shaderPreloadDue(first, first)).toBe(false)
    expect(shaderPreloadDue(first, first + SHADER_PRELOAD_AFTER_FIRST_MS - 1)).toBe(false)
    expect(shaderPreloadDue(first, first + SHADER_PRELOAD_AFTER_FIRST_MS)).toBe(true)
  })

  it('挂在首屏 Suspense 内，生产构建再把接线从入口摘掉', () => {
    const scene = read('../components/Scene.tsx')
    const layer = read('./PreloadLayer.tsx')
    const gate = read('./gate.ts')
    const mount = read('./mount.ts')
    const overlay = read('../components/AssetLoadOverlay.tsx')
    const fx = read('../components/scene/postfx/balancedFx.tsx')
    const plugin = read('../../scripts/shaderPreloadPlugin.ts')
    const vite = read('../../vite.config.ts')
    const pkg = JSON.parse(read('../../package.json')) as {
      dependencies: Record<string, string>
    }
    const baseline = execFileSync(
      'git',
      ['show', '38961417ce15da692ad910b8e932832b8314053a:src/components/Scene.tsx'],
      { encoding: 'utf8' },
    )
    const probe = scene.indexOf('<RenderProbe />')
    const close = scene.indexOf('</Suspense>', probe)
    const slot = scene.slice(probe, close)

    expect(probe).toBeGreaterThan(scene.indexOf('<Suspense fallback={<BlankSuspenseFallback />}>'))
    expect(slot).toMatch(/preloadOn \?/)
    expect(slot).toMatch(/<Suspense fallback=\{null\}>/)
    expect(slot).toMatch(/<PreloadLayer \/>/)
    expect(scene).toMatch(/import\('\.\.\/shader-preload\/PreloadLayer'\)/)
    expect(scene).toMatch(/SOFT_SHADOW_CHUNK_AFTER_FIRST_MS\) setPreloadOn\(true\)/)
    expect(scene).not.toMatch(/from '@react-three\/drei/)
    expect(scene).not.toMatch(/web\/Loader/)
    expect(scene).not.toMatch(/__twinReady\s*=/)
    expect(stripShaderPreloadSource(scene)).toBe(baseline)
    expect(layer).toMatch(/@react-three\/drei\/core\/Preload/)
    expect(layer).toMatch(/<Preload all \/>/)
    expect(layer).toMatch(/shaderPreloadDue/)
    expect(layer).not.toMatch(/web\/Loader/)
    expect(layer).not.toMatch(/publishAssetProgress/)
    expect(gate).toMatch(/SHADER_PRELOAD_AFTER_FIRST_MS = 2600/)
    expect(gate).not.toMatch(/from ['"]three['"]/)
    expect(gate).not.toMatch(/from ['"][^'"]*softShadows/)
    expect(mount).toMatch(/shaderPreloadDue/)
    expect(mount).toMatch(/__twinMeasureSlot/)
    expect(mount).toMatch(/import\('\.\/PreloadLayer'\)/)
    expect(mount).not.toMatch(/@react-three\/drei|from ['"]three['"]|web\/Loader/)
    expect(overlay).toMatch(/SOFT_SHADOW_CHUNK_AFTER_FIRST_MS/)
    expect(overlay).not.toMatch(/web\/Loader/)
    expect(overlay).toMatch(/不用 <Loader>/)
    expect(fx).not.toMatch(/shader-preload|core\/Preload/)
    expect(plugin).toMatch(/stripShaderPreloadSource/)
    expect(plugin).toMatch(/mountShaderPreload/)
    expect(vite).toMatch(/shaderPreloadAfterHash/)
    expect(pkg.dependencies['@react-three/drei']).toBe('10.7.9')
    expect(pkg.dependencies.three).toBe('0.186.1')
  })
})
