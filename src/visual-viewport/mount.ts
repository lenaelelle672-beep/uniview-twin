/**
 * T109：读 visualViewport 宽高 / offset，并用 ResizeObserver 跟上嵌入框尺寸。
 * 结果写到 .app 的 --vv-* 。和布局视口重合时不打 data-vv，HUD 排版保持原样。
 * 不监听 window 的 resize，不改 .stage / .scene-root / 画布尺寸，避免再走窗口缩放的瞬时 fit。
 * 全屏只读 fullscreenElement，用来停掉位移；不调用全屏 API，也不碰书签。
 * 没有 visualViewport 时直接返回。
 * dock 在首帧 2600ms 之后才 import。生产构建在 dock 哈希定稿前摘掉这段。
 */
import { HUD_SHEET, VV_SHEET_ATTR, applyHudViewport, clearHudViewport, type HudStyleTarget } from './hud'
import {
  identityViewport,
  readHudViewport,
  readVisualBox,
  visualViewportSnapshot,
  type HudViewport,
  type VisualViewportSnapshot,
} from './metrics'

export interface ViewportListenerTarget {
  readonly width: number
  readonly height: number
  readonly offsetLeft: number
  readonly offsetTop: number
  addEventListener(type: 'resize' | 'scroll', listener: () => void): void
  removeEventListener(type: 'resize' | 'scroll', listener: () => void): void
}

export interface ViewportObserver {
  observe(target: object): void
  disconnect(): void
}

export interface ViewportEnv {
  visualViewport: ViewportListenerTarget | null
  ResizeObserver: (new (callback: () => void) => ViewportObserver) | null
  hud: HudStyleTarget | null
  layoutTarget: object | null
  layout(): { width: number; height: number }
  fullscreen(): boolean
  installSheet(): void
  removeSheet(): void
  publish(snapshot: VisualViewportSnapshot | null): void
}

function tokenOf(viewport: HudViewport, fullscreen: boolean): string {
  return [
    viewport.width,
    viewport.height,
    viewport.offsetLeft,
    viewport.offsetTop,
    viewport.insetLeft,
    viewport.insetTop,
    viewport.insetRight,
    viewport.insetBottom,
    viewport.identity ? 1 : 0,
    fullscreen ? 1 : 0,
  ].join('|')
}

export function bindVisualViewport(env: ViewportEnv): () => void {
  const visualViewport = env.visualViewport
  const hud = env.hud
  if (!visualViewport || !hud) return () => {}

  let stopped = false
  let token = ''
  let observer: ViewportObserver | null = null

  const paint = () => {
    if (stopped) return
    const seen = readVisualBox(visualViewport)
    if (!seen) return
    const fullscreen = env.fullscreen()
    const viewport = fullscreen ? identityViewport(seen) : readHudViewport(seen, env.layout())
    if (!viewport) return
    const next = tokenOf(viewport, fullscreen)
    if (next === token) return
    token = next
    try {
      applyHudViewport(hud, viewport)
    } catch {
      // 节点已拆也不抛进视觉视口回调。
    }
    try {
      env.publish(visualViewportSnapshot(viewport))
    } catch {
      // 探针写失败不影响 HUD 变量。
    }
  }

  visualViewport.addEventListener('resize', paint)
  visualViewport.addEventListener('scroll', paint)

  const Observer = env.ResizeObserver
  if (typeof Observer === 'function' && env.layoutTarget) {
    try {
      observer = new Observer(paint)
      observer.observe(env.layoutTarget)
    } catch {
      observer = null
    }
  }

  try {
    env.installSheet()
  } catch {
    // 样式没挂上时变量仍写入，只是位移规则不生效。
  }
  paint()

  return () => {
    if (stopped) return
    stopped = true
    token = ''
    visualViewport.removeEventListener('resize', paint)
    visualViewport.removeEventListener('scroll', paint)
    try {
      observer?.disconnect()
    } catch {
      // 观察器已拆。
    }
    observer = null
    try {
      clearHudViewport(hud)
    } catch {
      // 节点已拆。
    }
    try {
      env.removeSheet()
    } catch {
      // 样式节点已拆。
    }
    try {
      env.publish(null)
    } catch {
      // 探针已不在。
    }
  }
}

function installSheet(): void {
  if (typeof document === 'undefined') return
  if (document.head.querySelector(`style[${VV_SHEET_ATTR}]`)) return
  const node = document.createElement('style')
  node.setAttribute(VV_SHEET_ATTR, '')
  node.textContent = HUD_SHEET
  document.head.append(node)
}

function removeSheet(): void {
  if (typeof document === 'undefined') return
  document.head.querySelector(`style[${VV_SHEET_ATTR}]`)?.remove()
}

function publish(snapshot: VisualViewportSnapshot | null): void {
  if (typeof window === 'undefined') return
  if (snapshot) window.__twinVisualViewport = snapshot
  else delete window.__twinVisualViewport
}

let active: (() => void) | null = null

export function mountVisualViewportHud(): () => void {
  try {
    if (active) return active
    if (typeof window === 'undefined' || typeof document === 'undefined') return () => {}
    const visualViewport = window.visualViewport
    if (!visualViewport) return () => {}
    const hud = document.querySelector('.app')
    if (!(hud instanceof HTMLElement)) return () => {}
    const layoutTarget = document.documentElement
    if (!layoutTarget) return () => {}
    const ResizeObserverImpl =
      typeof ResizeObserver === 'function'
        ? (ResizeObserver as unknown as ViewportEnv['ResizeObserver'])
        : null
    const stop = bindVisualViewport({
      visualViewport: {
        get width() {
          return visualViewport.width
        },
        get height() {
          return visualViewport.height
        },
        get offsetLeft() {
          return visualViewport.offsetLeft
        },
        get offsetTop() {
          return visualViewport.offsetTop
        },
        addEventListener(type, listener) {
          visualViewport.addEventListener(type, listener)
        },
        removeEventListener(type, listener) {
          visualViewport.removeEventListener(type, listener)
        },
      },
      ResizeObserver: ResizeObserverImpl,
      hud,
      layoutTarget,
      layout: () => ({ width: window.innerWidth, height: window.innerHeight }),
      fullscreen: () => document.fullscreenElement != null,
      installSheet,
      removeSheet,
      publish,
    })
    active = () => {
      stop()
      active = null
    }
    return active
  } catch {
    return () => {}
  }
}
