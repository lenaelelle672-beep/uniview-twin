import { Line } from '@react-three/drei/core/Line'
import { useFrame, useThree } from '@react-three/fiber'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { PerspectiveCamera, Vector3, type Camera, type Object3D } from 'three'
import { searchWorkstations } from '../../locate/search'
import { resolveWorkstationRef } from '../../locate/ref'
import { pointInRing } from '../../floors/parsePlan'
import { useTwinStore } from '../../store/store'
import { classifyRoomLabel } from '../../floors/labelTier'
import {
  avoidLabels,
  labelScreenBox,
  tier2Stats,
  type AvoidItem,
  type AvoidPlacement,
  type AvoidResult,
  type LabelPackState,
} from './labelAvoidance'
import {
  baselineAngleDeg,
  countOverlapKinds,
  findRoomLabelBatch,
  isDrawnText,
  overlapDepth,
  overlapPairNames,
  pickOverlapVictim,
  visibilityMismatch,
} from './labelScreenMeasure'
import type { LabelBatchApi } from './BatchedRoomLabels'
import {
  LABEL_MAX_PX,
  LABEL_MIN_PX,
  labelFadeForTarget,
  roomLabelCharacters,
  roomLabelOutlineWidth,
  type RoomLabel,
} from './roomLabels'
import { workstationPosition } from './workstationPosition'

const BatchedRoomLabels = lazy(async () => {
  const mod = await import('./textRuntime')
  return { default: mod.BatchedRoomLabels }
})

/** 1366 单层目标屏上字高；全层最大夹在 LABEL_MIN/MAX。 */
export const LABEL_TARGET_PX = 16

const sample = new Vector3()
const deskSample = new Vector3()
const emTop = new Vector3()
const emBottom = new Vector3()
const ndcTop = new Vector3()
const ndcBottom = new Vector3()
const viewTop = new Vector3()
const viewBottom = new Vector3()
const offsetWorld = new Vector3()

function offsetToLocal(
  base: [number, number, number],
  ox: number,
  oy: number,
  host: Object3D | null,
  camera: Camera,
  viewport: { width: number; height: number },
): [number, number, number] {
  if (ox === 0 && oy === 0) return base
  offsetWorld.set(base[0], base[1], base[2])
  host?.localToWorld(offsetWorld)
  offsetWorld.project(camera)
  offsetWorld.x += (ox / Math.max(viewport.width, 1)) * 2
  offsetWorld.y -= (oy / Math.max(viewport.height, 1)) * 2
  offsetWorld.unproject(camera)
  host?.worldToLocal(offsetWorld)
  return [offsetWorld.x, offsetWorld.y, offsetWorld.z]
}

export function projectedEmHeightPx(
  topWorld: Vector3,
  bottomWorld: Vector3,
  camera: Camera,
  viewport: { width: number; height: number },
): number {
  viewTop.copy(topWorld).applyMatrix4(camera.matrixWorldInverse)
  viewBottom.copy(bottomWorld).applyMatrix4(camera.matrixWorldInverse)
  if (viewTop.z >= -0.08 || viewBottom.z >= -0.08) return 0
  ndcTop.copy(topWorld).project(camera)
  ndcBottom.copy(bottomWorld).project(camera)
  if (!Number.isFinite(ndcTop.x) || !Number.isFinite(ndcBottom.x)) return 0
  if (Math.abs(ndcTop.x) > 1.2 || Math.abs(ndcBottom.x) > 1.2) return 0
  if (Math.abs(ndcTop.y) > 1.2 || Math.abs(ndcBottom.y) > 1.2) return 0
  const dx = (ndcTop.x - ndcBottom.x) * 0.5 * viewport.width
  const dy = (ndcTop.y - ndcBottom.y) * 0.5 * viewport.height
  const px = Math.hypot(dx, dy)
  return Number.isFinite(px) ? px : 0
}

