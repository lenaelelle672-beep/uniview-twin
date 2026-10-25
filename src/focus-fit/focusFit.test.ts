import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { Object3D } from 'three'
import { USER_CAMERA_SMOOTH_TIME } from '../scene/stage/cameraTransition'
import { FOG_DENSITY } from '../scene/fog'
import { FOCUS_FIT_SOURCE_BLOCK } from '../../scripts/focusFitPlugin'
import { composeFocus, mountFocusFit } from './mount'
import {
  FIT_PADDING_M,
  FOCUS_NEVER_NAMES,
  acceptsFocusKey,
  deskFloorId,
  focusFitBlock,
  frameWithControls,
  holdViewpointFlag,
  layerCandidateNames,
  planFocusTarget,
  pumpUntilSettled,
  readOrbitPose,
} from './plan'
import { resolveFocusObject } from './subject'

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

describe('对焦目标', () => {
  it('选中工位优先，没有当前层就不包整塔', () => {
    expect(deskFloorId('F12-66')).toBe('F12')
    expect(deskFloorId('B1-8')).toBe('B1')
    expect(deskFloorId('nope')).toBeNull()

    expect(
      planFocusTarget({
        view: 'building',
        floorId: null,
        focusedDeskId: null,
        boxFloorId: null,
        boxDeskIds: [],
      }),
    ).toBeNull()

    expect(
      planFocusTarget({
        view: 'floor',
        floorId: 'F12',
        focusedDeskId: null,
        boxFloorId: null,
        boxDeskIds: [],
      }),
    ).toEqual({ kind: 'layer', floorId: 'F12', names: layerCandidateNames('F12') })

    expect(
      planFocusTarget({
        view: 'floor',
        floorId: 'F12',
        focusedDeskId: 'F12-66',
        boxFloorId: 'F12',
        boxDeskIds: ['F12-2', 'F12-9'],
      }),
    ).toEqual({ kind: 'selection', floorId: 'F12', deskIds: ['F12-2', 'F12-9'] })

    expect(
      planFocusTarget({
        view: 'floor',
        floorId: 'F3',
        focusedDeskId: 'F12-1',
        boxFloorId: 'F1',
        boxDeskIds: ['F1-1'],
      })?.kind,
    ).toBe('layer')

    expect(planFocusTarget({
      view: 'building',
      floorId: 'F3',
      focusedDeskId: 'F3-1',
      boxFloorId: null,
      boxDeskIds: [],
    })).toEqual({ kind: 'selection', floorId: 'F3', deskIds: ['F3-1'] })

    expect(focusFitBlock('floor', true)).toBe('tour')
    expect(focusFitBlock('blueprint', false)).toBe('blueprint')
    expect(focusFitBlock('floor', false)).toBe('')
  })

  it('当前层候选不含整塔，场景里有塔也只返回室内', () => {
    expect(layerCandidateNames('F12')).toEqual(['FloorInterior', 'FloorPlate', 'FloorShell-F12'])
    expect(layerCandidateNames('B1')).toEqual(['FloorInterior', 'FloorPlate', 'B1'])
    for (const name of FOCUS_NEVER_NAMES) {
      expect(layerCandidateNames('F1')).not.toContain(name)
    }
    const interior = new Object3D()
    interior.name = 'FloorInterior'
    const tower = new Object3D()
    tower.name = 'Tower'
    const scene = {
      getObjectByName: (name: string) => {
        if (name === 'FloorInterior') return interior
        if (name === 'Tower') return tower
        return undefined
      },
    }
    expect(
      resolveFocusObject(scene, { kind: 'layer', floorId: 'F4', names: layerCandidateNames('F4') }),
    ).toBe(interior)
    expect(
      resolveFocusObject({ getObjectByName: () => undefined }, { kind: 'layer', floorId: 'F4', names: layerCandidateNames('F4') }),
    ).toBeNull()
  })

  it('选中工位用场景公布的坐标，图纸缓存为空也不丢', () => {
    const interior = new Object3D()
    interior.name = 'FloorInterior'
    interior.position.set(0, 52.8, 0)
    interior.updateWorldMatrix(true, false)
    vi.stubGlobal('window', {
      __twinFloor: {
        floorId: 'F12',
        desks: [{ id: 'F12-66', x: 3, z: -4, rot: 0 }],
        columns: [],
        cores: [],
      },
    })
    const scene = {
      getObjectByName: (name: string) => (name === 'FloorInterior' ? interior : undefined),
    }
    const proxy = resolveFocusObject(scene, { kind: 'selection', floorId: 'F12', deskIds: ['F12-66', 'F12-1'] })
    expect(proxy?.name).toBe('FocusFitSelection')
    expect(proxy?.children).toHaveLength(1)
    expect(proxy?.children[0]?.position.x).toBeCloseTo(3)
    expect(proxy?.children[0]?.position.y).toBeCloseTo(52.8)
    expect(proxy?.children[0]?.position.z).toBeCloseTo(-4)
    vi.unstubAllGlobals()
  })
})

