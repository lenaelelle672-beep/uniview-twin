import { build as esbuild } from 'esbuild'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

/**
 * 哈希定稿前把 dock 里的 visualViewport 接线摘掉。
 * 监听不进 vite 图，所以不会带动 index / balancedFx / dock 的哈希。
 * 定稿后再把独立分包接回 dock。dock 自己在首帧约 2600ms 之后才加载。
 */
export const VISUAL_VIEWPORT_SOURCE_BLOCK = `// T109：visualViewport 与 ResizeObserver。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../visual-viewport/mount').then((mod) => {
  mod.mountVisualViewportHud()
})
`

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MOUNT_ENTRY = fileURLToPath(new URL('../src/visual-viewport/mount.ts', import.meta.url))

const LEAKS = /mountVisualViewportHud|visual-viewport\/mount|VisualViewport\.js/

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

export function visualViewportAfterHash(): Plugin {
  return {
    name: 'visual-viewport-after-hash',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]?.replaceAll('\\', '/')
      if (!file?.endsWith('/src/viewmarks/dock.tsx')) return null
      if (!code.includes(VISUAL_VIEWPORT_SOURCE_BLOCK)) {
        this.error('T109：dock 里的 visualViewport 接线变了，生产构建无法在哈希前摘干净')
      }
      return { code: code.replace(VISUAL_VIEWPORT_SOURCE_BLOCK, ''), map: null }
    },
    async generateBundle(_options, bundle) {
      const chunks = chunksOf(bundle)
      const index = chunks.find((item) => item.fileName.startsWith('assets/index-') && item.fileName.endsWith('.js'))
      const dock = chunks.find((item) => item.name === 'dock')
      const loop = chunks.find((item) => item.name === 'DemandLoop')
      const fx = chunks.find((item) => item.name === 'balancedFx' || item.fileName.includes('balancedFx'))
      if (!index || !dock || !loop || !fx) {
        this.error('T109：找不到入口包、dock、DemandLoop 或 balancedFx')
        return
      }
      for (const chunk of [index, dock, loop, fx]) {
        if (LEAKS.test(chunk.code)) this.error(`T109：visualViewport 被打进了 ${chunk.fileName}`)
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
        !source.includes('mountVisualViewportHud') ||
        !source.includes('visualViewport') ||
        !source.includes('ResizeObserver') ||
        !source.includes('documentElement') ||
        !source.includes('fullscreenElement') ||
        !source.includes('innerWidth') ||
        !source.includes('--vv-w') ||
        !source.includes('data-vv') ||
        source.length > 20_000 ||
        /CameraRig|setLookAt|setSize|requestFullscreen|fullscreenchange|from"three"|from'three'|zustand|smoothTime|FogExp2|@react-three/i.test(
          source,
        )
      ) {
        this.error('T109：visualViewport 分包没有独立打出来')
      }
      bundle['assets/VisualViewport.js'] = asset('assets/VisualViewport.js', source)
      dock.code += `\nvoid import("./VisualViewport.js").then((m)=>{m.mountVisualViewportHud()});\n`
    },
  }
}
