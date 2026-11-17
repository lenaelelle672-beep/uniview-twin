import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  FLOOR_PLAN_SVG_BY_FLOOR,
  FLOOR_PLAN_SVG_MAX_SHAPES,
  FLOOR_PLAN_SVG_MAX_TRIANGLES,
  FLOOR_PLAN_SVG_URL,
  fitFloorPlanSvg,
  floorPlanSvgUrl,
  inspectFloorPlanSvg,
  isLocalFloorPlanSvg,
  mapSvgPoint,
} from './svgPlan'

const here = dirname(fileURLToPath(import.meta.url))
const svg = readFileSync(join(here, '../../public/floor-plan/floor.svg'), 'utf8')
const f01 = readFileSync(join(here, '../../public/floor-plan/F01.svg'), 'utf8')

describe('平面图 SVG 门闩', () => {
  it('只认仓库里的本地路径', () => {
    expect(isLocalFloorPlanSvg(FLOOR_PLAN_SVG_URL)).toBe(true)
    expect(isLocalFloorPlanSvg(FLOOR_PLAN_SVG_BY_FLOOR.F1)).toBe(true)
    expect(isLocalFloorPlanSvg(FLOOR_PLAN_SVG_BY_FLOOR.F01)).toBe(true)
    expect(isLocalFloorPlanSvg('https://cdn.example/floor.svg')).toBe(false)
    expect(isLocalFloorPlanSvg('//cdn.example/floor.svg')).toBe(false)
    expect(isLocalFloorPlanSvg('/floor-plan/other.svg')).toBe(false)
    expect(FLOOR_PLAN_SVG_URL.startsWith('/')).toBe(true)
    expect(FLOOR_PLAN_SVG_BY_FLOOR.F1.startsWith('/')).toBe(true)
  })

  it('按 floorId 换文件，无图纸的层走示意占位', () => {
    expect(floorPlanSvgUrl('F1')).toBe('/floor-plan/F01.svg')
    expect(floorPlanSvgUrl('F1')).not.toBe(FLOOR_PLAN_SVG_URL)
    expect(floorPlanSvgUrl('F01')).toBe('/floor-plan/F01.svg')
    expect(FLOOR_PLAN_SVG_URL).toBe('/floor-plan/floor.svg')
    for (const floorId of ['F2', 'F9', 'F02', 'F08', 'F09', 'F10', 'F11', 'F12', 'F13', 'F22', 'B1', '', undefined, null]) {
      expect(floorPlanSvgUrl(floorId), String(floorId)).toBe(FLOOR_PLAN_SVG_URL)
    }
    expect(Object.keys(FLOOR_PLAN_SVG_BY_FLOOR)).toEqual(['F1', 'F01'])
  })

  it('本地示意图纸只有直角矩形，面数有上限', () => {
    const inspection = inspectFloorPlanSvg(svg)
    expect(inspection.ok).toBe(true)
    expect(inspection.reason).toBe('on')
    expect(inspection.shapes).toBe(15)
    expect(inspection.shapes).toBeLessThanOrEqual(FLOOR_PLAN_SVG_MAX_SHAPES)
    expect(inspection.triangles).toBe(30)
    expect(inspection.triangles).toBeLessThanOrEqual(FLOOR_PLAN_SVG_MAX_TRIANGLES)
    expect(svg).not.toMatch(/<circle|<path|<polygon|<image|<use|url\s*\(/i)
  })

  it('F01 清洗图纸是本地闭合填充，对照 1F 主墙和核心筒', () => {
    const inspection = inspectFloorPlanSvg(f01)
    expect(inspection.ok).toBe(true)
    expect(inspection.reason).toBe('on')
    expect(inspection.shapes).toBe(241)
    expect(inspection.triangles).toBe(527)
    expect(inspection.shapes).toBeLessThanOrEqual(FLOOR_PLAN_SVG_MAX_SHAPES)
    expect(inspection.triangles).toBeLessThanOrEqual(FLOOR_PLAN_SVG_MAX_TRIANGLES)
    expect(f01).toMatch(/<polygon\b/)
    expect(f01).toMatch(/<rect\b/)
    expect(f01).not.toMatch(/<circle|<path|<image|<use|<text|url\s*\(/i)
    expect(f01).not.toMatch(/jsdelivr|unpkg|githack/)
    expect(f01).not.toMatch(/\.pdf|\.png|\.jpe?g|photos\/|drawings\//i)
    const foreign = f01.match(/https?:\/\/[^\s"'<>]+/g) ?? []
    expect(foreign.every((url) => url === 'http://www.w3.org/2000/svg')).toBe(true)
  })

  it('外链、曲线和过多矩形在解析前拒绝', () => {
    expect(inspectFloorPlanSvg('<svg xmlns="http://evil.test/a.svg"></svg>').reason).toBe('remote')
    expect(inspectFloorPlanSvg('<svg><rect fill="url(#paint)"/></svg>').reason).toBe('remote')
    expect(inspectFloorPlanSvg('<svg><image href="//cdn.example/a.png"/></svg>').reason).toBe('remote')
    expect(inspectFloorPlanSvg('<svg><circle cx="0" cy="0" r="1"/></svg>').reason).toBe('over-budget')
    expect(inspectFloorPlanSvg('<svg><path d="M0 0 C1 1 2 2 3 3"/></svg>').reason).toBe('over-budget')
    expect(inspectFloorPlanSvg('<svg><rect x="0" y="0" width="1" height="1" rx="2"/></svg>').reason).toBe('over-budget')
    expect(inspectFloorPlanSvg('<svg><polygon points="0 0 1 0"/></svg>').reason).toBe('over-budget')
    const many = `<svg>${'<rect x="0" y="0" width="1" height="1"/>'.repeat(FLOOR_PLAN_SVG_MAX_SHAPES + 1)}</svg>`
    expect(inspectFloorPlanSvg(many).reason).toBe('over-budget')
    expect(inspectFloorPlanSvg('<div></div>').reason).toBe('empty')
    expect(inspectFloorPlanSvg('<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="1" height="1"/></svg>').ok).toBe(
      true,
    )
    expect(
      inspectFloorPlanSvg('<svg xmlns="http://www.w3.org/2000/svg"><polygon points="0,0 2,0 2,1 0,1"/></svg>').ok,
    ).toBe(true)
  })

  it('翻转后的图纸北缘贴上楼板北缘', () => {
    const plate = { minX: 10, maxX: 110, minY: 2, maxY: 3, minZ: -20, maxZ: 44 }
    const content = { minX: 0, maxX: 100, minY: -64, maxY: 0 }
    const fit = fitFloorPlanSvg(content, plate)
    expect(fit).not.toBeNull()
    expect(fit?.rotationX).toBeCloseTo(-Math.PI / 2)
    const north = mapSvgPoint(fit!, 0, 0)
    const south = mapSvgPoint(fit!, 0, -64)
    const east = mapSvgPoint(fit!, 100, 0)
    expect(north.x).toBeCloseTo(plate.minX)
    expect(north.z).toBeCloseTo(plate.minZ)
    expect(north.y).toBeCloseTo(plate.maxY + 0.04)
    expect(south.z).toBeCloseTo(plate.maxZ)
    expect(south.x).toBeCloseTo(plate.minX)
    expect(east.x).toBeCloseTo(plate.maxX)
    expect(east.z).toBeCloseTo(plate.minZ)
    expect(fitFloorPlanSvg(content, { ...plate, maxX: 10 })).toBeNull()
    expect(fitFloorPlanSvg({ ...content, maxY: Number.NaN }, plate)).toBeNull()
  })
})
