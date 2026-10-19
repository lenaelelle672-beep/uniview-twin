import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  DAY_ENV_INTENSITY,
  NIGHT_DAYMAP_ENV_INTENSITY,
  NIGHT_HDR_AFTER_FIRST_MS,
  NIGHT_HDR_ENV_INTENSITY,
  NIGHT_HDR_URL,
  OUTDOOR_HDR_URL,
  environmentIntensity,
  nightHdrActive,
  nightHdrWaitMs,
} from './LocalEnvironment'

const here = dirname(fileURLToPath(import.meta.url))

describe('夜 HDR 门闩', () => {
  it('白天仍是 kloofendal，夜 HDR 是本地 modern_buildings_night', () => {
    expect(OUTDOOR_HDR_URL).toBe('/hdr/kloofendal_48d_partly_cloudy_puresky_1k.hdr')
    expect(NIGHT_HDR_URL).toBe('/hdr/modern_buildings_night_1k.hdr')
    expect(NIGHT_HDR_URL).not.toMatch(/^https?:/)
  })

  it('只有非 perf 的夜景才切夜 HDR', () => {
    expect(nightHdrActive(false, 'balanced')).toBe(false)
    expect(nightHdrActive(false, 'high')).toBe(false)
    expect(nightHdrActive(false, 'perf')).toBe(false)
    expect(nightHdrActive(true, 'perf')).toBe(false)
    expect(nightHdrActive(true, 'balanced')).toBe(true)
    expect(nightHdrActive(true, 'high')).toBe(true)
  })

  it('夜 HDR 晚于 d126 cutoff', () => {
    expect(NIGHT_HDR_AFTER_FIRST_MS).toBeGreaterThan(64)
    expect(nightHdrWaitMs(null, 1_000)).toBeNull()
    expect(nightHdrWaitMs(undefined, 1_000)).toBeNull()
    expect(nightHdrWaitMs(1_000, 1_000)).toBe(NIGHT_HDR_AFTER_FIRST_MS)
    expect(nightHdrWaitMs(1_000, 1_000 + NIGHT_HDR_AFTER_FIRST_MS - 1)).toBe(1)
    expect(nightHdrWaitMs(1_000, 1_000 + NIGHT_HDR_AFTER_FIRST_MS)).toBe(0)
    expect(nightHdrWaitMs(1_000, 20_000)).toBe(0)
  })

  it('白天强度不变；夜 HDR 未到位沿用 0.16；到位后更低', () => {
    expect(environmentIntensity(false, false)).toBe(DAY_ENV_INTENSITY)
    expect(environmentIntensity(false, true)).toBe(DAY_ENV_INTENSITY)
    expect(DAY_ENV_INTENSITY).toBe(0.22)
    expect(environmentIntensity(true, false)).toBe(NIGHT_DAYMAP_ENV_INTENSITY)
    expect(NIGHT_DAYMAP_ENV_INTENSITY).toBe(0.16)
    expect(environmentIntensity(true, true)).toBe(NIGHT_HDR_ENV_INTENSITY)
    expect(NIGHT_HDR_ENV_INTENSITY).toBeLessThan(NIGHT_DAYMAP_ENV_INTENSITY)
  })

  it('仓库里的夜 HDR 是 1k Radiance，体积与 Poly Haven 一致', () => {
    const file = readFileSync(join(here, '../../../public/hdr/modern_buildings_night_1k.hdr'))
    expect(file.length).toBe(1_655_510)
    expect(file.subarray(0, 10).toString('ascii')).toBe('#?RADIANCE')
    expect(file.includes(Buffer.from('-Y 512 +X 1024'))).toBe(true)
    const license = readFileSync(join(here, '../../../public/hdr/LICENSE.txt'), 'utf8')
    expect(license).toMatch(/modern_buildings_night_1k\.hdr/)
    expect(license).toMatch(/CC0 1\.0/)
    expect(license).toMatch(/Greg Zaal/)
    expect(license).toMatch(/https:\/\/polyhaven\.com\/a\/modern_buildings_night/)
  })

  it('运行时不走 CDN Environment，冷启路径不加载夜 HDR', () => {
    const source = readFileSync(join(here, 'LocalEnvironment.tsx'), 'utf8')
    const scene = readFileSync(join(here, '../Scene.tsx'), 'utf8')
    const pkg = readFileSync(join(here, '../../../package.json'), 'utf8')
    expect(source).not.toMatch(/@react-three\/drei/)
    expect(source).not.toMatch(/https?:\/\//)
    expect(source).not.toMatch(/preset\s*=/)
    expect(source).not.toMatch(/<Environment[\s/>]/)
    expect(source).toMatch(/if \(!enabled \|\| !nightHdrActive\(night, quality\)\) return/)
    expect(source).toMatch(/nightHdrWaitMs\(window\.__twinFirstFrameAt/)
    expect(source).toMatch(/acquireEnvironment\(gl, OUTDOOR_HDR_URL, true\)/)
    expect(source).toMatch(/acquireEnvironment\(gl, NIGHT_HDR_URL, false\)/)
    expect(scene).toMatch(/<LocalEnvironment enabled=\{!model\} night=\{night\} quality=\{quality\} \/>/)
    expect(scene).not.toMatch(/Bloom|SelectiveBloom/)
    expect(pkg).toMatch(/"@react-three\/drei": "10\.7\.9"/)
    expect(pkg).toMatch(/"three": "0\.186\.1"/)
    expect(pkg).not.toMatch(/"@react-three\/postprocessing": "(?!3\.1\.3)/)
  })
})
