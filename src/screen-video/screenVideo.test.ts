import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Matrix4 } from 'three'
import { describe, expect, it } from 'vitest'
import { composeOverlay } from '../grid/mount'
import { ALARM_MARKER_ORDER, MONITOR_LAYER as SCENE_MONITOR_LAYER } from '../scene/overlayOrder'
import { FOG_DENSITY } from '../scene/fog'
import { USER_CAMERA_SMOOTH_TIME } from '../scene/stage/cameraTransition'
import {
  MONITOR_SCREEN_LOCAL as SCENE_LOCAL,
  MONITOR_SCREEN_SIZE as SCENE_SIZE,
  MONITOR_SCREEN_TILT as SCENE_TILT,
} from '../scene/stage/geometry'
import { resetTwinStore, useTwinStore } from '../store/store'
import { SCREEN_VIDEO_SOURCE_BLOCK } from '../../scripts/screenVideoPlugin'
import { mountScreenVideo } from './mount'
import {
  DESK_SCREEN_CAP,
  FACE_GAP_M,
  MONITOR_LAYER,
  MONITOR_SCREEN_LOCAL,
  MONITOR_SCREEN_SIZE,
  MONITOR_SCREEN_TILT,
  SCREEN_RENDER_ORDER,
  SCREEN_VIDEO_SRC,
  facePoint,
  posesEqual,
  screenPosesFromInstances,
  screenVideoLayerOn,
  screenVideoQueryOn,
  searchOfUrl,
  type ScreenPose,
} from './plan'

const here = dirname(fileURLToPath(import.meta.url))

function read(path: string): string {
  return readFileSync(join(here, path), 'utf8')
}

function instanceAt(x: number, z: number, rot = 0): number[] {
  const matrix = new Matrix4().makeRotationY(rot)
  matrix.setPosition(x, 0, z)
  return [...matrix.elements]
}

describe('工位屏开关', () => {
  it('默认关，演示地址和图层可以打开，显式 0 盖过 demoEdit', () => {
    expect(screenVideoQueryOn('')).toBe(false)
    expect(screenVideoQueryOn('?q=balanced')).toBe(false)
    expect(screenVideoQueryOn('?screenVideo=0')).toBe(false)
    expect(screenVideoQueryOn('?q=balanced&demoEdit=1&screenVideo=0')).toBe(false)
    expect(screenVideoQueryOn('?screenVideo=1')).toBe(true)
    expect(screenVideoQueryOn('?q=balanced&demoEdit=1')).toBe(true)
    expect(searchOfUrl('http://127.0.0.1:5190/?q=balanced&screenVideo=1#top')).toBe('?q=balanced&screenVideo=1')
    expect(searchOfUrl('http://127.0.0.1:5190/')).toBe('')
    expect(screenVideoLayerOn(null)).toBe(false)
    expect(screenVideoLayerOn({})).toBe(false)
    expect(screenVideoLayerOn({ screenVideo: false })).toBe(false)
    expect(screenVideoLayerOn({ screenVideo: true })).toBe(true)
    expect(SCREEN_VIDEO_SRC).toBe('/media/desk-cam.mp4')
    expect(SCREEN_VIDEO_SRC.startsWith('/')).toBe(true)
    expect(SCREEN_VIDEO_SRC.endsWith('.mp4')).toBe(true)
    expect(SCREEN_VIDEO_SRC).not.toMatch(/m3u8|https?:|hls/i)
  })

  it('首屏图层对象不含工位屏，setLayer 之后才写上', () => {
    resetTwinStore()
    const initial = useTwinStore.getState().layers
    expect(initial).not.toHaveProperty('screenVideo')
    expect(screenVideoLayerOn(initial)).toBe(false)
    useTwinStore.getState().setLayer('screenVideo', true)
    expect(screenVideoLayerOn(useTwinStore.getState().layers)).toBe(true)
    useTwinStore.getState().setLayer('screenVideo', false)
    expect(screenVideoLayerOn(useTwinStore.getState().layers)).toBe(false)
    expect(() => mountScreenVideo()).not.toThrow()
  })
})

