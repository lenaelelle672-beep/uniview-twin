import { useFrame, useThree } from '@react-three/fiber'
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { InstancedMesh, Mesh } from 'three'
import { PICK_VOLUME_LAYER } from '../pickLayers'
import { floorSpec } from '../../data/floors'
import { isFloorHydrated } from '../../floors/cache'
import { loadFloorPlan } from '../../floors/loadFloor'
import { extrudeUp } from '../extrude'
import { basementPickOutline } from './b1Plan'
import { useTwinStore } from '../../store/store'
import type { DeviceStatus } from '../../types'
import { showCorridorPeople } from './corridor'
import { BlankSuspenseFallback } from '../assetLoad'
import { activeFloorId } from './cut'
import { FloorCut } from './FloorCut'
import { MONITOR_DISPLAY_COLOR } from './materials'
import { workstationPosition } from './workstationPosition'

const JsonFloorInterior = lazy(async () => {
  const mod = await import('../../floors/JsonFloorInterior')
  return { default: mod.JsonFloorInterior }
})

const B1Interior = lazy(async () => {
  const mod = await import('./B1Interior')
  return { default: mod.B1Interior }
})

const TowerInterior = lazy(() => import('./TowerInterior').then((mod) => ({ default: mod.TowerInterior })))
const MonitorSamples = lazy(() => import('./MonitorSamples').then((mod) => ({ default: mod.MonitorSamples })))
const FloorStageCamera = lazy(() => import('./FloorStageCamera').then((mod) => ({ default: mod.FloorStageCamera })))

export { TowerInterior as LazyTowerInterior }

function InteriorProbe({ floorId, dataDesks }: { floorId: string | null; dataDesks: number }) {
  const scene = useThree((state) => state.scene)
  useLayoutEffect(() => {
    const hidden: string[] = []
    let visibleShells = 0
    scene.traverse((object) => {
      if (!object.name.startsWith('FloorShell-')) return
      if (object.visible) visibleShells += 1
      else hidden.push(object.name.slice('FloorShell-'.length))
    })
    const roof = scene.getObjectByName('RoofAssembly')
    const above = scene.getObjectByName('AboveGradeContext')
    window.__twinCut = {
      hidden,
      visibleShells,
      roofVisible: Boolean(roof?.visible),
      aboveGradeVisible: Boolean(above?.visible),
    }
    if (!floorId) delete window.__twinInterior
  }, [floorId, scene])

  useFrame(() => {
    if (!floorId) {
      delete window.__twinInterior
      return
    }
    const mesh = scene.getObjectByName('WorkstationDesks') as InstancedMesh | undefined
    window.__twinInterior = {
      ...window.__twinInterior,
      floorId,
      dataDesks,
      renderedDesks: mesh?.count ?? window.__twinInterior?.renderedDesks ?? 0,
    }
  })
  return null
}

function BasementPick() {
  const enterFloor = useTwinStore((state) => state.enterFloor)
  const inside = useTwinStore((state) => state.view === 'floor')
  const geometry = useMemo(() => {
    const pick = extrudeUp(basementPickOutline(), 0.08)
    pick.translate(0, 0.42, 0)
    return pick
  }, [])
  if (inside) return null
  return (
    <mesh
      ref={(mesh: Mesh | null) => {
        mesh?.layers.set(PICK_VOLUME_LAYER)
      }}
      name="B1Pick"
      geometry={geometry}
      onDoubleClick={(event) => {
        event.stopPropagation()
        enterFloor('B1')
      }}
    >
      {/* 网格保持可见以便射线拾取。材质不参与渲染，渲染器会跳过，不产生绘制调用。 */}
      <meshBasicMaterial visible={false} />
    </mesh>
  )
}

export function FloorStage() {
  const view = useTwinStore((state) => state.view)
  const selectedFloor = useTwinStore((state) => state.selectedFloor)
  const quality = useTwinStore((state) => state.quality)
  const desks = useTwinStore((state) => state.desks)
  const devices = useTwinStore((state) => state.devices)
  const active = activeFloorId(view, selectedFloor)
  const floorDesks = useMemo(() => {
    if (!active) return []
    return desks.filter((desk) => desk.floorId === active).sort((desk, other) => desk.index - other.index)
  }, [active, desks])
  const colors = useMemo(() => {
    const byDesk = new Map<string, DeviceStatus>()
    for (const device of devices) {
      if (device.type === 'pc' && device.deskId) byDesk.set(device.deskId, device.status)
    }
    return floorDesks.map((desk) => MONITOR_DISPLAY_COLOR[byDesk.get(desk.id) ?? 'offline'])
  }, [devices, floorDesks])
  const floorDevices = useMemo(() => {
    if (!active) return []
    return devices.filter((device) => device.floorId === active)
  }, [active, devices])
  const spec = active ? floorSpec(active) : null
  const [hydratedFloor, setHydratedFloor] = useState<string | null>(() =>
    active && active !== 'B1' && isFloorHydrated(active) ? active : null,
  )
  useEffect(() => {
    if (!active || active === 'B1') {
      setHydratedFloor(null)
      return
    }
    if (isFloorHydrated(active)) {
      setHydratedFloor(active)
      return
    }
    let cancelled = false
    void loadFloorPlan(active).then((plan) => {
      if (!cancelled) setHydratedFloor(plan.floorId)
    })
    return () => {
      cancelled = true
    }
  }, [active])
  const slots = useMemo(() => {
    if (!active || active === 'B1') return []
    if (hydratedFloor !== active || !isFloorHydrated(active)) return []
    return floorDesks.map((desk) => {
      const position = workstationPosition(desk.floorId, desk.id)
      return { x: position.x, z: position.z, rot: 0 }
    })
  }, [active, floorDesks, hydratedFloor])
  const basementSlots = useMemo(() => {
    if (active !== 'B1') return []
    return floorDesks.map((desk) => {
      const position = workstationPosition(desk.floorId, desk.id)
      return { x: position.x, z: position.z, rot: position.rot }
    })
  }, [active, floorDesks])

  return (
    <>
      <FloorCut />
      {active && (
        <Suspense fallback={null}>
          <FloorStageCamera />
        </Suspense>
      )}
      <BasementPick />
      <Suspense fallback={<BlankSuspenseFallback />}>
        {spec && spec.level > 0 && (
          <JsonFloorInterior
            spec={spec}
            colors={colors}
            devices={floorDevices}
            showPeople={showCorridorPeople(quality)}
          />
        )}
        {spec && spec.level < 0 && <B1Interior slots={basementSlots} colors={colors} devices={floorDevices} />}
        {spec && spec.level > 0 && (
          <MonitorSamples
            floorId={spec.id}
            slots={slots}
            colors={colors}
            deskIds={floorDesks.map((desk) => desk.id)}
          />
        )}
        {/* 总览不挂 MonitorSamples；进单层才加载该 chunk。 */}
      </Suspense>
      <InteriorProbe floorId={active} dataDesks={floorDesks.length} />
    </>
  )
}
