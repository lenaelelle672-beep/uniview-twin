import { Outlines } from '@react-three/drei/core/Outlines'
import { useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Mesh, type BufferGeometry } from 'three'
import { searchWorkstations } from '../../locate/search'
import { useTwinStore } from '../../store/store'
import {
  ALARM_OUTLINE_COLOR,
  DESK_OUTLINE_COLOR,
  DESK_OUTLINE_THICKNESS,
  MULTI_OUTLINE_CAP,
  OUTLINE_CARRIER_LAYER,
  SEARCH_OUTLINE_COLOR,
  SEARCH_OUTLINE_HIT_LIMIT,
  focusedOutlineShells,
  multiOutlineShells,
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
  const shells = useMemo(
    () => focusedOutlineShells(floorId, focusedDeskId, focusedDeviceId, devices),
    [devices, floorId, focusedDeskId, focusedDeviceId],
  )
  useEffect(() => {
    if (shells.length === 0) {
      delete window.__twinDeskOutline
      return
    }
    const stamp = {
      floorId,
      color: DESK_OUTLINE_COLOR,
      names: shells.map((shell) => shell.name),
    }
    window.__twinDeskOutline = stamp
    return () => {
      if (window.__twinDeskOutline === stamp) delete window.__twinDeskOutline
    }
  }, [floorId, shells])
  if (shells.length === 0) return null
  return (
    <group name="DeskOutlines">
      {shells.map((shell) => (
        <OutlineCarrier
          key={`${shell.name}:${shell.pose.x}:${shell.pose.z}:${shell.pose.rot}`}
          name={shell.name}
          geometry={shell.geometry}
          pose={shell.pose}
          color={DESK_OUTLINE_COLOR}
        />
      ))}
    </group>
  )
}

/**
 * 进层后的告警工位和当前搜索命中。
 * 和聚焦青描边分开挂，共用 N=12 的载体预算。离层时这组跟着室内卸载。
 */
export function FloorMultiOutlines({ floorId }: { floorId: string }) {
  const devices = useTwinStore((state) => state.devices)
  const desks = useTwinStore((state) => state.desks)
  const people = useTwinStore((state) => state.people)
  const searchQuery = useTwinStore((state) => state.searchQuery)
  const focusedDeskId = useTwinStore((state) => state.focusedDeskId)
  const shells = useMemo(() => {
    const hits = searchWorkstations({ desks, people }, searchQuery, SEARCH_OUTLINE_HIT_LIMIT)
    return multiOutlineShells(floorId, devices, hits, focusedDeskId)
  }, [desks, devices, floorId, focusedDeskId, people, searchQuery])

  useEffect(() => {
    if (shells.length === 0) {
      delete window.__twinMultiOutlines
      return
    }
    const stamp = {
      floorId,
      cap: MULTI_OUTLINE_CAP,
      count: shells.length,
      alarmDeskIds: shells.filter((shell) => shell.name === 'AlarmOutline').map((shell) => shell.deskId),
      searchDeskIds: shells.filter((shell) => shell.name === 'SearchOutline').map((shell) => shell.deskId),
      alarmColor: ALARM_OUTLINE_COLOR,
      searchColor: SEARCH_OUTLINE_COLOR,
    }
    window.__twinMultiOutlines = stamp
    return () => {
      if (window.__twinMultiOutlines === stamp) delete window.__twinMultiOutlines
    }
  }, [floorId, shells])

  if (shells.length === 0) return null
  return (
    <group name="MultiOutlines">
      {shells.map((shell) => (
        <OutlineCarrier
          key={`${shell.name}:${shell.deskId}`}
          name={shell.name}
          geometry={shell.geometry}
          pose={shell.pose}
          color={shell.color}
        />
      ))}
    </group>
  )
}

function OutlineCarrier({
  name,
  geometry,
  pose,
  color,
}: {
  name: string
  geometry: BufferGeometry
  pose: DeskOutlinePose
  color: string
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
  }, [color, invalidate, name, owned, pose.rot, pose.x, pose.z])

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
        color={color}
        toneMapped={false}
        // 0 表示沿用桌面/显示器自己的平直面法线，也不 dispose 这份几何。
        angle={0}
      />
    </mesh>
  )
}
