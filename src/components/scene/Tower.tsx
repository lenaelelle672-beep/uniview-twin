import { useMemo } from 'react'
import { listFloorSpecs } from '../../data/floors'
import { TOWER_PARAPET_TOP_M, TOWER_ROOF_M } from '../../data/levels'
import { extrudeUp } from '../../scene/extrude'
import {
  curtainMaterial,
  grilleMaterial,
  highlightCurtainMaterial,
  highlightJointMaterial,
  jointMaterial,
  solidMaterial,
} from '../../scene/materials'
import { BUILDING_HIGHLIGHT_ORDER } from '../../scene/overlayOrder'
import { createRingBand, TOWER_BAND } from '../../scene/shell/facade'
import { TOWER_OUTLINE_OVERVIEW } from '../../scene/shell/rings'
import { isFloorCurtainOpen, isFloorShellHidden, isRoofHidden } from '../../scene/stage/cut'
import { createTowerGlass } from '../../scene/towerGlass'
import { useTwinStore } from '../../store/store'
import { RoofSign } from './RoofSign'
import { useFloorActions } from './floorPick'

function FloorShell({
  id,
  elevation,
  height,
}: {
  id: string
  elevation: number
  height: number
}) {
  const glass = useMemo(() => createTowerGlass(elevation, height), [elevation, height])
  const band = useMemo(
    () => createRingBand(TOWER_OUTLINE_OVERVIEW, elevation + TOWER_BAND / 2, TOWER_BAND),
    [elevation],
  )
  const hidden = useTwinStore((state) => isFloorShellHidden(state.view, state.selectedFloor, elevation))
  const opened = useTwinStore((state) => isFloorCurtainOpen(state.view, state.selectedFloor, id))
  const selected = useTwinStore(
    (state) => state.view === 'building' && (state.selectedFloor === id || state.hoveredFloor === id),
  )
  const actions = useFloorActions(id)
  return (
    <group name={`FloorShell-${id}`} visible={!hidden} {...actions}>
      <mesh
        name={`FloorCurtain-${id}`}
        geometry={glass}
        material={selected ? highlightCurtainMaterial : curtainMaterial}
        visible={!opened}
        renderOrder={selected ? BUILDING_HIGHLIGHT_ORDER : 0}
      />
      <mesh
        name={`FloorBand-${id}`}
        geometry={band}
        material={selected ? highlightJointMaterial : jointMaterial}
        castShadow
        receiveShadow
        renderOrder={selected ? BUILDING_HIGHLIGHT_ORDER : 0}
      />
    </group>
  )
}

function roofSignPose(): [number, number, number] {
  const southWest: [number, number] = [-21.6806, 17.1003]
  return [southWest[0] + 7.5 + 1.4, TOWER_ROOF_M, southWest[1] + 0.1 + 0.36 + 0.03]
}

export function Tower({ night }: { night: boolean }) {
  const floors = useMemo(() => listFloorSpecs().filter((floor) => floor.level >= 1), [])
  const roofHidden = useTwinStore((state) => isRoofHidden(state.view, state.selectedFloor))
  const parapet = useMemo(() => {
    const height = TOWER_PARAPET_TOP_M - TOWER_ROOF_M
    return createRingBand(TOWER_OUTLINE_OVERVIEW, TOWER_ROOF_M + height / 2, height, 0.36, 0.1, 'outer-top')
  }, [])
  const roof = useMemo(() => {
    const geometry = extrudeUp(TOWER_OUTLINE_OVERVIEW, 0.35, [], 'top')
    geometry.translate(0, TOWER_ROOF_M - 0.35, 0)
    return geometry
  }, [])
  const sign = roofSignPose()

  return (
    <group name="Tower">
      {floors.map((floor) => (
        <FloorShell key={floor.id} id={floor.id} elevation={floor.elevation} height={floor.height} />
      ))}
      <group name="RoofAssembly" visible={!roofHidden}>
        <mesh geometry={roof} material={solidMaterial} castShadow receiveShadow />
        <mesh name="RoofParapet" geometry={parapet} material={grilleMaterial} castShadow receiveShadow />
        <RoofSign night={night} position={sign} />
      </group>
    </group>
  )
}
