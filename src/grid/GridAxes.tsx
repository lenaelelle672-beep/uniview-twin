import { Grid } from '@react-three/drei/core/Grid'
import { useLayoutEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { BackSide, type Material, type Mesh } from 'three'
import { AXIS_LIFT_M, GRID_AXIS_M, GRID_CELL_M, GRID_SECTION_M } from './metrics'

export interface GridAxesProps {
  y: number
  fadeDistance: number
  cellColor: string
  sectionColor: string
  axesX: number
  axesZ: number
}

/**
 * 射线打在空函数上，不把点击从场地和楼板上抢走。
 * 模块级同一个函数，避免每帧换 prop 让 drei 重建网格。
 */
function ignorePick() {
  // 不往 intersects 里推，点击继续落到场地和楼板。
}

function calmGrid(material: Material) {
  material.depthWrite = false
  material.polygonOffset = true
  material.polygonOffsetFactor = -2
  material.polygonOffsetUnits = -8
}

/**
 * T059：drei Grid + three axesHelper。
 * 只在图层打开时由懒包挂上，关掉就卸载。
 * 不要在逐帧回调里 new 它们。drei Grid 自带的逐帧回调只写淡出 uniform，不新建几何。
 * demand 停帧时，挂上和卸下都要补一帧，否则格网留在上一帧。
 */
export function GridAxes({ y, fadeDistance, cellColor, sectionColor, axesX, axesZ }: GridAxesProps) {
  const invalidate = useThree((state) => state.invalidate)
  const grid = useRef<Mesh>(null)

  useLayoutEffect(() => {
    const material = grid.current?.material
    if (material && !Array.isArray(material)) calmGrid(material)
    const probe = window.__twinGrid
    if (probe) {
      probe.mounted = true
      probe.y = y
    }
    invalidate()
    return () => {
      const next = window.__twinGrid
      if (next) next.mounted = false
      invalidate()
    }
  }, [axesX, axesZ, cellColor, fadeDistance, invalidate, sectionColor, y])

  return (
    <group name="MetricGrid" position={[0, y, 0]}>
      <Grid
        ref={grid}
        args={[4, 4]}
        cellSize={GRID_CELL_M}
        sectionSize={GRID_SECTION_M}
        cellThickness={0.7}
        sectionThickness={1.4}
        cellColor={cellColor}
        sectionColor={sectionColor}
        fadeDistance={fadeDistance}
        fadeStrength={1}
        fadeFrom={1}
        infiniteGrid
        followCamera={false}
        side={BackSide}
        renderOrder={4}
        raycast={ignorePick}
      />
      <axesHelper
        name="MetricAxes"
        args={[GRID_AXIS_M]}
        position={[axesX, AXIS_LIFT_M, axesZ]}
        frustumCulled={false}
        renderOrder={5}
        raycast={ignorePick}
      />
    </group>
  )
}
