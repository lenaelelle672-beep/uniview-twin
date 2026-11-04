import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Color, Mesh, Scene, Texture } from 'three'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import { GRADIENT_SKY_SOURCE_BLOCK, stripGradientSkySource, threeImportNames } from '../../scripts/gradientSkyPlugin'
import { composeOverlay } from '../grid/mount'
import { USER_CAMERA_SMOOTH_TIME } from '../scene/stage/cameraTransition'
import { FOG_DENSITY, SCENE_BACKGROUND } from '../scene/fog'
import { SOFT_SHADOW_CHUNK_AFTER_FIRST_MS } from '../scene/softShadows'
import {
  detectForeignSky,
  elevationStop,
  GRADIENT_SKY_AFTER_FIRST_MS,
  GRADIENT_SKY_BANDS,
  GRADIENT_SKY_BASE,
  GRADIENT_SKY_COLORS,
  GRADIENT_SKY_LAYERS,
  GRADIENT_SKY_ORDER,
  GRADIENT_SKY_RADIUS,
  GRADIENT_SKY_STOPS,
  gradientSkyChunkDue,
  gradientSkyDueLatched,
  gradientSkyOptOut,
  gradientSkyOptOutAtBoot,
  gradientSkyState,
  gradientSkyVisible,
  searchOfUrl,
} from './plan'

const here = dirname(fileURLToPath(import.meta.url))

function read(relative: string): string {
  return readFileSync(join(here, relative), 'utf8')
}

describe('天幕门闩', () => {
  const day = { view: 'building', dayNight: 'day', presentation: 'lit', optOut: false }

  it('只在昼间总览实景打开，夜景白模单层蓝图和开关都关', () => {
    expect(gradientSkyState(day)).toBe('on')
    expect(gradientSkyVisible(day)).toBe(true)
    expect(gradientSkyState({ ...day, dayNight: 'night' })).toBe('off-night')
    expect(gradientSkyState({ ...day, presentation: 'model' })).toBe('off-model')
    expect(gradientSkyState({ ...day, view: 'floor' })).toBe('off-view')
    expect(gradientSkyState({ ...day, view: 'blueprint' })).toBe('off-view')
    expect(gradientSkyState({ ...day, optOut: true })).toBe('off-switch')
    expect(gradientSkyVisible({ ...day, dayNight: 'night' })).toBe(false)
  })

  it('场景里已有 drei Sky 或 HDR 背景就让位，不叠', () => {
    expect(gradientSkyState(day, 'sky')).toBe('yield-sky')
    expect(gradientSkyState(day, 'hdr-background')).toBe('yield-hdr-background')
    expect(gradientSkyVisible(day, 'sky')).toBe(false)
    expect(gradientSkyState({ ...day, dayNight: 'night' }, 'sky')).toBe('off-night')

    const scene = new Scene()
    scene.background = new Color(SCENE_BACKGROUND.day)
    scene.environment = new Texture()
    expect(detectForeignSky(scene)).toBeNull()
    scene.add(new Mesh())
    expect(detectForeignSky(scene)).toBeNull()

    const sky = new Sky()
    scene.add(sky)
    expect(detectForeignSky(scene)).toBe('sky')
    scene.remove(sky)
    sky.geometry.dispose()
    sky.material.dispose()

    const hdr = new Texture()
    scene.background = hdr
    expect(detectForeignSky(scene)).toBe('hdr-background')
    hdr.dispose()
    scene.environment.dispose()
  })

  it('分包晚于首帧 2600ms，和软阴影、云层同一道窗口', () => {
    expect(GRADIENT_SKY_AFTER_FIRST_MS).toBe(2600)
    expect(GRADIENT_SKY_AFTER_FIRST_MS).toBe(SOFT_SHADOW_CHUNK_AFTER_FIRST_MS)
    const first = 5_000
    expect(gradientSkyChunkDue(null, first)).toBe(false)
    expect(gradientSkyChunkDue(undefined, first)).toBe(false)
    expect(gradientSkyChunkDue(Number.NaN, first)).toBe(false)
    expect(gradientSkyChunkDue(first, Number.NaN)).toBe(false)
    expect(gradientSkyChunkDue(first, first + GRADIENT_SKY_AFTER_FIRST_MS - 1)).toBe(false)
    expect(gradientSkyChunkDue(first, first + GRADIENT_SKY_AFTER_FIRST_MS)).toBe(true)
  })

  it('窗口过了一次就锁住，首帧标记被删也不退回待挂', () => {
    const first = 5_000
    expect(gradientSkyDueLatched(false, null, first)).toBe(false)
    expect(gradientSkyDueLatched(false, first, first + 100)).toBe(false)
    const due = gradientSkyDueLatched(false, first, first + GRADIENT_SKY_AFTER_FIRST_MS)
    expect(due).toBe(true)
    expect(gradientSkyDueLatched(due, null, first + 9_000)).toBe(true)
    expect(gradientSkyDueLatched(due, undefined, Number.NaN)).toBe(true)
  })

  it('?skyGradient=0 关掉，启动地址里的也算', () => {
    expect(gradientSkyOptOut('')).toBe(false)
    expect(gradientSkyOptOut('?skyGradient=0')).toBe(true)
    expect(gradientSkyOptOut('skyGradient=0&q=perf')).toBe(true)
    expect(gradientSkyOptOut('?skyGradient=1')).toBe(false)
    expect(gradientSkyOptOut('?q=balanced')).toBe(false)
    expect(searchOfUrl('http://127.0.0.1:5190/?skyGradient=0#floor')).toBe('?skyGradient=0')
    expect(searchOfUrl('http://127.0.0.1:5190/')).toBe('')
    expect(gradientSkyOptOutAtBoot('', 'http://127.0.0.1:5190/?q=perf&skyGradient=0')).toBe(true)
    expect(gradientSkyOptOutAtBoot('?skyGradient=0', '')).toBe(true)
    expect(gradientSkyOptOutAtBoot('?q=perf', 'http://127.0.0.1:5190/?q=perf')).toBe(false)
  })
})

