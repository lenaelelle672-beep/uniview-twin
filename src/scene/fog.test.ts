import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Color, FogExp2 } from 'three'
import { describe, expect, it } from 'vitest'
import {
  FOG_DENSITY,
  FOG_VIEW_DEPTH,
  SCENE_BACKGROUND,
  fogExp2Factor,
  overviewFog,
} from './fog'

const here = dirname(fileURLToPath(import.meta.url))

describe('总览 FogExp2', () => {
  it('昼 / 夜雾色与背景同一套，白模不挂雾', () => {
    expect(SCENE_BACKGROUND.day).toBe('#bdd2e6')
    expect(SCENE_BACKGROUND.night).toBe('#07111c')
    expect(SCENE_BACKGROUND.model).toBe('#000000')

    const day = overviewFog('day')
    const night = overviewFog('night')
    expect(day).toEqual({ color: '#bdd2e6', density: FOG_DENSITY.day })
    expect(night).toEqual({ color: '#07111c', density: FOG_DENSITY.night })
    expect(overviewFog('model')).toBeNull()
    expect(overviewFog('day')).toBe(day)
    expect(overviewFog('night')).toBe(night)
  })

  it('昼夜分套，夜雾更稀，避免黑雾吃掉塔楼剪影', () => {
    expect(FOG_DENSITY.day).toBeGreaterThan(0)
    expect(FOG_DENSITY.night).toBeGreaterThan(0)
    expect(FOG_DENSITY.night).toBeLessThan(FOG_DENSITY.day)
    expect(FOG_DENSITY.day).toBeCloseTo(0.00112, 6)
    expect(FOG_DENSITY.night).toBeCloseTo(0.00096, 6)
  })

  it('three FogExp2 接得住这套颜色和密度', () => {
    for (const mode of ['day', 'night'] as const) {
      const preset = overviewFog(mode)
      expect(preset).not.toBeNull()
      const fog = new FogExp2(preset!.color, preset!.density)
      fog.name = 'OverviewFog'
      expect(fog.isFogExp2).toBe(true)
      expect(fog.name).toBe('OverviewFog')
      expect(fog.density).toBe(preset!.density)
      expect(fog.color.equals(new Color(SCENE_BACKGROUND[mode]))).toBe(true)
    }
  })

  it('近景楼体和进层标签几乎不吃雾，远草坪可感，拉远也不把楼吞掉', () => {
    const day = FOG_DENSITY.day
    const night = FOG_DENSITY.night
    const depth = FOG_VIEW_DEPTH

    expect(fogExp2Factor(day, 0)).toBe(0)
    expect(fogExp2Factor(day, -10)).toBe(0)

    expect(fogExp2Factor(day, depth.floorLabel)).toBeLessThan(0.01)
    expect(fogExp2Factor(night, depth.floorLabel)).toBeLessThan(0.01)

    expect(fogExp2Factor(day, depth.nearFacade)).toBeLessThan(0.02)
    expect(fogExp2Factor(night, depth.nearFacade)).toBeLessThan(0.02)

    expect(fogExp2Factor(day, depth.eastBlock)).toBeLessThan(0.04)
    expect(fogExp2Factor(night, depth.eastBlock)).toBeLessThan(0.03)

    expect(fogExp2Factor(day, depth.tower)).toBeGreaterThan(0.03)
    expect(fogExp2Factor(day, depth.tower)).toBeLessThan(0.06)
    expect(fogExp2Factor(night, depth.tower)).toBeLessThan(fogExp2Factor(day, depth.tower))
    expect(fogExp2Factor(night, depth.tower)).toBeLessThan(0.05)

    const dayFar = fogExp2Factor(day, depth.farGround)
    const nightFar = fogExp2Factor(night, depth.farGround)
    expect(dayFar).toBeGreaterThan(0.1)
    expect(dayFar).toBeLessThan(0.18)
    expect(nightFar).toBeGreaterThan(0.07)
    expect(nightFar).toBeLessThan(0.14)
    expect(nightFar).toBeLessThan(dayFar)
    expect(dayFar).toBeGreaterThan(fogExp2Factor(day, depth.tower) * 2)

    expect(fogExp2Factor(day, depth.zoomedOutTower)).toBeLessThan(0.45)
    expect(fogExp2Factor(night, depth.zoomedOutTower)).toBeLessThan(0.4)
    expect(fogExp2Factor(day, depth.farGround)).toBeGreaterThan(fogExp2Factor(day, depth.eastBlock))
  })

  it('挂在 Scene 主路径：FogExp2 + primitive attach，demand 下 invalidate；密度不散落', () => {
    const scene = readFileSync(join(here, '../components/Scene.tsx'), 'utf8')
    const fog = readFileSync(join(here, 'fog.ts'), 'utf8')
    const shadows = readFileSync(join(here, 'softShadows.ts'), 'utf8')

    expect(scene).toMatch(/import \{ overviewFog, SCENE_BACKGROUND \} from '\.\.\/scene\/fog'/)
    expect(scene).not.toMatch(/import\([^)]*fog/)
    expect(scene).toMatch(/new FogExp2\(preset\.color, preset\.density\)/)
    expect(scene).toMatch(/<primitive key=\{mode\} object=\{fog\} attach="fog" \/>/)
    expect(scene).toMatch(/<OverviewFog mode=\{mode\} \/>/)
    expect(scene).toMatch(/const background = SCENE_BACKGROUND\[mode\]/)
    expect(scene).toMatch(/invalidate\(\)/)
    expect(scene).not.toMatch(/0\.00112|0\.00096/)
    expect(scene).not.toMatch(/<fog |<fogExp2 /)

    expect(fog).not.toMatch(/from ['"][^'"]*(softShadows|DemandLoop|cameraRest|frameSchedule|balancedFx)/)
    expect(fog).not.toMatch(/\.dithering/)
    expect(shadows).toMatch(/SOFT_SHADOW_CHUNK_AFTER_FIRST_MS = 2600/)
    expect(scene).toMatch(/SOFT_SHADOW_CHUNK_AFTER_FIRST_MS/)
    expect(scene).toMatch(/gl\.toneMappingExposure = mode === 'day' \? 1\.95 : 1/)
    expect(scene).toMatch(/intensity=\{model \? 1\.65 : night \? 0\.32 : 1\.53\}/)
  })
})
