import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { USER_CAMERA_SMOOTH_TIME } from '../scene/stage/cameraTransition'
import { resetTwinStore, useTwinStore } from '../store/store'
import { plaqueLayerOn, plaquesWanted } from './plaqueGate'
import {
  PLAQUE_COUNT,
  PLAQUE_LIFT,
  cameraSampleMoved,
  plaquesForFloor,
  type CameraSample,
} from './plaqueSpots'

const here = dirname(fileURLToPath(import.meta.url))

function read(relative: string): string {
  return readFileSync(join(here, relative), 'utf8')
}

const pose = (patch: Partial<CameraSample> = {}): CameraSample => ({
  px: 0,
  py: 0,
  pz: 0,
  qx: 0,
  qy: 0,
  qz: 0,
  qw: 1,
  ...patch,
})

afterEach(() => {
  resetTwinStore()
})

describe('铭牌开关', () => {
  it('默认关，单层里图层或 demoEdit=1 才开', () => {
    expect(plaqueLayerOn(undefined)).toBe(false)
    expect(plaqueLayerOn(null)).toBe(false)
    expect(plaqueLayerOn({})).toBe(false)
    expect(plaqueLayerOn({ plaques: false })).toBe(false)
    expect(plaqueLayerOn({ plaques: true })).toBe(true)
    expect(plaquesWanted('building', { plaques: true }, '')).toBe(false)
    expect(plaquesWanted('floor', {}, '')).toBe(false)
    expect(plaquesWanted('floor', { plaques: false }, '?demoEdit=0')).toBe(false)
    expect(plaquesWanted('floor', { plaques: true }, '')).toBe(true)
    expect(plaquesWanted('floor', {}, '?demoEdit=1')).toBe(true)
    expect(plaquesWanted('floor', { plaques: false }, '?q=balanced&demoEdit=1')).toBe(true)
    expect(plaquesWanted('blueprint', {}, '?demoEdit=1')).toBe(false)

    expect(useTwinStore.getState().layers).not.toHaveProperty('plaques')
    expect(plaqueLayerOn(useTwinStore.getState().layers)).toBe(false)
    useTwinStore.getState().setLayer('plaques', true)
    expect(plaqueLayerOn(useTwinStore.getState().layers)).toBe(true)
    expect(useTwinStore.getState().layers.badges).toBe(true)
    useTwinStore.getState().setLayer('plaques', false)
    expect(plaqueLayerOn(useTwinStore.getState().layers)).toBe(false)
  })

  it('每层三块，挨着演示锚点但不是圆标高度', () => {
    expect(PLAQUE_COUNT).toBe(3)
    expect(PLAQUE_LIFT).toBeGreaterThan(1.88)
    const tower = plaquesForFloor('F12')
    const basement = plaquesForFloor('B1')
    expect(tower).toHaveLength(PLAQUE_COUNT)
    expect(basement).toHaveLength(PLAQUE_COUNT)
    expect(tower.map((plaque) => plaque.label)).toEqual(['摆点', '朝向', '锚点'])
    expect(basement.map((plaque) => plaque.id)).toEqual(tower.map((plaque) => plaque.id))
    expect(tower).not.toBe(basement)
    expect(plaquesForFloor('F3')).toBe(tower)
    expect(tower.some((plaque) => plaque.x === -20.5 && plaque.z === 3.2)).toBe(false)
  })

  it('镜头静止不续帧，位移或转向才算动', () => {
    const still = pose()
    expect(cameraSampleMoved(null, still)).toBe(true)
    expect(cameraSampleMoved(still, pose())).toBe(false)
    expect(cameraSampleMoved(still, pose({ px: 1e-6 }))).toBe(false)
    expect(cameraSampleMoved(still, pose({ pz: 0.02 }))).toBe(true)
    expect(cameraSampleMoved(still, pose({ qy: 0.01 }))).toBe(true)
    expect(cameraSampleMoved(still, pose({ qw: 0.999 }))).toBe(true)
  })
})

