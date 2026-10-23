import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  BoxGeometry,
  Color,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  ShaderMaterial,
} from 'three'
import { USER_CAMERA_SMOOTH_TIME } from '../scene/stage/cameraTransition'
import {
  FLOOR_GLB_EARLY,
  FLOOR_GLB_EMPTY,
  FLOOR_GLB_FAILED,
  FLOOR_GLB_NEED_FLOOR,
  exportCurrentFloorGlb,
  floorExportRoots,
  loadGlbExporter,
  visibleExportGaps,
  type FloorGlbPorts,
  type GlbExporter,
} from './floorGlb'

const here = dirname(fileURLToPath(import.meta.url))

function read(path: string): string {
  return readFileSync(join(here, path), 'utf8')
}

function tinyGlb(): ArrayBuffer {
  const buffer = new ArrayBuffer(20)
  const view = new DataView(buffer)
  view.setUint32(0, 0x46546c67, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, 20, true)
  return buffer
}

function slab(name: string, visible = true): Mesh {
  const mesh = new Mesh(new BoxGeometry(1, 0.16, 1), new MeshStandardMaterial())
  mesh.name = name
  mesh.visible = visible
  return mesh
}

function shaderMesh(name: string): Mesh {
  const mesh = new Mesh(
    new BoxGeometry(0.2, 0.2, 0.2),
    new ShaderMaterial({
      vertexShader: 'void main(){ gl_Position = vec4(0.0); }',
      fragmentShader: 'void main(){ gl_FragColor = vec4(1.0); }',
    }),
  )
  mesh.name = name
  return mesh
}

function namesOf(roots: readonly Object3D[]): string[] {
  const names: string[] = []
  for (const root of roots) root.traverse((object) => names.push(object.name))
  return names
}

function floorScene(): Group {
  const scene = new Group()
  scene.name = 'Scene'
  const tower = new Group()
  tower.name = 'Tower'
  const other = new Group()
  other.name = 'FloorShell-F1'
  other.add(slab('OtherBand'))
  const shell = new Group()
  shell.name = 'FloorShell-F12'
  shell.add(slab('FloorBand'))
  shell.add(slab('FloorCurtain-F12', false))
  tower.add(other)
  tower.add(shell)
  const site = new Group()
  site.name = 'Site'
  const trees = new InstancedMesh(new BoxGeometry(0.3, 2, 0.3), new MeshStandardMaterial(), 500)
  trees.name = 'SiteTrees'
  trees.count = 500
  site.add(trees)
  const interior = new Group()
  interior.name = 'FloorInterior'
  interior.add(slab('FloorSlab'))
  interior.add(slab('HiddenCap', false))
  scene.add(tower)
  scene.add(site)
  scene.add(interior)
  return scene
}

function ports(scene: Object3D | null, over: Partial<FloorGlbPorts> = {}): FloorGlbPorts & { downloaded: ArrayBuffer[]; calls: unknown[] } {
  const downloaded: ArrayBuffer[] = []
  const calls: unknown[] = []
  const exporter: GlbExporter = {
    async parseAsync(input, options) {
      calls.push({ input, options })
      return tinyGlb()
    },
  }
  return {
    view: 'floor',
    floorId: 'F12',
    scene,
    loadExporter: async () => exporter,
    download: (bytes) => {
      downloaded.push(bytes)
    },
    downloaded,
    calls,
    ...over,
  }
}

function glbJson(bytes: ArrayBuffer): { nodes?: Array<{ name?: string }>; extensionsUsed?: Record<string, unknown> } {
  const view = new DataView(bytes)
  let offset = 12
  const decoder = new TextDecoder()
  while (offset + 8 <= bytes.byteLength) {
    const length = view.getUint32(offset, true)
    const type = view.getUint32(offset + 4, true)
    offset += 8
    if (type === 0x4e4f534a) {
      return JSON.parse(decoder.decode(new Uint8Array(bytes, offset, length))) as {
        nodes?: Array<{ name?: string }>
        extensionsUsed?: Record<string, unknown>
      }
    }
    offset += length
  }
  throw new Error('glb 里没有 JSON')
}

