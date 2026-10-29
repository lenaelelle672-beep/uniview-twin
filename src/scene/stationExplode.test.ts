import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { EXPLODE_DURATION_S, explodeProgress, resetExplodeMotion, resetStationExplodeMotion, stepExplodeMotion, stepStationExplodeMotion } from './explode'
import {
  STATION_DYNAMIC_DRAW,
  STATION_EXPLODE_GAP_M,
  applyMemberProgress,
  applyStationProgress,
  bakeStationPairs,
  levelFrame,
  matrixHandle,
  matrixWithTranslation,
  stationDelta,
  stationTick,
  type InstanceSink,
  type Mat4,
} from './stationExplode'
import { STATION_EXPLODE_SOURCE_BLOCK } from '../../scripts/stationExplodePlugin'
import { createStationDrive, driveStation, type StationNode } from '../station-explode/drive'

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

function identityAt(x: number, y: number, z: number, rotY = 0): Mat4 {
  return matrixWithTranslation(x, y, z, rotY)
}

function sinkFrom(matrices: Mat4[]): InstanceSink & {
  needs: number
  array: number[]
  instanceMatrix: { array: number[]; needsUpdate: boolean; usage: number; setUsage: (usage: number) => void }
} {
  const array = new Array<number>(matrices.length * 16).fill(0)
  matrices.forEach((matrix, index) => {
    matrix.elements.forEach((value, element) => {
      array[index * 16 + element] = value
    })
  })
  const bag = {
    needs: 0,
    array,
    count: matrices.length,
    instanceMatrix: {
      array,
      set needsUpdate(value: boolean) {
        if (value) bag.needs += 1
      },
      get needsUpdate() {
        return false
      },
      usage: 0,
      setUsage(usage: number) {
        bag.instanceMatrix.usage = usage
      },
    },
    setMatrixAt(index: number, matrix: { toArray: (target: { [index: number]: number }, offset?: number) => void }) {
      matrix.toArray(array, index * 16)
    },
  }
  return bag
}

function translation(array: number[], index: number): { x: number; z: number } {
  return { x: array[index * 16 + 12], z: array[index * 16 + 14] }
}

describe('工位层', () => {
  it('按带聚层，相邻层全开时正好拉开间距，同层一起动', () => {
    const rests = [identityAt(0, 0, 0), identityAt(2, 0, 0), identityAt(0, 0, 2.2), identityAt(2, 0, 2.2)]
    const baked = bakeStationPairs(rests)
    expect(baked.frame.axis).toBe('z')
    expect(baked.frame.radial).toBe(false)
    const shifts = baked.pairs.map((pair) => pair.explode.elements[14] - pair.rest.elements[14])
    expect(shifts[0]).toBeCloseTo(shifts[1] ?? 0, 5)
    expect(shifts[2]).toBeCloseTo(shifts[3] ?? 0, 5)
    expect((shifts[2] ?? 0) - (shifts[0] ?? 0)).toBeCloseTo(STATION_EXPLODE_GAP_M, 5)
    expect(baked.pairs[0]?.explode.elements[12]).toBe(0)
    expect(baked.pairs[0]?.explode.elements[0]).toBe(rests[0]?.elements[0])
  })

  it('层数相同时走跨度更大的轴', () => {
    const wide = [identityAt(-8, 0, 0), identityAt(8, 0, 0.2)]
    const baked = bakeStationPairs(wide)
    expect(baked.frame.axis).toBe('x')
    const moved = (baked.pairs[1]?.explode.elements[12] ?? 0) - (baked.pairs[0]?.explode.elements[12] ?? 0)
    const rested = (wide[1]?.elements[12] ?? 0) - (wide[0]?.elements[12] ?? 0)
    expect(moved - rested).toBeCloseTo(STATION_EXPLODE_GAP_M, 5)
  })

  it('只有一层时沿质心径向拉开，旋转列不动', () => {
    const rests = [identityAt(0, 0.2, 0, 0.4), identityAt(0.2, 0.2, 0.1, 0.4)]
    const baked = bakeStationPairs(rests)
    expect(baked.frame.radial).toBe(true)
    const delta = stationDelta(baked.frame, 0, 0)
    expect(Math.hypot(delta.x, delta.z)).toBeGreaterThan(0)
    expect(baked.pairs[0]?.explode.elements[0]).toBeCloseTo(rests[0]?.elements[0] ?? 0, 5)
    expect(baked.pairs[0]?.explode.elements[13]).toBeCloseTo(0.2, 5)
  })

  it('徽标用工位的同一套层，进度 0 和 1 精确落在 rest / explode', () => {
    const desks = [identityAt(1, 0, 0), identityAt(1, 0, 2.2)]
    const frame = levelFrame([
      { x: 1, z: 0 },
      { x: 1, z: 2.2 },
    ])
    const badge = bakeStationPairs([identityAt(4, 1.88, 2.2)], frame)
    const desk = bakeStationPairs(desks, frame)
    expect(badge.pairs[0]?.explode.elements[14] - 2.2).toBeCloseTo(
      (desk.pairs[1]?.explode.elements[14] ?? 0) - 2.2,
      5,
    )
    const sink = sinkFrom(desks)
    applyStationProgress(sink, desk.pairs, 0)
    expect(translation(sink.array, 0)).toEqual({ x: 1, z: 0 })
    expect(sink.needs).toBe(1)
    sink.needs = 0
    applyStationProgress(sink, desk.pairs, 1)
    expect(translation(sink.array, 1).z).toBeCloseTo(desk.pairs[1]?.explode.elements[14] ?? 0, 5)
    expect(sink.array[0]).toBeCloseTo(desks[0]?.elements[0] ?? 0, 5)
    expect(sink.needs).toBe(1)
    expect(sink.instanceMatrix.usage).toBe(0)
  })

  it('一个网格一批写完只把 needsUpdate 置一次', () => {
    const rests = [identityAt(0, 0, 0), identityAt(0, 0, 2.2), identityAt(0, 0, 4.4)]
    const baked = bakeStationPairs(rests)
    const sink = sinkFrom(rests)
    const written = applyStationProgress(sink, baked.pairs, 0.4)
    expect(written).toBe(3)
    expect(sink.needs).toBe(1)
    const handle = matrixHandle(baked.pairs[0]?.rest.elements ?? [])
    const copy: number[] = []
    handle.toArray(copy, 0)
    expect(copy[12]).toBe(0)
  })

  it('标签成员只改平移列，矩阵自动更新在写的时候关掉', () => {
    const rests = [identityAt(0, 1, 0), identityAt(0, 1, 2.2)]
    const baked = bakeStationPairs(rests)
    const members = rests.map((rest) => ({
      matrix: { elements: rest.elements.slice() },
      matrixAutoUpdate: true,
      matrixWorldNeedsUpdate: false,
    }))
    members[0]!.matrix.elements[0] = 0.5
    applyMemberProgress(members, baked.pairs, 1)
    expect(members[0]?.matrix.elements[0]).toBe(0.5)
    expect(members[0]?.matrix.elements[14]).toBeCloseTo(baked.pairs[0]?.explode.elements[14] ?? 0, 5)
    expect(members[0]?.matrixAutoUpdate).toBe(false)
    expect(members[1]?.matrixWorldNeedsUpdate).toBe(true)
  })
})