describe('快捷键', () => {
  it('C 走 Center，Shift+C 才是讲解', () => {
    expect(acceptsFocusKey({ key: 'c' }, 'center')).toBe(true)
    expect(acceptsFocusKey({ key: 'C' }, 'center')).toBe(true)
    expect(acceptsFocusKey({ key: 'C', shiftKey: true }, 'center')).toBe(false)
    expect(acceptsFocusKey({ key: 'C', shiftKey: true }, 'narration')).toBe(true)
    expect(acceptsFocusKey({ key: 'c', shiftKey: true }, 'narration')).toBe(true)
    expect(acceptsFocusKey({ key: 'c' }, 'narration')).toBe(false)
    expect(acceptsFocusKey({ key: 'g' }, 'center')).toBe(false)
    expect(acceptsFocusKey({ key: 'c', repeat: true }, 'center')).toBe(false)
    expect(acceptsFocusKey({ key: 'c', metaKey: true }, 'center')).toBe(false)
    expect(acceptsFocusKey({ key: 'c', ctrlKey: true }, 'center')).toBe(false)
    expect(acceptsFocusKey({ key: 'c', altKey: true }, 'center')).toBe(false)
    expect(acceptsFocusKey({ key: 'c', isComposing: true }, 'center')).toBe(false)
    expect(acceptsFocusKey({ key: 'c', target: { tagName: 'INPUT' } }, 'center')).toBe(false)
    expect(acceptsFocusKey({ key: 'c', target: { tagName: 'TEXTAREA' } }, 'center')).toBe(false)
    expect(acceptsFocusKey({ key: 'c', target: { tagName: 'SELECT' } }, 'center')).toBe(false)
    expect(acceptsFocusKey({ key: 'c', target: { tagName: 'DIV', isContentEditable: true } }, 'center')).toBe(false)
    expect(acceptsFocusKey({ key: 'c', target: { tagName: 'BUTTON' } }, 'center')).toBe(true)
  })
})

describe('镜头交还', () => {
  it('fitToBox 之后把方位转回去，泵帧在结束后再 invalidate', async () => {
    const calls: string[] = []
    const rig = {
      polarAngle: 0.7,
      azimuthAngle: 0.2,
      fitToBox: () => {
        calls.push('fit')
        return Promise.resolve('rest')
      },
      rotateTo: (azimuth: number, polar: number) => {
        calls.push(`rotate:${azimuth}:${polar}`)
        return Promise.resolve()
      },
    }
    const fit = frameWithControls(rig, { isBox3: true }, FIT_PADDING_M)
    expect(fit).not.toBeNull()
    expect(calls).toEqual(['fit', 'rotate:0.2:0.7'])
    expect(frameWithControls({}, {}, 1)).toBeNull()

    const position = { x: 1, y: 2, z: 3 }
    const target = { x: 4, y: 5, z: 6 }
    expect(
      readOrbitPose({
        getPosition: (out) => Object.assign(out, position),
        getTarget: (out) => Object.assign(out, target),
      }),
    ).toEqual({ px: 1, py: 2, pz: 3, tx: 4, ty: 5, tz: 6 })

    const marks: string[] = []
    let frame = 0
    const request = vi.fn((cb: FrameRequestCallback) => {
      frame += 1
      if (frame === 1) cb(0)
      return frame
    })
    vi.stubGlobal('requestAnimationFrame', request)
    vi.stubGlobal('cancelAnimationFrame', () => {})
    const done = Promise.resolve()
    pumpUntilSettled(done, () => marks.push('inv'), () => 0)
    await done
    await Promise.resolve()
    expect(marks.at(-1)).toBe('inv')
    expect(marks.length).toBeGreaterThan(0)
    vi.unstubAllGlobals()
  })

  it('视角旗标可重复放下', () => {
    vi.stubGlobal('window', { __vpH: false })
    const release = holdViewpointFlag()
    expect(window.__vpH).toBe(true)
    release()
    release()
    expect(window.__vpH).toBe(false)
    vi.unstubAllGlobals()
  })
})

