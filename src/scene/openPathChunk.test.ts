import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { growBvhMount, OPEN_PATH_BEFORE_FIRST, OPEN_PATH_LONG_TASKS, uploadGpuInBatches, yieldMain } from './openPathChunk'

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('T089 首帧后分块', () => {
  it('首帧前只保壳、相机和 __twinReady，长任务记在首帧后', () => {
    expect([...OPEN_PATH_BEFORE_FIRST]).toEqual(['shell', 'camera', '__twinReady'])
    expect(OPEN_PATH_LONG_TASKS.map((task) => task.id)).toEqual([
      'glb-parse',
      'texture-upload',
      'geometry-upload',
      'bvh',
      'batched-labels',
    ])
    expect(OPEN_PATH_LONG_TASKS.every((task) => task.when === 'after-first')).toBe(true)
  })

  it('有浏览器 scheduler.yield 时优先用它，不引 npm scheduler', () => {
    const source = read('./openPathChunk.ts')
    expect(source).not.toMatch(/from ['"]scheduler['"]/)
    expect(source).not.toMatch(/import\(['"]scheduler['"]\)/)
    const order: string[] = []
    vi.stubGlobal('scheduler', {
      yield: () => {
        order.push('yield')
        return Promise.resolve()
      },
    })
    vi.stubGlobal('requestIdleCallback', (cb: IdleRequestCallback) => {
      order.push('idle')
      cb({ didTimeout: false, timeRemaining: () => 10 })
      return 1
    })
    return yieldMain().then((kind) => {
      expect(kind).toBe('scheduler.yield')
      expect(order).toEqual(['yield'])
    })
  })

  it('没有 scheduler.yield 时走 requestIdleCallback，再退回分帧', async () => {
    vi.stubGlobal('scheduler', {})
    let idle = 0
    vi.stubGlobal('requestIdleCallback', (cb: IdleRequestCallback) => {
      idle += 1
      cb({ didTimeout: false, timeRemaining: () => 5 })
      return 1
    })
    expect(await yieldMain()).toBe('requestIdleCallback')
    expect(idle).toBe(1)

    vi.stubGlobal('scheduler', undefined)
    vi.stubGlobal('requestIdleCallback', undefined)
    let frames = 0
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frames += 1
      cb(0)
      return 1
    })
    expect(await yieldMain()).toBe('animationFrame')
    expect(frames).toBe(1)
  })

  it('texImage 与几何上传分批，批间让出', async () => {
    const calls: string[] = []
    const textures = [0, 1, 2, 3, 4].map((id) => ({ isTexture: true, image: { id } }))
    const meshes = textures.map((texture, index) => ({
      isMesh: true,
      geometry: { id: index },
      material: { map: texture },
    }))
    const result = await uploadGpuInBatches({
      renderer: {
        initTexture: (texture) => {
          calls.push(`tex:${(texture as { image: { id: number } }).image.id}`)
        },
        uploadObject: (mesh) => {
          calls.push(`geo:${(mesh as { geometry: { id: number } }).geometry.id}`)
        },
      },
      meshes,
      yieldTurn: async () => {
        calls.push('yield')
      },
    })
    expect(result).toEqual({ textures: 5, geometries: 5, yields: 7 })
    expect(calls).toEqual([
      'tex:0',
      'tex:1',
      'yield',
      'tex:2',
      'tex:3',
      'yield',
      'tex:4',
      'yield',
      'geo:0',
      'yield',
      'geo:1',
      'yield',
      'geo:2',
      'yield',
      'geo:3',
      'yield',
      'geo:4',
    ])
  })

  it('同一张贴图只上传一次，没有 uploadObject 时不记几何', async () => {
    const shared = { isTexture: true, image: {} }
    let textures = 0
    const result = await uploadGpuInBatches({
      renderer: {
        initTexture: () => {
          textures += 1
        },
      },
      meshes: [
        { isMesh: true, geometry: {}, material: { map: shared, normalMap: shared } },
        { isMesh: true, geometry: {}, material: { map: shared } },
      ],
      yieldTurn: async () => {},
    })
    expect(textures).toBe(1)
    expect(result.textures).toBe(1)
    expect(result.geometries).toBe(0)
  })

  it('BVH 一次多挂一组，缩短时只卸掉多出来的', () => {
    const signature = (groups: readonly { id: string }[]) => groups.map((group) => group.id).join('|')
    const a = { id: 'a' }
    const b = { id: 'b' }
    const c = { id: 'c' }
    const first = growBvhMount([], [a, b, c], signature)
    expect(first.map((group) => group.id)).toEqual(['a'])
    const second = growBvhMount(first, [a, b, c], signature)
    expect(second.map((group) => group.id)).toEqual(['a', 'b'])
    expect(growBvhMount(second, [a, b, c], signature).map((group) => group.id)).toEqual(['a', 'b', 'c'])
    const full = growBvhMount(second, [a, b, c], signature)
    const done = growBvhMount(full, [a, b, c], signature)
    expect(done).toBe(full)
    expect(growBvhMount(full, [a, b], signature).map((group) => group.id)).toEqual(['a', 'b'])
    expect(growBvhMount(full, [], signature)).toEqual([])
  })

  it('落在 T032 和软阴影门里，不进首屏图，不新装包', () => {
    const overlay = read('../components/AssetLoadOverlay.tsx')
    const shadows = read('./softShadows.ts')
    const ready = read('./overviewReady.ts')
    const scene = read('../components/Scene.tsx')
    const props = read('../components/scene/InstancedProp.tsx')
    const prewarm = read('./stage/prewarmFloorInterior.ts')
    const labels = read('./stage/BatchedRoomLabels.tsx')
    const host = read('./pick/PickBvhHost.tsx')
    const pkg = JSON.parse(read('../../package.json')) as { dependencies: Record<string, string> }
    expect(overlay).toMatch(/正在加载场景/)
    expect(overlay).toMatch(/SOFT_SHADOW_CHUNK_AFTER_FIRST_MS/)
    expect(overlay).not.toMatch(/openPathChunk/)
    expect(overlay).not.toMatch(/from '@react-three\/drei\/web\/Loader'/)
    expect(shadows).toMatch(/SOFT_SHADOW_CHUNK_AFTER_FIRST_MS = 2600/)
    expect(ready).toMatch(/__twinTreeLoReadyAt/)
    expect(ready).toMatch(/w\.__twinReady = true/)
    expect(scene).not.toMatch(/openPathChunk/)
    expect(props).toMatch(/useLoader\.preload\(GLTFLoader, TREE_LO/)
    expect(prewarm).toMatch(/INTERIOR_PREWARM_AFTER_FIRST_MS = 2600/)
    expect(prewarm).toMatch(/uploadObject/)
    expect(prewarm).toMatch(/uploadGpuInBatches/)
    expect(prewarm).toMatch(/yieldMain/)
    expect(labels).toMatch(/yieldMain/)
    expect(labels).toMatch(/uploadGpuInBatches/)
    expect(labels.indexOf('waitCameraRested()')).toBeLessThan(labels.indexOf('batch?.sync('))
    expect(host).toMatch(/growBvhMount/)
    expect(host).toMatch(/yieldMain/)
    expect(pkg.dependencies['@react-three/drei']).toBe('10.7.9')
    expect(pkg.dependencies.three).toBe('0.186.1')
    expect(pkg.dependencies.scheduler).toBeUndefined()
    for (const file of ['../components/Stage.tsx', './stage/prefetchLazyChunks.ts', './fog.ts', './assetLoad.ts']) {
      expect(read(file)).not.toMatch(/openPathChunk/)
    }
  })
})
