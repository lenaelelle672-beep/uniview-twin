import { useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useState } from 'react'
import {
  EquirectangularReflectionMapping,
  PMREMGenerator,
  type MeshStandardMaterial,
  type Texture,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from 'three'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import { curtainMaterial, eaveMaterial, finMaterial, grilleMaterial, jointMaterial } from '../../scene/materials'

/**
 * Poly Haven CC0，Kloofendal 48d Partly Cloudy (Pure Sky) 1k（1024×512）。
 * 性能档和均衡档共用这一张，只做反射，不作为背景。
 */
export const OUTDOOR_HDR_URL = '/hdr/kloofendal_48d_partly_cloudy_puresky_1k.hdr'

/**
 * 需要各自 envMapIntensity 的材质，按材质名登记。
 * 场景环境光会把未单独挂 envMap 的材质强度换成 environmentIntensity。
 * 以后可以按名字加进来，例如 GLB 材质 `east_grille`。
 */
export const REFLECTIVE_ENV_MATERIALS: Record<string, MeshStandardMaterial> = {
  curtain: curtainMaterial,
  fin: finMaterial,
  grille: grilleMaterial,
  joint: jointMaterial,
  eave: eaveMaterial,
}

function assignEnvMap(env: Texture | null) {
  for (const material of Object.values(REFLECTIVE_ENV_MATERIALS)) {
    if (material.envMap === env) continue
    material.envMap = env
    material.needsUpdate = true
  }
}

type EnvEntry = {
  users: number
  promise: Promise<WebGLRenderTarget>
}

let envEntry: EnvEntry | null = null
let envRenderer: WebGLRenderer | null = null

function acquireEnvironment(gl: WebGLRenderer): EnvEntry {
  if (!envEntry || envRenderer !== gl) {
    envRenderer = gl
    const entry: EnvEntry = {
      users: 0,
      promise: new HDRLoader().loadAsync(OUTDOOR_HDR_URL).then((texture) => {
        if (entry.users === 0) {
          texture.dispose()
          throw new Error('环境贴图在预滤波前已卸载')
        }
        texture.mapping = EquirectangularReflectionMapping
        const pmrem = new PMREMGenerator(gl)
        const target = pmrem.fromEquirectangular(texture)
        pmrem.dispose()
        texture.dispose()
        return target
      }),
    }
    envEntry = entry
  }
  envEntry.users += 1
  return envEntry
}

function releaseEnvironment() {
  const entry = envEntry
  if (!entry) return
  entry.users -= 1
  if (entry.users > 0) return
  queueMicrotask(() => {
    if (entry.users > 0) return
    if (envEntry === entry) {
      envEntry = null
      envRenderer = null
    }
    void entry.promise.then(
      (target) => {
        if (entry.users > 0) return
        target.dispose()
      },
      () => {},
    )
  })
}

export function LocalEnvironment({ enabled, night }: { enabled: boolean; night: boolean }) {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const [envMap, setEnvMap] = useState<Texture | null>(null)

  useLayoutEffect(() => {
    const env = enabled ? envMap : null
    scene.environment = env
    scene.environmentIntensity = night ? 0.16 : 0.22
    assignEnvMap(env)
  }, [enabled, envMap, night, scene])

  useEffect(() => {
    if (!enabled) return
    const entry = acquireEnvironment(gl)
    let cancelled = false
    let target: WebGLRenderTarget | null = null
    void entry.promise.then(
      (next) => {
        if (cancelled) return
        target = next
        setEnvMap(next.texture)
      },
      () => {},
    )
    return () => {
      cancelled = true
      if (scene.environment === target?.texture) scene.environment = null
      assignEnvMap(null)
      setEnvMap(null)
      releaseEnvironment()
    }
  }, [enabled, gl, scene])

  return null
}
