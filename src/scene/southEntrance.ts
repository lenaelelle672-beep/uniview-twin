import { BoxGeometry, Matrix4, Object3D } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { BufferGeometry } from 'three'
import {
  EAST_CANTILEVER_SOFFIT_T_M,
  EAST_LOWER_TOP_M,
  eastLowerOutline,
  eastUpperOutline,
} from './massing'
import { stampStoneWallUv } from './stoneUv'

/**
 * T139 南入口雨棚：在已合东楼外壳上局部加建，不改 EAST_CANTILEVER_M / 底空顶板厚度。
 * 世界 +Z 向南。雨棚从下层南墙伸出，并越过上层南缘，好让 ?cam=photo1 / 总览能读出体量。
 */
export const SOUTH_CANOPY_SOFFIT_H_M = 7.8
export const SOUTH_CANOPY_T_M = 0.85
export const SOUTH_CANOPY_DEPTH_M = 10.2
export const SOUTH_CANOPY_BAY_INNER_M = 18.8
export const SOUTH_CANOPY_PIER_W_M = 4.0
export const SOUTH_CANOPY_EAST_MARGIN_M = 2.2
export const SOUTH_CANOPY_PIER_DEPTH_M = 4.6
export const SOUTH_CANOPY_STRIP_SPACING_M = 0.72
export const SOUTH_CANOPY_STRIP_W_M = 0.05
export const SOUTH_CANOPY_STRIP_DROP_M = 0.08
export const SOUTH_CANOPY_STRIP_MARGIN_M = 0.45
export const SOUTH_ENTRANCE_STEP_COUNT = 3
export const SOUTH_ENTRANCE_STEP_RISE_M = 0.14
export const SOUTH_ENTRANCE_STEP_TREAD_M = 0.92
export const SOUTH_ENTRANCE_STEP_OVERLAP_M = 0.7

export interface SouthEntranceLayout {
  lowerSouthZ: number
  upperSouthZ: number
  lowerEastX: number
  lowerWestX: number
  canopyWestX: number
  canopyEastX: number
  canopyNorthZ: number
  canopySouthZ: number
  canopyWidth: number
  soffitY: number
  canopyTopY: number
  pierWest: { x0: number; x1: number; z0: number; z1: number }
  pierEast: { x0: number; x1: number; z0: number; z1: number }
  bayWestX: number
  bayEastX: number
  midTopY: number
  midSouthZ: number
  midNorthZ: number
  window: { x0: number; x1: number; y0: number; y1: number; z: number }
  glass: { x0: number; x1: number; y0: number; y1: number; z: number }
  landing: { x0: number; x1: number; z0: number; z1: number; y: number; h: number }
  steps: Array<{ x0: number; x1: number; z0: number; z1: number; y0: number; y1: number }>
}

