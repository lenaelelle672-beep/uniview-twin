import { createElement, Fragment, type ReactNode } from 'react'
import { useTwinStore } from '../store/store'
import type { GridAxesProps } from './GridAxes'
import { acceptsGridKey, GRID_AXIS_M, GRID_CELL_M, GRID_SECTION_M, gridPlane } from './metrics'

/**
 * T059：网格开关。
 * 开发时 dock 在首帧 2600ms 之后动态 import 本文件。
 * 生产构建会在 dock 哈希定稿后才把这条 import 接回去，drei Grid 再等打开开关才加载。
 * 不进 hardGate / balancedFx，也不写 layers 的首屏初始对象。
 */

type Slot = ((node: ReactNode) => void) & { __gridBridge?: boolean }
type GridComponent = (props: GridAxesProps) => ReactNode

let started = false
let on = false
let gridNode: ReactNode = null
let measureNode: ReactNode = null
let rawSlot: ((node: ReactNode) => void) | null = null
let GridComp: GridComponent | null = null
let loading: Promise<void> | null = null
let sceneKey = ''

const published = {
  on: false,
  mounted: false,
  cellM: GRID_CELL_M,
  sectionM: GRID_SECTION_M,
  axisM: GRID_AXIS_M,
  y: null as number | null,
  fadeM: null as number | null,
}

function sceneInput() {
  const state = useTwinStore.getState()
  return {
    view: state.view,
    floorId: state.selectedFloor,
    dayNight: state.dayNight,
    presentation: state.presentation,
  }
}

function sceneSignature(): string {
  const scene = sceneInput()
  return `${scene.view}|${scene.floorId ?? ''}|${scene.dayNight}|${scene.presentation}|${on ? 1 : 0}`
}

function publish(): void {
  const plane = on ? gridPlane(sceneInput()) : null
  published.on = on
  published.cellM = GRID_CELL_M
  published.sectionM = GRID_SECTION_M
  published.axisM = GRID_AXIS_M
  published.y = plane?.y ?? null
  published.fadeM = plane?.fadeDistance ?? null
  if (!on) published.mounted = false
  window.__twinGrid = published
}

function planeProps(): GridAxesProps | null {
  if (!on || !GridComp) return null
  const plane = gridPlane(sceneInput())
  if (!plane) return null
  return plane
}

/** 测距、格网、T066 作者辅助共用一条槽。作者节点缺省时和原来一样。 */
export function composeOverlay(measure: ReactNode, grid: ReactNode, author: ReactNode): ReactNode {
  const parts = [measure, grid, author].filter((node) => node != null)
  if (parts.length > 1) return createElement(Fragment, null, ...parts)
  return parts[0] ?? null
}

function flush(): boolean {
  if (!rawSlot) return false
  const props = planeProps()
  gridNode = props && GridComp ? createElement(GridComp, props) : null
  rawSlot(composeOverlay(measureNode, gridNode, window.__twinAuthorNode ?? null))
  return true
}

function wrapMeasureSlot(): void {
  const current = window.__twinMeasureSlot as Slot | undefined
  if (!current || current.__gridBridge) return
  rawSlot = current
  const wrapped: Slot = (node) => {
    measureNode = node
    flush()
  }
  wrapped.__gridBridge = true
  window.__twinMeasureSlot = wrapped
  if (on) flush()
}

function paint(button: HTMLButtonElement): void {
  const label = on ? '开' : '关'
  if (button.getAttribute('aria-pressed') === String(on) && button.lastElementChild?.textContent === label) return
  button.setAttribute('aria-pressed', String(on))
  button.setAttribute('aria-label', '图层：网格')
  button.replaceChildren()
  const name = document.createElement('span')
  name.textContent = '网格'
  const state = document.createElement('span')
  state.textContent = label
  button.append(name, state)
}

function ensureButton(): void {
  const row = document.querySelector('.viewmark-row')
  if (!row) return
  let host = row.querySelector<HTMLElement>('[data-layer-grid]')
  if (!host) {
    host = document.createElement('section')
    host.className = 'layer-panel'
    host.dataset.layerGrid = ''
    host.setAttribute('aria-label', '网格')
    const list = document.createElement('div')
    list.className = 'layer-list'
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.layer = 'grid'
    button.title = '米制格网和坐标轴，快捷键 G'
    button.addEventListener('click', () => {
      void setGridOn(!on)
    })
    list.append(button)
    host.append(list)
    const dock = row.querySelector('.viewmark-dock')
    if (dock) row.insertBefore(host, dock)
    else row.append(host)
  }
  const button = host.querySelector('button')
  if (button) paint(button)
}

async function loadGrid(): Promise<void> {
  if (GridComp) return
  loading ??= import('./GridAxes').then((mod) => {
    GridComp = mod.GridAxes
  })
  await loading
}

async function setGridOn(next: boolean): Promise<void> {
  if (next === on) return
  on = next
  sceneKey = sceneSignature()
  publish()
  ensureButton()
  if (!on) {
    flush()
    return
  }
  await loadGrid()
  if (!on) return
  publish()
  flush()
}

function onKey(event: KeyboardEvent): void {
  const target = event.target instanceof HTMLElement ? event.target : null
  if (
    !acceptsGridKey({
      key: event.key,
      repeat: event.repeat,
      altKey: event.altKey,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      isComposing: event.isComposing,
      target,
    })
  ) {
    return
  }
  event.preventDefault()
  void setGridOn(!on)
}

/** dock 晚加载之后调用。默认关，不请求 drei Grid。 */
export function mountGridAxes(): void {
  if (typeof document === 'undefined') return
  if (started) return
  started = true
  window.__twinSceneOverlayFlush = () => flush()
  publish()
  ensureButton()
  wrapMeasureSlot()
  window.addEventListener('keydown', onKey)
  const observer = new MutationObserver(() => {
    ensureButton()
    wrapMeasureSlot()
  })
  observer.observe(document.body, { childList: true, subtree: true })
  window.setInterval(wrapMeasureSlot, 200)
  useTwinStore.subscribe(() => {
    if (!on) return
    const next = sceneSignature()
    if (next === sceneKey) return
    sceneKey = next
    publish()
    flush()
  })
}
