/**
 * 生产构建打进 DemandLoop 末尾的门闩。不包含 drei。
 * 均衡默认不请求 MeshBounds.js；性能档或 meshBounds=1 才拉。
 */
import { coarseMeshBoundsEnabled, meshBoundsFlagLockedOff, publishMeshBoundsOff } from './meshBoundsPolicy'

const MESH_BOUNDS_BUNDLE = './MeshBounds.js'

let started = false

const timer = window.setInterval(() => {
  if (started) return
  const quality = document.querySelector('.scene-root')?.getAttribute('data-quality') ?? ''
  const search = window.location.search
  let navigation = ''
  try {
    navigation = performance.getEntriesByType('navigation')[0]?.name ?? ''
  } catch {
    navigation = ''
  }
  if (meshBoundsFlagLockedOff(search, navigation)) {
    publishMeshBoundsOff('off')
    window.clearInterval(timer)
    return
  }
  if (!coarseMeshBoundsEnabled(quality, search, navigation)) {
    publishMeshBoundsOff('off')
    return
  }
  started = true
  window.clearInterval(timer)
  void import(/* @vite-ignore */ MESH_BOUNDS_BUNDLE).then((mod) => {
    const loaded = mod as { mountCoarseMeshBounds?: () => void }
    loaded.mountCoarseMeshBounds?.()
  })
}, 500)
