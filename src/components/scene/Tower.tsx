import { useMemo } from 'react'
import { BoxGeometry, BufferGeometry } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { listFloorSpecs, TOWER_ROOF_M } from '../../data/floors'
import {
  curtainMaterial,
  grilleMaterial,
  highlightCurtainMaterial,
  highlightJointMaterial,
  jointMaterial,
  revealMaterial,
  solidMaterial,
} from '../../scene/materials'
import { TOWER } from '../../scene/siteGeometry'
import { createTowerGlass } from '../../scene/towerGlass'
import { useTwinStore } from '../../store/store'
import { RoofSign } from './InstancedProp'
import { useFloorActions } from './floorPick'

const BAND = 0.78
const WIDTH = TOWER.maxX - TOWER.minX
const DEPTH = TOWER.maxZ - TOWER.minZ
const REVEAL = 0.16
const LIP = BAND - REVEAL

function mergeParts(parts: BufferGeometry[]) {
  const merged = mergeGeometries(parts)
  parts.forEach((geometry) => geometry.dispose())
  if (!merged) throw new Error('楼层几何为空')
  return merged
}

function makeRing(height: number, y: number, thickness: number) {
  const south = new BoxGeometry(WIDTH + thickness * 2, height, thickness)
  south.translate(0, y, TOWER.maxZ + thickness / 2)
  const north = new BoxGeometry(WIDTH + thickness * 2, height, thickness)
  north.translate(0, y, TOWER.minZ - thickness / 2)
  const east = new BoxGeometry(thickness, height, DEPTH)
  east.translate(TOWER.maxX + thickness / 2, y, 0)
  const west = new BoxGeometry(thickness, height, DEPTH)
  west.translate(TOWER.minX - thickness / 2, y, 0)
  return mergeParts([south, north, east, west])
}

function makeBand(elevation: number) {
  const y = elevation + REVEAL + LIP / 2
  return makeRing(LIP, y, 0.46)
}

function makeReveal(elevation: number) {
  const y = elevation + REVEAL / 2
  return makeRing(REVEAL, y, 0.2)
}

function FloorShell({ id, elevation, height }: { id: string; elevation: number; height: number }) {
  const selected = useTwinStore((state) => state.selectedFloor === id)
  const actions = useFloorActions(id)
  const glass = useMemo(() => createTowerGlass(elevation, height), [elevation, height])
  const band = useMemo(() => makeBand(elevation), [elevation])
  return (
    <group name={`FloorShell-${id}`} userData={{ floorId: id }}>
      <mesh
        geometry={glass}
        material={selected ? highlightCurtainMaterial : curtainMaterial}
        userData={{ floorId: id }}
        {...actions}
      />
      <mesh
        geometry={band}
        material={selected ? highlightJointMaterial : jointMaterial}
        userData={{ floorId: id }}
        castShadow
        receiveShadow
        {...actions}
      />
    </group>
  )
}

function makeParapet() {
  const height = 4
  const thickness = 0.36
  const y = TOWER_ROOF_M + height / 2
  const south = new BoxGeometry(WIDTH + 0.8, height, thickness)
  south.translate(0, y, TOWER.maxZ + 0.1 + thickness / 2)
  const north = new BoxGeometry(WIDTH + 0.8, height, thickness)
  north.translate(0, y, TOWER.minZ - 0.1 - thickness / 2)
  const east = new BoxGeometry(thickness, height, DEPTH + 0.8)
  east.translate(TOWER.maxX + 0.1 + thickness / 2, y, 0)
  const west = new BoxGeometry(thickness, height, DEPTH + 0.8)
  west.translate(TOWER.minX - 0.1 - thickness / 2, y, 0)
  return mergeParts([south, north, east, west])
}

export function Tower({ night }: { night: boolean }) {
  const floors = useMemo(() => listFloorSpecs().filter((floor) => floor.level >= 1), [])
  const parapet = useMemo(() => makeParapet(), [])
  const reveals = useMemo(() => {
    const parts = floors.map((floor) => makeReveal(floor.elevation))
    return mergeParts(parts)
  }, [floors])
  const roof = useMemo(() => {
    const geometry = new BoxGeometry(WIDTH - 0.6, 0.35, DEPTH - 0.6)
    geometry.translate(0, TOWER_ROOF_M - 0.175, 0)
    return geometry
  }, [])
  const signZ = TOWER.maxZ + 0.1 + 0.36 + 0.03
  const signX = TOWER.minX + 7.5 + 1.4

  return (
    <group name="Tower">
      {floors.map((floor) => (
        <FloorShell key={floor.id} id={floor.id} elevation={floor.elevation} height={floor.height} />
      ))}
      <mesh name="FloorReveals" geometry={reveals} material={revealMaterial} />
      <mesh geometry={roof} material={solidMaterial} castShadow receiveShadow />
      <mesh name="RoofParapet" geometry={parapet} material={grilleMaterial} castShadow receiveShadow />
      <RoofSign night={night} position={[signX, TOWER_ROOF_M, signZ]} />
    </group>
  )
}
