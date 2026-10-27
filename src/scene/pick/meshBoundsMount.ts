/**
 * T078 运行时门闩。
 * 开发时由 DemandLoop 动态 import。drei 只在开关打开后才进 meshBoundsApply。
 * 生产构建不走这条 import：哈希定稿后把 boot 接进 DemandLoop，再按需拉 MeshBounds.js。
 */
import {
  coarseMeshBoundsEnabled,
  coarseMeshBoundsReason,
  MESH_BOUNDS_SCAN_MS,
  publishMeshBoundsOff,
} from './meshBoundsPolicy'

type ApplyModule = typeof import('./meshBoundsApply')

let timer = 0
let apply: ApplyModule | null = null
let loading: Promise<void> | null = null

function qualityNow(): string {
  if (typeof document === 'undefined') return ''
  return document.querySelector('.scene-root')?.getAttribute('data-quality') ?? ''
}

function searchNow(): string {
  if (typeof location === 'undefined') return ''
  return location.search
}

function navigationNow(): string {
  if (typeof performance === 'undefined') return ''
  try {
    return performance.getEntriesByType('navigation')[0]?.name ?? ''
  } catch {
    return ''
  }
}

function tick(): void {
  const search = searchNow()
  const navigation = navigationNow()
  const enabled = coarseMeshBoundsEnabled(qualityNow(), search, navigation)
  if (!enabled) {
    if (apply) apply.releaseCoarseMeshBounds()
    else publishMeshBoundsOff('off')
    return
  }
  const scene = typeof window === 'undefined' ? undefined : window.__twinScene
  if (!apply) {
    if (!loading) {
      loading = import('./meshBoundsApply').then((mod) => {
        apply = mod
        loading = null
        if (!coarseMeshBoundsEnabled(qualityNow(), searchNow(), navigationNow())) {
          mod.releaseCoarseMeshBounds()
          return
        }
        const live = window.__twinScene
        if (!live) {
          publishMeshBoundsOff('wait')
          return
        }
        mod.syncCoarseMeshBounds(live, coarseMeshBoundsReason(searchNow(), navigationNow()))
      })
    }
    return
  }
  if (!scene) {
    publishMeshBoundsOff('wait')
    return
  }
  apply.syncCoarseMeshBounds(scene, coarseMeshBoundsReason(search, navigation))
}

export function mountCoarseMeshBounds(): void {
  if (typeof window === 'undefined' || timer) return
  tick()
  timer = window.setInterval(tick, MESH_BOUNDS_SCAN_MS)
}

export function resetMeshBoundsMountForTests(): void {
  if (timer && typeof window !== 'undefined') window.clearInterval(timer)
  timer = 0
  apply = null
  loading = null
}

export function loadCoarseMeshBounds(): Promise<ApplyModule> {
  return import('./meshBoundsApply')
}
