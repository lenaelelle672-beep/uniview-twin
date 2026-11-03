import { BBAnchor } from '@react-three/drei/core/BBAnchor'
import { Html } from '@react-three/drei/web/Html'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Group } from 'three'
import { buildFocusDetail } from '../../alarms/focusDetail'
import { isFloorHydrated } from '../../floors/cache'
import { resolveWorkstationRef } from '../../locate/ref'
import { useTwinStore } from '../../store/store'
import {
  FOCUS_FLOAT_CORNER,
  focusFloatCornerBox,
  focusFloatCornerLocal,
  focusFloatDeskId,
  focusFloatExplodeShift,
  focusFloatGroupPosition,
  focusFloatLines,
  resolveFocusFloatAnchor,
} from './anchor'
import css from './focusFloat.css?inline'

/**
 * 聚焦时才由 FocusFloatHost 懒加载。
 * 场景里这一枚是唯一的浮动摘要；测距标签是另一条懒加载路径，不从这里复用。
 * 不传 occlude：遮挡每帧要射线，历史已经否掉多枚 Html，这里也不开遮挡。
 *
 * drei 10.7.9 的 BBAnchor 把父级原点当地心：position = parent.position + size * anchor / 2。
 * 桌和显示器的几何不以原点为中心，直接挂上去会钉在半高。
 * 这里放一只和旋转后包围盒同尺寸、中心对齐的盒子，[1,1,1] 才是顶角。
 * 盒子不画、不拾取。BBAnchor 会把子节点挂到盒子的父级，单枚 Html 跟着角走。
 * BBAnchor 与 Html 都只从这条懒包进来，不进 hardGate。
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
  const box = useMemo(() => focusFloatCornerBox(anchor?.rot ?? 0), [anchor?.rot])
  // demand 下 BBAnchor 的 useFrame 停住后，R3F 会把没写的 position 收回 0。
  // 角点写在 props 上，重渲染也停在包围盒角。
  const corner = useMemo(() => focusFloatCornerLocal(box), [box])
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
    const pose = focusFloatGroupPosition(anchor, focusFloatExplodeShift(anchor.floorId, anchor.x, anchor.z))
    if (node.position.x === pose.x && node.position.y === pose.y && node.position.z === pose.z) return
    node.position.set(pose.x, pose.y, pose.z)
  })

  if (!detail || !anchor || lines.length === 0) return null

  const pose = focusFloatGroupPosition(anchor, focusFloatExplodeShift(anchor.floorId, anchor.x, anchor.z))

  return (
    <group ref={groupRef} name="FocusFloatAnchor" position={[pose.x, pose.y, pose.z]}>
      <mesh name="FocusFloatBounds" position={box.center} visible={false} raycast={() => null} frustumCulled={false}>
        <boxGeometry args={box.size} />
        <BBAnchor name="FocusFloatCorner" anchor={FOCUS_FLOAT_CORNER} position={corner}>
          <Html center position={[0, 0, 0]} pointerEvents="none" zIndexRange={[3, 0]} className="focus-float">
            <div
              data-focus-float=""
              data-focus-desk={anchor.deskId}
              data-focus-device={detail.device?.id ?? ''}
              data-status={detail.device?.status ?? ''}
            >
              {lines.map((line) => (
                <p key={line.role} className={line.role === 'status' ? 'focus-float-status' : undefined}>
                  {line.text}
                </p>
              ))}
            </div>
          </Html>
        </BBAnchor>
      </mesh>
    </group>
  )
}
