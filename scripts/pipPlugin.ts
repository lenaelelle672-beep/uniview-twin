import { build as esbuild } from 'esbuild'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

/**
 * 哈希定稿前把 dock 里的画中画接线摘掉，captureStream / requestPictureInPicture
 * 不进 vite 图，所以不会带动 index / balancedFx / dock 的哈希。
 * 定稿后再把独立分包接回 dock。dock 自己在首帧约 2600ms 之后才加载。
 */
export const PIP_SOURCE_BLOCK = `// T083：画中画值守。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../pip/mount').then((mod) => {
  mod.mountPipWatch()
})
`

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MOUNT_ENTRY = fileURLToPath(new URL('../src/pip/mount.ts', import.meta.url))

const LEAKS = /mountPipWatch|requestPictureInPicture|pip\/mount|PipWatch|captureStream/

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

export function pipAfterHash(): Plugin {
  return {
    name: 'pip-watch-after-hash',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]?.replaceAll('\\', '/')
      if (!file?.endsWith('/src/viewmarks/dock.tsx')) return null
      if (!code.includes(PIP_SOURCE_BLOCK)) {
        this.error('T083：dock 里的画中画接线变了，生产构建无法在哈希前摘干净')
      }
      return { code: code.replace(PIP_SOURCE_BLOCK, ''), map: null }
    },
    async generateBundle(_options, bundle) {
      const chunks = chunksOf(bundle)
      const index = chunks.find((item) => item.fileName.startsWith('assets/index-') && item.fileName.endsWith('.js'))
      const dock = chunks.find((item) => item.name === 'dock')
      const loop = chunks.find((item) => item.name === 'DemandLoop')
      const fx = chunks.find((item) => item.name === 'balancedFx' || item.fileName.includes('balancedFx'))
      if (!index || !dock || !loop || !fx) {
        this.error('T083：找不到入口包、dock、DemandLoop 或 balancedFx')
        return
      }
      for (const chunk of [index, dock, loop, fx]) {
        if (LEAKS.test(chunk.code)) this.error(`T083：画中画被打进了 ${chunk.fileName}`)
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
        write: false,
      })
      const source = built.outputFiles[0]?.text ?? ''
      if (
        built.outputFiles.length !== 1 ||
        !source.includes('mountPipWatch') ||
        !source.includes('requestPictureInPicture') ||
        !source.includes('captureStream') ||
        !source.includes('nopip') ||
        source.length > 20_000 ||
        /ccapture|zustand|react-three|from"three"|from'three'|MediaRecorder|setFrameloop|requestFullscreen|autoPictureInPicture/i.test(
          source,
        )
      ) {
        this.error('T083：画中画分包没有独立打出来')
      }
      bundle['assets/PipWatch.js'] = asset('assets/PipWatch.js', source)
      dock.code += `\nvoid import("./PipWatch.js").then((m)=>{m.mountPipWatch()});\n`
    },
  }
}
