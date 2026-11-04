import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DiscardMaterial } from '@react-three/drei/materials/DiscardMaterial.js'
import { afterEach, describe, expect, it } from 'vitest'
import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshDepthMaterial,
  Raycaster,
  ShaderMaterial,
  Vector3,
} from 'three'
import { DISCARD_PROXY_SOURCE_BLOCK, stripDiscardProxySource, threeImportNames } from '../../scripts/discardProxyPlugin'
import { composeOverlay } from '../grid/mount'
import { SOFT_SHADOW_CHUNK_AFTER_FIRST_MS } from '../scene/softShadows'
import {
  isDiscardProxyTarget,
  releaseDiscardProxies,
  resetDiscardProxyForTests,
  syncDiscardProxies,
} from './apply'
import { mountDiscardProxy } from './mount'
import {
  DISCARD_PROXY_AFTER_FIRST_MS,
  discardProxyDue,
  discardProxyOptOut,
  discardProxyWanted,
  searchOf,
} from './plan'

const here = dirname(fileURLToPath(import.meta.url))

function read(relative: string): string {
  return readFileSync(join(here, relative), 'utf8')
}

afterEach(() => {
  resetDiscardProxyForTests()
})

describe('拾取代理门闩', () => {
  it('只在进层打开，meshDiscard=0 关掉，总览不请求', () => {
    expect(discardProxyWanted('floor', '')).toBe(true)
    expect(discardProxyWanted('floor', '?q=balanced')).toBe(true)
    expect(discardProxyWanted('building', '')).toBe(false)
    expect(discardProxyWanted('blueprint', '?q=balanced')).toBe(false)
    expect(discardProxyWanted('floor', '?meshDiscard=0')).toBe(false)
    expect(discardProxyWanted('floor', '?meshDiscard=1')).toBe(true)
    expect(discardProxyOptOut('')).toBe(false)
    expect(discardProxyOptOut('?meshDiscard=0')).toBe(true)
    expect(discardProxyOptOut('meshDiscard=0&q=perf')).toBe(true)
    expect(searchOf('http://127.0.0.1:5190/?meshDiscard=0#floor')).toBe('?meshDiscard=0')
    expect(searchOf('http://127.0.0.1:5190/')).toBe('')
    expect(discardProxyOptOut('http://127.0.0.1:5190/?q=balanced&meshDiscard=0')).toBe(true)
  })

  it('分包晚于首帧 2600ms，过一次就锁住', () => {
    expect(DISCARD_PROXY_AFTER_FIRST_MS).toBe(2600)
    expect(DISCARD_PROXY_AFTER_FIRST_MS).toBe(SOFT_SHADOW_CHUNK_AFTER_FIRST_MS)
    const first = 5_000
    expect(discardProxyDue(false, null, first)).toBe(false)
    expect(discardProxyDue(false, undefined, first)).toBe(false)
    expect(discardProxyDue(false, Number.NaN, first)).toBe(false)
    expect(discardProxyDue(false, first, Number.NaN)).toBe(false)
    expect(discardProxyDue(false, first, first + DISCARD_PROXY_AFTER_FIRST_MS - 1)).toBe(false)
    const due = discardProxyDue(false, first, first + DISCARD_PROXY_AFTER_FIRST_MS)
    expect(due).toBe(true)
    expect(discardProxyDue(due, null, first)).toBe(true)
    expect(discardProxyDue(due, undefined, Number.NaN)).toBe(true)
  })
})

