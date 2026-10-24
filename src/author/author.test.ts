import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { USER_CAMERA_SMOOTH_TIME } from '../scene/stage/cameraTransition'
import { FOG_DENSITY } from '../scene/fog'
import { useTwinStore } from '../store/store'
import { authorModeOn, debugHelpersEnabled } from './gate'
import { setDebugHelpers } from './helpers/mount'
import { composeOverlay } from '../grid/mount'
import {
  AUTHOR_HELPER_COLOR,
  AUTHOR_HELPER_SIZE,
  AUTHOR_SHADOW_COLOR,
  authorHelperName,
  planAuthorHelpers,
} from './helpers/plan'
import { AUTHOR_HELPER_SOURCE_BLOCK } from '../../scripts/authorHelpersPlugin'

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

describe('作者门', () => {
  it('只认 demoEdit=1 或 layers.debugHelpers，默认关', () => {
    expect(authorModeOn()).toBe(false)
    expect(authorModeOn({ search: '', navigation: '' })).toBe(false)
    expect(authorModeOn({ search: '?demoEdit=1' })).toBe(true)
    expect(authorModeOn({ search: '?q=balanced&demoEdit=1' })).toBe(true)
    expect(authorModeOn({ search: 'demoEdit=1' })).toBe(true)
    expect(authorModeOn({ search: '?demoEdit=0' })).toBe(false)
    expect(authorModeOn({ search: '?demoEdit=10' })).toBe(false)
    expect(authorModeOn({ search: '?demo=1' })).toBe(false)
    expect(authorModeOn({ navigation: '?floor=F12&demoEdit=1' })).toBe(true)
    expect(debugHelpersEnabled(null)).toBe(false)
    expect(debugHelpersEnabled({})).toBe(false)
    expect(debugHelpersEnabled({ debugHelpers: false })).toBe(false)
    expect(debugHelpersEnabled({ debugHelpers: 1 })).toBe(false)
    expect(debugHelpersEnabled({ debugHelpers: true })).toBe(true)
    expect(authorModeOn({ layers: { debugHelpers: true } })).toBe(true)
    expect(authorModeOn({ search: '?q=perf', layers: { people: true } })).toBe(false)
  })

  it('debugHelpers 写在现有图层上，不改其它开关', () => {
    const before = useTwinStore.getState().layers
    setDebugHelpers(false)
    expect(useTwinStore.getState().layers).toBe(before)
    setDebugHelpers(true)
    const on = useTwinStore.getState().layers as typeof before & { debugHelpers?: boolean }
    expect(on.debugHelpers).toBe(true)
    expect(on.people).toBe(before.people)
    expect(on.edges).toBe(before.edges)
    setDebugHelpers(false)
    const off = useTwinStore.getState().layers as typeof before & { debugHelpers?: boolean }
    expect(off.debugHelpers).toBe(false)
    useTwinStore.setState({ layers: before })
  })
})

describe('辅助目标', () => {
  it('主相机、平行光、半球光和阴影相机都算，矩形面光不算', () => {
    const camera = { uuid: 'cam' }
    const shadow = { uuid: 'shadow' }
    const directional = { uuid: 'dir', isDirectionalLight: true, shadow: { camera: shadow } }
    const hemisphere = { uuid: 'hemi', isHemisphereLight: true }
    const point = { uuid: 'pt', isPointLight: true }
    const spot = { uuid: 'spot', isSpotLight: true }
    const rect = { uuid: 'rect', isRectAreaLight: true, isDirectionalLight: true, shadow: { camera: shadow } }
    const plans = planAuthorHelpers(
      {
        traverse(visit: (node: object) => void) {
          visit(hemisphere)
          visit(rect)
          visit(directional)
          visit(point)
          visit(spot)
        },
      },
      camera,
    )
    expect(plans.map((plan) => plan.kind)).toEqual([
      'camera',
      'hemisphere',
      'directional',
      'shadow',
      'point',
      'spot',
    ])
    expect(plans.some((plan) => plan.object === rect)).toBe(false)
    expect(authorHelperName('camera')).toBe('AuthorCameraHelper')
    expect(authorHelperName('shadow')).toBe('AuthorShadowHelper')
    expect(authorHelperName('directional')).toBe('AuthorDirectionalHelper')
    expect(AUTHOR_HELPER_SIZE.directional).toBe(24)
    expect(AUTHOR_HELPER_COLOR.directional).toBe('#ffb020')
    expect(AUTHOR_SHADOW_COLOR.g).toBeGreaterThan(AUTHOR_SHADOW_COLOR.r)

    const same = planAuthorHelpers(
      {
        traverse(visit: (node: object) => void) {
          visit({ isDirectionalLight: true, shadow: { camera } })
        },
      },
      camera,
    )
    expect(same.map((plan) => plan.kind)).toEqual(['camera', 'directional'])
    expect(planAuthorHelpers({ traverse() {} }, null)).toEqual([])
  })
})

