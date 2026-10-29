import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BoxGeometry, DynamicDrawUsage, Group, InstancedMesh, Matrix4, MeshBasicMaterial } from 'three'
import {
  armRepeatedInstanceMatrices,
  askInstanceFrame,
  flushInstanceMatrices,
  resetInstanceMatrixMotion,
  setInstancePose,
  stepInstanceMesh,
} from './instanceMatrix'

afterEach(() => {
  resetInstanceMatrixMotion()
  vi.unstubAllGlobals()
})

describe('实例矩阵批更', () => {
  it('一批 setMatrixAt 之后只打一次 needsUpdate，并标成动态缓冲', () => {
    const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial(), 3)
    let writes = 0
    let flag = false
    Object.defineProperty(mesh.instanceMatrix, 'needsUpdate', {
      configurable: true,
      get: () => flag,
      set: (value: boolean) => {
        writes += 1
        flag = value
      },
    })
    flushInstanceMatrices(mesh, 3, (index, target) => {
      target.makeTranslation(index, 2, 0)
    })
    expect(mesh.instanceMatrix.usage).toBe(DynamicDrawUsage)
    expect(writes).toBe(1)
    expect(flag).toBe(true)
    const got = new Matrix4()
    mesh.getMatrixAt(2, got)
    expect(got.elements[12]).toBeCloseTo(2)
    expect(got.elements[13]).toBeCloseTo(2)
    mesh.geometry.dispose()
    mesh.dispose()
  })

  it('没有姿态时不写矩阵、不续帧', () => {
    const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial(), 1)
    const invalidate = vi.fn()
    expect(stepInstanceMesh(mesh, invalidate)).toBe(false)
    expect(invalidate).not.toHaveBeenCalled()
    expect(mesh.instanceMatrix.usage).not.toBe(DynamicDrawUsage)
    mesh.geometry.dispose()
    mesh.dispose()
  })

  it('demand 下用 rAF 再 invalidate，同一帧只排一次', () => {
    const queued: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      queued.push(cb)
      return queued.length
    })
    const invalidate = vi.fn()
    askInstanceFrame(invalidate)
    askInstanceFrame(invalidate)
    expect(queued).toHaveLength(1)
    expect(invalidate).not.toHaveBeenCalled()
    queued[0]?.(0)
    expect(invalidate).toHaveBeenCalledTimes(1)
  })

  it('有姿态时每帧批量写完再要下一帧', () => {
    const queued: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      queued.push(cb)
      return 1
    })
    const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial(), 2)
    mesh.name = 'WorkstationDesks'
    setInstancePose((name, index, target) => {
      if (name === 'WorkstationDesks') target.makeTranslation(0, index, 0)
    })
    const invalidate = vi.fn()
    expect(stepInstanceMesh(mesh, invalidate)).toBe(true)
    expect(mesh.instanceMatrix.usage).toBe(DynamicDrawUsage)
    const got = new Matrix4()
    mesh.getMatrixAt(1, got)
    expect(got.elements[13]).toBeCloseTo(1)
    expect(queued).toHaveLength(1)
    queued[0]?.(0)
    expect(invalidate).toHaveBeenCalledTimes(1)
    mesh.geometry.dispose()
    mesh.dispose()
  })

  it('源码把 needsUpdate 放在循环外，重复件标动态缓冲', () => {
    const batch = readFileSync(new URL('./instanceMatrix.ts', import.meta.url), 'utf8')
    const loop = batch.slice(batch.indexOf('for (let index'), batch.indexOf('commitInstanceMatrices(mesh, touchColor)'))
    expect(loop).not.toMatch(/needsUpdate/)
    expect(batch).toMatch(/setUsage\(DynamicDrawUsage\)/)
    expect(batch).toMatch(/requestAnimationFrame/)
    expect(batch).not.toMatch(/gsap|anime|@react-spring|from '@react-three\/drei'/)

    const props = readFileSync(new URL('../components/scene/InstancedProp.tsx', import.meta.url), 'utf8')
    const apply = props.slice(props.indexOf('function applyPlacements'), props.indexOf('export function InstancedProp'))
    const inside = apply.slice(apply.indexOf('forEach'), apply.lastIndexOf('needsUpdate'))
    expect(props).not.toMatch(/DynamicDrawUsage/)
    expect(apply).not.toMatch(/setUsage/)
    expect(inside).not.toMatch(/needsUpdate/)
    expect(apply.match(/instanceMatrix\.needsUpdate = true/g)).toHaveLength(1)

    const demand = readFileSync(new URL('../components/scene/DemandLoop.tsx', import.meta.url), 'utf8')
    expect(demand).toMatch(/armRepeatedInstanceMatrices/)
    expect(batch).toMatch(/const DynamicDrawUsage = 35048/)
    expect(batch).not.toMatch(/import \{[^}]*DynamicDrawUsage/)

    const stations = readFileSync(new URL('./stage/instancedSlots.tsx', import.meta.url), 'utf8')
    const stationLoop = stations.slice(stations.indexOf('slots.forEach'), stations.indexOf('mesh.count = slots.length'))
    expect(stationLoop).not.toMatch(/needsUpdate/)
    expect(stations).toMatch(/markInstanceMatrixDynamic/)
    expect(stations).toMatch(/stepInstanceMesh/)
    expect(stations).not.toMatch(/gsap|anime|@react-spring/)

    const interior = readFileSync(new URL('../floors/floorInteriorMesh.ts', import.meta.url), 'utf8')
    const write = interior.slice(interior.indexOf('function writeSlot'), interior.indexOf('function finishInstances'))
    expect(write).not.toMatch(/needsUpdate/)
    expect(interior).toMatch(/markInstanceMatrixDynamic/)
  })

  it('懒补丁把已摆好的树灯改成动态缓冲，之后 setMatrixAt 也先标用法', () => {
    const placed = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ name: 'tree_leaves' }), 1)
    placed.name = 'tree_leaves_shadow'
    const root = new Group()
    root.add(placed)
    const version = placed.instanceMatrix.version
    armRepeatedInstanceMatrices(root)
    expect(placed.instanceMatrix.usage).toBe(DynamicDrawUsage)
    expect(placed.instanceMatrix.version).toBe(version + 1)

    const lamp = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ name: 'lamp_body' }), 1)
    lamp.setMatrixAt(0, new Matrix4().makeTranslation(1, 0, 0))
    expect(lamp.instanceMatrix.usage).toBe(DynamicDrawUsage)
    placed.geometry.dispose()
    placed.dispose()
    lamp.geometry.dispose()
    lamp.dispose()
  })
})
