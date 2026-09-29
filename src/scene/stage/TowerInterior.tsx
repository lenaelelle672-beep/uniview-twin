import { Color } from 'three'
import type { FloorSpec } from '../../data/floors'
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
import { InstancedSlots, Workstations } from './Workstations'

const columns = towerColumns().map((column) => ({ ...column, rot: 0 }))

export function TowerInterior({
  spec,
  slots,
  colors,
}: {
  spec: FloorSpec
  slots: Slot[]
  colors: Color[]
}) {
  const width = TOWER.maxX - TOWER.minX - 0.7
  const depth = TOWER.maxZ - TOWER.minZ - 0.7

  return (
    <group
      name="FloorInterior"
      position={[0, spec.elevation + SLAB_M, 0]}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <group name="FloorPlate">
        <mesh name="FloorSlab" position={[0, -SLAB_M / 2, 0]} material={slabMaterial} receiveShadow>
          <boxGeometry args={[width, SLAB_M, depth]} />
        </mesh>
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
      <DeskFlash floorId={spec.id} />
      <Ceiling width={width} depth={depth} y={spec.height - SLAB_M - 0.06} />
    </group>
  )
}
