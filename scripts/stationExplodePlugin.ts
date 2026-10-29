import { build as esbuild, type Plugin as EsbuildPlugin } from 'esbuild'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

/**
 * 哈希定稿前把 dock 里的工位爆炸接线摘掉，setMatrixAt 不进 vite 图，
 * 所以不会带动 index / balancedFx / dock 的哈希。
 * 定稿后再把独立分包接回 dock。dock 自己在首帧之后才加载。
 */
export const STATION_EXPLODE_SOURCE_BLOCK = `// T091：工位级爆炸。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../station-explode/mount').then((mod) => {
  mod.mountStationExplode()
})
`

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MOUNT_ENTRY = fileURLToPath(new URL('../src/station-explode/mount.ts', import.meta.url))

const LEAKS = /mountStationExplode|station-explode\/mount|StationExplode\.js/

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

/** 晚加载分包不能把 maath 的 three 依赖再打进来。曲线与 maath cubic.out 相同。 */
function maathCubicOut(): EsbuildPlugin {
  const contents = `export const easing = { cubic: { out(x) { return 1 - Math.pow(1 - x, 3) } } }\n`
  return {
    name: 'maath-cubic-out',
    setup(build) {
      build.onResolve({ filter: /^maath$/ }, (args) => ({ path: args.path, namespace: 'maath-stub' }))
      build.onLoad({ filter: /.*/, namespace: 'maath-stub' }, () => ({ contents, loader: 'js' }))
      build.onResolve({ filter: /^three$/ }, () => {
        throw new Error('T091：three 不应打进工位分包')
      })
    },
  }
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

export function stationExplodeAfterHash(): Plugin {
  return {
    name: 'station-explode-after-hash',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]?.replaceAll('\\', '/')
      if (!file?.endsWith('/src/viewmarks/dock.tsx')) return null
      if (!code.includes(STATION_EXPLODE_SOURCE_BLOCK)) {
        this.error('T091：dock 里的工位爆炸接线变了，生产构建无法在哈希前摘干净')
      }
      return { code: code.replace(STATION_EXPLODE_SOURCE_BLOCK, ''), map: null }
    },
    async generateBundle(_options, bundle) {
      const chunks = chunksOf(bundle)
      const index = chunks.find((item) => item.fileName.startsWith('assets/index-') && item.fileName.endsWith('.js'))
      const dock = chunks.find((item) => item.name === 'dock')
      const loop = chunks.find((item) => item.name === 'DemandLoop')
      const fx = chunks.find((item) => item.name === 'balancedFx' || item.fileName.includes('balancedFx'))
      if (!index || !dock || !loop || !fx) {
        this.error('T091：找不到入口包、dock、DemandLoop 或 balancedFx')
        return
      }
      for (const chunk of [index, dock, loop, fx]) {
        if (LEAKS.test(chunk.code)) this.error(`T091：工位爆炸被打进了 ${chunk.fileName}`)
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
        plugins: [maathCubicOut()],
      })
      const source = built.outputFiles[0]?.text ?? ''
      if (
        built.outputFiles.length !== 1 ||
        !source.includes('mountStationExplode') ||
        !source.includes('setMatrixAt') ||
        !source.includes('needsUpdate') ||
        !source.includes('WorkstationDesks') ||
        !source.includes('DeviceBadges') ||
        !source.includes('RoomLabelBatchedText') ||
        source.length > 80_000 ||
        /gsap|animejs|@react-spring|from"three"|from'three'|zustand|WebGLRenderer|FogExp2|smoothTime|Autodesk|forge/i.test(
          source,
        )
      ) {
        this.error('T091：工位爆炸分包没有独立打出来')
      }
      bundle['assets/StationExplode.js'] = asset('assets/StationExplode.js', source)
      dock.code += `\nvoid import("./StationExplode.js").then((m)=>{m.mountStationExplode()});\n`
    },
  }
}