/** 用当前世界字号的本地竖直 em 段（±fontSize/2）取全层最大屏上字高。 */
export function maxProjectedEmPx(
  host: Object3D | null,
  labels: Array<{ label: [number, number, number] }>,
  camera: Camera,
  viewport: { width: number; height: number },
  fontSize: number,
): { maxPx: number; nearest: number } {
  const half = Math.max(fontSize, 1e-4) / 2
  let maxPx = 0
  let nearest = Infinity
  for (const item of labels) {
    sample.set(item.label[0], item.label[1], item.label[2])
    emTop.set(item.label[0], item.label[1] + half, item.label[2])
    emBottom.set(item.label[0], item.label[1] - half, item.label[2])
    if (host) {
      host.localToWorld(sample)
      host.localToWorld(emTop)
      host.localToWorld(emBottom)
    }
    nearest = Math.min(nearest, camera.position.distanceTo(sample))
    maxPx = Math.max(maxPx, projectedEmHeightPx(emTop, emBottom, camera, viewport))
  }
  return { maxPx, nearest }
}

export function worldFontSizeFromProjectedEm(
  currentFontSize: number,
  currentMaxPx: number,
  targetPx = LABEL_TARGET_PX,
  minPx = LABEL_MIN_PX,
  maxPx = LABEL_MAX_PX,
): number {
  if (!(currentMaxPx > 1e-6) || !(currentFontSize > 0)) return currentFontSize || 0.78
  const want = Math.min(maxPx, Math.max(minPx, targetPx))
  return currentFontSize * (want / currentMaxPx)
}

function placementRow(
  label: RoomLabel,
  item: AvoidItem | undefined,
  place: AvoidPlacement | undefined,
): TwinLabelD243Row {
  const offsetX = place?.offsetX ?? 0
  const offsetY = place?.offsetY ?? 0
  return {
    id: label.id,
    text: label.text,
    wx: label.label[0],
    wz: label.label[2],
    sx: item?.x ?? 0,
    sy: item?.y ?? 0,
    w: place?.box.w ?? item?.w ?? 0,
    h: place?.box.h ?? item?.h ?? 0,
    offsetX,
    offsetY,
    offsetLen: Math.hypot(offsetX, offsetY),
    visible: Boolean(place?.visible),
    cluster: place?.cluster ?? null,
  }
}

function visibleOverlapBoxes(
  labels: RoomLabel[],
  items: AvoidItem[],
  avoided: AvoidResult,
): NonNullable<Window['__twinLabelOverlap']>['visible'] {
  const byLabel = new Map(labels.map((label) => [label.id, label]))
  const byItem = new Map(items.map((item) => [item.id, item]))
  const visible: NonNullable<Window['__twinLabelOverlap']>['visible'] = []
  for (const row of avoided.placements) {
    if (!row.visible) continue
    const label = byLabel.get(row.id)
    const item = byItem.get(row.id)
    if (!label || !item) continue
    visible.push({
      id: row.id,
      text: label.text,
      sx: row.box.x + row.box.w / 2,
      sy: row.box.y + row.box.h / 2,
      w: row.box.w,
      h: row.box.h,
      offsetX: row.offsetX,
      offsetY: row.offsetY,
      cluster: null,
      wx: label.label[0],
      wz: label.label[2],
    })
  }
  for (const cluster of avoided.clusters) {
    const members = cluster.ids.map((id) => byLabel.get(id)).filter((label): label is RoomLabel => Boolean(label))
    visible.push({
      id: `cluster:${cluster.key}`,
      text: cluster.text,
      sx: cluster.box.x + cluster.box.w / 2,
      sy: cluster.box.y + cluster.box.h / 2,
      w: cluster.box.w,
      h: cluster.box.h,
      offsetX: cluster.offsetX,
      offsetY: cluster.offsetY,
      cluster: cluster.key,
      wx: members.length ? members.reduce((sum, label) => sum + label.label[0], 0) / members.length : 0,
      wz: members.length ? members.reduce((sum, label) => sum + label.label[2], 0) / members.length : 0,
    })
  }
  return visible
}

