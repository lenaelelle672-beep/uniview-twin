import {
  NoColorSpace,
  RepeatWrapping,
  Texture,
  TextureLoader,
  type BufferGeometry,
  type MeshStandardMaterial,
} from 'three'
import { useTwinStore } from '../store/store'
import { grassMaterial, pavingMaterial, roadMaterial, sidewalkMaterial } from './materials'
import { FLOOR_SHELL_AFTER_FIRST_MS } from './stage/prefetchLazyChunks'

/**
 * 场地只挂法线 + 粗糙度。反照率继续走 applySurfaceMode 的昼夜 color，不设 map。
 * 物理边长来自 Poly Haven info.dimensions（毫米）。UV 以米计，repeat = 1 / 边长。
 * 草地 aerial_grass_rock 15 m，道路 asphalt_02 3 m，铺装 concrete_pavement 1.8 m，
 * 人行道 concrete_floor_painted 2 m。
 */
const GROUND_SURFACES = {
  grass: { material: grassMaterial, nor: '/textures/ground/grass_nor.webp', rough: '/textures/ground/grass_rough.webp', repeat: 1 / 15 },
  road: { material: roadMaterial, nor: '/textures/ground/road_nor.webp', rough: '/textures/ground/road_rough.webp', repeat: 1 / 3 },
  paving: { material: pavingMaterial, nor: '/textures/ground/paving_nor.webp', rough: '/textures/ground/paving_rough.webp', repeat: 1 / 1.8 },
  sidewalk: {
    material: sidewalkMaterial,
    nor: '/textures/ground/sidewalk_nor.webp',
    rough: '/textures/ground/sidewalk_rough.webp',
    repeat: 1 / 2,
  },
} as const

type SurfaceKey = keyof typeof GROUND_SURFACES

export type GroundTextureLoad = (url: string, onLoad: (texture: Texture) => void) => void

let scheduled = false
let loader: TextureLoader | null = null

/**
 * 挤出顶面的 UV 已是 (worldX, -worldZ)。道路 / 人行道是 PlaneGeometry，UV 默认 0–1，
 * 和世界尺度对不上。印成同一套平面坐标后，一套 repeat 才是「每米」而不是「每条带子」。
 */
export function stampWorldGroundUv(geometry: BufferGeometry): void {
  const uv = geometry.getAttribute('uv')
  const pos = geometry.getAttribute('position')
  if (!uv || !pos) return
  for (let i = 0; i < uv.count; i += 1) {
    uv.setXY(i, pos.getX(i), -pos.getZ(i))
  }
  uv.needsUpdate = true
}

function waitUntil(ok: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const tick = () => {
      if (ok()) {
        resolve()
        return
      }
      window.requestAnimationFrame(tick)
    }
    tick()
  })
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve())
  })
}

function idle(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(() => resolve(), { timeout: 1200 })
      return
    }
    window.requestAnimationFrame(() => resolve())
  })
}

function defaultLoad(url: string, onLoad: (texture: Texture) => void): void {
  loader ??= new TextureLoader()
  loader.load(url, onLoad, undefined, () => {
    // 缺图就保持纯色。浏览器网络面板仍能看到失败，这里不再额外打日志。
  })
}

function anisotropy(): number {
  return useTwinStore.getState().quality === 'perf' ? 1 : 4
}

function prepare(texture: Texture, repeat: number): void {
  texture.colorSpace = NoColorSpace
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.repeat.set(repeat, repeat)
  texture.anisotropy = anisotropy()
  texture.needsUpdate = true
}

function redraw(attempt = 0): void {
  const kick = window.__twinInvalidate
  if (kick) {
    void kick()
    return
  }
  if (attempt >= 8) return
  window.requestAnimationFrame(() => redraw(attempt + 1))
}

function assign(material: MeshStandardMaterial, nor: Texture, rough: Texture): void {
  material.normalMap = nor
  material.roughnessMap = rough
  material.needsUpdate = true
  redraw()
}

function startLoads(load: GroundTextureLoad): void {
  const keys = Object.keys(GROUND_SURFACES) as SurfaceKey[]
  for (const key of keys) {
    const surface = GROUND_SURFACES[key]
    const slot: { nor?: Texture; rough?: Texture } = {}
    const finish = () => {
      if (!slot.nor || !slot.rough) return
      assign(surface.material, slot.nor, slot.rough)
    }
    load(surface.nor, (texture) => {
      prepare(texture, surface.repeat)
      slot.nor = texture
      finish()
    })
    load(surface.rough, (texture) => {
      prepare(texture, surface.repeat)
      slot.rough = texture
      finish()
    })
  }
}

/**
 * D322：等 __twinReady 且首帧落下，再等到
 * performance.now() - __twinFirstFrameAt >= FLOOR_SHELL_AFTER_FIRST_MS。
 * d126 的 cutoff 在首帧之后一点点，+1 帧的请求会时进时出；与楼层壳同一道 2600ms 门。
 * 过门后再多一帧和一次 idle，才 TextureLoader。
 * 模块顶层不 load，贴图 URL 也不进 useLoader，避免进 hardGate / 首帧截止。
 */
export function scheduleGroundTextures(load: GroundTextureLoad = defaultLoad): void {
  if (scheduled || typeof window === 'undefined') return
  scheduled = true
  const run = async () => {
    await waitUntil(() => window.__twinReady === true)
    await waitUntil(() => window.__twinFirstFrameAt != null)
    await waitUntil(() => {
      const first = window.__twinFirstFrameAt
      return first != null && performance.now() - first >= FLOOR_SHELL_AFTER_FIRST_MS
    })
    await nextFrame()
    await idle()
    startLoads(load)
  }
  void run()
}
