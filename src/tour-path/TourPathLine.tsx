import { CatmullRomLine } from '@react-three/drei/core/CatmullRomLine'
import { useThree } from '@react-three/fiber'
import { useLayoutEffect } from 'react'
import { TOUR_CURVE, TOUR_SEGMENT_CAP, TOUR_TENSION_CAP, cappedSegments, cappedTension } from './caps'
import { tourPreviewPoints } from './path'

const SEGMENTS = cappedSegments(TOUR_SEGMENT_CAP)
const TENSION = cappedTension(TOUR_TENSION_CAP)

function ignoreRaycast() {
  return null
}

/**
 * T069：一条讲解相机轨。只在开关打开后才进这个分包。
 * 控制点引用保持不变，避免 drei Line 因 points 换引用把 LineMaterial dispose 掉（D272）。
 * frameloop=demand：挂上、卸下、视口尺寸变了才 invalidate，不逐帧续画。
 * 这条预览线不吃场景雾，白天仍保持琥珀色。场景雾参数不动。
 */
export function TourPathLine() {
  const invalidate = useThree((state) => state.invalidate)
  const width = useThree((state) => state.size.width)
  const height = useThree((state) => state.size.height)
  const points = tourPreviewPoints()

  useLayoutEffect(() => {
    window.__twinTourPath = {
      demo: true,
      on: true,
      mounted: true,
      points: points.length,
      segments: SEGMENTS,
      tension: TENSION,
      curve: TOUR_CURVE,
    }
    invalidate()
    return () => {
      const current = window.__twinTourPath
      if (current) {
        window.__twinTourPath = { ...current, mounted: false, points: 0 }
      }
      invalidate()
    }
  }, [height, invalidate, points, width])

  return (
    <CatmullRomLine
      key="tour-path"
      name="TourPath"
      points={points as unknown as Array<[number, number, number]>}
      closed={false}
      curveType={TOUR_CURVE}
      tension={TENSION}
      segments={SEGMENTS}
      color="#ffb020"
      lineWidth={3}
      fog={false}
      transparent={false}
      toneMapped={false}
      depthTest
      depthWrite={false}
      renderOrder={8}
      frustumCulled={false}
      castShadow={false}
      receiveShadow={false}
      raycast={ignoreRaycast}
    />
  )
}
