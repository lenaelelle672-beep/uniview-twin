import { build as esbuild } from 'esbuild'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

/**
 * 哈希定稿前把 dock 里的另存为接线摘掉，showSaveFilePicker 不进 vite 图，
 * 所以不会带动 index / balancedFx / dock 的哈希。
 * 定稿后再把独立分包接回 dock。dock 自己在首帧约 2600ms 之后才加载。
 */
export const FILE_SAVE_SOURCE_BLOCK = `// T088：另存为。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../fs-access/mount').then((mod) => {
  mod.mountFileSave()
})
`

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MOUNT_ENTRY = fileURLToPath(new URL('../src/fs-access/mount.ts', import.meta.url))

const LEAKS = /showSaveFilePicker|createWritable|mountFileSave|fs-access\/mount|FileSave/

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

export function fsAccessAfterHash(): Plugin {
  return {
    name: 'fs-access-after-hash',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]?.replaceAll('\\', '/')
      if (!file?.endsWith('/src/viewmarks/dock.tsx')) return null
      if (!code.includes(FILE_SAVE_SOURCE_BLOCK)) {
        this.error('T088：dock 里的另存为接线变了，生产构建无法在哈希前摘干净')
      }
      return { code: code.replace(FILE_SAVE_SOURCE_BLOCK, ''), map: null }
    },
    async generateBundle(_options, bundle) {
      const chunks = chunksOf(bundle)
      const index = chunks.find((item) => item.fileName.startsWith('assets/index-') && item.fileName.endsWith('.js'))
      const dock = chunks.find((item) => item.name === 'dock')
      const loop = chunks.find((item) => item.name === 'DemandLoop')
      const fx = chunks.find((item) => item.name === 'balancedFx' || item.fileName.includes('balancedFx'))
      if (!index || !dock || !loop || !fx) {
        this.error('T088：找不到入口包、dock、DemandLoop 或 balancedFx')
        return
      }
      for (const chunk of [index, dock, loop, fx]) {
        if (LEAKS.test(chunk.code)) this.error(`T088：另存为被打进了 ${chunk.fileName}`)
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
        !source.includes('mountFileSave') ||
        !source.includes('showSaveFilePicker') ||
        !source.includes('createWritable') ||
        !source.includes('uniview-clip.webm') ||
        !source.includes('.glb') ||
        !source.includes('AbortError') ||
        source.length > 8_000 ||
        /shareShot|clipboard|ClipboardItem|ccapture|zustand|react-three|from"three"|from'three'|FogExp2|smoothTime|requestPictureInPicture|MediaRecorder|setFrameloop/i.test(
          source,
        )
      ) {
        this.error('T088：另存为分包没有独立打出来')
      }
      bundle['assets/FileSave.js'] = asset('assets/FileSave.js', source)
      dock.code += `\nvoid import("./FileSave.js").then((m)=>{m.mountFileSave()});\n`
      if (/showSaveFilePicker|createWritable/.test(index.code + loop.code + fx.code + dock.code)) {
        this.error('T088：picker 正文进了入口、dock 或 balancedFx')
      }
    },
  }
}