export function southEntranceLayout(): SouthEntranceLayout {
  const lower = eastLowerOutline()
  const upper = eastUpperOutline()
  const lowerSouth = lower.filter(([, z]) => z > 80)
  const lowerSouthZ = Math.max(...lower.map(([, z]) => z))
  const upperSouthZ = Math.max(...upper.map(([, z]) => z))
  const lowerEastX = Math.max(...lowerSouth.map(([x]) => x))
  const lowerWestX = Math.min(...lowerSouth.map(([x]) => x))
  const canopyEastX = lowerEastX - SOUTH_CANOPY_EAST_MARGIN_M
  const canopyWidth = SOUTH_CANOPY_BAY_INNER_M + SOUTH_CANOPY_PIER_W_M * 2
  const canopyWestX = canopyEastX - canopyWidth
  const canopyNorthZ = lowerSouthZ
  const canopySouthZ = lowerSouthZ + SOUTH_CANOPY_DEPTH_M
  const soffitY = SOUTH_CANOPY_SOFFIT_H_M
  const canopyTopY = soffitY + SOUTH_CANOPY_T_M
  const bayWestX = canopyWestX + SOUTH_CANOPY_PIER_W_M
  const bayEastX = canopyEastX - SOUTH_CANOPY_PIER_W_M
  const pierZ1 = lowerSouthZ + SOUTH_CANOPY_PIER_DEPTH_M
  const midTopY = EAST_LOWER_TOP_M - EAST_CANTILEVER_SOFFIT_T_M - 0.12
  const midSouthZ = upperSouthZ
  const midNorthZ = lowerSouthZ + 0.12
  const window = {
    x0: bayWestX + 0.85,
    x1: bayEastX - 0.85,
    y0: canopyTopY + 0.5,
    y1: midTopY - 0.85,
    z: midSouthZ + 0.04,
  }
  const landingH = 0.1
  const landingY = 0.12
  const stepRise = SOUTH_ENTRANCE_STEP_RISE_M
  const stepTread = SOUTH_ENTRANCE_STEP_TREAD_M
  const topZ0 = canopySouthZ - SOUTH_ENTRANCE_STEP_OVERLAP_M
  const steps = Array.from({ length: SOUTH_ENTRANCE_STEP_COUNT }, (_, i) => {
    const level = SOUTH_ENTRANCE_STEP_COUNT - i
    const y1 = landingY + landingH + level * stepRise
    const z0 = topZ0 + i * stepTread
    const z1 = topZ0 + (i + 1) * stepTread
    return { x0: bayWestX, x1: bayEastX, z0, z1, y0: 0.04, y1 }
  })
  const landingZ1 = steps[0]?.z0 ?? topZ0
  return {
    lowerSouthZ,
    upperSouthZ,
    lowerEastX,
    lowerWestX,
    canopyWestX,
    canopyEastX,
    canopyNorthZ,
    canopySouthZ,
    canopyWidth,
    soffitY,
    canopyTopY,
    pierWest: { x0: canopyWestX, x1: bayWestX, z0: lowerSouthZ, z1: pierZ1 },
    pierEast: { x0: bayEastX, x1: canopyEastX, z0: lowerSouthZ, z1: pierZ1 },
    bayWestX,
    bayEastX,
    midTopY,
    midSouthZ,
    midNorthZ,
    window,
    glass: {
      x0: bayWestX + 0.7,
      x1: bayEastX - 0.7,
      y0: landingY + landingH,
      y1: soffitY - 0.25,
      z: lowerSouthZ + 0.42,
    },
    landing: {
      x0: bayWestX,
      x1: bayEastX,
      z0: lowerSouthZ + 0.15,
      z1: landingZ1,
      y: landingY,
      h: landingH,
    },
    steps,
  }
}

function boxAt(width: number, height: number, depth: number, cx: number, cy: number, cz: number, stampH: number): BufferGeometry {
  const geometry = new BoxGeometry(width, height, depth)
  geometry.translate(cx, cy, cz)
  stampStoneWallUv(geometry, stampH)
  return geometry
}

/** 石材外皮：雨棚板、墙墩、窗套、浅台阶与凹槽铺装，合并成一条绘制。 */
export function buildSouthEntranceStoneGeometry(layout = southEntranceLayout()): BufferGeometry {
  const parts: BufferGeometry[] = []
  const {
    canopyWestX,
    canopyEastX,
    canopyNorthZ,
    canopySouthZ,
    canopyWidth,
    soffitY,
    canopyTopY,
    pierWest,
    pierEast,
    midTopY,
    midSouthZ,
    midNorthZ,
    window,
    landing,
    steps,
  } = layout
  const canopyDepth = canopySouthZ - canopyNorthZ
  parts.push(
    boxAt(canopyWidth, SOUTH_CANOPY_T_M, canopyDepth, (canopyWestX + canopyEastX) / 2, (soffitY + canopyTopY) / 2, (canopyNorthZ + canopySouthZ) / 2, SOUTH_CANOPY_T_M),
  )
  const pierH = soffitY
  for (const pier of [pierWest, pierEast]) {
    parts.push(
      boxAt(pier.x1 - pier.x0, pierH, pier.z1 - pier.z0, (pier.x0 + pier.x1) / 2, pierH / 2, (pier.z0 + pier.z1) / 2, pierH),
    )
  }
  const midH = midTopY - canopyTopY
  const midDepth = midSouthZ - midNorthZ
  const midZ = (midSouthZ + midNorthZ) / 2
  const midY = (midTopY + canopyTopY) / 2
  // 左右窗套 + 上横梁，南立面留出窗洞，避免对下层外壳做 CSG。
  parts.push(
    boxAt(window.x0 - canopyWestX, midH, midDepth, (canopyWestX + window.x0) / 2, midY, midZ, midH),
    boxAt(canopyEastX - window.x1, midH, midDepth, (window.x1 + canopyEastX) / 2, midY, midZ, midH),
  )
  const headH = midTopY - window.y1
  if (headH > 0.05) {
    parts.push(boxAt(window.x1 - window.x0, headH, midDepth, (window.x0 + window.x1) / 2, (window.y1 + midTopY) / 2, midZ, midH))
  }
  const sillH = window.y0 - canopyTopY
  if (sillH > 0.05) {
    parts.push(boxAt(window.x1 - window.x0, sillH, midDepth, (window.x0 + window.x1) / 2, (canopyTopY + window.y0) / 2, midZ, midH))
  }
  parts.push(
    boxAt(
      landing.x1 - landing.x0,
      landing.h,
      landing.z1 - landing.z0,
      (landing.x0 + landing.x1) / 2,
      landing.y + landing.h / 2,
      (landing.z0 + landing.z1) / 2,
      landing.h,
    ),
  )
  for (const step of steps) {
    const h = step.y1 - step.y0
    parts.push(
      boxAt(step.x1 - step.x0, h, step.z1 - step.z0, (step.x0 + step.x1) / 2, (step.y0 + step.y1) / 2, (step.z0 + step.z1) / 2, h),
    )
  }
  const merged = mergeGeometries(parts)
  parts.forEach((geometry) => geometry.dispose())
  if (!merged) throw new Error('南入口石材几何为空')
  return merged
}

