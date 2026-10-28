import { build as esbuild } from 'esbuild'
import { fileURLToPath } from 'node:url'
import type { OutputAsset, OutputBundle, OutputChunk } from 'rollup'
import type { Plugin } from 'vite'

/**
 * 哈希定稿前把 dock 里的多标签接线摘掉。
 * BroadcastChannel 不进 vite 图，所以不会带动 index / balancedFx / dock 的哈希。
 * 定稿后再把独立分包接回 dock。分包复用 dock 里已经有的 store，不把 zustand 再打一份。
 */
export const BUS_SOURCE_BLOCK = `// T081：多标签总线。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../bus/mount').then((mod) => {
  mod.mountBroadcastBus(() => import('../components/scene/vp'))
})
`

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MOUNT_ENTRY = fileURLToPath(new URL('../src/bus/mount.ts', import.meta.url))
const LEAKS = ['BroadcastChannel', 'mountBroadcastBus', 'uniview-twin', 'bus/mount']

function isChunk(item: OutputAsset | OutputChunk): item is OutputChunk {
  return item.type === 'chunk'
}

function storeBinding(dockCode: string): string {
  const indexFile = dockCode.match(/from\s*["']\.\/(index-[^"']+\.js)["']/)?.[1]
  if (!indexFile) throw new Error('T081：找不到入口包')
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
  throw new Error('T081：dock 里没有可交给总线的 store')
}

function viewpointFile(bundle: OutputBundle): string {
  for (const item of Object.values(bundle)) {
    if (!isChunk(item)) continue
    if (item.name === 'vp') return item.fileName.split('/').pop() ?? ''
  }
  throw new Error('T081：找不到视角落点分包，总线无法接力令牌')
}

export function broadcastAfterHash(): Plugin {
  return {
    name: 'broadcast-after-hash',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]?.replaceAll('\\', '/')
      if (!file?.endsWith('/src/viewmarks/dock.tsx')) return null
      if (!code.includes(BUS_SOURCE_BLOCK)) {
        this.error('T081：dock 里的多标签接线变了，生产构建无法在哈希前摘干净')
      }
      return { code: code.replace(BUS_SOURCE_BLOCK, ''), map: null }
    },
    async generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).filter(isChunk)
      const index = chunks.find((item) => item.fileName.startsWith('assets/index-') && item.fileName.endsWith('.js'))
      const dock = chunks.find((item) => item.name === 'dock')
      const loop = chunks.find((item) => item.name === 'DemandLoop')
      const fx = chunks.find((item) => item.name === 'balancedFx' || item.fileName.includes('balancedFx'))
      if (!index || !dock || !loop) {
        this.error('T081：找不到入口包、dock 或 DemandLoop')
        return
      }
      for (const chunk of [index, loop, fx, dock]) {
        if (!chunk) continue
        for (const leak of LEAKS) {
          if (chunk.code.includes(leak)) this.error(`T081：${leak} 在哈希前被打进了 ${chunk.fileName}`)
        }
      }
      const binding = storeBinding(dock.code)
      const vpFile = viewpointFile(bundle)
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
        plugins: [
          {
            name: 'bus-store-bridge',
            setup(build) {
              build.onResolve({ filter: /^\.\.\/store\/store$/ }, () => ({
                path: 'store-bridge',
                namespace: 'bus-store-bridge',
              }))
              build.onLoad({ filter: /.*/, namespace: 'bus-store-bridge' }, () => ({
                loader: 'js',
                contents: 'export const useTwinStore = globalThis.__twinBusStore\n',
              }))
            },
          },
        ],
      })
      const source = built.outputFiles[0]?.text ?? ''
      if (
        !source.includes('mountBroadcastBus') ||
        !source.includes('BroadcastChannel') ||
        !source.includes('uniview-twin') ||
        !source.includes('.close(') ||
        source.length > 12_000 ||
        /zustand|react-three|from"three"|from'three'|shareShot|clipboard/i.test(source)
      ) {
        this.error('T081：总线分包没有独立打出来')
      }
      const fileName = 'assets/BroadcastBus.js'
      bundle[fileName] = {
        type: 'asset',
        fileName,
        name: 'broadcastBus',
        names: ['broadcastBus'],
        originalFileName: null,
        originalFileNames: [],
        source,
        needsCodeReference: false,
      }
      dock.code += `\nwindow.__twinBusStore=${binding};void import("./BroadcastBus.js").then((m)=>{m.mountBroadcastBus(()=>import("./${vpFile}"))});\n`
    },
  }
}
