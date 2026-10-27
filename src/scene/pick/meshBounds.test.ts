import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  Bone,
  BoxGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  Scene,
  Skeleton,
  SkinnedMesh,
  Vector3,
  type Intersection,
} from 'three'
import { MESH_BOUNDS_SOURCE_BLOCK, builtMeshBoundsPair } from '../../../scripts/meshBoundsPlugin'
import { releaseCoarseMeshBounds, syncCoarseMeshBounds } from './meshBoundsApply'
import {
  coarseDecorKind,
  coarseMeshBoundsEnabled,
  meshBoundsFlagLockedOff,
} from './meshBoundsPolicy'

const here = dirname(fileURLToPath(import.meta.url))

function read(path: string): string {
  return readFileSync(join(here, path), 'utf8')
}

function ray(origin: [number, number, number], direction: [number, number, number]): Raycaster {
  return new Raycaster(new Vector3(...origin), new Vector3(...direction))
}

function hitsOf(mesh: Mesh, caster: Raycaster): Intersection[] {
  mesh.updateMatrixWorld(true)
  const hits: Intersection[] = []
  mesh.raycast(caster, hits)
  return hits
}

afterEach(() => {
  releaseCoarseMeshBounds()
})

describe('T078 开关', () => {
  it('均衡和高画质默认关，性能档开，地址参数可以反过来', () => {
    expect(coarseMeshBoundsEnabled('balanced', '')).toBe(false)
    expect(coarseMeshBoundsEnabled('high', '?q=high')).toBe(false)
    expect(coarseMeshBoundsEnabled('perf', '?q=perf')).toBe(true)
    expect(coarseMeshBoundsEnabled('perf', '?q=perf&meshBounds=0')).toBe(false)
    expect(coarseMeshBoundsEnabled('balanced', '?meshBounds=1')).toBe(true)
    expect(coarseMeshBoundsEnabled('balanced', '?q=balanced', 'http://localhost/?meshBounds=1')).toBe(true)
    expect(coarseMeshBoundsEnabled('perf', '?q=perf', 'http://localhost/?q=perf&meshBounds=0')).toBe(false)
    expect(meshBoundsFlagLockedOff('?meshBounds=0', '')).toBe(true)
    expect(meshBoundsFlagLockedOff('?q=perf', 'http://localhost/?meshBounds=0')).toBe(true)
    expect(meshBoundsFlagLockedOff('?meshBounds=1', 'http://localhost/?meshBounds=0')).toBe(false)
  })
})

describe('T078 只给远距装饰密模换粗拾取', () => {
  function scene() {
    const root = new Scene()
    const grille = new Group()
    grille.name = 'EastGrille'
    const grilleMesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial({ name: 'east_grille' }))
    grilleMesh.name = 'grille-leaf'
    grille.add(grilleMesh)
    const trees = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial({ name: 'tree_leaves' }), 2)
    trees.setMatrixAt(0, new Matrix4().makeTranslation(0, 0, 0))
    trees.setMatrixAt(1, new Matrix4().makeTranslation(10, 0, 0))
    const trunk = new Mesh(new BoxGeometry(), new MeshBasicMaterial({ name: 'tree_trunk' }))
    const shadow = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial({ name: 'tree_leaves' }), 1)
    shadow.name = 'tree_leaves_shadow'
    const lamp = new Mesh(new BoxGeometry(), new MeshBasicMaterial({ name: 'lamp_light' }))
    const sign = new Mesh(new BoxGeometry(), new MeshBasicMaterial({ name: 'sign_face' }))
    const people = new Group()
    people.name = 'CorridorPeople'
    const bone = new Bone()
    const skin = new SkinnedMesh(new BoxGeometry(0.2, 0.2, 0.2), new MeshBasicMaterial())
    skin.name = 'walker'
    skin.add(bone)
    skin.bind(new Skeleton([bone]))
    people.add(skin)
    const park = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
    park.name = 'Park'
    const curtain = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
    curtain.name = 'FloorCurtain-F1'
    const desk = new Mesh(new BoxGeometry(), new MeshBasicMaterial({ name: 'tree_leaves' }))
    desk.name = 'WorkstationDesks'
    const bvh = new Group()
    bvh.name = 'PickBvh:enter-shells'
    const shell = new Mesh(new BoxGeometry(), new MeshBasicMaterial({ name: 'tree_trunk' }))
    bvh.add(shell)
    const custom = new Mesh(new BoxGeometry(), new MeshBasicMaterial({ name: 'lamp_body' }))
    custom.raycast = () => {}
    root.add(grille, trees, trunk, shadow, lamp, sign, people, park, curtain, desk, bvh, custom)
    return { root, grilleMesh, trees, trunk, shadow, lamp, sign, skin, park, curtain, desk, shell, custom }
  }

  it('格栅、树、灯、屋面字和人物算粗拾取，精确网格和已改过的 raycast 不算', () => {
    const built = scene()
    expect(coarseDecorKind(built.grilleMesh)).toBe('grille')
    expect(coarseDecorKind(built.trees)).toBe('tree')
    expect(coarseDecorKind(built.trunk)).toBe('tree')
    expect(coarseDecorKind(built.shadow)).toBeNull()
    expect(coarseDecorKind(built.lamp)).toBe('lamp')
    expect(coarseDecorKind(built.sign)).toBe('sign')
    expect(coarseDecorKind(built.skin)).toBe('person')
    expect(coarseDecorKind(built.park)).toBeNull()
    expect(coarseDecorKind(built.curtain)).toBeNull()
    expect(coarseDecorKind(built.desk)).toBeNull()
    expect(coarseDecorKind(built.shell)).toBeNull()
    expect(coarseDecorKind(built.custom)).toBeNull()
  })

  it('套上之后只改装饰网格，卸下后射线回到原来的函数', () => {
    const built = scene()
    const treeRay = built.trees.raycast
    const parkRay = built.park.raycast
    const probe = syncCoarseMeshBounds(built.root, 'perf')
    expect(probe.on).toBe(true)
    expect(probe.reason).toBe('perf')
    expect(probe.kinds).toMatchObject({ grille: 1, tree: 2, lamp: 1, sign: 1, person: 1 })
    expect(probe.names).toEqual([
      'grille:grille-leaf',
      'lamp:lamp_light',
      'person:walker',
      'sign:sign_face',
      'tree:tree_leaves',
      'tree:tree_trunk',
    ])
    expect(built.trees.raycast).not.toBe(treeRay)
    expect(built.park.raycast).toBe(parkRay)
    expect(built.curtain.raycast).toBe(Mesh.prototype.raycast)
    expect(built.custom.raycast).not.toBe(built.lamp.raycast)
    releaseCoarseMeshBounds()
    expect(built.trees.raycast).toBe(treeRay)
    expect(built.grilleMesh.raycast).toBe(Mesh.prototype.raycast)
    expect(coarseDecorKind(built.grilleMesh)).toBe('grille')
  })
})

