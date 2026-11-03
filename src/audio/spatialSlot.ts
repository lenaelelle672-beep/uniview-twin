/**
 * T108：把空间音挂进已有的测距槽。
 * 网格、贴花、轮询、拖摆、视锥也包这条槽，而且有的桥不会抄走别人的标记。
 * 后包的一层若把旧包装成上游，共享的 raw 再指回去就会互相 flush 直到爆栈。
 * 这里每次只认当前这一层：抄走已有标记，被盖住的旧包装只把节点交回当时的上游。
 */

export type SpatialSlot = ((node: unknown) => void) & { __spatialBridge?: boolean }

function copyFlags(from: object, to: SpatialSlot): void {
  const source = from as Record<string, unknown>
  const target = to as unknown as Record<string, unknown>
  for (const key of Object.keys(source)) {
    if (!key.startsWith('__')) continue
    target[key] = source[key]
  }
}

export function createSpatialSlot(options: {
  read: () => SpatialSlot | undefined
  write: (slot: SpatialSlot) => void
  deliver: (node: unknown, upstream: (node: unknown) => void, force: boolean) => void
}) {
  let token = 0
  let upstream: SpatialSlot | null = null
  let depth = 0

  function deliver(node: unknown, next: (node: unknown) => void, force: boolean): void {
    if (depth > 4) return
    depth += 1
    try {
      options.deliver(node, next, force)
    } finally {
      depth -= 1
    }
  }

  return {
    /** 槽还没出现，或最外层已经是空间音时，什么也不做。 */
    wrap(): boolean {
      const current = options.read()
      if (!current || current.__spatialBridge) return false
      const mine = ++token
      const captured = current
      upstream = captured
      const wrapped: SpatialSlot = (node) => {
        if (mine !== token) {
          captured(node)
          return
        }
        deliver(node, captured, true)
      }
      copyFlags(captured, wrapped)
      wrapped.__spatialBridge = true
      options.write(wrapped)
      return true
    },
    /** 告警自己要刷新时，从当前上游送出去，不经过已经被盖住的旧包装。 */
    push(node: unknown, force: boolean): void {
      if (!upstream) return
      deliver(node, upstream, force)
    },
  }
}
