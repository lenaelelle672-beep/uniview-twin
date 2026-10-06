import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { BoxGeometry, Color, type BufferGeometry } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { FloorSpec } from '../data/floors'
import type { Device } from '../types'
import { extrudeUp } from '../scene/extrude'
import { SLAB_M } from '../scene/stage/cut'
import { COLUMN_SIZE_M, columnGeometry, officeDeskGeometry } from '../scene/stage/geometry'
import type { Slot } from '../scene/stage/layout'
import { columnMaterial, coreWallMaterial, meetingGlassMaterial, slabMaterial, woodMaterial } from '../scene/stage/materials'
import { Ceiling } from '../scene/stage/Ceiling'
import { DeskFlash } from '../scene/stage/DeskFlash'
import { FloorDecor } from '../scene/stage/lazyFloorDecor'
import { MonitorDepthProxies } from '../scene/stage/MonitorDepthProxies'
import { InstancedSlots, Workstations } from '../scene/stage/Workstations'
import { loadFloorPlan, peekFloorPlan } from './loadFloor'
import { roomLabelsFromPlan } from './labels'
import type { FloorPlan, FloorWall } from './types'

const WALL_H = 2.55
const wallBoxGeometry = new BoxGeometry(1, WALL_H, 1)
wallBoxGeometry.translate(0, WALL_H / 2, 0)

function ringBounds(ring: Array<[number, number]>) {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const [x, z] of ring) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minZ = Math.min(minZ, z)
    maxZ = Math.max(maxZ, z)
  }
  return { minX, maxX, minZ, maxZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, w: maxX - minX, d: maxZ - minZ }
}

function wallSlots(walls: FloorWall[], kinds: Set<string>, thickness: number): Slot[] {
  const slots: Slot[] = []
  for (const wall of walls) {
    if (!kinds.has(wall.kind)) continue
    const dx = wall.b[0] - wall.a[0]
    const dz = wall.b[1] - wall.a[1]
    const length = Math.hypot(dx, dz)
    if (length < 0.12) continue
    slots.push({
      x: (wall.a[0] + wall.b[0]) / 2,
      z: (wall.a[1] + wall.b[1]) / 2,
      rot: Math.atan2(-dz, dx),
      sx: length,
      sz: thickness,
    })
  }
  return slots
}

function mergeCores(plan: FloorPlan, height: number): BufferGeometry | null {
  if (plan.cores.length === 0) return null
  const parts = plan.cores.map((core) => extrudeUp(core.polygon, height))
  const merged = mergeGeometries(parts)
  parts.forEach((geometry) => geometry.dispose())
  return merged
}

