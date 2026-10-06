import { useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef, useState } from 'react'
import { DoubleSide, Group } from 'three'
import { addLabelPackSample, measureLabelPackSample } from '../labels/labelPackTiming'
import { disableTroikaCdnFallback } from './disableTroikaCdn'
import { BatchedText, Text, preloadFont } from 'troika-three-text'
import { ROOM_LABEL_FONT, type RoomLabel } from './roomLabels'

disableTroikaCdnFallback()

function syncText(text: Text, invalidate: () => void): Promise<void> {
  return new Promise((resolve) => {
    text.sync(() => {
      invalidate()
      resolve()
    })
  })
}

export function BatchedRoomLabels({
  floorId,
  labels,
  fontSize,
  outlineWidth,
  characters,
}: {
  floorId: string
  labels: RoomLabel[]
  fontSize: number
  outlineWidth: number
  characters: string
}) {
  disableTroikaCdnFallback()
  const groupRef = useRef<Group>(null)
  const batchRef = useRef<BatchedText | null>(null)
  const membersRef = useRef<Text[]>([])
  const fontSizeRef = useRef(fontSize)
  const outlineRef = useRef(outlineWidth)
  fontSizeRef.current = fontSize
  outlineRef.current = outlineWidth
  const [packGen, setPackGen] = useState(0)
  const scene = useThree((state) => state.scene)
  const invalidate = useThree((state) => state.invalidate)
  const signature = labels.map((label) => `${label.id}|${label.text}|${label.label.join(',')}`).join(';')

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
    const started = performance.now()

    void new Promise<void>((resolve) => {
      preloadFont({ font: ROOM_LABEL_FONT, characters }, () => resolve())
    })
      .then(async () => {
        if (cancelled) return
        const afterSdf = performance.now()
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
          text.position.set(label.label[0], label.label[1], label.label[2])
          text.frustumCulled = false
          batch.addText(text)
          members.push(text)
        }
        await Promise.all(members.map((text) => syncText(text, invalidate)))
        if (cancelled) return
        const afterLayout = performance.now()
        await new Promise<void>((resolve) => {
          batch?.sync(() => resolve())
        })
        if (cancelled || !batch) return
        const afterSync = performance.now()
        const materials = Array.isArray(batch.material) ? batch.material : [batch.material]
        for (const material of materials) {
          if (material) material.side = DoubleSide
        }
        for (const text of members) {
          text.fontSize = fontSizeRef.current
          text.outlineWidth = outlineRef.current
        }
        if (cancelled || !batch) return
        batch.visible = true
        group.add(batch)
        batchRef.current = batch
        membersRef.current = members
        addLabelPackSample(
          measureLabelPackSample({
            sdfWallMs: afterSdf - started,
            layoutWallMs: afterLayout - afterSdf,
            syncWallMs: afterSync - afterLayout,
            members,
          }),
        )
        setPackGen((value) => value + 1)
        invalidate()
      })
      .catch(() => {})

    return () => {
      cancelled = true
      membersRef.current = []
      batchRef.current = null
      if (batch) {
        group.remove(batch)
        batch.dispose()
      }
      for (const text of members) text.dispose()
    }
  }, [characters, invalidate, signature])

  useLayoutEffect(() => {
    const batch = batchRef.current
    const members = membersRef.current
    if (!batch || members.length === 0) return
    for (const text of members) {
      text.fontSize = fontSize
      text.outlineWidth = outlineWidth
    }
    batch.sync(() => invalidate())
  }, [fontSize, invalidate, outlineWidth, packGen])

  return <group ref={groupRef} name="RoomLabelBatch" />
}
