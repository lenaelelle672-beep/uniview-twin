import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { demoCameraAnchors, demoFloors } from '../cameras-demo/DEMO_cameras'
import { floorIdList } from '../data/floors'
import { USER_CAMERA_SMOOTH_TIME } from '../scene/stage/cameraTransition'
import {
  addAnchor,
  ALARM_ANCHOR_COUNT,
  ALARM_ANCHOR_Y,
  anchorMountY,
  anchorTableJson,
  anchorsOnFloor,
  commitAnchorDrag,
  getAnchorSession,
  normalizeHeading,
  resetAnchorSessionForTests,
  resolveSelectedId,
  roundHeading,
  roundMeters,
  setAnchorCatalog,
  setEditMode,
} from './anchors'
import {
  demoEditActive,
  demoEditRequested,
  installDemoEditHistoryPatch,
  navigationSearch,
  resetDemoEditRetainForTests,
  searchFromNavigationName,
  withDemoEdit,
  withDemoEditUrl,
} from './flag'

const here = dirname(fileURLToPath(import.meta.url))

function read(relative: string): string {
  return readFileSync(join(here, relative), 'utf8')
}

afterEach(() => {
  resetDemoEditRetainForTests()
  resetAnchorSessionForTests()
  vi.unstubAllGlobals()
})

describe('demoEdit 开关', () => {
  it('只认 demoEdit=1', () => {
    expect(demoEditRequested('?demoEdit=1')).toBe(true)
    expect(demoEditRequested('?q=balanced&demoEdit=1')).toBe(true)
    expect(demoEditRequested('demoEdit=1')).toBe(true)
    expect(demoEditRequested('?demoEdit=0')).toBe(false)
    expect(demoEditRequested('?demoEdit=10')).toBe(false)
    expect(demoEditRequested('?demo=1')).toBe(false)
    expect(demoEditRequested('')).toBe(false)
    expect(demoEditActive('?demoEdit=1')).toBe(true)
    expect(demoEditActive('?q=perf')).toBe(false)
  })

  it('从启动导航地址里认出开关，并写回后续 replaceState', () => {
    expect(searchFromNavigationName('http://127.0.0.1:5190/?floor=F12&demoEdit=1')).toBe('?floor=F12&demoEdit=1')
    expect(demoEditRequested(searchFromNavigationName('http://127.0.0.1:5190/?q=balanced'))).toBe(false)
    expect(withDemoEdit('?q=balanced', true)).toBe('?q=balanced&demoEdit=1')
    expect(withDemoEdit('?q=balanced&demoEdit=1', true)).toBe('?q=balanced&demoEdit=1')
    expect(withDemoEdit('?q=balanced', false)).toBe('?q=balanced')
    expect(withDemoEditUrl('/?view=floor&floor=F3#shot')).toBe('/?view=floor&floor=F3&demoEdit=1#shot')
    expect(withDemoEditUrl('/')).toBe('/?demoEdit=1')

    vi.stubGlobal('performance', {
      getEntriesByType: (type: string) =>
        type === 'navigation' ? [{ name: 'http://127.0.0.1:5190/?demoEdit=1' }] : [],
    })
    expect(navigationSearch()).toBe('?demoEdit=1')
    expect(demoEditActive('')).toBe(true)

    const state = { pathname: '/', search: '?q=balanced', hash: '' }
    vi.stubGlobal('location', {
      get pathname() {
        return state.pathname
      },
      get search() {
        return state.search
      },
      get hash() {
        return state.hash
      },
    })
    vi.stubGlobal('history', {
      state: null,
      replaceState: (_data: unknown, _unused: string, url?: string | URL | null) => {
        const next = typeof url === 'string' ? url : url instanceof URL ? url.toString() : ''
        const hashAt = next.indexOf('#')
        const hash = hashAt >= 0 ? next.slice(hashAt) : ''
        const before = hashAt >= 0 ? next.slice(0, hashAt) : next
        const queryAt = before.indexOf('?')
        state.pathname = queryAt >= 0 ? before.slice(0, queryAt) || '/' : before || '/'
        state.search = queryAt >= 0 ? before.slice(queryAt) : ''
        state.hash = hash
      },
    })
    installDemoEditHistoryPatch()
    expect(state.search).toBe('?q=balanced&demoEdit=1')
    history.replaceState(null, '', '/?view=floor&floor=F12')
    expect(state.search).toBe('?view=floor&floor=F12&demoEdit=1')
    expect(state.pathname).toBe('/')
  })
})

