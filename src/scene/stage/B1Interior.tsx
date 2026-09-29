import { useEffect, useMemo } from 'react'
import { Color } from 'three'
import { extrudeUp } from '../extrude'
import { b1SlabOutline, ellipseRing, ringFromAabb } from './b1Plan'
import { SLAB_M } from './cut'
import { Ceiling } from './Ceiling'
import {
  columnGeometry,
  coreFloorGeometry,
  diningChairGeometry,
  elevatorGeometry,
  kitchenGeometry,
  privateChairGeometry,
  privateGlassGeometry,
  privateWoodGeometry,
  roundTableGeometry,
  seatGeometry,
  stageGeometry,
  towerCoreGeometry,
} from './geometry'
import {
  B1_ATRIUM,
  B1_CEILING,
  B1_PLAZA,
  b1Columns,
  b1CoreOffset,
  canteenChairs,
  canteenFloorSize,
  canteenPadCenter,
  canteenTables,
  fanOutline,
  fanSeatSlots,
  type Slot,
} from './layout'
import {
  atriumInnerMaterial,
  atriumMaterial,
  canteenMaterial,
  chairMaterial,
  columnMaterial,
  coreMaterial,
  coreWallMaterial,
  darkMaterial,
  fanFloorMaterial,
  kitchenMaterial,
  meetingGlassMaterial,
  seatMaterial,
  slabMaterial,
  stageMaterial,
  woodMaterial,
} from './materials'
import { DeskFlash } from './DeskFlash'
import { InstancedSlots, Workstations } from './Workstations'

const tables = canteenTables().map((table) => ({ ...table, rot: 0 }))
const diningChairs = canteenChairs(canteenTables())
const fanSeats = fanSeatSlots()
const columns = b1Columns().map((column) => ({ ...column, rot: 0 }))

export function B1Interior({ slots, colors }: { slots: Slot[]; colors: Color[] }) {
  const slab = useMemo(() => {
    const geometry = extrudeUp(b1SlabOutline(), SLAB_M)
    geometry.translate(0, -SLAB_M, 0)
    return geometry
  }, [])
  const fan = useMemo(() => extrudeUp(fanOutline(), 0.08), [])
  const court = useMemo(() => extrudeUp(ringFromAabb(B1_PLAZA), 0.05), [])
  const courtInner = useMemo(
    () => extrudeUp(ellipseRing(B1_ATRIUM.cx, B1_ATRIUM.cz, B1_ATRIUM.rx, B1_ATRIUM.rz, 36), 0.08),
    [],
  )
  const canteen = canteenPadCenter()
  const canteenSize = canteenFloorSize()
  const core = b1CoreOffset()
  useEffect(() => {
    return () => {
      slab.dispose()
      fan.dispose()
      court.dispose()
      courtInner.dispose()
    }
  }, [court, courtInner, fan, slab])

  const ceilingX = (B1_CEILING.x0 + B1_CEILING.x1) / 2
  const ceilingZ = (B1_CEILING.z0 + B1_CEILING.z1) / 2

  return (
    <group name="FloorInterior" position={[0, -5.5 + SLAB_M, 0]} onDoubleClick={(event) => event.stopPropagation()}>
      <group name="FloorPlate">
        <mesh name="FloorSlab" geometry={slab} material={slabMaterial} receiveShadow />
      </group>
      <mesh geometry={court} material={atriumMaterial} receiveShadow />
      <mesh geometry={courtInner} material={atriumInnerMaterial} position={[0, 0.02, 0]} />
      <mesh geometry={fan} material={fanFloorMaterial} receiveShadow />
      <mesh geometry={stageGeometry} material={stageMaterial} castShadow receiveShadow />
      <InstancedSlots name="FanSeats" geometry={seatGeometry} material={seatMaterial} slots={fanSeats} />
      <mesh position={[canteen.x, 0.02, canteen.z]} material={canteenMaterial} receiveShadow>
        <boxGeometry args={[canteenSize.w, 0.04, canteenSize.d]} />
      </mesh>
      <InstancedSlots name="CanteenTables" geometry={roundTableGeometry} material={woodMaterial} slots={tables} />
      <InstancedSlots name="CanteenChairs" geometry={diningChairGeometry} material={chairMaterial} slots={diningChairs} />
      <mesh geometry={kitchenGeometry} material={kitchenMaterial} castShadow receiveShadow />
      <mesh geometry={privateWoodGeometry} material={woodMaterial} castShadow receiveShadow />
      <mesh geometry={privateChairGeometry} material={chairMaterial} />
      <mesh geometry={privateGlassGeometry} material={meetingGlassMaterial} />
      <group position={[core.x, 0, core.z]}>
        <mesh geometry={coreFloorGeometry} material={coreMaterial} receiveShadow />
        <mesh geometry={towerCoreGeometry} material={coreWallMaterial} castShadow receiveShadow />
        <mesh geometry={elevatorGeometry} material={darkMaterial} />
      </group>
      <InstancedSlots name="FloorColumns" geometry={columnGeometry} material={columnMaterial} slots={columns} />
      <Workstations slots={slots} colors={colors} />
      <DeskFlash floorId="B1" />
      <Ceiling
        width={B1_CEILING.x1 - B1_CEILING.x0}
        depth={B1_CEILING.z1 - B1_CEILING.z0}
        x={ceilingX}
        y={5.5 - SLAB_M - 0.08}
        z={ceilingZ}
      />
    </group>
  )
}
