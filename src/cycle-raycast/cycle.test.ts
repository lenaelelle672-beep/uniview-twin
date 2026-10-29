import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CYCLE_SOURCE_BLOCK } from '../../scripts/cycleRaycastPlugin'
import { FOG_DENSITY } from '../scene/fog'
import { shouldSuspendCameraDrag } from '../scene/stage/boxSelect'
import { USER_CAMERA_SMOOTH_TIME } from '../scene/stage/cameraTransition'
import {
  CYCLE_KEY_CODE,
  CYCLE_SCROLL,
  cycleBlockReason,
  cycleFlag,
  cycleHoldsFilter,
  cycleScopeEnabled,
  focusAt,
  focusOfHit,
  hitIdentity,
  hitsChanged,
  pointerOnCanvas,
  sidebarFocusPatch,
  uuidSetChanged,
  type CycleActivity,
  type CycleHit,
  type CycleObject,
} from './policy'
import { noteCycle, resetCycleSessionForTests, setCycleFlags } from './session'

const here = dirname(fileURLToPath(import.meta.url))

function read(path: string): string {
  return readFileSync(join(here, path), 'utf8')
}

function node(name: string, uuid: string, userData: Record<string, unknown> = {}, parent?: CycleObject): CycleObject {
  return { uuid, name, userData, parent }
}

const idle: CycleActivity = { dragging: false, pointerDown: false, boxSelecting: false, pointerOnCanvas: true }

describe('密叠轮询开关', () => {
  it('默认关，DEMO 或密模层才开，地址和本页按钮可以盖过', () => {
    expect(cycleScopeEnabled(null, '', '', { demo: false, dense: false })).toBe(false)
    expect(cycleScopeEnabled(null, '?q=balanced', '', { demo: false, dense: false })).toBe(false)
    expect(cycleScopeEnabled(null, '?demoEdit=1', '', { demo: true, dense: false })).toBe(true)
    expect(cycleScopeEnabled(null, '', '?demoEdit=1', { demo: true, dense: false })).toBe(true)
    expect(cycleScopeEnabled(null, '?style=model', '', { demo: false, dense: true })).toBe(true)
    expect(cycleScopeEnabled(null, '?cycle=1', '', { demo: false, dense: false })).toBe(true)
    expect(cycleScopeEnabled(null, '', 'http://localhost/?cycle=1', { demo: false, dense: false })).toBe(true)
    expect(cycleScopeEnabled(null, '?cycle=0', '', { demo: true, dense: true })).toBe(false)
    expect(cycleScopeEnabled(null, '?cycle=10', '', { demo: false, dense: false })).toBe(false)
    expect(cycleScopeEnabled(false, '?cycle=1', '', { demo: true, dense: true })).toBe(false)
    expect(cycleScopeEnabled(true, '?cycle=0', '', { demo: false, dense: false })).toBe(true)
    expect(cycleFlag('?cycle=1')).toBe('on')
    expect(cycleFlag('?cycle=0')).toBe('off')
    expect(cycleFlag('?q=balanced')).toBeNull()
    expect(CYCLE_KEY_CODE).toBe(9)
    expect(CYCLE_SCROLL).toBe(false)
  })
})