describe('锚点表', () => {
  it('导出 cameras-demo 与 alarms-demo，平移不改朝向', () => {
    const table = JSON.parse(anchorTableJson()) as {
      'cameras-demo': Array<{ id: string; floorId: string; x: number; z: number; heading: number }>
      'alarms-demo': Array<{ id: string; floorId: string; x: number; z: number; heading?: number }>
    }
    expect(Object.keys(table)).toEqual(['cameras-demo', 'alarms-demo'])
    const cameras = demoFloors().flatMap((floorId) => demoCameraAnchors(floorId))
    expect(table['cameras-demo']).toEqual(
      cameras.map((anchor) => ({
        id: anchor.id,
        floorId: anchor.floorId,
        x: anchor.x,
        z: anchor.z,
        heading: anchor.heading,
      })),
    )
    expect(table['alarms-demo']).toHaveLength(floorIdList().length * ALARM_ANCHOR_COUNT)
    for (const floorId of floorIdList()) {
      const alarms = table['alarms-demo'].filter((row) => row.floorId === floorId)
      expect(alarms).toHaveLength(ALARM_ANCHOR_COUNT)
      demoCameraAnchors(floorId)
        .slice(0, ALARM_ANCHOR_COUNT)
        .forEach((anchor, index) => {
          expect(alarms[index]).toEqual({
            id: `DEMO-${floorId}-ALM${index + 1}`,
            floorId,
            x: anchor.x,
            z: anchor.z,
          })
        })
    }
    expect(anchorMountY('cameras-demo')).toBeGreaterThan(ALARM_ANCHOR_Y)
    expect(anchorMountY('alarms-demo')).toBe(ALARM_ANCHOR_Y)

    const camera = anchorsOnFloor('F12', 'cameras-demo')[0]!
    const heading = camera.heading
    const x = camera.x
    commitAnchorDrag(camera.id, x + 1.234, camera.z - 0.004, 9, false)
    expect(camera.x).toBe(roundMeters(x + 1.234))
    expect(camera.heading).toBe(heading)
    commitAnchorDrag(camera.id, camera.x, camera.z, Math.PI / 2, true)
    expect(camera.heading).toBe(roundHeading(Math.PI / 2))

    const alarm = anchorsOnFloor('B1', 'alarms-demo')[0]!
    commitAnchorDrag(alarm.id, 3.456, -2.222, 1.2, true)
    expect(alarm.heading).toBeNull()
    expect(alarm.x).toBe(3.46)
    expect(alarm.z).toBe(-2.22)
    const edited = JSON.parse(anchorTableJson()) as { 'alarms-demo': Array<{ id: string; x: number }> }
    expect(edited['alarms-demo'].find((row) => row.id === alarm.id)?.x).toBe(3.46)
  })

  it('朝向折回一圈，告警目录没有旋转，加一点沿用本层', () => {
    expect(normalizeHeading(0)).toBe(0)
    expect(normalizeHeading(Math.PI)).toBeCloseTo(Math.PI)
    expect(normalizeHeading(-Math.PI)).toBeCloseTo(Math.PI)
    expect(normalizeHeading(-Math.PI / 2)).toBeCloseTo(-Math.PI / 2)
    expect(roundHeading(Math.PI * 3)).toBe(3.1416)
    expect(roundMeters(Number.NaN)).toBe(0)

    setEditMode('rotate')
    expect(getAnchorSession().mode).toBe('rotate')
    setAnchorCatalog('alarms-demo')
    expect(getAnchorSession().catalog).toBe('alarms-demo')
    expect(getAnchorSession().mode).toBe('translate')
    setEditMode('rotate')
    expect(getAnchorSession().mode).toBe('translate')
    expect(resolveSelectedId('F12', 'alarms-demo', 'DEMO-F12-CAM1')).toBe('DEMO-F12-ALM1')

    const before = anchorsOnFloor('F12', 'cameras-demo').length
    setAnchorCatalog('cameras-demo')
    const added = addAnchor('F12')
    expect(added?.id).toBe(`DEMO-F12-CAM${before + 1}`)
    expect(added?.heading).not.toBeNull()
    expect(anchorsOnFloor('F12', 'cameras-demo')).toHaveLength(before + 1)
    expect(getAnchorSession().selectedId).toBe(added?.id)
    expect(addAnchor('nope')).toBeNull()

    setAnchorCatalog('alarms-demo')
    const alarm = addAnchor('F8')
    expect(alarm?.heading).toBeNull()
    expect(alarm?.id.startsWith('DEMO-F8-ALM')).toBe(true)
  })
})

