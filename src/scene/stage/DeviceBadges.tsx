import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { discreteAlarmLit, retainFrameChannel } from '../frameSchedule'
import { useTwinStore } from '../../store/store'
import {
  CanvasTexture,
  InstancedBufferAttribute,
  InstancedMesh,
  Object3D,
  PlaneGeometry,
  SRGBColorSpace,
  ShaderMaterial,
} from 'three'
import type { Device } from '../../types'
import { BADGE_SIZE, BADGE_Y, deviceBadges, STATUS_GLYPH } from './badges'

const dummy = new Object3D()

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
    ? (uDiscrete > 0.5 ? (uTime > 0.5 ? 1.16 : 1.0) : 1.0 + 0.16 * sin(uTime * 5.0))
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
    ? (uDiscrete > 0.5 ? (uTime > 0.5 ? 1.0 : 0.12) : 0.78 + 0.22 * sin(uTime * 5.0))
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

export function DeviceBadges({ floorId, devices }: { floorId: string; devices: Device[] }) {
  const badges = useMemo(() => deviceBadges(floorId, devices), [devices, floorId])
  const meshRef = useRef<InstancedMesh>(null)
  const time = useRef({ value: 0 })
  const discrete = useRef({ value: 0 })
  const hasAlarm = badges.some((badge) => badge.status === 'alarm')
  useEffect(() => (hasAlarm ? retainFrameChannel('alarm') : undefined), [hasAlarm])
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
    const attribute = resources.geometry.getAttribute('aStatus') as InstancedBufferAttribute
    badges.forEach((badge, index) => {
      dummy.position.set(badge.x, BADGE_Y, badge.z)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
      attribute.setX(index, STATUS_GLYPH[badge.status].index)
    })
    mesh.count = badges.length
    mesh.instanceMatrix.needsUpdate = true
    attribute.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [badges, resources.geometry])

  useEffect(() => {
    const { texture, geometry, material } = resources
    return () => {
      texture.dispose()
      geometry.dispose()
      material.dispose()
    }
  }, [resources])

  useFrame(({ clock }) => {
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
