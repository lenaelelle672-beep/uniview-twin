import { ClampToEdgeWrapping, NoColorSpace, RepeatWrapping, Texture, TextureLoader } from 'three'
import { useTwinStore } from '../store/store'
import { _s, stoneMaterial } from './materials'
import { stampStoneWallUv, STONE_TILE_M } from './stoneUv'
import { FLOOR_SHELL_AFTER_FIRST_MS } from './stage/prefetchLazyChunks'

/**
 * 东楼基座只挂法线 + 粗糙度。反照率继续走 stoneMaterial 的昼夜 color，不设 map。
 * 物理边长 3.0 m（Poly Haven large_sandstone_blocks）。UV 以米计，repeat = 1 / 3。
 * wrapT 为 ClampToEdge：墙面 V 已把 trimsheet 线脚对在基座顶/底。
 */
const STONE = {
  material: stoneMaterial,
  nor: '/textures/stone/large_sandstone_blocks_nor.webp',
  rough: '/textures/stone/large_sandstone_blocks_rough.webp',
  repeat: 1 / STONE_TILE_M,
} as const

export type StoneTextureLoad = (url: string, onLoad: (texture: Texture) => void) => void

let scheduled = false
let loader: TextureLoader | null = null

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
  if (typeof document === 'undefined') return
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
  texture.wrapT = ClampToEdgeWrapping
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

function startLoads(load: StoneTextureLoad): void {
  let left = 2
  const slot: { nor?: Texture; rough?: Texture } = {}
  const done = () => {
    if (--left === 0) redraw()
  }
  const put = (rough: boolean) => (texture: Texture) => {
    prepare(texture, STONE.repeat)
    if (rough) slot.rough = texture
    else slot.nor = texture
    if (slot.nor && slot.rough) {
      if (_s.g) stampStoneWallUv(_s.g, _s.h)
      if (_s.b) stampStoneWallUv(_s.b, _s.bh)
      STONE.material.normalMap = slot.nor
      STONE.material.roughnessMap = slot.rough
      STONE.material.needsUpdate = true
    }
    done()
  }
  load(STONE.nor, put(false))
  load(STONE.rough, put(true))
}

/**
 * 与场地贴图同一道门：__twinReady、首帧，再等 FLOOR_SHELL_AFTER_FIRST_MS，
 * 多一帧和一次 idle 才 TextureLoader。模块顶层不 load，URL 也不走 R3F 预加载，
 * 避免进 hardGate / 首帧截止 / fxFiles。
 */
export function arm(load: StoneTextureLoad = defaultLoad): void {
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
