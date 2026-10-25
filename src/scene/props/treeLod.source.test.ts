import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { USER_CAMERA_SMOOTH_TIME } from '../stage/cameraTransition'

const here = dirname(fileURLToPath(import.meta.url))

function read(path: string): string {
  return readFileSync(join(here, path), 'utf8')
}

describe('T073 Detailed 只扩到已有 lo 的树', () => {
  it('东立面格栅继续禁止静态导入 Detailed', () => {
    const grille = read('../../components/scene/EastGrille.tsx')
    expect(grille).toMatch(/不静态导入 drei Detailed/)
    expect(grille).not.toMatch(/from '@react-three\/drei\/core\/Detailed'/)
  })

  it('场地仍按 T043 选树，灯不进 Detailed', () => {
    const site = read('../../components/scene/Site.tsx')
    const quality = read('../quality.ts')
    expect(site).not.toMatch(/Detailed/)
    expect(site).toMatch(/PROP_URL\.LAMP/)
    expect(site).toMatch(/selectTreeModels/)
    expect(quality).toMatch(/if \(quality === 'perf'\) return \{ visual: 'lo', shadow: null \}/)
    expect(quality).toMatch(/return \{ visual: 'hi', shadow: 'lo' \}/)
  })

  it('树的 Detailed 在懒包里，距离和走廊对齐，不给没 lo 的资产生壳', () => {
    const live = read('./TreeLod.tsx')
    const plan = read('./treeLodPlan.ts')
    expect(live).toMatch(/@react-three\/drei\/core\/Detailed/)
    expect(live).not.toMatch(/from '@react-three\/drei'/)
    expect(live).toMatch(/TREE_LOD_DISTANCES/)
    expect(live).toMatch(/TREE_LOD_HYSTERESIS/)
    expect(live).not.toMatch(/street-lamp|roof-sign|east-grille|FogExp2|balancedFx|geometry\.ts|InstancedProp|siteGeometry/)
    expect(plan).toMatch(/LOD_SKIP_NO_LO = \['\/models\/street-lamp\.glb', '\/models\/roof-sign\.glb'\]/)
    expect(plan).not.toMatch(/from 'three'|@react-three/)
  })

  it('走廊人物保持 [0, 80]，不加重滞回', () => {
    const people = read('../stage/CorridorPeople.tsx')
    expect(people).toMatch(/distances=\{\[0, 80\]\}/)
    expect(people).toMatch(/useLayerShown\('people'\)/)
    expect(people).toMatch(/useDetailedLevelInvalidate/)
    expect(people).not.toMatch(/hysteresis/)
  })

  it('DemandLoop 过了首帧 2600ms 才 import，性能档和白模不进包', () => {
    const loop = read('../../components/scene/DemandLoop.tsx')
    expect(loop).toMatch(/TREE_LOD_AFTER_FIRST_MS = 2600/)
    expect(loop).toMatch(/import\('\.\.\/\.\.\/scene\/props\/TreeLod'\)/)
    expect(loop).not.toMatch(/from ['"][^'"]*TreeLod/)
    expect(loop).not.toMatch(/from '@react-three\/drei\/core\/Detailed'/)
    expect(loop).toMatch(/quality !== 'perf' && presentation !== 'model'/)
    const host = loop.slice(loop.indexOf('function TreeLodHost'))
    expect(host.indexOf('if (!enabled) return')).toBeGreaterThan(-1)
    expect(host.indexOf('if (!enabled) return')).toBeLessThan(host.indexOf("import('../../scene/props/TreeLod')"))
    expect(host.indexOf('TREE_LOD_AFTER_FIRST_MS')).toBeLessThan(host.indexOf("import('../../scene/props/TreeLod')"))
    expect(host.indexOf("quality !== 'perf' && presentation !== 'model'")).toBeLessThan(
      host.indexOf("import('../../scene/props/TreeLod')"),
    )
  })

  it('不升 drei，不改雾和 T032', () => {
    const pkg = JSON.parse(read('../../../package.json')) as {
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
    }
    const fog = read('../fog.ts')
    const transition = read('../stage/cameraTransition.ts')
    expect(pkg.dependencies['@react-three/drei']).toBe('10.7.9')
    expect(pkg.dependencies['three']).toBe('0.186.1')
    expect(Object.keys(pkg.dependencies).sort()).toEqual([
      '@react-three/drei',
      '@react-three/fiber',
      '@react-three/postprocessing',
      'postprocessing',
      'react',
      'react-dom',
      'three',
      'troika-three-text',
      'troika-three-utils',
      'troika-worker-utils',
      'zustand',
    ])
    expect(pkg.devDependencies['three-mesh-bvh']).toBeUndefined()
    expect(fog).toMatch(/day: 0\.00112/)
    expect(fog).toMatch(/night: 0\.00096/)
    expect(USER_CAMERA_SMOOTH_TIME).toBe(0.42)
    expect(transition).toMatch(/USER_CAMERA_SMOOTH_TIME = 0\.42/)
  })
})
