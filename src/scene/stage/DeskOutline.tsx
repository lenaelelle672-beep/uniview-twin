import { Outlines } from '@react-three/drei/core/Outlines'
import { useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Mesh, type BufferGeometry } from 'three'
import { useTwinStore } from '../../store/store'
import {
  DESK_OUTLINE_COLOR,
  DESK_OUTLINE_THICKNESS,
  OUTLINE_CARRIER_LAYER,
  focusedOutlineShells,
  type DeskOutlinePose,
} from './deskOutline'

/**
 * 聚焦工位的选中轮廓。
 * WorkstationDesks / WorkstationMonitors 是 InstancedMesh。drei Outlines 遇到实例父级
 * 会按 instanceMatrix 把整层都描上，所以这里单独放一个可挂的 mesh，只描当前工位。
 * 楼层悬停仍走改色和 FloorLeader：外壳在总览主包里，不把 Outlines 拉进首屏。
 */
export function FocusedDeskOutlines({ floorId }: { floorId: string }) {
  const focusedDeskId = useTwinStore((state) => state.focusedDeskId)
  const focusedDeviceId = useTwinStore((state) => state.focusedDeviceId)
  const devices = useTwinStore((state) => state.devices)
  const shells = focusedOutlineShells(floorId, focusedDeskId, focusedDeviceId, devices)
  if (shells.length === 0) return null
  return (
    <group name="DeskOutlines">
      {shells.map((shell) => (
        <OutlineCarrier
          key={`${shell.name}:${shell.pose.x}:${shell.pose.z}:${shell.pose.rot}`}
          name={shell.name}
          geometry={shell.geometry}
          pose={shell.pose}
        />
      ))}
    </group>
  )
}

function OutlineCarrier({
  name,
  geometry,
  pose,
}: {
  name: string
  geometry: BufferGeometry
  pose: DeskOutlinePose
}) {
  const invalidate = useThree((state) => state.invalidate)
  const meshRef = useRef<Mesh>(null)
  // 克隆一份，避免 angle=0 时 Outlines 与卸载逻辑碰到工位实例共用的几何。
  const owned = useMemo(() => geometry.clone(), [geometry])

  useEffect(() => {
    return () => {
      owned.dispose()
    }
  }, [owned])

  useLayoutEffect(() => {
    meshRef.current?.layers.set(OUTLINE_CARRIER_LAYER)
    // frameloop=demand。挂上、换工位、卸下都要补一帧，否则轮廓停在上一帧。
    invalidate()
    return () => {
      invalidate()
    }
  }, [invalidate, name, owned, pose.rot, pose.x, pose.z])

  return (
    <mesh
      ref={meshRef}
      name={name}
      geometry={owned}
      position={[pose.x, 0, pose.z]}
      rotation={[0, pose.rot, 0]}
      dispose={null}
      raycast={() => null}
      castShadow={false}
      receiveShadow={false}
    >
      <meshBasicMaterial />
      <Outlines
        screenspace
        thickness={DESK_OUTLINE_THICKNESS}
        color={DESK_OUTLINE_COLOR}
        toneMapped={false}
        // 0 表示沿用桌面/显示器自己的平直面法线，也不 dispose 这份几何。
        angle={0}
      />
    </mesh>
  )
}
