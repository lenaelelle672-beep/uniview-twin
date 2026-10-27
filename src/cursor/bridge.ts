/**
 * 把悬停指针挂进已有的测距槽，不自己再占一条 Canvas 入口。
 * 只包一次。外面的网格 / 贴花 / 导览轨桥还在时不再套一层，避免互相 flush。
 */

export const OVERLAY_FLAGS = ['__gridBridge', '__decalBridge', '__tourBridge', '__focusBridge'] as const

export type OverlayFlag = (typeof OVERLAY_FLAGS)[number]

export type CursorSlot = ((node: unknown) => void) & { __cursorBridge?: boolean } & Partial<Record<OverlayFlag, boolean>>

export function composeCursorNode(
  node: unknown,
  cursor: unknown,
  fragment: (nodes: readonly unknown[]) => unknown,
): unknown {
  if (cursor == null) return node ?? null
  if (node == null) return cursor
  return fragment([node, cursor])
}

export function createCursorBridge(options: {
  read: () => CursorSlot | undefined
  write: (slot: CursorSlot) => void
  compose: (node: unknown) => unknown
  measureOn?: () => boolean
}) {
  let bridge: CursorSlot | null = null

  return {
    get installed() {
      return bridge != null
    },
    tick(): boolean {
      const current = options.read()
      if (!current) return false
      if (current === bridge || current.__cursorBridge) return true
      if (bridge && OVERLAY_FLAGS.some((flag) => current[flag])) return true
      const upstream = current
      const remount = bridge != null
      let depth = 0
      const wrapped: CursorSlot = (node) => {
        if (depth > 4) return
        depth += 1
        try {
          upstream(options.compose(node))
        } finally {
          depth -= 1
        }
      }
      wrapped.__cursorBridge = true
      for (const flag of OVERLAY_FLAGS) {
        if (upstream[flag]) wrapped[flag] = true
      }
      bridge = wrapped
      options.write(wrapped)
      if (remount || !options.measureOn?.()) wrapped(null)
      return true
    },
  }
}
