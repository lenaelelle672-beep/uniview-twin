import { HalfFloatType, LinearFilter, WebGLRenderTarget, type WebGLRenderer } from 'three'

let monitorTarget: WebGLRenderTarget | null = null

export function overlayDepthBudget(width = 0, height = 0) {
  const allocated = Boolean(monitorTarget)
  const w = monitorTarget?.width ?? width
  const h = monitorTarget?.height ?? height
  if (!allocated) return { extraTargets: 0, extraBytes: 0 }
  return { extraTargets: 1, extraBytes: w * h * 8 }
}

function sourceFramebuffer(renderer: WebGLRenderer, source: WebGLRenderTarget) {
  const props = renderer.properties.get(source) as {
    __webglFramebuffer?: WebGLFramebuffer
    __webglMultisampledFramebuffer?: WebGLFramebuffer
  }
  return props.__webglMultisampledFramebuffer ?? props.__webglFramebuffer ?? null
}

function blitFbo(
  renderer: WebGLRenderer,
  source: WebGLRenderTarget,
  dest: WebGLRenderTarget,
  mask: number,
  filter: number,
) {
  if (dest == null) {
    throw new Error('blitDepth: dest must be an FBO render target, not the default framebuffer (null)')
  }
  if (source === dest) return true
  const gl = renderer.getContext() as WebGL2RenderingContext
  if (typeof gl.blitFramebuffer !== 'function') return false
  const srcFbo = sourceFramebuffer(renderer, source)
  if (!srcFbo) return false

  const previous = renderer.getRenderTarget()
  renderer.setRenderTarget(dest)
  const destProps = renderer.properties.get(dest) as {
    __webglFramebuffer?: WebGLFramebuffer
    __webglMultisampledFramebuffer?: WebGLFramebuffer
  }
  const dstFbo = destProps.__webglMultisampledFramebuffer ?? destProps.__webglFramebuffer ?? null
  if (!dstFbo) {
    renderer.setRenderTarget(previous)
    return false
  }

  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, srcFbo)
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, dstFbo)
  gl.blitFramebuffer(0, 0, source.width, source.height, 0, 0, dest.width, dest.height, mask, filter)
  renderer.setRenderTarget(previous)
  return true
}

/**
 * 只在 FBO 之间拷深度。目标绝不能是默认帧缓冲（null）：
 * 画布 antialias:true 时默认 FBO 带 MSAA，DEPTH blit 是 INVALID_OPERATION。
 */
export function blitDepth(renderer: WebGLRenderer, source: WebGLRenderTarget, dest: WebGLRenderTarget) {
  if (dest == null) {
    throw new Error('blitDepth: dest must be an FBO render target, not the default framebuffer (null)')
  }
  const gl = renderer.getContext() as WebGL2RenderingContext
  return blitFbo(renderer, source, dest, gl.DEPTH_BUFFER_BIT, gl.NEAREST)
}

/** FBO 到 FBO 的颜色拷贝 / MSAA resolve。目标同样不能是 null。 */
export function blitColor(renderer: WebGLRenderer, source: WebGLRenderTarget, dest: WebGLRenderTarget) {
  if (dest == null) {
    throw new Error('blitDepth: dest must be an FBO render target, not the default framebuffer (null)')
  }
  const gl = renderer.getContext() as WebGL2RenderingContext
  return blitFbo(renderer, source, dest, gl.COLOR_BUFFER_BIT, gl.LINEAR)
}

/** D119：单采样、带场景深度的离屏缓冲。告警屏在色调映射之后画进这里。 */
export function ensureMonitorTarget(width: number, height: number) {
  if (monitorTarget && monitorTarget.width === width && monitorTarget.height === height) return monitorTarget
  monitorTarget?.dispose()
  monitorTarget = new WebGLRenderTarget(Math.max(1, width), Math.max(1, height), {
    depthBuffer: true,
    stencilBuffer: false,
    samples: 0,
    type: HalfFloatType,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
  })
  monitorTarget.texture.generateMipmaps = false
  monitorTarget.texture.name = 'MonitorAfterTone.SingleSample'
  return monitorTarget
}

export function releaseMonitorTarget() {
  monitorTarget?.dispose()
  monitorTarget = null
}
