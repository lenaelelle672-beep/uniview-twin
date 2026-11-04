import { build as esbuild, type Plugin as EsbuildPlugin } from 'esbuild'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { discoverGridBindings, type GridBindings } from '../src/grid/bindings'
import { lookupThreeExports } from './segmentsPlugin'

/**
 * 哈希定稿前把 dock 里的楼壳着色接线摘掉。
 * drei shaderMaterial 不进 vite 图，所以不会带动 index / balancedFx / dock 的哈希。
 * 定稿后再把开关分包、着色分包，以及 shaderMaterial 自己的分包接回。
 * 三个文件都在 dock 之后才请求，shaderMaterial 还要再等门闩打开。不进 hardGate / balancedFx。
 * 与 T115 的拾取代理分包分开，不复用那份已经打进去的 shaderMaterial。
 */
export const SHELL_SHADER_SOURCE_BLOCK = `
// T121：楼壳着色 shaderMaterial。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../shell-shader/mount').then((mod) => {
  mod.mountShellShader()
})
`

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MOUNT_ENTRY = fileURLToPath(new URL('../src/shell-shader/mount.ts', import.meta.url))
const LIVE_ENTRY = fileURLToPath(new URL('../src/shell-shader/runtime.ts', import.meta.url))
const MATERIAL_ENTRY = fileURLToPath(new URL('../src/shell-shader/material.ts', import.meta.url))
const APPLY_ENTRY = fileURLToPath(new URL('../src/shell-shader/apply.ts', import.meta.url))
const DREI_SHADER = fileURLToPath(new URL('../node_modules/@react-three/drei/core/shaderMaterial.js', import.meta.url))

/** 入口包和 balancedFx、DemandLoop、哈希前的 dock 里都不许出现这些。 */
const GATE_MARKERS =
  /shell-shader|mountShellShader|ShellShaderTint|uAlarmMix|uNightMix|drei-shaderMaterial|ShellShaderMaterial/

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

/** shaderMaterial 经 `THREE.` 用到的，加上着色路径按名导入的 three。 */
export function threeImportNames(): string[] {
  const names = new Set<string>()
  for (const file of [DREI_SHADER, MATERIAL_ENTRY, APPLY_ENTRY, LIVE_ENTRY]) {
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(/\bTHREE\.([A-Za-z_$][\w$]*)/g)) {
      if (match[1]) names.add(match[1])
    }
    for (const match of source.matchAll(/import\s+(type\s+)?\{([^}]+)\}\s+from\s+['"]three['"]/g)) {
      if (match[1]) continue
      for (const part of (match[2] ?? '').split(',')) {
        const piece = part.trim()
        if (!piece || piece.startsWith('type ')) continue
        const name = piece.split(/\s+as\s+/)[0]?.trim()
        if (name) names.add(name)
      }
    }
  }
  return [...names].sort()
}

function threeShim(indexFile: string, found: Record<string, string>, missing: string[]): string {
  if (missing.length > 0) throw new Error(`T121：入口包缺 three 导出 ${missing.join(', ')}`)
  const keys = Object.keys(found)
  if (keys.length === 0) throw new Error('T121：入口包没有可复用的 three 导出')
  const spec = keys.map((key) => `${found[key]} as ${key}`).join(', ')
  return `import { ${spec} } from ${JSON.stringify(`./${indexFile}`)}
export { ${keys.join(', ')} }
`
}

function storeShim(indexFile: string, store: string): string {
  const from = JSON.stringify(`./${indexFile}`)
  return `import { ${store} as useTwinStore } from ${from}
export { useTwinStore }
`
}

function shimPlugin(
  names: GridBindings,
  three: { found: Record<string, string>; missing: string[] },
  kind: 'mount' | 'live' | 'module',
): EsbuildPlugin {
  return {
    name: 'shell-shader-shims',
    setup(build) {
      build.onResolve({ filter: /^\.\/index-[^/]+\.js$/ }, (args) => ({
        path: args.path,
        external: true,
      }))
      if (kind === 'mount') {
        build.onResolve({ filter: /^\.\/runtime(?:\.ts)?$/ }, () => ({
          path: './ShellShader.js',
          external: true,
        }))
      }
      if (kind === 'live') {
        build.onResolve({ filter: /shaderMaterial(?:\.js)?$/ }, () => ({
          path: './ShellShaderMaterial.js',
          external: true,
        }))
      }
      build.onResolve({ filter: /^three$/ }, () => ({ path: 'three', namespace: 'shell-shim' }))
      build.onResolve({ filter: /^\.\.\/store\/store$/ }, () => ({ path: 'store', namespace: 'shell-shim' }))
      build.onLoad({ filter: /.*/, namespace: 'shell-shim' }, (args) => {
        const contents =
          args.path === 'three'
            ? threeShim(names.indexFile, three.found, three.missing)
            : storeShim(names.indexFile, names.store)
        return { contents, loader: 'js', resolveDir: ROOT }
      })
    },
  }
}

