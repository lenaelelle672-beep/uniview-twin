import { useTwinStore } from '../../store/store'
import { structureOverlayFrom, type StructureOverlayMode } from './structureLatch'
import { STRUCTURE_EDGE_THRESHOLD } from './structureTargets'

let armed = false
let heavy: Promise<typeof import('./structureEdges')> | null = null

function loadHeavy() {
  heavy ??= import('./structureEdges')
  return heavy
}

function publishIdle(mode: StructureOverlayMode) {
  if (typeof window === 'undefined') return
  window.__twinStructureEdges = {
    mode,
    count: 0,
    threshold: STRUCTURE_EDGE_THRESHOLD,
    latch: 'edges-wins',
  }
}

/**
 * 图层面板点开结构边之后才进来。默认关时不加载这份几何。
 * 调用方是 LayerPanel，本身在 dock 晚加载之后。
 */
export function armStructureEdges(): void {
  if (typeof window === 'undefined') return
  const run = () => {
    const mode = structureOverlayFrom(useTwinStore.getState().layers)
    if (mode === 'edges' || heavy) {
      void loadHeavy().then((mod) => {
        mod.syncStructureEdges()
      })
      return
    }
    publishIdle(mode)
  }
  if (armed) {
    run()
    return
  }
  armed = true
  run()
  useTwinStore.subscribe((state, prev) => {
    if (
      state.layers === prev.layers &&
      state.view === prev.view &&
      state.selectedFloor === prev.selectedFloor &&
      state.dayNight === prev.dayNight &&
      state.presentation === prev.presentation
    ) {
      return
    }
    run()
  })
}

export function resetStructureEdgesArmForTests(): void {
  armed = false
  heavy = null
}
