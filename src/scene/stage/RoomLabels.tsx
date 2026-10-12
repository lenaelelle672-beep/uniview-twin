import { Line } from '@react-three/drei/core/Line'
import { useFrame, useThree } from '@react-three/fiber'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { PerspectiveCamera, Vector3, type Camera, type Object3D } from 'three'
import { searchWorkstations } from '../../locate/search'
import { resolveWorkstationRef } from '../../locate/ref'
import { pointInRing } from '../../floors/parsePlan'
import { useTwinStore } from '../../store/store'
import { classifyRoomLabel } from '../../floors/labelTier'
import {
  avoidLabels,
  boxesOverlap,
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
  OVERLAP_STRONG_PX,
  pickHoverLabel,
  stripStrongOverlaps,
  visibilityMismatch,
  type MeasuredLabelBox,
} from './labelScreenMeasure'
import { isCameraRested } from './cameraRest'
import { preloadFloorEntryFont, preloadLabelChars } from './glyphProbe'
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
/** 停稳后淡入时长。算出齐时间，所以要短；只改 fillOpacity。 */
const FADE_IN_MS = 80

function hiddenLayout(labels: RoomLabel[]): LabelPackState {
  const byId: LabelPackState['byId'] = {}
  for (const label of labels) {
    byId[label.id] = { visible: false, cluster: null, offsetX: 0, offsetY: 0, local: label.label }
  }
  return { byId, clusters: {} }
}

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

