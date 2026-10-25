import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FOG_DENSITY } from '../scene/fog'
import { USER_CAMERA_SMOOTH_TIME } from '../scene/stage/cameraTransition'
import { CAMERA_LIMITS } from '../scene/cameras'
import { floorTourPose } from '../viewmarks/tourPose'
import { isAlarmTourLabel, motionPathLoopOn, tourPathGateOn, tourPathQueryOn } from './gate'
import { claimMotionCamera, motionOwnsCamera, releaseMotionCamera, type MotionClaim } from './latch'
import { withTourMotion } from './overlay'
import { buildMotionRoute, type MotionSample } from './points'
import { MOTION_PATH_DOCK_BOOT, MOTION_PATH_SOURCE_BLOCK } from '../../scripts/motionPathPlugin'

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

function rig(partial: Partial<MotionClaim> = {}): MotionClaim & { look: number[]; updates: number[] } {
  const look: number[] = []
  const updates: number[] = []
  const next: MotionClaim & { look: number[]; updates: number[] } = {
    enabled: true,
    look,
    updates,
    update(delta: number) {
      updates.push(delta)
      return true
    },
    setLookAt(x, y, z, tx, ty, tz) {
      look.splice(0, look.length, x, y, z, tx, ty, tz)
    },
    ...partial,
  }
  return next
}

describe('导览轨门闩', () => {
  it('默认关，只认 tourPath=1 或 demoEdit=1', () => {
    expect(tourPathGateOn('')).toBe(false)
    expect(tourPathGateOn('?q=balanced')).toBe(false)
    expect(tourPathQueryOn('?demoEdit=0')).toBe(false)
    expect(tourPathQueryOn('?demoEdit=10')).toBe(false)
    expect(tourPathQueryOn('?tourPath=0')).toBe(false)
    expect(tourPathQueryOn('?demo=1')).toBe(false)
    expect(tourPathGateOn('?tourPath=1')).toBe(true)
    expect(tourPathGateOn('?q=balanced&demoEdit=1')).toBe(true)
    expect(tourPathGateOn('demoEdit=1')).toBe(true)
    expect(motionPathLoopOn('')).toBe(false)
    expect(motionPathLoopOn('?tourPath=1')).toBe(false)
    expect(motionPathLoopOn('?tourLoop=1')).toBe(true)
    expect(motionPathLoopOn('?tourLoop=0')).toBe(false)
    expect(isAlarmTourLabel('导览告警')).toBe(true)
    expect(isAlarmTourLabel(' 停止导览 ')).toBe(true)
    expect(isAlarmTourLabel('保存')).toBe(false)
  })
})

