import { createElement, type ReactNode } from 'react'
import { navigationSearch } from '../../demo-edit/flag'
import { useTwinStore } from '../../store/store'
import type { LayerFlags } from '../../store/viewSlice'
import { authorModeOn } from '../gate'

/**
 * T066：作者辅助的开关。
 * dock 在首帧 2600ms 之后才 import 本文件。灯光和相机辅助再等门打开才加载。
 * 不进 hardGate / balancedFx。格网那条槽负责把节点送进 Canvas，这里不再包一层。
 */

type HelpersComponent = () => ReactNode

let started = false
let active = false
let shown: ReactNode = null
let Comp: HelpersComponent | null = null
let loading: Promise<HelpersComponent> | null = null

function publish(): void {
  const probe = (window.__twinAuthorHelpers ??= {
    on: false,
    mounted: false,
    kinds: [],
  })
  probe.on = active
  probe.setDebugHelpers = setDebugHelpers
}

export function setDebugHelpers(on: boolean): void {
  const layers = useTwinStore.getState().layers as LayerFlags & { debugHelpers?: boolean }
  if ((layers.debugHelpers === true) === on) return
  useTwinStore.setState({ layers: { ...layers, debugHelpers: on } as LayerFlags })
}

function authorOn(): boolean {
  const search = typeof location === 'undefined' ? '' : location.search
  return authorModeOn({
    search,
    navigation: navigationSearch(),
    layers: useTwinStore.getState().layers,
  })
}

function paint(): void {
  const startedAt = performance.now()
  const tick = () => {
    if (window.__twinSceneOverlayFlush?.()) return
    if (performance.now() - startedAt > 8000) return
    window.setTimeout(tick, 50)
  }
  tick()
}

async function loadHelpers(): Promise<HelpersComponent> {
  if (Comp) return Comp
  loading ??= import('./LightCameraHelpers').then((mod) => {
    Comp = mod.LightCameraHelpers
    return Comp
  })
  return loading
}

async function setOn(next: boolean): Promise<void> {
  if (next === active) return
  active = next
  publish()
  if (!next) {
    shown = null
    window.__twinAuthorNode = null
    paint()
    return
  }
  const Helpers = await loadHelpers()
  if (!active) return
  shown = createElement(Helpers)
  window.__twinAuthorNode = shown
  paint()
}

/** dock 晚加载之后调用。默认关，不请求辅助组件。 */
export function mountAuthorHelpers(): void {
  if (typeof document === 'undefined') return
  if (started) return
  started = true
  publish()
  useTwinStore.subscribe(() => {
    const next = authorOn()
    if (next !== active) void setOn(next)
  })
  void setOn(authorOn())
}
