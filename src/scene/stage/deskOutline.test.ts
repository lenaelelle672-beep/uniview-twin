import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createMockData } from '../../data/mockData'
import { hydrateFloorFromDisk } from '../../floors/hydrateForTests'
import type { Device } from '../../types'
import { DEPTH_PROXY_LAYER, MONITOR_LAYER } from '../overlayOrder'
import { PICK_VOLUME_LAYER } from '../pickLayers'
import { deskGeometry, monitorGeometry } from './geometry'
import { workstationPosition } from './workstationPosition'
import {
  ALARM_OUTLINE_COLOR,
  DESK_OUTLINE_COLOR,
  DESK_OUTLINE_THICKNESS,
  MULTI_OUTLINE_CAP,
  OUTLINE_CARRIER_LAYER,
  BOX_OUTLINE_COLOR,
  SEARCH_OUTLINE_COLOR,
  SEARCH_OUTLINE_HIT_LIMIT,
  deskOutlinePose,
  deviceOutlinePose,
  focusedOutlineShells,
  multiOutlineShells,
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
      const multi = source.indexOf('<FloorMultiOutlines')
      const outlines = source.indexOf('<FocusedDeskOutlines')
      expect(desks).toBeGreaterThan(-1)
      expect(multi).toBeGreaterThan(desks)
      expect(outlines).toBeGreaterThan(multi)
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

  it('预构建室内同样挂多描边和聚焦描边', () => {
    const source = read('../../floors/JsonFloorInterior.tsx')
    const prebuilt = source.indexOf('function PrebuiltFloorInterior')
    const primitive = source.indexOf('<primitive object={prebuilt.content}', prebuilt)
    const multi = source.indexOf('<FloorMultiOutlines', primitive)
    const focus = source.indexOf('<FocusedDeskOutlines', primitive)
    expect(prebuilt).toBeGreaterThan(-1)
    expect(primitive).toBeGreaterThan(prebuilt)
    expect(multi).toBeGreaterThan(primitive)
    expect(focus).toBeGreaterThan(multi)
  })
})

