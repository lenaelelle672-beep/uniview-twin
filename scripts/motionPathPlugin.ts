import { build as esbuild, type Plugin as EsbuildPlugin } from 'esbuild'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { discoverGridBindings, type GridBindings } from '../src/grid/bindings'

/**
 * 和 T059 同一手法：哈希定稿前把 dock 里的接线摘掉，
 * drei MotionPathControls 不进 vite 图，所以不会带动 index / balancedFx / dock 的哈希。
 * 播放分包只在门打开并且点了导览之后才请求。
 */
export const MOTION_PATH_SOURCE_BLOCK = `// T071：相机沿轨。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../tour-path/mount').then((mod) => {
  mod.mountMotionPath()
})
`

/**
 * 写在 dock 哈希之后。观众地址直接返回，不请求播放分包。
 * 门和 `tourPathGateOn` 一致：tourPath=1 或 demoEdit=1，含启动 navigation。
 */
export const MOTION_PATH_DOCK_BOOT = `;(function(){
  if (window.__twinMotionPathBoot) return;
  window.__twinMotionPathBoot = 1;
  var playing = false;
  var cancel = null;
  var token = 0;
  function queryOn(search) {
    try {
      var params = new URLSearchParams(search.charAt(0) === "?" ? search.slice(1) : search);
      return params.get("tourPath") === "1" || params.get("demoEdit") === "1";
    } catch (error) {
      return false;
    }
  }
  function gate() {
    if (queryOn(location.search)) return true;
    try {
      var entry = performance.getEntriesByType("navigation")[0];
      return !!(entry && entry.name && queryOn(new URL(entry.name, "http://localhost").search));
    } catch (error) {
      return false;
    }
  }
  function compact(text) {
    var raw = String(text || "");
    var out = "";
    for (var i = 0; i < raw.length; i++) {
      var code = raw.charCodeAt(i);
      if (code === 32 || code === 9 || code === 10 || code === 13 || code === 12) continue;
      out += raw.charAt(i);
    }
    return out;
  }
  function labelOk(text) {
    var label = compact(text);
    return label === "导览告警" || label === "停止导览";
  }
  function buttonOf(target) {
    if (!target || !target.closest) return null;
    var button = target.closest("button");
    if (!button || !button.closest("[data-viewmark-root]")) return null;
    if (!labelOk(button.textContent)) return null;
    return button;
  }
  window.__twinMotionPathIdle = function () {
    token += 1;
    playing = false;
    cancel = null;
  };
  function stop() {
    var current = cancel;
    playing = false;
    cancel = null;
    token += 1;
    if (current) current();
  }
  document.addEventListener("click", function (event) {
    if (!gate()) return;
    var button = buttonOf(event.target);
    if (!button || button.disabled) return;
    event.preventDefault();
    event.stopPropagation();
    if (playing) {
      stop();
      return;
    }
    playing = true;
    var mine = ++token;
    import("./MotionPathPlayer.js").then(function (mod) {
      if (mine !== token || !playing) return;
      var session = mod.startMotionPathTour();
      if (mine !== token || !playing) {
        session.cancel();
        return;
      }
      cancel = function () {
        playing = false;
        cancel = null;
        session.cancel();
      };
    }).catch(function () {
      if (mine === token) {
        playing = false;
        cancel = null;
      }
    });
  }, true);
  window.addEventListener("keydown", function (event) {
    if (!playing || event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    stop();
  }, true);
})();
`

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SESSION_ENTRY = fileURLToPath(new URL('../src/tour-path/session.tsx', import.meta.url))

/** 入口里已经导出的类走入口，避免再加 early index 的 export。缺的曲线类打进播放分包。 */
const THREE_SRC: Record<string, string> = {
  Object3D: 'three/src/core/Object3D.js',
  Vector3: 'three/src/math/Vector3.js',
  Vector2: 'three/src/math/Vector2.js',
  Vector4: 'three/src/math/Vector4.js',
  Quaternion: 'three/src/math/Quaternion.js',
  Matrix3: 'three/src/math/Matrix3.js',
  Matrix4: 'three/src/math/Matrix4.js',
  Euler: 'three/src/math/Euler.js',
  Spherical: 'three/src/math/Spherical.js',
  Color: 'three/src/math/Color.js',
  CurvePath: 'three/src/extras/core/CurvePath.js',
  CatmullRomCurve3: 'three/src/extras/curves/CatmullRomCurve3.js',
  Line: 'three/src/objects/Line.js',
  Mesh: 'three/src/objects/Mesh.js',
  BufferGeometry: 'three/src/core/BufferGeometry.js',
  Float32BufferAttribute: 'three/src/core/BufferAttribute.js',
  LineBasicMaterial: 'three/src/materials/LineBasicMaterial.js',
  MeshBasicMaterial: 'three/src/materials/MeshBasicMaterial.js',
  SphereGeometry: 'three/src/geometries/SphereGeometry.js',
}

