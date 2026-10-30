import { useStore, useThree } from '@react-three/fiber'
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
import { markHdrLoaded, markHdrNotRequired, markHdrPmremReady } from '../../scene/overviewReady'
import { curtainMaterial, eaveMaterial, finMaterial, grilleMaterial, jointMaterial } from '../../scene/materials'

/**
 * Poly Haven CC0，Kloofendal 48d Partly Cloudy (Pure Sky) 1k（1024×512）。
 * 白天三档共用这一张，只做反射，不作为背景。
 */
export const OUTDOOR_HDR_URL = '/hdr/kloofendal_48d_partly_cloudy_puresky_1k.hdr'

/**
 * Poly Haven CC0，Modern Buildings Night 1k（1024×512）。
 * 只在非 perf 夜景、并且过了首屏 cutoff 之后才请求。
 */
export const NIGHT_HDR_URL = '/hdr/modern_buildings_night_1k.hdr'

/** 白天不变。夜景在夜 HDR 还没上来时沿用原来的压低值。 */
export const DAY_ENV_INTENSITY = 0.22
export const NIGHT_DAYMAP_ENV_INTENSITY = 0.16

/**
 * 夜 HDR 的均值亮度约为日空的 4 倍（灯火把均值抬上去了，中位数接近）。
 * 接到 scene.environment 上时把强度收到 0.08，IBL 不会比现在的夜景更亮。
 * 幕墙等自带 envMap 的材质仍走各自的 envMapIntensity，不受这个值影响。
 */
export const NIGHT_HDR_ENV_INTENSITY = 0.08

/**
 * d126 hardGate cutoff 在首帧后约 64ms。
 * 夜 HDR 再多等一截，冷启和首帧附近拨到夜景都不会进 cutoff。
 */
export const NIGHT_HDR_AFTER_FIRST_MS = 200

/** perf 不切夜 HDR，只维持低强度日空。balanced / high 的夜景才切。 */
export function nightHdrActive(night: boolean, quality: string): boolean {
  return night && quality !== 'perf'
}

/**
 * 首帧还没落下时返回 null（继续等）。
 * 已经过了 cutoff 余量则返回 0，调用方可以马上 load。
 */
export function nightHdrWaitMs(firstFrameAt: number | null | undefined, now: number): number | null {
  if (firstFrameAt == null) return null
  return Math.max(0, NIGHT_HDR_AFTER_FIRST_MS - (now - firstFrameAt))
}

export function environmentIntensity(night: boolean, nightMapLive: boolean): number {
  if (!night) return DAY_ENV_INTENSITY
  if (nightMapLive) return NIGHT_HDR_ENV_INTENSITY
  return NIGHT_DAYMAP_ENV_INTENSITY
}

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
  renderer: WebGLRenderer
  promise: Promise<WebGLRenderTarget>
}

const envByUrl = new Map<string, EnvEntry>()

function acquireEnvironment(gl: WebGLRenderer, url: string, trackReady: boolean): EnvEntry {
  const cached = envByUrl.get(url)
  if (cached && cached.renderer === gl) {
    cached.users += 1
    return cached
  }
  const entry: EnvEntry = {
    users: 0,
    renderer: gl,
    promise: new HDRLoader().loadAsync(url).then((texture) => {
      if (trackReady) markHdrLoaded()
      if (entry.users === 0) {
        texture.dispose()
        throw new Error('环境贴图在预滤波前已卸载')
      }
      texture.mapping = EquirectangularReflectionMapping
      const pmrem = new PMREMGenerator(gl)
      const target = pmrem.fromEquirectangular(texture)
      pmrem.dispose()
      texture.dispose()
      target.texture.name = url
      return target
    }),
  }
  envByUrl.set(url, entry)
  entry.users += 1
  return entry
}

function releaseEnvironment(url: string, entry: EnvEntry) {
  entry.users -= 1
  if (entry.users > 0) return
  queueMicrotask(() => {
    if (entry.users > 0) return
    if (envByUrl.get(url) === entry) envByUrl.delete(url)
    void entry.promise.then(
      (target) => {
        if (entry.users > 0) return
        target.dispose()
      },
      () => {},
    )
  })
}

export function LocalEnvironment({
  enabled,
  night,
  quality,
}: {
  enabled: boolean
  night: boolean
  quality: string
}) {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const store = useStore()
  const [dayMap, setDayMap] = useState<Texture | null>(null)
  const [nightMap, setNightMap] = useState<Texture | null>(null)
  const nightMapLive = nightHdrActive(night, quality) && nightMap != null

  useLayoutEffect(() => {
    const env = enabled ? (nightMapLive ? nightMap : dayMap) : null
    const intensity = environmentIntensity(night, nightMapLive)
    scene.environment = env
    scene.environmentIntensity = intensity
    assignEnvMap(env)
    if (env) {
      window.__twinEnv = {
        url: env.name,
        nightMap: nightMapLive,
        intensity,
      }
    } else {
      delete window.__twinEnv
    }
    store.getState().invalidate()
    if (!enabled) {
      markHdrNotRequired()
      return
    }
    if (dayMap) markHdrPmremReady()
  }, [dayMap, enabled, night, nightMap, nightMapLive, scene, store])

  useEffect(() => {
    if (!enabled) {
      markHdrNotRequired()
      return
    }
    const entry = acquireEnvironment(gl, OUTDOOR_HDR_URL, true)
    let cancelled = false
    let target: WebGLRenderTarget | null = null
    void entry.promise.then(
      (next) => {
        if (cancelled) return
        target = next
        setDayMap(next.texture)
      },
      () => {
        if (!cancelled) markHdrNotRequired()
      },
    )
    return () => {
      cancelled = true
      if (scene.environment === target?.texture) scene.environment = null
      assignEnvMap(null)
      setDayMap(null)
      releaseEnvironment(OUTDOOR_HDR_URL, entry)
    }
  }, [enabled, gl, scene])

  useEffect(() => {
    if (!enabled || !nightHdrActive(night, quality)) return
    let cancelled = false
    let timer = 0
    let entry: EnvEntry | null = null
    let target: WebGLRenderTarget | null = null

    const arm = () => {
      if (cancelled) return
      const wait = nightHdrWaitMs(window.__twinFirstFrameAt, performance.now())
      if (wait == null || wait > 0) {
        timer = window.setTimeout(arm, wait == null ? 32 : wait)
        return
      }
      entry = acquireEnvironment(gl, NIGHT_HDR_URL, false)
      void entry.promise.then(
        (next) => {
          if (cancelled) return
          target = next
          setNightMap(next.texture)
        },
        () => {},
      )
    }
    arm()

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      if (scene.environment === target?.texture) scene.environment = null
      setNightMap(null)
      if (entry) releaseEnvironment(NIGHT_HDR_URL, entry)
    }
  }, [enabled, gl, night, quality, scene])

  return null
}
