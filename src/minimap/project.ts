import { isFloorId } from '../data/floors'
import type { PlanBounds } from '../blueprint/plan'

/** 视锥投影间隔。拖动时不跟每一帧改 DOM。 */
export const MINIMAP_PROJECT_MS = 100

const CONE_MIN_M = 7
const CONE_MAX_M = 16
const CLICK_EPS_M = 0.08

export interface PlanPlot {
  x: number
  y: number
}

export interface RigPose {
  x: number
  y: number
  z: number
}

export interface ViewCone {
  eye: PlanPlot
  target: PlanPlot
  /** 眼点、左缘、右缘。坐标已落到蓝图 viewBox。 */
  polygon: [PlanPlot, PlanPlot, PlanPlot]
  headingX: number
  headingZ: number
}

/**
 * 小地图只在单层出现。全屏蓝图（view==='blueprint'）不挂点击面。
 */
export function minimapShows(view: string, floorId: string | null): floorId is string {
  return view === 'floor' && floorId != null && isFloorId(floorId)
}

/** 与 BlueprintView 的 worldX/worldY 同一套：水平投影，Y 丢掉。 */
export function projectToPlan(x: number, z: number, bounds: PlanBounds): PlanPlot {
  return { x: x - bounds.minX, y: z - bounds.minZ }
}

export function planPointToWorld(x: number, y: number, bounds: PlanBounds): { x: number; z: number } {
  return { x: x + bounds.minX, z: y + bounds.minZ }
}

export function horizontalFovRad(fovDeg: number, aspect: number): number {
  const vertical = (Math.min(Math.max(fovDeg, 1), 140) * Math.PI) / 180
  const safeAspect = Number.isFinite(aspect) && aspect > 0.05 ? aspect : 1
  return 2 * Math.atan(Math.tan(vertical / 2) * safeAspect)
}

/**
 * 把 CameraRig 眼点 / 目标正交投到楼层平面，再按水平视场张开视锥。
 * 近乎垂直下看时沿用上一帧朝向，避免锥尖缩成一点。
 */
export function viewConeOnPlane(input: {
  eyeX: number
  eyeZ: number
  targetX: number
  targetZ: number
  fovDeg: number
  aspect: number
  bounds: PlanBounds
  headingX?: number
  headingZ?: number
}): ViewCone {
  let hx = input.targetX - input.eyeX
  let hz = input.targetZ - input.eyeZ
  const ground = Math.hypot(hx, hz)
  if (ground < 0.2) {
    hx = input.headingX ?? 0
    hz = input.headingZ ?? 1
    const saved = Math.hypot(hx, hz)
    if (saved < 1e-4) {
      hx = 0
      hz = 1
    } else {
      hx /= saved
      hz /= saved
    }
  } else {
    hx /= ground
    hz /= ground
  }
  const reach = Math.min(CONE_MAX_M, Math.max(CONE_MIN_M, ground))
  const half = Math.min(Math.max(horizontalFovRad(input.fovDeg, input.aspect) / 2, 0.12), Math.PI / 2 - 0.08)
  const spread = Math.tan(half) * reach
  const px = -hz
  const pz = hx
  const farX = input.eyeX + hx * reach
  const farZ = input.eyeZ + hz * reach
  const eye = projectToPlan(input.eyeX, input.eyeZ, input.bounds)
  const target = projectToPlan(input.targetX, input.targetZ, input.bounds)
  const left = projectToPlan(farX + px * spread, farZ + pz * spread, input.bounds)
  const right = projectToPlan(farX - px * spread, farZ - pz * spread, input.bounds)
  return { eye, target, polygon: [eye, left, right], headingX: hx, headingZ: hz }
}

export function polygonPoints(plots: readonly PlanPlot[]): string {
  return plots.map((plot) => `${plot.x},${plot.y}`).join(' ')
}

/**
 * 点击落点成为新的注视点。眼点平移同样的水平量，高度和视线差保持不变。
 * 不改镜头阻尼，过渡仍走 CameraRig 上已经设好的 T032。
 */
export function slideLookAt(
  eye: RigPose,
  target: RigPose,
  point: { x: number; z: number },
): { eye: RigPose; target: RigPose } | null {
  const dx = point.x - target.x
  const dz = point.z - target.z
  if (!Number.isFinite(dx) || !Number.isFinite(dz)) return null
  if (dx * dx + dz * dz < CLICK_EPS_M * CLICK_EPS_M) return null
  return {
    eye: { x: eye.x + dx, y: eye.y, z: eye.z + dz },
    target: { x: point.x, y: target.y, z: point.z },
  }
}

export function createProjectionThrottle(
  intervalMs: number,
  now: () => number,
  schedule: (fn: () => void, ms: number) => number,
  cancel: (id: number) => void,
) {
  let last = -Infinity
  let timer = 0
  let pending: (() => void) | null = null
  return {
    push(fn: () => void) {
      const time = now()
      if (time - last >= intervalMs) {
        last = time
        if (timer) {
          cancel(timer)
          timer = 0
          pending = null
        }
        fn()
        return
      }
      pending = fn
      if (timer) return
      const wait = Math.max(0, intervalMs - (time - last))
      timer = schedule(() => {
        timer = 0
        last = now()
        const run = pending
        pending = null
        run?.()
      }, wait)
    },
    cancel() {
      if (timer) cancel(timer)
      timer = 0
      pending = null
    },
  }
}
