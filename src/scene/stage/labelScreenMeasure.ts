import { Matrix4, Vector3, type Camera, type Object3D } from 'three'
import { type AvoidBox } from './labelAvoidance'

/** 两向都大于此值才算重叠；擦边只计数。 */
export const OVERLAP_STRONG_PX = 2

const world = new Matrix4()
const local = new Matrix4()
const inv = new Matrix4()
const corner = new Vector3()
const look = new Vector3()
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

export function overlapDepth(a: AvoidBox, b: AvoidBox): { ox: number; oy: number } {
  return {
    ox: Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x),
    oy: Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y),
  }
}

export function countOverlapKinds(boxes: readonly AvoidBox[]): { strong: number; graze: number } {
  let strong = 0
  let graze = 0
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const { ox, oy } = overlapDepth(boxes[i]!, boxes[j]!)
      if (ox <= 0 || oy <= 0) continue
      if (ox > OVERLAP_STRONG_PX && oy > OVERLAP_STRONG_PX) strong += 1
      else graze += 1
    }
  }
  return { strong, graze }
}

export function countMeasuredOverlap(boxes: readonly AvoidBox[]): number {
  return countOverlapKinds(boxes).strong
}

export function overlapPairNames(
  items: ReadonlyArray<{ text: string; box: AvoidBox }>,
  strongOnly = true,
): Array<[string, string]> {
  const pairs: Array<[string, string]> = []
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const { ox, oy } = overlapDepth(items[i]!.box, items[j]!.box)
      if (ox <= 0 || oy <= 0) continue
      const strong = ox > OVERLAP_STRONG_PX && oy > OVERLAP_STRONG_PX
      if (strongOnly && !strong) continue
      if (!strongOnly && strong) continue
      pairs.push([items[i]!.text, items[j]!.text])
    }
  }
  return pairs
}

export function visibilityMismatch(expected: ReadonlySet<string>, actual: ReadonlySet<string>): string[] {
  const extra = [...actual].filter((id) => !expected.has(id))
  const missing = [...expected].filter((id) => !actual.has(id))
  return [...extra, ...missing]
}

export function findRoomLabelBatch(root: Object3D | null | undefined): Object3D | null {
  if (!root) return null
  let found: Object3D | null = null
  root.traverse((object) => {
    if (object.name === 'RoomLabelBatchedText') found = object
  })
  return found
}

export function labelYawForCamera(lookX: number, lookZ: number): number {
  const len = Math.hypot(lookX, lookZ)
  if (len < 1e-8) return 0
  return Math.atan2(-lookX / len, -lookZ / len)
}

export function cameraLookYaw(camera: Camera, host: Object3D | null): number {
  look.set(0, 0, 0)
  camera.getWorldDirection(look)
  if (host) {
    host.updateWorldMatrix(true, false)
    look.transformDirection(inv.copy(host.matrixWorld).invert())
  }
  look.y = 0
  return labelYawForCamera(look.x, look.z)
}

export function baselineAngleDeg(
  blockBounds: readonly number[],
  batchWorld: Matrix4,
  localMatrix: Matrix4,
  camera: Camera,
  viewport: { width: number; height: number },
): number | null {
  if (blockBounds.length < 4) return null
  const midY = (blockBounds[1]! + blockBounds[3]!) / 2
  world.multiplyMatrices(batchWorld, localMatrix)
  corner.set(blockBounds[0]!, midY, 0).applyMatrix4(world).project(camera)
  const x0 = (corner.x * 0.5 + 0.5) * viewport.width
  const y0 = (-corner.y * 0.5 + 0.5) * viewport.height
  corner.set(blockBounds[2]!, midY, 0).applyMatrix4(world).project(camera)
  const x1 = (corner.x * 0.5 + 0.5) * viewport.width
  const y1 = (-corner.y * 0.5 + 0.5) * viewport.height
  if (![x0, y0, x1, y1].every(Number.isFinite)) return null
  let deg = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI
  while (deg > 90) deg -= 180
  while (deg < -90) deg += 180
  return deg
}
