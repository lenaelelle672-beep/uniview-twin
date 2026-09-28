import { describe, expect, it } from 'vitest'
import { isTroikaSdfSource, isWhitelistedConsoleMessage } from './threeConsole'

const CLOCK = 'THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.'
const STALL = 'GPU stall due to ReadPixels'
const STALL_LAST = `${STALL} (this message will no longer repeat)`
const DRIVER =
  '[.WebGL-0x1824000f8000]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels'
const DRIVER_LAST =
  '[.WebGL-00003E1C00E38E00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels (this message will no longer repeat)'

const TROIKA_FILE = `Error
    at Object.isSupported (http://localhost:5190/node_modules/webgl-sdf-generator/dist/webgl-sdf-generator.js:560:1)
    at warmUpSDFCanvas (http://localhost:5190/node_modules/troika-three-text/src/TextBuilder.js:312:1)`

const DREI_BUNDLE = `Error
    at Object.isSupported (http://localhost:5190/node_modules/.vite/deps/@react-three_drei.js?v=2a8e423f:78559:28)
    at warmUpSDFCanvas (http://localhost:5190/node_modules/.vite/deps/@react-three_drei.js?v=2a8e423f:82166:31)`

const RESIZE = `Error
    at resizeWebGLCanvasWithoutClearing (http://localhost:5190/node_modules/.vite/deps/@react-three_drei.js:82170:1)
    at getTextRenderInfo (http://localhost:5190/node_modules/.vite/deps/@react-three_drei.js:82293:7)`

const ATLAS = `Error
    at getTextRenderInfo (http://localhost:5190/node_modules/troika-three-text/src/TextBuilder.js:264:7)`

const THREE_FILE = `Error
    at readPixels (http://localhost:5190/node_modules/.vite/deps/three.js:100:1)
    at WebGLRenderer (http://localhost:5190/src/components/scene/Scene.tsx:20:1)`

const APP_FILE = `Error
    at readPixels (http://localhost:5190/src/scene/stage/RoomLabels.tsx:12:3)`

function reported(level: string, message: string, source: string): string[] {
  return isWhitelistedConsoleMessage(level, message, source) ? [] : [`${level}: ${message}`]
}

describe('控制台警告白名单', () => {
  it('放行 THREE.Clock、troika 的 ReadPixels 停顿，以及 troika 图集扩容', () => {
    expect(isWhitelistedConsoleMessage('warn', CLOCK, '')).toBe(true)
    expect(isWhitelistedConsoleMessage('warn', STALL, TROIKA_FILE)).toBe(true)
    expect(isWhitelistedConsoleMessage('warn', STALL, DREI_BUNDLE)).toBe(true)
    expect(isWhitelistedConsoleMessage('warn', DRIVER, TROIKA_FILE)).toBe(true)
    expect(isWhitelistedConsoleMessage('warn', DRIVER_LAST, DREI_BUNDLE)).toBe(true)
    expect(isWhitelistedConsoleMessage('warn', STALL_LAST, TROIKA_FILE)).toBe(true)
    expect(isWhitelistedConsoleMessage('warn', STALL, RESIZE)).toBe(true)
    expect(isWhitelistedConsoleMessage('info', 'Increasing SDF texture size 128->256', ATLAS)).toBe(true)
    expect(isWhitelistedConsoleMessage('info', 'Increasing SDF texture size 128->512', RESIZE)).toBe(true)
    expect(isTroikaSdfSource(DREI_BUNDLE)).toBe(true)
    expect(isTroikaSdfSource(TROIKA_FILE)).toBe(true)
  })

  it('非 troika 的 ReadPixels 和其它警告仍然报出', () => {
    const kept = [
      ...reported('warn', STALL, THREE_FILE),
      ...reported('warn', STALL, APP_FILE),
      ...reported('warn', DRIVER, THREE_FILE),
      ...reported('warn', DRIVER, ''),
      ...reported('warn', 'GPU stall due to glFinish', TROIKA_FILE),
      ...reported('warn', 'GPU stall due to ReadPixels extra', TROIKA_FILE),
      ...reported(
        'warn',
        '[.WebGL-0x1]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to glFinish',
        TROIKA_FILE,
      ),
      ...reported('warn', 'ReadPixels failed', TROIKA_FILE),
      ...reported('warn', 'WebGL SDF generation failed, falling back to JS', TROIKA_FILE),
      ...reported(
        'warn',
        STALL,
        'at readPixels (http://localhost:5190/node_modules/.vite/deps/@react-three_drei.js:10:1)',
      ),
      ...reported('info', 'Increasing SDF texture size 128->256', THREE_FILE),
      ...reported('info', 'Increasing SDF texture size 128->256', 'at resize (webgl-sdf-generator.js:341:1)'),
      ...reported('info', 'Increasing SDF texture size soon', ATLAS),
      ...reported('info', 'Increasing SDF texture size 128 -> 256', ATLAS),
      ...reported('error', STALL, TROIKA_FILE),
      ...reported('info', 'hello', APP_FILE),
    ]
    expect(reported('warn', CLOCK, TROIKA_FILE)).toEqual([])
    expect(kept).toEqual([
      `warn: ${STALL}`,
      `warn: ${STALL}`,
      `warn: ${DRIVER}`,
      `warn: ${DRIVER}`,
      'warn: GPU stall due to glFinish',
      'warn: GPU stall due to ReadPixels extra',
      'warn: [.WebGL-0x1]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to glFinish',
      'warn: ReadPixels failed',
      'warn: WebGL SDF generation failed, falling back to JS',
      `warn: ${STALL}`,
      'info: Increasing SDF texture size 128->256',
      'info: Increasing SDF texture size 128->256',
      'info: Increasing SDF texture size soon',
      'info: Increasing SDF texture size 128 -> 256',
      `error: ${STALL}`,
      'info: hello',
    ])
    expect(reported('warn', CLOCK, '')).toEqual([])
  })

  it('0 warning 只在全部命中白名单时成立', () => {
    const allowed = [
      reported('warn', CLOCK, 'three'),
      reported('warn', DRIVER, DREI_BUNDLE),
      reported('info', 'Increasing SDF texture size 256->512', ATLAS),
    ].flat()
    expect(allowed).toEqual([])

    const mixed = [
      reported('warn', DRIVER, DREI_BUNDLE),
      reported('warn', STALL, APP_FILE),
      reported('warn', 'Shader compile failed', DREI_BUNDLE),
    ].flat()
    expect(mixed).toEqual([`warn: ${STALL}`, 'warn: Shader compile failed'])
  })
})
