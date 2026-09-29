import { Environment } from '@react-three/drei/core/Environment'
import { useThree } from '@react-three/fiber'
import { useLayoutEffect } from 'react'
import type { MeshStandardMaterial } from 'three'
import { curtainMaterial, eaveMaterial, finMaterial, grilleMaterial, jointMaterial } from '../../scene/materials'

/**
 * Poly Haven CC0，Kloofendal 48d Partly Cloudy (Pure Sky) 1k。
 * 不传 background，避免天空再占一次绘制。
 */
export const OUTDOOR_HDR_URL = '/hdr/kloofendal_48d_partly_cloudy_puresky_1k.hdr'

/** 这些材质要各自的 envMapIntensity。场景环境光会把该值和场景强度对调掉，所以单独挂上同一张贴图。 */
const REFLECTIVE: MeshStandardMaterial[] = [curtainMaterial, finMaterial, grilleMaterial, jointMaterial, eaveMaterial]

export function LocalEnvironment({ enabled, night }: { enabled: boolean; night: boolean }) {
  const scene = useThree((state) => state.scene)
  useLayoutEffect(() => {
    const env = enabled ? scene.environment : null
    for (const material of REFLECTIVE) {
      if (material.envMap === env) continue
      material.envMap = env
      material.needsUpdate = true
    }
  })
  if (!enabled) return null
  // 晴天 HDR 的太阳很亮。压低场景环境强度，幕墙用自己的 envMapIntensity 映天空。
  return <Environment files={OUTDOOR_HDR_URL} environmentIntensity={night ? 0.16 : 0.22} />
}
