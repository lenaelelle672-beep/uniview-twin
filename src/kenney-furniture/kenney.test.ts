import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { composeOverlay } from '../grid/mount'
import { KENNEY_SOURCE_BLOCK } from '../../scripts/kenneyFurniturePlugin'
import {
  CHAIR_FOOTPRINT,
  CHAIR_YAW,
  DESK_FOOTPRINT,
  DESK_YAW,
  fitToFootprint,
  kenneyFurnitureVisible,
  kenneySeedCount,
  type KenneyGateInput,
} from './plan'

const here = dirname(fileURLToPath(import.meta.url))

function read(relative: string): string {
  return readFileSync(join(here, relative), 'utf8')
}

const openGate: KenneyGateInput = {
  view: 'floor',
  floorId: 'F1',
  exploded: false,
  explodeProgress: 0,
  stationProgress: 0,
  stationActive: false,
  stationAnimating: false,
}

describe('Kenney 桌椅种子', () => {
  it('等比缩进程序化工位脚印', () => {
    const desk = fitToFootprint(
      { minX: -0.01, minY: 0, minZ: -0.38, maxX: 0.724475443, maxY: 0.38440755, maxZ: 0.0123 },
      DESK_FOOTPRINT,
    )
    expect(desk.scale).toBeCloseTo(0.7 / 0.3923, 5)
    expect(desk.offsetZ).toBe(0)
    const chair = fitToFootprint(
      { minX: 0, minY: 0, minZ: -0.314299036, maxX: 0.33495, maxY: 0.607599976, maxZ: 0 },
      CHAIR_FOOTPRINT,
      0.62,
    )
    expect(chair.scale).toBeCloseTo(0.46 / 0.314299036, 5)
    expect(chair.offsetZ).toBe(0.62)
    expect(DESK_YAW).toBe(0)
    expect(CHAIR_YAW).toBe(Math.PI)
    expect(kenneySeedCount(17)).toBe(4)
    expect(kenneySeedCount(3)).toBe(3)
    expect(kenneySeedCount(0)).toBe(0)
    expect(() => kenneySeedCount(-1)).toThrow(/工位数/)
    expect(() => fitToFootprint({ minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 1, maxZ: 1 }, DESK_FOOTPRINT)).toThrow(
      /包围盒/,
    )
  })

  it('总览和爆炸期间不挂，进层不看总览就绪标记', () => {
    expect(kenneyFurnitureVisible(openGate)).toBe(true)
    expect(kenneyFurnitureVisible({ ...openGate, view: 'overview' })).toBe(false)
    expect(kenneyFurnitureVisible({ ...openGate, view: 'building' })).toBe(false)
    expect(kenneyFurnitureVisible({ ...openGate, floorId: null })).toBe(false)
    expect(kenneyFurnitureVisible({ ...openGate, exploded: true })).toBe(false)
    expect(kenneyFurnitureVisible({ ...openGate, explodeProgress: 0.2 })).toBe(false)
    expect(kenneyFurnitureVisible({ ...openGate, stationActive: true })).toBe(false)
    expect(kenneyFurnitureVisible({ ...openGate, stationAnimating: true })).toBe(false)
    expect(kenneyFurnitureVisible({ ...openGate, stationProgress: 0.4 })).toBe(false)
  })

  it('第八个槽位缺省时，格网组合保持原样', () => {
    expect(composeOverlay.length).toBe(3)
    expect(composeOverlay(null, null, null)).toBeNull()
    expect(composeOverlay(null, null, null, null, null, null, null, 'kenney')).toBe('kenney')
    const all = composeOverlay('measure', 'grid', 'author', 'segments', 'screen', 'poster', null, 'kenney')
    expect(all).toMatchObject({
      props: { children: ['measure', 'grid', 'author', 'segments', 'screen', 'poster', 'kenney'] },
    })
  })

  it('懒挂在 dock 哈希之后，不进爆炸和拾取', () => {
    const dock = read('../viewmarks/dock.tsx')
    const mount = read('./mount.ts')
    const live = read('./KenneyStations.tsx')
    const plan = read('./plan.ts')
    const plugin = read('../../scripts/kenneyFurniturePlugin.ts')
    const vite = read('../../vite.config.ts')
    const grid = read('../grid/mount.ts')
    const pkg = JSON.parse(read('../../package.json')) as { dependencies: Record<string, string> }
    const desk = readFileSync(join(here, '../../public/models/kenney/desk.glb'))
    const chair = readFileSync(join(here, '../../public/models/kenney/chairDesk.glb'))
    const license = read('../../public/models/kenney/LICENSE.txt')
    const note = read('../../public/models/kenney/README.md')
    const readme = read('../../README.md')

    expect(dock).toContain(KENNEY_SOURCE_BLOCK)
    expect(dock.replace(KENNEY_SOURCE_BLOCK, '')).not.toMatch(/kenney-furniture|mountKenneyFurniture/)
    expect(plugin).toContain(KENNEY_SOURCE_BLOCK)
    expect(plugin).toMatch(/name: 'kenney-furniture-after-hash'/)
    expect(plugin).toMatch(/apply: 'build'/)
    expect(plugin).toMatch(/assets\/KenneyMount\.js/)
    expect(plugin).toMatch(/assets\/KenneyStations\.js/)
    const plugins = vite.slice(vite.lastIndexOf('plugins: ['))
    expect(plugins.indexOf('explodeProgressAfterHash()')).toBeGreaterThanOrEqual(0)
    expect(plugins.indexOf('explodeProgressAfterHash()')).toBeLessThan(plugins.indexOf('kenneyFurnitureAfterHash()'))
    expect(plugins.indexOf('kenneyFurnitureAfterHash()')).toBeLessThan(plugins.indexOf('isolateTransformControlsLeaves()'))
    expect(grid).toMatch(/__twinKenneyNode/)

    expect(mount).toMatch(/import\('\.\/KenneyStations'\)/)
    expect(mount).not.toMatch(/import \{ KenneyStations \}/)
    expect(mount).not.toMatch(/useGLTF\(|GLTFLoader|from 'three'/)
    expect(mount).toMatch(/__twinKenneyNode/)
    expect(plan).not.toMatch(/from 'three'|@react-three|https?:/)
    expect(live).toMatch(/@react-three\/drei\/core\/Gltf/)
    expect(live).toMatch(/useGLTF\(KENNEY_DESK_URL, false, false\)/)
    expect(live).toMatch(/useGLTF\(KENNEY_CHAIR_URL, false, false\)/)
    expect(live).not.toMatch(/from '@react-three\/drei'/)
    expect(live).toMatch(/getObjectByName\('WorkstationDesks'\)/)
    expect(live).toMatch(/name="KenneyDesk"/)
    expect(live).toMatch(/name="KenneyChair"/)
    expect(live).not.toMatch(/name="Workstation/)
    expect(live).not.toMatch(/from ['"][^'"]*instanceMatrix|from ['"][^'"]*instancedSlots/)

    const untouched = [
      '../components/Scene.tsx',
      '../components/scene/DemandLoop.tsx',
      '../scene/stage/FloorStage.tsx',
      '../scene/stage/workstationMeshes.tsx',
      '../scene/stage/instancedSlots.tsx',
      '../scene/instanceMatrix.ts',
      '../scene/explode.ts',
      '../scene/pick/explodePick.ts',
      '../scene/pick/meshBoundsPolicy.ts',
      '../station-explode/drive.ts',
      '../floors/JsonFloorInterior.tsx',
    ]
    for (const file of untouched) {
      expect(read(file)).not.toMatch(/kenney-furniture|mountKenneyFurniture|KenneyDesk|chairDesk/)
    }

    expect(Object.keys(pkg.dependencies).sort()).toEqual(
      [
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
      ].sort(),
    )
    expect(desk.byteLength).toBe(15048)
    expect(chair.byteLength).toBe(39016)
    expect(desk.subarray(0, 4).toString('utf8')).toBe('glTF')
    expect(chair.subarray(0, 4).toString('utf8')).toBe('glTF')
    expect(license).toMatch(/CC0/)
    expect(license).toMatch(/Kenney/)
    expect(note).toMatch(/kenney\.nl\/assets\/furniture-kit/)
    expect(note).toMatch(/CC0/)
    expect(readme).toMatch(/kenney\.nl\/assets\/furniture-kit/)
    expect(readme).toMatch(/CC0/)
  })
})