describe('当前层 GLB', () => {
  it('只收集当前层可见根，不带整塔和其他层、也不带全场实例', () => {
    const scene = floorScene()
    const roots = floorExportRoots(scene, 'F12')
    expect(roots.map((root) => root.name)).toEqual(['FloorInterior', 'FloorShell-F12'])
    const names = namesOf(roots)
    expect(names).toContain('FloorSlab')
    expect(names).toContain('HiddenCap')
    expect(names).not.toContain('Tower')
    expect(names).not.toContain('FloorShell-F1')
    expect(names).not.toContain('SiteTrees')
    expect(visibleExportGaps(roots)).toEqual([])
  })

  it('父级被藏起来的外壳不算当前层可见子集', () => {
    const scene = floorScene()
    const shell = scene.getObjectByName('FloorShell-F12')
    shell?.parent?.remove(shell)
    const hidden = new Group()
    hidden.name = 'HiddenHost'
    hidden.visible = false
    if (shell) hidden.add(shell)
    scene.add(hidden)
    expect(floorExportRoots(scene, 'F12').map((root) => root.name)).toEqual(['FloorInterior'])
  })

  it('parseAsync 收到当前层子集，binary + onlyVisible，并下载 glb', async () => {
    const scene = floorScene()
    const hook = ports(scene)
    const result = await exportCurrentFloorGlb(hook)
    expect(result).toEqual({ ok: true, partial: false, message: '已下载 F12.glb' })
    expect(hook.downloaded).toHaveLength(1)
    expect(hook.calls).toHaveLength(1)
    const call = hook.calls[0] as { input: Object3D[]; options: { binary: boolean; onlyVisible: boolean } }
    expect(call.options).toEqual({ binary: true, onlyVisible: true })
    expect(call.input).not.toBe(scene)
    expect(call.input.map((root) => root.name)).toEqual(['FloorInterior', 'FloorShell-F12'])
    expect(namesOf(call.input)).not.toContain('SiteTrees')
  })

  it('隐藏的自定义着色不触发降级；看得见的才提示', async () => {
    const scene = floorScene()
    const interior = scene.getObjectByName('FloorInterior')
    const hiddenShader = shaderMesh('HiddenBadge')
    hiddenShader.visible = false
    interior?.add(hiddenShader)
    const quiet = ports(scene)
    expect(await exportCurrentFloorGlb(quiet)).toMatchObject({ ok: true, partial: false })
    expect(quiet.calls).toHaveLength(1)

    interior?.add(shaderMesh('DeviceBadge'))
    const noisy = ports(scene)
    const result = await exportCurrentFloorGlb(noisy)
    expect(result.ok).toBe(true)
    expect(result.partial).toBe(true)
    expect(result.message).toBe('已下载 F12.glb。自定义着色没有完整写入')
    expect(noisy.calls).toHaveLength(1)
  })

  it('导出器在自定义着色上抛错时改导出其余网格，不把异常抛出去', async () => {
    const scene = floorScene()
    scene.getObjectByName('FloorInterior')?.add(shaderMesh('DeviceBadge'))
    let calls = 0
    const downloaded: string[] = []
    const result = await exportCurrentFloorGlb({
      view: 'floor',
      floorId: 'F12',
      scene,
      download: (_bytes, filename) => {
        downloaded.push(filename)
      },
      loadExporter: async () => ({
        async parseAsync(input) {
          calls += 1
          const hit = namesOf(input as Object3D[]).includes('DeviceBadge')
          if (hit) throw new Error('shader')
          return tinyGlb()
        },
      }),
    })
    expect(result).toEqual({
      ok: true,
      partial: true,
      message: '已下载 F12.glb。自定义着色没有完整写入',
    })
    expect(calls).toBe(2)
    expect(downloaded).toEqual(['F12.glb'])
  })

  it('普通实例网格把导出器打崩时，退到普通网格并提示，不中断', async () => {
    const scene = floorScene()
    const desks = new InstancedMesh(new BoxGeometry(1.2, 0.05, 0.6), new MeshStandardMaterial(), 4)
    desks.name = 'WorkstationDesks'
    desks.count = 4
    scene.getObjectByName('FloorInterior')?.add(desks)
    let calls = 0
    const result = await exportCurrentFloorGlb({
      view: 'floor',
      floorId: 'F12',
      scene,
      download: () => {},
      loadExporter: async () => ({
        async parseAsync(input) {
          calls += 1
          let instanced = false
          for (const root of input as Object3D[]) {
            root.traverse((object) => {
              if ((object as InstancedMesh).isInstancedMesh) instanced = true
            })
          }
          if (instanced) throw new Error('instanced')
          return tinyGlb()
        },
      }),
    })
    expect(result.ok).toBe(true)
    expect(result.partial).toBe(true)
    expect(result.message).toBe('已下载 F12.glb。部分模型没有完整写入')
    expect(calls).toBe(2)
  })

  it('实例颜色和合批文字记成不完整，但文件仍然下载', async () => {
    const scene = floorScene()
    const monitors = new InstancedMesh(new BoxGeometry(0.4, 0.3, 0.02), new MeshBasicMaterial(), 2)
    monitors.name = 'WorkstationMonitors'
    monitors.count = 2
    monitors.setColorAt(0, new Color('#ff6a5c'))
    const labels = new Mesh(new BoxGeometry(0.4, 0.1, 0.01), new MeshBasicMaterial())
    labels.name = 'RoomLabelBatchedText'
    const interior = scene.getObjectByName('FloorInterior')
    interior?.add(monitors)
    interior?.add(labels)
    const hook = ports(scene)
    const result = await exportCurrentFloorGlb(hook)
    expect(result).toEqual({
      ok: true,
      partial: true,
      message: '已下载 F12.glb。实例、合批没有完整写入',
    })
    expect(hook.downloaded).toHaveLength(1)
  })

  it('没进层、没有场景、空层、导出失败各有提示，且不抛', async () => {
    const overview = ports(floorScene(), { view: 'building' })
    expect(await exportCurrentFloorGlb(overview)).toEqual({
      ok: false,
      partial: false,
      message: FLOOR_GLB_NEED_FLOOR,
    })
    expect(overview.calls).toEqual([])
    const missing = ports(null)
    expect(await exportCurrentFloorGlb(missing)).toEqual({
      ok: false,
      partial: false,
      message: FLOOR_GLB_EARLY,
    })
    expect(missing.calls).toEqual([])
    const empty = new Group()
    expect(await exportCurrentFloorGlb(ports(empty))).toEqual({
      ok: false,
      partial: false,
      message: FLOOR_GLB_EMPTY,
    })
    let downloaded = false
    const boom = await exportCurrentFloorGlb({
      view: 'floor',
      floorId: 'F12',
      scene: floorScene(),
      download: () => {
        downloaded = true
      },
      loadExporter: async () => ({
        async parseAsync() {
          throw new Error('boom')
        },
      }),
    })
    expect(downloaded).toBe(false)
    expect(boom).toEqual({ ok: false, partial: false, message: FLOOR_GLB_FAILED })
  })

  it('真实 GLTFExporter 只写出当前层可见网格', async () => {
    if (typeof globalThis.FileReader !== 'function') {
      class PolyfillFileReader {
        result: ArrayBuffer | null = null
        onloadend: null | (() => void) = null
        readAsArrayBuffer(blob: Blob) {
          void blob.arrayBuffer().then((buffer) => {
            this.result = buffer
            this.onloadend?.()
          })
        }
      }
      globalThis.FileReader = PolyfillFileReader as unknown as typeof FileReader
    }
    const scene = floorScene()
    scene.getObjectByName('FloorInterior')?.add(shaderMesh('DeviceBadge'))
    const exporter = await loadGlbExporter()
    const subset = floorExportRoots(scene, 'F12')
    const data = await exporter.parseAsync(subset, { binary: true, onlyVisible: true })
    expect(data).toBeInstanceOf(ArrayBuffer)
    const bytes = data as ArrayBuffer
    const view = new DataView(bytes)
    expect(view.getUint32(0, true)).toBe(0x46546c67)
    const names = (glbJson(bytes).nodes ?? []).map((node) => node.name)
    expect(names).toContain('FloorSlab')
    expect(names).toContain('FloorBand')
    expect(names).not.toContain('HiddenCap')
    expect(names).not.toContain('FloorCurtain-F12')
    expect(names).not.toContain('SiteTrees')
    expect(names).not.toContain('FloorShell-F1')
    expect(names).not.toContain('OtherBand')
  })
})

