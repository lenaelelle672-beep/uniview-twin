import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BufferGeometry, Group, Mesh, MeshStandardMaterial, Texture } from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MESHOPT_TEXTURE_BATCH,
  MESHOPT_UPLOAD_IDLE_TIMEOUT_MS,
  meshoptUploadTurn,
  uploadMeshoptDecoded,
  type MeshoptUploadRenderer,
} from './meshopt'

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

function prop(name: string, maps: number) {
  const root = new Group()
  root.name = name
  for (let index = 0; index < 2; index += 1) {
    const material = new MeshStandardMaterial()
    material.map = new Texture({ width: 1024, height: 1024, id: `${name}:${index}:map` })
    if (maps > 1) material.normalMap = new Texture({ width: 1024, height: 1024, id: `${name}:${index}:normal` })
    const mesh = new Mesh(new BufferGeometry(), material)
    mesh.name = `${name}:${index}`
    root.add(mesh)
  }
  return root
}

function recorder(calls: string[]): MeshoptUploadRenderer {
  return {
    initTexture: (texture) => {
      calls.push(`tex:${(texture.image as { id: string }).id}`)
    },
    uploadObject: (object) => {
      calls.push(`geo:${object.name}`)
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('T111 meshopt 解码后分帧上传', () => {
  it('贴图一拍一张，几何随后一拍一个，第一批也先让一拍', async () => {
    const calls: string[] = []
    const stats = await uploadMeshoptDecoded(recorder(calls), [prop('box', 2)], async () => {
      calls.push('turn')
    })
    expect(MESHOPT_TEXTURE_BATCH).toBe(1)
    expect(calls).toEqual([
      'turn',
      'tex:box:0:map',
      'turn',
      'tex:box:0:normal',
      'turn',
      'tex:box:1:map',
      'turn',
      'tex:box:1:normal',
      'turn',
      'geo:box:0',
      'turn',
      'geo:box:1',
    ])
    expect(stats).toMatchObject({ textures: 4, geometries: 2, turns: 6 })
  })

  it('几处同时调用排成一队，两拍之间最多一批', async () => {
    const calls: string[] = []
    const renderer = recorder(calls)
    const turn = async () => {
      calls.push('turn')
      await Promise.resolve()
    }
    const [first, second] = await Promise.all([
      uploadMeshoptDecoded(renderer, [prop('pallet', 1)], turn),
      uploadMeshoptDecoded(renderer, [prop('rack', 1)], turn),
    ])
    expect(first.textures + second.textures).toBe(4)
    const owners = calls.map((call) => call.split(':')[1] ?? '')
    const lastPallet = owners.lastIndexOf('pallet')
    const firstRack = owners.indexOf('rack')
    expect(lastPallet).toBeLessThan(firstRack)
    for (let index = 1; index < calls.length; index += 1) {
      expect(calls[index - 1] === 'turn' || calls[index] === 'turn').toBe(true)
    }
  })

  it('没有渲染器或网格时不让拍、不抛，道具照常挂', async () => {
    let turns = 0
    const turn = async () => {
      turns += 1
    }
    expect(await uploadMeshoptDecoded(undefined, [prop('box', 2)], turn)).toEqual({
      textures: 0,
      geometries: 0,
      turns: 0,
      ms: 0,
    })
    expect(await uploadMeshoptDecoded(recorder([]), [new Group()], turn)).toMatchObject({ textures: 0, turns: 0 })
    expect(turns).toBe(0)
  })

  it('没有 uploadObject 时只交贴图，几何留给首帧', async () => {
    const calls: string[] = []
    const stats = await uploadMeshoptDecoded(
      { initTexture: (texture) => calls.push(`tex:${(texture.image as { id: string }).id}`) },
      [prop('cabinet', 1)],
      async () => {},
    )
    expect(stats).toMatchObject({ textures: 2, geometries: 0 })
    expect(calls).toEqual(['tex:cabinet:0:map', 'tex:cabinet:1:map'])
  })

  it('一拍是先过一帧再等 requestIdleCallback', async () => {
    const order: string[] = []
    let timeout = -1
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      order.push('frame')
      cb(0)
      return 1
    })
    vi.stubGlobal('requestIdleCallback', (cb: IdleRequestCallback, options?: IdleRequestOptions) => {
      order.push('idle')
      timeout = options?.timeout ?? -1
      cb({ didTimeout: false, timeRemaining: () => 8 })
      return 1
    })
    await meshoptUploadTurn()
    expect(order).toEqual(['frame', 'idle'])
    expect(timeout).toBe(MESHOPT_UPLOAD_IDLE_TIMEOUT_MS)
  })

  it('没有 requestIdleCallback 时退回 32ms，和 idleYield 一样', async () => {
    vi.useFakeTimers()
    try {
      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
        cb(0)
        return 1
      })
      vi.stubGlobal('requestIdleCallback', undefined)
      let done = false
      const turn = meshoptUploadTurn().then(() => {
        done = true
      })
      await vi.advanceTimersByTimeAsync(31)
      expect(done).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      await turn
      expect(done).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('沿用 T089 分批，只接 SimReady 晚加载分包，不碰 IdlePrewarm，不新装包', () => {
    const meshopt = read('./meshopt.ts')
    const mount = read('../simready/mount.ts')
    const pkg = JSON.parse(read('../../package.json')) as { dependencies: Record<string, string> }

    expect(meshopt).toMatch(/setMeshoptDecoder\(MeshoptDecoder\)/)
    expect(meshopt).toMatch(/import \{ uploadGpuInBatches \} from '\.\/openPathChunk'/)
    expect(meshopt).toMatch(/requestIdleCallback/)
    expect(meshopt).not.toMatch(/from '\.\/prewarm|store\/store|compileAsync|\.compile\(/)

    const ensure = mount.slice(mount.indexOf('async function ensureFitted'))
    expect(ensure.indexOf('await uploadInFrames(object)')).toBeGreaterThan(ensure.indexOf('loader.loadAsync'))
    expect(ensure.indexOf('await uploadInFrames(object)')).toBeLessThan(ensure.indexOf('fitted.set(id, row)'))
    expect(mount).toMatch(/uploadMeshoptDecoded\(window\.__twinRenderer, \[object\]\)/)

    const src = fileURLToPath(new URL('..', import.meta.url))
    const users = walk(src)
      .filter((path) => /\.tsx?$/.test(path) && !path.endsWith('.test.ts'))
      .filter((path) => /uploadMeshoptDecoded/.test(readFileSync(path, 'utf8')))
      .map((path) => path.slice(src.length).replaceAll('\\', '/'))
      .sort()
    expect(users).toEqual(['scene/meshopt.ts', 'simready/mount.ts'])

    expect(pkg.dependencies.three).toBe('0.186.1')
    expect(pkg.dependencies['@react-three/drei']).toBe('10.7.9')
    expect(pkg.dependencies['@react-three/postprocessing']).toBe('3.1.3')
    expect(Object.keys(pkg.dependencies)).not.toEqual(expect.arrayContaining(['meshoptimizer', 'draco3d', 'scheduler']))
  })
})
