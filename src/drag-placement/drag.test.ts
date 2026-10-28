import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CLONE_SPOTS } from '../fragment-clone/plan'
import { FOG_DENSITY } from '../scene/fog'
import { engageCameraDragLock, releaseCameraDragLock, shouldSuspendCameraDrag } from '../scene/stage/boxSelect'
import { USER_CAMERA_SMOOTH_TIME } from '../scene/stage/cameraTransition'
import { DRAG_SOURCE_BLOCK } from '../../scripts/dragPlugin'
import { claimDragCamera, dragCameraHeld, releaseDragCamera, type DragCamera } from './latch'
import {
  DRAG_AXIS,
  DRAG_SPOTS,
  FURNITURE_CLONE_SEEDS,
  cloneFromHandle,
  closestHitIsPlacement,
  dragAcceptsPointer,
  dragEnabled,
  dragLimitsFor,
  eventTargetsCanvas,
  handleOf,
  insideDragLimits,
  movedCount,
  readMatrixPosition,
} from './plan'
import { commitPlace, dragSessionSnapshot, placeOf, resetDragSessionForTests, setDragFlags } from './session'

const here = dirname(fileURLToPath(import.meta.url))

function read(path: string): string {
  return readFileSync(join(here, path), 'utf8')
}

describe('落点拖摆', () => {
  it('默认关，只在作者态或本页开关打开，Shift 让给框选', () => {
    expect(dragEnabled(null, '')).toBe(false)
    expect(dragEnabled(null, '?q=balanced')).toBe(false)
    expect(dragEnabled(null, '?demoEdit=0')).toBe(false)
    expect(dragEnabled(null, '?demoEdit=10')).toBe(false)
    expect(dragEnabled(null, '?q=balanced&demoEdit=1')).toBe(true)
    expect(dragEnabled(null, '', '?demoEdit=1')).toBe(true)
    expect(dragEnabled(null, '', '', { debugHelpers: true })).toBe(true)
    expect(dragEnabled(false, '?demoEdit=1', '', { debugHelpers: true })).toBe(false)
    expect(dragEnabled(true, '')).toBe(true)

    expect(dragAcceptsPointer({ shiftKey: false, button: 0 })).toBe(true)
    expect(dragAcceptsPointer({ shiftKey: true, button: 0 })).toBe(false)
    expect(dragAcceptsPointer({ shiftKey: false, button: 2 })).toBe(false)
    expect(DRAG_AXIS).toBe('y')
    expect(DRAG_SPOTS.filter((spot) => spot.kind === 'device')).toHaveLength(3)
    expect(DRAG_SPOTS.filter((spot) => spot.kind === 'furniture')).toHaveLength(3)
    expect(FURNITURE_CLONE_SEEDS.map((spot) => [...spot.clone])).toEqual(CLONE_SPOTS.map((spot) => [...spot.position]))
    for (const spot of DRAG_SPOTS) {
      const handle = handleOf(spot)
      expect(insideDragLimits(handle, spot.handle[1])).toBe(true)
      expect(dragLimitsFor(spot.handle[1])[1]).toEqual([spot.handle[1], spot.handle[1]])
      if (spot.clone) {
        expect(handle.x).toBeGreaterThan(spot.clone[0])
        const moved = { x: handle.x + 4, y: handle.y + 9, z: handle.z - 2 }
        expect(cloneFromHandle(moved, handle, spot.clone)).toEqual({
          x: spot.clone[0] + 4,
          y: spot.clone[1],
          z: spot.clone[2] - 2,
        })
      }
    }
    expect(readMatrixPosition({ elements: Array.from({ length: 16 }, (_, index) => index) })).toEqual({ x: 12, y: 13, z: 14 })
    expect(closestHitIsPlacement([])).toBe(false)
    expect(closestHitIsPlacement([{ userData: { dragPlacement: false } }, { userData: { dragPlacement: true } }])).toBe(false)
    expect(closestHitIsPlacement([{ userData: { dragPlacement: true } }])).toBe(true)
    const canvas = { name: 'canvas' }
    expect(eventTargetsCanvas({ target: canvas }, canvas)).toBe(true)
    expect(eventTargetsCanvas({ target: {} }, canvas)).toBe(false)
    const places = new Map(DRAG_SPOTS.map((spot) => [spot.id, handleOf(spot)] as const))
    expect(movedCount(places)).toBe(0)
    const first = DRAG_SPOTS[0]
    if (!first) throw new Error('missing spot')
    places.set(first.id, { x: handleOf(first).x + 2, y: handleOf(first).y, z: handleOf(first).z })
    expect(movedCount(places)).toBe(1)
  })

  it('门闩只交还按下前的镜头，Shift 仍交给框选', () => {
    const live: DragCamera = { enabled: true }
    expect(claimDragCamera(live)).toBe(true)
    expect(dragCameraHeld(live)).toBe(true)
    expect(live.enabled).toBe(false)
    expect(claimDragCamera(live)).toBe(true)
    expect(live.__twinDragLatch?.restore).toBe(true)
    live.enabled = true
    expect(releaseDragCamera(live)).toBe(true)
    expect(live.enabled).toBe(true)
    expect(dragCameraHeld(live)).toBe(false)
    expect(releaseDragCamera(live)).toBe(false)

    const parked = { enabled: false }
    expect(claimDragCamera(parked)).toBe(true)
    parked.enabled = true
    expect(releaseDragCamera(parked)).toBe(true)
    expect(parked.enabled).toBe(false)
    expect(claimDragCamera(null)).toBe(false)
    expect(releaseDragCamera(undefined)).toBe(false)

    const canvas = {}
    expect(dragAcceptsPointer({ button: 0, shiftKey: true })).toBe(false)
    expect(shouldSuspendCameraDrag({ shiftKey: true, button: 0, target: canvas }, canvas)).toBe(true)
    const controls = { enabled: true }
    expect(engageCameraDragLock(controls)).toBe(true)
    expect(controls.enabled).toBe(false)
    releaseCameraDragLock(controls, true)
    expect(controls.enabled).toBe(true)
    expect(shouldSuspendCameraDrag({ shiftKey: false, button: 0, target: canvas }, canvas)).toBe(false)
  })

  it('草稿关了就放下 dragging，位置留在这次会话里', () => {
    resetDragSessionForTests()
    expect(placeOf('camera-s')).toEqual({ x: 0, y: 1.25, z: 18 })
    commitPlace('camera-s', { x: 3, y: 1.25, z: 4 })
    expect(placeOf('camera-s').x).toBe(3)
    setDragFlags({ on: true, mounted: true, dragging: true, latched: true })
    expect(dragSessionSnapshot()).toEqual({ on: true, mounted: true, dragging: true, latched: true })
    const shared = globalThis as { __twinDragState?: { on: boolean; mounted: boolean } }
    expect(shared.__twinDragState?.on).toBe(true)
    expect(shared.__twinDragState?.mounted).toBe(true)
    setDragFlags({ on: false })
    expect(dragSessionSnapshot()).toEqual({ on: false, mounted: false, dragging: false, latched: false })
    expect(placeOf('camera-s')).toEqual({ x: 3, y: 1.25, z: 4 })
    resetDragSessionForTests()
  })
})

