import { useLayoutEffect, useMemo, useRef } from 'react'
import { InstancedMesh } from 'three'
import { curtainMaterial, finMaterial, solidMaterial, stoneMaterial, undercroftMaterial } from '../../scene/materials'
import {
  buildSouthEntranceStoneGeometry,
  southCanopySoffitPanelGeometry,
  southCanopySoffitStripGeometry,
  southCanopySoffitStripMatrices,
  southEntranceGlassGeometry,
  southEntranceWindowGeometry,
} from '../../scene/southEntrance'

/**
 * T139：南入口厚石材雨棚、线脚吊顶与浅台阶。
 * 由 EastBlock 懒挂，不进 hardGate；石材贴图仍走已有 stn 晚赋图。
 */
export function SouthEntrance({ model = false }: { model?: boolean }) {
  const stone = useMemo(() => buildSouthEntranceStoneGeometry(), [])
  const soffit = useMemo(() => southCanopySoffitPanelGeometry(), [])
  const glass = useMemo(() => southEntranceGlassGeometry(), [])
  const windowPane = useMemo(() => southEntranceWindowGeometry(), [])
  const stripGeometry = useMemo(() => southCanopySoffitStripGeometry(), [])
  const stripMatrices = useMemo(() => southCanopySoffitStripMatrices(), [])
  const stripsRef = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = stripsRef.current
    if (!mesh) return
    stripMatrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix))
    mesh.count = stripMatrices.length
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [stripMatrices])

  const skin = model ? solidMaterial : stoneMaterial
  const glassMat = model ? solidMaterial : curtainMaterial

  return (
    <group name="SouthEntrance">
      <mesh name="SouthEntranceStone" geometry={stone} material={skin} castShadow receiveShadow />
      <mesh name="SouthCanopySoffit" geometry={soffit} material={model ? solidMaterial : undercroftMaterial} receiveShadow />
      <mesh name="SouthEntranceGlass" geometry={glass} material={glassMat} />
      <mesh name="SouthEntranceWindow" geometry={windowPane} material={glassMat} />
      {stripMatrices.length > 0 ? (
        <instancedMesh
          name="SouthCanopySoffitStrips"
          ref={stripsRef}
          args={[stripGeometry, model ? solidMaterial : finMaterial, stripMatrices.length]}
          frustumCulled={false}
        />
      ) : null}
    </group>
  )
}

export default SouthEntrance
