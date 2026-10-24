import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { demoCameraAnchors } from '../cameras-demo/DEMO_cameras'
import { CORE } from '../scene/stage/layout'
import { SLAB_M } from '../scene/stage/cut'
import { FOG_DENSITY } from '../scene/fog'
import { USER_CAMERA_SMOOTH_TIME } from '../scene/stage/cameraTransition'
import { resetTwinStore, useTwinStore } from '../store/store'
import { mountWallDecals } from './mount'
import { DECAL_SOURCE_BLOCK } from '../../scripts/decalPlugin'
import {
  ALERT_TEXTURE,
  B1_CORE_WALLS,
  DECAL_MESH_CAP,
  DEMO_TEXTURE,
  STICKER_CAP,
  STICKER_LIFT_M,
  STICKER_SLAB_M,
  WALL_GAP_M,
  acceptsDecalReceiver,
  assertLocalDecalUrl,
  buildStickers,
  decalsLayerOn,
  orderAnchors,
  readDesks,
  readWalls,
  receiverKind,
  sceneBlocksDecal,
  sceneKindForWall,
  stickerWorldY,
  type AnchorPoint,
  type WallSeg,
} from './stickers'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../..')

function read(path: string): string {
  return readFileSync(join(here, path), 'utf8')
}

const WALL: WallSeg = { kind: 'wall', a: [0, 0], b: [4, 0] }

function anchors(): AnchorPoint[] {
  return [
    { id: 'alert-F12-1', role: 'alert', x: 1, z: 2 },
    { id: 'DEMO-F12-CAM1', role: 'demo', x: 2, z: -3 },
    { id: 'DEMO-F12-CAM2', role: 'demo', x: 3, z: 3 },
    { id: 'DEMO-F12-CAM3', role: 'demo', x: 0.2, z: 2.2 },
  ]
}