export function southCanopySoffitStripXs(layout = southEntranceLayout()): number[] {
  const x0 = layout.canopyWestX + SOUTH_CANOPY_STRIP_MARGIN_M
  const x1 = layout.canopyEastX - SOUTH_CANOPY_STRIP_MARGIN_M
  const xs: number[] = []
  for (let x = x0; x <= x1 + 1e-6; x += SOUTH_CANOPY_STRIP_SPACING_M) xs.push(x)
  return xs
}

/** 吊顶线脚矩阵，沿进深方向（世界 +Z）一条 InstancedMesh。 */
export function southCanopySoffitStripMatrices(layout = southEntranceLayout()): Matrix4[] {
  const xs = southCanopySoffitStripXs(layout)
  const dummy = new Object3D()
  const y = layout.soffitY - SOUTH_CANOPY_STRIP_DROP_M / 2
  const z = (layout.canopyNorthZ + layout.canopySouthZ) / 2
  return xs.map((x) => {
    dummy.position.set(x, y, z)
    dummy.rotation.set(0, 0, 0)
    dummy.scale.set(1, 1, 1)
    dummy.updateMatrix()
    return dummy.matrix.clone()
  })
}

export function southCanopySoffitStripGeometry(layout = southEntranceLayout()): BufferGeometry {
  const depth = layout.canopySouthZ - layout.canopyNorthZ - SOUTH_CANOPY_STRIP_MARGIN_M * 2
  return new BoxGeometry(SOUTH_CANOPY_STRIP_W_M, SOUTH_CANOPY_STRIP_DROP_M, Math.max(depth, 0.5))
}

export function southEntranceGlassGeometry(layout = southEntranceLayout()): BufferGeometry {
  const { glass } = layout
  const geometry = new BoxGeometry(glass.x1 - glass.x0, glass.y1 - glass.y0, 0.08)
  geometry.translate((glass.x0 + glass.x1) / 2, (glass.y0 + glass.y1) / 2, glass.z)
  return geometry
}

export function southEntranceWindowGeometry(layout = southEntranceLayout()): BufferGeometry {
  const { window } = layout
  const geometry = new BoxGeometry(window.x1 - window.x0, window.y1 - window.y0, 0.08)
  geometry.translate((window.x0 + window.x1) / 2, (window.y0 + window.y1) / 2, window.z)
  return geometry
}

export function southCanopySoffitPanelGeometry(layout = southEntranceLayout()): BufferGeometry {
  const width = layout.canopyEastX - layout.canopyWestX - 0.08
  const depth = layout.canopySouthZ - layout.canopyNorthZ - 0.08
  const geometry = new BoxGeometry(width, 0.03, depth)
  geometry.translate((layout.canopyWestX + layout.canopyEastX) / 2, layout.soffitY - 0.015, (layout.canopyNorthZ + layout.canopySouthZ) / 2)
  return geometry
}
