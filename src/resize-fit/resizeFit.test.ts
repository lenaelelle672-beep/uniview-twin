import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { RESIZE_FIT_SOURCE_BLOCK, stripResizeFitSource } from '../../scripts/resizeFitPlugin'
import { composeOverlay } from '../grid/mount'
import { USER_CAMERA_SMOOTH_TIME } from '../scene/stage/cameraTransition'
import { FOG_DENSITY } from '../scene/fog'
import { SOFT_SHADOW_CHUNK_AFTER_FIRST_MS } from '../scene/softShadows'
import { applyMatrixElements, deskAnchor } from './place'
import { mountResizeFit } from './mount'
import {
  RESIZE_CARRIER_M,
  RESIZE_FIT_AFTER_FIRST_MS,
  RESIZE_FIT_FILL,
  RESIZE_FIT_LAYERS,
  RESIZE_FIT_MAX_M,
  RESIZE_FIT_MIN_M,
  carrierPosition,
  perspectiveFitMeters,
  resizeDeskId,
  resizeFitChunkDue,
  resizeFitDueLatched,
  resizeFitOptIn,
  resizeFitOptInAtBoot,
  resizeFitState,
  resizeSelection,
  searchOfUrl,
  viewportFitMeters,
  type ResizeQuery,
} from './plan'

const here = dirname(fileURLToPath(import.meta.url))

function read(relative: string): string {
  return readFileSync(join(here, relative), 'utf8')
}

function query(patch: Partial<ResizeQuery> = {}): ResizeQuery {
  return {
    view: 'floor',
    floorId: 'F12',
    focusedDeskId: 'F12-66',
    boxFloorId: null,
    boxDeskIds: [],
    optIn: true,
    due: true,
    touring: false,
    focusMode: 'off',
    focusResident: false,
    exploded: false,
    explodeProgress: 0,
    explodeAnimating: false,
    stationActive: false,
    stationAnimating: false,
    stationProgress: 0,
    ...patch,
  }
}

