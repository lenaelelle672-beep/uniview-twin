import { describe, expect, it } from 'vitest'
import { composeCursorNode, createCursorBridge, type CursorSlot } from './bridge'

describe('悬停指针桥', () => {
  it('包进测距槽，默认把指针节点送进去，再包一层会停住', () => {
    const seen: unknown[] = []
    let slot: CursorSlot = (node) => {
      seen.push(node)
    }
    const cursor = { kind: 'cursor' }
    const bridge = createCursorBridge({
      read: () => slot,
      write: (next) => {
        slot = next
      },
      compose: (node) => composeCursorNode(node, cursor, (nodes) => ({ kind: 'fragment', nodes })),
    })
    expect(bridge.tick()).toBe(true)
    expect(seen).toEqual([cursor])
    expect(slot.__cursorBridge).toBe(true)
    slot({ kind: 'measure' })
    expect(seen.at(-1)).toEqual({ kind: 'fragment', nodes: [{ kind: 'measure' }, cursor] })
    const wrapped = slot
    expect(bridge.tick()).toBe(true)
    expect(slot).toBe(wrapped)
  })

  it('外层已经是网格桥时不再套，避免互相 flush', () => {
    const seen: unknown[] = []
    let slot: CursorSlot = (node) => {
      seen.push(node)
    }
    const bridge = createCursorBridge({
      read: () => slot,
      write: (next) => {
        slot = next
      },
      compose: (node) => composeCursorNode(node, 'cursor', (nodes) => nodes),
    })
    bridge.tick()
    const ours = slot
    const grid: CursorSlot = (node) => {
      ours(node)
    }
    grid.__gridBridge = true
    slot = grid
    expect(bridge.tick()).toBe(true)
    expect(slot).toBe(grid)
    expect(seen).toEqual(['cursor'])
  })

  it('槽被换掉且没有桥标记时重新挂上', () => {
    const seen: unknown[] = []
    let slot: CursorSlot | undefined = (node) => {
      seen.push(node)
    }
    const bridge = createCursorBridge({
      read: () => slot,
      write: (next) => {
        slot = next
      },
      compose: (node) => node ?? 'cursor',
    })
    bridge.tick()
    slot = (node) => {
      seen.push(['fresh', node])
    }
    expect(bridge.tick()).toBe(true)
    expect(slot.__cursorBridge).toBe(true)
    expect(seen.at(-1)).toEqual(['fresh', 'cursor'])
  })

  it('测距开着时第一次不把测距节点换成只有指针', () => {
    const seen: unknown[] = []
    let slot: CursorSlot = (node) => {
      seen.push(node)
    }
    const bridge = createCursorBridge({
      read: () => slot,
      write: (next) => {
        slot = next
      },
      compose: (node) => composeCursorNode(node, 'cursor', (nodes) => nodes),
      measureOn: () => true,
    })
    bridge.tick()
    expect(seen).toEqual([])
    slot('measure')
    expect(seen).toEqual([['measure', 'cursor']])
  })
})
