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
import { countMeasuredOverlap, overlapPairNames } from './labelScreenMeasure'
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
  const measureRef = useRef<LabelBatchApi | null>(null)
  const viewKeyRef = useRef('')
  const clusterSyncedRef = useRef('')
  const packedRef = useRef<AvoidResult | null>(null)
  const characters = roomLabelCharacters(labels)
  const points = labels.flatMap((label) => [label.anchor, label.label])

  useEffect(() => {
    sizedRef.current = false
    setFontSize(0)
    clusterSyncedRef.current = ''
    viewKeyRef.current = ''
    packedRef.current = null
  }, [floorId])

  useFrame(() => {
    if (labels.length === 0) return
    const perspective = camera as PerspectiveCamera
    const interior = scene.getObjectByName('FloorInterior')
    const host = scene.getObjectByName('RoomLabelBatch') ?? interior
    host?.updateWorldMatrix(true, false)
    perspective.updateMatrixWorld()
    if (!sizedRef.current) {
      const { maxPx } = maxProjectedEmPx(host ?? null, labels, perspective, size, 0.78)
      if (maxPx > 1e-6) {
        setFontSize(worldFontSizeFromProjectedEm(0.78, maxPx))
        sizedRef.current = true
      }
      return
    }
    const { maxPx: currentMaxPx, nearest } = maxProjectedEmPx(host ?? null, labels, perspective, size, fontSize || 0.78)
    const px = currentMaxPx > 1e-6 ? currentMaxPx : pxRef.current
    pxRef.current = px
    const state = useTwinStore.getState()
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
    const items: AvoidItem[] = []
    const pointerX = (pointer.x * 0.5 + 0.5) * size.width
    const pointerY = (-pointer.y * 0.5 + 0.5) * size.height
    const searchHits =
      state.searchQuery.trim() === ''
        ? []
        : searchWorkstations({ desks: state.desks, people: state.people }, state.searchQuery, 40).filter(
            (hit) => hit.floorId === floorId,
          )
    const alarmDesks = state.devices
      .filter((device) => device.floorId === floorId && device.status === 'alarm' && device.deskId)
      .map((device) => device.deskId as string)
    let hoverId: string | null = null
    const api = measureRef.current
    const measured = api?.ready ? api.measureForAvoid(perspective, size, labels) : null
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
      if (!Number.isFinite(sample.x) || sample.z > 1 || Math.abs(sample.x) > 1.25 || Math.abs(sample.y) > 1.25) {
        continue
      }
      const sx = (sample.x * 0.5 + 0.5) * size.width
      const sy = (-sample.y * 0.5 + 0.5) * size.height
      const found = measured?.get(label.id)
      const box = found ?? labelScreenBox(label.text, Math.max(px, LABEL_MIN_PX))
      const alarm = alarmDesks.some((deskId) => deskInRoom(floorId, deskId, label.polygon))
      const selected = Boolean(focused && deskInRoom(floorId, focused, label.polygon))
      const searchHit =
        searchHits.some((hit) => deskInRoom(floorId, hit.deskId, label.polygon)) ||
        (state.searchQuery.trim() !== '' && label.text.toLowerCase().includes(state.searchQuery.trim().toLowerCase()))
      const cls = classifyRoomLabel(label.sourceName ?? label.text, label.area ?? 0)
      const locked = alarm || selected || searchHit
      if (Math.hypot(pointerX - sx, pointerY - sy) < Math.max(box.w, box.h) * 0.65 + 18) hoverId = label.id
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
    if (measured) {
      for (const [id, box] of measured) {
        if (!id.startsWith('cluster:')) continue
        clusterSizes[id.slice('cluster:'.length)] = { w: box.w, h: box.h }
      }
    }
    const viewKey = `${floorId}|${Math.round((window.__twinRig?.distance ?? 0) * 20)}|${alarmDesks.join(',')}|${focused ?? ''}|${state.searchQuery}|${size.width}|${measured ? 'm' : 'e'}`
    const shouldPack = viewKey !== viewKeyRef.current || !packedRef.current
    if (shouldPack) viewKeyRef.current = viewKey
    const packed = shouldPack || !packedRef.current ? avoidLabels(items, clusterSizes) : packedRef.current
    packedRef.current = packed
    let avoided = packed
    if (hoverId) {
      const row = packed.placements.find((item) => item.id === hoverId)
      if (row && !row.visible) {
        avoided = {
          ...packed,
          merged: row.cluster ? Math.max(0, packed.merged - 1) : packed.merged,
          hidden: row.cluster ? packed.hidden : Math.max(0, packed.hidden - 1),
          placements: packed.placements.map((item) =>
            item.id === hoverId ? { ...item, visible: true, cluster: null } : item,
          ),
        }
      }
    }
    const byId: LabelPackState['byId'] = {}
    const clusters: LabelPackState['clusters'] = {}
    for (const label of labels) {
      byId[label.id] = { visible: false, cluster: null, offsetX: 0, offsetY: 0 }
    }
    for (const row of avoided.placements) byId[row.id] = row
    const clusterTexts: Record<string, string> = {}
    for (const cluster of avoided.clusters) {
      const members = labels.filter((label) => cluster.ids.includes(label.id))
      if (members.length === 0) continue
      clusters[cluster.key] = {
        visible: true,
        offsetX: cluster.offsetX,
        offsetY: cluster.offsetY,
        world: [
          members.reduce((sum, label) => sum + label.label[0], 0) / members.length,
          members.reduce((sum, label) => sum + label.label[1], 0) / members.length,
          members.reduce((sum, label) => sum + label.label[2], 0) / members.length,
        ],
        text: cluster.text,
      }
      clusterTexts[cluster.key] = cluster.text
    }
    packRef.current = { byId, clusters }
    const clusterSig = Object.entries(clusterTexts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, text]) => `${key}:${text}`)
      .join('|')
    if (api?.ready && measured && !clusterSyncedRef.current) {
      clusterSyncedRef.current = clusterSig || 'none'
      if (clusterSig) {
        void api.applyClusterTexts(clusterTexts).then(() => {
          if (!window.__twinLabelReadyAt) window.__twinLabelReadyAt = performance.now()
        })
      } else if (!window.__twinLabelReadyAt) {
        window.__twinLabelReadyAt = performance.now()
      }
    }
    const live = api?.ready ? api.measureVisible(perspective, size) : []
    const measuredPairs = countMeasuredOverlap(live.map((row) => row.box))
    const tier = tier2Stats(items, avoided)
    window.__twinLabelOverlap = {
      merged: avoided.merged,
      hidden: avoided.hidden,
      hiddenAfterZoom: avoided.hiddenAfterZoom,
      overlapPairs: measuredPairs,
      maxOffset: avoided.maxOffset,
      visible: visibleOverlapBoxes(labels, items, avoided),
      d243: diagnoseRestCorridor(labels, items, avoided),
      tier2: tier,
      measured: live,
      pairs: overlapPairNames(live),
      region: live.filter((row) => {
        const x0 = row.box.x
        const y0 = row.box.y
        const x1 = row.box.x + row.box.w
        const y1 = row.box.y + row.box.h
        return x0 < 620 && x1 > 500 && y0 < 360 && y1 > 280
      }),
    }
    window.__twinLabelPx = {
      fontSize,
      px,
      minPx: LABEL_MIN_PX,
      maxPx: LABEL_MAX_PX,
      distance: nearest,
    }
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
