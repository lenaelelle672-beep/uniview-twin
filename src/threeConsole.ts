import { setConsoleFunction } from 'three'

/**
 * R3F 9.8.1 仍在内部 `new THREE.Clock()`，而 three 0.186 会在构造时打印弃用警告。
 * 版本按方案锁定，不能改其中任何一边。这里只吞掉这一条已知警告，其余 three 日志原样输出。
 */
const CLOCK_DEPRECATION =
  'THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.'

setConsoleFunction((type, message, ...params) => {
  if (type === 'warn' && message === CLOCK_DEPRECATION) return
  if (type === 'error') console.error(message, ...params)
  else if (type === 'log') console.log(message, ...params)
  else console.warn(message, ...params)
})
