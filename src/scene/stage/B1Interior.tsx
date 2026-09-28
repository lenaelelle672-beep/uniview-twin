import { useEffect, useMemo } from 'react'
import { Color } from 'three'
import { ellipsePoints } from '../massing'
import { FOOTPRINT, footprintOutline } from '../siteGeometry'
import { extrudeUp } from '../extrude'
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
  B1_SHIFT,
  b1Columns,
  canteenChairs,
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
import { InstancedSlots, Workstations } from './Workstations'

const tables = canteenTables().map((table) => ({ ...table, rot: 0 }))
const diningChairs = canteenChairs(canteenTables())
const fanSeats = fanSeatSlots()
const columns = b1Columns().map((column) => ({ ...column, rot: 0 }))

export function B1Interior({ slots, colors }: { slots: Slot[]; colors: Color[] }) {
  const slab = useMemo(() => {
    const geometry = extrudeUp(footprintOutline(), SLAB_M)
    geometry.translate(0, -SLAB_M, 0)
    return geometry
  }, [])
  const fan = useMemo(() => extrudeUp(fanOutline(), 0.08), [])
  const court = useMemo(
    () => extrudeUp(ellipsePoints(B1_ATRIUM.cx, B1_ATRIUM.cz, B1_ATRIUM.rx, B1_ATRIUM.rz, 36), 0.05),
    [],
  )
  const courtInner = useMemo(
    () => extrudeUp(ellipsePoints(B1_ATRIUM.cx, B1_ATRIUM.cz, B1_ATRIUM.rx - 3.2, B1_ATRIUM.rz - 1.8, 28), 0.08),
    [],
  )
  const canteen = canteenPadCenter()
  useEffect(() => {
    return () => {
      slab.dispose()
      fan.dispose()
      court.dispose()
      courtInner.dispose()
    }
  }, [court, courtInner, fan, slab])

  const ceilingX = (FOOTPRINT.minX + FOOTPRINT.maxX) / 2
  const ceilingZ = (FOOTPRINT.minZ + FOOTPRINT.maxZ) / 2

  return (
    <group name="FloorInterior" position={[0, -5.5 + SLAB_M, 0]} onDoubleClick={(event) => event.stopPropagation()}>
      <mesh name="FloorSlab" geometry={slab} material={slabMaterial} receiveShadow />
      <mesh geometry={court} material={atriumMaterial} receiveShadow />
      <mesh geometry={courtInner} material={atriumInnerMaterial} position={[0, 0.02, 0]} />
      <mesh geometry={fan} material={fanFloorMaterial} receiveShadow />
      <mesh geometry={stageGeometry} material={stageMaterial} castShadow receiveShadow />
      <InstancedSlots name="FanSeats" geometry={seatGeometry} material={seatMaterial} slots={fanSeats} />
      <mesh position={[canteen.x, 0.02, canteen.z]} material={canteenMaterial} receiveShadow>
        <boxGeometry args={[11.2, 0.04, 15.6]} />
      </mesh>
      <InstancedSlots name="CanteenTables" geometry={roundTableGeometry} material={woodMaterial} slots={tables} />
      <InstancedSlots name="CanteenChairs" geometry={diningChairGeometry} material={chairMaterial} slots={diningChairs} />
      <mesh geometry={kitchenGeometry} material={kitchenMaterial} castShadow receiveShadow />
      <mesh geometry={privateWoodGeometry} material={woodMaterial} castShadow receiveShadow />
      <mesh geometry={privateChairGeometry} material={chairMaterial} />
      <mesh geometry={privateGlassGeometry} material={meetingGlassMaterial} />
      <group position={[B1_SHIFT.x, 0, B1_SHIFT.z]}>
        <mesh geometry={coreFloorGeometry} material={coreMaterial} receiveShadow />
        <mesh geometry={towerCoreGeometry} material={coreWallMaterial} castShadow receiveShadow />
        <mesh geometry={elevatorGeometry} material={darkMaterial} />
      </group>
      <InstancedSlots name="FloorColumns" geometry={columnGeometry} material={columnMaterial} slots={columns} />
      <Workstations slots={slots} colors={colors} />
      <Ceiling
        width={FOOTPRINT.maxX - FOOTPRINT.minX}
        depth={FOOTPRINT.maxZ - FOOTPRINT.minZ}
        x={ceilingX}
        y={5.5 - SLAB_M - 0.08}
        z={ceilingZ}
      />
    </group>
  )
}
