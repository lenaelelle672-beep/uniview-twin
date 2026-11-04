import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import { SCREEN_MARK_SOURCE_BLOCK, stripScreenMarkSource, threeImportNames } from '../../scripts/screenSpacePlugin'
import { TOWER_ROOF_M, towerRow } from '../data/levels'
import { composeOverlay } from '../grid/mount'
import { CAMERA_POSES } from '../scene/cameras'
import { SOFT_SHADOW_CHUNK_AFTER_FIRST_MS } from '../scene/softShadows'
import { mountScreenMark } from './mount'
import {
  SCREEN_MARK_AFTER_FIRST_MS,
  SCREEN_MARK_ANCHOR,
  SCREEN_MARK_FLOOR,
  SCREEN_MARK_BOUNDS,
  SCREEN_MARK_DEPTH,
  SCREEN_MARK_HEIGHT,
  SCREEN_MARK_LABEL,
  SCREEN_MARK_MAX,
  SCREEN_MARK_WIDTH,
  screenMarkChunkDue,
  screenMarkDueLatched,
  screenMarkOffset,
  screenMarkOptOut,
  screenMarkOptOutAtBoot,
  screenMarkPixelHeight,
  screenMarkPixelWidth,
  screenMarkState,
  screenMarkVisible,
  searchOfUrl,
} from './plan'

const here = dirname(fileURLToPath(import.meta.url))

function read(relative: string): string {
  return readFileSync(join(here, relative), 'utf8')
}

describe('屏幕标注门闩', () => {
  const open = { view: 'building', presentation: 'lit', exploded: false, progress: 0, optOut: false }

  it('只在总览实景、楼层收拢时打开，夜景也开', () => {
    expect(screenMarkState(open)).toBe('on')
    expect(screenMarkVisible(open)).toBe(true)
    expect(screenMarkState({ ...open, presentation: 'lit' })).toBe('on')
    expect(screenMarkState({ ...open, view: 'floor' })).toBe('off-view')
    expect(screenMarkState({ ...open, view: 'blueprint' })).toBe('off-view')
    expect(screenMarkState({ ...open, presentation: 'model' })).toBe('off-model')
    expect(screenMarkState({ ...open, exploded: true, progress: 0 })).toBe('off-explode')
    expect(screenMarkState({ ...open, exploded: false, progress: 0.4 })).toBe('off-explode')
    expect(screenMarkState({ ...open, progress: null })).toBe('on')
    expect(screenMarkState({ ...open, optOut: true })).toBe('off-switch')
    expect(screenMarkVisible({ ...open, view: 'floor' })).toBe(false)
  })

  it('分包晚于首帧 2600ms，窗口过了一次就锁住', () => {
    expect(SCREEN_MARK_AFTER_FIRST_MS).toBe(2600)
    expect(SCREEN_MARK_AFTER_FIRST_MS).toBe(SOFT_SHADOW_CHUNK_AFTER_FIRST_MS)
    const first = 5_000
    expect(screenMarkChunkDue(null, first)).toBe(false)
    expect(screenMarkChunkDue(undefined, first)).toBe(false)
    expect(screenMarkChunkDue(Number.NaN, first)).toBe(false)
    expect(screenMarkChunkDue(first, Number.NaN)).toBe(false)
    expect(screenMarkChunkDue(first, first + SCREEN_MARK_AFTER_FIRST_MS - 1)).toBe(false)
    expect(screenMarkChunkDue(first, first + SCREEN_MARK_AFTER_FIRST_MS)).toBe(true)
    const due = screenMarkDueLatched(false, first, first + SCREEN_MARK_AFTER_FIRST_MS)
    expect(due).toBe(true)
    expect(screenMarkDueLatched(due, null, first + 9_000)).toBe(true)
    expect(screenMarkDueLatched(false, null, first)).toBe(false)
  })

  it('?screenMark=0 关掉，启动地址里的也算', () => {
    expect(screenMarkOptOut('')).toBe(false)
    expect(screenMarkOptOut('?screenMark=0')).toBe(true)
    expect(screenMarkOptOut('screenMark=0&q=perf')).toBe(true)
    expect(screenMarkOptOut('?screenMark=1')).toBe(false)
    expect(screenMarkOptOut('?q=balanced')).toBe(false)
    expect(searchOfUrl('http://127.0.0.1:5190/?screenMark=0#floor')).toBe('?screenMark=0')
    expect(searchOfUrl('http://127.0.0.1:5190/')).toBe('')
    expect(screenMarkOptOutAtBoot('', 'http://127.0.0.1:5190/?q=perf&screenMark=0')).toBe(true)
    expect(screenMarkOptOutAtBoot('?screenMark=0', '')).toBe(true)
    expect(screenMarkOptOutAtBoot('?q=perf', 'http://127.0.0.1:5190/?q=perf')).toBe(false)
  })

  it('节点环境直接挂载也不抛', () => {
    expect(() => mountScreenMark()).not.toThrow()
  })
})

