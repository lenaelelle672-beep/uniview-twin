import { useMemo } from 'react'
import { COURTYARD } from '../../scene/siteGeometry'
import { extrudeUp } from '../../scene/extrude'
import { courtyardHole, ellipsePoints, outset, podiumOuterArc, podiumOutline, PODIUM_HEIGHT_M } from '../../scene/massing'
import { curtainMaterial, solidMaterial, stoneMaterial } from '../../scene/materials'
import { FinRow } from './Fins'

export function Podium({ model }: { model: boolean }) {
  const outline = useMemo(() => podiumOutline(), [])
  const hole = useMemo(() => courtyardHole(), [])
  const shell = useMemo(() => extrudeUp(outline, PODIUM_HEIGHT_M, [hole]), [hole, outline])
  const band = useMemo(() => extrudeUp(outset(outline, 0.16, [0, 22]), 0.42, [hole]), [hole, outline])
  const wall = useMemo(
    () =>
      extrudeUp(
        ellipsePoints(COURTYARD.cx, COURTYARD.cz, COURTYARD.rx + 0.55, COURTYARD.rz + 0.45, 40),
        COURTYARD.depth,
        [hole],
      ),
    [hole],
  )
  const arc = useMemo(() => podiumOuterArc(), [])
  const materials = model ? [solidMaterial, solidMaterial] : [solidMaterial, curtainMaterial]

  return (
    <group name="Podium">
      <mesh geometry={shell} material={materials} castShadow receiveShadow />
      <mesh geometry={band} material={solidMaterial} position={[0, 5.75, 0]} castShadow receiveShadow />
      <mesh geometry={wall} material={stoneMaterial} position={[0, -COURTYARD.depth, 0]} receiveShadow />
      <FinRow points={arc} spacing={1.55} y={PODIUM_HEIGHT_M / 2} height={PODIUM_HEIGHT_M * 0.92} outwardFrom={[0, 18]} />
    </group>
  )
}
