import { useHelper } from '@react-three/drei/core/Helper'
import { useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { Object3D } from 'three'
import {
  AUTHOR_HELPER_COLOR,
  AUTHOR_HELPER_SIZE,
  AUTHOR_SHADOW_COLOR,
  authorHelperName,
  authorHelperKey,
  planAuthorHelpers,
  type AuthorHelperKind,
  type AuthorHelperTarget,
} from './plan'

type HelperCtor = new (...args: never[]) => Object3D

function useAttachedHelper(target: RefObject<Object3D> | null, ctor: HelperCtor, args: readonly (string | number)[]) {
  const bind = useHelper as (
    object3D: RefObject<Object3D> | null,
    helperConstructor: HelperCtor,
    ...helperArgs: readonly (string | number)[]
  ) => RefObject<HelperNode | null>
  return bind(target, ctor, ...args)
}

interface Rgb {
  r: number
  g: number
  b: number
}

interface HelperNode extends Object3D {
  setColors?: (frustum: Rgb, cone: Rgb, up: Rgb, target: Rgb, cross: Rgb) => void
}

const ARGS: Record<AuthorHelperKind, readonly (string | number)[]> = {
  camera: [],
  shadow: [],
  directional: [AUTHOR_HELPER_SIZE.directional, AUTHOR_HELPER_COLOR.directional],
  hemisphere: [AUTHOR_HELPER_SIZE.hemisphere],
  point: [AUTHOR_HELPER_SIZE.point, AUTHOR_HELPER_COLOR.point],
  spot: [AUTHOR_HELPER_COLOR.spot],
}

class UnusedHelper {}

/**
 * 构造函数不从 'three' 入口再 import。
 * 那些类已经在首屏 three 命名空间里，再 export 会把 hardGate 顶过线。
 * 这里用 R3F 目录里的同一份类做一次不可见探测，再用 drei useHelper 挂到场景上。
 * useHelper 自己的 useFrame 只调用 helper.update()，不 invalidate。
 * CameraControls 的 useFrame 优先级是 -1，先于这次 update，demand 停帧时不会被辅助线重新叫醒。
 */
function AuthorHelperBinding({ plan }: { plan: AuthorHelperTarget }) {
  const invalidate = useThree((state) => state.invalidate)
  const targetRef = useRef<Object3D>(plan.object as Object3D)
  targetRef.current = plan.object as Object3D
  const probeRef = useRef<Object3D>(null)
  const [ctor, setCtor] = useState<HelperCtor | null>(null)
  const args = ARGS[plan.kind]
  const helper = useAttachedHelper(
    ctor ? targetRef : null,
    ctor ?? (UnusedHelper as unknown as HelperCtor),
    args,
  )

  useLayoutEffect(() => {
    if (ctor) return
    const probed = probeRef.current
    if (!probed) return
    setCtor(() => probed.constructor as HelperCtor)
  }, [ctor])

  useLayoutEffect(() => {
    const node = helper.current as HelperNode | null
    if (!node) return
    node.name = authorHelperName(plan.kind)
    node.userData.authorHelper = plan.kind
    node.frustumCulled = false
    node.traverse((child) => {
      child.frustumCulled = false
      child.raycast = () => {}
    })
    if (plan.kind === 'shadow' && node.setColors) {
      const color = AUTHOR_SHADOW_COLOR
      node.setColors(color, color, color, color, color)
    }
    invalidate()
    return () => {
      invalidate()
    }
  }, [ctor, helper, invalidate, plan])

  if (ctor) return null
  return <HelperProbe kind={plan.kind} target={plan.object} probeRef={probeRef} />
}

function HelperProbe({
  kind,
  target,
  probeRef,
}: {
  kind: AuthorHelperKind
  target: object
  probeRef: RefObject<Object3D | null>
}) {
  const args = [target] as never
  if (kind === 'camera' || kind === 'shadow') {
    return <cameraHelper ref={probeRef} name="AuthorHelperProbe" args={args} visible={false} />
  }
  if (kind === 'directional') {
    return <directionalLightHelper ref={probeRef} name="AuthorHelperProbe" args={args} visible={false} />
  }
  if (kind === 'hemisphere') {
    return <hemisphereLightHelper ref={probeRef} name="AuthorHelperProbe" args={args} visible={false} />
  }
  if (kind === 'point') {
    return <pointLightHelper ref={probeRef} name="AuthorHelperProbe" args={args} visible={false} />
  }
  return <spotLightHelper ref={probeRef} name="AuthorHelperProbe" args={args} visible={false} />
}

/**
 * T066：drei useHelper + three 的灯光/相机辅助。
 * 只在作者门打开时由懒包挂上。不换掉当前相机，也不改控制器。
 * 挂上和卸下各补一帧；逐帧更新交给 useHelper，避免 demand 空转。
 */
export function LightCameraHelpers() {
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)
  const [plans, setPlans] = useState<AuthorHelperTarget[]>([])

  useLayoutEffect(() => {
    setPlans(planAuthorHelpers(scene, camera))
  }, [camera, scene])

  useLayoutEffect(() => {
    const probe = window.__twinAuthorHelpers
    if (!probe) return
    probe.mounted = true
    probe.kinds = plans.map((plan) => plan.kind)
    return () => {
      const next = window.__twinAuthorHelpers
      if (!next) return
      next.mounted = false
      next.kinds = []
    }
  }, [plans])

  return (
    <>
      {plans.map((plan, index) => (
        <AuthorHelperBinding key={authorHelperKey(plan, index)} plan={plan} />
      ))}
    </>
  )
}