describe('屏幕落点', () => {
  it('局部坐标跟着显示器几何，正面在盒面之外', () => {
    expect(MONITOR_SCREEN_LOCAL).toEqual(SCENE_LOCAL)
    expect(MONITOR_SCREEN_SIZE).toEqual(SCENE_SIZE)
    expect(MONITOR_SCREEN_TILT).toBe(SCENE_TILT)
    expect(MONITOR_LAYER).toBe(SCENE_MONITOR_LAYER)
    expect(SCREEN_RENDER_ORDER).toBeGreaterThan(ALARM_MARKER_ORDER)
    const desk = facePoint('desk')
    const lz = MONITOR_SCREEN_SIZE.d / 2 + FACE_GAP_M
    const cos = Math.cos(MONITOR_SCREEN_TILT)
    const sin = Math.sin(MONITOR_SCREEN_TILT)
    expect(desk.x).toBeCloseTo(MONITOR_SCREEN_LOCAL.x)
    expect(desk.y).toBeCloseTo(MONITOR_SCREEN_LOCAL.y - lz * sin)
    expect(desk.z).toBeCloseTo(MONITOR_SCREEN_LOCAL.z + lz * cos)
    expect(desk.width).toBeLessThan(MONITOR_SCREEN_SIZE.w)
    expect(desk.height).toBeLessThan(MONITOR_SCREEN_SIZE.h)
    const camera = facePoint('camera')
    expect(camera.x).toBeGreaterThan(desk.x)
    expect(camera.width).toBeLessThan(desk.width)
  })

  it('矩阵和 three 一致，只保留离相机最近的几台，并带一块预览', () => {
    const parent = new Matrix4().makeTranslation(0, 12.4, 0)
    const instances = [instanceAt(0, 0), instanceAt(4, 1, 0.4), instanceAt(30, 8), instanceAt(-2, 3)]
    const packed = instances.flat()
    const camera = { x: 0, y: 14, z: 6 }
    const poses = screenPosesFromInstances(parent.elements, packed, instances.length, camera)
    expect(poses.filter((pose) => pose.kind === 'desk')).toHaveLength(DESK_SCREEN_CAP)
    expect(poses.filter((pose) => pose.kind === 'camera')).toHaveLength(1)
    expect(poses.some((pose) => pose.id === 'desk-2')).toBe(false)
    const nearest = poses.find((pose) => pose.kind === 'camera')
    expect(nearest?.id).toBe('camera-3')

    const face = facePoint('desk')
    const local = new Matrix4().makeRotationX(MONITOR_SCREEN_TILT)
    local.premultiply(new Matrix4().makeTranslation(face.x, face.y, face.z))
    const expected = new Matrix4().multiplyMatrices(parent, new Matrix4().fromArray(instances[0] ?? []))
    expected.multiply(local)
    const desk0 = poses.find((pose) => pose.id === 'desk-0')
    expect(desk0).toBeTruthy()
    desk0?.elements.forEach((value, index) => {
      expect(value).toBeCloseTo(expected.elements[index] ?? 0, 5)
    })
    expect(screenPosesFromInstances(parent.elements, packed, 0, camera)).toEqual([])
    expect(posesEqual(poses, poses)).toBe(true)
    expect(posesEqual(poses, poses.slice(0, 1) as ScreenPose[])).toBe(false)
  })

  it('第五个槽位缺省时，格网组合保持原样', () => {
    expect(composeOverlay(null, null, null)).toBeNull()
    expect(composeOverlay(null, null, null, null, 'screen')).toBe('screen')
    const all = composeOverlay('measure', 'grid', 'author', 'segments', 'screen')
    expect(all).toMatchObject({ props: { children: ['measure', 'grid', 'author', 'segments', 'screen'] } })
  })
})

