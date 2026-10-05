import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { applySurfaceMode, baseMaterial } from './materials'
import { monitorMaterial } from './stage/materials'
import { CONTACT_SHADOW_RESOLUTION, SHELL_VERSION } from './shellVersion'

const here = dirname(fileURLToPath(import.meta.url))

describe('T012 第二阶段约束', () => {
  it('告警屏不走色调映射，不拆调用', () => {
    expect(monitorMaterial.toneMapped).toBe(false)
  })

  it('白天研发块底座不再用偏米色 #d4c8bc', () => {
    applySurfaceMode('day')
    expect(baseMaterial.color.getHexString()).toBe('7f7b77')
    expect(baseMaterial.envMapIntensity).toBe(0.15)
  })

  it('接触阴影分辨率不超过 1024，key 跟外壳版本挂钩', () => {
    expect(CONTACT_SHADOW_RESOLUTION).toBeLessThanOrEqual(1024)
    expect(SHELL_VERSION.length).toBeGreaterThan(0)
  })

  it('Scene 不静态引入后处理，只走 lazy 分包', () => {
    const src = readFileSync(join(here, '../components/Scene.tsx'), 'utf8')
    expect(src).not.toMatch(/from ['"]@react-three\/postprocessing['"]/)
    expect(src).not.toMatch(/from ['"]postprocessing['"]/)
    expect(src).toMatch(/lazy\(\(\) => import\('\.\/scene\/postfx\/balancedFx'\)/)
  })
})
