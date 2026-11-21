import { MeshStandardMaterial } from 'three'
import {
  EAST_LOWER_TOP_M,
  EAST_ROOF_M,
  EAST_UPPER_EAST_INSET_M,
  eastUpperOutline,
} from './massing'
import { EAST_FACE_X, EAST_SOUTH_GLASS_Z, EAST_SOUTH_LENGTH_M } from './shell/rings'

/** T147：南墙上段密肋间距。须明显密于西弧现用的 1.6 m，且大于肋宽。 */
export const EAST_SOUTH_FIN_SPACING_M = 0.64
/** 沿南墙法向（+Z）伸出，让 photo1 / 总览 / p2f003 能看见肋的厚度。 */
export const EAST_SOUTH_FIN_DEPTH_M = 0.48
/** 沿墙的肋宽。必须明显小于间距，才能读出竖向分格。 */
export const EAST_SOUTH_FIN_THICKNESS_M = 0.1
/** 上层南皮从实心盒让出的厚度，同时是南墙玻璃盒进深。 */
export const EAST_SOUTH_GLASS_T_M = 0.36

/**
 * 南墙密肋专用材质，不改共享 finMaterial（东楼缝条、东立面框、塔楼翅、西弧肋都会变）。
 * 比日间 #c5cad3 稍暗，提高与幕墙玻璃的远距对比。
 */
export const eastSouthFinMaterial = new MeshStandardMaterial({
  name: '东楼南墙密肋',
  color: '#8b939e',
  roughness: 0.4,
  metalness: 0.46,
  envMapIntensity: 0.4,
})

/** 上层南沿直段：东缘内收之后的南玻璃线，约 58.5 m。 */
export function eastSouthUpperLine(): Array<[number, number]> {
  const westSouth = EAST_FACE_X - EAST_SOUTH_LENGTH_M
  const eastX = EAST_FACE_X - EAST_UPPER_EAST_INSET_M
  return [
    [eastX, EAST_SOUTH_GLASS_Z],
    [westSouth, EAST_SOUTH_GLASS_Z],
  ]
}

/** 墙体内侧一点，供 FinRow 把法线指向南（+Z）。 */
export function eastSouthInward(): [number, number] {
  const line = eastSouthUpperLine()
  return [(line[0][0] + line[1][0]) / 2, EAST_SOUTH_GLASS_Z - 10]
}

/**
 * 上层实心盒轮廓：只把南皮收进 EAST_SOUTH_GLASS_T_M，把外皮让给玻璃盒。
 * 不改 eastUpperOutline()，以免牵动悬挑 / 雨棚 / 东立面。
 */
export function eastUpperSolidOutline(): Array<[number, number]> {
  const inset = EAST_SOUTH_GLASS_T_M
  return eastUpperOutline().map(([x, z]) => (z > 111.5 ? [x, z - inset] : [x, z]))
}

export type EastSouthGlassBox = {
  position: [number, number, number]
  size: [number, number, number]
}

/** 南墙上段玻璃薄盒：外皮仍在 EAST_SOUTH_GLASS_Z，厚度填回实心盒让出的南皮。 */
export function eastSouthGlassPose(): EastSouthGlassBox {
  const line = eastSouthUpperLine()
  const minX = Math.min(line[0][0], line[1][0])
  const maxX = Math.max(line[0][0], line[1][0])
  const width = maxX - minX
  const height = EAST_ROOF_M - EAST_LOWER_TOP_M
  const thickness = EAST_SOUTH_GLASS_T_M
  return {
    position: [(minX + maxX) / 2, EAST_LOWER_TOP_M + height / 2, EAST_SOUTH_GLASS_Z - thickness / 2],
    size: [width, height, thickness],
  }
}
