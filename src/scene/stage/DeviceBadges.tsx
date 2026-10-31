import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { blinkLive, subscribeBlink } from '../../frustum/blinkGate'
import { discreteAlarmLit, retainFrameChannel } from '../frameSchedule'
import { useTwinStore } from '../../store/store'
import { HiddenLayer, useLayerShown } from '../layerGate'
import {
  CanvasTexture,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  SRGBColorSpace,
  ShaderMaterial,
} from 'three'
import type { Device } from '../../types'
import { BADGE_SIZE, BADGE_Y, deviceBadges, STATUS_GLYPH } from './badges'

const scratch = new Matrix4()
const ZERO_DELTA = { x: 0, y: 0, z: 0 }

function badgePoseKey(): string {
  if (typeof window === 'undefined') return '0'
  const station = window.__twinStationExplode
  const floor = window.__twinExplode
  const frame = window.__twinStationFrame
  const hooked = typeof window.__twinBadgeExplodeDelta === 'function' ? 1 : 0
  return `${hooked}|${station?.progress ?? 0}|${floor?.progress ?? 0}|${frame?.axis ?? ''}|${frame?.keys.length ?? 0}|${frame?.radial ? 1 : 0}`
}

function badgeDelta(floorId: string, x: number, z: number) {
  if (typeof window === 'undefined') return ZERO_DELTA
  return window.__twinBadgeExplodeDelta?.(floorId, x, z, false) ?? ZERO_DELTA
}

/**
 * 一批 setMatrixAt，循环外只打一次 needsUpdate。
 * 位移来自工位分包安装的读数：badgeExplodeOffset / readExplodeMotion / readStationExplodeMotion。
 * 图层关掉时组件不挂，这里不改可见性。
 */
function writeDeviceBadgeMatrices(
  mesh: InstancedMesh,
  badges: ReturnType<typeof deviceBadges>,
  geometry: PlaneGeometry,
  floorId: string,
) {
  const attribute = geometry.getAttribute('aStatus') as InstancedBufferAttribute
  const hook = typeof window !== 'undefined' && typeof window.__twinBadgeExplodeDelta === 'function'
  mesh.userData.badgePoseOwned = hook
  mesh.userData.badgeFloorId = floorId
  mesh.userData.badgeRests = badges.map((badge) => ({ x: badge.x, y: BADGE_Y, z: badge.z }))
  badges.forEach((badge, index) => {
    const delta = badgeDelta(floorId, badge.x, badge.z)
    scratch.makeTranslation(badge.x + delta.x, BADGE_Y + delta.y, badge.z + delta.z)
    mesh.setMatrixAt(index, scratch)
    attribute.setX(index, STATUS_GLYPH[badge.status].index)
  })
  mesh.count = badges.length
  mesh.instanceMatrix.needsUpdate = true
  attribute.needsUpdate = true
  mesh.computeBoundingSphere()
}

const vertexShader = /* glsl */ `
attribute float aStatus;
uniform float uTime;
uniform float uDiscrete;
varying vec2 vUv;
varying float vStatus;

void main() {
  vUv = uv;
  vStatus = aStatus;
  float pulse = abs(aStatus - 2.0) < 0.5
    ? (uDiscrete > 0.5 ? (uTime > 0.5 ? 1.16 : 1.0) : 1.0 + 0.16 * sin(uTime * 3.0))
    : 1.0;
  vec4 worldCenter = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec4 mvPosition = viewMatrix * worldCenter;
  mvPosition.xy += position.xy * pulse;
  gl_Position = projectionMatrix * mvPosition;
}
`

const fragmentShader = /* glsl */ `
uniform sampler2D uAtlas;
uniform float uTime;
uniform float uDiscrete;
varying vec2 vUv;
varying float vStatus;

void main() {
  float u = (vUv.x + vStatus) / 4.0;
  vec4 tex = texture2D(uAtlas, vec2(u, vUv.y));
  if (tex.a < 0.45) discard;
  float glow = abs(vStatus - 2.0) < 0.5
    ? (uDiscrete > 0.5 ? (uTime > 0.5 ? 1.0 : 0.12) : 0.78 + 0.22 * sin(uTime * 3.0))
    : 1.0;
  gl_FragColor = linearToOutputTexel(vec4(tex.rgb * glow, 1.0));
}
`

