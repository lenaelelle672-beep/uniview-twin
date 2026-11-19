import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { EAST_CANTILEVER_M } from './massing'
import { finsAlong } from './massing'
import { EAST_FACE_X } from './shell/rings'
import { preloadEastGrilleForQuality } from './eastGrilleAssets'
import {
  EAST_FACADE_BANDS_AFTER_FIRST_MS,
  EAST_FACADE_CAP_BOTTOM_M,
  EAST_FACADE_FIN_BOTTOM_M,
  EAST_FACADE_FIN_DEPTH_M,
  EAST_FACADE_FIN_SPACING_M,
  EAST_FACADE_MID_BOTTOM_M,
  EAST_FACADE_MID_TOP_M,
  EAST_GRILLE_SHEET_MAX_X,
  eastFacadeBandsChunkDue,
  eastFacadeBandsDueLatched,
  eastFacadeBandPoses,
  eastFacadeInward,
  eastFacadeLine,
} from './eastFacadeBands'

const root = dirname(fileURLToPath(import.meta.url))

function read(relative: string) {
  return readFileSync(join(root, relative), 'utf8')
}

describe('T140 东立面格栅分层', () => {
  it('中段与上段高度沿用 D076，不新编楼层平面', () => {
    expect(EAST_FACADE_MID_BOTTOM_M).toBe(19.9)
    expect(EAST_FACADE_MID_TOP_M).toBe(28.7)
    expect(EAST_FACADE_FIN_BOTTOM_M).toBe(29.1)
    expect(EAST_FACADE_CAP_BOTTOM_M).toBe(45.2)
    expect(EAST_FACADE_MID_TOP_M).toBeLessThan(EAST_FACADE_FIN_BOTTOM_M)
  })

  it('上段 FinRow 间距严于 lo 格栅开间，且只铺在 FIN_BOTTOM 以上', () => {
    expect(EAST_FACADE_FIN_SPACING_M).toBe(1)
    expect(EAST_FACADE_FIN_SPACING_M).toBeLessThan(102.26 / 38)
    const fins = finsAlong(eastFacadeLine(), EAST_FACADE_FIN_SPACING_M, eastFacadeInward(), EAST_FACADE_FIN_DEPTH_M * 0.45)
    expect(fins.length).toBeGreaterThan(80)
    expect(fins.length).toBeLessThan(120)
    expect(fins.every((fin) => fin.x > EAST_FACE_X)).toBe(true)
    const finsSrc = read('../components/scene/EastUpperGrilleFins.tsx')
    expect(finsSrc).toMatch(/import \{ FinRow \} from '\.\/Fins'/)
    expect(finsSrc).toMatch(/spacing=\{EAST_FACADE_FIN_SPACING_M\}/)
    expect(finsSrc).toMatch(/EAST_FACADE_FIN_BOTTOM_M/)
    expect(finsSrc).not.toMatch(/three-fenestra/)
    const mount = read('../components/scene/EastGrille.tsx')
    expect(mount).not.toMatch(/from '\.\/Fins'/)
    expect(mount).not.toMatch(/function EastUpperGrilleFins/)
    expect(mount).not.toMatch(/from '\.\/EastUpperGrilleFins'/)
    expect(mount).not.toMatch(/three-fenestra/)
  })

  it('密肋在 __twinReady + 首帧 + 2600ms 之后才挂，不进 hardGate', () => {
    expect(EAST_FACADE_BANDS_AFTER_FIRST_MS).toBe(2600)
    expect(eastFacadeBandsChunkDue(undefined, 2600)).toBe(false)
    expect(eastFacadeBandsDueLatched(false, false, 0, 2600)).toBe(false)
    expect(eastFacadeBandsDueLatched(false, true, 0, 2599)).toBe(false)
    expect(eastFacadeBandsDueLatched(false, true, 0, 2600)).toBe(true)
    expect(eastFacadeBandsDueLatched(true, false, undefined, 0)).toBe(true)
    const mount = read('../components/scene/EastGrille.tsx')
    expect(mount).toMatch(/eastFacadeBandsDueLatched/)
    expect(mount).toMatch(/__twinReady === true/)
    expect(mount).toMatch(/__twinFirstFrameAt/)
    expect(mount).toMatch(/due && window\.__twinPrefetchAt != null/)
    expect(mount).not.toMatch(/from ['\"][^'\"]*prefetchLazyChunks/)
    expect(mount).toMatch(/import\('\.\/EastUpperGrilleFins'\)/)
    expect(mount).not.toMatch(/const \w+ = import\('\.\/EastUpperGrilleFins'\)/)
    expect(mount).not.toMatch(/from '@react-three\/drei'/)
    const east = read('../components/scene/EastBlock.tsx')
    expect(east).not.toMatch(/EastUpperGrilleFins/)
    expect(east).toMatch(/const eastGrilleImport = import\('\.\/EastGrille'\)/)
  })

  it('lo 预加载策略与 T136 一致：三档首次只预取 lo，性能档不预取 hi', () => {
    const assets = read('./eastGrilleAssets.ts')
    expect(assets).toMatch(/useLoader\.preload\(GLTFLoader, EAST_GRILLE_LO/)
    expect(assets).toMatch(/if \(quality === 'perf'\) return/)
    expect(assets).toMatch(/export function preloadEastGrilleHi/)
    const preload = preloadEastGrilleForQuality.toString()
    expect(preload).toMatch(/EAST_GRILLE_LO/)
    expect(preload).not.toMatch(/EAST_GRILLE_HI/)
    const grille = read('../components/scene/EastGrille.tsx')
    expect(grille).toMatch(/preloadEastGrilleHi\(\)/)
    expect(grille).toMatch(/quality === 'perf' \? <GrilleModel url=\{EAST_GRILLE_LO\}/)
  })

  it('后衬玻璃分层：中段更退、上段贴皮，石材基座与悬挑常数保持不变', () => {
    const poses = eastFacadeBandPoses()
    expect(poses.mid.size[1]).toBeCloseTo(EAST_FACADE_MID_TOP_M - EAST_FACADE_MID_BOTTOM_M, 5)
    expect(poses.upper.size[1]).toBeCloseTo(EAST_FACADE_CAP_BOTTOM_M - EAST_FACADE_FIN_BOTTOM_M, 5)
    expect(poses.mid.position[0]).toBeLessThan(poses.upper.position[0])
    expect(poses.beam.size[1]).toBeCloseTo(0.4, 5)
    expect(poses.sill.size[1]).toBeCloseTo(0.3, 5)
    expect(EAST_CANTILEVER_M).toBe(4)
    expect(EAST_GRILLE_SHEET_MAX_X).toBeCloseTo(EAST_FACE_X + 0.08, 5)
    const east = read('../components/scene/EastBlock.tsx')
    expect(east).toMatch(/EastFacadeGlass/)
    expect(east).toMatch(/EastFacadeBandFrames/)
    expect(east).toMatch(/eastFacadeGlassMaterial/)
    expect(east).toMatch(/model \? solidMaterial : stoneMaterial/)
    expect(east).toMatch(/!model && <EastGrille/)
    expect(east).not.toMatch(/EAST_CANTILEVER_M\s*=/)
    expect(east).not.toMatch(/three-fenestra/)
    expect(east).not.toMatch(/transmission|SSGI|pathtracer|MeshReflector/)
  })

  it('格栅材质丢掉贴墙薄片，给中段让出更透的后衬', () => {
    const mount = read('../components/scene/EastGrille.tsx')
    expect(mount).toMatch(/installSheetDiscard/)
    expect(mount).toMatch(/vTwinPos\.x </)
    expect(mount).toMatch(/discard;/)
    expect(mount).toMatch(/twin-east-grille-t140-sheet/)
  })
})
