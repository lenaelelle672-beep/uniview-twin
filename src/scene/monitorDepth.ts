import { Vector2, WebGLRenderTarget, type WebGLRenderer, type WebGLRenderTarget as RenderTarget } from 'three'

const size = new Vector2()

/** 均衡档合成器在 RenderPass 之后拷出的场景深度。性能档走默认帧缓冲，这里为空。 */
export const sceneDepthTarget: { current: WebGLRenderTarget | null } = { current: null }

export function overlayDepthBudget(width: number, height: number, allocated: boolean) {
  if (!allocated) return { extraTargets: 0, extraBytes: 0 }
  return {
    extraTargets: 1,
    extraBytes: width * height * 8,
  }
}

export function ensureSceneDepthTarget(width: number, height: number) {
  const current = sceneDepthTarget.current
  if (current && current.width === width && current.height === height) return current
  current?.dispose()
  const next = new WebGLRenderTarget(width, height, {
    depthBuffer: true,
    stencilBuffer: false,
  })
  next.texture.name = 'MonitorPass.SceneDepth'
  sceneDepthTarget.current = next
  return next
}

export function releaseSceneDepthTarget() {
  sceneDepthTarget.current?.dispose()
  sceneDepthTarget.current = null
}

function sourceFramebuffer(renderer: WebGLRenderer, source: RenderTarget) {
  const props = renderer.properties.get(source) as {
    __webglFramebuffer?: WebGLFramebuffer
    __webglMultisampledFramebuffer?: WebGLFramebuffer
  }
  return props.__webglMultisampledFramebuffer ?? props.__webglFramebuffer ?? null
}

/** 只拷深度，不动颜色。dest 为 null 时写入默认帧缓冲。 */
export function blitDepth(renderer: WebGLRenderer, source: RenderTarget, dest: RenderTarget | null) {
  const gl = renderer.getContext() as WebGL2RenderingContext
  if (typeof gl.blitFramebuffer !== 'function') return false
  const srcFbo = sourceFramebuffer(renderer, source)
  if (!srcFbo) return false

  let dstFbo: WebGLFramebuffer | null = null
  if (dest) {
    renderer.setRenderTarget(dest)
    const destProps = renderer.properties.get(dest) as { __webglFramebuffer?: WebGLFramebuffer }
    dstFbo = destProps.__webglFramebuffer ?? null
    if (!dstFbo) return false
  } else {
    renderer.getDrawingBufferSize(size)
  }

  const dstW = dest ? dest.width : size.x
  const dstH = dest ? dest.height : size.y
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, srcFbo)
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, dstFbo)
  gl.blitFramebuffer(0, 0, source.width, source.height, 0, 0, dstW, dstH, gl.DEPTH_BUFFER_BIT, gl.NEAREST)
  renderer.setRenderTarget(null)
  return true
}