describe('缩放门闩', () => {
  it('默认关，只在单层单枚打开', () => {
    expect(resizeFitState(query({ optIn: false }))).toBe('off-switch')
    expect(resizeFitState(query())).toBe('on')
    expect(resizeDeskId(query())).toBe('F12-66')
    expect(resizeFitState(query({ due: false }))).toBe('pending')
    expect(resizeFitState(query({ view: 'building' }))).toBe('off-view')
    expect(resizeFitState(query({ view: 'blueprint' }))).toBe('off-view')
    expect(resizeFitState(query({ focusedDeskId: null }))).toBe('off-empty')
    expect(resizeFitState(query({ focusedDeskId: 'F11-1' }))).toBe('off-empty')
    expect(resizeFitState(query({ floorId: null }))).toBe('off-empty')
  })

  it('框选多于一枚就不缩放，框选一枚盖过侧栏焦点', () => {
    const multi = query({ boxFloorId: 'F12', boxDeskIds: ['F12-1', 'F12-2'], focusedDeskId: 'F12-66' })
    expect(resizeSelection(multi)).toEqual({ kind: 'multi' })
    expect(resizeFitState(multi)).toBe('off-multi')
    expect(resizeDeskId(multi)).toBeNull()

    const one = query({ boxFloorId: 'F12', boxDeskIds: ['F12-3'], focusedDeskId: 'F12-66' })
    expect(resizeSelection(one)).toEqual({ kind: 'one', deskId: 'F12-3' })
    expect(resizeDeskId(one)).toBe('F12-3')

    const otherFloor = query({ boxFloorId: 'F11', boxDeskIds: ['F11-1', 'F11-2'] })
    expect(resizeDeskId(otherFloor)).toBe('F12-66')
  })

  it('对焦装入、爆炸、工位拆解和巡游让位，开关仍然算开', () => {
    expect(resizeFitState(query({ focusMode: 'center' }))).toBe('yield-focus')
    expect(resizeFitState(query({ focusMode: 'bounds' }))).toBe('yield-focus')
    expect(resizeFitState(query({ focusResident: true }))).toBe('yield-focus')
    expect(resizeFitState(query({ exploded: true }))).toBe('yield-explode')
    expect(resizeFitState(query({ explodeProgress: 0.4 }))).toBe('yield-explode')
    expect(resizeFitState(query({ explodeAnimating: true }))).toBe('yield-explode')
    expect(resizeFitState(query({ explodeProgress: 0 }))).toBe('on')
    expect(resizeFitState(query({ stationActive: true }))).toBe('yield-station')
    expect(resizeFitState(query({ stationAnimating: true }))).toBe('yield-station')
    expect(resizeFitState(query({ stationProgress: 1 }))).toBe('yield-station')
    expect(resizeFitState(query({ touring: true }))).toBe('yield-tour')
    expect(resizeFitState(query({ touring: true, view: 'building' }))).toBe('yield-tour')
    expect(RESIZE_FIT_LAYERS).toEqual({
      focusFit: 'exclusive',
      explode: 'exclusive',
      stationExplode: 'exclusive',
      tour: 'exclusive',
      instancedMatrix: 'forbidden',
      html: 'forbidden',
    })
  })

  it('分包晚于首帧 2600ms，过了一次就锁住', () => {
    expect(RESIZE_FIT_AFTER_FIRST_MS).toBe(2600)
    expect(RESIZE_FIT_AFTER_FIRST_MS).toBe(SOFT_SHADOW_CHUNK_AFTER_FIRST_MS)
    const first = 5_000
    expect(resizeFitChunkDue(null, first)).toBe(false)
    expect(resizeFitChunkDue(undefined, first)).toBe(false)
    expect(resizeFitChunkDue(first, first + RESIZE_FIT_AFTER_FIRST_MS - 1)).toBe(false)
    expect(resizeFitChunkDue(first, first + RESIZE_FIT_AFTER_FIRST_MS)).toBe(true)
    const due = resizeFitDueLatched(false, first, first + RESIZE_FIT_AFTER_FIRST_MS)
    expect(resizeFitDueLatched(due, null, first)).toBe(true)
  })

  it('?resizeFit=1 才打开，启动地址里的也算', () => {
    expect(resizeFitOptIn('')).toBe(false)
    expect(resizeFitOptIn('?resizeFit=0')).toBe(false)
    expect(resizeFitOptIn('?q=balanced')).toBe(false)
    expect(resizeFitOptIn('?resizeFit=1')).toBe(true)
    expect(resizeFitOptIn('resizeFit=1&q=perf')).toBe(true)
    expect(searchOfUrl('http://127.0.0.1:5190/?resizeFit=1#floor')).toBe('?resizeFit=1')
    expect(searchOfUrl('http://127.0.0.1:5190/')).toBe('')
    expect(resizeFitOptInAtBoot('', 'http://127.0.0.1:5190/?q=perf&resizeFit=1')).toBe(true)
    expect(resizeFitOptInAtBoot('?resizeFit=1', '')).toBe(true)
    expect(resizeFitOptInAtBoot('?q=perf', 'http://127.0.0.1:5190/?q=perf')).toBe(false)
  })
})

