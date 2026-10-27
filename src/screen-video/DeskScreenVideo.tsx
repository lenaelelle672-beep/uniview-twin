import { Suspense, useEffect, useState } from 'react'
import { useVideoTexture } from '@react-three/drei/core/VideoTexture'
import { useThree } from '@react-three/fiber'
import {
  MONITOR_LAYER,
  SCREEN_RENDER_ORDER,
  SCREEN_VIDEO_SRC,
  posesEqual,
  screenPosesFromInstances,
  type ScreenPose,
} from './plan'

/**
 * T074：工位屏和摄像头预览。只在开关打开后才进这个分包。
 * 播 public/ 里的短 mp4。muted + playsInline + loop。
 * frameloop=demand：有新画面才 invalidate。
 */
export const SCREEN_VIDEO_IMPL = 'drei-useVideoTexture'

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
  return screenPosesFromInstances(host.matrixWorld.elements, host.instanceMatrix.array, host.count, camera)
}

function ignoreRaycast() {
  return null
}

function LiveScreens() {
  const invalidate = useThree((state) => state.invalidate)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)
  const texture = useVideoTexture(SCREEN_VIDEO_SRC, {
    muted: true,
    loop: true,
    playsInline: true,
    start: true,
    crossOrigin: 'anonymous',
    preload: 'auto',
    unsuspend: 'loadedmetadata',
    onVideoFrame: () => invalidate(),
  })
  const [poses, setPoses] = useState<ScreenPose[]>([])

  useEffect(() => {
    const video = texture.image as HTMLVideoElement
    video.muted = true
    video.defaultMuted = true
    video.playsInline = true
    video.loop = true
    texture.needsUpdate = true
    const scan = () => {
      const next = collectPoses(scene, camera.position)
      if (next.length === 0) video.pause()
      else if (video.paused) {
        const play = video.play()
        if (play && typeof play.catch === 'function') play.catch(() => {})
      }
      setPoses((prev) => (posesEqual(prev, next) ? prev : next))
      const probe = window.__twinScreenVideo
      if (probe) {
        probe.mounted = true
        probe.hls = false
        probe.impl = SCREEN_VIDEO_IMPL
        probe.src = SCREEN_VIDEO_SRC
        probe.muted = true
        probe.playsInline = true
        probe.loop = true
        probe.desks = next.filter((pose) => pose.kind === 'desk').length
        probe.camera = next.some((pose) => pose.kind === 'camera')
      }
      invalidate()
    }
    scan()
    const timer = window.setInterval(scan, 300)
    return () => {
      window.clearInterval(timer)
      video.pause()
      const probe = window.__twinScreenVideo
      if (probe) {
        probe.mounted = false
        probe.desks = 0
        probe.camera = false
      }
      invalidate()
    }
  }, [camera, invalidate, scene, texture])

  return (
    <group name="ScreenVideo">
      {poses.map((pose) => (
        <mesh
          key={pose.id}
          name={pose.kind === 'camera' ? 'CameraPreviewScreen' : 'DeskScreenVideo'}
          renderOrder={SCREEN_RENDER_ORDER}
          frustumCulled={false}
          raycast={ignoreRaycast}
          onUpdate={(mesh) => {
            mesh.matrixAutoUpdate = false
            mesh.matrix.fromArray(pose.elements)
            mesh.matrixWorldNeedsUpdate = true
            mesh.layers.set(MONITOR_LAYER)
          }}
        >
          <planeGeometry args={[pose.width, pose.height]} />
          <meshBasicMaterial map={texture} toneMapped={false} depthTest depthWrite />
        </mesh>
      ))}
    </group>
  )
}

export function DeskScreenVideo() {
  return (
    <Suspense fallback={null}>
      <LiveScreens />
    </Suspense>
  )
}
