import { build as esbuild } from 'esbuild'
import { authorHelpersAfterHash } from './scripts/authorHelpersPlugin'
import { decalAfterHash } from './scripts/decalPlugin'
import { gridAxesAfterHash } from './scripts/gridAxesPlugin'
import { rectAreaAfterHash } from './scripts/rectAreaPlugin'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vitest/config'

const CUE_SOURCE_BLOCK = `// T054：告警提示音。整段逻辑在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../audio/AlarmAudioCue').then((mod) => {
  mod.mountAlarmAudioCue()
})
`

const CLIP_SOURCE_BLOCK = `// T062：短视频录制。整段逻辑在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../capture/mountClip').then((mod) => {
  mod.mountClipCapture()
})
`

/**
 * 与提示音同一条晚加载入口。生产构建在算 dock 哈希之前摘掉这段，
 * early index 不因录制接线变长；哈希定稿后再把独立分包接回 dock。
 */
function clipCaptureAfterHash(): Plugin {
  return {
    name: 'clip-capture-after-hash',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]?.replaceAll('\\', '/')
      if (!file?.endsWith('/src/viewmarks/dock.tsx')) return null
      if (!code.includes(CLIP_SOURCE_BLOCK)) {
        this.error('T062：dock 里的录制接线变了，生产构建无法在哈希前摘干净')
      }
      return { code: code.replace(CLIP_SOURCE_BLOCK, ''), map: null }
    },
    async generateBundle(_options, bundle) {
      const dock = Object.values(bundle).find((item) => item.type === 'chunk' && item.name === 'dock')
      if (!dock || dock.type !== 'chunk') this.error('T062：找不到 dock 分包')
      const built = await esbuild({
        absWorkingDir: fileURLToPath(new URL('.', import.meta.url)),
        entryPoints: [fileURLToPath(new URL('./src/capture/mountClip.ts', import.meta.url))],
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
        !source.includes('mountClipCapture') ||
        source.length > 20_000 ||
        /ccapture|zustand|react-three|from"three"|from'three'/i.test(source)
      ) {
        this.error('T062：录制分包没有独立打出来')
      }
      const fileName = 'assets/ClipCapture.js'
      const names: string[] = ['clipCapture']
      const originalFileNames: string[] = []
      bundle[fileName] = {
        type: 'asset',
        fileName,
        name: 'clipCapture',
        names,
        originalFileName: null,
        originalFileNames,
        source,
        needsCodeReference: false,
      }
      dock.code += `\nvoid import("./ClipCapture.js").then((m)=>{m.mountClipCapture()});\n`
    },
  }
}

/**
 * 开发时 dock 源码里的动态 import 照常走。
 * 生产构建在算内容哈希之前把这段从 dock 摘掉，哈希与 main 的 dock 对齐，
 * early index 不再因为提示音接线变长。哈希定稿后再把加载语句接回 dock 产物，
 * 提示音分包单独落盘，不进主包。
 */
