import {
  BoxGeometry,
  Color,
  Group,
  InstancedMesh,
  Mesh,
  Object3D,
  type BufferGeometry,
  type Material,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { FloorSpec } from '../data/floors'
import { extrudeUp } from '../scene/extrude'
import { SLAB_M } from '../scene/stage/cut'
import { COLUMN_SIZE_M, columnGeometry, deskChairGeometry, deskGeometry, monitorGeometry, officeDeskGeometry } from '../scene/stage/geometry'
import type { Slot } from '../scene/stage/layout'
import {
  columnMaterial,
  coreWallMaterial,
  deskMaterial,
  chairMaterial,
  meetingGlassMaterial,
  monitorMaterial,
  slabMaterial,
  woodMaterial,
  MONITOR_DISPLAY_COLOR,
} from '../scene/stage/materials'
import { ALARM_MARKER_ORDER, MONITOR_LAYER } from '../scene/overlayOrder'
import { INTERIOR_WALL_H } from './interiorWall'
import type { FloorPlan, FloorWall } from './types'

const WALL_H = INTERIOR_WALL_H
const wallBoxGeometry = new BoxGeometry(1, WALL_H, 1)
wallBoxGeometry.translate(0, WALL_H / 2, 0)

const dummy = new Object3D()

export type PrebuiltInterior = {
  floorId: string
  content: Group
  monitors: InstancedMesh | null
  uploaded: boolean
}

const cache = new Map<string, PrebuiltInterior>()

export function peekPrebuiltInterior(floorId: string): PrebuiltInterior | null {
  return cache.get(floorId) ?? null
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

const FILL_CHUNK = 200

function writeSlot(mesh: InstancedMesh, index: number, slot: Slot, colors?: Color[]) {
  dummy.position.set(slot.x, 0, slot.z)
  dummy.rotation.set(0, slot.rot, 0)
  dummy.scale.set(slot.sx ?? 1, slot.sy ?? 1, slot.sz ?? 1)
  dummy.updateMatrix()
  mesh.setMatrixAt(index, dummy.matrix)
  if (colors) mesh.setColorAt(index, colors[index] ?? colors[0] ?? MONITOR_DISPLAY_COLOR.offline)
}

function finishInstances(mesh: InstancedMesh, count: number) {
  mesh.count = count
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  mesh.computeBoundingSphere()
  mesh.frustumCulled = false
  mesh.castShadow = true
  mesh.receiveShadow = true
}

function fillInstances(mesh: InstancedMesh, slots: Slot[], colors?: Color[]) {
  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index]
    if (!slot) continue
    writeSlot(mesh, index, slot, colors)
  }
  finishInstances(mesh, slots.length)
}

function addInstances(
  parent: Group,
  name: string,
  geometry: BufferGeometry,
  material: Material,
  slots: Slot[],
  options?: { colors?: Color[]; castShadow?: boolean; renderOrder?: number; layer?: number },
): InstancedMesh | null {
  if (slots.length === 0) return null
  const mesh = new InstancedMesh(geometry, material, slots.length)
  mesh.name = name
  fillInstances(mesh, slots, options?.colors)
  if (options?.castShadow === false) mesh.castShadow = false
  if (options?.renderOrder) mesh.renderOrder = options.renderOrder
  if (options?.layer != null) mesh.layers.set(options.layer)
  parent.add(mesh)
  return mesh
}

function addSlab(content: Group, plan: FloorPlan) {
  const slab = extrudeUp(plan.outline, SLAB_M)
  slab.translate(0, -SLAB_M, 0)
  const plate = new Group()
  plate.name = 'FloorPlate'
  const slabMesh = new Mesh(slab, slabMaterial)
  slabMesh.name = 'FloorSlab'
  slabMesh.receiveShadow = true
  slabMesh.frustumCulled = false
  plate.add(slabMesh)
  content.add(plate)
}