describe('T078 meshBounds 是包围盒，不是三角', () => {
  it('打穿包围盒但没打中三角时仍算命中，并把点变回世界坐标', () => {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3))
    geometry.setIndex([0, 1, 2])
    const mesh = new Mesh(geometry, new MeshBasicMaterial())
    const group = new Group()
    group.name = 'EastGrille'
    group.add(mesh)
    mesh.position.set(10, 0, 0)
    const scene = new Scene()
    scene.add(group)
    syncCoarseMeshBounds(scene, 'perf')
    const caster = ray([10.9, 0.9, 2], [0, 0, -1])
    const coarse = hitsOf(mesh, caster)
    const precise: Intersection[] = []
    Mesh.prototype.raycast.call(mesh, caster, precise)
    expect(precise).toHaveLength(0)
    expect(coarse).toHaveLength(1)
    expect(coarse[0]?.point.x).toBeCloseTo(10.9, 4)
    expect(coarse[0]?.point.z).toBeCloseTo(0, 4)
    expect(coarse[0]?.distance).toBeCloseTo(2, 4)
    expect(coarse[0]?.object).toBe(mesh)
  })

  it('实例只按各自的包围盒命中，并带上 instanceId', () => {
    const trees = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ name: 'tree_leaves' }), 2)
    trees.setMatrixAt(0, new Matrix4().makeTranslation(0, 0, 0))
    trees.setMatrixAt(1, new Matrix4().makeTranslation(10, 0, 0))
    const scene = new Scene()
    scene.add(trees)
    syncCoarseMeshBounds(scene, 'flag')
    const hitFar = hitsOf(trees, ray([10, 0, 4], [0, 0, -1]))
    const hitGap = hitsOf(trees, ray([5, 0, 4], [0, 0, -1]))
    expect(hitFar).toHaveLength(1)
    expect(hitFar[0]?.instanceId).toBe(1)
    expect(hitFar[0]?.point.x).toBeCloseTo(10, 4)
    expect(hitFar[0]?.object).toBe(trees)
    expect(hitGap).toHaveLength(0)
  })

  it('蒙皮骨骼挪开后重算包围盒，射线跟着新的盒子走', () => {
    const bone = new Bone()
    const skin = new SkinnedMesh(new BoxGeometry(0.2, 0.2, 0.2), new MeshBasicMaterial())
    skin.add(bone)
    skin.bind(new Skeleton([bone]))
    const people = new Group()
    people.name = 'CorridorPeople'
    people.add(skin)
    const scene = new Scene()
    scene.add(people)
    syncCoarseMeshBounds(scene, 'flag')
    expect(hitsOf(skin, ray([2, 0, 2], [0, 0, -1]))).toHaveLength(0)
    bone.position.set(3, 0, 0)
    skin.updateMatrixWorld(true)
    const hits = hitsOf(skin, ray([2, 0, 2], [0, 0, -1]))
    expect(hits).toHaveLength(1)
    expect(hits[0]?.object).toBe(skin)
  })

  it('形变权重拉开顶点后包围盒跟着变，共享几何上的绑定盒还在', () => {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3))
    geometry.morphAttributes.position = [new Float32BufferAttribute([3, 0, 0, 0, 0, 0, 0, 0, 0], 3)]
    const mesh = new Mesh(geometry, new MeshBasicMaterial())
    mesh.morphTargetInfluences = [0]
    geometry.morphTargetsRelative = true
    const group = new Group()
    group.name = 'EastGrille'
    group.add(mesh)
    const scene = new Scene()
    scene.add(group)
    syncCoarseMeshBounds(scene, 'flag')
    expect(hitsOf(mesh, ray([2, 0, 2], [0, 0, -1]))).toHaveLength(0)
    const savedBox = geometry.boundingBox
    mesh.morphTargetInfluences[0] = 1
    const hits = hitsOf(mesh, ray([2, 0, 2], [0, 0, -1]))
    expect(hits).toHaveLength(1)
    expect(geometry.boundingBox).toBe(savedBox)
  })
})

