import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  BoxGeometry,
  BufferGeometry,
  Group,
  InstancedMesh,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  Scene,
  Vector3,
} from 'three'
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh'
import { buildB1ZoneGeometry } from '../b1Zones'
import { extrudeUp } from '../extrude'
import { USER_CAMERA_SMOOTH_TIME } from '../stage/cameraTransition'
import { createTowerGlass } from '../towerGlass'
import { pickBvhHomeOf } from './pickBvhHome'
import {
  measurePickActive,
  pickBvhDue,
  resetMeasurePickForTests,
  setMeasurePickActive,
  subscribeMeasurePick,
} from './pickBvhTiming'
import { collectEnterPickGroups, collectMeasurePickGroups, pickGroupSignature } from './pickTargets'

const here = dirname(fileURLToPath(import.meta.url))

function read(path: string): string {
  return readFileSync(join(here, path), 'utf8')
}

afterEach(() => {
  resetMeasurePickForTests()
})

describe('拾取包围树的门', () => {
  it('首帧之后 2600ms 才算到点', () => {
    expect(pickBvhDue(null, 3000)).toBe(false)
    expect(pickBvhDue(undefined, 3000)).toBe(false)
    expect(pickBvhDue(Number.NaN, 3000)).toBe(false)
    expect(pickBvhDue(1000, Number.NaN)).toBe(false)
    expect(pickBvhDue(1000, 3599)).toBe(false)
    expect(pickBvhDue(1000, 3600)).toBe(true)
  })

  it('测距开关只通知订阅者', () => {
    const seen: boolean[] = []
    const stop = subscribeMeasurePick(() => seen.push(measurePickActive()))
    expect(measurePickActive()).toBe(false)
    setMeasurePickActive(false)
    setMeasurePickActive(true)
    setMeasurePickActive(true)
    setMeasurePickActive(false)
    stop()
    setMeasurePickActive(true)
    expect(seen).toEqual([true, false])
    expect(measurePickActive()).toBe(true)
  })
})

describe('进层和测距该包哪些网格', () => {
  function sceneWithPicks() {
    const scene = new Scene()
    const tower = new Group()
    tower.name = 'Tower'
    const shellB = new Group()
    shellB.name = 'FloorShell-F2'
    const shellA = new Group()
    shellA.name = 'FloorShell-F1'
    tower.add(shellA, shellB)
    const basement = new Group()
    basement.name = 'B1'
    const basementSlab = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
    basementSlab.name = 'B1Slab'
    basement.add(basementSlab)
    const basementPick = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
    basementPick.name = 'B1Pick'
    const site = new Group()
    const park = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
    park.name = 'Park'
    const road = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
    const trees = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 1)
    trees.name = 'Trees'
    site.add(park, road, trees)
    const parcel = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
    parcel.name = 'Parcel'
    scene.add(tower, basement, basementPick, site, parcel)
    return { scene, tower, shellA, shellB, basement, basementSlab, basementPick, site, park, road, trees, parcel }
  }

  it('进层包楼层壳、B1 和 B1Pick，按名字排好', () => {
    const { scene, tower, shellA, shellB, basement, basementPick } = sceneWithPicks()
    const groups = collectEnterPickGroups(scene)
    expect(groups.map((group) => group.id)).toEqual(['enter-shells', 'enter-b1', 'enter-b1pick'])
    expect(groups[0]).toMatchObject({ parent: tower, objects: [shellA, shellB] })
    expect(groups[1]?.objects).toEqual([basement])
    expect(groups[2]?.objects).toEqual([basementPick])
  })

  it('测距包场地兄弟网格，跳过实例和已经被进层包住的楼板', () => {
    const { scene, site, park, road, trees, parcel, basement, basementSlab } = sceneWithPicks()
    const covered = collectMeasurePickGroups(scene, [basement])
    expect(covered.map((group) => group.id)).toEqual(['measure-ground', 'measure-parcel'])
    expect(covered[0]?.parent).toBe(site)
    expect(covered[0]?.objects).toEqual([road, park])
    expect(covered[0]?.objects).not.toContain(trees)
    expect(covered[1]?.objects).toEqual([parcel])

    const open = collectMeasurePickGroups(scene, [])
    expect(open.map((group) => group.id)).toEqual(['measure-ground', 'measure-parcel', 'measure-b1slab'])
    expect(open[2]?.objects).toEqual([basementSlab])

    basementSlab.visible = false
    expect(collectMeasurePickGroups(scene, []).map((group) => group.id)).not.toContain('measure-b1slab')
  })

  it('已经挂进 PickBvh 组之后，原父级和名单不变', () => {
    const { scene, site, park, road } = sceneWithPicks()
    const before = collectMeasurePickGroups(scene, [])
    const wrapped = new Group()
    wrapped.name = 'PickBvh:measure-ground'
    site.add(wrapped)
    wrapped.add(park, road)
    const after = collectMeasurePickGroups(scene, [])
    expect(pickBvhHomeOf(park)).toBe(site)
    expect(after[0]?.parent).toBe(site)
    expect(after[0]?.objects).toEqual([road, park])
    expect(pickGroupSignature(after.filter((group) => group.id === 'measure-ground'))).toBe(
      pickGroupSignature(before.filter((group) => group.id === 'measure-ground')),
    )
  })
})

