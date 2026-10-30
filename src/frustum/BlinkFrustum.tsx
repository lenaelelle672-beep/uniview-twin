import { useFrame, useThree } from '@react-three/fiber'
import { useIntersect } from '@react-three/drei/core/useIntersect.js'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { emitBlink, type FrustumBlinkState } from './blinkGate'
import { useFrustumLoop } from './loopBind'
import {
  FAR_LAMP_CAP,
  FLASH_SENTINEL_RADIUS,
  LAMP_SENTINEL_RADIUS,
  farthestLampIndexes,
  hideInstance,
  instanceWorld,
  readInstance,
  restoreInstance,
  transformSphere,
  unionSphere,
  type SpherePoint,
} from './plan'

/**
 * T076：drei useIntersect。物体被画进当前视锥时，three 才调用 onBeforeRender。
 * 这不是页面级画布可见性（那条只观察 DOM），也不按距离换模型。
 * useIntersect 只收一个可见回调。
 * demand 停帧后检测也会停。重新进入视锥时补一帧，闪烁和被藏起的远距道具才能回来。
 * 初始可见性在发现宿主的那一帧里用投影视锥算完，不再把哨兵放大再缩回来。
 * 哨兵槽在视锥组件挂上时一次建完。宿主晚到（出齐窗后的圆标）只改位置，不再 setState。
 */

interface SceneNode {
  name: string
  visible: boolean
  children: SceneNode[]
  isMesh?: boolean
  matrixWorld: { elements: ArrayLike<number> }
  geometry?: {
    boundingSphere?: { center: { x: number; y: number; z: number }; radius: number } | null
  }
  boundingSphere?: { center: { x: number; y: number; z: number }; radius: number } | null
  material?: { name?: string } | Array<{ name?: string }>
  count?: number
  instanceMatrix?: { array: Float32Array; needsUpdate: boolean }
  updateWorldMatrix?: (updateParents: boolean, updateChildren: boolean) => void
}

interface SentinelProps {
  place: () => SpherePoint | null
  scale: number
  onVisible: (visible: boolean) => void
}

const clip = new Float64Array(16)

function sentinelRadius(point: SpherePoint, scale: number): number {
  return Math.max(point.r * scale, 0.4)
}

function planeDistance(a: number, b: number, c: number, d: number, x: number, y: number, z: number): number {
  return (a * x + b * y + c * z + d) / (Math.hypot(a, b, c) || 1)
}

/** 与 three Frustum.setFromProjectionMatrix + intersectsSphere 同一套裁剪平面。不把 three 打进视锥分包。 */
function sphereInView(
  camera: {
    projectionMatrix: { elements: ArrayLike<number> }
    matrixWorldInverse: { elements: ArrayLike<number> }
  },
  point: SpherePoint,
  scale: number,
): boolean {
  const p = camera.projectionMatrix.elements
  const v = camera.matrixWorldInverse.elements
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0
      for (let k = 0; k < 4; k += 1) sum += (p[k * 4 + row] ?? 0) * (v[col * 4 + k] ?? 0)
      clip[col * 4 + row] = sum
    }
  }
  const m3 = clip[3] ?? 0
  const m7 = clip[7] ?? 0
  const m11 = clip[11] ?? 0
  const m15 = clip[15] ?? 0
  const radius = sentinelRadius(point, scale)
  const x = point.x
  const y = point.y
  const z = point.z
  const outside = (a: number, b: number, c: number, d: number) => planeDistance(a, b, c, d, x, y, z) < -radius
  return !(
    outside(m3 - (clip[0] ?? 0), m7 - (clip[4] ?? 0), m11 - (clip[8] ?? 0), m15 - (clip[12] ?? 0)) ||
    outside(m3 + (clip[0] ?? 0), m7 + (clip[4] ?? 0), m11 + (clip[8] ?? 0), m15 + (clip[12] ?? 0)) ||
    outside(m3 + (clip[1] ?? 0), m7 + (clip[5] ?? 0), m11 + (clip[9] ?? 0), m15 + (clip[13] ?? 0)) ||
    outside(m3 - (clip[1] ?? 0), m7 - (clip[5] ?? 0), m11 - (clip[9] ?? 0), m15 - (clip[13] ?? 0)) ||
    outside(m3 - (clip[2] ?? 0), m7 - (clip[6] ?? 0), m11 - (clip[10] ?? 0), m15 - (clip[14] ?? 0)) ||
    outside(m3 + (clip[2] ?? 0), m7 + (clip[6] ?? 0), m11 + (clip[10] ?? 0), m15 + (clip[14] ?? 0))
  )
}