describe('槽上共存', () => {
  it('没有作者节点时测距和格网保持原来的组合', () => {
    expect(composeOverlay(null, null, null)).toBeNull()
    expect(composeOverlay('measure', null, null)).toBe('measure')
    expect(composeOverlay(null, 'grid', null)).toBe('grid')
    const both = composeOverlay('measure', 'grid', null)
    expect(both).toMatchObject({ props: { children: ['measure', 'grid'] } })
    const withAuthor = composeOverlay('measure', 'grid', 'author')
    expect(withAuthor).toMatchObject({ props: { children: ['measure', 'grid', 'author'] } })
    expect(composeOverlay(null, null, 'author')).toBe('author')
  })
})

describe('辅助分包', () => {
  it('懒挂在 dock 哈希之后，默认路径不进首屏，不改雾和 T032', () => {
    expect(USER_CAMERA_SMOOTH_TIME).toBe(0.42)
    expect(FOG_DENSITY.day).toBe(0.00112)
    expect(FOG_DENSITY.night).toBe(0.00096)

    const dock = read('../viewmarks/dock.tsx')
    const mount = read('./helpers/mount.ts')
    const helpers = read('./helpers/LightCameraHelpers.tsx')
    const gate = read('./gate.ts')
    const plan = read('./helpers/plan.ts')
    const plugin = read('../../scripts/authorHelpersPlugin.ts')
    const viteConfig = read('../../vite.config.ts')
    const rig = read('../components/scene/CameraRig.tsx')
    const pkg = JSON.parse(read('../../package.json')) as { dependencies: Record<string, string> }

    expect(dock).toContain(AUTHOR_HELPER_SOURCE_BLOCK.trimEnd())
    expect(dock).toMatch(/import\('\.\.\/author\/helpers\/mount'\)/)
    expect(dock).toMatch(/mountAuthorHelpers\(\)/)
    expect(dock).not.toMatch(/from '\.\.\/author\/helpers\/mount'/)
    expect(plugin).toContain(AUTHOR_HELPER_SOURCE_BLOCK)
    expect(plugin).toMatch(/apply: 'build'/)
    expect(plugin).toMatch(/assets\/AuthorHelpers\.js/)
    expect(plugin).toMatch(/assets\/AuthorHelperMount\.js/)
    expect(viteConfig).toMatch(/authorHelpersAfterHash/)
    expect(mount).toMatch(/import\('\.\/LightCameraHelpers'\)/)
    expect(mount).not.toMatch(/import \{ LightCameraHelpers \}/)
    expect(mount).not.toMatch(/@react-three|from 'three'|useHelper/)
    expect(helpers).toMatch(/@react-three\/drei\/core\/Helper/)
    expect(helpers).toMatch(/\buseHelper\b/)
    expect(helpers).not.toMatch(/from '@react-three\/drei'['"]/)
    expect(helpers).toMatch(/import type \{ Object3D \} from 'three'/)
    expect(helpers).not.toMatch(/import \{[^}]*Object3D[^}]*\} from 'three'/)
    expect(helpers).toMatch(/<cameraHelper/)
    expect(helpers).toMatch(/<directionalLightHelper/)
    expect(helpers).toMatch(/<hemisphereLightHelper/)
    expect(helpers).toMatch(/<pointLightHelper/)
    expect(helpers).toMatch(/<spotLightHelper/)
    expect(helpers).not.toMatch(/RectArea|rectArea/)
    expect(helpers).not.toMatch(/useFrame\(/)
    expect(helpers).toMatch(/invalidate\(\)/)
    expect(helpers).toMatch(/raycast = \(\) => \{\}/)
    expect(helpers).toMatch(/frustumCulled = false/)
    expect(helpers).not.toMatch(/makeDefault|smoothTime|FogExp2|balancedFx|state\.controls/)
    expect(gate).toMatch(/T068/)
    expect(gate).not.toMatch(/RectAreaLight\(/)
    expect(gate).not.toMatch(/@react-three|from 'three'|FogExp2/)
    expect(plan).toMatch(/isRectAreaLight/)
    expect(plan).not.toMatch(/@react-three|from 'three'/)
    expect(rig).toMatch(/makeDefault/)
    expect(rig).toMatch(/smoothTime=\{USER_CAMERA_SMOOTH_TIME\}/)
    expect(rig).not.toMatch(/useHelper|author\/helpers|debugHelpers/)

    const eager = [
      '../components/Scene.tsx',
      '../components/Stage.tsx',
      '../App.tsx',
      '../main.tsx',
      '../components/scene/postfx/balancedFx.tsx',
      '../components/scene/DemandLoop.tsx',
      '../components/scene/CameraRig.tsx',
      '../scene/stage/prefetchLazyChunks.ts',
      '../scene/fog.ts',
      '../scene/stage/cameraTransition.ts',
      '../scene/softShadows.ts',
      '../store/viewSlice.ts',
      '../gizmo/OrientationGizmo.tsx',
      '../viewmarks/LayerPanel.tsx',
    ]
    for (const file of eager) {
      const source = read(file)
      expect(source).not.toMatch(/LightCameraHelpers|mountAuthorHelpers|author\/helpers|useHelper|debugHelpers/)
    }
    expect(read('../store/viewSlice.ts')).not.toMatch(/debugHelpers/)
    expect(read('../components/Scene.tsx')).not.toMatch(/RectAreaLight/)

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