describe('嵌套实例命中', () => {
  it('同一网格的实例按 instanceId 分开，不按 uuid 折成一次焦点', () => {
    const mesh = node('WorkstationDesks', 'desks')
    const knob = node('DeskKnob', 'knob', {}, mesh)
    const first: CycleHit[] = [
      { object: knob, instanceId: 1 },
      { object: knob, instanceId: 6 },
    ]
    const second: CycleHit[] = [
      { object: knob, instanceId: 2 },
      { object: knob, instanceId: 8 },
    ]
    expect(hitIdentity(first[0]!)).toBe('knob#1')
    expect(hitIdentity(first[1]!)).toBe('knob#6')
    expect(hitIdentity(first[0]!)).not.toBe(hitIdentity(first[1]!))
    expect(uuidSetChanged(first, second)).toBe(false)
    expect(hitsChanged(first, second)).toBe(true)
    expect(focusAt(first, 0, 'F12')).toMatchObject({ deskId: 'F12-2', deviceId: null, instanceId: 1, layer: 'dense' })
    expect(focusAt(first, 1, 'F12')).toMatchObject({ deskId: 'F12-7', deviceId: null, instanceId: 6, layer: 'dense' })
    expect(focusAt(first, 2, 'F12')?.deskId).toBe('F12-2')
    expect(focusAt(second, 0, 'F12')?.deskId).toBe('F12-3')
    expect(focusAt(second, 1, 'F12')?.deskId).toBe('F12-9')
    const floorGroup = node('DenseModels', 'floor', { deskId: 'F12-1', dense: true })
    const nestedDesks = node('WorkstationDesks', 'nested-desks', {}, floorGroup)
    const nestedKnob = node('DeskKnob', 'nested-knob', {}, nestedDesks)
    expect(focusAt([{ object: nestedKnob, instanceId: 4 }], 0, 'F12')?.deskId).toBe('F12-5')
    const monitor = node('WorkstationMonitors', 'mon')
    expect(focusOfHit({ object: monitor, instanceId: 0 }, 'F3')).toMatchObject({
      deskId: 'F3-1',
      deviceId: 'F3-1-PC',
      layer: 'dense',
    })
    expect(focusAt(first, 0, null)).toBeNull()
  })

  it('嵌套子节点用自己的编号，父级组的编号留给没有实例序号的一层', () => {
    const group = node('DenseModels', 'group', { deskId: 'F18-4', deviceId: 'F18-4-PC', dense: true })
    const child = node('Panel', 'panel', {}, group)
    expect(focusAt([{ object: child }], 0, 'F18')).toMatchObject({
      deskId: 'F18-4',
      deviceId: 'F18-4-PC',
      instanceId: null,
      layer: 'dense',
    })
    const demo = node('DemoDense', 'demo', { cycleLayer: 'demo' })
    const device = node('Mesh', 'cam', { deskId: 'F1-1', deviceId: 'CAM-1' }, demo)
    expect(focusAt([{ object: device, instanceId: 4 }], 0, 'F1')).toMatchObject({
      deskId: 'F1-1',
      deviceId: 'CAM-1',
      instanceId: 4,
      layer: 'demo',
    })
    const shell = node('FloorShell-F12', 'shell')
    expect(focusAt([{ object: shell }, { object: child }], 0, 'F12')).toBeNull()
    expect(focusAt([{ object: shell }, { object: child }], 1, 'F12')?.deskId).toBe('F18-4')
  })

  it('框选代理和拖摆手柄不写侧栏', () => {
    const mesh = node('WorkstationDesks', 'desks')
    const proxy = node('DeskPickProxy', 'proxy', { boxPickProxy: true, deskId: 'F12-1' }, mesh)
    const handle = node('DragDevice', 'drag', { dragPlacement: true, deskId: 'F12-2' })
    expect(focusOfHit({ object: proxy, instanceId: 0 }, 'F12')).toBeNull()
    expect(focusOfHit({ object: handle }, 'F12')).toBeNull()
    const tree = node('Leaves', 'tree', { dense: true })
    expect(focusOfHit({ object: tree }, null)).toBeNull()
    const current = { focusedDeskId: 'F12-1', focusedDeviceId: null }
    const focus = focusAt([{ object: node('WorkstationChairs', 'chairs'), instanceId: 2 }], 0, 'F12')
    const patch = sidebarFocusPatch(focus, current)
    expect(patch).toEqual({ focusedDeskId: 'F12-3', focusedDeviceId: null })
    expect(Object.keys(patch ?? {})).toEqual(['focusedDeskId', 'focusedDeviceId'])
    expect(sidebarFocusPatch(focus, { focusedDeskId: 'F12-3', focusedDeviceId: null })).toBeNull()
    expect(sidebarFocusPatch(null, current)).toBeNull()
  })
})

