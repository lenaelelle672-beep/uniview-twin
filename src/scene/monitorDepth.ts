import type { WebGLRenderer } from 'three'

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

/** 1366×768 均衡档已知渲染目标清单。告警屏复用合成器缓冲，不另开全屏目标。 */
export function balancedTargetInventory(width: number, height: number) {
  const halfW = Math.max(1, Math.ceil(width / 2))
  const halfH = Math.max(1, Math.ceil(height / 2))
  const items = [
    { name: 'composer.input', width, height, format: 'RGBA16F', samples: 2, bytes: width * height * 8 * 2 + width * height * 4 * 2 },
    { name: 'composer.output', width, height, format: 'RGBA16F', samples: 2, bytes: width * height * 8 * 2 + width * height * 4 * 2 },
    { name: 'n8ao.halfRes', width: halfW, height: halfH, format: 'RGBA16F', samples: 1, bytes: halfW * halfH * 8 },
    { name: 'contactShadow', width: 512, height: 512, format: 'RGBA8', samples: 1, bytes: 512 * 512 * 4 },
    { name: 'contactShadow.blur', width: 512, height: 512, format: 'RGBA8', samples: 1, bytes: 512 * 512 * 4 },
    { name: 'shadowMap', width: 1024, height: 1024, format: 'Depth', samples: 1, bytes: 1024 * 1024 * 4 },
    { name: 'monitorOverlay', width: 0, height: 0, format: 'none', samples: 0, bytes: 0 },
  ]
  const bytes = items.reduce((sum, item) => sum + item.bytes, 0)
  return { width, height, items, bytes, mib: bytes / (1024 * 1024) }
}