describe('T078 不进首屏图，也不动已合划界', () => {
  it('DemandLoop 只动态 import，生产插件在哈希前摘掉', () => {
    const loop = read('../../components/scene/DemandLoop.tsx')
    const config = read('../../../vite.config.ts')
    expect(loop).toContain(MESH_BOUNDS_SOURCE_BLOCK)
    expect(loop).not.toMatch(/from ['"][^'"]*meshBounds/)
    expect(loop).not.toMatch(/@react-three\/drei\/core\/meshBounds/)
    expect(config).toMatch(/meshBoundsAfterHash\(\)/)
    expect(read('./PickBvh.tsx')).not.toMatch(/meshBounds/)
    expect(read('../../components/scene/EastGrille.tsx')).not.toMatch(/meshBounds/)
    expect(read('../../components/scene/Site.tsx')).not.toMatch(/meshBounds/)
    expect(read('../../floors/floorInteriorMesh.ts')).not.toMatch(/meshBounds/)
    expect(read('../stage/CorridorPeople.tsx')).not.toMatch(/meshBounds/)
    expect(read('./meshBoundsApply.ts')).toMatch(/@react-three\/drei\/core\/meshBounds/)
    expect(read('./meshBoundsApply.ts')).toMatch(/meshBounds\.call/)
    expect(read('./meshBoundsApply.ts')).not.toMatch(/from '@react-three\/drei'/)
  })

  it('不升依赖，不改雾和 T032', () => {
    const pkg = JSON.parse(read('../../../package.json')) as {
      dependencies: Record<string, string>
    }
    expect(pkg.dependencies['@react-three/drei']).toBe('10.7.9')
    expect(pkg.dependencies.three).toBe('0.186.1')
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
    expect(read('../stage/cameraTransition.ts')).toMatch(/USER_CAMERA_SMOOTH_TIME = 0\.42/)
    expect(read('../fog.ts')).toMatch(/FogExp2/)
    expect(read('./meshBoundsApply.ts')).not.toMatch(/FogExp2|hls|VideoTexture|balancedFx/)
  })

  it('独立分包含 meshBounds，门闩不含包围盒计算', async () => {
    const built = await builtMeshBoundsPair()
    expect(built.boot).toContain('./MeshBounds.js')
    expect(built.boot).not.toContain('computeBoundingBox')
    expect(built.apply).toContain('mountCoarseMeshBounds')
    expect(built.apply.length).toBeLessThan(80_000)
    expect(built.apply).not.toMatch(/hls|FogExp2|VideoTexture|balancedFx|three-mesh-bvh/)
    const dir = mkdtempSync(join(tmpdir(), 'meshbounds-'))
    const file = join(dir, 'MeshBounds.mjs')
    writeFileSync(file, built.apply)
    const loaded = (await import(pathToFileURL(file).href)) as {
      loadCoarseMeshBounds: () => Promise<typeof import('./meshBoundsApply')>
    }
    const apply = await loaded.loadCoarseMeshBounds()
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial())
    mesh.position.set(10, 0, 0)
    const group = new Group()
    group.name = 'EastGrille'
    group.add(mesh)
    const scene = new Scene()
    scene.add(group)
    apply.syncCoarseMeshBounds(scene, 'perf')
    const hit = hitsOf(mesh, ray([10, 0, 4], [0, 0, -1]))
    expect(hit).toHaveLength(1)
    expect(hit[0]?.point.x).toBeCloseTo(10, 4)
    apply.releaseCoarseMeshBounds()
  })
})
