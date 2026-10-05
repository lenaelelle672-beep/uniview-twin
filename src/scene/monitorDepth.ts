import type { WebGLRenderer, WebGLRenderTarget } from 'three'

export function overlayDepthBudget() {
  return { extraTargets: 0, extraBytes: 0 }
}

export function defaultFramebufferSamples(gl: WebGLRenderer) {
  const ctx = gl.getContext()
  return Number(ctx.getParameter(ctx.SAMPLES) ?? 0)
}

export function drainGlErrors(gl: WebGLRenderer) {
  const ctx = gl.getContext()
  const codes: number[] = []
  for (let i = 0; i < 8; i += 1) {
    const code = ctx.getError()
    if (code === ctx.NO_ERROR) break
    codes.push(code)
  }
  return codes
}

export function supportsParallelShaderCompile(gl: WebGLRenderer) {
  const ctx = gl.getContext()
  const names = ctx.getSupportedExtensions() ?? []
  return names.includes('KHR_parallel_shader_compile')
}

function sourceFramebuffer(renderer: WebGLRenderer, source: WebGLRenderTarget) {
  const props = renderer.properties.get(source) as {
    __webglFramebuffer?: WebGLFramebuffer
    __webglMultisampledFramebuffer?: WebGLFramebuffer
  }
  return props.__webglMultisampledFramebuffer ?? props.__webglFramebuffer ?? null
}

/**
 * 只在 FBO 之间拷深度。目标绝不能是默认帧缓冲（null）：
 * 画布 antialias:true 时默认 FBO 带 MSAA，DEPTH blit 是 INVALID_OPERATION。
 */
export function blitDepth(renderer: WebGLRenderer, source: WebGLRenderTarget, dest: WebGLRenderTarget) {
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
  gl.blitFramebuffer(0, 0, source.width, source.height, 0, 0, dest.width, dest.height, gl.DEPTH_BUFFER_BIT, gl.NEAREST)
  renderer.setRenderTarget(previous)
  return true
}

function msaaColorBytes(width: number, height: number, bytesPerPixel: number, samples: number) {
  return width * height * bytesPerPixel * samples
}

/** 1366×768 均衡档已知渲染目标清单。告警屏复用合成器缓冲，不另开全屏目标。 */
export function balancedTargetInventory(width: number, height: number) {
  const halfW = Math.max(1, Math.floor(width / 2))
  const halfH = Math.max(1, Math.floor(height / 2))
  const items = [
    {
      name: 'composer.input',
      width,
      height,
      format: 'RGBA16F+Depth',
      samples: 2,
      bytes: msaaColorBytes(width, height, 8, 2) + msaaColorBytes(width, height, 4, 2),
    },
    {
      name: 'composer.output',
      width,
      height,
      format: 'RGBA16F+Depth',
      samples: 2,
      bytes: msaaColorBytes(width, height, 8, 2) + msaaColorBytes(width, height, 4, 2),
    },
    { name: 'n8ao.write', width: halfW, height: halfH, format: 'RGBA8', samples: 1, bytes: halfW * halfH * 4 },
    { name: 'n8ao.read', width: halfW, height: halfH, format: 'RGBA8', samples: 1, bytes: halfW * halfH * 4 },
    { name: 'n8ao.accumulation', width: halfW, height: halfH, format: 'RGBA16F', samples: 1, bytes: halfW * halfH * 8 },
    { name: 'n8ao.output', width, height, format: 'RGBA8', samples: 1, bytes: width * height * 4 },
    { name: 'n8ao.halfDepth', width: halfW, height: halfH, format: 'R32F', samples: 1, bytes: halfW * halfH * 4 },
    { name: 'n8ao.halfNormal', width: halfW, height: halfH, format: 'RGBA16F', samples: 1, bytes: halfW * halfH * 8 },
    { name: 'contactShadow', width: 512, height: 512, format: 'RGBA8', samples: 1, bytes: 512 * 512 * 4 },
    { name: 'contactShadow.blur', width: 512, height: 512, format: 'RGBA8', samples: 1, bytes: 512 * 512 * 4 },
    { name: 'shadowMap', width: 1024, height: 1024, format: 'Depth', samples: 1, bytes: 1024 * 1024 * 4 },
    { name: 'monitorOverlay', width: 0, height: 0, format: 'none', samples: 0, bytes: 0 },
  ]
  const bytes = items.reduce((sum, item) => sum + item.bytes, 0)
  return { width, height, items, bytes, mib: bytes / (1024 * 1024) }
}

export const BLIT_SITES = [
  {
    file: 'src/scene/monitorDepth.ts',
    fn: 'blitDepth',
    dest: 'caller-supplied WebGLRenderTarget; throws if null',
  },
  {
    file: 'src/components/scene/postfx/balancedFx.tsx',
    fn: 'MonitorDrawPass.restore',
    dest: 'composer inputBuffer (FBO), never null / default framebuffer',
  },
  {
    file: 'src/components/scene/MonitorPass.tsx',
    fn: '(none)',
    dest: 'does not blit; perf draws directly, balanced uses composer',
  },
] as const
