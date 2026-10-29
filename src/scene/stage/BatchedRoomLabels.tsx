import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef, useState, type MutableRefObject } from 'react'
import { DoubleSide, Group, type Camera } from 'three'
import { BatchedText, disableTroikaCdnFallback, Text } from './disableTroikaCdn'
import { preloadFloorEntryFont } from './glyphProbe'
import { clusterTemplates, LABEL_MAX_EMS, type LabelPackState, type LabelPlacementState } from './labelAvoidance'
import { cameraLookYaw, isDrawnText, measureTextBox, type MeasuredLabelBox } from './labelScreenMeasure'
import { useTwinStore } from '../../store/store'
import {
  ROOM_LABEL_FONT,
  ROOM_LABEL_OUTLINE_BLUR,
  ROOM_LABEL_OUTLINE_OPACITY,
  roomLabelColors,
  type RoomLabel,
} from './roomLabels'
import { labelLiftY } from '../../floors/interiorWall'
import { uploadGpuInBatches, yieldMain } from '../openPathChunk'
import { holdLabelPaint, releaseLabelPaint } from './labelPaintHold'

disableTroikaCdnFallback()

export interface LabelBatchApi {
  ready: boolean
  measureVisible: (
    camera: Camera,
    size: { width: number; height: number },
    opts?: { drawn?: 'opacity' | 'scale' },
  ) => MeasuredLabelBox[]
  measureForAvoid: (
    camera: Camera,
    size: { width: number; height: number },
    labels: RoomLabel[],
  ) => Map<string, { x: number; y: number; w: number; h: number }>
  applyClusterTexts: (next: Record<string, string>) => Promise<boolean>
  orientToCamera: (camera: Camera) => number
  applyPack: (pack: LabelPackState) => void
  /** 淡入只改透明度。位置和矩阵在上屏那一帧已经写过。 */
  applyOpacity: () => void
  /** F7：先让楼层单独画一帧，下一帧再把批次算进同一次绘制。 */
  setBatchVisible: (visible: boolean) => void
}

function bumpSync(): void {
  window.__twinLabelSyncs = (window.__twinLabelSyncs ?? 0) + 1
}

/** integration #18/#19：单个 Text.sync 后 invalidate。#22 进层只走一次 batch.sync，不在创建时对每个成员 sync。 */
function syncText(text: Text, invalidate: () => void): Promise<void> {
  return new Promise((resolve) => {
    text.sync(() => {
      invalidate()
      resolve()
    })
  })
}

