import { useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  DirectionalLight,
  PCFShadowMap,
  WebGLRenderTarget,
  type Camera,
  type Object3D,
  type Scene,
  type WebGLRenderer,
} from 'three'
import { supportsParallelShaderCompile } from '../../scene/glProbe'
import type { QualityTier } from '../../types'

const FREEZE_ATTR = 'data-twin-freeze'

export type TwinWarmupStats = {
  compileMs: number
  totalMs: number
  firstSwitch: boolean
}

function sceneRoot(gl: WebGLRenderer): HTMLElement | null {
  return gl.domElement.closest('.scene-root')
}

function captureFreeze(gl: WebGLRenderer) {
  const canvas = gl.domElement
  const root = sceneRoot(gl)
  if (!root) return
  root.querySelector(`[${FREEZE_ATTR}]`)?.remove()
  const overlay = document.createElement('canvas')
  overlay.setAttribute(FREEZE_ATTR, '1')
  overlay.width = canvas.width
  overlay.height = canvas.height
  const ctx = overlay.getContext('2d')
  if (ctx) ctx.drawImage(canvas, 0, 0)
  const rect = canvas.getBoundingClientRect()
  const parentRect = root.getBoundingClientRect()
  overlay.style.cssText = [
    'position:absolute',
    `left:${rect.left - parentRect.left}px`,
    `top:${rect.top - parentRect.top}px`,
    `width:${rect.width}px`,
    `height:${rect.height}px`,
    'pointer-events:none',
    'z-index:6',
  ].join(';')
  root.appendChild(overlay)
}

function releaseFreeze(gl: WebGLRenderer) {
  sceneRoot(gl)?.querySelector(`[${FREEZE_ATTR}]`)?.remove()
}

function waitFrames(count: number): Promise<void> {
  return new Promise((resolve) => {
    let left = count
    const step = () => {
      left -= 1
      if (left <= 0) resolve()
      else requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  })
}

function enableBalancedShadows(gl: WebGLRenderer, scene: Object3D) {
  gl.shadowMap.type = PCFShadowMap
  gl.shadowMap.enabled = true
  gl.shadowMap.needsUpdate = true
  scene.traverse((object) => {
    if (object instanceof DirectionalLight) object.castShadow = true
  })
}

async function compileScene(gl: WebGLRenderer, scene: Scene, camera: Camera) {
  const renderer = gl as WebGLRenderer & {
    compileAsync?: (scene: Scene, camera: Camera) => Promise<void>
  }
  if (supportsParallelShaderCompile(gl) && typeof renderer.compileAsync === 'function') {
    await renderer.compileAsync(scene, camera)
    return
  }
  gl.compile(scene, camera)
}

function renderShadowWarmup(gl: WebGLRenderer, scene: Scene, camera: Camera) {
  const target = new WebGLRenderTarget(8, 8)
  const previous = gl.getRenderTarget()
  const previousAutoClear = gl.autoClear
  gl.autoClear = true
  gl.shadowMap.type = PCFShadowMap
  gl.shadowMap.enabled = true
  gl.shadowMap.needsUpdate = true
  gl.setRenderTarget(target)
  gl.render(scene, camera)
  gl.setRenderTarget(previous)
  gl.autoClear = previousAutoClear
  target.dispose()
}

/**
 * 性能档一次都不请求后处理分包。
 * 每次新开页面后第一次切到均衡档：先开阴影，再 compileAsync，再在屏外烘一帧阴影，最后才挂后处理。
 */
export function useBalancedWarmup(quality: QualityTier, composerLive = false): boolean {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)
  const [ready, setReady] = useState(false)
  const prevQuality = useRef(quality)
  const firstSwitch = useRef(true)

  useLayoutEffect(() => {
    const root = sceneRoot(gl)
    if (root) {
      root.setAttribute('data-fx-ready', ready && quality !== 'perf' ? '1' : '0')
      root.setAttribute('data-warmup', quality !== 'perf' && !ready ? '1' : '0')
    }
  }, [gl, quality, ready])

  useLayoutEffect(() => {
    const leavingPerf = prevQuality.current === 'perf' && quality !== 'perf'
    if (leavingPerf && firstSwitch.current) {
      captureFreeze(gl)
    }
    if (quality === 'perf') {
      setReady(false)
      releaseFreeze(gl)
    }
    prevQuality.current = quality
  }, [gl, quality])

  useEffect(() => {
    if (quality === 'perf') {
      window.__twinWarmup = undefined
      return
    }
    let cancelled = false
    const started = performance.now()
    const isFirst = firstSwitch.current

    async function warm() {
      await import('./postfx/balancedFx')
      if (cancelled) return

      enableBalancedShadows(gl, scene)
      const prevMask = camera.layers.mask
      camera.layers.enableAll()
      const compileStarted = performance.now()
      await compileScene(gl, scene, camera)
      const compileMs = performance.now() - compileStarted
      renderShadowWarmup(gl, scene, camera)
      camera.layers.mask = prevMask
      if (cancelled) return

      setReady(true)
      await waitFrames(3)
      if (cancelled) return

      enableBalancedShadows(gl, scene)
      camera.layers.enableAll()
      await compileScene(gl, scene, camera)
      renderShadowWarmup(gl, scene, camera)
      camera.layers.mask = prevMask
      if (cancelled) return

      await waitFrames(2)
      if (cancelled) return

      const totalMs = performance.now() - started
      window.__twinWarmup = { compileMs, totalMs, firstSwitch: isFirst }
      firstSwitch.current = false
    }

    void warm()
    return () => {
      cancelled = true
    }
  }, [camera, gl, quality, scene])

  useLayoutEffect(() => {
    if (composerLive) releaseFreeze(gl)
  }, [composerLive, gl])

  return quality !== 'perf' && ready
}
