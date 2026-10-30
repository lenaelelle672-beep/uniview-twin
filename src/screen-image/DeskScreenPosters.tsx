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
  }, [safe])
  return map
}

function PosterPlane({
  pose,
  slot,
  map,
  livePose,
  bindMesh,
}: {
  pose: ScreenPose
  slot: string
  map: Texture
  livePose: (slot: string, fallback: ScreenPose) => ScreenPose
  bindMesh: (slot: string, mesh: Mesh | null) => void
}) {
  const ref = useRef<Mesh>(null)
  useLayoutEffect(() => {
    const mesh = ref.current
    bindMesh(slot, mesh)
    if (mesh) applyPose(mesh, livePose(slot, pose))
    return () => bindMesh(slot, null)
  }, [bindMesh, livePose, pose, slot])
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
      onUpdate={(mesh) => applyPose(mesh, livePose(slot, pose))}
    />
  )
}

function LivePosters() {
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)
  const deskMap = useLocalPoster(DESK_POSTER_SRC)
  const cameraMap = useLocalPoster(CAMERA_POSTER_SRC)
  const [poses, setPoses] = useState<ScreenPose[]>([])
  const posesRef = useRef<ScreenPose[]>([])
  const meshes = useRef(new Map<string, Mesh>())
  const bindMesh = useRef((slot: string, mesh: Mesh | null) => {
    if (mesh) meshes.current.set(slot, mesh)
    else meshes.current.delete(slot)
  }).current
  const livePose = useRef((slot: string, fallback: ScreenPose) => {
    const index = Number(slot.slice(slot.indexOf(':') + 1))
    return posesRef.current[index] ?? fallback
  }).current

  const publishPoses = (next: ScreenPose[]) => {
    const prev = posesRef.current
    if (posesEqual(prev, next)) return
    const sameShape =
      prev.length === next.length && prev.every((pose, index) => pose.kind === next[index]?.kind)
    posesRef.current = next
    if (!sameShape) {
      setPoses(next)
      return
    }
    // 张数和种类没变就地改矩阵。换最近的工位也不 setState，避免停稳后再提交一帧。
    next.forEach((pose, index) => {
      const mesh = meshes.current.get(`${pose.kind}:${index}`)
      if (mesh) applyPose(mesh, pose)
    })
  }

  const scanRef = useRef(() => {})
  scanRef.current = () => publishPoses(collectPoses(scene, camera.position))

  useEffect(() => {
    let timer = 0
    const scan = () => {
      scanRef.current()
      // 姿势一旦有了就停。300ms 再扫会在 1.8 秒里凑满 6 次提交。之后只跟已经在画的帧。
      if (posesRef.current.length > 0 && timer) {
        window.clearInterval(timer)
        timer = 0
      }
    }
    scan()
    if (posesRef.current.length === 0) timer = window.setInterval(scan, 300)
    const root = (scene as { __r3f?: { root?: { getState: () => { internal?: { subscribe?: (ref: { current: () => void }, priority: number, store: unknown) => () => void } } } } }).__r3f?.root
    const subscribe = root?.getState().internal?.subscribe
    // priority 0 与工位 onFrame 相同。后挂上的回调排在后面，能读到这一帧刚写完的实例矩阵。
    // 正优先级会关掉 R3F 自己的渲染，不能用。
    const stop = subscribe ? subscribe({ current: () => scanRef.current() }, 0, root) : undefined
    return () => {
      if (timer) window.clearInterval(timer)
      stop?.()
    }
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
    return () => {
      const current = window.__twinScreenImage
      if (current) {
        current.mounted = false
        current.desks = 0
        current.camera = false
      }
    }
  }, [cameraMap, deskMap, poses])

  return (
    <group name="ScreenPosters">
      {poses.map((pose, index) => {
        const map = pose.kind === 'camera' ? cameraMap : deskMap
        if (!map) return null
        return (
          <PosterPlane
            key={`${pose.kind}:${index}`}
            slot={`${pose.kind}:${index}`}
            pose={pose}
            map={map}
            livePose={livePose}
            bindMesh={bindMesh}
          />
        )
      })}
    </group>
  )
}

export function DeskScreenPosters() {
  return <LivePosters />
}
