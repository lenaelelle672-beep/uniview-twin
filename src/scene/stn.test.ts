import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ClampToEdgeWrapping, NoColorSpace, RepeatWrapping, Texture } from 'three'
import { extrudeUp } from './extrude'
import { stampStoneWallUv, stoneWallV, STONE_TILE_M } from './stoneUv'
import { EAST_CANTILEVER_M } from './massing'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../..')

const FILES = {
  'large_sandstone_blocks_nor.webp': {
    bytes: 76902,
    sha256: 'f3a2c27c31019576fb218cff2dd9dd0143d7be1036f217ba815cd6767c954898',
  },
  'large_sandstone_blocks_rough.webp': {
    bytes: 64870,
    sha256: 'da0cf6e950b759bd53688b01f583fd5706d0fc9d8088068483e395ad4f9409eb',
  },
} as const

type TwinWindow = {
  __twinReady?: boolean
  __twinFirstFrameAt?: number
  __twinInvalidate?: () => Promise<void>
  requestAnimationFrame: (cb: FrameRequestCallback) => number
  requestIdleCallback: (cb: IdleRequestCallback, opts?: IdleRequestOptions) => number
}

let rafQueue: FrameRequestCallback[] = []
let idleQueue: IdleRequestCallback[] = []
let win: TwinWindow
let now = 0

function installWindow() {
  rafQueue = []
  idleQueue = []
  now = 0
  if (vi.isMockFunction(performance.now)) {
    vi.mocked(performance.now).mockImplementation(() => now)
  } else {
    vi.spyOn(performance, 'now').mockImplementation(() => now)
  }
  win = {
    requestAnimationFrame(cb) {
      rafQueue.push(cb)
      return rafQueue.length
    },
    requestIdleCallback(cb) {
      idleQueue.push(cb)
      return idleQueue.length
    },
  }
  vi.stubGlobal('window', win)
  vi.stubGlobal('requestAnimationFrame', win.requestAnimationFrame)
  vi.stubGlobal('requestIdleCallback', win.requestIdleCallback)
}

function flushRaf() {
  const queued = rafQueue
  rafQueue = []
  for (const cb of queued) cb(0)
}

function flushIdle() {
  const queued = idleQueue
  idleQueue = []
  for (const cb of queued) cb({ didTimeout: false, timeRemaining: () => 50 })
}

async function pump(times = 30) {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve()
    flushRaf()
  }
}

async function loadModule() {
  vi.resetModules()
  installWindow()
  return import('./stn')
}

afterEach(async () => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.resetModules()
  const { stoneMaterial } = await import('./materials')
  stoneMaterial.normalMap = null
  stoneMaterial.roughnessMap = null
  stoneMaterial.needsUpdate = true
})

