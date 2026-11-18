import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { CURTAIN_CACHE_KEYS } from '../box-projected-env/plan'
import { TOWER_FIN_SPACING_M, towerFinLoop, towerFocus } from '../components/scene/TowerFins'
import { finsAlong } from './massing'
import { applySurfaceMode, curtainMaterial } from './materials'

const root = dirname(fileURLToPath(import.meta.url))

function read(relative: string) {
  return readFileSync(join(root, relative), 'utf8')
}

describe('T135 塔楼 FinRow 与幕墙格线', () => {
  afterEach(() => {
    applySurfaceMode('day')
  })

  it('塔楼间距严于原裙房 2.2 m 和原格线 1.55 m，并与幕墙周期对齐', () => {
    expect(TOWER_FIN_SPACING_M).toBe(1.4)
    expect(TOWER_FIN_SPACING_M).toBeLessThan(2.2)
    expect(TOWER_FIN_SPACING_M).toBeLessThan(1.55)
    const materials = read('./materials.ts')
    expect(materials).toMatch(/fract\(guv \/ 1\.4\)/)
    expect(materials).not.toMatch(/fract\(guv \/ 1\.55\)/)
    const podium = read('../components/scene/Podium.tsx')
    expect(podium).toMatch(/spacing=\{PODIUM_ARC_FIN_SPACING_M\}/)
    expect(podium).not.toMatch(/spacing=\{2\.2\}/)
  })

  it('闭合总览轮廓按 1.4 m 铺翅，一层只有一批实例', () => {
    const loop = towerFinLoop()
    expect(loop[0]).toEqual(loop[loop.length - 1])
    const fins = finsAlong(loop, TOWER_FIN_SPACING_M, towerFocus(), 0.42 * 0.45)
    expect(fins.length).toBeGreaterThan(100)
    expect(fins.length).toBeLessThan(200)
  })

  it('塔楼 FinRow 在懒载模块里挂到每层外壳，打开幕墙或隐藏楼层时卸掉', () => {
    const mount = read('../components/scene/TowerFins.tsx')
    expect(mount).toMatch(/import \{ FinRow \} from '\.\/Fins'/)
    expect(mount).toMatch(/spacing=\{TOWER_FIN_SPACING_M\}/)
    expect(mount).toMatch(/hidden \|\| opened/)
    expect(mount).not.toMatch(/from '@react-three\/drei'/)
    const fins = read('../components/scene/Fins.tsx')
    expect(fins).toMatch(/<instancedMesh/)
    expect(fins).toMatch(/finsAlong/)
  })

  it('DemandLoop 静态挂载 TowerFins，Tower / Scene 不把该模块打进 hardGate', () => {
    const loop = read('../components/scene/DemandLoop.tsx')
    expect(loop).toMatch(/import \{ TowerFins \} from '\.\/TowerFins'/)
    expect(loop).toMatch(/<TowerFins \/>/)
    const tower = read('../components/scene/Tower.tsx')
    const scene = read('../components/Scene.tsx')
    expect(tower).not.toMatch(/TowerFins|from '\.\/Fins'/)
    expect(scene).not.toMatch(/TowerFins/)
  })

  it('格线周期写入幕墙 shader，缓存键与 T127 名单同步', () => {
    const shader = {
      uniforms: {} as Record<string, unknown>,
      vertexShader: '#include <common>\n#include <project_vertex>',
      fragmentShader: '#include <common>\n#include <opaque_fragment>',
    }
    const compile = curtainMaterial.onBeforeCompile as (next: typeof shader) => void
    compile(shader)
    expect(shader.fragmentShader).toMatch(/fract\(guv \/ 1\.4\)/)
    expect(shader.fragmentShader).not.toMatch(/fract\(guv \/ 1\.55\)/)
    expect(curtainMaterial.customProgramCacheKey?.()).toBe('twin-curtain-v3')
    expect(CURTAIN_CACHE_KEYS).toContain('twin-curtain-v3')
    expect(CURTAIN_CACHE_KEYS).toContain(curtainMaterial.customProgramCacheKey?.())
  })

  it('白天提高本地 HDR 反射，夜景提高 envMap、压低自发光，避免均匀死蓝格', () => {
    applySurfaceMode('day')
    expect(curtainMaterial.envMapIntensity).toBe(1.75)
    expect(curtainMaterial.emissiveIntensity).toBe(0)
    applySurfaceMode('night')
    expect(curtainMaterial.envMapIntensity).toBe(0.62)
    expect(curtainMaterial.emissiveIntensity).toBe(0.52)
    expect(curtainMaterial.roughness).toBe(0.24)
  })

  it('不重开 T127 / T129，不用 transmission 或总览 MeshReflector', () => {
    const materials = read('./materials.ts')
    expect(materials).not.toMatch(/\btransmission\s*:/)
    const tower = read('../components/scene/Tower.tsx')
    const fins = read('../components/scene/TowerFins.tsx')
    const podium = read('../components/scene/Podium.tsx')
    const blob = `${tower}\n${fins}\n${podium}\n${materials}`
    expect(blob).not.toMatch(/MeshReflectorMaterial|useBoxProjectedEnv|CubeCamera/)
  })
})
