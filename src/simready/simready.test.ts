import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { composeOverlay } from '../grid/mount'
import { SIMREADY_SOURCE_BLOCK } from '../../scripts/simreadyPlugin'
import {
  ATTRIBUTION_HREF,
  COMMUNITY_CONVERT_URL,
  CREDIT_EN,
  CREDIT_ZH,
  NVIDIA_SIMREADY_URL,
  SIMREADY_PROPS,
  TASTE_ANCHOR,
  rowCenters,
  tasteEnabled,
  tasteScale,
} from './catalog'

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

describe('试吃摆位和署名', () => {
  it('小道具放大，货架保持原尺寸，一排绕锚点排开', () => {
    expect(tasteScale({ x: 0.699, y: 0.51, z: 0.521 })).toBeCloseTo(2.2 / 0.699, 5)
    expect(tasteScale({ x: 4, y: 3.01, z: 2.067 })).toBe(1)
    expect(tasteScale({ x: 0, y: 0, z: 0 })).toBe(1)
    expect(rowCenters([2, 2], 1, 0)).toEqual([-1.5, 1.5])
    expect(rowCenters([], 1, 0)).toEqual([])
    const centers = rowCenters([2, 3, 4], 1, TASTE_ANCHOR.x)
    expect(centers).toHaveLength(3)
    expect(centers[0]).toBeLessThan(centers[1] ?? 0)
    expect(centers[2]).toBeGreaterThan(TASTE_ANCHOR.x)
  })

  it('缺省打开，地址栏可以关掉', () => {
    expect(tasteEnabled('')).toBe(true)
    expect(tasteEnabled('?q=balanced')).toBe(true)
    expect(tasteEnabled('?simready=1')).toBe(true)
    expect(tasteEnabled('?simready=0')).toBe(false)
    expect(tasteEnabled('?q=perf&simready=off')).toBe(false)
  })

  it('署名指向 NVIDIA 源数据集和社区转换包', () => {
    expect(CREDIT_ZH).toContain('NVIDIA')
    expect(CREDIT_EN).toMatch(/NVIDIA SimReady/)
    expect(CREDIT_EN).toMatch(/community convert/)
    expect(NVIDIA_SIMREADY_URL).toBe('https://huggingface.co/datasets/nvidia/simready-assets')
    expect(COMMUNITY_CONVERT_URL).toBe('https://huggingface.co/datasets/codepawl/simready-glb')
    const note = read('../../public/models/simready/ATTRIBUTION-CC-BY.md')
    expect(note).toContain('NVIDIA')
    expect(note).toContain(NVIDIA_SIMREADY_URL)
    expect(note).toContain(COMMUNITY_CONVERT_URL)
    expect(note).toMatch(/CC-BY|署名/)
    expect(ATTRIBUTION_HREF).toBe('/models/simready/ATTRIBUTION-CC-BY.md')
  })

  it('四个 GLB 按实测字节进 public，不是整库', () => {
    const sizes: Record<string, number> = {
      'box_cardboard_a01.glb': 55584,
      'pallet_block_a01.glb': 161064,
      'cabinet_file_d02.glb': 79924,
      'rack_large_empty_a01.glb': 791208,
    }
    expect(SIMREADY_PROPS.map((prop) => prop.file)).toEqual(Object.keys(sizes))
    for (const [file, size] of Object.entries(sizes)) {
      const bytes = readFileSync(new URL(`../../public/models/simready/${file}`, import.meta.url))
      expect(bytes.byteLength).toBe(size)
      const jsonLen = bytes.readUInt32LE(12)
      const json = JSON.parse(bytes.subarray(20, 20 + jsonLen).toString('utf8')) as {
        extensionsRequired?: string[]
        images?: Array<{ mimeType?: string }>
      }
      expect(json.extensionsRequired).toEqual(
        expect.arrayContaining(['EXT_meshopt_compression', 'EXT_texture_webp', 'KHR_mesh_quantization']),
      )
      expect(json.images?.every((image) => image.mimeType === 'image/webp')).toBe(true)
    }
  })

  it('第七个槽位缺省时，原来的格网组合不变', () => {
    expect(composeOverlay(null, null, null)).toBeNull()
    expect(composeOverlay('measure', 'grid', 'author', 'segments', 'screen', 'poster')).toMatchObject({
      props: { children: ['measure', 'grid', 'author', 'segments', 'screen', 'poster'] },
    })
    expect(composeOverlay(null, null, null, null, null, null, 'taste')).toBe('taste')
  })
})

