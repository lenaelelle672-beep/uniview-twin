import { useMemo } from 'react'
import { BoxGeometry, PlaneGeometry } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { QualityTier } from '../../types'
import { selectTreeModels } from '../../scene/quality'
import { FoliageShadow, InstancedProp, PROP_URL } from './InstancedProp'
import { extrudeUp } from '../../scene/extrude'
import { courtyardHole } from '../../scene/massing'
import {
  grassMaterial,
  pavingMaterial,
  plinthMaterial,
  roadMaterial,
  sidewalkMaterial,
  zebraMaterial,
} from '../../scene/materials'
import { useTwinStore } from '../../store/store'
import {
  footprintOutline,
  PARCEL_WORLD,
  placeStreetFurniture,
  roadRibbons,
  sidewalkRibbons,
  zebraStripes,
  type Ribbon,
} from '../../scene/siteGeometry'

export function ParcelMesh() {
  const setSelectedFloor = useTwinStore((state) => state.setSelectedFloor)
  const court = useMemo(() => courtyardHole(), [])
  const parcel = useMemo(() => extrudeUp(PARCEL_WORLD, 0.1, [court], 'top'), [court])
  return (
    <mesh
      name="Parcel"
      geometry={parcel}
      material={pavingMaterial}
      position={[0, 0.04, 0]}
      renderOrder={1}
      receiveShadow
      onClick={(event) => {
        if (event.delta > 2) return
        event.stopPropagation()
        setSelectedFloor(null)
      }}
    />
  )
}

/**
 * 整块草地一张网。东缘伸到 `?cam=east` 机位（x=290）背后。
 * 边上加折点，避免 11b1bd0 之后东扩成长三角 / T 接缝（D094-2 / D115 / D123）。
 */
const PARK: Array<[number, number]> = [
  [-240, -90],
  [-40, -90],
  [160, -90],
  [250, -90],
  [340, -90],
  [340, 60],
  [340, 210],
  [250, 210],
  [160, 210],
  [-40, 210],
  [-240, 210],
]

function ribbonGeometry(ribbons: Ribbon[], y: number) {
  const parts = ribbons.map((ribbon) => {
    const dx = ribbon.b[0] - ribbon.a[0]
    const dz = ribbon.b[1] - ribbon.a[1]
    const length = Math.hypot(dx, dz)
    const geometry = new PlaneGeometry(Math.max(length, 0.1), ribbon.halfWidth * 2)
    geometry.rotateX(-Math.PI / 2)
    geometry.rotateY(-Math.atan2(dz, dx))
    geometry.translate((ribbon.a[0] + ribbon.b[0]) / 2, y, (ribbon.a[1] + ribbon.b[1]) / 2)
    return geometry
  })
  const merged = mergeGeometries(parts)
  parts.forEach((geometry) => geometry.dispose())
  if (!merged) throw new Error('道路几何为空')
  return merged
}

export function Site({ model, night, quality }: { model: boolean; night: boolean; quality: QualityTier }) {
  const setSelectedFloor = useTwinStore((state) => state.setSelectedFloor)
  const furniture = useMemo(() => placeStreetFurniture(), [])
  const court = useMemo(() => courtyardHole(), [])
  const park = useMemo(() => extrudeUp(PARK, 0.02, [court], 'top'), [court])
  const plinth = useMemo(() => extrudeUp(footprintOutline(), 0.2, [], 'top'), [])
  const sidewalk = useMemo(() => ribbonGeometry(sidewalkRibbons(), 0.08), [])
  const roads = useMemo(() => ribbonGeometry(roadRibbons(), 0.12), [])
  const zebras = useMemo(() => {
    const parts = zebraStripes().map((stripe) => {
      const geometry = new BoxGeometry(stripe.width, 0.03, stripe.length)
      geometry.translate(stripe.x, 0.15, stripe.z)
      return geometry
    })
    const merged = mergeGeometries(parts)
    parts.forEach((geometry) => geometry.dispose())
    if (!merged) throw new Error('斑马线几何为空')
    return merged
  }, [])
  const trees = selectTreeModels(quality)

  const clearSelection = (event: { delta: number; stopPropagation: () => void }) => {
    if (event.delta > 2) return
    event.stopPropagation()
    setSelectedFloor(null)
  }

  if (model) {
    return (
      <mesh geometry={plinth} material={plinthMaterial} receiveShadow position={[0, -0.2, 0]} onClick={clearSelection} />
    )
  }

  return (
    <group onClick={clearSelection}>
      <mesh name="Park" geometry={park} material={grassMaterial} renderOrder={0} receiveShadow />
      <mesh geometry={sidewalk} material={sidewalkMaterial} receiveShadow />
      <mesh geometry={roads} material={roadMaterial} receiveShadow />
      <mesh geometry={zebras} material={zebraMaterial} receiveShadow />
      <InstancedProp
        url={trees.visual === 'lo' ? PROP_URL.TREE_LO : PROP_URL.TREE_HI}
        placements={furniture.trees}
        night={night}
        y={0.12}
        leafCastShadow={trees.shadow == null}
      />
      {trees.shadow && <FoliageShadow url={PROP_URL.TREE_LO} placements={furniture.trees} y={0.12} />}
      <InstancedProp url={PROP_URL.LAMP} placements={furniture.lamps} night={night} y={0.12} />
    </group>
  )
}
