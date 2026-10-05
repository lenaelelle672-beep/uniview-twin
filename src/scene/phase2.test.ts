import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { applySurfaceMode, baseMaterial, highlightCurtainMaterial, highlightJointMaterial } from './materials'
import { floorSpec } from '../data/floors'
import { boxesOverlap, facadeGlassCorners, neighborFloorId } from './stage/facadeBoxes'
import { MONITOR_DISPLAY_SRGB, monitorMaterial } from './stage/materials'
import { monitorPlateCorners } from './stage/geometry'
import { overlayDepthBudget } from './monitorDepth'
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
    expect(monitorMaterial.depthTest).toBe(true)
    expect(monitorMaterial.depthWrite).toBe(true)
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

  it('接触阴影分辨率不超过 512，key 跟外壳版本挂钩', () => {
    expect(CONTACT_SHADOW_RESOLUTION).toBeLessThanOrEqual(512)
    expect(SHELL_VERSION.length).toBeGreaterThan(0)
  })

  it('Scene 不静态引入后处理，只走 lazy 分包', () => {
    const src = readFileSync(join(here, '../components/Scene.tsx'), 'utf8')
    expect(src).not.toMatch(/from ['"]@react-three\/postprocessing['"]/)
    expect(src).not.toMatch(/from ['"]postprocessing['"]/)
    expect(src).toMatch(/lazy\(\(\) => import\('\.\/scene\/postfx\/balancedFx'\)/)
    expect(src).toMatch(/MonitorPass/)
    expect(src).toMatch(/MainScenePass/)
    expect(src).not.toMatch(/blitFramebuffer/)
  })

  it('源码不再往默认帧缓冲 blit 深度', () => {
    const files = [
      readFileSync(join(here, 'monitorDepth.ts'), 'utf8'),
      readFileSync(join(here, '../components/scene/MonitorPass.tsx'), 'utf8'),
      readFileSync(join(here, '../components/scene/postfx/balancedFx.tsx'), 'utf8'),
    ]
    expect(files.some((src) => src.includes('blitFramebuffer'))).toBe(false)
  })

  it('选中高亮仍是 #f7eedd，不参与色调映射', () => {
    expect(highlightCurtainMaterial.color.getHexString()).toBe('f7eedd')
    expect(highlightJointMaterial.color.getHexString()).toBe('f7eedd')
    expect(highlightCurtainMaterial.toneMapped).toBe(false)
    expect(highlightJointMaterial.toneMapped).toBe(false)
  })

  it('高亮取样落在 F12 / F11 幕墙中带，世界盒不重叠', () => {
    expect(neighborFloorId('F12')).toBe('F11')
    const f12 = facadeGlassCorners(floorSpec('F12').elevation, floorSpec('F12').height)
    const f11 = facadeGlassCorners(floorSpec('F11').elevation, floorSpec('F11').height)
    const f12MinY = Math.min(...f12.map((point) => point.y))
    const f11MaxY = Math.max(...f11.map((point) => point.y))
    expect(f12MinY).toBeGreaterThan(f11MaxY)
    expect(
      boxesOverlap(
        { x: 100, y: 200, w: 20, h: 12 },
        { x: 100, y: 220, w: 20, h: 12 },
      ),
    ).toBe(false)
  })

  it('告警屏通道不再另开全屏渲染目标', () => {
    expect(overlayDepthBudget()).toEqual({ extraTargets: 0, extraBytes: 0 })
  })

  it('预编译先查 KHR_parallel_shader_compile，没有就走同步 compile', () => {
    const src = readFileSync(join(here, '../components/scene/useBalancedWarmup.ts'), 'utf8')
    expect(src).toMatch(/supportsParallelShaderCompile/)
    expect(src).toMatch(/gl\.compile\(scene, camera\)/)
  })
})
