import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vitest/config'

function stripJsdelivr(): Plugin {
  const pattern = /cdn\.jsdelivr\.net/g
  return {
    name: 'strip-jsdelivr',
    generateBundle(_options, bundle) {
      for (const item of Object.values(bundle)) {
        if (item.type === 'chunk') {
          item.code = item.code.replace(pattern, '')
        } else if (item.type === 'asset' && typeof item.source === 'string') {
          item.source = item.source.replace(pattern, '')
        }
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), stripJsdelivr()],
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
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false,
  },
})
