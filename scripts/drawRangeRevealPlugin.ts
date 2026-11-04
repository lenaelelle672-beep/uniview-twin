import { build as esbuild } from 'esbuild'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

/**
 * 哈希定稿前把 dock 里的 drawRange 显形接线摘掉。
 * 显形不进 vite 图，所以不会带动 index / balancedFx / dock 的哈希。
 * 定稿后再把独立分包接回 dock。dock 自己在首帧约 2600ms 之后才加载。
 */
export const DRAW_RANGE_REVEAL_SOURCE_BLOCK = `// T112：进层 setDrawRange 渐进显形。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../drawrange-reveal/mount').then((mod) => {
  mod.mountDrawRangeReveal()
})
`

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MOUNT_ENTRY = fileURLToPath(new URL('../src/drawrange-reveal/mount.ts', import.meta.url))

const LEAKS = /mountDrawRangeReveal|drawrange-reveal\/mount|DrawRangeReveal\.js|__twinDrawRangeReveal/

/** 不带三维库和动画库，不自开 rAF 循环，不改 R3F 的帧计数。 */
const FORBIDDEN =
  /from"three"|from'three'|@react-three|three-stdlib|three-mesh-bvh|zustand|react-dom|gsap|framer-motion|@react-spring|animejs|maath|requestAnimationFrame|setInterval|askFrame|\.frames=(?!=)/

interface BundleChunk {
  type: string
  name: string
  fileName: string
  code: string
}

function isChunk(item: { type: string }): item is BundleChunk {
  return item.type === 'chunk'
}

function chunksOf(bundle: Record<string, { type: string }>): BundleChunk[] {
  return Object.values(bundle).filter(isChunk)
}

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

export function drawRangeRevealAfterHash(): Plugin {
  return {
    name: 'draw-range-reveal-after-hash',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]?.replaceAll('\\', '/')
      if (!file?.endsWith('/src/viewmarks/dock.tsx')) return null
      if (!code.includes(DRAW_RANGE_REVEAL_SOURCE_BLOCK)) {
        this.error('T112：dock 里的 drawRange 显形接线变了，生产构建无法在哈希前摘干净')
      }
      return { code: code.replace(DRAW_RANGE_REVEAL_SOURCE_BLOCK, ''), map: null }
    },
    async generateBundle(_options, bundle) {
      const chunks = chunksOf(bundle)
      const index = chunks.find((item) => item.fileName.startsWith('assets/index-') && item.fileName.endsWith('.js'))
      const dock = chunks.find((item) => item.name === 'dock')
      const loop = chunks.find((item) => item.name === 'DemandLoop')
      const fx = chunks.find((item) => item.name === 'balancedFx' || item.fileName.includes('balancedFx'))
      if (!index || !dock || !loop || !fx) {
        this.error('T112：找不到入口包、dock、DemandLoop 或 balancedFx')
        return
      }
      for (const chunk of [index, dock, loop, fx]) {
        if (LEAKS.test(chunk.code)) this.error(`T112：drawRange 显形被打进了 ${chunk.fileName}`)
      }
      const built = await esbuild({
        absWorkingDir: ROOT,
        entryPoints: [MOUNT_ENTRY],
        bundle: true,
        format: 'esm',
        platform: 'browser',
        target: 'es2022',
        minify: true,
        legalComments: 'none',
        charset: 'utf8',
        write: false,
      })
      const source = built.outputFiles[0]?.text ?? ''
      if (
        built.outputFiles.length !== 1 ||
        !source.includes('mountDrawRangeReveal') ||
        !source.includes('setDrawRange') ||
        !source.includes('onBeforeRender') ||
        !source.includes('onAfterRender') ||
        !source.includes('FloorInterior') ||
        !source.includes('FloorSlab') ||
        !source.includes('FloorCores') ||
        !source.includes('isInstancedMesh') ||
        !source.includes('isBatchedMesh') ||
        !source.includes('isInstancedBufferGeometry') ||
        !source.includes('data-twin-asset-load') ||
        !source.includes('__twinDrawRangeReveal') ||
        source.length > 12_000 ||
        FORBIDDEN.test(source)
      ) {
        this.error('T112：drawRange 显形分包没有独立打出来')
      }
      bundle['assets/DrawRangeReveal.js'] = asset('assets/DrawRangeReveal.js', source)
      dock.code += `\nvoid import("./DrawRangeReveal.js").then((m)=>{m.mountDrawRangeReveal()});\n`
    },
  }
}