function diagnoseRestCorridor(labels: RoomLabel[], items: AvoidItem[], avoided: AvoidResult): TwinLabelD243 | undefined {
  const restLabel = labels.find((label) => label.text === '客户休息室')
  if (!restLabel) return undefined
  const byItem = new Map(items.map((item) => [item.id, item]))
  const byPlace = new Map(avoided.placements.map((row) => [row.id, row]))
  const rest = placementRow(restLabel, byItem.get(restLabel.id), byPlace.get(restLabel.id))
  const corridors = labels
    .filter((label) => label.text === '外廊')
    .map((label) => placementRow(label, byItem.get(label.id), byPlace.get(label.id)))
  let nearestWorldM: number | null = null
  let nearest: TwinLabelD243Row | null = null
  for (const row of corridors) {
    const worldM = Math.hypot(row.wx - rest.wx, row.wz - rest.wz)
    if (nearestWorldM == null || worldM < nearestWorldM) {
      nearestWorldM = worldM
      nearest = row
    }
  }
  const cluster = avoided.clusters.find((row) => row.key === '外廊')
  const nearestAnchorPx = nearest ? Math.hypot(nearest.sx - rest.sx, nearest.sy - rest.sy) : null
  const restPlacedX = rest.sx + rest.offsetX
  const restPlacedY = rest.sy + rest.offsetY
  const otherPlacedX = cluster ? cluster.x : nearest ? nearest.sx + nearest.offsetX : null
  const otherPlacedY = cluster ? cluster.y : nearest ? nearest.sy + nearest.offsetY : null
  const nearestPlacedPx =
    otherPlacedX == null || otherPlacedY == null ? null : Math.hypot(otherPlacedX - restPlacedX, otherPlacedY - restPlacedY)
  const restOffsetLen = rest.offsetLen
  const corridorOffsetLen = nearest?.offsetLen ?? null
  let cause = 'none'
  if (nearest && nearestAnchorPx != null && nearestPlacedPx != null) {
    if (cluster && Math.hypot(cluster.x - restPlacedX, cluster.y - restPlacedY) < 48) cause = 'cluster-centroid'
    else if (Math.max(restOffsetLen, corridorOffsetLen ?? 0) > 40 && nearestPlacedPx < 36) cause = 'avoidance-offset'
    else if (nearestAnchorPx < 48 && nearestWorldM != null && nearestWorldM > 10) cause = 'projection'
    else if (rest.w / 2 + (nearest.w ?? 0) / 2 > (nearestPlacedPx || nearestAnchorPx)) cause = 'wide-box'
    else if (nearestPlacedPx < 8) cause = 'stacked-other'
    else cause = 'separated'
  }
  return {
    rest,
    corridors,
    nearestWorldM,
    nearestAnchorPx,
    nearestPlacedPx,
    restBoxW: rest.w,
    corridorBoxW: nearest?.w ?? cluster?.box.w ?? null,
    restOffsetLen,
    corridorOffsetLen,
    cause,
  }
}

function deskInRoom(floorId: string, deskId: string, polygon: Array<[number, number]> | null | undefined): boolean {
  if (!polygon || polygon.length < 3) return false
  try {
    const place = workstationPosition(floorId, deskId)
    return pointInRing(place.x, place.z, polygon)
  } catch {
    return false
  }
}

