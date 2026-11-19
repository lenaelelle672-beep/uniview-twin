import { useLayoutEffect, useMemo, useRef } from 'react'
import { BoxGeometry, BufferGeometry, Float32BufferAttribute, InstancedMesh, Object3D } from 'three'
import { COURT_DEPTH_M, COURT_SLOPE_M } from '../../scene/siteGeometry'
import { extrudeUp } from '../../scene/extrude'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { courtyardHole, outset, podiumFrontArc, podiumFocus, podiumOutline, PODIUM_HEIGHT_M } from '../../scene/massing'
import { PODIUM_SOUTH_ADDON } from '../../scene/shell/rings'
import { courtWallMaterial, curtainMaterial, eaveMaterial, solidMaterial } from '../../scene/materials'
import { FinRow } from './Fins'
import { PODIUM_ARC_FIN_DEPTH_M, PODIUM_ARC_FIN_SPACING_M, PODIUM_ARC_FIN_THICKNESS_M, podiumArcFinMaterial } from '../../scene/podiumArcFins'
import {
  PODIUM_ARCADE_COLUMN_DEPTH_M,
  PODIUM_ARCADE_COLUMN_W_M,
  PODIUM_ARCADE_HEIGHT_M,
  podiumArcadeColumnMaterial,
  podiumArcadeColumns,
  podiumArcadeGlassOutline,
  podiumLowerOutline,
} from '../../scene/podiumArcade'

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

function ArcadeColumns({ height }: { height: number }) {
  const columns = useMemo(() => podiumArcadeColumns(), [])
  const geometry = useMemo(
    () => new BoxGeometry(PODIUM_ARCADE_COLUMN_W_M, height, PODIUM_ARCADE_COLUMN_DEPTH_M),
    [height],
  )
  const ref = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const dummy = new Object3D()
    const y = height / 2
    columns.forEach((column, index) => {
      dummy.position.set(column.x, y, column.z)
      dummy.rotation.set(0, column.rotY, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
    })
    mesh.count = columns.length
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [columns, height])

  if (columns.length === 0) return null
  return (
    <instancedMesh
      name="PodiumArcadeColumns"
      ref={ref}
      args={[geometry, podiumArcadeColumnMaterial, columns.length]}
      castShadow
      receiveShadow
      frustumCulled={false}
    />
  )
}

export function Podium({ model }: { model: boolean }) {
  const outline = useMemo(() => podiumOutline(), [])
  const focus = useMemo(() => podiumFocus(), [])
  const arcadeTop = PODIUM_ARCADE_HEIGHT_M
  const upperHeight = PODIUM_HEIGHT_M - arcadeTop
  const shell = useMemo(() => {
    const main = extrudeUp(outline, upperHeight, [], 'top')
    main.translate(0, arcadeTop, 0)
    const addon = extrudeUp(PODIUM_SOUTH_ADDON, PODIUM_HEIGHT_M, [], 'top')
    const merged = mergeGeometries([main, addon])
    main.dispose()
    addon.dispose()
    if (!merged) throw new Error('裙楼几何为空')
    return merged
  }, [arcadeTop, outline, upperHeight])
  const lower = useMemo(() => extrudeUp(podiumLowerOutline(), arcadeTop, [], 'top'), [arcadeTop])
  const glass = useMemo(() => extrudeUp(podiumArcadeGlassOutline(), arcadeTop, [], 'top'), [arcadeTop])
  const band = useMemo(() => extrudeUp(outset(outline, 1, focus), 1.5, [], 'top'), [focus, outline])
  const basin = useMemo(() => makeBasin(), [])
  const arc = useMemo(() => podiumFrontArc(), [])
  const materials = model ? [solidMaterial, solidMaterial] : [solidMaterial, curtainMaterial]
  const glassMaterial = model ? solidMaterial : curtainMaterial

  return (
    <group name="Podium">
      <mesh geometry={shell} material={materials} castShadow receiveShadow />
      <mesh
        name="PodiumArcadeLower"
        geometry={lower}
        material={materials}
        castShadow
        receiveShadow
      />
      <mesh
        name="PodiumArcadeGlass"
        geometry={glass}
        material={glassMaterial}
        castShadow
        receiveShadow
      />
      <ArcadeColumns height={arcadeTop} />
      <mesh
        name="PodiumEave"
        geometry={band}
        material={model ? solidMaterial : eaveMaterial}
        position={[0, PODIUM_HEIGHT_M - 1, 0]}
        castShadow
        receiveShadow
      />
      <mesh name="CourtyardWall" geometry={basin} material={courtWallMaterial} receiveShadow />
      <FinRow
        points={arc}
        spacing={PODIUM_ARC_FIN_SPACING_M}
        y={arcadeTop + upperHeight / 2}
        height={upperHeight * 0.92}
        depth={PODIUM_ARC_FIN_DEPTH_M}
        thickness={PODIUM_ARC_FIN_THICKNESS_M}
        box
        outwardFrom={focus}
        material={podiumArcFinMaterial}
      />
    </group>
  )
}
