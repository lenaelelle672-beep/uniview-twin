import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  BoxGeometry,
  BufferGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  Vector3,
  type Intersection,
} from 'three'
import { acceleratedRaycast, computeBoundsTree as buildBoundsTree, disposeBoundsTree } from 'three-mesh-bvh'
import {
  explodePickProbe,
  floorExplodeAnimating,
  releaseExplodeInstanceRay,
  resetExplodePickForTests,
  syncExplodeInstancePick,
  type ExplodePickFlags,
} from './explodePick'

const here = dirname(fileURLToPath(import.meta.url))

function read(path: string): string {
  return readFileSync(join(here, path), 'utf8')
}

function closest(hits: Intersection[]): Intersection | undefined {
  return hits.reduce<Intersection | undefined>((best, hit) => {
    if (!best || hit.distance < best.distance) return hit
    return best
  }, undefined)
}

function shoot(mesh: InstancedMesh, origin: Vector3, direction: Vector3, native = false): Intersection[] {
  const raycaster = new Raycaster(origin, direction.clone().normalize())
  const hits: Intersection[] = []
  if (native) InstancedMesh.prototype.raycast.call(mesh, raycaster, hits)
  else mesh.raycast(raycaster, hits)
  return hits
}

function place(mesh: InstancedMesh, index: number, x: number, y: number, z: number): void {
  mesh.setMatrixAt(index, new Matrix4().makeTranslation(x, y, z))
  mesh.instanceMatrix.needsUpdate = true
}

