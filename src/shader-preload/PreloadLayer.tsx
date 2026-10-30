import { Preload } from '@react-three/drei/core/Preload'
import { useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useState } from 'react'
import { shaderPreloadDue } from './gate'

function dueNow(): boolean {
  if (typeof performance === 'undefined') return false
  return shaderPreloadDue(window.__twinFirstFrameAt, performance.now())
}

/**
 * drei `<Preload all />`。
 * `all` 会在 gl.compile 和 CubeCamera 之前把 invisible 临时翻开，drei 在同一轮 layout 里翻回去。
 * 只在首帧窗口之后才渲染。不挂全屏 Loader，也不写 AssetLoadOverlay 的进度。
 */
function PreloadNow() {
  const scene = useThree((state) => state.scene)
  useLayoutEffect(() => {
    window.__twinShaderPreload = { all: true, at: performance.now() }
    // 子级 Preload 的 layout 已经 compile。读当前 invalidate，停稳窗里和别的空闲帧并在一起。
    const root = (scene as { __r3f?: { root?: { getState: () => { invalidate: () => void } } } }).__r3f?.root
    root?.getState().invalidate()
  }, [scene])
  return <Preload all />
}

export function PreloadLayer() {
  const [armed, setArmed] = useState(dueNow)
  useEffect(() => {
    if (armed) return undefined
    let cancelled = false
    let raf = 0
    const tick = () => {
      if (cancelled) return
      if (dueNow()) {
        setArmed(true)
        return
      }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => {
      cancelled = true
      if (raf) cancelAnimationFrame(raf)
    }
  }, [armed])
  if (!armed) return null
  return <PreloadNow />
}
