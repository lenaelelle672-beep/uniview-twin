import { setConsoleFunction } from 'three'

/**
 * D015：R3F 9.8.1 仍在内部 `new THREE.Clock()`，three 0.186 会在构造时打印弃用警告。
 * 版本按方案锁定，不能改其中任何一边。这里只吞掉这一条已知警告。
 *
 * D038：troika-three-text 的 TextBuilder 在图集加高时会
 * `console.info(\`Increasing SDF texture size ${height}->${next}\`)`。
 * 只按这句原文放行。`GPU stall due to ReadPixels` 是 Chrome WebGL 层写进开发者工具的，
 * 不经过页面 console，这里不拦截。
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

function messageText(args: unknown[]): string {
  if (args.length === 1 && typeof args[0] === 'string') return args[0]
  return args.map((arg) => (typeof arg === 'string' ? arg : String(arg))).join(' ')
}

function installSdfInfoFilter(): void {
  const originalInfo = console.info.bind(console)
  console.info = (...args: unknown[]) => {
    if (isWhitelistedConsoleMessage('info', messageText(args))) return
    originalInfo(...args)
  }
}

const globalMark = globalThis as { [INSTALLED]?: boolean }
if (!globalMark[INSTALLED]) {
  globalMark[INSTALLED] = true
  installSdfInfoFilter()
}

setConsoleFunction((type, message, ...params) => {
  const text = typeof message === 'string' ? message : String(message)
  if (isWhitelistedConsoleMessage(type, text)) return
  if (type === 'error') console.error(message, ...params)
  else if (type === 'log') console.log(message, ...params)
  else console.warn(message, ...params)
})