export function RoomLabels({ floorId, labels }: { floorId: string; labels: RoomLabel[] }) {
  const { camera, scene, size, pointer } = useThree()
  const [fontSize, setFontSize] = useState(0)
  const sizedRef = useRef(false)
  const pxRef = useRef(0)
  const fadesRef = useRef<number[]>([])
  const packRef = useRef<LabelPackState>({ byId: {}, clusters: {} })
  const layoutRef = useRef<LabelPackState>({ byId: {}, clusters: {} })
  const measureRef = useRef<LabelBatchApi | null>(null)
  const viewKeyRef = useRef('')
  const clusterSyncedRef = useRef('')
  const packedRef = useRef<AvoidResult | null>(null)
  const idleRef = useRef(0)
  const stripRef = useRef(false)
  const itemsRef = useRef<AvoidItem[]>([])
  const hoverIdRef = useRef<string | null>(null)
  const cameraRef = useRef(camera)
  const sizeRef = useRef(size)
  const characters = roomLabelCharacters(labels)
  const points = labels.flatMap((label) => [label.anchor, label.label])
  cameraRef.current = camera
  sizeRef.current = size

  useEffect(() => {
    sizedRef.current = false
    setFontSize(0)
    clusterSyncedRef.current = ''
    viewKeyRef.current = ''
    packedRef.current = null
    layoutRef.current = { byId: {}, clusters: {} }
    stripRef.current = false
    itemsRef.current = []
  }, [floorId])

  useEffect(() => {
    const read = () => {
      const packed = packedRef.current
      if (!packed) return undefined
      const perspective = cameraRef.current as PerspectiveCamera
      const viewport = sizeRef.current
      const api = measureRef.current
      const byId = packRef.current.byId
      const clusters = packRef.current.clusters
      const live = api?.ready ? api.measureVisible(perspective, viewport) : []
      const kinds = countOverlapKinds(live.map((row) => row.box))
      const expected = new Set<string>()
      for (const [id, row] of Object.entries(byId)) if (row.visible) expected.add(id)
      for (const [key, row] of Object.entries(clusters)) if (row.visible) expected.add(`cluster:${key}`)
      const actual = new Set(live.map((row) => row.id))
      const mismatchIds = visibilityMismatch(expected, actual)
      let maxAngle = 0
      const batch = findRoomLabelBatch(scene)
      if (batch) {
        batch.updateWorldMatrix(true, false)
        const members = (batch as { _members?: Map<{ textRenderInfo?: { blockBounds?: number[] }; matrix: import('three').Matrix4 }, unknown> })._members
        if (members) {
          for (const text of members.keys()) {
            if (!isDrawnText(text as unknown as { scale: { x: number }; fillOpacity?: number })) continue
            const bounds = text.textRenderInfo?.blockBounds
            if (!bounds) continue
            const deg = baselineAngleDeg(bounds, batch.matrixWorld, text.matrix, perspective, viewport)
            if (deg != null) maxAngle = Math.max(maxAngle, Math.abs(deg))
          }
        }
      }
      return {
        merged: packed.merged,
        hidden: packed.hidden,
        hiddenAfterZoom: packed.hiddenAfterZoom,
        overlapPairs: kinds.strong,
        grazePairs: kinds.graze,
        mismatch: mismatchIds.length,
        mismatchIds,
        maxAngle,
        maxOffset: packed.maxOffset,
        visible: visibleOverlapBoxes(labels, itemsRef.current, packed),
        d243: diagnoseRestCorridor(labels, itemsRef.current, packed),
        tier2: tier2Stats(itemsRef.current, packed),
        measured: live,
        pairs: overlapPairNames(live),
        region: live.filter((row) => {
          const x0 = row.box.x
          const y0 = row.box.y
          const x1 = row.box.x + row.box.w
          const y1 = row.box.y + row.box.h
          return x0 < 620 && x1 > 500 && y0 < 360 && y1 > 280
        }),
        hiddenL2: itemsRef.current
          .filter((item) => item.tier === 2)
          .map((item) => {
            const row = packed.placements.find((place) => place.id === item.id)
            return { id: item.id, text: item.text, area: item.area, visible: Boolean(row?.visible), cluster: row?.cluster ?? null }
          })
          .filter((row) => !row.visible && !row.cluster),
      }
    }
    Object.defineProperty(window, '__twinLabelOverlap', {
      configurable: true,
      enumerable: true,
      get: read,
    })
    return () => {
      delete window.__twinLabelOverlap
    }
  }, [labels, scene])

  useFrame(() => {
    if (labels.length === 0) return
    const perspective = camera as PerspectiveCamera
    const interior = scene.getObjectByName('FloorInterior')
    const host = scene.getObjectByName('RoomLabelBatch') ?? interior
    const api = measureRef.current
    const rig = window.__twinRig as (Window['__twinRig'] & { currentAction?: number }) | undefined
    const dragging = (rig?.currentAction ?? 0) !== 0
    if (!sizedRef.current) {
      host?.updateWorldMatrix(true, false)
      perspective.updateMatrixWorld()
      const { maxPx } = maxProjectedEmPx(host ?? null, labels, perspective, size, 0.78)
      if (maxPx > 1e-6) {
        setFontSize(worldFontSizeFromProjectedEm(0.78, maxPx))
        sizedRef.current = true
      }
      return
    }
    const state = useTwinStore.getState()
    const viewKey = `${floorId}|${state.focusedDeskId ?? ''}|${state.searchQuery}|${size.width}|${state.devices
      .filter((device) => device.floorId === floorId && device.status === 'alarm')
      .map((device) => device.id)
      .join(',')}`
    let shouldPack = false
    if (dragging) {
      idleRef.current = -1
    } else if (idleRef.current === -1) {
      shouldPack = true
      idleRef.current = 0
    } else if (viewKey !== viewKeyRef.current || !packedRef.current) {
      shouldPack = true
    }
    if (shouldPack && api?.ready) {
      host?.updateWorldMatrix(true, false)
      perspective.updateMatrixWorld()
      api.orientToCamera(perspective)
      const { maxPx: currentMaxPx, nearest } = maxProjectedEmPx(host ?? null, labels, perspective, size, fontSize || 0.78)
      const px = currentMaxPx > 1e-6 ? currentMaxPx : pxRef.current || LABEL_MIN_PX
      pxRef.current = px
      const focused = state.focusedDeskId
      const target = focused ? resolveWorkstationRef(focused) : null
      let deskX = NaN
      let deskY = NaN
      if (target && target.floorId === floorId && interior) {
        try {
          const place = workstationPosition(target.floorId, target.deskId)
          deskSample.set(place.x, 0.55, place.z)
          interior.localToWorld(deskSample)
          deskSample.project(perspective)
          deskX = (deskSample.x * 0.5 + 0.5) * size.width
          deskY = (-deskSample.y * 0.5 + 0.5) * size.height
        } catch {
          deskX = NaN
        }
      }
      const fades = fadesRef.current
      fades.length = labels.length
      const searchHits =
        state.searchQuery.trim() === ''
          ? []
          : searchWorkstations({ desks: state.desks, people: state.people }, state.searchQuery, 40).filter(
              (hit) => hit.floorId === floorId,
            )
      const alarmDesks = state.devices
        .filter((device) => device.floorId === floorId && device.status === 'alarm' && device.deskId)
        .map((device) => device.deskId as string)
      const remes = api.measureForAvoid(perspective, size, labels)
      const items: AvoidItem[] = []
      for (let i = 0; i < labels.length; i += 1) {
        const label = labels[i]
        if (!label) continue
        if (!Number.isFinite(deskX) || !interior) fades[i] = 1
        else {
          sample.set(label.label[0], label.label[1], label.label[2])
          interior.localToWorld(sample)
          sample.project(perspective)
          fades[i] = labelFadeForTarget(
            { x: (sample.x * 0.5 + 0.5) * size.width, y: (-sample.y * 0.5 + 0.5) * size.height },
            { x: deskX, y: deskY },
            px,
          )
        }
        sample.set(label.label[0], label.label[1], label.label[2])
        host?.localToWorld(sample)
        sample.project(perspective)
        if (!Number.isFinite(sample.x) || sample.z > 1 || Math.abs(sample.x) > 1.25 || Math.abs(sample.y) > 1.25) continue
        const sx = (sample.x * 0.5 + 0.5) * size.width
        const sy = (-sample.y * 0.5 + 0.5) * size.height
        const found = remes.get(label.id)
        const box = found ?? labelScreenBox(label.text, Math.max(px, LABEL_MIN_PX))
        const alarm = alarmDesks.some((deskId) => deskInRoom(floorId, deskId, label.polygon))
        const selected = Boolean(focused && deskInRoom(floorId, focused, label.polygon))
        const searchHit =
          searchHits.some((hit) => deskInRoom(floorId, hit.deskId, label.polygon)) ||
          (state.searchQuery.trim() !== '' && label.text.toLowerCase().includes(state.searchQuery.trim().toLowerCase()))
        const cls = classifyRoomLabel(label.sourceName ?? label.text, label.area ?? 0)
        const locked = alarm || selected || searchHit
        items.push({
          id: label.id,
          text: label.text,
          x: found?.x ?? sx,
          y: found?.y ?? sy,
          w: box.w,
          h: box.h,
          priority: alarm ? 0 : locked ? 1 : cls.tier,
          locked,
          area: cls.area || (label.area ?? 0),
          tier: cls.tier,
        })
      }
      const clusterSizes: Record<string, { w: number; h: number }> = {}
      for (const [id, box] of remes) {
        if (!id.startsWith('cluster:')) continue
        clusterSizes[id.slice('cluster:'.length)] = { w: box.w, h: box.h }
      }
      const keepTier2 = Math.max(size.width, window.innerWidth || 0) >= 1366
      const avoided = avoidLabels(items, clusterSizes, keepTier2)
      packedRef.current = avoided
      itemsRef.current = items
      const byId: LabelPackState['byId'] = {}
      const clusters: LabelPackState['clusters'] = {}
      for (const label of labels) {
        byId[label.id] = { visible: false, cluster: null, offsetX: 0, offsetY: 0, local: label.label }
      }
      for (const row of avoided.placements) {
        const label = labels.find((item) => item.id === row.id)
        const base = label?.label ?? [row.box.x, 3.2, row.box.y]
        byId[row.id] = {
          visible: row.visible,
          cluster: row.cluster,
          offsetX: row.offsetX,
          offsetY: row.offsetY,
          local: offsetToLocal(base, row.offsetX, row.offsetY, host ?? null, perspective, size),
        }
      }
      for (const cluster of avoided.clusters) {
        const members = labels.filter((label) => cluster.ids.includes(label.id))
        if (members.length === 0) continue
        const world: [number, number, number] = [
          members.reduce((sum, label) => sum + label.label[0], 0) / members.length,
          members.reduce((sum, label) => sum + label.label[1], 0) / members.length,
          members.reduce((sum, label) => sum + label.label[2], 0) / members.length,
        ]
        clusters[cluster.key] = {
          visible: true,
          offsetX: cluster.offsetX,
          offsetY: cluster.offsetY,
          world,
          local: offsetToLocal(world, cluster.offsetX, cluster.offsetY, host ?? null, perspective, size),
          text: cluster.text,
        }
      }
      if (keepTier2) {
        for (const item of items) {
          if (item.tier !== 2) continue
          const state = byId[item.id]
          if (state && !state.visible && !state.cluster) {
            state.visible = true
            const row = avoided.placements.find((place) => place.id === item.id)
            if (row) {
              row.visible = true
              row.cluster = null
            }
          }
        }
      }
      layoutRef.current = { byId, clusters }
      packRef.current = { byId, clusters }
      viewKeyRef.current = viewKey
      clusterSyncedRef.current = 'once'
      stripRef.current = true
      hoverIdRef.current = null
      window.__twinLabelPx = {
        fontSize,
        px,
        minPx: LABEL_MIN_PX,
        maxPx: LABEL_MAX_PX,
        distance: nearest,
      }
      return
    }
    if (stripRef.current && !dragging && api?.ready && packedRef.current) {
      const keepTier2 = Math.max(size.width, window.innerWidth || 0) >= 1366
      let live = api.measureVisible(perspective, size)
      if (live.length === 0) return
      const byId = { ...layoutRef.current.byId }
      const clusters = { ...layoutRef.current.clusters }
      const tierOf = (id: string) => {
        if (id.startsWith('cluster:')) {
          const key = id.slice('cluster:'.length)
          const member = labels.find((label) => label.text === key)
          return member ? classifyRoomLabel(member.sourceName ?? member.text, member.area ?? 0).tier : 3
        }
        const label = labels.find((item) => item.id === id)
        return label ? classifyRoomLabel(label.sourceName ?? label.text, label.area ?? 0).tier : 3
      }
      for (let pass = 0; pass < 12; pass += 1) {
        if (countOverlapKinds(live.map((row) => row.box)).strong === 0) break
        let left = live[0]
        let right = live[1]
        let found = false
        for (let i = 0; i < live.length && !found; i += 1) {
          for (let j = i + 1; j < live.length; j += 1) {
            const { ox, oy } = overlapDepth(live[i]!.box, live[j]!.box)
            if (ox > 2 && oy > 2) {
              left = live[i]
              right = live[j]
              found = true
              break
            }
          }
        }
        if (!found || !left || !right) break
        if (
          keepTier2 &&
          left.text === right.text &&
          !left.id.startsWith('cluster:') &&
          !right.id.startsWith('cluster:')
        ) {
          const key = left.text
          byId[left.id] = { ...byId[left.id]!, visible: false, cluster: key }
          byId[right.id] = { ...byId[right.id]!, visible: false, cluster: key }
          if (clusters[key]) clusters[key] = { ...clusters[key]!, visible: true }
          live = live.filter((row) => row.id !== left.id && row.id !== right.id)
          continue
        }
        const drop = pickOverlapVictim(left, right, tierOf, keepTier2)
        if (keepTier2 && !drop.startsWith('cluster:') && tierOf(drop) === 2) break
        if (drop.startsWith('cluster:')) {
          const key = drop.slice('cluster:'.length)
          if (clusters[key]) clusters[key] = { ...clusters[key]!, visible: false }
        } else if (byId[drop]) {
          byId[drop] = { ...byId[drop]!, visible: false, cluster: null }
        } else break
        live = live.filter((row) => row.id !== drop)
      }
      layoutRef.current = { byId, clusters }
      packRef.current = { byId, clusters }
      stripRef.current = false
      return
    }
    const pointerX = (pointer.x * 0.5 + 0.5) * size.width
    const pointerY = (-pointer.y * 0.5 + 0.5) * size.height
    let hoverId: string | null = null
    for (const item of itemsRef.current) {
      if (Math.hypot(pointerX - item.x, pointerY - item.y) < Math.max(item.w, item.h) * 0.65 + 18) {
        hoverId = item.id
        break
      }
    }
    if (hoverId === hoverIdRef.current) return
    hoverIdRef.current = hoverId
    const layout = layoutRef.current
    const byId =
      hoverId && layout.byId[hoverId] && !layout.byId[hoverId].visible
        ? { ...layout.byId, [hoverId]: { ...layout.byId[hoverId]!, visible: true, cluster: null } }
        : layout.byId
    packRef.current = { byId, clusters: layout.clusters }
  })

  if (labels.length === 0) return null
  const outline = roomLabelOutlineWidth(fontSize || 0.78)
  return (
    <group name="RoomLabels">
      <Line points={points} segments color="#5c6b7c" lineWidth={1.5} />
      {fontSize > 0 ? (
        <Suspense fallback={null}>
          <BatchedRoomLabels
            floorId={floorId}
            labels={labels}
            fontSize={fontSize}
            outlineWidth={outline}
            characters={characters}
            fadesRef={fadesRef}
            packRef={packRef}
            measureRef={measureRef}
          />
        </Suspense>
      ) : null}
    </group>
  )
}
