import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BatchedMesh, BoxGeometry, BufferGeometry, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Vector3 } from 'three'
import { computeBoundsTree as buildBoundsTree } from 'three-mesh-bvh'
import { resetExplodeMotion, resetStationExplodeMotion } from '../scene/explode'
import { explodePickProbe, resetExplodePickForTests, syncExplodeInstancePick } from '../scene/pick/explodePick'
import { STATION_EXPLODE_GAP_M, negativeScale } from '../scene/stationExplode'
import { createStationDrive, driveStation, type StationNode } from './drive'

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

const hint = globalThis as { __ea?: number; __es?: boolean }

/** 三排工位，沿 z 分层。中排不动，前后排各拉开一个层距。 */
const ROWS_Z = [0, 2.2, 4.4]
const CHAIR_DZ = 0.6

function deskMesh(): InstancedMesh {
  const mesh = new InstancedMesh(new BoxGeometry(1.2, 0.05, 0.6), new MeshBasicMaterial(), ROWS_Z.length)
  mesh.name = 'WorkstationDesks'
  ROWS_Z.forEach((z, index) => mesh.setMatrixAt(index, new Matrix4().makeTranslation(index * 2, 0, z)))
  mesh.computeBoundingSphere()
  return mesh
}

interface Chairs {
  mesh: BatchedMesh
  rows: number[]
  mirrored: number
  doomed: number
}

/** 真 BatchedMesh。每排一把椅子，再加一把镜像缩放的、一把稍后删掉的。 */
function chairMesh(): Chairs {
  const mesh = new BatchedMesh(8, 64, 128, new MeshBasicMaterial())
  mesh.name = 'WorkstationChairs'
  const geometryId = mesh.addGeometry(new BoxGeometry(0.5, 0.9, 0.5))
  const rows = ROWS_Z.map((z, index) => {
    const id = mesh.addInstance(geometryId)
    mesh.setMatrixAt(id, new Matrix4().makeRotationY(0.3).setPosition(index * 2, 0.45, z + CHAIR_DZ))
    return id
  })
  const mirrored = mesh.addInstance(geometryId)
  mesh.setMatrixAt(mirrored, new Matrix4().makeScale(-1, 1, 1).setPosition(6, 0.45, ROWS_Z[0] + CHAIR_DZ))
  const doomed = mesh.addInstance(geometryId)
  mesh.setMatrixAt(doomed, new Matrix4().makeTranslation(8, 0.45, ROWS_Z[2] + CHAIR_DZ))
  mesh.computeBoundingSphere()
  return { mesh, rows, mirrored, doomed }
}

function sceneOf(...nodes: Array<{ name: string }>): StationNode {
  return {
    getObjectByName(name: string) {
      return nodes.find((node) => node.name === name) as StationNode | undefined
    },
  }
}

function at(mesh: { getMatrixAt: (index: number, target: Matrix4) => unknown }, index: number): Vector3 {
  const matrix = new Matrix4()
  mesh.getMatrixAt(index, matrix)
  return new Vector3().setFromMatrixPosition(matrix)
}

function matrixOf(mesh: BatchedMesh, id: number): number[] {
  const matrix = new Matrix4()
  mesh.getMatrixAt(id, matrix)
  return [...matrix.elements]
}

function matricesVersion(mesh: BatchedMesh): number {
  return (mesh as unknown as { _matricesTexture: { version: number } })._matricesTexture.version
}

/** 第 row 排全开时相对 rest 的 z 位移。 */
function fullShift(row: number): number {
  return (row - (ROWS_Z.length - 1) / 2) * STATION_EXPLODE_GAP_M
}

