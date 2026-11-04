import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { KENNEY_SEED_CAP } from '../kenney-furniture/plan'
import { composeOverlay } from '../grid/mount'
import { SOFT_SHADOW_CHUNK_AFTER_FIRST_MS } from '../scene/softShadows'
import { RADIAL_SHADOW_SOURCE_BLOCK, shadowThreeNames, stripRadialShadowSource } from '../../scripts/radialShadowPlugin'
import { applyElements, interiorElements, sameSpots, shadowSpots } from './place'
import {
  RADIAL_SHADOW_AFTER_FIRST_MS,
  RADIAL_SHADOW_CAP,
  RADIAL_SHADOW_COLOR_STOP,
  RADIAL_SHADOW_LAYERS,
  RADIAL_SHADOW_LIFT,
  RADIAL_SHADOW_OPACITY,
  RADIAL_SHADOW_POLYGON_OFFSET,
  RADIAL_SHADOW_SCALE,
  deskOnFloor,
  radialShadowChunkDue,
  radialShadowDeskIds,
  radialShadowDueLatched,
  radialShadowOptIn,
  radialShadowOptInAtBoot,
  radialShadowSearchOfUrl,
  radialShadowState,
  selectedDeskId,
  type RadialShadowGate,
} from './plan'
import { mountRadialShadow } from './mount'

const here = dirname(fileURLToPath(import.meta.url))

function read(relative: string): string {
  return readFileSync(join(here, relative), 'utf8')
}

function gate(patch: Partial<RadialShadowGate> = {}): RadialShadowGate {
  return {
    view: 'floor',
    floorId: 'F12',
    optIn: true,
    due: true,
    exploded: false,
    explodeProgress: 0,
    explodeAnimating: false,
    stationActive: false,
    stationAnimating: false,
    stationProgress: 0,
    deskCount: 8,
    ...patch,
  }
}

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

describe('落地影门闩', () => {
  it('默认关，只在单层休息姿态、工位表齐了才开', () => {
    expect(radialShadowState(gate({ optIn: false }))).toBe('off-switch')
    expect(radialShadowState(gate({ due: false }))).toBe('pending')
    expect(radialShadowState(gate({ view: 'building' }))).toBe('off-view')
    expect(radialShadowState(gate({ view: 'blueprint' }))).toBe('off-view')
    expect(radialShadowState(gate({ floorId: null }))).toBe('off-view')
    expect(radialShadowState(gate({ exploded: true }))).toBe('yield-explode')
    expect(radialShadowState(gate({ explodeProgress: 0.2 }))).toBe('yield-explode')
    expect(radialShadowState(gate({ explodeAnimating: true }))).toBe('yield-explode')
    expect(radialShadowState(gate({ stationActive: true }))).toBe('yield-station')
    expect(radialShadowState(gate({ stationProgress: 0.4 }))).toBe('yield-station')
    expect(radialShadowState(gate({ deskCount: 0 }))).toBe('off-empty')
    expect(radialShadowState(gate())).toBe('on')
  })

  it('昼夜和画质不进门闩，分包晚于首帧 2600ms', () => {
    expect(RADIAL_SHADOW_AFTER_FIRST_MS).toBe(2600)
    expect(RADIAL_SHADOW_AFTER_FIRST_MS).toBe(SOFT_SHADOW_CHUNK_AFTER_FIRST_MS)
    const first = 8_000
    expect(radialShadowChunkDue(null, first)).toBe(false)
    expect(radialShadowChunkDue(first, first + 2599)).toBe(false)
    expect(radialShadowChunkDue(first, first + 2600)).toBe(true)
    const due = radialShadowDueLatched(false, first, first + 2600)
    expect(radialShadowDueLatched(due, null, first)).toBe(true)
    expect(radialShadowState(gate())).toBe('on')
  })

  it('?radialShadow=1 才打开，启动地址里的也算', () => {
    expect(radialShadowOptIn('')).toBe(false)
    expect(radialShadowOptIn('?q=balanced')).toBe(false)
    expect(radialShadowOptIn('?radialShadow=0')).toBe(false)
    expect(radialShadowOptIn('?radialShadow=1')).toBe(true)
    expect(radialShadowOptIn('radialShadow=1&q=perf')).toBe(true)
    expect(radialShadowSearchOfUrl('http://127.0.0.1:5190/?q=balanced&radialShadow=1#floor')).toBe(
      '?q=balanced&radialShadow=1',
    )
    expect(radialShadowOptInAtBoot('?q=balanced', 'http://127.0.0.1:5190/?radialShadow=1')).toBe(true)
    expect(radialShadowOptInAtBoot('?q=balanced', 'http://127.0.0.1:5190/?q=balanced')).toBe(false)
  })
})

