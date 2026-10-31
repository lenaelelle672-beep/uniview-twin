import { build as esbuild } from 'esbuild'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

/**
 * T097：哈希定稿前把 DemandLoop 里的续帧接线摘掉，
 * 滑杆 / 徽标矩阵 / fit 的共用入口不进 vite 图，也不改入口哈希。
 * 定稿后再把独立分包接回 DemandLoop。DemandLoop 自己在首帧之后才加载。
 */
export const DEMAND_FRAME_SOURCE_BLOCK = `// T097：demand 续帧。生产构建在 DemandLoop 哈希前摘掉这段，哈希定稿后再接独立分包。
void import('../../scene/demandFrameMount').then((mod) => {
  mod.mountDemandFrame()
})
`

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MOUNT_ENTRY = fileURLToPath(new URL('../src/scene/demandFrameMount.ts', import.meta.url))

const LEAKS = /demandFrameMount|mountDemandFrame|DemandFrame\.js|holdDemandFrame/

function asset(fileName: string, source: string) {
  return {
    type: 'asset' as const,
    fileName,
    name: fileName,
    names: [fileName],
    originalFileName: null,
    originalFileNames: [] as string[],
    source,
    needsCodeReference: false,
  }
}

export async function builtDemandFrame(): Promise<string> {
  const built = await esbuild({
    absWorkingDir: ROOT,
    entryPoints: [MOUNT_ENTRY],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    legalComments: 'none',
    write: false,
  })
  const source = built.outputFiles[0]?.text ?? ''
  if (
    built.outputFiles.length !== 1 ||
    !source.includes('mountDemandFrame') ||
    !source.includes('askFrame') ||
    !source.includes('requestAnimationFrame') ||
    source.length > 20_000 ||
    /gsap|animejs|@react-spring|from"three"|from'three'|zustand|WebGLRenderer|FogExp2|smoothTime|FixedFramePump|PerformanceMonitor|setFrameloop/i.test(
      source,
    )
  ) {
    throw new Error('T097：共用续帧分包没有独立打出来')
  }
  return source
}

export function demandFrameAfterHash(): Plugin {
  return {
    name: 'demand-frame-after-hash',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]?.replaceAll('\\', '/')
      if (!file?.endsWith('/src/components/scene/DemandLoop.tsx')) return null
      if (!code.includes(DEMAND_FRAME_SOURCE_BLOCK)) {
        this.error('T097：DemandLoop 里的续帧接线变了，生产构建无法在哈希前摘干净')
      }
      return { code: code.replace(DEMAND_FRAME_SOURCE_BLOCK, ''), map: null }
    },
    async generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).filter((item) => item.type === 'chunk')
      const index = chunks.find((item) => item.type === 'chunk' && item.fileName.startsWith('assets/index-') && item.fileName.endsWith('.js'))
      const dock = chunks.find((item) => item.type === 'chunk' && item.name === 'dock')
      const loop = chunks.find((item) => item.type === 'chunk' && item.name === 'DemandLoop')
      const fx = chunks.find((item) => item.type === 'chunk' && (item.name === 'balancedFx' || item.fileName.includes('balancedFx')))
      if (!index || index.type !== 'chunk' || !loop || loop.type !== 'chunk') {
        this.error('T097：找不到入口包或 DemandLoop')
        return
      }
      for (const chunk of [index, dock, loop, fx]) {
        if (!chunk || chunk.type !== 'chunk') continue
        if (LEAKS.test(chunk.code)) this.error(`T097：共用续帧被打进了 ${chunk.fileName}`)
      }
      const source = await builtDemandFrame()
      bundle['assets/DemandFrame.js'] = asset('assets/DemandFrame.js', source)
      loop.code += `\nvoid import("./DemandFrame.js").then((m)=>{m.mountDemandFrame()});\n`
    },
  }
}
