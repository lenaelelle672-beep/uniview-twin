import { useState } from 'react'
import { Color, type Mesh } from 'three'
import { MeasureSurface } from '../pick/MeasureSurface'
import type { FloorSpec } from '../../data/floors'
import type { Device } from '../../types'
import { TOWER } from '../siteGeometry'
import { SLAB_M } from './cut'
import { Ceiling } from './Ceiling'
import {
  columnGeometry,
  coreFloorGeometry,
  elevatorGeometry,
  meetingChairGeometry,
  meetingFrameGeometry,
  meetingGlassGeometry,
  receptionBackGeometry,
  towerCoreGeometry,
  towerWoodGeometry,
} from './geometry'
import { towerColumns, type Slot } from './layout'
import {
  chairMaterial,
  columnMaterial,
  coreMaterial,
  coreWallMaterial,
  darkMaterial,
  meetingGlassMaterial,
  metalMaterial,
  pantryMaterial,
  receptionMaterial,
  slabMaterial,
  woodMaterial,
} from './materials'
import { DeskFlash } from './DeskFlash'
import { FloorMultiOutlines, FocusedDeskOutlines } from './DeskOutline'
import { FloorDecor } from './lazyFloorDecor'
import { towerRoomLabels } from './roomLabels'
import { InstancedSlots, Workstations } from './Workstations'

const columns = towerColumns().map((column) => ({ ...column, rot: 0 }))

export function TowerInterior({
  spec,
  slots,
  colors,
  devices,
  showPeople,
}: {
  spec: FloorSpec
  slots: Slot[]
  colors: Color[]
  devices: Device[]
  showPeople: boolean
}) {
  const width = TOWER.maxX - TOWER.minX - 0.7
  const depth = TOWER.maxZ - TOWER.minZ - 0.7
  const [slabMesh, setSlabMesh] = useState<Mesh | null>(null)

  return (
    <group
      name="FloorInterior"
      position={[0, spec.elevation + SLAB_M, 0]}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <group name="FloorPlate">
        <mesh
          ref={setSlabMesh}
          name="FloorSlab"
          position={[0, -SLAB_M / 2, 0]}
          material={slabMaterial}
          receiveShadow
        >
          <boxGeometry args={[width, SLAB_M, depth]} />
        </mesh>
        <MeasureSurface name="PickBvh:measure-slab" target={slabMesh} />
      </group>
      <mesh geometry={coreFloorGeometry} material={coreMaterial} receiveShadow />
      <mesh geometry={towerCoreGeometry} material={coreWallMaterial} castShadow receiveShadow />
      <mesh geometry={elevatorGeometry} material={darkMaterial} />
      <mesh geometry={towerWoodGeometry} material={woodMaterial} castShadow receiveShadow />
      <mesh geometry={receptionBackGeometry} material={receptionMaterial} castShadow receiveShadow />
      <mesh name="PantryPad" position={[11.95, 0.05, 4.35]} material={pantryMaterial} receiveShadow>
        <boxGeometry args={[7.5, 0.04, 6.2]} />
      </mesh>
      <mesh geometry={meetingChairGeometry} material={chairMaterial} castShadow />
      <mesh geometry={meetingFrameGeometry} material={metalMaterial} castShadow />
      <mesh geometry={meetingGlassGeometry} material={meetingGlassMaterial} />
      <InstancedSlots name="FloorColumns" geometry={columnGeometry} material={columnMaterial} slots={columns} />
      <Workstations slots={slots} colors={colors} />
      <FloorMultiOutlines floorId={spec.id} />
      <FocusedDeskOutlines floorId={spec.id} />
      <DeskFlash floorId={spec.id} />
      <FloorDecor floorId={spec.id} devices={devices} labels={towerRoomLabels()} showPeople={showPeople} />
      <Ceiling width={width} depth={depth} y={spec.height - SLAB_M - 0.06} />
    </group>
  )
}
