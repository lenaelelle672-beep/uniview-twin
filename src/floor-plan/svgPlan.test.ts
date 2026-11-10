import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  FLOOR_PLAN_SVG_MAX_SHAPES,
  FLOOR_PLAN_SVG_URL,
  fitFloorPlanSvg,
  inspectFloorPlanSvg,
  isLocalFloorPlanSvg,
  mapSvgPoint,
} from './svgPlan'

const here = dirname(fileURLToPath(import.meta.url))
const svg = readFileSync(join(here, '../../public/floor-plan/floor.svg'), 'utf8')

describe('平面图 SVG 门闩', () => {
  it('只认仓库里的本地路径', () => {
    expect(isLocalFloorPlanSvg(FLOOR_PLAN_SVG_URL)).toBe(true)
    expect(isLocalFloorPlanSvg('https://cdn.example/floor.svg')).toBe(false)
    expect(isLocalFloorPlanSvg('//cdn.example/floor.svg')).toBe(false)
    expect(isLocalFloorPlanSvg('/floor-plan/other.svg')).toBe(false)
    expect(FLOOR_PLAN_SVG_URL.startsWith('/')).toBe(true)
  })

  it('本地图纸只有直角矩形，面数有上限', () => {
    const inspection = inspectFloorPlanSvg(svg)
    expect(inspection.ok).toBe(true)
    expect(inspection.reason).toBe('on')
    expect(inspection.shapes).toBe(15)
    expect(inspection.shapes).toBeLessThanOrEqual(FLOOR_PLAN_SVG_MAX_SHAPES)
    expect(inspection.triangles).toBe(30)
    expect(svg).not.toMatch(/<circle|<path|<polygon|<image|<use|url\s*\(/i)
  })

  it('外链、曲线和过多矩形在解析前拒绝', () => {
    expect(inspectFloorPlanSvg('<svg xmlns="http://evil.test/a.svg"></svg>').reason).toBe('remote')
    expect(inspectFloorPlanSvg('<svg><rect fill="url(#paint)"/></svg>').reason).toBe('remote')
    expect(inspectFloorPlanSvg('<svg><image href="//cdn.example/a.png"/></svg>').reason).toBe('remote')
    expect(inspectFloorPlanSvg('<svg><circle cx="0" cy="0" r="1"/></svg>').reason).toBe('over-budget')
    expect(inspectFloorPlanSvg('<svg><path d="M0 0 C1 1 2 2 3 3"/></svg>').reason).toBe('over-budget')
    expect(inspectFloorPlanSvg('<svg><rect x="0" y="0" width="1" height="1" rx="2"/></svg>').reason).toBe('over-budget')
    const many = `<svg>${'<rect x="0" y="0" width="1" height="1"/>'.repeat(FLOOR_PLAN_SVG_MAX_SHAPES + 1)}</svg>`
    expect(inspectFloorPlanSvg(many).reason).toBe('over-budget')
    expect(inspectFloorPlanSvg('<div></div>').reason).toBe('empty')
    expect(inspectFloorPlanSvg('<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="1" height="1"/></svg>').ok).toBe(
      true,
    )
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
