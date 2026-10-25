import { describe, expect, it } from 'vitest'
import { Mesh, MeshBasicMaterial, PerspectiveCamera, LOD } from 'three'
import { LOD_SKIP_NO_LO, TREE_LOD_DISTANCES, TREE_LOD_HYSTERESIS, treeLodEnabled, treeLodLevel } from './treeLodPlan'

describe('行道树 Detailed 距离', () => {
  it('与走廊 [0, 80] 对齐，远档带回程滞回', () => {
    expect(TREE_LOD_DISTANCES).toEqual([0, 80])
    expect(TREE_LOD_HYSTERESIS).toBe(0.1)
    expect(treeLodLevel(79, 0)).toBe(0)
    expect(treeLodLevel(80, 0)).toBe(1)
    expect(treeLodLevel(75, 1)).toBe(1)
    expect(treeLodLevel(72, 1)).toBe(1)
    expect(treeLodLevel(71.9, 1)).toBe(0)
  })

  it('性能档和白模不挂，均衡和高画质挂', () => {
    expect(treeLodEnabled('perf', 'lit')).toBe(false)
    expect(treeLodEnabled('balanced', 'model')).toBe(false)
    expect(treeLodEnabled('high', 'model')).toBe(false)
    expect(treeLodEnabled('balanced', 'lit')).toBe(true)
    expect(treeLodEnabled('high', 'lit')).toBe(true)
  })

  it('没有 lo 的灯和屋面字不进 Detailed', () => {
    expect(LOD_SKIP_NO_LO).toContain('/models/street-lamp.glb')
    expect(LOD_SKIP_NO_LO).toContain('/models/roof-sign.glb')
  })

  it('three LOD 的两档阈值与 treeLodLevel 一致', () => {
    const lod = new LOD()
    const hi = new Mesh(undefined, new MeshBasicMaterial())
    const lo = new Mesh(undefined, new MeshBasicMaterial())
    lod.addLevel(hi, TREE_LOD_DISTANCES[0], TREE_LOD_HYSTERESIS)
    lod.addLevel(lo, TREE_LOD_DISTANCES[1], TREE_LOD_HYSTERESIS)
    // 两个子节点默认都可见时，第一帧会按滞回阈值（72）而不是 80 判断。
    // 挂载时先把远档藏起来，第一帧才和「当前是近档」一致。
    lo.visible = false
    const camera = new PerspectiveCamera()
    camera.zoom = 1
    const place = (distance: number) => {
      camera.position.set(0, 0, distance)
      camera.updateMatrixWorld(true)
      lod.updateMatrixWorld(true)
      lod.update(camera)
    }
    place(79)
    expect(lod.getCurrentLevel()).toBe(0)
    expect(hi.visible).toBe(true)
    expect(lo.visible).toBe(false)
    place(80)
    expect(lod.getCurrentLevel()).toBe(1)
    expect(hi.visible).toBe(false)
    expect(lo.visible).toBe(true)
    place(75)
    expect(lod.getCurrentLevel()).toBe(1)
    place(72)
    expect(lod.getCurrentLevel()).toBe(1)
    place(71.9)
    expect(lod.getCurrentLevel()).toBe(0)
    expect(hi.visible).toBe(true)
    expect(lo.visible).toBe(false)
  })
})
