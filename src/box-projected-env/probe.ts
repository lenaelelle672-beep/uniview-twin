import {
  BOX_ENV_LAYERS,
  type BoxEnvState,
  type RoomBox,
} from './plan'

/**
 * 开关分包和房间分包各写一份。状态只放在 window 上。
 * 幕墙 envMapIntensity 不在这里改。useFrame 恒为 false：钩子本身没有帧回调。
 */

export interface BoxEnvProbe {
  on: boolean
  mounted: boolean
  state: BoxEnvState
  floorId: string | null
  impl: 'drei-useBoxProjectedEnv'
  modules: readonly ['useBoxProjectedEnv']
  useFrame: false
  hdr: string | null
  hdrOwner: 'LocalEnvironment'
  position: [number, number, number] | null
  size: [number, number, number] | null
  materials: number
  curtainTouched: false
  envMapIntensityWrites: 0
  balancedFx: false
  cdn: false
  reflector: false
  transmission: false
  layers: typeof BOX_ENV_LAYERS
}

const BASE = {
  impl: 'drei-useBoxProjectedEnv' as const,
  modules: ['useBoxProjectedEnv'] as const,
  useFrame: false as const,
  hdrOwner: 'LocalEnvironment' as const,
  curtainTouched: false as const,
  envMapIntensityWrites: 0 as const,
  balancedFx: false as const,
  cdn: false as const,
  reflector: false as const,
  transmission: false as const,
  layers: BOX_ENV_LAYERS,
}

export function publishBoxEnv(patch: {
  on: boolean
  mounted: boolean
  state: BoxEnvState
  floorId: string | null
  hdr?: string | null
  box?: RoomBox | null
  materials?: number
}): void {
  if (typeof window === 'undefined') return
  const box = patch.box ?? null
  window.__twinBoxProjectedEnv = {
    ...BASE,
    on: patch.on,
    mounted: patch.mounted,
    state: patch.state,
    floorId: patch.floorId,
    hdr: patch.hdr ?? null,
    position: box ? box.position : null,
    size: box ? box.size : null,
    materials: patch.materials ?? 0,
  }
}

/** 房间分包只更新挂上之后的盒子和张数，不把开关状态写成关。 */
export function noteBoxEnvMounted(patch: {
  hdr: string
  box: RoomBox
  materials: number
}): void {
  if (typeof window === 'undefined') return
  const prev = window.__twinBoxProjectedEnv
  if (!prev || !prev.on) return
  window.__twinBoxProjectedEnv = {
    ...prev,
    mounted: true,
    hdr: patch.hdr,
    position: patch.box.position,
    size: patch.box.size,
    materials: patch.materials,
    curtainTouched: false,
    envMapIntensityWrites: 0,
    useFrame: false,
  }
}

export function noteBoxEnvDetached(): void {
  if (typeof window === 'undefined') return
  const prev = window.__twinBoxProjectedEnv
  if (!prev || !prev.on) return
  window.__twinBoxProjectedEnv = {
    ...prev,
    mounted: false,
    materials: 0,
    position: null,
    size: null,
  }
}
