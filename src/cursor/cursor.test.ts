import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { HOVER_CURSOR_SOURCE_BLOCK } from '../../scripts/hoverCursorPlugin'

const here = dirname(fileURLToPath(import.meta.url))

function read(path: string) {
  return readFileSync(join(here, path), 'utf8')
}

describe('T075 useCursor 边界', () => {
  it('用 drei 深路径，光标容器是画布，不进首屏文件', () => {
    const hover = read('./HoverCursor.tsx')
    const mount = read('./mount.ts')
    const dock = read('../viewmarks/dock.tsx')
    const vite = read('../../vite.config.ts')
    const pkg = JSON.parse(read('../../package.json')) as { dependencies: Record<string, string> }
    const drei = read('../../node_modules/@react-three/drei/web/useCursor.js')

    expect(pkg.dependencies['@react-three/drei']).toBe('10.7.9')
    expect(hover).toMatch(/from '@react-three\/drei\/web\/useCursor'/)
    expect(hover).not.toMatch(/from '@react-three\/drei'['"]/)
    expect(hover).toMatch(/useCursor\(hovered, CURSOR_OVER, CURSOR_OUT, gl\.domElement\)/)
    expect(hover).not.toMatch(/document\.body/)
    expect(hover).not.toMatch(/stopPropagation|useFrame|invalidate\(/)
    expect(hover).toMatch(/return null/)
    expect(hover).not.toMatch(/<mesh|<group|new Mesh|new BoxGeometry|PlaneGeometry/)
    expect(mount).toMatch(/mountHoverCursor/)
    expect(mount).not.toMatch(/useFrame|FogExp2|smoothTime|balancedFx/)
    expect(dock).toContain(HOVER_CURSOR_SOURCE_BLOCK)
    expect(vite).toMatch(/hoverCursorAfterHash/)
    expect(drei).toMatch(/function useCursor\(hovered, onPointerOver = 'pointer', onPointerOut = 'auto', container = document\.body\)/)

    const eager = [
      '../components/Scene.tsx',
      '../components/Stage.tsx',
      '../App.tsx',
      '../components/scene/DemandLoop.tsx',
      '../components/scene/postfx/balancedFx.tsx',
      '../components/scene/Tower.tsx',
      '../components/scene/floorPick.ts',
      '../scene/stage/DeskBoxSelect.tsx',
      '../demo-edit/DemoPointEditor.tsx',
      '../scene/stage/DeviceBadges.tsx',
      '../cameras-demo/CameraFovCones.tsx',
    ]
    for (const file of eager) {
      expect(read(file), file).not.toMatch(/useCursor|HoverCursor|mountHoverCursor|cursor\/mount|cursor\/policy/)
    }
  })
})
