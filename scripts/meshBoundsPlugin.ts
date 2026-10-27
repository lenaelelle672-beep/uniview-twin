import { build as esbuild, type Plugin as EsbuildPlugin } from 'esbuild'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

/**
 * T078：哈希定稿前把 DemandLoop 里的接线摘掉，drei meshBounds 不进 vite 图。
 * 定稿后再把不含 drei 的门闩接回 DemandLoop。MeshBounds.js 只在性能档或 meshBounds=1 时请求。
 */
export const MESH_BOUNDS_SOURCE_BLOCK = `// T078：远距装饰密模的粗拾取。生产构建在 DemandLoop 哈希前摘掉这段，哈希定稿后再接独立分包。
void import('../../scene/pick/meshBoundsMount').then((mod) => {
  mod.mountCoarseMeshBounds()
})
`

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const BOOT_ENTRY = fileURLToPath(new URL('../src/scene/pick/meshBoundsBoot.ts', import.meta.url))
const MOUNT_ENTRY = fileURLToPath(new URL('../src/scene/pick/meshBoundsMount.ts', import.meta.url))
const LEAVES_ENTRY = fileURLToPath(new URL('../src/scene/pick/meshBoundsLeaves.ts', import.meta.url))

function leavesPlugin(): EsbuildPlugin {
  return {
    name: 'mesh-bounds-leaves',
    setup(build) {
      build.onResolve({ filter: /^three$/ }, () => ({ path: LEAVES_ENTRY }))
      build.onResolve({ filter: /MeshBounds\.js$/ }, () => ({ path: './MeshBounds.js', external: true }))
    },
  }
}

export async function builtMeshBoundsPair(): Promise<{ boot: string; apply: string }> {
  const boot = await esbuild({
    absWorkingDir: ROOT,
    entryPoints: [BOOT_ENTRY],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    legalComments: 'none',
    write: false,
    plugins: [leavesPlugin()],
  })
  const apply = await esbuild({
    absWorkingDir: ROOT,
    entryPoints: [MOUNT_ENTRY],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    legalComments: 'none',
    write: false,
    plugins: [leavesPlugin()],
  })
  const bootText = boot.outputFiles[0]?.text ?? ''
  const applyText = apply.outputFiles[0]?.text ?? ''
  if (!bootText.includes('./MeshBounds.js') || bootText.includes('computeBoundingBox')) {
    throw new Error('T078：门闩分包把 drei 打进来了')
  }
  if (
    !applyText.includes('mountCoarseMeshBounds') ||
    applyText.length > 80_000 ||
    /hls|FogExp2|VideoTexture|balancedFx|three-mesh-bvh|from["']three["']/.test(applyText)
  ) {
    throw new Error('T078：meshBounds 分包没有独立打出来')
  }
  return { boot: bootText, apply: applyText }
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

export function meshBoundsAfterHash(): Plugin {
  return {
    name: 'mesh-bounds-after-hash',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]?.replaceAll('\\', '/')
      if (!file?.endsWith('/src/components/scene/DemandLoop.tsx')) return null
      if (!code.includes(MESH_BOUNDS_SOURCE_BLOCK)) {
        this.error('T078：DemandLoop 里的 meshBounds 接线变了，生产构建无法在哈希前摘干净')
      }
      return { code: code.replace(MESH_BOUNDS_SOURCE_BLOCK, ''), map: null }
    },
    async generateBundle(_options, bundle) {
      const loop = Object.values(bundle).find((item) => item.type === 'chunk' && item.name === 'DemandLoop')
      if (!loop || loop.type !== 'chunk') this.error('T078：找不到 DemandLoop 分包')
      const built = await builtMeshBoundsPair()
      bundle['assets/MeshBounds.js'] = asset('assets/MeshBounds.js', built.apply)
      loop.code += `\n${built.boot}\n`
    },
  }
}
