import { configureTextBuilder } from 'troika-three-text'
import { ROOM_LABEL_FONT } from './roomLabels'

let configured = false

/**
 * D036 / D101：关掉 troika 缺字时走 jsDelivr 的 unicode-font-resolver。
 * 必须在创建任何 Text 之前调用，且只能从房间标签包里引入，不能进主包。
 */
export function disableTroikaCdnFallback(): void {
  if (configured) return
  configured = true
  configureTextBuilder({
    defaultFontURL: ROOM_LABEL_FONT,
    unicodeFontsURL: '',
  })
}