describe('贴花落点和上限', () => {
  it('告警在前，最多三张，其中 Decal 不超过两张，第三张改走平面', () => {
    const stickers = buildStickers({ anchors: anchors(), walls: [WALL], elevation: 10, lift: 2 })
    expect(stickers).toHaveLength(STICKER_CAP)
    expect(STICKER_CAP).toBe(3)
    expect(DECAL_MESH_CAP).toBe(2)
    expect(stickers.map((item) => item.mode)).toEqual(['decal', 'decal', 'image'])
    expect(stickers.map((item) => item.role)).toEqual(['alert', 'demo', 'demo'])
    expect(stickers[0]?.sceneKind).toBe('instanced')
    expect(stickers[0]?.receiver).toBe('mesh')
    expect(stickers[0]?.y).toBeCloseTo(stickerWorldY(10, 2), 5)
    expect(stickers[0]?.x).toBeCloseTo(1, 5)
    expect(stickers[0]?.z).toBeCloseTo(WALL_GAP_M, 5)
    expect(stickers[0]?.rotY).toBeCloseTo(0, 5)
    expect(stickers[1]?.rotY).toBeCloseTo(Math.PI, 5)
    expect(stickers[1]?.z).toBeCloseTo(-WALL_GAP_M, 5)
    expect(stickers.every((item) => item.texture.startsWith('/textures/decals/'))).toBe(true)
    expect(stickers[0]?.texture).toBe(ALERT_TEXTURE)
    expect(stickers[1]?.texture).toBe(DEMO_TEXTURE)
  })

  it('Batched 墙不投影，实例墙也不把 Decal 挂到实例上', () => {
    const blocked = buildStickers({ anchors: anchors(), walls: [WALL], elevation: 0, batchedBlocked: true })
    expect(blocked.every((item) => item.mode === 'image' && item.receiver === 'batched')).toBe(true)
    expect(acceptsDecalReceiver('mesh')).toBe(true)
    expect(acceptsDecalReceiver('instanced')).toBe(false)
    expect(acceptsDecalReceiver('batched')).toBe(false)
    expect(acceptsDecalReceiver('missing')).toBe(false)
    expect(receiverKind({ isBatchedMesh: true, isMesh: true })).toBe('batched')
    expect(receiverKind({ isInstancedMesh: true, isMesh: true })).toBe('instanced')
    expect(receiverKind({ isMesh: true })).toBe('mesh')
    expect(receiverKind(null)).toBe('missing')
    expect(sceneKindForWall('core-wall', false)).toBe('mesh')
    expect(sceneKindForWall('wall', false)).toBe('instanced')
    expect(sceneKindForWall('wall', true)).toBe('batched')
    expect(
      sceneBlocksDecal({
        traverse: (fn) => fn({ isBatchedMesh: true, name: 'CurtainWall' }),
      }),
    ).toBe(true)
    expect(
      sceneBlocksDecal({
        traverse: (fn) => fn({ isBatchedMesh: false, name: 'FloorWalls' }),
      }),
    ).toBe(false)
    expect(sceneBlocksDecal(null)).toBe(false)
  })

  it('锚点太近的 DEMO 会让位，告警优先', () => {
    const alert = { id: 'alert', role: 'alert' as const, x: 1, z: 1 }
    const demos = [
      { id: 'near', role: 'demo' as const, x: 1.2, z: 1.1 },
      { id: 'far', role: 'demo' as const, x: 8, z: 1 },
    ]
    expect(orderAnchors(alert, demos).map((item) => item.id)).toEqual(['alert', 'far'])
    expect(orderAnchors(null, demos).map((item) => item.id)).toEqual(['near', 'far'])
  })

  it('贴图只接受 public/textures/decals', () => {
    expect(assertLocalDecalUrl(ALERT_TEXTURE)).toBe(ALERT_TEXTURE)
    expect(assertLocalDecalUrl(DEMO_TEXTURE)).toBe(DEMO_TEXTURE)
    expect(() => assertLocalDecalUrl('https://cdn.example.com/alarm.png')).toThrow(/本地/)
    expect(() => assertLocalDecalUrl('/textures/decals/../alarm.png')).toThrow(/本地/)
    expect(() => assertLocalDecalUrl('/textures/ground/road_nor.webp')).toThrow(/本地/)
  })

  it('高度对齐楼板顶，B1 核心筒四边跟现有 CORE 一致', () => {
    expect(STICKER_SLAB_M).toBe(SLAB_M)
    expect(stickerWorldY(48)).toBeCloseTo(48 + SLAB_M + STICKER_LIFT_M, 5)
    expect(B1_CORE_WALLS).toEqual([
      { kind: 'core-wall', a: [CORE.x0, CORE.z0], b: [CORE.x1, CORE.z0] },
      { kind: 'core-wall', a: [CORE.x1, CORE.z0], b: [CORE.x1, CORE.z1] },
      { kind: 'core-wall', a: [CORE.x1, CORE.z1], b: [CORE.x0, CORE.z1] },
      { kind: 'core-wall', a: [CORE.x0, CORE.z1], b: [CORE.x0, CORE.z0] },
    ])
  })

  it('F12 图纸上 DEMO 机位和告警工位都能贴到墙上', () => {
    const raw: unknown = JSON.parse(readFileSync(join(root, 'public/floors/F12.json'), 'utf8'))
    const walls = readWalls(raw)
    const desks = readDesks(raw)
    expect(walls.length).toBeGreaterThan(20)
    const desk = desks.find((item) => item.id === 'F12-20') ?? desks[0]
    expect(desk).toBeTruthy()
    const demos = demoCameraAnchors('F12').map((anchor) => ({
      id: anchor.id,
      role: 'demo' as const,
      x: anchor.x,
      z: anchor.z,
    }))
    const stickers = buildStickers({
      anchors: orderAnchors({ id: `alert-${desk!.id}`, role: 'alert', x: desk!.x, z: desk!.z }, demos),
      walls,
      elevation: 52.863,
    })
    expect(stickers.length).toBeGreaterThan(0)
    expect(stickers.length).toBeLessThanOrEqual(STICKER_CAP)
    expect(stickers.filter((item) => item.mode === 'decal').length).toBeLessThanOrEqual(DECAL_MESH_CAP)
    expect(stickers.some((item) => item.role === 'alert')).toBe(true)
    expect(stickers.some((item) => item.role === 'demo')).toBe(true)
    for (const sticker of stickers) {
      expect(Number.isFinite(sticker.x)).toBe(true)
      expect(Number.isFinite(sticker.z)).toBe(true)
      expect(sticker.y).toBeGreaterThan(52)
      expect(sticker.texture.includes('://')).toBe(false)
    }
  })
})

