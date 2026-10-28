import { build as esbuild } from 'esbuild'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

/**
 * 与 T054 提示音同一条晚加载入口。
 * 生产构建在算 dock 哈希之前摘掉这段，early index 不因语音接线变长。
 * 哈希定稿后再把独立分包接回 dock。
 */
export const SPEECH_SOURCE_BLOCK = `// T082：告警语音。整段逻辑在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../audio/AlarmSpeech').then((mod) => {
  mod.mountAlarmSpeech()
})
`

export function speechAfterHash(): Plugin {
  return {
    name: 'speech-after-hash',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]?.replaceAll('\\', '/')
      if (!file?.endsWith('/src/viewmarks/dock.tsx')) return null
      if (!code.includes(SPEECH_SOURCE_BLOCK)) {
        this.error('T082：dock 里的语音接线变了，生产构建无法在哈希前摘干净')
      }
      return { code: code.replace(SPEECH_SOURCE_BLOCK, ''), map: null }
    },
    async generateBundle(_options, bundle) {
      const dock = Object.values(bundle).find((item) => item.type === 'chunk' && item.name === 'dock')
      if (!dock || dock.type !== 'chunk') this.error('T082：找不到 dock 分包')
      const binding = dock.code.match(/\{[^}]*\ba as ([A-Za-z_$][\w$]*)/)?.[1]
      if (!binding || !dock.code.includes(`${binding}.getState`)) {
        this.error('T082：dock 里没有可交给语音的 store')
      }
      const built = await esbuild({
        absWorkingDir: fileURLToPath(new URL('..', import.meta.url)),
        entryPoints: [fileURLToPath(new URL('../src/audio/AlarmSpeech.ts', import.meta.url))],
        bundle: true,
        format: 'esm',
        platform: 'browser',
        target: 'es2022',
        minify: true,
        legalComments: 'none',
        write: false,
        plugins: [
          {
            name: 'speech-store-bridge',
            setup(build) {
              build.onResolve({ filter: /^\.\.\/store\/store$/ }, () => ({
                path: 'store-bridge',
                namespace: 'speech-store-bridge',
              }))
              build.onLoad({ filter: /.*/, namespace: 'speech-store-bridge' }, () => ({
                loader: 'js',
                contents: 'export const useTwinStore = globalThis.__twinSpeechStore\n',
              }))
            },
          },
        ],
      })
      const source = built.outputFiles[0]?.text ?? ''
      if (
        !source.includes('mountAlarmSpeech') ||
        !source.includes('speechSynthesis') ||
        !source.includes('.cancel(') ||
        !source.includes('zh-CN') ||
        source.length > 30_000 ||
        /howler|tone\.js|from["']tone["']|zustand|FogExp2|smoothTime/i.test(source)
      ) {
        this.error('T082：语音分包没有独立打出来')
      }
      const fileName = 'assets/AlarmSpeech.js'
      const names: string[] = ['alarmSpeech']
      const originalFileNames: string[] = []
      bundle[fileName] = {
        type: 'asset',
        fileName,
        name: 'alarmSpeech',
        names,
        originalFileName: null,
        originalFileNames,
        source,
        needsCodeReference: false,
      }
      dock.code += `\nwindow.__twinSpeechStore=${binding};void import("./AlarmSpeech.js").then((m)=>{m.mountAlarmSpeech()});\n`
    },
  }
}
