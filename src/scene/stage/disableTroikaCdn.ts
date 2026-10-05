import { configureTextBuilder } from 'troika-three-text'
import { ROOM_LABEL_FONT } from './roomLabels'

let configured = false

/** 标签排版在主线程做。发布包里的 resolver 已被打进 ESM，worker 里别名替换不到。 */
export const TROIKA_TEXT_CONFIG = {
  defaultFontURL: ROOM_LABEL_FONT,
  unicodeFontsURL: '',
  useWorker: false,
} as const

/**
 * D036 / D101 / D112：关掉 troika 缺字时走 jsDelivr 的 unicode-font-resolver。
 * 必须在创建任何 Text 之前调用，且只能从 textRuntime 包里引入，不能进主包。
 * 不用 worker：发布版 troika 已内联 resolver，别名替换不到，worker 会去拉被剥掉 CDN 主机后的 https://gh/lojjic/…。
 */
export function disableTroikaCdnFallback(): void {
  if (configured) return
  configured = true
  const font =
    typeof window === 'undefined' ? ROOM_LABEL_FONT : new URL(ROOM_LABEL_FONT, window.location.origin).href
  configureTextBuilder({
    defaultFontURL: font,
    unicodeFontsURL: '',
    useWorker: false,
  })
}
