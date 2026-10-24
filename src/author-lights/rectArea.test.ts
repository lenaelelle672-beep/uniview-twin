import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Color, Object3D, Scene, UniformsLib } from 'three'
import { USER_CAMERA_SMOOTH_TIME } from '../scene/stage/cameraTransition'
import { FOG_DENSITY } from '../scene/fog'
import { demoEditRequested } from '../demo-edit/flag'
import {
  RECT_AREA_CAP,
  RECT_AREA_PRESETS,
  acceptsRectAreaKey,
  cappedRectAreas,
} from './plan'
import { attachRectAreaLights, ensureRectAreaUniforms } from './live'
import { mountRectAreaLights } from './mount'
import {
  RECT_AREA_DOCK_BOOT,
  RECT_AREA_SHARED_KEYS,
  RECT_AREA_SOURCE_BLOCK,
  discoverRectAreaShared,
} from '../../scripts/rectAreaPlugin'

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

describe('面光盏数', () => {
  it('默认三盏，超出上限的 spare 被切掉', () => {
    expect(RECT_AREA_CAP).toBe(3)
    expect(RECT_AREA_PRESETS).toHaveLength(4)
    expect(RECT_AREA_PRESETS.map((spec) => spec.id)).toEqual(['overhead', 'east-fill', 'north-rim', 'spare'])
    const on = cappedRectAreas()
    expect(on.map((spec) => spec.id)).toEqual(['overhead', 'east-fill', 'north-rim'])
    expect(cappedRectAreas(99).map((spec) => spec.id)).toEqual(on.map((spec) => spec.id))
    expect(cappedRectAreas(1)).toHaveLength(1)
    expect(cappedRectAreas(2.9)).toHaveLength(2)
    expect(cappedRectAreas(0)).toEqual([])
    expect(cappedRectAreas(-4)).toEqual([])
    expect(cappedRectAreas(Number.NaN)).toEqual([])
    for (const spec of RECT_AREA_PRESETS) {
      expect(spec.width).toBeGreaterThan(0)
      expect(spec.height).toBeGreaterThan(0)
      expect(spec.intensity).toBeGreaterThan(0)
      expect(spec.position).not.toEqual(spec.target)
    }
  })

  it('快捷键 L 不吃输入框和组合键', () => {
    expect(acceptsRectAreaKey({ key: 'l' })).toBe(true)
    expect(acceptsRectAreaKey({ key: 'L' })).toBe(true)
    expect(acceptsRectAreaKey({ key: 'g' })).toBe(false)
    expect(acceptsRectAreaKey({ key: 'l', repeat: true })).toBe(false)
    expect(acceptsRectAreaKey({ key: 'l', metaKey: true })).toBe(false)
    expect(acceptsRectAreaKey({ key: 'l', ctrlKey: true })).toBe(false)
    expect(acceptsRectAreaKey({ key: 'l', altKey: true })).toBe(false)
    expect(acceptsRectAreaKey({ key: 'l', isComposing: true })).toBe(false)
    expect(acceptsRectAreaKey({ key: 'l', target: { tagName: 'INPUT' } })).toBe(false)
    expect(acceptsRectAreaKey({ key: 'l', target: { tagName: 'TEXTAREA' } })).toBe(false)
    expect(acceptsRectAreaKey({ key: 'l', target: { tagName: 'SELECT' } })).toBe(false)
    expect(acceptsRectAreaKey({ key: 'l', target: { tagName: 'DIV', isContentEditable: true } })).toBe(false)
    expect(acceptsRectAreaKey({ key: 'l', target: { tagName: 'BUTTON' } })).toBe(true)
  })
})