describe('炸开后的实例射线', () => {
  const geometries: BufferGeometry[] = []
  const materials: MeshBasicMaterial[] = []
  const meshes: InstancedMesh[] = []

  beforeEach(() => {
    resetExplodePickForTests()
  })

  afterEach(() => {
    for (const mesh of meshes) releaseExplodeInstanceRay(mesh)
    for (const geometry of geometries) {
      const geo = geometry as BufferGeometry & { disposeBoundsTree?: () => void }
      geo.disposeBoundsTree?.()
      geometry.dispose()
    }
    for (const material of materials) material.dispose()
    geometries.length = 0
    materials.length = 0
    meshes.length = 0
    resetExplodePickForTests()
  })

  function desks(): InstancedMesh {
    const geometry = new BoxGeometry(1, 1, 1)
    const material = new MeshBasicMaterial()
    const mesh = new InstancedMesh(geometry, material, 2)
    mesh.name = 'WorkstationDesks'
    place(mesh, 0, 0, 0, 0)
    place(mesh, 1, 6, 0, 0)
    mesh.computeBoundingSphere()
    mesh.updateMatrixWorld(true)
    geometries.push(geometry)
    materials.push(material)
    meshes.push(mesh)
    return mesh
  }

  function sceneFor(mesh: InstancedMesh, donor?: Mesh) {
    return {
      getObjectByName(name: string) {
        if (name === 'WorkstationDesks') return mesh
        return undefined
      },
      traverse(visit: (child: object) => void) {
        if (donor) visit(donor)
        visit(mesh)
      },
    }
  }

  function sync(mesh: InstancedMesh, flags: ExplodePickFlags, donor?: Mesh): void {
    syncExplodeInstancePick(sceneFor(mesh, donor), ['WorkstationDesks'], flags)
  }

  it('实例策略和原来的射线打中同一张工位', () => {
    const mesh = desks()
    const origin = new Vector3(6, 0, 4)
    const direction = new Vector3(0, 0, -1)
    const before = closest(shoot(mesh, origin, direction, true))
    sync(mesh, { refresh: false, allowBuild: false })
    const after = closest(shoot(mesh, origin, direction))
    expect(before).toBeTruthy()
    expect(after?.instanceId).toBe(1)
    expect(after?.object).toBe(mesh)
    expect(after?.point.distanceTo(before!.point)).toBeLessThan(1e-4)
    expect(after?.distance).toBeCloseTo(before!.distance, 4)
    const gap = shoot(mesh, new Vector3(3, 0, 4), direction)
    expect(gap).toHaveLength(0)
    expect(explodePickProbe()).toMatchObject({ armed: 1, built: 0 })
  })

  it('实例拉开后要重算包围球，父级平移不用重建 BVH', () => {
    const mesh = desks()
    sync(mesh, { refresh: false, allowBuild: false })
    const direction = new Vector3(0, 0, -1)
    place(mesh, 1, 30, 0, 0)
    expect(shoot(mesh, new Vector3(30, 0, 4), direction)).toHaveLength(0)
    sync(mesh, { refresh: true, allowBuild: false })
    const moved = closest(shoot(mesh, new Vector3(30, 0, 4), direction))
    const native = closest(shoot(mesh, new Vector3(30, 0, 4), direction, true))
    expect(moved?.instanceId).toBe(1)
    expect(moved?.point.x).toBeCloseTo(30, 4)
    expect(moved?.point.distanceTo(native!.point)).toBeLessThan(1e-4)
    expect(closest(shoot(mesh, new Vector3(0, 0, 4), direction))?.instanceId).toBe(0)

    const treeBefore = (mesh.geometry as { boundsTree?: object }).boundsTree
    mesh.position.y = 8
    mesh.updateMatrixWorld(true)
    const lifted = closest(shoot(mesh, new Vector3(30, 8, 4), direction))
    expect(lifted?.instanceId).toBe(1)
    expect(lifted?.point.y).toBeCloseTo((native?.point.y ?? 0) + 8, 3)
    expect((mesh.geometry as { boundsTree?: object }).boundsTree).toBe(treeBefore)
    expect(explodePickProbe().built).toBe(0)
  })

  it('动画期不建树，落定后同一份局部树可以跟着实例走', () => {
    const mesh = desks()
    const donorGeometry = new BoxGeometry(1, 1, 1)
    const donorMaterial = new MeshBasicMaterial()
    const donor = new Mesh(donorGeometry, donorMaterial)
    geometries.push(donorGeometry)
    materials.push(donorMaterial)
    let builds = 0
    const geo = donorGeometry as BufferGeometry & {
      computeBoundsTree?: (options?: object) => unknown
      disposeBoundsTree?: () => void
    }
    geo.computeBoundsTree = function wrappedBuild(this: BufferGeometry, options?: object) {
      builds += 1
      return buildBoundsTree.call(this, options)
    }
    geo.disposeBoundsTree = disposeBoundsTree

    for (let frame = 0; frame < 5; frame += 1) sync(mesh, { refresh: true, allowBuild: false }, donor)
    expect(builds).toBe(0)
    expect((mesh.geometry as { boundsTree?: unknown }).boundsTree).toBeUndefined()
    expect(explodePickProbe()).toMatchObject({ built: 0, animating: true })

    sync(mesh, { refresh: true, allowBuild: true }, donor)
    const tree = (mesh.geometry as { boundsTree?: object }).boundsTree
    expect(builds).toBe(1)
    expect(tree).toBeTruthy()
    expect(explodePickProbe().built).toBe(1)

    place(mesh, 1, 12, 0, 0)
    sync(mesh, { refresh: true, allowBuild: true }, donor)
    sync(mesh, { refresh: false, allowBuild: false }, donor)
    expect(builds).toBe(1)
    expect((mesh.geometry as { boundsTree?: object }).boundsTree).toBe(tree)

    const direction = new Vector3(0, 0, -1)
    const hit = closest(shoot(mesh, new Vector3(12, 0, 4), direction))
    const native = closest(shoot(mesh, new Vector3(12, 0, 4), direction, true))
    expect(hit?.instanceId).toBe(1)
    expect(hit?.point.distanceTo(native!.point)).toBeLessThan(1e-3)
    expect(explodePickProbe().built).toBe(1)
  })

  it('具名外壳没有建树函数时，从已经装过的网格借，树还没挂上时不借', () => {
    const mesh = desks()
    const donorGeometry = new BoxGeometry(1, 1, 1)
    const donorMaterial = new MeshBasicMaterial()
    const donor = new Mesh(donorGeometry, donorMaterial)
    const curtainGeometry = new BoxGeometry(1, 1, 1)
    const curtain = new Mesh(curtainGeometry, donorMaterial)
    curtain.name = 'FloorCurtain-F1'
    geometries.push(donorGeometry, curtainGeometry)
    materials.push(donorMaterial)
    let builds = 0
    const geo = donorGeometry as BufferGeometry & { computeBoundsTree?: (options?: object) => unknown }
    geo.computeBoundsTree = function wrappedBuild(this: BufferGeometry, options?: object) {
      builds += 1
      return buildBoundsTree.call(this, options)
    }
    const scene = {
      getObjectByName(name: string) {
        if (name === 'WorkstationDesks') return mesh
        if (name === 'FloorCurtain-F1') return curtain
        return undefined
      },
      traverse(visit: (child: object) => void) {
        visit(curtain)
        visit(donor)
        visit(mesh)
      },
    }
    const previous = (globalThis as { window?: unknown }).window
    const install = (trees: number) => {
      ;(globalThis as { window?: unknown }).window = { __twinPickBvh: { trees } }
    }
    try {
      install(0)
      sync(mesh, { refresh: false, allowBuild: true })
      expect(builds).toBe(0)
      resetExplodePickForTests()
      install(1)
      syncExplodeInstancePick(scene, ['WorkstationDesks'], { refresh: false, allowBuild: true })
      expect(builds).toBe(1)
      expect(explodePickProbe().built).toBe(1)
    } finally {
      if (previous === undefined) delete (globalThis as { window?: unknown }).window
      else (globalThis as { window?: unknown }).window = previous
    }
  })
})