describe('工位进度', () => {
  it('离开楼层立刻收拢，楼层时钟不被工位带着走', () => {
    resetExplodeMotion()
    resetStationExplodeMotion()
    const floor = stepExplodeMotion(true, 'building', 3)
    expect(floor).toEqual({ progress: 0, animating: true })
    const opened = stepStationExplodeMotion(true, 'floor', 4)
    expect(opened).toEqual({ progress: 0, animating: true })
    const mid = stepStationExplodeMotion(true, 'floor', 4 + EXPLODE_DURATION_S / 2)
    expect(mid.progress).toBeCloseTo(explodeProgress(0, 1, EXPLODE_DURATION_S / 2), 5)
    expect(mid.animating).toBe(true)
    const left = stepStationExplodeMotion(true, 'building', 4 + EXPLODE_DURATION_S / 2 + 0.01)
    expect(left).toEqual({ progress: 0, animating: false })
    const floorStill = stepExplodeMotion(true, 'building', 3 + EXPLODE_DURATION_S)
    expect(floorStill.progress).toBe(1)
    resetExplodeMotion()
    resetStationExplodeMotion()
  })

  it('单层里 0.8 秒落在 1，落定后不再写矩阵', () => {
    resetStationExplodeMotion()
    let settled = false
    let captured = false
    let posed = false
    const start = stationTick(posed, captured, settled, true, 'floor', 8)
    posed = start.posed
    captured = start.captured
    settled = start.settled
    expect(start.write).toBe(true)
    expect(start.capture).toBe(true)
    expect(start.motion.animating).toBe(true)
    const done = stationTick(posed, captured, settled, true, 'floor', 8 + EXPLODE_DURATION_S)
    posed = done.posed
    captured = done.captured
    settled = done.settled
    expect(done.motion).toEqual({ progress: 1, animating: false })
    expect(done.write).toBe(true)
    const held = stationTick(posed, captured, settled, true, 'floor', 8 + EXPLODE_DURATION_S + 2)
    expect(held.write).toBe(false)
    expect(held.motion.progress).toBe(1)
    const away = stationTick(held.posed, held.captured, held.settled, true, 'site', 30)
    expect(away).toMatchObject({ write: true, posed: false, captured: false, settled: false })
    expect(away.motion.progress).toBe(0)
    resetStationExplodeMotion()
  })
})