describe('输入划界', () => {
  it('Tab 在画布上才轮询，Shift、拖摆、镜头按下和输入框让路', () => {
    const canvas = { tagName: 'CANVAS' }
    expect(cycleBlockReason({ key: 'Tab', target: canvas }, idle)).toBeNull()
    expect(cycleBlockReason({ keyCode: 9, target: canvas }, idle)).toBeNull()
    expect(cycleBlockReason({ key: 'Tab', shiftKey: true, target: canvas }, idle)).toBe('modifier')
    expect(cycleBlockReason({ key: 'Tab', altKey: true, target: canvas }, idle)).toBe('modifier')
    expect(cycleBlockReason({ key: 'Tab', ctrlKey: true, target: canvas }, idle)).toBe('modifier')
    expect(cycleBlockReason({ key: 'Tab', metaKey: true, target: canvas }, idle)).toBe('modifier')
    expect(cycleBlockReason({ key: 'Tab', repeat: true, target: canvas }, idle)).toBe('repeat')
    expect(cycleBlockReason({ key: 'Enter', target: canvas }, idle)).toBe('key')
    expect(cycleBlockReason({ key: 'Tab', target: canvas }, { ...idle, dragging: true })).toBe('drag')
    expect(cycleBlockReason({ key: 'Tab', target: canvas }, { ...idle, boxSelecting: true })).toBe('box')
    expect(cycleBlockReason({ key: 'Tab', target: canvas }, { ...idle, pointerDown: true })).toBe('camera')
    expect(cycleBlockReason({ key: 'Tab', target: { tagName: 'INPUT' } }, idle)).toBe('field')
    expect(cycleBlockReason({ key: 'Tab', target: { tagName: 'BUTTON' } }, idle)).toBe('field')
    expect(cycleBlockReason({ key: 'Tab', target: { isContentEditable: true } }, idle)).toBe('field')
    expect(cycleBlockReason({ key: 'Tab', target: { tagName: 'SPAN', closest: () => ({}) } }, idle)).toBe('field')
    expect(cycleBlockReason({ key: 'Tab', target: { tagName: 'BODY' } }, { ...idle, pointerOnCanvas: false })).toBe('away')
    expect(cycleBlockReason({ key: 'Tab', target: { tagName: 'BODY' } }, idle)).toBeNull()
    expect(cycleHoldsFilter({ dragging: false, boxSelecting: false })).toBe(false)
    expect(cycleHoldsFilter({ dragging: true, boxSelecting: false })).toBe(true)
    expect(cycleHoldsFilter({ dragging: false, boxSelecting: true })).toBe(true)
    const canvasNode = {}
    expect(pointerOnCanvas(canvasNode, canvasNode)).toBe(true)
    expect(pointerOnCanvas({}, canvasNode)).toBe(false)
    expect(pointerOnCanvas(null, canvasNode)).toBe(false)
    const event = { shiftKey: true, button: 0, target: canvasNode }
    expect(shouldSuspendCameraDrag(event, canvasNode)).toBe(true)
    expect(cycleBlockReason({ key: 'Tab', shiftKey: true, target: canvas }, idle)).toBe('modifier')
  })

  it('探针关了就清掉命中，不把侧栏焦点写进会话以外的字段', () => {
    const host = globalThis as { window?: Window }
    const prior = host.window
    host.window = globalThis as unknown as Window
    resetCycleSessionForTests()
    setCycleFlags({ on: true, mounted: true })
    noteCycle(2, 1, { deskId: 'F12-2', deviceId: null, instanceId: 1, layer: 'dense', key: 'knob#1' })
    expect(host.window.__twinCycle).toMatchObject({
      on: true,
      mounted: true,
      armed: true,
      keyCode: 9,
      scroll: false,
      hits: 2,
      cycle: 1,
      deskId: 'F12-2',
      hold: false,
    })
    setCycleFlags({ on: false })
    expect(host.window.__twinCycle).toMatchObject({ on: false, mounted: false, armed: false, hits: 0, deskId: null })
    resetCycleSessionForTests()
    if (prior === undefined) delete host.window
    else host.window = prior
  })
})

