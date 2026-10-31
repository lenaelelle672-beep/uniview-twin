import { SoftShadows } from '@react-three/drei/core/softShadows'
import { useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ShadowMapType } from 'three'
import { isCameraRested } from '../../scene/stage/cameraRest'
import { shadowBakePending } from '../../scene/stage/shadowBake'
import {
  capturePrePcssShadowType,
  setSoftShadowsMounted,
  shadowTypeAfterSoftShadowsUnmount,
  softShadowGateOpen,
  softShadowsQualityOn,
  SOFT_SHADOW_FOCUS,
  SOFT_SHADOW_SAMPLES,
  SOFT_SHADOW_SIZE,
  type SoftShadowGateInput,
} from '../../scene/softShadows'
import { useTwinStore } from '../../store/store'

function publishSoftShadowStamp(): void {
  window.__twinSoftShadows = {
    samples: SOFT_SHADOW_SAMPLES,
    size: SOFT_SHADOW_SIZE,
    focus: SOFT_SHADOW_FOCUS,
    at: performance.now(),
  }
}

function readGate(): SoftShadowGateInput {
  const live = useTwinStore.getState()
  return {
    quality: live.quality,
    firstFrameAt: window.__twinFirstFrameAt,
    frames: window.__twinFrames,
    bakePending: shadowBakePending(),
    view: live.view,
    cameraRested: isCameraRested(),
  }
}

/**
 * Scene 在非 perf 的晚窗口挂上这个分包。drei `<SoftShadows>` 只在 quality === 'balanced' 渲染。
 * perf 不进窗口。high 可以挂上分包，但不渲染 PCSS，阴影保持 percentage。
 * 首帧后的 DemandLoop 帧先走完 D286 烘影；单层还要等飞入停稳。门打开后再让出一帧才挂 drei SoftShadows。
 * 无贴图请求，不碰场地懒加载。
 */
export function BalancedSoftShadows() {
  const gl = useThree((state) => state.gl)
  const invalidate = useThree((state) => state.invalidate)
  const quality = useTwinStore((state) => state.quality)
  const allowed = softShadowsQualityOn(quality)
  const [mounted, setMounted] = useState(false)
  const savedType = useRef<ShadowMapType>(gl.shadowMap.type)
  const live = mounted && allowed

  useEffect(() => {
    if (!allowed) {
      setMounted(false)
      return
    }
    let cancelled = false
    let raf = 0
    const arm = () => {
      if (cancelled) return
      if (!softShadowGateOpen(readGate())) {
        raf = requestAnimationFrame(arm)
        return
      }
      // 门打开的这一帧可能仍是烘影帧。再让出一帧，并且重新核对飞入 / bake。
      raf = requestAnimationFrame(() => {
        if (cancelled) return
        if (!softShadowGateOpen(readGate())) {
          arm()
          return
        }
        setMounted(true)
      })
    }
    raf = requestAnimationFrame(arm)
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [allowed])

  useLayoutEffect(() => {
    if (!live) return
    savedType.current = capturePrePcssShadowType(savedType.current, gl.shadowMap.type)
    setSoftShadowsMounted(true)
    publishSoftShadowStamp()
  }, [gl, live])

  useEffect(() => {
    if (!live) return
    setSoftShadowsMounted(true)
    publishSoftShadowStamp()
    let cancelled = false
    const raf = requestAnimationFrame(() => {
      if (cancelled || !softShadowGateOpen(readGate())) return
      gl.shadowMap.autoUpdate = false
      gl.shadowMap.needsUpdate = true
      invalidate()
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      // 子组件 SoftShadows 的清理先跑，drei 会把 type 写回挂载时的值。这里再兜底。
      gl.shadowMap.type = shadowTypeAfterSoftShadowsUnmount(savedType.current, gl.shadowMap.type)
      setSoftShadowsMounted(false)
      delete window.__twinSoftShadows
      // 卸到高画质时阴影还在，补一帧 percentage。perf 不再烘。
      if (useTwinStore.getState().quality !== 'perf' && !shadowBakePending()) {
        gl.shadowMap.autoUpdate = false
        gl.shadowMap.needsUpdate = true
      }
    }
  }, [gl, invalidate, live])

  if (!live) return null
  return <SoftShadows samples={SOFT_SHADOW_SAMPLES} size={SOFT_SHADOW_SIZE} focus={SOFT_SHADOW_FOCUS} />
}