function materialNames(material: SceneNode['material']): string[] {
  if (!material) return []
  if (Array.isArray(material)) return material.map((item) => item.name ?? '')
  return [material.name ?? '']
}

function isLamp(node: SceneNode): boolean {
  return materialNames(node.material).some((name) => name.startsWith('lamp'))
}

function isSign(node: SceneNode): boolean {
  return materialNames(node.material).some(
    (name) => name === 'sign_face' || name === 'sign_face_cn' || name === 'sign_body',
  )
}

function eachNode(node: SceneNode, visit: (node: SceneNode) => void): void {
  if (node.name === 'FrustumPause' || node.name === 'FrustumSentinel') return
  visit(node)
  for (const child of node.children) eachNode(child, visit)
}

function meshSphere(node: SceneNode, fallbackRadius: number): SpherePoint {
  node.updateWorldMatrix?.(true, false)
  const local = node.geometry?.boundingSphere ?? node.boundingSphere
  if (local) return transformSphere(node.matrixWorld.elements, local.center, local.radius)
  const elements = node.matrixWorld.elements
  return { x: elements[12] ?? 0, y: elements[13] ?? 0, z: elements[14] ?? 0, r: fallbackRadius }
}

function Sentinel({ place, scale, onVisible }: SentinelProps) {
  const placeRef = useRef(place)
  const scaleRef = useRef(scale)
  const onRef = useRef(onVisible)
  placeRef.current = place
  scaleRef.current = scale
  onRef.current = onVisible
  const placed = useRef(false)
  const ref = useIntersect((visible: boolean) => {
    if (!placed.current) return
    onRef.current(visible)
  })

  const apply = () => {
    const mesh = ref.current as {
      visible: boolean
      position: { set: (x: number, y: number, z: number) => void }
      scale: { setScalar: (value: number) => void }
    } | null
    if (!mesh) return
    const sphere = placeRef.current()
    if (!sphere) {
      mesh.visible = false
      return
    }
    mesh.visible = true
    mesh.position.set(sphere.x, sphere.y, sphere.z)
    mesh.scale.setScalar(sentinelRadius(sphere, scaleRef.current))
    placed.current = true
  }

  useLayoutEffect(() => {
    apply()
  }, [])

  useFrame(() => {
    apply()
  })

  return (
    <mesh
      ref={ref}
      name="FrustumSentinel"
      frustumCulled
      castShadow={false}
      receiveShadow={false}
      raycast={() => {}}
    >
      <sphereGeometry args={[1, 5, 4]} />
      <meshBasicMaterial colorWrite={false} depthWrite={false} depthTest={false} toneMapped={false} />
    </mesh>
  )
}

interface SavedInstance {
  matrix: { array: Float32Array; needsUpdate: boolean }
  index: number
  values: number[]
}

function samePublish(left: FrustumBlinkState, right: FrustumBlinkState): boolean {
  return (
    left.on === right.on &&
    left.reason === right.reason &&
    left.scale === right.scale &&
    left.primed === right.primed &&
    left.alarm === right.alarm &&
    left.flash === right.flash &&
    left.sign === right.sign &&
    left.lamps === right.lamps &&
    left.lampsHidden === right.lampsHidden
  )
}

const SENTINEL_KEYS = [
  'alarm',
  'flash',
  'sign',
  ...Array.from({ length: FAR_LAMP_CAP }, (_, index) => `lamp:${index}`),
]

const meshIds = new WeakMap<object, number>()
let meshSerial = 1

function meshKey(mesh: object): string {
  let id = meshIds.get(mesh)
  if (!id) {
    id = meshSerial
    meshSerial += 1
    meshIds.set(mesh, id)
  }
  return String(id)
}

