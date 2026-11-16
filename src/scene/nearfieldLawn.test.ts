import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SOUTH_LAWN, nearfieldSpurRibbons, southLawnOutline, southLawnRingOuter } from './nearfieldLawn'

const here = dirname(fileURLToPath(import.meta.url))

describe('南侧圆形草坪', () => {
  it('在公园绿地内，环行人行包住草芯', () => {
    const [cx, cz] = SOUTH_LAWN.center
    expect(cx).toBeCloseTo(-46, 0)
    expect(cz).toBeCloseTo(123, 0)
    expect(SOUTH_LAWN.radius).toBeCloseTo(25, 5)
    expect(cz + SOUTH_LAWN.radius).toBeLessThan(155)
    expect(cx + SOUTH_LAWN.radius).toBeLessThan(-10)
    const lawn = southLawnOutline()
    const ring = southLawnRingOuter()
    expect(lawn).toHaveLength(28)
    expect(ring).toHaveLength(28)
    const lawnR = lawn.map(([x, z]) => Math.hypot(x - cx, z - cz))
    const ringR = ring.map(([x, z]) => Math.hypot(x - cx, z - cz))
    lawnR.forEach((radius) => expect(radius).toBeCloseTo(SOUTH_LAWN.radius, 5))
    ringR.forEach((radius) => expect(radius).toBeCloseTo(SOUTH_LAWN.radius + SOUTH_LAWN.ringWidth, 5))
  })

  it('首帧门闩之后才动态加载，不进 hardGate', () => {
    const textures = readFileSync(join(here, 'groundTextures.ts'), 'utf8')
    const site = readFileSync(join(here, '../components/scene/Site.tsx'), 'utf8')
    expect(textures).toMatch(/await idle\(\)/)
    expect(textures.indexOf('startLoads(load)')).toBeGreaterThan(textures.indexOf('FLOOR_SHELL_AFTER_FIRST_MS'))
    expect(textures.indexOf("import('./nearfieldLawn')")).toBeGreaterThan(textures.indexOf('startLoads(load)'))
    expect(site).not.toMatch(/nearfieldLawn|SouthLawn|southLawnOutline/)
  })

  it('懒载辅路包含西南转角和南入口', () => {
    const spurs = nearfieldSpurRibbons()
    expect(spurs).toHaveLength(4)
    expect(spurs.every((ribbon) => ribbon.halfWidth > 3)).toBe(true)
    expect(Math.max(...spurs.flatMap((ribbon) => [ribbon.a[1], ribbon.b[1]]))).toBeGreaterThan(120)
  })

})