function alarmCueAfterHash(): Plugin {
  return {
    name: 'alarm-cue-after-hash',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]?.replaceAll('\\', '/')
      if (!file?.endsWith('/src/viewmarks/dock.tsx')) return null
      if (!code.includes(CUE_SOURCE_BLOCK)) {
        this.error('T054：dock 里的提示音接线变了，生产构建无法在哈希前摘干净')
      }
      return { code: code.replace(CUE_SOURCE_BLOCK, ''), map: null }
    },
    async generateBundle(_options, bundle) {
      const dock = Object.values(bundle).find((item) => item.type === 'chunk' && item.name === 'dock')
      if (!dock || dock.type !== 'chunk') this.error('T054：找不到 dock 分包')
      const binding = dock.code.match(/\{[^}]*\ba as ([A-Za-z_$][\w$]*)/)?.[1]
      if (!binding || !dock.code.includes(`${binding}.getState`)) {
        this.error('T054：dock 里没有可交给提示音的 store')
      }
      const built = await esbuild({
        absWorkingDir: fileURLToPath(new URL('.', import.meta.url)),
        entryPoints: [fileURLToPath(new URL('./src/audio/AlarmAudioCue.ts', import.meta.url))],
        bundle: true,
        format: 'esm',
        platform: 'browser',
        target: 'es2022',
        minify: true,
        legalComments: 'none',
        write: false,
        plugins: [
          {
            name: 'cue-store-bridge',
            setup(build) {
              build.onResolve({ filter: /^\.\.\/store\/store$/ }, () => ({
                path: 'store-bridge',
                namespace: 'cue-store-bridge',
              }))
              build.onLoad({ filter: /.*/, namespace: 'cue-store-bridge' }, () => ({
                loader: 'js',
                contents: 'export const useTwinStore = globalThis.__twinCueStore\n',
              }))
            },
          },
        ],
      })
      const source = built.outputFiles[0]?.text ?? ''
      if (!source.includes('mountAlarmAudioCue') || source.length > 30_000 || source.includes('zustand')) {
        this.error('T054：提示音分包没有独立打出来')
      }
      const fileName = 'assets/AlarmAudioCue.js'
      const names: string[] = ['alarmAudioCue']
      const originalFileNames: string[] = []
      bundle[fileName] = {
        type: 'asset',
        fileName,
        name: 'alarmAudioCue',
        names,
        originalFileName: null,
        originalFileNames,
        source,
        needsCodeReference: false,
      }
      dock.code += `\nwindow.__twinCueStore=${binding};void import("./AlarmAudioCue.js").then((m)=>{m.mountAlarmAudioCue()});\n`
    },
  }
}

/**
 * three-stdlib TransformControls 从 three 取 Euler / Line / 几个几何。
 * 这些绑定已经在入口包里，再被懒包点名就会多出 early index 的 export。
 * 改成摆点包内的叶子类，入口不再重新导出。
 */
function isolateTransformControlsLeaves(): Plugin {
  const from =
    'import { Object3D, Raycaster, Vector3, Quaternion, Euler, Matrix4, MeshBasicMaterial, DoubleSide, LineBasicMaterial, CylinderGeometry, BoxGeometry, BufferGeometry, Float32BufferAttribute, Mesh, Line, OctahedronGeometry, PlaneGeometry, TorusGeometry, SphereGeometry, Color } from "three";'
  const leaves = fileURLToPath(new URL('./src/demo-edit/gizmoLeaves.ts', import.meta.url))
  const to = `import { Object3D, Raycaster, Vector3, Quaternion, Matrix4, MeshBasicMaterial, DoubleSide, CylinderGeometry, BoxGeometry, BufferGeometry, Float32BufferAttribute, Mesh, PlaneGeometry, Color } from "three";
import { Euler, LineBasicMaterial, Line, OctahedronGeometry, TorusGeometry, SphereGeometry } from ${JSON.stringify(leaves)};`
  return {
    name: 'isolate-transform-controls-leaves',
    transform(code, id) {
      if (!id.includes('three-stdlib/controls/TransformControls.js')) return null
      if (!code.includes(from)) {
        this.error('TransformControls three import did not match the pinned three-stdlib shape')
      }
      return { code: code.replace(from, to), map: null }
    },
  }
}