describe('沿轨点', () => {
  it('从眼点串起告警楼层机位，默认不循环，时长有上限', () => {
    const route = buildMotionRoute(['F1', 'F12'], { x: 1, y: 2, z: 3 }, false)
    expect(route).not.toBeNull()
    if (!route) return
    expect(route.loop).toBe(false)
    expect(route.floors).toEqual(['F1', 'F12'])
    expect(route.points[0]).toEqual({ x: 1, y: 2, z: 3 })
    expect(route.points.length).toBeGreaterThanOrEqual(2)
    expect(route.seconds).toBeGreaterThanOrEqual(4.5)
    expect(route.seconds).toBeLessThanOrEqual(14)
    const pose = floorTourPose('F1')
    const end = route.points[route.points.length - 1]
    expect(end?.x).toBeCloseTo(pose.px, 5)
    const many = buildMotionRoute(
      ['B1', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F12', 'F18', 'F22'],
      null,
      false,
    )
    expect(many?.seconds).toBe(14)
    expect(many?.loop).toBe(false)
    for (const point of route.points) {
      expect(point.y).toBeGreaterThan(CAMERA_LIMITS.minCameraY)
    }
  })

  it('没有楼层就不给轨', () => {
    expect(buildMotionRoute([], { x: 0, y: 1, z: 0 }, false)).toBeNull()
  })
})

describe('CameraControls 互斥', () => {
  it('播放中换掉 update，结束再交还并写回眼点', () => {
    const controls = rig()
    const original = controls.update
    expect(claimMotionCamera(controls)).toBe(true)
    expect(motionOwnsCamera(controls)).toBe(true)
    expect(controls.enabled).toBe(false)
    expect(controls.update(0.5)).toBe(false)
    expect(controls.updates).toEqual([])
    expect(claimMotionCamera(controls)).toBe(true)
    const eye: MotionSample = { x: 4, y: 5, z: 6 }
    const focus: MotionSample = { x: 1, y: 2, z: 3 }
    expect(releaseMotionCamera(controls, eye, focus)).toBe(true)
    expect(motionOwnsCamera(controls)).toBe(false)
    expect(controls.enabled).toBe(true)
    expect(controls.update).toBe(original)
    expect(controls.updates).toEqual([0])
    expect(controls.look).toEqual([4, 5, 6, 1, 2, 3])
    expect(releaseMotionCamera(controls, eye, focus)).toBe(false)
  })

  it('本来就关着的拖曳，交还时不要打开', () => {
    const controls = rig({ enabled: false })
    expect(claimMotionCamera(controls)).toBe(true)
    expect(controls.enabled).toBe(false)
    releaseMotionCamera(controls, { x: 0, y: 1, z: 2 }, { x: 0, y: 0, z: 0 })
    expect(controls.enabled).toBe(false)
  })
})

describe('格网槽', () => {
  it('没有沿轨节点时不包一层', () => {
    expect(withTourMotion(null)).toBeNull()
    expect(withTourMotion('grid')).toBe('grid')
  })

  it('播放节点接在已有叠层后面', () => {
    const previous = globalThis.window
    Object.assign(globalThis, {
      window: { __twinTourMotionNode: 'path' },
    })
    try {
      expect(withTourMotion(null)).toBe('path')
      const both = withTourMotion('grid')
      expect(both).not.toBe('grid')
      expect(both).not.toBe('path')
    } finally {
      if (previous === undefined) {
        delete (globalThis as { window?: unknown }).window
      } else {
        Object.assign(globalThis, { window: previous })
      }
    }
  })
})

describe('懒挂与禁项', () => {
  it('MotionPath 只在播放分包，默认不循环，不进首屏和雾', () => {
    expect(USER_CAMERA_SMOOTH_TIME).toBe(0.42)
    expect(FOG_DENSITY.day).toBe(0.00112)
    expect(FOG_DENSITY.night).toBe(0.00096)

    const dock = read('../viewmarks/dock.tsx')
    const session = read('./session.tsx')
    const mount = read('./mount.ts')
    const plugin = read('../../scripts/motionPathPlugin.ts')
    const viteConfig = read('../../vite.config.ts')
    const pkg = JSON.parse(read('../../package.json')) as { dependencies: Record<string, string> }

    expect(dock).toContain(MOTION_PATH_SOURCE_BLOCK.trimEnd())
    expect(dock).toMatch(/import\('\.\.\/tour-path\/mount'\)/)
    expect(dock).not.toMatch(/from '\.\.\/tour-path\/mount'/)
    expect(dock).not.toMatch(/MotionPathControls/)
    expect(plugin).toContain(MOTION_PATH_SOURCE_BLOCK)
    expect(plugin).toContain(MOTION_PATH_DOCK_BOOT)
    expect(plugin).toMatch(/apply: 'build'/)
    expect(plugin).toMatch(/assets\/MotionPathPlayer\.js/)
    expect(MOTION_PATH_DOCK_BOOT).toMatch(/import\("\.\/MotionPathPlayer\.js"\)/)
    expect(MOTION_PATH_DOCK_BOOT.indexOf('queryOn(location.search)')).toBeLessThan(
      MOTION_PATH_DOCK_BOOT.indexOf('import("./MotionPathPlayer.js")'),
    )
    expect(MOTION_PATH_DOCK_BOOT).toMatch(/get\("tourPath"\) === "1"/)
    expect(MOTION_PATH_DOCK_BOOT).toMatch(/get\("demoEdit"\) === "1"/)
    expect(viteConfig).toMatch(/motionPathAfterHash/)

    expect(mount).toMatch(/import\('\.\/session'\)/)
    expect(mount).not.toMatch(/MotionPathControls|@react-three/)
    expect(session).toMatch(/@react-three\/drei\/core\/MotionPathControls/)
    expect(session).not.toMatch(/from '@react-three\/drei'/)
    expect(session).toMatch(/loop=\{route\.loop\}/)
    expect(session).not.toMatch(/loop=\{true\}/)
    expect(session).toMatch(/state\.invalidate\(\)/)
    expect(session).toMatch(/claimMotionCamera/)
    expect(session).toMatch(/releaseMotionCamera/)

    const eager = [
      '../components/Scene.tsx',
      '../components/Stage.tsx',
      '../components/scene/postfx/balancedFx.tsx',
      '../components/scene/DemandLoop.tsx',
      '../components/scene/CameraRig.tsx',
      '../viewmarks/alarmTour.ts',
      '../viewmarks/ViewmarkDock.tsx',
      '../scene/fog.ts',
      '../scene/stage/cameraTransition.ts',
    ]
    for (const file of eager) {
      const source = read(file)
      expect(source).not.toMatch(/MotionPathControls|useMotion|TourMotionPath|tour-path/)
    }

    const banned = ['balancedFx', 'FogExp2', 'cameraRest', 'frameSchedule', 'ccapture', 'SmoothTime']
    const local = [session, mount, read('./gate.ts'), read('./latch.ts'), read('./overlay.ts')].join('\n')
    for (const name of banned) expect(local).not.toContain(name)

    expect(pkg.dependencies['@react-three/drei']).toBe('10.7.9')
    expect(pkg.dependencies.three).toBe('0.186.1')
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
