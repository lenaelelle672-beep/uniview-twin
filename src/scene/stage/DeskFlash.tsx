import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Color, InstancedMesh, Mesh } from 'three'
import { resolveWorkstationRef } from '../../locate/ref'
import { useTwinStore } from '../../store/store'
import { ALARM_MARKER_ORDER } from '../overlayOrder'
import { workstationPosition } from './workstationPosition'

const FLASH_MS = 3000
const BASE = new Color('#ffffff')
const HOT = new Color('#ff6a00')

export function DeskFlash({ floorId }: { floorId: string }) {
  const focusedDeskId = useTwinStore((state) => state.focusedDeskId)
  const focusSeq = useTwinStore((state) => state.focusSeq)
  const desks = useTwinStore((state) => state.desks)
  const ring = useRef<Mesh>(null)
  const [alive, setAlive] = useState(false)
  const started = useRef(0)
  const tinted = useRef<InstancedMesh | null>(null)
  const tintedIndex = useRef(-1)

  const target = focusedDeskId ? resolveWorkstationRef(focusedDeskId) : null
  const deskId = target && target.floorId === floorId ? target.deskId : null
  const deskIndex = useMemo(() => {
    if (!deskId) return -1
    const ordered = desks.filter((desk) => desk.floorId === floorId).sort((left, right) => left.index - right.index)
    return ordered.findIndex((desk) => desk.id === deskId)
  }, [deskId, desks, floorId])
  const place = deskId ? workstationPosition(floorId, deskId) : null

  useEffect(() => {
    if (!deskId) return
    started.current = performance.now()
    setAlive(true)
    window.__twinHighlight = deskId
    let timer = window.setTimeout(() => {
      setAlive(false)
      if (window.__twinHighlight === deskId) delete window.__twinHighlight
    }, 12000)
    const onRest = () => {
      window.clearTimeout(timer)
      started.current = performance.now()
      setAlive(true)
      window.__twinHighlight = deskId
      timer = window.setTimeout(() => {
        setAlive(false)
        if (window.__twinHighlight === deskId) delete window.__twinHighlight
      }, FLASH_MS)
    }
    window.addEventListener('twin-locate-rest', onRest)
    if (window.__twinLocate?.deskId === deskId) onRest()
    return () => {
      window.removeEventListener('twin-locate-rest', onRest)
      window.clearTimeout(timer)
      if (window.__twinHighlight === deskId) delete window.__twinHighlight
    }
  }, [deskId, focusSeq])

  useEffect(() => {
    return () => restoreTint(tinted.current, tintedIndex.current)
  }, [])

  useFrame(({ scene, clock }) => {
    const mesh = scene.getObjectByName('WorkstationDesks') as InstancedMesh | undefined
    if (!alive || !mesh || deskIndex < 0) {
      restoreTint(tinted.current, tintedIndex.current)
      tinted.current = null
      tintedIndex.current = -1
      return
    }
    const elapsed = (performance.now() - started.current) / 1000
    if (tinted.current && (tinted.current !== mesh || tintedIndex.current !== deskIndex)) {
      restoreTint(tinted.current, tintedIndex.current)
    }
    const pulse = 0.35 + 0.65 * Math.abs(Math.sin(elapsed * 9))
    mesh.setColorAt(deskIndex, BASE.clone().lerp(HOT, pulse))
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    tinted.current = mesh
    tintedIndex.current = deskIndex
    const material = ring.current?.material
    if (material && 'opacity' in material) {
      material.opacity = 0.35 + 0.65 * Math.abs(Math.sin(clock.elapsedTime * 8))
    }
  })

  if (!alive || !place) return null
  return (
    <mesh
      ref={ring}
      name="DeskFlash"
      position={[place.x, 0.08, place.z]}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={ALARM_MARKER_ORDER}
    >
      <ringGeometry args={[0.95, 1.28, 40]} />
      <meshBasicMaterial color="#ff8a00" transparent opacity={1} depthTest={false} depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

function restoreTint(mesh: InstancedMesh | null, index: number) {
  if (!mesh || index < 0) return
  mesh.setColorAt(index, BASE)
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
}
