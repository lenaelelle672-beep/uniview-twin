import { useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo } from 'react'
import { InstancedMesh } from 'three'
import { floorSpec } from '../../data/floors'
import { COURTYARD } from '../siteGeometry'
import { useTwinStore } from '../../store/store'
import type { DeviceStatus } from '../../types'
import { B1Interior } from './B1Interior'
import { showCorridorPeople } from './corridor'
import { activeFloorId } from './cut'
import { FloorCut } from './FloorCut'
import { FloorStageCamera } from './FloorStageCamera'
import { STATUS_COLOR } from './status'
import { workstationPosition } from './workstationPosition'
import { TowerInterior } from './TowerInterior'

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
    if (!floorId) {
      delete window.__twinInterior
      return
    }
    const mesh = scene.getObjectByName('WorkstationDesks') as InstancedMesh | undefined
    window.__twinInterior = {
      floorId,
      dataDesks,
      renderedDesks: mesh?.count ?? 0,
    }
  }, [dataDesks, floorId, scene])
  return null
}

function BasementPick() {
  const enterFloor = useTwinStore((state) => state.enterFloor)
  const inside = useTwinStore((state) => state.view === 'floor')
  if (inside) return null
  return (
    <mesh
      name="B1Pick"
      rotation={[-Math.PI / 2, 0, 0]}
      position={[COURTYARD.cx, 0.42, COURTYARD.cz]}
      onDoubleClick={(event) => {
        event.stopPropagation()
        enterFloor('B1')
      }}
    >
      <circleGeometry args={[COURTYARD.rx * 0.78, 28]} />
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
  const slots = useMemo(() => {
    if (!active) return []
    // D027：不读 desk.x/y/z。落点只来自 workstationPosition。
    return floorDesks.map((desk) => {
      const position = workstationPosition(desk.floorId, desk.id)
      return { x: position.x, z: position.z, rot: 0 }
    })
  }, [active, floorDesks])
  const colors = useMemo(() => {
    const byDesk = new Map<string, DeviceStatus>()
    for (const device of devices) {
      if (device.type === 'pc' && device.deskId) byDesk.set(device.deskId, device.status)
    }
    return floorDesks.map((desk) => STATUS_COLOR[byDesk.get(desk.id) ?? 'offline'])
  }, [devices, floorDesks])
  const floorDevices = useMemo(() => {
    if (!active) return []
    return devices.filter((device) => device.floorId === active)
  }, [active, devices])
  const spec = active ? floorSpec(active) : null

  return (
    <>
      <FloorCut />
      <FloorStageCamera />
      <BasementPick />
      {spec && spec.level > 0 && (
        <TowerInterior
          spec={spec}
          slots={slots}
          colors={colors}
          devices={floorDevices}
          showPeople={showCorridorPeople(quality)}
        />
      )}
      {spec && spec.level < 0 && <B1Interior slots={slots} colors={colors} devices={floorDevices} />}
      <InteriorProbe floorId={active} dataDesks={floorDesks.length} />
    </>
  )
}
