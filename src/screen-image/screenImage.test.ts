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
import { FACE_GAP_M as VIDEO_FACE_GAP, SCREEN_RENDER_ORDER as VIDEO_RENDER_ORDER, screenPosesFromInstances } from '../screen-video/plan'
import { resetTwinStore, useTwinStore } from '../store/store'
import { SCREEN_IMAGE_SOURCE_BLOCK } from '../../scripts/screenImagePlugin'
import { mountScreenImage } from './mount'
import {
  CAMERA_POSTER_SRC,
  DESK_POSTER_CAP,
  DESK_POSTER_SRC,
  FACE_GAP_M,
  MONITOR_LAYER,
  MONITOR_SCREEN_LOCAL,
  MONITOR_SCREEN_SIZE,
  MONITOR_SCREEN_TILT,
  POSTER_RENDER_ORDER,
  SCREEN_POSTER_CAP,
  assertLocalPosterUrl,
  facePoint,
  posesEqual,
  posterPosesFromInstances,
  screenImageInitialOn,
  screenImageLayerOn,
  screenImageQuery,
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

describe('屏海报开关', () => {
  it('默认开，显式 0 关掉，演示地址和图层可以再打开', () => {
    expect(screenImageQuery('')).toBe('auto')
    expect(screenImageQuery('?q=balanced')).toBe('auto')
    expect(screenImageQuery('?screenImage=0')).toBe('off')
    expect(screenImageQuery('?q=balanced&demoEdit=1&screenImage=0')).toBe('off')
    expect(screenImageQuery('?screenImage=1')).toBe('on')
    expect(screenImageQuery('?q=balanced&demoEdit=1')).toBe('on')
    expect(searchOfUrl('http://127.0.0.1:5190/?q=balanced&screenImage=0#top')).toBe('?q=balanced&screenImage=0')
    expect(searchOfUrl('http://127.0.0.1:5190/')).toBe('')
    expect(screenImageLayerOn(null)).toBe(true)
    expect(screenImageLayerOn({})).toBe(true)
    expect(screenImageLayerOn({ screenImage: false })).toBe(false)
    expect(screenImageLayerOn({ screenImage: true })).toBe(true)
    expect(screenImageInitialOn('', {})).toBe(true)
    expect(screenImageInitialOn('?screenImage=0', {})).toBe(false)
    expect(screenImageInitialOn('?demoEdit=1', { screenImage: false })).toBe(true)
    expect(screenImageInitialOn('', { screenImage: false })).toBe(false)
    expect(DESK_POSTER_SRC).toBe('/textures/screens/desk.webp')
    expect(CAMERA_POSTER_SRC).toBe('/textures/screens/camera.jpg')
    expect(assertLocalPosterUrl(DESK_POSTER_SRC)).toBe(DESK_POSTER_SRC)
    expect(assertLocalPosterUrl(CAMERA_POSTER_SRC)).toBe(CAMERA_POSTER_SRC)
    expect(() => assertLocalPosterUrl('https://cdn.example.com/a.webp')).toThrow()
    expect(() => assertLocalPosterUrl('/textures/decals/demo.png')).toThrow()
    expect(() => assertLocalPosterUrl('/textures/screens/../desk.webp')).toThrow()
    expect(DESK_POSTER_SRC.startsWith('/textures/screens/')).toBe(true)
    expect(CAMERA_POSTER_SRC).not.toMatch(/https?:|cdn\.|m3u8/)
  })

  it('首屏图层对象不含屏海报，缺省读成开，setLayer 之后才写上', () => {
    resetTwinStore()
    const initial = useTwinStore.getState().layers
    expect(initial).not.toHaveProperty('screenImage')
    expect(screenImageLayerOn(initial)).toBe(true)
    expect(initial).toEqual({
      people: true,
      labels: true,
      heat: true,
      outlines: true,
      badges: true,
      edges: false,
    })
    useTwinStore.getState().setLayer('screenImage', false)
    expect(screenImageLayerOn(useTwinStore.getState().layers)).toBe(false)
    useTwinStore.getState().setLayer('screenImage', true)
    expect(screenImageLayerOn(useTwinStore.getState().layers)).toBe(true)
    expect(() => mountScreenImage()).not.toThrow()
  })
})

describe('海报落点', () => {
  it('局部坐标跟着显示器几何，正面在盒面之外，并藏在视频后面', () => {
    expect(MONITOR_SCREEN_LOCAL).toEqual(SCENE_LOCAL)
    expect(MONITOR_SCREEN_SIZE).toEqual(SCENE_SIZE)
    expect(MONITOR_SCREEN_TILT).toBe(SCENE_TILT)
    expect(MONITOR_LAYER).toBe(SCENE_MONITOR_LAYER)
    expect(POSTER_RENDER_ORDER).toBe(ALARM_MARKER_ORDER)
    expect(POSTER_RENDER_ORDER).toBeLessThan(VIDEO_RENDER_ORDER)
    expect(FACE_GAP_M).toBeLessThan(VIDEO_FACE_GAP)
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
    const poses = posterPosesFromInstances(parent.elements, packed, instances.length, camera)
    expect(poses.filter((pose) => pose.kind === 'desk')).toHaveLength(DESK_POSTER_CAP)
    expect(poses.filter((pose) => pose.kind === 'camera')).toHaveLength(1)
    expect(poses).toHaveLength(SCREEN_POSTER_CAP)
    expect(poses.some((pose) => pose.id === 'desk-2')).toBe(false)
    const nearest = poses.find((pose) => pose.kind === 'camera')
    expect(nearest?.id).toBe('camera-3')
    const video = screenPosesFromInstances(parent.elements, packed, instances.length, camera)
    expect(poses.map((pose) => pose.id)).toEqual(video.map((pose) => pose.id))
    expect(poses.find((pose) => pose.id === 'desk-0')?.elements).not.toEqual(video.find((pose) => pose.id === 'desk-0')?.elements)

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
    expect(posterPosesFromInstances(parent.elements, packed, 0, camera)).toEqual([])
    expect(posesEqual(poses, poses)).toBe(true)
    expect(posesEqual(poses, poses.slice(0, 1) as ScreenPose[])).toBe(false)
  })

  it('第六个槽位缺省时，格网组合保持原样', () => {
    expect(composeOverlay(null, null, null)).toBeNull()
    expect(composeOverlay(null, null, null, null, 'screen')).toBe('screen')
    expect(composeOverlay(null, null, null, null, null, 'poster')).toBe('poster')
    const all = composeOverlay('measure', 'grid', 'author', 'segments', 'screen', 'poster')
    expect(all).toMatchObject({ props: { children: ['measure', 'grid', 'author', 'segments', 'screen', 'poster'] } })
  })
})

describe('屏海报分包', () => {
  it('懒挂在 dock 哈希之后，不进首屏，不并进贴花，不改雾和 T032', () => {
    expect(USER_CAMERA_SMOOTH_TIME).toBe(0.42)
    expect(FOG_DENSITY.day).toBe(0.00112)
    expect(FOG_DENSITY.night).toBe(0.00096)

    const dock = read('../viewmarks/dock.tsx')
    const mount = read('./mount.ts')
    const live = read('./DeskScreenPosters.tsx')
    const plan = read('./plan.ts')
    const plugin = read('../../scripts/screenImagePlugin.ts')
    const vite = read('../../vite.config.ts')
    const view = read('../store/viewSlice.ts')
    const grid = read('../grid/mount.ts')
    const decalLive = read('../decals/WallDecals.tsx')
    const decalMount = read('../decals/mount.ts')
    const decalPlugin = read('../../scripts/decalPlugin.ts')
    const pkg = JSON.parse(read('../../package.json')) as { dependencies: Record<string, string> }
    const webp = readFileSync(join(here, '../../public/textures/screens/desk.webp'))
    const jpg = readFileSync(join(here, '../../public/textures/screens/camera.jpg'))

    expect(dock).toContain(SCREEN_IMAGE_SOURCE_BLOCK.trimEnd())
    expect(dock).toMatch(/import\('\.\.\/screen-image\/mount'\)/)
    expect(dock).toMatch(/mountScreenImage\(\)/)
    expect(dock).not.toMatch(/from '\.\.\/screen-image\/mount'/)
    expect(dock).not.toMatch(/demoEdit/)
    expect(plugin).toContain(SCREEN_IMAGE_SOURCE_BLOCK)
    expect(plugin).toMatch(/name: 'screen-image-after-hash'/)
    expect(plugin).toMatch(/apply: 'build'/)
    expect(plugin).toMatch(/assets\/ScreenImageMount\.js/)
    expect(plugin).toMatch(/assets\/DeskScreenPosters\.js/)
    expect(plugin).toMatch(/DecalMount/)
    expect(plugin).toMatch(/WallDecals/)
    expect(vite).toMatch(/screenImageAfterHash/)
    expect(grid).toMatch(/__twinScreenImageNode/)

    expect(mount).toMatch(/import\('\.\/DeskScreenPosters'\)/)
    expect(mount).not.toMatch(/import \{ DeskScreenPosters \}/)
    expect(mount).not.toMatch(/@react-three\/|from 'three'|WallDecals|DecalMount|useVideoTexture|hls\.js/)
    expect(mount).toMatch(/dataset\.layer = 'screenImage'/)
    expect(mount).toMatch(/screenImageQuery/)
    expect(mount).toMatch(/getEntriesByType\('navigation'\)/)
    expect(mount).toMatch(/__twinScreenImageNode/)
    expect(plan).not.toMatch(/from 'three'|@react-three|maath|RoundedPlane|hls|m3u8|WalkPaths|FogExp2|https?:/)
    expect(live).toMatch(/@react-three\/drei\/core\/Image/)
    expect(live).toMatch(/<Image/)
    expect(live).not.toMatch(/from '@react-three\/drei'/)
    expect(live).toMatch(/segments=\{1\}/)
    expect(live).toMatch(/radius=\{0\}/)
    expect(live).not.toMatch(/RoundedPlane|maath/)
    expect(live).toMatch(/DESK_POSTER_SRC/)
    expect(live).toMatch(/CAMERA_POSTER_SRC/)
    expect(live).toMatch(/'DeskScreenPoster'/)
    expect(live).toMatch(/'CameraPreviewPoster'/)
    expect(live).toMatch(/drei-Image/)
    expect(live).not.toMatch(/screen-video|useVideoTexture|DeskScreenVideo|WallDecals|core\/Decal|https?:|cdn\.|jsdelivr|githack|\.m3u8/)
    expect(live).not.toMatch(/FogExp2|FOG_DENSITY|smoothTime/)

    expect(view).toMatch(/LayerToggleKey = LayerKey \| 'wireframe' \| 'plaques' \| 'decals' \| 'segments' \| 'tourPath' \| 'screenVideo' \| 'screenImage'/)
    expect(view).not.toMatch(/screenImage:\s*(true|false)/)
    const panel = read('../viewmarks/LayerPanel.tsx')
    expect(panel).not.toMatch(/screen-image|DeskScreenPoster|屏海报/)
    expect(decalLive).not.toMatch(/screen-image|DeskScreenPoster|textures\/screens/)
    expect(decalMount).not.toMatch(/screen-image|mountScreenImage/)
    expect(decalPlugin).not.toMatch(/ScreenImageMount|screen-image|DeskScreenPoster/)

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
      expect(read(file), file).not.toMatch(/DeskScreenPoster|screen-image|mountScreenImage|ScreenImageMount/)
    }

    const blob = [mount, live, plan].join('\n')
    expect(blob).not.toMatch(/from ['"][^'"]*(fog|cameraTransition|balancedFx|postfx|softShadows|DemandLoop)/)
    expect(blob).not.toMatch(/Reflector|SSGI|pathtracer|howler|PivotControls|FloorBadges|Vignette/)
    expect(webp.subarray(0, 4).toString()).toBe('RIFF')
    expect(webp.subarray(8, 12).toString()).toBe('WEBP')
    expect(jpg[0]).toBe(0xff)
    expect(jpg[1]).toBe(0xd8)
    expect(webp.byteLength).toBeLessThan(80_000)
    expect(jpg.byteLength).toBeLessThan(80_000)
    expect(pkg.dependencies['@react-three/drei']).toBe('10.7.9')
    expect(pkg.dependencies.three).toBe('0.186.1')
    expect(pkg.dependencies['@react-three/fiber']).toBe('9.8.1')
    expect(pkg.dependencies['@react-three/postprocessing']).toBe('3.1.3')
    expect(pkg.dependencies).not.toHaveProperty('hls.js')
    expect(pkg.dependencies).not.toHaveProperty('maath')
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
