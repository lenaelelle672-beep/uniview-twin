import { Bounds, useBounds } from '@react-three/drei/core/Bounds'
import { useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Box3, type Object3D } from 'three'
import { BOUNDS_FIT_SEC, holdViewpointFlag, type FocusPlan, type OrbitPose } from './plan'
import { resolveFocusObject } from './subject'

type Rig = NonNullable<Window['__twinRig']> & { enabled?: boolean }

/**
 * T070：讲解对焦才走这里。不把 fit / observe / clip 设在 props 上，避免一挂上就装入。
 * 动画期间摘掉 R3F controls、停掉 CameraControls.update，结束时 setLookAt(false) 交还。
 * 子节点是空的，不包塔楼。
 */
export function BoundsFit({
  plan,
  onLive,
  onDone,
}: {
  plan: FocusPlan
  onLive: (live: boolean) => void
  onDone: (result: 'fitted' | 'empty' | 'missing') => void
}) {
  const scene = useThree((state) => state.scene)
  const set = useThree((state) => state.set)
  const get = useThree((state) => state.get)
  const [phase, setPhase] = useState<'boot' | 'run' | 'done'>('boot')
  const [subject, setSubject] = useState<Object3D | null>(null)
  const poseRef = useRef<OrbitPose | null>(null)
  const releaseRef = useRef<(() => void) | null>(null)
  const onLiveRef = useRef(onLive)
  const onDoneRef = useRef(onDone)
  onLiveRef.current = onLive
  onDoneRef.current = onDone

  useLayoutEffect(() => {
    const rig = window.__twinRig as Rig | undefined
    const next = resolveFocusObject(scene, plan)
    if (!rig || !next) {
      onLiveRef.current(false)
      onDoneRef.current('missing')
      return
    }
    const previousControls = get().controls
    const previousUpdate = rig.update.bind(rig)
    const previousEnabled = rig.enabled
    rig.update = () => true
    rig.enabled = false
    const releaseFlag = holdViewpointFlag()
    set({ controls: null })
    let closed = false
    releaseRef.current = () => {
      if (closed) return
      closed = true
      rig.update = previousUpdate
      rig.enabled = previousEnabled ?? true
      set({ controls: previousControls })
      releaseFlag()
      previousUpdate(0)
      window.__vpP?.()
    }
    setSubject(next)
    setPhase('run')
    onLiveRef.current(true)
    return () => {
      onLiveRef.current(false)
      releaseRef.current?.()
    }
  }, [get, plan, scene, set])

  useLayoutEffect(() => {
    if (phase !== 'done') return
    const rig = window.__twinRig
    const pose = poseRef.current
    if (rig && pose) {
      void rig.setLookAt(pose.px, pose.py, pose.pz, pose.tx, pose.ty, pose.tz, false)
    }
    onLiveRef.current(false)
    releaseRef.current?.()
    onDoneRef.current(pose ? 'fitted' : 'empty')
  }, [phase])

  if (phase !== 'run' || !subject) return null
  return (
    <Bounds maxDuration={BOUNDS_FIT_SEC} margin={1.2}>
      <NarrationFitOnce
        subject={subject}
        onPose={(pose) => {
          poseRef.current = pose
          setPhase('done')
        }}
      />
    </Bounds>
  )
}

function NarrationFitOnce({
  subject,
  onPose,
}: {
  subject: Object3D
  onPose: (pose: OrbitPose | null) => void
}) {
  const api = useBounds()
  const camera = useThree((state) => state.camera)
  const onPoseRef = useRef(onPose)
  onPoseRef.current = onPose

  useEffect(() => {
    if (!api) {
      onPoseRef.current(null)
      return
    }
    // Bounds 挂上时的 layout 会先 refresh 空组，把目标清掉。
    // 这里改到 useEffect，等那一次清场结束再量当前层并 fit。
    // refresh() 会把空盒换成相机周围的大盒。先自己量，空了就放弃，避免装进整栋的尺度。
    const measured = new Box3().setFromObject(subject)
    if (measured.isEmpty()) {
      onPoseRef.current(null)
      return
    }
    api.refresh(measured)
    const sized = api.getSize()
    const center = { x: sized.center.x, y: sized.center.y, z: sized.center.z }
    api.fit()
    const started = performance.now()
    let raf = 0
    let stopped = false
    const finish = () => {
      if (stopped) return
      stopped = true
      if (raf) cancelAnimationFrame(raf)
      onPoseRef.current({
        px: camera.position.x,
        py: camera.position.y,
        pz: camera.position.z,
        tx: center.x,
        ty: center.y,
        tz: center.z,
      })
    }
    const tick = () => {
      if (stopped) return
      window.__vpP?.()
      if (performance.now() - started < BOUNDS_FIT_SEC * 1000 + 80) {
        raf = requestAnimationFrame(tick)
        return
      }
      finish()
    }
    raf = requestAnimationFrame(tick)
    return () => {
      stopped = true
      if (raf) cancelAnimationFrame(raf)
    }
  }, [api, camera, subject])

  return null
}
