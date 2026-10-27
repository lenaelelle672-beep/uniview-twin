import { useFrame, useThree } from '@react-three/fiber'
import { useIntersect } from '@react-three/drei/core/useIntersect.js'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { emitBlink, type FrustumBlinkState } from './blinkGate'
import { afterRender, useFrustumLoop } from './loopBind'
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

const PRIME_SCALE = 100000

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
  const phase = useRef<'huge' | 'gap' | 'live'>('huge')
  const arm = useRef(false)
  const ref = useIntersect((visible: boolean) => {
    if (phase.current !== 'live') return
    onRef.current(visible)
  })
  const invalidate = useThree((state) => state.invalidate)

  const apply = (prime: boolean) => {
    const mesh = ref.current as {
      position: { set: (x: number, y: number, z: number) => void }
      scale: { setScalar: (value: number) => void }
    } | null
    if (!mesh) return
    const sphere = placeRef.current()
    if (sphere) mesh.position.set(sphere.x, sphere.y, sphere.z)
    const radius = Math.max((sphere?.r ?? 1) * scaleRef.current, 0.4)
    mesh.scale.setScalar(prime ? PRIME_SCALE : radius)
  }

  useLayoutEffect(() => {
    phase.current = 'huge'
    arm.current = false
    apply(true)
    let stop = () => {}
    stop = afterRender(() => {
      arm.current = true
      stop()
      // 停帧循环在 after-effect 里直接 invalidate 会把已经排好的下一帧取消掉。
      // 拖到下一轮任务再要帧，真实半径才会被画进去。
      requestAnimationFrame(() => invalidate())
    })
    invalidate()
    return () => stop()
  }, [invalidate])

  useFrame(() => {
    if (!arm.current) return
    const mesh = ref.current as { visible: boolean } | null
    if (!mesh) return
    if (phase.current === 'huge') {
      // 先离开画面一帧，useIntersect 内部的「上次可见」才会回到 false。
      // 下一帧真实半径无论进或出，都能变成一次可见性变化。
      mesh.visible = false
      phase.current = 'gap'
      requestAnimationFrame(() => invalidate())
      return
    }
    if (phase.current === 'gap') {
      mesh.visible = true
      apply(false)
      phase.current = 'live'
      let reported = false
      const previous = onRef.current
      const wrapped = (visible: boolean) => {
        reported = true
        previous(visible)
      }
      onRef.current = wrapped
      afterRender(() => {
        if (onRef.current === wrapped) onRef.current = previous
        if (!reported) previous(false)
      })
      return
    }
    apply(false)
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
  const camera = useThree((state) => state.camera) as { position: { x: number; y: number; z: number } }
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
  const scaleRef = useRef(scale)
  const reasonRef = useRef(reason)
  scaleRef.current = scale
  reasonRef.current = reason
  const [keys, setKeys] = useState<string[]>([])

  const askFrame = () => {
    if (wake.current) return
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

    const signature = nextKeys.join('|')
    if (signature !== keySig.current) {
      keySig.current = signature
      setKeys(nextKeys)
      askFrame()
    }
  })

  return (
    <group name="FrustumPause">
      {keys.map((key) => (
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
