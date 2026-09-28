import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import { listFloorSpecs } from '../data/floors'
import { BADGE_ALARM_X, BADGE_CHIP_W, BADGE_HEIGHT, BADGE_ID_X, BADGE_MIN_SCREEN_PX, badgeAnchor } from './badges'
import {
  BADGE_GLYPH_HEIGHT,
  badgeScreenScale,
  buildBadgeDigitGeometry,
  glyphFrame,
  patchBadgeDigitVertexShader,
  writeBadgeDigitPositions,
} from './badgeDigits'

describe('徽标数字图集', () => {
  it('数字比 B 窄，UV 落在图集给出的范围内', () => {
    const digit = glyphFrame('0')
    const letter = glyphFrame('B')
    expect(digit.width).toBeLessThan(BADGE_GLYPH_HEIGHT)
    expect(letter.width).toBeGreaterThan(digit.width)
    expect(digit.uv[0]).toBeGreaterThan(0.015)
    expect(digit.uv[2]).toBeLessThan(0.235)
    expect(digit.uv[1]).toBeCloseTo(0.765625, 5)
    expect(digit.uv[3]).toBeCloseTo(0.984375, 5)
  })

  it('两位数字放得进色块，楼层号用的字符都在图集里', () => {
    const pair = glyphFrame('8').width * 2
    expect(pair).toBeLessThan(BADGE_CHIP_W)
    const id = glyphFrame('F').width + glyphFrame('1').width + glyphFrame('2').width
    expect(BADGE_ID_X - id / 2).toBeGreaterThan(-4.5)
    for (const floor of listFloorSpecs()) {
      expect(() => [...floor.id].forEach((char) => glyphFrame(char))).not.toThrow()
    }
  })

  it('23 层合成一个索引网格，顶点按锚点平移', () => {
    const floors = listFloorSpecs().map((floor) => ({ ...floor, alarmCount: 6, offlineCount: 12 }))
    const { geometry, local, anchorIndex } = buildBadgeDigitGeometry(floors)
    const glyphs = floors.reduce(
      (sum, floor) => sum + floor.id.length + String(floor.alarmCount).length + String(floor.offlineCount).length,
      0,
    )
    expect(geometry.getAttribute('position').count).toBe(glyphs * 4)
    expect(geometry.getIndex()?.count).toBe(glyphs * 6)
    expect(geometry.groups).toHaveLength(0)
    expect(anchorIndex).toHaveLength(glyphs * 4)

    const positions = new Float32Array(local.length)
    const anchors = floors.map(() => ({ x: 0, y: 0, z: 0 }))
    anchors[1] = { x: 3, y: 4, z: 5 }
    writeBadgeDigitPositions(positions, local, anchorIndex, anchors, new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1))
    const vertex = anchorIndex.indexOf(1) * 3
    expect(positions[vertex]).toBeCloseTo(3 + local[vertex], 5)
    expect(positions[vertex + 1]).toBeCloseTo(4 + local[vertex + 1], 5)
    expect(positions[vertex + 2]).toBeCloseTo(5 + local[vertex + 2], 5)
    expect(local[2]).toBeGreaterThan(0)

    const centers = geometry.getAttribute('badgeCenter')
    expect(centers.count).toBe(glyphs * 4)
    const expected = badgeAnchor(floors[1])
    const centerVertex = anchorIndex.indexOf(1)
    expect(centers.getX(centerVertex)).toBeCloseTo(expected.x, 5)
    expect(centers.getY(centerVertex)).toBeCloseTo(expected.y, 5)
    expect(centers.getZ(centerVertex)).toBeCloseTo(expected.z, 5)
    expect(centers.getX(centerVertex + 3)).toBeCloseTo(expected.x, 5)
    geometry.dispose()
  })

  it('屏幕高度只放大到下限，近处保持 1', () => {
    expect(badgeScreenScale(BADGE_MIN_SCREEN_PX + 10)).toBe(1)
    expect(badgeScreenScale(14)).toBeCloseTo(BADGE_MIN_SCREEN_PX / 14, 5)
    expect(badgeScreenScale(0.00001)).toBeGreaterThan(1)

    const shader = {
      vertexShader: '#include <common>\nvoid main() {\n#include <begin_vertex>\n}\n',
      uniforms: {} as Record<string, { value: unknown }>,
    }
    patchBadgeDigitVertexShader(shader, 768)
    expect(shader.vertexShader).toContain('attribute vec3 badgeCenter;')
    expect(shader.vertexShader).toContain('float k = max(1.0, badgeMinPixelHeight / max(px, 1e-3));')
    expect(shader.uniforms.badgeViewportHeight.value).toBe(768)
    expect(shader.uniforms.badgeWorldHeight.value).toBe(BADGE_HEIGHT)
    expect(shader.uniforms.badgeMinPixelHeight.value).toBe(BADGE_MIN_SCREEN_PX)
  })

  it('验收机位三种宽度下墨迹至少 10px，相邻层中心距大于墨迹', () => {
    const inkWorld = BADGE_GLYPH_HEIGHT * (48 / 56)
    const eye = new Vector3(-304, 71, 121)
    const target = new Vector3(-46, 46, 18)
    const forward = target.clone().sub(eye).normalize()
    const camera = new PerspectiveCamera(36, 1, 0.35, 2400)
    const anchors = listFloorSpecs().map((floor) => badgeAnchor(floor)).filter((anchor) => anchor.id !== 'B1')
    for (const height of [1080, 768, 576]) {
      camera.aspect = (height * 16) / 9 / height
      camera.updateProjectionMatrix()
      const proj11 = camera.projectionMatrix.elements[5]
      const rows = anchors.map((anchor) => {
        const viewZ = Math.abs(forward.dot(new Vector3(anchor.x, anchor.y, anchor.z).sub(eye)))
        const plate = (BADGE_HEIGHT * proj11 * height) / (2 * viewZ)
        const scale = badgeScreenScale(plate)
        return { y: anchor.y, viewZ, ink: plate * scale * (inkWorld / BADGE_HEIGHT) }
      })
      expect(Math.min(...rows.map((row) => row.ink))).toBeGreaterThanOrEqual(10)
      rows.sort((a, b) => a.y - b.y)
      for (let index = 1; index < rows.length; index += 1) {
        const spacing = ((rows[index].y - rows[index - 1].y) * proj11 * height) / (2 * ((rows[index].viewZ + rows[index - 1].viewZ) / 2))
        expect(spacing).toBeGreaterThan((rows[index].ink + rows[index - 1].ink) / 2)
      }
    }
  })

  it('告警数字以色块中心对齐', () => {
    const floors = [{ id: 'F1', alarmCount: 8, offlineCount: 0, elevation: 0, height: 6 }]
    const { geometry, local, anchorIndex } = buildBadgeDigitGeometry(floors)
    const centers: number[] = []
    for (let index = 0; index < anchorIndex.length; index += 4) {
      centers.push((local[index * 3] + local[(index + 1) * 3]) / 2)
    }
    const alarm = centers.find((x) => Math.abs(x - BADGE_ALARM_X) < 0.2)
    expect(alarm).toBeCloseTo(BADGE_ALARM_X, 4)
    geometry.dispose()
  })
})