describe('BatchedMesh 跟工位爆炸', () => {
  beforeEach(() => {
    resetExplodeMotion()
    resetStationExplodeMotion()
    resetExplodePickForTests()
    hint.__es = true
  })

  afterEach(() => {
    delete hint.__ea
    delete hint.__es
    resetExplodeMotion()
    resetStationExplodeMotion()
    resetExplodePickForTests()
  })

  it('拖滑杆时 setMatrixAt 每档跟进度，删掉和镜像的槽不碰，边界球跟着拉开', () => {
    const desks = deskMesh()
    const chairs = chairMesh()
    const scene = sceneOf(desks, chairs.mesh)
    const drive = createStationDrive()
    const mirroredRest = matrixOf(chairs.mesh, chairs.mirrored)
    const restRotation = matrixOf(chairs.mesh, chairs.rows[0]).slice(0, 12)

    hint.__ea = 0.3
    const first = driveStation(drive, scene, true, 'floor', 1)
    expect(first).toMatchObject({ progress: 0.3, animating: false, active: true })
    expect(first.needsUpdate).toBe(2)
    chairs.rows.forEach((id, row) => {
      expect(at(chairs.mesh, id).z).toBeCloseTo(ROWS_Z[row] + CHAIR_DZ + fullShift(row) * 0.3, 5)
      expect(at(desks, row).z).toBeCloseTo(ROWS_Z[row] + fullShift(row) * 0.3, 5)
    })
    expect(matrixOf(chairs.mesh, chairs.mirrored)).toEqual(mirroredRest)
    expect(matrixOf(chairs.mesh, chairs.rows[0]).slice(0, 12)).toEqual(restRotation)

    chairs.mesh.deleteInstance(chairs.doomed)
    const before = matricesVersion(chairs.mesh)
    const sphere = chairs.mesh.boundingSphere!
    sphere.radius = 0
    hint.__ea = 0.6
    const second = driveStation(drive, scene, true, 'floor', 1.02)
    expect(second.progress).toBe(0.6)
    expect(second.needsUpdate).toBe(2)
    expect(matricesVersion(chairs.mesh)).toBeGreaterThan(before)
    chairs.rows.forEach((id, row) => {
      expect(at(chairs.mesh, id).z).toBeCloseTo(ROWS_Z[row] + CHAIR_DZ + fullShift(row) * 0.6, 5)
      expect(at(desks, row).z).toBeCloseTo(ROWS_Z[row] + fullShift(row) * 0.6, 5)
      expect(sphere.containsPoint(at(chairs.mesh, id))).toBe(true)
    })
    expect(matrixOf(chairs.mesh, chairs.mirrored)).toEqual(mirroredRest)
    expect(sphere.radius).toBeGreaterThan(Math.abs(fullShift(0)) * 0.6)

    const settled = matricesVersion(chairs.mesh)
    const held = driveStation(drive, scene, true, 'floor', 1.04)
    expect(held.needsUpdate).toBe(0)
    expect(matricesVersion(chairs.mesh)).toBe(settled)

    hint.__ea = 0
    const closed = driveStation(drive, scene, true, 'floor', 1.06)
    expect(closed.progress).toBe(0)
    chairs.rows.forEach((id, row) => {
      expect(at(chairs.mesh, id).z).toBeCloseTo(ROWS_Z[row] + CHAIR_DZ, 6)
    })
    expect(explodePickProbe().refreshed).toBe(6)
  })

  it('按钮走 0.8 秒时同样一批写完，落定后不再 setMatrixAt', () => {
    hint.__es = false
    const desks = deskMesh()
    const chairs = chairMesh()
    const scene = sceneOf(desks, chairs.mesh)
    const drive = createStationDrive()
    hint.__ea = 1
    driveStation(drive, scene, true, 'floor', 3)
    const mid = driveStation(drive, scene, true, 'floor', 3.3)
    expect(mid.animating).toBe(true)
    expect(at(chairs.mesh, chairs.rows[2]).z).toBeCloseTo(ROWS_Z[2] + CHAIR_DZ + fullShift(2) * mid.progress, 5)
    const done = driveStation(drive, scene, true, 'floor', 3.9)
    expect(done).toMatchObject({ progress: 1, animating: false })
    expect(at(chairs.mesh, chairs.rows[2]).z).toBeCloseTo(ROWS_Z[2] + CHAIR_DZ + fullShift(2), 5)
    const version = matricesVersion(chairs.mesh)
    driveStation(drive, scene, true, 'floor', 5)
    expect(matricesVersion(chairs.mesh)).toBe(version)
    const left = driveStation(drive, scene, true, 'building', 6)
    expect(left.progress).toBe(0)
    expect(at(chairs.mesh, chairs.rows[2]).z).toBeCloseTo(ROWS_Z[2] + CHAIR_DZ, 6)
  })

  it('镜像缩放按行列式判定', () => {
    expect(negativeScale({ elements: new Matrix4().makeScale(-1, 1, 1).elements })).toBe(true)
    expect(negativeScale({ elements: new Matrix4().makeScale(-1, -1, 1).elements })).toBe(false)
    expect(negativeScale({ elements: new Matrix4().makeRotationY(2.1).setPosition(3, 0, 1).elements })).toBe(false)
  })
})

describe('BatchedMesh 拾取', () => {
  const disposables: Array<BufferGeometry | MeshBasicMaterial> = []

  afterEach(() => {
    for (const item of disposables) item.dispose()
    disposables.length = 0
    resetExplodePickForTests()
  })

  it('落定只重算边界球，不在合批几何上建树，也不换射线', () => {
    resetExplodePickForTests()
    const chairs = chairMesh()
    const donorGeometry = new BoxGeometry(1, 1, 1)
    const donorMaterial = new MeshBasicMaterial()
    disposables.push(donorGeometry, donorMaterial)
    let builds = 0
    const donor = new Mesh(donorGeometry, donorMaterial)
    ;(donorGeometry as BufferGeometry & { computeBoundsTree?: (options?: object) => unknown }).computeBoundsTree =
      function wrappedBuild(this: BufferGeometry, options?: object) {
        builds += 1
        return buildBoundsTree.call(this, options)
      }
    const raycast = chairs.mesh.raycast
    chairs.mesh.setMatrixAt(chairs.rows[2], new Matrix4().makeTranslation(4, 0.45, 30))
    const scene = {
      getObjectByName: (name: string) => (name === 'WorkstationChairs' ? chairs.mesh : undefined),
      traverse: (visit: (child: object) => void) => {
        visit(donor)
        visit(chairs.mesh)
      },
    }
    syncExplodeInstancePick(scene, ['WorkstationChairs'], { refresh: true, allowBuild: true })
    expect(builds).toBe(0)
    expect((chairs.mesh.geometry as { boundsTree?: unknown }).boundsTree).toBeUndefined()
    expect(chairs.mesh.raycast).toBe(raycast)
    expect(chairs.mesh.boundingSphere!.containsPoint(new Vector3(4, 0.45, 30))).toBe(true)
    expect(explodePickProbe()).toMatchObject({ refreshed: 1, built: 0, armed: 0 })
  })
})

describe('分包与 demand', () => {
  it('不 import three，不自己要帧；只在动画期续帧', () => {
    const drive = read('./drive.ts')
    const mount = read('./mount.ts')
    const math = read('../scene/stationExplode.ts')
    const stub = read('../scene/pick/bvhBatchedMeshStub.ts')
    for (const source of [drive, math]) {
      expect(source).not.toMatch(/from ['"]three['"]|three-mesh-bvh|new BatchedMesh|invalidate|requestAnimationFrame/)
    }
    expect(mount).toMatch(/if \(stats\.animating\) askFrame\(state\.invalidate\)/)
    expect(stub).toMatch(/class BatchedMesh extends Mesh \{\}/)
  })
})