function createBadgeAtlas(): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 64
  const context = canvas.getContext('2d')
  if (!context) throw new Error('圆标图集创建失败')
  const colors = ['#2fbf71', '#3d7dff', '#ff4d4f', '#8d96a3']
  colors.forEach((color, index) => {
    context.save()
    context.translate(index * 64, 0)
    context.fillStyle = color
    context.strokeStyle = color
    context.lineCap = 'round'
    context.lineWidth = 10
    if (index === 0) {
      context.beginPath()
      context.arc(32, 32, 22, 0, Math.PI * 2)
      context.fill()
    } else if (index === 1) {
      context.fillRect(10, 10, 44, 44)
    } else if (index === 2) {
      context.beginPath()
      context.moveTo(32, 8)
      context.lineTo(56, 54)
      context.lineTo(8, 54)
      context.closePath()
      context.fill()
    } else {
      context.beginPath()
      context.moveTo(14, 14)
      context.lineTo(50, 50)
      context.moveTo(50, 14)
      context.lineTo(14, 50)
      context.stroke()
    }
    context.restore()
  })
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

function DeviceBadgesLive({ floorId, devices }: { floorId: string; devices: Device[] }) {
  const badges = useMemo(() => deviceBadges(floorId, devices), [devices, floorId])
  const meshRef = useRef<InstancedMesh>(null)
  const poseKey = useRef('')
  const time = useRef({ value: 0 })
  const discrete = useRef({ value: 0 })
  const hasAlarm = badges.some((badge) => badge.status === 'alarm')
  // T076：视锥外松开告警续帧。标志没开时 blinkLive 恒为真，跟原来一样占着 alarm。
  useEffect(() => {
    if (!hasAlarm) return
    let release: (() => void) | undefined
    const sync = () => {
      if (blinkLive('alarm')) {
        release ??= retainFrameChannel('alarm')
        return
      }
      release?.()
      release = undefined
    }
    sync()
    const stop = subscribeBlink(sync)
    return () => {
      stop()
      release?.()
    }
  }, [hasAlarm])
  const resources = useMemo(() => {
    const texture = createBadgeAtlas()
    const geometry = new PlaneGeometry(BADGE_SIZE, BADGE_SIZE)
    geometry.setAttribute('aStatus', new InstancedBufferAttribute(new Float32Array(Math.max(badges.length, 1)), 1))
    const material = new ShaderMaterial({
      uniforms: {
        uAtlas: { value: texture },
        uTime: time.current,
        uDiscrete: discrete.current,
      },
      vertexShader,
      fragmentShader,
      transparent: false,
      depthWrite: true,
      toneMapped: false,
    })
    return { texture, geometry, material }
  }, [badges.length])

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh || badges.length === 0) return
    writeDeviceBadgeMatrices(mesh, badges, resources.geometry, floorId)
    poseKey.current = badgePoseKey()
  }, [badges, floorId, resources.geometry])

  useEffect(() => {
    const { texture, geometry, material } = resources
    return () => {
      texture.dispose()
      geometry.dispose()
      material.dispose()
    }
  }, [resources])

  useFrame(({ clock }) => {
    const mesh = meshRef.current
    const hook = typeof window !== 'undefined' && typeof window.__twinBadgeExplodeDelta === 'function'
    if (mesh && hook && badges.length > 0) {
      mesh.userData.badgePoseOwned = true
      // 动画中由工位分包写这一批，避免同一帧 needsUpdate 两次。落定或晚挂时在这里补上。
      const driveWriting = window.__twinStationExplode?.animating === true
      if (!driveWriting) {
        const key = badgePoseKey()
        if (key !== poseKey.current) {
          writeDeviceBadgeMatrices(mesh, badges, resources.geometry, floorId)
          poseKey.current = key
        }
      }
    }
    if (!blinkLive('alarm')) return
    const quality = useTwinStore.getState().quality
    if (quality === 'perf') {
      discrete.current.value = 1
      time.current.value = discreteAlarmLit(clock.elapsedTime) ? 1 : 0
      return
    }
    discrete.current.value = 0
    time.current.value = clock.elapsedTime
  })

  if (badges.length === 0) return null
  return (
    <instancedMesh
      ref={meshRef}
      name="DeviceBadges"
      args={[resources.geometry, resources.material, badges.length]}
      frustumCulled={false}
      castShadow={false}
      receiveShadow={false}
    />
  )
}

export function DeviceBadges({ floorId, devices }: { floorId: string; devices: Device[] }) {
  const on = useLayerShown('badges')
  if (!on) return <HiddenLayer />
  return <DeviceBadgesLive floorId={floorId} devices={devices} />
}