describe('贴花开关默认关', () => {
  beforeEach(() => {
    resetTwinStore()
  })

  it('缺省字段不算开，打开后也不改别人的图层', () => {
    expect(decalsLayerOn(null)).toBe(false)
    expect(decalsLayerOn({})).toBe(false)
    expect(decalsLayerOn({ decals: false })).toBe(false)
    expect(decalsLayerOn({ decals: true })).toBe(true)
    const initial = useTwinStore.getState().layers
    expect(initial).not.toHaveProperty('decals')
    expect(decalsLayerOn(initial)).toBe(false)
    useTwinStore.getState().setLayer('decals', true)
    const next = useTwinStore.getState().layers
    expect(decalsLayerOn(next)).toBe(true)
    expect(next.people).toBe(true)
    expect(next.edges).toBe(false)
    expect((next as { wireframe?: boolean }).wireframe).toBeUndefined()
  })

  it('没有 document 时挂载直接返回', () => {
    expect(() => mountWallDecals()).not.toThrow()
  })

  it('和网格抢同一个测距槽时不会互相 flush 到爆栈', () => {
    const seen: string[] = []
    let gridRaw: ((node: unknown) => void) | null = null
    const setNode = () => {
      seen.push('set')
    }
    const rewrapGrid = () => {
      const current = window.__twinMeasureSlot as ((node: unknown) => void) & { __gridBridge?: boolean }
      if (!current || current.__gridBridge) return
      gridRaw = current
      const wrapped = (node: unknown) => {
        seen.push('grid')
        if (seen.length > 24) throw new Error('cycle')
        gridRaw?.(node)
      }
      ;(wrapped as { __gridBridge?: boolean }).__gridBridge = true
      window.__twinMeasureSlot = wrapped
    }
    const intervals: Array<() => void> = []
    vi.stubGlobal('window', {
      __twinMeasureSlot: setNode,
      setInterval: (fn: () => void) => {
        intervals.push(fn)
        return intervals.length
      },
    })
    vi.stubGlobal('document', {
      querySelector: () => null,
      body: {},
    })
    vi.stubGlobal(
      'MutationObserver',
      class {
        observe() {}
        disconnect() {}
      },
    )
    try {
      rewrapGrid()
      mountWallDecals()
      for (let i = 0; i < 4; i += 1) {
        rewrapGrid()
        for (const fn of intervals) fn()
      }
      expect(() => window.__twinMeasureSlot?.(null)).not.toThrow()
      expect(seen).toEqual(['grid', 'set'])
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('贴花分包', () => {
  it('懒挂在 dock 哈希之后，不进首屏，不改雾和 T032，也不碰浮动卡', () => {
    expect(USER_CAMERA_SMOOTH_TIME).toBe(0.42)
    expect(FOG_DENSITY.day).toBe(0.00112)
    expect(FOG_DENSITY.night).toBe(0.00096)

    const dock = read('../viewmarks/dock.tsx')
    const mount = read('./mount.ts')
    const live = read('./WallDecals.tsx')
    const policy = read('./stickers.ts')
    const plugin = read('../../scripts/decalPlugin.ts')
    const vite = read('../../vite.config.ts')
    const view = read('../store/viewSlice.ts')
    const card = read('../scene/focusFloat/FocusFloatCard.tsx')
    const host = read('../scene/focusFloat/FocusFloatHost.tsx')
    const pkg = JSON.parse(read('../../package.json')) as { dependencies: Record<string, string> }

    expect(dock).toContain(DECAL_SOURCE_BLOCK.trimEnd())
    expect(dock).toMatch(/import\('\.\.\/decals\/mount'\)/)
    expect(dock).toMatch(/mountWallDecals\(\)/)
    expect(dock).not.toMatch(/from '\.\.\/decals\/mount'/)
    expect(plugin).toContain(DECAL_SOURCE_BLOCK)
    expect(plugin).toMatch(/name: 'decal-after-hash'/)
    expect(plugin).toMatch(/apply: 'build'/)
    expect(plugin).toMatch(/assets\/DecalMount\.js/)
    expect(plugin).toMatch(/assets\/WallDecals\.js/)
    expect(vite).toMatch(/decalAfterHash/)
    expect(mount).toMatch(/import\('\.\/WallDecals'\)/)
    expect(mount).not.toMatch(/import \{ WallDecals \}/)
    expect(mount).not.toMatch(/@react-three|from 'three'/)
    expect(mount).toMatch(/dataset\.layer = 'decals'/)
    expect(mount).toMatch(/贴花/)
    expect(view).toMatch(/LayerToggleKey = LayerKey \| 'wireframe' \| 'plaques' \| 'decals'/)
    expect(view).not.toMatch(/decals:\s*(true|false)/)

    expect(live).toMatch(/@react-three\/drei\/core\/Decal/)
    expect(live).toMatch(/@react-three\/drei\/core\/Image/)
    expect(live).toMatch(/<Decal/)
    expect(live).toMatch(/<Image/)
    expect(live).not.toMatch(/from '@react-three\/drei'/)
    expect(live).not.toMatch(/<Html|FocusFloat|focusFloat|occlude/)
    expect(live).not.toMatch(/mesh=\{/)
    expect(live).toMatch(/DecalReceiver-/)
    expect(live).toMatch(/sceneBlocksDecal/)
    expect(live).not.toMatch(/https?:\/\//)
    expect(live).not.toMatch(/jsdelivr|TextureLoader/)
    expect(policy).not.toMatch(/https?:\/\//)
    expect(card).not.toMatch(/Decal|textures\/decals|WallDecals/)
    expect(host).not.toMatch(/Decal|textures\/decals|WallDecals/)

    const eager = [
      '../components/Scene.tsx',
      '../components/Stage.tsx',
      '../App.tsx',
      '../main.tsx',
      '../index.css',
      '../components/scene/postfx/balancedFx.tsx',
      '../components/scene/DemandLoop.tsx',
      '../scene/stage/prefetchLazyChunks.ts',
      '../scene/fog.ts',
      '../scene/stage/cameraTransition.ts',
      '../scene/softShadows.ts',
      '../viewmarks/LayerPanel.tsx',
    ]
    for (const file of eager) {
      expect(read(file)).not.toMatch(/WallDecals|decals\/mount|core\/Decal|textures\/decals/)
    }
    const blob = [mount, live, policy].join('\n')
    expect(blob).not.toMatch(/from ['"][^'"]*(fog|cameraTransition|balancedFx|postfx|softShadows|DemandLoop)/)
    expect(pkg.dependencies['@react-three/drei']).toBe('10.7.9')
    expect(pkg.dependencies.three).toBe('0.186.1')
    expect(pkg.dependencies['@react-three/fiber']).toBe('9.8.1')
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

    const alarm = join(root, 'public/textures/decals/alarm.png')
    const demo = join(root, 'public/textures/decals/demo.png')
    expect(existsSync(alarm)).toBe(true)
    expect(existsSync(demo)).toBe(true)
    expect(readFileSync(alarm).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    expect(readFileSync(demo).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  })
})