describe('楼层外壳的局部 BVH', () => {
  it('层间拉开之后命中跟着世界矩阵走，树还是原来那一棵', () => {
    const geometry = new BoxGeometry(2, 1, 2)
    const geo = geometry as BufferGeometry & {
      computeBoundsTree: typeof buildBoundsTree
      disposeBoundsTree: typeof disposeBoundsTree
      boundsTree?: object
    }
    geo.computeBoundsTree = buildBoundsTree
    geo.disposeBoundsTree = disposeBoundsTree
    geo.computeBoundsTree({ verbose: false, setBoundingBox: false })
    const tree = geo.boundsTree
    const material = new MeshBasicMaterial()
    const mesh = new Mesh(geometry, material)
    mesh.name = 'FloorCurtain-F1'
    mesh.raycast = acceleratedRaycast
    mesh.updateMatrixWorld(true)
    const raycaster = new Raycaster(new Vector3(0, 14, 0), new Vector3(0, -1, 0))
    const before = raycaster.intersectObject(mesh, false)
    mesh.position.y = 8
    mesh.updateMatrixWorld(true)
    const after = raycaster.intersectObject(mesh, false)
    expect(before.length).toBeGreaterThan(0)
    expect(after[0]?.point.y).toBeCloseTo((before[0]?.point.y ?? 0) + 8, 4)
    expect(geo.boundsTree).toBe(tree)
    geo.disposeBoundsTree()
    geometry.dispose()
    material.dispose()
  })
})

describe('门和依赖', () => {
  it('楼层进度没落定就不许建树', () => {
    expect(floorExplodeAnimating(undefined)).toBe(false)
    expect(floorExplodeAnimating({ progress: 0, exploded: false })).toBe(false)
    expect(floorExplodeAnimating({ progress: 1, exploded: true })).toBe(false)
    expect(floorExplodeAnimating({ progress: 0.35, exploded: false })).toBe(true)
    expect(floorExplodeAnimating({ progress: 1, exploded: false })).toBe(true)
  })

  it('不新增依赖，建树不进首屏入口', () => {
    const pick = read('explodePick.ts')
    const drive = read('../../station-explode/drive.ts')
    const pkg = JSON.parse(read('../../../package.json')) as {
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
    }
    expect(pick).not.toMatch(/from ['"]three['"]|from ['"]three-mesh-bvh['"]/)
    expect(pick).not.toMatch(/\.refit\s*\(/)
    expect(drive).toMatch(/syncExplodeInstancePick/)
    expect(drive).not.toMatch(/from ['"]three['"]|three-mesh-bvh/)
    expect(pkg.dependencies['three-mesh-bvh']).toBeUndefined()
    expect(pkg.devDependencies['three-mesh-bvh']).toBeUndefined()
    for (const file of [
      '../../components/Scene.tsx',
      '../../components/scene/DemandLoop.tsx',
      '../../components/scene/ExplodedLayout.tsx',
      '../../components/Stage.tsx',
      '../explode.ts',
    ]) {
      expect(read(file), file).not.toMatch(/explodePick/)
    }
  })
})
