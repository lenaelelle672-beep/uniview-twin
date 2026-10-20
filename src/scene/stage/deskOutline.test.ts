import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { hydrateFloorFromDisk } from '../../floors/hydrateForTests'
import type { Device } from '../../types'
import { DEPTH_PROXY_LAYER, MONITOR_LAYER } from '../overlayOrder'
import { PICK_VOLUME_LAYER } from '../pickLayers'
import { deskGeometry, monitorGeometry } from './geometry'
import { workstationPosition } from './workstationPosition'
import {
  DESK_OUTLINE_COLOR,
  DESK_OUTLINE_THICKNESS,
  OUTLINE_CARRIER_LAYER,
  deskOutlinePose,
  deviceOutlinePose,
  focusedOutlineShells,
} from './deskOutline'

hydrateFloorFromDisk('F12')

const here = dirname(fileURLToPath(import.meta.url))

function read(relative: string): string {
  return readFileSync(join(here, relative), 'utf8')
}

function device(partial: Partial<Device> & Pick<Device, 'id' | 'type'>): Device {
  return {
    floorId: 'F12',
    status: 'online',
    zone: 'tower',
    ...partial,
  }
}

describe('聚焦工位 Outlines', () => {
  it('只给本层聚焦工位一个落点，取消聚焦是空', () => {
    expect(deskOutlinePose('F12', null)).toBeNull()
    expect(deskOutlinePose('F12', '')).toBeNull()
    expect(deskOutlinePose('F12', 'F11-1')).toBeNull()
    expect(deskOutlinePose('F12', 'nope')).toBeNull()

    const place = workstationPosition('F12', 'F12-66')
    expect(deskOutlinePose('F12', 'F12-66')).toEqual({ x: place.x, z: place.z, rot: place.rot })
    expect(deskOutlinePose('B1', 'B1-8')).toEqual({
      x: workstationPosition('B1', 'B1-8').x,
      z: workstationPosition('B1', 'B1-8').z,
      rot: workstationPosition('B1', 'B1-8').rot,
    })
  })

  it('电脑和电话描显示器，打印机和没有工位号的设备不挂', () => {
    const devices = [
      device({ id: 'F12-66-PC', type: 'pc', deskId: 'F12-66' }),
      device({ id: 'F12-66-PH', type: 'phone', deskId: 'F12-66' }),
      device({ id: 'F12-PR1', type: 'printer' }),
      device({ id: 'F12-CAM', type: 'camera', deskId: 'F12-1' }),
    ]
    expect(deviceOutlinePose('F12', null, devices)).toBeNull()
    expect(deviceOutlinePose('F12', 'missing', devices)).toBeNull()
    expect(deviceOutlinePose('F12', 'F12-PR1', devices)).toBeNull()
    expect(deviceOutlinePose('F12', 'F12-CAM', devices)).toBeNull()
    expect(deviceOutlinePose('F11', 'F12-66-PC', devices)).toBeNull()

    const desk = deskOutlinePose('F12', 'F12-66')
    expect(deviceOutlinePose('F12', 'F12-66-PC', devices)).toEqual(desk)
    expect(deviceOutlinePose('F12', 'F12-66-PH', devices)).toEqual(desk)
  })

  it('聚焦工位挂桌面，聚焦设备再挂显示器，取消后没有壳', () => {
    const devices = [device({ id: 'F12-66-PC', type: 'pc', deskId: 'F12-66' })]
    expect(focusedOutlineShells('F12', null, null, devices)).toEqual([])
    const deskOnly = focusedOutlineShells('F12', 'F12-66', null, devices)
    expect(deskOnly.map((shell) => shell.name)).toEqual(['DeskOutline'])
    expect(deskOnly[0]?.geometry).toBe(deskGeometry)
    const both = focusedOutlineShells('F12', 'F12-66', 'F12-66-PC', devices)
    expect(both.map((shell) => shell.name)).toEqual(['DeskOutline', 'DeviceOutline'])
    expect(both[1]?.geometry).toBe(monitorGeometry)
  })

  it('描边挂在可挂 mesh 上，demand 要 invalidate，不进实例父级', () => {
    const source = read('DeskOutline.tsx')
    expect(source).toMatch(/from '@react-three\/drei\/core\/Outlines'/)
    expect(source).toMatch(/<Outlines/)
    expect(source).toMatch(/screenspace/)
    expect(source).toMatch(/thickness=\{DESK_OUTLINE_THICKNESS\}/)
    expect(source).toMatch(/color=\{DESK_OUTLINE_COLOR\}/)
    expect(source).toMatch(/angle=\{0\}/)
    expect(source).toMatch(/geometry\.clone\(\)/)
    expect(source).toMatch(/dispose=\{null\}/)
    expect(source).toMatch(/invalidate\(\)/)
    expect(source).toMatch(/<mesh/)
    expect(source).not.toMatch(/<instancedMesh/)
    expect(source).not.toMatch(/@react-three\/postprocessing/)
    expect(DESK_OUTLINE_THICKNESS).toBeGreaterThan(0)
    expect(DESK_OUTLINE_COLOR).toMatch(/^#/)
    expect(OUTLINE_CARRIER_LAYER).not.toBe(0)
    expect(OUTLINE_CARRIER_LAYER).not.toBe(PICK_VOLUME_LAYER)
    expect(OUTLINE_CARRIER_LAYER).not.toBe(MONITOR_LAYER)
    expect(OUTLINE_CARRIER_LAYER).not.toBe(DEPTH_PROXY_LAYER)
  })

  it('落在工位网格旁边，楼层悬停和 DeskFlash 常量不动', () => {
    for (const file of ['../../floors/JsonFloorInterior.tsx', 'B1Interior.tsx', 'TowerInterior.tsx']) {
      const source = read(file)
      const desks = source.indexOf('<Workstations')
      const outlines = source.indexOf('<FocusedDeskOutlines')
      expect(desks).toBeGreaterThan(-1)
      expect(outlines).toBeGreaterThan(desks)
    }
    const flash = read('DeskFlash.tsx')
    expect(flash).toMatch(/const FLASH_MS = 3000/)
    expect(flash).toMatch(/#ff6a00/)
    expect(flash).toMatch(/#ff8a00/)
    expect(flash).not.toMatch(/Outlines/)
    const tower = readFileSync(join(here, '../../components/scene/Tower.tsx'), 'utf8')
    const leader = readFileSync(join(here, '../../components/FloorLeader.tsx'), 'utf8')
    expect(tower).not.toMatch(/Outlines/)
    expect(leader).not.toMatch(/Outlines/)
    const pkg = readFileSync(join(here, '../../../package.json'), 'utf8')
    expect(pkg).toMatch(/"@react-three\/drei": "10\.7\.9"/)
  })
})