function applyMemberFades(members: Text[], fades: number[] | undefined) {
  for (let i = 0; i < members.length; i += 1) {
    const fade = fades?.[i] ?? 1
    const text = members[i]
    if (!text) continue
    text.fillOpacity = fade
    text.outlineOpacity = fade * ROOM_LABEL_OUTLINE_OPACITY
  }
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

/** 飞入窗口禁止 batch.sync / 首次上屏。停稳后再排，避免和相机、室内几何叠在同一帧。 */
async function waitCameraRested(): Promise<void> {
  if (typeof window === 'undefined') return
  if (window.__twinView !== 'floor') {
    const begin = performance.now()
    while (window.__twinView !== 'floor' && performance.now() - begin < 2000) {
      await nextFrame()
    }
  }
  if (window.__twinView === 'floor' && window.__twinCameraMoveAt == null) {
    const begin = performance.now()
    while (window.__twinCameraMoveAt == null && performance.now() - begin < 2000) {
      await nextFrame()
    }
  }
  const restBegin = performance.now()
  while (window.__twinCameraRested !== true && performance.now() - restBegin < 4000) {
    await nextFrame()
  }
  await nextFrame()
}

function applyWrap(text: Text, fontSize: number) {
  text.maxWidth = fontSize * LABEL_MAX_EMS
  text.overflowWrap = 'break-word'
  text.whiteSpace = 'normal'
}

function applyPlacement(
  text: Text,
  base: [number, number, number],
  placement: LabelPlacementState | undefined,
  fade: number,
  show: boolean,
  fontSize: number,
) {
  const visible = show && placement?.visible === true
  text.fillOpacity = visible ? fade : 0
  text.outlineOpacity = visible ? fade * ROOM_LABEL_OUTLINE_OPACITY : 0
  text.scale.setScalar(visible ? 1 : 0.001)
  const local = placement?.local ?? base
  const y = Math.max(local[1], labelLiftY(fontSize))
  text.position.set(local[0], y, local[2])
  text.updateMatrix()
}

export function BatchedRoomLabels({
  floorId,
  labels,
  fontSize,
  outlineWidth,
  characters,
  fadesRef,
  packRef,
  measureRef,
}: {
  floorId: string
  labels: RoomLabel[]
  fontSize: number
  outlineWidth: number
  characters: string
  fadesRef: MutableRefObject<number[]>
  packRef: MutableRefObject<LabelPackState>
  measureRef: MutableRefObject<LabelBatchApi | null>
}) {
  disableTroikaCdnFallback()
  const groupRef = useRef<Group>(null)
  const batchRef = useRef<BatchedText | null>(null)
  const membersRef = useRef<Text[]>([])
  const clustersRef = useRef<Text[]>([])
  const clusterKeysRef = useRef<string[]>([])
  const fontSizeRef = useRef(fontSize)
  const outlineRef = useRef(outlineWidth)
  fontSizeRef.current = fontSize
  outlineRef.current = outlineWidth
  const [packGen, setPackGen] = useState(0)
  const scene = useThree((state) => state.scene)
  const gl = useThree((state) => state.gl)
  const invalidate = useThree((state) => state.invalidate)
  const quality = useTwinStore((state) => state.quality)
  const dayNight = useTwinStore((state) => state.dayNight)
  const presentation = useTwinStore((state) => state.presentation)
  // 白模曝光是 1，但表面仍是浅色，跟白天一样用冷描边。只有夜间保留浅描边。
  const labelTone = presentation === 'model' || dayNight !== 'night' ? 'day' : 'night'
  const palette = roomLabelColors(quality, labelTone)
  const paletteRef = useRef(palette)
  paletteRef.current = palette
  const signature = labels.map((label) => `${label.id}|${label.text}|${label.label.join(',')}`).join(';')
  const clusters = clusterTemplates(labels)
  const appliedPackRef = useRef('')

  const writePack = (pack: LabelPackState) => {
    const members = membersRef.current
    if (members.length === 0) return
    applyMemberFades(members, fadesRef.current)
    const fades = fadesRef.current
    for (let i = 0; i < members.length; i += 1) {
      const label = labels[i]
      const text = members[i]
      if (!label || !text) continue
      applyPlacement(text, label.label, pack.byId[label.id], fades[i] ?? 1, true, fontSizeRef.current)
    }
    for (let i = 0; i < clustersRef.current.length; i += 1) {
      const cluster = clusters[i]
      const text = clustersRef.current[i]
      if (!cluster || !text) continue
      const state = pack.clusters[cluster.key]
      const show = Boolean(state?.visible)
      const base = state?.local ?? state?.world ?? cluster.label
      applyPlacement(
        text,
        base,
        {
          visible: show,
          cluster: cluster.key,
          offsetX: state?.offsetX ?? 0,
          offsetY: state?.offsetY ?? 0,
          local: state?.local ?? state?.world,
        },
        1,
        show,
        fontSizeRef.current,
      )
    }
    let sig = ''
    for (const [id, row] of Object.entries(pack.byId)) {
      if (row.visible) sig += `${id}:${row.local?.join(',') ?? ''};`
    }
    for (const [key, row] of Object.entries(pack.clusters)) {
      if (row.visible) sig += `c${key}:${row.local?.join(',') ?? ''};`
    }
    appliedPackRef.current = sig
    batchRef.current?.updateMatrixWorld(true)
  }

  useLayoutEffect(() => {
    const host = groupRef.current
    const shellName = floorId === 'B1' ? 'B1' : `FloorShell-${floorId}`
    const shell = scene.getObjectByName(shellName)
    if (!host || !shell) return
    const parent = host.parent
    let keepY = 0
    let cursor = parent
    while (cursor) {
      if (cursor.name === 'FloorInterior') {
        keepY = cursor.position.y
        break
      }
      cursor = cursor.parent
    }
    host.position.y = keepY
    shell.add(host)
    return () => {
      parent?.add(host)
      host.position.y = 0
    }
  }, [floorId, scene, signature])

  useLayoutEffect(() => {
    const group = groupRef.current
    if (!group || labels.length === 0 || fontSize <= 0) return
    let cancelled = false
    let batch: BatchedText | null = null
    const members: Text[] = []
    const clusterMembers: Text[] = []
    const started = performance.now()
    window.__twinLabelSyncs = 0
    window.__twinLabelSyncStartedAt = started
    window.__twinLabelReadyAt = undefined

    void preloadFloorEntryFont(characters)
      .then(async () => {
        if (cancelled) return
        await waitCameraRested()
        if (cancelled) return
        batch = new BatchedText()
        batch.name = 'RoomLabelBatchedText' // QA 独立脚本读 window.__twinScene 里这个名字和 batch._members
        batch.font = ROOM_LABEL_FONT
        batch.color = paletteRef.current.color
        batch.anchorX = 'center'
        batch.anchorY = 'middle'
        batch.renderOrder = 3
        batch.visible = false
        batch.frustumCulled = false
        for (let i = 0; i < labels.length; i += 1) {
          const label = labels[i]
          if (!label) continue
          const text = new Text()
          text.text = label.text
          text.font = ROOM_LABEL_FONT
          text.fontSize = fontSize
          text.color = paletteRef.current.color
          text.outlineWidth = outlineWidth
          text.outlineBlur = ROOM_LABEL_OUTLINE_BLUR
          text.outlineColor = paletteRef.current.outline
          text.anchorX = 'center'
          text.anchorY = 'middle'
          text.characters = characters
          applyWrap(text, fontSize)
          text.userData.labelId = label.id
          text.position.set(label.label[0], label.label[1], label.label[2])
          text.scale.setScalar(0.001)
          text.fillOpacity = 0
          text.frustumCulled = false
          batch.addText(text)
          members.push(text)
          if (i > 0 && i % 40 === 0) {
            await yieldMain()
            if (cancelled) return
          }
        }
        for (const cluster of clusters) {
          const text = new Text()
          text.text = cluster.text
          text.font = ROOM_LABEL_FONT
          text.fontSize = fontSize
          text.color = paletteRef.current.color
          text.outlineWidth = outlineWidth
          text.outlineBlur = ROOM_LABEL_OUTLINE_BLUR
          text.outlineColor = paletteRef.current.outline
          text.anchorX = 'center'
          text.anchorY = 'middle'
          text.characters = characters
          applyWrap(text, fontSize)
          text.userData.clusterKey = cluster.key
          text.userData.labelId = `cluster:${cluster.key}`
          text.position.set(cluster.label[0], cluster.label[1], cluster.label[2])
          text.scale.setScalar(0.001)
          text.fillOpacity = 0
          text.frustumCulled = false
          batch.addText(text)
          clusterMembers.push(text)
        }
        await yieldMain()
        if (cancelled || !batch) return
        window.__twinLabelBatchSyncStartedAt = performance.now()
        await new Promise<void>((resolve) => {
          batch?.sync(() => {
            bumpSync()
            window.__twinLabelBatchSyncAt = performance.now()
            resolve()
          })
        })
        if (cancelled || !batch) return
        await uploadGpuInBatches({
          renderer: {
            initTexture: (texture) => {
              gl.initTexture(texture as never)
            },
          },
          meshes: [batch],
          yieldTurn: yieldMain,
        })
        await nextFrame()
        if (cancelled || !batch) return
        const materials = Array.isArray(batch.material) ? batch.material : [batch.material]
        for (const material of materials) {
          if (!material) continue
          material.side = DoubleSide
          material.toneMapped = false
        }
        applyMemberFades(members, fadesRef.current)
        holdLabelPaint(gl)
        batch.visible = true
        group.add(batch)
        batchRef.current = batch
        membersRef.current = members
        clustersRef.current = clusterMembers
        clusterKeysRef.current = clusters.map((item) => item.key)
        window.__twinLabelPackMs = performance.now() - started
        window.__twinLabelPaintAt = performance.now()
        if (!window.__twinLabelReadyAt) window.__twinLabelReadyAt = performance.now()
        setPackGen((value) => value + 1)
        invalidate()
      })
      .catch(() => {})

    return () => {
      cancelled = true
      membersRef.current = []
      clustersRef.current = []
      clusterKeysRef.current = []
      batchRef.current = null
      if (measureRef) measureRef.current = null
      if (batch) {
        group.remove(batch)
        batch.dispose()
      }
      for (const text of [...members, ...clusterMembers]) text.dispose()
      releaseLabelPaint()
    }
  }, [characters, fontSize, gl, outlineWidth, invalidate, signature])

  useLayoutEffect(() => {
    const batch = batchRef.current
    const members = membersRef.current
    const clusterMembers = clustersRef.current
    if (!batch || members.length === 0) return
    for (const text of [...members, ...clusterMembers]) {
      text.color = palette.color
      text.outlineColor = palette.outline
    }
    applyMemberFades(members, fadesRef.current)
    invalidate()
  }, [fadesRef, invalidate, packGen, palette.color, palette.outline])

  useLayoutEffect(() => {
    measureRef.current = {
      ready: Boolean(batchRef.current && membersRef.current.length),
      measureVisible(camera, size, opts) {
        const batch = batchRef.current
        if (!batch) return []
        batch.updateMatrixWorld(true)
        const scaleOnly = opts?.drawn === 'scale'
        const out: MeasuredLabelBox[] = []
        for (let i = 0; i < membersRef.current.length; i += 1) {
          const text = membersRef.current[i]
          const label = labels[i]
          if (!text || !label) continue
          if (scaleOnly) {
            if (text.scale.x <= 0.05) continue
          } else if (!isDrawnText(text)) continue
          const box = measureTextBox(text, batch.matrixWorld, camera, size, true)
          if (!box) continue
          out.push({ id: label.id, text: label.text, box, cluster: null, px: box.h })
        }
        for (let i = 0; i < clustersRef.current.length; i += 1) {
          const text = clustersRef.current[i]
          const key = clusterKeysRef.current[i]
          if (!text || !key) continue
          if (scaleOnly) {
            if (text.scale.x <= 0.05) continue
          } else if (!isDrawnText(text)) continue
          const box = measureTextBox(text, batch.matrixWorld, camera, size, true)
          if (!box) continue
          out.push({ id: `cluster:${key}`, text: text.text, box, cluster: key, px: box.h })
        }
        return out
      },
      measureForAvoid(camera, size, current) {
        const batch = batchRef.current
        const map = new Map<string, { x: number; y: number; w: number; h: number }>()
        if (!batch) return map
        batch.updateMatrixWorld(true)
        const push = (id: string, text: Text, base: [number, number, number]) => {
          const prev = { x: text.position.x, y: text.position.y, z: text.position.z, sx: text.scale.x }
          text.position.set(base[0], base[1], base[2])
          text.scale.setScalar(1)
          text.updateMatrix()
          const box = measureTextBox(text, batch.matrixWorld, camera, size, false)
          text.position.set(prev.x, prev.y, prev.z)
          text.scale.setScalar(prev.sx)
          text.updateMatrix()
          if (!box) return
          map.set(id, { x: box.x + box.w / 2, y: box.y + box.h / 2, w: box.w, h: box.h })
        }
        for (let i = 0; i < membersRef.current.length; i += 1) {
          const text = membersRef.current[i]
          const label = current[i]
          if (!text || !label) continue
          push(label.id, text, label.label)
        }
        for (let i = 0; i < clustersRef.current.length; i += 1) {
          const text = clustersRef.current[i]
          const key = clusterKeysRef.current[i]
          if (!text || !key) continue
          push(`cluster:${key}`, text, [text.position.x, text.position.y, text.position.z])
        }
        return map
      },
      async applyClusterTexts(next) {
        let dirty = false
        const changed: Text[] = []
        for (let i = 0; i < clustersRef.current.length; i += 1) {
          const text = clustersRef.current[i]
          const key = clusterKeysRef.current[i]
          if (!text || !key || !next[key] || text.text === next[key]) continue
          text.text = next[key]!
          dirty = true
          changed.push(text)
        }
        if (!dirty || !batchRef.current) return false
        // D253：进层最多改一次合组文字。创建时已 batch.sync；这里若被调用再用 integration 的 syncText。
        await Promise.all(changed.map((text) => syncText(text, invalidate)))
        await new Promise<void>((resolve) => {
          batchRef.current?.sync(() => {
            bumpSync()
            resolve()
          })
        })
        invalidate()
        return true
      },
      orientToCamera(camera) {
        const host = groupRef.current
        const yaw = cameraLookYaw(camera, host)
        for (const text of [...membersRef.current, ...clustersRef.current]) {
          if (!text) continue
          text.rotation.y = yaw
          text.updateMatrix()
        }
        return (Math.abs(yaw) * 180) / Math.PI
      },
      applyPack(pack) {
        writePack(pack)
      },
      applyOpacity() {
        const fades = fadesRef.current
        for (let i = 0; i < membersRef.current.length; i += 1) {
          const text = membersRef.current[i]
          if (!text || text.scale.x <= 0.05) continue
          const fade = fades[i] ?? 1
          text.fillOpacity = fade
          text.outlineOpacity = fade * ROOM_LABEL_OUTLINE_OPACITY
        }
      },
      setBatchVisible(visible) {
        const batch = batchRef.current
        if (batch) batch.visible = visible
      },
    }
    return () => {
      measureRef.current = null
    }
  }, [invalidate, labels, measureRef, packGen])

  useFrame(() => {
    const pack = packRef.current
    let sig = ''
    for (const [id, row] of Object.entries(pack.byId)) {
      if (row.visible) sig += `${id}:${row.local?.join(',') ?? ''};`
    }
    for (const [key, row] of Object.entries(pack.clusters)) {
      if (row.visible) sig += `c${key}:${row.local?.join(',') ?? ''};`
    }
    if (sig === appliedPackRef.current) return
    writePack(pack)
    invalidate()
  })

  return <group ref={groupRef} name="RoomLabelBatch" />
}
