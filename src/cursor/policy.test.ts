import { describe, expect, it } from 'vitest'
import { onPointerOut, onPointerOver, pointerNdc, pointerOnCanvas, type CursorNode } from './policy'

function node(name: string, parent: CursorNode | null = null, extra: Partial<CursorNode> = {}): CursorNode {
  return { name, parent, ...extra }
}

describe('useCursor 悬停目标', () => {
  it('楼层壳、圆标、摄像头锥和摆点锚点算可点目标', () => {
    const shell = node('FloorShell-F12')
    const curtain = node('FloorCurtain-F12', shell)
    expect(onPointerOver({ onCanvas: true, shiftKey: false, hits: [curtain], dragging: false, axis: null })).toEqual({
      hovered: true,
      target: 'FloorShell-F12',
      yielded: '',
    })
    expect(onPointerOver({ onCanvas: true, shiftKey: false, hits: [node('DeviceBadges')], dragging: false, axis: null }).target).toBe(
      'DeviceBadges',
    )
    expect(onPointerOver({ onCanvas: true, shiftKey: false, hits: [node('CameraFovCone')], dragging: false, axis: null }).hovered).toBe(
      true,
    )
    expect(onPointerOver({ onCanvas: true, shiftKey: false, hits: [node('DemoEditAnchor')], dragging: false, axis: null }).target).toBe(
      'DemoEditAnchor',
    )
    const basement = node('B1')
    expect(onPointerOver({ onCanvas: true, shiftKey: false, hits: [node('B1Slab', basement)], dragging: false, axis: null }).target).toBe(
      'B1',
    )
    expect(onPointerOver({ onCanvas: true, shiftKey: false, hits: [node('B1Pick')], dragging: false, axis: null }).target).toBe('B1Pick')
  })

  it('地面、工位实例和框选代理不改光标，挡住圆标时也不穿透', () => {
    expect(onPointerOver({ onCanvas: true, shiftKey: false, hits: [node('Park')], dragging: false, axis: null })).toEqual(onPointerOut())
    expect(onPointerOver({ onCanvas: true, shiftKey: false, hits: [node('WorkstationDesks')], dragging: false, axis: null }).hovered).toBe(
      false,
    )
    const proxy = node('DeskPickProxy', null, { userData: { boxPickProxy: true } })
    expect(onPointerOver({ onCanvas: true, shiftKey: false, hits: [proxy], dragging: false, axis: null }).hovered).toBe(false)
    const hidden = node('FloorShell-F3', null, { visible: false })
    expect(onPointerOver({ onCanvas: true, shiftKey: false, hits: [node('FloorBand-F3', hidden)], dragging: false, axis: null }).hovered).toBe(
      false,
    )
    const badge = node('DeviceBadges')
    expect(
      onPointerOver({ onCanvas: true, shiftKey: false, hits: [node('FloorWalls'), badge], dragging: false, axis: null }).hovered,
    ).toBe(false)
  })

  it('Shift 框选、手柄拖动和画布外 DOM 都让出光标', () => {
    const shell = node('FloorShell-F1')
    expect(onPointerOver({ onCanvas: true, shiftKey: true, hits: [shell], dragging: false, axis: null })).toMatchObject({
      hovered: false,
      yielded: 'box',
    })
    expect(onPointerOver({ onCanvas: true, shiftKey: false, hits: [shell], dragging: true, axis: null })).toMatchObject({
      hovered: false,
      yielded: 'gizmo',
    })
    expect(onPointerOver({ onCanvas: true, shiftKey: false, hits: [shell], dragging: false, axis: 'XY' })).toMatchObject({
      hovered: false,
      yielded: 'gizmo',
    })
    const handle = node('X', node('gizmo', node('controls', null, { isTransformControls: true })))
    expect(onPointerOver({ onCanvas: true, shiftKey: false, hits: [handle], dragging: false, axis: null })).toMatchObject({
      hovered: false,
      yielded: 'gizmo',
    })
    expect(onPointerOver({ onCanvas: false, shiftKey: false, hits: [shell], dragging: false, axis: null })).toMatchObject({
      hovered: false,
      yielded: 'dom',
    })
    expect(onPointerOut()).toEqual({ hovered: false, target: null, yielded: '' })
  })

  it('指针在画布内才算悬停，NDC 用元素矩形', () => {
    const canvas = {
      rect: { left: 10, top: 20, right: 110, bottom: 220, width: 100, height: 200 },
      getBoundingClientRect() {
        return this.rect
      },
      contains() {
        return false
      },
    }
    expect(pointerOnCanvas({ clientX: 60, clientY: 120, target: canvas }, canvas)).toBe(true)
    expect(pointerOnCanvas({ clientX: 60, clientY: 120, target: {} }, canvas)).toBe(false)
    expect(pointerOnCanvas({ clientX: 0, clientY: 120, target: canvas }, canvas)).toBe(false)
    expect(pointerNdc(60, 120, canvas.rect)).toEqual({ x: 0, y: 0 })
    expect(pointerNdc(10, 20, { left: 0, top: 0, width: 0, height: 10 })).toBeNull()
  })
})
