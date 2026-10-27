import { useCursor } from '@react-three/drei/web/useCursor'
import { useThree } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import type { Scene, Vector2 } from 'three'
import { CURSOR_OUT, CURSOR_OVER, onPointerOut, onPointerOver, pointerNdc, pointerOnCanvas, type CursorNode, type HoverState } from './policy'

/**
 * T075：drei useCursor。不创建网格，也不按帧续画。
 * 指针移动时自己射线，命中可聚焦设备或可点楼层才把画布光标改成 pointer。
 * 事件继续往下传，框选和 TransformControls 的监听照旧收到。
 */

interface GizmoObject {
  isTransformControls?: boolean
  dragging?: boolean
  axis?: string | null
}

export interface HoverCursorProbe {
  enabled: boolean
  hovered: boolean
  target: string | null
  yielded: HoverState['yielded']
  container: 'canvas'
  setEnabled: (on: boolean) => void
}

declare global {
  interface Window {
    __twinHoverCursor?: HoverCursorProbe
  }
}

function readGizmo(scene: Scene): { dragging: boolean; axis: string | null } {
  if (typeof window === 'undefined' || window.__twinDemoEdit?.gizmo !== true) {
    return { dragging: false, axis: null }
  }
  let dragging = false
  let axis: string | null = null
  scene.traverse((object) => {
    const gizmo = object as GizmoObject
    if (!gizmo.isTransformControls) return
    dragging = gizmo.dragging === true
    axis = typeof gizmo.axis === 'string' ? gizmo.axis : null
  })
  return { dragging, axis }
}

export function HoverCursor() {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)
  const raycaster = useThree((state) => state.raycaster)
  const [hovered, setHovered] = useState(false)
  const hoveredRef = useRef(false)
  const enabledRef = useRef(true)

  // 第四个参数是画布。不把光标写到页面根节点上，按钮和蓝图自己的样式才不会被盖住。
  useCursor(hovered, CURSOR_OVER, CURSOR_OUT, gl.domElement)

  useEffect(() => {
    const canvas = gl.domElement
    const publish = (state: HoverState) => {
      window.__twinHoverCursor = {
        enabled: enabledRef.current,
        hovered: state.hovered && enabledRef.current,
        target: state.hovered && enabledRef.current ? state.target : null,
        yielded: state.yielded,
        container: 'canvas',
        setEnabled(on: boolean) {
          enabledRef.current = on
          if (!on) {
            hoveredRef.current = false
            setHovered(false)
            canvas.style.cursor = CURSOR_OUT
          }
          publish(onPointerOut())
        },
      }
    }

    const commit = (state: HoverState) => {
      const next = enabledRef.current && state.hovered
      publish(state)
      if (hoveredRef.current === next) return
      hoveredRef.current = next
      setHovered(next)
    }

    const onMove = (event: PointerEvent) => {
      const onCanvas = pointerOnCanvas(event, canvas)
      if (!onCanvas) {
        commit(onPointerOver({ onCanvas: false, shiftKey: event.shiftKey, hits: [], dragging: false, axis: null }))
        return
      }
      const rect = canvas.getBoundingClientRect()
      const ndc = pointerNdc(event.clientX, event.clientY, rect)
      if (!ndc) {
        commit(onPointerOut())
        return
      }
      const gizmo = readGizmo(scene)
      raycaster.setFromCamera(ndc as Vector2, camera)
      const hits = raycaster.intersectObjects(scene.children, true)
      commit(
        onPointerOver({
          onCanvas: true,
          shiftKey: event.shiftKey,
          hits: hits.map((hit) => hit.object as CursorNode),
          dragging: gizmo.dragging,
          axis: gizmo.axis,
        }),
      )
    }

    const onLeave = () => {
      commit(onPointerOut())
    }

    publish(onPointerOut())
    // window 冒泡晚于画布上的 TransformControls pointermove，axis 已经更新。
    window.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerleave', onLeave)
    return () => {
      window.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerleave', onLeave)
      canvas.style.cursor = CURSOR_OUT
      if (window.__twinHoverCursor?.container === 'canvas') delete window.__twinHoverCursor
    }
  }, [camera, gl, raycaster, scene])

  return null
}
