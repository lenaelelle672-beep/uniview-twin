import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef, useState, type MutableRefObject } from 'react'
import { DoubleSide, Group, Vector3, type Camera } from 'three'
import { disableTroikaCdnFallback } from './disableTroikaCdn'
import { BatchedText, Text, preloadFont } from 'troika-three-text'
import { clusterTemplates, LABEL_MAX_EMS, type LabelPackState, type LabelPlacementState } from './labelAvoidance'
import { ROOM_LABEL_FONT, type RoomLabel } from './roomLabels'

disableTroikaCdnFallback()

function syncText(text: Text): Promise<void> {
  return new Promise((resolve) => {
    text.sync(() => resolve())
  })
}

function applyMemberFades(members: Text[], fades: number[] | undefined) {
  for (let i = 0; i < members.length; i += 1) {
    const fade = fades?.[i] ?? 1
    const text = members[i]
    if (!text) continue
    text.fillOpacity = fade
    text.outlineOpacity = fade
  }
}

function applyWrap(text: Text, fontSize: number) {
  text.maxWidth = fontSize * LABEL_MAX_EMS
  text.overflowWrap = 'break-word'
  text.whiteSpace = 'normal'
}

const world = new Vector3()

function applyPlacement(
  text: Text,
  base: [number, number, number],
  placement: LabelPlacementState | undefined,
  fade: number,
  host: Group | null,
  camera: Camera,
  size: { width: number; height: number },
  show: boolean,
) {
  const visible = show && (placement?.visible ?? true)
  text.fillOpacity = visible ? fade : 0
  text.outlineOpacity = visible ? fade : 0
  text.scale.setScalar(visible ? 1 : 0.001)
  const ox = placement?.offsetX ?? 0
  const oy = placement?.offsetY ?? 0
  if (!visible || (ox === 0 && oy === 0)) {
    text.position.set(base[0], base[1], base[2])
    text.updateMatrix()
    return
  }
  world.set(base[0], base[1], base[2])
  host?.localToWorld(world)
  world.project(camera)
  world.x += (ox / Math.max(size.width, 1)) * 2
  world.y -= (oy / Math.max(size.height, 1)) * 2
  world.unproject(camera)
  host?.worldToLocal(world)
  text.position.copy(world)
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
}: {
  floorId: string
  labels: RoomLabel[]
  fontSize: number
  outlineWidth: number
  characters: string
  fadesRef: MutableRefObject<number[]>
  packRef: MutableRefObject<LabelPackState>
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
  const invalidate = useThree((state) => state.invalidate)
  const signature = labels.map((label) => `${label.id}|${label.text}|${label.label.join(',')}`).join(';')
  const clusters = clusterTemplates(labels)

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
    if (!group || labels.length === 0) return
    let cancelled = false
    let batch: BatchedText | null = null
    const members: Text[] = []
    const clusterMembers: Text[] = []
    const started = performance.now()

    void new Promise<void>((resolve) => {
      preloadFont({ font: ROOM_LABEL_FONT, characters }, () => resolve())
    })
      .then(async () => {
        if (cancelled) return
        batch = new BatchedText()
        batch.name = 'RoomLabelBatchedText'
        batch.font = ROOM_LABEL_FONT
        batch.color = '#17324d'
        batch.outlineColor = '#f7f4ee'
        batch.anchorX = 'center'
        batch.anchorY = 'middle'
        batch.renderOrder = 3
        batch.visible = false
        batch.frustumCulled = false
        for (const label of labels) {
          const text = new Text()
          text.text = label.text
          text.font = ROOM_LABEL_FONT
          text.fontSize = fontSizeRef.current
          text.color = '#17324d'
          text.outlineWidth = outlineRef.current
          text.outlineColor = '#f7f4ee'
          text.anchorX = 'center'
          text.anchorY = 'middle'
          text.characters = characters
          applyWrap(text, fontSizeRef.current)
          text.position.set(label.label[0], label.label[1], label.label[2])
          text.frustumCulled = false
          batch.addText(text)
          members.push(text)
        }
        for (const cluster of clusters) {
          const text = new Text()
          text.text = cluster.text
          text.font = ROOM_LABEL_FONT
          text.fontSize = fontSizeRef.current
          text.color = '#17324d'
          text.outlineWidth = outlineRef.current
          text.outlineColor = '#f7f4ee'
          text.anchorX = 'center'
          text.anchorY = 'middle'
          text.characters = characters
          applyWrap(text, fontSizeRef.current)
          text.position.set(cluster.label[0], cluster.label[1], cluster.label[2])
          text.scale.setScalar(0.001)
          text.frustumCulled = false
          batch.addText(text)
          clusterMembers.push(text)
        }
        await Promise.all([...members, ...clusterMembers].map((text) => syncText(text)))
        if (cancelled) return
        await new Promise<void>((resolve) => {
          batch?.sync(() => resolve())
        })
        if (cancelled || !batch) return
        const materials = Array.isArray(batch.material) ? batch.material : [batch.material]
        for (const material of materials) {
          if (material) material.side = DoubleSide
        }
        for (const text of [...members, ...clusterMembers]) {
          text.fontSize = fontSizeRef.current
          text.outlineWidth = outlineRef.current
          applyWrap(text, fontSizeRef.current)
        }
        applyMemberFades(members, fadesRef.current)
        if (cancelled || !batch) return
        batch.visible = true
        group.add(batch)
        batchRef.current = batch
        membersRef.current = members
        clustersRef.current = clusterMembers
        clusterKeysRef.current = clusters.map((item) => item.key)
        window.__twinLabelPackMs = performance.now() - started
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
      if (batch) {
        group.remove(batch)
        batch.dispose()
      }
      for (const text of [...members, ...clusterMembers]) text.dispose()
    }
  }, [characters, invalidate, signature])

  useLayoutEffect(() => {
    const batch = batchRef.current
    const members = membersRef.current
    const clusterMembers = clustersRef.current
    if (!batch || members.length === 0) return
    for (const text of [...members, ...clusterMembers]) {
      text.fontSize = fontSize
      text.outlineWidth = outlineWidth
      applyWrap(text, fontSize)
    }
    applyMemberFades(members, fadesRef.current)
    batch.sync(() => invalidate())
  }, [fadesRef, fontSize, invalidate, outlineWidth, packGen])

  useFrame(({ camera, size }) => {
    const members = membersRef.current
    if (members.length === 0) return
    applyMemberFades(members, fadesRef.current)
    const host = groupRef.current
    const pack = packRef.current
    const fades = fadesRef.current
    for (let i = 0; i < members.length; i += 1) {
      const label = labels[i]
      const text = members[i]
      if (!label || !text) continue
      applyPlacement(text, label.label, pack.byId[label.id], fades[i] ?? 1, host, camera, size, true)
    }
    for (let i = 0; i < clustersRef.current.length; i += 1) {
      const cluster = clusters[i]
      const text = clustersRef.current[i]
      if (!cluster || !text) continue
      const show = Boolean(pack.clusters[cluster.key])
      applyPlacement(
        text,
        cluster.label,
        { visible: show, cluster: cluster.key, offsetX: 0, offsetY: 0 },
        1,
        host,
        camera,
        size,
        show,
      )
    }
  })

  return <group ref={groupRef} name="RoomLabelBatch" />
}
