/**
 * T075：悬停指针只认「能聚焦的设备」和「已经能点的网格」。
 * 不新建几何。框选按着 Shift、TransformControls 正在对准手柄时让出光标。
 * 光标写在画布上，不写 document.body，DOM 自己的 cursor 保持原样。
 */

export const CURSOR_OVER = 'pointer'
/** 空字符串清掉画布上的内联 cursor，样式表里的光标还能生效。 */
export const CURSOR_OUT = ''

export type CursorYield = '' | 'dom' | 'box' | 'gizmo'

export interface CursorNode {
  name: string
  visible?: boolean
  parent: CursorNode | null
  isTransformControls?: boolean
  userData?: { boxPickProxy?: boolean }
}

export interface HoverInput {
  onCanvas: boolean
  shiftKey: boolean
  hits: readonly CursorNode[]
  dragging: boolean
  axis: string | null
}

export interface HoverState {
  hovered: boolean
  target: string | null
  yielded: CursorYield
}

const EXACT_NAMES = new Set(['DeviceBadges', 'CameraFovCone', 'DemoEditAnchor', 'B1', 'B1Pick'])

export function onPointerOut(): HoverState {
  return { hovered: false, target: null, yielded: '' }
}

export function transformAncestor(node: CursorNode | null): CursorNode | null {
  let current: CursorNode | null = node
  while (current) {
    if (current.isTransformControls) return current
    current = current.parent
  }
  return null
}

/** 从命中点往父级找。框选代理和手柄不在这份名单里。 */
export function focusableName(node: CursorNode | null): string | null {
  let current: CursorNode | null = node
  while (current) {
    if (current.isTransformControls) return null
    if (current.userData?.boxPickProxy === true) return null
    if (current.name === 'DeskPickProxy' || current.name === 'DeskPickProxies' || current.name === 'DeskBoxSelect') {
      return null
    }
    if (EXACT_NAMES.has(current.name) || current.name.startsWith('FloorShell-')) {
      if (current.visible === false) return null
      return current.name
    }
    current = current.parent
  }
  return null
}

/**
 * 只看最近的一次命中。墙后面的圆标不算悬停。
 * Shift 是框选手势；手柄的 axis / dragging 是 TransformControls。
 */
export function onPointerOver(input: HoverInput): HoverState {
  if (!input.onCanvas) return { hovered: false, target: null, yielded: 'dom' }
  if (input.shiftKey) return { hovered: false, target: null, yielded: 'box' }
  if (input.dragging || (input.axis != null && input.axis !== '')) {
    return { hovered: false, target: null, yielded: 'gizmo' }
  }
  const hit = input.hits[0]
  if (!hit) return onPointerOut()
  if (transformAncestor(hit)) return { hovered: false, target: null, yielded: 'gizmo' }
  const target = focusableName(hit)
  if (!target) return onPointerOut()
  return { hovered: true, target, yielded: '' }
}

export interface CanvasRect {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

export function pointerNdc(
  clientX: number,
  clientY: number,
  rect: Pick<CanvasRect, 'left' | 'top' | 'width' | 'height'>,
): { x: number; y: number } | null {
  if (rect.width <= 0 || rect.height <= 0) return null
  return {
    x: ((clientX - rect.left) / rect.width) * 2 - 1,
    y: -((clientY - rect.top) / rect.height) * 2 + 1,
  }
}

export function pointerOnCanvas(
  event: { clientX: number; clientY: number; target: unknown },
  canvas: { getBoundingClientRect(): CanvasRect; contains(node: Node): boolean },
): boolean {
  const rect = canvas.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return false
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
    return false
  }
  const target = event.target
  if (target === canvas) return true
  return typeof Node !== 'undefined' && target instanceof Node && canvas.contains(target)
}
