type EscapeLayer = { id: string; dismiss: () => void }

const layers: EscapeLayer[] = []

export type SearchEscapeAction = 'close-list' | 'clear' | 'blur'

/** 搜索框聚焦时的 Esc 步进：先关下拉，再清空，再失焦。 */
export function nextSearchEscapeAction(state: {
  focused: boolean
  listOpen: boolean
  query: string
}): SearchEscapeAction | null {
  if (state.listOpen) return 'close-list'
  if (state.query !== '') return 'clear'
  if (state.focused) return 'blur'
  return null
}

export function registerEscapeLayer(id: string, dismiss: () => void): () => void {
  layers.push({ id, dismiss })
  return () => {
    for (let i = layers.length - 1; i >= 0; i -= 1) {
      if (layers[i]?.id === id) {
        layers.splice(i, 1)
        break
      }
    }
  }
}

/** 关掉最上层。有层被处理时返回 true，调用方应 stopPropagation。 */
export function dismissTopEscapeLayer(): boolean {
  const top = layers[layers.length - 1]
  if (!top) return false
  top.dismiss()
  return true
}

export function escapeLayerCount(): number {
  return layers.length
}

export function resetEscapeLayers(): void {
  layers.length = 0
}

if (typeof window !== 'undefined') window.__twinDismissEsc = dismissTopEscapeLayer