function addStructure(content: Group, plan: FloorPlan): InstancedMesh | null {
  const cores = mergeCores(plan, WALL_H)
  if (cores) {
    const coreMesh = new Mesh(cores, coreWallMaterial)
    coreMesh.name = 'FloorCores'
    coreMesh.castShadow = true
    coreMesh.receiveShadow = true
    coreMesh.frustumCulled = false
    content.add(coreMesh)
  }

  const columnSlots = plan.columns.map((column) => ({
    x: column.x,
    z: column.z,
    rot: 0,
    sx: column.w / COLUMN_SIZE_M,
    sz: column.d / COLUMN_SIZE_M,
  }))
  const opaqueWalls = wallSlots(plan.walls, new Set(['wall', 'core-wall', 'shaft-wall', 'stair-wall', 'toilet-partition']), 0.12)
  const glassWalls = wallSlots(plan.walls, new Set(['glass']), 0.05)
  const deskSlots = plan.desks.map((desk) => ({ x: desk.x, z: desk.z, rot: desk.rot }))
  const officeSlots = plan.officeDesks.map((desk) => ({
    x: desk.x,
    z: desk.z,
    rot: desk.rot,
    sx: desk.size[0],
    sz: desk.size[1],
  }))
  const offline = plan.desks.map(() => MONITOR_DISPLAY_COLOR.offline)

  addInstances(content, 'FloorColumns', columnGeometry, columnMaterial, columnSlots)
  addInstances(content, 'FloorWalls', wallBoxGeometry, coreWallMaterial, opaqueWalls)
  addInstances(content, 'FloorGlass', wallBoxGeometry, meetingGlassMaterial, glassWalls, { castShadow: false })
  const stations = new Group()
  stations.name = 'Workstations'
  addInstances(stations, 'WorkstationDesks', deskGeometry, deskMaterial, deskSlots)
  addInstances(stations, 'WorkstationChairs', deskChairGeometry, chairMaterial, deskSlots)
  const monitors = addInstances(stations, 'WorkstationMonitors', monitorGeometry, monitorMaterial, deskSlots, {
    colors: offline,
    renderOrder: ALARM_MARKER_ORDER,
    layer: MONITOR_LAYER,
  })
  if (stations.children.length > 0) content.add(stations)
  addInstances(content, 'OfficeDesks', officeDeskGeometry, woodMaterial, officeSlots)
  return monitors
}

function storeInterior(spec: FloorSpec, content: Group, monitors: InstancedMesh | null): PrebuiltInterior {
  const built: PrebuiltInterior = { floorId: spec.id, content, monitors, uploaded: false }
  cache.set(spec.id, built)
  return built
}

/** 各层自己的楼板、核心筒、墙/柱/工位实例。材质仍是模块单例。建过的层直接返回同一组对象。 */
export function buildPrebuiltInterior(spec: FloorSpec, plan: FloorPlan): PrebuiltInterior {
  const cached = cache.get(spec.id)
  if (cached) return cached
  const content = new Group()
  content.name = 'FloorInteriorStatic'
  addSlab(content, plan)
  return storeInterior(spec, content, addStructure(content, plan))
}

async function addInstancesChunked(
  parent: Group,
  name: string,
  geometry: BufferGeometry,
  material: Material,
  slots: Slot[],
  breathe: () => Promise<void>,
  options?: { colors?: Color[]; castShadow?: boolean; renderOrder?: number; layer?: number },
): Promise<InstancedMesh | null> {
  if (slots.length === 0) return null
  const mesh = new InstancedMesh(geometry, material, slots.length)
  mesh.name = name
  for (let start = 0; start < slots.length; start += FILL_CHUNK) {
    if (start > 0) await breathe()
    const end = Math.min(slots.length, start + FILL_CHUNK)
    for (let index = start; index < end; index += 1) {
      const slot = slots[index]
      if (!slot) continue
      writeSlot(mesh, index, slot, options?.colors)
    }
  }
  finishInstances(mesh, slots.length)
  if (options?.castShadow === false) mesh.castShadow = false
  if (options?.renderOrder) mesh.renderOrder = options.renderOrder
  if (options?.layer != null) mesh.layers.set(options.layer)
  parent.add(mesh)
  return mesh
}