describe('落点', () => {
  const desks = ['F12-1', 'F12-2', 'F12-3', 'F12-4', 'F12-5', 'F12-1'].map((id) => ({ id }))

  it('只铺前几张种子桌，选中件在种子外就换掉最后一席', () => {
    expect(RADIAL_SHADOW_CAP).toBe(KENNEY_SEED_CAP)
    expect(RADIAL_SHADOW_CAP).toBe(4)
    expect(deskOnFloor('F12', 'F12-5')).toBe(true)
    expect(deskOnFloor('F1', 'F12-5')).toBe(false)
    expect(deskOnFloor('F12', 'F12-0')).toBe(false)
    expect(radialShadowDeskIds(desks, null)).toEqual(['F12-1', 'F12-2', 'F12-3', 'F12-4'])
    expect(radialShadowDeskIds(desks, 'F12-2')).toEqual(['F12-1', 'F12-2', 'F12-3', 'F12-4'])
    expect(radialShadowDeskIds(desks, 'F12-5')).toEqual(['F12-1', 'F12-2', 'F12-3', 'F12-5'])
    expect(radialShadowDeskIds(desks.slice(0, 2), 'F12-9')).toEqual(['F12-1', 'F12-2'])
    expect(radialShadowDeskIds([], 'F12-1')).toEqual([])
    expect(selectedDeskId('F12', 'F12-9', null, [])).toBe('F12-9')
    expect(selectedDeskId('F12', 'F12-9', 'F12', ['F12-3'])).toBe('F12-3')
    expect(selectedDeskId('F12', 'F12-9', 'F12', ['F12-3', 'F12-4'])).toBeNull()
    expect(selectedDeskId('F12', 'F4-1', null, [])).toBeNull()
    expect(selectedDeskId(null, 'F12-1', null, [])).toBeNull()
  })

  it('世界矩阵只读一次，抬离楼板，缺室内组就不铺', () => {
    const lifted = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 24, -3, 1]
    expect(applyElements(identity, 2, 0, -4)).toEqual({ x: 2, y: 0, z: -4 })
    const spots = shadowSpots(lifted, [{ id: 'F12-1', x: 1.5, z: 0.25 }], ['F12-1'])
    expect(spots).toEqual([{ id: 'F12-1', x: 11.5, y: 24 + RADIAL_SHADOW_LIFT, z: -2.75 }])
    expect(shadowSpots(lifted, [{ id: 'F12-1', x: 0, z: 0 }], ['F12-2'])).toBeNull()
    expect(shadowSpots(null, [{ id: 'F12-1', x: 0, z: 0 }], ['F12-1'])).toBeNull()
    expect(sameSpots(spots, spots)).toBe(true)
    expect(sameSpots(spots, null)).toBe(false)
    const host = {
      updateWorldMatrix() {
        host.calls += 1
      },
      calls: 0,
      matrixWorld: { elements: identity },
    }
    const scene = {
      getObjectByName(name: string) {
        return name === 'FloorInterior' ? host : undefined
      },
    }
    expect(interiorElements(scene)).toBe(identity)
    expect(host.calls).toBe(1)
    expect(interiorElements({ getObjectByName: () => undefined })).toBeNull()
    expect(RADIAL_SHADOW_SCALE).toBeGreaterThan(1.4)
    expect(RADIAL_SHADOW_OPACITY).toBeGreaterThan(0)
    expect(RADIAL_SHADOW_OPACITY).toBeLessThan(0.45)
    expect(RADIAL_SHADOW_COLOR_STOP).toBe(0)
    expect(RADIAL_SHADOW_LIFT).toBeGreaterThan(0)
    expect(RADIAL_SHADOW_LIFT).toBeLessThan(0.05)
    expect(RADIAL_SHADOW_POLYGON_OFFSET).toBeLessThan(-1)
    expect(RADIAL_SHADOW_POLYGON_OFFSET).toBeGreaterThan(-8)
  })
})

