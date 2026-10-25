import { Center } from '@react-three/drei/core/Center'
import { useThree } from '@react-three/fiber'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { Box3, Object3D } from 'three'
import {
  FIT_PADDING_M,
  frameWithControls,
  pumpUntilSettled,
  type FocusPlan,
  type FrameRig,
} from './plan'
import { resolveFocusObject } from './subject'

type Centered = { boundingBox: Box3 }

/**
 * T070：优先路径。drei Center 只测量当前层或选中物，不把它们收成自己的子节点。
 * 测量完立刻卸下 Center，镜头仍由 CameraControls.fitToBox 推进。
 */
export function CenterFit({
  plan,
  onLive,
  onDone,
}: {
  plan: FocusPlan
  onLive: (live: boolean) => void
  onDone: (result: 'fitted' | 'empty' | 'missing') => void
}) {
  const scene = useThree((state) => state.scene)
  const [subject, setSubject] = useState<Object3D | null>(null)
  const [cacheKey, setCacheKey] = useState(0)
  const done = useRef(false)
  const stopPump = useRef<(() => void) | null>(null)
  const onLiveRef = useRef(onLive)
  const onDoneRef = useRef(onDone)
  onLiveRef.current = onLive
  onDoneRef.current = onDone

  useLayoutEffect(() => {
    const next = resolveFocusObject(scene, plan)
    setSubject(next)
    setCacheKey((value) => value + 1)
    if (!next) {
      done.current = true
      onLiveRef.current(false)
      onDoneRef.current('missing')
      return
    }
    onLiveRef.current(true)
    return () => {
      stopPump.current?.()
      stopPump.current = null
      onLiveRef.current(false)
    }
  }, [plan, scene])

  const onCentered = useCallback((payload: Centered) => {
    if (done.current) return
    const box = payload.boundingBox
    if (!box || box.isEmpty()) {
      done.current = true
      setSubject(null)
      onLiveRef.current(false)
      onDoneRef.current('empty')
      return
    }
    const rig = window.__twinRig as (FrameRig & NonNullable<Window['__twinRig']>) | undefined
    const fit = rig ? frameWithControls(rig, box.clone(), FIT_PADDING_M) : null
    done.current = true
    setSubject(null)
    onLiveRef.current(false)
    if (!fit) {
      onDoneRef.current('missing')
      return
    }
    stopPump.current = pumpUntilSettled(fit, () => {
      window.__vpP?.()
    })
    void fit.then(
      () => onDoneRef.current('fitted'),
      () => onDoneRef.current('fitted'),
    )
  }, [])

  if (!subject) return null
  return (
    <Center object={subject} disableX disableY disableZ precise cacheKey={cacheKey} onCentered={onCentered}>
      {null}
    </Center>
  )
}
