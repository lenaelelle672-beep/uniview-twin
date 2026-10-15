import type { Camera, Scene, WebGLRenderer } from 'three'

/**
 * 避让、合批和淡入完成前不把整层再画一遍。
 * 那些帧只跑标签状态机；真正上屏留到不透明度已经写完的那一帧。
 */
let renderer: WebGLRenderer | null = null
let original: WebGLRenderer['render'] | null = null
let held = false
let timer = 0

function wrapped(this: WebGLRenderer, scene: Scene, camera: Camera) {
  if (held) return
  original?.call(this, scene, camera)
}

export function holdLabelPaint(gl: WebGLRenderer) {
  if (typeof window === 'undefined') return
  if (!held) {
    renderer = gl
    original = gl.render
    gl.render = wrapped
    held = true
  }
  if (timer) clearTimeout(timer)
  timer = window.setTimeout(() => releaseLabelPaint(), 1500)
}

export function releaseLabelPaint() {
  if (!held || !renderer || !original) return
  held = false
  if (renderer.render === wrapped) renderer.render = original
  renderer = null
  original = null
  if (timer) {
    clearTimeout(timer)
    timer = 0
  }
}