/** 楼板、核心筒、墙和工位拆到多帧，单帧留在总览空闲预算内。 */
export async function buildPrebuiltInteriorSliced(
  spec: FloorSpec,
  plan: FloorPlan,
  breathe: () => Promise<void>,
): Promise<PrebuiltInterior> {
  const cached = cache.get(spec.id)
  if (cached) return cached
  const content = new Group()
  content.name = 'FloorInteriorStatic'
  addSlab(content, plan)
  await breathe()
  if (cache.get(spec.id)) return cache.get(spec.id)!
  const cores = mergeCores(plan, WALL_H)
  if (cores) {
    const coreMesh = new Mesh(cores, coreWallMaterial)
    coreMesh.name = 'FloorCores'
    coreMesh.castShadow = true
    coreMesh.receiveShadow = true
    coreMesh.frustumCulled = false
    content.add(coreMesh)
  }
  await breathe()
  const columnSlots = plan.columns.map((column) => ({
    x: column.x,
    z: column.z,
    rot: 0,
    sx: column.w / COLUMN_SIZE_M,
    sz: column.d / COLUMN_SIZE_M,
  }))
  const opaqueWalls = wallSlots(plan.walls, new Set(['wall', 'core-wall', 'shaft-wall', 'stair-wall', 'toilet-partition']), 0.12)
  const glassWalls = wallSlots(plan.walls, new Set(['glass']), 0.05)
  const deskSlots = plan.desks.map((desk) => ({ x: desk.x, z: desk.z, rot: desk.rot }))
  const officeSlots = plan.officeDesks.map((desk) => ({
    x: desk.x,
    z: desk.z,
    rot: desk.rot,
    sx: desk.size[0],
    sz: desk.size[1],
  }))
  const offline = plan.desks.map(() => MONITOR_DISPLAY_COLOR.offline)
  await breathe()
  await addInstancesChunked(content, 'FloorColumns', columnGeometry, columnMaterial, columnSlots, breathe)
  await addInstancesChunked(content, 'FloorWalls', wallBoxGeometry, coreWallMaterial, opaqueWalls, breathe)
  await addInstancesChunked(content, 'FloorGlass', wallBoxGeometry, meetingGlassMaterial, glassWalls, breathe, {
    castShadow: false,
  })
  const stations = new Group()
  stations.name = 'Workstations'
  await addInstancesChunked(stations, 'WorkstationDesks', deskGeometry, deskMaterial, deskSlots, breathe)
  await addInstancesChunked(stations, 'WorkstationChairs', deskChairGeometry, chairMaterial, deskSlots, breathe)
  const monitors = await addInstancesChunked(stations, 'WorkstationMonitors', monitorGeometry, monitorMaterial, deskSlots, breathe, {
    colors: offline,
    renderOrder: ALARM_MARKER_ORDER,
    layer: MONITOR_LAYER,
  })
  if (stations.children.length > 0) content.add(stations)
  await addInstancesChunked(content, 'OfficeDesks', officeDeskGeometry, woodMaterial, officeSlots, breathe)
  if (cache.get(spec.id)) return cache.get(spec.id)!
  return storeInterior(spec, content, monitors)
}

export function markInteriorUploaded(floorId: string) {
  const built = cache.get(floorId)
  if (built) built.uploaded = true
}

/** 进层只改实例色，不新建 InstancedMesh。 */
export function paintMonitorColors(built: PrebuiltInterior, colors: Color[]) {
  const mesh = built.monitors
  if (!mesh || colors.length === 0) return
  const limit = Math.min(mesh.count, colors.length)
  for (let index = 0; index < limit; index += 1) {
    const color = colors[index]
    if (color) mesh.setColorAt(index, color)
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
}
