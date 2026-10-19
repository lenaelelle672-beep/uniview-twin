import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))

describe('夜景 Bloom', () => {
  it('只在 night 且非 perf 挂 r3pp Bloom，阈值不低于 1.2，叠在 N8AO 与 AgX 之间', () => {
    const fx = readFileSync(join(here, '../components/scene/postfx/balancedFx.tsx'), 'utf8')
    const scene = readFileSync(join(here, '../components/Scene.tsx'), 'utf8')
    const pkg = readFileSync(join(here, '../../package.json'), 'utf8')
    const shadows = readFileSync(join(here, '../components/scene/BalancedSoftShadows.tsx'), 'utf8')

    expect(pkg).toMatch(/"@react-three\/postprocessing": "3\.1\.3"/)
    expect(pkg).toMatch(/"postprocessing": "6\.39\.5"/)
    expect(fx).toMatch(/import \{ Bloom, EffectComposer, EffectComposerContext, N8AO, ToneMapping \}/)
    expect(fx).not.toMatch(/SelectiveBloom/)
    expect(fx).toMatch(/NIGHT_BLOOM_LUMINANCE_THRESHOLD = 1\.2/)
    expect(fx).toMatch(/NIGHT_BLOOM_INTENSITY = 1/)
    expect(fx).toMatch(/NIGHT_BLOOM_RADIUS = 0\.85/)
    expect(fx).toMatch(/NIGHT_BLOOM_MIPMAP_BLUR = true/)
    expect(fx).toMatch(/blendFunction=\{BlendFunction\.SCREEN\}/)
    expect(fx).toMatch(/\{active && night \? <NightBloom \/> : null\}/)
    expect(fx).toMatch(/night = false/)
    expect(scene).toMatch(/active=\{quality !== 'perf'\}/)
    expect(scene).toMatch(/night=\{dayNight === 'night'\}/)
    expect(scene).not.toMatch(/Bloom|SelectiveBloom/)
    expect(shadows).not.toMatch(/Bloom|SelectiveBloom|postprocessing/)

    const ao = fx.indexOf('<BalancedAO />')
    const bloom = fx.indexOf('{active && night ? <NightBloom /> : null}')
    const tone = fx.indexOf('<ToneMapping mode={ToneMappingMode.AGX} />')
    const monitor = fx.indexOf('<MonitorAfterTone />')
    expect(ao).toBeGreaterThan(-1)
    expect(bloom).toBeGreaterThan(ao)
    expect(tone).toBeGreaterThan(bloom)
    expect(monitor).toBeGreaterThan(tone)
  })
})