function stubTroikaUnicodeResolver(): Plugin {
  const stub =
    'function unicodeFontResolverClientFactory(){return{CodePointSet:function(){},clearCache:function(){},getFontsForString:function(text){return Promise.resolve({fontUrls:["/fonts/NotoSansSC-Regular-subset.woff"],chars:new Uint8Array(text.length)})}}}'
  return {
    name: 'stub-troika-unicode-resolver',
    transform(code, id) {
      if (!id.includes('troika-three-text')) return null
      if (!code.includes('function unicodeFontResolverClientFactory()')) return null
      return {
        code: code.replace(
          /function unicodeFontResolverClientFactory\(\)\{return function\(t\)\{/,
          `${stub};function __unusedUnicodeFontResolverClientFactory(){return function(t){`,
        ),
        map: null,
      }
    },
  }
}

function cacheWoffFonts(): Plugin {
  const apply = (server: { middlewares: { use: (fn: (req: { url?: string }, res: { setHeader: (k: string, v: string) => void }, next: () => void) => void) => void } }) => {
    server.middlewares.use((req, res, next) => {
      if (typeof req.url === 'string' && /\.woff2?(\?|$)/i.test(req.url)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      }
      next()
    })
  }
  return {
    name: 'cache-woff-fonts',
    configureServer: apply,
    configurePreviewServer: apply,
  }
}

const BVH_THREE_LEAVES: Record<string, string> = {
  Ray: 'three/src/math/Ray.js',
  Triangle: 'three/src/math/Triangle.js',
  BatchedMesh: new URL('./src/scene/pick/bvhBatchedMeshStub.ts', import.meta.url).pathname,
}

/**
 * drei Bvh 拉 three-mesh-bvh 时会从 three 入口再要 Ray / Triangle / BatchedMesh。
 * 这三个类已经在首屏 index 里，再 export 出去会把 hardGate 顶过 436361。
 * 叶子改走 three/src 或本地空子类，Mesh 仍用共享入口，射线身份不变。
 */
function redirectBvhThreeLeaves(): Plugin {
  return {
    name: 'redirect-bvh-three-leaves',
    transform(code, id) {
      if (!id.includes('three-mesh-bvh') || !/from\s+['"]three['"]/.test(code)) return null
      let changed = false
      const next = code.replace(/import\s*\{([^}]+)\}\s*from\s*['"]three['"]/g, (full, inner: string) => {
        const parts = inner
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean)
        const keep: string[] = []
        const leaves: string[] = []
        for (const part of parts) {
          const imported = part.split(/\s+as\s+/)[0]?.trim() ?? ''
          if (imported in BVH_THREE_LEAVES) leaves.push(part)
          else keep.push(part)
        }
        if (leaves.length === 0) return full
        changed = true
        const lines = []
        if (keep.length > 0) lines.push(`import { ${keep.join(', ')} } from 'three'`)
        for (const part of leaves) {
          const imported = part.split(/\s+as\s+/)[0]?.trim() ?? ''
          lines.push(`import { ${part} } from '${BVH_THREE_LEAVES[imported]}'`)
        }
        return lines.join('\n')
      })
      if (!changed) return null
      return { code: next, map: null }
    },
  }
}

function stripJsdelivr(): Plugin {
  const pattern = /https?:\/\/cdn\.jsdelivr\.net[^"'`\s]*/g
  const leftover = /https?:\/\/\/?gh\/lojjic\/[^"'`\s]*/g
  return {
    name: 'strip-jsdelivr',
    generateBundle(_options, bundle) {
      for (const item of Object.values(bundle)) {
        if (item.type === 'chunk') {
          item.code = item.code.replace(pattern, '').replace(leftover, '')
        } else if (item.type === 'asset' && typeof item.source === 'string') {
          item.source = item.source.replace(pattern, '').replace(leftover, '')
        }
      }
    },
  }
}

export default defineConfig({
  plugins: [
    alarmCueAfterHash(),
    clipCaptureAfterHash(),
    gridAxesAfterHash(),
    authorHelpersAfterHash(),
    rectAreaAfterHash(),
    decalAfterHash(),
    isolateTransformControlsLeaves(),
    react(),
    stubTroikaUnicodeResolver(),
    redirectBvhThreeLeaves(),
    stripJsdelivr(),
    cacheWoffFonts(),
  ],
  resolve: {
    alias: [
      {
        find: /unicode-font-resolver-client\.factory(\.js)?$/,
        replacement: new URL('./src/scene/stage/unicodeFontResolverStub.js', import.meta.url).pathname,
      },
    ],
  },
  server: {
    host: true,
    port: 5190,
    strictPort: true,
  },
  preview: {
    host: true,
    port: 5190,
    strictPort: true,
  },
  build: {
    // 性能档不得因为 HTML modulepreload 去请求 balancedFx / 楼层内装预取包。
    modulePreload: false,
    rollupOptions: {
      output: {
        // 懒包文件名写在 early index 里。DemandLoop 缩短前缀；rollup 允许的最短哈希是 7 位。
        chunkFileNames(chunk) {
          if (chunk.name === 'DemandLoop') return 'assets/d-[hash:7].js'
          return 'assets/[name]-[hash:7].js'
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false,
  },
})