describe('拖摆分包', () => {
  it('懒挂在 dock 哈希之后，不进首屏，不改雾和 T032，也不另装手势库', () => {
    expect(USER_CAMERA_SMOOTH_TIME).toBe(0.42)
    expect(FOG_DENSITY.day).toBe(0.00112)
    expect(FOG_DENSITY.night).toBe(0.00096)

    const dock = read('../viewmarks/dock.tsx')
    const mount = read('./mount.ts')
    const live = read('./PlacementDrag.tsx')
    const plan = read('./plan.ts')
    const latch = read('./latch.ts')
    const session = read('./session.ts')
    const plugin = read('../../scripts/dragPlugin.ts')
    const vite = read('../../vite.config.ts')
    const box = read('../scene/stage/boxSelect.ts')
    const desks = read('../scene/stage/DeskBoxSelect.tsx')
    const stations = read('../scene/stage/Workstations.tsx')
    const editor = read('../demo-edit/DemoPointEditor.tsx')
    const pkg = JSON.parse(read('../../package.json')) as {
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
    }

    expect(dock).toContain(DRAG_SOURCE_BLOCK.trimEnd())
    expect(dock).toMatch(/import\('\.\.\/drag-placement\/mount'\)/)
    expect(dock).toMatch(/mountPlacementDrag\(\)/)
    expect(dock).not.toMatch(/from '\.\.\/drag-placement\/mount'/)
    expect(dock).not.toMatch(/demoEdit/)
    expect(plugin).toContain(DRAG_SOURCE_BLOCK)
    expect(plugin).toMatch(/name: 'drag-after-hash'/)
    expect(plugin).toMatch(/apply: 'build'/)
    expect(plugin).toMatch(/assets\/DragMount\.js/)
    expect(plugin).toMatch(/assets\/DragControls\.js/)
    expect(vite).toMatch(/dragAfterHash/)

    expect(mount).toMatch(/import\('\.\/PlacementDrag'\)/)
    expect(mount).not.toMatch(/import \{ PlacementDrag \}/)
    expect(mount).not.toMatch(/@react-three|from 'three'|PivotControls|@use-gesture/)
    expect(mount).toMatch(/dataset\.layer = 'placementDrag'/)
    expect(mount).toMatch(/__dragBridge/)
    expect(live).toMatch(/from '@react-three\/drei\/web\/DragControls'/)
    expect(live).not.toMatch(/from '@react-three\/drei'['"]/)
    expect(live).toMatch(/<DragControls/)
    expect(live).toMatch(/axisLock=\{DRAG_AXIS\}/)
    expect(live).toMatch(/claimDragCamera/)
    expect(live).toMatch(/releaseDragCamera/)
    expect(live).toMatch(/name="PlacementDrag"/)
    expect(live).toMatch(/group\.name = spot\.kind === 'device' \? 'DragDevice' : 'DragFurniture'/)
    expect(live).not.toMatch(/PivotControls|TransformControls|@use-gesture/)
    expect(plan).not.toMatch(/@react-three|from 'three'|workstationPosition|PivotControls|FogExp2/)
    expect(latch).not.toMatch(/@react-three|from 'three'|PivotControls/)
    expect(session).not.toMatch(/@react-three|from 'three'|PivotControls/)
    expect(box).not.toMatch(/placementDrag|drag-placement|DragControls|@use-gesture|PivotControls/)
    expect(desks).toMatch(/engageCameraDragLock/)
    expect(desks).not.toMatch(/DragControls|drag-placement/)
    expect(stations).not.toMatch(/DragControls|drag-placement/)
    expect(editor).toMatch(/TransformControls/)
    expect(editor).not.toMatch(/DragControls|PivotControls|drag-placement/)

    const eager = [
      '../components/Scene.tsx',
      '../components/Stage.tsx',
      '../App.tsx',
      '../main.tsx',
      '../components/scene/postfx/balancedFx.tsx',
      '../components/scene/DemandLoop.tsx',
      '../components/scene/CameraRig.tsx',
      '../components/scene/InstancedProp.tsx',
      '../scene/fog.ts',
      '../scene/stage/cameraTransition.ts',
      '../floors/floorInteriorMesh.ts',
    ]
    for (const file of eager) {
      expect(read(file), file).not.toMatch(/DragControls|drag-placement|mountPlacementDrag|PivotControls|@use-gesture/)
    }

    expect(pkg.dependencies['@react-three/drei']).toBe('10.7.9')
    expect(pkg.dependencies.three).toBe('0.186.1')
    expect(pkg.dependencies['@react-three/fiber']).toBe('9.8.1')
    expect(pkg.dependencies['@use-gesture/react']).toBeUndefined()
    expect(pkg.devDependencies['@use-gesture/react']).toBeUndefined()
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
