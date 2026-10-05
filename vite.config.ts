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
  plugins: [react(), stubTroikaUnicodeResolver(), stripJsdelivr()],
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
