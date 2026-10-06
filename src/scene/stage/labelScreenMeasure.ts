import { Matrix4, Vector3, type Camera } from 'three'
import { boxesOverlap, countVisibleOverlapPairs, type AvoidBox } from './labelAvoidance'

const world = new Matrix4()
const local = new Matrix4()
const corner = new Vector3()
const one = new Vector3(1, 1, 1)

export interface MeasuredLabelBox {
  id: string
  text: string
  box: AvoidBox
  cluster: string | null
  px: number
}

export function isDrawnText(text: { scale: { x: number }; fillOpacity?: number }): boolean {
  return text.scale.x > 0.05 && (text.fillOpacity ?? 1) > 0.02
}

export function projectBlockBounds(
  blockBounds: readonly number[],
  batchWorld: Matrix4,
  localMatrix: Matrix4,
  camera: Camera,
  viewport: { width: number; height: number },
): AvoidBox | null {
  if (blockBounds.length < 4) return null
  world.multiplyMatrices(batchWorld, localMatrix)
  const x0 = blockBounds[0]!
  const y0 = blockBounds[1]!
  const x1 = blockBounds[2]!
  const y1 = blockBounds[3]!
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const pts: Array<[number, number]> = [
    [x0, y0],
    [x1, y0],
    [x0, y1],
    [x1, y1],
  ]
  for (const [lx, ly] of pts) {
    corner.set(lx, ly, 0).applyMatrix4(world)
    corner.project(camera)
    if (!Number.isFinite(corner.x) || corner.z > 1) return null
    const sx = (corner.x * 0.5 + 0.5) * viewport.width
    const sy = (-corner.y * 0.5 + 0.5) * viewport.height
    minX = Math.min(minX, sx)
    maxX = Math.max(maxX, sx)
    minY = Math.min(minY, sy)
    maxY = Math.max(maxY, sy)
  }
  return { x: minX, y: minY, w: Math.max(0, maxX - minX), h: Math.max(0, maxY - minY) }
}

export function localAt(position: { x: number; y: number; z: number }, quaternion: { x: number; y: number; z: number; w: number }): Matrix4 {
  return local.compose(position as Vector3, quaternion as never, one)
}

export function measureTextBox(
  text: {
    textRenderInfo?: { blockBounds?: number[] } | null
    position: { x: number; y: number; z: number }
    quaternion: { x: number; y: number; z: number; w: number }
    matrix: Matrix4
  },
  batchWorld: Matrix4,
  camera: Camera,
  viewport: { width: number; height: number },
  useLiveMatrix: boolean,
): AvoidBox | null {
  const bounds = text.textRenderInfo?.blockBounds
  if (!bounds) return null
  return projectBlockBounds(bounds, batchWorld, useLiveMatrix ? text.matrix : localAt(text.position, text.quaternion), camera, viewport)
}

export function countMeasuredOverlap(boxes: readonly AvoidBox[]): number {
  return countVisibleOverlapPairs(boxes)
}

export function overlapPairNames(
  items: ReadonlyArray<{ text: string; box: AvoidBox }>,
): Array<[string, string]> {
  const pairs: Array<[string, string]> = []
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      if (boxesOverlap(items[i]!.box, items[j]!.box, 0)) pairs.push([items[i]!.text, items[j]!.text])
    }
  }
  return pairs
}