describe('场景驱动', () => {
  it('桌椅徽标同源进度，每帧每个网格只 needsUpdate 一次，离开楼层写回 rest', () => {
    resetStationExplodeMotion()
    const desks = sinkFrom([identityAt(0, 0, 0), identityAt(2, 0, 2.2)])
    const chairs = sinkFrom([identityAt(0, 0, 0, 0.2), identityAt(2, 0, 2.2, 0.2)])
    const badges = sinkFrom([identityAt(2, 1.88, 2.2)])
    const labelZ = [0, 2.2]
    const members = labelZ.map((z) => ({
      matrix: { elements: identityAt(3, 1.2, z).elements },
      matrixAutoUpdate: true,
      matrixWorldNeedsUpdate: false,
    }))
    let syncs = 0
    const scene: StationNode = {
      getObjectByName(name: string) {
        if (name === 'WorkstationDesks') return { name, ...desks, isInstancedMesh: true }
        if (name === 'WorkstationChairs') return { name, ...chairs, isInstancedMesh: true }
        if (name === 'DeviceBadges') return { name, ...badges, isInstancedMesh: true }
        if (name === 'RoomLabelBatchedText') return { name, _members: members, sync: () => { syncs += 1 } }
        return undefined
      },
    }
    const drive = createStationDrive()
    const start = driveStation(drive, scene, true, 'floor', 1)
    expect(start.animating).toBe(true)
    expect(start.needsUpdate).toBe(3)
    expect(desks.needs).toBe(1)
    expect(chairs.needs).toBe(1)
    expect(badges.needs).toBe(1)
    expect(syncs).toBe(1)
    expect(desks.instanceMatrix.usage).toBe(STATION_DYNAMIC_DRAW)
    desks.needs = 0
    chairs.needs = 0
    badges.needs = 0
    const done = driveStation(drive, scene, true, 'floor', 1 + EXPLODE_DURATION_S)
    expect(done.progress).toBe(1)
    expect(done.animating).toBe(false)
    expect(done.needsUpdate).toBe(3)
    const deskShift = translation(desks.array, 1).z - 2.2
    const badgeShift = translation(badges.array, 0).z - 2.2
    const labelShift = (members[1]?.matrix.elements[14] ?? 0) - 2.2
    expect(badgeShift).toBeCloseTo(deskShift, 5)
    expect(labelShift).toBeCloseTo(deskShift, 5)
    expect(chairs.array[0]).toBeCloseTo(Math.cos(0.2), 5)
    const held = driveStation(drive, scene, true, 'floor', 1 + EXPLODE_DURATION_S + 1)
    expect(held.needsUpdate).toBe(0)
    expect(held.progress).toBe(1)
    desks.needs = 0
    const left = driveStation(drive, scene, true, 'building', 9)
    expect(left.progress).toBe(0)
    expect(left.animating).toBe(false)
    expect(translation(desks.array, 0)).toEqual({ x: 0, z: 0 })
    expect(translation(desks.array, 1)).toEqual({ x: 2, z: 2.2 })
    expect(translation(badges.array, 0).z).toBeCloseTo(2.2, 5)
    expect(members[1]?.matrix.elements[14]).toBeCloseTo(2.2, 5)
    expect(members[1]?.matrixAutoUpdate).toBe(true)
    expect(desks.needs).toBe(1)
    resetStationExplodeMotion()
  })
})

describe('工位分包不进首屏', () => {
  it('接线在哈希前从 dock 摘掉，不新增依赖，楼层爆炸仍只改 position.y', () => {
    const dock = read('../viewmarks/dock.tsx')
    const plugin = read('../../scripts/stationExplodePlugin.ts')
    const vite = read('../../vite.config.ts')
    const pkg = JSON.parse(read('../../package.json')) as { dependencies: Record<string, string>; devDependencies: Record<string, string> }
    const explode = read('./explode.ts')
    const layout = read('../components/scene/ExplodedLayout.tsx')
    const mount = read('../station-explode/mount.ts')
    const drive = read('../station-explode/drive.ts')
    const math = read('./stationExplode.ts')

    expect(dock).toContain(STATION_EXPLODE_SOURCE_BLOCK)
    expect(dock.replace(STATION_EXPLODE_SOURCE_BLOCK, '')).not.toMatch(/mountStationExplode|station-explode\/mount/)
    expect(plugin).toContain(STATION_EXPLODE_SOURCE_BLOCK)
    expect(plugin).toMatch(/name: 'station-explode-after-hash'/)
    expect(plugin).toMatch(/assets\/StationExplode\.js/)
    expect(vite).toMatch(/stationExplodeAfterHash/)
    expect(vite.indexOf('documentWatchAfterHash()')).toBeLessThan(vite.indexOf('stationExplodeAfterHash()'))
    expect(explode).toMatch(/function stepStationExplodeMotion/)
    expect(explode).toMatch(/view !== 'floor'/)
    expect(layout).not.toMatch(/setMatrixAt\(/)
    expect(layout).toMatch(/position\.y/)
    expect(mount).toMatch(/internal\?\.subscribe\?\.\(ref, 0, root\.store\)/)
    expect(mount).not.toMatch(/from 'three'|from 'zustand'|gsap|anime|@react-spring/)
    expect(drive).not.toMatch(/from 'three'|from 'zustand'/)
    expect(math).not.toMatch(/from 'three'/)
    expect(mount).toMatch(/instanceMatrix|setMatrixAt/)
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    expect(deps.gsap).toBeUndefined()
    expect(deps.animejs).toBeUndefined()
    expect(deps['@react-spring/three']).toBeUndefined()
    expect(deps.three).toBe('0.186.1')
    expect(deps['@react-three/drei']).toBe('10.7.9')
  })
})
