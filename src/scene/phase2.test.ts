import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { applySurfaceMode, baseMaterial } from './materials'
import { MONITOR_DISPLAY_SRGB, monitorMaterial } from './stage/materials'
import { monitorPlateCorners } from './stage/geometry'
import { CONTACT_SHADOW_RESOLUTION, SHELL_VERSION } from './shellVersion'

const here = dirname(fileURLToPath(import.meta.url))

function relativeLuminance(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16)
  const lin = [value >> 16, (value >> 8) & 255, value & 255].map((channel) => {
    const unit = channel / 255
    return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
}

describe('T012 第二阶段约束', () => {
  it('告警屏不走色调映射，显示色亮度比 ≥1.5 且仍是红色', () => {
    expect(monitorMaterial.toneMapped).toBe(false)
    const alarm = MONITOR_DISPLAY_SRGB.alarm
    const online = MONITOR_DISPLAY_SRGB.online
    const ar = Number.parseInt(alarm.slice(1, 3), 16)
    const ag = Number.parseInt(alarm.slice(3, 5), 16)
    const ab = Number.parseInt(alarm.slice(5, 7), 16)
    expect(ar).toBeGreaterThan(ag)
    expect(ar).toBeGreaterThan(ab)
    expect(relativeLuminance(alarm) / relativeLuminance(online)).toBeGreaterThanOrEqual(1.5)
  })

  it('告警屏取样框按底座投影，三层同一套局部坐标', () => {
    const corners = monitorPlateCorners({ x: 2, z: -3, rot: 0 }, 48)
    expect(corners).toHaveLength(4)
    expect(corners.every((point) => Math.abs(point.y - (48 + 0.16 + 0.804)) < 1e-6)).toBe(true)
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
    expect(src).toMatch(/MonitorPass/)
  })
})
