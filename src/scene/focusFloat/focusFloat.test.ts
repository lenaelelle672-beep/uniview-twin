import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const srcRoot = join(here, '../..')

function read(path: string): string {
  return readFileSync(path, 'utf8')
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (/\.(ts|tsx|css)$/.test(name)) out.push(path)
  }
  return out
}

describe('聚焦浮动卡懒加载并且只有一枚 Html', () => {
  const card = read(join(here, 'FocusFloatCard.tsx'))
  const host = read(join(here, 'FocusFloatHost.tsx'))
  const loop = read(join(srcRoot, 'components/scene/DemandLoop.tsx'))
  const scene = read(join(srcRoot, 'components/Scene.tsx'))
  const stage = read(join(srcRoot, 'components/Stage.tsx'))
  const app = read(join(srcRoot, 'App.tsx'))
  const css = read(join(srcRoot, 'index.css'))
  const pkg = read(join(srcRoot, '../package.json'))
  const tool = read(join(srcRoot, 'measure/MeasureTool.tsx'))
  const detail = read(join(srcRoot, 'components/FocusedAlarmDetail.tsx'))
  const panel = read(join(srcRoot, 'components/DetailPanel.tsx'))
  const fx = read(join(srcRoot, 'components/scene/postfx/balancedFx.tsx'))
  const prefetch = read(join(srcRoot, 'scene/stage/prefetchLazyChunks.ts'))

  it('卡片懒加载，主包和测距不静态引用它', () => {
    expect(host).toMatch(/import\('\.\/FocusFloatCard'\)/)
    expect(host).not.toMatch(/from '\.\/FocusFloatCard'/)
    expect(host).toMatch(/FOCUS_FLOAT_AFTER_FIRST_MS = 2600/)
    expect(host).not.toMatch(/@react-three\/drei/)
    expect(host).not.toMatch(/<BBAnchor|core\/BBAnchor/)
    expect(loop).toMatch(/FocusFloatHost/)
    expect(loop).not.toMatch(/FocusFloatCard|@react-three\/drei\/web\/Html|BBAnchor/)
    expect(scene).not.toMatch(/focusFloat|FocusFloat|BBAnchor/)
    expect(stage).not.toMatch(/focusFloat|FocusFloat|BBAnchor/)
    expect(app).not.toMatch(/focusFloat|FocusFloat|BBAnchor/)
    expect(prefetch).not.toMatch(/focusFloat|FocusFloat|BBAnchor/)
    expect(fx).not.toMatch(/focusFloat|FocusFloat|BBAnchor/)
    expect(css).not.toMatch(/focus-float/)
    expect(pkg).not.toMatch(/"dependencies"[\s\S]*focus-float/)
    expect(tool).not.toMatch(/focusFloat|FocusFloat|focus-float/)
    expect(card).not.toMatch(/MeasureTool|measure-label|measurePick|measure\/boot/)
  })

  it('只用一枚 Html，并且不打开 occlude', () => {
    expect(card.match(/<Html/g)).toHaveLength(1)
    expect(card.match(/<BBAnchor/g)).toHaveLength(1)
    expect(card).not.toMatch(/occlude\s*=/)
    expect(card).not.toMatch(/from '@react-three\/drei'/)
    expect(card).toMatch(/@react-three\/drei\/web\/Html/)
    expect(card).toMatch(/@react-three\/drei\/core\/BBAnchor/)
    expect(card).toMatch(/anchor=\{FOCUS_FLOAT_CORNER\}/)
    expect(card).toMatch(/position=\{box\.center\}/)
    expect(card).toMatch(/position=\{corner\}/)
    expect(card).toMatch(/focusFloatCornerLocal/)
    expect(card).toMatch(/visible=\{false\}/)
    expect(card).toMatch(/focusFloatExplodeShift/)
    expect(card).toMatch(/buildFocusDetail/)
    expect(card).toMatch(/pointerEvents="none"/)
    const htmlFiles = walk(srcRoot).filter(
      (path) => !/\.test\.tsx?$/.test(path) && /<Html[\s>]/.test(read(path)),
    )
    expect(htmlFiles.map((path) => path.slice(srcRoot.length + 1)).sort()).toEqual([
      'measure/MeasureTool.tsx',
      'scene/focusFloat/FocusFloatCard.tsx',
    ])
  })

  it('侧栏详情还在，浮动卡不是把它换掉', () => {
    expect(panel).toMatch(/FocusedAlarmDetail/)
    expect(detail).toMatch(/buildFocusDetail/)
    expect(detail).not.toMatch(/focusFloat|Html/)
    expect(card).not.toMatch(/FocusedAlarmDetail/)
  })
})