describe('视口尺寸', () => {
  it('把较短边的一段收成世界长度，并夹在可读范围内', () => {
    const fov = 50
    const aspect = 16 / 9
    const distance = 10
    const height = 2 * Math.tan((fov * Math.PI) / 360) * distance
    const expected = Math.min(height * aspect, height) * RESIZE_FIT_FILL
    expect(viewportFitMeters(fov, aspect, distance)).toBeCloseTo(expected, 6)
    expect(viewportFitMeters(0, aspect, distance)).toBeNull()
    expect(viewportFitMeters(fov, 0, distance)).toBeNull()
    expect(viewportFitMeters(fov, aspect, 0)).toBeNull()
    expect(viewportFitMeters(fov, aspect, 0.01)).toBe(RESIZE_FIT_MIN_M)
    expect(viewportFitMeters(fov, aspect, 10_000)).toBe(RESIZE_FIT_MAX_M)
    expect(RESIZE_FIT_FILL).toBeGreaterThan(0)
    expect(RESIZE_FIT_FILL).toBeLessThanOrEqual(1)
  })

  it('只吃透视相机，载体中心抬起半个台身', () => {
    const center = carrierPosition({ x: 2, y: 40, z: -3 })
    expect(center).toEqual({ x: 2, y: 40 + RESIZE_CARRIER_M.y / 2, z: -3 })
    expect(RESIZE_CARRIER_M.x).toBeGreaterThanOrEqual(RESIZE_CARRIER_M.y)
    expect(RESIZE_CARRIER_M.z).toBe(RESIZE_CARRIER_M.x)
    const meters = perspectiveFitMeters(
      { isPerspectiveCamera: true, fov: 50, aspect: 1, position: { x: 2, y: 40, z: 7 } },
      center,
    )
    expect(meters).toBeGreaterThan(0)
    expect(perspectiveFitMeters({ isPerspectiveCamera: false, fov: 50, aspect: 1, position: { x: 0, y: 0, z: 1 } }, center)).toBeNull()
    expect(perspectiveFitMeters({ fov: 50, aspect: 1, position: { x: 0, y: 0, z: 1 } }, center)).toBeNull()
  })

  it('落点只读矩阵，地上层没有公布坐标就放弃', () => {
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 4, 5, 6, 1]
    expect(applyMatrixElements(identity, 1, 0, -2)).toEqual({ x: 5, y: 5, z: 4 })
    const interior = {
      updateWorldMatrix() {},
      matrixWorld: { elements: identity },
    }
    const scene = {
      getObjectByName(name: string) {
        return name === 'FloorInterior' ? interior : undefined
      },
    }
    const previous = globalThis.window
    Object.assign(globalThis, {
      window: {
        __twinFloor: { floorId: 'F4', desks: [{ id: 'F4-2', x: 1, z: -2, rot: 0 }], columns: [], cores: [] },
      },
    })
    expect(deskAnchor(scene, 'F4', 'F4-2')).toEqual({ x: 5, y: 5, z: 4 })
    expect(deskAnchor(scene, 'F4', 'F4-9')).toBeNull()
    expect(deskAnchor(scene, 'F5', 'F5-1')).toBeNull()
    if (previous === undefined) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete (globalThis as { window?: unknown }).window
    } else {
      Object.assign(globalThis, { window: previous })
    }
  })
})

