function msaaColorBytes(width: number, height: number, bytesPerPixel: number, samples: number) {
  return width * height * bytesPerPixel * samples
}

/** 未分配离屏目标时的预算。性能档永远是这个数。 */
export function overlayDepthBudgetUnallocated() {
  return { extraTargets: 0, extraBytes: 0 }
}

/** 1366×768 均衡档已知渲染目标清单。告警屏用一张单采样带深度的离屏目标。 */
export function balancedTargetInventory(width: number, height: number) {
  const halfW = Math.max(1, Math.floor(width / 2))
  const halfH = Math.max(1, Math.floor(height / 2))
  const items = [
    {
      name: 'composer.input',
      width,
      height,
      format: 'RGBA16F+Depth',
      samples: 1,
      bytes: msaaColorBytes(width, height, 8, 1) + msaaColorBytes(width, height, 4, 1),
    },
    {
      name: 'composer.output',
      width,
      height,
      format: 'RGBA16F+Depth',
      samples: 1,
      bytes: msaaColorBytes(width, height, 8, 1) + msaaColorBytes(width, height, 4, 1),
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
    {
      name: 'monitorAfterTone',
      width,
      height,
      format: 'RGBA16F+Depth',
      samples: 1,
      bytes: width * height * 8 + width * height * 4,
    },
  ]
  const bytes = items.reduce((sum, item) => sum + item.bytes, 0)
  return { width, height, items, bytes, mib: bytes / (1024 * 1024) }
}

export const BLIT_SITES = [
  {
    file: 'src/scene/monitorDepth.ts',
    fn: 'blitDepth / blitColor',
    dest: 'caller-supplied WebGLRenderTarget; throws if null',
  },
  {
    file: 'src/components/scene/postfx/balancedFx.tsx',
    fn: 'MonitorAfterTonePass',
    dest: 'single-sampled monitorAfterTone FBO; copies color by draw, no depth blit',
  },
  {
    file: 'src/components/scene/MonitorPass.tsx',
    fn: '(none)',
    dest: 'does not blit; perf draws directly into the default FBO',
  },
] as const
