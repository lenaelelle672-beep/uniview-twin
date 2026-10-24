import { Billboard } from '@react-three/drei/core/Billboard'
import { useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Texture } from 'three'
import { CanvasTexture } from 'three/src/textures/CanvasTexture.js'
import { floorSpec, isFloorId } from '../data/floors'
import { SLAB_M } from '../scene/stage/cut'
import { useTwinStore } from '../store/store'
import {
  PLAQUE_COUNT,
  PLAQUE_LIFT,
  cameraSampleMoved,
  plaquesForFloor,
  type CameraSample,
  type DemoPlaque,
} from './plaqueSpots'

const EMPTY_PLAQUES: readonly DemoPlaque[] = []

/**
 * T064：几块演示铭牌，用 drei Billboard 正对镜头。
 * 只在宿主放行之后才进这个分包。不替换实例化圆标，也不使用 Html。
 * CanvasTexture 从 three/src 引进，避免再从 three 入口点名。
 */

declare global {
  interface Window {
    __twinPlaques?: {
      demo: true
      floorId: string
      count: number
      follow: true
    }
  }
}

type Rig = {
  addEventListener?: (type: string, fn: () => void) => void
  removeEventListener?: (type: string, fn: () => void) => void
}

function paintPlaque(plaque: DemoPlaque): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 384
  canvas.height = 96
  const context = canvas.getContext('2d')
  if (!context) throw new Error('铭牌画布创建失败')
  context.fillStyle = '#122033'
  context.fillRect(0, 0, 384, 96)
  context.fillStyle = plaque.accent
  context.fillRect(0, 0, 14, 96)
  context.fillStyle = '#f4f1ea'
  context.font = '600 44px sans-serif'
  context.textBaseline = 'middle'
  context.fillText(plaque.label, 32, 48)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = 'srgb'
  texture.needsUpdate = true
  return texture
}

/** 铭牌可见时，镜头位移或转向才 invalidate。卸下后不再续帧。 */
function CameraKick() {
  const invalidate = useThree((state) => state.invalidate)
  const controls = useThree((state) => state.controls) as Rig | null
  const camera = useThree((state) => state.camera)
  const prev = useRef<CameraSample | null>(null)

  useLayoutEffect(() => {
    invalidate()
    return () => {
      invalidate()
    }
  }, [invalidate])

  useEffect(() => {
    if (!controls?.addEventListener || !controls.removeEventListener) return undefined
    const kick = () => {
      const next: CameraSample = {
        px: camera.position.x,
        py: camera.position.y,
        pz: camera.position.z,
        qx: camera.quaternion.x,
        qy: camera.quaternion.y,
        qz: camera.quaternion.z,
        qw: camera.quaternion.w,
      }
      if (!cameraSampleMoved(prev.current, next)) return
      prev.current = next
      invalidate()
    }
    controls.addEventListener('update', kick)
    controls.addEventListener('control', kick)
    kick()
    return () => {
      controls.removeEventListener?.('update', kick)
      controls.removeEventListener?.('control', kick)
    }
  }, [camera, controls, invalidate])

  return null
}

export function DemoPlaques() {
  const floorId = useTwinStore((state) =>
    state.view === 'floor' && state.selectedFloor && isFloorId(state.selectedFloor) ? state.selectedFloor : '',
  )
  const plaques = floorId ? plaquesForFloor(floorId) : EMPTY_PLAQUES
  const [textures, setTextures] = useState<CanvasTexture[] | null>(null)
  const invalidate = useThree((state) => state.invalidate)

  useEffect(() => {
    // 地上层和 B1 文案相同，纹理只做一份。
    const next = plaquesForFloor('F12').map((plaque) => paintPlaque(plaque))
    setTextures(next)
    return () => {
      for (const texture of next) texture.dispose()
      setTextures(null)
    }
  }, [])

  useLayoutEffect(() => {
    invalidate()
  }, [floorId, invalidate, textures])

  useEffect(() => {
    if (!floorId || !textures) {
      delete window.__twinPlaques
      return undefined
    }
    window.__twinPlaques = { demo: true, floorId, count: PLAQUE_COUNT, follow: true }
    return () => {
      delete window.__twinPlaques
    }
  }, [floorId, textures])

  if (!floorId || !textures || textures.length !== plaques.length) return null
  const y = floorSpec(floorId).elevation + SLAB_M + PLAQUE_LIFT
  return (
    <group name="DemoPlaques">
      <CameraKick />
      {plaques.map((plaque, index) => (
        <Billboard key={plaque.id} follow position={[plaque.x, y, plaque.z]}>
          <mesh name={`DemoPlaque-${plaque.id}`}>
            <planeGeometry args={[1.64, 0.42]} />
            {/* 2 = DoubleSide。正反都能看见，不从 three 入口再点这个常量。 */}
            <meshBasicMaterial map={textures[index] as unknown as Texture} toneMapped={false} side={2} />
          </mesh>
        </Billboard>
      ))}
    </group>
  )
}
