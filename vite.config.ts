import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vitest/config'

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
  plugins: [react(), stubTroikaUnicodeResolver(), redirectBvhThreeLeaves(), stripJsdelivr(), cacheWoffFonts()],
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
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false,
  },
})
