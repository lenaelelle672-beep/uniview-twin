import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { listFloorSpecs } from '../../data/floors'
import { TOWER_PARAPET_TOP_M, TOWER_ROOF_M } from '../../data/levels'
import { extrudeUp } from '../../scene/extrude'
import {
  curtainMaterial,
  grilleMaterial,
  highlightCurtainMaterial,
  highlightJointMaterial,
  jointMaterial,
  solidMaterial,
} from '../../scene/materials'
import { BUILDING_HIGHLIGHT_ORDER } from '../../scene/overlayOrder'
import { createRingBand, TOWER_BAND } from '../../scene/shell/facade'
import { TOWER_OUTLINE_OVERVIEW } from '../../scene/shell/rings'
import { isFloorCurtainOpen, isFloorShellHidden, isRoofHidden } from '../../scene/stage/cut'
import { createTowerGlass } from '../../scene/towerGlass'
import { SOFT_SHADOW_CHUNK_AFTER_FIRST_MS } from '../../scene/softShadows'
import { useTwinStore } from '../../store/store'
import { useFloorActions } from './floorPick'

/**
 * T132：替换后的 roof-sign.glb 约 32 KB，必须晚于 __twinReady / 首帧 hardGate 窗口再挂。
 * 静态立刻挂载会在首屏 Suspense 里请求 GLB。内层 Suspense 避免回落到 BlankSuspenseFallback。
 */
const RoofSign = lazy(() => import('./RoofSign').then((mod) => ({ default: mod.RoofSign })))

function LateRoofSign({ night, position }: { night: boolean; position: [number, number, number] }) {
  const [on, setOn] = useState(false)
  useEffect(() => {
    let cancelled = false
    let raf = 0
    const tick = () => {
      if (cancelled) return
      const first = window.__twinFirstFrameAt
      if (window.__twinReady === true && first != null && performance.now() - first >= SOFT_SHADOW_CHUNK_AFTER_FIRST_MS) {
        setOn(true)
        return
      }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => {
      cancelled = true
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])
  if (!on) return null
  return (
    <Suspense fallback={null}>
      <RoofSign night={night} position={position} />
    </Suspense>
  )
}

function FloorShell({
  id,
  elevation,
  height,
}: {
  id: string
  elevation: number
  height: number
}) {
  const glass = useMemo(() => createTowerGlass(elevation, height), [elevation, height])
  const band = useMemo(
    () => createRingBand(TOWER_OUTLINE_OVERVIEW, elevation + TOWER_BAND / 2, TOWER_BAND),
    [elevation],
  )
  const hidden = useTwinStore((state) => isFloorShellHidden(state.view, state.selectedFloor, elevation))
  const opened = useTwinStore((state) => isFloorCurtainOpen(state.view, state.selectedFloor, id))
  const selected = useTwinStore(
    (state) => state.view === 'building' && (state.selectedFloor === id || state.hoveredFloor === id),
  )
  const actions = useFloorActions(id)
  return (
    <group name={`FloorShell-${id}`} visible={!hidden} {...actions}>
      <mesh
        name={`FloorCurtain-${id}`}
        geometry={glass}
        material={selected ? highlightCurtainMaterial : curtainMaterial}
        visible={!opened}
        renderOrder={selected ? BUILDING_HIGHLIGHT_ORDER : 0}
      />
      <mesh
        name={`FloorBand-${id}`}
        geometry={band}
        material={selected ? highlightJointMaterial : jointMaterial}
        castShadow
        receiveShadow
        renderOrder={selected ? BUILDING_HIGHLIGHT_ORDER : 0}
      />
    </group>
  )
}

function roofSignPose(): [number, number, number] {
  const southWest: [number, number] = [-21.6806, 17.1003]
  return [southWest[0] + 7.5 + 1.4, TOWER_ROOF_M, southWest[1] + 0.1 + 0.36 + 0.03]
}

export function Tower({ night }: { night: boolean }) {
  const floors = useMemo(() => listFloorSpecs().filter((floor) => floor.level >= 1), [])
  const roofHidden = useTwinStore((state) => isRoofHidden(state.view, state.selectedFloor))
  const parapet = useMemo(() => {
    const height = TOWER_PARAPET_TOP_M - TOWER_ROOF_M + 0.8
    return createRingBand(TOWER_OUTLINE_OVERVIEW, TOWER_PARAPET_TOP_M - height / 2, height, 0.36, 0.1, 'outer-top')
  }, [])
  const roof = useMemo(() => {
    const geometry = extrudeUp(TOWER_OUTLINE_OVERVIEW, 0.35, [], 'top')
    geometry.translate(0, TOWER_ROOF_M - 0.35, 0)
    return geometry
  }, [])
  const sign = roofSignPose()

  return (
    <group name="Tower">
      {floors.map((floor) => (
        <FloorShell key={floor.id} id={floor.id} elevation={floor.elevation} height={floor.height} />
      ))}
      <group name="RoofAssembly" visible={!roofHidden}>
        <mesh geometry={roof} material={solidMaterial} castShadow receiveShadow />
        <mesh name="RoofParapet" geometry={parapet} material={grilleMaterial} castShadow receiveShadow />
        <LateRoofSign night={night} position={sign} />
      </group>
    </group>
  )
}
