import { disableTroikaCdnFallback } from './disableTroikaCdn'

disableTroikaCdnFallback()

if (typeof window !== 'undefined') {
  window.__twinTextRuntimeAt = performance.now()
}

/** D109：troika 的独立按需包。创建 Text 前必须先关 CDN。labels 不挂在这里，避免预取 textRuntime 时把 labels chunk 一起拉走。 */
export { Text } from '@react-three/drei/core/Text'
