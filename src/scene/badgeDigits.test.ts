import { describe, expect, it } from 'vitest'
import { Color, PerspectiveCamera, Vector3 } from 'three'
import { listFloorSpecs } from '../data/floors'
import { BADGE_ALARM_X, BADGE_CHIP_W, BADGE_HEIGHT, BADGE_ID_X, BADGE_MIN_SCREEN_PX, BADGE_WIDTH, badgeAnchor } from './badges'
import { ALARM_MARKER_ORDER, BADGE_DIGIT_ORDER, BADGE_PLATE_ORDER, BUILDING_HIGHLIGHT_ORDER } from './overlayOrder'
import {
  BADGE_GLYPH_HEIGHT,
  badgeProjectedPixels,
  badgeScreenScale,
  buildAlarmMarkerGeometry,
  buildBadgeDigitGeometry,
  glyphFrame,
  layoutBadgeCenters,
  patchAlarmMarkerShader,
  patchBadgeDigitVertexShader,
  patchBadgePlateVertexShader,
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

    const plate = {
      vertexShader: '#include <common>\nvoid main() {\n#include <begin_vertex>\n}\n',
      uniforms: {} as Record<string, { value: unknown }>,
    }
    patchBadgePlateVertexShader(plate, 576)
    expect(plate.vertexShader).toContain('attribute vec3 badgeShift;')
    expect(plate.vertexShader).toContain('modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)')
    expect(plate.vertexShader).toContain('transformed *= k;')
    expect(plate.vertexShader).toContain('float k = max(1.0, badgeMinPixelHeight / max(px, 1e-3));')
    expect(plate.uniforms.badgeWorldHeight.value).toBe(shader.uniforms.badgeWorldHeight.value)
    expect(plate.uniforms.badgeViewportHeight.value).toBe(576)
  })

  it('两个机位三种宽度下墨迹至少 10px，底板互不重叠，字心在板内', () => {
    const inkRatio = (BADGE_GLYPH_HEIGHT * (46 / 56)) / BADGE_HEIGHT
    const floors = listFloorSpecs()
    const views = [
      {
        eye: new Vector3(39.13713073730469, 213.92249815309717, 424.7470959835453),
        target: new Vector3(39.13713073730469, 47.26308741443341, 51.550373244450206),
        fov: 33,
      },
      { eye: new Vector3(-304, 71, 121), target: new Vector3(-46, 46, 18), fov: 36 },
    ]
    const { geometry, local, anchorIndex } = buildBadgeDigitGeometry(
      floors.map((floor) => ({ ...floor, alarmCount: 12, offlineCount: 8 })),
    )
    const glyphCenters: number[] = []
    for (let index = 0; index < anchorIndex.length; index += 4) {
      glyphCenters.push((local[index * 3] + local[(index + 3) * 3]) / 2)
      expect(Math.abs((local[index * 3 + 1] + local[(index + 3) * 3 + 1]) / 2)).toBeLessThan(BADGE_HEIGHT / 2)
    }
    expect(Math.max(...glyphCenters.map((x) => Math.abs(x)))).toBeLessThan(BADGE_WIDTH / 2)
    geometry.dispose()

    for (const view of views) {
      for (const size of [
        { width: 1920, height: 1080 },
        { width: 1366, height: 768 },
        { width: 1024, height: 576 },
        // 1024 窗口、左右侧栏展开后画布大约是这个尺寸。
        { width: 596, height: 520 },
      ]) {
        const camera = new PerspectiveCamera(view.fov, size.width / size.height, 0.35, 2400)
        camera.position.copy(view.eye)
        camera.lookAt(view.target)
        camera.updateMatrixWorld()
        camera.updateProjectionMatrix()
        const basisRight = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion)
        const basisView = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
        const centers = layoutBadgeCenters(
          floors,
          basisRight,
          basisView,
          camera.position,
          camera.projectionMatrix.elements[5],
          size.height,
          size.width,
        )
        const f1 = centers.find((item) => item.id === 'F1')
        const f2 = centers.find((item) => item.id === 'F2')
        const b1 = centers.find((item) => item.id === 'B1')
        expect(f1 && f2 && b1).toBeTruthy()
        const f1Right = basisRight.dot(new Vector3(f1!.x, f1!.y, f1!.z))
        const f2Right = basisRight.dot(new Vector3(f2!.x, f2!.y, f2!.z))
        const b1Right = basisRight.dot(new Vector3(b1!.x, b1!.y, b1!.z))
        expect(Math.abs(f1Right - f2Right)).toBeGreaterThan(BADGE_WIDTH * 0.5)
        expect(b1Right).toBeLessThan(f1Right - BADGE_WIDTH * 0.5)

        const rects = centers.map((center) => {
          const point = new Vector3(center.x, center.y, center.z)
          const depth = Math.max(point.clone().sub(camera.position).dot(basisView), 1e-3)
          const plate = badgeProjectedPixels(BADGE_HEIGHT, depth, size.height, camera.projectionMatrix.elements[5])
          const heightPx = Math.max(plate, BADGE_MIN_SCREEN_PX)
          const ndc = point.project(camera)
          return {
            id: center.id,
            sx: (ndc.x * 0.5 + 0.5) * size.width,
            sy: (-ndc.y * 0.5 + 0.5) * size.height,
            h: heightPx,
            w: heightPx * (BADGE_WIDTH / BADGE_HEIGHT),
            ink: heightPx * inkRatio,
          }
        })
        const b1Rect = rects.find((rect) => rect.id === 'B1')
        const f1Rect = rects.find((rect) => rect.id === 'F1')
        expect(b1Rect && f1Rect).toBeTruthy()
        expect(b1Rect!.sy - b1Rect!.h / 2).toBeGreaterThan(f1Rect!.sy + f1Rect!.h / 2)
        expect(b1Rect!.sx).toBeLessThan(f1Rect!.sx)
        expect(Math.min(...rects.map((rect) => rect.ink))).toBeGreaterThanOrEqual(10)
        for (const rect of rects) {
          expect(rect.sx - rect.w / 2).toBeGreaterThan(-1)
          expect(rect.sx + rect.w / 2).toBeLessThan(size.width + 1)
          expect(rect.sy - rect.h / 2).toBeGreaterThan(-1)
          expect(rect.sy + rect.h / 2).toBeLessThan(size.height + 1)
        }
        for (let i = 0; i < rects.length; i += 1) {
          for (let j = i + 1; j < rects.length; j += 1) {
            const a = rects[i]
            const b = rects[j]
            const gap = Math.max(
              Math.abs(a.sx - b.sx) - (a.w + b.w) / 2,
              Math.abs(a.sy - b.sy) - (a.h + b.h) / 2,
            )
            expect(gap, `${a.id} 与 ${b.id} 在 ${size.width} 重叠`).toBeGreaterThan(1)
          }
        }
      }
    }
  })

  it('告警标记叠在数字上面，选中高亮再叠在告警上面', () => {
    expect(BADGE_DIGIT_ORDER).toBe(BADGE_PLATE_ORDER + 1)
    expect(ALARM_MARKER_ORDER).toBeGreaterThan(BADGE_DIGIT_ORDER)
    expect(BUILDING_HIGHLIGHT_ORDER).toBeGreaterThan(ALARM_MARKER_ORDER)
  })

  it('告警色块和告警数字绕同一中心，数字写在色块之后', () => {
    const floors = [{ id: 'F1', alarmCount: 8, offlineCount: 0, elevation: 0, height: 6 }]
    const { geometry, local, anchorIndex } = buildAlarmMarkerGeometry(floors)
    const part = geometry.getAttribute('markerPart')
    expect(part.getX(0)).toBe(0)
    expect(part.getX(3)).toBe(0)
    expect(part.getX(4)).toBe(1)
    const chipCenter = (local[0] + local[3]) / 2
    expect(chipCenter).toBeCloseTo(BADGE_ALARM_X, 4)
    const digitCenter = (local[4 * 3] + local[7 * 3]) / 2
    expect(digitCenter).toBeCloseTo(BADGE_ALARM_X, 4)
    expect(anchorIndex[0]).toBe(0)
    expect(anchorIndex[4]).toBe(0)
    const shader = {
      vertexShader: '#include <common>\nvoid main() {\n#include <begin_vertex>\n}\n',
      fragmentShader: '#include <common>\nvoid main() {\n#include <map_fragment>\n}\n',
      uniforms: {} as Record<string, { value: unknown }>,
    }
    patchAlarmMarkerShader(shader, 768)
    expect(shader.vertexShader).toContain('vMarkerPart = markerPart;')
    expect(shader.fragmentShader).toContain('vMarkerPart < 0.5')
    expect(shader.fragmentShader).toContain('uniform vec3 alarmColor')
    expect((shader.uniforms.alarmColor.value as Color).equals(new Color('#b42318'))).toBe(true)
    geometry.dispose()
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