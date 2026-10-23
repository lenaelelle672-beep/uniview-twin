import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { floorSpec } from '../data/floors'
import { USER_CAMERA_SMOOTH_TIME } from '../scene/stage/cameraTransition'
import { CONTACT_SHADOW_Y } from '../scene/shellVersion'
import { SLAB_M } from '../scene/stage/cut'
import { FOG_DENSITY } from '../scene/fog'
import { discoverGridBindings } from './bindings'
import { mountGridAxes } from './mount'
import {
  acceptsGridKey,
  AXIS_LIFT_M,
  FLOOR_CLEAR_M,
  GRID_AXIS_M,
  GRID_CELL_M,
  GRID_SECTION_M,
  GROUND_CLEAR_M,
  OVERVIEW_AXES_X,
  OVERVIEW_AXES_Z,
  gridPlane,
} from './metrics'
import { GRID_SOURCE_BLOCK } from '../../scripts/gridAxesPlugin'

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

describe('格网高度', () => {
  it('总览在接触阴影之上，进层在楼板之上，蓝图不挂', () => {
    const day = { dayNight: 'day' as const, presentation: 'lit' as const }
    const overview = gridPlane({ view: 'building', floorId: null, ...day })
    expect(overview?.y).toBeCloseTo(CONTACT_SHADOW_Y + GROUND_CLEAR_M, 5)
    expect(overview?.y).toBeGreaterThan(0.22)
    expect(overview?.fadeDistance).toBeGreaterThan(400)
    expect(overview?.axesX).toBe(OVERVIEW_AXES_X)
    expect(overview?.axesZ).toBe(OVERVIEW_AXES_Z)
    expect(overview?.cellColor).not.toBe(overview?.sectionColor)

    const f1 = gridPlane({ view: 'floor', floorId: 'F1', ...day })
    expect(f1?.y).toBeCloseTo(floorSpec('F1').elevation + SLAB_M + FLOOR_CLEAR_M, 5)
    expect(f1?.axesX).toBe(0)
    expect(f1?.axesZ).toBe(0)
    const f12 = gridPlane({ view: 'floor', floorId: 'F12', ...day })
    expect(f12?.y).toBeCloseTo(floorSpec('F12').elevation + SLAB_M + FLOOR_CLEAR_M, 5)
    expect(f12!.y).toBeGreaterThan(f1!.y)

    const basement = gridPlane({ view: 'floor', floorId: 'B1', ...day })
    expect(basement!.y).toBeLessThan(0)
    expect(basement?.y).toBeCloseTo(floorSpec('B1').elevation + SLAB_M + FLOOR_CLEAR_M, 5)

    expect(gridPlane({ view: 'floor', floorId: null, ...day })).toBeNull()
    expect(gridPlane({ view: 'floor', floorId: 'F99', ...day })).toBeNull()
    expect(gridPlane({ view: 'blueprint', floorId: 'F3', ...day })).toBeNull()

    const night = gridPlane({ view: 'building', floorId: null, dayNight: 'night', presentation: 'lit' })
    const model = gridPlane({ view: 'building', floorId: null, dayNight: 'day', presentation: 'model' })
    expect(night?.cellColor).toBe(model?.cellColor)
    expect(night?.cellColor).not.toBe(overview?.cellColor)
    expect(night?.y).toBe(overview?.y)
  })
})

describe('快捷键 G', () => {
  it('输入框和组合键不切换', () => {
    expect(acceptsGridKey({ key: 'g' })).toBe(true)
    expect(acceptsGridKey({ key: 'G' })).toBe(true)
    expect(acceptsGridKey({ key: 'g', repeat: true })).toBe(false)
    expect(acceptsGridKey({ key: 'g', metaKey: true })).toBe(false)
    expect(acceptsGridKey({ key: 'g', ctrlKey: true })).toBe(false)
    expect(acceptsGridKey({ key: 'g', altKey: true })).toBe(false)
    expect(acceptsGridKey({ key: 'g', isComposing: true })).toBe(false)
    expect(acceptsGridKey({ key: '?' })).toBe(false)
    expect(acceptsGridKey({ key: 'g', target: { tagName: 'INPUT' } })).toBe(false)
    expect(acceptsGridKey({ key: 'g', target: { tagName: 'TEXTAREA' } })).toBe(false)
    expect(acceptsGridKey({ key: 'g', target: { tagName: 'DIV', isContentEditable: true } })).toBe(false)
    expect(acceptsGridKey({ key: 'g', target: { tagName: 'BUTTON' } })).toBe(true)
  })
})

