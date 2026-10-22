import { resolveWorkstationRef } from '../../locate/ref'
import { workstationPosition } from './workstationPosition'

/**
 * three-stdlib 2.36 的 SelectionBox 只测网格包围球心，不读 instanceMatrix。
 * WorkstationDesks 是一个 InstancedMesh，框进它的原点不等于框进某一张桌子。
 * 框选打在逐工位代理上。代理序号与实例序号相同：工位号末段减一。
 */
export interface DeskPickProxy {
  deskId: string
  x: number
  z: number
  instanceIndex: number
}

export interface BoxSelectHit {
  isInstancedMesh?: boolean
  userData?: {
    boxPickProxy?: boolean
    deskId?: unknown
  }
}

export function floorPickProxies(
  floorId: string,
  desks: readonly { id: string; floorId: string }[],
): DeskPickProxy[] {
  const proxies: DeskPickProxy[] = []
  for (const desk of desks) {
    if (desk.floorId !== floorId) continue
    const ref = resolveWorkstationRef(desk.id)
    if (!ref || ref.floorId !== floorId) continue
    let place: { x: number; z: number }
    try {
      place = workstationPosition(floorId, ref.deskId)
    } catch {
      continue
    }
    proxies.push({
      deskId: ref.deskId,
      x: place.x,
      z: place.z,
      instanceIndex: ref.index - 1,
    })
  }
  proxies.sort((left, right) => left.instanceIndex - right.instanceIndex)
  return proxies
}

/** InstancedMesh 整网不算一张工位。只收带 deskId 的拾取代理，并按工位号稳定排序。 */
export function deskIdsFromBoxSelection(hits: readonly BoxSelectHit[]): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  for (const hit of hits) {
    if (hit.isInstancedMesh) continue
    const deskId = hit.userData?.boxPickProxy === true ? hit.userData.deskId : undefined
    if (typeof deskId !== 'string' || seen.has(deskId)) continue
    seen.add(deskId)
    ids.push(deskId)
  }
  return ids.sort((left, right) => left.localeCompare(right, 'en', { numeric: true }))
}

/**
 * Shift 拖框才挂起 CameraControls。
 * drei Select 的 pointerdown 挂在 document 冒泡，画布上的拖曳监听更早。
 * 这里在捕获阶段先判断，调用方再把 enabled 关掉。
 */
export function shouldSuspendCameraDrag(
  event: { shiftKey: boolean; button: number; target: unknown },
  canvas: unknown,
): boolean {
  if (!event.shiftKey) return false
  if (event.button !== 0 && event.button !== 1 && event.button !== 2) return false
  const target = event.target
  if (target == null) return false
  if (target === canvas) return true
  return typeof Node !== 'undefined' && target instanceof Node && canvas instanceof Node && canvas.contains(target)
}

export interface CameraDragLock {
  enabled?: boolean
}

/** 只有当前开着拖曳时才接管。已经关掉的镜头不要在松手时被打开。 */
export function engageCameraDragLock(controls: CameraDragLock | null | undefined): boolean {
  if (!controls || controls.enabled !== true) return false
  controls.enabled = false
  return true
}

export function releaseCameraDragLock(controls: CameraDragLock | null | undefined, engaged: boolean): void {
  if (!engaged || !controls) return
  controls.enabled = true
}
