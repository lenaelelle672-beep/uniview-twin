import { useMemo } from 'react'
import { BoxGeometry, PlaneGeometry } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { InstancedProp, PROP_URL } from './InstancedProp'
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
import {
  footprintOutline,
  PARCEL_WORLD,
  placeStreetFurniture,
  roadRibbons,
  sidewalkRibbons,
  zebraStripes,
  type Ribbon,
} from '../../scene/siteGeometry'

const PARK: Array<[number, number]> = [
  [-240, -90],
  [160, -90],
  [160, 210],
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

export function Site({ model, night, perf }: { model: boolean; night: boolean; perf: boolean }) {
  const furniture = useMemo(() => placeStreetFurniture(), [])
  const court = useMemo(() => courtyardHole(), [])
  const park = useMemo(() => extrudeUp(PARK, 0.04, [court]), [court])
  const parcel = useMemo(() => extrudeUp(PARCEL_WORLD, 0.1, [court]), [court])
  const plinth = useMemo(() => extrudeUp(footprintOutline(), 0.2), [])
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

  if (model) {
    return <mesh geometry={plinth} material={plinthMaterial} receiveShadow position={[0, -0.2, 0]} />
  }

  return (
    <group>
      <mesh geometry={park} material={grassMaterial} receiveShadow />
      <mesh geometry={parcel} material={pavingMaterial} position={[0, 0.04, 0]} receiveShadow />
      <mesh geometry={sidewalk} material={sidewalkMaterial} receiveShadow />
      <mesh geometry={roads} material={roadMaterial} receiveShadow />
      <mesh geometry={zebras} material={zebraMaterial} receiveShadow />
      <InstancedProp
        url={perf ? PROP_URL.TREE_LO : PROP_URL.TREE_HI}
        placements={furniture.trees}
        night={night}
        y={0.12}
      />
      <InstancedProp url={PROP_URL.LAMP} placements={furniture.lamps} night={night} y={0.12} />
    </group>
  )
}