describe('格网分包', () => {
  it('没有文档时挂载直接返回', () => {
    expect(() => mountGridAxes()).not.toThrow()
  })

  it('懒挂在 dock 哈希之后，不进首屏，不改雾和 T032', () => {
    expect(USER_CAMERA_SMOOTH_TIME).toBe(0.42)
    expect(FOG_DENSITY.day).toBe(0.00112)
    expect(FOG_DENSITY.night).toBe(0.00096)
    expect(GRID_CELL_M).toBe(1)
    expect(GRID_SECTION_M).toBe(10)
    expect(GRID_AXIS_M).toBe(20)
    expect(AXIS_LIFT_M).toBeGreaterThan(0)
    expect(GROUND_CLEAR_M).toBeGreaterThan(0)

    const dock = read('../viewmarks/dock.tsx')
    const mount = read('./mount.ts')
    const axes = read('./GridAxes.tsx')
    const plugin = read('../../scripts/gridAxesPlugin.ts')
    const viteConfig = read('../../vite.config.ts')
    const pkg = JSON.parse(read('../../package.json')) as { dependencies: Record<string, string> }

    expect(dock).toContain(GRID_SOURCE_BLOCK.trimEnd())
    expect(dock).toMatch(/import\('\.\.\/grid\/mount'\)/)
    expect(dock).toMatch(/mountGridAxes\(\)/)
    expect(dock).not.toMatch(/from '\.\.\/grid\/mount'/)
    expect(plugin).toContain(GRID_SOURCE_BLOCK)
    expect(plugin).toMatch(/apply: 'build'/)
    expect(plugin).toMatch(/assets\/GridAxes\.js/)
    expect(plugin).toMatch(/assets\/GridMount\.js/)
    expect(viteConfig).toMatch(/gridAxesAfterHash/)
    expect(mount).toMatch(/import\('\.\/GridAxes'\)/)
    expect(mount).toMatch(/import type \{ GridAxesProps \} from '\.\/GridAxes'/)
    expect(mount).not.toMatch(/import \{ GridAxes \} from '\.\/GridAxes'/)
    expect(mount).not.toMatch(/@react-three|from 'three'/)
    expect(axes).toMatch(/@react-three\/drei\/core\/Grid/)
    expect(axes).not.toMatch(/from '@react-three\/drei'/)
    expect(axes).toMatch(/<Grid/)
    expect(axes).toMatch(/<axesHelper[\s\S]*args=\{\[GRID_AXIS_M\]\}/)
    expect(axes).toMatch(/position=\{\[axesX, AXIS_LIFT_M, axesZ\]\}/)
    expect(axes).toMatch(/ignorePick/)
    expect(axes).toMatch(/depthWrite = false/)
    expect(axes).not.toMatch(/new AxesHelper|new Grid\(/)
    expect(axes).not.toMatch(/useFrame/)

    const eager = [
      '../components/Scene.tsx',
      '../components/Stage.tsx',
      '../App.tsx',
      '../main.tsx',
      '../index.css',
      '../components/scene/postfx/balancedFx.tsx',
      '../components/scene/DemandLoop.tsx',
      '../components/scene/CameraRig.tsx',
      '../scene/stage/prefetchLazyChunks.ts',
      '../scene/fog.ts',
      '../scene/stage/cameraTransition.ts',
      '../scene/softShadows.ts',
      '../store/viewSlice.ts',
      '../gizmo/OrientationGizmo.tsx',
      '../viewmarks/LayerPanel.tsx',
    ]
    for (const file of eager) {
      expect(read(file)).not.toMatch(/GridAxes|mountGridAxes|grid\/mount|gridMaterial/)
    }

    expect(pkg.dependencies['@react-three/drei']).toBe('10.7.9')
    expect(pkg.dependencies.three).toBe('0.186.1')
    expect(pkg.dependencies['@react-three/fiber']).toBe('9.8.1')
    expect(Object.keys(pkg.dependencies).sort()).toEqual(
      [
        '@react-three/drei',
        '@react-three/fiber',
        '@react-three/postprocessing',
        'postprocessing',
        'react',
        'react-dom',
        'three',
        'troika-three-text',
        'troika-three-utils',
        'troika-worker-utils',
        'zustand',
      ].sort(),
    )
  })
})

describe('入口包绑定', () => {
  it('从命名空间和 extend 认出同一份 three / fiber', () => {
    const index = `
      function vI(i){if(M7(i)){const e=\`\${S7++}\`;return fg[e]=i,e}else Object.assign(fg,i)}
      const H9=Object.freeze(Object.defineProperty({__proto__:null,Color:ot,Vector3:j,Plane:xc,ShaderMaterial:eo,MathUtils:ZT,BackSide:rr,DoubleSide:Yr,REVISION:kS,Uniform:ww,UniformsUtils:CL,AxesHelper:z4},Symbol.toStringTag,{value:"Module"}))
      export{ot as ar,j as V,xc as c9,eo as ak,ZT as bW,rr as aN,Yr as A,kS as aY,ww as aQ,CL as bV,vI as ba,te as r,X as j,Pe as a,v as v,w as w}
    `
    const dock = `
      import{r as l,j as jsx,a as E,v as P,w as ie}from"./index-AbCdEfG.js";
      l.useState(false);l.lazy(()=>null);jsx.jsx("a",{});jsx.jsxs("b",{});E.getState();
    `
    const loop = `
      import{v as P,w as ie,r as s}from"./index-AbCdEfG.js";
      function Q(){const e=P(r=>r.invalidate);ie(({clock:r,scene:f})=>{});}
    `
    const found = discoverGridBindings(index, dock, loop)
    expect(found.indexFile).toBe('index-AbCdEfG.js')
    expect(found.react).toBe('r')
    expect(found.jsx).toBe('j')
    expect(found.store).toBe('a')
    expect(found.useThree).toBe('v')
    expect(found.useFrame).toBe('w')
    expect(found.extend).toBe('ba')
    expect(found.three).toEqual({
      Color: 'ar',
      Vector3: 'V',
      Plane: 'c9',
      ShaderMaterial: 'ak',
      MathUtils: 'bW',
      BackSide: 'aN',
      DoubleSide: 'A',
      REVISION: 'aY',
      Uniform: 'aQ',
      UniformsUtils: 'bV',
    })
  })
})
