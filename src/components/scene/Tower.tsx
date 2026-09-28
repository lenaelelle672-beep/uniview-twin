import { useMemo } from 'react'
import { BoxGeometry } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { listFloorSpecs, TOWER_ROOF_M } from '../../data/floors'
import { curtainMaterial, grilleMaterial, jointMaterial, solidMaterial } from '../../scene/materials'
import { isFloorCurtainOpen, isFloorShellHidden, isRoofHidden } from '../../scene/stage/cut'
import { TOWER } from '../../scene/siteGeometry'
import { createTowerGlass } from '../../scene/towerGlass'
import { useTwinStore } from '../../store/store'
import { RoofSign } from './InstancedProp'

const BAND = 0.78
const WIDTH = TOWER.maxX - TOWER.minX
const DEPTH = TOWER.maxZ - TOWER.minZ

function mergeParts(parts: BoxGeometry[]) {
  const merged = mergeGeometries(parts)
  parts.forEach((geometry) => geometry.dispose())
  if (!merged) throw new Error('楼层几何为空')
  return merged
}

function makeBand(elevation: number) {
  const y = elevation + BAND / 2
  const thickness = 0.28
  const south = new BoxGeometry(WIDTH + 0.24, BAND, thickness)
  south.translate(0, y, TOWER.maxZ + thickness / 2)
  const north = new BoxGeometry(WIDTH + 0.24, BAND, thickness)
  north.translate(0, y, TOWER.minZ - thickness / 2)
  const east = new BoxGeometry(thickness, BAND, DEPTH + 0.24)
  east.translate(TOWER.maxX + thickness / 2, y, 0)
  const west = new BoxGeometry(thickness, BAND, DEPTH + 0.24)
  west.translate(TOWER.minX - thickness / 2, y, 0)
  return mergeParts([south, north, east, west])
}

function FloorShell({ id, elevation, height }: { id: string; elevation: number; height: number }) {
  const glass = useMemo(() => createTowerGlass(elevation, height), [elevation, height])
  const band = useMemo(() => makeBand(elevation), [elevation])
  const hidden = useTwinStore((state) => isFloorShellHidden(state.view, state.selectedFloor, elevation))
  const opened = useTwinStore((state) => isFloorCurtainOpen(state.view, state.selectedFloor, id))
  const enterFloor = useTwinStore((state) => state.enterFloor)
  return (
    <group
      name={`FloorShell-${id}`}
      visible={!hidden}
      onDoubleClick={(event) => {
        event.stopPropagation()
        enterFloor(id)
      }}
    >
      <mesh name={`FloorCurtain-${id}`} geometry={glass} material={curtainMaterial} visible={!opened} />
      <mesh geometry={band} material={jointMaterial} castShadow receiveShadow />
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
  const roofHidden = useTwinStore((state) => isRoofHidden(state.view, state.selectedFloor))
  const parapet = useMemo(() => makeParapet(), [])
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
      <group name="RoofAssembly" visible={!roofHidden}>
        <mesh geometry={roof} material={solidMaterial} castShadow receiveShadow />
        <mesh name="RoofParapet" geometry={parapet} material={grilleMaterial} castShadow receiveShadow />
        <RoofSign night={night} position={[signX, TOWER_ROOF_M, signZ]} />
      </group>
    </group>
  )
}