describe('屏幕平面落点', () => {
  it('锚在塔楼平面中心的 F12，深度在 near 之外、楼距之内', () => {
    expect(SCREEN_MARK_FLOOR).toBe('F12')
    expect(SCREEN_MARK_ANCHOR).toEqual({ x: 0, y: towerRow('F12').level_m, z: 0 })
    expect(SCREEN_MARK_ANCHOR.y).toBeLessThan(TOWER_ROOF_M)
    expect(TOWER_ROOF_M).toBeCloseTo(100.2, 5)
    expect(SCREEN_MARK_DEPTH).toBeGreaterThan(0.35)
    expect(SCREEN_MARK_DEPTH).toBeLessThan(20)
    expect(SCREEN_MARK_MAX).toBe(1)
    expect(SCREEN_MARK_LABEL).toBe('塔楼')
  })

  it('总览起始机位把塔身锚点投进画面，牌子大约几十像素而不是整屏', () => {
    const pose = CAMERA_POSES.overview
    const camera = new PerspectiveCamera(pose.fov, 1366 / 768, 0.35, 2400)
    camera.position.set(pose.position[0], pose.position[1], pose.position[2])
    camera.lookAt(pose.target[0], pose.target[1], pose.target[2])
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
    const world = new Vector3(SCREEN_MARK_ANCHOR.x, SCREEN_MARK_ANCHOR.y, SCREEN_MARK_ANCHOR.z)
    const viewZ = world.clone().applyMatrix4(camera.matrixWorldInverse).z
    const ndc = world.clone().project(camera)
    const place = screenMarkOffset({
      viewZ,
      ndcX: ndc.x,
      ndcY: ndc.y,
      fov: camera.fov,
      aspect: camera.aspect,
      near: camera.near,
      depth: SCREEN_MARK_DEPTH,
    })
    expect(place.visible).toBe(true)
    expect(place.reason).toBe('in')
    expect(Math.abs(place.x)).toBeLessThan(1)
    expect(Math.abs(place.y)).toBeLessThan(1)
    const heightPx = screenMarkPixelHeight(768, pose.fov)
    const widthPx = screenMarkPixelWidth(768, pose.fov)
    expect(heightPx).toBeGreaterThan(24)
    expect(heightPx).toBeLessThan(48)
    expect(widthPx).toBeGreaterThan(80)
    expect(widthPx).toBeLessThan(180)
    expect(heightPx).toBeCloseTo((SCREEN_MARK_HEIGHT / SCREEN_MARK_WIDTH) * widthPx, 5)
  })

  it('相机背后、视锥外、正交相机都不画', () => {
    expect(
      screenMarkOffset({ viewZ: 1, ndcX: 0, ndcY: 0, fov: 33, aspect: 1.7, near: 0.35, depth: SCREEN_MARK_DEPTH })
        .reason,
    ).toBe('behind')
    expect(
      screenMarkOffset({ viewZ: -10, ndcX: 1.2, ndcY: 0, fov: 33, aspect: 1.7, near: 0.35, depth: SCREEN_MARK_DEPTH })
        .reason,
    ).toBe('offscreen')
    expect(
      screenMarkOffset({ viewZ: -10, ndcX: 0, ndcY: 0, fov: 0, aspect: 1.7, near: 0.35, depth: SCREEN_MARK_DEPTH })
        .reason,
    ).toBe('camera')
    expect(
      screenMarkOffset({ viewZ: -10, ndcX: 0, ndcY: 0, fov: 33, aspect: 1.7, near: 0.35, depth: 0.2 }).visible,
    ).toBe(false)
  })

  it('划界：DOM HUD、Html、Billboard、射影字号各一条，ScreenSizer 禁止', () => {
    expect(SCREEN_MARK_BOUNDS).toEqual({
      domHud: 't109-css',
      focusFloat: 'html-bbanchor',
      billboard: 'world-face-camera',
      projectedEm: 'world-em',
      screenSpace: 'one-camera-plane',
      screenSizer: 'forbidden',
    })
  })
})