describe('只加深拾取代理', () => {
  const geometry = new BoxGeometry(1, 1, 1)

  function proxy(name = 'DeskPickProxy', userData: Record<string, unknown> = { boxPickProxy: true }) {
    const material = new MeshBasicMaterial({ visible: false, depthWrite: false, toneMapped: false })
    const mesh = new Mesh(geometry, material)
    mesh.name = name
    mesh.visible = false
    mesh.userData = userData
    return mesh
  }

  function sceneWith(mesh: Mesh, extra?: Mesh) {
    const scene = new Group()
    const root = new Group()
    root.name = 'DeskPickProxies'
    root.add(mesh)
    scene.add(root)
    if (extra) scene.add(extra)
    return { scene, root }
  }

  it('换成不写颜色和深度的 Discard 材质，射线和 visible 保持原样', () => {
    const mesh = proxy()
    const original = mesh.material
    const ignore = () => undefined
    mesh.raycast = ignore
    const source = new DiscardMaterial()
    const { scene } = sceneWith(mesh)
    expect(source.fragmentShader).toMatch(/discard/)
    expect(source.fragmentShader).toMatch(/gl_FragColor/)

    expect(syncDiscardProxies(scene, source)).toBe(1)
    expect(mesh.visible).toBe(false)
    expect(mesh.raycast).toBe(ignore)
    expect(mesh.material).not.toBe(original)
    expect(mesh.material).not.toBe(source)
    const next = mesh.material as unknown as ShaderMaterial
    expect(next.colorWrite).toBe(false)
    expect(next.depthWrite).toBe(false)
    expect(next.toneMapped).toBe(false)
    expect(next.visible).toBe(true)
    expect(next.fragmentShader).toMatch(/discard/)
    expect(original.visible).toBe(false)
    expect(mesh.userData.meshDiscard).toBe(true)

    const ray = new Raycaster(new Vector3(0, 0, 3), new Vector3(0, 0, -1))
    expect(ray.intersectObject(mesh, false)).toEqual([])
    mesh.raycast = Mesh.prototype.raycast
    expect(ray.intersectObject(mesh, false).length).toBeGreaterThan(0)
    expect(mesh.visible).toBe(false)

    expect(syncDiscardProxies(scene, source)).toBe(1)
    expect(mesh.material).toBe(next)

    releaseDiscardProxies(scene)
    expect(mesh.material).toBe(original)
    expect(mesh.userData.meshDiscard).toBeUndefined()
    expect(original.visible).toBe(false)
  })

  it('业务网格、实例网格、深度代理和宿主都不换材质', () => {
    const pick = proxy()
    const desk = new Mesh(geometry, new MeshBasicMaterial({ color: 'red' }))
    desk.name = 'WorkstationDesks'
    desk.userData.boxPickProxy = true
    const depth = new Mesh(geometry, new MeshDepthMaterial())
    depth.name = 'WorkstationChairsDepthProxy'
    const instanced = new InstancedMesh(geometry, new MeshBasicMaterial(), 2)
    instanced.name = 'DeskPickProxy'
    instanced.userData.boxPickProxy = true
    const host = new Mesh(geometry, new MeshBasicMaterial())
    host.name = 'MeshDiscardHost'
    const { scene, root } = sceneWith(pick)
    root.add(instanced)
    scene.add(desk, depth, host)

    expect(isDiscardProxyTarget(pick)).toBe(true)
    expect(isDiscardProxyTarget(desk)).toBe(false)
    expect(isDiscardProxyTarget(depth)).toBe(false)
    expect(isDiscardProxyTarget(instanced)).toBe(false)
    expect(isDiscardProxyTarget(host)).toBe(false)

    const deskMaterial = desk.material
    const depthMaterial = depth.material
    const instancedMaterial = instanced.material
    syncDiscardProxies(scene, new DiscardMaterial())
    expect(pick.userData.meshDiscard).toBe(true)
    expect(desk.material).toBe(deskMaterial)
    expect(depth.material).toBe(depthMaterial)
    expect(instanced.material).toBe(instancedMaterial)
    expect(host.material).not.toBeInstanceOf(DiscardMaterial)
  })

  it('代理组卸掉之后还原占位材质，不 dispose 原来的共享材质', () => {
    const mesh = proxy()
    const original = mesh.material as MeshBasicMaterial
    const dispose = original.dispose
    let disposed = 0
    original.dispose = () => {
      disposed += 1
      dispose.call(original)
    }
    const { scene, root } = sceneWith(mesh)
    syncDiscardProxies(scene, new DiscardMaterial())
    root.removeFromParent()
    expect(syncDiscardProxies(scene, new DiscardMaterial())).toBe(0)
    expect(mesh.material).toBe(original)
    expect(disposed).toBe(0)
  })
})

