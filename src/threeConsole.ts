import { setConsoleFunction } from 'three'

/**
 * D015：R3F 9.8.1 仍在内部 `new THREE.Clock()`，three 0.186 会在构造时打印弃用警告。
 * 版本按方案锁定，不能改其中任何一边。这里只吞掉这一条已知警告。
 *
 * D038 / D264：troika 图集加高会 `console.info('Increasing SDF texture size …')`。
 * three 的 setConsoleFunction 放行这句；页面 console.info 不再吞掉，好让 QA 捕获。
 * `GPU stall due to ReadPixels` 走 Chrome WebGL 层，不经过页面 console。
 */
const CLOCK_DEPRECATION =
  'THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.'

const SDF_GROWTH = /^Increasing SDF texture size \d+->\d+$/

const INSTALLED = Symbol.for('uniview.consoleWhitelist')

export function isWhitelistedConsoleMessage(level: string, message: string): boolean {
  if (level === 'warn' && message === CLOCK_DEPRECATION) return true
  if (level === 'info' && SDF_GROWTH.test(message)) return true
  return false
}

const globalMark = globalThis as { [INSTALLED]?: boolean }
if (!globalMark[INSTALLED]) {
  globalMark[INSTALLED] = true
}

setConsoleFunction((type, message, ...params) => {
  const text = typeof message === 'string' ? message : String(message)
  if (isWhitelistedConsoleMessage(type, text)) return
  if (type === 'error') console.error(message, ...params)
  else if (type === 'log') console.log(message, ...params)
  else console.warn(message, ...params)
})