const INDEX_REQUIRED = ['Object3D', 'Vector3'] as const

interface BundleChunk {
  type: string
  name: string
  fileName: string
  code: string
}

type ThreeBinding = { kind: 'index'; exportName: string } | { kind: 'src'; path: string }

function isChunk(item: { type: string }): item is BundleChunk {
  return item.type === 'chunk'
}

function chunksOf(bundle: Record<string, { type: string }>): BundleChunk[] {
  return Object.values(bundle).filter(isChunk)
}

function fail(message: string): never {
  throw new Error(`T071：${message}`)
}

function exportMap(indexCode: string): Map<string, string> {
  const tail = indexCode.slice(indexCode.lastIndexOf('export{'))
  const map = new Map<string, string>()
  for (const match of tail.matchAll(/([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)/g)) {
    map.set(match[1], match[2])
  }
  if (map.size === 0) fail('入口包没有导出表')
  return map
}

function threeBody(indexCode: string): string {
  const pattern = /__proto__\s*:\s*null,([\s\S]*?)\}\s*,\s*Symbol\.toStringTag/g
  for (const match of indexCode.matchAll(pattern)) {
    if (match[1].includes('Object3D:') && match[1].includes('Vector3:')) return match[1]
  }
  fail('入口包里没有 three 的命名空间对象')
}

function resolveThree(indexCode: string): Record<string, ThreeBinding> {
  const body = threeBody(indexCode)
  const exported = exportMap(indexCode)
  const resolved: Record<string, ThreeBinding> = {}
  for (const name of Object.keys(THREE_SRC)) {
    const found = body.match(new RegExp(`\\b${name}:([A-Za-z_$][\\w$]*)`))
    const exportName = found ? exported.get(found[1]) : undefined
    if (exportName) resolved[name] = { kind: 'index', exportName }
    else resolved[name] = { kind: 'src', path: THREE_SRC[name] }
  }
  for (const name of INDEX_REQUIRED) {
    if (resolved[name]?.kind !== 'index') fail(`${name} 没有从入口包导出`)
  }
  return resolved
}

function fromIndex(indexFile: string): string {
  return JSON.stringify(`./${indexFile}`)
}

function reactShim(indexFile: string, names: GridBindings): string {
  const from = fromIndex(indexFile)
  return `import { ${names.react} as React } from ${from}
export const useState = React.useState
export const useEffect = React.useEffect
export const useLayoutEffect = React.useLayoutEffect
export const useMemo = React.useMemo
export const useRef = React.useRef
export const useCallback = React.useCallback
export const useImperativeHandle = React.useImperativeHandle
export const forwardRef = React.forwardRef
export const createElement = React.createElement
export const Fragment = React.Fragment
export const createContext = React.createContext
export const useContext = React.useContext
export const version = React.version
`
}

function jsxShim(indexFile: string, names: GridBindings): string {
  const from = fromIndex(indexFile)
  return `import { ${names.jsx} as runtime, ${names.react} as React } from ${from}
export const jsx = runtime.jsx
export const jsxs = runtime.jsxs
export const Fragment = React.Fragment
`
}

function fiberShim(indexFile: string, names: GridBindings): string {
  const from = fromIndex(indexFile)
  return `import { ${names.useThree} as useThree, ${names.useFrame} as useFrame, ${names.react} as React } from ${from}
export { useThree, useFrame }
export function useInstanceHandle(ref) {
  const instance = React.useRef(null)
  React.useImperativeHandle(instance, () => (ref && ref.current ? ref.current.__r3f : null), [ref])
  return instance
}
`
}

function storeShim(indexFile: string, names: GridBindings): string {
  const from = fromIndex(indexFile)
  return `import { ${names.store} as useTwinStore } from ${from}
export { useTwinStore }
`
}

function threeShim(indexFile: string, bindings: Record<string, ThreeBinding>): string {
  const from = fromIndex(indexFile)
  const indexed = Object.entries(bindings).filter((entry): entry is [string, { kind: 'index'; exportName: string }] => {
    return entry[1].kind === 'index'
  })
  const sourced = Object.entries(bindings).filter((entry): entry is [string, { kind: 'src'; path: string }] => {
    return entry[1].kind === 'src'
  })
  const spec = indexed.map(([name, binding]) => `${binding.exportName} as ${name}`).join(', ')
  const lines = [`import { ${spec} } from ${from}`, `export { ${indexed.map(([name]) => name).join(', ')} }`]
  for (const [name, binding] of sourced) {
    lines.push(`export { ${name} } from ${JSON.stringify(binding.path)}`)
  }
  return `${lines.join('\n')}\n`
}