describe('落地影接线', () => {
  it('没有文档时挂载直接返回', () => {
    expect(() => mountRadialShadow()).not.toThrow()
  })

  it('Shadow 懒挂在 dock 哈希之后，不进首屏，也不进 balancedFx', () => {
    const dock = read('../viewmarks/dock.tsx')
    const mount = read('./mount.ts')
    const live = read('./RadialShadows.tsx')
    const plan = read('./plan.ts')
    const place = read('./place.ts')
    const probe = read('./probe.ts')
    const plugin = read('../../scripts/radialShadowPlugin.ts')
    const vite = read('../../vite.config.ts')
    const grid = read('../grid/mount.ts')
    const shadowJs = read('../../node_modules/@react-three/drei/core/Shadow.js')
    const pkg = JSON.parse(read('../../package.json')) as { dependencies: Record<string, string> }
    const fx = read('../components/scene/postfx/balancedFx.tsx')
    const soft = read('../components/scene/BalancedSoftShadows.tsx')

    expect(dock).toContain(RADIAL_SHADOW_SOURCE_BLOCK)
    expect(dock).toMatch(/mod\.mountResizeFit\(\)\n\}\)\n\/\/ T120：/)
    const stripped = stripRadialShadowSource(dock)
    expect(stripped).toMatch(/mod\.mountResizeFit\(\)\n\}\)\n\n\/\/ T121：/)
    expect(stripped).not.toMatch(/radial-shadow|mountRadialShadow|radialShadow/)
    expect(() => stripRadialShadowSource('const dock = 1')).toThrow()
    expect(plugin).toContain(RADIAL_SHADOW_SOURCE_BLOCK)
    expect(plugin).toMatch(/name: 'radial-shadow-after-hash'/)
    expect(plugin).toMatch(/assets\/RadialShadow\.js/)
    expect(plugin).toMatch(/assets\/RadialShadows\.js/)
    expect(plugin).toMatch(/assets\/RadialShadowMount\.js/)
    expect(plugin).toMatch(/@react-three\/drei\/core\/Shadow/)
    expect(shadowThreeNames()).toEqual(['Color', 'DoubleSide'])

    const plugins = vite.slice(vite.lastIndexOf('plugins: ['))
    expect(plugins.indexOf('sensorPointsAfterHash()')).toBeGreaterThan(plugins.indexOf('floorPlanAfterHash()'))
    expect(plugins.indexOf('radialShadowAfterHash()')).toBeGreaterThan(plugins.indexOf('sensorPointsAfterHash()'))
    expect(plugins.indexOf('radialShadowAfterHash()')).toBeLessThan(plugins.indexOf('isolateTransformControlsLeaves()'))

    expect(grid).toMatch(/__twinRadialShadowNode/)
    expect(composeOverlay.length).toBe(3)
    expect(composeOverlay(null, null, null, null, null, null, null, null, null, null, null, null, null, null, 'shadow')).toBe(
      'shadow',
    )
    expect(composeOverlay(null, null, null, null, null, null, null, null, null, null, null, null, null, 'points')).toBe(
      'points',
    )

    expect(mount).toMatch(/import\('\.\/RadialShadows'\)/)
    expect(mount).not.toMatch(/import \{ RadialShadows \}/)
    expect(mount).not.toMatch(/@react-three|from 'three'|https?:|useFrame\(|ContactShadows|softShadows/)
    expect(mount).toMatch(/__twinRadialShadowNode/)
    expect(mount).toMatch(/radialShadowDueLatched/)
    expect(mount).toMatch(/radialShadowOptInAtBoot/)
    expect(plan).not.toMatch(/from 'three'|@react-three|https?:|useFrame\(/)
    expect(place).not.toMatch(/from 'three'|@react-three|instanceMatrix|setMatrixAt|useFrame\(/)
    expect(probe).not.toMatch(/from 'three'|@react-three|useFrame\(/)
    expect(probe).toMatch(/replacesContactShadows: false/)
    expect(probe).toMatch(/replacesSoftShadows: false/)
    expect(probe).toMatch(/balancedFx: false/)
    expect(probe).toMatch(/useFrame: false/)

    expect(live).toMatch(/from '@react-three\/drei\/core\/Shadow'/)
    expect(live).toMatch(/<Shadow/)
    expect(live).toMatch(/name="RadialShadows"/)
    expect(live).toMatch(/colorStop=\{RADIAL_SHADOW_COLOR_STOP\}/)
    expect(live).toMatch(/polygonOffsetFactor = RADIAL_SHADOW_POLYGON_OFFSET/)
    expect(live).toMatch(/fog=\{false\}/)
    expect(live).not.toMatch(/from '@react-three\/drei'['"]/)
    expect(live).not.toMatch(/useFrame\(|ContactShadows|softShadows|SoftShadows|instanceMatrix|setMatrixAt|balancedFx/)
    expect(live).not.toMatch(/https?:|githack|jsdelivr|unpkg/)
    expect(RADIAL_SHADOW_LAYERS).toEqual({
      contactShadows: 'separate',
      softShadows: 'separate',
      balancedFx: 'forbidden',
      explode: 'unmount',
      stationExplode: 'unmount',
      instancedMatrix: 'forbidden',
      furniture: 'seed-desks',
      selected: 'single-desk',
    })

    expect(shadowJs).toMatch(/createRadialGradient/)
    expect(shadowJs).toMatch(/canvasTexture/)
    expect(shadowJs).toMatch(/rotation-x/)
    expect(shadowJs).not.toMatch(/useFrame/)

    expect(fx).toMatch(/function DisposableContactShadows/)
    expect(fx).toMatch(/export function ContactGround/)
    expect(fx).not.toMatch(/radial-shadow|RadialShadow|core\/Shadow|radialShadow/)
    expect(soft).toMatch(/from '@react-three\/drei\/core\/softShadows'/)
    expect(soft).toMatch(/<SoftShadows/)
    expect(soft).not.toMatch(/radial-shadow|RadialShadow|core\/Shadow|radialShadow/)

    const eager = [
      '../components/Scene.tsx',
      '../components/Stage.tsx',
      '../App.tsx',
      '../main.tsx',
      '../components/scene/postfx/balancedFx.tsx',
      '../components/scene/DemandLoop.tsx',
      '../components/scene/BalancedSoftShadows.tsx',
      '../components/scene/ExplodedLayout.tsx',
      '../scene/softShadows.ts',
      '../scene/explode.ts',
      '../scene/fog.ts',
      '../kenney-furniture/KenneyStations.tsx',
      '../kenney-furniture/mount.ts',
      '../resize-fit/ResizeFit.tsx',
      '../sensor-points/SensorCloud.tsx',
    ]
    for (const file of eager) {
      expect(read(file), file).not.toMatch(/radial-shadow|mountRadialShadow|RadialShadows|radialShadow|core\/Shadow/)
    }

    expect(pkg.dependencies['@react-three/drei']).toBe('10.7.9')
    expect(pkg.dependencies.three).toBe('0.186.1')
    expect(pkg.dependencies['@react-three/fiber']).toBe('9.8.1')
    expect(pkg.dependencies['@react-three/postprocessing']).toBe('3.1.3')
    expect(Object.keys(pkg.dependencies).sort()).toEqual([
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
    ])
  })
})
