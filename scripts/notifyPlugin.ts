import { build as esbuild } from 'esbuild'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

/**
 * 与 T054 提示音、T082 语音同一条晚加载入口。
 * 生产构建在算 dock 哈希之前摘掉这段，early index 不因通知接线变长。
 * 哈希定稿后再把独立分包接回 dock。
 */
export const NOTIFY_SOURCE_BLOCK = `// T084：告警桌面通知。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../notify/AlarmNotify').then((mod) => {
  mod.mountAlarmNotify()
})
`

const ROOT = fileURLToPath(new URL('..', import.meta.url))

const LEAKS = /mountAlarmNotify|requestPermission|alarm-notify-toggle|twin-alarm|notifyCovers/

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

export function notifyAfterHash(): Plugin {
  return {
    name: 'notify-after-hash',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]?.replaceAll('\\', '/')
      if (!file?.endsWith('/src/viewmarks/dock.tsx')) return null
      if (!code.includes(NOTIFY_SOURCE_BLOCK)) {
        this.error('T084：dock 里的通知接线变了，生产构建无法在哈希前摘干净')
      }
      return { code: code.replace(NOTIFY_SOURCE_BLOCK, ''), map: null }
    },
    async generateBundle(_options, bundle) {
      const chunks = chunksOf(bundle)
      const index = chunks.find((item) => item.fileName.startsWith('assets/index-') && item.fileName.endsWith('.js'))
      const dock = chunks.find((item) => item.name === 'dock')
      const loop = chunks.find((item) => item.name === 'DemandLoop')
      const fx = chunks.find((item) => item.name === 'balancedFx' || item.fileName.includes('balancedFx'))
      if (!index || !dock || !loop || !fx) {
        this.error('T084：找不到入口包、dock、DemandLoop 或 balancedFx')
        return
      }
      for (const chunk of [index, dock, loop, fx]) {
        if (LEAKS.test(chunk.code)) this.error(`T084：桌面通知被打进了 ${chunk.fileName}`)
      }
      const binding = dock.code.match(/\{[^}]*\ba as ([A-Za-z_$][\w$]*)/)?.[1]
      if (!binding || !dock.code.includes(`${binding}.getState`)) {
        this.error('T084：dock 里没有可交给通知的 store')
        return
      }
      const built = await esbuild({
        absWorkingDir: ROOT,
        entryPoints: [fileURLToPath(new URL('../src/notify/AlarmNotify.ts', import.meta.url))],
        bundle: true,
        format: 'esm',
        platform: 'browser',
        target: 'es2022',
        minify: true,
        legalComments: 'none',
        write: false,
        plugins: [
          {
            name: 'notify-store-bridge',
            setup(build) {
              build.onResolve({ filter: /^\.\.\/store\/store$/ }, () => ({
                path: 'store-bridge',
                namespace: 'notify-store-bridge',
              }))
              build.onLoad({ filter: /.*/, namespace: 'notify-store-bridge' }, () => ({
                loader: 'js',
                contents: 'export const useTwinStore = globalThis.__twinNotifyStore\n',
              }))
            },
          },
        ],
      })
      const source = built.outputFiles[0]?.text ?? ''
      if (
        built.outputFiles.length !== 1 ||
        !source.includes('mountAlarmNotify') ||
        !source.includes('requestPermission') ||
        !source.includes('document.hidden') ||
        !source.includes('twin-alarm') ||
        source.length > 20_000 ||
        /howler|tone\.js|zustand|FogExp2|smoothTime|from"three"|from'three'|@react-three/i.test(source)
      ) {
        this.error('T084：通知分包没有独立打出来')
      }
      const fileName = 'assets/AlarmNotify.js'
      bundle[fileName] = {
        type: 'asset',
        fileName,
        name: 'alarmNotify',
        names: ['alarmNotify'],
        originalFileName: null,
        originalFileNames: [],
        source,
        needsCodeReference: false,
      }
      dock.code += `\nwindow.__twinNotifyStore=${binding};void import("./AlarmNotify.js").then((m)=>{m.mountAlarmNotify()});\n`
    },
  }
}
