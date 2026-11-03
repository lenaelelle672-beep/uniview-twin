import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { BoxGeometry, DynamicDrawUsage, Group, InstancedMesh, Matrix4, MeshBasicMaterial } from 'three'
import { armRepeatedInstanceMatrices, resetInstanceMatrixMotion } from '../scene/instanceMatrix'
import { tolerateEmptyInstanceMaterial } from './emptyInstanceMaterial'
import { OVERVIEW_CLOUD_SOURCE_BLOCK, stripOverviewCloudSource } from '../../scripts/overviewCloudsPlugin'
import { composeOverlay } from '../grid/mount'
import { USER_CAMERA_SMOOTH_TIME } from '../scene/stage/cameraTransition'
import { FOG_DENSITY } from '../scene/fog'
import { SOFT_SHADOW_CHUNK_AFTER_FIRST_MS } from '../scene/softShadows'
import { applyCloudProps } from './applyCloudProps'
import {
  LOCAL_CLOUD_TEXTURE,
  OVERVIEW_CLOUD_AFTER_FIRST_MS,
  OVERVIEW_CLOUD_FADE,
  OVERVIEW_CLOUD_GROWTH,
  OVERVIEW_CLOUD_LIMIT,
  OVERVIEW_CLOUD_SEGMENTS,
  OVERVIEW_CLOUD_SPEED,
  OVERVIEW_CLOUDS,
  localCloudTexture,
  overviewCloudsChunkDue,
  overviewCloudsVisible,
} from './plan'

const here = dirname(fileURLToPath(import.meta.url))

afterEach(() => {
  resetInstanceMatrixMotion()
})

function read(relative: string): string {
  return readFileSync(join(here, relative), 'utf8')
}

