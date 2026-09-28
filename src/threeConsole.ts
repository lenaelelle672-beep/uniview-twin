import { setConsoleFunction } from 'three'

/**
 * D015：R3F 9.8.1 仍在内部 `new THREE.Clock()`，three 0.186 会在构造时打印弃用警告。
 * 版本按方案锁定，不能改其中任何一边。这里只吞掉这一条已知警告。
 *
 * D038：进单层时 troika-three-text 会在自己的离屏画布上做一次 SDF 预热
 * （TextBuilder.warmUpSDFCanvas → webgl-sdf-generator isSupported 的 readPixels），
 * 以及图集扩容时打一条 info。Chrome 不经过页面的 console.warn，而是另发一条
 * rendering 日志，正文固定为 `GPU stall due to ReadPixels`，外面再套
 * `[.WebGL-…]GL Driver Message (…): `。只放行这两条，并且必须对上来源；
 * 其它 ReadPixels / GPU stall 仍原样输出。
 */
const CLOCK_DEPRECATION =
  'THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.'

const READPIXELS_STALL = 'GPU stall due to ReadPixels'
const READPIXELS_STALL_LAST = `${READPIXELS_STALL} (this message will no longer repeat)`

const GL_DRIVER_PREFIX = /^\[\.WebGL-[0-9a-fA-Fx]+\]GL Driver Message \([^()\n]+\): (.*)$/

const SDF_GROWTH = /^Increasing SDF texture size \d+->\d+$/

const INSTALLED = Symbol.for('uniview.consoleWhitelist')

let readPixelsDepth = 0
let readPixelsSource = ''

function isReadPixelsStallText(message: string): boolean {
  if (message === READPIXELS_STALL || message === READPIXELS_STALL_LAST) return true
  const prefixed = GL_DRIVER_PREFIX.exec(message)
  return prefixed !== null && (prefixed[1] === READPIXELS_STALL || prefixed[1] === READPIXELS_STALL_LAST)
}

function hasToken(source: string, token: string): boolean {
  return new RegExp(`(?:^|[^\\w.-])${token}(?:[^\\w.-]|$)`).test(source)
}

function hasFunction(source: string, name: string): boolean {
  return new RegExp(`(?:^|[^\\w$])${name}(?:[^\\w$]|$)`).test(source)
}

/** troika-three-text 或 webgl-sdf-generator 的调用栈。Vite 会把两者打进 drei 预构建包，那时认函数名。 */
export function isTroikaSdfSource(source: string): boolean {
  if (hasToken(source, 'troika-three-text') || hasToken(source, 'webgl-sdf-generator')) return true
  if (!source.includes('@react-three_drei')) return false
  return hasFunction(source, 'warmUpSDFCanvas') || hasFunction(source, 'resizeWebGLCanvasWithoutClearing')
}

function isTroikaAtlasSource(source: string): boolean {
  return hasToken(source, 'troika-three-text') || hasFunction(source, 'getTextRenderInfo')
}

export function isWhitelistedConsoleMessage(level: string, message: string, source: string): boolean {
  if (level === 'warn' && message === CLOCK_DEPRECATION) return true
  if (level === 'warn' && isReadPixelsStallText(message) && isTroikaSdfSource(source)) return true
  if ((level === 'info' || level === 'warn') && SDF_GROWTH.test(message) && isTroikaAtlasSource(source)) return true
  return false
}

function messageText(args: unknown[]): string {
  if (args.length === 1 && typeof args[0] === 'string') return args[0]
  return args.map((arg) => (typeof arg === 'string' ? arg : String(arg))).join(' ')
}

function activeSource(): string {
  const stack = new Error().stack ?? ''
  return readPixelsDepth > 0 ? `${stack}\n${readPixelsSource}` : stack
}

function installConsoleFilter(): void {
  const originalWarn = console.warn.bind(console)
  const originalInfo = console.info.bind(console)
  console.warn = (...args: unknown[]) => {
    if (isWhitelistedConsoleMessage('warn', messageText(args), activeSource())) return
    originalWarn(...args)
  }
  console.info = (...args: unknown[]) => {
    if (isWhitelistedConsoleMessage('info', messageText(args), activeSource())) return
    originalInfo(...args)
  }
}

function installReadPixelsAttribution(): void {
  const contexts = [globalThis.WebGLRenderingContext, globalThis.WebGL2RenderingContext]
  for (const Context of contexts) {
    if (!Context) continue
    const prototype = Context.prototype
    const original = prototype.readPixels
    if ((original as { twinAttributed?: boolean }).twinAttributed) continue
    const wrapped = function (this: WebGLRenderingContext, ...args: Parameters<WebGLRenderingContext['readPixels']>) {
      const stack = new Error().stack ?? ''
      const track = isTroikaSdfSource(stack)
      if (track) {
        readPixelsSource = stack
        readPixelsDepth += 1
      }
      try {
        return original.apply(this, args)
      } finally {
        if (track) readPixelsDepth -= 1
      }
    }
    wrapped.twinAttributed = true
    prototype.readPixels = wrapped
  }
}

const globalMark = globalThis as { [INSTALLED]?: boolean }
if (!globalMark[INSTALLED]) {
  globalMark[INSTALLED] = true
  installConsoleFilter()
  installReadPixelsAttribution()
}

setConsoleFunction((type, message, ...params) => {
  const text = typeof message === 'string' ? message : String(message)
  if (type === 'warn' && isWhitelistedConsoleMessage('warn', text, activeSource())) return
  if (type === 'error') console.error(message, ...params)
  else if (type === 'log') console.log(message, ...params)
  else console.warn(message, ...params)
})
