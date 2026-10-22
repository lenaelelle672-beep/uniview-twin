import { Html } from '@react-three/drei/web/Html'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Group } from 'three'
import { buildFocusDetail } from '../../alarms/focusDetail'
import { isFloorHydrated } from '../../floors/cache'
import { resolveWorkstationRef } from '../../locate/ref'
import { useTwinStore } from '../../store/store'
import { focusFloatDeskId, focusFloatLift, focusFloatLines, resolveFocusFloatAnchor } from './anchor'
import css from './focusFloat.css?inline'

/**
 * 聚焦时才由 FocusFloatHost 懒加载。
 * 场景里这一枚是唯一的浮动摘要；测距标签是另一条懒加载路径，不从这里复用。
 * 不传 occlude：遮挡每帧要射线，历史已经否掉多枚 Html，这里也不开遮挡。
 */
export function FocusFloatCard() {
  const focusedDeskId = useTwinStore((state) => state.focusedDeskId)
  const focusedDeviceId = useTwinStore((state) => state.focusedDeviceId)
  const desks = useTwinStore((state) => state.desks)
  const devices = useTwinStore((state) => state.devices)
  const people = useTwinStore((state) => state.people)
  const alarms = useTwinStore((state) => state.alarms)
  const view = useTwinStore((state) => state.view)
  const invalidate = useThree((state) => state.invalidate)
  const groupRef = useRef<Group>(null)
  const [retry, setRetry] = useState(0)

  const detail = useMemo(
    () => buildFocusDetail({ desks, devices, people, alarms }, { deskId: focusedDeskId, deviceId: focusedDeviceId }),
    [alarms, desks, devices, focusedDeskId, focusedDeviceId, people],
  )
  const anchor = useMemo(
    () => resolveFocusFloatAnchor(devices, { deskId: focusedDeskId, deviceId: focusedDeviceId }),
    [devices, focusedDeskId, focusedDeviceId, retry],
  )
  const lines = detail ? focusFloatLines(detail) : []

  useEffect(() => {
    if (anchor || view !== 'floor') return
    const deskId = focusFloatDeskId(devices, { deskId: focusedDeskId, deviceId: focusedDeviceId })
    const ref = deskId ? resolveWorkstationRef(deskId) : null
    if (!ref || (ref.floorId !== 'B1' && isFloorHydrated(ref.floorId))) return
    const timer = window.setTimeout(() => setRetry((value) => value + 1), 200)
    return () => window.clearTimeout(timer)
  }, [anchor, devices, focusedDeskId, focusedDeviceId, retry, view])

  useEffect(() => {
    const node = document.createElement('style')
    node.dataset.focusFloat = ''
    node.textContent = css
    document.head.append(node)
    return () => node.remove()
  }, [])

  useEffect(() => {
    invalidate()
    return () => invalidate()
  }, [anchor, invalidate])

  useFrame(() => {
    const node = groupRef.current
    if (!node || !anchor) return
    const lift = focusFloatLift(anchor.floorId, window.__twinExplode?.floors)
    const y = anchor.y + lift
    if (node.position.x === anchor.x && node.position.y === y && node.position.z === anchor.z) return
    node.position.set(anchor.x, y, anchor.z)
  })

  if (!detail || !anchor || lines.length === 0) return null

  const lift = focusFloatLift(anchor.floorId, window.__twinExplode?.floors)
  const status = detail.device?.status ?? ''

  return (
    <group ref={groupRef} name="FocusFloatAnchor" position={[anchor.x, anchor.y + lift, anchor.z]}>
      <Html center position={[0, 0, 0]} pointerEvents="none" zIndexRange={[3, 0]} className="focus-float">
        <div
          data-focus-float=""
          data-focus-desk={anchor.deskId}
          data-focus-device={detail.device?.id ?? ''}
          data-status={status}
        >
          {lines.map((line) => (
            <p key={line.role} className={line.role === 'status' ? 'focus-float-status' : undefined}>
              {line.text}
            </p>
          ))}
        </div>
      </Html>
    </group>
  )
}