describe('总览云层门闩', () => {
  it('只在昼间总览实景打开，夜景白模单层蓝图都关', () => {
    const day = { view: 'building', dayNight: 'day', presentation: 'lit' }
    expect(overviewCloudsVisible(day)).toBe(true)
    expect(overviewCloudsVisible({ ...day, dayNight: 'night' })).toBe(false)
    expect(overviewCloudsVisible({ ...day, presentation: 'model' })).toBe(false)
    expect(overviewCloudsVisible({ ...day, view: 'floor' })).toBe(false)
    expect(overviewCloudsVisible({ ...day, view: 'blueprint' })).toBe(false)
  })

  it('分包晚于首帧 2600ms，和软阴影同一道窗口', () => {
    expect(OVERVIEW_CLOUD_AFTER_FIRST_MS).toBe(2600)
    expect(OVERVIEW_CLOUD_AFTER_FIRST_MS).toBe(SOFT_SHADOW_CHUNK_AFTER_FIRST_MS)
    const first = 5_000
    expect(overviewCloudsChunkDue(null, first)).toBe(false)
    expect(overviewCloudsChunkDue(undefined, first)).toBe(false)
    expect(overviewCloudsChunkDue(Number.NaN, first)).toBe(false)
    expect(overviewCloudsChunkDue(first, Number.NaN)).toBe(false)
    expect(overviewCloudsChunkDue(first, first + OVERVIEW_CLOUD_AFTER_FIRST_MS - 1)).toBe(false)
    expect(overviewCloudsChunkDue(first, first + OVERVIEW_CLOUD_AFTER_FIRST_MS)).toBe(true)
  })

  it('速度和生长都是 0，段数等于 limit，贴图只接受本地路径', () => {
    expect(OVERVIEW_CLOUD_SPEED).toBe(0)
    expect(OVERVIEW_CLOUD_GROWTH).toBe(0)
    expect(OVERVIEW_CLOUD_FADE).toBeGreaterThan(10)
    expect(OVERVIEW_CLOUDS.length).toBeGreaterThan(0)
    expect(OVERVIEW_CLOUDS.length).toBeLessThanOrEqual(4)
    expect(OVERVIEW_CLOUD_SEGMENTS).toBe(OVERVIEW_CLOUDS.reduce((sum, cloud) => sum + cloud.segments, 0))
    expect(OVERVIEW_CLOUD_LIMIT).toBe(OVERVIEW_CLOUD_SEGMENTS)
    expect(OVERVIEW_CLOUD_LIMIT).toBeLessThan(40)
    for (const cloud of OVERVIEW_CLOUDS) {
      expect(cloud.segments).toBeGreaterThan(0)
      expect(cloud.segments).toBeLessThanOrEqual(12)
      expect(cloud.position[1]).toBeGreaterThan(100)
      expect(cloud.opacity).toBeGreaterThan(0)
      expect(cloud.opacity).toBeLessThanOrEqual(1)
    }
    expect(localCloudTexture(LOCAL_CLOUD_TEXTURE)).toBe(true)
    expect(localCloudTexture('/textures/clouds/cloud.png')).toBe(true)
    expect(
      localCloudTexture(
        'https://rawcdn.githack.com/pmndrs/drei-assets/9225a9f1fbd449d9411125c2f419b843d0308c9f/cloud.png',
      ),
    ).toBe(false)
    expect(localCloudTexture('//cdn.example/cloud.png')).toBe(false)
    expect(localCloudTexture('https://cdn.jsdelivr.net/cloud.png')).toBe(false)
    expect(localCloudTexture('/textures/clouds/other.png')).toBe(false)
  })

  it('颜色和向量走对象自己的 set，标量直接赋值', () => {
    const color = { isColor: true as const, value: '', set(next: unknown) { this.value = String(next) } }
    const bounds = {
      isVector3: true as const,
      x: 0,
      y: 0,
      z: 0,
      set(x: number, y: number, z: number) {
        this.x = x
        this.y = y
        this.z = z
      },
      copy(other: { x: number; y: number; z: number }) {
        this.set(other.x, other.y, other.z)
      },
    }
    const cloud = { color, bounds, volume: 1 }
    applyCloudProps(cloud, { color: '#f7fbff', bounds: [8, 2, 3], volume: 12, speed: 0 })
    expect(color.value).toBe('#f7fbff')
    expect(bounds.x).toBe(8)
    expect(bounds.y).toBe(2)
    expect(bounds.z).toBe(3)
    expect(cloud.volume).toBe(12)
    expect(cloud).toMatchObject({ speed: 0 })
  })

  it('空材质实例在重复件补丁之后仍能写入，树灯仍标动态缓冲', () => {
    const geometry = new BoxGeometry(1, 1, 1)
    const leaves = new MeshBasicMaterial({ name: 'tree_leaves' })
    const existing = new InstancedMesh(geometry, leaves, 1)
    const root = new Group()
    root.add(existing)
    armRepeatedInstanceMatrices(null)
    expect(tolerateEmptyInstanceMaterial(root)).toBe(true)

    const cloud = new InstancedMesh(geometry, null as unknown as MeshBasicMaterial, 2)
    expect(cloud.instanceMatrix.usage).not.toBe(DynamicDrawUsage)
    cloud.setMatrixAt(1, new Matrix4().makeTranslation(4, 0, 0))
    const got = new Matrix4()
    cloud.getMatrixAt(1, got)
    expect(got.elements[12]).toBeCloseTo(4)

    const lamp = new InstancedMesh(geometry, new MeshBasicMaterial({ name: 'lamp_body' }), 1)
    lamp.setMatrixAt(0, new Matrix4())
    expect(lamp.instanceMatrix.usage).toBe(DynamicDrawUsage)

    cloud.dispose()
    lamp.dispose()
    existing.dispose()
    geometry.dispose()
    leaves.dispose()
  })
})

