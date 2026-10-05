import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { applySurfaceMode, baseMaterial, highlightCurtainMaterial, highlightJointMaterial } from './materials'
import { floorSpec } from '../data/floors'
import { boxesOverlap, facadeGlassCorners, neighborFloorId } from './stage/facadeBoxes'
import { MONITOR_DISPLAY_SRGB, monitorMaterial } from './stage/materials'
import { monitorPlateCorners, monitorScreenCorners, monitorScreenPatchCorners } from './stage/geometry'
import { blitColor, blitDepth, overlayDepthBudget } from './monitorDepth'
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
    expect(monitorMaterial.vertexColors).toBe(false)
    expect(monitorMaterial.depthTest).toBe(true)
    expect(monitorMaterial.depthWrite).toBe(true)
    const alarm = MONITOR_DISPLAY_SRGB.alarm
    const online = MONITOR_DISPLAY_SRGB.online
    const ar = Number.parseInt(alarm.slice(1, 3), 16)
    const ag = Number.parseInt(alarm.slice(3, 5), 16)
    const ab = Number.parseInt(alarm.slice(5, 7), 16)
    expect(ar).toBeGreaterThan(ag)
    expect(ar).toBeGreaterThan(ab)
    const max = Math.max(ar, ag, ab)
    const min = Math.min(ar, ag, ab)
    expect((max - min) / max).toBeGreaterThanOrEqual(0.5)
    expect(relativeLuminance(alarm) / relativeLuminance(online)).toBeGreaterThanOrEqual(1.5)
  })

  it('告警屏取样框落在屏幕面上，底座坐标仍可用', () => {
    const plate = monitorPlateCorners({ x: 2, z: -3, rot: 0 }, 48)
    expect(plate).toHaveLength(4)
    expect(plate.every((point) => Math.abs(point.y - (48 + 0.16 + 0.804)) < 1e-6)).toBe(true)
    const screen = monitorScreenCorners({ x: 2, z: -3, rot: 0 }, 48)
    expect(screen).toHaveLength(8)
    expect(Math.min(...screen.map((point) => point.y))).toBeGreaterThan(48 + 0.16 + 0.7)
    const patch = monitorScreenPatchCorners({ x: 2, z: -3, rot: 0 }, 48, { u: 0, v: 0, su: 0.26, sv: 0.26 })
    expect(patch).toHaveLength(4)
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
    expect(src).not.toMatch(/from ['"].*MonitorSamples['"]/)
    expect(src).not.toMatch(/from ['"].*monitorDepth['"]/)
  })

  it('blitDepth 拒绝写入默认帧缓冲，MonitorPass 不再调用', () => {
    const depth = readFileSync(join(here, 'monitorDepth.ts'), 'utf8')
    const pass = readFileSync(join(here, '../components/scene/MonitorPass.tsx'), 'utf8')
    const fx = readFileSync(join(here, '../components/scene/postfx/balancedFx.tsx'), 'utf8')
    const warmup = readFileSync(join(here, '../components/scene/useBalancedWarmup.ts'), 'utf8')
    const floor = readFileSync(join(here, 'stage/FloorStage.tsx'), 'utf8')
    expect(pass).not.toMatch(/from ['"].*monitorDepth['"]/)
    expect(pass).not.toMatch(/blitDepth\s*\(/)
    expect(pass).not.toMatch(/blitColor\s*\(/)
    expect(pass).not.toMatch(/blitFramebuffer/)
    expect(warmup).toMatch(/from ['"].*glProbe['"]/)
    expect(warmup).not.toMatch(/from ['"].*monitorDepth['"]/)
    expect(floor).toMatch(/import\('\.\/TowerInterior'\)/)
    expect(floor).toMatch(/import\('\.\/B1Interior'\)/)
    expect(fx).not.toMatch(/blitDepth\s*\(/)
    expect(fx).not.toMatch(/blitFramebuffer/)
    expect(fx).toMatch(/ensureMonitorTarget/)
    expect(depth).toMatch(/dest == null/)
    expect(depth).toMatch(/blitFramebuffer/)
    expect(() => blitDepth({} as never, {} as never, null as never)).toThrow(/default framebuffer/)
    expect(() => blitColor({} as never, {} as never, null as never)).toThrow(/default framebuffer/)
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

  it('未分配时告警屏离屏目标为 0，D119 需要时才开一张单采样缓冲', () => {
    expect(overlayDepthBudget()).toEqual({ extraTargets: 0, extraBytes: 0 })
    const fx = readFileSync(join(here, '../components/scene/postfx/balancedFx.tsx'), 'utf8')
    expect(fx).toMatch(/ensureMonitorTarget/)
    expect(fx).toMatch(/MonitorAfterTone/)
    expect(fx).not.toMatch(/MonitorInComposer restore/)
  })

  it('预编译先查 KHR_parallel_shader_compile，没有就走同步 compile', () => {
    const src = readFileSync(join(here, '../components/scene/useBalancedWarmup.ts'), 'utf8')
    expect(src).toMatch(/supportsParallelShaderCompile/)
    expect(src).toMatch(/gl\.compile\(scene, camera\)/)
  })

  it('就绪只走 overviewReady，Scene 和 Probe 不置 __twinReady', () => {
    const scene = readFileSync(join(here, '../components/Scene.tsx'), 'utf8')
    const probe = readFileSync(join(here, '../components/scene/RenderProbe.tsx'), 'utf8')
    const ready = readFileSync(join(here, 'overviewReady.ts'), 'utf8')
    expect(scene).not.toMatch(/__twinReady\s*=/)
    expect(probe).not.toMatch(/__twinReady\s*=/)
    expect(probe).toMatch(/markSuspenseReady/)
    expect(ready).toMatch(/w\.__twinReady = true/)
    expect(scene).toMatch(/__twinPrefetchAt/)
    expect(scene).toMatch(/floorDecor/)
    expect(scene).toMatch(/textRuntime/)
    expect(scene).toMatch(/BlueprintView/)
    expect(scene).toMatch(/lazy\(\(\) => import\('\.\/scene\/postfx\/balancedFx'\)/)
    const site = scene.indexOf('<Site ')
    const probeJsx = scene.indexOf('<RenderProbe')
    const afterProbe = scene.slice(probeJsx)
    expect(site).toBeGreaterThan(-1)
    expect(probeJsx).toBeGreaterThan(site)
    const beforeProbe = scene.slice(0, probeJsx)
    const depth = (beforeProbe.match(/<Suspense/g) ?? []).length - (beforeProbe.match(/<\/Suspense>/g) ?? []).length
    expect(depth).toBeGreaterThan(0)
    expect(afterProbe.indexOf('</Suspense>')).toBeLessThan(afterProbe.indexOf('<FacadeSamples'))
  })

  it('D125 首屏量法用 Python gzip.compress(9)，且 blit 只进均衡档包', () => {
    const measure = readFileSync(join(here, '../../scripts/measure-first-screen.mjs'), 'utf8')
    expect(measure).toMatch(/gzip\.compress\([^,]+,\s*9\)/)
    expect(measure).not.toMatch(/gzipSync/)
    expect(measure).toMatch(/436_361|436361/)
    expect(measure).toMatch(/105_000|105000/)
    const fx = readFileSync(join(here, '../components/scene/postfx/balancedFx.tsx'), 'utf8')
    expect(fx).not.toMatch(/setSize\(\s*1\s*,\s*1\s*\)/)
    const grille = readFileSync(join(here, '../components/scene/EastGrille.tsx'), 'utf8')
    expect(grille).toMatch(/clipShadows/)
    const cut = readFileSync(join(here, 'stage/FloorCut.tsx'), 'utf8')
    expect(cut).toMatch(/applyEastGrilleCut/)
    expect(cut).toMatch(/east_grille/)
    const pass = readFileSync(join(here, '../components/scene/MonitorPass.tsx'), 'utf8')
    expect(pass).toMatch(/from ['"].*glProbe['"]/)
    expect(pass).toMatch(/from ['"].*monitorBudget['"]/)
  })
})
