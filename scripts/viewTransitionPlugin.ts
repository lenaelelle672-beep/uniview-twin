import { build as esbuild } from 'esbuild'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

/**
 * 哈希定稿前把 dock 里的视图过渡接线摘掉。
 * startViewTransition 不进 vite 图，所以不会带动 index / balancedFx / dock 的哈希。
 * 定稿后再把独立分包接回 dock。dock 自己在首帧之后才加载。
 * 分包复用 dock 里已经有的 store，不把 zustand 再打一份。
 * 这不是镜头阻尼，也不改 CameraControls。
 */
export const VIEW_TRANSITION_SOURCE_BLOCK = `// T105：楼层/视图的 DOM 过渡。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../view-transition/mount').then((mod) => {
  mod.mountFloorViewTransition()
})
`

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MOUNT_ENTRY = fileURLToPath(new URL('../src/view-transition/mount.ts', import.meta.url))

const LEAKS = /mountFloorViewTransition|view-transition\/mount|FloorViewTransition|__twinViewTransition/

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

function storeBinding(dockCode: string): string {
  const indexFile = dockCode.match(/from\s*["']\.\/(index-[^"']+\.js)["']/)?.[1]
  if (!indexFile) throw new Error('T105：找不到入口包')
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
  throw new Error('T105：dock 里没有可交给视图过渡的 store')
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

export function viewTransitionAfterHash(): Plugin {
  return {
    name: 'view-transition-after-hash',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]?.replaceAll('\\', '/')
      if (!file?.endsWith('/src/viewmarks/dock.tsx')) return null
      if (!code.includes(VIEW_TRANSITION_SOURCE_BLOCK)) {
        this.error('T105：dock 里的视图过渡接线变了，生产构建无法在哈希前摘干净')
      }
      return { code: code.replace(VIEW_TRANSITION_SOURCE_BLOCK, ''), map: null }
    },
    async generateBundle(_options, bundle) {
      const chunks = chunksOf(bundle)
      const index = chunks.find((item) => item.fileName.startsWith('assets/index-') && item.fileName.endsWith('.js'))
      const dock = chunks.find((item) => item.name === 'dock')
      const loop = chunks.find((item) => item.name === 'DemandLoop')
      const fx = chunks.find((item) => item.name === 'balancedFx' || item.fileName.includes('balancedFx'))
      if (!index || !dock || !loop || !fx) {
        this.error('T105：找不到入口包、dock、DemandLoop 或 balancedFx')
        return
      }
      for (const chunk of [index, dock, loop, fx]) {
        if (LEAKS.test(chunk.code)) this.error(`T105：视图过渡被打进了 ${chunk.fileName}`)
      }
      let binding = ''
      try {
        binding = storeBinding(dock.code)
      } catch {
        this.error('T105：dock 里没有可交给视图过渡的 store')
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
            name: 'view-transition-store-bridge',
            setup(build) {
              build.onResolve({ filter: /^\.\.\/store\/store$/ }, () => ({
                path: 'store-bridge',
                namespace: 'view-transition-store',
              }))
              build.onLoad({ filter: /.*/, namespace: 'view-transition-store' }, () => ({
                loader: 'js',
                contents: 'export const useTwinStore = globalThis.__twinViewTransitionStore\n',
              }))
            },
          },
        ],
      })
      const source = built.outputFiles[0]?.text ?? ''
      if (
        built.outputFiles.length !== 1 ||
        !source.includes('mountFloorViewTransition') ||
        !source.includes('startViewTransition') ||
        !source.includes('::view-transition-old(root)') ||
        !source.includes('200ms') ||
        !source.includes('__twinViewTransitionStore') ||
        !source.includes('prefers-reduced-motion') ||
        source.length > 12_000 ||
        /gsap|anime|cameraTransition|CameraControls|smoothTime|zustand|from"three"|from'three'|from"react"|from'react'|FogExp2|KeyboardControls|@react-three|postprocessing/i.test(
          source,
        )
      ) {
        this.error('T105：视图过渡分包没有独立打出来')
      }
      bundle['assets/FloorViewTransition.js'] = asset('assets/FloorViewTransition.js', source)
      dock.code += `\nwindow.__twinViewTransitionStore=${binding};void import("./FloorViewTransition.js").then((m)=>{m.mountFloorViewTransition()});\n`
    },
  }
}