describe('试吃不进首屏', () => {
  it('晚加载接线在哈希前能摘掉，解码器沿用仓库里的 MeshoptDecoder', () => {
    const dock = read('../viewmarks/dock.tsx')
    const plugin = read('../../scripts/simreadyPlugin.ts')
    const vite = read('../../vite.config.ts')
    const mount = read('./mount.ts')
    const meshopt = read('../scene/meshopt.ts')
    const grid = read('../grid/mount.ts')
    const pkg = JSON.parse(read('../../package.json')) as { dependencies: Record<string, string> }

    expect(dock).toContain(SIMREADY_SOURCE_BLOCK)
    expect(dock.replace(SIMREADY_SOURCE_BLOCK, '')).not.toMatch(/mountSimReady|simready\/mount/)
    expect(plugin).toContain(SIMREADY_SOURCE_BLOCK)
    expect(plugin).toMatch(/name: 'simready-after-hash'/)
    expect(plugin).toMatch(/assets\/SimReadyTaste\.js/)
    expect(plugin).toMatch(/setMeshoptDecoder/)
    expect(plugin).toMatch(/EXT_texture_webp/)
    expect(vite).toMatch(/simreadyAfterHash/)
    expect(grid).toMatch(/__twinSimReadyNode/)
    expect(mount).toMatch(/installMeshopt/)
    expect(mount).toMatch(/child\.raycast = \(\) => \{\}/)
    expect(mount).toMatch(/name: 'SimReadyTaste'/)
    expect(mount).toMatch(/NVIDIA SimReady/)
    expect(mount).toMatch(/community convert/)
    expect(mount).not.toMatch(/station-explode|demandFrame|PickBvh|ExplodedLayout|from '@react-three\/drei'/)
    expect(meshopt).toMatch(/setMeshoptDecoder\(MeshoptDecoder\)/)
    expect(meshopt).toMatch(/meshopt_decoder\.module\.js/)
    expect(pkg.dependencies.three).toBe('0.186.1')
    expect(pkg.dependencies['@react-three/drei']).toBe('10.7.9')
    expect(pkg.dependencies.meshoptimizer).toBeUndefined()
    expect(Object.keys(pkg.dependencies)).not.toEqual(expect.arrayContaining(['meshoptimizer', 'draco3d']))
  })

  it('纸箱经 MeshoptDecoder 解开，三角面和原来一致', async () => {
    const host = globalThis as { self?: unknown; Image?: unknown; HTMLImageElement?: unknown; createImageBitmap?: unknown }
    const previousSelf = host.self
    const previousImage = host.Image
    const previousCreate = URL.createObjectURL
    host.self = globalThis
    class FakeImage {
      width = 8
      height = 8
      onload: (() => void) | null = null
      set src(_value: string) {
        queueMicrotask(() => this.onload?.())
      }
    }
    host.Image = FakeImage
    host.HTMLImageElement = FakeImage
    host.createImageBitmap = async () => ({ width: 8, height: 8, close() {} })
    URL.createObjectURL = () => 'blob:fake'
    const { Box3, Vector3 } = await import('three')
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
    const { installMeshopt } = await import('../scene/meshopt')
    const loader = new GLTFLoader()
    installMeshopt(loader)
    expect(loader.meshoptDecoder).toBeTruthy()
    const bytes = readFileSync(new URL('../../public/models/simready/box_cardboard_a01.glb', import.meta.url))
    const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
    const box = new Box3().setFromObject(gltf.scene)
    const size = box.getSize(new Vector3())
    let tris = 0
    gltf.scene.traverse((child) => {
      const mesh = child as { isMesh?: boolean; geometry?: { index?: { count: number } | null } }
      if (!mesh.isMesh || !mesh.geometry?.index) return
      tris += mesh.geometry.index.count / 3
    })
    expect(tris).toBe(554)
    expect(size.x).toBeCloseTo(0.699, 2)
    expect(size.y).toBeGreaterThan(0.4)
    URL.createObjectURL = previousCreate
    host.self = previousSelf
    host.Image = previousImage
  })
})