describe('总览云层接线', () => {
  it('懒挂在 dock 哈希之后，不进首屏，不改雾', () => {
    expect(USER_CAMERA_SMOOTH_TIME).toBe(0.42)
    expect(FOG_DENSITY.day).toBe(0.00112)
    expect(FOG_DENSITY.night).toBe(0.00096)

    const dock = read('../viewmarks/dock.tsx')
    const mount = read('./mount.ts')
    const live = read('./OverviewClouds.tsx')
    const plan = read('./plan.ts')
    const props = read('./applyCloudProps.ts')
    const plugin = read('../../scripts/overviewCloudsPlugin.ts')
    const vite = read('../../vite.config.ts')
    const grid = read('../grid/mount.ts')
    const pkg = JSON.parse(read('../../package.json')) as {
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
    }
    const png = readFileSync(join(here, '../../public/textures/clouds/cloud.png'))

    expect(dock).toContain(OVERVIEW_CLOUD_SOURCE_BLOCK)
    expect(stripOverviewCloudSource(dock)).not.toMatch(/overview-clouds|mountOverviewClouds/)
    expect(plugin).toContain(OVERVIEW_CLOUD_SOURCE_BLOCK)
    expect(plugin).toMatch(/name: 'overview-clouds-after-hash'/)
    expect(plugin).toMatch(/apply: 'build'/)
    expect(plugin).toMatch(/assets\/OverviewCloudMount\.js/)
    expect(plugin).toMatch(/assets\/OverviewClouds\.js/)
    expect(plugin).toMatch(/rawcdn\.githack\.com/)
    const plugins = vite.slice(vite.lastIndexOf('plugins: ['))
    expect(plugins.indexOf('kenneyFurnitureAfterHash()')).toBeGreaterThanOrEqual(0)
    expect(plugins.indexOf('kenneyFurnitureAfterHash()')).toBeLessThan(plugins.indexOf('overviewCloudsAfterHash()'))
    expect(plugins.indexOf('overviewCloudsAfterHash()')).toBeLessThan(plugins.indexOf('isolateTransformControlsLeaves()'))
    expect(grid).toMatch(/__twinOverviewCloudNode/)
    expect(composeOverlay.length).toBe(3)
    expect(composeOverlay(null, null, null, null, null, null, null, null, 'clouds')).toBe('clouds')

    expect(mount).toMatch(/import\('\.\/OverviewClouds'\)/)
    expect(mount).not.toMatch(/import \{ OverviewClouds \}/)
    expect(mount).not.toMatch(/@react-three|from 'three'|githack|takram|setFrameloop/)
    expect(mount).toMatch(/__twinOverviewCloudNode/)
    expect(mount).toMatch(/overviewCloudsChunkDue/)
    expect(plan).not.toMatch(/from 'three'|@react-three|https?:|takram|softShadows/)
    expect(props).not.toMatch(/from 'three'|@react-three|https?:/)
    expect(live).toMatch(/@react-three\/drei\/core\/Cloud/)
    expect(live).toMatch(/<Clouds/)
    expect(live).toMatch(/<Cloud/)
    expect(live).toMatch(/tolerateEmptyInstanceMaterial/)
    expect(live).toMatch(/texture=\{LOCAL_CLOUD_TEXTURE\}/)
    expect(live).toMatch(/speed=\{OVERVIEW_CLOUD_SPEED\}/)
    expect(live).toMatch(/growth=\{OVERVIEW_CLOUD_GROWTH\}/)
    expect(live).toMatch(/limit=\{OVERVIEW_CLOUD_LIMIT\}/)
    expect(live).not.toMatch(/from '@react-three\/drei'/)
    expect(live).not.toMatch(/githack|takram|jsdelivr|unpkg|setFrameloop|setInterval/)
    expect(live).not.toMatch(/useFrame/)
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    expect(png.length).toBeGreaterThan(200)
    expect(png.length).toBeLessThan(64_000)

    const eager = [
      '../components/Scene.tsx',
      '../components/Stage.tsx',
      '../App.tsx',
      '../main.tsx',
      '../components/scene/postfx/balancedFx.tsx',
      '../components/scene/DemandLoop.tsx',
      '../components/scene/CameraRig.tsx',
      '../components/scene/LocalEnvironment.tsx',
      '../scene/stage/prefetchLazyChunks.ts',
      '../scene/fog.ts',
      '../scene/stage/cameraTransition.ts',
      '../scene/softShadows.ts',
    ]
    for (const file of eager) {
      expect(read(file), file).not.toMatch(/OverviewClouds|mountOverviewClouds|overview-clouds|core\/Cloud/)
    }

    expect(pkg.dependencies['@react-three/drei']).toBe('10.7.9')
    expect(pkg.dependencies.three).toBe('0.186.1')
    expect(pkg.dependencies['@react-three/fiber']).toBe('9.8.1')
    expect(pkg.dependencies['@react-three/postprocessing']).toBe('3.1.3')
    expect(pkg.dependencies['@takram/three-clouds']).toBeUndefined()
    expect(pkg.devDependencies['@takram/three-clouds']).toBeUndefined()
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
