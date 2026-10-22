import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createMockData } from '../../data/mockData'
import { hydrateFloorFromDisk } from '../../floors/hydrateForTests'
import { workstationPosition } from './workstationPosition'
import {
  deskIdsFromBoxSelection,
  engageCameraDragLock,
  floorPickProxies,
  releaseCameraDragLock,
  shouldSuspendCameraDrag,
} from './boxSelect'
import { resetBoxSelectStore, useBoxSelectStore } from './boxSelectStore'

hydrateFloorFromDisk('F12')

const here = dirname(fileURLToPath(import.meta.url))

function read(relative: string): string {
  return readFileSync(join(here, relative), 'utf8')
}

describe('工位框选代理', () => {
  it('按实例序号摆代理，落点跟工位公式走，不收 InstancedMesh 整网', () => {
    const data = createMockData()
    const proxies = floorPickProxies('F12', data.desks)
    const floorDesks = data.desks.filter((desk) => desk.floorId === 'F12')
    expect(proxies).toHaveLength(floorDesks.length)
    expect(proxies[0]).toMatchObject({ deskId: 'F12-1', instanceIndex: 0 })
    expect(proxies[65]).toMatchObject({ deskId: 'F12-66', instanceIndex: 65 })
    const place = workstationPosition('F12', 'F12-66')
    expect(proxies[65].x).toBe(place.x)
    expect(proxies[65].z).toBe(place.z)
    expect(new Set(proxies.map((proxy) => `${proxy.x}:${proxy.z}`)).size).toBeGreaterThan(1)
    expect(floorPickProxies('F12', data.desks.filter((desk) => desk.floorId === 'F11'))).toEqual([])

    expect(
      deskIdsFromBoxSelection([
        { isInstancedMesh: true, userData: { boxPickProxy: true, deskId: 'F12-1' } },
        { userData: { boxPickProxy: true, deskId: 'F12-4' } },
        { userData: { boxPickProxy: true, deskId: 'F12-4' } },
        { userData: { deskId: 'F12-5' } },
        { userData: { boxPickProxy: true, deskId: 'F12-2' } },
      ]),
    ).toEqual(['F12-2', 'F12-4'])
  })

  it('Shift 拖框才锁 CameraControls，松手只恢复自己关掉的那次', () => {
    const canvas = {}
    const panel = {}
    expect(shouldSuspendCameraDrag({ shiftKey: false, button: 0, target: canvas }, canvas)).toBe(false)
    expect(shouldSuspendCameraDrag({ shiftKey: true, button: 0, target: canvas }, canvas)).toBe(true)
    expect(shouldSuspendCameraDrag({ shiftKey: true, button: 2, target: canvas }, canvas)).toBe(true)
    expect(shouldSuspendCameraDrag({ shiftKey: true, button: 0, target: panel }, canvas)).toBe(false)
    expect(shouldSuspendCameraDrag({ shiftKey: true, button: 5, target: canvas }, canvas)).toBe(false)

    const controls = { enabled: true }
    expect(engageCameraDragLock(controls)).toBe(true)
    expect(controls.enabled).toBe(false)
    expect(engageCameraDragLock(controls)).toBe(false)
    releaseCameraDragLock(controls, true)
    expect(controls.enabled).toBe(true)

    const parked = { enabled: false }
    expect(engageCameraDragLock(parked)).toBe(false)
    releaseCameraDragLock(parked, false)
    expect(parked.enabled).toBe(false)
    expect(engageCameraDragLock(null)).toBe(false)
  })

  it('框选结果按楼层记下，清的是同一层', () => {
    resetBoxSelectStore()
    useBoxSelectStore.getState().setBoxSelection('F12', ['F12-2', 'F12-1'])
    const saved = useBoxSelectStore.getState().deskIds
    expect(useBoxSelectStore.getState().floorId).toBe('F12')
    expect(saved).toEqual(['F12-2', 'F12-1'])
    useBoxSelectStore.getState().setBoxSelection('F12', ['F12-2', 'F12-1'])
    expect(useBoxSelectStore.getState().deskIds).toBe(saved)
    useBoxSelectStore.getState().clearBoxSelection('F11')
    expect(useBoxSelectStore.getState().floorId).toBe('F12')
    useBoxSelectStore.getState().clearBoxSelection('F12')
    expect(useBoxSelectStore.getState()).toMatchObject({ floorId: null, deskIds: [] })
  })
})

describe('框选懒包', () => {
  it('Select 从 drei 深路径进懒包，首屏文件不引用它', () => {
    const view = read('DeskBoxSelect.tsx')
    const outlines = read('DeskOutline.tsx')
    const logic = read('boxSelect.ts')
    const drei = readFileSync(join(here, '../../../node_modules/@react-three/drei/web/Select.js'), 'utf8')
    const selectionBox = readFileSync(join(here, '../../../node_modules/three-stdlib/interactive/SelectionBox.js'), 'utf8')
    expect(view).toMatch(/from '@react-three\/drei\/web\/Select'/)
    expect(view).toMatch(/<Select/)
    expect(view).toMatch(/\bbox\b/)
    expect(view).toMatch(/\bmultiple\b/)
    expect(view).toMatch(/mesh\.name = 'DeskPickProxy'/)
    expect(view).toMatch(/boxPickProxy: true/)
    expect(view).toMatch(/instanceIndex: proxy\.instanceIndex/)
    expect(view).toMatch(/mesh\.raycast = ignoreRaycast/)
    expect(view).toMatch(/mesh\.visible = false/)
    expect(view).not.toMatch(/proxyGeometry\.dispose|proxyMaterial\.dispose|<instancedMesh/)
    expect(view).toMatch(/addEventListener\('pointerdown', onDown, true\)/)
    expect(view).toMatch(/engageCameraDragLock/)
    expect(view).toMatch(/releaseCameraDragLock/)
    expect(view).not.toMatch(/from 'three-stdlib'|new SelectionBox|<instancedMesh/)
    expect(view).not.toMatch(/softShadows|DemandLoop|cameraRest|frameSchedule|balancedFx|OutlinePass/)
    expect(outlines).toMatch(/import\('\.\/DeskBoxSelect'\)/)
    expect(outlines).not.toMatch(/from '\.\/DeskBoxSelect'/)
    expect(outlines).not.toMatch(/@react-three\/drei\/web\/Select/)
    expect(outlines).toMatch(/boxDeskIds/)
    expect(outlines).toMatch(/<DeskBoxSelect floorId=\{floorId\} \/>/)
    expect(logic).not.toMatch(/from 'three-stdlib'|from '@react-three\/drei/)
    expect(drei).toMatch(/SelectionBox/)
    expect(drei).toMatch(/event\.shiftKey/)
    expect(drei).toMatch(/controls\.enabled = false/)
    expect(selectionBox).not.toMatch(/instanceMatrix|getMatrixAt|isInstancedMesh/)
    const eager = [
      '../../components/Scene.tsx',
      '../../components/Stage.tsx',
      '../../App.tsx',
      '../../main.tsx',
      '../../components/scene/postfx/balancedFx.tsx',
      './FloorStage.tsx',
      './prefetchLazyChunks.ts',
      '../../components/scene/CameraRig.tsx',
    ]
    for (const file of eager) {
      const source = read(file)
      expect(source).not.toMatch(/DeskBoxSelect|boxSelect|web\/Select/)
    }
    const pkg = JSON.parse(read('../../../package.json')) as { dependencies: Record<string, string> }
    expect(pkg.dependencies['three-stdlib']).toBeUndefined()
    expect(pkg.dependencies['@react-three/drei']).toBe('10.7.9')
  })
})
