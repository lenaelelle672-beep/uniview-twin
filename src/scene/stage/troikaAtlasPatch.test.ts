import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('D264 troika 图集 patch', () => {
  it('patch-package 在 npm ci 后把初始高度改成 512 字形（2048×256）', () => {
    const pkg = readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')
    expect(pkg).toMatch(/"postinstall": "patch-package"/)
    expect(pkg).toMatch(/"patch-package"/)
    expect(existsSync(new URL('../../../patches/troika-three-text+0.53.0.patch', import.meta.url))).toBe(true)
    const patch = readFileSync(new URL('../../../patches/troika-three-text+0.53.0.patch', import.meta.url), 'utf8')
    expect(patch).toMatch(/sdfGlyphSize \* 512 \/ glyphsPerRow/)
    expect(patch).toMatch(/troika-three-text\.esm\.js/)
    expect(patch).toMatch(/troika-three-text\.umd\.js/)
    expect(patch).not.toMatch(/textureWidth:\s*4096/)
    const esm = readFileSync(new URL('../../../node_modules/troika-three-text/dist/troika-three-text.esm.js', import.meta.url), 'utf8')
    expect(esm).toMatch(/canvas\.height = sdfGlyphSize \* 512 \/ glyphsPerRow/)
    expect(esm).not.toMatch(/canvas\.height = sdfGlyphSize \* 256 \/ glyphsPerRow/)
    const src = readFileSync(new URL('../../../src/scene/stage/disableTroikaCdn.ts', import.meta.url), 'utf8')
    expect(src).not.toMatch(/textureWidth:\s*4096/)
  })
})