describe('摆点分包', () => {
  it('只在 demoEdit 进层后懒挂 TransformControls，默认路径和 T032 / 雾 / 后处理都不碰', () => {
    const loop = read('../components/scene/DemandLoop.tsx')
    const editor = read('./DemoPointEditor.tsx')
    const flag = read('./flag.ts')
    const anchors = read('./anchors.ts')
    const css = read('./demoEdit.css')
    const host = loop.slice(loop.indexOf('function DemoEditHost'))
    const rig = read('../components/scene/CameraRig.tsx')
    const transition = read('../scene/stage/cameraTransition.ts')
    const pkg = JSON.parse(read('../../package.json')) as {
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
    }

    expect(USER_CAMERA_SMOOTH_TIME).toBe(0.42)
    expect(transition).toMatch(/USER_CAMERA_SMOOTH_TIME = 0\.42/)
    expect(rig).toMatch(/makeDefault/)
    expect(rig).toMatch(/smoothTime=\{USER_CAMERA_SMOOTH_TIME\}/)
    expect(rig).not.toMatch(/demo-edit|TransformControls/)

    expect(loop).toMatch(/DEMO_EDIT_AFTER_FIRST_MS = 2600/)
    expect(loop).toMatch(/retainDemoEditParam\(\)/)
    expect(loop).toMatch(/import\('\.\.\/\.\.\/demo-edit\/DemoPointEditor'\)/)
    expect(loop).not.toMatch(/from ['"][^'"]*DemoPointEditor/)
    expect(loop).not.toMatch(/TransformControls/)
    expect(host.indexOf("view !== 'floor'")).toBeGreaterThan(-1)
    expect(host.indexOf('demoEditActive()')).toBeLessThan(host.indexOf("import('../../demo-edit/DemoPointEditor')"))
    expect(host.indexOf("view !== 'floor'")).toBeLessThan(host.indexOf("import('../../demo-edit/DemoPointEditor')"))

    expect(editor).toMatch(/from '@react-three\/drei\/core\/TransformControls'/)
    expect(editor).not.toMatch(/from '@react-three\/drei'['"]/)
    expect(editor).toMatch(/<TransformControls/)
    expect(editor).toMatch(/mode=\{session\.mode\}/)
    expect(editor).toMatch(/space=\{session\.mode === 'rotate' \? 'local' : 'world'\}/)
    expect(editor).toMatch(/showY=\{session\.mode === 'rotate'\}/)
    expect(editor).toMatch(/addEventListener\('pointerdown', claimHandle, true\)/)
    expect(editor).toMatch(/stopPropagation\(\)/)
    expect(editor).toMatch(/onPointerDown\(event\)/)
    expect(editor).toMatch(/downloadAnchorTable\(\)/)
    expect(editor).toMatch(/anchorTableJson\(\)/)
    expect(editor).toMatch(/data-demo-edit/)
    expect(editor).not.toMatch(/makeDefault|smoothTime|\.enabled|FogExp2|balancedFx|groundTextures|SoftShadows/)
    expect(editor).not.toMatch(/<Html[\s>]/)
    expect(flag).not.toMatch(/@react-three|TransformControls|smoothTime|FogExp2/)
    expect(anchors).toMatch(/cameras-demo/)
    expect(anchors).toMatch(/alarms-demo/)
    expect(anchors).not.toMatch(/from ['"][^'"]*DEMO_cameras['"]/)
    expect(anchors).not.toMatch(/\bfloorIdList\b/)
    expect(anchors).not.toMatch(/@react-three|TransformControls|smoothTime|FogExp2/)
    const leavesImport = read('./gizmoLeaves.ts').match(/import \{[^}]+\} from 'three'/)?.[0] ?? ''
    expect(leavesImport).not.toMatch(/\b(Euler|LineBasicMaterial|OctahedronGeometry|TorusGeometry|SphereGeometry)\b/)
    expect(editor).toMatch(/from '\.\/gizmoLeaves'/)
    expect(editor).not.toMatch(/SphereGeometry[^;\n]*from 'three'/)
    const viteConfig = read('../../vite.config.ts')
    expect(viteConfig).toMatch(/three-stdlib\/controls\/TransformControls\.js/)
    expect(viteConfig).toMatch(/gizmoLeaves/)
    expect(viteConfig).toMatch(/chunk\.name === 'DemandLoop'/)
    expect(viteConfig).toMatch(/return 'assets\/d-\[hash:7\]\.js'/)
    expect(viteConfig).toMatch(/return 'assets\/\[name\]-\[hash:7\]\.js'/)
    expect(css).toMatch(/\.demo-edit/)
    expect(read('../index.css')).not.toMatch(/demo-edit/)

    const untouched = [
      '../components/Scene.tsx',
      '../components/Stage.tsx',
      '../App.tsx',
      '../main.tsx',
      '../url/useUrlSync.ts',
      '../scene/stage/prefetchLazyChunks.ts',
      '../scene/fog.ts',
      '../scene/groundTextures.ts',
      '../scene/softShadows.ts',
      '../components/scene/postfx/balancedFx.tsx',
      '../components/scene/BalancedSoftShadows.tsx',
      '../cameras-demo/CameraFovCones.tsx',
      '../cameras-demo/lazyCameraFov.tsx',
      '../cameras-demo/DEMO_cameras.ts',
      '../alarms-demo/AlarmTimeline.tsx',
      '../alarms-demo/DEMO_alarmTimeline.ts',
      '../components/AlarmTimelineGate.tsx',
      '../floors/JsonFloorInterior.tsx',
      '../scene/stage/B1Interior.tsx',
    ]
    for (const file of untouched) {
      expect(read(file), file).not.toMatch(/demo-edit|TransformControls/)
    }

    expect(pkg.dependencies['@react-three/drei']).toBe('10.7.9')
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
    expect(Object.keys(pkg.devDependencies).sort()).toEqual(
      [
        '@types/node',
        '@types/react',
        '@types/react-dom',
        '@types/three',
        '@vitejs/plugin-react',
        'patch-package',
        'puppeteer-core',
        'typescript',
        'vite',
        'vitest',
      ].sort(),
    )
  })
})