export function BlinkFrustum({
  scale,
  reason,
}: {
  scale: number
  reason: FrustumBlinkState['reason']
}) {
  useFrustumLoop()
  const scene = useThree((state) => state.scene) as unknown as SceneNode
  const camera = useThree((state) => state.camera) as {
    position: { x: number; y: number; z: number }
    projectionMatrix: { elements: ArrayLike<number> }
    matrixWorldInverse: { elements: ArrayLike<number> }
  }
  const invalidate = useThree((state) => state.invalidate)
  const wake = useRef(0)
  const published = useRef<FrustumBlinkState | null>(null)
  const primed = useRef(false)
  const alarm = useRef<boolean | null>(null)
  const flash = useRef<boolean | null>(null)
  const sign = useRef<boolean | null>(null)
  const lampHidden = useRef(new Set<number>())
  const lampSaved = useRef(new Map<string, SavedInstance>())
  const lampMeshes = useRef<SceneNode[]>([])
  const signMeshes = useRef<SceneNode[]>([])
  const lampIndexes = useRef<number[]>([])
  const cameraAnchor = useRef<{ x: number; y: number; z: number } | null>(null)
  const places = useRef(new Map<string, () => SpherePoint | null>())
  const handlers = useRef(new Map<string, (visible: boolean) => void>())
  const keySig = useRef('')
  const suppressFrame = useRef(false)
  const scaleRef = useRef(scale)
  const reasonRef = useRef(reason)
  scaleRef.current = scale
  reasonRef.current = reason
  const askFrame = () => {
    if (wake.current) return
    // 单层时钟已停时，这一帧里的矩阵改动会进当前提交。再排一帧只会落进 1.8 秒窗。
    // 不引 store：视锥分包的 react/store 是垫片，拉进 viewSlice 会拆掉生产构建。
    const motion = window.__twinSchedule?.holds?.motion ?? 0
    const current = window.event
    const type = current && typeof current === 'object' && 'type' in current ? String((current as Event).type) : ''
    const gesturing = type === 'keydown' || type === 'pointerdown' || type === 'click' || type === 'input' || type === 'wheel'
    if (window.__twinView === 'floor' && window.__twinStationExplode?.animating !== true && motion === 0 && !gesturing) return
    wake.current = requestAnimationFrame(() => {
      wake.current = 0
      invalidate()
    })
  }

  const publish = (nextPrimed = primed.current) => {
    primed.current = nextPrimed
    const next: FrustumBlinkState = {
      on: true,
      reason: reasonRef.current,
      scale: scaleRef.current,
      primed: nextPrimed,
      alarm: alarm.current,
      flash: flash.current,
      sign: sign.current,
      lamps: lampIndexes.current.length,
      lampsHidden: lampHidden.current.size,
    }
    if (published.current && samePublish(published.current, next)) return
    published.current = next
    emitBlink(next)
    // 发现宿主时这一帧还没画完，矩阵改动会进当前帧。再要一帧只会堆进停稳窗口。
    if (suppressFrame.current) return
    askFrame()
  }

  const restoreAll = () => {
    for (const saved of lampSaved.current.values()) {
      restoreInstance(saved.matrix.array, saved.index, saved.values)
      saved.matrix.needsUpdate = true
    }
    lampSaved.current.clear()
    lampHidden.current.clear()
    for (const mesh of signMeshes.current) mesh.visible = true
  }

  const note = (host: 'alarm' | 'flash' | 'sign', visible: boolean) => {
    if (host === 'alarm') alarm.current = visible
    else if (host === 'flash') flash.current = visible
    else {
      sign.current = visible
      for (const mesh of signMeshes.current) mesh.visible = visible
    }
    publish(true)
  }

  const setLamp = (index: number, visible: boolean) => {
    for (const mesh of lampMeshes.current) {
      const matrix = mesh.instanceMatrix
      if (!matrix || index < 0 || index >= (mesh.count ?? 0)) continue
      const slot = `${meshKey(mesh)}:${index}`
      if (!visible) {
        if (lampSaved.current.has(slot)) continue
        lampSaved.current.set(slot, { matrix, index, values: readInstance(matrix.array, index) })
        hideInstance(matrix.array, index)
        matrix.needsUpdate = true
      } else {
        const saved = lampSaved.current.get(slot)
        if (!saved) continue
        restoreInstance(saved.matrix.array, saved.index, saved.values)
        saved.matrix.needsUpdate = true
        lampSaved.current.delete(slot)
      }
    }
    if (visible) lampHidden.current.delete(index)
    else lampHidden.current.add(index)
    publish(true)
  }

  useEffect(() => {
    publish(false)
    return () => {
      if (wake.current) cancelAnimationFrame(wake.current)
      restoreAll()
      alarm.current = null
      flash.current = null
      sign.current = null
      lampIndexes.current = []
      published.current = null
      emitBlink({
        on: false,
        reason: 'off',
        scale: 1,
        primed: false,
        alarm: null,
        flash: null,
        sign: null,
        lamps: 0,
        lampsHidden: 0,
      })
      invalidate()
    }
  }, [invalidate])

  useEffect(() => {
    publish(primed.current)
  }, [reason, scale])

  useFrame(() => {
    const foundLamps: SceneNode[] = []
    const foundSigns: SceneNode[] = []
    let badges: SceneNode | null = null
    let ring: SceneNode | null = null
    eachNode(scene, (node) => {
      if (node.name === 'DeviceBadges') badges = node
      else if (node.name === 'DeskFlash') ring = node
      if (!node.isMesh) return
      if (isLamp(node)) foundLamps.push(node)
      else if (isSign(node)) foundSigns.push(node)
    })
    lampMeshes.current = foundLamps
    signMeshes.current = foundSigns

    const source = foundLamps.find((mesh) => (mesh.count ?? 0) > 0 && mesh.instanceMatrix) ?? null
    const cameraPosition = camera.position
    const moved =
      !cameraAnchor.current ||
      Math.hypot(
        cameraPosition.x - cameraAnchor.current.x,
        cameraPosition.y - cameraAnchor.current.y,
        cameraPosition.z - cameraAnchor.current.z,
      ) > 8
    if (!source) {
      if (lampHidden.current.size > 0) {
        for (const index of [...lampHidden.current]) setLamp(index, true)
      }
      lampIndexes.current = []
    } else if (moved || lampIndexes.current.length === 0) {
      source.updateWorldMatrix?.(true, false)
      const spots = []
      const count = source.count ?? 0
      for (let index = 0; index < count; index += 1) {
        const point = instanceWorld(source.matrixWorld.elements, source.instanceMatrix!.array, index)
        spots.push({ index, ...point })
      }
      const nextIndexes = farthestLampIndexes(spots, cameraPosition, FAR_LAMP_CAP)
      const changed = nextIndexes.join(',') !== lampIndexes.current.join(',')
      lampIndexes.current = nextIndexes
      cameraAnchor.current = { x: cameraPosition.x, y: cameraPosition.y, z: cameraPosition.z }
      if (changed) {
        for (const index of [...lampHidden.current]) {
          if (!nextIndexes.includes(index)) setLamp(index, true)
        }
      }
    }

    const nextKeys: string[] = []
    const put = (key: string, place: () => SpherePoint | null, onVisible: (visible: boolean) => void) => {
      places.current.set(key, place)
      handlers.current.set(key, onVisible)
      nextKeys.push(key)
    }
    if (badges) {
      const host = badges
      put(
        'alarm',
        () => meshSphere(host, 8),
        (visible) => note('alarm', visible),
      )
    } else if (alarm.current != null) {
      alarm.current = null
      publish(primed.current)
    }
    if (ring) {
      const host = ring
      put(
        'flash',
        () => {
          const sphere = meshSphere(host, FLASH_SENTINEL_RADIUS)
          sphere.r = FLASH_SENTINEL_RADIUS
          return sphere
        },
        (visible) => note('flash', visible),
      )
    } else if (flash.current != null) {
      flash.current = null
      publish(primed.current)
    }
    if (foundSigns.length > 0) {
      put(
        'sign',
        () => unionSphere(foundSigns.map((mesh) => meshSphere(mesh, 4))),
        (visible) => note('sign', visible),
      )
    } else if (sign.current != null) {
      sign.current = null
      publish(primed.current)
    }
    for (const index of lampIndexes.current) {
      put(
        `lamp:${index}`,
        () => {
          const mesh = lampMeshes.current.find((item) => item.instanceMatrix) ?? null
          if (!mesh?.instanceMatrix) return null
          mesh.updateWorldMatrix?.(true, false)
          const point = instanceWorld(mesh.matrixWorld.elements, mesh.instanceMatrix.array, index)
          return { ...point, r: LAMP_SENTINEL_RADIUS }
        },
        (visible) => setLamp(index, visible),
      )
    }

    for (const key of [...places.current.keys()]) {
      if (!nextKeys.includes(key)) {
        places.current.delete(key)
        handlers.current.delete(key)
      }
    }
    const signature = nextKeys.join('|')
    if (signature !== keySig.current) {
      keySig.current = signature
      // 槽位已经在树上。这里再 setState 会在出齐窗那一帧之后再交一帧，1024 停稳窗装不下。
      suppressFrame.current = true
      try {
        for (const key of nextKeys) {
          const sphere = places.current.get(key)?.() ?? null
          const visible = sphere ? sphereInView(camera, sphere, scaleRef.current) : false
          handlers.current.get(key)?.(visible)
        }
      } finally {
        suppressFrame.current = false
      }
    }
  })

  return (
    <group name="FrustumPause">
      {SENTINEL_KEYS.map((key) => (
        <Sentinel
          key={key}
          scale={scale}
          place={() => places.current.get(key)?.() ?? null}
          onVisible={(visible) => handlers.current.get(key)?.(visible)}
        />
      ))}
    </group>
  )
}
