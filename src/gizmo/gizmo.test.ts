import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { USER_CAMERA_SMOOTH_TIME } from '../scene/stage/cameraTransition'
import {
  GIZMO_FACES,
  GIZMO_RENDER_PRIORITY,
  NORTH_FACE,
  NORTH_FACE_INDEX,
  directionFromGizmoClick,
  lookOffset,
} from './faces'
import { flyToAxis } from './flyAxis'

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

describe('总览方位', () => {
  it('北在 -Z，东在 +X，面序与立方体一致', () => {
    expect(GIZMO_FACES[NORTH_FACE_INDEX]).toBe(NORTH_FACE)
    expect(GIZMO_FACES).toEqual(['东', '西', '上', '下', '南', '北'])
    expect(GIZMO_RENDER_PRIORITY).toBe(3)
    const north = lookOffset({ x: 0, y: 0, z: -1 }, 80, 0)
    expect(north.z).toBeCloseTo(-80, 5)
    expect(north.x).toBeCloseTo(0, 5)
    expect(north.y).toBeCloseTo(0, 5)
    const east = lookOffset({ x: 1, y: 0, z: 0 }, 40, 0)
    expect(east.x).toBeCloseTo(40, 5)
    expect(east.z).toBeCloseTo(0, 5)
    const south = lookOffset({ x: 0, y: 0, z: 2 }, 10, 0)
    expect(south.z).toBeCloseTo(10, 5)
    const west = lookOffset({ x: -3, y: 0, z: 0 }, 12, 0)
    expect(west.x).toBeCloseTo(-12, 5)
  })

  it('正上沿用当前方位，棱的位置不当作法线', () => {
    const up = lookOffset({ x: 0, y: 1, z: 0 }, 100, Math.PI / 2)
    expect(up.y).toBeGreaterThan(99)
    expect(up.x).toBeGreaterThan(0)
    expect(Math.abs(up.z)).toBeLessThan(1e-6)
    const face = directionFromGizmoClick({
      objectX: 0,
      objectY: 0,
      objectZ: 0,
      normalX: 0,
      normalY: 0,
      normalZ: -1,
    })
    expect(face).toEqual({ x: 0, y: 0, z: -1 })
    const edge = directionFromGizmoClick({
      objectX: 0.38,
      objectY: 0.38,
      objectZ: 0,
      normalX: 1,
      normalY: 0,
      normalZ: 0,
    })
    expect(edge).toEqual({ x: 0.38, y: 0.38, z: 0 })
    const aimed = lookOffset(edge!, 10, 0)
    expect(aimed.x).toBeCloseTo(aimed.y, 5)
    expect(aimed.z).toBeCloseTo(0, 5)
    expect(directionFromGizmoClick({ objectX: 0, objectY: 0, objectZ: 0 })).toBeNull()
  })

  it('点击只 setLookAt 过渡，不写阻尼', async () => {
    const calls: unknown[][] = []
    const rig = {
      setLookAt: (...args: unknown[]) => {
        calls.push(args)
        return Promise.resolve()
      },
    }
    vi.stubGlobal('requestAnimationFrame', () => 1)
    vi.stubGlobal('cancelAnimationFrame', () => {})
    flyToAxis(rig, { x: 4, y: 8, z: -6 }, { x: 1, y: 2, z: 3 }, () => {})
    await Promise.resolve()
    expect(calls).toEqual([[4, 8, -6, 1, 2, 3, true]])
    vi.unstubAllGlobals()
  })
})

describe('方位分包', () => {
  it('懒挂在首帧门之后，不进首屏，不改 T032，不碰小地图', () => {
    const scene = read('../components/Scene.tsx')
    const stage = read('../components/Stage.tsx')
    const rig = read('../components/scene/CameraRig.tsx')
    const loop = read('../components/scene/DemandLoop.tsx')
    const fx = read('../components/scene/postfx/balancedFx.tsx')
    const prefetch = read('../scene/stage/prefetchLazyChunks.ts')
    const transition = read('../scene/stage/cameraTransition.ts')
    const dock = read('../viewmarks/dock.tsx')
    const minimap = read('../minimap/mount.tsx')
    const widget = read('./OrientationGizmo.tsx')
    const fly = read('./flyAxis.ts')
    const faces = read('./faces.ts')
    const blob = [widget, fly, faces].join('\n')

    expect(USER_CAMERA_SMOOTH_TIME).toBe(0.42)
    expect(transition).toMatch(/USER_CAMERA_SMOOTH_TIME = 0\.42/)
    expect(rig).toMatch(/smoothTime=\{USER_CAMERA_SMOOTH_TIME\}/)
    expect(rig).toMatch(/makeDefault/)
    expect(loop).toMatch(/import\('\.\.\/\.\.\/gizmo\/OrientationGizmo'\)/)
    expect(loop).toMatch(/view !== 'building'/)
    expect(loop).toMatch(/ADAPTIVE_AFTER_FIRST_MS/)
    expect(loop).not.toMatch(/from ['"][^'"]*gizmo/)
    expect(loop).not.toMatch(/GizmoHelper|GizmoViewcube|GizmoViewport/)

    for (const source of [scene, stage, rig, fx, prefetch, transition, dock, minimap]) {
      expect(source).not.toMatch(/gizmo|GizmoHelper|GizmoViewcube|GizmoViewport/)
    }

    expect(widget).toMatch(/@react-three\/drei\/core\/GizmoHelper/)
    expect(widget).toMatch(/@react-three\/drei\/core\/GizmoViewcube/)
    expect(widget).not.toMatch(/GizmoViewport/)
    expect(widget).toMatch(/renderPriority=\{GIZMO_RENDER_PRIORITY\}/)
    expect(widget).toMatch(/onClick=\{onAxisClick\}/)
    expect(widget).not.toMatch(/tweenCamera\(/)
    expect(faces).toMatch(/GIZMO_RENDER_PRIORITY = 3/)
    expect(faces).toMatch(/北/)
    expect(fly).toMatch(/setLookAt\([\s\S]*true\)/)
    expect(blob).not.toMatch(/smoothTime/)
    expect(blob).not.toMatch(/balancedFx|cameraRest|frameSchedule|DemandLoop|minimap|FloorMinimap/)
    expect(blob).not.toMatch(/jsdelivr|cdn\./)
    const pkg = JSON.parse(read('../../package.json')) as { dependencies: Record<string, string> }
    expect(pkg.dependencies['@react-three/drei']).toBe('10.7.9')
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
