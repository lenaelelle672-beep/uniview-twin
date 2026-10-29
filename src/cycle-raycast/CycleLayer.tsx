import { CycleRaycast } from '@react-three/drei/web/CycleRaycast'
import { useEffect, useState } from 'react'
import { useTwinStore } from '../store/store'
import {
  CYCLE_KEY_CODE,
  CYCLE_SCROLL,
  cycleBlockReason,
  cycleHoldsFilter,
  focusAt,
  pointerOnCanvas,
  sidebarFocusPatch,
  type CycleHit,
  type CycleKeyEvent,
  type CycleTarget,
} from './policy'
import { activitySnapshot, noteBlocked, noteCycle, setCycleFlags, setCyclePointer } from './session'

/**
 * T086：drei CycleRaycast 只出现在这个懒包里。
 * onChanged 只写侧栏的 focusedDeskId / focusedDeviceId，不推进镜头序号，也不改平滑时间。
 * scroll 关掉，滚轮仍是 CameraControls。Tab 默认 keyCode=9。
 * Shift、拖摆、指针按下和输入框在捕获阶段拦住，不让文档级监听把输入带走。
 */

function floorNow(): string | null {
  const store = useTwinStore.getState()
  return store.view === 'floor' ? store.selectedFloor : null
}

function onCycleChanged(hits: readonly CycleHit[], cycle: number): null {
  const focus = focusAt(hits, cycle, floorNow())
  noteCycle(hits.length, cycle, focus)
  const store = useTwinStore.getState()
  const patch = sidebarFocusPatch(focus, store)
  if (patch) {
    useTwinStore.setState(patch)
    void window.__twinInvalidate?.()
  }
  return null
}

function asKeyEvent(event: KeyboardEvent): CycleKeyEvent {
  return {
    key: event.key,
    keyCode: event.keyCode,
    which: event.which,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    repeat: event.repeat,
    target: event.target as CycleTarget | null,
  }
}

export function CycleLayer() {
  const [hold, setHold] = useState(false)

  useEffect(() => {
    const syncHold = () => setHold(cycleHoldsFilter(activitySnapshot()))
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' && (event.keyCode || event.which) !== CYCLE_KEY_CODE) return
      const reason = cycleBlockReason(asKeyEvent(event), activitySnapshot())
      noteBlocked(reason ?? '')
      if (reason) event.stopImmediatePropagation()
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== 'Shift') return
      setCyclePointer({ boxSelecting: false })
      syncHold()
    }
    const onPointerDown = (event: PointerEvent) => {
      const canvas = document.querySelector('canvas')
      const onCanvas = pointerOnCanvas(event.target, canvas)
      setCyclePointer({
        pointerDown: true,
        pointerOnCanvas: onCanvas,
        boxSelecting: event.button === 0 && event.shiftKey && onCanvas,
      })
      syncHold()
    }
    const onPointerUp = () => {
      setCyclePointer({ pointerDown: false, boxSelecting: false })
      syncHold()
    }
    const onPointerMove = (event: PointerEvent) => {
      const canvas = document.querySelector('canvas')
      setCyclePointer({ pointerOnCanvas: pointerOnCanvas(event.target, canvas) })
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('keyup', onKeyUp, true)
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('pointerup', onPointerUp, true)
    window.addEventListener('pointercancel', onPointerUp, true)
    window.addEventListener('pointermove', onPointerMove, true)
    const timer = window.setInterval(syncHold, 200)
    setCycleFlags({ mounted: true, hold: false })
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('keyup', onKeyUp, true)
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('pointerup', onPointerUp, true)
      window.removeEventListener('pointercancel', onPointerUp, true)
      window.removeEventListener('pointermove', onPointerMove, true)
      window.clearInterval(timer)
      setCycleFlags({ mounted: false, hold: false })
    }
  }, [])

  useEffect(() => {
    setCycleFlags({ hold, mounted: !hold })
  }, [hold])

  if (hold) return null
  return (
    <CycleRaycast
      keyCode={CYCLE_KEY_CODE}
      scroll={CYCLE_SCROLL}
      preventDefault
      onChanged={(hits, cycle) => onCycleChanged(hits, cycle)}
    />
  )
}