describe('包围树能建也能卸', () => {
  function cycle(geometry: BufferGeometry) {
    const geo = geometry as BufferGeometry & {
      boundsTree?: unknown
      computeBoundsTree: typeof computeBoundsTree
      disposeBoundsTree: typeof disposeBoundsTree
    }
    geo.computeBoundsTree = computeBoundsTree
    geo.disposeBoundsTree = disposeBoundsTree
    geo.computeBoundsTree()
    expect(geo.boundsTree).toBeTruthy()
    geo.disposeBoundsTree()
    expect(geo.boundsTree).toBeFalsy()
    geometry.dispose()
  }

  it('挤出、挖洞、只留顶面、幕墙和工位代理盒都能走 drei 那套方法', () => {
    cycle(
      extrudeUp(
        [
          [0, 0],
          [4, 0],
          [4, 3],
          [0, 3],
        ],
        0.2,
      ),
    )
    cycle(
      extrudeUp(
        [
          [0, 0],
          [6, 0],
          [6, 5],
          [0, 5],
        ],
        0.3,
        [
          [
            [2, 2],
            [3, 2],
            [3, 3],
            [2, 3],
          ],
        ],
        'top',
      ),
    )
    cycle(createTowerGlass(12, 4))
    cycle(new BoxGeometry(0.35, 0.35, 0.35))
  })

  it('没有索引的 B1 色块建树之后射线还打得中', () => {
    const geometry = buildB1ZoneGeometry()
    const material = new MeshBasicMaterial({ side: DoubleSide })
    const mesh = new Mesh(geometry, material)
    mesh.updateMatrixWorld(true)
    const position = geometry.getAttribute('position')
    const midpoint = new Vector3()
      .fromBufferAttribute(position, 0)
      .add(new Vector3().fromBufferAttribute(position, 1))
      .add(new Vector3().fromBufferAttribute(position, 2))
      .multiplyScalar(1 / 3)
    const raycaster = new Raycaster(midpoint.clone().add(new Vector3(0, 2, 0)), new Vector3(0, -1, 0))
    const before = raycaster.intersectObject(mesh, false)
    expect(before.length).toBeGreaterThan(0)
    const geo = geometry as BufferGeometry & {
      computeBoundsTree: typeof computeBoundsTree
      disposeBoundsTree: typeof disposeBoundsTree
    }
    geo.computeBoundsTree = computeBoundsTree
    geo.disposeBoundsTree = disposeBoundsTree
    mesh.raycast = acceleratedRaycast
    geo.computeBoundsTree()
    const after = raycaster.intersectObject(mesh, false)
    expect(after.length).toBeGreaterThan(0)
    expect(after[0]!.point.distanceTo(before[0]!.point)).toBeLessThan(1e-3)
    geo.disposeBoundsTree()
    geometry.dispose()
    material.dispose()
  })
})

