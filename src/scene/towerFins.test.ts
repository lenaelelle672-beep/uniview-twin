import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { CURTAIN_CACHE_KEYS } from '../box-projected-env/plan'
import { TOWER_FIN_SPACING_M, TOWER_WEST_FIN_SPACING_M, towerFinLoop, towerFocus } from '../components/scene/TowerFins'
import {
  isTowerWestWingX,
  splitTowerFinLoops,
  TOWER_WEST_FIN_DEPTH_M,
  TOWER_WEST_FIN_THICKNESS_M,
} from './towerWestFins'
import { TOWER_SEAM_EAST_X, TOWER_SEAM_WEST_X } from './shell/rings'
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

  it('闭合总览轮廓仍按翼分别铺翅，南翼保持 1.4 m', () => {
    const loop = towerFinLoop()
    expect(loop[0]).toEqual(loop[loop.length - 1])
    const split = splitTowerFinLoops(loop)
    expect(split.west.length).toBeGreaterThan(0)
    expect(split.rest.length).toBeGreaterThan(0)
    const westFins = split.west.flatMap((points) => finsAlong(points, TOWER_WEST_FIN_SPACING_M, towerFocus(), 0.42 * 0.45))
    const restFins = split.rest.flatMap((points) => finsAlong(points, TOWER_FIN_SPACING_M, towerFocus(), 0.42 * 0.45))
    expect(restFins.length).toBeGreaterThan(40)
    expect(westFins.length).toBeGreaterThan(restFins.length * 0.4)
    expect(westFins.length + restFins.length).toBeGreaterThan(120)
    expect(westFins.length + restFins.length).toBeLessThan(400)
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

  it('T146 只加密西翼，南翼偏玻璃，不改共享 finMaterial 与竖缝', () => {
    expect(TOWER_FIN_SPACING_M).toBe(1.4)
    expect(TOWER_WEST_FIN_SPACING_M).toBe(0.58)
    expect(TOWER_WEST_FIN_DEPTH_M).toBe(0.52)
    expect(TOWER_WEST_FIN_THICKNESS_M).toBe(0.11)
    expect(TOWER_WEST_FIN_SPACING_M).toBeLessThan(TOWER_FIN_SPACING_M * 0.6)
    expect(TOWER_WEST_FIN_SPACING_M).toBeGreaterThan(0.45)
    expect(isTowerWestWingX(TOWER_SEAM_WEST_X)).toBe(true)
    expect(isTowerWestWingX(TOWER_SEAM_WEST_X + 0.2)).toBe(false)
    expect(isTowerWestWingX(TOWER_SEAM_EAST_X)).toBe(false)
    const split = splitTowerFinLoops(towerFinLoop())
    const westXs = split.west.flat().map(([x]) => x)
    const restPts = split.rest.flat()
    expect(westXs.length).toBeGreaterThan(4)
    expect(Math.max(...westXs)).toBeLessThanOrEqual(TOWER_SEAM_WEST_X + 1e-4)
    for (const pts of [...split.west, ...split.rest]) {
      for (let i = 1; i < pts.length; i += 1) {
        expect(Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])).toBeGreaterThan(1e-8)
      }
    }
    const southRest = restPts.filter(([x, z]) => x >= TOWER_SEAM_EAST_X - 1e-4 && z > 15)
    expect(southRest.length).toBeGreaterThan(4)
    const mount = read('../components/scene/TowerFins.tsx')
    expect(mount).toMatch(/spacing=\{TOWER_WEST_FIN_SPACING_M\}/)
    expect(mount).toMatch(/depth=\{TOWER_WEST_FIN_DEPTH_M\}/)
    expect(mount).toMatch(/thickness=\{TOWER_WEST_FIN_THICKNESS_M\}/)
    expect(mount).toMatch(/\bbox\b/)
    expect(mount).toMatch(/spacing=\{TOWER_FIN_SPACING_M\}/)
    expect(mount).not.toMatch(/finMaterial\.(color|metalness)/)
    expect(mount).not.toMatch(/TOWER_SEAM_LINER|TOWER_SEAM_SOUTH_Z/)
    const materials = read('./materials.ts')
    expect(materials).toMatch(/export const finMaterial[\s\S]*color: '#c5cad3'/)
    const seam = read('./towerSeam.ts')
    expect(seam).toMatch(/TOWER_SEAM_LINER_INSET_M = 0\.2/)
    expect(seam).toMatch(/TOWER_SEAM_LINER_MOUTH_M = 1\.2/)
  })

})