describe('对焦分包', () => {
  it('没有文档时挂载直接返回', () => {
    expect(() => mountFocusFit()).not.toThrow()
    expect(composeFocus(null, null)).toBeNull()
    expect(composeFocus('measure', null)).toBe('measure')
    expect(composeFocus(null, 'fit')).toBe('fit')
    const both = composeFocus('measure', 'fit')
    expect(both).toMatchObject({ props: { children: ['measure', 'fit'] } })
  })

  it('懒挂在 dock 哈希之后，Center 优先，Bounds 只在讲解路径', () => {
    expect(USER_CAMERA_SMOOTH_TIME).toBe(0.42)
    expect(FOG_DENSITY.day).toBe(0.00112)
    expect(FOG_DENSITY.night).toBe(0.00096)

    const dock = read('../viewmarks/dock.tsx')
    const mount = read('./mount.ts')
    const center = read('./CenterFit.tsx')
    const bounds = read('./BoundsFit.tsx')
    const plan = read('./plan.ts')
    const subject = read('./subject.ts')
    const plugin = read('../../scripts/focusFitPlugin.ts')
    const vite = read('../../vite.config.ts')
    const rig = read('../components/scene/CameraRig.tsx')
    const scene = read('../components/Scene.tsx')
    const loop = read('../components/scene/DemandLoop.tsx')
    const fx = read('../components/scene/postfx/balancedFx.tsx')
    const fog = read('../scene/fog.ts')
    const transition = read('../scene/stage/cameraTransition.ts')
    const tour = read('../viewmarks/tourPose.ts')
    const fly = read('../minimap/fly.ts')
    const pkg = JSON.parse(read('../../package.json')) as { dependencies: Record<string, string> }

    expect(dock).toContain(FOCUS_FIT_SOURCE_BLOCK.trimEnd())
    expect(dock).toMatch(/import\('\.\.\/focus-fit\/mount'\)/)
    expect(dock).toMatch(/mountFocusFit\(\)/)
    expect(dock).not.toMatch(/from '\.\.\/focus-fit\/mount'/)
    expect(plugin).toContain(FOCUS_FIT_SOURCE_BLOCK)
    expect(plugin).toMatch(/apply: 'build'/)
    expect(plugin).toMatch(/assets\/FocusMount\.js/)
    expect(plugin).toMatch(/assets\/FocusCenter\.js/)
    expect(plugin).toMatch(/assets\/FocusBounds\.js/)
    expect(vite).toMatch(/focusFitAfterHash/)

    expect(mount).toMatch(/import\('\.\/CenterFit'\)/)
    expect(mount).toMatch(/import\('\.\/BoundsFit'\)/)
    expect(mount).not.toMatch(/import \{[^}]*Center/)
    expect(mount).not.toMatch(/from '@react-three|from 'three'/)
    expect(mount.indexOf('import(\'./BoundsFit\')')).toBeGreaterThan(mount.indexOf('import(\'./CenterFit\')'))
    expect(mount).toMatch(/shiftKey \? 'bounds' : 'center'/)
    expect(mount).not.toMatch(/flyToPlanPoint|floorTourPose|smoothTime/)

    expect(center).toMatch(/@react-three\/drei\/core\/Center/)
    expect(center).toMatch(/<Center/)
    expect(center).not.toMatch(/from '@react-three\/drei'['"]/)
    expect(center).not.toMatch(/Bounds|maxDuration|makeDefault|smoothTime/)
    expect(center).toMatch(/object=\{subject\}/)
    expect(center).toMatch(/\{null\}/)
    expect(center).toMatch(/fitToBox|frameWithControls/)
    expect(center).toMatch(/pumpUntilSettled/)

    expect(bounds).toMatch(/@react-three\/drei\/core\/Bounds/)
    expect(bounds).toMatch(/<Bounds/)
    expect(bounds).not.toMatch(/from '@react-three\/drei'['"]/)
    expect(bounds).not.toMatch(/<Bounds[^>]*\bfit=/)
    expect(bounds).not.toMatch(/<Bounds[^>]*\bobserve/)
    expect(bounds).not.toMatch(/<Bounds[^>]*\bclip=/)
    expect(bounds).toMatch(/api\.fit\(\)/)
    expect(bounds).toMatch(/controls: null/)
    expect(bounds).toMatch(/setLookAt\(/)
    expect(bounds).toMatch(/enabled = false/)
    expect(bounds).not.toMatch(/makeDefault|smoothTime|Center/)
    expect(bounds).not.toMatch(/Tower|Buildings/)

    expect(plan).not.toMatch(/@react-three|from 'three'|FogExp2|smoothTime/)
    expect(subject).toMatch(/FocusFitSelection/)
    expect(subject).not.toMatch(/name = 'Tower'|name = 'Buildings'/)
    expect(tour).not.toMatch(/focus-fit|Center|Bounds/)
    expect(fly).not.toMatch(/focus-fit|Center|Bounds/)
    expect(rig).toMatch(/makeDefault/)
    expect(rig).toMatch(/smoothTime=\{USER_CAMERA_SMOOTH_TIME\}/)
    expect(rig).not.toMatch(/focus-fit|core\/Center|core\/Bounds/)
    expect(transition).toMatch(/USER_CAMERA_SMOOTH_TIME = 0\.42/)
    expect(fog).toMatch(/day: 0\.00112/)
    expect(fog).toMatch(/night: 0\.00096/)

    const eager = [scene, loop, fx, fog, transition, tour, fly, rig]
    for (const source of eager) {
      expect(source).not.toMatch(/focus-fit|mountFocusFit|CenterFit|BoundsFit/)
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
