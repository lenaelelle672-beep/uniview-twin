import { build as esbuild } from 'esbuild'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

/**
 * 哈希定稿前把 dock 里的文档值守接线摘掉。
 * documentPictureInPicture 不进 vite 图，所以不会带动 index / balancedFx / dock 的哈希。
 * 定稿后再把独立分包接回 dock。dock 自己在首帧约 2600ms 之后才加载。
 * 分包复用 dock 里已经有的 store，不把 zustand 再打一份。
 * 这不是视频值守分包。
 */
export const DOCUMENT_WATCH_SOURCE_BLOCK = `// T087：文档画中画值守。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../document-watch/mount').then((mod) => {
  mod.mountDocumentWatch()
})
`

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MOUNT_ENTRY = fileURLToPath(new URL('../src/document-watch/mount.ts', import.meta.url))

const LEAKS = /mountDocumentWatch|documentPictureInPicture|document-watch\/mount|DocumentWatch|docpip/

interface BundleChunk {
  type: string
  name: string
  fileName: string
  code: string
}

interface BundleAsset {
  type: string
  source?: string | Uint8Array
}

function isChunk(item: { type: string }): item is BundleChunk {
  return item.type === 'chunk'
}

function chunksOf(bundle: Record<string, { type: string }>): BundleChunk[] {
  return Object.values(bundle).filter(isChunk)
}

function storeBinding(dockCode: string): string {
  const indexFile = dockCode.match(/from\s*["']\.\/(index-[^"']+\.js)["']/)?.[1]
  if (!indexFile) throw new Error('T087：找不到入口包')
  const pattern = /import\s*\{([^}]+)\}\s*from\s*["']\.\/([^"']+)["']/g
  for (const match of dockCode.matchAll(pattern)) {
    if (match[2] !== indexFile) continue
    for (const part of match[1].split(',')) {
      const piece = part.trim()
      if (!piece) continue
      const bits = piece.split(/\s+as\s+/)
      const local = (bits[1] ?? bits[0]).trim()
      if (dockCode.includes(`${local}.getState`)) return local
    }
  }
  throw new Error('T087：dock 里没有可交给文档值守的 store')
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

export function documentWatchAfterHash(): Plugin {
  return {
    name: 'document-watch-after-hash',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]?.replaceAll('\\', '/')
      if (!file?.endsWith('/src/viewmarks/dock.tsx')) return null
      if (!code.includes(DOCUMENT_WATCH_SOURCE_BLOCK)) {
        this.error('T087：dock 里的文档值守接线变了，生产构建无法在哈希前摘干净')
      }
      return { code: code.replace(DOCUMENT_WATCH_SOURCE_BLOCK, ''), map: null }
    },
    async generateBundle(_options, bundle) {
      const chunks = chunksOf(bundle)
      const index = chunks.find((item) => item.fileName.startsWith('assets/index-') && item.fileName.endsWith('.js'))
      const dock = chunks.find((item) => item.name === 'dock')
      const loop = chunks.find((item) => item.name === 'DemandLoop')
      const fx = chunks.find((item) => item.name === 'balancedFx' || item.fileName.includes('balancedFx'))
      if (!index || !dock || !loop || !fx) {
        this.error('T087：找不到入口包、dock、DemandLoop 或 balancedFx')
        return
      }
      for (const chunk of [index, dock, loop, fx]) {
        if (LEAKS.test(chunk.code)) this.error(`T087：文档值守被打进了 ${chunk.fileName}`)
      }
      const pip = bundle['assets/PipWatch.js'] as BundleAsset | undefined
      const pipSource = typeof pip?.source === 'string' ? pip.source : ''
      if (pipSource.includes('documentPictureInPicture') || pipSource.includes('mountDocumentWatch')) {
        this.error('T087：文档画中画混进了视频值守分包')
      }
      let binding = ''
      try {
        binding = storeBinding(dock.code)
      } catch {
        this.error('T087：dock 里没有可交给文档值守的 store')
        return
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
        plugins: [
          {
            name: 'document-watch-store-bridge',
            setup(build) {
              build.onResolve({ filter: /^\.\.\/store\/store$/ }, () => ({
                path: 'store-bridge',
                namespace: 'document-watch-store-bridge',
              }))
              build.onLoad({ filter: /.*/, namespace: 'document-watch-store-bridge' }, () => ({
                loader: 'js',
                contents: 'export const useTwinStore = globalThis.__twinDocumentWatchStore\n',
              }))
            },
          },
        ],
      })
      const source = built.outputFiles[0]?.text ?? ''
      if (
        built.outputFiles.length !== 1 ||
        !source.includes('mountDocumentWatch') ||
        !source.includes('documentPictureInPicture') ||
        !source.includes('requestWindow') ||
        !source.includes('disallowReturnToOpener') ||
        !source.includes('docpip') ||
        !source.includes('__twinDocumentWatchStore') ||
        !source.includes('回到主页') ||
        source.length > 20_000 ||
        /requestPictureInPicture|captureStream|mountPipWatch|PipWatch|nopip|BroadcastChannel|zustand|react-dom|startTransition|FogExp2|smoothTime|balancedFx|ccapture/i.test(
          source,
        )
      ) {
        this.error('T087：文档值守分包没有独立打出来')
      }
      bundle['assets/DocumentWatch.js'] = asset('assets/DocumentWatch.js', source)
      dock.code += `\nwindow.__twinDocumentWatchStore=${binding};void import("./DocumentWatch.js").then((m)=>{m.mountDocumentWatch()});\n`
    },
  }
}
