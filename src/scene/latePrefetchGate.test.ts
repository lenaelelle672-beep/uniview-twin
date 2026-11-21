import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))

function read(relative: string) {
  return readFileSync(join(here, relative), 'utf8')
}

describe('D1489 late chunks wait for firstPrefetch mark', () => {
  const files = [
    '../components/scene/EastGrille.tsx',
    '../components/scene/Tower.tsx',
    '../components/scene/EastBlock.tsx',
  ] as const

  it('三个既有晚载块都要见到 __twinPrefetchAt 才起请求，且不静态导入 prefetch 模块', () => {
    for (const file of files) {
      const src = read(file)
      expect(src, file).toMatch(/window\.__twinPrefetchAt != null/)
      expect(src, file).not.toMatch(/from ['"][^'"]*prefetchLazyChunks/)
      expect(src, file).not.toMatch(/import\(['"][^'"]*prefetchLazyChunks/)
    }
  })

  it('EastUpperGrilleFins / RoofSign / SouthEntrance 仍是到点才动态 import，不是模块顶预拉', () => {
    const grille = read('../components/scene/EastGrille.tsx')
    expect(grille).toMatch(/due && window\.__twinPrefetchAt != null/)
    expect(grille).toMatch(/import\('\.\/EastUpperGrilleFins'\)/)
    expect(grille).not.toMatch(/const \w+ = import\('\.\/EastUpperGrilleFins'\)/)

    const tower = read('../components/scene/Tower.tsx')
    expect(tower).toMatch(/SOFT_SHADOW_CHUNK_AFTER_FIRST_MS &&/)
    expect(tower).toMatch(/window\.__twinPrefetchAt != null/)
    expect(tower).toMatch(/lazy\(\(\) => import\('\.\/RoofSign'\)/)
    expect(tower).not.toMatch(/from '\.\/RoofSign'/)

    const east = read('../components/scene/EastBlock.tsx')
    expect(east).toMatch(/SOUTH_ENTRANCE_AFTER_FIRST_MS &&/)
    expect(east).toMatch(/window\.__twinPrefetchAt != null/)
    expect(east).toMatch(/lazy\(\(\) => import\('\.\/SouthEntrance'\)\)/)
    expect(east).not.toMatch(/from '\.\/SouthEntrance'/)
    expect(east).toMatch(/SOUTH_FACADE_AFTER_FIRST_MS &&/)
    expect(east).toMatch(/lazy\(\(\) => import\('\.\/EastSouthFacadeFins'\)\)/)
    expect(east).not.toMatch(/from '\.\/EastSouthFacadeFins'/)
    expect(east).not.toMatch(/const \w+ = import\('\.\/EastSouthFacadeFins'\)/)
    expect(east).toMatch(/<LateEastSouthFacadeFins \/>/)
  })
})
