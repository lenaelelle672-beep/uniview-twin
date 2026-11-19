import { useMemo } from 'react'
import { listFloorSpecs } from '../../data/floors'
import { TOWER_OUTLINE_OVERVIEW } from '../../scene/shell/rings'
import { isFloorCurtainOpen, isFloorShellHidden } from '../../scene/stage/cut'
import { useTwinStore } from '../../store/store'
import { FinRow } from './Fins'
import {
  splitTowerFinLoops,
  TOWER_WEST_FIN_DEPTH_M,
  TOWER_WEST_FIN_SPACING_M,
  TOWER_WEST_FIN_THICKNESS_M,
} from '../../scene/towerWestFins'

/**
 * T135：塔楼 FinRow 间距（米）。
 * 对照 exterior/04：下层塔楼水平层带中位 41 px，按 F04–F07 层高 4.2 m → 0.1024 m/px；
 * 正面规则竖肋间距 14–15 px（中位 14.5）→ 约 1.49 m。
 * user-real-2 大面中段层带约 17–18 px、竖肋约 6 px → 约 1.43 m。
 * 须严于裙房原 2.2 m 与原幕墙格线 1.55 m，取 1.4 m（亦与 4.2 m 层高整除）。
 */
export const TOWER_FIN_SPACING_M = 1.4
export { TOWER_WEST_FIN_SPACING_M }

/** 闭合的总览轮廓，供 finsAlong 绕塔一圈。 */
export function towerFinLoop(): Array<[number, number]> {
  return [...TOWER_OUTLINE_OVERVIEW, TOWER_OUTLINE_OVERVIEW[0]]
}

/** 塔楼轮廓形心，给 FinRow 判断外侧法线。 */
export function towerFocus(): [number, number] {
  const ring = TOWER_OUTLINE_OVERVIEW
  const n = ring.length
  return [
    ring.reduce((sum, [x]) => sum + x, 0) / n,
    ring.reduce((sum, [, z]) => sum + z, 0) / n,
  ]
}

const TOWER_FIN_POINTS = towerFinLoop()
const TOWER_FIN_FOCUS = towerFocus()
const TOWER_FIN_SPLIT = splitTowerFinLoops(TOWER_FIN_POINTS)

function FloorFinRow({
  id,
  elevation,
  height,
}: {
  id: string
  elevation: number
  height: number
}) {
  const hidden = useTwinStore((state) => isFloorShellHidden(state.view, state.selectedFloor, elevation))
  const opened = useTwinStore((state) => isFloorCurtainOpen(state.view, state.selectedFloor, id))
  if (hidden || opened) return null
  return (
    <group>
      {TOWER_FIN_SPLIT.west.map((points, index) => (
        <FinRow
          key={`west-${index}`}
          points={points}
          spacing={TOWER_WEST_FIN_SPACING_M}
          y={elevation + height / 2}
          height={height * 0.92}
          depth={TOWER_WEST_FIN_DEPTH_M}
          thickness={TOWER_WEST_FIN_THICKNESS_M}
          box
          outwardFrom={TOWER_FIN_FOCUS}
        />
      ))}
      {TOWER_FIN_SPLIT.rest.map((points, index) => (
        <FinRow
          key={`rest-${index}`}
          points={points}
          spacing={TOWER_FIN_SPACING_M}
          y={elevation + height / 2}
          height={height * 0.92}
          outwardFrom={TOWER_FIN_FOCUS}
        />
      ))}
    </group>
  )
}

/** 挂在当前单盒外壳上。T133 合入后由架构师 VOID，再挂到新双片外壳。 */
export function TowerFins() {
  const floors = useMemo(() => listFloorSpecs().filter((floor) => floor.level >= 1), [])
  return (
    <group name="TowerFins">
      {floors.map((floor) => (
        <FloorFinRow key={floor.id} id={floor.id} elevation={floor.elevation} height={floor.height} />
      ))}
    </group>
  )
}

export default TowerFins