describe('天幕色带', () => {
  it('stops 从天顶 0 到天底 1 单调递增，和颜色一一对应', () => {
    expect(elevationStop(90)).toBe(0)
    expect(elevationStop(0)).toBe(0.5)
    expect(elevationStop(-90)).toBe(1)
    expect(elevationStop(200)).toBe(0)
    expect(GRADIENT_SKY_STOPS.length).toBe(GRADIENT_SKY_COLORS.length)
    expect(GRADIENT_SKY_STOPS.length).toBe(GRADIENT_SKY_BANDS.length)
    expect(GRADIENT_SKY_STOPS[0]).toBe(0)
    expect(GRADIENT_SKY_STOPS.at(-1)).toBe(1)
    for (let i = 1; i < GRADIENT_SKY_STOPS.length; i++) {
      expect(GRADIENT_SKY_STOPS[i]).toBeGreaterThan(GRADIENT_SKY_STOPS[i - 1] ?? 1)
    }
    for (const color of GRADIENT_SKY_COLORS) expect(color).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('底色条就是原来的昼间清屏色，往上逐档加蓝', () => {
    expect(GRADIENT_SKY_BASE).toBe(SCENE_BACKGROUND.day)
    expect(GRADIENT_SKY_COLORS.at(-1)).toBe(GRADIENT_SKY_BASE)
    expect(GRADIENT_SKY_COLORS.at(-2)).toBe(GRADIENT_SKY_BASE)
    const lightness = GRADIENT_SKY_COLORS.map((hex) => {
      const hsl = { h: 0, s: 0, l: 0 }
      new Color(hex).getHSL(hsl)
      return hsl.l
    })
    for (let i = 1; i < lightness.length; i++) {
      expect(lightness[i]).toBeGreaterThanOrEqual(lightness[i - 1] ?? 1)
    }
    const zenith = new Color(GRADIENT_SKY_COLORS[0])
    expect(zenith.b).toBeGreaterThan(zenith.r)
    expect(GRADIENT_SKY_RADIUS).toBeGreaterThan(0.35)
    expect(GRADIENT_SKY_RADIUS).toBeLessThan(2400)
    expect(GRADIENT_SKY_ORDER).toBeLessThan(0)
  })

  it('和云层分层，和 Sky / HDR 背景互斥，CDN Environment 不用', () => {
    expect(GRADIENT_SKY_LAYERS).toEqual({
      clouds: 'above',
      environment: 'reflection-only',
      sky: 'exclusive',
      hdrBackground: 'exclusive',
      cdnEnvironment: 'forbidden',
    })
  })
})

describe('天幕接线', () => {
  it('懒挂在 dock 哈希之后，不进首屏，不改雾、软阴影和云层', () => {
    expect(USER_CAMERA_SMOOTH_TIME).toBe(0.42)
    expect(FOG_DENSITY.day).toBe(0.00112)
    expect(FOG_DENSITY.night).toBe(0.00096)

    const dock = read('../viewmarks/dock.tsx')
    const mount = read('./mount.ts')
    const live = read('./GradientSky.tsx')
    const plan = read('./plan.ts')
    const probe = read('./probe.ts')
    const plugin = read('../../scripts/gradientSkyPlugin.ts')
    const vite = read('../../vite.config.ts')
    const grid = read('../grid/mount.ts')
    const clouds = read('../overview-clouds/OverviewClouds.tsx')
    const cloudMount = read('../overview-clouds/mount.ts')
    const pkg = JSON.parse(read('../../package.json')) as {
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
    }

    expect(dock).toContain(GRADIENT_SKY_SOURCE_BLOCK)
    expect(dock).toMatch(/LayerPanel \}\)\)\)\n\n\/\/ T114：/)
    expect(dock).toMatch(/mountGradientSky\(\)\n\}\)\n\/\/ T106：/)
    expect(stripGradientSkySource(dock)).not.toMatch(/gradient-sky|mountGradientSky/)
    expect(stripGradientSkySource(dock)).toMatch(/LayerPanel \}\)\)\)\n\n\/\/ T106：/)
    expect(stripGradientSkySource(dock)).toMatch(/mountOverviewClouds\(\)\n\}\)\n\/\/ T112：/)
    expect(() => stripGradientSkySource('const dock = 1')).toThrow()
    expect(plugin).toContain(GRADIENT_SKY_SOURCE_BLOCK)
    expect(plugin).toMatch(/name: 'gradient-sky-after-hash'/)
    expect(plugin).toMatch(/apply: 'build'/)
    expect(plugin).toMatch(/assets\/GradientSkyMount\.js/)
    expect(plugin).toMatch(/assets\/GradientSky\.js/)
    expect(threeImportNames()).toEqual(['BackSide', 'Color'])

    const plugins = vite.slice(vite.lastIndexOf('plugins: ['))
    expect(plugins.indexOf('overviewCloudsAfterHash()')).toBeGreaterThanOrEqual(0)
    expect(plugins.indexOf('overviewCloudsAfterHash()')).toBeLessThan(plugins.indexOf('gradientSkyAfterHash()'))
    expect(plugins.indexOf('drawRangeRevealAfterHash()')).toBeGreaterThanOrEqual(0)
    expect(plugins.indexOf('drawRangeRevealAfterHash()')).toBeLessThan(plugins.indexOf('gradientSkyAfterHash()'))
    expect(plugins.indexOf('gradientSkyAfterHash()')).toBeLessThan(plugins.indexOf('isolateTransformControlsLeaves()'))

    expect(grid).toMatch(/__twinGradientSkyNode/)
    expect(composeOverlay.length).toBe(3)
    expect(composeOverlay(null, null, null, null, null, null, null, null, null, 'sky')).toBe('sky')
    expect(composeOverlay(null, null, null, null, null, null, null, null, 'clouds')).toBe('clouds')

    expect(mount).toMatch(/import\('\.\/GradientSky'\)/)
    expect(mount).not.toMatch(/import \{ GradientSky \}/)
    expect(mount).not.toMatch(/@react-three|from 'three'|https?:|setFrameloop/)
    expect(mount).toMatch(/__twinGradientSkyNode/)
    expect(mount).toMatch(/gradientSkyDueLatched/)
    expect(mount).toMatch(/gradientSkyOptOutAtBoot/)
    expect(plan).not.toMatch(/from 'three'|@react-three|https?:|softShadows/)
    expect(probe).not.toMatch(/from 'three'|@react-three/)

    expect(live).toMatch(/from '@react-three\/drei\/core\/GradientTexture'/)
    expect(live).toMatch(/<GradientTexture/)
    expect(live).toMatch(/stops=\{STOPS\}/)
    expect(live).toMatch(/colors=\{COLORS\}/)
    expect(live).toMatch(/side=\{BackSide\}/)
    expect(live).toMatch(/depthWrite=\{false\}/)
    expect(live).toMatch(/fog=\{false\}/)
    expect(live).toMatch(/raycast=\{ignoreSkyPick\}/)
    expect(live).not.toMatch(/from '@react-three\/drei'/)
    expect(live).not.toMatch(/<Environment|<Sky\b|preset|\.hdr|https?:|githack|jsdelivr|unpkg|setFrameloop|setInterval/)
    expect(live).not.toMatch(/useFrame/)
    expect(live).not.toMatch(/scene\.background\s*=|scene\.environment\s*=|attach="background"/)
    expect(live).not.toMatch(/toneMapped=\{false\}/)

    expect(clouds).not.toMatch(/gradient-sky|GradientSky/)
    expect(cloudMount).not.toMatch(/gradient-sky|GradientSky/)

    const eager = [
      '../components/Scene.tsx',
      '../components/Stage.tsx',
      '../App.tsx',
      '../main.tsx',
      '../components/scene/postfx/balancedFx.tsx',
      '../components/scene/DemandLoop.tsx',
      '../components/scene/CameraRig.tsx',
      '../components/scene/LocalEnvironment.tsx',
      '../components/scene/RenderProbe.tsx',
      '../scene/stage/prefetchLazyChunks.ts',
      '../scene/fog.ts',
      '../scene/stage/cameraTransition.ts',
      '../scene/softShadows.ts',
    ]
    for (const file of eager) {
      expect(read(file), file).not.toMatch(/GradientSky|mountGradientSky|gradient-sky|GradientTexture|skyGradient/)
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
