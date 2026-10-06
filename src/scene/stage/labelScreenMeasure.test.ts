import { describe, expect, it } from 'vitest'
import {
  OVERLAP_STRONG_PX,
  countOverlapKinds,
  labelYawForCamera,
  overlapDepth,
  overlapPairNames,
  pickOverlapVictim,
  stripStrongOverlaps,
  visibilityMismatch,
} from './labelScreenMeasure'

describe('独立重叠口径 / 合组可见集合', () => {
  it('两向都 >2 px 才算重叠，擦边只计数', () => {
    expect(OVERLAP_STRONG_PX).toBe(2)
    const a = { x: 0, y: 0, w: 40, h: 16 }
    const strong = { x: 20, y: 4, w: 40, h: 16 }
    const graze = { x: 39, y: 0, w: 40, h: 16 }
    expect(overlapDepth(a, strong).ox).toBeGreaterThan(2)
    expect(overlapDepth(a, strong).oy).toBeGreaterThan(2)
    expect(countOverlapKinds([a, strong])).toEqual({ strong: 1, graze: 0 })
    expect(countOverlapKinds([a, graze])).toEqual({ strong: 0, graze: 1 })
    expect(overlapPairNames([{ text: '会议室', box: a }, { text: '一体机选型', box: strong }])).toEqual([
      ['会议室', '一体机选型'],
    ])
    expect(overlapPairNames([{ text: '会议室', box: a }, { text: '一体机选型', box: graze }])).toEqual([])
  })

  it('合组后成员必须从可见集合消失，mismatch 为 0', () => {
    const expected = new Set(['cluster:洽谈室'])
    const actualHidden = new Set(['cluster:洽谈室'])
    const leftover = new Set(['cluster:洽谈室', 'F3:room-1'])
    expect(visibilityMismatch(expected, actualHidden)).toEqual([])
    expect(visibilityMismatch(expected, leftover)).toContain('F3:room-1')
  })

  it('1024 可藏第二级，1366 优先藏组标签和第三级', () => {
    const tierOf = (id: string) => (id.includes('L2') || id.includes('部') ? 2 : 3)
    expect(pickOverlapVictim({ id: 'aL3', text: 'x' }, { id: 'bL2部', text: 'y' }, tierOf, false)).toBe('aL3')
    expect(pickOverlapVictim({ id: 'aL3', text: 'x' }, { id: 'bL2部', text: 'y' }, tierOf, true)).toBe('aL3')
  })

  it('实测叠字：同名单体并进合组，1366 不藏第二级单体', () => {
    const clusterBox = { x: 0, y: 0, w: 80, h: 18 }
    const singleBox = { x: 10, y: 2, w: 50, h: 16 }
    const otherBox = { x: 12, y: 3, w: 60, h: 16 }
    const pack = {
      byId: {
        meet: { visible: true, cluster: null, offsetX: 0, offsetY: 0 },
        guest: { visible: true, cluster: null, offsetX: 0, offsetY: 0 },
      },
      clusters: {
        会议室: { visible: true, offsetX: 0, offsetY: 0, world: [0, 0, 0] as [number, number, number], text: '会议室 x14' },
      },
    }
    const tierOf = (id: string) => (id === 'guest' || id === 'meet' || id.startsWith('cluster:') ? 2 : 3)
    const sameName = stripStrongOverlaps(
      [
        { id: 'meet', text: '会议室', box: singleBox, cluster: null, px: 16 },
        { id: 'cluster:会议室', text: '会议室 x14', box: clusterBox, cluster: '会议室', px: 16 },
      ],
      pack,
      tierOf,
      true,
    )
    expect(sameName.pack.byId.meet?.visible).toBe(false)
    expect(sameName.pack.byId.meet?.cluster).toBe('会议室')
    expect(sameName.pack.clusters['会议室']?.visible).toBe(true)
    const keepL2 = stripStrongOverlaps(
      [
        { id: 'meet', text: '会议室', box: singleBox, cluster: null, px: 16 },
        { id: 'guest', text: '贵宾接待室', box: otherBox, cluster: null, px: 16 },
      ],
      pack,
      tierOf,
      true,
    )
    expect(keepL2.pack.byId.meet?.visible).toBe(true)
    expect(keepL2.pack.byId.guest?.visible).toBe(true)
  })

  it('转正 yaw 让字面朝向相机，俯视 -Z 时为 0', () => {
    expect(labelYawForCamera(0, -1)).toBeCloseTo(0, 6)
    expect(labelYawForCamera(-1, 0)).toBeCloseTo(Math.PI / 2, 6)
  })
})