describe('导出包不进首屏', () => {
  it('按钮跟 T049 并列，Exporter 点击后才拉取', () => {
    const dock = read('./ViewmarkDock.tsx')
    const src = read('./floorGlb.ts')
    const css = read('./viewmark.css')
    expect(dock).toMatch(/导出本层/)
    expect(dock).toMatch(/aria-label="导出当前楼层 GLB"/)
    expect(dock).toMatch(/data-floor-glb/)
    expect(dock).toMatch(/import\('\.\/floorGlb'\)/)
    expect(dock).not.toMatch(/from '\.\/floorGlb'/)
    expect(dock).not.toMatch(/GLTFExporter/)
    expect(src).toMatch(/import\('three\/addons\/exporters\/GLTFExporter\.js'\)/)
    expect(src).not.toMatch(/from 'three\/addons\/exporters\/GLTFExporter\.js'/)
    expect(src).toMatch(/parseAsync\(subset, \{ binary: true, onlyVisible: true \}\)/)
    expect(src).toMatch(/view !== 'floor'/)
    expect(src).not.toMatch(/import \{[^}]*\} from 'three'/)
    expect(src).not.toMatch(/from '\.\.\/scene\//)
    expect(css).toMatch(/\.viewmark-glb/)
    expect(USER_CAMERA_SMOOTH_TIME).toBe(0.42)
  })

  it('首屏、雾、T032、后处理和 D310 都不引用这个包', () => {
    const src = read('./floorGlb.ts')
    const eager = [
      '../components/Scene.tsx',
      '../components/Stage.tsx',
      '../App.tsx',
      '../main.tsx',
      '../index.css',
      '../scene/stage/prefetchLazyChunks.ts',
      '../scene/fog.ts',
      '../scene/stage/cameraTransition.ts',
      '../components/scene/postfx/balancedFx.tsx',
      '../components/scene/DemandLoop.tsx',
      '../scene/softShadows.ts',
      '../scene/groundTextures.ts',
      '../viewmarks/dock.tsx',
    ]
    for (const file of eager) {
      expect(read(file)).not.toMatch(/floorGlb|GLTFExporter|导出本层/)
    }
    expect(src).not.toMatch(
      /from ['"][^'"]*(fog|cameraTransition|balancedFx|postfx|DemandLoop|softShadows|groundTextures|Scene)/,
    )
    expect(src).not.toMatch(/FogExp2|smoothTime|postprocessing|jsdelivr/)
    const pkg = JSON.parse(read('../../package.json')) as { dependencies: Record<string, string> }
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
