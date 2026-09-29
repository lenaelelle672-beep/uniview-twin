import { describe, expect, it } from 'vitest'
import { isWhitelistedConsoleMessage } from './threeConsole'

const STALL = 'GPU stall due to ReadPixels'
const DRIVER =
  '[.WebGL-0x1824000f8000]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels'

function reported(level: string, message: string): string[] {
  return isWhitelistedConsoleMessage(level, message) ? [] : [`${level}: ${message}`]
}

describe('troika 图集扩容日志', () => {
  it('放行 Increasing SDF texture size 这一句', () => {
    expect(isWhitelistedConsoleMessage('info', 'Increasing SDF texture size 128->256')).toBe(true)
    expect(isWhitelistedConsoleMessage('info', 'Increasing SDF texture size 64->128')).toBe(true)
    expect(reported('info', 'Increasing SDF texture size 256->512')).toEqual([])
  })

  it('其它 console 警告和信息仍报出', () => {
    const kept = [
      ...reported('info', 'Increasing SDF texture size soon'),
      ...reported('info', 'Increasing SDF texture size 128 -> 256'),
      ...reported('info', 'Increasing SDF texture size 128->256 extra'),
      ...reported('warn', 'Increasing SDF texture size 128->256'),
      ...reported('info', 'hello'),
      ...reported('warn', STALL),
      ...reported('warn', DRIVER),
      ...reported('warn', 'WebGL SDF generation failed, falling back to JS'),
      ...reported('warn', 'Shader compile failed'),
    ]
    expect(kept).toEqual([
      'info: Increasing SDF texture size soon',
      'info: Increasing SDF texture size 128 -> 256',
      'info: Increasing SDF texture size 128->256 extra',
      'warn: Increasing SDF texture size 128->256',
      'info: hello',
      `warn: ${STALL}`,
      `warn: ${DRIVER}`,
      'warn: WebGL SDF generation failed, falling back to JS',
      'warn: Shader compile failed',
    ])
  })
})