describe('轮询分包', () => {
  it('懒挂在 dock 哈希之后，不进首屏，不改雾和 T032，也不升 drei', () => {
    expect(USER_CAMERA_SMOOTH_TIME).toBe(0.42)
    expect(FOG_DENSITY.day).toBe(0.00112)
    expect(FOG_DENSITY.night).toBe(0.00096)

    const dock = read('../viewmarks/dock.tsx')
    const mount = read('./mount.ts')
    const live = read('./CycleLayer.tsx')
    const plan = read('./policy.ts')
    const session = read('./session.ts')
    const plugin = read('../../scripts/cycleRaycastPlugin.ts')
    const vite = read('../../vite.config.ts')
    const box = read('../scene/stage/boxSelect.ts')
    const desks = read('../scene/stage/DeskBoxSelect.tsx')
    const rig = read('../components/scene/CameraRig.tsx')
    const drag = read('../drag-placement/PlacementDrag.tsx')
    const bounds = read('../scene/pick/meshBoundsPolicy.ts')
    const pkg = JSON.parse(read('../../package.json')) as {
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
    }

    expect(dock).toContain(CYCLE_SOURCE_BLOCK.trimEnd())
    expect(dock).toMatch(/import\('\.\.\/cycle-raycast\/mount'\)/)
    expect(dock).toMatch(/mountCycleRaycast\(\)/)
    expect(dock).not.toMatch(/from '\.\.\/cycle-raycast\/mount'/)
    expect(dock).not.toMatch(/demoEdit/)
    expect(plugin).toContain(CYCLE_SOURCE_BLOCK)
    expect(plugin).toMatch(/name: 'cycle-raycast-after-hash'/)
    expect(plugin).toMatch(/apply: 'build'/)
    expect(plugin).toMatch(/assets\/CycleMount\.js/)
    expect(plugin).toMatch(/assets\/CycleRaycast\.js/)
    expect(vite).toMatch(/cycleRaycastAfterHash/)

    expect(mount).toMatch(/import\('\.\/CycleLayer'\)/)
    expect(mount).not.toMatch(/import \{ CycleLayer \}/)
    expect(mount).not.toMatch(/@react-three|from 'three'|focusDevice/)
    expect(mount).toMatch(/presentation === 'model'/)
    expect(mount).toMatch(/authorModeOn/)
    expect(mount).toMatch(/dataset\.layer = 'cycleRaycast'/)
    expect(mount).toMatch(/__cycleBridge/)
    expect(live).toMatch(/from '@react-three\/drei\/web\/CycleRaycast'/)
    expect(live).not.toMatch(/from '@react-three\/drei'['"]/)
    expect(live).toMatch(/<CycleRaycast/)
    expect(live).toMatch(/keyCode=\{CYCLE_KEY_CODE\}/)
    expect(live).toMatch(/scroll=\{CYCLE_SCROLL\}/)
    expect(live).toMatch(/preventDefault/)
    expect(live).toMatch(/stopImmediatePropagation/)
    expect(live).toMatch(/focusedDeskId/)
    expect(live).not.toMatch(/focusDevice|focusSeq|smoothTime|FogExp2/)
    expect(plan).not.toMatch(/@react-three|from 'three'|FogExp2|workstationPosition/)
    expect(session).not.toMatch(/@react-three|from 'three'|focusDevice|FogExp2/)
    expect(box).not.toMatch(/cycle-raycast|CycleRaycast|mountCycleRaycast/)
    expect(desks).not.toMatch(/CycleRaycast|cycle-raycast/)
    expect(rig).toMatch(/makeDefault/)
    expect(rig).not.toMatch(/CycleRaycast|cycle-raycast/)
    expect(drag).not.toMatch(/CycleRaycast|cycle-raycast/)
    expect(bounds).not.toMatch(/CycleRaycast|cycle-raycast/)

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
      expect(read(file), file).not.toMatch(/CycleRaycast|cycle-raycast|mountCycleRaycast/)
    }

    expect(pkg.dependencies['@react-three/drei']).toBe('10.7.9')
    expect(pkg.dependencies.three).toBe('0.186.1')
    expect(pkg.dependencies['@react-three/fiber']).toBe('9.8.1')
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
    expect(pkg.devDependencies['@react-three/drei']).toBeUndefined()
  })
})
