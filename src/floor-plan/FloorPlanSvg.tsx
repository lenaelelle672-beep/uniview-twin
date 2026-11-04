import { Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Svg } from '@react-three/drei/core/Svg'
import { useThree } from '@react-three/fiber'
import { Box3, Matrix4, type Mesh, type Object3D } from 'three'
import {
  FLOOR_PLAN_SVG_LIFT_M,
  FLOOR_PLAN_SVG_RUNTIME_MAX,
  FLOOR_PLAN_SVG_URL,
  fitFloorPlanSvg,
  inspectFloorPlanSvg,
  type FloorPlateBox,
  type FloorPlanSvgReason,
  type SvgContentBox,
  type SvgFit,
} from './svgPlan'

/**
 * T123：drei Svg 把本地平面图变成贴地网格。
 * 只在正交相机会话里由 FloorPlanCamera 挂上，离开会话时一起卸下。
 * 不挤出楼体，不读标定轮廓，不请求 CDN。
 */

function ignoreFloorPlanSvgRay(): void {}

function publish(probe: { mounted: boolean; triangles: number; shapes: number; reason: FloorPlanSvgReason }): void {
  window.__twinFloorPlanSvg = {
    mounted: probe.mounted,
    impl: 'drei-Svg',
    src: FLOOR_PLAN_SVG_URL,
    cdn: false,
    triangles: probe.triangles,
    shapes: probe.shapes,
    reason: probe.reason,
  }
}

function contentBounds(root: Object3D): SvgContentBox | null {
  const box = new Box3()
  const inv = new Matrix4()
  const tmp = new Box3()
  root.updateWorldMatrix(true, true)
  inv.copy(root.matrixWorld).invert()
  let found = false
  root.traverse((obj) => {
    const mesh = obj as Mesh
    if (mesh.isMesh !== true || !mesh.geometry) return
    const geometry = mesh.geometry
    if (!geometry.boundingBox) geometry.computeBoundingBox()
    const bounds = geometry.boundingBox
    if (!bounds || bounds.isEmpty()) return
    tmp.copy(bounds)
    obj.updateWorldMatrix(true, false)
    tmp.applyMatrix4(obj.matrixWorld)
    tmp.applyMatrix4(inv)
    if (!found) {
      box.copy(tmp)
      found = true
    } else box.union(tmp)
  })
  if (!found || box.isEmpty()) return null
  return { minX: box.min.x, maxX: box.max.x, minY: box.min.y, maxY: box.max.y }
}

function countTriangles(root: Object3D): number {
  let count = 0
  root.traverse((obj) => {
    const mesh = obj as Mesh
    const geometry = mesh.geometry
    if (mesh.isMesh !== true || !geometry) return
    const index = geometry.getIndex()
    if (index) count += index.count / 3
    else {
      const position = geometry.getAttribute('position')
      if (position) count += position.count / 3
    }
  })
  return count
}

function sameFit(prev: SvgFit | null, next: SvgFit): boolean {
  if (!prev) return false
  return (
    Math.abs(prev.x - next.x) < 1e-3 &&
    Math.abs(prev.y - next.y) < 1e-3 &&
    Math.abs(prev.z - next.z) < 1e-3 &&
    Math.abs(prev.scaleX - next.scaleX) < 1e-4 &&
    Math.abs(prev.scaleY - next.scaleY) < 1e-4 &&
    Math.abs(prev.rotationX - next.rotationX) < 1e-6
  )
}

function Fitted({ plate, shapes }: { plate: FloorPlateBox; shapes: number }) {
  const inner = useRef<Object3D>(null)
  const invalidate = useThree((state) => state.invalidate)
  const [placement, setPlacement] = useState<SvgFit | null>(null)
  const [dropped, setDropped] = useState(false)

  useLayoutEffect(() => {
    if (dropped) return
    const root = inner.current
    if (!root) return
    const triangles = countTriangles(root)
    if (triangles > FLOOR_PLAN_SVG_RUNTIME_MAX) {
      setDropped(true)
      publish({ mounted: false, triangles, shapes, reason: 'over-budget' })
      invalidate()
      return
    }
    const content = contentBounds(root)
    const fit = content ? fitFloorPlanSvg(content, plate, FLOOR_PLAN_SVG_LIFT_M) : null
    if (!fit || triangles <= 0) {
      publish({ mounted: false, triangles, shapes, reason: 'empty' })
      invalidate()
      return
    }
    setPlacement((prev) => (sameFit(prev, fit) ? prev : fit))
    publish({ mounted: true, triangles, shapes, reason: 'on' })
    invalidate()
  }, [dropped, invalidate, plate, shapes])

  if (dropped) return null

  const position: [number, number, number] = placement ? [placement.x, placement.y, placement.z] : [0, 0, 0]
  const rotation: [number, number, number] = placement ? [placement.rotationX, 0, 0] : [0, 0, 0]
  const scale: [number, number, number] = placement ? [placement.scaleX, placement.scaleY, 1] : [1, 1, 1]

  return (
    <group
      name="FloorPlanSvg"
      userData={{ floorPlanSvg: true }}
      visible={placement != null}
      position={position}
      rotation={rotation}
      scale={scale}
    >
      <group ref={inner}>
        <Svg
          src={FLOOR_PLAN_SVG_URL}
          skipStrokes
          fillMaterial={{
            toneMapped: false,
            depthTest: false,
            polygonOffset: true,
            polygonOffsetFactor: -4,
            polygonOffsetUnits: -4,
          }}
          fillMeshProps={{
            raycast: ignoreFloorPlanSvgRay,
            frustumCulled: false,
            castShadow: false,
            receiveShadow: false,
          }}
        />
      </group>
    </group>
  )
}

export function FloorPlanSvg({ plate }: { plate: FloorPlateBox }) {
  const [shapes, setShapes] = useState<number | null>(null)

  useEffect(() => {
    let dead = false
    publish({ mounted: false, triangles: 0, shapes: 0, reason: 'idle' })
    void (async () => {
      try {
        const response = await fetch(FLOOR_PLAN_SVG_URL)
        if (!response.ok) throw new Error('missing')
        const text = await response.text()
        if (dead) return
        const inspection = inspectFloorPlanSvg(text)
        if (!inspection.ok) {
          const reason = inspection.reason === 'on' ? 'empty' : inspection.reason
          publish({ mounted: false, triangles: inspection.triangles, shapes: inspection.shapes, reason })
          return
        }
        setShapes(inspection.shapes)
      } catch {
        if (!dead) publish({ mounted: false, triangles: 0, shapes: 0, reason: 'missing' })
      }
    })()
    return () => {
      dead = true
      publish({ mounted: false, triangles: 0, shapes: 0, reason: 'unmounted' })
    }
  }, [])

  if (shapes == null) return null
  return (
    <Suspense fallback={null}>
      <Fitted plate={plate} shapes={shapes} />
    </Suspense>
  )
}
