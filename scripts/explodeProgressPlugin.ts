import { build as esbuild } from 'esbuild'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

/**
 * 哈希定稿前把 dock 里的爆炸进度接线摘掉，滑杆不进 vite 图。
 * 定稿后再把独立分包接回 dock。dock 自己在首帧之后才加载。
 * 不把 KeyboardControls 打进来。
 */
export const EXPLODE_PROGRESS_SOURCE_BLOCK = `// T094：爆炸进度滑杆和键盘档。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../explode-progress/mount').then((mod) => {
  mod.mountExplodeProgress()
})
`

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MOUNT_ENTRY = fileURLToPath(new URL('../src/explode-progress/mount.ts', import.meta.url))

const LEAKS = /mountExplodeProgress|explode-progress\/mount|explode-progress\/publish|installExplodeProgress|KeyboardControls/

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

export function explodeProgressAfterHash(): Plugin {
  return {
    name: 'explode-progress-after-hash',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]?.replaceAll('\\', '/')
      if (!file?.endsWith('/src/viewmarks/dock.tsx')) return null
      if (!code.includes(EXPLODE_PROGRESS_SOURCE_BLOCK)) {
        this.error('T094：dock 里的爆炸进度接线变了，生产构建无法在哈希前摘干净')
      }
      return { code: code.replace(EXPLODE_PROGRESS_SOURCE_BLOCK, ''), map: null }
    },
    async generateBundle(_options, bundle) {
      const chunks = chunksOf(bundle)
      const index = chunks.find((item) => item.fileName.startsWith('assets/index-') && item.fileName.endsWith('.js'))
      const dock = chunks.find((item) => item.name === 'dock')
      const loop = chunks.find((item) => item.name === 'DemandLoop')
      const fx = chunks.find((item) => item.name === 'balancedFx' || item.fileName.includes('balancedFx'))
      if (!index || !dock || !loop || !fx) {
        this.error('T094：找不到入口包、dock、DemandLoop 或 balancedFx')
        return
      }
      for (const chunk of [index, dock, loop, fx]) {
        if (LEAKS.test(chunk.code)) this.error(`T094：爆炸进度被打进了 ${chunk.fileName}`)
      }
      const binding = dock.code.match(/\{[^}]*\ba as ([A-Za-z_$][\w$]*)/)?.[1]
      if (!binding || !dock.code.includes(`${binding}.getState`)) {
        this.error('T094：dock 里没有可交给爆炸进度的 store')
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
            name: 'explode-progress-store-bridge',
            setup(build) {
              build.onResolve({ filter: /^\.\.\/store\/store$/ }, () => ({
                path: 'store-bridge',
                namespace: 'explode-progress-store',
              }))
              build.onLoad({ filter: /.*/, namespace: 'explode-progress-store' }, () => ({
                loader: 'js',
                contents: 'export const useTwinStore = globalThis.__twinExplodeStore\n',
              }))
            },
          },
        ],
      })
      const source = built.outputFiles[0]?.text ?? ''
      if (
        built.outputFiles.length !== 1 ||
        !source.includes('mountExplodeProgress') ||
        !source.includes('range') ||
        !source.includes('爆炸进度') ||
        source.length > 20_000 ||
        /gsap|animejs|@react-spring|zustand|KeyboardControls|Html\.js|FogExp2|smoothTime|from"three"|from'three'|@react-three/i.test(
          source,
        )
      ) {
        this.error('T094：爆炸进度分包没有独立打出来')
      }
      const fileName = 'assets/ExplodeProgress.js'
      bundle[fileName] = {
        type: 'asset',
        fileName,
        name: 'explodeProgress',
        names: ['explodeProgress'],
        originalFileName: null,
        originalFileNames: [],
        source,
        needsCodeReference: false,
      }
      dock.code += `\nwindow.__twinExplodeStore=${binding};void import("./ExplodeProgress.js").then((m)=>{m.mountExplodeProgress()});\n`
    },
  }
}
