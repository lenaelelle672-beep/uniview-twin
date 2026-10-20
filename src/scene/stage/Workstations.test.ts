import { describe, expect, it } from 'vitest'
import { BoxGeometry, Color, InstancedMesh, MeshBasicMaterial } from 'three'
import { MONITOR_DISPLAY_COLOR } from './materials'
import { instanceColorAt } from './Workstations'

describe('工位实例色', () => {
  it('空颜色表用离线色写实例色，不把 undefined 交给 setColorAt', () => {
    const colors: Color[] = []
    const target = new InstancedMesh(new BoxGeometry(0.2, 0.2, 0.2), new MeshBasicMaterial(), 2)
    expect(colors[0]).toBeUndefined()
    for (let index = 0; index < target.count; index += 1) {
      const color = instanceColorAt(colors, index)
      expect(color).toBe(MONITOR_DISPLAY_COLOR.offline)
      expect(() => target.setColorAt(index, color!)).not.toThrow()
    }
    expect(target.instanceColor).not.toBeNull()
    expect(target.instanceColor?.count).toBe(2)
  })
})