function JsonFloorReady({
  spec,
  plan,
  colors,
  devices,
  showPeople,
}: {
  spec: FloorSpec
  plan: FloorPlan
  colors: Color[]
  devices: Device[]
  showPeople: boolean
}) {
  const slots = useMemo<Slot[]>(() => plan.desks.map((desk) => ({ x: desk.x, z: desk.z, rot: desk.rot })), [plan])
  const columnSlots = useMemo<Slot[]>(
    () =>
      plan.columns.map((column) => ({
        x: column.x,
        z: column.z,
        rot: 0,
        sx: column.w / COLUMN_SIZE_M,
        sz: column.d / COLUMN_SIZE_M,
      })),
    [plan],
  )
  const opaqueWalls = useMemo(
    () => wallSlots(plan.walls, new Set(['wall', 'core-wall', 'shaft-wall', 'stair-wall', 'toilet-partition']), 0.12),
    [plan],
  )
  const glassWalls = useMemo(() => wallSlots(plan.walls, new Set(['glass']), 0.05), [plan])
  const officeSlots = useMemo<Slot[]>(
    () =>
      plan.officeDesks.map((desk) => ({
        x: desk.x,
        z: desk.z,
        rot: desk.rot,
        sx: desk.size[0],
        sz: desk.size[1],
      })),
    [plan],
  )
  const labels = useMemo(() => roomLabelsFromPlan(plan), [plan])
  const peoplePaths = useMemo(
    () => plan.walkPaths.map((path) => path.map(([x, z]) => ({ x, z }))),
    [plan],
  )
  const slab = useMemo(() => {
    const geometry = extrudeUp(plan.outline, SLAB_M)
    geometry.translate(0, -SLAB_M, 0)
    return geometry
  }, [plan])
  const cores = useMemo(() => mergeCores(plan, WALL_H), [plan])
  const bounds = useMemo(() => ringBounds(plan.outline), [plan])

  useEffect(() => {
    return () => {
      slab.dispose()
      cores?.dispose()
    }
  }, [cores, slab])

  useLayoutEffect(() => {
    window.__twinInterior = {
      floorId: spec.id,
      dataDesks: colors.length,
      renderedDesks: slots.length,
      jsonDesks: plan.desks.length,
      jsonColumns: plan.columns.length,
      walkPaths: plan.walkPaths.length,
      labels: labels.length,
      jsonOfficeDesks: plan.officeDesks.length,
      renderedOfficeDesks: officeSlots.length,
    }
    window.__twinFloor = {
      floorId: spec.id,
      desks: plan.desks.map((desk) => ({ id: desk.id, x: desk.x, z: desk.z, rot: desk.rot })),
      columns: plan.columns.map((column) => ({ id: column.id, x: column.x, z: column.z, w: column.w, d: column.d })),
      cores: plan.cores.map((core) => ({
        id: core.id,
        x: core.polygon.reduce((sum, point) => sum + point[0], 0) / core.polygon.length,
        z: core.polygon.reduce((sum, point) => sum + point[1], 0) / core.polygon.length,
        polygon: core.polygon,
      })),
    }
  }, [colors.length, labels.length, officeSlots.length, plan, slots.length, spec.id])

  return (
    <group
      name="FloorInterior"
      position={[0, spec.elevation + SLAB_M, 0]}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <group name="FloorPlate">
        <mesh name="FloorSlab" geometry={slab} material={slabMaterial} receiveShadow />
      </group>
      {cores && <mesh name="FloorCores" geometry={cores} material={coreWallMaterial} castShadow receiveShadow />}
      <InstancedSlots name="FloorColumns" geometry={columnGeometry} material={columnMaterial} slots={columnSlots} />
      <InstancedSlots name="FloorWalls" geometry={wallBoxGeometry} material={coreWallMaterial} slots={opaqueWalls} />
      <InstancedSlots
        name="FloorGlass"
        geometry={wallBoxGeometry}
        material={meetingGlassMaterial}
        slots={glassWalls}
        castShadow={false}
      />
      <Workstations slots={slots} colors={colors} />
      <InstancedSlots name="OfficeDesks" geometry={officeDeskGeometry} material={woodMaterial} slots={officeSlots} />
      <MonitorDepthProxies />
      <DeskFlash floorId={spec.id} />
      <FloorDecor floorId={spec.id} devices={devices} labels={labels} showPeople={showPeople} paths={peoplePaths} />
      <Ceiling
        width={Math.max(bounds.w, 8)}
        depth={Math.max(bounds.d, 8)}
        x={bounds.cx}
        z={bounds.cz}
        y={spec.height - SLAB_M - 0.06}
      />
    </group>
  )
}

export function JsonFloorInterior({
  spec,
  colors,
  devices,
  showPeople,
}: {
  spec: FloorSpec
  colors: Color[]
  devices: Device[]
  showPeople: boolean
}) {
  const [plan, setPlan] = useState<FloorPlan | null>(() => peekFloorPlan(spec.id) ?? null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const cached = peekFloorPlan(spec.id)
    if (cached) setPlan(cached)
    setError(null)
    void loadFloorPlan(spec.id)
      .then((next) => {
        if (!cancelled) setPlan(next)
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : `无法加载楼层图纸：${spec.id}`)
      })
    return () => {
      cancelled = true
    }
  }, [spec.id])

  useLayoutEffect(() => {
    if (error) {
      window.__twinInterior = {
        floorId: spec.id,
        dataDesks: colors.length,
        renderedDesks: 0,
        error,
      }
    }
  }, [colors.length, error, spec.id])

  if (!plan || plan.floorId !== spec.id) return null
  return <JsonFloorReady spec={spec} plan={plan} colors={colors} devices={devices} showPeople={showPeople} />
}
