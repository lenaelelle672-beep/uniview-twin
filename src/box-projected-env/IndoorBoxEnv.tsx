import { useBoxProjectedEnv as useBoxProjectedEnvHook } from '@react-three/drei/core/useBoxProjectedEnv'
import { useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useState } from 'react'
import {
  attachIndoorProjection,
  collectIndoorMaterials,
  detachIndoorProjection,
  sameMaterials,
  type BoxCompile,
  type PatchableMaterial,
} from './collect'
import { measureFloorRoom } from './measure'
import { isLocalBoxHdr, sameRoomBox, type RoomBox } from './plan'
import { noteBoxEnvDetached, noteBoxEnvMounted } from './probe'

/**
 * T127：drei useBoxProjectedEnv。
 * 钩子只提供 onBeforeCompile，源码没有 useFrame。这里也不加帧回调。
 * 环境贴图沿用 LocalEnvironment 已经放进场景的本地 HDR，本组件不加载贴图。
 * 离开房间时父级卸掉本组件，效果清理会把室内材质的编译钩子交还。
 */

type Projection = {
  ref: { current: { needsUpdate: boolean } | null }
  onBeforeCompile: BoxCompile
  customProgramCacheKey: () => string
}

const useBoxProjectedEnv = useBoxProjectedEnvHook as (
  position: [number, number, number],
  size: [number, number, number],
) => Projection

/** 钩子的 layout effect 会读 ref.current.needsUpdate。没有材质时也不能是 null。 */
const REF_FALLBACK = { needsUpdate: false }

interface Snap {
  floorId: string
  box: RoomBox
  materials: PatchableMaterial[]
}

function readHdr(): string | null {
  const url = window.__twinEnv?.url
  return isLocalBoxHdr(url) ? url : null
}

export function IndoorBoxEnv({
  floorId,
  elevation,
  height,
}: {
  floorId: string
  elevation: number
  height: number
}) {
  const scene = useThree((state) => state.scene)
  const [snap, setSnap] = useState<Snap | null>(null)
  const [hdr, setHdr] = useState<string | null>(null)

  useEffect(() => {
    let stop = false
    const pull = () => {
      if (stop) return
      const nextHdr = readHdr()
      setHdr((prev) => (prev === nextHdr ? prev : nextHdr))
      const box = nextHdr ? measureFloorRoom(scene, elevation, height) : null
      const interior = box ? scene.getObjectByName('FloorInterior') : null
      const materials = interior ? collectIndoorMaterials(interior) : []
      setSnap((prev) => {
        if (!box || !nextHdr || materials.length === 0) return null
        if (
          prev &&
          prev.floorId === floorId &&
          sameRoomBox(prev.box, box) &&
          sameMaterials(prev.materials, materials)
        ) {
          return prev
        }
        return { floorId, box, materials }
      })
    }
    pull()
    const id = window.setInterval(pull, 200)
    return () => {
      stop = true
      window.clearInterval(id)
    }
  }, [elevation, floorId, height, scene])

  if (!snap || !hdr) return null
  return <Projected snap={snap} hdr={hdr} />
}

function Projected({ snap, hdr }: { snap: Snap; hdr: string }) {
  const invalidate = useThree((state) => state.invalidate)
  const projection = useBoxProjectedEnv(snap.box.position, snap.box.size)
  const host = snap.materials[0]
  projection.ref.current = host ?? REF_FALLBACK

  useLayoutEffect(() => {
    if (!host) return
    const count = attachIndoorProjection(snap.materials, projection.onBeforeCompile, projection.customProgramCacheKey)
    noteBoxEnvMounted({ hdr, box: snap.box, materials: count })
    invalidate()
    return () => {
      detachIndoorProjection(snap.materials)
      noteBoxEnvDetached()
      invalidate()
    }
  }, [hdr, host, invalidate, projection, snap])

  return null
}