describe('分包不进首屏', () => {
  it('懒挂在 dock 哈希之后，drei 深路径不进入口', () => {
    const dock = read('../viewmarks/dock.tsx')
    const mount = read('./mount.ts')
    const live = read('./DiscardProxy.tsx')
    const plan = read('./plan.ts')
    const apply = read('./apply.ts')
    const probe = read('./probe.ts')
    const plugin = read('../../scripts/discardProxyPlugin.ts')
    const vite = read('../../vite.config.ts')
    const grid = read('../grid/mount.ts')
    const box = read('../scene/stage/DeskBoxSelect.tsx')
    const bvh = read('../scene/pick/PickBvh.tsx')
    const pkg = JSON.parse(read('../../package.json')) as { dependencies: Record<string, string> }
    const pinned = readFileSync(join(here, '../../node_modules/@react-three/drei/materials/DiscardMaterial.js'), 'utf8')

    expect(dock).toContain(DISCARD_PROXY_SOURCE_BLOCK)
    expect(dock).toMatch(/mountDrawRangeReveal\(\)\n\}\)\n\/\/ T115：拾取代理 MeshDiscardMaterial/)
    expect(dock).toMatch(/mountDiscardProxy\(\)\n\}\)\n\/\/ T118：/)
    expect(stripDiscardProxySource(dock)).not.toMatch(/discard-proxy|mountDiscardProxy|MeshDiscardMaterial/)
    expect(stripDiscardProxySource(dock)).toMatch(/mountDrawRangeReveal\(\)\n\}\)\n\/\/ T118：/)
    expect(() => stripDiscardProxySource('const dock = 1')).toThrow()
    expect(plugin).toContain(DISCARD_PROXY_SOURCE_BLOCK)
    expect(plugin).toMatch(/name: 'discard-proxy-after-hash'/)
    expect(plugin).toMatch(/apply: 'build'/)
    expect(plugin).toMatch(/assets\/DiscardProxyMount\.js/)
    expect(plugin).toMatch(/assets\/DiscardProxy\.js/)
    expect(threeImportNames()).toEqual(['MathUtils', 'ShaderMaterial', 'Uniform', 'UniformsUtils'])
    expect(pinned).toMatch(/gl_FragColor = vec4\(0\.0, 0\.0, 0\.0, 0\.0\); discard;/)

    const plugins = vite.slice(vite.lastIndexOf('plugins: ['))
    expect(plugins.indexOf('gradientSkyAfterHash()')).toBeGreaterThanOrEqual(0)
    expect(plugins.indexOf('gradientSkyAfterHash()')).toBeLessThan(plugins.indexOf('discardProxyAfterHash()'))
    expect(plugins.indexOf('discardProxyAfterHash()')).toBeLessThan(plugins.indexOf('isolateTransformControlsLeaves()'))

    expect(grid).toMatch(/__twinDiscardProxyNode/)
    expect(composeOverlay.length).toBe(3)
    expect(composeOverlay(null, null, null, null, null, null, null, null, null, null, 'discard')).toBe('discard')
    expect(composeOverlay(null, null, null, null, null, null, null, null, null, 'sky')).toBe('sky')

    expect(mount).toMatch(/import\('\.\/DiscardProxy'\)/)
    expect(mount).not.toMatch(/import \{ DiscardProxy \}/)
    expect(mount).not.toMatch(/@react-three|from 'three'|https?:|setFrameloop|invalidate/)
    expect(mount).toMatch(/__twinDiscardProxyNode/)
    expect(mount).toMatch(/discardProxyDue/)
    expect(plan).not.toMatch(/from 'three'|@react-three|https?:|softShadows/)
    expect(probe).not.toMatch(/from 'three'|@react-three/)
    expect(apply).not.toMatch(/from '@react-three|material\.visible = false|visible: false/)
    expect(apply).toMatch(/colorWrite = false/)
    expect(apply).toMatch(/depthWrite = false/)
    expect(apply).toMatch(/material\.visible = true/)
    expect(apply).not.toMatch(/\.raycast\s*=/)
    expect(apply).not.toMatch(/node\.visible\s*=|mesh\.visible\s*=/)

    expect(live).toMatch(/from '@react-three\/drei\/core\/MeshDiscardMaterial'/)
    expect(live).toMatch(/<MeshDiscardMaterial/)
    expect(live).toMatch(/colorWrite=\{false\}/)
    expect(live).toMatch(/depthWrite=\{false\}/)
    expect(live).toMatch(/name="MeshDiscardHost"/)
    expect(live).toMatch(/visible=\{false\}/)
    expect(live).toMatch(/raycast=\{ignoreHostRaycast\}/)
    expect(live).not.toMatch(/from '@react-three\/drei'['"]/)
    expect(live).not.toMatch(/useFrame|setFrameloop|https?:/)
    expect(live).not.toMatch(/boxPickProxy:\s*true/)

    expect(box).toMatch(/mesh\.visible = false/)
    expect(box).toMatch(/mesh\.raycast = ignoreRaycast/)
    expect(box).toMatch(/visible: false/)
    expect(box).not.toMatch(/MeshDiscardMaterial|discard-proxy/)
    expect(bvh).toMatch(/mesh\.raycast = Mesh\.prototype\.raycast/)
    expect(bvh).toMatch(/mesh\.raycast = ignoreBoxProxyRaycast/)

    expect(() => mountDiscardProxy()).not.toThrow()

    const eager = [
      '../components/Scene.tsx',
      '../components/Stage.tsx',
      '../App.tsx',
      '../main.tsx',
      '../components/scene/postfx/balancedFx.tsx',
      '../components/scene/DemandLoop.tsx',
      '../components/scene/CameraRig.tsx',
      '../scene/stage/FloorStage.tsx',
      '../scene/stage/prefetchLazyChunks.ts',
      '../scene/stage/DeskBoxSelect.tsx',
      '../scene/pick/PickBvh.tsx',
    ]
    for (const file of eager) {
      expect(read(file), file).not.toMatch(/MeshDiscardMaterial|mountDiscardProxy|discard-proxy|meshDiscard/)
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
