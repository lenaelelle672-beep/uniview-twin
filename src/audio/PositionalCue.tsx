/**
 * T108：一只 drei PositionalAudio。
 * listener 由这只组件加到相机上，卸下时摘掉。不要再 new 第二只。
 * 不传 autoplay。循环关掉。distance 就是 refDistance。
 * 不挂 useFrame。出声后只补一帧，让声像吃到当前矩阵，然后把 demand 还回去。
 */

import { PositionalAudio } from '@react-three/drei/core/PositionalAudio'
import { extend, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { PositionalAudio as PositionalAudioImpl, type Object3D } from 'three'

extend({ PositionalAudio: PositionalAudioImpl })

export interface PositionalCueProps {
  url: string
  distance: number
  playToken: number
  position: readonly [number, number, number]
}

function keepSingleListener(camera: Object3D): boolean {
  const listeners = camera.children.filter((child) => child.type === 'AudioListener')
  for (let index = 1; index < listeners.length; index += 1) {
    const extra = listeners[index]
    if (extra) camera.remove(extra)
  }
  return listeners.length > 0
}

export function PositionalCue({ url, distance, playToken, position }: PositionalCueProps) {
  const sound = useRef<PositionalAudioImpl>(null)
  const camera = useThree((state) => state.camera)
  const invalidate = useThree((state) => state.invalidate)

  useEffect(() => {
    let cancelled = false
    const sync = () => {
      if (cancelled) return
      const listener = sound.current?.listener
      if (listener && listener.parent !== camera) {
        listener.removeFromParent()
        camera.add(listener)
      }
      const attached = keepSingleListener(camera)
      const probe = window.__twinPositionalAudio
      if (probe) probe.listener = attached
    }
    sync()
    // drei 把监听加在自己的 effect 里，且依赖是空的。镜头换成另一只时补挂到当前相机。
    const timer = window.setTimeout(sync, 0)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      const listener = sound.current?.listener
      if (listener?.parent === camera) camera.remove(listener)
      const next = window.__twinPositionalAudio
      if (next) next.listener = false
    }
  }, [camera])

  useEffect(() => {
    if (playToken < 1) return
    let cancelled = false
    const start = () => {
      if (cancelled) return
      const live = sound.current
      if (!live?.buffer) return
      try {
        live.setRefDistance(distance)
        if (live.isPlaying) live.stop()
        live.play()
      } catch {
        // 缓冲还没接上，或上下文拒了。这一声作废，不循环补帧。
      }
      invalidate()
    }
    const live = sound.current
    if (live?.buffer && live.context.state === 'running') {
      start()
      return () => {
        cancelled = true
      }
    }
    if (live && live.context.state === 'suspended' && typeof live.context.resume === 'function') {
      void live.context.resume().then(start, () => undefined)
      return () => {
        cancelled = true
      }
    }
    const timer = window.setTimeout(start, 0)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [distance, invalidate, playToken])

  return (
    <group name="AlarmPositional" position={[position[0], position[1], position[2]]}>
      <PositionalAudio ref={sound} url={url} distance={distance} loop={false} />
    </group>
  )
}
