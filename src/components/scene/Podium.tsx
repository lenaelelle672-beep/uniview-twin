import { useMemo } from 'react'
import { BufferGeometry, Float32BufferAttribute } from 'three'
import { COURTYARD } from '../../scene/siteGeometry'
import { extrudeUp } from '../../scene/extrude'
import { outset, podiumOuterArc, podiumOutline, PODIUM_HEIGHT_M } from '../../scene/massing'
import { courtWallMaterial, curtainMaterial, solidMaterial } from '../../scene/materials'
import { FinRow } from './Fins'

function makeBasin() {
  const { cx, cz, rx, rz, depth, slope } = COURTYARD
  const segments = 48
  const positions: number[] = []
  const pushRing = (radiusX: number, radiusZ: number, y: number) => {
    const start = positions.length / 3
    for (let i = 0; i < segments; i += 1) {
      const t = (i / segments) * Math.PI * 2
      positions.push(cx + Math.cos(t) * radiusX, y, cz + Math.sin(t) * radiusZ)
    }
    return start
  }
  const top = pushRing(rx, rz, 0.25)
  const bottom = pushRing(Math.max(rx - slope, 4), Math.max(rz - slope * 0.7, 3), -depth)
  const indices: number[] = []
  for (let i = 0; i < segments; i += 1) {
    const next = (i + 1) % segments
    indices.push(top + i, bottom + i, top + next, bottom + i, bottom + next, top + next)
  }
  const center = positions.length / 3
  positions.push(cx, -depth, cz)
  for (let i = 0; i < segments; i += 1) {
    indices.push(center, bottom + ((i + 1) % segments), bottom + i)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

export function Podium({ model }: { model: boolean }) {
  const outline = useMemo(() => podiumOutline(), [])
  const shell = useMemo(() => extrudeUp(outline, PODIUM_HEIGHT_M), [outline])
  const band = useMemo(() => extrudeUp(outset(outline, 0.16, [-36, 22]), 0.42), [outline])
  const basin = useMemo(() => makeBasin(), [])
  const arc = useMemo(() => podiumOuterArc(), [])
  const materials = model ? [solidMaterial, solidMaterial] : [solidMaterial, curtainMaterial]

  return (
    <group name="Podium">
      <mesh geometry={shell} material={materials} castShadow receiveShadow />
      <mesh geometry={band} material={solidMaterial} position={[0, 5.75, 0]} castShadow receiveShadow />
      <mesh name="CourtyardWall" geometry={basin} material={courtWallMaterial} receiveShadow />
      <FinRow points={arc} spacing={1.55} y={PODIUM_HEIGHT_M / 2} height={PODIUM_HEIGHT_M * 0.92} outwardFrom={[-36, 8]} />
    </group>
  )
}