describe('缩放接线', () => {
  it('没有文档时挂载直接返回', () => {
    expect(() => mountResizeFit()).not.toThrow()
  })

  it('懒挂在 dock 哈希之后，不进首屏，不套 Html，不写实例和爆炸矩阵', () => {
    expect(USER_CAMERA_SMOOTH_TIME).toBe(0.42)
    expect(FOG_DENSITY.day).toBe(0.00112)
    expect(FOG_DENSITY.night).toBe(0.00096)

    const dock = read('../viewmarks/dock.tsx')
    const mount = read('./mount.ts')
    const live = read('./ResizeFit.tsx')
    const plan = read('./plan.ts')
    const place = read('./place.ts')
    const probe = read('./probe.ts')
    const plugin = read('../../scripts/resizeFitPlugin.ts')
    const vite = read('../../vite.config.ts')
    const grid = read('../grid/mount.ts')
    const resizeJs = read('../../node_modules/@react-three/drei/core/Resize.js')
    const resizeDts = read('../../node_modules/@react-three/drei/core/Resize.d.ts')
    const pkg = JSON.parse(read('../../package.json')) as {
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
    }

    expect(dock).toContain(RESIZE_FIT_SOURCE_BLOCK)
    expect(dock).toMatch(/observe\(document\.body, \{ childList: true, subtree: true \}\)\n\n\/\/ T117：/)
    expect(stripResizeFitSource(dock)).not.toMatch(/resize-fit|mountResizeFit/)
    expect(stripResizeFitSource(dock)).toMatch(/mountOverviewClouds\(\)\n\}\)\n\/\/ T112：/)
    expect(stripResizeFitSource(dock)).toMatch(/mountDiscardProxy\(\)\n\}\)\n\nlet root/)
    expect(() => stripResizeFitSource('const dock = 1')).toThrow()
    expect(plugin).toContain(RESIZE_FIT_SOURCE_BLOCK)
    expect(plugin).toMatch(/name: 'resize-fit-after-hash'/)
    expect(plugin).toMatch(/apply: 'build'/)
    expect(plugin).toMatch(/assets\/ResizeFitMount\.js/)
    expect(plugin).toMatch(/assets\/ResizeFit\.js/)

    const plugins = vite.slice(vite.lastIndexOf('plugins: ['))
    expect(plugins.indexOf('gradientSkyAfterHash()')).toBeGreaterThanOrEqual(0)
    expect(plugins.indexOf('gradientSkyAfterHash()')).toBeLessThan(plugins.indexOf('discardProxyAfterHash()'))
    expect(plugins.indexOf('discardProxyAfterHash()')).toBeLessThan(plugins.indexOf('screenSpaceAfterHash()'))
    expect(plugins.indexOf('screenSpaceAfterHash()')).toBeLessThan(plugins.indexOf('resizeFitAfterHash()'))
    expect(plugins.indexOf('resizeFitAfterHash()')).toBeLessThan(plugins.indexOf('isolateTransformControlsLeaves()'))

    expect(grid).toMatch(/__twinResizeFitNode/)
    expect(grid).toMatch(/__twinScreenMarkNode/)
    expect(grid).toMatch(/__twinDiscardProxyNode/)
    expect(composeOverlay.length).toBe(3)
    expect(composeOverlay(null, null, null, null, null, null, null, null, null, null, null, null, 'resize')).toBe('resize')
    expect(composeOverlay(null, null, null, null, null, null, null, null, null, null, null, 'mark')).toBe('mark')
    expect(composeOverlay(null, null, null, null, null, null, null, null, null, null, 'discard')).toBe('discard')
    expect(composeOverlay(null, null, null, null, null, null, null, null, null, 'sky')).toBe('sky')

    expect(mount).toMatch(/import\('\.\/ResizeFit'\)/)
    expect(mount).not.toMatch(/import \{ ResizeFit \}/)
    expect(mount).not.toMatch(/@react-three|from 'three'|https?:|setFrameloop|useFrame|setLookAt|fitToBox/)
    expect(mount).toMatch(/__twinResizeFitNode/)
    expect(mount).toMatch(/resizeFitDueLatched/)
    expect(mount).toMatch(/resizeFitOptInAtBoot/)
    expect(plan).not.toMatch(/from 'three'|@react-three|https?:/)
    expect(place).not.toMatch(/@react-three|instanceMatrix|setMatrixAt|Html/)
    expect(probe).not.toMatch(/from 'three'|@react-three/)

    expect(live).toMatch(/from '@react-three\/drei\/core\/Resize'/)
    expect(live).toMatch(/<Resize box3=\{CARRIER_BOX as never\} precise=\{false\}>/)
    expect(live).toMatch(/scale=\{pose\.meters\}/)
    expect(live).toMatch(/name="ResizeFitCarrier"/)
    expect(live).toMatch(/meshBasicMaterial/)
    expect(live).not.toMatch(/from '@react-three\/drei'['"]/)
    expect(live).not.toMatch(/<Html|Html |instanceMatrix|setMatrixAt|InstancedMesh|setLookAt|fitToBox|useFrame/)
    expect(live).not.toMatch(/meshPhysicalMaterial|meshStandardMaterial|setFrameloop|https?:/)
    expect(live).not.toMatch(/\.scale\.set|setScalar/)

    expect(resizeJs).toMatch(/scale\.setScalar\(1 \/ dimension\)/)
    expect(resizeJs).toMatch(/dimension = Math\.max\(w, h, d\)/)
    expect(resizeJs).not.toMatch(/Html/)
    expect(resizeDts).toMatch(/width\?: boolean/)

    const eager = [
      '../components/Scene.tsx',
      '../components/Stage.tsx',
      '../App.tsx',
      '../main.tsx',
      '../components/scene/postfx/balancedFx.tsx',
      '../components/scene/DemandLoop.tsx',
      '../components/scene/CameraRig.tsx',
      '../components/scene/ExplodedLayout.tsx',
      '../scene/demandFrame.ts',
      '../scene/idleFrames.ts',
      '../scene/stage/cameraTransition.ts',
      '../scene/stage/prefetchLazyChunks.ts',
      '../focus-fit/mount.ts',
      '../focus-fit/BoundsFit.tsx',
      '../focus-fit/CenterFit.tsx',
      '../station-explode/mount.ts',
      '../explode-progress/mount.ts',
      '../kenney-furniture/mount.ts',
      '../view-transition/mount.ts',
      '../gradient-sky/GradientSky.tsx',
      '../drawrange-reveal/mount.ts',
      '../overview-clouds/mount.ts',
    ]
    for (const file of eager) {
      expect(read(file), file).not.toMatch(/resize-fit|mountResizeFit|ResizeFit|__twinResizeFit/)
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
