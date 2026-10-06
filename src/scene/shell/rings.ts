/**
 * 外壳挤出用的紧凑轮廓（D112：运行时不读楼层 JSON）。
 * 塔楼总览用 F13 outlineOverview（南弧 4 段）；单层视图用 F13 outline。
 * 来源文件（已从本 PR 删除，以 a 单 public/floors 为准）：
 * `assets/ready/floors/F13.json`
 * sha256 64905731b2ef7b842aaccb131f8fddcd701e0d75f4a36c44225c549b4925e23f
 */

export type Ring = Array<[number, number]>

/** F13.json `outlineOverview.polygons[0]`，来源 sha256 见文件头。 */
export const TOWER_OUTLINE_OVERVIEW: Ring = [
  [-30.1432, -14.8969],
  [29.0409, -14.8969],
  [29.0409, -2.295],
  [27.8134, -2.295],
  [27.8134, -0.2015],
  [30.2001, -0.2015],
  [30.2001, 15.2986],
  [28.5881, 15.2986],
  [28.5881, 21.7973],
  [28.228, 22.632],
  [21.3624, 20.4553],
  [12.582, 18.4914],
  [3.6461, 17.3785],
  [-3.5469, 17.1003],
  [-21.6806, 17.1003],
  [-21.6806, 16.2942],
  [-20.2554, 16.2942],
  [-20.2554, 15.2986],
  [-31.3093, 15.2986],
  [-31.3093, -0.2015],
  [-28.9158, -0.2015],
  [-28.9158, -2.295],
  [-30.1432, -2.295],
]

/** F13.json `outline[0]`，单层视图用；来源 sha256 见文件头。 */
export const TOWER_OUTLINE: Ring = [
  [-30.1432, -14.8969],
  [29.0409, -14.8969],
  [29.0409, -2.295],
  [27.8134, -2.295],
  [27.8134, -0.2015],
  [30.2001, -0.2015],
  [30.2001, 15.2986],
  [28.5881, 15.2986],
  [28.5881, 21.7973],
  [28.228, 22.632],
  [26.5259, 22.0347],
  [24.8157, 21.4782],
  [23.089, 20.9545],
  [21.3624, 20.4553],
  [19.6194, 19.9971],
  [17.8682, 19.5716],
  [16.1171, 19.1788],
  [14.3495, 18.8187],
  [12.582, 18.4914],
  [10.7981, 18.205],
  [9.0223, 17.9431],
  [7.2302, 17.7222],
  [5.4463, 17.534],
  [3.6461, 17.3785],
  [1.854, 17.2557],
  [0.0537, 17.1739],
  [-1.7466, 17.1248],
  [-3.5469, 17.1003],
  [-21.6806, 17.1003],
  [-21.6806, 16.2942],
  [-20.2554, 16.2942],
  [-20.2554, 15.2986],
  [-31.3093, 15.2986],
  [-31.3093, -0.2015],
  [-28.9158, -0.2015],
  [-28.9158, -2.295],
  [-30.1432, -2.295],
]

/** 8F 东墙 / 南墙（任务单）+ F08 西面弧墙抽稀。 */
export const EAST_FACE_X = 100.0535
export const EAST_NORTH_Z = 9.47
export const EAST_SOUTH_WALL_Z = 111.724
export const EAST_SOUTH_GLASS_Z = 112.09
export const EAST_WALL_LENGTH_M = 102.26
export const EAST_SOUTH_LENGTH_M = 59.06
export const EAST_GRILLE_ROT_Y = Math.PI / 2

export function eastBlockOutline(): Ring {
  const westSouth = EAST_FACE_X - EAST_SOUTH_LENGTH_M
  return [
    [51.4, EAST_NORTH_Z],
    [EAST_FACE_X, EAST_NORTH_Z],
    [EAST_FACE_X, EAST_SOUTH_WALL_Z],
    [EAST_FACE_X, EAST_SOUTH_GLASS_Z],
    [westSouth, EAST_SOUTH_GLASS_Z],
    [36.6, 110.49],
    [55.7, 49.29],
    [55.2, 37.09],
    [51.7, 28.19],
    [43.2, 17.69],
  ]
}

/** 1F～5F 北翼楼：x 57～90，z 到 −15（F01/F05 shellOutline）。 */
export const NORTH_WING_OUTLINE: Ring = [
  [57.0, -15.5],
  [90.8, -16.2],
  [91.1, 8.3],
  [57.0, 8.3],
]

/** 塔楼南侧 3F 那一块（F03 shellOutline）。 */
export const PODIUM_SOUTH_ADDON: Ring = [
  [-25.3, 17.15],
  [-25.21, 25.24],
  [-1.51, 25.54],
  [12.7, 28.84],
  [21.36, 20.46],
  [-3.55, 17.1],
  [-21.68, 17.1],
]

export function ringBounds(ring: Ring) {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const [x, z] of ring) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minZ = Math.min(minZ, z)
    maxZ = Math.max(maxZ, z)
  }
  return { minX, maxX, minZ, maxZ }
}

export const TOWER_OUTLINE_BOUNDS = ringBounds(TOWER_OUTLINE_OVERVIEW)

export function insetRing(ring: Ring, amount: number): Ring {
  const { minX, maxX, minZ, maxZ } = ringBounds(ring)
  const cx = (minX + maxX) / 2
  const cz = (minZ + maxZ) / 2
  return ring.map(([x, z]) => {
    const dx = x - cx
    const dz = z - cz
    const len = Math.hypot(dx, dz) || 1
    return [x - (dx / len) * amount, z - (dz / len) * amount]
  })
}