describe('进层告警和搜索多描边', () => {
  it('封顶 12，告警红和搜索琥珀都避开聚焦青', () => {
    expect(MULTI_OUTLINE_CAP).toBe(12)
    expect(SEARCH_OUTLINE_HIT_LIMIT).toBe(10)
    expect(ALARM_OUTLINE_COLOR).toBe('#ff4d4f')
    expect(DESK_OUTLINE_COLOR).toBe('#3df0ff')
    expect(SEARCH_OUTLINE_COLOR).toBe('#faad14')
    expect(new Set([ALARM_OUTLINE_COLOR, DESK_OUTLINE_COLOR, SEARCH_OUTLINE_COLOR]).size).toBe(3)
  })

  it('只描本层电脑告警，打印机摄像头和电话单独告警不造网格', () => {
    const devices = [
      device({ id: 'F12-2-PC', type: 'pc', deskId: 'F12-2', status: 'alarm' }),
      device({ id: 'F12-2-PC-dup', type: 'pc', deskId: 'F12-2', status: 'alarm' }),
      device({ id: 'F12-10-PC', type: 'pc', deskId: 'F12-10', status: 'alarm' }),
      device({ id: 'F12-10-PH', type: 'phone', deskId: 'F12-10', status: 'alarm' }),
      device({ id: 'F11-1-PC', type: 'pc', deskId: 'F11-1', floorId: 'F11', status: 'alarm' }),
      device({ id: 'F12-4-PC', type: 'pc', deskId: 'F12-4', status: 'online' }),
      device({ id: 'F12-4-PH', type: 'phone', deskId: 'F12-4', status: 'alarm' }),
      device({ id: 'F12-PR1', type: 'printer', status: 'alarm' }),
      device({ id: 'F12-CAM', type: 'camera', deskId: 'F12-1', status: 'alarm' }),
      device({ id: 'F12-missing-PC', type: 'pc', deskId: 'F12-9999', status: 'alarm' }),
    ]
    const shells = multiOutlineShells('F12', devices, [], null)
    expect(shells.map((shell) => shell.deskId)).toEqual(['F12-2', 'F12-10'])
    expect(shells.every((shell) => shell.name === 'AlarmOutline' && shell.geometry === deskGeometry)).toBe(true)
    expect(shells.every((shell) => shell.color === ALARM_OUTLINE_COLOR)).toBe(true)
    expect(multiOutlineShells('F12', [], [], null)).toEqual([])
  })

  it('搜索命中接在告警后面，共用封顶；清空搜索就没有搜索壳', () => {
    const devices = Array.from({ length: 11 }, (_, index) =>
      device({
        id: `F12-${index + 1}-PC`,
        type: 'pc',
        deskId: `F12-${index + 1}`,
        status: 'alarm',
      }),
    )
    const hits = [
      { deskId: 'F12-1', floorId: 'F12' },
      { deskId: 'F12-40', floorId: 'F12' },
      { deskId: 'F12-30', floorId: 'F12' },
      { deskId: 'F12-30', floorId: 'F12' },
      { deskId: 'F11-3', floorId: 'F11' },
      { deskId: 'F12-9999', floorId: 'F12' },
    ]
    const mixed = multiOutlineShells('F12', devices, hits, null)
    expect(mixed).toHaveLength(MULTI_OUTLINE_CAP)
    expect(mixed.filter((shell) => shell.name === 'AlarmOutline')).toHaveLength(11)
    expect(mixed.filter((shell) => shell.name === 'SearchOutline').map((shell) => shell.deskId)).toEqual(['F12-40'])
    expect(mixed.at(-1)?.color).toBe(SEARCH_OUTLINE_COLOR)

    const searchOnly = multiOutlineShells(
      'F12',
      devices.map((item) => ({ ...item, status: 'online' as const })),
      hits,
      null,
    )
    expect(searchOnly.map((shell) => [shell.deskId, shell.name])).toEqual([
      ['F12-1', 'SearchOutline'],
      ['F12-40', 'SearchOutline'],
      ['F12-30', 'SearchOutline'],
    ])
    expect(multiOutlineShells('F12', devices, [], null).every((shell) => shell.name === 'AlarmOutline')).toBe(true)
  })

  it('超过 12 个告警时搜索让位，聚焦工位不占多描边名额', () => {
    const devices = Array.from({ length: 14 }, (_, index) =>
      device({
        id: `F12-${index + 1}-PC`,
        type: 'pc',
        deskId: `F12-${index + 1}`,
        status: 'alarm' as const,
      }),
    )
    const capped = multiOutlineShells('F12', devices, [{ deskId: 'F12-40', floorId: 'F12' }], 'F12-2')
    expect(capped).toHaveLength(MULTI_OUTLINE_CAP)
    expect(capped.map((shell) => shell.deskId)).not.toContain('F12-2')
    expect(capped.map((shell) => shell.deskId)).not.toContain('F12-40')
    expect(capped.every((shell) => shell.name === 'AlarmOutline')).toBe(true)
    expect(capped.map((shell) => shell.deskId)).toContain('F12-13')
    expect(capped.map((shell) => shell.deskId)).not.toContain('F12-14')

    const focus = focusedOutlineShells('F12', 'F12-2', 'F12-2-PC', devices)
    expect(focus.map((shell) => shell.name)).toEqual(['DeskOutline', 'DeviceOutline'])
    expect(multiOutlineShells('F12', devices.slice(0, 1), [], 'F12-1')).toEqual([])
  })

  it('样例楼层的告警工位落在封顶内，而且都是本层电脑', () => {
    const data = createMockData()
    const shells = multiOutlineShells('F12', data.devices, [], null)
    expect(shells.length).toBeGreaterThan(0)
    expect(shells.length).toBeLessThanOrEqual(MULTI_OUTLINE_CAP)
    for (const shell of shells) {
      const pc = data.devices.find((item) => item.deskId === shell.deskId && item.type === 'pc')
      expect(pc?.floorId).toBe('F12')
      expect(pc?.status).toBe('alarm')
      expect(shell.geometry).toBe(deskGeometry)
    }
  })

  it('回放工位表只替换告警来源，封顶、颜色和搜索让位不变', () => {
    const devices = [
      device({ id: 'F12-1-PC', type: 'pc', deskId: 'F12-1', status: 'online' }),
      device({ id: 'F12-8-PC', type: 'pc', deskId: 'F12-8', status: 'online' }),
      device({ id: 'F12-3-PC', type: 'pc', deskId: 'F12-3', status: 'alarm' }),
      device({ id: 'F12-20-PC', type: 'pc', deskId: 'F12-20', status: 'online' }),
    ]
    expect(multiOutlineShells('F12', devices, [], null).map((shell) => shell.deskId)).toEqual(['F12-3'])
    const played = multiOutlineShells(
      'F12',
      devices,
      [{ deskId: 'F12-20', floorId: 'F12' }],
      null,
      MULTI_OUTLINE_CAP,
      ['F12-8', 'F12-1', 'F12-1', 'F11-1'],
    )
    expect(played.map((shell) => [shell.deskId, shell.name, shell.color])).toEqual([
      ['F12-1', 'AlarmOutline', ALARM_OUTLINE_COLOR],
      ['F12-8', 'AlarmOutline', ALARM_OUTLINE_COLOR],
      ['F12-20', 'SearchOutline', SEARCH_OUTLINE_COLOR],
    ])
    expect(played).toHaveLength(3)
    expect(MULTI_OUTLINE_CAP).toBe(12)
    expect(multiOutlineShells('F12', devices, [], null, MULTI_OUTLINE_CAP, [])).toEqual([])
  })

  it('多描边复用可挂 mesh 和 invalidate，不挂实例父级', () => {
    const source = read('DeskOutline.tsx')
    expect(source).toMatch(/function FloorMultiOutlines/)
    expect(source).toMatch(/searchWorkstations\(\{ desks, people \}, searchQuery, SEARCH_OUTLINE_HIT_LIMIT\)/)
    expect(source).toMatch(/multiOutlineShells\(/)
    expect(source).toMatch(/name="MultiOutlines"/)
    expect(source).toMatch(/color=\{shell\.color\}/)
    expect(source).toMatch(/delete window\.__twinMultiOutlines/)
    expect(source).toMatch(/delete window\.__twinDeskOutline/)
    expect(source).toMatch(/<Outlines/)
    expect(source).toMatch(/screenspace/)
    expect(source).toMatch(/invalidate\(\)/)
    expect(source).not.toMatch(/<instancedMesh/)
    expect(source).toMatch(/WorkstationDesks \/ WorkstationMonitors 是 InstancedMesh/)
    expect(source).not.toMatch(/<WorkstationDesks|<WorkstationMonitors/)
    expect(source).not.toMatch(/OutlinePass|@react-three\/postprocessing|Vignette/)
    expect(source).not.toMatch(/softShadows|DemandLoop|cameraRest|frameSchedule|balancedFx/)
    const logic = read('deskOutline.ts')
    expect(logic).not.toMatch(/softShadows|DemandLoop|cameraRest|frameSchedule|balancedFx|OutlinePass/)
    expect(logic).toMatch(/geometry: deskGeometry/)
    expect(logic).toMatch(/geometry: monitorGeometry/)
  })

  it('框选接在告警后面、搜索前面，告警工位保持红色', () => {
    expect(BOX_OUTLINE_COLOR).toBe('#55aaff')
    expect(new Set([ALARM_OUTLINE_COLOR, BOX_OUTLINE_COLOR, DESK_OUTLINE_COLOR, SEARCH_OUTLINE_COLOR]).size).toBe(4)
    const devices = [
      device({ id: 'F12-2-PC', type: 'pc', deskId: 'F12-2', status: 'alarm' }),
      device({ id: 'F12-4-PC', type: 'pc', deskId: 'F12-4', status: 'online' }),
      device({ id: 'F12-9-PC', type: 'pc', deskId: 'F12-9', status: 'online' }),
    ]
    const shells = multiOutlineShells(
      'F12',
      devices,
      [
        { deskId: 'F12-9', floorId: 'F12' },
        { deskId: 'F12-15', floorId: 'F12' },
      ],
      null,
      MULTI_OUTLINE_CAP,
      undefined,
      ['F12-9', 'F12-2', 'F12-4', 'F11-1', 'F12-4'],
    )
    expect(shells.map((shell) => [shell.deskId, shell.name, shell.color])).toEqual([
      ['F12-2', 'AlarmOutline', ALARM_OUTLINE_COLOR],
      ['F12-4', 'BoxOutline', BOX_OUTLINE_COLOR],
      ['F12-9', 'BoxOutline', BOX_OUTLINE_COLOR],
      ['F12-15', 'SearchOutline', SEARCH_OUTLINE_COLOR],
    ])
    expect(shells.filter((shell) => shell.deskId === 'F12-2')).toHaveLength(1)
  })

  it('告警占满 12 个名额时框选和搜索都让位', () => {
    const devices = Array.from({ length: 12 }, (_, index) =>
      device({
        id: `F12-${index + 1}-PC`,
        type: 'pc',
        deskId: `F12-${index + 1}`,
        status: 'alarm' as const,
      }),
    )
    const shells = multiOutlineShells(
      'F12',
      devices,
      [{ deskId: 'F12-20', floorId: 'F12' }],
      null,
      MULTI_OUTLINE_CAP,
      undefined,
      ['F12-1', 'F12-20', 'F12-21'],
    )
    expect(shells).toHaveLength(MULTI_OUTLINE_CAP)
    expect(shells.every((shell) => shell.name === 'AlarmOutline' && shell.color === ALARM_OUTLINE_COLOR)).toBe(true)
    expect(shells.map((shell) => shell.deskId)).not.toContain('F12-20')
    expect(shells.map((shell) => shell.deskId)).not.toContain('F12-21')
  })

  it('没有告警时框选最多 12 个，聚焦工位不占名额', () => {
    const picked = Array.from({ length: 14 }, (_, index) => `F12-${index + 1}`)
    const shells = multiOutlineShells('F12', [], [], 'F12-4', MULTI_OUTLINE_CAP, undefined, picked)
    expect(shells).toHaveLength(MULTI_OUTLINE_CAP)
    expect(shells.every((shell) => shell.name === 'BoxOutline' && shell.color === BOX_OUTLINE_COLOR)).toBe(true)
    expect(shells.map((shell) => shell.deskId)).toEqual(['F12-1', 'F12-2', 'F12-3', 'F12-5', 'F12-6', 'F12-7', 'F12-8', 'F12-9', 'F12-10', 'F12-11', 'F12-12', 'F12-13'])
    expect(shells.map((shell) => shell.deskId)).not.toContain('F12-4')
    expect(shells.map((shell) => shell.deskId)).not.toContain('F12-14')
  })

  it('回放告警名单优先于框选颜色，不在回放里的现网告警可以涂成框选色', () => {
    const devices = [
      device({ id: 'F12-3-PC', type: 'pc', deskId: 'F12-3', status: 'alarm' }),
      device({ id: 'F12-5-PC', type: 'pc', deskId: 'F12-5', status: 'online' }),
      device({ id: 'F12-8-PC', type: 'pc', deskId: 'F12-8', status: 'online' }),
    ]
    const shells = multiOutlineShells(
      'F12',
      devices,
      [],
      null,
      MULTI_OUTLINE_CAP,
      ['F12-8'],
      ['F12-3', 'F12-8', 'F12-5'],
    )
    expect(shells.map((shell) => [shell.deskId, shell.name, shell.color])).toEqual([
      ['F12-8', 'AlarmOutline', ALARM_OUTLINE_COLOR],
      ['F12-3', 'BoxOutline', BOX_OUTLINE_COLOR],
      ['F12-5', 'BoxOutline', BOX_OUTLINE_COLOR],
    ])
  })
})