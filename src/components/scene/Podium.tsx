import { useMemo } from 'react'
import { BufferGeometry, Float32BufferAttribute } from 'three'
import { COURT_DEPTH_M, COURT_SLOPE_M } from '../../scene/siteGeometry'
import { extrudeUp } from '../../scene/extrude'
import { courtyardHole, outset, podiumFrontArc, podiumFocus, podiumOutline, PODIUM_HEIGHT_M } from '../../scene/massing'
import { courtWallMaterial, curtainMaterial, eaveMaterial, solidMaterial } from '../../scene/materials'
import { floorViewCastsExteriorShadow } from '../../scene/stage/cut'
import { useTwinStore } from '../../store/store'
import { FinRow } from './Fins'

function insetToward(points: Array<[number, number]>, amount: number): Array<[number, number]> {
  const cx = points.reduce((sum, [x]) => sum + x, 0) / points.length
  const cz = points.reduce((sum, [, z]) => sum + z, 0) / points.length
  return points.map(([x, z]) => {
    const dx = x - cx
    const dz = z - cz
    const len = Math.hypot(dx, dz) || 1
    return [x - (dx / len) * amount, z - (dz / len) * amount]
  })
}

function makeBasin() {
  const topRing = courtyardHole()
  const bottomRing = insetToward(topRing, COURT_SLOPE_M)
  const positions: number[] = []
  const push = (points: Array<[number, number]>, y: number) => {
    const start = positions.length / 3
    points.forEach(([x, z]) => positions.push(x, y, z))
    return start
  }
  const top = push(topRing, 0.25)
  const bottom = push(bottomRing, -COURT_DEPTH_M)
  const count = topRing.length
  const indices: number[] = []
  for (let i = 0; i < count; i += 1) {
    const next = (i + 1) % count
    indices.push(top + i, bottom + i, top + next, bottom + i, bottom + next, top + next)
  }
  const cx = bottomRing.reduce((sum, [x]) => sum + x, 0) / count
  const cz = bottomRing.reduce((sum, [, z]) => sum + z, 0) / count
  const center = positions.length / 3
  positions.push(cx, -COURT_DEPTH_M, cz)
  for (let i = 0; i < count; i += 1) {
    indices.push(center, bottom + ((i + 1) % count), bottom + i)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

export function Podium({ model }: { model: boolean }) {
  const exteriorShadow = useTwinStore((state) => floorViewCastsExteriorShadow(state.view))
  const outline = useMemo(() => podiumOutline(), [])
  const focus = useMemo(() => podiumFocus(), [])
  const shell = useMemo(() => extrudeUp(outline, PODIUM_HEIGHT_M), [outline])
  const band = useMemo(() => extrudeUp(outset(outline, 0.16, focus), 0.42), [focus, outline])
  const basin = useMemo(() => makeBasin(), [])
  const arc = useMemo(() => podiumFrontArc(), [])
  const materials = model ? [solidMaterial, solidMaterial] : [solidMaterial, curtainMaterial]

  return (
    <group name="Podium">
      <mesh geometry={shell} material={materials} castShadow={exteriorShadow} receiveShadow />
      <mesh geometry={band} material={model ? solidMaterial : eaveMaterial} position={[0, 5.75, 0]} castShadow={exteriorShadow} receiveShadow />
      <mesh name="CourtyardWall" geometry={basin} material={courtWallMaterial} receiveShadow />
      <FinRow
        points={arc}
        spacing={2.2}
        y={PODIUM_HEIGHT_M / 2}
        height={PODIUM_HEIGHT_M * 0.92}
        outwardFrom={focus}
        castShadow={exteriorShadow}
      />
    </group>
  )
}
