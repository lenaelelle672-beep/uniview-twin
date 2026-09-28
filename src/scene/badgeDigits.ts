import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { BufferAttribute, BufferGeometry, PlaneGeometry, Vector3 } from 'three'
import atlas from '../../assets/ready/textures/badge-digits-bold.json'
import { BADGE_ALARM_X, BADGE_HEIGHT, BADGE_ID_X, BADGE_MIN_SCREEN_PX, BADGE_OFFLINE_X, badgeAnchor } from './badges'

/** 四边形高度对应图集格子去掉内边后的 56 px。两位数字要落进色块里。 */
export const BADGE_GLYPH_HEIGHT = 1.16
const DIGIT_Z = 0.1
const SPAN_PX = atlas.cell - atlas.padding

interface AtlasGlyph {
  uv: [number, number, number, number]
  advanceRatio: number
}

const glyphs = atlas.glyphs as unknown as Record<string, AtlasGlyph>

export interface BadgeDigitSource {
  id: string
  alarmCount: number
  offlineCount: number
  elevation: number
  height: number
}

export interface BadgeDigitLayout {
  geometry: BufferGeometry
  local: Float32Array
  anchorIndex: Uint16Array
}

export function glyphFrame(
  char: string,
  height = BADGE_GLYPH_HEIGHT,
): { width: number; uv: [number, number, number, number] } {
  const glyph = glyphs[char]
  if (!glyph) throw new Error(`徽标图集没有字符 ${char}`)
  const advancePx = glyph.advanceRatio * atlas.fontSizePx
  const keep = advancePx / SPAN_PX
  const [u0, v0, u1, v1] = glyph.uv
  const uMid = (u0 + u1) / 2
  const uHalf = ((u1 - u0) * keep) / 2
  return {
    width: height * keep,
    uv: [uMid - uHalf, v0, uMid + uHalf, v1],
  }
}

function quad(width: number, height: number, uv: [number, number, number, number], x: number, y: number, z: number) {
  const geometry = new PlaneGeometry(width, height)
  const attribute = geometry.attributes.uv
  const [u0, v0, u1, v1] = uv
  attribute.setXY(0, u0, v1)
  attribute.setXY(1, u1, v1)
  attribute.setXY(2, u0, v0)
  attribute.setXY(3, u1, v0)
  geometry.translate(x, y, z)
  return geometry
}

function appendString(
  parts: PlaneGeometry[],
  anchorIds: number[],
  anchorId: number,
  text: string,
  centerX: number,
) {
  const frames = [...text].map((char) => glyphFrame(char))
  const total = frames.reduce((sum, frame) => sum + frame.width, 0)
  let cursor = centerX - total / 2
  for (const frame of frames) {
    parts.push(quad(frame.width, BADGE_GLYPH_HEIGHT, frame.uv, cursor + frame.width / 2, 0, DIGIT_Z))
    anchorIds.push(anchorId, anchorId, anchorId, anchorId)
    cursor += frame.width
  }
}

export function buildBadgeDigitGeometry(floors: BadgeDigitSource[]): BadgeDigitLayout {
  const parts: PlaneGeometry[] = []
  const anchorIds: number[] = []
  floors.forEach((floor, index) => {
    appendString(parts, anchorIds, index, floor.id, BADGE_ID_X)
    appendString(parts, anchorIds, index, String(floor.alarmCount), BADGE_ALARM_X)
    appendString(parts, anchorIds, index, String(floor.offlineCount), BADGE_OFFLINE_X)
  })
  const geometry = mergeGeometries(parts, false)
  parts.forEach((part) => part.dispose())
  if (!geometry) throw new Error('徽标数字网格合并失败')
  const position = geometry.attributes.position.array as Float32Array
  const centers = new Float32Array(anchorIds.length * 3)
  for (let index = 0; index < anchorIds.length; index += 1) {
    const anchor = badgeAnchor(floors[anchorIds[index]])
    centers[index * 3] = anchor.x
    centers[index * 3 + 1] = anchor.y
    centers[index * 3 + 2] = anchor.z
  }
  geometry.setAttribute('badgeCenter', new BufferAttribute(centers, 3))
  geometry.computeBoundingSphere()
  return {
    geometry,
    local: position.slice(),
    anchorIndex: Uint16Array.from(anchorIds),
  }
}

/** 低于最小屏幕高度时放大，已超过时保持 1。 */
export function badgeScreenScale(pixelHeight: number, minimum = BADGE_MIN_SCREEN_PX): number {
  return Math.max(minimum / Math.max(pixelHeight, 0.0001), 1)
}

export function patchBadgeDigitVertexShader(
  shader: { vertexShader: string; uniforms: Record<string, { value: unknown }> },
  viewportHeight: number,
) {
  shader.uniforms.badgeViewportHeight = { value: viewportHeight }
  shader.uniforms.badgeWorldHeight = { value: BADGE_HEIGHT }
  shader.uniforms.badgeMinPixelHeight = { value: BADGE_MIN_SCREEN_PX }
  const vertex = shader.vertexShader
    .replace(
      '#include <common>',
      `#include <common>
attribute vec3 badgeCenter;
uniform float badgeViewportHeight;
uniform float badgeWorldHeight;
uniform float badgeMinPixelHeight;
`,
    )
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
vec4 badgeView = modelViewMatrix * vec4(badgeCenter, 1.0);
float badgePixels = badgeWorldHeight * projectionMatrix[1][1] * badgeViewportHeight / (2.0 * max(abs(badgeView.z), 0.0001));
float badgeScale = max(badgeMinPixelHeight / max(badgePixels, 0.0001), 1.0);
transformed = badgeCenter + (transformed - badgeCenter) * badgeScale;
`,
    )
  if (!vertex.includes('float badgeScale')) throw new Error('徽标数字顶点着色器没有接上屏幕尺寸')
  shader.vertexShader = vertex
}

const scratch = new Vector3()

export function writeBadgeDigitPositions(
  positions: Float32Array,
  local: Float32Array,
  anchorIndex: Uint16Array,
  anchors: Array<{ x: number; y: number; z: number }>,
  right: Vector3,
  up: Vector3,
  forward: Vector3,
) {
  const count = anchorIndex.length
  for (let index = 0; index < count; index += 1) {
    const anchor = anchors[anchorIndex[index]]
    const offset = index * 3
    scratch.set(local[offset], local[offset + 1], local[offset + 2])
    positions[offset] = anchor.x + right.x * scratch.x + up.x * scratch.y + forward.x * scratch.z
    positions[offset + 1] = anchor.y + right.y * scratch.x + up.y * scratch.y + forward.y * scratch.z
    positions[offset + 2] = anchor.z + right.z * scratch.x + up.z * scratch.y + forward.z * scratch.z
  }
}