describe('铭牌分包', () => {
  it('Billboard 只在过了门的懒包里，默认路径和圆标、聚焦卡都不碰', () => {
    const loop = read('../components/scene/DemandLoop.tsx')
    const live = read('./DemoPlaques.tsx')
    const gate = read('./plaqueGate.ts')
    const spots = read('./plaqueSpots.ts')
    const panel = read('../viewmarks/LayerPanel.tsx')
    const view = read('../store/viewSlice.ts')
    const badges = read('../scene/stage/DeviceBadges.tsx')
    const card = read('../scene/focusFloat/FocusFloatCard.tsx')
    const host = read('../scene/focusFloat/FocusFloatHost.tsx')
    const fx = read('../components/scene/postfx/balancedFx.tsx')
    const fog = read('../scene/fog.ts')
    const transition = read('../scene/stage/cameraTransition.ts')
    const pkg = JSON.parse(read('../../package.json')) as {
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
    }

    expect(USER_CAMERA_SMOOTH_TIME).toBe(0.42)
    expect(transition).toMatch(/USER_CAMERA_SMOOTH_TIME = 0\.42/)
    expect(fog).toMatch(/day: 0\.00112/)
    expect(fog).toMatch(/night: 0\.00096/)

    expect(view).toMatch(/LayerToggleKey = LayerKey \| 'wireframe' \| 'plaques'/)
    expect(view).not.toMatch(/plaques:\s*(true|false)/)
    expect(panel).toMatch(/\['plaques', '铭牌'\]/)
    expect(panel).not.toMatch(/@react-three|Billboard|FogExp2/)
    expect(loop).toMatch(/PLAQUE_AFTER_FIRST_MS = 2600/)
    expect(loop).toMatch(/plaquesWanted/)
    expect(loop).toMatch(/import\('\.\.\/\.\.\/demo-edit\/DemoPlaques'\)/)
    expect(loop).not.toMatch(/from ['"][^'"]*DemoPlaques/)
    expect(loop).not.toMatch(/@react-three\/drei\/core\/Billboard/)
    expect(loop).not.toMatch(/<Billboard/)
    const plaqueHost = loop.slice(loop.indexOf('function DemoPlaqueHost'), loop.indexOf('function WireframeHost'))
    expect(plaqueHost.indexOf('if (!want) return')).toBeGreaterThan(-1)
    expect(plaqueHost.indexOf('if (!want) return')).toBeLessThan(
      plaqueHost.indexOf("import('../../demo-edit/DemoPlaques')"),
    )
    expect(plaqueHost.indexOf('PLAQUE_AFTER_FIRST_MS')).toBeLessThan(
      plaqueHost.indexOf("import('../../demo-edit/DemoPlaques')"),
    )
    expect(plaqueHost.indexOf("view === 'floor'")).toBeLessThan(plaqueHost.indexOf("import('../../demo-edit/DemoPlaques')"))

    expect(live).toMatch(/@react-three\/drei\/core\/Billboard/)
    expect(live).not.toMatch(/from '@react-three\/drei'['"]/)
    expect(live).toMatch(/<Billboard/)
    expect(live).toMatch(/follow/)
    expect(live).toMatch(/name="DemoPlaques"/)
    expect(live).toMatch(/addEventListener\('update', kick\)/)
    expect(live).toMatch(/addEventListener\('control', kick\)/)
    expect(live).toMatch(/cameraSampleMoved/)
    expect(live).toMatch(/invalidate\(\)/)
    expect(live).toMatch(/three\/src\/textures\/CanvasTexture\.js/)
    expect(live).not.toMatch(/import \{[^}]*CanvasTexture[^}]*\} from 'three'/)
    expect(live).not.toMatch(/<Html[\s>]|FocusFloat|DeviceBadges|instancedMesh/)
    expect(live).not.toMatch(/FogExp2|balancedFx|smoothTime|SoftShadows|Vignette|transmission|Reflector/)
    expect(gate).not.toMatch(/@react-three|from 'three'|FogExp2|balancedFx|smoothTime|plaqueSpots|DemoPlaques/)
    expect(spots).not.toMatch(/@react-three|from 'three'|FogExp2|balancedFx|smoothTime|DemandLoop|plaqueGate/)
    expect(live).not.toMatch(/plaqueGate/)

    expect(badges).toMatch(/<instancedMesh/)
    expect(badges).not.toMatch(/Billboard/)
    expect(card).toMatch(/<Html/)
    expect(card).not.toMatch(/Billboard/)
    expect(host).not.toMatch(/Billboard|DemoPlaques/)
    expect(fx).not.toMatch(/Billboard|DemoPlaques|plaques/)

    const eager = [
      '../components/Scene.tsx',
      '../components/Stage.tsx',
      '../App.tsx',
      '../main.tsx',
      '../scene/stage/prefetchLazyChunks.ts',
      '../scene/stage/FloorStage.tsx',
      '../scene/stage/floorDecor.tsx',
      '../components/scene/CameraRig.tsx',
      '../components/scene/BalancedSoftShadows.tsx',
      '../scene/groundTextures.ts',
    ]
    for (const file of eager) {
      expect(read(file), file).not.toMatch(/DemoPlaques|plaqueGate|core\/Billboard/)
    }

    expect(pkg.dependencies['@react-three/drei']).toBe('10.7.9')
    expect(pkg.dependencies['@react-three/fiber']).toBe('9.8.1')
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
