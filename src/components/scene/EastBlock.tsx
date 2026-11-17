import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { BoxGeometry } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { preloadEastGrilleForQuality } from '../../scene/eastGrilleAssets'
import { extrudeUp } from '../../scene/extrude'
import { createRingBand } from '../../scene/shell/facade'
import {
  eastFloorBandLevels,
  eastGrilleMount,
  eastCantileverColumnPositions,
  eastCantileverRibXs,
  eastCantileverSoffitOutline,
  eastCantileverUndercroftBackOutline,
  eastLowerOutline,
  eastUpperOutline,
  eastWestArc,
  EAST_CANTILEVER_SOFFIT_T_M,
  EAST_LOWER_TOP_M,
  EAST_ROOF_M,
  outset,
} from '../../scene/massing'
import { northWingTopM } from '../../data/levels'
import { NORTH_WING_OUTLINE } from '../../scene/shell/rings'
import { FOOTPRINT } from '../../scene/siteGeometry'
import { _s, curtainMaterial, finMaterial, solidMaterial, stoneMaterial, undercroftMaterial } from '../../scene/materials'
import type { QualityTier } from '../../types'
import { FinRow } from './Fins'

/** 主包一解析就拉格栅 chunk；lazy 复用同一 Promise，不进主包。 */
const eastGrilleImport = import('./EastGrille')
const EastGrille = lazy(() => eastGrilleImport)
preloadEastGrilleForQuality()

/**
 * T139：南入口雨棚单独分包。必须等 __twinReady、首帧后再过 2600ms 才 import / 挂载，
 * 否则雨棚分包与被它拉起的石材 UV 工具会进 hardGate（D1460）。
 * 数字留在本文件，避免为了这个常数去碰 prefetch 模块。
 */
const SOUTH_ENTRANCE_AFTER_FIRST_MS = 2600
const SouthEntrance = lazy(() => import('./SouthEntrance'))

