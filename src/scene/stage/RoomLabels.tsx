import { Line } from '@react-three/drei/core/Line'
import { useFrame, useThree } from '@react-three/fiber'
import { lazy, Suspense, useRef, useState } from 'react'
import { PerspectiveCamera, Vector3, type Camera, type Object3D } from 'three'
import { resolveWorkstationRef } from '../../locate/ref'
import { useTwinStore } from '../../store/store'
import { waitFirstPrefetch } from './prefetchLazyChunks'
import {
  LABEL_MAX_PX,
  LABEL_MIN_PX,
  labelFadeForTarget,
  roomLabelCharacters,
  type RoomLabel,
} from './roomLabels'
import { workstationPosition } from './workstationPosition'

const BatchedRoomLabels = lazy(async () => {
  await waitFirstPrefetch()
  const { ProgressiveRoomLabels } = await import('../labels/ProgressiveRoomLabels')
  return { default: ProgressiveRoomLabels }
})

/** 1366 单层目标屏上字高；全层最大夹在 LABEL_MIN/MAX。 */
export const LABEL_TARGET_PX = 14
const PX_EPS = 0.45

const sample = new Vector3()
const deskSample = new Vector3()
const emTop = new Vector3()
const emBottom = new Vector3()
const ndcTop = new Vector3()
const ndcBottom = new Vector3()
const viewTop = new Vector3()
const viewBottom = new Vector3()

export function projectedEmHeightPx(
  topWorld: Vector3,
  bottomWorld: Vector3,
  camera: Camera,
  viewport: { width: number; height: number },
): number {
  viewTop.copy(topWorld).applyMatrix4(camera.matrixWorldInverse)
  viewBottom.copy(bottomWorld).applyMatrix4(camera.matrixWorldInverse)
  if (viewTop.z >= -0.08 || viewBottom.z >= -0.08) return 0
  ndcTop.copy(topWorld).project(camera)
  ndcBottom.copy(bottomWorld).project(camera)
  if (!Number.isFinite(ndcTop.x) || !Number.isFinite(ndcBottom.x)) return 0
  if (Math.abs(ndcTop.x) > 1.2 || Math.abs(ndcBottom.x) > 1.2) return 0
  if (Math.abs(ndcTop.y) > 1.2 || Math.abs(ndcBottom.y) > 1.2) return 0
  const dx = (ndcTop.x - ndcBottom.x) * 0.5 * viewport.width
  const dy = (ndcTop.y - ndcBottom.y) * 0.5 * viewport.height
  const px = Math.hypot(dx, dy)
  return Number.isFinite(px) ? px : 0
}

/** 用当前世界字号的本地竖直 em 段（±fontSize/2）取全层最大屏上字高。 */
export function maxProjectedEmPx(
  host: Object3D | null,
  labels: Array<{ label: [number, number, number] }>,
  camera: Camera,
  viewport: { width: number; height: number },
  fontSize: number,
): { maxPx: number; nearest: number } {
  const half = Math.max(fontSize, 1e-4) / 2
  let maxPx = 0
  let nearest = Infinity
  for (const item of labels) {
    sample.set(item.label[0], item.label[1], item.label[2])
    emTop.set(item.label[0], item.label[1] + half, item.label[2])
    emBottom.set(item.label[0], item.label[1] - half, item.label[2])
    if (host) {
      host.localToWorld(sample)
      host.localToWorld(emTop)
      host.localToWorld(emBottom)
    }
    nearest = Math.min(nearest, camera.position.distanceTo(sample))
    maxPx = Math.max(maxPx, projectedEmHeightPx(emTop, emBottom, camera, viewport))
  }
  return { maxPx, nearest }
}

export function worldFontSizeFromProjectedEm(
  currentFontSize: number,
  currentMaxPx: number,
  targetPx = LABEL_TARGET_PX,
  minPx = LABEL_MIN_PX,
  maxPx = LABEL_MAX_PX,
): number {
  if (!(currentMaxPx > 1e-6) || !(currentFontSize > 0)) return currentFontSize || 0.78
  const want = Math.min(maxPx, Math.max(minPx, targetPx))
  return currentFontSize * (want / currentMaxPx)
}

export function RoomLabels({ floorId, labels }: { floorId: string; labels: RoomLabel[] }) {
  const { camera, scene, size } = useThree()
  const [fontSize, setFontSize] = useState(0.78)
  const pxRef = useRef(0)
  const fadesRef = useRef<number[]>([])
  const characters = roomLabelCharacters(labels)
  const points = labels.flatMap((label) => [label.anchor, label.label])

  useFrame(() => {
    if (labels.length === 0) return
    const perspective = camera as PerspectiveCamera
    const interior = scene.getObjectByName('FloorInterior')
    const host = scene.getObjectByName('RoomLabelBatch') ?? interior
    host?.updateWorldMatrix(true, false)
    perspective.updateMatrixWorld()
    const { maxPx: currentMaxPx, nearest } = maxProjectedEmPx(host ?? null, labels, perspective, size, fontSize)
    const next = worldFontSizeFromProjectedEm(fontSize, currentMaxPx)
    if (currentMaxPx > 1e-6 && Math.abs(currentMaxPx - LABEL_TARGET_PX) > PX_EPS) setFontSize(next)
    const px = currentMaxPx > 1e-6 ? next * (currentMaxPx / fontSize) : currentMaxPx
    pxRef.current = px
    const focused = useTwinStore.getState().focusedDeskId
    const target = focused ? resolveWorkstationRef(focused) : null
    let deskX = NaN
    let deskY = NaN
    if (target && target.floorId === floorId && interior) {
      try {
        const place = workstationPosition(target.floorId, target.deskId)
        deskSample.set(place.x, 0.55, place.z)
        interior.localToWorld(deskSample)
        deskSample.project(perspective)
        deskX = (deskSample.x * 0.5 + 0.5) * size.width
        deskY = (-deskSample.y * 0.5 + 0.5) * size.height
      } catch {
        deskX = NaN
      }
    }
    const fades = fadesRef.current
    fades.length = labels.length
    for (let i = 0; i < labels.length; i += 1) {
      const label = labels[i]
      if (!label || !Number.isFinite(deskX) || !interior) {
        fades[i] = 1
        continue
      }
      sample.set(label.label[0], label.label[1], label.label[2])
      interior.localToWorld(sample)
      sample.project(perspective)
      fades[i] = labelFadeForTarget(
        { x: (sample.x * 0.5 + 0.5) * size.width, y: (-sample.y * 0.5 + 0.5) * size.height },
        { x: deskX, y: deskY },
        px,
      )
    }
    window.__twinLabelPx = {
      fontSize: next,
      px,
      minPx: LABEL_MIN_PX,
      maxPx: LABEL_MAX_PX,
      distance: nearest,
    }
  })

  if (labels.length === 0) return null
  const outline = Math.max(0.03, fontSize * 0.055)
  return (
    <group name="RoomLabels">
      <Line points={points} segments color="#5c6b7c" lineWidth={1.5} />
      <Suspense fallback={null}>
        <BatchedRoomLabels
          floorId={floorId}
          labels={labels}
          fontSize={fontSize}
          outlineWidth={outline}
          characters={characters}
          fadesRef={fadesRef}
        />
      </Suspense>
    </group>
  )
}
