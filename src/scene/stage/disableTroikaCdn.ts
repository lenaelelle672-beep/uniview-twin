import {
  BatchedText,
  configureTextBuilder,
  getTextRenderInfo,
  preloadFont,
  Text,
} from 'troika-three-text'
import { ROOM_LABEL_FONT } from './roomLabels'

let configured = false

/** 标签排版在主线程做。发布包里的 resolver 已被打进 ESM，worker 里别名替换不到。 */
export const TROIKA_TEXT_CONFIG = {
  defaultFontURL: ROOM_LABEL_FONT,
  unicodeFontsURL: '',
  useWorker: false,
} as const

function applyTroikaConfig() {
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

/**
 * D036 / D101 / D112 / D267：关掉 troika 缺字时走 jsDelivr 的 unicode-font-resolver。
 * 本文件是唯一允许 `import 'troika-three-text'` 的入口：模块一加载就 configure，再导出 Text / preloadFont。
 * 其它文件必须从这里拿 API，禁止再动态/静态 import troika。
 * 不用 worker：发布版 troika 已内联 resolver，别名替换不到，worker 会去拉被剥掉 CDN 主机后的 https://gh/lojjic/…。
 * D264：图集初始高度由 patch-package 改成 512 字形（2048×256），这里不改 textureWidth。
 */
applyTroikaConfig()

export function disableTroikaCdnFallback(): void {
  applyTroikaConfig()
}

export { BatchedText, getTextRenderInfo, preloadFont, Text }