function LateSouthEntrance({ model }: { model: boolean }) {
  const [on, setOn] = useState(false)
  useEffect(() => {
    let cancelled = false
    let raf = 0
    const tick = () => {
      if (cancelled) return
      const first = window.__twinFirstFrameAt
      if (
        window.__twinReady === true &&
        first != null &&
        performance.now() - first >= SOUTH_ENTRANCE_AFTER_FIRST_MS
      ) {
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
      <SouthEntrance model={model} />
    </Suspense>
  )
}

const LOWER_TOP = EAST_LOWER_TOP_M

export function EastBlock({ model, quality }: { model: boolean; quality: QualityTier }) {
  const upperOutline = useMemo(() => eastUpperOutline(), [])
  const lowerOutline = useMemo(() => eastLowerOutline(), [])
  const bodies = useMemo(() => {
    const upper = extrudeUp(upperOutline, EAST_ROOF_M - LOWER_TOP, [], 'both')
    upper.clearGroups()
    upper.translate(0, LOWER_TOP, 0)
    const lower = extrudeUp(lowerOutline, LOWER_TOP, [], 'top')
    lower.clearGroups()
    _s.g = lower
    _s.h = LOWER_TOP
    return [upper, lower] as const
  }, [lowerOutline, upperOutline])
  const undercroft = useMemo(() => {
    const ring = eastCantileverSoffitOutline()
    if (ring.length < 4) return null
    const soffitT = EAST_CANTILEVER_SOFFIT_T_M
    const soffit = extrudeUp(ring, soffitT, [], 'both')
    soffit.clearGroups()
    soffit.translate(0, LOWER_TOP - soffitT, 0)
    const floor = extrudeUp(ring, 0.1, [], 'both')
    floor.clearGroups()
    const backRing = eastCantileverUndercroftBackOutline()
    const back = backRing.length >= 4 ? extrudeUp(backRing, LOWER_TOP - 0.05, [], 'both') : null
    back?.clearGroups()
    const upper = eastUpperOutline()
    const lower = eastLowerOutline()
    const uSouth = Math.max(...upper.map(([, z]) => z))
    const lSouth = Math.max(...lower.map(([, z]) => z))
    const depth = uSouth - lSouth
    const midZ = (uSouth + lSouth) / 2
    const ribH = 0.45
    const ribParts = eastCantileverRibXs().map((x) => {
      const geometry = new BoxGeometry(0.18, ribH, depth)
      geometry.translate(x, LOWER_TOP - soffitT - ribH / 2, midZ)
      return geometry
    })
    const ribs = ribParts.length ? mergeGeometries(ribParts) : null
    ribParts.forEach((geometry) => geometry.dispose())
    const colW = 0.85
    const colH = Math.max(LOWER_TOP - soffitT, 1)
    const colParts = eastCantileverColumnPositions().map(([x, z]) => {
      const geometry = new BoxGeometry(colW, colH, colW)
      geometry.translate(x, colH / 2, z)
      return geometry
    })
    const columns = colParts.length ? mergeGeometries(colParts) : null
    colParts.forEach((geometry) => geometry.dispose())
    return { soffit, floor, back, ribs, columns }
  }, [])
  const wing = useMemo(() => {
    const geometry = extrudeUp(NORTH_WING_OUTLINE, northWingTopM(), [], 'top')
    geometry.clearGroups()
    return geometry
  }, [])
  const curve = useMemo(() => eastWestArc(), [])
  const focus = useMemo<[number, number]>(
    () => [(FOOTPRINT.minX + FOOTPRINT.maxX) / 2, (FOOTPRINT.minZ + FOOTPRINT.maxZ) / 2],
    [],
  )
  const seams = useMemo(() => {
    const levels = [...eastFloorBandLevels(), EAST_ROOF_M]
    const parts = levels.map((level) => createRingBand(outset(upperOutline, 0.12, focus), level + 0.1, 0.2))
    const merged = mergeGeometries(parts)
    parts.forEach((geometry) => geometry.dispose())
    if (!merged) throw new Error('东楼分层线为空')
    return merged
  }, [focus, upperOutline])
  const glass = model ? solidMaterial : curtainMaterial
  const grille = eastGrilleMount()

  return (
    <group name="EastBlock">
      <object3D name="eastGrilleMount" position={grille.position} rotation={grille.rotation} />
      <mesh geometry={bodies[0]} material={solidMaterial} castShadow receiveShadow />
      <mesh geometry={bodies[1]} material={model ? solidMaterial : stoneMaterial} castShadow receiveShadow />
      {undercroft ? (
        <group name="EastCantileverUndercroft">
          <mesh name="EastCantileverSoffit" geometry={undercroft.soffit} material={undercroftMaterial} castShadow receiveShadow />
          <mesh name="EastCantileverUndercroftFloor" geometry={undercroft.floor} material={undercroftMaterial} receiveShadow />
          {undercroft.back ? (
            <mesh name="EastCantileverUndercroftBack" geometry={undercroft.back} material={undercroftMaterial} castShadow receiveShadow />
          ) : null}
          {undercroft.ribs ? (
            <mesh name="EastCantileverUndercroftRibs" geometry={undercroft.ribs} material={undercroftMaterial} castShadow receiveShadow />
          ) : null}
          {undercroft.columns ? (
            <mesh name="EastCantileverUndercroftColumns" geometry={undercroft.columns} material={stoneMaterial} castShadow receiveShadow />
          ) : null}
        </group>
      ) : null}
      <mesh geometry={wing} material={glass} castShadow receiveShadow />
      <mesh geometry={seams} material={finMaterial} castShadow />
      <FinRow
        points={curve}
        spacing={1.6}
        y={LOWER_TOP + (EAST_ROOF_M - LOWER_TOP) / 2}
        height={EAST_ROOF_M - LOWER_TOP - 0.15}
        outwardFrom={focus}
      />
      {/* 与 Scene.tsx 外层 Suspense 同边界，__twinReady 等 chunk + lo GLB。 */}
      {!model && <EastGrille quality={quality} />}
      <LateSouthEntrance model={model} />
    </group>
  )
}