describe('UniformsLib.init', () => {
  it('先 init 再挂灯，辅助体是子节点，盏数不超过上限', () => {
    const lib = UniformsLib as unknown as {
      LTC_FLOAT_1?: { image?: { width?: number }; isDataTexture?: boolean }
      LTC_FLOAT_2?: unknown
      LTC_HALF_1?: unknown
      LTC_HALF_2?: unknown
    }
    ensureRectAreaUniforms()
    const float1 = lib.LTC_FLOAT_1
    const float2 = lib.LTC_FLOAT_2
    const half1 = lib.LTC_HALF_1
    const half2 = lib.LTC_HALF_2
    expect(float1?.isDataTexture).toBe(true)
    expect(float1?.image?.width).toBe(64)
    expect(float2).toBeTruthy()
    expect(half1).toBeTruthy()
    expect(half2).toBeTruthy()
    ensureRectAreaUniforms()
    expect(lib.LTC_FLOAT_1).toBe(float1)
    expect(lib.LTC_FLOAT_2).toBe(float2)

    const scene = new Scene()
    const extra = {
      id: 'extra',
      color: '#ffffff',
      intensity: 1,
      width: 2,
      height: 2,
      position: [1, 2, 3] as [number, number, number],
      target: [0, 0, 0] as [number, number, number],
    }
    const handle = attachRectAreaLights(scene, [...cappedRectAreas(), extra])
    expect(handle.init).toBe(true)
    expect(handle.cap).toBe(RECT_AREA_CAP)
    expect(handle.count).toBe(RECT_AREA_CAP)
    expect(handle.ids).toEqual(['overhead', 'east-fill', 'north-rim'])
    expect(scene.children.filter((child) => child.name.startsWith('AuthorRectArea.'))).toHaveLength(RECT_AREA_CAP)

    const overhead = scene.getObjectByName('AuthorRectArea.overhead')
    expect(overhead).toBeTruthy()
    expect((overhead as { isRectAreaLight?: boolean }).isRectAreaLight).toBe(true)
    expect((overhead as { width?: number }).width).toBe(24)
    expect((overhead as { height?: number }).height).toBe(14)
    expect((overhead as { castShadow?: boolean }).castShadow).toBe(false)
    const helper = overhead?.children[0]
    expect(helper?.name).toBe('AuthorRectAreaHelper.overhead')
    expect(helper?.type).toBe('RectAreaLightHelper')
    expect(helper?.parent).toBe(overhead)
    const color = new Color('#fff1d6')
    expect((overhead as unknown as { color: Color }).color.equals(color)).toBe(true)

    handle.detach()
    expect(scene.getObjectByName('AuthorRectArea.overhead')).toBeUndefined()
    expect(scene.children.filter((child) => child.name.startsWith('AuthorRectArea.'))).toHaveLength(0)

    const empty = attachRectAreaLights(new Object3D(), [])
    expect(empty.count).toBe(0)
    empty.detach()
  })
})

