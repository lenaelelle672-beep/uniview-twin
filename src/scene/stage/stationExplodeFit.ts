import { Box3, Vector3, type Object3D } from 'three'
import { explodeFitDollyDistance, explodeFitHeld } from './explodeFitGate'
import { obliqueOverviewSeed } from './poses'

/** 先刷新这些网格的包围盒，再交给 fitToBox。桌子必须在，否则不把楼板当成炸开结果。 */
export const STATION_EXPLODE_FIT_NAMES = [
  'WorkstationDesks',
  'WorkstationChairs',
  'WorkstationMonitors',
  'DeviceBadges',
  'FloorPlate',
] as const

const DESK_NAME = 'WorkstationDesks'

/** 世界单位。camera-controls 的 padding 不是像素。 */
export const STATION_FIT_PADDING = 2

type BoundNode = Object3D & {
  isInstancedMesh?: boolean
  computeBoundingBox?: () => void
}

export interface ExplodeFitRig {
  maxDistance: number
  distance: number
  maxPolarAngle: number
  smoothTime: number
  fitToBox: (
    box: Box3,
    enableTransition: boolean,
    padding?: {
      paddingLeft?: number
      paddingRight?: number
      paddingTop?: number
      paddingBottom?: number
    },
  ) => Promise<unknown>
  dollyTo: (distance: number, enableTransition: boolean) => Promise<unknown>
  setLookAt?: (
    x: number,
    y: number,
    z: number,
    tx: number,
    ty: number,
    tz: number,
    enableTransition?: boolean,
  ) => Promise<unknown>
  update: (delta: number) => void
}

const seedCenter = new Vector3()
const seedSize = new Vector3()

/**
 * 工位矩阵已经写过之后再量。InstancedMesh 的 boundingBox 不会自己失效，
 * 不先 computeBoundingBox，setFromObject 会沿用炸开前的盒。
 */
export function refreshStationExplodeBounds(root: { getObjectByName: (name: string) => Object3D | undefined }): Box3 | null {
  const box = new Box3()
  let desks = false
  let found = false
  for (const name of STATION_EXPLODE_FIT_NAMES) {
    const node = root.getObjectByName(name) as BoundNode | undefined
    if (!node) continue
    if (name === DESK_NAME) desks = true
    node.updateWorldMatrix(true, true)
    if (node.isInstancedMesh === true && typeof node.computeBoundingBox === 'function') {
      node.computeBoundingBox()
    }
    const part = new Box3().setFromObject(node)
    if (part.isEmpty()) continue
    box.union(part)
    found = true
  }
  if (!desks || !found || box.isEmpty()) return null
  return box
}

/** 书签视角、导览巡游、沿轨播放占着镜头时，楼层 fit 让路。 */
export function explodeFramingHeld(): boolean {
  if (typeof window === 'undefined') return false
  return explodeFitHeld({
    viewpointHeld: window.__vpH === true,
    touring: window.__vpT === true,
    railPlaying: window.__twinMotionPath?.playing === true,
  })
}

/** 工位还在拉开或已经离开楼板时，不要再用楼板盒覆盖这一镜。 */
export function stationBlocksPlateFit(): boolean {
  if (typeof window === 'undefined') return false
  const stats = window.__twinStationExplode
  if (!stats) return false
  if (stats.animating) return true
  return stats.active === true && stats.progress > 0
}

/**
 * 先 fitToBox 再按画面宽度 dolly。过渡关掉，和总览爆炸取景一样。
 * 调用方要先 refreshStationExplodeBounds。
 */
export async function frameExplodedStationBox(
  rig: ExplodeFitRig,
  box: Box3,
  options: {
    polarDip: number
    padding: number
    smoothTime: number
    cancelled: () => boolean
    afterFit?: () => void
    widthRatio: () => number
  },
): Promise<{ ok: boolean; dolly: boolean }> {
  if (options.cancelled()) return { ok: false, dolly: false }
  const savedMax = rig.maxDistance
  const savedPolar = rig.maxPolarAngle
  const restore = () => {
    rig.maxDistance = savedMax
    rig.maxPolarAngle = savedPolar
  }
  let dolly = false
  try {
    if (options.smoothTime > 0) rig.smoothTime = options.smoothTime
    rig.maxPolarAngle = Math.PI / 2 - options.polarDip
    rig.maxDistance = Infinity
    // 当前极角已经贴着斜俯上限时，fitToBox 会把它吸到正上方。
    // 先把种子放到长边侧面，吸附才会落回和楼板同一侧，再被最大极角夹住。
    if (typeof rig.setLookAt === 'function') {
      box.getCenter(seedCenter)
      box.getSize(seedSize)
      const seed = obliqueOverviewSeed(seedCenter, { x: seedSize.x, z: seedSize.z })
      await rig.setLookAt(seed.position[0], seed.position[1], seed.position[2], seed.target[0], seed.target[1], seed.target[2], false)
      if (options.cancelled()) {
        restore()
        return { ok: false, dolly: false }
      }
    }
    const padding = options.padding
    await rig.fitToBox(box, false, {
      paddingLeft: padding,
      paddingRight: padding,
      paddingTop: padding,
      paddingBottom: padding,
    })
    if (options.cancelled()) {
      restore()
      return { ok: false, dolly: false }
    }
    options.afterFit?.()
    rig.update(0)
    const next = explodeFitDollyDistance(rig.distance, options.widthRatio())
    if (next != null) {
      await rig.dollyTo(next, false)
      dolly = true
      if (options.cancelled()) {
        restore()
        return { ok: false, dolly: true }
      }
      options.afterFit?.()
      rig.update(0)
    }
    rig.maxPolarAngle = Math.PI
    const fitted = Number.isFinite(rig.distance) ? rig.distance : savedMax
    rig.maxDistance = Math.max(savedMax, fitted)
    return { ok: true, dolly }
  } catch {
    restore()
    return { ok: false, dolly }
  }
}
