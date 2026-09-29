import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { BufferAttribute, BufferGeometry, PlaneGeometry, Vector3 } from 'three'
import atlas from '../../assets/ready/textures/badge-digits-bold.json'
import {
  BADGE_ALARM_X,
  BADGE_COLUMN_X,
  BADGE_COLUMN_Z,
  BADGE_HEIGHT,
  BADGE_ID_X,
  BADGE_MIN_SCREEN_PX,
  BADGE_OFFLINE_X,
  BADGE_STAGGER_PAD,
  BADGE_WIDTH,
  badgeAnchor,
} from './badges'

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

/** 世界高度在视图深度处的 CSS 像素高。viewportHeight 不乘 devicePixelRatio。 */
export function badgeProjectedPixels(
  worldHeight: number,
  viewDepth: number,
  viewportHeight: number,
  projection11: number,
): number {
  return (worldHeight * projection11 * 0.5 * viewportHeight) / Math.max(viewDepth, 1e-3)
}

/** 低于最小屏幕高度时放大，已超过时保持 1。 */
export function badgeScreenScale(pixelHeight: number, minimum = BADGE_MIN_SCREEN_PX): number {
  return Math.max(minimum / Math.max(pixelHeight, 1e-3), 1)
}

export interface BadgePlacement {
  id: string
  x: number
  y: number
  z: number
}

function columnPoint(floor: { id: string; elevation: number; height: number }, target: Vector3) {
  target.set(BADGE_COLUMN_X, floor.id === 'B1' ? 1.5 : floor.elevation + floor.height / 2, BADGE_COLUMN_Z)
  return target
}

/**
 * 整块徽标的屏幕中心。奇数层在相机左侧，偶数层在右侧，两侧再各分一列，
 * 使同一列至少隔四层。列距不小于放大后的整块徽标宽。B1 在 F1 下方外侧。
 * 锚点高度保持在楼层上，避免把徽标推进地面。
 */
export function layoutBadgeCenters(
  floors: Array<{ id: string; elevation: number; height: number }>,
  right: Vector3,
  viewDir: Vector3,
  eye: Vector3,
  proj11: number,
  viewportHeight: number,
): BadgePlacement[] {
  const depthScratch = new Vector3()
  const scaleAt = (point: Vector3) => {
    const depth = Math.max(depthScratch.copy(point).sub(eye).dot(viewDir), 1e-3)
    return badgeScreenScale(badgeProjectedPixels(BADGE_HEIGHT, depth, viewportHeight, proj11))
  }
  const slot = (k: number) => k * (BADGE_WIDTH + BADGE_STAGGER_PAD)
  const positionOf = new Map<string, Vector3>()
  for (const floor of floors) {
    if (floor.id === 'B1') continue
    const level = Number(floor.id.slice(1))
    const pair = Math.floor((level - 1) / 2) % 2
    const column = level % 2 === 1 ? (pair === 0 ? 0 : 1) : pair === 0 ? 2 : 3
    const base = columnPoint(floor, new Vector3())
    const k = scaleAt(base)
    positionOf.set(floor.id, base.addScaledVector(right, (column - 1.5) * slot(k)))
  }
  const basement = floors.find((floor) => floor.id === 'B1')
  if (basement) {
    const base = columnPoint(basement, new Vector3())
    let k = scaleAt(base)
    for (let step = 0; step < 2; step += 1) {
      // 放大后的字形要留在地面以上，否则底板下半截会把字裁掉。
      base.y = Math.max(1.5, 0.75 + k * BADGE_GLYPH_HEIGHT * 0.5)
      k = scaleAt(base)
    }
    positionOf.set(basement.id, base.addScaledVector(right, (-1 - 1.5) * slot(k)))
  }
  return floors.map((floor) => {
    const pos = positionOf.get(floor.id) ?? columnPoint(floor, new Vector3())
    return { id: floor.id, x: pos.x, y: pos.y, z: pos.z }
  })
}

const BADGE_UNIFORMS = `uniform float badgeViewportHeight;
uniform float badgeWorldHeight;
uniform float badgeMinPixelHeight;
`
const BADGE_SCALE = `float px = badgeWorldHeight * projectionMatrix[1][1] * 0.5 * badgeViewportHeight / max(-mvC.z, 1e-3);
float k = max(1.0, badgeMinPixelHeight / max(px, 1e-3));
`

function assignBadgeScaleUniforms(
  shader: { uniforms: Record<string, { value: unknown }> },
  viewportHeight: number,
) {
  shader.uniforms.badgeViewportHeight = { value: viewportHeight }
  shader.uniforms.badgeWorldHeight = { value: BADGE_HEIGHT }
  shader.uniforms.badgeMinPixelHeight = { value: BADGE_MIN_SCREEN_PX }
}

export function patchBadgeDigitVertexShader(
  shader: { vertexShader: string; uniforms: Record<string, { value: unknown }> },
  viewportHeight: number,
) {
  assignBadgeScaleUniforms(shader, viewportHeight)
  const vertex = shader.vertexShader
    .replace(
      '#include <common>',
      `#include <common>
attribute vec3 badgeCenter;
${BADGE_UNIFORMS}`,
    )
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
vec4 mvC = modelViewMatrix * vec4(badgeCenter, 1.0);
${BADGE_SCALE}transformed = badgeCenter + (transformed - badgeCenter) * k;
`,
    )
  if (!vertex.includes('float k =')) throw new Error('徽标数字顶点着色器没有接上屏幕尺寸')
  shader.vertexShader = vertex
}

/** 底板和色块共用。实例原点就是徽标中心，three 在 begin_vertex 之后才乘 instanceMatrix。 */
export function patchBadgePlateVertexShader(
  shader: { vertexShader: string; uniforms: Record<string, { value: unknown }> },
  viewportHeight: number,
) {
  assignBadgeScaleUniforms(shader, viewportHeight)
  const vertex = shader.vertexShader
    .replace(
      '#include <common>',
      `#include <common>
attribute vec3 badgeShift;
${BADGE_UNIFORMS}`,
    )
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
#ifdef USE_INSTANCING
transformed += badgeShift;
vec4 mvC = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
${BADGE_SCALE}transformed *= k;
#endif
`,
    )
  if (!vertex.includes('transformed *= k')) throw new Error('徽标底板顶点着色器没有接上屏幕尺寸')
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