async function bundleEntry(
  entry: string,
  kind: 'mount' | 'live' | 'module',
  names: GridBindings,
  three: { found: Record<string, string>; missing: string[] },
): Promise<string> {
  const built = await esbuild({
    absWorkingDir: ROOT,
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    legalComments: 'none',
    charset: 'utf8',
    write: false,
    jsx: 'automatic',
    logLevel: 'silent',
    plugins: [shimPlugin(names, three, kind)],
  })
  if (built.warnings.length > 0) {
    throw new Error(`T121：楼壳着色分包有警告 ${built.warnings.map((item) => item.text).join('; ')}`)
  }
  const file = built.outputFiles[0]
  if (!file || built.outputFiles.length !== 1) throw new Error('T121：楼壳着色分包没有打成单个文件')
  return file.text
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

function assertSyntax(source: string, label: string): void {
  const result = spawnSync(process.execPath, ['--check', '--input-type=module'], { input: source, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`T121：${label} 语法检查失败 ${result.stderr}`)
}

export function stripShellShaderSource(code: string): string {
  if (!code.includes(SHELL_SHADER_SOURCE_BLOCK)) {
    throw new Error('T121：dock 里的楼壳着色接线变了，生产构建无法在哈希前摘干净')
  }
  const next = code.replace(SHELL_SHADER_SOURCE_BLOCK, '')
  if (next.includes('mountShellShader') || next.includes('shell-shader')) {
    throw new Error('T121：摘完 dock 仍留着楼壳着色接线')
  }
  return next
}

export function shellShaderAfterHash(): Plugin {
  return {
    name: 'shell-shader-after-hash',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]?.replaceAll('\\', '/')
      if (!file?.endsWith('/src/viewmarks/dock.tsx')) return null
      return { code: stripShellShaderSource(code), map: null }
    },
    async generateBundle(_options, bundle) {
      const chunks = chunksOf(bundle)
      const index = chunks.find((item) => item.fileName.startsWith('assets/index-') && item.fileName.endsWith('.js'))
      const dock = chunks.find((item) => item.name === 'dock')
      const loop = chunks.find((item) => item.name === 'DemandLoop')
      const fx = chunks.find((item) => item.name === 'balancedFx')
      if (!index || !dock || !loop || !fx) {
        this.error('T121：找不到入口包、dock、DemandLoop 或 balancedFx')
        return
      }
      for (const chunk of chunks) {
        const hit = chunk.code.match(GATE_MARKERS)
        if (hit) {
          const at = hit.index ?? 0
          this.error(
            `T121：楼壳着色被打进了 vite 分包 ${chunk.fileName}「${hit[0]}」${chunk.code.slice(Math.max(0, at - 80), at + 80)}`,
          )
          return
        }
      }
      let names: GridBindings
      try {
        names = discoverGridBindings(index.code, dock.code, loop.code)
      } catch (error) {
        this.error(`T121：复用入口包失败 ${error instanceof Error ? error.message : error}`)
        return
      }
      const looked = lookupThreeExports(index.code, threeImportNames())
      let mount = ''
      let live = ''
      let shader = ''
      try {
        mount = await bundleEntry(MOUNT_ENTRY, 'mount', names, looked)
        live = await bundleEntry(LIVE_ENTRY, 'live', names, looked)
        shader = await bundleEntry(DREI_SHADER, 'module', names, looked)
        assertSyntax(mount, 'ShellShaderMount')
        assertSyntax(live, 'ShellShader')
        assertSyntax(shader, 'ShellShaderMaterial')
      } catch (error) {
        this.error(error instanceof Error ? error.message : `T121：分包失败 ${error}`)
        return
      }
      if (!mount.includes('./ShellShader.js') || !mount.includes('mountShellShader')) {
        this.error('T121：开关分包没有延迟加载楼壳着色')
      }
      if (mount.includes('gl_FragColor') || mount.includes('generateUUID') || mount.includes('./ShellShaderMaterial.js')) {
        this.error('T121：开关分包把 shaderMaterial 打进去了')
      }
      if (!live.includes('./ShellShaderMaterial.js') || !live.includes('uAlarmMix') || !live.includes('gl_FragColor')) {
        this.error('T121：着色分包没有分开引用 shaderMaterial')
      }
      if (live.includes('generateUUID') || live.includes('MeshDiscard') || live.includes('discard')) {
        this.error('T121：着色分包把 shaderMaterial 内联了，或写进了拾取代理的丢弃')
      }
      if (!shader.includes('generateUUID') || !shader.includes('class extends') || !shader.includes('.clone(') || shader.includes('uAlarmMix')) {
        this.error(
          `T121：shaderMaterial 模块分包不对 uuid=${shader.includes('generateUUID')} class=${shader.includes('class extends')} clone=${shader.includes('.clone(')} alarm=${shader.includes('uAlarmMix')} len=${shader.length}`,
        )
      }
      if (shader.includes('discard') || shader.includes('uAlarm')) {
        this.error('T121：shaderMaterial 模块分包混进了业务着色或丢弃')
      }
      const bundled = mount + live + shader
      if (!bundled.includes(`./${names.indexFile}`)) {
        this.error('T121：楼壳着色分包没有复用入口包')
      }
      if (/from["']three["']|three\/examples|class WebGLRenderer|@react-three\/drei/.test(bundled)) {
        this.error('T121：楼壳着色分包把 three 整包或 drei 入口打进去了')
      }
      if (/https?:|\/\/cdn|githack|jsdelivr|unpkg|\.hdr\b|transmission|Reflector/.test(bundled)) {
        this.error('T121：楼壳着色分包带了外链、透射或反射平面')
      }
      if (mount.length > 16_000 || live.length > 16_000 || shader.length > 16_000) {
        this.error(`T121：楼壳着色分包过大 mount=${mount.length} live=${live.length} shader=${shader.length}`)
      }
      bundle['assets/ShellShaderMount.js'] = asset('assets/ShellShaderMount.js', mount)
      bundle['assets/ShellShader.js'] = asset('assets/ShellShader.js', live)
      bundle['assets/ShellShaderMaterial.js'] = asset('assets/ShellShaderMaterial.js', shader)
      dock.code += `\nvoid import("./ShellShaderMount.js").then((m)=>{m.mountShellShader()});\n`
    },
  }
}