function shimPlugin(names: GridBindings, bindings: Record<string, ThreeBinding>): EsbuildPlugin {
  return {
    name: 'motion-path-shims',
    setup(build) {
      const indexRel = `./${names.indexFile}`
      build.onResolve({ filter: /^\.\/index-[^/]+\.js$/ }, (args) => {
        if (args.path !== indexRel) return null
        return { path: args.path, external: true }
      })
      build.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'motion-shim' }))
      build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: 'jsx', namespace: 'motion-shim' }))
      build.onResolve({ filter: /^@react-three\/fiber$/ }, () => ({ path: 'fiber', namespace: 'motion-shim' }))
      build.onResolve({ filter: /^three$/ }, () => ({ path: 'three', namespace: 'motion-shim' }))
      build.onResolve({ filter: /^\.\.\/store\/store$/ }, () => ({ path: 'store', namespace: 'motion-shim' }))
      build.onLoad({ filter: /.*/, namespace: 'motion-shim' }, (args) => {
        const contents =
          args.path === 'react'
            ? reactShim(names.indexFile, names)
            : args.path === 'jsx'
              ? jsxShim(names.indexFile, names)
              : args.path === 'fiber'
                ? fiberShim(names.indexFile, names)
                : args.path === 'three'
                  ? threeShim(names.indexFile, bindings)
                  : storeShim(names.indexFile, names)
        return { contents, loader: 'js', resolveDir: ROOT }
      })
    },
  }
}

async function bundlePlayer(names: GridBindings, bindings: Record<string, ThreeBinding>): Promise<string> {
  const built = await esbuild({
    absWorkingDir: ROOT,
    entryPoints: [SESSION_ENTRY],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    legalComments: 'none',
    write: false,
    jsx: 'automatic',
    plugins: [shimPlugin(names, bindings)],
  })
  const file = built.outputFiles[0]
  if (!file || built.outputFiles.length !== 1) fail('播放分包没有打成单个文件')
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

export function motionPathAfterHash(): Plugin {
  return {
    name: 'motion-path-after-hash',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]?.replaceAll('\\', '/')
      if (!file?.endsWith('/src/viewmarks/dock.tsx')) return null
      if (!code.includes(MOTION_PATH_SOURCE_BLOCK)) {
        this.error('T071：dock 里的沿轨接线变了，生产构建无法在哈希前摘干净')
      }
      return { code: code.replace(MOTION_PATH_SOURCE_BLOCK, ''), map: null }
    },
    async generateBundle(_options, bundle) {
      const chunks = chunksOf(bundle)
      const index = chunks.find((item) => item.fileName.startsWith('assets/index-') && item.fileName.endsWith('.js'))
      const dock = chunks.find((item) => item.name === 'dock')
      const loop = chunks.find((item) => item.name === 'DemandLoop')
      const fx = chunks.find((item) => item.name === 'balancedFx' || item.fileName.includes('balancedFx'))
      if (!index || !dock || !loop) fail('找不到入口包、dock 或 DemandLoop')
      if (/MotionPathControls|useMotion|TourMotionPath|tour-path\/session|mountMotionPath/.test(index.code)) {
        fail('沿轨被打进了入口包')
      }
      if (fx && /MotionPathControls|useMotion|TourMotionPath|tour-path/.test(fx.code)) {
        fail('沿轨被打进了 balancedFx')
      }
      if (dock.code.includes('tour-path/mount') || dock.code.includes('MotionPathControls')) {
        fail('哈希前的 dock 仍带着沿轨')
      }
      const names = discoverGridBindings(index.code, dock.code, loop.code)
      const bindings = resolveThree(index.code)
      const player = await bundlePlayer(names, bindings)
      if (!player.includes('useMotion hook must be used in a MotionPathControls')) {
        fail('播放分包里没有 drei MotionPathControls')
      }
      if (!player.includes(`./${names.indexFile}`)) fail('播放分包没有复用入口包')
      const strayIndex = [...player.matchAll(/from"\.\/index-[^"]+"/g)]
        .map((match) => match[0])
        .filter((spec) => spec !== `from"./${names.indexFile}"`)
      if (strayIndex.length > 0) fail(`播放分包把别的 index 当成了外部包：${strayIndex.join(' ')}`)
      if (/balancedFx|FogExp2|ccapture/.test(player)) fail('播放分包带上了禁项')
      if (player.length > 800_000) fail('播放分包把 three 整包打进去了')
      bundle['assets/MotionPathPlayer.js'] = asset('assets/MotionPathPlayer.js', player)
      dock.code += `\n${MOTION_PATH_DOCK_BOOT}\n`
    },
  }
}