function visibleFromRender(
  live: MeasuredLabelBox[],
  labels: RoomLabel[],
  pack: LabelPackState,
): NonNullable<Window['__twinLabelOverlap']>['visible'] {
  const byLabel = new Map(labels.map((label) => [label.id, label]))
  return live.map((row) => {
    const label = byLabel.get(row.id)
    const place = row.id.startsWith('cluster:')
      ? pack.clusters[row.id.slice('cluster:'.length)]
      : pack.byId[row.id]
    return {
      id: row.id,
      text: row.text,
      sx: row.box.x + row.box.w / 2,
      sy: row.box.y + row.box.h / 2,
      w: row.box.w,
      h: row.box.h,
      offsetX: place?.offsetX ?? 0,
      offsetY: place?.offsetY ?? 0,
      cluster: row.cluster,
      wx: label?.label[0] ?? 0,
      wz: label?.label[2] ?? 0,
    }
  })
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
  const camera = useThree((state) => state.camera)
  const scene = useThree((state) => state.scene)
  const size = useThree((state) => state.size)
  const gl = useThree((state) => state.gl)
  const invalidate = useThree((state) => state.invalidate)
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
  const packedKeyRef = useRef('')
  const packStepRef = useRef<'idle' | 'avoid' | 'sync' | 'fade'>('idle')
  const pendingFadeRef = useRef(false)
  const keepTier2Ref = useRef(false)
  const pointerMovedRef = useRef(false)
  const pointerOnCanvasRef = useRef(false)
  const pointerPxRef = useRef({ x: 0, y: 0 })
  const hoverIdRef = useRef<string | null>(null)
  const fadeInRef = useRef(0)
  const targetFadesRef = useRef<number[]>([])
  const itemsRef = useRef<AvoidItem[]>([])
  const cameraRef = useRef(camera)
  const sizeRef = useRef(size)
  const wakeRef = useRef(0)
  const fadeRafRef = useRef(0)
  const askFrame = () => {
    if (wakeRef.current) return
    // demand 下，当前 useFrame 里同步 invalidate 不一定能排到下一帧。
    wakeRef.current = requestAnimationFrame(() => {
      wakeRef.current = 0
      invalidate()
    })
  }
  const stopFadeLoop = () => {
    if (fadeRafRef.current) cancelAnimationFrame(fadeRafRef.current)
    fadeRafRef.current = 0
  }
  const startFadeLoop = () => {
    stopFadeLoop()
    const started = performance.now()
    fadeInRef.current = started
    pendingFadeRef.current = false
    window.__twinLabelFading = true
    window.__twinLabelPhases = { ...(window.__twinLabelPhases ?? {}), fadeStartAt: started, packStep: 'fade' }
    const step = () => {
      const t = Math.min(1, (performance.now() - started) / FADE_IN_MS)
      const fades = fadesRef.current
      const targets = targetFadesRef.current
      for (let i = 0; i < Math.max(fades.length, targets.length); i += 1) fades[i] = (targets[i] ?? 1) * t
      measureRef.current?.applyPack(packRef.current)
      invalidate()
      if (t >= 1) {
        fadeInRef.current = 0
        fadeRafRef.current = 0
        window.__twinLabelFading = false
        window.__twinLabelPhases = {
          ...(window.__twinLabelPhases ?? {}),
          fadeDoneAt: performance.now(),
          fadeMs: Math.round(performance.now() - started),
          maxFrameFade: Math.round(performance.now() - started),
          packStep: 'idle',
        }
        packStepRef.current = 'idle'
        return
      }
      fadeRafRef.current = requestAnimationFrame(step)
    }
    fadeRafRef.current = requestAnimationFrame(step)
  }
  const characters = roomLabelCharacters(labels)
  const pointsKey = labels.map((label) => `${label.id}:${label.anchor.join(',')}:${label.label.join(',')}`).join('|')
  const points = useMemo(
    () => labels.flatMap((label) => [label.anchor, label.label]),
    // 只跟几何走。每次 render 新数组会让 drei Line 把 LineMaterial dispose 再编一次（D272）。
    [pointsKey],
  )
  cameraRef.current = camera
  sizeRef.current = size

  const stripLiveOverlaps = (perspective: PerspectiveCamera, viewport: { width: number; height: number }, keepTier2: boolean) => {
    const api = measureRef.current
    if (!api?.ready || !packedRef.current) return false
    api.applyPack(packRef.current)
    const live = api.measureVisible(perspective, viewport)
    if (live.length === 0) return false
    const tierOf = (id: string) => {
      if (id.startsWith('cluster:')) {
        const key = id.slice('cluster:'.length)
        const owned = packedRef.current?.clusters.find((row) => row.key === key)
        const member = owned ? labels.find((label) => owned.ids.includes(label.id)) : undefined
        return member ? classifyRoomLabel(member.sourceName ?? member.text, member.area ?? 0).tier : classifyRoomLabel(key, 0).tier
      }
      const label = labels.find((item) => item.id === id)
      return label ? classifyRoomLabel(label.sourceName ?? label.text, label.area ?? 0).tier : 3
    }
    const strong = countOverlapKinds(live.map((row) => row.box)).strong
    if (strong === 0) {
      layoutRef.current = packRef.current
      return true
    }
    const stripped = stripStrongOverlaps(live, packRef.current, tierOf, keepTier2)
    layoutRef.current = stripped.pack
    packRef.current = stripped.pack
    api.applyPack(stripped.pack)
    const packed = packedRef.current
    if (packed) {
      for (const row of packed.placements) {
        const shown = stripped.pack.byId[row.id]
        if (!shown) continue
        row.visible = shown.visible
        row.cluster = shown.cluster
      }
      packed.hidden = packed.placements.filter((row) => !row.visible && !row.cluster).length
    }
    const after = api.measureVisible(perspective, viewport)
    return countOverlapKinds(after.map((row) => row.box)).strong === 0
  }

  useEffect(() => {
    sizedRef.current = false
    setFontSize(0)
    clusterSyncedRef.current = ''
    viewKeyRef.current = ''
    packedRef.current = null
    layoutRef.current = { byId: {}, clusters: {} }
    stripRef.current = false
    packedKeyRef.current = ''
    packStepRef.current = 'idle'
    pendingFadeRef.current = false
    pointerMovedRef.current = false
    pointerOnCanvasRef.current = false
    hoverIdRef.current = null
    window.__twinLabelFading = false
    fadeInRef.current = 0
    targetFadesRef.current = []
    itemsRef.current = []
    packRef.current = hiddenLayout(labels)
    layoutRef.current = packRef.current
    stopFadeLoop()
    void preloadFloorEntryFont(characters)
    void preloadLabelChars(characters, `entry:${floorId}`)
  }, [floorId, labels, characters])

  useEffect(() => {
    packedRef.current = null
    packedKeyRef.current = ''
    packStepRef.current = 'idle'
    pendingFadeRef.current = false
    fadeInRef.current = 0
    window.__twinLabelFading = false
    stopFadeLoop()
  }, [fontSize])

  useEffect(() => {
    const read = () => {
      const packed = packedRef.current
      // 避让刚算完、合批或淡入还没结束时，屏上盒和 pack 对不上。等停稳再给探针。
      if (!packed || packStepRef.current !== 'idle' || window.__twinLabelFading === true) return undefined
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
        hoverId: hoverIdRef.current,
        maxAngle,
        maxOffset: packed.maxOffset,
        visible: visibleFromRender(live, labels, packRef.current),
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
        hiddenAt: itemsRef.current
          .map((item) => {
            const row = packed.placements.find((place) => place.id === item.id)
            if (!row || row.visible) return null
            return { id: item.id, text: item.text, sx: item.x, sy: item.y, w: item.w, h: item.h, cluster: row.cluster }
          })
          .filter((row): row is NonNullable<typeof row> => Boolean(row)),
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

  useEffect(() => {
    const canvas = gl.domElement
    const onMove = (event: PointerEvent) => {
      pointerMovedRef.current = true
      pointerOnCanvasRef.current = true
      const rect = canvas.getBoundingClientRect()
      const width = Math.max(rect.width, 1)
      const height = Math.max(rect.height, 1)
      pointerPxRef.current = {
        x: ((event.clientX - rect.left) / width) * sizeRef.current.width,
        y: ((event.clientY - rect.top) / height) * sizeRef.current.height,
      }
      invalidate()
    }
    const onLeave = () => {
      pointerOnCanvasRef.current = false
      invalidate()
    }
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerleave', onLeave)
    return () => {
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerleave', onLeave)
    }
  }, [gl, invalidate])

  useFrame(() => {
    if (labels.length === 0) return
    const perspective = camera as PerspectiveCamera
    const interior = scene.getObjectByName('FloorInterior')
    const host = scene.getObjectByName('RoomLabelBatch') ?? interior
    const api = measureRef.current
    const rig = window.__twinRig as (Window['__twinRig'] & { currentAction?: number }) | undefined
    const dragging = (rig?.currentAction ?? 0) !== 0
    const state = useTwinStore.getState()
    const slabReady = window.__twinSlab?.floorId === floorId
    const flyEnd = window.__twinFlyEnd
    const locating = Boolean(flyEnd) && window.__twinLocate?.deskId !== flyEnd?.deskId
    const cameraReady = slabReady || (Boolean(state.focusedDeskId) && !locating)
    const settled = !dragging && !locating && cameraReady && isCameraRested()
    const viewKey = `${floorId}|${state.focusedDeskId ?? ''}|${state.searchQuery}|${Math.round(size.width / 16) * 16}|${state.devices
      .filter((device) => device.floorId === floorId && device.status === 'alarm')
      .map((device) => device.id)
      .join(',')}`
    if (viewKey !== viewKeyRef.current) {
      packedRef.current = null
      packedKeyRef.current = ''
      packStepRef.current = 'idle'
      pendingFadeRef.current = false
      fadeInRef.current = 0
      targetFadesRef.current = []
      hoverIdRef.current = null
      packRef.current = hiddenLayout(labels)
      layoutRef.current = packRef.current
      api?.applyPack(packRef.current)
      viewKeyRef.current = viewKey
    }
    if (dragging) idleRef.current = -1
    const framed = window.__twinCameraFramed === floorId || slabReady
    if (settled && framed) {
      host?.updateWorldMatrix(true, false)
      perspective.updateMatrixWorld()
      const { maxPx } = maxProjectedEmPx(host ?? null, labels, perspective, size, 0.78)
      if (maxPx > 1e-6) {
        const next = worldFontSizeFromProjectedEm(0.78, maxPx)
        if (fontSize <= 0 || Math.abs(next - fontSize) / Math.max(fontSize, 0.01) > 0.08) setFontSize(next)
        sizedRef.current = true
      } else if (!sizedRef.current && slabReady) {
        setFontSize((prev) => prev || 0.78)
        askFrame()
      }
    }
    window.__twinLabelBatchPresent = Boolean(api?.ready)
    if (!settled) {
      return
    }
    if (!sizedRef.current || fontSize <= 0) {
      askFrame()
      return
    }
    let shouldPack = false
    if (idleRef.current === -1) {
      shouldPack = true
      idleRef.current = 0
    } else if (packedKeyRef.current !== viewKey || !packedRef.current) {
      shouldPack = true
    }
    if (shouldPack && !api?.ready) {
      askFrame()
      return
    }
    if (packStepRef.current === 'sync' && (!api?.ready || !packedRef.current)) {
      askFrame()
      return
    }
    if (shouldPack && api?.ready && packStepRef.current === 'idle') {
      const avoidStart = performance.now()
      window.__twinLabelPhases = { ...(window.__twinLabelPhases ?? {}), packStep: 'avoid', avoidStartAt: avoidStart }
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
          if (!state || state.visible || state.cluster) continue
          const owned = avoided.clusters.find((row) => row.ids.includes(item.id))
          const cluster = owned ? clusters[owned.key] : undefined
          const clusterBox = owned?.box
          const itemBox = { x: item.x - item.w / 2, y: item.y - item.h / 2, w: item.w, h: item.h }
          if (owned && cluster?.visible && clusterBox && boxesOverlap(itemBox, clusterBox, 0)) {
            state.cluster = owned.key
            continue
          }
          state.visible = true
          const row = avoided.placements.find((place) => place.id === item.id)
          if (row) {
            row.visible = true
            row.cluster = null
          }
        }
      }
      layoutRef.current = { byId, clusters }
      packRef.current = hiddenLayout(labels)
      viewKeyRef.current = viewKey
      const needsFade = packedKeyRef.current !== viewKey
      packedKeyRef.current = viewKey
      pendingFadeRef.current = needsFade
      keepTier2Ref.current = keepTier2
      packStepRef.current = 'sync'
      clusterSyncedRef.current = 'once'
      hoverIdRef.current = null
      window.__twinLabelPx = {
        fontSize,
        px,
        minPx: LABEL_MIN_PX,
        maxPx: LABEL_MAX_PX,
        distance: nearest,
      }
      targetFadesRef.current = fades.slice()
      stripRef.current = false
      const avoidMs = performance.now() - avoidStart
      window.__twinLabelPhases = {
        ...(window.__twinLabelPhases ?? {}),
        restAt: window.__twinCameraRestAt,
        restReason: window.__twinCameraRestReason,
        flyPromiseAt: window.__twinFlyPromiseAt,
        packedAt: performance.now(),
        avoidMs,
        maxFrameAvoid: avoidMs,
        packStep: 'sync',
      }
      askFrame()
      return
    }
    if (packStepRef.current === 'sync' && packedRef.current && api?.ready) {
      const syncStart = performance.now()
      window.__twinLabelPhases = { ...(window.__twinLabelPhases ?? {}), packStep: 'sync', syncStartAt: syncStart }
      packRef.current = layoutRef.current
      const fades = fadesRef.current
      const targets = targetFadesRef.current
      for (let i = 0; i < Math.max(fades.length, targets.length, labels.length); i += 1) fades[i] = targets[i] ?? 1
      stripLiveOverlaps(perspective, size, keepTier2Ref.current)
      if (pendingFadeRef.current) {
        for (let i = 0; i < fades.length; i += 1) fades[i] = 0
        window.__twinLabelFading = true
      } else {
        fadeInRef.current = 0
        window.__twinLabelFading = false
      }
      api.applyPack(packRef.current)
      const syncMs = performance.now() - syncStart
      window.__twinLabelPhases = {
        ...(window.__twinLabelPhases ?? {}),
        syncAt: window.__twinLabelReadyAt,
        syncMs,
        maxFrameSync: syncMs,
        packStep: 'fade',
      }
      packStepRef.current = 'fade'
      askFrame()
      return
    }
    if (packStepRef.current === 'fade' && pendingFadeRef.current && fadeInRef.current === 0) {
      startFadeLoop()
    }
    if (packStepRef.current === 'fade' && fadeInRef.current === 0) packStepRef.current = 'idle'
    const writePackVisibility = (byId: LabelPackState['byId'], clusters: LabelPackState['clusters']) => {
      packRef.current = { byId, clusters }
      const packed = packedRef.current
      if (packed) {
        for (const row of packed.placements) {
          const shown = byId[row.id]
          if (!shown) continue
          row.visible = shown.visible
          row.cluster = shown.cluster
        }
        packed.hidden = packed.placements.filter((row) => !row.visible && !row.cluster).length
      }
      api?.applyPack(packRef.current)
    }
    const revealHover = (hoverId: string | null) => {
      const layout = layoutRef.current
      const restore = () => writePackVisibility({ ...layout.byId }, { ...layout.clusters })
      if (!hoverId || !layout.byId[hoverId] || layout.byId[hoverId]!.visible) {
        restore()
        return
      }
      const byId = { ...layout.byId, [hoverId]: { ...layout.byId[hoverId]!, visible: true, cluster: null } }
      const clusters = { ...layout.clusters }
      writePackVisibility(byId, clusters)
      const live = api?.measureVisible(perspective, size) ?? []
      const revealed = live.find((row) => row.id === hoverId)
      if (!revealed) {
        restore()
        return
      }
      const locked = new Set(itemsRef.current.filter((item) => item.locked).map((item) => item.id))
      const blockers = live.filter((row) => {
        if (row.id === hoverId) return false
        const { ox, oy } = overlapDepth(row.box, revealed.box)
        return ox > OVERLAP_STRONG_PX && oy > OVERLAP_STRONG_PX
      })
      if (blockers.some((row) => locked.has(row.id))) {
        restore()
        return
      }
      for (const row of blockers) {
        if (row.id.startsWith('cluster:')) {
          const key = row.id.slice('cluster:'.length)
          if (clusters[key]) clusters[key] = { ...clusters[key]!, visible: false }
        } else if (byId[row.id]) {
          byId[row.id] = { ...byId[row.id]!, visible: false }
        }
      }
      writePackVisibility(byId, clusters)
    }
    if (pointerMovedRef.current && pointerOnCanvasRef.current && packedRef.current) {
      const remes = api?.measureForAvoid(perspective, size, labels)
      const hoverItems = itemsRef.current.map((item) => {
        const box = remes?.get(item.id)
        return box ? { id: item.id, x: box.x, y: box.y, w: box.w, h: box.h } : item
      })
      const hoverId = pickHoverLabel(pointerPxRef.current, hoverItems)
      if (hoverId !== hoverIdRef.current) {
        hoverIdRef.current = hoverId
        revealHover(hoverId)
        invalidate()
      }
    } else if (hoverIdRef.current) {
      hoverIdRef.current = null
      revealHover(null)
      invalidate()
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