describe('面光分包', () => {
  it('没有文档时挂载直接返回', () => {
    expect(() => mountRectAreaLights()).not.toThrow()
  })

  it('懒挂在 dock 哈希之后，默认关，不进首屏，不改雾和 T032', () => {
    expect(USER_CAMERA_SMOOTH_TIME).toBe(0.42)
    expect(FOG_DENSITY.day).toBe(0.00112)
    expect(FOG_DENSITY.night).toBe(0.00096)
    expect(demoEditRequested('?demoEdit=1')).toBe(true)
    expect(demoEditRequested('?demoEdit=10')).toBe(false)

    const dock = read('../viewmarks/dock.tsx')
    const mount = read('./mount.ts')
    const live = read('./live.ts')
    const plan = read('./plan.ts')
    const leaves = read('./threeLeaves.ts')
    const plugin = read('../../scripts/rectAreaPlugin.ts')
    const viteConfig = read('../../vite.config.ts')
    const transition = read('../scene/stage/cameraTransition.ts')
    const pkg = JSON.parse(read('../../package.json')) as { dependencies: Record<string, string> }

    expect(dock).toContain(RECT_AREA_SOURCE_BLOCK)
    expect(dock.replace(RECT_AREA_SOURCE_BLOCK, '')).toMatch(/mountAuthorHelpers\(\)\n\}\)\n\nconst LayerPanel/)
    expect(dock.replace(RECT_AREA_SOURCE_BLOCK, '')).not.toMatch(/author-lights|RectArea|mountRectAreaLights/)
    expect(dock.indexOf('demoEdit')).toBe(-1)
    expect(RECT_AREA_DOCK_BOOT.indexOf('demoEdit")==="1"')).toBeLessThan(RECT_AREA_DOCK_BOOT.indexOf('import("./RectAreaMount.js")'))
    expect(RECT_AREA_DOCK_BOOT).toMatch(/get\("demoEdit"\)==="1"/)
    expect(RECT_AREA_DOCK_BOOT).toMatch(/mountRectAreaLights\(\)/)
    expect(plugin).toContain(RECT_AREA_SOURCE_BLOCK)
    expect(plugin).toContain(RECT_AREA_DOCK_BOOT)
    expect(plugin).toMatch(/apply: 'build'/)
    expect(plugin).toMatch(/assets\/RectAreaLive\.js/)
    expect(plugin).toMatch(/assets\/RectAreaMount\.js/)
    expect(viteConfig).toMatch(/rectAreaAfterHash/)
    expect(transition).toMatch(/USER_CAMERA_SMOOTH_TIME = 0\.42/)

    expect(mount).toMatch(/author = demoEditActive\(\)/)
    expect(mount).toMatch(/import\('\.\/live'\)/)
    expect(mount).not.toMatch(/from '\.\/live'|from 'three'|@react-three|useHelper\s*\(/)
    const turnOn = mount.slice(mount.indexOf('async function setOn'))
    expect(turnOn.indexOf('if (!author')).toBeGreaterThan(-1)
    expect(turnOn.indexOf('if (!author')).toBeLessThan(turnOn.indexOf('loadLive()'))
    const boot = mount.slice(mount.indexOf('export function mountRectAreaLights'))
    expect(boot.indexOf('demoEditActive()')).toBeLessThan(boot.indexOf("addEventListener('keydown'"))
    expect(boot).not.toMatch(/import\('\.\/live'\)/)
    expect(live).toMatch(/from 'three\/examples\/jsm\/lights\/RectAreaLightUniformsLib\.js'/)
    expect(live).toMatch(/from 'three\/examples\/jsm\/helpers\/RectAreaLightHelper\.js'/)
    expect(live).toMatch(/RectAreaLightUniformsLib\.init\(\)/)
    expect(live).toMatch(/new RectAreaLight\(/)
    expect(live).toMatch(/new RectAreaLightHelper\(/)
    expect(live).toMatch(/light\.add\(helper\)/)
    expect(live).not.toMatch(/useHelper\s*\(|from '@react-three\/drei'|FogExp2|balancedFx|softShadows|groundTextures/)
    expect(plan).not.toMatch(/from 'three'|@react-three|FogExp2/)
    expect(leaves).toMatch(/three\/src\/lights\/RectAreaLight\.js/)
    expect(leaves.split('\n').filter((line) => line.startsWith('export')).join('\n')).not.toMatch(/UniformsLib|WebGLRenderer/)

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
      '../scene/groundTextures.ts',
      '../store/viewSlice.ts',
    ]
    for (const file of eager) {
      expect(read(file), file).not.toMatch(/author-lights|RectAreaLight|mountRectAreaLights|RectAreaLightUniformsLib/)
    }

    expect(pkg.dependencies.three).toBe('0.186.1')
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

describe('入口包里的 UniformsLib', () => {
  it('从命名空间认出渲染器正在读的那一份', () => {
    const index = `
      __proto__:null,Mesh:ps,BufferGeometry:Yt,Float32BufferAttribute:Nt,MeshBasicMaterial:Ca,BackSide:rr,DataTexture:zo,FloatType:fa,HalfFloatType:Cr,LinearFilter:li,NearestFilter:Vi,RGBAFormat:Ra,ClampToEdgeWrapping:sr,UniformsLib:vt,RectAreaLight:XL},Symbol.toStringTag
      n.rectAreaLTC1=vt.LTC_FLOAT_1
      export{ps as a1,Yt as aW,Nt as cw,Ca as be,rr as aN,zo as b2,fa as aF,Cr as b1,li as aH,Vi as aJ,Ra as b0,sr as cZ,vt as cA}
    `
    const found = discoverRectAreaShared(index)
    expect(found.uniformsLocal).toBe('vt')
    expect(found.exports.UniformsLib).toBe('cA')
    expect(found.exports.DataTexture).toBe('b2')
    expect(Object.keys(found.exports).sort()).toEqual([...RECT_AREA_SHARED_KEYS].sort())
  })
})
