import type { Camera, Vector3 } from 'three'

/** 抽屉挡住画布时，用可见区中心算 camera-controls 的 focal offset。 */

export const MIN_VISIBLE_WIDTH_PX = 320
export const MIN_EDGE_PX = 40
export const OVERLAY_LAYOUT_EVENT = 'twin-overlay-layout'

export interface ViewRect {
  left: number
  right: number
  top: number
  bottom: number
}

export function rectWidth(rect: ViewRect): number {
  return rect.right - rect.left
}

export function rectHeight(rect: ViewRect): number {
  return rect.bottom - rect.top
}

export function rectCenter(rect: ViewRect): { x: number; y: number } {
  return { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 }
}

export function intersectRects(a: ViewRect, b: ViewRect): ViewRect | null {
  const left = Math.max(a.left, b.left)
  const right = Math.min(a.right, b.right)
  const top = Math.max(a.top, b.top)
  const bottom = Math.min(a.bottom, b.bottom)
  if (right <= left || bottom <= top) return null
  return { left, right, top, bottom }
}

/** 从左右（及贴边的上下）挡板扣出画布上仍露出来的矩形。 */
export function visibleCanvasRegion(canvas: ViewRect, overlays: ViewRect[]): ViewRect {
  let { left, right, top, bottom } = canvas
  for (const overlay of overlays) {
    const hit = intersectRects({ left, right, top, bottom }, overlay)
    if (!hit) continue
    const fromLeft = hit.left <= left + 0.5
    const fromRight = hit.right >= right - 0.5
    const fromTop = hit.top <= top + 0.5
    const fromBottom = hit.bottom >= bottom - 0.5
    if (fromLeft && hit.right < right) left = hit.right
    else if (fromRight && hit.left > left) right = hit.left
    if (fromTop && hit.bottom < bottom) top = hit.bottom
    else if (fromBottom && hit.top > top) bottom = hit.top
  }
  return { left, right, top, bottom }
}

export function shouldCollapseDrawer(visibleWidth: number): boolean {
  return visibleWidth < MIN_VISIBLE_WIDTH_PX
}

export function worldPerPixel(distance: number, fovDeg: number, viewportHeight: number): number {
  if (distance <= 0 || viewportHeight <= 0) return 0
  return (2 * Math.tan((fovDeg * Math.PI) / 360) * distance) / viewportHeight
}

/**
 * 把目标从画布中心挪到可见区中心。
 * camera-controls 的 focal offset 在相机局部：+x 右，+y 上。
 * 焦点往左偏，目标才会出现在屏幕右侧。
 */
export function focalOffsetToVisibleCenter(
  canvas: ViewRect,
  visible: ViewRect,
  distance: number,
  fovDeg: number,
  viewportHeight: number,
): { x: number; y: number; z: number } {
  if (rectWidth(visible) <= 1 || rectHeight(visible) <= 1) return { x: 0, y: 0, z: 0 }
  const wpp = worldPerPixel(distance, fovDeg, viewportHeight)
  if (wpp <= 0) return { x: 0, y: 0, z: 0 }
  const canvasMid = rectCenter(canvas)
  const visibleMid = rectCenter(visible)
  return {
    x: -(visibleMid.x - canvasMid.x) * wpp,
    y: (visibleMid.y - canvasMid.y) * wpp,
    z: 0,
  }
}

export function pointInVisibleRegion(
  point: { x: number; y: number },
  visible: ViewRect,
  edge = MIN_EDGE_PX,
): boolean {
  return (
    point.x >= visible.left + edge &&
    point.x <= visible.right - edge &&
    point.y >= visible.top + edge &&
    point.y <= visible.bottom - edge
  )
}

function elementRect(el: Element | null): ViewRect | null {
  if (!el) return null
  if (el instanceof HTMLDialogElement && !el.open) return null
  const box = el.getBoundingClientRect()
  if (box.width <= 1 || box.height <= 1) return null
  return { left: box.left, right: box.right, top: box.top, bottom: box.bottom }
}

export function readOverlayRects(doc: Document = document): { canvas: ViewRect; overlays: ViewRect[] } | null {
  const canvas = elementRect(doc.querySelector('canvas'))
  if (!canvas) return null
  const overlays = [
    elementRect(doc.getElementById('alarm-drawer')),
    elementRect(doc.querySelector('.floor-panel')),
    elementRect(doc.querySelector('.detail-panel')),
  ].filter((rect): rect is ViewRect => rect !== null)
  return { canvas, overlays }
}

export function notifyOverlayLayout(): void {
  window.dispatchEvent(new Event(OVERLAY_LAYOUT_EVENT))
}

type FocusRig = {
  distance: number
  setFocalOffset?: (x: number, y: number, z: number, enableTransition?: boolean) => unknown
  update: (delta: number) => unknown
}

let lastFocus: { rig: FocusRig; camera: Camera & { fov: number }; canvas: HTMLCanvasElement; target?: Vector3 } | null =
  null
let overlayBound = false

function requestDemandPaint() {
  void window.__twinInvalidate?.()
}

function bindOverlayOnce() {
  if (overlayBound || typeof window === 'undefined') return
  overlayBound = true
  window.addEventListener(OVERLAY_LAYOUT_EVENT, () => {
    if (!lastFocus) return
    applyVisibleFocalOffset(lastFocus.rig, lastFocus.camera, lastFocus.canvas, true, lastFocus.target)
  })
}

export function applyVisibleFocalOffset(
  rig: FocusRig,
  camera: Camera & { fov: number },
  canvas: HTMLCanvasElement,
  enableTransition: boolean,
  targetWorld?: Vector3,
) {
  if (typeof rig.setFocalOffset !== 'function') return
  const measured = readOverlayRects()
  const box = canvas.getBoundingClientRect()
  const canvasRect = measured?.canvas ?? { left: box.left, right: box.right, top: box.top, bottom: box.bottom }
  const visible = visibleCanvasRegion(canvasRect, measured?.overlays ?? [])
  const offset = focalOffsetToVisibleCenter(canvasRect, visible, rig.distance, camera.fov, box.height || 1)
  void rig.setFocalOffset(offset.x, offset.y, offset.z, enableTransition)
  if (!enableTransition) rig.update(0)
  lastFocus = { rig, camera, canvas, target: targetWorld }
  bindOverlayOnce()
  let target: { x: number; y: number } | undefined
  if (targetWorld) {
    camera.updateMatrixWorld()
    const projected = targetWorld.clone().project(camera)
    target = {
      x: box.left + (projected.x * 0.5 + 0.5) * box.width,
      y: box.top + (-projected.y * 0.5 + 0.5) * box.height,
    }
  }
  window.__twinVisibleFocus = {
    canvas: canvasRect,
    visible,
    focal: offset,
    distance: rig.distance,
    target,
  }
  requestDemandPaint()
}

export function resetFocalOffset(rig: Pick<FocusRig, 'setFocalOffset'> | null) {
  if (!rig || typeof rig.setFocalOffset !== 'function') return
  void rig.setFocalOffset(0, 0, 0, false)
  lastFocus = null
  delete window.__twinVisibleFocus
  requestDemandPaint()
}
