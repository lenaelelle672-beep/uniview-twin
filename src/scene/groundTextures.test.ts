import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NoColorSpace, PlaneGeometry, RepeatWrapping, Texture } from 'three'
import { extrudeUp } from './extrude'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../..')

const FILES = [
  'grass_nor.webp',
  'grass_rough.webp',
  'road_nor.webp',
  'road_rough.webp',
  'paving_nor.webp',
  'paving_rough.webp',
  'sidewalk_nor.webp',
  'sidewalk_rough.webp',
]

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
  return import('./groundTextures')
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.resetModules()
})

describe('T023 场地法线与粗糙度', () => {
  it('八张 1k WebP 在 public，且不是空文件', () => {
    for (const name of FILES) {
      const buf = readFileSync(join(root, 'public/textures/ground', name))
      expect(buf.subarray(0, 4).toString()).toBe('RIFF')
      expect(buf.subarray(8, 12).toString()).toBe('WEBP')
      expect(buf.length).toBeGreaterThan(8_000)
    }
  })

  it('挤出顶面 UV 已是世界米，条带平面要另印', async () => {
    const geometry = extrudeUp(
      [
        [0, 0],
        [10, 0],
        [10, 4],
        [0, 4],
      ],
      0.1,
      [],
      'top',
    )
    const { stampWorldGroundUv } = await import('./groundTextures')
    const uv = geometry.getAttribute('uv')
    const pos = geometry.getAttribute('position')
    let cap = 0
    for (let i = 0; i < pos.count; i += 1) {
      if (Math.abs(pos.getY(i) - 0.1) > 1e-4) continue
      const world =
        Math.abs(uv.getX(i) - pos.getX(i)) < 1e-3 && Math.abs(uv.getY(i) + pos.getZ(i)) < 1e-3
      if (world) cap += 1
    }
    expect(cap).toBeGreaterThan(0)
    geometry.dispose()

    const ribbon = new PlaneGeometry(10, 4)
    ribbon.rotateX(-Math.PI / 2)
    ribbon.translate(3, 0.12, -5)
    const ribbonUv = ribbon.getAttribute('uv')
    const ribbonPos = ribbon.getAttribute('position')
    expect(ribbonUv.getX(0)).not.toBeCloseTo(ribbonPos.getX(0), 1)
    stampWorldGroundUv(ribbon)
    for (let i = 0; i < ribbonPos.count; i += 1) {
      expect(ribbonUv.getX(i)).toBeCloseTo(ribbonPos.getX(i), 4)
      expect(ribbonUv.getY(i)).toBeCloseTo(-ribbonPos.getZ(i), 4)
    }
    ribbon.dispose()
  })

  it('Site 在条带上印世界 UV，并在挂载后才调度贴图', () => {
    const site = readFileSync(join(here, '../components/scene/Site.tsx'), 'utf8')
    const ribbon = site.slice(site.indexOf('function ribbonGeometry'), site.indexOf('export function Site'))
    expect(ribbon).toMatch(/stampWorldGroundUv/)
    expect(site).toMatch(/scheduleGroundTextures\(\)/)
    expect(site).not.toMatch(/useLoader/)
    const src = readFileSync(join(here, 'groundTextures.ts'), 'utf8')
    expect(src).toMatch(/__twinReady === true/)
    expect(src).toMatch(/__twinFirstFrameAt != null/)
    expect(src).toMatch(/FLOOR_SHELL_AFTER_FIRST_MS/)
    expect(src).toMatch(/performance\.now\(\) - first >= FLOOR_SHELL_AFTER_FIRST_MS/)
    expect(src).toMatch(/requestAnimationFrame/)
    expect(src).toMatch(/requestIdleCallback/)
    expect(src).toMatch(/RepeatWrapping/)
    expect(src).toMatch(/NoColorSpace/)
    expect(src).toMatch(/needsUpdate = true/)
    expect(src).not.toMatch(/metalnessMap/)
    expect(src).not.toMatch(/\.map\s*=/)
    expect(src).not.toMatch(/ktx2|basis|albedo/i)
    expect(src).toMatch(/new TextureLoader\(\)/)
    expect(src).not.toMatch(/new TextureLoader\(\)\.load/)
  })

  it('只有 Ready、或只有首帧，或首帧后不到 2600ms，都不请求', async () => {
    const readyOnly = await loadModule()
    const readyUrls: string[] = []
    readyOnly.scheduleGroundTextures((url) => {
      readyUrls.push(url)
    })
    win.__twinReady = true
    await pump()
    flushIdle()
    expect(readyUrls).toEqual([])
    expect(idleQueue).toHaveLength(0)

    const frameOnly = await loadModule()
    const frameUrls: string[] = []
    frameOnly.scheduleGroundTextures((url) => {
      frameUrls.push(url)
    })
    win.__twinFirstFrameAt = 12
    await pump()
    flushIdle()
    expect(frameUrls).toEqual([])
    expect(idleQueue).toHaveLength(0)

    const early = await loadModule()
    const earlyUrls: string[] = []
    early.scheduleGroundTextures((url) => {
      earlyUrls.push(url)
    })
    win.__twinReady = true
    win.__twinFirstFrameAt = 100
    now = 100
    await pump()
    flushIdle()
    expect(earlyUrls).toEqual([])
    expect(idleQueue).toHaveLength(0)
    now = 100 + 2599
    await pump()
    flushIdle()
    await Promise.resolve()
    await Promise.resolve()
    expect(earlyUrls).toEqual([])
    expect(idleQueue).toHaveLength(0)
  })

  it('首帧过后满 2600ms，再经下一帧和 idle，才赋 normalMap 与 roughnessMap', async () => {
    const mod = await loadModule()
    const { applySurfaceMode, grassMaterial, pavingMaterial, roadMaterial, sidewalkMaterial } = await import('./materials')
    const grassVersion = grassMaterial.version
    const made = new Map<string, Texture>()
    const urls: string[] = []
    mod.scheduleGroundTextures((url, onLoad) => {
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
    expect(idleQueue).toHaveLength(0)

    now = 20 + 2600
    await pump()
    expect(idleQueue).toHaveLength(1)
    expect(urls).toEqual([])
    flushIdle()
    await Promise.resolve()
    await Promise.resolve()

    expect(urls).toEqual([
      '/textures/ground/grass_nor.webp',
      '/textures/ground/grass_rough.webp',
      '/textures/ground/road_nor.webp',
      '/textures/ground/road_rough.webp',
      '/textures/ground/paving_nor.webp',
      '/textures/ground/paving_rough.webp',
      '/textures/ground/sidewalk_nor.webp',
      '/textures/ground/sidewalk_rough.webp',
    ])
    expect(urls.some((url) => /albedo|diff|metal|ktx/i.test(url))).toBe(false)

    const grassNor = made.get('/textures/ground/grass_nor.webp')
    const grassRough = made.get('/textures/ground/grass_rough.webp')
    expect(grassNor).toBeDefined()
    expect(grassRough).toBeDefined()
    expect(grassNor!.colorSpace).toBe(NoColorSpace)
    expect(grassNor!.wrapS).toBe(RepeatWrapping)
    expect(grassNor!.wrapT).toBe(RepeatWrapping)
    expect(grassNor!.repeat.x).toBeCloseTo(1 / 15, 6)
    expect(grassNor!.repeat.y).toBeCloseTo(1 / 15, 6)
    expect(grassNor!.anisotropy).toBe(4)
    expect(made.get('/textures/ground/road_nor.webp')!.repeat.x).toBeCloseTo(1 / 3, 6)
    expect(made.get('/textures/ground/paving_nor.webp')!.repeat.x).toBeCloseTo(1 / 1.8, 6)
    expect(made.get('/textures/ground/sidewalk_nor.webp')!.repeat.x).toBeCloseTo(1 / 2, 6)

    expect(grassMaterial.normalMap).toBe(grassNor)
    expect(grassMaterial.roughnessMap).toBe(grassRough)
    expect(grassMaterial.map).toBeNull()
    expect(grassMaterial.metalnessMap).toBeNull()
    expect(roadMaterial.normalMap).not.toBeNull()
    expect(roadMaterial.roughnessMap).not.toBeNull()
    expect(roadMaterial.map).toBeNull()
    expect(pavingMaterial.normalMap).not.toBeNull()
    expect(pavingMaterial.map).toBeNull()
    expect(sidewalkMaterial.normalMap).not.toBeNull()
    expect(sidewalkMaterial.map).toBeNull()
    expect(grassMaterial.version).toBeGreaterThan(grassVersion)

    applySurfaceMode('day')
    expect(grassMaterial.color.getHexString()).toBe('466e28')
    expect(roadMaterial.color.getHexString()).toBe('202434')
    expect(pavingMaterial.color.getHexString()).toBe('bdd0de')
    expect(sidewalkMaterial.color.getHexString()).toBe('cfe0e8')
    expect(grassMaterial.normalMap).toBe(grassNor)
    expect(grassMaterial.map).toBeNull()

    applySurfaceMode('night')
    expect(grassMaterial.color.getHexString()).toBe('1d2a22')
    expect(roadMaterial.color.getHexString()).toBe('1a1d22')
    expect(pavingMaterial.color.getHexString()).toBe('2a2e32')
    expect(sidewalkMaterial.color.getHexString()).toBe('2c3034')
    expect(grassMaterial.normalMap).toBe(grassNor)
    expect(grassMaterial.roughnessMap).toBe(grassRough)
    expect(roadMaterial.map).toBeNull()
  })

  it('性能档各向异性保持 1，且重复调度不会再 load', async () => {
    const mod = await loadModule()
    const { useTwinStore } = await import('../store/store')
    useTwinStore.setState({ quality: 'perf' })
    let calls = 0
    mod.scheduleGroundTextures((_url, onLoad) => {
      calls += 1
      const texture = new Texture()
      onLoad(texture)
    })
    mod.scheduleGroundTextures(() => {
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
    expect(calls).toBe(8)
    const { roadMaterial } = await import('./materials')
    expect(roadMaterial.normalMap?.anisotropy).toBe(1)
  })
})
