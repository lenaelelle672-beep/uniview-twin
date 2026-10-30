import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BoxGeometry, Group, InstancedMesh, Matrix4, MeshBasicMaterial } from 'three'
import {
  EXPLODE_FIT_PROGRESS_STEP,
  EXPLODE_FIT_SCRUB_MS,
  EXPLODE_FIT_WIDTH_TARGET,
  explodeFitDollyDistance,
  explodeFitHeld,
  nextStationExplodeFit,
  stationExplodeFitTailDue,
  type ExplodeFitMark,
  type ExplodeFitSample,
} from './explodeFitGate'
import { refreshStationExplodeBounds, frameExplodedStationBox, type ExplodeFitRig } from './stationExplodeFit'

function sample(partial: Partial<ExplodeFitSample> = {}): ExplodeFitSample {
  return {
    view: 'floor',
    active: true,
    progress: 1,
    animating: false,
    now: 1_000,
    held: false,
    floorId: 'F12',
    width: 1366,
    height: 768,
    ...partial,
  }
}

describe('工位爆炸取景门闩', () => {
  it('导览、书签和沿轨播放占镜头时不 fit，标记留着', () => {
    expect(explodeFitHeld({ viewpointHeld: true })).toBe(true)
    expect(explodeFitHeld({ touring: true })).toBe(true)
    expect(explodeFitHeld({ railPlaying: true })).toBe(true)
    expect(explodeFitHeld({})).toBe(false)
    const mark: ExplodeFitMark = {
      progress: 0.4,
      at: 100,
      floorId: 'F12',
      width: 1366,
      height: 768,
      settled: false,
    }
    const held = nextStationExplodeFit(sample({ held: true, progress: 1 }), mark)
    expect(held.fit).toBe(false)
    expect(held.mark).toBe(mark)
  })

  it('补间帧同回合再读，1920 昼景停稳不必再等下一帧', () => {
    expect(stationExplodeFitTailDue({ animating: true }, null)).toBe(true)
    expect(stationExplodeFitTailDue({ animating: false, active: false, progress: 0 }, null)).toBe(false)
    expect(stationExplodeFitTailDue(null, null)).toBe(false)
    expect(stationExplodeFitTailDue({ animating: false, active: true, progress: 1 }, null)).toBe(true)
    expect(
      stationExplodeFitTailDue({ animating: false, active: true, progress: 1 }, { settled: true, progress: 1 }),
    ).toBe(false)
    const mid = nextStationExplodeFit(sample({ progress: 0.4, animating: true, now: 100 }), null)
    expect(mid.fit).toBe(false)
    const opened = nextStationExplodeFit(
      sample({ progress: 1, animating: false, width: 1920, height: 1080, now: 101 }),
      mid.mark,
    )
    expect(opened.fit).toBe(true)
    expect(opened.kind).toBe('open')
  })

  it('补间过程中不 fit，全开落定只 fit 一次', () => {
    const mid = nextStationExplodeFit(sample({ progress: 0.4, animating: true, now: 100 }), null)
    expect(mid.fit).toBe(false)
    const opened = nextStationExplodeFit(sample({ progress: 1, animating: false, now: 900 }), mid.mark)
    expect(opened.fit).toBe(true)
    expect(opened.kind).toBe('open')
    const again = nextStationExplodeFit(sample({ progress: 1, now: 1_200 }), opened.mark)
    expect(again.fit).toBe(false)
    expect(again.mark).toBe(opened.mark)
  })

  it('收拢走完才回到楼板，收拢途中不抢', () => {
    const open = nextStationExplodeFit(sample({ progress: 1, now: 500 }), null)
    const collapsing = nextStationExplodeFit(
      sample({ active: false, progress: 0.4, animating: true, now: 600 }),
      open.mark,
    )
    expect(collapsing.fit).toBe(false)
    expect(collapsing.mark).toBe(open.mark)
    const closed = nextStationExplodeFit(
      sample({ active: false, progress: 0, animating: false, now: 1_400 }),
      collapsing.mark,
    )
    expect(closed.fit).toBe(true)
    expect(closed.kind).toBe('close')
    const idle = nextStationExplodeFit(sample({ active: false, progress: 0, now: 1_500 }), closed.mark)
    expect(idle.fit).toBe(false)
  })

  it('还没炸开过时进度 0 不 fit', () => {
    const idle = nextStationExplodeFit(sample({ active: false, progress: 0, now: 10 }), null)
    expect(idle.fit).toBe(false)
    expect(idle.mark).toBeNull()
  })

  it('scrub 按时间和步长节流，换画布尺寸会再 fit', () => {
    const first = nextStationExplodeFit(sample({ progress: 0.02, now: 1_000 }), null)
    expect(first.fit).toBe(false)
    const early = nextStationExplodeFit(sample({ progress: 0.5, now: 1_000 + EXPLODE_FIT_SCRUB_MS - 1 }), first.mark)
    expect(early.fit).toBe(false)
    const due = nextStationExplodeFit(sample({ progress: 0.5, now: 1_000 + EXPLODE_FIT_SCRUB_MS }), first.mark)
    expect(due.fit).toBe(true)
    expect(due.kind).toBe('scrub')
    expect(Math.abs(0.5 - (first.mark?.progress ?? 0))).toBeGreaterThanOrEqual(EXPLODE_FIT_PROGRESS_STEP)
    const tiny = nextStationExplodeFit(
      sample({ progress: 0.5 + EXPLODE_FIT_PROGRESS_STEP / 2, now: 2_000 }),
      due.mark,
    )
    expect(tiny.fit).toBe(false)
    const resized = nextStationExplodeFit(sample({ progress: 0.5, width: 1920, now: 2_010 }), due.mark)
    expect(resized.fit).toBe(true)
    expect(resized.kind).toBe('scrub')
  })

  it('离开楼层丢掉这一轮', () => {
    const gone = nextStationExplodeFit(sample({ view: 'building', progress: 1 }), null)
    expect(gone.fit).toBe(false)
    expect(gone.mark).toBeNull()
  })

  it('dolly 把过小或贴边的主体收到可读宽度，已经合适就不动', () => {
    expect(explodeFitDollyDistance(20, 0.5)).toBeCloseTo(20 * (0.5 / EXPLODE_FIT_WIDTH_TARGET))
    expect(explodeFitDollyDistance(20, 1)).toBeGreaterThan(20)
    expect(explodeFitDollyDistance(20, EXPLODE_FIT_WIDTH_TARGET)).toBeNull()
    expect(explodeFitDollyDistance(20, 0.04)).toBeNull()
    expect(explodeFitDollyDistance(0, 0.5)).toBeNull()
  })

  it('先刷新实例包围盒再 fit，过期的盒不能拿来用', async () => {
    const geometry = new BoxGeometry(1, 1, 1)
    const material = new MeshBasicMaterial()
    const mesh = new InstancedMesh(geometry, material, 2)
    mesh.name = 'WorkstationDesks'
    mesh.setMatrixAt(0, new Matrix4().setPosition(0, 0, 0))
    mesh.setMatrixAt(1, new Matrix4().setPosition(4, 0, 0))
    mesh.computeBoundingBox()
    const stale = mesh.boundingBox?.max.x ?? 0
    mesh.setMatrixAt(1, new Matrix4().setPosition(12, 0, 0))
    const root = new Group()
    root.add(mesh)
    root.updateMatrixWorld(true)
    const calls: string[] = []
    const original = mesh.computeBoundingBox.bind(mesh)
    mesh.computeBoundingBox = () => {
      calls.push('bbox')
      original()
    }
    const box = refreshStationExplodeBounds(root)
    expect(calls).toEqual(['bbox'])
    expect(box).not.toBeNull()
    expect(box!.max.x).toBeGreaterThan(stale + 5)

    const rig: ExplodeFitRig = {
      maxDistance: 520,
      distance: 30,
      maxPolarAngle: Math.PI,
      smoothTime: 0.42,
      fitToBox: (_box, transition) => {
        calls.push(transition ? 'fit-glide' : 'fit')
        return Promise.resolve()
      },
      dollyTo: (distance) => {
        calls.push('dolly')
        rig.distance = distance
        return Promise.resolve()
      },
      setLookAt: (_x, _y, _z, _tx, _ty, _tz, transition) => {
        calls.push(transition ? 'seed-glide' : 'seed')
        return Promise.resolve()
      },
      update: () => {
        calls.push('update')
      },
    }
    const framed = await frameExplodedStationBox(rig, box!, {
      polarDip: 1.05,
      padding: 2,
      smoothTime: 0.42,
      cancelled: () => false,
      widthRatio: () => 0.4,
    })
    expect(framed.ok).toBe(true)
    expect(framed.dolly).toBe(true)
    expect(calls.indexOf('bbox')).toBeLessThan(calls.indexOf('seed'))
    expect(calls.indexOf('seed')).toBeLessThan(calls.indexOf('fit'))
    expect(calls.indexOf('fit')).toBeLessThan(calls.indexOf('dolly'))
    expect(calls).not.toContain('fit-glide')
    expect(calls).not.toContain('seed-glide')
    expect(rig.maxPolarAngle).toBe(Math.PI)
    expect(rig.maxDistance).toBeGreaterThanOrEqual(520)
    geometry.dispose()
    material.dispose()
  })

  it('没有桌子时不拿楼板冒充炸开结果', () => {
    const root = new Group()
    const plate = new InstancedMesh(new BoxGeometry(2, 0.2, 2), new MeshBasicMaterial(), 1)
    plate.name = 'FloorPlate'
    root.add(plate)
    expect(refreshStationExplodeBounds(root)).toBeNull()
    plate.geometry.dispose()
    ;(plate.material as MeshBasicMaterial).dispose()
  })

  it('总览爆炸 fit 仍在 CameraRig，楼层 fit 与节流跟 cameraTransition 的门闩走，不引 PivotControls', () => {
    const rig = readFileSync(new URL('../../components/scene/CameraRig.tsx', import.meta.url), 'utf8')
    const floor = readFileSync(new URL('./FloorStageCamera.tsx', import.meta.url), 'utf8')
    const transition = readFileSync(new URL('./cameraTransition.ts', import.meta.url), 'utf8')
    const gate = readFileSync(new URL('./explodeFitGate.ts', import.meta.url), 'utf8')
    const fit = readFileSync(new URL('./stationExplodeFit.ts', import.meta.url), 'utf8')
    const mount = readFileSync(new URL('../../station-explode/mount.ts', import.meta.url), 'utf8')
    const pkg = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')) as {
      dependencies: Record<string, string>
    }
    const lock = readFileSync(new URL('../../../package-lock.json', import.meta.url), 'utf8')

    expect(rig).toMatch(/bounds\.max\.y \+= explodeOffset/)
    expect(rig).toMatch(/fitToBox\(bounds, false/)
    expect(rig).toMatch(/view === 'floor'/)
    expect(rig).not.toMatch(/PivotControls/)
    const refreshAt = floor.indexOf('const box = refreshStationExplodeBounds')
    const frameAt = floor.indexOf('frameExplodedStationBox(rig')
    expect(refreshAt).toBeGreaterThan(-1)
    expect(frameAt).toBeGreaterThan(refreshAt)
    expect(floor).toMatch(/nextStationExplodeFit/)
    expect(floor).toMatch(/stationExplodeFitTailDue/)
    expect(floor).toMatch(/addTail/)
    expect(floor).not.toMatch(/frameloop/)
    expect(floor).toMatch(/explodeFramingHeld/)
    expect(floor).toMatch(/stationBlocksPlateFit/)
    expect(floor).toMatch(/fitToBox\(box, false\)/)
    expect(floor).not.toMatch(/PivotControls/)
    expect(floor).not.toMatch(/smoothTime = 0/)
    expect(transition).toMatch(/USER_CAMERA_SMOOTH_TIME = 0\.42/)
    expect(transition).toMatch(/explodeFitGate/)
    expect(gate).toMatch(/EXPLODE_FIT_SCRUB_MS = 240/)
    expect(fit).toMatch(/obliqueOverviewSeed/)
    expect(fit).toMatch(/setLookAt\(seed\.position\[0\]/)
    expect(fit).toMatch(/fitToBox\(box, false/)
    expect(fit).toMatch(/dollyTo/)
    expect(fit).not.toMatch(/PivotControls/)
    expect(fit).not.toMatch(/from 'camera-controls'|from "camera-controls"/)
    expect(mount).not.toMatch(/explodeFitGate|stationExplodeFit/)
    expect(pkg.dependencies['camera-controls']).toBeUndefined()
    expect(pkg.dependencies['@react-three/drei']).toBe('10.7.9')
    expect(pkg.dependencies.three).toBe('0.186.1')
    expect(lock).toMatch(/node_modules\/camera-controls":\s*\{\s*"version": "3\.1\.2"/)
  })
})