describe('屏幕标注接线', () => {
  it('懒挂在 dock 哈希之后，ScreenSpace 不进首屏，并且不碰另外四条标注', () => {
    const dock = read('../viewmarks/dock.tsx')
    const grid = read('../grid/mount.ts')
    const live = read('./ScreenMark.tsx')
    const mount = read('./mount.ts')
    const plan = read('./plan.ts')
    const probe = read('./probe.ts')
    const plugin = read('../../scripts/screenSpacePlugin.ts')
    const vite = read('../../vite.config.ts')
    const pkg = JSON.parse(read('../../package.json')) as { dependencies: Record<string, string> }

    expect(dock).toContain(SCREEN_MARK_SOURCE_BLOCK)
    expect(dock).toMatch(/mountVisualViewportHud\(\)\n\}\)\n\/\/ T116：/)
    expect(dock).toMatch(/mountScreenMark\(\)\n\}\)\n\/\/ T102：/)
    expect(stripScreenMarkSource(dock)).toMatch(/mountVisualViewportHud\(\)\n\}\)\n\/\/ T102：/)
    expect(stripScreenMarkSource(dock)).not.toMatch(/screen-space|mountScreenMark|ScreenMark/)
    expect(() => stripScreenMarkSource('const dock = 1')).toThrow()
    expect(plugin).toContain(SCREEN_MARK_SOURCE_BLOCK)
    expect(plugin).toMatch(/name: 'screen-space-after-hash'/)
    expect(plugin).toMatch(/apply: 'build'/)
    expect(plugin).toMatch(/assets\/ScreenMarkMount\.js/)
    expect(plugin).toMatch(/assets\/ScreenMark\.js/)
    expect(threeImportNames()).toEqual(['DataTexture', 'LinearFilter', 'Vector3'])

    const plugins = vite.slice(vite.lastIndexOf('plugins: ['))
    expect(plugins.indexOf('gradientSkyAfterHash()')).toBeGreaterThanOrEqual(0)
    expect(plugins.indexOf('gradientSkyAfterHash()')).toBeLessThan(plugins.indexOf('screenSpaceAfterHash()'))
    expect(plugins.indexOf('screenSpaceAfterHash()')).toBeLessThan(plugins.indexOf('isolateTransformControlsLeaves()'))

    expect(grid).toMatch(/__twinScreenMarkNode/)
    expect(composeOverlay.length).toBe(3)
    expect(plugins.indexOf('discardProxyAfterHash()')).toBeLessThan(plugins.indexOf('screenSpaceAfterHash()'))
    expect(composeOverlay(null, null, null, null, null, null, null, null, null, null, null, 'mark')).toBe('mark')
    expect(composeOverlay(null, null, null, null, null, null, null, null, null, null, 'discard')).toBe('discard')
    expect(composeOverlay(null, null, null, null, null, null, null, null, null, 'sky')).toBe('sky')

    expect(mount).toMatch(/import\('\.\/ScreenMark'\)/)
    expect(mount).not.toMatch(/import \{ ScreenMark \}/)
    expect(mount).not.toMatch(/@react-three|from 'three'|https?:|setFrameloop|ScreenSizer/)
    expect(mount).toMatch(/__twinScreenMarkNode/)
    expect(mount).toMatch(/screenMarkDueLatched/)
    expect(mount).toMatch(/screenMarkOptOutAtBoot/)
    expect(plan).not.toMatch(/from 'three'|@react-three|https?:|softShadows|ScreenSizer/)
    expect(probe).not.toMatch(/from 'three'|@react-three|ScreenSizer/)

    expect(live).toMatch(/from '@react-three\/drei\/core\/ScreenSpace'/)
    expect(live).toMatch(/<ScreenSpace depth=\{SCREEN_MARK_DEPTH\}/)
    expect(live.match(/<ScreenSpace/g)).toHaveLength(1)
    expect(live.match(/<mesh[\s>]/g)).toHaveLength(1)
    expect(live).not.toMatch(/\.map\(/)
    expect(live).toMatch(/raycast=\{ignoreMarkPick\}/)
    expect(live).toMatch(/depthTest=\{false\}/)
    expect(live).toMatch(/depthWrite=\{false\}/)
    expect(live).toMatch(/fog=\{false\}/)
    expect(live).toMatch(/name="ScreenMark"/)
    expect(live).not.toMatch(/from '@react-three\/drei'['"]/)
    expect(live).not.toMatch(/ScreenSizer|calculateScaleFactor|Billboard|BBAnchor|<Html|projectedEm|visualViewport|setFrameloop/)
    expect(live).not.toMatch(/https?:|githack|jsdelivr|unpkg/)

    const frame = live.slice(live.indexOf('useFrame('), live.indexOf('if (!visible || !texture)'))
    expect(frame).toMatch(/projectAnchor/)
    expect(frame).not.toMatch(/invalidate/)

    const eager = [
      '../components/Scene.tsx',
      '../components/Stage.tsx',
      '../App.tsx',
      '../main.tsx',
      '../components/scene/postfx/balancedFx.tsx',
      '../components/scene/DemandLoop.tsx',
      '../components/scene/CameraRig.tsx',
      '../scene/stage/RoomLabels.tsx',
      '../scene/focusFloat/FocusFloatCard.tsx',
      '../scene/focusFloat/FocusFloatHost.tsx',
      '../demo-edit/DemoPlaques.tsx',
      '../visual-viewport/hud.ts',
      '../visual-viewport/mount.ts',
      '../scene/explode.ts',
      '../index.css',
    ]
    for (const file of eager) {
      expect(read(file), file).not.toMatch(/ScreenMark|ScreenSpace|ScreenSizer|mountScreenMark|screen-space|screenMark/)
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
