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
 * 仅 quality !== 'perf' 时由 Scene 挂上。
 * 首帧后的 DemandLoop 帧先走完 D286 烘影；单层还要等飞入停稳。门打开后再让出一帧才挂 drei SoftShadows。
 * 无贴图请求，不碰场地懒加载。
 */
export function BalancedSoftShadows() {
  const gl = useThree((state) => state.gl)
  const invalidate = useThree((state) => state.invalidate)
  const [mounted, setMounted] = useState(false)
  const savedType = useRef<ShadowMapType>(gl.shadowMap.type)

  useEffect(() => {
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
  }, [])

  useLayoutEffect(() => {
    if (!mounted) return
    savedType.current = capturePrePcssShadowType(savedType.current, gl.shadowMap.type)
    setSoftShadowsMounted(true)
    publishSoftShadowStamp()
  }, [gl, mounted])

  useEffect(() => {
    if (!mounted) return
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
      if (useTwinStore.getState().quality !== 'perf' && !shadowBakePending()) {
        gl.shadowMap.autoUpdate = false
        gl.shadowMap.needsUpdate = true
      }
    }
  }, [gl, invalidate, mounted])

  if (!mounted) return null
  return <SoftShadows samples={SOFT_SHADOW_SAMPLES} size={SOFT_SHADOW_SIZE} focus={SOFT_SHADOW_FOCUS} />
}