describe('懒包不进首屏', () => {
  const eager = [
    '../../main.tsx',
    '../../App.tsx',
    '../../components/Scene.tsx',
    '../../components/Stage.tsx',
    '../../components/scene/Tower.tsx',
    '../../components/scene/Site.tsx',
    '../../components/scene/B1.tsx',
    '../../scene/stage/FloorStage.tsx',
    '../../scene/stage/prefetchLazyChunks.ts',
    '../../components/scene/postfx/balancedFx.tsx',
    '../../scene/fog.ts',
    '../../scene/stage/cameraTransition.ts',
  ]

  it('drei 10.7.9 的 Bvh 自己卸树，调用处不自己卸', () => {
    const pick = read('PickBvh.tsx')
    const drei = readFileSync(join(here, '../../../node_modules/@react-three/drei/core/Bvh.js'), 'utf8')
    expect(pick).toMatch(/@react-three\/drei\/core\/Bvh/)
    expect(pick).toMatch(/firstHitOnly/)
    expect(pick).not.toMatch(/disposeBoundsTree|computeBoundsTree|acceleratedRaycast/)
    expect(pick).not.toMatch(/from ['"]three-mesh-bvh['"]/)
    expect(drei).toMatch(/disposeBoundsTree/)
    expect(drei).toMatch(/firstHitOnly/)
    const viteConfig = readFileSync(join(here, '../../../vite.config.ts'), 'utf8')
    const batchedStub = read('bvhBatchedMeshStub.ts')
    expect(viteConfig).toMatch(/redirectBvhThreeLeaves/)
    expect(viteConfig).toMatch(/three\/src\/math\/Ray\.js/)
    expect(viteConfig).toMatch(/three\/src\/math\/Triangle\.js/)
    expect(batchedStub).toMatch(/class BatchedMesh extends Mesh/)
    expect(batchedStub).not.toMatch(/import\s*\{[^}]*\bBatchedMesh\b/)
    expect(USER_CAMERA_SMOOTH_TIME).toBe(0.42)
  })

  it('DemandLoop 和室内、框选都是过了门再动态 import', () => {
    const loop = read('../../components/scene/DemandLoop.tsx')
    const surface = read('MeasureSurface.tsx')
    const box = read('BoxPickBvh.tsx')
    const tool = read('../../measure/MeasureTool.tsx')
    const desks = read('../stage/DeskBoxSelect.tsx')
    expect(loop).toMatch(/import\('\.\.\/\.\.\/scene\/pick\/PickBvhHost'\)/)
    expect(loop).toMatch(/PICK_BVH_AFTER_FIRST_MS/)
    expect(loop).not.toMatch(/from ['"]@react-three\/drei\/core\/Bvh['"]/)
    expect(loop).not.toMatch(/from ['"][^'"]*\/PickBvh['"]/)
    expect(surface).toMatch(/import\('\.\/PickBvh'\)/)
    expect(surface).not.toMatch(/from ['"]@react-three\/drei/)
    expect(box).toMatch(/import\('\.\/PickBvh'\)/)
    expect(box).not.toMatch(/from ['"]@react-three\/drei/)
    expect(tool).toMatch(/setMeasurePickActive/)
    expect(desks).toMatch(/BoxPickBvh/)
    expect(desks).toMatch(/mesh\.raycast = ignoreRaycast/)
    for (const file of ['../../floors/JsonFloorInterior.tsx', '../stage/B1Interior.tsx', '../stage/TowerInterior.tsx']) {
      expect(read(file)).toMatch(/MeasureSurface/)
    }
    for (const file of eager) {
      expect(read(file)).not.toMatch(/scene\/pick\/|three-mesh-bvh|core\/Bvh/)
    }
    expect(read('../../scene/fog.ts')).not.toMatch(/Bvh|three-mesh-bvh/)
    expect(read('../../components/scene/postfx/balancedFx.tsx')).not.toMatch(/Bvh|three-mesh-bvh/)
    const pkg = JSON.parse(read('../../../package.json')) as {
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
    }
    expect(pkg.dependencies['@react-three/drei']).toBe('10.7.9')
    expect(pkg.dependencies['three-mesh-bvh']).toBeUndefined()
    expect(pkg.devDependencies['three-mesh-bvh']).toBeUndefined()
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
  })
})
