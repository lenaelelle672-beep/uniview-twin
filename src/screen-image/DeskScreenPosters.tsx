import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Image } from '@react-three/drei/core/Image'
import { useThree } from '@react-three/fiber'
import { SRGBColorSpace, Texture, type Mesh } from 'three'
import {
  CAMERA_POSTER_SRC,
  DESK_POSTER_SRC,
  MONITOR_LAYER,
  POSTER_RENDER_ORDER,
  SCREEN_POSTER_CAP,
  assertLocalPosterUrl,
  posterPosesFromInstances,
  posesEqual,
  type ScreenPose,
} from './plan'

/**
 * T079：工位屏和摄像头预览的静态海报。只在开关打开后才进这个分包。
 * drei Image 默认是 planeGeometry。segments 为 1，radius 为 0，保持直角平面。
 * 贴图来自 public/textures/screens。视频关着时这些面仍然可见。
 */
export const SCREEN_IMAGE_IMPL = 'drei-Image'

interface InstanceHost {
  count: number
  matrixWorld: { elements: ArrayLike<number> }
  instanceMatrix?: { array?: ArrayLike<number> }
  updateWorldMatrix: (updateParents: boolean, updateChildren: boolean) => void
}

function readHost(scene: { getObjectByName: (name: string) => unknown }): InstanceHost | null {
  const found = scene.getObjectByName('WorkstationMonitors')
  if (!found || typeof found !== 'object') return null
  const host = found as Partial<InstanceHost>
  if (typeof host.count !== 'number' || typeof host.updateWorldMatrix !== 'function') return null
  if (!host.matrixWorld || !host.instanceMatrix?.array) return null
  return host as InstanceHost
}

function collectPoses(scene: { getObjectByName: (name: string) => unknown }, camera: { x: number; y: number; z: number }): ScreenPose[] {
  const host = readHost(scene)
  if (!host?.instanceMatrix?.array) return []
  host.updateWorldMatrix(true, false)
  return posterPosesFromInstances(host.matrixWorld.elements, host.instanceMatrix.array, host.count, camera)
}

function ignoreRaycast() {
  return null
}

function applyPose(mesh: Mesh, pose: ScreenPose): void {
  mesh.matrixAutoUpdate = false
  mesh.matrix.fromArray(pose.elements)
  const e = mesh.matrix.elements
  const w = pose.width
  const h = pose.height
  e[0] *= w
  e[4] *= h
  e[1] *= w
  e[5] *= h
  e[2] *= w
  e[6] *= h
  e[3] *= w
  e[7] *= h
  mesh.matrixWorldNeedsUpdate = true
  mesh.layers.set(MONITOR_LAYER)
}

function useLocalPoster(url: string): Texture | null {
  const safe = assertLocalPosterUrl(url)
  const invalidate = useThree((state) => state.invalidate)
  const [map, setMap] = useState<Texture | null>(null)
  useEffect(() => {
    let disposed = false
    const image = document.createElement('img')
    image.decoding = 'async'
    image.src = safe
    let texture: Texture | null = null
    image.onload = () => {
      if (disposed) return
      texture = new Texture(image)
      texture.colorSpace = SRGBColorSpace
      texture.needsUpdate = true
      setMap(texture)
      invalidate()
    }
    image.onerror = () => {
      texture?.dispose()
    }
    return () => {
      disposed = true
      image.onload = null
      image.onerror = null
      texture?.dispose()
    }
  }, [invalidate, safe])
  return map
}

function PosterPlane({ pose, map }: { pose: ScreenPose; map: Texture }) {
  const ref = useRef<Mesh>(null)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (mesh) applyPose(mesh, pose)
  }, [pose])
  return (
    <Image
      ref={ref}
      name={pose.kind === 'camera' ? 'CameraPreviewPoster' : 'DeskScreenPoster'}
      texture={map}
      scale={[pose.width, pose.height]}
      segments={1}
      radius={0}
      zoom={1}
      toneMapped={false}
      transparent={false}
      frustumCulled={false}
      renderOrder={POSTER_RENDER_ORDER}
      raycast={ignoreRaycast}
      matrixAutoUpdate={false}
      onUpdate={(mesh) => applyPose(mesh, pose)}
    />
  )
}

function LivePosters() {
  const invalidate = useThree((state) => state.invalidate)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)
  const deskMap = useLocalPoster(DESK_POSTER_SRC)
  const cameraMap = useLocalPoster(CAMERA_POSTER_SRC)
  const [poses, setPoses] = useState<ScreenPose[]>([])

  useEffect(() => {
    const scan = () => {
      const next = collectPoses(scene, camera.position)
      setPoses((prev) => (posesEqual(prev, next) ? prev : next))
    }
    scan()
    const timer = window.setInterval(scan, 300)
    return () => window.clearInterval(timer)
  }, [camera, scene])

  useEffect(() => {
    const probe = window.__twinScreenImage
    if (probe) {
      probe.mounted = true
      probe.impl = SCREEN_IMAGE_IMPL
      probe.rounded = false
      probe.cap = SCREEN_POSTER_CAP
      probe.deskSrc = DESK_POSTER_SRC
      probe.cameraSrc = CAMERA_POSTER_SRC
      probe.desks = poses.filter((pose) => pose.kind === 'desk').length
      probe.camera = poses.some((pose) => pose.kind === 'camera')
    }
    invalidate()
    return () => {
      const current = window.__twinScreenImage
      if (current) {
        current.mounted = false
        current.desks = 0
        current.camera = false
      }
      invalidate()
    }
  }, [cameraMap, deskMap, invalidate, poses])

  return (
    <group name="ScreenPosters">
      {poses.map((pose) => {
        const map = pose.kind === 'camera' ? cameraMap : deskMap
        if (!map) return null
        return <PosterPlane key={pose.id} pose={pose} map={map} />
      })}
    </group>
  )
}

export function DeskScreenPosters() {
  return <LivePosters />
}