describe('工位屏分包', () => {
  it('懒挂在 dock 哈希之后，不进首屏，不改雾和 T032，也不拉 HLS', () => {
    expect(USER_CAMERA_SMOOTH_TIME).toBe(0.42)
    expect(FOG_DENSITY.day).toBe(0.00112)
    expect(FOG_DENSITY.night).toBe(0.00096)

    const dock = read('../viewmarks/dock.tsx')
    const mount = read('./mount.ts')
    const live = read('./DeskScreenVideo.tsx')
    const plan = read('./plan.ts')
    const plugin = read('../../scripts/screenVideoPlugin.ts')
    const vite = read('../../vite.config.ts')
    const view = read('../store/viewSlice.ts')
    const grid = read('../grid/mount.ts')
    const pkg = JSON.parse(read('../../package.json')) as { dependencies: Record<string, string> }
    const mp4 = readFileSync(join(here, '../../public/media/desk-cam.mp4'))

    expect(dock).toContain(SCREEN_VIDEO_SOURCE_BLOCK.trimEnd())
    expect(dock).toMatch(/import\('\.\.\/screen-video\/mount'\)/)
    expect(dock).toMatch(/mountScreenVideo\(\)/)
    expect(dock).not.toMatch(/from '\.\.\/screen-video\/mount'/)
    expect(plugin).toContain(SCREEN_VIDEO_SOURCE_BLOCK)
    expect(plugin).toMatch(/name: 'screen-video-after-hash'/)
    expect(plugin).toMatch(/apply: 'build'/)
    expect(plugin).toMatch(/assets\/ScreenVideoMount\.js/)
    expect(plugin).toMatch(/assets\/DeskScreenVideo\.js/)
    expect(plugin).toMatch(/bufferStalledError/)
    expect(vite).toMatch(/screenVideoAfterHash/)
    expect(grid).toMatch(/__twinScreenVideoNode/)

    expect(mount).toMatch(/import\('\.\/DeskScreenVideo'\)/)
    expect(mount).not.toMatch(/import \{ DeskScreenVideo \}/)
    expect(mount).not.toMatch(/@react-three\/|from 'three'|hls\.js|loadedmetadata|isVideoTexture|ScreenVideoTexture|WebcamVideoTexture/)
    expect(mount).toMatch(/dataset\.layer = 'screenVideo'/)
    expect(mount).toMatch(/screenVideoQueryOn/)
    expect(mount).toMatch(/getEntriesByType\('navigation'\)/)
    expect(mount).toMatch(/__twinScreenVideoNode/)
    expect(plan).not.toMatch(/from 'three'|@react-three|hls|m3u8|WalkPaths|FogExp2/)
    expect(live).toMatch(/@react-three\/drei\/core\/VideoTexture/)
    expect(live).toMatch(/useVideoTexture/)
    expect(live).not.toMatch(/from '@react-three\/drei'/)
    expect(live).not.toMatch(/ScreenVideoTexture|WebcamVideoTexture/)
    expect(live).toMatch(/muted: true/)
    expect(live).toMatch(/playsInline: true/)
    expect(live).toMatch(/loop: true/)
    expect(live).toMatch(/SCREEN_VIDEO_SRC/)
    expect(live).toMatch(/onVideoFrame: \(\) => invalidate\(\)/)
    expect(live).toMatch(/'DeskScreenVideo'/)
    expect(live).toMatch(/'CameraPreviewScreen'/)
    expect(live).not.toMatch(/\.m3u8|https?:|cdn\.|FogExp2|FOG_DENSITY|smoothTime/)
    expect(live).toMatch(/drei-useVideoTexture/)

    expect(view).toMatch(/LayerToggleKey = LayerKey \| 'wireframe' \| 'plaques' \| 'decals' \| 'segments' \| 'tourPath' \| 'screenVideo'/)
    expect(view).not.toMatch(/screenVideo:\s*(true|false)/)
    const panel = read('../viewmarks/LayerPanel.tsx')
    expect(panel).not.toMatch(/screen-video|useVideoTexture|工位屏/)

    const eager = [
      '../components/Scene.tsx',
      '../components/Stage.tsx',
      '../App.tsx',
      '../main.tsx',
      '../components/scene/postfx/balancedFx.tsx',
      '../components/scene/DemandLoop.tsx',
      '../scene/stage/prefetchLazyChunks.ts',
      '../scene/fog.ts',
      '../scene/stage/cameraTransition.ts',
      '../scene/softShadows.ts',
      '../scene/stage/Workstations.tsx',
      '../scene/stage/geometry.ts',
    ]
    for (const file of eager) {
      expect(read(file), file).not.toMatch(/DeskScreenVideo|screen-video|useVideoTexture|mountScreenVideo|hls\.js/)
    }

    const blob = [mount, live, plan].join('\n')
    expect(blob).not.toMatch(/from ['"][^'"]*(fog|cameraTransition|balancedFx|postfx|softShadows|DemandLoop)/)
    expect(mp4.subarray(4, 8).toString()).toBe('ftyp')
    expect(mp4.byteLength).toBeLessThan(80_000)
    expect(pkg.dependencies['@react-three/drei']).toBe('10.7.9')
    expect(pkg.dependencies.three).toBe('0.186.1')
    expect(pkg.dependencies['@react-three/fiber']).toBe('9.8.1')
    expect(pkg.dependencies['@react-three/postprocessing']).toBe('3.1.3')
    expect(pkg.dependencies).not.toHaveProperty('hls.js')
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