describe('T136 东楼基座石材', () => {
  it('两张 1k WebP 在 public，字节和 sha256 与 ready 包一致', () => {
    for (const [name, meta] of Object.entries(FILES)) {
      const buf = readFileSync(join(root, 'public/textures/stone', name))
      expect(buf.subarray(0, 4).toString()).toBe('RIFF')
      expect(buf.subarray(8, 12).toString()).toBe('WEBP')
      expect(buf.length).toBe(meta.bytes)
      expect(createHash('sha256').update(buf).digest('hex')).toBe(meta.sha256)
    }
  })

  it('墙面 V 把线脚对在顶底，中间不把整张 trimsheet 平铺', () => {
    const height = 19.6
    expect(STONE_TILE_M).toBe(3)
    expect(stoneWallV(0, height)).toBeCloseTo(0, 6)
    expect(stoneWallV(height, height)).toBeCloseTo(STONE_TILE_M, 6)
    const mid = stoneWallV(height / 2, height) / STONE_TILE_M
    expect(mid).toBeGreaterThan(0.08)
    expect(mid).toBeLessThan(0.92)
    // 若按无缝 3 m 平铺，19.6 中段会落到线脚带附近；这里应落在砌块区。
    expect(mid).not.toBeCloseTo(((height / 2) % STONE_TILE_M) / STONE_TILE_M, 2)
  })

  it('挤出墙面 UV 以米计，顶面不用线脚带', () => {
    const geometry = extrudeUp(
      [
        [0, 0],
        [10, 0],
        [10, 4],
        [0, 4],
      ],
      19.6,
      [],
      'top',
    )
    stampStoneWallUv(geometry, 19.6)
    const uv = geometry.getAttribute('uv')
    const pos = geometry.getAttribute('position')
    const nrm = geometry.getAttribute('normal')
    let sides = 0
    let caps = 0
    for (let i = 0; i < pos.count; i += 1) {
      if (!nrm || (nrm.getX(i) === 0 && nrm.getY(i) === 0 && nrm.getZ(i) === 0)) continue
      const y = pos.getY(i)
      const v = uv.getY(i)
      if (Math.abs(nrm.getY(i)) > 0.5) {
        caps += 1
        const texV = v / STONE_TILE_M
        expect(texV).toBeGreaterThan(0.08)
        expect(texV).toBeLessThan(0.92)
        continue
      }
      sides += 1
      if (y < 1e-4) expect(v).toBeCloseTo(0, 5)
      if (y > 19.6 - 1e-4) expect(v).toBeCloseTo(STONE_TILE_M, 5)
    }
    expect(sides).toBeGreaterThan(0)
    expect(caps).toBeGreaterThan(0)
    geometry.dispose()
  })

  it('Site 动态 import 石材调度，主包接线不含 useLoader；东楼非白模用 stoneMaterial', () => {
    const decor = readFileSync(join(here, 'stage/floorDecor.tsx'), 'utf8')
    expect(decor).toMatch(/import\('\.\.\/stn'\)/)
    expect(decor).toMatch(/arm\(\)/)
    const ground = readFileSync(join(here, 'groundTextures.ts'), 'utf8')
    expect(ground).not.toMatch(/stn/)
    const site = readFileSync(join(here, '../components/scene/Site.tsx'), 'utf8')
    expect(site).toMatch(/scheduleGroundTextures\(\)/)
    expect(site).not.toMatch(/useLoader/)
    expect(site).not.toMatch(/stn/)
    const east = readFileSync(join(here, '../components/scene/EastBlock.tsx'), 'utf8')
    expect(east).toMatch(/stoneMaterial/)
    expect(east).toMatch(/_s\.g/)
    expect(east).not.toMatch(/stampStoneWallUv/)
    expect(east).not.toMatch(/stoneUv/)
    expect(east).toMatch(/model \? solidMaterial : stoneMaterial/)
    expect(east).toMatch(/!model && <EastGrille/)
    expect(east).toMatch(/model \? solidMaterial : stoneMaterial/)
    expect(east).not.toMatch(/mergeGeometries\(\[upper, lower\]/)
    expect(east).not.toMatch(/useLoader/)
    const src = readFileSync(join(here, 'stn.ts'), 'utf8')
    expect(src).toMatch(/__twinReady === true/)
    expect(src).toMatch(/FLOOR_SHELL_AFTER_FIRST_MS/)
    expect(src).toMatch(/ClampToEdgeWrapping/)
    expect(src).toMatch(/1 \/ STONE_TILE_M/)
    expect(src).toMatch(/stampStoneWallUv/)
    expect(src).toMatch(/_s\.g/)
    expect(src).not.toMatch(/metalnessMap/)
    expect(src).not.toMatch(/\.map\s*=/)
    expect(src).not.toMatch(/useLoader\(/)
    expect(src).not.toMatch(/ktx2|basis|albedo|polyhaven\.com\/files/i)
    expect(EAST_CANTILEVER_M).toBe(4)
  })

  it('只有 Ready、或只有首帧、或首帧后不到 2600ms，都不请求', async () => {
    const readyOnly = await loadModule()
    const readyUrls: string[] = []
    readyOnly.arm((url) => {
      readyUrls.push(url)
    })
    win.__twinReady = true
    await pump()
    flushIdle()
    expect(readyUrls).toEqual([])

    const frameOnly = await loadModule()
    const frameUrls: string[] = []
    frameOnly.arm((url) => {
      frameUrls.push(url)
    })
    win.__twinFirstFrameAt = 12
    await pump()
    flushIdle()
    expect(frameUrls).toEqual([])

    const early = await loadModule()
    const earlyUrls: string[] = []
    early.arm((url) => {
      earlyUrls.push(url)
    })
    win.__twinReady = true
    win.__twinFirstFrameAt = 100
    now = 100
    await pump()
    flushIdle()
    expect(earlyUrls).toEqual([])
    now = 100 + 2599
    await pump()
    flushIdle()
    await Promise.resolve()
    await Promise.resolve()
    expect(earlyUrls).toEqual([])
  })

  it('首帧过后满 2600ms，再经下一帧和 idle，才赋 normalMap 与 roughnessMap', async () => {
    const mod = await loadModule()
    const { applySurfaceMode, stoneMaterial } = await import('./materials')
    stoneMaterial.normalMap = null
    stoneMaterial.roughnessMap = null
    const version = stoneMaterial.version
    const made = new Map<string, Texture>()
    const urls: string[] = []
    mod.arm((url, onLoad) => {
      urls.push(url)
      const texture = new Texture()
      made.set(url, texture)
      onLoad(texture)
    })
    win.__twinReady = true
    win.__twinFirstFrameAt = 20
    now = 20
    await pump()
    flushIdle()
    expect(urls).toEqual([])

    let kicks = 0
    win.__twinInvalidate = () => {
      kicks += 1
      return Promise.resolve()
    }
    now = 20 + 2600
    await pump()
    expect(idleQueue).toHaveLength(1)
    expect(urls).toEqual([])
    flushIdle()
    await Promise.resolve()
    await Promise.resolve()

    expect(urls).toEqual([
      '/textures/stone/large_sandstone_blocks_nor.webp',
      '/textures/stone/large_sandstone_blocks_rough.webp',
    ])
    const nor = made.get('/textures/stone/large_sandstone_blocks_nor.webp')
    const rough = made.get('/textures/stone/large_sandstone_blocks_rough.webp')
    expect(nor).toBeDefined()
    expect(rough).toBeDefined()
    expect(nor!.colorSpace).toBe(NoColorSpace)
    expect(nor!.wrapS).toBe(RepeatWrapping)
    expect(nor!.wrapT).toBe(ClampToEdgeWrapping)
    expect(nor!.repeat.x).toBeCloseTo(1 / 3, 6)
    expect(nor!.repeat.y).toBeCloseTo(1 / 3, 6)
    expect(nor!.anisotropy).toBe(4)
    expect(stoneMaterial.normalMap).toBe(nor)
    expect(stoneMaterial.roughnessMap).toBe(rough)
    expect(stoneMaterial.map).toBeNull()
    expect(stoneMaterial.metalnessMap).toBeNull()
    expect(stoneMaterial.version).toBeGreaterThan(version)
    expect(kicks).toBe(1)

    applySurfaceMode('day')
    expect(stoneMaterial.normalMap).toBe(nor)
    expect(stoneMaterial.map).toBeNull()
    applySurfaceMode('night')
    expect(stoneMaterial.roughnessMap).toBe(rough)
    expect(stoneMaterial.map).toBeNull()
  })

  it('性能档各向异性保持 1，且重复调度不会再 load', async () => {
    const mod = await loadModule()
    const { useTwinStore } = await import('../store/store')
    const { stoneMaterial } = await import('./materials')
    stoneMaterial.normalMap = null
    stoneMaterial.roughnessMap = null
    useTwinStore.setState({ quality: 'perf' })
    let calls = 0
    mod.arm((_url, onLoad) => {
      calls += 1
      const texture = new Texture()
      onLoad(texture)
    })
    mod.arm(() => {
      calls += 100
    })
    win.__twinReady = true
    win.__twinFirstFrameAt = 1
    now = 1
    await pump()
    flushIdle()
    expect(calls).toBe(0)
    now = 1 + 2600
    await pump()
    flushIdle()
    await Promise.resolve()
    await Promise.resolve()
    expect(calls).toBe(2)
    const map = stoneMaterial.normalMap as Texture | null
    expect(map).not.toBeNull()
    expect(map!.anisotropy).toBe(1)
  })
})
